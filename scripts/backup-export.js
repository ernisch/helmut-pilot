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

// PRE-SEED-MODUS (2026-07-25, Vorbereitung Quellen-Seed-Einspielung):
//   node scripts/backup-export.js --scope=seed
// Exportiert NUR die 8 Tabellen, die die beiden Quellen-Seeds beruehren. Zweck:
// eine gezielte, kleine Sicherung genau der Datensaetze, die zurueckgerollt
// werden muessten — und deutlich weniger personenbezogene Daten auf der Platte
// als beim Voll-Export. Das Manifest wird als `art: "pre-seed"` gekennzeichnet.
//
// VOLLSTAENDIGKEIT (seit 2026-07-25): je Tabelle wird die Zeilenzahl serverseitig
// per `Prefer: count=exact` gegengeprueft. Weicht die exportierte Zahl ab, gilt der
// Export als UNVOLLSTAENDIG (Fehlerliste + Exit 1). Vorher konnte eine serverseitig
// gekappte Seite (PostgREST `max-rows` < PAGE_SIZE) die Paginierung still beenden
// und ein Teil-Backup sah wie ein vollstaendiges aus.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

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

// Genau die Tabellen, die die beiden Quellen-Seeds (20260713 + 20260717) beruehren —
// direkt betroffen ODER per Fremdschluessel/Cascade daran haengend. Reihenfolge =
// FK-sichere Restore-Reihenfolge (Eltern vor Kindern).
const SEED_SCOPE_TABLES = [
  "geographies",
  "political_entities",
  "publishers",
  "retrieval_paths",
  "source_packages",
  "package_paths",
  "path_expected_levels",
  "path_expected_geographies"
];

async function fetchPage(baseUrl, key, table, orderCols, offset) {
  const order = String(orderCols).split(",").map((c) => `${c.trim()}.asc`).join(",");
  const url = `${baseUrl}/rest/v1/${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fuer ${table} (offset ${offset})`);
  return res.json();
}

// Serverseitige Zeilenzahl (PostgREST Content-Range, z. B. "0-0/162"). Nur damit
// laesst sich ein still gekappter Export erkennen; null = Server liefert keine Zahl.
async function fetchCount(baseUrl, key, table) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei Zeilenzahl fuer ${table}`);
  const range = res.headers.get("content-range") || "";
  const total = String(range).split("/")[1];
  return total && /^\d+$/.test(total) ? Number(total) : null;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// main-Commit, gegen den gesichert wurde — sonst ist beim Restore unklar, welcher
// Sollzustand gilt. Fehlt git, bleibt das Feld null (kein harter Fehler).
function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
  } catch (_) { return null; }
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

  const seedScope = process.argv.includes("--scope=seed");
  const tableNames = seedScope ? SEED_SCOPE_TABLES.slice() : Object.keys(TABLES);
  const manifest = {
    art: seedScope ? "pre-seed" : "voll",
    erstellt: new Date().toISOString(),
    mainCommit: gitCommit(),
    quelle: baseUrl.replace(/^https?:\/\//, "").split(".")[0],
    tabellen: {},
    pruefsummen: {},
    fehler: []
  };
  if (seedScope) {
    manifest.zweck = "Pre-Seed-Sicherung vor Einspielung von 20260713_source_architecture_seed.sql + 20260717_landesmodul_be_bb_seed.sql";
    manifest.restoreReihenfolge = SEED_SCOPE_TABLES.slice();
  }
  for (const table of tableNames) {
    try {
      const erwartet = await fetchCount(baseUrl, key, table);
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(baseUrl, key, table, TABLES[table], offset);
        rows.push(...page);
        if (!Array.isArray(page) || page.length < PAGE_SIZE) break;
      }
      // Vollstaendigkeitsprobe: ein still gekappter Export darf NIE als ok gelten.
      if (erwartet !== null && rows.length !== erwartet) {
        throw new Error(`unvollstaendig: ${rows.length} exportiert, ${erwartet} erwartet`);
      }
      const json = JSON.stringify(rows);
      fs.writeFileSync(path.join(dir, `${table}.json`), json);
      manifest.tabellen[table] = rows.length;
      manifest.pruefsummen[table] = sha256(json);
      console.log(`OK    ${table}: ${rows.length} Zeilen${erwartet === null ? " (Zeilenzahl serverseitig nicht bestaetigt)" : ""}`);
    } catch (error) {
      manifest.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 200) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }
  // Ein Backup mit Fehlern ist KEIN Backup — im Manifest unmissverstaendlich markieren,
  // damit ein Teil-Export nicht spaeter faelschlich als Wiederherstellungsgrundlage gilt.
  manifest.vollstaendig = manifest.fehler.length === 0 && Object.keys(manifest.tabellen).length === tableNames.length;
  manifest.pruefsummeGesamt = sha256(JSON.stringify(manifest.pruefsummen));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup unter ${dir}`);
  console.log(`Art: ${manifest.art} · Tabellen ok: ${Object.keys(manifest.tabellen).length}/${tableNames.length} · Fehler: ${manifest.fehler.length}`);
  console.log(manifest.vollstaendig ? "VOLLSTAENDIG — als Wiederherstellungsgrundlage verwendbar."
    : "UNVOLLSTAENDIG — NICHT als Wiederherstellungsgrundlage verwenden.");
  process.exit(manifest.vollstaendig ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { TABLES, SEED_SCOPE_TABLES };
