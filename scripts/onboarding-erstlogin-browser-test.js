"use strict";

// Echter Browser-Test des VOLLSTÄNDIGEN Erstlogin-Ablaufs (PR #112):
// Einladung → Passwort setzen → Aktivierung → Sitzung → Cookie → Übergang →
// Sitzungsprüfung auf DEMSELBEN Ursprung → location.replace("/") → sofortige
// persönliche Begrüßung. Plus Anzeigen/Verbergen beider Passwortfelder, Token-
// Schutz, ehrliche Fehlerpfade und Mandantentrennung.
//
// Bootet den echten server.js-Handler im ACCOUNT-Modus mit isoliertem lokalem
// Datei-Store (KEIN Supabase, KEIN LLM, KEIN externes Netz, KEINE Produktions-
// daten). Fehlt Playwright: LOKAL sauber übersprungen (Exit 0), in CI
// (HELMUT_REQUIRE_BROWSER=1 / CI außerhalb der Offline-Suite) fail-closed.

const http = require("http");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_PUBLIC_URL;

const dataDir = path.join(root, ".helmut-data");
const snap = new Map();
if (fs.existsSync(dataDir)) for (const f of fs.readdirSync(dataDir)) snap.set(f, fs.readFileSync(path.join(dataDir, f)));
process.on("exit", () => {
  try { if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) if (!snap.has(f)) fs.unlinkSync(path.join(dataDir, f));
    for (const [f, b] of snap) fs.writeFileSync(path.join(dataDir, f), b);
  } catch (_) {}
});

const handler = require(path.join(root, "server.js"));
const accounts = require(path.join(root, "lib/helmut/accounts"));
const { isProfileOperational } = require(path.join(root, "lib/helmut/profile-validation"));

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}
function req(port, method, p, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers
    } }, (res) => { let o = ""; res.on("data", (c) => o += c); res.on("end", () => resolve({ status: res.statusCode, body: o, headers: res.headers })); });
    r.on("error", reject); if (data != null) r.write(data); r.end();
  });
}
const parse = (b) => { try { return JSON.parse(b); } catch { return {}; } };
const tokenOf = (u) => new URL(String(u)).searchParams.get("token") || "";
function loadPlaywright() {
  for (const c of ["playwright", path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")]) { try { return require(c); } catch (_) {} }
  return null;
}
async function launch(pw) {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  try { return await pw.chromium.launch({ headless: true, args }); }
  catch (e) {
    const fb = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
    if (fs.existsSync(fb)) return await pw.chromium.launch({ headless: true, args, executablePath: fb });
    throw e;
  }
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    const requireBrowser = process.env.HELMUT_REQUIRE_BROWSER === "1" || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) { console.error("FAIL  Playwright fehlt, Browser-Test hier verpflichtend."); process.exit(1); }
    console.log("SKIP  Playwright nicht installiert — Erstlogin-Browser-Test übersprungen.");
    process.exit(0);
  }

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // Admin + CSRF für das Anlegen von Testnutzern.
  await accounts.createUser({ email: "admin-e2e@example.org", name: "Admin E2E", role: "admin", password: "sicher-genug-1" });
  const adminLogin = await req(port, "POST", "/api/auth/login", { body: { email: "admin-e2e@example.org", password: "sicher-genug-1" } });
  const adminCookie = String(adminLogin.headers["set-cookie"][0]).split(";")[0];
  const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
  const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };
  async function newInvite(name, email) {
    return parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: { name, email, role: "abgeordneter" } })).body);
  }

  const browser = await launch(pw);
  try {
    // ═══ 1) VOLLSTÄNDIGER HAPPY-PATH (echter Redirect + App-Boot) ═════════════
    {
      const created = await newInvite("Greta Musterfrau", "greta-e2e@example.org");
      // #2 Rolle abgeordneter, #23/#13 Einladungslink bleibt auf DEMSELBEN Host.
      check("2. Konto hat Rolle abgeordneter", created.role === "abgeordneter", created.role);
      check("1./23. Einladungslink zeigt auf DENSELBEN Host (kein anderer Host/Prod)", tokenOf(created.inviteUrl) && new URL(created.inviteUrl).host === `127.0.0.1:${port}`, new URL(created.inviteUrl).host);
      // #3 Profil ist vor dem Test NICHT einsatzbereit (frischer Abgeordneter).
      const preToken = tokenOf(created.inviteUrl);

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", bypassCSP: true });
      const page = await ctx.newPage();
      let crashed = false; const perr = [];
      page.on("crash", () => { crashed = true; });
      page.on("pageerror", (e) => perr.push(String((e && e.message) || e)));

      await page.goto(`${base}/passwort-setzen?token=${encodeURIComponent(preToken)}`, { waitUntil: "load", timeout: 20000 });
      await page.waitForSelector("#formView:not([hidden])", { timeout: 8000 });
      check("1. Einladungslink öffnet die Passwortseite (Formular sichtbar)", true);
      // #Token-Schutz: Token nach dem Lesen aus der sichtbaren Adresse entfernt.
      check("Token ist aus der sichtbaren Adresse entfernt (history.replaceState)", (await page.evaluate(() => window.location.search)) === "");

      // Profil-Zustand vor Abschluss über die API (read-only) prüfen.
      const pinfo = await page.evaluate(async () => {
        const r = await fetch("/api/auth/session", { credentials: "same-origin" }); return r.ok ? r.json() : {};
      });
      check("2. Session-Endpoint erreichbar (noch nicht angemeldet)", pinfo && pinfo.authenticated === false);

      // #4 Beide Felder ausfüllbar.
      await page.fill("#pw1", "geheim-passwort-1");
      await page.fill("#pw2", "geheim-passwort-1");
      check("4. Beide Passwortfelder befüllbar", (await page.inputValue("#pw1")) === "geheim-passwort-1" && (await page.inputValue("#pw2")) === "geheim-passwort-1");

      // #5 Feld 1 anzeigen/verbergen; #7 Wert bleibt; Trefferfläche ≥44px; aria.
      const box1 = await page.evaluate(() => { const b = document.getElementById("pw1Toggle").getBoundingClientRect(); return { w: b.width, h: b.height }; });
      check("24. Augen-Button Trefferfläche ≥ 44×44px (mobil)", box1.w >= 44 && box1.h >= 44, JSON.stringify(box1));
      await page.click("#pw1Toggle");
      check("5. Feld 1 anzeigen: type=text, aria-pressed=true, Label 'verbergen'",
        (await page.getAttribute("#pw1", "type")) === "text"
        && (await page.getAttribute("#pw1Toggle", "aria-pressed")) === "true"
        && /verbergen/i.test(await page.getAttribute("#pw1Toggle", "aria-label")));
      check("7. Wert von Feld 1 bleibt beim Umschalten unverändert", (await page.inputValue("#pw1")) === "geheim-passwort-1");
      check("3. Feld 2 bleibt unabhängig verborgen, während Feld 1 sichtbar ist", (await page.getAttribute("#pw2", "type")) === "password");
      await page.click("#pw1Toggle");
      check("5b. Feld 1 wieder verbergen (type=password, aria-pressed=false)",
        (await page.getAttribute("#pw1", "type")) === "password" && (await page.getAttribute("#pw1Toggle", "aria-pressed")) === "false");
      // #6 Feld 2 unabhängig.
      await page.click("#pw2Toggle");
      check("6. Feld 2 anzeigen/verbergen unabhängig (type=text, Feld 1 bleibt password)",
        (await page.getAttribute("#pw2", "type")) === "text" && (await page.getAttribute("#pw1", "type")) === "password");
      check("7b. Wert von Feld 2 bleibt erhalten", (await page.inputValue("#pw2")) === "geheim-passwort-1");
      await page.click("#pw2Toggle");

      // #8-#15 Absenden → Übergang → Sitzungsprüfung (gleicher Ursprung) → Begrüßung.
      await page.click("#setSubmit");
      await page.waitForSelector("#activatingView:not([hidden])", { timeout: 8000 });
      check("15a. Hochwertiger Übergang erscheint ('Helmut richtet dein Konto ein.')",
        /Helmut richtet dein Konto ein\./.test(await page.textContent("#activatingView")));
      // Echte Weiterleitung zur App (location.replace, gleicher Host) + Begrüßung.
      await page.waitForFunction(() => document.querySelector("#onbRoot") && /Hallo,/.test(document.body.innerText), null, { timeout: 20000 });
      const afterUrl = new URL(page.url());
      check("13. Weiterleitung bleibt auf DEMSELBEN Host, Pfad /", afterUrl.host === `127.0.0.1:${port}` && afterUrl.pathname === "/", page.url());
      const bodyText = await page.evaluate(() => document.body.innerText);
      check("15. Persönliche Begrüßung erscheint unmittelbar", /Ich bin Helmut/.test(bodyText) && /richte mich jetzt auf dein Mandat ein/.test(bodyText));
      check("16. Vorname stammt aus dem Account (Profil leer) — 'Hallo, Greta.'", /Hallo,\s*Greta\./.test(bodyText), bodyText.slice(0, 80));
      check("17. Normale App NICHT sichtbar (keine Dock-Navigation/Views)", await page.evaluate(() => !document.querySelector(".mobile-dock") && !document.querySelector("[data-view]")));
      check("18. KEINE erneute Loginseite (kein Login-/Passwort-Login-Formular)", await page.evaluate(() => !document.querySelector("#loginPassword") && !document.querySelector("[data-login]") && !/Anmelden/.test(document.body.innerText)));
      check("Kein Renderer-Crash, keine unbehandelten JS-Fehler beim App-Boot", !crashed && perr.length === 0, perr.slice(0, 2).join(" | "));

      // #14/#19 Angemeldet bleiben + Reload behält Sitzung + Onboarding.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#onbRoot") && /Hallo,/.test(document.body.innerText), null, { timeout: 20000 });
      check("14./19. Reload während Onboarding behält Sitzung + Begrüßung (kein Login)", await page.evaluate(() => Boolean(document.querySelector("#onbRoot")) && !document.querySelector("#loginPassword")));

      await ctx.close();
    }

    // ═══ 2) UNGÜLTIGER/ABGELAUFENER TOKEN → ehrlicher Fehler (#21) ════════════
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(`${base}/passwort-setzen?token=ungueltig-xyz`, { waitUntil: "load", timeout: 20000 });
      await page.waitForSelector("#expiredView:not([hidden])", { timeout: 8000 });
      check("21. Ungültiger/abgelaufener Token zeigt ehrlichen Fehler (kein Formular)",
        (await page.isHidden("#formView")) && /abgelaufen|bereits verwendet/i.test(await page.textContent("#expiredView")));
      await ctx.close();
    }

    // ═══ 3) FEHLGESCHLAGENE SITZUNGSPRÜFUNG → kein falscher Erfolg (#22) ══════
    {
      const created = await newInvite("Fehler Fall", "fehler-e2e@example.org");
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", bypassCSP: true });
      const page = await ctx.newPage();
      // Sitzungsprüfung künstlich als "nicht angemeldet" beantworten (set-password
      // selbst läuft echt) -> die Seite darf NICHT als Erfolg weiterleiten.
      await page.route(/\/api\/auth\/session/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }));
      let navigatedToApp = false;
      page.on("framenavigated", (fr) => { try { if (fr === page.mainFrame() && new URL(fr.url()).pathname === "/") navigatedToApp = true; } catch (_) {} });
      await page.goto(`${base}/passwort-setzen?token=${encodeURIComponent(tokenOf(created.inviteUrl))}`, { waitUntil: "load", timeout: 20000 });
      await page.waitForSelector("#formView:not([hidden])", { timeout: 8000 });
      await page.fill("#pw1", "geheim-passwort-1");
      await page.fill("#pw2", "geheim-passwort-1");
      await page.click("#setSubmit");
      await page.waitForSelector("#errorView:not([hidden])", { timeout: 8000 });
      check("22. Fehlgeschlagene Sitzungsprüfung → ruhiger Fehler mit 'Erneut versuchen' (kein falscher Erfolg)",
        (await page.isVisible("#errorView")) && (await page.isVisible("#errorRetry")));
      check("22b. KEINE Weiterleitung in die App bei unbestätigter Sitzung", navigatedToApp === false);
      await ctx.close();
    }

    // ═══ 3b) reduced-motion: Übergangs-Schein ist stillgestellt ══════════════
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(`${base}/passwort-setzen?token=ungueltig-xyz`, { waitUntil: "load", timeout: 20000 });
      const anim = await page.evaluate(() => {
        var v = document.getElementById("activatingView"); if (v) v.hidden = false;
        var g = document.querySelector(".activating-glow");
        return g ? getComputedStyle(g).animationName : "none";
      });
      check("Reduced Motion: Übergangs-Schein pulsiert nicht (animation-name none)", anim === "none", anim);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  // ═══ 4) MANDANTENTRENNUNG unverändert (HTTP, #25) ══════════════════════════
  const server2 = http.createServer(handler);
  await new Promise((r) => server2.listen(0, "127.0.0.1", r));
  const port2 = server2.address().port;
  try {
    const a = await req(port2, "POST", "/api/admin/users", { headers: adminWrite, body: { name: "Tenant A", email: "tenant-a@example.org", role: "abgeordneter" } });
    const aJson = parse(a.body);
    const aSet = await req(port2, "POST", "/api/auth/set-password", { body: { token: tokenOf(aJson.inviteUrl), password: "geheim-passwort-1" } });
    const b = await req(port2, "POST", "/api/admin/users", { headers: adminWrite, body: { name: "Tenant B", email: "tenant-b@example.org", role: "abgeordneter" } });
    const bJson = parse(b.body);
    const bSet = await req(port2, "POST", "/api/auth/set-password", { body: { token: tokenOf(bJson.inviteUrl), password: "geheim-passwort-1" } });
    const bCookie = String(bSet.headers["set-cookie"][0]).split(";")[0];
    const cross = await req(port2, "GET", `/api/app/start?politicianId=${encodeURIComponent(aJson.politicianId)}`, { headers: { Cookie: bCookie } });
    const crossJson = parse(cross.body);
    check("25. Mandantentrennung: B wird trotz fremder politicianId auf sein EIGENES Mandat gepinnt",
      cross.status === 200 && crossJson.profile && crossJson.profile.id === bJson.politicianId, `pid=${crossJson.profile && crossJson.profile.id}`);
    // Gegenprobe: B's frisches Profil ist NICHT einsatzbereit (Onboarding fällig).
    check("3. Frisches Abgeordnetenprofil ist NICHT einsatzbereit (Onboarding fällig)",
      crossJson.profile && isProfileOperational(crossJson.profile) === false);
  } finally { await new Promise((r) => server2.close(r)); }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Erstlogin-Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
