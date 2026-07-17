"use strict";

// Helmut V3 — REVIEW-FIXTURE (nur für PR-/Preview-/Lokal-Abnahme des Helmut-Tabs).
// =============================================================================
// Zweck: einen VOLLEN currentHelmutState sichtbar machen, wenn (noch) keine echten
// V3-Daten im Store liegen — damit der Helmut-Tab visuell abgenommen werden kann.
//
// STRENG GESCHÜTZT: wird AUSSCHLIESSLICH aktiv, wenn das Env-Flag
// HELMUT_REVIEW_FIXTURE gesetzt ist (Default AUS). In main/Produktion ist das Flag
// nicht gesetzt -> dieser Pfad ist komplett inert und der echte V3-Read-Pfad läuft
// unverändert. KEIN Produktions-Demo-Text, KEIN Frontend-Fallback.
//
// Inhalt: rein FIKTIV, keine reale Partei/Person (keine personenspezifische Logik, keine hartkodierte
// Partei — „Koalition"/„Arbeit & Soziales" sind neutrale Rollen-/Ausschuss-Labels),
// KEINE Kostenwerte. Die Daten laufen durch den ECHTEN Contract-Adapter
// (toBriefingContractV3), damit die Review-Ansicht exakt den Produktionspfad zeigt.

// Branch, dessen Vercel-VORSCHAU (nie Produktion) den Review-Stand automatisch zeigen
// darf — damit die PR-Preview ohne manuelles Env-Setzen prüfbar ist. Eng gefasst:
// wird NUR hier verwendet und trifft weder main noch andere Branches noch Produktion.
const REVIEW_PREVIEW_BRANCH = "claude/helmut-v3-foundation-pv2uw4";

// Aktiv, wenn:
//   (a) HELMUT_REVIEW_FIXTURE gesetzt ist (lokal/gezielt), ODER
//   (b) es die Vercel-VORSCHAU (VERCEL_ENV != "production") GENAU dieses PR-Branches ist.
// In Produktion (VERCEL_ENV="production") ist der Zweig IMMER inert — auch nach einem
// Merge, weil dann VERCEL_GIT_COMMIT_REF="main" ist. Kein Produktions-Demo, fail-safe.
function reviewFixtureEnabled() {
  if (["1", "true", "on", "yes"].includes(String(process.env.HELMUT_REVIEW_FIXTURE || "").trim().toLowerCase())) return true;
  const env = String(process.env.VERCEL_ENV || "").trim();
  const ref = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim();
  if (env && env !== "production" && ref === REVIEW_PREVIEW_BRANCH) return true;
  return false;
}

// Baut die Adapter-Eingaben mit now-relativen Zeitstempeln (frisch -> qualityStatus valid).
function buildReviewFixture(now = new Date()) {
  const iso = (msAgo) => new Date(now.getTime() - msAgo).toISOString();
  const MIN = 60 * 1000, H = 60 * MIN, D = 24 * H;

  const profile = { id: "review-mandat", fullName: "Anna Beispiel", firstName: "Anna", party: "Koalition", committee: "Arbeit & Soziales", focusTopics: ["Arbeitszeit"] };

  const koPrimary = {
    id: "ko-review-1", vorgang_id: "vg-review-1", status: "neu", understanding_status: "complete",
    display_title: "Gesetzentwurf zur Regelung von Arbeitszeit und Erreichbarkeit",
    headline: "Arbeitszeitgesetz", was_ist_passiert: "Der Entwurf wurde vorgelegt.",
    warum_wichtig: "Betrifft viele Beschäftigte und die Ausschussarbeit.",
    why_relevant: "Die Debatte gewinnt seit dem Morgen sichtbar an Dynamik. Für dein Mandat ist das Thema relevant, weil es sowohl den Wahlkreis als auch die Ausschussarbeit berührt.",
    recommendation: "Heute nicht öffentlich zuspitzen. Intern abstimmen. Linie vorbereiten. Ab Mittag beobachten.",
    handlungsempfehlung: "Intern abstimmen.",
    ausschuesse: ["Arbeit & Soziales"], policy_field: ["Gesetzgebung"], parteien: ["Koalition"], tags: ["Arbeitszeit"],
    ministerien: [], risiken: ["Uneinheitliche Aussagen"], chancen: ["Profilierung als lösungsorientierte Kraft"],
    mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
    mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [],
    zeitdruck: "hoch", confidence_score: 85, source_document_count: 18,
    risk_of_no_action: "Wenn bis heute Nachmittag keine gemeinsame Linie steht, steigt das Risiko uneinheitlicher Aussagen aus dem Büro. Das würde die Position im Ausschuss schwächen und Medienanfragen unnötig erschweren.",
    opportunity_summary: "Soziale Entlastung früh glaubwürdig besetzen. Wir können das Thema proaktiv gestalten und als lösungsorientierte Kraft wahrgenommen werden.",
    risk_level: "high", opportunity_level: "high",
    recommended_communication_struct: {
      communicationLine: "Wir beobachten die Entwicklung genau. Für uns ist entscheidend, dass Beschäftigte spürbar entlastet werden.",
      recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement", "qa"]
    },
    action_items_struct: [
      { title: "Bis 14:00 Linie intern mit Fraktion oder Team abstimmen", description: "Gemeinsame Sprachregelung festlegen.", dueHint: "bis 14:00", priority: "high", actionType: "alignInternally" },
      { title: "Kurzes Q&A für Presseanfragen vorbereiten", description: "", dueHint: "heute", priority: "medium", actionType: "prepareQA" },
      { title: "Monitoring von Medien und Social Media starten", description: "", dueHint: "", priority: "low", actionType: "monitor" }
    ],
    best_source_url: "https://www.bundestag.de/arbeitszeit", updated_at: iso(45 * MIN)
  };

  const koRelated = {
    id: "ko-review-2", vorgang_id: "vg-review-2", status: "neu", understanding_status: "complete",
    display_title: "Länder fordern mehr Fördermittel für Kommunen",
    headline: "Fördermittel", was_ist_passiert: "Ein Förderprogramm wurde angekündigt.",
    warum_wichtig: "Zusätzliche Mittel für Kommunen.", why_relevant: "Chance für deinen Wahlkreis.",
    ausschuesse: ["Kommunales"], policy_field: ["Finanzen"], parteien: [], tags: ["Förderung"],
    ministerien: [], risiken: [], chancen: ["Fördermittel für den Wahlkreis"],
    mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
    mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [],
    zeitdruck: "mittel", confidence_score: 70, source_document_count: 4, updated_at: iso(1 * D)
  };

  const kosById = { [koPrimary.id]: koPrimary, [koRelated.id]: koRelated };

  // Deterministische Entscheidungen (der Adapter formt daraus items + currentHelmutState).
  const decisions = [
    {
      id: "dec-review-1", user_id: profile.id, knowledge_object_id: koPrimary.id, vorgang_id: koPrimary.vorgang_id,
      score: 88, decision: "Sofort reagieren", priority_type: "risk",
      matched_features: [{ type: "ausschuss", value: "Arbeit & Soziales" }, { type: "thema", value: "Arbeitszeit" }],
      chance: "Profilierung als lösungsorientierte Kraft", risk: "Uneinheitliche Aussagen", deadline: null, status: "new"
    },
    {
      id: "dec-review-2", user_id: profile.id, knowledge_object_id: koRelated.id, vorgang_id: koRelated.vorgang_id,
      score: 62, decision: "Sofort reagieren", priority_type: "chance",
      matched_features: [{ type: "wahlkreis", value: "Kommunales" }],
      chance: "Fördermittel für den Wahlkreis", risk: "", deadline: null, status: "new"
    }
  ];

  // Echte Quellen-Zeilen (mit IDs + echten Zeitstempeln) -> sourceIds/sourcesSummary.lastUpdated.
  const sourcesByVorgang = {
    "vg-review-1": [
      { id: "rd-review-a", url: "https://www.bundestag.de/arbeitszeit", canonical_url: "https://www.bundestag.de/arbeitszeit", source_name: "Bundestag", source_type: "bundestag", link_type: "direct", confidence: "high", title: "Arbeitszeitgesetz: Entwurf vorgelegt", summary: "", published_at: iso(45 * MIN) },
      { id: "rd-review-b", url: "https://www.bmas.de/arbeitszeit", canonical_url: "https://www.bmas.de/arbeitszeit", source_name: "BMAS", source_type: "ministry", link_type: "direct", confidence: "high", title: "Ministerium zum Arbeitszeitgesetz", summary: "", published_at: iso(3 * H) }
    ],
    "vg-review-2": [
      { id: "rd-review-c", url: "https://example.org/foerdermittel", canonical_url: "https://example.org/foerdermittel", source_name: "Kommunalportal", source_type: "news", link_type: "publisher", confidence: "medium", title: "Länder fordern mehr Fördermittel", summary: "", published_at: iso(1 * D) }
    ]
  };

  return { profile, decisions, kosById, sourcesByVorgang };
}

module.exports = { reviewFixtureEnabled, buildReviewFixture };
