"use strict";

// Provenienz-Backfill: rekonstruiert ko_document_links + best_source_url fuer
// BEREITS verstandene Vorgaenge (die vor dem Provenienz-Fix erzeugt wurden),
// OHNE erneuten KI-Call. Nutzt dieselbe deterministische Clusterung wie das
// Understanding (clusterRawDocuments + deriveVorgangId) und ordnet jedes Cluster
// ueber die stabile vorgang_id seinem KO zu.
//
// Idempotent: KOs mit bereits vorhandenen Quellen-Verknuepfungen werden uebersprungen.
// deps injizierbar -> offline testbar (ohne Supabase).

const { clusterRawDocuments, deriveVorgangId } = require("./understanding");

// Rangfolge wie dedup.rowRank / understanding.pickBestSourceDoc.
function pickBestSourceDoc(documents = []) {
  const docs = (Array.isArray(documents) ? documents : []).filter(Boolean);
  if (!docs.length) return null;
  const rank = (d) => {
    let s = 0;
    if ((d.link_type || d.linkType) === "direct") s += 20;
    if (d.confidence === "high") s += 10;
    if (d.canonical_url || d.url) s += 5;
    return s;
  };
  return docs.slice().sort((a, b) =>
    (rank(b) - rank(a)) || String(b.published_at || "").localeCompare(String(a.published_at || ""))
  )[0];
}

async function backfillProvenance(opts = {}, deps = {}) {
  const storage = deps.storage || require("./storage");
  const listRawDocuments = deps.listRawDocuments || ((o) => storage.listRawDocuments(o));
  const days = Number(opts.days) || 45;
  const limit = Number(opts.limit) || 800;
  const dryRun = Boolean(opts.dryRun);

  if (typeof storage.v3StoreReady === "function" && !storage.v3StoreReady()) {
    return { skipped: true, reason: "v3-store-not-ready" };
  }

  const kos = await storage.listKnowledgeObjects({ limit: 500 });
  const complete = (kos || []).filter((k) => k && k.understanding_status === "complete" && k.vorgang_id);
  if (!complete.length) return { skipped: true, reason: "no-complete-kos", total: 0 };

  const rawDocs = await listRawDocuments({ limit, days });
  const clusters = clusterRawDocuments(rawDocs || []);
  const byVorgang = new Map(clusters.map((c) => [deriveVorgangId(c), c]));

  const res = {
    total: complete.length, dryRun,
    linked: 0, skippedExisting: 0, noCluster: 0, bestSourceSet: 0, errors: 0,
    rawDocuments: (rawDocs || []).length, clusters: clusters.length
  };

  for (const ko of complete) {
    try {
      const existing = await storage.getSourcesForVorgang(ko.vorgang_id).catch(() => []);
      if (existing && existing.length) { res.skippedExisting += 1; continue; }

      const cluster = byVorgang.get(ko.vorgang_id);
      const docs = (cluster && cluster.documents) || [];
      if (!docs.length) { res.noCluster += 1; continue; }

      if (!dryRun) await storage.saveKoDocumentLinks(ko.id, docs);
      res.linked += 1;

      if (!ko.best_source_url) {
        const best = pickBestSourceDoc(docs);
        if (best) {
          if (!dryRun) {
            await storage.saveKnowledgeObject({
              id: ko.id,
              vorgang_id: ko.vorgang_id,
              best_source_url: best.url || best.canonical_url || null,
              best_link_type: best.link_type || null,
              source_trust: best.confidence || null
            });
          }
          res.bestSourceSet += 1;
        }
      }
    } catch (error) {
      res.errors += 1;
    }
  }
  return res;
}

module.exports = { backfillProvenance, pickBestSourceDoc };
