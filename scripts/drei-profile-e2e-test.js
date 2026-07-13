"use strict";

// Drei-Profile-End-to-End-Test (Mehrmandantenfaehigkeit — Zweitkunden-Beweis).
//
// Legt DREI politische Testprofile mit ECHTEN oeffentlichen Mandatsdaten an
// (Quelle: bundestag.de / abgeordnetenwatch.de, 21. Wahlperiode) und laesst sie
// durch die vier ECHTEN Produktflaechen laufen:
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
//   8) KEINE Inhalte von Cem (kein Profil bekommt Cems Fachfeld/Person als Top)
//   9) KEINE erfundenen Inhalte (leeres Profil bekommt nichts; alles hat Quelle)
//  10) KEINE Production-Gefahr (rein in-memory: KEIN Netz, KEINE DB, KEIN Secret)
//
// Reiner Offline-Lauf: keine echten storage-/ai-/Netz-Aufrufe. Die Buero-Flaeche
// wird mit injizierten Mock-Deps gefahren; alle anderen Flaechen laufen ueber die
// echten, reinen Engine-Funktionen. Aendert NICHTS an Production.

// Buero-Flag NUR fuer diesen Testprozess (kein Secret, kein Deploy): office.js
// liest isOfficeEnabled() aus process.env — hier lokal aktiviert.
process.env.HELMUT_V3_OFFICE = "1";

const { cemInceProfile } = require("../lib/helmut/config");
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
// DREI Testprofile — echte oeffentliche Mandatsdaten (21. Wahlperiode, 2025).
// Angelegt in derselben Form, die der Admin-Schnellstart (normalizeProfile)
// erzeugt: berufliche Pflichtfelder (Partei, Wahlkreis/Land, Ausschuss, Themen).
// Bewusst VERSCHIEDENE Parteien + Fachfelder; Achelwilm teilt Cems Partei
// (Die Linke), aber NICHT dessen Ausschuss/Region — das ist der schaerfste
// Mandantentrennungs-Beweis (gleiche Partei darf nicht gleiche Inhalte heissen).
// ---------------------------------------------------------------------------
const PROFILES = {
  abdi: {
    id: "test-sanae-abdi",
    fullName: "Sanae Abdi",
    party: "SPD",
    faction: "SPD",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    constituency: "Köln I",
    state: "Nordrhein-Westfalen",
    location: "Köln",
    committee: "Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung",
    focusTopics: ["Entwicklungspolitik", "Nachhaltige Lieferketten", "Wirtschaftliche Zusammenarbeit", "Globaler Süden"],
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-entwicklung"
  },
  abraham: {
    id: "test-knut-abraham",
    fullName: "Knut Abraham",
    party: "CDU/CSU",
    faction: "CDU/CSU",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    constituency: "Elbe-Elster – Oberspreewald-Lausitz II",
    state: "Brandenburg",
    location: "Senftenberg",
    committee: "Auswärtiger Ausschuss",
    committees: ["Auswärtiger Ausschuss", "Ausschuss für Menschenrechte und humanitäre Hilfe"],
    focusTopics: ["Außenpolitik", "Menschenrechte", "Deutsch-polnische Beziehungen", "Europa"],
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-auswaertiges"
  },
  achelwilm: {
    id: "test-doris-achelwilm",
    fullName: "Doris Achelwilm",
    party: "Die Linke",
    faction: "Die Linke",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    // Bremen: ueber Landesliste, kein Direktwahlkreis -> Bundesland deckt die Region.
    state: "Bremen",
    location: "Bremen",
    committee: "Ausschuss für Digitales und Staatsmodernisierung",
    focusTopics: ["Steuerpolitik", "Gleichstellung", "Medienpolitik", "Queerpolitik", "Digitalisierung"],
    profileActive: true,
    aiBudgetDailyCents: 500,
    aiBudgetMonthlyCents: 10000,
    expectField: "ko-digitales"
  }
};

// Cem als Referenz (der bestehende Pilot). Sein Fachfeld = Arbeit und Soziales.
const CEM = { ...cemInceProfile, expectField: "ko-arbeit" };

// ---------------------------------------------------------------------------
// Repraesentativer, mandantenloser KO-Korpus. Jeder Vorgang traegt echte
// oeffentliche Analysefelder + eine reale, vertrauenswuerdige Quelle (offizielle
// oder Leitmedien-Domain), damit der Source-Safety-Guard sie nicht quarantaeniert.
// KEIN kritischer/sensibler Claim-Wortschatz (sonst Quarantaene ohne Bestaetigung).
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
  // --- Abdi: Entwicklung / wirtschaftliche Zusammenarbeit (SPD) ---
  ko({
    id: "ko-entwicklung", vorgang_id: "vg-entwicklung",
    headline: "Lieferkettengesetz: Reform im Entwicklungsausschuss",
    display_title: "Lieferkettengesetz: Reform beraten",
    was_ist_passiert: "Der Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung berät die Reform des Lieferkettengesetzes.",
    display_summary: "Der Entwicklungsausschuss berät die Reform des Lieferkettengesetzes und die Zukunft nachhaltiger Lieferketten in der Textilindustrie.",
    warum_wichtig: "Betrifft nachhaltige Lieferketten und die Entwicklungspolitik unmittelbar.",
    why_relevant: "Betrifft die Entwicklungspolitik und nachhaltige Lieferketten direkt.",
    recommendation: "Position zur Lieferkettenreform vorbereiten.",
    handlungsempfehlung: "Position zur Lieferkettenreform vorbereiten.",
    display_category: "BMZ",
    parteien: ["SPD"], ausschuesse: ["Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung"],
    mentioned_parties: ["SPD"], mentioned_people: ["Abdi"], mentioned_locations: ["Köln"],
    tags: ["Entwicklungspolitik", "Nachhaltige Lieferketten"],
    risiken: ["Abschwächung der Sorgfaltspflichten"], chancen: ["Stärkung nachhaltiger Lieferketten"],
    best_source_url: "https://www.bundestag.de/ausschuesse/entwicklung"
  }),
  // --- Abraham: Auswaertiges / Menschenrechte (CDU/CSU) ---
  ko({
    id: "ko-auswaertiges", vorgang_id: "vg-auswaertiges", status: "neu",
    headline: "Auswärtiger Ausschuss berät Menschenrechtslage",
    display_title: "Menschenrechtslage im Auswärtigen Ausschuss",
    was_ist_passiert: "Der Auswärtige Ausschuss berät die deutsch-polnische Zusammenarbeit und die Menschenrechtslage in Osteuropa.",
    display_summary: "Der Auswärtige Ausschuss berät die deutsch-polnische Zusammenarbeit sowie die Menschenrechtslage in mehreren osteuropäischen Ländern.",
    warum_wichtig: "Betrifft die Außenpolitik und die Menschenrechtsarbeit des Bundestages.",
    why_relevant: "Betrifft die Außenpolitik und Menschenrechte direkt.",
    recommendation: "Redebeitrag zur Menschenrechtslage vorbereiten.",
    handlungsempfehlung: "Redebeitrag zur Menschenrechtslage vorbereiten.",
    display_category: "Auswärtiges Amt",
    parteien: ["CDU/CSU"], ausschuesse: ["Auswärtiger Ausschuss", "Ausschuss für Menschenrechte und humanitäre Hilfe"],
    mentioned_parties: ["CDU/CSU"], mentioned_people: ["Abraham"], mentioned_locations: ["Brandenburg"],
    tags: ["Außenpolitik", "Menschenrechte", "Europa"],
    risiken: ["Verschärfung der Lage in Osteuropa"], chancen: ["Stärkung der deutsch-polnischen Zusammenarbeit"],
    best_source_url: "https://www.auswaertiges-amt.de/de/aussenpolitik"
  }),
  // --- Achelwilm: Digitales / Steuerpolitik (Die Linke) ---
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
    parteien: ["Die Linke"], ausschuesse: ["Ausschuss für Digitales und Staatsmodernisierung"],
    mentioned_parties: ["Die Linke"], mentioned_people: ["Achelwilm"], mentioned_locations: ["Bremen"],
    tags: ["Steuerpolitik", "Digitalisierung"],
    risiken: ["Steuerausfälle bei Digitalkonzernen"], chancen: ["Gerechtere Besteuerung großer Plattformen"],
    best_source_url: "https://www.bundestag.de/ausschuesse/digitales"
  }),
  // --- Cem: Arbeit und Soziales (Die Linke) — der "darf NICHT lecken"-Vorgang ---
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
    parteien: ["Die Linke"], ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    mentioned_parties: ["Die Linke"], mentioned_people: ["Ince"], mentioned_locations: ["Salzgitter"],
    tags: ["Tarifbindung", "Mindestlohn"],
    risiken: ["Aufweichung der Tarifbindung"], chancen: ["Stärkung der Tariftreue"],
    best_source_url: "https://www.bmas.de/tariftreue"
  })
];

// Quellen je Vorgang (echte oeffentliche Belege: offiziell + Leitmedium).
const DOCS_BY_VG = {
  "vg-entwicklung": [
    { url: "https://www.bundestag.de/ausschuesse/entwicklung", source_name: "Deutscher Bundestag", source_type: "bundestag", published_at: "2026-07-13T07:30:00Z", title: "Entwicklungsausschuss" },
    { url: "https://www.tagesschau.de/inland/lieferkettengesetz", source_name: "tagesschau", source_type: "media", published_at: "2026-07-13T06:00:00Z", title: "Reform des Lieferkettengesetzes" }
  ],
  "vg-auswaertiges": [
    { url: "https://www.auswaertiges-amt.de/de/aussenpolitik", source_name: "Auswärtiges Amt", source_type: "ministry", published_at: "2026-07-13T07:15:00Z", title: "Menschenrechtslage" },
    { url: "https://www.zeit.de/politik/ausland/menschenrechte", source_name: "Zeit", source_type: "media", published_at: "2026-07-13T05:40:00Z", title: "Menschenrechte in Osteuropa" }
  ],
  "vg-digitales": [
    { url: "https://www.bundestag.de/ausschuesse/digitales", source_name: "Deutscher Bundestag", source_type: "bundestag", published_at: "2026-07-13T07:20:00Z", title: "Digitalausschuss" },
    { url: "https://www.spiegel.de/netzwelt/plattformbesteuerung", source_name: "Spiegel", source_type: "media", published_at: "2026-07-13T05:10:00Z", title: "Besteuerung von Digitalplattformen" }
  ],
  "vg-arbeit": [
    { url: "https://www.bmas.de/tariftreue", source_name: "BMAS", source_type: "ministry", published_at: "2026-07-13T07:00:00Z", title: "Bundestariftreuegesetz" },
    { url: "https://www.tagesschau.de/inland/tariftreue", source_name: "tagesschau", source_type: "media", published_at: "2026-07-13T06:30:00Z", title: "Tariftreuegesetz" }
  ]
};

const ALL = [PROFILES.abdi, PROFILES.abraham, PROFILES.achelwilm, CEM];

// ===========================================================================
// 1) PROFILANLAGE + PFLICHTFELDER
// ===========================================================================
section("1) Profilanlage im Admin + Pflichtfelder (validateProfile)");
for (const p of [PROFILES.abdi, PROFILES.abraham, PROFILES.achelwilm]) {
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
// Vier verschiedene Fachprofile -> vier verschiedene Top-Fachtreffer (Kunde A != B).
const tops = ALL.map((p) => (rankByProfile[p.id].filter((r) => r.matched_features.length)[0] || {}).knowledge_object_id);
check("Vier Profile -> vier UNTERSCHIEDLICHE Top-Fachtreffer", new Set(tops).size === 4, JSON.stringify(tops));

section("2b) Keine Cross-Contamination (fremde Partei/Ausschuss feuert nicht)");
function feat(profileId, koId, type) {
  const r = (rankByProfile[profileId] || []).find((x) => x.knowledge_object_id === koId);
  return (r && r.matched_features || []).some((f) => f.type === type);
}
// SPD-Profil (Abdi) bekommt an keinem Die-Linke/Union-KO einen Partei-Treffer.
check("Abdi (SPD): kein Partei-Treffer am Arbeit-KO (Die Linke)", !feat("test-sanae-abdi", "ko-arbeit", "partei"));
check("Abdi (SPD): kein Partei-Treffer am Auswärtiges-KO (Union)", !feat("test-sanae-abdi", "ko-auswaertiges", "partei"));
// Abraham (Union) bekommt keinen Ausschuss-Treffer am Digitales/Arbeit-KO.
check("Abraham (Union): kein Ausschuss-Treffer am Digitales-KO", !feat("test-knut-abraham", "ko-digitales", "ausschuss"));
check("Abraham (Union): kein Partei-Treffer am Digitales-KO (Die Linke)", !feat("test-knut-abraham", "ko-digitales", "partei"));

section("2c) Gleiche Partei, andere Zustaendigkeit (Achelwilm vs. Cem, beide Die Linke)");
// Beide sind Die Linke -> BEIDE bekommen an beiden Die-Linke-KOs einen Partei-Treffer
// (Partei ist oeffentlich, gemeinsam). Die TRENNUNG kommt aus Ausschuss/Thema:
check("Achelwilm: Ausschuss-Treffer am EIGENEN Digitales-KO", feat("test-doris-achelwilm", "ko-digitales", "ausschuss"));
check("Achelwilm: KEIN Ausschuss-Treffer an Cems Arbeit-KO", !feat("test-doris-achelwilm", "ko-arbeit", "ausschuss"));
check("Cem: Ausschuss-Treffer am EIGENEN Arbeit-KO", feat("cem-ince", "ko-arbeit", "ausschuss"));
check("Cem: KEIN Ausschuss-Treffer an Achelwilms Digitales-KO", !feat("cem-ince", "ko-digitales", "ausschuss"));

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
check("Vier Profile -> vier verschiedene oberste Lage-Karten", new Set(lageTops).size === 4, JSON.stringify(lageTops));

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
// Abdi (Name „Abdi") darf NICHT Cems Person-KO (Ince) als Eigenerwähnung haben.
check("Abdi: KEINE Eigenerwähnung an Cems Person-KO (Ince)", !radarByProfile["test-sanae-abdi"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-arbeit"));
check("Achelwilm: KEINE Eigenerwähnung an Cems Person-KO (Ince)", !radarByProfile["test-doris-achelwilm"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-arbeit"));
check("Cem: KEINE Eigenerwähnung an Abrahams Person-KO", !radarByProfile["cem-ince"].buckets.mention.some((s) => s.knowledgeObjectId === "ko-auswaertiges"));
// Abraham (Union) sieht das Digitales-KO (Die Linke) NICHT im Radar (keine Erwähnung seiner Partei/Person).
check("Abraham: Digitales-KO (Die Linke) erscheint NICHT im Radar", !radarByProfile["test-knut-abraham"].signals.some((s) => s.knowledgeObjectId === "ko-digitales"));
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
// Achelwilm vs. Cem (gleiche Partei): unterschiedliche Top-Empfehlung.
const achTop = decByProfile["test-doris-achelwilm"].slice().sort((a, b) => b.score - a.score)[0];
const cemTop = decByProfile["cem-ince"].slice().sort((a, b) => b.score - a.score)[0];
check("Achelwilm-Top != Cem-Top (trotz gleicher Partei)", achTop.knowledge_object_id !== cemTop.knowledge_object_id, `${achTop.knowledge_object_id} vs ${cemTop.knowledge_object_id}`);
// Achelwilms Cem-Fachfeld-Bewertung (falls vorhanden) liegt UNTER ihrer eigenen.
const achArbeit = decByProfile["test-doris-achelwilm"].find((d) => d.knowledge_object_id === "ko-arbeit");
check("Achelwilm: Cems Arbeit-KO bewertet niedriger als eigenes Digitales-KO", !achArbeit || achArbeit.score < achTop.score, achArbeit && `${achArbeit.score} vs ${achTop.score}`);

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
  // Achelwilm generiert einen Buero-Entwurf (Pressemitteilung) zu ihrem Fachvorgang.
  const g1 = await office.generateOfficeOutput("test-doris-achelwilm", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("Achelwilm: Büro-Entwurf generiert", g1.status === "generated" && /Pressemitteilung/.test(g1.content), g1.reason || g1.status);
  // Zweiter Aufruf, gleicher Mandant/Vorgang/Kanal -> Cache-Hit (KEIN zweiter KI-Call).
  const g2 = await office.generateOfficeOutput("test-doris-achelwilm", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("Achelwilm: zweiter Aufruf = Cache-Hit (kein neuer KI-Call)", g2.status === "cache-hit", g2.status);
  // Abdi generiert zum GLEICHEN Vorgang/Kanal -> eigener Cache-Namespace, eigener Entwurf.
  const g3 = await office.generateOfficeOutput("test-sanae-abdi", "vg-digitales", "pressemitteilung", koDigital, deps);
  check("Abdi: eigener Büro-Entwurf trotz gleichem Vorgang/Kanal (Cache getrennt)", g3.status === "generated", g3.status);
  // Cache-Schluessel tragen die Mandanten-ID und kollidieren nicht.
  const kAch = storage.officeOutputId("test-doris-achelwilm", "vg-digitales", "pressemitteilung");
  const kAbdi = storage.officeOutputId("test-sanae-abdi", "vg-digitales", "pressemitteilung");
  check("Büro-Cache-Key trägt Mandanten-ID (Achelwilm)", kAch.includes("test-doris-achelwilm"));
  check("Büro-Cache-Key Abdi != Achelwilm (keine Kollision)", kAch !== kAbdi && !kAbdi.includes("test-doris-achelwilm"));
  check("Genau zwei KI-Calls (Achelwilm einmal, Abdi einmal — Cache-Hit spart den dritten)", aiCalls.length === 2, `calls=${aiCalls.length}`);
  // DSGVO-Check: KI-Meta traegt nur callType + vorgangId, KEINE userId.
  check("Büro-KI-Meta enthält KEINE userId (DSGVO)", aiCalls.every((m) => !("userId" in m) && m.vorgangId && m.callType === "office-output"));

  runBudgetAndCemChecks();
})();

// ===========================================================================
// 7) KOSTENLIMIT (per-Mandant-Budget)  +  8) KEINE INHALTE VON CEM
// ===========================================================================
function runBudgetAndCemChecks() {
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
  for (const p of [PROFILES.abdi, PROFILES.abraham, PROFILES.achelwilm]) {
    check(`${p.fullName}: eigenes KI-Budget gesetzt (Tag/Monat)`, p.aiBudgetDailyCents > 0 && p.aiBudgetMonthlyCents > 0);
  }

  section("8) KEINE Inhalte von Cem bei den neuen Profilen");
  for (const p of [PROFILES.abdi, PROFILES.abraham, PROFILES.achelwilm]) {
    // Oberste Lage-Karte, Top-Empfehlung, Radar-Eigenerwähnungen: NIE Cems Arbeit-KO.
    check(`${p.fullName}: oberste Lage-Karte ist NICHT Cems Arbeit-Vorgang`, lageTopByProfile[p.id].vorgangId !== "vg-arbeit");
    const top = decByProfile[p.id].slice().sort((a, b) => b.score - a.score)[0];
    check(`${p.fullName}: Top-Empfehlung ist NICHT Cems Arbeit-KO`, top.knowledge_object_id !== "ko-arbeit");
    check(`${p.fullName}: keine Eigenerwähnung an Cems Person-KO`, !radarByProfile[p.id].buckets.mention.some((s) => s.knowledgeObjectId === "ko-arbeit"));
  }
  // Umgekehrt: Cems oberste Karte/Top-Empfehlung ist SEIN Arbeit-Vorgang (unveraendert).
  check("Cem behält sein eigenes Fachfeld (Arbeit) als Top — unverändert", lageTopByProfile["cem-ince"].vorgangId === "vg-arbeit");

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
