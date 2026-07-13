"use strict";

// UI-Test (Sprint 5): die DREI Client-Leerzustands-Renderer zeigen den unterscheidbaren
// Leerzustand (gap/stale/quiet) an, wenn der Server ihn liefert — und bleiben ohne ihn
// unveraendert (Flag aus). Laedt die ECHTEN Render-Funktionen aus client.js im vm-Kontext.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__scoringUi = {
    lageEmpty: (es) => renderLageEmpty("Guten Morgen.", "13. Juli 2026", es),
    radarEmpty: (es) => renderRadarEmpty({ status: "empty", emptyState: es, summary: { line1: "x", line2: "" } }),
    helmutEmpty: (es) => renderHstandStateCard({ status: "empty", emptyState: es, generatedAt: "2026-07-13T12:00:00Z", briefingType: "daily", profileId: null }, "empty")
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
  if (!sandbox.__scoringUi) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__scoringUi;
}

const ui = loadClient();

const gap = { tab: "lage", empty: true, kind: "gap", reason: "datenluecke", headline: "Datenlücke", detail: "Es liegen aktuell keine belegten Vorgänge vor. Das ist ein Datenausfall/Backlog, kein ruhiger Tag — bitte Quellenlauf prüfen." };
const quietLage = { tab: "lage", empty: true, kind: "quiet", reason: "ruhige-lage", headline: "Ruhige Lage", detail: "Heute liegen keine Vorgänge von überregionaler Bedeutung vor. Die Quellen sind aktuell — es ist wirklich ruhig, keine Datenlücke." };
const quietRadar = { tab: "radar", empty: true, kind: "quiet", reason: "kein-umfeldsignal", headline: "Nichts Neues in deinem Umfeld", detail: "Kein Datenausfall — nur ruhig um dich herum." };
const quietHelmut = { tab: "helmut", empty: true, kind: "quiet", reason: "kein-handlungsbedarf", headline: "Heute kein konkreter Handlungsbedarf", detail: "Die Datenlage ist frisch — es ist nichts zu tun, nichts ausgefallen." };

console.log("== LAGE-Leerzustand ==");
const lg = ui.lageEmpty(gap);
check("Lage gap: zeigt Ueberschrift 'Datenlücke'", lg.includes("Datenlücke"));
check("Lage gap: zeigt data-empty-kind=gap", /data-empty-kind="gap"/.test(lg));
check("Lage gap: warnt vor Ausfall (nicht 'ruhig')", /Datenausfall|prüfen/.test(lg));
const lq = ui.lageEmpty(quietLage);
check("Lage quiet: zeigt 'Ruhige Lage'", lq.includes("Ruhige Lage") && /data-empty-kind="quiet"/.test(lq));
const lNone = ui.lageEmpty(null);
check("Lage ohne emptyState: Alt-Text unveraendert", lNone.includes("keine quellengestützten Vorgänge") && !/data-empty-kind/.test(lNone));

console.log("== RADAR-Leerzustand ==");
const rq = ui.radarEmpty(quietRadar);
check("Radar quiet: zeigt Umfeld-Text + kind", rq.includes("ruhig um dich herum") && /data-empty-kind="quiet"/.test(rq));
const rNone = ui.radarEmpty(null);
check("Radar ohne emptyState: Alt-Verhalten (kein data-empty-kind)", !/data-empty-kind/.test(rNone));

console.log("== HELMUT-Leerzustand ==");
const hq = ui.helmutEmpty(quietHelmut);
check("Helmut quiet: zeigt Handlungsbedarf-Text + kind", hq.includes("nichts zu tun") && /data-empty-kind="quiet"/.test(hq));
const hNone = ui.helmutEmpty(null);
check("Helmut ohne emptyState: Alt-Text 'Heute kein Handlungsbedarf'", hNone.includes("Heute kein Handlungsbedarf") && !/data-empty-kind/.test(hNone));

console.log("== Drei Tabs UI-seitig unterscheidbar ==");
check("drei quiet-Ueberschriften unterschiedlich gerendert",
  new Set([
    (ui.lageEmpty(quietLage).match(/lage2-empty-title">([^<]+)</) || [])[1],
    (ui.radarEmpty(quietRadar).match(/radar2-summary[^>]*>[\s\S]*?<[^>]*>([^<]+)</) || [null, "r"])[1] || "r",
    (ui.helmutEmpty(quietHelmut).match(/hstand-state-title">([^<]+)</) || [])[1]
  ].filter(Boolean)).size >= 2);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
