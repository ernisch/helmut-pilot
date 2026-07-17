"use strict";

// Drei-Profile-End-to-End-Test (Mehrmandantenfaehigkeit — Zweitkunden-Beweis).
//
// Legt DREI rein KUENSTLICHE politische Testprofile an (zentrale Fixture
// scripts/fixtures/test-profiles.js + ein drittes Inline-Profil — KEINE echten
// Personen, keine echten Mandats-IDs) und laesst sie durch die vier ECHTEN
// Produktflaechen laufen:
//   - LAGE   (lib/helmut/lage.js: matching -> koToVorgangCard -> selectLageVorgaenge)
//   - RADAR  (lib/helmut/radar.js: buildRadarSignals)
//   - HELMUT (lib/helmut/decisions.js: decideForUser)
//   - BUERO  (lib/helmut/office.js: generateOfficeOutput, mit Mock-KI/Mock-Store)
//
// Bewiesen wird die vollstaendige Pruefliste:
//   1) Profilanlage (normalisiert wie im Admin) + Pflichtfelder (validateProfile)
//   2) Mandantentrennung (jedes Profil trifft SEIN Fachfeld, keine Fremd-Partei)
//   3) eigene Lage-Inhalte + Quellenbelege (jede Karte traegt echte Quellen)
//   4) eigene Radar-Inhalte (personen-/parteischarf, keine Fremd-Erwaehnung)
//   5) eigene Helmut-Empfehlungen (Top-Entscheidung = eigenes Fachfeld)
//   6) Buero-Verhalten + Cache-Trennung (pro Mandant getrennter Cache-Key)
//   7) Kostenlimit (per-Mandant-Budget: Stopp/Warnung/fail-closed)
//   8) KEINE Fremdinhalte (kein Profil bekommt das Fachfeld/die Person eines
//      ANDEREN Mandats als Top — es gibt kein bevorzugtes Pilotprofil mehr)
//   9) KEINE erfundenen Inhalte (leeres Profil bekommt nichts; alles hat Quelle)
//  10) KEINE Production-Gefahr (rein in-memory: KEIN Netz, KEINE DB, KEIN Secret)
//
// Reiner Offline-Lauf: keine echten storage-/ai-/Netz-Aufrufe. Die Buero-Flaeche
// wird mit injizierten Mock-Deps gefahren; alle anderen Flaechen laufen ueber die
// echten, reinen Engine-Funktionen. Aendert NICHTS an Production.

// Buero-Flag NUR fuer diesen Testprozess (kein Secret, kein Deploy): office.js
// liest isOfficeEnabled() aus process.env — hier lokal aktiviert.
process.env.HELMUT_V3_OFFICE = "1";

const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");
const { validateProfile } = require("../lib/helmut/profile-validation");
const matching = require("../lib/helmut/matching");
const radar = require("../lib/helmut/radar");
const decisions = require("../lib/helmut/decisions");
const lage = require("../lib/helmut/lage");
const office = require("../lib/helmut/office");
const storage = require("../lib/helmut/storage");
const template = require("../lib/helmut/template");
const { evaluateTenantBudget } = require("../lib/helmut/llm-budget");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

// ---------------------------------------------------------------------------
// DREI kuenstliche Testprofile. Angelegt in derselben Form, die der Admin-
// Schnellstart (normalizeProfile) erzeugt: berufliche Pflichtfelder (Partei,
// Wahlkreis/Land, Ausschuss, Themen). Bewusst VERSCHIEDENE Fachfelder;
// "three" teilt die Partei von "one" (Testpartei Alpha), aber NICHT dessen
// Ausschuss/Region — das ist der schaerfste Mandantentrennungs-Beweis
// (gleiche Partei darf nicht gleiche Inhalte heissen).
// ---------------------------------------------------------------------------
const PROFILES = {
  one: {
    ...testPoliticianOne,
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-arbeit"
  },
  two: {
    ...testPoliticianTwo,
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-gesundheit"
  },
  three: {
    id: "test-politician-three",
    fullName: "Test Politician Three",
    party: "Testpartei Alpha", // teilt die Partei von "one" — Trennung MUSS aus Ausschuss/Thema kommen
    faction: "Testpartei Alpha",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    // Landesliste, kein Direktwahlkreis -> Bundesland deckt die Region.
    state: "Bremen",
    location: "Testhafen",
    committee: "Ausschuss für Digitales und Staatsmodernisierung",
    focusTopics: ["Steuerpolitik", "Gleichstellung", "Medienpolitik", "Digitalisierung"],
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-digitales"
  }
};

// ---------------------------------------------------------------------------
// Repraesentativer, mandantenloser KO-Korpus (rein fiktive Inhalte). Jeder
// Vorgang traegt vollstaendige Analysefelder + eine vertrauenswuerdige Quelle
// (offizielle oder Leitmedien-Domain), damit der Source-Safety-Guard sie nicht
// quarantaeniert. KEIN kritischer/sensibler Claim-Wortschatz (sonst Quarantaene
// ohne Bestaetigung).
// ---------------------------------------------------------------------------
function ko(overrides) {
  return {
    status: "update",
    understanding_status: "complete",
    zeitdruck: "mittel",
    source_document_count: 3,
    confidence_score: 82,
    best_link_type: "direct",
    updated_at: "2026-07-13T08:00:00Z",
    created_at: "2026-07-13T08:00:00Z",
    ...overrides
  };
}

const KOS = [
  // --- one: Arbeit und Soziales (Testpartei Alpha) ---
  ko({
    id: "ko-arbeit", vorgang_id: "vg-arbeit",
    headline: "Tariftreuegesetz im Ausschuss für Arbeit und Soziales",
    display_title: "Tariftreuegesetz beraten",
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales berät das Bundestariftreuegesetz.",
    display_summary: "Der Ausschuss für Arbeit und Soziales berät das Bundestariftreuegesetz und die Stärkung der Tarifbindung.",
    warum_wichtig: "Betrifft Tarifbindung, Mindestlohn und die soziale Sicherung.",
    why_relevant: "Betrifft Arbeit und Soziales direkt.",
    recommendation: "Linie zur Tarifbindung vorbereiten.",
    handlungsempfehlung: "Linie zur Tarifbindung vorbereiten.",
    display_category: "BMAS",
    parteien: ["Testpartei Alpha"], ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    mentioned_parties: ["Testpartei Alpha"], mentioned_people: ["Test Politician One"], mentioned_locations: ["Teststadt"],
    tags: ["Tarifbindung", "Mindestlohn"],
    risiken: ["Aufweichung der Tarifbindung"], chancen: ["Stärkung der Tariftreue"],
    best_source_url: "https://www.bmas.de/beispiel-tariftreue"
  }),
  // --- two: Gesundheit / Pflegeversicherung (Testpartei Beta) ---
  ko({
    id: "ko-gesundheit", vorgang_id: "vg-gesundheit", status: "neu",
    headline: "Gesundheitsausschuss berät Reform der Pflegeversicherung",
    display_title: "Reform der Pflegeversicherung im Gesundheitsausschuss",
    was_ist_passiert: "Der Ausschuss für Gesundheit berät die Reform der Pflegeversicherung.",
    display_summary: "Der Ausschuss für Gesundheit berät die Reform der Pflegeversicherung und die Finanzierung der Versorgung.",
    warum_wichtig: "Betrifft die Gesundheitspolitik und die Pflegeversicherung unmittelbar.",
    why_relevant: "Betrifft Gesundheit und Pflegeversicherung direkt.",
    recommendation: "Position zur Pflegereform vorbereiten.",
    handlungsempfehlung: "Position zur Pflegereform vorbereiten.",
    display_category: "BMG",
    parteien: ["Testpartei Beta"], ausschuesse: ["Ausschuss für Gesundheit"],
    mentioned_parties: ["Testpartei Beta"], mentioned_people: ["Test Politician Two"], mentioned_locations: ["Testdorf"],
    tags: ["Gesundheit", "Pflegeversicherung"],
    risiken: ["Finanzierungslücke in der Pflegeversicherung"], chancen: ["Verlässliche Pflegeversorgung"],
    best_source_url: "https://www.bundestag.de/beispiel-gesundheit"
  }),
  // --- three: Digitales / Steuerpolitik (Testpartei Alpha) ---
  ko({
    id: "ko-digitales", vorgang_id: "vg-digitales", status: "neu",
    headline: "Digitalausschuss berät Plattformbesteuerung",
    display_title: "Plattformbesteuerung im Digitalausschuss",
    was_ist_passiert: "Der Ausschuss für Digitales und Staatsmodernisierung berät die Besteuerung großer Digitalplattformen.",
    display_summary: "Der Ausschuss für Digitales und Staatsmodernisierung berät die faire Besteuerung großer Digitalplattformen und Fragen der digitalen Gleichstellung.",
    warum_wichtig: "Betrifft die Steuerpolitik und die Digitalisierung des Staates.",
    why_relevant: "Betrifft die Steuerpolitik und Digitalisierung direkt.",
    recommendation: "Position zur Plattformbesteuerung vorbereiten.",
    handlungsempfehlung: "Position zur Plattformbesteuerung vorbereiten.",
    display_category: "Digitalausschuss",
    parteien: ["Testpartei Alpha"], ausschuesse: ["Ausschuss für Digitales und Staatsmodernisierung"],
    mentioned_parties: ["Testpartei Alpha"], mentioned_people: ["Test Politician Three"], mentioned_locations: ["Testhafen"],
    tags: ["Steuerpolitik", "Digitalisierung"],
    risiken: ["Steuerausfälle bei Digitalkonzernen"], chancen: ["Gerechtere Besteuerung großer Plattformen"],
    best_source_url: "https://www.bundestag.de/beispiel-digitales"
  })
];

// Quellen je Vorgang (vertrauenswuerdige Belege: offiziell + Leitmedium;
// Beispiel-Pfade, keine echten Artikel).
const DOCS_BY_VG = {
  "vg-arbeit": [
    { url: "https://www.bmas.de/beispiel-tariftreue", source_name: "BMAS", source_type: "ministry", published_at: "2026-07-13T07:00:00Z", title: "Bundestariftreuegesetz" },
    { url: "https://www.tagesschau.de/beispiel-tariftreue", source_name: "tagesschau", source_type: "media", published_at: "2026-07-13T06:30:00Z", title: "Tariftreuegesetz" }
  ],
  "vg-gesundheit": [
    { url: "https://www.bundestag.de/beispiel-gesundheit", source_name: "Deutscher Bundestag", source_type: "bundestag", published_at: "2026-07-13T07:15:00Z", title: "Gesundheitsausschuss" },
    { url: "https://www.zeit.de/beispiel-pflegeversicherung", source_name: "Zeit", source_type: "media", published_at: "2026-07-13T05:40:00Z", title: "Reform der Pflegeversicherung" }
  ],
  "vg-digitales": [
    { url: "https://www.bundestag.de/beispiel-digitales", source_name: "Deutscher Bundestag", source_type: "bundestag", published_at: "2026-07-13T07:20:00Z", title: "Digitalausschuss" },
    { url: "https://www.spiegel.de/beispiel-plattformbesteuerung", source_name: "Spiegel", source_type: "media", published_at: "2026-07-13T05:10:00Z", title: "Besteuerung von Digitalplattformen" }
  ]
};

const ALL = [PROFILES.one, PROFILES.two, PROFILES.three];

// ===========================================================================
// 1) PROFILANLAGE + PFLICHTFELDER
// ===========================================================================
section("1) Profilanlage im Admin + Pflichtfelder (validateProfile)");
for (const p of ALL) {
  const v = validateProfile(p);
  check(`${p.fullName}: Zustand „Vollständig"`, v.state === "vollstaendig", `${v.state} — fehlt: ${v.missingRequiredLabels.join(", ")}`);
  check(`${p.fullName}: keine fehlenden Pflichtfelder`, v.missingRequired.length === 0, v.missingRequiredLabels.join(", "));
  check(`${p.fullName}: kann personalisiert versorgt werden`, v.impact.kannBriefingErhalten && v.impact.kannLagePersonalisieren && v.impact.kannHelmutEmpfehlen);
  check(`${p.fullName}: Radar-faehig (Name gesetzt)`, v.impact.kannRadar);
}
// Gegenprobe: ein leeres Profil ist NICHT bereit (kein erfundenes „vollstaendig").
const leer = validateProfile({ id: "test-leer" });
check("Leeres Profil -> nicht bereit (keine Erfindung)", leer.state === "nicht_bereit", leer.state);

// ===========================================================================
// 2) MANDANTENTRENNUNG (Matching-Engine)
// ===========================================================================
section("2) Mandantentrennung — jedes Profil trifft SEIN Fachfeld");
const rankByProfile = {};
for (const p of ALL) {
  const ranked = matching.matchProfileToKnowledgeObjects(p, KOS, { limit: 8 });
  rankByProfile[p.id] = ranked;
  const withFeat = ranked.filter((r) => (r.matched_features || []).length > 0);
  const top = withFeat[0];
  check(`${p.fullName}: Top-Fachtreffer = ${p.expectField}`, top && top.knowledge_object_id === p.expectField,
    JSON.stringify(withFeat.map((r) => [r.knowledge_object_id, r.matched_features.map((f) => f.type)])));
}
// Drei verschiedene Fachprofile -> drei verschiedene Top-Fachtreffer (Kunde A != B).
const tops = ALL.map((p) => (rankByProfile[p.id].filter((r) => r.matched_features.length)[0] || {}).knowledge_object_id);
check("Drei Profile -> drei UNTERSCHIEDLICHE Top-Fachtreffer", new Set(tops).size === 3, JSON.stringify(tops));

section("2b) Keine Cross-Contamination (fremde Partei/Ausschuss feuert nicht)");
function feat(profileId, koId, type) {
  const r = (rankByProfile[profileId] || []).find((x) => x.knowledge_object_id === koId);
  return (r && r.matched_features || []).some((f) => f.type === type);
}
// Beta-Profil (two) bekommt an keinem Alpha-KO einen Partei-Treffer.
check("Two (Beta): kein Partei-Treffer am Arbeit-KO (Alpha)", !feat("test-politician-two", "ko-arbeit", "partei"));
check("Two (Beta): kein Partei-Treffer am Digitales-KO (Alpha)", !feat("test-politician-two", "ko-digitales", "partei"));
// one bekommt keinen Ausschuss-Treffer am Gesundheits-/Digitales-KO.
check("One: kein Ausschuss-Treffer am Gesundheits-KO", !feat("test-politician-one", "ko-gesundheit", "ausschuss"));
check("One: kein Ausschuss-Treffer am Digitales-KO", !feat("test-politician-one", "ko-digitales", "ausschuss"));

section("2c) Gleiche Partei, andere Zustaendigkeit (one vs. three, beide Testpartei Alpha)");
// Beide sind Testpartei Alpha -> BEIDE bekommen an beiden Alpha-KOs einen Partei-
// Treffer (Partei ist oeffentlich, gemeinsam). Die TRENNUNG kommt aus Ausschuss/Thema:
check("Three: Ausschuss-Treffer am EIGENEN Digitales-KO", feat("test-politician-three", "ko-digitales", "ausschuss"));
check("Three: KEIN Ausschuss-Treffer am Arbeit-KO von one", !feat("test-politician-three", "ko-arbeit", "ausschuss"));
check("One: Ausschuss-Treffer am EIGENEN Arbeit-KO", feat("test-politician-one", "ko-arbeit", "ausschuss"));
check("One: KEIN Ausschuss-Treffer am Digitales-KO von three", !feat("test-politician-one", "ko-digitales", "ausschuss"));

// ===========================================================================
// 3) EIGENE LAGE-INHALTE + QUELLENBELEGE
// ===========================================================================
section("3) Eigene Lage-Inhalte + Quellenbelege");
const lageTopByProfile = {};
for (const p of ALL) {
  const ranked = rankByProfile[p.id].map((r) => KOS.find((k) => k.id === r.knowledge_object_id)).filter(Boolean);
  const cards = lage.selectLageVorgaenge(ranked.map((k) => lage.koToVorgangCard(k, DOCS_BY_VG[k.vorgang_id])));
  const top = cards[0];
  lageTopByProfile[p.id] = top;
  const expectedVg = "vg-" + p.expectField.slice(3);
  check(`${p.fullName}: oberste Lage-Karte = eigenes Fachfeld`, top && top.vorgangId === expectedVg, top && top.vorgangId);
  check(`${p.fullName}: Lage-Karte traegt echte Quellen`, top && top.sourceCount >= 2 && top.sources.every((s) => /^https:\/\//.test(s.url)),
    top && JSON.stringify(top.sources.map((s) => s.host)));
  check(`${p.fullName}: Lage-Karte ist „modern" (Anzeigefelder belegt)`, top && lage.isModernVorgang(top));
}
// Verschiedene Profile -> verschiedene oberste Lage-Karten.
const lageTops = ALL.map((p) => lageTopByProfile[p.id].vorgangId);
check("Drei Profile -> drei verschiedene oberste Lage-Karten", new Set(lageTops).size === 3, JSON.stringify(lageTops));

// ===========================================================================
// 4) EIGENE RADAR-INHALTE (personen-/parteischarf)
// ===========================================================================
section("4) Eigene Radar-Inhalte (personen-/parteischarf)");
const radarByProfile = {};
for (const p of ALL) {
  const r = radar.buildRadarSignals(p, KOS, { now: Date.parse("2026-07-13T09:00:00Z") });
  radarByProfile[p.id] = r;
  const personKOs = r.buckets.mention.map((s) => s.knowledgeObjectId);
  const expectKO = p.expectField;
  check(`${p.fullName}: eigene Erwähnung erkannt (${expectKO})`, personKOs.includes(expectKO), JSON.stringify(personKOs));
}
// Kein Profil hat eine EIGENERWÄHNUNG am Person-KO eines anderen Mandats.
check("One: KEINE Eigenerwähnung am Person-KO von three", !radarByProfile["test-politician-one"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-digitales"));
check("Three: KEINE Eigenerwähnung am Person-KO von one", !radarByProfile["test-politician-three"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-arbeit"));
check("Two: KEINE Eigenerwähnung am Person-KO von one", !radarByProfile["test-politician-two"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-arbeit"));
// Gleiche Partei (one/three, Alpha): das fremde Alpha-KO darf als PARTEI-Signal
// erscheinen (Partei ist oeffentlich), aber NIE als Eigenerwähnung.
check("One (gleiche Partei): Digitales-KO nur als Partei-Signal, nicht als Eigenerwähnung",
  radarByProfile["test-politician-one"].signals.some((s) => s.knowledgeObjectId === "ko-digitales" && s.reason === "partei")
  && !radarByProfile["test-politician-one"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-digitales"));
// Two (Testpartei Beta) sieht das Digitales-KO (Alpha) GAR NICHT im Radar.
check("Two: Digitales-KO (Testpartei Alpha) erscheint NICHT im Radar", !radarByProfile["test-politician-two"].signals.some((s) => s.knowledgeObjectId === "ko-digitales"));
// Jedes Radar-Signal traegt eine Quelle (Beleg).
const allRadarSignals = ALL.flatMap((p) => radarByProfile[p.id].signals);
check("Jedes Radar-Signal traegt eine Quell-URL", allRadarSignals.length > 0 && allRadarSignals.every((s) => /^https:\/\//.test(s.url)));

// ===========================================================================
// 5) EIGENE HELMUT-EMPFEHLUNGEN (Decision Engine)
// ===========================================================================
section("5) Eigene Helmut-Empfehlungen (decideForUser)");
const decByProfile = {};
for (const p of ALL) {
  const decs = decisions.decideForUser(p, KOS, { userId: p.id });
  decByProfile[p.id] = decs;
  const top = decs.slice().sort((a, b) => b.score - a.score)[0];
  check(`${p.fullName}: Top-Empfehlung = eigenes Fachfeld (${p.expectField})`, top && top.knowledge_object_id === p.expectField, top && `${top.knowledge_object_id} (${top.score})`);
  check(`${p.fullName}: Top-Empfehlung ist „Sofort reagieren"`, top && top.decision === "Sofort reagieren", top && `${top.score}/${top.decision}`);
  check(`${p.fullName}: Entscheidungs-ID traegt die Mandanten-ID`, decs.every((d) => d.id.startsWith(`dec-${p.id}-`)));
}
// one vs. three (gleiche Partei): unterschiedliche Top-Empfehlung.
const oneTop = decByProfile["test-politician-one"].slice().sort((a, b) => b.score - a.score)[0];
const threeTop = decByProfile["test-politician-three"].slice().sort((a, b) => b.score - a.score)[0];
check("One-Top != Three-Top (trotz gleicher Partei)", oneTop.knowledge_object_id !== threeTop.knowledge_object_id, `${oneTop.knowledge_object_id} vs ${threeTop.knowledge_object_id}`);
// Three bewertet das fremde Arbeit-KO (falls vorhanden) UNTER dem eigenen.
const threeArbeit = decByProfile["test-politician-three"].find((d) => d.knowledge_object_id === "ko-arbeit");
check("Three: fremdes Arbeit-KO bewertet niedriger als eigenes Digitales-KO", !threeArbeit || threeArbeit.score < threeTop.score, threeArbeit && `${threeArbeit.score} vs ${threeTop.score}`);

// ===========================================================================
// 6) BUERO-VERHALTEN + CACHE-TRENNUNG (echte office.generateOfficeOutput)
// ===========================================================================
section("6) Büro-Verhalten + Cache-Trennung (generateOfficeOutput)");
// In-Memory-Mock-Store: keine DB. officeOutputId ist die ECHTE Schluesselfunktion.
const officeStore = new Map();
const aiCalls = [];
const mockStorage = {
  officeOutputId: (u, v, c) => storage.officeOutputId(u, v, c),
  getOfficeOutput: async (u, v, c) => officeStore.get(storage.officeOutputId(u, v, c)) || null,
  canSpendOfficeOutput: async () => ({ allowed: true, used: 0, limit: 10, remaining: 10 }),
  saveOfficeOutput: async (entry) => { officeStore.set(entry.id, entry); return { saved: true, id: entry.id }; }
};
const mockAi = {
  requestText: async (_prompt, meta) => { aiCalls.push(meta); return `Entwurf (${meta.vorgangId}): Pressemitteilung zum Vorgang.`; },
  activeModelName: () => "test-model"
};
const deps = { storage: mockStorage, ai: mockAi, template };

(async () => {
  const koDigital = KOS.find((k) => k.id === "ko-digitales");
  // three generiert einen Buero-Entwurf (Pressemitteilung) zu seinem Fachvorgang.
  const g1 = await office.generateOfficeOutput("test-politician-three", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("Three: Büro-Entwurf generiert", g1.status === "generated" && /Pressemitteilung/.test(g1.content), g1.reason || g1.status);
  // Zweiter Aufruf, gleicher Mandant/Vorgang/Kanal -> Cache-Hit (KEIN zweiter KI-Call).
  const g2 = await office.generateOfficeOutput("test-politician-three", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("Three: zweiter Aufruf = Cache-Hit (kein neuer KI-Call)", g2.status === "cache-hit", g2.status);
  // one generiert zum GLEICHEN Vorgang/Kanal -> eigener Cache-Namespace, eigener Entwurf.
  const g3 = await office.generateOfficeOutput("test-politician-one", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("One: eigener Büro-Entwurf trotz gleichem Vorgang/Kanal (Cache getrennt)", g3.status === "generated", g3.status);
  // Cache-Schluessel tragen die Mandanten-ID und kollidieren nicht.
  const kThree = storage.officeOutputId("test-politician-three", "vg-digitales", "pressemitteilung");
  const kOne = storage.officeOutputId("test-politician-one", "vg-digitales", "pressemitteilung");
  check("Büro-Cache-Key trägt Mandanten-ID (three)", kThree.includes("test-politician-three"));
  check("Büro-Cache-Key one != three (keine Kollision)", kThree !== kOne && !kOne.includes("test-politician-three"));
  check("Genau zwei KI-Calls (three einmal, one einmal — Cache-Hit spart den dritten)", aiCalls.length === 2, `calls=${aiCalls.length}`);
  // DSGVO-Check: KI-Meta traegt nur callType + vorgangId, KEINE userId.
  check("Büro-KI-Meta enthält KEINE userId (DSGVO)", aiCalls.every((m) => !("userId" in m) && m.vorgangId && m.callType === "office-output"));

  runBudgetAndIsolationChecks();
})();

// ===========================================================================
// 7) KOSTENLIMIT (per-Mandant-Budget)  +  8) KEINE FREMDINHALTE
// ===========================================================================
function runBudgetAndIsolationChecks() {
  section("7) Kostenlimit (per-Mandant-KI-Budget)");
  // Tagesbudget 5,00 € (500 Cent). Innerhalb -> erlaubt; ueber -> harter Stopp.
  const within = evaluateTenantBudget({ dailyBudgetCent: 500, monthlyBudgetCent: 10000, spentTodayUsd: 1.0, spentMonthUsd: 5.0 });
  check("Innerhalb Budget -> erlaubt", within.allowed && !within.warn, JSON.stringify(within));
  const warn = evaluateTenantBudget({ dailyBudgetCent: 500, monthlyBudgetCent: 10000, spentTodayUsd: 4.2, spentMonthUsd: 5.0 });
  check("Ab 80 % -> Warnung (aber noch erlaubt)", warn.allowed && warn.warn, JSON.stringify(warn));
  const stop = evaluateTenantBudget({ dailyBudgetCent: 500, monthlyBudgetCent: 10000, spentTodayUsd: 5.5, spentMonthUsd: 5.5 });
  check("Über Tagesbudget -> harter Stopp", !stop.allowed && stop.reason === "tenant-daily-budget-reached", JSON.stringify(stop));
  const unknown = evaluateTenantBudget({ dailyBudgetCent: 500, spentTodayUsd: null });
  check("Kostenstatus unbekannt -> fail-closed (Stopp)", !unknown.allowed && unknown.reason === "tenant-budget-status-unknown-fail-closed", JSON.stringify(unknown));
  const noCap = evaluateTenantBudget({ dailyBudgetCent: null, monthlyBudgetCent: null, spentTodayUsd: 99 });
  check("Ohne per-Mandant-Budget -> Deckel inert (globaler Deckel greift separat)", noCap.allowed && noCap.applied === false);
  // Jedes der drei Testprofile hat ein eigenes, getrenntes Budget hinterlegt.
  for (const p of ALL) {
    check(`${p.fullName}: eigenes KI-Budget gesetzt (Tag/Monat)`, p.aiBudgetDailyCents > 0 && p.aiBudgetMonthlyCents > 0);
  }

  section("8) KEIN Profil erhaelt die Inhalte eines ANDEREN Mandats als Top");
  // Es gibt kein bevorzugtes Pilotprofil mehr: fuer JEDES Paar (p, q) gilt —
  // p bekommt NIE q's Fachvorgang als oberste Karte/Top-Empfehlung und NIE
  // q's Person-KO als Eigenerwähnung.
  for (const p of ALL) {
    for (const q of ALL) {
      if (q.id === p.id) continue;
      const qVg = "vg-" + q.expectField.slice(3);
      check(`${p.fullName}: oberste Lage-Karte ist NICHT das Fachfeld von ${q.fullName}`, lageTopByProfile[p.id].vorgangId !== qVg);
      const top = decByProfile[p.id].slice().sort((a, b) => b.score - a.score)[0];
      check(`${p.fullName}: Top-Empfehlung ist NICHT das Fach-KO von ${q.fullName}`, top.knowledge_object_id !== q.expectField);
      check(`${p.fullName}: keine Eigenerwähnung am Person-KO von ${q.fullName}`, !radarByProfile[p.id].buckets.mention.some((s) => s.knowledgeObjectId === q.expectField));
    }
  }

  section("9) KEINE erfundenen Inhalte");
  // Ein leeres Profil bekommt in ALLEN Flaechen nichts (kein geratener Treffer).
  const emptyProfile = { id: "test-leer", profileActive: true };
  const emptyMatch = matching.matchProfileToKnowledgeObjects(emptyProfile, KOS, { limit: 8 }).filter((r) => r.matched_features.length);
  check("Leeres Profil: keine Identitäts-Treffer im Matching", emptyMatch.length === 0, JSON.stringify(emptyMatch.map((r) => r.knowledge_object_id)));
  const emptyRadar = radar.buildRadarSignals(emptyProfile, KOS, { now: Date.parse("2026-07-13T09:00:00Z") });
  check("Leeres Profil: keine Radar-Signale (personenscharf, kein Name/Partei)", emptyRadar.signals.length === 0);
  const emptyDec = decisions.decideForUser(emptyProfile, KOS, { userId: "test-leer" });
  const emptyActions = emptyDec.filter((d) => d.decision === "Sofort reagieren");
  check("Leeres Profil: keine Sofort-reagieren-Empfehlung ohne Merkmal", emptyActions.length === 0, JSON.stringify(emptyActions.map((d) => d.knowledge_object_id)));
  // Alles, was ausgespielt wird, hat eine echte Quelle (kein quellenloser Inhalt).
  const everyLageCardHasSource = ALL.every((p) => lageTopByProfile[p.id].sourceCount > 0);
  check("Jede oberste Lage-Karte hat mindestens eine echte Quelle", everyLageCardHasSource);

  section("10) KEINE Production-Gefahr (rein in-memory)");
  check("Kein Netz/DB: v3-Store im Testprozess NICHT bereit (kein SUPABASE-Kontext)", storage.v3StoreReady() === false);
  check("Büro-Store war ein In-Memory-Mock (kein echter DB-Write)", officeStore.size >= 1 && officeStore.size <= 2);

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Drei-Profile-E2E-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
}
