"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · SaaS-Mandantentrennung (Phase 7, Belange 6+7).
//
// Reine Logik. Setzt die verbindliche Sieben-Schichten-Trennung der SaaS-Architektur um und
// garantiert die harten Mandanten-Invarianten (Abnahme §2/§3):
//   * Globale Quellen werden NICHT pro Mandant dupliziert — sie werden per REFERENZ zugewiesen.
//   * Private, kundenspezifische Quellen sind fuer andere Mandanten weder sichtbar noch abrufbar.
//   * Jede mandantenspezifische Zuordnung traegt eine eindeutige Mandanten-ID (tenant_id).
//
// Die sieben Schichten (Auftrag Phase 7):
//   1 globaler Quellenkatalog        (global, catalog_sources)
//   2 globale Quellenqualitaet        (global, Bewertung am Quellenrecord)
//   3 globale technische Gesundheit   (global, health.js / source_crawl_telemetry)
//   4 mandatsbezogene Relevanz        (global ableitbar: Mandatsprofil -> Pakete -> Quellen)
//   5 mandantenspezifische Auswahl    (tenant, tenant_source_relevance)
//   6 mandantenspezifische Korrektur  (tenant, tenant_source_overrides)
//   7 kundenspezifische private Quelle(tenant, tenant_private_sources)

// Layer-Deklaration (Datengrundlage fuer die Zugriffsmatrix + RLS-Vorbereitung).
const SCOPE_LAYERS = Object.freeze([
  { id: "global_catalog", scope: "global", table: "catalog_sources", tenant_column: null },
  { id: "global_quality", scope: "global", table: "catalog_sources", tenant_column: null },
  { id: "global_health", scope: "global", table: "catalog_source_health", tenant_column: null },
  { id: "mandate_relevance", scope: "global", table: "catalog_package_assignments", tenant_column: null },
  { id: "tenant_selection", scope: "tenant", table: "tenant_source_relevance", tenant_column: "tenant_id" },
  { id: "tenant_correction", scope: "tenant", table: "tenant_source_overrides", tenant_column: "tenant_id" },
  { id: "tenant_private_source", scope: "tenant", table: "tenant_private_sources", tenant_column: "tenant_id" }
]);

// Erlaubte manuelle Korrektur-Aktionen (Belang 7).
const OVERRIDE_ACTIONS = Object.freeze(["pin", "mute", "boost", "demote", "replace"]);

function tid(v) { return String(v == null ? "" : v).trim(); }

// Loest die effektiven Quellen EINES Mandanten auf — ohne globale Duplikate, ohne fremde
// private Quellen. Rueckgabe: geordnete Liste von {source_id, origin, relevance, private, note}.
//   input.globalCatalogById : Map/Objekt id->globaler Record (nur Referenz, nie kopiert)
//   input.mandateSourceIds  : global zugewiesene Quellen-IDs (aus Paketen; Schicht 4)
//   input.tenantRelevance   : [{tenant_id, source_id, relevance}]  (Schicht 5)
//   input.tenantOverrides   : [{tenant_id, source_id, action, replacement_source_id?}] (Schicht 6)
//   input.privateSources    : [{tenant_id, id, ...record}]  (Schicht 7)
function resolveTenantSources(tenantId, input = {}) {
  const T = tid(tenantId);
  if (!T) return { tenant_id: "", sources: [], violations: ["leere-tenant-id"] };

  const violations = [];
  const globalById = toMap(input.globalCatalogById);
  const chosen = new Map(); // key -> resolution (globale: source_id; private: 'priv:<tenant>:<id>')

  // Private Quellen tragen nur INNERHALB des Mandanten eindeutige IDs (PK tenant_id+id). Deshalb
  // werden sie unter einem mandanten-namespaced Schluessel gefuehrt, damit eine private ID niemals
  // eine gleichnamige globale Referenz ueberschreibt (Review-Fund).
  const privKey = (id) => `priv:${T}:${id}`;

  // Schicht 4: mandatsbezogene globale Zuweisung (nur Referenz auf den globalen Katalog).
  for (const sid of input.mandateSourceIds || []) {
    if (!globalById.has(sid)) continue; // nie eine nicht-existente Quelle referenzieren
    chosen.set(sid, { source_id: sid, origin: "mandate_global", relevance: 1, private: false });
  }

  // Schicht 5: mandantenspezifische Relevanz (nur eigene tenant_id).
  for (const r of input.tenantRelevance || []) {
    if (tid(r.tenant_id) !== T) continue; // Fremd-Tenant strikt ignorieren
    if (!globalById.has(r.source_id)) continue;
    const cur = chosen.get(r.source_id) || { source_id: r.source_id, origin: "tenant_selection", private: false };
    cur.relevance = Number.isFinite(r.relevance) ? r.relevance : (cur.relevance ?? 1);
    chosen.set(r.source_id, cur);
  }

  // Schicht 7: private, kundenspezifische Quellen — NUR die des eigenen Mandanten. Vor den
  // Korrekturen, damit ein Override (mute/pin/…) auch eine private Quelle treffen kann.
  for (const p of input.privateSources || []) {
    if (tid(p.tenant_id) !== T) {
      // Ein Fremd-Tenant-Datensatz darf NIE hier ankommen; falls doch -> harte Verletzung melden.
      violations.push(`fremde-private-quelle-abgewiesen:${tid(p.tenant_id)}`);
      continue;
    }
    chosen.set(privKey(p.id), { source_id: p.id, origin: "tenant_private", relevance: p.relevance ?? 1, private: true, tenant_id: T });
  }

  // Schicht 6: manuelle Korrekturen (nur eigene tenant_id) — pin/mute/boost/demote/replace.
  // Wirken sowohl auf globale (Schluessel = source_id) als auch private (Schluessel = privKey).
  const keyOfChosen = (sid) => (chosen.has(sid) ? sid : (chosen.has(privKey(sid)) ? privKey(sid) : null));
  for (const o of input.tenantOverrides || []) {
    if (tid(o.tenant_id) !== T) continue;
    if (!OVERRIDE_ACTIONS.includes(o.action)) { violations.push(`unbekannte-korrektur:${o.action}`); continue; }
    if (o.action === "mute") { const k = keyOfChosen(o.source_id); if (k) chosen.delete(k); continue; }
    if (o.action === "pin") {
      if (globalById.has(o.source_id)) chosen.set(o.source_id, { source_id: o.source_id, origin: "tenant_pin", relevance: 2, private: false });
      continue;
    }
    if (o.action === "replace") {
      const k = keyOfChosen(o.source_id); if (k) chosen.delete(k);
      if (o.replacement_source_id && globalById.has(o.replacement_source_id)) {
        chosen.set(o.replacement_source_id, { source_id: o.replacement_source_id, origin: "tenant_replace", relevance: 1, private: false });
      }
      continue;
    }
    if (o.action === "boost" || o.action === "demote") {
      const k = keyOfChosen(o.source_id);
      const cur = k ? chosen.get(k) : null;
      if (cur) cur.relevance = o.action === "boost" ? (cur.relevance ?? 1) + 1 : (cur.relevance ?? 1) - 1;
      continue;
    }
  }

  const sources = [...chosen.values()].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || String(a.source_id).localeCompare(String(b.source_id)));
  return { tenant_id: T, sources, violations, globalReferencedCount: sources.filter((s) => !s.private).length, privateCount: sources.filter((s) => s.private).length };
}

// Harte Isolationspruefung (Test §11): sieht Mandant A jemals eine private Quelle von B?
// Robust ueber die am aufgeloesten Datensatz vermerkte tenant_id (unabhaengig davon, ob dem
// Aufrufer der Gesamtbestand vorliegt) PLUS optionaler (tenant_id,id)-Abgleich gegen allPrivateSources.
// Da resolveTenantSources private Quellen NUR mit eigener tenant_id aufnimmt, ist leaked hier
// per Konstruktion leer — die Pruefung ist die zweite Verteidigungslinie.
function assertPrivateIsolation(tenantId, resolved, allPrivateSources = []) {
  const T = tid(tenantId);
  const leakedByTenant = resolved.sources
    .filter((s) => s.private && s.tenant_id != null && tid(s.tenant_id) !== T)
    .map((s) => s.source_id);
  const foreign = new Set(allPrivateSources.filter((p) => tid(p.tenant_id) !== T).map((p) => `${tid(p.tenant_id)}::${p.id}`));
  const leakedByPair = resolved.sources
    .filter((s) => s.private && s.tenant_id != null && foreign.has(`${tid(s.tenant_id)}::${s.source_id}`))
    .map((s) => s.source_id);
  const leaked = [...new Set([...leakedByTenant, ...leakedByPair])];
  return { isolated: leaked.length === 0, leaked };
}

function toMap(x) {
  if (x instanceof Map) return x;
  const m = new Map();
  if (Array.isArray(x)) for (const r of x) m.set(r.id, r);
  else if (x && typeof x === "object") for (const k of Object.keys(x)) m.set(k, x[k]);
  return m;
}

module.exports = { SCOPE_LAYERS, OVERRIDE_ACTIONS, resolveTenantSources, assertPrivateIsolation };
