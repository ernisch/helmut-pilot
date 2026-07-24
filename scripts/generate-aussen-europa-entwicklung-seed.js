"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Fachthemenpakets
// `aussen-europa-und-entwicklung-bund` (Außen-, Europa- und Entwicklungspolitik, Bund).
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + guarded Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere 'auto'!)
// -> die Wege sind technisch INAKTIV. Das Paket ist status='prepared', is_base=false.
// Bestehende Zeilen werden NIE überschrieben (durchgehend ON CONFLICT DO NOTHING); DIP und
// Bundesregierung werden NICHT neu angelegt, nur per package_paths verknüpft (Wiederverwendung).
//
// Ausfuehrung: node scripts/generate-aussen-europa-entwicklung-seed.js
//   -> supabase/seeds/20260724_aussen_europa_entwicklung_seed.sql
//   -> supabase/seeds/20260724_aussen_europa_entwicklung_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildAussenEuropaEntwicklungSeed } = require("../lib/helmut/quellenarchitektur/seeds/aussen-europa-entwicklung-quellen");

const SEED_BASENAME = "20260724_aussen_europa_entwicklung_seed";

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(",")}]::text[]`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildAussenEuropaEntwicklungSeed();
  const out = [];
  out.push("-- Helmut — Fachthemenpaket `aussen-europa-und-entwicklung-bund` · PREPARED-Seed");
  out.push("-- (generiert, idempotent, NICHT-destruktiv). Generiert von");
  out.push("-- scripts/generate-aussen-europa-entwicklung-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + Basis-Seed sind angewendet");
  out.push("-- (Tabellen, geo-bund, ministry-auswaertiges-amt, rp-dip, rp-bundesregierung vorhanden).");
  out.push("-- Paket: status='prepared', is_base=false. ALLE neuen Abrufwege: status='needs_review',");
  out.push("-- activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG (kein Auto-Apply).");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Quellenpaket (neu, prepared, is_base=false) — Bestand wird NIE überschrieben");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose),
      q(seed.package.status), qbool(seed.package.is_base), q(seed.package.political_level),
      q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 2) Politische Entitaeten (nur NEUE: BMZ + 4 EU-Institutionen). AA-Entity wird");
  out.push("--    wiederverwendet (ministry-auswaertiges-amt) und hier NICHT angelegt.");
  out.push(insert("political_entities",
    ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 3) Herausgeber (5 neu). canonical_domain ist UNIQUE — alle Domains neu.");
  out.push(insert("publishers",
    ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (5 neu) — INAKTIV: needs_review + manual. DIP/Bundesregierung NICHT hier.");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (7): 5 neue Wege + 2 WIEDERVERWENDETE (rp-dip, rp-bundesregierung).");
  out.push("--    Die Wiederverwendung ist eine reine Verknüpfung; beide Wege bleiben unverändert und");
  out.push("--    sind bereits always_on aktiv -> KEIN neuer Crawl durch diese Zuordnung.");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene je NEUEM Abrufweg (bund/international bzw. eu)");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie je NEUEM Abrufweg (deutscher Handlungsbezug: geo-bund)");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (Fachthema: außen/europa/entwicklung)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- 9) Erwartete Entitaeten je NEUEM Abrufweg (inkl. Bündelung Rat + Europäischer Rat)");
  out.push(insert("path_expected_entities", ["retrieval_path_id", "entity_id"],
    seed.pathExpectedEntities.map((e) => [q(e.retrieval_path_id), q(e.entity_id)]),
    "retrieval_path_id, entity_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive NEUE Wege nach der Eintragung (erwartet: 0 Zeilen).");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Paketstatus-Pruefung (erwartet: prepared): select status from public.source_packages where id = '" + seed.package.id + "';");
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
  const pkgId = `'${seed.package.id}'`;
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds `aussen-europa-und-entwicklung-bund`. Löscht die eingefügten");
  out.push("-- NEUEN Objekte (eindeutige Ids). WIEDERVERWENDETE Wege (rp-dip, rp-bundesregierung) und ihre");
  out.push("-- bestehenden bund-basis-Verknüpfungen bleiben UNBERÜHRT — es werden nur die package_paths");
  out.push("-- DIESES Pakets (per package_id) entfernt. Herausgeber/Entitaeten werden GUARDED gelöscht:");
  out.push("-- NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden (schützt die");
  out.push("-- wiederverwendete Entity ministry-auswaertiges-amt und alle Basis-Daten). Beruehrt KEINE");
  out.push("-- bestehenden Bundes-/Basis-Wege.");
  out.push("begin;");
  out.push(`delete from public.path_expected_entities where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push("-- nur die Verknüpfungen DIESES Pakets entfernen (rp-dip/rp-bundesregierung bleiben bund-basis erhalten):");
  out.push(`delete from public.package_paths where package_id = ${pkgId};`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push(`delete from public.source_packages where id = ${pkgId};`);
  out.push("-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:");
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
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}.sql`), sql);
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}_rollback.sql`), rollback);
  console.log(`PREPARED-Seed geschrieben: supabase/seeds/${SEED_BASENAME}(.rollback).sql`);
  console.log(`Zeilen: package=1 entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} (davon reused=${seed.summary.reusedPaketzuordnungen}) levels=${seed.pathExpectedLevels.length} geographies=${seed.pathExpectedGeographies.length} topics=${seed.pathExpectedTopics.length} entities=${seed.pathExpectedEntities.length}`);
  console.log(`Abrufwege im Paket gesamt: ${seed.summary.abrufwegeGesamtImPaket} (neu ${seed.summary.neueAbrufwege} + wiederverwendet ${seed.summary.wiederverwendeteAbrufwege})`);
  console.log(`aktive NEUE Wege im Seed: ${seed.summary.aktiveNeueAbrufwege} (erwartet 0)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles, SEED_BASENAME };
