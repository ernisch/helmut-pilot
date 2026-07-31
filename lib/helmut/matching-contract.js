"use strict";

// Sprint 23B-1 — Datenvertrag der Matching-Auditpersistenz (Roadmap-Punkt 23).
//
// REIN OFFLINE: 0 Netz, 0 KI, 0 Datenbank, 0 Zufall, 0 Zeitstempel.
// Dieses Modul RECHNET KEIN MATCHING. Es definiert ausschliesslich, wie ein
// Matching-Lauf beschrieben, verglichen und stabil gespeichert wird:
//   * kanonische Serialisierung (stabile Schluesselreihenfolge)
//   * Eingabehash je Wissensobjekt (fuer das jeweilige Rezept)
//   * Eingabefingerabdruck eines Laufs (Idempotenzschluessel)
//   * deterministische Rangliste mit stabiler Tie-Break-Regel
//
// ALGORITHMUSUNABHAENGIG: Es gibt DREI getrennte Versionsachsen. Sie werden
// bewusst nicht zusammengefasst, weil sie sich unabhaengig aendern koennen:
//   engine_version  WER gerechnet hat        (Implementierung/Runner)
//   rezept_version  NACH WELCHER Regel       (Merkmale, Gewichte, Auswahl)
//   vektor_version  MIT WELCHER Darstellung  (Vektorart + Dimension)
// Eine spaetere Matching-Engine nutzt dieselben Funktionen mit eigenen
// Versionswerten; alte Ergebnisse bleiben dadurch dauerhaft unterscheidbar
// und werden nie ueberschrieben.
//
// SEMANTIK STRIKT GETRENNT: Dieses Modul kennt weder knowledge_object_embeddings
// noch den Embedding-Datenvertrag ko-kanon-1 (Sprint 22A/22C1). Semantische
// Duplikataehnlichkeit beantwortet „ist das derselbe Vorgang?", das Matching
// beantwortet „betrifft das dieses Mandat?". Beide duerfen sich nicht mischen —
// deshalb ist der Eingabehash hier eigenstaendig und traegt eine eigene
// Rezeptversion.

const crypto = require("crypto");

// Version des Audit-Datenvertrags selbst. Jede Aenderung an der kanonischen
// Serialisierung des Fingerabdrucks MUSS diese Version erhoehen — sonst
// wuerden alte und neue Fingerabdruecke faelschlich verglichen.
const AUDIT_SCHEMA_VERSION = "matching-audit-1";

// Versionswerte des HEUTIGEN produktiven Pfades (lib/helmut/matching.js).
// Der Rezeptname ist bewusst so gewaehlt, dass ein spaeteres semantisches
// Rezept davon auf den ersten Blick unterscheidbar ist.
const LEGACY_ENGINE_VERSION = "legacy-shadow-1";
//
// v1 -> v2 (Befund 27A-2, PR #185; Anhebung nachgezogen wegen Befund B25-2):
// Die Zulaessigkeitsregel fuer Ausschussbelege (`matching.ausschussBelegZulaessig`)
// entscheidet, WELCHE Merkmale ueberhaupt als Ausschussmitgliedschaft zaehlen. Sie
// wurde symmetrisch verschaerft: ein Bundesmandat erhaelt bei einem Wissensobjekt
// der Ebene `land`/`kommune` keinen Ausschussbeleg mehr. Dieselbe Eingabe erzeugt
// seither ein ANDERES Ergebnis (matched_features, Signale, Begruendung,
// Entscheidungsgewicht 34) — das ist per Definition dieser Achse eine Aenderung
// des Rezepts ("NACH WELCHER Regel: Merkmale, Gewichte, Auswahl").
//
// ABGRENZUNG zur Gegenentscheidung in docs/matching-nachvollziehbarkeit.md §36:
// dort ging es um die Erklaerungsabdeckung (Befund M-7, zu kleines Ladefenster).
// Das Rezept rechnete danach EXAKT wie vorher, es bekam nur seinen tatsaechlichen
// Eingang zu sehen — eine Anhebung waere dort eine falsche Aussage im
// Auditprotokoll gewesen. Hier ist es umgekehrt: die Regel selbst rechnet anders,
// und die Version NICHT anzuheben waere die falsche Aussage. Alte und neue
// Ergebnisse waeren in derselben Tabelle nicht mehr trennbar (§4.5 i).
//
// FOLGE (gewollt, freigabepflichtig): der Eingabefingerabdruck aendert sich fuer
// JEDEN Mandanten genau einmal -> der naechste regulaere Lauf rechnet neu und
// loest die vor dem Fix gerechneten Zeilen ab (Befund B25-2). Danach ist wieder
// alles idempotent. Nachweis: scripts/matching-rezeptversion-v2-test.js.
const LEGACY_RECIPE_VERSION = "legacy_relevance_v2";

// Vektorversion traegt die Dimension, weil eine Dimensionsaenderung die
// Aehnlichkeiten veraendert, ohne dass sich das Rezept aendern muesste.
function legacyVectorVersion(dim) {
  const n = Number(dim);
  return `feature-hash-${Number.isFinite(n) && n > 0 ? Math.floor(n) : 256}-v1`;
}

// Zulaessige Laufzustaende. BEWUSST NUR DREI (Sprint 23B-1, begruendet in
// docs/matching-nachvollziehbarkeit.md §14.2):
//   LAUFEND       gestartet, Ausgang unbekannt. Ein Absturz hinterlaesst genau
//                 diesen Zustand; er gilt NIE als aktuell und NIE als
//                 idempotenter Treffer. Damit deckt er den Fall „teilweise
//                 ausgefuehrt" vollstaendig ab — die Ergebnisprojektion wird
//                 in EINEM Bulk-Aufruf geschrieben, ein echter Teilzustand der
//                 Projektion existiert nicht.
//   VOLLSTAENDIG  abgeschlossen und fachlich unveraenderlich.
//   FEHLGESCHLAGEN mit dokumentiertem Fehler beendet.
// „uebersprungen"/„abgebrochen" erzeugen bewusst KEINE Zeile: wenn die Sperre
// gehalten wird oder der Eingang identisch ist, wurde nichts berechnet, was zu
// protokollieren waere. Das haelt die Tabelle frei von Leerlaufzeilen.
const RUN_STATUS = Object.freeze({
  LAUFEND: "laufend",
  VOLLSTAENDIG: "vollstaendig",
  FEHLGESCHLAGEN: "fehlgeschlagen"
});

const RUN_STATUS_VALUES = Object.freeze(Object.values(RUN_STATUS));

const AUSLOESER = Object.freeze(["crawl", "lage-check", "pipeline", "manuell", "test", "unbekannt"]);

// --- Stabile Bausteine -------------------------------------------------------

// Byte-stabiler Vergleich. BEWUSST NICHT localeCompare: dessen Ergebnis haengt
// von der Locale der Laufzeitumgebung ab und koennte denselben fachlichen
// Eingang in zwei Umgebungen unterschiedlich sortieren.
function compareIds(a, b) {
  const x = String(a == null ? "" : a);
  const y = String(b == null ? "" : b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

// Aehnlichkeit als stabile Zeichenkette. toFixed(4) entspricht der Rundung des
// produktiven Pfades (matching.round4) und vermeidet Float-Formatdrift
// (0.35250000000000004 vs. 0.3525). -0 faellt auf "0.0000".
function similarityKey(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  const s = n.toFixed(4);
  return s === "-0.0000" ? "0.0000" : s;
}

// Kanonische JSON-Serialisierung: Objektschluessel aufsteigend sortiert,
// Arrays in gegebener Reihenfolge, undefined/Funktionen entfallen, NaN/Infinity
// werden zu null. Erzeugt fuer denselben fachlichen Inhalt immer dieselbe
// Zeichenkette — unabhaengig davon, in welcher Reihenfolge die Felder gesetzt
// wurden.
function canonicalJson(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") return Number.isFinite(value) ? JSON.stringify(value === 0 ? 0 : value) : "null";
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (t === "undefined" || t === "function" || t === "symbol") return "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  if (t === "object") {
    const keys = Object.keys(value).filter((k) => {
      const v = value[k];
      return typeof v !== "undefined" && typeof v !== "function" && typeof v !== "symbol";
    }).sort(compareIds);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return "null";
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text == null ? "" : text)).digest("hex");
}

// --- Eingabehash je Wissensobjekt -------------------------------------------
// Gehasht wird GENAU DAS, was das Rezept tatsaechlich als Eingang verwendet —
// bei legacy_relevance_v1 also die gewichteten Merkmalstoken. Das hat zwei
// gewollte Folgen:
//   * Eine Aenderung OHNE fachlichen Einfluss (Umsortierung, Dublette, ein
//     Feld, das gar nicht in das Rezept eingeht) erzeugt KEINEN neuen Hash.
//   * Eine Aenderung MIT fachlichem Einfluss erzeugt zwingend einen neuen Hash.
// Ein anderes Rezept uebergibt seine eigenen Token und seine eigene
// Rezeptversion — die Funktion trifft keine Annahme ueber das Verfahren.
function computeKnowledgeObjectInputHash(weightedTokens, recipeVersion) {
  const list = Array.isArray(weightedTokens) ? weightedTokens : [];
  const normalized = [...new Set(
    list
      .filter((wt) => wt && wt.token)
      .map((wt) => `${String(wt.token)}#${Number(wt.weight) || 0}`)
  )].sort(compareIds);
  return sha256Hex(`${String(recipeVersion || "")}\n${normalized.join("\n")}`);
}

// --- Schwellenwerte ----------------------------------------------------------
// Kompakte, ehrliche Konfiguration statt einer erfundenen „Schwellenwertversion".
// Im heutigen Produktionspfad existiert KEIN Schwellenwert: die RPC liefert die
// Top-N unbedingt (Sprint 23A §4.4). `schwelle: null` sagt genau das.
function normalizeThresholds(input = {}) {
  const matchCount = Number(input.matchCount);
  const schwelle = input.schwelle == null || input.schwelle === "" ? null : Number(input.schwelle);
  const filter = input.filter && typeof input.filter === "object" && !Array.isArray(input.filter)
    ? input.filter
    : {};
  const normFilter = {};
  for (const key of Object.keys(filter).sort(compareIds)) {
    const v = filter[key];
    if (Array.isArray(v)) {
      const vals = [...new Set(v.map((x) => String(x == null ? "" : x)).filter(Boolean))].sort(compareIds);
      if (vals.length) normFilter[key] = vals;
    } else if (v != null && v !== "") {
      normFilter[key] = String(v);
    }
  }
  return {
    match_count: Number.isFinite(matchCount) && matchCount > 0 ? Math.floor(matchCount) : null,
    schwelle: Number.isFinite(schwelle) ? schwelle : null,
    filter: normFilter
  };
}

// --- Kompakte Rangliste ------------------------------------------------------
// Ein Eintrag traegt nur, was fuer die Nachvollziehbarkeit noetig ist:
// Kennungen, Rang, Aehnlichkeit, die belegten Signale, der Eingangszustand des
// Wissensobjekts und die deterministische Kurzbegruendung.
// KEINE Artikeltexte, KEINE Vektoren, KEINE Profilkopien, KEINE verworfenen
// Kandidaten (die RPC liefert keine — es gaebe nichts Belegtes zu speichern).
function normalizeRankingEntry(entry = {}) {
  const out = {
    ko_id: entry.knowledge_object_id != null ? String(entry.knowledge_object_id) : null,
    vorgang_id: entry.vorgang_id != null ? String(entry.vorgang_id) : null,
    result_id: entry.result_id != null ? String(entry.result_id) : null,
    rank: Number.isFinite(Number(entry.rank)) ? Math.floor(Number(entry.rank)) : null,
    similarity: Number.isFinite(Number(entry.similarity)) ? Number(entry.similarity) : null,
    ko_eingabe_hash: entry.ko_eingabe_hash ? String(entry.ko_eingabe_hash) : null,
    ko_version: Number.isFinite(Number(entry.ko_version)) ? Math.floor(Number(entry.ko_version)) : null,
    signale: entry.signale && typeof entry.signale === "object" && !Array.isArray(entry.signale)
      ? entry.signale
      : {},
    begruendung: entry.begruendung ? String(entry.begruendung) : null
  };
  return out;
}

// Deterministische Speicherreihenfolge.
//
// WICHTIG: Diese Regel veraendert das Produkt-Ranking NICHT. Der ausgelieferte
// Rang steht unveraendert in matching_results.rank und entsteht weiterhin
// ausschliesslich im Matching selbst. Hier wird nur festgelegt, in welcher
// REIHENFOLGE die bereits vergebenen Raenge gespeichert werden, damit zwei
// Laeufe mit identischem fachlichem Ergebnis ein byte-identisches jsonb
// erzeugen (und der Fingerabdruckvergleich nicht an einer Umsortierung
// scheitert).
//
// Regel: rank aufsteigend, bei gleichem/fehlendem Rang Aehnlichkeit absteigend,
// dann knowledge_object_id byte-stabil aufsteigend. Traegt kein Eintrag einen
// Rang (moeglicher Fall einer kuenftigen Engine), wird nach Aehnlichkeit
// sortiert und der Rang abgeleitet — dann ist die Rangliste die einzige
// Ordnungsquelle.
function buildRanking(entries = []) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && (e.knowledge_object_id != null || e.ko_id != null))
    .map((e) => normalizeRankingEntry(e.knowledge_object_id != null ? e : { ...e, knowledge_object_id: e.ko_id }));

  const hatRaenge = list.length > 0 && list.every((e) => e.rank != null);

  list.sort((a, b) => {
    if (hatRaenge && a.rank !== b.rank) return a.rank - b.rank;
    const sa = a.similarity == null ? -Infinity : a.similarity;
    const sb = b.similarity == null ? -Infinity : b.similarity;
    if (sa !== sb) return sb - sa;
    return compareIds(a.ko_id, b.ko_id);
  });

  if (!hatRaenge) list.forEach((e, i) => { e.rank = i + 1; });
  return list;
}

// Hash ueber die Kandidaten-/Wissensobjektmenge eines Laufs.
// Jeder Eintrag traegt Kennung, Aehnlichkeit und Eingabehash:
//   * die Aehnlichkeit erkennt jede Aenderung am Wissensobjekt, die das
//     Ergebnis beeinflusst — auch dann, wenn das Objekt selbst nicht geladen
//     werden konnte und deshalb kein Eingabehash vorliegt;
//   * der Eingabehash erkennt zusaetzlich Merkmalsaenderungen, die sich (noch)
//     nicht in der Aehnlichkeit niederschlagen.
// Sortiert nach Kennung -> die EINGABEREIHENFOLGE ist ohne Einfluss.
function computeCandidateSetHash(entries = [], recipeVersion) {
  const teile = (Array.isArray(entries) ? entries : [])
    .map((e) => {
      const id = e && (e.ko_id != null ? e.ko_id : e.knowledge_object_id);
      return `${String(id == null ? "" : id)}|${similarityKey(e && e.similarity)}|${(e && e.ko_eingabe_hash) || "-"}`;
    })
    .sort(compareIds);
  return sha256Hex(`${String(recipeVersion || "")}\n${teile.join("\n")}`);
}

// --- Eingabefingerabdruck ----------------------------------------------------
// Der Idempotenzschluessel eines Laufs. Er beantwortet genau eine Frage:
// „Ist das fachlich derselbe Eingang wie beim letzten vollstaendigen Lauf?"
//
// Enthalten (alles deterministisch):
//   Vertragsversion · Mandant · Mandatsprofil · Profilhash ·
//   Engine-/Rezept-/Vektorversion · Schwellenwerte + Filterkonfiguration ·
//   Kandidatenmenge (sortiert, mit Aehnlichkeit und Eingabehash je Objekt)
//
// NICHT enthalten (bewusst): Lauf-ID, Zeitstempel, Ausloeser, Zaehler,
// Pipeline-Laufkennung, Eingabereihenfolge. Ein zweiter Lauf mit demselben
// fachlichen Eingang erzeugt deshalb denselben Fingerabdruck.
function computeInputFingerprint(descriptor = {}) {
  const kandidatenHash = descriptor.kandidatenHash
    || computeCandidateSetHash(descriptor.ranking || [], descriptor.recipeVersion);

  const kanon = {
    schema: AUDIT_SCHEMA_VERSION,
    tenant: String(descriptor.tenantId == null ? "" : descriptor.tenantId),
    profil: String(descriptor.mandateProfileId == null ? descriptor.tenantId || "" : descriptor.mandateProfileId),
    profil_hash: String(descriptor.profileHash == null ? "" : descriptor.profileHash),
    engine: String(descriptor.engineVersion == null ? "" : descriptor.engineVersion),
    rezept: String(descriptor.recipeVersion == null ? "" : descriptor.recipeVersion),
    vektor: String(descriptor.vectorVersion == null ? "" : descriptor.vectorVersion),
    schwellenwerte: normalizeThresholds(descriptor.thresholds || {}),
    kandidaten_hash: kandidatenHash
  };
  return { fingerprint: sha256Hex(canonicalJson(kanon)), kandidatenHash, kanon };
}

// --- Laufbeschreibung --------------------------------------------------------
// Vollstaendige, algorithmusunabhaengige Beschreibung eines Laufs. Prueft die
// Pflichtfelder hart — ein Lauf ohne Mandant, Profil oder Versionsangabe ist
// nicht auditierbar und wird abgelehnt statt still unvollstaendig gespeichert.
function describeRun(input = {}) {
  const fehlt = [];
  const tenantId = input.tenantId == null ? "" : String(input.tenantId).trim();
  const mandateProfileId = input.mandateProfileId == null || String(input.mandateProfileId).trim() === ""
    ? tenantId
    : String(input.mandateProfileId).trim();
  if (!tenantId) fehlt.push("tenantId");
  if (!mandateProfileId) fehlt.push("mandateProfileId");
  if (!input.profileHash) fehlt.push("profileHash");
  if (!input.engineVersion) fehlt.push("engineVersion");
  if (!input.recipeVersion) fehlt.push("recipeVersion");
  if (!input.vectorVersion) fehlt.push("vectorVersion");
  if (fehlt.length) {
    const err = new Error(`matching-contract: unvollstaendige Laufbeschreibung (${fehlt.join(", ")})`);
    err.code = "AUDIT_DESCRIPTOR_INCOMPLETE";
    err.missing = fehlt;
    throw err;
  }

  const ausloeser = AUSLOESER.includes(String(input.ausloeser)) ? String(input.ausloeser) : "unbekannt";
  const ranking = buildRanking(input.ranking || []);
  const thresholds = normalizeThresholds(input.thresholds || {});
  const { fingerprint, kandidatenHash } = computeInputFingerprint({
    tenantId,
    mandateProfileId,
    profileHash: input.profileHash,
    engineVersion: input.engineVersion,
    recipeVersion: input.recipeVersion,
    vectorVersion: input.vectorVersion,
    thresholds,
    ranking
  });

  return {
    tenantId,
    mandateProfileId,
    pipelineRunId: input.pipelineRunId == null ? null : String(input.pipelineRunId),
    ausloeser,
    engineVersion: String(input.engineVersion),
    recipeVersion: String(input.recipeVersion),
    vectorVersion: String(input.vectorVersion),
    profileHash: String(input.profileHash),
    thresholds,
    ranking,
    kandidatenHash,
    fingerprint,
    kandidaten: Number.isFinite(Number(input.kandidaten)) ? Math.floor(Number(input.kandidaten)) : ranking.length,
    berechnet: ranking.length
  };
}

module.exports = {
  AUDIT_SCHEMA_VERSION,
  LEGACY_ENGINE_VERSION,
  LEGACY_RECIPE_VERSION,
  RUN_STATUS,
  RUN_STATUS_VALUES,
  AUSLOESER,
  legacyVectorVersion,
  compareIds,
  similarityKey,
  canonicalJson,
  sha256Hex,
  computeKnowledgeObjectInputHash,
  normalizeThresholds,
  buildRanking,
  computeCandidateSetHash,
  computeInputFingerprint,
  describeRun
};
