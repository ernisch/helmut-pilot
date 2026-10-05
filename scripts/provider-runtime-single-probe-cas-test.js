"use strict";

// Echter Speicher/CAS-Pfad in getrennten Prozessen, nur PostgREST-Transport
// lokal simuliert. Keine gemeinsame Promise-Queue und kein Anbieteraufruf.
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const P = require("../lib/helmut/provider-runtime-single-probe");

async function worker() {
  const base = process.env.HELMUT_TEST_AUTH_CAS_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-synthetic-cas-token";
  process.env.HELMUT_SUPABASE_AUTH_STORE_ID = "main-auth";
  const storage = require("../lib/helmut/storage");
  const f = require("./provider-runtime-single-probe-test").fixture();
  f.deps.storage = { ...storage, leseLlmTageszaehler: f.deps.storage.leseLlmTageszaehler };
  let sends = 0;
  f.deps.requestText = async () => {
    sends++;
    await storage.mutateAuthStore(auth => {
      assert.ok(auth[P.KEY][f.deps.operationAuth.operationNonce]);
      auth.llmUsage.push({ id: "cas-receipt", runId: f.deps.operationAuth.runId,
        callType: "pre500-provider-probe", model: "gpt-5-mini", promptTokens: 5,
        completionTokens: 2, totalTokens: 7, success: true, durationMs: 1,
        estimatedCost: 0.000005, createdAt: "2026-10-05T03:00:00.000Z" });
    });
    return "OK";
  };
  const r = await f.invoke();
  console.log(JSON.stringify({ status: r.status, consumed: r.body.consumed, sends }));
}

function child(base) {
  const env = { ...process.env, HELMUT_TEST_AUTH_CAS_URL: base };
  for (const name of require("./lokaler-netzschutz").PRODUCTION_KENNUNGEN) delete env[name];
  delete env.HELMUT_V3_STORE;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, "lokal.js"), __filename, "worker"],
      { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    proc.stdout.on("data", chunk => { output += chunk; });
    proc.stderr.resume();
    const timer = setTimeout(() => { proc.kill(); reject(new Error("CAS worker timeout")); }, 15000);
    proc.once("error", error => { clearTimeout(timer); reject(error); });
    proc.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("CAS worker failed: " + code));
      try { resolve(JSON.parse(output.trim())); } catch (error) { reject(error); }
    });
  });
}

async function run(fixture) {
  for (const lost of [false, true]) {
    let blob = structuredClone(fixture().auth), patches = 0, conflicts = 0;
    const pending = [];
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, "http://127.0.0.1");
        assert.equal(u.pathname, "/rest/v1/helmut_store");
        res.setHeader("Content-Type", "application/json");
        if (req.method === "GET") return res.end(JSON.stringify([{ data: blob }]));
        assert.equal(req.method, "PATCH");
        assert.equal(u.searchParams.get("id"), "eq.main-auth");
        assert.match(req.headers.prefer, /return=representation/);
        let body = "";
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body).data;
        const apply = () => {
          const expected = blob._authStoreRevision ? "eq." + blob._authStoreRevision : "is.null";
          if (u.searchParams.get("data->>_authStoreRevision") !== expected) {
            conflicts++; return res.end("[]");
          }
          blob = data;
          if (lost) return req.socket.destroy(); // persisted claim, lost acknowledgement
          res.end('[{"id":"main-auth"}]');
        };
        patches++;
        if (!lost && patches <= 2) {
          pending.push(apply);
          if (pending.length === 2) pending.splice(0).forEach(fn => fn());
        } else apply();
      } catch (_) { res.statusCode = 500; res.end("{}"); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const base = "http://127.0.0.1:" + server.address().port;
      if (!lost) {
        const results = await Promise.all([child(base), child(base)]);
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
        assert.equal(results.reduce((sum, r) => sum + r.sends, 0), 1);
        assert.equal(conflicts, 1, "two independent queues read the same revision");
        assert.equal(blob.llmUsage.length, 1);
      } else {
        assert.deepEqual(await child(base), { status: 503, consumed: null, sends: 0 });
        assert.equal(patches, 1, "unknown commit is never retried");
        const replay = await child(base);
        assert.deepEqual(replay, { status: 409, consumed: true, sends: 0 });
        assert.equal(blob.llmUsage.length, 0);
        assert.equal(patches, 1, "replay must not write the consumed claim again");
      }
      assert.equal(Object.keys(blob[P.KEY]).length, 1);
      assert.deepEqual(blob.historic, { kept: true });
      console.log("PASS real storage independent queues: " + (lost ? "unknown commit, no send/retry" : "forced CAS conflict, one send"));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

module.exports = { run };
if (require.main === module && process.argv[2] === "worker") worker().catch(() => { process.exitCode = 1; });
