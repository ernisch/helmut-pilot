"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Pakets
// "recht-verfassung-und-verbraucherschutz-bund" (1 Paket + 3 Entitaeten + 3 Herausgeber +
// 5 neue Abrufwege + 2 wiederverwendete Wege via package_paths + Ebenen/Geografie/Entitaeten).
//
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + passendes Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere 'auto'!)
//   is_critical = false
// -> die neuen Wege sind technisch INAKTIV. Bestehende globale Wege (rp-dip, rp-bundesregierung)
//    werden NICHT angefasst — nur ueber package_paths verknuepft.
//
// Ausfuehrung: node scripts/generate-recht-verfassung-verbraucherschutz-seed.js
//   -> supabase/seeds/20260724_recht_verfassung_verbraucherschutz_bund_seed.sql
//   -> supabase/seeds/20260724_recht_verfassung_verbraucherschutz_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const {
  buildRechtVerfassungVerbraucherschutzSeed
} = require("../lib/helmut/quellenarchitektur/seeds/recht-verfassung-verbraucherschutz");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!a || !a.length) return "'{}'";
  return "array[" + a.map((x) => q(x)).join(", ") + "]::text[]";
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildRechtVerfassungVerbraucherschutzSeed();
  const out = [];
  out.push("-- Helmut — Paket 'recht-verfassung-und-verbraucherschutz-bund' · PREPARED-Seed");
  out.push("-- (generiert, idempotent, NICHT-destruktiv). Generiert von");
  out.push("-- scripts/generate-recht-verfassung-verbraucherschutz-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed).");
  out.push("-- Paket: status='prepared', is_base=false -> vollstaendig INAKTIV.");
  out.push("-- Neue Abrufwege: status='needs_review', activation_mode='manual', is_critical=false.");
  out.push("-- Wiederverwendete Wege (rp-dip, rp-bundesregierung) werden NUR via package_paths");
  out.push("-- verknuepft und NICHT veraendert. FREIGABEPFLICHTIG.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Neue politische Entitaeten (Institutionen, keine Personen)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Neue Herausgeber (3)");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Neue Abrufwege (5) — INAKTIV: needs_review + manual + is_critical=false");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(false), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 4) Quellenpaket (prepared, is_base=false, vollstaendig inaktiv)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q("prepared"), qbool(false), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (5 neue + 2 wiederverwendete: rp-dip, rp-bundesregierung)");
  out.push("--    Die wiederverwendeten Wege existieren bereits global und werden NUR verknuepft.");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- 8) Erwartete Entitaet je NEUEM Abrufweg (verlinkt neue + wiederverwendete Entitaeten)");
  out.push(insert("path_expected_entities", ["retrieval_path_id", "entity_id"],
    seed.pathExpectedEntities.map((x) => [q(x.retrieval_path_id), q(x.entity_id)]),
    "retrieval_path_id, entity_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive neue Wege nach der Eintragung (erwartet: 0 Zeilen)");
  out.push("-- select id, status, activation_mode, is_critical from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual' or is_critical <> false);");
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const pathIds = seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ");
  const pubIds = seed.publishers.map((p) => `'${p.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds 'recht-verfassung-und-verbraucherschutz-bund'.");
  out.push("-- Referenzsicher: Kinder vor Eltern. Loescht NUR die neu eingefuegten Objekte +");
  out.push("-- ausschliesslich die Paketverknuepfungen DIESES Pakets. Wiederverwendete Wege");
  out.push("-- (rp-dip, rp-bundesregierung) werden NIE geloescht — nur ihre Verknuepfung zu");
  out.push("-- diesem Paket faellt weg (delete ... where package_id = <dieses Paket>).");
  out.push("-- Herausgeber/Entitaeten werden GUARDED geloescht: nur wenn danach von KEINEM");
  out.push("-- Abrufweg/Herausgeber mehr referenziert (schuetzt geteilte Objekte vor Cascade).");
  out.push("-- Beruehrt KEINE Basis-Daten und keine anderen Pakete.");
  out.push("begin;");
  out.push(`delete from public.path_expected_entities where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push("-- NUR die package_paths DIESES Pakets (entfernt auch die 2 wiederverwendeten Links,");
  out.push("-- OHNE die wiederverwendeten Wege selbst zu loeschen):");
  out.push(`delete from public.package_paths where package_id = '${seed.package.id}';`);
  out.push("-- Nur die NEUEN Abrufwege loeschen (rp-dip/rp-bundesregierung sind NICHT in dieser Liste):");
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push(`delete from public.source_packages where id = '${seed.package.id}';`);
  out.push("-- Herausgeber nur loeschen, wenn KEIN (auch kein anderer) Abrufweg sie mehr referenziert:");
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
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
  fs.writeFileSync(path.join(seedDir, "20260724_recht_verfassung_verbraucherschutz_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_recht_verfassung_verbraucherschutz_bund_seed_rollback.sql"), rollback);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_recht_verfassung_verbraucherschutz_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} (davon wiederverwendet=${seed.reusedPaths.length}) path_expected_levels=${seed.pathExpectedLevels.length} path_expected_geographies=${seed.pathExpectedGeographies.length} path_expected_entities=${seed.pathExpectedEntities.length}`);
  console.log(`Retrieval Paths gesamt im Paket: ${seed.summary.retrievalPathsGesamt} (5 neu + 2 wiederverwendet)`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveNeueAbrufwege} (erwartet 0) · kritische neue Wege: ${seed.summary.kritischeNeueAbrufwege} (erwartet 0)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles };
