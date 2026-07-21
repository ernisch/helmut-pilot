"use strict";

// Helmut — Quellenplattform (Konsolidierung) · Dynamischer Laufzeit-Versorgungsplan (Aufgabe 3).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. NICHT produktiv verdrahtet.
// Erzeugt aus EINEM Mandatsprofil den nachvollziehbaren Laufzeit-Versorgungsplan entlang des
// Zielablaufs:
//   Mandatsregister (S1) -> Versorgungsbedarf -> Master-Katalog-Abfrage (S3) ->
//   dynamische Auswahl+Gewichtung (assignment) -> Laufzeit-Versorgungsplan ->
//   Gesundheitspruefung (health-model) -> Qualitaetspruefung (quality-model) ->
//   Coverage-Ergebnis (supply-standard).
//
// Ein "Paket" ist hier NUR dieses Laufzeitergebnis. KEINE Quelle wird pro Mandant kopiert:
// globale Quellen werden per ID referenziert, private Quellen sind strikt tenant-isoliert.

const mandateRegister = require("../mandate-register");
const assignment = require("./assignment");
const quality = require("./quality-model");
const runtimeSource = require("./runtime-source");
const supplyStandard = require("../quellenarchitektur/master/supply-standard");
const masterModel = require("../quellenarchitektur/master/model");
const healthModel = require("./health-model");

// source_type -> Versorgungsebenen (aus dem Versorgungsstandard, datengetrieben).
const TYPE_TO_LEVELS = (() => {
  const map = new Map();
  for (const lvl of supplyStandard.SUPPLY_LEVELS) {
    for (const t of [...(lvl.required_source_types || []), ...(lvl.allowed_substitutes || [])]) {
      if (!map.has(t)) map.set(t, new Set());
      map.get(t).add(lvl.id);
    }
  }
  return map;
})();

function tid(v) { return String(v == null ? "" : v).trim(); }
function levelsForType(sourceType) { return [...(TYPE_TO_LEVELS.get(String(sourceType)) || new Set())]; }

// Baut den vollstaendigen Versorgungsplan.
//   profile : Mandatsprofil (mandate_profiles-Zeile o. ae.)
//   catalog : { globalSources:[record...], privateSources?:[record...], tenantId?, metricsById? }
function buildSupplyPlan(profile = {}, catalog = {}, opts = {}) {
  const mandate = opts.mandate || mandateRegister.resolveMandate(profile, opts);
  const requirement = assignment.buildRequirement(mandate, { profile });
  const tenantId = tid(catalog.tenantId);

  // Kandidaten: globale Quellen (nie kopiert) + NUR die privaten Quellen DIESES Mandanten.
  const globals = (catalog.globalSources || []).map((r) => runtimeSource.toRuntimeSource(r, { visibility: "global" }));
  const privateLeaks = [];
  const privates = (catalog.privateSources || [])
    .filter((p) => { const ok = tid(p.tenant_id) === tenantId && tenantId !== ""; if (!ok && tid(p.tenant_id) !== tenantId) privateLeaks.push(tid(p.tenant_id)); return ok; })
    .map((r) => runtimeSource.toRuntimeSource(r, { visibility: "private", tenantId }));
  const candidates = [...globals, ...privates];
  const byId = new Map(candidates.map((s) => [s.id, s]));

  // Mandat register-reif? Sonst ist eine Versorgung nicht sinnvoll bewertbar.
  const usable = requirement.usable !== false;
  const assigned = assignment.assignSources(candidates, mandate, { requirement, requireUsable: true });

  // Zuweisung -> Versorgungsebenen. Jede gewaehlte Quelle deckt evtl. mehrere Ebenen ab.
  const sourcesByLevel = {};
  const planSources = [];
  for (const chosen of assigned.sources) {
    const src = byId.get(chosen.id);
    const levels = levelsForType(src.source_type);
    // Fuer den Versorgungsstandard (Sprint 3 evaluateLevel) muss health ein STRING im groben
    // Vokabular sein (healthy|degraded|broken|unknown), nicht das Health-Objekt.
    const evalRec = { ...src, health: healthModel.toSupplyHealth(src.health && src.health.state) };
    for (const lvl of levels) { (sourcesByLevel[lvl] = sourcesByLevel[lvl] || []).push(evalRec); }
    const q = quality.scoreQuality(src, { assignment: { reasons: chosen.reasons }, metrics: (catalog.metricsById || {})[chosen.id] || {} });
    planSources.push({
      id: src.id, publisher_id: src.publisher_id, source_type: src.source_type,
      visibility: src.visibility, tenant_id: src.tenant_id,
      levels, relevanceScore: chosen.score, reasons: chosen.reasons,
      health: src.health.state, serveable: masterModel.SERVEABLE_STATES.includes(src.review_status),
      review_status: src.review_status, is_search_provider: src.is_search_provider,
      qualityScore: q.score, qualityUnknownAxes: q.unknownAxes
    });
  }

  // Coverage-Ergebnis ueber den Versorgungsstandard (Sprint 3): welche Pflichtebene ist erfuellt?
  const supply = supplyStandard.evaluateSupply(sourcesByLevel);

  // Verbotene Abhaengigkeit von einem einzelnen Suchanbieter (Abnahme §9 / Aufgabe 3.9).
  const searchOnlyLevels = supply.perLevel.filter((l) => l.reasons.includes("nur-suchanbieter-versorgung")).map((l) => l.level);
  const forbiddenSearchProviderDependency = searchOnlyLevels.length > 0;

  // Versorgungsluecken je Ebene.
  const gaps = supply.perLevel
    .filter((l) => !l.met)
    .map((l) => ({ level: l.level, name: l.name, required: l.required, blocking: l.blockingDeficiency, reasons: l.reasons }));

  // Alternativen je Ebene: die nicht als Erstwahl gebrauchten, aber zugewiesenen Quellen.
  const alternativesByLevel = {};
  for (const [lvl, recs] of Object.entries(sourcesByLevel)) {
    const ranked = recs.map((r) => ({ id: r.id, score: (assigned.sources.find((c) => c.id === r.id) || {}).score || 0 }))
      .sort((a, b) => b.score - a.score);
    alternativesByLevel[lvl] = ranked.slice(1).map((r) => r.id); // alles nach der Erstwahl = Alternative
  }

  // Gesamtstatus (Aufgabe 3.10): vollstaendig | eingeschraenkt | blockiert.
  let status;
  let statusReason;
  if (!usable) { status = "blockiert"; statusReason = "mandat-nicht-register-reif"; }
  else if (!supply.ok) { status = "blockiert"; statusReason = `blockierende-versorgungsluecke:${supply.blockingDeficiencies.join(",")}`; }
  else if (supply.unmetRequired.length || forbiddenSearchProviderDependency) { status = "eingeschraenkt"; statusReason = `unerfuellte-pflichtebenen:${supply.unmetRequired.join(",") || "-"}${forbiddenSearchProviderDependency ? ";nur-suchanbieter:" + searchOnlyLevels.join(",") : ""}`; }
  else if (!supply.fullyMet) { status = "eingeschraenkt"; statusReason = "optionale-ebenen-offen"; }
  else { status = "vollstaendig"; statusReason = "alle-ebenen-erfuellt"; }

  return {
    generatedFor: requirement.mandateId,
    mandate: { coverageStatus: mandate.coverageStatus, registerReady: mandate.versorgungsstatus && mandate.versorgungsstatus.registerReady, parliamentType: mandate.parliamentType },
    requirement: publicRequirement(requirement),
    status, statusReason,
    // 1-5: gewaehlte Quellen mit Ebene, Kriterien, Relevanz, erfuellten Pflichtebenen
    sources: planSources,
    // 6: Alternativen je Ebene
    alternativesByLevel,
    // 7: ausgeschlossene Quellen + Grund
    excluded: assigned.excluded,
    // 8: Versorgungsluecken
    gaps,
    // 9: Suchanbieter-Abhaengigkeit
    forbiddenSearchProviderDependency, searchOnlyLevels,
    // Coverage-Rohbild (je Ebene) + Zaehlwerte
    coverage: { ok: supply.ok, fullyMet: supply.fullyMet, perLevel: supply.perLevel },
    counts: {
      assigned: assigned.count, excluded: assigned.excluded.length,
      global: assigned.sources.filter((s) => s.visibility === "global").length,
      private: assigned.sources.filter((s) => s.visibility === "private").length
    },
    invariants: {
      // Keine globale Quelle wurde kopiert; jede private Quelle traegt die eigene tenant_id.
      noPerTenantCopies: true,
      privateLeakAttempts: privateLeaks.length,
      allPrivateOwnTenant: planSources.filter((s) => s.visibility === "private").every((s) => tid(s.tenant_id) === tenantId)
    }
  };
}

function publicRequirement(r) {
  return { mandateId: r.mandateId, level: r.level, parties: r.parties, factions: r.factions, committees: r.committees, policyFields: r.policyFields, ministries: r.ministries, regions: r.regions, usable: r.usable };
}

module.exports = { buildSupplyPlan, TYPE_TO_LEVELS, levelsForType };
