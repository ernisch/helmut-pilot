"use strict";

// Helmut — Quellenarchitektur · Understanding-Gate (politische Vorpruefung VOR dem teuren,
// vollstaendigen KI-Understanding). REIN, DETERMINISTISCH, KEINE KI, kein Netz, kein Storage.
// =============================================================================================
// ZWECK: heute erzeugt JEDER neue Vorgangs-Cluster (nach vorgang_id-Dedup) einen vollen
// gpt-5-mini-Understanding-Call — nur gebremst durch einen BLINDEN Tages-Call-Deckel
// (verwirft nach Ankunftszeit, nicht nach Relevanz). Dieses Gate entscheidet je Dokument
// deterministisch, OB ein voller Understanding-Call ueberhaupt gerechtfertigt ist:
//
//   Reihenfolge (Auftrag Teil 4):
//   1) Hygiene: ungueltige/leere/extrem kurze/zu alte/unveraenderte Dokumente entfernen
//   2) globale Deduplizierung (gleicher Inhalt -> hoechstens EIN Understanding)
//   3) strukturierte amtliche Dokumente OHNE KI klassifizieren (PARDOK-Felder, document_type)
//   4) politische Relevanz aus Regeln + vorhandenen Metadaten (Institution/Ebene/Topic/Partei)
//   5) unsichere Grenzfaelle -> ZURUECKGESTELLT (optional spaeter ein GUENSTIGES Modell)
//   6) volles Understanding NUR fuer relevante Kandidaten
//
// GRUNDSAETZE (verbindlich):
//   - PROFIL-UNABHAENGIG: es wird NIE nach einem einzelnen Nutzerprofil gefiltert. Allgemein
//     wichtige Politik (Bundestag/Bundesrat/Landtage/Ministerien/Parteien/amtliche Vorgaenge)
//     bleibt IMMER erhalten.
//   - KEIN STILLES VERWERFEN: jede Ablehnung traegt einen nachvollziehbaren Grund. Unsichere
//     Dokumente werden NICHT geloescht, sondern 'zurueckgestellt'/'geparkt' (markiert).
//   - KEINE DOPPELTE KI: amtliche, strukturierte Felder werden NICHT erneut per KI extrahiert.
//
// Entscheidungen je Dokument (decision):
//   'verstehen'        -> voller Understanding-Call gerechtfertigt (relevant/amtlich)
//   'zurueckstellen'   -> Grenzfall; optional guenstiges Modell ODER Operator-Sichtung (markiert)
//   'parken'           -> kein politisches Signal; NICHT geloescht, nur nicht verstanden (Grund)
//   'unveraendert'     -> Inhalt bereits verstanden (content_hash bekannt) -> kein neuer Call
//   'hygiene'          -> ungueltig/leer/zu kurz -> raus (Grund)

const classification = require("./classification");

// Amtliche, strukturierte Dokumentarten (PARDOK/parldok + Bundestag-Drucksachen). Bei diesen ist
// die politische Relevanz GESETZT (parlamentarischer Vorgang) und die Struktur bereits geparst
// -> KEINE erneute KI-Extraktion der Struktur (Akzeptanzkriterium 4).
const OFFICIAL_DOC_TYPES = new Set([
  "kleine anfrage", "grosse anfrage", "anfrage", "antwort", "antrag", "entschliessungsantrag",
  "gesetzentwurf", "gesetz", "verordnung", "beschluss", "beschlussempfehlung",
  "beschlussempfehlung und bericht", "bericht", "unterrichtung", "drucksache",
  "plenarprotokoll", "ausschussprotokoll", "wahlvorschlag", "gvbl", "aenderungsantrag"
]);

// Politische Sachthemen (breit, ebenenneutral). Ein Treffer ist ein SCHWACHES bis mittleres
// Relevanzsignal — allein genuegt es fuer 'zurueckstellen', mit Institutions-/Partei-Signal fuer
// 'verstehen'. Bewusst allgemeinpolitisch, NICHT auf ein Profil zugeschnitten.
const POLICY_TOPICS = [
  "rente", "mindestlohn", "steuer", "migration", "asyl", "klima", "koalition", "haushalt",
  "tarifvertrag", "tarifverhandlung", "pflege", "buergergeld", "gesetzentwurf", "verordnung",
  "kleine anfrage", "mietendeckel", "wohngeld", "arbeitsmarkt", "krankenkasse", "gesundheit",
  "energie", "wohnen", "miete", "bildung", "digitalisierung", "verteidigung", "aussenpolitik",
  "wahl", "volksentscheid", "buergerentscheid", "kommunalwahl", "landtagswahl", "bundestagswahl"
];

// Parteien/Fraktionen (Nennung = Akteurssignal). Wortgrenzensicher gematcht.
const PARTY_TERMS = [
  "spd", "cdu", "csu", "gruene", "fdp", "afd", "die linke", "linke", "bsw", "fraktion",
  "koalition", "opposition"
];

function normText(s) { return classification.normText(s); }

function hasTermWordish(hay, term) {
  if (!term) return false;
  if (term.includes(" ")) return hay.includes(term);
  return new RegExp(`(^| )${term}( |$)`).test(hay);
}
function anyTerm(hay, terms) { return terms.some((t) => hasTermWordish(hay, t)); }

// Ein Roh-Dokument -> KO-artige Form fuer den vorhandenen, bewiesenen Deriver.
function toKoLike(doc = {}) {
  const loc = [];
  const hay = normText(`${doc.title || ""} ${doc.summary || ""}`);
  // Bundeslaender fuer die Ebenen-Ableitung als mentioned_locations anbieten (rein aus Titeltext).
  return { headline: doc.title || "", was_ist_passiert: doc.summary || "", mentioned_locations: loc, _hay: hay };
}

function ageDays(publishedAt, now) {
  if (!publishedAt) return null; // fehlendes Datum -> unbekannt (NICHT als zu alt behandeln)
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return null;
  return (now - t) / 86400000;
}

// Kern: EIN Dokument bewerten. Rueckgabe: { id, decision, reason, relevance, structured }.
function assessDocument(doc = {}, opts = {}) {
  const now = opts.now || 0;
  const minTitleLen = Number.isFinite(opts.minTitleLen) ? opts.minTitleLen : 12;
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : 45;
  const known = opts.knownContentHashes; // Set bereits verstandener content_hashes (optional)

  const id = doc.id || doc.content_hash || null;
  const title = String(doc.title || "").trim();
  const summary = String(doc.summary || "").trim();
  const base = { id, source_id: doc.source_id || null };

  // Amtlichkeit frueh bestimmen: amtliche Dokumente sind von der "zu-kurz"-Hygiene AUSGENOMMEN
  // (ihre Identitaet steckt in strukturierten Feldern, nicht in der Schlagzeile) — Kriterium 1.
  const dtype = normText(doc.document_type || "");
  const officialByType = Boolean(dtype && OFFICIAL_DOC_TYPES.has(dtype));
  const officialBySource = doc.source_authoritative === true || doc.source_category === "offiziell"
    || (doc.source_id && /(-plenum$|^be-plenum|^bb-plenum)/.test(String(doc.source_id)));
  const isOfficial = officialByType || Boolean(officialBySource);

  // 1) HYGIENE ---------------------------------------------------------------------------------
  if (!id || !doc.content_hash) return { ...base, decision: "hygiene", reason: "ungueltig-keine-id-oder-hash" };
  if (!title && !isOfficial) return { ...base, decision: "hygiene", reason: "leer-kein-titel" };
  if (!isOfficial && title.length < minTitleLen && summary.length < 20) return { ...base, decision: "hygiene", reason: "zu-kurz" };

  // 1b) UNVERAENDERT: Inhalt bereits verstanden -> kein neuer Call (kein Verwerfen).
  if (known && typeof known.has === "function" && known.has(doc.content_hash)) {
    return { ...base, decision: "unveraendert", reason: "content-hash-bereits-verstanden" };
  }

  // 3) AMTLICH/STRUKTURIERT: Relevanz gesetzt, Struktur ohne KI (keine doppelte KI-Extraktion) --
  if (isOfficial) {
    return {
      ...base, decision: "verstehen", reason: "amtlich-strukturiert",
      structured: true, // Struktur schon geparst -> Understanding OHNE erneute Feld-Extraktion
      relevance: { level: doc.politische_ebene || "amtlich", confidence: "high", signal: "amtliche-dokumentart" }
    };
  }

  // 1c) ZU ALT (nur fuer NICHT-amtliche) -------------------------------------------------------
  const a = ageDays(doc.published_at, now);
  const tooOld = a != null && a > maxAgeDays;

  // 4) POLITISCHE RELEVANZ aus Regeln + Metadaten ----------------------------------------------
  const koLike = toKoLike(doc);
  const hay = koLike._hay;
  const level = classification.deriveDecisionLevel(koLike); // bund/land/eu/unknown + confidence
  const hasInstitution = level.level !== "unknown"; // klares Institutions-/Ebenensignal
  const hasTopic = anyTerm(hay, POLICY_TOPICS.map(normText));
  const hasParty = anyTerm(hay, PARTY_TERMS.map(normText));

  const relevance = { level: level.level, confidence: level.confidence, signal: level.signal, hasTopic, hasParty };

  // Zu alt + kein starkes Signal -> parken (Grund zu-alt). Amtliches/Institutionelles ist oben
  // bereits durch (wird NIE wegen Alter verworfen).
  if (tooOld && !hasInstitution) return { ...base, decision: "parken", reason: "zu-alt", relevance };

  // Klares Institutions-/Ebenensignal ODER (Topic UND Partei) -> voller Understanding.
  if (hasInstitution || (hasTopic && hasParty)) {
    return { ...base, decision: "verstehen", reason: hasInstitution ? "institution-ebene" : "topic-und-partei", relevance };
  }
  // Genau EIN schwaches Signal (nur Topic ODER nur Partei) -> zurueckstellen (Grenzfall).
  if (hasTopic || hasParty) {
    return { ...base, decision: "zurueckstellen", reason: hasTopic ? "nur-topic" : "nur-partei", relevance };
  }
  // Kein politisches Signal -> parken (markiert, NICHT geloescht).
  return { ...base, decision: "parken", reason: "kein-politisches-signal", relevance };
}

// Ganze Liste bewerten + Aggregat. dedupe: gleicher content_hash -> nur EINMAL bewertet
// (globale Dedup, Akzeptanzkriterium 5: derselbe Inhalt hoechstens ein voller Call).
function gateDocuments(docs = [], opts = {}) {
  const seen = new Set();
  const perDoc = [];
  let duplicates = 0;
  for (const d of Array.isArray(docs) ? docs : []) {
    const h = d && d.content_hash;
    if (h && seen.has(h)) { duplicates += 1; continue; }
    if (h) seen.add(h);
    perDoc.push(assessDocument(d, opts));
  }
  const counts = perDoc.reduce((m, r) => { m[r.decision] = (m[r.decision] || 0) + 1; return m; }, {});
  const reasons = perDoc.reduce((m, r) => { const k = `${r.decision}:${r.reason}`; m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    eingang: Array.isArray(docs) ? docs.length : 0,
    dedupliziert: duplicates,
    bewertet: perDoc.length,
    verstehen: counts.verstehen || 0,
    zurueckstellen: counts.zurueckstellen || 0,
    parken: counts.parken || 0,
    unveraendert: counts.unveraendert || 0,
    hygiene: counts.hygiene || 0,
    counts, reasons, perDoc
  };
}

module.exports = {
  assessDocument, gateDocuments,
  OFFICIAL_DOC_TYPES, POLICY_TOPICS, PARTY_TERMS
};
