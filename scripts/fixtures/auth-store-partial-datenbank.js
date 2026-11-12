"use strict";

// Kleiner neuer Fall im vorhandenen PG17-/PostgREST-Pflichtnachweis. Keine neue
// Testserie/Produktionsverbindung: ausschliesslich dessen lokale synthetische DB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const DIR = path.join(__dirname, "../../supabase/migrations");
const migration = fs.readFileSync(path.join(DIR, "20261112130226_auth_store_cas_patch_v1.sql"), "utf8");
const rollback = fs.readFileSync(path.join(DIR, "rollback_20261112130226_auth_store_cas_patch_v1.sql"), "utf8");
const RPC = "/rest/v1/rpc/helmut_auth_cas_patch_v1";
const SIGNATURE = "public.helmut_auth_cas_patch_v1(text,text,uuid,jsonb,text[])";
function bereiteVor({ psql }) {
  psql(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;`);
  psql(migration);
}
async function pruefe({ psql, base, token, secret }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.ok(typeof secret === "string" && secret.length >= 32);
  const storage = require("../../lib/helmut/storage");
  const oldFlag = process.env.HELMUT_AUTH_PATCH_V1, transport = globalThis.fetch;
  const before = psql("select md5(data::text) from public.helmut_store where id='main-auth'");
  psql("insert into public.helmut_store(id,data) select 'auth-patch-fixture-backup',data from public.helmut_store where id='main-auth'");
  let count = 0, requests = [], dropReply = false;
  const pass = name => { count++; console.log("PASS  auth-feldpatch: " + name); };
  const digest = () => psql("select md5(data::text) from public.helmut_store where id='main-auth'");
  const history = () => psql("select md5((data->'llmUsage')::text)||'|'||md5((data->'betriebskostenBudget')::text)||'|'||md5((data->'futureField')::text) from public.helmut_store where id='main-auth'");
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input); assert.equal(url.hostname, "127.0.0.1");
    requests.push({ path: url.pathname, method: options.method || "GET", bytes: Buffer.byteLength(options.body || "") });
    const response = await transport(input, options);
    if (dropReply && url.pathname === RPC) {
      assert.equal(response.status, 200); await response.text(); dropReply = false;
      throw new Error("simulierter Antwortverlust nach echtem RPC");
    }
    return response;
  };
  const request = async (body, roleToken = token) => {
    const response = await fetch(base + RPC, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${roleToken}`, apikey: roleToken, "Content-Type": "application/json" },
      body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    process.env.HELMUT_AUTH_PATCH_V1 = "on";
    psql(`update public.helmut_store set data=jsonb_build_object(
      '_authStoreRevision','00000000-0000-0000-0000-000000000001',
      'users','[]'::jsonb,'sessions','[]'::jsonb,
      'llmUsage',jsonb_build_array(jsonb_build_object('id','retained','history',repeat('x',3000000))),
      'betriebskostenBudget','{"calls":{"held":{"status":"ungeklaert","reserved":212000}}}'::jsonb,
      'futureField','{"nested":{"keep":true}}'::jsonb) where id='main-auth'`);
    const retained = history(), fullBytes = Number(psql("select octet_length(data::text) from public.helmut_store where id='main-auth'"));
    const state = await storage.readAuthStore(); state.sessions.push({ id: "synthetische-sitzung" });
    requests = []; await storage.writeAuthStore(state);
    const writes = requests.filter(r => r.method !== "GET");
    assert.equal(writes.length, 1); assert.equal(writes[0].path, RPC); assert.ok(writes[0].bytes < fullBytes / 100);
    assert.equal(history(), retained);
    assert.equal(psql("select data->'sessions'->0->>'id' from public.helmut_store where id='main-auth'"), "synthetische-sitzung");
    pass("echter Storage/REST/SQL Pfad: Feld geschrieben, drei unveraenderte Historien hashgleich, Request unter1Prozent");

    const a = await storage.readAuthStore(), b = await storage.readAuthStore();
    a.concurrentA = true; b.concurrentB = true;
    const results = await Promise.allSettled([storage.writeAuthStore(a), storage.writeAuthStore(b)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "AUTH_STORE_CONFLICT");
    const actual = await storage.readAuthStore(); assert.notEqual(Boolean(actual.concurrentA), Boolean(actual.concurrentB));
    actual.concurrentA = true; actual.concurrentB = true; await storage.writeAuthStore(actual);
    const merged = await storage.readAuthStore(); assert.ok(merged.concurrentA && merged.concurrentB); assert.equal(history(), retained);
    pass("zwei parallele verschiedene Feldpatches: genau einer gewinnt; alter Stand verworfen, frischer Stand bewahrt beide");

    const edit = await storage.readAuthStore(); delete edit.concurrentA; edit.explicitNull = null;
    edit.newArray = [1, 2]; edit.disappears = undefined; await storage.writeAuthStore(edit);
    const edited = await storage.readAuthStore(); assert.equal(Object.hasOwn(edited, "concurrentA"), false);
    assert.equal(edited.explicitNull, null); assert.deepEqual(edited.newArray, [1, 2]);
    assert.equal(Object.hasOwn(edited, "disappears"), false); assert.equal(history(), retained);
    pass("Entfernen, JSON-null und neues Array entsprechen dem gesamten JSON; unberuehrte Felder erhalten");

    const current = (await storage.readAuthStore())._authStoreRevision;
    const valid = { p_id: "main-auth", p_expected_revision: current, p_new_revision: crypto.randomUUID(), p_set: {}, p_remove: [] };
    const unchanged = digest();
    for (const invalid of [{ ...valid, p_id: "main" }, { ...valid, p_set: [] }, { ...valid, p_set: { _authStoreRevision: "bypass" } },
      { ...valid, p_remove: ["_authStoreRevision"] }, { ...valid, p_remove: [null] }, { ...valid, p_remove: null },
      { ...valid, p_set: { same: true }, p_remove: ["same"] }, { ...valid, p_new_revision: current }]) {
      assert.equal((await request(invalid)).status, 400); assert.equal(digest(), unchanged);
    }
    pass("fremde Zeile, Revisionsbypass, ungueltige/ueberlappende Felder und wiederverwendete Revision gesperrt");

    const jwt = role => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
      const unsigned = header + "." + payload;
      return unsigned + "." + crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
    };
    for (const role of ["anon", "authenticated"]) {
      const denied = await request(valid, jwt(role));
      assert.ok([401, 403].includes(denied.status));
      assert.equal(denied.data.code, "42501"); assert.equal(digest(), unchanged);
    }
    assert.equal(psql(`select prosecdef::text||'|'||has_function_privilege('anon',p.oid,'execute')::text||'|'||has_function_privilege('authenticated',p.oid,'execute')::text||'|'||has_function_privilege('service_role',p.oid,'execute')::text from pg_proc p where p.oid='${SIGNATURE}'::regprocedure`), "false|false|false|true");
    assert.equal(psql(`select array_to_string(proconfig, '|') from pg_proc where oid='${SIGNATURE}'::regprocedure`), "search_path=pg_catalog, public");
    pass("echte anonyme/authenticated JWTs verweigert; service_role-only und SECURITY INVOKER");

    requests = []; dropReply = true; let callbacks = 0;
    await assert.rejects(storage.mutateAuthStore(s => { callbacks++; s.lostResponse = true; }), /Antwortverlust/);
    assert.equal(callbacks, 1); assert.equal(requests.filter(r => r.method !== "GET").length, 1);
    assert.equal((await storage.readAuthStore()).lostResponse, true); assert.equal(history(), retained);
    pass("echter RPC gespeichert und Antwort verloren: kein Retry/anderer Schreibweg, persistierter Ausgang lesbar");

    psql("update public.helmut_store set data=data-'_authStoreRevision' where id='main-auth'");
    const legacy = await storage.readAuthStore(); legacy.legacyMarker = true; await storage.writeAuthStore(legacy);
    assert.equal((await storage.readAuthStore()).legacyMarker, true); assert.equal(history(), retained);
    pass("revisionsloser Altbestand bedingt uebernommen, Historien hashgleich");

    const beforeRollback = digest(); psql(rollback); assert.equal(digest(), beforeRollback);
    assert.equal(psql(`select to_regprocedure('${SIGNATURE}') is null`), "t");
    requests = [];
    await assert.rejects(storage.mutateAuthStore(s => { s.mustNotAppear = true; }));
    assert.equal(requests.filter(r => r.method !== "GET").length, 1); assert.equal(digest(), beforeRollback);
    assert.equal(Object.hasOwn(await storage.readAuthStore(), "mustNotAppear"), false);
    pass("Rueckweg entfernt nur neue Funktion; fehlender RPC bei Flag on bleibt Fehler ohne Ersatzwrite");

    delete process.env.HELMUT_AUTH_PATCH_V1; requests = [];
    await storage.mutateAuthStore(s => { s.legacyTransport = true; });
    assert.ok(requests.some(r => r.method === "PATCH" && r.path === "/rest/v1/helmut_store"));
    assert.equal((await storage.readAuthStore()).legacyTransport, true); assert.equal(history(), retained);
    pass("ohne Flag funktioniert der alte CAS Transport weiter, Historien erhalten");
  } finally {
    globalThis.fetch = transport;
    if (oldFlag === undefined) delete process.env.HELMUT_AUTH_PATCH_V1; else process.env.HELMUT_AUTH_PATCH_V1 = oldFlag;
    psql("update public.helmut_store set data=(select data from public.helmut_store where id='auth-patch-fixture-backup') where id='main-auth'; delete from public.helmut_store where id='auth-patch-fixture-backup'");
    assert.equal(digest(), before, "urspruenglicher rein synthetischer Harnessbestand wiederhergestellt");
  }
  return count;
}
module.exports = { bereiteVor, pruefe };
