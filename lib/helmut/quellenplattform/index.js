"use strict";

// Helmut — Quellenplattform (Konsolidierung Sprint 1-3) · Einstiegspunkt / Fassade.
//
// EINE verbindliche Quellenplattform. Fuehrt die drei bisher parallelen Sprints zu einer
// einzigen Architektur zusammen, OHNE die Produktion zu veraendern (additiv, dormant, nicht
// verdrahtet). Verbindliche Wahrheiten:
//   - Mandat:        Sprint 1  (lib/helmut/mandate-register.js) — einzige Profil->Anforderung
//   - Quellenmodell: Sprint 3  (lib/helmut/quellenarchitektur/master/*) — kanonischer Katalog
//   - Zuweisung:     konsolidiert (assignment.js), kriterienbasiert (Logik aus Sprint 2)
//   - Gesundheit:    health-model.js (10 Zustaende)  · Qualitaet: quality-model.js (10 Achsen)
//   - Tenant/RLS:    Sprint 3 tenant-scope.js  · Pakete: nur noch Laufzeitergebnis (supply-plan)
//
// Zielablauf: Mandatsregister -> Versorgungsbedarf -> Master-Katalog -> dynamische Auswahl+
// Gewichtung -> Laufzeit-Versorgungsplan -> Gesundheit -> Qualitaet -> Coverage.

const mandateRegister = require("../mandate-register");
const runtimeSource = require("./runtime-source");
const assignment = require("./assignment");
const healthModel = require("./health-model");
const qualityModel = require("./quality-model");
const supplyPlan = require("./supply-plan");
const legacyPackages = require("./legacy-packages");
const tenantScope = require("../quellenarchitektur/master/tenant-scope");

// End-to-End: aus einem Mandatsprofil + Katalog den vollstaendigen, nachvollziehbaren
// Laufzeit-Versorgungsplan erzeugen (rein lesend, nichts wird persistiert oder aktiviert).
function planSupplyForMandate(profile, catalog, opts = {}) {
  return supplyPlan.buildSupplyPlan(profile, catalog, opts);
}

module.exports = {
  // verbindliche Wahrheiten (durchgereicht)
  mandate: mandateRegister,
  tenant: tenantScope,
  // konsolidierte Bausteine
  runtimeSource,
  assignment,
  health: healthModel,
  quality: qualityModel,
  supplyPlan,
  legacyPackages,
  // bequeme Einstiegspunkte
  resolveMandate: mandateRegister.resolveMandate,
  toRuntimeSource: runtimeSource.toRuntimeSource,
  buildRequirement: assignment.buildRequirement,
  assignSources: assignment.assignSources,
  scoreQuality: qualityModel.scoreQuality,
  planSupplyForMandate,
  shadowComparePlanVsLegacy: legacyPackages.shadowComparePlanVsLegacy
};
