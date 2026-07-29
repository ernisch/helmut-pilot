"use strict";

// Helmut — Quellenarchitektur · Understanding-Gate (politische Vorpruefung VOR dem teuren,
// vollstaendigen KI-Understanding). REIN, DETERMINISTISCH, KEINE KI, kein Netz, kein Storage.
// =============================================================================================
// ZWECK: heute erzeugt JEDER neue Vorgangs-Cluster (nach vorgang_id-Dedup) einen vollen
// gpt-5-mini-Understanding-Call — nur gebremst durch einen BLINDEN Tages-Call-Deckel (verwirft
// nach Ankunftszeit, nicht nach Relevanz). Dieses Gate entscheidet je Dokument deterministisch,
// OB ein voller Understanding-Call ueberhaupt gerechtfertigt ist.
//
// Reihenfolge (Auftrag): 1) Hygiene  2) globale Dedup  3) amtlich/strukturiert OHNE KI
//   4) politische Relevanz (Regeln + Metadaten + QUELLEN-TIER)  5) Grenzfall -> zurueckstellen
//   6) volles Understanding nur fuer relevante Kandidaten.
//
// QUELLEN-TIER (zentral, aus der REALEN Gegenpruefung gegen Production abgeleitet):
//   'amtlich'   -> parlamentarische/amtliche Quelle oder amtliche Dokumentart -> IMMER verstehen,
//                  Struktur ohne KI (keine doppelte Extraktion).
//   'kuratiert' -> von der Quellenarchitektur um einen politischen Prozess/Ausschuss kuratierter
//                  Feed (Ausschuss-/Vorhaben-/Prozess-/Ministeriums-Feeds). Diese Feeds sind per
//                  KONSTRUKTION politisch -> ein Dokument daraus wird NIE geparkt (mind.
//                  zurueckgestellt). Das behebt die real gemessene Hauptfehlerquelle (kuratierte
//                  Vorgaenge wurden faelschlich geparkt).
//   'medien'    -> generischer Politik-/Regional-/Google-News-Feed (gemischter Inhalt: Politik +
//                  Boulevard/Boerse/Lokales) -> Keyword-Relevanzfilter; ohne Signal -> parken.
//
// GRUNDSAETZE: PROFIL-UNABHAENGIG (nie nach einem einzelnen Nutzerprofil filtern; allgemein
// wichtige Politik bleibt erhalten). KEIN STILLES VERWERFEN (jede Ablehnung mit Grund; Unsicheres
// wird 'zurueckgestellt'/'geparkt', NICHT geloescht). KEINE DOPPELTE KI fuer amtliche Struktur.
//
// Entscheidungen: 'verstehen' | 'zurueckstellen' | 'parken' | 'unveraendert' | 'hygiene' (je Grund).

const classification = require("./classification");
// Deployment-Flags (env > helmut-flags.json > Default). Injizierte Test-Envs bleiben hermetisch
// (Datei-Flags wirken nur auf die echte Prozessumgebung) — siehe lib/helmut/flags.js.
const { flagValue } = require("../flags");

// Amtliche, strukturierte Dokumentarten (PARDOK/parldok + Bundestag-Drucksachen). Relevanz gesetzt,
// Struktur bereits geparst -> keine erneute KI-Extraktion (Akzeptanzkriterium 4).
const OFFICIAL_DOC_TYPES = new Set([
  "kleine anfrage", "grosse anfrage", "anfrage", "antwort", "antrag", "entschliessungsantrag",
  "aenderungsantrag", "gesetzentwurf", "gesetz", "verordnung", "beschluss", "beschlussempfehlung",
  "beschlussempfehlung und bericht", "bericht", "unterrichtung", "drucksache",
  "plenarprotokoll", "ausschussprotokoll", "wahlvorschlag", "gvbl",
  "gesetz und verordnungsblatt", "gesetz- und verordnungsblatt"
]);

// Roadmap-Punkt 24: drei REAL beobachtete Landesparlaments-Dokumenttypen, die in der Liste oben
// fehlten. Die Luecke bei "Schriftliche Anfrage" war die gravierendste — das wichtigste Instrument
// des Berliner Abgeordnetenhauses fiel aus der amtlichen Erkennung in den Stichwort-/Alterspfad
// (gemessen: `parken`, Grund `zu-alt`).
//
// BEWUSST NICHT GLOBAL: die aktive DIP-Bundestagsquelle setzt `document_type` aus der API
// (`scheduler.js` -> `dip.js`: drucksachetyp/dokumentart). Welche Werte dieses Vokabular
// vollstaendig enthaelt, ist aus einer Offline-Sitzung NICHT pruefbar, und eine Production-Abfrage
// ist nicht freigegeben. Ein zusaetzlicher Treffer wuerde dort `zurueckstellen` -> `verstehen`
// verschieben und damit einen zusaetzlichen KI-Aufruf kosten. Deshalb greifen diese drei Typen
// AUSSCHLIESSLICH fuer Dokumente, die sich selbst als Landesebene ausweisen. Fuer den Bund ist die
// Aenderung damit strukturell wirkungslos, nicht nur empirisch.
const LANDESPARLAMENT_DOC_TYPES = new Set([
  "schriftliche anfrage", "behandlung im plenum", "ausschussberatung"
]);
// Landesmodul-Abrufwege tragen den Praefix `be-`/`bb-` (seeds/landesmodule-quellen.js).
const LAND_SOURCE_RE = /^(be|bb)-/i;
function istLandesdokument(doc = {}) {
  if (String(doc.politische_ebene || "").toLowerCase() === "land") return true;
  const herkunft = String(doc.herkunft || "").toUpperCase();
  if (herkunft === "BLN" || herkunft === "BRA") return true;
  return LAND_SOURCE_RE.test(String(doc.source_id || ""));
}

// Institutions-/Rollen-Signale (breit — real gemessen als noetig: viele echte Vorgaenge nennen
// generisch "Ministerium/Minister/Regierung/Reform" statt "Bundestag"). Wortgrenzensicher fuer
// kurze Einzelbegriffe (eu).
const INSTITUTION_TERMS = [
  "bundestag", "bundesregierung", "bundesrat", "bundeskabinett", "bundeskanzler", "kanzler",
  "kanzlerin", "landtag", "abgeordnetenhaus", "senat", "landesregierung", "staatskanzlei",
  "senatsverwaltung", "ministerium", "minister", "ministerin", "ministerpraesident",
  "ministerpräsident", "staatssekretaer", "staatssekretär", "senator", "senatorin", "fraktion",
  "ausschuss", "parlament", "abgeordnete", "koalition", "kabinett", "regierung", "behoerde",
  "behörde", "kommission", "europaeische union", "europäische union", "europaeische kommission",
  "europäische kommission", "eu-kommission", "europaeisches parlament", "europäisches parlament",
  "bruessel", "brüssel", "europarat"
];

// Politische Sachthemen + Legislativ-/Handlungsbegriffe (breit). Ein Treffer allein = schwaches
// bis mittleres Signal (mit Institution/Partei -> verstehen; sonst -> zurueckstellen).
const POLICY_TOPICS = [
  "gesetz", "reform", "novelle", "entwurf", "referentenentwurf", "richtlinie", "verordnung",
  "beschluss", "verabschiedet", "eckpunkte", "rente", "mindestlohn", "steuer", "migration", "asyl",
  "integration", "klima", "umwelt", "energie", "haushalt", "schuldenbremse", "tarif", "pflege",
  "buergergeld", "bürgergeld", "wohngeld", "bafoeg", "bafög", "gkv", "krankengeld",
  "krankenversicherung", "krankenkasse", "gesundheit", "sozial", "datenschutz", "elterngeld",
  "teilhabe", "behinderten", "barrierefrei", "sgb", "wehrpflicht", "cannabis", "heizung", "waerme",
  "wärme", "verkehr", "bildung", "digital", "sicherheit", "verteidigung", "wohnen", "miete",
  "petition", "demo", "demonstration", "streik", "wahl", "volksentscheid", "buergerentscheid"
];

// Parteien/Fraktionen (Nennung = Akteurssignal).
const PARTY_TERMS = [
  "spd", "cdu", "csu", "gruene", "grüne", "gruenen", "grünen", "fdp", "afd", "die linke", "bsw",
  "fraktion", "koalition", "opposition"
];

// Kuratierte STRUKTUR-/PROZESS-Feed-Muster (Quellenarchitektur-Namenskonvention). Ein Dokument aus
// einem solchen Feed ist per Konstruktion politisch -> nie parken. NICHT profil-spezifisch: das
// sind strukturelle Praefixe der Abrufwege, kein einzelnes Mandat.
const CURATED_SOURCE_RE = /(-plenum$|^general-|^process-|^bundle-|committee-|bmas|dip|drucksache|eckpunkte|anhoerung|-vorhaben|ministerium|bundesregierung|bundeskabinett|fraktion)/i;
// Amtliche/parlamentarische Quellen (Tier 'amtlich').
const OFFICIAL_SOURCE_RE = /(-plenum$)/i;

function normText(s) { return classification.normText(s); }
// Kosten-Gate-Semantik: SUBSTRING-Match fuer laengere Begriffe (deutsche Komposita —
// Umwelt+ministerium, Datenschutz+reform, Renten+paket), WORTGRENZE nur fuer kurze/mehrdeutige
// Akronyme (<=3: eu/spd/cdu/…), damit "eu" nicht in "heute" matcht. Falsch-positiv (etwas mehr
// Kosten) ist sicher, Falsch-negativ (geparktes relevantes Dokument) ist der kritische Fehler.
function hasTermWordish(hay, term) {
  if (!term) return false;
  if (term.length <= 3 && !term.includes(" ")) return new RegExp(`(^| )${term}( |$)`).test(hay);
  return hay.includes(term);
}
function anyTerm(hay, terms) { return terms.some((t) => hasTermWordish(hay, t)); }

// Quellen-Tier bestimmen. Bevorzugt explizite Felder (source_authoritative/source_category), sonst
// Heuristik ueber source_id-Muster (real validiert).
function sourceTier(doc = {}) {
  const cat = String(doc.source_category || "").toLowerCase();
  const sid = String(doc.source_id || "");
  if (doc.source_authoritative === true || cat === "offiziell" || OFFICIAL_SOURCE_RE.test(sid)) return "amtlich";
  if (cat === "partei_fraktion" || cat === "kuratiert" || cat === "prozess" || CURATED_SOURCE_RE.test(sid)) return "kuratiert";
  return "medien";
}

function ageDays(publishedAt, now) {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) ? (now - t) / 86400000 : null;
}

// EIN Dokument bewerten -> { id, decision, reason, tier, relevance, structured }.
function assessDocument(doc, opts = {}) {
  if (!doc || typeof doc !== "object") return { id: null, source_id: null, tier: "medien", decision: "hygiene", reason: "ungueltig-kein-objekt" };
  const now = opts.now || 0;
  const minTitleLen = Number.isFinite(opts.minTitleLen) ? opts.minTitleLen : 12;
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : 60;
  const known = opts.knownContentHashes;

  const id = doc.id || doc.content_hash || null;
  const title = String(doc.title || "").trim();
  const summary = String(doc.summary || "").trim();
  const tier = sourceTier(doc);
  const dtype = normText(doc.document_type || "");
  const officialByType = Boolean(dtype && (OFFICIAL_DOC_TYPES.has(dtype)
    || (LANDESPARLAMENT_DOC_TYPES.has(dtype) && istLandesdokument(doc))));
  const isAmtlich = tier === "amtlich" || officialByType;
  const base = { id, source_id: doc.source_id || null, tier };

  // 1) HYGIENE — amtliche Dokumente sind von leer/zu-kurz AUSGENOMMEN (Identitaet in Struktur).
  if (!id || !doc.content_hash) return { ...base, decision: "hygiene", reason: "ungueltig-keine-id-oder-hash" };
  if (!isAmtlich && !title) return { ...base, decision: "hygiene", reason: "leer-kein-titel" };
  if (!isAmtlich && title.length < minTitleLen && summary.length < 20) return { ...base, decision: "hygiene", reason: "zu-kurz" };

  // 1b) UNVERAENDERT: Inhalt bereits verstanden -> kein neuer Call.
  if (known && typeof known.has === "function" && known.has(doc.content_hash)) {
    return { ...base, decision: "unveraendert", reason: "content-hash-bereits-verstanden" };
  }

  // 3) AMTLICH/STRUKTURIERT: Relevanz gesetzt, keine doppelte KI-Extraktion.
  if (isAmtlich) {
    return {
      ...base, decision: "verstehen", reason: officialByType ? "amtliche-dokumentart" : "amtliche-quelle",
      structured: true,
      relevance: { level: doc.politische_ebene || "amtlich", confidence: "high", signal: "amtlich" }
    };
  }

  // 4) POLITISCHE RELEVANZ aus Regeln + Metadaten -------------------------------------------
  const hay = normText(`${title} ${summary}`);
  const level = classification.deriveDecisionLevel({ headline: title, was_ist_passiert: summary, mentioned_locations: [] });
  const hasInstitution = anyTerm(hay, INSTITUTION_TERMS.map(normText)) || level.level !== "unknown";
  const hasTopic = anyTerm(hay, POLICY_TOPICS.map(normText));
  const hasParty = anyTerm(hay, PARTY_TERMS.map(normText));
  const relevance = { level: level.level, confidence: level.confidence, signal: level.signal, hasInstitution, hasTopic, hasParty };
  const a = ageDays(doc.published_at, now);
  const tooOld = a != null && a > maxAgeDays;

  // Klares Institutions-/Ebenensignal ODER (Topic UND Partei) -> voller Understanding.
  if (hasInstitution || (hasTopic && hasParty)) {
    return { ...base, decision: "verstehen", reason: hasInstitution ? "institution-ebene" : "topic-und-partei", relevance };
  }
  // Kuratierter Prozess-/Ausschuss-Feed -> NIE parken (per Konstruktion politisch) -> zurueckstellen.
  if (tier === "kuratiert") return { ...base, decision: "zurueckstellen", reason: "kuratierte-quelle-ohne-keyword", relevance };
  // Zu alt (generischer Medien-Feed, kein Signal) -> parken.
  if (tooOld) return { ...base, decision: "parken", reason: "zu-alt", relevance };
  // Genau EIN schwaches Signal -> zurueckstellen (Grenzfall).
  if (hasTopic || hasParty) return { ...base, decision: "zurueckstellen", reason: hasTopic ? "nur-topic" : "nur-partei", relevance };
  // Generischer Medien-Feed ohne jedes politische Signal -> parken (markiert, nicht geloescht).
  return { ...base, decision: "parken", reason: "kein-politisches-signal", relevance };
}

// Ganze Liste bewerten + Aggregat. dedupe: gleicher content_hash -> nur EINMAL bewertet (Krit. 5).
function gateDocuments(docs = [], opts = {}) {
  const seen = new Set();
  const perDoc = [];
  let duplicates = 0, ungueltig = 0;
  for (const d of Array.isArray(docs) ? docs : []) {
    if (!d || typeof d !== "object") { ungueltig += 1; continue; } // Resilienz: kaputter Eintrag killt den Batch nicht
    const h = d.content_hash;
    if (h && seen.has(h)) { duplicates += 1; continue; }
    if (h) seen.add(h);
    perDoc.push(assessDocument(d, opts));
  }
  const counts = perDoc.reduce((m, r) => { m[r.decision] = (m[r.decision] || 0) + 1; return m; }, {});
  const reasons = perDoc.reduce((m, r) => { const k = `${r.decision}:${r.reason}`; m[k] = (m[k] || 0) + 1; return m; }, {});
  const tiers = perDoc.reduce((m, r) => { m[r.tier] = (m[r.tier] || 0) + 1; return m; }, {});
  return {
    eingang: Array.isArray(docs) ? docs.length : 0, dedupliziert: duplicates, ungueltig, bewertet: perDoc.length,
    verstehen: counts.verstehen || 0, zurueckstellen: counts.zurueckstellen || 0, parken: counts.parken || 0,
    unveraendert: counts.unveraendert || 0, hygiene: counts.hygiene || 0,
    counts, reasons, tiers, perDoc
  };
}

// Feature-Guard-Modus. Default 'off' (byte-identisches Altverhalten). 'shadow' = Entscheidung
// berechnen + protokollieren, aber NICHT blockieren. 'on' = spaeterer echter Vorfilter — hier
// bewusst NICHT aktivierbar: der Reader gibt 'on' zurueck, aber die Integration blockiert nur bei
// 'on' UND einem separaten, spaeter freizugebenden Arm-Schritt (siehe understanding.js).
function gateMode(env = process.env) {
  const raw = String(flagValue("HELMUT_UNDERSTANDING_GATE", env) || "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "on" || raw === "live" || raw === "active") return "on";
  return "off";
}

// Cluster-Ebenen-Entscheidung: ein Cluster ist 'verstehen', sobald EIN Dokument 'verstehen' ist;
// sonst 'zurueckstellen' bei >=1 Grenzfall; sonst 'parken'. Spiegelt die reale Pipeline (1 Call
// pro Cluster). Rein, kein Seiteneffekt.
function assessCluster(documents = [], opts = {}) {
  const perDoc = (Array.isArray(documents) ? documents : []).map((d) => assessDocument(d, opts));
  const has = (dec) => perDoc.some((r) => r.decision === dec);
  const decision = has("verstehen") ? "verstehen" : (has("zurueckstellen") ? "zurueckstellen" : (perDoc.length ? "parken" : "parken"));
  return { decision, docs: perDoc.length, verstehen: perDoc.filter((r) => r.decision === "verstehen").length, perDoc };
}

module.exports = {
  assessDocument, assessCluster, gateDocuments, sourceTier, gateMode,
  OFFICIAL_DOC_TYPES, LANDESPARLAMENT_DOC_TYPES, istLandesdokument,
  POLICY_TOPICS, PARTY_TERMS, INSTITUTION_TERMS, CURATED_SOURCE_RE
};
