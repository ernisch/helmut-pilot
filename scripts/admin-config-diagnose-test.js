"use strict";

// Admin-Konfigurations-Diagnose (System & Sicherheit) — Sicherheitstest. Offline,
// lokaler Datei-Store, ECHTE HTTP-Requests gegen den echten Handler (Muster wie
// p1-security-check.js). Geprueft wird das komplette Sicherheitsmodell:
//   1. Admin darf lesen (Session-Login, /api/admin/overview -> system.helmutConfig)
//   2. normaler politischer Nutzer (abgeordneter) darf NICHT lesen (403)
//   3. unangemeldeter Zugriff wird abgewiesen (401/403)
//   4. es erscheinen NUR die sieben Whitelist-Variablen (eingefrorene Liste)
//   5. Secrets (Supabase/OpenAI/Vercel/Session/Cron/Pilot) erscheinen NIEMALS im Payload
//   6. fehlende Variable -> gesetzt=false + wirksamer Code-Default
//   7. Werte landen NICHT in allgemeinen Runtime-Logs (Konsolen-Spion)
//   8. keine beliebige Parametereingabe (Builder ignoriert Fremdnamen strukturell)

const path = require("path");
const fs = require("fs");
const http = require("http");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Deterministischer Offline-Ausgangszustand (wie p1-security-check).
delete process.env.HELMUT_AUTH_MODE;
delete process.env.PILOT_SECRET;
delete process.env.HELMUT_ADMIN_SECRET;
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";

// Sentinels: eindeutig erkennbare Fake-Werte. SECRET-Sentinels duerfen NIRGENDS im
// Admin-Payload auftauchen; der WHITELIST-Sentinel muss GENAU dort auftauchen.
const SECRET_SENTINEL = "GEHEIM-SENTINEL-7f3a91";
process.env.SUPABASE_SERVICE_ROLE_KEY = `${SECRET_SENTINEL}-supabase-role`;
process.env.SUPABASE_URL = `https://${SECRET_SENTINEL}-projekt.supabase.co`;
process.env.OPENAI_API_KEY = `${SECRET_SENTINEL}-openai`;
process.env.AZURE_OPENAI_API_KEY = `${SECRET_SENTINEL}-azure`;
process.env.VERCEL_TOKEN = `${SECRET_SENTINEL}-vercel`;
process.env.CRON_SECRET = `${SECRET_SENTINEL}-cron`;
const WHITELIST_SENTINEL = "sichtbarer-testwert-42";
process.env.HELMUT_SCORING_MODE = WHITELIST_SENTINEL; // nicht geheimer Modus-Wert
delete process.env.HELMUT_UNDERSTANDING_GATE;          // fuer den Default-Fall

const handler = require(path.join(root, "server.js"));
const buildDiagnose = handler.__buildHelmutConfigDiagnose;
const accounts = require(path.join(root, "lib/helmut/accounts.js"));

const EXPECTED_NAMES = [
  "HELMUT_UNDERSTANDING_GATE", "HELMUT_PARDOK_DISPATCH", "HELMUT_MAX_LLM_CALLS_PER_DAY",
  "HELMUT_V3_STORE", "HELMUT_SCORING_MODE", "HELMUT_V3_SHADOW_COMPARE", "HELMUT_PROFILE_DB_MODE"
];

// --- A) Builder-Unit: Whitelist, Defaults, keine Fremdnamen -------------------------------
{
  const rows = buildDiagnose(process.env);
  check("A1 GENAU sieben Eintraege", rows.length === 7, `len=${rows.length}`);
  check("A2 exakt die sieben Whitelist-Namen (Reihenfolge fix)",
    JSON.stringify(rows.map((r) => r.name)) === JSON.stringify(EXPECTED_NAMES));
  const scoring = rows.find((r) => r.name === "HELMUT_SCORING_MODE");
  check("A3 gesetzte Variable zeigt den aktuellen Wert", scoring.gesetzt === true && scoring.wert === WHITELIST_SENTINEL);
  const gate = rows.find((r) => r.name === "HELMUT_UNDERSTANDING_GATE");
  check("A4 fehlende Variable: gesetzt=false, wert=null, Code-Default sichtbar",
    gate.gesetzt === false && gate.wert === null && /off/.test(gate.codeDefault));
  const json = JSON.stringify(rows);
  check("A5 KEIN Secret-Sentinel im Builder-Ergebnis", !json.includes(SECRET_SENTINEL));
  // Fremdnamen strukturell unmoeglich: env mit Secret-Keys liefert trotzdem nur die 7.
  const injected = buildDiagnose({ EVIL_WUNSCHNAME: "x", SUPABASE_SERVICE_ROLE_KEY: SECRET_SENTINEL, HELMUT_V3_STORE: "1" });
  check("A6 Builder ignoriert beliebige Fremd-/Secret-Namen im env-Objekt",
    injected.length === 7 && !JSON.stringify(injected).includes(SECRET_SENTINEL) && !JSON.stringify(injected).includes("EVIL_WUNSCHNAME"));
  // Lange Werte werden gekappt (Leitplanke).
  const long = buildDiagnose({ HELMUT_V3_STORE: "x".repeat(500) }).find((r) => r.name === "HELMUT_V3_STORE");
  check("A7 Wert-Anzeige auf 40 Zeichen gekappt", long.wert.length === 40);
}

// --- B) HTTP: Auth-Modell (unangemeldet / normaler Nutzer / Admin) ------------------------
function requestFull(server, { method = "GET", pathname, headers = {}, body = null }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}
const parse = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
async function login(server, email, password) {
  const b = JSON.stringify({ email, password });
  const r = await requestFull(server, { method: "POST", pathname: "/api/auth/login", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) }, body: b });
  return ((r.headers["set-cookie"] || [])[0] || "").split(";")[0];
}

(async () => {
  // Store-Zustand sichern/wiederherstellen (deterministisch). WICHTIG: Accounts/
  // Sessions liegen im SEPARATEN kleinen Auth-Store (.helmut-data/auth.json), nicht
  // im grossen Content-Blob (store.json) — beide sichern und leeren, sonst blockiert
  // ein Alt-Admin aus frueheren Testlaeufen den Admin-Seed ("admin-exists").
  const stateFiles = ["auth.json", "store.json"].map((name) => {
    const file = path.join(root, ".helmut-data", name);
    const existed = fs.existsSync(file);
    return { file, existed, snapshot: existed ? fs.readFileSync(file) : null };
  });
  const clearState = () => stateFiles.forEach(({ file }) => { if (fs.existsSync(file)) fs.rmSync(file); });
  const restoreStore = () => stateFiles.forEach(({ file, existed, snapshot }) => {
    if (existed) fs.writeFileSync(file, snapshot);
    else if (fs.existsSync(file)) fs.rmSync(file);
  });
  const prevEnv = { mode: process.env.HELMUT_AUTH_MODE, mail: process.env.HELMUT_ADMIN_EMAIL, pass: process.env.HELMUT_ADMIN_PASSWORD };

  try {
    clearState();
    process.env.HELMUT_AUTH_MODE = "accounts";
    process.env.HELMUT_ADMIN_EMAIL = "diagnose-admin@test.local";
    process.env.HELMUT_ADMIN_PASSWORD = "diagnose-admin-pass-123";

    const server = http.createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));

    // Konsolen-Spion: Whitelist-WERTE duerfen in keinem allgemeinen Log auftauchen.
    const logged = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    const spy = (fn) => (...a) => { logged.push(a.map(String).join(" ")); fn(...a); };

    try {
      // 3) unangemeldet -> abgewiesen
      const anon = await requestFull(server, { pathname: "/api/admin/overview" });
      check("B1 unangemeldeter Zugriff wird abgewiesen (401/403)", anon.status === 401 || anon.status === 403, `status=${anon.status}`);
      check("B1b unangemeldet: kein Whitelist-Wert im Body", !anon.body.includes(WHITELIST_SENTINEL));

      // 2) normaler politischer Nutzer -> 403
      await accounts.createUser({ email: "mdb@test.local", name: "Test MdB", role: "abgeordneter", password: "mdb-pass-123", politicianId: "cem-ince" });
      const userCookie = await login(server, "mdb@test.local", "mdb-pass-123");
      check("B2 normaler Nutzer erhaelt Session", Boolean(userCookie));
      const asUser = await requestFull(server, { pathname: "/api/admin/overview", headers: { Cookie: userCookie } });
      check("B3 normaler politischer Nutzer darf NICHT lesen (403)", asUser.status === 403, `status=${asUser.status}`);
      check("B3b normaler Nutzer: kein Whitelist-Wert im Body", !asUser.body.includes(WHITELIST_SENTINEL));

      // 1) Admin -> 200 + genau die 7 Werte
      console.log = spy(orig.log); console.warn = spy(orig.warn); console.error = spy(orig.error);
      const adminCookie = await login(server, "diagnose-admin@test.local", "diagnose-admin-pass-123");
      const asAdmin = await requestFull(server, { pathname: "/api/admin/overview", headers: { Cookie: adminCookie } });
      console.log = orig.log; console.warn = orig.warn; console.error = orig.error;

      check("B4 Admin darf lesen (200)", asAdmin.status === 200, `status=${asAdmin.status}`);
      const payload = parse(asAdmin);
      const cfg = payload && payload.system && payload.system.helmutConfig;
      check("B5 Payload enthaelt system.helmutConfig mit GENAU 7 Eintraegen", Array.isArray(cfg) && cfg.length === 7);
      check("B6 exakt die Whitelist-Namen", Array.isArray(cfg) && JSON.stringify(cfg.map((r) => r.name)) === JSON.stringify(EXPECTED_NAMES));
      check("B7 gesetzter Wert sichtbar (HELMUT_SCORING_MODE)", Array.isArray(cfg) && cfg.find((r) => r.name === "HELMUT_SCORING_MODE").wert === WHITELIST_SENTINEL);
      check("B8 fehlende Variable zeigt Code-Default (HELMUT_UNDERSTANDING_GATE)",
        Array.isArray(cfg) && cfg.find((r) => r.name === "HELMUT_UNDERSTANDING_GATE").gesetzt === false && /off/.test(cfg.find((r) => r.name === "HELMUT_UNDERSTANDING_GATE").codeDefault));
      // 5) Secrets NIE — im GESAMTEN Admin-Payload (nicht nur im Config-Block).
      check("B9 KEIN Secret-Sentinel irgendwo im gesamten Admin-Payload", !asAdmin.body.includes(SECRET_SENTINEL));
      // Umgebung wird angezeigt (deploy.environment vorhanden).
      check("B10 Umgebung im Payload (deploy.environment)", typeof payload.system.deploy.environment === "string" && payload.system.deploy.environment.length > 0);
      // 7) Werte nicht in allgemeinen Logs
      check("B11 Whitelist-WERT taucht in keinem Konsolen-Log auf", !logged.some((l) => l.includes(WHITELIST_SENTINEL)));
      check("B12 Secret-Sentinel taucht in keinem Konsolen-Log auf", !logged.some((l) => l.includes(SECRET_SENTINEL)));
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    restoreStore();
    process.env.HELMUT_AUTH_MODE = prevEnv.mode; if (prevEnv.mode === undefined) delete process.env.HELMUT_AUTH_MODE;
    process.env.HELMUT_ADMIN_EMAIL = prevEnv.mail; if (prevEnv.mail === undefined) delete process.env.HELMUT_ADMIN_EMAIL;
    process.env.HELMUT_ADMIN_PASSWORD = prevEnv.pass; if (prevEnv.pass === undefined) delete process.env.HELMUT_ADMIN_PASSWORD;
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "VERCEL_TOKEN", "CRON_SECRET", "HELMUT_SCORING_MODE"]) delete process.env[k];
  }

  // --- C) UI-Verdrahtung: Panel haengt im Admin unter „System & Sicherheit" ---------------
  {
    const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
    check("C1 client.js enthaelt renderAdminConfigDiagnose", client.includes("function renderAdminConfigDiagnose"));
    const sysBody = client.slice(client.indexOf("function renderAdminSystemBody"));
    const sysBodyFn = sysBody.slice(0, sysBody.indexOf("\nfunction ", 10));
    check("C2 renderAdminSystemBody ruft renderAdminConfigDiagnose auf", sysBodyFn.includes("renderAdminConfigDiagnose(sys)"));
    check("C3 UI liest sys.helmutConfig (Server-Whitelist, keine eigene Env-Logik im Browser)",
      client.includes("helmutConfig") && !/process\.env\.HELMUT_/.test(client));
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Admin-Konfigurations-Diagnose-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
