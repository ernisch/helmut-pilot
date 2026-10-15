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

// Beide EU-Lesewege muessen dieselbe erneuerte Authority wirklich verwenden.
// Nur deren Hash wird im VM-Quelltext synthetisch ersetzt; kein Auth-Override.
// Keine echte Env, Secretdatei, Netzwerkverbindung oder Production-Speicherung.
async function checkEuReadRenewal() {
  const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
  const K = require("../lib/helmut/testkosten-budget");
  const C = require("../lib/helmut/synthetik-500-production-command");
  const authorityMatch = source.match(/const EU_PREPARATION_READ_OPERATION_AUTH = Object.freeze\((\{[^]*?\})\);/);
  const authority = JSON.parse(authorityMatch[1]);
  assert.equal(authority.expiresAtUTC, "2026-11-15T18:00:00.000Z");
  // Die Lese-Authority gilt einen Monat; der Finanzauftrag bleibt bis 25.10.
  // Positive Finanz-Fixtures deshalb innerhalb des unveraenderten Auftrags.
  const at = "2026-10-15T10:00:00.000Z";
  const deadline = new Date(Date.parse(at) + 20 * 60000).toISOString();
  const day = at.slice(0, 10), commit = "c".repeat(40), deployment = "synthetic-renewal.vercel.app";
  const runtimeEnv = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: commit, VERCEL_URL: deployment,
    HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT: EU.HASH, HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
    HELMUT_TESTLAUF_VORRANG_REAL: "200" };
  const injected = source.replace(authorityMatch[0], authorityMatch[0].replace('"bearerSha256": "' + authority.bearerSha256 + '"',
    '"bearerSha256": "' + SYNTHETIC_HASH + '"'));
  assert.notEqual(injected, source);
  const module = { exports: {} };
  const pure = { "node:crypto": crypto, "./azure-endpunkt": {}, "./testkosten-budget": K,
    "./synthetik-500-eu-service-contract": EU };
  vm.runInNewContext("(function(require,module,exports){\n" + injected + "\n})",
    sandboxGlobals(path.join(LIB, ATTESTATION)))(name => {
      assert(Object.hasOwn(pure, name)); return pure[name];
    }, module, module.exports);
  const renewed = module.exports;
  const actual = require("../lib/helmut/provider-runtime-attestation");
  assert.deepEqual(JSON.parse(JSON.stringify(actual.operationAuthority(runtimeEnv))), authority);
  assert.equal(actual.operationAuthority({}).operationNonce, NONCE);
  const expiredEu = JSON.parse(source.match(/const EU_READ_OPERATION_AUTH = Object.freeze\((\{[^]*?\})\);/)[1]);
  assert(Date.parse(authority.expiresAtUTC) > Date.parse(expiredEu.expiresAtUTC));
  const books = {};
  for (let ms = Date.parse(EU.CONTRACT.orderSinceUTC); ms <= Date.parse(day); ms += 86400000) {
    const d = new Date(ms).toISOString().slice(0, 10);
    books[d] = { version: 2, day: d, limit: 6000000, tarif: "azure-gpt5-mini-obergrenze-20260909",
      spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, calls: {}, manualUntil: null, frozen: null };
  }
  Object.assign(books[day], { version: EU.DAY_VERSION, limit: EU.DAY_MICRO_USD,
    tarif: EU.RATE_ID, serviceContractHash: EU.HASH });
  const state = { llmUsage: [], testKostenTage: books, testKostenAuftrag: {
    version: EU.ORDER_VERSION, id: EU.CONTRACT.orderId, abTag: EU.CONTRACT.orderSinceUTC,
    limit: EU.ORDER_MICRO_USD, externGebunden: 6809364, privateReserveMicroUSD: EU.PRIVATE_MICRO_USD,
    serviceContractHash: EU.HASH, bookCapacity: Object.keys(books).length, runDayUTC: null } };
  const originalState = JSON.stringify(state);
  const financingSource = fs.readFileSync(path.join(LIB, "synthetik-500-financing-witness.js"), "utf8");
  async function request(mode, options = {}) {
    let reads = 0, checks = 0;
    const headers = { authorization: "Bearer " + SYNTHETIC,
      "x-helmut-root-nonce": authority.operationNonce, "x-helmut-root-admitted-at": at,
      "x-helmut-root-deadline-at": deadline, "x-helmut-production-commit": commit,
      "x-helmut-deployment-host": deployment, ...options.headers };
    const env = { ...runtimeEnv, ...options.env };
    const out = { writeHead(code) { this.code = code; }, end(body) { this.body = body; this.writableEnded = true; } };
    const req = { method: options.method || "GET", headers };
    const url = new URL("https://helmut-pilot.vercel.app/api/cron/testnachweis-status?modus=" + mode);
    const deps = { jsonHeaders: () => ({ "Cache-Control": "no-store" }), env,
      now: () => new Date(options.now || at),
      readRuntimeConfiguration() { reads++; return { syntheticOnly: true }; } };
    if (mode === "provider-konfiguration") renewed.handleRequest(req, out, url, deps);
    else {
      const storage = new Proxy({
        synthetik500ProductionBackend() { checks++; },
        async readAuthStore() { reads++; return structuredClone(state); },
        async leseLlmTageszaehler() { reads++; return { ok: true, tag: day, used: 0 }; },
        llmDailyCallLimit: () => 2416, llmUnderstandingReserve: () => 702
      }, { get(target, key) { assert(Object.hasOwn(target, key), "only financing readers allowed"); return target[key]; } });
      const dependencies = { "./synthetik-500-production-command": C, "./testkosten-budget": K,
        "./synthetik-500-eu-service-contract": EU, "./provider-runtime-attestation": renewed,
        "./storage": storage, "./mandatsklasse": require("../lib/helmut/mandatsklasse") };
      const finance = { exports: {} };
      vm.runInNewContext("(function(require,module,exports){\n" + financingSource + "\n})",
        sandboxGlobals(path.join(LIB, "synthetik-500-financing-witness.js")))(name => {
          assert(Object.hasOwn(dependencies, name)); return dependencies[name];
        }, finance, finance.exports);
      await finance.exports.handleRequest(req, out, url, deps);
    }
    assert.equal(JSON.stringify(state), originalState);
    for (const privateValue of [SYNTHETIC, SYNTHETIC_HASH, authority.bearerSha256]) assert(!out.body.includes(privateValue));
    return { code: out.code, result: JSON.parse(out.body), reads, checks };
  }
  for (const mode of ["provider-konfiguration", "synthetik500-finanzbindung"]) {
    const accepted = await request(mode);
    assert.equal(accepted.code, 200); assert.equal(accepted.result.reinLesend, true);
    assert.equal(accepted.result.rootNonce, authority.operationNonce);
    assert.equal(accepted.result.commit, commit); assert.equal(accepted.result.deploymentHost, deployment);
    assert.equal(accepted.reads, mode === "provider-konfiguration" ? 1 : 3);
    for (const negative of [
      { method: "POST" }, { headers: { authorization: "Bearer wrong-synthetic-value-00000000000000000000" } },
      { headers: { "x-helmut-root-nonce": expiredEu.operationNonce } },
      { env: { VERCEL_ENV: "preview" } },
      { headers: { "x-helmut-production-commit": "d".repeat(40) } },
      { headers: { "x-helmut-deployment-host": "other-deployment.vercel.app" } },
      { headers: { "x-helmut-root-deadline-at": new Date(Date.parse(deadline) + 1).toISOString() } },
      { now: new Date(Date.parse(at) - 1).toISOString() }, { now: deadline },
      { now: authority.expiresAtUTC, headers: {
        "x-helmut-root-admitted-at": new Date(Date.parse(authority.expiresAtUTC) - 10 * 60000).toISOString(),
        "x-helmut-root-deadline-at": new Date(Date.parse(authority.expiresAtUTC) + 10 * 60000).toISOString() } }
    ]) {
      const denied = await request(mode, negative);
      assert.notEqual(denied.code, 200); assert.equal(denied.reads, 0); assert.equal(denied.checks, 0);
    }
  }
  // Ein frisches Fenster am letzten Freigabetag benoetigt keine Code-Erneuerung.
  // Nur Konfiguration: die Lauf-/Finanzvertraege erhalten keine Verlaengerung.
  const later = new Date(Date.parse(authority.expiresAtUTC) - 60 * 60000).toISOString();
  const reused = await request("provider-konfiguration", { now: later, headers: {
    "x-helmut-root-admitted-at": later,
    "x-helmut-root-deadline-at": new Date(Date.parse(later) + 20 * 60000).toISOString() } });
  assert.equal(reused.code, 200); assert.equal(reused.reads, 1);
  assert.equal(blockedEffectAttempts, 0);
  console.log("EU runtime read renewal: 2 genuine handlers and later fresh window PASS; 20 negative bindings rejected before reads; zero writes/network/models.");
}
checkEuReadRenewal().catch(() => { console.error("EU runtime read renewal: FAIL"); process.exitCode = 1; });
