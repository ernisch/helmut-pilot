"use strict";
// Bounded real-PostgreSQL/PostgREST check, ONLY inside its new network-none
// benchmark container. No profile table, activation, GO or model call.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const receipt = JSON.parse(fs.readFileSync("/bench/STARTED.SAFE.json"));
assert.equal(receipt.scope, "SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN");
assert.equal(os.hostname(), receipt.cid.slice(0, 12));
assert.equal(process.env.SUPABASE_URL, undefined);
const CAS = require("../../lib/helmut/auth-store-cas");
const base = "http://127.0.0.1:38419", target = "isolated-small-cas-fixture";
let requests = 0;
function sql(query) {
  return execFileSync("psql", ["-U", "postgres", "-d", "postgres", "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
  }).trim();
}
async function request(path, options = {}) {
  assert(path.startsWith("/rest/v1/")); requests++;
  const response = await fetch(base + path.slice("/rest/v1".length), {
    ...options, headers: { "Content-Type": "application/json", ...options.headers }
  });
  const body = JSON.parse(await response.text());
  if (!response.ok) { const error = new Error("local-cas-http-error"); error.code = body.code; error.statusCode = response.status; throw error; }
  return body;
}
async function read() {
  const rows = await request("/rest/v1/helmut_store?id=eq.main-auth&select=data");
  assert.equal(rows.length, 1);
  return CAS.attachSnapshot(rows[0].data, { exists: true, revision: rows[0].data[CAS.REVISION], target });
}
const write = (store, extra = {}) => CAS.writeConditional(store, {
  request, rowId: "main-auth", target, transport: "scalar-jsonb-rpc", ...extra
});
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, errorType: error.name, code: error.code || null }); }
}
(async () => {
  if (process.argv[4] === "--rollback-only") {
    const forward = fs.readFileSync(require("node:path").join(__dirname,
      "../../supabase/proposals/auth_store_cas_scalar_jsonb.sql"), "utf8");
    const rollback = fs.readFileSync(require("node:path").join(__dirname,
      "../../supabase/proposals/auth_store_cas_scalar_jsonb_rollback.sql"), "utf8");
    const before = sql("select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth';");
    const drift = forward.replace("create function", "create or replace function")
      .replace("as $function$", "as $function$\n-- intentional isolated drift probe");
    sql(drift);
    assert.throws(() => sql(rollback));
    assert.equal(sql("select to_regprocedure('public.helmut_auth_store_cas_v1(jsonb)')is not null;"), "t");
    sql("drop function public.helmut_auth_store_cas_v1(jsonb);" + forward);
    sql(rollback);
    assert.equal(sql("select to_regprocedure('public.helmut_auth_store_cas_v1(jsonb)')is null;"), "t");
    assert.throws(() => sql(rollback));
    assert.equal(sql("select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth';"), before);
    assert.equal(sql("select count(*)from pg_trigger where tgrelid='public.helmut_store'::regclass and tgname in('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1')and tgenabled='A';"), "2");
    const result = { pass: true, checks: ["source-drift-refuses-drop", "exact-source-only-removal", "missing-function-refuses-replay",
      "table-data-identical", "both-original-always-triggers-preserved"], activation: false, GOConsumed: false, production: false };
    const p = "/bench/ROLLBACK_RESULT.SAFE.json";
    fs.writeFileSync(p, JSON.stringify(result, null, 2), { mode: 0o600 });
    fs.chownSync(p, Number(process.argv[2]), Number(process.argv[3]));
    console.log(JSON.stringify(result)); return;
  }
  for (let i = 0; i < 60; i++) {
    try { await read(); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  await check("large-auth-exact-content-roundtrip", async () => {
    const before = await read(), changed = { ...before, localCASProbe: "large-roundtrip" };
    const written = await write(changed), after = await read();
    assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(written)));
    assert.equal(before[CAS.REVISION], changed[CAS.REVISION]);
    assert.notEqual(written[CAS.REVISION], before[CAS.REVISION]);
  });
  await check("stale-snapshot-and-original-copy-rejected", async () => {
    const old = await read(), copy = { ...old };
    await write({ ...old, localCASProbe: "winner" });
    await assert.rejects(write(copy), { code: "AUTH_STORE_CONFLICT" });
    await assert.rejects(write(old), { code: "AUTH_STORE_CONFLICT" });
    assert.equal((await read()).localCASProbe, "winner");
  });
  // Subsequent safety cases use only small synthetic values in THIS fresh DB.
  sql("update public.helmut_store set data='{\"baseline\":true}' where id='main-auth';");
  await check("legacy-null-revision-first-winner-only", async () => {
    const old = await read(), stale = { ...old }; await write({ ...old, probe: 1 });
    await assert.rejects(write(stale), { code: "AUTH_STORE_CONFLICT" });
    assert.equal((await read()).baseline, true);
  });
  await check("concurrent-same-revision-exactly-one-winner", async () => {
    const old = await read();
    const runs = await Promise.allSettled([write({ ...old, winner: "a" }), write({ ...old, winner: "b" })]);
    assert.equal(runs.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(runs.find(r => r.status === "rejected").reason.code, "AUTH_STORE_CONFLICT");
  });
  await check("target-change-and-missing-snapshot-no-transport", async () => {
    const old = await read(), n = requests;
    await assert.rejects(write(old, { target: "other" }), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
    await assert.rejects(write({ baseline: true }), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
    assert.equal(requests, n);
  });
  await check("unknown-transport-fails-before-io", async () => {
    const old = await read(), n = requests;
    await assert.rejects(write(old, { transport: "unknown" }), { code: "AUTH_STORE_TRANSPORT_INVALID" });
    assert.equal(requests, n);
  });
  await check("missing-rpc-no-fallback-or-retry", async () => {
    const old = await read(), n = requests;
    await assert.rejects(write(old, { request: (path, opts) => request(path + "_missing", opts) }), { statusCode: 404 });
    assert.equal(requests, n + 1);
  });
  await check("lost-reply-after-write-never-replayed", async () => {
    const old = await read(), n = requests;
    await assert.rejects(write({ ...old, lostReplyProbe: true }, { request: async (path, opts) => {
      await request(path, opts); throw new Error("intentional-local-reply-loss");
    } }), /intentional-local-reply-loss/);
    assert.equal(requests, n + 1); assert.equal((await read()).lostReplyProbe, true);
  });
  await check("missing-row-is-conflict-not-upsert", async () => {
    const old = await read(); await assert.rejects(write(old, { rowId: "missing-auth" }), { code: "AUTH_STORE_CONFLICT" });
    assert.equal(sql("select count(*)from public.helmut_store where id='missing-auth';"), "0");
  });
  await check("invoker-rls-blocks-other-row", async () => {
    sql("insert into public.helmut_store values('rls-blocked','{\"sentinel\":true}',now());");
    const old = CAS.attachSnapshot({ sentinel: false }, { exists: true, revision: null, target });
    await assert.rejects(write(old, { rowId: "rls-blocked" }), { code: "AUTH_STORE_CONFLICT" });
    assert.equal(sql("select data->>'sentinel'from public.helmut_store where id='rls-blocked';"), "true");
  });
  await check("ungranted-roles-cannot-execute", async () => {
    for (const role of ["bench_denied", "anon", "authenticated"]) {
      assert.throws(() => sql(`set role ${role};select public.helmut_auth_store_cas_v1('{}');`), error => String(error.stderr).includes("42501"));
    }
    assert.equal(sql("select prosecdef::text||'|'||proconfig[1]from pg_proc where oid='public.helmut_auth_store_cas_v1(jsonb)'::regprocedure;"), "false|search_path=pg_catalog");
  });
  await check("malformed-inputs-never-change-revision", async () => {
    const old = await read(), revision = old[CAS.REVISION], next = { ...old, [CAS.REVISION]: crypto.randomUUID() };
    const good = { id: "main-auth", expectedRevision: revision, data: next };
    for (const body of [null, [], {}, { ...good, expectedRevision: 7 }, { id: "main-auth", data: next },
      { ...good, data: [] }, { ...good, data: { ...next, [CAS.REVISION]: null } },
      { ...good, data: old }, { ...good, extra: true }, { ...good, id: "" }]) {
      await assert.rejects(request("/rest/v1/rpc/helmut_auth_store_cas_v1", { method: "POST", body: JSON.stringify(body) }));
      assert.equal((await read())[CAS.REVISION], revision);
    }
  });
  await check("original-always-command-guards-still-block-rpc-and-truncate", async () => {
    const id = "synthetik500-command-synthetik500-local-cas-guard-probe";
    sql(`insert into public.helmut_store values('${id}','{"sentinel":true}',now());`);
    const payload = JSON.stringify({ id, expectedRevision: null, data: { [CAS.REVISION]: crypto.randomUUID() } });
    assert.throws(() => sql(`select public.helmut_auth_store_cas_v1('${payload}'::jsonb);`), e => String(e.stderr).includes("55000"));
    assert.throws(() => sql("truncate public.helmut_store;"), e => String(e.stderr).includes("55000"));
    assert.equal(sql("select count(*)from pg_trigger where tgrelid='public.helmut_store'::regclass and tgname in('helmut_s500_command_immutable_row_v1','helmut_s500_command_no_truncate_v1')and tgenabled='A';"), "2");
    const pins = require("../../lib/helmut/synthetik-500-stored-command-native-pins.json").nativeSources;
    for (const [name, hash] of Object.entries(pins)) {
      assert.equal(sql(`select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where pronamespace='public'::regnamespace and proname='${name}';`), hash);
    }
  });
  await check("fixture-has-no-profile-table-or-activation", async () => {
    assert.equal(sql("select to_regclass('public.mandate_profiles')is null;"), "t");
    assert.equal(receipt.GOClaimed, false);
  });
  const result = { scope: "BOUNDED_REAL_SQL_CAS_SECURITY_NOT_FULL500_ACCEPTANCE", pass: results.every(r => r.pass),
    checks: results, requests, originalGuardFunctionsAndAlwaysTriggersPreserved:
      results.find(r => r.name === "original-always-command-guards-still-block-rpc-and-truncate")?.pass === true,
    fullUnit60Auth30Or2048MBAccepted: false, profileActivations: 0, GOClaims: 0, paidProviderCalls: 0, production: false };
  const p = "/bench/SECURITY_RESULT.SAFE.json";
  fs.writeFileSync(p, JSON.stringify(result, null, 2), { mode: 0o600 });
  fs.chownSync(p, Number(process.argv[2]), Number(process.argv[3]));
  console.log(JSON.stringify({ pass: result.pass, checks: results.length, failures: results.filter(r => !r.pass) }));
  if (!result.pass) process.exitCode = 1;
})().catch(error => { console.error(JSON.stringify({ failed: true, errorType: error.name, code: error.code || null })); process.exitCode = 1; });
