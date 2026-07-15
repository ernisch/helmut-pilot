"use strict";

// Restore-ÜBUNG (Audit-Folgearbeit, Phase 17): stellt ein mit backup-export.js
// erzeugtes Backup in eine ISOLIERTE Zielumgebung wieder her und protokolliert
// Dauer, Zeilenzahlen und Fehler. Ein ungeübter Restore ist kein Restore —
// dieses Skript macht die Übung wiederholbar und messbar.
//
// SICHERHEIT (hart erzwungen, konservativ: im Zweifel verweigern):
//   - Schreibt NIEMALS in die Quelle des Backups (manifest.quelle wird gegen
//     das Ziel geprüft) und NIEMALS ohne explizites Ziel.
//   - Verweigert Remote-Restore, wenn das Ziel SUPABASE_URL (Production)
//     entspricht — Vergleich case-insensitiv, unabhängig von http/https,
//     trailing Slash oder Pfadanhängen.
//   - Verweigert, wenn TARGET_SUPABASE_SERVICE_ROLE_KEY identisch mit
//     SUPABASE_SERVICE_ROLE_KEY (Production-Key) ist.
//   - Verweigert Remote-Restore, wenn manifest.quelle fehlt (Herkunft unklar).
//   - Production-Restore bleibt eine manuelle, freigegebene Einzelfall-
//     Entscheidung nach docs/betrieb/backup-restore-runbook.md — dieses Skript
//     verweigert sie konstruktionsbedingt.
//
// Modi:
//   --local <zielverzeichnis>
//       Stellt das Backup als lokale JSON-Dateien wieder her (Struktur- und
//       Vollständigkeitsübung, kein Netz). Validiert jede Tabelle gegen das
//       Manifest, misst die Dauer, schreibt drill-protokoll.json + .md.
//   --target-url <https://...supabase.co>  (+ TARGET_SUPABASE_SERVICE_ROLE_KEY)
//       Stellt in ein ANDERES Supabase-Projekt wieder her (Testprojekt/Branch).
//       Reihenfolge FK-sicher: Eltern vor Kindern (siehe RESTORE_ORDER).
//
// Aufruf-Beispiele:
//   node scripts/restore-drill.js --backup backups/<stamp> --local /tmp/drill
//   TARGET_SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore-drill.js \
//     --backup backups/<stamp> --target-url https://testprojekt.supabase.co
//
// Nach der Übung: Testdaten löschen (lokal: Verzeichnis entfernen; Testprojekt:
// Projekt zurücksetzen/löschen) — Erfolgskriterien + Protokoll siehe Runbook.

const fs = require("fs");
const path = require("path");

// FK-sichere Wiederherstellungsreihenfolge: Eltern zuerst. Abgeleitet aus den
// echten FK-Definitionen in supabase/schema.sql und supabase/migrations/
// (20260713_source_architecture.sql, 20260715_dedup_findings.sql,
// 20260716_gate_shadow_telemetry.sql, 20260717_llm_budget_reservation.sql).
// Strukturell abgesichert durch scripts/restore-drill-test.js (Eltern-vor-Kind-
// Assertions je FK-Paar). Tabellen, die im Backup fehlen, werden übersprungen
// (und im Protokoll ausgewiesen).
const RESTORE_ORDER = [
  // Blob-Store (keine FKs)
  "helmut_store",
  // Nutzer-Stammdaten: profiles ist Elternteil fast aller Pro-Nutzer-Tabellen
  "profiles", "mandate_profiles",
  // Geografie/Entitäten VOR allem, was darauf zeigt. geographies.parent_id ist
  // selbstreferenziell -> Zeilen werden vor dem Insert Eltern-zuerst sortiert
  // (SELF_REFERENCING unten), sonst drohen batchübergreifende FK-Fehler.
  "geographies", "electoral_districts", "political_entities",
  // Quellenarchitektur: publishers.entity_id -> political_entities;
  // retrieval_paths.publisher_id -> publishers; source_packages.geography_id
  // -> geographies; package_paths -> source_packages + retrieval_paths;
  // path_expected_* -> retrieval_paths (+ geographies/political_entities).
  "publishers", "retrieval_paths", "source_packages", "package_paths",
  "path_expected_levels", "path_expected_geographies", "path_expected_topics", "path_expected_entities",
  // Globale Inhalte (sources/raw_documents/knowledge_objects ohne FKs)
  "sources",
  "raw_documents", "knowledge_objects",
  "ko_document_links", "ko_relations",
  "document_findings",
  "gate_shadow_events",
  // Pro-Nutzer-Daten: Eltern (political_items -> personalized_recommendations,
  // decisions) VOR ihren Kindern (user_notes/daily_tasks/communication_drafts/
  // priority_changes bzw. interactions/office_outputs).
  "political_items", "personalized_recommendations",
  "decisions",
  "briefings", "matching_weights", "matching_results", "profile_embeddings",
  "topic_memory",
  "interactions", "office_outputs",
  "daily_tasks", "communication_drafts", "user_notes", "priority_changes",
  // Betriebs-/Zählertabellen (keine FKs). llm_budget_counters gehört dazu,
  // damit der LLM-Tageszähler nach einem Restore nicht bei 0 beginnt.
  "llm_usage", "pipeline_locks", "llm_budget_counters"
];

// Selbstreferenzielle Tabellen: Spalte, über die Zeilen auf Eltern derselben
// Tabelle zeigen. Diese Zeilen werden vor dem Insert Eltern-zuerst sortiert.
const SELF_REFERENCING = { geographies: "parent_id" };

// Stabile Eltern-zuerst-Sortierung für selbstreferenzielle Tabellen. Zeilen
// ohne Elternteil (oder mit Elternteil außerhalb des Backups) zuerst, danach
// schichtweise die Kinder. Bei Zyklen werden die Restzeilen unverändert
// angehängt — der FK-Fehler wird dann ehrlich sichtbar statt verschleiert.
function sortParentsFirst(rows, parentField) {
  if (!Array.isArray(rows)) return rows;
  const ids = new Set(rows.map((r) => r && r.id).filter(Boolean));
  const placed = new Set();
  const result = [];
  let remaining = rows.slice();
  while (remaining.length) {
    const next = [];
    let progress = false;
    for (const row of remaining) {
      const parent = row ? row[parentField] : null;
      if (!parent || !ids.has(parent) || placed.has(parent)) {
        result.push(row);
        if (row && row.id) placed.add(row.id);
        progress = true;
      } else {
        next.push(row);
      }
    }
    if (!progress) {
      result.push(...next);
      break;
    }
    remaining = next;
  }
  return result;
}

// Normalisierter Host für den URL-Vergleich: Protokoll weg, Pfad/Query weg,
// kleingeschrieben. hostOf("http://REF.supabase.co/x") -> "ref.supabase.co".
function hostOf(url) {
  return String(url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

// Projekt-Ref = erstes Host-Label ("ref.supabase.co" -> "ref").
function refOf(url) {
  return hostOf(url).split(".")[0];
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function fail(msg, code = 2) {
  console.error(`FEHLER: ${msg}`);
  process.exit(code);
}

async function insertRows(targetUrl, key, table, rows, batchSize = 500) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${targetUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`HTTP ${res.status} bei ${table} (Batch ab ${i}): ${body}`);
    }
  }
}

async function countRows(targetUrl, key, table) {
  const res = await fetch(`${targetUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" }
  });
  if (!res.ok) return null;
  const contentRange = res.headers.get("content-range") || "";
  return contentRange.includes("/") ? Number(contentRange.split("/").pop()) : null;
}

async function main() {
  const backupDir = arg("--backup");
  const localDir = arg("--local");
  const targetUrl = String(arg("--target-url") || "").replace(/\/+$/, "");

  if (!backupDir) fail("--backup <verzeichnis> ist Pflicht (ein mit backup-export.js erzeugtes Verzeichnis).");
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail(`Kein manifest.json unter ${backupDir} — ist das ein Backup-Verzeichnis?`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!localDir && !targetUrl) fail("Ziel fehlt: --local <verzeichnis> ODER --target-url <supabase-url> angeben. (Production-Restore macht dieses Skript bewusst NICHT.)");
  if (localDir && targetUrl) fail("Nur EIN Ziel: entweder --local oder --target-url.");

  // Harte Isolation: nie in die Quelle des Backups, nie in die Production-URL.
  // Alle Vergleiche case-insensitiv und unabhängig von Protokoll/Slash/Pfad —
  // konservativ: im Zweifel verweigern.
  if (targetUrl) {
    const targetHost = hostOf(targetUrl);
    const targetRef = refOf(targetUrl);
    if (!targetHost) fail("--target-url ist keine verwertbare URL.");
    if (!manifest.quelle) {
      fail("manifest.quelle fehlt — Herkunft des Backups unklar, Remote-Restore wird konservativ verweigert. (Herkunft prüfen und quelle im Manifest ergänzen, oder die Übung mit --local durchführen.)");
    }
    if (targetRef === String(manifest.quelle).trim().toLowerCase()) {
      fail(`Ziel (${targetHost}) ist die QUELLE des Backups — ein Restore in die Quelle ist keine Übung, sondern ein Production-Eingriff (Runbook Abschnitt 2, freigabepflichtig).`);
    }
    const prodHost = hostOf(process.env.SUPABASE_URL);
    if (prodHost && (targetHost === prodHost || targetRef === prodHost.split(".")[0])) {
      fail("Ziel entspricht SUPABASE_URL (Production) — verweigert.");
    }
  }
  const targetKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || "";
  if (targetUrl && !targetKey) fail("TARGET_SUPABASE_SERVICE_ROLE_KEY fehlt (Service-Key des ZIEL-Testprojekts).");
  const prodKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (targetUrl && prodKey && targetKey === prodKey) {
    fail("TARGET_SUPABASE_SERVICE_ROLE_KEY ist identisch mit SUPABASE_SERVICE_ROLE_KEY (Production-Key) — verweigert. Den Service-Key des TESTprojekts verwenden.");
  }

  const protokoll = {
    begonnen: new Date().toISOString(),
    backup: backupDir,
    quelle: manifest.quelle || "(unbekannt)",
    ziel: localDir ? `lokal:${localDir}` : refOf(targetUrl),
    tabellen: {},
    fehler: [],
    uebersprungen: []
  };
  const t0 = Date.now();

  for (const table of RESTORE_ORDER) {
    const file = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(file)) {
      protokoll.uebersprungen.push(table);
      continue;
    }
    const tStart = Date.now();
    try {
      let rows = JSON.parse(fs.readFileSync(file, "utf8"));
      const erwartet = manifest.tabellen && manifest.tabellen[table] != null ? manifest.tabellen[table] : rows.length;
      if (rows.length !== erwartet) {
        throw new Error(`Datei enthaelt ${rows.length} Zeilen, Manifest erwartet ${erwartet} — Backup unvollstaendig/beschaedigt?`);
      }
      if (SELF_REFERENCING[table]) {
        rows = sortParentsFirst(rows, SELF_REFERENCING[table]);
      }
      let wiederhergestellt;
      if (localDir) {
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, `${table}.json`), JSON.stringify(rows));
        wiederhergestellt = rows.length;
      } else {
        await insertRows(targetUrl, targetKey, table, rows);
        const count = await countRows(targetUrl, targetKey, table);
        wiederhergestellt = count != null ? count : rows.length;
        if (count != null && count < rows.length) {
          throw new Error(`Ziel hat nach Restore nur ${count} von ${rows.length} Zeilen.`);
        }
      }
      protokoll.tabellen[table] = { zeilen: rows.length, wiederhergestellt, ms: Date.now() - tStart };
      console.log(`OK    ${table}: ${rows.length} Zeilen (${Date.now() - tStart}ms)`);
    } catch (error) {
      protokoll.fehler.push({ tabelle: table, fehler: String(error.message).slice(0, 300) });
      console.error(`FEHL  ${table}: ${error.message}`);
    }
  }

  protokoll.dauerSekunden = Math.round((Date.now() - t0) / 1000);
  protokoll.beendet = new Date().toISOString();
  protokoll.erfolg = protokoll.fehler.length === 0;

  const outDir = localDir || path.join(backupDir, "drill");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "drill-protokoll.json"), JSON.stringify(protokoll, null, 2));
  const md = [
    `# Restore-Übung ${protokoll.begonnen}`,
    ``,
    `- Backup: ${protokoll.backup} (Quelle: ${protokoll.quelle})`,
    `- Ziel: ${protokoll.ziel}`,
    `- Dauer: ${protokoll.dauerSekunden}s`,
    `- Ergebnis: ${protokoll.erfolg ? "ERFOLG" : `${protokoll.fehler.length} FEHLER`}`,
    ``,
    `| Tabelle | Zeilen | Wiederhergestellt | ms |`,
    `| --- | --- | --- | --- |`,
    ...Object.entries(protokoll.tabellen).map(([t, v]) => `| ${t} | ${v.zeilen} | ${v.wiederhergestellt} | ${v.ms} |`),
    ``,
    protokoll.uebersprungen.length ? `Übersprungen (nicht im Backup): ${protokoll.uebersprungen.join(", ")}` : ``,
    protokoll.fehler.length ? `\n## Fehler\n${protokoll.fehler.map((f) => `- ${f.tabelle}: ${f.fehler}`).join("\n")}` : ``,
    ``,
    `Nach der Übung: Testdaten im Ziel löschen (lokal: Verzeichnis entfernen;`,
    `Testprojekt: zurücksetzen/löschen). Protokoll in docs/betrieb ablegen NUR`,
    `als Kennzahlen-Auszug — die Rohdateien enthalten personenbezogene Daten.`
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "drill-protokoll.md"), md);

  console.log(`\nRestore-Übung ${protokoll.erfolg ? "ERFOLGREICH" : "MIT FEHLERN"} in ${protokoll.dauerSekunden}s — Protokoll: ${path.join(outDir, "drill-protokoll.md")}`);
  process.exit(protokoll.erfolg ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Restore-Übung abgebrochen:", error);
    process.exit(1);
  });
}

module.exports = { RESTORE_ORDER, SELF_REFERENCING, sortParentsFirst, hostOf, refOf };
