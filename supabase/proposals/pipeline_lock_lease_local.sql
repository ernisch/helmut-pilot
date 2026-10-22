-- Explicitly isolated fixture installation, never a Production migration.
-- Existing 20260719 function bodies; invocation ownership is in the local client.
-- This file grants no execution authority. Its caller must bind the real working
-- copy, case, source/SQL hashes, original auth witness and capacity before use.
begin read write;
do $local_lease_guard$
declare
  p oid;
  fn_count integer;
begin
  if current_user <> 'postgres' or inet_server_addr() is not null
    or current_database() !~ '^helmut_resource_fixture_[0-9]{8}_[a-f0-9]{12}$'
    or pg_is_in_recovery()
    or current_setting('helmut.local_usage_experiment', true) is distinct from 'on'
    or current_setting('helmut.local_pipeline_lock_mode', true) is distinct from 'invocation-lease-v1'
    or current_setting('server_version_num') <> '170006'
    or current_setting('transaction_read_only') <> 'off' then
    raise exception 'LOCAL_PIPELINE_LEASE_ISOLATED_FIXTURE_REQUIRED';
  end if;
  if to_regclass('public.pipeline_locks') is null
    or not exists(select 1 from pg_class c where c.oid='public.pipeline_locks'::regclass
      and c.relkind='r' and c.relpersistence='p' and c.relowner='postgres'::regrole)
    or not exists(select 1 from pg_constraint c where c.conrelid='public.pipeline_locks'::regclass
      and c.contype='p' and c.conkey=array[(select attnum from pg_attribute
        where attrelid=c.conrelid and attname='job_name' and not attisdropped)]::smallint[])
    or (select count(*) from pg_attribute a where a.attrelid='public.pipeline_locks'::regclass
      and not a.attisdropped and ((a.attname='job_name' and a.atttypid='text'::regtype and a.attnotnull)
        or (a.attname in('locked_at','expires_at') and a.atttypid='timestamptz'::regtype))) <> 3
    or exists(select 1 from pg_attribute a where a.attrelid='public.pipeline_locks'::regclass
      and not a.attisdropped and a.attname='token' and a.atttypid<>'text'::regtype)
    or not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls and not rolsuper)
    or to_regrole('anon') is null or to_regrole('authenticated') is null then
    raise exception 'LOCAL_PIPELINE_LEASE_TABLE_OR_ROLES_INVALID';
  end if;
  -- Only an isolated quiescent table may change schema/ACL. No row is deleted.
  lock table public.pipeline_locks in access exclusive mode nowait;
  if exists(select 1 from public.pipeline_locks) then
    raise exception 'LOCAL_PIPELINE_LEASE_TABLE_NOT_EMPTY';
  end if;
  select count(*) into fn_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('helmut_acquire_pipeline_lock','helmut_release_pipeline_lock');
  if fn_count not in(0,2) then raise exception 'LOCAL_PIPELINE_LEASE_UNEXPECTED_OVERLOAD'; end if;
  if fn_count=2 then
    for p in select x from unnest(array[to_regprocedure('public.helmut_acquire_pipeline_lock(text,bigint)'),
      to_regprocedure('public.helmut_release_pipeline_lock(text,text)')]) x loop
      if p is null or not exists(select 1 from pg_proc f where f.oid=p and not f.prosecdef
        and f.proowner='postgres'::regrole and f.provolatile='v' and
        encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') = case
          when p=to_regprocedure('public.helmut_acquire_pipeline_lock(text,bigint)')
          then '498d2956e0ee1c0550a1a35ddc0c88c994e5041cf661a72ba186ee559ebccf22'
          else '79effa3ded7202567993c64ed45b1871796d10f0f082e8b0fefd3494ff0c135f' end) then
        raise exception 'LOCAL_PIPELINE_LEASE_EXISTING_FUNCTION_DRIFT';
      end if;
    end loop;
  end if;
end
$local_lease_guard$;
alter table public.pipeline_locks add column if not exists token text;
create or replace function public.helmut_acquire_pipeline_lock(p_job text, p_ttl_ms bigint)
returns table(acquired boolean, token text)
language plpgsql
as $$
declare
  v_token  text := gen_random_uuid()::text;
  v_now    timestamptz := now();
  v_result text;
begin
  insert into public.pipeline_locks as l (job_name, locked_at, expires_at, token)
  values (p_job, v_now, v_now + (p_ttl_ms * interval '1 millisecond'), v_token)
  on conflict (job_name) do update
    set locked_at = v_now, expires_at = v_now + (p_ttl_ms * interval '1 millisecond'), token = v_token
    where l.expires_at < v_now          -- nur uebernehmen, wenn der Alt-Lock abgelaufen ist
  returning l.token into v_result;

  if v_result = v_token then
    return query select true, v_token;
  else
    return query select false, null::text;   -- Zeile existiert und ist noch gueltig -> abgelehnt
  end if;
end;
$$;
create or replace function public.helmut_release_pipeline_lock(p_job text, p_token text)
returns boolean
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.pipeline_locks where job_name = p_job and token = p_token;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

alter function public.helmut_acquire_pipeline_lock(text,bigint) security invoker;
alter function public.helmut_release_pipeline_lock(text,text) security invoker;
alter function public.helmut_acquire_pipeline_lock(text,bigint) set search_path = pg_catalog, public;
alter function public.helmut_release_pipeline_lock(text,text) set search_path = pg_catalog, public;
revoke all on function public.helmut_acquire_pipeline_lock(text,bigint) from public, anon, authenticated;
revoke all on function public.helmut_release_pipeline_lock(text,text) from public, anon, authenticated;
revoke all on table public.pipeline_locks from public, anon, authenticated;
revoke all on function public.helmut_acquire_pipeline_lock(text,bigint) from service_role;
revoke all on function public.helmut_release_pipeline_lock(text,text) from service_role;
revoke all on table public.pipeline_locks from service_role;
grant execute on function public.helmut_acquire_pipeline_lock(text,bigint) to service_role;
grant execute on function public.helmut_release_pipeline_lock(text,text) to service_role;
grant select, insert, update, delete on table public.pipeline_locks to service_role;
commit;
