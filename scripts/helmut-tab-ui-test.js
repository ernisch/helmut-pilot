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
    lageCard: (v) => renderVorgangCard(v),
    lageSheet: (v) => vsheetContentHtml(v),
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
  html.includes("Dein Briefing. Was jetzt deine Aufmerksamkeit braucht.") && !html.includes("Dein aktueller Stabschefstand"));
check("Feinschliff: 'Warum ist das wichtig?' mit Fragezeichen",
  html.includes("Warum ist das wichtig?"));
check("Zielbild: Risiko/Chance-Level als gefülltes Badge in der jeweiligen Karte",
  /hstand-risk[\s\S]*?hstand-level--risk/.test(html) && /hstand-chance[\s\S]*?hstand-level--chance/.test(html));
check("Zielbild: farbige Sektions-Icon-Badges (hstand-kico) je Überschrift",
  (html.match(/hstand-kico/g) || []).length >= 6);
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
check("Feinschliff: Mobil-Kurzlabel 'Stand' vorhanden (neben 'Letzte Aktualisierung')",
  html.includes("hstand-mk-short") && html.includes(">Stand<") && html.includes(">Letzte Aktualisierung<"));
check("Voll: Mein Vorschlag zeigt die recommendation",
  html.includes("Dein nächster Schritt") && html.includes("Intern abstimmen"));
check("Voll: Tagesanlass sichtbar, Lage-Einordnung nicht kopiert",
  html.includes("Warum ist das wichtig") && html.includes("heutigen Arbeitstag") && !html.includes("Die Debatte gewinnt an Dynamik"));
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
  html.includes("Aktueller Vorgang") && html.includes("Arbeitszeit") && html.includes(">18<") && html.includes("Vollständig"));
const relCount = (html.match(/class="hstand-rel"/g) || []).length;
check("Voll: weitere relevante Vorgaenge (1..3)", relCount >= 1 && relCount <= 3, `n=${relCount}`);
check("Voll: Quellen-Fußzeile zeigt '18 Quellen'", html.includes("18 Quellen"));
check("Voll: Kopf-Status 'Aktuell' (fresh)", html.includes(">Aktuell<"));

// Mobil-Reihenfolge = DOM-Reihenfolge (Flex-Column): Aktueller Vorgang zuerst
// (der aktuelle Vorgang/Thema muss ganz oben stehen), danach Vorschlag ->
// Warum -> Risiko/Chance -> ... -> Quellen.
const idx = (s) => html.indexOf(s);
check("Mobil-Reihenfolge: Hauptvorgang mit nächstem Schritt, Kontext und Quellen",
  idx("ui-briefing-hero") < idx("Dein nächster Schritt") &&
  idx("Dein nächster Schritt") < idx("Warum ist das wichtig") &&
  idx("Warum ist das wichtig") < idx("Risiko bei Nichtreaktion") &&
  idx("Risiko bei Nichtreaktion") < idx("Empfohlene Kommunikation") &&
  idx("Empfohlene Kommunikation") < idx("Was du jetzt tun solltest") &&
  idx("Was du jetzt tun solltest") < idx("18 Quellen"));

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
  htmlStale.includes("Dein nächster Schritt"));

// === 2a) Kopf-Chip: Slot-Name NUR bei frischem Stand, sonst 'Letzter Stand' ===
// Der Slot-NAME (z. B. „Mittagsbriefing") kommt aus der aktuellen Uhrzeit. Bei einem
// ALTEN Datenstand darf er nicht mit dem alten Datum vermischt werden — das wirkt falsch.
// Frisch -> Slot-Name; stale -> „Letzter Stand · <Datum>" (ehrlich, keine Vermischung).
const freshMidday = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW, briefingType: "midday" });
api.setBriefing(briefingWith(freshMidday));
const htmlFreshMidday = api.render();
check("Kopf: frischer Stand zeigt den Slot-Namen (Mittagsbriefing)",
  freshMidday.status === "fresh" && htmlFreshMidday.includes("Mittagsbriefing") && !htmlFreshMidday.includes("Letzter Stand"));

const staleMidday = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, updated_at: "2026-01-01T00:00:00Z", deadline:"2026-07-07T00:00:00Z" } },
  decisions: [decisions[0]], sourcesByVorgang: staleSources, now: NOW, briefingType: "midday"
});
api.setBriefing(briefingWith(staleMidday));
const htmlStaleMidday = api.render();
check("Kopf: stale Stand zeigt 'Letzter Stand' statt Slot-Name (keine Vermischung)",
  staleMidday.status === "stale" && htmlStaleMidday.includes("Letzter Stand") && !htmlStaleMidday.includes("Mittagsbriefing"));
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
  /hstand--state/.test(htmlEmpty) && htmlEmpty.includes("Heute kein Handlungsbedarf"));
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
// Sicherheit: Auto-Aktivierung NUR in der Vorschau dieses Branches, NIE in Produktion.
{
  const save = { f: process.env.HELMUT_REVIEW_FIXTURE, e: process.env.VERCEL_ENV, r: process.env.VERCEL_GIT_COMMIT_REF };
  delete process.env.HELMUT_REVIEW_FIXTURE;
  process.env.VERCEL_ENV = "production"; process.env.VERCEL_GIT_COMMIT_REF = "claude/helmut-v3-foundation-pv2uw4";
  check("Review: in PRODUKTION immer inert (auch mit PR-Branch-Ref)", reviewFixture.reviewFixtureEnabled() === false);
  process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "main";
  check("Review: in Vorschau anderer Branches inert", reviewFixture.reviewFixtureEnabled() === false);
  process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "claude/helmut-v3-foundation-pv2uw4";
  check("Review: in Vorschau DIESES PR-Branches aktiv", reviewFixture.reviewFixtureEnabled() === true);
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
check("Geteiltes Thema: Empfehlung bleibt im Briefing", getrennt.includes("ui-briefing-hero") && getrennt.includes("Dein nächster Schritt"));
check("Lage Karte und Detail wiederholen keine Empfehlung", !lageCard.includes("Empfehlung")
  && !lageSheet.includes('class="vsheet-reco"') && !lageSheet.includes(fxState.recommendation));
check("Briefing verweist auf genau den vorhandenen Lage Vorgang", getrennt.includes(`data-vorgang="${geteilterVorgang.id}"`));
check("Identische Einordnung erscheint einmal in der Lage", !getrennt.includes('class="hstand-card hstand-why"')
  && lageSheet.includes("Warum wichtig?"));
check("Lage Detail verlinkt die Empfehlung statt sie zu kopieren", lageSheet.includes('data-view="helmut"')
  && lageSheet.includes("Empfehlung im Briefing öffnen"));
api.setBriefing(fxBriefing);
check("Ohne zugehoerige Lage bleibt Einordnung im Briefing erhalten", api.render().includes('class="hstand-card hstand-why"'));
check("Fremder Vorgang bekommt keinen irrefuehrenden Briefing Verweis", !api.lageSheet({ ...geteilterVorgang,
  id: "vg-fremd", vorgangId: "vg-fremd" }).includes('data-view="helmut"'));

// Quiet does not mean absent: display the cached source-bound narrative when the
// current daily receipt is verified, without fabricating a priority or new text.
const { quietIntegrationPayload,pendingQuietIntegrationPayload } = require("./fixtures/ui-integration-contracts");
function quietRender(change = () => {}) {
  const b = quietIntegrationPayload().briefing;
  change(b);
  api.setBriefing(b);
  return { b, html: api.render() };
}
const quiet = quietRender();
check("Ruhelage: gespeicherter Tagesüberblick ersetzt den alleinigen Leerzustand",
  /<section\b[^>]*data-briefing-overview/.test(quiet.html) && quiet.html.includes("Dein Tagesüberblick"));
check("Ruhelage: beide belegten Lageabsätze bleiben wortgetreu sichtbar",
  quiet.b.lageBriefing.paragraphs.every(p => quiet.html.includes(api.esc(p.text)))
  && (quiet.html.match(/data-briefing-paragraph/g) || []).length === 2);
check("Ruhelage: Quellen und tatsächliches Quelldatum sind sichtbar",
  quiet.b.lageBriefing.vorgaenge.slice(0,2).every(v => v.sources.every(q => quiet.html.includes(`href="${q.url}"`) && quiet.html.includes(q.name)))
  && quiet.html.includes("05. Nov. 2026"));
check("Ruhelage: www-Variante und gleicher ISO-Zeitpunkt erhalten den belegten Absatz",
  quiet.b.lageBriefing.paragraphs[0].sources[0].url !== quiet.b.lageBriefing.vorgaenge[0].sources[0].url
  && quiet.html.includes(quiet.b.lageBriefing.paragraphs[0].text));
check("Ruhelage: jeder Absatz verlinkt seinen vorhandenen Lagevorgang",
  quiet.b.lageBriefing.paragraphs.every(p => p.vorgangIds.every(id =>
    new RegExp(`<button\\b[^>]*data-lage-verweis[^>]*data-vorgang="${id}"`).test(quiet.html))));
check("Ruhelage: aktueller Kopf benennt die fehlende neue Tagespriorität",
  quiet.html.includes("Aktuell · keine neue Tagespriorität") && !quiet.html.includes(">Kein aktueller Stand<"));
check("Ruhelage: gespeicherte Laufzeit statt HTTP-Projektionszeit im Kopf",
  quiet.html.includes("06:15") && !quiet.html.includes("15:37"));
check("Ruhelage: keine erfundene Priorität oder Empfehlung",
  !/ui-briefing-hero|ui-hero-next|Heute entscheidend|Was du jetzt tun solltest/.test(quiet.html));
check("Ruhelage: Hinweis verspricht keine nicht gerenderten älteren Vorgänge darunter",
  !/Ältere Vorgänge stehen unten|unten als weiterhin relevant|unten.*Hintergrund/i.test(quiet.html));

for (const [name, change] of [
  ["Frischevertrag fehlt", b => { delete b.currentHelmutState.frischeVertrag; }],
  ["Frischevertrag nicht aktuell", b => { Object.assign(b.currentHelmutState.frischeVertrag,{aktuell:false,grundText:"Synthetischer heutiger Lauf fehlt."}); }],
  ["veralteter Zustand", b => { b.currentHelmutState.status="stale"; b.currentHelmutState.staleState=true; }],
  ["Datenstand nicht von heute", b => { b.currentHelmutState.datenstandVonHeute=false; }],
  ["Datenlücke", b => { b.currentHelmutState.emptyState={kind:"gap"}; }],
  ["Fehler", b => { b.currentHelmutState.status="error"; b.currentHelmutState.errorState=true; }],
  ["Lage nicht verfügbar", b => { b.lageBriefing.available=false; }],
  ["Demo-Lage", b => { b.lageBriefing.demo=true; }],
  ["Narrativ noch ausstehend", b => { b.lageBriefing.pendingNarrative=true; }],
  ["Lage vom Vortag", b => { b.lageBriefing.generatedAt="2026-11-05T05:00:00Z"; }],
  ["Lagedatum ungültig", b => { b.lageBriefing.generatedAt="kein-datum"; }],
  ["Lage fehlt", b => { delete b.lageBriefing; }],
  ["Lage ohne Absätze", b => { b.lageBriefing.paragraphs=[]; }],
]) {
  const result=quietRender(change);
  check(`Ruhelage Schutz: ${name} ergibt keinen frischen Tagesüberblick`,
    !result.html.includes("data-briefing-overview") && !result.html.includes(quiet.b.lageBriefing.paragraphs[0].text));
  if (name === "Frischevertrag nicht aktuell") check("Ruhelage Schutz: fehlender Lauf bleibt als Warnung sichtbar",
    result.html.includes("Synthetischer heutiger Lauf fehlt.") && result.html.includes("Briefing noch nicht aktuell"));
  if (name === "Fehler") check("Ruhelage Schutz: Fehler bleibt sichtbar",result.html.includes("hstand-state-card--error"));
}
const quietNoLage=quietRender(b=>{delete b.lageBriefing;}).html;
check("Ruhelage ohne Lage: aktueller Lauf mit ehrlichem Fallback, ohne Hinweis auf Inhalte unten",
  quietNoLage.includes("Aktuell · keine neue Tagespriorität") && !/Ältere Vorgänge stehen unten|ui-briefing-hero/.test(quietNoLage));

for (const [name, change] of [
  ["ohne Quellen", p => { p.sources=[]; }],
  ["ohne Vorgangsbindung", p => { p.vorgangIds=[]; }],
  ["unbekannter Vorgang", p => { p.vorgangIds=["quiet-vorgang-unbekannt"]; }],
  ["Quelle nur an anderem sichtbaren Vorgang", p => { p.sources=quiet.b.lageBriefing.vorgaenge[1].sources; }],
  ...["javascript:alert(1)","data:text/html,<script>alert(1)</script>","http://example.test/beleg","https://example.test/",
    "https://user:pass@example.test/beleg","https://www.google.com/url?q=https://example.test/beleg"].map(url=>
    [`unsichere Quelle ${url.split(":")[0]} ${url.includes("pass") ? "credentials" : ""}`,p=>{p.sources=[{name:"Ungültige Quelle",url}];}])
]) {
  const result=quietRender(b=>{
    b.lageBriefing.paragraphs=[b.lageBriefing.paragraphs[0]];
    change(b.lageBriefing.paragraphs[0]);
  });
  check(`Tagesüberblick Quellenpflicht: ${name} verbirgt den unbelegten Absatz`,
    !result.html.includes(quiet.b.lageBriefing.paragraphs[0].text) && !result.html.includes("data-briefing-overview"));
}
const mixed=quietRender(b=>{b.lageBriefing.paragraphs[1].sources=[];}).html;
check("Tagesüberblick Quellenpflicht: belegter Absatz bleibt bei ungültigem Nachbarabsatz sichtbar",
  mixed.includes(quiet.b.lageBriefing.paragraphs[0].text) && !mixed.includes(quiet.b.lageBriefing.paragraphs[1].text));
const escaped=quietRender(b=>{
  b.lageBriefing.paragraphs[0].text='<img src=x onerror="alert(1)"> & synthetischer Text';
  b.lageBriefing.paragraphs[0].sources[0].name='<script>alert("Quelle")</script>';
}).html;
check("Tagesüberblick Sicherheit: Absatz und Quellenname werden als Text escaped",
  escaped.includes("&lt;img") && !escaped.includes("<img src=x") && !escaped.includes('<script>alert("Quelle")'));
const forgedSource=quietRender(b=>{
  b.lageBriefing.paragraphs[0].sources[0].publishedAt="2099-12-31T23:59:00Z";
  b.lageBriefing.paragraphs[0].sources[0].name="Gefälschte Quellenmetadaten";
}).html;
check("Tagesüberblick Quellenbindung: Quelldatum und Name stammen vom belegten Vorgang",
  forgedSource.includes(quiet.b.lageBriefing.paragraphs[0].text) && forgedSource.includes("Synthetische Quelle 1")
  && !forgedSource.includes("2099") && !forgedSource.includes("Gefälschte Quellenmetadaten"));
const escapedSource=quietRender(b=>{
  b.lageBriefing.vorgaenge[0].sources[0].name='<script>alert("Quelle")</script>';
}).html;
check("Tagesüberblick Sicherheit: gebundener Quellenname wird escaped",
  escapedSource.includes("&lt;script&gt;") && !escapedSource.includes('<script>alert("Quelle")'));
const undated=quietRender(b=>{
  b.lageBriefing.paragraphs=[b.lageBriefing.paragraphs[0]];
  b.lageBriefing.vorgaenge[0].sources[0].publishedAt="";
}).html;
check("Tagesüberblick Quellenbindung: fehlendes Vorgangsquelldatum wird nicht aus Absatzmetadaten erfunden",
  undated.includes("Quelldatum nicht belegt") && !undated.includes("05. Nov. 2026"));

function pendingRender(change = () => {}) {
  const b=pendingQuietIntegrationPayload().briefing;
  change(b);
  api.setBriefing(b);
  return {b,html:api.render()};
}
const pending=pendingRender();
const existingItems=[0,2,5,7].map(index=>pending.b.lageBriefing.vorgaenge[index]);
const existingText=v=>v.displaySummary || v.summary.wasIstPassiert;
check("Cache-Miss: neun vorhandene Karten ergeben vier belegte Sachstände im Tagesüberblick",
  pending.b.lageBriefing.vorgaenge.length===9 && pending.html.includes("data-briefing-overview")
  && (pending.html.match(/data-briefing-existing-item/g)||[]).length===4 && !pending.html.includes("data-briefing-paragraph"));
check("Cache-Miss: vorhandene Zusammenfassungen und Überschriften bleiben vollständig in Serverreihenfolge",
  existingItems.every(v=>pending.html.includes(api.esc(existingText(v))) && pending.html.includes(api.esc(v.displayTitle)))
  && existingItems.every((v,index)=>index===0 || pending.html.indexOf(existingText(existingItems[index-1]))<pending.html.indexOf(existingText(v))));
check("Cache-Miss: beide Platzhalter, Quellenhinweise und leere Zusammenfassungen entfallen",
  !pending.html.includes("Artikelauszug fehlt;") && !pending.html.includes("Keine nutzbaren Quellentexte")
  && !pending.html.includes(pending.b.lageBriefing.vorgaenge[4].displaySummary)
  && !pending.html.includes(`data-vorgang="${pending.b.lageBriefing.vorgaenge[8].id}"`));
check("Cache-Miss: jeder sichtbare Sachstand trägt seinen Quellenlink, Datum und Lageverweis",
  existingItems.every(v=>pending.html.includes(`href="${v.sources[0].url}"`) && pending.html.includes(v.sources[0].name)
    && pending.html.includes(`data-lage-verweis data-vorgang="${v.id}"`)) && pending.html.includes("05. Nov. 2026"));
check("Cache-Miss: ehrlicher Hinweis auf vorhandene Lage, keine HTTP-Zeit als Zusammenstellung",
  pending.html.includes("Vorhandener Sachstand aus der Lage") && !pending.html.includes("Zusammengestellt:")
  && !pending.html.includes("15:37") && pending.html.includes("06:15"));
check("Cache-Miss: kein alleiniger Leerzustand und keine erfundene Tagespriorität",
  pending.html.includes("Aktuell · keine neue Tagespriorität") && !/hstand-state-card|ui-briefing-hero|ui-hero-next|Heute entscheidend/.test(pending.html));
check("Cache-Miss: alle weiteren Vorgänge bleiben über die Lage erreichbar",
  /data-view="briefing"[^>]*>Alle Vorgänge in der Lage öffnen/.test(pending.html));
const capped=pendingRender(b=>{
  b.lageBriefing.vorgaenge[8].displaySummary="Fünfter vorhandener Sachstand, der über die Lage erreichbar bleibt.";
}).html;
check("Cache-Miss: höchstens vier Sachstände im Überblick, keine still erfundene Rangfolge",
  (capped.match(/data-briefing-existing-item/g)||[]).length===4 && !capped.includes("Fünfter vorhandener Sachstand"));
for (const [name,change] of [
  ["Frischequittung fehlt",b=>{delete b.currentHelmutState.frischeVertrag;}],
  ["Lauf nicht aktuell",b=>{b.currentHelmutState.frischeVertrag.aktuell=false;}],
  ["veralteter Zustand",b=>{b.currentHelmutState.staleState=true;}],
  ["Datenlücke",b=>{b.currentHelmutState.emptyState.kind="gap";}],
  ["Fehler",b=>{b.currentHelmutState.errorState=true;}],
  ["Briefing nicht verfügbar",b=>{b.available=false;}],
  ["Lage nicht verfügbar",b=>{b.lageBriefing.available=false;}],
  ["Demo-Lage",b=>{b.lageBriefing.demo=true;}],
  ["Pending-Marker fehlt",b=>{delete b.lageBriefing.pendingNarrative;}],
  ["Pending-Marker falsch",b=>{b.lageBriefing.pendingNarrative=false;}],
  ["Pending mit alten Absätzen",b=>{b.lageBriefing.paragraphs=quiet.b.lageBriefing.paragraphs;}],
  ["Pending ohne Absatzarray",b=>{delete b.lageBriefing.paragraphs;}],
  ["keine Vorgänge",b=>{b.lageBriefing.vorgaenge=[];}],
  ["nur Platzhalter",b=>{b.lageBriefing.vorgaenge=b.lageBriefing.vorgaenge.filter((v,index)=>![0,2,5,7].includes(index));}]
]) {
  const result=pendingRender(change);
  check(`Cache-Miss Schutz: ${name} zeigt keinen frischen Sachstandsüberblick`,
    !result.html.includes("data-briefing-overview") && !result.html.includes(existingText(existingItems[0])));
}
for (const url of [null,"javascript:alert(1)","data:text/html,unsafe","http://example.test/beleg","https://example.test/",
  "https://user:pass@example.test/beleg","https://www.google.com/url?q=https://example.test/beleg"]) {
  const result=pendingRender(b=>{
    b.lageBriefing.vorgaenge=[b.lageBriefing.vorgaenge[0]];
    b.lageBriefing.vorgaenge[0].sources=url===null ? [] : [{url,name:"Ungültige Quelle"}];
  });
  check(`Cache-Miss Quellenpflicht: ${url===null ? "ohne Quelle" : url} wird nicht als Sachstand angezeigt`,
    !result.html.includes("data-briefing-overview"));
}
const safeMixed=pendingRender(b=>{
  b.lageBriefing.vorgaenge[0].sources.push({name:"Unsichere Zusatzquelle",url:"javascript:alert(1)"});
}).html;
check("Cache-Miss Quellenpflicht: sichere Quelle bleibt nutzbar, unsichere Zusatzquelle entfällt",
  safeMixed.includes(existingText(existingItems[0])) && !safeMixed.includes("javascript:") && !safeMixed.includes("Unsichere Zusatzquelle"));
const pendingEscaped=pendingRender(b=>{
  const v=b.lageBriefing.vorgaenge[0];
  v.displayTitle='<img src=x onerror="alert(1)">';
  v.displaySummary='<script>alert("Sachstand")</script> & vorhandener Text';
  v.sources[0].name='<svg onload="alert(1)">';
}).html;
check("Cache-Miss Sicherheit: Titel, Zusammenfassung und Quellenname werden als Text escaped",
  pendingEscaped.includes("&lt;img") && pendingEscaped.includes("&lt;script&gt;") && pendingEscaped.includes("&lt;svg")
  && !pendingEscaped.includes("<img src=x") && !pendingEscaped.includes('<script>alert("Sachstand")'));
const pendingUndated=pendingRender(b=>{
  b.lageBriefing.vorgaenge=[b.lageBriefing.vorgaenge[0]];
  b.lageBriefing.vorgaenge[0].sources[0].publishedAt="";
}).html;
check("Cache-Miss Quellenpflicht: fehlendes Quelldatum wird ehrlich benannt",
  pendingUndated.includes("Quelldatum nicht belegt") && !pendingUndated.includes("05. Nov. 2026"));

console.log(`\n${passed}/${passed + failed} Helmut-Tab-UI-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
