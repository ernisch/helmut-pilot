"use strict";

// Explicit synthetic filesystem/HTTP fixtures; real Ed25519 signatures. These
// negative tests do not mint a root anchor, open sockets, use a DB or run a motor.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { isDeepStrictEqual } = require("node:util");
const directory = "/run/helmut-local-unit-diagnostic", sha = b => crypto.createHash("sha256").update(b).digest("hex");
const key = crypto.generateKeyPairSync("ed25519"), other = crypto.generateKeyPairSync("ed25519");
const scope = { operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: "b".repeat(64) };
const database = "helmut_unit_diagnostic_" + "a".repeat(32), timestamp = new Date().toISOString();
const pin = { path: "/run/bootstrap/qualified.json", bytes: 10, sha256: "f".repeat(64) };
const budget = { nodeVersion: "v24.19.0", execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"],
  oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes: 432 * 1048576 };
const sourceBinding = { schema: "helmut-local-unit-original-source-binding/1", ...scope, database,
  socketPath: "/ram/helmut-original-write-bridge.sock", containerId: "9".repeat(64), pidNamespace: "pid:[123]",
  supervisor: { uid: 1000, pid: 22, startTicks: "990" },
  service: { uid: 1000, pid: 23, startTicks: "991", exePin: pin, codePin: pin, configPin: pin, nodeBudget: budget },
  measuredCgroup: { device: 28, inode: 99, procMembership: "0::/source\n" }, hmacKeySHA256: "8".repeat(64) };
const originalService = { hmacKeyPath: "/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin",
  sourceQualificationPin: { ...pin, path: "/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json" }, publicSourceBinding: sourceBinding };
const anchor = { schema: "helmut-local-unit-diagnostic-root-anchor/2", ...scope, database,
  publicKeyPEM: key.publicKey.export({ type: "spki", format: "pem" }), broker: { uid: 0, pid: 31, startTicks: "991", codeSHA256: "c".repeat(64) },
  upstream: { pid: 32, startTicks: "992", exePin: {}, configPin: {} }, measuredCgroup: { device: 28, inode: 99 }, legacy: {}, ownerQualificationPin: {}, originalService: sourceBinding };
let uid = 1000, directoryWritable = false, anchorUID = 0, socketUID = 0, anchorMode = 0o444, readonly = true, socketChanged = false;
const rawAnchor = Buffer.from(JSON.stringify(anchor));
function stat(filename) {
  const file = filename.endsWith("trust.json"), socket = filename.endsWith("broker.sock");
  return { dev: 1n, ino: socket && socketChanged ? 11n : 10n, mode: BigInt(file ? 0o100000 | anchorMode : socket ? 0o140666 : 0o040755 | (directoryWritable ? 0o020 : 0)),
    uid: BigInt(file ? anchorUID : socket ? socketUID : 0), gid: 0n, nlink: 1n, size: BigInt(file ? rawAnchor.length : 0), mtimeNs: 1n, ctimeNs: 1n,
    isFile: () => file, isSocket: () => socket, isDirectory: () => !file && !socket, isSymbolicLink: () => false };
}
const fakeFS = { constants: fs.constants, lstatSync: stat, openSync: () => 5, fstatSync: () => stat(directory + "/trust.json"), closeSync() {},
  readFileSync: name => name === "/proc/self/mountinfo" ? `1 0 0:0 / ${directory} ${readonly ? "ro" : "rw"} - tmpfs tmpfs ro\n` : rawAnchor };
function load(relative, replacements, access) {
  const filename = path.resolve(__dirname, "..", relative), module = { exports: {} };
  const source = fs.readFileSync(filename, "utf8") + "\nmodule.exports = {" + access.join(",") + "};";
  const context = vm.createContext({ require: name => Object.hasOwn(replacements, name) ? replacements[name] : require(name),
    module, exports: module.exports, __filename: filename, __dirname: path.dirname(filename), Buffer, URL, setTimeout, clearTimeout,
    process: { getuid: () => uid, env: {}, hrtime: process.hrtime }, structuredClone, console });
  vm.runInContext(source, context, { filename }); return module.exports;
}
const endpoint = load("lib/helmut/local-unit-diagnostic-endpoint.js", { "node:fs": fakeFS }, ["readTrust", "verifyEnvelope"]);
let checks = 0;
function rejects(work, code) { assert.throws(work, code); checks++; }
const trust = endpoint.readTrust(scope, database); checks++;
for (const [change, restore] of [
  [() => uid = 0, () => uid = 1000], [() => directoryWritable = true, () => directoryWritable = false],
  [() => anchorUID = 1000, () => anchorUID = 0], [() => socketUID = 1000, () => socketUID = 0],
  [() => anchorMode = 0o644, () => anchorMode = 0o444], [() => readonly = false, () => readonly = true]
]) { change(); rejects(() => endpoint.readTrust(scope, database)); restore(); }
rejects(() => endpoint.readTrust({ ...scope, commandHash: "d".repeat(64) }, database));
const request = { ...scope, database, nonce: "e".repeat(64), method: "POST", path: "/rest/v1/rpc/local_unit_diagnostic_state_read_v1", bodyBase64: Buffer.from("{}").toString("base64") };
const body = Buffer.from('{"actual":"SYNTHETIC_ONLY"}');
const attestation = { schema: "helmut-local-unit-diagnostic-signed-response/2", ...scope, database, nonce: request.nonce,
  method: request.method, path: request.path, requestSHA256: sha(Buffer.from("{}")), bodySHA256: sha(body), status: 200,
  observedAtUTC: timestamp, broker: anchor.broker, upstream: anchor.upstream, measuredCgroup: anchor.measuredCgroup, backendKind: "postgrest" };
function envelope(a = attestation, signingKey = key.privateKey) {
  return Buffer.from(JSON.stringify({ attestation: a, bodyBase64: body.toString("base64"),
    signatureBase64: crypto.sign(null, Buffer.from(JSON.stringify(a)), signingKey).toString("base64") }));
}
assert.equal(endpoint.verifyEnvelope(envelope(), trust, request, Date.now() - 5000).body.toString(), body.toString()); checks++;
rejects(() => endpoint.verifyEnvelope(envelope(attestation, other.privateKey), trust, request, Date.now() - 5000), /ed25519/);
for (const [field, replacement] of Object.entries({ nonce: "f".repeat(64), method: "GET", path: "/rest/v1/helmut_store", status: 0,
  bodySHA256: "0".repeat(64), requestSHA256: "0".repeat(64), observedAtUTC: "2020-01-01T00:00:00.000Z", broker: { ...anchor.broker, pid: 777 }, upstream: {}, measuredCgroup: {}, backendKind: "owner-psql", schema: "helmut-local-unit-diagnostic-signed-response/1" })) {
  rejects(() => endpoint.verifyEnvelope(envelope({ ...attestation, [field]: replacement }), trust, request, Date.now() - 5000));
}
const originalRequest = { ...request, path: "/rest/v1/rpc/local_unit_diagnostic_original_write_v1" };
const originalAttestation = { ...attestation, path: originalRequest.path, backendKind: "owner-psql", upstream: sourceBinding };
assert.equal(endpoint.verifyEnvelope(envelope(originalAttestation), trust, originalRequest, Date.now() - 5000).status, 200); checks++;
for (const a of [{ ...originalAttestation, backendKind: "postgrest", upstream: anchor.upstream },
  { ...originalAttestation, upstream: { ...sourceBinding, service: { ...sourceBinding.service, pid: 24 } } },
  { ...attestation, backendKind: "owner-psql", upstream: sourceBinding }]) {
  rejects(() => endpoint.verifyEnvelope(envelope(a), trust, a.path === originalRequest.path ? originalRequest : request, Date.now() - 5000));
}
const broker = load("scripts/helmut-resource-meter/local-unit-diagnostic-broker.js", {}, ["authorize", "validateConfig", "serialGate", "sourceQualification", "originalResponse"]);
uid = 0;
const config = { schema: "helmut-local-unit-diagnostic-broker-config/2", ...scope, database, originalService,
  upstream: { port: 38414, pid: 32, startTicks: "992", exePin: pin, configPin: pin, runtimeTokenPath: "/run/bootstrap/token" },
  measuredCgroup: { path: "/owned-group", device: 28, inode: 99, procMembership: { broker: "0::/owner\n", upstream: "0::/db\n" } },
  ownerQualificationPin: pin, legacy: { tables: ["mandate_profiles"], rpcs: [{ name: "helmut_auth_state_graph_read_v1", oid: "40000", identityArguments: "jsonb",
    prosrcSHA256: "e".repeat(64), qualificationPin: pin, requestKeys: ["id"] }] } };
broker.validateConfig(config); checks++;
const msg = (method, pathname, value = null) => ({ ...scope, database, nonce: "e".repeat(64), method, path: pathname,
  bodyBase64: value === null ? "" : Buffer.from(JSON.stringify(value)).toString("base64") });
assert.equal(broker.authorize(config, msg("GET", "/rest/v1/mandate_profiles?select=id%2Cprofil&limit=1")).length, 0); checks++;
broker.authorize(config, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { id: "main-auth" })); checks++;
rejects(() => broker.authorize(config, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { id: "foreign" })));
rejects(() => broker.authorize(config, { ...msg("POST", "/rest/v1/rpc/local_unit_diagnostic_contract_v1", {}), nonce: ["e".repeat(64)] }));
const graphConfig = structuredClone(config); graphConfig.legacy.rpcs[0].requestKeys = ["id", "knownProof", "readNonce", "knownGraph"];
for (const graph of [{ id: "main-auth", knownProof: null, readNonce: "offline" },
  { id: "main-auth", knownProof: null, readNonce: "offline", knownGraph: null }]) {
  broker.authorize(graphConfig, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", graph)); checks++;
  rejects(() => broker.authorize(graphConfig, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { ...graph, extra: true })));
}
rejects(() => broker.authorize(graphConfig, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { id: "main-auth" })));
broker.authorize(config, msg("POST", "/rest/v1/rpc/local_unit_diagnostic_contract_v1", {})); checks++;
const originalBody = { schema: "helmut-local-unit-original-write/1", mode: "state", ...scope,
  claimId: "12345678-1234-4234-8234-123456789abc", originalCAS: { id: "main-auth", expectedRevision: "old", expectedProof: {},
    expectedState: {}, revision: "next", root: "a".repeat(64), nodes: [], additions: [] }, ownBefore: { hash: "a".repeat(64), revision: 0 },
  ownNext: { canonical: "{}", hash: "b".repeat(64) }, artifact: null };
broker.authorize(config, msg("POST", originalRequest.path, originalBody)); checks++;
broker.authorize(config, msg("POST", originalRequest.path, { ...originalBody, mode: "usage",
  artifact: { kind: "usage-D", logicalId: "ticket", canonical: "{}", sha256: "b".repeat(64), parentHash: null } })); checks++;
for (const kind of ["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"]) {
  const artifact = { kind, logicalId: "own-result", canonical: "{}", sha256: "b".repeat(64), parentHash: null };
  broker.authorize(config, msg("POST", originalRequest.path, { ...originalBody, mode: "artifact", originalCAS: null, artifact })); checks++;
  rejects(() => broker.authorize(config, msg("POST", originalRequest.path, { ...originalBody, mode: "artifact", artifact })));
}
rejects(() => broker.authorize(config, msg("POST", originalRequest.path, { ...originalBody, mode: "artifact", originalCAS: null,
  artifact: { kind: "usage-D", logicalId: "own-result", canonical: "{}", sha256: "b".repeat(64), parentHash: null } })));
for (const change of [x => { x.mode = "seed"; }, x => { x.mode = "result"; }, x => { x.sql = "forbidden"; },
  x => { x.commandHash = "0".repeat(64); }, x => { x.originalCAS.extra = true; }, x => { x.artifact = {}; },
  x => { x.mode = "usage"; x.artifact = { kind: "draft", logicalId: "x", canonical: "{}", sha256: "b".repeat(64), parentHash: null }; }]) {
  const value = structuredClone(originalBody); change(value); rejects(() => broker.authorize(config, msg("POST", originalRequest.path, value)));
}
rejects(() => broker.authorize(config, msg("POST", "/rest/v1/rpc/local_unit_diagnostic_state_cas_v1", {
  p_scope_hash: scope.commandHash, p_claim_hash: "a".repeat(64), p_old_hash: "b".repeat(64), p_old_revision: 0,
  p_next_canonical: "{}", p_next_hash: "c".repeat(64), p_nonce: "e".repeat(64) })));
for (const kind of ["usage-D", "usage-R", "draft", "immutable-D", "review", "lage", "mandat", "morgen", "evidence"]) {
  rejects(() => broker.authorize(config, msg("POST", "/rest/v1/rpc/local_unit_diagnostic_artifact_insert_v1", {
    p_scope_hash: scope.commandHash, p_claim_hash: "a".repeat(64), p_kind: kind, p_logical_id: "offline",
    p_canonical: "{}", p_sha256: "c".repeat(64), p_parent_hash: null, p_nonce: "e".repeat(64) })));
}
for (const [name, extra] of [["lease_acquire", { p_claim_hash: "a".repeat(64), p_job: "offline", p_ttl_ms: 1000 }],
  ["lease_release", { p_claim_hash: "a".repeat(64), p_job: "offline", p_token: "offline" }],
  ["authority_read", {}], ["runtime_read", {}], ["state_read", {}],
  ["artifact_read", { p_kind: "evidence", p_logical_id: "offline", p_expected_sha256: "a".repeat(64) }]]) {
  broker.authorize(config, msg("POST", "/rest/v1/rpc/local_unit_diagnostic_" + name + "_v1",
    { p_scope_hash: scope.commandHash, ...extra, p_nonce: "e".repeat(64) })); checks++;
}
for (const bad of [msg("POST", "/rest/v1/mandate_profiles", {}), msg("GET", "/rest/v1/helmut_store"), msg("GET", "/rest/v1/../rpc/mutate"),
  msg("POST", "/rest/v1/rpc/helmut_auth_state_cas_v1", {}), msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { sql: "no" }),
  msg("POST", "/rest/v1/rpc/local_unit_diagnostic_state_read_v1", { p_scope_hash: "0".repeat(64), p_nonce: "0".repeat(64) }),
  { ...msg("GET", "/rest/v1/mandate_profiles"), url: "http://elsewhere" }, { ...msg("GET", "/rest/v1/mandate_profiles"), commandHash: "0".repeat(64) }]) {
  rejects(() => broker.authorize(config, bad));
}
rejects(() => broker.validateConfig({ ...config, upstream: { ...config.upstream, hostname: "external" } }));
rejects(() => broker.validateConfig({ ...config, legacy: { tables: [], rpcs: [{ ...config.legacy.rpcs[0], name: "helmut_any_write" }] } }));
for (const change of [x => { x.schema = "helmut-local-unit-diagnostic-broker-config/1"; }, x => { delete x.originalService; },
  x => { x.originalService.hmacKeyPath = "/elsewhere"; }, x => { x.originalService.publicSourceBinding.service.uid = 0; },
  x => { x.originalService.publicSourceBinding.service.nodeBudget.heapSizeLimitBytes = 1024 * 1048576; },
  x => { x.originalService.publicSourceBinding.service.nodeBudget.execArgv.push("--max-old-space-size=4096"); },
  x => { x.originalService.publicSourceBinding.measuredCgroup.inode++; }, x => { x.originalService.publicSourceBinding.socketPath += ".other"; }]) {
  const value = structuredClone(config); change(value); rejects(() => broker.validateConfig(value));
}
const qualification = { schema: "helmut-local-unit-source-supervisor-qualification/1", ...scope, database,
  issuedAtUTC: new Date().toISOString(), expiresAtUTC: new Date(Date.now() + 120000).toISOString(), publicSourceBinding: sourceBinding };
broker.sourceQualification(config, qualification, Date.now(), true); checks++;
for (const q of [{ ...qualification, publicSourceBinding: { ...sourceBinding, containerId: "0".repeat(64) } },
  { ...qualification, issuedAtUTC: new Date(Date.now() - 16000).toISOString() }, { ...qualification, expiresAtUTC: qualification.issuedAtUTC }]) {
  rejects(() => broker.sourceQualification(config, q, Date.now(), true));
}
const macKey = crypto.randomBytes(32), responseUnsigned = { schema: "helmut-local-original-owner-response/1", nonce: request.nonce, status: 200, bodyBase64: body.toString("base64") };
function macFrame(unsigned = responseUnsigned, signingKey = macKey) { return Buffer.from(JSON.stringify({ ...unsigned,
  hmacSHA256: crypto.createHmac("sha256", signingKey).update(JSON.stringify(unsigned)).digest("hex") })); }
assert.equal(broker.originalResponse(macFrame(), macKey, request.nonce).status, 200); checks++;
rejects(() => broker.originalResponse(macFrame(responseUnsigned, crypto.randomBytes(32)), macKey, request.nonce));
rejects(() => broker.originalResponse(macFrame({ ...responseUnsigned, nonce: "f".repeat(64) }), macKey, request.nonce));
rejects(() => broker.originalResponse(macFrame({ ...responseUnsigned, status: 500 }), macKey, request.nonce));
assert.equal(JSON.stringify(trust.anchor.broker), JSON.stringify(anchor.broker));
(async () => {
  const gate = broker.serialGate(), release = await gate.acquire(), order = [];
  const a = gate.acquire().then(done => { order.push("a"); done(); });
  const b = gate.acquire().then(done => { order.push("b"); done(); });
  assert.equal(order.length, 0); release(); await Promise.all([a, b]);
  assert.deepEqual(order, ["a", "b"]); rejects(() => release()); checks++;
  const first = await gate.acquire(), waiting = Array.from({ length: 32 }, () => gate.acquire().catch(e => e));
  await assert.rejects(gate.acquire(), /bounded-queue/); checks++;
  gate.close(); first();
  assert((await Promise.all(waiting)).every(value => String(value).includes("queue-closed"))); checks++;
  process.stdout.write(JSON.stringify({ checks, syntheticRootFilesystem: true, realEd25519: true, sockets: 0, database: 0, nativeAcceptance: false }) + "\n");
})().catch(() => { process.stderr.write("synthetic-endpoint-or-queue-check-failed\n"); process.exitCode = 1; });
