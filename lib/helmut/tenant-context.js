"use strict";

// Helmut Core — Mandantenkontext (mandantenneutral, ohne bevorzugten Mandanten).
//
// KERNREGEL: Es gibt KEINEN bevorzugten, primären, Default-, Fallback- oder
// Pilotmandanten — weder im Code, noch in einer Environment-Variable, noch als
// Cron-Fallback. Jede mandantenbezogene Verarbeitung bestimmt ihren Mandanten
// AUSSCHLIESSLICH aus verifiziertem Kontext:
//   1. Account-Modus: Session + Zuweisungen (auth.js/accounts.js).
//   2. Legacy-Zugang (geteiltes PILOT_SECRET, keine Accounts): Die AKTIVEN
//      Mandate der Datenbank SIND die Zugriffsmenge (allgemeine, datenbank-
//      basierte Zugangszuordnung). Genau ein aktives Mandat -> dieses; mehrere
//      -> Auswahl durch den Client unter den aktiven Mandaten; keines -> ehrlicher
//      Leerzustand. Kein über Environment ausgewählter Einzelmandant.
//   3. Crons/Hintergrundprozesse: alle AKTIVEN Mandate aus der Datenbank,
//      jeder isoliert. Null aktive Mandate -> sauberer Lauf mit 0 verarbeiteten.

// Fehlerklasse fuer fehlenden/ungueltigen Mandantenkontext. Traegt einen stabilen
// code, damit HTTP-Schichten und Tests nicht auf Meldungstexte matchen muessen.
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

// Validiert eine Mandanten-ID aus beliebiger Quelle. Leer/ungueltig -> Throw
// (sicherer Abbruch), niemals ein Ersatzmandat.
function requireTenantId(value, context = "Verarbeitung") {
  const id = slugifyTenantId(value);
  if (!id) {
    throw new TenantContextError(
      `Mandantenkontext fehlt (${context}). Es gibt keinen Standardmandanten — ` +
      "politicianId muss aus Session, Auswahl oder aktivem Datenbankmandat aufgeloest werden."
    );
  }
  return id;
}

// Ist ein Mandats-Datensatz AKTIV? Rein Lifecycle: nicht deaktiviert, nicht
// geloescht. BEWUSST kein Zuschnitt auf eine bestimmte Person/ID und keine
// Vollstaendigkeits-Heuristik hier — Servability/Personalisierung ist eine
// nachgelagerte Frage (validateProfile im jeweiligen Verarbeitungsschritt).
function isActiveMandate(profile) {
  if (!profile || typeof profile !== "object") return false;
  if (profile.profileActive === false || profile.aktiv === false) return false;
  if (profile.deletedAt || profile.geloescht_at || profile.deleted_at) return false;
  return true;
}

// K2 (OP-25, eine Mandatswahrheit): PURE Lebenszyklus-Projektion EINER relationalen
// `profiles`+`mandate_profiles`-Zeile. Sie ist der EINE gemeinsame Lesepfad-Baustein
// fuer Laufzeit (storage.listFullProfilesFromDb) und Nachweis-CLI
// (scripts/op25-production-nachweis.js): beide entscheiden ueber Aktivitaet mit
// DENSELBEN Regeln — identisch zu listFullProfilesFromDb/fromMandateProfileRow:
//   * ohne mandate_profiles-Zeile ist die Identitaetszeile unvollstaendig -> kein Mandat
//   * `geloescht_at` (Soft-Delete) -> kein Mandat
//   * `aktiv !== false` -> profileActive (nur ein ausdrueckliches `false` deaktiviert)
// Kein IO, kein Env — damit das rein lesende CLI sie laden kann, ohne storage.js
// (und damit einen Schreibpfad) in den Prozess zu holen.
function relationalesProfilLebenszyklus(row) {
  if (!row || typeof row !== "object") return null;
  const mandateRow = Array.isArray(row.mandate_profiles) ? row.mandate_profiles[0] : row.mandate_profiles;
  if (!mandateRow || typeof mandateRow !== "object") return null;
  if (mandateRow.geloescht_at) return null;
  return { id: row.id, profileActive: mandateRow.aktiv !== false };
}

// K2: aktive Mandats-IDs DIREKT aus relationalen Zeilen — dieselbe Filter-/Slug-/
// Sortierlogik wie listActiveTenantIds, nur mit Zeilen statt Profil-Ladefunktion.
// `null` (nicht lesbar) bleibt von `[]` (leerer Bestand) unterscheidbar.
function aktiveMandateAusRelationalenZeilen(rows) {
  if (!Array.isArray(rows)) return null;
  const ids = [];
  for (const row of rows) {
    const lebenszyklus = relationalesProfilLebenszyklus(row);
    if (!lebenszyklus || !isActiveMandate(lebenszyklus)) continue;
    const id = slugifyTenantId(lebenszyklus.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.sort();
}

// Aktive Mandats-IDs aus der Datenbank (deterministisch sortiert).
// deps.listProfiles ist injizierbar (Tests). Fehler -> null (UNTERSCHEIDBAR von
// "keine Mandate": der Aufrufer meldet eine Ladestoerung, nicht einen leeren
// Bestand). Quelle sind die VOLLEN Profil-Datensaetze (Lifecycle-Felder noetig).
async function listActiveTenantIds(deps = {}) {
  const listProfiles = deps.listProfiles || require("./storage").listFullProfiles;
  let profiles;
  try {
    profiles = await listProfiles();
  } catch {
    return null;
  }
  const ids = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!isActiveMandate(profile)) continue;
    const id = slugifyTenantId(profile && profile.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.sort();
}

// Mandantenaufloesung fuer Cron-/Hintergrundlaeufe: ALLE aktiven Mandate.
//   { tenantIds, reason } · reason:
//     "ok"                            -> tenantIds (>=1) isoliert verarbeiten
//     "keine-aktiven-mandanten"       -> 0 aktive Mandate (sauberer Lauf, ok:true)
//     "mandanten-liste-nicht-ladbar"  -> Ladestoerung (Aufrufer: ok:false melden)
// KEIN Environment, KEIN Flag, KEIN über Environment ausgewählter Einzelmandant.
async function resolveCronTenants(deps = {}) {
  const ids = await listActiveTenantIds(deps);
  if (ids === null) return { tenantIds: [], reason: "mandanten-liste-nicht-ladbar" };
  return ids.length ? { tenantIds: ids, reason: "ok" } : { tenantIds: [], reason: "keine-aktiven-mandanten" };
}

// Kompatibler Kurzweg (Tests/einfache Aufrufer): nur die IDs.
async function resolveCronTenantIds(deps = {}) {
  return (await resolveCronTenants(deps)).tenantIds;
}

// Mandantenaufloesung fuer den Request-Pfad ohne Account-Session (Legacy-Zugang).
// Die aktiven DB-Mandate sind die Zugriffsmenge des geteilten Zugangs:
//   requested (falls es ein AKTIVES Mandat benennt) -> dieses;
//   sonst genau EIN aktives Mandat -> dieses (ohne Environment-Auswahl);
//   sonst "" mit Grund ("mehrere-mandanten-auswahl-noetig" | "keine-aktiven-
//   mandanten" | "mandanten-liste-nicht-ladbar") -> Aufrufer bietet Auswahl an
//   bzw. zeigt einen ehrlichen Leerzustand. NIE ein geratener Mandant.
async function resolveActiveTenant({ requested = "", deps = {} } = {}) {
  const cleanRequested = slugifyTenantId(requested);
  const ids = await listActiveTenantIds(deps);
  if (ids === null) return { tenantId: "", activeIds: [], reason: "mandanten-liste-nicht-ladbar" };
  if (cleanRequested && ids.includes(cleanRequested)) return { tenantId: cleanRequested, activeIds: ids, reason: "ok" };
  if (ids.length === 1) return { tenantId: ids[0], activeIds: ids, reason: "ok" };
  if (ids.length === 0) return { tenantId: "", activeIds: [], reason: "keine-aktiven-mandanten" };
  return { tenantId: "", activeIds: ids, reason: "mehrere-mandanten-auswahl-noetig" };
}

module.exports = {
  TenantContextError,
  slugifyTenantId,
  requireTenantId,
  isActiveMandate,
  relationalesProfilLebenszyklus,
  aktiveMandateAusRelationalenZeilen,
  listActiveTenantIds,
  resolveCronTenants,
  resolveCronTenantIds,
  resolveActiveTenant
};
