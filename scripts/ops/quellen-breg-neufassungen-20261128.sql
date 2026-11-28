-- BESTANDSOPERATOR28, KEINE Migration. Standard ist reine Vorschau.
-- Zwei exakt gebundene amtliche27.11.-Fassungen; 8 KO-Versionen/155 Kanten.
-- Sechs exakt bekannte abgelaufene CAS sind NICHT die sieben Geldbindungen.
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
begin isolation level read committed;
set local time zone 'UTC';
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table breg_parameter on commit drop as
 select :'modus'::text modus, :'bindung'::jsonb bindung, :'go'::jsonb freigabe;
create temporary table breg_ausgabe(data jsonb) on commit drop;
create function pg_temp.breg_fordere(ok boolean,grund text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'breg-neufassungen: %',grund;end if;end $$;
create function pg_temp.breg_hash(j jsonb) returns text language sql immutable as $$
 select encode(sha256(convert_to(public.helmut_quellenfassung_json(j),'UTF8')),'hex') $$;
create function pg_temp.breg_stand(d jsonb) returns text language sql immutable as $$
 select pg_temp.breg_hash(jsonb_build_array(d->'id',d->'url',d->'canonical_url',d->'title',d->'summary',
 case when d->>'published_at' is null then null else
 to_char((d->>'published_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,d->'source_name',d->'raw')) $$;
create function pg_temp.breg_pins() returns jsonb language sql immutable as $$
 select '{"roh":"11f210abe771cdcc19bda10a3a0ee28b07ffae021a94cb6478240290909f9572","kos":"08db9f7d144232eeef794d03f5a5f19bbcc1e05ca64fc8574b37173195a7b23f","kanten":"3d68d219bbb075620a786f50bcc87ffadde4247e48f743827a70d99528c06ea7","rawIds":"f06fbd003513e784226879654861c99d4c957af8fcbe946e31da55b32eec1d2b","zielKanten":"6819185745a5e3be42281b03be59c16cf4a9f987ab424ee238f7d11cd1028aa1","archive":"e592eb5b6dd53701afe4cebcb6eb8cbf75f683479b483edf040bc14ce18e8252","findings":"799fdce2f011a6b3904716f9e3c56f805f4cdbede0fa7fd68edc88084c952fcc"}'::jsonb $$;
create function pg_temp.breg_kos() returns text[] language sql immutable as $$
 select array['ko-vg-bundesregierung-20250214-99d246','ko-vg-bundestag-20260706-471792','ko-vg-bundestag-20260902-5c7905','ko-vg-bundestag-20260907-7f5511','ko-vg-bundestag-20260908-1f3c5c','ko-vg-bundestag-20260908-774a55','ko-vg-bundestag-20260908-f28fbd','ko-vg-wirtschaft-20260423-351f14'] $$;
create function pg_temp.breg_ziele() returns jsonb language sql immutable as $$
 select '[{"raw":"rd-ae70b6b4d33681010ddad490ad590ef97e57fdc5e5d7deb5b18aed704442f419","alt":"35259c74f38dfcf170a2acfe62cd7778c3dad38a332f87b7bc93374ace2db8c6","neu":"5898b3a8f99b9c6c5c3c5345d2a8a8f09d190a2855b63c2a14a0baf588022da1","url":"https://www.bundesregierung.de/breg-de/aktuelles/zuckergetraenkesteuer-2457018","canonical":"https://bundesregierung.de/breg-de/aktuelles/zuckergetraenkesteuer-2457018","titel":"Zuckergetränkesteuer soll Gesundheitssystem entlasten","publikation":"2026-11-27T13:51:00.000Z"},{"raw":"rd-c66a3f3dbbd3cfdb5840e8c4c05c967568b08bbdb7337d04d7a00a69dfbe89ed","alt":"b7281f43c377e8c083925d6e92ae51a6afa2f6600b1df6ceb481cab831c5e0b5","neu":"77b6d776a4cad0d4e7a54c48fa17dc9fdbfcdb1729d521b421b91a5bc47ef74a","url":"https://www.bundesregierung.de/breg-de/aktuelles/bundeshaushalt-2027-2446026","canonical":"https://bundesregierung.de/breg-de/aktuelles/bundeshaushalt-2027-2446026","titel":"Etat im Zeichen von Wohlstand und Sicherheit","publikation":"2026-11-27T11:45:00.000Z"}]'::jsonb $$;
create function pg_temp.breg_kostaende() returns jsonb language sql immutable as $$
 select '[{"id":"ko-vg-bundesregierung-20250214-99d246","version":5,"status":"complete","fencing":5,"kanten":13},{"id":"ko-vg-bundestag-20260706-471792","version":1,"status":"complete","fencing":1,"kanten":20},{"id":"ko-vg-bundestag-20260902-5c7905","version":1,"status":"failed","fencing":null,"kanten":60},{"id":"ko-vg-bundestag-20260907-7f5511","version":1,"status":"pending","fencing":null,"kanten":13},{"id":"ko-vg-bundestag-20260908-1f3c5c","version":1,"status":"pending","fencing":null,"kanten":11},{"id":"ko-vg-bundestag-20260908-774a55","version":1,"status":"pending","fencing":null,"kanten":10},{"id":"ko-vg-bundestag-20260908-f28fbd","version":1,"status":"complete","fencing":1,"kanten":17},{"id":"ko-vg-wirtschaft-20260423-351f14","version":1,"status":"pending","fencing":null,"kanten":11}]'::jsonb $$;
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
 roh as(select r.* from public.raw_documents r where id in(select raw_document_id from kanten)
  or id in(select z->>'raw' from jsonb_array_elements(pg_temp.breg_ziele()) z))
 select jsonb_build_object(
 'roh',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from roh r),
 'kos',(select coalesce(jsonb_agg(to_jsonb(k) order by id),'[]') from public.knowledge_objects k where id=any(pg_temp.breg_kos())),
 'kanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id,raw_document_id),'[]') from kanten l),
 'zielKanten',(select coalesce(jsonb_agg(to_jsonb(l) order by knowledge_object_id,raw_document_id),'[]') from public.ko_document_links l
   where raw_document_id in(select z->>'raw' from jsonb_array_elements(pg_temp.breg_ziele()) z)),
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
    where id not like '%-rohstand-%' and id not like 'main-operator-breg-neufassungen-20261128%') zeilen)
 )) $$;
-- Historische Vollzeilenanker bleiben feste Untermenge. Regulare Nachtraege
-- werden im frischen Gesamtsnapshot gebunden und niemals hier ausgefiltert.
create function pg_temp.breg_anker() returns jsonb language sql immutable as $$
 select '{"archive":["1b9978f551e1a6cc343bbffbff80158529431f80302f36772ff12b0b3978fe8b","312ce3a1e4699747cce7aaf8acd20d45d6192e12995956d0bbfa7d16d8d502aa","4fc203bc2bb0a5471ab4a4caf5b6a08e853b085829c646c14ee114fb27123e0b","5230582bdf37733d094a0c827fd401f581f68c8bbb1802e4e671cb4fb59fa08a","59b4f87c7f681b9bd3bfef67415f3b6985fb81e925357240bc5a15306243fffc","63c98beae3e3598430bde8444123336d1b2ae40518fd111bba89cb51191a7a87","67f65c8ebce4cd06c94d6f90a94366a79c1e6b7e9e468994fb47aec044831370","721a4bc540961921bdeac71fa6c764e66d9d5cf860622bf7c199a90cca32fc3a","8bc9a34fc0e2b072bc0a6be13a9ff6850dfc3540ab6afd2b45022343076facc1","a6c4fd461e51a8ac450ada0756bdf1c6d4f9ce199a96353a7cef776f877bfe81","a8363f606ed5e5ab6f74149d39edfc5e4122e44b4396358823f66f780e1be55e","b21a995a604e76028cb196cf1e2848d798ca7d43c8e42f3554865d122bd0a8b9","bcade632a1931a579f9108bb4630ec7984e7021d6e0afa550f99721019fd4a26","bea3c34294ff17e6f2ca8d22210c2cf0f0b07660d59e8e93631169fcedefeaf9","c67c313bbc4fa6a80faa508bd8aebae18aa8ded8e1e0ce801806df0c655f47b3","e4088a56a6ec2eade991affcd80e98dea4ff1e27bf155c45db9f913cae2639b6","f1422a83fae5453d754c2362b3ed7d564f6aacfd7d9521c4e18ad9fff388571f","f75567e09dfcfbbfe0d32d100ceea68bc90cac3085e53e2255c9d3bc3f6ec30a","fbe6ef84520a680baab94e6342496bce8c3132201a70463220a842e6be6917d8"]}'::jsonb $$;
create function pg_temp.breg_pruefeanker(zeilen jsonb,anker jsonb,art text) returns void language plpgsql stable as $$
declare ok boolean;
begin
 perform pg_temp.breg_fordere(jsonb_typeof(zeilen)='array','Originalanker '||art);
 with vollhashs as materialized(select pg_temp.breg_hash(z) h from jsonb_array_elements(zeilen) z),
 vorhanden as(select h,count(*) n from vollhashs group by h),
 erforderlich as(select h,count(*) n from jsonb_array_elements_text(anker) h group by h)
 select not exists(select 1 from erforderlich e left join vorhanden v using(h) where coalesce(v.n,0)<e.n) into ok;
 perform pg_temp.breg_fordere(ok,'unveraenderte Originalanker '||art);
end $$;
create function pg_temp.breg_plan(s jsonb) returns jsonb language plpgsql stable as $$
declare p jsonb:=pg_temp.breg_pins();r jsonb;a jsonb;d jsonb;k jsonb;l jsonb;z jsonb;erwartung jsonb;gruppe jsonb;
 neu jsonb:='[]';bindungen jsonb:='[]';promotionen jsonb:='[]';alle jsonb:='{}';stand text;aid text;sha text;n int;alt jsonb;nach jsonb;
begin
 foreach stand in array array['roh','kos','kanten','zielKanten','findings'] loop
  perform pg_temp.breg_fordere(pg_temp.breg_hash(s->stand)=p->>stand,'fester Originalbestand '||stand);
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(s->'roh')=110 and jsonb_array_length(s->'kos')=8
  and jsonb_array_length(s->'kanten')=155 and jsonb_array_length(s->'archive')>=19
  and s->'bindungen'='[]'::jsonb,'Bestand110/8/155 ohne Vorbindung');
 perform pg_temp.breg_fordere(pg_temp.breg_hash((select jsonb_agg(e->'id' order by e->>'id' collate "C")
  from jsonb_array_elements(s->'roh') e))=p->>'rawIds','feste RawIDs');
 perform pg_temp.breg_pruefeanker(s->'archive',pg_temp.breg_anker()->'archive','archive');
 perform pg_temp.breg_fordere((select count(*)=count(distinct e->>'id') from jsonb_array_elements(s->'archive') e)
  and not exists(select 1 from jsonb_array_elements(s->'findings') f where not exists(
   select 1 from jsonb_array_elements(s->'roh') rr where rr->>'id'=f->>'raw_document_id')),
  'eindeutige Archive und feste Findings-Identitaeten');
 for a in select value from jsonb_array_elements(s->'archive') loop
  d:=public.helmut_quellenfassung_dokument(a->'data'->'dokument'->>'id',a->>'id',pg_temp.breg_hash(a->'data'),a->'data');
  select value into r from jsonb_array_elements(s->'roh') rr where rr->>'id'=d->>'id';
  perform pg_temp.breg_fordere(r is not null
   and (select array_agg(ak order by ak) from jsonb_object_keys(a->'data') ak)=array['dokument','quellenHash','version']
   and not d ? 'helmutQuellenfassung','Archivschema/RawID/Standhash');
  if not (pg_temp.breg_anker()->'archive') ? pg_temp.breg_hash(a) then
   perform pg_temp.breg_fordere(d->'url'=r->'url' and d->'canonical_url'=r->'canonical_url'
    and jsonb_build_array(d->'source_id',d->'source_name',d->'source_type',d->'link_type',d->'publisher_id',
     d->'raw'->'retrievalPathId',d->'raw'->'sourcePriority',d->'raw'->'originalUrl')
     =jsonb_build_array(r->'source_id',r->'source_name',r->'source_type',r->'link_type',r->'publisher_id',
     r->'raw'->'retrievalPathId',r->'raw'->'sourcePriority',r->'raw'->'originalUrl'),
    'zusaetzliches Archiv mit gleicher Quellenautoritaet');
  end if;
 end loop;
 for erwartung in select value from jsonb_array_elements(pg_temp.breg_kostaende()) loop
  select value into k from jsonb_array_elements(s->'kos') e where e->>'id'=erwartung->>'id';
  perform pg_temp.breg_fordere(k is not null and k->'ko_version'=erwartung->'version'
   and k->'understanding_status'=erwartung->'status' and k->'verstehen_fencing'=erwartung->'fencing'
   and (select count(*) from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id')=(erwartung->>'kanten')::int,
   'vollstaendige vorhandene KO-Versionen ohne Statuskorrektur');
 end loop;
 for r in select value from jsonb_array_elements(s->'roh') loop
  stand:=pg_temp.breg_stand(r);aid:='main-rohstand-'||substring(r->>'id' from 4)||'-'||stand;
  select value into a from jsonb_array_elements(s->'archive') where value->>'id'=aid;
  if a is not null then
   d:=public.helmut_quellenfassung_dokument(r->>'id',aid,pg_temp.breg_hash(a->'data'),a->'data');
   perform pg_temp.breg_fordere(to_jsonb(jsonb_populate_record(null::public.raw_documents,d))=r,'bestehender Archivkonflikt');
  else
   a:=jsonb_build_object('id',aid,'data',jsonb_build_object('version',1,'quellenHash',stand,'dokument',r));
   neu:=neu||jsonb_build_array(a);
  end if;
  alle:=alle||jsonb_build_object(r->>'id',jsonb_build_object('raw_source_version_id',aid,'raw_source_version_sha256',pg_temp.breg_hash(a->'data')));
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(neu)<=103,'hoechstens103 fehlende Bestandssnapshots');
 for k in select value from jsonb_array_elements(s->'kos') loop
  select jsonb_agg(jsonb_build_object('raw_document_id',e->>'raw_document_id',
   'raw_source_version_id',alle->(e->>'raw_document_id')->>'raw_source_version_id',
   'raw_source_version_sha256',alle->(e->>'raw_document_id')->>'raw_source_version_sha256')
   order by e->>'raw_document_id' collate "C") into gruppe from jsonb_array_elements(s->'kanten') e where e->>'knowledge_object_id'=k->>'id';
  sha:=pg_temp.breg_hash(gruppe);n:=jsonb_array_length(gruppe);
  for l in select value from jsonb_array_elements(gruppe) loop
   bindungen:=bindungen||jsonb_build_array(l||jsonb_build_object('knowledge_object_id',k->>'id','ko_version',k->'ko_version','quellen_count',n,'manifest_sha256',sha));
  end loop;
 end loop;
 for z in select value from jsonb_array_elements(pg_temp.breg_ziele()) loop
  select raw_item.value into alt from jsonb_array_elements(s->'roh') raw_item where raw_item.value->>'id'=z->>'raw';
  aid:='main-rohstand-'||substring(z->>'raw' from 4)||'-'||(z->>'neu');
  select value->'data' into a from jsonb_array_elements(s->'archive') e where e->>'id'=aid;
  d:=public.helmut_quellenfassung_dokument(z->>'raw',aid,pg_temp.breg_hash(a),a);
  perform pg_temp.breg_fordere(pg_temp.breg_stand(alt)=z->>'alt' and pg_temp.breg_stand(d)=z->>'neu'
   and d->>'source_id'='bundesregierung' and d->>'source_name'='Bundesregierung' and d->>'source_type'='ministry'
   and d->>'link_type'='direct' and d->'raw'->>'retrievalPathId'='rp-bundesregierung' and length(trim(d->>'summary'))>0
   and d->'url'=z->'url' and d->'canonical_url'=z->'canonical' and alt->'url'=z->'url' and alt->'canonical_url'=z->'canonical'
   and d->'title'=z->'titel' and d->'published_at'=z->'publikation'
   and d->>'url' ~ '^https://www\.bundesregierung\.de/breg-de/aktuelles/[^?#]+$',
   'exakte amtliche Alt-/Neufassung derselben direkten Quelle');
  nach:=alt||jsonb_build_object('title',d->'title','source_id',d->'source_id','source_name',d->'source_name','source_type',d->'source_type',
   'published_at',d->'published_at','summary',d->'summary','retrieved_at',d->'retrieved_at','raw',d->'raw','content_fingerprint',null);
  nach:=to_jsonb(jsonb_populate_record(null::public.raw_documents,nach));
  perform pg_temp.breg_fordere(pg_temp.breg_stand(nach)=z->>'neu','Promotionsfelder');
  promotionen:=promotionen||jsonb_build_array(jsonb_build_object('alt',alt,'nach',nach));
 end loop;
 perform pg_temp.breg_fordere(jsonb_array_length(promotionen)=2 and jsonb_array_length(bindungen)=155,'exakt155 Bindungen und zwei Promotionen');
 return jsonb_build_object('neueArchive',neu,'bindungen',bindungen,'promotionen',promotionen,
  'anzahl',jsonb_build_object('vorarchive',jsonb_array_length(s->'archive'),'neueArchive',jsonb_array_length(neu),
   'findings',jsonb_array_length(s->'findings'),'bindungen',155,'promotionen',2));
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
 perform pg_temp.breg_fordere(jsonb_array_length(w->'aktiveCas')=6
  and pg_temp.breg_hash(w->'aktiveCas')='749b4607fa96cc192b3633ebaf8aca1debf61411065d8c0f0055a7588a2e7b34'
  and not exists(select 1 from jsonb_array_elements(w->'aktiveCas') c where
   (c->>'zustand' in('reserviert','modell-laeuft') and length(c->>'besitzer')>0
    and (c->>'lease_bis')::timestamptz<jetzt) is not true),
  'nur exakt sechs bekannte abgelaufene CAS; sieben Geldbindungen bleiben unveraendert');
 perform pg_temp.breg_fordere(pg_temp.breg_hash(buch)='9bc11b140211e2d9be9ef3381c0baf23dd4c08cf82f9b52db2c8074ad525b6ad' and buch->'bound'='11047633'::jsonb,'exaktes unveraendertes Kostenbuch');
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
 perform pg_temp.breg_fordere(g->'approved'='true'::jsonb and g->>'scope'='BREG-NEUFASSUNGEN-20261128'
  and g->>'einmalKey'='main-operator-breg-neufassungen-20261128' and g->>'aktion'=aktion and g->>'digest'=digest and g->>'codeCommit' ~ '^[a-f0-9]{40}$'
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


-- Alle relevanten Schreibsperren in einem abgeschlossenen Statement erwerben.
-- READ COMMITTED gibt dem FOLGENDEN DO einen neuen Snapshot nach den Locks.
-- Ein vor Lock-Erwerb committteter Claim/Quotenwrite muss sichtbar sein.
-- Vorschau bleibt ohne globale Schreibsperren; Aktivierung liest danach atomar.
do $vorwertsperren$
declare m text;
begin
 select modus into strict m from breg_parameter;
 if m in('freigeben','rueckweg') then
  lock table public.raw_documents,public.knowledge_objects,public.ko_document_links,
   public.helmut_store,public.helmut_ko_quellenfassungen,public.document_findings,
   public.helmut_jobs,public.helmut_verstehen_reservierungen,public.helmut_verstehen_vormerkungen,
   public.llm_usage,public.llm_budget_counters,public.llm_reservations,
   public.helmut_anbieter_fenster,public.helmut_klassen_slots,public.pipeline_locks in share row exclusive mode;
 end if;
end $vorwertsperren$;

do $breg$
declare p record; v_jetzt timestamptz := pg_catalog.clock_timestamp(); vor jsonb; nach jsonb;
 plan jsonb; b jsonb; q jsonb; altq jsonb; x jsonb; promotion jsonb; rawrow public.raw_documents; textvor text; digest text; n int;
 key constant text:='main-operator-breg-neufassungen-20261128';
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
  perform 1 from public.raw_documents r where id in(select raw_document_id from public.ko_document_links
   where knowledge_object_id=any(pg_temp.breg_kos())) or r.id in(select z->>'raw' from jsonb_array_elements(pg_temp.breg_ziele()) z) order by id for update;
  perform 1 from public.ko_document_links where knowledge_object_id=any(pg_temp.breg_kos()) order by knowledge_object_id,raw_document_id for update;
  perform 1 from public.helmut_store where id='main-auth' or exists(select 1 from public.ko_document_links l
   where l.knowledge_object_id=any(pg_temp.breg_kos()) and helmut_store.id like 'main-rohstand-'||substring(l.raw_document_id from 4)||'-%')
   or exists(select 1 from jsonb_array_elements(pg_temp.breg_ziele()) z where helmut_store.id like 'main-rohstand-'||substring(z->>'raw' from 4)||'-%')
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
  perform pg_temp.breg_fordere(n=155 and (select count(*)=8 and bool_and(m.vollstaendig) from public.helmut_ko_quellenmanifeste m
   join public.knowledge_objects k on k.id=m.knowledge_object_id and k.ko_version=m.ko_version
   where m.knowledge_object_id=any(pg_temp.breg_kos())),'155 vollstaendige Bindungen fuer acht vorhandene KO-Versionen');
  -- Vor beiden Promotionen muessen alle acht Altleser ihre bisherigen Vollzeilen liefern.
  perform pg_temp.breg_fordere((select count(*)=155 from public.helmut_ko_quellen where knowledge_object_id=any(pg_temp.breg_kos()))
   and not exists(select 1 from public.helmut_ko_quellen q
   where q.knowledge_object_id=any(pg_temp.breg_kos()) and
   to_jsonb(jsonb_populate_record(null::public.raw_documents,public.helmut_quellenfassung_dokument(
     q.raw_document_id,q.raw_source_version_id,q.raw_source_version_sha256,q.source_archive)))
    is distinct from (select r from jsonb_array_elements(vor->'roh') r where r->>'id'=q.raw_document_id)),
  'historische Vollquellen unveraendert');
  for promotion in select value from jsonb_array_elements(plan->'promotionen') loop
   rawrow:=jsonb_populate_record(null::public.raw_documents,promotion->'nach');
   update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=null
    where r.id=rawrow.id and to_jsonb(r)=promotion->'alt';
   get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'je genau eine vorwertgebundene Rawpromotion');
  end loop;
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and nach->'zielKanten'=vor->'zielKanten' and jsonb_array_length(nach->'archive')=
     jsonb_array_length(vor->'archive')+jsonb_array_length(plan->'neueArchive')
    and jsonb_array_length(nach->'bindungen')=155
    and nach->'roh'=(select jsonb_agg(coalesce((select pr->'nach' from jsonb_array_elements(plan->'promotionen') pr
      where pr->'alt'->>'id'=r->>'id'),r) order by r->>'id' collate "C") from jsonb_array_elements(vor->'roh') r)
    and not exists(select 1 from jsonb_array_elements(vor->'archive') a where not nach->'archive' @> jsonb_build_array(a)),
   'nur fehlende Archive+155+2 und bitgleiche Finanzen/KOs/Jobs/Journale/Findings/Rechte');
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
  for promotion in select value from jsonb_array_elements(plan->'promotionen') loop
   perform pg_temp.breg_fordere((select r from jsonb_array_elements(vor->'roh') r where r->>'id'=promotion->'nach'->>'id')=promotion->'nach',
    'exakte promovierte Vorfassung');
   rawrow:=jsonb_populate_record(null::public.raw_documents,promotion->'alt');
   update public.raw_documents r set title=rawrow.title,source_id=rawrow.source_id,source_name=rawrow.source_name,
    source_type=rawrow.source_type,published_at=rawrow.published_at,summary=rawrow.summary,
    retrieved_at=rawrow.retrieved_at,raw=rawrow.raw,content_fingerprint=rawrow.content_fingerprint
    where r.id=rawrow.id and to_jsonb(r)=promotion->'nach';
   get diagnostics n=row_count;perform pg_temp.breg_fordere(n=1,'Rueckweg je genau eine Rawzeile');
  end loop;
  delete from public.helmut_ko_quellenfassungen f where knowledge_object_id=any(pg_temp.breg_kos())
    and exists(select 1 from jsonb_array_elements(altq->'bindungen') eb where to_jsonb(f)=eb.value);
  get diagnostics n=row_count;perform pg_temp.breg_fordere(n=155,'Rueckweg genau155 quittierte Bindungen');
  nach:=pg_temp.breg_snapshot(v_jetzt);
  perform pg_temp.breg_fordere(nach->'archive'=vor->'archive' and nach->'bindungen'='[]'::jsonb
    and nach->'sicherung'=vor->'sicherung' and nach->'rechte'=vor->'rechte'
    and nach->'kos'=vor->'kos' and nach->'kanten'=vor->'kanten' and nach->'findings'=vor->'findings'
    and pg_temp.breg_hash(nach->'roh')=pg_temp.breg_pins()->>'roh','Rueckweg;alle Archive/Finanzen/Historie bleiben erhalten');
  q:=jsonb_build_object('version',1,'modus','zurueckgenommen','id',key||'-rueckweg','zurueckAm',v_jetzt,
   'aktivierungsSHA256',pg_temp.breg_hash(altq),'nachDigest',pg_temp.breg_hash(nach),'go',p.freigabe);
  insert into public.helmut_store(id,data) values(key||'-rueckweg',q);
  insert into breg_ausgabe values(q);
 end if;
end $breg$;
select data from breg_ausgabe;
commit;
