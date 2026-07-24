"use strict";

// Helmut — Quellenarchitektur · Generator für den PREPARED-Seed des Bundes-Fachthemenpakets
// `familie-gleichstellung-demografie-bund` (1 Paket + 3 neue Herausgeber + 2 neue Entitäten +
// 6 neue Abrufwege + 1 wiederverwendeter DIP-Weg + Paket-/Ebenen-/Themen-Zuordnungen).
// Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING) + guarded Rollback.
// REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default wäre 'auto'!)
// -> die Wege sind technisch INAKTIV. Das Paket ist status='prepared', is_base=false, ohne
//    Profilzuordnung. Bestehende Zeilen (destatis-Herausgeber, rp-dip, ministry-bmfsfj) werden
//    NUR referenziert, nie überschrieben (ON CONFLICT DO NOTHING).
//
// Ausführung: node scripts/generate-familie-gleichstellung-demografie-bund-seed.js
//   -> supabase/seeds/20260724_familie_gleichstellung_demografie_bund_seed.sql
//   -> supabase/seeds/20260724_familie_gleichstellung_demografie_bund_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildSeed } = require("../lib/helmut/quellenarchitektur/seeds/familie-gleichstellung-demografie-bund");

const SEED_FILE = "20260724_familie_gleichstellung_demografie_bund_seed.sql";
const ROLLBACK_FILE = "20260724_familie_gleichstellung_demografie_bund_seed_rollback.sql";

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
  const seed = buildSeed();
  const out = [];
  out.push("-- Helmut — Paket `familie-gleichstellung-demografie-bund` · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-familie-gleichstellung-demografie-bund-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql + _seed.sql sind angewendet (Tabellen + Bestand: publisher-destatis.de, rp-dip, ministry-bmfsfj).");
  out.push("-- Paket: status='prepared', is_base=false, KEINE Profilzuordnung. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Politische Entitäten (nur NEUE: ADS + UBSKM; ministry-bmfsfj/statoffice-destatis werden wiederverwendet)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    seed.entities.map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id"));
  out.push("");

  out.push(`-- 2) Herausgeber (nur NEUE: ${seed.publishers.length}; publisher-destatis.de wird wiederverwendet, KEIN neuer Insert)`);
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    seed.publishers.map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Quellenpaket (status='prepared', is_base=false, ohne Profilzuordnung)");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    [[q(seed.package.id), q(seed.package.key), q(seed.package.name), q(seed.package.purpose), q("prepared"), qbool(false), q(seed.package.political_level), q(seed.package.geography_id), qarr(seed.package.required_classes)]],
    "id"));
  out.push("");

  out.push(`-- 4) Abrufwege (nur NEUE: ${seed.retrievalPaths.length}) — INAKTIV: needs_review + manual. (rp-dip wird wiederverwendet, KEIN neuer Insert)`);
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
    seed.retrievalPaths.map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(false), qint(p.max_items), q(p.represents_type)
    ]),
    "id"));
  out.push("");

  out.push("-- 5) Paket <-> Abrufweg (6 neue Wege + WIEDERVERWENDUNG von rp-dip als parlamentarischer Weg)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    seed.packagePaths.map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    seed.pathExpectedLevels.map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 7) Erwartete Themen je NEUEM Abrufweg (Abdeckungsmatrix)");
  out.push(insert("path_expected_topics", ["retrieval_path_id", "topic"],
    seed.pathExpectedTopics.map((t) => [q(t.retrieval_path_id), q(t.topic)]),
    "retrieval_path_id, topic"));
  out.push("");

  out.push("-- Integritäts-Selbstprüfung: 0 aktive neue Wege nach der Eintragung. (erwartet: 0 Zeilen)");
  out.push("-- select id, status, activation_mode from public.retrieval_paths");
  out.push("--   where id in (" + seed.retrievalPaths.map((p) => `'${p.id}'`).join(", ") + ")");
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- select id, status, is_base from public.source_packages where id = '" + seed.package.id + "';  -- erwartet: prepared, false");
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
  out.push("-- Rollback des PREPARED-Seeds `familie-gleichstellung-demografie-bund`. GUARDED + NICHT-destruktiv");
  out.push("-- gegenüber Bestand: löscht NUR die eigenen neuen Wege/Zuordnungen; Herausgeber/Entitäten werden");
  out.push("-- nur gelöscht, wenn sie danach von KEINEM Weg/Herausgeber mehr referenziert werden. Das schützt");
  out.push("-- Bestand (publisher-destatis.de, rp-dip, ministry-bmfsfj, statoffice-destatis) vor Cascade-Löschung.");
  out.push("-- Das Paket wird nur gelöscht, solange es 'prepared' ist (versehentlich aktiviertes Paket bleibt).");
  out.push("begin;");
  // Kinder zuerst. package_paths löscht AUCH die additive rp-dip-Verknüpfung — rp-dip selbst bleibt.
  out.push(`delete from public.path_expected_topics where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where package_id = '${seed.package.id}';`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
  out.push("-- Paket nur löschen, wenn noch 'prepared' und keine Zuordnung mehr hängt:");
  out.push(`delete from public.source_packages sp where sp.id = '${seed.package.id}' and sp.status = 'prepared'`);
  out.push("  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);");
  out.push("-- Herausgeber nur löschen, wenn KEIN (auch kein Bestands-) Abrufweg sie mehr referenziert:");
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

// --- Klassifikation je Weg (für den Bericht) ---
function klassifiziere(seed) {
  const pubById = new Map(seed.publishers.map((p) => [p.id, p]));
  const tier1 = new Set(seed.tiers.tier1);
  const tier2 = new Set(seed.tiers.tier2);
  return seed.retrievalPaths.map((p) => {
    const pub = pubById.get(p.publisher_id) || { name: "(Bestand) " + p.publisher_id, evidence_role: "official_primary" };
    let kategorie;
    if (p.method === "googlenews_search") kategorie = "Google-News-Ersatzweg";
    else if (pub.evidence_role === "journalistic") kategorie = "journalistische Quelle";
    else if (pub.evidence_role === "direct_interest") kategorie = "Partei-/Verbandsquelle (Eigeninteresse)";
    else kategorie = "direkte Primärquelle";
    const tier = tier1.has(p.id) ? 1 : tier2.has(p.id) ? 2 : 3;
    return { id: p.id, method: p.method, publisher: pub.name, evidence: pub.evidence_role, kategorie, tier };
  });
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = build();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, SEED_FILE), sql);
  fs.writeFileSync(path.join(seedDir, ROLLBACK_FILE), rollback);
  const cls = klassifiziere(seed);
  console.log(`PREPARED-Seed geschrieben: supabase/seeds/${SEED_FILE} (+ _rollback.sql)`);
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} (neu) + ${seed.reusedPublishers.length} (wiederverwendet) source_packages=1 retrieval_paths=${seed.retrievalPaths.length} (neu) + ${seed.reusedPathIds.length} (wiederverwendet) package_paths=${seed.packagePaths.length} path_expected_levels=${seed.pathExpectedLevels.length} path_expected_topics=${seed.pathExpectedTopics.length}`);
  console.log(`aktive neue Wege im Seed: ${seed.summary.aktiveNeueAbrufwege} (erwartet 0)`);
  const byKat = cls.reduce((m, c) => { m[c.kategorie] = (m[c.kategorie] || 0) + 1; return m; }, {});
  console.log("Klassifikation:", JSON.stringify(byKat));
  console.log(`Tier: 1=${seed.tiers.tier1.length} (inkl. DIP) · 2=${seed.tiers.tier2.length} · 3=${seed.tiers.tier3.length}`);
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, klassifiziere, writeFiles, SEED_FILE, ROLLBACK_FILE };
