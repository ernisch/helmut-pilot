"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Aggregator/Einstiegspunkt.
//
// Fuehrt die acht Belange zu EINEM konsistenten, rein lesenden In-Memory-Abbild zusammen:
// Taxonomie · Quellenrecords (Seed) · Zuweisung · Versorgungsstandard · Coverage · Tenant-Trennung
// · Adapter/Shadow gegen den Altbestand. KEINE KI, kein Netz, kein Storage-Write. Additiv:
// nichts hiervon ist in Scheduler/Server verdrahtet — die Produktionslogik bleibt unveraendert.

const model = require("./model");
const taxonomy = require("./taxonomy");
const sourceRecord = require("./source-record");
const acquisition = require("./acquisition");
const intake = require("./intake-pipeline");
const assignment = require("./assignment");
const supply = require("./supply-standard");
const coverageMod = require("./coverage-matrix");
const tenant = require("./tenant-scope");
const health = require("./health");
const adapter = require("./adapter");
const shadow = require("./shadow-compare");

const { buildSeedCatalog, ALL_ENTITIES } = require("./seeds/catalog-seed");
const { buildMasterPackages } = require("./seeds/packages");
const { PARTIES, FRACTIONS, COMMITTEES } = require("../seeds/entities");
const { LAENDER } = require("../seeds/geographies");

// Baut den vollstaendigen Master-Katalog aus dem Seed (Phase 6) inkl. Zuweisung + Coverage.
function buildMasterCatalog(opts = {}) {
  const seed = buildSeedCatalog({ clock: opts.clock });
  const packages = buildMasterPackages();
  const assignments = assignment.buildAssignments(seed.records, packages);
  const coverage = coverageMod.buildCoverageMatrix({
    records: seed.records, parties: PARTIES, groups: FRACTIONS, committees: COMMITTEES, laender: LAENDER,
    thresholds: opts.thresholds
  });
  return {
    records: seed.records,
    packages,
    assignments,
    coverage,
    entities: ALL_ENTITIES,
    geographies: seed.geographies,
    sourceCount: seed.records.length,
    discoveredAt: seed.discoveredAt
  };
}

// Package-ID -> Key Map (Alt-Modell nutzt IDs wie 'pkg-bund-basis', Vergleich braucht Keys).
function legacyPackageKeyById(fullModel = {}) {
  const map = {};
  for (const p of fullModel.packages || []) map[p.id] = p.key;
  return map;
}

// Rein lesender Shadow-Vergleich: adaptiert den bestehenden relationalen Bestand und vergleicht
// ihn gegen den neuen Master-Katalog (Phase 1).
function shadowAgainstRelational(fullModel, opts = {}) {
  const oldAdapted = adapter.adaptRelationalCatalog(fullModel, { legacyDiscoveredAt: opts.legacyDiscoveredAt || "2026-07-14" });
  const master = buildMasterCatalog({ clock: opts.clock });
  const cmp = shadow.compareCatalogs({
    oldRecords: oldAdapted.records,
    newRecords: master.records,
    oldAssignments: oldAdapted.assignments,
    newPackages: master.packages,
    packageKeyById: legacyPackageKeyById(fullModel)
  });
  return { comparison: cmp, oldAdapted, master };
}

module.exports = {
  // Untermodule
  model, taxonomy, sourceRecord, acquisition, intake, assignment,
  supply, coverage: coverageMod, tenant, health, adapter, shadow,
  // Hochwertige Einstiegspunkte
  buildMasterCatalog, shadowAgainstRelational, legacyPackageKeyById,
  // bequeme Seed-Referenzen
  entities: ALL_ENTITIES, parties: PARTIES, fractions: FRACTIONS, committees: COMMITTEES, laender: LAENDER
};
