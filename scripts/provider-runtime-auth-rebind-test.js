"use strict";

// Nur die neue Root-Authbindung; keine privaten Credentials oder alten Suiten.
// Rein lesender VM-Loader mit Whitelist-Inventar: echte EU-Vertrags-, Profil- und
// Canonical-Hash-Module aus lib/helmut, native Hashquelle node:crypto. Keine Netz-,
// FS-, Speicher- oder Timerwirkung; Dateizugriff nur fuer die freigegebenen
// lib/helmut-Quelltexte der Inventarliste, sonst nichts.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LIB = path.join(__dirname, "../lib/helmut");
const ATTESTATION = "provider-runtime-attestation.js";
const EU_CONTRACT = "synthetik-500-eu-service-contract.js";
const PROFILE = "synthetik-500-profile.js";
const CANONICAL_HASH = "streaming-canonical-hash.js";

const source = fs.readFileSync(path.join(LIB, ATTESTATION), "utf8");
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

// Whitelist: genau diese reinen Module und Abhaengigkeiten sind im Testkontext erlaubt.
// node:crypto ist die einzige erlaubte native Hashquelle; kein Netz, FS, Speicher, Timer.
const INVENTORY = {
  "provider-runtime-attestation.js": ["node:crypto", "./azure-endpunkt", "./testkosten-budget", "./synthetik-500-eu-service-contract"],
  "synthetik-500-eu-service-contract.js": ["./synthetik-500-profile"],
  "synthetik-500-profile.js": ["node:crypto", "./streaming-canonical-hash"],
  "streaming-canonical-hash.js": ["node:crypto"]
};
const loadedPure = new Map();
const readSources = [];
let blockedEffectAttempts = 0;
const forbidden = () => { blockedEffectAttempts += 1; throw new Error("unexpected external effect"); };
const sandboxGlobals = filename => ({
  Buffer, URL, Date, __dirname: path.dirname(filename), process: { env: {} },
  fetch: forbidden, setTimeout: forbidden, setInterval: forbidden,
  console: { log: forbidden, warn: forbidden, error: forbidden }
});

// Echte Quelltexte, ausschliesslich aus lib/helmut, ausschliesslich inventarisierte Module.
function readPureSource(name) {
  assert.ok(Object.hasOwn(INVENTORY, name), "module outside pure dependency inventory");
  assert.ok(!name.includes("/") && !name.includes("\\"), "inventory name must be a flat lib/helmut file");
  const filename = path.join(LIB, name);
  const text = fs.readFileSync(filename, "utf8");
  readSources.push(path.resolve(filename));
  return text;
}
function loadPureModule(name) {
  if (loadedPure.has(name)) return loadedPure.get(name);
  const filename = path.join(LIB, name);
  const text = readPureSource(name);
  const module = { exports: {} };
  const requirePure = specifier => {
    assert.ok(INVENTORY[name].includes(specifier), "unexpected dependency in " + name);
    if (specifier === "node:crypto") return crypto;
    return loadPureModule(specifier.slice(2) + ".js");
  };
  vm.runInNewContext("(function(require, module, exports) {\n" + text + "\n})",
    sandboxGlobals(filename), { filename })(requirePure, module, module.exports);
  loadedPure.set(name, module.exports);
  return module.exports;
}
function loadAttestation(injectSyntheticVerifier) {
  let code = source;
  if (injectSyntheticVerifier) {
    const parts = code.split('bearerSha256: "' + ROOT_HASH + '"');
    assert.equal(parts.length, 2, "exactly one production verifier binding is rebindable");
    code = parts.join('bearerSha256: "' + SYNTHETIC_HASH + '"');
  }
  const module = { exports: {} };
  const requirePure = specifier => {
    assert.ok(INVENTORY[ATTESTATION].includes(specifier), "unexpected dependency");
    if (specifier === "node:crypto") return crypto;
    if (specifier === "./azure-endpunkt" || specifier === "./testkosten-budget") return {};
    return loadPureModule(specifier.slice(2) + ".js");
  };
  vm.runInNewContext("(function(require,module,exports){\n" + code + "\n})", {
    Buffer, URL, Date, process: { env: {} }, fetch: forbidden,
    setTimeout: forbidden, setInterval: forbidden,
    console: { log: forbidden, warn: forbidden, error: forbidden }
  }, { filename: path.join(LIB, ATTESTATION) })(requirePure, module, module.exports);
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

const synthetic = loadAttestation(true);
const accepted = call(synthetic, NONCE, AT);
assert.equal(accepted.status, 200);
assert.equal(accepted.reads, 1);
assert.equal(JSON.parse(accepted.body).rootNonce, NONCE);
assert(!accepted.body.includes(SYNTHETIC));
assert(!accepted.body.includes(ROOT_HASH));
assert.ok(Object.hasOwn(INVENTORY, EU_CONTRACT) && Object.hasOwn(INVENTORY, PROFILE) && Object.hasOwn(INVENTORY, CANONICAL_HASH),
  "EU contract and its pure transitive modules stay in the inventory");
assert.ok(loadedPure.has(EU_CONTRACT), "real EU service contract module must be loaded, not stubbed");
const euContract = loadedPure.get(EU_CONTRACT);
assert.ok(euContract !== null && (typeof euContract === "object" || typeof euContract === "function"),
  "production EU contract module must be a real module object");
assert.ok(Object.getOwnPropertyNames(euContract).length > 0,
  "production EU contract must export its real surface instead of an empty stub");
assert.ok(readSources.includes(path.resolve(path.join(LIB, EU_CONTRACT))),
  "EU contract must be read from the real lib/helmut source");
assert.ok(readSources.every(file => path.dirname(file) === path.resolve(LIB)), "source reads stay inside lib/helmut");



const oldOperation = call(synthetic, OLD_NONCE, AT);
assert.equal(oldOperation.status, 403);
assert.equal(oldOperation.reads, 0);

const expired = call(synthetic, NONCE, EXPIRES);
assert.equal(expired.status, 403);
assert.equal(expired.reads, 0);
const productionVerifier = call(loadAttestation(false), NONCE, AT);
assert.equal(productionVerifier.status, 403);
assert.equal(productionVerifier.reads, 0);
assert.equal(blockedEffectAttempts, 0, "no forbidden fetch/timer/console effect inside the VM loader");
console.log("Provider runtime auth rebind: 3 PASS; current fixed nonce, exact expiry boundary, synthetic verifier only; real EU/profile/canonical-hash pure inventory.");
