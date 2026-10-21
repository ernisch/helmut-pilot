"use strict";
// Explicit offline transport fixtures, never originals or a native SQL proof.
const assert = require("node:assert/strict"), fs = require("node:fs");
const L = require("../lib/helmut/local-pipeline-lock-lease");
const savedEnv = { ...process.env };
let tests = 0;
async function test(name, run) { await run(); tests += 1; console.log("PASS " + name); }
function fakeDB() {
  const rows = new Map(), calls = []; let clock = 1000, seq = 0;
  const request = async (route, options) => {
    const body = JSON.parse(options.body); calls.push({ route, body });
    assert.equal(options.method, "POST"); assert.equal(options.maxResponseBytes, 4096);
    if (route.endsWith("/helmut_acquire_pipeline_lock")) {
      const row = rows.get(body.p_job);
      if (row && row.expiresAt >= clock) return [{ acquired: false, token: null }];
      const token = "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0");
      rows.set(body.p_job, { token, expiresAt: clock + body.p_ttl_ms });
      return [{ acquired: true, token }];
    }
    assert.equal(route, "/rest/v1/rpc/helmut_release_pipeline_lock");
    if (rows.get(body.p_job)?.token !== body.p_token) return false;
    rows.delete(body.p_job); return true;
  };
  return { rows, calls, request, advance: n => { clock += n; } };
}
const target = () => "http://127.0.0.1:38419|main-auth";
const acquire = (db, jobName = "same-job", extra = {}) => L.acquire({ jobName, ttlMs: 100,
  request: db.request, getTarget: target, ...extra });

function actualLageLockClosure() {
  const source = fs.readFileSync(require.resolve("../lib/helmut/lage"), "utf8");
  const start = "  // 3) Nur EIN paralleler Generator (Lock).", body = "  try {\n    // 4) Budget-Gate";
  const tail = "  } finally {\n    if (leaseMode)", end = "\n}\n\n// --- Demo";
  for (const anchor of [start, body, tail, end]) assert.equal(source.split(anchor).length, 2);
  const prefix = source.slice(source.indexOf(start), source.indexOf(body));
  const suffix = source.slice(source.indexOf(tail), source.indexOf(end));
  // Use the exact product acquire/denial/finally code. Replace only the large
  // generation/storage body with a deterministic saved result for these cases.
  return new Function("storage", "performBody", `return async function () {
    const userId='fixture', CACHE_SLOT='fixture', day='2026-10-21', opts={}, cards=[],
      koSetHash='', quellenHash='', koLite=[], gebunden=null, publicationPolicy={}, absatzQuellen=[];
    const eligibility={assertSame(){}}, finalize=x=>x, unavailable=reason=>({available:false,reason});
    ${prefix}
    try { return await performBody(); ${suffix}
  };`);
}
(async () => {
  delete process.env.VERCEL;
  delete process.env.HELMUT_ATOMIC_LOCK;
  process.env.SUPABASE_URL = "http://127.0.0.1:38419";
  process.env.HELMUT_LLM_USAGE_STORAGE = "relational-atomic-v1";
  process.env.HELMUT_AUTH_STATE_STORAGE = "merkle-auth-v1";
  process.env.HELMUT_AUTH_HISTORY_READ_REUSE = "verified-history-reuse-v1";
  process.env.HELMUT_AUTH_CONTROL_READ = "verified-control-view-v1";
  delete process.env.HELMUT_AUTH_GRAPH_READ_REUSE;
  delete process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE;
  process.env[L.ENV] = L.MODE;
  await test("expired A cannot release successor B in either release order", async () => {
    for (const oldFirst of [true, false]) {
      const db = fakeDB(), a = await acquire(db); db.advance(101);
      const b = await acquire(db), tokenB = db.rows.get("same-job").token;
      assert.notEqual(a, b);
      if (oldFirst) { assert.equal(await L.release(a), false); assert.equal(db.rows.get("same-job").token, tokenB); }
      assert.equal(await L.release(b), true);
      if (!oldFirst) assert.equal(await L.release(a), false);
      assert.equal(db.rows.size, 0);
    }
  });
  await test("parallel acquire has exactly one confirmed owner", async () => {
    const db = fakeDB(), handles = await Promise.all([acquire(db), acquire(db)]);
    assert.equal(handles.filter(Boolean).length, 1);
    assert.equal(await L.release(handles.find(Boolean)), true);
  });
  await test("different jobs retain independent opaque ownership", async () => {
    const db = fakeDB(), a = await acquire(db, "a"), b = await acquire(db, "b");
    assert(Object.isFrozen(a)); assert.equal(Object.getPrototypeOf(a), null);
    for (const forged of [{}, { ...a }, JSON.parse(JSON.stringify(a))])
      await assert.rejects(L.release(forged), { code: "LOCAL_PIPELINE_LEASE_HANDLE_INVALID" });
    assert.equal(db.calls.length, 2);
    assert.equal(await L.release(a), true); assert.equal(db.rows.has("b"), true);
    assert.equal(await L.release(b), true);
  });
  await test("parallel release consumes capability before first await", async () => {
    const db = fakeDB(), handle = await acquire(db);
    const result = await Promise.allSettled([L.release(handle), L.release(handle)]);
    assert.equal(result.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(db.calls.length, 2);
  });
  await test("unknown acquire outcome has no handle or retry", async () => {
    const db = fakeDB();
    await assert.rejects(acquire(db, "unknown", { request: async (...args) => {
      await db.request(...args); throw Error("ACK lost");
    } }), /ACK lost/);
    assert.equal(db.calls.length, 1); assert.equal(db.rows.has("unknown"), true);
  });
  await test("unknown release outcome stays consumed and is never replayed", async () => {
    const db = fakeDB();
    const handle = await acquire(db, "unknown", { request: async (...args) => {
      const value = await db.request(...args);
      if (args[0].includes("release")) throw Error("ACK lost");
      return value;
    } });
    await assert.rejects(L.release(handle), /ACK lost/);
    await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_HANDLE_INVALID" });
    assert.equal(db.calls.length, 2); assert.equal(db.rows.size, 0);
  });
  await test("malformed or contradictory acquire ACK never creates ownership", async () => {
    const token = "00000000-0000-4000-8000-000000000001";
    const accessor = { acquired: true }; Object.defineProperty(accessor, "token", { enumerable: true,
      get() { throw Error("getter must never run"); } });
    const malformed = [null, [], [{ acquired: true }], [{ acquired: "true", token }],
      [{ acquired: true, token: null }], [{ acquired: true, token: "bad" }],
      [{ acquired: false, token }], [{ acquired: true, token, extra: 1 }],
      [{ acquired: true, token }, { acquired: true, token }], [accessor]];
    for (const reply of malformed) {
      let calls = 0;
      await assert.rejects(acquire({ request: async () => { calls += 1; return reply; } }),
        { code: "LOCAL_PIPELINE_LEASE_UNCONFIRMED" });
      assert.equal(calls, 1);
    }
  });
  await test("malformed release ACK consumes handle without retry", async () => {
    for (const bad of [null, [true], { released: true }, "true"]) {
      const db = fakeDB(), handle = await acquire(db, "malformed", { request: async (...args) => {
        const value = await db.request(...args); return args[0].includes("release") ? bad : value;
      } });
      await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_RELEASE_UNCONFIRMED" });
      await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_HANDLE_INVALID" });
      assert.equal(db.calls.length, 2);
    }
  });
  await test("target drift before release sends no RPC and consumes handle", async () => {
    const db = fakeDB(); let current = target();
    const handle = await acquire(db, "drift", { getTarget: () => current }); current += "-other";
    await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_TARGET_DRIFT" });
    await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_HANDLE_INVALID" });
    assert.equal(db.calls.length, 1);
  });
  await test("target drift during acquire does not accept its ACK", async () => {
    const db = fakeDB(); let current = target();
    await assert.rejects(acquire(db, "drift", { getTarget: () => current, request: async (...args) => {
      const value = await db.request(...args); current += "-other"; return value;
    } }), { code: "LOCAL_PIPELINE_LEASE_TARGET_DRIFT" });
    assert.equal(db.calls.length, 1);
  });
  await test("mode drift cannot release or fall back; global legacy flag rejects new mode", async () => {
    const db = fakeDB(), handle = await acquire(db);
    process.env[L.ENV] = "off";
    await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_DISABLED" });
    assert.equal(db.calls.length, 1); assert.equal(L.enabled(), false);
    process.env[L.ENV] = L.MODE; process.env.HELMUT_ATOMIC_LOCK = "on";
    assert.throws(() => L.enabled(), { code: "LOCAL_PIPELINE_LEASE_MODE_INVALID" });
    delete process.env.HELMUT_ATOMIC_LOCK;
    await assert.rejects(L.release(handle), { code: "LOCAL_PIPELINE_LEASE_HANDLE_INVALID" });
  });
  await test("Storage bridge returns same private ownership contract", async () => {
    const storage = require("../lib/helmut/storage"), db = fakeDB();
    assert.equal(storage.pipelineLockLeaseEnabled(), true);
    const h = await storage.acquirePipelineLockLease("bridge", 100, { request: db.request });
    assert.equal(await storage.releasePipelineLockLease(h), true); assert.equal(db.calls.length, 2);
  });
  await test("actual Lage lock closure preserves saved result only with confirmed own release", async () => {
    const make = actualLageLockClosure();
    for (const outcome of [true, false, "lost"]) {
      let body = 0, releases = 0, modes = 0;
      const storage = { pipelineLockLeaseEnabled: () => { modes += 1; return modes === 1; },
        acquirePipelineLockLease: async () => Object.freeze({}),
        releasePipelineLockLease: async () => { releases += 1; if (outcome === "lost") throw Error("release ACK lost"); return outcome; },
        acquirePipelineLock: async () => assert.fail("unexpected Auth fallback"),
        releasePipelineLock: async () => assert.fail("unexpected Auth release") };
      const run = make(storage, async () => { body += 1; return { available: true, saved: "exact-result" }; });
      if (outcome === true) assert.deepEqual(await run(), { available: true, saved: "exact-result" });
      else await assert.rejects(run(), outcome === "lost" ? /release ACK lost/ : /OWNERSHIP_LOST/);
      assert.equal(body, 1); assert.equal(releases, 1); assert.equal(modes, 1);
    }
  });
  await test("actual Lage acquire failure never generates or switches backend", async () => {
    const make = actualLageLockClosure(); let body = 0, releases = 0;
    const run = make({ pipelineLockLeaseEnabled: () => true,
      acquirePipelineLockLease: async () => { throw Error("acquire ACK lost"); },
      releasePipelineLockLease: async () => { releases += 1; },
      acquirePipelineLock: async () => assert.fail("unexpected Auth fallback") }, async () => { body += 1; });
    assert.deepEqual(await run(), { available: false, reason: "store-error" });
    assert.equal(body, 0); assert.equal(releases, 0);
  });
  await test("actual Lage default-off closure retains the existing Auth backend", async () => {
    const make = actualLageLockClosure(); let acquired = 0, released = 0;
    const run = make({ pipelineLockLeaseEnabled: () => false,
      acquirePipelineLock: async (job, ttl) => {
        assert.equal(job, "lage-briefing-fixture"); assert.equal(ttl, 90000); acquired += 1; return true;
      },
      releasePipelineLock: async job => {
        assert.equal(job, "lage-briefing-fixture"); released += 1; throw Error("legacy ignored release error");
      },
      acquirePipelineLockLease: async () => assert.fail("disabled lease called"),
      releasePipelineLockLease: async () => assert.fail("disabled lease released") }, async () => ({ saved: "unchanged" }));
    assert.deepEqual(await run(), { saved: "unchanged" });
    assert.equal(acquired, 1); assert.equal(released, 1);
  });
  console.log(JSON.stringify({ pass: true, tests, scope: "OFFLINE_LEASE_AND_EXACT_LAGE_LOCK_CONTROL_FLOW_ONLY",
    databaseCalls: 0, providerCalls: 0, full500: false }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const k of Object.keys(process.env)) if (!Object.hasOwn(savedEnv, k)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});
