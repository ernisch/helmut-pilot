"use strict";

// Paritätstest Lage-Auswahl Client vs. Server (Audit-Fix 2026-07, "Client-Cutoff").
// FRÜHERER FEHLER: der Client spiegelte eine strengere Entweder-oder-Regel
// (5 Presentation-Felder): sobald EINE vollständige Karte existierte, wurden alle
// übrigen belegten, vom Server gelieferten Karten ausgeblendet — der Server-Fix
// (gemischt: modern zuerst, Rest danach) war damit im UI wirkungslos.
// JETZT: der Client übernimmt die Server-Auswahl 1:1 (nur defensiver Quellen-Filter).
// Dieser Test beweist die Parität: was selectLageVorgaenge liefert, zeigt der
// Client vollständig und in derselben Reihenfolge an. KEIN Netz, KEINE KI.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const { selectLageVorgaenge } = require("../lib/helmut/lage");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__lageVisTest = { visible: (data) => lageVisibleVorgaenge(data) };`;
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
  if (!sandbox.__lageVisTest) throw new Error("Lage-Test-Hook nicht gesetzt");
  return sandbox.__lageVisTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const api = loadClient();
check("client.js lädt im vm", typeof api.visible === "function");

// Kartensatz wie in Production nach dem Server-Fix: EINE vollständig moderne
// Karte (alle 5 Felder) + belegte Legacy-/Teilkarten. Früher verschwand hier
// alles außer 'voll-modern'.
const src = [{ name: "Tagesschau", url: "https://www.tagesschau.de/x" }];
const cards = [
  { vorgangId: "voll-modern", title: "A", displayTitle: "A", displaySummary: "s", whyRelevant: "w", recommendation: "r", displayCategory: "K", sources: src, sourceCount: 1 },
  { vorgangId: "modern-ohne-titel", title: "B", displayTitle: "", displaySummary: "s", whyRelevant: "w", recommendation: "r", displayCategory: "", sources: src, sourceCount: 1 },
  { vorgangId: "legacy-belegt-1", title: "C", displaySummary: "", whyRelevant: "", recommendation: "", sources: src, sourceCount: 1 },
  { vorgangId: "legacy-belegt-2", title: "D", sources: src, sourceCount: 1 },
  { vorgangId: "ohne-quelle", title: "E", displaySummary: "s", whyRelevant: "w", recommendation: "r", sources: [], sourceCount: 0 }
];

// 1) Parität: Server-Auswahl == Client-Anzeige (Menge UND Reihenfolge).
const serverSel = selectLageVorgaenge(cards).map((c) => c.vorgangId);
const clientVis = api.visible({ vorgaenge: selectLageVorgaenge(cards) }).map((c) => c.vorgangId);
check("Client zeigt die Server-Auswahl vollständig und in Server-Reihenfolge",
  JSON.stringify(clientVis) === JSON.stringify(serverSel),
  `server=${serverSel.join(",")} client=${clientVis.join(",")}`);

// 2) Kein Entweder-oder mehr: trotz einer 5-Feld-Karte bleiben ALLE belegten sichtbar.
check("Belegte Legacy-Karten verschwinden NICHT neben einer vollständigen Karte",
  clientVis.includes("legacy-belegt-1") && clientVis.includes("legacy-belegt-2") && clientVis.includes("modern-ohne-titel"));

// 3) Moderne Karten stehen vorn (Server-Reihenfolge bleibt erhalten).
check("Moderne Karten zuerst (Server-Sortierung unangetastet)",
  clientVis[0] === "voll-modern" && clientVis[1] === "modern-ohne-titel");

// 4) Defensiver Quellen-Filter bleibt: unbelegte Karten erscheinen nie.
const direct = api.visible({ vorgaenge: cards });
check("Karten ohne echte Quelle bleiben ausgeblendet", !direct.some((c) => c.vorgangId === "ohne-quelle"));

// 5) Leere/kaputte Daten -> leere Liste (kein Crash).
check("Leere Daten ergeben leere Liste", api.visible(null).length === 0 && api.visible({}).length === 0);

console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
