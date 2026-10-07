"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs");
const W = require("../lib/helmut/dip-resolver-runtime-witness"), V = require("../lib/helmut/vorgang-identity");
const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_runtimeFixture" };
function call({ method = "GET", path = W.PATH, requestHeaders = { "x-helmut-production-commit": env.VERCEL_GIT_COMMIT_SHA }, runtime = env, server = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url: path, headers: requestHeaders };
    const res = { headersSent: false, writeHead(status, headers) { Object.assign(this, { status, headers, headersSent: true }); },
      end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) }); } };
    if (server) server(req, res);
    else W.handleRequest(req, res, new URL(path, "https://fixture.invalid"), { jsonHeaders: x => x, env: runtime }).catch(reject);
  });
}
async function main() {
  const savedEnv = { ...process.env }, oldFetch = global.fetch, originals = [];
  let forbidden = 0;
  const deny = () => { forbidden++; throw Error("account/storage/model/network forbidden"); };
  try {
    for (const module of [require("../lib/helmut/accounts"), require("../lib/helmut/storage"), require("../lib/helmut/ai")]) {
      for (const key of Object.keys(module)) if (typeof module[key] === "function") {
        originals.push([module, key, module[key]]); module[key] = deny;
      }
    }
    global.fetch = deny;
    const success = await call();
    assert.equal(success.status, 200); assert.equal(success.body.ok, true);
    assert.equal(Object.keys(success.body.checks).length, 9);
    assert.ok(Object.values(success.body.checks).every(x => x === true));
    assert.equal(success.body.commit, env.VERCEL_GIT_COMMIT_SHA);
    assert.equal(success.body.deploymentId, env.VERCEL_DEPLOYMENT_ID);
    assert.equal(success.body.syntheticFixturesOnly, true);
    assert.equal(success.body.productionSourceVersionsInspected, false);
    assert.equal(success.body.all500InputAcceptance, false);
    assert.equal(success.headers["Cache-Control"], "no-store");
    assert.ok(Buffer.byteLength(JSON.stringify(success.body)) < 4096);
    for (const name of ["dip-quellfelder", "dip-vorgangsbezug", "vorgang-identity"]) assert.equal(success.body.codeHashes[name],
      crypto.createHash("sha256").update(fs.readFileSync(require.resolve("../lib/helmut/" + name))).digest("hex"));
    console.log("PASS nine real code probes and source bytes; no real input acceptance");
    assert.equal((await call({ method: "POST" })).status, 405);
    assert.equal((await call({ path: W.PATH + "?source=private" })).status, 400);
    assert.equal((await call({ path: "/other" })).status, 400);
    assert.equal((await call({ requestHeaders: {} })).status, 409);
    assert.equal((await call({ requestHeaders: { "x-helmut-production-commit": "b".repeat(40) } })).status, 409);
    for (const runtime of [{ ...env, VERCEL_ENV: "preview" }, { ...env, VERCEL_GIT_COMMIT_SHA: "bad" },
      { ...env, VERCEL_DEPLOYMENT_ID: "bad" }]) assert.equal((await call({ runtime })).status, 503);
    console.log("PASS fixed GET and strict current Production identity; caller data rejected");
    const oldCompare = V.docsShareEvent;
    try {
      V.docsShareEvent = () => ({ gleich: true, grund: "regressed" });
      const r = await call(); assert.equal(r.status, 503); assert.equal(r.body.ok, false);
    } finally { V.docsShareEvent = oldCompare; }
    const oldRead = fs.readFileSync;
    try {
      fs.readFileSync = () => { throw Error("FICTIONAL PRIVATE ERROR CONTENT"); };
      const r = await call(); assert.equal(r.status, 503);
      assert.deepEqual(r.body, { ok: false, reason: "bounded-code-probe-unavailable" });
    } finally { fs.readFileSync = oldRead; }
    console.log("PASS regression and inaccessible source bytes fail closed without leaking errors");
    const server = require("../server"); Object.assign(process.env, env);
    assert.equal((await call({ server })).status, 200);
    assert.equal((await call({ server, method: "POST" })).status, 405);
    assert.equal(forbidden, 0);
    console.log("PASS real early server dispatch; zero account/storage/AI/network calls");
    console.log("4/4 groups passed; offline, no Production request.");
  } finally {
    for (const [module, key, value] of originals) module[key] = value;
    global.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(savedEnv, key)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
