"use strict";

// Render-Test des Radar-Tabs: fuehrt die ECHTE renderRadarView() aus client.js in einem
// vm-Kontext (Browser-Stubs) aus und prueft das erzeugte HTML. KEIN Netz, KEINE KI.
// Geprueft: Über-dich zeigt nur die uebergebenen Erwaehnungen, Artikeluebersicht ist auf
// 5 begrenzt mit echtem "Alle anzeigen", Dynamik-Leerzustand ist ehrlich, Umfeld-Label
// dimensionsgenau, keine Kosten/LLM/Demo im Markup.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__radarTest = {
    render: () => renderRadarView(),
    setBriefing: (b) => { briefing = b; },
    setArticlesExpanded: (v) => { radarArticlesExpanded = v; },
    setFilter: (v) => { radarFilter = v; },
    esc: (s) => escapeHtml(s)
  };`;
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    fetch: () => Promise.reject(new Error("no-net-in-test")),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__radarTest) throw new Error("Radar-Test-Hook nicht gesetzt");
  return sandbox.__radarTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const api = loadClient();
check("client.js lädt im vm (Radar-Boot ohne Browser)", Boolean(api && api.render));

// Vollständiger currentRadarState (wie der Server-Adapter ihn baut).
function art(i) {
  return { id: `radar-article-vA${i}`, vorgangId: `vA${i}`, title: `Testartikel-${i}`,
    sourceName: "Quelle", sourceCategory: "Medien", sourceUrl: `https://q.de/a${i}`, linkType: "direct",
    publishedAt: "2026-07-11T06:00:00Z", thumbnailUrl: null, shortSummary: "Kurz.", relationTypes: ["party", "media"] };
}
const state = {
  generatedAt: "2026-07-11T09:32:00Z", lastUpdated: "2026-07-11T06:00:00Z", status: "fresh", profileId: "u1",
  summary: { line1: "Heute wurdest du einmal erwähnt.", line2: "In deinem politischen Umfeld gibt es 1 neues Signal.", text: "…" },
  mentions: [{ id: "radar-mention-vM1", vorgangId: "vM1", title: "Mustermann fordert Reform", sourceName: "Tagesspiegel",
    sourceCategory: "Medien", sourceUrl: "https://t.de/m1", linkType: "direct", publishedAt: "2026-07-11T06:00:00Z",
    thumbnailUrl: null, summary: "…", mentionType: "criticism", mentionLabel: "Kritik", mentionTone: "critical", evidence: "…", confidence: "high" }],
  environment: {
    party: [{ id: "radar-env-party-vP1", vorgangId: "vP1", title: "Fraktion beschließt Linie", sourceName: "Quelle",
      sourceCategory: "Partei", sourceUrl: "https://q.de/p1", linkType: null, publishedAt: "2026-07-11T05:00:00Z",
      thumbnailUrl: null, summary: "…", relationType: "party", relationLabel: "Betrifft deine Partei", relevanceEvidence: "CDU" }],
    constituency: [], committees: []
  },
  dynamics: [],
  articles: Array.from({ length: 8 }, (_, i) => art(i + 1)),
  quality: { status: "fresh", reason: null, lastUpdated: "2026-07-11T06:00:00Z", mentionsFound: 1, environmentMatched: 1, dynamicsDetected: 0, articleCount: 8, sourcesLoaded: true, hasThumbnails: false, thumbnailsAvailable: false }
};
api.setBriefing({ engine: "v3", currentRadarState: state });

// 1) Radar rendert (nicht Leerzustand).
const html = api.render();
check("Radar rendert den Stand (.radar2, nicht leer)", html.includes("radar2") && html.includes("Radar"));

// 2) Über dich zeigt die echte Erwähnung.
check("Über dich zeigt die übergebene Erwähnung", html.includes("Mustermann fordert Reform"));
check("Über dich zeigt kein fremdes/erfundenes Item", !html.includes("Bremen führt Fußfesseln"));

// 3) Artikelübersicht ist auf 5 begrenzt + echtes "Alle anzeigen (8)".
const shownDefault = [1,2,3,4,5,6,7,8].filter((i) => html.includes(`Testartikel-${i}`));
check("Artikelübersicht zeigt genau 5 Artikel (Premium-Verdichtung)", shownDefault.length === 5, `sichtbar=${shownDefault.join(",")}`);
check("'Alle anzeigen (8)' erscheint bei >5 Artikeln", /Alle anzeigen \(8\)/.test(html));

// 4) Aufgeklappt zeigt alle 8.
api.setArticlesExpanded(true);
const htmlAll = api.render();
const shownAll = [1,2,3,4,5,6,7,8].filter((i) => htmlAll.includes(`Testartikel-${i}`));
check("Aufgeklappt: alle 8 Artikel sichtbar (echte erweiterte Liste, kein Fake)", shownAll.length === 8);
check("Aufgeklappt: 'Weniger anzeigen' erscheint", /Weniger anzeigen/.test(htmlAll));
api.setArticlesExpanded(false);

// 5) Dynamik-Leerzustand ist ehrlich (kein 'neu' erfunden).
check("Dynamik leer -> ehrlicher Leerzustand statt erfundener Aktualität",
  api.render().includes("Aktuell entsteht keine neue belegbare Dynamik"));

// 6) Umfeld-Label dimensionsgenau.
check("Umfeld zeigt dimensionsgenaues Label 'Betrifft deine Partei'", api.render().includes("Betrifft deine Partei"));

// 7) Sicherheit: keine Kosten/Token/LLM/Demo im Markup, kein Client-Fetch im Render.
const blob = api.render();
check("Keine Kosten-/Token-/LLM-Felder im Radar-Markup", !/estimatedcost|prompttokens|totaltokens|llm_usage|costestimate/i.test(blob));
check("Keine Demo-Marker im Radar-Markup", !/demo-artikel|beispielartikel|lorem ipsum/i.test(blob));

console.log(`\n${passed}/${passed + failed} Radar-UI-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
