"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const N = require("./neutrale-quellenzuordnung-plan");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");
const A = require("./quellen-ergaenzungsplan");
const clone = (x) => JSON.parse(JSON.stringify(x));
const baseline = (tables) => ({ complete: true, capturedAt: "2026-11-06T10:00:00Z", counts: Object.fromEntries(P.TABLES.map((t) => [t, tables[t].length])), tables: clone(tables) });
function fixture() {
  const tables = P.normalizeDesired({
    geographies: [{ id: "geo-land-brandenburg", name: "Brandenburg", level: "land" }],
    publishers: [
      { id: "pub-partei", name: "Die Linke Brandenburg", canonical_domain: "dielinke-brandenburg.de", publisher_type: "party", evidence_role: "direct_interest" },
      { id: "pub-rbb", name: "rbb", canonical_domain: "rbb24.de", publisher_type: "media", evidence_role: "journalistic" }
    ],
    packages: [
      { id: "pkg-brandenburg-basis", key: "brandenburg-basis", name: "Brandenburg Basis", is_base: true, geography_id: "geo-land-brandenburg", political_level: "land" },
      { id: "pkg-die-linke-brandenburg", key: "die-linke-brandenburg", name: "Die Linke Brandenburg", is_base: false, geography_id: "geo-land-brandenburg", political_level: "land" }
    ],
    retrievalPaths: [
      { id: "rp-bb-partei_pilot", legacy_source_id: "bb-partei_pilot", name: "Parteifeed", publisher_id: "pub-partei", method: "rss", url: "https://www.dielinke-brandenburg.de/feed.rss", parser: "rss-regex" },
      { id: "rp-rbb24-politik", legacy_source_id: "rbb24-politik", name: "rbb Politik", publisher_id: "pub-rbb", method: "rss", url: "https://www.rbb24.de/feed", parser: "rss-regex" }
    ],
    packagePaths: [{ package_id: "pkg-brandenburg-basis", retrieval_path_id: "rp-bb-partei_pilot" }]
  });
  tables.source_packages[0].status = "active";
  tables.retrieval_paths[0].status = "needs_review";
  tables.retrieval_paths[1].status = "healthy";
  tables.package_paths[0].created_at = "2026-07-14T06:53:45.465576+00:00";
  return baseline(tables);
}
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const snapshot = fixture(), original = clone(snapshot), artifacts = N.artifacts(snapshot);
check("Exakt drei beauftragte Zuordnungen, keine Quellen-/Statusupdates", () => {
  assert.deepEqual(snapshot, original);
  assert.deepEqual(artifacts.plan.changes.map(({ action, table_name, pk }) => ({ action, table_name, pk })), N.CHANGE);
  assert.deepEqual(artifacts.plan.effects, { deletedLinks: 1, insertedLinks: 2, changedSources: 0, changedPackageStatus: 0, activations: 0 });
  assert(!/\bupdate\s+public\./i.test(artifacts.applySql));
  assert(!/\b(truncate|drop table)\b/i.test(artifacts.applySql + artifacts.rollbackSql));
});
check("Unvollstaendige Baseline oder fehlende alte Bindung stoppt", () => {
  const broken = clone(snapshot); broken.complete = false; assert.throws(() => N.buildPlan(broken));
  const noLink = clone(snapshot); noLink.tables.package_paths = []; noLink.counts.package_paths = 0;
  assert.throws(() => N.buildPlan(noLink), /alte Brandenburg-Basisbindung fehlt/);
});
check("Bereits vorhandene Ziele werden nicht uebernommen", () => {
  for (const c of N.CHANGE.filter((c) => c.action === "insert")) {
    const b = clone(snapshot); b.tables[c.table_name].push(c.pk); b.counts[c.table_name]++;
    assert.throws(() => N.buildPlan(b), /bereits vorhanden/);
  }
});
check("Falscher Herausgeber, Pakettyp oder Geografie wird abgewiesen", () => {
  for (const mutate of [
    (b) => { b.tables.publishers[0].canonical_domain = "other.example"; },
    (b) => { b.tables.publishers[0].evidence_role = "journalistic"; },
    (b) => { b.tables.source_packages[1].is_base = true; },
    (b) => { b.tables.source_packages[1].geography_id = null; }
  ]) { const b = clone(snapshot); mutate(b); assert.throws(() => N.buildPlan(b)); }
});
check("Aktives Zielpaket verboten, Aktivierungszustaende CAS-gebunden", () => {
  const b = clone(snapshot); b.tables.source_packages[1].status = "active";
  assert.throws(() => N.buildPlan(b), /inaktiv bleiben/);
  const guards = artifacts.plan.parentAssertions;
  assert(guards.filter((x) => x.table_name === "source_packages").every((x) => Object.hasOwn(x.expected, "status")));
  assert(guards.filter((x) => x.table_name === "retrieval_paths").every((x) => Object.hasOwn(x.expected, "activation_mode")));
});
check("Planhash und fester Schreibbereich werden validiert", () => {
  const wrongHash = clone(artifacts.plan); wrongHash.changes[0].pk.package_id = "foreign";
  assert.throws(() => N.applySQL(wrongHash), /Planhash/);
  const { planHash, ...body } = wrongHash; wrongHash.planHash = P.digest(body);
  assert.throws(() => N.applySQL(wrongHash), /drei beauftragten Tupeln/);
});
check("Umgeordnete Baseline erzeugt identische Artefakte", () => {
  const b = clone(snapshot); for (const t of P.TABLES) b.tables[t].reverse();
  assert.deepEqual(N.artifacts(b), artifacts);
});
check("Rollback bleibt ohne Receipt gesperrt und prueft Nutzung sowie Insertzeit", () => {
  assert(artifacts.rollbackSql.includes("passendes Apply-Receipt fehlt"));
  assert(artifacts.rollbackSql.includes("Receiptzeit stimmt nicht mit Insertzeit"));
  for (const table of ["raw_documents", "document_findings", "llm_usage", "source_crawl_telemetry", "gate_shadow_events"]) assert(artifacts.rollbackSql.includes(table));
  assert(artifacts.rollbackSql.indexOf("seit Apply genutzte Quelle") < artifacts.rollbackSql.indexOf("delete from public."));
});
check("CLI besitzt keinen Ausfuehrungsschalter und ueberschreibt keine Artefakte", () => {
  for (const arg of ["--apply", "--database-url", "--execute", "--force"]) assert.throws(() => N.main([arg]), /Argument/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-zuordnung-test-"));
  try {
    const file = path.join(dir, "baseline.json"), out = path.join(dir, "out"); fs.writeFileSync(file, JSON.stringify(snapshot));
    const argv = [path.join(__dirname, "neutrale-quellenzuordnung-plan.js"), "--baseline", file, "--out", out];
    const run = spawnSync(process.execPath, argv, { encoding: "utf8" }); assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).sqlExecuted, false);
    assert.equal(fs.readFileSync(path.join(out, "apply.sql"), "utf8"), artifacts.applySql);
    const again = spawnSync(process.execPath, argv, { encoding: "utf8" }); assert.equal(again.status, 1); assert.match(again.stderr, /besteht bereits/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`${checks} Offline-Pruefungen bestanden.`);

// Optional: ausschliesslich markierter lokaler Docker-Testcontainer, ohne Netz,
// Host-Mounts oder Ports. Keine Datenbank-URL und keine Productioncredentials.
function postgresTests(container, baselineFile) {
  assert(/^helmut-quellenplan-pgtest(?:-[a-z0-9]+)?$/.test(container));
  const env = { ...process.env }; for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete env[key];
  const docker = (args, input) => spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], { env, input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const inspected = docker(["inspect", container]); assert.equal(inspected.status, 0, inspected.stderr); const c = JSON.parse(inspected.stdout)[0];
  assert.equal(c.Config.Labels?.["helmut.quellenplan-test"], "true"); assert.equal(c.HostConfig.NetworkMode, "none");
  assert(!c.Mounts.some((m) => m.Type !== "tmpfs")); assert(!Object.keys(c.HostConfig.PortBindings || {}).length);
  const db = `helmut_zuordnung_test_${process.pid}`;
  const sql = (query, error, database = db) => {
    const r = docker(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], query);
    if (error) { assert.notEqual(r.status, 0, "SQL sollte abbrechen"); assert.match(r.stderr, error); }
    else assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const literal = (x) => "'" + JSON.stringify(x).replace(/'/g, "''") + "'::jsonb";
  const state = () => JSON.parse(sql("select jsonb_build_object(" + P.TABLES.map((t) => `'${t}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${t} t)`).join(",") + ");"));
  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713_source_architecture.sql"), "utf8");
  const setup = (tables) => {
    sql(migration + `
      create table public.raw_documents(id text primary key,source_id text,publisher_id text,created_at timestamptz default now(),retrieved_at timestamptz);
      create table public.document_findings(source_id text,retrieval_path_id text,created_at timestamptz default now(),found_at timestamptz);
      create table public.source_crawl_telemetry(source_id text,created_at timestamptz default now());
      create table public.gate_shadow_events(source_id text,package_id text,geografie text,created_at timestamptz default now());
      create table public.llm_usage(source_id text,package_id text,created_at timestamptz default now());
      create table public.knowledge_objects(affected_geographies jsonb,mentioned_geographies jsonb,decision_entities jsonb,related_entities jsonb);`);
    for (const t of P.TABLES) if (tables[t].length) {
      const cols = [...new Set(tables[t].flatMap((r) => Object.keys(r)))];
      sql(`insert into public.${t}(${cols.join(",")}) select ${cols.join(",")} from jsonb_populate_recordset(null::public.${t},${literal(tables[t])});`);
    }
  };
  sql("do $roles$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $roles$;", null, "postgres");
  sql(`create database ${db};`, null, "postgres");
  let pgChecks = 0;
  try {
    setup(snapshot.tables);
    const before = state(), a = N.artifacts(baseline(before));
    const rejectApply = (mutation, pattern) => {
      sql("begin;\n" + mutation + "\n" + a.applySql.replace(/\nbegin;\n/, "\n"), pattern);
      assert.deepEqual(state(), before); pgChecks++;
    };
    rejectApply("delete from public.package_paths;", /alte Basisbindung inzwischen/);
    rejectApply("update public.package_paths set created_at=now();", /alte Basisbindung inzwischen/);
    rejectApply("insert into public.package_paths(package_id,retrieval_path_id) values('pkg-die-linke-brandenburg','rp-bb-partei_pilot');", /Zieltuple inzwischen/);
    rejectApply("update public.source_packages set status='active' where id='pkg-die-linke-brandenburg';", /Elternidentitaet inzwischen/);
    rejectApply("update public.retrieval_paths set activation_mode='always_on' where id='rp-bb-partei_pilot';", /Elternidentitaet inzwischen/);
    rejectApply("update public.retrieval_paths set url='https://changed.example' where id='rp-rbb24-politik';", /Elternidentitaet inzwischen/);
    rejectApply("alter table public.package_paths drop constraint package_paths_pkey;", /Primaerschluessel fehlt/);
    rejectApply("alter table public.package_paths drop constraint package_paths_package_id_fkey;", /Fremdschluessel fehlt/);
    rejectApply("alter table public.package_paths add column new_data text;", /Relationsschema weicht/);
    rejectApply("create table public.future_refs(a text,b text,foreign key(a,b) references public.package_paths(package_id,retrieval_path_id) on delete cascade);", /FK-Abhaengigkeit/);
    const receipt = JSON.parse(sql(a.applySql)), after = state();
    assert.equal(receipt.rows.length, 3);
    for (const table of P.TABLES.filter((t) => !["package_paths", "path_expected_geographies"].includes(t))) assert.deepEqual(after[table], before[table]);
    assert(!after.package_paths.some((r) => r.package_id === "pkg-brandenburg-basis"));
    assert(after.package_paths.some((r) => r.package_id === "pkg-die-linke-brandenburg"));
    assert.deepEqual(after.path_expected_geographies, [{ retrieval_path_id: "rp-rbb24-politik", geography_id: "geo-land-brandenburg" }]); pgChecks++;
    const rollback = N.rollbackSQL(a.plan, receipt);
    const rejectRollback = (mutation, pattern, text = rollback) => {
      sql("begin;\n" + mutation + "\n" + text.replace(/\nbegin;\n/, "\n"), pattern);
      assert.deepEqual(state(), after); pgChecks++;
    };
    sql(a.applySql, /alte Basisbindung inzwischen|Zieltuple inzwischen/); assert.deepEqual(state(), after); pgChecks++;
    rejectRollback("", /passendes Apply-Receipt fehlt/, a.rollbackSql);
    rejectRollback("update public.package_paths set created_at=now();", /neue Bindung inzwischen/);
    rejectRollback("delete from public.path_expected_geographies;", /neue Bindung inzwischen/);
    rejectRollback("insert into public.package_paths(package_id,retrieval_path_id) values('pkg-brandenburg-basis','rp-bb-partei_pilot');", /alte Bindung wieder/);
    for (const t of ["source_crawl_telemetry", "raw_documents", "document_findings", "llm_usage", "gate_shadow_events"]) {
      rejectRollback(`insert into public.${t}(${t === "raw_documents" ? "id," : ""}source_id) values(${t === "raw_documents" ? "'document'," : ""}'rbb24-politik');`, /seit Apply genutzte Quelle/);
    }
    rejectRollback("insert into public.document_findings(source_id) values('rp-rbb24-politik');", /seit Apply genutzte Quelle/);
    const altered = clone(receipt); altered.appliedAt = "2026-01-01T00:00:00Z";
    rejectRollback("", /Receiptzeit stimmt nicht/, N.rollbackSQL(a.plan, altered));
    const wrong = clone(receipt); wrong.rows.pop(); rejectRollback("", /Receipt-Menge weicht/, N.rollbackSQL(a.plan, wrong));
    rejectRollback("create table public.future_refs(a text,b text,foreign key(a,b) references public.path_expected_geographies(retrieval_path_id,geography_id) on delete cascade);", /FK-Abhaengigkeit/);
    sql("insert into public.source_crawl_telemetry(source_id,created_at) values('rbb24-politik','2020-01-01');");
    sql(rollback); assert.deepEqual(state(), before); pgChecks++;
    sql("alter table public.package_paths alter column created_at set default '2020-01-01'::timestamptz;");
    const defaultReceipt = JSON.parse(sql(a.applySql));
    assert.equal(defaultReceipt.appliedAt, defaultReceipt.rows.find((r) => r.action === "insert" && r.table_name === "package_paths").row_data.created_at);
    sql(N.rollbackSQL(a.plan, defaultReceipt)); assert.deepEqual(state(), before);
    sql("alter table public.package_paths alter column created_at set default now();"); pgChecks++;
    // Verschachtelte Dollar-Delimiter werden auch vom echten Parser akzeptiert.
    const special = clone(before); special.retrieval_paths[0].url = "https://example.test/$zuordnung_do$-$zuordnung_json$";
    sql("update public.retrieval_paths set url='https://example.test/$zuordnung_do$-$zuordnung_json$' where id='rp-bb-partei_pilot';");
    const hostile = N.artifacts(baseline(special)), hostileReceipt = JSON.parse(sql(hostile.applySql)); sql(N.rollbackSQL(hostile.plan, hostileReceipt));
    assert.deepEqual(state(), special); pgChecks++;
    if (baselineFile) {
      const real = JSON.parse(fs.readFileSync(baselineFile, "utf8")); P.readBaseline(real);
      sql("drop schema public cascade; create schema public;"); setup(real.tables);
      const realBefore = state(), correction = N.artifacts(real), additive = P.artifacts(real, A.defaultDesired(true));
      const additiveReceipt = JSON.parse(sql(additive.applySql)), afterAdditions = state();
      const correctionReceipt = JSON.parse(sql(correction.applySql)), corrected = state();
      for (const table of P.TABLES.filter((t) => !["package_paths", "path_expected_geographies"].includes(t))) assert.deepEqual(corrected[table], afterAdditions[table]);
      assert.equal(corrected.package_paths.length, afterAdditions.package_paths.length);
      assert.equal(corrected.path_expected_geographies.length, afterAdditions.path_expected_geographies.length + 1);
      sql(N.rollbackSQL(correction.plan, correctionReceipt)); assert.deepEqual(state(), afterAdditions);
      sql(P.rollbackSQL(additive.plan, additiveReceipt)); assert.deepEqual(state(), realBefore); pgChecks++;
    }
    console.log(`${pgChecks} echte PostgreSQL-Pruefungen bestanden; isolierter Container, keine Productionverbindung.`);
  } finally { sql(`drop database ${db};`, null, "postgres"); }
}
const pgAt = process.argv.indexOf("--postgres-container"), baselineAt = process.argv.indexOf("--baseline");
if (pgAt >= 0) postgresTests(process.argv[pgAt + 1], baselineAt >= 0 ? process.argv[baselineAt + 1] : undefined);
else console.log("Kein SQL ausgefuehrt; optionaler --postgres-container-Nachweis.");
