"use strict";

// Render-Test der 30-Sekunden-Betreiber-Uebersicht im Admin-Bereich. Fuehrt die ECHTEN
// Client-Funktionen (renderAdminOperatorOverview / renderAdminView) aus client.js in
// einem vm-Kontext (Browser-Stubs) aus und prueft das erzeugte HTML. KEIN Netz, KEINE KI.
// Geprueft: sechs Kacheln, semantische Status-Ableitung aus ECHTEN Feldern, neutrale
// 'Keine Daten' statt erfundener Werte, Hinweise nur bei echten Werten, Admin-Gating,
// keine Secrets/Kosten/Demo im Markup.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__adminTest = {
    overview: (data, ds, rec) => renderAdminOperatorOverview(data, ds, rec),
    view: () => renderAdminView(),
    setUser: (u) => { currentUser = u; },
    relAge: (iso) => adminRelAge(iso),
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
  if (!sandbox.__adminTest) throw new Error("Admin-Test-Hook nicht gesetzt");
  return sandbox.__adminTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const api = loadClient();
check("client.js laedt im vm (Admin-Boot ohne Browser)", Boolean(api && api.overview));

// -- Fixtures: exakt die Feld-Shapes, die server buildAdminDataStatus/-Overview/
//    buildPipelineRecoveryStatus liefern. Keine erfundenen Felder.
const nowIso = new Date().toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const dataHealthy = { generatedAt: minsAgo(2) };
const dsHealthy = {
  global: {
    ampel: "gruen",
    letzterLauf: minsAgo(18),
    modus: "full",
    quellen: { geprueft: 21, erfolgreich: 21, fehlgeschlagen: 0 },
    kiAnalyseFehler: false,
    morgenstatus0730: { ok: true, note: null },
    letzterFehler: null
  }
};
const recHealthy = {
  knowledgeObjects: { available: true, pending: 0, failed: 0, complete: 42 },
  understandingLock: { aktiv: false, verdaechtig: false },
  letzterUnderstandingLauf: minsAgo(18)
};

const htmlOk = api.overview(dataHealthy, dsHealthy, recHealthy);

// 1) Sechs Kacheln, alle geforderten Labels vorhanden.
const labels = ["System", "Datenstand", "Pipeline", "Quellen", "Understanding", "Watchdog"];
const tileCount = (htmlOk.match(/class="op-tile /g) || []).length;
check("Uebersicht rendert genau 6 Statuskacheln", tileCount === 6, `gefunden=${tileCount}`);
labels.forEach((l) => check(`Kachel [${l}] vorhanden`, htmlOk.includes(`>${l}<`)));

// 2) Gesunder Zustand -> alle Kacheln gruen (ok), keine Hinweiszeilen.
check("Gesund: 6 gruene Kacheln (op-tile--ok)", (htmlOk.match(/op-tile--ok/g) || []).length === 6);
check("Gesund: keine roten/gelben Kacheln", !/op-tile--bad|op-tile--warn/.test(htmlOk));
check("Gesund: keine Hinweiszeile (op-warnings)", !htmlOk.includes("op-warnings"));
check("Gesund: echte Zaehler sichtbar (21 von 21 ok)", htmlOk.includes("21 von 21 ok"));
check("Gesund: relatives Alter statt Rohzeit (vor .. Min.)", /vor \d+ Min\./.test(htmlOk));

// 3) Degradierter Zustand -> semantische Farben + echte Hinweiszeilen.
const dsBad = {
  global: {
    ampel: "rot",
    letzterLauf: new Date(Date.now() - 30 * 3600000).toISOString(), // 30h alt -> veraltet
    modus: "full",
    quellen: { geprueft: 21, erfolgreich: 18, fehlgeschlagen: 3 },
    kiAnalyseFehler: true,
    morgenstatus0730: { ok: false, note: "Kein erfolgreicher Tageslauf bis 7:30" },
    letzterFehler: { headline: "Crawl-Timeout", when: nowIso, scope: "pipeline" }
  }
};
const recBad = {
  knowledgeObjects: { available: true, pending: 4, failed: 2, complete: 10 },
  understandingLock: { aktiv: false, verdaechtig: true },
  letzterUnderstandingLauf: minsAgo(120)
};
const htmlBad = api.overview({ generatedAt: nowIso }, dsBad, recBad);

check("Degradiert: System rot (op-tile--bad)", htmlBad.includes("op-tile--bad"));
check("Degradiert: Datenstand als Veraltet (>24h)", htmlBad.includes("Veraltet"));
check("Degradiert: Quellen zeigen [3 Quellen pruefen]", htmlBad.includes("3 Quellen prüfen"));
check("Degradiert: Quellen NICHT rot bei 3/21 (gelb=pruefen)", /op-tile--warn/.test(htmlBad));
check("Degradiert: Understanding [2 Vorgaenge fehlgeschlagen]", htmlBad.includes("2 Vorgänge fehlgeschlagen"));
check("Degradiert: Watchdog zeigt Morgen-Check-Note", htmlBad.includes("Kein erfolgreicher Tageslauf bis 7:30"));
check("Hinweiszeile: fehlgeschlagene Quellen", htmlBad.includes("3 von 21 Quellen lieferten"));
check("Hinweiszeile: pending Understanding", htmlBad.includes("4 Understanding-Vorgänge warten"));
check("Hinweiszeile: failed Understanding", htmlBad.includes("2 Understanding-Vorgänge sind fehlgeschlagen"));
check("Hinweiszeile: verdaechtiger Lock", htmlBad.includes("Understanding-Lock wirkt veraltet"));
check("Hinweiszeile: letzter Fehler mit Headline", htmlBad.includes("Letzter Fehler: Crawl-Timeout"));

// 4) Fehlende Daten -> neutral 'Keine Daten'/'Unbekannt', NICHTS erfunden.
const htmlEmpty = api.overview({}, null, null);
check("Leer: keine Kachel-Farbe ausser grau (unknown)", !/op-tile--ok|op-tile--warn|op-tile--bad/.test(htmlEmpty));
check("Leer: neutrales 'Keine Daten'/'Unbekannt' statt Zahl", /Keine Daten|Unbekannt/.test(htmlEmpty));
check("Leer: keine erfundene Uhrzeit/Zahl in Kacheln", !/\d+ von \d+ ok/.test(htmlEmpty));
check("Leer: keine Hinweiszeilen ohne echte Daten", !htmlEmpty.includes("op-warnings"));

// 5) Sicherheit: keine Secrets, keine Kosten, keine Demo-Texte im Uebersicht-Markup.
const allOverview = htmlOk + htmlBad + htmlEmpty;
check("Keine Kostenwerte in der Uebersicht (kein $/EUR-Zeichen/USD/Kosten)", !/[$€]|USD|EUR|Kosten/.test(allOverview));
check("Keine Secret-Muster (key/token/secret/password)", !/secret|token|password|api[_-]?key|bearer/i.test(allOverview));
check("Keine Demo-/Platzhalter-Texte", !/lorem|dummy|beispieltext|coming soon|demnaechst|todo|fixme/i.test(allOverview));

// 6) Admin-Gating: Nicht-Admin sieht keinen Admin-Inhalt.
api.setUser({ role: "referent" });
const viewReferent = api.view();
check("Nicht-Admin (referent): renderAdminView -> Kein Zugriff", viewReferent.includes("Kein Zugriff"));
check("Nicht-Admin: kein op-tile / keine Betreiber-Uebersicht", !viewReferent.includes("op-tile"));
api.setUser({ role: "abgeordneter" });
check("Nicht-Admin (abgeordneter): kein Admin-Inhalt", api.view().includes("Kein Zugriff") && !api.view().includes("op-tile"));

// 7) relAge-Sanity (keine erfundene Praezision).
check("relAge: null bei fehlendem Wert", api.relAge(null) === null && api.relAge("nonsense") === null);
check("relAge: frisch -> 'gerade eben'", api.relAge(minsAgo(0.5)) === "gerade eben");
check("relAge: Minuten korrekt", api.relAge(minsAgo(12)) === "vor 12 Min.");

console.log(`\n${passed}/${passed + failed} Admin-Uebersicht-Checks bestanden.`);
if (failed > 0) process.exit(1);
