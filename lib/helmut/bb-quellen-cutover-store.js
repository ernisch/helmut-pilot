"use strict";

// Helmut — Datenzugriff des BE/BB-Quellen-Cutover-Operators.
// =============================================================================================
// NUR die vier Zielzeilen, NUR die Felder `status` (Pakete) sowie `status` + `activation_mode`
// (Pfade). Die Zielmengen und ihre eingefrorene Identitaet stammen ausschliesslich aus dem
// Operator (eine Quelle der Wahrheit) — es gibt keinen freien Parameter, der Zielzeilen oder
// Felder erweitern koennte.
//
// Transport ist AUSSCHLIESSLICH der vorhandene Storage-REST-Adapter (`storage.supabaseRequest`,
// service_role) — derselbe Laufzeitpfad wie der uebrige relationale Bestand. Es gibt keine
// eigene Verbindungs-/Env-Auswertung und KEINE Migration. `request` kann fuer Offline-Tests
// injiziert werden; dann entfaellt jeder Env-/Netzzugang.
//
// Jeder Write ist ein bedingter PostgREST-UPDATE (Compare-And-Set) auf dem VOLLSTAENDIGEN
// Vorzustand: Identitaet, Publisher, legacy-Kennung, Methode, Abrufadresse, `query = NULL`,
// Parser sowie der erwartete Status (und activation_mode) stecken im WHERE. Liefert der Update
// 0 Zeilen, hat sich der Zustand zwischen Lesen und Schreiben geaendert (oder die Zeile ist
// weg) — der Operator kompensiert und bricht ab.

const storage = require("./storage");
const { ZIEL_PAKETE, ZIEL_PFADE } = require("./bb-quellen-cutover-operator");

const PAKETE = Object.freeze(ZIEL_PAKETE.map((def) => def.id));
const PFADE = Object.freeze(ZIEL_PFADE.map((def) => def.id));
const PAKET_BY_ID = new Map(ZIEL_PAKETE.map((def) => [def.id, def]));
const PFAD_BY_ID = new Map(ZIEL_PFADE.map((def) => [def.id, def]));

const PAKET_STATUS = Object.freeze(["prepared", "active"]);
const PFAD_STATUS = Object.freeze(["needs_review", "healthy"]);
const PFAD_ACTIVATION = Object.freeze(["manual", "auto"]);

function inListe(ids, feld) {
  return `${feld}=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`;
}

function eq(feld, wert) {
  return `${feld}=eq.${encodeURIComponent(String(wert))}`;
}

function wirf(grund) {
  const error = new Error(`Quellen-Cutover-Store: ${grund}`);
  error.grund = grund;
  throw error;
}

// erstellt den Standard-Store. `request` (REST-Adapter) und `status` (Backend-Status) koennen
// fuer Offline-Tests injiziert werden; dann entfaellt jeder Env-/Netzzugang.
function erstelleStore({ request = null, status = null } = {}) {
  const rest = request || ((endpoint, options) => storage.supabaseRequest(endpoint, options));
  const backendStatus = status || (() => storage.getStorageStatus());

  return {
    async bereit() {
      if (request) return { ok: true, backend: "injiziert" };
      let s;
      try {
        s = backendStatus();
      } catch (error) {
        return { ok: false, grund: String((error && error.message) || error) };
      }
      if (!s || s.backend !== "supabase" || s.supabaseConfigured !== true) {
        return { ok: false, grund: "relationaler-schreibpfad-nicht-konfiguriert", backend: s ? s.backend : null };
      }
      return { ok: true, backend: "supabase" };
    },

    // Liest die zwei Paketzeilen, die zwei Pfadzeilen (inkl. `query`/`parser`) und die
    // Paket-<->Pfad-Verknuepfungen GENAU dieser zwei Pfade. Bewusst ungeordnete Rohzeilen —
    // die Eindeutigkeitspruefung ("je genau eine Zeile", "die zwei Links") macht der Operator.
    async leseZielbestand() {
      const [pakete, pfade, links] = await Promise.all([
        rest(`/rest/v1/source_packages?${inListe(PAKETE, "id")}&select=id,key,status`),
        rest(`/rest/v1/retrieval_paths?${inListe(PFADE, "id")}`
          + "&select=id,publisher_id,legacy_source_id,method,url,query,parser,status,activation_mode"),
        // Alle Bindungen BEIDER Zielpakete lesen. Nur so kann der Operator vor der
        // Paketaktivierung sicher feststellen, dass kein weiterer gebundener Pfad
        // bereits `healthy/auto` ist.
        rest(`/rest/v1/package_paths?${inListe(PAKETE, "package_id")}&select=package_id,retrieval_path_id`)
      ]);
      const rows = Array.isArray(links) ? links : [];
      const linkedIds = [...new Set(rows.map((row) => row && row.retrieval_path_id).filter(Boolean))];
      const linkedPfade = linkedIds.length
        ? await rest(`/rest/v1/retrieval_paths?${inListe(linkedIds, "id")}&select=id,status,activation_mode`)
        : [];
      return {
        pakete: Array.isArray(pakete) ? pakete : [],
        pfade: Array.isArray(pfade) ? pfade : [],
        links: rows,
        linkedPfade: Array.isArray(linkedPfade) ? linkedPfade : []
      };
    },

    async schreibePaketStatus({ id, erwartetStatus, neuerStatus }) {
      const def = PAKET_BY_ID.get(id);
      if (!def) wirf("unzulaessiges-paket");
      if (!PAKET_STATUS.includes(erwartetStatus) || !PAKET_STATUS.includes(neuerStatus)) wirf("unzulaessiger-paketstatus");
      const rows = await rest(
        `/rest/v1/source_packages?${eq("id", def.id)}&${eq("key", def.key)}&${eq("status", erwartetStatus)}&select=id`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: { status: neuerStatus } }
      );
      return { betroffen: Array.isArray(rows) ? rows.length : 0 };
    },

    async schreibePfadStatus({ id, erwartetUrl, erwartetStatus, erwartetActivationMode, neuerStatus, neuerActivationMode }) {
      const def = PFAD_BY_ID.get(id);
      if (!def) wirf("unzulaessiger-pfad");
      if (!def.urls.includes(String(erwartetUrl))) wirf("unzulaessige-abrufadresse");
      if (!PFAD_STATUS.includes(erwartetStatus) || !PFAD_STATUS.includes(neuerStatus)) wirf("unzulaessiger-pfadstatus");
      if (!PFAD_ACTIVATION.includes(erwartetActivationMode) || !PFAD_ACTIVATION.includes(neuerActivationMode)) wirf("unzulaessiger-aktivierungsmodus");
      const where = [
        eq("id", def.id),
        eq("publisher_id", def.publisherId),
        eq("legacy_source_id", def.legacySourceId),
        eq("method", def.method),
        eq("url", erwartetUrl),
        "query=is.null",
        eq("parser", def.parser),
        eq("status", erwartetStatus),
        eq("activation_mode", erwartetActivationMode)
      ].join("&");
      const rows = await rest(
        `/rest/v1/retrieval_paths?${where}&select=id`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: { status: neuerStatus, activation_mode: neuerActivationMode } }
      );
      return { betroffen: Array.isArray(rows) ? rows.length : 0 };
    }
  };
}

module.exports = { PAKETE, PFADE, erstelleStore };
