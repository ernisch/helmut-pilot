SELECT jsonb_build_object('schema','helmut-cas-native-size-native-layout-receipt/1','runtime',jsonb_build_object('serverVersionNum',current_setting('server_version_num'),'serverVersion',current_setting('server_version'),'database',current_database(),'user',current_user,'transactionReadOnly',current_setting('transaction_read_only'),'defaultReadOnly',current_setting('default_transaction_read_only'),'serverEncoding',current_setting('server_encoding'),'clientEncoding',current_setting('client_encoding'),'listenAddresses',current_setting('listen_addresses'),'statementTimeout',current_setting('statement_timeout'),'lockTimeout',current_setting('lock_timeout'),'jit',current_setting('jit'),'projection',current_setting('helmut.local_auth_state_cas_projection',true),'diagnosticScope',current_setting('helmut.local_diagnostic_scope',true),'publicRelations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f'))),'layout',(
-- SOURCE ONLY: not executed by the author. One SELECT/CTE statement, no tables or DDL.
-- Official PG17.6 layout counterexample; no projection/CAS/helper/GUC invocation.
-- Exact synthetic A64/B64/C; fixed32 small receipt fields; hard4096B output cap.
WITH constants AS (
  SELECT 64::integer AS n,
    '78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f'::text AS contract_hash
), leaves AS (
  SELECT n, contract_hash,
    (SELECT jsonb_object_agg('k' || lpad((2*i)::text,3,'0'), '[]'::jsonb ORDER BY i)
       FROM generate_series(0,n-1) AS g(i)) AS a,
    (SELECT jsonb_object_agg('k' || lpad((2*i+1)::text,3,'0'), to_jsonb('x'::text) ORDER BY i)
       FROM generate_series(0,n-1) AS g(i)) AS b,
    jsonb_build_object('testKostenAuftrag', jsonb_build_object(
      'version','5'::text,'serviceContractHash',contract_hash)) AS c
  FROM constants
), layout AS (
  SELECT *, a || b || c AS merged,
    pg_column_size(a) AS a_bytes, pg_column_size(b) AS b_bytes,
    pg_column_size(c) AS c_bytes
  FROM leaves
), measured AS (
  SELECT *, pg_column_size(merged) AS merged_bytes,
    16 + (a_bytes+16) + (b_bytes+16) + (c_bytes+16) AS formula_bytes,
    jsonb_typeof(merged)='object'
      AND NOT (merged ?| ARRAY['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision'])
      AND merged#>>'{testKostenAuftrag,version}'='5'
      AND merged#>>'{testKostenAuftrag,serviceContractHash}'=contract_hash AS root_valid
  FROM layout
), receipt AS (
  SELECT jsonb_build_object(
    'schema','helmut-cas-native-size-counterexample-layout/1',
    'fieldCount',32,
    'officialPGCommit','7885b94dd81b98bbab9ed878680d156df7bf857f',
    'pairCount',n,
    'arrayLeafPairs',(SELECT count(*) FROM jsonb_object_keys(a)),
    'stringLeafPairs',(SELECT count(*) FROM jsonb_object_keys(b)),
    'contractLeafPairs',(SELECT count(*) FROM jsonb_object_keys(c)),
    'mergedPairs',(SELECT count(*) FROM jsonb_object_keys(merged)),
    'arrayLeafNativeBytes',a_bytes,
    'stringLeafNativeBytes',b_bytes,
    'contractLeafNativeBytes',c_bytes,
    'mergedNativeBytes',merged_bytes,
    'formulaNativeBytes',formula_bytes,
    'underestimationBytes',merged_bytes-formula_bytes,
    'nativeFormulaDominates',merged_bytes<=formula_bytes,
    'predictedArrayLeafNativeBytes',1032,
    'predictedStringLeafNativeBytes',840,
    'predictedContractLeafNativeBytes',147,
    'predictedMergedNativeBytes',2195,
    'predictedFormulaNativeBytes',2083,
    'predictedUnderestimationBytes',112,
    'evenKeysFourBytes',NOT EXISTS(SELECT FROM jsonb_object_keys(a) AS k(key) WHERE octet_length(key)<>4),
    'oddKeysFourBytes',NOT EXISTS(SELECT FROM jsonb_object_keys(b) AS k(key) WHERE octet_length(key)<>4),
    'firstSortedKey',(SELECT key FROM jsonb_object_keys(merged) AS k(key)
      ORDER BY octet_length(key),key COLLATE "C" LIMIT 1),
    'secondSortedKey',(SELECT key FROM jsonb_object_keys(merged) AS k(key)
      ORDER BY octet_length(key),key COLLATE "C" OFFSET 1 LIMIT 1),
    'rootIsObject',jsonb_typeof(merged)='object',
    'rootHasNoForbiddenFields',NOT (merged ?| ARRAY['llmUsage','_llmUsageRef','_authStateRef','_authStoreRevision']),
    'rootVersionText',merged#>>'{testKostenAuftrag,version}',
    'rootServiceContractHash',merged#>>'{testKostenAuftrag,serviceContractHash}',
    'rootLogicalValid',root_valid,
    'allNativePredictionsMatch',a_bytes=1032 AND b_bytes=840 AND c_bytes=147
      AND merged_bytes=2195 AND formula_bytes=2083 AND root_valid,
    'maximumOutputBytes',4096
  ) AS value
  FROM measured
)
SELECT CASE WHEN octet_length(value::text)<=4096 THEN value ELSE
  jsonb_build_object('schema','helmut-cas-native-size-counterexample-layout/1',
    'status','OUTPUT_CAP_EXCEEDED') END AS result
FROM receipt
));
