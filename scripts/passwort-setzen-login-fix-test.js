"use strict";

// Produktionsfehler-Fix: "Login funktioniert, aber keine Weiterleitung — Nutzer
// landet wieder auf der Loginseite" nach dem neuen Invite-/Passwort-Setzen-Flow.
//
// ROOT CAUSE (per Code-Lesen + echtem HTTP-End-to-End-Flow verifiziert, vor dem
// Fix reproduziert): GET /api/app/start liefert fuer einen VOLLSTAENDIG authenti-
// fizierten Nutzer OHNE zugewiesenes Mandat (Rolle referent/demo ohne Assignment)
// bewusst 403 mit reason "no-mandate" (server.js, Mandant-Gate — korrektes
// Verhalten, das ist Mandantentrennung, keine Lockerung erlaubt). client.js
// behandelte VOR dem Fix jedes 401 UND 403 auf dieser Route identisch als
// "Session ungueltig" -> renderLogin() — ein legitim eingeloggter Nutzer landete
// dadurch wieder auf dem Login-Bildschirm, obwohl die Session gueltig war. Der
// Bug ist PRE-EXISTING in dieser generischen Redirect-Logik (nicht durch PR
// #107/#108 eingefuehrt), wurde aber durch den neuen Self-Service-Invite-Flow
// erstmals praktisch getroffen (ein Admin kann jetzt in Sekunden ein Konto ohne
// Mandat anlegen). Zusaetzlich: die /passwort-setzen-Seite leitete nach Erfolg
// nicht automatisch weiter (nur ein manueller Link) und nutzte ein voellig
// fremdes, helles Design statt des dunklen Helmut-Looks.
//
// FIX:
//  - client.js loadBriefing(): 401 (echter Auth-Fehler) und 403 (koennte
//    no-mandate sein) werden getrennt behandelt; 403+reason:"no-mandate" bei
//    gueltiger Session -> neuer ehrlicher Zustand renderNoMandateState() (mit
//    Abmelden-Option), KEIN renderLogin(), KEINE fremden Daten.
//  - server.js sendSetPasswordPage(): nach erfolgreichem Setzen automatischer
//    Redirect (window.location.href = "/") statt nur manuellem Link; Design im
//    dunklen Helmut-Look (dieselben Tokens/Radien/Farben wie Login-Screen).
//
// TESTMETHODIK-HINWEIS (wichtig, keine Beschoenigung): Ein voller SPA-Boot im
// Account-Modus (HELMUT_AUTH_MODE=accounts) bringt Chromium in DIESER Sandbox
// zum Absturz ("Target crashed") — nachweislich UNABHAENGIG von diesem Fix:
// derselbe Crash tritt identisch mit dem UNVERAENDERTEN Original-client.js auf,
// bereits beim einfachsten Fall (renderLogin() ohne jede Session), auch mit
// deaktivierten Fonts/GPU und minimalem CSS als isolierten Gegenproben. Es ist
// eine Umgebungslimitation dieser Sandbox, kein Befund ueber den Fix. Deshalb:
//  - Der Kern-Flow (Einladung -> Setzen -> Aktivierung -> Session -> Cookie ->
//    Mandantentrennung -> Logout/Re-Login -> Token-Einmaligkeit) wird ueber
//    echte HTTP-Requests gegen den echten Server verifiziert (deterministisch,
//    keine Browser-Abhaengigkeit).
//  - Die /passwort-setzen-Seite SELBST (Design-Tokens, Mobile, Formular-
//    Interaktion, automatischer Redirect) wird mit einem echten Playwright-
//    Browser getestet — das funktioniert nachweislich zuverlaessig, weil die
//    Navigation zur (crashenden) vollen SPA per page.route() abgefangen wird
//    (Dummy-Ziel statt echtem Boot) und damit selbst nicht ausgefuehrt wird.
//  - Die client.js-Logiktrennung (401 vs. 403/no-mandate, renderNoMandateState)
//    wird zusaetzlich per Quelltext-Verifikation belegt.

const http = require("http");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

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
const accounts = require("../lib/helmut/accounts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

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
  return res;
}
function tokenFromUrl(url) { return new URL(String(url)).searchParams.get("token") || ""; }

function loadPlaywright() {
  const candidates = ["playwright", path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")];
  for (const c of candidates) { try { return require(c); } catch (_) {} }
  return null;
}

(async () => {
  console.log("== Quelltext-Verifikation: Root-Cause-Fix im Code vorhanden ==");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");

  check("loadBriefing trennt 401 von 403 (kein gemeinsamer Block mehr)", !/status === 401 \|\| startResponse\.status === 403/.test(clientSrc));

  // Strukturelle Pruefung statt reiner String-Naehe (Review-Fix): stellt sicher,
  // dass auf renderNoMandateState() UNMITTELBAR ein return folgt — sonst wuerde
  // der Code in den renderLogin()-Fallback DURCHFALLEN und exakt der gemeldete
  // Produktionsfehler waere zurueck, obwohl beide Strings noch "in der Naehe" stehen.
  const status403Block = (clientSrc.match(/if \(startResponse\.status === 403\) \{[\s\S]*?\n    \}\n/) || [""])[0];
  check("403-Block gefunden", status403Block.length > 50);
  check("reason no-mandate + authenticated wird geprueft, BEVOR renderNoMandateState() folgt",
    /if \(authState && authState\.authenticated && payload && payload\.reason === "no-mandate"\) \{/.test(status403Block));
  check("403 mit reason no-mandate: renderNoMandateState() wird SOFORT von return gefolgt (kein Durchfallen in renderLogin)",
    /renderNoMandateState\(\);\s*\n\s*return;\s*\n\s*\}/.test(status403Block));
  check("403-Block behaelt den renderLogin/renderPilotAccess-Fallback fuer echte Nicht-no-mandate-Faelle",
    /if \(authState\) renderLogin\(\);\s*\n\s*else renderPilotAccess\(\);/.test(status403Block));

  const noMandateFnSrc = (clientSrc.match(/function renderNoMandateState\(\)[\s\S]*?\n}\n/) || [""])[0];
  check("renderNoMandateState existiert", /function renderNoMandateState\(\)/.test(clientSrc) && noMandateFnSrc.length > 50);
  check("renderNoMandateState: Abmelden-Button ist tatsaechlich an logout() verdrahtet (keine Sackgasse)",
    /querySelector\("\[data-logout\]"\)\??\.addEventListener\("click", \(\) => logout\(\)\)/.test(noMandateFnSrc));
  check("renderNoMandateState zeigt KEINE fremden Daten (kein API-Fetch fuer Profile/Briefing)",
    (() => {
      const m = clientSrc.match(/function renderNoMandateState\(\)[\s\S]*?\n}\n/);
      return Boolean(m) && !/fetch\(/.test(m[0]);
    })());
  check("sendSetPasswordPage: automatischer Redirect nach Erfolg (window.location.href)",
    /window\.location\.href = "\/";/.test(serverSrc));
  // Nur den Funktionskoerper von sendSetPasswordPage pruefen (Impressum/Datenschutz
  // bleiben bewusst im hellen Design — nicht Teil dieser Aufgabe, nicht anfassen).
  const setPasswordPageSrc = (serverSrc.match(/function sendSetPasswordPage\(response\)[\s\S]*?\n}\n/) || [""])[0];
  check("sendSetPasswordPage-Funktion gefunden", setPasswordPageSrc.length > 100);
  check("sendSetPasswordPage: dunkles Design (color-scheme: dark), kein helles Alt-Design mehr",
    /color-scheme: dark/.test(setPasswordPageSrc) && !/color-scheme: light/.test(setPasswordPageSrc) && !/--paper: #f7f7f2/.test(setPasswordPageSrc));
  check("sendSetPasswordPage: dieselben Farb-Tokens wie der App-Hintergrund (#070b15/#050914/#03050b)",
    /#070b15 0%, #050914 72%, #03050b 100%/.test(setPasswordPageSrc));
  check("Impressum/Datenschutz-Links weiterhin vorhanden", /href="\/impressum"/.test(serverSrc) && /href="\/datenschutz"/.test(serverSrc));

  console.log("\n== HTTP-End-to-End: kompletter Auth-Flow gegen echten Server ==");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    await accounts.createUser({ email: "admin-fix@example.org", name: "Admin Fix", role: "admin", password: "sicher-genug-1" });
    const adminLogin = await login(port, "admin-fix@example.org", "sicher-genug-1");
    const adminCookie = String(adminLogin.headers["set-cookie"][0]).split(";")[0];
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    // --- Rolle OHNE Mandat (der reproduzierte Bugfall) ---
    console.log("\n-- Rolle demo (kein Mandat) --");
    const createDemo = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Demo Nutzer", email: "demo-fix@example.org", role: "demo"
    } })).body);
    check("1. Einladung erstellt (Status eingeladen)", createDemo.status === "eingeladen");
    const demoToken = tokenFromUrl(createDemo.inviteUrl);

    const setPw = await req(port, "POST", "/api/auth/set-password", { body: { token: demoToken, password: "testpasswort-123" } });
    check("2. Passwort gesetzt (200)", setPw.status === 200, `status=${setPw.status}`);
    const setPwJson = parse(setPw.body);
    check("3. Nutzer aktiviert (active:true)", setPwJson.user && setPwJson.user.active === true);
    check("4/5. Session-Cookie gesetzt (Set-Cookie vorhanden)", Boolean(setPw.headers["set-cookie"]));
    const cookieHeader = String(setPw.headers["set-cookie"][0]);
    const demoCookie = cookieHeader.split(";")[0];
    check("5. Cookie-Attribute korrekt (HttpOnly, SameSite=Lax, Path=/)",
      /HttpOnly/.test(cookieHeader) && /SameSite=Lax/.test(cookieHeader) && /Path=\//.test(cookieHeader), cookieHeader);

    const sessionCheck = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: demoCookie } })).body);
    check("Session ist serverseitig gueltig (authenticated:true)", sessionCheck.authenticated === true);

    const startNoMandate = await req(port, "GET", "/api/app/start", { headers: { Cookie: demoCookie } });
    check("Root Cause bestaetigt: /api/app/start liefert 403 no-mandate trotz gueltiger Session",
      startNoMandate.status === 403 && parse(startNoMandate.body).reason === "no-mandate", `status=${startNoMandate.status}`);
    check("Mandantentrennung bleibt intakt (kein Datenzugriff ohne Mandat, keine Lockerung im Fix)",
      !/executiveSummary|briefing|profile/i.test(startNoMandate.body));

    // 6. Reload behaelt Sitzung: mehrfacher /api/auth/session-Aufruf bleibt authenticated.
    const reloadCheck = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: demoCookie } })).body);
    check("6. Reload (erneuter Session-Check) behaelt die Sitzung", reloadCheck.authenticated === true);

    // 8/9. Abmelden + erneut einloggen.
    const logoutRes = await req(port, "POST", "/api/auth/logout", { headers: { Cookie: demoCookie } });
    check("8. Abmelden erfolgreich (200)", logoutRes.status === 200);
    const afterLogout = parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: demoCookie } })).body);
    check("8. Nach Abmelden ist die Session ungueltig", afterLogout.authenticated === false);
    const reLogin = await login(port, "demo-fix@example.org", "testpasswort-123");
    check("9. Erneutes Einloggen mit E-Mail+Passwort funktioniert (200)", reLogin.status === 200, `status=${reLogin.status}`);

    // 10. Falsches Passwort zeigt Fehler.
    const wrongPw = await login(port, "demo-fix@example.org", "falsches-passwort-x");
    check("10. Falsches Passwort -> 401 mit Fehlermeldung", wrongPw.status === 401 && /nicht korrekt/i.test(parse(wrongPw.body).error || ""), `status=${wrongPw.status}`);

    // 11. Alter Einladungslink ist nach Nutzung ungueltig.
    const reuseInvite = await req(port, "POST", "/api/auth/set-password", { body: { token: demoToken, password: "zweiter-versuch-123" } });
    check("11. Alter Einladungslink nach Nutzung ungueltig (410)", reuseInvite.status === 410, `status=${reuseInvite.status}`);

    // --- Kontrollgruppe: Rolle MIT Mandat (Bug betrifft NICHT jeden Nutzer) ---
    console.log("\n-- Rolle abgeordneter (mit Mandat, Kontrollgruppe) --");
    const createMdb = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "MdB Eins", email: "mdb1-fix@example.org", role: "abgeordneter"
    } })).body);
    const mdbToken = tokenFromUrl(createMdb.inviteUrl);
    const mdbSetPw = await req(port, "POST", "/api/auth/set-password", { body: { token: mdbToken, password: "testpasswort-123" } });
    const mdbCookie = String(mdbSetPw.headers["set-cookie"][0]).split(";")[0];
    const mdbStart = await req(port, "GET", "/api/app/start", { headers: { Cookie: mdbCookie } });
    check("Nutzer MIT Mandat: /api/app/start liefert 200 (kein no-mandate)", mdbStart.status === 200, `status=${mdbStart.status}`);

    // --- Mandantentrennung: zweiter Abgeordneter darf NICHT das fremde Mandat sehen ---
    console.log("\n-- Mandantentrennung zwischen zwei Mandaten --");
    const createMdb2 = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "MdB Zwei", email: "mdb2-fix@example.org", role: "abgeordneter"
    } })).body);
    const mdb2Token = tokenFromUrl(createMdb2.inviteUrl);
    const mdb2SetPw = await req(port, "POST", "/api/auth/set-password", { body: { token: mdb2Token, password: "testpasswort-123" } });
    const mdb2Cookie = String(mdb2SetPw.headers["set-cookie"][0]).split(";")[0];
    const crossTenant = await req(port, "GET", `/api/app/start?politicianId=${encodeURIComponent(createMdb.politicianId)}`, { headers: { Cookie: mdb2Cookie } });
    const crossTenantJson = parse(crossTenant.body);
    check("12. Mandant 2 wird trotz fremder politicianId in der URL auf sein EIGENES Mandat gepinnt",
      crossTenant.status === 200 && crossTenantJson.profile && crossTenantJson.profile.id === createMdb2.politicianId,
      `status=${crossTenant.status} pid=${crossTenantJson.profile && crossTenantJson.profile.id}`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log("\n== Browser: /passwort-setzen (Design-Tokens, Mobile, automatischer Redirect) ==");
  const pw = loadPlaywright();
  if (!pw) {
    console.log("SKIP: Playwright nicht verfuegbar (Browser-Abschnitt uebersprungen, HTTP-Abschnitt bleibt massgeblich).");
  } else {
    const server2 = http.createServer(handler);
    await new Promise((r) => server2.listen(0, "127.0.0.1", r));
    const port2 = server2.address().port;
    try {
      await accounts.createUser({ email: "admin-ui@example.org", name: "Admin UI", role: "admin", password: "sicher-genug-1" });
      const adminLogin2 = await login(port2, "admin-ui@example.org", "sicher-genug-1");
      const adminCookie2 = String(adminLogin2.headers["set-cookie"][0]).split(";")[0];
      const csrf2 = parse((await req(port2, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie2 } })).body).token;
      const createUi = parse((await req(port2, "POST", "/api/admin/users", { headers: { Cookie: adminCookie2, "x-csrf-token": csrf2 }, body: {
        name: "UI Test", email: "ui-test@example.org", role: "demo"
      } })).body);
      const uiToken = tokenFromUrl(createUi.inviteUrl);

      const browser = await pw.chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });

      // --- Desktop: Design-Tokens ---
      {
        const page = await browser.newPage();
        let crashed = false;
        page.on("crash", () => { crashed = true; });
        await page.goto(`http://127.0.0.1:${port2}/passwort-setzen?token=${encodeURIComponent(uiToken)}`, { waitUntil: "load", timeout: 15000 });
        await page.waitForSelector("#formView:not([hidden])", { timeout: 8000 });
        const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
        const cardBg = await page.evaluate(() => getComputedStyle(document.querySelector("main")).backgroundImage);
        const cardRadius = await page.evaluate(() => getComputedStyle(document.querySelector("main")).borderRadius);
        const inputRadius = await page.evaluate(() => getComputedStyle(document.querySelector("#pw1")).borderRadius);
        const logoText = await page.textContent(".mark span").catch(() => "");
        check("Desktop: color-scheme ist dark", colorScheme === "dark", colorScheme);
        check("Desktop: dunkler App-Hintergrund (kein cremefarbenes #f7f7f2)", /gradient/i.test(bodyBg) && !bodyBg.includes("247, 247, 242"));
        check("Desktop: Karte nutzt denselben Gradient wie die Login-Karte", /15, 21, 38/.test(cardBg) && /7, 10, 21/.test(cardBg), cardBg);
        check("Desktop: Karten-Radius 24px (wie .pilot-access-card)", cardRadius === "24px", cardRadius);
        check("Desktop: Eingabefeld-Radius 16px (App-typische Rundung)", inputRadius === "16px", inputRadius);
        check("Desktop: Helmut-'H'-Logo sichtbar", logoText.trim() === "H", JSON.stringify(logoText));
        check("Kein Crash beim Laden der Passwort-Seite selbst", !crashed);
        await page.close();
      }

      // --- Mobil: Darstellung + kompletter Formular-Flow inkl. automatischem Redirect ---
      {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 390, height: 844 });
        let redirectedToRoot = false;
        await page.route(new RegExp(`^http://127\\.0\\.0\\.1:${port2}/$`), (route) => {
          redirectedToRoot = true;
          route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>APP-ZIEL</body></html>" });
        });
        await page.goto(`http://127.0.0.1:${port2}/passwort-setzen?token=${encodeURIComponent(uiToken)}`, { waitUntil: "load", timeout: 15000 });
        await page.waitForSelector("#formView:not([hidden])", { timeout: 8000 });
        const cardWidth = await page.evaluate(() => document.querySelector("main").getBoundingClientRect().width);
        check("13. Mobil (390px): Karte passt in den Viewport (keine horizontale Ueberbreite)", cardWidth <= 390, `width=${cardWidth}`);
        await page.fill("#pw1", "testpasswort-123");
        await page.fill("#pw2", "testpasswort-123");
        await page.click("#setSubmit");
        await page.waitForSelector("#doneView:not([hidden])", { timeout: 8000 });
        check("Formular funktioniert auf Mobil (doneView erscheint)", true);
        await page.waitForTimeout(2500);
        check("6. Automatische Weiterleitung nach erfolgreichem Setzen (kein manueller Klick noetig)", redirectedToRoot);
        await page.close();
      }

      await browser.close();
    } finally {
      await new Promise((r) => server2.close(r));
    }
  }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
