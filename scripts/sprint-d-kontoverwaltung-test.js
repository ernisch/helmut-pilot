"use strict";

// Gezielter echter HTTP-Nachweis. Keine Provider/DB, kein vorhandener Store.
// Aufruf nur ueber scripts/lokal.js und eine explizite Environment-Allowlist.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const { spawnSync } = require("child_process");
const assert = require("assert/strict");

const BASELINE = "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be";
const ACCOUNTS_BASE_SHA = "08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e";
const CANDIDATE_SHA = "bf0c77ecc2950cfc34fee9bfd49c707d934e975500f3817cb9e232d7fe70954e";
const PROTECTED = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "index.html", "styles.css", "scripts/lokal.js", "scripts/lokaler-netzschutz.js"];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hashes = (root) => Object.fromEntries(PROTECTED.map((file) => [file, sha(fs.readFileSync(path.join(root, file)))]));
const sourceRoot = fs.realpathSync(path.resolve(__dirname, ".."));
const fixedEnv = () => ({
  PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp",
  NODE_PATH: "/workspace/helmut-pilot/node_modules",
  HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt"
});

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, env: fixedEnv(), encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error("Lokaler Git-Schritt fehlgeschlagen: " + args[0]);
  return result.stdout.trim();
}

function assertGuard() {
  assert.ok(String(process.env.NODE_OPTIONS || "").includes("lokaler-netzschutz.js"), "Nur ueber scripts/lokal.js starten");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
  assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.ok(!process.env.HELMUT_V3_STORE);
  assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt");
  for (const key of Object.keys(process.env)) {
    if (/(?:KEY|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|AZURE|VERCEL|SMTP|MAIL_PASSWORD)/i.test(key)) {
      throw new Error("Unerwartete Credential-/Provider-Variable: " + key);
    }
  }
}

async function worker(root, evidencePath, statusOnly = false, candidateSha = "") {
  assertGuard();
  const runtime = fs.realpathSync(root);
  assert.ok(/^\/tmp\/helmut-sprint-d-runtime-[^/]+\/repo$/.test(runtime), "Nur eigener frischer Testklon");
  assert.equal(fs.realpathSync(process.cwd()), runtime);
  assert.notEqual(runtime, sourceRoot);
  assert.ok(fs.statSync(path.join(runtime, ".git")).isDirectory(), "Eigene Git-Metadaten erforderlich");
  assert.equal(git(["rev-parse", "HEAD"], runtime), BASELINE);
  for (const name of [".helmut-data", ".env", ".env.local", "env.local", "env.local.html"]) {
    assert.ok(!fs.existsSync(path.join(runtime, name)), "Vorhandener Store oder Environment-Datei: " + name);
  }
  const before = hashes(runtime);
  const evidence = { baseline: BASELINE, mode: statusOnly ? "targeted-status-regression-real-http" : "fresh-local-clone-real-http", candidatePatchSha256: candidateSha || null, groups: [], requests: [], findings: [], isolation: {}, protectedBefore: before };
  let server;
  let profileWrites = 0;
  let externalAttempts = 0;
  const group = async (name, callback) => {
    await callback();
    evidence.groups.push({ name, status: "PASS" });
    console.log("PASS " + name);
  };
  try {
    const storage = require(path.join(runtime, "lib/helmut/storage.js"));
    // Instrumentierung nur im frischen Testprozess, keine Quelldateiaenderung.
    storage.saveProfile = async () => { profileWrites++; throw new Error("Profil-Schreiben im Sprint-D-Test verboten"); };
    global.fetch = async () => { externalAttempts++; throw new Error("Kein fetch im Kontoverwaltungstest erlaubt"); };
    const accounts = require(path.join(runtime, "lib/helmut/accounts.js"));
    const password = "Synthetisch-D-2026!";
    const changedPassword = "Synthetisch-D-neu-2026!";
    // Einzige direkte Auth-Fixture: Bootstrap-Admin, danach echte HTTP-Aktionen.
    const admin = await accounts.createUser({ name: "Synthetischer Sprint-D Admin", email: "sprint-d-admin@example.invalid", password, role: "admin" });
    const handler = require(path.join(runtime, "server.js"));
    server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch(() => {
      res.writeHead(500, { "Content-Type": "application/json" }); res.end('{"error":"Unerwarteter Handlerfehler"}');
    }));
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port;
    const allowed = /^(?:\/api\/(?:security\/csrf|auth\/(?:login|logout|session|set-password|password-token)|admin\/(?:users(?:\/[^/]+(?:\/invite)?)?|assignments|customers)|profile\/current))$/;
    const request = (method, pathname, body, cookie, csrf) => new Promise((resolve, reject) => {
      const parsed = new URL(pathname, "http://127.0.0.1");
      assert.ok(allowed.test(parsed.pathname), "Nicht freigegebener Testpfad");
      assert.ok(parsed.pathname !== "/api/profile/current" || method === "GET", "Nur Profil-GET");
      const raw = body === undefined ? null : JSON.stringify(body);
      const headers = { "User-Agent": "Helmut-Sprint-D-isoliert" };
      if (raw) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(raw); }
      if (cookie) headers.Cookie = cookie;
      if (csrf) headers["x-csrf-token"] = csrf;
      const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers, agent: false }, (res) => {
        let text = "";
        res.setEncoding("utf8"); res.on("data", chunk => text += chunk);
        res.on("end", () => {
          evidence.requests.push({ method, path: parsed.pathname, status: res.statusCode });
          try { resolve({ status: res.statusCode, data: JSON.parse(text), headers: res.headers, cookie: (res.headers["set-cookie"] || [])[0]?.split(";")[0] }); }
          catch { reject(new Error("Keine JSON-Antwort: " + parsed.pathname)); }
        });
      });
      req.setTimeout(10000, () => req.destroy(new Error("Lokales HTTP-Zeitlimit")));
      req.on("error", reject); if (raw) req.write(raw); req.end();
    });
    const status = (response, expected) => assert.equal(response.status, expected, "HTTP-Status");
    const login = async (email, pass = password) => request("POST", "/api/auth/login", { email, password: pass });
    const session = async (cookie) => (await request("GET", "/api/auth/session", undefined, cookie)).data;
    let adminCookie, csrf, a, ref, invited, aCookie, refCookie, newACookie;

    await group("Anonym gesperrt; echter Admin-Login und Cookie", async () => {
      status(await request("GET", "/api/admin/users"), 401);
      assert.equal((await session()).authenticated, false);
      const res = await login(admin.email); status(res, 200); adminCookie = res.cookie;
      const cookieHeader = res.headers["set-cookie"][0];
      assert.ok(cookieHeader.includes("HttpOnly") && cookieHeader.includes("SameSite=Lax"));
      const token = await request("GET", "/api/security/csrf", undefined, adminCookie); status(token, 200); csrf = token.data.token;
      assert.ok(csrf); assert.equal((await session(adminCookie)).authenticated, true);
    });
    const mutate = (method, pathname, body) => request(method, pathname, body, adminCookie, csrf);
    const userPath = (user) => "/api/admin/users/" + user.id;
    if (statusOnly) {
      for (const blockedStatus of ["deaktiviert", "gekuendigt"]) {
        const created = await mutate("POST", "/api/admin/users", { name: "Synthetischer Statusgrenzfall", email: "sprint-d-" + blockedStatus + "@example.invalid", role: "abgeordneter", politicianId: "test-mdb-sprint-d-" + blockedStatus, password });
        status(created, 200); const target = created.data;
        const previous = await login(target.email); status(previous, 200);
        const conflict = await mutate("PATCH", userPath(target), { status: blockedStatus, active: true });
        // Ein abgewiesener Konflikt muss den vorherigen aktiven Stand atomar erhalten.
        const afterConflict = (await request("GET", "/api/admin/users", undefined, adminCookie)).data.find(user => user.id === target.id);
        const invariantHolds = conflict.status === 400 && afterConflict.status === "aktiv" && afterConflict.active === true;
        evidence.groups.push({ name: blockedStatus + ": widerspruechlicher PATCH wird atomar abgewiesen", status: invariantHolds ? "PASS" : "FAIL" });
        const conflictLogin = await login(target.email);
        evidence.findings.push({ id: "D-01", testedStatus: blockedStatus, patchStatus: conflict.status, returnedStatus: conflict.data.status || null, returnedActive: conflict.data.active ?? null, persistedStatus: afterConflict.status, persistedActive: afterConflict.active, loginAfterConflict: conflictLogin.status, blockedStatusLoginBypassReproduced: conflict.status === 200 && afterConflict.status === blockedStatus && afterConflict.active === true && conflictLogin.status === 200 });
        await group(blockedStatus + ": normaler Statuswechsel entzieht Sitzung und sperrt Login", async () => {
          const res = await mutate("PATCH", userPath(target), { status: blockedStatus }); status(res, 200); assert.equal(res.data.active, false);
          assert.equal((await session(previous.cookie)).authenticated, false);
          status(await login(target.email), 401);
        });
        const activeOnly = await mutate("PATCH", userPath(target), { active: true });
        const activeOnlyProtected = activeOnly.status === 400;
        evidence.groups.push({ name: blockedStatus + ": active:true allein kann Sperrstatus nicht aufheben", status: activeOnlyProtected ? "PASS" : "FAIL" });
        evidence.findings.push({ id: "D-01-active-only", testedStatus: blockedStatus, patchStatus: activeOnly.status, returnedStatus: activeOnly.data.status || null, returnedActive: activeOnly.data.active ?? null });
        await group(blockedStatus + ": bewusste Statusreaktivierung bleibt moeglich", async () => {
          const res = await mutate("PATCH", userPath(target), { status: "aktiv", active: true }); status(res, 200); assert.equal(res.data.status, "aktiv"); assert.equal(res.data.active, true);
          status(await login(target.email), 200);
        });
      }
      const content = await storage.readStore();
      evidence.isolation = { backend: storage.getStorageStatus().backend, profileWrites, persistedProfiles: Object.keys(content.profiles || {}).length, externalFetchAttempts: externalAttempts, communicationBlocked: process.env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt", listenAddress: "127.0.0.1", syntheticEmailsOnly: (await accounts.listUsers()).every(user => user.email.endsWith("@example.invalid")) };
      assert.equal(profileWrites, 0); assert.equal(evidence.isolation.persistedProfiles, 0); assert.equal(externalAttempts, 0);
      evidence.status = evidence.groups.some(group => group.status === "FAIL") ? "FAIL_PRODUCT_DEFECT_REPRODUCED" : "PASS_CANDIDATE_STATUS_REGRESSION";
      return;
    }
    await group("CSRF fehlt/falsch: keine Kontoanlage", async () => {
      const body = { email: "sprint-d-csrf@example.invalid", name: "Synthetisch", role: "referent", password };
      status(await request("POST", "/api/admin/users", body, adminCookie), 403);
      status(await request("POST", "/api/admin/users", body, adminCookie, "ungueltig"), 403);
      assert.equal((await accounts.listUsers()).length, 1);
    });
    await group("Echte Kontoanlage und sanitisiertes Nutzerlisting; keine Profilanlage", async () => {
      let res = await mutate("POST", "/api/admin/users", { name: "Synthetisches Mandat A", email: " SPRINT-D-A@example.invalid ", role: "abgeordneter", politicianId: "test-mdb-sprint-d-a", password });
      status(res, 200); a = res.data; assert.equal(a.email, "sprint-d-a@example.invalid");
      res = await mutate("POST", "/api/admin/users", { name: "Synthetischer Referent", email: "sprint-d-ref@example.invalid", role: "referent", password });
      status(res, 200); ref = res.data;
      const listing = await request("GET", "/api/admin/users", undefined, adminCookie); status(listing, 200);
      assert.ok(!/passwordHash|passwordSalt|tokenHash/.test(JSON.stringify(listing.data)));
      assert.equal(profileWrites, 0);
    });
    await group("Doppelte E-Mail und ungueltige Rolle abgewiesen", async () => {
      status(await mutate("POST", "/api/admin/users", { email: a.email, name: "Duplikat", role: "referent", password }), 409);
      status(await mutate("POST", "/api/admin/users", { email: "sprint-d-invalid@example.invalid", name: "Ungültig", role: "owner", password }), 400);
      assert.equal((await accounts.listUsers()).length, 3);
    });
    await group("Nicht-Admins koennen Konten und Rollen nicht verwalten", async () => {
      let res = await login(a.email); status(res, 200); aCookie = res.cookie;
      res = await login(ref.email); status(res, 200); refCookie = res.cookie;
      status(await request("GET", "/api/admin/users", undefined, aCookie), 403);
      status(await request("PATCH", userPath(a), { role: "admin" }, aCookie, csrf), 403);
      status(await request("POST", "/api/admin/users", { email: "sprint-d-denied@example.invalid", role: "admin", password }, refCookie, csrf), 403);
    });
    await group("Mandatsbindung, explizite Zuweisung und Entzug ohne Profil-Schreiben", async () => {
      let res = await mutate("POST", "/api/admin/assignments", { userId: ref.id, politicianId: a.politicianId }); status(res, 200);
      res = await request("GET", "/api/profile/current?politicianId=test-mdb-fremd", undefined, aCookie); status(res, 200); assert.equal(res.data.id, a.politicianId);
      res = await request("GET", "/api/profile/current?politicianId=test-mdb-fremd", undefined, refCookie); status(res, 200); assert.equal(res.data.id, a.politicianId);
      status(await mutate("DELETE", "/api/admin/assignments", { userId: ref.id, politicianId: a.politicianId }), 200);
      status(await request("GET", "/api/profile/current?politicianId=" + a.politicianId, undefined, refCookie), 403);
      status(await mutate("POST", "/api/admin/assignments", { userId: ref.id, politicianId: a.politicianId }), 200);
      assert.equal(profileWrites, 0);
    });
    await group("Rollenwechsel wirkt auf vorhandene Sitzung", async () => {
      status(await mutate("PATCH", userPath(ref), { role: "admin" }), 200);
      status(await request("GET", "/api/admin/users", undefined, refCookie), 200);
      status(await mutate("PATCH", userPath(ref), { role: "referent" }), 200);
      status(await request("GET", "/api/admin/users", undefined, refCookie), 403);
    });
    await group("Bearbeiten und manuelle Kundenkonditionen; Fehlerzustand", async () => {
      const res = await mutate("PATCH", userPath(a), { name: "Synthetisches Mandat A bearbeitet", customer: { pricePerMonth: 249, paymentStatus: "open", internalNote: "Synthetischer Test ohne Zahlungsanbieter" } });
      status(res, 200); assert.equal(res.data.customer.pricePerMonth, 249); assert.equal(res.data.customer.paymentStatus, "open");
      status(await mutate("PATCH", userPath(a), { customer: { paymentStatus: "bezahlt-vielleicht" } }), 400);
      const customers = await request("GET", "/api/admin/customers", undefined, adminCookie); status(customers, 200);
      assert.ok(!/passwordHash|passwordSalt|tokenHash/.test(JSON.stringify(customers.data)));
      status(await mutate("PATCH", "/api/admin/users/nicht-vorhanden", { name: "Fehlt" }), 404);
      status(await mutate("PATCH", userPath(a), { password: changedPassword }), 400);
    });
    let inviteToken;
    await group("Einladung: Link, Versand gesperrt, echtes Passwortsetzen und Einmaligkeit", async () => {
      const res = await mutate("POST", "/api/admin/users", { name: "Synthetisch eingeladen", email: "sprint-d-invite@example.invalid", role: "referent" });
      status(res, 200); invited = res.data; assert.equal(invited.status, "eingeladen"); assert.equal(invited.mail.sent, false);
      inviteToken = new URL(invited.inviteUrl).searchParams.get("token"); assert.ok(inviteToken);
      const inspect = await request("GET", "/api/auth/password-token?token=" + encodeURIComponent(inviteToken)); status(inspect, 200); assert.equal(inspect.data.valid, true);
      const set = await request("POST", "/api/auth/set-password", { token: inviteToken, password }); status(set, 200); assert.equal((await session(set.cookie)).authenticated, true);
      status(await request("POST", "/api/auth/set-password", { token: inviteToken, password }), 410);
    });
    await group("Reset: neue Sitzung, alle alten Sitzungen und altes Passwort entzogen", async () => {
      const second = await login(a.email); status(second, 200);
      const link = await mutate("POST", userPath(a) + "/invite", {}); status(link, 200); assert.equal(link.data.purpose, "reset"); assert.equal(link.data.mail.sent, false);
      const resetToken = new URL(link.data.inviteUrl).searchParams.get("token");
      const reset = await request("POST", "/api/auth/set-password", { token: resetToken, password: changedPassword }); status(reset, 200); newACookie = reset.cookie;
      assert.equal((await session(aCookie)).authenticated, false); assert.equal((await session(second.cookie)).authenticated, false);
      assert.equal((await session(newACookie)).authenticated, true);
      status(await login(a.email), 401); status(await login(a.email, changedPassword), 200);
    });
    await group("Abmelden entzieht die eigene Sitzung", async () => {
      status(await request("POST", "/api/auth/logout", {}, refCookie), 200);
      assert.equal((await session(refCookie)).authenticated, false);
    });
    await group("Pausiert bleibt erlaubt; deaktiviert entzieht bestehende Sitzungen und Login", async () => {
      status(await mutate("PATCH", userPath(a), { status: "pausiert" }), 200); assert.equal((await session(newACookie)).authenticated, true);
      const disabled = await mutate("PATCH", userPath(a), { status: "deaktiviert" }); status(disabled, 200); assert.equal(disabled.data.active, false);
      assert.equal((await session(newACookie)).authenticated, false);
      status(await login(a.email, changedPassword), 401);
      status(await mutate("PATCH", userPath(a), { status: "aktiv" }), 200);
    });
    await group("Kontoloeschung entfernt nur eigene Auth-Nebendaten; Selbst-/Adminloeschung gesperrt", async () => {
      status(await mutate("POST", userPath(ref) + "/invite", {}), 200);
      status(await mutate("DELETE", userPath(admin)), 400);
      const secondAdmin = await mutate("POST", "/api/admin/users", { name: "Synthetischer zweiter Admin", email: "sprint-d-admin2@example.invalid", role: "admin", password }); status(secondAdmin, 200);
      status(await mutate("DELETE", userPath(secondAdmin.data)), 403);
      const result = await mutate("DELETE", userPath(ref)); status(result, 200); assert.equal(result.data.deletedUserId, ref.id);
      const store = await storage.readAuthStore();
      for (const key of ["sessions", "passwordTokens", "assignments"]) assert.ok(!(store[key] || []).some(row => row.userId === ref.id));
      assert.ok(store.users.some(user => user.id === a.id)); assert.ok(store.users.some(user => user.id === admin.id));
    });
    // Letzte Mutationsgruppe: Produktfehler erhalten und danach keine weiteren Aktionen.
    const conflict = await mutate("PATCH", userPath(a), { status: "deaktiviert", active: true });
    const conflictingLogin = await login(a.email, changedPassword);
    const defect = conflict.status === 200 && conflict.data.status === "deaktiviert" && conflict.data.active === true && conflictingLogin.status === 200;
    evidence.groups.push({ name: "Status deaktiviert hat Vorrang vor widerspruechlichem active:true", status: defect ? "FAIL" : "PASS" });
    evidence.findings.push({ id: "D-01", reproduced: defect, patchStatus: conflict.status, returnedStatus: conflict.data.status, returnedActive: conflict.data.active, loginStatus: conflictingLogin.status, expected: "400 bei Konflikt oder active:false und Login 401" });
    if (defect) console.log("FAIL D-01: deaktiviert + active:true erlaubt echten Login; danach keine weiteren Mutationen.");
    else assert.ok(conflict.status === 400 || (conflict.data.active === false && conflictingLogin.status === 401), "Unerwartetes Konfliktverhalten");
    const content = await storage.readStore();
    evidence.isolation = { backend: storage.getStorageStatus().backend, profileWrites, persistedProfiles: Object.keys(content.profiles || {}).length, externalFetchAttempts: externalAttempts, communicationBlocked: process.env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt", listenAddress: "127.0.0.1", syntheticEmailsOnly: (await accounts.listUsers()).every(user => user.email.endsWith("@example.invalid")), directFixture: "one synthetic bootstrap admin; all other lifecycle operations via HTTP" };
    assert.equal(profileWrites, 0); assert.equal(evidence.isolation.persistedProfiles, 0); assert.equal(externalAttempts, 0);
    evidence.status = defect ? "FAIL_PRODUCT_DEFECT_REPRODUCED" : "PASS";
  } catch (error) {
    evidence.status = "FAIL_HARNESS_OR_UNEXPECTED";
    // Keine Antwortkoerper, Credentials, Links oder Tokens in den Beleg schreiben.
    evidence.error = { name: error.name, message: String(error.message).slice(0, 500), stack: String(error.stack).split("\n").slice(0, 4) };
    console.error(evidence.error.message);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    evidence.protectedAfter = hashes(runtime);
    evidence.protectedUnchanged = JSON.stringify(evidence.protectedBefore) === JSON.stringify(evidence.protectedAfter);
    evidence.trackedDiffEmpty = git(["diff", "--stat", "HEAD"], runtime) === "";
    evidence.summary = { passed: evidence.groups.filter(group => group.status === "PASS").length, failed: evidence.groups.filter(group => group.status === "FAIL").length, httpRequests: evidence.requests.length };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
    process.exitCode = evidence.status === "PASS" || evidence.status === "PASS_CANDIDATE_STATUS_REGRESSION" ? 0 : 1;
  }
}

async function main() {
  assertGuard();
  assert.equal(sourceRoot, "/workspace/helmut-backend-sprint-b-20261104", "Schutz: nur der eigene getrennte Sprint-B-Arbeitsbereich");
  assert.equal(git(["rev-parse", "HEAD"], sourceRoot), BASELINE);
  assert.equal(git(["branch", "--show-current"], sourceRoot), "feat/claude-backend-isolated");
  assert.equal(git(["diff", "--stat", "HEAD"], sourceRoot), "", "Bestehende Quelldateien muessen unveraendert sein");
  const before = hashes(sourceRoot);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-sprint-d-runtime-"));
  const runtime = path.join(temp, "repo");
  const evidencePath = path.join(temp, "evidence.json");
  try {
    git(["clone", "--quiet", "--shared", "--no-hardlinks", "--branch", "feat/claude-backend-isolated", sourceRoot, runtime], temp);
    const statusOnly = process.argv.includes("--status-regression") || process.argv.includes("--candidate-patch");
    let candidateSha = "";
    if (process.argv.includes("--candidate-patch")) {
      const candidateIndex = process.argv.indexOf("--candidate-patch");
      const candidate = fs.realpathSync(process.argv[candidateIndex + 1]);
      assert.equal(candidate, path.join(sourceRoot, "docs/backend-isolated/sprint-d-status-active.patch"));
      assert.equal(sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), ACCOUNTS_BASE_SHA, "Patchbasis gebunden");
      candidateSha = sha(fs.readFileSync(candidate)); assert.equal(candidateSha, CANDIDATE_SHA, "Patchinhalt gebunden");
      git(["apply", "--check", candidate], runtime);
      git(["apply", candidate], runtime); // Ausschliesslich eigener Wegwerfklon.
      assert.equal(git(["diff", "--name-only", "HEAD"], runtime), "lib/helmut/accounts.js");
    }
    const start = Date.now();
    const result = spawnSync(process.execPath, [path.join(runtime, "scripts/lokal.js"), __filename, "--worker", runtime, evidencePath, statusOnly ? "status" : "full", candidateSha], { cwd: runtime, env: fixedEnv(), encoding: "utf8", timeout: 90000, maxBuffer: 1024 * 1024 });
    process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
    if (!fs.existsSync(evidencePath)) throw new Error("HTTP-Test lieferte keinen Beleg; Kind-Exit " + result.status);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    evidence.run = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - start, exitCode: result.status, node: process.version, sourceRoot, runtimeCloneRemovedAfterRun: true, testSha256: sha(fs.readFileSync(__filename)), environmentKeys: Object.keys(fixedEnv()).sort(), invocation: "env -i [explicit fixedEnv allowlist] node scripts/lokal.js scripts/sprint-d-kontoverwaltung-test.js" + (candidateSha ? " --candidate-patch docs/backend-isolated/sprint-d-status-active.patch" : statusOnly ? " --status-regression" : "") };
    evidence.sourceBefore = before; evidence.sourceAfter = hashes(sourceRoot);
    assert.deepEqual(evidence.sourceAfter, before);
    const output = candidateSha ? "sprint-d-status-kandidat-20261104.json" : statusOnly ? "sprint-d-status-baseline-20261104.json" : "sprint-d-pruefbeleg-20261104.json";
    fs.writeFileSync(path.join(sourceRoot, "docs/backend-isolated", output), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({ status: evidence.status, ...evidence.summary, protectedUnchanged: evidence.protectedUnchanged }));
    process.exitCode = result.status === 0 ? 0 : 1;
  } finally {
    // Nur der gerade von diesem Test erzeugte Pfad, niemals ein Projektstore.
    assert.ok(temp.startsWith("/tmp/helmut-sprint-d-runtime-"));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

(process.argv[2] === "--worker" ? worker(process.argv[3], process.argv[4], process.argv[5] === "status", process.argv[6]) : main()).catch(error => {
  console.error(error.message); process.exitCode = 1;
});
