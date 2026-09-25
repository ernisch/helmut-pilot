"use strict";
// Lokaler, netzloser Aufruf der echten Renderer. Keine DOM-/CSS-Vollabnahme.
// Details und erweiterte Radarsegmente gehoeren ausdruecklich zum Pruefumfang.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "../..");
function loadClient(now) {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  // Auto-Boot-Aufruf(e) am Ende entfernen (kein Netz/keine Timer im Test).
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  // Test-Hook im SELBEN Scope anhaengen (Zugriff auf `briefing`-let + Render-Funktion).
  code += `\n;globalThis.__helmutTest = {
    render: (b) => {
      briefing = b;
      radarMentionsExpanded = true; radarDynamicsExpanded = true; radarEnvExpanded = true;
      const r = b.currentRadarState?.anzeige || b.currentRadarState;
      const html = {
        briefing: renderHelmutStandView(),
        lage: renderLageView() + lageVisibleVorgaenge(lageData()).map(vsheetContentHtml).join(""),
        radar: renderRadarInner(r) + ["party", "constituency", "committees"].map(key => {
          radarSegment = key; return renderRadarEnvironment(r || {});
        }).join("")
      };
      return { html, fachinhalt: {
        briefing: Boolean(b.currentHelmutState?.primaryItem && !b.currentHelmutState.errorState
          && !["empty", "error"].includes(b.currentHelmutState.status)),
        lage: lageVisibleVorgaenge(lageData()).length > 0,
        radar: Boolean(r && radarStateHasContent(r))
      } };
    }
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
    console, Intl, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return new Date(now).getTime(); } }, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
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
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window.addEventListener = noop;
  sandbox.window.removeEventListener = noop;
  sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__helmutTest) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__helmutTest;
}


module.exports = function render(briefing, now) {
  if (!Number.isFinite(Date.parse(now))) throw new Error("bereichspruefung-zeit-fehlt");
  return loadClient(now).render(briefing);
};
