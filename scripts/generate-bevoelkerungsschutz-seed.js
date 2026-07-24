"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Pakets
// "bevoelkerungsschutz-katastrophenschutz-bund" (ziviler Bevoelkerungs- & Katastrophenschutz
// des Bundes). Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + passendes
// guarded Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere 'auto'!)
// Paket: status = 'prepared'. -> Paket + alle neuen Wege technisch INAKTIV. Bestehende Wege
// (rp-dip, rp-committee-inneres) werden NUR additiv zugeordnet, NIE veraendert.
//
// Ausfuehrung: node scripts/generate-bevoelkerungsschutz-seed.js
//   -> supabase/seeds/20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed.sql
//   -> supabase/seeds/20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const {
  buildBevoelkerungsschutzSeed, PACKAGE_ID
} = require("../lib/helmut/quellenarchitektur/seeds/bevoelkerungsschutz-quellen");

const SEED_BASENAME = "20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed";

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
// Postgres text[]-Literal (doppelt gequotete Elemente), '{}' bei leer.
function qTextArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return "'{}'";
  const inner = "{" + arr.map((a) => '"' + String(a).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
  return "'" + inner.replace(/'/g, "''") + "'";
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildBevoelkerungsschutzSeed();
  const out = [];
  out.push("-- Helmut — Paket 'bevoelkerungsschutz-katastrophenschutz-bund' · PREPARED-Seed");
  out.push("-- (generiert, idempotent, NICHT-destruktiv). Generiert von");
  out.push("-- scripts/generate-bevoelkerungsschutz-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + Haupt-Seed sind angewendet");
  out.push("--   (Tabellen + rp-dip, rp-committee-inneres, geo-bund, ministry-bmi,");
  out.push("--    authority-bundesrechnungshof, publisher-bundesrechnungshof.de vorhanden).");
  out.push("-- Paket: status='prepared' (kein Profil-Mapping, kein aktiver Crawl-Plan).");
  out.push("-- Alle NEUEN Abrufwege: status='needs_review', activation_mode='manual' -> INAKTIV.");
  out.push("-- Bestehende Wege werden NUR additiv zugeordnet, NICHT veraendert. FREIGABEPFLICHTIG.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Politische Entitaeten (3 NEU: BBK, THW, IMK). Bestehende (BMI, BRH) NICHT angelegt.");
  out.push(insert("political_entities",
    ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qTextArray(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Herausgeber (4 NEU + bundesrechnungshof.de bestehend via DO NOTHING geschuetzt).");
  out.push(insert("publishers",
    ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Quellenpaket (NEU, status='prepared', kein is_base, Bund).");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q(seed.package.status), qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), qTextArray(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (7 NEU) — INAKTIV: needs_review + manual. Bestehende Wege NICHT hier.");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (9: 7 neue + 2 wiederverwendete rp-dip/rp-committee-inneres).");
  out.push("--    Die 2 Verweise auf bestehende Wege sind rein ADDITIVE Zuordnungen (m:n).");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene (bund) je NEUEM Weg (7).");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie (geo-bund) je NEUEM Weg (7).");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  const newIds = seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ");
  out.push("-- Integritaets-Selbstpruefung (erwartet je 0 Zeilen):");
  out.push("-- (a) kein neuer Weg aktiv:");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push(`--   where id in (${newIds}) and (status <> 'needs_review' or activation_mode <> 'manual');`);
  out.push("-- (b) Paket bleibt prepared:");
  out.push(`-- select id, status from public.source_packages where id = '${PACKAGE_ID}' and status <> 'prepared';`);
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
  out.push("-- Rollback des PREPARED-Seeds 'bevoelkerungsschutz-katastrophenschutz-bund'.");
  out.push("-- Entfernt das Paket + die 7 neuen Wege + Zuordnungen (eindeutige Ids). Herausgeber/");
  out.push("-- Entitaeten werden GUARDED geloescht: NUR wenn danach kein Abrufweg/Herausgeber sie mehr");
  out.push("-- referenziert. Das schuetzt geteilte Bestandsobjekte (publisher-bundesrechnungshof.de,");
  out.push("-- ministry-bmi, authority-bundesrechnungshof) vor versehentlicher Loeschung.");
  out.push("-- Loescht NUR die Paket-Verknuepfungen dieses Pakets — bestehende Wege (rp-dip,");
  out.push("-- rp-committee-inneres) und ihre Zuordnung zu pkg-bund-basis bleiben unveraendert.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where package_id = '${PACKAGE_ID}';`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push(`delete from public.source_packages where id = '${PACKAGE_ID}';`);
  out.push("-- Herausgeber nur loeschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:");
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

// --- Klassifikation je Weg (fuer den Bericht) ---
function klassifiziere(seed) {
  const pubById = new Map(seed.publishers.map((p) => [p.id, p]));
  const neu = seed.retrievalPaths.map((p) => {
    const pub = pubById.get(p.publisher_id) || {};
    return { id: p.id, tier: p.tier, publisher: pub.name, evidence: pub.evidence_role, neu: true, is_critical: p.is_critical };
  });
  const reused = seed.reusedPaths.map((r) => ({ id: r.id, tier: r.tier, publisher: "(bestehend)", neu: false, why: r.why }));
  return [...neu, ...reused];
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = build();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}.sql`), sql);
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}_rollback.sql`), rollback);
  console.log(`PREPARED-Seed geschrieben: supabase/seeds/${SEED_BASENAME}(.rollback).sql`);
  console.log(`Zeilen: package=1 entities=${seed.entities.length} publishers=${seed.publishers.length} (neu ${seed.summary.neuePublisher}) retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} path_expected_levels=${seed.pathExpectedLevels.length} path_expected_geographies=${seed.pathExpectedGeographies.length}`);
  console.log(`Tier: 1=${seed.summary.tier1} 2=${seed.summary.tier2} 3=${seed.summary.tier3} · wiederverwendet=${seed.summary.wiederverwendeteWege} · Wege gesamt=${seed.summary.wegeGesamt}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveNeueWege} (erwartet 0)`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, klassifiziere, writeFiles, SEED_BASENAME };
