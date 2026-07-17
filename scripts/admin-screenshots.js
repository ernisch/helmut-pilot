"use strict";

// Werkzeug (kein Test der Offline-Suite): startet Helmut lokal (Account-Modus,
// lokales Backend), legt ueber die ECHTEN APIs einen Admin + ein Pilot-Mandat an
// und fotografiert alle sieben Admin-Bereiche in Desktop- und Schmalansicht.
// Zusaetzlich: harter E2E-Check — jeder Bereich muss ohne pageerror rendern.
// Aufruf: node scripts/admin-screenshots.js [zielordner]

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const outDir = process.argv[2] || path.join(root, "docs", "visual", "admin-neuaufbau-2026-07");

// Store-Hermetik (wie die Offline-Tests): Snapshot + Restore.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
process.on("exit", () => {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) { if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f)); }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
});

function loadPlaywright() {
  try { return require("playwright"); } catch (_) {}
  try { return require(path.join(root, "node_modules", "playwright")); } catch (_) {}
  return null;
}

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 30000 }, (res) => {
      let out = "";
      res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on("error", reject);
    if (data != null) r.write(data);
    r.end();
  });
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.error("Playwright nicht installiert — npm i --no-save playwright@1.56.1"); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // Echte Daten ueber echte Pfade: Admin + Pilot-Mandat + Kundendaten + Feedback.
  await accounts.createUser({ email: "admin@example.org", name: "Betreiber", role: "admin", password: "screenshot-pass-1" });
  const login = await req(port, "POST", "/api/auth/login", { body: { email: "admin@example.org", password: "screenshot-pass-1" } });
  const adminCookie = String(login.headers["set-cookie"][0]).split(";")[0];
  const csrf = JSON.parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
  const H = { Cookie: adminCookie, "x-csrf-token": csrf };

  const created = await req(port, "POST", "/api/admin/users", { headers: H, body: {
    name: "Pilotmandat A", email: "pilot@example.org", role: "abgeordneter", password: "screenshot-pass-1",
    party: "Beispielpartei", committee: "Haushaltsausschuss", constituency: "001 – Beispielkreis", state: "Berlin",
    focusTopics: ["Haushalt", "Digitales"]
  } });
  const pilot = JSON.parse(created.body);
  await req(port, "PATCH", `/api/admin/users/${encodeURIComponent(pilot.id)}`, { headers: H, body: {
    status: "aktiv",
    customer: { pricePerMonth: 49, paymentStatus: "paid", startDate: "2026-07-01", nextInvoice: "2026-08-01", internalNote: "Pilotkunde" }
  } });
  const mdbLogin = await req(port, "POST", "/api/auth/login", { body: { email: "pilot@example.org", password: "screenshot-pass-1" } });
  const mdbCookie = String(mdbLogin.headers["set-cookie"][0]).split(";")[0];
  const mdbCsrf = JSON.parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: mdbCookie } })).body).token;
  await req(port, "POST", "/api/feedback", { headers: { Cookie: mdbCookie, "x-csrf-token": mdbCsrf }, body: { type: "mehr_davon", area: "Briefing", topic: "Haushaltsdebatte", comment: "Mehr davon bitte." } });

  const sections = ["uebersicht", "pipeline", "kosten", "daten", "nutzer", "system", "quellen"];
  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];

  async function shoot(viewport, suffix, theme) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", colorScheme: theme === "dark" ? "dark" : "light" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${suffix}: ${e.message}`));
    await page.goto(`${base}/?theme=${theme}`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', "admin@example.org");
    await page.fill('input[name="password"]', "screenshot-pass-1");
    await Promise.all([page.waitForLoadState("load"), page.click('button[type="submit"]')]);
    await page.waitForSelector('[data-view="admin"]', { timeout: 20000 });
    // Programmgesteuerter Klick: Overlays (Splash/Onboarding) duerfen den
    // Screenshot-Lauf nicht blockieren — die Bindings sind dieselben.
    await page.evaluate(() => { document.querySelector('.sidebar [data-view="admin"], [data-view="admin"]').click(); });
    await page.waitForSelector(".adm-nav", { timeout: 20000 });
    for (const section of sections) {
      await page.evaluate((s) => { document.querySelector(`[data-adm-section="${s}"]`).click(); }, section);
      // warten bis der Bereich fertig geladen hat (Stand … erscheint, kein Skeleton mehr)
      await page.waitForFunction(() => !document.querySelector(".adm-body .skeleton"), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${section}-${suffix}.png`), fullPage: true });
      console.log(`Screenshot: ${section}-${suffix}.png`);
    }
    await context.close();
  }

  try {
    await shoot({ width: 1440, height: 900 }, "desktop", "dark");
    await shoot({ width: 390, height: 844 }, "mobil", "dark");
    await shoot({ width: 1440, height: 900 }, "desktop-hell", "light");
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  if (errors.length) {
    console.error(`\n${errors.length} pageerror(s):`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log(`\nFertig — ${sections.length * 3} Screenshots ohne pageerror in ${outDir}`);
  process.exit(0);
})().catch((e) => { console.error("Fehler:", e); process.exit(1); });
