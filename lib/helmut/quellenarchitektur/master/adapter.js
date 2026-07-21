"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Rein LESENDER Adapter (Phase 1).
//
// Bindet den BESTEHENDEN relationalen Quellenbestand (Sprint 1/2: publishers / retrieval_paths /
// source_packages / package_paths / political_entities / geographies) an das neue kanonische
// Master-Modell an — OHNE die bestehende Produktionslogik zu veraendern und OHNE jeden Schreib-
// zugriff. Die Eingabe ist der In-Memory-Abzug aus quellenarchitektur.buildFullModel() (oder ein
// aequivalenter DB-Snapshot); die Ausgabe sind kanonische Quellenrecords + Zuweisungen + eine
// abgeleitete Herausgeber-Zusammenfuehrung.
//
// Der Adapter uebersetzt HONEST: Felder, die im Alt-System nie erhoben wurden (Lizenz-/Datenschutz-
// bewertung, Herkunftsbeleg), bleiben 'unbewertet' — genau diese Luecken macht der Shadow-Vergleich
// (shadow-compare.js) sichtbar. Es wird NICHTS erfunden.

const base = require("../model");
const model = require("./model");
const taxonomy = require("./taxonomy");
const { buildSourceRecord } = require("./source-record");

// Bekannte Arbeitgeber-/Wirtschaftsverbaende (fuer die Ausgewogenheits-Trennung Verband vs.
// Arbeitgeberverband in Phase 9). Reine Daten, erweiterbar; kein Logik-Sonderfall.
const EMPLOYER_ASSOCIATION_ENTITY_IDS = new Set(["association-bda", "association-bdi", "association-zdh"]);
// Bekannte Regionalmedien-Domains (Alt-Katalog trug keinen local/ueberregional-Marker mehr).
const REGIONAL_MEDIA_DOMAINS = new Set(["rbb24.de", "tagesspiegel.de"]);

// Leitet den Master-Quellentyp aus (publisher_type, entity) ab. Datengetrieben ueber die
// Entitaetsebene/-typ; Mehrdeutigkeiten werden als solche gefuehrt (kein erfundener Treffer).
function deriveSourceType({ publisherType, entity, method, domain }) {
  const pt = String(publisherType || "").toLowerCase();
  const et = entity ? String(entity.entity_type || "").toLowerCase() : "";
  const level = entity ? String(entity.level || "").toLowerCase() : "";
  const eid = entity ? String(entity.id || "") : "";
  const d = String(domain || "").toLowerCase();

  if (pt === "aggregator") return "suchanbieter";
  if (et === "party" || pt === "party") return "partei";
  if (et === "parliamentary_group" || pt === "parliamentary_group") return "fraktion";
  if (et === "committee" || pt === "committee") return "ausschuss";
  if (et === "ministry" || pt === "ministry") return "ministerium";
  if (et === "government" || pt === "government") return level === "land" ? "landesregierung" : "bundesregierung";
  if (et === "parliament" || pt === "parliament") {
    if (/bundesrat/.test(eid)) return "bundesrat";
    return level === "land" ? "landtag" : "parlament";
  }
  if (et === "statistical_office" || pt === "statistical_office") return "datenportal";
  if (et === "authority" || pt === "authority" || pt === "official") return "behoerde";
  if (et === "union" || pt === "union") return "gewerkschaft";
  if (et === "association" || pt === "association") {
    return EMPLOYER_ASSOCIATION_ENTITY_IDS.has(eid) ? "arbeitgeberverband" : "fachverband";
  }
  if (et === "person" || pt === "person") return "abgeordnete";
  if (pt === "media" || pt === "local") {
    return REGIONAL_MEDIA_DOMAINS.has(d) ? "medien_regional" : "medien_ueberregional";
  }
  // Rein technischer Aggregator-Weg ohne echten Herausgeber.
  if (method === "googlenews_search" && (!d || d === "news.google.com")) return "suchanbieter";
  // Ehrlich unklassifiziert -> Fachmedien als konservativer Default; der Shadow-Vergleich
  // markiert solche Faelle als "abweichend/unklar klassifiziert".
  return "fachmedien";
}

// Baut aus dem relationalen Modell (+ optionalen Entitaeten/Herausgebern) kanonische Records.
// opts.legacyDiscoveredAt: injizierter Zeitstempel fuer discovered_at (Determinismus, kein Date.now()).
function adaptRelationalCatalog(fullModel = {}, opts = {}) {
  const legacyClock = opts.legacyDiscoveredAt || null;
  const publishersById = new Map((fullModel.publishers || []).map((p) => [p.id, p]));
  const entitiesById = new Map((fullModel.entities || []).map((e) => [e.id, e]));
  const geoById = new Map((fullModel.geographies || []).map((g) => [g.id, g]));

  const records = [];
  const bySourceId = new Map(); // retrieval_path_id -> canonical record id

  for (const rp of fullModel.retrievalPaths || []) {
    const publisher = publishersById.get(rp.publisher_id) || null;
    const entity = publisher && publisher.entity_id ? entitiesById.get(publisher.entity_id) : null;
    const domain = publisher ? publisher.canonical_domain : base.canonicalDomain(rp.url);
    const source_type = deriveSourceType({ publisherType: publisher && publisher.publisher_type, entity, method: rp.method, domain });

    // politische Ebene: aus der Entitaet (falls belegt), sonst neutral 'bund' fuer Bundeswege.
    const political_level = (entity && entity.level) || (rp.represents_type ? null : "bund") || "bund";
    const region_ids = entity && entity.geography_id ? [entity.geography_id] : [];

    const rec = buildSourceRecord({
      id: `mc-${rp.id}`,
      publisher_id: rp.publisher_id,
      canonical_url: base.normalizeUrl(rp.url),
      retrieval: { method: rp.method, url: rp.url || null, query: rp.query || null, parser: rp.parser || null, expected_frequency: rp.expected_frequency || null },
      source_type,
      political_level,
      institution_id: entity && ["ministry", "parliament", "government", "authority", "statistical_office", "committee"].includes(entity.entity_type) ? entity.id : null,
      party_id: entity && entity.entity_type === "party" ? entity.id : null,
      group_id: entity && entity.entity_type === "parliamentary_group" ? entity.id : null,
      committee_ids: entity && entity.entity_type === "committee" ? [entity.id] : [],
      region_ids,
      language: "de",
      // Herkunft: der Alt-Katalog ist eine belegbare Herkunft. evidence = die Legacy-Quelle.
      discovery_origin: "legacy_catalog",
      discovered_at: legacyClock,
      last_checked_at: rp.last_success_at || null,
      trust: publisher ? publisher.trust : "unbekannt",
      // HONEST: das Alt-System hat Lizenz/Datenschutz nie bewertet -> als Luecke fuehren.
      license_status: "unbewertet",
      privacy_status: taxonomy.getSourceType(source_type) && taxonomy.getSourceType(source_type).is_official ? "oeffentliche_mandatsdaten" : "unbewertet",
      // Laufender Alt-Weg = im Betrieb; abgebildet ueber review/release (siehe unten).
      review_status: mapHealthToIntake(rp.status, rp.activation_mode),
      release_status: "auto_freigegeben",
      responsible: rp.is_critical ? "regel:kritische-pflichtquelle" : "regel:legacy-katalog",
      evidence_url: rp.url || (rp.query ? `googlenews:${rp.query}` : null),
      legacy_source_id: rp.legacy_source_id || null,
      legacy_path_status: rp.status
    }, { clock: legacyClock });

    records.push(rec);
    bySourceId.set(rp.id, rec.id);
  }

  // Zuweisungen (Belang 4): package_paths -> {package_id, canonical_source_id}. Nur Referenzen,
  // keine kopierten Quellenlisten (globaler Katalog, mandatsbezogene Zuweisung ueber Pakete).
  const assignments = [];
  for (const pp of fullModel.packagePaths || []) {
    const canonId = bySourceId.get(pp.retrieval_path_id);
    if (canonId) assignments.push({ package_id: pp.package_id, source_id: canonId });
  }

  // Herausgeber-Zusammenfuehrung (Belang 1): ein Herausgeber je Domain (bereits im Alt-Modell
  // dedupliziert) — hier nur als Zusammenfassung durchgereicht.
  const publishers = (fullModel.publishers || []).map((p) => ({
    id: p.id, name: p.name, canonical_domain: p.canonical_domain,
    publisher_type: p.publisher_type, trust: p.trust, entity_id: p.entity_id || null
  }));

  return { records, assignments, publishers, geoById };
}

// Bildet den Gesundheits-/Betriebsstatus eines Alt-Abrufwegs auf den Import-/Prüfstatus ab.
// Der Alt-Weg lief bereits im Betrieb -> 'active', sofern nicht pausiert/archiviert/kaputt.
function mapHealthToIntake(status, activationMode) {
  const s = String(status || "").toLowerCase();
  if (s === "archived") return "archived";
  if (s === "paused") return "restricted";
  if (s === "broken") return "restricted";        // katalogisiert, aber nicht gesund -> eingeschraenkt
  if (activationMode === "dev_only") return "restricted";
  // healthy/degraded/needs_review = im Alt-System aktiv gefuehrt.
  return "active";
}

module.exports = { adaptRelationalCatalog, deriveSourceType, mapHealthToIntake };
