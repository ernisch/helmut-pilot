"use strict";

// Helmut — Neue Quellenarchitektur · Aggregator/Einstiegspunkt.
//
// Bequemer Zugriff auf Modell, Katalog-Mapper und Seeds. buildFullModel() fuehrt alles zu
// EINEM konsistenten In-Memory-Abbild zusammen (Herausgeber/Abrufwege/Pakete/Geografie/
// Entitaeten/Zuordnungen) — Grundlage fuer Tests, Seed-Generierung und (spaeter) den
// Admin-Lesevertrag. Reine Daten, kein Netz, keine KI, kein Storage-Write.

const model = require("./model");
const catalog = require("./catalog");
const { GEOGRAPHIES, ELECTORAL_DISTRICTS } = require("./seeds/geographies");
const { POLITICAL_ENTITIES } = require("./seeds/entities");
const { PACKAGE_DEFINITIONS, LANDESMODUL_PFLICHTKLASSEN, packageKeysForSource } = require("./seeds/packages");
const { DOMAIN_PUBLISHERS } = require("./seeds/publishers");

function buildFullModel(opts = {}) {
  const mapped = catalog.buildCatalog(opts);
  return {
    geographies: GEOGRAPHIES,
    electoralDistricts: ELECTORAL_DISTRICTS,
    entities: POLITICAL_ENTITIES,
    publishers: mapped.publishers,
    retrievalPaths: mapped.retrievalPaths,
    packages: mapped.packages,
    packagePaths: mapped.packagePaths,
    unmapped: mapped.unmapped,
    orphans: catalog.classifyOrphans()
  };
}

module.exports = {
  model,
  catalog,
  seeds: { GEOGRAPHIES, ELECTORAL_DISTRICTS, POLITICAL_ENTITIES, PACKAGE_DEFINITIONS, DOMAIN_PUBLISHERS, LANDESMODUL_PFLICHTKLASSEN },
  packageKeysForSource,
  buildFullModel
};
