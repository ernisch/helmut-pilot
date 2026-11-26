-- OPERATOR, keine Migration und kein automatischer Retry. Genau ein separat
-- freigegebener historischer Metadatenfehler mit aktueller amtlicher Pflichtbindung.
-- Vorschau: modus=vorschau, job_id=UUID, abruf_id=UUID.
-- Die private Ausgabe nativ mit der gleichnamigen JS-Datei pruefen.
-- Freigeben: zusaetzlich tag=UTC-Tag, bindung=private JS-Ausgabe (JSON).
-- Rueckweg: bindung=unveraenderte private Freigabequittung, vor Workeruebernahme.
-- Keine Provideraufrufe, Kosten-/Originalaenderungen oder Freigabe eines Laufs.
-- klasse=metadaten-pflicht (Standard) oder separat geprueft slotrest-20261126.
-- cas-pflichtneuversuch-20261126: separat genehmigter einzelner BT-Neuversuch;
-- native CAS-Entscheidung, historische Aufruf-/Geldzaehler bleiben erhalten.
-- 'erneut' gilt vorgangsweit: konkurrierende Wiederaufnahme vorher ausschliessen.
-- Mehrere Textabschnitte koennen regulaere weitere gegatete Modellstarts brauchen.
\set ON_ERROR_STOP on
\if :{?modus}
\else
  \set modus vorschau
\endif
\if :{?klasse}
\else
  \set klasse metadaten-pflicht
\endif
\if :{?job_id}
\else
  \set job_id ''
\endif
\if :{?abruf_id}
\else
  \set abruf_id ''
\endif
\if :{?tag}
\else
  \set tag ''
\endif
\if :{?bindung}
\else
  \set bindung '{}'
\endif
\if :{?cas_ids}
\else
  \set cas_ids '[]'
\endif

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create temporary table helmut_pflichtparameter on commit drop as
select :'modus'::text modus, :'job_id'::uuid job_id, :'abruf_id'::uuid abruf_id,
  :'tag'::text tag, :'bindung'::jsonb bindung, :'cas_ids'::jsonb cas_ids, :'klasse'::text klasse;
create temporary table helmut_pflichtquittung (ausgabe jsonb) on commit drop;

-- Production hat das alte Zuordnungsschema ohne run_id. Das ist sichtbar
-- unbekannte Laufzuordnung, niemals ein leerer Beweis fuer Kostenfreiheit.
create function pg_temp.helmut_pflichtnutzung(p_job uuid,p_cas jsonb)
returns jsonb language plpgsql stable as $usage$
declare v_spalten jsonb; v_hat_lauf boolean; v_filter text; v_zeilen jsonb;
begin
  select jsonb_agg(attname order by attname),bool_or(attname='run_id') into v_spalten,v_hat_lauf
    from pg_catalog.pg_attribute where attrelid='public.llm_usage'::regclass and attnum>0 and not attisdropped;
  if not(v_spalten ?& array['id','created_at','vorgang_id','knowledge_object_id'])
  then raise exception 'pflichtanalyse: ungeklaertes Nutzungsschema'; end if;
  v_filter := 'u.vorgang_id in(select jsonb_array_elements_text($2)) or u.knowledge_object_id in('
    ||'select knowledge_object_id from public.ko_document_links where raw_document_id=('
    ||'select payload->''dokumentIds''->>0 from public.helmut_jobs where id=$1))';
  if v_hat_lauf then v_filter := 'u.run_id::text=$1::text or ('||v_filter||')'; end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(u) order by u.id),''[]''::jsonb) from public.llm_usage u where '||v_filter
    into v_zeilen using p_job,p_cas;
  return jsonb_build_object('modus',case when v_hat_lauf then 'lauf-und-objektbezug' else 'legacy-objektbezug' end,
    'spalten',v_spalten,'zeilen',v_zeilen);
end;
$usage$;

create function pg_temp.helmut_pflichtvormerkung(p_cas jsonb)
returns jsonb language plpgsql stable as $marker$
declare v_zeilen jsonb;
begin
  if to_regclass('public.helmut_verstehen_vormerkungen') is null then return null; end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(v) order by v.vorgang_id),''[]''::jsonb)
    from public.helmut_verstehen_vormerkungen v where v.vorgang_id in(select jsonb_array_elements_text($1))'
    into v_zeilen using p_cas;
  return v_zeilen;
end;
$marker$;

-- Vollstaendige, private Vor-/Nachwerte; auch die CAS-Abwesenheit fuer eine
-- nativ abgeleitete, noch nicht verknuepfte Vorgangskennung ist damit pruefbar.
create function pg_temp.helmut_pflichtstand(p_job uuid, p_abruf uuid, p_tag text,p_cas jsonb,p_klasse text)
returns jsonb language sql stable as $snapshot$
  select jsonb_build_object(
    'job', (select to_jsonb(j) from public.helmut_jobs j where j.id=p_job),
    'abruf', (select to_jsonb(j) from public.helmut_jobs j where j.id=p_abruf),
    'plan', (select jsonb_build_object('id',id,'data',data) from public.helmut_store where id='main-quellenplan-'||p_tag),
    'beleg', (select jsonb_build_object('id',id,'data',data) from public.helmut_store where id='main-quellenfaelligkeit-'||p_abruf),
    'aktuell', (select to_jsonb(r) from public.raw_documents r where r.id=(select payload->'dokumentIds'->>0 from public.helmut_jobs where id=p_job)),
    'archive', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'data',s.data) order by s.id),'[]'::jsonb)
      from public.helmut_store s where s.id like 'main-rohstand-'||(select substr(payload->'dokumentIds'->>0,4) from public.helmut_jobs where id=p_job)||'-%'),
    'links', (select coalesce(jsonb_agg(to_jsonb(l) order by l.knowledge_object_id),'[]'::jsonb)
      from public.ko_document_links l where l.raw_document_id=(select payload->'dokumentIds'->>0 from public.helmut_jobs where id=p_job)),
    'kos', (select coalesce(jsonb_agg(to_jsonb(k) order by k.id),'[]'::jsonb) from public.knowledge_objects k
      where k.id in (select knowledge_object_id from public.ko_document_links where raw_document_id=(select payload->'dokumentIds'->>0 from public.helmut_jobs where id=p_job))),
    'casOperator',case when p_klasse='cas-pflichtneuversuch-20261126' then (select jsonb_build_object('definitionHash',encode(sha256(convert_to(pg_get_functiondef(f.oid),'UTF8')),'hex'),
      'securityDefiner',f.prosecdef,'konfiguration',to_jsonb(f.proconfig),'eigentuemer',pg_get_userbyid(f.proowner),
      'acl',f.proacl::text,'rollen',(select jsonb_agg(jsonb_build_object('rolle',r.rolname,
        'execute',has_function_privilege(r.oid,f.oid,'EXECUTE')) order by r.rolname)
        from pg_roles r where r.rolname in('anon','authenticated','service_role','postgres')))
      from pg_proc f where f.oid=to_regprocedure('public.helmut_verstehen_ausgang_aufloesen(text,text)')) else null end,
    'casIds',p_cas,
    'casVormerkungen',case when p_klasse='cas-pflichtneuversuch-20261126' then pg_temp.helmut_pflichtvormerkung(p_cas) else null end,
    'koBestandsdokumente',case when p_klasse='cas-pflichtneuversuch-20261126' then
      (select coalesce(jsonb_agg(jsonb_build_object('link',to_jsonb(l),'roh',to_jsonb(r)) order by l.raw_document_id),'[]'::jsonb)
       from public.ko_document_links l left join public.raw_documents r on r.id=l.raw_document_id
       where l.knowledge_object_id in(select knowledge_object_id from public.ko_document_links
         where raw_document_id=(select payload->'dokumentIds'->>0 from public.helmut_jobs where id=p_job))) else null end,
    'cas', (select coalesce(jsonb_agg(to_jsonb(c) order by c.vorgang_id),'[]'::jsonb) from public.helmut_verstehen_reservierungen c
      where c.vorgang_id in (select jsonb_array_elements_text(p_cas))),
    'jobBuchungen', (select coalesce(jsonb_agg(c.value order by c.key),'[]'::jsonb)
      from public.helmut_store a cross join lateral jsonb_each(coalesce(a.data->'betriebskostenBudget'->'calls','{}'::jsonb)) c
      where a.id='main-auth' and c.value->>'runId'=p_job::text),
    'jobNutzung',pg_temp.helmut_pflichtnutzung(p_job,p_cas),
    'blobJobNutzung', (select coalesce(jsonb_agg(c.value order by c.value->>'id'),'[]'::jsonb)
      from public.helmut_store a cross join lateral jsonb_array_elements(coalesce(a.data->'llmUsage','[]'::jsonb)) c
      where a.id='main-auth' and c.value->>'runId'=p_job::text),
    'kostenBuch',(select data->'betriebskostenBudget' from public.helmut_store where id='main-auth'),
    'fundstellen', (select coalesce(jsonb_agg(to_jsonb(f) order by f.original_url),'[]'::jsonb)
      from public.document_findings f where f.raw_document_id=(select payload->'dokumentIds'->>0 from public.helmut_jobs where id=p_job)
      and f.source_id=(select payload->'quelle'->>'id' from public.helmut_jobs where id=p_abruf)
      and f.retrieval_path_id=(select payload->'quelle'->>'retrievalPathId' from public.helmut_jobs where id=p_abruf)),
    'kostenDigest', (select encode(sha256(convert_to(coalesce(data->'betriebskostenBudget','null'::jsonb)::text,'UTF8')),'hex') from public.helmut_store where id='main-auth'));
$snapshot$;

do $operation$
declare
  p record; v_tag text := current_date::text; v_vor jsonb; v_nach jsonb;
  v_inhalt text; v_digest text; v_nach_digest text; v_job jsonb; b jsonb;
  v_jetzt timestamptz := clock_timestamp(); v_anzahl integer; v_cas jsonb; v_cas_vor jsonb;
  v_cas_neu boolean; v_ausgang text; v_substanz_vor jsonb; v_substanz_nach jsonb;
begin
  select * into strict p from helmut_pflichtparameter;
  v_cas_neu := p.klasse='cas-pflichtneuversuch-20261126';
  if p.modus not in ('vorschau','freigeben','rueckweg') or p.job_id=p.abruf_id
    or p.klasse not in ('metadaten-pflicht','slotrest-20261126','cas-pflichtneuversuch-20261126')
    or (p.modus<>'vorschau' and p.tag<>v_tag)
  then raise exception 'pflichtanalyse: ungueltige oder abgelaufene Einzelbindung'; end if;
  v_cas := case when p.modus='vorschau' then p.cas_ids else p.bindung->'casIds' end;
  if jsonb_typeof(v_cas) is distinct from 'array' or jsonb_array_length(v_cas)>8
    or exists(select 1 from jsonb_array_elements(v_cas) c(id) where jsonb_typeof(id)<>'string'
      or length(id#>>'{}') not between 4 and 183 or id#>>'{}' !~ '^vg-'
      or id#>>'{}' ~ '[[:space:][:cntrl:]]')
  then raise exception 'pflichtanalyse: ungueltige begrenzte CAS-Kennungen'; end if;
  if p.modus<>'vorschau' then
    -- Kurzes, arbeitsfreies Operatorfenster; keine parallele Queue-/Original-/CAS-Aenderung.
    lock table public.helmut_jobs in share row exclusive mode;
    lock table public.helmut_store,public.raw_documents,public.ko_document_links,
      public.knowledge_objects,public.helmut_verstehen_reservierungen,public.llm_usage,public.document_findings in share mode;
    if v_cas_neu then lock table public.helmut_verstehen_vormerkungen in share mode; end if;
    if exists(select 1 from public.helmut_jobs where status='laeuft')
    then raise exception 'pflichtanalyse: laufende Workerarbeit'; end if;
  end if;
  v_vor := pg_temp.helmut_pflichtstand(p.job_id,p.abruf_id,v_tag,v_cas,p.klasse);
  v_inhalt := v_vor::text;
  v_digest := encode(sha256(convert_to(v_inhalt,'UTF8')),'hex');
  v_job := v_vor->'job'; b := p.bindung;
  if v_job is null or v_job='null'::jsonb or v_vor->'abruf'='null'::jsonb
  then raise exception 'pflichtanalyse: Einzelauftrag oder Abruf fehlt'; end if;

  if p.modus='vorschau' then
    insert into helmut_pflichtquittung values(jsonb_build_object('version',1,'modus','vorschau',
      'tag',v_tag,'klasse',p.klasse,'jobId',p.job_id,'abrufId',p.abruf_id,'gelesenAm',v_jetzt,'inhalt',v_inhalt,'digest',v_digest));
    return;
  end if;
  if b->'version' is distinct from '1'::jsonb or b->>'tag' is distinct from v_tag
    or b->>'klasse' is distinct from p.klasse
    or b->>'jobId' is distinct from p.job_id::text or b->>'abrufId' is distinct from p.abruf_id::text
    or b->>'geprueftAm' is null or (b->>'geprueftAm')::timestamptz>v_jetzt
    or (b->>'geprueftAm')::timestamptz<v_jetzt-interval '15 minutes'
  then raise exception 'pflichtanalyse: native frische Freigabebindung fehlt'; end if;

  if p.modus='freigeben' then
    if b->>'modus' is distinct from 'freigeben' or b->'vor' is distinct from v_vor
      or b->>'digest' is distinct from v_digest
      or v_job->>'status' is distinct from 'fehlgeschlagen'
      or v_job->>'job_type' is distinct from 'document_understanding'
      or v_job->'tenant_id' is distinct from 'null'::jsonb
      or v_job->>'finished_at' is null
      or v_job->>'lease_owner' is not null or v_job->>'lease_expires_at' is not null
      or (v_job->>'attempts')::int<>(v_job->>'max_attempts')::int
      or (v_job->>'max_attempts')::int not between 1 and 49
    then raise exception 'pflichtanalyse: historischer Vorwert oder native Bindung abweichend'; end if;
    if p.klasse='metadaten-pflicht' then
      if v_job->>'last_error' is distinct from 'quellenstand-metadatenabweichung'
        or (v_job->>'finished_at')::timestamptz>=v_tag::date::timestamptz
      then raise exception 'pflichtanalyse: kein historischer Metadaten-Pflichtfall'; end if;
    elsif v_cas_neu then
      v_cas_vor := v_vor->'cas'->0;
      if coalesce(v_job->>'last_error','') !~ '^verstehen-uebersprungen-dauerhaft: artikelkontext-zeitbudget seit [0-9]+ h$'
        or (v_job->>'finished_at')::timestamptz>=v_tag::date::timestamptz
        or v_job->'attempts' is distinct from '3'::jsonb or v_job->'max_attempts' is distinct from '3'::jsonb
        or v_job->'wiedervorlagen' is distinct from '2'::jsonb
        or v_job->'payload' ? 'quellenRestDokumentIds'
        or v_vor->'abruf'->'payload'->'quelle'->>'id' is distinct from 'bundestag'
        or jsonb_array_length(v_cas)<>1 or jsonb_array_length(v_vor->'cas')<>1
        or v_cas_vor->>'vorgang_id' is distinct from b->'casNeuversuch'->>'vorgangId'
        or b->'casNeuversuch'->>'entscheidung' is distinct from 'erneut'
        or b->'casNeuversuch'->'quellenRestDokumentIds' is distinct from v_job->'payload'->'dokumentIds'
        or v_cas_vor->>'zustand' is distinct from 'unbekannt'
        or v_cas_vor->>'besitzer' is not null or v_cas_vor->>'lease_bis' is not null
        or v_cas_vor->'fencing' is distinct from '2'::jsonb or v_cas_vor->'ki_aufrufe' is distinct from '2'::jsonb
        or v_cas_vor->'versuche' is distinct from '2'::jsonb or v_cas_vor->'ergebnis_fencing' is distinct from '1'::jsonb
        or jsonb_array_length(v_vor->'casVormerkungen') is distinct from 1
        or v_vor->'casVormerkungen'->0->>'vorgang_id' is distinct from v_cas_vor->>'vorgang_id'
        or v_vor->'casVormerkungen'->0->'fehlversuche' is distinct from '1'::jsonb
        or v_vor->'casVormerkungen'->0->'letzte_fencing' is distinct from '2'::jsonb
        or v_vor->'casOperator'->>'definitionHash' is distinct from '5e666151d7046e87fdd0f319df7fca4e6c2414a6f7d5ff7bcc62d6c592eb2bd5'
        or v_vor->'casOperator'->'securityDefiner' is distinct from 'false'::jsonb
        or v_vor->'casOperator'->>'acl' is distinct from '{postgres=X/postgres,service_role=X/postgres}'
        or v_vor->'jobBuchungen'<>'[]'::jsonb or v_vor->'jobNutzung'->'zeilen'<>'[]'::jsonb
        or v_vor->'blobJobNutzung'<>'[]'::jsonb
        or exists(select 1 from public.knowledge_objects k where k.vorgang_id=v_cas_vor->>'vorgang_id'
          and coalesce(k.verstehen_fencing,-1)>=2)
      then raise exception 'pflichtanalyse: kein gebundener einzelner BT-CAS-Neuversuch'; end if;
      v_ausgang := public.helmut_verstehen_ausgang_aufloesen(v_cas_vor->>'vorgang_id','erneut');
      if v_ausgang is distinct from 'erneut-freigegeben'
      then raise exception 'pflichtanalyse: native Neuversuchsentscheidung unbestaetigt'; end if;
    else
      if v_job->>'last_error' !~ '^verstehen-uebersprungen-dauerhaft: verstehen-fortsetzung seit [0-9]+ h$'
        or (v_job->>'finished_at')::timestamptz<'2026-11-26T07:03:58Z'::timestamptz
        or (v_job->>'finished_at')::timestamptz>='2026-11-26T07:04:13Z'::timestamptz
        or v_job->'attempts' is distinct from '3'::jsonb or v_job->'max_attempts' is distinct from '3'::jsonb
        or v_job->'wiedervorlagen' is distinct from '1'::jsonb
        or v_vor->'jobBuchungen'<>'[]'::jsonb or v_vor->'jobNutzung'->'zeilen'<>'[]'::jsonb
        or v_vor->'blobJobNutzung'<>'[]'::jsonb
        or v_vor->'cas'<>'[]'::jsonb
      then raise exception 'pflichtanalyse: kein belegter einzelner Slotrest des 26Nov-Vorfalls'; end if;
    end if;
    update public.helmut_jobs set status='wartend',finished_at=null,
      max_attempts=max_attempts+1,
      payload=case when v_cas_neu then payload||jsonb_build_object('quellenRestDokumentIds',payload->'dokumentIds') else payload end,
      quellen_prioritaet_tag=case when p.klasse='metadaten-pflicht' or v_cas_neu then v_tag::date else quellen_prioritaet_tag end,
      updated_at=clock_timestamp()
      where id=p.job_id;
  else
    if b->>'modus' is distinct from 'freigegeben' or b->'nach' is distinct from v_vor
      or b->>'vorDigest' is distinct from encode(sha256(convert_to((b->'vor')::text,'UTF8')),'hex')
      or b->>'nachDigest' is distinct from v_digest or b->'vor'->'job'->>'status' is distinct from 'fehlgeschlagen'
      or v_job->>'status' is distinct from 'wartend' or v_job->>'lease_owner' is not null
      or v_job->>'lease_expires_at' is not null
      or (v_job->>'max_attempts')::int<>(b->'vor'->'job'->>'max_attempts')::int+1
      or v_job->'attempts' is distinct from b->'vor'->'job'->'attempts'
      or (v_vor-array['job','cas']) is distinct from ((b->'vor')-array['job','cas'])
      or (not v_cas_neu and v_vor->'cas' is distinct from b->'vor'->'cas')
      or (v_job-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at','payload'])
        is distinct from ((b->'vor'->'job')-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at','payload'])
      or v_job->'payload' is distinct from (case when v_cas_neu then b->'vor'->'job'->'payload'
        ||jsonb_build_object('quellenRestDokumentIds',b->'vor'->'job'->'payload'->'dokumentIds') else b->'vor'->'job'->'payload' end)
    then raise exception 'pflichtanalyse: Rueckweg nach Drift oder Workeruebernahme gesperrt'; end if;
    if v_cas_neu then
      v_cas_vor := b->'vor'->'cas'->0;
      if jsonb_array_length(v_vor->'cas')<>1
        or v_vor->'cas'->0->>'zustand' is distinct from 'offen'
        or v_vor->'cas'->0->>'letzter_grund' is distinct from 'erneut-freigegeben'
        or ((v_vor->'cas'->0)-array['zustand','letzter_grund','updated_at'])
          is distinct from (v_cas_vor-array['zustand','letzter_grund','updated_at'])
      then raise exception 'pflichtanalyse: CAS-Rueckweg nach Uebernahme gesperrt'; end if;
      update public.helmut_verstehen_reservierungen set zustand=v_cas_vor->>'zustand',
        letzter_grund=v_cas_vor->>'letzter_grund',updated_at=(v_cas_vor->>'updated_at')::timestamptz
        where vorgang_id=v_cas_vor->>'vorgang_id';
    end if;
    update public.helmut_jobs set status='fehlgeschlagen',
      finished_at=(b->'vor'->'job'->>'finished_at')::timestamptz,
      max_attempts=(b->'vor'->'job'->>'max_attempts')::int,
      payload=b->'vor'->'job'->'payload',
      quellen_prioritaet_tag=(b->'vor'->'job'->>'quellen_prioritaet_tag')::date,
      updated_at=clock_timestamp() where id=p.job_id;
  end if;
  get diagnostics v_anzahl = row_count;
  if v_anzahl<>1 then raise exception 'pflichtanalyse: Einzelupdate unbestaetigt'; end if;
  v_nach := pg_temp.helmut_pflichtstand(p.job_id,p.abruf_id,v_tag,v_cas,p.klasse);
  v_substanz_vor := v_vor-array['job','cas']; v_substanz_nach := v_nach-array['job','cas'];
  if v_substanz_vor is distinct from v_substanz_nach
    or (not v_cas_neu and v_vor->'cas' is distinct from v_nach->'cas')
    or (v_cas_neu and ((v_vor->'cas'->0)-array['zustand','letzter_grund','updated_at'])
      is distinct from ((v_nach->'cas'->0)-array['zustand','letzter_grund','updated_at']))
    or ((v_vor->'job')-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at','payload'])
      is distinct from ((v_nach->'job')-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at','payload'])
    or (not v_cas_neu and v_vor->'job'->'payload' is distinct from v_nach->'job'->'payload')
  then raise exception 'pflichtanalyse: geschuetzte Substanz veraendert'; end if;
  v_nach_digest := encode(sha256(convert_to(v_nach::text,'UTF8')),'hex');
  insert into helmut_pflichtquittung values(jsonb_build_object('version',1,
    'modus',case p.modus when 'freigeben' then 'freigegeben' else 'zurueckgenommen' end,
    'tag',v_tag,'klasse',p.klasse,'jobId',p.job_id,'abrufId',p.abruf_id,'geprueftAm',b->>'geprueftAm','casIds',v_cas,
    'vor',v_vor,'nach',v_nach,'vorDigest',v_digest,'nachDigest',v_nach_digest));
end;
$operation$;
select ausgabe from helmut_pflichtquittung;
commit;
