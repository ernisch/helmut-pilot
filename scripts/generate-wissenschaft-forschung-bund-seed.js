"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Bund-Fachpakets
// `wissenschaft-forschung-bund` (1 Paket + 8 Entitäten + 8 neue Herausgeber + 12 Abrufwege +
// Paket-/Ebenen-/Geografie-Zuordnungen). Erzeugt idempotentes, NICHT-destruktives SQL
// (ON CONFLICT DO NOTHING) + guarded Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default wäre 'auto'!)
//   Paketstatus = 'prepared'  (computeGlobalActivation aktiviert NICHT)
// -> die Wege sind technisch INAKTIV. Bestehende (aktive) Quellen werden NICHT angefasst;
//    Destatis/OECD werden nur REFERENZIERT (nicht neu eingefügt, kein Überschreiben).
//
// Ausführung: node scripts/generate-wissenschaft-forschung-bund-seed.js
//   -> supabase/seeds/20260724_wissenschaft_forschung_bund_seed.sql
//   -> supabase/seeds/20260724_wissenschaft_forschung_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildWissenschaftForschungBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/wissenschaft-forschung-bund");

const SEED_FILE = "20260724_wissenschaft_forschung_bund_seed.sql";
const ROLLBACK_FILE = "20260724_wissenschaft_forschung_bund_seed_rollback.sql";

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) { return `'{}'`; } // required_classes ist immer leer bei diesem Fachpaket

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildWissenschaftForschungBundSeed();
  const out = [];
  out.push("-- Helmut — Fachpaket 'Wissenschaft und Forschung (Bund)' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-wissenschaft-forschung-bund-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + Basis-Seed sind angewendet.");
  out.push("-- Paket status='prepared'; ALLE Abrufwege status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.");
  out.push("-- Destatis/OECD sind BESTEHENDE Herausgeber und werden nur referenziert (nicht eingefügt).");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Quellenpaket (prepared, inaktiv)");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q("prepared"),
      qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 2) Politische Entitäten (8 neue Wissenschafts-/Forschungs-Institutionen)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [
      q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id),
      `array[${(e.aliases || []).map((a) => q(a)).join(", ")}]::text[]`
    ]),
    "id"));
  out.push("");

  out.push("-- 3) Herausgeber (8 neue; Destatis/OECD bestehen bereits und werden NICHT eingefügt)");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [
      q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q("unbekannt"), q("active"), q(p.entity_id)
    ]),
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (12) — INAKTIV: needs_review + manual");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q("googlenews_search"), q(p.url), q(p.query), q("googlenews-batchexecute"),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (nur pkg-wissenschaft-forschung-bund)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene je Abrufweg (bund/eu/international)");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie je Abrufweg (nur Bund-Ebene -> geo-bund)");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- Integritäts-Selbstprüfung (erwartet: 0 Zeilen — kein aktiver Weg, Paket prepared).");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- select id, status from public.source_packages where id = '" + seed.package.id + "' and status <> 'prepared';");
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
  out.push("-- Rollback des Fachpaket-PREPARED-Seeds 'Wissenschaft und Forschung (Bund)'.");
  out.push("-- Löscht die eingefügten Abrufwege + Zuordnungen (eindeutige Ids). Herausgeber/Entitäten");
  out.push("-- werden GUARDED gelöscht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr");
  out.push("-- referenziert werden. Das schützt bereits vorhandene, geteilte Herausgeber");
  out.push("-- (publisher-destatis.de/publisher-oecd.org werden NIE angefasst — sie stehen nicht in der Id-Liste).");
  out.push("-- Berührt KEINE aktiven Bund-Basis-/Fachwege und keine Basis-Daten.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push("-- Paket nur löschen, wenn keine Zuordnung mehr darauf zeigt (nach obigem Delete erfüllt):");
  out.push(`delete from public.source_packages sp where sp.id = '${seed.package.id}'`);
  out.push("  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);");
  out.push("-- Herausgeber nur löschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:");
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  out.push("-- Entitäten nur löschen, wenn KEIN Herausgeber sie mehr referenziert:");
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
  fs.writeFileSync(path.join(seedDir, SEED_FILE), sql);
  fs.writeFileSync(path.join(seedDir, ROLLBACK_FILE), rollback);
  const s = seed.summary;
  console.log(`PREPARED-Seed geschrieben: supabase/seeds/${SEED_FILE}(.rollback)`);
  console.log(`Zeilen: package=1 entities=${seed.entities.length} publishers=${seed.publishers.length} (reuse ${seed.reusedPublisherIds.length}) retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} levels=${seed.pathExpectedLevels.length} geographies=${seed.pathExpectedGeographies.length}`);
  console.log(`Tier 1/2/3: ${s.tier1}/${s.tier2}/${s.tier3} · aktive Wege im Seed: ${s.aktiveAbrufwege} (erwartet 0)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles, SEED_FILE, ROLLBACK_FILE };
