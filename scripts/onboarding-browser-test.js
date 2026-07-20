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

      // Eintritts-Animation des Screens abwarten, damit ein danach evtl. laufender
      // Entry-Effekt eindeutig einer NEUEN Auswahl zuzuordnen wäre (Determinismus).
      await page.waitForTimeout(450);
      // Body nach unten scrollen, DOM-Marker setzen, dann eine Auswahl anklicken.
      const result = await page.evaluate(() => {
        const body = document.querySelector(".ho-body");
        const screen = document.querySelector(".ho-screen");
        body.scrollTop = 160;
        const before = body.scrollTop;
        body.setAttribute("data-keep", "1"); // überlebt NUR ohne Voll-Neurender
        const rows = Array.from(document.querySelectorAll(".ho-row, .ho-chip"));
        // eine sichtbare, noch nicht aktive Auswahl im gescrollten Bereich
        const target = rows.find((r) => !r.classList.contains("is-on"));
        const wasOn = target.classList.contains("is-on");
        target.click();
        const bodyAfter = document.querySelector(".ho-body");
        const screenAfter = document.querySelector(".ho-screen");
        // Läuft nach der Auswahl irgendwo eine Eintritts-/Screen-Animation? (Sollte
        // NICHT — Chips/Toggles aktualisieren in-place, kein Neurender, kein Übergang.)
        const running = (screenAfter ? screenAfter.getAnimations({ subtree: true }) : [])
          .filter((a) => (a.animationName || "").indexOf("hoScreenIn") >= 0 && a.playState === "running").length;
        return {
          before,
          after: bodyAfter.scrollTop,
          markerSurvived: bodyAfter.getAttribute("data-keep") === "1",
          sameNode: bodyAfter === body,
          screenSameNode: screenAfter === screen,
          runningEntry: running,
          toggledOn: target.classList.contains("is-on") && !wasOn
        };
      });
      check("Scroll-Stabilität: Position bleibt nach Auswahl erhalten", Math.abs(result.after - result.before) <= 2, `before=${result.before} after=${result.after}`);
      check("Kein Voll-Neurender: Body-Knoten identisch + DOM-Marker überlebt", result.sameNode && result.markerSurvived);
      check("Kein Übergang bei Auswahl (Chips/Toggles): Screen-Knoten identisch, keine laufende Eintritts-Animation",
        result.screenSameNode && result.runningEntry === 0, `sameScreen=${result.screenSameNode} runningEntry=${result.runningEntry}`);
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

      // ── 2b) S3-Mandat-Gate: Auswahl per Select darf „Weiter" NICHT vorzeitig
      // freischalten (Regression: onbSyncDynamic auf Schritt 3). Hilfezustand mit
      // Name vorhanden, aber Ebene UND Partei leer -> Button gesperrt; nach nur
      // Ebene weiter gesperrt; erst mit Partei frei. Echte change-Events.
      await page.evaluate(renderStepInPage, { step: 3, draft: { fullName: "Voll Name", party: "", faction: "", parliamentType: "" }, ui: { editMandate: true, lookup: { status: "not_found", candidates: [], warnings: [] } } });
      const gate = await page.evaluate(() => {
        const btn = () => document.querySelector("[data-onb-confirm]");
        const setSel = (field, val) => {
          const sel = document.querySelector(`[data-onb-select="${field}"]`);
          if (!sel) return false;
          sel.value = val;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const initial = btn() ? btn().disabled : null;
        const hasEbeneSel = setSel("parliamentType", "Bundestag");
        const afterEbene = btn() ? btn().disabled : null;
        const hasPartySel = setSel("party", "SPD");
        const afterParty = btn() ? btn().disabled : null;
        return { initial, afterEbene, afterParty, hasEbeneSel, hasPartySel };
      });
      check("S3-Gate: bei unvollständigem Mandat ist 'Weiter' initial gesperrt", gate.initial === true);
      check("S3-Gate: nach nur-Ebene bleibt 'Weiter' gesperrt (Partei fehlt)", gate.hasEbeneSel && gate.afterEbene === true);
      check("S3-Gate: erst mit Name+Ebene+Partei wird 'Weiter' frei", gate.hasPartySel && gate.afterParty === false);

      // ── 2c) Blockiert (403/access_denied): ruhiger Hilfezustand, KEINE
      // technischen Begriffe, manuelle Ergänzung + erneute Suche (echte Render).
      await page.evaluate(renderStepInPage, { step: 3, draft: { fullName: "Voll Name", party: "", faction: "", parliamentType: "" }, ui: { editMandate: true, lookup: { status: "access_denied", sourceStatus: 403, candidates: [], warnings: [] } } });
      const blocked = await page.evaluate(() => {
        const root = document.querySelector("#onbRoot");
        const text = root ? root.textContent : "";
        return {
          calm: /Ich brauche kurz deine Hilfe\./.test(text) && /Einige Angaben konnte ich gerade nicht automatisch übernehmen\./.test(text),
          noTech: !/Quelle|Netzwerk|Timeout|\bAPI\b|\bHTTP\b|Server|Proxy|Egress|blockiert|abgelehnt|403|429|\bFehler\b/i.test(text),
          hasManual: !!document.querySelector('[data-onb-select="parliamentType"]') && !!document.querySelector('[data-onb-select="party"]'),
          hasRetry: /Automatisch erneut suchen/.test(text)
        };
      });
      check("S3 access_denied (403): ruhige Copy, keine technischen Begriffe", blocked.calm && blocked.noTech);
      check("S3 access_denied (403): manuelle Ergänzung + erneute Suche verfügbar", blocked.hasManual && blocked.hasRetry);

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

    // ── 6) reduced-motion stellt Puls UND Screen-Übergang still (und läuft sonst) ─
    {
      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", bypassCSP: true });
      const { page } = await bootPage(reduced);
      await page.evaluate(renderStepInPage, { step: 0 });
      const rd = await page.evaluate(() => {
        const p = document.querySelector(".ho-pulse");
        const a = document.querySelector(".ho-anim");
        return { pulse: p ? getComputedStyle(p).animationDuration : "none", entry: a ? getComputedStyle(a).animationDuration : "none" };
      });
      check("reduced-motion: Puls-Animation stillgestellt (Dauer ~0)", rd.pulse !== "none" && parseFloat(rd.pulse) <= 0.01, `dauer=${rd.pulse}`);
      check("reduced-motion: Screen-Übergang (.ho-anim) stillgestellt — keine Bewegung", rd.entry !== "none" && parseFloat(rd.entry) <= 0.01, `dauer=${rd.entry}`);
      await reduced.close();

      const normal = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", serviceWorkers: "block", bypassCSP: true });
      const np = await bootPage(normal);
      await np.page.evaluate(renderStepInPage, { step: 0 });
      const nd = await np.page.evaluate(() => {
        const p = document.querySelector(".ho-pulse");
        const a = document.querySelector(".ho-anim");
        return { pulse: p ? getComputedStyle(p).animationDuration : "none", entry: a ? getComputedStyle(a).animationDuration : "none" };
      });
      check("Ohne Präferenz: Puls läuft (Dauer > 1s) — Präferenz greift nachweislich", nd.pulse !== "none" && parseFloat(nd.pulse) >= 1, `dauer=${nd.pulse}`);
      check("Ohne Präferenz: Screen-Übergang läuft (~300–500ms Crossfade)", nd.entry !== "none" && parseFloat(nd.entry) >= 0.2 && parseFloat(nd.entry) <= 0.6, `dauer=${nd.entry}`);
      await np.page.close();
      await normal.close();
    }

    // ── 7) Abschluss-Moment (S12): H bleibt mittig, Text blendet automatisch von
    // „Dein Profil ist bereit." zu „Willkommen, …" über, dann klickloser Übergang
    // in die App (Bereich Lage) — kein Button mehr, kein harter Sprung ─────────
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", serviceWorkers: "block", bypassCSP: true });
      const { page } = await bootPage(context);
      await page.evaluate(renderStepInPage, { step: 12 });
      const initial = await page.evaluate(() => {
        profile.fullName = "Katrin Vogt"; // bestätigtes Profil nach erfolgreichem Speichern
        const mark = document.querySelector(".ho-final .ho-mark");
        const ready = document.getElementById("onbFinalReady");
        const welcome = document.getElementById("onbFinalWelcome");
        return {
          hasMark: !!mark,
          readyOn: ready ? ready.classList.contains("is-on") : null,
          welcomeOn: welcome ? welcome.classList.contains("is-on") : null,
          readyText: ready ? ready.textContent.trim() : "",
          noButton: !document.querySelector("[data-onb-toapp]")
        };
      });
      check("S12: Helmut-H zentral vorhanden", initial.hasMark);
      check("S12: 'Dein Profil ist bereit.' initial sichtbar", initial.readyOn === true && /Dein Profil ist bereit\./.test(initial.readyText));
      check("S12: Willkommen-Text initial NICHT eingeblendet", initial.welcomeOn === false);
      check("S12: kein 'Los geht's'-Button mehr — vollautomatischer Abschluss (kein Klick nötig)", initial.noButton);

      // location.reload() lässt sich in Chromium nicht überschreiben (Location.
      // prototype.reload ist non-writable/non-configurable) — der ECHTE Reload
      // wird deshalb abgewartet (waitForNavigation) statt gemockt; das prüft den
      // tatsächlichen Übergang gleich mit, statt ihn nur zu simulieren.
      const navPromise = page.waitForNavigation({ timeout: 5000 }).catch(() => null);
      const started = await page.evaluate(() => { onbRunFinalSequence(); return true; });
      check("Moment 7: Abschlusssequenz startet automatisch (kein Klick nötig)", started === true);

      // Nach der Lesezeit (~700ms) crossfadet der Text zum Willkommen — das H
      // bleibt derselbe DOM-Knoten (ortsfest, kein Neurender).
      await page.waitForTimeout(900);
      const mid = await page.evaluate(() => {
        const mark = document.querySelector(".ho-final .ho-mark");
        const ready = document.getElementById("onbFinalReady");
        const welcome = document.getElementById("onbFinalWelcome");
        return {
          markStillThere: !!mark,
          readyOn: ready.classList.contains("is-on"),
          welcomeOn: welcome.classList.contains("is-on"),
          welcomeText: welcome.textContent
        };
      });
      check("Moment 7: Helmut-H bleibt während des Crossfades ortsfest", mid.markStillThere);
      check("Moment 7: Text crossfadet automatisch zu 'Willkommen' (kein Neurender)", mid.readyOn === false && mid.welcomeOn === true);
      check("Moment 7: korrekter Begrüßungstext mit Vorname aus dem bestätigten Profil",
        /Willkommen, Katrin\./.test(mid.welcomeText) && /Ich bin Helmut/.test(mid.welcomeText) && /Ab jetzt bin ich an deiner Seite/.test(mid.welcomeText),
        JSON.stringify(mid.welcomeText));

      // Danach: weicher Abgang (ho-fade-out) und automatischer Übergang in die
      // App — ohne weiteren Klick, ohne Swipe, ohne erneuten Login.
      await page.waitForFunction(() => document.querySelector("#onbRoot.ho-fade-out") !== null, null, { timeout: 2000 });
      check("Moment 7: weicher Abgang (ho-fade-out) vor dem App-Wechsel, kein harter Sprung", true);

      // Der tatsächliche Reload (window.location.reload(), 300ms nach dem
      // Fade-out) navigiert die Seite real neu — ohne weiteren Klick, Swipe
      // oder erneuten Login.
      const navigated = await navPromise;
      check("Moment 7: automatischer Übergang in die App (kein Klick/Swipe/Login)", navigated !== null);
      const view = await page.evaluate(() => { try { return localStorage.getItem("helmut:view"); } catch (_) { return null; } });
      check("Moment 7: Ziel-Bereich Lage vor dem Übergang verbindlich gesetzt (übersteht den Reload)", view === "briefing", `view=${view}`);

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
