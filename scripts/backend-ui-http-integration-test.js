"use strict";

// Echte Backend-HTTP-Vertraege fuer die aktuelle UI-Uebergabe. Kein UI-Ersatz:
// der aktuelle UI-Code liegt in einer anderen Umgebung und wird hier nicht simuliert.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const http = require("node:http"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { execFileSync, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const accountHash = "608838b6674a17c1028bd3cda3edcb129188f6d75923fbb7b62bab04fdf6e703";
const protectedFiles = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "styles.css", "index.html"];
const hashes = dir => Object.fromEntries(protectedFiles.map(file => [file, sha(fs.readFileSync(path.join(dir, file)))]));
const env = () => ({ PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp", NODE_PATH: "/workspace/helmut-pilot/node_modules", HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" });
const proof = { scope: "BACKEND_HTTP_ONLY_CURRENT_UI_FILES_UNAVAILABLE", ui: { branch: "codex/helmut-ui-20261031", reportedCommit: "373c373d", parent: "a41d51f194dba526c7aab6b922f6dc33eed3d618", source: "user and read-only UI-thread handoff; no current UI runtime available" }, checks: [], requests: [] };
function guard() {
  assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
  assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local"); assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
  assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt"); assert.ok(!process.env.HELMUT_V3_STORE);
  for (const name of Object.keys(process.env)) assert.ok(!/(?:SECRET|TOKEN|CREDENTIAL|SUPABASE|AZURE|VERCEL|DATABASE_URL|API_KEY)/i.test(name), name);
}
async function worker(clone, output) {
  guard(); assert.ok(clone.startsWith("/tmp/helmut-ui-contract-http-"));
  assert.equal(sha(fs.readFileSync(path.join(clone, "lib/helmut/accounts.js"))), accountHash);
  assert.equal(fs.existsSync(path.join(clone, ".env")), false);
  assert.equal(fs.existsSync(path.join(clone, ".helmut-data")), false);
  const accounts = require(path.join(clone, "lib/helmut/accounts"));
  const storage = require(path.join(clone, "lib/helmut/storage"));
  const fixture = require(path.join(clone, "scripts/fixtures/test-profiles"));
  const password = "Synthetic-Backend-Integration-123!";
  const alpha = "integration-synthetic-alpha", beta = "integration-synthetic-beta";
  const admin = await accounts.createUser({ name: "Fiktiver Integrationsadmin", email: "admin@integration.invalid", role: "admin", password });
  const member = await accounts.createUser({ name: "Fiktives Mandat Alpha", email: "alpha@integration.invalid", role: "abgeordneter", politicianId: alpha, password });
  await accounts.createUser({ name: "Fiktives Mandat Beta", email: "beta@integration.invalid", role: "abgeordneter", politicianId: beta, password });
  const staff = await accounts.createUser({ name: "Fiktives Buero Alpha", email: "staff@integration.invalid", role: "referent", password });
  await accounts.addAssignment(staff.id, alpha);
  await accounts.createUser({ name: "Fiktiv ohne Mandat", email: "empty@integration.invalid", role: "referent", password });
  for (const [id, data, name] of [[alpha, fixture.testPoliticianOne, "Fiktives Profil Alpha"], [beta, fixture.testPoliticianTwo, "Fiktives Profil Beta"]]) {
    await storage.saveProfile({ ...data, id, fullName: name, profileActive: false, onboardedAt: new Date().toISOString() });
    await storage.saveTask({ id: `task-${id}`, politicianId: id, title: `Fiktive Aufgabe ${id}`, status: "open" });
    await storage.saveUserNote({ id: `note-${id}`, user_id: id, text: `Fiktive Notiz ${id}` });
  }
  const fault = { session: false, profile: false };
  const resolve = accounts.resolveSession; accounts.resolveSession = (...args) => { if (fault.session) throw new Error("Synthetischer Auth-Ausfall"); return resolve(...args); };
  const getProfile = storage.getProfile; storage.getProfile = (...args) => { if (fault.profile) throw new Error("Synthetischer Profilspeicher-Ausfall"); return getProfile(...args); };
  const counters = { provider: 0, mail: 0, blockedFetch: 0, unexpectedRoutes: 0 };
  const ai = require(path.join(clone, "lib/helmut/ai"));
  ai.requestText = async () => { counters.provider++; throw new Error("Provider gesperrt"); };
  require(path.join(clone, "lib/helmut/invite-mail")).sendAccessMail = async () => { counters.mail++; throw new Error("Mail gesperrt"); };
  proof.blockedFetchOrigins = [];
  globalThis.fetch = async () => { counters.blockedFetch++; proof.blockedFetchOrigins.push(new Error().stack.split("\n").slice(2, 6).map(line => line.replace(clone, "<isolated-backend>"))); throw new Error("Externer Abruf gesperrt"); };
  const handler = require(path.join(clone, "server.js"));
  const protectedGets = ["/api/briefing/run", "/api/crawl/run", "/api/pipeline/run", "/api/lage/check", "/api/lage/briefing", "/api/push/test"];
  const allowed = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/security/csrf", "/api/app/start", "/api/profile/current", "/api/briefing/latest", "/api/communication/generate", "/api/office/generate", "/api/admin/users", "/api/admin/customers", "/api/admin/overview", ...protectedGets]);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (!allowed.has(url.pathname) && !/^\/api\/admin\/users\/[a-z0-9-]+$/.test(url.pathname)) {
      counters.unexpectedRoutes++; res.writeHead(404); return res.end();
    }
    Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  async function send(url, { method = "GET", body, cookie = "", csrf = "", agent = "integration" } = {}) {
    assert.ok(url.startsWith("/api/"));
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path: url, method, headers: { Accept: "application/json", "User-Agent": agent, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", chunk => text += chunk); res.on("end", () => {
          let json; try { json = JSON.parse(text); } catch { return reject(new Error("Antwort ist kein JSON")); }
          proof.requests.push({ method, path: url, status: res.statusCode });
          resolve({ status: res.statusCode, headers: res.headers, json });
        });
      });
      req.setTimeout(10000, () => req.destroy(new Error("Lokales HTTP-Zeitlimit"))); req.on("error", reject); req.end(payload);
    });
  }
  const check = async (name, fn) => { await fn(); proof.checks.push({ name, status: "PASS" }); console.log("PASS " + name); };
  async function login(email) { const r = await send("/api/auth/login", { method: "POST", body: { email, password } }); assert.equal(r.status, 200); return r.headers["set-cookie"][0].split(";")[0]; }
  let adminCookie, memberCookie, staffCookie, emptyCookie, csrf;
  try {
    await check("Anmeldung und anonyme Sitzung: echte Antworten und Cookie-Schutz", async () => {
      assert.deepEqual((await send("/api/auth/session")).json, { authenticated: false });
      assert.equal((await send("/api/app/start")).status, 401);
      assert.equal((await send("/api/auth/login", { method: "POST", body: { email: "alpha@integration.invalid", password: "wrong-local-password" } })).status, 401);
      const r = await send("/api/auth/login", { method: "POST", body: { email: "alpha@integration.invalid", password } });
      assert.equal(r.status, 200); assert.match(r.headers["set-cookie"][0], /HttpOnly; SameSite=Lax; Path=\/; Max-Age=[1-9]/);
      memberCookie = r.headers["set-cookie"][0].split(";")[0]; adminCookie = await login("admin@integration.invalid");
      staffCookie = await login("staff@integration.invalid"); emptyCookie = await login("empty@integration.invalid");
      csrf = (await send("/api/security/csrf", { cookie: memberCookie })).json.token; assert.ok(csrf);
    });
    await check("Sessionverlaengerung schreibt nur die eigene synthetische Sitzung", async () => {
      const store = await storage.readAuthStore(); const session = store.sessions.find(s => s.userId === member.id);
      session.expiresAt = new Date(Date.now() + 7200000).toISOString(); await storage.writeAuthStore(store);
      const before = session.expiresAt; const r = await send("/api/auth/session", { cookie: memberCookie });
      assert.equal(r.status, 200); assert.equal(r.json.authenticated, true); assert.equal(r.json.user.id, member.id);
      assert.deepEqual(r.json.profiles.map(p => p.id), [alpha]); assert.ok(r.headers["set-cookie"]);
      const after = await storage.readAuthStore(); assert.ok(after.sessions.find(s => s.userId === member.id).expiresAt > before);
    });
    await check("Appstart liefert echte Profil-, Aufgaben-, Notiz- und Bereichsvertraege", async () => {
      const r = await send(`/api/app/start?politicianId=${alpha}`, { cookie: memberCookie });
      assert.equal(r.status, 200); assert.equal(r.json.profile.id, alpha); assert.ok(r.json.profile.profilValidierung);
      assert.equal(r.json.tasks[0].politicianId, alpha); assert.equal(r.json.notes[0].user_id, alpha);
      assert.equal(r.json.aiStatus.enabled, false); assert.ok(r.json.version);
      assert.ok(r.json.briefing.currentHelmutState);
      // Der vorhandene echte Leerpfad hat absichtlich keine kuratierte Anzeige.
      // Keine Rohkandidaten in eine positive Radar-Anzeige umdeuten.
      const radar = r.json.briefing.currentRadarState; assert.ok(radar);
      assert.equal(radar.status, "empty"); assert.deepEqual(radar.mentions, []); assert.deepEqual(radar.articles, []);
      assert.ok(r.json.briefing.lageBriefing); assert.equal(r.json.briefing.lageBriefing.available, false);
      assert.ok(r.json.briefing.lageBriefing.reason); proof.startShape = { keys: Object.keys(r.json), lage: r.json.briefing.lageBriefing.reason, radar: radar.status, radarAnzeigePresent: Boolean(radar.anzeige), helmut: r.json.briefing.currentHelmutState.status };
      const direct = await send(`/api/briefing/latest?politicianId=${alpha}`, { cookie: memberCookie });
      assert.equal(direct.status, 200); assert.ok(direct.json.currentHelmutState); assert.equal(direct.json.profile, undefined);
    });
    await check("Mandantentrennung fuer Mitglied und Referent; fehlende Zuweisung bleibt403", async () => {
      for (const cookie of [memberCookie, staffCookie]) {
        const r = await send(`/api/app/start?politicianId=${beta}`, { cookie }); assert.equal(r.status, 200);
        assert.equal(r.json.profile.id, alpha); assert.ok(!JSON.stringify(r.json).includes(beta));
        assert.equal((await send("/api/admin/users", { cookie })).status, 403);
      }
      const r = await send("/api/app/start", { cookie: emptyCookie }); assert.equal(r.status, 403); assert.equal(r.json.reason, "no-mandate");
    });
    await check("CSRF blockiert alle sechs schreibfaehigen GETs und beide Buero-POSTs", async () => {
      for (const url of protectedGets) { const r = await send(url, { cookie: memberCookie }); assert.equal(r.status, 403); assert.equal(r.json.error, "CSRF token missing or invalid"); }
      for (const url of ["/api/communication/generate", "/api/office/generate"]) assert.equal((await send(url, { method: "POST", cookie: memberCookie, body: {} })).status, 403);
      assert.equal((await send(`/api/profile/current?politicianId=${alpha}`, { method: "PATCH", cookie: memberCookie, csrf: csrf + "x", body: { fullName: "Unzulaessig" } })).status, 403);
      assert.equal((await storage.getProfile(alpha)).fullName, "Fiktives Profil Alpha");
    });
    await check("Profilpflege erzwingt die Sitzungskennung trotz fremder URL und Body-ID", async () => {
      const r = await send(`/api/profile/current?politicianId=${beta}`, { method: "PATCH", cookie: memberCookie, csrf, body: { id: beta, fullName: "Fiktives Profil Alpha bearbeitet" } });
      assert.equal(r.status, 200); assert.equal(r.json.id, alpha); assert.ok(r.json.profilValidierung);
      assert.equal((await storage.getProfile(beta)).fullName, "Fiktives Profil Beta");
      assert.equal((await storage.getProfile(alpha)).profileActive, false);
    });
    await check("Original-Verwaltungsadapter legt reales gesperrtes Kundenkonto ohne Mail an", async () => {
      const { createAdminActions } = await import(path.join(root, "verwaltung/original-actions.mjs"));
      const actions = createAdminActions({ fetcher: async (url, init = {}) => {
        const r = await send(url, { method: init.method, cookie: adminCookie, csrf: init.headers?.["X-CSRF-Token"] || init.headers?.["x-csrf-token"], body: init.body ? JSON.parse(init.body) : undefined });
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
      } });
      const result = await actions.createCustomerAccount({ customerName: "Fiktive Kundenorganisation", person: "Fiktive Kontaktperson", email: "new@integration.invalid", tariffIntent: "Basis" });
      proof.customerAdapterResultKeys = Object.keys(result); const user = await accounts.getUserByEmailRaw("new@integration.invalid");
      assert.ok(user); assert.equal(user.active, false); assert.equal(user.role, "abgeordneter"); assert.ok(!user.passwordHash);
      assert.equal(user.customer.pricePerMonth, null); assert.equal(user.customer.paymentStatus, "none");
      assert.equal((await send("/api/auth/login", { method: "POST", body: { email: user.email, password } })).status, 401);
      const store = await storage.readAuthStore(); assert.equal((store.passwordTokens || []).length, 0);
    });
    await check("Kommunikations-POST bleibt regelbasiert und ist kein persistierter KI-Entwurf", async () => {
      const r = await send(`/api/communication/generate?politicianId=${alpha}`, { method: "POST", cookie: memberCookie, csrf, body: { prompt: "Nur synthetischer lokaler Test", channel: "press", decision: { title: "Fiktiver Testanlass", statement: "Fiktive Testposition" } } });
      assert.equal(r.status, 200); assert.equal(r.json.aiEnabled, false); assert.equal(r.json.degraded, true);
      assert.equal(typeof r.json.text, "string"); assert.ok(r.json.text); assert.ok(r.json.sourceNote); assert.ok(r.json.fallbackReason);
      assert.equal(r.json.id, undefined); proof.communication = { channel: r.json.channel, fallbackReason: r.json.fallbackReason, persistedId: false };
    });
    await check("Native Office-API verlangt eigene DTO/Kanaele und prueft Flag sowie fertiges KO", async () => {
      const sendOffice = body => send(`/api/office/generate?politicianId=${alpha}`, { method: "POST", cookie: memberCookie, csrf, body });
      assert.equal((await sendOffice({ prompt: "Fiktiv", channel: "press", decision: {} })).status, 400);
      assert.equal((await sendOffice({ vorgangId: "synthetic-vorgang", outputType: "press" })).status, 400);
      const disabled = await sendOffice({ vorgangId: "synthetic-vorgang", outputType: "pressemitteilung" });
      assert.equal(disabled.status, 200); assert.deepEqual(disabled.json, { skipped: true, reason: "office-disabled" });
      process.env.HELMUT_V3_OFFICE = "1";
      try { const missing = await sendOffice({ vorgangId: "synthetic-vorgang", outputType: "pressemitteilung" }); assert.equal(missing.status, 200); assert.deepEqual(missing.json, { skipped: true, reason: "ko-not-ready" }); }
      finally { delete process.env.HELMUT_V3_OFFICE; }
    });
    await check("Echte Serverfehler: Auth503 und Profil500 liefern keine fremden Daten", async () => {
      fault.session = true;
      try { assert.equal((await send("/api/auth/session", { cookie: memberCookie })).status, 503); } finally { fault.session = false; }
      fault.profile = true;
      try { const r = await send(`/api/app/start?politicianId=${alpha}`, { cookie: memberCookie }); assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.json).includes(beta)); } finally { fault.profile = false; }
    });
    await check("Abmeldung entwertet die echte lokale Sitzung", async () => {
      const r = await send("/api/auth/logout", { method: "POST", cookie: memberCookie }); assert.equal(r.status, 200); assert.match(r.headers["set-cookie"][0], /Max-Age=0/);
      assert.deepEqual((await send("/api/auth/session", { cookie: memberCookie })).json, { authenticated: false });
      assert.equal((await send("/api/app/start", { cookie: memberCookie })).status, 401);
    });
    assert.equal(counters.provider, 0); assert.equal(counters.mail, 0); assert.equal(counters.unexpectedRoutes, 0);
    // Kein Aufruf dieses Ersatzes gelangt zum Netz. Versuche bleiben im Beleg sichtbar.
    proof.externalFetchForwarded = 0;
    for (const profile of await storage.listFullProfiles()) assert.equal(profile.profileActive, false);
    proof.status = "PASS_BACKEND_HTTP_ONLY";
  } catch (error) { proof.status = "FAIL_BACKEND_HTTP"; proof.error = { message: String(error.message), stack: String(error.stack).split("\n").slice(0, 5) }; process.exitCode = 1; }
  finally {
    await new Promise(resolve => server.close(resolve)); proof.counters = counters; proof.accountsSha256 = accountHash;
    proof.runtimeHashes = hashes(clone); proof.time = new Date().toISOString(); proof.testSha256 = sha(fs.readFileSync(__filename));
    fs.writeFileSync(output, JSON.stringify(proof, null, 2) + "\n"); console.log(JSON.stringify({ status: proof.status, checks: proof.checks.length, requests: proof.requests.length, error: proof.error?.message }));
  }
}
function main() {
  guard(); assert.equal(root, "/workspace/helmut-claude-backend-isolated");
  const evidence = process.env.HELMUT_INTEGRATION_EVIDENCE; assert.ok(evidence?.startsWith("/workspace/helmut-claude-backend-evidence/integration-"));
  const before = hashes(root); assert.equal(before["lib/helmut/accounts.js"], accountHash);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-ui-contract-http-")), clone = path.join(temp, "backend");
  const output = path.join(evidence, "backend-ui-http-result.json");
  try {
    execFileSync("git", ["clone", "--quiet", "--shared", "--no-hardlinks", "--single-branch", "--branch", "feat/claude-backend-isolated", root, clone], { env: env() });
    fs.copyFileSync(path.join(root, "lib/helmut/accounts.js"), path.join(clone, "lib/helmut/accounts.js"));
    const result = spawnSync(process.execPath, [path.join(clone, "scripts/lokal.js"), __filename, "--worker", clone, output], { cwd: clone, env: env(), encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
    fs.writeFileSync(path.join(evidence, "backend-ui-http.log"), (result.stdout || "") + (result.stderr || ""));
    assert.deepEqual(hashes(root), before); assert.equal(result.status, 0, "HTTP-Pruefung fehlgeschlagen; Erstlog und JSON bleiben erhalten");
    console.log(result.stdout.trim());
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
if (process.argv[2] === "--worker") worker(process.argv[3], process.argv[4]).catch(error => { console.error(error); process.exitCode = 1; });
else { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
