"use strict";

const assert = require("node:assert/strict");
// Only fictitious configuration enters storage, even when launched from Cloud.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fictitious-original-state-key";
process.env.SUPABASE_SERVICE_KEY = "fictitious-secondary-key";
process.env.SUPABASE_SECRET_KEY = "fictitious-third-key";
process.env.HELMUT_SUPABASE_STORE_ID = "main";
process.env.HELMUT_SUPABASE_AUTH_STORE_ID = "main-auth";
globalThis.fetch = async () => { throw new Error("offline-network-forbidden"); };
const storage = require("../lib/helmut/storage");
const { LIMITS, RPC } = require("../lib/helmut/starttor-original-state-witness");
const NONCE = "11111111-2222-4333-8444-555555555555";
const closed = /starttor-original-state-transport-closed/;
const never = () => new Promise(() => {});
let passed = 0;

function fixture({ phase, bytes, status = 200, headers = {}, cancelReject = false } = {}) {
  let clock = 1000, seq = 0, enteredResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const timers = new Map(), calls = [], signals = [];
  let cancelled = 0, released = 0;
  const body = (url) => {
    const id = url.searchParams.get("id")?.slice(3);
    const value = id ? [{ id, data: { original: "ä", revision: null, nested: [1, true] } }] : { original: true };
    const chunks = bytes ? [bytes] : [Buffer.from(JSON.stringify(value))];
    let index = 0;
    return { getReader: () => ({
      read: () => {
        if (phase === "read") { enteredResolve(); return never(); }
        return Promise.resolve(index < chunks.length ? { done: false, value: chunks[index++] } : { done: true });
      },
      cancel: () => {
        cancelled++;
        if (phase === "cancel") { enteredResolve(); return never(); }
        return cancelReject ? Promise.reject(new Error("fictitious-cancel-error")) : Promise.resolve();
      },
      releaseLock: () => { released++; }
    }), locked: false,
    cancel: () => {
      cancelled++;
      if (phase === "unlocked-cancel") { enteredResolve(); return never(); }
      return Promise.resolve();
    } };
  };
  const reader = storage.createStarttorOriginalStateReader({ projectRef: "a".repeat(20), deadlineMs: 1020,
    now: () => clock,
    setTimer: (callback, ms) => { const id = ++seq; timers.set(id, { callback, at: clock + ms }); return id; },
    clearTimer: id => timers.delete(id),
    fetchImpl: (url, init) => {
      calls.push({ url, init }); signals.push(init.signal);
      if (phase === "fetch") { enteredResolve(); return never(); }
      const responseBody = body(url);
      return Promise.resolve({ status, headers: { get: key => headers[key] ??
        (key === "content-type" ? "application/json" : null) }, body: responseBody });
    }
  });
  return { reader, entered, calls, timers, signals,
    advance: ms => { clock += ms; for (const t of [...timers.values()]) if (t.at <= clock) t.callback(); },
    stats: () => ({ cancelled, released }) };
}
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await check("Exact originals, fixed GETs and four-call limit", async () => {
    const f = fixture();
    for (const value of [await f.reader.packet(NONCE), await f.reader.original("auth"), await f.reader.original("main")]) {
      assert.deepEqual(value, { original: "ä", revision: null, nested: [1, true] });
    }
    await f.reader.native({ nonce: NONCE, packetHash: "1".repeat(64), authHash: "2".repeat(64), mainHash: "3".repeat(64) });
    assert.deepEqual(f.calls.map(c => c.url.pathname), ["/rest/v1/helmut_store", "/rest/v1/helmut_store",
      "/rest/v1/helmut_store", "/rest/v1/rpc/" + RPC]);
    assert.deepEqual(f.calls.slice(0, 3).map(c => c.url.searchParams.get("id")),
      ["eq.synthetik500-original-state-" + NONCE, "eq.main-auth", "eq.main"]);
    for (const c of f.calls) {
      assert.equal(c.init.method, "GET"); assert.equal(c.init.redirect, "error"); assert.equal(c.init.cache, "no-store");
      assert.equal(c.init.headers.apikey, "fictitious-original-state-key"); assert.equal(c.init.body, undefined);
    }
    await assert.rejects(f.reader.original("auth"), closed); assert.equal(f.calls.length, 4);
    assert.deepEqual(f.stats(), { cancelled: 4, released: 4 }); assert.equal(f.timers.size, 0);
    assert.equal(f.reader.inventory().retries, 0);
  });
  for (const phase of ["fetch", "read", "cancel", "unlocked-cancel"]) {
    await check("Uncooperative " + phase + " closes at the shared deadline", async () => {
      const f = fixture({ phase, status: phase === "unlocked-cancel" ? 503 : 200 });
      const rejected = assert.rejects(f.reader.original("auth"), closed);
      await f.entered; f.advance(20); await rejected;
      assert(f.signals.every(signal => signal.aborted)); assert.equal(f.timers.size, 0);
      if (phase === "read" || phase === "cancel") assert.equal(f.stats().released, 1);
      await assert.rejects(f.reader.original("main"), closed); assert.equal(f.calls.length, 1);
    });
  }
  await check("Cancel rejection cannot produce a positive result", async () => {
    const f = fixture({ cancelReject: true }); await assert.rejects(f.reader.original("auth"), closed);
    assert.equal(f.stats().released, 1); assert.equal(f.timers.size, 0);
  });
  await check("Later calls retain the original operation deadline", async () => {
    const f = fixture(); await f.reader.original("auth"); f.advance(19);
    await f.reader.original("main"); f.advance(1);
    await assert.rejects(f.reader.original("auth"), closed); assert.equal(f.calls.length, 2);
  });
  for (const cap of ["packet", "original", "output"]) {
    await check("Streaming byte cap remains closed for " + cap, async () => {
      const data = { text: "x".repeat(LIMITS[cap]) };
      const value = cap === "output" ? data : [{ id: cap === "packet" ? "synthetik500-original-state-" + NONCE : "main-auth", data }];
      const f = fixture({ bytes: Buffer.from(JSON.stringify(value)) });
      const request = cap === "packet" ? f.reader.packet(NONCE) : cap === "original" ? f.reader.original("auth") : f.reader.native({});
      await assert.rejects(request, closed); assert.equal(f.stats().released, 1);
    });
  }
  await check("Aggregate response limit includes the packet and previous reads", async () => {
    // Four individually valid responses whose sum exceeds the shared total cap.
    const rows = JSON.stringify([{ id: "main-auth", data: { text: "x".repeat(LIMITS.total / 4) } }]);
    const f = fixture({ bytes: Buffer.from(rows) });
    for (let i = 0; i < 3; i++) await f.reader.original("auth");
    await assert.rejects(f.reader.original("auth"), closed); assert.equal(f.calls.length, 4);
  });
  for (const bytes of [Buffer.from([0xff]), Buffer.from('{"value":9007199254740993}'), Buffer.from('{broken')]) {
    await check("Malformed or lossy original input closes", async () => {
      const f = fixture({ bytes }); await assert.rejects(f.reader.original("auth"), closed);
      assert.equal(f.stats().released, 1);
    });
  }
  console.log("PASS starttor-original-state-transport " + passed + " groups; fictitious transport only, no Production proof");
}
// A broken deadline must fail the test process rather than hang CI.
const safety = setTimeout(() => { console.error("FAIL transport did not settle"); process.exit(1); }, 5000);
main().then(() => clearTimeout(safety), error => { clearTimeout(safety); console.error(error); process.exitCode = 1; });
