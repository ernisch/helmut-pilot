"use strict";

// Regression (Production-Befund 2026-09-30): Im Account-Modus
// (HELMUT_AUTH_MODE=accounts) wurde der bestehende, secret-geschuetzte
// Admin-/Debug-Bypass (HELMUT_ADMIN_SECRET, ersatzweise CRON_SECRET) erst NACH dem
// Session-Gate ausgewertet. Ein korrekter Bearer-Admin fiel deshalb an
// /api/ops/status in 401, obwohl derselbe Bypass im Legacy-Modus funktioniert.
//
// Der Fix laesst GENAU diesen vorhandenen Bypass auch im Account-Modus zu und nutzt
// fuer eine explizit angeforderte politicianId dieselbe Mandatsaufloesung wie der
// bestehende Legacy-Admin-Bypass. Keine neue Auth-/Headerlogik; ohne gueltiges
// Secret bleibt es beim Session-Schutz (401) und es gibt keine fremde
// Standardzuordnung.
//
// Rein in-process gegen den ECHTEN Handler (Muster wie scripts/b055-einzelroute-test.js):
// kein Port, kein Netz, kein Supabase, kein KI-Call, lokaler Dateispeicher mit
// Snapshot/Restore. Der Bypass-Wert ist ein erkennbarer Testwert, kein Secret.

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

// Deterministischer Offline-Ausgangszustand.
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_AUTH_MODE = "accounts";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.PILOT_SECRET;               // Legacy-Gate bleibt lokal offen
delete process.env.CRON_SECRET;                // nur HELMUT_ADMIN_SECRET zaehlt hier
delete process.env.HELMUT_ALLOW_QUERY_SECRETS; // Bearer-only, kein Query-Secret
const SENTINEL_SECRET = "test-admin-secret-9f3c1d"; // KEIN echtes Secret
const WRONG_SECRET = "test-admin-secret-000000";
process.env.HELMUT_ADMIN_SECRET = SENTINEL_SECRET;

const A = "mdb-alpha-synthetic";
const B = "mdb-beta-synthetic";

// Store-Hermetik: alles Wiederherstellen, was dieser Test anfasst.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json", `p-${A}.json`, `p-${B}.json`];
const snapshot = new Map(GUARDED.map((name) => {
  const file = path.join(dataDir, name);
  return [file, fs.existsSync(file) ? fs.readFileSync(file) : null];
}));
process.on("exit", () => {
  for (const [file, content] of snapshot) {
    try {
      if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
      else fs.writeFileSync(file, content);
    } catch (_) {}
  }
});

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");
const storage = require("../lib/helmut/storage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// In-Process-Aufruf des echten Handlers mit Minimal-Request/-Response.
function call(pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      url: pathname,
      method,
      headers: { host: "localhost", ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      on(event, cb) {
        if (event === "data" && body != null) setImmediate(() => cb(Buffer.from(body)));
        if (event === "end") setImmediate(() => cb());
        return req;
      },
      once(event, cb) { return req.on(event, cb); },
      destroy() {}
    };
    let settled = false;
    const res = {
      statusCode: 0,
      headersSent: false,
      _headers: {},
      _body: "",
      writeHead(status, hdrs) { this.statusCode = status; Object.assign(this._headers, hdrs || {}); this.headersSent = true; return this; },
      setHeader(name, value) { this._headers[String(name).toLowerCase()] = value; return this; },
      getHeader(name) { return this._headers[String(name).toLowerCase()]; },
      removeHeader(name) { delete this._headers[String(name).toLowerCase()]; },
      write(chunk) { this._body += String(chunk == null ? "" : chunk); return true; },
      end(chunk) {
        if (chunk != null) this._body += String(chunk);
        if (settled) return;
        settled = true;
        resolve({ status: this.statusCode, headers: this._headers, body: this._body });
      }
    };
    try { handler(req, res); } catch (error) { reject(error); }
    setTimeout(() => { if (!settled) { settled = true; reject(new Error(`keine Antwort fuer ${pathname}`)); } }, 20000).unref?.();
  });
}

const json = (res) => { try { return JSON.parse(res.body); } catch (_) { return {}; } };
const bearer = (token) => ({ authorization: `Bearer ${token}` });

async function login(email, password) {
  const body = JSON.stringify({ email, password });
  const res = await call("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    body
  });
  const setCookie = res.headers["Set-Cookie"] || res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(raw || "").split(";")[0];
}

(async () => {
  // Zwei synthetische, aktive Mandate: damit kann der Fallback "genau EIN aktives
  // Mandat" NIE greifen und eine heimliche Fremdzuordnung waere sofort sichtbar.
  await storage.saveProfile({ id: A, name: "Alpha Synthetic", partei: "SPD", profileActive: true });
  await storage.saveProfile({ id: B, name: "Beta Synthetic", partei: "CDU", profileActive: true });

  // Normaler Account-Nutzer (Abgeordneter) am Mandat B — fuer den Schutzvergleich.
  await accounts.createUser({
    email: "mdb-beta-synthetic@test.local", name: "MdB Beta", role: "abgeordneter",
    password: "mdb-beta-pass-123", politicianId: B
  });

  // ── (1) POSITIV: gueltiger Bearer-Admin-Bypass + explizite politicianId ──────
  const ok = await call(`/api/ops/status?politicianId=${A}`, { headers: bearer(SENTINEL_SECRET) });
  const okBody = json(ok);
  check("Account-Modus: gueltiger Bearer-Admin-Bypass erreicht /api/ops/status",
    ok.status === 200, `status=${ok.status} body=${ok.body.slice(0, 120)}`);
  check("Explizite politicianId wird als Mandat aufgeloest (kein Fremdmandat)",
    okBody.tenant && okBody.tenant.activePoliticianId === A, JSON.stringify(okBody.tenant || okBody).slice(0, 160));

  // ── (2) NEGATIV: fehlender Bypass bleibt Session-geschuetzt (401) ────────────
  const missing = await call(`/api/ops/status?politicianId=${A}`);
  check("Account-Modus: FEHLENDER Bypass bleibt 401", missing.status === 401, `status=${missing.status} body=${missing.body.slice(0, 90)}`);

  // ── (2b) NEGATIV: falsches Secret bleibt Session-geschuetzt (401) ────────────
  const wrong = await call(`/api/ops/status?politicianId=${A}`, { headers: bearer(WRONG_SECRET) });
  check("Account-Modus: FALSCHER Bypass bleibt 401", wrong.status === 401, `status=${wrong.status} body=${wrong.body.slice(0, 90)}`);

  // ── (3) FAIL-CLOSED: kein fremdes Standardmandat, Auswahl statt Zuordnung ────
  const noSelection = await call("/api/ops/status", { headers: bearer(SENTINEL_SECRET) });
  const noSelBody = json(noSelection);
  check("Account-Modus: Bypass OHNE Mandatsauswahl faellt fail-closed (mehrere aktive -> Auswahl)",
    noSelection.status === 409 && noSelBody.needsMandateSelection === true,
    `status=${noSelection.status} body=${noSelection.body.slice(0, 140)}`);
  const noSelMandateIds = Array.isArray(noSelBody.mandates) ? noSelBody.mandates.map((m) => m && m.id) : [];
  check("FAIL-CLOSED: KEINE fremde Standardzuordnung, aber beide Testmandate in der Auswahlliste",
    !noSelBody.tenant && !noSelBody.activePoliticianId && Array.isArray(noSelBody.mandates)
      && noSelMandateIds.includes(A) && noSelMandateIds.includes(B),
    `tenant=${JSON.stringify(noSelBody.tenant)} activePoliticianId=${JSON.stringify(noSelBody.activePoliticianId)} `
      + `mandatesArray=${Array.isArray(noSelBody.mandates)} mandateIds=${JSON.stringify(noSelMandateIds).slice(0, 160)}`);

  // ── (4) SCHUTZVERGLEICH: normale Account-Nutzer unveraendert ─────────────────
  const cookie = await login("mdb-beta-synthetic@test.local", "mdb-beta-pass-123");
  check("Login des normalen Nutzers liefert Session", Boolean(cookie), cookie);
  const asUser = await call(`/api/ops/status?politicianId=${A}`, { headers: { cookie } });
  const asUserBody = json(asUser);
  check("Normaler Nutzer bleibt an sein EIGENES Mandat gebunden (Query aendert nichts)",
    asUser.status === 200 && asUserBody.tenant && asUserBody.tenant.activePoliticianId === B,
    `status=${asUser.status} tenant=${JSON.stringify(asUserBody.tenant || asUserBody).slice(0, 120)}`);

  // ── (5) ABGLEICH: identisches Mandatsaufloesungs-Verhalten wie Legacy-Admin ───
  delete process.env.HELMUT_AUTH_MODE; // Legacy-Zugang (geteiltes Secret, keine Accounts)
  const legacy = await call(`/api/ops/status?politicianId=${A}`, { headers: bearer(SENTINEL_SECRET) });
  const legacyBody = json(legacy);
  check("Abgleich Legacy-Admin-Bypass: gleiche Route, gleiches Ergebnis (200, Mandat A)",
    legacy.status === 200 && legacyBody.tenant && legacyBody.tenant.activePoliticianId === A,
    `status=${legacy.status} tenant=${JSON.stringify(legacyBody.tenant || legacyBody).slice(0, 120)}`);
  check("Abgleich: Account-Modus- und Legacy-Ergebnis stimmen ueberein",
    legacy.status === ok.status && legacyBody.tenant?.activePoliticianId === okBody.tenant?.activePoliticianId);

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error("TESTFEHLER", error); process.exit(1); });
