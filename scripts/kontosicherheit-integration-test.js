"use strict";

// Nimmt den TATSAECHLICH integrierten Quellsnapshot ab. Keine Patchanwendung.
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const assert = require("assert/strict"), { spawnSync } = require("child_process");
const own = fs.realpathSync(path.resolve(__dirname, ".."));
const source = "/workspace/helmut-claude-backend-isolated";
const helperRoot = "/workspace/helmut-backend-sprint-b-20261104";
const BASE = "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be";
const INTEGRATED = "608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const files = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "index.html", "styles.css", "scripts/lokal.js", "scripts/lokaler-netzschutz.js"];
const hashes = root => Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const workers = [
  { file: "scripts/sprint-d-kontoverwaltung-test.js", sha256: "5eb0699c03616e0db8aec32c01197e456b853f98dbc5d137a37dedb3a04bd068" },
  { file: "scripts/sprint-d2-last-admin-test.js", sha256: "0570d4fc80432ecf66cead592e64ddea39409cee1d7a5ad4bb576fc791e51a09" }
];
const fixedEnv = () => ({ PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp", NODE_PATH: "/workspace/helmut-pilot/node_modules", HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" });
function git(args, cwd) { const result = spawnSync("git", args, { cwd, env: fixedEnv(), encoding: "utf8", timeout: 30000 }); assert.equal(result.status, 0, "Lokaler Git-Schritt " + args[0]); return result.stdout.trim(); }
function guard() {
  assert.equal(own, "/workspace/helmut-kontosicherheit-integration-20261104");
  assert.ok(String(process.env.NODE_OPTIONS || "").includes("lokaler-netzschutz.js"));
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt"); assert.ok(!process.env.HELMUT_V3_STORE);
  for (const key of Object.keys(process.env)) assert.ok(!/(?:KEY|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|AZURE|VERCEL|SMTP|MAIL_PASSWORD)/i.test(key), key);
}

async function casWorker(runtime, output) {
  guard();
  assert.ok(/^\/tmp\/helmut-kontosicherheit-cas-[^/]+\/repo$/.test(fs.realpathSync(runtime)));
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(runtime));
  assert.equal(git(["rev-parse", "HEAD"], runtime), BASE);
  assert.equal(sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), INTEGRATED);
  assert.ok(!fs.existsSync(path.join(runtime, ".helmut-data")));
  const before = hashes(runtime), results = [];
  let blob, peerOnPatch = null, calls = [], rejectedCas = 0;
  // Nur ein deterministischer Transportersatz. Kein Socket, keine Datenbank,
  // keine echten Credentials. Der Preload sperrt weiterhin fremde Hosts.
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url); assert.equal(parsed.origin, "http://127.0.0.1:1"); assert.equal(parsed.pathname, "/rest/v1/helmut_store");
    const method = options.method || "GET"; calls.push(method);
    const response = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (method === "GET") return response([{ data: blob }]);
    assert.equal(method, "PATCH");
    if (peerOnPatch) { const change = peerOnPatch; peerOnPatch = null; change(); }
    if (parsed.searchParams.get("data->>_authStoreRevision") !== "eq." + blob._authStoreRevision) { rejectedCas++; return response([]); }
    blob = JSON.parse(options.body).data; return response([{ id: "main-auth" }]);
  };
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-unusable-transport-placeholder";
  const storage = require(path.join(runtime, "lib/helmut/storage.js")), accounts = require(path.join(runtime, "lib/helmut/accounts.js"));
  const reset = () => { blob = { users: [], adminSettings: { fixture: true }, _authStoreRevision: crypto.randomUUID() }; calls = []; rejectedCas = 0; peerOnPatch = null; };
  const check = async (name, run) => { await run(); results.push({ name, status: "PASS" }); console.log("PASS " + name); };
  try {
    await check("CAS: veralteter Auth-Schreiber wird abgewiesen und ueberschreibt keinen frischen Stand", async () => {
      reset(); const first = await storage.readAuthStore(), stale = { ...first };
      first.adminSettings = { fresh: true }; await storage.writeAuthStore(first);
      stale.adminSettings = { stale: true };
      await assert.rejects(storage.writeAuthStore(stale), { code: "AUTH_STORE_CONFLICT" });
      assert.deepEqual(blob.adminSettings, { fresh: true }); assert.equal(rejectedCas, 1);
    });
    await check("CAS: nach parallelem Peer-Entzug prueft integrierter Adminschutz den frischen Stand erneut", async () => {
      reset(); const password = "Synthetischer-CAS-Integration-2026!";
      const a = await accounts.createUser({ email: "cas-a@example.invalid", name: "Synthetischer CAS Admin A", role: "admin", password });
      const b = await accounts.createUser({ email: "cas-b@example.invalid", name: "Synthetischer CAS Admin B", role: "admin", password });
      const start = calls.length;
      peerOnPatch = () => { blob.users.find(user => user.id === b.id).role = "referent"; blob._authStoreRevision = crypto.randomUUID(); };
      await assert.rejects(accounts.updateUser(a.id, { role: "referent" }), error => error.statusCode === 409 && /letzte anmeldbare Administrator/.test(error.message));
      assert.equal(blob.users.find(user => user.id === a.id).role, "admin"); assert.equal(blob.users.find(user => user.id === b.id).role, "referent");
      assert.equal(rejectedCas, 1); assert.deepEqual(calls.slice(start), ["GET", "PATCH", "GET"]);
    });
  } finally {
    const after = hashes(runtime); assert.deepEqual(after, before);
    fs.writeFileSync(output, JSON.stringify({ status: results.length === 2 ? "PASS" : "FAIL", mode: "deterministic-offline-CAS-transport-no-database", integratedAccountsSha256: INTEGRATED, checks: results, protectedBefore: before, protectedAfter: after, noLocalStoreFiles: !fs.existsSync(path.join(runtime, ".helmut-data")), realDatabase: false, actualNetworkRequests: 0, syntheticTransportOnly: true }, null, 2) + "\n");
  }
}

function main() {
  guard(); assert.equal(git(["rev-parse", "HEAD"], own), BASE); assert.equal(git(["rev-parse", "HEAD"], source), BASE);
  assert.equal(git(["branch", "--show-current"], source), "feat/claude-backend-isolated");
  for (const worker of workers) assert.equal(sha(fs.readFileSync(path.join(helperRoot, worker.file))), worker.sha256);
  const sourceBefore = hashes(source), ownBefore = hashes(own);
  assert.equal(sourceBefore["lib/helmut/accounts.js"], INTEGRATED, "Tatsaechlich integrierter Rootstand muss vorliegen");
  const actualAccounts = fs.readFileSync(path.join(source, "lib/helmut/accounts.js"));
  assert.equal(sha(actualAccounts), INTEGRATED);
  for (const file of files.filter(file => file !== "lib/helmut/accounts.js")) assert.equal(ownBefore[file], sourceBefore[file], "Gemeinsame Basisdatei " + file);
  const cases = [{ name: "D1-status", prefix: "helmut-sprint-d-runtime-", helper: workers[0] }, ...["last-status", "last-active", "last-role", "unusable-backups", "delete-and-handover", "concurrent-status", "concurrent-role"].map(name => ({ name, prefix: "helmut-sprint-d2-runtime-", helper: workers[1] })), { name: "CAS-focused", prefix: "helmut-kontosicherheit-cas-", helper: null }];
  const evidence = { baselineCommit: BASE, integratedSource: source, integratedAccountsSha256: INTEGRATED, sourceBefore, ownBefore, unchangedWorkers: workers, noPatchesApplied: true, results: [] };
  let log = ""; const start = Date.now();
  try {
    for (const item of cases) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), item.prefix)), runtime = path.join(temp, "repo"), output = path.join(temp, "evidence.json");
      try {
        git(["clone", "--quiet", "--shared", "--no-hardlinks", "--branch", "feat/claude-backend-isolated", own, runtime], temp);
        for (const file of [".helmut-data", ".env", ".env.local", "env.local", "env.local.html"]) assert.ok(!fs.existsSync(path.join(runtime, file)));
        // Exakte aktuelle Rootdatei, nicht aus den alten Patches rekonstruiert.
        fs.writeFileSync(path.join(runtime, "lib/helmut/accounts.js"), actualAccounts);
        assert.deepEqual(hashes(runtime), sourceBefore);
        assert.equal(git(["diff", "--name-only", "HEAD"], runtime), "lib/helmut/accounts.js");
        const script = item.helper ? path.join(helperRoot, item.helper.file) : __filename;
        const args = item.name === "D1-status" ? ["--worker", runtime, output, "status", ""] : item.helper ? ["--worker", runtime, item.name, output, "integrated"] : ["--cas-worker", runtime, output];
        const result = spawnSync(process.execPath, [path.join(runtime, "scripts/lokal.js"), script, ...args], { cwd: runtime, env: fixedEnv(), encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 });
        log += "CASE " + item.name + "\n" + (result.stdout || "") + (result.stderr || "") + "exit_code=" + result.status + "\n";
        assert.ok(fs.existsSync(output), "Fehlender Beleg " + item.name);
        const resultEvidence = JSON.parse(fs.readFileSync(output, "utf8"));
        const checks = resultEvidence.groups || resultEvidence.checks;
        evidence.results.push({ name: item.name, exitCode: result.status, accountsSourceSha256: sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), evidence: resultEvidence });
        console.log(item.name + ": " + resultEvidence.status + " (exit " + result.status + ")");
        assert.equal(result.status, 0, "Worker fehlgeschlagen: " + item.name); assert.ok(checks.every(check => check.status === "PASS"));
        assert.equal(sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), INTEGRATED);
      } finally { assert.ok(temp.startsWith("/tmp/" + item.prefix)); fs.rmSync(temp, { recursive: true, force: true }); }
    }
    evidence.status = "PASS_ACTUAL_INTEGRATED_SOURCE";
  } catch (error) { evidence.status = "FAIL"; evidence.error = { name: error.name, message: error.message }; process.exitCode = 1; }
  finally {
    evidence.sourceAfter = hashes(source); evidence.ownAfter = hashes(own);
    assert.deepEqual(evidence.sourceAfter, sourceBefore); assert.deepEqual(evidence.ownAfter, ownBefore);
    for (const worker of workers) assert.equal(sha(fs.readFileSync(path.join(helperRoot, worker.file))), worker.sha256);
    evidence.summary = { workerCases: evidence.results.length, passedChecks: evidence.results.reduce((sum, item) => sum + (item.evidence.groups || item.evidence.checks).filter(check => check.status === "PASS").length, 0), httpRequests: evidence.results.reduce((sum, item) => sum + (item.evidence.requests || []).length, 0), offlineCasChecks: evidence.results.find(item => item.name === "CAS-focused")?.evidence.checks.length || 0 };
    evidence.run = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - start, testSha256: sha(fs.readFileSync(__filename)), environmentKeys: Object.keys(fixedEnv()).sort(), runtimeClonesRemoved: true, logSha256: sha(log), invocation: "env -i [fixedEnv allowlist] node scripts/lokal.js scripts/kontosicherheit-integration-test.js" };
    fs.writeFileSync(path.join(own, "docs/backend-isolated/kontosicherheit-integration-pruefbeleg-20261104.json"), JSON.stringify(evidence, null, 2) + "\n");
    fs.writeFileSync(path.join(own, "docs/backend-isolated/kontosicherheit-integration-20261104.log"), log);
    console.log(JSON.stringify({ status: evidence.status, ...evidence.summary }));
  }
}

(process.argv[2] === "--cas-worker" ? casWorker(process.argv[3], process.argv[4]) : Promise.resolve().then(main)).catch(error => { console.error(error.message); process.exitCode = 1; });
