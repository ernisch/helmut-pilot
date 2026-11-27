-- BESTANDSOPERATOR, KEINE Migration. Standard ist reine Vorschau.
-- Keine Aktivierung ohne neues konkretes GO und frische Belege beider Plattformen.
-- psql -v modus=vorschau -f ...sql; Ausgabe privat durch JS pruefen.
-- Aktivieren: modus=freigeben, bindung=<JS-Ausgabe>, go=<privates konkretes GO-JSON>.
-- Rueckweg: modus=rueckweg, bindung={version:1,id:<Quittungsid>,receiptSHA256:<B.digest(Quittung)>}, go=<frisches Rueckweg-GO>.
-- Keine Quellen-/Provideraufrufe, Workerstarts, alten Quittungen oder Finanzwrites.
\set ON_ERROR_STOP on
\if :{?modus}
\else
\set modus vorschau
\endif
\if :{?bindung}
\else
\set bindung '{}'
\endif
\if :{?go}
\else
\set go '{}'
\endif
begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table breg_parameter on commit drop as
 select :'modus'::text modus, :'bindung'::jsonb bindung, :'go'::jsonb freigabe;
create temporary table breg_ausgabe(data jsonb) on commit drop;
create function pg_temp.breg_fordere(ok boolean,grund text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'breg-fassung: %',grund;end if;end $$;
create function pg_temp.breg_hash(j jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to(public.helmut_quellenfassung_json(j),'UTF8')),'hex') $$;
create function pg_temp.breg_stand(d jsonb) returns text language sql immutable as $$
 select pg_temp.breg_hash(jsonb_build_array(d->'id',d->'url',d->'canonical_url',d->'title',d->'summary',
 case when d->>'published_at' is null then null else
 to_char((d->>'published_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,d->'source_name',d->'raw')) $$;
create function pg_temp.breg_pins() returns jsonb language sql immutable as $$
 select '{"rawIds":"79487a377f2c9c41f84e46fc3213a052c4b5311a237949be0797febdd341b3f5","roh":"79cf43d3047b04c7058ab1d6964f226ee6ee5db76f82836ade583206d57b3012","kos":"bc3f4a5149fde1c30c93b407f3fb95d3550691ddcf021e221f16c3c5754b0461","kanten":"de63110037f2e603ba24d16e13c191899f5d4c732f62fe26e869e136823a1c28","zielKanten":"02b4c92e93e82a32d28d3cc893aa818a6a6af5446272c3ef693bbe18396c7110","archive":"81870ffc255031db45b29a2346f0d5edff9cbdb81cb8d8065ab86ec12fba5cac","findings":"0f1cdd8d050e69c25bf34022e90b6e3c11403c88902f35e13cd54fbae61dd530"}'::jsonb $$;
create function pg_temp.breg_kos() returns text[] language sql immutable as $$
 select array['ko-vg-bundesregierung-20241119-743c6b','ko-vg-entlastungen-20260417-6517e5'] $$;
-- Vollstaendige Zeilen, nativer C-SHA256; kein rekursiver globaler JSON-Baum.
-- Sortierte feste64Hex-Zeilenhashs binden auch Multiplizitaet und leere Tabellen.
create function pg_temp.breg_tabellenhash(t regclass) returns text language plpgsql stable as $$
declare h text;
begin
 execute format($abfrage$select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex')
  from (select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h from %s r) x$abfrage$,t) into h;
 return h;
end $$;
create function pg_temp.breg_snapshot(jetzt timestamptz) returns jsonb language sql stable as $$
 with kanten as(select l.* from public.ko_document_links l where knowledge_object_id=any(pg_temp.breg_kos())),
 roh as(select r.* from public.raw_documents r where id in(select raw_document_id from kanten))
 select jsonb_build_object(
 'roh',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from roh r),
 'kos',(select coalesce(jsonb_agg(to_jsonb(k) order by id),'[]') from public.knowledge_objects k where id=any(pg_temp.breg_kos())),
 'kanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id,raw_document_id),'[]') from kanten l),
 'zielKanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id),'[]') from public.ko_document_links l
   where raw_document_id='rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068'),
 'archive',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'data',s.data) order by s.id),'[]') from public.helmut_store s
   where exists(select 1 from roh r where s.id like 'main-rohstand-'||substring(r.id from 4)||'-%')),
 'findings',(select coalesce(jsonb_agg(to_jsonb(f) order by raw_document_id,source_id,retrieval_path_id,original_url),'[]')
   from public.document_findings f where raw_document_id in(select id from roh)),
 'bindungen',(select coalesce(jsonb_agg(to_jsonb(f) order by knowledge_object_id,ko_version,raw_document_id),'[]')
   from public.helmut_ko_quellenfassungen f where knowledge_object_id=any(pg_temp.breg_kos())),
 'rechte',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl::text) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in('raw_documents','helmut_store','helmut_ko_quellenfassungen')),
 'sicherung',jsonb_build_object(
  'kostenBuch',(select data->'betriebskostenBudget' from public.helmut_store where id='main-auth'),
  'authDigest',(select encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from public.helmut_store s where id='main-auth'),
  'aktiveCas',(select coalesce(jsonb_agg(to_jsonb(c) order by vorgang_id),'[]') from public.helmut_verstehen_reservierungen c
    where besitzer is not null or lease_bis is not null or zustand in('reserviert','modell-laeuft')),
  'aktiveJobs',(select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from public.helmut_jobs j
    where status='laeuft' or lease_owner is not null or lease_expires_at is not null),
  'aktiveSlots',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.helmut_klassen_slots l where belegt_bis>jetzt),
  'aktiveLlm',(select coalesce(jsonb_agg(to_jsonb(l) order by result_key),'[]') from public.llm_reservations l where status='reserviert' and expires_at>jetzt),
  'aktiveLocks',(select coalesce(jsonb_agg(to_jsonb(l) order by job_name),'[]') from public.pipeline_locks l where expires_at>jetzt),
  'globalUsed',coalesce((select used from public.llm_budget_counters where day=(jetzt at time zone 'UTC')::date::text and scope='global'),0),
  'originalUsed',coalesce((select verbraucht from public.helmut_anbieter_fenster where schluessel='quellenarbeit|originalabrufe'
    and fensterart='tag' and fenster_start=(jetzt at time zone 'UTC')::date::timestamptz),0),
  -- Nur Digests statt funktionsfremder historischer Vollbestandsausgabe.
  'jobs',pg_temp.breg_tabellenhash('public.helmut_jobs'::regclass),
  'cas',pg_temp.breg_tabellenhash('public.helmut_verstehen_reservierungen'::regclass),
  'vormerkungen',pg_temp.breg_tabellenhash('public.helmut_verstehen_vormerkungen'::regclass),
  'nutzung',pg_temp.breg_tabellenhash('public.llm_usage'::regclass),
  'kos',pg_temp.breg_tabellenhash('public.knowledge_objects'::regclass),
  'kanten',pg_temp.breg_tabellenhash('public.ko_document_links'::regclass),
  'zaehler',pg_temp.breg_tabellenhash('public.llm_budget_counters'::regclass),
  'ressourcen',pg_temp.breg_tabellenhash('public.helmut_anbieter_fenster'::regclass),
  'reservierungen',pg_temp.breg_tabellenhash('public.llm_reservations'::regclass),
  'slots',pg_temp.breg_tabellenhash('public.helmut_klassen_slots'::regclass),
  'locks',pg_temp.breg_tabellenhash('public.pipeline_locks'::regclass),
  'ablagen',(select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex')
    from (select encode(sha256(convert_to(to_jsonb(st)::text,'UTF8')),'hex') h from public.helmut_store st
    where id not like '%-rohstand-%' and id not like 'main-operator-breg-fassung-20261127%') zeilen)
 )) $$;
create function pg_temp.breg_plan(s jsonb) returns jsonb language plpgsql stable as $$
declare p jsonb:=pg_temp.breg_pins(); r jsonb; a jsonb; d jsonb; b jsonb; k jsonb; l jsonb; gruppe jsonb;
 neu jsonb:='[]'; bindungen jsonb:='[]'; alle jsonb:='{}'; stand text; aid text; sha text; n int; alt jsonb; nach jsonb;
begin
 foreach stand in array array['roh','kos','kanten','zielKanten','archive','findings'] loop
  perform pg_temp.breg_fordere(pg_temp.breg_hash(s->stand)=p->>stand,'fester Originalbestand '||stand);
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(s->'roh')=60 and jsonb_array_length(s->'kos')=2
  and jsonb_array_length(s->'kanten')=61 and jsonb_array_length(s->'archive')=17
  and s->'bindungen'='[]'::jsonb,'Bestand60/2/61/17 ohne Vorbindung');
 for k in select value from jsonb_array_elements(s->'kos') loop
  n:=case when k->>'id'=(pg_temp.breg_kos())[1] then 60 else 1 end;
  perform pg_temp.breg_fordere(k->'ko_version'='1'::jsonb and k->>'understanding_status'='complete'
   and k->'verstehen_fencing'=case when n=60 then 'null'::jsonb else '1'::jsonb end
   and (select count(*) from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id')=n,'alte KO-Version');
 end loop;
 for r in select value from jsonb_array_elements(s->'roh') loop
  stand:=pg_temp.breg_stand(r);aid:='main-rohstand-'||substring(r->>'id' from 4)||'-'||stand;
  select value into a from jsonb_array_elements(s->'archive') where value->>'id'=aid;
  if a is not null then
   d:=public.helmut_quellenfassung_dokument(r->>'id',aid,pg_temp.breg_hash(a->'data'),a->'data');
   perform pg_temp.breg_fordere(to_jsonb(jsonb_populate_record(null::public.raw_documents,d))=r,'bestehender Archivkonflikt');
  else
   perform pg_temp.breg_fordere(not exists(select 1 from jsonb_array_elements(s->'archive') e
    where e->'data'->'dokument'->>'id'=r->>'id'),'Archiv ohne exakte heutige Originalbindung');
   a:=jsonb_build_object('id',aid,'data',jsonb_build_object('version',1,'quellenHash',stand,'dokument',r));
   neu:=neu||jsonb_build_array(a);
  end if;
  alle:=alle||jsonb_build_object(r->>'id',jsonb_build_object('raw_source_version_id',aid,'raw_source_version_sha256',pg_temp.breg_hash(a->'data')));
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(neu)=47,'genau47 heutige Bestandssnapshots');
 for k in select value from jsonb_array_elements(s->'kos') loop
  select jsonb_agg(jsonb_build_object('raw_document_id',e->>'raw_document_id',
   'raw_source_version_id',alle->(e->>'raw_document_id')->>'raw_source_version_id',
   'raw_source_version_sha256',alle->(e->>'raw_document_id')->>'raw_source_version_sha256')
   order by e->>'raw_document_id' collate "C") into gruppe from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id';
  sha:=pg_temp.breg_hash(gruppe);n:=jsonb_array_length(gruppe);
  for l in select value from jsonb_array_elements(gruppe) loop
   bindungen:=bindungen||jsonb_build_array(l||jsonb_build_object('knowledge_object_id',k->>'id','ko_version',1,'quellen_count',n,'manifest_sha256',sha));
  end loop;
 end loop;
 select value into alt from jsonb_array_elements(s->'roh') where value->>'id'='rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068';
 select value->'data' into a from jsonb_array_elements(s->'archive') where value->>'id'=
 'main-rohstand-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068-0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795';
 d:=public.helmut_quellenfassung_dokument(alt->>'id','main-rohstand-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068-0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795',pg_temp.breg_hash(a),a);
 perform pg_temp.breg_fordere(pg_temp.breg_stand(alt)='add680be81a04d0e6f3c9de92adc2c55d258401d4a2428191527ed7fc8fd5160'
  and d->>'source_id'='bundesregierung' and d->>'source_name'='Bundesregierung' and d->>'source_type'='ministry'
  and d->'raw'->>'retrievalPathId'='rp-bundesregierung' and length(trim(d->>'summary'))>0
  and d->'url'=alt->'url' and d->'canonical_url'=alt->'canonical_url','amtliche gespeicherte RSSfassung');
 nach:=alt||jsonb_build_object('title',d->'title','source_id',d->'source_id','source_name',d->'source_name','source_type',d->'source_type',
  'published_at',d->'published_at','summary',d->'summary','retrieved_at',d->'retrieved_at','raw',d->'raw','content_fingerprint',null);
 nach:=to_jsonb(jsonb_populate_record(null::public.raw_documents,nach));
 perform pg_temp.breg_fordere(pg_temp.breg_stand(nach)='0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795','Promotionsfelder');
 return jsonb_build_object('neueArchive',neu,'bindungen',bindungen,'alt',alt,'nach',nach);
end $$;

create function pg_temp.breg_vertrag(c jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to('{"version":'||(c->'version')::text||',"profileId":'||(c->'profileId')::text
 ||',"startsAt":'||(c->'startsAt')::text||',"dailyLimitUsd":'||(c->'dailyLimitUsd')::text
 ||',"totalLimitUsd":'||(c->'totalLimitUsd')::text||',"route":{"provider":'||(c->'route'->'provider')::text
 ||',"responsesUrl":'||(c->'route'->'responsesUrl')::text||',"model":'||(c->'route'->'model')::text||'}}','UTF8')),'hex') $$;
create function pg_temp.breg_ruhe(s jsonb,jetzt timestamptz) returns void language plpgsql stable as $$
declare w jsonb:=s->'sicherung';buch jsonb:=w->'kostenBuch';total bigint;heute bigint;tag text:=(jetzt at time zone 'UTC')::date::text;
begin
 perform pg_temp.breg_fordere(w->'aktiveJobs'='[]'::jsonb and w->'aktiveSlots'='[]'::jsonb
  and w->'aktiveLlm'='[]'::jsonb and w->'aktiveLocks'='[]'::jsonb,'keine aktive Workerarbeit');
 perform pg_temp.breg_fordere(w->'aktiveCas'='[]'::jsonb or
  (jsonb_array_length(w->'aktiveCas')=7
   and pg_temp.breg_hash(w->'aktiveCas')='76f8a7856e80e9ea9b614c1aa11b57af3029ad764570027c3f7ea9b13252af18'
   and not exists(select 1 from jsonb_array_elements(w->'aktiveCas') c where
     (c->>'zustand' in('reserviert','modell-laeuft') and length(c->>'besitzer')>0
       and (c->>'lease_bis')::timestamptz<jetzt) is not true)),'nur exakt bekannte abgelaufene CAS');
 perform pg_temp.breg_fordere(buch->>'contractHash'='8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348'
  and buch->'contract'->>'contractHash'=buch->>'contractHash'
  and pg_temp.breg_vertrag(buch->'contract')=buch->>'contractHash' and buch->'version'='1'::jsonb
  and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract') k)=array['contractHash','dailyLimitUsd','profileId','route','startsAt','totalLimitUsd','version']
  and (select array_agg(k order by k) from jsonb_object_keys(buch->'contract'->'route') k)=array['model','provider','responsesUrl']
  and buch->'contract'->'dailyLimitUsd'='1'::jsonb and buch->'contract'->'totalLimitUsd'='30'::jsonb
  and buch->'contract'->'route'->>'provider'='azure' and buch->'contract'->'route'->>'model'='gpt-5-mini-eu'
  and buch->'frozen'='null'::jsonb and jsonb_typeof(buch->'calls')='object','unveraenderter Finanzvertrag');
 select coalesce(sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end),0),
  coalesce(sum(case when value->>'day'=tag then case when value->>'status' in('abgerechnet','nicht-gesendet')
   then (value->>'cost')::bigint else (value->>'reserved')::bigint end else 0 end),0)
 into total,heute from jsonb_each(buch->'calls');
 perform pg_temp.breg_fordere(total=(buch->>'bound')::bigint and total between 0 and 30000000 and heute between 0 and 1000000
  and not exists(select 1 from jsonb_each(buch->'calls') t where (
   value->>'status' in('reserviert','ungeklaert','abgerechnet','nicht-gesendet') and value->>'id'=t.key
   and value->>'contractHash'=buch->>'contractHash' and value->>'model'=buch->'contract'->'route'->>'model'
   and value->>'requestHash' ~ '^[a-f0-9]{64}$' and value->>'day' ~ '^\d{4}-\d{2}-\d{2}$'
   and value->>'day'=substring(value->>'createdAt',1,10) and value->>'createdAt'>=buch->'contract'->>'startsAt'
   and jsonb_typeof(value->'maxOutputTokens')='number' and value->>'maxOutputTokens' ~ '^[0-9]+$'
   and (value->>'maxOutputTokens')::int between 1 and 8000 and jsonb_typeof(value->'reserved')='number'
   and (value->>'reserved')::bigint=200000+(value->>'maxOutputTokens')::bigint*4
   and (value->>'status' not in('abgerechnet','nicht-gesendet') or
     (jsonb_typeof(value->'cost')='number' and value->>'cost' ~ '^[0-9]+$'
      and (value->>'cost')::bigint between 0 and (value->>'reserved')::bigint))
   and (value->>'status'<>'nicht-gesendet' or value->'cost'='0'::jsonb)
   and (value->>'status'<>'abgerechnet' or jsonb_typeof(value->'usageReceiptId')='string')) is not true)
  and not exists(select 1 from jsonb_each(buch->'calls') t where value->>'status'='abgerechnet'
    group by value->>'usageReceiptId' having count(*)>1)
  and not exists(select 1 from jsonb_each(buch->'calls') t group by value->>'day' having
   sum(case when value->>'status' in('abgerechnet','nicht-gesendet') then (value->>'cost')::bigint else (value->>'reserved')::bigint end)
   >case when value->>'day'='2026-11-20' then 2000000 else 1000000 end)
  and (w->>'globalUsed')::bigint between 0 and 100 and (w->>'originalUsed')::bigint between 0 and 16,
 'vollstaendiges Finanzbuch1/30USD und100/16 ohne neue Reserve');
end $$;
create function pg_temp.breg_go(g jsonb,aktion text,digest text,jetzt timestamptz) returns void language plpgsql as $$
declare p jsonb;
begin
 perform pg_temp.breg_fordere(g->'approved'='true'::jsonb and g->>'scope'='BREG-BESTANDSFASSUNG-20261127'
  and g->>'aktion'=aktion and g->>'digest'=digest and g->>'codeCommit' ~ '^[a-f0-9]{40}$'
  and g->>'migrationSHA256' ~ '^[a-f0-9]{64}$'
  and (g->>'approvedAt')::timestamptz between jetzt-interval '5 minutes' and jetzt
  and g->>'tag'=(jetzt at time zone 'UTC')::date::text
  and g->>'policyHash'='23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff'
  and jsonb_array_length(g->'plattformen')=2,'frisches konkretes GO');
 perform pg_temp.breg_fordere((select array_agg(e->>'name' order by e->>'name') from jsonb_array_elements(g->'plattformen') e)=array['hetzner','vercel'],'beide Plattformen');
 for p in select value from jsonb_array_elements(g->'plattformen') loop
  perform pg_temp.breg_fordere(p->>'commit'=g->>'codeCommit' and p->'migration'='true'::jsonb
   and p->>'migrationSHA256'=g->>'migrationSHA256' and p->>'evidenceSHA256' ~ '^[a-f0-9]{64}$'
   and (p->>'checkedAt')::timestamptz between jetzt-interval '5 minutes' and jetzt
   and p->'httpStatus'='200'::jsonb and p->>'policyHash'=g->>'policyHash'
   and p->'dailyUsd'='1'::jsonb and p->'totalUsd'='30'::jsonb and p->'calls'='100'::jsonb
   and p->'originals'='16'::jsonb,'frischer Code/GET/GIZ/100/16-Plattformvorflug');
 end loop;
end $$;


do $breg$
declare p record; v_jetzt timestamptz := pg_catalog.clock_timestamp(); vor jsonb; nach jsonb;
 plan jsonb; b jsonb; q jsonb; altq jsonb; x jsonb; rawrow public.raw_documents; textvor text; digest text; n int;
 key constant text:='main-operator-breg-fassung-20261127';
begin
 select * into strict p from breg_parameter;
 perform pg_temp.breg_fordere(p.modus in('vorschau','freigeben','rueckweg'),'Modus');
 perform pg_temp.breg_fordere(octet_length(p.bindung::text)<=8192 and octet_length(p.freigabe::text)<=32768,'kleine konkrete Parameterhuelle');
 perform pg_temp.breg_fordere(current_user='postgres' and session_user='postgres','nur expliziter Datenbankeigner');
 perform pg_temp.breg_fordere((select count(*)=3 and bool_and(pg_get_userbyid(c.relowner)='postgres' and c.relrowsecurity)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in('raw_documents','helmut_store','helmut_ko_quellenfassungen'))
  and not has_table_privilege('service_role','public.helmut_ko_quellenfassungen','UPDATE,DELETE')
  and not has_table_privilege('anon','public.helmut_ko_quellenfassungen','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.helmut_ko_quellenfassungen','SELECT,INSERT,UPDATE,DELETE')
  and (select not prosecdef from pg_proc where oid=to_regprocedure('public.helmut_quellenfassung_dokument(text,text,text,jsonb)')),'Owner/RLS/append-only/invoker ABI');
 if p.modus<>'vorschau' then
  -- Verhindert konkurrierende neue Claims, Slot-, Kosten- und Quellenwrites.
  -- Keine persistierenden Funktionen/Trigger/DDL und kein Schreibretry.
  lock table public.raw_documents,public.knowledge_objects,public.ko_document_links,
   public.helmut_store,public.helmut_ko_quellenfassungen,public.document_findings,
   public.helmut_jobs,public.helmut_verstehen_reservierungen,public.helmut_verstehen_vormerkungen,
   public.llm_usage,public.llm_budget_counters,public.llm_reservations,
   public.helmut_anbieter_fenster,public.helmut_klassen_slots,public.pipeline_locks in share row exclusive mode;
  perform 1 from public.knowledge_objects where id=any(pg_temp.breg_kos()) order by id for update;
  perform 1 from public.raw_documents where id in(select raw_document_id from public.ko_document_links
   where knowledge_object_id=any(pg_temp.breg_kos())) order by id for update;
  perform 1 from public.ko_document_links where knowledge_object_id=any(pg_temp.breg_kos()) order by knowledge_object_id,raw_document_id for update;
  perform 1 from public.helmut_store where id='main-auth' or exists(select 1 from public.ko_document_links l
   where l.knowledge_object_id=any(pg_temp.breg_kos()) and helmut_store.id like 'main-rohstand-'||substring(l.raw_document_id from 4)||'-%')
   order by id for update;
 end if;
 vor:=pg_temp.breg_snapshot(v_jetzt);textvor:=vor::text;digest:=encode(sha256(convert_to(textvor,'UTF8')),'hex');
 perform pg_temp.breg_ruhe(vor,v_jetzt);
 if p.modus='vorschau' then
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_store where id=key),'Einmalrecht bereits verbraucht');
  plan:=pg_temp.breg_plan(vor);
  insert into breg_ausgabe values(jsonb_build_object('version',1,'modus','vorschau','gelesenAm',v_jetzt,
    'tag',(v_jetzt at time zone 'UTC')::date::text,'inhalt',textvor,'digest',digest));
 elsif p.modus='freigeben' then
  b:=p.bindung;
  perform pg_temp.breg_go(p.freigabe,'freigeben',b->>'digest',v_jetzt);
  perform pg_temp.breg_fordere(b->'version'='1'::jsonb and b->>'modus'='vorbereitet' and b->'aktiviert'='false'::jsonb
   and (b->>'gelesenAm')::timestamptz between v_jetzt-interval '5 minutes' and v_jetzt
   and b->>'tag'=(v_jetzt at time zone 'UTC')::date::text and b->>'digest'=digest,
   'frischer unveraenderter atomarer Vorwert');
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_store where id=key or id=key||'-rueckweg'),'Einmalrecht bereits verbraucht');
  plan:=pg_temp.breg_plan(vor);
  perform pg_temp.breg_fordere(pg_temp.breg_hash(plan)=b->>'planDigest','unabhaengig nativ gepruefter Plan');
  for x in select value from jsonb_array_elements(plan->'neueArchive') loop
   -- Kollision ist immer STOP, niemals ON CONFLICT IGNORE.
   insert into public.helmut_store(id,data) values(x->>'id',x->'data');
  end loop;
  insert into public.helmut_ko_quellenfassungen(knowledge_object_id,ko_version,raw_document_id,
    raw_source_version_id,raw_source_version_sha256,quellen_count,manifest_sha256)
   select e->>'knowledge_object_id',(e->>'ko_version')::int,e->>'raw_document_id',
    e->>'raw_source_version_id',e->>'raw_source_version_sha256',(e->>'quellen_count')::int,e->>'manifest_sha256'
    from jsonb_array_elements(plan->'bindungen') e;
  get diagnostics n=row_count;
  perform pg_temp.breg_fordere(n=61 and (select count(*)=2 and bool_and(vollstaendig) from public.helmut_ko_quellenmanifeste
   where knowledge_object_id=any(pg_temp.breg_kos()) and ko_version=1),'61 vollstaendige Bindungen');
  -- Vor der Promotion muessen beide Altleser exakt ihre bisherigen Vollzeilen liefern.
  perform pg_temp.breg_fordere(not exists(select 1 from public.helmut_ko_quellen q
   where q.knowledge_object_id=any(pg_temp.breg_kos()) and
   to_jsonb(jsonb_populate_record(null::public.raw_documents,public.helmut_quellenfassung_dokument(
     q.raw_document_id,q.raw_source_version_id,q.raw_source_version_sha256,q.source_archive)))
    is distinct from (select r from jsonb_array_elements(vor->'roh') r where r->>'id'=q.raw_document_id)),
  'historische Vollquellen unveraendert');
  rawrow:=jsonb_populate_record(null::public.raw_documents,plan->'nach');
  update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=null
    where r.id=rawrow.id and to_jsonb(r)=plan->'alt';
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'genau eine vorwertgebundene Rawpromotion');
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and nach->'zielKanten'=vor->'zielKanten' and jsonb_array_length(nach->'archive')=64
    and jsonb_array_length(nach->'bindungen')=61
    and (select r from jsonb_array_elements(nach->'roh') r where r->>'id'=rawrow.id)=plan->'nach'
    and not exists(select 1 from jsonb_array_elements(vor->'archive') a where not nach->'archive' @> jsonb_build_array(a)),
   '47+61+1 und bitgleiche Finanzen/KOs/Jobs/Journale/Findings/Rechte');
  q:=jsonb_build_object('version',1,'modus','aktiviert','id',key,'aktiviertAm',v_jetzt,
    'vorDigest',digest,'nachDigest',pg_temp.breg_hash(nach),'planDigest',pg_temp.breg_hash(plan),
    'plan',plan,'bindungen',nach->'bindungen','go',p.freigabe,
    'hinweis','Heutiger Bestandssnapshot; kein historischer Lektuere-/Neufetchbeleg. Kein Workerstart.');
  insert into public.helmut_store(id,data) values(key,q);
  perform pg_temp.breg_fordere((select data=q from public.helmut_store where id=key),'persistierte Aktivierungsquittung');
  insert into breg_ausgabe values(q);
 else
  select data into strict altq from public.helmut_store where id=key for update;
  perform pg_temp.breg_fordere(p.bindung->>'id'=key and p.bindung->'version'='1'::jsonb
    and p.bindung->>'receiptSHA256'=pg_temp.breg_hash(altq) and altq->>'modus'='aktiviert'
    and altq->>'nachDigest'=pg_temp.breg_hash(vor) and altq->>'planDigest'=pg_temp.breg_hash(altq->'plan')
    and altq->'bindungen'=vor->'bindungen' and not exists(select 1 from public.helmut_store where id=key||'-rueckweg'),
    'persistierte Quittung; keinerlei Konsum/Claim/Drift; Rueckweg einmalig');
  perform pg_temp.breg_go(p.freigabe,'rueckweg',altq->>'nachDigest',v_jetzt);
  plan:=altq->'plan';
  perform pg_temp.breg_fordere((select r from jsonb_array_elements(vor->'roh') r where r->>'id'=plan->'nach'->>'id')=plan->'nach',
    'exakte promovierte Vorfassung');
  rawrow:=jsonb_populate_record(null::public.raw_documents,plan->'alt');
  update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=rawrow.content_fingerprint
    where r.id=rawrow.id and to_jsonb(r)=plan->'nach';
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'Rueckweg genau eine Rawzeile');
  delete from public.helmut_ko_quellenfassungen f where knowledge_object_id=any(pg_temp.breg_kos())
    and ko_version=1 and exists(select 1 from jsonb_array_elements(altq->'bindungen') eb where to_jsonb(f)=eb.value);
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=61,'Rueckweg genau61 quittierte Bindungen');
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'archive'=vor->'archive' and nach->'bindungen'='[]'::jsonb
    and nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and pg_temp.breg_hash(nach->'roh')=pg_temp.breg_pins()->>'roh','Rueckweg;47 Archive/Finanzen/Historie bleiben erhalten');
  q:=jsonb_build_object('version',1,'modus','zurueckgenommen','id',key||'-rueckweg','zurueckAm',v_jetzt,
   'aktivierungsSHA256',pg_temp.breg_hash(altq),'nachDigest',pg_temp.breg_hash(nach),'go',p.freigabe);
  insert into public.helmut_store(id,data) values(key||'-rueckweg',q);
  insert into breg_ausgabe values(q);
 end if;
end $breg$;
select data from breg_ausgabe;
commit;

