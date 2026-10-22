-- INERT combined Auth NEW graph install only; original definition/prosrc frozen separately.
\set ON_ERROR_STOP on
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off
\if :{?root_clone_receipt_sha256}
\else
  \set root_clone_receipt_sha256 MISSING_NEW_CLONE_ADMISSION
\endif

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object('kind','bound-original-state',
  'qualified',1 / coalesce((
    :'root_clone_receipt_sha256' ~ '^[a-f0-9]{64}$'
    AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
    AND current_user='postgres' AND current_setting('data_directory')='/disk/pgdata'
    AND current_database()='helmut_resource_fixture_20261020_3b3bf56650bc'
    AND (SELECT oid FROM pg_database WHERE datname=current_database())=18405
    AND current_setting('transaction_read_only')='off'
    AND current_setting('server_version_num')='170006'
    AND current_setting('server_encoding')='UTF8'
    AND current_setting('client_encoding')='UTF8'
    AND current_setting('helmut.local_usage_experiment',true)='on'
    AND current_setting('work_mem')='4MB'
    AND current_setting('temp_file_limit')='128MB'
    AND current_setting('shared_buffers')='128MB'
    AND current_setting('max_parallel_workers_per_gather')='0'
    AND current_setting('jit')='on' AND pg_jit_available()
    AND current_setting('fsync')='on'
    AND current_setting('full_page_writes')='on'
    AND current_setting('synchronous_commit')='on'
    AND current_setting('autovacuum')='off'
    AND (SELECT count(*) FROM public.helmut_store WHERE id='main-auth')=1
    AND (SELECT octet_length(data::text)=606
      AND encode(sha256(convert_to(data::text,'UTF8')),'hex')=
        '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      AND data->>'_authStoreRevision'='603ee863-ecaf-43be-8b3a-8d6c5ca76d0d'
      AND data#>>'{_authStateRef,root}'=
        '24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633'
      AND data#>>'{_authStateRef,generation}'='6593701f-3f25-4e43-9e17-e9eda4306554'
      AND data#>>'{_authStateRef,originalHash}'=
        '840b1c9cfbf91e7c90de3ee8b866e77c6829d9f67a049fd310c8351fa285ed85'
      AND data#>>'{_llmUsageRef,generation}'='e46b536a-9768-420e-a468-85a20805e2fa'
      AND data#>>'{_llmUsageRef,count}'='6000'
      AND data#>>'{_llmUsageRef,head}'=
        '6221c7e746c196e01d36fdb13d86bec88cce3709e150ed86c687971afd9795fa'
      AND data#>>'{_llmUsageRef,originalHash}'=
        '77a65c6ffe5d36777e3dd41c178e10cdc669fa03f931297b45b2eb5063a23aae'
      FROM public.helmut_store WHERE id='main-auth')
    AND (SELECT bool_and(coalesce(
      p.provolatile='s' AND NOT p.prosecdef
      AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.sha,false))
      FROM (VALUES
        ('public.helmut_auth_state_graph_checked_local_v1(text,text,text,boolean)'::regprocedure,
          '400db1de85d39b4141444250a356984bfafe068014b6ccfd8949f74a071bd9ec'),
        ('public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure,
          '1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'),
        ('public.helmut_auth_usage_checked_proof_local_v1(text)'::regprocedure,
          '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936'),
        ('public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure,
          'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32')
      ) expected(oid,sha) LEFT JOIN pg_proc p ON p.oid=expected.oid)
  )::int,0),
  'database',current_database(),'databaseOID',18405,'backendPID',pg_backend_pid(),
  'cloneReceiptSHA256',:'root_clone_receipt_sha256');

SELECT (to_jsonb(p)-'prosrc')::text AS abi_acl
FROM pg_proc p WHERE oid='public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure
\gset before_
create or replace function public.helmut_auth_state_graph_read_v1(jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
declare a jsonb;m jsonb;graph jsonb;u jsonb;s text; conditional boolean; known jsonb;
  reused boolean:=false; actual_count bigint; actual_hashes boolean; binding text; result jsonb;
  graph_conditional boolean; known_graph jsonb; graph_reused boolean:=false; graph_count integer; graph_digest text; graph_binding text;
begin
  if current_setting('helmut.local_usage_experiment',true) is distinct from 'on'
    or current_setting('server_encoding')<>'UTF8' or current_setting('client_encoding')<>'UTF8' then raise exception 'auth-state-local-only';end if;
  if jsonb_typeof($1) is distinct from 'object'
    or jsonb_typeof($1->'id') is distinct from 'string' or length($1->>'id') not between 1 and 256 then
    raise exception 'auth-state-read-input';end if;
  graph_conditional:=(select count(*)from jsonb_object_keys($1))=4 and $1 ?& array['id','knownProof','readNonce','knownGraph'];
  conditional:=graph_conditional or ((select count(*)from jsonb_object_keys($1))=3 and $1 ?& array['id','knownProof','readNonce']);
  if not conditional and (select count(*)from jsonb_object_keys($1))<>1 then raise exception 'auth-state-read-input';end if;
  if conditional then
    if jsonb_typeof($1->'readNonce') is distinct from 'string' or $1->>'readNonce' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof($1->'knownProof') not in ('null','object') then raise exception 'auth-history-reuse-input';end if;
    known:=nullif($1->'knownProof','null'::jsonb);
    if known is not null then
      if (select count(*)from jsonb_object_keys(known))<>4 or not(known ?& array['generation','count','head','originalHash'])
        or jsonb_typeof(known->'generation') is distinct from 'string' or known->>'generation' !~ '^[a-f0-9-]{36}$'
        or jsonb_typeof(known->'count') is distinct from 'number' or known->>'count' !~ '^(0|[1-9][0-9]*)$'
        or (known->>'count')::numeric>9007199254740991
        or jsonb_typeof(known->'head') is distinct from 'string' or known->>'head' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known->'originalHash') is distinct from 'string' or known->>'originalHash' !~ '^[a-f0-9]{64}$' then
        raise exception 'auth-history-reuse-input';end if;
    end if;
  end if;
  if graph_conditional then
    if jsonb_typeof($1->'knownGraph') not in ('null','object') then raise exception 'auth-graph-reuse-input';end if;
    known_graph:=nullif($1->'knownGraph','null'::jsonb);
    if known_graph is not null then
      if (select count(*)from jsonb_object_keys(known_graph))<>3 or not(known_graph ?& array['state','nodeCount','nodeDigest'])
        or jsonb_typeof(known_graph->'state') is distinct from 'object'
        or (select count(*)from jsonb_object_keys(known_graph->'state'))<>4
        or not((known_graph->'state') ?& array['version','generation','root','originalHash'])
        or known_graph#>>'{state,version}' is distinct from 'merkle-auth-v1'
        or jsonb_typeof(known_graph#>'{state,generation}') is distinct from 'string'
        or known_graph#>>'{state,generation}' !~ '^[a-f0-9-]{36}$'
        or jsonb_typeof(known_graph#>'{state,root}') is distinct from 'string'
        or known_graph#>>'{state,root}' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known_graph#>'{state,originalHash}') is distinct from 'string'
        or known_graph#>>'{state,originalHash}' !~ '^[a-f0-9]{64}$'
        or jsonb_typeof(known_graph->'nodeCount') is distinct from 'number'
        or known_graph->>'nodeCount' !~ '^[1-9][0-9]*$'
        or (known_graph->>'nodeCount')::numeric>20000
        or jsonb_typeof(known_graph->'nodeDigest') is distinct from 'string'
        or known_graph->>'nodeDigest' !~ '^[a-f0-9]{64}$' then raise exception 'auth-graph-reuse-input';end if;
    end if;
  end if;
  s:=$1->>'id';select data into strict a from public.helmut_store where id=s;
  m:=public.helmut_auth_state_assert_root_local_v1(a);
  -- Both existing complete fresh readers still run in this SAME MVCC snapshot.
  -- Only a state-identical graph can omit payload transport. Its full native
  -- reachability/bounds pass AND actual-payload SHA pass still execute freshly.
  graph_reused:=graph_conditional and known_graph is not null and known_graph->'state'=m;
  graph:=public.helmut_auth_state_graph_checked_local_v1(s,m->>'generation',m->>'root',graph_reused);
  if graph_conditional then
    if graph_reused then
      graph_count:=(graph->>'nodeCount')::integer;graph_digest:=graph->>'nodeDigest';
      if graph_count<>(known_graph->>'nodeCount')::integer or graph_digest is distinct from known_graph->>'nodeDigest' then
        raise exception 'auth-graph-reuse-content-mismatch';end if;
    else
      graph_count:=jsonb_array_length(graph->'nodes');
      -- The checked graph has ordered objects with nonnull 64-byte hashes.
      -- Project those scalars before the SRF; never spool full payload objects
      -- merely to calculate the same node-order digest.
      select encode(sha256(convert_to(string_agg(value,'|'order by ord),'UTF8')),'hex') into graph_digest
        from jsonb_array_elements_text(jsonb_path_query_array(graph,'strict $.nodes[*].hash'))
          with ordinality e(value,ord);
    end if;
  end if;
  -- Validate every actual record first, without aggregating a complete JSON
  -- history. Only a genuinely changed/cold proof materializes the legacy data.
  u:=public.helmut_auth_usage_checked_proof_local_v1(s);
  if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
    or u->>'revision' is distinct from a->>'_authStoreRevision' then
    raise exception 'auth-state-usage-snapshot-mismatch';end if;
  reused:=conditional and known is not null and known=u->'proof';
  if not reused then
    u:=public.helmut_auth_usage_read_v1(jsonb_build_object('id',s));
    if u->'proof' is distinct from (a->'_llmUsageRef')-'version'
      or u#>>'{data,_authStoreRevision}' is distinct from a->>'_authStoreRevision' then
      raise exception 'auth-state-usage-snapshot-mismatch';end if;
  end if;
  result:=jsonb_build_object('data',case when reused then jsonb_build_object('_authStoreRevision',a->'_authStoreRevision')
      else jsonb_build_object('_authStoreRevision',a->'_authStoreRevision','llmUsage',u#>'{data,llmUsage}')end,
    'graph',case when graph_reused then 'null'::jsonb else graph end,'proof',u->'proof','state',m);
  if conditional then
    -- This digest binds response fields to this request. It is not a signature
    -- and does not replace the authenticated, pinned native database origin.
    binding:=encode(sha256(convert_to('verified-history-reuse-v1|'||($1->>'readNonce')||'|'
      ||encode(sha256(convert_to(s,'UTF8')),'hex')||'|'||(a->>'_authStoreRevision')||'|'
      ||(m->>'version')||'|'||(m->>'generation')||'|'||(m->>'root')||'|'||(m->>'originalHash')||'|'
      ||(u#>>'{proof,generation}')||'|'||((u#>>'{proof,count}')::bigint)::text||'|'||(u#>>'{proof,head}')||'|'
      ||(u#>>'{proof,originalHash}')||'|'||case when reused then '1'else '0'end,'UTF8')),'hex');
    result:=result||jsonb_build_object('historyReuse',jsonb_build_object('version','verified-history-reuse-v1',
      'nonce',$1->>'readNonce','reused',reused,'binding',binding));
  end if;
  if graph_conditional then
    -- Like the history digest, this binds fresh native results to this request;
    -- it is not a signature and never replaces the authenticated DB origin.
    graph_binding:=encode(sha256(convert_to('verified-graph-reuse-v1|'||($1->>'readNonce')||'|'
      ||encode(sha256(convert_to(s,'UTF8')),'hex')||'|'||(a->>'_authStoreRevision')||'|'
      ||(m->>'version')||'|'||(m->>'generation')||'|'||(m->>'root')||'|'||(m->>'originalHash')||'|'
      ||(u#>>'{proof,generation}')||'|'||((u#>>'{proof,count}')::bigint)::text||'|'||(u#>>'{proof,head}')||'|'||(u#>>'{proof,originalHash}')||'|'
      ||graph_count::text||'|'||graph_digest||'|'||(case when graph_reused then '1'else '0'end),'UTF8')),'hex');
    result:=result||jsonb_build_object('graphReuse',jsonb_build_object('version','verified-graph-reuse-v1',
      'nonce',$1->>'readNonce','reused',graph_reused,'actualPayloadsChecked',graph_reused,
      'nodeCount',graph_count,'nodeDigest',graph_digest,'binding',graph_binding));
  end if;
  return result;
end;$f$;
SELECT jsonb_build_object('kind','cold-digest-body-install','variant','NEW',
  'qualified',1/coalesce(((SELECT (to_jsonb(p)-'prosrc')=:'before_abi_acl'::jsonb
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0'
    FROM pg_proc p WHERE oid='public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure)
    AND (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')=
      '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      FROM public.helmut_store WHERE id='main-auth'))::int,0),
  'functionBodySHA256','4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0','abiACLUnchanged',true,
  'originalPhysicalAuthUnchanged',true,'setupSQLStatements',8);
COMMIT;
