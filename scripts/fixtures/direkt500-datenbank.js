"use strict";

// Nur im bereits isolierten PostgreSQL Pflichttest. Echte Tabellen aus dem
// vorhandenen Schema, echtes PostgREST, storage.js, accounts.js und Provisionierer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../../lib/helmut/testkohorte-direkt500");
const P = require("../../lib/helmut/provisioning");
const { welt, env } = require("./direkt500");

async function pruefeDirektausbau({ psql, base, token }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const root = path.join(__dirname, "../..");
  const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
  for (const table of ["profiles", "mandate_profiles"]) {
    const statement = schema.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`));
    assert(statement, `Vorhandene Tabellendefinition ${table} fehlt`);
    psql(statement[0]);
  }
  for (const datei of ["20260712_mandate_profile_fields.sql", "20260712_mandate_profile_completeness.sql"]) {
    psql(fs.readFileSync(path.join(root, "supabase/migrations", datei), "utf8"));
  }
  psql("grant select, insert, update on public.profiles, public.mandate_profiles to service_role; notify pgrst, 'reload schema';");
  const headers = { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  async function request(tail, options = {}) {
    const r = await fetch(base + "/rest/v1/" + tail, { ...options, headers, redirect: "error",
      signal: AbortSignal.timeout(20000) });
    assert.equal(r.status, 200, "Lokales PostgREST muss einen echten Bestand liefern");
    return r.json();
  }
  // Nur der Schema Cache des kurzlebigen Testdienstes darf hier nachladen.
  const until = Date.now() + 5000;
  for (;;) {
    try { await request("mandate_profiles?select=profil_extras&limit=1"); break; }
    catch (e) { if (Date.now() >= until) throw e; await new Promise((r) => setTimeout(r, 100)); }
  }
  Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: token, HELMUT_V3_STORE: "1", HELMUT_PROFILE_DB_MODE: "1",
    HELMUT_PROFILE_DB_EXCLUSIVE: "1", HELMUT_CRAWL_RUN_RETENTION: "36" });
  const storage = require("../../lib/helmut/storage");
  const accounts = require("../../lib/helmut/accounts");
  const start = welt();
  // Die alte Registrierungspruefung ist abgeschlossen. Ihre Testkonten werden
  // nur in DIESER zufaelligen lokalen Testdatenbank durch die neue Grundlinie ersetzt.
  const quote = (x) => "'" + JSON.stringify(x).replace(/'/g, "''") + "'::jsonb";
  psql(`update public.helmut_store set data=${quote(start.snapshot().auth)} where id='main-auth';`);
  psql(`update public.helmut_store set data=${quote(start.main)} where id='main';`);
  for (const p of start.profile.values()) await storage.saveProfile(p);
  psql("insert into public.profiles(id,name) values ('admin-fixture','Offline Admin');");
  async function snapshot() {
    const [mandate, identitaeten, stores] = await Promise.all([
      request("mandate_profiles?select=*&order=user_id"), request("profiles?select=*&order=id"),
      request("helmut_store?select=id,data&id=in.(main,main-auth)")
    ]);
    return { mandate, identitaeten, auth: stores.find((s) => s.id === "main-auth").data,
      main: stores.find((s) => s.id === "main").data };
  }
  const vorher = await snapshot();
  for (const vorgang of ["provisionierung", "aktivierung"]) {
    const r = await D.fuehreAus({ vorgang, env: env(vorgang), deps: {
      jetzt: () => new Date("2026-09-10T08:30:00.000Z"), leseSnapshot: snapshot, pruefeBetrieb: async () => {},
      schreibe: ({ id, spec }) => vorgang === "provisionierung"
        ? P.provisionTenant(spec, { storage, accounts }, { neuAktiv: false, kontoBeiFehlerBehalten: true })
        : P.activateTenant(id, { storage, accounts }),
      leseZiel: async (id) => (await request("mandate_profiles?select=*&user_id=eq." + id))[0]
    } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.bestaetigt, 475);
    assert.equal(r.gesamt, 504);
    assert.equal(r.aktiv, vorgang === "aktivierung" ? 500 : 25);
    console.log(`PASS  ${vorgang}: 475 echte Speicheroperationen, Bestand ${r.gesamt}/${r.aktiv}`);
  }
  const nach = await snapshot();
  assert.equal(nach.auth.users.length, 500);
  assert.equal(nach.auth.users.filter((u) => u.active).length, 3);
  assert.equal(D.pruefeSnapshot(nach, "aktivierung").geschuetzterBestandHash, a.geschuetzterBestandHash);
  assert.equal(D.hash(nach.main), D.hash(vorher.main));
  console.log("PASS  Echte SQL Kontrolle: 500 aktiv, vier inaktiv, alle Bestandszeilen und main unveraendert, keine neuen aktiven Konten");
  const T = require("../../lib/helmut/testkohorte-testende");
  const ende = await T.ausfuehren({ scharf: true,
    env: { ...env("aktivierung"), HELMUT_TESTKOHORTE_CONFIRM: T.CONFIRM }, deps: {
      snapshot, deaktiviere: id => P.deactivateTenant(id, { storage, accounts }),
      leseZiel: async id => (await request("mandate_profiles?select=*&user_id=eq." + id))[0]
    } });
  assert.equal(ende.ok, true, JSON.stringify(ende));
  assert.equal(ende.bestaetigtInaktiv, 495);
  assert.equal(ende.gesamt, 504); assert.equal(ende.aktiv, 5);
  assert.equal(D.hash((await snapshot()).main), D.hash(vorher.main));
  console.log("PASS  Testende: 495 echte Deaktivierungen, 504 erhalten, fuenf aktiv, geschuetzte Daten und main unveraendert");
}
module.exports = { pruefeDirektausbau };
