"use strict";

// Nur neuer, gezielter D2-Nachweis: echte HTTP/Auth/CSRF, eigener leerer Store.
// Kein vorhandener Test-/Production-Store, keine Provider, keine Installationen.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const BASE = "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be";
const ACCOUNTS_SHA = "08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e";
const PATCH_SHA = "e5c2f1abf7d340c671c76187bf743d55e3fbca0a5b18398aca52bd967957868a";
const sourceRoot = fs.realpathSync(path.resolve(__dirname, ".."));
const protectedFiles = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "index.html", "styles.css", "scripts/lokal.js", "scripts/lokaler-netzschutz.js"];
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const hashes = root => Object.fromEntries(protectedFiles.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const fixedEnv = () => ({
  PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin",
  LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp", NODE_PATH: "/workspace/helmut-pilot/node_modules",
  HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt"
});
function git(args, cwd) {
  const res = spawnSync("git", args, { cwd, env: fixedEnv(), encoding: "utf8", timeout: 30000 });
  assert.equal(res.status, 0, "Lokaler Git-Schritt " + args[0] + " fehlgeschlagen"); return res.stdout.trim();
}
function guard() {
  assert.equal(sourceRoot, "/workspace/helmut-backend-sprint-b-20261104", "Nur eigener getrennter Arbeitsbereich");
  assert.ok(String(process.env.NODE_OPTIONS || "").includes("lokaler-netzschutz.js"), "scripts/lokal.js erforderlich");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt"); assert.ok(!process.env.HELMUT_V3_STORE);
  for (const key of Object.keys(process.env)) assert.ok(!/(?:KEY|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|AZURE|VERCEL|SMTP|MAIL_PASSWORD)/i.test(key), "Unerwartete Variable " + key);
}
const scenarios = ["last-status", "last-active", "last-role", "unusable-backups", "delete-and-handover", "concurrent-status", "concurrent-role"];
const usableAdmin = user => user.role === "admin" && user.active !== false && !["deaktiviert", "gekuendigt"].includes(user.status) && Boolean(user.passwordHash && user.passwordSalt);

async function worker(root, scenario, output, candidate) {
  guard();
  const runtime = fs.realpathSync(root);
  assert.ok(/^\/tmp\/helmut-sprint-d2-runtime-[^/]+\/repo$/.test(runtime));
  assert.equal(fs.realpathSync(process.cwd()), runtime);
  assert.ok(fs.statSync(path.join(runtime, ".git")).isDirectory());
  assert.equal(git(["rev-parse", "HEAD"], runtime), BASE);
  for (const name of [".helmut-data", ".env", ".env.local", "env.local", "env.local.html"]) assert.ok(!fs.existsSync(path.join(runtime, name)), "Kein bestehender Store/Env: " + name);
  assert.ok(scenarios.includes(scenario));
  const evidence = { scenario, candidatePatch: candidate ? PATCH_SHA : null, requests: [], checks: [], protectedBefore: hashes(runtime) };
  let server, profileWrites = 0, fetchAttempts = 0;
  const check = (name, passed, observed) => evidence.checks.push({ name, status: passed ? "PASS" : "FAIL", observed });
  try {
    const storage = require(path.join(runtime, "lib/helmut/storage.js"));
    storage.saveProfile = async () => { profileWrites++; throw new Error("Profil-Schreiben in D2 verboten"); };
    global.fetch = async () => { fetchAttempts++; throw new Error("fetch in D2 verboten"); };
    const accounts = require(path.join(runtime, "lib/helmut/accounts.js"));
    const password = "Synthetischer-D2-2026!";
    // Direkte synthetische Ausgangsfixtures; Kontoanlage ist bereits in D1 belegt.
    const a = await accounts.createUser({ name: "Synthetischer D2 Admin A", email: "sprint-d2-a@example.invalid", role: "admin", password });
    let b;
    if (scenario.startsWith("concurrent-") || scenario === "delete-and-handover") b = await accounts.createUser({ name: "Synthetischer D2 Admin B", email: "sprint-d2-b@example.invalid", role: "admin", password });
    if (scenario === "unusable-backups") {
      await accounts.createUser({ name: "Synthetisch gesperrter Admin", email: "sprint-d2-blocked@example.invalid", role: "admin", password, active: false });
      await accounts.createUser({ name: "Synthetisch eingeladener Admin", email: "sprint-d2-invited@example.invalid", role: "admin" });
    }
    let arrivals = 0, barrierTimer;
    if (scenario.startsWith("concurrent-")) {
      // Nur Synchronisationsbarriere VOR der echten Mutation. Beide Requests
      // muessen ihre echten Auth-/CSRF-/Rollenpruefungen bereits bestanden haben.
      const actualUpdate = accounts.updateUser;
      let release, rejectBarrier;
      const barrier = new Promise((resolve, reject) => { release = resolve; rejectBarrier = reject; });
      accounts.updateUser = async (...args) => {
        arrivals++;
        if (arrivals === 1) barrierTimer = setTimeout(() => rejectBarrier(new Error("Zweite HTTP-Mutation erreichte Barriere nicht")), 3000);
        if (arrivals === 2) { clearTimeout(barrierTimer); release(); }
        await barrier;
        return actualUpdate(...args);
      };
    }
    const handler = require(path.join(runtime, "server.js"));
    server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch(() => { res.writeHead(500); res.end('{"error":"Handlerfehler"}'); }));
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port;
    const request = (method, route, body, cookie, csrf) => new Promise((resolve, reject) => {
      assert.ok(/^\/api\/(?:auth\/(?:login|session)|security\/csrf|admin\/users(?:\/[^/]+)?)$/.test(route), "Nur freigegebene Kontopfade");
      const raw = body === undefined ? null : JSON.stringify(body);
      const headers = { "User-Agent": "Helmut-Sprint-D2-isoliert" };
      if (raw) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(raw); }
      if (cookie) headers.Cookie = cookie; if (csrf) headers["x-csrf-token"] = csrf;
      const req = http.request({ hostname: "127.0.0.1", port, method, path: route, headers, agent: false }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", chunk => text += chunk);
        res.on("end", () => {
          evidence.requests.push({ method, path: route, status: res.statusCode });
          try { resolve({ status: res.statusCode, data: JSON.parse(text), cookie: (res.headers["set-cookie"] || [])[0]?.split(";")[0] }); }
          catch { reject(new Error("Keine JSON-Antwort")); }
        });
      });
      req.setTimeout(10000, () => req.destroy(new Error("Lokales HTTP-Zeitlimit"))); req.on("error", reject); if (raw) req.write(raw); req.end();
    });
    const login = async user => { const res = await request("POST", "/api/auth/login", { email: user.email, password }); assert.equal(res.status, 200); assert.ok(res.cookie); return res.cookie; };
    const cookieA = await login(a);
    const csrfResponse = await request("GET", "/api/security/csrf", undefined, cookieA); assert.equal(csrfResponse.status, 200); const csrf = csrfResponse.data.token;
    const mutate = (user, patch, cookie = cookieA) => request("PATCH", "/api/admin/users/" + user.id, patch, cookie, csrf);
    const initial = await storage.readAuthStore(); evidence.initialUsableAdmins = initial.users.filter(usableAdmin).length;
    if (scenario === "delete-and-handover") {
      const selfDelete = await request("DELETE", "/api/admin/users/" + a.id, undefined, cookieA, csrf);
      const otherDelete = await request("DELETE", "/api/admin/users/" + b.id, undefined, cookieA, csrf);
      check("Selbstloeschung gesperrt", selfDelete.status === 400, { http: selfDelete.status });
      check("Fremder Administrator nicht loeschbar", otherDelete.status === 403, { http: otherDelete.status });
      const inactive = await mutate(b, { status: "deaktiviert" });
      const demote = await mutate(b, { role: "referent" });
      check("Mit verbleibendem anmeldbarem Admin sind Entzug und Rollenwechsel erlaubt", inactive.status === 200 && demote.status === 200, { deactivation: inactive.status, demotion: demote.status });
      const lastDelete = await request("DELETE", "/api/admin/users/" + a.id, undefined, cookieA, csrf);
      check("Auch letzter Admin kann sich nicht loeschen", lastDelete.status === 400, { http: lastDelete.status });
    } else if (scenario.startsWith("concurrent-")) {
      const cookieB = await login(b);
      const patch = scenario === "concurrent-status" ? { status: "deaktiviert" } : { role: "referent" };
      const responses = await Promise.all([mutate(a, patch, cookieA), mutate(b, patch, cookieB)]);
      const states = responses.map(res => res.status).sort((x, y) => x - y);
      evidence.barrier = { arrivals, location: "after real HTTP authentication/CSRF/role checks, immediately before actual accounts.updateUser" };
      check("Genau eine gleichzeitige Entzugsaktion wird abgewiesen", arrivals === 2 && states[0] === 200 && states[1] === 409, { statuses: states });
    } else {
      const patch = scenario === "last-role" ? { role: "referent" } : scenario === "last-active" ? { active: false } : scenario === "unusable-backups" ? { status: "gekuendigt" } : { status: "deaktiviert" };
      const result = await mutate(a, patch);
      check("Letzter anmeldbarer Admin bleibt bei Entzugsversuch erhalten", result.status === 409, { patch, http: result.status });
    }
    const final = await storage.readAuthStore();
    const usableCount = final.users.filter(usableAdmin).length;
    evidence.finalUsableAdmins = usableCount;
    evidence.finalUsers = final.users.map(user => ({ syntheticName: user.name, role: user.role, active: user.active !== false, status: user.status, hasPassword: Boolean(user.passwordHash && user.passwordSalt) }));
    check("Mindestens ein Administrator ist weiterhin anmeldbar", usableCount >= 1, { count: usableCount });
    if (!scenario.startsWith("concurrent-") && scenario !== "delete-and-handover") {
      const current = final.users.find(user => user.id === a.id);
      check("Abgewiesener Entzug belaesst Konto atomar unveraendert", current.role === "admin" && current.active !== false && current.status === "aktiv", { role: current.role, status: current.status, active: current.active });
    }
    const content = await storage.readStore();
    evidence.isolation = { profileWrites, persistedProfiles: Object.keys(content.profiles || {}).length, fetchAttempts, syntheticEmailsOnly: final.users.every(user => user.email.endsWith("@example.invalid")), backend: storage.getStorageStatus().backend, communicationBlocked: true, listenAddress: "127.0.0.1" };
    assert.equal(profileWrites, 0); assert.equal(evidence.isolation.persistedProfiles, 0); assert.equal(fetchAttempts, 0);
    evidence.status = evidence.checks.some(check => check.status === "FAIL") ? "FAIL_PRODUCT_DEFECT_REPRODUCED" : "PASS";
  } catch (error) {
    evidence.status = "FAIL_HARNESS_OR_UNEXPECTED";
    evidence.error = { name: error.name, message: String(error.message).slice(0, 300), stack: String(error.stack).split("\n").slice(0, 4) };
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    evidence.protectedAfter = hashes(runtime);
    evidence.protectedUnchangedDuringTest = JSON.stringify(evidence.protectedAfter) === JSON.stringify(evidence.protectedBefore);
    evidence.trackedChangedFiles = git(["diff", "--name-only", "HEAD"], runtime).split("\n").filter(Boolean);
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  }
  console.log(scenario + ": " + evidence.status + "; admins " + evidence.initialUsableAdmins + " -> " + evidence.finalUsableAdmins);
  process.exitCode = evidence.status === "PASS" ? 0 : 1;
}

async function main() {
  guard();
  assert.equal(git(["rev-parse", "HEAD"], sourceRoot), BASE);
  assert.equal(git(["branch", "--show-current"], sourceRoot), "feat/claude-backend-isolated");
  assert.equal(git(["diff", "--stat", "HEAD"], sourceRoot), "");
  const before = hashes(sourceRoot);
  let candidate = null;
  if (process.argv.includes("--candidate-patch")) {
    candidate = fs.realpathSync(process.argv[process.argv.indexOf("--candidate-patch") + 1]);
    assert.equal(candidate, path.join(sourceRoot, "docs/backend-isolated/sprint-d2-last-admin.patch"));
    assert.equal(sha(fs.readFileSync(candidate)), PATCH_SHA, "Patchinhalt gebunden");
  }
  const results = [];
  const start = Date.now();
  let d1Composes = null;
  for (const scenario of scenarios) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-sprint-d2-runtime-"));
    const runtime = path.join(temp, "repo"), output = path.join(temp, "evidence.json");
    try {
      git(["clone", "--quiet", "--shared", "--no-hardlinks", "--branch", "feat/claude-backend-isolated", sourceRoot, runtime], temp);
      assert.equal(sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), ACCOUNTS_SHA);
      if (candidate) {
        git(["apply", "--check", candidate], runtime); git(["apply", candidate], runtime);
        assert.equal(git(["diff", "--name-only", "HEAD"], runtime), "lib/helmut/accounts.js");
        // Nur Anwendbarkeitspruefung des getrennten D1-Patches; nicht anwenden.
        if (d1Composes === null) { git(["apply", "--check", path.join(sourceRoot, "docs/backend-isolated/sprint-d-status-active.patch")], runtime); d1Composes = true; }
      }
      const res = spawnSync(process.execPath, [path.join(runtime, "scripts/lokal.js"), __filename, "--worker", runtime, scenario, output, candidate ? "candidate" : "baseline"], { cwd: runtime, env: fixedEnv(), encoding: "utf8", timeout: 20000 });
      process.stdout.write(res.stdout || "");
      assert.ok(fs.existsSync(output), "Kein Szenariobeleg, Kindstatus " + res.status);
      const evidence = JSON.parse(fs.readFileSync(output, "utf8")); results.push(evidence);
      if (evidence.status === "FAIL_HARNESS_OR_UNEXPECTED") throw new Error("Unerwarteter technischer Fehler: " + JSON.stringify(evidence.error));
    } finally {
      assert.ok(temp.startsWith("/tmp/helmut-sprint-d2-runtime-")); fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  const after = hashes(sourceRoot); assert.deepEqual(after, before);
  const summary = { scenarios: results.length, passedScenarios: results.filter(result => result.status === "PASS").length, failedScenarios: results.filter(result => result.status !== "PASS").length, passedChecks: results.flatMap(result => result.checks).filter(check => check.status === "PASS").length, failedChecks: results.flatMap(result => result.checks).filter(check => check.status === "FAIL").length, httpRequests: results.reduce((sum, result) => sum + result.requests.length, 0) };
  const evidence = { baseline: BASE, candidatePatchSha256: candidate ? PATCH_SHA : null, accountsBaseSha256: ACCOUNTS_SHA, d1PatchAppliesCleanlyAfterD2: d1Composes, summary, results, sourceBefore: before, sourceAfter: after, sourceUnchanged: true, run: { timestamp: new Date().toISOString(), elapsedMs: Date.now() - start, testSha256: sha(fs.readFileSync(__filename)), node: process.version, environmentKeys: Object.keys(fixedEnv()).sort(), runtimeClonesRemoved: true, invocation: "env -i [fixedEnv allowlist] node scripts/lokal.js scripts/sprint-d2-last-admin-test.js" + (candidate ? " --candidate-patch docs/backend-isolated/sprint-d2-last-admin.patch" : "") } };
  const filename = candidate ? "sprint-d2-kandidat-20261104.json" : "sprint-d2-baseline-20261104.json";
  fs.writeFileSync(path.join(sourceRoot, "docs/backend-isolated", filename), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(summary)); process.exitCode = summary.failedScenarios ? 1 : 0;
}

(process.argv[2] === "--worker" ? worker(process.argv[3], process.argv[4], process.argv[5], process.argv[6] === "candidate") : main()).catch(error => {
  console.error(error.message); process.exitCode = 1;
});
