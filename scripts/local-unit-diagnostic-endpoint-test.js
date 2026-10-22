"use strict";

// Explicit synthetic filesystem/HTTP fixtures; real Ed25519 signatures. These
// negative tests do not mint a root anchor, open sockets, use a DB or run a motor.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { isDeepStrictEqual } = require("node:util");
const directory = "/run/helmut-local-unit-diagnostic", sha = b => crypto.createHash("sha256").update(b).digest("hex");
const key = crypto.generateKeyPairSync("ed25519"), other = crypto.generateKeyPairSync("ed25519");
const scope = { operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: "b".repeat(64) };
const database = "helmut_unit_diagnostic_" + "a".repeat(32), timestamp = new Date().toISOString();
const anchor = { schema: "helmut-local-unit-diagnostic-root-anchor/1", ...scope, database,
  publicKeyPEM: key.publicKey.export({ type: "spki", format: "pem" }), broker: { uid: 0, pid: 31, startTicks: "991", codeSHA256: "c".repeat(64) },
  upstream: { pid: 32, startTicks: "992", exePin: {}, configPin: {} }, measuredCgroup: { device: 28, inode: 99 }, legacy: {}, ownerQualificationPin: {} };
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
const attestation = { schema: "helmut-local-unit-diagnostic-signed-response/1", ...scope, database, nonce: request.nonce,
  method: request.method, path: request.path, requestSHA256: sha(Buffer.from("{}")), bodySHA256: sha(body), status: 200,
  observedAtUTC: timestamp, broker: anchor.broker, upstream: anchor.upstream, measuredCgroup: anchor.measuredCgroup };
function envelope(a = attestation, signingKey = key.privateKey) {
  return Buffer.from(JSON.stringify({ attestation: a, bodyBase64: body.toString("base64"),
    signatureBase64: crypto.sign(null, Buffer.from(JSON.stringify(a)), signingKey).toString("base64") }));
}
assert.equal(endpoint.verifyEnvelope(envelope(), trust, request, Date.now() - 5000).body.toString(), body.toString()); checks++;
rejects(() => endpoint.verifyEnvelope(envelope(attestation, other.privateKey), trust, request, Date.now() - 5000), /ed25519/);
for (const [field, replacement] of Object.entries({ nonce: "f".repeat(64), method: "GET", path: "/rest/v1/helmut_store", status: 0,
  bodySHA256: "0".repeat(64), requestSHA256: "0".repeat(64), observedAtUTC: "2020-01-01T00:00:00.000Z", broker: { ...anchor.broker, pid: 777 }, upstream: {}, measuredCgroup: {} })) {
  rejects(() => endpoint.verifyEnvelope(envelope({ ...attestation, [field]: replacement }), trust, request, Date.now() - 5000));
}
const broker = load("scripts/helmut-resource-meter/local-unit-diagnostic-broker.js", {}, ["authorize", "validateConfig"]);
uid = 0;
const pin = { path: "/run/bootstrap/qualified.json", bytes: 10, sha256: "f".repeat(64) };
const config = { schema: "helmut-local-unit-diagnostic-broker-config/1", ...scope, database,
  upstream: { port: 38414, pid: 32, startTicks: "992", exePin: pin, configPin: pin, runtimeTokenPath: "/run/bootstrap/token" },
  measuredCgroup: { path: "/owned-group", device: 28, inode: 99, procMembership: { broker: "0::/owner\n", upstream: "0::/db\n" } },
  ownerQualificationPin: pin, legacy: { tables: ["mandate_profiles"], rpcs: [{ name: "helmut_auth_state_graph_read_v1", oid: "40000", identityArguments: "text",
    prosrcSHA256: "e".repeat(64), qualificationPin: pin, requestKeys: ["p_id"] }] } };
broker.validateConfig(config); checks++;
const msg = (method, pathname, value = null) => ({ ...scope, database, nonce: "e".repeat(64), method, path: pathname,
  bodyBase64: value === null ? "" : Buffer.from(JSON.stringify(value)).toString("base64") });
assert.equal(broker.authorize(config, msg("GET", "/rest/v1/mandate_profiles?select=id%2Cprofil&limit=1")).length, 0); checks++;
broker.authorize(config, msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { p_id: "main-auth" })); checks++;
broker.authorize(config, msg("POST", "/rest/v1/rpc/local_unit_diagnostic_contract_v1", {})); checks++;
for (const bad of [msg("POST", "/rest/v1/mandate_profiles", {}), msg("GET", "/rest/v1/helmut_store"), msg("GET", "/rest/v1/../rpc/mutate"),
  msg("POST", "/rest/v1/rpc/helmut_auth_state_cas_v1", {}), msg("POST", "/rest/v1/rpc/helmut_auth_state_graph_read_v1", { sql: "no" }),
  msg("POST", "/rest/v1/rpc/local_unit_diagnostic_state_read_v1", { p_scope_hash: "0".repeat(64), p_nonce: "0".repeat(64) }),
  { ...msg("GET", "/rest/v1/mandate_profiles"), url: "http://elsewhere" }, { ...msg("GET", "/rest/v1/mandate_profiles"), commandHash: "0".repeat(64) }]) {
  rejects(() => broker.authorize(config, bad));
}
rejects(() => broker.validateConfig({ ...config, upstream: { ...config.upstream, hostname: "external" } }));
rejects(() => broker.validateConfig({ ...config, legacy: { tables: [], rpcs: [{ ...config.legacy.rpcs[0], name: "helmut_any_write" }] } }));
assert.equal(JSON.stringify(trust.anchor.broker), JSON.stringify(anchor.broker));
process.stdout.write(JSON.stringify({ checks, syntheticRootFilesystem: true, realEd25519: true, sockets: 0, database: 0, nativeAcceptance: false }) + "\n");
