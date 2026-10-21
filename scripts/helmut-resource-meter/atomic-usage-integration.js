"use strict";

// Local resource-run integration. Import/descriptor/query construction do not
// write a database, activate profiles, reserve resources or claim authority.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), { performance } = require("node:perf_hooks");
const ROOT = path.resolve(__dirname, "../.."), MODE = "relational-atomic-v1";
const SOURCE_FILES = ["lib/helmut/llm-usage-atomic.js", "lib/helmut/auth-store-cas.js", "lib/helmut/storage.js",
  "lib/helmut/synthetik-500-local-calendar.js", "lib/helmut/lage-entwurfsbeleg.js",
  "lib/helmut/auth-state-parts.js", "supabase/proposals/auth_state_parts_local.sql",
  "lib/helmut/ai.js", "lib/helmut/testkosten-budget.js", "lib/helmut/synthetik-500-content-runner.js",
  "lib/helmut/synthetik-500-cpu-source-pins.json", "supabase/proposals/auth_usage_atomic_local.sql",
  "scripts/helmut-resource-meter/atomic-usage-integration.js",
  "scripts/helmut-resource-meter/local-calendar-admission.js", "scripts/helmut-resource-meter/local-calendar-binding.py",
  "scripts/helmut-resource-meter/connect-local500.py", "scripts/helmut-resource-meter/start-input-checks.js",
  "scripts/helmut-resource-meter/bounded-read-integration.js",
  "scripts/helmut-resource-meter/pipeline-lock-lease-integration.js", "lib/helmut/local-pipeline-lock-lease.js",
  "scripts/helmut-resource-meter/local-resource-authority-slot.json"];
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
const CONTROL_READ = "verified-control-view-v1";
const SENDER_CLAIM_READ = "verified-control-claim-v1";
const BOUNDED = require("./bounded-read-integration");
const LEASE = require("./pipeline-lock-lease-integration");
// W50 accepted these reader/transport bytes, not this later integration. Keep
// provenance as pinned metadata, without opening private evidence at runtime.
const CONTROL_SOURCE_ACCEPTANCE = Object.freeze({
  sourceCommit: "c6620c8393cda7a51a1182e13b83e7507de57b65",
  independentReview: Object.freeze({ name: "ACTUAL_DEEPSEEK_CONTROL_SOURCE_ACCEPTANCE.SAFE.json", bytes: 12321,
    sha256: "c2b66bc4abbcbe3b4220e72e88f8d715760f3ec9c1a2aeb7bc99b0376b68c5ac" }),
  transportClosure: Object.freeze({ name: "SOL_STORAGE_TRANSPORT_AND_CALLERS_CLOSURE.SAFE.json", bytes: 4506,
    sha256: "8c70f8756cb56eae8b3b704025d0d27974792e5883ce620da3954907628d1531" }),
  scope: "Control reader plus separately reviewed transport and named callers only",
  newGlueAccepted: false, full500Accepted: false,
  // New local diagnostic delta; the W50 acceptance above does not cover it.
  // Complete fresh integration review remains mandatory at the entrypoint.
  localDiagnosticDelta: Object.freeze({ file: "lib/helmut/synthetik-500-production-adapter.js",
    originalSHA256: "124ed8275efd479ae922ee493d15186701afeaafdbcc1b6def014399e28d34f3",
    sha256: "4c4f18257942f37da4504da20614940f030e59803042cec357bfa275496f7bdb",
    scope: "Nonenumerable Error.cause only; same public stop and no retry", requiresFreshIntegrationAcceptance: true }),
  // Separate source-only review for these later callers; W50 and V11 remain
  // historical. Fresh complete integration admission is still mandatory.
  localReadCallerDelta: Object.freeze({"baselineCommit":"5fae25be5068a278a88daca9a7508c7b9e4001a3","scope":"Additional read-only journal selectors only; full writer/accounting/receipt reads and native protocol unchanged","independentSourceReview":Object.freeze({"name":"REPORT.SAFE.json","bytes":7710,"sha256":"c06da6c2b64159fc834935e395aa5e83d0ba96fd8ce4dcb449ac42c44052ebda"}),"candidateSourceSHA256":Object.freeze({"lib/helmut/storage.js":"51811f20d9886af212a5abbcfbc515aac56c2a5bac29450a127ba7c373d73e8d","lib/helmut/synthetik-500-production-adapter.js":"1aefdf54e0a68e734cf851d48d56f298dd391e0d54bed595068760a19f838aa4"}),"requiresFreshIntegrationAcceptance":true,"newGlueAccepted":false,"full500Accepted":false,"RAMOrTimeGainAccepted":false}),
  // This separately qualified local renderer is outside the historical W50
  // acceptance. No prior full-run authority or whole-run resource proof carries.
  localRendererDelta: Object.freeze({
    baselineCommit: "bdb2c2c3a369ebf175f02734c696b13f00733988",
    file: "supabase/proposals/auth_state_parts_local.sql",
    originalSHA256: "719320ffb34529fd2145b4fa47c290b186a0127e304e52c01ef57cb0d7745f61",
    sha256: "fd038ceb1a49f249e11b8ac548969fd5bba7c4436a2c20a49b9363f3b393448d",
    nativeFunctionBodySHA256: "d02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32",
    nativeDifferential: Object.freeze({ name: "DIFFERENTIAL_RESULT.SAFE.json", bytes: 38509,
      sha256: "846cb9ee89897acd9667320aac559f716ff0e7e6753e974a5132880f42be17ea" }),
    scope: "Final full renderer only; ABI, integrity bounds, CAS and control readers unchanged",
    requiresFreshIntegrationAcceptance: true, newGlueAccepted: false, full500Accepted: false,
    fullResourceGainAccepted: false
  })
});
const CONTROL_SOURCE_HASHES = Object.freeze({
  "lib/helmut/llm-usage-atomic.js": "31a0b8d323e7db43751af2ad2cf5c2c9c95fc2d65fcc765e65ec0ac436e5f8a0",
  "lib/helmut/auth-state-parts.js": "6b1236aec6858a03dc099e272bdcdd9f79df3efa8c8744d42c5e193e5d57b3d9",
  "lib/helmut/auth-store-cas.js": "92cba40816bb8cf8919db846d31b736a77b28e3e8d6d24712646bd0509755dd4",
  "lib/helmut/storage.js": "51811f20d9886af212a5abbcfbc515aac56c2a5bac29450a127ba7c373d73e8d",
  "lib/helmut/synthetik-500-production-adapter.js": "1aefdf54e0a68e734cf851d48d56f298dd391e0d54bed595068760a19f838aa4",
  "lib/helmut/testkosten-budget.js": "9f36d5379ae9c94140cae9e2cf97c12dd91ae6efe9431ca4f16746b9efa5da2e",
  "lib/helmut/synthetik-500-dispatch-journal.js": "c9cf08100d63646e9c16f931b257b6ccc7fa65fc96e18f7bc6459e530bd5e4b8",
  "supabase/proposals/auth_state_parts_local.sql": "fd038ceb1a49f249e11b8ac548969fd5bba7c4436a2c20a49b9363f3b393448d",
  "supabase/proposals/auth_usage_atomic_local.sql": "5fdd3c81cf86c4f03208974bb9fd1f26d355dfaf53520f08de64292581a39e05"
});
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
function descriptor({ stateStorage = null, historyReadReuse = null, graphReadReuse = null, controlRead = null, boundedRead = null,
  senderClaimRead = null, localCalendar = null, pipelineLockLease = null, localSourceDeltaPin = null } = {}) {
  assert(stateStorage === null || stateStorage === "merkle-auth-v1");
  assert(historyReadReuse === null || (historyReadReuse === "verified-history-reuse-v1" && stateStorage === "merkle-auth-v1"));
  // The graph candidate is qualified only by isolated component fixtures so
  // far. No full-run descriptor may silently admit an unmeasured new mode.
  assert(graphReadReuse === null, "Graph reuse has no admitted full-run binding");
  assert(controlRead === null || (controlRead === CONTROL_READ && stateStorage === "merkle-auth-v1"
    && historyReadReuse === "verified-history-reuse-v1"), "Control view requires exact Merkle/history opt-in");
  assert(boundedRead === null || (boundedRead === BOUNDED.MODE && controlRead === CONTROL_READ),
    "Bounded native reader requires exact control/Merkle/history opt-in");
  assert(senderClaimRead === null || (senderClaimRead === SENDER_CLAIM_READ && boundedRead === BOUNDED.MODE),
    "Sender control claim requires exact bounded/control/Merkle/history opt-in");
  const boundedReadAcceptance = boundedRead ? BOUNDED.acceptance() : null;
  const controlCache = controlRead ? require("./control-cache-integration") : null;
  const controlCacheSourceAcceptance = controlCache ? controlCache.acceptance() : null;
  assert(localSourceDeltaPin === null || controlRead === CONTROL_READ, "Local source delta requires the explicit control contract");
  const sourceDelta = localSourceDeltaPin === null ? null : LEASE.sourceDelta(localSourceDeltaPin);
  let lease = null;
  if (pipelineLockLease !== null) {
    assert(controlRead === CONTROL_READ && sourceDelta && boundedRead === BOUNDED.MODE
      && senderClaimRead === SENDER_CLAIM_READ,
    "Lease requires explicit bounded sender control and current source delta");
    assert.deepEqual(Object.keys(pipelineLockLease).sort(), ["acceptancePin", "mode"]);
    assert.equal(pipelineLockLease.mode, LEASE.MODE);
    lease = LEASE.acceptance(pipelineLockLease.acceptancePin);
    const byFile = (a, b) => a.file.localeCompare(b.file);
    assert.deepEqual(lease.acceptance.sourcePins.filter(p => p.file !== LEASE.SQL).sort(byFile), [...sourceDelta.acceptance.sourcePins].sort(byFile),
      "Lease and current source-delta adoption differ");
  }
  if (localCalendar !== null) require(path.join(ROOT, "lib/helmut/synthetik-500-local-calendar")).validatePolicyData(localCalendar);
  // This is also the sole runtime-file list for the added source reads: the
  // existing shared manifest mounts every sourcePin and checks it in-container.
  const files = [...new Set([...SOURCE_FILES, ...(controlRead ? Object.keys(CONTROL_SOURCE_HASHES) : []),
    ...(controlRead ? controlCache.FILES : []),
    ...(sourceDelta || lease ? ["scripts/helmut-resource-meter/pipeline-lock-lease-integration.js"] : []),
    ...(lease ? LEASE.FILES : []),
    ...(boundedRead ? BOUNDED.FILES : []),
    ...(senderClaimRead ? ["scripts/helmut-resource-meter/sender-control-claim.js"] : [])])];
  const sourcePins = files.map(f => pin(path.join(ROOT, f)));
  for (const p of [...(sourceDelta?.sourcePins || []), ...(lease?.sourcePins || [])]) {
    const existing = sourcePins.find(x => x.path === p.path);
    if (existing) assert.deepEqual(existing, p);else sourcePins.push(p);
  }
  if (controlRead) {
    // Historical W50 hashes stay historical; only this separately qualified delta selects current U/Parts.
    const expected = { ...CONTROL_SOURCE_HASHES, ...Object.fromEntries(
      controlCacheSourceAcceptance.currentSources.map(p => [p.file, p.sha256])),
      ...(sourceDelta ? Object.fromEntries(sourceDelta.acceptance.sourcePins
        .filter(p => Object.hasOwn(CONTROL_SOURCE_HASHES, p.file)).map(p => [p.file, p.sha256])) : {}) };
    for (const [file, hash] of Object.entries(expected))
      assert.equal(sourcePins.find(p => p.path === path.join(ROOT, file)).sha256, hash, "Reviewed control source drift: " + file);
  }
  return { schema: "helmut-local-atomic-usage-resource-input/1", mode: MODE, production: false,
    ...(stateStorage ? { stateStorage } : {}), ...(historyReadReuse ? { historyReadReuse } : {}),
    ...(controlRead ? { controlRead, controlSourceAcceptance: CONTROL_SOURCE_ACCEPTANCE, controlCacheSourceAcceptance } : {}),
    ...(boundedRead ? { boundedRead, boundedReadAcceptance } : {}),
    ...(senderClaimRead ? { senderClaimRead } : {}),
    ...(sourceDelta ? { localSourceDeltaPin, localSourceDeltaAcceptance: sourceDelta.acceptance } : {}),
    ...(lease ? { pipelineLockLease, pipelineLockLeaseAcceptance: lease.acceptance } : {}),
    ...(localCalendar ? { localCalendar } : {}),
    originalHistoryPreserved: true, fullContractUnchanged: localCalendar === null,
    ...(localCalendar ? { timingMemoryAndLiveSecurityContractUnchanged: true } : {}),
    sourcePins };
}
function readDescriptor(p) {
  const d = JSON.parse(pinned(p));assert.deepEqual(d, descriptor({ stateStorage: d.stateStorage ?? null,
    historyReadReuse: d.historyReadReuse ?? null, controlRead: d.controlRead ?? null, boundedRead: d.boundedRead ?? null,
    senderClaimRead: d.senderClaimRead ?? null, localCalendar: d.localCalendar ?? null,
    pipelineLockLease: d.pipelineLockLease ?? null, localSourceDeltaPin: d.localSourceDeltaPin ?? null }));return d;
}
function environment(env, p) {
  const d = readDescriptor(p);assert(!env.VERCEL && !env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY);
  assert(!LEASE.isOn(env[LEASE.GLOBAL_ENV]), "Global atomic lock is not admitted by the full local contract");
  assert(env[LEASE.ENV] === undefined || (d.pipelineLockLease?.mode === LEASE.MODE && env[LEASE.ENV] === LEASE.MODE),
    "Pipeline lease requires exact descriptor opt-in");
  assert(env.HELMUT_AUTH_GRAPH_READ_REUSE === undefined, "Graph reuse has no admitted full-run binding");
  assert(env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE === undefined, "Single write capture has no admitted full-run binding");
  assert(env.HELMUT_AUTH_CONTROL_READ === undefined || (d.controlRead === CONTROL_READ
    && env.HELMUT_AUTH_CONTROL_READ === d.controlRead), "Control view requires exact descriptor opt-in");
  assert(env.HELMUT_LLM_USAGE_STORAGE === undefined || env.HELMUT_LLM_USAGE_STORAGE === MODE);
  assert(env.HELMUT_AUTH_STATE_STORAGE === undefined || env.HELMUT_AUTH_STATE_STORAGE === d.stateStorage);
  assert(env.HELMUT_AUTH_HISTORY_READ_REUSE === undefined || env.HELMUT_AUTH_HISTORY_READ_REUSE === d.historyReadReuse);
  assert(env.HELMUT_LOCAL_RESOURCE_CALENDAR_JSON === undefined
    || env.HELMUT_LOCAL_RESOURCE_CALENDAR_JSON === (d.localCalendar ? JSON.stringify(d.localCalendar) : undefined));
  return { ...env, HELMUT_LLM_USAGE_STORAGE: MODE,
    ...(d.pipelineLockLease ? { [LEASE.ENV]: LEASE.MODE, [LEASE.GLOBAL_ENV]: "off" } : {}),
    ...(d.stateStorage ? { HELMUT_AUTH_STATE_STORAGE: d.stateStorage } : {}),
    ...(d.historyReadReuse ? { HELMUT_AUTH_HISTORY_READ_REUSE: d.historyReadReuse } : {}),
    ...(d.controlRead ? { HELMUT_AUTH_CONTROL_READ: d.controlRead } : {}),
    ...(d.localCalendar ? { HELMUT_LOCAL_RESOURCE_CALENDAR_JSON: JSON.stringify(d.localCalendar) } : {}) };
}
function projectQuery(query, { stateStorage = null } = {}) {
  assert(stateStorage === null || stateStorage === "merkle-auth-v1");
  const reader = stateStorage ? "helmut_auth_state_read_v1" : "helmut_auth_usage_read_v1";
  assert.equal(typeof query, "string");const start = /^\s*(select\b|with\s+(recursive\s+)?)/i.exec(query);
  assert(start, "Only original READ ONLY SELECT/WITH queries may be projected");
  // OFFSET 0 retains a lateral evaluation boundary: reconstruct once per
  // selected auth row, not once per data field. No materialized wide table,
  // replacement data or new view. Qualified public.helmut_store remains raw.
  const cte = "helmut_store AS NOT MATERIALIZED (SELECT p.id,x.data,p.updated_at,p.tableoid,p.xmin,p.ctid "
    + "FROM public.helmut_store p CROSS JOIN LATERAL (SELECT CASE WHEN p.id='main-auth' THEN "
    + "public." + reader + "('{\"id\":\"main-auth\"}'::jsonb)->'data' ELSE p.data END AS data OFFSET 0) x) ";
  if (/^select/i.test(start[1])) return "WITH " + cte + query;
  return "WITH " + (start[2] ? "RECURSIVE " : "") + cte + "," + query.slice(start[0].length);
}
function physicalWitnessExpression({ stateStorage = null } = {}) {
  assert(stateStorage === null || stateStorage === "merkle-auth-v1");
  return "(SELECT jsonb_build_object('mode','" + MODE + "','physicalAuthSHA256',"
    + "encode(sha256(convert_to(p.data::text,'UTF8')),'hex'),'proof',p.data->'_llmUsageRef'"
    + (stateStorage ? ",'state',p.data->'_authStateRef'" : "") + ") "
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
function assertCatalog(c, { boundedRead = null } = {}) {
  const additions = boundedRead === null ? {} : BOUNDED.specs(boundedRead);
  const extra = additions.helmut_auth_usage_checked_proof_local_v1;
  assert.equal(c.serverVersion.split(" ")[0], "17.6");assert.equal(c.serverEncoding, "UTF8");assert.equal(c.clientEncoding, "UTF8");
  assert.equal(c.localGate, "on");assert.deepEqual(Object.keys(c.functions).sort(),
    [...Object.keys(FUNCTION_HASHES), ...(extra ? ["helmut_auth_usage_checked_proof_local_v1"] : [])].sort());
  for(const [name,hash]of Object.entries(FUNCTION_HASHES)){
    const guard=name==='helmut_auth_usage_guard_local_v1',insert=name==='helmut_auth_usage_insert_local_v1';
    assert.deepEqual(c.functions[name],{hash,definer:false,config:['search_path=pg_catalog'],
      arguments:guard?'':insert?'text, text, bigint, text, jsonb':'jsonb',result:guard?'trigger':insert?'text':'jsonb',
      volatility:name==='helmut_auth_usage_read_v1'?'s':'v',owner:'postgres',publicExecute:false,
      anonExecute:false,customerExecute:false,serviceExecute:!guard});
  }
  if (extra) assert.deepEqual(c.functions.helmut_auth_usage_checked_proof_local_v1, extra);
  assert.deepEqual(c.generated, GENERATED);
  assert.equal(Object.keys(c.triggers).length, 4);
  for(const [name,table,type]of [['helmut_usage_record_immutable_local','llm_usage',31],['helmut_usage_auth_bound_local','helmut_store',31],
    ['helmut_usage_no_truncate_local','llm_usage',34],['helmut_usage_auth_no_truncate_local','helmut_store',34]])
    assert.deepEqual(c.triggers[name],{state:'A',table:'public.'+table,function:'public.helmut_auth_usage_guard_local_v1',type,condition:null,arguments:0});
}
const STATE_FUNCTION_SHAPES = Object.freeze({
  helmut_auth_state_payload_hash_local_v1: ["text", "text", "i"],
  helmut_auth_state_leaf_info_local_v1: ["text", "jsonb", "i"],
  helmut_auth_state_children_local_v1: ["text", "text[]", "i"],
  helmut_auth_state_nodes_guard_local_v1: ["", "trigger", "v"],
  helmut_auth_state_put_nodes_local_v1: ["text, text, jsonb", "void", "v"],
  helmut_auth_state_expand_local_v1: ["text, text, text, boolean, boolean", "jsonb", "s"],
  helmut_auth_state_assert_root_local_v1: ["jsonb", "jsonb", "i"],
  helmut_auth_state_assert_data_local_v1: ["jsonb", "void", "i"],
  helmut_auth_state_assert_graph_local_v1: ["text, text, text", "void", "s"],
  helmut_auth_state_auth_guard_local_v1: ["", "trigger", "v"],
  helmut_auth_state_read_v1: ["jsonb", "jsonb", "s"],
  helmut_auth_state_graph_read_v1: ["jsonb", "jsonb", "s"],
  helmut_auth_state_bootstrap_v1: ["jsonb", "jsonb", "v"],
  helmut_auth_state_cas_v1: ["jsonb", "jsonb", "v"],
  helmut_auth_state_restore_v1: ["jsonb", "jsonb", "v"]
});
function stateFunctionSpecs({ boundedRead = null } = {}) {
  // The descriptor pins this whole SQL source. Hash the exact native prosrc
  // preimage, including leading/trailing newlines inside its dollar quotes.
  const sql = fs.readFileSync(path.join(ROOT, "supabase/proposals/auth_state_parts_local.sql"), "utf8");
  const pattern = /create\s+function\s+public\.(helmut_auth_state_\w+)\([^)]*\)\s+returns\s+[\w\[\]]+[\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2\s*;/gi;
  const result = {}; let match;
  while ((match = pattern.exec(sql))) {
    const name = match[1];assert(Object.hasOwn(STATE_FUNCTION_SHAPES, name));assert(!Object.hasOwn(result, name));
    const [args, type, volatility] = STATE_FUNCTION_SHAPES[name];
    result[name] = { hash: sha(match[3]), definer: false, config: ["search_path=pg_catalog"], arguments: args,
      result: type, volatility, owner: "postgres", publicExecute: false, anonExecute: false,
      customerExecute: false, serviceExecute: type !== "trigger" };
  }
  assert.deepEqual(Object.keys(result).sort(), Object.keys(STATE_FUNCTION_SHAPES).sort());
  if (boundedRead !== null) for (const [name, spec] of Object.entries(BOUNDED.specs(boundedRead)))
    if (name.startsWith("helmut_auth_state_")) result[name] = spec;
  return result;
}
function stateCatalogSQL() {
  const relation = "to_regclass('public.helmut_auth_state_nodes_local')";
  const sequence = "to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq')";
  const privileges = (role, object, sequenceMode = false) => "jsonb_build_object(" +
    (sequenceMode ? ["USAGE", "SELECT", "UPDATE"] : ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"])
      .map(p => literal(p) + "," + (sequenceMode ? "has_sequence_privilege" : "has_table_privilege") + "(" + literal(role) + "," + object + "," + literal(p) + ")").join(",") + ")";
  return "SELECT jsonb_build_object('serverVersion',current_setting('server_version'),'serverEncoding',current_setting('server_encoding'),"
    + "'clientEncoding',current_setting('client_encoding'),'localGate',current_setting('helmut.local_usage_experiment',true),"
    + "'functionCount',(SELECT count(*)FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_state_%'),"
    + "'functions',(SELECT jsonb_object_agg(proname,jsonb_build_object('hash',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),"
    + "'definer',prosecdef,'config',proconfig,'arguments',oidvectortypes(proargtypes),'result',format_type(prorettype,NULL),"
    + "'volatility',provolatile,'owner',pg_get_userbyid(proowner),'publicExecute',EXISTS(SELECT FROM aclexplode(coalesce(proacl,acldefault('f',proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),"
    + "'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'customerExecute',has_function_privilege('authenticated',oid,'EXECUTE'),"
    + "'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE')))FROM pg_proc "
    + "WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_state_%'),"
    + "'table',(SELECT jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'forceRls',relforcerowsecurity,"
    + "'publicPrivileges',EXISTS(SELECT FROM aclexplode(coalesce(relacl,acldefault('r',relowner)))a WHERE a.grantee=0),"
    + "'service'," + privileges("service_role", relation) + ",'anon'," + privileges("anon", relation)
    + ",'customer'," + privileges("authenticated", relation) + ")FROM pg_class WHERE oid=" + relation + "),"
    + "'sequence',(SELECT jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'publicPrivileges',"
    + "EXISTS(SELECT FROM aclexplode(coalesce(relacl,acldefault('S',relowner)))a WHERE a.grantee=0),'service',"
    + privileges("service_role", sequence, true) + ",'anon'," + privileges("anon", sequence, true)
    + ",'customer'," + privileges("authenticated", sequence, true) + ")FROM pg_class WHERE oid=" + sequence + "),"
    + "'columns',(SELECT jsonb_object_agg(a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),"
    + "'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'expression',pg_get_expr(d.adbin,d.adrelid)))"
    + "FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=" + relation + " AND a.attnum>0 AND NOT a.attisdropped),"
    + "'primaryKeys',(SELECT jsonb_agg(x.keys)FROM(SELECT array_agg(a.attname ORDER BY k.ord)AS keys FROM pg_constraint c "
    + "CROSS JOIN LATERAL unnest(c.conkey)WITH ORDINALITY k(num,ord)JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num "
    + "WHERE c.conrelid=" + relation + " AND c.contype='p' GROUP BY c.oid)x),"
    + "'policies',(SELECT jsonb_object_agg(policyname,jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check))"
    + "FROM pg_policies WHERE schemaname='public' AND tablename='helmut_auth_state_nodes_local'),"
    + "'triggers',(SELECT jsonb_object_agg(t.tgname,jsonb_build_object('state',t.tgenabled,'table',n.nspname||'.'||c.relname,"
    + "'function',pn.nspname||'.'||p.proname,'type',t.tgtype,'condition',pg_get_expr(t.tgqual,t.tgrelid),'arguments',t.tgnargs))"
    + "FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid "
    + "JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND (t.tgrelid=" + relation + " OR t.tgname LIKE 'helmut_auth_state_%')));";
}
function assertStateCatalog(c, options = {}) {
  assert.equal(c.serverVersion.split(" ")[0], "17.6");assert.equal(c.serverEncoding, "UTF8");assert.equal(c.clientEncoding, "UTF8");assert.equal(c.localGate, "on");
  const functions = stateFunctionSpecs(options);assert.equal(c.functionCount, Object.keys(functions).length);assert.deepEqual(c.functions, functions);
  const none = Object.fromEntries(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].map(k => [k, false]));
  assert.deepEqual(c.table, { kind: "r", owner: "postgres", rls: true, forceRls: false, publicPrivileges: false,
    service: { ...none, SELECT: true, INSERT: true }, anon: none, customer: none });
  assert.deepEqual(c.sequence, { kind: "S", owner: "postgres", publicPrivileges: false,
    service: { USAGE: true, SELECT: false, UPDATE: false }, anon: { USAGE: false, SELECT: false, UPDATE: false }, customer: { USAGE: false, SELECT: false, UPDATE: false } });
  const field = (type, notNull, generated = "", expression = null, identity = "") => ({ type, notNull, identity, generated, expression });
  assert.deepEqual(c.columns, { store_id: field("text", true), generation: field("text", true), payload: field("text", true),
    node_hash: field("text", true, "s", "helmut_auth_state_payload_hash_local_v1(payload)"),
    body: field("jsonb", false, "s", "(payload)::jsonb"),
    leaf_info: field("jsonb", false, "s", "helmut_auth_state_leaf_info_local_v1(payload)"),
    children: field("text[]", false, "s", "helmut_auth_state_children_local_v1(payload)"), node_seq: field("bigint", true, "", null, "a") });
  assert.deepEqual(c.primaryKeys, [["store_id", "generation", "node_hash"]]);
  assert.deepEqual(c.policies, { helmut_auth_state_nodes_service_local: { permissive: "PERMISSIVE", roles: ["service_role"], command: "ALL", using: "true", check: "true" } });
  assert.deepEqual(Object.keys(c.triggers).sort(), ["helmut_auth_state_nodes_immutable_local", "helmut_auth_state_nodes_no_truncate_local", "helmut_auth_state_root_bound_local", "helmut_auth_state_root_no_truncate_local"].sort());
  for (const [name, table, fn, type] of [
    ["helmut_auth_state_nodes_immutable_local", "helmut_auth_state_nodes_local", "helmut_auth_state_nodes_guard_local_v1", 31],
    ["helmut_auth_state_nodes_no_truncate_local", "helmut_auth_state_nodes_local", "helmut_auth_state_nodes_guard_local_v1", 34],
    ["helmut_auth_state_root_bound_local", "helmut_store", "helmut_auth_state_auth_guard_local_v1", 31],
    ["helmut_auth_state_root_no_truncate_local", "helmut_store", "helmut_auth_state_auth_guard_local_v1", 34]])
    assert.deepEqual(c.triggers[name], { state: "A", table: "public." + table, function: "public." + fn, type, condition: null, arguments: 0 });
}

function sourceReadySQL(){
  return "WITH original_history AS(SELECT e.value FROM public.helmut_store a CROSS JOIN LATERAL jsonb_array_elements(a.data->'llmUsage')e WHERE a.id='main-auth') "
    +"SELECT jsonb_build_object('catalog',("+catalogSQL().slice(0,-1)+"),'historyRows',(SELECT count(*)FROM original_history),"
    +"'uniqueHistoryIDs',(SELECT count(DISTINCT value->>'id')FROM original_history),"
    +"'overlappingIDs',(SELECT count(*)FROM public.llm_usage u WHERE EXISTS(SELECT FROM original_history e WHERE e.value->>'id'=u.id)),"
    +"'bindingColumns',(SELECT count(*)FROM pg_attribute "
    +"WHERE attrelid='public.llm_usage'::regclass AND NOT attisdropped AND attname IN('usage_store_id','usage_generation','usage_ordinal','usage_record','usage_prev_hash','usage_record_hash','usage_chain_hash')),"
    +"'stateArtifacts',jsonb_build_object('functions',(SELECT count(*)FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_state_%'),'table',to_regclass('public.helmut_auth_state_nodes_local')IS NOT NULL,'sequence',to_regclass('public.helmut_auth_state_nodes_local_node_seq_seq')IS NOT NULL,'bound',(SELECT data?'_authStateRef'FROM public.helmut_store WHERE id='main-auth')),"
    +"'auth',(SELECT jsonb_build_object('bound',data?'_llmUsageRef','historyType',jsonb_typeof(data->'llmUsage'),'historyCount',jsonb_array_length(data->'llmUsage'))FROM public.helmut_store WHERE id='main-auth'));";
}
function assertSourceReady(s){
  assert.equal(s.catalog.serverVersion.split(' ')[0],'17.6');assert.equal(s.catalog.serverEncoding,'UTF8');assert.equal(s.catalog.clientEncoding,'UTF8');
  assert.deepEqual(s.stateArtifacts,{functions:0,table:false,sequence:false,bound:false});
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
  const slot=require('./local-resource-authority-slot.json');
  assert.equal(slot.schema,'helmut-local-resource-authority-slot/2');
  assert.equal(slot.day,'2026-10-21');assert.equal(slot.version,12);
  assert(/^[a-f0-9]{12}$/.test(slot.caseSuffix));
  assert.equal(plan.targetDatabase,'helmut_resource_fixture_20261021_'+slot.caseSuffix);
  assert.equal(plan.containerName,'helmut-meter-db-w20-'+slot.caseSuffix);
}
function assertExpiredPipelineLocks(locks, observedMS = Date.now()) {
  assert(Number.isSafeInteger(observedMS) && observedMS >= 0, "Fresh local lock observation required");
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  assert(object(locks), "Legacy pipelineLocks must be an actual map before backend change");
  for (const [name, value] of Object.entries(locks)) {
    assert(name.length > 0 && name.length <= 256 && object(value), "Invalid legacy pipeline lock entry");
    assert.deepEqual(Object.keys(value).sort(), ["expiresAt", "lockedAt"], "Unknown legacy pipeline lock fields");
    assert(Number.isSafeInteger(value.lockedAt) && value.lockedAt >= 0
      && Number.isSafeInteger(value.expiresAt) && value.expiresAt >= value.lockedAt,
    "Invalid legacy pipeline lock timestamps");
    assert(value.expiresAt <= observedMS, "Active legacy pipeline lock blocks backend change");
  }
  return Object.keys(locks).length;
}
function installAfterActivation({ plan, candidatePin, targetSQL }) {
  const input = readDescriptor(candidatePin);
  assertLocalTarget(plan);
  const begin = performance.now(), read = q => JSON.parse(targetSQL("BEGIN READ ONLY;" + q + "ROLLBACK;"));
  assertSourceReady(read(sourceReadySQL()));
  const before = read("SELECT jsonb_build_object('database',current_database(),'hash',encode(sha256(convert_to(data::text,'UTF8')),'hex'),"
    + "'withoutRevisionHash',encode(sha256(convert_to((data-'_authStoreRevision')::text,'UTF8')),'hex'),"
    + "'history',jsonb_array_length(data->'llmUsage'),'bound',data?'_llmUsageRef'"
    + (input.pipelineLockLease ? ",'pipelineLocks',data->'pipelineLocks'" : "")
    + ")FROM public.helmut_store WHERE id='main-auth';");
  assert.equal(before.database, plan.targetDatabase);assert.equal(before.bound, false);assert(Number.isSafeInteger(before.history));
  // Inspect the actual unbound logical target BEFORE bootstrap/conversion. Old
  // expired entries are preserved; an active/unknown entry never switches backend.
  if (input.pipelineLockLease) assertExpiredPipelineLocks(before.pipelineLocks);
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
  let stateReceipt = null;
  if (input.stateStorage) {
    // New owned target only, after the already accepted usage conversion.
    // All preparation and reconstruction remain inside the common meter.
    const Parts = require("../../lib/helmut/auth-state-parts");
    const logical = read("SELECT public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}'::jsonb);");
    const tree = Parts.build(logical.data);
    targetSQL(fs.readFileSync(path.join(ROOT, "supabase/proposals/auth_state_parts_local.sql"), "utf8"));
    const args = { id: "main-auth", expectedHash: after.native.physicalAuthSHA256, root: tree.root, nodes: tree.nodes };
    const stateCatalog = read(stateCatalogSQL());assertStateCatalog(stateCatalog);
    const boot = JSON.parse(targetSQL("SELECT public.helmut_auth_state_bootstrap_v1(" + literal(JSON.stringify(args)) + "::jsonb);"));
    const observed = read("SELECT jsonb_build_object('logicalWithoutRevisionHash',encode(sha256(convert_to("
      + "((public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}')->'data')-'_authStoreRevision')::text,'UTF8')),'hex'),"
      + "'native'," + physicalWitnessExpression({ stateStorage: input.stateStorage }) + ");");
    assert.equal(observed.logicalWithoutRevisionHash, before.withoutRevisionHash);
    assert.equal(boot.state.version, Parts.VERSION);assert.equal(boot.state.root, tree.root);
    assert.equal(boot.state.originalHash, after.native.physicalAuthSHA256);
    assert.deepEqual(observed.native.state, boot.state);
    assert.deepEqual(observed.native.proof, after.native.proof);
    assertStateCatalog(read(stateCatalogSQL()));
    stateReceipt = { mode: input.stateStorage, state: boot.state, nodes: tree.nodes.length, catalog: stateCatalog,
      logicalWithoutRevisionHash: observed.logicalWithoutRevisionHash,
      physicalAuthSHA256: observed.native.physicalAuthSHA256, originalLogicalStatePreserved: true };
  }
  let boundedReadReceipt = null;
  if (input.boundedRead) {
    assert(stateReceipt, "Bounded native reader requires completed base state bootstrap");
    targetSQL(fs.readFileSync(path.join(ROOT, BOUNDED.FILES[0]), "utf8"));
    const options = { boundedRead: input.boundedRead }, usageCatalog = read(catalogSQL()), stateCatalog = read(stateCatalogSQL());
    assertCatalog(usageCatalog, options);assertStateCatalog(stateCatalog, options);
    const originalFieldsHash = read("SELECT to_jsonb(encode(sha256(convert_to("
      + "((public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}')->'data')-'_authStoreRevision')::text,'UTF8')),'hex'));");
    assert.equal(originalFieldsHash, before.withoutRevisionHash);
    boundedReadReceipt = { mode: input.boundedRead, sourceAcceptance: input.boundedReadAcceptance,
      usageCatalog, stateCatalog, originalLogicalStatePreserved: true, includedInMeasuredPreparation: true };
  }
  let pipelineLockLeaseReceipt = null;
  if (input.pipelineLockLease) {
    // Only the new globally metered target. The descriptor already verified the
    // genuine native/source acceptance; the SQL itself fences fixture/GUC/owner.
    const witness = physicalWitnessExpression({ stateStorage: input.stateStorage ?? null });
    const original = read("SELECT " + witness + ";");
    targetSQL("ALTER DATABASE \"" + plan.targetDatabase + "\" SET helmut.local_pipeline_lock_mode='" + LEASE.MODE + "';");
    targetSQL(fs.readFileSync(path.join(ROOT, LEASE.SQL), "utf8"));
    const lockCatalog = read(LEASE.catalogSQL());LEASE.assertCatalog(lockCatalog);
    assert.equal(lockCatalog.database, plan.targetDatabase);
    assert.deepEqual(read("SELECT " + witness + ";"), original, "Lease installation changed native Auth/history");
    pipelineLockLeaseReceipt = { mode: LEASE.MODE, acceptancePin: input.pipelineLockLease.acceptancePin,
      catalog: lockCatalog, originalStatePreserved: true, includedInMeasuredPreparation: true };
  }
  return { schema: "helmut-measured-atomic-usage-bootstrap/1", pass: true, candidatePin,
    targetDatabase: plan.targetDatabase, originalPhysicalHash: before.hash, initialPhysicalHash: after.native.physicalAuthSHA256,
    logicalWithoutRevisionHash: before.withoutRevisionHash, proof: result.proof, originalHistoryCount: before.history,
    catalog, ...(stateReceipt ? { stateReceipt } : {}), ...(boundedReadReceipt ? { boundedReadReceipt } : {}),
    ...(pipelineLockLeaseReceipt ? { pipelineLockLeaseReceipt } : {}), wallMS: performance.now() - begin, includedInMeasuredPreparation: true,
    activationByThisHelper: false, costsAndOriginalHistoryUnchanged: true, production: false };
}
module.exports = { MODE, SOURCE_FILES, CONTROL_READ, CONTROL_SOURCE_ACCEPTANCE, pin, pinned, descriptor, readDescriptor, environment,
  projectQuery, physicalWitnessExpression, catalogSQL, assertCatalog, stateFunctionSpecs, stateCatalogSQL, assertStateCatalog, sourceReadySQL, assertSourceReady, bootstrapSQL, assertLocalTarget, assertExpiredPipelineLocks, installAfterActivation };
