"use strict";
// Synthetic selector-boundary tests. No real storage, env, credentials or model.
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const { EventEmitter } = require("node:events");
const C = require("../lib/helmut/synthetik-500-production-command");
const R = require("../lib/helmut/provider-runtime-attestation");
const crypto = require("node:crypto");
const BEARER = "synthetic-single-u-bearer-0000000000000000000000000000";
const SHA = "a".repeat(40), HASH = "b".repeat(64), HOST = "synthetic-u.vercel.app";
const AT = "2026-10-06T03:00:00.000Z", END = "2026-10-06T03:20:00.000Z";
const selector = { operationId: "synthetik500-synthetic-u-0001", commandHash: HASH };
const filename = require("node:path").join(__dirname, "../lib/helmut/synthetik-500-u-prestage-entry.js");
const source = fs.readFileSync(filename, "utf8");
assert(!/["']Bearer [^"']+["']/.test(source), "production source must not include plaintext credentials");
const serverSource = fs.readFileSync(require("node:path").join(__dirname, "../server.js"), "utf8");
assert(serverSource.indexOf('url.searchParams.get("modus") === "synthetik500-u-vorlauf"')
  < serverSource.indexOf('url.searchParams.get("modus") === "provider-einzelprobe"'));
async function call(options = {}) {
  let loads = 0, calls = 0, admissionChecks = 0, clock = AT;
  const plan = { operationId: selector.operationId, productionCommit: SHA, startsAtUTC: AT, endsAtUTC: END,
    intents: [{ phase: "U" }] };
  const packet = { command: { mode: "U-prestage", units: [{ kind: "U" }], understanding: [{}], drafts: [],
    package: null, executor: null, native: null, slot: { plan } }, admission: {} };
  options.edit?.(packet);
  const testC = { exact: C.exact, utc: C.utc, requireThat: C.requireThat,
    validate: command => { assert.equal(command, packet.command); return { commandHash: HASH, plan }; },
    admission: (command, record, time, fresh) => {
      admissionChecks++; assert.equal(fresh, true); assert.equal(time, clock);
      if (options.badAdmission) throw Error("synthetic-admission-stop");
    } };
  const storage = { async loadSynthetik500ProductionCommand(op, hash) {
    loads++; assert.equal(op, selector.operationId); assert.equal(hash, HASH);
    if (options.afterLoad) clock = options.afterLoad;
    if (options.loadError) throw Error("private-secret-error");
    return packet;
  } };
  const adapter = { async productionStart(args) {
    calls++; assert.deepEqual(JSON.parse(JSON.stringify(args)), selector);
    if (options.dispatchError) throw Error("private-provider-error");
    return { state: "closed", operationId: selector.operationId, units: 1, expectedPositions: 0, profilesActivated: false };
  } };
  const module = { exports: {} };
  const dependencies = { "./synthetik-500-production-command": testC,
    "./provider-runtime-attestation": { verifyOperationBearer: (authorization, nonce, ms, expected) => {
      assert.equal(expected.expiresAtUTC, "2026-10-06T06:00:00.000Z");
      return R.verifyOperationBearer(authorization, nonce, ms, { ...expected,
        bearerSha256: crypto.createHash("sha256").update(BEARER).digest("hex") });
    } }, "./storage": storage, "./synthetik-500-production-adapter": adapter };
  vm.runInNewContext("(function(require,module,exports){" + source + "\n})", { Buffer, Date, process: { env: {} },
    setTimeout, clearTimeout }, { filename })(name => { assert(Object.hasOwn(dependencies, name)); return dependencies[name]; }, module, module.exports);
  const request = new EventEmitter(); request.pause = () => {};
  request.method = options.method || "POST";
  request.headers = { authorization: "Bearer " + BEARER, "content-type": "application/json",
    "x-helmut-root-nonce": "f107ed2f-60b2-4fa9-83d4-52f45d9dedd2", "x-helmut-root-admitted-at": AT,
    "x-helmut-root-deadline-at": END, "x-helmut-production-commit": SHA, "x-helmut-deployment-host": HOST,
    ...options.headers };
  const response = { code: null, writeHead(code) { this.code = code; }, end(text) { this.text = text; this.writableEnded = true; } };
  const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_URL: HOST, ...options.env };
  if (options.time) clock = options.time;
  const promise = module.exports.handleRequest(request, response,
    new URL("https://" + HOST + (options.path || "/api/cron/testnachweis-status") + (options.search || "?modus=synthetik500-u-vorlauf")),
    { jsonHeaders: extra => ({ "Cache-Control": "no-store", ...extra }), env, now: () => new Date(clock) });
  if (request.listenerCount("data")) {
    if (options.streamError) request.emit("error", Error("private-stream-error"));
    else { request.emit("data", Buffer.from(options.rawBody || JSON.stringify(options.body || selector))); request.emit("end"); }
  }
  await promise;
  assert(!response.text.includes("private-"));
  return { code: response.code, json: JSON.parse(response.text), loads, calls, admissionChecks };
}
(async () => {
  let groups = 0;
  const good = await call(); assert.equal(good.code, 200); assert.equal(good.calls, 1); assert.equal(good.loads, 1); groups++;
  for (const bad of [
    { method: "GET" }, { search: "?modus=synthetik500-u-vorlauf&extra=1" }, { path: "/wrong" },
    { headers: { authorization: "bad" } }, { headers: { "content-type": "text/plain" } },
    { headers: { "x-helmut-production-commit": "c".repeat(40) } }, { headers: { "x-helmut-deployment-host": "other.vercel.app" } },
    { headers: { "x-helmut-root-deadline-at": "2026-10-06T03:19:00.000Z" } },
    { env: { VERCEL_ENV: "preview" } }, { time: "2026-10-06T06:00:00.000Z" },
    { headers: { "content-length": "1025" } }, { rawBody: "{" }, { rawBody: "x".repeat(1025) },
    { body: { ...selector, command: {} } }, { streamError: true }
  ]) { const r = await call(bad); assert.notEqual(r.code, 200); assert.equal(r.loads, 0); assert.equal(r.calls, 0); } groups++;
  for (const edit of [
    p => p.command.mode = "D-R-500", p => p.command.units.push({ kind: "U" }),
    p => p.command.units[0].kind = "DR", p => p.command.understanding.push({}),
    p => p.command.slot.plan.intents.push({ phase: "U" }), p => p.command.slot.plan.intents[0].phase = "D",
    p => p.command.drafts.push({}), p => p.command.native = {}, p => p.command.package = {}, p => p.command.executor = {},
    p => p.command.slot.plan.productionCommit = "c".repeat(40), p => p.command.slot.plan.endsAtUTC = "2026-10-06T03:21:00.000Z"
  ]) { const r = await call({ edit }); assert.notEqual(r.code, 200); assert.equal(r.calls, 0); } groups++;
  for (const options of [{ badAdmission: true }, { loadError: true }, { afterLoad: END }]) {
    const r = await call(options); assert.equal(r.calls, 0); assert.equal(r.json.dispatchAttempted, false);
  } groups++;
  const unknown = await call({ dispatchError: true }); assert.equal(unknown.calls, 1);
  assert.equal(unknown.json.dispatchAttempted, true); assert.equal(unknown.code, 409); groups++;
  console.log("PASS single-U entry: " + groups + " targeted groups; synthetic only, zero real effects");
})().catch(error => { console.error(error); process.exitCode = 1; });
