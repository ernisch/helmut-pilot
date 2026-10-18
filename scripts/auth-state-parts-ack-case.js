"use strict";

// Synthetic receipt regression: inert on import, one explicit case per process.
// No DB, network, child process, activation, resource run, original payload or
// authority access exists here.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const repo = require("node:path").resolve(__dirname, "..");
const CASES = Object.freeze({
  "appended-old-head": { append: true, sameHead: true, reject: true },
  "unchanged-new-head": { append: false, sameHead: false, reject: true },
  "appended-new-head": { append: true, sameHead: false, reject: false },
  "unchanged-old-head": { append: false, sameHead: true, reject: false }
});
const clone = value => JSON.parse(JSON.stringify(value));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function runCase({ mode, testcase, localMockOnly }) {
  assert.equal(localMockOnly, true, "explicit local mock boundary required");
  assert(["parts", "usage"].includes(mode), "unknown mock mode");
  assert(Object.hasOwn(CASES, testcase), "unknown ACK case");
  assert(!process.env.VERCEL, "local mock must not run as a Vercel runtime");
  const test = CASES[testcase];
  const envKeys = ["SUPABASE_URL", "HELMUT_LLM_USAGE_STORAGE", "HELMUT_AUTH_STATE_STORAGE"];
  const priorEnv = new Map(envKeys.map(k => [k, process.env[k]]));
  const previousFetch = global.fetch;
  let networkAttempts = 0, readRequests = 0, writeRequests = 0;
  const requestPaths = [];
  global.fetch = async () => { networkAttempts++; throw Error("MOCK_ONLY_NETWORK_FORBIDDEN"); };
  Object.assign(process.env, {
    SUPABASE_URL: "http://127.0.0.1:19401",
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1"
  });
  if (mode === "parts") process.env.HELMUT_AUTH_STATE_STORAGE = "merkle-auth-v1";
  else delete process.env.HELMUT_AUTH_STATE_STORAGE;
  try {
    const U = require(repo + "/lib/helmut/llm-usage-atomic.js");
    const Parts = require(repo + "/lib/helmut/auth-state-parts.js");
    const EU = require(repo + "/lib/helmut/synthetik-500-eu-service-contract.js");
    assert.equal(U.enabled(), true);
    assert.equal(Parts.enabled(), mode === "parts");
    const rowId = "main-auth", target = "http://127.0.0.1:19401|main-auth";
    const proof = {
      generation: "11111111-1111-4111-8111-111111111111", count: 0,
      head: "1".repeat(64), originalHash: "2".repeat(64)
    };
    const original = {
      _authStoreRevision: "22222222-2222-4222-8222-222222222222",
      testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH },
      llmUsage: [], localAckDiagnostic: { before: true }
    };
    const state = {
      version: Parts.VERSION,
      generation: "33333333-3333-4333-8333-333333333333",
      root: Parts.build(original).root, originalHash: "3".repeat(64)
    };
    const prefix = "/rest/v1/rpc/helmut_auth_" + (mode === "parts" ? "state" : "usage");
    let sentWrite;
    async function request(path, options) {
      requestPaths.push(path);
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      if (path === prefix + (mode === "parts" ? "_graph_read_v1" : "_read_v1")) {
        readRequests++;
        assert.deepEqual(body, { id: rowId });
        return mode === "parts" ? {
          data: { _authStoreRevision: original._authStoreRevision, llmUsage: clone(original.llmUsage) },
          graph: Parts.build(original), state: clone(state), proof: clone(proof)
        } : { data: clone(original), proof: clone(proof) };
      }
      assert.equal(path, prefix + "_cas_v1", "no additional transport path allowed");
      writeRequests++;
      assert.equal(writeRequests, 1, "never retry a malformed or unknown ACK");
      sentWrite = body;
      assert.equal(body.id, rowId);
      assert.equal(body.expectedRevision, original._authStoreRevision);
      assert.deepEqual(body.expectedProof, proof);
      assert.equal(body.additions.length, test.append ? 1 : 0);
      const revision = mode === "parts" ? body.revision : body.data._authStoreRevision;
      assert.match(revision, /^[a-f0-9-]{36}$/);
      assert.notEqual(revision, original._authStoreRevision);
      if (mode === "parts") assert.deepEqual(body.expectedState, state);
      const nextProof = { ...proof, count: proof.count + body.additions.length,
        head: test.sameHead ? proof.head : "4".repeat(64) };
      return [{ id: rowId, revision, proof: nextProof,
        ...(mode === "parts" ? { state: { ...state, root: body.root } } : {}) }];
    }
    const a = await U.read({ request, rowId, target });
    const record = {
      id: "local-ack-mock-" + mode + "-" + testcase,
      createdAt: "2026-10-18T00:00:00.000Z", model: "none",
      callType: "local-ack-contract-mock", estimatedCost: 0,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      success: false, keinAufruf: true
    };
    a.localAckDiagnostic = { testcase, mode, after: true };
    if (test.append) a.llmUsage = [record, ...a.llmUsage];
    let accepted;
    if (test.reject) {
      await assert.rejects(U.write(a, { request, rowId, target }), {
        code: "ATOMIC_USAGE_WRITE_UNCONFIRMED"
      });
      assert.throws(() => U.receipt(record, a), { code: "ATOMIC_USAGE_RECEIPT_UNCONFIRMED" });
      assert.equal(U.confirmed(record), false);
      assert.equal(U.confirmed({ ...record, _ablage: { blob: true } }), false);
    } else {
      accepted = await U.write(a, { request, rowId, target });
      assert.deepEqual(accepted.localAckDiagnostic, { testcase, mode, after: true });
      assert.equal(accepted.llmUsage.length, test.append ? 1 : 0);
      if (test.append) {
        const receipt = U.receipt(record, a);
        assert.equal(U.confirmed(receipt), true);
        assert.equal(receipt._ablage.blob, false);
        assert.equal(receipt.id, record.id);
        assert.equal(receipt.estimatedCost, 0);
      } else {
        assert.throws(() => U.receipt(record, a), { code: "ATOMIC_USAGE_RECEIPT_UNCONFIRMED" });
        assert.equal(U.confirmed(record), false);
      }
    }
    assert(sentWrite, "one mocked write must have been observed");
    assert.equal(readRequests, 1);
    assert.equal(writeRequests, 1);
    assert.equal(networkAttempts, 0);
    return {
      scope: "ISOLATED_NODE_LOCAL_ACK_MOCK_ONLY_NO_NATIVE_DATABASE",
      pass: true, mode, testcase, expectedRejection: test.reject,
      readRequests, writeRequests, networkAttempts, requestPaths,
      sourcePins: ["lib/helmut/llm-usage-atomic.js", "lib/helmut/auth-state-parts.js",
        "lib/helmut/synthetik-500-eu-service-contract.js"].map(p => {
        const bytes = fs.readFileSync(repo + "/" + p);
        return { path: repo + "/" + p, bytes: bytes.length, sha256: sha(bytes) };
      }),
      nativeDB: false, subprocesses: false, activation: false,
      syntheticProfiles: 0, full500: false, GOClaimed: false,
      paidProviderCalls: 0, production: false
    };
  } finally {
    for (const [key, value] of priorEnv) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (previousFetch === undefined) delete global.fetch; else global.fetch = previousFetch;
  }
}

async function main(argv) {
  assert.equal(argv.length, 5, "usage: --local-mock-only --mode parts|usage --case CASE");
  assert.equal(argv[0], "--local-mock-only");
  assert.equal(argv[1], "--mode");
  assert.equal(argv[3], "--case");
  const result = await runCase({ localMockOnly: true, mode: argv[2], testcase: argv[4] });
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  process.stderr.write(JSON.stringify({ pass: false, scope: "LOCAL_ACK_MOCK_ONLY",
    error: error.name, code: error.code || null, message: String(error.message).slice(0, 240) }) + "\n");
  process.exitCode = 1;
});
module.exports = { CASES, runCase, main };
