"use strict";
// Memory attribution only: no Unit, activation, sender, authority or cost action.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { performance, PerformanceObserver } = require("node:perf_hooks");
const DIR = "/tmp/w15-ram-cas-diagnostic-20261028", OLD = "/tmp/w15-full500-20261028c";
const DB = "helmut_w15_ram_cas_20261028", PORT = 3217;
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const canonical = x => require("../lib/helmut/synthetik-500-profile").kanonisch(x);
function sql(s, readOnly = true) {
  const r = spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-f", "-"], {
    input: (readOnly ? "begin read only;" : "begin;") + "set local statement_timeout='10s';" + s + "commit;",
    encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }
  });
  assert.equal(r.status, 0, "w15-ram-diagnostic-sql"); return r.stdout.trim();
}
function stats() {
  return JSON.parse(sql("select jsonb_build_object('active',(select count(*)from public.mandate_profiles where aktiv),"
    + "'tempBytes',temp_bytes,'tempFiles',temp_files,'workMem',current_setting('work_mem'),'walBytes',(select wal_bytes::text from pg_stat_wal))"
    + "from pg_stat_database where datname=current_database();"));
}
function withoutMarker(value) { const { w15RamDiagnostic, _authStoreRevision, ...rest } = value; return rest; }
async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  fs.writeFileSync(path.join(DIR, "probe.pid"), String(process.pid), { flag: "wx", mode: 0o600 });
  const report = { schema: "helmut-w15-ram-cas-diagnostic/1", status: "UNKNOWN", phases: [],
    units: 0, activeProfiles: 0, providerCalls: 0, originalDatabaseWrites: 0,
    complete500MemoryProof: false, peakCauseProven: false, noForcedGCOrCacheClear: true,
    observations: [], gc: [], startedAtUTC: new Date().toISOString() };
  const observer = new PerformanceObserver(xs => { for (const x of xs.getEntries()) report.gc.push({
    atMs: x.startTime, durationMs: x.duration, kind: x.detail.kind, flags: x.detail.flags }); });
  observer.observe({ entryTypes: ["gc"] });
  const sample = () => report.observations.push({ atMs: performance.now(), ...process.memoryUsage() });
  sample(); const timer = setInterval(sample, 100);
  let pg, gateway, stopped = true, closed, log;
  const secret = crypto.randomBytes(48).toString("hex"), b64 = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const tokenBody = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  const token = tokenBody + "." + crypto.createHmac("sha256", secret).update(tokenBody).digest("base64url");
  const conf = path.join(DIR, "postgrest.PRIVATE.conf");
  fs.writeFileSync(conf, 'db-uri = "postgresql://authenticator@localhost/' + DB + '?host=/var/run/postgresql"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = ' + PORT + '\ndb-pool = 1\njwt-secret = "' + secret + '"\n', { flag: "wx", mode: 0o600 });
  async function stop() {
    if (!stopped) pg.kill("SIGTERM");
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (!stopped) { pg.kill("SIGKILL"); await closed; }
    if (log !== undefined) { fs.closeSync(log); log = undefined; }
    await new Promise(resolve => setTimeout(resolve, 1100)); // native statistics flush after backend exit
  }
  async function start(name) {
    log = fs.openSync(path.join(DIR, name + ".PRIVATE.log"), "wx", 0o600);
    pg = spawn(OLD + "/postgrest", [conf], { stdio: ["ignore", log, log], env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
    if (pg.pid) fs.writeFileSync(path.join(DIR, "postgrest.pid"), String(pg.pid), { mode: 0o600 });
    stopped = false; closed = new Promise(resolve => { pg.once("exit", () => { stopped = true; resolve(); }); pg.once("error", () => { stopped = true; resolve(); }); });
    let ready = false;
    for (let n = 0; n < 50; n++) {
      ready = await new Promise(resolve => { const req = http.get({ host: "127.0.0.1", port: PORT, path: "/", timeout: 500 }, r => { r.resume(); r.once("end", () => resolve([200, 401].includes(r.statusCode))); }); req.on("timeout", () => req.destroy()); req.on("error", () => resolve(false)); });
      if (ready) break; await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready && !stopped, "w15-ram-diagnostic-postgrest-ready");
  }
  try {
    assert.equal(stats().active, 0);
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: PORT });
    Object.assign(process.env, { SUPABASE_URL: gateway.url, SUPABASE_SERVICE_ROLE_KEY: token, HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth" });
    const S = require("../lib/helmut/storage");
    const Cas = require("../lib/helmut/auth-store-cas"), actualCAS = Cas.writeConditional;
    let currentCAS = null;
    Cas.writeConditional = async function(...args) {
      assert(currentCAS && currentCAS.attempts === 0, "w15-ram-diagnostic-second-write-forbidden");
      currentCAS.attempts++;
      const result = await actualCAS.apply(this, args);
      currentCAS.acknowledged = true; currentCAS.revision = result._authStoreRevision;
      return result;
    };
    await start("read-control"); const beforeControl = stats();
    const original = await S.readAuthStore({ strict: true });
    const contentHash = sha(JSON.stringify(withoutMarker(original)));
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, "RETAINED_AUTH_INPUT.PRIVATE.json"), "utf8"));
    const rawCanonicalHash = sha(canonical(withoutMarker(raw)));
    assert.equal(sha(canonical(withoutMarker(original))), rawCanonicalHash, "w15-ram-diagnostic-raw-baseline");
    report.rawInputCanonicalHashExcludingMarkerAndRevision = rawCanonicalHash;
    report.inputBytes = Buffer.byteLength(JSON.stringify(original));
    report.initialUsageRows = original.llmUsage.length;
    assert.equal(original.llmUsage.length, 5139, "w15-ram-diagnostic-exact-retained-input");
    await stop(); const afterControl = stats();
    report.readControl = { before: beforeControl, after: afterControl, tempFilesDelta: afterControl.tempFiles - beforeControl.tempFiles, tempBytesDelta: afterControl.tempBytes - beforeControl.tempBytes };
    assert.equal(report.readControl.tempFilesDelta, 0, "w15-ram-diagnostic-read-control-spill");
    for (const [name, setting] of [["default", "4MB"], ["single-parameter", "16MB"]]) {
      if (name === "single-parameter") {
        assert(report.phases[0].tempFilesDelta > 0 && report.phases[0].tempBytesDelta > report.inputBytes * .8, "w15-ram-diagnostic-spill-not-attributed");
        sql("alter database " + DB + " set work_mem='16MB';", false);
      }
      assert.equal(stats().workMem, setting, "w15-ram-diagnostic-config");
      await start(name); const before = stats(), t = performance.now();
      currentCAS = { attempts: 0, acknowledged: false, revision: null };
      await S.mutateAuthStore(store => { store.w15RamDiagnostic = { phase: name }; });
      const wallMs = performance.now() - t;
      const actual = await S.readAuthStore({ strict: true });
      assert.equal(actual.w15RamDiagnostic.phase, name);
      assert.equal(currentCAS.attempts, 1); assert.equal(currentCAS.acknowledged, true);
      assert.equal(actual._authStoreRevision, currentCAS.revision);
      assert.equal(sha(JSON.stringify(withoutMarker(actual))), contentHash, "w15-ram-diagnostic-existing-data-changed");
      assert.equal(sha(canonical(withoutMarker(actual))), rawCanonicalHash, "w15-ram-diagnostic-raw-input-changed");
      await stop(); const after = stats(); sample();
      const phase = { name, workMem: setting, wallMs, before, after, tempFilesDelta: after.tempFiles - before.tempFiles, tempBytesDelta: after.tempBytes - before.tempBytes,
        clusterWalBytesDelta: String(BigInt(after.walBytes) - BigInt(before.walBytes)), contentPreserved: true, rawInputPreserved: true,
        conditionalWriteAcknowledged: true, nativeCASAttempts: currentCAS.attempts, actualRevisionReadBack: true };
      report.phases.push(phase); assert.equal(after.active, 0); assert(wallMs < 30000);
      if (name === "single-parameter") assert.equal(phase.tempFilesDelta, 0, "w15-ram-diagnostic-correction-still-spills");
    }
    report.status = "PASS_CAUSAL_POSTGREST_AUTH_SPILL_DIAGNOSIS_ONLY";
  } catch (e) { report.status = "FAIL_OR_UNKNOWN"; report.reason = /^[a-z0-9-]{1,120}$/.test(e.message) ? e.message : "details-private"; process.exitCode = 1; }
  finally {
    clearInterval(timer); sample(); observer.disconnect();
    if (pg && !stopped) await stop();
    if (gateway) { report.gateway = gateway.bericht(); await gateway.stoppe(); }
    report.completedAtUTC = new Date().toISOString();
    fs.writeFileSync(path.join(DIR, "RAM_CAS_DIAGNOSTIC.SAFE.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ status: report.status, phases: report.phases.length, activeProfiles: 0, units: 0, providerCalls: 0 }));
  }
}
if (require.main === module) main().catch(() => { console.error("w15-ram-diagnostic-first-failure"); process.exitCode = 1; });
