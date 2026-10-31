-- INERT, LOCAL EXPERIMENT ONLY. Not a Production migration or activation.
-- Existing llm_usage and helmut_store only; no new service/table.
-- Reused usage-only proposal from #921, with exact v5/v6 order binding,
-- complete scalar projections and fail-closed NULL chain validation.
-- Apply only to a NEW drained isolated test COPY with writers stopped.
-- Rollback is helmut_auth_usage_restore_v1 below: it reconstructs the full
-- logical state under its row lock and RETAINS every relational history row.
-- Do not drop the added columns/functions/history as a rollback.
begin;
-- The original W15 dump predates these additive scalar projections. The973
-- component fixture already had them; preserve the complete existing schema
-- and rows while making this explicitly local proposal work on the real dump.
do $local$ begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on' then
    raise exception 'atomic-usage-local-only';
  end if;
end;$local$;
alter table public.llm_usage add column if not exists kein_aufruf boolean not null default false;
alter table public.llm_usage add column if not exists source_id text;
alter table public.llm_usage add column if not exists package_id text;
alter table public.llm_usage add column if not exists vorgang_id text;
alter table public.llm_usage add column if not exists knowledge_object_id text;
alter table public.llm_usage add column usage_store_id text;
alter table public.llm_usage add column usage_generation text;
alter table public.llm_usage add column usage_ordinal bigint;
alter table public.llm_usage add column usage_record jsonb;
alter table public.llm_usage add column usage_prev_hash text;
-- jsonb_send is a PostgreSQL IMMUTABLE builtin. In the explicitly checked
-- UTF8 local connection, its version-1 payload is exactly JSONB::text UTF8.
-- Generated values are recomputed by PostgreSQL even if a row trigger is
-- disabled: these hashes are not mutable claims supplied by an application.
alter table public.llm_usage add column usage_record_hash text generated always as
  (encode(sha256(substring(jsonb_send(usage_record) from 2)),'hex')) stored;
alter table public.llm_usage add column usage_chain_hash text generated always as
  (encode(sha256((usage_prev_hash||encode(sha256(substring(jsonb_send(usage_record) from 2)),'hex'))::bytea),'hex')) stored;
create unique index helmut_usage_generation_ordinal_local on public.llm_usage(usage_store_id,usage_generation,usage_ordinal)
  where usage_store_id is not null;
alter table public.llm_usage enable row level security;
revoke all on public.llm_usage from public;
do $roles$ begin
  if exists(select from pg_roles where rolname='anon') then execute 'revoke all on public.llm_usage from anon'; end if;
  if exists(select from pg_roles where rolname='authenticated') then execute 'revoke all on public.llm_usage from authenticated'; end if;
end;$roles$;
grant select,insert on public.llm_usage to service_role;

create function public.helmut_auth_usage_guard_local_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $f$
declare seal jsonb; old_ref jsonb; new_ref jsonb;
begin
  if tg_op='TRUNCATE' then
    if exists(select from public.llm_usage where usage_store_id is not null)
      or exists(select from public.helmut_store where data ? '_llmUsageRef') then
      raise exception 'atomic-usage-truncate-forbidden';
    end if;
    return null;
  end if;
  seal:=nullif(current_setting('helmut.atomic_usage_seal',true),'')::jsonb;
  if tg_table_name='llm_usage' then
    if tg_op='INSERT' then
      if new.usage_store_id is null then
        if new.usage_record is not null or new.usage_generation is not null or new.usage_ordinal is not null
          or new.usage_prev_hash is not null or new.usage_record_hash is not null or new.usage_chain_hash is not null then
          raise exception 'atomic-usage-unbound-record';
        end if;
        return new;
      end if;
      if seal->>'id' is distinct from new.usage_store_id or seal->>'gen' is distinct from new.usage_generation
        or (seal->>'action') not in ('bootstrap','write') or seal is null
        or jsonb_typeof(new.usage_record) is distinct from 'object' or new.usage_record->>'id' is distinct from new.id
        or new.usage_ordinal<1 or new.usage_ordinal is null or new.usage_prev_hash !~ '^[a-f0-9]{64}$'
        or new.usage_prev_hash is null or current_setting('server_encoding')<>'UTF8'
        or current_setting('client_encoding')<>'UTF8' then raise exception 'atomic-usage-direct-insert-forbidden'; end if;
      return new;
    end if;
    if old.usage_store_id is not null or (tg_op='UPDATE' and new.usage_store_id is not null) then
      raise exception 'atomic-usage-history-immutable';
    end if;
    if tg_op='UPDATE' and (new.usage_record is not null or new.usage_generation is not null or new.usage_ordinal is not null
      or new.usage_prev_hash is not null or new.usage_record_hash is not null or new.usage_chain_hash is not null) then
      raise exception 'atomic-usage-unbound-record';
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op<>'INSERT' then old_ref:=old.data->'_llmUsageRef'; end if;
  if tg_op<>'DELETE' then new_ref:=new.data->'_llmUsageRef'; end if;
  if old_ref is null and new_ref is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' or seal is null or seal->>'id' is distinct from new.id then
    raise exception 'atomic-usage-direct-auth-write-forbidden';
  end if;
  if new_ref is null then
    if seal->>'action' is distinct from 'restore' or jsonb_typeof(new.data->'llmUsage') is distinct from 'array' then
      raise exception 'atomic-usage-invalid-restore';
    end if;
  else
    if new.data ? 'llmUsage' or new_ref->>'version' is distinct from 'relational-atomic-v1'
      or new_ref->>'generation' is distinct from seal->>'gen'
      or (old_ref is null and seal->>'action' is distinct from 'bootstrap')
      or (old_ref is not null and (seal->>'action' is distinct from 'write'
        or new_ref->>'generation' is distinct from old_ref->>'generation'
        or new_ref->>'originalHash' is distinct from old_ref->>'originalHash')) then
      raise exception 'atomic-usage-invalid-auth-binding';
    end if;
  end if;
  return new;
end;$f$;
create trigger helmut_usage_record_immutable_local before insert or update or delete on public.llm_usage
  for each row execute function public.helmut_auth_usage_guard_local_v1();
alter table public.llm_usage enable always trigger helmut_usage_record_immutable_local;
create trigger helmut_usage_auth_bound_local before insert or update or delete on public.helmut_store
  for each row execute function public.helmut_auth_usage_guard_local_v1();
alter table public.helmut_store enable always trigger helmut_usage_auth_bound_local;
create trigger helmut_usage_no_truncate_local before truncate on public.llm_usage
  for each statement execute function public.helmut_auth_usage_guard_local_v1();
alter table public.llm_usage enable always trigger helmut_usage_no_truncate_local;
create trigger helmut_usage_auth_no_truncate_local before truncate on public.helmut_store
  for each statement execute function public.helmut_auth_usage_guard_local_v1();
alter table public.helmut_store enable always trigger helmut_usage_auth_no_truncate_local;

-- Internal insert helper. The ALWAYS trigger requires the RPC's transaction
-- seal; calling this helper directly does not acquire one.
create function public.helmut_auth_usage_insert_local_v1(s text,g text,n bigint,h text,r jsonb) returns text
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare result text;
begin
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string'
    or length(r->>'id') not between 1 and 256 or jsonb_typeof(r->'createdAt') is distinct from 'string' then
    raise exception 'atomic-usage-invalid-entry';
  end if;
  insert into public.llm_usage(id,created_at,tenant_id,profile_id,run_id,pipeline_step,politician_id,user_id,
    model,call_type,prompt_tokens,completion_tokens,total_tokens,estimated_cost,duration_ms,success,error,
    kein_aufruf,source_id,package_id,vorgang_id,knowledge_object_id,usage_store_id,usage_generation,usage_ordinal,usage_record,usage_prev_hash)
  values(r->>'id',(r->>'createdAt')::timestamptz,r->>'tenantId',r->>'profileId',r->>'runId',r->>'pipelineStep',
    r->>'politicianId',r->>'userId',r->>'model',r->>'callType',
    case when jsonb_typeof(r->'promptTokens')='number' then (r->>'promptTokens')::numeric::integer end,
    case when jsonb_typeof(r->'completionTokens')='number' then (r->>'completionTokens')::numeric::integer end,
    case when jsonb_typeof(r->'totalTokens')='number' then (r->>'totalTokens')::numeric::integer end,
    case when jsonb_typeof(r->'estimatedCost')='number' then (r->>'estimatedCost')::numeric end,
    case when jsonb_typeof(r->'durationMs')='number' then (r->>'durationMs')::numeric::integer end,
    case when jsonb_typeof(r->'success')='boolean' then (r->>'success')::boolean end,r->>'error',
    coalesce(r->'keinAufruf'='true'::jsonb,false),r->>'sourceId',r->>'packageId',r->>'vorgangId',r->>'knowledgeObjectId',s,g,n,r,h)
  returning usage_chain_hash into result;
  return result;
end;$f$;

create function public.helmut_auth_usage_bootstrap_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb; m jsonb; r jsonb; records jsonb; i integer; s text; g text; h text; original text; n bigint:=0;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on' then raise exception 'atomic-usage-local-only'; end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>2
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256
    or ($1->>'expectedHash') !~ '^[a-f0-9]{64}$' or $1->>'expectedHash' is null then raise exception 'atomic-usage-bootstrap-input'; end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s for update;
  original:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
  if original is distinct from $1->>'expectedHash' or a ? '_llmUsageRef'
    or jsonb_typeof(a->'llmUsage') is distinct from 'array'
    or (a#>'{testKostenAuftrag,version}' is distinct from '5'::jsonb
      and (a#>'{testKostenAuftrag,version}' is distinct from '6'::jsonb
        or a#>>'{testKostenAuftrag,orderRenewalHash}' is distinct from 'a649603fa8f18c6a3db65aab09b67e15d6bda80befa20e5394bce7eeda1d6415'))
    or a#>>'{testKostenAuftrag,serviceContractHash}' is distinct from '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f' then
    raise exception 'atomic-usage-bootstrap-state'; end if;
  -- Only an explicitly drained NEW local test copy may be converted. Reject
  -- any existing owned generation, rather than silently adopting duplicates.
  if exists(select from public.llm_usage where usage_store_id=s) then raise exception 'atomic-usage-generation-already-exists'; end if;
  g:=gen_random_uuid()::text;h:=encode(sha256(convert_to(s||'|'||g||'|'||original,'UTF8')),'hex');
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',g,'action','bootstrap')::text,true);
  records:=a->'llmUsage';
  for i in reverse (jsonb_array_length(records)-1)..0 loop
    r:=records->i;n:=n+1;h:=public.helmut_auth_usage_insert_local_v1(s,g,n,h,r);
  end loop;
  m:=jsonb_build_object('version','relational-atomic-v1','generation',g,'count',n,'head',h,'originalHash',original);
  update public.helmut_store set data=(a-'llmUsage')||jsonb_build_object('_llmUsageRef',m,'_authStoreRevision',gen_random_uuid()::text)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);
  return jsonb_build_object('id',s,'proof',m-'version');
end;$f$;

create function public.helmut_auth_usage_read_v1(jsonb) returns jsonb
-- STABLE is intentional: every internal SELECT sees the calling statement's
-- SAME MVCC snapshot. It also permits a genuinely READ ONLY native audit.
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a jsonb; m jsonb; rows_json jsonb; s text; seed text; n bigint; lo bigint; hi bigint; valid boolean; head text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on' then raise exception 'atomic-usage-local-only'; end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>1
    or jsonb_typeof($1->'id') is distinct from 'string' then raise exception 'atomic-usage-read-input'; end if;
  if current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'atomic-usage-encoding';end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s;
  m:=a->'_llmUsageRef';
  if jsonb_typeof(m) is distinct from 'object' or (select count(*)from jsonb_object_keys(m))<>5
    or m->>'version' is distinct from 'relational-atomic-v1' or a ? 'llmUsage'
    or m->>'generation' is null or m->>'generation' !~ '^[a-f0-9-]{36}$'
    or m->>'originalHash' is null or m->>'originalHash' !~ '^[a-f0-9]{64}$'
    or m->>'head' is null or m->>'head' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(m->'count') is distinct from 'number' or m->>'count' !~ '^(0|[1-9][0-9]*)$'
    or a->>'_authStoreRevision' is null or a->>'_authStoreRevision' !~ '^[a-f0-9-]{36}$'
    then raise exception 'atomic-usage-read-binding'; end if;
  seed:=encode(sha256(convert_to(s||'|'||(m->>'generation')||'|'||(m->>'originalHash'),'UTF8')),'hex');
  with chain as(select usage_ordinal,usage_prev_hash,usage_record_hash,usage_chain_hash,
    lead(usage_chain_hash,1,seed)over(order by usage_ordinal desc)as expected_prev
    from public.llm_usage where usage_store_id=s and usage_generation=m->>'generation')
  select count(*),min(usage_ordinal),max(usage_ordinal),
    bool_and(coalesce(usage_prev_hash=expected_prev
      and usage_chain_hash=encode(sha256((usage_prev_hash||usage_record_hash)::bytea),'hex'),false))
    into n,lo,hi,valid from chain;
  select coalesce(jsonb_agg(usage_record order by usage_ordinal desc),'[]'::jsonb)into rows_json
    from public.llm_usage where usage_store_id=s and usage_generation=m->>'generation';
  select usage_chain_hash into head from public.llm_usage where usage_store_id=s and usage_generation=m->>'generation'order by usage_ordinal desc limit 1;
  if n is distinct from (m->>'count')::bigint or (n>0 and(lo<>1 or hi<>n or not coalesce(valid,false)))
    or coalesce(head,seed)is distinct from m->>'head' then raise exception 'atomic-usage-native-history-corrupt'; end if;
  a:=(a-'_llmUsageRef')||jsonb_build_object('llmUsage',rows_json);
  -- Native audits hash this actual reconstructed data themselves. An unused
  -- full-data hash on every runtime read would repeat the removed large work.
  return jsonb_build_object('data',a,'proof',m-'version');
end;$f$;

create function public.helmut_auth_usage_cas_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb; m jsonb; d jsonb; additions jsonb; r jsonb; s text; h text; n bigint;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on' then raise exception 'atomic-usage-local-only'; end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>5
    or jsonb_typeof($1->'id') is distinct from 'string' or jsonb_typeof($1->'data') is distinct from 'object'
    or jsonb_typeof($1->'additions') is distinct from 'array' then raise exception 'atomic-usage-write-input'; end if;
  s:=$1->>'id';d:=$1->'data';additions:=$1->'additions';
  if d ? 'llmUsage' or d ? '_llmUsageRef' or d->>'_authStoreRevision' is null
    or d->>'_authStoreRevision' !~ '^[a-f0-9-]{36}$' or d->>'_authStoreRevision'=$1->>'expectedRevision'
    or (d#>'{testKostenAuftrag,version}' is distinct from '5'::jsonb
      and (d#>'{testKostenAuftrag,version}' is distinct from '6'::jsonb
        or d#>>'{testKostenAuftrag,orderRenewalHash}' is distinct from 'a649603fa8f18c6a3db65aab09b67e15d6bda80befa20e5394bce7eeda1d6415'))
    or d#>>'{testKostenAuftrag,serviceContractHash}' is distinct from '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f'
    then raise exception 'atomic-usage-write-state'; end if;
  select data into a from public.helmut_store where id=s for update;
  if not found then return '[]'::jsonb;end if;
  m:=a->'_llmUsageRef';
  if m->>'version' is distinct from 'relational-atomic-v1' then raise exception 'atomic-usage-write-binding'; end if;
  if a->>'_authStoreRevision'is distinct from $1->>'expectedRevision' or (m-'version')is distinct from $1->'expectedProof' then return '[]'::jsonb;end if;
  -- Same whole-state CAS semantics as the existing writer; only history and
  -- its binding are server-derived. A stale writer cannot replace ANY field.
  n:=(m->>'count')::bigint;h:=m->>'head';
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',m->>'generation','action','write')::text,true);
  for r in select value from jsonb_array_elements(additions)with ordinality e(value,ord)order by ord desc loop
    n:=n+1;h:=public.helmut_auth_usage_insert_local_v1(s,m->>'generation',n,h,r);
  end loop;
  m:=m||jsonb_build_object('count',n,'head',h);
  update public.helmut_store set data=d||jsonb_build_object('_llmUsageRef',m)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);
  return jsonb_build_array(jsonb_build_object('id',s,'revision',d->>'_authStoreRevision','proof',m-'version'));
end;$f$;

create function public.helmut_auth_usage_restore_v1(jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $f$
declare a jsonb; logical jsonb; s text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on' then raise exception 'atomic-usage-local-only'; end if;
  if jsonb_typeof($1) is distinct from 'object' or (select count(*)from jsonb_object_keys($1))<>2 then raise exception 'atomic-usage-restore-input';end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s for update;
  if a->>'_authStoreRevision'is distinct from $1->>'expectedRevision' then raise exception 'atomic-usage-restore-conflict';end if;
  logical:=public.helmut_auth_usage_read_v1(jsonb_build_object('id',s))->'data';
  perform set_config('helmut.atomic_usage_seal',jsonb_build_object('id',s,'gen',a#>>'{_llmUsageRef,generation}','action','restore')::text,true);
  update public.helmut_store set data=logical||jsonb_build_object('_authStoreRevision',gen_random_uuid()::text)where id=s;
  perform set_config('helmut.atomic_usage_seal','',true);
  return jsonb_build_object('id',s,'restored',true,'historyRowsRetained',true);
end;$f$;

revoke all on function public.helmut_auth_usage_guard_local_v1() from public;
revoke all on function public.helmut_auth_usage_insert_local_v1(text,text,bigint,text,jsonb) from public;
revoke all on function public.helmut_auth_usage_bootstrap_v1(jsonb) from public;
revoke all on function public.helmut_auth_usage_read_v1(jsonb) from public;
revoke all on function public.helmut_auth_usage_cas_v1(jsonb) from public;
revoke all on function public.helmut_auth_usage_restore_v1(jsonb) from public;
-- Explicit role revocations also cover environments with direct default grants.
do $function_roles$ declare role_name text; signature text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select from pg_roles where rolname=role_name) then
      foreach signature in array array[
        'public.helmut_auth_usage_guard_local_v1()',
        'public.helmut_auth_usage_insert_local_v1(text,text,bigint,text,jsonb)',
        'public.helmut_auth_usage_bootstrap_v1(jsonb)',
        'public.helmut_auth_usage_read_v1(jsonb)',
        'public.helmut_auth_usage_cas_v1(jsonb)',
        'public.helmut_auth_usage_restore_v1(jsonb)'
      ] loop
        execute format('revoke all on function %s from %I',signature,role_name);
      end loop;
    end if;
  end loop;
end;$function_roles$;
grant execute on function public.helmut_auth_usage_insert_local_v1(text,text,bigint,text,jsonb) to service_role;
grant execute on function public.helmut_auth_usage_bootstrap_v1(jsonb) to service_role;
grant execute on function public.helmut_auth_usage_read_v1(jsonb) to service_role;
grant execute on function public.helmut_auth_usage_cas_v1(jsonb) to service_role;
grant execute on function public.helmut_auth_usage_restore_v1(jsonb) to service_role;
commit;
