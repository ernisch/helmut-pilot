"use strict";

// Nur neue Offline-Fixtures: echter Resolver/Verifier, kein Serverstart/HTTP/DB.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const DIR = path.join(__dirname, "../lib/helmut");
const source = fs.readFileSync(path.join(DIR, "relevanz-tage-runtime-witness.js"), "utf8");
const ROOT_NONCE = "7088b3c2-84fd-4a76-90ac-b19191c20ab4";
const ROOT_HASH = "c8546e232fba31e4e4f6ae0767636a932ad01a766f3d07d01a39d1b2082e900c";
const EXPIRES = "2026-10-04T13:57:15.982Z", OLD_NONCE = "2a0efb53-bfd2-4875-82df-84a5a4c5623a";
const AT = "2026-10-03T13:00:00.000Z", END = "2026-10-03T13:20:00.000Z";
const TOKEN = "synthetic-relevance-witness-000000000000000000000000";
const HASH = crypto.createHash("sha256").update(TOKEN, "utf8").digest("hex");
const COMMIT = "a".repeat(40), HOST = "relevance-witness-fixture.vercel.app", ID = "dpl_FictionalWitness";
const KEY = "HELMUT_BRIEFING_RELEVANZ_TAGE";
assert.notEqual(HASH, ROOT_HASH);
let forbiddenEffects = 0, passed = 0;
const forbidden = () => { forbiddenEffects++; throw Error("offline-effect-forbidden"); };
function moduleSource(name, code, allowed) {
  const module = { exports: {} };
  const requirePure = spec => { assert(Object.hasOwn(allowed, spec), "unexpected dependency " + spec); return allowed[spec]; };
  vm.runInNewContext("(function(require,module,exports){\n" + code + "\n})", {
    Buffer, URL, Date, process: { env: new Proxy({}, { get: forbidden }) },
    fetch: forbidden, setTimeout: forbidden, setInterval: forbidden,
    console: { log: forbidden, warn: forbidden, error: forbidden }
  }, { filename: name })(requirePure, module, module.exports);
  return module.exports;
}
const frische = moduleSource("briefing-frische.js", fs.readFileSync(path.join(DIR, "briefing-frische.js"), "utf8"), {});
const unavailable = new Proxy({}, { get: forbidden });
const provider = moduleSource("provider-runtime-attestation.js", fs.readFileSync(path.join(DIR, "provider-runtime-attestation.js"), "utf8"), {
  "node:crypto": crypto, "./azure-endpunkt": unavailable, "./testkosten-budget": unavailable
});
function load(synthetic = true) {
  // Testcontext only. The exported production handler has no auth override.
  const code = synthetic ? source.replace('bearerSha256: "' + ROOT_HASH + '"', 'bearerSha256: "' + HASH + '"') : source;
  return moduleSource("relevanz-tage-runtime-witness.js", code, {
    "./briefing-frische": frische, "./provider-runtime-attestation": { verifyOperationBearer: provider.verifyOperationBearer }
  });
}
const R = load(), plain = value => JSON.parse(JSON.stringify(value));
function call({ method = "GET", search = "?modus=relevanz-tage", headers = {}, patch = {},
  times = [AT, AT], handler = R } = {}) {
  const accessed = [], allowed = new Set([KEY, "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID"]);
  const env = new Proxy({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: COMMIT,
    VERCEL_URL: HOST, VERCEL_DEPLOYMENT_ID: ID, ...patch }, {
    get(target, name) { assert(allowed.has(name), "non-whitelisted env read " + name); accessed.push(name); return target[name]; }
  });
  const request = { method, headers: { authorization: "Bearer " + TOKEN, "x-helmut-root-nonce": ROOT_NONCE,
    "x-helmut-root-admitted-at": AT, "x-helmut-root-deadline-at": END,
    "x-helmut-production-commit": COMMIT, "x-helmut-deployment-host": HOST, "x-helmut-deployment-id": ID, ...headers } };
  const result = { status: null, body: null, headers: null }, response = {
    writeHead(status, h) { result.status = status; result.headers = h; }, end(body) { result.body = body; }
  };
  let clockReads = 0;
  handler.handleRequest(request, response, new URL("https://" + HOST + "/api/cron/testnachweis-status" + search), {
    env, now: () => new Date(times[Math.min(clockReads++, times.length - 1)]),
    jsonHeaders: extra => ({ "Cache-Control": "no-store", ...extra })
  });
  return { ...result, json: JSON.parse(result.body), accessed };
}
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }

check("Root source binding is new, exact and not the synthetic credential", () => {
  assert.equal((source.match(/bearerSha256: "[a-f0-9]{64}"/g) || []).length, 1);
  for (const literal of [ROOT_NONCE, ROOT_HASH, EXPIRES]) assert(source.includes(literal));
  assert(!source.includes(OLD_NONCE)); assert(!source.includes(TOKEN));
  const blocked = call({ handler: load(false) }); assert.equal(blocked.status, 403); assert(!blocked.accessed.includes(KEY));
});
check("shared real resolver preserves positive finite numeric semantics and provenance", () => {
  for (const raw of ["14", "14.5", " 14 ", "1.4e1", "0xe", "0.5", "1e300"]) {
    const c = plain(R.readConfiguration({ [KEY]: raw }));
    assert.equal(c.value, frische.relevanzTage({ [KEY]: raw })); assert.equal(c.value, Number(raw));
    assert.equal(c.source, KEY); assert.equal(c.configuredRuntimeValueValidated, true);
    assert.equal(c.resolvedValueValidated, true); assert.equal(c.defaultFallbackUsed, false);
    assert.equal(c.status, "VALIDATED_CURRENT_RUNTIME_CONFIG");
    assert.deepEqual(Object.keys(c).sort(), ["key", "value", "source", "namePresent", "configuredRuntimeValueValidated",
      "resolvedValueValidated", "status", "defaultFallbackUsed", "defaultValue"].sort());
  }
});
check("absence and invalid configured input expose actual default without raw text", () => {
  const absent = plain(R.readConfiguration({})); assert.equal(absent.value, 14); assert.equal(absent.namePresent, false);
  assert.equal(absent.source, "code-default"); assert.equal(absent.defaultValue, 14);
  assert.equal(absent.status, "ABSENT_DEFAULT_FALLBACK"); assert.equal(absent.defaultFallbackUsed, true);
  for (const raw of [undefined, "", "0", "-2", "Infinity", "NaN", "malformed-secret-canary", "14x"]) {
    const c = plain(R.readConfiguration({ [KEY]: raw }));
    assert.equal(c.value, frische.relevanzTage({ [KEY]: raw })); assert.equal(c.value, 14);
    assert.equal(c.namePresent, true); assert.equal(c.configuredRuntimeValueValidated, false);
    assert.equal(c.status, "INVALID_VALUE_DEFAULT_FALLBACK"); assert.equal(c.defaultFallbackUsed, true);
    assert(!JSON.stringify(c).includes("malformed-secret-canary"));
  }
});
check("GET/query/bearer/oldnonce reject before any relevance read", () => {
  for (const options of [{ method: "POST" }, { search: "?modus=provider-konfiguration" },
    { search: "?modus=relevanz-tage&modus=relevanz-tage" }, { search: "?modus=relevanz-tage&token=canary" },
    { headers: { authorization: undefined } }, { headers: { authorization: "Bearer " + "x".repeat(64) } },
    { headers: { authorization: "Bearer short" } }, { headers: { "x-helmut-root-nonce": OLD_NONCE } },
    { patch: { VERCEL_ENV: "preview", CRON_SECRET: TOKEN } }]) {
    const c = call(options); assert.notEqual(c.status, 200); assert(!c.accessed.includes(KEY));
    assert.equal(c.headers["Cache-Control"], "no-store"); assert(!c.body.includes(TOKEN));
  }
});
check("exact Root window and fixed expiry reject stale or invalid times", () => {
  for (const options of [{ headers: { "x-helmut-root-deadline-at": "2026-10-03T13:21:00.000Z" } },
    { headers: { "x-helmut-root-admitted-at": "2026-02-30T13:00:00.000Z" } },
    { times: ["2026-10-03T12:59:59.999Z"] }, { times: [END] }, { times: [EXPIRES] },
    { times: [AT, END] }, { times: [AT, "2026-10-03T12:59:59.999Z"] }]) assert.notEqual(call(options).status, 200);
});
check("commit host and required deployment ID bind request to runtime before reading", () => {
  for (const options of [{ headers: { "x-helmut-production-commit": "b".repeat(40) } },
    { headers: { "x-helmut-deployment-host": "other.vercel.app" } },
    { headers: { "x-helmut-deployment-id": "dpl_OtherSameCommit" } },
    { patch: { VERCEL_DEPLOYMENT_ID: undefined } }, { patch: { VERCEL_URL: "https://bad.invalid/?secret" } },
    { patch: { VERCEL_GIT_COMMIT_SHA: "bad" } }]) {
    const c = call(options); assert.notEqual(c.status, 200); assert(!c.accessed.includes(KEY));
  }
});
check("successful witness exports only narrow schema and UTC with no secret or provider data", () => {
  for (const raw of [undefined, "14", "invalid-sensitive-canary", "7"]) {
    const c = call({ patch: { [KEY]: raw } }); assert.equal(c.status, 200);
    assert.deepEqual(Object.keys(c.json).sort(), ["ok", "version", "reinLesend", "operationNonce", "rootAdmittedAtUTC",
      "rootDeadlineAtUTC", "observedAtUTC", "completedAtUTC", "production", "productionCommit", "deploymentHost", "deploymentId",
      "runtimeIdentityMatchesRequest", "serverGlobalOneUseProven", "configuration", "paidModelCalls", "nativeCalls",
      "mutationCalls", "source23WindowAcceptance", "externalRuntimeAcceptance", "productionCostGo"].sort());
    assert.equal(c.json.operationNonce, ROOT_NONCE); assert.equal(c.json.productionCommit, COMMIT);
    assert.equal(c.json.deploymentId, ID); assert.equal(c.json.observedAtUTC, AT); assert.equal(c.json.completedAtUTC, AT);
    assert.equal(c.json.configuration.value, frische.relevanzTage({ [KEY]: raw }));
    for (const key of ["serverGlobalOneUseProven", "source23WindowAcceptance", "externalRuntimeAcceptance", "productionCostGo"])
      assert.equal(c.json[key], false);
    for (const key of ["paidModelCalls", "nativeCalls", "mutationCalls"]) assert.equal(c.json[key], 0);
    assert(Buffer.byteLength(c.body, "utf8") <= 4096);
    for (const canary of [TOKEN, ROOT_HASH, "invalid-sensitive-canary", "AZURE_OPENAI", "OPENAI_MODEL"]) assert(!c.body.includes(canary));
    assert.equal(c.accessed.filter(k => k === KEY).length, 1);
  }
});
check("route is ahead of generic cron/account work and suite is a CI standard", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const specific = server.indexOf('url.searchParams.get("modus") === "relevanz-tage"');
  const generic = server.indexOf('if (url.pathname === "/api/cron/testnachweis-status")');
  assert(specific >= 0 && specific < generic);
  const runner = require("./run-offline-tests"); assert(runner.STANDARD.has("relevanz-tage-runtime-witness-test.js"));
  assert(runner.standardSuites().includes("relevanz-tage-runtime-witness-test.js"));
  assert.equal(forbiddenEffects, 0);
});
console.log(passed + "/" + passed + " new offline relevance witness groups; no runtime or W proof.");
