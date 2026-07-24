"use strict";

// Helmut — Quellenarchitektur · Sprint 9B: Generator für den PREPARED-Seed der verifizierten
// Berlin/Brandenburg-Abrufwege (18 Wege + 14 Herausgeber + 4 Entitäten + Paket-/Ebenen-/
// Geografie-Zuordnungen). Erzeugt idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING)
// + passendes Rollback. REINE CODEGEN, KEIN DB-Zugriff, KEIN Netz.
//
// SICHERHEIT (in jedem erzeugten retrieval_paths-Insert hart gesetzt):
//   status = 'needs_review'  (nie healthy/active)
//   activation_mode = 'manual'  (nie auto/always_on -> KEIN Auto-Crawl; DB-Default waere 'auto'!)
// -> die Wege sind technisch INAKTIV. Bundeswege werden NICHT angefasst (nur BE/BB).
//
// Ausfuehrung: node scripts/generate-landesmodul-seed.js
//   -> supabase/seeds/20260717_landesmodul_be_bb_seed.sql
//   -> supabase/seeds/20260717_landesmodul_be_bb_seed_rollback.sql

const fs = require("fs");
const path = require("path");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { LIVE_URTEILE } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation");

function q(v) { return (v === null || v === undefined) ? "null" : `'${String(v).replace(/'/g, "''")}'`; }
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }

// DB-method-CHECK erlaubt: rss/api/html/googlenews_search/structured_download.
// Modul-intern nutzt opendata_xml/api_xml -> auf structured_download mappen.
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

// Deterministische Gesamtordnung (P1-Workflow-Haertung): reproduzierbare Zeilenreihenfolge
// unabhaengig von der Modell-Iteration -> kein scheinbarer Drift, weniger Merge-Konflikte
// bei paralleler Paketarbeit. Der Drift-Check verlaesst sich auf diese Reproduzierbarkeit.
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortByKey(rows, keyFn) { return [...rows].sort((a, b) => cmp(keyFn(a), keyFn(b))); }

function build() {
  const seed = buildLandesmodulSeed();
  const out = [];
  out.push("-- Helmut — Landesmodule Berlin/Brandenburg · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).");
  out.push("-- Generiert von scripts/generate-landesmodul-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed vorhanden).");
  out.push("-- ALLE Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.");
  out.push("begin;");
  out.push("");

  out.push("-- 1) Politische Entitaeten (nur neue Landesverbaende/Fraktion/Person)");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id"],
    sortByKey(seed.entities, (e) => e.id).map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id)]),
    "id"));
  out.push("");

  out.push("-- 2) Herausgeber");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    sortByKey(seed.publishers, (p) => p.id).map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id"));
  out.push("");

  out.push("-- 3) Abrufwege — INAKTIV: needs_review + manual (technisch kein Runtime-Effekt)");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items"],
    sortByKey(seed.retrievalPaths, (p) => p.id).map((p) => [
      q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(dbMethod(p.method)), q(p.url), q(p.query), q(p.parser),
      qint(p.priority), q("needs_review"), q("manual"), qbool(p.is_critical), qint(p.max_items)
    ]),
    "id"));
  out.push("");

  out.push("-- 4) Paket <-> Abrufweg (nur berlin-basis / brandenburg-basis)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    sortByKey(seed.packagePaths, (pp) => `${pp.package_id}|${pp.retrieval_path_id}`).map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id"));
  out.push("");

  out.push("-- 5) Erwartete politische Ebene (land) je Abrufweg");
  out.push(insert("path_expected_levels", ["retrieval_path_id", "level"],
    sortByKey(seed.pathExpectedLevels, (l) => `${l.retrieval_path_id}|${l.level}`).map((l) => [q(l.retrieval_path_id), q(l.level)]),
    "retrieval_path_id, level"));
  out.push("");

  out.push("-- 6) Erwartete Geografie je Abrufweg");
  out.push(insert("path_expected_geographies", ["retrieval_path_id", "geography_id"],
    sortByKey(seed.pathExpectedGeographies, (g) => `${g.retrieval_path_id}|${g.geography_id}`).map((g) => [q(g.retrieval_path_id), q(g.geography_id)]),
    "retrieval_path_id, geography_id"));
  out.push("");

  out.push("-- Integritaets-Selbstpruefung: 0 aktive BE/BB-Wege nach der Eintragung.");
  out.push("-- (erwartet: 0 Zeilen)");
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
  const pathIds = sortByKey(seed.retrievalPaths, (p) => p.id).map((p) => `'${p.id}'`).join(", ");
  const pubIds = sortByKey(seed.publishers, (p) => p.id).map((p) => `'${p.id}'`).join(", ");
  const entIds = sortByKey(seed.entities, (e) => e.id).map((e) => `'${e.id}'`).join(", ");
  const out = [];
  out.push("-- Rollback des Landesmodul-PREPARED-Seeds (Berlin/Brandenburg). Loescht die eingefuegten");
  out.push("-- BE/BB-Abrufwege + Zuordnungen (eindeutige Ids). Herausgeber/Entitaeten werden GUARDED");
  out.push("-- geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden.");
  out.push("-- Das schuetzt bereits vorher vorhandene, geteilte Herausgeber (z. B. publisher-tagesspiegel.de,");
  out.push("-- von Bundeswegen referenziert) vor versehentlicher Loeschung (on delete cascade!).");
  out.push("-- Beruehrt KEINE Bundeswege und keine Basis-Daten.");
  out.push("begin;");
  out.push(`delete from public.path_expected_geographies where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.path_expected_levels where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.package_paths where retrieval_path_id in (${pathIds});`);
  out.push(`delete from public.retrieval_paths where id in (${pathIds});`);
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
  return seed.retrievalPaths.map((p) => {
    const pub = pubById.get(p.publisher_id) || {};
    const live = LIVE_URTEILE[p.legacy_source_id] || {};
    let kategorie;
    if (p.method === "googlenews_search") kategorie = "Google-News-Ersatzweg";
    else if (pub.evidence_role === "journalistic") kategorie = "journalistische Quelle";
    else if (pub.evidence_role === "direct_interest") kategorie = "Partei-/Fraktionsquelle (Eigeninteresse)";
    else kategorie = "direkte Primärquelle";
    const eingeschraenkt = live.urteil === "geeignet mit Einschränkung";
    return { id: p.id, method: dbMethod(p.method), publisher: pub.name, evidence: pub.evidence_role, kategorie, urteil: live.urteil, eingeschraenkt, aktivierbar: !eingeschraenkt };
  });
}

function writeFiles() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const { sql, seed } = build();
  const rollback = buildRollback(seed);
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, "20260717_landesmodul_be_bb_seed.sql"), sql);
  fs.writeFileSync(path.join(seedDir, "20260717_landesmodul_be_bb_seed_rollback.sql"), rollback);
  const cls = klassifiziere(seed);
  console.log("PREPARED-Seed geschrieben: supabase/seeds/20260717_landesmodul_be_bb_seed(.rollback).sql");
  console.log(`Zeilen: entities=${seed.entities.length} publishers=${seed.publishers.length} retrieval_paths=${seed.retrievalPaths.length} package_paths=${seed.packagePaths.length} path_expected_levels=${seed.pathExpectedLevels.length} path_expected_geographies=${seed.pathExpectedGeographies.length}`);
  console.log(`aktive Wege im Seed: ${seed.retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length} (erwartet 0)`);
  const byKat = cls.reduce((m, c) => { m[c.kategorie] = (m[c.kategorie] || 0) + 1; return m; }, {});
  console.log("Klassifikation:", JSON.stringify(byKat));
  console.log("eingeschraenkt/nicht-aktivierbar:", cls.filter((c) => c.eingeschraenkt).map((c) => c.id).join(", "));
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, klassifiziere, dbMethod, writeFiles };
