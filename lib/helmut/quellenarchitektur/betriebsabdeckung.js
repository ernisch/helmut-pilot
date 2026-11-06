"use strict";

// Eine Sollregel für Verwaltung und regulären Quellenlauf. Die Quelle des
// Ist-Zustands bleibt die relationale Datenbank; Code-Seeds liefern nur Regeln.
const { buildAbdeckungspruefung } = require("./abdeckungspruefung");
const { buildFullModel } = require("./index");

function buildBetriebsabdeckung({ catalog, profiles = null, telemetrie = [], documents = null,
  now = Date.now(), paketInventur = null, expectedCatalog = null, sampleLimit = null } = {}) {
  if (!catalog || !Array.isArray(catalog.retrievalPaths) || !Array.isArray(catalog.packages)) {
    return { erhobenAm: new Date(now).toISOString(), status: "unbekannt", summary: null,
      findings: [], limits: ["Der tatsächlich installierte Quellenkatalog konnte nicht gelesen werden."] };
  }
  const expected = expectedCatalog || buildFullModel();
  const completeness = expectedCatalog ? null : require("./paket-vollstaendigkeit").buildCompletenessModel();
  const classesById = new Map((completeness?.paths || []).map((p) => [p.id, p.klassen]));
  const exceptions = completeness ? require("./paket-vollstaendigkeit").assessPackageCompleteness(completeness).pakete : [];
  const exceptionsByKey = new Map(exceptions.map((p) => [p.key, (p.ausnahmen || []).filter((a) => a.bestaetigt)]));
  const policies = {};
  const actualById = new Map(catalog.retrievalPaths.map((p) => [p.id, p]));
  const drift = [];
  const policyPaths = new Map([...(expected.retrievalPaths || []), ...(completeness?.paths || [])].map((p) => [p.id, p]));
  for (const p of policyPaths.values()) {
    const actual = actualById.get(p.id);
    if (!actual) continue;
    // Eine Prüfung für URL A darf nie URL B oder einen anderen Parser bestätigen.
    if (actual.url !== p.url || actual.method !== p.method || actual.parser !== p.parser
      || actual.legacy_source_id !== p.legacy_source_id) {
      drift.push(p.id);
      continue;
    }
    policies[p.id] = {
      evidence_role: p.evidence_role,
      coverage_classes: [...new Set([...(classesById.get(p.id) || []), ...(p.coverage_classes || [])])],
      party_package_only: p.party_package_only,
      rights_review_required: p.rights_review_required,
      source_verification: p.source_verification ? { reviewAfterDays: 90, ...p.source_verification } : null,
      expected_frequency: actual.expected_frequency || p.expected_frequency || null
    };
  }
  const inventory = paketInventur || require("./paket-inventur").buildPaketInventur({ ...catalog, profiles: profiles || [], telemetrie, now });
  const report = buildAbdeckungspruefung({ catalog, profiles, telemetrie, documents, now, paketInventur: inventory,
    expectedPackages: expected.packages,
    policyByPackage: Object.fromEntries((expected.packages || []).map((p) => [p.key, {
      required_evidence_roles: p.required_evidence_roles,
      required_classes: (p.required_classes || []).filter((klass) => !(exceptionsByKey.get(p.key) || []).some((a) => a.klasse === klass))
    }])), policyByPath: policies });
  report.datengrundlage = "relationale_quellentabellen";
  report.summary.configurationDrift = drift.length;
  report.configurationDrift = drift;
  report.belegteAusnahmen = [...exceptionsByKey].filter(([, rows]) => rows.length).map(([key, rows]) => ({ packageKey: key, exceptions: rows }));
  if (drift.length) report.limits.push(`${drift.length} Abrufwege weichen vom geprüften Code-Katalog ab; dessen Prüfbelege wurden dort nicht übernommen.`);
  if (sampleLimit != null) report.limits.push(`Inhaltsprüfung: höchstens ${sampleLimit} bereitgestellte Dokumente; keine Vollprüfung des Archivs.`);
  return report;
}

// Dauerhaft im bestehenden Laufdatensatz: keine Profile, Inhalte oder neue Ablage.
function summarizeBetriebsabdeckung(report) {
  return { erhobenAm: report.erhobenAm, status: report.status, summary: report.summary,
    // Detailbefunde bleiben ausschließlich in der geschützten Verwaltungsantwort.
    // Pro Lauf reichen Status und Zähler; keine Profilkennungen oder Quellentexte.
    findingCodes: [...new Set((report.findings || []).map((finding) => finding.code))] };
}

module.exports = { buildBetriebsabdeckung, summarizeBetriebsabdeckung };
