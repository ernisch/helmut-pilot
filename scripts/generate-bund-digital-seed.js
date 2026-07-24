"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Pakets
// "digitales-daten-staatsmodernisierung-bund" (technische Validierung + INAKTIVE Vorbereitung).
//
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + passendes,
// GUARDED Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (hart im erzeugten SQL):
//   - source_packages: status='prepared' (nie active) -> keine Referenzzählung.
//   - retrieval_paths: status='needs_review' + activation_mode='manual' (DB-Default wäre 'auto'!).
//   -> Paket + alle neuen Wege technisch INAKTIV. Bestehende Wege werden NUR additiv verknüpft
//      (package_paths), NICHT verändert.
//
// Ausführung: node scripts/generate-bund-digital-seed.js
//   -> supabase/seeds/20260724_paket_digitales_daten_staatsmodernisierung_bund_seed.sql
//   -> supabase/seeds/20260724_paket_digitales_daten_staatsmodernisierung_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildBundDigitalSeed } = require("../lib/helmut/quellenarchitektur/seeds/bund-digital-quellen");

const SEED_BASENAME = "20260724_paket_digitales_daten_staatsmodernisierung_bund_seed";

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!a || !a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(", ")}]::text[]`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildBundDigitalSeed();
  const out = [];
  out.push("-- Helmut — Paket 'digitales-daten-staatsmodernisierung-bund' · PREPARED-Seed");
  out.push("-- (generiert von scripts/generate-bund-digital-seed.js — NICHT von Hand editieren).");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed).");
  out.push("-- Paket: status='prepared'. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual'");
  out.push("-- -> technisch INAKTIV. FREIGABEPFLICHTIG. Bestehende Wege werden NUR additiv verknüpft.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Neue politische Entitäten (4) — keine Personenabhängigkeit; kein separater Bundes-CIO");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Neue Herausgeber (4) — Bundesrechnungshof/DIP/Google-News werden wiederverwendet");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Quellenpaket (prepared, is_base=false, Bundesebene)");
  const pk = seed.package;
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(pk.id), q(pk.key), q(pk.name), q(pk.purpose), q(pk.status), qbool(pk.is_base), q(pk.political_level), q(pk.geography_id), qarr(pk.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 4) Neue Abrufwege (5) — INAKTIV: needs_review + manual");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (7): 5 neue + 2 wiederverwendete Bestandswege (rp-dip, rp-committee-digitales)");
  out.push("--    Wiederverwendung ist additiv: ein prepared-Paket zählt nicht in die Referenzzählung");
  out.push("--    -> aktiviert nichts, verändert die Bestandswege nicht.");
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

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (Abdeckungsnachweis)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- Integritäts-Selbstprüfung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Paketstatus (erwartet: prepared):");
  out.push(`-- select status from public.source_packages where id = '${pk.id}';`);
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const newPathIds = seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ");
  const pubIds = seed.publishers.map((p) => `'${p.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const pkgId = seed.package.id;
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds 'digitales-daten-staatsmodernisierung-bund'.");
  out.push("-- Löscht NUR die neu eingefügten Objekte. Wiederverwendete Bestandswege (rp-dip,");
  out.push("-- rp-committee-digitales) und deren Herausgeber/Entitäten bleiben unangetastet:");
  out.push("-- es werden nur DEREN package_paths-VERKNÜPFUNGEN zu diesem Paket entfernt.");
  out.push("-- Herausgeber/Entitäten GUARDED (nur löschen, wenn nichts sie mehr referenziert) —");
  out.push("-- schützt geteilte Bestandsdaten vor on-delete-cascade.");
  out.push("begin;");
  out.push("-- a) Erwartete Dimensionen der neuen Wege");
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${newPathIds});`);
  out.push("-- b) ALLE Paketverknüpfungen dieses Pakets (neue + wiederverwendete Links)");
  out.push(`delete from public.package_paths where package_id = '${pkgId}';`);
  out.push("-- c) Die 5 neuen Abrufwege (nur diese IDs)");
  out.push(`delete from public.retrieval_paths where id in (${newPathIds});`);
  out.push("-- d) Das Paket (Verknüpfungen sind in b) bereits entfernt)");
  out.push(`delete from public.source_packages where id = '${pkgId}';`);
  out.push("-- e) Neue Herausgeber nur löschen, wenn KEIN Abrufweg sie mehr referenziert:");
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  out.push("-- f) Neue Entitäten nur löschen, wenn KEIN Herausgeber sie mehr referenziert:");
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
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} package=1 ` +
    `retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} ` +
    `expected_levels=${seed.pathExpectedLevels.length} expected_geographies=${seed.pathExpectedGeographies.length} ` +
    `expected_topics=${seed.pathExpectedTopics.length}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveNeueWege} (erwartet 0)`);
  console.log(`Paketstatus: ${seed.summary.packageStatus} (erwartet prepared)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles, SEED_BASENAME };
