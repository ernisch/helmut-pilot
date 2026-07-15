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
// EHRLICHE GRENZE: Das ist KEIN transaktionaler DB-Snapshot. Die Tabellen
// werden sequenziell ueber REST gelesen; laufen waehrend des Exports Writes,
// koennen Querbezuege zwischen Tabellen inkonsistent sein. Deshalb: Export nur
// zu nutzungsarmer Zeit (vor dem 20:00-UTC-Crawl), Details im Runbook
// docs/betrieb/backup-restore-runbook.md Abschnitt 1.
//
// Aufruf (lokal, mit .env.local des Betreibers):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
// Ablage: ./backups/<UTC-Zeitstempel>/<tabelle>.json + manifest.json
// WICHTIG: ./backups/ ist gitignored — Backups NIE committen (enthalten
// personenbezogene/politische Daten). Ablage nur auf verschluesseltem Geraet;
// Retention + Verschluesselung vor Offsite-Kopie: Runbook Abschnitt 1b.

const fs = require("fs");
const path = require("path");

// Tabelle -> Primaerschluessel-Spalten (aus supabase/schema.sql + Migrationen).
// Der PK dient als deterministisches order= beim Export: stabile Sortierung
// macht Exporte vergleichbar und die limit/offset-Paginierung konsistent
// (PostgREST garantiert ohne order= KEINE stabile Seitenreihenfolge).
const TABLES = {
  helmut_store: "id",
  profiles: "id",
  mandate_profiles: "user_id",
  raw_documents: "id",
  knowledge_objects: "id",
  ko_document_links: "knowledge_object_id,raw_document_id",
  ko_relations: "from_ko_id,to_ko_id,relation_type",
  decisions: "id",
  briefings: "id",
  matching_results: "id",
  matching_weights: "user_id",
  profile_embeddings: "user_id",
  office_outputs: "id",
  topic_memory: "id",
  interactions: "id",
  user_notes: "id",
  daily_tasks: "id",
  communication_drafts: "id",
  political_items: "id",
  personalized_recommendations: "id",
  priority_changes: "id",
  llm_usage: "id",
  llm_budget_counters: "day,scope",
  pipeline_locks: "job_name",
  sources: "id",
  publishers: "id",
  retrieval_paths: "id",
  source_packages: "id",
  package_paths: "package_id,retrieval_path_id",
  political_entities: "id",
  geographies: "id",
  electoral_districts: "id",
  path_expected_levels: "retrieval_path_id,level",
  path_expected_geographies: "retrieval_path_id,geography_id",
  path_expected_topics: "retrieval_path_id,topic",
  path_expected_entities: "retrieval_path_id,entity_id",
  document_findings: "raw_document_id,source_id,original_url",
  gate_shadow_events: "id"
};

const PAGE_SIZE = 1000;

async function fetchPage(baseUrl, key, table, orderCols, offset) {
  const order = String(orderCols).split(",").map((c) => `${c.trim()}.asc`).join(",");
  const url = `${baseUrl}/rest/v1/${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${table} (offset ${offset})`);
  return res.json();
}

async function main() {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!baseUrl || !key) {
    console.error("FEHLER: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein (.env.local).");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const tableNames = Object.keys(TABLES);
  const manifest = { erstellt: new Date().toISOString(), quelle: baseUrl.replace(/^https?:\/\//, "").split(".")[0], tabellen: {}, fehler: [] };
  for (const table of tableNames) {
    try {
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(baseUrl, key, table, TABLES[table], offset);
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
  console.log(`Tabellen ok: ${Object.keys(manifest.tabellen).length}/${tableNames.length}, Fehler: ${manifest.fehler.length}`);
  process.exit(manifest.fehler.length ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { TABLES };
