"use strict";

// Helmut — Quellenplattform-Konsolidierung · Einstiegspunkt + verbindliches Architektur-Manifest.
// =============================================================================================
// Diese Datei ist die EINE Fassade der konsolidierten Quellenplattform. Sie fuehrt die drei
// Sprints unter der verbindlichen Zielarchitektur zusammen (Auftrag Phase 3) und exportiert je
// Belang GENAU EINE verbindliche Implementierung. Rein additiv, dormant: NICHTS hiervon ist in
// server.js/scheduler.js/crawler.js verdrahtet; keine Produktionsdatei wird veraendert.
//
// Die Fassade entscheidet die im Integrationsaudit offen gelassenen Architekturfragen GEMAESS
// dem verbindlichen Auftrag — sie erfindet keine neue Logik, sondern waehlt und verdrahtet die
// bereits gebauten, getesteten Bausteine.

const model = require("./model");                          // Live: kanonisches Kernmodell/Gesundheit
const watchdog = require("./quality-watchdog");            // Live: kanonisches Qualitaetsmodell
const legacyPackages = require("./profile-packages");      // Live: Legacy-Pakete (Kompatibilitaetsschicht)
const master = require("./master");                        // Sprint 3: globaler Master-Quellenkatalog
const bibliothek = require("../quellenbibliothek");        // Sprint 2: dynamische Auswahl/Discovery/Parser
const mandateRegistry = require("./seeds/mandate-registry"); // Sprint 1: Mandatswahrheit
const modelle = require("./konsolidierung-modelle");
const versorgungsplan = require("./konsolidierung-versorgungsplan");

// --- Verbindliches Architektur-Manifest (maschinell pruefbar) -------------------------------
// Jede Komponente nennt ihre EINE verbindliche Wahrheit, die uebernommenen Teile und die
// (voruebergehend) verbleibende Legacy-Schicht. Der Architektur-Test prueft diese Zusagen.
const ARCHITECTURE = Object.freeze({
  mandateResolution: {
    authority: "quellenarchitektur/seeds/mandate-registry.js",   // Sprint 1 = einzige Mandatswahrheit
    writeTruth: "mandate_profiles",
    legacy: null
  },
  masterCatalog: {
    authority: "quellenarchitektur/master/*",                    // Sprint 3 = einziger globaler Katalog
    global: true, copiedPerTenant: false,
    legacy: "source_architecture (bleibt Basis, Neu-Teile eingefaltet)"
  },
  dynamicSelection: {
    authority: "quellenbibliothek/assignment.js",                // Sprint 2 = dynamische Auswahl/Gewichtung
    delivers: ["selection", "weighting", "discovery", "parser"],
    legacy: null
  },
  supplyPackage: {
    model: "runtime_supply_plan",                                // Paket = dynamischer Laufzeitplan
    persisted: false,
    legacy: "profile-packages.js + source_packages (Kompatibilitaetsschicht, voruebergehend)"
  },
  health: {
    authority: modelle.HEALTH_MODEL_SOURCE,                      // EIN Gesundheitsmodell (main-FSM)
    states: modelle.CANONICAL_HEALTH_STATES,
    thresholds: modelle.HEALTH_THRESHOLDS,
    absorbed: ["quellenbibliothek/health-engine.js", "master/health.js"]
  },
  quality: {
    authority: modelle.QUALITY_VERDICT_SOURCE,                   // EIN Qualitaetsmodell (Watchdog)
    subordinate: "quellenbibliothek/quality.js (Ranking-Schicht, nicht autoritativ)"
  },
  tenantSeparation: {
    authority: "master/tenant-scope.js + tenant-context.js/RLS", // global referenziert, privat getrennt
    globalByReference: true, privateTenantIsolated: true
  }
});

// Bequeme, konsolidierte Laufzeit-Fassade: aus Master-Records eine Registry bauen und daraus je
// Mandat den Laufzeit-Versorgungsplan erzeugen — der EINE Weg der neuen Architektur.
function buildPlatform(masterRecords = [], opts = {}) {
  const runtime = versorgungsplan.buildRuntimeRegistry(masterRecords, opts);
  return {
    registry: runtime.registry,
    parsers: runtime.parsers,
    report: runtime.report,
    supplyPlanFor: (mandateProfile, planOpts = {}) => versorgungsplan.buildSupplyPlan(mandateProfile, runtime.registry, planOpts),
    globalSupplyPlan: (profiles, planOpts = {}) => versorgungsplan.buildGlobalSupplyPlan(profiles, runtime.registry, planOpts),
    shadowVsLegacy: (mandateProfile, planOpts = {}) => versorgungsplan.shadowCompareLegacyVsRuntime(mandateProfile, runtime.registry, planOpts)
  };
}

module.exports = {
  ARCHITECTURE,
  buildPlatform,
  // verbindliche Einzelmodelle
  health: modelle,
  quality: modelle,
  supply: versorgungsplan,
  // die verbindlichen Quellbausteine (Referenz, nicht neu gebaut)
  model, watchdog, legacyPackages, master, bibliothek, mandateRegistry
};
