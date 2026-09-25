"use strict";
// Ausschliesslich vom isolierten PostgreSQL CI Nachweis aufgerufen.
const A = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const N = require("../lib/helmut/testfenster-null500");
const { CONFIRM } = require("./github-null500-ende");
const MIG = "supabase/migrations/20260919170000_testfenster_null500_ende.sql";
const lit = s => "'" + s.replace(/'/g, "''") + "'";
async function pruefe({ psql, reset, grundlinie, state, lese, parallel, host, port, user, db, ok }) {
  psql(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    grant usage on schema public to service_role;
    grant select,insert,update,delete on all tables in schema public to service_role;`);
  psql(fs.readFileSync(MIG, "utf8"));
  psql(fs.readFileSync("supabase/migrations/20260925100000_testfenster_null500_bereinigt.sql", "utf8"));
  const sql = (m, grund = "notstopp", confirm = CONFIRM) => `select public.helmut_testfenster_null500_ende(
    ${lit(m.laufId)},${lit(JSON.stringify(m))}::jsonb,${lit(grund)},${lit(confirm)});`;
  const ruf = (m, grund) => JSON.parse(psql(sql(m, grund)));
  let m = await reset();
  A.throws(() => ruf(m)); A.equal(state(m), "nicht-aktiviert");
  psql(N.baueSql(m, "aktivierung"));
  const vorher = grundlinie();
  A.throws(() => psql(sql(m, "frist"))); A.equal(state(m), "500-bestaetigt");
  A.throws(() => psql(sql(m, "notstopp", "falsch")));
  A.throws(() => psql(sql({ ...m, productionCommit: "b".repeat(40) })));
  A.deepEqual(grundlinie(), vorher);
  ok("RPC verweigert fehlende Quittung, verfruehte Frist, falsche Bestaetigung und anderes Manifest ohne Write");
  A.equal(psql("select has_function_privilege('anon','public.helmut_testfenster_null500_ende(text,jsonb,text,text)','execute')"), "f");
  A.equal(psql("select has_function_privilege('authenticated','public.helmut_testfenster_null500_ende(text,jsonb,text,text)','execute')"), "f");
  A.throws(() => psql("set role anon;" + sql(m)));
  const ret = JSON.parse(psql("set role service_role;" + sql(m)));
  A.equal(ret.deaktiviert, 500); A.equal(state(m), "0-bestaetigt");
  for (const k of ["auth", "main", "identitaeten"]) A.equal(grundlinie()[k], vorher[k]);
  const q = psql("select jsonb_agg(to_jsonb(h) order by id) from helmut_store h");
  A.equal(ruf(m).deaktiviert, 0);
  A.equal(psql("select jsonb_agg(to_jsonb(h) order by id) from helmut_store h"), q);
  ok("Nur service_role darf ausfuehren; atomarer Rueckweg500 und wiederholtes Ende ohne neue Quittung");
  psql("update mandate_profiles set aktiv=true where user_id='bestand-0'");
  A.throws(() => ruf(m)); A.equal(lese(m).zielaktiv, 1);
  ok("Reaktivierung nach quittiertem Ende wird nicht still erneut deaktiviert");
  m = await reset(); psql(N.baueSql(m, "aktivierung"));
  psql(`create function test_endfehler() returns trigger language plpgsql as $$ begin
    if new.user_id='test-kohorte-c-200' then raise exception 'fixture-endfehler'; end if; return new; end $$;
    create trigger test_endfehler before update on mandate_profiles for each row execute function test_endfehler();`);
  const vorFehler = grundlinie(); A.throws(() => ruf(m)); A.equal(state(m), "500-bestaetigt");
  A.deepEqual(grundlinie(), vorFehler);
  psql("drop trigger test_endfehler on mandate_profiles; drop function test_endfehler();");
  ok("RPC Fehler mitten in500 Updates rollt alle Profile und Abschlussquittung zurueck");
  psql(`create function test_endseiteneffekt() returns trigger language plpgsql as $$ begin
    update profiles set inhalt=inhalt||'{"fremd":true}'::jsonb where id='bestand-8'; return new; end $$;
    create trigger test_endseiteneffekt before update on mandate_profiles for each row execute function test_endseiteneffekt();`);
  A.throws(() => ruf(m)); A.deepEqual(grundlinie(), vorFehler); A.equal(state(m), "500-bestaetigt");
  psql("drop trigger test_endseiteneffekt on mandate_profiles; drop function test_endseiteneffekt();");
  ok("Unerwartete Triggerwirkung auf Identitaeten rollt auch das gesamte Ende zurueck");
  const codes = await Promise.all([parallel(sql(m)), parallel(sql(m))]);
  A.deepEqual(codes, [0, 0]); A.equal(state(m), "0-bestaetigt"); A.equal(lese(m).quittung.deaktiviert, 500);
  ok("Zwei echte konkurrierende Endaufrufe schreiben den Abschluss genau einmal");
  m = await reset(); psql(N.baueSql(m, "aktivierung"));
  psql("delete from helmut_store where id='main-auth'; insert into pipeline_locks values(now()+interval '1 hour'); update mandate_profiles set aktiv=false where user_id='bestand-0'; update mandate_profiles set aktiv=true where user_id='bestand-8';");
  const other = psql("select to_jsonb(p) from mandate_profiles p where user_id='bestand-8'");
  const partial = ruf(m); A.equal(partial.deaktiviert, 499); A.equal(partial.ausserhalbAktiv, 1);
  A.equal(other, psql("select to_jsonb(p) from mandate_profiles p where user_id='bestand-8'"));
  A.equal(state(m), "unklar"); A.equal(lese(m).zielaktiv, 0);
  ok("Ende trotz fehlendem Budget, lebender Sperre und Teildeaktivierung; fremdes Profil unveraendert");
  m = await reset(); psql(N.baueSql(m, "aktivierung"));
  const falsch = { ...m, zielHash: "0".repeat(64) };
  psql(`update helmut_store set data=jsonb_set(data,'{manifest}',${lit(JSON.stringify(falsch))}::jsonb) where id=${lit(N.PREFIX + m.laufId)};`);
  const vorHash = grundlinie(); A.throws(() => ruf(falsch)); A.deepEqual(grundlinie(), vorHash);
  ok("Selbst uebereinstimmender manipulierter Quittungsinhalt braucht den korrekten500er Zielhash");

  m = await reset(2); psql(N.baueSql(m, "aktivierung"));
  const vorV2 = grundlinie();
  A.throws(() => psql(fs.readFileSync("supabase/migrations/rollback_20260925100000_testfenster_null500_bereinigt.sql", "utf8")),
    /null500-rollback-aktiver-bereinigter-lauf/);
  A.deepEqual(grundlinie(), vorV2); A.equal(state(m), "500-bestaetigt");
  const v2 = JSON.parse(psql("set role service_role;" + sql(m)));
  A.equal(v2.deaktiviert, 500); A.equal(v2.gesamt, 500); A.equal(state(m), "0-bestaetigt");
  for (const k of ["auth", "main", "identitaeten"]) A.equal(grundlinie()[k], vorV2[k]);
  A.equal(ruf(m).deaktiviert, 0);
  ok("Version2 Endfunktion stoppt exakt500; Rollback waehrend aktivem Version2 Lauf gesperrt");

  let api;
  try {
    m = await reset(2); psql(N.baueSql(m, "aktivierung"));
    const listener = net.createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
    const apiPort = listener.address().port; await new Promise(r => listener.close(r));
    api = spawn(process.env.HELMUT_TEST_POSTGREST_BIN || "/tmp/postgrest", [], { env: { ...process.env,
      PGRST_DB_URI: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(process.env.PGPASSWORD || "helmut")}@${host}:${port}/${db}`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "service_role", PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(apiPort), PGRST_LOG_LEVEL: "crit" }, stdio: ["ignore", "ignore", "ignore"] });
    let startfehler = false; api.on("error", () => { startfehler = true; });
    const base = `http://127.0.0.1:${apiPort}`;
    let ready = false;
    for (let i = 0; i < 100 && !startfehler && api.exitCode === null; i++) {
      try { const r = await fetch(base + "/helmut_store?select=id", { signal: AbortSignal.timeout(1000) });
        await r.text(); if (r.status === 200) { ready = true; break; } } catch { /* nur lokaler Dienststart */ }
      await new Promise(r => setTimeout(r, 100));
    }
    A.ok(ready, "Echtes PostgREST ist Pflicht, kein Skip");
    const response = await fetch(base + "/rpc/helmut_testfenster_null500_ende", { method: "POST",
      headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ p_lauf_id: m.laufId, p_manifest: m, p_grund: "notstopp", p_bestaetigung: CONFIRM }) });
    A.equal(response.status, 200); A.equal((await response.json()).deaktiviert, 500);
    A.equal(state(m), "0-bestaetigt");
    ok("Echter PostgREST Aufruf bindet Version2 Manifest und beendet alle500 atomar");
  } finally { if (api && api.exitCode === null) { api.kill("SIGTERM"); await once(api, "exit"); } }
  psql(fs.readFileSync("supabase/migrations/rollback_20260925100000_testfenster_null500_bereinigt.sql", "utf8"));
  A.throws(() => ruf(m), /null500-ende-quittung-nicht-gebunden/);
  psql(N.baueSql(m, "ende")); A.equal(state(m), "0-bestaetigt");
  m = await reset(); psql(N.baueSql(m, "aktivierung"));
  A.equal(ruf(m).deaktiviert, 500); A.equal(state(m), "0-bestaetigt");
  ok("Neuer Rollback stellt Version1 wieder her; gebundener manueller Version2 Rueckweg bleibt erhalten");
  psql(fs.readFileSync("supabase/migrations/rollback_20260919170000_testfenster_null500_ende.sql", "utf8"));
  A.equal(psql("select to_regprocedure('public.helmut_testfenster_null500_ende(text,jsonb,text,text)') is null"), "t");
  A.equal(state(m), "0-bestaetigt"); psql(N.baueSql(m, "ende"));
  ok("Rollback entfernt nur RPC; Quittung und unabhaengiger manueller SQL Rueckweg bleiben erhalten");
}
module.exports = { pruefe };
