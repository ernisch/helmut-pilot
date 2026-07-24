"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Themenpakets
// "verkehr-infrastruktur-bund". Erzeugt idempotentes, NICHT-destruktives SQL
// (ON CONFLICT DO NOTHING) + passendes Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (hart im erzeugten SQL):
//   source_packages.status = 'prepared'          (nie active -> Referenzzaehlung aktiviert es NICHT)
//   retrieval_paths.status = 'needs_review'      (nie healthy)
//   retrieval_paths.activation_mode = 'manual'   (nie auto/always_on -> KEIN Auto-Crawl)
// -> das Paket + alle neuen Wege sind technisch INAKTIV. Bestandsdaten werden NICHT veraendert:
//    bestehende Herausgeber/Entitaeten/Wege werden nur REFERENZIERT (ON CONFLICT DO NOTHING schuetzt
//    zusaetzlich vor Ueberschreiben), der bestehende rp-committee-verkehr wird nur verlinkt.
//
// Ausfuehrung: node scripts/generate-verkehr-infrastruktur-seed.js
//   -> supabase/seeds/20260724_paket_verkehr_infrastruktur_bund_seed.sql
//   -> supabase/seeds/20260724_paket_verkehr_infrastruktur_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildVerkehrSeed } = require("../lib/helmut/quellenarchitektur/seeds/verkehr-infrastruktur-bund");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return "array[" + a.map((x) => q(x)).join(",") + "]::text[]";
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildVerkehrSeed();
  const p = seed.package;
  const out = [];
  out.push("-- Helmut — Themenpaket 'verkehr-infrastruktur-bund' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-verkehr-infrastruktur-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + _seed.sql sind angewendet (Tabellen + Basis-Seed vorhanden).");
  out.push("-- Paket status='prepared'; ALLE neuen Abrufwege status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.");
  out.push("-- Bestehende Herausgeber/Entitaeten/Wege werden NUR referenziert (ON CONFLICT DO NOTHING); keine Bestandsquelle wird veraendert.");
  out.push("begin;");
  out.push("");

  out.push(`-- 1) Neue politische Entitaeten (${seed.entities.length}) — nur NICHT bereits vorhandene`);
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push(`-- 2) Neue Herausgeber (${seed.publishers.length}) — bestehende (Destatis/BDI/Google News) werden referenziert, NICHT dupliziert`);
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((pu) => [q(pu.id), q(pu.name), q(pu.canonical_domain), q(pu.publisher_type), q(pu.evidence_role), q(pu.trust), q(pu.lifecycle_status), q(pu.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Quellenpaket (status='prepared' -> INAKTIV)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(p.id), q(p.key), q(p.name), q(p.purpose), q(p.status), qbool(p.is_base), q(p.political_level), q(p.geography_id), qarr(p.required_classes)]],
    "id"));
  out.push("");

  out.push(`-- 4) Abrufwege (${seed.retrievalPaths.length}) — INAKTIV: needs_review + manual`);
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "expected_frequency", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
    seed.retrievalPaths.map((rp) => [
      q(rp.id), q(rp.publisher_id), q(rp.legacy_source_id), q(rp.name), q(rp.method), q(rp.url), q(rp.query), q(rp.parser),
      q(rp.expected_frequency), qint(rp.priority), q("needs_review"), q("manual"), qbool(rp.is_critical), qint(rp.max_items), q(rp.represents_type)
    ]),
    "id"));
  out.push("");

  out.push(`-- 5) Paket <-> Abrufweg (${seed.packagePaths.length}; inkl. Wiederverwendung rp-committee-verkehr)`);
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

  out.push("-- 8) Erwartete Entitaet je NEUEM Abrufweg");
  out.push(insert("path_expected_entities", ["retrieval_path_id", "entity_id"],
    seed.pathExpectedEntities.map((en) => [q(en.retrieval_path_id), q(en.entity_id)]),
    "retrieval_path_id, entity_id"));
  out.push("");

  out.push("-- 9) Erwartete Themen je NEUEM Abrufweg");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((rp) => `'${rp.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- select status from public.source_packages where id = '" + p.id + "'; -- erwartet: prepared");
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const pathIds = seed.retrievalPaths.map((rp) => `'${rp.id}'`).join(", ");
  const pubIds = seed.publishers.map((pu) => `'${pu.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const pkgId = seed.package.id;
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds 'verkehr-infrastruktur-bund'. Loescht die eingefuegten NEUEN");
  out.push("-- Wege + Paket-Zuordnungen + das Paket; Herausgeber/Entitaeten werden GUARDED geloescht");
  out.push("-- (nur wenn danach von KEINEM Weg/Herausgeber mehr referenziert). Bestehende, geteilte");
  out.push("-- Herausgeber/Entitaeten (Destatis/BDI/…) und der Bestandsweg rp-committee-verkehr bleiben");
  out.push("-- unberuehrt. Beruehrt KEINE Bestandsquelle.");
  out.push("begin;");
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_entities where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where package_id = '${pkgId}';`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push(`delete from public.source_packages where id = '${pkgId}';`);
  out.push("-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:");
  out.push(`delete from public.publishers pu where pu.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = pu.id);");
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
  fs.writeFileSync(path.join(seedDir, "20260724_paket_verkehr_infrastruktur_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_paket_verkehr_infrastruktur_bund_seed_rollback.sql"), rollback);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_paket_verkehr_infrastruktur_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} package=1 retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} path_expected_levels=${seed.pathExpectedLevels.length} path_expected_geographies=${seed.pathExpectedGeographies.length} path_expected_entities=${seed.pathExpectedEntities.length} path_expected_topics=${seed.pathExpectedTopics.length}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveAbrufwege} (erwartet 0) · Paket aktiv: ${seed.summary.paketAktiv} (erwartet false)`);
  console.log("Frequenz:", JSON.stringify(seed.summary.frequenz));
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles };
