"use strict";

// Helmut Core — Mandantenkontext (Neutralisierung des Pilot-Hardcodes).
//
// KERNREGEL: Es gibt KEINEN im Code definierten Standardmandanten. Jede
// mandantenbezogene Verarbeitung braucht einen validierten Kontext aus einer
// dieser drei Quellen:
//   1. Account-Modus: Session + Zuweisungen (auth.js/accounts.js, unveraendert).
//   2. Legacy-Pilotgate: HELMUT_PILOT_TENANT_ID (Betreiber-Konfiguration in
//      Vercel, KEIN Code-Default). Fehlt der Wert -> sicherer Abbruch
//      (503 pilot-tenant-not-configured), NIE ein stiller Personen-Fallback.
//   3. Crons/Hintergrundprozesse: aktive Mandate aus der Datenbank
//      (listProfiles) — Multi-Tenant-Verarbeitung ist vorbereitet, aber
//      freigabepflichtig hinter HELMUT_CRON_MULTI_TENANT (Default AUS).
//      Ohne Flag verarbeitet ein mandantenbezogener Cron genau den
//      konfigurierten Pilotmandanten — nachdem er ihn gegen die Datenbank
//      validiert hat. Ohne Konfiguration: sauberer Leerlauf statt Raten.

// Fehlerklasse fuer fehlenden/ungueltigen Mandantenkontext. Traegt einen
// stabilen code, damit HTTP-Schichten und Tests nicht auf Meldungstexte
// matchen muessen.
class TenantContextError extends Error {
  constructor(message, code = "tenant-context-missing") {
    super(message);
    this.name = "TenantContextError";
    this.code = code;
  }
}

function slugifyTenantId(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Konfigurierter Mandant des Legacy-Pilotgates. "" = nicht konfiguriert.
// Bewusst OHNE Default: der Wert ist Betreiber-Konfiguration (Env), kein Code.
function configuredPilotTenantId(env = process.env) {
  return slugifyTenantId(env.HELMUT_PILOT_TENANT_ID);
}

// Validiert eine Mandanten-ID aus beliebiger Quelle. Leer/ungueltig -> Throw
// (sicherer Abbruch), niemals ein Ersatzmandat.
function requireTenantId(value, context = "Verarbeitung") {
  const id = slugifyTenantId(value);
  if (!id) {
    throw new TenantContextError(
      `Mandantenkontext fehlt (${context}). Es gibt keinen Standardmandanten — ` +
      "politicianId muss explizit uebergeben oder ueber Session/HELMUT_PILOT_TENANT_ID aufgeloest werden."
    );
  }
  return id;
}

function flagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value == null ? "" : value).trim().toLowerCase());
}

// Freigabepflichtiger Schalter: mandantenbezogene Crons iterieren ueber ALLE
// aktiven Mandate aus der Datenbank. Default AUS (Kosten-/Verhaltensschutz).
function cronMultiTenantEnabled(env = process.env) {
  return flagOn(env.HELMUT_CRON_MULTI_TENANT);
}

// Aktive Mandate aus der Datenbank. deps.listProfiles ist injizierbar (Tests).
// Fehler -> [] (der Aufrufer meldet einen sauberen Leerlauf, kein Fallback).
async function listActiveTenantIds(deps = {}) {
  const listProfiles = deps.listProfiles || require("./storage").listProfiles;
  const profiles = await listProfiles().catch(() => []);
  const ids = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const id = slugifyTenantId(profile && profile.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Mandantenaufloesung fuer Cron-/Hintergrundlaeufe.
//   Multi-Tenant-Flag AN  -> alle aktiven Mandate aus der Datenbank.
//   Flag AUS              -> [konfigurierter Pilotmandant], aber NUR wenn er
//                            als Datensatz in der Datenbank existiert
//                            (kein Lauf fuer ein Phantom-Mandat).
//   keine Konfiguration   -> [] (sauberer Leerlauf; der Cron antwortet mit
//                            skipped statt fuer einen geratenen Nutzer zu laufen).
async function resolveCronTenantIds(deps = {}) {
  const env = deps.env || process.env;
  const dbIds = await listActiveTenantIds(deps);
  if (cronMultiTenantEnabled(env)) return dbIds;
  const pilotId = configuredPilotTenantId(env);
  if (!pilotId) return [];
  return dbIds.includes(pilotId) ? [pilotId] : [];
}

module.exports = {
  TenantContextError,
  slugifyTenantId,
  configuredPilotTenantId,
  requireTenantId,
  cronMultiTenantEnabled,
  listActiveTenantIds,
  resolveCronTenantIds
};
