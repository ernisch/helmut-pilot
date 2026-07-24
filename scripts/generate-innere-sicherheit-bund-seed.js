"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Fachpakets
// "Innere Sicherheit (Bund)". Erzeugt idempotentes, NICHT-destruktives SQL
// (ON CONFLICT DO NOTHING) + passendes guarded Rollback. REINE CODEGEN, KEIN DB-Zugriff,
// KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'      (nie healthy/active)
//   activation_mode = 'manual'   (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere 'auto'!)
// Das Paket traegt status = 'prepared'. -> Paket + alle neuen Wege sind technisch INAKTIV.
//
// WIEDERVERWENDUNG: Bestehende Wege rp-dip + rp-committee-inneres werden nur per package_paths
// REFERENZIERT (kein neuer retrieval_path). Der Rollback loescht sie NICHT.
//
// Ausfuehrung: node scripts/generate-innere-sicherheit-bund-seed.js
//   -> supabase/seeds/20260724_innere_sicherheit_bund_seed.sql
//   -> supabase/seeds/20260724_innere_sicherheit_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildInnereSicherheitBundSeed } = require("../lib/helmut/quellenarchitektur/seeds/innere-sicherheit-bund");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "'{}'";
  return "array[" + arr.map((v) => q(v)).join(", ") + "]::text[]";
}

// DB-method-CHECK erlaubt: rss/api/html/googlenews_search/structured_download.
const ERLAUBTE_METHODEN = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
function dbMethod(m) { return m; } // dieses Paket nutzt ausschliesslich CHECK-konforme Methoden

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildInnereSicherheitBundSeed();
  const out = [];
  out.push("-- Helmut — Fachpaket \"Innere Sicherheit (Bund)\" · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-innere-sicherheit-bund-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + dessen Basis-Seed sind angewendet");
  out.push("--   (referenziert die BESTEHENDEN ministry-bmi, rp-dip, rp-committee-inneres).");
  out.push("-- Paket status='prepared'; ALLE neuen Abrufwege status='needs_review', activation_mode='manual'");
  out.push("--   -> technisch INAKTIV. FREIGABEPFLICHTIG. Byte-genaue URL-Pruefung vor Aktivierung offen.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Quellenpaket (prepared, is_base=false, Bund) — traegt der eigene Seed (NICHT in packages.js)");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose),
      q(seed.package.status), qbool(seed.package.is_base), q(seed.package.political_level),
      q(seed.package.geography_id), qArr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 2) Neue politische Entitaeten (Behoerden) — ministry-bmi wird NUR referenziert, nicht angelegt");
  out.push(insert("political_entities",
    ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qArr(e.aliases)]),
    "id"));
  out.push("");

  out.push(`-- 3) Herausgeber (${seed.publishers.length})`);
  out.push(insert("publishers",
    ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push(`-- 4) Abrufwege (${seed.retrievalPaths.length}) — INAKTIV: needs_review + manual`);
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "expected_frequency", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(dbMethod(p.method)), q(p.url), q(p.query), q(p.parser),
      q(p.expected_frequency), qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg. Neue rp-isb-* + WIEDERVERWENDETE rp-dip / rp-committee-inneres.");
  out.push("--    (Referenz auf bestehende Wege = Wiederverwendung; Refcount unveraendert, da Paket prepared.)");
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

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (buendelt u. a. die BKA-Lagebilder in EINEM Weg)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- 9) Erwartete Entitaet je NEUEM Abrufweg");
  out.push(insert("path_expected_entities", ["retrieval_path_id", "entity_id"],
    seed.pathExpectedEntities.map((en) => [q(en.retrieval_path_id), q(en.entity_id)]),
    "retrieval_path_id, entity_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Paketstatus muss 'prepared' sein:");
  out.push("-- select status from public.source_packages where id = 'pkg-innere-sicherheit-bund'; -- prepared");
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
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds \"Innere Sicherheit (Bund)\". Loescht NUR die neu");
  out.push("-- eingefuegten Objekte. Schuetzt bestehende, WIEDERVERWENDETE Daten:");
  out.push("--   - rp-dip / rp-committee-inneres werden NICHT geloescht (nur die package_paths-Referenz).");
  out.push("--   - ministry-bmi wird NICHT geloescht (bestehende Entitaet; nicht in der Loeschliste).");
  out.push("--   - Herausgeber/Entitaeten werden GUARDED geloescht (nur wenn nichts mehr sie referenziert).");
  out.push("-- Beruehrt KEINE Bundeswege und keine Basis-Daten.");
  out.push("begin;");
  // Kinder zuerst — nur die NEUEN Wege tragen path_expected_*.
  out.push(`delete from public.path_expected_entities where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${newPathIds});`);
  // ALLE package_paths des Pakets (neue + wiederverwendete Referenzen) — entfernt nur die Verknuepfung.
  out.push("delete from public.package_paths where package_id = 'pkg-innere-sicherheit-bund';");
  // NUR die neuen Abrufwege (rp-dip / rp-committee-inneres sind NICHT enthalten).
  out.push(`delete from public.retrieval_paths where id in (${newPathIds});`);
  // Das Paket selbst.
  out.push("delete from public.source_packages where id = 'pkg-innere-sicherheit-bund';");
  // Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  // Neue Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert (ministry-bmi NICHT in Liste):
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
  fs.writeFileSync(path.join(seedDir, "20260724_innere_sicherheit_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_innere_sicherheit_bund_seed_rollback.sql"), rollback);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_innere_sicherheit_bund_seed(.rollback).sql");
  console.log(`Zeilen: source_packages=1 entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} (davon wiederverwendet=${seed.reusePathIds.length}) topics=${seed.pathExpectedTopics.length} entities_dim=${seed.pathExpectedEntities.length}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveNeueAbrufwege} (erwartet 0) · byte-verifiziert: ${seed.summary.byteVerifiziert} (erwartet 0, Egress gesperrt)`);
  console.log(`Tier1=${seed.summary.tier1} Tier2=${seed.summary.tier2} kritisch=${seed.summary.kritischeWege}`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, dbMethod, ERLAUBTE_METHODEN, writeFiles };
