"use strict";

// Nur isolierter PostgreSQL17-CI-Service. Kein Productionzugang, kein Skip,
// keine synthetische null500-Altsuite. Die zufaellige eigene DB wird entfernt.
const A = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const R = require("../lib/helmut/realkohorte-500-end-runtime");
const S = require("../lib/helmut/realkohorte-500-startschutz");
const G = require("./realkohorte-500-start-sql");
const { fixture, belegFixture, paket, bytes, COMMIT } = require("./realkohorte-500-runtime-test");
const MIG = path.join(__dirname, "../supabase/migrations/20261001115020_realkohorte500_end_runtime.sql");
const ROLLBACK = path.join(__dirname, "../supabase/migrations/rollback_20261001115020_realkohorte500_end_runtime.sql");
const host = process.env.HELMUT_TEST_PG_HOST;
const port = process.env.HELMUT_TEST_PG_PORT || "5433";
const user = process.env.HELMUT_TEST_PG_USER || "helmut";
const db = "helmut_real500_runtime_test_" + crypto.randomBytes(8).toString("hex");
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = value => literal(JSON.stringify(value)) + "::jsonb";
const shaSql = expr => `encode(sha256(convert_to((${expr})::text,'UTF8')),'hex')`;
const clone = value => structuredClone(value);
let pass = 0;
const ok = name => { pass++; console.log("PASS " + name); };

function psql(sql, database = db) {
  A.ok(database === db || database === "postgres", "Nur eigene DB oder explizite lokale Admin-DB");
  try {
    return execFileSync("psql", ["-X", "-w", "-h", host, "-p", port, "-U", user,
      "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: sql, encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
      // Keine PG*-Vererbung: PGHOSTADDR koennte selbst -h sonst uebersteuern.
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
        PGPASSWORD: process.env.PGPASSWORD || "helmut", PGHOSTADDR: "127.0.0.1", PGCONNECT_TIMEOUT: "5",
        PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=3000" }
    }).trim();
  } catch (error) {
    const code = String(error.stderr || "").match(/real500-[a-z0-9-]+/)?.[0];
    // Niemals SQL, Profilabbilder, private Envelopes oder Credentials loggen.
    throw new Error(code || "real500-runtime-psql-" + (error.code || "fehler"));
  }
}

function lese() {
  return JSON.parse(psql(`select jsonb_build_object(
    'mandate',(select coalesce(jsonb_agg(to_jsonb(p) order by user_id collate "C"),'[]'::jsonb) from public.mandate_profiles p),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.profiles p),
    'store',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.helmut_store p),
    'graph',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.graph_testdaten p),
    'ruhe',jsonb_build_object(
      'locks',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.pipeline_locks p),
      'jobs',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.helmut_jobs p),
      'runs',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.process_runs p)));`));
}
function readSql(x, args = {}) {
  const a = { operationId: x.f.manifest.operationId, manifestHash: x.manifestHash, productionCommit: COMMIT, ...args };
  return `select public.${R.READ_RPC_NAME}(${literal(a.operationId)},${literal(a.manifestHash)},${literal(a.productionCommit)});`;
}
function endSql(x, args = {}) {
  const a = { operationId: x.f.manifest.operationId, manifestHash: x.manifestHash, productionCommit: COMMIT,
    grund: "notstopp", bestaetigung: R.BESTAETIGUNG, ...args };
  return `select public.${R.RPC_NAME}(${literal(a.operationId)},${literal(a.manifestHash)},${literal(a.productionCommit)},
    ${literal(a.grund)},${literal(a.bestaetigung)});`;
}
function ruf(sql) { return JSON.parse(psql("set role service_role;" + sql)); }
function abweisen(sql, code = /real500-runtime-/) {
  const before = lese(); A.throws(() => ruf(sql), code);
  A.deepEqual(lese(), before, "Abweisung/Triggerfehler muss alle Zeilen und Quittung exakt erhalten");
}
function reset({ prepared = false, active = 500, preparedLong = false } = {}) {
  psql("truncate public.graph_testdaten,public.mandate_profiles,public.profiles,public.helmut_store,public.pipeline_locks,public.helmut_jobs,public.process_runs;");
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const model = fixture({ day });
  psql(`insert into public.profiles select r.id,r.name,r.inhalt
    from jsonb_to_recordset(${json(model.snapshot.profiles)}) as r(id text,name text,inhalt jsonb);
    insert into public.mandate_profiles(user_id,aktiv,geloescht_at,updated_at,partei,fraktion,inhalt)
    select r.user_id,false,null,${literal(day + "T10:00:00.000Z")}::timestamptz,r.partei,r.fraktion,r.inhalt
      from jsonb_to_recordset(${json(model.snapshot.mandate_profiles)}) as r(user_id text,partei text,fraktion text,inhalt jsonb);
    insert into public.graph_testdaten(id,user_id,inhalt)
      select 'graph-'||id,id,jsonb_build_object('synthetisch',true,'bewahren','exakt') from public.profiles;
    insert into public.helmut_store(id,data) values
      ('main','{"bewahren":"main","synthetisch":true}'::jsonb),
      ('main-auth','{"bewahren":"auth","synthetisch":true}'::jsonb),
      ('fremder-runtime-slot','{"bewahren":"exakt"}'::jsonb);`);
  const before = lese();
  const snapshot = { beobachtetAm: day + "T10:00:30.000Z", mandate_profiles: before.mandate, profiles: before.profiles };
  const f = fixture({ snapshot, day, operationId: "real500-runtime-isolierte-db-" + crypto.randomBytes(6).toString("hex") });
  if (prepared && !preparedLong) {
    f.manifest.endeAm = day + "T13:00:00.000Z";
    f.quittung.manifest = clone(f.manifest);
  }
  const { endwaechter, ...sourceBelege } = belegFixture(f);
  const base = S.pruefeVorbereitung({ ...f, belege: sourceBelege }, bytes, Date.parse(day + "T10:01:00.000Z")).startbelegeGrundlinie;
  const runtimeManifest = { version: "helmut-realkohorte500-runtime-manifest/1", profilManifestHash: V.hash(f.manifest),
    profilvertrag: f.manifest, startbelegeGrundlinie: base };
  const mhash = V.hash(runtimeManifest), op = f.manifest.operationId;
  const sourceRef = field => ({ freigegeben: true, belegHash: base[field], paketHash: V.PAKET_HASH, idsHash: V.IDS_HASH });
  const go = { freigegeben: true, operationId: op, manifestHash: mhash, belegHash: "a".repeat(64) };
  // Strukturierte synthetische Ref-Fixture, ausdruecklich keine echte Fach-/Rechtsfreigabe.
  const startbelege = { version: "helmut-realkohorte500-startbelege/1", grundlinie: base,
    qualifizierteRechtsfreigabe: { ...sourceRef("phaseAHash"), qualifiziert: true },
    fachfreigabe: sourceRef("fachHash"), aktivierungsGo: prepared ? null : clone(go),
    endwaechterBereit: prepared ? null : { bereit: true, operationId: op, manifestHash: mhash, productionCommit: COMMIT } };
  const q = prepared ? null : f.quittung, slot = "realkohorte500-runtime-" + op;
  const envelope = { version: "helmut-realkohorte500-runtime/1", operationId: op, manifest: runtimeManifest,
    manifestHash: mhash, manifestSqlHash: null, snapshot, snapshotSqlHash: null, quittung: q,
    quittungSqlHash: null, startbelege, startbelegeSqlHash: null, zustand: prepared ? "vorbereitet" : "aktiv" };
  psql(`with x as (select ${json(envelope)} as e)
    insert into public.helmut_store(id,data) select ${literal(slot)},e||jsonb_build_object(
      'manifestSqlHash',${shaSql("e->'manifest'")},'snapshotSqlHash',${shaSql("e->'snapshot'")},
      'startbelegeSqlHash',${shaSql("e->'startbelege'")},
      'quittungSqlHash',${prepared ? "null::text" : shaSql("e->'quittung'")}) from x;`);
  if (!prepared) psql(`update public.mandate_profiles set aktiv=true
    where user_id in (select user_id from public.mandate_profiles order by user_id collate "C" limit ${active});`);
  // JS-Vertrag wird unabhaengig vom SQL-Hashvertrag ebenfalls vor dem RPC geprueft.
  V.pruefeManifest(f.manifest, bytes, f.snapshot);
  return { f, slot, runtimeManifest, manifestHash: mhash };
}
function invariant(before, after, slot) {
  A.equal(after.mandate.length, 500); A.ok(after.mandate.every(r => r.aktiv === false));
  A.deepEqual(V.fachzeilen(after.mandate), V.fachzeilen(before.mandate));
  A.equal(after.profiles.length, 501); A.deepEqual(after.profiles, before.profiles);
  A.deepEqual(after.graph, before.graph);
  A.deepEqual(after.ruhe, before.ruhe);
  A.deepEqual(after.store.filter(r => r.id !== slot), before.store.filter(r => r.id !== slot));
}
function alterEnvelope(x, expression, rehashField = null) {
  psql(`update public.helmut_store set data=${expression} where id=${literal(x.slot)};`);
  if (rehashField) psql(`update public.helmut_store set data=jsonb_set(data,${literal("{" + rehashField + "SqlHash}")},
    to_jsonb(${shaSql("data->" + literal(rehashField))})) where id=${literal(x.slot)};`);
}

function frischeStartFixture() {
  const seeded = reset({ prepared: true });
  psql(`delete from public.helmut_store where id=${literal(seeded.slot)};`);
  const now = Date.now() - 1000, day = new Date(now).toISOString().slice(0, 10), am = new Date(now).toISOString();
  const dayEnd = Date.parse(day + "T23:59:59.000Z"), ende = Math.min(now + 600000, dayEnd);
  A.ok(ende - now > 10000, "Frischer CI-Lifecycle muss noch innerhalb seines UTC-Budgettags enden koennen");
  const snapshot = { beobachtetAm: am, mandate_profiles: lese().mandate, profiles: lese().profiles };
  const f = fixture({ snapshot, day, operationId: "real500-startsql-isolierte-db-" + crypto.randomBytes(6).toString("hex") });
  const kosten = { ...f.manifest.kosten, beobachtetAm: am };
  f.manifest = V.vorbereiten({ paketBytes: bytes, snapshot, operationId: f.manifest.operationId, kosten,
    vorflugAm: am, startBis: new Date(Math.min(now + 180000, ende - 5000)).toISOString(), endeAm: new Date(ende).toISOString() });
  const full = belegFixture(f), { endwaechter, ...belege } = full;
  for (const key of ["production", "ruhe", "kosten", "landesversorgung"]) belege[key].beobachtetAm = am;
  belege.phaseA.entschiedenAm = am; belege.fach.entschiedenAm = am;
  psql(`update public.helmut_store set data=${json(belege.kosten.auth)} where id='main-auth';`);
  belege.ruhe.authHash = V.hash(belege.kosten.auth);
  belege.ruhe.mainHash = V.hash(lese().store.find(r => r.id === "main").data);
  const runtimeManifest = G.baueRuntimeManifest({ manifest: f.manifest, snapshot, belege }, bytes, now + 1000);
  full.endwaechter.beobachtetAm = am; full.endwaechter.manifestHash = V.hash(runtimeManifest);
  const aktivierungsGo = { version: "helmut-real500-aktivierungs-go/1", operationId: f.manifest.operationId,
    manifestHash: V.hash(runtimeManifest), productionCommit: COMMIT,
    aktion: "EXAKT_500_REALPROFILE_AKTIVIEREN_UND_TEST_STARTEN", freigegebenAm: am,
    aussteller: "Synthetischer isolierter CI-Lifecycle, keine Productionfreigabe",
    primaerbeleg: { referenz: "synthetische-offline-fixture:sql-ci-go", sha256: "a".repeat(64) } };
  return { f, runtimeManifest, slot: "realkohorte500-runtime-" + f.manifest.operationId, manifestHash: V.hash(runtimeManifest),
    prepare: { runtimeManifest, snapshot, belege, schritt: "vorbereiten", aktivierungsGo: null },
    activate: { runtimeManifest, snapshot, belege: full, schritt: "aktivieren", aktivierungsGo } };
}
function startAbweisen(input) {
  const sql = G.baueSql(input, bytes, Date.now()), before = lese();
  A.throws(() => psql("set role service_role;" + sql), /real500-startsql-/);
  A.deepEqual(lese(), before, "StartSQL-Abweisung muss alle Tables inklusive Slot/Jobs erhalten");
}

function main() {
  A.equal(process.env.HELMUT_REAL500_PG_ISOLIERT, "JA", "Explizite Isolationsbestaetigung erforderlich");
  A.ok(["127.0.0.1", "localhost"].includes(host), "Nur expliziter Loopback-PostgreSQL");
  A.ok(/^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535);
  A.match(user, /^[a-zA-Z0-9_]+$/);
  A.ok(Number(psql("show server_version_num", "postgres")) >= 170000, "PostgreSQL17 oder neuer ist Pflicht");
  psql(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`, "postgres");
  try {
    A.equal(psql("select current_database()"), db);
    psql(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      end $$;
      create table public.profiles(id text primary key,name text not null,inhalt jsonb not null);
      create table public.mandate_profiles(user_id text primary key references public.profiles(id),aktiv boolean not null,
        geloescht_at timestamptz,updated_at timestamptz not null,partei text,fraktion text,inhalt jsonb not null);
      create table public.helmut_store(id text primary key,data jsonb not null,updated_at timestamptz not null default now());
      create table public.graph_testdaten(id text primary key,user_id text not null references public.profiles(id),inhalt jsonb not null);
      create table public.pipeline_locks(id text primary key,expires_at timestamptz not null);
      create table public.helmut_jobs(id text primary key,status text not null check(status in ('wartend','laufend','erledigt','fehlgeschlagen')),lease_expires_at timestamptz);
      create table public.process_runs(id text primary key,status text not null,finished_at timestamptz);
      create function public.fixture_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create trigger fixture_mandate_updated_at before update on public.mandate_profiles for each row execute function public.fixture_updated_at();
      create trigger fixture_store_updated_at before update on public.helmut_store for each row execute function public.fixture_updated_at();
      grant usage on schema public to service_role;
      grant select,insert,update,delete on all tables in schema public to service_role;`);
    psql(fs.readFileSync(MIG, "utf8"));
    for (const blocker of [
      "insert into public.helmut_jobs values('queued','wartend',null);",
      "insert into public.helmut_jobs values('live-lease','erledigt',clock_timestamp()+interval '1 minute');",
      "insert into public.pipeline_locks values('live-lock',clock_timestamp()+interval '1 minute');",
      "insert into public.process_runs values('running','running',null);"
    ]) {
      const sx = frischeStartFixture(); psql(blocker); startAbweisen(sx.prepare);
      A.equal(lese().mandate.filter(r => r.aktiv).length, 0);
      A.equal(lese().store.some(r => r.id === sx.slot), false);
    }
    ok("Tatsaechlicher frischer StartSQL: queued/LiveLease/LiveLock/Running sperren prepared0 atomar vor jeder Slot-/Profilmutation");
    const sx = frischeStartFixture();
    psql("insert into public.helmut_jobs values('terminal-fehlgeschlagen','fehlgeschlagen',null);");
    const startBefore = lese();
    psql("set role service_role;" + G.baueSql(sx.prepare, bytes, Date.now()));
    const preparedActual = lese(), preparedStatus = ruf(readSql(sx));
    A.equal(preparedStatus.zustand, "vorbereitet"); A.equal(preparedStatus.aktiv, 0);
    A.deepEqual(preparedActual.mandate, startBefore.mandate); A.deepEqual(preparedActual.profiles, startBefore.profiles);
    A.deepEqual(preparedActual.graph, startBefore.graph); A.deepEqual(preparedActual.ruhe, startBefore.ruhe);
    A.deepEqual(preparedActual.store.filter(r => r.id !== sx.slot), startBefore.store);
    startAbweisen(sx.prepare);
    psql("set role service_role;" + G.baueSql(sx.activate, bytes, Date.now()));
    const activeActual = lese(); A.equal(ruf(readSql(sx)).aktiv, 500);
    A.deepEqual(V.fachzeilen(activeActual.mandate), V.fachzeilen(startBefore.mandate));
    A.deepEqual(activeActual.profiles, startBefore.profiles); A.deepEqual(activeActual.graph, startBefore.graph);
    A.deepEqual(activeActual.ruhe, startBefore.ruhe); A.deepEqual(activeActual.store.filter(r => r.id !== sx.slot), startBefore.store);
    startAbweisen(sx.activate);
    A.equal(ruf(endSql(sx)).aktiv, 0);
    invariant(startBefore, lese(), sx.slot);
    A.equal(lese().store.find(r => r.id === sx.slot).data.quittung.deaktiviert, 500);
    ok("Echter Startschutz->GeneratorSQL->prepared0->aktiv500->EndRPC0-Lifecycle; terminal Fehlgeschlagen ruhig, CAS-NoRepeat/Auth/Main/Fremd/Fach/Graph erhalten");
    // Reeller PostgreSQL-/JS-Abgleich: keine Stringliteral-Simulation des SQL-Serializers.
    for (const value of [0.1, 1e-7, 1e-6, 1e20, 1e21, 1.234e22, -0, -1e-7, null]) {
      const compact = psql(`select helmut_real500_internal.json_compact(${json(value)});`);
      A.equal(compact, JSON.stringify(value));
      A.equal(psql(`select encode(sha256(convert_to(helmut_real500_internal.json_compact(${json(value)}),'UTF8')),'hex');`), V.hash(value));
    }
    ok("PostgreSQL-json_compact und V.hash stimmen fuer Dezimal-,Exponenten-,Negativ-/Nullwerte tatsaechlich ueberein");
    let x = reset({ prepared: true }), before = lese();
    const prepared = ruf(readSql(x));
    A.equal(prepared.zustand, "vorbereitet"); A.equal(prepared.aktiv, 0);
    A.deepEqual(lese(), before); abweisen(endSql(x), /keine-aktivquittung/);
    ok("Prepared0: kompakte Lesung0 ohne Schreibwirkung, direkter Endaufruf gesperrt");
    x = reset({ prepared: true, preparedLong: true });
    abweisen(readSql(x), /vorbereitet/); abweisen(endSql(x), /vorbereitet/);
    ok("Prepared0 ueber4h bleibt gesperrt; historisch aktiver<=24h Lauf behaelt gebundenen Endweg");
    x = reset({ prepared: true });

    for (const role of ["anon", "authenticated"]) {
      A.equal(psql(`select has_schema_privilege(${literal(role)},'helmut_real500_internal','usage');`), "f");
      A.equal(psql(`select has_function_privilege(${literal(role)},'helmut_real500_internal.pruefe(text,text,text)','execute');`), "f");
      A.equal(psql(`select has_function_privilege(${literal(role)},'public.${R.READ_RPC_NAME}(text,text,text)','execute');`), "f");
      A.equal(psql(`select has_function_privilege(${literal(role)},'public.${R.RPC_NAME}(text,text,text,text,text)','execute');`), "f");
      A.throws(() => psql("set role " + role + ";" + readSql(x)));
      A.throws(() => psql("set role " + role + ";" + endSql(x)));
      A.throws(() => psql("set role " + role + ";select helmut_real500_internal.json_compact('{}'::jsonb);"));
    }
    A.equal(psql(`select has_function_privilege('service_role','public.${R.RPC_NAME}(text,text,text,text,text)','execute');`), "t");
    ok("Nur service_role; anon/authenticated koennen weder private Basis noch beide RPCs aufrufen");

    x = reset(); before = lese();
    const live = ruf(readSql(x));
    A.equal(live.aktiv, 500); A.equal(live.gesamt, 500); A.equal(live.identitaeten, 501);
    A.deepEqual(Object.keys(live).sort(), Object.keys(require("./realkohorte-500-runtime-test").statusFixture(x.f)).sort());
    A.equal(JSON.stringify(live).includes(paket.profile[0].vollname), false);
    A.equal(JSON.stringify(live).includes("snapshot"), false);
    const ended = ruf(endSql(x));
    R.pruefeLesung({ operationId: x.f.manifest.operationId, manifestHash: x.manifestHash, productionCommit: COMMIT }, ended);
    A.equal(ended.zustand, "beendet"); A.equal(ended.aktiv, 0);
    const after = lese(); invariant(before, after, x.slot);
    const receipt = after.store.find(r => r.id === x.slot).data.quittung;
    A.equal(receipt.deaktiviert, 500); A.deepEqual(receipt.manifest, x.f.manifest);
    ok("Echter Runtime-RPC500->0: Fachfelder,501 Identitaeten/Fremdprofil,Auth/Main und Graph/FKs unveraendert; redigierte Ausgabe");

    const repeated = ruf(endSql(x));
    A.equal(repeated.zustand, "beendet"); A.deepEqual(lese(), after);
    ok("Quittiertes Ende ist echter Noop: keine Quittungs-/Hash-/updated_at-Mutation");
    psql(`update public.mandate_profiles set aktiv=true where user_id=${literal(paket.ids[0])};`);
    abweisen(endSql(x), /endquittung-reaktivierung/);
    ok("Reaktivierung nach geschlossenem Lauf bleibt fail closed, kein stilles zweites Ende");

    x = reset({ active: 499 }); before = lese();
    const inactive = before.mandate.find(r => !r.aktiv);
    A.equal(ruf(readSql(x)).aktiv, 499);
    A.equal(ruf(endSql(x)).aktiv, 0);
    const partial = lese(); invariant(before, partial, x.slot);
    A.deepEqual(partial.mandate.find(r => r.user_id === inactive.user_id), inactive);
    A.equal(partial.store.find(r => r.id === x.slot).data.quittung.deaktiviert, 499);
    ok("SafeEnd499->0: nur499 aktive Zielzeilen geschrieben, bereits inaktive Zeile exakt erhalten");

    x = reset();
    for (const args of [{ operationId: "real500-fremde-epoche-12345678" }, { manifestHash: "0".repeat(64) },
      { productionCommit: "d".repeat(40) }, { bestaetigung: "false-GO" }, { grund: "aktivierung" }]) {
      abweisen(endSql(x, args));
      if (!args.bestaetigung && !args.grund) abweisen(readSql(x, args));
    }
    ok("Fremde Operation/Epoche,Manifest/Commit sowie falsche Bestaetigung/Endgrund:0 Writes");

    for (const [field, value] of [["manifestSqlHash", "0".repeat(64)], ["snapshotSqlHash", "0".repeat(64)], ["quittungSqlHash", "0".repeat(64)]]) {
      x = reset(); alterEnvelope(x, `jsonb_set(data,${literal("{" + field + "}")},${json(value)})`);
      abweisen(endSql(x), /hash-bindung|quittung/);
    }
    x = reset();
    alterEnvelope(x, `jsonb_set(data,'{manifest,profilvertrag,ids,0}',${json("fremde-id")})`, "manifest");
    abweisen(endSql(x), /hash-bindung/);
    ok("Private SQL-Hash-/Quittungs-/ID-Manipulation wird nicht durch passende private Neuhashes freigegeben");

    x = reset();
    const snapshotIndex = x.f.snapshot.mandate_profiles.findIndex(r => r.user_id === paket.ids[0]);
    const changedFach = { synthetischesTestabbild: true, fachfeld: "gemeinsame-Snapshot-und-DB-Drift" };
    alterEnvelope(x, `jsonb_set(data,${literal("{snapshot,mandate_profiles," + snapshotIndex + ",inhalt}")},${json(changedFach)})`, "snapshot");
    psql(`update public.mandate_profiles set inhalt=${json(changedFach)} where user_id=${literal(paket.ids[0])};`);
    A.equal(lese().store.find(r => r.id === x.slot).data.manifestHash, x.manifestHash);
    abweisen(endSql(x), /snapshot-manifestbindung/);
    ok("Passende Snapshot-/SQL-Selbsthash-/DB-Fachdrift ohne aeussere Manifestaenderung bleibt0 Endwrites");

    x = reset();
    alterEnvelope(x, `jsonb_set(data,'{startbelege,grundlinie,authHash}',${json("0".repeat(64))})`, "startbelege");
    alterEnvelope(x, `jsonb_set(data,'{manifest,startbelegeGrundlinie,authHash}',${json("0".repeat(64))})`, "manifest");
    abweisen(endSql(x), /hash-bindung/);
    ok("Gemeinsame Grundlinien-/Envelope-Selbsthashdrift aendert den gepinnten aeusseren RPC-Hash nicht:0 Writes");

    for (const field of ["qualifizierteRechtsfreigabe", "fachfreigabe", "aktivierungsGo", "endwaechterBereit"]) {
      x = reset(); alterEnvelope(x, `jsonb_set(data,${literal("{startbelege," + field + "}")},'true'::jsonb)`, "startbelege");
      abweisen(endSql(x), /startbelege|quittung/);
    }
    ok("Rechts/Fach/GO/Waechter als Boolean sind auch im serverinternen Vertrag gesperrt");

    for (const sql of [
      `update public.mandate_profiles set inhalt='{"drift":true}'::jsonb where user_id=${literal(paket.ids[0])};`,
      "update public.profiles set name='fremde Drift' where id='real500-runtime-offline-fremdprofil';",
      `update public.helmut_store set data=jsonb_set(data,'{quittung,bestaetigtAktiv}','499'::jsonb) where id=__SLOT__;`,
      `update public.mandate_profiles set geloescht_at=now() where user_id=${literal(paket.ids[0])};`
    ]) {
      x = reset(); psql(sql.replace("__SLOT__", literal(x.slot))); abweisen(endSql(x));
    }
    ok("Fach-/Fremdprofil-/Aktivquittungs-/Loeschdrift: unbekannten Bestand nie ueberschreiben");

    x = reset();
    psql(`create function public.fixture_abbruch() returns trigger language plpgsql as $$ begin
      if new.user_id=${literal(paket.ids[250])} then raise exception 'real500-runtime-fixture-abbruch'; end if; return new; end $$;
      create trigger fixture_abbruch before update on public.mandate_profiles for each row execute function public.fixture_abbruch();`);
    abweisen(endSql(x), /fixture-abbruch/);
    psql("drop trigger fixture_abbruch on public.mandate_profiles; drop function public.fixture_abbruch();");
    ok("Fehler mitten im500er Update rollt Profile,Quittung und alle Seitendaten atomar zurueck");

    for (const sideEffect of [
      "new.inhalt=new.inhalt||'{\"unerwartet\":true}'::jsonb;",
      "update public.profiles set name='unerwartete Triggerwirkung' where id='real500-runtime-offline-fremdprofil';",
      "update public.helmut_store set data=data||'{\"unerwartet\":true}'::jsonb where id='main-auth';",
      "update public.helmut_store set data=data||'{\"unerwartet\":true}'::jsonb where id='main';"
    ]) {
      x = reset();
      psql(`create function public.fixture_seiteneffekt() returns trigger language plpgsql as $$ begin
        ${sideEffect} return new; end $$;
        create trigger fixture_seiteneffekt before update on public.mandate_profiles for each row execute function public.fixture_seiteneffekt();`);
      abweisen(endSql(x), /fremd-fachbestand|endnachkontrolle|auth-main-veraendert/);
      psql("drop trigger fixture_seiteneffekt on public.mandate_profiles; drop function public.fixture_seiteneffekt();");
    }
    ok("Echte BEFORE-Trigger-Fach/Identitaets/Auth/Main-Drift wird nach UPDATE gesehen und vollstaendig zurueckgerollt");

    x = reset(); before = lese();
    A.throws(() => psql(fs.readFileSync(ROLLBACK, "utf8")), /rollback-aktiver-lauf/);
    A.deepEqual(lese(), before); A.equal(ruf(readSql(x)).aktiv, 500);
    ruf(endSql(x)); const closed = lese();
    psql(fs.readFileSync(ROLLBACK, "utf8"));
    A.deepEqual(lese(), closed);
    A.equal(psql(`select to_regprocedure('public.${R.RPC_NAME}(text,text,text,text,text)') is null;`), "t");
    A.equal(psql(`select to_regprocedure('public.${R.READ_RPC_NAME}(text,text,text)') is null;`), "t");
    ok("Migrationsrollback bei aktivem Lauf atomar gesperrt; nach Ende nur Funktionen entfernt, alle Daten erhalten");
    console.log(`${pass}/${pass} neue echte PostgreSQL-Runtime-Pruefungen gruen. Keine Production-/Live-Endwaechter-/Fachabnahme.`);
  } finally { psql(`drop database ${db};`, "postgres"); }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error("Isolierte Runtime-DB-Abnahme fehlgeschlagen: " + (String(error.message).startsWith("real500-")
      ? error.message : "Isolations-/Pruefbedingung nicht erfuellt"));
    process.exitCode = 1;
  }
}
module.exports = { main };
