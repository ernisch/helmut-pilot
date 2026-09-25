"use strict";
// Ein eigener fest gebundener Auftrag. Keine Erweiterung des abgeschlossenen169er Datensatzes.
const crypto = require("node:crypto");
const FRISCHE30 = Object.freeze({
  // Commit des geprueften Importplans, kein behaupteter Production-Snapshot-Commit.
  commit: "8d1ea932c3e4ad5cce77f93de7da57113c85a7c9",
  dokumente: 30, idHash: "e877d2e7fa0d583a3ebcd9c531fe74a2465a6006083c291b8e919249db9f44e3",
  cluster: 26, clusterGroessen: Object.freeze({ 1: 24, 3: 2 }),
  maxModellaufrufe: 26, maxUsd: 0.8, maxMs: 15 * 60000
});
const QUITTUNG = "verstehen30-20260925-a";
const INHALT_HASH = "7492cfec6edffe7ddd0a1a00f862d1569d26278f2c98ef6cc0a4d4394c3a9350";
const FELDER = ["id", "title", "summary", "url", "canonical_url", "source_name", "source_id", "source_type", "confidence", "link_type", "published_at", "retrieved_at"];
function inhaltsHash(docs) {
  const rows = docs.map(d => Object.fromEntries(FELDER.map(k => [k,
    k === "published_at" || k === "retrieved_at" ? new Date(d[k]).toISOString() : d[k] ?? null])))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function pruefeInhalt(docs, now = Date.now()) {
  try {
    return docs.length === 30 && inhaltsHash(docs) === INHALT_HASH && docs.every(d =>
      [d.published_at, d.retrieved_at].every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000));
  } catch (_) { return false; }
}
module.exports = { FRISCHE30, QUITTUNG, INHALT_HASH, inhaltsHash, pruefeInhalt };
