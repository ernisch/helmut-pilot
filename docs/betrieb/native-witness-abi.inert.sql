-- INERT SOURCE, NOT A MIGRATION. No installation/execute grant authorized.
-- Root must materialize all six NULL facts from genuine independently accepted
-- actor/catalog/serializer evidence, then rebaseline NativeD's protected public
-- functions after a separately approved install. Never alter its ownership list.
-- Native catalog digest: SHA256(stock JSONB::text UTF8), not JS V.hash.
-- No universal codec/binary/superuser-mutation attestation is claimed.
-- Caller must set a positive <=15s statement_timeout BEFORE the outer RPC
-- statement starts. Function proconfig cannot start that outer timer.
-- Root read admission needs the actual caller/transaction setup evidence.
BEGIN;
CREATE OR REPLACE FUNCTION public.helmut_starttor_original_state_witness(
 p_nonce text,p_packet_hash text,p_auth_hash text,p_main_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog SET timezone='UTC' SET datestyle='ISO,YMD'
SET lock_timeout='3s'
SET enable_seqscan=on SET enable_indexscan=off SET enable_indexonlyscan=off
SET enable_bitmapscan=off SET enable_tidscan=off SET max_parallel_workers_per_gather=0
AS $helmut_native_witness_body$
DECLARE
 expected_actor text := NULL;
 expected_session_actor text := NULL;
 expected_jwt_role text := NULL;
 expected_catalog_native_sha256 text := NULL;
 expected_serializer_oid oid := NULL;
 expected_serializer_source_sha256 text := NULL;
 v_catalog jsonb; v_catalog_hash text; v_serializer record; v_self record;
 v_packet jsonb; v_auth record; v_main record; v_counter record;
 v_auth_head jsonb; v_main_head jsonb; v_counter_head jsonb;
 v_auth_compact text; v_main_compact text; v_packet_compact text;
 v_auth_hash text; v_main_hash text; v_result jsonb; v_quiet jsonb;
 v_pin jsonb; v_gate text; v_claims jsonb; v_jwt_role text;
 v_node jsonb; v_path text; v_fields text[];
 v_at timestamptz; v_at_text text; v_day text; v_rows bigint;
BEGIN
 -- Unknown materialization is a STOP before any business-field read.
 IF expected_actor IS NULL OR expected_session_actor IS NULL OR expected_jwt_role IS NULL
  OR expected_catalog_native_sha256 IS NULL OR expected_serializer_oid IS NULL
  OR expected_serializer_source_sha256 IS NULL THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 IF current_setting('transaction_read_only')<>'on' OR current_database()<>'postgres'
  OR current_setting('server_version_num')<>'170006'
  OR current_setting('statement_timeout')::interval NOT BETWEEN interval '0.001 seconds' AND interval '15 seconds'
  OR current_setting('transaction_isolation') NOT IN ('read committed','repeatable read','serializable')
  OR current_user::text<>expected_actor OR session_user::text<>expected_session_actor
  OR current_setting('role',true) IS DISTINCT FROM expected_actor
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolbypassrls)
  OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'
  OR p_packet_hash IS NULL OR p_packet_hash !~ '^[a-f0-9]{64}$'
  OR p_auth_hash IS NULL OR p_auth_hash !~ '^[a-f0-9]{64}$'
  OR p_main_hash IS NULL OR p_main_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_claims:=current_setting('request.jwt.claims',true)::jsonb;
 v_jwt_role:=v_claims->>'role';
 IF jsonb_typeof(v_claims) IS DISTINCT FROM 'object' OR v_jwt_role IS DISTINCT FROM expected_jwt_role
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
WITH wanted(rel,attr) AS (VALUES ('helmut_store','id'),('helmut_store','data'),('llm_budget_counters','day'),('llm_budget_counters','scope'),('llm_budget_counters','used'),('pipeline_locks','expires_at'),('helmut_jobs','status'),('helmut_jobs','lease_expires_at'),('process_runs','status'),('process_runs','finished_at'),('helmut_job_outbox','status')),
attrs AS (SELECT jsonb_build_object('relation',w.rel,'name',a.attname,'number',a.attnum,'typeOid',a.atttypid,'typeModifier',a.atttypmod,'collation',a.attcollation,'storage',a.attstorage,'generated',a.attgenerated,'identity',a.attidentity,'hasMissing',a.atthasmissing,'notNull',a.attnotnull,'xmin',a.xmin::text) AS item,a.atttypid FROM wanted w JOIN pg_namespace n ON n.nspname='public' JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=w.rel JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=w.attr AND a.attnum>0 AND NOT a.attisdropped),
types AS (SELECT t.*,t.xmin::text AS native_xmin FROM pg_type t WHERE t.oid IN (SELECT atttypid FROM attrs)),
ios AS (SELECT DISTINCT f.*,f.xmin::text AS native_xmin FROM types t JOIN pg_proc f ON f.oid IN (t.typinput,t.typoutput,t.typreceive,t.typsend))
SELECT jsonb_build_object('observedAtUTC',clock_timestamp(),'caller',current_user,'readOnly',current_setting('transaction_read_only'),'serverVersionNum',current_setting('server_version_num'),
'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'oid',c.oid,'namespace',n.oid,'xmin',c.xmin::text,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),'amOid',c.relam,'amName',am.amname,'partition',c.relispartition,'inheritance',(SELECT count(*) FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'serviceRoleSelect',has_table_privilege('service_role',c.oid,'SELECT')) ORDER BY c.relname COLLATE "C") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_am am ON am.oid=c.relam WHERE n.nspname='public' AND c.relname IN (SELECT rel FROM wanted)),
'attributes',(SELECT jsonb_agg(item ORDER BY item->>'relation' COLLATE "C",item->>'name' COLLATE "C") FROM attrs),
'types',(SELECT jsonb_agg(jsonb_build_object('name',t.typname,'oid',t.oid,'xmin',t.native_xmin,'namespace',n.nspname,'owner',pg_get_userbyid(t.typowner),'kind',t.typtype,'input',t.typinput,'output',t.typoutput,'recv',t.typreceive,'send',t.typsend,'acl',t.typacl::text) ORDER BY t.oid) FROM types t JOIN pg_namespace n ON n.oid=t.typnamespace),
'ioFunctions',(SELECT jsonb_agg(jsonb_build_object('name',f.proname,'oid',f.oid,'xmin',f.native_xmin,'namespace',n.nspname,'owner',pg_get_userbyid(f.proowner),'language',l.lanname,'signature',oidvectortypes(f.proargtypes),'returns',f.prorettype::regtype::text,'body',f.prosrc,'securityDefiner',f.prosecdef,'volatility',f.provolatile,'config',f.proconfig,'acl',f.proacl::text,'serviceRoleExecute',has_function_privilege('service_role',f.oid,'EXECUTE')) ORDER BY f.oid) FROM ios f JOIN pg_namespace n ON n.oid=f.pronamespace JOIN pg_language l ON l.oid=f.prolang),
'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'oid',r.oid,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls,'inherit',r.rolinherit,'login',r.rolcanlogin) ORDER BY r.rolname COLLATE "C") FROM pg_roles r WHERE r.rolname IN ('service_role','authenticator')),
'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',f.proname,'schema',n.nspname,'oid',f.oid,'xmin',f.xmin::text,'owner',pg_get_userbyid(f.proowner),'language',l.lanname,'signature',oidvectortypes(f.proargtypes),'returns',f.prorettype::regtype::text,'returnsSet',f.proretset,'source',f.prosrc,'definition',pg_get_functiondef(f.oid),'sourceSHA256',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),'securityDefiner',f.prosecdef,'volatility',f.provolatile,'config',f.proconfig,'acl',f.proacl::text,'serviceRoleExecute',has_function_privilege('service_role',f.oid,'EXECUTE')) ORDER BY n.nspname,f.proname,f.oid),'[]'::jsonb) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace JOIN pg_language l ON l.oid=f.prolang WHERE (n.nspname='helmut_synthetik500_internal' AND f.proname='json_compact') OR (n.nspname='public' AND f.proname='helmut_postgrest_identity_probe_v1'))) INTO v_catalog;
 v_catalog:=v_catalog-ARRAY['observedAtUTC','caller','readOnly'];
 -- Schema privilege is checked independently; names/ACLs join the descriptor.
 v_catalog:=v_catalog||jsonb_build_object('namespaces',(SELECT jsonb_agg(
  jsonb_build_object('name',nspname,'oid',oid,'xmin',xmin::text,'owner',pg_get_userbyid(nspowner),
   'acl',nspacl::text,'usage',has_schema_privilege(expected_actor,oid,'USAGE')) ORDER BY nspname COLLATE "C")
  FROM pg_namespace WHERE nspname IN ('pg_catalog','public','helmut_synthetik500_internal')));
 IF jsonb_array_length(v_catalog->'relations') IS DISTINCT FROM 6
  OR jsonb_array_length(v_catalog->'attributes') IS DISTINCT FROM 11
  OR jsonb_array_length(v_catalog->'types') IS DISTINCT FROM 4
  OR jsonb_array_length(v_catalog->'ioFunctions') IS DISTINCT FROM 16
  OR jsonb_array_length(v_catalog->'namespaces') IS DISTINCT FROM 3
  OR EXISTS(SELECT FROM jsonb_array_elements(v_catalog->'relations') x WHERE x->>'kind'<>'r'
   OR x->>'persistence'<>'p' OR x->>'amName'<>'heap' OR (x->>'partition')::boolean
   OR (x->>'inheritance')::bigint<>0 OR (x->>'serviceRoleSelect')::boolean IS DISTINCT FROM true)
  OR EXISTS(SELECT FROM jsonb_array_elements(v_catalog->'attributes') x WHERE x->>'generated'<>''
   OR x->>'identity'<>'' OR x->>'typeOid' NOT IN ('23','25','1184','3802'))
  OR EXISTS(SELECT FROM jsonb_array_elements(v_catalog->'types') x WHERE x->>'namespace'<>'pg_catalog'
   OR x->>'kind'<>'b' OR x->>'name' NOT IN ('text','jsonb','int4','timestamptz'))
  OR EXISTS(SELECT FROM jsonb_array_elements(v_catalog->'ioFunctions') x WHERE x->>'namespace'<>'pg_catalog'
   OR x->>'language'<>'internal' OR (x->>'securityDefiner')::boolean IS DISTINCT FROM false
   OR (x->>'serviceRoleExecute')::boolean IS DISTINCT FROM true)
  OR EXISTS(SELECT FROM jsonb_array_elements(v_catalog->'namespaces') x WHERE (x->>'usage')::boolean IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_catalog_hash:=encode(sha256(convert_to(v_catalog::text,'UTF8')),'hex');
 IF v_catalog_hash IS DISTINCT FROM expected_catalog_native_sha256
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 SELECT p.*,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS source_sha INTO STRICT v_serializer
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='helmut_synthetik500_internal' AND p.proname='json_compact'
 AND p.proargtypes='3802'::oidvector AND p.prorettype=25 AND NOT p.proretset
 AND NOT p.prosecdef AND p.provolatile='i';
 IF v_serializer.oid IS DISTINCT FROM expected_serializer_oid
  OR v_serializer.source_sha IS DISTINCT FROM expected_serializer_source_sha256
  OR NOT has_function_privilege(current_user,v_serializer.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 SELECT p.*,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS source_sha INTO STRICT v_self
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.helmut_starttor_original_state_witness(text,text,text,text)');
 IF v_self.prosecdef OR v_self.provolatile<>'s' OR v_self.prorettype<>3802 OR v_self.proretset
  OR v_self.prokind<>'f' OR pg_get_userbyid(v_self.proowner)<>'postgres'
  OR v_self.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  OR v_self.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog','TimeZone=UTC','DateStyle=ISO,YMD',
   'lock_timeout=3s','enable_seqscan=on','enable_indexscan=off',
   'enable_indexonlyscan=off','enable_bitmapscan=off','enable_tidscan=off','max_parallel_workers_per_gather=0']
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 -- Serializer is used only after its finite source/catalog/privilege barrier.
 v_at:=clock_timestamp();v_at_text:=to_char(v_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 v_day:=to_char(v_at AT TIME ZONE 'UTC','YYYY-MM-DD');
 SELECT data INTO STRICT v_packet FROM ONLY public.helmut_store WHERE id='synthetik500-original-state-'||p_nonce;
 v_packet_compact:=helmut_synthetik500_internal.json_compact(v_packet);
 FOR v_path,v_fields IN SELECT * FROM (VALUES
  ('',ARRAY['version','operationNonce','rootExecutor','purpose','admittedAtUTC','expiresAtUTC','runtime','nativeAbi','finance','scopeEvidence','authorization','startschutz','gates','preservedControls']),
  ('runtime',ARRAY['commit','deploymentId','immutableHost','projectRef','actualReviewPin']),
  ('nativeAbi',ARRAY['version','name','oid','bodySha256','catalogNativeSha256','serializerOid','serializerBodySha256','actor','sessionActor','jwtRole','actualReviewPin']),
  ('finance',ARRAY['observedAtUTC','authHead','counterHead','actualReviewPin']),
  ('scopeEvidence',ARRAY['observedAtUTC','paidRoutes','workerAndManual','github','cronWindow','endGuard']),
  ('authorization',ARRAY['version','specificOriginalInternalReadApproved','originalUserEvidencePin']),
  ('startschutz',ARRAY['paketUtf8','input','quietReference','financeReference']),
  ('startschutz.input',ARRAY['manifest','snapshot','belege']),
  ('gates',ARRAY['independentSourceReviewPin','rootReadAdmissionPin','specificReadAuthorizationAccepted','installedNativeAbiAccepted','finiteCurrentNativeCatalogAccepted','completeFreshFinanceAccepted','controlledPaidInflightScopeAccepted','endGuardReadyAccepted']),
  ('preservedControls',ARRAY['version','controlHash','actualReviewPin'])
 ) AS expected(path,fields) LOOP
  v_node:=CASE WHEN v_path='' THEN v_packet ELSE v_packet#>string_to_array(v_path,'.') END;
  IF jsonb_typeof(v_node) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
  IF (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(v_node) k)
   IS DISTINCT FROM (SELECT array_agg(k ORDER BY k COLLATE "C") FROM unnest(v_fields) k)
  THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 END LOOP;
 IF coalesce(v_packet->'runtime'->>'commit','') !~ '^[a-f0-9]{40}$'
  OR coalesce(v_packet->'runtime'->>'deploymentId','') !~ '^dpl_[a-zA-Z0-9]+$'
  OR coalesce(v_packet->'runtime'->>'immutableHost','') !~ '^[a-z0-9-]+\.vercel\.app$'
  OR v_packet->'runtime'->>'projectRef' IS DISTINCT FROM 'ddckuvvpcytqbyfmbvie'
  OR v_packet->'preservedControls'->>'version' IS DISTINCT FROM 'helmut-original-state-preserved-controls/1'
  OR coalesce(v_packet->'preservedControls'->>'controlHash','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v_packet->'startschutz'->'paketUtf8') IS DISTINCT FROM 'string'
  OR v_packet->'startschutz'->>'paketUtf8'=''
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 IF jsonb_typeof(v_packet) IS DISTINCT FROM 'object' OR octet_length(v_packet_compact)>2097152 OR encode(sha256(convert_to(v_packet_compact,'UTF8')),'hex')<>p_packet_hash
  OR v_packet->>'version' IS DISTINCT FROM 'helmut-original-state-witness-root-packet/3-counter-absence'
  OR v_packet->>'rootExecutor' IS DISTINCT FROM '/root' OR v_packet->>'operationNonce' IS DISTINCT FROM p_nonce
  OR v_packet->>'purpose' IS DISTINCT FROM 'original-auth-main-js-native-hash-and-quiet-bridge'
  OR jsonb_typeof(v_packet->'startschutz'->'input'->'belege'->'kosten'->'auth') IS DISTINCT FROM 'null'
  OR v_packet->'authorization'->>'version' IS DISTINCT FROM 'helmut-original-state-internal-read-authorization/1'
  OR v_packet->'authorization'->'specificOriginalInternalReadApproved' IS DISTINCT FROM 'true'::jsonb
  OR v_packet->'nativeAbi'->>'version' IS DISTINCT FROM 'helmut-original-state-native-witness/2-counter-absence'
  OR v_packet->'nativeAbi'->>'name' IS DISTINCT FROM 'helmut_starttor_original_state_witness'
  OR v_packet->'nativeAbi'->>'oid' IS DISTINCT FROM v_self.oid::text
  OR v_packet->'nativeAbi'->>'bodySha256' IS DISTINCT FROM v_self.source_sha
  OR v_packet->'nativeAbi'->>'catalogNativeSha256' IS DISTINCT FROM v_catalog_hash
  OR v_packet->'nativeAbi'->>'serializerOid' IS DISTINCT FROM v_serializer.oid::text
  OR v_packet->'nativeAbi'->>'serializerBodySha256' IS DISTINCT FROM v_serializer.source_sha
  OR v_packet->'nativeAbi'->>'actor' IS DISTINCT FROM expected_actor
  OR v_packet->'nativeAbi'->>'sessionActor' IS DISTINCT FROM expected_session_actor
  OR v_packet->'nativeAbi'->>'jwtRole' IS DISTINCT FROM expected_jwt_role
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 -- Missing fields never become true through SQL's NULL boolean semantics.
 FOR v_gate IN SELECT unnest(ARRAY['specificReadAuthorizationAccepted','installedNativeAbiAccepted',
  'finiteCurrentNativeCatalogAccepted','completeFreshFinanceAccepted','controlledPaidInflightScopeAccepted','endGuardReadyAccepted']) LOOP
  IF v_packet->'gates'->v_gate IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 END LOOP;
 FOR v_pin IN SELECT v_packet#>string_to_array(path,'.') FROM unnest(ARRAY[
  'runtime.actualReviewPin','nativeAbi.actualReviewPin','finance.actualReviewPin','authorization.originalUserEvidencePin',
  'gates.independentSourceReviewPin','gates.rootReadAdmissionPin','preservedControls.actualReviewPin',
  'scopeEvidence.paidRoutes','scopeEvidence.workerAndManual','scopeEvidence.github','scopeEvidence.cronWindow','scopeEvidence.endGuard']) path LOOP
  IF jsonb_typeof(v_pin) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v_pin))<>2
   OR coalesce(v_pin->>'sha256','') !~ '^[a-f0-9]{64}$'
   OR coalesce(v_pin->>'bytes','') !~ '^[1-9][0-9]{0,15}$'
   OR (v_pin->>'bytes')::numeric>9007199254740991 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 END LOOP;
 IF coalesce(v_packet->>'admittedAtUTC','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
  OR coalesce(v_packet->>'expiresAtUTC','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
  OR (v_packet->>'admittedAtUTC')::timestamptz>v_at OR v_at-(v_packet->>'admittedAtUTC')::timestamptz>interval '60 seconds'
  OR (v_packet->>'expiresAtUTC')::timestamptz<=v_at
  OR (v_packet->>'expiresAtUTC')::timestamptz-(v_packet->>'admittedAtUTC')::timestamptz NOT BETWEEN interval '0.001 seconds' AND interval '20 minutes'
  OR coalesce(v_packet->'finance'->>'observedAtUTC','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
  OR coalesce(v_packet->'scopeEvidence'->>'observedAtUTC','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
  OR (v_packet->'finance'->>'observedAtUTC')::timestamptz>v_at OR v_at-(v_packet->'finance'->>'observedAtUTC')::timestamptz>interval '60 seconds'
  OR (v_packet->'scopeEvidence'->>'observedAtUTC')::timestamptz>v_at OR v_at-(v_packet->'scopeEvidence'->>'observedAtUTC')::timestamptz>interval '60 seconds'
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 SELECT id,data,tableoid::oid AS table_oid,xmin::text AS row_xmin INTO STRICT v_auth FROM ONLY public.helmut_store WHERE id='main-auth';
 SELECT id,data,tableoid::oid AS table_oid,xmin::text AS row_xmin INTO STRICT v_main FROM ONLY public.helmut_store WHERE id='main';
 IF jsonb_typeof(v_auth.data) IS DISTINCT FROM 'object' OR jsonb_typeof(v_main.data) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_auth_compact:=helmut_synthetik500_internal.json_compact(v_auth.data);
 v_main_compact:=helmut_synthetik500_internal.json_compact(v_main.data);
 IF octet_length(v_auth_compact) NOT BETWEEN 1 AND 4194304 OR octet_length(v_main_compact) NOT BETWEEN 1 AND 4194304
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_auth_hash:=encode(sha256(convert_to(v_auth_compact,'UTF8')),'hex');v_main_hash:=encode(sha256(convert_to(v_main_compact,'UTF8')),'hex');
 IF v_auth_hash<>p_auth_hash OR v_main_hash<>p_main_hash THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 IF NOT(v_auth.data?'synthetik500KostenAdmission') OR NOT(v_auth.data?'synthetik500DispatchJournal')
  OR encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(jsonb_build_object(
    'slot',v_auth.data->'synthetik500KostenAdmission','journal',v_auth.data->'synthetik500DispatchJournal')),'UTF8')),'hex')
    IS DISTINCT FROM v_packet->'preservedControls'->>'controlHash'
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_auth_head:=jsonb_build_object('id',v_auth.id,'tableOid',v_auth.table_oid::text,'xmin',v_auth.row_xmin,
  'revisionPresent',v_auth.data?'_authStoreRevision','revision',v_auth.data->'_authStoreRevision');
 v_main_head:=jsonb_build_object('id',v_main.id,'tableOid',v_main.table_oid::text,'xmin',v_main.row_xmin,
  'revisionPresent',v_main.data?'_storeRevision','revision',v_main.data->'_storeRevision');
 SELECT count(*) INTO v_rows FROM ONLY public.llm_budget_counters WHERE day=v_day AND scope='global';
 IF v_rows=0 THEN v_counter_head:=jsonb_build_object('day',v_day,'scope','global',
  'tableOid','public.llm_budget_counters'::regclass::oid::text,'rowCount',0,'used',0);
 ELSIF v_rows=1 THEN
  SELECT day,scope,used,tableoid::oid AS table_oid,xmin::text AS row_xmin INTO STRICT v_counter
  FROM ONLY public.llm_budget_counters WHERE day=v_day AND scope='global';
  IF v_counter.used IS NULL OR v_counter.used<0 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
  v_counter_head:=jsonb_build_object('day',v_counter.day,'scope',v_counter.scope,'tableOid',v_counter.table_oid::text,'xmin',v_counter.row_xmin,'used',v_counter.used);
 ELSE RAISE EXCEPTION 'starttor-original-state-closed';END IF;
 IF v_auth_head IS DISTINCT FROM v_packet->'finance'->'authHead' OR v_counter_head IS DISTINCT FROM v_packet->'finance'->'counterHead'
 THEN RAISE EXCEPTION 'starttor-original-state-closed'; END IF;
 v_quiet:=jsonb_build_object(
  'openJobs',(SELECT count(*) FROM ONLY public.helmut_jobs WHERE status IS NULL OR status NOT IN ('erledigt','fehlgeschlagen') OR lease_expires_at>v_at),
  'liveLocks',(SELECT count(*) FROM ONLY public.pipeline_locks WHERE expires_at>v_at),
  'liveLeases',(SELECT count(*) FROM ONLY public.helmut_jobs WHERE lease_expires_at>v_at),
  'runningProcesses',(SELECT count(*) FROM ONLY public.process_runs WHERE status='running' AND finished_at IS NULL),
  'openOutbox',(SELECT count(*) FROM ONLY public.helmut_job_outbox WHERE status IS NULL OR status NOT IN ('bestaetigt','aufgegeben','verzichtet')),
  'unknownRows',(SELECT count(*) FROM ONLY public.pipeline_locks WHERE expires_at IS NULL)+
   (SELECT count(*) FROM ONLY public.process_runs WHERE status IS NULL OR status NOT IN ('running','ok','skipped','success','partial','failed','blocked','rolled_back')
    OR (status<>'running' AND finished_at IS NULL) OR (status='running' AND finished_at IS NOT NULL)));
 IF EXISTS(SELECT FROM jsonb_each_text(v_quiet) x WHERE x.value::bigint<>0) THEN RAISE EXCEPTION 'starttor-original-state-closed';END IF;
 IF clock_timestamp()>= (v_packet->>'expiresAtUTC')::timestamptz OR clock_timestamp()-v_at>interval '60 seconds'
  OR (clock_timestamp() AT TIME ZONE 'UTC')::date::text<>v_day THEN RAISE EXCEPTION 'starttor-original-state-closed';END IF;
 v_result:=jsonb_build_object('version','helmut-original-state-native-witness/2-counter-absence','operationNonce',p_nonce,
  'packetHash',p_packet_hash,'nativeAsOfUTC',v_at_text,'snapshotContract','single-stable-statement',
  'signature',jsonb_build_object('actor',current_user,'sessionActor',session_user,'jwtRole',v_jwt_role,'database',current_database(),
   'serverVersionNum',current_setting('server_version_num'),'readOnly',current_setting('transaction_read_only'),
   'isolation',current_setting('transaction_isolation'),'securityDefiner',v_self.prosecdef,'bypassRls',true),
  'abi',jsonb_build_object('oid',v_self.oid::text,'bodySha256',v_self.source_sha),'catalogNativeSha256',v_catalog_hash,
  'serializer',jsonb_build_object('oid',v_serializer.oid::text,'bodySha256',v_serializer.source_sha),
  'auth',jsonb_build_object('head',v_auth_head,'compactHash',v_auth_hash,'compactBytes',octet_length(v_auth_compact)),
  'main',jsonb_build_object('head',v_main_head,'compactHash',v_main_hash,'compactBytes',octet_length(v_main_compact)),
  'counter',v_counter_head,'quiet',v_quiet);
 IF octet_length(v_result::text)>8192 THEN RAISE EXCEPTION 'starttor-original-state-closed';END IF;
 RETURN v_result;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'starttor-original-state-closed';
END;
$helmut_native_witness_body$;
REVOKE ALL ON FUNCTION public.helmut_starttor_original_state_witness(text,text,text,text) FROM PUBLIC,anon,authenticated;
-- Deliberately no GRANT. Install/grant/staging/caller admission are separate.
COMMIT;
