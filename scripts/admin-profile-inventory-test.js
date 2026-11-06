"use strict";

// Echter Storage -> Admin-HTTP -> Verwaltungsleser -> Anzeige; nur synthetische Daten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.join(__dirname, "..");
const guardPath = require.resolve("./lokaler-netzschutz");
assert.ok(require.cache[guardPath] && process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"), "Nur ueber scripts/lokal.js starten");
assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
for (const key of require(guardPath).PRODUCTION_KENNUNGEN) assert.ok(!process.env[key], `Nicht bereinigte Kennung: ${key}`);
for (const file of [".env", ".env.local", "env.local", "env.local.html"]) assert.equal(fs.existsSync(path.join(root, file)), false);

const oldEnv = { ...process.env }, originalFetch = globalThis.fetch, restores = [];
Object.assign(process.env, { HELMUT_AUTH_MODE: "accounts", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_STORE_CACHE_MS: "0",
  SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-inventory-key",
  HELMUT_V3_STORE: "1", HELMUT_PROFILE_DB_MODE: "1", HELMUT_PROFILE_DB_EXCLUSIVE: "1", VERCEL_ENV: "production" });
const sql = Array.from({ length: 501 }, (_, i) => ({ id: `inventory-${String(i).padStart(3, "0")}`, name: `Fiktives Mandat ${i}`,
  mandate_profiles: [{ aktiv: i === 0, partei: "Fiktive Testpartei", geloescht_at: null }] }));
const blob = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`legacy-${i}`, { id: `legacy-${i}`, fullName: `Alte Kopie ${i}`, ...(i ? { profileActive: true } : {}) }]));
let calls = [], sqlFailure = false;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://example.invalid", "Kein externes Ziel");
  assert.equal(options.method || "GET", "GET", "Keine Datenmutation");
  calls.push(parsed.pathname);
  let body;
  if (parsed.pathname === "/rest/v1/profiles") body = sqlFailure ? { message: "Synthetischer Lesefehler" } : sql;
  else if (parsed.pathname === "/rest/v1/helmut_store") body = [{ data: { profiles: blob } }];
  else throw new Error(`Unerwartete Datenquelle: ${parsed.pathname}`);
  const status = sqlFailure && parsed.pathname === "/rest/v1/profiles" ? 500 : 200;
  return { ok: status === 200, status, statusText: "Testantwort", text: async () => JSON.stringify(body) };
};
function stub(object, key, fn) { const original = object[key]; object[key] = fn; restores.push(() => { object[key] = original; }); }
const storage = require("../lib/helmut/storage"), accounts = require("../lib/helmut/accounts");
const admin = { id: "synthetic-admin", role: "admin", name: "Testverwaltung", active: true };
stub(accounts, "resolveSession", async token => token === "inventory-session" ? { user: admin, session: {} } : null);
stub(accounts, "listUsers", async () => [admin]);
for (const key of ["listAssignments", "listSystemErrors", "listAuditEvents"]) stub(accounts, key, async () => []);
stub(accounts, "listPendingInvites", async () => ({}));
stub(accounts, "recordSystemError", async () => {});
// Nur unabhaengige Overviewdaten ersetzen; Profilquelle und Konfigurationsdiagnose bleiben echt.
for (const key of ["listFeedback", "listRawDocuments", "getLlmUsage", "getSources"]) stub(storage, key, async () => []);
for (const key of ["getAdminStatsCrawlReport", "getLlmUsageBreakdownToday", "listSourceArchitectureRows"]) stub(storage, key, async () => null);
stub(storage, "getKnowledgeObjectCount", async () => 0);
stub(storage, "getAdminPeriodStats", async () => ({ perUser: [] }));
stub(storage, "getStoreSummary", async () => ({}));
const server = http.createServer(require("../server"));
function request(url, options = {}) {
  assert.equal(options.method || "GET", "GET");
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: server.address().port, path: url, timeout: 5000,
      headers: { Cookie: options.anonymous ? "" : "helmut_session=inventory-session" } }, res => {
      let body = ""; res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, json: async () => JSON.parse(body) }));
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Lokale HTTP-Frist")));
  });
}
let passed = 0;
async function check(name, run) { calls = []; await run(); passed++; console.log(`PASS ${name}`); }

async function verifyBrowser() {
  const { chromium } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core");
  const base = `http://127.0.0.1:${server.address().port}`, blocked = [], pageErrors = [];
  const evidence = fs.mkdtempSync("/tmp/helmut-admin-inventory-");
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce", serviceWorkers: "block" });
    context.setDefaultTimeout(10000);
    await context.addCookies([{ name: "helmut_session", value: "inventory-session", url: base, httpOnly: true, sameSite: "Lax" }]);
    const ancillary = new Set(["/api/admin/stats/budget-today", "/api/admin/customers", "/api/admin/sources-status", "/api/admin/stats/process-runs"]);
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base || req.method() !== "GET" || url.pathname.startsWith("/api/") && url.pathname !== "/api/admin/overview" && !ancillary.has(url.pathname)) {
        blocked.push(`${req.method()} ${url.pathname}`); return route.abort();
      }
      // Budget/Kunden/Quellen/Laeufe sind unabhaengige Leerfixtures. Overview und
      // die gesamte Verwaltungsseite samt Runtimeassets kommen vom echten Server.
      if (ancillary.has(url.pathname)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", error => pageErrors.push(error.message));
    const metrics = async () => (await page.locator("main dl").first().locator("dd").allTextContents()).slice(0, 2).map(text => text.trim());
    sqlFailure = false;
    Object.assign(process.env, { VERCEL_ENV: "production", HELMUT_V3_STORE: "1", HELMUT_PROFILE_DB_MODE: "1", HELMUT_PROFILE_DB_EXCLUSIVE: "1" });
    await check("Browser: Originalverwaltung zeigt den echten relationalen HTTP-Bestand 501/1", async () => {
      assert.equal((await page.goto(`${base}/verwaltung/#/uebersicht`)).status(), 200);
      await page.getByRole("heading", { name: "Ergebnisstand offen", exact: true }).waitFor();
      assert.deepEqual(await metrics(), ["501", "1"]);
      assert.ok(calls.length > 0 && calls.every(p => p === "/rest/v1/profiles"));
      await page.screenshot({ path: path.join(evidence, "production-501-1.png"), fullPage: true });
    });
    await check("Browser: Vorschau zeigt Hinweis statt 25/25 und keinen falschen leeren Profilbestand", async () => {
      process.env.VERCEL_ENV = "preview"; delete process.env.HELMUT_PROFILE_DB_MODE; delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
      await page.reload(); await page.getByRole("heading", { name: "Profilbestand nicht bestätigt", exact: true }).waitFor();
      assert.deepEqual(await metrics(), ["Nicht bekannt", "Nicht bekannt"]);
      assert.match(await page.locator("main").innerText(), /In dieser Vorschau/);
      assert.ok(calls.length > 0 && calls.every(p => p === "/rest/v1/helmut_store"));
      await page.screenshot({ path: path.join(evidence, "preview-unconfirmed.png"), fullPage: true });
      await page.locator('nav[aria-label="Hauptnavigation"] a[href="#/profile"]').click();
      await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      const profileText = await page.locator("main").innerText();
      assert.match(profileText, /In dieser Vorschau/); assert.doesNotMatch(profileText, /\b0 Profile\b|Alte Kopie/);
      assert.equal(await page.locator('main a[href^="#/profil/"]').count(), 0);
      assert.deepEqual(blocked, []); assert.deepEqual(pageErrors, []);
    });
    console.log(`Browserbelege: ${evidence}`);
  } finally { await browser.close(); }
}

(async () => {
  const { createAdminReader } = await import("../verwaltung/api.mjs");
  const { originalSnapshot, applyOriginalTruth } = await import("../verwaltung/original-adapter.mjs");
  const { profilesOf, profileCounts } = await import("../verwaltung/model.mjs");
  const component = { state: { route: { page: "uebersicht" } }, tone: () => ({}), goList: () => () => {}, go: () => () => {} };
  const view = overview => { const snapshot = originalSnapshot({ overview }); return { snapshot, values: applyOriginalTruth(component, {}, snapshot) }; };
  const read = async () => {
    const reader = createAdminReader({ fetcher: request });
    try { return await reader.read("overview"); } finally { reader.dispose(); }
  };
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await check("Ohne Sitzung keine Profildaten oder Datenbankabfrage", async () => {
      assert.equal((await request("/api/admin/overview", { anonymous: true })).status, 401); assert.deepEqual(calls, []);
    });
    let production;
    await check("Relationale Quelle: HTTP und Anzeige zeigen 501 Profile / 1 aktiv, ohne alte Blobkopien", async () => {
      production = await read();
      assert.equal(production.counts.profiles, 501); assert.equal(production.mandates.length, 501);
      assert.equal(production.mandates.filter(p => p.profileActive).length, 1);
      const { snapshot, values } = view(production);
      assert.equal(snapshot.profiles.length, 501); assert.equal(snapshot.counts.aktiv, 1);
      assert.deepEqual(values.bigNums.slice(0, 2).map(metric => metric.value), ["501", "1"]);
      assert.ok(calls.length > 0 && calls.every(p => p === "/rest/v1/profiles"));
      assert.ok(!JSON.stringify(production).includes("synthetic-inventory-key"));
    });
    await check("Fehlkonfigurierte Vorschau: alte 25/25 werden nicht als aktueller Bestand angezeigt", async () => {
      process.env.VERCEL_ENV = "preview";
      for (const key of ["HELMUT_PROFILE_DB_MODE", "HELMUT_PROFILE_DB_EXCLUSIVE"]) delete process.env[key];
      const preview = await read();
      assert.equal(preview.mandates.length, 25); assert.equal(preview.mandates.filter(p => p.profileActive).length, 25);
      assert.ok(calls.length > 0 && calls.every(p => p === "/rest/v1/helmut_store"));
      const { snapshot, values } = view(preview);
      assert.deepEqual([snapshot.counts.total, snapshot.counts.aktiv], [null, null]); assert.deepEqual(snapshot.profiles, []);
      assert.ok(values.bigNums.slice(0, 2).every(metric => metric.value !== "25"));
      assert.match(`${values.health.label} ${values.health.text}`, /Vorschau/i);
      assert.match(values.listCount, /Vorschau/i); assert.equal(values.listEmpty, false);
      const { buildDailyLedger } = await import("../verwaltung/original-daily-ledger.mjs");
      snapshot.dailyLedger = await buildDailyLedger({ overview: preview, runs: { processRuns: [] } });
      assert.equal(snapshot.dailyLedger.expected, 25); // Der rohe Altbestand ist kein Bilanzeingang.
      component.state.route = { page: "betrieb", tab: "bilanz" };
      const ledgerView = applyOriginalTruth(component, { hasTabs: true }, snapshot);
      assert.match(ledgerView.bilanzSub, /Vorschau/i);
      assert.ok(ledgerView.bilanzRows.every(row => row.cells.every(cell => cell.v === "Ungeprüft")));
      component.state.route = { page: "uebersicht" };
    });
    await check("Vorschau mit bestaetigter relationaler Quelle zeigt ebenfalls 501/1", async () => {
      Object.assign(process.env, { HELMUT_V3_STORE: "1", HELMUT_PROFILE_DB_MODE: "1", HELMUT_PROFILE_DB_EXCLUSIVE: "1" });
      const { snapshot } = view(await read()); assert.equal(snapshot.counts.total, 501); assert.equal(snapshot.counts.aktiv, 1);
    });
    await check("Jeder fehlende Quellenschalter, Dualmodus und fehlende Zugangskonfiguration bleiben unbekannt", async () => {
      for (const env of ["production", "preview"]) {
        for (const key of ["HELMUT_V3_STORE", "HELMUT_PROFILE_DB_MODE", "HELMUT_PROFILE_DB_EXCLUSIVE", "credentials"]) {
          const broken = structuredClone(production); broken.system.deploy.environment = env;
          if (key === "credentials") broken.system.storage.supabaseConfigured = false;
          else broken.system.helmutConfig.find(flag => flag.name === key).wirksam = "off";
          assert.equal(profilesOf(broken), null); assert.equal(profileCounts(broken).total, null);
          assert.deepEqual(view(broken).snapshot.profiles, []);
        }
      }
    });
    await check("Unbekannter Aktivstatus bleibt unbekannt, echter Leerbestand bleibt null Profile", async () => {
      const unknown = structuredClone(production); delete unknown.mandates[0].profileActive;
      assert.equal(view(unknown).snapshot.counts.aktiv, null); assert.equal(profileCounts(unknown).active, null);
      unknown.mandates = []; assert.equal(view(unknown).snapshot.counts.total, 0); assert.equal(profileCounts(unknown).active, 0);
    });
    await check("Lokale bestehende Testdaten bleiben ohne Deploymentmetadaten nutzbar", async () => {
      const local = { mandates: [{ id: "local-fixture", profileActive: true }] };
      assert.equal(profilesOf(local).length, 1); assert.equal(view(local).snapshot.counts.aktiv, 1);
    });
    await check("Relationaler Lesefehler bleibt HTTP-Fehler und faellt nicht auf 25 Blobprofile zurueck", async () => {
      sqlFailure = true;
      await assert.rejects(read(), error => error.status === 500);
      assert.ok(calls.length > 0 && calls.every(p => p === "/rest/v1/profiles"));
    });
    if (process.argv.includes("--browser")) await verifyBrowser();
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const restore of restores.reverse()) restore(); globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
  console.log(`\n${passed} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
