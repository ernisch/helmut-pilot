"use strict";

// Gezielte Abnahme fuer den Session-Fix: Der Admin-Session-Endpunkt (/api/auth/session)
// baute die Profil-Switcher-Liste ueber einen seriellen N+1-Pfad (ein getProfile pro
// Mandat). Bei ~500 Profilen sind das ~500 einzelne Datenbank-Roundtrips — laenger als
// das 6-s-Fenster von fetchAuthState(), der Client erreichte /api/app/start nie.
//
// Teil A: Quelltext-Verifikation (kein getProfile im Admin-Zweig, Bulk-Read statt
// Einzel-Reads, 6-s-Timeout unveraendert).
// Teil B: echter HTTP-End-to-End-Flow gegen den echten Server mit deterministischem
// PostgREST-Ersatz (Muster profile-auth-decoupling-test.js/auth-store-cas-test.js):
// 500 synthetische Profile, Admin/MdB/Referent, Request-Zaehlung auf dem Profilpfad.

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("fs");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

(async () => {
  // -------------------------------------------------------------------------
  // Teil A: Quelltext-Verifikation
  // -------------------------------------------------------------------------
  console.log("== Teil A: Quelltext-Verifikation ==");
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");

  const fnSrc = (serverSrc.match(/async function listAllowedProfiles\([\s\S]*?\n\}\n/) || [""])[0];
  const adminZweig = (fnSrc.match(/if \(allowed === "all"\) \{[\s\S]*?\n    \}\n/) || [""])[0];
  check("A1. listAllowedProfiles gefunden und Admin-Zweig extrahiert", fnSrc.length > 50 && adminZweig.length > 50);
  check("A2. Admin-Zweig nutzt den Bulk-Read listFullProfiles", /listFullProfiles\s*\(/.test(adminZweig));
  check("A3. Admin-Zweig enthaelt KEINEN seriellen getProfile-Aufruf mehr", !/getProfile\s*\(/.test(adminZweig));
  check("A4. Nicht-Admin-Pfad (Abgeordneter/Referent) behaelt getProfile fuer die erlaubten Mandate",
    (() => {
      const rest = fnSrc.slice(fnSrc.indexOf("return result;", fnSrc.indexOf("if (allowed === \"all\")")) + 1);
      return /getProfile\s*\(/.test(rest);
    })());
  const fetchAuthStateSrc = (clientSrc.match(/async function fetchAuthState\(\)[\s\S]*?\n\}\n/) || [""])[0];
  check("A5. fetchAuthState behaelt den 6-s-Timeout (kein pauschales Anheben)",
    /6000/.test(fetchAuthStateSrc) && !/60000/.test(fetchAuthStateSrc));

  // -------------------------------------------------------------------------
  // Teil B: HTTP-End-to-End mit deterministischem PostgREST-Ersatz
  // -------------------------------------------------------------------------
  console.log("\n== Teil B: HTTP-End-to-End (500 synthetische Profile) ==");

  const accounts = require("../lib/helmut/accounts");

  // 500 synthetische Profile (klar kuenstlich, keine realen Daten).
  const profilesById = new Map();
  for (let i = 1; i <= 500; i += 1) {
    const id = `test-mandat-${String(i).padStart(3, "0")}`;
    profilesById.set(id, {
      id,
      name: `Test Mandat ${i}`,
      mandate_profiles: [{ user_id: id, partei: "Testpartei", aktiv: true, politische_ebene: "bundestag" }]
    });
  }

  // Auth-Store-Blob (main-auth) mit drei synthetischen Konten.
  const adminPw = accounts.hashPassword("admin-pass-123");
  const mdbPw = accounts.hashPassword("mdb-pass-123");
  const refPw = accounts.hashPassword("ref-pass-123");
  let blob = {
    users: [
      { id: "admin-1", email: "admin@test.invalid", name: "Test Admin", role: "admin", active: true, ...adminPw },
      { id: "mdb-1", email: "mdb@test.invalid", name: "Test MdB", role: "abgeordneter", politicianId: "test-mandat-001", active: true, ...mdbPw },
      { id: "ref-1", email: "ref@test.invalid", name: "Test Referent", role: "referent", active: true, ...refPw }
    ],
    sessions: [],
    assignments: [{ userId: "ref-1", politicianId: "test-mandat-002" }],
    auditEvents: [],
    systemErrors: [],
    llmUsage: []
  };
  let profileListCalls = 0;
  let profileSingleCalls = 0;

  function response(status, payload) {
    const text = payload === undefined ? "" : JSON.stringify(payload);
    return { ok: status < 400, status, statusText: "Testantwort", text: async () => text };
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url);
    assert.equal(u.hostname, "example.invalid");
    const method = options.method || "GET";
    if (u.pathname === "/rest/v1/helmut_store") {
      if (method === "GET") return response(200, blob ? [{ data: blob }] : []);
      if (method === "PATCH") {
        const expected = u.searchParams.get("data->>_authStoreRevision");
        const current = blob?._authStoreRevision;
        if (!blob || (current == null ? expected !== "is.null" : expected !== `eq.${current}`)) return response(200, []);
        const value = JSON.parse(options.body);
        blob = value.data;
        return response(200, [{ id: "main-auth" }]);
      }
      return response(409, { message: "duplicate key" });
    }
    if (u.pathname === "/rest/v1/profiles") {
      const search = u.searchParams.toString();
      const idMatch = /id=eq\.([^&]+)/.exec(search);
      if (idMatch) {
        profileSingleCalls += 1;
        const row = profilesById.get(decodeURIComponent(idMatch[1]));
        return response(200, row ? [row] : []);
      }
      profileListCalls += 1;
      return response(200, [...profilesById.values()]);
    }
    // Alle uebrigen REST-Endpunkte: tolerant leer (kein echter Netzwerkzugriff).
    return response(200, method === "GET" ? [] : [{ id: "ok" }]);
  };

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
  async function login(port, email, password) {
    const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
    const cookie = String(res.headers["set-cookie"] || "").split(";")[0];
    return { status: res.status, cookie };
  }

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    // --- Admin: ein Bulk-Read, keine Einzel-Reads, alle 500 Mandate, nur {id, name} ---
    const admin = await login(port, "admin@test.invalid", "admin-pass-123");
    check("B1. Admin-Login erfolgreich (200 + Cookie)", admin.status === 200 && Boolean(admin.cookie), `status=${admin.status}`);
    profileListCalls = 0; profileSingleCalls = 0;
    const adminSession = await req(port, "GET", "/api/auth/session", { headers: { Cookie: admin.cookie } });
    const adminJson = parse(adminSession.body);
    check("B2. Admin-Session erfolgreich (200, authenticated)", adminSession.status === 200 && adminJson.authenticated === true);
    check("B3. Admin: genau EIN Profil-Bulk-Read und NULL Einzel-Reads (kein N+1)",
      profileListCalls === 1 && profileSingleCalls === 0, `list=${profileListCalls} single=${profileSingleCalls}`);
    check("B4. Admin erhaelt alle 500 erlaubten Mandate",
      adminJson.allowedPoliticians === "all" && Array.isArray(adminJson.profiles) && adminJson.profiles.length === 500,
      `profiles=${adminJson.profiles && adminJson.profiles.length}`);
    check("B5. Session-Antwort traegt je Mandat NUR { id, name } (keine Vollprofile)",
      Array.isArray(adminJson.profiles) && adminJson.profiles.every((entry) => Object.keys(entry).join(",") === "id,name"),
      adminJson.profiles ? JSON.stringify(adminJson.profiles[0]) : "");
    check("B6. Alle 500 Mandats-IDs und Namen korrekt",
      Array.isArray(adminJson.profiles)
        && new Set(adminJson.profiles.map((entry) => entry.id)).size === 500
        && adminJson.profiles.every((entry) => entry.name === `Test Mandat ${Number(entry.id.split("-").pop())}`));

    // --- Abgeordneter: weiterhin ausschliesslich das eigene Mandat ---
    const mdb = await login(port, "mdb@test.invalid", "mdb-pass-123");
    check("B7. MdB-Login erfolgreich", mdb.status === 200 && Boolean(mdb.cookie));
    profileListCalls = 0; profileSingleCalls = 0;
    const mdbSession = await req(port, "GET", "/api/auth/session", { headers: { Cookie: mdb.cookie } });
    const mdbJson = parse(mdbSession.body);
    check("B8. Abgeordneter erhaelt NUR sein eigenes Mandat",
      Array.isArray(mdbJson.profiles) && mdbJson.profiles.length === 1 && mdbJson.profiles[0].id === "test-mandat-001"
      && mdbJson.profiles[0].name === "Test Mandat 1", JSON.stringify(mdbJson.profiles));
    check("B9. Abgeordneter: erlaubte Liste bleibt exakt [eigenes Mandat]",
      Array.isArray(mdbJson.allowedPoliticians) && mdbJson.allowedPoliticians.join(",") === "test-mandat-001");

    // --- Referent: weiterhin ausschliesslich zugewiesene Mandate (kein Cross-Tenant) ---
    const ref = await login(port, "ref@test.invalid", "ref-pass-123");
    check("B10. Referent-Login erfolgreich", ref.status === 200 && Boolean(ref.cookie));
    profileListCalls = 0; profileSingleCalls = 0;
    const refSession = await req(port, "GET", "/api/auth/session", { headers: { Cookie: ref.cookie } });
    const refJson = parse(refSession.body);
    check("B11. Referent erhaelt NUR sein zugewiesenes Mandat (kein Cross-Tenant-Leck)",
      Array.isArray(refJson.profiles) && refJson.profiles.length === 1 && refJson.profiles[0].id === "test-mandat-002",
      JSON.stringify(refJson.profiles));
    check("B12. Referent: Einzel-Read nur fuer die zugewiesenen Mandate (Pfad unveraendert)",
      profileSingleCalls >= 1 && profileListCalls === 0, `list=${profileListCalls} single=${profileSingleCalls}`);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
