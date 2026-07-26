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
// Aufruf lokal (mit .env.local des Betreibers):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-export.js
// Aufruf in einer Claude-Code-Cloud-Sitzung: identischer Befehl, ohne Praefix — die
// beiden Variablen muessen vorab in den Environment-Einstellungen der Cloud-Umgebung
// hinterlegt sein (niemals im Chat, niemals in einem Commit). Siehe CLAUDE.md §4.9
// und docs/betrieb/env-inventar.md §8. Das Skript liest ausschliesslich process.env
// und ist gegenueber dem Herkunftskanal der Variablen blind.
// Ablage: ./backups/<UTC-Zeitstempel>/<tabelle>.json + manifest.json
// WICHTIG: ./backups/ ist gitignored — Backups NIE committen (enthalten
// personenbezogene/politische Daten). Ablage nur auf verschluesseltem Geraet;
// Retention + Verschluesselung vor Offsite-Kopie: Runbook Abschnitt 1b.

// TEIL-UMFAENGE (`--scope=`): `voll` (Standard, alle Tabellen) · `seed` (8 Quellentabellen) ·
// `profil` (2 Profiltabellen, seit Punkt 14B). Uebersicht + Zweck je Umfang:
// docs/betrieb/backup-restore-runbook.md Abschnitt 1a.
//
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

// PROFIL-MODUS (2026-07-26, Phase-1-Punkt 14B): `node scripts/backup-export.js --scope=profil`
// Genau die zwei Tabellen, die das Anlegen des Berliner Abnahmeprofils beruehrt
// (supabase/seeds/20260726_berlin_abnahmeprofil.sql). Warum ein eigener Umfang noetig war:
// `--scope=seed` sichert die 8 QUELLEN-Tabellen und damit KEINE der beiden Profiltabellen —
// die Vorbereitung fuer Schritt 5 der Aktivierungsreihenfolge hatte bis 14B also gar keine
// passende Sicherung. `--scope=voll` deckt sie ab, zieht aber zusaetzlich raw_documents,
// briefings, interactions und user_notes auf die Platte und hebt damit genau die
// Datenminimierung auf, wegen der es die Teil-Umfaenge gibt.
// Reihenfolge = FK-sichere Restore-Reihenfolge (Eltern vor Kindern:
// mandate_profiles.user_id -> profiles.id ON DELETE CASCADE).
// EHRLICHE GRENZE: `profiles` traegt Klarnamen realer Mandatstraeger. Auch dieser kleine
// Export ist personenbezogen und gehoert auf ein verschluesseltes Geraet (Runbook 1b).
const PROFIL_SCOPE_TABLES = [
  "profiles",
  "mandate_profiles"
];

const SCOPES = {
  voll: null,                       // null = alle Tabellen aus TABLES
  seed: SEED_SCOPE_TABLES,
  profil: PROFIL_SCOPE_TABLES
};

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
  // Argumente streng pruefen (Review PR #125, Befund 2): `--scope seed` mit Leerzeichen
  // oder ein Tippfehler fiel frueher still auf den VOLL-Export zurueck — und der zieht
  // auch raw_documents, briefings, user_notes und interactions auf die Platte. Genau die
  // Datenminimierung, wegen der es den Seed-Modus gibt, war damit unbemerkt aufgehoben.
  // ZUERST pruefen, VOR jedem Verzeichnis: ein abgewiesener Aufruf darf keinen leeren
  // Ordner hinterlassen, der spaeter wie ein Backup aussieht.
  let scope = "voll";
  for (const arg of process.argv.slice(2)) {
    const m = /^--scope=(.*)$/.exec(arg);
    if (m && Object.prototype.hasOwnProperty.call(SCOPES, m[1])) { scope = m[1]; continue; }
    console.error(`FEHLER: unbekanntes Argument '${arg}'. Erlaubt: ${Object.keys(SCOPES).map((s) => "--scope=" + s).join(", ")} (Standard: voll).`);
    process.exit(2);
  }
  const seedScope = scope === "seed";
  const profilScope = scope === "profil";

  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!baseUrl || !key) {
    console.error("FEHLER: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein (.env.local).");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const tableNames = SCOPES[scope] ? SCOPES[scope].slice() : Object.keys(TABLES);
  const manifest = {
    art: seedScope ? "pre-seed" : (profilScope ? "pre-profil" : "voll"),
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
  if (profilScope) {
    manifest.zweck = "Pre-Profil-Sicherung vor Ausfuehrung von 20260726_berlin_abnahmeprofil.sql (Schritt 5 der Berliner Aktivierungsreihenfolge)";
    manifest.restoreReihenfolge = PROFIL_SCOPE_TABLES.slice();
  }
  for (const table of tableNames) {
    try {
      const erwartet = await fetchCount(baseUrl, key, table);
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(baseUrl, key, table, TABLES[table], offset);
        if (!Array.isArray(page)) throw new Error(`unerwartete Antwort (kein Array) bei offset ${offset}`);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      // Vollstaendigkeitsprobe: ein still gekappter Export darf NIE als ok gelten.
      if (erwartet === null) {
        throw new Error("Zeilenzahl serverseitig nicht bestaetigt (kein Content-Range) — Vollstaendigkeit nicht pruefbar");
      }
      if (rows.length !== erwartet) {
        throw new Error(`unvollstaendig: ${rows.length} exportiert, ${erwartet} erwartet`);
      }
      const json = JSON.stringify(rows);
      fs.writeFileSync(path.join(dir, `${table}.json`), json);
      manifest.tabellen[table] = rows.length;
      manifest.pruefsummen[table] = sha256(json);
      console.log(`OK    ${table}: ${rows.length} Zeilen`);
    } catch (error) {
      manifest.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 200) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }
  // PLAUSIBILISIERUNG (2026-07-25, Review PR #125, Befund 1): Ein technisch
  // fehlerfreier Lauf kann trotzdem wertlos sein. Auf allen acht Quellentabellen ist
  // RLS aktiv, es existiert aber KEINE Policy (20260713_source_architecture.sql:205).
  // Ein Zugriff mit anon-/publishable-Key oder gegen ein falsches Projekt ist deshalb
  // kein Fehler, sondern liefert HTTP 200 mit `[]` — frueher lief das als
  // `vollstaendig: true` durch und haette das Go-/Stop-Gate des Runbooks bestanden.
  // Ein leeres Backup ist keine Wiederherstellungsgrundlage.
  const summe = Object.values(manifest.tabellen).reduce((a, b) => a + b, 0);
  if (Object.keys(manifest.tabellen).length > 0 && summe === 0) {
    manifest.fehler.push({
      tabelle: "(alle)",
      fehler: "0 Zeilen ueber alle Tabellen — vermutlich falscher Schluessel (kein service_role) oder falsches Projekt"
    });
  }
  // Im Pre-Seed-Modus ist zusaetzlich belegbar, WELCHE Tabellen nicht leer sein duerfen:
  // ohne Abrufwege, Pakete und Zuordnungen gibt es nichts zurueckzurollen. Bewusst nur
  // "> 0" und keine festen Sollzahlen — absolute Zahlen driften (die Production-Inventur
  // vom 2026-07-25 weicht bereits vom Code-Seed ab) und wuerden hier falsch alarmieren.
  if (seedScope) {
    for (const t of ["retrieval_paths", "source_packages", "package_paths"]) {
      if (manifest.tabellen[t] === 0) {
        manifest.fehler.push({ tabelle: t, fehler: "0 Zeilen — als Pre-Seed-Sicherung unbrauchbar" });
      }
    }
  }
  // Dieselbe Logik fuer den Profil-Umfang: eine Sicherung ohne Mandatsbestand kann den
  // Zustand vor dem Anlegen des Abnahmeprofils nicht belegen und ist damit unbrauchbar.
  if (profilScope) {
    for (const t of PROFIL_SCOPE_TABLES) {
      if (manifest.tabellen[t] === 0) {
        manifest.fehler.push({ tabelle: t, fehler: "0 Zeilen — als Pre-Profil-Sicherung unbrauchbar" });
      }
    }
  }
  // Ein Backup mit Fehlern ist KEIN Backup — im Manifest unmissverstaendlich markieren,
  // damit ein Teil-Export nicht spaeter faelschlich als Wiederherstellungsgrundlage gilt.
  manifest.vollstaendig = manifest.fehler.length === 0 && Object.keys(manifest.tabellen).length === tableNames.length;
  manifest.pruefsummeGesamt = sha256(JSON.stringify(manifest.pruefsummen));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup unter ${dir}`);
  console.log(`Art: ${manifest.art} · Tabellen ok: ${Object.keys(manifest.tabellen).length}/${tableNames.length} · Fehler: ${manifest.fehler.length}`);
  // Die Meldung muss den Umfang mitsagen: ein Pre-Seed-Backup ist fuer SEINEN Zweck
  // vollstaendig, deckt aber nur 8 der Tabellen ab — nicht die uebrige Datenbank.
  if (!manifest.vollstaendig) {
    console.log("UNVOLLSTAENDIG — NICHT als Wiederherstellungsgrundlage verwenden.");
    for (const f of manifest.fehler) console.log(`      ${f.tabelle}: ${f.fehler}`);
  } else if (seedScope) {
    console.log(`VOLLSTAENDIG fuer die ${tableNames.length} Quellentabellen (pre-seed) — deckt die uebrigen`
      + ` ${Object.keys(TABLES).length - tableNames.length} Tabellen ausdruecklich NICHT ab.`);
  } else if (profilScope) {
    console.log(`VOLLSTAENDIG fuer die ${tableNames.length} Profiltabellen (pre-profil) — deckt die uebrigen`
      + ` ${Object.keys(TABLES).length - tableNames.length} Tabellen ausdruecklich NICHT ab.`);
  } else {
    console.log("VOLLSTAENDIG — als Wiederherstellungsgrundlage verwendbar.");
  }
  process.exit(manifest.vollstaendig ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { TABLES, SEED_SCOPE_TABLES, PROFIL_SCOPE_TABLES, SCOPES };
