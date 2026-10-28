"use strict";

// Derived local test data, not a new application builder or security authority.
// Nothing runs on import. Source dates and the received originals are immutable.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const SCOPE = "NEW_MANUAL_SOURCE_BOUND_LOCAL_TEST_CURATION_NOT_NATIVE_U_OR_PRODUCTION";
const REVIEW_SHA = "69c34d2749ff83ff2406d4d7bbe54f68646cb91c27c453ff18883bc2c45ec175";
const REVIEW_PATH = "/workspace/shared/helmut-w15-current-source-update-20261028/MANUAL_SOURCE_REVIEW.SAFE.json";
const WINDOW_START = "2026-10-16T00:00:00.000Z";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : value && typeof value === "object" ? "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}"
    : JSON.stringify(value);
const hash = value => sha(canonical(value));
const iso = value => { const d = new Date(value); assert(Number.isFinite(d.getTime()), "w15-current-input-valid-time"); return d.toISOString(); };
function postgresTime(value) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  assert(m && Number.isFinite(Date.parse(value)), "w15-current-input-UTC-source-time");
  const fraction = (m[2] || "").replace(/0+$/, "");
  return m[1] + (fraction ? "." + fraction : "") + "+00:00";
}
const SPECS = Object.freeze({
  BE: Object.freeze({
    scope: "BE", parliament: "landtag-berlin", day: "2026-10-23",
    html: "717c311350b734ae503946cb238d531f7d0c66a77e4bc2b037635fb8f1b24e3d",
    excerpt: "196faa76f4a11db1853bd1636c8b8a2d38d9551c4f287cae55d3ddbd479b8a10",
    url: "https://www.berlin.de/sen/finanzen/presse/pressemitteilungen/pressemitteilung.1730442.php",
    publisher: "Senatsverwaltung für Finanzen",
    sourceTitle: "Steuerschätzung Oktober 2026: Erste wirtschaftliche Erholung führt zu geringen Mehreinnahmen für das Land Berlin. Konsolidierungsbedarf bleibt gewaltig.",
    vorgangId: "vg-w15-current-be-steuerschaetzung-20261023",
    oldVorgangId: "vg-fresh-reviewed-proposal-rbb-691117a4712de058",
    oldDocumentIds: ["rd-691117a4712de0582634fca3081d3ee6c2d6a65c3c4360086dd5caffbd44800d"],
    title: "Berliner Steuerschätzung: Prognose über Haushaltsansätzen",
    summary: "Die Senatsverwaltung erwartet für Berlin 2026 rund 31,3 und 2027 rund 32,4 Mrd. Euro Steuereinnahmen.",
    relevance: "Die Prognose betrifft den Berliner Landeshaushalt. Für das synthetische Berliner Mandat ist die allgemeine parlamentarische Haushaltskontrolle einschlägig; eine besondere Ausschusszuständigkeit wird nicht behauptet.",
    action: "Vorschlag: Die Steuerprognose mit den Haushaltsansätzen vergleichen und Prognosewerte von bereits erzielten Einnahmen unterscheiden.",
    communication: "Vorschlag: Die Angaben als Steuerschätzung vom 23.10.2026 datieren und die von der Quelle genannten wirtschaftlichen Unsicherheiten kenntlich machen.",
    quotes: [
      "Nach den regionalisierten Ergebnissen der Steuerschätzung vom Oktober 2026 wird für das Land Berlin mit Steuereinnahmen im Jahr 2026 von rund 31,3 Mrd. Euro gerechnet und im Jahr 2027 mit rund 32,4 Mrd. Euro.",
      "Die weitere wirtschaftliche Entwicklung unterliegt allerdings erheblichen Unsicherheiten in der geopolitischen Situation und darin, wie sich die Energiepreise in den nächsten Monaten tatsächlich entwickeln werden.",
      "Gegenüber dem Berliner Haushalt 2026/2027 bedeutet das eine positive Abweichung in Höhe von rund 263 Mio. Euro im Jahr 2026 und rund 320 Mio. Euro im Jahr 2027."
    ]
  }),
  BT: Object.freeze({
    scope: "BT", parliament: "bundestag", day: "2026-10-16",
    html: "c6938aebddb2e5c2203b6c5892802010ae78cc46e6d1cf76554995136f2c12ca",
    excerpt: "2ee4ba234eae1fcd52abb8f650f9e1c137b45a358363a3922573f130a7430050",
    url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1225362",
    publisher: "Deutscher Bundestag, Parlamentsnachrichten",
    sourceTitle: "Grüne wollen Wohnungs- und Obdachlosigkeit überwinden",
    vorgangId: "vg-w15-current-bt-wohnungslosigkeit-20261016",
    oldVorgangId: "vg-fresh-draft-bt-zwangsversteigerungen-43dc373a38e2eab4",
    oldDocumentIds: ["rd-43dc373a38e2eab48d11abe47a6861704be5723b10be42662ddd4a5557c28602", "rd-136b8729e92d06f92b97b9fdc9ec8aa87d02d12707e5423fe8e6249f528546d7"],
    title: "Grüne fordern Maßnahmen gegen Wohnungslosigkeit",
    summary: "Die Grünen fordern sozialen Wohnungsbau und Bestandsnutzung; Genehmigungshürden beschreiben sie als Problem.",
    relevance: "Die Forderungen betreffen Wohnungsbau und den Wohnungsbestand auf Bundesebene. Ein individueller Ausschussauftrag oder eine bereits beschlossene Rechtsänderung wird nicht behauptet.",
    action: "Vorschlag: Die Forderungen nach sozialem Wohnungsbau und Bestandsnutzung sowie die zugeschriebenen Genehmigungshürden intern nachvollziehen.",
    communication: "Vorschlag: Den Stand vom 16.10.2026 als Fraktionsforderung und zugeschriebene Problemdiagnose kennzeichnen, nicht als beschlossene Regierungspolitik.",
    quotes: [
      "Die Bundesregierung wird aufgefordert, den Zugang zu bezahlbarem und dauerhaftem Wohnraum für wohnungslose und von Wohnungslosigkeit bedrohte Menschen zu verbessern, indem sie eine aktive soziale Wohnungsbaupolitik betreiben und die vorhandenen Möglichkeiten im Bestand nutzen soll wie zum Beispiel die Umwandlungen von Büros in Wohnungen.",
      "So werde der Neubau durch langwierige Genehmigungsverfahren verzögert, heruntergekommene und verwahrloste Immobilien könnten nicht in angemessenen Wohnraum umgewandelt werden. Auch der Umbau leerer Büros müsse deutlich attraktiver gestaltet werden.",
      "„Der Wohnungsmarkt muss dringend durch die effektive Regulierung von Mieten wieder bezahlbarer werden, um gegen Wohnungslosigkeit vorgehen zu können“, schreibt die Fraktion Bündnis 90/Die Grünen."
    ]
  })
});

function sourceCase(scope, evidence, executionISO) {
  const spec = SPECS[scope]; assert(spec && evidence, "w15-current-input-pinned-evidence-required");
  const html = evidence.originalHTMLSHA256 || evidence.htmlSHA256;
  assert.equal(html, spec.html, "w15-current-input-original-html-pin");
  assert.equal(sha(evidence.excerpt), spec.excerpt, "w15-current-input-original-excerpt-pin");
  assert(evidence.excerpt.length <= 1400 && spec.quotes.every(q => evidence.excerpt.includes(q)), "w15-current-input-exact-reviewed-passages");
  const fields = require("../../lib/helmut/synthetik-500-w-inventar").SOURCE_VERSION_FIELDS;
  let document;
  if (scope === "BE") {
    assert.equal(evidence.publicationday, spec.day); assert.equal(evidence.publicationPrecision, "minute");
    assert.equal(evidence.sourceproof?.publication?.secondsIndividuallyEvidenced, false);
    document = structuredClone(evidence.document);
    assert.equal(Date.parse(document.published_at), Date.parse("2026-10-23T10:52:00.000Z"));
  } else {
    assert.equal(evidence.publicationDay, spec.day); assert.equal(evidence.publicationPrecision, "day");
    assert.equal(evidence.publicationTimestamp, null, "w15-current-input-no-invented-publisher-time");
    assert.equal(evidence.sourceURL, spec.url); assert.equal(evidence.publisher, spec.publisher);
    document = Object.fromEntries(fields.map(key => [key, null]));
    Object.assign(document, { id: "rd-" + spec.html, title: evidence.title, summary: evidence.excerpt,
      canonical_url: spec.url, url: spec.url, content_hash: spec.html, source_id: "bt-bundestag",
      source_name: spec.publisher, source_type: "institution", document_type: "Parlamentsnachricht", link_type: "article",
      published_at: spec.day + "T00:00:00.000Z", retrieved_at: evidence.fetchedAtUTC, created_at: executionISO });
  }
  assert.deepEqual(Object.keys(document).sort(), [...fields].sort(), "w15-current-input-source23-fields");
  assert.equal(document.id, "rd-" + spec.html); assert.equal(document.content_hash, spec.html);
  assert.equal(document.url, spec.url); assert.equal(document.canonical_url, spec.url);
  assert.equal(document.title, spec.sourceTitle); assert.equal(document.source_name, spec.publisher); assert.equal(document.summary, evidence.excerpt);
  for (const key of ["published_at", "retrieved_at", "created_at"]) document[key] = postgresTime(document[key]);
  for (const key of ["bundestag_abgerufen_at", "berlin_abgerufen_at", "brandenburg_abgerufen_at"]) document[key] = document.retrieved_at;
  for (const key of ["dip_quellfelder", "bundestag_artikelstand", "berlin_artikelstand", "brandenburg_artikelstand"])
    assert.equal(document[key], null, "w15-current-input-no-fabricated-article-stand");
  assert(Date.parse(document.published_at) <= Date.parse(executionISO)
    && Date.parse(document.published_at) >= Date.parse(executionISO) - 14 * 86400000, "w15-current-input-real14day-window");
  const koFields = require("../../lib/helmut/knowledge-object-version").VERSION_FIELDS;
  const knowledgeObject = Object.fromEntries(koFields.map(key => [key, null]));
  const arrays = ["parteien", "ausschuesse", "ministerien", "risiken", "chancen", "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees", "mentioned_ministries", "mentioned_locations", "mentioned_organizations", "policy_field", "tags", "action_items_struct", "related_levels", "affected_geographies", "mentioned_geographies", "decision_entities", "related_entities"];
  for (const key of arrays) knowledgeObject[key] = [];
  Object.assign(knowledgeObject, { id: spec.vorgangId.replace(/^vg-/, "ko-"), vorgang_id: spec.vorgangId, ko_version: 1,
    headline: spec.title, display_title: spec.title, was_ist_passiert: spec.summary, display_summary: spec.summary,
    warum_wichtig: spec.relevance, why_relevant: spec.relevance, handlungsempfehlung: spec.action, recommendation: spec.action,
    recommended_communication: spec.communication, action_items: [spec.action], source_document_count: 1,
    status: "ready", understanding_status: "complete", understanding_model: "local-curated-independent-source-review-NOT-native-U", understanding_tokens: 0,
    political_level: scope === "BE" ? "land" : "bund", decision_level: scope === "BE" ? "land" : "bund",
    best_source_url: spec.url, best_link_type: "direct", created_at: postgresTime(executionISO), updated_at: postgresTime(executionISO),
    zeitdruck: "", risk_of_no_action: "", opportunity_summary: "", risk_level: "unknown", opportunity_level: "unknown",
    recommended_communication_struct: { suggestedOutputs: [], communicationLine: spec.communication, recommendedFormat: "none", recommendedChannel: "internal" },
    classification_confidence: {}, verstehen_fencing: null });
  assert.deepEqual(Object.keys(knowledgeObject).sort(), [...koFields].sort(), "w15-current-input-ko60-fields");
  return { spec, document, knowledgeObject, publicationPrecision: scope === "BE" ? "minute" : "day",
    timeNormalization: scope === "BE" ? "Start of the published minute; individual seconds were not evidenced."
      : "ISO midnight is storage normalization of the evidenced16Oct calendar day, not a publisher clock time.",
    sourceEvidence: { reference: evidence.evidenceref || evidence.htmlPath, sha256: spec.html } };
}

function buildCurrentCase({ originalRow, current, executionISO, manualReviewEvidence, publicationCandidate }) {
  const { spec, document, knowledgeObject: ko } = current, profile = structuredClone(originalRow.profile);
  assert(profile.synthetisch === true && profile.parlament === spec.parliament, "w15-current-input-synthetic-original-profile");
  assert(new RegExp("^test-kohorte-synthetik-" + (spec.scope === "BE" ? "be" : "bt") + "-\\d{3}$").test(profile.id));
  assert(originalRow.briefingEingabe.briefing.items.some(i => i.vorgangId === spec.oldVorgangId), "w15-current-input-exact-predecessor-case");
  const A = require("../../lib/helmut/briefing-aussagenbindung"), F = require("../../lib/helmut/briefing-fachurteil");
  const Contract = require("../../lib/helmut/briefingContract"), Fresh = require("../../lib/helmut/briefing-frische");
  const eligibility = require("../../lib/helmut/publication-eligibility");
  eligibility.assertKnown(publicationCandidate);
  assert.equal(hash(publicationCandidate), hash(ko), "w15-current-input-publication-candidate-content-drift");
  const day = Fresh.berlinTagKey(new Date(executionISO)), sourcesByVorgang = { [spec.vorgangId]: [document] };
  // Explicit editorial Observe choice, not an invented model match/confidence.
  const decision = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, user_id: profile.id,
    score: 40, decision: "Beobachten", priority_type: "observe", matched_features: [], redaktionellerRang: 0 };
  const briefing = Contract.toBriefingContractV3({ profile, decisions: [decision], kosById: { [ko.id]: publicationCandidate },
    sourcesByVorgang, now: new Date(executionISO), briefingType: "daily", knowledgeObjects: [publicationCandidate],
    frischeFenster: { start: WINDOW_START } });
  briefing.publicationEligibilityPolicy = structuredClone(originalRow.briefingEingabe.briefing.publicationEligibilityPolicy);
  assert(briefing.available && briefing.currentHelmutState?.tagesAnlass, "w15-current-input-existing-B-constructor-day-cause");
  assert.equal(briefing.currentHelmutState.datenstandVonHeute, false, "w15-current-input-no-current-publication-label");
  // Remove the displayed clock for the genuinely day-only HIB source. The
  // underlying source timestamp remains the documented storage normalization.
  if (spec.scope === "BT") {
    const visit = value => { if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "zeitLabel" && typeof child === "string") value[key] = "16.10.2026 (nur Publikationstag belegt)";
        else if (child && typeof child === "object") visit(child);
      } };
    visit(briefing);
  }
  const result = { briefing, korrekturBasis: { kos: [ko], sourcesByVorgang } };
  result.eingabe = A.baueEingabe({ briefing, sourcesByVorgang, profile, userId: profile.id, day, kos: [ko], korrekturHash: null });
  const source = result.eingabe.quellen[0];
  assert.equal(result.eingabe.quellen.length, 1); assert.equal(source.documentId, document.id);
  const semantic = new Set([spec.title, spec.summary, spec.relevance, spec.action, spec.communication, document.title, document.summary,
    "Beobachten", "Relevant", "observe", "partial", "valid", "stale", "daily", "neu", "Neu seit dem letzten Briefing",
    WINDOW_START, "23.10.2026, 12:52", "16.10.2026 (nur Publikationstag belegt)"]);
  const first = profile.firstName || String(profile.fullName || "").split(" ")[0];
  const structural = new Set([first ? `Guten Tag, ${first}.` : "Guten Tag.", "0 Vorgang/Vorgänge mit akutem Handlungsbedarf, 1 insgesamt bewertet.",
    "In dieser Radaransicht werden derzeit keine zugeordneten Signale angezeigt.", "Im vorliegenden Datenbestand sind keine zugeordneten Signale für dein politisches Umfeld enthalten.",
    "In dieser Radaransicht werden derzeit keine direkten Erwähnungen angezeigt.", "Im vorliegenden Datenbestand sind keine direkten Erwähnungen enthalten.",
    `Für den heutigen Arbeitstag priorisiert: neue Quellen im aktuellen Briefingfenster. Quellenstand: ${spec.day}. Sachstand und Einordnung gehören in die Lage.`]);
  // Exact source-bound projections only; not an unconditional positive verdict
  // for unknown builder strings or arbitrary caller-supplied political text.
  const reviewed = result.eingabe.aussagen.map(a => {
    assert((a.art === "ausgabe" ? structural : semantic).has(a.text), "w15-current-input-unreviewed-semantic-value:" + a.pfad);
    const r = { pfad: a.pfad, text: a.text, sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
      begruendung: a.art === "ausgabe"
        ? "Neue manuelle lokale Testprüfung der exakt gebauten Ausgabe: ein redaktionell beobachteter Vorgang, keine Sonderzuständigkeit, belegtes Quellenalter und ausdrücklich lokales Fixture-Lesefenster ohne nativen Morgenreceipt."
        : "Neue manuelle lokale Testprüfung dieses erlaubten exakten Werts: Quelle und Originalabsätze gelesen; Prognose bzw. Fraktionsforderung als solche zugeordnet. Vorschläge bleiben interne Prüfhandlungen, keine behauptete Individualzuständigkeit oder beschlossene Politik." };
    if (a.art === "ausgabe") r.ausgabeBeleg = result.eingabe.darstellungsHash;
    else r.belege = spec.quotes.map(text => ({ vorgangId: spec.vorgangId, documentId: document.id, feld: "auszug", text }));
    return r;
  });
  const urteil = { version: 2, eingabeHash: result.eingabe.eingabeHash, ursprungHash: result.eingabe.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: reviewed,
    reviewTransfer: { scope: SCOPE, sourceReview: manualReviewEvidence, predecessorInputHash: originalRow.briefingEingabe.eingabe.eingabeHash,
      oldReviewTransferred: false, nativeUnderstandingAcceptance: false, productionAcceptance: false } };
  const reasons = {
    quellentiefe: "Der gepinnte amtliche Originaltext und die vollständigen gebundenen Absätze wurden für genau diese neue Quelle gelesen; der Titel allein trägt die Prüfung nicht.",
    rangfolge: "Genau ein belegter Vorgang wurde ausdrücklich redaktionell als Beobachten gesetzt; Score40 bezeichnet nur diese vorhandene lokale Vertragsschwelle, keine Modellkonfidenz oder akut behauptete Priorität.",
    mandatsbezug: spec.scope === "BE" ? "Die Steuerschätzung betrifft den Berliner Landeshaushalt und die allgemeine parlamentarische Haushaltskontrolle des unveränderten synthetischen BE-Mandats, keine besondere Ausschussrolle."
      : "Die ausdrücklich zugeschriebenen Forderungen und Genehmigungshürden betreffen den Wohnungsbau auf Bundesebene; eine bestimmte Ausschusszuständigkeit oder beschlossene Rechtsänderung wird nicht behauptet.",
    auslassungen: "Der explizite lokale Testumfang ist genau der neue quellengelesene Vorgang; alte RBB- bzw. Versteigerungsbehauptungen und ihre Urteile wurden nicht übernommen.",
    zeitbezug: "Die Publikation bleibt am belegten Originaltag. Das Lesefenster16Oct bis tatsächlicher Ausführung ist ausdrücklich ein lokales Fixturefenster, kein nativer Morgenreceipt; DatenstandVonHeute bleibt false und Lage14Tage unverändert.",
    vollstaendigkeit: "Alle aus dem unveränderten echten B-Konstruktor entstandenen Texte sind exakt in der begrenzten semantischen Allowlist abgedeckt; unbekannte Texte werden abgewiesen und alle Aussagenpfade gebunden.",
    bereichstrennung: "Briefing benennt interne Prüfung und Auswahl, Lage darf die belegten Fakten verdichten, Radar behauptet keine persönliche Resonanz; die separaten lokalen D/R-Mocks ersetzen keine fachliche Productionabnahme."
  };
  urteil.gesamtpruefung = { version: 2, umfang: F.umfang(result, urteil),
    kriterien: Object.fromEntries(F.KRITERIEN.map(k => [k, { bestanden: true, begruendung: reasons[k] }])),
    quellen: [{ vorgangId: spec.vorgangId, documentId: document.id, quellenHash: hash(source), kontextGetragen: true,
      begruendung: "Neue offen manuelle lokale Quellenprüfung: gepinnte amtliche HTML-Fassung und exakte vollständige Auszüge gelesen; die Aussagen bleiben der Quelle bzw. Fraktion zugeschrieben. Keine alte Root/DeepSeek-Bewertung oder native U-Quittung übernommen." }] };
  const row = { profile, briefingEingabe: { version: 1, ...result, urteil }, sources: structuredClone(originalRow.sources), briefingDatum: executionISO };
  assert.equal(hash(profile), hash(originalRow.profile), "w15-current-input-profile-mutation");
  return { row, report: { scope: SCOPE, newSourceId: document.id, newVorgangId: spec.vorgangId,
    sourceHTMLSHA256: spec.html, excerptSHA256: spec.excerpt, fixtureWindowStart: WINDOW_START,
    publicationPrecision: current.publicationPrecision, timeNormalization: current.timeNormalization,
    originalProfileHash: hash(profile), predecessorRowHash: hash(originalRow), newInputHash: result.eingabe.eingabeHash,
    sourceReview: manualReviewEvidence, oldReviewTransferred: false,
    reviewConstruction: "Explicit source-pinned semantic values only; unchanged A/F/B validators must subsequently decide, no substituted validator verdict.",
    currentProfessionalAcceptance: false, executionRightsIssued: false } };
}

function createBindings({ sourceEvidence, manualReviewEvidence, executionISO }) {
  assert.equal(iso(executionISO), executionISO, "w15-current-input-real-canonical-execution-time");
  assert(executionISO.slice(0, 10) >= "2026-10-28" && executionISO.slice(0, 10) <= "2026-10-31");
  assert.equal(manualReviewEvidence?.reference, REVIEW_PATH); assert.equal(manualReviewEvidence?.sha256, REVIEW_SHA);
  manualReviewEvidence = Object.freeze({ reference: REVIEW_PATH, sha256: REVIEW_SHA });
  const cases = Object.fromEntries(["BE", "BT"].map(scope => [scope, sourceCase(scope, sourceEvidence[scope], executionISO)]));
  const nativeReplacements = Object.values(cases).map(c => ({ scope: c.spec.scope, oldDocumentIds: [...c.spec.oldDocumentIds],
    oldVorgangId: c.spec.oldVorgangId, document: structuredClone(c.document), knowledgeObject: structuredClone(c.knowledgeObject),
    vorgangId: c.spec.vorgangId, koVersion: 1 }));
  let publicationCandidates = null;
  async function qualifyPublications(storage) {
    assert.equal(publicationCandidates, null, "w15-current-input-no-publication-retry");
    const genuineStorage = require("../../lib/helmut/storage");
    assert.equal(storage, genuineStorage, "w15-current-input-genuine-storage-required");
    const eligibility = require("../../lib/helmut/publication-eligibility"), policy = eligibility.current();
    assert(policy.hash, "w15-current-input-existing-publication-policy-required");
    const requested = Object.values(cases).map(c => c.knowledgeObject);
    const eligible = await eligibility.filterCandidates(storage, requested, policy);
    assert.deepEqual(eligible.map(k => k.id).sort(), requested.map(k => k.id).sort(),
      "w15-current-input-all-new-publication-candidates-required");
    assert(eligible.every(k => eligibility.known(k, policy)), "w15-current-input-genuine-publication-proof-required");
    publicationCandidates = new Map(eligible.map(k => [k.id, k]));
    return { status: "PASS_GENUINE_COMPLETE_PUBLICATION_IDENTITY_FILTER", policyHash: policy.hash,
      eligibleIds: eligible.map(k => k.id), requestOverride: false, proofSerialized: false,
      proofScope: "PROCESS_LOCAL_EXISTING_SYMBOL_AND_WEAKSET; NATIVE_TUPLES_STAY_PLAIN" };
  }
  function replaceInventory(sources) {
    const removedDocs = new Set(nativeReplacements.flatMap(r => r.oldDocumentIds)), removedKos = new Set(nativeReplacements.map(r => r.oldVorgangId));
    return { documents: [...sources.documents.filter(d => !removedDocs.has(d.id)), ...nativeReplacements.map(r => structuredClone(r.document))],
      knowledgeObjects: [...sources.knowledgeObjects.filter(k => !removedKos.has(k.vorgang_id)), ...nativeReplacements.map(r => structuredClone(r.knowledgeObject))] };
  }
  function deriveRow(originalRow) {
    const oldHash = hash(originalRow), ids = originalRow.briefingEingabe.briefing.items.map(i => i.vorgangId);
    const current = Object.values(cases).find(c => ids.includes(c.spec.oldVorgangId));
    if (current) assert(publicationCandidates, "w15-current-input-publication-filter-must-precede-constructor");
    const derived = current ? buildCurrentCase({ originalRow, current, executionISO, manualReviewEvidence,
      publicationCandidate: publicationCandidates.get(current.knowledgeObject.id) })
      : require("./w15-local-calendar").rebindOrdinaryRow(originalRow, executionISO);
    const intermediateRowHash = hash(derived.row), calendarHash = derived.report.derivedRowHash;
    const selectedCalendarPreserved = derived.report.sourceProfileAndReviewTextsPreserved;
    derived.row.sources = replaceInventory(originalRow.sources);
    assert.equal(derived.row.sources.documents.length, 6); assert.equal(derived.row.sources.knowledgeObjects.length, 6);
    assert.equal(hash(originalRow), oldHash, "w15-current-input-original-row-mutated");
    delete derived.report.derivedRowHash;
    delete derived.report.sourceProfileAndReviewTextsPreserved;
    Object.assign(derived.report, {
      scope: current ? SCOPE : "LOCAL_CALENDAR_SELECTED_BRIEFING_WITH_SHARED_CURRENT_SOURCE_INVENTORY",
      originalRowHash: oldHash,
      intermediateCalendarRowHash: current ? null : calendarHash,
      intermediateCurrentCaseRowHash: current ? intermediateRowHash : null,
      finalRowHash: hash(derived.row),
      sharedInventoryBeforeHash: hash(originalRow.sources), sharedInventoryAfterHash: hash(derived.row.sources),
      sharedInventoryChanged: true, oldDocumentCount: originalRow.sources.documents.length,
      newDocumentCount: derived.row.sources.documents.length, oldKnowledgeObjectCount: originalRow.sources.knowledgeObjects.length,
      newKnowledgeObjectCount: derived.row.sources.knowledgeObjects.length,
      selectedBriefingBindingReplaced: Boolean(current),
      onlyTwoSelectedBindingTypesReplaced: true,
      unchangedSelectedBriefingUsesCalendarOnly: !current,
      selectedBriefingSourceProfileReviewTextsPreserved: current ? false : selectedCalendarPreserved === true,
      calendarOnlyDoesNotDescribeSharedInventory: true,
      inventoryReplacements: nativeReplacements.map(r => ({ scope: r.scope, oldDocumentIds: [...r.oldDocumentIds],
        newDocumentId: r.document.id, oldVorgangId: r.oldVorgangId, newVorgangId: r.vorgangId,
        newDocumentHash: hash(r.document), newKnowledgeObjectHash: hash(r.knowledgeObject) })),
      changedPaths: require("./w15-local-calendar").describeChangedPaths(originalRow, derived.row)
    });
    return derived;
  }
  return { scope: SCOPE, nativeReplacements: structuredClone(nativeReplacements), deriveRow, qualifyPublications,
    caseFor(scope) { assert(cases[scope]); return structuredClone(cases[scope]); },
    note: "Root builds fresh native6doc/6KO/6cluster keys and a new truthful curated0U coverage witness with the existing generators. No old coverage evidence is reused." };
}
module.exports = Object.freeze({ createBindings, SCOPE });
