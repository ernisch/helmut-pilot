"use strict";

// Guard gegen Event-Doppelbindung (Audit-Fix 2026-07).
// FRÜHERER FEHLER: render() ruft bindActions() bereits selbst auf; zusätzliche
// "render(); bindActions();"-Paare und das globale bindActions() nach
// patchCarousel() hängten allen NICHT ersetzten Elementen (Burger-Menü,
// Navigation, Aufklapper, Feedback-POSTs) bei jeder Karussell-Interaktion einen
// weiteren Listener an — Aktionen feuerten doppelt/n-fach, Navigation wirkte tot.
// JETZT: patchCarousel() bindet ausschließlich seinen ersetzten Teilbaum
// (bindCarousel + bindDetailOpen); nach render() gibt es kein zweites bindActions().
//
// Teil A: strukturelle Verbote im Quelltext (verhindert Rückfall).
// Teil B: funktionaler Zähltest im vm — patchCarousel() erhöht die Listener-Zahl
//         außerhalb des Karussells um exakt 0 und bindet neue Teilbaum-Knoten genau 1x.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "client.js"), "utf8");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Teil A: Struktur ────────────────────────────────────────────────────────
check("Kein 'render(); bindActions();' mehr (render bindet selbst)",
  !/render\(\);\s*bindActions\(\);/.test(source));
check("Kein globales bindActions() direkt nach patchCarousel()",
  !/patchCarousel\(\);\s*\n\s*bindActions\(\);/.test(source));
check("patchCarousel bindet seinen Teilbaum (bindCarousel + bindDetailOpen + bindDeckDecide)",
  /function patchCarousel\(\)[\s\S]{0,900}?bindCarousel\(wrap\);[\s\S]{0,200}?bindDetailOpen\(wrap\);[\s\S]{0,100}?bindDeckDecide\(wrap\);/.test(source));
check("bindDeckDecide existiert genau einmal als gescopte Funktion",
  (source.match(/function bindDeckDecide\(/g) || []).length === 1);
check("bindActions nutzt bindDeckDecide(app) statt eigener data-deck-decide-Schleife",
  source.includes("bindDeckDecide(app);") &&
  !/app\.querySelectorAll\("\[data-deck-decide\]"\)/.test(source));
check("bindDetailOpen existiert genau einmal als gescopte Funktion",
  (source.match(/function bindDetailOpen\(/g) || []).length === 1);
check("bindActions nutzt bindDetailOpen(app) statt eigener data-detail-Schleife",
  source.includes("bindDetailOpen(app);"));

// ── Teil B: funktionaler Zähltest ───────────────────────────────────────────
function countingNode(tag) {
  const counts = Object.create(null);
  return {
    __listenerCounts: counts, tagName: tag || "DIV",
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    style: {}, dataset: {},
    addEventListener(type) { counts[type] = (counts[type] || 0) + 1; },
    removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], appendChild() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, click() {}, closest: () => null, contains: () => false,
    insertAdjacentHTML() {}, scrollIntoView() {}, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  };
}

// App-Stub: liefert pro Selektor STABILE Knoten (simuliert persistentes DOM),
// das Karussell-Wrap ersetzt seine Kind-Knoten bei jedem innerHTML-Set
// (simuliert den Teilbaum-Austausch durch patchCarousel).
function makeDom() {
  const outside = new Map(); // Selektor -> [Knoten] außerhalb des Karussells
  let wrapChildren = new Map();
  const wrap = {
    ...countingNode("DIV"),
    set innerHTML(_v) { wrapChildren = new Map(); }, // Teilbaum ersetzt -> frische Knoten
    get innerHTML() { return ""; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      if (!wrapChildren.has(sel)) wrapChildren.set(sel, [countingNode("BUTTON")]);
      return wrapChildren.get(sel);
    }
  };
  const app = {
    ...countingNode("MAIN"),
    querySelector(sel) { return sel === "#helmutCarousel" ? wrap : (this.querySelectorAll(sel)[0] || null); },
    querySelectorAll(sel) {
      if (sel === "#helmutCarousel") return [wrap];
      if (!outside.has(sel)) outside.set(sel, [countingNode("BUTTON")]);
      return outside.get(sel);
    }
  };
  return { app, wrap, outside, wrapNodes: () => wrapChildren };
}

function loadClient(dom) {
  let code = source.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__ebTest = {
  bindAll: () => bindActions(),
  patch: () => patchCarousel(),
  bindDetail: (r) => bindDetailOpen(r)
};`;
  const noop = () => {};
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    // client.js holt sein Wurzelelement über document.querySelector("#app")
    // (client.js:147) — der Test injiziert hier den zählenden App-Stub.
    querySelector: (sel) => (sel === "#app" ? dom.app : countingNode()),
    querySelectorAll: () => [],
    getElementById: (id) => (id === "app" ? dom.app : countingNode()),
    createElement: () => countingNode(), createDocumentFragment: () => countingNode(),
    body: countingNode("BODY"), documentElement: countingNode("HTML"),
    addEventListener: noop, removeEventListener: noop,
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
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    __testApp: dom.app
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__ebTest;
}

const dom = makeDom();
const api = loadClient(dom);
check("client.js lädt im vm (Binding-Hooks gesetzt)", Boolean(api && api.patch && api.bindAll));

function totalOutsideListeners() {
  let sum = 0;
  for (const nodes of dom.outside.values()) for (const n of nodes) {
    for (const k of Object.keys(n.__listenerCounts)) sum += n.__listenerCounts[k];
  }
  return sum;
}

// Einmal global binden (wie render() es tut), dann 3 Karussell-Interaktionen simulieren.
api.bindAll();
const afterFirstBind = totalOutsideListeners();
check("Globales bindActions bindet Außen-Elemente (Basiszustand > 0)", afterFirstBind > 0, `sum=${afterFirstBind}`);

api.patch(); api.patch(); api.patch();
const afterPatches = totalOutsideListeners();
check("3x patchCarousel(): Listener-Zahl AUSSERHALB des Karussells unverändert",
  afterPatches === afterFirstBind, `vorher=${afterFirstBind} nachher=${afterPatches}`);

// Frische Teilbaum-Knoten sind nach einem Patch je EREIGNISTYP höchstens 1x
// gebunden (der Touch-Track trägt legitim touchstart UND touchend — je 1x).
api.patch();
let freshOk = true, freshDetail = "";
for (const [sel, nodes] of dom.wrapNodes().entries()) {
  for (const n of nodes) {
    for (const [type, count] of Object.entries(n.__listenerCounts)) {
      if (count > 1) { freshOk = false; freshDetail = `${sel}: ${count}x ${type}`; }
    }
  }
}
check("Neue Karussell-Knoten sind nach einem Patch höchstens 1x je Ereignistyp gebunden", freshOk, freshDetail);

// Review-Befund (0-Listener-Fall): die drei Entscheidungs-Buttons liegen IM
// ersetzten Teilbaum. "Höchstens 1x" allein hätte auch 0 Listener durchgelassen —
// hier der Positivnachweis: nach einem Patch ist [data-deck-decide] im frischen
// Teilbaum GENAU 1x auf click gebunden (vorher: 0 -> Buttons tot).
const deckNodes = dom.wrapNodes().get("[data-deck-decide]") || [];
const deckClicks = deckNodes.reduce((s, n) => s + (n.__listenerCounts.click || 0), 0);
check("Entscheidungs-Buttons sind nach patchCarousel wieder gebunden (genau 1x click)",
  deckNodes.length > 0 && deckClicks === deckNodes.length, `nodes=${deckNodes.length} clicks=${deckClicks}`);

console.log(`\n${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
