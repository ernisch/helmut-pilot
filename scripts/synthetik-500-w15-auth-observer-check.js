"use strict";

// Exactly one real four-writer measurement check. No unit, activation, provider
// request, mocked storage, injected request, budget change or business change.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const http = require("node:http"), assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const DIR = "/tmp/w15-auth-observer-20261028", DB = "helmut_w15_auth_observer_20261028", PORT = 3213;
const SOURCE = "scripts/synthetik-500-w15-full500-runtime.js";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
function save(name, value) { fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
function active() {
  const r = spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-f", "-"], {
    input: "begin read only;set local statement_timeout='10s';select count(*)from public.mandate_profiles where aktiv;rollback;",
    encoding: "utf8", timeout: 15000, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  assert.equal(r.status, 0, "w15-auth-check-readonly-status"); return Number(r.stdout.trim());
}
async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  const s = fs.lstatSync(DIR); assert(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 511) === 448);
  fs.writeFileSync(path.join(DIR, "probe.pid"), String(process.pid), { flag: "wx", mode: 0o600 });
  const secret = crypto.randomBytes(48).toString("hex"), now = Math.floor(Date.now() / 1000);
  const b64 = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", iat: now, exp: now + 3600 });
  const token = body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
  fs.writeFileSync(path.join(DIR, "postgrest.PRIVATE.conf"),
    'db-uri = "postgresql://authenticator@localhost/' + DB + '?host=/var/run/postgresql"\n'
    + 'db-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = ' + PORT + '\ndb-pool = 2\njwt-secret = "' + secret + '"\n',
    { flag: "wx", mode: 0o600 });
  let gateway, observation, result = { status: "UNKNOWN", startedAtUTC: new Date().toISOString(),
    profileActivations: 0, unitExecutions: 0, providerCalls: 0, paidModelCalls: 0,
    originalDatabaseWrites: 0, sourceQualifierRepeated: false, database: DB, retryAllowed: false };
  const log = fs.openSync(path.join(DIR, "postgrest.PRIVATE.log"), "wx", 0o600);
  const pg = spawn("/tmp/w15-full500-20261028b/postgrest", [path.join(DIR, "postgrest.PRIVATE.conf")], {
    stdio: ["ignore", log, log], env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  let stopped = false;
  const closed = new Promise(resolve => { pg.once("exit", () => { stopped = true; resolve(); });
    pg.once("error", () => { stopped = true; resolve(); }); });
  if (pg.pid) fs.writeFileSync(path.join(DIR, "postgrest.pid"), String(pg.pid), { flag: "wx", mode: 0o600 });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      ready = await new Promise(resolve => {
        const request = http.get({ hostname: "127.0.0.1", port: PORT, path: "/", timeout: 1000 }, response => {
          response.resume(); response.on("end", () => resolve([200, 401].includes(response.statusCode))); });
        request.on("timeout", () => request.destroy()); request.on("error", () => resolve(false));
      });
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready && !stopped, "w15-auth-check-postgrest-ready");
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: PORT });
    Object.assign(process.env, { SUPABASE_URL: gateway.url, SUPABASE_SERVICE_ROLE_KEY: token,
      HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth" });
    assert(!process.env.HELMUT_ATOMIC_LOCK, "w15-auth-check-original-blob-lock-mode");
    const S = require("../lib/helmut/storage");
    const before = await S.readAuthStore({ strict: true }); result.activeProfilesBefore = active();
    assert.equal(result.activeProfilesBefore, 0); assert.equal(before.llmUsage.length, 5000);
    const originalUsageHash = sha(JSON.stringify(before.llmUsage));
    const key = "w15-auth-observer-" + crypto.randomUUID();
    observation = require("./synthetik-500-w15-full500-runtime").observeAuth(S);
    const measured = () => assert(observation.assessment().pass, "w15-auth-check-first-incomplete-or-slow-write-stop");
    assert.equal(await S.acquirePipelineLock(key, 90000), true, "w15-auth-check-genuine-lock-acquire");
    measured();
    assert((await S.readAuthStore({ strict: true })).pipelineLocks[key], "w15-auth-check-lock-persisted");
    await S.mutateAuthStore(auth => { auth.w15AuthObserverCheck = { key, atUTC: new Date().toISOString() }; });
    measured();
    assert.equal((await S.readAuthStore({ strict: true })).w15AuthObserverCheck.key, key);
    const usage = await S.recordLlmUsage({ callType: "skipped-auth-observer-check", keinAufruf: true,
      success: false, model: "none", runId: key });
    measured();
    assert.equal(usage?._ablage?.blob, true, "w15-auth-check-genuine-usage-ack");
    assert.equal(usage.estimatedCost, 0); assert.equal(usage.keinAufruf, true); assert.equal(usage.success, false);
    await S.releasePipelineLock(key);
    measured();
    const after = await S.readAuthStore({ strict: true }); result.activeProfilesAfter = active();
    assert.equal(result.activeProfilesAfter, 0); assert(!Object.hasOwn(after.pipelineLocks, key), "w15-auth-check-lock-released");
    assert.equal(after.llmUsage.length, 5001); assert.equal(after.llmUsage[0].id, usage.id);
    assert.equal(sha(JSON.stringify(after.llmUsage.slice(1))), originalUsageHash, "w15-auth-check-historical-usage-preserved");
    const coverage = observation.assessment();
    assert.equal(observation.mutations.length, 3); assert.equal(observation.usageSinks.length, 1);
    assert.equal(observation.casWrites.length, 4); assert(coverage.pass, "w15-auth-check-every-native-write-complete-under30");
    assert.deepEqual(observation.mutations.filter(m => m.kind === "pipeline-lock").map(m => m.api),
      ["acquirePipelineLock", "releasePipelineLock"]);
    const runtime = fs.readFileSync(path.join(__dirname, "synthetik-500-w15-full500-runtime.js"));
    Object.assign(result, { status: "PASS_GENUINE_ALL_AUTH_WRITES_TIMED", coverage,
      unassignedCASWrites: observation.casWrites.filter(w => w.envelopeId === null).length,
      genuineAPIs: ["acquirePipelineLock", "mutateAuthStore", "recordLlmUsage", "releasePipelineLock"],
      requestOverride: false, originalUsageRows: 5000, retainedOriginalUsageRows: 5000, newZeroCostSkipRecords: 1,
      runtimeSourcePin: { path: SOURCE, bytes: runtime.length, sha256: sha(runtime) } });
  } catch (error) {
    result.status = "FAIL_OR_UNKNOWN";
    result.error = { name: error.name, reason: /^[A-Za-z][A-Za-z0-9:_-]{0,179}$/.test(error.message)
      ? error.message : "w15-auth-check-details-retained-private" }; process.exitCode = 1;
  } finally {
    if (observation) Object.assign(result, { mutations: observation.mutations, usageSinks: observation.usageSinks,
      casWrites: observation.casWrites, coverage: observation.assessment() });
    if (gateway) { result.gateway = gateway.bericht(); await gateway.stoppe(); }
    if (!stopped) pg.kill("SIGTERM");
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (!stopped) { pg.kill("SIGKILL"); await closed; }
    fs.closeSync(log); result.completedAtUTC = new Date().toISOString();
    save("AUTH_MEASUREMENT_CHECK.SAFE.json", result);
    console.log(JSON.stringify({ status: result.status, writes: result.casWrites?.length, coverage: result.coverage?.pass,
      activeProfiles: result.activeProfilesAfter, unitExecutions: 0, providerCalls: 0 }));
  }
}
if (require.main === module) main().catch(() => { console.error("w15-auth-check-unhandled-prerequisite"); process.exitCode = 1; });
