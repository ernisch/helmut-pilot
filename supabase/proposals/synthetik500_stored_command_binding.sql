-- LOCAL REVIEWABLE PROPOSAL ONLY. Not a numbered/applied Production migration.
-- Supabase CLI could not create its config on this host's read-only home.
-- The original16-fullC execution contract remains active.
begin;
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
commit;
