"use strict";
// Isolated transport/clock fixtures only: no real secret, HTTPS or paid caller.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { performance } = require("node:perf_hooks");
const https = require("node:https"), cp = require("node:child_process");
let CLI, C, EU;
const originals = { https: https.request, now: Date.now,
  monotonic: Object.getOwnPropertyDescriptor(performance, "now"), timeout: global.setTimeout,
  clearTimeout: global.clearTimeout, fetch: global.fetch, spawn: cp.spawn };
let wall, monotonic, requests, timers, mode, constructElapsed, constructWallShift, responseElapsed, groups = 0;
const reset = (next = "ok") => {
  wall = Date.parse("2026-10-13T14:30:00.000Z"); monotonic = 1000;
  requests = []; timers = []; mode = next; constructElapsed = constructWallShift = responseElapsed = 0;
};
const advance = ms => { wall += ms; monotonic += ms; };
const command = (remaining = 600000, eu = true) => ({ version: C.DIRECT_VERSION, mode: "D-R-500",
  slot: { plan: { operationId: "synthetik500-fictional-observer",
    endsAtUTC: new Date(wall + remaining).toISOString(),
    routeContract: { version: eu ? EU.ROUTE_VERSION : "fictional-legacy-route",
      serviceContractHash: eu ? EU.HASH : "fictional-legacy-contract",
      route: { deploymentHost: "helmut-fixture.vercel.app" } } } } });
const test = async (name, fn) => { reset(); await fn(); groups++; console.log("PASS " + name); };
function transport(url, options, callback) {
  const req = new EventEmitter(), record = { url, options, sent: 0, destroyed: 0 };
  requests.push(record); advance(constructElapsed); wall += constructWallShift;
  req.destroy = () => { record.destroyed++; };
  req.end = body => {
    record.sent++; record.body = body;
    queueMicrotask(() => {
      if (mode === "error") return req.emit("error", Error("fictional-transport-error"));
      if (mode === "deadline") { advance(timers[0].ms); return timers[0].fn(); }
      advance(responseElapsed);
      const res = new EventEmitter(); res.statusCode = mode === "redirect" ? 302 : 200;
      res.destroy = () => { record.responseDestroyed = true; }; callback(res);
      if (mode === "late-success") advance(120000);
      if (mode === "backward-wall") { advance(120000); wall -= 600000; }
      const raw = Buffer.from('{"ok":true,"result":{"state":"running"}}');
      if (mode === "slow-body") {
        advance(80000); res.emit("data", raw.subarray(0, 10));
        advance(30000); res.emit("data", raw.subarray(10));
        advance(10001);
      } else res.emit("data", mode === "invalid" ? Buffer.from("invalid") : raw);
      res.emit("end");
    });
  };
  return req;
}
async function main() {
  const originalEnv = process.env;
  let originalValidate;
  try {
    process.env = { HELMUT_ADMIN_SECRET: "fictional-observer-admin" };
    CLI = require("./synthetik-500-direct");
    C = require("../lib/helmut/synthetik-500-production-command");
    EU = require("../lib/helmut/synthetik-500-eu-service-contract");
    originalValidate = C.validate;
    C.validate = () => {}; // This test isolates transport, not full Source admission.
    Date.now = () => wall;
    Object.defineProperty(performance, "now", { configurable: true, value: () => monotonic });
    https.request = transport;
    global.fetch = cp.spawn = () => { throw Error("no fallback or external call"); };
    global.setTimeout = (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; };
    global.clearTimeout = timer => { if (timer) timer.cleared = true; };
    await test("EU start and next observe at most 120s with unchanged endpoint/header/selector", async () => {
      for (const action of ["start", "next"]) {
        reset(); const input = command(); assert.equal((await CLI.remote(input, action)).ok, true);
        assert.equal(timers.length, 1); assert.equal(timers[0].ms, 120000);
        assert.equal(requests.length, 1); assert.equal(requests[0].sent, 1);
        assert.equal(requests[0].url, "https://helmut-fixture.vercel.app/api/ops/synthetik500-direkt");
        assert.equal(requests[0].options.method, "POST");
        assert.equal(requests[0].options.headers.Authorization, "Bearer fictional-observer-admin");
        assert.deepEqual(Object.keys(JSON.parse(requests[0].body)).sort(), ["action", "commandHash", "operationId"]);
      }
    });
    await test("sending budget clips to real remaining plan time and construction cannot extend it", async () => {
      const input = command(90000); constructElapsed = 10000;
      await CLI.remote(input, "next"); assert.equal(timers[0].ms, 80000);
      assert.equal(timers.length, 1); assert.equal(requests[0].sent, 1);
      for (const shift of [20000, -20000]) {
        reset(); const shifted = command(90000); constructElapsed = 10000; constructWallShift = shift;
        await CLI.remote(shifted, "next"); assert.equal(timers[0].ms, shift > 0 ? 60000 : 80000);
      }
    });
    await test("one whole-response deadline accepts only before the full or clipped boundary", async () => {
      responseElapsed = 119999; await CLI.remote(command(), "start"); assert.equal(timers[0].cleared, true);
      reset(); responseElapsed = 120000;
      await assert.rejects(CLI.remote(command(), "start"), /rejected-or-unknown/);
      reset(); const before = command(50000); constructElapsed = 10000; responseElapsed = 39999;
      await CLI.remote(before, "next"); assert.equal(timers[0].ms, 40000); assert.equal(timers[0].cleared, true);
      reset(); const clipped = command(50000); constructElapsed = 10000; responseElapsed = 40000;
      await assert.rejects(CLI.remote(clipped, "next"), /rejected-or-unknown/);
      assert.equal(timers[0].ms, 40000); assert.equal(requests.length, 1); assert.equal(requests[0].sent, 1);
      assert.equal(requests[0].destroyed, 1);
    });
    await test("expired/equal/invalid plan end rejects before HTTPS creation", async () => {
      for (const remaining of [0, -1]) for (const action of ["start", "next"]) {
        reset(); await assert.rejects(CLI.remote(command(remaining), action), /observer-window-closed/);
        assert.equal(requests.length, 0); assert.equal(timers.length, 0);
      }
      reset(); const input = command(); input.slot.plan.endsAtUTC = "invalid";
      await assert.rejects(CLI.remote(input, "start"), /observer-window-closed/); assert.equal(requests.length, 0);
    });
    await test("plan expires during construction: no request body sent and no retry", async () => {
      const input = command(1000); constructElapsed = 1000;
      await assert.rejects(CLI.remote(input, "start"), /rejected-or-unknown/);
      assert.equal(requests.length, 1); assert.equal(requests[0].sent, 0);
      assert.equal(requests[0].destroyed, 1); assert.equal(timers.length, 0);
    });
    await test("whole-response deadline rejects timer expiry and late callbacks without retry", async () => {
      for (const failure of ["deadline", "late-success", "backward-wall", "slow-body", "error", "redirect", "invalid"]) {
        reset(failure); await assert.rejects(CLI.remote(command(), "next"), /rejected-or-unknown/);
        assert.equal(requests.length, 1); assert.equal(requests[0].sent, 1);
        assert.equal(requests[0].destroyed, 1); assert.equal(timers.length, 1);
      }
    });
    await test("EU stop/status/export retain 60s and legacy actions retain 180s", async () => {
      for (const action of ["stop", "status", "export"]) {
        reset(); await CLI.remote(command(), action, action === "export" ? null : undefined);
        assert.equal(timers[0].ms, 60000);
      }
      for (const action of ["start", "next", "stop", "status", "export"]) {
        reset(); await CLI.remote(command(600000, false), action, action === "export" ? null : undefined);
        assert.equal(timers[0].ms, 180000);
      }
    });
    console.log(JSON.stringify({ groups, externalNetwork: false, providerCalls: 0, realCredentialsRead: false,
      SourceAdmissionQualifiedByThisTest: false, serverDeadlinesChanged: false }));
  } finally {
    if (originalValidate) C.validate = originalValidate;
    https.request = originals.https; Date.now = originals.now;
    if (originals.monotonic) Object.defineProperty(performance, "now", originals.monotonic); else delete performance.now;
    global.setTimeout = originals.timeout; global.clearTimeout = originals.clearTimeout;
    global.fetch = originals.fetch; cp.spawn = originals.spawn; process.env = originalEnv;
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
