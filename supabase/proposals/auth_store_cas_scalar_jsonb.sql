-- INERT PROPOSAL. Apply only after separate controlled integration approval.
BEGIN;
-- Local candidate only. No production application or migration is authorized.
-- A single UNNAMED jsonb argument lets PostgREST12 pass the body directly,
-- avoiding its materialized json_to_record Function Scan for the large value.
create function public.helmut_auth_store_cas_v1(jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_id text;
  v_expected text;
  v_data jsonb;
  v_next text;
  v_result jsonb;
begin
  if jsonb_typeof($1) is distinct from 'object'
    or not ($1 ? 'id' and $1 ? 'expectedRevision' and $1 ? 'data')
    or (select count(*) from jsonb_object_keys($1)) <> 3
    or jsonb_typeof($1->'id') is distinct from 'string'
    or length($1->>'id') not between 1 and 256
    or jsonb_typeof($1->'expectedRevision') not in ('string','null')
    or (jsonb_typeof($1->'expectedRevision')='string'
        and ($1->>'expectedRevision') !~ '^[a-fA-F0-9-]{36}$')
  then
    raise exception 'auth-store-cas-invalid-input' using errcode='22023';
  end if;
  v_id := $1->>'id';
  v_expected := $1->>'expectedRevision';
  v_data := $1->'data';
  v_next := v_data->>'_authStoreRevision';
  if jsonb_typeof(v_data) is distinct from 'object'
    or jsonb_typeof(v_data->'_authStoreRevision') is distinct from 'string'
    or v_next !~ '^[a-fA-F0-9-]{36}$'
    or v_next is not distinct from v_expected
  then
    raise exception 'auth-store-cas-invalid-input' using errcode='22023';
  end if;
  with changed as (
    update public.helmut_store
       set data = v_data
     where id = v_id
       and (data->>'_authStoreRevision') is not distinct from v_expected
    returning id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id)), '[]'::jsonb)
    into v_result from changed;
  return v_result;
end;
$function$;
revoke all on function public.helmut_auth_store_cas_v1(jsonb) from public;
grant execute on function public.helmut_auth_store_cas_v1(jsonb) to service_role;

COMMIT;
