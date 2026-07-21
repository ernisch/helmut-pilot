"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · Read-Only-Adapter.
// =============================================================================================
// SICHERHEIT (verbindlich): reine, deterministische Logik. KEIN Netz, KEINE KI, KEIN Storage-Write.
// Die Adapter LESEN ausschliesslich INJIZIERTE Rohdaten (aus einem bereits vorhandenen, sicheren,
// mandantengetrennten Lesepfad) und normalisieren sie in die Formen, die die konsolidierte
// Plattform erwartet. Sie oeffnen SELBST keinen Produktionszugriff.
//
// EHRLICHKEIT (Auftrag Aufgabe 2): fehlende oder widerspruechliche Daten bleiben SICHTBAR —
// es werden KEINE Fallbackwerte erfunden. Wo eine Datengrundlage fehlt, wird `available:false`
// gesetzt und der betroffene Wert bleibt `null`/leer (nie geraten).
//
// Verbindliche Architektur (unveraendert aus der Konsolidierung):
//   Mandat = Sprint 1 · Katalog = Sprint 3 · Auswahl = Sprint 2 · EIN Health-/EIN Quality-Modell ·
//   Paket = Laufzeitplan · global per Referenz · privat nach Tenant getrennt.

const { validateProfile } = require("../profile-validation");
const master = require("./master");
const legacyPackages = require("./profile-packages");
const { PACKAGE_DEFINITIONS } = require("./seeds/packages");
const s3health = require("./master/health");
const modelle = require("./konsolidierung-modelle");
const watchdog = require("./quality-watchdog");
const tenantScope = require("./master/tenant-scope");

function str(v) { return v == null ? "" : String(v).trim(); }

// --- 1) Mandatsprofile ----------------------------------------------------------------------
// Normalisiert injizierte Rohprofile + macht Identitaets-/Vollstaendigkeitsluecken sichtbar.
// KEINE erfundenen Werte: fehlt die Profil-ID, ist die Identitaet UNSICHER (Abbruchregel 7).
function adaptMandateProfiles(rawProfiles = [], opts = {}) {
  const list = Array.isArray(rawProfiles) ? rawProfiles : (rawProfiles ? [rawProfiles] : []);
  const profiles = [];
  let identityUncertainCount = 0;
  let invalidCount = 0;

  for (const raw of list) {
    const profile = raw && typeof raw === "object" ? raw : {};
    const validation = validateProfile(profile);
    const rawId = str(profile.id) || str(profile.user_id) || str(profile.politicianId);
    const identityUncertain = !rawId
      || validation.state === "INVALID" || validation.state === "NOT_READY";
    if (identityUncertain) identityUncertainCount += 1;
    if (validation.state === "INVALID") invalidCount += 1;
    profiles.push({
      mandateId: rawId || null,               // null bleibt sichtbar (kein erfundener Schluessel)
      profile,
      valid: validation.usable === true,
      state: validation.state,
      identityUncertain,
      missingRequired: validation.missingRequired || [],
      disabled: validation.disabled === true
    });
  }

  return {
    source: opts.source || "injected",
    count: profiles.length,
    profiles,
    identityUncertainCount,
    invalidCount,
    available: profiles.length > 0
  };
}

// --- 2) Globaler Master-Quellenkatalog ------------------------------------------------------
// Verbindlich Sprint 3. Nutzt injizierte Records ODER — falls keine geliefert — den in-repo
// Master-Katalog-Seed (deterministisch, KEINE Produktions-DB). Leerer Katalog bleibt sichtbar.
function adaptMasterCatalog(input = {}) {
  let records = null, source = null;
  if (Array.isArray(input.records)) { records = input.records; source = "injected"; }
  else {
    const built = master.buildMasterCatalog({ clock: input.clock });
    records = built.records; source = "seed";
  }
  const byId = {};
  for (const r of records) if (r && r.id != null) byId[r.id] = r;
  return {
    source, records, byId,
    count: records.length,
    empty: records.length === 0,
    available: records.length > 0
  };
}

// --- 3) Legacy-Pakete + Legacy-Auswahl (Vergleichsgrundlage) --------------------------------
// Verbindlich als KOMPATIBILITAETSSCHICHT. Legacy-Quellen-auf-Weg-Ebene (packagePaths) sind ein
// Produktions-Read; fehlen sie, bleibt die Legacy-QUELLEN-Ebene 'unbekannt' (sichtbar), waehrend
// die Legacy-PAKET-Intention (resolveProfilePackages) immer verfuegbar ist.
function adaptLegacyPackages(input = {}) {
  const packages = Array.isArray(input.packages) ? input.packages : PACKAGE_DEFINITIONS;
  const packagePaths = Array.isArray(input.packagePaths) ? input.packagePaths : null;
  return {
    packages,
    packageCount: packages.length,
    packagePaths,
    sourceLevelAvailable: Array.isArray(packagePaths), // ohne packagePaths: Legacy-Quellenmenge unbekannt
    resolveFor: (profile) => legacyPackages.resolveProfilePackages(profile),
    supplyStatusFor: (profile) => legacyPackages.profileSupplyStatus(profile, { packages, packagePaths: packagePaths || [] })
  };
}

// --- 4) Bestehende Quellengesundheit --------------------------------------------------------
// Verbindlich das EINE Gesundheitsmodell. Aggregiert injizierte Telemetrie (Sprint-2-Tabelle)
// ueber die S3-Aggregation und bildet sie auf das KANONISCHE Vokabular ab. Ohne Telemetrie bleibt
// jede Quelle 'unbekannt' — NIE faelschlich 'healthy'.
function adaptSourceHealth(input = {}) {
  const rows = Array.isArray(input.telemetry) ? input.telemetry : [];
  const agg = s3health.aggregateHealth(rows);           // Map source_id -> {health, ...}
  const canonicalById = {};
  for (const [id, h] of agg) canonicalById[id] = modelle.catalogHealthToCanonical(h.health);
  return {
    available: rows.length > 0,
    observedSourceIds: [...agg.keys()],
    canonicalById,
    // Ohne Beobachtung: kanonisch 'needs_review' (unbekannt -> Pruefung noetig), nie 'healthy'.
    healthOf: (sourceId) => (canonicalById[sourceId] != null ? canonicalById[sourceId] : (rows.length ? "needs_review" : "unbekannt"))
  };
}

// --- 5) Bestehende Qualitaetsinformationen --------------------------------------------------
// Verbindlich das EINE (kategoriale) Qualitaetsmodell (Watchdog). Ohne reale Dokument-/KO-Daten
// bleibt der Produktnutzen 'unbekannt' (der Watchdog erfindet keine Kennzahl).
function adaptQualityInfo(input = {}) {
  const hasData = Array.isArray(input.rawDocs) && input.rawDocs.length > 0;
  const sourceMetrics = watchdog.computeSourceMetrics({
    rawDocs: input.rawDocs || [], koSourceLinks: input.koSourceLinks || [],
    dedupDocuments: input.dedupDocuments || [], findings: input.findings || [],
    now: input.now != null ? input.now : 0
  });
  return {
    available: hasData,
    sourceMetrics,
    verdictFor: (paths, activePathIds) => watchdog.assessRetrievalPaths({
      paths: paths || [], sourceMetrics, activePathIds: activePathIds || [],
      now: input.now != null ? input.now : 0
    })
  };
}

// --- 6) Tenant-Kontext ----------------------------------------------------------------------
// Verbindlich: global per Referenz, privat strikt nach Tenant getrennt. Nimmt NUR private Quellen
// des eigenen Mandanten an; fremde werden als Verletzung gemeldet (nie stillschweigend gemischt).
function adaptTenantContext(input = {}) {
  const tenantId = str(input.tenantId);
  const allPrivate = Array.isArray(input.privateSources) ? input.privateSources : [];
  const own = allPrivate.filter((p) => str(p.tenant_id) === tenantId);
  const foreign = allPrivate.filter((p) => str(p.tenant_id) !== tenantId);
  return {
    tenantId,
    valid: tenantId !== "",
    privateSources: own,
    foreignRejected: foreign.length,                    // sichtbar: wie viele fremde abgewiesen
    resolveSupply: (supplyPlan, globalCatalogById, extra = {}) => {
      const mandateSourceIds = (supplyPlan && supplyPlan.sources || []).map((s) => s.id);
      const resolved = tenantScope.resolveTenantSources(tenantId, {
        globalCatalogById, mandateSourceIds,
        tenantRelevance: extra.tenantRelevance || [],
        tenantOverrides: extra.tenantOverrides || [],
        privateSources: own
      });
      const isolation = tenantScope.assertPrivateIsolation(tenantId, resolved, allPrivate);
      return { ...resolved, isolation };
    }
  };
}

module.exports = {
  adaptMandateProfiles, adaptMasterCatalog, adaptLegacyPackages,
  adaptSourceHealth, adaptQualityInfo, adaptTenantContext
};
