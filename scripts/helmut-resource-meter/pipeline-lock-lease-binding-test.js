"use strict";
// Pure validation/identity tests only. In-memory proof-shaped values below are
// negative-test fixtures; no positive admission file/native result is created.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const L = require("./pipeline-lock-lease-integration"), A = require("./atomic-usage-integration");
let groups = 0;
const test = (name, run) => { run();groups++; };
const clone = x => structuredClone(x), zero = "0".repeat(64);
const uncreatedPin = { path: "/never-created-local-lease-unit-fixture/NOT_AN_ACCEPTANCE.SAFE.json", bytes: 1, sha256: zero };
test("import is inert", () => {
  const source = fs.readFileSync(path.join(__dirname, "pipeline-lock-lease-integration.js"), "utf8"), sandbox = { module: { exports: {} }, __dirname,
    require(name) { if (name === "node:fs") return new Proxy({}, { get() { return () => { throw Error("IO_ON_IMPORT"); }; } });return require(name); } };
  vm.runInNewContext(source, sandbox);assert.equal(sandbox.module.exports.MODE, L.MODE);
});
test("fresh backend switch preserves expired historical bloblocks", () => {
  const locks = Object.fromEntries([0, 1, 2, 3].map(i => ["historical-" + i, { lockedAt: 100 + i, expiresAt: 200 + i }]));
  const before = JSON.stringify(locks);assert.equal(A.assertExpiredPipelineLocks(locks, 1000), 4);assert.equal(JSON.stringify(locks), before);
  assert.equal(A.assertExpiredPipelineLocks({}, 1000), 0);assert.equal(A.assertExpiredPipelineLocks({ atBoundary: { lockedAt: 0, expiresAt: 1000 } }, 1000), 1);
});
test("active or malformed historical bloblocks block the fresh switch", () => {
  for (const locks of [null, [], 1, { job: null }, { job: [] }, { job: { lockedAt: 1 } },
    { job: { lockedAt: "1", expiresAt: 2 } }, { job: { lockedAt: -1, expiresAt: 2 } },
    { job: { lockedAt: 2, expiresAt: 1 } }, { job: { lockedAt: 1, expiresAt: 2.5 } },
    { job: { lockedAt: 1, expiresAt: Number.MAX_SAFE_INTEGER + 1 } },
    { job: { lockedAt: 1, expiresAt: 2000 } }, { job: { lockedAt: 1, expiresAt: 2, token: "unknown" } }])
    assert.throws(() => A.assertExpiredPipelineLocks(locks, 1000));
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-lease-binding-pure-"));
try {
  const off = A.descriptor(), file = path.join(dir, "OFF_DESCRIPTOR.SAFE.json");fs.writeFileSync(file, JSON.stringify(off));const p = A.pin(file);
  test("off descriptor carries no lease authority", () => {
    assert.equal(off.pipelineLockLease, undefined);assert.equal(off.localSourceDeltaPin, undefined);
    assert(!off.sourcePins.some(p => p.path.endsWith("/" + L.SQL)));
    assert(off.sourcePins.some(p => p.path.endsWith("/lib/helmut/local-pipeline-lock-lease.js")));
    assert.deepEqual(A.readDescriptor(p), off);
  });
  test("unqualified mode cannot produce a descriptor", () => {
    assert.throws(() => A.descriptor({ pipelineLockLease: { mode: L.MODE, acceptancePin: uncreatedPin } }));
    assert.throws(() => L.acceptance(uncreatedPin));assert.throws(() => L.sourceDelta(uncreatedPin));
  });
  test("global flags and unbound local mode fail before flags are returned", () => {
    for (const value of ["1", "true", "ON", " yes "]) assert.throws(() => A.environment({ HELMUT_ATOMIC_LOCK: value }, p), /Global atomic lock/);
    for (const value of [L.MODE, "off", "unknown"]) assert.throws(() => A.environment({ [L.ENV]: value }, p), /exact descriptor opt-in/);
    assert.equal(A.environment({}, p)[L.ENV], undefined);assert.equal(A.environment({}, p).HELMUT_ATOMIC_LOCK, undefined);
    assert.throws(() => A.environment({ VERCEL: "1" }, p));
  });
  test("both mode keys affect source identity and preflight restores callers", () => {
    const R = require("../../lib/helmut/synthetik-500-content-runner"), S = require("./start-input-checks");
    const keys = [L.ENV, L.GLOBAL_ENV], saved = keys.map(k => process.env[k]);
    try {
      keys.forEach(k => delete process.env[k]);const plain = R.sourceBinding();
      process.env[L.ENV] = L.MODE;assert.notEqual(R.sourceBinding(), plain);delete process.env[L.ENV];
      process.env[L.GLOBAL_ENV] = "off";assert.notEqual(R.sourceBinding(), plain);
      process.env[L.ENV] = "caller-mode-sentinel";process.env[L.GLOBAL_ENV] = "caller-global-sentinel";
      const first = S.actualSourceBinding({ atomicUsageInput: p });
      assert.equal(process.env[L.ENV], "caller-mode-sentinel");assert.equal(process.env[L.GLOBAL_ENV], "caller-global-sentinel");
      keys.forEach(k => delete process.env[k]);assert.equal(S.actualSourceBinding({ atomicUsageInput: p }), first);
    } finally { keys.forEach((k, i) => saved[i] === undefined ? delete process.env[k] : process.env[k] = saved[i]); }
  });
} finally { fs.rmSync(dir, { recursive: true }); }
const none = Object.fromEntries(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].map(k => [k, false]));
const functions = L.functionSpecs();
const catalog = { schema: "helmut-local-pipeline-lock-lease-catalog/1", serverVersion: "17.6", serverEncoding: "UTF8", clientEncoding: "UTF8",
  database: "helmut_resource_fixture_20261021_0123456789ab", unixSocket: true, localUsageExperiment: "on", pipelineLockMode: L.MODE, functionCount: 2, functions,
  table: { owner: "postgres", kind: "r", persistence: "p", rls: true, forceRls: false, publicPrivileges: false,
    service_role: { ...none, SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, anon: none, authenticated: none },
  columns: { job_name: { type: "text", notNull: true }, locked_at: { type: "timestamp with time zone", notNull: true },
    expires_at: { type: "timestamp with time zone", notNull: true }, token: { type: "text", notNull: false } },
  primaryKeys: [["job_name"]], policies: [], serviceRole: { bypassRls: true, superuser: false, schemaUsage: true }, tableRows: 0 };
test("SQL identity preserves the genuine original bodies", () => {
  assert.equal(functions.helmut_acquire_pipeline_lock.prosrcSHA256, "498d2956e0ee1c0550a1a35ddc0c88c994e5041cf661a72ba186ee559ebccf22");
  assert.equal(functions.helmut_release_pipeline_lock.prosrcSHA256, "79effa3ded7202567993c64ed45b1871796d10f0f082e8b0fefd3494ff0c135f");L.assertCatalog(catalog);
});
for (const [name, mutate] of [
  ["public execution", c => c.functions.helmut_acquire_pipeline_lock.execute.public = true],
  ["wrong function body", c => c.functions.helmut_release_pipeline_lock.prosrcSHA256 = zero],
  ["definer privilege escalation", c => c.functions.helmut_acquire_pipeline_lock.securityDefiner = true],
  ["unexpected overload", c => c.functionCount++],
  ["excess table rights", c => c.table.service_role.TRUNCATE = true],
  ["missing RLS bypass", c => c.serviceRole.bypassRls = false],
  ["superuser escalation", c => c.serviceRole.superuser = true],
  ["nonlocal database", c => c.database = "production"],
  ["network transport", c => c.unixSocket = false],
  ["unadmitted GUC", c => c.pipelineLockMode = "off"],
  ["nonempty entry/final table", c => c.tableRows = 1],
  ["column drift", c => c.columns.extra = { type: "text", notNull: false }]
]) test(name, () => { const c = clone(catalog);mutate(c);assert.throws(() => L.assertCatalog(c)); });
const receipt = { mode: L.MODE, scope: "LOCAL_COMPONENT_ONLY", production: false, full500Accepted: false, executionAuthority: false,
  automaticRetry: false, ramBenefitClaimed: false, oldAuthorityReused: false, nonce: "a".repeat(32), sourceCase: "PURE_VALIDATOR_FIXTURE_ONLY",
  sourcePins: [], catalogPin: uncreatedPin, independentActualReviewPin: uncreatedPin };
const witness = { originalRootSHA256: zero, currentRootSHA256: zero, generation: "unit-fixture-generation",
  historyProof: { generation: "unit-fixture-history", count: 6000, head: zero, originalHash: zero }, activeBlobLocks: 0, tableRows: 0 };
const native = { ...receipt, schema: "helmut-local-pipeline-lock-lease-native-qualification/1", nativeSafety: { pass: true,
  criticalCases: { acquireRelease: true, contentionDenied: true, expiredTakeover: true, staleTokenRejected: true, successorPreserved: true, authHistoryUnchanged: true } },
  before: witness, after: witness, lifecycle: { allOwnedProcessesExited: true, fullLastProcessExitCovered: true, groupsEmpty: true,
    postgresExitCode: 0, nodeExitCode: 0, oomCount: 0, oomKillCount: 0, memoryMaxCount: 0 }, comparison: { status: "NOT_CLAIMED", ramBenefitClaimed: false },
  actualControllerPin: uncreatedPin, actualWorkerPin: uncreatedPin };
test("native validator fixture is never a live acceptance", () => { L.assertNativeProof(native, receipt);assert.throws(() => L.acceptance(uncreatedPin)); });
for (const [name, mutate] of [
  ["native critical case missing", n => delete n.nativeSafety.criticalCases.staleTokenRejected],
  ["history mutated", n => n.after = { ...n.after, currentRootSHA256: "1".repeat(64) }],
  ["unfinished native exit", n => n.lifecycle.groupsEmpty = false],
  ["OOM evidence", n => n.lifecycle.oomKillCount = 1],
  ["500 authority claimed", n => n.full500Accepted = true],
  ["actual original result pin missing", n => delete n.actualControllerPin],
  ["review is not bound", n => n.independentActualReviewPin = { ...uncreatedPin, sha256: "1".repeat(64) }]
]) test(name, () => { const n = clone(native);mutate(n);assert.throws(() => L.assertNativeProof(n, receipt)); });
process.stdout.write(JSON.stringify({ pass: true, groups, scope: "PURE_VALIDATORS_NO_NATIVE_ADMISSION_OR_AUTHORITY_CREATED" }) + "\n");
