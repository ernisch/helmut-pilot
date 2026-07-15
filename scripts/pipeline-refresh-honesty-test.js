"use strict";

// Pilot-Readiness-Fix (2026-07, Teil 4): "Einschätzung neu prüfen" — Erfolg NUR
// bei echtem erfolgreichem Serverergebnis.
// FRÜHERER FEHLER:
//   executePipelineRun() schloss den Lauf IMMER als Erfolg ("done") ab: bei
//   response.ok === false wurde result=null und trotzdem finishPipelineRun("done")
//   aufgerufen; der catch (Netzfehler/Timeout/ungültiges JSON) rief ebenfalls
//   finishPipelineRun("done", {reload:true}). Der Nutzer sah "Aktueller Stand
//   geladen" (grüner Haken), obwohl der Server einen Fehler zurückgab.
// FIX: HTTP-Fehler, {ok:false}, nicht parsebare Antwort und Netzfehler ergeben die
//   ehrliche Phase "error" (ruhige Meldung + Retry-Hinweis, alter Stand bleibt
//   sichtbar); nur ein echter Erfolg ergibt "done", ein Server-Skip "skipped".
// KEIN Netz (fetchWithTimeout ist im vm gestubbt), KEINE KI.

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

// ── Struktur-Guards gegen die alte unehrliche Erfolgsmeldung ─────────────────
check("Quelle: catch täuscht keinen Erfolg mehr vor (kein finishPipelineRun(\"done\" im Fehlerpfad)",
  !/catch\s*\{\s*\n\s*await finishPipelineRun\("done"/.test(clientSource));
check("Quelle: Fehlerpfad meldet ehrlich finishPipelineRun(\"error\"...)",
  /finishPipelineRun\("error"/.test(clientSource));
check("Quelle: executePipelineRun prüft response.ok/result/ok===false vor Erfolg",
  /if\s*\(!response\.ok\s*\|\|\s*!result\s*\|\|\s*result\.ok === false\)/.test(clientSource));
check("Quelle: renderHelmutThinkingView hat einen Fehler-Zweig (pipelinePhase === \"error\")",
  /pipelinePhase === "error"/.test(clientSource) && clientSource.includes("Aktualisierung gerade nicht möglich"));

// ── Funktionaler Test im vm (echte executePipelineRun + finishPipelineRun) ────
function loadClient() {
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  // Test-Hook im SELBEN Scope: reassign von render/loadBriefing/fetchWithTimeout
  // (alle Funktionsdeklarationen -> im Modul-Scope überschreibbar), damit weder
  // ein echter Render noch echtes Netz läuft. pipelinePhase/pipelineRunning sind
  // module-lets und über Closures les-/setzbar.
  code += `\n;globalThis.__t4 = {
    exec: () => executePipelineRun(),
    renderThinking: () => renderHelmutThinkingView(),
    getPhase: () => pipelinePhase,
    getRunning: () => pipelineRunning,
    setFetch: (fn) => { fetchWithTimeout = fn; },
    stubEnv: () => { render = () => {}; loadBriefing = async () => {}; },
    cooldownKey: () => pipelineCooldownKey,
    setCooldownNow: () => { window.localStorage.setItem(pipelineCooldownKey, String(Date.now())); },
    cooldownVal: () => window.localStorage.getItem(pipelineCooldownKey)
  };`;

  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null });
  // ECHTES In-Memory-localStorage (Map): der Cooldown-Reset im Fehlerpfad muss beobachtbar sein.
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

function response({ ok, status = 200, json }) {
  return { ok, status, json: () => (typeof json === "function" ? json() : Promise.resolve(json)) };
}

const SUCCESS_TITLE = "Aktueller Stand geladen";
const SUCCESS_SUB = "Helmut hat die Lage für dein Mandat neu geprüft.";
const ERROR_TITLE = "Aktualisierung gerade nicht möglich";
const SKIP_TITLE = "Stand ist aktuell";

(async () => {
  const t = loadClient();
  t.stubEnv();

  function noSuccessLeak(html) {
    return !html.includes(SUCCESS_TITLE) && !html.includes(SUCCESS_SUB);
  }

  // 1) HTTP 500 -> "error", KEINE Erfolgsmeldung
  t.setFetch(async () => response({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) }));
  await t.exec();
  check("HTTP 500 -> Phase 'error' (kein 'done')", t.getPhase() === "error", t.getPhase());
  {
    const html = t.renderThinking();
    check("HTTP 500 -> Fehlermeldung ohne Erfolgs-Behauptung",
      html.includes(ERROR_TITLE) && noSuccessLeak(html));
    check("HTTP 500 -> alter Stand bleibt sichtbar (Retry-Hinweis, kein technischer Fehlertext)",
      html.includes("zuletzt bekannte Stand bleibt sichtbar") && !/HTTP 500|status|\bError\b/.test(html));
  }

  // 2) Netzwerkfehler (fetch reject) -> "error"
  t.setFetch(async () => { throw new Error("network down"); });
  await t.exec();
  check("Netzwerkfehler -> Phase 'error'", t.getPhase() === "error");
  check("Netzwerkfehler -> renderThinking zeigt Fehlermeldung, keinen Erfolg", noSuccessLeak(t.renderThinking()) && t.renderThinking().includes(ERROR_TITLE));

  // 3) HTTP 200 mit fachlichem Fehler {ok:false} -> "error"
  t.setFetch(async () => response({ ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: "fachlich" }) }));
  await t.exec();
  check("HTTP 200 {ok:false} -> Phase 'error' (fachlicher Fehler ist kein Erfolg)", t.getPhase() === "error");

  // 4) Ungültiges JSON (json() wirft) -> "error"
  t.setFetch(async () => response({ ok: true, status: 200, json: () => Promise.reject(new Error("bad json")) }));
  await t.exec();
  check("Ungültiges JSON -> Phase 'error'", t.getPhase() === "error");

  // 5) Echter Erfolg (200, kein skippedReason, kein ok:false) -> "done" + Erfolgsmeldung
  t.setFetch(async () => response({ ok: true, status: 200, json: () => Promise.resolve({ timestamp: "2026-07-15T10:00:00Z", newVorgaenge: 2 }) }));
  await t.exec();
  check("Echter Erfolg -> Phase 'done'", t.getPhase() === "done", t.getPhase());
  check("Echter Erfolg -> Erfolgsmeldung 'Aktueller Stand geladen' erscheint",
    t.renderThinking().includes(SUCCESS_TITLE) && t.renderThinking().includes(SUCCESS_SUB));

  // 6) Server-Skip (Throttle/Lock) -> "skipped" (ehrlich, kein "gecrawlt/analysiert")
  t.setFetch(async () => response({ ok: true, status: 200, json: () => Promise.resolve({ skippedReason: "gerade erst gelaufen" }) }));
  await t.exec();
  check("Server-Skip -> Phase 'skipped'", t.getPhase() === "skipped", t.getPhase());
  check("Server-Skip -> ruhige 'Stand ist aktuell'-Meldung (nicht 'geladen')",
    t.renderThinking().includes(SKIP_TITLE) && !t.renderThinking().includes(SUCCESS_TITLE));

  // 7) Cooldown-Reset nach Fehler: "erneut versuchen" ist sofort möglich.
  t.setCooldownNow();
  check("Vorbedingung: Cooldown gesetzt", t.cooldownVal() !== null);
  t.setFetch(async () => { throw new Error("network down"); });
  await t.exec();
  check("Nach Fehler ist der Refresh-Cooldown zurückgesetzt (Retry sofort möglich)", t.cooldownVal() === null, String(t.cooldownVal()));

  // 8) Nach echtem Erfolg bleibt der Cooldown bestehen (kein unnötiger Sofort-Neustart nötig).
  t.setCooldownNow();
  t.setFetch(async () => response({ ok: true, status: 200, json: () => Promise.resolve({ timestamp: "x" }) }));
  await t.exec();
  check("Nach Erfolg bleibt der Cooldown erhalten (nur Fehler resettet)", t.cooldownVal() !== null);

  console.log(`\n${passed}/${passed + failed} Pipeline-Refresh-Ehrlichkeit-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
