-- OPERATOR, keine Migration. Ohne neues konkretes Betreiber-GO NICHT aktivieren.
-- Genau EU-UNKNOWN f346 am28Nov; kein Workerstart, kein Anbieteraufruf.
-- Vorschau: modus=vorschau, abruf_id=<28Nov-Pflichtabruf>.
-- JS-Pruefer erzeugt nur eine Bindung. Aktivierung separat: modus=freigeben,
-- bindung=<JS-Ausgabe>, go=EU-EINZELNEUVERSUCH-20261128. Der String ersetzt kein GO.
-- Rueckweg: modus=rueckweg, bindung=<unveraenderte Aktivierungsquittung>.
-- Beide Einmalquittungen bleiben in vorhandenen helmut_store-Zeilen erhalten.
-- 'erneut' ist eine vorgangsweite Entscheidung, keine Zusage genau eines
-- HTTP-Aufrufs: regulaere notwendige Abschnittsfortsetzungen bleiben durch
-- die unveraenderten Sender-/CAS-/Geld-/Aufruf-/Originalgrenzen geschuetzt.
-- BReg-Rohkorrektur: STOP (zwei unversionierte Altlinks); hier kein Schreibpfad.
\set ON_ERROR_STOP on
\if :{?modus}
\else
  \set modus vorschau
\endif
\if :{?abruf_id}
\else
  \set abruf_id ''
\endif
\if :{?bindung}
\else
  \set bindung '{}'
\endif
\if :{?go}
\else
  \set go ''
\endif
begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout='3s';
set local statement_timeout='15s';
create temporary table restparameter on commit drop as
 select :'modus'::text modus, :'abruf_id'::uuid abruf_id, :'bindung'::jsonb bindung, :'go'::text freigabe;
create temporary table restquittung(ausgabe jsonb) on commit drop;
create function pg_temp.restfordere(ok boolean,grund text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'restpflicht: %',grund; end if; end $$;
-- Dieselbe kanonische JSON-Projektion wie Plan-/Quellenbelege, keine neue Hashregel.
create function pg_temp.restjson(j jsonb) returns text language plpgsql immutable as $$
declare r text;
begin
 case jsonb_typeof(j)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||pg_temp.restjson(value),',' order by key collate "C"),'')||'}' into r from jsonb_each(j);
 when 'array' then select '['||coalesce(string_agg(pg_temp.restjson(value),',' order by n),'')||']' into r from jsonb_array_elements(j) with ordinality x(value,n);
 else r:=coalesce(j::text,'null'); end case; return r;
end $$;
create function pg_temp.resthash(j jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to(pg_temp.restjson(j),'UTF8')),'hex') $$;
-- Betriebskosten-Vertrag hat historisch eine feste Feldreihenfolge (kein JSONB::text).
create function pg_temp.restvertrag(c jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to('{"version":'||(c->'version')::text||',"profileId":'||(c->'profileId')::text
 ||',"startsAt":'||(c->'startsAt')::text||',"dailyLimitUsd":'||(c->'dailyLimitUsd')::text
 ||',"totalLimitUsd":'||(c->'totalLimitUsd')::text||',"route":{"provider":'||(c->'route'->'provider')::text
 ||',"responsesUrl":'||(c->'route'->'responsesUrl')::text||',"model":'||(c->'route'->'model')::text||'}}','UTF8')),'hex') $$;
create function pg_temp.reststand(d jsonb) returns text language sql immutable as $$
 select pg_temp.resthash(jsonb_build_array(d->'id',d->'url',d->'canonical_url',d->'title',d->'summary',
 to_char((d->>'published_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),d->'source_name',d->'raw')) $$;
create function pg_temp.restnutzung() returns jsonb language plpgsql stable as $$
declare spalten jsonb; zeilen jsonb; filter text;
begin
 select jsonb_agg(attname order by attname) into spalten from pg_attribute
 where attrelid='public.llm_usage'::regclass and attnum>0 and not attisdropped;
 perform pg_temp.restfordere(spalten ?& array['id','created_at','vorgang_id','knowledge_object_id'],'Nutzungsschema');
 filter:='vorgang_id=''vg-dieswöchigen-20261126-03af76'' or knowledge_object_id in(select id from public.knowledge_objects where vorgang_id=''vg-dieswöchigen-20261126-03af76'')';
 if spalten ? 'run_id' then filter:=filter||' or run_id::text=''f346fe50-dadb-4139-b68a-b78fd88cf4ea'''; end if;
 execute 'select coalesce(jsonb_agg(to_jsonb(u) order by id),''[]''::jsonb) from public.llm_usage u where '||filter into zeilen;
 return jsonb_build_object('spalten',spalten,'zeilen',zeilen);
end $$;
create function pg_temp.restsnapshot(a uuid,tag text,jetzt timestamptz) returns jsonb language sql stable as $$
 select jsonb_build_object(
 'job',(select to_jsonb(j) from public.helmut_jobs j where id='f346fe50-dadb-4139-b68a-b78fd88cf4ea'),
 'rawJobs',(select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from public.helmut_jobs j where job_type='document_understanding' and payload->'dokumentIds' ? 'rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'),
 'abruf',(select to_jsonb(j) from public.helmut_jobs j where id=a),
 'plan',(select jsonb_build_object('id',id,'data',data) from public.helmut_store where id='main-quellenplan-'||tag),
 'beleg',(select jsonb_build_object('id',id,'data',data) from public.helmut_store where id='main-quellenfaelligkeit-'||a),
 'aktuell',(select to_jsonb(r) from public.raw_documents r where id='rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'),
 'archive',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data) order by id),'[]'::jsonb) from public.helmut_store where id like 'main-rohstand-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7-%'),
 'links',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id),'[]'::jsonb) from public.ko_document_links l where raw_document_id='rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'),
 'kos',(select coalesce(jsonb_agg(to_jsonb(k) order by id),'[]'::jsonb) from public.knowledge_objects k where vorgang_id='vg-dieswöchigen-20261126-03af76' or id in(select knowledge_object_id from public.ko_document_links where raw_document_id='rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7')),
 'cas',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.helmut_verstehen_reservierungen c where vorgang_id='vg-dieswöchigen-20261126-03af76'),
 'vormerkungen',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from public.helmut_verstehen_vormerkungen v where vorgang_id='vg-dieswöchigen-20261126-03af76'),
 'aktiveJobs',(select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from public.helmut_jobs j where status='laeuft' or lease_owner is not null or lease_expires_at is not null),
 'aktiveSlots',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]'::jsonb) from public.helmut_klassen_slots l where belegt_bis>jetzt),
 'aktiveCas',(select coalesce(jsonb_agg(to_jsonb(c) order by vorgang_id),'[]'::jsonb) from public.helmut_verstehen_reservierungen c where besitzer is not null or lease_bis is not null or zustand in('reserviert','modell-laeuft')),
 'casOperator',(select jsonb_build_object('definitionHash',encode(sha256(convert_to(pg_get_functiondef(f.oid),'UTF8')),'hex'),
 'securityDefiner',f.prosecdef,'konfiguration',to_jsonb(f.proconfig),'eigentuemer',pg_get_userbyid(f.proowner),'acl',f.proacl::text,
 'rollen',(select jsonb_agg(jsonb_build_object('rolle',r.rolname,'execute',has_function_privilege(r.oid,f.oid,'EXECUTE')) order by r.rolname) from pg_roles r where r.rolname in('anon','authenticated','service_role','postgres')))
 from pg_proc f where f.oid=to_regprocedure('public.helmut_verstehen_ausgang_aufloesen(text,text)')),
 'kostenBuch',(select data->'betriebskostenBudget' from public.helmut_store where id='main-auth'),
 'authDigest',(select encode(sha256(convert_to(data::text,'UTF8')),'hex') from public.helmut_store where id='main-auth'),
 'nativeNutzung',pg_temp.restnutzung(),
 'blobJobNutzung',(select coalesce(jsonb_agg(e.value order by e.value->>'id'),'[]'::jsonb) from public.helmut_store s cross join lateral jsonb_array_elements(coalesce(s.data->'llmUsage','[]'::jsonb)) e where s.id='main-auth' and e.value->>'runId'='f346fe50-dadb-4139-b68a-b78fd88cf4ea'),
 'globalZaehler',(select to_jsonb(c) from public.llm_budget_counters c where day=tag and scope='global'),
 'globalUsed',coalesce((select used from public.llm_budget_counters where day=tag and scope='global'),0),
 'originalZaehler',(select coalesce(jsonb_agg(to_jsonb(f) order by schluessel),'[]'::jsonb) from public.helmut_anbieter_fenster f where schluessel='quellenarbeit|originalabrufe' and fensterart='tag' and fenster_start=tag::date::timestamptz),
 'originalUsed',coalesce((select verbraucht from public.helmut_anbieter_fenster where schluessel='quellenarbeit|originalabrufe' and fensterart='tag' and fenster_start=tag::date::timestamptz),0),
 'llmReservierungen',(select coalesce(jsonb_agg(to_jsonb(r) order by result_key),'[]'::jsonb) from public.llm_reservations r where day=tag and status='reserviert' and expires_at>jetzt),
 'findings',(select coalesce(jsonb_agg(to_jsonb(f) order by source_id,retrieval_path_id,original_url),'[]'::jsonb) from public.document_findings f where raw_document_id='rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'));
$$;
do $operation$
declare p record; v_jetzt timestamptz := pg_catalog.clock_timestamp(); v_tag text; vor jsonb; nach jsonb; b jsonb;
 j jsonb; c jsonb; a jsonb; plan jsonb; auftrag jsonb; beleg jsonb; archiv jsonb; buch jsonb; ticket jsonb;
 inhalt text; digest text; nachdigest text; belegzeile jsonb; n int; total bigint; heute bigint;
 key constant text := 'main-operator-restpflicht-20261127-eu';
begin
 select * into strict p from restparameter; v_tag:=(v_jetzt at time zone 'UTC')::date::text;
 perform pg_temp.restfordere(p.modus in('vorschau','freigeben','rueckweg'),'Modus');
 if p.modus<>'vorschau' then
  lock table public.helmut_jobs in share row exclusive mode;
  lock table public.helmut_store,public.raw_documents,public.knowledge_objects,public.ko_document_links,
   public.helmut_verstehen_reservierungen,public.helmut_verstehen_vormerkungen,public.llm_usage,
   public.document_findings,public.llm_budget_counters,public.llm_reservations,
   public.helmut_anbieter_fenster,public.helmut_klassen_slots in share mode;
 end if;
 vor:=pg_temp.restsnapshot(p.abruf_id,v_tag,v_jetzt); inhalt:=vor::text;
 digest:=encode(sha256(convert_to(inhalt,'UTF8')),'hex');
 if p.modus='vorschau' then
  insert into restquittung values(jsonb_build_object('version',1,'modus','vorschau','tag',v_tag,'gelesenAm',v_jetzt,
   'inhalt',inhalt,'digest',digest,'verbraucht',exists(select 1 from public.helmut_store where id=key))); return;
 end if;
 b:=p.bindung; j:=vor->'job'; c:=vor->'cas'->0;
 perform pg_temp.restfordere(v_tag='2026-11-28' and b->>'tag'=v_tag and b->'version'='1'::jsonb
  and b->>'abrufId'=p.abruf_id::text and (b->>'geprueftAm')::timestamptz between v_jetzt-interval '5 minutes' and v_jetzt,
  '28Nov und frische Bindung');
 perform pg_temp.restfordere(vor->'aktiveJobs'='[]'::jsonb and vor->'aktiveSlots'='[]'::jsonb and vor->'aktiveCas'='[]'::jsonb,
  'keine parallele Workerarbeit');
 if p.modus='freigeben' then
  perform pg_temp.restfordere(p.freigabe='EU-EINZELNEUVERSUCH-20261128' and b->>'modus'='vorbereitet'
   and b->'aktiviert'='false'::jsonb and b->>'entscheidung'='erneut' and b->'vor'=vor and b->>'digest'=digest
   and not exists(select 1 from public.helmut_store where id in(key,key||'-rueckweg')),'neues konkretes GO und unverbrauchter Vorwert');
  perform pg_temp.restfordere(j->>'id'='f346fe50-dadb-4139-b68a-b78fd88cf4ea' and j->>'job_type'='document_understanding'
   and j->'tenant_id'='null'::jsonb and j->>'status'='fehlgeschlagen' and j->'attempts'='3'::jsonb
   and j->'max_attempts'='3'::jsonb and j->'wiedervorlagen'='0'::jsonb and j->>'lease_owner' is null and j->>'lease_expires_at' is null
   and (j->>'finished_at')::timestamptz>='2026-11-27'::timestamptz and (j->>'finished_at')::timestamptz<'2026-11-28'::timestamptz
   and j->>'last_error'='modellausgang-unbekannt: artikel bleibt durch CAS gesperrt'
   and j->'payload'=jsonb_build_object('dokumentIds',jsonb_build_array('rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'),
   'quellenstaende',jsonb_build_object('rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7','f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779'))
   and j->>'idempotency_key'='document_understanding|07e24cc520c2e86523ee838614668491|f83668edc5b35e5db8db2e2f68a98fcd'
   and vor->'rawJobs'=jsonb_build_array(j),'fester Einzelauftrag');
  perform pg_temp.restfordere(vor->'links'='[]'::jsonb and vor->'kos'='[]'::jsonb and vor->'vormerkungen'='[]'::jsonb
   and jsonb_array_length(vor->'cas')=1 and c->>'vorgang_id'='vg-dieswöchigen-20261126-03af76'
   and c->>'zustand'='unbekannt' and c->>'besitzer' is null and c->>'lease_bis' is null
   and c->'fencing'='1'::jsonb and c->'versuche'='1'::jsonb and c->'ki_aufrufe'='1'::jsonb
   and c->'ergebnis_hash'='null'::jsonb and c->'ergebnis_fencing'='null'::jsonb
   and c->>'letzter_grund'='modellfehler:betriebskosten-abschluss-unbestaetigt','fester UNKNOWN ohne Altabschluss');
  select x->'data' into archiv from jsonb_array_elements(vor->'archive') x where x->>'id'=
   'main-rohstand-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7-f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779';
  perform pg_temp.restfordere(archiv->'version'='1'::jsonb and archiv->>'quellenHash'='f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779'
   and archiv->'dokument'=vor->'aktuell' and pg_temp.reststand(vor->'aktuell')='f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779'
   and vor->'aktuell'->>'source_id'='bundesregierung' and vor->'aktuell'->>'source_type'='ministry'
   and vor->'aktuell'->>'source_name'='Bundesregierung' and vor->'aktuell'->>'link_type'='direct'
   and jsonb_typeof(vor->'aktuell'->'summary')='string' and length(btrim(vor->'aktuell'->>'summary'))>0
   and vor->'aktuell'->'raw'->>'retrievalPathId'='rp-bundesregierung', 'unveraendertes Original');
  perform pg_temp.restfordere(vor->'casOperator'->>'definitionHash'='5e666151d7046e87fdd0f319df7fca4e6c2414a6f7d5ff7bcc62d6c592eb2bd5'
   and vor->'casOperator'->'securityDefiner'='false'::jsonb and vor->'casOperator'->>'eigentuemer'='postgres'
   and vor->'casOperator'->>'acl'='{postgres=X/postgres,service_role=X/postgres}'
   and vor->'casOperator'->'konfiguration'='["search_path=public, pg_temp"]'::jsonb
   and not exists(select 1 from jsonb_array_elements(vor->'casOperator'->'rollen') r
    where (r->>'execute')::boolean is distinct from (r->>'rolle' in('postgres','service_role'))), 'native Operatorrechte');
  buch:=vor->'kostenBuch'; ticket:=buch->'calls'->'6423f47f-f7e9-4a33-9774-48b84f795f03';
  perform pg_temp.restfordere(buch->>'contractHash'='8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348'
   and buch->'contract'->>'contractHash'=buch->>'contractHash' and pg_temp.restvertrag(buch->'contract')=buch->>'contractHash'
   and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract') k)=array['contractHash','dailyLimitUsd','profileId','route','startsAt','totalLimitUsd','version']
   and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract'->'route') k)=array['model','provider','responsesUrl']
   and buch->'version'='1'::jsonb
   and buch->'contract'->'dailyLimitUsd'='1'::jsonb and buch->'contract'->'totalLimitUsd'='30'::jsonb
   and buch->'frozen'='null'::jsonb and ticket->>'runId'=j->>'id' and ticket->>'status'='ungeklaert'
   and ticket->>'day'='2026-11-27' and ticket->'reserved'='212000'::jsonb
   and ticket->'maxOutputTokens'='3000'::jsonb and ticket->>'callType'='understanding'
   and ticket->>'contractHash'=buch->>'contractHash'
   and (select count(*) from jsonb_each(buch->'calls') x where value->>'runId'=j->>'id')=1,'Finanzvertrag und alte volle Reserve');
  select sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end),
   coalesce(sum(case when value->>'day'=v_tag then case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end else 0 end),0)
   into total,heute from jsonb_each(buch->'calls');
  perform pg_temp.restfordere(total=(buch->>'bound')::bigint and total>=212000 and total+212000<=30000000 and heute+212000<=1000000
   and not exists(select 1 from jsonb_each(buch->'calls') t where (
    value->>'status' in('reserviert','ungeklaert','abgerechnet','nicht-gesendet')
    and value->>'id'=t.key and value->>'contractHash'=buch->>'contractHash'
    and value->>'model'=buch->'contract'->'route'->>'model'
    and value->>'requestHash' ~ '^[a-f0-9]{64}$' and value->>'day' ~ '^\d{4}-\d{2}-\d{2}$'
    and value->>'day'=substring(value->>'createdAt',1,10) and value->>'createdAt'>=buch->'contract'->>'startsAt'
    and jsonb_typeof(value->'maxOutputTokens')='number' and value->>'maxOutputTokens' ~ '^[0-9]+$'
    and (value->>'maxOutputTokens')::int between 1 and 8000
    and jsonb_typeof(value->'reserved')='number' and (value->>'reserved')::bigint=200000+(value->>'maxOutputTokens')::bigint*4
    and (value->>'status' not in('abgerechnet','nicht-gesendet') or
     (jsonb_typeof(value->'cost')='number' and value->>'cost' ~ '^[0-9]+$'
      and (value->>'cost')::bigint between 0 and (value->>'reserved')::bigint))
    and (value->>'status'<>'nicht-gesendet' or value->'cost'='0'::jsonb)
    and (value->>'status'<>'abgerechnet' or jsonb_typeof(value->'usageReceiptId')='string')) is not true)
   and not exists(select 1 from jsonb_each(buch->'calls') t where value->>'status'='abgerechnet'
    group by value->>'usageReceiptId' having count(*)>1)
   and not exists(select 1 from jsonb_each(buch->'calls') t group by value->>'day' having
    sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end)
    >case when value->>'day'='2026-11-20' then 2000000 else 1000000 end),'ausreichender neuer Geldrahmen');
  perform pg_temp.restfordere(vor->'nativeNutzung'->'zeilen'='[]'::jsonb
   and not exists(select 1 from jsonb_array_elements(vor->'blobJobNutzung') e where
    (e->>'model'='none' and e->'keinAufruf'='true'::jsonb and e->'success'='false'::jsonb
     and e->>'callType'='skipped-understanding-error') is not true)
   and (vor->>'globalUsed')::bigint between 0 and 99 and (vor->>'originalUsed')::bigint between 0 and 15
   and vor->'llmReservierungen'='[]'::jsonb,'UNKNOWN-Nutzung und100/16-Grenzen');
  a:=vor->'abruf'; plan:=vor->'plan'->'data'; beleg:=vor->'beleg'->'data';
  select count(*),jsonb_agg(x)->0 into n,auftrag from jsonb_array_elements(plan->'auftraege') x where x->>'jobType'='source_fetch' and x->>'idempotencyKey'=a->>'idempotency_key';
  perform pg_temp.restfordere(n=1 and plan->>'tag'=v_tag and plan->>'zustand'='fertig'
   and (plan->>'cursor')::int=jsonb_array_length(plan->'auftraege')
   and plan->>'manifestHash'=pg_temp.resthash(jsonb_build_array(v_tag,plan->'auftraege',plan->'tagesplan'))
   and auftrag->'payload'=a->'payload' and auftrag->'payload'->>'art'='geteilt'
   and auftrag->'payload'->'quelle'->>'id'='bundesregierung' and auftrag->'payload'->'quelle'->>'retrievalPathId'='rp-bundesregierung'
   and auftrag->'priority'='50'::jsonb and a->'priority'='50'::jsonb
   and a->>'job_type'='source_fetch' and a->>'status'='erledigt' and a->'tenant_id'='null'::jsonb
   and a->>'lease_owner' is null and a->>'lease_expires_at' is null
   and (a->>'first_due_at')::timestamptz=(auftrag->>'dueAt')::timestamptz
   and (a->>'first_due_at')::timestamptz>=v_tag::date::timestamptz
   and (a->>'finished_at')::timestamptz between (a->>'first_due_at')::timestamptz and least(v_jetzt,v_tag::date::timestamptz+interval '5 hour 45 minute'), 'aktueller28Nov-Pflichtplan');
  perform pg_temp.restfordere(beleg->'version'='1'::jsonb and beleg->>'belegHash'=pg_temp.resthash(beleg-'belegHash')
   and beleg->>'bindung'=pg_temp.resthash(jsonb_build_array(a->>'id',a->'tenant_id',a->'payload'->'quelle',to_char((a->>'first_due_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
   and (beleg->>'bestaetigtAm')::timestamptz between (a->>'first_due_at')::timestamptz and (a->>'finished_at')::timestamptz
   and beleg->'ergebnis'->>'art' in('rohfassungen','teilweise') and coalesce(beleg->'ergebnis'->'quellenkonflikt','false'::jsonb)='false'::jsonb
   and beleg->'ergebnis'->'rohIds' ? 'rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'
   and (select count(*) from jsonb_array_elements(beleg->'ergebnis'->'analyse') x where x->>'jobId'=j->>'id')=1
   and exists(select 1 from jsonb_array_elements(beleg->'ergebnis'->'analyse') x where x->>'jobId'=j->>'id'
    and x->>'rohId'='rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7'
    and x->>'stand'='f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779'), 'native frische Einzelquittung');
  perform pg_temp.restfordere(public.helmut_verstehen_ausgang_aufloesen('vg-dieswöchigen-20261126-03af76','erneut')='erneut-freigegeben','native Entscheidung');
  update public.helmut_jobs set status='wartend',finished_at=null,max_attempts=4,quellen_prioritaet_tag='2026-11-28',updated_at=clock_timestamp()
   where id='f346fe50-dadb-4139-b68a-b78fd88cf4ea';
 else
  perform pg_temp.restfordere(b->>'modus'='freigegeben' and b->'nach'=vor and b->>'nachDigest'=digest
   and b->>'vorDigest'=encode(sha256(convert_to((b->'vor')::text,'UTF8')),'hex')
   and b->'einmalbeleg'->>'vorDigest'=b->>'vorDigest' and b->'einmalbeleg'->>'nachDigest'=b->>'nachDigest'
   and b->'einmalbeleg'->>'tag'=v_tag
   and exists(select 1 from public.helmut_store where id=key and data=b->'einmalbeleg')
   and not exists(select 1 from public.helmut_store where id=key||'-rueckweg')
   and j->>'status'='wartend' and j->'attempts'='3'::jsonb and j->'max_attempts'='4'::jsonb
   and c->>'zustand'='offen' and c->>'letzter_grund'='erneut-freigegeben'
   and (vor-array['job','cas','rawJobs'])=((b->'vor')-array['job','cas','rawJobs'])
   and (c-array['zustand','letzter_grund','updated_at'])=((b->'vor'->'cas'->0)-array['zustand','letzter_grund','updated_at']), 'Rueckweg nach Claim oder Drift gesperrt');
  update public.helmut_verstehen_reservierungen set zustand='unbekannt',letzter_grund=b->'vor'->'cas'->0->>'letzter_grund',
   updated_at=(b->'vor'->'cas'->0->>'updated_at')::timestamptz where vorgang_id='vg-dieswöchigen-20261126-03af76';
  update public.helmut_jobs set status='fehlgeschlagen',finished_at=(b->'vor'->'job'->>'finished_at')::timestamptz,max_attempts=3,
   quellen_prioritaet_tag=(b->'vor'->'job'->>'quellen_prioritaet_tag')::date,updated_at=clock_timestamp() where id='f346fe50-dadb-4139-b68a-b78fd88cf4ea';
 end if;
 get diagnostics n=row_count; perform pg_temp.restfordere(n=1,'Einzelupdate');
 nach:=pg_temp.restsnapshot(p.abruf_id,v_tag,v_jetzt);
 perform pg_temp.restfordere((vor-array['job','cas','rawJobs'])=(nach-array['job','cas','rawJobs'])
  and ((vor->'cas'->0)-array['zustand','letzter_grund','updated_at'])=((nach->'cas'->0)-array['zustand','letzter_grund','updated_at'])
  and ((vor->'job')-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at'])=((nach->'job')-array['status','finished_at','max_attempts','quellen_prioritaet_tag','updated_at']),
  'Originale Nutzungsbelege Finanzbuch Zaehler oder Payload veraendert');
 nachdigest:=encode(sha256(convert_to(nach::text,'UTF8')),'hex');
 belegzeile:=jsonb_build_object('version',1,'tag',v_tag,'vorDigest',digest,'nachDigest',nachdigest,'zeit',v_jetzt);
 insert into public.helmut_store(id,data) values(case when p.modus='freigeben' then key else key||'-rueckweg' end,belegzeile);
 insert into restquittung values(jsonb_build_object('version',1,'modus',case when p.modus='freigeben' then 'freigegeben' else 'zurueckgenommen' end,
  'tag',v_tag,'abrufId',p.abruf_id,'geprueftAm',b->>'geprueftAm','vor',vor,'nach',nach,'vorDigest',digest,'nachDigest',nachdigest,'einmalbeleg',belegzeile));
end $operation$;
select ausgabe from restquittung;
commit;
