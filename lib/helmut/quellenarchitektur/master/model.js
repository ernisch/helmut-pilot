"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Kernmodell (Phase 4 + Phase 5).
//
// Reine Logik. KEINE KI, kein Netz, kein Storage-Write. Additiv: NICHTS hier ist in
// Scheduler/Server verdrahtet; die bestehende Produktionslogik bleibt unveraendert.
//
// Zentrale Architekturentscheidung (Auftrag): der Master Quellenkatalog ist GLOBAL.
// Eine Quelle wird nur EINMAL kanonisch gespeichert. Dieses Modul trennt die im Ist-
// Zustand teils verschmolzenen acht Belange sauber und liefert dafuer die Enums,
// das Attributschema, den kanonischen Dedup-Schluessel und die Zustandsmaschine der
// Importstrecke.
//
// Die ACHT strikt getrennten Belange (Auftrag "Zentrale Architekturentscheidung"):
//   1 globale Quelle · 2 technischer Abrufweg · 3 inhaltliche Klassifikation ·
//   4 mandatsbezogene Zuweisung · 5 Laufzeitgesundheit · 6 mandantenspezifische Relevanz ·
//   7 manuelle Korrekturen · 8 Audit und Herkunft.
// Dieses Modul deckt 1/2/3/8 (Quellenrecord + Herkunft/Prüfung) ab; 4 liegt in
// assignment.js, 5 in health.js, 6/7 in tenant-scope.js.

const crypto = require("crypto");
const base = require("../model"); // Wiederverwendung statt Parallelmodell
const taxonomy = require("./taxonomy");

const CONCERNS = Object.freeze([
  "global_source", "retrieval_path", "classification", "mandate_assignment",
  "runtime_health", "tenant_relevance", "manual_correction", "audit_provenance"
]);

// --- Phase 5: Zustaende der Importstrecke (12 Stufen, Auftrag Phase 5) -----------------------
// Reihenfolge = die 12 Punkte des Auftrags. Keine Quelle darf direkt von 'discovered' auf
// 'active' springen (Test §16 + Abnahme). Unklare/widerspruechliche Quellen brauchen Review.
const INTAKE_STATES = Object.freeze([
  "discovered",          // 1  entdeckt
  "normalized",          // 2  normalisiert (URL/Herausgeber kanonisiert)
  "duplicate_candidate", // 3  als moegliches Duplikat markiert (Review noetig)
  "technically_checked", // 4  technisch geprueft (Abrufweg erreichbar/plausibel)
  "classified",          // 5  inhaltlich klassifiziert (Typ/Ebene/Entitaeten/Themen)
  "legally_checked",     // 6  rechtlich geprueft (Lizenz/Nutzung/Datenschutz)
  "released",            // 7  freigegeben (verantwortliche Freigabe erteilt)
  "active",              // 8  aktiv (im Katalog nutzbar)
  "restricted",          // 9  eingeschraenkt (nur teilweise nutzbar)
  "quarantined",         // 10 quarantaenisiert (gesperrt, Review noetig)
  "superseded",          // 11 ersetzt (durch bessere/kanonische Quelle abgeloest)
  "archived"             // 12 archiviert (endgueltig stillgelegt, Historie erhalten)
]);

// Terminal-/aktive Endzustaende, in denen eine Quelle real ausgeliefert werden darf.
const SERVEABLE_STATES = Object.freeze(["active", "restricted"]);
// Zustaende, die eine Freigabe bereits durchlaufen haben.
const RELEASED_OR_LATER = Object.freeze(["released", "active", "restricted", "superseded", "archived"]);
// Zustaende, die menschliches Review erfordern.
const REVIEW_REQUIRED_STATES = Object.freeze(["duplicate_candidate", "quarantined"]);

// Erlaubte Uebergaenge (gerichteter Graph). BEWUSST kein direkter Sprung entdeckt->aktiv.
// Rueckwege sind erlaubt, wo sie einen realen Betriebsvorgang abbilden (z. B. active->restricted).
const INTAKE_TRANSITIONS = Object.freeze({
  discovered: ["normalized", "duplicate_candidate", "quarantined", "archived"],
  normalized: ["duplicate_candidate", "technically_checked", "quarantined", "archived"],
  duplicate_candidate: ["normalized", "technically_checked", "superseded", "quarantined", "archived"],
  technically_checked: ["classified", "quarantined", "restricted", "archived"],
  classified: ["legally_checked", "quarantined", "restricted", "archived"],
  legally_checked: ["released", "quarantined", "restricted", "archived"],
  released: ["active", "restricted", "quarantined", "archived"],
  active: ["restricted", "quarantined", "superseded", "archived"],
  restricted: ["active", "quarantined", "superseded", "archived"],
  quarantined: ["normalized", "technically_checked", "released", "archived"],
  superseded: ["archived"],
  archived: [] // terminal
});

function isIntakeState(s) {
  return INTAKE_STATES.includes(String(s || ""));
}
function canTransition(from, to) {
  if (!isIntakeState(from) || !isIntakeState(to)) return false;
  return (INTAKE_TRANSITIONS[from] || []).includes(to);
}
// Naechster Zustand mit Begruendung. manualOverride erlaubt geprueften Menschen jeden gueltigen
// Uebergang; ohne Override wird ein ungueltiger Sprung ABGELEHNT (kein stiller Zwangswechsel).
function advanceIntake(current, target, { manualOverride = false } = {}) {
  if (!isIntakeState(current)) return { ok: false, state: current, reason: "unbekannter-ausgangszustand" };
  if (!isIntakeState(target)) return { ok: false, state: current, reason: "unbekannter-zielzustand" };
  if (current === target) return { ok: true, state: current, reason: "unveraendert" };
  if (canTransition(current, target)) return { ok: true, state: target, reason: manualOverride ? "manuell" : "regulaer" };
  return { ok: false, state: current, reason: `unerlaubter-uebergang:${current}->${target}` };
}

// --- Statusfelder (Phase 4, die 20 Attribute) -----------------------------------------------
const TRUST_LEVELS = Object.freeze(["hoch", "mittel", "niedrig", "blockiert", "unbekannt"]);
// Lizenz-/Nutzungsstatus: darf der Inhalt technisch/rechtlich abgerufen und verarbeitet werden?
const LICENSE_STATES = Object.freeze(["unbewertet", "offen_erlaubt", "presse_erlaubt", "eingeschraenkt", "unklar", "untersagt"]);
// Datenschutzstatus der Quelle (verarbeitet sie/wir personenbezogene Daten?).
const PRIVACY_STATES = Object.freeze(["unbewertet", "unbedenklich", "oeffentliche_mandatsdaten", "pruefung_noetig", "unzulaessig"]);
// Pruefstatus = Position in der Importstrecke (Alias auf INTAKE_STATES, siehe review_status).
// Freigabestatus (getrennt vom Pruefstatus): wer/was hat die Quelle fuer den Betrieb freigegeben?
const RELEASE_STATES = Object.freeze(["unfreigegeben", "auto_freigegeben", "manuell_freigegeben", "zurueckgezogen"]);

// Herkunft der Entdeckung (Phase 4, Attribut 12).
const DISCOVERY_ORIGINS = Object.freeze([
  "official_directory", // amtliches oeffentliches Verzeichnis
  "structured_dataset",  // strukturierte Datenquelle (API/CSV/Sitemap)
  "legacy_catalog",      // bestehender Alt-Katalog (v1Sources)
  "manual_curation",     // manuell kuratiert (mit Beleg)
  "search_discovery"     // per Suchanbieter entdeckt (nur Discovery, nie alleinige Versorgung)
]);

// Die 20 verbindlichen Attribute je Quelle (Auftrag Phase 4). Reihenfolge = Auftrag.
const SOURCE_ATTRIBUTES = Object.freeze([
  "publisher_id",        // 1  Kanonischer Herausgeber
  "canonical_url",       // 2  Kanonische URL
  "retrieval",           // 3  Technischer Abrufweg {method,url,query,parser,expected_frequency}
  "source_type",         // 4  Quellentyp (taxonomy)
  "political_level",     // 5  Politische Ebene
  "institution_id",      // 6  Institution
  "party_id",            // 7  Partei (oder group_id fuer Fraktion)
  "committee_ids",       // 8  Ausschuesse
  "topics",              // 9  Themen
  "region_ids",          // 10 Regionen
  "language",            // 11 Sprache
  "discovery_origin",    // 12 Herkunft der Entdeckung
  "discovered_at",       // 13 Datum der Entdeckung
  "last_checked_at",     // 14 Datum der letzten Pruefung
  "trust",               // 15 Vertrauensstatus
  "license_status",      // 16 Lizenz und Nutzungsstatus
  "privacy_status",      // 17 Datenschutzstatus
  "review_status",       // 18 Pruefstatus (= INTAKE_STATE)
  "release_status",      // 19 Freigabestatus
  "responsible"          // 20 verantwortliche Regel oder Person
]);

// --- Kanonischer Herausgeber-Merge (Phase 10 §4) --------------------------------------------
// Ein Herausgeber existiert EINMAL je kanonischer Domain. Der Suchanbieter-Aggregator ist der
// einzige Nicht-Domain-Herausgeber (feste ID). Reine Ableitung, kein Storage.
function publisherIdForDomain(domain) {
  const d = String(domain || "").replace(/^www\./, "").toLowerCase().trim();
  if (!d) return "";
  if (base.isGoogleNewsUrl(`https://${d}`) || d === "news.google.com") return base.GOOGLE_NEWS_PUBLISHER_ID;
  return `publisher-${d.replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "")}`;
}

// Kanonische URL (delegiert an die bestehende Dedup-Normalisierung).
function canonicalUrl(url) {
  return base.normalizeUrl(url);
}

// --- Kanonischer Quellen-Schluessel (Dedup, Phase 5 + Tests §2/§3) --------------------------
// Eine "Quelle" ist eindeutig durch (Herausgeber, Abrufmethode, kanonisches Ziel). Der Schluessel
// faellt fuer triviale URL-Varianten (www, Tracking, Trailing-Slash, http/https) ZUSAMMEN, damit
// wiederholte Importe idempotent bleiben und echte Dubletten erkannt werden.
//   - Suchanbieter-Themensuche: identisch, wenn die normalisierte Suchdefinition (q) gleich ist
//     (Herausgeber = Aggregator). site:-Suchen zaehlen zum echten Herausgeber (dessen Domain).
//   - Direkte Feeds/APIs/HTML: identisch, wenn Herausgeber + kanonische Ziel-URL gleich sind.
function canonicalSourceKey(input = {}) {
  const method = String(input.method || (input.retrieval && input.retrieval.method) || "").toLowerCase();
  const rawUrl = input.canonical_url || input.url || (input.retrieval && input.retrieval.url) || "";
  const publisherId = input.publisher_id || publisherIdForDomain(input.domain || base.canonicalDomain(rawUrl));

  if (method === "googlenews_search" || method === "search") {
    const q = normalizeSearchQuery(input.query || (input.retrieval && input.retrieval.query) || base.googleNewsQuery(rawUrl));
    // site:-Suche mit erkennbarem Herausgeber -> an dessen Herausgeber gebunden, sonst Aggregator.
    return `${publisherId}|search|${q}`;
  }
  const canon = canonicalUrl(rawUrl);
  return `${publisherId}|${method || "any"}|${canon}`;
}

// Normalisiert eine Suchdefinition: klein, Umlaute gefaltet, Whitespace/Interpunktion vereinheitlicht,
// Tokens sortiert -> stabil gegen Wortstellung, Gross/Klein und triviale Varianten.
function normalizeSearchQuery(q) {
  const s = String(q == null ? "" : q)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[()"']/g, " ")
    .replace(/[^a-z0-9: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.split(" ").filter(Boolean).sort().join(" ");
}

// --- Dedup ueber eine Kandidatenmenge (idempotent, Phase 5) ---------------------------------
// Gruppiert Kandidaten nach canonicalSourceKey. Der erste je Schluessel ist der "Primaerkandidat";
// weitere sind Dubletten. KEINE Zufalls-/Zeitabhaengigkeit -> deterministisch + reproduzierbar.
function dedupeCandidates(candidates = []) {
  const byKey = new Map();
  const duplicates = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c || typeof c !== "object") continue;
    const key = c.canonical_key || canonicalSourceKey(c);
    if (byKey.has(key)) {
      duplicates.push({ key, of: byKey.get(key).id != null ? byKey.get(key).id : null, candidate: c });
    } else {
      byKey.set(key, { ...c, canonical_key: key });
    }
  }
  return { unique: [...byKey.values()], duplicates, uniqueCount: byKey.size, duplicateCount: duplicates.length };
}

module.exports = {
  CONCERNS,
  INTAKE_STATES, SERVEABLE_STATES, RELEASED_OR_LATER, REVIEW_REQUIRED_STATES, INTAKE_TRANSITIONS,
  isIntakeState, canTransition, advanceIntake,
  TRUST_LEVELS, LICENSE_STATES, PRIVACY_STATES, RELEASE_STATES, DISCOVERY_ORIGINS,
  SOURCE_ATTRIBUTES,
  publisherIdForDomain, canonicalUrl, canonicalSourceKey, normalizeSearchQuery, dedupeCandidates,
  // Re-Export der Taxonomie fuer bequemen Zugriff
  taxonomy
};
