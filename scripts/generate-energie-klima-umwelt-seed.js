"use strict";

// Helmut — Quellenarchitektur · Generator fuer den PREPARED-Seed des Bund-Fachthemenpakets
//   energie-klima-umwelt-bund
// (1 Paket + 8 Herausgeber + 8 Entitaeten + 9 Abrufwege + Paket-/Ebenen-/Geografie-Zuordnungen;
// Herausgeber destatis.de und Entitaet statoffice-destatis werden WIEDERVERWENDET, nicht neu
// eingefuegt). Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (hart im SQL gesetzt):
//   retrieval_paths.status = 'needs_review'       (nie healthy/active)
//   retrieval_paths.activation_mode = 'manual'    (nie auto/always_on -> KEIN Auto-Crawl; Default waere 'auto'!)
//   source_packages.status = 'prepared'           (nie active -> keine Referenzzaehlungs-Aktivierung)
// -> Paket + Wege sind technisch INAKTIV. Bestehende AKTIVE Quellen werden NICHT angefasst.
//
// Ausfuehrung: node scripts/generate-energie-klima-umwelt-seed.js
//   -> supabase/seeds/20260724_energie_klima_umwelt_bund_seed.sql
//   -> supabase/seeds/20260724_energie_klima_umwelt_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildEnergieKlimaUmweltSeed } = require("../lib/helmut/quellenarchitektur/seeds/energie-klima-umwelt-bund");

const SEED_BASENAME = "20260724_energie_klima_umwelt_bund_seed";

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qtextarray(arr) {
  if (!Array.isArray(arr) || !arr.length) return "'{}'";
  return "array[" + arr.map((a) => q(a)).join(", ") + "]::text[]";
}

// DB-method-CHECK erlaubt: rss/api/html/googlenews_search/structured_download. Alle Wege dieses
// Pakets sind googlenews_search -> passt bereits; Mapping hier nur als Sicherheitsnetz.
function dbMethod(m) {
  if (m === "opendata_xml" || m === "api_xml") return "structured_download";
  return m;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function build() {
  const seed = buildEnergieKlimaUmweltSeed();
  const p = seed.package;
  const out = [];
  out.push("-- Helmut — Quellenpaket energie-klima-umwelt-bund · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-energie-klima-umwelt-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql sind");
  out.push("--   angewendet (Tabellen, geo-bund, publisher-destatis.de, statoffice-destatis vorhanden).");
  out.push("-- Paket: status='prepared'. Alle Abrufwege: status='needs_review', activation_mode='manual'");
  out.push("--   -> technisch INAKTIV. FREIGABEPFLICHTIG: NICHT automatisch auf Production anwenden.");
  out.push("-- Byte-genaue technische Verifikation steht AUS (Egress in der Vorbereitungsumgebung gesperrt)");
  out.push("--   und bleibt vor jeder Aktivierung zwingend.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Quellenpaket (prepared, inaktiv)");
  out.push(insert("source_packages",
    ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(p.id), q(p.key), q(p.name), q(p.purpose), q("prepared"), qbool(p.is_base), q(p.political_level), q(p.geography_id), qtextarray(p.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 2) Politische Entitaeten (8 neu; statoffice-destatis wird wiederverwendet, NICHT eingefuegt)");
  out.push(insert("political_entities",
    ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qtextarray(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 3) Herausgeber (8 neu; publisher-destatis.de wird wiederverwendet, NICHT eingefuegt)");
  out.push(insert("publishers",
    ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((pub) => [q(pub.id), q(pub.name), q(pub.canonical_domain), q(pub.publisher_type), q(pub.evidence_role), q(pub.trust), q(pub.lifecycle_status), q(pub.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 4) Abrufwege (9) — INAKTIV: needs_review + manual");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
    seed.retrievalPaths.map((rp) => [
      q(rp.id), q(rp.publisher_id), q(rp.legacy_source_id), q(rp.name), q(dbMethod(rp.method)), q(rp.url), q(rp.query), q(rp.parser),
      qint(rp.priority), q("needs_review"), q("manual"), qbool(rp.is_critical), qint(rp.max_items), q(rp.represents_type)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (nur energie-klima-umwelt-bund)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene (bund) je Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Geografie (geo-bund) je Abrufweg");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    seed.pathExpectedGeographies.map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung (erwartet 0 Zeilen): kein Weg dieses Pakets aktiv.");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((rp) => `'${rp.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Selbstpruefung (erwartet 1 Zeile, status='prepared'):");
  out.push(`--   select id, status from public.source_packages where id = '${p.id}';`);
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const p = seed.package;
  const pathIds = seed.retrievalPaths.map((rp) => `'${rp.id}'`).join(", ");
  const pubIds = seed.publishers.map((pub) => `'${pub.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds energie-klima-umwelt-bund. Loescht die eingefuegten");
  out.push("-- Bund-Abrufwege + Zuordnungen + das Paket (eindeutige Ids). Herausgeber/Entitaeten");
  out.push("-- werden GUARDED geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr");
  out.push("-- referenziert werden. Das schuetzt bereits vorhandene, geteilte Herausgeber/Entitaeten");
  out.push("-- (z. B. publisher-destatis.de / statoffice-destatis, von Bestandswegen referenziert)");
  out.push("-- vor versehentlicher Loeschung. Beruehrt KEINE anderen Wege/Pakete/Basis-Daten.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push("-- Paket nur loeschen, wenn KEIN package_paths mehr darauf zeigt:");
  out.push(`delete from public.source_packages sp where sp.id = '${p.id}'`);
  out.push("  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);");
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
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}.sql`), sql);
  fs.writeFileSync(path.join(seedDir, `${SEED_BASENAME}_rollback.sql`), rollback);
  console.log(`PREPARED-Seed geschrieben: supabase/seeds/${SEED_BASENAME}(.rollback).sql`);
  console.log(`Zeilen: package=1 entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} path_expected_levels=${seed.pathExpectedLevels.length} path_expected_geographies=${seed.pathExpectedGeographies.length}`);
  console.log(`aktive Wege im Seed: ${seed.summary.aktiveAbrufwege} (erwartet 0) · technisch verifiziert: ${seed.summary.technischVerifiziert} (Egress gesperrt)`);
  console.log("Tier:", JSON.stringify(seed.summary.tier), "· Frequenz:", JSON.stringify(seed.summary.frequenz));
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, dbMethod, writeFiles, SEED_BASENAME };
