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
//   - KEINE Kostenwerte im Markup, KEINE Personen-Logik/Partei im Leerzustand, KEINE LLM-Calls

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
    hero: (state) => renderUiBriefingHero(state),
    lageCard: (v) => renderVorgangCard(v),
    lageSheet: (v) => vsheetContentHtml(v),
    lageView: () => renderLageView(),
    legacyHeadline: (s) => lageDisplayHeadline(s),
    mandateContext: () => renderUiMandateContext(),
    setProfile: (p) => { profile = p; },
    setBriefing: (b) => { briefing = b; },
    sie: (s) => uiSieText(s),
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
  updated_at: "2026-07-07T07:45:00Z",
  // Quellenpflicht (2026-08-22): ohne oeffnende Quelle traegt kein Vorgang den Stand.
  best_source_url: "https://beispiel.de/politik/arbeitszeit-1", best_link_type: "direct"
};
const koRelated = {
  id: "ko-vg-2", vorgang_id: "vg-2", status: "neu", understanding_status: "complete",
  display_title: "Laender fordern mehr Foerdermittel", was_ist_passiert: "Programm angekuendigt.", warum_wichtig: "Mittel fuer Kommunen.",
  why_relevant: "Chance fuer deinen Wahlkreis.", ausschuesse: ["Kommunales"], tags: ["Foerderung"],
  zeitdruck: "mittel", confidence_score: 70, source_document_count: 4, updated_at: "2026-07-06T09:00:00Z",
  // Quellenpflicht (2026-08-22): ohne oeffnende Quelle traegt kein Vorgang den Stand.
  best_source_url: "https://beispiel.de/politik/foerdermittel-2", best_link_type: "direct"
};
const sources = {
  "vg-1": [{ id: "rd-a", url: koPrimary.best_source_url, published_at: "2026-07-07T07:45:00Z" }, { id: "rd-b", url: "https://beispiel.de/politik/weiterer-beleg", published_at: "2026-07-06T10:00:00Z" }],
  "vg-2": [{ id: "rd-c", url: koRelated.best_source_url, published_at: "2026-07-07T07:00:00Z" }]
};
const decisions = [
  { knowledge_object_id: "ko-vg-1", vorgang_id: "vg-1", score: 88, decision: "Sofort reagieren", priority_type: "risk", risk: "Uneinheitliche Aussagen", chance: "Profilierung", matched_features: [] },
  { knowledge_object_id: "ko-vg-2", vorgang_id: "vg-2", score: 62, decision: "Sofort reagieren", priority_type: "chance", risk: "", chance: "Foerdermittel", matched_features: [] }
];
const kosById = { "ko-vg-1": koPrimary, "ko-vg-2": koRelated };

const fullState = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW });
const emptyState = contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW });
const staleSources = { "vg-1": [{ id:"rd-alt-frist", url:koPrimary.best_source_url,
  published_at:"2026-01-01T00:00:00Z", summary:"Die Abgabefrist endet am 07.07.2026." }] };
const staleState = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, updated_at: "2026-01-01T00:00:00Z", deadline:"2026-07-07T00:00:00Z" } },
  decisions: [decisions[0]], sourcesByVorgang: staleSources, now: NOW
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
check("Neuer Kopf: persönliches Briefing",
  html.includes("Ihr Briefing. Was jetzt Ihre Aufmerksamkeit braucht.") && !html.includes("Dein aktueller Stabschefstand"));
check("Briefing: Begruendung steht sichtbar neben dem naechsten Schritt",
  html.includes("Begründung:"));
check("Zielbild: Risiko/Chance-Level als gefülltes Badge in der jeweiligen Karte",
  /hstand-risk[\s\S]*?hstand-level--risk/.test(html) && /hstand-chance[\s\S]*?hstand-level--chance/.test(html));
check("Zielbild: farbige Sektions-Icon-Badges (hstand-kico) je Überschrift",
  (html.match(/hstand-kico/g) || []).length >= 5);
check("Feinschliff: Kommunikation labelt Format-Vorschläge ('Formate')",
  html.includes("hstand-comms-formats-label\">Formate<") && html.includes("hstand-comms-formats"));
{
  const commsBlock = (html.match(/hstand-comms"[\s\S]*?<\/section>/) || [""])[0];
  check("Feinschliff: Kommunikation zeigt hervorgehobene Empfehlung (Label + Format · Kanal)",
    commsBlock.includes("hstand-comms-rec-k") && commsBlock.includes(">Empfohlen<") && commsBlock.includes("Pressemitteilung · Presse"));
}
{
  const prop = (html.match(/class="ui-briefing-hero[^"]*"[\s\S]*?<\/section>/) || [""])[0];
  // Nur echte Chips zählen (jeder trägt einen --Modifier); NICHT den Container hstand-chiprow.
  const chipN = (prop.match(/hstand-chip--/g) || []).length;
  check("Feinschliff: Mein Vorschlag zeigt höchstens 3 Chips (ruhiger Kopf)",
    chipN <= 3 && prop.includes("Hohe Dringlichkeit") && !prop.includes(">Arbeitszeit<"), `chips=${chipN}`);
}
check("Feinschliff: Output-Chips ruhig (keine Accent-Button-Klasse mehr am Chip-Style)",
  html.includes('hstand-chip hstand-chip--out'));
check("Feinschliff: Quellenstand ist auch mobil als Quelle beschriftet",
  html.includes("hstand-mk-short") && html.includes(">Quelle<") && html.includes(">Quellenstand<"));
check("Voll: Mein Vorschlag zeigt die recommendation",
  html.includes("Ihr nächster Schritt") && html.includes("Intern abstimmen"));
check("Voll: Tagesanlass sichtbar, Lage-Einordnung nicht kopiert",
  html.includes("Begründung:") && html.includes("heutigen Arbeitstag") && !html.includes("Die Debatte gewinnt an Dynamik"));
check("Voll: Risiko bei Nichtreaktion + Risikostufe 'Hoch'",
  html.includes("Risiko bei Nichtreaktion") && /hstand-risk[\s\S]*?Hoch/.test(html));
check("Voll: Chance + Chancenstufe 'Hoch'",
  html.includes(">Chance<") && /hstand-chance[\s\S]*?Hoch/.test(html));
check("Voll: recommendedCommunication strukturiert (Format + Kanal + Outputs)",
  html.includes("Empfohlene Kommunikation") && html.includes("Pressemitteilung") && html.includes("Presse") &&
  html.includes("Q&amp;A") /* suggestedOutput qa -> Q&A escaped */);
check("Voll: actionItems strukturiert (Schritte mit Titel + dueHint)",
  html.includes("Was Sie jetzt tun sollten") && html.includes("Bis 14:00 Linie intern abstimmen") && html.includes("bis 14:00"));
const stepCount = (html.match(/class="hstand-step"/g) || []).length;
check("Voll: wenige Schritte (1..4)", stepCount >= 1 && stepCount <= 4, `n=${stepCount}`);
check("Voll: Aktueller Vorgang mit Titel + Quellenzahl 18 + Qualitaet",
  html.includes("Aktueller Vorgang") && html.includes("Arbeitszeit") && html.includes(">18<") && html.includes("Vollständig"));
const relCount = (html.match(/class="hstand-rel"/g) || []).length;
check("Voll: weitere relevante Vorgaenge (1..3)", relCount >= 1 && relCount <= 3, `n=${relCount}`);
check("Voll: Quellen-Fußzeile zeigt '18 Quellen'", html.includes("18 Quellen"));
check("Voll: Kopf-Status 'Aktuell' (fresh)", html.includes(">Aktuell<"));

// Ein belegter Tagesanlass braucht keine gespeicherte Handlungsempfehlung.
// Beide echten Adapterpfade muessen den Anlass bis zur sichtbaren UI erhalten.
const ohneEmpfehlungInput = { profile, decisions: [decisions[0]],
  kosById: { "ko-vg-1": { ...koPrimary, recommendation: "", handlungsempfehlung: "" } },
  sourcesByVorgang: sources, now: NOW };
for (const [name, state] of [
  ["buildCurrentHelmutState", contract.buildCurrentHelmutState(ohneEmpfehlungInput)],
  ["toBriefingContractV3", contract.toBriefingContractV3(ohneEmpfehlungInput).currentHelmutState]
]) {
  check(`${name}: echter Tagesanlass und Primaervorgang trotz leerer Empfehlung`,
    Boolean(state.primaryItem && state.whyItMatters) && state.recommendation === "");
  api.setBriefing(briefingWith(state));
  const ohneEmpfehlungHtml = api.render();
  const hero = api.hero(state);
  check(`${name}: gespeicherter Anlass wird als Warum heute relevant angezeigt`,
    ohneEmpfehlungHtml.includes("Warum heute relevant:")
    && hero.includes(api.esc(api.sie(state.whyItMatters))));
  check(`${name}: keine erfundene Handlungs- oder Bueroaufforderung ohne Empfehlung`,
    !/data-briefing-office|Ihr nächster Schritt|Entwurf im Büro öffnen|Begründung:|KI-Empfehlung/.test(hero)
    && !hero.includes("Prüfen Sie die Einordnung und Quellen zu diesem Vorgang."));
  const ohneWarum = api.hero({ ...state, whyItMatters: "" });
  check(`${name}: leeres Warum erzeugt keinen Relevanzplatzhalter`,
    !/Warum heute relevant:|Begründung:|ui-recommendation-why/.test(ohneWarum));
}
api.setBriefing(briefingWith(fullState));

// Mobil-Reihenfolge = DOM-Reihenfolge (Flex-Column): Aktueller Vorgang zuerst
// (der aktuelle Vorgang/Thema muss ganz oben stehen), danach Vorschlag ->
// Warum -> Risiko/Chance -> ... -> Quellen.
const idx = (s) => html.indexOf(s);
check("Mobil-Reihenfolge: Hauptvorgang mit nächstem Schritt, Kontext und Quellen",
  idx("ui-briefing-hero") < idx("Ihr nächster Schritt") &&
  idx("Ihr nächster Schritt") < idx("Begründung:") &&
  idx("Begründung:") < idx("Risiko bei Nichtreaktion") &&
  idx("Risiko bei Nichtreaktion") < idx("Empfohlene Kommunikation") &&
  idx("Empfohlene Kommunikation") < idx("Was Sie jetzt tun sollten") &&
  // Design 06.11.2026: „18 Quellen“ steht zusaetzlich in der Hero-Meta-Zeile; die
  // Quellen-Fusszeile (letztes Vorkommen) muss weiterhin ganz am Ende stehen.
  idx("Was Sie jetzt tun sollten") < html.lastIndexOf("18 Quellen"));

// KEINE Kostenwerte im Markup.
check("Voll: KEINE Kostenwerte/Token im Markup",
  !/cost|estimat|token|pipelineStep|€\s?\d|\$\d/i.test(html),
  (html.match(/cost|estimat|token/i) || []).slice(0, 1).join(""));

// === 2) Stale-Zustand ===
api.setBriefing(briefingWith(staleState));
const htmlStale = api.render();
check("Stale: Kopf-Status 'Nicht aktuell' (professionell, klar)",
  htmlStale.includes("Nicht aktuell") && !htmlStale.includes("Nicht mehr ganz frisch"));
check("Stale: Inhalt bleibt sichtbar (Vorschlag rendert weiter)",
  htmlStale.includes("Ihr nächster Schritt"));

// === 2a) Kopf-Chip: Slot-Name NUR bei frischem Stand, sonst 'Letzter Stand' ===
// Der Slot-NAME (z. B. „Mittagsbriefing") kommt aus der aktuellen Uhrzeit. Bei einem
// ALTEN Datenstand darf er nicht mit dem alten Datum vermischt werden — das wirkt falsch.
// Frisch -> Slot-Name; stale -> „Letzter Stand · <Datum>" (ehrlich, keine Vermischung).
const freshMidday = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW, briefingType: "midday" });
api.setBriefing(briefingWith(freshMidday));
const htmlFreshMidday = api.render();
check("Kopf: Quellenstand statt eines aus der Abrufzeit abgeleiteten Slot-Namens",
  freshMidday.status === "fresh" && htmlFreshMidday.includes("Quellenstand:") && !htmlFreshMidday.includes("Mittagsbriefing"));

const staleMidday = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, updated_at: "2026-01-01T00:00:00Z", deadline:"2026-07-07T00:00:00Z" } },
  decisions: [decisions[0]], sourcesByVorgang: staleSources, now: NOW, briefingType: "midday"
});
api.setBriefing(briefingWith(staleMidday));
const htmlStaleMidday = api.render();
check("Kopf: alter Quellenstand bleibt als Quellenstand erkennbar",
  staleMidday.status === "stale" && htmlStaleMidday.includes("Quellenstand:") && !htmlStaleMidday.includes("Mittagsbriefing"));
check("Kopf: stale Stand mischt KEINEN aktuellen Slot-Namen mit altem Datum",
  !/Mittagsbriefing|Morgenbriefing|Abendlage|Tagesbriefing/.test(htmlStaleMidday));

// === 2b) PRODUKTIONS-REPRO: aelteres KO (nur V3-Kern, KEINE neuen Stabschef-Felder) ===
// Genau der Production-Fall: available=true + primaryItem vorhanden, aber die vier neuen
// Stabschef-Felder sind leer (KO wurde vor deren Einfuehrung verstanden). Frueher wurde
// das faelschlich als "empty" versteckt. Jetzt: partial -> status fresh -> voller Stand
// mit dem vorhandenen Vorschlag (aus handlungsempfehlung) + ehrlichem "teilweise"-Hinweis.
const koOld = {
  id: "ko-old-1", vorgang_id: "vg-old-1", status: "neu", understanding_status: "complete",
  display_title: "Antrag zur Anpassung der Ausschussarbeit",
  was_ist_passiert: "Ein Antrag wurde eingebracht.",
  warum_wichtig: "Betrifft die Ausschussarbeit des Mandats.",
  handlungsempfehlung: "Intern kurz abstimmen und die Linie festhalten.",
  ausschuesse: ["Arbeit & Soziales"], zeitdruck: "mittel",
  source_document_count: 3, updated_at: NOW.toISOString(),
  // Quellenpflicht (2026-08-22): ohne oeffnende Quelle traegt kein Vorgang den Stand.
  best_source_url: "https://beispiel.de/politik/antrag-old-1", best_link_type: "direct"
};
const oldState = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-old-1": koOld },
  decisions: [{ knowledge_object_id: "ko-old-1", vorgang_id: "vg-old-1", score: 72, decision: "Sofort reagieren", priority_type: "risk", risk: "", chance: "", matched_features: [] }],
  sourcesByVorgang: { "vg-old-1": [{ id:"rd-old", url:koOld.best_source_url, published_at:NOW.toISOString() }] }, now: NOW
});
check("Prod-Repro: aelteres KO (nur V3-Kern) -> qualityStatus partial, status fresh (nicht empty)",
  oldState.qualityStatus === "partial" && oldState.status === "fresh" && Boolean(oldState.primaryItem));
check("Prod-Repro: recommendation aus handlungsempfehlung durchgereicht (echter Motor-Inhalt)",
  oldState.recommendation === "Intern kurz abstimmen und die Linie festhalten.");
api.setBriefing(briefingWith(oldState));
const htmlOld = api.render();
check("Prod-Repro: rendert den vollen Stand (.hstand), NICHT den Leerzustand",
  /class="hstand"/.test(htmlOld) && !/hstand--state/.test(htmlOld) && !htmlOld.includes("Heute kein Handlungsbedarf"));
check("Prod-Repro: Vorschlag sichtbar (ui-hero-next mit Motor-Empfehlung)",
  htmlOld.includes("ui-hero-next") && htmlOld.includes("Intern kurz abstimmen"));
check("Prod-Repro: ehrlicher 'teilweise vollständig'-Hinweis im Kopf (keine erfundenen Inhalte)",
  htmlOld.includes("Nur teilweise vollständig"));
check("Prod-Repro: leere Stabschef-Sektionen entfallen sauber (kein Risiko/Chance/Kommunikation erfunden)",
  !/hstand-risk|hstand-chance|hstand-comms|hstand-actions/.test(htmlOld));

// === 3) Leerer Zustand ===
api.setBriefing(briefingWith(emptyState));
const htmlEmpty = api.render();
check("Leer: neutraler Leerzustand (.hstand--state), kein Crash",
  /hstand--state/.test(htmlEmpty) && htmlEmpty.includes("Keine Tagespriorität belegt"));
check("Leer: kein Vorschlags-Fließtext (keine erfundenen Motor-Inhalte)",
  !htmlEmpty.includes("ui-hero-next"));
check("Leer: KEINE hartkodierte Partei / keine Personen-Logik",
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

// === 7) Review-Fixture (geschützter Abnahme-Modus) ===
const reviewFixture = require("../lib/helmut/reviewFixture");
check("Review: Flag ist per Default AUS (in Produktion inert)",
  reviewFixture.reviewFixtureEnabled() === false);
// Sicherheit: keine Branch-Autoaktivierung; Production sperrt auch ein gesetztes Flag.
{
  const save = { f: process.env.HELMUT_REVIEW_FIXTURE, e: process.env.VERCEL_ENV, r: process.env.VERCEL_GIT_COMMIT_REF };
  delete process.env.HELMUT_REVIEW_FIXTURE;
  process.env.VERCEL_ENV = "production"; process.env.VERCEL_GIT_COMMIT_REF = "claude/helmut-v3-foundation-pv2uw4";
  check("Review: in PRODUKTION immer inert (auch mit PR-Branch-Ref)", reviewFixture.reviewFixtureEnabled() === false);
  process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "main";
  check("Review: in Vorschau anderer Branches inert", reviewFixture.reviewFixtureEnabled() === false);
  process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "claude/helmut-v3-foundation-pv2uw4";
  check("Review: alter PR-Branch aktiviert keine Ersatzdaten", reviewFixture.reviewFixtureEnabled() === false);
  process.env.HELMUT_REVIEW_FIXTURE = "1";
  check("Review: explizite Vorschau-Abnahme bleibt möglich", reviewFixture.reviewFixtureEnabled() === true);
  delete process.env.VERCEL_ENV;
  check("Review: explizite lokale Abnahme bleibt möglich", reviewFixture.reviewFixtureEnabled() === true);
  process.env.VERCEL_ENV = "production";
  for (const flag of ["1", "true", "on", "yes"]) {
    process.env.HELMUT_REVIEW_FIXTURE = flag;
    check(`Review: Production sperrt explizites Flag ${flag}`, reviewFixture.reviewFixtureEnabled() === false);
  }
  if (save.f === undefined) delete process.env.HELMUT_REVIEW_FIXTURE; else process.env.HELMUT_REVIEW_FIXTURE = save.f;
  if (save.e === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = save.e;
  if (save.r === undefined) delete process.env.VERCEL_GIT_COMMIT_REF; else process.env.VERCEL_GIT_COMMIT_REF = save.r;
}
// Feste Mittags-Referenz (Europe/Berlin) statt Wall-Clock: buildReviewFixture setzt
// now-relative Zeitstempel (Primär-KO updated_at = now-45min). Der Tages-Frische-Guard
// (toBriefingContractV3) vergleicht deren Berlin-Kalendertag gegen `now` — bei einem
// Suite-Lauf kurz nach Berlin-Mitternacht kippt "now-45min" auf den Vortag und der
// Status würde fälschlich "stale". Mittags 12:00 Berlin hält Primär-KO und now am selben Tag.
const REVIEW_NOW = new Date("2026-07-15T10:00:00Z"); // 12:00 Europe/Berlin
const fx = reviewFixture.buildReviewFixture(REVIEW_NOW);
const fxBriefing = contract.toBriefingContractV3({ profile: fx.profile, decisions: fx.decisions, kosById: fx.kosById, sourcesByVorgang: fx.sourcesByVorgang, now: REVIEW_NOW });
const fxState = fxBriefing.currentHelmutState;
check("Review: liefert einen VOLLEN currentHelmutState (status fresh, qualityStatus valid)",
  fxState.status === "fresh" && fxState.qualityStatus === "valid");
check("Review: alle Abnahme-Felder befüllt",
  Boolean(fxState.recommendation) && Boolean(fxState.whyItMatters) && Boolean(fxState.riskOfNoAction) &&
  fxState.riskLevel === "high" && Boolean(fxState.opportunitySummary) && fxState.opportunityLevel === "high" &&
  Boolean(fxState.recommendedCommunication.communicationLine) && fxState.actionItems.length >= 1 &&
  fxState.primaryItem && fxState.primaryItem.sourceCount === 18 && fxState.sourceIds.length >= 1 &&
  Boolean(fxState.sourcesSummary.lastUpdated) && fxState.qualityStatus === "valid");
api.setBriefing(fxBriefing);
const fxHtml = api.render();
check("Review: rendert den vollen Stand (kein Leerzustand)",
  /class="hstand"/.test(fxHtml) && !/hstand--state/.test(fxHtml) && fxHtml.includes("heutigen Arbeitstag"));
check("Review: KEINE Kostenwerte im gerenderten Review-Stand",
  !/cost|estimat|token|pipelineStep|€\s?\d|\$\d/i.test(fxHtml));
check("Review: keine hartkodierte Partei / keine Personen-Logik im Fixture",
  !/\bcem\b|ince(?!Last)|\bSPD\b|\bCDU\b|\bAfD\b|\bFDP\b|Gr[üu]ne/i.test(JSON.stringify(fx).replace(/changedSinceLastVisit/g, "")));

const geteilterVorgang = {
  id: fxState.primaryItem.id, vorgangId: fxState.primaryItem.id,
  title: fxState.primaryItem.title, displayTitle: fxState.primaryItem.displayTitle,
  displaySummary: "Die belegten Fakten gehoeren in die Lage.",
  whyRelevant: fxState.whyItMatters, recommendation: fxState.recommendation,
  sources: [{ name: "Testquelle", url: fxState.primaryItem.sourceUrl }]
};
api.setBriefing({ ...fxBriefing, lageBriefing: { available: true, vorgaenge: [geteilterVorgang] } });
const getrennt = api.render();
const lageCard = api.lageCard(geteilterVorgang), lageSheet = api.lageSheet(geteilterVorgang);
check("Geteiltes Thema: Empfehlung bleibt im Briefing", getrennt.includes("ui-briefing-hero") && getrennt.includes("Ihr nächster Schritt"));
check("Lage Karte und Detail wiederholen keine Empfehlung", !lageCard.includes("Empfehlung")
  && !lageSheet.includes('class="vsheet-reco"') && !lageSheet.includes(fxState.recommendation));
check("Briefing verweist auf genau den vorhandenen Lage Vorgang", getrennt.includes(`data-vorgang="${geteilterVorgang.id}"`));
check("Briefing behaelt die Einordnung neben der Empfehlung auch bei Lagebezug",
  getrennt.includes('class="ui-recommendation-why"') && getrennt.includes(api.esc(api.sie(fxState.whyItMatters)))
  && lageSheet.includes("Zusätzliche Einordnung"));
check("Lage Detail verlinkt die Empfehlung statt sie zu kopieren", lageSheet.includes('data-view="helmut"')
  && lageSheet.includes("Empfehlung im Briefing öffnen"));
api.setBriefing(fxBriefing);
check("Ohne zugehoerige Lage bleibt Einordnung im Briefing erhalten", api.render().includes('class="ui-recommendation-why"'));
check("Fremder Vorgang bekommt keinen irrefuehrenden Briefing Verweis", !api.lageSheet({ ...geteilterVorgang,
  id: "vg-fremd", vorgangId: "vg-fremd" }).includes('data-view="helmut"'));

// Exakter, nativ belegter Titelabriss: fehlendes displayTitle aktivierte bisher
// die 72-Zeichen-Kuerzung. Der Quellentitel ist ein eigener, anderer Text.
const pflegeTitel = "Bundesregierung betont Rolle niedrigschwelliger Hilfe bei Pflegeversorgung";
check("Alter 72-Zeichen-Fallback reproduziert den exakten Abbruch", api.legacyHeadline(pflegeTitel)
  === "Bundesregierung betont Rolle niedrigschwelliger Hilfe bei");
const pflegeQuelle = "Niedrigschwellige Hilfe für Personen mit Pflegebedarf";
const pflegeVorgang = { id: "vg-titel-mobil", vorgangId: "vg-titel-mobil", title: pflegeTitel,
  displayTitle: "", status: "neu", displaySummary: "Vorhandene Pflege-Zusammenfassung.",
  sources: [{ name: "Testquelle", title: pflegeQuelle, url: "https://example.org/pflegeversorgung" }] };
api.setBriefing({ lageBriefing: { available: true, vorgaenge: [pflegeVorgang] } });
const pflegeListe = api.lageView();
const pflegeZeile = (pflegeListe.match(/class="ui-row-title"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
check("Exakter mobiler Titelbefund: Liste behaelt Pflegeversorgung statt Abbruch nach bei",
  pflegeZeile === pflegeTitel);
check("Lage zeigt vorhandenen Vorgangsstatus ohne Behauptung neuer Quellen",
  pflegeListe.includes("Vorgangsstatus: Neu") && !pflegeListe.includes("Neu seit dem letzten Besuch"));
const pflegeDetail = api.lageSheet(pflegeVorgang);
const quellenZeit = api.lageSheet({ ...pflegeVorgang, sources: [{ ...pflegeVorgang.sources[0], publishedAt: "2026-11-08T10:30:00Z" }] });
check("Quellenzeit ohne Praezisionsbeleg wird als Kalendertag statt als rohe ISO ausgegeben", quellenZeit.includes("8. November 2026")
  && !quellenZeit.includes("11:30") && !quellenZeit.includes("2026-11-08T10:30:00Z"));
const quellenTag = api.lageSheet({ ...pflegeVorgang, sources: [{ ...pflegeVorgang.sources[0], publishedAt: "2026-11-08" }] });
check("Datumsgenaue Quelle bekommt keine erfundene Uhrzeit", !quellenTag.includes("01:00") && !quellenTag.includes("00:00"));
const normalisierterTag = api.lageSheet({ ...pflegeVorgang, sources: [{ ...pflegeVorgang.sources[0], publishedAt: "2026-09-25T00:00:00Z" }] });
check("Auch ISO-normalisierter Publikationstag erfindet keine Berliner 02 Uhr", !normalisierterTag.includes("02:00") && normalisierterTag.includes("25. September 2026"));

check("Lage Detail erhaelt beide vorhandenen Titel ohne erfundene Vervollstaendigung",
  pflegeDetail.includes(pflegeTitel) && pflegeDetail.includes(pflegeQuelle));
check("Lage Detail erklaert die zeitliche Grenze des Status",
  /(?:Zeitpunkt|seit wann)[\s\S]{0,100}(?:nicht belegt|nicht ausgewiesen)|(?:nicht belegt|nicht ausgewiesen)[\s\S]{0,100}(?:Zeitpunkt|seit wann)/i.test(pflegeDetail));

const profilbezug = require("../lib/helmut/lage-profilbezug");
for (const [ebene, mandat, sachverhalt, grund] of [
  ["Bund", { parliamentType: "Bundestag", committees: ["Ausschuss für Arbeit und Soziales"] },
    "Der Bundestag berät das Rentengesetz.", "Deine Hauptzuständigkeit"],
  ["Berlin", { parliamentType: "Landtag", state: "Berlin", reportingTopics: ["Pflege"] },
    "Berlin stärkt die Pflegeversorgung.", "Deine konkrete Fachaufgabe"],
  ["Brandenburg", { parliamentType: "Landtag", state: "Brandenburg", constituency: "Potsdam" },
    "Potsdam eröffnet eine Beratungsstelle.", "Dein Wahlkreis"]
]) {
  const persoenlich = profilbezug.bewerte({ headline: sachverhalt }, mandat).erklaerung;
  const v = { ...pflegeVorgang, id: `vg-synthetisch-${ebene}`, vorgangId: `vg-synthetisch-${ebene}`,
    title: sachverhalt, relevanz: persoenlich };
  api.setBriefing({ lageBriefing: { available: true, vorgaenge: [v] } });
  check(`Synthetik ${ebene}: Liste zeigt den konkreten persoenlichen Bezug`,
    Boolean(persoenlich) && api.lageView().includes('class="ui-row-relevance"')
    && api.lageView().includes(api.esc(api.sie(persoenlich.satz))) && persoenlich.satz.startsWith(grund));
}
const ohnePersoenlich = { ...pflegeVorgang, policyField: "Gesundheitsausschuss", relevanz: null };
api.setBriefing({ lageBriefing: { available: true, vorgaenge: [ohnePersoenlich] } });
check("Sachkategorie ersetzt keinen fehlenden persoenlichen Mandatsbezug",
  !api.lageView().includes('class="ui-row-relevance"'));

for (const [mandat, parlament] of [
  [{ parliamentType: "Bundestag", state: "Berlin" }, "Bundestag"],
  [{ parliamentType: "Landtag", state: "Berlin" }, "Abgeordnetenhaus Berlin"],
  [{ politicalLevel: "Land", bundesland: "Brandenburg" }, "Landtag Brandenburg"],
  [{ state: "Berlin" }, "Mandatsebene nicht hinterlegt"]
]) {
  api.setProfile(mandat);
  check(`Mandatskontext: ${parlament} aus vorhandenen Feldern`,
    api.mandateContext().includes(`Mandat: ${parlament}</summary>`));
}
api.setProfile({ parliamentType: "Bundestag", reportingTopics: ["Pflegeberichterstattung"],
  focusTopics: ["Gesundheitsversorgung"], committees: ["Gesundheitsausschuss"],
  deputyCommittees: ["Haushaltsausschuss"], constituency: "Synthetischer Wahlkreis" });
const mandatHtml = api.mandateContext();
for (const [label, wert] of [["Fachzuständigkeit", "Pflegeberichterstattung"],
  ["Schwerpunkte", "Gesundheitsversorgung"], ["Ausschussmitgliedschaft", "Gesundheitsausschuss"],
  ["Stellvertretung im Ausschuss", "Haushaltsausschuss"], ["Wahlkreis", "Synthetischer Wahlkreis"]]) {
  check(`Mandatskontext trennt ${label}`, mandatHtml.includes(`<dt>${label}</dt><dd>${wert}</dd>`));
}
api.setProfile({});
check("Mandatskontext kennzeichnet fehlende Fachzustaendigkeit ausdruecklich",
  api.mandateContext().includes('<dt>Fachzuständigkeit</dt><dd>Nicht hinterlegt</dd>'));
api.setProfile(profile);

api.setBriefing({ lageBriefing: { available: true, vorgaenge: [pflegeVorgang], paragraphs: [
  { text: "Zugeordneter gespeicherter Lageabsatz.", vorgangIds: [pflegeVorgang.id], sources: pflegeVorgang.sources },
  { text: "FREMDER_ABSATZ", vorgangIds: ["vg-fremd"], sources: [] }
] } });
const quellenDetail = api.lageSheet({ ...pflegeVorgang, whyRelevant: "Zusaetzliche politische Bedeutung." });
check("Originalquellen stehen vor zusaetzlicher Einordnung", quellenDetail.indexOf("Originalquellen")
  < quellenDetail.indexOf("Zusätzliche Einordnung"));
check("Lageabsatz bleibt als Einordnung erkennbar und ist vorgangsgebunden",
  quellenDetail.includes("Zugeordneter gespeicherter Lageabsatz.") && quellenDetail.includes("kein Originalauszug")
  && !quellenDetail.includes("FREMDER_ABSATZ"));
check("Kartenquellen werden nicht als Aussageauszuege ausgegeben",
  quellenDetail.includes("keine aussagebezogenen Originalauszüge") && quellenDetail.includes(pflegeQuelle));

// Ruhiger Tag (06.11.2026): ohne belegten Tagesanlass bleibt das Briefing ehrlich
// leer. Laufende Lage-Themen werden NICHT als Briefing-Liste gezeigt, sondern nur
// gezählt und über die Lage erreichbar gemacht.
const { quietIntegrationPayload,pendingQuietIntegrationPayload } = require("./fixtures/ui-integration-contracts");
function quietRender(change = () => {}, payload = quietIntegrationPayload) {
  const b = payload().briefing;
  change(b);
  api.setBriefing(b);
  return { b, html: api.render() };
}
for (const [label, payload] of [["Ruhelage", quietIntegrationPayload], ["Cache-Miss", pendingQuietIntegrationPayload]]) {
  const quiet = quietRender(() => {}, payload);
  check(`${label}: ehrlicher Leerzustand statt Lage-Liste`,
    quiet.html.includes("hstand-state-card--quiet") && quiet.html.includes("Keine neue Tagespriorität")
    && !quiet.html.includes("data-briefing-overview") && !quiet.html.includes("data-briefing-paragraph")
    && !quiet.html.includes("data-briefing-existing-item"));
  check(`${label}: keine Lage-Texte im Briefing`,
    (quiet.b.lageBriefing.paragraphs || []).every(p => !quiet.html.includes(api.esc(p.text)))
    && quiet.b.lageBriefing.vorgaenge.every(v => !v.displaySummary || !quiet.html.includes(api.esc(v.displaySummary))));
  check(`${label}: Anzahl laufender Lage-Themen und Weg zur Lage`,
    /In der Lage laufen \d+ Themen weiter\./.test(quiet.html) && /data-view="briefing"[^>]*>Zur Lage</.test(quiet.html));
  check(`${label}: aktueller Kopf bleibt kurz, Erklaerung steht in der Leerkarte`,
    />Aktuell<\/span>/.test(quiet.html) && !quiet.html.includes("Aktuell · keine neue Tagespriorität")
    && !quiet.html.includes(">Kein aktueller Stand<"));
  check(`${label}: fehlender Tagesanlass wird einmal erklaert`,
    (quiet.html.match(/class="hstand-state-title">Keine neue Tagespriorität/g) || []).length === 1
    && !quiet.html.includes("Keine neue Tagespriorität belegt.")
    && !/class="hstand-state-sub">[^<]*Tagespriorität/.test(quiet.html));
  check(`${label}: gespeicherte Laufzeit statt HTTP-Projektionszeit im Kopf`,
    quiet.html.includes("06:15") && !quiet.html.includes("15:37"));
  check(`${label}: keine erfundene Priorität oder Empfehlung`,
    !/ui-briefing-hero|ui-hero-next|Heute entscheidend|Was du jetzt tun solltest|data-ui-jump/.test(quiet.html));
}

for (const [name, change] of [
  ["Frischevertrag fehlt", b => { delete b.currentHelmutState.frischeVertrag; }],
  ["Frischevertrag nicht aktuell", b => { Object.assign(b.currentHelmutState.frischeVertrag,{aktuell:false,grundText:"Synthetischer heutiger Lauf fehlt."}); }],
  ["veralteter Zustand", b => { b.currentHelmutState.status="stale"; b.currentHelmutState.staleState=true; }],
  ["Datenstand nicht von heute", b => { b.currentHelmutState.datenstandVonHeute=false; }],
  ["Datenlücke", b => { b.currentHelmutState.emptyState={kind:"gap"}; }],
  ["Fehler", b => { b.currentHelmutState.status="error"; b.currentHelmutState.errorState=true; }],
]) {
  const result=quietRender(change);
  check(`Ruhelage Schutz: ${name} wird nicht als ruhiger aktueller Tag gezeigt`,
    !result.html.includes("hstand-state-card--quiet") && !result.html.includes("Keine neue Tagespriorität"));
  if (name === "Frischevertrag nicht aktuell") check("Ruhelage Schutz: fehlender Lauf bleibt als Warnung sichtbar",
    result.html.includes("Synthetischer heutiger Lauf fehlt.") && result.html.includes("Briefing noch nicht aktuell"));
  if (name === "Fehler") check("Ruhelage Schutz: Fehler bleibt sichtbar",result.html.includes("hstand-state-card--error"));
}
const quietNoLage=quietRender(b=>{delete b.lageBriefing;}).html;
check("Ruhelage ohne Lage: ehrlicher Leerzustand ohne erfundene Themenzahl",
  />Aktuell<\/span>/.test(quietNoLage) && !/In der Lage laufen|Zur Lage<|ui-briefing-hero/.test(quietNoLage));

api.setBriefing({ currentHelmutState: { status: "empty", primaryItem: null,
  emptyState: { kind: "gap", headline: "Dein Briefing", detail: "Für dein Mandat fehlen Quellen." } },
  lageBriefing: { vorgaenge: [], emptyState: { kind: "gap", detail: "Für dein Mandat fehlen Quellen." } } });
check("Auch gelieferte Leerzustandstexte verwenden Sie-Ansprache", api.render().includes("Für Ihr Mandat fehlen Quellen.")
  && api.lageView().includes("Für Ihr Mandat fehlen Quellen."));

console.log(`\n${passed}/${passed + failed} Helmut-Tab-UI-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }

