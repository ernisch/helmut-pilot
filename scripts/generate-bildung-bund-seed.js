"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Bildungspakets (Bund).
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + guarded Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (hart im erzeugten SQL):
//   source_packages.status   = 'prepared'      (nie active)
//   retrieval_paths.status   = 'needs_review'  (nie healthy/active)
//   retrieval_paths.activation_mode = 'manual' (nie auto/always_on -> KEIN Auto-Crawl;
//                                               DB-Default waere 'auto'!)
// -> Paket + alle neuen Wege sind technisch INAKTIV. Bestehende (aktive) Quellen werden
//    NICHT veraendert; wiederverwendete Herausgeber/Entitaeten/Wege werden NUR referenziert.
//
// Ausfuehrung: node scripts/generate-bildung-bund-seed.js
//   -> supabase/seeds/20260724_bildung_bund_seed.sql
//   -> supabase/seeds/20260724_bildung_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildBildungBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/bildung-bund-quellen");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(list) {
  if (!Array.isArray(list) || !list.length) return "'{}'";
  return `array[${list.map((s) => q(s)).join(", ")}]::text[]`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildBildungBundSeed();
  const out = [];
  out.push("-- Helmut — Quellenpaket 'bildung-bund' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-bildung-bund-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql angewendet");
  out.push("--   (Basis-Herausgeber/-Entitaeten/-Wege vorhanden: destatis/arbeitsagentur/bundesrat/oecd, rp-committee-bildung).");
  out.push("-- Paket: status='prepared'. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual'");
  out.push("--   -> technisch INAKTIV. FREIGABEPFLICHTIG. Byte-genaue Abrufweg-Verifikation (offener Egress) steht aus.");
  out.push("-- Wiederverwendet (NUR referenziert, NIE angelegt/veraendert): " +
    seed.reusedPublisherIds.join(", ") + " | Entitaeten " + seed.reusedEntityIds.join(", ") +
    " | Weg " + seed.reusedPathIds.join(", ") + ".");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Neue politische Entitaeten (BMBFSFJ, KMK, BIBB, DIPF, SWK, IQB, DZHW)");
  out.push(insert("political_entities",
    ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push(`-- 2) Neue Herausgeber (${seed.publishers.length})`);
  out.push(insert("publishers",
    ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q("unbekannt"), q("active"), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push(`-- 3) Neue Abrufwege (${seed.retrievalPaths.length}) — INAKTIV: needs_review + manual`);
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 4) Quellenpaket bildung-bund — status 'prepared' (aktiviert KEINE Wege)");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q("prepared"), qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), "'{}'"]],
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (neue Wege + wiederverwendeter rp-committee-bildung)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene je NEUEM Abrufweg (Bund/Land/International — nur neue Wege)");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie je NEUEM Abrufweg (national = geo-bund)");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (speist die Abdeckungsmatrix)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet je 0 Zeilen):");
  out.push("-- a) kein aktiver neuer Bildungsweg:");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- b) Paket bleibt prepared:");
  out.push("-- select id, status from public.source_packages where id = 'pkg-bildung-bund' and status <> 'prepared';");
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
  out.push("-- Rollback des bildung-bund-PREPARED-Seeds. Loescht NUR die neu eingefuegten Bildungs-");
  out.push("-- Wege/-Herausgeber/-Entitaeten + das Paket + Zuordnungen (eindeutige Ids). Der");
  out.push("-- WIEDERVERWENDETE Weg rp-committee-bildung und die geteilten Herausgeber/Entitaeten");
  out.push("-- (destatis/arbeitsagentur/bundesrat/oecd, committee-bt-bildung, ...) werden NICHT geloescht:");
  out.push("-- die package_paths-Zeile des geteilten Wegs wird gezielt nur fuer pkg-bildung-bund entfernt,");
  out.push("-- Herausgeber/Entitaeten nur GUARDED (nur wenn danach unreferenziert). Beruehrt keine aktiven Quellen.");
  out.push("begin;");
  // Erst alle package_paths des Pakets (loest auch die Zuordnung des geteilten Wegs, ohne ihn zu loeschen):
  out.push("delete from public.package_paths where package_id = 'pkg-bildung-bund';");
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push("delete from public.source_packages where id = 'pkg-bildung-bund';");
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
  fs.writeFileSync(path.join(seedDir, "20260724_bildung_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_bildung_bund_seed_rollback.sql"), rollback);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_bildung_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} levels=${seed.pathExpectedLevels.length} geos=${seed.pathExpectedGeographies.length} topics=${seed.pathExpectedTopics.length}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveWege} (erwartet 0)`);
  console.log(`Tier: 1=${seed.summary.tier1} 2=${seed.summary.tier2} 3=${seed.summary.tier3} · wiederverwendet: pub=${seed.summary.wiederverwendetePublisher} ent=${seed.summary.wiederverwendeteEntitaeten} weg=${seed.summary.wiederverwendeteWege}`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles };
