"use strict";

// Echte, isolierte PostgreSQL-Abnahme des NEUEN Offline-Endgenerators. Keine
// Production, keine Migration, kein null500-Altlauf. Kanonische oeffentliche
// IDs dienen ausschliesslich als Testabbilder in einer zufaelligen eigenen DB.
const A = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const E = require("./realkohorte-500-endweg");
const bytes = fs.readFileSync(path.join(__dirname, "../daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"));
const paket = V.pruefePaket(bytes);
const host = process.env.HELMUT_TEST_PG_HOST;
const port = process.env.HELMUT_TEST_PG_PORT || "5433";
const user = process.env.HELMUT_TEST_PG_USER || "helmut";
const db = "helmut_real500_end_test_" + crypto.randomBytes(8).toString("hex");
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = value => literal(JSON.stringify(value)) + "::jsonb";
const kopie = value => structuredClone(value);
let pass = 0;
const ok = name => { pass++; console.log("PASS " + name); };

function psql(sql, database = db) {
  A.ok(database === db || database === "postgres", "Nur eigene Testdatenbank oder explizite lokale Admin-DB");
  try {
    return execFileSync("psql", ["-X", "-w", "-h", host, "-p", port, "-U", user,
      "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: sql, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      // libpq-Routing darf weder PGHOSTADDR noch Services/TLS-Konfiguration
      // erben: PGHOSTADDR wuerde sogar das explizite -h uebersteuern.
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
        PGPASSWORD: process.env.PGPASSWORD || "helmut", PGHOSTADDR: "127.0.0.1",
        PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=3000" }
    }).trim();
  } catch (error) {
    // Fehlertexte koennen SQL/Profilabbilder enthalten. Nur feste Riegelcodes
    // bzw. Prozessfehler ausgeben; keine SQL-/Snapshotdaten in CI-Logs.
    const code = String(error.stderr || "").match(/real500-[a-z0-9-]+/)?.[0];
    throw new Error(code || "real500-psql-" + (error.code || "fehler"));
  }
}

function lese() {
  return JSON.parse(psql(`select jsonb_build_object(
    'mandate',(select coalesce(jsonb_agg(to_jsonb(p) order by user_id collate "C"),'[]'::jsonb) from public.mandate_profiles p),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.profiles p),
    'store',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.helmut_store p),
    'graph',(select coalesce(jsonb_agg(to_jsonb(p) order by id collate "C"),'[]'::jsonb) from public.graph_testdaten p));`));
}

function reset(fremdText = "Unveraendertes synthetisches Fremdprofil") {
  psql("truncate public.graph_testdaten, public.mandate_profiles, public.profiles, public.helmut_store;");
  const identities = [...paket.profile.map(p => ({ id: p.mandatsId, name: p.vollname,
    inhalt: { synthetischesTestabbild: true } })),
  { id: "real500-offline-fremdprofil", name: fremdText, inhalt: { bewahren: "exakt" } }];
  const mandates = paket.profile.map(p => ({ user_id: p.mandatsId, partei: p.partei || null,
    fraktion: p.fraktion || (p.fraktionslos ? "Fraktionslos" : p.partei || null),
    inhalt: { synthetischesTestabbild: true, fachfeld: "unveraendert" } }));
  psql(`insert into public.profiles select r.id,r.name,r.inhalt
    from jsonb_to_recordset(${json(identities)}) as r(id text,name text,inhalt jsonb);
    insert into public.mandate_profiles(user_id,aktiv,geloescht_at,updated_at,partei,fraktion,inhalt)
      select r.user_id,false,null,now(),r.partei,r.fraktion,r.inhalt
      from jsonb_to_recordset(${json(mandates)}) as r(user_id text,partei text,fraktion text,inhalt jsonb);
    insert into public.graph_testdaten(id,user_id,inhalt)
      select 'graph-'||id,id,jsonb_build_object('synthetisch',true,'fachfeld','beibehalten') from public.profiles;
    insert into public.helmut_store(id,data) values
      ('main','{"synthetischerStore":true,"bewahren":"main"}'::jsonb),
      ('main-auth','{"synthetischeAuth":true,"bewahren":"auth"}'::jsonb),
      ('ungebundener-slot','{"bewahren":"fremd"}'::jsonb);`);
  const bestand = lese();
  // Vorheriger UTC-Tag verhindert Wartezeiten an Tagesgrenzen. Diese isolierte
  // Fixture simuliert einen beendbaren Lauf, niemals einen aktuellen Live-Beleg.
  const tag = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const snapshot = { beobachtetAm: tag + "T10:00:00.000Z", mandate_profiles: bestand.mandate, profiles: bestand.profiles };
  const manifest = V.vorbereiten({ paketBytes: bytes, snapshot, operationId: "real500-isolierte-db-" + crypto.randomBytes(6).toString("hex"),
    vorflugAm: tag + "T10:00:30.000Z", startBis: tag + "T10:05:30.000Z", endeAm: tag + "T22:00:00.000Z",
    kosten: { tag, beobachtetAm: tag + "T10:00:00.000Z", tageslimitMikroUsd: 6000000, auftragslimitMikroUsd: 7000000,
      tagVerbrauchtMikroUsd: 1000000, tagReserviertMikroUsd: 500000,
      auftragVerbrauchtMikroUsd: 4000000, auftragReserviertMikroUsd: 500000,
      restreserveMikroUsd: 2500000, laufreserveMikroUsd: 2000000 } });
  const quittung = { version: V.VERSION, operationId: manifest.operationId, manifest: kopie(manifest),
    zustand: "aktiv", aktiviertAm: tag + "T10:01:00.000Z", bestaetigtAktiv: 500 };
  const slot = "testfenster-realkohorte500-" + manifest.operationId;
  // Ausschliesslich lokale Fixture; kein Produkt-Aktivierungsweg und kein GO.
  psql(`update public.mandate_profiles set aktiv=true;
    insert into public.helmut_store(id,data) values(${literal(slot)},${json(quittung)});`);
  const f = { manifest, snapshot, quittung, grund: "frist" };
  A.equal(lese().mandate.filter(p => p.aktiv).length, 500);
  return { f, slot, sql: E.baueSql(f, bytes) };
}

function abweisen(sql, errorCode) {
  const vorher = lese();
  A.throws(() => psql(sql), errorCode);
  A.deepEqual(lese(), vorher, "Abweisung muss alle Tabellen einschliesslich Graph und Quittung unveraendert lassen");
}

function main() {
  A.equal(process.env.HELMUT_REAL500_PG_ISOLIERT, "JA", "Explizite Isolationsbestaetigung HELMUT_REAL500_PG_ISOLIERT=JA erforderlich");
  A.ok(["127.0.0.1", "localhost"].includes(host), "Nur expliziter lokaler PostgreSQL");
  A.ok(/^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535, "Gueltiger lokaler Port erforderlich");
  A.match(user, /^[a-zA-Z0-9_]+$/);
  A.ok(Number(psql("show server_version_num", "postgres")) >= 170000, "PostgreSQL17 oder neuer erforderlich");
  psql(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`, "postgres");
  try {
    A.equal(psql("select current_database()"), db);
    psql(`create table public.profiles(id text primary key,name text not null,inhalt jsonb not null);
      create table public.mandate_profiles(user_id text primary key references public.profiles(id),aktiv boolean not null,
        geloescht_at timestamptz,updated_at timestamptz not null,partei text,fraktion text,inhalt jsonb not null);
      create table public.helmut_store(id text primary key,data jsonb not null,updated_at timestamptz not null default now());
      create table public.graph_testdaten(id text primary key,user_id text not null references public.profiles(id),inhalt jsonb not null);
      create function public.fixture_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create trigger fixture_mandate_updated_at before update on public.mandate_profiles for each row execute function public.fixture_updated_at();
      create trigger fixture_store_updated_at before update on public.helmut_store for each row execute function public.fixture_updated_at();`);
    let x = reset(), vor = lese();
    psql(x.sql);
    const nach = lese();
    A.equal(nach.mandate.length, 500); A.ok(nach.mandate.every(p => p.aktiv === false));
    A.deepEqual(V.fachzeilen(nach.mandate), V.fachzeilen(vor.mandate));
    A.equal(nach.profiles.length, 501); A.deepEqual(nach.profiles, vor.profiles); A.deepEqual(nach.graph, vor.graph);
    A.deepEqual(nach.store.filter(p => p.id !== x.slot), vor.store.filter(p => p.id !== x.slot));
    const receipt = nach.store.find(p => p.id === x.slot).data;
    A.equal(receipt.zustand, "beendet"); A.equal(receipt.deaktiviert, 500); A.deepEqual(receipt.manifest, x.f.manifest);
    ok("Echter Endgenerator: 500 aktiv -> 0; 501 Identitaeten/Fremdprofil, Fachfelder, Auth/Main und Graph erhalten");
    abweisen(x.sql, /real500-endquittung-cas/);
    ok("Wiederholtes Ende verweigert, keine erneute Schreibwirkung");

    x = reset("normaler Text $real500_end$ $real500_end_1$ $real500_end_2$ ' normaler Text"); vor = lese();
    psql(x.sql); A.deepEqual(lese().profiles, vor.profiles); A.equal(lese().mandate.filter(p => p.aktiv).length, 0);
    ok("Echte SQL-Ausfuehrung mit Dollarquote-Kollision und Apostroph im gebundenen Fremdprofil");

    x = reset(); psql(`update public.helmut_store set data=data||'{"unerwartet":true}'::jsonb where id=${literal(x.slot)};`);
    abweisen(x.sql, /real500-endquittung-cas/); ok("Falsche CAS-Quittung: keine Schreibwirkung");
    x = reset(); psql(`update public.mandate_profiles set inhalt='{"drift":true}'::jsonb where user_id=${literal(paket.ids[0])};`);
    abweisen(x.sql, /real500-endbestand-unbekannt-fremd-partiell/); ok("Fachfeld-Drift: keine Schreibwirkung");
    x = reset(); psql("update public.profiles set name='unerwartete Aenderung' where id='real500-offline-fremdprofil';");
    abweisen(x.sql, /real500-endbestand-unbekannt-fremd-partiell/); ok("Fremdprofil-Drift: keine Schreibwirkung");
    x = reset(); psql(`update public.mandate_profiles set aktiv=false where user_id=${literal(paket.ids[0])};`);
    abweisen(x.sql, /real500-endbestand-unbekannt-fremd-partiell/); ok("Teilaktivierung499: keine Schreibwirkung");
    x = reset(); psql(`delete from public.mandate_profiles where user_id=${literal(paket.ids[0])};`);
    abweisen(x.sql, /real500-endbestand-unbekannt-fremd-partiell/); ok("Fehlendes Mandat499: keine Schreibwirkung");
    x = reset(); psql("insert into public.profiles values('unerwartete-identitaet','nur lokale Negativfixture','{}'::jsonb);");
    abweisen(x.sql, /real500-endbestand-unbekannt-fremd-partiell/); ok("Fremder Identitaetenbestand502: keine Schreibwirkung");
    x = reset();
    psql(`create function public.fixture_abbruch() returns trigger language plpgsql as $$ begin
      if new.user_id=${literal(paket.ids[250])} then raise exception 'real500-fixture-abbruch'; end if; return new; end $$;
      create trigger fixture_abbruch before update on public.mandate_profiles for each row execute function public.fixture_abbruch();`);
    abweisen(x.sql, /real500-fixture-abbruch/); ok("Fehler innerhalb des Updates: gesamte Transaktion einschliesslich Quittung rollt zurueck");
    console.log(`${pass}/${pass} echte isolierte PostgreSQL-Pruefungen gruen. Keine Production-/Live-Endwaechter-Abnahme.`);
  } finally {
    psql(`drop database ${db};`, "postgres");
  }
}

try { main(); }
catch (error) {
  console.error("Isolierte Realkohorten-DB-Abnahme fehlgeschlagen: " +
    (String(error.message).startsWith("real500-") ? error.message : "Isolations-/Pruefbedingung nicht erfuellt"));
  process.exitCode = 1;
}
