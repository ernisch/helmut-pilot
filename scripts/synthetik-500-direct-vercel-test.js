"use strict";
// Only HTTPS stubs: no real identity, token mint, Vercel or Production request.
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const CLI = require("./synthetik-500-direct"), C = require("../lib/helmut/synthetik-500-production-command");
const V = require("./synthetik-500-direct-vercel"), https = require("node:https"), cp = require("node:child_process");
const oldHttps = https.request, oldFetch = global.fetch, oldSpawn = cp.spawn, oldTimeout = global.setTimeout, oldValidate = C.validate, env = { ...process.env };
let requests = [], mode = "ok", deadline, groups = 0, forbidden = 0;
const noExtra = () => { forbidden++; throw Error("no auth API subprocess or fallback"); };
global.fetch = cp.spawn = noExtra;
global.setTimeout = (fn, ms) => { assert.equal(ms, 180000); deadline = fn; return oldTimeout(fn, 5000); };
https.request = (url, options, cb) => {
  const request = new EventEmitter(), r = { url, options, destroyed: 0 }; requests.push(r);
  request.destroy = () => { r.destroyed++; };
  request.end = body => {
    r.body = body;
    setImmediate(() => {
      if (mode === "deadline") return deadline();
      if (mode === "error") return request.emit("error", Error("FICTIONAL SECRET ERROR"));
      const res = new EventEmitter(); res.statusCode = mode === "redirect" ? 302 : 200; res.destroy = () => {};
      cb(res);
      res.emit("data", mode === "utf8" ? Buffer.from([0xff]) : mode === "oversize" ? Buffer.alloc(16 * 1024 * 1024 + 1)
        : Buffer.from(mode === "html" ? "SSO login" : '{"ok":true,"result":{"state":"installed"}}'));
      res.emit("end");
    });
  };
  return request;
};
const test = async (name, fn) => { await fn(); groups++; console.log("PASS " + name); };
const command = { version: C.DIRECT_VERSION, mode: "D-R-500", slot: { plan: { operationId: "synthetik500-fictional-transport",
  routeContract: { route: { deploymentHost: "helmut-fixture.vercel.app" } } } } };
async function main() {
  try {
    C.validate = () => {}; // actual complete500 contract covered by direct suite; boundary stub only here.
    process.env.HELMUT_ADMIN_SECRET = "fictional-admin";
    process.env.VERCEL_OIDC_TOKEN = "fictional-short-lived-oidc";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "fictional-existing-bypass";
    await test("explicit mutually exclusive remote identity modes; preparation and installation reject", () => {
      assert.equal(CLI.args(["status", "--command", "/tmp/c", "--out", "/tmp/o", "--vercel-oidc"]).vercelAuth, "oidc");
      for (const argv of [["prepare", "--input", "/tmp/i", "--out", "/tmp/o", "--vercel-oidc"],
        ["install", "--command", "/tmp/c", "--admission", "/tmp/a", "--scharf", "--vercel-bypass"],
        ["status", "--command", "/tmp/c", "--out", "/tmp/o", "--vercel-oidc", "--vercel-bypass"], ["status", "--vercel-curl"]]) assert.throws(() => CLI.args(argv));
    });
    await test("OIDC is an origin-bound existing header plus mandatory separate Helmut bearer and selector", async () => {
      assert.equal((await CLI.remote(command, "status", undefined, { vercelAuth: "oidc" })).ok, true);
      const r = requests.at(-1);
      assert.equal(r.url, "https://helmut-fixture.vercel.app/api/ops/synthetik500-direkt"); assert.equal(r.options.method, "POST");
      assert.equal(r.options.headers["x-vercel-trusted-oidc-idp-token"], process.env.VERCEL_OIDC_TOKEN);
      assert.equal(r.options.headers.Authorization, "Bearer fictional-admin");
      assert.equal(r.options.headers["x-vercel-protection-bypass"], undefined);
      assert.equal(r.options.headers["x-vercel-oidc-token"], undefined);
      assert.equal(JSON.parse(r.body).action, "status"); assert.equal(Object.keys(JSON.parse(r.body)).length, 3);
    });
    await test("existing bypass is explicit; other available auth is never automatically selected", async () => {
      await CLI.remote(command, "status", undefined, { vercelAuth: "bypass" });
      assert.equal(requests.at(-1).options.headers["x-vercel-protection-bypass"], process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      assert.equal(requests.at(-1).options.headers["x-vercel-trusted-oidc-idp-token"], undefined);
      await CLI.remote(command, "status");
      assert.equal(requests.at(-1).options.headers["x-vercel-protection-bypass"], undefined);
      assert.equal(requests.at(-1).options.headers["x-vercel-trusted-oidc-idp-token"], undefined);
    });
    await test("missing identity header injection overflow or Helmut auth rejects before HTTPS", async () => {
      const n = requests.length;
      delete process.env.VERCEL_OIDC_TOKEN; await assert.rejects(CLI.remote(command, "status", undefined, { vercelAuth: "oidc" }));
      for (const value of ["", "x\nX: y", "x".repeat(16385)]) assert.throws(() => V.headers("oidc", { VERCEL_OIDC_TOKEN: value }));
      assert.throws(() => V.headers("other", {}));
      delete process.env.HELMUT_ADMIN_SECRET; await assert.rejects(CLI.remote(command, "status", undefined, { vercelAuth: "bypass" }));
      process.env.HELMUT_ADMIN_SECRET = "fictional-admin"; process.env.VERCEL_OIDC_TOKEN = "fictional-short-lived-oidc";
      assert.equal(requests.length, n);
    });
    await test("login redirect invalid body overflow transport failure and whole-response deadline never retry or refresh", async () => {
      for (const failure of ["html", "redirect", "utf8", "oversize", "error", "deadline"]) {
        mode = failure; const n = requests.length;
        await assert.rejects(CLI.remote(command, "status", undefined, { vercelAuth: "oidc" }), /rejected-or-unknown/);
        assert.equal(requests.length, n + 1);
      }
      assert.equal(forbidden, 0); mode = "ok";
    });
    console.log(JSON.stringify({ groups, externalNetwork: false, modelCalls: 0, protectionChanged: false }));
  } finally {
    https.request = oldHttps; global.fetch = oldFetch; cp.spawn = oldSpawn; global.setTimeout = oldTimeout; C.validate = oldValidate;
    for (const k of Object.keys(process.env)) if (!Object.hasOwn(env, k)) delete process.env[k]; Object.assign(process.env, env);
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
