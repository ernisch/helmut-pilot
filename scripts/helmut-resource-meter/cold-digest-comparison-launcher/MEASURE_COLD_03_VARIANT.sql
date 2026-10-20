-- INERT PREPARATION ONLY. Native qualification NOT RUN.
-- Shared symmetric OLD/NEW cold observer; same scalar function wrapper.
-- Original source595b2530 / candidate sourcee7530ffd; each separately pinned.
-- Added component hashing is identical observer work in BOTH variants.
-- Only Root's newly admitted exclusive clone; never the source PGDATA/database.
-- Source: R/supabase/proposals/auth_read_bounded_local.sql, 18650 bytes,
-- SHA256 595b2530b66193c387f111b00b9b22e9f54847bfa24dd1def80a7b2bb4fee561.
\set ON_ERROR_STOP on
\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off
\if :{?root_clone_receipt_sha256}
\else
  \set root_clone_receipt_sha256 MISSING_NEW_CLONE_ADMISSION
\endif

\if :{?expected_graph_read_sha256}
\else
  \set expected_graph_read_sha256 MISSING_EXACT_VARIANT_BODY
\endif

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object('kind','bound-original-state',
  'qualified',1 / coalesce((
    :'root_clone_receipt_sha256' ~ '^[a-f0-9]{64}$'
    AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
    AND :'expected_graph_read_sha256' IN ('1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0','4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0')
    AND current_database()='helmut_resource_fixture_20261020_3b3bf56650bc'
    AND (SELECT oid FROM pg_database WHERE datname=current_database())=18405
    AND current_setting('transaction_read_only')='on'
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
          :'expected_graph_read_sha256'),
        ('public.helmut_auth_usage_checked_proof_local_v1(text)'::regprocedure,
          '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936'),
        ('public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure,
          'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32')
      ) expected(oid,sha) LEFT JOIN pg_proc p ON p.oid=expected.oid)
  )::int,0),
  'database',current_database(),'databaseOID',18405,'backendPID',pg_backend_pid(),
  'cloneReceiptSHA256',:'root_clone_receipt_sha256',
  'expectedGraphReadBodySHA256',:'expected_graph_read_sha256');

-- Obtain the ACTUAL same bounded reachability array. Never print payloads.
-- This preparation warms input pages and is outside the target measurement.
SET LOCAL ROLE service_role;
WITH RECURSIVE reach(hash) AS (
  SELECT '24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633'::text
  UNION
  SELECT unnest(t.children) FROM reach r
    JOIN public.helmut_auth_state_nodes_local t
      ON t.store_id='main-auth'
      AND t.generation='6593701f-3f25-4e43-9e17-e9eda4306554'
      AND t.node_hash=r.hash
), bounded AS MATERIALIZED(SELECT hash FROM reach LIMIT 20001)
SELECT array_agg(hash)::text AS reachable,count(*) AS node_count
  FROM bounded
\gset spill_
SELECT jsonb_build_object('kind','reachable-metadata',
  'qualified',1 / coalesce((:'spill_node_count'::int=1848
    AND count(*)=1848 AND sum(octet_length(payload))=6010786)::int,0),
  'reachableNodes',count(*),'payloadBytes',sum(octet_length(payload)),
  'hashesOnlySHA256',encode(sha256(convert_to(
    string_agg(node_hash,'|' ORDER BY node_seq),'UTF8')),'hex'))
FROM public.helmut_auth_state_nodes_local
WHERE store_id='main-auth' AND generation='6593701f-3f25-4e43-9e17-e9eda4306554'
  AND node_hash=ANY(:'spill_reachable'::text[]);
-- Root supplies one fresh UUID; the native SQL request has the cold four-key control
-- shape from llm-usage-atomic.js readControl(), with knownGraph:null.
-- The valid original history proof is unchanged; no JS private token is claimed.
\if :{?read_nonce}
\else
  \set read_nonce MISSING_FRESH_NONCE
\endif
SELECT 1 / coalesce((:'read_nonce' ~
  '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')::int,0) AS nonce_valid
\gset
SELECT jsonb_build_object(
  'id','main-auth',
  'knownProof',jsonb_build_object(
    'generation','e46b536a-9768-420e-a468-85a20805e2fa','count',6000,
    'head','6221c7e746c196e01d36fdb13d86bec88cce3709e150ed86c687971afd9795fa',
    'originalHash','77a65c6ffe5d36777e3dd41c178e10cdc669fa03f931297b45b2eb5063a23aae'),
  'readNonce',:'read_nonce',
  'knownGraph','null'::jsonb)::text AS request,
  (SELECT encode(sha256(convert_to(
    string_agg(node_hash,'|' ORDER BY node_seq),'UTF8')),'hex')
    FROM public.helmut_auth_state_nodes_local
    WHERE store_id='main-auth' AND generation='6593701f-3f25-4e43-9e17-e9eda4306554'
      AND node_hash=ANY(:'spill_reachable'::text[])) AS expected_node_digest
\gset native_
RESET ROLE;
SELECT pg_stat_force_next_flush() AS ignored_flush
\gset
ROLLBACK;

-- Force-flush is effective at transaction end, not immediately at SELECT.
-- The exclusive clone must have no competing work in this database.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT clock_timestamp()::text AS observed_start
\gset observer_before_
SELECT pg_stat_clear_snapshot() AS ignored_clear
\gset
SELECT temp_bytes AS bytes,temp_files AS files,coalesce(stats_reset::text,'') AS reset
FROM pg_stat_database WHERE datname=current_database()
\gset temp_before_
SELECT clock_timestamp()::text AS observed_end
\gset observer_before_
SELECT pg_stat_force_next_flush() AS ignored_flush
\gset
ROLLBACK;

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SET LOCAL ROLE service_role;
SELECT clock_timestamp()::text AS start,current_user AS invoker,pg_backend_pid() AS pid
\gset target_
-- Unlike02, the cold result is large. OFFSET 0 blocks subquery pull-up so
-- this scalar function is evaluated once, without an observer MATERIALIZED CTE.
-- The outer summary still hashes/sizes the complete result; it is observer work,
-- not a PostgREST plan or proof that a nested SRF alone caused any temp delta.
SELECT jsonb_build_object('kind','native-cold-control-result',
  'qualified',1 / coalesce((
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(result) AS keys(k))=
      ARRAY['data','graph','graphReuse','historyReuse','proof','state']::text[]
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(result->'historyReuse') AS keys(k))=
      ARRAY['binding','nonce','reused','version']::text[]
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(result->'graphReuse') AS keys(k))=
      ARRAY['actualPayloadsChecked','binding','nodeCount','nodeDigest','nonce','reused','version']::text[]
    AND jsonb_typeof(result->'graph')='object'
    AND result#>>'{graph,root}'=
      '24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633'
    AND jsonb_typeof(result#>'{graph,nodes}')='array'
    AND jsonb_array_length(result#>'{graph,nodes}')=1848
    AND result#>>'{historyReuse,reused}'='true'
    AND result#>>'{historyReuse,nonce}'=:'read_nonce'
    AND result#>>'{graphReuse,reused}'='false'
    AND result#>>'{graphReuse,actualPayloadsChecked}'='false'
    AND result#>>'{graphReuse,nonce}'=:'read_nonce'
    AND result#>>'{graphReuse,nodeCount}'='1848'
    AND result#>>'{graphReuse,nodeDigest}'=:'native_expected_node_digest'
    AND result->'state'=(SELECT data->'_authStateRef'
      FROM public.helmut_store WHERE id='main-auth')
    AND result->'proof'=(:'native_request'::jsonb)->'knownProof'
    AND result->'data'=jsonb_build_object(
      '_authStoreRevision','603ee863-ecaf-43be-8b3a-8d6c5ca76d0d')
  )::int,0),
  'resultNativeBytes',pg_column_size(result),
  'resultTextBytes',octet_length(result::text),
  'resultTextSHA256',encode(sha256(convert_to(result::text,'UTF8')),'hex'),
  'graphSHA256',hashes.graph_sha,'dataSHA256',hashes.data_sha,
  'stateSHA256',hashes.state_sha,'proofSHA256',hashes.proof_sha,
  -- This hashes a SMALL component-semantic document, not normalized full JSONB.
  'componentSemanticDigestSHA256',encode(sha256(convert_to(jsonb_build_object(
    'dataSHA256',hashes.data_sha,'graphSHA256',hashes.graph_sha,
    'proofSHA256',hashes.proof_sha,'stateSHA256',hashes.state_sha,
    'historyReuse',(result->'historyReuse')-ARRAY['nonce','binding']::text[],
    'graphReuse',(result->'graphReuse')-ARRAY['nonce','binding']::text[])::text,'UTF8')),'hex'),
  'requestTextBytes',octet_length(:'native_request'),
  'requestTextSHA256',encode(sha256(convert_to(:'native_request','UTF8')),'hex'),
  'payloadOmitted',result->'graph'='null'::jsonb,
  'historyReused',(result#>>'{historyReuse,reused}')::boolean,
  'graphReused',(result#>>'{graphReuse,reused}')::boolean,
  'actualPayloadsChecked',(result#>>'{graphReuse,actualPayloadsChecked}')::boolean,
  'graphNodeCount',jsonb_array_length(result#>'{graph,nodes}'),
  'graphNodeDigest',result#>>'{graphReuse,nodeDigest}',
  'nonceEchoVerified',result#>>'{historyReuse,nonce}'=:'read_nonce'
    AND result#>>'{graphReuse,nonce}'=:'read_nonce',
  'clientTokenAcceptanceProven',false,'httpTransportMeasured',false)
FROM (SELECT public.helmut_auth_state_graph_read_v1(:'native_request'::jsonb) AS result
      OFFSET 0) AS measured
CROSS JOIN LATERAL (
  SELECT encode(sha256(convert_to((result->'graph')::text,'UTF8')),'hex') AS graph_sha,
    encode(sha256(convert_to((result->'data')::text,'UTF8')),'hex') AS data_sha,
    encode(sha256(convert_to((result->'state')::text,'UTF8')),'hex') AS state_sha,
    encode(sha256(convert_to((result->'proof')::text,'UTF8')),'hex') AS proof_sha
  OFFSET 0
) AS hashes;

SELECT clock_timestamp()::text AS end
\gset target_
RESET ROLE;
SELECT pg_stat_force_next_flush() AS ignored_flush
\gset
ROLLBACK;

BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT clock_timestamp()::text AS observed_start
\gset observer_after_
SELECT pg_stat_clear_snapshot() AS ignored_clear
\gset
SELECT temp_bytes AS bytes,temp_files AS files,coalesce(stats_reset::text,'') AS reset
FROM pg_stat_database WHERE datname=current_database()
\gset temp_after_
SELECT clock_timestamp()::text AS observed_end
\gset observer_after_
SELECT jsonb_build_object('kind','target-transaction-temp-observation',
  'qualified',1 / coalesce((
    :'temp_before_reset' IS NOT DISTINCT FROM :'temp_after_reset'
    AND :'temp_after_bytes'::bigint>=:'temp_before_bytes'::bigint
    AND :'temp_after_files'::bigint>=:'temp_before_files'::bigint
    AND :'target_invoker'='service_role'
    AND (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')=
      '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      FROM public.helmut_store WHERE id='main-auth')
  )::int,0),
  'backendPID',:'target_pid'::int,'invoker',:'target_invoker',
  'deltaTempBytes',:'temp_after_bytes'::bigint-:'temp_before_bytes'::bigint,
  'deltaTempFiles',:'temp_after_files'::bigint-:'temp_before_files'::bigint,
  'targetWallMS',1000*extract(epoch FROM
    (:'target_end'::timestamptz-:'target_start'::timestamptz)),
  'beforeObserverMS',1000*extract(epoch FROM
    (:'observer_before_observed_end'::timestamptz-:'observer_before_observed_start'::timestamptz)),
  'afterObserverMS',1000*extract(epoch FROM
    (:'observer_after_observed_end'::timestamptz-:'observer_after_observed_start'::timestamptz)),
  'counterScope','exclusive database delta; includes target transaction and observer SQL; not pure statement RAM',
  'observerTimingScope','statistics-reader intervals only; flush/rollback and final-summary overhead not independently timed',
  'nativeQualification','NOT_RUN_BY_PREPARATION',
  'full500',false,'production',false,'providerCalls',0);
ROLLBACK;
