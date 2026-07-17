"use strict";

// Browser-/Mobile-Smoke (Audit-Fix 2026-07, Sprint 5): Die 564-KB-SPA wurde von
// keinem Test je in einem echten Browser geladen — Boot-Fehler auf dem Handy des
// Nutzers blieben bis zur Nutzerbeschwerde unentdeckt (Splash-Hänger-Klasse).
// Dieser Smoke bootet den ECHTEN server.js-Handler lokal (Pilot-Modus, lokaler
// Datei-Store, kein Supabase, kein LLM, kein externes Netz) und lädt die App in
// Chromium — Desktop (1280x800) und Mobil (390x844, iPhone-artig, Touch).
//
// Geprüft: App bootet (kein Splash-Hänger), keine fatalen JS-Fehler, die vier
// Bereiche Lage/Radar/Briefing/Büro sind erreichbar, mobile Navigation existiert.
//
// Voraussetzung: Playwright (in CI: npx playwright install chromium). Ohne
// Playwright wird der Test LOKAL mit klarer Meldung ÜBERSPRUNGEN (Exit 0) — die
// Offline-Suite bleibt dependency-frei lauffähig.
//
// FAIL-CLOSED in CI (Audit-Folgebranch 2026-07): Der SKIP-Pfad war fail-open —
// ein kaputt installiertes Playwright hätte das Merge-Gate grün gemacht, ohne
// irgendetwas zu testen. Deshalb bricht der Test mit Exit 1 ab, wenn Playwright
// fehlt UND CI=true (GitHub Actions setzt CI=true automatisch in ALLEN Jobs)
// oder HELMUT_REQUIRE_BROWSER=1 gesetzt ist (der browser-smoke-Job in
// .github/workflows/ci.yml installiert Playwright+Chromium selbst und setzt das
// Flag zusätzlich explizit). EINZIGE Ausnahme: unter run-offline-tests.js
// (HELMUT_OFFLINE_TEST=1) bleibt SKIP auch in CI erlaubt, denn der
// offline-suite-Job ist bewusst dependency-frei — die Browser-Pflicht liegt
// beim dedizierten browser-smoke-Job. HELMUT_REQUIRE_BROWSER=1 überstimmt
// diese Ausnahme.

const http = require("http");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

function loadPlaywright() {
  const candidates = [
    "playwright",
    // global installiertes Playwright (z. B. /opt/node22/lib/node_modules)
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* nächster Kandidat */ }
  }
  return null;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

(async () => {
  const playwright = loadPlaywright();
  if (!playwright) {
    // Fail-closed-Regel siehe Kopfkommentar: in CI (bzw. mit
    // HELMUT_REQUIRE_BROWSER=1) darf fehlendes Playwright NICHT still grün sein.
    const requireBrowser = process.env.HELMUT_REQUIRE_BROWSER === "1"
      || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) {
      console.error("FAIL  Playwright/Chromium fehlt, aber der Browser-Smoke ist hier verpflichtend");
      console.error("      (CI=true bzw. HELMUT_REQUIRE_BROWSER=1). Ein SKIP wäre fail-open:");
      console.error("      das Merge-Gate würde grün, ohne dass die App je in einem Browser lief.");
      console.error("      Fix: npm i --no-save playwright && npx playwright install --with-deps chromium");
      process.exit(1);
    }
    console.log("SKIP  Playwright nicht installiert — Browser-Smoke übersprungen (nur lokal/offline-suite zulässig).");
    console.log("      In CI: npx playwright install chromium && node scripts/browser-smoke-test.js");
    process.exit(0);
  }

  // Lokaler Pilot-Modus ohne externe Dienste; Store-Dateien werden gesichert.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HELMUT_AUTH_MODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_KEY;
  // Mandantenneutralisierung: Es gibt keinen Code-Standardmandanten mehr — das
  // Pilotgate braucht ein KONFIGURIERTES Mandat + gespeichertes Profil (wie in
  // Production, dort via Vercel-Env + Datenbank-Datensatz).
  process.env.HELMUT_PILOT_TENANT_ID = "test-politician-one";
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_STORE_CACHE_MS = "0";
  const dataDir = path.join(root, ".helmut-data");
  const guarded = ["auth.json", "store.json", "p-test-politician-one.json"].map((name) => {
    const file = path.join(dataDir, name);
    return { file, content: fs.existsSync(file) ? fs.readFileSync(file) : null };
  });
  const restore = () => {
    for (const { file, content } of guarded) {
      try {
        if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
        else fs.writeFileSync(file, content);
      } catch (_) { /* Hygiene */ }
    }
  };
  process.on("exit", restore);

  const handler = require(path.join(root, "server.js"));
  // Profil des Test-Mandats als normalen Datensatz in den lokalen Store legen
  // (die App laedt Profildaten ausschliesslich aus dem Store, nie aus Code).
  const { testPoliticianOne } = require(path.join(root, "scripts", "fixtures", "test-profiles"));
  await require(path.join(root, "lib", "helmut", "storage")).saveProfile({ ...testPoliticianOne });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // Container-taugliche Flags: ohne --no-sandbox/--disable-dev-shm-usage stürzt
  // Chromium in CI-/Sandbox-Umgebungen ab ("Target crashed").
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  try {
    for (const [label, viewport, isMobile] of [
      ["Desktop 1280x800", { width: 1280, height: 800 }, false],
      ["Mobil 390x844", { width: 390, height: 844 }, true]
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile,
        hasTouch: isMobile,
        // Service Worker BLOCKIEREN: in Sandbox-/Container-Chromium crasht die
        // SW-Registrierung den Renderer ("Target crashed") — reproduziert auch am
        // unveraenderten Basisstand, keine App-Regression. Der Smoke prueft den
        // App-Boot deterministisch OHNE SW; das SW-Verhalten selbst (sw.js) ist
        // damit bewusst NICHT abgedeckt (bekannte Luecke, nur am echten Geraet
        // pruefbar).
        serviceWorkers: "block",
        // CSP der App erlaubt kein 'unsafe-eval' — Playwrights String-Evaluate
        // wuerde sonst als Pageerror auftauchen und die Fehlerpruefung verfaelschen.
        bypassCSP: true,
        userAgent: isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : undefined
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (err) => pageErrors.push(String(err && err.message || err)));
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      // Client geladen + Splash weg (der 8s-Watchdog in index.html würde sonst
      // die Neu-laden-Karte zeigen — genau der Fehlerfall, den wir abfangen).
      await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 })
        .catch(() => {});
      const clientLoaded = await page.evaluate("window.__helmutClientLoaded === true").catch(() => false);
      check(`${label}: client.js bootet (__helmutClientLoaded)`, clientLoaded);

      await page.waitForFunction("!document.body.classList.contains('is-loading')", null, { timeout: 20000 }).catch(() => {});
      const splashGone = await page.evaluate("!document.body.classList.contains('is-loading')").catch(() => false);
      check(`${label}: Splash verschwindet (kein Boot-Hänger)`, splashGone);

      check(`${label}: keine unbehandelten JS-Fehler beim Boot`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

      const html = await page.content();
      check(`${label}: App-Shell gerendert (app-frame vorhanden)`, html.includes("app-frame") || html.includes("pilot"),
        html.slice(0, 120));

      // Die vier Bereiche: im Pilot-Modus ohne Code ist ggf. das Pilot-Gate zu sehen —
      // lokal (nicht production-like) ist die App offen. Navigation prüfen, wenn da.
      // Historische View-IDs (siehe Briefing-Reiter-Umbenennung): "briefing" =
      // Lage-Reiter, "helmut" = Briefing-Reiter, "office" = Buero.
      const navCount = await page.evaluate(`
        ["briefing", "radar", "helmut", "office"].filter((v) =>
          document.querySelector('[data-view="' + v + '"]')
        ).length
      `).catch(() => 0);
      check(`${label}: Navigation zu den vier Bereichen vorhanden`, navCount === 4, `gefunden=${navCount}/4`);

      if (navCount === 4) {
        // NICHT-tautologisch (Review-Fix): Die frueheren Marker-Regexe (radar,
        // hstand|helmut, ...) liefen gegen das KOMPLETTE page.content() — die
        // Begriffe stehen aber immer in der Navigation selbst, die Assertion
        // konnte also nie fehlschlagen. Jetzt wird der ECHTE View-Wechsel
        // geprueft: render() markiert nach dem Klick genau den Nav-Button des
        // aktiven Views mit der Klasse "active" (client.js isMobileNavActive).
        for (const view of ["radar", "helmut", "office", "briefing"]) {
          await page.evaluate(`document.querySelector('[data-view="${view}"]').click()`);
          await page.waitForTimeout(250);
          const activeIsView = await page.evaluate(`Boolean(document.querySelector('[data-view="${view}"].active'))`).catch(() => false);
          const othersActive = await page.evaluate(`
            ["radar", "helmut", "office", "briefing"].filter((v) => v !== "${view}" && document.querySelector('[data-view="' + v + '"].active')).length
          `).catch(() => -1);
          check(`${label}: Bereich '${view}' rendert (Nav aktiv, andere inaktiv)`, activeIsView && othersActive === 0, `active=${activeIsView} andere=${othersActive}`);
        }
        check(`${label}: keine neuen JS-Fehler bei Tab-Wechseln`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
      }

      if (isMobile) {
        const dock = await page.evaluate(`Boolean(document.querySelector(".mobile-dock"))`).catch(() => false);
        check(`${label}: mobile Dock-Navigation vorhanden`, dock);
      }
      await context.close();
    }

    // ── Querformat-Sperre (Smartphone-only) ─────────────────────────────────
    // Reale Viewport-/Touch-Emulation statt Annahmen: prueft, dass die Sperre
    // NUR bei Smartphone+Querformat sichtbar UND blockierend ist, waehrend
    // Hochformat, Tablet (beide Ausrichtungen) und Desktop (auch schmal/kurz)
    // unberuehrt bleiben — genau die im Auftrag geforderten vier Faelle plus
    // ein Desktop-Stresstest.
    for (const device of [
      { label: "Smartphone Hochformat 390x844", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, expectLocked: false },
      { label: "Smartphone Querformat 844x390", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, expectLocked: true },
      { label: "Tablet Hochformat 768x1024", viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, expectLocked: false },
      { label: "Tablet Querformat 1024x768", viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true, expectLocked: false },
      { label: "Desktop schmal/kurz 400x480 (Maus)", viewport: { width: 400, height: 480 }, isMobile: false, hasTouch: false, expectLocked: false }
    ]) {
      const context = await browser.newContext({
        viewport: device.viewport,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        serviceWorkers: "block",
        bypassCSP: true,
        userAgent: device.isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : (device.hasTouch
              ? "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              : undefined)
      });
      const page = await context.newPage();
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 }).catch(() => {});
      await page.waitForFunction("!document.body.classList.contains('is-loading')", null, { timeout: 20000 }).catch(() => {});

      const display = await page.evaluate(`getComputedStyle(document.getElementById("orientationLock")).display`).catch(() => "FEHLER");
      const isLocked = display !== "none";
      check(`${device.label}: Sperr-Overlay ${device.expectLocked ? "sichtbar" : "verborgen"} (display=${display})`,
        isLocked === device.expectLocked, `erwartet expectLocked=${device.expectLocked}`);

      // Hit-Test in der Bildschirmmitte: beweist, dass die Sperre bei Sichtbarkeit
      // die App wirklich BLOCKIERT (nicht nur optisch ueberdeckt, sondern auch das
      // dahinterliegende #app fuer Zeigereingaben unerreichbar macht) bzw. dass die
      // App in allen anderen Faellen normal bedienbar bleibt.
      const w = device.viewport.width, h = device.viewport.height;
      const hitsLock = await page.evaluate(
        `Boolean(document.elementFromPoint(${Math.floor(w / 2)}, ${Math.floor(h / 2)})?.closest(".orientation-lock"))`
      ).catch(() => false);
      check(`${device.label}: Bildschirmmitte ${device.expectLocked ? "von der Sperre eingenommen (App nicht bedienbar)" : "erreicht die App (nicht blockiert)"}`,
        hitsLock === device.expectLocked);

      if (device.expectLocked) {
        const text = await page.evaluate(`document.getElementById("orientationLock").textContent`).catch(() => "");
        check(`${device.label}: Sperrtext enthaelt die geforderte Aufforderung`,
          text.includes("Bitte drehe dein Smartphone ins Hochformat, um Helmut zu verwenden."));
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
