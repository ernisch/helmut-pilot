"use strict";

// Transportvertrag ohne Netz und ohne 20s-Wartezeit. Die echte Deadline wird
// kontrolliert ausgeloest; auch ein nicht kooperierender Fetch-/Body-Stub endet.
const assert = require("node:assert/strict");
const storagePath = require.resolve("../lib/helmut/storage");
const originals = { fetch: global.fetch, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
const oldTimeout = process.env.HELMUT_SUPABASE_TIMEOUT_MS;
const oldUrl = process.env.SUPABASE_URL;
process.env.SUPABASE_URL = "https://offline.invalid";
let passed = 0;
let failed = 0;

async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

function harness(envValue, fetchImpl) {
  if (envValue === undefined) delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
  else process.env.HELMUT_SUPABASE_TIMEOUT_MS = String(envValue);
  delete require.cache[storagePath];
  const storage = require(storagePath);
  const timers = [];
  const calls = [];
  global.setTimeout = (callback, ms) => {
    const timer = { callback, ms, cleared: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => { timer.cleared = true; };
  global.fetch = (url, options) => {
    calls.push({ url, options });
    return fetchImpl(options);
  };
  return { storage, timers, calls };
}

const response = (text = '[{"ok":true}]') => ({ ok: true, status: 200, text: async () => text });
const never = () => new Promise(() => {});
const turn = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  try {
    for (const [value, expected] of [
      [undefined, 10000], ["", 10000], [0, 10000], [-1, 10000],
      ["NaN", 10000], ["not-a-number", 10000], [Infinity, 10000],
      [200, 200], [15000, 15000], [20000, 20000], [30000, 20000], [1e12, 20000]
    ]) {
      await check(`Default ${String(value)} ergibt sichere ${expected}ms`, async () => {
        const h = harness(value, () => response());
        assert.deepEqual(await h.storage.supabaseRequest("/ok"), [{ ok: true }]);
        assert.equal(h.timers.length, 1);
        assert.equal(h.timers[0].ms, expected);
        assert.equal(h.timers[0].cleared, true);
        assert.equal(h.calls[0].options.signal.aborted, false);
      });
    }

    for (const [envValue, requested, expected] of [
      [10000, 75, 75], [10000, 15000, 10000], [20000, 15000, 15000],
      [30000, 50000, 20000], [200, 1000, 200], [10000, 0, 10000],
      [10000, -1, 10000], [10000, NaN, 10000], [10000, Infinity, 10000],
      [10000, "bad", 10000], [10000, null, 10000]
    ]) {
      await check(`timeoutMs ${String(requested)} verlaengert Default ${envValue} nicht`, async () => {
        const h = harness(envValue, () => response());
        const options = { timeoutMs: requested, method: "PATCH", body: '{"x":1}', headers: { Prefer: "return=representation" } };
        await h.storage.supabaseRequest("/ok", options);
        assert.equal(h.timers[0].ms, expected);
        assert.equal(h.timers[0].cleared, true);
        assert.equal(Object.hasOwn(h.calls[0].options, "timeoutMs"), false);
        assert.equal(h.calls[0].options.method, "PATCH");
        assert.equal(h.calls[0].options.body, options.body);
        assert.equal(h.calls[0].options.headers.Prefer, options.headers.Prefer);
        assert.equal(options.timeoutMs, requested, "Aufruferoptionen bleiben unveraendert");
      });
    }

    for (const phase of ["headers", "body", "error-body"]) {
      await check(`${phase}: explizite Deadline abortiert, beendet und wiederholt PATCH nicht`, async () => {
        let bodyCalls = 0;
        const h = harness(10000, () => phase === "headers" ? never() : {
          ok: phase === "body", status: phase === "body" ? 200 : 522,
          text: () => { bodyCalls += 1; return never(); }
        });
        const request = h.storage.supabaseRequest("/stall", { method: "PATCH", timeoutMs: 75 });
        // Sofort einen Rejection-Handler binden, dann die Bodyphase erreichen.
        const rejection = assert.rejects(request, /Supabase storage timed out after 75ms/);
        await turn();
        assert.equal(h.timers[0].ms, 75);
        assert.equal(bodyCalls, phase === "headers" ? 0 : 1);
        h.timers[0].callback();
        await rejection;
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].options.signal.aborted, true);
        assert.equal(h.timers[0].cleared, true);
      });
    }

    await check("Fehlerpfade raeumen Timer auf und behalten Status/Redaction", async () => {
      const h = harness(10000, () => ({
        ok: false, status: 400,
        text: async () => "Failing row contains (private-row). Key (email)=(private-email)."
      }));
      await assert.rejects(h.storage.supabaseRequest("/error"), (error) => {
        assert.match(error.message, /Supabase storage failed \(400\)/);
        assert.match(error.message, /redacted/);
        assert.doesNotMatch(error.message, /private-row|private-email/);
        return true;
      });
      assert.equal(h.timers[0].cleared, true);
      assert.equal(h.calls[0].options.signal.aborted, false);
    });

    await check("Fetchfehler bleiben unveraendert und raeumen Timer auf", async () => {
      const error = new Error("offline network failure");
      const h = harness(10000, async () => { throw error; });
      await assert.rejects(h.storage.supabaseRequest("/error"), (caught) => caught === error);
      assert.equal(h.timers[0].cleared, true);
    });

    await check("JSON-Parsefehler bleiben unveraendert und raeumen Timer auf", async () => {
      const h = harness(10000, () => response("invalid-json"));
      await assert.rejects(h.storage.supabaseRequest("/invalid-json"), SyntaxError);
      assert.equal(h.timers[0].cleared, true);
    });
  } finally {
    Object.assign(global, originals);
    if (oldTimeout === undefined) delete process.env.HELMUT_SUPABASE_TIMEOUT_MS;
    else process.env.HELMUT_SUPABASE_TIMEOUT_MS = oldTimeout;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    delete require.cache[storagePath];
  }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
