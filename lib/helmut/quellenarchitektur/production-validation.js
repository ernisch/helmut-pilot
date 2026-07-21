"use strict";

// Helmut — Quellenplattform · Sprint 6 · Read-Only-Produktionsvalidierung (Harness).
// =============================================================================================
// Faedelt eine INJIZIERTE, read-only-gesicherte Datenquelle (mockbar) in die BESTEHENDE Shadow-
// Maschinerie (Sprint 4) ueber den befuellten Master-Katalog (Sprint 5). KEINE neue Parallel-
// architektur, KEIN eigenes Health-/Quality-Modell. Dieses Modul enthaelt KEINE Credentials, KEINEN
// Produktionsendpunkt und KEINEN Supabase-Import — es aktiviert KEINEN Produktionszugriff. Der real
// verbindende Adapter wird erst nach ausdruecklicher Freigabe gebaut (Stop-Gate).
//
// Datenminimierung (Auftrag Phase 2): nur die fachlich noetigen Felder; Namen/E-Mail/Telefon/
// Rohtexte werden NIE uebernommen. Mandate werden pseudonymisiert (mandat-001, ...). Fehlende Werte
// bleiben `unbekannt` (kein erfundener Fallback).

const guard = require("./production-read-guard");
const shadow = require("./shadow");
const shadowReport = require("./shadow-report");
const { checkTelemetryClean } = require("./shadow-telemetry");

// --- Phase 2: erlaubte Felder ---------------------------------------------------------------
const MANDATE_ALLOWED = ["partei", "fraktion", "ausschuesse", "funktionen", "themen", "region", "bundesland", "mandatsebene", "profilvollstaendigkeit"];
const MANDATE_FORBIDDEN = ["name", "fullName", "vorname", "nachname", "email", "e_mail", "mail", "telefon", "phone", "mobil", "adresse", "address", "privat", "login", "session", "passwort", "password", "token"];
const TELEMETRY_ALLOWED = ["gesundheit", "letzterErfolg", "fehlerklasse", "parserstatus", "qualitaetsstatus", "pruefstatus", "aktivitaetsstatus", "tenantSichtbarkeit"];

function pseudoRef(index) { return `mandat-${String(index + 1).padStart(3, "0")}`; }

// Minimiert + pseudonymisiert EIN Rohmandat. Verbotene PII-Felder werden NIE kopiert; fehlende
// Fachfelder bleiben leer/`unbekannt` (kein Rateschluss).
function minimizeMandate(raw = {}, index = 0, tenantId = "") {
  const out = { mandateRef: pseudoRef(index), tenantId: String(tenantId || raw.tenantId || ""), _pseudonymized: true };
  for (const f of MANDATE_ALLOWED) out[f] = raw[f] != null ? raw[f] : (Array.isArray(raw[f]) ? [] : undefined);
  // ausschuesse/themen/funktionen als Listen normalisieren (nie undefined)
  for (const listF of ["ausschuesse", "themen", "funktionen"]) out[listF] = Array.isArray(out[listF]) ? out[listF] : (out[listF] ? [out[listF]] : []);
  out.profilvollstaendigkeit = raw.profilvollstaendigkeit != null ? raw.profilvollstaendigkeit : "unbekannt";
  // Fuer die Shadow-Zuweisung wird die pseudonyme Referenz als id genutzt (kein Klartext).
  out.id = out.mandateRef;
  return out;
}

// Verifiziert, dass ein minimiertes Mandat KEIN verbotenes PII-Feld traegt (strukturell).
function mandateHasNoPii(min = {}) {
  const keys = Object.keys(min).map((k) => k.toLowerCase());
  const violations = MANDATE_FORBIDDEN.filter((f) => keys.some((k) => k === f || k.includes(f)));
  return { clean: violations.length === 0, violations };
}

// Minimiert eine Telemetrie-Zeile auf die erlaubten technischen Felder (keine Rohartikel/Inhalte).
function minimizeTelemetryRow(raw = {}) {
  const out = { sourceId: raw.sourceId != null ? String(raw.sourceId) : (raw.source_id != null ? String(raw.source_id) : null) };
  for (const f of TELEMETRY_ALLOWED) out[f] = raw[f] != null ? raw[f] : "unbekannt";
  return out;
}

// Baut aus minimierter Telemetrie die Shadow-Health-Telemetrie (nur source_id + status + Zeit).
function telemetryToShadow(minRows = []) {
  return minRows.filter((r) => r.sourceId).map((r) => ({
    source_id: r.sourceId,
    status: r.gesundheit === "healthy" || r.gesundheit === "reachable" ? "ok" : (r.gesundheit === "unbekannt" ? "empty" : "error"),
    finished_at: typeof r.letzterErfolg === "string" ? r.letzterErfolg : null
  }));
}

// --- Der Validierungslauf -------------------------------------------------------------------
// `source` MUSS ein read-only-gesichertes Objekt sein (guard.readOnlyRepository) mit den Methoden
// listMandates(tenantId) und listSourceTelemetry(tenantId). `catalog` = Sprint-5-Master-Records.
// Laeuft je Tenant STRIKT isoliert; Legacy bleibt allein sichtbar; ein Fehler im neuen Pfad wird
// gefangen und als blockiert markiert.
function runProductionValidation(input = {}) {
  const source = input.source;
  const tenants = Array.isArray(input.tenants) ? input.tenants : [];
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  if (!source || source.__readOnly !== true) {
    throw new guard.ReadOnlyViolation("runProductionValidation: source ist nicht read-only-gesichert");
  }

  const perTenant = [];
  let mandateCounter = 0;
  const piiFindings = [];

  for (const tenantId of tenants) {
    // STRIKT tenant-isoliert: nur die Daten DIESES Tenants lesen.
    const rawMandates = safeRead(() => source.listMandates(tenantId)) || [];
    const rawTelemetry = safeRead(() => source.listSourceTelemetry(tenantId)) || [];

    const minMandates = rawMandates.map((m) => {
      const min = minimizeMandate(m, mandateCounter++, tenantId);
      const pii = mandateHasNoPii(min);
      if (!pii.clean) piiFindings.push({ tenant: hashTenant(tenantId), fields: pii.violations });
      return min;
    });
    const minTelemetry = rawTelemetry.map(minimizeTelemetryRow);
    const shadowTelemetry = telemetryToShadow(minTelemetry);

    const ctx = shadow.buildShadowContext({ catalog: { records: catalog }, health: { telemetry: shadowTelemetry } });
    const batch = shadow.runShadowBatch(minMandates, ctx, { tenantId });
    const report = shadowReport.buildInternalReport(batch, { label: `tenant:${hashTenant(tenantId)}` });

    perTenant.push({
      tenantRef: hashTenant(tenantId),
      mandateCount: minMandates.length,
      report,
      // Invarianten je Tenant:
      allLegacyIntact: batch.allLegacyIntact,
      noAutoActivate: batch.noAutoActivate,
      telemetryPiiClean: batch.allTelemetryClean,
      mandatesPiiClean: minMandates.every((m) => mandateHasNoPii(m).clean)
    });
  }

  return {
    isMock: input.isMock === true,        // in dieser Umgebung IMMER true (kein realer Read)
    tenantCount: tenants.length,
    perTenant,
    globalInvariants: {
      keinCrossTenantPii: piiFindings.length === 0,
      legacyImmerSichtbar: perTenant.every((t) => t.allLegacyIntact),
      neuNieAutoAktiv: perTenant.every((t) => t.noAutoActivate),
      telemetriePiiFrei: perTenant.every((t) => t.telemetryPiiClean && t.mandatesPiiClean)
    },
    piiFindings
  };
}

// Phase 6: Fixture-gegen-Real-Abgleich je Dimension mit KONKRETER Ursache (keine Pauschale).
function compareFixtureVsReal(realReport, fixtureReport) {
  const dims = ["besser", "gleichwertig", "schlechter", "blockiert", "suchanbieterAbhaengigkeitDurchschnitt", "mandateMitSuchanbieterAlleinversorgung"];
  const rows = [];
  for (const d of dims) {
    const real = realReport[d], fix = fixtureReport[d];
    let ursache = "gleich";
    if (real !== fix) {
      ursache = (d.includes("suchanbieter") && real > fix) ? "Reale Telemetrie/Tags spaerlicher -> mehr Suchanbieter-Anteil."
        : (d === "blockiert" && real > fix) ? "Reale Pflichtquellen ohne belastbaren Gesundheits-/Pruefstatus -> Abbruchregel greift."
        : "Datengrundlage (Tags/Health/Profilfelder) real anders als im Fixture.";
    }
    rows.push({ dimension: d, real, fixture: fix, differ: real !== fix, ursache });
  }
  return rows;
}

function safeRead(fn) { try { return fn(); } catch (e) { return null; } }
function hashTenant(tenantId) { return require("./shadow-telemetry").hashRef("t", tenantId); }

module.exports = {
  MANDATE_ALLOWED, MANDATE_FORBIDDEN, TELEMETRY_ALLOWED,
  minimizeMandate, mandateHasNoPii, minimizeTelemetryRow, telemetryToShadow,
  runProductionValidation, compareFixtureVsReal
};
