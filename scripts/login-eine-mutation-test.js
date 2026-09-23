"use strict";

// Gezielte Abnahme fuer den Login-Fix "eine einzige atomare Kontospeicher-Mutation":
// Ein erfolgreicher Login legt Session, Login-Statistik und Audit-Event in EINEM
// CAS-Lese-Schreib-Zyklus an, statt drei getrennter Zyklen gegen den inzwischen
// grossen main-auth Blob (Production ~822 KB, 500 Nutzer).
//
// Teil A: echter accounts/storage-Pfad mit deterministischem PostgREST-Ersatz
// (Muster auth-store-cas-test.js) — beweist die ANZAHL der Mutationen und den
// CAS-Schutz, ohne echte Datenbank.
// Teil B: echter HTTP-End-to-End-Flow gegen den echten Server im lokalen Modus
// (Muster passwort-setzen-login-fix-test.js) — beweist Cookie, Session-Aufloesung,
// Statistik, Audit, 401-Faelle und dass keine Geheimnisse die Antwort verlassen.

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("fs");
const root = path.join(__dirname, "..");

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// ---------------------------------------------------------------------------
// Teil A: deterministischer PostgREST-Ersatz (kein echter Netzwerkzugriff)
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;
let blob;
let calls;
let conflictOnce;

function response(status, payload) {
  const text = payload === undefined ? "" : JSON.stringify(payload);
  return { ok: status < 400, status, statusText: "Testantwort", text: async () => text };
}
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  assert.equal(u.hostname, "example.invalid");
  assert.equal(u.pathname, "/rest/v1/helmut_store");
  const method = options.method || "GET";
  calls.push({ method });
  if (method === "GET") return response(200, blob ? [{ data: blob }] : []);
  const value = JSON.parse(options.body);
  if (method === "PATCH") {
    assert.equal(u.searchParams.get("id"), "eq.main-auth");
    if (conflictOnce) {
      conflictOnce = false;
      blob = { ...blob, _authStoreRevision: require("node:crypto").randomUUID(), systemErrors: [{ id: "peer" }] };
    }
    const expected = u.searchParams.get("data->>_authStoreRevision");
    const current = blob?._authStoreRevision;
    if (!blob || (current == null ? expected !== "is.null" : expected !== `eq.${current}`)) return response(200, []);
  } else {
    assert.equal(method, "POST");
    if (blob) return response(409, { message: "duplicate key" });
  }
  blob = value.data;
  return response(200, [{ id: "main-auth" }]);
};

function newAccount(email) {
  return accounts.createUser({ email, name: "Testkonto", role: "admin", password: "sicher-genug-1" });
}

(async () => {
  try {
    console.log("== Teil A: eine Mutation, CAS-Schutz, Token-Sicherheit ==");

    blob = { users: [] }; calls = []; conflictOnce = false;
    const accountA1 = await newAccount("login-a1@example.org");
    calls = [];
    const { token, ttlSeconds } = await accounts.loginUser(accountA1.id, {
      ip: "127.0.0.1", userAgent: "test-agent", email: accountA1.email
    });
    check("A1. loginUser braucht genau EINE Mutation (1 Lesen + 1 Schreiben)",
      calls.filter((c) => c.method === "GET").length === 1 && calls.filter((c) => c.method === "PATCH").length === 1,
      `GET=${calls.filter((c) => c.method === "GET").length} PATCH=${calls.filter((c) => c.method === "PATCH").length}`);
    check("A1. Session angelegt (nur tokenHash im Store, userId korrekt)",
      blob.sessions.length === 1 && blob.sessions[0].userId === accountA1.id && Boolean(blob.sessions[0].tokenHash));
    check("A1. Login-Statistik genau einmal erhoeht", blob.users[0].loginCount === 1 && blob.users[0].openCount === 1);
    check("A1. lastLoginAt/lastSeenAt gesetzt", Boolean(blob.users[0].lastLoginAt) && Boolean(blob.users[0].lastSeenAt));
    check("A1. Audit-Event auth.login genau einmal",
      blob.auditEvents.length === 1 && blob.auditEvents[0].action === "auth.login"
      && blob.auditEvents[0].userId === accountA1.id && blob.auditEvents[0].actorEmail === accountA1.email);
    check("A1. Rueckgabe traegt Rohtoken und TTL", typeof token === "string" && token.length >= 32 && Number(ttlSeconds) > 0);

    blob = { users: [] }; calls = []; conflictOnce = false;
    const accountA2 = await newAccount("login-a2@example.org");
    const first = await accounts.loginUser(accountA2.id, { email: accountA2.email });
    const second = await accounts.loginUser(accountA2.id, { email: accountA2.email });
    check("A2. Zwei Logins erzeugen zwei verschiedene kryptografische Tokens", first.token !== second.token);
    check("A2. Rohtoken gelangt nie in den Store", !JSON.stringify(blob).includes(first.token) && !JSON.stringify(blob).includes(second.token));
    check("A2. Zwei Sessions, beide nur mit Hash", blob.sessions.length === 2 && blob.sessions.every((s) => Boolean(s.tokenHash)));

    blob = { users: [] }; calls = []; conflictOnce = false;
    const accountA3 = await newAccount("login-a3@example.org");
    calls = []; conflictOnce = true;
    const conflicted = await accounts.loginUser(accountA3.id, { email: accountA3.email });
    check("A3. CAS-Konflikt wird wiederholt und liefert trotzdem Erfolg", Boolean(conflicted.token)
      && calls.filter((c) => c.method === "PATCH").length === 2, `PATCH=${calls.filter((c) => c.method === "PATCH").length}`);
    check("A3. Effekte nach Konflikt genau einmal (keine Doppel-Zaehlung)",
      blob.users[0].loginCount === 1 && blob.sessions.length === 1
      && blob.auditEvents.filter((e) => e.action === "auth.login").length === 1);

    blob = { users: [] }; calls = []; conflictOnce = false;
    const accountA4 = await newAccount("login-a4@example.org");
    calls = [];
    const sessionToken = await accounts.createSession(accountA4.id, { ip: "127.0.0.1", userAgent: "ua" });
    check("A4. createSession bleibt unveraendert (je eine Mutation)",
      Boolean(sessionToken.token) && calls.filter((c) => c.method === "GET").length === 1 && calls.filter((c) => c.method === "PATCH").length === 1);
    calls = [];
    await accounts.markLogin(accountA4.id);
    check("A4. markLogin bleibt unveraendert (eine Mutation, loginCount 1)",
      calls.filter((c) => c.method === "PATCH").length === 1 && blob.users[0].loginCount === 1);
    calls = [];
    await accounts.recordAudit({ action: "test.event", userId: accountA4.id });
    check("A4. recordAudit bleibt unveraendert (eine Mutation, neuestes Event zuerst)",
      calls.filter((c) => c.method === "PATCH").length === 1 && blob.auditEvents[0].action === "test.event");

    globalThis.fetch = originalFetch;
  } catch (error) {
    globalThis.fetch = originalFetch;
    console.error(error);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // Teil B: echter HTTP-End-to-End-Flow im lokalen Modus
  // ---------------------------------------------------------------------------
  console.log("\n== Teil B: HTTP-End-to-End gegen echten Server (lokaler Store) ==");
  process.env.HELMUT_STORAGE_BACKEND = "local";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const dataDir = path.join(root, ".helmut-data");
  const snapshots = new Map();
  if (fs.existsSync(dataDir)) {
    for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
  }
  function restoreStore() {
    try {
      if (!fs.existsSync(dataDir)) return;
      for (const f of fs.readdirSync(dataDir)) { if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f)); }
      for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
    } catch (_) { /* best effort */ }
  }
  process.on("exit", restoreStore);

  const handler = require("../server.js");

  function req(port, method, reqPath, { headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
      const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
        ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
        ...headers
      }, timeout: 20000 }, (res) => {
        let out = ""; res.on("data", (c) => { out += c; }); res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
      });
      r.on("error", reject);
      r.on("timeout", () => { r.destroy(new Error("timeout")); });
      if (data != null) r.write(data);
      r.end();
    });
  }
  function parse(body) { try { return JSON.parse(body); } catch (_) { return {}; } }

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "login-e2e@example.org", name: "E2E Nutzer", role: "admin", password: "sicher-genug-1" });
    const beforeStore = await storage.readAuthStore();
    const beforeUser = beforeStore.users.find((u) => u.email === "login-e2e@example.org");
    const beforeLogins = Number(beforeUser.loginCount) || 0;
    const beforeOpens = Number(beforeUser.openCount) || 0;
    const beforeAudits = beforeStore.auditEvents.filter((e) => e.action === "auth.login" && e.userId === beforeUser.id).length;

    const res = await req(port, "POST", "/api/auth/login", { body: { email: "login-e2e@example.org", password: "sicher-genug-1" } });
    check("B1. Erfolgreicher Login (200)", res.status === 200, `status=${res.status}`);
    const cookieHeader = String(res.headers["set-cookie"] || "");
    check("B1. Session-Cookie korrekt (HttpOnly, SameSite=Lax, Path=/)",
      /HttpOnly/.test(cookieHeader) && /SameSite=Lax/.test(cookieHeader) && /Path=\//.test(cookieHeader), cookieHeader);
    const cookie = cookieHeader.split(";")[0];
    check("B1. Antwort traegt kein Passwortmaterial und kein Rohtoken (nur oeffentliche Nutzerfelder)",
      !/passwordHash|passwordSalt|token/.test(res.body), res.body);

    const afterStore = await storage.readAuthStore();
    const afterUser = afterStore.users.find((u) => u.email === "login-e2e@example.org");
    check("B2. Login-Statistik genau einmal erhoeht",
      Number(afterUser.loginCount) === beforeLogins + 1 && Number(afterUser.openCount) === beforeOpens + 1,
      `loginCount=${afterUser.loginCount} openCount=${afterUser.openCount}`);
    check("B2. lastLoginAt/lastSeenAt gesetzt", Boolean(afterUser.lastLoginAt) && Boolean(afterUser.lastSeenAt));
    check("B2. Audit-Event auth.login genau einmal",
      afterStore.auditEvents.filter((e) => e.action === "auth.login" && e.userId === afterUser.id).length === beforeAudits + 1);

    const session = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: cookie } })).body);
    check("B3. Session wird anschliessend serverseitig aufgeloest (authenticated:true)", session.authenticated === true);
    const logoutRes = await req(port, "POST", "/api/auth/logout", { headers: { Cookie: cookie } });
    const afterLogout = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: cookie } })).body);
    check("B3. Nach Abmelden ist die Session ungueltig", logoutRes.status === 200 && afterLogout.authenticated === false);

    const wrongPw = await req(port, "POST", "/api/auth/login", { body: { email: "login-e2e@example.org", password: "falsches-passwort-x" } });
    check("B4. Falsches Passwort bleibt 401", wrongPw.status === 401, `status=${wrongPw.status}`);

    await accounts.createUser({ email: "gesperrt@example.org", name: "Gesperrt", role: "admin", password: "sicher-genug-1", active: false });
    const disabledLogin = await req(port, "POST", "/api/auth/login", { body: { email: "gesperrt@example.org", password: "sicher-genug-1" } });
    check("B4. Deaktivierter Nutzer bleibt gesperrt (401, keine Session)",
      disabledLogin.status === 401 && !disabledLogin.headers["set-cookie"], `status=${disabledLogin.status}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
