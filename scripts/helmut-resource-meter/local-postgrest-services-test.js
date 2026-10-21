"use strict";
// In-memory filesystem/fake transport only. No files, processes, DB or authority
// are created by these positive plumbing fixtures or deliberately bad requests.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), SOURCE = path.join(__dirname, "local-postgrest-services.js");
const code = fs.readFileSync(SOURCE), sha = value => crypto.createHash("sha256").update(value).digest("hex");
const vmAssert = Object.assign((...args) => assert(...args), assert, {
  deepEqual: (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))) });
let checks = 0;
function check(name, work) { work(); checks++; console.log("PASS " + name); }
function fixture({ alterPlan = () => {}, alterAck = () => {} } = {}) {
  const files = new Map(), handles = new Map(), directories = new Set(), calls = [], order = [];
  let ino = 1, fd = 10;
  const put = (file, bytes) => { files.set(file, { bytes: Buffer.from(bytes), ino: ino++, mode: 0o600 }); return pin(file); };
  const pin = file => { const entry = files.get(file); assert(entry, "Pure fixture file absent: " + file);
    return { path: file, bytes: entry.bytes.length, sha256: sha(entry.bytes) }; };
  const doc = (file, value) => put(file, JSON.stringify(value));
  const read = file => { assert(files.has(file), "Pure fixture absent: " + file); return files.get(file).bytes; };
  const stat = file => { const e = files.get(file); assert(e, file); return { dev: 1, ino: e.ino, size: e.bytes.length,
    mode: e.mode, mtimeMs: 0, ctimeMs: 0, isFile: () => true, isSymbolicLink: () => false }; };
  const caseDirectory = "/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-0123456789ab";
  const OUT = caseDirectory + "/native-end-preparation", TARGET = "helmut_resource_fixture_20261021_0123456789ab";
  const ownerGo = doc(caseDirectory + "/FRESH_OWNER_GO.PRIVATE.json", { production: false, allowDispose: false,
    syntheticProfiles: 500, targetDatabase: TARGET });
  const sourcePostgrestConfig = put("/pure/source/postgrest.PRIVATE.conf", 'db-uri = "postgresql://authenticator@/helmut_u_start_fixture_005821f5?host=/var/run/postgresql"\nserver-port = 38410\nserver-host = "0.0.0.0"\njwt-secret = "' + "1".repeat(64) + '"\n');
  const activationResult = doc(caseDirectory + "/ACTIVATION.PRIVATE.json", { pass: true, target: TARGET });
  const targetConfig = doc(caseDirectory + "/TARGET.PRIVATE.json", { database: TARGET });
  put(SOURCE, code);
  const sourcePins = [pin(SOURCE)];
  const plan = { schema: "helmut-local-supervised-postgrest-backend-plan/1", mode: "supervised-owner-v1", production: false,
    automaticRetry: false, day: "2026-10-21", caseDirectory, targetDatabase: TARGET,
    operationId: "synthetik500-resources21-0123456789ab", sourcePins, ownerGoPin: ownerGo,
    sourcePostgrestConfigPin: sourcePostgrestConfig, workEndsAtUTC: "2026-10-21T02:00:00.000Z",
    closeByUTC: "2026-10-21T02:03:00.000Z", resourceClaimPath: "/pure/GLOBAL_CLAIM.SAFE.json",
    binaryPin: { path: "/pure/retained-source-postgrest", bytes: 17309560, sha256: "870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617" } };
  alterPlan(plan);
  const planPin = doc("/pure/REVIEWED_PLAN.SAFE.json", plan);
  const connectionPin = doc("/pure/CONNECTION.SAFE.json", { production: false, caseDirectory, targetDatabase: TARGET,
    operationId: plan.operationId, localPostgrestBackendPlanPin: planPin, resourceClaimPath: plan.resourceClaimPath });
  const reservation = doc("/pure/RESERVATION.SAFE.json", { controllerInvocationId: "c".repeat(32) });
  const recipe = { scope: "owner-approved-local500-resources", full500Attempts: 1, localPostgrestBackendPlanPin: planPin,
    freshOwnerGO: ownerGo, fixtureConnectionPin: connectionPin, setupReservation: reservation, independentMeterAcceptance: {} };
  const recipePin = doc("/meter-output/RECIPE.PRIVATE.json", recipe);
  const claim = { schema: "helmut-local-resource-attempt-claim/1", noAutomaticRetry: true, freshOwnerGO: ownerGo,
    independentMeterAcceptance: {}, recipeSHA256: recipePin.sha256, containerId: "a".repeat(64) };
  doc(plan.resourceClaimPath, claim);
  doc("/meter-database/LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json", { localPostgrestBackendPlanPin: planPin,
    controllerInvocationId: "c".repeat(32), containerId: "b".repeat(64) });
  const r = { schema: "helmut-local-runtime-services-request/1", localPostgrestBackendPlanPin: planPin,
    ownerGo, sourcePostgrestConfig, activationResult, targetConfig, sourcePins, finalSourceBinding: "PURE_SOURCE_BINDING" };
  const H = { OUT, TARGET, CONTAINER: "helmut-meter-db-w20-0123456789ab",
    request(file, schema) { assert.equal(file, "PURE_REQUEST"); assert.equal(r.schema, schema); order.push("request"); return r; },
    activated(request) { order.push("activated"); JSON.parse(read(request.ownerGo.path)); assert(JSON.parse(read(request.activationResult.path)).pass); },
    sourceBinding(request) { order.push("sourceBinding"); request.sourcePins.forEach(p => assert.deepEqual(pin(p.path), p)); },
    mkdirFresh(directory) { assert(!directories.has(directory), "No repeat"); directories.add(directory); order.push("mkdir"); },
    save(file, value) { assert(!files.has(file), "No overwrite"); order.push("save:" + path.basename(file));
      return put(file, typeof value === "string" ? value : JSON.stringify(value)); } };
  const mockedFS = { constants: fs.constants, realpathSync: file => file, lstatSync: stat,
    openSync(file, flags) { if (typeof flags === "string") { assert.equal(flags, "wx"); assert(!files.has(file)); put(file, ""); }
      else stat(file); const handle = fd++; handles.set(handle, file); return handle; },
    fstatSync(handle) { return stat(handles.get(handle)); }, readFileSync(handle) { return read(typeof handle === "number" ? handles.get(handle) : handle); },
    closeSync(handle) { handles.delete(handle); } };
  const cp = { execFileSync(command, args, options) {
    assert.equal(command, "docker"); assert.equal(args[0], "--host=unix:///var/run/docker.sock"); calls.push(args); order.push(args[1]);
    if (args[1] === "inspect") return JSON.stringify({ pure: { IPAddress: "172.20.0.2" } });
    assert.deepEqual(Array.from(args.slice(1)), ["helmut-local-postgrest-owner-start"]);
    const request = JSON.parse(options.input), body = Buffer.from(request.derivedConfigBase64, "base64"), requestSHA256 = sha(Buffer.from(options.input));
    const started = { schema: "helmut-local-postgrest-owner-started/1", scopePin: { path: "/meter-output/local-postgrest-backend/SCOPE.SAFE.json", bytes: 1, sha256: "0".repeat(64) },
      nonce: request.nonce, containerId: "b".repeat(64), controllerInvocationId: request.controllerInvocationId,
      operationId: request.operationId, targetDatabase: TARGET, requestSHA256,
      processIdentity: { pid: 42, startTicks: "7", executableDevice: 1, executableInode: 2 }, binaryPin: { ...plan.binaryPin, path: "/tmp/helmut-unit-fixture-postgrest-03693bea" },
      configPin: { path: "/tmp/helmut-resource-fixture.conf", bytes: body.length, sha256: sha(body) },
      healthAccepted: false, executionAuthority: false, production: false, full500Qualification: false, automaticRetry: false };
    const ack = { schema: "helmut-local-supervised-postgrest-start-ack/1", requestSHA256, started }; alterAck(ack); return JSON.stringify(ack);
  }, spawn() { order.push("gatewaySpawn"); return { pid: 99, unref() {} }; } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ["2026-10-21T01:00:00.000Z"])); } static now() { return Date.parse("2026-10-21T01:00:00.000Z"); } }
  const modules = { "node:fs": mockedFS, "node:path": path, "node:assert/strict": vmAssert, "node:crypto": crypto,
    "node:os": { hostname: () => "a".repeat(12) }, "node:child_process": cp };
  const sandbox = { module: { exports: {} }, __dirname, process: { env: { PATH: "/pure/broker-shim" } }, Buffer, Date: Clock,
    require(name) { assert(Object.hasOwn(modules, name)); return modules[name]; } };
  vm.runInNewContext(code.toString(), sandbox);
  return { run: () => sandbox.module.exports.start({ H, file: "PURE_REQUEST", dirname: OUT + "/runtime-candidates" }),
    files, order, calls, plan, r, H, put, doc, read, claim, recipe, api: sandbox.module.exports };
}
check("confirmed supervisor start precedes gateway and shares one fresh JWT pin", () => {
  const f = fixture(), result = f.run(); assert.equal(result.healthAccepted, false);
  assert(f.order.indexOf("activated") < f.order.indexOf("mkdir"));
  assert(f.order.indexOf("helmut-local-postgrest-owner-start") < f.order.indexOf("gatewaySpawn"));
  const receipt = JSON.parse(f.read(f.H.OUT + "/runtime-candidates/generated-services/LOCAL_POSTGREST_SERVICES_STARTED.SAFE.json"));
  const secret = f.read(receipt.localJWTSecretPin.path).toString().trim(); assert(/^[a-f0-9]{64}$/.test(secret)); assert.notEqual(secret, "1".repeat(64));
  assert.equal(f.files.get(receipt.localJWTSecretPin.path).mode, 0o600);
  assert(f.read(receipt.configPin.path).toString().includes('jwt-secret = "' + secret + '"'));
  assert.equal(f.calls.filter(a => a[1] === "helmut-local-postgrest-owner-start").length, 1);
  assert.throws(f.run, /No repeat/);
});
for (const [name, change] of [
  ["missing owner GO", f => f.files.delete(f.r.ownerGo.path)],
  ["old consumed claim", f => f.doc(f.plan.resourceClaimPath, { ...f.claim, containerId: "d".repeat(64) })],
  ["foreign GO claim", f => f.doc(f.plan.resourceClaimPath, { ...f.claim, freshOwnerGO: {} })],
  ["recipe drift", f => f.doc("/meter-output/RECIPE.PRIVATE.json", { ...f.recipe, full500Attempts: 2 })],
  ["current source drift", f => f.put(SOURCE, Buffer.from("changed source"))]
]) check(name + " blocks before secret, submit and gateway", () => {
  const f = fixture(); change(f); assert.throws(f.run); assert(!f.order.includes("mkdir")); assert.equal(f.calls.length, 0);
});
check("wrong case and expired window block before any output", () => {
  for (const alterPlan of [p => { p.caseDirectory += "foreign"; }, p => { p.workEndsAtUTC = "2026-10-21T00:00:00.000Z"; }]) {
    const f = fixture({ alterPlan }); assert.throws(f.run); assert.equal(f.calls.length, 0); assert(!f.order.includes("mkdir"));
  }
});
for (const [name, alterAck] of [
  ["missing ACK", ack => { delete ack.started; }], ["wrong request ACK", ack => { ack.requestSHA256 = "0".repeat(64); }],
  ["config drift ACK", ack => { ack.started.configPin.sha256 = "0".repeat(64); }],
  ["foreign owner ACK", ack => { ack.started.containerId = "d".repeat(64); }],
  ["unproved child ACK", ack => { ack.started.processIdentity.pid = 1; }],
  ["wrong scope ACK", ack => { ack.started.scopePin.path = "/meter-output/FOREIGN.SAFE.json"; }],
  ["false full qualification", ack => { ack.started.full500Qualification = true; }]
]) check(name + " never starts gateway or retries", () => {
  const f = fixture({ alterAck }); assert.throws(f.run); assert(!f.order.includes("gatewaySpawn")); assert.equal(f.calls.length, 1);
  assert(![...f.files.keys()].some(p => p.endsWith("/LOCAL_POSTGREST_SERVICES_STARTED.SAFE.json")));
});
check("only declared native config changes are derived", () => {
  const f = fixture(), template = f.read(f.r.sourcePostgrestConfig.path).toString();
  assert.throws(() => f.api.deriveConfig(template, f.H.TARGET, "1".repeat(64)));
  assert.throws(() => f.api.deriveConfig(template.replace("server-port = 38410", "server-port = 9"), f.H.TARGET, "2".repeat(64)));
});
console.log(JSON.stringify({ pass: true, checks, scope: "PURE_IN_MEMORY_SERVICE_PLUMBING_ONLY", nativeLaunches: 0, databaseCalls: 0, executionAuthorityCreated: false }));
