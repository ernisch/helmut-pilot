"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Bundes-Fachpakets
//   "landwirtschaft-ernaehrung-und-laendliche-raeume-bund"
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + guarded Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz. Analog zu scripts/generate-landesmodul-seed.js.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)      -> technisch INAKTIV
//   activation_mode = 'manual'  (nie auto/always_on)   -> KEIN Auto-Crawl (DB-Default wäre 'auto'!)
//   Paket: status='prepared', is_base=false            -> kein Profil-Mapping, kein Crawl-Plan
//   Destatis-Herausgeber + DIP-/Ausschuss-Wege werden NUR wiederverwendet (kein Insert/Update).
//
// Ausführung: node scripts/generate-agrar-bund-seed.js
//   -> supabase/seeds/20260724_agrar_bund_seed.sql
//   -> supabase/seeds/20260724_agrar_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { build } = require("../lib/helmut/quellenarchitektur/seeds/agrar-bund-quellen");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(",")}]::text[]`;
}

// News-Google-RSS-Such-URL aus der Klartext-Query (deterministisch, wie im Bestandskatalog:
// encodeURIComponent lässt ( ) stehen, kodiert Leerzeichen -> %20, Doppelpunkt -> %3A).
function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

function insert(table, columns, rows, conflictKey) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  return `${head}\n${values}\non conflict (${conflictKey}) do nothing;\n`;
}

function buildSql() {
  const seed = build();
  const out = [];
  out.push("-- Helmut — Quellenpaket 'landwirtschaft-ernaehrung-und-laendliche-raeume-bund' · PREPARED-Seed");
  out.push("-- (generiert, idempotent, NICHT-destruktiv). Generiert von scripts/generate-agrar-bund-seed.js.");
  out.push("-- NICHT von Hand editieren. Voraussetzung: 20260713_source_architecture.sql + Basis-Seed angewendet.");
  out.push("-- ALLE neuen Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV.");
  out.push("-- Paket: status='prepared', is_base=false -> kein Profil-Mapping, kein aktiver Crawl-Plan. FREIGABEPFLICHTIG.");
  out.push("-- Wiederverwendet (KEIN Insert/Update): Destatis-Herausgeber, DIP- und Ausschuss-Abrufweg.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Neue politische Entitaeten (Ministerium + 2 Bundesoberbehoerden; historische Namen nur als Alias)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push("-- 2) Neues Quellenpaket (prepared, is_base=false, ohne Pflichtklassen, ohne Profil-Mapping)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q(seed.package.status), qbool(seed.package.is_base), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push("-- 3) Neue Herausgeber (3) — Destatis wird NICHT neu angelegt (Bestand wiederverwendet)");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 4) Neue Abrufwege (7) — INAKTIV: needs_review + manual (Destatis-Weg haengt am Bestands-Herausgeber)");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
    seed.newPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q("googlenews_search"),
      q(googleNewsUrl(p.query)), q(p.query), q("googlenews-batchexecute"),
      qint(p.priority), q("needs_review"), q("manual"), qbool(false), qint(16), q(p.represents_type)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (9): 7 neue + 2 wiederverwendete Bestandswege (rp-dip, rp-committee-landwirtschaft)");
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

  out.push("-- 8) Erwartete Themen je NEUEM Abrufweg (Fachthemen-Kennzeichnung)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive neue Wege nach der Eintragung (erwartet: 0 Zeilen)");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.newPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- Paketstatus muss 'prepared' sein (erwartet: 1 Zeile, status=prepared):");
  out.push(`-- select status, is_base from public.source_packages where id = '${seed.package.id}';`);
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return { sql: out.join("\n"), seed };
}

function buildRollback(seed) {
  const newPathIds = seed.newPaths.map((p) => `'${p.id}'`).join(", ");
  const pubIds = seed.publishers.map((p) => `'${p.id}'`).join(", ");
  const entIds = seed.entities.map((e) => `'${e.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des PREPARED-Seeds 'landwirtschaft-ernaehrung-und-laendliche-raeume-bund'.");
  out.push("-- Loescht die 7 NEUEN Abrufwege + deren Dimensionen + ALLE Paketverknuepfungen dieses Pakets");
  out.push("-- (auch die additiven Links zu den wiederverwendeten Bestandswegen rp-dip / rp-committee-landwirtschaft).");
  out.push("-- Herausgeber/Entitaeten/Paket werden GUARDED geloescht: nur, wenn danach nichts mehr referenziert.");
  out.push("-- Beruehrt KEINE Bestandswege (rp-dip, rp-committee-landwirtschaft bleiben), KEINEN Destatis-Herausgeber,");
  out.push("-- KEINE Basis-Daten und keine bund-basis-Verknuepfungen.");
  out.push("begin;");
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${newPathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${newPathIds});`);
  out.push("-- ALLE Verknuepfungen dieses Pakets loesen (7 neue + 2 wiederverwendete Bestandswege):");
  out.push(`delete from public.package_paths where package_id = '${seed.package.id}';`);
  out.push("-- Nur die 7 NEUEN Abrufwege loeschen (Bestandswege sind NICHT in dieser Liste):");
  out.push(`delete from public.retrieval_paths where id in (${newPathIds});`);
  out.push("-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert (schuetzt geteilte/Bestands-Herausgeber):");
  out.push(`delete from public.publishers p where p.id in (${pubIds})`);
  out.push("  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);");
  out.push("-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:");
  out.push(`delete from public.political_entities e where e.id in (${entIds})`);
  out.push("  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);");
  out.push("-- Paket nur loeschen, wenn KEIN package_paths-Eintrag es mehr referenziert (nach obigem Loeschen: 0):");
  out.push(`delete from public.source_packages sp where sp.id = '${seed.package.id}'`);
  out.push("  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

// Maschinenlesbares Paketmanifest (deterministisch aus dem Datenmodell abgeleitet).
function buildManifest(seed) {
  return {
    package: {
      id: seed.package.id, key: seed.package.key, name: seed.package.name,
      status: seed.package.status, is_base: seed.package.is_base,
      political_level: seed.package.political_level, geography_id: seed.package.geography_id,
      required_classes: seed.package.required_classes
    },
    counts: {
      new_entities: seed.entities.length, new_publishers: seed.publishers.length,
      reused_publishers: seed.reusedPublisherIds.length,
      new_paths: seed.newPaths.length, reused_paths: seed.reusedPaths.length,
      package_paths: seed.packagePaths.length,
      expected_levels: seed.pathExpectedLevels.length,
      expected_geographies: seed.pathExpectedGeographies.length,
      expected_topics: seed.pathExpectedTopics.length
    },
    new_entities: seed.entities.map((e) => ({ id: e.id, type: e.entity_type, name: e.name, aliases: e.aliases })),
    new_publishers: seed.publishers.map((p) => ({ id: p.id, domain: p.canonical_domain, type: p.publisher_type, entity_id: p.entity_id })),
    reused_publishers: seed.reusedPublisherIds,
    new_paths: seed.newPaths.map((p) => ({ id: p.id, publisher_id: p.publisher_id, tier: p.tier, status: "needs_review", activation_mode: "manual", topics: p.topics })),
    reused_paths: seed.reusedPaths.map((p) => ({ id: p.id, tier: p.tier, reused: true })),
    future_targets: seed.futureTargets,
    safety: {
      package_status: seed.package.status, is_base: seed.package.is_base,
      all_new_paths_inactive: seed.newPaths.every(() => true), // Status/Modus hart im Generator gesetzt
      profile_mapping: false, active_crawl_plan: false, applied_to_db: false
    }
  };
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = buildSql();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, "20260724_agrar_bund_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260724_agrar_bund_seed_rollback.sql"), rollback);
  fs.writeFileSync(path.join(seedDir, "20260724_agrar_bund_manifest.json"), JSON.stringify(buildManifest(seed), null, 2) + "\n");
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260724_agrar_bund_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} new_paths=${seed.newPaths.length} reused_paths=${seed.reusedPaths.length} package_paths=${seed.packagePaths.length} levels=${seed.pathExpectedLevels.length} geographies=${seed.pathExpectedGeographies.length} topics=${seed.pathExpectedTopics.length}`);
  const aktiv = seed.newPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length;
  console.log(`aktive neue Wege im Seed: ${aktiv} (erwartet 0) · Paketstatus: ${seed.package.status} · is_base: ${seed.package.is_base}`);
}

if (require.main === module) writeFiles();

module.exports = { buildSql, buildRollback, buildManifest, googleNewsUrl, writeFiles };
