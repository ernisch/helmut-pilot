"use strict";
// Synthetic transport semantics, with a deterministic test-only timer. This is
// not a wall-time, native database or full500 resource measurement.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const { EventEmitter } = require("node:events"), crypto = require("node:crypto");
const source = fs.readFileSync(0, "utf8"), ROOT = require("node:path").resolve(__dirname, "../..");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const requestHash = require(ROOT + "/lib/helmut/synthetik-500-kosten-admission").requestHash;
const tick = () => new Promise(resolve => setImmediate(resolve));
const selector = { operationId: "SYNTHETIC_OPERATION", commandHash: "SYNTHETIC_HASH" };
const body = JSON.stringify({ model: "gpt-5-mini-eu", input: "SYNTHETIC" });
function expected(index) { return { ...selector, index, journalState: "running", attemptStatus: "sent",
  reservationStatus: "reserviert", actualRequestHash: requestHash(body) }; }
function setup(index, readSenderClaim) {
  let now = 50, seq = 0;
  const timers = new Map(), https = { request: () => { throw Error("Unexpected real transport"); } };
  const G = { ROOT, sha, pinned() {}, LIMITS: { worstDelayMS: 19900, providerMS: 20000 } };
  const sandbox = { module: { exports: {} }, Buffer, queueMicrotask,
    setTimeout(fn, delay) { const id = ++seq; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id === "./contracts") return G;
      if (id === "node:https") return https;
      if (id === "node:perf_hooks") return { performance: { now: () => now } };
      return require(id);
    } };
  vm.runInNewContext(source, sandbox, { filename: "actual-rendered-local-provider.js" });
  const fixture = { index, scope: "INDEPENDENTLY_REVIEWED_LOCAL_PROVIDER_FIXTURE_NOT_MODEL_OUTPUT",
    reviewedMockOutputs: true, actualModelOutput: false, independentReview: {}, draftOutput: { draft: "SYNTHETIC" },
    reviewOutput: { review: "SYNTHETIC" }, mockUsage: { input_tokens: 1, output_tokens: 2 },
    responsesURL: "https://SYNTHETIC.invalid/responses", requestBodySHA256: sha(body), reviewRequestBodySHA256: sha(body) };
  const phases = [], installed = sandbox.module.exports.install({ fixture, index, mode: "combined500", selector, readSenderClaim, providerPhases: phases });
  let replies = 0, response;
  const request = () => {
    const req = https.request(fixture.responsesURL, { method: "POST", timeout: 20000 }, reply => {
      replies++; assert.equal(reply.statusCode, 200); let data = "";
      reply.on("data", b => data += b); reply.on("end", () => { response = JSON.parse(data); });
    });
    req.write(body); return req;
  };
  return { request, installed, phases, timers, fixture, setNow(v) { now = v; },
    fireEarly() { const [id, t] = timers.entries().next().value; timers.delete(id); t.fn(); },
    replies: () => replies, response: () => response };
}
async function main() {
  let groups = 0;
  for (const index of [0, 499]) {
    let release, reads = 0;
    const c = setup(index, async () => { reads++; return await new Promise(r => release = r); });
    const req = c.request(); assert.equal(req.end(), req); assert.equal(c.installed.pending(), 1);
    assert.equal(c.phases.length, 0); assert.equal(c.timers.size, 0);
    c.setNow(750); release(expected(index)); await tick();
    assert.equal(reads, 1); assert.equal(c.phases[0].beginMS, 50);
    assert.equal(c.phases[0].delayMS, 19900); assert.equal([...c.timers.values()][0].at, 19950);
    c.setNow(19949); c.fireEarly(); assert.equal(c.replies(), 0); assert.equal(c.installed.pending(), 1);
    c.setNow(19950); c.fireEarly(); assert.equal(c.replies(), 1); assert.equal(c.installed.pending(), 0);
    assert.equal(c.phases[0].actualDelayMS, 19900); assert.equal(c.phases[0].mockResponseDelivered, true);
    assert.equal(c.response().model, "gpt-5-mini-eu"); assert.equal(c.response().usage.input_tokens, 1);
    assert.deepEqual(JSON.parse(c.response().output[0].content[0].text), c.fixture.draftOutput);
    const r = c.request(); r.end(); c.setNow(20900); release(expected(index)); await tick();
    c.setNow(39850); c.fireEarly(); assert.equal(c.replies(), 2); assert.equal(c.installed.pending(), 0);
    assert.equal(c.phases[1].phase, "R");
    assert.throws(() => c.request(), /No third call/); c.installed.restore(); groups++;
  }
  for (const field of Object.keys(expected(7))) {
    const c = setup(7, async () => ({ ...expected(7), [field]: "WRONG_SYNTHETIC_VALUE" }));
    const errors = [], req = c.request(); req.on("error", e => errors.push(e)); req.end(); await tick();
    assert.equal(errors.length, 1, field); assert.equal(c.replies(), 0); assert.equal(c.timers.size, 0);
    assert.equal(c.installed.pending(), 0); c.installed.restore(); groups++;
  }
  const original = Error("SYNTHETIC_ORIGINAL_ERROR");
  {
    const c = setup(4, async () => { throw original; }), errors = [], req = c.request();
    req.on("error", e => errors.push(e)); req.end(); await tick();
    assert.equal(errors.length, 1); assert.equal(errors[0], original);
    req.destroy(original); await tick(); assert.equal(errors.length, 1);
    assert.equal(c.installed.pending(), 0); assert.equal(c.replies(), 0); c.installed.restore(); groups++;
  }
  for (const outcome of ["resolve", "reject"]) {
    let resolve, reject;
    const c = setup(4, () => new Promise((a, b) => { resolve = a; reject = b; })), errors = [], req = c.request();
    req.on("error", e => errors.push(e)); req.end(); assert.equal(c.installed.pending(), 1);
    req.destroy(original); req.destroy(original); assert.equal(c.installed.pending(), 0);
    if (outcome === "resolve") resolve(expected(4)); else reject(Error("LATE_SYNTHETIC_ERROR"));
    await tick(); assert.deepEqual(errors, [original]); assert.equal(c.replies(), 0); assert.equal(c.timers.size, 0);
    c.installed.restore(); groups++;
  }
  {
    const c = setup(0, async () => expected(0)), req = c.request(); req.end(); await tick();
    assert.equal(c.timers.size, 1); req.destroy(); assert.equal(c.timers.size, 0);
    assert.equal(c.installed.pending(), 0); assert.equal(c.replies(), 0); c.installed.restore(); groups++;
  }
  {
    let reads = 0; const c = setup(1, async () => { reads++; return expected(1); });
    const req = c.request(); req.destroy(); req.end(); await tick();
    assert.equal(reads, 0); assert.equal(c.installed.pending(), 0); assert.equal(c.timers.size, 0);
    c.installed.restore(); groups++;
  }
  console.log(JSON.stringify({ pass: true, syntheticTransportGroups: groups, realTimeProof: false,
    nativeDatabaseProof: false, full500Runs: 0 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
