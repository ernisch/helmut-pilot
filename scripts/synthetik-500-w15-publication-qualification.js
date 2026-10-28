"use strict";

// Runs only in the existing offline container, using a new restored DB. Real
// PostgREST and the existing prefix gateway; no request/identity/proof mocks.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const http = require("node:http"), { spawn, spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const DIR = "/tmp/w15-publication-bindings-20261028", DB = "helmut_w15_source_bindings_20261028";
const POSTGREST = "/tmp/w15-full500-20261028/postgrest", PORT = 3212;
const safe = error => /^[A-Za-z][A-Za-z0-9:_/.~-]{0,179}$/.test(error?.message || "")
  ? error.message : "w15-publication-qualification-prerequisite";
function save(name, value) {
  fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
async function ready() {
  for (let i = 0; i < 50; i++) {
    const up = await new Promise(resolve => {
      const request = http.get({ hostname: "127.0.0.1", port: PORT, path: "/", timeout: 1000 }, response => {
        response.resume(); response.on("end", () => resolve([200, 401].includes(response.statusCode))); });
      request.on("timeout", () => request.destroy()); request.on("error", () => resolve(false));
    });
    if (up) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("w15-publication-postgrest-not-ready");
}
async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  const stat = fs.lstatSync(DIR); assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid());
  assert.equal(stat.mode & 511, 448); assert.equal(process.version, "v24.19.0");
  fs.writeFileSync(path.join(DIR, "bootstrap.pid"), String(process.pid), { flag: "wx", mode: 0o600 });
  const secret = crypto.randomBytes(48).toString("hex"), now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", iat: now, exp: now + 3600 });
  const token = body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
  fs.writeFileSync(path.join(DIR, "postgrest.PRIVATE.conf"),
    'db-uri = "postgresql://authenticator@localhost/' + DB + '?host=/var/run/postgresql"\n'
    + 'db-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = ' + PORT
    + '\ndb-pool = 2\njwt-secret = "' + secret + '"\n', { flag: "wx", mode: 0o600 });
  let gateway = null, result = null, failure = null, stopped = false;
  const log = fs.openSync(path.join(DIR, "postgrest.PRIVATE.log"), "wx", 0o600);
  const service = spawn(POSTGREST, [path.join(DIR, "postgrest.PRIVATE.conf")], {
    stdio: ["ignore", log, log], env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  const closed = new Promise(resolve => {
    service.once("exit", () => { stopped = true; resolve(); });
    service.once("error", () => { failure = "w15-publication-postgrest-spawn"; stopped = true; resolve(); });
  });
  if (service.pid) fs.writeFileSync(path.join(DIR, "postgrest.pid"), String(service.pid), { flag: "wx", mode: 0o600 });
  try {
    await ready(); assert(!failure && !stopped, "w15-publication-postgrest-live");
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: PORT });
    save("configuration.PRIVATE.json", { database: DB, url: gateway.url, serviceToken: token });
    result = await require("./synthetik-500-w15-mock-bindings-check").main();
  } catch (error) { failure = failure || safe(error); process.exitCode = 1; }
  finally {
    const gatewayEvidence = gateway ? gateway.bericht() : null;
    if (gateway) await gateway.stoppe();
    if (!stopped) service.kill("SIGTERM");
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (!stopped) { service.kill("SIGKILL"); await closed; }
    fs.closeSync(log);
    const p = spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-f", "-"], {
      input: "begin read only;set local statement_timeout='10s';select count(*)from public.mandate_profiles where aktiv;rollback;",
      encoding: "utf8", timeout: 15000, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
    const zero = p.status === 0 && p.stdout.trim() === "0";
    if (!zero) { failure = failure || "w15-publication-preparation-zero-unknown"; process.exitCode = 1; }
    save("QUALIFICATION_BOOTSTRAP.SAFE.json", { status: !failure && zero ? "SAFE_CLOSURE" : "FAIL_OR_UNKNOWN",
      applicationStatus: result?.status || "NOT_REACHED", failure, database: DB,
      confirmedActiveZero: zero, publicationGateway: gatewayEvidence, postgrestStopped: stopped,
      noRequestOverride: true, paidModelCalls: 0, unitExecutions: 0, profileActivations: 0, retryAllowed: false });
  }
}
if (require.main === module) main().catch(() => { console.error("w15-publication-bootstrap-first-failure"); process.exitCode = 1; });
module.exports = { main };
