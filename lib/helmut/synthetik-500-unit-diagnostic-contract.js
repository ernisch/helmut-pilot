"use strict";

// An inert provenance selector, deliberately incompatible with executable commands.
// This module neither expands the logical graph nor validates its declared hash.
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const path = require("node:path");
const MIB = 1024 * 1024, MAX_EXPANDED = 4 * 1024 ** 3;
const TERMINAL_PATH = "docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json";
const TERMINAL_SHA = "1781a7b1b7acd5dc15368865eb2c262fb9ca058f4cd3a89dfd8f6a0108f88a8b";
const BLOCKERS = Object.freeze(["postrunAuthJournalMissing", "preparedRequestBindingsMissing", "nativeNamespaceMissing",
  "freshSourceRuntimeMissing", "freshOwnerScopeMissing", "calendarConsumerMissing", "costAdmissionMissing",
  "exclusiveReservationMissing", "sendClaimConsumerMissing", "reviewResultConsumersMissing", "independentAcceptanceMissing"]);
const digest = x => crypto.createHash("sha256").update(x).digest("hex");
const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const exact = (x, keys) => isObject(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const need = (ok, code) => { if (!ok) throw Error("unit-diagnostic-" + code); };
const isSHA = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const absolute = x => typeof x === "string" && path.isAbsolute(x) && path.normalize(x) === x && !x.includes("\0");
const integer = (x, low, high) => Number.isSafeInteger(x) && x >= low && x <= high;
const pin = x => exact(x, ["path", "bytes", "sha256"]) && absolute(x.path) && integer(x.bytes, 1, MAX_EXPANDED) && isSHA(x.sha256);
function parseBytes(bytes) {
  const text = bytes.toString("utf8");
  need(Buffer.from(text, "utf8").equals(bytes), "utf8");
  try { return JSON.parse(text); } catch (_) { throw Error("unit-diagnostic-json"); }
}
function immutable(x) {
  if (x && typeof x === "object") { Object.values(x).forEach(immutable); Object.freeze(x); }
  return x;
}

function indexDictionary(payload, expectedBytes) {
  need(exact(payload, ["nodes", "root"]) && Array.isArray(payload.nodes)
    && integer(payload.nodes.length, 1, 200000) && payload.root === payload.nodes.length - 1, "dictionary-shape");
  const { nodes, root } = payload, sizes = [], depths = [], children = [];
  function reference(r, i) { need(integer(r, 0, i - 1), "dictionary-reference"); }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; need(Array.isArray(n), "dictionary-node");
    let refs = [], size, depth = 0;
    if (n[0] === "n") { need(n.length === 1, "dictionary-null"); size = 4; }
    else if (["s", "b", "d"].includes(n[0])) {
      need(n.length === 2 && (n[0] === "s" ? typeof n[1] === "string" : n[0] === "b" ? typeof n[1] === "boolean"
        : typeof n[1] === "number" && Number.isFinite(n[1]) && (!Number.isInteger(n[1]) || Number.isSafeInteger(n[1]))), "dictionary-scalar");
      size = Buffer.byteLength(JSON.stringify(n[1]));
    } else if (n[0] === "a" || n[0] === "o") {
      need(n.length === 2 && Array.isArray(n[1]), "dictionary-container");
      if (n[0] === "a") {
        refs = n[1]; for (const r of refs) reference(r, i);
        size = 2 + Math.max(0, refs.length - 1);
        for (const r of refs) depth = Math.max(depth, depths[r] + 1);
      } else {
        const keys = new Set(), keyOrder = [], probe = Object.create(null);
        for (const pair of n[1]) {
          need(Array.isArray(pair) && pair.length === 2, "dictionary-pair");
          for (const r of pair) reference(r, i);
          need(nodes[pair[0]][0] === "s", "dictionary-key");
          const key = nodes[pair[0]][1]; need(key !== "toJSON" && !keys.has(key), "dictionary-duplicate-key");
          keys.add(key); keyOrder.push(key); Object.defineProperty(probe, key, { value: null, enumerable: true });
          refs.push(pair[0], pair[1]); depth = Math.max(depth, depths[pair[1]] + 1);
        }
        need(JSON.stringify(Object.keys(probe)) === JSON.stringify(keyOrder), "dictionary-key-order");
        size = 2 + Math.max(0, n[1].length - 1) + n[1].length;
      }
      for (const r of refs) { size += sizes[r]; need(integer(size, 0, MAX_EXPANDED), "dictionary-size"); }
    } else need(false, "dictionary-tag");
    need(integer(size, 0, MAX_EXPANDED) && depth <= 80, "dictionary-bounds");
    sizes[i] = size; depths[i] = depth; children[i] = refs;
  }
  need(sizes[root] === expectedBytes, "expanded-size");
  const seen = new Set(), todo = [root];
  while (todo.length) {
    const i = todo.pop(); if (seen.has(i)) continue; seen.add(i);
    for (const r of children[i]) todo.push(r);
  }
  need(seen.size === nodes.length, "dictionary-unreachable");
  // Lookups only index existing tuples. No general materializer exists here.
  const indexedObjects = new Map();
  function field(id, key) {
    need(nodes[id]?.[0] === "o", "selected-object");
    if (!indexedObjects.has(id)) indexedObjects.set(id, new Map(nodes[id][1].map(pair => [nodes[pair[0]][1], pair[1]])));
    const result = indexedObjects.get(id).get(key); need(result !== undefined, "selected-field"); return result;
  }
  function array(id, count) { need(nodes[id]?.[0] === "a" && nodes[id][1].length === count, "selected-cardinality"); return nodes[id][1]; }
  function string(id) { need(nodes[id]?.[0] === "s" && nodes[id][1].length > 0, "selected-string"); return nodes[id][1]; }
  return { root, field, array, string };
}

function inspectPinnedPacket(args) {
  need(exact(args, ["packetBytes", "packetPath", "installPinsBytes", "installPin", "terminalBytes", "diagnosticNonce", "preparedAtUTC"]), "arguments");
  const { packetBytes, packetPath, installPinsBytes, installPin, terminalBytes, diagnosticNonce, preparedAtUTC } = args;
  need(Buffer.isBuffer(packetBytes) && integer(packetBytes.length, 1, 16 * MIB) && absolute(packetPath), "packet-limit");
  need(Buffer.isBuffer(installPinsBytes) && integer(installPinsBytes.length, 1, 16 * 1024) && pin(installPin)
    && installPin.bytes === installPinsBytes.length && installPin.sha256 === digest(installPinsBytes), "install-pin");
  need(typeof diagnosticNonce === "string" && /^[a-f0-9]{32}$/.test(diagnosticNonce), "nonce");
  need(typeof preparedAtUTC === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(preparedAtUTC)
    && Number.isFinite(Date.parse(preparedAtUTC)) && new Date(preparedAtUTC).toISOString() === preparedAtUTC, "preparation-time");
  need(Buffer.isBuffer(terminalBytes) && terminalBytes.length === 3336 && digest(terminalBytes) === TERMINAL_SHA, "terminal-pin");
  const terminal = parseBytes(terminalBytes);
  need(terminal.pass === false && terminal.scope === "FINISHED_LOCAL_MOCK500_V12" && terminal.completeACKs === 499
    && terminal.lastIndex === 499 && terminal.lastHTTP === 409 && terminal.failure === "synthetik500-dispatch-EU-unit-deadline"
    && terminal.slot12GOConsumed === true && terminal.all1500UsabilityAccepted === false && terminal.production === false
    && terminal.anotherFull500Authorized === false, "terminal-scope");
  const install = parseBytes(installPinsBytes), packetSHA = digest(packetBytes);
  need(isObject(install) && pin(install.commandPin) && pin(install.admissionPin)
    && install.commandPin.path === packetPath && install.commandPin.bytes === packetBytes.length
    && install.commandPin.sha256 === packetSHA, "packet-pin");
  const envelope = parseBytes(packetBytes);
  need(exact(envelope, ["version", "bytes", "sha256", "dictionaryBytes", "dictionarySha256", "data"])
    && envelope.version === "helmut-synthetik500-direct-dictionary-gzip/2" && isSHA(envelope.sha256)
    && integer(envelope.bytes, 64 * MIB + 1, MAX_EXPANDED) && integer(envelope.dictionaryBytes, 1, 64 * MIB)
    && isSHA(envelope.dictionarySha256) && typeof envelope.data === "string", "envelope");
  const compressed = Buffer.from(envelope.data, "base64");
  need(compressed.length > 0 && compressed.toString("base64") === envelope.data, "base64");
  let raw;
  try { raw = zlib.gunzipSync(compressed, { maxOutputLength: envelope.dictionaryBytes }); }
  catch (_) { throw Error("unit-diagnostic-gzip"); }
  need(raw.length === envelope.dictionaryBytes && digest(raw) === envelope.dictionarySha256, "dictionary-pin");
  const checked = indexDictionary(parseBytes(raw), envelope.bytes);
  const { field: f, array: a, string: s, root } = checked;
  const commandID = f(root, "command");
  need(s(f(commandID, "version")) === "helmut-synthetik500-production-command/2-direct"
    && s(f(commandID, "mode")) === "D-R-500", "source-command");
  const draftID = a(f(commandID, "drafts"), 500)[499], unitID = a(f(commandID, "units"), 500)[499];
  const owner = s(f(f(draftID, "profile"), "id")), selectedIntents = a(f(unitID, "intentIds"), 2).map(s);
  need(s(f(unitID, "kind")) === "DR" && s(f(unitID, "subject")) === owner
    && selectedIntents[0] !== selectedIntents[1] && s(f(draftID, "intentId")) === selectedIntents[0], "source-unit");
  const planID = f(f(commandID, "slot"), "plan"), intentNodes = a(f(planID, "intents"), 1000);
  const byID = new Map();
  for (const id of intentNodes) { const value = s(f(id, "id")); need(!byID.has(value), "duplicate-intent"); byID.set(value, id); }
  const dID = byID.get(selectedIntents[0]), rID = byID.get(selectedIntents[1]);
  need(dID !== undefined && rID !== undefined && s(f(dID, "phase")) === "D" && s(f(rID, "phase")) === "R"
    && s(f(dID, "owner")) === owner && s(f(rID, "owner")) === owner
    && s(f(rID, "dependsOn")) === selectedIntents[0], "source-intents");
  const sourceOperationId = s(f(planID, "operationId"));
  need(/^synthetik500-resources21-[a-f0-9]{12}$/.test(sourceOperationId), "source-operation");
  const sourceCase = sourceOperationId.slice(-12);
  need(Array.isArray(terminal.evidence) && terminal.evidence.some(e => e.path ===
    "/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-" + sourceCase + "/CONTROLLER_COMPLETE.SAFE.json"), "source-terminal-case");
  const namespace = "localUnitDiagnostic:" + diagnosticNonce + ":";
  const sourceSelectionBindingSHA256 = digest(JSON.stringify(["helmut-local-unit-diagnostic-selection/1", packetSHA,
    envelope.dictionarySha256, root, commandID, unitID, draftID, dID, rID, 499, 0]));
  return immutable({ schema: "helmut-local-unit-diagnostic-preparation/1", status: "PREPARATION_ONLY_EXECUTION_BLOCKED",
    sourceIndex: 499, diagnosticUnit: 0, preparedAtUTC,
    sourcePacketPin: { path: packetPath, bytes: packetBytes.length, sha256: packetSHA },
    sourceInstallPin: { path: installPin.path, bytes: installPin.bytes, sha256: installPin.sha256 },
    terminalPin: { path: TERMINAL_PATH, bytes: 3336, sha256: TERMINAL_SHA },
    sourceDictionaryPin: { bytes: envelope.dictionaryBytes, sha256: envelope.dictionarySha256 },
    sourceLogicalBytes: envelope.bytes, sourceOperationId, sourceDay: "2026-10-21", executionDayUTC: preparedAtUTC.slice(0, 10),
    diagnosticOperationId: "localUnitDiagnostic-" + diagnosticNonce,
    proposedNamespaceKeys: Object.fromEntries(["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => [k, namespace + k])),
    sourceSelectionBindingSHA256, namespaceInstalled: false, diagnosticIdReserved: false, production: false,
    executionAuthority: false, full500Accepted: false, paidProviderCallsAllowed: false,
    sourceQualification: "IDENTITY_AND_STRUCTURE_ONLY", fullCommandValidated: false, expandedSHA256Verified: false,
    executionBlockedBy: [...BLOCKERS] });
}

module.exports = Object.freeze({ inspectPinnedPacket });
