"use strict";

// Pilot-Readiness-Fix (2026-07, Teil 6): kein falscher Hintergrund-Aktualisierungshinweis.
// FRÜHERER FEHLER:
//   Nach einem DEFINITIV gescheiterten Live-Refresh (fetch-Reject/Timeout/Abbruch,
//   HTTP-Fehler oder JSON-Parse-Fehler) — bei bereits aus dem Cache gerendertem
//   Inhalt — toastete loadBriefing() "Helmut aktualisiert im Hintergrund" und kehrte
//   zurück. Es lief/plante aber nichts mehr im Hintergrund: die Aussage war unwahr.
// FIX: ehrliche Meldung ("Aktualisierung fehlgeschlagen – letzter Stand bleibt
//   sichtbar"); der gecachte Stand bleibt sichtbar, Retry über den Refresh-Button.
//   Der ERFOLGS-Pfad bleibt unverändert; der Nicht-Cache-Pfad re-throwt weiterhin
//   an den ehrlichen Boot-Fehlerhandler ("Briefing konnte nicht geladen werden").
// KEIN Netz (fetchWithTimeout gestubbt), KEINE KI.

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
const HONEST = "Aktualisierung fehlgeschlagen – letzter Stand bleibt sichtbar";

// ── Struktur-Guards ──────────────────────────────────────────────────────────
check("Quelle: unehrliche Meldung 'Helmut aktualisiert im Hintergrund' ist entfernt",
  !clientSource.includes("Helmut aktualisiert im Hintergrund"));
check("Quelle: ehrliche Fehl-/Stand-Meldung ist vorhanden", clientSource.includes(HONEST));

// ── Funktionaler Test im vm (echtes loadBriefing) ────────────────────────────
function loadClient() {
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `
    var __bgToasts = [];
    globalThis.__bg = {
      run: () => loadBriefing(),
      toasts: () => __bgToasts.slice(),
      clear: () => { __bgToasts.length = 0; },
      setFetch: (fn) => { fetchWithTimeout = fn; },
      setCache: (fn) => { loadCachedStartPayload = fn; },
      stub: () => {
        showToast = (m) => { __bgToasts.push(String(m)); };
        fetchAuthState = async () => null;
        applyStartPayload = () => {};
        saveCachedStartPayload = () => {};
        restorePersistedView = () => {};
        render = () => {};
        ensureViewData = async () => {};
        loadParliament = async () => {};
        generateOfficeDraftsInBackground = async () => {};
      }
    };`;

  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
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
  if (!sandbox.__bg) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__bg;
}

const CACHE = () => ({ profile: { id: "test-politician-one" }, briefing: { items: [] } });
const okResponse = (payload) => ({ ok: true, status: 200, json: () => Promise.resolve(payload) });

(async () => {
  const bg = loadClient();
  bg.stub();

  function hasHonest(toasts) { return toasts.some((t) => t.includes("fehlgeschlagen") && t.includes("letzter Stand")); }
  function hasBackgroundLie(toasts) { return toasts.some((t) => t.includes("im Hintergrund")); }

  // 1) Laufende/definitiv gescheiterte Aktualisierung MIT Cache (Netzfehler) -> ehrlicher Toast
  bg.clear(); bg.setCache(CACHE); bg.setFetch(async () => { throw new Error("network down"); });
  await bg.run();
  check("Netzfehler nach Cache-Render -> ehrliche Meldung (kein 'im Hintergrund')",
    hasHonest(bg.toasts()) && !hasBackgroundLie(bg.toasts()), JSON.stringify(bg.toasts()));

  // 2) HTTP-Fehler (500) MIT Cache -> ehrlicher Toast (Zeile 422 wirft -> catch)
  bg.clear(); bg.setCache(CACHE); bg.setFetch(async () => ({ ok: false, status: 500, json: () => Promise.resolve({}) }));
  await bg.run();
  check("HTTP 500 nach Cache-Render -> ehrliche Meldung (kein 'im Hintergrund')",
    hasHonest(bg.toasts()) && !hasBackgroundLie(bg.toasts()), JSON.stringify(bg.toasts()));

  // 3) Timeout/Abbruch MIT Cache -> ehrlicher Toast
  bg.clear(); bg.setCache(CACHE); bg.setFetch(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  await bg.run();
  check("Timeout/Abbruch nach Cache-Render -> ehrliche Meldung", hasHonest(bg.toasts()) && !hasBackgroundLie(bg.toasts()));

  // 4) ERFOLGREICHE Aktualisierung -> KEIN Fehl-Toast (Erfolgspfad unverändert)
  bg.clear(); bg.setCache(CACHE); bg.setFetch(async () => okResponse({ profile: { id: "test-politician-one" }, briefing: { items: [] }, aiStatus: { enabled: false } }));
  await bg.run();
  check("Erfolgreiche Aktualisierung -> KEIN Fehler-/Hintergrund-Toast",
    !hasHonest(bg.toasts()) && !hasBackgroundLie(bg.toasts()), JSON.stringify(bg.toasts()));

  // 5) Erneuter Versuch nach Fehler klappt (Erfolg räumt den Fehlerzustand auf)
  bg.clear(); bg.setCache(CACHE); bg.setFetch(async () => { throw new Error("net"); });
  await bg.run();
  const afterFail = bg.toasts().length;
  bg.clear(); bg.setFetch(async () => okResponse({ profile: { id: "test-politician-one" }, briefing: { items: [] } }));
  await bg.run();
  check("Erneuter Versuch: nach Fehler folgt bei Erfolg kein Fehler-Toast mehr",
    afterFail > 0 && bg.toasts().length === 0);

  // 6) OHNE Cache + Fehler -> re-throw (ehrlicher Boot-Handler greift), KEIN Cache-Toast
  bg.clear(); bg.setCache(() => null); bg.setFetch(async () => { throw new Error("net"); });
  let threw = false;
  try { await bg.run(); } catch (_) { threw = true; }
  check("Ohne Cache + Fehler -> loadBriefing re-throwt (Boot-Handler), kein irreführender Toast",
    threw && bg.toasts().length === 0);

  console.log(`\n${passed}/${passed + failed} Hintergrund-Refresh-Ehrlichkeit-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
