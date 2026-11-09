"use strict";

// Nutzt ausschliesslich den vorhandenen PG17-/PostgREST-Pflichtnachweis und
// dessen Loopback-Gateway. Echte grosse HTTP-POSTs durch den Produktionsadapter;
// weder Originalquellen noch Modell-/Queueverarbeitung oder neue Testdienste.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MAX_BYTES, erzeugePlanungsrest } = require("../../lib/helmut/quellen-planungsrest");
const DIR = path.join(__dirname, "../../supabase/migrations");
const migration = fs.readFileSync(path.join(DIR, "20261109173143_raw_document_cas.sql"), "utf8");
const rollback = fs.readFileSync(path.join(DIR, "rollback_20261109173143_raw_document_cas.sql"), "utf8");
const RPC = "/rest/v1/rpc/helmut_quellenplan_cursor_cas";
const TAG = "2026-11-09";

function makeJobs(targetBytes, anzahl = 128) {
  const tagesplan = { datum: TAG, scopeMax: { understanding: 5 }, hinweis: 'Synthetik ä, & "{}"' };
  const auftraege = Array.from({ length: anzahl }, (_, i) => ({ jobType: "source_fetch", idempotencyKey: `synthetisch-plan-${i}`,
    freshnessWindow: TAG + "T03Z", dueAt: TAG + "T03:00:00Z", priority: 100, maxAttempts: 3,
    payload: { sourceId: `synthetisch-weg-${i}`, url: `https://example.invalid/quelle/${i}`, padding: "" } }));
  const probe = { version: 1, tag: TAG, auftraege, tagesplan, cursor: 0, manifestHash: "0".repeat(64), zustand: "offen" };
  const missing = targetBytes - Buffer.byteLength(JSON.stringify(probe));
  assert(missing >= 0);
  const each = Math.floor(missing / auftraege.length), rest = missing % auftraege.length;
  for (let i = 0; i < auftraege.length; i++) auftraege[i].payload.padding = "x".repeat(each + Number(i < rest));
  assert(auftraege.every(j => Buffer.byteLength(JSON.stringify(j.payload)) < 20000));
  assert.equal(Buffer.byteLength(JSON.stringify(probe)), targetBytes);
  return { auftraege, tagesplan };
}
async function pruefe({ psql, base, token }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.equal(process.env.SUPABASE_URL, base);
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, token);
  const storage = require("../../lib/helmut/storage");
  const native = storage.supabaseRequest;
  let count = 0;
  const pass = name => { count++; console.log("PASS  quellenplan-cursor-cas: " + name); };
  const calls = [];
  const request = async (endpoint, options = {}) => {
    const response = await native(endpoint, options);
    calls.push({ endpoint, method: options.method || "GET", bytes: Buffer.byteLength(options.body || ""),
      ...(endpoint === RPC ? { response } : {}) });
    return response;
  };
  const factory = (storeId, fn = request) => erzeugePlanungsrest({ storeId, request: fn });
  const makeId = storeId => `${storeId}-quellenplan-${TAG}`;
  const post = (id, expected, next) => native(RPC, { method: "POST",
    body: JSON.stringify({ p_id: id, p_expected: typeof expected === "string" ? expected : JSON.stringify(expected), p_next_cursor: next }) });
  const unchanged = (actual, before) => assert.deepEqual(
    { ...actual, cursor: before.cursor, zustand: before.zustand }, before);

  // Der alte URL-Mechanismus muss sichtbar an einer echten HTTP-Grenze scheitern.
  // Mittelgrosser Header: ein1MiB-Header kann schon vor lesbarer431 resetten.
  const mediumId = "main-plan-cas-medium", medium = factory(mediumId);
  const m = await medium.sichereManifest(TAG, makeJobs(44000, 8));
  const legacy = `/rest/v1/helmut_store?id=eq.${encodeURIComponent(makeId(mediumId))}`
    + `&data=eq.${encodeURIComponent(JSON.stringify(m))}&select=id`;
  assert(Buffer.byteLength(legacy) > 32768 && Buffer.byteLength(legacy) < 65536);
  await assert.rejects(native(legacy, { method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ data: { ...m, cursor: 1 } }) }), /431/);
  assert.equal((await medium.lesen(TAG)).cursor, 0);
  pass("alter URL-CAS wird durch echten HTTP431 verweigert, Cursor bleibt0");

  const storeId = "main-plan-cas-big", plan = factory(storeId);
  const initial = await plan.sichereManifest(TAG, makeJobs(MAX_BYTES - 128));
  assert(Buffer.byteLength(JSON.stringify(initial)) > 1000000);
  let known = await plan.bewegeCursor(TAG, initial, 1);
  assert.equal(known.cursor, 1); unchanged(known, initial);
  const rpcCalls = calls.filter(x => x.endpoint === RPC);
  assert(rpcCalls.length === 1 && rpcCalls[0].bytes > 1000000);
  assert.deepEqual(rpcCalls[0].response, [{ id: makeId(storeId), uebernommen: true }]);
  assert(calls.every(x => Buffer.byteLength(x.endpoint) < 256));
  pass("zulaessiges nahe1MiB-Manifest ueber echten storage-POST, kurze URL, exakter Readback");

  const beforeRace = known, beforeCalls = calls.length;
  const race = await Promise.all([plan.bewegeCursor(TAG, beforeRace, 2), plan.bewegeCursor(TAG, beforeRace, 2)]);
  const raceWrites = calls.slice(beforeCalls).filter(x => x.endpoint === RPC);
  assert.deepEqual(raceWrites.map(x => x.response[0].uebernommen).sort(), [false, true]);
  assert(race.every(x => x.cursor === 2)); known = await plan.lesen(TAG); unchanged(known, initial);
  pass("zwei parallele echte POSTs bestaetigen genau einen atomaren Fortschritt");

  const stale = await post(makeId(storeId), beforeRace, 2);
  assert.deepEqual(stale, [{ id: makeId(storeId), uebernommen: false }]);
  for (const mutate of [x => { x.auftraege[0].payload.padding += "abweichend"; },
    x => { x.tagesplan.scopeMax.understanding++; }, x => { x.manifestHash = "f".repeat(64); }]) {
    const wrong = structuredClone(known); mutate(wrong);
    assert.deepEqual(await post(makeId(storeId), wrong, 3), [{ id: makeId(storeId), uebernommen: false }]);
  }
  assert.deepEqual(await plan.lesen(TAG), known);
  pass("veralteter oder manipulierter Gesamtvorwert bleibt ohne Mutation");

  for (const next of [known.cursor, known.cursor - 1, known.cursor + 2, initial.auftraege.length + 1])
    await assert.rejects(post(makeId(storeId), known, next), /400/);
  for (const mutate of [x => { x.extra = true; }, x => { x.version = 2; }, x => { x.cursor = "2"; },
    x => { x.zustand = "fertig"; }, x => { x.auftraege[1].idempotencyKey = x.auftraege[0].idempotencyKey; }]) {
    const wrong = structuredClone(known); mutate(wrong);
    await assert.rejects(post(makeId(storeId), wrong, 3), /400/);
  }
  for (const id of ["main-auth", "main-p-fremd-quellenplan-" + TAG, storeId + "-quellenplan-2026-11-10"])
    await assert.rejects(post(id, known, 3), /400/);
  await assert.rejects(post(makeId(storeId), JSON.stringify(known) + " ".repeat(256), 3), /400/);
  assert.deepEqual(await plan.lesen(TAG), known);
  pass("geschlossener Vertrag, Id-/Tagbindung, Groesse und monotone+1-Grenze gelten serverseitig");

  let lost = false;
  const lostAdapter = factory(storeId, async (endpoint, options) => {
    const response = await request(endpoint, options);
    if (endpoint === RPC && !lost) { lost = true; throw Error("Synthetisch verlorene Antwort nach echtem Commit"); }
    return response;
  });
  known = await lostAdapter.bewegeCursor(TAG, known, 3);
  assert(lost); assert.equal(known.cursor, 3); unchanged(known, initial);
  assert.deepEqual(await factory(storeId).lesen(TAG), known);
  pass("verlorene Schreibantwort wird durch echten Readback und frischen Adapter aufgefangen");

  let committed = false;
  const noReadback = factory(storeId, async (endpoint, options) => {
    if (committed && endpoint !== RPC) throw Error("Synthetischer Readbackausfall");
    const response = await request(endpoint, options);
    if (endpoint === RPC) committed = true;
    return response;
  });
  await assert.rejects(noReadback.bewegeCursor(TAG, known, 4), /Readbackausfall/);
  known = await factory(storeId).lesen(TAG);
  assert.equal(known.cursor, 4); unchanged(known, initial);
  pass("fehlender Readback behauptet keinen Erfolg, Neustart findet den bestaetigten Cursor");

  // Eine kurze zweite Planung prueft den serverseitigen fertig-Wechsel ohne
  // weitere128 grosse Writes oder irgendeine echte Enqueue-/Workerverarbeitung.
  const shortId = "main-plan-cas-short", short = factory(shortId);
  const shortInitial = await short.sichereManifest(TAG, { auftraege: [{ jobType: "source_fetch", idempotencyKey: "kurzer-isolierter-plan", payload: {} }], tagesplan: null });
  const finished = await short.bewegeCursor(TAG, shortInitial, 1);
  assert.equal(finished.zustand, "fertig"); unchanged(finished, shortInitial);
  await assert.rejects(post(makeId(shortId), finished, 2), /400/);
  pass("letzter gueltiger+1-Schritt beendet nur den Cursor, fertiger Plan bleibt geschlossen");

  const signature = "public.helmut_quellenplan_cursor_cas(text,text,integer)";
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql(`select has_function_privilege('${role}','${signature}','EXECUTE')`), "f");
    assert.throws(() => psql(`set role ${role}; select * from public.helmut_quellenplan_cursor_cas('main-quellenplan-${TAG}','{}',1);`),
      /permission denied/i);
  }
  assert.equal(psql(`select has_function_privilege('service_role','${signature}','EXECUTE')`), "t");
  assert.equal(psql(`select prosecdef from pg_proc where oid='${signature}'::regprocedure`), "f");
  assert.match(psql(`select proconfig::text from pg_proc where oid='${signature}'::regprocedure`), /search_path=pg_catalog, public/);
  pass("nur service_role ausfuehrbar, Browserrollen tatsächlich verweigert, Invoker mit festem Suchpfad");

  const rowsBefore = psql("select md5(string_agg(row_to_json(r)::text,'' order by id)) from public.helmut_store r");
  psql(rollback); psql(rollback);
  assert.equal(psql(`select to_regprocedure('${signature}') is null`), "t");
  assert.equal(psql("select to_regprocedure('public.helmut_raw_document_cas(text,jsonb,jsonb)') is null"), "t");
  assert.equal(psql("select md5(string_agg(row_to_json(r)::text,'' order by id)) from public.helmut_store r"), rowsBefore);
  psql(migration); psql(migration);
  assert.equal(psql(`select has_function_privilege('anon','${signature}','EXECUTE')`), "f");
  pass("gemeinsamer Rollback entfernt beide RPCs datenbewahrend, Wiederanwendung bleibt geschlossen");
  console.log(`Quellenplan-Cursor-CAS PostgreSQL/PostgREST: ${count} PASS, 0 FAIL.`);
  return count;
}
module.exports = { pruefe };
