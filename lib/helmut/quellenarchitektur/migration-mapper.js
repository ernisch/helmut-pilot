"use strict";

const { classifyOrphanId } = require("./catalog");

// Helmut — Quellenarchitektur · Sprint 6: Migrations-Mapper-Validierung.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Validiert den De-facto-Migrations-Mapper (catalog.buildCatalog: v1Sources -> Abrufwege)
// gegen die REAL beobachteten Quellen in raw_documents (source_id/source_name). Ziel des
// Auftrags: bei der Überführung der bestehenden Quellen darf KEINE Quelle mit Dokumenten
// unbemerkt verloren gehen; Orphans/Testmüll werden ehrlich klassifiziert.
//
// EHRLICHKEIT: `observedSources` (aus raw_documents) sind INJIZIERT und optional. Fehlen sie,
// wird das ehrlich als availability.observedSources=false ausgewiesen (kein erfundener Abgleich).
// Eine beobachtete source_id gilt als ERKLÄRT, wenn sie entweder einen Abrufweg
// (legacy_source_id) besitzt ODER in der Orphan-Klassifikation steht. Alles andere ist ein
// echter Befund („unerklärte Quelle mit Dokumenten" = Datenverlust-Risiko bei Migration).

function nameKey(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }

// Baut die Nachschlage-Indizes aus dem Katalog.
function indexCatalog(catalog) {
  const paths = (catalog && catalog.retrievalPaths) || [];
  const legacyIds = new Set();
  const pathByLegacy = new Map();
  for (const p of paths) {
    if (!p || p.legacy_source_id == null) continue;
    const id = String(p.legacy_source_id);
    legacyIds.add(id);
    if (!pathByLegacy.has(id)) pathByLegacy.set(id, p);
  }
  const pubById = new Map(((catalog && catalog.publishers) || []).map((pu) => [pu.id, pu]));
  return { legacyIds, pathByLegacy, pubById };
}

function validateMigration({ catalog, orphanClassification = {}, observedSources = null } = {}) {
  const { legacyIds, pathByLegacy, pubById } = indexCatalog(catalog);
  const unmappedPackages = (catalog && Array.isArray(catalog.unmapped)) ? catalog.unmapped.slice() : [];

  const observedAvailable = Array.isArray(observedSources);
  const observed = observedAvailable ? observedSources : [];

  const mappedObserved = [];      // beobachtet + hat Abrufweg
  const orphanObserved = [];      // beobachtet + als Orphan erklärt
  const unexplainedObserved = []; // beobachtet, aber WEDER gemappt NOCH Orphan -> Datenverlust-Risiko
  const nameDrift = [];           // gemappt, aber source_name weicht vom Katalognamen ab (nur Info)

  for (const row of observed) {
    if (!row) continue;
    const id = String(row.source_id == null ? "" : row.source_id).trim();
    if (!id) continue;
    const count = Number.isFinite(Number(row.count)) ? Number(row.count) : null;
    const observedName = row.source_name != null ? String(row.source_name) : null;
    if (legacyIds.has(id)) {
      mappedObserved.push({ source_id: id, count });
      // Namensdrift nur informativ (bei Google-News weicht source_name = Herausgebername bewusst ab).
      const path = pathByLegacy.get(id);
      const catalogName = path ? path.name : null;
      const pub = path && pubById.get(path.publisher_id);
      const pubName = pub ? pub.name : null;
      if (observedName && catalogName && nameKey(observedName) !== nameKey(catalogName) && (!pubName || nameKey(observedName) !== nameKey(pubName))) {
        nameDrift.push({ source_id: id, observedName, catalogName, publisherName: pubName || null });
      }
    } else if (Object.prototype.hasOwnProperty.call(orphanClassification, id) || classifyOrphanId(id)) {
      // Explizite Karte des Aufrufers hat Vorrang; sonst greift die neutrale
      // Muster-Klassifikation (catalog.classifyOrphanId) fuer Bestandsdaten.
      const klass = Object.prototype.hasOwnProperty.call(orphanClassification, id)
        ? orphanClassification[id]
        : classifyOrphanId(id);
      orphanObserved.push({ source_id: id, classification: klass, count });
    } else {
      unexplainedObserved.push({ source_id: id, source_name: observedName, count });
    }
  }

  // Verdict: kritisch, wenn eine unerklärte Quelle Dokumente liefert (Datenverlust-Risiko);
  // sonst Warnung bei unmapped Paketen/unerklärten-ohne-Dokumente; sonst ok.
  const unexplainedWithDocs = unexplainedObserved.filter((u) => u.count == null || u.count > 0);
  let verdict;
  if (unexplainedWithDocs.length > 0) verdict = "kritisch";
  else if (unmappedPackages.length > 0 || unexplainedObserved.length > 0) verdict = "warnungen";
  else verdict = "ok";

  return {
    availability: { observedSources: observedAvailable },
    counts: {
      legacyIds: legacyIds.size,
      observed: observed.length,
      mapped: mappedObserved.length,
      orphan: orphanObserved.length,
      unexplained: unexplainedObserved.length,
      unexplainedWithDocs: unexplainedWithDocs.length,
      unmappedPackages: unmappedPackages.length,
      nameDrift: nameDrift.length
    },
    mappedObserved, orphanObserved, unexplainedObserved, unmappedPackages, nameDrift,
    verdict,
    summary: verdict === "kritisch"
      ? `KRITISCH: ${unexplainedWithDocs.length} beobachtete Quelle(n) mit Dokumenten haben WEDER Abrufweg NOCH Orphan-Klassifikation (Datenverlust-Risiko).`
      : verdict === "warnungen"
        ? `Warnungen: ${unmappedPackages.length} Quelle(n) ohne Paketzuordnung, ${unexplainedObserved.length} unerklärte (ohne Dokumente).`
        : (observedAvailable
            ? `OK: alle ${observed.length} beobachteten Quellen gemappt oder als Orphan erklärt; keine ohne Paket.`
            : `OK (strukturell): kein Abgleich gegen raw_documents (nicht injiziert) — Coverage nur gegen Katalog geprüft.`)
  };
}

module.exports = { validateMigration, indexCatalog };
