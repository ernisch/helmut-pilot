"use strict";

// Pilot-Readiness Block 5 — "Lage Frische und Live Flow".
// Testet die zwei bestätigten, adversarial verifizierten Befunde + ihre Fixes:
//
// BEFUND 1 (Lage-Frische): Die einzige Frische-Zeile der Lage kam nur aus dem
//   Artikel-Publikationsdatum (lageFreshnessLabel) — das kann Wochen zurückliegen,
//   widersprach dem Kopf-"Aktuell" und verschwand still, wenn keine Quelle ein
//   parsbares Datum trug. FIX: eine EHRLICHE, getrennte primäre Zeile "Zuletzt
//   aktualisiert: heute, HH:MM" aus der echten Analysezeit (Server:
//   getLatestCompleteKnowledgeObjectAt -> lageBriefing.latestUpdatedAt). Die
//   Quellen-Aktualität bleibt eine ZWEITE, klar getrennt beschriftete Zeile.
//
// BEFUND 2 (Live-Flow): (a) Der manuelle ↻-Refresh war toter Code (renderRefreshButton
//   nur im nie aufgerufenen renderHelmutAssessmentView) -> in KEINER Ansicht sichtbar.
//   FIX: ↻ zurück in den erreichbaren renderHstandHeader. (b) Kein Foreground-Refresh:
//   die zurückkehrende App fror auf dem Boot-Stand ein. FIX: gedrosselter
//   visibilitychange-Refresh (Guards: previewMode/pipeline/in-flight, min. Abstand)
//   + Tageswechsel-Rerender (updateBerlinClock), damit "heute" nicht falsch wird.
//
// Reiner vm-Test (keine echte KI, kein Netz — fetch/Timer gestubbt).

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");

// ── Struktur-Guards (billig, fangen Regressionen im Quelltext) ───────────────
check("Quelle: ↻-Refresh ist in den ERREICHBAREN Kopf verdrahtet (renderHstandHeader enthält renderRefreshButton)",
  /function renderHstandHeader[\s\S]*?renderRefreshButton\(\)[\s\S]*?<\/header>/.test(clientSource));
check("Quelle: Foreground-Refresh-Handler vorhanden (visibilitychange -> loadBriefing, gedrosselt)",
  clientSource.includes("foregroundRefreshMinMs") &&
  /visibilityState !== "visible"[\s\S]*?loadBriefing\(\)\.catch/.test(clientSource));
check("Quelle: loadBriefing hat Re-Entrancy-Guard + Drossel-Stempel (try/finally)",
  /async function loadBriefing\(\)\s*\{[\s\S]*?briefingRefreshing = true;[\s\S]*?finally\s*\{[\s\S]*?briefingRefreshing = false;[\s\S]*?lastBriefingLoadAt = Date\.now\(\);/.test(clientSource));
check("Quelle: Tageswechsel-Rerender in updateBerlinClock (relative Frische bleibt ehrlich)",
  /function updateBerlinClock[\s\S]*?lastRenderedBerlinDay[\s\S]*?render\(\);/.test(clientSource));

// ── client.js im vm laden (Browser-Globals gestubbt, Auto-Boot entfernt) ─────
function loadClient() {
  // Auto-Boot entfernen (kein Netz/keine Timer). Der Foreground-/Badge-Handler und
  // registerServiceWorker liegen VOR dem Boot-Aufruf und bleiben erhalten.
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__b5 = {
    lageChecked: (iso) => lageCheckedLabel(iso),
    lageFresh: (v) => lageFreshnessLabel(v),
    setBriefing: (b) => { briefing = b; },
    setProfile: (p) => { profile = p; },
    setView: (v) => { currentView = v; },
    renderLage: () => renderLageView(),
    hstandHeader: (state) => renderHstandHeader(state),
    standView: () => renderHelmutStandView(),
    stubLageDeps: () => { lageVisibleVorgaenge = (d) => (d && d.vorgaenge) || []; renderVorgangCard = () => "<div class='vc'></div>"; },
    stubLoad: () => { loadBriefing = async () => { globalThis.__loadCalls = (globalThis.__loadCalls || 0) + 1; }; },
    loadCalls: () => globalThis.__loadCalls || 0,
    setRefreshing: (b) => { briefingRefreshing = b; },
    getRefreshing: () => briefingRefreshing,
    setLastLoad: (t) => { lastBriefingLoadAt = t; },
    setPipelineRunning: (b) => { pipelineRunning = b; },
    setPreview: (b) => { previewMode = b; },
    setRender: (fn) => { render = fn; },
    setRenderedDay: (d) => { lastRenderedBerlinDay = d; },
    getRenderedDay: () => lastRenderedBerlinDay,
    updateClock: () => updateBerlinClock(),
    fireVisibility: (state) => { globalThis.__doc.visibilityState = state; globalThis.__fire("visibilitychange"); }
  };`;

  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  // Dokument mit ECHTER Listener-Erfassung, damit visibilitychange feuerbar ist.
  const listeners = {};
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false, readyState: "complete"
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop }, // KEIN serviceWorker -> registerServiceWorker() kehrt früh zurück
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
  sandbox.__doc = doc;
  sandbox.__fire = (type) => (listeners[type] || []).forEach((fn) => { try { fn(); } catch (_) { /* handler-intern egal */ } });
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__b5) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__b5;
}

let t;
try { t = loadClient(); }
catch (e) { console.error("FAIL  client.js im vm laden:", e && e.message); process.exit(1); }
check("client.js lädt im vm (Boot ohne echten Browser)", Boolean(t && t.renderLage));

// ═══ TEIL 1 — Lage-Frische: ehrliche Analysezeit ════════════════════════════
const nowIso = new Date().toISOString();
const OLD_ISO = "2025-06-22T07:00:00Z";

// 1a) lageCheckedLabel: heute / alt / ungültig
{
  const today = t.lageChecked(nowIso);
  check("Lage-Frische: heutige Analysezeit -> 'Zuletzt aktualisiert: heute, HH:MM Uhr.'",
    /^Zuletzt aktualisiert: heute, \d{2}:\d{2} Uhr\.$/.test(today), today);
  const old = t.lageChecked(OLD_ISO);
  check("Lage-Frische: alte Analysezeit -> datierte Zeile (NICHT 'heute')",
    /^Zuletzt aktualisiert: \d+\. \w+, \d{2}:\d{2} Uhr\.$/.test(old) && !old.includes("heute"), old);
  const yest = t.lageChecked(new Date(Date.now() - 26 * 3600 * 1000).toISOString());
  check("Lage-Frische: ~gestern -> honest label, niemals 'heute'", Boolean(yest) && !yest.includes("heute"), yest);
  check("Lage-Frische: fehlende/ungültige Analysezeit -> '' (kein Crash, kein Fake)",
    t.lageChecked(null) === "" && t.lageChecked("") === "" && t.lageChecked("kaputt") === "");
}

// 1b) renderLageView-Komposition
t.setProfile({ id: "cem-ince", fullName: "Cem Ince" });
t.setView("briefing");
t.stubLageDeps();

// Der Kern-Widerspruch: Lage HEUTE geprüft, aber die Quelle ist Wochen alt.
function lageBriefing(latestUpdatedAt, pub) {
  return { available: true, demo: false, latestUpdatedAt, vorgaenge: [{ vorgangId: "vg-1", sources: pub ? [{ publishedAt: pub }] : [] }] };
}

{
  t.setBriefing({ lageBriefing: lageBriefing(nowIso, OLD_ISO), currentHelmutState: { status: "fresh" } });
  const html = t.renderLage();
  check("Lage-Frische: PRIMÄRE Stand-Zeile = echte Analysezeit ('Zuletzt aktualisiert: heute …')",
    /class="lage2-stand">Zuletzt aktualisiert: heute, \d{2}:\d{2} Uhr\.</.test(html), (html.match(/lage2-stand">[^<]*/) || [""])[0]);
  check("Lage-Frische: Quellen-Aktualität als GETRENNTE zweite Zeile ('Neueste Quelle vom 22. Juni')",
    /class="lage2-source-recency">Neueste Quelle vom 22\. Juni\.</.test(html));
  check("Lage-Frische: KEIN Widerspruch — die frische Lage behauptet NICHT 'Neueste Quelle heute' für eine wochenalte Quelle",
    !html.includes("Neueste Quelle heute"));
  check("Lage-Frische: der Kopf liest sich NICHT veraltet (primär steht die heutige Prüfzeit)",
    html.includes("Zuletzt aktualisiert: heute"));
}

// Fallback: keine Analysezeit -> Quellen-Aktualität tritt an ihre Stelle (kein stilles Verschwinden)
{
  t.setBriefing({ lageBriefing: lageBriefing(null, nowIso), currentHelmutState: { status: "fresh" } });
  const html = t.renderLage();
  check("Lage-Frische: ohne Analysezeit fällt die Stand-Zeile ehrlich auf die Quellen-Aktualität zurück",
    /class="lage2-stand">Neueste Quelle heute, \d{2}:\d{2} Uhr\.</.test(html));
  check("Lage-Frische: im Fallback KEINE doppelte Quellenzeile (nur eine Frische-Zeile)",
    !html.includes("lage2-source-recency"));
}

// Beide fehlen -> gar keine Frische-Zeile (kein Crash), aber die Lage rendert
{
  t.setBriefing({ lageBriefing: lageBriefing(null, null), currentHelmutState: { status: "fresh" } });
  const html = t.renderLage();
  check("Lage-Frische: ganz ohne Zeitstempel rendert die Lage ohne Crash und ohne erfundene Frische",
    html.includes("lage2") && !html.includes("lage2-stand") && !html.includes("Zuletzt aktualisiert"));
}

// ═══ TEIL 2 — Live-Flow: erreichbarer ↻-Refresh ═════════════════════════════
const freshState = {
  status: "fresh", staleState: false, qualityStatus: "valid", briefingType: "daily",
  primaryItem: { title: "Vorgang", sourceCount: 3 }, recommendation: "Beobachten.", whyItMatters: "Wichtig.",
  generatedAt: nowIso, sourcesSummary: { lastUpdated: nowIso }, contextChips: [], actionItems: [], sourceIds: ["a"]
};
{
  const header = t.hstandHeader(freshState);
  check("Live-Flow: der ↻-Refresh rendert JETZT im erreichbaren Kopf (data-refresh-helmut)",
    header.includes("data-refresh-helmut") && header.includes("Einschätzung neu prüfen"));
  const stand = t.standView();
  check("Live-Flow: die erreichbare Stand-Ansicht (renderHelmutStandView) enthält den ↻-Refresh",
    stand.includes("data-refresh-helmut"));
}

// ═══ TEIL 3 — Live-Flow: gedrosselter Foreground-Refresh ════════════════════
t.stubLoad(); // loadBriefing zählt nur noch Aufrufe (kein echtes Netz)
t.setPreview(false); t.setPipelineRunning(false); t.setRefreshing(false);

function fireAndCount(setup) {
  const before = t.loadCalls();
  setup();
  t.fireVisibility("visible");
  return t.loadCalls() - before;
}
{
  check("Live-Flow: Rückkehr (visible) nach Ablauf der Drossel -> genau EIN Refresh",
    fireAndCount(() => t.setLastLoad(Date.now() - 5 * 60 * 1000)) === 1);
  check("Live-Flow: erneutes Sichtbarwerden INNERHALB der Drossel -> KEIN weiterer Refresh",
    fireAndCount(() => t.setLastLoad(Date.now())) === 0);
  check("Live-Flow: KEIN Refresh, während bereits ein Ladevorgang läuft (Re-Entrancy-Guard)",
    fireAndCount(() => { t.setLastLoad(0); t.setRefreshing(true); }) === 0);
  t.setRefreshing(false);
  check("Live-Flow: KEIN Refresh während einer laufenden Pipeline",
    fireAndCount(() => { t.setLastLoad(0); t.setPipelineRunning(true); }) === 0);
  t.setPipelineRunning(false);
  check("Live-Flow: KEIN Refresh im Vorschau-Modus",
    fireAndCount(() => { t.setLastLoad(0); t.setPreview(true); }) === 0);
  t.setPreview(false);
  check("Live-Flow: KEIN Refresh, wenn die App in den Hintergrund geht (hidden)",
    (() => { const b = t.loadCalls(); t.setLastLoad(0); t.fireVisibility("hidden"); return t.loadCalls() - b; })() === 0);
}

// ═══ TEIL 4 — Live-Flow: Tageswechsel-Rerender (relative Frische bleibt ehrlich) ═
{
  let renders = 0;
  t.setRender(() => { renders += 1; });
  t.setPipelineRunning(false); t.setRefreshing(false);

  t.setRenderedDay(null);
  t.updateClock();
  check("Tageswechsel: erste Messung initialisiert nur den Tag (kein Rerender)",
    renders === 0 && typeof t.getRenderedDay() === "string");

  t.setRenderedDay("2000-01-01"); // simulierter alter Render-Tag
  t.updateClock();
  check("Tageswechsel: geänderter Berliner Kalendertag -> genau EIN Rerender",
    renders === 1 && t.getRenderedDay() !== "2000-01-01");

  const dayNow = t.getRenderedDay();
  t.updateClock();
  check("Tageswechsel: gleicher Tag -> kein weiterer Rerender (keine Endlosschleife)",
    renders === 1 && t.getRenderedDay() === dayNow);
}

console.log(`\n${passed}/${passed + failed} Block-5 (Lage-Frische & Live-Flow)-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
