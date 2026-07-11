"use strict";

// Offline-Tests des Radar-Lesevertrags (lib/helmut/radarState.js) + der Verankerung
// in briefingContract.toBriefingContractV3. KEIN Netz, KEINE KI, KEINE Kostenwerte.
// Prueft: personenscharfe Erwaehnungen, Umfeld-Segmente aus matched_features,
// belegte Dynamiken, deterministische Zusammenfassung, Dedup, Enum-Humanisierung,
// Leerzustaende und die harten Verbote (keine hartkodierte Partei/Wahlkreis/Ausschuss,
// keine Demo, keine Cem-Sonderlogik, keine Kosten/Secrets, keine unsicheren URLs).

const radarState = require("../lib/helmut/radarState");
const briefingContract = require("../lib/helmut/briefingContract");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-11T09:32:00Z").getTime();
const nowDate = new Date(NOW);
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const base = { status: "neu", understanding_status: "complete" };

// --- Profil (ausschliesslich Profilfelder — KEINE Hardcodes im Adapter) -----
const profile = {
  id: "u-test", fullName: "Cem İnce", party: "Die Linke",
  committees: ["Ausschuss für Arbeit und Soziales"], constituency: "Salzgitter-Wolfenbüttel"
};

// --- Vorgaenge --------------------------------------------------------------
const koMentionName = {
  ...base, id: "k1", vorgang_id: "v1",
  display_title: "İnce fordert bessere Finanzierung der Kommunen",
  mentioned_mps: ["Cem İnce"], parteien: ["Die Linke"],
  best_source_url: "https://tagesspiegel.de/artikel-1", best_link_type: "direct",
  updated_at: iso(1 * 3600e3), created_at: iso(1 * 3600e3)
};
const koCriticism = {
  ...base, id: "k2", vorgang_id: "v2",
  display_title: "Kritik an İnce nach Gesundheitsreform-Vorschlag",
  mentioned_people: ["Cem Ince"], risiken: ["Scharfe Kritik aus der Opposition"],
  best_source_url: "https://ard.de/artikel-2", best_link_type: "direct",
  updated_at: iso(2 * 3600e3), created_at: iso(2 * 3600e3)
};
const koParty = {
  ...base, id: "k3", vorgang_id: "v3",
  display_title: "Fraktion beschließt neue Linie zur Migrationspolitik",
  parteien: ["Die Linke"], best_source_url: "https://x.de/artikel-3",
  updated_at: iso(3 * 3600e3), created_at: iso(3 * 3600e3)
};
const koCommittee = {
  ...base, id: "k4", vorgang_id: "v4",
  display_title: "Anhörung im Ausschuss für Arbeit und Soziales",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], best_source_url: "https://bundestag.de/artikel-4",
  updated_at: iso(4 * 3600e3), created_at: iso(4 * 3600e3)
};
const koRegion = {
  ...base, id: "k5", vorgang_id: "v5",
  display_title: "Schulen im Wahlkreis brauchen Investitionen",
  mentioned_locations: ["Salzgitter-Wolfenbüttel"], best_source_url: "https://sz.de/artikel-5",
  updated_at: iso(5 * 3600e3), created_at: iso(5 * 3600e3)
};
const koUnrelated = {
  ...base, id: "k6", vorgang_id: "v6",
  display_title: "Habeck stellt Plan vor", mentioned_people: ["Robert Habeck"],
  parteien: ["Grüne"], best_source_url: "https://x.de/artikel-6",
  updated_at: iso(6 * 3600e3), created_at: iso(6 * 3600e3)
};

const allKos = [koMentionName, koCriticism, koParty, koCommittee, koRegion, koUnrelated];
const kosById = Object.fromEntries(allKos.map((k) => [k.id, k]));

// decisions inkl. matched_features (aus der Matching-Engine, nicht erfunden).
const decisions = [
  { knowledge_object_id: "k1", vorgang_id: "v1", score: 72, matched_features: [{ type: "partei", value: "Die Linke" }] },
  { knowledge_object_id: "k2", vorgang_id: "v2", score: 55, matched_features: [] },
  { knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] },
  { knowledge_object_id: "k4", vorgang_id: "v4", score: 80, matched_features: [{ type: "ausschuss", value: "Ausschuss für Arbeit und Soziales" }, { type: "partei", value: "Die Linke" }] },
  { knowledge_object_id: "k5", vorgang_id: "v5", score: 58, matched_features: [{ type: "wahlkreis", value: "Salzgitter-Wolfenbüttel" }] },
  { knowledge_object_id: "k6", vorgang_id: "v6", score: 45, matched_features: [] }
];

const state = radarState.buildCurrentRadarState({ profile, decisions, kosById, knowledgeObjects: allKos, sourcesByVorgang: {}, now: nowDate });

// --- 1) Contract-Struktur ---------------------------------------------------
for (const key of ["generatedAt", "lastUpdated", "status", "summary", "mentions", "environment", "dynamics", "articles", "quality"]) {
  check(`Contract enthält Feld '${key}'`, Object.prototype.hasOwnProperty.call(state, key));
}
check("environment hat party/constituency/committees", state.environment && state.environment.party && state.environment.constituency && state.environment.committees);

// --- 2) Über dich — direkte, belegte Erwaehnungen ---------------------------
const mv = state.mentions.map((m) => m.vorgangId);
check("Voller Name (İnce) -> Über dich (v1)", mv.includes("v1"));
check("Namensvariante 'Cem Ince' -> Über dich (v2)", mv.includes("v2"));
check("Reine Partei-Erwähnung ist KEINE persönliche Erwähnung (v3 nicht in mentions)", !mv.includes("v3"));
check("Fremder Politiker/Partei -> keine Erwähnung (v6 nicht in mentions)", !mv.includes("v6"));
check("Jede Erwähnung trägt Quelle + echte URL + Zeit + mentionType",
  state.mentions.every((m) => m.sourceUrl && /^https?:\/\//.test(m.sourceUrl) && m.publishedAt && m.mentionType));
check("Erwähnung mit Risiko -> mentionType 'criticism' + Ton 'critical'",
  (state.mentions.find((m) => m.vorgangId === "v2") || {}).mentionType === "criticism" &&
  (state.mentions.find((m) => m.vorgangId === "v2") || {}).mentionTone === "critical");
check("mentionLabel ist menschlich (kein roher Enum sichtbar)",
  state.mentions.every((m) => m.mentionLabel && !/^(directName|quote|initiative|speech|criticism|response)$/.test(m.mentionLabel)));
check("Erwähnung trägt Evidence (echte Textgrundlage)", state.mentions.every((m) => typeof m.evidence === "string"));
check("Strukturierte Namensnennung -> confidence 'high'",
  (state.mentions.find((m) => m.vorgangId === "v1") || {}).confidence === "high");

// Einzelner haeufiger Teilname darf NICHT als direkte Erwaehnung gelten.
{
  const onlyLast = radarState.buildCurrentRadarState({
    profile: { id: "u2", fullName: "Cem İnce", party: "SPD" },
    decisions: [], kosById: {}, sourcesByVorgang: {},
    knowledgeObjects: [{ ...base, id: "kx", vorgang_id: "vx", display_title: "Debatte über Provinces und Finanzen", best_source_url: "https://x.de/y", updated_at: iso(3600e3) }],
    now: nowDate
  });
  check("Kein Teilwort-Fehltreffer ('ince' in 'Provinces') -> keine Erwähnung", onlyLast.mentions.length === 0);
}

// --- 3) Dein Umfeld — Bezug stammt aus dem Profil (matched_features) --------
const envParty = state.environment.party.map((e) => e.vorgangId);
const envCommittees = state.environment.committees.map((e) => e.vorgangId);
const envRegion = state.environment.constituency.map((e) => e.vorgangId);
check("Partei-Bezug (v3) im Segment Partei", envParty.includes("v3"));
check("Fraktion/Partei-Bezug stammt aus Profil (v1/v3/v4 sind Partei)", envParty.includes("v1") && envParty.includes("v4"));
check("Ausschuss-Bezug (v4) im Segment Ausschüsse", envCommittees.includes("v4"));
check("Wahlkreis-Bezug (v5) im Segment Wahlkreis", envRegion.includes("v5"));
check("Ein Dokument kann mehrere echte relationTypes haben (v4 in Partei UND Ausschuss)",
  envParty.includes("v4") && envCommittees.includes("v4"));
check("Kein Umfeld-Bezug ohne Profilbezug (v6 in keinem Segment)",
  !envParty.includes("v6") && !envCommittees.includes("v6") && !envRegion.includes("v6"));
check("relationLabel ist ein neutrales Produktlabel",
  state.environment.party.every((e) => ["Bezug zu deiner Partei", "Aus deinem Wahlkreis", "Betrifft deinen Ausschuss"].includes(e.relationLabel)));
check("relevanceEvidence trägt den echten Profil-Treffer (Wert)",
  (state.environment.committees.find((e) => e.vorgangId === "v4") || {}).relevanceEvidence === "Ausschuss für Arbeit und Soziales");
// Dedup innerhalb eines Bereichs.
{
  const dupDecisions = [
    { knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] },
    { knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }
  ];
  const dupState = radarState.buildCurrentRadarState({ profile, decisions: dupDecisions, kosById, knowledgeObjects: allKos, sourcesByVorgang: {}, now: nowDate });
  check("Innerhalb eines Bereichs keine Duplikate (v3 nur einmal in Partei)",
    dupState.environment.party.filter((e) => e.vorgangId === "v3").length === 1);
}

// --- 4) Neue Dynamiken — nur belegte Veraenderung ---------------------------
{
  // Ein einzelnes Dokument (source_document_count 1) erzeugt KEINE Dynamik.
  const single = radarState.buildCurrentRadarState({
    profile, kosById: { k1: koMentionName },
    decisions: [{ knowledge_object_id: "k1", vorgang_id: "v1", score: 70, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    knowledgeObjects: [koMentionName], sourcesByVorgang: {}, now: nowDate
  });
  check("Einzeldokument erzeugt keinen steigenden Trend (dynamics leer)", single.dynamics.length === 0);

  // Echte Cluster-Groesse (source_document_count 3) -> 'rising' mit echter Zahl.
  const koRising = { ...koParty, source_document_count: 3 };
  const rising = radarState.buildCurrentRadarState({
    profile, kosById: { k3: koRising },
    decisions: [{ knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    knowledgeObjects: [koRising], sourcesByVorgang: {}, now: nowDate
  });
  check("3 Quellen (echte Cluster-Größe) -> signalType 'rising'", (rising.dynamics[0] || {}).signalType === "rising");
  check("Dynamik-Evidence trägt die ECHTE Quellenzahl (3)", (rising.dynamics[0] || {}).evidence.includes("3") && (rising.dynamics[0] || {}).sourceCount === 3);
  check("Dynamik trägt keinen erfundenen Prozentwert", !/%|\+\d/.test((rising.dynamics[0] || {}).evidence));

  // Medial + offiziell -> 'broadening'.
  const broad = radarState.buildCurrentRadarState({
    profile, kosById: { k3: koParty },
    decisions: [{ knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    knowledgeObjects: [koParty],
    sourcesByVorgang: { v3: [
      { id: "d1", url: "https://media.de/a", source_type: "media", published_at: iso(3600e3) },
      { id: "d2", url: "https://bmg.de/b", source_type: "ministry", published_at: iso(3600e3) }
    ] },
    now: nowDate
  });
  check("Medial + offiziell (>=2 Quellen) -> signalType 'broadening'", (broad.dynamics[0] || {}).signalType === "broadening");
}

// --- 5) Zusammenfassung — Zahlen == Anzeige, deterministisch ----------------
const mentionsToday = state.mentions.filter((m) => (m.publishedAt || "").slice(0, 10) === "2026-07-11").length;
check("Zusammenfassung Satz 1 nennt die exakte Erwähnungszahl von heute",
  mentionsToday > 0 ? state.summary.line1.includes(String(mentionsToday)) || /einmal/.test(state.summary.line1) : true);
check("Zusammenfassung max. 2 Sätze", [state.summary.line1, state.summary.line2].filter(Boolean).length <= 2);
check("Zusammenfassung enthält keinen erfundenen Prozentwert", !/%/.test(state.summary.text));
const state2 = radarState.buildCurrentRadarState({ profile, decisions, kosById, knowledgeObjects: allKos, sourcesByVorgang: {}, now: nowDate });
check("Radar-State ist deterministisch (2 Läufe identisch)", JSON.stringify(state) === JSON.stringify(state2));

// --- 6) Artikel + Filter-relationTypes --------------------------------------
check("Artikelliste ist dedupliziert (kein vorgang_id doppelt)",
  new Set(state.articles.map((a) => a.vorgangId)).size === state.articles.length);
check("Artikel tragen relationTypes für Filter", state.articles.every((a) => Array.isArray(a.relationTypes)));
check("Über-dich-Artikel trägt relationType 'mention' (v1)",
  (state.articles.find((a) => a.vorgangId === "v1") || {}).relationTypes.includes("mention"));
check("Ausschuss-Artikel trägt relationType 'committee' (v4)",
  (state.articles.find((a) => a.vorgangId === "v4") || {}).relationTypes.includes("committee"));

// canonical URL wird bevorzugt.
{
  const canon = radarState.buildCurrentRadarState({
    profile, kosById: { k3: koParty },
    decisions: [{ knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    knowledgeObjects: [koParty],
    sourcesByVorgang: { v3: [{ id: "d1", url: "https://track.de/x?utm=1", canonical_url: "https://echt.de/artikel", source_type: "media", published_at: iso(3600e3) }] },
    now: nowDate
  });
  check("canonical URL wird bevorzugt (statt Tracking-URL)", (canon.articles[0] || {}).sourceUrl === "https://echt.de/artikel");
}

// --- 7) Status / Aktualitaet ------------------------------------------------
check("Status 'fresh' bei heutigem Datenstand", state.status === "fresh");
{
  const oldKo = { ...koParty, updated_at: iso(10 * 864e5), created_at: iso(10 * 864e5) };
  const stale = radarState.buildCurrentRadarState({
    profile, kosById: { k3: oldKo },
    decisions: [{ knowledge_object_id: "k3", vorgang_id: "v3", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    knowledgeObjects: [oldKo], sourcesByVorgang: {}, now: nowDate
  });
  check("Alter Datenstand -> Status 'stale' (kein falsches 'Aktuell')", stale.status === "stale");
}

// --- 8) Leerzustaende -------------------------------------------------------
const empty = radarState.buildCurrentRadarState({ profile, decisions: [], kosById: {}, knowledgeObjects: [], sourcesByVorgang: {}, now: nowDate });
check("Leerfall: status 'empty', alle Listen leer, ehrliche Zusammenfassung",
  empty.status === "empty" && empty.mentions.length === 0 && empty.dynamics.length === 0 &&
  empty.articles.length === 0 && /keine neuen relevanten Signale/.test(empty.summary.text));
const noName = radarState.buildCurrentRadarState({
  profile: { id: "u3", party: "" }, decisions: [], kosById: {}, knowledgeObjects: allKos, sourcesByVorgang: {}, now: nowDate
});
check("Profil ohne Name/Partei -> keine Fremd-Erwähnungen (kein False Positive)", noName.mentions.length === 0);

// --- 9) Harte Verbote / Sicherheit ------------------------------------------
const blob = JSON.stringify(state).toLowerCase();
check("Keine Kostenwerte im Radar-State (kein cost/token/llm/usage/eur)",
  !/(costestimate|kikosten|llm_usage|"tokens"|token_cost|"eur"|kosten)/.test(blob));
check("Keine Secrets/Mail im Radar-State", !/(secret|password|apikey|api_key|@)/.test(blob));
check("Alle URLs sind sichere http(s)-URLs",
  [...state.mentions, ...state.articles, ...state.environment.party].every((i) => !i.sourceUrl || /^https?:\/\//.test(i.sourceUrl)));
check("Keine technischen Quellen-Enums im sourceCategory-Label (nur Klartext/'')",
  state.articles.every((a) => !/^(media|ministry|bundestag|committee|party|official|agency)$/.test(a.sourceCategory)));

// Keine hartkodierte Partei/Wahlkreis/Ausschuss/Cem-Sonderlogik: ein voellig
// anderes Profil erzeugt ausschliesslich zu DIESEM Profil passende Bezuege.
{
  const other = {
    id: "u-cdu", fullName: "Erika Mustermann", party: "CDU",
    committees: ["Haushaltsausschuss"], constituency: "München-Land"
  };
  const otherKos = [
    { ...base, id: "o1", vorgang_id: "ov1", display_title: "Mustermann zur Haushaltslage", mentioned_mps: ["Erika Mustermann"], best_source_url: "https://a.de/o1", updated_at: iso(3600e3), created_at: iso(3600e3) },
    { ...base, id: "o2", vorgang_id: "ov2", display_title: "CDU legt Konzept vor", parteien: ["CDU"], best_source_url: "https://a.de/o2", updated_at: iso(3600e3), created_at: iso(3600e3) }
  ];
  const oDecisions = [
    { knowledge_object_id: "o1", vorgang_id: "ov1", score: 70, matched_features: [{ type: "partei", value: "CDU" }] },
    { knowledge_object_id: "o2", vorgang_id: "ov2", score: 60, matched_features: [{ type: "partei", value: "CDU" }] }
  ];
  const oState = radarState.buildCurrentRadarState({ profile: other, decisions: oDecisions, kosById: Object.fromEntries(otherKos.map((k) => [k.id, k])), knowledgeObjects: otherKos, sourcesByVorgang: {}, now: nowDate });
  const oBlob = JSON.stringify(oState).toLowerCase();
  check("Keine hartkodierte Partei: fremdes Profil (CDU) -> nur CDU-Bezug, kein 'die linke'", !oBlob.includes("die linke"));
  check("Keine Cem-Sonderlogik: fremdes Profil erkennt eigene Erwähnung (Mustermann)", oState.mentions.some((m) => m.vorgangId === "ov1"));
}

// --- 10) Verankerung in toBriefingContractV3 --------------------------------
{
  const briefing = briefingContract.toBriefingContractV3({ profile, decisions, kosById, knowledgeObjects: allKos, sourcesByVorgang: {}, now: nowDate });
  check("toBriefingContractV3 liefert currentRadarState", Boolean(briefing.currentRadarState));
  check("currentRadarState im Vertrag ist strukturgleich (mentions/environment/dynamics/articles)",
    Array.isArray(briefing.currentRadarState.mentions) && briefing.currentRadarState.environment && Array.isArray(briefing.currentRadarState.articles));
  check("Bestehende Vertragsfelder unverändert vorhanden (currentHelmutState, items)",
    Boolean(briefing.currentHelmutState) && Array.isArray(briefing.items));
}

console.log(`\n${passed}/${passed + failed} Radar-State-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
