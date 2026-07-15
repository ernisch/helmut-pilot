"use strict";

// Restore-ÜBUNG (Audit-Folgearbeit, Phase 17): stellt ein mit backup-export.js
// erzeugtes Backup in eine ISOLIERTE Zielumgebung wieder her und protokolliert
// Dauer, Zeilenzahlen und Fehler. Ein ungeübter Restore ist kein Restore —
// dieses Skript macht die Übung wiederholbar und messbar.
//
// SICHERHEIT (hart erzwungen):
//   - Schreibt NIEMALS in die Quelle des Backups (manifest.quelle wird gegen
//     das Ziel geprüft) und NIEMALS ohne explizites Ziel.
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
//       Verweigert, wenn die Ziel-URL der Backup-Quelle entspricht oder
//       SUPABASE_URL (Production) gleicht. Reihenfolge FK-sicher: Eltern vor
//       Kindern (profiles vor briefings/decisions etc.).
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

// FK-sichere Wiederherstellungsreihenfolge: Eltern zuerst. Tabellen, die im
// Backup fehlen, werden übersprungen (und im Protokoll ausgewiesen).
const RESTORE_ORDER = [
  "helmut_store",
  "profiles", "mandate_profiles",
  "publishers", "retrieval_paths", "source_packages", "package_paths",
  "political_entities", "geographies", "electoral_districts",
  "path_expected_levels", "path_expected_geographies", "path_expected_topics", "path_expected_entities",
  "sources",
  "raw_documents", "knowledge_objects", "ko_document_links", "ko_relations",
  "document_findings", "gate_shadow_events",
  "decisions", "briefings", "matching_results", "matching_weights",
  "profile_embeddings", "office_outputs", "topic_memory", "interactions",
  "user_notes", "daily_tasks", "communication_drafts", "political_items",
  "personalized_recommendations", "priority_changes", "llm_usage", "pipeline_locks"
];

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

(async () => {
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
  if (targetUrl) {
    const targetHost = targetUrl.replace(/^https?:\/\//, "").split(".")[0];
    if (manifest.quelle && targetHost === manifest.quelle) {
      fail(`Ziel (${targetHost}) ist die QUELLE des Backups — ein Restore in die Quelle ist keine Übung, sondern ein Production-Eingriff (Runbook Abschnitt 2, freigabepflichtig).`);
    }
    const prodUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    if (prodUrl && targetUrl === prodUrl) {
      fail("Ziel entspricht SUPABASE_URL (Production) — verweigert.");
    }
  }
  const targetKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || "";
  if (targetUrl && !targetKey) fail("TARGET_SUPABASE_SERVICE_ROLE_KEY fehlt (Service-Key des ZIEL-Testprojekts).");

  const protokoll = {
    begonnen: new Date().toISOString(),
    backup: backupDir,
    quelle: manifest.quelle || "(unbekannt)",
    ziel: localDir ? `lokal:${localDir}` : targetUrl.replace(/^https?:\/\//, "").split(".")[0],
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
      const rows = JSON.parse(fs.readFileSync(file, "utf8"));
      const erwartet = manifest.tabellen && manifest.tabellen[table] != null ? manifest.tabellen[table] : rows.length;
      if (rows.length !== erwartet) {
        throw new Error(`Datei enthaelt ${rows.length} Zeilen, Manifest erwartet ${erwartet} — Backup unvollstaendig/beschaedigt?`);
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
})().catch((error) => {
  console.error("Restore-Übung abgebrochen:", error);
  process.exit(1);
});
