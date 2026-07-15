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
  // Partei ist AKTEUR im Titel (nicht nur beilaeufig gelistet) -> belegter Parteibezug.
  display_title: "Die Linke beschließt neue Linie zur Migrationspolitik",
  parteien: ["Die Linke"], best_source_url: "https://x.de/artikel-3",
  updated_at: iso(3 * 3600e3), created_at: iso(3 * 3600e3)
};
const koCommittee = {
  ...base, id: "k4", vorgang_id: "v4",
  // Echter Partei- UND Ausschussvorgang: Partei als Akteur im Titel + Ausschuss strukturell.
  display_title: "Die Linke fordert Anhörung im Ausschuss für Arbeit und Soziales",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], parteien: ["Die Linke"],
  best_source_url: "https://bundestag.de/artikel-4",
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
// Partei-Umfeld verlangt die Partei als AKTEUR/Quelle: v3/v4 (Partei handelt im Titel)
// sind Partei; v1 ist reine PERSONEN-Handlung des Profilinhabers -> "Über dich", NICHT Partei.
check("Partei-Umfeld nur mit Partei als Akteur: v3/v4 Partei, v1 (Personenhandlung) NICHT",
  envParty.includes("v3") && envParty.includes("v4") && !envParty.includes("v1"));
check("Ausschuss-Bezug (v4) im Segment Ausschüsse", envCommittees.includes("v4"));
check("Wahlkreis-Bezug (v5) im Segment Wahlkreis", envRegion.includes("v5"));
check("Ein Dokument kann mehrere echte relationTypes haben (v4 in Partei UND Ausschuss)",
  envParty.includes("v4") && envCommittees.includes("v4"));
check("Kein Umfeld-Bezug ohne Profilbezug (v6 in keinem Segment)",
  !envParty.includes("v6") && !envCommittees.includes("v6") && !envRegion.includes("v6"));
check("relationLabel ist ein neutrales, dimensionsgenaues Produktlabel",
  state.environment.party.every((e) => e.relationLabel === "Betrifft deine Partei") &&
  state.environment.constituency.every((e) => e.relationLabel === "Betrifft deinen Wahlkreis") &&
  state.environment.committees.every((e) => e.relationLabel === "Betrifft deinen Ausschuss"));
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

// --- 11) SaaS-strikte Über-dich-Regeln (Blocker-Fix: Vertrauen > Fülle) ------
// Nur belegte Nennung des VOLLEN Namens zählt. Kein Vorname/Nachname/Namensvetter,
// kein Profil-/Decision-Match, kein Partei-/Ausschuss-/Wahlkreis-/Themenbezug.
{
  const p = { id: "s1", fullName: "Cem İnce", party: "Die Linke", committees: ["Ausschuss für Arbeit und Soziales"], constituency: "Salzgitter-Wolfenbüttel" };
  const mk = (over) => ({ ...base, best_source_url: "https://q.de/x", updated_at: iso(3600e3), created_at: iso(3600e3), ...over });
  const one = (ko) => radarState.buildCurrentRadarState({ profile: p, decisions: [], kosById: { [ko.id]: ko }, knowledgeObjects: [ko], sourcesByVorgang: {}, now: nowDate }).mentions.map((m) => m.vorgangId);

  check("Blocker #1 Voller Name (mentioned_mps) -> Über dich",
    one(mk({ id: "s-full", vorgang_id: "s-full", display_title: "Kommunalfinanzen", mentioned_mps: ["Cem İnce"] })).includes("s-full"));
  check("Blocker #1b Voller Name in FAKTEN-Prosa (display_title) -> Über dich",
    one(mk({ id: "s-prose", vorgang_id: "s-prose", display_title: "Cem İnce fordert Reform" })).includes("s-prose"));
  check("Blocker #1c Umgekehrte Reihenfolge 'İnce, Cem' im Personenfeld -> Über dich",
    one(mk({ id: "s-rev", vorgang_id: "s-rev", display_title: "Debatte", mentioned_people: ["İnce, Cem"] })).includes("s-rev"));
  check("Blocker #2 Einzelner VORNAME (Namensvetter) -> KEIN Über dich",
    one(mk({ id: "s-first", vorgang_id: "s-first", display_title: "Bremen führt Fußfesseln ein", mentioned_people: ["Cem"], risiken: ["Kritik"] })).length === 0);
  check("Blocker #3 Einzelner NACHNAME (anderer İnce) -> KEIN Über dich",
    one(mk({ id: "s-last", vorgang_id: "s-last", display_title: "Bremen führt Fußfesseln ein", was_ist_passiert: "Senator Max İnce verteidigt.", mentioned_people: ["Max İnce"], risiken: ["Kritik"] })).length === 0);
  check("Blocker #9 Name NUR in why_relevant/warum_wichtig (Profil-/Decision-Match) -> KEIN Über dich",
    one(mk({ id: "s-why", vorgang_id: "s-why", display_title: "Bremen führt Fußfesseln ein", why_relevant: "Für İnce als Ausschussmitglied relevant.", warum_wichtig: "Cem İnce positioniert die Fraktion.", risiken: ["Kritik"] })).length === 0);
  check("Blocker #4/5 Reiner Partei-/Fraktionsbezug -> KEIN Über dich",
    one(mk({ id: "s-party", vorgang_id: "s-party", display_title: "Die Linke beschließt Linie", parteien: ["Die Linke"] })).length === 0);
  check("Blocker #7 Reiner Ausschussbezug -> KEIN Über dich",
    one(mk({ id: "s-comm", vorgang_id: "s-comm", display_title: "Anhörung im Ausschuss", ausschuesse: ["Ausschuss für Arbeit und Soziales"] })).length === 0);
  check("Blocker #6 Reiner Wahlkreisbezug -> KEIN Über dich",
    one(mk({ id: "s-reg", vorgang_id: "s-reg", display_title: "Schulen im Wahlkreis", mentioned_locations: ["Salzgitter-Wolfenbüttel"] })).length === 0);
  check("Blocker #8 Reine Themenrelevanz -> KEIN Über dich",
    one(mk({ id: "s-theme", vorgang_id: "s-theme", display_title: "Debatte über Rente und Pflege", tags: ["Rente", "Pflege"] })).length === 0);

  // #11: mentions leer -> Zusammenfassung behauptet KEINE direkte Erwähnung.
  const emptyMentionState = radarState.buildCurrentRadarState({
    profile: p,
    decisions: [{ knowledge_object_id: "s-party", vorgang_id: "s-party", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    kosById: { "s-party": mk({ id: "s-party", vorgang_id: "s-party", display_title: "Die Linke beschließt Linie", parteien: ["Die Linke"] }) },
    knowledgeObjects: [mk({ id: "s-party", vorgang_id: "s-party", display_title: "Die Linke beschließt Linie", parteien: ["Die Linke"] })],
    sourcesByVorgang: {}, now: nowDate
  });
  check("Blocker #10/11 Leere mentions -> Zusammenfassung behauptet keine direkte Erwähnung",
    emptyMentionState.mentions.length === 0 && !/direkte Erwähnung/i.test(emptyMentionState.summary.line1) &&
    /keine.*direkten Erwähnungen/i.test(emptyMentionState.summary.line1));
}

// --- 12) Phase 4: Umfeld-Labels dimensionsgenau, kein Cross-Leak ------------
{
  check("Umfeld #13 Partei-Label ist NICHT am Ausschuss-Bezug (v4 im Ausschuss trägt Ausschuss-Label)",
    (state.environment.committees.find((e) => e.vorgangId === "v4") || {}).relationLabel === "Betrifft deinen Ausschuss");
  check("Umfeld #14 Wahlkreis-Label ist NICHT am Partei-Bezug (v3 in Partei trägt Partei-Label)",
    (state.environment.party.find((e) => e.vorgangId === "v3") || {}).relationLabel === "Betrifft deine Partei");
  check("Umfeld: kein technischer Enum im relationLabel",
    ["party", "constituency", "committees"].every((k) => state.environment[k].every((e) => !/^(party|constituency|committee)$/.test(e.relationLabel))));
}

// --- 13) Phase 5: alte Aktivität wird NICHT als neue Dynamik gezeigt --------
{
  const pDyn = { id: "d1", fullName: "Erika Mustermann", party: "CDU" };
  const oldBroad = { ...base, id: "kold", vorgang_id: "vold", display_title: "Alter Vorgang mit breitem Widerhall",
    source_document_count: 4, updated_at: iso(9 * 864e5), created_at: iso(12 * 864e5) };
  const freshBroad = { ...base, id: "knew", vorgang_id: "vnew", display_title: "Frischer Vorgang mit breitem Widerhall",
    source_document_count: 4, updated_at: iso(6 * 3600e3), created_at: iso(6 * 3600e3) };
  const dec = (id, vg) => ({ knowledge_object_id: id, vorgang_id: vg, score: 60, matched_features: [{ type: "partei", value: "CDU" }] });
  const srcOld = { vold: [ { id: "o1", url: "https://media.de/a", source_type: "media", published_at: iso(9 * 864e5) }, { id: "o2", url: "https://bmi.de/b", source_type: "ministry", published_at: iso(10 * 864e5) } ] };
  const srcNew = { vnew: [ { id: "n1", url: "https://media.de/a", source_type: "media", published_at: iso(6 * 3600e3) }, { id: "n2", url: "https://bmi.de/b", source_type: "ministry", published_at: iso(7 * 3600e3) } ] };
  const dynState = radarState.buildCurrentRadarState({ profile: pDyn,
    decisions: [dec("kold", "vold"), dec("knew", "vnew")],
    kosById: { kold: oldBroad, knew: freshBroad }, knowledgeObjects: [oldBroad, freshBroad],
    sourcesByVorgang: { ...srcOld, ...srcNew }, now: nowDate });
  const dynIds = dynState.dynamics.map((d) => d.vorgangId);
  check("Dynamik #15 alter Vorgang (>4 Tage, keine neue Aktivität) NICHT in 'Neue Dynamiken'", !dynIds.includes("vold"));
  check("Dynamik #15 frischer Vorgang MIT belegter Aktivität erscheint", dynIds.includes("vnew"));
  // Nur alte Aktivität -> ehrlich leer (kein 'neu' auf altem Stand).
  const onlyOld = radarState.buildCurrentRadarState({ profile: pDyn, decisions: [dec("kold", "vold")],
    kosById: { kold: oldBroad }, knowledgeObjects: [oldBroad], sourcesByVorgang: srcOld, now: nowDate });
  check("Dynamik #15 nur alte Aktivität -> dynamics leer (ehrlicher Leerzustand)", onlyOld.dynamics.length === 0);
}

// --- 14) Phase 3: Frische misst QUELLEN-Datum, nicht Re-Processing (updated_at) ---
{
  const pF = { id: "f1", fullName: "Erika Mustermann", party: "CDU" };
  // Alt-datierte QUELLEN (20 Tage), aber KO wurde HEUTE neu verarbeitet (updated_at frisch).
  const koReprocessed = { ...base, id: "krp", vorgang_id: "vrp", display_title: "CDU bekräftigt Kurs trotz alter Quellenlage",
    parteien: ["CDU"], // Partei als Akteur im Titel + strukturell in parteien (bleibt im Umfeld erlaubt)
    source_document_count: 4, updated_at: iso(1 * 3600e3), created_at: iso(20 * 864e5) };
  const dec = [{ knowledge_object_id: "krp", vorgang_id: "vrp", score: 60, matched_features: [{ type: "partei", value: "CDU" }] }];
  const src = { vrp: [
    { id: "s1", url: "https://media.de/a", source_type: "media", published_at: iso(20 * 864e5) },
    { id: "s2", url: "https://bmi.de/b", source_type: "ministry", published_at: iso(21 * 864e5) }
  ] };
  const st = radarState.buildCurrentRadarState({ profile: pF, decisions: dec, kosById: { krp: koReprocessed }, knowledgeObjects: [koReprocessed], sourcesByVorgang: src, now: nowDate });
  check("Phase3 #5: frisches updated_at aber ALTE Quelle (20 Tage) -> NICHT in Neue Dynamiken",
    !st.dynamics.some((d) => d.vorgangId === "vrp"));
  check("Phase3 #6: derselbe alte Vorgang bleibt in 'Alle Artikel' erlaubt (Recherche-Ebene)",
    st.articles.some((a) => a.vorgangId === "vrp"));
  check("Phase3 #6b: derselbe alte Vorgang bleibt im Umfeld erlaubt (echter Profilbezug)",
    st.environment.party.some((e) => e.vorgangId === "vrp"));
  // Gegentest: dieselbe Struktur mit FRISCHER Quelle (2 Tage) -> erscheint als Dynamik.
  const koFreshSrc = { ...koReprocessed, id: "kfs", vorgang_id: "vfs", created_at: iso(2 * 864e5) };
  const stF = radarState.buildCurrentRadarState({ profile: pF,
    decisions: [{ knowledge_object_id: "kfs", vorgang_id: "vfs", score: 60, matched_features: [{ type: "partei", value: "CDU" }] }],
    kosById: { kfs: koFreshSrc }, knowledgeObjects: [koFreshSrc],
    sourcesByVorgang: { vfs: [ { id: "s3", url: "https://media.de/a", source_type: "media", published_at: iso(2 * 864e5) }, { id: "s4", url: "https://bmi.de/b", source_type: "ministry", published_at: iso(2 * 864e5) } ] },
    now: nowDate });
  check("Phase3: frische Quelle (2 Tage) innerhalb 7-Tage-Fenster -> erscheint als Dynamik",
    stF.dynamics.some((d) => d.vorgangId === "vfs"));
  check("Phase3: Dynamik zeigt das QUELLEN-Datum (nicht das Re-Processing-Datum)",
    (stF.dynamics.find((d) => d.vorgangId === "vfs") || {}).lastUpdatedAt === iso(2 * 864e5));
}

// --- 15) STRENGE, belegbare Relationen (WELT-Artikel-Fix, alle Bereiche) -----
{
  const p = { id: "s2", fullName: "Erika Mustermann", party: "Die Linke", committees: ["Auswärtiger Ausschuss"], constituency: "Salzgitter-Wolfenbüttel" };
  const one = (ko, dec, src) => radarState.buildCurrentRadarState({ profile: p, decisions: [dec], kosById: { [ko.id]: ko }, knowledgeObjects: [ko], sourcesByVorgang: src || {}, now: nowDate });

  // WELT-Fall: Außenpolitik-MEDIENartikel, eigene Partei NUR beiläufig erwähnt
  // (mentioned_parties), NICHT strukturell involviert (parteien leer).
  const koWelt = { ...base, id: "kw", vorgang_id: "vw",
    display_title: "Türkei provoziert mit scharfer Israelkritik vor NATO-Gipfel",
    was_ist_passiert: "Außenpolitische Zuspitzung vor dem Gipfel.",
    mentioned_parties: ["Die Linke"], parteien: [],
    best_source_url: "https://welt.de/aussenpolitik", best_link_type: "direct",
    updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stWelt = one(koWelt,
    { knowledge_object_id: "kw", vorgang_id: "vw", score: 55, matched_features: [{ type: "partei", value: "Die Linke" }] },
    { vw: [{ id: "w1", url: "https://welt.de/x", source_type: "media", published_at: iso(3600e3) }] });
  check("#8 WELT-Außenpolitikartikel ohne strukturellen Parteibeleg -> NICHT im Umfeld Partei",
    !stWelt.environment.party.some((e) => e.vorgangId === "vw"));
  check("#8 WELT-Artikel trägt KEINEN relationType 'party' (nicht im Partei-Filter)",
    !((stWelt.articles.find((a) => a.vorgangId === "vw") || { relationTypes: [] }).relationTypes.includes("party")));
  check("#15 WELT-Artikel bleibt in 'Alle relevanten Artikel' (breitere Recherche-Ebene)",
    stWelt.articles.some((a) => a.vorgangId === "vw"));
  check("#8 WELT-Artikel trägt 'media' (korrekter Quellenbezug bleibt)",
    (stWelt.articles.find((a) => a.vorgangId === "vw") || { relationTypes: [] }).relationTypes.includes("media"));

  // #4/#6 echte eigene Partei (strukturell involviert) -> im Partei-Segment.
  const koRealParty = { ...base, id: "krp2", vorgang_id: "vrp2", display_title: "Die Linke beschließt neue Linie",
    parteien: ["Die Linke"], best_source_url: "https://x.de/p", updated_at: iso(3600e3), created_at: iso(3600e3) };
  check("#4 Vorgang mit strukturell involvierter eigener Partei -> im Umfeld Partei",
    one(koRealParty, { knowledge_object_id: "krp2", vorgang_id: "vrp2", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] })
      .environment.party.some((e) => e.vorgangId === "vrp2"));
  // #12 reiner Parteibezug (kein ko.ausschuesse) -> NICHT unter Ausschüsse.
  check("#12 Ausschüsse zeigt keinen reinen Parteibezug (kein ausschuesse -> nicht im Ausschuss-Segment)",
    !one(koRealParty, { knowledge_object_id: "krp2", vorgang_id: "vrp2", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }, { type: "ausschuss", value: "Auswärtiger Ausschuss" }] })
      .environment.committees.some((e) => e.vorgangId === "vrp2"));
  // #7 reiner Themen-/Score-Match ohne strukturellen Bezug -> in keinem Umfeld-Segment.
  const koTheme = { ...base, id: "kt2", vorgang_id: "vt2", display_title: "Allgemeine Rentendebatte",
    tags: ["Rente"], parteien: [], ausschuesse: [], best_source_url: "https://x.de/t", updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stTheme = one(koTheme, { knowledge_object_id: "kt2", vorgang_id: "vt2", score: 50, matched_features: [{ type: "partei", value: "Die Linke" }] });
  check("#7 reiner Themen-/Score-Match ohne Struktur-Beleg -> in KEINEM Umfeld-Segment",
    !stTheme.environment.party.some((e) => e.vorgangId === "vt2") &&
    !stTheme.environment.committees.some((e) => e.vorgangId === "vt2") &&
    !stTheme.environment.constituency.some((e) => e.vorgangId === "vt2"));

  // #10 allgemeines Bundesland ohne konkreten Wahlkreis -> NICHT unter Wahlkreis.
  const pState = { id: "s3", fullName: "Erika Mustermann", party: "CDU", state: "Niedersachsen", constituency: "Salzgitter-Wolfenbüttel" };
  const koState = { ...base, id: "kst", vorgang_id: "vst", display_title: "Niedersachsen debattiert Landeshaushalt",
    mentioned_locations: ["Niedersachsen"], best_source_url: "https://x.de/nds", updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stState = radarState.buildCurrentRadarState({ profile: pState, decisions: [{ knowledge_object_id: "kst", vorgang_id: "vst", score: 55, matched_features: [{ type: "wahlkreis", value: "Niedersachsen" }] }], kosById: { kst: koState }, knowledgeObjects: [koState], sourcesByVorgang: {}, now: nowDate });
  check("#10 allgemeines Bundesland (Niedersachsen) ohne konkreten Wahlkreis -> NICHT unter Wahlkreis",
    !stState.environment.constituency.some((e) => e.vorgangId === "vst"));
  const koConc = { ...base, id: "kc", vorgang_id: "vc", display_title: "Investitionen in Salzgitter-Wolfenbüttel",
    mentioned_locations: ["Salzgitter-Wolfenbüttel"], best_source_url: "https://x.de/sz", updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stConc = radarState.buildCurrentRadarState({ profile: pState, decisions: [{ knowledge_object_id: "kc", vorgang_id: "vc", score: 55, matched_features: [{ type: "wahlkreis", value: "Salzgitter-Wolfenbüttel" }] }], kosById: { kc: koConc }, knowledgeObjects: [koConc], sourcesByVorgang: {}, now: nowDate });
  check("#9 konkreter Profil-Wahlkreis (Salzgitter-Wolfenbüttel) -> unter Wahlkreis",
    stConc.environment.constituency.some((e) => e.vorgangId === "vc"));

  // radarRelationBeleg Unit-Tests (nachvollziehbar, ohne Secrets/Kosten/LLM).
  const terms = radarState.radarProfileTerms(p);
  check("radarRelationBeleg: party verlangt ko.parteien UND Akteurs-/Quellenbeleg (Titel ODER Partei-/Fraktionsquelle)",
    // Partei in parteien + Partei als Akteur im Titel -> belegt.
    radarState.radarRelationBeleg("party", "Die Linke", { parteien: ["Die Linke"], display_title: "Die Linke beschließt neue Linie" }, terms) === true &&
    // Partei in parteien + Partei-/Fraktionsquelle -> belegt (auch ohne Partei im Titel).
    radarState.radarRelationBeleg("party", "Die Linke", { parteien: ["Die Linke"] }, terms, { sourceType: "faction" }) === true &&
    // Partei NUR beilaeufig erwaehnt (mentioned_parties), nicht in parteien -> NICHT belegt (FALL B).
    radarState.radarRelationBeleg("party", "Die Linke", { parteien: [], mentioned_parties: ["Die Linke"] }, terms) === false &&
    // FALL C: Partei in parteien, aber Medienartikel ohne Parteihandlung (Partei nicht im Titel,
    // Quelle = Medien) -> NICHT belegt. Genau der WELT-Fall aus echten Daten.
    radarState.radarRelationBeleg("party", "Die Linke", { parteien: ["Die Linke"], display_title: "Türkei provoziert vor NATO-Gipfel" }, terms, { sourceType: "media" }) === false);
  check("radarRelationBeleg: constituency NUR konkreter Wahlkreis, kein Bundesland",
    radarState.radarRelationBeleg("constituency", "Salzgitter-Wolfenbüttel", { mentioned_locations: ["Salzgitter-Wolfenbüttel"] }, terms) === true &&
    radarState.radarRelationBeleg("constituency", "Niedersachsen", { mentioned_locations: ["Niedersachsen"] }, terms) === false);
  check("radarRelationBeleg: committee verlangt strukturelle ko.ausschuesse-Involvierung UND (nachgeschaerft) den vollen amtlichen Ausschussnamen WÖRTLICH im Inhalt — ko.ausschuesse allein (auch in voller Form) genuegt NICHT mehr (gilt fuer JEDEN Ausschuss, keine Sonderregel)",
    // Strukturell involviert + voller Ausschussname im Inhalt -> belegt.
    radarState.radarRelationBeleg("committee", "Auswärtiger Ausschuss", { ausschuesse: ["Ausschuss für Auswärtiges"], was_ist_passiert: "Der Ausschuss für Auswärtiges hat getagt." }, terms) === true &&
    // Keine strukturelle Involvierung -> nicht belegt.
    radarState.radarRelationBeleg("committee", "Auswärtiger Ausschuss", { ausschuesse: [], was_ist_passiert: "Der Ausschuss für Auswärtiges hat getagt." }, terms) === false &&
    // Voller Name in ko.ausschuesse, aber NICHT im Inhalt (nur aus dem Politikfeld abgeschrieben) -> NICHT belegt.
    radarState.radarRelationBeleg("committee", "Auswärtiger Ausschuss", { ausschuesse: ["Ausschuss für Auswärtiges"], was_ist_passiert: "Bericht zur Aussenpolitik ohne Gremiennennung." }, terms) === false);
}

// --- 16) Radar Relation Truth — Partei nur mit Akteurs-/Quellenbeleg ---------
// Deckt FALL C (Partei faelschlich in ko.parteien bei Medienartikel), echte Partei-/
// Fraktionsquelle, SaaS-Allgemeingueltigkeit (andere Partei/Profil) und den read-only
// Debug-Weg ab. KEINE hartkodierte Partei, KEINE WELT-/Themen-Sonderregel.
{
  const p = { id: "s4", fullName: "Erika Mustermann", party: "Die Linke", constituency: "Salzgitter-Wolfenbüttel" };
  const one = (ko, dec, src) => radarState.buildCurrentRadarState({ profile: p, decisions: [dec], kosById: { [ko.id]: ko }, knowledgeObjects: [ko], sourcesByVorgang: src || {}, now: nowDate });
  const partyFeat = (v) => ({ knowledge_object_id: v.replace("v", "k"), vorgang_id: v, score: 55, matched_features: [{ type: "partei", value: "Die Linke" }] });

  // FALL C: Partei IN ko.parteien, aber Medienartikel ohne Parteihandlung (Partei nicht
  // im Titel, Quelle = Medien). Darf NICHT unter Partei — bleibt in Artikeln als 'media'.
  const koFallC = { ...base, id: "kc16", vorgang_id: "vc16",
    display_title: "Türkei provoziert mit scharfer Israelkritik vor NATO-Gipfel",
    was_ist_passiert: "Außenpolitische Zuspitzung.", parteien: ["Die Linke"], mentioned_parties: ["Die Linke"],
    best_source_url: "https://welt.de/x", updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stC = one(koFallC, { knowledge_object_id: "kc16", vorgang_id: "vc16", score: 55, matched_features: [{ type: "partei", value: "Die Linke" }] },
    { vc16: [{ id: "c1", url: "https://welt.de/x", source_type: "media", published_at: iso(3600e3) }] });
  check("FALL C: Partei in ko.parteien, aber Medienartikel ohne Parteihandlung -> NICHT unter Partei",
    !stC.environment.party.some((e) => e.vorgangId === "vc16") &&
    !((stC.articles.find((a) => a.vorgangId === "vc16") || { relationTypes: [] }).relationTypes.includes("party")));
  check("FALL C: Artikel bleibt in 'Alle relevanten Artikel' als 'media'",
    (stC.articles.find((a) => a.vorgangId === "vc16") || { relationTypes: [] }).relationTypes.includes("media"));

  // Echte Partei-/FraktionsQUELLE (source_type faction) -> unter Partei, auch ohne Partei im Titel.
  const koSrc = { ...base, id: "ks16", vorgang_id: "vs16", display_title: "Neue Linie zur Sozialpolitik beschlossen",
    parteien: ["Die Linke"], updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stSrc = one(koSrc, { knowledge_object_id: "ks16", vorgang_id: "vs16", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] },
    { vs16: [{ id: "f1", url: "https://die-linke.de/pm", source_type: "faction", published_at: iso(3600e3) }] });
  check("Partei als echte Fraktionsquelle (source_type faction) -> unter Partei",
    stSrc.environment.party.some((e) => e.vorgangId === "vs16"));

  // SaaS-Allgemeingueltigkeit: anderes Profil, andere Partei (SPD) — dieselbe Regel greift.
  const pSPD = { id: "s5", fullName: "Max Beispiel", party: "SPD", constituency: "Berlin-Mitte" };
  const koSPD = { ...base, id: "kspd", vorgang_id: "vspd", display_title: "SPD beschließt neues Rentenkonzept",
    parteien: ["SPD"], best_source_url: "https://x.de/spd", updated_at: iso(3600e3), created_at: iso(3600e3) };
  const stSPD = radarState.buildCurrentRadarState({ profile: pSPD,
    decisions: [{ knowledge_object_id: "kspd", vorgang_id: "vspd", score: 60, matched_features: [{ type: "partei", value: "SPD" }] }],
    kosById: { kspd: koSPD }, knowledgeObjects: [koSPD], sourcesByVorgang: {}, now: nowDate });
  check("SaaS: andere Partei/Profil (SPD als Akteur im Titel) -> unter Partei (keine hartkodierte Partei)",
    stSPD.environment.party.some((e) => e.vorgangId === "vspd"));
  const koSPDmedia = { ...koSPD, id: "kspm", vorgang_id: "vspm", display_title: "Kommentar: Was die Außenpolitik jetzt braucht", parteien: ["SPD"], mentioned_parties: ["SPD"] };
  const stSPDm = radarState.buildCurrentRadarState({ profile: pSPD,
    decisions: [{ knowledge_object_id: "kspm", vorgang_id: "vspm", score: 55, matched_features: [{ type: "partei", value: "SPD" }] }],
    kosById: { kspm: koSPDmedia }, knowledgeObjects: [koSPDmedia],
    sourcesByVorgang: { vspm: [{ id: "m9", url: "https://welt.de/k", source_type: "media", published_at: iso(3600e3) }] }, now: nowDate });
  check("SaaS: SPD nur medial kommentiert (kein Akteur) -> NICHT unter Partei",
    !stSPDm.environment.party.some((e) => e.vorgangId === "vspm"));

  // Read-only Debug-Weg (buildRadarRelationsDebug): nur Partei-relevante Vorgaenge, mit
  // Begruendung; KEINE Kosten/Secrets. partyGranted spiegelt die echte Regel.
  const dbg = radarState.buildRadarRelationsDebug({ profile: p, decisions: [
    { knowledge_object_id: "kc16", vorgang_id: "vc16", score: 55, matched_features: [{ type: "partei", value: "Die Linke" }] }
  ], kosById: { kc16: koFallC }, sourcesByVorgang: { vc16: [{ id: "c1", url: "https://welt.de/x", source_type: "media", published_at: iso(3600e3) }] }, commit: "abc123def456" });
  check("Debug: enthält commit + genau den Partei-Vorgang mit Begruendung", dbg.commit === "abc123def456" && dbg.count === 1 && dbg.items[0].vorgangId === "vc16");
  check("Debug: partyGranted=false fuer FALL C, mit Belegfeldern (parteien/mentionedParties/reason)",
    dbg.items[0].partyGranted === false && Array.isArray(dbg.items[0].parteien) && Array.isArray(dbg.items[0].mentionedParties) && /Akteurs-\/Quellenbeleg|Medien/.test(dbg.items[0].reason));
  check("Debug: KEINE Kosten-/Secret-Felder im Debug-Objekt",
    !JSON.stringify(dbg).match(/kosten|totalcost|\bcost\b|\bsecret\b|\btoken\b|\busd\b|€|api[_-]?key/i));
  check("Debug: Vorgang OHNE Partei-Match erscheint NICHT im Debug",
    radarState.buildRadarRelationsDebug({ profile: p, decisions: [{ knowledge_object_id: "kt2", vorgang_id: "vt2", score: 50, matched_features: [{ type: "thema", value: "Rente" }] }], kosById: { kt2: { ...base, id: "kt2", vorgang_id: "vt2", display_title: "Rentendebatte" } }, sourcesByVorgang: {} }).count === 0);
}

// ── Pre-Sale-Fix: historische Erwaehnungen ueberleben den LEER-Pfad ──────────
// Regression zu RAD-02: Fruehere Early-Returns ("keine-treffer") bauten den
// Radar OHNE knowledgeObjects -> "Ueber dich" war leer, obwohl belegte (auch
// alte) Erwaehnungen ueber den Nutzer vorlagen. buildMentions arbeitet
// unabhaengig von den Decisions; der Leerzustand muss sie erhalten.
{
  const oldIso = new Date(NOW - 180 * 864e5).toISOString(); // ~6 Monate alt
  const pMention = { id: "u-m", fullName: "Cem İnce", party: "Die Linke" };
  const koOldMention = {
    ...base, id: "kold", vorgang_id: "vold",
    display_title: "Alte Berichterstattung über Cem İnce",
    was_ist_passiert: "Bericht.", mentioned_people: ["Cem İnce"],
    updated_at: oldIso, created_at: oldIso,
    best_source_url: "https://tagesschau.de/alt", source_trust: "hoch"
  };
  // Exakt der Server-Leerpfad: decisions=[], aber knowledgeObjects mitgegeben.
  const bEmpty = briefingContract.toBriefingContractV3({
    profile: pMention, decisions: [], kosById: {}, sourcesByVorgang: {},
    reason: "keine-treffer", knowledgeObjects: [koOldMention], now: nowDate
  });
  const rs = bEmpty.currentRadarState || {};
  const mentions = rs.mentions || [];
  check("RAD-02: alte Erwaehnung erscheint trotz leerer Decisions (Leer-Pfad erhaelt Erwaehnungen)",
    mentions.length === 1 && mentions[0].vorgangId === "vold");
  check("RAD-02: Beleg-URL der historischen Erwaehnung bleibt erhalten",
    mentions.length === 1 && /tagesschau\.de/.test(JSON.stringify(mentions[0])));
  // Gegenprobe: OHNE knowledgeObjects (Alt-Verhalten) bleibt "Ueber dich" leer.
  const bNoKos = briefingContract.toBriefingContractV3({
    profile: pMention, decisions: [], kosById: {}, sourcesByVorgang: {}, reason: "keine-treffer", now: nowDate
  });
  check("RAD-02: ohne knowledgeObjects keine Erwaehnungen (Kontrolle)",
    ((bNoKos.currentRadarState || {}).mentions || []).length === 0);
}

// ── 17) pickPrimarySource: Durchbruch auf Zweitdokument/best_source_url ──────
// Audit-Folgebranch: das ranghoechste Dokument wurde auch mit unbrauchbarer URL
// (safeUrl leer) zurueckgegeben — weder das naechste Dokument noch best_source_url
// wurden probiert. Jetzt: nur safeUrl-gueltige Dokumente in der Auswahl; ohne
// brauchbares Dokument der best_source_url-Fallback; nie eine erfundene URL.
{
  const koPP = { vorgang_id: "vpp", best_source_url: "https://fallback.de/artikel", display_title: "Titel" };
  // Top-Dokument (link_type direct = ranghoechst) ohne brauchbare URL -> Zweitdokument.
  const srcNext = radarState.pickPrimarySource(koPP, [
    { id: "d-top", url: "kein-link", link_type: "direct", published_at: iso(1 * 3600e3) },
    { id: "d-second", url: "https://zweit.de/artikel", published_at: iso(2 * 3600e3) }
  ]);
  check("pickPrimarySource: Top-Dokument ohne brauchbare URL -> naechstes Dokument mit gueltiger URL",
    Boolean(srcNext) && srcNext.documentId === "d-second" && srcNext.url === "https://zweit.de/artikel");
  // Alle Dokumente unbrauchbar -> best_source_url-Fallback (wie bisher ohne Docs).
  const srcFallback = radarState.pickPrimarySource(koPP, [
    { id: "d1", url: "javascript:alert(1)", link_type: "direct" },
    { id: "d2", url: "" }
  ]);
  check("pickPrimarySource: alle Dokumente ohne brauchbare URL -> best_source_url-Fallback",
    Boolean(srcFallback) && srcFallback.documentId === null && srcFallback.url === "https://fallback.de/artikel");
  // Gar nichts Brauchbares -> null (keine URL wird erfunden).
  check("pickPrimarySource: keine brauchbare Quelle UND kein best_source_url -> null (nichts erfinden)",
    radarState.pickPrimarySource({ vorgang_id: "vpp" }, [{ id: "d1", url: "javascript:alert(1)" }]) === null);

  // Erwaehnungs-Ebene: eine belegte Eigenerwaehnung OHNE best_source_url wird NICHT
  // gedroppt, wenn ein gueltiges Zweitdokument existiert.
  const koMentionSecond = {
    ...base, id: "kmx", vorgang_id: "vmx",
    display_title: "Cem İnce im Gespräch zur Kommunalfinanzierung",
    was_ist_passiert: "Bericht.", mentioned_people: ["Cem İnce"],
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  const stSecond = radarState.buildCurrentRadarState({
    profile, decisions: [], kosById: {}, knowledgeObjects: [koMentionSecond],
    sourcesByVorgang: { vmx: [
      { id: "b1", url: "kein-link", link_type: "direct", published_at: iso(3600e3) },
      { id: "b2", url: "https://tagesschau.de/zweitquelle", published_at: iso(3600e3) }
    ] },
    now: nowDate
  });
  check("Erwaehnung bleibt sichtbar, wenn IRGENDEINE gueltige Quelle existiert (Zweitdokument)",
    stSecond.mentions.some((m) => m.vorgangId === "vmx" && m.sourceUrl === "https://tagesschau.de/zweitquelle"));
}

// ── 18) Nachladedeckel: server.js haengt am exportierten MENTION_CAP ─────────
// Frueher MENTION_SOURCE_LOAD_CAP=25 < MENTION_CAP=30: ab dem 26. Erwaehnungs-KO
// ohne geladene Quelle griff der Nachladen-Fix nicht mehr.
{
  const fs = require("fs");
  const path = require("path");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  check("Nachladedeckel = radarState.MENTION_CAP (keine eigene, niedrigere Konstante in server.js)",
    /MENTION_SOURCE_LOAD_CAP = radarStateMod\.MENTION_CAP/.test(serverSource));
  check("MENTION_CAP ist exportiert und traegt die Erwaehnungs-Obergrenze (30)",
    radarState.MENTION_CAP === 30);
}

// ── 19) Server-Leerpfade (RAD-02-Regression OHNE best_source_url) ────────────
// Belegte Eigenerwaehnung OHNE best_source_url, deren Quellen NUR ueber das
// Nachladen (loadMentionSourcesInto -> getSourcesForVorgang) kommen, bleibt in
// BEIDEN Leer-Pfaden von buildV3Briefing sichtbar:
//   Pfad A: decisions leer -> emptyKeepMentions("keine-treffer") VOR dem Hauptpfad,
//   Pfad B: alle Decisions in Quarantaene -> emptyKeepMentions("keine-treffer") danach.
// Simulation wie slot-aware-read-test: storage-Stubs VOR require(server.js) setzen
// (server.js destrukturiert beim Laden), decideForUser am Modul patchen (Aufruf
// erfolgt zur Laufzeit ueber das Modulobjekt). KEIN Netz, KEINE KI.
(async () => {
  const storage = require("../lib/helmut/storage");
  const decisionsEngine = require("../lib/helmut/decisions");
  const origReady = storage.v3StoreReady;
  const origList = storage.listKnowledgeObjects;
  const origGet = storage.getSourcesForVorgang;
  const origDecide = decisionsEngine.decideForUser;

  const oldIso = new Date(NOW - 200 * 864e5).toISOString(); // bewusst alt (kein Augment-Frischepfad)
  const pServer = { id: "u-lp", fullName: "Cem İnce", party: "Die Linke" };
  // Erwaehnungs-KO OHNE best_source_url — die echte URL liegt NUR in raw_documents.
  const koMentionNoBest = {
    ...base, id: "knb", vorgang_id: "vnb",
    display_title: "Cem İnce fordert Reform der Kommunalfinanzen",
    was_ist_passiert: "Bericht.", mentioned_people: ["Cem İnce"],
    updated_at: oldIso, created_at: oldIso
  };
  // Quarantaene-KO (Pfad B): kritischer Claim (Ruecktritt), nur unbekannte Quelle.
  const koQuarantine = {
    ...base, id: "kq", vorgang_id: "vq",
    display_title: "Rücktritt: Minister soll zurückgetreten sein",
    was_ist_passiert: "Unbestätigte Meldung.", parteien: ["Die Linke"],
    updated_at: oldIso, created_at: oldIso
  };

  let kosInStore = [];
  let docsByVorgang = {};
  try {
    storage.v3StoreReady = () => true;
    storage.listKnowledgeObjects = async () => kosInStore;
    storage.getSourcesForVorgang = async (vid) => docsByVorgang[vid] || [];
    const server = require("../server.js");

    // Pfad A: keine Decisions ('keine-treffer' VOR dem Hauptpfad).
    kosInStore = [koMentionNoBest];
    docsByVorgang = { vnb: [{ id: "dnb", url: "https://tagesschau.de/nachgeladen", source_type: "media", published_at: oldIso }] };
    decisionsEngine.decideForUser = () => [];
    const bA = await server.__buildV3Briefing(pServer, "u-lp", { slot: "daily" });
    const mA = ((bA.currentRadarState || {}).mentions || []);
    check("Leerpfad A (keine-treffer): Erwaehnung OHNE best_source_url bleibt via Nachladen sichtbar",
      bA.reason === "keine-treffer" && mA.length === 1 && mA[0].vorgangId === "vnb",
      JSON.stringify({ reason: bA.reason, mentions: mA.map((m) => m.vorgangId) }));
    check("Leerpfad A: Beleg-URL stammt aus den nachgeladenen raw_documents",
      mA.length === 1 && mA[0].sourceUrl === "https://tagesschau.de/nachgeladen");

    // Pfad B: Decisions vorhanden, aber ALLE in Quarantaene ('keine-treffer' NACH dem Hauptpfad).
    kosInStore = [koQuarantine, koMentionNoBest];
    docsByVorgang = {
      vnb: [{ id: "dnb", url: "https://tagesschau.de/nachgeladen", source_type: "media", published_at: oldIso }],
      vq: [{ id: "dq", url: "https://unbekanntes-portal.example/x", source_type: "media", published_at: oldIso }]
    };
    decisionsEngine.decideForUser = () => [{
      id: "dec-u-lp-kq", user_id: "u-lp", knowledge_object_id: "kq", vorgang_id: "vq",
      score: 60, decision: "Sofort reagieren", priority_type: "risk",
      matched_features: [{ type: "partei", value: "Die Linke" }], chance: "", risk: "", deadline: null, status: "new"
    }];
    const bB = await server.__buildV3Briefing(pServer, "u-lp", { slot: "daily" });
    const mB = ((bB.currentRadarState || {}).mentions || []);
    check("Leerpfad B (alle Quarantaene): Erwaehnung OHNE best_source_url bleibt via Nachladen sichtbar",
      bB.reason === "keine-treffer" && mB.length === 1 && mB[0].vorgangId === "vnb" &&
      mB[0].sourceUrl === "https://tagesschau.de/nachgeladen",
      JSON.stringify({ reason: bB.reason, mentions: mB.map((m) => m.vorgangId) }));
    check("Leerpfad B: der quarantaenierte Vorgang erscheint NIRGENDS im Radar",
      !JSON.stringify(bB.currentRadarState || {}).includes("vq"));

    // Kontrolle: ohne nachladbare Quellen (und ohne best_source_url) verschwindet die
    // Erwaehnung — der Test ist also wirklich sensitiv fuer das Nachladen.
    kosInStore = [koMentionNoBest];
    docsByVorgang = {};
    decisionsEngine.decideForUser = () => [];
    const bC = await server.__buildV3Briefing(pServer, "u-lp", { slot: "daily" });
    check("Kontrolle: ohne nachladbare Quelle UND ohne best_source_url keine Erwaehnung (nichts erfinden)",
      (((bC.currentRadarState || {}).mentions) || []).length === 0);
  } finally {
    storage.v3StoreReady = origReady;
    storage.listKnowledgeObjects = origList;
    storage.getSourcesForVorgang = origGet;
    decisionsEngine.decideForUser = origDecide;
  }

  console.log(`\n${passed}/${passed + failed} Radar-State-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
