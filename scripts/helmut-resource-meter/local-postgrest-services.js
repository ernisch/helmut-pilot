"use strict";
// Optional local service plumbing. Import has no IO, launch, secret or authority.
// The DB PID1 alone validates the request, creates its scope and owns Popen.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), os = require("node:os"), cp = require("node:child_process");
const SELF = path.join(__dirname, "local-postgrest-services.js");
const MODE = "supervised-owner-v1", BINARY = "/tmp/helmut-unit-fixture-postgrest-03693bea";
const CONFIG = "/tmp/helmut-resource-fixture.conf", RECIPE = "/meter-output/RECIPE.PRIVATE.json";
const HOST_BINDING = "/meter-database/LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => assert.deepEqual(a, b);
function exact(value, keys) { same(Object.keys(value).sort(), [...keys].sort()); }
function regular(file, limit = 1024 * 1024) {
  assert(path.isAbsolute(file) && path.normalize(file) === file && fs.realpathSync(file) === file);
  const before = fs.lstatSync(file); assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1);
  // A path swapped to a FIFO after lstat must not block open before fstat.
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    assert(info.isFile() && info.nlink === 1 && info.size > 0 && info.size <= limit);
    for (const key of ["dev", "ino", "size", "nlink", "mtimeMs", "ctimeMs"]) assert.equal(info[key], before[key]);
    const buffer = Buffer.alloc(limit + 1); let length = 0, got;
    while (length < buffer.length && (got = fs.readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += got;
    assert(length <= limit && length === info.size && got === 0, "Bounded complete file read required");
    const after = fs.fstatSync(fd), current = fs.lstatSync(file);
    assert(after.isFile() && current.isFile() && !current.isSymbolicLink() && fs.realpathSync(file) === file);
    for (const key of ["dev", "ino", "size", "nlink", "mtimeMs", "ctimeMs"]) {
      assert.equal(info[key], before[key]); assert.equal(after[key], info[key]); assert.equal(current[key], info[key]);
    }
    const bytes = buffer.subarray(0, length);
    return { bytes, pin: { path: file, bytes: bytes.length, sha256: sha(bytes) } };
  } finally { fs.closeSync(fd); }
}
function pinShape(pin) {
  exact(pin, ["path", "bytes", "sha256"]);
  assert(typeof pin.path === "string" && path.isAbsolute(pin.path) && path.normalize(pin.path) === pin.path);
  assert(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && /^[a-f0-9]{64}$/.test(pin.sha256));
}
function pinned(pin) { pinShape(pin); const actual = regular(pin.path); same(actual.pin, pin); return actual.bytes; }
const json = pin => JSON.parse(pinned(pin).toString("utf8"));
function deriveConfig(template, target, secret) {
  assert(/^[a-f0-9]{64}$/.test(secret));
  assert(/^helmut_resource_fixture_[0-9]{8}_[a-f0-9]{12}$/.test(target));
  const old = /^jwt-secret = "([a-f0-9]{64})"$/gm, secrets = [...template.matchAll(old)];
  assert.equal(secrets.length, 1); assert.notEqual(secret, secrets[0][1]);
  assert.equal(template.split("helmut_u_start_fixture_005821f5").length, 2);
  assert.equal(template.split("server-port = 38410").length, 2);
  assert(template.includes('db-uri = "postgresql://authenticator@/helmut_u_start_fixture_005821f5?host=/var/run/postgresql"'));
  assert.equal(template.split('server-host = "0.0.0.0"').length, 2);
  return template.replace("helmut_u_start_fixture_005821f5", target).replace("server-port = 38410", "server-port = 38414")
    .replace(old, 'jwt-secret = "' + secret + '"');
}
function validateInputs(H, r) {
  const p = r.localPostgrestBackendPlanPin, plan = json(p);
  assert.equal(plan.schema, "helmut-local-supervised-postgrest-backend-plan/1"); assert.equal(plan.mode, MODE);
  assert.equal(plan.production, false); assert.equal(plan.automaticRetry, false);
  const caseDirectory = path.dirname(H.OUT), suffix = path.basename(caseDirectory).replace(/^attempt-/, "");
  assert.equal(path.dirname(caseDirectory), "/workspace/helmut-parallel-20261015/wave20-resource-integration");
  assert(/^[a-f0-9]{12}$/.test(suffix)); assert.equal(plan.caseDirectory, caseDirectory);
  assert.equal(plan.targetDatabase, H.TARGET); assert.equal(plan.operationId, "synthetik500-resources" + plan.day.slice(-2) + "-" + suffix);
  assert.equal(H.TARGET, "helmut_resource_fixture_" + plan.day.replaceAll("-", "") + "_" + suffix);
  same(plan.ownerGoPin, r.ownerGo); same(plan.sourcePostgrestConfigPin, r.sourcePostgrestConfig);
  const own = regular(SELF).pin;
  assert(plan.sourcePins.some(pin => pin.path === SELF && pin.sha256 === own.sha256 && pin.bytes === own.bytes), "Current service source not adopted before staging");
  for (const source of plan.sourcePins) { pinned(source); assert(r.sourcePins.some(pin => {
    return pin.path === source.path && pin.bytes === source.bytes && pin.sha256 === source.sha256;
  }), "Service request source closure incomplete"); }
  const actualRecipe = regular(RECIPE), recipe = JSON.parse(actualRecipe.bytes);
  assert.equal(recipe.scope, "owner-approved-local500-resources"); assert.equal(recipe.full500Attempts, 1);
  same(recipe.localPostgrestBackendPlanPin, p); same(recipe.freshOwnerGO, r.ownerGo);
  const connection = json(recipe.fixtureConnectionPin);
  assert.equal(connection.production, false); assert.equal(connection.caseDirectory, caseDirectory);
  assert.equal(connection.targetDatabase, H.TARGET); assert.equal(connection.operationId, plan.operationId);
  same(connection.localPostgrestBackendPlanPin, p); assert.equal(connection.resourceClaimPath, plan.resourceClaimPath);
  const claimFile = regular(plan.resourceClaimPath), claim = JSON.parse(claimFile.bytes);
  assert.equal(claim.schema, "helmut-local-resource-attempt-claim/1"); assert.equal(claim.noAutomaticRetry, true);
  same(claim.freshOwnerGO, r.ownerGo); same(claim.independentMeterAcceptance, recipe.independentMeterAcceptance);
  assert.equal(claim.recipeSHA256, actualRecipe.pin.sha256);
  assert(/^[a-f0-9]{64}$/.test(claim.containerId) && /^[a-f0-9]{12}$/.test(os.hostname())
    && claim.containerId.startsWith(os.hostname()), "Claim is not this application's one attempt");
  const reservation = json(recipe.setupReservation), host = JSON.parse(regular(HOST_BINDING).bytes);
  assert(/^[a-f0-9]{32}$/.test(reservation.controllerInvocationId));
  assert.equal(host.controllerInvocationId, reservation.controllerInvocationId);
  same(host.localPostgrestBackendPlanPin, p);
  assert(/^[a-f0-9]{64}$/.test(host.containerId));
  const owner = json(r.ownerGo), now = Date.now();
  assert.equal(owner.production, false); assert.equal(owner.allowDispose, false); assert.equal(owner.syntheticProfiles, 500);
  assert.equal(owner.targetDatabase, H.TARGET);
  assert(now < Date.parse(plan.workEndsAtUTC) && Date.parse(plan.workEndsAtUTC) < Date.parse(plan.closeByUTC), "Service work window expired");
  return { plan, recipe, claim, claimPin: claimFile.pin, reservation, host };
}
function assertACK(ack, request, configBytes, host) {
  exact(ack, ["schema", "requestSHA256", "started"]);
  assert.equal(ack.schema, "helmut-local-supervised-postgrest-start-ack/1");
  assert.equal(ack.requestSHA256, sha(Buffer.from(JSON.stringify(request))));
  const started = ack.started;
  exact(started, ["schema", "scopePin", "nonce", "containerId", "controllerInvocationId", "operationId", "requestSHA256", "targetDatabase", "processIdentity", "binaryPin", "configPin", "healthAccepted", "executionAuthority", "production", "full500Qualification", "automaticRetry"]);
  assert.equal(started.schema, "helmut-local-postgrest-owner-started/1");
  assert.equal(started.nonce, request.nonce); assert.equal(started.containerId, host.containerId);
  assert.equal(started.controllerInvocationId, request.controllerInvocationId); assert.equal(started.operationId, request.operationId);
  assert.equal(started.requestSHA256, ack.requestSHA256); assert.equal(started.targetDatabase, request.targetDatabase);
  pinShape(started.scopePin); assert.equal(started.scopePin.path, "/meter-output/local-postgrest-backend/SCOPE.SAFE.json");
  same(started.configPin, { path: CONFIG, bytes: configBytes.length, sha256: sha(configBytes) });
  assert.equal(started.binaryPin.path, BINARY);
  exact(started.processIdentity, ["pid", "startTicks", "executableDevice", "executableInode"]);
  assert(Number.isSafeInteger(started.processIdentity.pid) && started.processIdentity.pid > 1);
  assert(typeof started.processIdentity.startTicks === "string" && /^[0-9]+$/.test(started.processIdentity.startTicks));
  for (const key of ["executableDevice", "executableInode"]) assert(Number.isSafeInteger(started.processIdentity[key]) && started.processIdentity[key] > 0);
  for (const key of ["healthAccepted", "executionAuthority", "production", "full500Qualification", "automaticRetry"]) assert.equal(started[key], false);
}
function start({ H, file, dirname }) {
  const r = H.request(file, "helmut-local-runtime-services-request/1");
  H.activated(r); H.sourceBinding(r);
  assert.equal(dirname, path.join(H.OUT, "runtime-candidates"));
  const binding = validateInputs(H, r), template = pinned(r.sourcePostgrestConfig).toString("utf8");
  const secret = crypto.randomBytes(32).toString("hex"), body = deriveConfig(template, H.TARGET, secret);
  const directory = path.join(H.OUT, "runtime-candidates/generated-services"); H.mkdirFresh(directory);
  const secretPin = H.save(path.join(directory, "LOCAL_JWT_SECRET.PRIVATE.txt"), secret + "\n");
  const configPin = H.save(path.join(directory, "postgrest.PRIVATE.conf"), body);
  const request = { schema: "helmut-local-supervised-postgrest-service-request/1", production: false, automaticRetry: false,
    nonce: crypto.randomBytes(16).toString("hex"), requestedAtUTC: new Date().toISOString(), day: binding.plan.day,
    caseDirectory: binding.plan.caseDirectory, targetDatabase: H.TARGET, operationId: binding.plan.operationId,
    localPostgrestBackendPlanPin: r.localPostgrestBackendPlanPin, ownerGoPin: r.ownerGo, activationResultPin: r.activationResult,
    targetConfigPin: r.targetConfig, sourcePostgrestConfigPin: r.sourcePostgrestConfig,
    derivedConfigBase64: Buffer.from(body).toString("base64"), jwtSecretSHA256: sha(Buffer.from(secret)),
    sourceBinding: r.finalSourceBinding, sourcePins: r.sourcePins, globalClaimPin: binding.claimPin,
    recipeSHA256: binding.claim.recipeSHA256, appContainerId: binding.claim.containerId,
    controllerInvocationId: binding.reservation.controllerInvocationId };
  const requestBytes = JSON.stringify(request); assert(Buffer.byteLength(requestBytes) <= 1024 * 1024);
  H.save(path.join(directory, "LOCAL_POSTGREST_SERVICE_REQUEST.PRIVATE.json"), requestBytes);
  const docker = (args, input) => cp.execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    input, encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: process.env.PATH }, stdio: ["pipe", "pipe", "pipe"] }).trim();
  const ack = JSON.parse(docker(["helmut-local-postgrest-owner-start"], requestBytes));
  assertACK(ack, request, Buffer.from(body), binding.host);
  same(ack.started.binaryPin, { ...binding.plan.binaryPin, path: BINARY });
  // Only a confirmed owned start may proceed to the unchanged gateway shape.
  const networks = JSON.parse(docker(["inspect", "--format", "{{json .NetworkSettings.Networks}}", H.CONTAINER]));
  const ips = Object.values(networks).map(x => x.IPAddress).filter(Boolean);
  assert.equal(ips.length, 1); assert(/^172\.(?:\d{1,3}\.){2}\d{1,3}$/.test(ips[0]));
  const gatewayConfig = H.save(path.join(directory, "GATEWAY_START.PRIVATE.json"), {
    database: H.TARGET, ownerGo: r.ownerGo, activationResult: r.activationResult, targetConfig: r.targetConfig, containerIP: ips[0], port: 38414 });
  const log = fs.openSync(path.join(directory, "gateway.PRIVATE.log"), "wx", 0o600);
  let child;
  try { child = cp.spawn("node", [path.join(dirname, "gateway.candidate.js"), gatewayConfig.path], {
    detached: true, stdio: ["ignore", log, log], env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
    assert(Number.isSafeInteger(child.pid) && child.pid > 1); child.unref(); }
  finally { fs.closeSync(log); }
  H.save(path.join(directory, "LOCAL_POSTGREST_SERVICES_STARTED.SAFE.json"), {
    schema: "helmut-local-supervised-postgrest-services-started/1", localPostgrestBackendPlanPin: r.localPostgrestBackendPlanPin,
    localJWTSecretPin: secretPin, configPin, ownerStarted: ack.started, requestSHA256: ack.requestSHA256,
    gatewayPID: child.pid, database: H.TARGET, ownerGo: r.ownerGo, activationResult: r.activationResult,
    production: false, healthAccepted: false, full500Qualification: false, noAutomaticRetry: true });
  return { localServicesStartIssued: true, database: H.TARGET, healthAccepted: false, noAutomaticRestart: true };
}
module.exports = Object.freeze({ start, deriveConfig, assertACK });
