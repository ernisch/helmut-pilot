"use strict";

// Browser-Test der Erstkonfiguration in ECHTEM Chromium (Ergänzung zum
// vm-Sandbox-Test scripts/onboarding-flow-test.js, der KEIN Layout/Scroll/CSS
// prüfen kann). Bootet den echten server.js-Handler (Pilot-Modus, lokaler
// Datei-Store, KEIN Supabase/LLM/externes Netz), lädt die App inkl. styles.css,
// und schaltet dann per page.evaluate die Erstkonfiguration frei (kein Netz-
// Lookup — die Screens werden direkt gerendert). Geprüft werden genau die vom
// Auftrag geforderten Layout-/Interaktions-Eigenschaften, die nur im Browser
// messbar sind:
//   1. Scroll-Stabilität: eine Auswahl (Chip/Row) springt NICHT nach oben und
//      löst KEIN Voll-Neurender aus (In-Place-Toggle) — Scrollposition bleibt,
//      ein vor dem Klick gesetzter DOM-Marker überlebt, das Element wird aktiv.
//   2. Bestätigungskarte (S3 gefunden) ist gerendert und sichtbar.
//   3. Review-Überschrift „Dein Profil im Überblick" ist oben NICHT angeschnitten.
//   4. Feste Aktionsleiste überdeckt den Inhalt nicht (Flex-Geschwister, kein
//      overlay) + genügend Fußabstand.
//   5. Kein horizontaler Überlauf (Android-Viewport 360x800).
//   6. reduced-motion: dezenter Puls (.ho-pulse) ist stillgestellt; ohne die
//      Einstellung läuft er (Nachweis, dass die Präferenz wirklich greift).
//
// Playwright-Handhabung wie scripts/browser-smoke-test.js: fehlt Playwright, wird
// LOKAL sauber ÜBERSPRUNGEN (Exit 0), in CI (CI=true bzw. HELMUT_REQUIRE_BROWSER=1,
// außerhalb der bewusst dependency-freien Offline-Suite) FAIL-CLOSED (Exit 1).

const http = require("http");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

function loadPlaywright() {
  const candidates = [
    "playwright",
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* nächster Kandidat */ }
  }
  return null;
}

// Container-/CI-Portabilität: normal starten; fehlt das exakt gepinnte Browser-
// Binary (lokale Sandbox mit vorinstalliertem, anders versioniertem Chromium),
// via executablePath auf das vorhandene Chromium ausweichen statt herunterzuladen.
async function launchChromium(playwright) {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  try {
    return await playwright.chromium.launch({ headless: true, args });
  } catch (err) {
    const fallback = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
    if (fs.existsSync(fallback)) {
      return await playwright.chromium.launch({ headless: true, args, executablePath: fallback });
    }
    throw err;
  }
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Schaltet die Erstkonfiguration im Browser frei und rendert einen Schritt direkt
// (ohne Netz-Lookup). Läuft im Seitenkontext; greift die globalen let-Bindungen
// von client.js (gemeinsame globale Lexikalumgebung — wie die DevTools-Konsole).
function renderStepInPage(opts) {
  /* eslint-disable no-undef */
  const o = opts || {};
  currentUser = { role: "abgeordneter", name: "Katrin Vogt" };
  authState = { authenticated: true };
  previewMode = false;
  activePoliticianId = "mandat-test";
  profile = { id: "mandat-test", onboardingStatus: "neu", fullName: "" };
  onbSeedDraftFromProfile();
  Object.assign(onboardingDraft, o.draft || {});
  onboardingUi = Object.assign(
    { scanPhase: 3, lookup: { status: "idle", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "", pct: null },
    o.ui || {}
  );
  onboardingActive = true;
  onboardingStep = o.step;
  renderOnboardingFlow();
  return document.querySelector("#onbRoot") ? true : false;
  /* eslint-enable no-undef */
}

(async () => {
  const playwright = loadPlaywright();
  if (!playwright) {
    const requireBrowser = process.env.HELMUT_REQUIRE_BROWSER === "1"
      || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) {
      console.error("FAIL  Playwright/Chromium fehlt, aber der Onboarding-Browser-Test ist hier verpflichtend");
      console.error("      (CI=true bzw. HELMUT_REQUIRE_BROWSER=1). Fix: npm i --no-save playwright && npx playwright install --with-deps chromium");
      process.exit(1);
    }
    console.log("SKIP  Playwright nicht installiert — Onboarding-Browser-Test übersprungen (nur lokal/offline-suite zulässig).");
    process.exit(0);
  }

  // Lokaler Pilot-Modus ohne externe Dienste; Store-Dateien werden gesichert.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HELMUT_AUTH_MODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_KEY;
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
  const { testPoliticianOne } = require(path.join(root, "scripts", "fixtures", "test-profiles"));
  const storage = require(path.join(root, "lib", "helmut", "storage"));
  const clean = await storage.readStore("main");
  clean.profiles = {}; clean.mandateProfiles = {};
  await storage.writeStore(clean, "main");
  await storage.saveProfile({ ...testPoliticianOne });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await launchChromium(playwright);

  async function bootPage(context) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String((err && err.message) || err)));
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 }).catch(() => {});
    return { page, pageErrors };
  }

  try {
    // ── 1) Scroll-Stabilität + kein Voll-Neurender (mobil 390x844) ───────────
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", bypassCSP: true });
      const { page, pageErrors } = await bootPage(context);

      // S4 (Zuständigkeiten) hat eine lange Auswahl-Liste -> scrollbarer Body.
      const rendered = await page.evaluate(renderStepInPage, { step: 4 });
      check("S4 gerendert (onbRoot vorhanden)", rendered === true);

      // Body nach unten scrollen, DOM-Marker setzen, dann eine Auswahl anklicken.
      const result = await page.evaluate(() => {
        const body = document.querySelector(".ho-body");
        body.scrollTop = 160;
        const before = body.scrollTop;
        body.setAttribute("data-keep", "1"); // überlebt NUR ohne Voll-Neurender
        const rows = Array.from(document.querySelectorAll(".ho-row, .ho-chip"));
        // eine sichtbare, noch nicht aktive Auswahl im gescrollten Bereich
        const target = rows.find((r) => !r.classList.contains("is-on"));
        const wasOn = target.classList.contains("is-on");
        target.click();
        const bodyAfter = document.querySelector(".ho-body");
        return {
          before,
          after: bodyAfter.scrollTop,
          markerSurvived: bodyAfter.getAttribute("data-keep") === "1",
          sameNode: bodyAfter === body,
          toggledOn: target.classList.contains("is-on") && !wasOn
        };
      });
      check("Scroll-Stabilität: Position bleibt nach Auswahl erhalten", Math.abs(result.after - result.before) <= 2, `before=${result.before} after=${result.after}`);
      check("Kein Voll-Neurender: Body-Knoten identisch + DOM-Marker überlebt", result.sameNode && result.markerSurvived);
      check("Auswahl greift: Element wurde in-place aktiv (.is-on)", result.toggledOn);
      check("Keine JS-Fehler bei der Auswahl", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

      // ── 2) Bestätigungskarte (S3 gefunden) sichtbar ──────────────────────────
      await page.evaluate(renderStepInPage, { step: 3, draft: { fullName: "Katrin Vogt", party: "Die Linke", faction: "Die Linke", parliamentType: "Bundestag", constituency: "Salzgitter", committees: ["Gesundheit"] }, ui: { lookup: { status: "found", candidates: [], warnings: [] } } });
      const card = await page.evaluate(() => {
        const el = document.querySelector(".ho-card");
        const h2 = Array.from(document.querySelectorAll(".ho-h2")).find((n) => /gefunden/i.test(n.textContent));
        const r = el ? el.getBoundingClientRect() : null;
        return { hasCard: !!el, cardVisible: !!r && r.width > 0 && r.height > 0, heading: h2 ? h2.textContent.trim() : "" };
      });
      check("S3 Bestätigungskarte gerendert + sichtbar", card.hasCard && card.cardVisible);
      check("S3 Überschrift 'Ich habe dein Mandat gefunden.'", /Ich habe dein Mandat gefunden\./.test(card.heading), card.heading);

      // ── 3) Review-Überschrift NICHT oben angeschnitten (S11) ────────────────
      await page.evaluate(renderStepInPage, { step: 11, draft: { fullName: "Katrin Vogt", party: "Die Linke", parliamentType: "Bundestag", constituency: "Salzgitter", state: "Niedersachsen", committees: ["Gesundheit"], focusTopics: ["Rente"] } });
      const head = await page.evaluate(() => {
        const body = document.querySelector(".ho-body");
        const h2 = Array.from(document.querySelectorAll(".ho-h2")).find((n) => /Profil im Überblick/.test(n.textContent));
        if (!body || !h2) return { ok: false };
        const b = body.getBoundingClientRect();
        const h = h2.getBoundingClientRect();
        const cs = getComputedStyle(h2);
        const lineH = parseFloat(cs.fontSize) * 1.05; // eine Zeile Mindesthöhe
        return {
          ok: true,
          notClippedTop: h.top >= b.top - 1,        // Oberkante nicht über dem Sichtfenster
          fullyBelowChrome: h.top >= b.top,
          fullHeight: h.height >= lineH,            // volle Glyphenhöhe (nicht abgeschnitten)
          withinBody: h.bottom <= b.bottom + 1,
          bodyScrollTop: body.scrollTop
        };
      });
      check("S11 Überschrift vorhanden + vermessen", head.ok === true);
      check("S11 'Dein Profil im Überblick' oben NICHT angeschnitten", head.notClippedTop && head.fullHeight, JSON.stringify(head));
      check("S11 Body startet oben (frischer Render, kein Rest-Scroll)", head.bodyScrollTop === 0, `scrollTop=${head.bodyScrollTop}`);

      // ── 4) Aktionsleiste überdeckt Inhalt nicht + Fußabstand ────────────────
      const bar = await page.evaluate(() => {
        const body = document.querySelector(".ho-body");
        const barEl = document.querySelector(".ho-actionbar");
        if (!body || !barEl) return { ok: false };
        const b = body.getBoundingClientRect();
        const a = barEl.getBoundingClientRect();
        const csBody = getComputedStyle(body);
        return { ok: true, noOverlap: a.top >= b.bottom - 2, padBottom: parseFloat(csBody.paddingBottom) };
      });
      check("S11 feste Aktionsleiste liegt UNTER dem Body (keine Überdeckung)", bar.ok && bar.noOverlap, JSON.stringify(bar));
      check("S11 Body hat ausreichenden Fußabstand (>= 16px)", bar.ok && bar.padBottom >= 16, `padBottom=${bar.padBottom}`);

      await context.close();
    }

    // ── 5) Kein horizontaler Überlauf (Android-Viewport 360x800) ─────────────
    {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block", bypassCSP: true });
      const { page } = await bootPage(context);
      let worstOverflow = 0;
      for (const step of [0, 3, 4, 8, 11]) {
        await page.evaluate(renderStepInPage, { step, draft: { fullName: "Katrin Vogt", party: "Die Linke", parliamentType: "Bundestag", constituency: "Salzgitter", state: "Niedersachsen", committees: ["Gesundheit"], focusTopics: ["Rente"] }, ui: { lookup: { status: "found", candidates: [], warnings: [] } } });
        const ov = await page.evaluate(() => {
          const rootEl = document.querySelector("#onbRoot");
          const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const rootOverflow = rootEl ? rootEl.scrollWidth - rootEl.clientWidth : 0;
          return Math.max(docOverflow, rootOverflow);
        });
        worstOverflow = Math.max(worstOverflow, ov);
        check(`Android 360px: Schritt ${step} ohne horizontalen Überlauf`, ov <= 1, `overflow=${ov}px`);
      }
      check("Android 360px: kein Schritt erzeugt Querscrollen", worstOverflow <= 1, `max=${worstOverflow}px`);
      await context.close();
    }

    // ── 6) reduced-motion stellt den Puls still (und läuft sonst) ────────────
    {
      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", bypassCSP: true });
      const { page } = await bootPage(reduced);
      await page.evaluate(renderStepInPage, { step: 0 });
      const durReduced = await page.evaluate(() => {
        const el = document.querySelector(".ho-pulse");
        return el ? getComputedStyle(el).animationDuration : "none";
      });
      check("reduced-motion: Puls-Animation stillgestellt (Dauer ~0)", durReduced !== "none" && parseFloat(durReduced) <= 0.01, `dauer=${durReduced}`);
      await reduced.close();

      const normal = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", serviceWorkers: "block", bypassCSP: true });
      const np = await bootPage(normal);
      await np.page.evaluate(renderStepInPage, 0);
      const durNormal = await np.page.evaluate(() => {
        const el = document.querySelector(".ho-pulse");
        return el ? getComputedStyle(el).animationDuration : "none";
      });
      check("Ohne Präferenz: Puls läuft tatsächlich (Dauer > 1s) — Präferenz greift nachweislich", durNormal !== "none" && parseFloat(durNormal) >= 1, `dauer=${durNormal}`);
      await normal.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
