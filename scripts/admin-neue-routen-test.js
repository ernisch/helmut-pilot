"use strict";

// Routen-Test der neuen Admin-Leserouten (Admin-Neuaufbau 2026-07).
// Muster wie privacy-authz-test.js: echter HTTP-Server (Loopback), echter Login,
// lokales Backend, Store-Hermetik. KEIN Netz nach aussen, KEINE KI.
//
// Geprueft je neuer Route:
//  - anonym -> 401, Nicht-Admin -> 403, Admin -> 200 mit erwartetem Shape
//  - keine Sessiontokens/Token-Hashes/Passwort-Hashes in Antworten
//  - Waehrungsvertrag: Kostenfelder heissen ...Usd (keine erfundene EUR-Umrechnung)
//  - CSRF-Pflicht fuer schreibende Privacy-Aktion + Server-Confirm
//  - keine Kostenwerte im Abgeordneten-Endpoint (/api/app/start)

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

// Store-Hermetik: lokale Daten sichern und am Ende wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
function restoreStore() {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) {
      if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 20000 }, (res) => {
      let out = "";
      res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(new Error("timeout")); });
    if (data != null) r.write(data);
    r.end();
  });
}

async function login(port, email, password) {
  const res = await req(port, "POST", "/api/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${res.body.slice(0, 200)}`);
  return String(res.headers["set-cookie"][0]).split(";")[0];
}

(async () => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "admin-t@example.org", name: "Admin T", role: "admin", password: "sicher-genug-1" });
    await accounts.createUser({ email: "mdb-t@example.org", name: "MdB T", role: "abgeordneter", password: "sicher-genug-1", politicianId: "test-mandat" });
    const adminCookie = await login(port, "admin-t@example.org", "sicher-genug-1");
    const mdbCookie = await login(port, "mdb-t@example.org", "sicher-genug-1");

    const NEW_ROUTES = [
      "/api/admin/stats/budget-today",
      "/api/admin/stats/costs-per-user",
      "/api/admin/stats/process-runs",
      "/api/admin/audit",
      "/api/admin/feedback",
      "/api/admin/customers",
      "/api/admin/sources-status"
    ];

    // A) Zugriffsschutz.
    for (const route of NEW_ROUTES) {
      const anon = await req(port, "GET", route);
      check(`A ${route}: anonym -> 401`, anon.status === 401, `status=${anon.status}`);
      const mdb = await req(port, "GET", route, { headers: { Cookie: mdbCookie } });
      check(`A ${route}: Abgeordneter -> 403`, mdb.status === 403, `status=${mdb.status}`);
      const adm = await req(port, "GET", route, { headers: { Cookie: adminCookie } });
      check(`A ${route}: Admin -> 200`, adm.status === 200, `status=${adm.status}`);
    }

    // B) Shapes + Sicherheit der Antworten.
    const getJson = async (route) => JSON.parse((await req(port, "GET", route, { headers: { Cookie: adminCookie } })).body);

    const budget = await getJson("/api/admin/stats/budget-today");
    check("B budget-today: Kernfelder vorhanden", typeof budget.day === "string" && "limit" in budget && "calls" in budget && "remaining" in budget && "skipsByReason" in budget);
    check("B budget-today: Kostenfeld heisst estimatedCostUsd (USD-Vertrag)", "estimatedCostUsd" in budget && !("estimatedCostEur" in budget));
    check("B budget-today: Monat-bis-heute vorhanden oder ehrlich null", budget.monat === null || (budget.monat && typeof budget.monat.seit === "string"));

    const cpu = await getJson("/api/admin/stats/costs-per-user?days=30");
    check("B costs-per-user: perUser Array + tenantBudgets Array", Array.isArray(cpu.perUser) && Array.isArray(cpu.tenantBudgets));
    check("B costs-per-user: Parameter geklemmt (days=9999 -> max 90)", (await getJson("/api/admin/stats/costs-per-user?days=9999")).periodDays === 90);

    const pr = await getJson("/api/admin/stats/process-runs");
    check("B process-runs: processRuns Array + latestByProcess Objekt", Array.isArray(pr.processRuns) && pr.latestByProcess && typeof pr.latestByProcess === "object");
    check("B process-runs: Zeitplan aus vercel.json gelesen (crawl enthalten)", Array.isArray(pr.zeitplan) && pr.zeitplan.some((c) => c.path === "/api/cron/crawl"));

    const audit = await getJson("/api/admin/audit?limit=20");
    check("B audit: auditEvents Array mit login-Ereignis", Array.isArray(audit.auditEvents) && audit.auditEvents.some((e) => e.action === "auth.login"));

    const fb = await getJson("/api/admin/feedback");
    check("B feedback: Liste + offen-Zaehler", Array.isArray(fb.feedback) && typeof fb.offen === "number");

    const customers = await getJson("/api/admin/customers");
    check("B customers: counts + kunden + MRR-Feld", customers.counts && Array.isArray(customers.kunden) && "mrrEur" in customers);
    check("B customers: aktive Sessions als reine Anzahl (>=2 durch Logins)", typeof customers.sessionsAktiv === "number" && customers.sessionsAktiv >= 2);
    check("B customers: Abgeordneten-Konto als Kunde gelistet", customers.kunden.some((k) => k.politicianId === "test-mandat"));
    check("B customers: MRR ehrlich null ohne gepflegte Preise", customers.mrrEur === null);

    const sources = await getJson("/api/admin/sources-status");
    check("B sources-status: lokal ehrlich nicht verfuegbar + Hinweis", sources.verfuegbar === false && typeof sources.hinweis === "string");
    check("B sources-status: keine erfundenen Statuszahlen", sources.statusCounts === null && sources.problematischeWege === null);
    check("B sources-status: Watchdog aus Workflow-Datei gelesen (briefing aktiv)", sources.watchdog && sources.watchdog.briefingWatchdog && sources.watchdog.briefingWatchdog.aktiv === true);
    check("B sources-status: Health-Watch ehrlich inaktiv (Zeitplan auskommentiert)", sources.watchdog.healthWatch.aktiv === false);

    // Keine Geheimnisse in irgendeiner neuen Antwort.
    const allBodies = JSON.stringify([budget, cpu, pr, audit, fb, customers, sources]);
    check("B Sicherheit: keine passwordHash/passwordSalt/tokenHash in Antworten", !/passwordHash|passwordSalt|tokenHash/.test(allBodies));

    // C) Keine Kostenwerte in Abgeordneten-APIs (vor den Loesch-Tests, solange
    //    die Session des Abgeordneten noch existiert).
    const start = await req(port, "GET", "/api/app/start", { headers: { Cookie: mdbCookie } });
    check("C /api/app/start liefert 200 fuer Abgeordneten", start.status === 200, `status=${start.status}`);
    check("C Keine Kosten-/Tokenfelder im Abgeordneten-Start", !/estimatedCostUsd|totalCostUsd|llmUsage|priceTable/i.test(start.body));

    // D) CSRF + sichere Loeschung (bestehende Privacy-Route, vom neuen Admin genutzt).
    const del1 = await req(port, "POST", "/api/privacy/delete?politicianId=test-mandat", { headers: { Cookie: adminCookie }, body: { confirm: "DELETE" } });
    check("D privacy/delete OHNE CSRF-Token -> 403", del1.status === 403, `status=${del1.status}`);
    const csrfRes = await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } });
    const csrf = JSON.parse(csrfRes.body).token;
    check("D CSRF-Token nur mit Session beziehbar", csrfRes.status === 200 && typeof csrf === "string");
    const del2 = await req(port, "POST", "/api/privacy/delete?politicianId=test-mandat", { headers: { Cookie: adminCookie, "x-csrf-token": csrf }, body: { confirm: "falsch" } });
    check("D privacy/delete mit falschem confirm -> 400 (Server-Bestaetigung Pflicht)", del2.status === 400, `status=${del2.status}`);
    // Mandats-Aufloesung ist NIE Autorisierung aus dem Query-Parameter: ein
    // Abgeordneter wird hart auf sein EIGENES Mandat gepinnt (pickPoliticianId) —
    // ein fremdes Mandat aus der URL wird ignoriert, fremde Daten sind unerreichbar.
    const mdbDelete = await req(port, "POST", "/api/privacy/delete?politicianId=fremdes-mandat", { headers: { Cookie: mdbCookie, "x-csrf-token": csrf }, body: { confirm: "DELETE" } });
    const mdbDeleteJson = (() => { try { return JSON.parse(mdbDelete.body); } catch (_) { return {}; } })();
    check("D Abgeordneter erreicht NIE ein fremdes Mandat (Aufloesung pinnt aufs eigene)",
      mdbDelete.status === 200 && mdbDeleteJson.politicianId === "test-mandat", `status=${mdbDelete.status} pid=${mdbDeleteJson.politicianId}`);

    // E) Ungueltige Parameter bleiben harmlos.
    const badLimit = await req(port, "GET", "/api/admin/audit?limit=abc", { headers: { Cookie: adminCookie } });
    check("E audit mit ungueltigem limit -> 200 (Default statt Fehler)", badLimit.status === 200);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Admin-Routen-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
