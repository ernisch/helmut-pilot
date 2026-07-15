"use strict";

// Störungswahrheit (Audit-Fix 2026-07, Sprint 3). KEIN Netz, KEINE KI.
// FRÜHERE FEHLER:
//   1. Ein harter DB-/Netzfehler beim KO-Load der Lage lieferte still [] — der
//      Nutzer sah den normalen "ruhiger Tag"-Leerzustand (Datenausfall unsichtbar).
//   2. Der Briefing-Reiter zeigte für store-error/budget/keine-vorgaenge denselben
//      Text "Heute kein Handlungsbedarf" wie für einen echten ruhigen Tag.
//   3. Der Morgen-Push behauptete auch bei leerem Briefing "steht bereit ...
//      Prioritäten aktualisiert".
//   4. Die Lage-Kopfzeile verkaufte beliebig alte Vorgänge als "Heute gibt es N
//      NEUE Vorgänge" — ohne Frische-Anzeige.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

(async () => {
  // ── 1) Lage: DB-Fehler wird als store-error gemeldet, nicht als leerer Tag ──
  const storage = require("../lib/helmut/storage");
  const lage = require("../lib/helmut/lage");
  const origList = storage.listKnowledgeObjects;
  const origReady = storage.v3StoreReady;
  try {
    storage.v3StoreReady = () => true;
    storage.listKnowledgeObjects = async (opts = {}) => (opts._signalError ? { __storeError: true } : []);
    const res = await lage.buildLageBriefing({ id: "mdb-test" }, {});
    check("Lage bei DB-Fehler: available=false + reason='store-error' (kein stiller Leerzustand)",
      res && res.available === false && res.reason === "store-error", JSON.stringify({ available: res && res.available, reason: res && res.reason }));

    // Leerer, aber GESUNDER Bestand bleibt der bekannte Grund 'no-vorgaenge'.
    storage.listKnowledgeObjects = async () => [];
    const empty = await lage.buildLageBriefing({ id: "mdb-test" }, {});
    check("Lage bei leerem Bestand: reason='no-vorgaenge' (unverändert)",
      empty && empty.available === false && empty.reason === "no-vorgaenge", JSON.stringify({ reason: empty && empty.reason }));
  } finally {
    storage.listKnowledgeObjects = origList;
    storage.v3StoreReady = origReady;
  }

  // ── 2) Morgen-Push: kein falsches Versprechen bei leerem Briefing ───────────
  const push = require("../lib/helmut/push");
  const emptyCases = [
    [{ available: false, reason: "store-error" }, "store-error"],
    [{ available: false, reason: "keine-treffer", items: [] }, "keine-treffer"],
    [{ available: true, items: [], personalizedRecommendations: [], situationalBriefing: [] }, "inhaltlich leer"]
  ];
  for (const [briefing, label] of emptyCases) {
    const res = await push.sendBriefingReadyPush(briefing, { id: "mdb-test" });
    check(`Morgen-Push wird bei leerem Briefing übersprungen (${label})`,
      res && res.skipped === true && /Kein inhaltliches Briefing/.test(res.reason || ""), JSON.stringify(res));
  }
  // Gate-Reihenfolge: Inhaltsprüfung steht VOR bestBriefingPush/Kategorie-Check.
  const pushSource = fs.readFileSync(path.join(root, "lib/helmut/push.js"), "utf8");
  const gateIdx = pushSource.indexOf("Kein inhaltliches Briefing");
  const bestIdx = pushSource.indexOf("const push = bestBriefingPush(briefing, profile);");
  check("Push-Inhalts-Gate steht vor der Push-Text-Erzeugung", gateIdx > 0 && bestIdx > gateIdx);

  // ── 3) Client: unterscheidbare Zustände + ehrliche Kopfzeile (vm) ───────────
  const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__st = {
    setBriefing: (b) => { briefing = b; },
    briefingDisruption: () => briefingDisruption(),
    lageDisruption: (d) => lageDisruption(d),
    renderLageEmpty: (d) => renderLageEmpty("Guten Morgen.", "Heute", d && d.emptyState, d),
    fresh: (v) => lageFreshnessLabel(v)
  };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    textContent: "", value: "", offsetParent: null });
  const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
      createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(),
      addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false },
    navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storageStub, sessionStorage: storageStub,
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
  const st = sandbox.__st;

  st.setBriefing({ available: false, reason: "store-error" });
  const d1 = st.briefingDisruption();
  check("Briefing store-error -> Störung (nicht 'kein Handlungsbedarf')",
    d1 && d1.kind === "stoerung" && d1.error === true && d1.title.includes("nicht verfügbar"));

  st.setBriefing({ available: false, reason: "budget" });
  const d2 = st.briefingDisruption();
  check("Briefing budget -> eigener Kontingent-Zustand", d2 && d2.kind === "budget" && d2.title.includes("Tageskontingent"));

  st.setBriefing({ available: false, reason: "keine-treffer" });
  check("Briefing keine-treffer -> KEIN Störungszustand (echter ruhiger Tag)", st.briefingDisruption() === null);

  st.setBriefing({ available: true });
  check("Verfügbares Briefing -> keine Störung", st.briefingDisruption() === null);

  const l1 = st.lageDisruption({ available: false, reason: "store-error" });
  const l2 = st.lageDisruption({ available: false, reason: "no-vorgaenge" });
  const l3 = st.lageDisruption({ available: false, reason: "budget" });
  check("Lage-Gründe werden unterschieden (Störung/Datenlücke/Budget)",
    l1 && l1.kind === "stoerung" && l2 && l2.kind === "datenluecke" && l3 && l3.kind === "budget");

  const htmlStoerung = st.renderLageEmpty({ available: false, reason: "store-error" });
  check("Lage-Leerzustand bei Störung zeigt Störungstext + data-empty-kind",
    htmlStoerung.includes("Daten derzeit nicht verfügbar") && htmlStoerung.includes('data-empty-kind="stoerung"'));
  const htmlNeutral = st.renderLageEmpty({ available: true });
  check("Neutraler Leerzustand bleibt der ruhige Alt-Text",
    htmlNeutral.includes("keine quellengestützten Vorgänge"));

  const today = new Date();
  const todayIso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 30).toISOString();
  const freshToday = st.fresh([{ sources: [{ publishedAt: "2026-01-01T10:00:00Z" }, { publishedAt: todayIso }] }]);
  check("Frische-Anzeige: heutige Quelle mit Uhrzeit", /Neueste Quelle heute, \d{2}:\d{2} Uhr\./.test(freshToday), freshToday);
  const freshOld = st.fresh([{ sources: [{ publishedAt: "2026-01-05T10:00:00Z" }] }]);
  check("Frische-Anzeige: alte Quelle mit Datum (Staleness sichtbar)", /Neueste Quelle vom \d+\./.test(freshOld), freshOld);
  check("Frische-Anzeige: ohne Quellendaten keine Behauptung", st.fresh([{ sources: [] }]) === "");

  check("Kopfzeilen behaupten keine 'neuen'/'heutigen' Vorgänge mehr",
    !clientSource.includes("Heute gibt es <b>")
    && !/totalLine = `Heute gibt es/.test(clientSource)
    && clientSource.includes('${countWord} in deiner Lage.'));

  // ── 4) Morgenablauf: Multi-Profil-Loop vorbereitet, Default AUS ─────────────
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("morning-briefing-Cron hat flag-gesicherten Multi-Profil-Loop (Default aus)",
    serverSource.includes("HELMUT_MORNING_PUSH_ALL_PROFILES")
    && /flagOn\(process\.env\.HELMUT_MORNING_PUSH_ALL_PROFILES\)/.test(serverSource)
    && /morning-briefing[\s\S]{0,2500}listProfiles\(\)/.test(serverSource));
  check("Multi-Profil-Loop überspringt deaktivierte Profile und hat Zeitbudget",
    /HELMUT_MORNING_PUSH_ALL_PROFILES[\s\S]{0,1600}val\.disabled/.test(serverSource)
    && /HELMUT_MORNING_PUSH_ALL_PROFILES[\s\S]{0,1600}deadline/.test(serverSource));
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  check("Neues Flag ist in .env.example dokumentiert", envExample.includes("HELMUT_MORNING_PUSH_ALL_PROFILES"));
  check("Cron-Zieländerung ist als Freigabepunkt dokumentiert (keine vercel.json-Änderung)",
    fs.readFileSync(path.join(root, "docs/freigabepunkte.md"), "utf8").includes("50 5 * * *")
    && fs.readFileSync(path.join(root, "vercel.json"), "utf8").includes('"0 5 * * *"'));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
