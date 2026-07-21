"use strict";

// Tests — Master Quellenkatalog · Migrations-Additivitaet (Sprint 3, Phase 10 / Abnahme §12).
// Prueft rein statisch (Datei-Lesung, kein DB-Zugriff), dass die VORBEREITETE Migration
// 20260722_master_source_catalog.sql streng additiv ist, die Mandantentrennung korrekt
// vorbereitet und der Rollback vollstaendig ist. Kein Netz, keine KI.

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// VORBEREITET: die Migration liegt bewusst in supabase/migrations/prepared/ (ausserhalb des
// aktiven Runner-Pfads, konsistent mit Sprint 1), damit kein Auto-Apply moeglich ist.
const root = path.join(__dirname, "..");
const migDir = path.join(root, "supabase", "migrations", "prepared");
const mig = fs.readFileSync(path.join(migDir, "20260722_master_source_catalog.sql"), "utf8");
const rollback = fs.readFileSync(path.join(migDir, "20260722_master_source_catalog_rollback.sql"), "utf8");
// Invariante: die Migration liegt NICHT im aktiven Pfad (supabase/migrations/*.sql).
check("NICHT im aktiven Migrationspfad (kein Auto-Apply)",
  !fs.existsSync(path.join(root, "supabase/migrations/20260722_master_source_catalog.sql")));

const createdTables = [...mig.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
const droppedTables = [...rollback.matchAll(/drop table if exists public\.(\w+)/g)].map((m) => m[1]);

console.log("== Additivitaet ==");
check("Migration legt Tabellen an (>= 12)", createdTables.length >= 12);
check("alle CREATE TABLE sind 'if not exists' (idempotent)",
  (mig.match(/create table/g) || []).length === (mig.match(/create table if not exists/g) || []).length);

// Streng additiv: KEIN alter/drop auf BESTEHENDE (nicht in dieser Migration erzeugte) Tabellen.
const alteredTables = [...mig.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
const createdSet = new Set(createdTables);
const foreignAlters = alteredTables.filter((t) => !createdSet.has(t));
check("kein ALTER auf bestehende Tabellen (nur eigene, fuer RLS)", foreignAlters.length === 0);
check("kein DROP TABLE in der Migration selbst", !/drop table/i.test(mig));
// Die ALTER/RLS/Trigger laufen dynamisch ueber `array['t1','t2',…]`-Schleifen (%I) — der statische
// alter-Regex sieht die nicht. Deshalb explizit: JEDE in einer Schleifen-Array genannte Tabelle
// muss eine NEU angelegte sein (nie eine bestehende Produktionstabelle).
{
  const loopTables = [...mig.matchAll(/array\[([\s\S]*?)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]));
  check("dynamische RLS/Trigger-Schleifen referenzieren NUR neu angelegte Tabellen",
    loopTables.length > 0 && loopTables.every((t) => createdSet.has(t)));
}
// Bestehende Kern-Tabellen duerfen NICHT angefasst werden.
for (const t of ["publishers", "retrieval_paths", "source_packages", "package_paths", "mandate_profiles", "source_crawl_telemetry", "knowledge_objects", "raw_documents"]) {
  check(`bestehende Tabelle '${t}' unangetastet`, !new RegExp(`(alter|drop)\\s+table[^;]*public\\.${t}\\b`, "i").test(mig));
}

console.log("== Belang-Trennung (8 Belange) ==");
for (const t of ["catalog_sources", "catalog_source_paths", "catalog_package_assignments", "catalog_source_health", "catalog_source_audit", "tenant_source_relevance", "tenant_source_overrides", "tenant_private_sources"]) {
  check(`Tabelle ${t} vorhanden`, createdSet.has(t));
}
check("catalog_sources traegt canonical_key UNIQUE (eine Quelle einmal)", /canonical_key\s+text\s+not null\s+unique/.test(mig));
{
  const states = ["discovered", "normalized", "duplicate_candidate", "technically_checked", "classified", "legally_checked", "released", "active", "restricted", "quarantined", "superseded", "archived"];
  check("catalog_sources kennt ALLE 12 Importzustaende im CHECK", states.every((s) => new RegExp("'" + s + "'").test(mig)));
}

console.log("== Mandantentrennung / RLS ==");
check("globale catalog_*-Tabellen: RLS an, Rechte entzogen (service_role-only)",
  /revoke all on table public\.%I/.test(mig) && /enable row level security/.test(mig) && /catalog_publishers','catalog_sources'/.test(mig));
check("globale catalog_*-Tabellen ohne permissive Policy",
  !/create policy[^;]*on public\.catalog_/i.test(mig));
check("tenant_*-Tabellen tragen tenant_id",
  /create table if not exists public\.tenant_source_relevance[\s\S]*tenant_id\s+text not null/.test(mig));
check("tenant_isolation-Policy nutzt helmut_current_tenant + tenant_id",
  /create policy[^']*tenant_isolation[\s\S]*tenant_id = public\.helmut_current_tenant\(\)/.test(mig));
check("private Quellen sind mandantengetrennt (tenant_id im PK)",
  /tenant_private_sources[\s\S]*primary key \(tenant_id, id\)/.test(mig));

console.log("== Rollback vollstaendig ==");
const droppedSet = new Set(droppedTables);
const notDropped = createdTables.filter((t) => !droppedSet.has(t));
check("Rollback entfernt JEDE angelegte Tabelle", notDropped.length === 0);
check("Rollback entfernt keine fremde Tabelle", droppedTables.every((t) => createdSet.has(t)));
check("Rollback entfernt tenant_isolation-Policies", /drop policy if exists tenant_isolation/.test(rollback));

console.log("== Freigabepflicht dokumentiert ==");
check("Migration kennzeichnet FREIGABEPFLICHTIG / nicht automatisch angewendet", /FREIGABEPFLICHTIG/i.test(mig));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
