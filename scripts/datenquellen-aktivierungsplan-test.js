"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const A = require("./datenquellen-aktivierungsplan");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const clone = (x) => JSON.parse(JSON.stringify(x));
const snapshot = (tables) => ({ complete: true, capturedAt: "2026-11-06T15:00:00Z", counts: Object.fromEntries(P.TABLES.map((t) => [t, tables[t].length])), tables: clone(tables) });
const strip = (row, columns) => Object.fromEntries(Object.entries(row).filter(([k]) => !columns.includes(k)));
function fixture() {
  const tables = P.normalizeDesired({
    geographies: [{ id: "geo-bund", name: "Deutschland", level: "bund" }],
    publishers: A.TARGETS.map((t) => ({ id: t.publisher, name: t.domain, canonical_domain: t.domain, publisher_type: t.role === "aggregator" ? "aggregator" : "authority", evidence_role: t.role })),
    packages: A.TARGETS.map((t) => ({ id: t.package, key: t.packageKey, name: t.packageKey, is_base: t.packageKey === "bund-basis", political_level: "bund", geography_id: "geo-bund" })),
    retrievalPaths: A.TARGETS.map((t) => ({ id: t.id, legacy_source_id: t.legacy, publisher_id: t.publisher, name: t.legacy, method: "rss", url: t.url, parser: "rss-regex" })),
    packagePaths: A.TARGETS.map((t) => ({ package_id: t.package, retrieval_path_id: t.id }))
  });
  for (const t of A.TARGETS) tables.source_packages.find((r) => r.id === t.package).status = t.packageStatus;
  tables.retrieval_paths.push({ ...tables.retrieval_paths[0], id: "rp-existing", legacy_source_id: "existing", name: "Bestehende Quelle", url: "https://example.invalid/existing", status: "healthy", activation_mode: "always_on" });
  for (const row of tables.retrieval_paths) Object.assign(row, { created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-01-01T00:00:00+00:00", error_streak: 0, last_success_at: null, last_error: null });
  return snapshot(tables);
}
function receiptFor(plan) {
  const appliedAt = "2026-02-01T00:00:00+00:00";
  return { version: A.VERSION, planHash: plan.planHash, appliedAt, rows: plan.changes.map((c) => ({ id: c.id, before_data: c.before_data, after_data: { ...c.before_data, status: "needs_review", activation_mode: c.target_mode, updated_at: appliedAt } })) };
}
const base = fixture(), original = clone(base), a = A.artifacts(base);
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
check("Nur genau zwei benoetigte Status-/Moduswechsel, keine Health-/Paketwrites", () => {
  assert.deepEqual(base, original); assert.equal(a.plan.changes.length, 2);
  assert.deepEqual(a.plan.effects.writtenColumns, ["status", "activation_mode"]);
  assert.equal(a.plan.effects.healthValuesWritten, 0); assert.equal(a.plan.effects.packagesWritten, 0);
  assert(!/\b(delete\s+from|insert\s+into|update)\s+public\.(?!retrieval_paths\b)/i.test(a.applySql));
  assert(!/set\s+(last_success_at|last_error|error_streak|updated_at)/i.test(a.applySql + a.rollbackSql));
});
check("Unvollstaendiger Export, falsche Quelladresse und Ausgangszustaende sperren", () => {
  for (const mutate of [(b) => { b.complete = false; }, (b) => { delete b.tables.retrieval_paths[0].last_error; }, (b) => { b.tables.retrieval_paths[0].url += "?other"; }, (b) => { b.tables.retrieval_paths[0].status = "healthy"; }, (b) => { b.tables.retrieval_paths[0].activation_mode = "auto"; }]) {
    const b = clone(base); mutate(b); assert.throws(() => A.buildPlan(b));
  }
});
check("Fehlende/fremde Paketbindung und Paketstatus sperren", () => {
  for (const mutate of [(b) => { b.tables.package_paths = []; b.counts.package_paths = 0; }, (b) => { b.tables.source_packages[0].status = "prepared"; }, (b) => { b.tables.publishers[0].evidence_role = "journalistic"; }]) {
    const b = clone(base); mutate(b); assert.throws(() => A.buildPlan(b));
  }
});
check("Modi sind fest gebunden: EUR-Lex always_on, Bundespuls auto", () => {
  assert.equal(a.plan.changes.find((r) => r.id === "rp-eurlex-amtsblatt-l-rss").target_mode, "always_on");
  assert.equal(a.plan.changes.find((r) => r.id === "rp-bundespuls-vorgaenge-rss").target_mode, "auto");
  const wrong = clone(a.plan); wrong.changes[0].target_mode = "always_on";
  assert.throws(() => A.applySQL(wrong), /Planhash/); const { planHash, ...body } = wrong; wrong.planHash = P.digest(body);
  assert.throws(() => A.applySQL(wrong), /Schreibbereich/);
});
check("Receipt beweist genaue Vor-/Nachzeilen und unveraenderte Healthwerte", () => {
  const receipt = receiptFor(a.plan); assert.equal(A.validateReceipt(a.plan, receipt), receipt);
  for (const mutate of [(r) => { r.rows.pop(); }, (r) => { r.rows[0].after_data.last_error = "invented"; }, (r) => { r.rows[0].after_data.status = "healthy"; }, (r) => { r.appliedAt = "2020-01-01"; }]) {
    const r = clone(receipt); mutate(r); assert.throws(() => A.validateReceipt(a.plan, r));
  }
});
check("Umgeordnete Baseline erzeugt identische Artefakte", () => {
  const b = clone(base); for (const t of P.TABLES) b.tables[t].reverse(); assert.deepEqual(A.artifacts(b), a);
});
check("Bestehende Runtime waehlt exakt beide Quellen bei aktivem Bund-Profil", () => {
  const profile = { id: "test-aktivierung", fullName: "Fiktives Pruefprofil", party: "Fraktionslos", parliamentType: "Bundestag", state: "Niedersachsen", constituency: "Fiktiver Wahlkreis", focusTopics: ["Arbeit"], profileActive: true };
  const plan = (rows, profiles) => SM.buildRelationalCrawlPlan({ retrievalPaths: rows, packages: base.tables.source_packages, packagePaths: base.tables.package_paths, profiles, legacySources: [], env: {} });
  const rows = base.tables.retrieval_paths.map((r) => { const c = a.plan.changes.find((c) => c.id === r.id); return c ? { ...r, status: "needs_review", activation_mode: c.target_mode } : r; });
  const before = plan(base.tables.retrieval_paths, [profile]), after = plan(rows, [profile]);
  assert.equal(after.aktiv.length - before.aktiv.length, 2);
  assert(A.TARGETS.every((t) => SM.planQuellenFuerProfil(after, profile).some((s) => s.id === t.legacy)));
  assert.equal(plan(rows, []).aktiv.filter((r) => A.TARGETS.some((t) => t.id === r.id)).length, 1);
});
check("CLI hat keinen Apply-Schalter und ueberschreibt keine Reviewdateien", () => {
  for (const arg of ["--apply", "--execute", "--database-url", "--force"]) assert.throws(() => A.main([arg]), /Argument/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-aktivierung-"));
  try {
    const input = path.join(dir, "baseline.json"), out = path.join(dir, "out"); fs.writeFileSync(input, JSON.stringify(base));
    const argv = [path.join(__dirname, "datenquellen-aktivierungsplan.js"), "--baseline", input, "--out", out];
    const result = spawnSync(process.execPath, argv, { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).sqlExecuted, false);
    assert.equal(spawnSync(process.execPath, argv, { encoding: "utf8" }).status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`${checks} Offline-Pruefungen bestanden.`);

// Optional: nur explizit markierter, netzisolierter lokaler Testcontainer.
function postgresTests(container, baselineFile) {
  assert(/^helmut-quellenplan-pgtest(?:-[a-z0-9]+)?$/.test(container));
  const env = { ...process.env }; for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete env[key];
  const docker = (args, input) => spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], { env, input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const inspected = docker(["inspect", container]); assert.equal(inspected.status, 0, inspected.stderr); const c = JSON.parse(inspected.stdout)[0];
  assert.equal(c.Config.Labels?.["helmut.quellenplan-test"], "true"); assert.equal(c.HostConfig.NetworkMode, "none");
  assert(!c.Mounts.some((m) => m.Type !== "tmpfs")); assert(!Object.keys(c.HostConfig.PortBindings || {}).length);
  const db = `helmut_datenaktiv_test_${process.pid}`;
  const sql = (query, error, database = db) => {
    const result = docker(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], query);
    if (error) { assert.notEqual(result.status, 0, "SQL sollte abbrechen"); assert.match(result.stderr, error); }
    else assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const literal = (value) => "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
  const state = () => JSON.parse(sql("select jsonb_build_object(" + P.TABLES.map((t) => `'${t}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${t} t)`).join(",") + ");"));
  const normalized = (tables) => Object.fromEntries(P.TABLES.map((t) => [t, tables[t].map((r) => t === "retrieval_paths" && A.TARGETS.some((a) => a.id === r.id) ? strip(r, ["updated_at"]) : r)]));
  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713_source_architecture.sql"), "utf8");
  const setup = (tables) => {
    sql("create function public.helmut_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;\n" + migration);
    for (const t of P.TABLES) if (tables[t].length) {
      const columns = [...new Set(tables[t].flatMap((r) => Object.keys(r)))];
      sql(`insert into public.${t}(${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::public.${t},${literal(tables[t])});`);
    }
  };
  sql("do $roles$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $roles$;", null, "postgres");
  sql(`create database ${db};`, null, "postgres");
  let pg = 0;
  try {
    setup(base.tables); const before = state(), local = A.artifacts(snapshot(before));
    const rejectApply = (mutation, pattern) => { sql("begin;\n" + mutation + "\n" + local.applySql.replace(/\nbegin;\n/, "\n"), pattern); assert.deepEqual(state(), before); pg++; };
    rejectApply("update public.retrieval_paths set status='healthy' where id='rp-bundespuls-vorgaenge-rss';", /Ausgangszeile geaendert/);
    rejectApply("update public.retrieval_paths set url='https://changed.invalid' where id='rp-eurlex-amtsblatt-l-rss';", /Ausgangszeile geaendert/);
    rejectApply("update public.retrieval_paths set error_streak=1 where id='rp-eurlex-amtsblatt-l-rss';", /Ausgangszeile geaendert/);
    rejectApply("update public.source_packages set status='active' where id='pkg-fach-europaeische-union';", /Elternvoraussetzung geaendert/);
    rejectApply("insert into public.package_paths(package_id,retrieval_path_id) values('pkg-bund-basis','rp-eurlex-amtsblatt-l-rss');", /Paketbindungen geaendert/);
    rejectApply("delete from public.retrieval_paths where id='rp-eurlex-amtsblatt-l-rss';", /Paketbindungen geaendert|Ausgangszeile geaendert/);
    rejectApply("drop trigger set_updated_at on public.retrieval_paths;", /Zeitstempeltrigger/);
    rejectApply("alter table public.retrieval_paths disable trigger set_updated_at;", /Zeitstempeltrigger/);
    rejectApply("create or replace function public.helmut_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); new.last_error='invented'; return new; end; $$;", /Zeitstempeltrigger/);
    rejectApply("create table public.unwanted_rule_writes(id text); create rule unexpected_write as on update to public.retrieval_paths do also insert into public.unwanted_rule_writes values(new.id);", /Schreibregel/);
    rejectApply("alter table public.retrieval_paths add column new_nullable_column text;", /nichtkanonische Baseline oder Schemadrift/);
    const noncanonical = snapshot(before); noncanonical.tables.retrieval_paths[0].created_at = "2026-01-01T00:00:00Z";
    sql(A.applySQL(A.buildPlan(noncanonical)), /nichtkanonische Baseline/); assert.deepEqual(state(), before); pg++;
    // SQL muss vor jeder Mutation auch unvollstaendige, manuell manipulierte Planzeilen ablehnen.
    const incomplete = clone(local.plan); delete incomplete.changes[0].before_data.last_error;
    const { planHash: discardedHash, ...incompleteBody } = incomplete; incomplete.planHash = P.digest(incompleteBody);
    sql(A.applySQL(incomplete), /nichtkanonische Baseline/); assert.deepEqual(state(), before); pg++;
    const receipt = JSON.parse(sql("set timezone='Pacific/Auckland';\n" + local.applySql)); A.validateReceipt(local.plan, receipt); const after = state();
    for (const t of P.TABLES) for (const row of before[t]) {
      const actual = after[t].find((r) => P.SPECS[t].pk.every((k) => r[k] === row[k])); assert(actual);
      if (t === "retrieval_paths" && A.TARGETS.some((target) => target.id === row.id)) assert.deepEqual(strip(actual, A.MUTATED), strip(row, A.MUTATED));
      else assert.deepEqual(actual, row);
    } pg++;
    const rollback = A.rollbackSQL(local.plan, receipt);
    const rejectRollback = (mutation, pattern, rollbackText = rollback) => { sql("begin;\n" + mutation + "\n" + rollbackText.replace(/\nbegin;\n/, "\n"), pattern); assert.deepEqual(state(), after); pg++; };
    rejectRollback("", /passendes Apply-Receipt fehlt/, local.rollbackSql);
    rejectRollback("update public.retrieval_paths set url='https://changed.invalid' where id='rp-bundespuls-vorgaenge-rss';", /Konfiguration\/Modus inzwischen/);
    rejectRollback("update public.retrieval_paths set activation_mode='always_on' where id='rp-bundespuls-vorgaenge-rss';", /Konfiguration\/Modus inzwischen/);
    rejectRollback("update public.retrieval_paths set status='archived' where id='rp-eurlex-amtsblatt-l-rss';", /Konfiguration\/Modus inzwischen/);
    const bad = clone(receipt); bad.rows.pop();
    rejectRollback("select set_config('helmut.datenquellen_aktivierung_receipt'," + "'" + JSON.stringify(bad).replace(/'/g, "''") + "',true);", /Receiptmenge/, local.rollbackSql);
    const rbReceipt = JSON.parse(sql(rollback)); assert.equal(rbReceipt.rows.length, 2); assert.deepEqual(normalized(state()), normalized(before)); pg++;
    // Ruecknahme nach echten Healthaenderungen pausiert, ohne Abrufbelege zu loeschen.
    const b2 = snapshot(state()), a2 = A.artifacts(b2), receipt2 = JSON.parse(sql(a2.applySql));
    sql("update public.retrieval_paths set status='healthy',last_success_at=now(),last_error='historischer Abrufhinweis',error_streak=2 where id='rp-bundespuls-vorgaenge-rss';");
    const used = state(), useRollbackReceipt = JSON.parse(sql(A.rollbackSQL(a2.plan, receipt2))); assert.equal(useRollbackReceipt.rows.length, 2);
    for (const target of A.TARGETS) {
      const prior = used.retrieval_paths.find((r) => r.id === target.id), current = state().retrieval_paths.find((r) => r.id === target.id);
      assert.equal(current.status, "paused"); assert.equal(current.activation_mode, "manual"); assert.deepEqual(strip(current, A.MUTATED), strip(prior, A.MUTATED));
    } pg++;
    // Baseline-Text darf weder JSON- noch aeusseren DO-Delimiter beenden.
    sql("update public.retrieval_paths set name='literal $aktiv_do$ $aktiv_json$' where id='rp-eurlex-amtsblatt-l-rss';");
    const hostileBefore = state(), hostile = A.artifacts(snapshot(hostileBefore)), hostileReceipt = JSON.parse(sql(hostile.applySql)); sql(A.rollbackSQL(hostile.plan, hostileReceipt)); assert.deepEqual(normalized(state()), normalized(hostileBefore)); pg++;
    if (baselineFile) {
      const real = JSON.parse(fs.readFileSync(baselineFile, "utf8")); P.readBaseline(real);
      sql("drop schema public cascade; create schema public;"); setup(real.tables);
      const realBefore = state(), realPlan = A.artifacts(real), realReceipt = JSON.parse(sql(realPlan.applySql)); A.validateReceipt(realPlan.plan, realReceipt);
      const realAfter = state();
      for (const table of P.TABLES) for (const row of realBefore[table]) {
        const current = realAfter[table].find((r) => P.SPECS[table].pk.every((k) => r[k] === row[k]));
        assert.deepEqual(table === "retrieval_paths" && A.TARGETS.some((t) => t.id === row.id) ? strip(current, A.MUTATED) : current,
          table === "retrieval_paths" && A.TARGETS.some((t) => t.id === row.id) ? strip(row, A.MUTATED) : row);
      }
      sql(A.rollbackSQL(realPlan.plan, realReceipt)); assert.deepEqual(normalized(state()), normalized(realBefore)); pg++;
    }
    console.log(`${pg} echte PostgreSQL-Pruefungen bestanden; nur Trigger-updated_at der zwei Zielzeilen darf nach Ruecknahme neuer sein. Keine Productionverbindung.`);
  } finally { sql(`drop database ${db};`, null, "postgres"); }
}
const pgAt = process.argv.indexOf("--postgres-container"), baselineAt = process.argv.indexOf("--baseline");
if (pgAt >= 0) postgresTests(process.argv[pgAt + 1], baselineAt >= 0 ? process.argv[baselineAt + 1] : undefined);
else console.log("Kein SQL ausgefuehrt; optionaler --postgres-container-Nachweis.");
