"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · Fassade + Batch-Betrieb.
// =============================================================================================
// Faedelt die Read-Only-Adapter, die parallele Berechnung, den 18-Dimensionen-Vergleich, die
// 11 Abbruchregeln und die PII-freie Telemetrie zu EINEM internen Shadow-Lauf zusammen.
//
// GARANTIEN (Auftrag): Legacy bleibt allein sichtbar/entscheidend; die neue Plattform ist NIE
// automatisch aktivierbar; ein Fehler im neuen Pfad beschaedigt Legacy nicht; alles ist rein
// intern, deterministisch, ohne Netz/KI/Storage-Write.

const adapter = require("./shadow-adapter");
const run = require("./shadow-run");
const cmp = require("./shadow-compare");
const telemetry = require("./shadow-telemetry");
const versorgungsplan = require("./konsolidierung-versorgungsplan");

// Baut den Shadow-Kontext (Adapter + Laufzeit-Registry aus dem Master-Katalog).
function buildShadowContext(input = {}) {
  const catalog = adapter.adaptMasterCatalog(input.catalog || {});
  const legacyAdapter = adapter.adaptLegacyPackages(input.legacy || {});
  const healthAdapter = adapter.adaptSourceHealth(input.health || {});
  const qualityAdapter = adapter.adaptQualityInfo(input.quality || {});
  const runtime = versorgungsplan.buildRuntimeRegistry(catalog.records);
  return {
    catalog, legacyAdapter, healthAdapter, qualityAdapter,
    registry: runtime.registry,
    registryReport: runtime.report,
    globalCatalogById: catalog.byId
  };
}

// Deterministik-Pruefung: derselbe Plan zweimal berechnet -> identische Quellen-IDs + Status.
function isDeterministic(profile, ctx) {
  try {
    const a = run.computeNewPlan(profile, ctx.registry, { healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter });
    const b = run.computeNewPlan(profile, ctx.registry, { healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter });
    return JSON.stringify(a.sources.map((s) => s.id)) === JSON.stringify(b.sources.map((s) => s.id))
      && a.gesamtstatus === b.gesamtstatus;
  } catch { return false; }
}

// Ein Mandat vollstaendig im Shadow-Betrieb.
function runOne(rawProfile, ctx, opts = {}) {
  const meta = adapter.adaptMandateProfiles([rawProfile]).profiles[0];
  const shadow = run.runShadowMandate(rawProfile, {
    registry: ctx.registry, legacyAdapter: ctx.legacyAdapter,
    healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter
  });

  // Tenant-Isolation (falls Tenant + private Quellen gestellt).
  let tenantIsolated = true, tenantLeaked = [];
  if (opts.tenantId && shadow.neu) {
    const t = adapter.adaptTenantContext({ tenantId: opts.tenantId, privateSources: opts.privateSources || [] });
    const resolved = t.resolveSupply(shadow.neu, ctx.globalCatalogById);
    tenantIsolated = resolved.isolation.isolated;
    tenantLeaked = resolved.isolation.leaked;
  }

  const compareCtx = {
    tenantIsolated,
    identityUncertain: meta.identityUncertain,
    deterministic: shadow.neu ? isDeterministic(rawProfile, ctx) : false,
    runtimeLegacyMs: opts.runtimeLegacyMs, runtimeNeuMs: opts.runtimeNeuMs,
    tenantLeaked
  };
  const comparison = cmp.compareMandate(shadow, compareCtx);
  const abort = cmp.evaluateAbortRules(shadow, comparison, compareCtx);
  const tele = telemetry.buildCleanTelemetry({ run: shadow, comparison, abort, tenantId: opts.tenantId || "", durationMs: opts.runtimeNeuMs || 0 });

  return { shadow, comparison, abort, telemetry: tele, identityUncertain: meta.identityUncertain, tenantIsolated };
}

// Batch ueber viele Mandate.
function runShadowBatch(rawProfiles = [], ctx, opts = {}) {
  const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
  const results = profiles.map((p) => runOne(p, ctx, perProfileOpts(p, opts)));
  return {
    count: results.length,
    results,
    // Invarianten-Nachweis fuer die Gesamtsuite:
    allLegacyIntact: results.every((r) => r.shadow.legacyIntact === true),
    noAutoActivate: results.every((r) => r.abort.autoActivateNewAllowed === false),
    allTelemetryClean: results.every((r) => r.telemetry.clean === true)
  };
}
function perProfileOpts(profile, opts) {
  const t = (opts.tenantByProfile && (profile.id != null) && opts.tenantByProfile[profile.id]) || null;
  return {
    ...opts,
    tenantId: t ? t.tenantId : opts.tenantId,
    privateSources: t ? t.privateSources : opts.privateSources
  };
}

module.exports = { buildShadowContext, runOne, runShadowBatch, isDeterministic, adapter, run, cmp, telemetry };
