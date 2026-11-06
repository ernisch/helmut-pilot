"use strict";

// Offline-Negativtests des Planers. Keine DB, keine Credentials, kein Netz.
// Die SQL-Vertragspruefungen ersetzen keinen spaeteren PostgreSQL-Testlauf.
const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");
const CLI = require("./quellen-ergaenzungsplan");
const M = require("../lib/helmut/quellenarchitektur/model");

const copy = (x) => JSON.parse(JSON.stringify(x));
const empty = () => Object.fromEntries(P.TABLES.map((t) => [t, []]));
function baseline(tables) {
  return { complete: true, capturedAt: "2026-11-06T12:00:00.000Z", counts: Object.fromEntries(P.TABLES.map((t) => [t, tables[t].length])), tables: copy(tables) };
}
function fixtures() {
  const base = P.normalizeDesired({
    geographies: [{ id: "geo-bund", name: "Deutschland", level: "bund" }],
    entities: [{ id: "entity-old", name: "Bestehender Herausgeber", entity_type: "parliament", geography_id: "geo-bund", level: "bund" }],
    publishers: [{ id: "publisher-old", name: "Bestand", canonical_domain: "old.example", publisher_type: "parliament", evidence_role: "official_primary", entity_id: "entity-old" }],
    packages: [{ id: "pkg-old", key: "old", name: "Live-Paket", is_base: true, political_level: "bund", geography_id: "geo-bund" }],
    retrievalPaths: [{ id: "rp-old", legacy_source_id: "old", publisher_id: "publisher-old", method: "rss", url: "https://old.example/fixed-feed", name: "Live-Weg" }],
    packagePaths: [{ package_id: "pkg-old", retrieval_path_id: "rp-old" }]
  });
  base.source_packages[0].status = "active";
  Object.assign(base.retrieval_paths[0], { status: "healthy", activation_mode: "always_on", last_success_at: "2026-11-06T11:59:00Z", error_streak: 7, last_error: "historischer-fehler", parser: "live-parser", priority: 77 });
  const desired = copy(base);
  Object.assign(desired.retrieval_paths[0], { status: "broken", activation_mode: "auto", url: "https://old.example/outdated-seed", parser: "old-parser", priority: 1 });
  desired.source_packages[0].status = "paused";
  desired.geographies.push({ id: "geo-new", name: "Neues Land", level: "land", parent_id: "geo-bund" });
  desired.political_entities.push({ id: "entity-new", name: "Neue Institution", entity_type: "authority", geography_id: "geo-new", level: "land" });
  desired.publishers.push({ id: "publisher-new", name: "Neu", canonical_domain: "new.example", publisher_type: "authority", evidence_role: "data_source", entity_id: "entity-new" });
  desired.source_packages.push({ id: "pkg-new", key: "new", name: "Neues Paket", status: "active", is_base: true, geography_id: "geo-new", political_level: "land" });
  desired.retrieval_paths.push({ id: "rp-new", legacy_source_id: "new", name: "Neuer Feed", publisher_id: "publisher-new", method: "rss", url: "https://new.example/feed", status: "healthy", activation_mode: "always_on", priority: 80, is_critical: true, last_success_at: "2026-11-06T12:00:00Z" });
  desired.package_paths.push({ package_id: "pkg-old", retrieval_path_id: "rp-new" }, { package_id: "pkg-new", retrieval_path_id: "rp-old" });
  desired.path_expected_geographies.push({ retrieval_path_id: "rp-new", geography_id: "geo-new" });
  desired.path_expected_entities.push({ retrieval_path_id: "rp-new", entity_id: "entity-new" });
  desired.path_expected_levels.push({ retrieval_path_id: "rp-new", level: "land" });
  desired.path_expected_topics.push({ retrieval_path_id: "rp-new", topic: "Gesundheit" });
  return { snapshot: baseline(base), desired: { tables: desired } };
}
function receiptFor(plan) {
  return { version: P.VERSION, planHash: plan.planHash, rows: P.TABLES.flatMap((t) => plan.additions[t].map((r) => ({
    table_name: t, pk: Object.fromEntries(P.SPECS[t].pk.map((k) => [k, r[k]])),
    row_data: { ...r, ...(P.SPECS[t].pk.includes("id") || t === "package_paths" ? { created_at: "2026-11-06T12:10:00+00:00" } : {}),
      ...(P.SPECS[t].pk.includes("id") ? { updated_at: "2026-11-06T12:10:00+00:00" } : {}),
      ...(t === "retrieval_paths" ? { last_success_at: null, last_error: null, error_streak: 0 } : {}) }
  }))) };
}
let tests = 0;
function check(name, fn) { fn(); tests++; console.log(`PASS ${name}`); }
const { snapshot, desired } = fixtures();
const originalSnapshot = copy(snapshot), originalDesired = copy(desired);
const result = P.artifacts(snapshot, desired), plan = result.plan;

check("Planen veraendert weder Live-Snapshot noch Sollkatalog", () => {
  assert.deepEqual(snapshot, originalSnapshot); assert.deepEqual(desired, originalDesired);
});
check("Delta enthaelt ausschliesslich fehlende IDs und Relationspaare", () => {
  for (const t of P.TABLES) for (const r of plan.additions[t]) assert(!snapshot.tables[t].some((old) => P.SPECS[t].pk.every((k) => r[k] === old[k])));
  assert.equal(plan.counts.retrieval_paths, 1); assert.equal(plan.counts.package_paths, 2);
});
check("Neue Wege bleiben auch an aktivem Pflichtpaket inaktiv", () => {
  const r = plan.additions.retrieval_paths[0];
  assert.equal(r.status, "paused"); assert.equal(r.activation_mode, "manual");
  assert.equal(M.isPathActive(r, ["pkg-old"]), false);
  assert.equal(plan.additions.source_packages[0].status, "prepared");
  assert(!Object.hasOwn(r, "last_success_at"));
});
check("Live-Status, URL, Parser, Health und Prioritaet sind kein Updateziel", () => {
  assert.equal(plan.contract.existingRowsUpdated, 0);
  assert(!/\bupdate\s+public\./i.test(result.applySql));
  assert(!/\bdelete\s+from\s+public\./i.test(result.applySql));
  assert(!result.applySql.includes("outdated-seed"));
  assert(!result.applySql.includes("live-parser"));
  assert(plan.parentAssertions.some((r) => r.table === "retrieval_paths" && r.expected.legacy_source_id === "old"));
});
check("Neue Pakete duerfen vorhandene Wege referenzieren", () => {
  assert(plan.additions.package_paths.some((r) => r.package_id === "pkg-new" && r.retrieval_path_id === "rp-old"));
});
check("Neue Verbindungen zwischen zwei Bestandsobjekten werden separat gemeldet", () => {
  const f = fixtures(); f.snapshot.tables.package_paths = []; f.snapshot.counts.package_paths = 0;
  f.desired.tables.path_expected_topics.push({ retrieval_path_id: "rp-old", topic: "Bestandsaenderung" });
  const p = P.buildPlan(f.snapshot, f.desired);
  assert.equal(p.deferred.length, 2); assert(!p.additions.package_paths.some((r) => r.package_id === "pkg-old" && r.retrieval_path_id === "rp-old"));
});
check("Nur der konkret beauftragte Arbeit/Soziales-Bestandslink darf ergaenzt werden", () => {
  const f = fixtures(), tables = f.snapshot.tables;
  tables.source_packages.push({ ...tables.source_packages[0], id: "pkg-bund-basis", key: "bund-basis" });
  tables.retrieval_paths.push({ ...tables.retrieval_paths[0], id: "rp-ausschuss-arbeit-soziales", legacy_source_id: "ausschuss-arbeit-soziales" });
  f.snapshot = baseline(tables);
  f.desired.tables.package_paths.push({ package_id: "pkg-bund-basis", retrieval_path_id: "rp-ausschuss-arbeit-soziales" });
  const p = P.buildPlan(f.snapshot, f.desired);
  assert.deepEqual(p.approvedExistingLinks, P.APPROVED_EXISTING_LINKS);
  assert(p.additions.package_paths.some((r) => r.package_id === "pkg-bund-basis" && r.retrieval_path_id === "rp-ausschuss-arbeit-soziales"));
});
check("Umgeordnete Snapshot-/Sollzeilen erzeugen bytegleiche Artefakte", () => {
  const b = copy(snapshot), d = copy(desired);
  for (const t of P.TABLES) { b.tables[t].reverse(); d.tables[t].reverse(); }
  assert.deepEqual(P.artifacts(b, d), result);
});
check("Auch Unicode-Gleichklang hat eine eindeutige Sortierung", () => {
  const d = copy(desired);
  d.tables.geographies.push({ id: "geo-e\u0301", level: "land", name: "A", parent_id: "geo-bund" }, { id: "geo-é", level: "land", name: "B", parent_id: "geo-bund" });
  const reversed = copy(d); reversed.tables.geographies.reverse();
  assert.deepEqual(P.artifacts(snapshot, d), P.artifacts(snapshot, reversed));
});
check("Unvollstaendige und unbestaetigte Baselines werden verworfen", () => {
  for (const mutate of [(b) => { delete b.complete; }, (b) => { delete b.counts; }, (b) => { b.counts.publishers++; }, (b) => { delete b.tables.path_expected_entities; }, (b) => { b.capturedAt = "invalid"; }]) {
    const b = copy(snapshot); mutate(b); assert.throws(() => P.buildPlan(b, desired), /Baseline/);
  }
});
check("Doppelte IDs in beiden Eingaben werden verworfen", () => {
  const b = copy(snapshot); b.tables.publishers.push(copy(b.tables.publishers[0])); b.counts.publishers++;
  assert.throws(() => P.buildPlan(b, desired), /doppelter Primaerschluessel/);
  const d = copy(desired); d.tables.retrieval_paths.push(copy(d.tables.retrieval_paths[0]));
  assert.throws(() => P.buildPlan(snapshot, d), /doppelter Primaerschluessel/);
});
check("Fehlende Fremdschluessel und Geografie-Zyklen stoppen die Generierung", () => {
  const d = copy(desired); d.tables.retrieval_paths[1].publisher_id = "nicht-vorhanden";
  assert.throws(() => P.buildPlan(snapshot, d), /Fremdschluessel fehlt/);
  const cycle = copy(desired); cycle.tables.geographies[1].parent_id = "geo-new";
  assert.throws(() => P.buildPlan(snapshot, cycle), /Zyklus/);
});
check("Domain-/Paketkey-Kollisionen und Identitaetswechsel stoppen", () => {
  for (const mutate of [
    (d) => { d.tables.publishers[1].canonical_domain = "old.example"; },
    (d) => { d.tables.publishers[1].canonical_domain = "WWW.OLD.EXAMPLE"; },
    (d) => { d.tables.source_packages[1].key = "old"; },
    (d) => { d.tables.publishers[0].canonical_domain = "changed.example"; },
    (d) => { d.tables.source_packages[0].key = "changed"; }
  ]) { const d = copy(desired); mutate(d); assert.throws(() => P.buildPlan(snapshot, d), /Kollision|bestehende ID/); }
});
check("Schemawerte werden typisiert validiert, technische Sondermethoden gemappt", () => {
  for (const mutate of [
    (d) => { d.tables.retrieval_paths[1].method = "fake-rss"; },
    (d) => { d.tables.retrieval_paths[1].priority = "80"; },
    (d) => { d.tables.source_packages[1].is_base = "true"; },
    (d) => { d.tables.source_packages[1].required_classes = "rss"; },
    (d) => { d.tables.publishers[1].name = "bad\0name"; }
  ]) { const d = copy(desired); mutate(d); assert.throws(() => P.buildPlan(snapshot, d)); }
  const d = copy(desired); d.tables.retrieval_paths[1].method = "api_xml";
  assert.equal(P.buildPlan(snapshot, d).additions.retrieval_paths[0].method, "structured_download");
});
check("Manipulierter Planhash wird vor SQL-Erzeugung abgewiesen", () => {
  const changed = copy(plan); changed.additions.retrieval_paths[0].status = "healthy";
  assert.throws(() => P.applySQL(changed), /Planhash/); assert.throws(() => P.rollbackSQL(changed), /Planhash/);
});
check("Apply verlangt Abwesenheit und aktuelle Elternidentitaet vor dem ersten Insert", () => {
  assert(result.applySql.indexOf("neue ID ist inzwischen vorhanden") < result.applySql.indexOf("insert into public."));
  assert(result.applySql.includes("referenzierte Identitaet geaendert"));
  assert(result.applySql.includes("Herausgeberdomain inzwischen belegt"));
  assert(result.applySql.includes("Paketkey inzwischen belegt"));
  assert(result.applySql.includes("lock_timeout = '3s'"));
  assert(result.applySql.indexOf("commit;") < result.applySql.indexOf("as apply_receipt"));
  assert(result.applySql.includes("erwarteter Fremdschluessel fehlt oder weicht ab"));
  assert(result.applySql.includes('"child":"electoral_districts"'));
  assert(result.applySql.includes("erwarteter eindeutiger Domain-/Paketindex fehlt"));
  assert(result.applySql.includes("jsonb_each(d.row_data)"));
});
check("Rollback ohne Receipt bleibt eine gesperrte Vorlage", () => {
  assert(result.rollbackSql.includes("current_setting('helmut.quellen_ergaenzung_receipt',true)"));
  assert(result.rollbackSql.includes("passendes Apply-Receipt fehlt"));
});
check("Receipt muss Plan, genaue Menge und alle Insertwerte belegen", () => {
  const good = receiptFor(plan); assert.equal(P.validateReceipt(plan, good), good);
  for (const mutate of [
    (r) => { r.planHash = "wrong"; }, (r) => { r.rows.pop(); },
    (r) => { r.rows[1] = copy(r.rows[0]); }, (r) => { r.rows[0].row_data.name = "changed"; },
    (r) => { r.rows[0].pk.id = "foreign"; }
  ]) { const r = copy(good); mutate(r); assert.throws(() => P.rollbackSQL(plan, r), /Receipt/); }
});
check("Rollback vergleicht vollstaendige Livezeile, prueft dynamische FKs und Nutzungsdaten", () => {
  const sql = P.rollbackSQL(plan, receiptFor(plan));
  assert(sql.includes("actual is distinct from r.row_data"));
  assert(sql.includes("from pg_constraint")); assert(sql.includes("generate_subscripts(r.conkey,1)"));
  for (const table of ["raw_documents", "document_findings", "source_crawl_telemetry", "gate_shadow_events", "llm_usage", "knowledge_objects"]) assert(sql.includes(table));
  assert(sql.indexOf("bereits genutzt") < sql.indexOf("delete from public."));
  assert(sql.indexOf("delete from public.package_paths") < sql.indexOf("delete from public.retrieval_paths"));
  assert(sql.indexOf("delete from public.retrieval_paths") < sql.indexOf("delete from public.publishers"));
  assert(!/\b(truncate|drop table|delete[^;]*cascade)\b/i.test(sql));
});
check("SQL-Textinhalte bleiben in kollisionsfreien JSON-Literalen", () => {
  const d = copy(desired); d.tables.retrieval_paths[1].name = "' ; drop table public.x; $helmut_json$ $check$ \\ literal";
  const sql = P.artifacts(snapshot, d).applySql;
  assert(sql.includes("$helmut_jsonx$")); assert(sql.includes('"name":"\' ; drop table public.x; $helmut_json$ $check$ \\\\ literal"'));
});
check("Eingabewerte koennen auch den aeusseren DO-Block nicht beenden", () => {
  const d = copy(desired);
  const malicious = "geo-$check$-$helmut_do$-$helmut_dox$-test";
  d.tables.geographies.push({ id: malicious, level: "land", name: "Delimiterprobe", parent_id: "geo-bund" });
  const a = P.artifacts(snapshot, d);
  for (const sql of [a.applySql, P.rollbackSQL(a.plan, receiptFor(a.plan))]) {
    const blocks = [...sql.matchAll(/^do (\$[a-z_]+\$)([\s\S]*?)\1;/gm)];
    assert(blocks.length >= 3);
    assert.equal(blocks.length, (sql.match(/^do /gm) || []).length);
    for (const [, tag, body] of blocks) assert(!body.includes(tag));
    assert(!sql.includes("do $check$"));
  }
});
check("Vollstaendige leere Baseline ist moeglich, fehlende Baseline nicht", () => {
  assert.equal(P.buildPlan(baseline(empty()), { tables: empty() }).counts.retrieval_paths, 0);
  assert.throws(() => P.buildPlan({}, desired));
});
check("CLI hat keinen Apply-, Ausfuehrungs- oder Datenbank-Schalter", () => {
  for (const arg of ["--apply", "--execute", "--database-url", "--force"]) assert.throws(() => CLI.parseArgs([arg]), /niemals SQL/);
  assert.throws(() => CLI.parseArgs(["--baseline", "x", "--out", "y", "--desired", "z", "--include-landesmodule"]));
});
check("CLI schreibt deterministische Artefakte und ueberschreibt vorhandene nicht", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-plan-test-"));
  try {
    fs.writeFileSync(path.join(dir, "baseline.json"), JSON.stringify(snapshot)); fs.writeFileSync(path.join(dir, "desired.json"), JSON.stringify(desired));
    const out = path.join(dir, "out"), args = [path.join(__dirname, "quellen-ergaenzungsplan.js"), "--baseline", path.join(dir, "baseline.json"), "--desired", path.join(dir, "desired.json"), "--out", out];
    const run = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, NO_NETWORK_TESTS: "1" } });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).sqlExecuted, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8")), plan);
    assert.equal(fs.readFileSync(path.join(out, "apply.sql"), "utf8"), result.applySql);
    const again = spawnSync(process.execPath, args, { encoding: "utf8" }); assert.equal(again.status, 1); assert.match(again.stderr, /besteht bereits/);
    assert.equal(fs.readFileSync(path.join(out, "apply.sql"), "utf8"), result.applySql);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
check("Aktueller Gesamt-Katalog erzeugt einen FK-gueltigen Plan ohne Nebenwirkungen", () => {
  const current = CLI.defaultDesired(false), p = P.buildPlan(baseline(empty()), current);
  assert(p.counts.retrieval_paths > 24); assert(p.additions.retrieval_paths.every((r) => r.status === "paused" && r.activation_mode === "manual"));
  assert(p.additions.source_packages.every((r) => r.status === "prepared"));
});
console.log(`\n${tests} Offline-Pruefungen bestanden.`);

// Optionaler echter PostgreSQL-Nachweis. Nur ein eigens markierter, lokaler,
// netzisolierter Docker-Container ohne Host-Mounts/Ports wird akzeptiert.
// Beispiel: node scripts/quellen-ergaenzungsplan-test.js --postgres-container
// helmut-quellenplan-pgtest [--baseline /pfad/baseline-ergaenzung.json]
// Ohne diesen Schalter bleiben die CI-Pruefungen vollstaendig offline.
function postgresTests(container, baselineFile) {
  assert(/^helmut-quellenplan-pgtest(?:-[a-z0-9]+)?$/.test(container), "Nur expliziter Testcontainer erlaubt");
  const env = { ...process.env };
  for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete env[name];
  const docker = (args, input) => spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], { env, input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const inspection = docker(["inspect", container]); assert.equal(inspection.status, 0, inspection.stderr);
  const c = JSON.parse(inspection.stdout)[0];
  assert.equal(c.Config.Labels?.["helmut.quellenplan-test"], "true");
  assert.equal(c.HostConfig.NetworkMode, "none"); assert(!c.Mounts.some((m) => m.Type !== "tmpfs"));
  assert(!Object.keys(c.HostConfig.PortBindings || {}).length);
  const db = `helmut_quellenplan_test_${process.pid}`;
  const sql = (query, database = db, error) => {
    const r = docker(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], query);
    if (error) { assert.notEqual(r.status, 0, "SQL sollte abbrechen"); assert.match(r.stderr, error); }
    else assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const literal = (x) => "'" + JSON.stringify(x).replace(/'/g, "''") + "'::jsonb";
  const state = () => JSON.parse(sql("select jsonb_build_object(" + P.TABLES.map((t) => `'${t}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${t} t)`).join(",") + ");"));
  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713_source_architecture.sql"), "utf8");
  const boot = `create table public.raw_documents(id text primary key,source_id text,publisher_id text);
create table public.document_findings(source_id text,retrieval_path_id text);
create table public.source_crawl_telemetry(source_id text);
create table public.gate_shadow_events(source_id text,package_id text,geografie text);
create table public.llm_usage(source_id text,package_id text);
create table public.knowledge_objects(affected_geographies jsonb,mentioned_geographies jsonb,decision_entities jsonb,related_entities jsonb);`;
  const setup = (tables) => {
    sql(migration + "\n" + boot);
    for (const t of P.TABLES) if (tables[t].length) {
      // Die ersten Fixtures haben noch keine serverseitigen Zeitstempel. Beim
      // optionalen echten Baseline-Export bleiben alle vorhandenen Werte erhalten.
      const cols = [...new Set(tables[t].flatMap((r) => Object.keys(r)))];
      sql(`insert into public.${t}(${cols.join(",")}) select ${cols.join(",")} from jsonb_populate_recordset(null::public.${t},${literal(tables[t])});`);
    }
  };
  sql("do $roles$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $roles$;", "postgres");
  sql(`create database ${db};`, "postgres");
  let pgChecks = 0;
  try {
    setup(snapshot.tables);
    const before = state(), b = baseline(before), a = P.artifacts(b, desired);
    const receipt = JSON.parse(sql(a.applySql)); P.validateReceipt(a.plan, receipt);
    const after = state();
    for (const t of P.TABLES) for (const row of before[t]) assert(after[t].some((x) => P.stringify(x) === P.stringify(row)), `Bestandszeile veraendert: ${t}`);
    assert.equal(after.retrieval_paths.find((r) => r.id === "rp-new").status, "paused");
    pgChecks++;
    const rollback = P.rollbackSQL(a.plan, receipt);
    const reject = (mutation, pattern, customRollback = rollback) => {
      sql("begin;\n" + mutation + "\n" + customRollback.replace(/\nbegin;\n/, "\n"), db, pattern);
      assert.deepEqual(state(), after, "Fehlgeschlagener Rollback darf nichts veraendern"); pgChecks++;
    };
    sql(a.applySql, db, /neue ID ist inzwischen vorhanden/); assert.deepEqual(state(), after); pgChecks++;
    sql(a.rollbackSql, db, /passendes Apply-Receipt fehlt/); assert.deepEqual(state(), after); pgChecks++;
    reject("update public.retrieval_paths set url='https://changed.example' where id='rp-new';", /inzwischen veraendert/);
    reject("update public.retrieval_paths set error_streak=1 where id='rp-new';", /inzwischen veraendert/);
    reject("update public.source_packages set status='active' where id='pkg-new';", /inzwischen veraendert/);
    reject("insert into public.package_paths(package_id,retrieval_path_id) values('pkg-new','rp-new');", /neue Fremdreferenz/);
    reject("insert into public.electoral_districts(id,kind,name,geography_id) values('foreign-district','landtagswahlkreis','Foreign','geo-new');", /neue Fremdreferenz/);
    reject("create table public.future_refs(id text primary key,path_id text references public.retrieval_paths(id) on delete cascade); insert into public.future_refs values('foreign','rp-new');", /neue Fremdreferenz/);
    reject("alter table public.electoral_districts drop constraint electoral_districts_geography_id_fkey;", /erwarteter Fremdschluessel fehlt/);
    reject("alter table public.publishers drop constraint publishers_pkey cascade;", /erwarteter Primaerschluessel fehlt/);
    reject("drop index public.uq_publishers_domain;", /eindeutiger Domain/);
    for (const [table, column, value] of [
      ["raw_documents", "source_id", "new"], ["document_findings", "retrieval_path_id", "rp-new"],
      ["source_crawl_telemetry", "source_id", "new"], ["gate_shadow_events", "package_id", "new"],
      ["llm_usage", "package_id", "pkg-new"]
    ]) reject(`insert into public.${table}(${table === "raw_documents" ? "id," : ""}${column}) values(${table === "raw_documents" ? "'foreign'," : ""}'${value}');`, /bereits genutzt/);
    reject(`insert into public.knowledge_objects(affected_geographies) values('[{"geography_id":"geo-new"}]');`, /bereits genutzt/);
    reject(`insert into public.knowledge_objects(related_entities) values('[{"entity_id":"entity-new"}]');`, /bereits genutzt/);
    // PostgreSQL prueft dieselbe exakte Array-Konfiguration wie JavaScript.
    const altered = copy(receipt), entity = altered.rows.find((r) => r.table_name === "political_entities");
    entity.row_data.aliases = ["extra"];
    reject("select set_config('helmut.quellen_ergaenzung_receipt'," + "'" + JSON.stringify(altered).replace(/'/g, "''") + "',true);", /Receipt-Menge oder Insertwerte/, a.rollbackSql);
    sql(rollback); assert.deepEqual(state(), before); pgChecks++;
    // Ein inzwischen belegter Delta-PK und ein neuer Domainbesitzer stoppen Apply.
    sql("begin; insert into public.retrieval_paths(id,publisher_id,method) values('rp-new','publisher-old','rss');\n" + a.applySql.replace(/\nbegin;\n/, "\n"), db, /neue ID ist inzwischen vorhanden/);
    assert.deepEqual(state(), before); pgChecks++;
    sql("begin; insert into public.publishers(id,name,canonical_domain,publisher_type,evidence_role) values('third-party','Third','new.example','media','journalistic');\n" + a.applySql.replace(/\nbegin;\n/, "\n"), db, /Herausgeberdomain inzwischen belegt/);
    assert.deepEqual(state(), before); pgChecks++;
    // Die Delimiter-Negativprobe wird auch durch den echten SQL-Parser geschickt.
    const d = copy(desired); d.tables.geographies.push({ id: "geo-$check$-$helmut_do$", name: "Dollar", level: "land", parent_id: "geo-bund" });
    const hostile = P.artifacts(b, d), hostileReceipt = JSON.parse(sql(hostile.applySql));
    sql(P.rollbackSQL(hostile.plan, hostileReceipt)); assert.deepEqual(state(), before); pgChecks++;
    if (baselineFile) {
      // Nur vom Aufrufer benannte oeffentliche Quellendefinitionen. Kein Zugriff
      // auf deren Herkunftssystem; die DB bleibt der isolierte Testcontainer.
      const real = JSON.parse(fs.readFileSync(baselineFile, "utf8")); P.readBaseline(real);
      sql("drop schema public cascade; create schema public;"); setup(real.tables);
      const actualBefore = state(), livePlan = P.artifacts(real, CLI.defaultDesired(false));
      const liveReceipt = JSON.parse(sql(livePlan.applySql));
      const actualAfter = state();
      for (const t of P.TABLES) for (const row of actualBefore[t]) assert(actualAfter[t].some((x) => P.stringify(x) === P.stringify(row)), `Baseline veraendert: ${t}`);
      sql(P.rollbackSQL(livePlan.plan, liveReceipt)); assert.deepEqual(state(), actualBefore); pgChecks++;
    }
    console.log(`${pgChecks} echte PostgreSQL-Pruefungen bestanden; isolierter Container, keine Productionverbindung.`);
  } finally { sql(`drop database ${db};`, "postgres"); }
}
const pgAt = process.argv.indexOf("--postgres-container"), baselineAt = process.argv.indexOf("--baseline");
if (pgAt >= 0) postgresTests(process.argv[pgAt + 1], baselineAt >= 0 ? process.argv[baselineAt + 1] : undefined);
else console.log("SQL nicht auf einer Datenbank ausgefuehrt (optionaler --postgres-container-Nachweis).");
