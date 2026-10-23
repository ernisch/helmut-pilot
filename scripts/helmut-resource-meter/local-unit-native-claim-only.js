"use strict";

// Prepared separate claim-only diagnostic. No injected implementation, URL, command packet,
// proof callback, authority producer, retry, clock replacement or resume API.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), v8 = require("node:v8");
const { performance } = require("node:perf_hooks");
const CASE_ROOT = "/workspace/helmut-unit-diagnostic-native";
const MODE = "fresh-claim-only-v1";
const RESULT_FIELDS = ["mode", "operationId", "commandHash", "claimCallbackReached", "callbackCalls", "motorCalls", "providerCalls",
  "completedUnits", "expectedPositions", "controlCount", "claimStillRunning", "authorityConsumed", "unit60Qualified", "auth30Qualified",
  "independentFinalAcceptance", "full500Accepted", "production", "paidProviderCallsAllowed", "retryAllowed"];
const ENVIRONMENT = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "HELMUT_STORAGE_BACKEND", "SUPABASE_URL",
  "HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE", "HELMUT_NATIVE_NODE_OLD_SPACE_MIB", "HELMUT_PUBLICATION_ELIGIBILITY_JSON", "HELMUT_LOCAL_UNIT_NATIVE_DIAGNOSTIC"]);
// These are existing local motor enums, not caller-supplied provider or proof options.
const MOTOR_ENVIRONMENT = Object.freeze({
  HELMUT_LLM_USAGE_STORAGE: ["relational-atomic-v1"], HELMUT_AUTH_STATE_STORAGE: ["merkle-auth-v1"],
  HELMUT_AUTH_HISTORY_READ_REUSE: ["off", "verified-history-reuse-v1"],
  HELMUT_AUTH_GRAPH_READ_REUSE: ["off", "verified-graph-reuse-v1"],
  HELMUT_AUTH_SINGLE_WRITE_CAPTURE: ["off", "single-write-capture-v1"],
  HELMUT_AUTH_CONTROL_READ: ["off", "verified-control-view-v1"],
  HELMUT_LOCAL_PIPELINE_LOCK_MODE: ["off", "invocation-lease-v1"]
});
// Exact source-defined reasons only. A plausible-looking prefix is never a
// license to copy an application's free text into a payload-free receipt.
const REASONS = new Set(Object.entries({
  "local-unit-native-observation-gate": "arguments selection process self-process process-binding canonical-path symlink-component private-directory receipt-cap directory-drift receipt-file receipt-write receipt-drift frame-bytes frame-json frame-binding frame-window frame-canonical once-only stdin-state stdin-bytes frame-cap timeout stdin-error stdin-close-before-eof process-drift release-file release-drift release-bytes release-json release-binding release-window release-canonical exit-once-only exit-timeout",
  "local-unit-native-run": "canonical-path symlink-component private-directory case-directory-drift node-version-or-uid node-budget-startup local-storage-environment secret-environment-forbidden closed-environment private-origin closed-cli selector-path selector-private-file selector-read-drift selector-json selector-database-binding process-identity process-namespace prior-terminal-forbidden output-private-file output-short-write terminal-retry-forbidden actual-adapter-unavailable adapter-final-summary claim-only-mode claim-only-callback-binding claim-only-summary",
  "local-unit-diagnostic-motor": "closed-selector-required current-profile-drift evidence-readback-unknown final-ack-not-confirmed-in-unit-window fresh-draft-review-evidence-required fresh-lage-not-confirmed fresh-three-position-namespace-required morning-insert-unknown morning-readback native-consumers-missing native-enter-receipt-required own-state-consumers-missing scope-selector-drift three-native-positions-required",
  "local-unit-diagnostic": "D-before-R D-completion D-intent D-request R-completion R-intent R-request account-once account-receipt admission already-claimed-or-window calendar claim-window-or-deadline command command-cap finish-receipts fresh-slot gate-pins grant-consumed installed-record installed-state namespace-consumed one-unit operation owned-target owner-unit pin postrun-pin request-bytes request-pins reserve-limit reserve-once result-binding selector send-once sent-not-refundable slot source stop-owner stopped-or-unknown target-operation ticket-binding ticket-version utf8",
  "local-unit-diagnostic-source": "binding-drift draft-drift historical-shape intent-context-drift opaque-handle-required own-intent-id own-run-id own-two-intents-required own-unit-required selected-context selected-intents selected-original-sources selected-size selected-unit source-review-rule",
  "local-unit-diagnostic-transport": "actual-request-bytes closed-request-only native-original-consumer-missing native-original-proof opaque-original-handle-required original-model original-phase original-pin original-request-json original-request-pin original-utf8-bytes request-cap request-end request-write route-model scope-required scope-transport-missing selector ticket-binding utf8",
  "local-unit-diagnostic-native": "PREPARED_UNQUALIFIED-native-endpoint-attestation-not-installed actual-executable-code-closure actual-file-drift actual-native-body-hash actual-native-catalog actual-request-json actual-request-model-binding actual-request-utf8 actual-source-proof-binding actual-usage-unavailable artifact-insert-unknown artifact-owner-hash artifact-readback-unknown artifact-witness async-state-callback-forbidden authority-current-bindings authority-witness bounded-measured-closure canonical-file canonical-native-body closed-rpc-abi diagnostic-result draft-entry draft-identity draft-owner duplicate-manifest-path exact-preserved-postrun-only file-grew file-pin fresh-actual-runtime legacy-write-forbidden legacy-write-or-rpc-forbidden loaded-code-outside-pinned-closure local-runtime-credential manifest-file-drift manifest-file-proof-binding manifest-mount-context manifest-proof-terminal manifest-readonly-mount measured-manifests metadata-json metadata-utf8 named-file-not-regular native-admission-not-consumed native-canonical-json native-claim-required native-http-not-confirmed native-http-transport-replaced native-lock-ownership-lost native-next-canonical native-nonce native-original-request-models native-response-json native-response-shape native-response-utf8 native-scope native-state-ack-unknown one-owned-operation original-capture-binding original-file-metadata original-request-source-names original-transport-metadata output-entry output-owner-day output-parent-missing output-slot owned-local-target owned-lock-already-held owned-lock-job private-authority-proof private-lock-handle private-original-transport-proof private-runtime-proof private-target-origin private-usage-receipt request-cap request-deadline request-outcome-unknown required-artifact-missing response-aborted response-cap response-error review-parent-missing runtime-witness scope-required selector source-producer-derivation-binding state-change-function state-readback-unknown state-witness target-changed target-selection target-url usage-original-metadata usage-ticket",
  "synthetik500-dispatch": "EU-unit-deadline accounting-binding accounting-status already-claimed-or-window claim-or-window close-inflight-or-unknown command-invalid entered install-cas journal-invalid no-sender-first-handover-pair outside-finite-unit permanent-once-or-cap previous-operation-not-closed prior-attempt-not-accounted send-once stop-binding u-predecessor-consumed unit-not-accounted unit-reentry unmanaged-existing-slot",
  "publication-eligibility": "configuration-invalid policy-drift candidate-unchecked candidates-invalid source-reader-unavailable source-read-unavailable source-read-incomplete candidate-limit-invalid candidate-scan-limit candidate-read-unavailable candidate-window-drift stored-policy-stale capture-policy-mismatch matching-response-invalid matching-source-incomplete"
}).flatMap(([prefix, suffixes]) => suffixes.split(" ").map(suffix => prefix + "-" + suffix)));
const state = { caseDirectory: null, caseFD: null, caseIdentity: null, attemptCreated: false, attemptPin: null, terminalAttempted: false,
  selection: null, identity: null, startedAtUTC: null, startedMS: performance.now(), claimScopeEnteredMS: null, claimScopeReturnedMS: null, observationGate: null };
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const need = (ok, code) => { if (!ok) throw Error("local-unit-native-run-" + code); };
const exact = (value, fields) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const identity = stat => [stat.dev, stat.ino, stat.mode, stat.uid, stat.gid].map(String).join(":");
const stable = stat => [identity(stat), stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].map(String).join(":");
function noSymlinks(filename) {
  need(path.isAbsolute(filename) && path.normalize(filename) === filename && fs.realpathSync(filename) === filename, "canonical-path");
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep)) {
    current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component");
  }
}
function privateDirectory(directory) {
  noSymlinks(directory); const stat = fs.lstatSync(directory, { bigint: true });
  need(stat.isDirectory() && stat.uid === 1000n && (stat.mode & 0o7777n) === 0o700n, "private-directory"); return stat;
}
function checkCase() {
  need(identity(fs.fstatSync(state.caseFD, { bigint: true })) === state.caseIdentity
    && identity(privateDirectory(state.caseDirectory)) === state.caseIdentity, "case-directory-drift");
}
function startup() {
  need(process.env.HELMUT_LOCAL_UNIT_NATIVE_DIAGNOSTIC === MODE, "claim-only-mode");
  need(process.version === "v24.19.0" && typeof process.getuid === "function" && process.getuid() === 1000
    && typeof process.geteuid === "function" && process.geteuid() === 1000, "node-version-or-uid");
  need(process.execArgv.length === 2 && process.execArgv.includes("--max-old-space-size=384")
    && process.execArgv.includes("--max-semi-space-size=16") && !Object.hasOwn(process.env, "NODE_OPTIONS")
    && process.env.HELMUT_NATIVE_NODE_OLD_SPACE_MIB === "384", "node-budget-startup");
  need(!process.env.VERCEL && process.env.HELMUT_STORAGE_BACKEND === "supabase", "local-storage-environment");
  need(!Object.keys(process.env).some(key => /(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|SERVICE_ROLE|SERVICE_KEY|ACCESS_KEY|CREDENTIAL|AUTHORIZATION|COOKIE|BEARER)/i.test(key)
    || /^SUPABASE_.*KEY$/i.test(key)), "secret-environment-forbidden");
  need(Object.keys(process.env).every(key => ENVIRONMENT.has(key)
    || (Object.hasOwn(MOTOR_ENVIRONMENT, key) && MOTOR_ENVIRONMENT[key].includes(process.env[key]))), "closed-environment");
  let url; try { url = new URL(process.env.SUPABASE_URL); } catch { need(false, "private-origin"); }
  need(url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname) || /^10\.\d+\.\d+\.\d+$/.test(url.hostname)
      || /^192\.168\.\d+\.\d+$/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname)), "private-origin");
}
function selector() {
  need(process.argv.length === 4 && process.argv[2] === "--selector", "closed-cli");
  const filename = process.argv[3], match = typeof filename === "string"
    && /^\/workspace\/helmut-unit-diagnostic-native\/([a-f0-9]{32})\/SELECTION\.SAFE\.json$/.exec(filename);
  need(match && path.dirname(path.dirname(filename)) === CASE_ROOT, "selector-path");
  const nonce = match[1]; state.caseDirectory = path.dirname(filename);
  const directory = privateDirectory(state.caseDirectory);
  state.caseFD = fs.openSync(state.caseDirectory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  state.caseIdentity = identity(directory); checkCase(); noSymlinks(filename);
  const before = fs.lstatSync(filename, { bigint: true });
  need(before.isFile() && before.uid === 1000n && before.nlink === 1n && (before.mode & 0o7777n) === 0o600n
    && before.size > 0n && before.size <= 4096n, "selector-private-file");
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); let first, last, bytes;
  try {
    first = fs.fstatSync(fd, { bigint: true });
    need(first.isFile() && stable(before) === stable(first), "selector-read-drift");
    const buffer = Buffer.alloc(Number(before.size) + 1); let total = 0;
    while (total < buffer.length) {
      const count = fs.readSync(fd, buffer, total, buffer.length - total, null); if (count === 0) break; total += count;
    }
    bytes = buffer.subarray(0, total); last = fs.fstatSync(fd, { bigint: true });
  }
  finally { fs.closeSync(fd); }
  const after = fs.lstatSync(filename, { bigint: true }); checkCase();
  need(stable(before) === stable(first) && stable(first) === stable(last) && stable(last) === stable(after)
    && BigInt(bytes.length) === before.size && Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "selector-read-drift");
  let selected; try { selected = JSON.parse(bytes.toString("utf8")); } catch { need(false, "selector-json"); }
  need(exact(selected, ["operationId", "commandHash"]) && selected.operationId === "localUnitDiagnostic-" + nonce
    && typeof selected.commandHash === "string" && /^[a-f0-9]{64}$/.test(selected.commandHash)
    && bytes.toString("utf8").replace(/\s/g, "") === JSON.stringify(selected)
    && process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === "helmut_unit_diagnostic_" + nonce, "selector-database-binding");
  state.selection = Object.freeze(selected);
  return { path: filename, bytes: bytes.length, sha256: sha(bytes) };
}
function processIdentity() {
  const stat = fs.readFileSync("/proc/self/stat", "utf8"), end = stat.lastIndexOf(")"), fields = stat.slice(end + 2).trim().split(/\s+/);
  need(end > 0 && Number(stat.slice(0, stat.indexOf(" "))) === process.pid && /^[1-9][0-9]{0,29}$/.test(fields[19] || ""), "process-identity");
  const status = fs.readFileSync("/proc/self/status", "utf8"), values = /^NSpid:\s+([\d\t ]+)$/m.exec(status)?.[1];
  const nspid = values?.trim().split(/\s+/).map(Number), pidNamespace = fs.readlinkSync("/proc/self/ns/pid");
  need(Array.isArray(nspid) && nspid.length > 0 && nspid.every(x => Number.isSafeInteger(x) && x > 0)
    && nspid.at(-1) === process.pid && /^pid:\[[0-9]+\]$/.test(pidNamespace), "process-namespace");
  return { pid: process.pid, startTicks: fields[19], nspid, pidNamespace, hostPIDMapping: "NOT_ESTABLISHED_BY_ENTRY" };
}
function writeOnce(filename, value, attempt = false) {
  checkCase(); const bytes = Buffer.from(JSON.stringify(value) + "\n");
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  if (attempt) state.attemptCreated = true;
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    need(stat.isFile() && stat.uid === 1000n && stat.nlink === 1n && (stat.mode & 0o7777n) === 0o600n, "output-private-file");
    need(fs.writeSync(fd, bytes) === bytes.length, "output-short-write"); fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.fsyncSync(state.caseFD); checkCase(); return { path: filename, bytes: bytes.length, sha256: sha(bytes) };
}
function safeErrors(error) {
  const rows = [], seen = new Set(), names = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AssertionError", "PublicationEligibilityError", "DirektAbbruch"]);
  const codes = new Set(["EEXIST", "ENOENT", "EACCES", "EPERM", "ELOOP", "EINVAL", "EIO", "ENOSPC", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED",
    "LLM_BUDGET_EXHAUSTED", "PUBLICATION_ELIGIBILITY_UNAVAILABLE", "LAGE_AI_FAILURE", "LLM_USAGE_NOT_CONFIRMED", "AI_RESPONSE_NOT_COMPLETED", "AI_RESPONSE_INVALID_JSON",
    "LOCAL_NODE_HEAP_BUDGET_CONFIGURATION", "LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT", "LOCAL_NODE_HEAP_LIMIT_NOT_EFFECTIVE",
    "RESOURCE_HTTP_METER_ALREADY_INSTALLED", "RESOURCE_HTTP_METER_OUTPUT",
    ...("ATOMIC_USAGE_EU_ORDER_REQUIRED ATOMIC_USAGE_HISTORY_CHANGED ATOMIC_USAGE_LOCAL_ONLY ATOMIC_USAGE_MODE_INVALID ATOMIC_USAGE_READ_INVALID ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED ATOMIC_USAGE_RECEIPT_UNCONFIRMED ATOMIC_USAGE_WRITE_UNCONFIRMED "
      + "AUTH_CONTROL_CACHE_INVALID AUTH_CONTROL_READ_MODE_INVALID AUTH_CONTROL_READ_MODE_REQUIRED AUTH_GRAPH_REUSE_BINDING_INVALID AUTH_GRAPH_REUSE_CONTENT_MISMATCH AUTH_GRAPH_REUSE_CONTENT_MISSING AUTH_GRAPH_REUSE_MODE_INVALID AUTH_GRAPH_REUSE_RESPONSE_INVALID "
      + "AUTH_HISTORY_REUSE_BINDING_INVALID AUTH_HISTORY_REUSE_CONTENT_MISSING AUTH_HISTORY_REUSE_MODE_INVALID AUTH_HISTORY_REUSE_MUTABLE_CONTENT AUTH_HISTORY_REUSE_PROOF_INVALID AUTH_HISTORY_REUSE_RESPONSE_INVALID AUTH_SINGLE_CAPTURE_MODE_INVALID "
      + "AUTH_STATE_BINDING_INVALID AUTH_STATE_CONTENT_MISMATCH AUTH_STATE_GRAPH_DATA_INVALID AUTH_STATE_GRAPH_ORDER_INVALID AUTH_STATE_MARKER_IN_LOGICAL_DATA AUTH_STATE_READER_REQUIRED AUTH_STATE_SNAPSHOT_MODE_CHANGED AUTH_STATE_WRITE_UNCONFIRMED "
      + "AUTH_STATE_CANONICAL_INDEX_MISMATCH AUTH_STATE_DEPTH_LIMIT AUTH_STATE_EXPANDED_LIMIT AUTH_STATE_GRAPH_CHILD_TYPE AUTH_STATE_GRAPH_DUPLICATE_KEY AUTH_STATE_GRAPH_INVALID AUTH_STATE_GRAPH_NODE_INVALID AUTH_STATE_GRAPH_POSTORDER_INVALID AUTH_STATE_GRAPH_SIZE_MISMATCH AUTH_STATE_GRAPH_UNREACHABLE "
      + "AUTH_STATE_HASH_COLLISION AUTH_STATE_JSON_INVALID AUTH_STATE_KEY_HASH_COLLISION AUTH_STATE_LEAF_LIMIT AUTH_STATE_LOCAL_ONLY AUTH_STATE_METADATA_INVALID AUTH_STATE_MODE_INVALID AUTH_STATE_NODES_LIMIT AUTH_STATE_NODE_LIMIT AUTH_STATE_PAYLOAD_HASH_MISMATCH AUTH_STATE_PAYLOAD_LIMIT AUTH_STATE_REUSE_NODE_MISSING AUTH_STATE_ROOT_INVALID AUTH_STATE_VERIFIED_CONTENT_MISSING AUTH_STATE_WORK_LIMIT "
      + "AUTH_STORE_CONFLICT AUTH_STORE_SNAPSHOT_MISSING AUTH_STORE_SNAPSHOT_REVISION_CHANGED AUTH_STORE_TRANSPORT_INVALID "
      + "LOCAL_PIPELINE_LEASE_DISABLED LOCAL_PIPELINE_LEASE_HANDLE_INVALID LOCAL_PIPELINE_LEASE_INPUT_INVALID LOCAL_PIPELINE_LEASE_MODE_INVALID LOCAL_PIPELINE_LEASE_RELEASE_UNCONFIRMED LOCAL_PIPELINE_LEASE_TARGET_DRIFT LOCAL_PIPELINE_LEASE_TARGET_INVALID LOCAL_PIPELINE_LEASE_UNCONFIRMED").split(" ")]);
  for (let value = error; value && typeof value === "object" && rows.length < 8 && !seen.has(value); value = value.cause) {
    seen.add(value); const message = typeof value.message === "string" ? value.message : "";
    const reason = REASONS.has(message) ? message : null;
    const code = codes.has(value.code) ? value.code : codes.has(message) ? message
      : typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code) ? value.code : null;
    rows.push({ name: names.has(value.name) ? value.name : "Error", code, reason });
  }
  return rows.length ? rows : [{ name: "Error", code: null, reason: null }];
}
function memory() {
  const numeric = value => Object.fromEntries(Object.entries(value).filter(([, x]) => typeof x === "number" && Number.isFinite(x) && x >= 0));
  return { usageBytes: numeric(process.memoryUsage()), heap: numeric(v8.getHeapStatistics()), naturalObservationOnly: true,
    heapIsNotTotalRSS: true, commonNativePeakOrReserveAccepted: false };
}
function preserveFailurePhase(error) {
  if (state.claimScopeEnteredMS === null) return;
  try {
    const diagnostic = require("../../lib/helmut/local-unit-diagnostic-scope").consumeFailureDiagnostics(error);
    if (diagnostic === null) return;
    need(diagnostic.selection.operationId === state.selection.operationId
      && diagnostic.selection.commandHash === state.selection.commandHash, "failure-diagnostic-selection");
    need(Buffer.byteLength(JSON.stringify(diagnostic)) <= 8192, "failure-diagnostic-cap");
    writeOnce(path.join(state.caseDirectory, "FAILURE_PHASE_DIAGNOSTIC.PRIVATE.json"), diagnostic);
  } catch { /* A forensic output failure must not prevent the original failure terminal. */ }
}
function terminal(result, error) {
  need(!state.terminalAttempted, "terminal-retry-forbidden"); state.terminalAttempted = true;
  const finishedMS = performance.now();
  return writeOnce(path.join(state.caseDirectory, "ATTEMPT_TERMINAL.SAFE.json"), {
    schema: "helmut-local-unit-native-claim-only-terminal/1", status: error ? "failed" : "diagnosed", selection: state.selection,
    attemptPin: state.attemptPin, process: state.identity, startedAtUTC: state.startedAtUTC, finishedAtUTC: new Date().toISOString(),
    timing: { totalMonotonicMS: finishedMS - state.startedMS,
      claimScopeElapsedMS: state.claimScopeEnteredMS === null ? null : (state.claimScopeReturnedMS ?? finishedMS) - state.claimScopeEnteredMS },
    result: result ? Object.fromEntries(RESULT_FIELDS.map(key => [key, result[key]])) : null,
    errors: error ? safeErrors(error) : [], memory: memory(),
    unit60OrAuth30Acceptance: "CLAIM_ONLY_NOT_UNIT_OR_AUTH_ACCEPTANCE", full500Accepted: false,
    independentFinalAcceptance: false, production: false, paidProviderCallsAllowed: false, retryAllowed: false });
}
async function main() {
  startup(); const selectorPin = selector(); state.identity = processIdentity(); state.startedAtUTC = new Date().toISOString();
  let priorTerminal = false;
  try { fs.lstatSync(path.join(state.caseDirectory, "ATTEMPT_TERMINAL.SAFE.json")); priorTerminal = true; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  need(!priorTerminal, "prior-terminal-forbidden");
  state.attemptPin = writeOnce(path.join(state.caseDirectory, "ATTEMPT_STARTED.SAFE.json"), {
    schema: "helmut-local-unit-native-claim-only-start/1", selection: state.selection, selectorPin,
    startedAtUTC: state.startedAtUTC, monotonicMS: performance.now(), process: state.identity,
    node: process.version, oldSpaceMiB: 384, semiSpaceMiB: 16, retryAllowed: false, production: false
  }, true);
  const directory = path.join(state.caseDirectory, "NodeBudgetDirectory");
  fs.mkdirSync(directory, { mode: 0o700 }); privateDirectory(directory); fs.fsyncSync(state.caseFD);
  require("./http-meter").install(directory); // Installs native-node-budget before every application import.
  const observationGate = require("./local-unit-native-observation-gate");
  await observationGate.wait({ selection: state.selection, process: { pid: state.identity.pid, startTicks: state.identity.startTicks }, kind: "entry" });
  state.observationGate = observationGate;
  const Scope = require("../../lib/helmut/local-unit-diagnostic-scope");
  let callbacks = 0;
  state.claimScopeEnteredMS = performance.now();
  const result = await Scope.runClaimed(state.selection, () => {
    // The unchanged runClaimed reaches here only AFTER actual Original CAS,
    // OwnACK, native receipt/COMMIT and fresh claimed-state readback.
    // No adapter/motor, ticket, send, artifact, finish or stop call is made.
    callbacks++;
    const current = Scope.currentVerified(); Scope.assertClock();
    need(callbacks === 1 && current.selection.operationId === state.selection.operationId
      && current.selection.commandHash === state.selection.commandHash, "claim-only-callback-binding");
    return Object.freeze({ mode: MODE, ...state.selection, claimCallbackReached: true, callbackCalls: callbacks,
      motorCalls: 0, providerCalls: 0, completedUnits: 0, expectedPositions: 0, controlCount: 0,
      claimStillRunning: true, authorityConsumed: true, unit60Qualified: false, auth30Qualified: false,
      independentFinalAcceptance: false, full500Accepted: false, production: false, paidProviderCallsAllowed: false, retryAllowed: false });
  });
  state.claimScopeReturnedMS = performance.now();
  need(exact(result, RESULT_FIELDS) && result.mode === MODE && result.claimCallbackReached === true && result.callbackCalls === 1 && callbacks === 1
    && result.operationId === state.selection.operationId && result.commandHash === state.selection.commandHash
    && result.motorCalls === 0 && result.providerCalls === 0 && result.completedUnits === 0
    && result.expectedPositions === 0 && result.controlCount === 0 && result.claimStillRunning === true
    && result.authorityConsumed === true && result.unit60Qualified === false && result.auth30Qualified === false
    && result.independentFinalAcceptance === false && result.full500Accepted === false && result.production === false
    && result.paidProviderCallsAllowed === false && result.retryAllowed === false, "claim-only-summary");
  terminal(result, null);
}
function reportFailure(error, receiptError = null) {
  process.exitCode = 1;
  // A broken output stream must not turn a safe code into an unhandled stack.
  try { process.stderr.write(JSON.stringify({ schema: "helmut-local-unit-native-entry-failure/1", errors: safeErrors(error),
    receiptErrors: receiptError ? safeErrors(receiptError) : [], retryAllowed: false }) + "\n"); } catch { /* no retry */ }
}
const execution = require.main === module ? main().catch(error => {
  process.exitCode = 1;
  let receiptError = null;
  if (state.attemptCreated && !state.terminalAttempted) {
    preserveFailurePhase(error);
    try { terminal(null, error); } catch (failure) { receiptError = failure; } // Never retry or overwrite either receipt.
  }
  reportFailure(error, receiptError);
}).finally(async () => {
  if (state.observationGate !== null) {
    try { await state.observationGate.quiesce(); } catch (error) { reportFailure(error); }
  }
  if (state.caseFD !== null) {
    const fd = state.caseFD; state.caseFD = null;
    try { fs.closeSync(fd); } catch (error) { reportFailure(error); }
  }
}) : null;
module.exports = Object.freeze({});
