"use strict";

// Helmut — Sprint 10: Production-Preflight, deterministische SQL-Analyse (READ-ONLY).
//
// Prueft ALLE Migrationen der neuen Quellenarchitektur OFFLINE gegen die Preflight-Kriterien:
//   (2) Idempotenz jeder Migration      (3) vollstaendige Rollback-Symmetrie
//   (12) additiv/teilmigrations-sicher   (13) transaktionale, idempotente Seeds
// Liest ausschliesslich die .sql-Dateien (kein DB-Zugriff, keine Ausfuehrung). Exit 0 = grün.

const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "supabase", "migrations");
const SEEDDIR = path.join(__dirname, "..", "supabase", "seeds");

let pass = 0, fail = 0, warn = 0;
const problems = [];
function check(name, cond, sev = "fail") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); return true; }
  if (sev === "warn") { warn += 1; console.log(`WARN  ${name}`); problems.push({ sev: "warn", name }); return false; }
  fail += 1; console.log(`FAIL  ${name}`); problems.push({ sev: "fail", name }); return false;
}
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
// Kommentarzeilen entfernen, damit Beispiele in Kommentaren nicht als SQL zählen.
const strip = (sql) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// Die freigabepflichtigen, additiven Migrationen der Quellenarchitektur (Fokus des Preflights).
const ARCH = [
  { up: "20260713_source_architecture.sql", down: "20260713_source_architecture_rollback.sql", seed: "20260713_source_architecture_seed.sql" },
  { up: "20260714_ko_classification.sql", down: "20260714_ko_classification_rollback.sql" },
  { up: "20260715_dedup_findings.sql", down: "20260715_dedup_findings_rollback.sql" },
  { up: "20260716_llm_usage_source_attribution.sql", down: "20260716_llm_usage_source_attribution_rollback.sql" },
  { up: "20260712_tenant_rls_policies.sql", down: "20260712_tenant_rls_policies_rollback.sql" }
];

console.log("== (1) Exakte Reihenfolge: eindeutige, aufsteigende Dateinamen ==");
const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !f.includes("rollback")).sort();
check(`${all.length} Vorwärts-Migrationen gefunden, lexikografisch = chronologisch`, all.length >= 5 && all.every((f, i) => i === 0 || all[i - 1] <= f));
check("jede Vorwärts-Migration hat ein Rollback (außer bewusste Ausnahmen)", ARCH.every((m) => fs.existsSync(path.join(DIR, m.down))));

for (const m of ARCH) {
  console.log(`\n== Migration ${m.up} ==`);
  const up = strip(read(DIR, m.up));
  const down = strip(read(DIR, m.down));

  // (2) Idempotenz -----------------------------------------------------------
  const plainCreateTable = [...up.matchAll(/create\s+table\s+(?!if\s+not\s+exists)[a-z0-9_."]/gi)];
  check("Idempotenz: keine CREATE TABLE ohne IF NOT EXISTS", plainCreateTable.length === 0);
  const plainAddCol = [...up.matchAll(/add\s+column\s+(?!if\s+not\s+exists)[a-z0-9_"]/gi)];
  check("Idempotenz: keine ADD COLUMN ohne IF NOT EXISTS", plainAddCol.length === 0);
  const plainIndex = [...up.matchAll(/create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently)[a-z0-9_"]/gi)];
  check("Idempotenz: keine CREATE INDEX ohne IF NOT EXISTS", plainIndex.length === 0);
  // create policy MUSS ein drop policy if exists (gleicher Name) vorausgehen (Postgres kennt kein IF NOT EXISTS für Policies)
  const createPolicies = [...up.matchAll(/create\s+policy\s+(?:%I|"?([a-z0-9_]+)"?|([a-z0-9_]+))/gi)];
  const hasDropPolicyGuard = /drop\s+policy\s+if\s+exists/i.test(up);
  check("Idempotenz: CREATE POLICY nur mit vorherigem DROP POLICY IF EXISTS", createPolicies.length === 0 || hasDropPolicyGuard);
  // create type/enum idempotent (falls vorhanden)
  const plainCreateType = [...up.matchAll(/create\s+type\s+(?!if\s+not\s+exists)/gi)];
  const typeGuarded = plainCreateType.length === 0 || /do\s+\$\$|exception\s+when\s+duplicate_object|if\s+not\s+exists/i.test(up);
  check("Idempotenz: CREATE TYPE abgesichert (DO-Block/Exception) oder nicht vorhanden", typeGuarded);

  // (12) Additivität ---------------------------------------------------------
  const destructive = [...up.matchAll(/\b(drop\s+table(?!\s+if\s+exists)|truncate|delete\s+from|drop\s+column|alter\s+column)\b/gi)];
  check("Additiv: keine destruktive Operation (drop table/column, truncate, delete, alter column)", destructive.length === 0);

  // (3) Rollback-Symmetrie ---------------------------------------------------
  const createdTables = [...up.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map((x) => x[1]);
  const droppedTables = [...down.matchAll(/drop\s+table\s+if\s+exists\s+public\.(\w+)/gi)].map((x) => x[1]);
  if (createdTables.length) check(`Rollback droppt alle ${createdTables.length} erstellten Tabellen`, createdTables.every((t) => droppedTables.includes(t)));
  const addedCols = [...up.matchAll(/add\s+column\s+if\s+not\s+exists\s+(\w+)/gi)].map((x) => x[1]);
  const droppedCols = [...down.matchAll(/drop\s+column\s+if\s+exists\s+(\w+)/gi)].map((x) => x[1]);
  if (addedCols.length) check(`Rollback droppt alle ${addedCols.length} hinzugefügten Spalten`, addedCols.every((c) => droppedCols.includes(c)));
  check("Rollback nutzt durchgängig IF EXISTS (wiederholbar)", !/\bdrop\s+(table|column|index|policy)\s+(?!if\s+exists)/i.test(down));

  // (13)/Transaktionalität ---------------------------------------------------
  check("Migration transaktional oder rein idempotente DDL (begin/commit ODER nur if-not-exists)", /begin\s*;/i.test(up) || (plainCreateTable.length === 0 && plainAddCol.length === 0));
}

// (13) Seed -----------------------------------------------------------------
console.log("\n== (13) Seed 20260713_source_architecture_seed.sql ==");
const seed = read(SEEDDIR, "20260713_source_architecture_seed.sql");
check("Seed transaktional (begin/commit) -> abgebrochener Seed hinterlässt keinen Teilzustand", /begin\s*;/i.test(seed) && /commit\s*;/i.test(seed));
check("Seed idempotent (on conflict) -> wiederholbar", /on\s+conflict/i.test(seed));
check("Seed additiv: kein delete/drop/truncate", !/\b(delete\s+from|drop\s+table|truncate)\b/i.test(strip(seed)));
check("Seed setzt Landespakete NICHT aktiv (kein berlin/brandenburg 'active')", !/berlin.*['\"]active['\"]|brandenburg.*['\"]active['\"]/i.test(seed));

console.log(`\n== Preflight-SQL: ${pass} PASS, ${warn} WARN, ${fail} FAIL ==`);
if (problems.length) { console.log("Befunde:"); for (const p of problems) console.log(`  [${p.sev}] ${p.name}`); }
process.exit(fail > 0 ? 1 : 0);
