"use strict";

// Helmut — Quellenplattform-Konsolidierung · Laufzeit-Versorgungsplan ("Paket" = Laufzeitobjekt).
// =============================================================================================
// VERBINDLICHE ZIELARCHITEKTUR (Auftrag Phase 3, Punkte 1-6, 9, 10):
//   * Sprint 1 = einzige Mandatswahrheit  ·  Sprint 3 = einziger globaler Master-Quellenkatalog
//     ·  Sprint 2 = dynamische Auswahl/Gewichtung/Discovery/Parser.
//   * Ein "Paket" ist KEIN dauerhaft gespeichertes Objekt mehr, sondern der DYNAMISCH ERZEUGTE
//     Laufzeit-Versorgungsplan aus (Mandat + Master-Katalog + Zuweisung). Nichts wird persistiert.
//   * Globale Quellen werden per REFERENZ zugewiesen (nie pro Mandant kopiert); private Quellen
//     bleiben strikt nach Tenant getrennt.
//   * Die bestehenden Pakettabellen (profile-packages.js/seeds) bleiben als Kompatibilitaetsschicht.
//
// Dieses Modul ist die GLUE der Konsolidierung: es adaptiert die Sprint-3-Master-Records auf die
// Sprint-2-Registry und erzeugt darueber den Laufzeit-Versorgungsplan. Rein additiv, dormant,
// KEIN Storage-Write, KEIN Live-Pfad, KEINE Aenderung an einer Produktionsdatei.

const s2 = require("../quellenbibliothek");                 // Sprint-2-Bibliothek (createLibrary, assignment)
const taxonomy = require("./master/taxonomy");              // Sprint-3-Taxonomie (Belegfunktion je Typ)
const tenantScope = require("./master/tenant-scope");       // Sprint-3-Mandantentrennung (Referenz, nie Kopie)
const legacyPackages = require("./profile-packages");       // LEGACY-Kompatibilitaetsschicht (gespeicherte Pakete)
const { normalizeCommittee } = require("../matching");
const { slug } = require("../quellenbibliothek/descriptor");
const { POLITICAL_ENTITIES } = require("./seeds/entities");
const { MASTER_ENTITIES_EXTRA } = require("./master/seeds/entities-extra");
const { GEOGRAPHIES } = require("./seeds/geographies");

// --- Entitaets-/Geografie-Aufloesung (reine Datenaufloesung, KEINE neue Logik) ---------------
// Der Master-Katalog referenziert Partei/Fraktion/Region als ENTITAETS-IDs ("party-linke",
// "group-bt-linke", "geo-land-berlin"). Damit die bereits im Katalog vorhandene Klassifikation die
// (unveraenderte) Sprint-2-Zuweisung ueberhaupt erreicht, werden diese Referenzen auf ihre
// kanonischen Matching-Schluessel aufgeloest (canonical_key bzw. Regionsslug) — ueber die
// VORHANDENEN Seeds. Unbekannte Werte bleiben unveraendert (rueckwaertskompatibel, kein erfundener
// Fallback): Fixtures, die bereits normalisierte Schluessel tragen, laufen unveraendert durch.
const ENTITY_CANONICAL_KEY = new Map(
  [...POLITICAL_ENTITIES, ...MASTER_ENTITIES_EXTRA]
    .filter((e) => e && e.id && e.canonical_key)
    .map((e) => [e.id, e.canonical_key])
);
const GEO_REGION_KEY = new Map((GEOGRAPHIES || []).filter((g) => g && g.id).map((g) => [g.id, slug(g.name || g.id)]));
function resolveEntityKey(id) {
  if (id == null || id === "") return undefined;
  return ENTITY_CANONICAL_KEY.get(id) || id;
}
function resolveRegionKey(id) {
  return GEO_REGION_KEY.get(id) || id;
}

// --- Statusabbildungen Master-Record -> Bibliotheks-Deskriptor ------------------------------
// Master-review_status (12-stufige Importstrecke) -> Bibliotheks-Nutzungsstatus (4-stufig).
const REVIEW_TO_USAGE = Object.freeze({
  active: "active", restricted: "active", released: "prepared",
  archived: "archived", superseded: "archived", quarantined: "paused"
});
function mapUsageStatus(reviewStatus) {
  return REVIEW_TO_USAGE[String(reviewStatus || "")] || "prepared";
}
// Master-license_status -> Bibliotheks-Lizenzstatus (prohibited sperrt die Zuweisung hart).
const LICENSE_TO_LIB = Object.freeze({
  offen_erlaubt: "open", presse_erlaubt: "attribution", eingeschraenkt: "restricted",
  untersagt: "prohibited", unklar: "unknown", unbewertet: "unknown"
});
function mapLicense(licenseStatus) {
  return LICENSE_TO_LIB[String(licenseStatus || "")] || "unknown";
}

// --- Katalog-Adapter: EIN Master-Record -> EIN roher Bibliotheks-Deskriptor ------------------
// Verbindet Sprint 3 (Katalog der Wahrheit) mit Sprint 2 (Zuweisungslogik). Verlustarm: nur die
// dimensional zuweisbaren Felder werden uebertragen; die Bibliothek normalisiert/validiert selbst.
function masterRecordToDescriptor(rec = {}) {
  if (!rec || typeof rec !== "object") return null;
  const typeMeta = taxonomy.getSourceType(rec.source_type);
  const retrieval = rec.retrieval || {};
  return {
    id: rec.id,
    publisher: rec.publisher_id || rec.publisher || "",
    name: rec.name || rec.publisher_id || rec.id,
    evidenceRole: rec.evidence_role || (typeMeta ? typeMeta.evidence_role : undefined),
    access: {
      method: retrieval.method || rec.method,
      url: retrieval.url || rec.canonical_url || undefined,
      query: retrieval.query || rec.query || undefined,
      parser: retrieval.parser || undefined
    },
    level: rec.political_level || undefined,
    geographyId: rec.geography_id || undefined,
    party: resolveEntityKey(rec.party_id),                    // party-linke -> "linke"
    faction: resolveEntityKey(rec.group_id),                  // group-bt-linke -> "linke"
    committees: Array.isArray(rec.committee_ids) ? rec.committee_ids : [],
    topics: Array.isArray(rec.topics) ? rec.topics : [],
    regions: (Array.isArray(rec.region_ids) ? rec.region_ids : []).map(resolveRegionKey), // geo-land-berlin -> "berlin"
    ministries: Array.isArray(rec.ministries) ? rec.ministries : [],
    universal: rec.universal === true,
    priority: rec.priority,
    trust: rec.trust,
    expectedFrequency: retrieval.expected_frequency || undefined,
    status: mapUsageStatus(rec.review_status),
    license: mapLicense(rec.license_status)
  };
}

// --- Laufzeit-Registry aus dem Master-Katalog ------------------------------------------------
// Wiederverwendung der Sprint-2-Fabrik `createLibrary` (die bislang von nichts genutzt wurde —
// hier wird der tote Komfort-Export VERDRAHTET statt entfernt: keine Arbeit wird verworfen).
function buildRuntimeRegistry(masterRecords = [], opts = {}) {
  const lib = s2.createLibrary({ parsers: opts.parsers });
  const descriptors = (Array.isArray(masterRecords) ? masterRecords : [])
    .map(masterRecordToDescriptor).filter(Boolean);
  const report = lib.registry.addAll(descriptors, opts.addOptions || {});
  return { registry: lib.registry, parsers: lib.parsers, report, descriptorCount: descriptors.length };
}

// --- DER Laufzeit-Versorgungsplan (das "Paket" als Laufzeitobjekt) ---------------------------
// Aus (Mandatsprofil = Sprint-1-Wahrheit) + (Registry = Sprint-3-Katalog) ueber die
// Sprint-2-Zuweisung ein dynamisches, NICHT persistiertes Versorgungsobjekt bilden.
function buildSupplyPlan(mandateProfile, registry, opts = {}) {
  const assignment = s2.assignment.assignSources(registry, mandateProfile, { requireUsable: true, ...opts });
  return {
    kind: "runtime_supply_plan",   // ausdruecklich KEIN gespeichertes Paket
    persisted: false,              // Invariante: nichts wird geschrieben
    mandateId: assignment.requirement.mandateId,
    requirement: assignment.requirement,
    sources: assignment.sources,
    sourceCount: assignment.count,
    byDimensionCount: assignment.byDimensionCount,
    reason: assignment.reason || "ok"
  };
}

// Globaler Laufzeit-Versorgungsplan ueber N Mandate: jede globale Quelle erscheint GENAU EINMAL
// mit der Menge der Mandate, die sie brauchen (refCount) — global nicht pro Mandant kopiert.
function buildGlobalSupplyPlan(mandateProfiles = [], registry, opts = {}) {
  const global = s2.assignment.computeGlobalAssignment(registry, mandateProfiles, opts);
  return { kind: "runtime_global_supply_plan", persisted: false, ...global };
}

// --- Mandantengetrennte Aufloesung (Referenz statt Kopie; private strikt getrennt) ----------
// Der Laufzeit-Versorgungsplan liefert die global zugewiesenen Quellen-IDs (Schicht 4); die
// Sprint-3-Mandantentrennung referenziert sie (nie Kopie) und mischt private Quellen NUR des
// eigenen Mandanten hinzu.
function resolveTenantSupply(tenantId, input = {}) {
  const plan = input.supplyPlan || {};
  const mandateSourceIds = (plan.sources || []).map((s) => s.id);
  const resolved = tenantScope.resolveTenantSources(tenantId, {
    globalCatalogById: input.globalCatalogById,
    mandateSourceIds,
    tenantRelevance: input.tenantRelevance || [],
    tenantOverrides: input.tenantOverrides || [],
    privateSources: input.privateSources || []
  });
  const isolation = tenantScope.assertPrivateIsolation(tenantId, resolved, input.allPrivateSources || input.privateSources || []);
  return { ...resolved, isolation };
}

// --- Legacy-Paket-Shadow-Vergleich (rein lesend) --------------------------------------------
// Vergleicht den LEGACY-Versorgungsweg (gespeicherte Pakete via profile-packages) gegen den
// LAUFZEIT-Versorgungsplan. Er beweist nicht Identitaet (verschiedene Modelle), sondern dass der
// Laufzeitplan die INTENTION der Legacy-Pakete abdeckt: jedes bekannte Legacy-Paket kodiert eine
// Zuweisungsdimension, die der Laufzeitplan dimensional treffen muss.
// Jedes bekannte Legacy-Paket kodiert einen Zuweisungs-Intent (Dimension + Wert). Die
// Zuweisung faltet Ausschuss/Thema zur Dimension "policyFields" — der Abgleich prueft den WERT
// ueber alle Begruendungs-Dimensionen hinweg, damit die Faltung nicht als Fehltreffer zaehlt.
const LEGACY_PACKAGE_INTENT = Object.freeze({
  "die-linke-bund": { label: "parties", value: "linke" },
  "arbeit-und-soziales": { label: "policyFields", value: "arbeit-und-soziales" }
});
function shadowCompareLegacyVsRuntime(mandateProfile, registry, opts = {}) {
  const legacy = legacyPackages.resolveProfilePackages(mandateProfile);
  const runtime = buildSupplyPlan(mandateProfile, registry, opts);

  // Welche Legacy-Optionalpakete traegt das Mandat, und deckt der Laufzeitplan deren Intent?
  const intentChecks = [];
  for (const key of legacy.optional) {
    const intent = LEGACY_PACKAGE_INTENT[key];
    if (!intent) { intentChecks.push({ package: key, mapped: false, covered: null }); continue; }
    const covered = runtime.sources.some((s) =>
      (s.reasons || []).some((r) => (r.matched || []).includes(intent.value)));
    intentChecks.push({ package: key, mapped: true, dimension: intent.label, value: intent.value, covered });
  }
  const mappedChecks = intentChecks.filter((c) => c.mapped);
  return {
    mandateId: runtime.mandateId,
    legacyRequired: legacy.required,
    legacyOptional: legacy.optional,
    runtimeSourceCount: runtime.sourceCount,
    runtimeDimensions: Object.keys(runtime.byDimensionCount),
    intentChecks,
    // Vollstaendig abgedeckt = jedes abbildbare Legacy-Optionalpaket ist dimensional getroffen.
    intentCovered: mappedChecks.length === 0 || mappedChecks.every((c) => c.covered === true),
    unmappedLegacyPackages: intentChecks.filter((c) => !c.mapped).map((c) => c.package)
  };
}

module.exports = {
  masterRecordToDescriptor, buildRuntimeRegistry,
  buildSupplyPlan, buildGlobalSupplyPlan,
  resolveTenantSupply, shadowCompareLegacyVsRuntime,
  mapUsageStatus, mapLicense, LEGACY_PACKAGE_INTENT
};
