"use strict";

// Helmut — Neue Quellenarchitektur · Seed-SQL-Generator.
//
// Erzeugt aus dem In-Memory-Modell (lib/helmut/quellenarchitektur) eine idempotente
// SQL-Seed-Datei (INSERT ... ON CONFLICT), die NACH FREIGABE zusammen mit der
// Schema-Migration 20260713_source_architecture.sql angewendet werden kann.
//
// Reine Codegenerierung, KEIN DB-Zugriff, KEIN Netz. Ausfuehrung: node scripts/generate-source-architecture-seed.js
// Ergebnis: supabase/seeds/20260713_source_architecture_seed.sql (reproduzierbar).

const fs = require("fs");
const path = require("path");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");

function q(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function qbool(v) { return v ? "true" : "false"; }
function qint(v) { return (v === null || v === undefined || v === "") ? "null" : String(Number(v)); }
function qarr(a) {
  if (!Array.isArray(a) || !a.length) return "'{}'";
  return `array[${a.map((x) => q(x)).join(",")}]::text[]`;
}

function insert(table, columns, rows, conflictKey, updateCols) {
  if (!rows.length) return `-- ${table}: keine Zeilen\n`;
  const head = `insert into public.${table} (${columns.join(", ")}) values`;
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  const upd = updateCols && updateCols.length
    ? ` do update set ${updateCols.map((c) => `${c} = excluded.${c}`).join(", ")}`
    : " do nothing";
  return `${head}\n${values}\non conflict (${conflictKey})${upd};\n`;
}

// Deterministische Gesamtordnung (P1-Workflow-Haertung): die Zeilenreihenfolge im Seed
// darf NICHT von der Iterationsreihenfolge des Modells abhaengen — sonst erzeugt jede
// Modell-Umsortierung oder parallele Bearbeitung einen scheinbaren "Drift" und
// Merge-Konflikte. sortByKey liefert eine stabile ASCII-Sortierung ueber einen
// Schluessel-String; der Drift-Check (scripts/quellenpaket-workflow-test.js) verlaesst
// sich auf exakt diese Reproduzierbarkeit.
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortByKey(rows, keyFn) { return [...rows].sort((a, b) => cmp(keyFn(a), keyFn(b))); }

function build() {
  const m = buildFullModel();
  const out = [];
  out.push("-- Helmut — Neue Quellenarchitektur · Seed-Daten (generiert, idempotent).");
  out.push("-- Generiert von scripts/generate-source-architecture-seed.js. NICHT von Hand editieren.");
  out.push("-- Voraussetzung: 20260713_source_architecture.sql wurde angewendet. FREIGABEPFLICHTIG.");
  out.push("begin;");
  out.push("");

  // 1) geographies (Eltern zuerst: nach Ebene, dann deterministisch nach id).
  // Die Ebenensortierung ist FK-Pflicht (self-FK parent_id im selben INSERT), die
  // id-Sortierung macht die Reihenfolge innerhalb einer Ebene reproduzierbar.
  const levelOrder = { bund: 0, land: 1, bezirk: 2, kreis: 2, kommune: 3 };
  const geos = [...m.geographies].sort((a, b) =>
    ((levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)) || cmp(a.id, b.id));
  out.push("-- Geografie-Hierarchie");
  out.push(insert("geographies", ["id", "level", "name", "parent_id", "ags"],
    geos.map((g) => [q(g.id), q(g.level), q(g.name), q(g.parent_id), q(g.ags || null)]),
    "id", ["name", "parent_id"]));
  out.push("");

  // 2) political_entities (FK: nur geography_id -> fruehere Tabelle; deterministisch nach id)
  out.push("-- Politische Entitaeten");
  out.push(insert("political_entities", ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"],
    sortByKey(m.entities, (e) => e.id).map((e) => [q(e.id), q(e.entity_type), q(e.name), q(e.canonical_key), q(e.level), q(e.geography_id), qarr(e.aliases)]),
    "id", ["name", "canonical_key", "aliases"]));
  out.push("");

  // 3) publishers (FK: entity_id -> fruehere Tabelle; deterministisch nach id)
  out.push("-- Herausgeber");
  out.push(insert("publishers", ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"],
    sortByKey(m.publishers, (p) => p.id).map((p) => [q(p.id), q(p.name), q(p.canonical_domain), q(p.publisher_type), q(p.evidence_role), q(p.trust), q(p.lifecycle_status), q(p.entity_id)]),
    "id", ["name", "evidence_role", "trust", "entity_id"]));
  out.push("");

  // 4) source_packages (FK: geography_id -> fruehere Tabelle; deterministisch nach id)
  // HINWEIS (Mandantenneutralisierung): Persoenliche Pakete ('profil-<mandats-id>',
  // inkl. Abrufweg 'rp-<mandats-id>-news') werden NICHT geseedet — sie entstehen je
  // Mandat bei der Provisionierung als normale Datenbank-Zeilen. Bereits vorhandene
  // Production-Zeilen bleiben unveraendert bestehen (dieses Seed loescht nichts;
  // alle Statements sind additive Upserts).
  out.push("-- Quellenpakete");
  out.push("-- HINWEIS (Mandantenneutralisierung): Persoenliche Pakete ('profil-<mandats-id>',");
  out.push("-- inkl. Abrufweg 'rp-<mandats-id>-news') werden NICHT geseedet — sie entstehen je");
  out.push("-- Mandat bei der Provisionierung als normale Datenbank-Zeilen. Bereits vorhandene");
  out.push("-- Production-Zeilen bleiben unveraendert bestehen (dieses Seed loescht nichts;");
  out.push("-- alle Statements sind additive Upserts).");
  out.push(insert("source_packages", ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"],
    sortByKey(m.packages, (p) => p.id).map((p) => [q(p.id), q(p.key), q(p.name), q(p.purpose), q(p.status), qbool(p.is_base), q(p.political_level), q(p.geography_id), qarr(p.required_classes)]),
    "id", ["name", "purpose", "status", "required_classes"]));
  out.push("");

  // 5) retrieval_paths (FK: publisher_id -> fruehere Tabelle; deterministisch nach id)
  out.push("-- Abrufwege");
  out.push(insert("retrieval_paths",
    ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"],
    sortByKey(m.retrievalPaths, (p) => p.id).map((p) => [q(p.id), q(p.publisher_id), q(p.legacy_source_id), q(p.name), q(p.method), q(p.url), q(p.query), q(p.parser), qint(p.priority), q(p.status), q(p.activation_mode), qbool(p.is_critical), qint(p.max_items), q(p.represents_type)]),
    "id", ["publisher_id", "method", "status", "priority"]));
  out.push("");

  // 6) package_paths (FK: beide Spalten -> fruehere Tabellen; deterministisch nach Verbundschluessel)
  out.push("-- Paket <-> Abrufweg (m:n)");
  out.push(insert("package_paths", ["package_id", "retrieval_path_id"],
    sortByKey(m.packagePaths, (pp) => `${pp.package_id}|${pp.retrieval_path_id}`).map((pp) => [q(pp.package_id), q(pp.retrieval_path_id)]),
    "package_id, retrieval_path_id", null));
  out.push("");

  out.push("commit;");
  out.push("");
  return out.join("\n");
}

const TARGET = path.join(__dirname, "..", "supabase", "seeds", "20260713_source_architecture_seed.sql");

function writeFile() {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, build());
  const m = buildFullModel();
  console.log(`Seed-SQL geschrieben: ${path.relative(path.join(__dirname, ".."), TARGET)}`);
  console.log(`  geographies=${m.geographies.length} entities=${m.entities.length} publishers=${m.publishers.length} paths=${m.retrievalPaths.length} packages=${m.packages.length} package_paths=${m.packagePaths.length}`);
}

// Nur bei direktem Aufruf schreiben — als Modul importierbar (Drift-Check ruft build()
// ohne Seiteneffekt auf). Vorher lief der Datei-Write bei jedem require.
if (require.main === module) writeFile();

module.exports = { build, writeFile, TARGET };
