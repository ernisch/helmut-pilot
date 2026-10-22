"use strict";
// Inert, explicit LOCAL component admission. No database, flag change or authority
// on import. A descriptor cannot enable this mode without the real proof chain.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), MODE = "invocation-lease-v1";
const ENV = "HELMUT_LOCAL_PIPELINE_LOCK_MODE", GLOBAL_ENV = "HELMUT_ATOMIC_LOCK";
const SQL = "supabase/proposals/pipeline_lock_lease_local.sql";
const SOURCE_FILES = Object.freeze(["lib/helmut/local-pipeline-lock-lease.js", "lib/helmut/storage.js",
  "lib/helmut/lage.js", SQL, "scripts/local-pipeline-lock-lease-test.js"]);
const DELTA_FILES = Object.freeze(SOURCE_FILES.filter(x => x !== SQL));
const FILES = Object.freeze(["scripts/helmut-resource-meter/pipeline-lock-lease-integration.js", ...SOURCE_FILES]);
const HISTORICAL_STORAGE = "51811f20d9886af212a5abbcfbc515aac56c2a5bac29450a127ba7c373d73e8d";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const isOn = value => ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
function pinShape(p) {
  assert(p && Object.keys(p).sort().join("|") === "bytes|path|sha256", "Exact lease proof pin required");
  assert(typeof p.path === "string" && path.isAbsolute(p.path) && path.normalize(p.path) === p.path);
  assert(Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 4 * 1024 * 1024 && digest(p.sha256));
}
function bytes(p) {
  pinShape(p);const before = fs.lstatSync(p.path);
  assert(before.isFile() && !before.isSymbolicLink() && fs.realpathSync(p.path) === p.path);
  const fd = fs.openSync(p.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);assert.equal(st.size, p.bytes);assert.equal(st.ino, before.ino);assert.equal(st.dev, before.dev);
    const b = fs.readFileSync(fd), after = fs.fstatSync(fd), current = fs.lstatSync(p.path);
    for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) {
      assert.equal(after[key], st[key]);assert.equal(current[key], st[key]);
    }
    assert(current.isFile() && !current.isSymbolicLink() && fs.realpathSync(p.path) === p.path);
    assert.equal(b.length, p.bytes);assert.equal(sha(b), p.sha256, "Lease proof/source drift");return b;
  } finally { fs.closeSync(fd); }
}
function json(p) { assert(p.path.endsWith(".SAFE.json"), "Only SAFE admission proofs may enter the runtime");return JSON.parse(bytes(p)); }
function sourcePin(file) {
  assert(SOURCE_FILES.includes(file));const filename = path.join(ROOT, file), b = fs.readFileSync(filename);
  const p = { path: filename, bytes: b.length, sha256: sha(b) };bytes(p);return p;
}
function assertSources(sources, files = SOURCE_FILES) {
  assert(Array.isArray(sources));assert.deepEqual(sources.map(p => p.file).sort(), [...files].sort());
  for (const p of sources) {
    assert.deepEqual(Object.keys(p).sort(), ["bytes", "file", "sha256"]);
    const actual = sourcePin(p.file);assert.equal(actual.bytes, p.bytes);assert.equal(actual.sha256, p.sha256, "Unaccepted local source delta");
  }
}
function noAuthority(value) {
  for (const key of ["production", "full500Accepted", "executionAuthority", "automaticRetry", "ramBenefitClaimed", "oldAuthorityReused"])
    assert.equal(value[key], false, "No inherited authority or resource claim: " + key);
  assert.equal(value.scope, "LOCAL_COMPONENT_ONLY");assert.equal(value.mode, MODE);
}
function identity(value) {
  assert(typeof value.nonce === "string" && /^[a-f0-9]{32}$/.test(value.nonce));
  assert(typeof value.sourceCase === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/.test(value.sourceCase));
  assert(!["f3375a7d5548", "attempt-f3375a7d5548", "synthetik500-resources21-f3375a7d5548"].includes(value.sourceCase));
}
function assertWitness(w) {
  for (const key of ["originalRootSHA256", "currentRootSHA256"]) assert(digest(w[key]));
  assert(typeof w.generation === "string" && w.generation.length > 0);
  assert(w.historyProof && typeof w.historyProof.generation === "string" && w.historyProof.generation.length > 0);
  assert.equal(w.historyProof.count, 6000);assert(digest(w.historyProof.head) && digest(w.historyProof.originalHash));
  assert.equal(w.activeBlobLocks, 0);assert.equal(w.tableRows, 0);
}
function assertNativeProof(n, receipt) {
  assert.equal(n.schema, "helmut-local-pipeline-lock-lease-native-qualification/1");noAuthority(n);identity(n);
  for (const key of ["nonce", "sourceCase", "sourcePins", "catalogPin", "independentActualReviewPin"])
    assert.deepEqual(n[key], receipt[key], "Native/source/actual-review binding differs: " + key);
  for (const key of ["catalogPin", "independentActualReviewPin"]) pinShape(n[key]);
  assert.equal(n.nativeSafety.pass, true);
  const cases = ["acquireRelease", "contentionDenied", "expiredTakeover", "staleTokenRejected", "successorPreserved", "authHistoryUnchanged"];
  assert.deepEqual(Object.keys(n.nativeSafety.criticalCases).sort(), cases.sort());
  for (const key of cases) assert.equal(n.nativeSafety.criticalCases[key], true, "Native lease case missing: " + key);
  assertWitness(n.before);assertWitness(n.after);assert.deepEqual(n.after, n.before, "Lease changed Auth/history or left locks");
  for (const key of ["allOwnedProcessesExited", "fullLastProcessExitCovered", "groupsEmpty"]) assert.equal(n.lifecycle[key], true);
  for (const key of ["postgresExitCode", "nodeExitCode", "oomCount", "oomKillCount", "memoryMaxCount"]) assert.equal(n.lifecycle[key], 0);
  assert(["NOT_CLAIMED", "COMPLETED"].includes(n.comparison.status));assert.equal(n.comparison.ramBenefitClaimed, false);
  for (const key of ["actualControllerPin", "actualWorkerPin"]) pinShape(n[key]);
  if (n.comparison.status === "COMPLETED") pinShape(n.comparison.pin);
}
function assertReview(review, kind, receipt, native = null) {
  assert.equal(review.schema, "helmut-local-pipeline-lock-lease-independent-review/1");
  assert.equal(review.kind, kind);assert.equal(review.pass, true);assert.equal(review.independent, true);
  assert.equal(review.production, false);assert.equal(review.full500Accepted, false);assert.equal(review.executionAuthority, false);
  assert.deepEqual(review.sourcePins, receipt.sourcePins);
  if (kind === "ACTUAL") {
    for (const key of ["nonce", "sourceCase", "catalogPin", "actualControllerPin", "actualWorkerPin"])
      assert.deepEqual(review[key], native[key], "Independent actual review does not bind original results");
  }
  pinShape(review.originalReviewPin);
}
function sourceDelta(p) {
  const d = json(p);assert.equal(d.schema, "helmut-local-runtime-source-delta/1");
  assert.equal(d.production, false);assert.equal(d.full500Accepted, false);assert.equal(d.executionAuthority, false);
  assert.equal(d.historicalAcceptanceTransferred, false);assert.equal(d.requiresFreshIntegrationAcceptance, true);
  assert.equal(d.historicalStorageSHA256, HISTORICAL_STORAGE);assertSources(d.sourcePins, DELTA_FILES);
  const review = json(d.independentSourceReviewPin);assertReview(review, "SOURCE", d);
  bytes(review.originalReviewPin);
  return { acceptance: d, sourcePins: [p, d.independentSourceReviewPin, review.originalReviewPin,
    ...DELTA_FILES.map(sourcePin)] };
}
function functionSpecs() {
  const text = bytes(sourcePin(SQL)).toString("utf8"), result = {};
  for (const [name, signature, resultType] of [
    ["helmut_acquire_pipeline_lock", "public.helmut_acquire_pipeline_lock(text,bigint)", "TABLE(acquired boolean, token text)"],
    ["helmut_release_pipeline_lock", "public.helmut_release_pipeline_lock(text,text)", "boolean"]]) {
    const start = text.indexOf("create or replace function public." + name + "(");assert(start >= 0);
    const tail = text.slice(start), opening = /\bas\s+(\$[a-zA-Z0-9_]*\$)/i.exec(tail);assert(opening);
    const bodyStart = opening.index + opening[0].length, end = tail.indexOf(opening[1], bodyStart);assert(end >= bodyStart);
    result[name] = { signature, resultType, owner: "postgres", language: "plpgsql", securityDefiner: false,
      volatility: "v", config: ["search_path=pg_catalog, public"], prosrcSHA256: sha(tail.slice(bodyStart, end)),
      execute: { public: false, anon: false, authenticated: false, service_role: true } };
  }
  return result;
}
const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const tablePrivileges = role => "jsonb_build_object(" + PRIVILEGES.map(p => "'" + p + "',has_table_privilege('" + role + "','public.pipeline_locks','" + p + "')").join(",") + ")";
function catalogSQL() {
  const names = "'helmut_acquire_pipeline_lock','helmut_release_pipeline_lock'";
  return "SELECT jsonb_build_object('schema','helmut-local-pipeline-lock-lease-catalog/1','serverVersion',current_setting('server_version'),"
    + "'serverEncoding',current_setting('server_encoding'),'clientEncoding',current_setting('client_encoding'),'database',current_database(),"
    + "'unixSocket',inet_server_addr()IS NULL,'localUsageExperiment',current_setting('helmut.local_usage_experiment',true),"
    + "'pipelineLockMode',current_setting('helmut.local_pipeline_lock_mode',true),'functionCount',(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN(" + names + ")),"
    + "'functions',(SELECT jsonb_object_agg(p.proname,jsonb_build_object('signature','public.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')',"
    + "'resultType',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,"
    + "'prosrcSHA256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'execute',jsonb_build_object('public',EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),"
    + "'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))))"
    + "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public'AND p.proname IN(" + names + ")),"
    + "'table',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'persistence',c.relpersistence,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,"
    + "'publicPrivileges',EXISTS(SELECT FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee=0),'service_role'," + tablePrivileges("service_role") + ",'anon'," + tablePrivileges("anon") + ",'authenticated'," + tablePrivileges("authenticated") + ")FROM pg_class c WHERE c.oid=to_regclass('public.pipeline_locks')),"
    + "'columns',(SELECT jsonb_object_agg(a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull))FROM pg_attribute a WHERE a.attrelid=to_regclass('public.pipeline_locks')AND a.attnum>0 AND NOT a.attisdropped),"
    + "'primaryKeys',(SELECT jsonb_agg(x.keys)FROM(SELECT array_agg(a.attname ORDER BY k.ord)AS keys FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey)WITH ORDINALITY k(num,ord)"
    + "JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num WHERE c.conrelid=to_regclass('public.pipeline_locks')AND c.contype='p'GROUP BY c.oid)x),"
    + "'policies',(SELECT coalesce(jsonb_agg(policyname),'[]'::jsonb)FROM pg_policies WHERE schemaname='public'AND tablename='pipeline_locks'),"
    + "'serviceRole',(SELECT jsonb_build_object('bypassRls',rolbypassrls,'superuser',rolsuper,'schemaUsage',has_schema_privilege('service_role','public','USAGE'))FROM pg_roles WHERE rolname='service_role'),"
    + "'tableRows',(SELECT count(*)FROM public.pipeline_locks));";
}
function assertCatalog(c, functions = functionSpecs(), { requireEmpty = true } = {}) {
  assert.equal(c.schema, "helmut-local-pipeline-lock-lease-catalog/1");assert.equal(c.serverVersion.split(" ")[0], "17.6");
  assert.equal(c.serverEncoding, "UTF8");assert.equal(c.clientEncoding, "UTF8");assert.match(c.database, /^helmut_resource_fixture_[0-9]{8}_[a-f0-9]{12}$/);
  assert.equal(c.unixSocket, true);assert.equal(c.localUsageExperiment, "on");assert.equal(c.pipelineLockMode, MODE);
  assert.equal(c.functionCount, 2);assert.deepEqual(c.functions, functions);
  const none = Object.fromEntries(PRIVILEGES.map(p => [p, false]));
  assert.deepEqual(c.table, { owner: "postgres", kind: "r", persistence: "p", rls: true, forceRls: false,
    publicPrivileges: false, service_role: { ...none, SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, anon: none, authenticated: none });
  assert.deepEqual(c.columns, { job_name: { type: "text", notNull: true }, locked_at: { type: "timestamp with time zone", notNull: true },
    expires_at: { type: "timestamp with time zone", notNull: true }, token: { type: "text", notNull: false } });
  assert.deepEqual(c.primaryKeys, [["job_name"]]);assert.deepEqual(c.policies, []);
  assert.deepEqual(c.serviceRole, { bypassRls: true, superuser: false, schemaUsage: true });
  assert(Number.isSafeInteger(c.tableRows) && c.tableRows >= 0);if (requireEmpty) assert.equal(c.tableRows, 0);
}
function acceptance(p) {
  const a = json(p);assert.equal(a.schema, "helmut-local-pipeline-lock-lease-acceptance/1");noAuthority(a);identity(a);assertSources(a.sourcePins);
  const n = json(a.nativeProofPin);assertNativeProof(n, a);
  const catalog = json(a.catalogPin);assertCatalog(catalog);
  const sourceReview = json(a.independentSourceReviewPin), actualReview = json(a.independentActualReviewPin);
  assertReview(sourceReview, "SOURCE", a);assertReview(actualReview, "ACTUAL", a, n);
  for (const q of [sourceReview.originalReviewPin, actualReview.originalReviewPin]) bytes(q);
  for (const q of [n.actualControllerPin, n.actualWorkerPin]) assert.equal(json(q).pass, true, "Actual native result did not pass");
  if (n.comparison.status === "COMPLETED") bytes(n.comparison.pin);
  return { acceptance: a, sourcePins: [p, a.nativeProofPin, a.catalogPin, a.independentSourceReviewPin,
    a.independentActualReviewPin, sourceReview.originalReviewPin, actualReview.originalReviewPin,
    n.actualControllerPin, n.actualWorkerPin, ...(n.comparison.status === "COMPLETED" ? [n.comparison.pin] : []), ...SOURCE_FILES.map(sourcePin)] };
}
module.exports = Object.freeze({ MODE, ENV, GLOBAL_ENV, SQL, SOURCE_FILES, DELTA_FILES, FILES, HISTORICAL_STORAGE,
  isOn, pinShape, sourceDelta, acceptance, functionSpecs, catalogSQL, assertCatalog, assertNativeProof, assertReview });
