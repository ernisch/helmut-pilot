"use strict";

// Echte Original-DC/React-Laufzeit, Browser und bestehender lokaler HTTP-Server.
// Neues Routing ausschließlich als Testhülle; server.js bleibt unverändert.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { originalAdministrationPackage, addVerifiedRuntimeAssets } = require("./original-verwaltung-paket");
const { chromium } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core");
const root = path.join(__dirname, "..");
const evidence = process.env.HELMUT_PARALLEL_EVIDENCE;
const bootOnly = process.argv.includes("--boot-only");
assert.ok(evidence && process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
for (const key of Object.keys(process.env)) assert.ok(!/^(SUPABASE|VERCEL|OPENAI|AZURE|DEEPSEEK|PILOT_SECRET|CRON_SECRET|HELMUT_ADMIN_SECRET)/.test(key), key);
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const checks = [], images = [], requests = [], pageErrors = [], consoleErrors = [], forbiddenRequests = [];
const fault = { overview: false, loseCreate: false, failCustomer: false };
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }

async function main() {
  const baseline = ["server.js", "lib/helmut/accounts.js", "client.js", "styles.css", "index.html"].map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-react-admin-")), clone = path.join(sandbox, "backend");
  let server, browser, currentPage;
  let profileWrites = 0, mailCalls = 0, providerCalls = 0, externalFetch = 0;
  const originalFetch = globalThis.fetch;
  try {
    execFileSync("git", ["clone", "--quiet", "--shared", "--no-hardlinks", "--single-branch", "--branch", "feat/claude-backend-isolated", root, clone]);
    for (const file of [".env", ".env.local", "env.local", ".helmut-data"]) assert.equal(fs.existsSync(path.join(clone, file)), false);
    process.env.HELMUT_AUTH_MODE = "accounts"; process.env.HELMUT_STORE_CACHE_MS = "0"; process.env.HELMUT_TESTLAUF_KOMMUNIKATION = "gesperrt";
    const accounts = require(path.join(clone, "lib/helmut/accounts")), storage = require(path.join(clone, "lib/helmut/storage"));
    const password = "Synthetic-React-Local-Only-123!";
    await accounts.createUser({ name: "Fiktiver React Admin", email: "admin@react.invalid", role: "admin", password });
    await accounts.createUser({ name: "Fiktiver React Kunde", email: "member@react.invalid", role: "abgeordneter", politicianId: "browser-synthetic-001", password });
    const fixture = require(path.join(clone, "scripts/fixtures/test-profiles")).testPoliticianOne;
    const count = bootOnly ? 1 : 52;
    for (let i = 1; i <= count; i++) await storage.saveProfile({ ...fixture, id: `browser-synthetic-${String(i).padStart(3, "0")}`, fullName: `Fiktives Mandat ${String(i).padStart(3, "0")}`, profileActive: !bootOnly && i === 52 });
    if (!bootOnly) {
      // Nur synthetische vorhandene Quittung im neuen lokalen Store, kein Motorlauf.
      const receipt = require(path.join(clone, "lib/helmut/lage-laufdiagnose")).mandatsErgebnis("browser-synthetic-052", { available: true, fromCache: true });
      await storage.recordProcessRun({ process: "briefing-lage", runId: "browser-synthetic-lage-receipt", mode: "cron", status: "success",
        startedAt: new Date(Date.now() - 120000).toISOString(), finishedAt: new Date(Date.now() - 60000).toISOString(), mandatsErgebnisse: [receipt] });
    }
    storage.saveProfile = async () => { profileWrites++; throw new Error("Keine Profilmutation im Browsertest"); };
    require(path.join(clone, "lib/helmut/ai")).requestText = async () => { providerCalls++; throw new Error("Provider gesperrt"); };
    require(path.join(clone, "lib/helmut/invite-mail")).sendAccessMail = async () => { mailCalls++; throw new Error("Mail gesperrt"); };
    globalThis.fetch = async () => { externalFetch++; throw new Error("Server-fetch im isolierten Browsertest gesperrt"); };
    const handler = require(path.join(clone, "server.js"));
    const pkg = addVerifiedRuntimeAssets(originalAdministrationPackage(), path.join(root, "verwaltung/runtime"));
    const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" };
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'" };
    server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      // Chromium fordert vor dem dynamischen Original-Helmet gelegentlich dieses
      // eine Standardasset an. Ausschließlich das vorhandene Originalfavicon.
      if (url.pathname === "/favicon.ico" && request.method === "GET") {
        response.writeHead(200, { ...headers, "Content-Type": "image/svg+xml" });
        return response.end(pkg.assets.get("design/logo/favicon.svg"));
      }
      if (url.pathname.startsWith("/verwaltung/")) {
        if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); return response.end(); }
        const key = decodeURIComponent(url.pathname.slice("/verwaltung/".length));
        if (!key) { response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" }); return response.end(request.method === "HEAD" ? undefined : pkg.html); }
        if (pkg.assets.has(key) && mime[path.extname(key)]) { response.writeHead(200, { ...headers, "Content-Type": mime[path.extname(key)] }); return response.end(request.method === "HEAD" ? undefined : pkg.assets.get(key)); }
        response.writeHead(404); return response.end();
      }
      const allowed = request.method === "GET" && (/^\/api\/admin\/(overview|customers|sources-status|users|stats\/(budget-today|process-runs)|profile\/[a-z0-9-]+)$/.test(url.pathname) || ["/api/security/csrf", "/api/auth/session"].includes(url.pathname))
        || request.method === "POST" && ["/api/auth/login", "/api/admin/users"].includes(url.pathname)
        || request.method === "PATCH" && /^\/api\/admin\/users\/[a-z0-9-]+$/.test(url.pathname);
      if (!allowed) { forbiddenRequests.push({ path: url.pathname, method: request.method }); response.writeHead(404); return response.end(); }
      requests.push({ path: url.pathname, method: request.method });
      if (fault.overview && url.pathname === "/api/admin/overview") { response.writeHead(500, { "Content-Type": "application/json" }); return response.end('{"error":"Synthetischer Leseausfall"}'); }
      if (fault.failCustomer && request.method === "PATCH") { response.writeHead(500, { "Content-Type": "application/json" }); return response.end('{"error":"Synthetischer Schreibausfall"}'); }
      Promise.resolve(handler(request, response)).catch(error => { response.writeHead(500); response.end(); console.error(error); });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
    context.setDefaultTimeout(7000);
    await context.route("**/*", async route => {
      const request = route.request();
      if (!request.url().startsWith(base + "/")) { forbiddenRequests.push({ external: request.url() }); return route.abort(); }
      if (fault.loseCreate && request.method() === "POST" && new URL(request.url()).pathname === "/api/admin/users") {
        fault.loseCreate = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort();
      }
      return route.continue();
    });
    const login = async (ctx, email) => { const response = await ctx.request.post(base + "/api/auth/login", { data: { email, password } }); assert.equal(response.status(), 200); };
    await login(context, "admin@react.invalid");
    const page = currentPage = await context.newPage();
    page.on("pageerror", error => pageErrors.push(String(error))); page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    // Frische Fehlerszenarien brauchen ein neues Dokument. Reine Hashnavigation
    // erhält absichtlich die Schreibsperre eines unklaren Formularausgangs.
    let navigation = 0;
    const goto = async hash => { await page.goto(`${base}/verwaltung/?isolatedView=${++navigation}${hash}`); await page.locator("main h1").waitFor(); };
    const nav = hash => page.locator(`nav[aria-label="Hauptnavigation"] a[href="${hash}"]`);
    const shot = async name => { await page.evaluate(() => document.fonts.ready); const file = `${name}.png`; const bytes = await page.screenshot({ path: path.join(evidence, file), fullPage: true }); images.push({ file, sha256: sha(bytes) }); };
    await check("Original-React18.3.1 und DC-Komponente starten mit echten lokalen Verwaltungsdaten", async () => {
      await goto("#/uebersicht"); await page.getByRole("heading", { name: "Ergebnisstand offen", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => React.version), "18.3.1");
      // Offizielles18.3.1-UMD meldet diesen Buildzusatz; Original-SRI ist die Bytegrenze.
      assert.equal(await page.evaluate(() => ReactDOM.version), "18.3.1-next-f1338f8080-20240426");
      assert.match(await page.locator("main").innerText(), new RegExp(`\\b${count}\\b`));
      const fonts = await page.evaluate(() => ({ heading: getComputedStyle(document.querySelector("h1")).fontFamily, body: getComputedStyle(document.body).fontFamily,
        rail: document.querySelector('nav[aria-label="Hauptnavigation"]').getBoundingClientRect().width }));
      assert.match(fonts.heading, /Spectral/); assert.match(fonts.body, /Hanken Grotesk/); assert.equal(fonts.rail, 212);
      await shot("interaktiv-original-uebersicht-dunkel-1440");
    });
    if (!bootOnly) {
      await check("Originalsuche und50er-Seitenwechsel reagieren auf echte Browserereignisse", async () => {
        await nav("#/profile").click(); const search = page.locator('input[type="search"]'); await search.waitFor();
        await page.getByRole("button", { name: "Weiter", exact: true }).click(); await page.getByText("Seite 2 von 2", { exact: true }).waitFor();
        await search.fill("Mandat 051"); await page.locator('a[href="#/profil/browser-synthetic-051"]').first().waitFor();
        assert.equal(await page.locator('a[href^="#/profil/"]').count(), 1);
      });
      await check("Profildetail wird interaktiv über die bestehende sechste Leseroute geladen", async () => {
        await page.locator('a[href="#/profil/browser-synthetic-051"]').first().click();
        await page.getByRole("heading", { name: "Fiktives Mandat 051", exact: true }).waitFor();
        assert.match(await page.locator("main").innerText(), /Vollständigkeit und Qualität nicht belegt/);
      });
      await check("Betriebsbilanz trennt Briefing, Lage und Zustellung ohne falsche Qualitätsurteile", async () => {
        await nav("#/betrieb").click(); const table = page.getByRole("table", { name: "Betriebsbilanz" }); await table.waitFor();
        const text = await table.innerText(); assert.match(text, /Briefing/); assert.match(text, /Lage/); assert.match(text, /Zustellung/); assert.match(text, /Ungeprüft/);
        assert.match(await table.getByRole("row").filter({ hasText: /^Lage/ }).innerText(), /Lage\s+1/);
        assert.match(await page.locator("main").innerText(), /Cachebestände/);
        assert.match(await page.locator("main").innerText(), /Lage vorbereiten/);
        await shot("interaktiv-original-tagesbilanz-1440");
      });
      await check("Original-Themenwechsel und Menü funktionieren auf390Pixeln", async () => {
        await nav("#/einstellungen").click(); await page.getByRole("button", { name: "Hell", exact: true }).click();
        assert.equal(await page.locator("[data-theme]").first().getAttribute("data-theme"), "hell");
        await page.setViewportSize({ width: 390, height: 900 }); await page.getByRole("button", { name: "Menü öffnen" }).click();
        await nav("#/kunden").click(); await page.getByRole("heading", { name: "Kunden", exact: true }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await shot("interaktiv-original-kunden-hell-390");
        await page.setViewportSize({ width: 1440, height: 1100 });
      });
      const openForm = async () => { await nav("#/kunden").click(); await page.getByRole("link", { name: "Kunde anlegen", exact: true }).click(); await page.getByRole("heading", { name: "Neuer Kunde", exact: true }).waitFor(); };
      const fill = async suffix => {
        await page.getByLabel("Name des Kunden", { exact: true }).fill(`Fiktives Büro ${suffix}`);
        await page.getByLabel("Ansprechpartner", { exact: true }).fill(`Fiktiver Kontakt ${suffix}`);
        await page.getByLabel("E-Mail", { exact: true }).fill(`customer-${suffix.toLowerCase()}@react.invalid`);
        // Implizites Original-Label enthält auch den Text seiner Optionen.
        await page.getByLabel(/^Tarif/).selectOption("Büro");
      };
      await check("Originalformular zeigt Feldfehler und behauptet keine simulierten Tarife", async () => {
        await openForm(); await page.getByRole("button", { name: "Gesperrtes Konto speichern", exact: true }).click();
        await page.getByRole("alert").waitFor(); assert.equal(await page.locator('input[aria-invalid="true"]').count(), 3);
        assert.doesNotMatch(await page.locator("main").innerText(), /290 EUR|490 EUR|1\.200 EUR/);
        await shot("interaktiv-original-formular-fehler-1440");
      });
      await check("Browser → Originalformular → echter POST/PATCH speichert gesperrtes Konto ohne Einladung", async () => {
        await fill("Alpha"); await page.getByRole("button", { name: "Gesperrtes Konto speichern", exact: true }).click();
        await page.getByRole("heading", { name: "Fiktiver Kontakt Alpha", exact: true }).waitFor();
        const user = (await accounts.listUsers()).find(u => u.email === "customer-alpha@react.invalid");
        assert.ok(user); assert.equal(user.active, false); assert.equal(user.customer.pricePerMonth, null);
        assert.match(user.customer.internalNote, /Fiktives Büro Alpha/); assert.match(user.customer.internalNote, /Tarifwunsch: Büro/);
        assert.match(await page.locator("main").innerText(), /Kundenname: Fiktives Büro Alpha/);
        assert.match(await page.locator("main").innerText(), /Zugangseinrichtung offen/);
        assert.doesNotMatch(await page.locator("main").innerText(), /\beingeladen\b/);
        // Die bestehende Ablage legt diese Sammlung erst beim ersten Link an.
        assert.equal(((await storage.readAuthStore()).passwordTokens ?? []).length, 0);
        await shot("interaktiv-original-kunde-gespeichert-1440");
      });
      await check("Vorhandene E-Mail wird im Originalformular ohne zweiten POST zurückgewiesen", async () => {
        await openForm(); await fill("Alpha"); const before = requests.filter(r => r.method === "POST" && r.path === "/api/admin/users").length;
        await page.getByRole("button", { name: "Gesperrtes Konto speichern", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "bereits verwendet" }).waitFor();
        assert.equal(requests.filter(r => r.method === "POST" && r.path === "/api/admin/users").length, before);
      });
      await check("Verlorene POST-Antwort sperrt weitere Submitversuche ohne automatische Wiederholung", async () => {
        await fill("Lost"); fault.loseCreate = true;
        await page.getByRole("button", { name: "Gesperrtes Konto speichern", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "unklar" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Kontostand prüfen", exact: true }).isDisabled(), true);
        assert.equal((await accounts.listUsers()).filter(u => u.email === "customer-lost@react.invalid").length, 1);
      });
      await check("Teilweise Kontoanlage zeigt bestätigte Kennung und bleibt gegen Doppelanlage gesperrt", async () => {
        await goto("#/kunde-neu"); await fill("Partial"); fault.failCustomer = true;
        await page.getByRole("button", { name: "Gesperrtes Konto speichern", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "wurde bei der Anlage bestätigt" }).waitFor(); fault.failCustomer = false;
        const user = (await accounts.listUsers()).find(u => u.email === "customer-partial@react.invalid");
        assert.match(await page.getByRole("alert").innerText(), new RegExp(user.id));
        assert.equal(await page.getByRole("button", { name: "Kontostand prüfen", exact: true }).isDisabled(), true);
      });
      await check("Partieller Übersichtsausfall erhält bekannte Kundenkennungen", async () => {
        fault.overview = true; await goto("#/kunden"); await page.getByRole("heading", { name: "Kunden", exact: true }).waitFor();
        await page.getByText(/browser-synthetic-001 · Details nicht verfügbar/).waitFor(); fault.overview = false;
      });
      await check("Echte anonyme401- und Mandats403-Antworten geben keine Verwaltungsdaten frei", async () => {
        for (const actor of ["anonymous", "member@react.invalid"]) {
          const ctx = await browser.newContext(); if (actor !== "anonymous") await login(ctx, actor);
          const p = await ctx.newPage(); await p.goto(base + "/verwaltung/#/uebersicht");
          await p.getByRole("heading", { name: "Zugriff gesperrt", exact: true }).waitFor();
          assert.doesNotMatch(await p.locator("main").innerText(), /Fiktives Mandat|Fiktiver Kontakt|customer-alpha/); await ctx.close();
        }
      });
    }
    await check("Nur eigene lokale Assets und erlaubte APIs; kein Mail-, Provider- oder Profilwrite", async () => {
      assert.deepEqual(pageErrors, []); assert.deepEqual(forbiddenRequests, []);
      assert.equal(mailCalls, 0); assert.equal(providerCalls, 0); assert.equal(externalFetch, 0); assert.equal(profileWrites, 0);
      for (const file of baseline) assert.equal(sha(fs.readFileSync(path.join(root, file.file))), file.sha256);
    });
    const result = { kind: bootOnly ? "react-boot-only" : "interactive-original-react-real-http", reactVersion: "18.3.1", reactDOMBuildVersion: "18.3.1-next-f1338f8080-20240426", checks, images, requests,
      isolation: { bind: "127.0.0.1", localStore: true, mailCalls, providerCalls, externalFetch, profileWrites, passwordTokens: ((await storage.readAuthStore()).passwordTokens ?? []).length },
      pageErrors, consoleErrors, forbiddenRequests, protectedFiles: baseline,
      limits: ["Synthetic local accounts/data only", "No SQL/RLS or500acceptance", "Productionroute/CSP unchanged", "Faultresponses explicitly synthetic"] };
    fs.writeFileSync(path.join(evidence, bootOnly ? "react-boot-ergebnis.json" : "interaktive-abnahme-ergebnis.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(`${checks.length}/${checks.length} interaktive Prüfgruppen bestanden`);
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) {
      const failure = `interaktiv-fehler-${Date.now()}`;
      await currentPage.screenshot({ path: path.join(evidence, failure + ".png"), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(evidence, failure + ".json"), JSON.stringify({ error: String(error), pageErrors, consoleErrors, requests, completed: checks }, null, 2) + "\n");
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
