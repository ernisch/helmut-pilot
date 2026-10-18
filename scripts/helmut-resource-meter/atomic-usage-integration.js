"use strict";

// Local resource-run integration. Import/descriptor/query construction do not
// write a database, activate profiles, reserve resources or claim authority.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), { performance } = require("node:perf_hooks");
const ROOT = path.resolve(__dirname, "../.."), MODE = "relational-atomic-v1";
const SOURCE_FILES = ["lib/helmut/llm-usage-atomic.js", "lib/helmut/auth-store-cas.js", "lib/helmut/storage.js",
  "lib/helmut/ai.js", "lib/helmut/testkosten-budget.js", "lib/helmut/synthetik-500-content-runner.js",
  "lib/helmut/synthetik-500-cpu-source-pins.json", "supabase/proposals/auth_usage_atomic_local.sql",
  "scripts/helmut-resource-meter/atomic-usage-integration.js"];
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
// Native bodies from the accepted final PG17.6 candidate, not a caller claim.
const FUNCTION_HASHES = Object.freeze({
  helmut_auth_usage_bootstrap_v1: "85a0c025017e8929c5034c2e55401516166e7795818749e24dc3f307b85b8e0a",
  helmut_auth_usage_read_v1: "c7395fad4c68780261e00f05aaabe4e78128148f1cbbbbe745eec96309d27a94",
  helmut_auth_usage_cas_v1: "793b29dd03c3fa8d4d078bb1e2ca48cb8260e0203e7f282b22d1c015b7593afb",
  helmut_auth_usage_restore_v1: "0133cb99975e397aeb5556d7575a8c9913e1ab4a47b7da4df54fd08b3bd12412",
  helmut_auth_usage_guard_local_v1: "07456f2ec9b043d220a18c035a5c0430eda9c5b1f1f82ca30bd3794b4359676d",
  helmut_auth_usage_insert_local_v1: "2b17b64b896b753d6e4ccde7f0b1082b63f2c5fac5dd093de9c7bf3148430f5f"
});
const GENERATED = Object.freeze({
  usage_record_hash: { kind: "s", expression: "encode(sha256(SUBSTRING(jsonb_send(usage_record) FROM 2)), 'hex'::text)" },
  usage_chain_hash: { kind: "s", expression: "encode(sha256(((usage_prev_hash || encode(sha256(SUBSTRING(jsonb_send(usage_record) FROM 2)), 'hex'::text)))::bytea), 'hex'::text)" }
});
function pin(file) {
  assert(path.isAbsolute(file) && fs.realpathSync(file) === file && fs.lstatSync(file).isFile()
    && !fs.lstatSync(file).isSymbolicLink());
  const b = fs.readFileSync(file);return { path: file, bytes: b.length, sha256: sha(b) };
}
function pinned(p) { assert.deepEqual(pin(p.path), p);return fs.readFileSync(p.path); }
function descriptor() {
  return { schema: "helmut-local-atomic-usage-resource-input/1", mode: MODE, production: false,
    originalHistoryPreserved: true, fullContractUnchanged: true, sourcePins: SOURCE_FILES.map(f => pin(path.join(ROOT, f))) };
}
function readDescriptor(p) {
  const d = JSON.parse(pinned(p));assert.deepEqual(d, descriptor());return d;
}
function environment(env, p) {
  readDescriptor(p);assert(!env.VERCEL && !env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY);
  assert(env.HELMUT_LLM_USAGE_STORAGE === undefined || env.HELMUT_LLM_USAGE_STORAGE === MODE);
  return { ...env, HELMUT_LLM_USAGE_STORAGE: MODE };
}
function projectQuery(query) {
  assert.equal(typeof query, "string");const start = /^\s*(select\b|with\s+(recursive\s+)?)/i.exec(query);
  assert(start, "Only original READ ONLY SELECT/WITH queries may be projected");
  // OFFSET 0 retains a lateral evaluation boundary: reconstruct once per
  // selected auth row, not once per data field. No materialized wide table,
  // replacement data or new view. Qualified public.helmut_store remains raw.
  const cte = "helmut_store AS NOT MATERIALIZED (SELECT p.id,x.data,p.updated_at,p.tableoid,p.xmin,p.ctid "
    + "FROM public.helmut_store p CROSS JOIN LATERAL (SELECT CASE WHEN p.id='main-auth' THEN "
    + "public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}'::jsonb)->'data' ELSE p.data END AS data OFFSET 0) x) ";
  if (/^select/i.test(start[1])) return "WITH " + cte + query;
  return "WITH " + (start[2] ? "RECURSIVE " : "") + cte + "," + query.slice(start[0].length);
}
function physicalWitnessExpression() {
  return "(SELECT jsonb_build_object('mode','" + MODE + "','physicalAuthSHA256',"
    + "encode(sha256(convert_to(p.data::text,'UTF8')),'hex'),'proof',p.data->'_llmUsageRef') "
    + "FROM public.helmut_store p WHERE p.id='main-auth')";
}
function catalogSQL() {
  return "SELECT jsonb_build_object('serverVersion',current_setting('server_version'),'serverEncoding',current_setting('server_encoding'),"
    + "'clientEncoding',current_setting('client_encoding'),'localGate',current_setting('helmut.local_usage_experiment',true),"
    + "'functions',(SELECT jsonb_object_agg(proname,jsonb_build_object('hash',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),"
    + "'definer',prosecdef,'config',proconfig,'arguments',oidvectortypes(proargtypes),'result',format_type(prorettype,NULL),"
    + "'volatility',provolatile,'owner',pg_get_userbyid(proowner),'publicExecute',EXISTS(SELECT FROM aclexplode(coalesce(proacl,acldefault('f',proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),"
    + "'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'customerExecute',has_function_privilege('authenticated',oid,'EXECUTE'),"
    + "'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE')))FROM pg_proc "
    + "WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_usage_%'),"
    + "'generated',(SELECT jsonb_object_agg(a.attname,jsonb_build_object('kind',a.attgenerated,'expression',pg_get_expr(d.adbin,d.adrelid))) "
    + "FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum "
    + "WHERE a.attrelid='public.llm_usage'::regclass AND a.attname IN('usage_record_hash','usage_chain_hash')),"
    + "'triggers',(SELECT jsonb_object_agg(t.tgname,jsonb_build_object('state',t.tgenabled,'table',n.nspname||'.'||c.relname,"
    + "'function',pn.nspname||'.'||p.proname,'type',t.tgtype,'condition',pg_get_expr(t.tgqual,t.tgrelid),'arguments',t.tgnargs))"
    + "FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
    + "JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal "
    + "AND t.tgname IN('helmut_usage_record_immutable_local','helmut_usage_auth_bound_local','helmut_usage_no_truncate_local','helmut_usage_auth_no_truncate_local')));";
}
function assertCatalog(c) {
  assert.equal(c.serverVersion.split(" ")[0], "17.6");assert.equal(c.serverEncoding, "UTF8");assert.equal(c.clientEncoding, "UTF8");
  assert.equal(c.localGate, "on");assert.deepEqual(Object.keys(c.functions).sort(), Object.keys(FUNCTION_HASHES).sort());
  for(const [name,hash]of Object.entries(FUNCTION_HASHES)){
    const guard=name==='helmut_auth_usage_guard_local_v1',insert=name==='helmut_auth_usage_insert_local_v1';
    assert.deepEqual(c.functions[name],{hash,definer:false,config:['search_path=pg_catalog'],
      arguments:guard?'':insert?'text, text, bigint, text, jsonb':'jsonb',result:guard?'trigger':insert?'text':'jsonb',
      volatility:name==='helmut_auth_usage_read_v1'?'s':'v',owner:'postgres',publicExecute:false,
      anonExecute:false,customerExecute:false,serviceExecute:!guard});
  }
  assert.deepEqual(c.generated, GENERATED);
  assert.equal(Object.keys(c.triggers).length, 4);
  for(const [name,table,type]of [['helmut_usage_record_immutable_local','llm_usage',31],['helmut_usage_auth_bound_local','helmut_store',31],
    ['helmut_usage_no_truncate_local','llm_usage',34],['helmut_usage_auth_no_truncate_local','helmut_store',34]])
    assert.deepEqual(c.triggers[name],{state:'A',table:'public.'+table,function:'public.helmut_auth_usage_guard_local_v1',type,condition:null,arguments:0});
}
function sourceReadySQL(){
  return "WITH original_history AS(SELECT e.value FROM public.helmut_store a CROSS JOIN LATERAL jsonb_array_elements(a.data->'llmUsage')e WHERE a.id='main-auth') "
    +"SELECT jsonb_build_object('catalog',("+catalogSQL().slice(0,-1)+"),'historyRows',(SELECT count(*)FROM original_history),"
    +"'uniqueHistoryIDs',(SELECT count(DISTINCT value->>'id')FROM original_history),"
    +"'overlappingIDs',(SELECT count(*)FROM public.llm_usage u WHERE EXISTS(SELECT FROM original_history e WHERE e.value->>'id'=u.id)),"
    +"'bindingColumns',(SELECT count(*)FROM pg_attribute "
    +"WHERE attrelid='public.llm_usage'::regclass AND NOT attisdropped AND attname IN('usage_store_id','usage_generation','usage_ordinal','usage_record','usage_prev_hash','usage_record_hash','usage_chain_hash')),"
    +"'auth',(SELECT jsonb_build_object('bound',data?'_llmUsageRef','historyType',jsonb_typeof(data->'llmUsage'),'historyCount',jsonb_array_length(data->'llmUsage'))FROM public.helmut_store WHERE id='main-auth'));";
}
function assertSourceReady(s){
  assert.equal(s.catalog.serverVersion.split(' ')[0],'17.6');assert.equal(s.catalog.serverEncoding,'UTF8');assert.equal(s.catalog.clientEncoding,'UTF8');
  assert.equal(s.bindingColumns,0);assert.equal(s.catalog.functions,null);assert.equal(s.catalog.generated,null);assert.equal(s.catalog.triggers,null);
  assert.equal(s.auth.bound,false);assert.equal(s.auth.historyType,'array');assert(Number.isSafeInteger(s.auth.historyCount)&&s.auth.historyCount>=0);
  assert.equal(s.historyRows,s.auth.historyCount);assert.equal(s.uniqueHistoryIDs,s.historyRows);assert.equal(s.overlappingIDs,0);
}
function bootstrapSQL(expectedHash) {
  assert(/^[a-f0-9]{64}$/.test(expectedHash));
  return "SELECT public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash'," + literal(expectedHash) + "));";
}
function assertLocalTarget(plan) {
  assert.equal(plan.production, false);assert.equal(plan.profiles, 500);
  assert(/^helmut_resource_fixture_20261018_[a-f0-9]{12}$/.test(plan.targetDatabase));
  assert(/^helmut-meter-db-w20-[a-f0-9]{12}$/.test(plan.containerName));
}
function installAfterActivation({ plan, candidatePin, targetSQL }) {
  readDescriptor(candidatePin);
  assertLocalTarget(plan);
  const begin = performance.now(), read = q => JSON.parse(targetSQL("BEGIN READ ONLY;" + q + "ROLLBACK;"));
  assertSourceReady(read(sourceReadySQL()));
  const before = read("SELECT jsonb_build_object('database',current_database(),'hash',encode(sha256(convert_to(data::text,'UTF8')),'hex'),"
    + "'withoutRevisionHash',encode(sha256(convert_to((data-'_authStoreRevision')::text,'UTF8')),'hex'),"
    + "'history',jsonb_array_length(data->'llmUsage'),'bound',data?'_llmUsageRef')FROM public.helmut_store WHERE id='main-auth';");
  assert.equal(before.database, plan.targetDatabase);assert.equal(before.bound, false);assert(Number.isSafeInteger(before.history));
  // Only the new measured target is changed; all costs remain in this measured
  // first stage. PostgREST is started later, so no mixed old/new writer exists.
  targetSQL("ALTER DATABASE \"" + plan.targetDatabase + "\" SET helmut.local_usage_experiment='on';");
  targetSQL(fs.readFileSync(path.join(ROOT, "supabase/proposals/auth_usage_atomic_local.sql"), "utf8"));
  const result = JSON.parse(targetSQL(bootstrapSQL(before.hash)));
  assert.equal(result.proof.originalHash, before.hash);assert.equal(result.proof.count, before.history);
  const after = read("SELECT jsonb_build_object('logicalWithoutRevisionHash',encode(sha256(convert_to("
    + "((public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}')->'data')-'_authStoreRevision')::text,'UTF8')),'hex'),"
    + "'native'," + physicalWitnessExpression() + ");");
  assert.equal(after.logicalWithoutRevisionHash, before.withoutRevisionHash);
  assert.deepEqual(after.native.proof, { version: MODE, ...result.proof });
  const catalog = read(catalogSQL());assertCatalog(catalog);
  return { schema: "helmut-measured-atomic-usage-bootstrap/1", pass: true, candidatePin,
    targetDatabase: plan.targetDatabase, originalPhysicalHash: before.hash, initialPhysicalHash: after.native.physicalAuthSHA256,
    logicalWithoutRevisionHash: before.withoutRevisionHash, proof: result.proof, originalHistoryCount: before.history,
    catalog, wallMS: performance.now() - begin, includedInMeasuredPreparation: true,
    activationByThisHelper: false, costsAndOriginalHistoryUnchanged: true, production: false };
}
module.exports = { MODE, SOURCE_FILES, pin, pinned, descriptor, readDescriptor, environment,
  projectQuery, physicalWitnessExpression, catalogSQL, assertCatalog, sourceReadySQL, assertSourceReady, bootstrapSQL, assertLocalTarget, installAfterActivation };
