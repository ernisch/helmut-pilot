"use strict";

// Nur die neue Root-Authbindung; keine privaten Credentials oder alten Suiten.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../lib/helmut/provider-runtime-attestation.js"), "utf8");
const binding = Object.fromEntries(["operationNonce", "expiresAtUTC", "bearerSha256"].map(key => {
  const matches = [...source.matchAll(new RegExp(key + ': "([^"\\n]+)"', "g"))];
  assert.equal(matches.length, 1, "exactly one fixed production verifier field");
  return [key, matches[0][1]];
}));
const NONCE = binding.operationNonce;
const EXPIRES = binding.expiresAtUTC;
const ROOT_HASH = binding.bearerSha256;
const OLD_NONCE = "d4929cb2-83fb-465b-b038-c0eec3254275";
assert.match(NONCE, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
assert.match(ROOT_HASH, /^[a-f0-9]{64}$/);
assert.notEqual(NONCE, OLD_NONCE);
assert.notEqual(ROOT_HASH, "455bc6fc7b8f5f13f2e6c309a074c5337b12252a919494ac05714256b86adc08");
assert.equal(new Date(EXPIRES).toISOString(), EXPIRES);
const AT = new Date(Date.parse(EXPIRES) - 1).toISOString();
const ADMITTED = new Date(Date.parse(EXPIRES) - 10 * 60000).toISOString();
const DEADLINE = new Date(Date.parse(ADMITTED) + 20 * 60000).toISOString();
const SYNTHETIC = "synthetic-new-binding-fixture-000000000000000000000";
const SYNTHETIC_HASH = crypto.createHash("sha256").update(SYNTHETIC, "utf8").digest("hex");
assert.notEqual(SYNTHETIC_HASH, ROOT_HASH);
assert.match(source, new RegExp('operationNonce: "' + NONCE + '"'));
assert.match(source, new RegExp('bearerSha256: "' + ROOT_HASH + '"'));
assert.match(source, new RegExp('expiresAtUTC: "' + EXPIRES.replace(/\./g, "\\.") + '"'));
assert.equal((source.match(/bearerSha256: "[a-f0-9]{64}"/g) || []).length, 1);

function load(injectSyntheticVerifier) {
  const module = { exports: {} };
  const code = injectSyntheticVerifier
    ? source.replace('bearerSha256: "' + ROOT_HASH + '"', 'bearerSha256: "' + SYNTHETIC_HASH + '"')
    : source;
  const forbidden = () => { throw new Error("unexpected external effect"); };
  const requirePure = name => {
    if (name === "node:crypto") return crypto;
    if (name === "./azure-endpunkt" || name === "./testkosten-budget") return {};
    throw new Error("unexpected dependency");
  };
  vm.runInNewContext("(function(require,module,exports){\n" + code + "\n})", {
    Buffer, URL, Date, process: { env: {} }, fetch: forbidden,
    setTimeout: forbidden, setInterval: forbidden,
    console: { log: forbidden, warn: forbidden, error: forbidden }
  })(requirePure, module, module.exports);
  return module.exports;
}
function call(runtime, nonce, observedAt) {
  const out = { status: null, body: null, reads: 0 };
  runtime.handleRequest({ method: "GET", headers: {
    authorization: "Bearer " + SYNTHETIC,
    "x-helmut-root-nonce": nonce,
    "x-helmut-root-admitted-at": ADMITTED,
    "x-helmut-root-deadline-at": DEADLINE,
    "x-helmut-production-commit": "b".repeat(40),
    "x-helmut-deployment-host": "synthetic-rebind.vercel.app"
  } }, {
    writeHead(status) { out.status = status; }, end(body) { out.body = body; }
  }, new URL("https://synthetic-rebind.vercel.app/api/cron/testnachweis-status?modus=provider-konfiguration"), {
    jsonHeaders: () => ({ "Cache-Control": "no-store" }),
    env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "b".repeat(40), VERCEL_URL: "synthetic-rebind.vercel.app" },
    now: () => new Date(observedAt),
    readRuntimeConfiguration() { out.reads += 1; return { syntheticFixture: true }; }
  });
  return out;
}

const synthetic = load(true);
const accepted = call(synthetic, NONCE, AT);
assert.equal(accepted.status, 200);
assert.equal(accepted.reads, 1);
assert.equal(JSON.parse(accepted.body).rootNonce, NONCE);
assert(!accepted.body.includes(SYNTHETIC));
assert(!accepted.body.includes(ROOT_HASH));

const oldOperation = call(synthetic, OLD_NONCE, AT);
assert.equal(oldOperation.status, 403);
assert.equal(oldOperation.reads, 0);

const expired = call(synthetic, NONCE, EXPIRES);
assert.equal(expired.status, 403);
assert.equal(expired.reads, 0);
const productionVerifier = call(load(false), NONCE, AT);
assert.equal(productionVerifier.status, 403);
assert.equal(productionVerifier.reads, 0);
console.log("Provider runtime auth rebind: 3 PASS; current fixed nonce, exact expiry boundary, synthetic verifier only.");
