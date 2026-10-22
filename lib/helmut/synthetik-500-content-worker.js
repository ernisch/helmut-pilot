"use strict";
// Pinned first repository entry. Pure content validation; no admission or GO.
const epoch = require("./synthetik-500-cpu-epoch");
const { parentPort, workerData } = require("node:worker_threads");
const crypto = require("node:crypto"), { performance } = require("node:perf_hooks");
const phases = [];
const phase = (name, body) => { const start = performance.now(); try { return body(); }
  finally { const measured = { name, wallMs: performance.now() - start, diagnostics: epoch.diagnostics() }; phases.push(measured);
    parentPort.postMessage({ type: "phase", measured }); } };
const deny = () => { throw Error("synthetik500-content-worker-io-denied"); };
// This worker has neither service credentials nor provider/activation authority.
global.fetch = deny;
for (const name of ["node:http", "node:https"]) { const m = require(name); m.request = deny; m.get = deny; }
const net = require("node:net"); net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
require("node:tls").connect = deny; require("node:dgram").createSocket = deny;
require("node:http2").connect = deny;
const dns = require("node:dns");
for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === "function") dns[key] = deny;
for (const key of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"]) require("node:child_process")[key] = deny;
require("node:worker_threads").Worker = deny;
try {
  if (!parentPort || typeof workerData?.dataText !== "string"
    || Buffer.byteLength(workerData.dataText) > 16 * 1024 * 1024) throw Error("synthetik500-content-worker-input");
  const actualSHA = crypto.createHash("sha256").update(workerData.dataText, "utf8").digest("hex");
  if (actualSHA !== workerData.storedSHA256) throw Error("synthetik500-content-worker-stored-bytes");
  if (phase("closedBootstrap", () => epoch.bootstrap()) !== true) throw Error("synthetik500-content-worker-bootstrap");
  const C = require("./synthetik-500-production-command"), T = require("./synthetik-500-direct-codec");
  const facts = require("./canonical-content-facts");
  if (phase("closedSeal", () => epoch.seal()) !== true) throw Error("synthetik500-content-worker-seal");
  const encoded = phase("parseActualStoredText", () => JSON.parse(workerData.dataText));
  const staged = encoded?.version === "helmut-s500-staged-content/1";
  if (staged && Object.keys(encoded).sort().join("|") !== "commandPin|encoded|version") throw Error("synthetik500-content-worker-stage");
  const decoded = phase("completeDecode", () => T.decode(staged ? encoded.encoded : encoded));
  const packet = staged ? { command: decoded, admission: null, testAuthority: null, commandPin: encoded.commandPin }
    : C.isDirect(decoded) ? { command: decoded, admission: null, testAuthority: null } : decoded;
  if (epoch.diagnostics().codecEnteredCount !== 1 || facts.snapshotStats().contextPresent !== true)
    throw Error("synthetik500-content-worker-unqualified-decode");
  if (!packet?.command || packet.command.slot?.plan?.operationId !== workerData.operationId)
    throw Error("synthetik500-content-worker-operation");
  if (!["full", "restore"].includes(workerData.mode)) throw Error("synthetik500-content-worker-mode");
  const checked = workerData.mode === "full" ? phase("completeOriginalC", () => C.validate(packet.command))
    : { commandHash: phase("originalCanonicalHashOnly", () => require("./synthetik-500-profile").hash(packet.command)) };
  // Ordinary-v1 runs the literal C body outside the CPU fast path. Its lazy
  // imports must still remain inside the same sealed, source-pinned graph.
  if (phase("closedGraphAfterContent", () => epoch.verifyClosedModuleGraph()) !== true)
    throw Error("synthetik500-content-worker-post-content-graph");
  const diagnostics = epoch.diagnostics();
  const expectedCalls = workerData.mode === "full" ? 1 : 0;
  // Ordinary v1 inputs deliberately stay outside the historical-v2 CPU branch.
  // Their complete original C body above still runs once, without cached facts.
  const ordinaryLegacyC = workerData.mode === "full" && C.isDirect(packet.command)
    && Array.isArray(packet.command.drafts) && packet.command.drafts.length === 500
    && packet.command.drafts.every(d => d.briefingEingabe?.version === 1);
  const expectedEntries = ordinaryLegacyC ? 0 : expectedCalls;
  if (checked.commandHash !== workerData.commandHash || diagnostics.enteredCount !== expectedEntries
    || diagnostics.commandCalls !== expectedCalls || diagnostics.codecEnteredCount !== 1)
    throw Error("synthetik500-content-worker-proof");
  if (ordinaryLegacyC && (diagnostics.qualifiedFalseCount !== 1
    || diagnostics.lastFailure !== "unsupported-command-dispatch"))
    throw Error("synthetik500-content-worker-legacy-proof");
  parentPort.postMessage({ ok: true, mode: workerData.mode, packet, commandHash: checked.commandHash,
    storedSHA256: actualSHA, operationId: workerData.operationId, phases, diagnostics, facts: facts.snapshotStats() });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error.message), phases, diagnostics: epoch.diagnostics() });
}
