"use strict";

// Fokussierte Offlinepruefung: ausschliesslich synthetische Env-/Bearer-Fixtures.
// Kein Serverstart, reale Env, Secretdatei, Speicher, HTTP oder Modellaufruf.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SHA = "469f3df0fc2b88187288389dbf56669e7712d03c";
const HOST = "helmut-runtime-proof.vercel.app";
const NONCE = "d4929cb2-83fb-465b-b038-c0eec3254275";
const AT = "2026-10-03T01:10:00.000Z";
const DEADLINE = "2026-10-03T01:30:00.000Z";
const EXPIRES = "2026-10-04T00:24:12.306Z";
const BEARER = "synthetic-runtime-proof-bearer-00000000000000000000";
const BEARER_HASH = crypto.createHash("sha256").update(BEARER, "utf8").digest("hex");
const runtime = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_URL: HOST };
const fixture = { ...runtime, AZURE_OPENAI_KEY: "synthetic-key-never-serialize",
  AZURE_OPENAI_ENDPOINT: "https://helmut-test.openai.azure.com/", AZURE_OPENAI_DEPLOYMENT: "helmut-model-v1" };
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0, blockedEffectAttempts = 0;
const comparisonLengths = [], imported = [];
let productionVerifierHash;
function check(name, fn) { fn(); passed += 1; console.log("PASS " + name); }
function forbiddenEffect() { blockedEffectAttempts += 1; throw new Error("offline-effect-forbidden"); }

// Echte Module im isolierten Kontext, enges Require-Inventar, leere Test-Env.
// Nur der Verifier im Testkontext wird durch den synthetischen Hash ersetzt.
// Der Production-Handler erhaelt KEINEN Auth-Override und kennt den Testbearer nicht.
const dependencies = {
  "ai.js": ["https", "./verstehen-restzeit", "./azure-endpunkt", "./provider-runtime-attestation", "./anbieter-steuerung"],
  "provider-runtime-attestation.js": ["./azure-endpunkt", "./testkosten-budget", "node:crypto"],
  "azure-endpunkt.js": ["crypto"], "testkosten-budget.js": ["node:crypto"],
  "anbieter-steuerung.js": ["crypto"], "verstehen-restzeit.js": []
};
const sandboxProcess = { env: {} }, loaded = new Map();
const testCrypto = { createHash: (...args) => crypto.createHash(...args),
  timingSafeEqual(a, b) { comparisonLengths.push([a.length, b.length]); return crypto.timingSafeEqual(a, b); } };
function loadPureModule(name) {
  if (loaded.has(name)) return loaded.get(name);
  assert(Object.hasOwn(dependencies, name), "module outside pure configuration inventory");
  const filename = path.join(__dirname, "../lib/helmut", name);
  let source = fs.readFileSync(filename, "utf8");
  if (name === "provider-runtime-attestation.js") {
    const hashDeclaration = /bearerSha256: "[a-f0-9]{64}"/g;
    assert.equal((source.match(hashDeclaration) || []).length, 1);
    productionVerifierHash = source.match(/bearerSha256: "([a-f0-9]{64})"/)[1];
    assert.notEqual(productionVerifierHash, BEARER_HASH);
    source = source.replace(hashDeclaration, 'bearerSha256: "' + BEARER_HASH + '"');
  }
  const module = { exports: {} };
  const requirePure = specifier => {
    assert(dependencies[name].includes(specifier), "unexpected dependency in " + name);
    imported.push(name + ":" + specifier);
    if (["crypto", "node:crypto"].includes(specifier)) return testCrypto;
    if (specifier === "https") return { request: forbiddenEffect, get: forbiddenEffect };
    return loadPureModule(specifier.slice(2) + ".js");
  };
  const run = vm.runInNewContext("(function(require, module, exports) {\n" + source + "\n})", {
    Buffer, URL, Date, process: sandboxProcess,
    console: { log: forbiddenEffect, warn: forbiddenEffect, error: forbiddenEffect },
    fetch: forbiddenEffect, setTimeout: forbiddenEffect, setInterval: forbiddenEffect
  }, { filename });
  run(requirePure, module, module.exports);
  loaded.set(name, module.exports);
  return module.exports;
}
const R = loadPureModule("provider-runtime-attestation.js");
const A = loadPureModule("ai.js");
function config(env, enabled = true, usable = true) {
  return plain(R.readConfiguration(env, { enabled, azureConfigurationUsable: usable }));
}
function call({ method = "GET", search = "?modus=provider-konfiguration", headers = {},
  env = runtime, read = () => config(fixture), times = [AT, AT] } = {}) {
  const response = { code: null, headers: null, body: null,
    writeHead(code, h) { this.code = code; this.headers = h; }, end(body) { this.body = body; } };
  const request = { method, headers: { authorization: "Bearer " + BEARER,
    "x-helmut-root-nonce": NONCE, "x-helmut-root-admitted-at": AT, "x-helmut-root-deadline-at": DEADLINE,
    "x-helmut-production-commit": SHA, "x-helmut-deployment-host": HOST, ...headers } };
  let reads = 0, clockReads = 0;
  R.handleRequest(request, response, new URL("https://" + HOST + "/api/cron/testnachweis-status" + search), {
    jsonHeaders: extra => ({ "Cache-Control": "no-store", ...extra }), env,
    now: () => new Date(times[Math.min(clockReads++, times.length - 1)]),
    readRuntimeConfiguration: () => { reads += 1; return read(); }
  });
  return { ...response, json: JSON.parse(response.body), reads };
}

check("shared sender resolver preserves model priorities and Understanding default", () => {
  for (const [env, active, understanding, azure, enabled] of [
    [{}, "gpt-5.5", "gpt-5-mini", false, false],
    [{ OPENAI_MODEL: "openai-model", OPENAI_API_KEY: "fixture" }, "openai-model", "gpt-5-mini", false, true],
    [{ OPENAI_MODEL: "openai-model", HELMUT_TEXT_MODEL: "text-model", HELMUT_UNDERSTANDING_MODEL: "u-model", OPENAI_API_KEY: "fixture" }, "text-model", "u-model", false, true],
    [{ AZURE_OPENAI_KEY: "fixture", AZURE_OPENAI_ENDPOINT: fixture.AZURE_OPENAI_ENDPOINT }, "gpt-5-mini", "gpt-5-mini", true, true],
    [{ ...fixture, HELMUT_TEXT_MODEL: "ignored" }, "helmut-model-v1", "helmut-model-v1", true, true],
    [{ AZURE_OPENAI_KEY: "fixture", OPENAI_MODEL: "openai-model", OPENAI_API_KEY: "fixture" }, "openai-model", "gpt-5-mini", false, false],
    [{ AZURE_OPENAI_ENDPOINT: fixture.AZURE_OPENAI_ENDPOINT, OPENAI_API_KEY: "fixture" }, "gpt-5.5", "gpt-5-mini", false, false]
  ]) {
    const result = R.resolveModels(env); sandboxProcess.env = { ...env };
    assert.equal(result.activeModel, active); assert.equal(result.understandingModel, understanding); assert.equal(result.azure, azure);
    assert.equal(A.activeModelName(), active); assert.equal(A.understandingModelName(), understanding); assert.equal(A.isAiEnabled(), enabled);
    const witness = plain(A.runtimeProviderConfiguration());
    assert.equal(witness.resolved.sendEnabled, enabled); assert.equal(witness.resolved.activeModel.value, active);
    assert.equal(witness.resolved.understandingModel.value, understanding);
  }
});

check("17 typed text fields, loopback bool and four name-presence bools only", () => {
  const c = config({ OPENAI_API_KEY: "fixture-key" });
  assert.equal(c.selected.length, 17); assert.deepEqual(c.selected.map(x => x.key), plain(R.ALLOW));
  assert(c.selected.every(x => x.status === "ABSENT" && x.defaultProvenByAbsence === false));
  assert.deepEqual(c.loopback, { namePresent: false, exactOne: false });
  assert.deepEqual(c.secretNamePresence, { AZURE_OPENAI_KEY: false, AZURE_OPENAI_API_KEY: false, OPENAI_API_KEY: true, HELMUT_EMBEDDING_API_KEY: false });
  assert.equal(c.resolved.activeModel.value, "gpt-5.5"); assert.equal(c.resolved.activeModel.source, "code-default");
  assert.equal(c.resolved.activeModel.configuredRuntimeValue, false);
  assert.equal(c.resolved.responsesURL, "https://api.openai.com/v1/responses");
  assert.equal(c.conservativeTextReservationPolicy.anbieterrechnung, false);
  assert.equal(c.currentAccountTariffProven, false); assert.equal(c.actualAzureDeploymentSkuProven, false);
  const empty = config({ OPENAI_API_KEY: "", HELMUT_KI_LOOPBACK_ERLAUBT: "" }, false, false);
  assert.equal(empty.secretNamePresence.OPENAI_API_KEY, true); assert.equal(empty.resolved.sendEnabled, false);
  assert.deepEqual(empty.loopback, { namePresent: true, exactOne: false });
});

check("normalized Azure destination excludes secret values and paid-call claims", () => {
  const c = config({ ...fixture, AZURE_OPENAI_API_KEY: "unused-key-fixture", HELMUT_EMBEDDING_API_KEY: "embedding-key-fixture" });
  const body = JSON.stringify(c);
  assert.equal(c.resolved.responsesURL, "https://helmut-test.openai.azure.com/openai/v1/responses");
  assert.equal(c.resolved.understandingModel.value, "helmut-model-v1");
  assert.equal(c.resolved.activeModel.configuredRuntimeValue, true);
  assert.equal(c.paidModelCalls, 0); assert.equal(c.nativeCalls, 0); assert.equal(c.productionCostGo, false);
  for (const secret of [fixture.AZURE_OPENAI_KEY, "unused-key-fixture", "embedding-key-fixture"]) assert(!body.includes(secret));
  const partial = config({ AZURE_OPENAI_KEY: "fixture-key", OPENAI_API_KEY: "other-fixture-key" }, false, false);
  assert.equal(partial.resolved.intendedProvider, "azure"); assert.equal(partial.resolved.providerForSend, null);
  assert.equal(partial.resolved.responsesURL, null); assert.equal(partial.resolved.sendEnabled, false);
});

check("invalid provider, model, URL, price and date values are discarded", () => {
  for (const value of ["https://user:secret@helmut.openai.azure.com/", "https://helmut.openai.azure.com/?token=secret", "https://evil.invalid/", "https://helmut.openai.azure.com/\n"]) {
    const c = config({ ...fixture, AZURE_OPENAI_ENDPOINT: value }, false, false);
    assert.equal(c.selected[0].status, "INVALID_VALUE_DISCARDED"); assert(!JSON.stringify(c).includes(value));
  }
  const c = config({ ...fixture, AZURE_OPENAI_DEPLOYMENT: "invalid-model?secret", HELMUT_EMBEDDING_API_BASE: "https://host.invalid/v1?token=secret",
    HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO: "-1", HELMUT_Z3B_AZURE_PREISDATUM_UTC: "2026-02-30" });
  for (const key of ["AZURE_OPENAI_DEPLOYMENT", "HELMUT_EMBEDDING_API_BASE", "HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO", "HELMUT_Z3B_AZURE_PREISDATUM_UTC"])
    assert.equal(c.selected.find(x => x.key === key).status, "INVALID_VALUE_DISCARDED");
  assert.equal(c.resolved.activeModel.status, "INVALID_MODEL_NAME_DISCARDED"); assert(!JSON.stringify(c).includes("invalid-model?secret"));
});

check("loopback requires exact one and decimal metadata grants no tariff", () => {
  const c = config({ ...fixture, AZURE_OPENAI_ENDPOINT: "https://localhost:43123/", HELMUT_KI_LOOPBACK_ERLAUBT: "1",
    HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO: "0.250000000001" });
  assert.deepEqual(c.loopback, { namePresent: true, exactOne: true }); assert.equal(c.resolved.loopbackExactOne, true);
  assert.equal(c.selected.find(x => x.key === "HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO").value, "0.250000000001");
  assert.equal(c.configuredZ3bMetadataIsNotRuntimeTariffBinding, true); assert.equal(c.currentAccountTariffProven, false);
  for (const v of [undefined, "true", "01", "1 "]) {
    assert.equal(config({ ...fixture, AZURE_OPENAI_ENDPOINT: "https://localhost:43123/", HELMUT_KI_LOOPBACK_ERLAUBT: v }, false, false).selected[0].status, "INVALID_VALUE_DISCARDED");
  }
});

check("real SHA256 and equal 32-byte constant-time comparison bind synthetic bearer", () => {
  const expected = { operationNonce: NONCE, bearerSha256: BEARER_HASH, expiresAtUTC: EXPIRES };
  const valid = "Bearer " + BEARER, at = Date.parse(AT), comparisons = comparisonLengths.length;
  assert.equal(R.verifyOperationBearer(valid, NONCE, at, expected), true);
  assert.deepEqual(comparisonLengths[comparisons], [32, 32]);
  assert.equal(R.verifyOperationBearer(valid, NONCE, at, { ...expected, bearerSha256: productionVerifierHash }), false);
  for (const args of [
    ["Bearer " + "x".repeat(64), NONCE, at, expected], [valid, "00000000-0000-4000-8000-000000000000", at, expected],
    [valid, NONCE, Date.parse(EXPIRES), expected], [valid, NONCE, NaN, expected],
    [valid, NONCE, at, { ...expected, expiresAtUTC: "invalid" }], [valid, NONCE, at, { ...expected, bearerSha256: "aa" }],
    ["bearer " + BEARER, NONCE, at, expected], ["Bearer short", NONCE, at, expected], [valid + "\n", NONCE, at, expected]
  ]) assert.equal(R.verifyOperationBearer(...args), false);
});

check("GET, exact query and fixed bearer reject before configuration reads", () => {
  for (const options of [{ method: "POST" }, { search: "?modus=provider-konfiguration&secret=synthetic" },
    { search: "?modus=provider-konfiguration&modus=provider-konfiguration" },
    { search: "?modus=other" }, { headers: { authorization: undefined } },
    { headers: { authorization: "Bearer " + "wrong".repeat(16) } },
    { env: { ...runtime, CRON_SECRET: BEARER, HELMUT_ADMIN_SECRET: BEARER }, headers: { authorization: "Bearer " + "wrong".repeat(16) } }]) {
    const r = call(options); assert.notEqual(r.code, 200); assert.equal(r.reads, 0); assert.equal(r.headers["Cache-Control"], "no-store");
  }
});

check("nonce, exact 20-minute window, absolute expiry and runtime identity stop drift", () => {
  for (const options of [
    { headers: { "x-helmut-root-nonce": "00000000-0000-4000-8000-000000000000" } },
    { headers: { "x-helmut-root-deadline-at": "2026-10-03T01:31:00.000Z" } },
    { headers: { "x-helmut-root-admitted-at": "2026-02-30T01:10:00.000Z" } },
    { times: [DEADLINE] }, { times: ["2026-10-03T01:09:59.999Z"] }, { times: [EXPIRES] },
    { headers: { "x-helmut-production-commit": "a".repeat(40) } },
    { headers: { "x-helmut-deployment-host": "other.vercel.app" } },
    { env: { ...runtime, VERCEL_URL: undefined } }, { env: { ...runtime, VERCEL_GIT_COMMIT_SHA: undefined } },
    { env: { ...runtime, VERCEL_URL: "host.invalid" } }, { env: { ...runtime, VERCEL_ENV: "preview" } },
    { env: { ...runtime, VERCEL_ENV: undefined } }
  ]) { const r = call(options); assert.notEqual(r.code, 200); assert.equal(r.reads, 0); }
  assert.equal(call({ times: [AT, DEADLINE] }).code, 400);
  assert.equal(call({ times: [AT, "2026-10-03T01:09:59.999Z"] }).code, 400);
  const near = "2026-10-04T00:24:12.305Z";
  assert.equal(call({ headers: { "x-helmut-root-admitted-at": "2026-10-04T00:10:00.000Z", "x-helmut-root-deadline-at": "2026-10-04T00:30:00.000Z" }, times: [near, EXPIRES] }).code, 400);
});

check("bounded witness retains external acceptance, server-global one-use and tariff as false", () => {
  const r = call(); assert.equal(r.code, 200); assert.equal(r.reads, 1); assert.equal(r.headers["Cache-Control"], "no-store");
  assert.equal(r.json.rootNonce, NONCE); assert.equal(r.json.commit, SHA); assert.equal(r.json.deploymentHost, HOST);
  assert.equal(r.json.deploymentId, null); assert.equal(r.json.runtimeIdentityMatchesRequest, true);
  for (const field of ["externalDeploymentRuntimeAcceptance", "serverGlobalOneUseProven", "actualAzureDeploymentSkuProven", "currentAccountTariffProven", "productionCostGo"])
    assert.equal(r.json[field], false);
  assert(!r.body.includes(BEARER)); assert(!r.body.includes(fixture.AZURE_OPENAI_KEY));
  assert.equal(call({ read: () => ({ large: "x".repeat(32769) }) }).code, 500);
  const error = call({ read: () => { throw new Error("synthetic-secret-url"); } });
  assert.equal(error.code, 500); assert(!error.body.includes("synthetic-secret-url"));
});

check("configuration entrypoint imports no DB and attempts no external effect", () => {
  assert.equal(blockedEffectAttempts, 0);
  assert(imported.every(x => !/storage|http:|https:|fetch|supabase/.test(x)));
  assert(comparisonLengths.every(([a, b]) => a === 32 && b === 32));
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const route = server.indexOf('if (url.pathname === "/api/cron/testnachweis-status" && url.searchParams.get("modus") === "provider-konfiguration")');
  assert(route > 0 && route < server.indexOf("const accountAuth = auth.authMode();"));
});

console.log("Provider runtime attestation: " + passed + " PASS; synthetic verifier only; no HTTP/DB/model calls.");
