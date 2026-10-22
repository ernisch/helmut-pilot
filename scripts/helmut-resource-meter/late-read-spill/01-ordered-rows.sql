-- INERT PREPARATION ONLY. Native qualification NOT RUN.
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

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object('kind','bound-original-state',
  'qualified',1 / coalesce((
    :'root_clone_receipt_sha256' ~ '^[a-f0-9]{64}$'
    AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
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
          '1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'),
        ('public.helmut_auth_usage_checked_proof_local_v1(text)'::regprocedure,
          '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936'),
        ('public.helmut_auth_state_expand_local_v1(text,text,text,boolean,boolean)'::regprocedure,
          'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32')
      ) expected(oid,sha) LEFT JOIN pg_proc p ON p.oid=expected.oid)
  )::int,0),
  'database',current_database(),'databaseOID',18405,'backendPID',pg_backend_pid(),
  'cloneReceiptSHA256',:'root_clone_receipt_sha256');

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
-- Same selected columns, predicates and ordering as graph_checked lines 85-86.
-- The actual reachability array is bound as a text[] literal by psql.
-- Standalone planning may differ from PL/pgSQL's cached SPI plan; see README.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT node_hash,body,children,leaf_info
FROM public.helmut_auth_state_nodes_local
WHERE store_id='main-auth'
  AND generation='6593701f-3f25-4e43-9e17-e9eda4306554'
  AND node_hash=ANY(:'spill_reachable'::text[])
ORDER BY node_seq;

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
