"use strict";

// Helmut — Neue Quellenarchitektur · Katalog-Mapper (Kompatibilitaetsschicht).
//
// Zerlegt den bestehenden hartkodierten Katalog (lib/helmut/sources.js -> v1Sources, 144
// kuratierte Quellen) + 13 Orphan-Eintraege + die DIP-API deterministisch in das neue Modell:
//   HERAUSGEBER (einmal je Domain) <- 1:n -> ABRUFWEGE <- m:n -> QUELLENPAKETE.
//
// Reine Funktion, KEIN Netz, KEINE KI, KEIN Storage-Write. Aendert NICHTS am Live-Verhalten
// (nicht in Scheduler/Server verdrahtet). Dient als Single Source fuer Migrations-Seeds,
// Tests und (spaeter) den Admin-Lesevertrag.
//
// Google News wird NIE als Herausgeber verkleidet: eine site:-Suche zaehlt zum echten
// Herausgeber (Abrufweg-Methode googlenews_search), eine reine Themensuche zaehlt zum
// Aggregator-Herausgeber "Google News".

const { v1Sources } = require("../sources");
const model = require("./model");
const { DOMAIN_PUBLISHERS } = require("./seeds/publishers");
const { PACKAGE_DEFINITIONS, packageKeysForSource } = require("./seeds/packages");

// --- Orphan-Klassifikation (Auftrag §22/§34) ---
// AUSSCHLIESSLICH explizite Eintraege (heute nur dip) — BEWUSST KEIN Namensmuster:
// die dynamischen Mandatsquellen des Schedulers ("<mandats-id>-news-<suffix>",
// mandateNewsSources) nutzen exakt dasselbe Schema wie historische Legacy-
// Mehrfachsuchen; ein Muster wuerde LEBENDE Quellen als Legacy maskieren und
// den Cutover-Regressionsschutz genau dort blenden, wo er schuetzen soll
// (adversarialer Review-Befund, sinngemaess Preflight M2). Historische Orphan-
// Zuordnungen sind DATEN: Aufrufer (validateMigration/compareSupply) uebergeben
// sie als explizite Karte; abgeloeste Mehrfachsuchen erklaert der Versorgungs-
// vergleich ueber EXPLIZIT deklarierte consolidationBases.
// dip ist KEIN Wegraeum-Orphan, sondern eine gewollt aktive amtliche API (siehe DIP_PATH unten).
const EXPLICIT_ORPHAN_CLASSIFICATION = {
  "dip": "active_uncatalogued"
};

function classifyOrphanId(id) {
  const s = String(id == null ? "" : id).trim();
  if (!s) return null;
  return Object.prototype.hasOwnProperty.call(EXPLICIT_ORPHAN_CLASSIFICATION, s)
    ? EXPLICIT_ORPHAN_CLASSIFICATION[s]
    : null;
}

// DIP als API-Abrufweg des Herausgebers Bundestag (Bund Basis). Wird im Ist inline im
// Scheduler eingemischt (scheduler.js:170) und war bisher kein Abrufweg-Datensatz.
const DIP_PATH = {
  legacy_source_id: "dip",
  publisherDomain: "dip.bundestag.de",
  name: "DIP — Dokumentations- und Informationssystem (Bundestag)",
  method: "api",
  url: "https://search.dip.bundestag.de/api/v1",
  query: null,
  priority: 96,
  packages: ["bund-basis"]
};

// Verifizierter Gesundheits-Snapshot der 9 Direkt-Feeds (quellen-audit.csv, 2026-07-13).
// Nur die eindeutig verifizierten Direkt-Feeds; Google-News-Quellen bleiben 'needs_review',
// bis die Live-Metriken (Sprint 7) den Status setzen. In Sprint 7 durch Telemetrie abgeloest.
//
// P1-5 (Architektur-Audit 29): die frueher hier als 'broken' gefuehrten 6 Wege (bundestag,
// bundesregierung, die-linke, linksfraktion, ausschuss-arbeit-soziales, dgb) tragen jetzt die
// in Sprint 9B real verifizierten Reparatur-URLs (sources.js) — die alte 'broken'-Annotation
// waere jetzt sachlich falsch (sie bezog sich auf die ALTEN URLs). Bewusst NICHT auf 'healthy'
// gesetzt: der Sprint-9B-Runner-Test lief AUSSERHALB dieser App (offener Egress, einmalig), nicht
// ueber die eigene Live-Telemetrie. Ohne Eintrag hier greift der Default 'needs_review' (unten,
// buildRetrievalPath) — dieselbe ehrliche Vorsicht wie bei allen anderen bisher nie live
// bestaetigten Wegen; die naechste echte Crawl-Runde bestaetigt den Status uebliche Weise.
const KNOWN_PATH_HEALTH = {
  "deutschlandfunk-politik": "healthy",
  "tagesschau-politik": "healthy",
  "bmas": "healthy"
};

// Offizielle Pflicht-Originalquellen: duerfen NIE automatisch still archiviert werden
// (Auftrag §30). Statt Loeschen -> sichtbarer Status + (spaeter) Ersatzabrufweg.
// is_critical ist ORTHOGONAL zu always_on: kritisch = nicht still archivieren; das heisst
// NICHT, dass die Quelle auch ohne Profil dauerhaft laeuft.
const CRITICAL_LEGACY_IDS = new Set([
  "bundestag", "bundesregierung", "bmas", "die-linke", "linksfraktion",
  "tagesschau-politik", "deutschlandfunk-politik", "dip"
]);

// Dauerhaft aktive Systemquellen (always_on): laufen auch OHNE aktives Profil (Auftrag §10).
// Bewusst NUR die NEUTRALEN Bund-Basis-Kernquellen — NICHT die themen-/parteispezifischen
// (bmas/die-linke/linksfraktion/ausschuss-arbeit-soziales laufen nur ueber Referenzzaehlung,
// d. h. nur wenn ein passendes Profil ihr Paket braucht).
const ALWAYS_ON_LEGACY_IDS = new Set([
  "bundestag", "bundesregierung", "tagesschau-politik", "deutschlandfunk-politik", "dip"
]);

const PUBLISHER_TYPE_FOR_LEGACY = {
  person: "person", party: "party", faction: "parliamentary_group", committee: "committee",
  ministry: "ministry", bundestag: "parliament", government: "government",
  association: "association", union: "union", official: "authority",
  media: "media", local: "media"
};

function publisherTypeForLegacy(type) {
  return PUBLISHER_TYPE_FOR_LEGACY[String(type || "").toLowerCase()] || "other";
}

// Entfernt bekannte Themen-/Kontext-Suffixe aus einem Freitext-Quellennamen, damit
// "BMAS Pflege" / "Deutschlandfunk Politik" auf den kanonischen Herausgebernamen fallen.
const NAME_SUFFIXES = [
  "Politik", "Arbeit und Soziales", "Sozialpolitik", "Sozialdaten", "Vorhaben", "Radar",
  "Pflege", "Forschungsberichte", "Statistik", "Soziales"
];
function normalizePublisherName(rawName) {
  let s = String(rawName || "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of NAME_SUFFIXES) {
      const re = new RegExp(`\\s+${suf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      if (re.test(s)) { s = s.replace(re, "").trim(); changed = true; }
    }
  }
  return s || String(rawName || "").trim();
}

// Ableitung der Belegfunktion (evidence_role) aus einer Beispielquelle des Herausgebers.
function evidenceRoleForSource(source, entityType) {
  const category = model.categorizeSource(source);
  return model.evidenceRoleFor({ category, entityType });
}

// Loest die Herausgeber-Domain + kanonischen Namen einer Quelle auf.
function resolvePublisherRef(source, method) {
  const primary = source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : "") || source.url || "";
  if (method === "googlenews_search") {
    const query = model.googleNewsQuery(primary) || source.query || "";
    const site = model.extractSiteDomain(query);
    if (site) return { domain: site, viaAggregator: true };
    // reine Themensuche -> Aggregator-Herausgeber Google News
    return { domain: "news.google.com", viaAggregator: true, aggregator: true };
  }
  const domain = model.canonicalDomain(primary);
  return { domain: domain || "news.google.com", viaAggregator: false };
}

// Baut/aktualisiert einen Herausgeber im Register (Dedup nach Domain).
function upsertPublisher(register, ref, source) {
  const domain = ref.domain;
  const seed = DOMAIN_PUBLISHERS[domain];
  const id = domain === "news.google.com"
    ? model.GOOGLE_NEWS_PUBLISHER_ID
    : `publisher-${slug(domain)}`;
  if (register.has(id)) return register.get(id);

  const legacyType = source ? source.type : null;
  const type = seed?.type || publisherTypeForLegacy(legacyType);
  const entityTypeForRole = model.entityTypeForLegacy(legacyType);
  const name = seed?.name || normalizePublisherName(source?.name) || domain;
  const evidence_role = ref.aggregator
    ? "aggregator"
    : (type === "aggregator" ? "aggregator" : evidenceRoleForSource(source || { type: legacyType, url: `https://${domain}` }, entityTypeForRole));
  const trust = ref.aggregator ? "unbekannt" : model.trustForSource(source || { type: legacyType, url: `https://${domain}` });

  const publisher = {
    id, name, canonical_domain: domain, publisher_type: type,
    evidence_role, trust, lifecycle_status: "active",
    entity_id: seed?.entity_id || null
  };
  register.set(id, publisher);
  return publisher;
}

function buildRetrievalPath(source, publisherId, method) {
  const primary = source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : "") || source.url || "";
  const parser = method === "rss" ? "rss-regex"
    : method === "html" ? "html-scrape"
    : method === "googlenews_search" ? "googlenews-batchexecute"
    : method === "api" ? "dip-json" : null;
  const status = KNOWN_PATH_HEALTH[source.id] || "needs_review";
  return {
    id: `rp-${source.id}`,
    publisher_id: publisherId,
    legacy_source_id: source.id,
    name: source.name,
    method,
    url: method === "googlenews_search" ? primary : (primary || null),
    query: method === "googlenews_search" ? (model.googleNewsQuery(primary) || source.query || null) : null,
    parser,
    priority: Number.isFinite(source.priority) ? source.priority : 60,
    status,
    activation_mode: ALWAYS_ON_LEGACY_IDS.has(source.id) ? "always_on" : "auto",
    is_critical: CRITICAL_LEGACY_IDS.has(source.id),
    max_items: source.maxItems || null,
    represents_type: publisherId === model.GOOGLE_NEWS_PUBLISHER_ID ? (source.type || null) : null
  };
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

// --- Hauptfunktion: den gesamten Katalog abbilden ---------------------------
function buildCatalog({ sources } = {}) {
  const catalogSources = sources || v1Sources;
  const publishers = new Map();
  const retrievalPaths = [];
  const packagePaths = [];
  const packagesByKey = new Map(PACKAGE_DEFINITIONS.map((p) => [p.key, p]));
  const unmapped = [];

  for (const source of catalogSources) {
    const method = model.classifyMethod(source);
    const ref = resolvePublisherRef(source, method);
    const publisher = upsertPublisher(publishers, ref, source);
    const path = buildRetrievalPath(source, publisher.id, method);
    retrievalPaths.push(path);

    const keys = packageKeysForSource(source);
    if (!keys.length) unmapped.push(source.id);
    for (const key of keys) {
      const pkg = packagesByKey.get(key);
      if (!pkg) { unmapped.push(`${source.id}->${key}`); continue; }
      packagePaths.push({ package_id: pkg.id, retrieval_path_id: path.id });
    }
  }

  // DIP als API-Abrufweg des Bundestag-Herausgebers ergaenzen (Bund Basis).
  {
    const seed = DOMAIN_PUBLISHERS[DIP_PATH.publisherDomain];
    const dipPublisherId = `publisher-${slug(DIP_PATH.publisherDomain)}`;
    if (!publishers.has(dipPublisherId)) {
      publishers.set(dipPublisherId, {
        id: dipPublisherId, name: seed?.name || "Deutscher Bundestag",
        canonical_domain: DIP_PATH.publisherDomain, publisher_type: seed?.type || "parliament",
        evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
        entity_id: seed?.entity_id || "parliament-bundestag"
      });
    }
    const dipPath = {
      id: "rp-dip", publisher_id: dipPublisherId, legacy_source_id: "dip",
      name: DIP_PATH.name, method: "api", url: DIP_PATH.url, query: null, parser: "dip-json",
      priority: DIP_PATH.priority, status: "healthy", activation_mode: "always_on",
      is_critical: true, max_items: null, represents_type: null
    };
    retrievalPaths.push(dipPath);
    for (const key of DIP_PATH.packages) {
      const pkg = packagesByKey.get(key);
      if (pkg) packagePaths.push({ package_id: pkg.id, retrieval_path_id: dipPath.id });
    }
  }

  return {
    publishers: [...publishers.values()],
    retrievalPaths,
    packages: PACKAGE_DEFINITIONS,
    packagePaths,
    unmapped
  };
}

// Klassifiziert Orphan-Eintraege (nicht Teil von v1Sources) ueber die expliziten
// Eintraege. Historische Legacy-IDs klassifiziert der Aufrufer ueber seine eigene
// Datenkarte (siehe oben) — kein Mandant und keine historische Quell-ID im Code.
function classifyOrphans(legacyIds = []) {
  const ids = new Set([
    ...Object.keys(EXPLICIT_ORPHAN_CLASSIFICATION),
    ...(Array.isArray(legacyIds) ? legacyIds : [])
  ]);
  const rows = [];
  for (const id of [...ids].sort()) {
    const klass = classifyOrphanId(id);
    if (!klass) continue;
    rows.push({
      legacy_source_id: id, classification: klass,
      recommended_action: klass === "orphan_test" ? "archivieren (Testmuell)"
        : klass === "orphan_legacy" ? "als Legacy markieren, Dokumente erhalten, nicht reaktivieren"
        : "als amtlichen API-Abrufweg (Bund Basis) fuehren"
    });
  }
  return rows;
}

module.exports = {
  buildCatalog,
  classifyOrphans,
  normalizePublisherName,
  publisherTypeForLegacy,
  EXPLICIT_ORPHAN_CLASSIFICATION,
  classifyOrphanId,
  KNOWN_PATH_HEALTH,
  CRITICAL_LEGACY_IDS,
  DIP_PATH
};
