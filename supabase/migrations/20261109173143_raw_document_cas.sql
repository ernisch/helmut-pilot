-- Vorbereitet, NICHT auf Production angewendet.
-- Volltexte und JSON-Vorwerte gehoeren in einen RPC-POST, nicht in eine URL.
-- Rueckweg: rollback_20261109173143_raw_document_cas.sql (keine Datenloeschung).
begin;
do $$ begin
  if to_regclass('public.raw_documents') is null or to_regclass('public.helmut_store') is null then
    raise exception 'raw-document-cas: raw_documents/helmut_store fehlt';
  end if;
end $$;

create or replace function public.helmut_raw_document_cas(
  p_id text, p_expected jsonb, p_next jsonb
) returns table(id text, uebernommen boolean)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  k text;
  n integer;
  next_retrieved timestamptz;
begin
  if p_id is null or length(p_id) not between 1 and 200 or btrim(p_id) = ''
    or jsonb_typeof(p_expected) is distinct from 'object'
    or jsonb_typeof(p_next) is distinct from 'object'
  then raise exception using errcode='22023', message='raw-document-cas: argumente'; end if;

  if (select array_agg(x order by x) from jsonb_object_keys(p_expected) x)
    is distinct from array['canonical_url','published_at','raw','retrieved_at',
      'source_id','source_name','summary','title','url']::text[]
    or not (p_next ? 'summary')
    or exists(select 1 from jsonb_object_keys(p_next) x where x not in ('summary','retrieved_at'))
    or jsonb_typeof(p_next->'summary') is distinct from 'string'
    or btrim(p_next->>'summary') = '' or octet_length(p_next->>'summary') > 1048576
  then raise exception using errcode='22023', message='raw-document-cas: feldvertrag'; end if;

  foreach k in array array['canonical_url','published_at','retrieved_at',
    'source_id','source_name','summary','title','url']::text[] loop
    if jsonb_typeof(p_expected->k) not in ('string','null') then
      raise exception using errcode='22023', message='raw-document-cas: vorwerttyp';
    end if;
  end loop;
  if jsonb_typeof(p_expected->'raw') not in ('object','null') then
    raise exception using errcode='22023', message='raw-document-cas: rohvorwerttyp';
  end if;
  if p_next ? 'retrieved_at' then
    if jsonb_typeof(p_next->'retrieved_at') is distinct from 'string'
      or (p_next->>'retrieved_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.[0-9]+)?(Z|[+-]\d{2}:\d{2})$'
    then raise exception using errcode='22023', message='raw-document-cas: abrufzeit'; end if;
    next_retrieved := (p_next->>'retrieved_at')::timestamptz;
    if next_retrieved < (p_expected->>'retrieved_at')::timestamptz then
      raise exception using errcode='22023', message='raw-document-cas: abrufzeit-rueckgang';
    end if;
  end if;

  -- Ein einzelner atomarer UPDATE. Keine zweite Lese-Schreib-Luecke und keine
  -- dynamischen Spaltennamen; Identitaet/Herkunft/Publikation bleiben erhalten.
  update public.raw_documents as r
    set summary = p_next->>'summary',
        retrieved_at = case when p_next ? 'retrieved_at' then next_retrieved else r.retrieved_at end
    where r.id = p_id
      and r.url is not distinct from p_expected->>'url'
      and r.canonical_url is not distinct from p_expected->>'canonical_url'
      and r.title is not distinct from p_expected->>'title'
      and r.source_id is not distinct from p_expected->>'source_id'
      and r.source_name is not distinct from p_expected->>'source_name'
      and r.published_at is not distinct from (p_expected->>'published_at')::timestamptz
      and r.retrieved_at is not distinct from (p_expected->>'retrieved_at')::timestamptz
      and r.summary is not distinct from p_expected->>'summary'
      and r.raw is not distinct from nullif(p_expected->'raw', 'null'::jsonb);
  get diagnostics n = row_count;
  return query select p_id, n = 1;
end;
$$;

revoke all on function public.helmut_raw_document_cas(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.helmut_raw_document_cas(text,jsonb,jsonb) to service_role;
comment on function public.helmut_raw_document_cas(text,jsonb,jsonb) is
  'Service-only exact raw-document CAS; summary and optional monotone retrieved_at only. No source identity change.';

-- Der Cursor braucht denselben POST-Transport: bis1MiB unveraenderlicher Plan
-- darf weder im URL-Filter stehen noch durch einen kleineren Hash-CAS ersetzt werden.
-- Text bewahrt die clientseitig gepruefte kompakte UTF8-Groesse exakt; erst danach
-- wird einmal JSONB gelesen. Der Vergleich bleibt strukturell vollstaendig.
create or replace function public.helmut_quellenplan_cursor_cas(
  p_id text, p_expected text, p_next_cursor integer
) returns table(id text, uebernommen boolean)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  expected jsonb;
  store_id text;
  plan_tag text;
  current_cursor integer;
  job_count integer;
  n integer;
begin
  if p_id is null or p_id !~ '^[a-zA-Z0-9_-]{1,100}-quellenplan-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_expected is null or octet_length(p_expected) not between 1 and 1048576
    or p_next_cursor is null
  then raise exception using errcode='22023', message='quellenplan-cas: argumente'; end if;
  store_id := left(p_id,length(p_id)-length('-quellenplan-')-10);
  if strpos(store_id,'-p-') > 0 then
    raise exception using errcode='22023', message='quellenplan-cas: kein-globaler-store';
  end if;
  expected := p_expected::jsonb;
  if jsonb_typeof(expected) is distinct from 'object' then
    raise exception using errcode='22023', message='quellenplan-cas: manifesttyp';
  end if;
  if (select array_agg(x order by x) from jsonb_object_keys(expected) x)
    is distinct from array['auftraege','cursor','manifestHash','tag','tagesplan','version','zustand']::text[]
    or expected->'version' is distinct from '1'::jsonb
    or jsonb_typeof(expected->'tag') is distinct from 'string'
    or (expected->>'tag') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(expected->'auftraege') is distinct from 'array'
    or jsonb_typeof(expected->'cursor') is distinct from 'number'
    or (expected->>'cursor') !~ '^(0|[1-9][0-9]{0,8})$'
    or jsonb_typeof(expected->'manifestHash') is distinct from 'string'
    or (expected->>'manifestHash') !~ '^[a-f0-9]{64}$'
  then raise exception using errcode='22023', message='quellenplan-cas: feldvertrag'; end if;
  plan_tag := expected->>'tag';
  if right(p_id,10) <> plan_tag or to_char(plan_tag::date,'YYYY-MM-DD') <> plan_tag then
    raise exception using errcode='22023', message='quellenplan-cas: tagbindung';
  end if;
  if exists(select 1 from jsonb_array_elements(expected->'auftraege') j
      where jsonb_typeof(j) is distinct from 'object'
        or jsonb_typeof(j->'idempotencyKey') is distinct from 'string'
        or j->>'idempotencyKey' = '')
    or (select count(*) from jsonb_array_elements(expected->'auftraege')) <>
      (select count(distinct j->>'idempotencyKey') from jsonb_array_elements(expected->'auftraege') j)
  then raise exception using errcode='22023', message='quellenplan-cas: auftraege'; end if;
  job_count := jsonb_array_length(expected->'auftraege');
  current_cursor := (expected->>'cursor')::integer;
  if current_cursor > job_count or p_next_cursor <> current_cursor+1 or p_next_cursor > job_count
    or expected->>'zustand' is distinct from (case when current_cursor=job_count then 'fertig' else 'offen' end)
  then raise exception using errcode='22023', message='quellenplan-cas: cursor-sprung'; end if;

  -- Das Manifest ist absichtlich kein Updateparameter. Selbst bei parallelen
  -- Schreibern wird nur ein exakt passender voller Vorwert um einen Schritt bewegt.
  update public.helmut_store as s
    set data = jsonb_set(jsonb_set(s.data,'{cursor}',to_jsonb(p_next_cursor),false),
      '{zustand}',to_jsonb(case when p_next_cursor=job_count then 'fertig'::text else 'offen'::text end),false)
    where s.id=p_id and s.data=expected;
  get diagnostics n = row_count;
  return query select p_id,n=1;
end;
$$;
revoke all on function public.helmut_quellenplan_cursor_cas(text,text,integer) from public,anon,authenticated;
grant execute on function public.helmut_quellenplan_cursor_cas(text,text,integer) to service_role;
comment on function public.helmut_quellenplan_cursor_cas(text,text,integer) is
  'Service-only full-manifest CAS, compact JSON <=1MiB; global daily plan cursor +1 only, no manifest replacement.';
commit;
