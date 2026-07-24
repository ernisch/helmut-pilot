"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Quellenpakets
// GESUNDHEIT (Bund): 14 Abrufwege + 11 neue Herausgeber + 11 neue Entitäten + Paket-/Ebenen-/
// Geografie-Zuordnungen. Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING)
// + passendes Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert HART gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default wäre 'auto'!)
// -> die Wege sind technisch INAKTIV. Bestehende Herausgeber/Entitäten werden NICHT angefasst
// (nur NEUE werden eingefügt; das Paket pkg-gesundheit-bund kommt aus dem Basis-Seed).
//
// Ausführung: node scripts/generate-gesundheit-bund-seed.js
//   -> supabase/seeds/20260724_gesundheit_bund_seed.sql
//   -> supabase/seeds/20260724_gesundheit_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildGesundheitBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/gesundheit-bund-quellen");
const { VERIFIKATION, VERIFIKATION_META } = require("../lib/helmut/quellenarchitektur/seeds/gesundheit-bund-verifikation");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");

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
  const seed = buildGesundheitBundSeed();
  const out = [];
  out.push("-- Helmut — Quellenpaket GESUNDHEIT (Bund) · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-gesundheit-bund-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql sind");
  out.push("--   angewendet (Tabellen, Basis-Herausgeber bundesgesundheitsministerium.de/bundesrat.de/");
  out.push("--   destatis.de, Basis-Entitäten ministry-bmg/parliament-bundesrat/statoffice-destatis UND das");
  out.push("--   Paket pkg-gesundheit-bund (status 'prepared') vorhanden).");
  out.push("-- ALLE Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.");
  out.push(`-- Byte-Verifikation der URLs: ${VERIFIKATION_META.byteEbeneStatus} (${VERIFIKATION_META.byteEbeneGrund}).`);
  out.push("begin;");
  out.push("");

  // 0) Paketdefinition (idempotent). Steht auch in PACKAGE_DEFINITIONS (Modell-Sichtbarkeit);
  // hier zusaetzlich, damit dieser Seed eigenstaendig anwendbar ist, OHNE den (separat
  // gepflegten) Basis-Seed regenerieren zu muessen. ON CONFLICT DO NOTHING -> kollisionsfrei,
  // falls der Basis-Seed das Paket spaeter ebenfalls fuehrt.
  const pkg = PACKAGE_DEFINITIONS.find((p) => p.id === seed.packageId);
  if (!pkg) throw new Error(`Paketdefinition ${seed.packageId} fehlt in PACKAGE_DEFINITIONS`);
  out.push("-- 0) Quellenpaket (status 'prepared', is_base false -> kein Pflicht-/Profil-Mapping -> nie aktiviert)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(pkg.id), q(pkg.key), q(pkg.name), q(pkg.purpose), q(pkg.status), qbool(pkg.is_base), q(pkg.political_level), q(pkg.geography_id), qarr(pkg.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 1) Politische Entitaeten (nur NEUE Behörden/Institutionen/Verbände; Bestand bleibt unberührt)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push(`-- wiederverwendete Entitaeten (NICHT eingefügt): ${seed.reusedEntityIds.join(", ")}`);
  out.push("");

  out.push(`-- 2) Herausgeber (nur NEUE, ${seed.publishers.length})`);
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push(`-- wiederverwendete Herausgeber (NICHT eingefügt): ${seed.reusedPublisherIds.join(", ")}`);
  out.push("");

  out.push(`-- 3) Abrufwege (${seed.retrievalPaths.length}) — INAKTIV: status='needs_review', activation_mode='manual' (HART gesetzt)`);
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "expected_frequency", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      q(p.expected_frequency), qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 4) Paket <-> Abrufweg (nur pkg-gesundheit-bund)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 5) Erwartete politische Ebene (bund) je Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 6) Erwartete Geografie (geo-bund) je Abrufweg");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive gesundheit-bund-Wege nach der Eintragung (erwartet: 0 Zeilen).");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
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
  out.push("-- Rollback des GESUNDHEIT-(Bund)-PREPARED-Seeds. Loescht die eingefuegten gesundheit-bund-");
  out.push("-- Abrufwege + Zuordnungen (eindeutige Ids). NEUE Herausgeber/Entitaeten werden GUARDED");
  out.push("-- geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden.");
  out.push("-- Beruehrt KEINE Bestands-Herausgeber (bundesgesundheitsministerium.de/bundesrat.de/destatis.de),");
  out.push("-- keine Bestands-Entitaeten, keine anderen Pakete und das Paket pkg-gesundheit-bund selbst NICHT.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push("-- Neue Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:");
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  out.push("-- Neue Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:");
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
  fs.writeFileSync(path.join(seedDir, "20260724_gesundheit_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_gesundheit_bund_seed_rollback.sql"), rollback);
  const aktiv = seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length;
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_gesundheit_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} levels=${seed.pathExpectedLevels.length} geos=${seed.pathExpectedGeographies.length}`);
  console.log(`wiederverwendet: publishers=${seed.reusedPublisherIds.length} entities=${seed.reusedEntityIds.length}`);
  console.log(`aktive Wege im Seed: ${aktiv} (erwartet 0)`);
  console.log(`Frequenzklassen: ereignisnah=${seed.summary.ereignisnah} regelmaessig=${seed.summary.regelmaessig} periodisch=${seed.summary.periodisch}`);
  console.log(`Byte-Verifikation: ${VERIFIKATION_META.byteEbeneStatus} — ${Object.keys(VERIFIKATION).length} Wege recherche-belegt.`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, writeFiles };
