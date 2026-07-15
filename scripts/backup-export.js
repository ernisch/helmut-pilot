"use strict";

// Betreiber-Backup (Audit 2026-07, Sprint 7): liest ALLE Helmut-Daten aus
// Supabase (Blob-Store + V3-Tabellen) und legt sie lokal als JSON ab.
// AUSSCHLIESSLICH LESEND (nur GET) — kein Write, keine Migration, kein Delete.
//
// Hintergrund: Supabase laeuft (Stand Audit) auf dem Free-Plan ohne
// automatische Backups/PITR; der zentrale Blob ist Last-Write-Wins. Bis
// Freigabepunkt F7 (Supabase Pro + PITR) umgesetzt ist, ist dieses Skript die
// EINZIGE Wiederherstellungsgrundlage. Danach bleibt es als Zweitsicherung
// (Offsite-Kopie) sinnvoll.
//
// Aufruf (lokal, mit .env.local des Betreibers):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
// Ablage: ./backups/<UTC-Zeitstempel>/<tabelle>.json + manifest.json
// WICHTIG: ./backups/ ist gitignored — Backups NIE committen (enthalten
// personenbezogene/politische Daten). Ablage nur auf verschluesseltem Geraet.

const fs = require("fs");
const path = require("path");

const TABLES = [
  "helmut_store",
  "profiles", "mandate_profiles",
  "raw_documents", "knowledge_objects", "ko_document_links", "ko_relations",
  "decisions", "briefings", "matching_results", "matching_weights",
  "profile_embeddings", "office_outputs", "topic_memory", "interactions",
  "user_notes", "daily_tasks", "communication_drafts", "political_items",
  "personalized_recommendations", "priority_changes", "llm_usage",
  "pipeline_locks", "sources",
  "publishers", "retrieval_paths", "source_packages", "package_paths",
  "political_entities", "geographies", "electoral_districts",
  "path_expected_levels", "path_expected_geographies", "path_expected_topics",
  "path_expected_entities", "document_findings", "gate_shadow_events"
];

const PAGE_SIZE = 1000;

async function fetchPage(baseUrl, key, table, offset) {
  const url = `${baseUrl}/rest/v1/${table}?select=*&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${table} (offset ${offset})`);
  return res.json();
}

(async () => {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!baseUrl || !key) {
    console.error("FEHLER: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein (.env.local).");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = { erstellt: new Date().toISOString(), quelle: baseUrl.replace(/^https?:\/\//, "").split(".")[0], tabellen: {}, fehler: [] };
  for (const table of TABLES) {
    try {
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(baseUrl, key, table, offset);
        rows.push(...page);
        if (!Array.isArray(page) || page.length < PAGE_SIZE) break;
      }
      fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows));
      manifest.tabellen[table] = rows.length;
      console.log(`OK    ${table}: ${rows.length} Zeilen`);
    } catch (error) {
      manifest.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 200) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup unter ${dir}`);
  console.log(`Tabellen ok: ${Object.keys(manifest.tabellen).length}/${TABLES.length}, Fehler: ${manifest.fehler.length}`);
  process.exit(manifest.fehler.length ? 1 : 0);
})();
