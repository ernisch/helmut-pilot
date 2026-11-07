"use strict";

// Der manuelle Kundenlauf ist entfernt. Der geteilte Intro-Renderer bleibt
// ehrlich: gespeicherter Stand wird geladen, keine Quellen-/KI-Pruefung behauptet.
// Historischer Dateiname bleibt fuer die vorhandene Testauswahl erhalten.
// Kein Netz und keine KI.

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

for (const name of ["renderRefreshButton", "data-refresh-helmut", "startPipelineRun",
  "pipelineCooldownKey", "executePipelineRun", "finishPipelineRun"]) {
  check(`Kein manueller Kundenlauf: ${name} entfernt`, !clientSource.includes(name));
}

function loadClient() {
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__t4 = { renderThinking: () => renderHelmutThinkingView(), csrf: (url) => needsCsrfToken(url) };`;

  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null });
  // In-Memory-localStorage fuer den Client-Boot.
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear()
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
      createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(),
      addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false },
    navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
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
  if (!sandbox.__t4) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__t4;
}

const client = loadClient();
check("Geteilter CSRF-Schutz fuer Pipeline und andere Verwaltungsaufrufe bleibt erhalten",
  ["/api/pipeline/run", "/api/crawl/run", "/api/lage/check", "/api/briefing/run"].every(url => client.csrf(url)));
const html = client.renderThinking();
check("Geteilter Intro-Renderer zeigt weiterhin den gespeicherten Ladevorgang",
  html.includes("Aktueller Stand wird geladen") && html.includes("helmut-refresh--intro"));
check("Intro behauptet keine Quellenpruefung, Verarbeitung oder Erfolg",
  !/Quellen werden geprüft|Mandat neu geprüft|Stand ist aktuell|progressbar/.test(html));
console.log(`\n${passed}/${passed + failed} Briefing-Ladeehrlichkeit-Assertions erfolgreich.`);
if (failed > 0) process.exit(1);
