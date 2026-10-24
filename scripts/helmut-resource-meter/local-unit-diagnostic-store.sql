-- LOCAL OWNED COPY ONLY. This is NOT a migration and must NEVER run on the
-- source POSTRUN database or Production. No source data or old function body
-- is changed. Permissions in the NEW copy are intentionally restricted.
--
-- Installation interlock (not an authenticity proof): the database must be
-- helmut_unit_diagnostic_<32 lowercase hex> and the owner must explicitly set
-- helmut.local_unit_diagnostic_install_target to that exact database name.
-- Run as the administrator of a NEW, separately verified copy, with ON_ERROR_STOP.
-- No runtime grant/state/evidence is installed by this file.
--
-- Trust boundary: a separate, pinned SOURCE-LOCAL verifier must actually check
-- the preserved POSTRUN, exact command, original file/runtime/owner bindings,
-- all ten fresh gates and the independent admission BEFORE inserting verified
-- authority, runtime observations and the initial seven-key state transactionally
-- as the owner role. Hash-shaped JSON, a CLI flag, and this DDL are not evidence.
-- There is deliberately NO runtime installer or synthetic-proof RPC.
--
-- Canonical text is the exact UTF8 text supplied by the closed JS canonical
-- encoder. Native hashes ALWAYS hash those actual text bytes, never jsonb::text.
-- Native structural/transition checks are additional to the private JS proof
-- consumers; they cannot attest an HTTPS response or an external source file.

begin;
do $installation$
declare db text := current_database(); suffix text; owner_name text; runtime_name text; ns record;
begin
  if db !~ '^helmut_unit_diagnostic_[a-f0-9]{32}$'
    or current_setting('helmut.local_unit_diagnostic_install_target',true) is distinct from db
    or current_setting('server_version_num')::integer < 170000
    or current_setting('server_encoding') <> 'UTF8'
    or current_setting('client_encoding') <> 'UTF8'
    or not exists(select from pg_catalog.pg_roles where rolname=current_user and rolsuper)
    or exists(select from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname ~ '^local_unit_diagnostic_.*_v1$')
    or exists(select from pg_catalog.pg_namespace where nspname='helmut_unit_diagnostic') then
    raise exception 'local-unit-store-new-owned-copy-required';
  end if;
  suffix := right(db,32); owner_name := 'helmut_ud_owner_'||suffix; runtime_name := 'helmut_ud_runtime_'||suffix;
  if exists(select from pg_catalog.pg_roles where rolname in (owner_name,runtime_name)) then
    raise exception 'local-unit-store-roles-already-exist';
  end if;
  execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',owner_name);
  execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',runtime_name);
  execute format('grant create on database %I to %I',db,owner_name);
  execute format('grant usage,create on schema public to %I',owner_name);
  execute format('revoke create,temporary on database %I from public',db);
  -- PostgreSQL has additive grants, not a per-role DENY. PUBLIC EXECUTE on an
  -- old mutator would otherwise remain executable by this new runtime role.
  for ns in select nspname from pg_catalog.pg_namespace
    where nspname !~ '^pg_' and nspname <> 'information_schema' loop
    execute format('revoke execute on all routines in schema %I from public',ns.nspname);
    execute format('revoke all on all tables in schema %I from public',ns.nspname);
    execute format('revoke all on all sequences in schema %I from public',ns.nspname);
    execute format('revoke create on schema %I from public',ns.nspname);
  end loop;
  execute format('grant usage on schema public to %I',runtime_name);
  execute format('grant select on all tables in schema public to %I',runtime_name);
  -- No old mutator or even a name-selected presumed reader is granted. Any
  -- later old read-RPC grant needs its exact independently qualified code pin.
  perform set_config('role',owner_name,false);
end;$installation$;

create schema helmut_unit_diagnostic;
revoke all on schema helmut_unit_diagnostic from public;
-- PostgreSQL's default function EXECUTE is global for this new owner role;
-- a per-schema REVOKE cannot subtract that global default.
alter default privileges revoke execute on functions from public;

create function helmut_unit_diagnostic.sha(t text) returns text
language sql immutable strict security invoker set search_path=pg_catalog
as $f$ select encode(sha256(convert_to(t,'UTF8')),'hex') $f$;

create function helmut_unit_diagnostic.exact(v jsonb, names text[]) returns boolean
language sql immutable security invoker set search_path=pg_catalog
as $f$ select case when jsonb_typeof(v)='object' then
  (select array_agg(k order by k) from jsonb_object_keys(v) k)
  is not distinct from (select array_agg(k order by k) from unnest(names) k)
  else false end $f$;

create function helmut_unit_diagnostic.object_count(v jsonb) returns integer
language sql immutable security invoker set search_path=pg_catalog
as $f$ select count(*)::integer from jsonb_object_keys(v) $f$;

-- NOT STRICT: SQL NULL and JSON null must both throw, never short circuit into
-- an IF condition whose result is NULL. Use before EVERY JSON timestamp cast.
create function helmut_unit_diagnostic.utc(v jsonb) returns timestamptz
language plpgsql immutable security invoker set search_path=pg_catalog
as $f$
declare t text; answer timestamptz;
begin
  if jsonb_typeof(v) is distinct from 'string' then raise exception 'local-unit-store-utc-type';end if;
  t:=v#>>'{}';
  if t is null or t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception 'local-unit-store-utc-canonical';end if;
  answer:=t::timestamptz;
  if not isfinite(answer) or to_char(answer at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from t then
    raise exception 'local-unit-store-utc-finite';end if;
  return answer;
end;$f$;

create function helmut_unit_diagnostic.parse(t text, h text, cap integer) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog
as $f$
begin
  if t is null or h is null or h !~ '^[a-f0-9]{64}$' or cap is null
    or octet_length(t) not between 2 and cap
    or not(t is json object with unique keys)
    or helmut_unit_diagnostic.sha(t) is distinct from h then
    raise exception 'local-unit-store-actual-text-hash';
  end if;
  return t::jsonb;
end;$f$;

create function helmut_unit_diagnostic.runtime_role() returns void
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare r pg_catalog.pg_roles%rowtype; login_role pg_catalog.pg_roles%rowtype;
begin
  select * into strict r from pg_catalog.pg_roles where rolname=current_user;
  select * into strict login_role from pg_catalog.pg_roles where rolname=session_user;
  if current_database() !~ '^helmut_unit_diagnostic_[a-f0-9]{32}$'
    or current_user <> 'helmut_ud_runtime_'||right(current_database(),32)
    or r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolbypassrls or r.rolcanlogin
    or login_role.rolsuper or login_role.rolcreaterole or login_role.rolcreatedb or login_role.rolbypassrls
    or pg_has_role(current_user,'helmut_ud_owner_'||right(current_database(),32),'MEMBER')
    or pg_has_role(session_user,'helmut_ud_owner_'||right(current_database(),32),'MEMBER')
    -- NOINHERIT does not remove SET ROLE authority. A connection principal
    -- may be able to RESET ROLE and then SET an ordinary old writer role.
    or exists(select from pg_catalog.pg_roles p where p.rolname<>session_user
      and p.rolname<>'helmut_ud_runtime_'||right(current_database(),32)
      and pg_has_role(session_user,p.oid,'SET'))
    or exists(select from pg_catalog.pg_roles p where (p.rolsuper or p.rolcreaterole or p.rolcreatedb or p.rolbypassrls
      or p.rolname in ('pg_write_server_files','pg_execute_server_program','pg_read_server_files'))
      and pg_has_role(session_user,p.oid,'MEMBER'))
    or pg_has_role(session_user,(select datdba from pg_database where datname=current_database()),'MEMBER')
    or exists(select from unnest(array[current_user::text,session_user::text]) principal
      where has_database_privilege(principal,current_database(),'CREATE,TEMPORARY'))
    or exists(select from pg_namespace n cross join unnest(array[current_user::text,session_user::text]) principal
      where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and has_schema_privilege(principal,n.oid,'CREATE'))
    or exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join unnest(array[current_user::text,session_user::text]) principal
      where n.nspname !~ '^pg_' and n.nspname not in ('information_schema','helmut_unit_diagnostic')
        and ((c.relkind in ('r','p','v','m','f') and (has_table_privilege(principal,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          or has_any_column_privilege(principal,c.oid,'INSERT,UPDATE,REFERENCES')))
          or (c.relkind='S' and has_sequence_privilege(principal,c.oid,'USAGE,UPDATE'))))
    or exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join unnest(array[current_user::text,session_user::text]) principal
      where n.nspname !~ '^pg_' and n.nspname not in ('information_schema','helmut_unit_diagnostic')
        and p.oid not in (
          'public.local_unit_diagnostic_contract_v1()'::regprocedure,
          'public.local_unit_diagnostic_authority_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_runtime_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_control_runtime_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_control_snapshot_read_v1(text,text,integer,text,jsonb,text)'::regprocedure,
          'public.local_unit_diagnostic_state_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_state_cas_v1(text,text,text,bigint,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_artifact_insert_v1(text,text,text,text,text,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_artifact_read_v1(text,text,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_acquire_v1(text,text,text,integer,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_release_v1(text,text,text,uuid,text)'::regprocedure)
        and not exists(select from helmut_unit_diagnostic.legacy_read_rpcs q where q.function_oid=p.oid
          and q.function_name=p.proname and q.identity_arguments=oidvectortypes(p.proargtypes)
          and q.prosrc_sha256=helmut_unit_diagnostic.sha(p.prosrc) and not p.prosecdef and p.provolatile in ('i','s') and p.proconfig=array['search_path=pg_catalog']::text[])
        and has_function_privilege(principal,p.oid,'EXECUTE')) then
    raise exception using errcode='42501',message='local-unit-store-runtime-role';
  end if;
end;$f$;

create table helmut_unit_diagnostic.authority(
  scope_hash text primary key check(scope_hash ~ '^[a-f0-9]{64}$'),
  operation_id text not null unique check(operation_id='localUnitDiagnostic-'||right(current_database(),32)),
  grant_id text not null unique check(grant_id ~ '^[a-f0-9]{64}$'),
  command_canonical text not null,
  admission_canonical text not null,
  admission_hash text not null check(admission_hash ~ '^[a-f0-9]{64}$'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  target_hash text not null check(target_hash ~ '^[a-f0-9]{64}$'),
  postrun_hash text not null check(postrun_hash ~ '^[a-f0-9]{64}$'),
  source_proof_hash text not null check(source_proof_hash ~ '^[a-f0-9]{64}$'),
  code_manifest_pin jsonb not null,
  runtime_manifest_pin jsonb not null,
  gate_hashes jsonb not null,
  verifier_code_hash text not null check(verifier_code_hash ~ '^[a-f0-9]{64}$'),
  -- NEW verifier ABI: source-local verifier derives these models from both
  -- original hash-pinned UTF8 request bodies. No historical column/default.
  request_models jsonb not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at>verified_at),
  check(helmut_unit_diagnostic.sha(command_canonical)=scope_hash),
  check(helmut_unit_diagnostic.sha(admission_canonical)=admission_hash)
);
create table helmut_unit_diagnostic.runtime_observations(
  scope_hash text not null references helmut_unit_diagnostic.authority(scope_hash),
  ordinal bigint generated always as identity,
  proof_canonical text not null,
  proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz not null,
  primary key(scope_hash,ordinal),
  unique(scope_hash,proof_hash),
  check(helmut_unit_diagnostic.sha(proof_canonical)=proof_hash)
);
create table helmut_unit_diagnostic.state(
  scope_hash text primary key references helmut_unit_diagnostic.authority(scope_hash),
  revision bigint not null check(revision>=0),
  canonical_text text not null,
  body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
  body jsonb not null,
  check(helmut_unit_diagnostic.sha(canonical_text)=body_hash),
  check(canonical_text::jsonb=body)
);
create table helmut_unit_diagnostic.artifacts(
  scope_hash text not null references helmut_unit_diagnostic.authority(scope_hash),
  owner_id text not null,
  kind text not null check(kind in ('usage-D','usage-R','draft','immutable-D','review','lage','mandatsbriefing','morgenbriefing','evidence')),
  logical_id text not null check(length(logical_id) between 1 and 256),
  canonical_text text not null,
  body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
  parent_hash text check(parent_hash ~ '^[a-f0-9]{64}$'),
  body jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(scope_hash,owner_id,kind,logical_id),
  unique(scope_hash,kind),
  unique(scope_hash,body_hash),
  check(helmut_unit_diagnostic.sha(canonical_text)=body_hash),
  check(canonical_text::jsonb=body)
);

create table helmut_unit_diagnostic.legacy_read_rpcs(
  function_name text primary key check(function_name ~ '^helmut_(auth|llm_usage)_[a-z0-9_]+_v1$'),
  http_exposed boolean not null default false,
  function_oid oid not null unique,
  identity_arguments text not null,
  prosrc_sha256 text not null check(prosrc_sha256 ~ '^[a-f0-9]{64}$'),
  qualification_pin jsonb not null,
  check(helmut_unit_diagnostic.exact(qualification_pin,array['path','bytes','sha256'])),
  check(qualification_pin->>'sha256' ~ '^[a-f0-9]{64}$')
);
-- The SOURCE-LOCAL root verifier inserts only independently reviewed read-only
-- function bodies, then grants the exact OIDs as the copy administrator in the
-- same transaction. Name matching by itself never grants an old function.
create function helmut_unit_diagnostic.qualified_read_insert() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare p pg_catalog.pg_proc%rowtype;
begin
  if current_user <> 'helmut_ud_owner_'||right(current_database(),32) then raise exception 'local-unit-store-read-qualifier-required';end if;
  select * into strict p from pg_proc where oid=new.function_oid;
  if p.pronamespace<>'public'::regnamespace or p.proname<>new.function_name or p.prosecdef or p.provolatile not in ('i','s') or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
    or (new.http_exposed and new.function_name !~ '^helmut_auth_(state_graph|usage|control)_read_v1$')
    or oidvectortypes(p.proargtypes)<>new.identity_arguments or helmut_unit_diagnostic.sha(p.prosrc)<>new.prosrc_sha256
    or p.prokind<>'f' or exists(select from pg_proc where pronamespace=p.pronamespace and proname=p.proname and oid<>p.oid) then
    raise exception 'local-unit-store-qualified-read-identity';end if;
  return new;
end;$f$;
create trigger qualified_read_source before insert on helmut_unit_diagnostic.legacy_read_rpcs
  for each row execute function helmut_unit_diagnostic.qualified_read_insert();
alter table helmut_unit_diagnostic.legacy_read_rpcs enable always trigger qualified_read_source;

create table helmut_unit_diagnostic.leases(
  scope_hash text primary key references helmut_unit_diagnostic.authority(scope_hash),
  claim_hash text not null check(claim_hash ~ '^[a-f0-9]{64}$'),
  owner_id text not null,
  job_name text not null,
  token uuid not null,
  expires_at timestamptz not null,
  released boolean not null default false,
  revision bigint not null check(revision>=0)
);

create function helmut_unit_diagnostic.no_change() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$ begin raise exception 'local-unit-store-immutable'; end;$f$;
create trigger authority_immutable before update or delete or truncate on helmut_unit_diagnostic.authority
  for each statement execute function helmut_unit_diagnostic.no_change();
create trigger observations_immutable before update or delete or truncate on helmut_unit_diagnostic.runtime_observations
  for each statement execute function helmut_unit_diagnostic.no_change();
create trigger artifacts_immutable before update or delete or truncate on helmut_unit_diagnostic.artifacts
  for each statement execute function helmut_unit_diagnostic.no_change();
create trigger state_no_delete before delete or truncate on helmut_unit_diagnostic.state
  for each statement execute function helmut_unit_diagnostic.no_change();
alter table helmut_unit_diagnostic.authority enable always trigger authority_immutable;
alter table helmut_unit_diagnostic.runtime_observations enable always trigger observations_immutable;
alter table helmut_unit_diagnostic.artifacts enable always trigger artifacts_immutable;
alter table helmut_unit_diagnostic.state enable always trigger state_no_delete;
create trigger qualified_read_immutable before update or delete or truncate on helmut_unit_diagnostic.legacy_read_rpcs
  for each statement execute function helmut_unit_diagnostic.no_change();
alter table helmut_unit_diagnostic.legacy_read_rpcs enable always trigger qualified_read_immutable;
create trigger lease_no_delete before delete or truncate on helmut_unit_diagnostic.leases
  for each statement execute function helmut_unit_diagnostic.no_change();
alter table helmut_unit_diagnostic.leases enable always trigger lease_no_delete;


create function helmut_unit_diagnostic.authority_insert() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare c jsonb; a jsonb; gates text[] := array['source','runtime','owner','calendar','costs','reservation','sender','review','result','independentAcceptance'];
begin
  if current_user <> 'helmut_ud_owner_'||right(current_database(),32) then
    raise exception using errcode='42501',message='local-unit-store-source-verifier-required';
  end if;
  c := helmut_unit_diagnostic.parse(new.command_canonical,new.scope_hash,16777216);
  a := helmut_unit_diagnostic.parse(new.admission_canonical,new.admission_hash,65536);
  perform helmut_unit_diagnostic.utc(c#>'{calendar,sourceViewAtUTC}');
  perform helmut_unit_diagnostic.utc(c#>'{calendar,startsAtUTC}');
  perform helmut_unit_diagnostic.utc(c#>'{calendar,endsAtUTC}');
  perform helmut_unit_diagnostic.utc(a->'authorizedAtUTC');
  perform helmut_unit_diagnostic.utc(a->'expiresAtUTC');
  if not isfinite(new.verified_at) or not isfinite(new.expires_at) then raise exception 'local-unit-store-authority-finite';end if;
  if c->>'version' is distinct from 'helmut-local-unit-diagnostic-command/1'
    or c->>'mode' is distinct from 'D-R-1-local-fixture'
    or c#>>'{source,sourceIndex}' is distinct from '499' or c#>>'{source,diagnosticUnit}' is distinct from '0'
    or c#>>'{source,sourceDay}' is distinct from '2026-10-21'
    or c#>>'{target,database}' is distinct from current_database()
    or c#>>'{target,postrunPin,sha256}' is distinct from new.postrun_hash
    or c#>>'{slot,plan,operationId}' is distinct from new.operation_id
    or jsonb_array_length(c->'units') is distinct from 1 or jsonb_array_length(c->'drafts') is distinct from 1
    or jsonb_array_length(c#>'{slot,plan,intents}') is distinct from 2
    or c#>>'{units,0,kind}' is distinct from 'DR'
    or coalesce(c#>>'{units,0,subject}','') !~ '^test-kohorte-synthetik-(bt|be|bb)-[0-9]{3}$'
    or c#>>'{limits,units}' is distinct from '1' or c#>>'{limits,providerCalls}' is distinct from '2'
    or c#>>'{limits,unitMs}' is distinct from '60000'
    or c#>>'{limits,authMs}' is distinct from '30000' or c#>>'{limits,controlsPerUnit}' is distinct from '16'
    or c#>'{limits,maxOutputTokens}' is distinct from '{"D":3000,"R":6000}'::jsonb
    or c#>'{limits,reservePerPhaseMicroUsd}' is distinct from '{"D":81400,"R":88000}'::jsonb
    or c#>'{limits,maxMockCostMicroUsd}' is distinct from '169400'::jsonb
    or c#>>'{limits,production}' is distinct from 'false' or c#>>'{limits,paidProviderCallsAllowed}' is distinct from 'false'
    or a->>'version' is distinct from 'helmut-local-unit-diagnostic-admission/1'
    or a->>'grantId' is distinct from new.grant_id or a->>'commandHash' is distinct from new.scope_hash
    or helmut_unit_diagnostic.utc(a->'expiresAtUTC') is distinct from new.expires_at
    or helmut_unit_diagnostic.utc(c#>'{calendar,endsAtUTC}') is distinct from new.expires_at
    or helmut_unit_diagnostic.utc(a->'authorizedAtUTC')>new.verified_at
    or helmut_unit_diagnostic.utc(c#>'{calendar,startsAtUTC}')>=new.expires_at
    or c#>>'{calendar,sourceDay}' is distinct from '2026-10-21'
    or c#>>'{calendar,executionDayUTC}' is distinct from to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD')
    or new.verified_at < clock_timestamp()-interval '30 seconds' or new.verified_at > clock_timestamp()
    or new.expires_at <= clock_timestamp()
    or not helmut_unit_diagnostic.exact(new.gate_hashes,gates)
    or not helmut_unit_diagnostic.exact(new.request_models,array['D','R'])
    or jsonb_typeof(new.request_models->'D') is distinct from 'string'
    or jsonb_typeof(new.request_models->'R') is distinct from 'string'
    or coalesce(new.request_models->>'D','') not in ('gpt-5-mini','gpt-5-mini-eu')
    or new.request_models->>'R' is distinct from new.request_models->>'D'
    or not helmut_unit_diagnostic.exact(new.code_manifest_pin,array['path','bytes','sha256'])
    or not helmut_unit_diagnostic.exact(new.runtime_manifest_pin,array['path','bytes','sha256'])
    or coalesce(new.code_manifest_pin->>'sha256','') !~ '^[a-f0-9]{64}$'
    or new.runtime_manifest_pin->>'sha256' is distinct from c#>>'{slot,plan,runtimeManifestHash}'
    or new.code_manifest_pin->>'path' is distinct from '/workspace/helmut-unit-diagnostic-native/'||right(new.operation_id,32)||'/CODE_MANIFEST.SAFE.json'
    or new.runtime_manifest_pin->>'path' is distinct from '/workspace/helmut-unit-diagnostic-native/'||right(new.operation_id,32)||'/RUNTIME_MANIFEST.SAFE.json'
    or exists(select from jsonb_each_text(new.gate_hashes) where value !~ '^[a-f0-9]{64}$') then
    raise exception 'local-unit-store-authority-binding';
  end if;
  return new;
end;$f$;
create trigger authority_source_verifier before insert on helmut_unit_diagnostic.authority
  for each row execute function helmut_unit_diagnostic.authority_insert();
alter table helmut_unit_diagnostic.authority enable always trigger authority_source_verifier;

create function helmut_unit_diagnostic.observation_insert() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; p jsonb;
begin
  if current_user <> 'helmut_ud_owner_'||right(current_database(),32) then
    raise exception using errcode='42501',message='local-unit-store-runtime-verifier-required';
  end if;
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=new.scope_hash;
  p := helmut_unit_diagnostic.parse(new.proof_canonical,new.proof_hash,65536);
  perform helmut_unit_diagnostic.utc(p->'observedAtUTC');
  if not helmut_unit_diagnostic.exact(p,array['operationId','commandHash','sourceHash','targetHash','postrunSHA256','gateHashes','codeManifestHash','runtimeManifestHash','databaseOID','observedAtUTC'])
    or p->>'operationId' is distinct from a.operation_id or p->>'commandHash' is distinct from a.scope_hash
    or p->>'sourceHash' is distinct from a.source_hash or p->>'targetHash' is distinct from a.target_hash
    or p->>'postrunSHA256' is distinct from a.postrun_hash or p->'gateHashes' is distinct from a.gate_hashes
    or p->>'codeManifestHash' is distinct from a.code_manifest_pin->>'sha256'
    or p->>'runtimeManifestHash' is distinct from a.runtime_manifest_pin->>'sha256'
    or p->>'databaseOID' is distinct from (select oid::text from pg_database where datname=current_database())
    or helmut_unit_diagnostic.utc(p->'observedAtUTC') is distinct from new.observed_at
    or not isfinite(new.observed_at)
    or new.observed_at < clock_timestamp()-interval '30 seconds' or new.observed_at > clock_timestamp()
    or new.observed_at >= a.expires_at then raise exception 'local-unit-store-observed-runtime-binding'; end if;
  return new;
end;$f$;
create trigger observations_source_verifier before insert on helmut_unit_diagnostic.runtime_observations
  for each row execute function helmut_unit_diagnostic.observation_insert();
alter table helmut_unit_diagnostic.runtime_observations enable always trigger observations_source_verifier;

create function helmut_unit_diagnostic.fresh_runtime(s text) returns helmut_unit_diagnostic.runtime_observations
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare r helmut_unit_diagnostic.runtime_observations%rowtype;
begin
  select * into strict r from helmut_unit_diagnostic.runtime_observations where scope_hash=s order by ordinal desc limit 1;
  if r.observed_at < clock_timestamp()-interval '30 seconds' or r.observed_at > clock_timestamp() then
    raise exception 'local-unit-store-runtime-observation-stale';
  end if;
  return r;
end;$f$;

-- Canonical hashes below are restricted to this ASCII-keyed verification ABI.
-- They never hash jsonb::text as a substitute for supplied canonical bodies.
create function helmut_unit_diagnostic.verification_canonical(v jsonb, depth integer default 0) returns text
language plpgsql immutable security invoker set search_path=pg_catalog
as $f$
declare answer text; item record;
begin
  if depth>8 or v is null then raise exception 'local-unit-store-verification-depth';end if;
  case jsonb_typeof(v)
  when 'object' then
    answer:='';for item in select key,value from jsonb_each(v) order by key collate "C" loop
      if item.key !~ '^[A-Za-z][A-Za-z0-9]*$' then raise exception 'local-unit-store-verification-key';end if;
      answer:=answer||case when answer='' then '' else ',' end||to_jsonb(item.key)::text||':'||helmut_unit_diagnostic.verification_canonical(item.value,depth+1);
    end loop;return '{'||answer||'}';
  when 'array' then
    answer:='';for item in select value from jsonb_array_elements(v) loop
      answer:=answer||case when answer='' then '' else ',' end||helmut_unit_diagnostic.verification_canonical(item.value,depth+1);
    end loop;return '['||answer||']';
  when 'string' then
    if (v#>>'{}') !~ '^[ -~]*$' then raise exception 'local-unit-store-verification-ascii';end if;return v::text;
  when 'null' then return 'null';
  when 'number' then
    if v::text !~ '^(0|[1-9][0-9]?)$' then raise exception 'local-unit-store-verification-number';end if;return v::text;
  else raise exception 'local-unit-store-verification-scalar';end case;
end;$f$;

create function helmut_unit_diagnostic.verify_controls(v jsonb, s text, cid text) returns void
language plpgsql immutable security invoker set search_path=pg_catalog
as $f$
declare a jsonb; r jsonb; i integer:=0; last_ns numeric:=0; last_at timestamptz;
  stages text[]:=array['unit-enter','before-D','reserve-D','send-D','D-accounted','before-R','D-retained','reserve-R','send-R','R-accounted','R-retained','before-lage-save','after-lage-save','before-briefing-materialize','before-morning-insert','before-evidence-retention'];
  key text; begin_at timestamptz; end_at timestamptz;
begin
  if not helmut_unit_diagnostic.exact(v,array['version','authorization','controls'])
    or v->>'version' is distinct from 'helmut-local-unit-diagnostic-verification/1'
    or jsonb_typeof(v->'controls') is distinct from 'array' or jsonb_array_length(v->'controls')<>16 then raise exception 'local-unit-store-sixteen-controls';end if;
  a:=v->'authorization';
  if not helmut_unit_diagnostic.exact(a,array['startedAtUTC','confirmedAtUTC','elapsedNs','commandHash','claimId'])
    or a->>'commandHash' is distinct from s or a->>'claimId' is distinct from cid
    or jsonb_typeof(a->'elapsedNs') is distinct from 'string'
    or coalesce(a->>'elapsedNs','') !~ '^(0|[1-9][0-9]{0,10})$' then raise exception 'local-unit-store-auth30-binding';end if;
  begin_at:=helmut_unit_diagnostic.utc(a->'startedAtUTC');end_at:=helmut_unit_diagnostic.utc(a->'confirmedAtUTC');
  if (a->>'elapsedNs')::numeric>=30000000000 or end_at<begin_at or end_at>=begin_at+interval '30 seconds' then raise exception 'local-unit-store-auth30';end if;
  last_at:=end_at;last_ns:=(a->>'elapsedNs')::numeric;
  for r in select value from jsonb_array_elements(v->'controls') loop
    if not helmut_unit_diagnostic.exact(r,array['index','stage','startedAtUTC','completedAtUTC','startedElapsedNs','completedElapsedNs','commandHash','runtimeHash','inputsHash','profileHash','bindingHash','stateHash','costsHash','artifactHash'])
      or r->>'index' is distinct from i::text or r->>'stage' is distinct from stages[i+1]
      or r->>'commandHash' is distinct from s
      or jsonb_typeof(r->'index') is distinct from 'number'
      or jsonb_typeof(r->'startedElapsedNs') is distinct from 'string'
      or jsonb_typeof(r->'completedElapsedNs') is distinct from 'string'
      or coalesce(r->>'startedElapsedNs','') !~ '^(0|[1-9][0-9]{0,10})$'
      or coalesce(r->>'completedElapsedNs','') !~ '^(0|[1-9][0-9]{0,10})$' then raise exception 'local-unit-store-control-binding';end if;
    foreach key in array array['runtimeHash','inputsHash','profileHash','bindingHash','stateHash','costsHash'] loop
      if coalesce(r->>key,'') !~ '^[a-f0-9]{64}$' then raise exception 'local-unit-store-control-hash';end if;
    end loop;
    if (r->>'artifactHash' is not null and r->>'artifactHash' !~ '^[a-f0-9]{64}$')
      or (stages[i+1] in ('D-retained','R-retained') and coalesce(r->>'artifactHash','') !~ '^[a-f0-9]{64}$') then raise exception 'local-unit-store-control-artifact';end if;
    if (r->>'startedElapsedNs')::numeric<last_ns or (r->>'completedElapsedNs')::numeric<(r->>'startedElapsedNs')::numeric
      or (r->>'completedElapsedNs')::numeric>=60000000000 then raise exception 'local-unit-store-control-monotonic';end if;
    if helmut_unit_diagnostic.utc(r->'startedAtUTC')<last_at
      or helmut_unit_diagnostic.utc(r->'completedAtUTC')<helmut_unit_diagnostic.utc(r->'startedAtUTC')
      or helmut_unit_diagnostic.utc(r->'completedAtUTC')>=begin_at+interval '60 seconds' then raise exception 'local-unit-store-control-time';end if;
    last_ns:=(r->>'completedElapsedNs')::numeric;last_at:=helmut_unit_diagnostic.utc(r->'completedAtUTC');i:=i+1;
  end loop;
end;$f$;

create function helmut_unit_diagnostic.validate_state(s text,d jsonb) returns void
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; c jsonb; ad jsonb; k text; j jsonb; co jsonb; sl jsonb; rr jsonb;
  phase text; intent jsonb; call jsonb; attempt jsonb; t jsonb; ticket_id text; total bigint:=0; reserved_total bigint:=0;
  phase_reserved bigint; phase_output bigint;
  completion jsonb; artifact_hash text; n integer; v jsonb; result_value jsonb; verification jsonb;
begin
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=s;
  c:=a.command_canonical::jsonb;ad:=a.admission_canonical::jsonb;k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';
  if not helmut_unit_diagnostic.exact(d,array[k||'journal',k||'costs',k||'reservation',k||'sendClaim',k||'review',k||'result','localUnitDiagnosticConsumedGrantsV1']) then
    raise exception 'local-unit-store-only-own-seven-keys';
  end if;
  rr:=d->(k||'reservation');j:=d->(k||'journal');co:=d->(k||'costs');sl:=co->'slot';
  perform helmut_unit_diagnostic.utc(rr->'installedAtUTC');
  perform helmut_unit_diagnostic.utc(d#>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id,'installedAtUTC']);
  if j->>'state' is distinct from 'installed' then
    perform helmut_unit_diagnostic.utc(j->'claimedAtUTC');
    if coalesce(j->>'claimId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then raise exception 'local-unit-store-claim-id';end if;
    if j->>'state'='closed' then
      perform helmut_unit_diagnostic.utc(j->'closedAtUTC');
    else
      if not helmut_unit_diagnostic.exact(j->'inFlight',array['index','enteredAtUTC','deadlineAtUTC']) then raise exception 'local-unit-store-flight-shape';end if;
      perform helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}');
      perform helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}');
      if helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')>helmut_unit_diagnostic.utc(j->'claimedAtUTC')
        or helmut_unit_diagnostic.utc(j->'claimedAtUTC')>=helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}')
        or helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}')<=helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')
        or helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}') is distinct from
          least(helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')+interval '60 seconds',a.expires_at)
        or helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')<helmut_unit_diagnostic.utc(c#>'{calendar,startsAtUTC}') then raise exception 'local-unit-store-flight-time';end if;
    end if;
  end if;
  if not helmut_unit_diagnostic.exact(rr,array['version','operationId','commandHash','command','admission','installedAtUTC'])
    or rr->>'version' is distinct from 'helmut-local-unit-diagnostic-execution/1'
    or rr->>'operationId' is distinct from a.operation_id or rr->>'commandHash' is distinct from s
    or rr->'command' is distinct from c or rr->'admission' is distinct from ad
    or not helmut_unit_diagnostic.exact(d->'localUnitDiagnosticConsumedGrantsV1',array[a.grant_id])
    or not helmut_unit_diagnostic.exact(d#>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id],array['operationId','commandHash','admissionHash','installedAtUTC'])
    or d#>>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id,'operationId'] is distinct from a.operation_id
    or d#>>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id,'commandHash'] is distinct from s
    or d#>>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id,'admissionHash'] is distinct from a.admission_hash
    or d#>>array['localUnitDiagnosticConsumedGrantsV1',a.grant_id,'installedAtUTC'] is distinct from rr->>'installedAtUTC'
    or j->>'operationId' is distinct from a.operation_id or j->>'commandHash' is distinct from s
    or coalesce(j->>'state','') not in ('installed','running','closed','stopped','unknown')
    or coalesce(j->>'index','') not in ('0','1') or jsonb_typeof(j->'stopRequested') is distinct from 'boolean'
    or co->>'day' is distinct from c#>>'{calendar,executionDayUTC}' or co->>'limit' is distinct from '169400'
    or co->>'tariff' is distinct from 'local-fixture-simulation-only-v1'
    or sl->>'version' is distinct from 'helmut-local-unit-diagnostic-cost-admission/1'
    or sl->'plan' is distinct from c#>'{slot,plan}' or sl->>'planHash' is distinct from c#>>'{slot,planHash}'
    or jsonb_typeof(co->'calls') is distinct from 'object' or jsonb_typeof(j->'attempts') is distinct from 'object'
    or jsonb_typeof(d->(k||'sendClaim')) is distinct from 'object'
    or d->(k||'review') is distinct from '{}'::jsonb then raise exception 'local-unit-store-state-binding'; end if;
  if not helmut_unit_diagnostic.exact(j,array['operationId','commandHash','state','claimId','index','inFlight','attempts','stopRequested','reason']
      ||case when j?'claimedAtUTC' then array['claimedAtUTC'] else array[]::text[] end
      ||case when j?'closedAtUTC' then array['closedAtUTC'] else array[]::text[] end
      ||case when j->>'state'='closed' then array['verification'] else array[]::text[] end)
    or not helmut_unit_diagnostic.exact(co,array['day','limit','spent','tariff','calls','slot'])
    or not helmut_unit_diagnostic.exact(sl,array['version','plan','planHash','consumed','draftCompletions','reviewBindings','reviewBindingsHash'])
    or helmut_unit_diagnostic.object_count(co->'calls')>2 or helmut_unit_diagnostic.object_count(j->'attempts')>2
    or helmut_unit_diagnostic.object_count(sl->'consumed')>2 or helmut_unit_diagnostic.object_count(sl->'draftCompletions')>1
    or helmut_unit_diagnostic.object_count(sl->'reviewBindings')>1 or helmut_unit_diagnostic.object_count(d->(k||'sendClaim'))>2 then
    raise exception 'local-unit-store-state-bounds';
  end if;
  for phase in select unnest(array['D','R']) loop
    phase_reserved:=case when phase='D' then 81400 else 88000 end;
    phase_output:=case when phase='D' then 3000 else 6000 end;
    select value into strict intent from jsonb_array_elements(sl#>'{plan,intents}') where value->>'phase'=phase;
    if intent->>'maxOutputTokens' is distinct from phase_output::text then raise exception 'local-unit-store-phase-output-limit';end if;
    if j->'attempts' ? phase then
      attempt:=j#>array['attempts',phase];ticket_id:=attempt->>'ticketId';call:=co#>array['calls',ticket_id];t:=call->'ticket';
      perform helmut_unit_diagnostic.utc(attempt->'reservedAtUTC');
      perform helmut_unit_diagnostic.utc(sl#>array['consumed',intent->>'id','consumedAtUTC']);
      if not helmut_unit_diagnostic.exact(call,case when call?'usageReceiptHash' then array['status','reserved','ticket','cost','usageReceiptHash'] else array['status','reserved','ticket','cost'] end)
        or not helmut_unit_diagnostic.exact(attempt,array['status','ticketId','requestHash','reservedAtUTC'])
        or call->>'status' is distinct from attempt->>'status' or coalesce(call->>'status','') not in ('reserved','sent','accounted','unknown','not-sent')
        or call->>'reserved' is distinct from phase_reserved::text or t->>'reserved' is distinct from phase_reserved::text
        or t->>'id' is distinct from ticket_id or t->>'day' is distinct from co->>'day'
        or t->>'maxOutputTokens' is distinct from phase_output::text or t#>>'{execution,version}' is distinct from rr->>'version'
        or t#>>'{execution,operationId}' is distinct from a.operation_id or t#>>'{execution,commandHash}' is distinct from s
        or t#>>'{execution,claimId}' is distinct from j->>'claimId'
        or t#>>'{admission,version}' is distinct from sl->>'version' or t#>>'{admission,operationId}' is distinct from a.operation_id
        or t#>>'{admission,planHash}' is distinct from sl->>'planHash' or t#>>'{admission,runId}' is distinct from sl#>>'{plan,runId}'
        or t#>>'{admission,intentId}' is distinct from intent->>'id' or t#>>'{admission,phase}' is distinct from phase
        or t#>>'{admission,actualRequestHash}' is distinct from attempt->>'requestHash'
        or t->'requestPin' is distinct from c#>array['requestPins',phase]
        or sl#>>array['consumed',intent->>'id','ticketId'] is distinct from ticket_id
        or sl#>>array['consumed',intent->>'id','day'] is distinct from co->>'day'
        or sl#>>array['consumed',intent->>'id','actualRequestHash'] is distinct from attempt->>'requestHash'
        or sl#>>array['consumed',intent->>'id','reserved'] is distinct from phase_reserved::text then
        raise exception 'local-unit-store-ticket-binding';
      end if;
      if phase='D' and attempt->>'requestHash' is distinct from intent->>'actualRequestHash' then raise exception 'local-unit-store-D-request';end if;
      if phase='R' and (j#>>'{attempts,D,status}' is distinct from 'accounted'
        or sl#>>array['reviewBindings',intent->>'id','actualRequestHash'] is distinct from attempt->>'requestHash'
        or sl#>>array['reviewBindings',intent->>'id','bindingHash'] is distinct from t#>>'{admission,reviewBindingHash}') then raise exception 'local-unit-store-R-parent';end if;
      if call->>'status' in ('sent','accounted') and
        (d#>>array[k||'sendClaim',phase,'ticketId'] is distinct from ticket_id
        or d#>>array[k||'sendClaim',phase,'requestHash'] is distinct from attempt->>'requestHash') then raise exception 'local-unit-store-send-binding';end if;
      if call->>'status'='accounted' then
        if coalesce(call->>'cost','') !~ '^[0-9]{1,6}$' or (call->>'cost')::bigint>phase_reserved
          or coalesce(call->>'usageReceiptHash','') !~ '^[a-f0-9]{64}$' then raise exception 'local-unit-store-accounting';end if;
        select body_hash into strict artifact_hash from helmut_unit_diagnostic.artifacts
          where scope_hash=s and kind='usage-'||phase and logical_id=ticket_id;
        if artifact_hash is distinct from call->>'usageReceiptHash' then raise exception 'local-unit-store-accounted-usage-artifact';end if;
        total:=total+(call->>'cost')::bigint;
        if phase='D' then
          completion:=sl#>array['draftCompletions',intent->>'id'];
          perform helmut_unit_diagnostic.utc(completion->'completedAtUTC');
          if completion->>'version' is distinct from 'helmut-synthetik500-D-completion/1'
            or completion->>'operationId' is distinct from a.operation_id or completion->>'planHash' is distinct from sl->>'planHash'
            or completion->>'runId' is distinct from sl#>>'{plan,runId}' or completion->>'owner' is distinct from intent->>'owner'
            or completion->>'dIntentId' is distinct from intent->>'id' or completion->>'contextHash' is distinct from intent->>'inputVersionHash'
            or completion#>>'{dTicket,id}' is distinct from ticket_id or completion#>>'{dTicket,day}' is distinct from co->>'day'
            or completion->>'costMicroUsd' is distinct from call->>'cost'
            or completion#>>'{usageReceipt,recordHash}' is distinct from artifact_hash then raise exception 'local-unit-store-D-completion';end if;
        end if;
      elsif call->>'status' in ('reserved','sent','unknown') then reserved_total:=reserved_total+phase_reserved;
      elsif call->>'cost' is distinct from '0' then raise exception 'local-unit-store-not-sent-cost';
      end if;
    end if;
  end loop;
  n:=(select count(*) from jsonb_object_keys(j->'attempts'));
  if n<>(select count(*) from jsonb_object_keys(co->'calls')) or n<>(select count(*) from jsonb_object_keys(sl->'consumed'))
    or co->>'spent' is distinct from total::text or total+reserved_total>169400
    or exists(select from jsonb_object_keys(j->'attempts') z where z not in ('D','R')) then raise exception 'local-unit-store-cost-sum';end if;
  if (j#>>'{attempts,D,status}'='accounted' and not helmut_unit_diagnostic.exact(sl->'draftCompletions',array[c#>>'{slot,plan,intents,0,id}']))
    or (j#>>'{attempts,D,status}' is distinct from 'accounted' and sl->'draftCompletions'<>'{}'::jsonb)
    or (j->'attempts'?'R' and not helmut_unit_diagnostic.exact(sl->'reviewBindings',array[c#>>'{slot,plan,intents,1,id}']))
    or (not(j->'attempts'?'R') and sl->'reviewBindings'<>'{}'::jsonb) then raise exception 'local-unit-store-receipt-key-set';end if;
  for phase in select jsonb_object_keys(d->(k||'sendClaim')) loop
    v:=d#>array[k||'sendClaim',phase];
    perform helmut_unit_diagnostic.utc(v->'claimedAtUTC');
    if phase not in ('D','R') or not helmut_unit_diagnostic.exact(v,array['ticketId','requestHash','claimedAtUTC'])
      or j#>>array['attempts',phase,'status'] not in ('sent','accounted','unknown')
      or v->>'ticketId' is distinct from j#>>array['attempts',phase,'ticketId']
      or v->>'requestHash' is distinct from j#>>array['attempts',phase,'requestHash'] then raise exception 'local-unit-store-send-claim-shape';end if;
  end loop;
  result_value:=d->(k||'result');
  if result_value->>'state'='pending' then
    if result_value is distinct from '{"state":"pending","evidenceHash":null,"positions":[]}'::jsonb then raise exception 'local-unit-store-pending-result';end if;
  elsif result_value->>'state'='retained-unreviewed' then
    if not helmut_unit_diagnostic.exact(result_value,array['state','evidenceHash','positions']) or jsonb_array_length(result_value->'positions')<>3
      or (select count(distinct value->>'bereich') from jsonb_array_elements(result_value->'positions'))<>3
      or exists(select from jsonb_array_elements(result_value->'positions') p where p->>'bereich' not in ('lage','mandatsbriefing','morgenbriefing')
        or p->>'owner' is distinct from c#>>'{units,0,subject}'
        or not exists(select from helmut_unit_diagnostic.artifacts x where x.scope_hash=s and x.kind=p->>'bereich' and x.body_hash=p->>'hash'))
      or not exists(select from helmut_unit_diagnostic.artifacts x where x.scope_hash=s and x.kind='evidence' and x.body_hash=result_value->>'evidenceHash') then
      raise exception 'local-unit-store-result-artifacts';end if;
  else raise exception 'local-unit-store-result-state';end if;
  if j->>'state'='closed' then
    if exists(select from helmut_unit_diagnostic.artifacts where scope_hash=s and kind='evidence' and body?'failure') then raise exception 'local-unit-store-failed-evidence-no-close';end if;
    verification:=(select body->'verification' from helmut_unit_diagnostic.artifacts where scope_hash=s and kind='evidence');
    perform helmut_unit_diagnostic.verify_controls(verification,s,j->>'claimId');
    if not helmut_unit_diagnostic.exact(j->'verification',array['authorizationHash','controlsHash','controlCount'])
      or j#>>'{verification,controlCount}' is distinct from '16'
      or j#>>'{verification,authorizationHash}' is distinct from helmut_unit_diagnostic.sha(helmut_unit_diagnostic.verification_canonical(verification->'authorization'))
      or j#>>'{verification,controlsHash}' is distinct from helmut_unit_diagnostic.sha(helmut_unit_diagnostic.verification_canonical(verification->'controls')) then raise exception 'local-unit-store-final-verification';end if;
  end if;
  if j->>'state'='closed' and (j->>'index'<>'1' or j->'inFlight'<>'null'::jsonb or j->>'stopRequested'<>'false'
    or j#>>'{attempts,D,status}' is distinct from 'accounted' or j#>>'{attempts,R,status}' is distinct from 'accounted'
    or result_value->>'state' is distinct from 'retained-unreviewed') then raise exception 'local-unit-store-close-receipts';end if;
end;$f$;

create function helmut_unit_diagnostic.state_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; k text; oj jsonb; nj jsonb; oc jsonb; nc jsonb; key text; phase text; old_status text; new_status text;
begin
  perform helmut_unit_diagnostic.parse(new.canonical_text,new.body_hash,33554432);
  perform helmut_unit_diagnostic.validate_state(new.scope_hash,new.body);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=new.scope_hash;
  k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';nj:=new.body->(k||'journal');nc:=new.body->(k||'costs');
  if tg_op='INSERT' then
    perform helmut_unit_diagnostic.fresh_runtime(new.scope_hash);
    if current_user <> 'helmut_ud_owner_'||right(current_database(),32) or new.revision<>0
      or nj is distinct from jsonb_build_object('operationId',a.operation_id,'commandHash',a.scope_hash,'state','installed','claimId',null,'index',0,'inFlight',null,'attempts','{}'::jsonb,'stopRequested',false,'reason',null)
      or nc->'slot' is distinct from a.command_canonical::jsonb->'slot' or nc->'calls'<>'{}'::jsonb
      or new.body->(k||'sendClaim')<>'{}'::jsonb then raise exception 'local-unit-store-native-initializer-only';end if;
    return new;
  end if;
  perform helmut_unit_diagnostic.runtime_role();
  if new.scope_hash is distinct from old.scope_hash or new.revision<>old.revision+1 or new.body_hash=old.body_hash
    or new.body is not distinct from old.body
    or new.body->(k||'reservation') is distinct from old.body->(k||'reservation')
    or new.body->'localUnitDiagnosticConsumedGrantsV1' is distinct from old.body->'localUnitDiagnosticConsumedGrantsV1' then raise exception 'local-unit-store-immutable-grant';end if;
  oj:=old.body->(k||'journal');oc:=old.body->(k||'costs');
  if oj->>'state'='closed' or oj->>'state'='stopped' or (oj->>'state'='unknown' and nj->>'state'<>'unknown')
    or (oj->>'stopRequested'='true' and nj->>'stopRequested'<>'true')
    or (oj->>'state'<>'installed' and (nj->>'state'='installed' or nj->>'claimId' is distinct from oj->>'claimId'
      or nj->>'claimedAtUTC' is distinct from oj->>'claimedAtUTC'))
    or (nj->>'state' not in ('closed') and (nj->>'index'<>'0' or (oj->>'state'<>'installed' and nj->'inFlight' is distinct from oj->'inFlight')))
    or (oj->>'state'='installed' and nj->>'state'<>'running') then raise exception 'local-unit-store-no-reopen-or-reclaim';end if;
  if oj->>'state'='installed' then
    perform helmut_unit_diagnostic.fresh_runtime(new.scope_hash);
    if coalesce(nj->>'claimId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      or not helmut_unit_diagnostic.exact(nj->'inFlight',array['index','enteredAtUTC','deadlineAtUTC'])
      or nj#>>'{inFlight,index}' is distinct from '0'
      or helmut_unit_diagnostic.utc(nj->'claimedAtUTC') < clock_timestamp()-interval '5 seconds'
      or helmut_unit_diagnostic.utc(nj->'claimedAtUTC') > clock_timestamp()
      or helmut_unit_diagnostic.utc(nj->'claimedAtUTC') < helmut_unit_diagnostic.utc(a.command_canonical::jsonb#>'{calendar,startsAtUTC}')
      or helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') is distinct from
        least(helmut_unit_diagnostic.utc(nj#>'{inFlight,enteredAtUTC}')+interval '60 seconds',a.expires_at)
      or helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') > a.expires_at
      or helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') <= clock_timestamp()
      or nj->'attempts'<>'{}'::jsonb then raise exception 'local-unit-store-native-once-claim';end if;
  end if;
  for key in select jsonb_object_keys(nc->'calls') except select jsonb_object_keys(oc->'calls') loop
    if nc#>>array['calls',key,'status'] is distinct from 'reserved' then raise exception 'local-unit-store-reserve-first';end if;
    if nj->>'state' is distinct from 'running' or nj->>'stopRequested' is distinct from 'false'
      or clock_timestamp()>=a.expires_at or clock_timestamp()>=helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') then raise exception 'local-unit-store-reserve-running-window';end if;
    perform helmut_unit_diagnostic.fresh_runtime(new.scope_hash);
  end loop;
  -- Every existing call/consumed binding and send claim survives exactly.
  for key in select jsonb_object_keys(oc->'calls') loop
    if not(nc->'calls'?key) or (nc#>array['calls',key])-array['status','cost','usageReceiptHash']
      is distinct from (oc#>array['calls',key])-array['status','cost','usageReceiptHash'] then raise exception 'local-unit-store-call-identity';end if;
    old_status:=oc#>>array['calls',key,'status'];new_status:=nc#>>array['calls',key,'status'];
    if (old_status='reserved' and new_status not in ('reserved','sent','unknown','not-sent'))
      or (old_status='sent' and new_status not in ('sent','accounted','unknown'))
      or (old_status in ('accounted','unknown','not-sent') and nc#>array['calls',key] is distinct from oc#>array['calls',key]) then raise exception 'local-unit-store-call-once';end if;
    if old_status='reserved' and new_status='sent' then
      if nj->>'state' is distinct from 'running' or nj->>'stopRequested' is distinct from 'false'
        or clock_timestamp()>=a.expires_at or clock_timestamp()>=helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') then raise exception 'local-unit-store-send-running-window';end if;
      perform helmut_unit_diagnostic.fresh_runtime(new.scope_hash);
    end if;
  end loop;
  for key in select jsonb_object_keys(oc#>'{slot,consumed}') loop
    if nc#>array['slot','consumed',key] is distinct from oc#>array['slot','consumed',key] then raise exception 'local-unit-store-consumed-intent-immutable';end if;
  end loop;
  foreach phase in array array['D','R'] loop
    if old.body->(k||'sendClaim')?phase and new.body#>array[k||'sendClaim',phase] is distinct from old.body#>array[k||'sendClaim',phase] then raise exception 'local-unit-store-send-claim-immutable';end if;
    if new.body->(k||'sendClaim')?phase and not(old.body->(k||'sendClaim')?phase) then
      key:=nj#>>array['attempts',phase,'ticketId'];
      if oc#>>array['calls',key,'status'] is distinct from 'reserved'
        or nc#>>array['calls',key,'status'] is distinct from 'sent'
        or oj#>>array['attempts',phase,'status'] is distinct from 'reserved'
        or nj#>>array['attempts',phase,'status'] is distinct from 'sent'
        or nj->>'state' is distinct from 'running' or nj->>'stopRequested' is distinct from 'false'
        or clock_timestamp()>=a.expires_at or clock_timestamp()>=helmut_unit_diagnostic.utc(nj#>'{inFlight,deadlineAtUTC}') then
        raise exception 'local-unit-store-new-send-claim-exact-transition';end if;
    end if;
  end loop;
  for key in select jsonb_object_keys(oc#>'{slot,draftCompletions}') loop
    if nc#>array['slot','draftCompletions',key] is distinct from oc#>array['slot','draftCompletions',key] then raise exception 'local-unit-store-D-completion-immutable';end if;
  end loop;
  for key in select jsonb_object_keys(oc#>'{slot,reviewBindings}') loop
    if nc#>array['slot','reviewBindings',key] is distinct from oc#>array['slot','reviewBindings',key] then raise exception 'local-unit-store-R-binding-immutable';end if;
  end loop;
  if old.body#>>array[k||'result','state']<>'pending' and new.body->(k||'result') is distinct from old.body->(k||'result') then raise exception 'local-unit-store-result-once';end if;
  -- Settlement/terminal evidence may finish after a timeout. New reservations,
  -- sends, outputs or a successful close may not be admitted after the deadline.
  if nj->>'state' in ('running','closed') and ((nj->'attempts') is distinct from (oj->'attempts') or nj->>'state'='closed')
    and (clock_timestamp()>=a.expires_at or clock_timestamp()>=helmut_unit_diagnostic.utc(case when nj->>'state'='closed' then oj#>'{inFlight,deadlineAtUTC}' else nj#>'{inFlight,deadlineAtUTC}' end)) then
    if exists(select from jsonb_each(nj->'attempts') e where e.value->>'status' in ('reserved','sent')) or nj->>'state'='closed' then raise exception 'local-unit-store-native-deadline';end if;
  end if;
  -- The real original CAS must already have completed in this same owner
  -- transaction. A raw PostgREST own-state write cannot mint this receipt.
  perform helmut_unit_diagnostic.original_bridge_receipt_v1(new.scope_hash,
    helmut_unit_diagnostic.sha(nj->>'claimId'),'state',old.body_hash,old.revision,
    new.canonical_text,new.body_hash,null,null,null);
  return new;
end;$f$;
create trigger state_validate before insert or update on helmut_unit_diagnostic.state
  for each row execute function helmut_unit_diagnostic.state_guard();
alter table helmut_unit_diagnostic.state enable always trigger state_validate;

create function helmut_unit_diagnostic.artifact_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; own_row helmut_unit_diagnostic.state%rowtype;
  d jsonb; k text; j jsonb; co jsonb; c jsonb; phase text; t jsonb; expected_parent text;
begin
  perform helmut_unit_diagnostic.runtime_role();
  perform helmut_unit_diagnostic.parse(new.canonical_text,new.body_hash,2097152);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=new.scope_hash;
  select * into strict own_row from helmut_unit_diagnostic.state where scope_hash=new.scope_hash for update;d:=own_row.body;
  k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';j:=d->(k||'journal');co:=d->(k||'costs');c:=a.command_canonical::jsonb;
  if new.owner_id is distinct from c#>>'{units,0,subject}' or j->>'state' not in ('running','unknown','stopped')
    or new.created_at < clock_timestamp()-interval '5 seconds' or new.created_at>clock_timestamp() then raise exception 'local-unit-store-artifact-scope';end if;
  if new.kind like 'usage-%' then
    phase:=right(new.kind,1);t:=co#>array['calls',new.logical_id,'ticket'];
    perform helmut_unit_diagnostic.utc(new.body->'createdAt');
    if co#>>array['calls',new.logical_id,'status'] is distinct from 'sent'
      or t#>>'{admission,phase}' is distinct from phase
      or not helmut_unit_diagnostic.exact(new.body,array['id','createdAt','model','promptTokens','completionTokens','totalTokens','estimatedCost','success','scopeHash','budgetTicketId','costIntentId','costPlanHash','costRequestHash','costPhase','runId','politicianId','costBasis'])
      or coalesce(new.body->>'id','') !~ '^[A-Za-z0-9_-]{1,200}$'
      or new.body->>'politicianId' is distinct from new.owner_id
      or new.body->>'runId' is distinct from co#>>'{slot,plan,runId}'
      or new.body->>'scopeHash' is distinct from new.scope_hash
      or new.body->>'budgetTicketId' is distinct from new.logical_id
      or new.body->>'costIntentId' is distinct from t#>>'{admission,intentId}'
      or new.body->>'costPlanHash' is distinct from t#>>'{admission,planHash}'
      or new.body->>'costRequestHash' is distinct from t#>>'{admission,actualRequestHash}'
      or new.body->>'costPhase' is distinct from phase
      or new.body->>'costBasis' is distinct from 'local-fixture-simulation-not-provider-charge'
      or new.body->>'model' is distinct from a.request_models->>phase
      or coalesce(new.body->>'promptTokens','') !~ '^[0-9]{1,6}$'
      or coalesce(new.body->>'completionTokens','') !~ '^[0-9]{1,4}$'
      or coalesce(new.body->>'totalTokens','') !~ '^[0-9]{1,6}$'
      or jsonb_typeof(new.body->'success') is distinct from 'boolean'
      or new.parent_hash is not null then raise exception 'local-unit-store-usage-artifact';end if;
    if (new.body->>'promptTokens')::bigint>272000
      or (new.body->>'completionTokens')::bigint>(case when phase='D' then 3000 else 6000 end)
      or (new.body->>'completionTokens')::bigint>coalesce((t->>'maxOutputTokens')::bigint,-1)
      or (new.body->>'totalTokens')::bigint<>(new.body->>'promptTokens')::bigint+(new.body->>'completionTokens')::bigint
      or (new.body->>'estimatedCost')::numeric*1000000 is distinct from
        ceil((275*(new.body->>'promptTokens')::numeric+2200*(new.body->>'completionTokens')::numeric)/1000) then
      raise exception 'local-unit-store-usage-arithmetic';end if;
    perform helmut_unit_diagnostic.original_bridge_receipt_v1(new.scope_hash,
      helmut_unit_diagnostic.sha(j->>'claimId'),'usage',own_row.body_hash,own_row.revision,
      new.canonical_text,new.body_hash,new.kind,new.logical_id,new.parent_hash);
    return new;
  end if;
  if new.kind<>'evidence' and (j->>'state'<>'running' or j->>'stopRequested'<>'false'
    or clock_timestamp()>=a.expires_at or clock_timestamp()>=helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}')) then raise exception 'local-unit-store-artifact-deadline';end if;
  if new.kind='draft' then
    if j#>>'{attempts,D,status}' is distinct from 'accounted' or new.body->>'slot' is distinct from 'lage-pruefentwurf'
      or new.body#>>'{payload,phase}' is distinct from 'entwurf' or new.parent_hash is not null then raise exception 'local-unit-store-draft-stage';end if;
  elsif new.kind='immutable-D' then
    select body_hash into strict expected_parent from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='draft';
    if new.body->'entry' is distinct from (select body from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='draft')
      or new.body->'completion' is distinct from co#>array['slot','draftCompletions',c#>>'{slot,plan,intents,0,id}'] then raise exception 'local-unit-store-immutable-D-stage';end if;
  elsif new.kind='review' then
    select body_hash into strict expected_parent from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='immutable-D';
    if j#>>'{attempts,R,status}' is distinct from 'accounted' or new.body#>>'{payload,phase}' is distinct from 'pruefung'
      or new.body->>'slot' is distinct from 'lage-pruefentwurf' then raise exception 'local-unit-store-review-stage';end if;
  elsif new.kind='lage' then
    select body_hash into strict expected_parent from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='review';
    if j#>>'{attempts,R,status}' is distinct from 'accounted' or new.body->>'slot' is distinct from 'lage' then raise exception 'local-unit-store-lage-stage';end if;
  elsif new.kind='mandatsbriefing' then
    select body_hash into strict expected_parent from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='lage';
    if new.body->>'slot' is distinct from 'mandatsbriefing' then raise exception 'local-unit-store-mandat-stage';end if;
  elsif new.kind='morgenbriefing' then
    select body_hash into strict expected_parent from helmut_unit_diagnostic.artifacts where scope_hash=new.scope_hash and kind='mandatsbriefing';
    if new.body->>'slot' is distinct from 'morgenlage' then raise exception 'local-unit-store-morning-stage';end if;
  elsif new.kind='evidence' then
    if new.body->>'failure' is distinct from 'unit-not-confirmed' then
      perform helmut_unit_diagnostic.verify_controls(new.body->'verification',new.scope_hash,j->>'claimId');
      if new.body#>>'{verification,authorization,startedAtUTC}' is distinct from j#>>'{inFlight,enteredAtUTC}' then raise exception 'local-unit-store-verification-native-entry';end if;
      if helmut_unit_diagnostic.utc(new.body#>'{verification,controls,15,completedAtUTC}')>clock_timestamp() then raise exception 'local-unit-store-verification-future';end if;
    end if;
    if new.logical_id<>'diagnostic-result' or new.body->>'operationId' is distinct from a.operation_id
      or new.body->>'commandHash' is distinct from a.scope_hash or new.parent_hash is not null then raise exception 'local-unit-store-evidence-stage';end if;
  else raise exception 'local-unit-store-artifact-kind';end if;
  if new.parent_hash is distinct from expected_parent then raise exception 'local-unit-store-parent-artifact';end if;
  if new.kind not in ('immutable-D','evidence') and
    (new.body->>'id' is distinct from new.logical_id or new.body->>'user_id' is distinct from new.owner_id
    or helmut_unit_diagnostic.utc(new.body->'generated_at') < helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}')
    or helmut_unit_diagnostic.utc(new.body->'generated_at') >= helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}')
    or to_char(helmut_unit_diagnostic.utc(new.body->'generated_at') at time zone 'UTC','YYYY-MM-DD') is distinct from co->>'day') then raise exception 'local-unit-store-output-owner-time';end if;
  perform helmut_unit_diagnostic.original_bridge_receipt_v1(new.scope_hash,
    helmut_unit_diagnostic.sha(j->>'claimId'),'artifact',own_row.body_hash,own_row.revision,
    new.canonical_text,new.body_hash,new.kind,new.logical_id,new.parent_hash);
  return new;
end;$f$;
create trigger artifacts_validate before insert on helmut_unit_diagnostic.artifacts
  for each row execute function helmut_unit_diagnostic.artifact_guard();
alter table helmut_unit_diagnostic.artifacts enable always trigger artifacts_validate;

create function helmut_unit_diagnostic.nonce(n text) returns void
language plpgsql immutable security invoker set search_path=pg_catalog
as $f$ begin if n is null or n !~ '^[a-f0-9]{64}$' then raise exception 'local-unit-store-fresh-nonce-required';end if;end;$f$;

create function helmut_unit_diagnostic.lease_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; s jsonb; j jsonb; until_at timestamptz;
begin
  perform helmut_unit_diagnostic.runtime_role();
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=new.scope_hash;
  select body into strict s from helmut_unit_diagnostic.state where scope_hash=new.scope_hash for update;
  j:=s->('localUnitDiagnostic:'||right(a.operation_id,32)||':journal');
  if new.claim_hash is distinct from helmut_unit_diagnostic.sha(j->>'claimId')
    or new.owner_id is distinct from a.command_canonical::jsonb#>>'{units,0,subject}'
    or new.job_name is distinct from 'lage-briefing-'||new.owner_id or not isfinite(new.expires_at) then raise exception 'local-unit-store-lease-owner';end if;
  if tg_op='UPDATE' then
    if new.scope_hash is distinct from old.scope_hash or new.claim_hash is distinct from old.claim_hash
      or new.owner_id is distinct from old.owner_id or new.job_name is distinct from old.job_name
      or new.revision<>old.revision+1 then raise exception 'local-unit-store-lease-binding';end if;
    if new.released then
      if old.released or old.expires_at<=clock_timestamp() or new.token<>old.token or new.expires_at<>old.expires_at then
        raise exception 'local-unit-store-lease-release-owner';end if;
      return new;
    end if;
    if not old.released and old.expires_at>clock_timestamp() then raise exception 'local-unit-store-lease-busy';end if;
    if new.token=old.token then raise exception 'local-unit-store-lease-successor-token';end if;
  elsif new.revision<>0 or new.released then raise exception 'local-unit-store-lease-initial';end if;
  perform helmut_unit_diagnostic.fresh_runtime(new.scope_hash);
  until_at:=helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}');
  if j->>'state'<>'running' or j->>'stopRequested'<>'false' or clock_timestamp()>=a.expires_at
    or new.expires_at<=clock_timestamp() or new.expires_at>until_at or new.expires_at>a.expires_at
    or new.expires_at>clock_timestamp()+interval '600 seconds' then raise exception 'local-unit-store-lease-window';end if;
  return new;
end;$f$;
create trigger leases_validate before insert or update on helmut_unit_diagnostic.leases
  for each row execute function helmut_unit_diagnostic.lease_guard();
alter table helmut_unit_diagnostic.leases enable always trigger leases_validate;

create function public.local_unit_diagnostic_lease_acquire_v1(p_scope_hash text,p_claim_hash text,p_job text,p_ttl_ms integer,p_nonce text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; s jsonb; j jsonb; l helmut_unit_diagnostic.leases%rowtype; t uuid; expiry timestamptz;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  if p_ttl_ms is null or p_ttl_ms<1 or p_ttl_ms>600000 then raise exception 'local-unit-store-lease-ttl';end if;
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  select body into strict s from helmut_unit_diagnostic.state where scope_hash=p_scope_hash for update;
  j:=s->('localUnitDiagnostic:'||right(a.operation_id,32)||':journal');
  if p_claim_hash is null or p_claim_hash is distinct from helmut_unit_diagnostic.sha(j->>'claimId')
    or p_job is distinct from 'lage-briefing-'||(a.command_canonical::jsonb#>>'{units,0,subject}') then raise exception 'local-unit-store-lease-claim';end if;
  select * into l from helmut_unit_diagnostic.leases where scope_hash=p_scope_hash for update;
  if found and not l.released and l.expires_at>clock_timestamp() then
    return jsonb_build_object('version','helmut-local-unit-diagnostic-lease-ack/1','scopeHash',p_scope_hash,'claimHash',p_claim_hash,'job',p_job,'acquired',false,'token',null,'nonce',p_nonce);end if;
  t:=gen_random_uuid();expiry:=least(clock_timestamp()+p_ttl_ms*interval '1 millisecond',helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}'),a.expires_at);
  if l.scope_hash is null then
    insert into helmut_unit_diagnostic.leases values(p_scope_hash,p_claim_hash,a.command_canonical::jsonb#>>'{units,0,subject}',p_job,t,expiry,false,0) returning * into strict l;
  else
    update helmut_unit_diagnostic.leases set token=t,expires_at=expiry,released=false,revision=revision+1 where scope_hash=p_scope_hash returning * into strict l;
  end if;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-lease-ack/1','scopeHash',p_scope_hash,'claimHash',p_claim_hash,'job',p_job,'acquired',true,'token',l.token::text,'revision',l.revision,
    'expiresAtUTC',to_char(l.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'nonce',p_nonce);
end;$f$;

create function public.local_unit_diagnostic_lease_release_v1(p_scope_hash text,p_claim_hash text,p_job text,p_token uuid,p_nonce text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; s jsonb; j jsonb; l helmut_unit_diagnostic.leases%rowtype; success boolean:=false;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  select body into strict s from helmut_unit_diagnostic.state where scope_hash=p_scope_hash for update;
  j:=s->('localUnitDiagnostic:'||right(a.operation_id,32)||':journal');
  if p_claim_hash is null or p_claim_hash is distinct from helmut_unit_diagnostic.sha(j->>'claimId')
    or p_job is distinct from 'lage-briefing-'||(a.command_canonical::jsonb#>>'{units,0,subject}') then raise exception 'local-unit-store-lease-claim';end if;
  select * into l from helmut_unit_diagnostic.leases where scope_hash=p_scope_hash for update;
  if found and l.token=p_token and l.claim_hash=p_claim_hash and l.job_name=p_job and not l.released and l.expires_at>clock_timestamp() then
    update helmut_unit_diagnostic.leases set released=true,revision=revision+1 where scope_hash=p_scope_hash;success:=true;end if;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-lease-release/1','scopeHash',p_scope_hash,'claimHash',p_claim_hash,'job',p_job,'released',success,'nonce',p_nonce);
end;$f$;

create function public.local_unit_diagnostic_contract_v1() returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare sources jsonb; owner_id oid; r name := current_user;
begin
  perform helmut_unit_diagnostic.runtime_role();
  select oid into strict owner_id from pg_roles where rolname='helmut_ud_owner_'||right(current_database(),32);
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic'
    and c.relname in ('authority','runtime_observations','state','artifacts','leases','legacy_read_rpcs') and c.relkind='r' and not c.relispartition and c.relowner=owner_id)<>6
    or exists(select from pg_inherits i join pg_class c on c.oid in (i.inhrelid,i.inhparent) join pg_namespace n on n.oid=c.relnamespace where n.nspname='helmut_unit_diagnostic')
    or (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='helmut_unit_diagnostic' and not t.tgisinternal and t.tgenabled='A')<>12
    or exists(select from helmut_unit_diagnostic.legacy_read_rpcs q left join pg_proc p on p.oid=q.function_oid where p.oid is null or p.prosecdef or p.provolatile not in ('i','s') or p.proconfig is distinct from array['search_path=pg_catalog']::text[] or p.proname<>q.function_name or oidvectortypes(p.proargtypes)<>q.identity_arguments or helmut_unit_diagnostic.sha(p.prosrc)<>q.prosrc_sha256)
    or has_table_privilege(r,'helmut_unit_diagnostic.legacy_read_rpcs','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege(r,'helmut_unit_diagnostic.authority','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege(r,'helmut_unit_diagnostic.runtime_observations','INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege(r,'helmut_unit_diagnostic.state','INSERT,DELETE,TRUNCATE')
    or has_table_privilege(r,'helmut_unit_diagnostic.artifacts','UPDATE,DELETE,TRUNCATE') then raise exception 'local-unit-store-contract-catalog';end if;
  select jsonb_object_agg(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',helmut_unit_diagnostic.sha(p.prosrc)) into sources
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='helmut_unit_diagnostic'
      or p.oid in ('public.local_unit_diagnostic_contract_v1()'::regprocedure,
          'public.local_unit_diagnostic_authority_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_runtime_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_control_runtime_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_control_snapshot_read_v1(text,text,integer,text,jsonb,text)'::regprocedure,
          'public.local_unit_diagnostic_state_read_v1(text,text)'::regprocedure,
          'public.local_unit_diagnostic_state_cas_v1(text,text,text,bigint,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_artifact_insert_v1(text,text,text,text,text,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_artifact_read_v1(text,text,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_acquire_v1(text,text,text,integer,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_release_v1(text,text,text,uuid,text)'::regprocedure))
      and p.proowner=owner_id and not p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[];
  return jsonb_build_object('version','helmut-local-unit-diagnostic-native-store/1','database',current_database(),
    'databaseOID',(select oid::text from pg_database where datname=current_database()),'sources',sources,'legacyReadRPCs',(select coalesce(jsonb_agg(jsonb_build_object('name',function_name,'oid',function_oid::text,'identityArguments',identity_arguments,'prosrcSHA256',prosrc_sha256,'qualificationPin',qualification_pin) order by function_name),'[]'::jsonb) from helmut_unit_diagnostic.legacy_read_rpcs where http_exposed),'sourceQualified',false);
end;$f$;

create function public.local_unit_diagnostic_authority_read_v1(p_scope_hash text,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  if clock_timestamp()>=a.expires_at then raise exception 'local-unit-store-authority-expired';end if;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-authority-witness/1','scopeHash',a.scope_hash,'operationId',a.operation_id,
    'commandCanonical',a.command_canonical,'admissionCanonical',a.admission_canonical,'admissionHash',a.admission_hash,
    'sourceHash',a.source_hash,'targetHash',a.target_hash,'sourceProofHash',a.source_proof_hash,'verifierCodeHash',a.verifier_code_hash,
    'gateHashes',a.gate_hashes,'codeManifestPin',a.code_manifest_pin,'runtimeManifestPin',a.runtime_manifest_pin,
    'requestModels',a.request_models,
    'verifiedAtUTC',to_char(a.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAtUTC',to_char(a.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'nonce',p_nonce,
    'tableOID','helmut_unit_diagnostic.authority'::regclass::oid::text);
end;$f$;

create function public.local_unit_diagnostic_runtime_read_v1(p_scope_hash text,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare r helmut_unit_diagnostic.runtime_observations%rowtype;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  r:=helmut_unit_diagnostic.fresh_runtime(p_scope_hash);
  return jsonb_build_object('version','helmut-local-unit-diagnostic-runtime-witness/1','scopeHash',p_scope_hash,
    'ordinal',r.ordinal,'canonical',r.proof_canonical,'hash',r.proof_hash,
    'observedAtUTC',to_char(r.observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'nonce',p_nonce);
end;$f$;

create function public.local_unit_diagnostic_state_read_v1(p_scope_hash text,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare s helmut_unit_diagnostic.state%rowtype;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  select * into strict s from helmut_unit_diagnostic.state where scope_hash=p_scope_hash;
  perform helmut_unit_diagnostic.validate_state(p_scope_hash,s.body);
  return jsonb_build_object('version','helmut-local-unit-diagnostic-state-witness/1','scopeHash',p_scope_hash,
    'canonical',s.canonical_text,'hash',s.body_hash,'revision',s.revision,'nonce',p_nonce);
end;$f$;

-- Fixed two-step control transport. These readers mint no claim, lease or ACK.
create function public.local_unit_diagnostic_control_runtime_read_v1(p_scope_hash text,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare catalog jsonb; runtime jsonb;
begin
  -- Reuse the unchanged catalog/role and runtime checks, in this fresh request.
  catalog:=public.local_unit_diagnostic_contract_v1();
  runtime:=public.local_unit_diagnostic_runtime_read_v1(p_scope_hash,p_nonce);
  return jsonb_build_object('version','helmut-local-unit-control-runtime/1','scopeHash',p_scope_hash,
    'nonce',p_nonce,'catalog',catalog,'runtime',runtime);
end;$f$;

create function public.local_unit_diagnostic_control_snapshot_read_v1(p_scope_hash text,p_claim_hash text,p_control_index integer,p_stage text,p_graph_request jsonb,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; command jsonb; original jsonb; documents jsonb; knowledge jsonb;
  profiles jsonb; catalog jsonb; own_state jsonb; own_body jsonb; subject text; ids_d text[]; ids_k text[];
  stages text[]:=array['unit-enter','before-D','reserve-D','send-D','D-accounted','before-R','D-retained','reserve-R','send-R',
    'R-accounted','R-retained','before-lage-save','after-lage-save','before-briefing-materialize','before-morning-insert','before-evidence-retention'];
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  if p_claim_hash is null or p_claim_hash !~ '^[a-f0-9]{64}$' or p_control_index not between 0 and 15
    or p_control_index is null or p_stage is distinct from stages[p_control_index+1]
    or not helmut_unit_diagnostic.exact(p_graph_request,array['id','knownProof','readNonce','knownGraph'])
    or p_graph_request->>'id' is distinct from 'main-auth' then raise exception 'local-unit-store-control-request';end if;
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  if clock_timestamp()>=a.expires_at then raise exception 'local-unit-store-authority-expired';end if;
  command:=helmut_unit_diagnostic.parse(a.command_canonical,a.scope_hash,16777216);
  subject:=command#>>'{units,0,subject}';
  select coalesce(array_agg(x->>'id' order by x->>'id'),'{}'::text[]) into ids_d from jsonb_array_elements(command#>'{drafts,0,sources,documents}') x;
  select coalesce(array_agg(x->>'id' order by x->>'id'),'{}'::text[]) into ids_k from jsonb_array_elements(command#>'{drafts,0,sources,knowledgeObjects}') x;
  if cardinality(ids_d)>4000 or cardinality(ids_k)>4000 then raise exception 'local-unit-store-control-input-cap';end if;
  -- The actual unchanged Original graph/history protocol executes first. Its
  -- complete response goes to U.readControl; Own7 is never an Original proof.
  catalog:=public.local_unit_diagnostic_contract_v1();
  original:=public.helmut_auth_state_graph_read_v1(p_graph_request);
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'summary',d.summary,'canonical_url',d.canonical_url,'url',d.url,'content_hash',d.content_hash,'source_id',d.source_id,'source_name',d.source_name,'source_type',d.source_type,'document_type',d.document_type,'link_type',d.link_type,'confidence',d.confidence,'published_at',d.published_at,'retrieved_at',d.retrieved_at,'created_at',d.created_at,'quellenauszug_beleg',d.raw->'helmutQuellenkontext','dip_quellfelder',d.raw->'helmutDipQuellfelder','bundestag_artikelstand',d.raw->'helmutBundestagArtikelstand','berlin_artikelstand',d.raw->'helmutBerlinArtikelstand','brandenburg_artikelstand',d.raw->'helmutBrandenburgLandtagPresseArtikelstand','bundestag_abgerufen_at',d.retrieved_at,'berlin_abgerufen_at',d.retrieved_at,'brandenburg_abgerufen_at',d.retrieved_at) order by d.id),'[]'::jsonb) into documents
    from public.raw_documents d where d.id=any(ids_d);
  select coalesce(jsonb_agg(jsonb_build_object('id',k.id,'vorgang_id',k.vorgang_id,'ko_version',k.ko_version,'headline',k.headline,'was_ist_passiert',k.was_ist_passiert,'warum_wichtig',k.warum_wichtig,'wer_ist_betroffen',k.wer_ist_betroffen,'parteien',k.parteien,'ausschuesse',k.ausschuesse,'ministerien',k.ministerien,'risiken',k.risiken,'chancen',k.chancen,'zeitdruck',k.zeitdruck,'handlungsempfehlung',k.handlungsempfehlung,'confidence_score',k.confidence_score,'source_document_count',k.source_document_count,'status',k.status,'understanding_status',k.understanding_status,'mentioned_people',k.mentioned_people,'mentioned_mps',k.mentioned_mps,'mentioned_parties',k.mentioned_parties,'mentioned_committees',k.mentioned_committees,'mentioned_ministries',k.mentioned_ministries,'mentioned_locations',k.mentioned_locations,'mentioned_organizations',k.mentioned_organizations,'policy_field',k.policy_field,'political_level',k.political_level,'instrument',k.instrument,'stage',k.stage,'tags',k.tags,'deadline',k.deadline,'best_source_url',k.best_source_url,'best_link_type',k.best_link_type,'source_trust',k.source_trust,'understanding_model',k.understanding_model,'understanding_tokens',k.understanding_tokens,'created_at',k.created_at,'updated_at',k.updated_at,'display_title',k.display_title,'display_summary',k.display_summary) || jsonb_build_object('why_relevant',k.why_relevant,'recommendation',k.recommendation,'display_category',k.display_category,'risk_of_no_action',k.risk_of_no_action,'opportunity_summary',k.opportunity_summary,'recommended_communication',k.recommended_communication,'action_items',k.action_items,'risk_level',k.risk_level,'opportunity_level',k.opportunity_level,'recommended_communication_struct',k.recommended_communication_struct,'action_items_struct',k.action_items_struct,'decision_level',k.decision_level,'related_levels',k.related_levels,'event_type',k.event_type,'affected_geographies',k.affected_geographies,'mentioned_geographies',k.mentioned_geographies,'decision_entities',k.decision_entities,'related_entities',k.related_entities,'classification_confidence',k.classification_confidence,'verstehen_fencing',k.verstehen_fencing) order by k.id),'[]'::jsonb) into knowledge
    from public.knowledge_objects k where k.id=any(ids_k);
  select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('mandate_profiles',
    (select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.mandate_profiles m where m.user_id=p.id))),'[]'::jsonb)
    into profiles from public.profiles p where p.id=subject;
  -- Same native reader/validation and actual persisted canonical body as the
  -- old final control read. No lock, authority or mutation is added here.
  own_state:=public.local_unit_diagnostic_state_read_v1(p_scope_hash,p_nonce);
  own_body:=helmut_unit_diagnostic.parse(own_state->>'canonical',own_state->>'hash',33554432);
  if helmut_unit_diagnostic.sha(own_body#>>array['localUnitDiagnostic:'||right(a.operation_id,32)||':journal','claimId'])
    is distinct from p_claim_hash then raise exception 'local-unit-store-control-claim';end if;
  return jsonb_build_object('version','helmut-local-unit-control-snapshot/1','scopeHash',p_scope_hash,'operationId',a.operation_id,
    'claimHash',p_claim_hash,'index',p_control_index,'stage',p_stage,'nonce',p_nonce,
    'catalog',catalog,'original',original,'documents',documents,'knowledgeObjects',knowledge,'profiles',profiles,'state',own_state);
end;$f$;

create function public.local_unit_diagnostic_state_cas_v1(p_scope_hash text,p_claim_hash text,p_old_hash text,p_old_revision bigint,p_next_canonical text,p_next_hash text,p_nonce text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $f$
declare s helmut_unit_diagnostic.state%rowtype; a helmut_unit_diagnostic.authority%rowtype; d jsonb; k text; cid text;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  d:=helmut_unit_diagnostic.parse(p_next_canonical,p_next_hash,33554432);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  select * into strict s from helmut_unit_diagnostic.state where scope_hash=p_scope_hash for update;
  if s.body_hash is distinct from p_old_hash or s.revision is distinct from p_old_revision then raise exception using errcode='40001',message='local-unit-store-state-cas-conflict';end if;
  k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';cid:=d#>>array[k||'journal','claimId'];
  if p_claim_hash is null or p_claim_hash is distinct from helmut_unit_diagnostic.sha(cid) then raise exception 'local-unit-store-claim-hash';end if;
  update helmut_unit_diagnostic.state set canonical_text=p_next_canonical,body_hash=p_next_hash,body=d,revision=revision+1
    where scope_hash=p_scope_hash and body_hash=p_old_hash and revision=p_old_revision returning * into strict s;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-state-ack/1','scopeHash',p_scope_hash,
    'hash',s.body_hash,'revision',s.revision,'claimHash',p_claim_hash,'nonce',p_nonce)
    ||case when s.body#>>array[k||'journal','state']='closed' then s.body#>array[k||'journal','verification'] else '{}'::jsonb end;
end;$f$;

create function public.local_unit_diagnostic_artifact_insert_v1(p_scope_hash text,p_claim_hash text,p_kind text,p_logical_id text,p_canonical text,p_sha256 text,p_parent_hash text,p_nonce text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog
as $f$
declare a helmut_unit_diagnostic.authority%rowtype; s helmut_unit_diagnostic.state%rowtype; d jsonb; k text; row_saved helmut_unit_diagnostic.artifacts%rowtype;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  d:=helmut_unit_diagnostic.parse(p_canonical,p_sha256,2097152);
  select * into strict a from helmut_unit_diagnostic.authority where scope_hash=p_scope_hash;
  select * into strict s from helmut_unit_diagnostic.state where scope_hash=p_scope_hash for update;
  k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';
  if p_claim_hash is null or p_claim_hash is distinct from helmut_unit_diagnostic.sha(s.body#>>array[k||'journal','claimId']) then raise exception 'local-unit-store-artifact-claim';end if;
  -- Deliberately no ON CONFLICT, UPDATE, replacement, retry or fallback.
  insert into helmut_unit_diagnostic.artifacts(scope_hash,owner_id,kind,logical_id,canonical_text,body_hash,parent_hash,body)
    values(p_scope_hash,a.command_canonical::jsonb#>>'{units,0,subject}',p_kind,p_logical_id,p_canonical,p_sha256,p_parent_hash,d)
    returning * into strict row_saved;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-artifact-ack/1','scopeHash',p_scope_hash,
    'kind',p_kind,'logicalId',p_logical_id,'hash',row_saved.body_hash,'stateRevision',s.revision,'nonce',p_nonce);
end;$f$;

create function public.local_unit_diagnostic_artifact_read_v1(p_scope_hash text,p_kind text,p_logical_id text,p_expected_sha256 text,p_nonce text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog
as $f$
declare r helmut_unit_diagnostic.artifacts%rowtype;
begin
  perform helmut_unit_diagnostic.runtime_role();perform helmut_unit_diagnostic.nonce(p_nonce);
  select * into r from helmut_unit_diagnostic.artifacts where scope_hash=p_scope_hash and kind=p_kind and logical_id=p_logical_id;
  if not found then
    if p_expected_sha256 is not null then raise exception 'local-unit-store-required-artifact-missing';end if;
    return jsonb_build_object('version','helmut-local-unit-diagnostic-artifact-witness/1','scopeHash',p_scope_hash,
      'kind',p_kind,'logicalId',p_logical_id,'missing',true,'nonce',p_nonce);
  end if;
  if p_expected_sha256 is not null and r.body_hash is distinct from p_expected_sha256 then raise exception 'local-unit-store-artifact-hash-drift';end if;
  return jsonb_build_object('version','helmut-local-unit-diagnostic-artifact-witness/1','scopeHash',p_scope_hash,
    'kind',p_kind,'logicalId',p_logical_id,'owner',r.owner_id,'canonical',r.canonical_text,'hash',r.body_hash,'parentHash',r.parent_hash,'nonce',p_nonce);
end;$f$;

do $permissions$
declare runtime_name text := 'helmut_ud_runtime_'||right(current_database(),32); t record; f record;
begin
  for t in select tablename from pg_tables where schemaname='helmut_unit_diagnostic' loop
    execute format('alter table helmut_unit_diagnostic.%I enable row level security',t.tablename);
    execute format('create policy runtime_read on helmut_unit_diagnostic.%I for select to %I using (true)',t.tablename,runtime_name);
    execute format('grant select on helmut_unit_diagnostic.%I to %I',t.tablename,runtime_name);
  end loop;
  execute format('create policy runtime_update on helmut_unit_diagnostic.state for update to %I using (true) with check (true)',runtime_name);
  execute format('create policy runtime_insert on helmut_unit_diagnostic.artifacts for insert to %I with check (true)',runtime_name);
  execute format('grant update on helmut_unit_diagnostic.state to %I',runtime_name);
  execute format('grant insert on helmut_unit_diagnostic.artifacts to %I',runtime_name);
  execute format('create policy runtime_insert on helmut_unit_diagnostic.leases for insert to %I with check (true)',runtime_name);
  execute format('create policy runtime_update on helmut_unit_diagnostic.leases for update to %I using (true) with check (true)',runtime_name);
  execute format('grant insert,update on helmut_unit_diagnostic.leases to %I',runtime_name);
  execute format('grant usage on schema helmut_unit_diagnostic to %I',runtime_name);
  for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proowner=(select oid from pg_roles where rolname=current_user)
      and (n.nspname='helmut_unit_diagnostic' or p.oid in (
        'public.local_unit_diagnostic_contract_v1()'::regprocedure,
        'public.local_unit_diagnostic_authority_read_v1(text,text)'::regprocedure,
        'public.local_unit_diagnostic_runtime_read_v1(text,text)'::regprocedure,
        'public.local_unit_diagnostic_control_runtime_read_v1(text,text)'::regprocedure,
        'public.local_unit_diagnostic_control_snapshot_read_v1(text,text,integer,text,jsonb,text)'::regprocedure,
        'public.local_unit_diagnostic_state_read_v1(text,text)'::regprocedure,
        'public.local_unit_diagnostic_state_cas_v1(text,text,text,bigint,text,text,text)'::regprocedure,
        'public.local_unit_diagnostic_artifact_insert_v1(text,text,text,text,text,text,text,text)'::regprocedure,
        'public.local_unit_diagnostic_artifact_read_v1(text,text,text,text,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_acquire_v1(text,text,text,integer,text)'::regprocedure,
          'public.local_unit_diagnostic_lease_release_v1(text,text,text,uuid,text)'::regprocedure)) loop
    execute format('revoke all on function %s from public',f.name);
    execute format('grant execute on function %s to %I',f.name,runtime_name);
  end loop;
end;$permissions$;
reset role;
commit;
