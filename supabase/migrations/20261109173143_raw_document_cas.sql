-- Vorbereitet, NICHT auf Production angewendet.
-- Volltexte und JSON-Vorwerte gehoeren in einen RPC-POST, nicht in eine URL.
-- Rueckweg: rollback_20261109173143_raw_document_cas.sql (keine Datenloeschung).
begin;
do $$ begin
  if to_regclass('public.raw_documents') is null then
    raise exception 'raw-document-cas: raw_documents fehlt';
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
commit;
