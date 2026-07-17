"use strict";

// Helmut — Landtag-Sprint Phase 5/6: Generator fuer den PREPARED-Seed des BE/BB-VOLLMODELLS
// (Entitaeten: Ausschuesse/Fraktionen/Gruppen/Senatsverwaltungen/Ministerien/Behoerden +
// Wahlkreise als electoral_districts). Erzeugt idempotentes, NICHT-destruktives SQL
// (ON CONFLICT DO NOTHING) + passendes Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT / NICHTAKTIVIERUNG:
//   - NUR political_entities + electoral_districts. KEINE publishers, KEINE retrieval_paths,
//     KEINE Pakete, KEINE Statusaenderungen -> es kann NICHTS crawlen oder aktiv werden.
//   - Das Anwenden auf Production ist ein eigener, ausdruecklich freigabepflichtiger Schritt
//     (Aktivierungscheckliste docs/landtag/). Dieser Sprint wendet den Seed NICHT an.
//   - Teilverifizierte Eintraege (verifiziert=false, z. B. BB-Wahlkreise 28/34/42) sind im
//     SQL als Kommentar markiert und MUESSEN vor dem Anwenden amtlich geprueft werden.
//
// Ausfuehrung: node scripts/generate-landtag-vollmodell-seed.js
//   -> supabase/seeds/20260722_landtag_vollmodell_be_bb_seed.sql
//   -> supabase/seeds/20260722_landtag_vollmodell_be_bb_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { BERLIN_MODELL } = require("../lib/helmut/quellenarchitektur/seeds/landtag-berlin");
const { BRANDENBURG_MODELL } = require("../lib/helmut/quellenarchitektur/seeds/landtag-brandenburg");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(v) {
  const a = Array.isArray(v) ? v : [];
  if (!a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(", ")}]`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function alleEntitaeten() {
  return [
    ...BERLIN_MODELL.ausschuesse, ...BERLIN_MODELL.fraktionen,
    ...BERLIN_MODELL.verwaltungen, ...BERLIN_MODELL.behoerden,
    ...BRANDENBURG_MODELL.ausschuesse, ...BRANDENBURG_MODELL.fraktionen,
    ...BRANDENBURG_MODELL.gruppen, ...BRANDENBURG_MODELL.ministerien,
    ...BRANDENBURG_MODELL.behoerden
  ];
}
function alleWahlkreise() {
  return [...BERLIN_MODELL.wahlkreise, ...BRANDENBURG_MODELL.wahlkreise];
}

function build() {
  const entitaeten = alleEntitaeten();
  const wahlkreise = alleWahlkreise();
  const unverifiziert = [...entitaeten, ...wahlkreise].filter((x) => x.verifiziert === false);

  const out = [];
  out.push("-- Helmut — Landtag-Vollmodell Berlin/Brandenburg · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-landtag-vollmodell-seed.js. NICHT von Hand editieren.");
  out.push("-- NUR Entitaeten + Wahlkreise: KEINE Abrufwege, KEINE Pakete, KEINE Statusaenderungen -> aktiviert NICHTS.");
  out.push("-- FREIGABEPFLICHTIG: Anwenden auf Production nur nach Gruender-Freigabe (docs/landtag/ Aktivierungscheckliste).");
  if (unverifiziert.length) {
    out.push("-- VOR DEM ANWENDEN AMTLICH PRUEFEN (verifiziert=false):");
    for (const u of unverifiziert) out.push(`--   - ${u.id}: ${u.name}`);
  }
  out.push("begin;");
  out.push("");

  out.push(`-- 1) Politische Entitaeten (${entitaeten.length}: Ausschuesse/Fraktionen/Gruppen/Verwaltungen/Ministerien/Behoerden BE+BB)`);
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    entitaeten.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key || null), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push(`-- 2) Wahlkreise (${wahlkreise.length}: ${BERLIN_MODELL.wahlkreise.length} AGH Berlin [Einteilung 2026] + ${BRANDENBURG_MODELL.wahlkreise.length} Landtag Brandenburg [LTW 2024])`);
  out.push(insert("electoral_districts", ["id", "kind", "number", "name", "geography_id"],
    wahlkreise.map((w) => [q(w.id), q(w.kind), qint(w.number), q(w.name), q(w.geography_id)]),
    "id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet 0 Zeilen): keine Entitaet ausserhalb Ebene 'land'.");
  out.push("-- select id from public.political_entities where id like any(array['committee-agh-%','committee-ltbb-%','ministry-be-%','ministry-bb-%','group-agh-%','group-ltbb-%','authority-be-%','authority-bb-%']) and level <> 'land';");
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), entitaeten, wahlkreise, unverifiziert };
}

function buildRollback(entitaeten, wahlkreise) {
  const entIds = entitaeten.map((e) => `'${e.id}'`).join(", ");
  const wkIds = wahlkreise.map((w) => `'${w.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des Landtag-Vollmodell-PREPARED-Seeds (Berlin/Brandenburg).");
  out.push("-- Loescht NUR die hier eingefuegten Ids. Entitaeten werden GUARDED geloescht:");
  out.push("-- nur wenn kein Herausgeber sie referenziert (publishers.entity_id, on delete set null waere");
  out.push("-- zwar harmlos, aber der Guard haelt die Referenz-Wahrheit konsistent).");
  out.push("begin;");
  out.push(`delete from public.electoral_districts where id in (${wkIds});`);
  out.push(`delete from public.political_entities e where e.id in (${entIds})`);
  out.push("  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, entitaeten, wahlkreise, unverifiziert } = build();
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, "20260722_landtag_vollmodell_be_bb_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260722_landtag_vollmodell_be_bb_seed_rollback.sql"), buildRollback(entitaeten, wahlkreise));
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260722_landtag_vollmodell_be_bb_seed(.rollback).sql");
  console.log(`Zeilen: entitaeten=${entitaeten.length} wahlkreise=${wahlkreise.length} (davon amtlich zu pruefen: ${unverifiziert.length})`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, alleEntitaeten, alleWahlkreise, writeFiles };
