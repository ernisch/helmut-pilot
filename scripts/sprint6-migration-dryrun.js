"use strict";

// Helmut — Sprint 6 Stufe 1: READ-ONLY Migrations-Dryrun (Mandats-Bestandsschutz).
//
// Faehrt die echte Quellenauswahl eines Mandats (ALT: scheduler.getSourcesForProfile) gegen
// die neue Paketauflösung (NEU: resolveProfilePackages -> Abrufwege) und validiert den
// Migrations-Mapper gegen die REAL beobachteten Quellen in raw_documents — falls die DB
// read-only erreichbar ist, sonst rein strukturell (ehrlich ausgewiesen).
//
// Als Referenzmandat dient das KLAR KUENSTLICHE Fixture-Profil (fixtures/test-profiles);
// es steht kein realer Mandant im Code.
//
// STRIKT READ-ONLY: kein Storage-Write, kein Live-Crawl, kein KI-Call, keine Migration/Seed/
// Aktivierung. HELMUT_V3_STORE wird bewusst NICHT gesetzt (Schatten-Persistenz bleibt aus).
// Exit-Code 0, wenn keine echte Regression / kein Datenverlust-Risiko; sonst 1.

process.env.HELMUT_V3_STORE = process.env.HELMUT_V3_STORE || ""; // kein Schatten-Write erzwingen

const { buildCatalog, EXPLICIT_ORPHAN_CLASSIFICATION } = require("../lib/helmut/quellenarchitektur/catalog");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const mm = require("../lib/helmut/quellenarchitektur/migration-mapper");
const cs = require("../lib/helmut/quellenarchitektur/supply-shadow-compare");
const { testPoliticianOne } = require("./fixtures/test-profiles");

function line(s) { console.log(s); }

// NEU-Versorgung des Mandats: aktive Pakete -> Abrufwege -> legacy_source_ids.
function resolveNewSupply(profile) {
  const M = buildFullModel();
  const res = pp.resolveProfilePackages(profile);
  const pkgIdByKey = new Map(M.packages.map((p) => [p.key, p.id]));
  const activePkgIds = new Set((res.all || []).map((k) => pkgIdByKey.get(k)).filter(Boolean));
  const pathById = new Map(M.retrievalPaths.map((p) => [p.id, p]));
  const ids = new Set();
  for (const pk of M.packagePaths) if (activePkgIds.has(pk.package_id)) { const path = pathById.get(pk.retrieval_path_id); if (path && path.legacy_source_id) ids.add(path.legacy_source_id); }
  return { packages: res.all || [], legacyIds: ids };
}

// Read-only Versuch, echte raw_documents-Quellen zu lesen. Schlägt es fehl (keine DB-Config,
// kein Netz), wird ehrlich null zurückgegeben (rein strukturelle Validierung).
async function loadObservedSources() {
  try {
    const storage = require("../lib/helmut/storage");
    if (typeof storage.listRawDocuments !== "function") return null;
    const docs = await storage.listRawDocuments({ days: 3650, limit: 5000 });
    if (!Array.isArray(docs) || !docs.length) return null;
    const byId = new Map();
    for (const d of docs) {
      const id = String((d && (d.source_id || d.sourceId)) || "").trim();
      if (!id) continue;
      const name = (d && (d.source_name || d.sourceName)) || null;
      const cur = byId.get(id) || { source_id: id, source_name: name, count: 0 };
      cur.count += 1;
      if (!cur.source_name && name) cur.source_name = name;
      byId.set(id, cur);
    }
    return [...byId.values()];
  } catch (e) {
    return null;
  }
}

(async () => {
  line("=== Sprint 6 · READ-ONLY Migrations-Dryrun (Mandats-Bestandsschutz, Fixture-Mandat) ===\n");

  // 1) Katalog + Mapper-Coverage
  const cat = buildCatalog();
  line(`Katalog: ${cat.retrievalPaths.length} Abrufwege, ${cat.publishers.length} Herausgeber, unmapped=${cat.unmapped.length}`);

  // 2) Echte beobachtete Quellen (read-only, falls erreichbar)
  const observed = await loadObservedSources();
  line(observed ? `raw_documents: ${observed.length} beobachtete Quellen gelesen (read-only)` : "raw_documents: nicht erreichbar -> rein strukturelle Validierung (ehrlich)");

  // Orphan-Klassifikation ist musterbasiert (classifyOrphanId); explizit steht nur dip im Code.
  const vMap = mm.validateMigration({ catalog: cat, orphanClassification: EXPLICIT_ORPHAN_CLASSIFICATION, observedSources: observed });
  line(`\n[Mapper] verdict=${vMap.verdict.toUpperCase()} | legacyIds=${vMap.counts.legacyIds} mapped=${vMap.counts.mapped} orphan=${vMap.counts.orphan} unexplained=${vMap.counts.unexplained} (mitDocs=${vMap.counts.unexplainedWithDocs})`);
  line(`         ${vMap.summary}`);
  if (vMap.unexplainedObserved.length) line(`         unerklärt: ${vMap.unexplainedObserved.slice(0, 20).map((u) => u.source_id).join(", ")}`);
  if (vMap.nameDrift.length) line(`         Namensdrift (informativ): ${vMap.nameDrift.length}`);

  // 3) Mandat ALT vs NEU (Fixture-Profil; die dynamische Personenquelle "<id>-news" gehoert
  //    zum Mandat selbst und ist als deklarierte Konsolidierungs-Basis erklaert).
  const scheduler = require("../lib/helmut/scheduler");
  const altSources = await scheduler.getSourcesForProfile(testPoliticianOne);
  const altIds = altSources.map((s) => s.id);
  const neu = resolveNewSupply(testPoliticianOne);
  const docsBySource = observed ? Object.fromEntries(observed.map((o) => [o.source_id, o.count])) : null;
  const personSourceId = `${testPoliticianOne.id}-news`;
  // Die Personenquelle entsteht in BEIDEN Welten dynamisch je Mandat (kein Katalogeintrag):
  // fuer den strukturellen Mengenvergleich zaehlt sie auf beiden Seiten.
  const newIdsWithPerson = new Set([...neu.legacyIds, ...altIds.filter((id) => id === personSourceId || id.startsWith(`${personSourceId}-`))]);

  const cmp = cs.compareSupply({ altSourceIds: altIds, newSourceIds: newIdsWithPerson, orphanClassification: EXPLICIT_ORPHAN_CLASSIFICATION, docsBySource, consolidationBases: [personSourceId] });
  line(`\n[Mandat Alt-vs-Neu] verdict=${cmp.verdict.toUpperCase()} | alt=${cmp.altCount} neu=${cmp.newCount} both=${cmp.bothCount} onlyAlt=${cmp.onlyAlt.length} onlyNew=${cmp.onlyNew.length}`);
  line(`         NEU-Pakete: ${neu.packages.join(", ")}`);
  line(`         ${cmp.summary}`);
  if (cmp.onlyAltExplained.length) {
    line(`         erklärt konsolidiert (${cmp.onlyAltExplained.length}):`);
    for (const e of cmp.onlyAltExplained.slice(0, 20)) line(`           - ${e.id} [${e.reason}]${e.docs != null ? ` (${e.docs} Dok.)` : ""}`);
  }
  if (cmp.onlyAltUnexplained.length) {
    line(`         UNERKLÄRT (Prüfen!):`);
    for (const e of cmp.onlyAltUnexplained.slice(0, 20)) line(`           - ${e.id}${e.docs != null ? ` (${e.docs} Dok.)` : ""}`);
  }
  if (cmp.onlyNew.length) line(`         Gewinn (nur NEU): ${cmp.onlyNew.join(", ")}`);

  // 4) Gesamturteil
  const problem = vMap.verdict === "kritisch" || cmp.regression;
  line(`\n=== GESAMT: ${problem ? "PRÜFBEDARF (Datenverlust/Regression möglich)" : "OK — kein Datenverlust, keine Regression für das Mandat"} ===`);
  process.exit(problem ? 1 : 0);
})().catch((e) => { console.error("Dryrun-Fehler:", e.message); process.exit(2); });
