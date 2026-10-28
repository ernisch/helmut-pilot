"use strict";

// Reviewed, static local mock data only. No model review, current news claim,
// Production approval, source mutation, authority or provider installation.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const SCOPE = "MANUALLY_SOURCE_REVIEWED_STATIC_MOCK_NOT_MODEL_OUTPUT_OR_PRODUCTION_APPROVAL";
const SOURCE = Object.freeze({
  sourceURL: "https://www.bundestag.de/presse/hib/kurzmeldungen-1225362",
  title: "Grüne wollen Wohnungs- und Obdachlosigkeit überwinden",
  publicationDay: "2026-10-16",
  publicationPrecision: "day",
  htmlSHA256: "c6938aebddb2e5c2203b6c5892802010ae78cc46e6d1cf76554995136f2c12ca",
  excerptSHA256: "2ee4ba234eae1fcd52abb8f650f9e1c137b45a358363a3922573f130a7430050",
  excerptCharacters: 1177
});
const TEXTS = Object.freeze([
  "Die Fraktion Bündnis 90/Die Grünen fordert die Bundesregierung zu einer aktiven sozialen Wohnungsbaupolitik auf. Vorhandene Möglichkeiten im Bestand sollen genutzt werden, etwa die Umwandlung von Büros in Wohnungen.",
  "Nach Darstellung der Fraktion wird der Neubau durch langwierige Genehmigungsverfahren verzögert. Auch die Genehmigung von seriellem und modularem Bauen gestalte sich langwierig."
]);
function sameSourceURL(value) {
  return value === SOURCE.sourceURL || value === SOURCE.sourceURL.replace("www.", "");
}

function createVariant6({ profile, context, sourceEvidence }) {
  assert(profile?.synthetisch === true && /^test-kohorte-synthetik-bt-\d{3}$/.test(profile.id),
    "w15-current-mock-only-original-synthetic-BT-profile");
  assert(Array.isArray(context), "w15-current-mock-real-context-required");
  assert(sourceEvidence && typeof sourceEvidence === "object", "w15-current-mock-source-evidence-required");
  for (const key of ["sourceURL", "title", "publicationDay", "publicationPrecision", "htmlSHA256", "excerptSHA256"])
    assert.equal(sourceEvidence[key], SOURCE[key], "w15-current-mock-pinned-source-" + key);
  assert.equal(sourceEvidence.publicationTimestamp, null, "w15-current-mock-no-invented-publication-time");
  assert.equal(typeof sourceEvidence.excerpt, "string", "w15-current-mock-original-excerpt-required");
  assert.equal(sourceEvidence.excerpt.length, SOURCE.excerptCharacters, "w15-current-mock-full-excerpt-length");
  assert.equal(sha(sourceEvidence.excerpt), SOURCE.excerptSHA256, "w15-current-mock-full-excerpt-sha");
  const matches = context.flatMap(v => (v.quellenbelege || [])
    .filter(q => sameSourceURL(q.url)).map(q => ({ v, q })));
  assert.equal(matches.length, 1, "w15-current-mock-exactly-one-current-source");
  const { v, q } = matches[0];
  assert(!v.historischerKontext, "w15-current-mock-no-historical-fallback");
  assert.equal(q.titel, SOURCE.title, "w15-current-mock-source-title");
  assert.equal(q.auszug, sourceEvidence.excerpt, "w15-current-mock-source-exact-excerpt");
  // The source supplies a day, never a publisher clock time. The unchanged
  // date-only parser normalizes that supplied day to ISO midnight for context.
  assert([SOURCE.publicationDay, SOURCE.publicationDay + "T00:00:00.000Z"].includes(q.veroeffentlichtAm),
    "w15-current-mock-source-day-normalization");
  assert.match(q.quelle_id, /^q-[a-f0-9]{20}$/, "w15-current-mock-real-quelle-id");
  assert.equal(typeof v.vorgang_id, "string"); assert(v.vorgang_id.length > 0);
  const bezug = { feld: "schwerpunkt", wert: "Wohnungsbau" };
  assert.equal(require("../../lib/helmut/lage-textqualitaet").mandatsbezugGueltig(bezug, profile), true,
    "w15-current-mock-existing-Wohnungsbau-mandate-required");
  const explanations = [
    "Wohnungsbau: Die Forderung nach sozialem Wohnungsbau und der Umwandlung vorhandener Büros betrifft den bestehenden Schwerpunkt unmittelbar.",
    "Wohnungsbau: Die der Fraktion zugeschriebene Verzögerung von Neubau und seriellen oder modularen Bauvorhaben betrifft den bestehenden Schwerpunkt unmittelbar."
  ];
  const draftCandidate = { paragraphs: TEXTS.map((text, index) => ({
    vorgang_ids: [v.vorgang_id], quelle_id: q.quelle_id,
    auswahlbegruendung: explanations[index], mandatsbezug: { ...bezug }, text
  })) };
  // These are explicit manual mock judgements of the two source passages,
  // not inherited PDF judgements and not a claim that a reviewer model ran.
  const response = { pruefungen: [
    {
      absatz: 0, quelle_id: q.quelle_id, belegfeld: "auszug",
      pruefbegruendung: "Der Auszug fordert aktive soziale Wohnungsbaupolitik und nennt die Umwandlung von Büros in Wohnungen als Bestandsnutzung.",
      vollstaendig_belegt: true, themenrein: true,
      mandatsbegruendung: "Wohnungsbau: Die Fraktionsforderung betrifft sozialen Neubau und vorhandenen Wohnraum als konkrete Instrumente dieses Schwerpunkts.",
      profilbezug: true, textart: "konkreter_sachverhalt"
    },
    {
      absatz: 1, quelle_id: q.quelle_id, belegfeld: "auszug",
      pruefbegruendung: "Der Auszug schreibt der Fraktion Verzögerungen des Neubaus und langwierige Genehmigungen seriellen und modularen Bauens zu.",
      vollstaendig_belegt: true, themenrein: true,
      mandatsbegruendung: "Wohnungsbau: Die ausdrücklich zugeschriebene Diagnose der Genehmigungshürden betrifft Neubau sowie serielles und modulares Bauen.",
      profilbezug: true, textart: "konkreter_sachverhalt"
    }
  ], vergleiche: [{
    erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Die politische Forderung nach sozialem Neubau und Bestandsnutzung unterscheidet sich von der zugeschriebenen Diagnose konkreter Genehmigungshürden."
  }] };
  return {
    candidate: { draftCandidate },
    template: { response, binding: { responseJSONSHA256: sha(JSON.stringify(response)) } },
    report: { scope: SCOPE, owner: profile.id, originalVariantIndex: 6,
      source: { ...SOURCE }, vorgangId: v.vorgang_id, quelleId: q.quelle_id,
      reviewedBy: "SOURCE_BASED_MANUAL_FIXTURE_REVIEW_PENDING_INDEPENDENT_REVIEW",
      sourceJudgement: "Party demands and attributed analysis only; no enacted policy or independent government finding.",
      oldPDFClaimsRetained: false, oldPDFReviewTransferred: false,
      originalReceivedFilesChanged: false, sourceDatesChanged: false,
      actualModelOutput: false, paidReviewPerformed: false,
      currentProfessionalAcceptance: false, productionApproval: false,
      executionRightsIssued: false,
      unchangedAIAndQValidationStillRequired: true }
  };
}

const BERLIN_SOURCE = Object.freeze({
  sourceURL: "https://www.berlin.de/sen/finanzen/presse/pressemitteilungen/pressemitteilung.1730442.php",
  title: "Steuerschätzung Oktober 2026: Erste wirtschaftliche Erholung führt zu geringen Mehreinnahmen für das Land Berlin. Konsolidierungsbedarf bleibt gewaltig.",
  publicationDay: "2026-10-23",
  publicationPrecision: "minute",
  representedMinuteStartUTC: "2026-10-23T10:52:00.000Z",
  htmlSHA256: "717c311350b734ae503946cb238d531f7d0c66a77e4bc2b037635fb8f1b24e3d",
  excerptSHA256: "196faa76f4a11db1853bd1636c8b8a2d38d9551c4f287cae55d3ddbd479b8a10",
  excerptCharacters: 1139
});
const BERLIN_TEXTS = Object.freeze([
  "Nach Angaben der Senatsverwaltung für Finanzen werden für Berlin nach der regionalisierten Steuerschätzung rund 31,3 Milliarden Euro Steuereinnahmen im Jahr 2026 und rund 32,4 Milliarden Euro im Jahr 2027 erwartet.",
  "Die Senatsverwaltung verweist auf erhebliche Unsicherheiten für die weitere wirtschaftliche Entwicklung aufgrund der geopolitischen Situation und der weiteren Entwicklung der Energiepreise."
]);

function createVariant4({ profile, context, sourceEvidence }) {
  assert(profile?.synthetisch === true && /^test-kohorte-synthetik-be-\d{3}$/.test(profile.id),
    "w15-current-mock-only-original-synthetic-BE-profile");
  assert(Array.isArray(context), "w15-current-mock-real-context-required");
  assert(sourceEvidence && typeof sourceEvidence === "object", "w15-current-mock-BE-source-evidence-required");
  assert.equal(sourceEvidence.originalHTMLSHA256, BERLIN_SOURCE.htmlSHA256, "w15-current-mock-BE-html-pin");
  assert.equal(sourceEvidence.publicationday, BERLIN_SOURCE.publicationDay, "w15-current-mock-BE-publication-day");
  assert.equal(sourceEvidence.publicationPrecision, BERLIN_SOURCE.publicationPrecision,
    "w15-current-mock-BE-minute-precision");
  assert.equal(sourceEvidence.excerptHash, BERLIN_SOURCE.excerptSHA256, "w15-current-mock-BE-excerpt-pin");
  assert.equal(typeof sourceEvidence.excerpt, "string", "w15-current-mock-BE-excerpt-required");
  assert.equal(sourceEvidence.excerpt.length, BERLIN_SOURCE.excerptCharacters, "w15-current-mock-BE-excerpt-length");
  assert.equal(sha(sourceEvidence.excerpt), BERLIN_SOURCE.excerptSHA256, "w15-current-mock-BE-full-excerpt-sha");
  const document = sourceEvidence.document, publication = sourceEvidence.sourceproof?.publication;
  assert.equal(document?.url, BERLIN_SOURCE.sourceURL, "w15-current-mock-BE-source-url");
  assert.equal(document.title, BERLIN_SOURCE.title, "w15-current-mock-BE-source-title");
  assert.equal(document.source_name, "Senatsverwaltung für Finanzen", "w15-current-mock-BE-publisher");
  assert.equal(document.summary, sourceEvidence.excerpt, "w15-current-mock-BE-original-summary");
  assert.equal(document.published_at, BERLIN_SOURCE.representedMinuteStartUTC,
    "w15-current-mock-BE-original-minute");
  assert.equal(publication?.indexVisibleDateTime, "23.10.2026 12:52 Uhr",
    "w15-current-mock-BE-official-index-minute");
  assert.equal(publication.representedMinuteStartUTC, BERLIN_SOURCE.representedMinuteStartUTC);
  assert.equal(publication.secondsIndividuallyEvidenced, false, "w15-current-mock-BE-no-second-precision-claim");
  const matches = context.flatMap(v => (v.quellenbelege || [])
    .filter(q => q.url === BERLIN_SOURCE.sourceURL || q.url === BERLIN_SOURCE.sourceURL.replace("www.", ""))
    .map(q => ({ v, q })));
  assert.equal(matches.length, 1, "w15-current-mock-BE-exactly-one-current-source");
  const { v, q } = matches[0];
  assert(!v.historischerKontext, "w15-current-mock-BE-no-historical-fallback");
  assert.equal(q.titel, BERLIN_SOURCE.title, "w15-current-mock-BE-context-title");
  assert.equal(q.quelle, document.source_name, "w15-current-mock-BE-context-publisher");
  // The unchanged Lage source constructor collapses whitespace. The complete
  // original three-paragraph selection is still pinned above, without edits.
  assert.equal(q.auszug, sourceEvidence.excerpt.replace(/\s+/g, " ").trim(),
    "w15-current-mock-BE-context-complete-excerpt");
  assert.equal(q.veroeffentlichtAm, BERLIN_SOURCE.representedMinuteStartUTC,
    "w15-current-mock-BE-context-minute");
  assert.match(q.quelle_id, /^q-[a-f0-9]{20}$/, "w15-current-mock-BE-real-quelle-id");
  assert.equal(typeof v.vorgang_id, "string"); assert(v.vorgang_id.length > 0);
  const bezug = { feld: "bundesland", wert: "Berlin" };
  assert.equal(require("../../lib/helmut/lage-textqualitaet").mandatsbezugGueltig(bezug, profile), true,
    "w15-current-mock-existing-Berlin-mandate-required");
  const reasons = [
    "Berlin: Die Prognose der eigenen Landessteuereinnahmen betrifft die allgemeine Haushaltskontrolle des Abgeordnetenhausmandats, ohne eine Ausschussmitgliedschaft zu behaupten.",
    "Berlin: Die ausdrücklich genannten Unsicherheiten der Finanzprognose betreffen die allgemeine Haushaltskontrolle des Abgeordnetenhausmandats, ohne eine Ausschussrolle zu behaupten."
  ];
  const draftCandidate = { paragraphs: BERLIN_TEXTS.map((text, index) => ({
    vorgang_ids: [v.vorgang_id], quelle_id: q.quelle_id,
    auswahlbegruendung: reasons[index], mandatsbezug: { ...bezug }, text
  })) };
  const response = { pruefungen: [
    {
      absatz: 0, quelle_id: q.quelle_id, belegfeld: "auszug",
      pruefbegruendung: "Der erste Quellenabsatz prognostiziert rund 31,3 Milliarden Euro Steuereinnahmen für 2026 und rund 32,4 Milliarden Euro für 2027; kein Ist-Ergebnis.",
      vollstaendig_belegt: true, themenrein: true,
      mandatsbegruendung: "Berlin: Die Einnahmeprognose des eigenen Landeshaushalts betrifft die allgemeine parlamentarische Haushaltskontrolle.",
      profilbezug: true, textart: "konkreter_sachverhalt"
    },
    {
      absatz: 1, quelle_id: q.quelle_id, belegfeld: "auszug",
      pruefbegruendung: "Der dritte Quellenabsatz nennt erhebliche Unsicherheiten der wirtschaftlichen Entwicklung wegen der geopolitischen Situation und der Energiepreise.",
      vollstaendig_belegt: true, themenrein: true,
      mandatsbegruendung: "Berlin: Die Unsicherheiten der Landesfinanzprognose betreffen die parlamentarische Kontrolle des eigenen Haushalts, ohne eine Ausschussrolle.",
      profilbezug: true, textart: "konkreter_sachverhalt"
    }
  ], vergleiche: [{
    erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Die bezifferten Jahresprognosen und die ausdrücklich benannten wirtschaftlichen Unsicherheitsfaktoren sind unterschiedliche Sachinformationen."
  }] };
  return {
    candidate: { draftCandidate },
    template: { response, binding: { responseJSONSHA256: sha(JSON.stringify(response)) } },
    report: { scope: SCOPE, owner: profile.id, originalVariantIndex: 4,
      source: { ...BERLIN_SOURCE }, vorgangId: v.vorgang_id, quelleId: q.quelle_id,
      reviewedBy: "SOURCE_BASED_MANUAL_FIXTURE_REVIEW_PENDING_INDEPENDENT_REVIEW",
      sourceJudgement: "Revenue forecast and explicitly attributed uncertainty only; no realized receipts, budget decision or committee membership claim.",
      publicationClockPrecision: "Official minute23Oct12:52 Europe/Berlin; timestamp denotes minute start, not an evidenced exact second.",
      oldRBBClaimsRetained: false, oldRBBReviewTransferred: false,
      originalReceivedFilesChanged: false, sourceDatesChanged: false,
      actualModelOutput: false, paidReviewPerformed: false,
      currentProfessionalAcceptance: false, productionApproval: false,
      executionRightsIssued: false, unchangedAIAndQValidationStillRequired: true }
  };
}

module.exports = { createVariant6, createVariant4, SOURCE, BERLIN_SOURCE };
