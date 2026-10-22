"use strict";
process.env.HELMUT_SUPABASE_TIMEOUT_MS = "200";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-response-cap-test-key";

const http = require("node:http");
const assert = require("node:assert/strict");

function loadStorage() {
  const candidates = [
    "../lib/helmut/storage.js",
    "../lib/storage.js",
    "../lib/supabase.js",
    "../lib/helmut/supabase.js",
    "../lib/supabase-storage.js",
  ];
  for (const c of candidates) {
    try {
      const mod = require(c);
      if (mod && typeof mod.supabaseRequest === "function") return mod;
    } catch (e) {
      if (e.code !== "MODULE_NOT_FOUND") throw e;
    }
  }
  throw new Error("storage.supabaseRequest not found");
}
const storage = loadStorage();

const HITS = new Map();
function hit(p) { HITS.set(p, (HITS.get(p) || 0) + 1); }

const EXACT_STR = "\uFEFF{\"sentinel\":\"CAP_MINUS_ONLY_9f3\",\"m\":\"äöü€😀\",\"pad\":\"" + "x".repeat(40) + "\"}";
const EXACT_BUF = Buffer.from(EXACT_STR, "utf8");
const EXACT_JSON = JSON.parse(EXACT_STR.slice(1));

let chunkedCloseResolve = null;
let stallCloseResolve = null;

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  hit(path);
  switch (path) {
    case "/exact": {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write(EXACT_BUF.subarray(0, 2));
      res.end(EXACT_BUF.subarray(2));
      break;
    }
    case "/cap-minus": {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(EXACT_BUF);
      break;
    }
    case "/chunked": {
      res.writeHead(200, { "Content-Type": "application/json" });
      const timer = setInterval(() => {
        if (res.destroyed || res.writableEnded) return;
        res.write("A".repeat(200));
      }, 2);
      res.on("close", () => { clearInterval(timer); if (chunkedCloseResolve) chunkedCloseResolve(); });
      break;
    }
    case "/err-over": {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "x".repeat(200) }));
      break;
    }
    case "/err-ordinary": {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failing row contains (TOP_SECRET_ROW)", message: "Key (id)=(TOP_SECRET_KEY) is not present" }));
      break;
    }
    case "/stall": {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"stall":');
      res.on("close", () => { if (stallCloseResolve) stallCloseResolve(); });
      break;
    }
    case "/unbounded": {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pad: "y".repeat(150) }));
      break;
    }
    case "/empty204": { res.writeHead(204); res.end(); break; }
    case "/empty200": { res.writeHead(200, { "Content-Type": "application/json" }); res.end(); break; }
    default: { res.writeHead(404, { "Content-Type": "application/json" }); res.end('{"error":"not found"}'); break; }
  }
});

server.on("error", (e) => { console.error("server error", e && e.code ? e.code : e && e.name); process.exit(1); });

function withWatchdog(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("watchdog timeout: " + label)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try { await fn(); pass++; console.log("PASS", name); }
  catch (e) { fail++; console.error("FAIL", name, e && e.code ? e.code : e && e.name); }
}

async function main() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;

  await test("exact utf8 byte cap with split multibyte/BOM accepted", async () => {
    const result = await storage.supabaseRequest("/exact", { maxResponseBytes: EXACT_BUF.length });
    assert.deepEqual(result, EXACT_JSON);
  });

  await test("cap-1 rejects before JSON.parse with one HTTP call", async () => {
    const sentinel = "CAP_MINUS_ONLY_9f3";
    let sentinelParses = 0;
    const orig = JSON.parse;
    JSON.parse = function (text, reviver) {
      if (typeof text === "string" && text.includes(sentinel)) sentinelParses++;
      return orig.call(this, text, reviver);
    };
    try {
      const before = HITS.get("/cap-minus") || 0;
      let err;
      try { await storage.supabaseRequest("/cap-minus", { maxResponseBytes: EXACT_BUF.length - 1 }); } catch (e) { err = e; }
      assert.ok(err, "expected rejection");
      assert.equal(err.code, "SUPABASE_RESPONSE_TOO_LARGE");
      assert.equal(sentinelParses, 0);
      assert.equal((HITS.get("/cap-minus") || 0) - before, 1);
    } finally { JSON.parse = orig; }
  });

  await test("chunked oversize aborts and closes server connection", async () => {
    let resolveClose;
    const closed = new Promise((r) => { resolveClose = r; });
    chunkedCloseResolve = resolveClose;
    let err;
    try { await storage.supabaseRequest("/chunked", { maxResponseBytes: 64 }); } catch (e) { err = e; }
    assert.ok(err, "expected rejection");
    assert.equal(err.code, "SUPABASE_RESPONSE_TOO_LARGE");
    await withWatchdog(closed, 3000, "chunked close");
  });

  await test("HTTP error oversize carries size code", async () => {
    let err;
    try { await storage.supabaseRequest("/err-over", { maxResponseBytes: 32 }); } catch (e) { err = e; }
    assert.ok(err, "expected rejection");
    assert.equal(err.code, "SUPABASE_RESPONSE_TOO_LARGE");
  });

  await test("ordinary HTTP error under cap retains status and redacts", async () => {
    let err;
    try { await storage.supabaseRequest("/err-ordinary", { maxResponseBytes: 2048 }); } catch (e) { err = e; }
    assert.ok(err, "expected rejection");
    const msg = String(err.message || "");
    assert.match(msg, /failed \(500\)/i);
    assert.ok(!msg.includes("TOP_SECRET_ROW"));
    assert.ok(!msg.includes("TOP_SECRET_KEY"));
    assert.match(msg, /Failing row contains/);
  });

  await test("valid cap with stalled body times out within 200ms", async () => {
    let resolveClose;
    const closed = new Promise((r) => { resolveClose = r; });
    stallCloseResolve = resolveClose;
    const start = Date.now();
    let err;
    try { await storage.supabaseRequest("/stall", { maxResponseBytes: 1024 }); } catch (e) { err = e; }
    const elapsed = Date.now() - start;
    assert.ok(err, "expected timeout error");
    assert.match(err.message, /Supabase storage timed out after 200ms/);
    assert.ok(elapsed >= 100, `elapsed ${elapsed}ms too low`);
    assert.ok(elapsed < 2000, `elapsed ${elapsed}ms too high`);
    await withWatchdog(closed, 3000, "stall close");
  });

  await test("invalid caps reject before fetch with zero HTTP calls", async () => {
    const badCaps = [0, -1, NaN, 1.5, 16777217];
    const before = HITS.get("/never") || 0;
    for (const bad of badCaps) {
      let err;
      try { await storage.supabaseRequest("/never", { maxResponseBytes: bad }); } catch (e) { err = e; }
      assert.ok(err, `expected rejection for ${String(bad)}`);
    }
    assert.equal(HITS.get("/never") || 0, before);
  });

  await test("absent cap accepts body larger than tiny cap sample", async () => {
    let err;
    try { await storage.supabaseRequest("/unbounded", { maxResponseBytes: 10 }); } catch (e) { err = e; }
    assert.ok(err, "expected rejection for tiny cap");
    assert.equal(err.code, "SUPABASE_RESPONSE_TOO_LARGE");
    const result = await storage.supabaseRequest("/unbounded");
    assert.deepEqual(result, { ok: true, pad: "y".repeat(150) });
  });

  await test("204 and empty bounded return null", async () => {
    assert.equal(await storage.supabaseRequest("/empty204", { maxResponseBytes: 100 }), null);
    assert.equal(await storage.supabaseRequest("/empty200", { maxResponseBytes: 100 }), null);
  });

  server.closeAllConnections?.();
  await withWatchdog(new Promise((r) => server.close(r)), 3000, "server close");
  console.log(`PASS count: ${pass} FAIL count: ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

process.on("unhandledRejection", (e) => { console.error("UNHANDLED", e && e.code ? e.code : e && e.name); process.exit(1); });
process.on("uncaughtException", (e) => { console.error("UNCAUGHT", e && e.code ? e.code : e && e.name); process.exit(1); });

main().catch((e) => { console.error("MAIN_FAIL", e && e.code ? e.code : e && e.name); process.exit(1); });
