"use strict";

// Helmut — Quellenarchitektur: Generator fuer den PREPARED-Seed des Bund-Fachpakets
// "Kultur, Medien und Sport (Bund)" (kanonisch: kultur-medien-und-sport-bund).
//
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + passendes Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere sonst auto!)
// -> die neuen Wege sind technisch INAKTIV. Das Paket ist status 'prepared', is_base=false.
// Bestehende (wiederverwendete) Wege/Herausgeber/Entitaeten werden NICHT angefasst — sie werden
// nur zusaetzlich per package_paths / path_expected_entities referenziert.
//
// Ausfuehrung: node scripts/generate-kultur-medien-sport-seed.js
//   -> supabase/seeds/20260724_kultur_medien_sport_bund_seed.sql
//   -> supabase/seeds/20260724_kultur_medien_sport_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildKulturMedienSportSeed } = require("../lib/helmut/quellenarchitektur/seeds/kultur-medien-sport-quellen");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return "array[" + a.map((x) => q(x)).join(", ") + "]::text[]";
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildKulturMedienSportSeed();
  const out = [];
  out.push("-- Helmut — Bund-Fachpaket 'Kultur, Medien und Sport (Bund)' · PREPARED-Seed");
  out.push("-- (generiert, idempotent, NICHT-destruktiv). Generiert von");
  out.push("-- scripts/generate-kultur-medien-sport-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture(.sql) + Basis-Seed angewendet.");
  out.push("-- Paket status='prepared', is_base=false. ALLE neuen Abrufwege: status='needs_review',");
  out.push("-- activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG (kein Crawl/Deploy/Cron).");
  out.push("-- Wiederverwendet (nur referenziert, NICHT veraendert): rp-dip, rp-committee-kultur-medien,");
  out.push("-- rp-committee-sport, publisher-bundesregierung.de, publisher-destatis.de, statoffice-destatis.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Politische Entitaeten (3 neu: BKM, Sport/Ehrenamt-Staatsministerin, NADA)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Herausgeber (2 neu: kulturstaatsminister.de = BKM, nada.de = NADA)");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Quellenpaket (1 neu, prepared, is_base=false)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q(seed.package.status), qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (5 neu) — INAKTIV: needs_review + manual, is_critical=false");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (8: 5 neue + 3 wiederverwendete bestehende Wege)");
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

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (politischer Signalwert)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- 9) Erwartete Entitaet je NEUEM Abrufweg (Korrektur 1: Sport != BKM)");
  out.push(insert("path_expected_entities", ["retrieval_path_id", "entity_id"],
    seed.pathExpectedEntities.map((pe) => [q(pe.retrieval_path_id), q(pe.entity_id)]),
    "retrieval_path_id, entity_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — alle neuen Wege inaktiv:");
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
  const pkgId = `'${seed.package.id}'`;
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds 'Kultur, Medien und Sport (Bund)'. Entfernt ausschliesslich");
  out.push("-- die NEUEN Objekte (5 Wege, 3 Entitaeten, 2 Herausgeber, 1 Paket) + die Paketzuordnungen.");
  out.push("-- WICHTIG: Wiederverwendete Wege (rp-dip, rp-committee-*) und Herausgeber");
  out.push("-- (publisher-bundesregierung.de, publisher-destatis.de) sowie die Entitaet statoffice-destatis");
  out.push("-- werden NICHT geloescht — nur ihre Verknuepfung zum neuen Paket wird entfernt (guarded).");
  out.push("begin;");
  // Erwartete Dimensionen NUR der neuen Wege (Kinder zuerst):
  out.push(`delete from public.path_expected_entities where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  // Alle Paketzuordnungen des NEUEN Pakets (loest auch die Referenz auf wiederverwendete Wege,
  // ohne die Wege selbst zu beruehren):
  out.push(`delete from public.package_paths where package_id = ${pkgId};`);
  // Nur die NEUEN Wege loeschen (wiederverwendete bleiben unberuehrt):
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  // Das neue Paket:
  out.push(`delete from public.source_packages where id = ${pkgId};`);
  // Herausgeber nur loeschen, wenn KEIN (auch kein Bestands-) Abrufweg sie mehr referenziert:
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  // Entitaeten nur loeschen, wenn KEIN Herausgeber und KEIN erwarteter-Entitaet-Eintrag sie mehr referenziert:
  out.push(`delete from public.political_entities e where e.id in (${entIds})`);
  out.push("  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id)");
  out.push("  and not exists (select 1 from public.path_expected_entities pe where pe.entity_id = e.id);");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

// --- Klassifikation je Weg (fuer den Bericht) ---
function klassifiziere(seed) {
  const pubById = new Map([...seed.publishers].map((p) => [p.id, p]));
  const reusedPub = {
    "publisher-bundesregierung.de": { name: "Bundesregierung", evidence_role: "official_primary" },
    "publisher-destatis.de": { name: "Statistisches Bundesamt", evidence_role: "data_source" }
  };
  const neu = seed.retrievalPaths.map((p) => {
    const pub = pubById.get(p.publisher_id) || reusedPub[p.publisher_id] || {};
    return {
      id: p.id, method: p.method, publisher: pub.name, evidence: pub.evidence_role,
      publisherWiederverwendet: !!reusedPub[p.publisher_id], reuse: false, aktivierbar: true
    };
  });
  const reused = seed.reusedPaths.map((r) => ({ id: r.id, reuse: true, reason: r.reason }));
  return { neu, reused };
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = build();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, "20260724_kultur_medien_sport_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_kultur_medien_sport_bund_seed_rollback.sql"), rollback);
  const cls = klassifiziere(seed);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_kultur_medien_sport_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} packages=1 retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} (davon ${seed.reusedPaths.length} wiederverwendet) levels=${seed.pathExpectedLevels.length} geographies=${seed.pathExpectedGeographies.length} topics=${seed.pathExpectedTopics.length} entities_expected=${seed.pathExpectedEntities.length}`);
  console.log(`aktive NEUE Wege im Seed: ${seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length} (erwartet 0)`);
  console.log(`wiederverwendete Wege: ${cls.reused.map((r) => r.id).join(", ")}`);
  console.log(`wiederverwendete Herausgeber (nicht neu): ${seed.reusedPublishers.join(", ")}`);
  console.log(`BISp aufgenommen: ${seed.summary.bispAufgenommen} (Korrektur 6: Future Target)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, klassifiziere, writeFiles };
