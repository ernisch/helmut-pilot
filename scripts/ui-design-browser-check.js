"use strict";

// Darstellungsprüfung mit dem echten Client und rein synthetischem UI Zustand.
// Kein server.js, kein Speicher, kein Motor. Fremde Browserrequests sind gesperrt.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const output = path.join("/tmp", "helmut-ui-design-screenshots");
const now = new Date().toISOString();
const item = {
  id: "ui-vorgang", title: "Synthetischer UI Testvorgang", displayTitle: "Synthetischer UI Testvorgang",
  summary: "Dieser Inhalt dient ausschließlich der lokalen Darstellungsprüfung.",
  whyRelevant: "Eine synthetische Begründung für den UI Test.", urgency: "high",
  primarySource: { sourceName: "UI Testquelle", url: "https://example.test/ui", itemUrl: "https://example.test/ui" },
  sources: [{ sourceName: "UI Testquelle", url: "https://example.test/ui", itemUrl: "https://example.test/ui" }],
  sourceUrl: "https://example.test/ui", sourceName: "UI Testquelle", sourceCount: 1,
  lastUpdated: now,
};
const vorgang = { ...item, id: "ui-lage", vorgangId: "ui-lage", status: "neu",
  displayCategory: "UI Prüfung", category: "UI Prüfung", scope: "Bundestag",
  summary: { text: "Synthetische Zusammenfassung für die mobile Darstellung. ".repeat(8),
    wasIstPassiert: "Synthetische Zusammenfassung für die UI Prüfung.", warumWichtig: "Synthetische Begründung." },
  sources: [{ sourceName: "Synthetische UI Testquelle mit langem Namen", url: "https://example.test/ui", publishedAt: now }],
  chronologie: [{ dateLabel: "UI Testdatum", text: "Synthetischer Chronologieeintrag." }],
};
const payload = {
  profile: { id: "ui-profile", fullName: "UI Testprofil", firstName: "UI", active: true,
    onboardedAt: now, party: "Testpartei", faction: "Testfraktion", committee: "Testausschuss",
    communicationStyle: "Sachlich & klar", officeFormats: ["presse", "linkedin"], focusTopics: [] },
  briefing: { engine: "v3", generatedAt: now, lageBriefing: { generatedAt: now, vorgaenge: [vorgang, { ...vorgang, id: "ui-lage-2", vorgangId: "ui-vorgang-2", displayTitle: "Zweiter synthetischer UI Testvorgang" }] }, items: [], tasks: [], currentHelmutState: {
    generatedAt: now, profileId: "ui-profile", status: "fresh", briefingType: "daily", primaryItem: item,
    recommendation: "Den synthetischen UI Zustand prüfen.", whyItMatters: "Nur zur lokalen Darstellung.",
    urgency: "high", riskOfNoAction: "Synthetischer Risikotext für den UI Test.",
    opportunitySummary: "Synthetischer Chancentext für den UI Test.", items: [], contextChips: [],
    recommendedCommunication: { recommendedFormat: "pressRelease", communicationLine: "Synthetischer UI Test." },
    actionItems: [{ title: "UI Darstellung prüfen", priority: "high" }],
    sourcesSummary: { sourceCount: 1, lastUpdated: now, qualityStatus: "complete" },
  }, currentRadarState: {
    generatedAt: now, lastUpdated: now, status: "fresh", profileId: "ui-profile",
    summary: { line1: "Synthetische Radarübersicht für die UI Prüfung." }, mentions: [{
      id: "ui-mention", title: "Synthetische Erwähnung zur UI Prüfung", sourceName: "Synthetische UI Testquelle mit langem Namen",
      url: "https://example.test/ui", publishedAt: now, mentionLabel: "Synthetische Kennzeichnung", evidence: "Synthetischer langer Quellenhinweis. ".repeat(8),
    }],
    environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [],
    quality: { status: "fresh", sourcesLoaded: true },
  } }, tasks: [], notes: [],
};

const originalClient = fs.readFileSync(path.join(root, "client.js"), "utf8");
const testClient = originalClient.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "") + `
  applyStartPayload(${JSON.stringify(payload)});
  authState = { mode: "accounts" };
  currentUser = { id: "ui-user", name: "UI Testprofil", role: "member", notificationSettings: {} };
  opsStatus = { learning: { eventCount: 7 } };
  const uiCard = ${JSON.stringify({ ...item, status: "open", priorityType: "risk", priorityLabel: "Handeln", recommendation: "Den synthetischen UI Zustand prüfen." })};
  decisions = [uiCard]; helmutDeck = [uiCard];
  for (const format of activeOfficeFormats()) {
    officeDrafts[officeDraftKey(uiCard, format)] = "Synthetischer UI Testentwurf ohne fachliche Aussage. ".repeat(12);
  }
  globalThis.__uiDesign = {
    view: (view) => { onboardingActive = false; currentView = view; render(); window.scrollTo({ top: 0, behavior: "instant" }); },
    details: (view, origin) => { currentView = origin; detailOriginView = origin; selectedDecisionId = uiCard.id; selectedVorgangId = "ui-lage"; currentView = view; render(); window.scrollTo(0, 0); },
    scope: (profileId, accountId) => { activePoliticianId = profileId; currentUser = { ...currentUser, id: accountId }; },
    scopeInfo: () => ({ profile: activePoliticianId, account: currentUser.id }),
    historyPrivate: () => !JSON.stringify(history.state).includes("UI Testprofil") && !JSON.stringify(history.state).includes("Testentwurf"),
    onboarding: (step) => { currentView = "helmut"; onboardingActive = true; onboardingStep = step; render(); },
    deck: () => { app.querySelector(".content-shell").innerHTML = renderHelmutBriefingList(); bindDetailOpen(app.querySelector(".content-shell")); },
    status: (status) => { briefing.currentHelmutState.status = status; currentView = "helmut"; render(); },
  };
  currentView = "helmut";
  render();`;

function previewServer() {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(pathname.includes("profile/current") ? payload.profile : {})); return;
    }
    if (pathname === "/client.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(testClient); return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!["index.html", "styles.css"].includes(relative) && !relative.startsWith("assets/")) {
      res.writeHead(404); res.end(); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const types = { ".html": "text/html", ".css": "text/css", ".ttf": "font/ttf", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
}

let passed = 0;
function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? ": " + detail : ""}`);
  passed++; console.log(`PASS  ${name}`);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = previewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes("--serve")) { console.log(`Lokale synthetische UI Vorschau: ${url}`); return; }
  let browser;
  try {
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 900 }, false],
      ["mobil", { width: 390, height: 844 }, true],
      ["mobil-360", { width: 360, height: 780 }, true],
    ]) {
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: "block" });
      const external = [];
      await context.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin === url) await route.continue();
        else { external.push(route.request().url()); await route.abort(); }
      });
      const page = await context.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForSelector(".hstand");
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; return document.fonts.ready; });
      await page.waitForFunction(() => document.body.classList.contains("splash-gone"));
      check(`${label}: Splash beendet, App für Screenshots sichtbar`, !await page.locator("#appSplash").isVisible());
      check(`${label}: drei lokale Markenschriften tatsächlich geladen`, await page.evaluate(() =>
        ["Hanken Grotesk", "Spectral", "IBM Plex Mono"].every((name) =>
          [...document.fonts].some((font) => font.family.replaceAll('"', "") === name && font.status === "loaded"))));
      check(`${label}: Fließtext Hanken Grotesk und Titel Spectral`, await page.evaluate(() =>
        getComputedStyle(document.body).fontFamily.includes("Hanken Grotesk") &&
        getComputedStyle(document.querySelector("h1")).fontFamily.includes("Spectral")));
      check(`${label}: Statusfarben als Tokens`, await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return css.getPropertyValue("--risk").trim() === "#D97B7B" &&
          css.getPropertyValue("--status-current").trim() === "#39d18f" &&
          css.getPropertyValue("--status-warning").trim() === "#D6A040" &&
          css.getPropertyValue("--action").trim() === "#7FA8E0";
      }));
      for (const [status, color] of [["fresh", "rgb(57, 209, 143)"], ["stale", "rgb(214, 160, 64)"], ["error", "rgb(217, 123, 123)"]]) {
        await page.evaluate((s) => window.__uiDesign.status(s), status);
        check(`${label}: ${status} verwendet dokumentierte Statusfarbe`, await page.locator(".hstand-status").evaluate((n) => getComputedStyle(n).color) === color);
      }
      await page.evaluate(() => window.__uiDesign.status("fresh"));
      for (const view of ["helmut", "briefing", "radar", "office", "profile-settings", "settings"]) {
        await page.evaluate((v) => window.__uiDesign.view(v), view);
        await page.evaluate(() => document.fonts.ready);
        check(`${label} ${view}: kein horizontaler Überlauf`, await page.evaluate(() =>
          document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth));
        const small = await page.locator("button, a, [role=button], .onboarding-chip, .stg-row--toggle").evaluateAll((nodes) =>
          nodes.filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden")
            .map((n) => ({ text: n.textContent.trim().slice(0, 50), w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height }))
            .filter((n) => n.w < 43.9 || n.h < 43.9));
        check(`${label} ${view}: Bedienflächen mindestens 44 × 44`, small.length === 0, JSON.stringify(small));
        if (mobile) {
          check(`${label} ${view}: Profilzugang in der Kopfleiste sichtbar`, await page.locator(".profile-avatar").isVisible());
          const overflow = await page.locator(".content-shell").evaluate((root) => {
            const bounds = root.getBoundingClientRect();
            return [...root.querySelectorAll("*")].filter(n => {
              const r = n.getBoundingClientRect();
              return r.width && r.height && getComputedStyle(n).visibility !== "hidden" && (r.left < bounds.left - 1 || r.right > bounds.right + 1);
            }).slice(0, 8).map(n => ({ tag: n.tagName, cls: n.className, text: n.textContent.slice(0, 65) }));
          });
          check(`${label} ${view}: kein Kind über den Inhaltsrand hinaus`, overflow.length === 0, JSON.stringify(overflow));
          check(`${label} ${view}: Hauptbereich selbst ohne Überbreite`, await page.locator(".content-shell").evaluate(n => n.scrollWidth <= n.clientWidth));
        }
        await page.screenshot({ path: path.join(output, `${label}-${view}.png`), fullPage: true });
      }
      check(`${label}: Rückmeldungshinweis vollständig und ohne Ellipse`, await page.locator(".stg-row-value").first().evaluate((n) =>
        getComputedStyle(n).whiteSpace === "normal" && getComputedStyle(n).textOverflow === "clip"));
      if (mobile) {
        const dock = await page.locator(".mobile-dock button").evaluateAll(nodes => nodes.map(n => ({ view: n.dataset.view, height: n.getBoundingClientRect().height, minHeight: getComputedStyle(n).minHeight, font: getComputedStyle(n).fontSize })));
        check(`${label}: Leiste Briefing/Lage/Radar/Büro, 60 px hoch und 13 px Schrift`,
          dock.map(n => n.view).join(",") === "helmut,briefing,radar,office" && dock.every(n => n.height >= 59.9 && parseFloat(n.minHeight) >= 60 && parseFloat(n.font) >= 13), JSON.stringify(dock));
        await page.evaluate(() => window.__uiDesign.view("briefing"));
        check(`${label}: Lage als einspaltige Liste ohne seitlichen Scroll`, await page.locator("[data-lage-track]").evaluate(n => n.scrollWidth <= n.clientWidth && getComputedStyle(n).display === "grid"));
        await page.locator("[data-lage-open]").first().tap();
        await page.waitForSelector(".vdetail--mobile");
        check(`${label}: Lage Detail auf der Seite, kein innerer Scrollbereich`, await page.locator(".vdetail--mobile").evaluate(n => getComputedStyle(n).overflowY === "visible") && await page.locator(".vsheet-root").count() === 0);
        check(`${label}: Lage Detail ohne horizontale Überbreite`, await page.locator(".content-shell").evaluate(n => n.scrollWidth <= n.clientWidth) && await page.locator(".vdetail--mobile").evaluate(n => n.scrollWidth <= n.clientWidth));
        await page.screenshot({ path: path.join(output, `${label}-lage-detail.png`), fullPage: true });
        await page.locator(".vdetail-back").click();
        await page.waitForSelector("[data-lage-track]");
        check(`${label}: Zurückfläche führt zur Lage Liste`, await page.locator("[data-lage-open]").count() === 2);
        await page.locator("[data-lage-open]").first().tap();
        await page.waitForSelector(".vdetail--mobile");
        await page.goBack(); await page.waitForSelector("[data-lage-track]");
        check(`${label}: Browser Zurück führt zur Lage Liste`, await page.locator(".vdetail").count() === 0);
        await page.goForward(); await page.waitForSelector(".vdetail--mobile");
        check(`${label}: Browser Vorwärts stellt Lage Detail wieder her`, await page.locator(".vdetail-back").isVisible());
        await page.locator(".vdetail-back").click(); await page.waitForSelector("[data-lage-track]");
        await page.locator("[data-lage-open]").nth(1).tap(); await page.waitForSelector(".vdetail--mobile");
        check(`${label}: Vorgangskennung öffnet den richtigen zweiten Vorgang`, /Zweiter synthetischer/.test(await page.locator(".vsheet-title").textContent()));
        await page.locator(".mobile-dock [data-view=office]").click();
        await page.locator("[data-office-open]").first().tap();
        await page.waitForSelector(".buero-detail-title");
        check(`${label}: Büro Detail mit 44-px-Zurückfläche und vollständig sichtbarem Titel`, await page.locator(".buero-back-btn").evaluate(n => n.getBoundingClientRect().height >= 44) && await page.locator(".buero-detail-title").evaluate(n => n.scrollWidth <= n.clientWidth));
        const title = await page.locator(".buero-detail-title").textContent();
        await page.locator(".buero-detail-title").evaluate(n => { n.textContent = "SynthetischeDarstellungsprüfungMitEinemSehrLangenZusammengesetztenTitel"; });
        check(`${label}: langer Büro Detailtitel bricht innerhalb des Inhalts um`, await page.locator(".buero-detail-title").evaluate(n => n.scrollWidth <= n.clientWidth && getComputedStyle(n).whiteSpace === "normal"));
        await page.locator(".buero-detail-title").evaluate((n, text) => { n.textContent = text; }, title);
        check(`${label}: Büro Detailhinweis vollständig ohne Ellipse`, await page.locator(".buero-detail-linecheck").evaluate(n => getComputedStyle(n).whiteSpace === "normal" && getComputedStyle(n).textOverflow !== "ellipsis"));
        await page.screenshot({ path: path.join(output, `${label}-office-detail.png`), fullPage: true });
        check(`${label}: Browserhistorie enthält keine Profil-/Entwurfstexte`, await page.evaluate(() => window.__uiDesign.historyPrivate()));
        await page.goBack(); await page.waitForSelector(".buero-header");
        check(`${label}: Browser Zurück führt zur Büro Liste`, await page.locator("[data-office-open]").count() > 0);
        await page.locator("[data-office-open]").first().tap();
        await page.waitForSelector(".buero-detail-title");
        await page.locator(".buero-back-btn").click(); await page.waitForSelector(".buero-header");
        check(`${label}: Büro Zurückfläche führt zur Liste`, await page.locator(".buero-detail-view").count() === 0);
        for (const switchAccount of [false, true]) {
          const scope = await page.evaluate(() => window.__uiDesign.scopeInfo());
          await page.locator("[data-office-open]").first().tap(); await page.waitForSelector(".buero-detail-title");
          await page.evaluate(({ scope, switchAccount }) => {
            window.__uiDesign.scope(switchAccount ? scope.profile : "other-ui-profile", switchAccount ? "other-ui-account" : scope.account);
            window.__uiDesign.view("settings");
          }, { scope, switchAccount });
          await page.goBack();
          check(`${label}: alte Detailhistorie nach ${switchAccount ? "Kontowechsel" : "Mandatswechsel"} ignoriert`, await page.locator(".buero-detail-view").count() === 0 && /Einstellungen/.test(await page.locator(".page-intro h1").textContent()));
          await page.evaluate(scope => { window.__uiDesign.scope(scope.profile, scope.account); window.__uiDesign.view("office"); }, scope);
        }
        await page.evaluate(() => window.__uiDesign.view("helmut"));
        await page.evaluate(() => window.__uiDesign.deck());
        await page.locator("[data-detail]").first().click(); await page.waitForSelector(".detail-page");
        check(`${label}: Empfehlung Zurück nennt tatsächlichen Ursprung Briefing`, /Briefing/.test(await page.locator(".back-link").textContent()));
        await page.locator(".back-link").click(); await page.waitForSelector(".hstand");
        check(`${label}: Empfehlung Zurück erhält Briefing Ursprung`, await page.locator(".hstand-title").isVisible());
        await page.evaluate(() => window.__uiDesign.view("briefing"));
        await page.locator("h1").evaluate(n => { n.textContent = "Synthetischer langer zweizeiliger Kopfbereich für die Mobile Prüfung"; });
        const head = await page.locator("h1").evaluate(n => {
          // Spectral zeichnet einzelne Glyphen über die Zeilenbox hinaus. Prüfen,
          // ob diese tatsächlich abgeschnitten werden, statt scrollHeight mit
          // der kleineren typografischen Zeilenbox gleichzusetzen.
          const range = document.createRange(); range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
            width: innerWidth, height: innerHeight, overflow: getComputedStyle(n.parentElement).overflowY };
        });
        check(`${label}: mehrzeiliger Kopf bleibt vollständig sichtbar`, head.top >= 0 && head.bottom <= head.height && head.left >= 0 && head.right <= head.width && head.overflow === "visible", JSON.stringify(head));
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        check(`${label}: Seitenanfang wieder erreichbar`, await page.locator("h1").evaluate(n => n.getBoundingClientRect().top >= 0));
      }
      await page.evaluate(() => window.__uiDesign.view("settings"));
      if (mobile) {
        await page.locator("[data-updates]").click();
        await page.waitForFunction(() => {
          const r = document.querySelector(".updates-panel").getBoundingClientRect();
          return r.left >= 15.9 && r.right <= innerWidth - 15.9;
        });
        check(`${label}: Mitteilungsfenster mit 16 px Rand und ohne Überbreite`, await page.locator(".updates-panel").evaluate(n => n.scrollWidth <= n.clientWidth));
        await page.locator("[data-close-updates]").click();
        await page.locator(".profile-avatar").click();
        check(`${label}: Avatar öffnet vorhandene Einstellungen`, /Einstellungen/.test(await page.locator(".page-intro h1").textContent()));
      }
      await page.locator("[data-notif-toggle=briefing]").evaluate((n) => { n.checked = true; });
      await page.locator(".stg-row--toggle").filter({ hasText: "Morgenbriefing" }).click({ position: { x: 20, y: 20 } });
      check(`${label}: Klick auf beschriftete Togglezeile schaltet Checkbox`, !await page.locator("[data-notif-toggle=briefing]").isChecked());
      await page.evaluate(() => window.__uiDesign.view("helmut"));
      const foot = page.locator(".hstand-foot");
      await foot.evaluate((n) => { n.querySelector("span").textContent = "Ein sehr langer synthetischer Quellenhinweis ".repeat(7); });
      check(`${label}: langer Fußzeilenhinweis vollständig umgebrochen`, await foot.evaluate((n) =>
        n.scrollWidth <= n.clientWidth + 1 && [...n.children].every((c) => getComputedStyle(c).textOverflow !== "ellipsis")));
      await page.evaluate(() => window.__uiDesign.deck());
      await page.waitForFunction(() => document.querySelector(".helmut-deck-open").getBoundingClientRect().height >= 44);
      const dot = await page.locator(".helmut-deck-open").evaluate((n) => ({
        circle: Boolean(n.querySelector("circle")), path: Boolean(n.querySelector("path")),
        color: getComputedStyle(n).color, height: n.getBoundingClientRect().height,
      }));
      check(`${label}: blauer Punkt statt Stern, Öffnen bleibt bedienbar`,
        dot.circle && !dot.path && ["rgb(127, 168, 224)", "rgb(167, 195, 234)"].includes(dot.color) && dot.height >= 44,
        JSON.stringify(dot));
      for (let step = 0; step < 7; step++) {
        await page.evaluate((s) => window.__uiDesign.onboarding(s), step);
        check(`${label}: Onboarding Schritt ${step + 1} sichtbar`, await page.locator(".onboarding-card").isVisible());
        const chips = await page.locator(".onboarding-chip").evaluateAll((nodes) =>
          nodes.every((n) => n.getBoundingClientRect().height >= 44));
        check(`${label}: Onboarding Schritt ${step + 1} Chips mindestens 44 px`, chips);
      }
      await page.screenshot({ path: path.join(output, `${label}-onboarding.png`), fullPage: true });
      await page.evaluate(() => { window.__uiDesign.view("settings"); document.documentElement.dataset.theme = "light"; });
      check(`${label}: Light Mode nutzt dasselbe Fehler Rot`, await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--danger").trim() === "#D97B7B"));
      await page.screenshot({ path: path.join(output, `${label}-settings-light.png`), fullPage: true });
      check(`${label}: keine JavaScriptfehler`, errors.length === 0, JSON.stringify(errors));
      check(`${label}: keine Fremdrequests`, external.length === 0, JSON.stringify(external));
      await context.close();
    }
    const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const locked = await landscape.newPage();
    await locked.route("**/*", route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    await locked.goto(url); await locked.waitForSelector(".orientation-lock");
    check("Mobil 844 × 390: vorhandene Querformatsperre blockiert die App", await locked.evaluate(() => Boolean(document.elementFromPoint(422, 195)?.closest(".orientation-lock"))));
    await locked.screenshot({ path: path.join(output, "mobil-querformat.png") });
    await landscape.close();
    console.log(`\n${passed}/${passed} Design Browserprüfungen erfolgreich. Screenshots: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
