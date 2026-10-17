-- INERT LOCAL REVIEW PROPOSAL. No Production GO; never execute automatically.
-- This marker binds the operator's separately reviewed, fresh quiescence receipt.
-- It does NOT itself prove external workers have stopped. That evidence is mandatory.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.helmut_store in access exclusive mode;
lock table public.mandate_profiles in share mode;
do $release_preflight$
declare owner_oid oid; r pg_catalog.pg_roles%rowtype;
begin
  select relowner into strict owner_oid from pg_catalog.pg_class where oid='public.helmut_store'::regclass;
  if current_user<>pg_catalog.pg_get_userbyid(owner_oid) or current_user<>'postgres' then
    raise exception using errcode='42501', message='release-database-owner-required';
  end if;
  if coalesce(current_setting('helmut.release_quiescence_receipt_sha256',true),'') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='55000', message='release-external-quiescence-receipt-required';
  end if;
  select * into strict r from pg_catalog.pg_roles where rolname='service_role';
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication
    or pg_catalog.pg_has_role('service_role',owner_oid,'MEMBER')
    or exists(select 1 from pg_catalog.pg_auth_members where member=r.oid) then
    raise exception using errcode='42501', message='release-runtime-role-drift';
  end if;
  if exists(select 1 from public.mandate_profiles where aktiv is distinct from false) then
    raise exception using errcode='55000', message='release-profiles-not-inactive';
  end if;
  if exists(select 1 from public.helmut_store where id like 'synthetik500-command-synthetik500-proof-%'
    or id like 'synthetik500-command-synthetik500-authority-%') then
    -- Intentionally conservative: expired/malformed rows also block. Never delete them here.
    raise exception using errcode='55000', message='release-proof-or-authority-present';
  end if;
end;
$release_preflight$;
do $release_table_shape$
begin
 if not exists(select 1 from pg_catalog.pg_class where oid='public.helmut_store'::regclass
     and relkind='r' and not relispartition and relrowsecurity)
   or exists(select 1 from pg_catalog.pg_inherits where inhrelid='public.helmut_store'::regclass
     or inhparent='public.helmut_store'::regclass)
   or (select count(*) from pg_catalog.pg_attribute where attrelid='public.helmut_store'::regclass
     and not attisdropped and attnotnull and ((attname='id' and atttypid='pg_catalog.text'::regtype)
       or (attname='data' and atttypid='pg_catalog.jsonb'::regtype)))<>2
   or not exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a
     on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid='public.helmut_store'::regclass
       and c.contype='p' and not c.condeferrable and c.convalidated and cardinality(c.conkey)=1 and a.attname='id') then
   raise exception using errcode='55000', message='release-table-shape-drift';
 end if;
end;
$release_table_shape$;
do $release_absence$
begin
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1','helmut_s500_read_command_binding_v1'))
   or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.helmut_store'::regclass
     and tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1')) then
   raise exception using errcode='55000', message='release-existing-or-partial-installation';
 end if;
end;
$release_absence$;
create function public.helmut_s500_command_immutable_row_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $row_guard$
begin
  if (old.id ~ '^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$')
    or (tg_op = 'UPDATE' and new.id ~ '^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$') then
    raise exception using errcode='55000', message='synthetik500-command-immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$row_guard$;
create function public.helmut_s500_command_no_truncate_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $truncate_guard$
begin
  raise exception using errcode='55000', message='synthetik500-command-truncate-denied';
end;
$truncate_guard$;
revoke all on function public.helmut_s500_command_immutable_row_v1() from public,anon,authenticated,service_role;
revoke all on function public.helmut_s500_command_no_truncate_v1() from public,anon,authenticated,service_role;
create trigger helmut_s500_command_immutable_row_v1 before update or delete on public.helmut_store
for each row execute function public.helmut_s500_command_immutable_row_v1();
create trigger helmut_s500_command_no_truncate_v1 before truncate on public.helmut_store
for each statement execute function public.helmut_s500_command_no_truncate_v1();
alter table public.helmut_store enable always trigger helmut_s500_command_immutable_row_v1;
alter table public.helmut_store enable always trigger helmut_s500_command_no_truncate_v1;
create function public.helmut_s500_read_command_binding_v1(p_operation_id text,p_nonce text,p_include_data boolean)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
as $read_binding$
declare
  target_id text;
  row_body text;
  physical_table text;
  physical_xmin text;
  physical_ctid text;
  native_sources jsonb;
  answer jsonb;
  runtime_role pg_catalog.pg_roles%rowtype;
  table_owner oid;
  table_kind "char";
  table_partition boolean;
begin
  if current_user <> 'service_role' or p_operation_id is null
    or p_operation_id !~ '^synthetik500-[a-z0-9-]{8,80}$'
    or p_nonce is null or p_nonce !~ '^[a-f0-9]{64}$' or p_include_data is null then
    raise exception using errcode='42501', message='synthetik500-command-binding-access';
  end if;
  select * into strict runtime_role from pg_catalog.pg_roles where rolname=current_user;
  select relowner,relkind,relispartition into strict table_owner,table_kind,table_partition
    from pg_catalog.pg_class where oid='public.helmut_store'::regclass;
  if runtime_role.rolsuper or runtime_role.rolcreaterole
    or pg_catalog.pg_has_role(current_user,table_owner,'MEMBER') then
    raise exception using errcode='42501', message='synthetik500-command-binding-role';
  end if;
  -- An ordinary, non-inherited table and an immediate primary key make the
  -- returned physical tuple identity unambiguous. Runtime cannot own this table.
  if table_kind <> 'r' or table_partition
    or exists(select 1 from pg_catalog.pg_inherits
      where inhrelid='public.helmut_store'::regclass or inhparent='public.helmut_store'::regclass)
    or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.helmut_store'::regclass
      and attname='id' and atttypid='pg_catalog.text'::regtype and attnotnull and not attisdropped)
    or not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.helmut_store'::regclass
      and attname='data' and atttypid='pg_catalog.jsonb'::regtype and attnotnull and not attisdropped)
    or not exists(select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      where c.conrelid='public.helmut_store'::regclass and c.contype='p'
        and not c.condeferrable and c.convalidated and cardinality(c.conkey)=1 and a.attname='id') then
    raise exception using errcode='55000', message='synthetik500-command-binding-table';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.helmut_store'::regclass
      and tgname='helmut_s500_command_immutable_row_v1' and tgenabled='A' and tgtype=27
      and tgfoid='public.helmut_s500_command_immutable_row_v1()'::regprocedure and not tgisinternal
      and tgqual is null and tgnargs=0 and octet_length(tgargs)=0
      and tgconstraint=0 and tgconstrrelid=0 and tgconstrindid=0
      and not tgdeferrable and not tginitdeferred and tgattr=''::pg_catalog.int2vector
      and tgparentid=0 and tgoldtable is null and tgnewtable is null)
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.helmut_store'::regclass
      and tgname='helmut_s500_command_no_truncate_v1' and tgenabled='A' and tgtype=34
      and tgfoid='public.helmut_s500_command_no_truncate_v1()'::regprocedure and not tgisinternal
      and tgqual is null and tgnargs=0 and octet_length(tgargs)=0
      and tgconstraint=0 and tgconstrrelid=0 and tgconstrindid=0
      and not tgdeferrable and not tginitdeferred and tgattr=''::pg_catalog.int2vector
      and tgparentid=0 and tgoldtable is null and tgnewtable is null) then
    raise exception using errcode='55000', message='synthetik500-command-binding-guard';
  end if;
  select jsonb_object_agg(p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) into native_sources
  from pg_catalog.pg_proc p where p.oid in (
    'public.helmut_s500_command_immutable_row_v1()'::regprocedure,
    'public.helmut_s500_command_no_truncate_v1()'::regprocedure,
    'public.helmut_s500_read_command_binding_v1(text,text,boolean)'::regprocedure)
    and p.prokind='f' and p.prolang=(select oid from pg_catalog.pg_language where lanname='plpgsql')
    and not p.prosecdef and not p.proleakproof and not p.proretset
    and not pg_catalog.pg_has_role(current_user,p.proowner,'MEMBER')
    and p.proconfig=array['search_path=pg_catalog']::text[]
    and ((p.proname='helmut_s500_read_command_binding_v1'
      and p.provolatile='s' and p.prorettype='pg_catalog.jsonb'::regtype and p.pronargs=3)
      or (p.proname<>'helmut_s500_read_command_binding_v1'
        and p.provolatile='v' and p.prorettype='pg_catalog.trigger'::regtype and p.pronargs=0));
  if native_sources is null or (select count(*) from jsonb_object_keys(native_sources)) <> 3 then
    raise exception using errcode='55000', message='synthetik500-command-binding-source';
  end if;
  target_id := 'synthetik500-command-'||p_operation_id;
  select s.data::text,s.tableoid::text,s.xmin::text,s.ctid::text
    into strict row_body,physical_table,physical_xmin,physical_ctid
    from public.helmut_store s where s.id=target_id;
  if octet_length(row_body) > 16777216 then
    raise exception using errcode='54000', message='synthetik500-command-binding-cap';
  end if;
  answer := jsonb_build_object('version','helmut-s500-stored-command-binding/1',
    'nonce',p_nonce,'rowId',target_id,'database',current_database(),
    'tableOID',physical_table,'xmin',physical_xmin,'ctid',physical_ctid,
    'storedBytes',octet_length(row_body),'storedSHA256',encode(sha256(convert_to(row_body,'UTF8')),'hex'),
    'nativeSources',native_sources,'dataText',case when p_include_data then row_body else null end);
  if octet_length(answer::text)>16777216 then
    raise exception using errcode='54000', message='synthetik500-command-binding-response-cap';
  end if;
  return answer;
end;
$read_binding$;
revoke all on function public.helmut_s500_read_command_binding_v1(text,text,boolean) from public,anon,authenticated;
grant execute on function public.helmut_s500_read_command_binding_v1(text,text,boolean) to service_role;
do $release_native_inventory$
declare actual jsonb; n integer;
begin
  select count(*), jsonb_object_agg(p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))
    into n,actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1','helmut_s500_read_command_binding_v1');
  if n<>3 or actual is distinct from '{"helmut_s500_command_immutable_row_v1":"eca91f5d879cc5e0811370f769aa98bf7dfbaba8941a6bf14644f22913fb1826","helmut_s500_command_no_truncate_v1":"e911523512516397afab7b79b8393fe662e13abd89bedf14847efcf84be9e0f2","helmut_s500_read_command_binding_v1":"e690c13a70c791e1fc07ee7fe532b646ecb1da1f863f8d14dfbc9d1303865641"}'::jsonb then
    raise exception using errcode='55000', message='release-native-source-drift';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1','helmut_s500_read_command_binding_v1') and (
      pg_catalog.pg_get_userbyid(p.proowner)<>'postgres' or p.prosecdef or p.proleakproof or p.proretset
      or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
      or p.prokind<>'f' or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or (p.proname='helmut_s500_read_command_binding_v1' and
        (p.pronargs<>3 or p.proargtypes<>'25 25 16'::pg_catalog.oidvector or p.prorettype<>'pg_catalog.jsonb'::regtype or p.provolatile<>'s'))
      or (p.proname<>'helmut_s500_read_command_binding_v1' and
        (p.pronargs<>0 or p.prorettype<>'pg_catalog.trigger'::regtype or p.provolatile<>'v'))
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from
        (p.proname='helmut_s500_read_command_binding_v1' and true)
      or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where a.grantee<>p.proowner and not (p.proname='helmut_s500_read_command_binding_v1'
          and true and a.grantee=(select oid from pg_catalog.pg_roles where rolname='service_role')
          and a.privilege_type='EXECUTE' and not a.is_grantable)))) then
    raise exception using errcode='55000', message='release-native-privilege-or-shape-drift';
  end if;
  if (select count(*) from pg_catalog.pg_trigger t where t.tgrelid='public.helmut_store'::regclass
      and t.tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1'))<>2
    or exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.helmut_store'::regclass
      and t.tgname in ('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1') and (
        t.tgenabled<>'A' or t.tgisinternal or t.tgqual is not null or t.tgnargs<>0 or octet_length(t.tgargs)<>0
        or t.tgconstraint<>0 or t.tgconstrrelid<>0 or t.tgconstrindid<>0 or t.tgdeferrable or t.tginitdeferred
        or t.tgattr<>''::pg_catalog.int2vector or t.tgparentid<>0 or t.tgoldtable is not null or t.tgnewtable is not null
        or t.tgtype<>case when t.tgname='helmut_s500_command_immutable_row_v1' then 27 else 34 end
        or t.tgfoid<>case when t.tgname='helmut_s500_command_immutable_row_v1'
          then 'public.helmut_s500_command_immutable_row_v1()'::regprocedure
          else 'public.helmut_s500_command_no_truncate_v1()'::regprocedure end)) then
    raise exception using errcode='55000', message='release-native-trigger-drift';
  end if;
end;
$release_native_inventory$;
commit;
