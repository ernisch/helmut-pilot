"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Bund-Fachthemenpakets
// „Wohnen, Bauen & Stadtentwicklung" (10 Abrufwege + 10 Herausgeber [2 wiederverwendet] +
// 8 neue Entitäten + 1 Paket [prepared] + Paket-/Ebenen-/Geografie-Zuordnungen).
//
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + passendes Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz, KEINE KI.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default wäre 'auto'!)
//   Paket-Status = 'prepared'  (nie active -> Referenzzählung aktiviert die Wege nicht)
// -> die Wege sind technisch INAKTIV.
//
// KEINE BESTANDSÄNDERUNG: Alle Inserts sind ON CONFLICT DO NOTHING. Bereits vorhandene
// Herausgeber (publisher-destatis.de, publisher-bundesrat.de) werden NICHT überschrieben
// (im Gegensatz zum Basis-Seed, der DO UPDATE nutzt). Bundeswege/Landesmodule werden nicht
// berührt.
//
// Ausführung: node scripts/generate-wohnen-bauen-seed.js
//   -> supabase/seeds/20260724_wohnen_bauen_bund_seed.sql
//   -> supabase/seeds/20260724_wohnen_bauen_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildWohnenBauenSeed } = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-quellen");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(", ")}]::text[]`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildWohnenBauenSeed();
  const out = [];
  out.push("-- Helmut — Fachthemenpaket „Wohnen, Bauen & Stadtentwicklung (Bund)\" · PREPARED-Seed.");
  out.push("-- Generiert von scripts/generate-wohnen-bauen-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + der Basis-Seed sind angewendet.");
  out.push("-- ALLE Inserts: ON CONFLICT DO NOTHING (additiv, überschreibt KEINE Bestandszeile).");
  out.push("-- ALLE Abrufwege: status='needs_review', activation_mode='manual'; Paket status='prepared'");
  out.push("-- -> technisch VOLLSTÄNDIG INAKTIV. FREIGABEPFLICHTIG vor jeder Aktivierung.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Neue politische Entitaeten (8) — bestehende (Destatis/Bundesrat/Bundestag/Ausschuss) NICHT dupliziert");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Herausgeber (10) — publisher-destatis.de / publisher-bundesrat.de sind BESTAND");
  out.push("--    (reuse): ON CONFLICT DO NOTHING lässt die Bestandszeile unverändert -> keine Dublette.");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Paket (prepared) — bewusst NICHT im Code-Seed PACKAGE_DEFINITIONS; lebt nur hier.");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q("prepared"), qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (10) — INAKTIV: needs_review + manual (hart gesetzt; der DB-Default fuer");
  out.push("--    activation_mode wird bewusst durch manual ersetzt -> kein automatischer Crawl).");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "expected_frequency", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      q(p.frequenz), qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (10)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene (bund) je Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie (geo-bund) je Abrufweg");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive Wohnen/Bauen-Wege nach der Eintragung (erwartet: 0 Zeilen).");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Paket muss 'prepared' sein (erwartet: 1 Zeile mit status='prepared'):");
  out.push(`--   select status from public.source_packages where id = '${seed.package.id}';`);
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const pathIds = seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ");
  const newPubIds = seed.publishers.filter((p) => !p.reuse).map((p) => `'${p.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des Wohnen/Bauen-PREPARED-Seeds. Löscht die eingefügten Wege + Zuordnungen +");
  out.push("-- das Paket. Herausgeber/Entitäten werden GUARDED gelöscht: NUR wenn danach von KEINEM");
  out.push("-- Abrufweg/Herausgeber mehr referenziert. Die WIEDERVERWENDETEN Bestands-Herausgeber");
  out.push("-- (publisher-destatis.de, publisher-bundesrat.de) werden GAR NICHT angefasst.");
  out.push("-- Berührt KEINE Bundeswege, KEINE Landesmodule, KEINE Basis-Daten.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push(`delete from public.source_packages where id = '${seed.package.id}';`);
  out.push("-- NUR neu angelegte Herausgeber (nicht die wiederverwendeten) — und nur, wenn verwaist:");
  out.push(`delete from public.publishers p where p.id in (${newPubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  out.push("-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:");
  out.push(`delete from public.political_entities e where e.id in (${entIds})`);
  out.push("  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = build();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, "20260724_wohnen_bauen_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_wohnen_bauen_bund_seed_rollback.sql"), rollback);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_wohnen_bauen_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} (reuse=${seed.summary.publishersReused}) `
    + `retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} `
    + `levels=${seed.pathExpectedLevels.length} geographies=${seed.pathExpectedGeographies.length} future_targets=${seed.futureTargets.length}`);
  console.log(`aktive Wege im Seed: ${seed.summary.aktiveAbrufwege} (erwartet 0) · Paketstatus: ${seed.package.status}`);
  console.log("Frequenzverteilung:", JSON.stringify(seed.summary.frequenz));
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles };
