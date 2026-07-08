"use strict";

// Helmut V3 — Rendertest des Helmut-Tabs.
// Fuehrt die ECHTE Render-Funktion renderHelmutStandView() aus client.js in einem
// vm-Kontext (mit Browser-Stubs) aus und prueft das erzeugte HTML. Die Eingabe ist
// die ECHTE Ausgabe des V3-Adapters buildCurrentHelmutState -> testet Adapter + UI.
//
// Warum vm statt echtem Browser: In dieser Sandbox stuerzt der Chromium-Renderer beim
// vollstaendigen App-DOM ab (Umgebungsproblem). renderHelmutStandView ist eine reine
// String-Funktion (keine DOM-Mutation) -> im vm exakt und stabil pruefbar.
//
// Geprueft:
//   - App-Code laedt, Helmut-Tab rendert mit vollstaendigem currentHelmutState
//   - rendert mit leerem currentHelmutState (neutraler Leerzustand, kein Crash)
//   - alle geforderten Felder werden aus currentHelmutState angezeigt
//   - recommendedCommunication + actionItems bleiben strukturiert sichtbar
//   - riskLevel/opportunityLevel werden angezeigt
//   - status/staleState/qualityStatus werden angezeigt
//   - Mobil-Reihenfolge (DOM-Reihenfolge = Flex-Column-Reihenfolge): Vorschlag zuerst
//   - KEINE Kostenwerte im Markup, KEINE Cem-Logik/Partei im Leerzustand, KEINE LLM-Calls

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const contract = require(path.join(root, "lib", "helmut", "briefingContract"));

// --- client.js im vm laden (Browser-Globals gestubbt, Auto-Boot entfernt) ----
function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  // Auto-Boot-Aufruf(e) am Ende entfernen (kein Netz/keine Timer im Test).
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  // Test-Hook im SELBEN Scope anhaengen (Zugriff auf `briefing`-let + Render-Funktion).
  code += `\n;globalThis.__helmutTest = {
    render: () => renderHelmutStandView(),
    setBriefing: (b) => { briefing = b; },
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

// --- Echte V3-Daten (fiktiv) -> echter Adapter -> UI -------------------------
const NOW = new Date("2026-07-07T08:30:00Z");
const profile = { id: "u-1", tenantId: "t-1", firstName: "Test", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };
const koPrimary = {
  id: "ko-vg-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
  display_title: "Gesetzentwurf zur Regelung von Arbeitszeit", was_ist_passiert: "Entwurf vorgelegt.", warum_wichtig: "Betrifft viele.",
  why_relevant: "Die Debatte gewinnt an Dynamik und beruehrt Wahlkreis und Ausschussarbeit.",
  recommendation: "Heute nicht oeffentlich zuspitzen. Intern abstimmen. Linie vorbereiten.",
  ausschuesse: ["Arbeit & Soziales"], policy_field: ["Gesetzgebung"], parteien: ["Koalition"], tags: ["Arbeitszeit"],
  risiken: ["Uneinheitliche Aussagen"], chancen: ["Profilierung"], zeitdruck: "hoch",
  confidence_score: 85, source_document_count: 18,
  risk_of_no_action: "Wenn bis heute Nachmittag keine gemeinsame Linie steht, steigt das Risiko uneinheitlicher Aussagen.",
  opportunity_summary: "Soziale Entlastung frueh glaubwuerdig besetzen.",
  risk_level: "high", opportunity_level: "high",
  recommended_communication_struct: { communicationLine: "Wir beobachten die Entwicklung genau.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement", "qa"] },
  action_items_struct: [
    { title: "Bis 14:00 Linie intern abstimmen", description: "", dueHint: "bis 14:00", priority: "high", actionType: "alignInternally" },
    { title: "Kurzes Q&A vorbereiten", description: "", dueHint: "", priority: "medium", actionType: "prepareQA" },
    { title: "Monitoring starten", description: "", dueHint: "", priority: "low", actionType: "monitor" }
  ],
  updated_at: "2026-07-07T07:45:00Z"
};
const koRelated = {
  id: "ko-vg-2", vorgang_id: "vg-2", status: "neu", understanding_status: "complete",
  display_title: "Laender fordern mehr Foerdermittel", was_ist_passiert: "Programm angekuendigt.", warum_wichtig: "Mittel fuer Kommunen.",
  why_relevant: "Chance fuer deinen Wahlkreis.", ausschuesse: ["Kommunales"], tags: ["Foerderung"],
  zeitdruck: "mittel", confidence_score: 70, source_document_count: 4, updated_at: "2026-07-06T09:00:00Z"
};
const sources = {
  "vg-1": [{ id: "rd-a", published_at: "2026-07-07T07:45:00Z" }, { id: "rd-b", published_at: "2026-07-06T10:00:00Z" }],
  "vg-2": [{ id: "rd-c", published_at: "2026-07-06T09:00:00Z" }]
};
const decisions = [
  { knowledge_object_id: "ko-vg-1", vorgang_id: "vg-1", score: 88, decision: "Sofort reagieren", priority_type: "risk", risk: "Uneinheitliche Aussagen", chance: "Profilierung", matched_features: [] },
  { knowledge_object_id: "ko-vg-2", vorgang_id: "vg-2", score: 62, decision: "Sofort reagieren", priority_type: "chance", risk: "", chance: "Foerdermittel", matched_features: [] }
];
const kosById = { "ko-vg-1": koPrimary, "ko-vg-2": koRelated };

const fullState = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW });
const emptyState = contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW });
const staleState = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, updated_at: "2026-01-01T00:00:00Z" } },
  decisions: [decisions[0]], sourcesByVorgang: sources, now: NOW
});

function briefingWith(state) {
  return { engine: "v3", generatedAt: NOW.toISOString(), currentHelmutState: state };
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

let api;
try { api = loadClient(); }
catch (e) { console.error("FAIL  client.js im vm laden:", e && e.message); process.exit(1); }
check("client.js laedt im vm (Boot ohne echten Browser)", Boolean(api && api.render));

// === 1) Vollstaendiger Zustand ===
api.setBriefing(briefingWith(fullState));
const html = api.render();

check("Voll: rendert den Stand (.hstand), nicht den Leerzustand",
  /class="hstand"/.test(html) && !/hstand--state/.test(html));
check("Voll: Mein Vorschlag zeigt die recommendation",
  html.includes("Mein Vorschlag") && html.includes("Intern abstimmen"));
check("Voll: Warum-ist-das-wichtig sichtbar",
  html.includes("Warum ist das wichtig") && html.includes("Die Debatte gewinnt an Dynamik"));
check("Voll: Risiko bei Nichtreaktion + Risikostufe 'Hoch'",
  html.includes("Risiko bei Nichtreaktion") && /hstand-risk[\s\S]*?Hoch/.test(html));
check("Voll: Chance + Chancenstufe 'Hoch'",
  html.includes(">Chance<") && /hstand-chance[\s\S]*?Hoch/.test(html));
check("Voll: recommendedCommunication strukturiert (Format + Kanal + Outputs)",
  html.includes("Empfohlene Kommunikation") && html.includes("Pressemitteilung") && html.includes("Presse") &&
  html.includes("Q&amp;A") /* suggestedOutput qa -> Q&A escaped */);
check("Voll: actionItems strukturiert (Schritte mit Titel + dueHint)",
  html.includes("Was du jetzt tun solltest") && html.includes("Bis 14:00 Linie intern abstimmen") && html.includes("bis 14:00"));
const stepCount = (html.match(/class="hstand-step"/g) || []).length;
check("Voll: wenige Schritte (1..4)", stepCount >= 1 && stepCount <= 4, `n=${stepCount}`);
check("Voll: Aktueller Vorgang mit Titel + Quellenzahl 18 + Qualitaet",
  html.includes("Aktueller Vorgang") && html.includes("Arbeitszeit") && html.includes(">18<") && html.includes("Belastbar"));
const relCount = (html.match(/class="hstand-rel"/g) || []).length;
check("Voll: weitere relevante Vorgaenge (1..3)", relCount >= 1 && relCount <= 3, `n=${relCount}`);
check("Voll: Quellen-Fußzeile zeigt '18 Quellen'", html.includes("18 Quellen"));
check("Voll: Kopf-Status 'Aktuell' (fresh)", html.includes(">Aktuell<"));

// Mobil-Reihenfolge = DOM-Reihenfolge (Flex-Column): Vorschlag -> Warum -> Risiko/Chance -> ... -> Quellen.
const idx = (s) => html.indexOf(s);
check("Mobil-Reihenfolge: Vorschlag zuerst, Quellen zuletzt",
  idx("Mein Vorschlag") < idx("Warum ist das wichtig") &&
  idx("Warum ist das wichtig") < idx("Risiko bei Nichtreaktion") &&
  idx("Risiko bei Nichtreaktion") < idx("Empfohlene Kommunikation") &&
  idx("Empfohlene Kommunikation") < idx("Was du jetzt tun solltest") &&
  idx("Was du jetzt tun solltest") < idx("Aktueller Vorgang") &&
  idx("Aktueller Vorgang") < idx("18 Quellen"));

// KEINE Kostenwerte im Markup.
check("Voll: KEINE Kostenwerte/Token im Markup",
  !/cost|estimat|token|pipelineStep|€\s?\d|\$\d/i.test(html),
  (html.match(/cost|estimat|token/i) || []).slice(0, 1).join(""));

// === 2) Stale-Zustand ===
api.setBriefing(briefingWith(staleState));
const htmlStale = api.render();
check("Stale: Kopf-Status 'Nicht mehr ganz frisch' (nicht alarmistisch)",
  htmlStale.includes("Nicht mehr ganz frisch"));
check("Stale: Inhalt bleibt sichtbar (Vorschlag rendert weiter)",
  htmlStale.includes("Mein Vorschlag"));

// === 3) Leerer Zustand ===
api.setBriefing(briefingWith(emptyState));
const htmlEmpty = api.render();
check("Leer: neutraler Leerzustand (.hstand--state), kein Crash",
  /hstand--state/.test(htmlEmpty) && htmlEmpty.includes("Heute kein Handlungsbedarf"));
check("Leer: kein Vorschlags-Fließtext (keine erfundenen Motor-Inhalte)",
  !htmlEmpty.includes("hstand-proposal-text"));
check("Leer: KEINE hartkodierte Partei / keine Cem-Logik",
  !/cem|ince|\bSPD\b|\bCDU\b|Gr[üu]ne|\bLinke\b|\bAfD\b|\bFDP\b/i.test(htmlEmpty));

// === 4) currentHelmutState fehlt ganz ===
api.setBriefing({ engine: "v3" });
const htmlNone = api.render();
check("Fehlt: neutraler technischer Leerzustand ohne Crash",
  /hstand--state/.test(htmlNone) && htmlNone.includes("Kein aktueller Stand verfügbar"));

// === 5) Error-Zustand ===
api.setBriefing(briefingWith({ ...fullState, status: "error", errorState: true }));
const htmlErr = api.render();
check("Error: ehrlicher Fehlerzustand",
  /hstand-state-card--error/.test(htmlErr) && htmlErr.includes("konnte nicht geladen werden"));

// === 6) XSS/Escaping — kein roher HTML-Durchgriff aus Motor-Text ===
api.setBriefing(briefingWith({ ...fullState, recommendation: "<img src=x onerror=alert(1)>", primaryItem: fullState.primaryItem }));
const htmlXss = api.render();
check("Sicherheit: Motor-Text wird escaped (kein rohes <img> im Markup)",
  !htmlXss.includes("<img src=x") && htmlXss.includes("&lt;img"));

console.log(`\n${passed}/${passed + failed} Helmut-Tab-UI-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
