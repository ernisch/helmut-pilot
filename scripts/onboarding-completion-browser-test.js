"use strict";

// Echter Browser-Test des ABSCHLUSS-MOMENTS nach erfolgreichem Speichern des
// Onboardings (PR #112, Auftrag "Abschluss nach erfolgreichem Speichern"):
// echtes Konto, echte Sitzung, echter PATCH auf /api/profile/current, echter
// automatischer Übergang in die App. Ergänzt scripts/onboarding-browser-test.js
// (Layout/CSS/Timing im vm-losen DOM) um den ECHTEN Netzwerk-Roundtrip, die
// echte Sitzung und die echte Mandantentrennung — nicht nur simuliert.
//
// Geprüft werden genau die vom Auftrag geforderten Punkte:
//   - Abschluss-Screen erscheint NUR nach nachweislich erfolgreichem Speichern
//   - Persönliche Begrüßung mit korrektem Vornamen aus dem bestätigten Profil
//   - Automatischer, klickloser Übergang in die App, Ziel-Bereich Lage
//   - Kein anderer Bereich blitzt vorher auf (MutationObserver ab Dokumentstart)
//   - Fehlgeschlagenes Speichern: kein Erfolg, kein Redirect, ruhiger Fehler,
//     Wiederholung möglich
//   - reduced-motion: kürzere, bewegungsfreie Sequenz, landet trotzdem in Lage
//   - Sitzung bleibt nach dem Übergang gültig; Mandantentrennung unverändert
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

// Beobachtet ab Dokumentstart (vor jeglichem App-JS), welcher Bereich
// (data-view) als ERSTES aktiv wird — Nachweis, dass kein anderer Bereich
// (Briefing/Radar/Büro/Profil) vor Lage aufblitzt. Überlebt echte Reloads,
// da als Init-Skript pro Navigation im Kontext neu installiert.
function installViewFlashObserver() {
  window.__viewFlashLog = [];
  const seen = new Set();
  const scan = (r) => {
    if (!r || !r.querySelectorAll) return;
    r.querySelectorAll("[data-view].active").forEach((el) => {
      const v = el.getAttribute("data-view");
      if (v && !seen.has(v)) { seen.add(v); window.__viewFlashLog.push({ view: v, t: performance.now() }); }
    });
  };
  const start = () => {
    scan(document);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes) m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); });
        if (m.type === "attributes") scan(document);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

// Setzt im Seitenkontext ein minimales, aber gültiges Mandat direkt in den
// Entwurf (KEINE Änderung an der Mandatssuche — der Lookup wird hier bewusst
// übersprungen, es wird nur der bereits bestehende Entwurfszustand befüllt,
// genau wie es die echte Suche am Ende von S3 ebenfalls täte) und rendert S11,
// bevor der echte Abschluss (onbComplete) ausgelöst wird.
function seedDraftAndGotoReview(fullName) {
  /* eslint-disable no-undef */
  Object.assign(onboardingDraft, {
    fullName,
    party: "SPD",
    faction: "SPD",
    parliamentType: "Bundestag",
    constituency: "Salzgitter",
    state: "Niedersachsen",
    committees: ["Gesundheit"],
    focusTopics: ["Rente"],
    instant: [],
    briefTime: "07:00",
    briefDepth: "kompakt",
    maxPrio: 3
  });
  onboardingStep = 11;
  renderOnboardingFlow();
  /* eslint-enable no-undef */
}

// Wie seedDraftAndGotoReview, aber landet auf S10 (Datenschutz) statt direkt auf
// S11 -- damit der Test den ECHTEN, unveränderten Übergang S10->S11 durchläuft
// (Klick auf [data-onb-privacygo] -> onbPersistStep() UNAWAITED + onbGoto(11)).
// Genau dieser Übergang war die Ursache des gemeldeten P0: S11 wurde dadurch
// immer mit onboardingUi.saving=true gerendert (Button disabled + "Speichert …"),
// und der Button wurde beim Abklingen der Zwischenspeicherung nie nachgezogen.
function seedDraftAndGotoPrivacy(fullName) {
  /* eslint-disable no-undef */
  Object.assign(onboardingDraft, {
    fullName,
    party: "SPD",
    faction: "SPD",
    parliamentType: "Bundestag",
    constituency: "Salzgitter",
    state: "Niedersachsen",
    committees: ["Gesundheit"],
    focusTopics: ["Rente"],
    instant: [],
    briefTime: "07:00",
    briefDepth: "kompakt",
    maxPrio: 3
  });
  onboardingStep = 10;
  renderOnboardingFlow();
  /* eslint-enable no-undef */
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    const requireBrowser = process.env.HELMUT_REQUIRE_BROWSER === "1" || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) { console.error("FAIL  Playwright fehlt, Browser-Test hier verpflichtend."); process.exit(1); }
    console.log("SKIP  Playwright nicht installiert — Abschluss-Browser-Test übersprungen.");
    process.exit(0);
  }

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  await accounts.createUser({ email: "admin-completion-e2e@example.org", name: "Admin E2E", role: "admin", password: "sicher-genug-1" });
  const adminLogin = await req(port, "POST", "/api/auth/login", { body: { email: "admin-completion-e2e@example.org", password: "sicher-genug-1" } });
  const adminCookie = String(adminLogin.headers["set-cookie"][0]).split(";")[0];
  const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
  const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };
  async function newInvite(name, email) {
    return parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: { name, email, role: "abgeordneter" } })).body);
  }
  async function setPassword(inviteUrl) {
    const set = await req(port, "POST", "/api/auth/set-password", { body: { token: tokenOf(inviteUrl), password: "geheim-passwort-1" } });
    return { cookie: String(set.headers["set-cookie"][0]).split(";")[0] };
  }
  const browser = await launch(pw);
  try {
    // ═══ 1) ERFOLGREICHES SPEICHERN: Abschluss-Screen, Begrüßung, automatischer,
    // klickloser Übergang nach Lage — kein anderer Bereich blitzt vorher auf ═══
    {
      const created = await newInvite("Mara Vogel", "mara-completion-e2e@example.org");
      const { cookie } = await setPassword(created.inviteUrl);

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference", serviceWorkers: "block", bypassCSP: true });
      await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base }]);
      await ctx.addInitScript(installViewFlashObserver);
      const page = await ctx.newPage();
      const perr = [];
      page.on("pageerror", (e) => perr.push(String((e && e.message) || e)));

      await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#onbRoot") !== null, null, { timeout: 20000 });
      check("Echte Sitzung bootet direkt in die Erstkonfiguration (kein erneuter Login)", true);

      // Während des Renderns von S11 (Entwurf befüllt) ist "Speichert …" NUR
      // sichtbar, solange der ECHTE Speichervorgang läuft — ruhiger Ladezustand
      // auf dem BISHERIGEN Screen, kein Spinner, kein Fortschrittsbalken.
      await page.evaluate(seedDraftAndGotoReview, "Petra Baumann");
      const reviewLabel = await page.evaluate(() => (document.querySelector("[data-onb-finish]") || {}).textContent || "");
      check("S11 vor dem Speichern: Aktionsknopf zeigt 'Profil bestätigen' (kein Ladezustand ohne Aktion)", /Profil bestätigen/.test(reviewLabel), reviewLabel);

      // Künstliche, kurze Verzögerung NUR auf den echten Speicher-Request, damit
      // der Ladezustand deterministisch (nicht wettlaufabhängig) beobachtbar ist
      // — der Speichervorgang selbst bleibt echt (echter Request, echte Antwort).
      let delayedOnce = false;
      await page.route(/\/api\/profile\/current/, async (route) => {
        if (!delayedOnce && route.request().method() === "PATCH") { delayedOnce = true; await new Promise((r) => setTimeout(r, 250)); }
        return route.continue();
      });
      const completion = page.evaluate(() => { onbComplete(); return true; });
      // Während der künstlich verlängerten, aber echten Speicherzeit: ruhiger
      // Ladezustand auf dem AKTUELLEN Screen (kein technisches "Speichert …" als
      // eigener harter Zustand, sondern nur die Beschriftung des vorhandenen
      // Knopfes ändert sich; kein Spinner, kein Fortschrittsbalken).
      await page.waitForTimeout(80);
      const duringSave = await page.evaluate(() => ({
        stillS11: !!document.querySelector("#onbRoot") && !document.querySelector(".ho-final"),
        label: (document.querySelector("[data-onb-finish]") || {}).textContent
      }));
      check("Während des echten Speicherns: aktueller Screen bleibt sichtbar (kein harter Sprung, kein Spinner)", duringSave.stillS11);
      check("Während des echten Speicherns: Knopf zeigt 'Speichert …' statt eines eigenen technischen Zustands", /Speichert/.test(duringSave.label || ""), duringSave.label);
      await completion;

      const navPromise = page.waitForNavigation({ timeout: 6000 }).catch(() => null);

      // Erst NACH S12 entfernen: die künstliche Verzögerung ist dann sicher
      // abgeklungen (route.continue() bereits aufgerufen) — unroute() während
      // ein Handler noch auf den Timer wartet, würde die noch offene Route
      // vorzeitig auflösen und beim späteren route.continue() einen Fehler
      // auslösen ("Route is already handled").
      await page.waitForFunction(() => document.querySelector(".ho-final") !== null, null, { timeout: 4000 });
      await page.unroute(/\/api\/profile\/current/);
      const ready = await page.evaluate(() => ({
        readyOn: document.getElementById("onbFinalReady")?.classList.contains("is-on"),
        readyText: (document.getElementById("onbFinalReady") || {}).textContent || "",
        hasMark: !!document.querySelector(".ho-final .ho-mark")
      }));
      check("Nach ECHTEM erfolgreichem Speichern: 'Dein Profil ist bereit.' erscheint", ready.readyOn === true && /Dein Profil ist bereit\./.test(ready.readyText));
      check("Helmut-H zentral vorhanden", ready.hasMark);

      await page.waitForFunction(() => document.getElementById("onbFinalWelcome")?.classList.contains("is-on"), null, { timeout: 3000 });
      const welcome = await page.evaluate(() => (document.getElementById("onbFinalWelcome") || {}).textContent || "");
      check("Persönliche Begrüßung crossfadet automatisch ein, korrekter Vorname aus dem BESTÄTIGTEN Profil ('Petra')",
        /Willkommen, Petra\./.test(welcome) && /Ich bin Helmut/.test(welcome) && /Ab jetzt bin ich an deiner Seite/.test(welcome), welcome);

      const navigated = await navPromise;
      check("Automatischer Übergang in die App — kein Klick, kein Swipe, kein erneuter Login", navigated !== null);

      const after = await page.evaluate(async () => {
        const sess = await fetch("/api/auth/session", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : {});
        const prof = await fetch("/api/profile/current").then((r) => r.ok ? r.json() : {});
        return { view: localStorage.getItem("helmut:view"), authenticated: sess.authenticated, fullName: prof.fullName, onboardingStatus: prof.onboardingStatus, flash: window.__viewFlashLog || [] };
      });
      check("Ziel-Bereich Lage verbindlich gesetzt, übersteht den echten Reload", after.view === "briefing", `view=${after.view}`);
      check("Sitzung bleibt nach dem Übergang gültig (kein erzwungener Logout)", after.authenticated === true);
      check("Echt gespeichert: Profil trägt den bestätigten Namen + Status 'abgeschlossen'", after.fullName === "Petra Baumann" && after.onboardingStatus === "abgeschlossen", JSON.stringify(after));
      check("Kein anderer Bereich (Briefing/Radar/Büro/Profil) blitzt vor Lage auf", after.flash.length > 0 && after.flash[0].view === "briefing", JSON.stringify(after.flash));
      check("Keine unbehandelten JS-Fehler während des gesamten Abschlusses", perr.length === 0, perr.slice(0, 2).join(" | "));

      // Die frisch gebootete normale App (nach dem echten Reload) tatsächlich
      // rendern lassen und den REALEN Navigationszustand prüfen — nicht nur den
      // persistierten Schlüssel. Grundlage ist isMobileNavActive() in client.js
      // (setzt die "active"-Klasse); das sichtbare Label wird nur als
      // Bestätigung mitgeprüft, nicht als alleinige Grundlage.
      await page.waitForSelector("[data-view].active", { timeout: 15000 });
      const navState = await page.evaluate(() => {
        const activeEls = Array.from(document.querySelectorAll("[data-view].active"));
        const helmutEls = Array.from(document.querySelectorAll('[data-view="helmut"]'));
        return {
          activeIds: activeEls.map((el) => el.getAttribute("data-view")),
          activeLabels: activeEls.map((el) => el.textContent.trim()),
          helmutAnyActive: helmutEls.some((el) => el.classList.contains("active"))
        };
      });
      check("Lage (interner Schlüssel 'briefing') ist nach dem Abschluss der aktive Bereich",
        navState.activeIds.length > 0 && navState.activeIds.every((id) => id === "briefing"), JSON.stringify(navState));
      check("Sichtbares Label des aktiven Reiters lautet 'Lage' (Bestätigung, nicht alleinige Grundlage)",
        navState.activeLabels.some((l) => /Lage/.test(l)), JSON.stringify(navState.activeLabels));
      check("Briefing (interner Schlüssel 'helmut') ist NICHT der aktive Bereich",
        navState.helmutAnyActive === false, JSON.stringify(navState));

      await ctx.close();
    }

    // ═══ 1b) P0-REGRESSION: ECHTER Klick-Pfad ab dem Datenschutz-Schritt (S10)
    // über den ECHTEN Übergang S10->S11 bis zum ECHTEN Klick auf den Abschluss-
    // Button und weiter bis Lage. Deckt genau den gemeldeten P0 ab: alle
    // anderen Abschnitte dieser Datei rufen onbComplete() direkt per
    // page.evaluate auf und übersehen dadurch, dass ein echter Tap auf den
    // Button den Handler nie erreichte (Button blieb nach der automatischen
    // Zwischenspeicherung dauerhaft disabled + "Speichert …", weil er beim
    // Abklingen des Autosaves nie in-place nachgezogen wurde) ════════════════
    {
      const created = await newInvite("Lina Prüfweg", "lina-p0-completion-e2e@example.org");
      const { cookie } = await setPassword(created.inviteUrl);

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference", serviceWorkers: "block", bypassCSP: true });
      await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base }]);
      await ctx.addInitScript(installViewFlashObserver);
      const page = await ctx.newPage();
      const perr = [];
      page.on("pageerror", (e) => perr.push(String((e && e.message) || e)));

      await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#onbRoot") !== null, null, { timeout: 20000 });
      await page.evaluate(seedDraftAndGotoPrivacy, "Lina Prüfweg");

      // Echter Klick auf den Datenschutz-Toggle, dann echter Klick auf
      // "Zustimmen & weiter" -- löst den unveränderten Produktions-Handler
      // (onbPersistStep(); onbGoto(11);) aus, GENAU wie ein echter Nutzer.
      await page.click("[data-onb-consent]");
      await page.click("[data-onb-privacygo]");

      // Sofort nach dem Übergang: S11 ist da, aber (bekannter, jetzt behobener
      // Fehlerzustand) mit laufender Zwischenspeicherung gerendert.
      const rightAfterTransition = await page.evaluate(() => ({
        onS11: !!document.querySelector("[data-onb-finish]"),
        savingFlag: onboardingUi.saving
      }));
      check("S10->S11: echter Übergang landet auf der Prüfung (S11)", rightAfterTransition.onS11);

      // Der Button MUSS sich wieder freigeben, sobald die automatische
      // Zwischenspeicherung durchgelaufen ist (P0-Fix: onbPaintSavedIndicator
      // zieht ihn jetzt in-place nach) -- das ist der Kern der Reproduktion.
      await page.waitForFunction(() => (document.getElementById("onbSaved") || {}).textContent === "Gespeichert", null, { timeout: 8000 });
      await page.waitForFunction(() => (document.querySelector("[data-onb-finish]") || {}).disabled === false, null, { timeout: 4000 });
      const afterAutosave = await page.evaluate(() => ({
        savingFlag: onboardingUi.saving,
        onbSavedText: (document.getElementById("onbSaved") || {}).textContent || null,
        finishDisabled: (document.querySelector("[data-onb-finish]") || {}).disabled,
        finishText: (document.querySelector("[data-onb-finish]") || {}).textContent
      }));
      check("P0-Kern: Abschluss-Button wird nach der Zwischenspeicherung wieder freigegeben (nicht dauerhaft 'Speichert …')",
        afterAutosave.savingFlag === false && afterAutosave.finishDisabled === false && /Profil bestätigen/.test(afterAutosave.finishText || ""),
        JSON.stringify(afterAutosave));

      // Der eigentliche Tap: muss den Handler jetzt wirklich erreichen (kein
      // Playwright-Actionability-Timeout mehr auf einem toten Button).
      const navPromise = page.waitForNavigation({ timeout: 6000 }).catch(() => null);
      let clickError = null;
      try { await page.click("[data-onb-finish]", { timeout: 4000 }); } catch (e) { clickError = String(e).split("\n")[0]; }
      check("Echter Klick auf 'Profil bestätigen' wird zugestellt (kein Actionability-Timeout auf disabled Button)", clickError === null, clickError || "");

      await page.waitForFunction(() => document.querySelector(".ho-final") !== null, null, { timeout: 4000 });
      const ready = await page.evaluate(() => ({
        readyOn: document.getElementById("onbFinalReady")?.classList.contains("is-on"),
        readyText: (document.getElementById("onbFinalReady") || {}).textContent || ""
      }));
      check("Nach echtem Klick: 'Dein Profil ist bereit.' erscheint", ready.readyOn === true && /Dein Profil ist bereit\./.test(ready.readyText));

      await page.waitForFunction(() => document.getElementById("onbFinalWelcome")?.classList.contains("is-on"), null, { timeout: 3000 });
      const welcome = await page.evaluate(() => (document.getElementById("onbFinalWelcome") || {}).textContent || "");
      check("Persönliche Begrüßung erscheint mit korrektem Vornamen", /Willkommen, Lina\./.test(welcome), welcome);

      const navigated = await navPromise;
      check("Automatischer Übergang in die App nach echtem Klick", navigated !== null);

      await page.waitForSelector("[data-view].active", { timeout: 15000 });
      const navState = await page.evaluate(() => {
        const activeEls = Array.from(document.querySelectorAll("[data-view].active"));
        return { activeIds: activeEls.map((el) => el.getAttribute("data-view")) };
      });
      check("Lage ist nach dem echten Klick-Pfad der aktive Bereich", navState.activeIds.length > 0 && navState.activeIds.every((id) => id === "briefing"), JSON.stringify(navState));

      const sessAfter = await page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : {})));
      check("Sitzung bleibt nach dem echten Klick-Pfad gültig", sessAfter.authenticated === true);
      check("Keine unbehandelten JS-Fehler beim echten Klick-Pfad", perr.length === 0, perr.slice(0, 2).join(" | "));

      await ctx.close();
    }

    // ═══ 2) FEHLGESCHLAGENES SPEICHERN: kein Erfolg, kein Redirect, ruhiger
    // Fehler, Wiederholung möglich ══════════════════════════════════════════
    {
      const created = await newInvite("Fehler Fall Zwei", "fehler-completion-e2e@example.org");
      const { cookie } = await setPassword(created.inviteUrl);

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", bypassCSP: true });
      await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base }]);
      const page = await ctx.newPage();
      let navigatedToApp = false;
      page.on("framenavigated", (fr) => { try { if (fr === page.mainFrame()) navigatedToApp = true; } catch (_) {} });

      await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#onbRoot") !== null, null, { timeout: 20000 });
      await page.evaluate(seedDraftAndGotoReview, "Fehler Fall");

      await page.route(/\/api\/profile\/current/, (route) => {
        if (route.request().method() === "PATCH") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Serverfehler" }) });
        return route.continue();
      });
      navigatedToApp = false;
      const urlBeforeFailure = page.url();
      await page.evaluate(() => onbComplete());
      await page.waitForTimeout(400);
      const failed = await page.evaluate(() => ({
        noFinal: !document.querySelector(".ho-final"),
        stillOnb: !!document.querySelector("#onbRoot"),
        errorText: document.body.innerText,
        persistedView: (() => { try { return localStorage.getItem("helmut:view"); } catch (_) { return null; } })()
      }));
      check("Fehlgeschlagenes Speichern: KEIN 'Dein Profil ist bereit.' / KEIN Willkommen-Screen", failed.noFinal);
      check("Fehlgeschlagenes Speichern: Nutzer bleibt im Onboarding (kein Redirect nach Lage)", failed.stillOnb && !navigatedToApp);
      check("Fehlgeschlagenes Speichern: ruhige, verständliche Fehlermeldung erscheint", /[Ff]ehlgeschlagen/.test(failed.errorText) && !/\bstack\b|TypeError|ReferenceError/i.test(failed.errorText));
      check("Fehlgeschlagenes Speichern: navigiert nirgendwohin (URL unverändert, kein Zielbereich persistiert)",
        page.url() === urlBeforeFailure && failed.persistedView === null, `url=${page.url()} persistedView=${failed.persistedView}`);

      // Wiederholung: Route aufheben, erneut versuchen — muss diesmal gelingen.
      await page.unroute(/\/api\/profile\/current/);
      const retryNav = page.waitForNavigation({ timeout: 6000 }).catch(() => null);
      await page.evaluate(() => onbComplete());
      await page.waitForFunction(() => document.querySelector(".ho-final") !== null, null, { timeout: 4000 });
      check("Wiederholung nach Fehler ist möglich und führt zum Erfolg", true);
      await retryNav;

      await ctx.close();
    }

    // ═══ 3) REDUCED MOTION: kürzere, bewegungsfreie Sequenz, landet trotzdem in
    // Lage — Übergänge (.ho-final-msg) sind stillgestellt ═══════════════════
    {
      const created = await newInvite("Rosa Reduced", "reduced-completion-e2e@example.org");
      const { cookie } = await setPassword(created.inviteUrl);

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", bypassCSP: true });
      await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base }]);
      const page = await ctx.newPage();
      await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#onbRoot") !== null, null, { timeout: 20000 });
      await page.evaluate(seedDraftAndGotoReview, "Rosa Reduced");

      const startedAt = Date.now();
      const navPromise = page.waitForNavigation({ timeout: 6000 }).catch(() => null);
      await page.evaluate(() => onbComplete());
      await page.waitForFunction(() => document.querySelector(".ho-final") !== null, null, { timeout: 4000 });
      const dur = await page.evaluate(() => {
        const el = document.getElementById("onbFinalWelcome");
        return el ? getComputedStyle(el).transitionDuration : "none";
      });
      check("reduced-motion: Text-Crossfade (.ho-final-msg) stillgestellt (Dauer ~0)", dur !== "none" && parseFloat(dur) <= 0.01, `dauer=${dur}`);
      await navPromise;
      const elapsedMs = Date.now() - startedAt;
      const view = await page.evaluate(() => { try { return localStorage.getItem("helmut:view"); } catch (_) { return null; } });
      check("reduced-motion: landet trotzdem verbindlich in Lage", view === "briefing", `view=${view}`);
      check("reduced-motion: Gesamtmoment bleibt kurz (kein künstliches langes Warten, < 3s)", elapsedMs < 3000, `elapsedMs=${elapsedMs}`);

      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  // ═══ 4) MANDANTENTRENNUNG bleibt bei DIESEM Abschluss-Fluss unverändert ═════
  const server2 = http.createServer(handler);
  await new Promise((r) => server2.listen(0, "127.0.0.1", r));
  const port2 = server2.address().port;
  try {
    const tenantC = parse((await req(port2, "POST", "/api/admin/users", { headers: adminWrite, body: { name: "Tenant C", email: "tenant-c-completion@example.org", role: "abgeordneter" } })).body);
    const tenantD = parse((await req(port2, "POST", "/api/admin/users", { headers: adminWrite, body: { name: "Tenant D", email: "tenant-d-completion@example.org", role: "abgeordneter" } })).body);
    const cSet = await req(port2, "POST", "/api/auth/set-password", { body: { token: tokenOf(tenantC.inviteUrl), password: "geheim-passwort-1" } });
    const cCookie = String(cSet.headers["set-cookie"][0]).split(";")[0];
    const dSet = await req(port2, "POST", "/api/auth/set-password", { body: { token: tokenOf(tenantD.inviteUrl), password: "geheim-passwort-1" } });
    const dCookie = String(dSet.headers["set-cookie"][0]).split(";")[0];

    // Tenant C schließt sein Onboarding über GENAU die Route ab, die onbComplete()
    // real aufruft — mit derselben Nachlässigkeit wie der echte Client (CSRF holen).
    const cCsrf = parse((await req(port2, "GET", "/api/security/csrf", { headers: { Cookie: cCookie } })).body).token;
    await req(port2, "PATCH", "/api/profile/current", {
      headers: { Cookie: cCookie, "x-csrf-token": cCsrf },
      body: { id: tenantC.politicianId, fullName: "Clara Tenant", party: "SPD", faction: "SPD", parliamentType: "Bundestag", onboardingStatus: "abgeschlossen", onboardingStep: 11 }
    });

    const dProfile = parse((await req(port2, "GET", "/api/profile/current", { headers: { Cookie: dCookie } })).body);
    check("Mandantentrennung: Tenant D bleibt bei EIGENEM, weiterhin frischem Profil (von C's Abschluss unberührt)",
      dProfile.id === tenantD.politicianId && dProfile.onboardingStatus !== "abgeschlossen", JSON.stringify({ id: dProfile.id, status: dProfile.onboardingStatus }));

    const cProfileAgain = parse((await req(port2, "GET", "/api/profile/current", { headers: { Cookie: cCookie } })).body);
    check("Mandantentrennung: Tenant C sieht weiterhin NUR sein eigenes, jetzt abgeschlossenes Profil",
      cProfileAgain.id === tenantC.politicianId && cProfileAgain.fullName === "Clara Tenant" && cProfileAgain.onboardingStatus === "abgeschlossen");
  } finally { await new Promise((r) => server2.close(r)); }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Abschluss-Moment-Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
