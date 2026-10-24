-- INERT INSTALL-ONLY PREPARATION. Native qualification NOT RUN.
-- Exactly one graph_read body in a fresh Root-admitted clone; no data writes.
-- 03: exact cold four-key control request; unchanged engine function.
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

BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object('kind','bound-original-state',
  'qualified',1 / coalesce((
    :'root_clone_receipt_sha256' ~ '^[a-f0-9]{64}$'
    AND inet_server_addr() IS NULL AND inet_client_addr() IS NULL
    AND current_user='postgres' AND current_setting('data_directory')='/disk/pgdata'
    AND :'diff_role' IN ('service_role','anon','authenticated')
    AND :'diff_case_id' IN ('legacy','history-warm','history-cold','graph-cold-history-warm','graph-cold-history-cold','graph-warm','graph-warm-history-stale','graph-changed','null','id-empty','nonce-bad','proof-bad','graph-bad-type','graph-bad-shape','graph-count-mismatch','graph-digest-mismatch','foreign-id','role-anon','role-authenticated')
    AND :'diff_pair_nonce' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND CASE WHEN (:'diff_request_json'::jsonb)->>'readNonce' ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      THEN (:'diff_request_json'::jsonb)->>'readNonce'=:'diff_pair_nonce' ELSE true END
    AND :'diff_expected_outcome' IN ('ok','error')
    AND octet_length(:'diff_request_json') BETWEEN 1 AND 4096
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

-- This private differential transaction changes ONLY the function body and
-- always ROLLBACKs. It is not the read-only03 common-memory measurement.
-- Exact reviewed catalog SELECT, with only its output alias added.
SELECT $catalog$
SELECT jsonb_build_object('catalog',jsonb_build_object('usage',(SELECT jsonb_build_object('serverVersion',current_setting('server_version'),'serverEncoding',current_setting('server_encoding'),'clientEncoding',current_setting('client_encoding'),'localGate',current_setting('helmut.local_usage_experiment',true),'functions',(SELECT jsonb_object_agg(proname,jsonb_build_object('hash',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'definer',prosecdef,'config',proconfig,'arguments',oidvectortypes(proargtypes),'result',format_type(prorettype,NULL),'volatility',provolatile,'owner',pg_get_userbyid(proowner),'publicExecute',EXISTS(SELECT FROM aclexplode(coalesce(proacl,acldefault('f',proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'customerExecute',has_function_privilege('authenticated',oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE')))FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_usage_%'),'generated',(SELECT jsonb_object_agg(a.attname,jsonb_build_object('kind',a.attgenerated,'expression',pg_get_expr(d.adbin,d.adrelid))) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.llm_usage'::regclass AND a.attname IN('usage_record_hash','usage_chain_hash')),'triggers',(SELECT jsonb_object_agg(t.tgname,jsonb_build_object('state',t.tgenabled,'table',n.nspname||'.'||c.relname,'function',pn.nspname||'.'||p.proname,'type',t.tgtype,'condition',pg_get_expr(t.tgqual,t.tgrelid),'arguments',t.tgnargs))FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND t.tgname IN('helmut_usage_record_immutable_local','helmut_usage_auth_bound_local','helmut_usage_no_truncate_local','helmut_usage_auth_no_truncate_local')))),'state',(SELECT jsonb_build_object('serverVersion',current_setting('server_version'),'serverEncoding',current_setting('server_encoding'),'clientEncoding',current_setting('client_encoding'),'localGate',current_setting('helmut.local_usage_experiment',true),'functionCount',(SELECT count(*)FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_state_%'),'functions',(SELECT jsonb_object_agg(proname,jsonb_build_object('hash',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'definer',prosecdef,'config',proconfig,'arguments',oidvectortypes(proargtypes),'result',format_type(prorettype,NULL),'volatility',provolatile,'owner',pg_get_userbyid(proowner),'publicExecute',EXISTS(SELECT FROM aclexplode(coalesce(proacl,acldefault('f',proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'customerExecute',has_function_privilege('authenticated',oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE')))FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_state_%'),'table',(SELECT jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'forceRls',relforcerowsecurity,'publicPrivileges',EXISTS(SELECT FROM aclexplode(coalesce(relacl,acldefault('r',relowner)))a WHERE a.grantee=0),'service',jsonb_build_object('SELECT',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'SELECT'),'INSERT',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'INSERT'),'UPDATE',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'UPDATE'),'DELETE',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'DELETE'),'TRUNCATE',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'TRUNCATE'),'REFERENCES',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'REFERENCES'),'TRIGGER',has_table_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local'),'TRIGGER')),'anon',jsonb_build_object('SELECT',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'SELECT'),'INSERT',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'INSERT'),'UPDATE',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'UPDATE'),'DELETE',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'DELETE'),'TRUNCATE',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'TRUNCATE'),'REFERENCES',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'REFERENCES'),'TRIGGER',has_table_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local'),'TRIGGER')),'customer',jsonb_build_object('SELECT',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'SELECT'),'INSERT',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'INSERT'),'UPDATE',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'UPDATE'),'DELETE',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'DELETE'),'TRUNCATE',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'TRUNCATE'),'REFERENCES',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'REFERENCES'),'TRIGGER',has_table_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local'),'TRIGGER')))FROM pg_class WHERE oid=to_regclass('public.helmut_auth_state_nodes_local')),'sequence',(SELECT jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'publicPrivileges',EXISTS(SELECT FROM aclexplode(coalesce(relacl,acldefault('S',relowner)))a WHERE a.grantee=0),'service',jsonb_build_object('USAGE',has_sequence_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'USAGE'),'SELECT',has_sequence_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'SELECT'),'UPDATE',has_sequence_privilege('service_role',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'UPDATE')),'anon',jsonb_build_object('USAGE',has_sequence_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'USAGE'),'SELECT',has_sequence_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'SELECT'),'UPDATE',has_sequence_privilege('anon',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'UPDATE')),'customer',jsonb_build_object('USAGE',has_sequence_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'USAGE'),'SELECT',has_sequence_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'SELECT'),'UPDATE',has_sequence_privilege('authenticated',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq'),'UPDATE')))FROM pg_class WHERE oid=to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq')),'columns',(SELECT jsonb_object_agg(a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'expression',pg_get_expr(d.adbin,d.adrelid)))FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass('public.helmut_auth_state_nodes_local') AND a.attnum>0 AND NOT a.attisdropped),'primaryKeys',(SELECT jsonb_agg(x.keys)FROM(SELECT array_agg(a.attname ORDER BY k.ord)AS keys FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey)WITH ORDINALITY k(num,ord)JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num WHERE c.conrelid=to_regclass('public.helmut_auth_state_nodes_local') AND c.contype='p' GROUP BY c.oid)x),'policies',(SELECT jsonb_object_agg(policyname,jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check))FROM pg_policies WHERE schemaname='public' AND tablename='helmut_auth_state_nodes_local'),'triggers',(SELECT jsonb_object_agg(t.tgname,jsonb_build_object('state',t.tgenabled,'table',n.nspname||'.'||c.relname,'function',pn.nspname||'.'||p.proname,'type',t.tgtype,'condition',pg_get_expr(t.tgqual,t.tgrelid),'arguments',t.tgnargs))FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND (t.tgrelid=to_regclass('public.helmut_auth_state_nodes_local') OR t.tgname LIKE 'helmut_auth_state_%'))))),

'identity',jsonb_build_object('database',current_database(),'oid',(SELECT oid FROM pg_database WHERE datname=current_database()),
  'readOnly',current_setting('transaction_read_only'),'versionNum',current_setting('server_version_num'),
  'dataDirectory',current_setting('data_directory'),'hbaFile',current_setting('hba_file'),
  'identFile',current_setting('ident_file')),
'store', (SELECT jsonb_build_object('rows',count(*),'physicalBytes',max(octet_length(data::text)),
  'sha',max(encode(sha256(convert_to(data::text,'UTF8')),'hex'))) FROM public.helmut_store WHERE id='main-auth'),
'relationABI',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,
  'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'num',a.attnum,'type',a.atttypid,
    'typmod',a.atttypmod,'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
    'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)
    FROM pg_index i WHERE i.indrelid=c.oid),
  'constraints',(SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.oid)
    FROM pg_constraint k WHERE k.conrelid=c.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid)) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles,'cmd',p.polcmd,
    'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),
    'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=c.oid)
  ) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace
  AND c.relname IN('helmut_store','llm_usage','helmut_auth_state_nodes_local','helmut_auth_state_nodes_local_node_seq_seq')),
'functionABI',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',p.proowner,
  'acl',p.proacl,'lang',p.prolang,'result',p.prorettype,'args',p.proargtypes::text,'argNames',p.proargnames,
  'argModes',p.proargmodes,'allArgs',p.proallargtypes,'defaults',p.pronargdefaults,
  'defaultExpr',pg_get_expr(p.proargdefaults,0),'strict',p.proisstrict,'leakproof',p.proleakproof,
  'parallel',p.proparallel,'definer',p.prosecdef,'volatile',p.provolatile,'config',p.proconfig,
  'returnsSet',p.proretset) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),
'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,
  'createRole',rolcreaterole,'createDB',rolcreatedb,'canLogin',rolcanlogin,'replication',rolreplication,
  'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN('postgres','service_role','anon','authenticated')),
'settings',(SELECT jsonb_object_agg(name,setting) FROM pg_settings WHERE name LIKE 'jit%'
  OR name IN('server_version','shared_buffers','work_mem','temp_file_limit','min_wal_size','max_wal_size',
  'wal_segment_size','fsync','full_page_writes','synchronous_commit','autovacuum','max_parallel_workers_per_gather',
  'statement_timeout','lock_timeout'))
) AS catalog_snapshot
$catalog$ AS query
\gset catalog_
:catalog_query
\gset before_
SELECT (to_jsonb(p)-'prosrc')::text AS abi_acl
FROM pg_proc p WHERE oid='public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure
\gset before_
SELECT set_config('helmut.diagnostic_cold_digest_case_id',:'diff_case_id',true) AS case_id,
  set_config('helmut.diagnostic_cold_digest_pair_nonce',:'diff_pair_nonce',true) AS pair_nonce,
  set_config('helmut.diagnostic_cold_digest_catalog_sql',:'catalog_query',true) AS catalog,
  set_config('helmut.diagnostic_cold_digest_request',:'diff_request_json',true) AS request,
  set_config('helmut.diagnostic_cold_digest_role',:'diff_role',true) AS role,
  set_config('helmut.diagnostic_cold_digest_expected',:'diff_expected_outcome',true) AS expected
\gset ignored_
DO $diff$
DECLARE old_v jsonb; new_v jsonb; request jsonb;
  old_state text; old_message text; new_state text; new_message text;
  old_outcome text:='ok'; new_outcome text:='ok'; role_name text; metadata jsonb;
  catalog_old jsonb; catalog_new jsonb;
BEGIN
  EXECUTE current_setting('helmut.diagnostic_cold_digest_catalog_sql') INTO catalog_old;
  request:=current_setting('helmut.diagnostic_cold_digest_request')::jsonb;
  role_name:=current_setting('helmut.diagnostic_cold_digest_role');
  EXECUTE 'SET LOCAL ROLE '||quote_ident(role_name);
  BEGIN
    EXECUTE 'SELECT public.helmut_auth_state_graph_read_v1($1)' INTO old_v USING request;
  EXCEPTION WHEN OTHERS THEN
    old_outcome:='error';
    GET STACKED DIAGNOSTICS old_state=RETURNED_SQLSTATE,old_message=MESSAGE_TEXT;
    IF octet_length(old_message)>512 THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
  EXECUTE $candidate$
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
$candidate$;
  EXECUTE 'SET LOCAL ROLE '||quote_ident(role_name);
  BEGIN
    EXECUTE 'SELECT public.helmut_auth_state_graph_read_v1($1)' INTO new_v USING request;
  EXCEPTION WHEN OTHERS THEN
    new_outcome:='error';
    GET STACKED DIAGNOSTICS new_state=RETURNED_SQLSTATE,new_message=MESSAGE_TEXT;
    IF octet_length(new_message)>512 THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
  EXECUTE current_setting('helmut.diagnostic_cold_digest_catalog_sql') INTO catalog_new;
  IF catalog_new#>>'{catalog,state,functions,helmut_auth_state_graph_read_v1,hash}'
      IS DISTINCT FROM '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0'
      OR catalog_old IS DISTINCT FROM jsonb_set(catalog_new,
        '{catalog,state,functions,helmut_auth_state_graph_read_v1,hash}',
        to_jsonb('1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'::text),false) THEN
    RAISE EXCEPTION 'cold-digest-catalog-delta';
  END IF;
  IF old_outcome<>current_setting('helmut.diagnostic_cold_digest_expected')
      OR new_outcome<>old_outcome
      OR (old_outcome='ok' AND old_v IS DISTINCT FROM new_v)
      OR (old_outcome='error' AND (old_state IS DISTINCT FROM new_state
          OR old_message IS DISTINCT FROM new_message)) THEN
    RAISE EXCEPTION 'cold-digest-differential-mismatch';
  END IF;
  metadata:=jsonb_build_object('kind','cold-digest-native-differential',
    'qualified',1,'role',role_name,'expectedOutcome',old_outcome,
    'caseId',current_setting('helmut.diagnostic_cold_digest_case_id'),
    'pairNonce',current_setting('helmut.diagnostic_cold_digest_pair_nonce'),
    'requestInputSHA256',encode(sha256(convert_to(
      current_setting('helmut.diagnostic_cold_digest_request'),'UTF8')),'hex'),
    'oldFunctionBodySHA256',catalog_old#>>'{catalog,state,functions,helmut_auth_state_graph_read_v1,hash}',
    'newFunctionBodySHA256',catalog_new#>>'{catalog,state,functions,helmut_auth_state_graph_read_v1,hash}',
    'onlyFunctionBodyCatalogDelta',true,
    'catalogBeforeSHA256',encode(sha256(convert_to(catalog_old::text,'UTF8')),'hex'),
    'catalogCandidateSHA256',encode(sha256(convert_to(catalog_new::text,'UTF8')),'hex'),
    'exactWholeResponsesEqual',CASE WHEN old_outcome='ok' THEN old_v IS NOT DISTINCT FROM new_v ELSE NULL END,
    'identicalErrors',CASE WHEN old_outcome='error' THEN old_state IS NOT DISTINCT FROM new_state
      AND old_message IS NOT DISTINCT FROM new_message ELSE NULL END,
    'errorSQLSTATE',old_state,'errorMessage',old_message,
    'resultTextBytes',octet_length(old_v::text),
    'resultNativeBytes',pg_column_size(old_v),
    'resultTextSHA256',encode(sha256(convert_to(old_v::text,'UTF8')),'hex'),
    'historyReuse',old_v->'historyReuse','graphReuse',old_v->'graphReuse',
    'proof',old_v->'proof','state',old_v->'state',
    'revision',old_v#>>'{data,_authStoreRevision}');
  IF octet_length(metadata::text)>8192 THEN RAISE EXCEPTION 'differential metadata bound'; END IF;
  PERFORM set_config('helmut.diagnostic_cold_digest_outcome',metadata::text,true);
END;
$diff$;
SELECT current_setting('helmut.diagnostic_cold_digest_outcome')::jsonb;
SELECT jsonb_build_object('kind','candidate-ABI-ACL-and-data-unchanged',
  'functionBodySHA256','4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0',
  'qualified',1/coalesce(((SELECT (to_jsonb(p)-'prosrc')=:'before_abi_acl'::jsonb
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=
      '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0'
    FROM pg_proc p WHERE oid='public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure)
    AND (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')=
      '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      FROM public.helmut_store WHERE id='main-auth'))::int,0));
ROLLBACK;
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='1s';
:catalog_query
\gset after_
SELECT jsonb_build_object('kind','baseline-body-restored',
  'fullCatalogRestored',:'before_catalog_snapshot'::jsonb=:'after_catalog_snapshot'::jsonb,
  'qualified',1/coalesce(((:'before_catalog_snapshot'::jsonb=:'after_catalog_snapshot'::jsonb)
    AND (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')=
      '1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'
    FROM pg_proc WHERE oid='public.helmut_auth_state_graph_read_v1(jsonb)'::regprocedure)
    AND (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')=
      '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      FROM public.helmut_store WHERE id='main-auth'))::int,0));
ROLLBACK;
