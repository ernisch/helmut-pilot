"use strict";

// Closed, local-only native consumer. No injected storage, URLs, SQL, proof
// callbacks or replacement original contents. Empty/missing verifier evidence
// remains an execution blocker. All capabilities below are private WeakMaps.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const P = require("./synthetik-500-profile");
const ROOT = path.resolve(__dirname, "../..");
const POSTRUN_BYTES = 2147483648;
const POSTRUN_SHA256 = "54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693";
const authorityProofs = new WeakMap(), runtimeProofs = new WeakMap(), transportProofs = new WeakMap();
const originalClaimCapabilities = new WeakMap(), originalClaimIssued = new Set();
const stateProofs = new WeakMap(), usageReceipts = new WeakMap(), locks = new WeakMap();
const admitted = new Map();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const nonce = () => crypto.randomBytes(32).toString("hex");
const clone = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const RPC = Object.freeze({ contract: "", authority_read: "p_scope_hash,p_nonce", runtime_read: "p_scope_hash,p_nonce",
  state_read: "p_scope_hash,p_nonce", state_cas: "p_scope_hash,p_claim_hash,p_old_hash,p_old_revision,p_next_canonical,p_next_hash,p_nonce",
  artifact_insert: "p_scope_hash,p_claim_hash,p_kind,p_logical_id,p_canonical,p_sha256,p_parent_hash,p_nonce",
  artifact_read: "p_scope_hash,p_kind,p_logical_id,p_expected_sha256,p_nonce",
  lease_acquire: "p_scope_hash,p_claim_hash,p_job,p_ttl_ms,p_nonce",
  lease_release: "p_scope_hash,p_claim_hash,p_job,p_token,p_nonce" });
function need(ok, code) { if (!ok) throw Error("local-unit-diagnostic-native-" + code); }
function authority() { return require("./local-unit-diagnostic-authority"); }
function optionalScope() {
  const filename = path.join(__dirname, "local-unit-diagnostic-scope.js");
  return fs.existsSync(filename) ? require(filename) : null;
}
function current() { return optionalScope()?.currentVerified() || null; }
function active() { return current() !== null; }
function selected(selection) {
  need(exact(selection, ["operationId", "commandHash"])
    && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(selection.operationId)
    && /^[a-f0-9]{64}$/.test(selection.commandHash), "selector");
  return selection;
}
function context(selection = null) {
  const c = current(); need(c && (!selection || isDeepStrictEqual(c.selection, selected(selection))), "scope-required"); return c;
}
function target() {
  const database = process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE;
  need(!process.env.VERCEL && /^helmut_unit_diagnostic_[a-f0-9]{32}$/.test(database || "")
    && process.env.HELMUT_STORAGE_BACKEND === "supabase", "owned-local-target");
  let url; try { url = new URL(process.env.SUPABASE_URL); } catch { need(false, "target-url"); }
  need(url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname)
      || /^10\.\d+\.\d+\.\d+$/.test(url.hostname) || /^192\.168\.\d+\.\d+$/.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname)), "private-target-origin");
  return { database, origin: url.origin };
}
function sameTarget(a) { need(isDeepStrictEqual(target(), a), "target-changed"); }
async function rpc(method, args, selection = null) {
  need(Object.hasOwn(RPC, method) && exact(args, RPC[method] ? RPC[method].split(",") : []), "closed-rpc-abi");
  const t = target(), body = Buffer.from(JSON.stringify(args)); need(body.length <= 36 * 1024 * 1024, "request-cap");
  const identity = selected(selection || { operationId: "localUnitDiagnostic-" + t.database.slice(-32), commandHash: args.p_scope_hash });
  const response = await require("./local-unit-diagnostic-endpoint").request(identity, t.database, "POST",
    "/rest/v1/rpc/local_unit_diagnostic_" + method + "_v1", body);
  sameTarget(t); need(response.status === 200, "native-http-not-confirmed");
  const bytes = response.body;
  need(Buffer.from(bytes.toString("utf8")).equals(bytes), "native-response-utf8");
  let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { need(false, "native-response-json"); }
  need(value && typeof value === "object" && !Array.isArray(value), "native-response-shape");
  if (args.p_nonce) need(value.nonce === args.p_nonce, "native-nonce");
  if (args.p_scope_hash) need(value.scopeHash === args.p_scope_hash, "native-scope");
  return value;
}
function pin(p, cap = 1024 ** 3) {
  need(exact(p, ["path", "bytes", "sha256"]) && path.isAbsolute(p.path) && path.normalize(p.path) === p.path
    && !p.path.includes("\0") && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= cap
    && /^[a-f0-9]{64}$/.test(p.sha256), "file-pin");
}
function readPin(p, { privateFile = false, bytes = false, cap = 16 * 1024 * 1024, originalPostrun = false } = {}) {
  if (originalPostrun) need(bytes === false && p?.bytes === POSTRUN_BYTES && p?.sha256 === POSTRUN_SHA256
    && path.basename(p.path) === "image.raw", "exact-preserved-postrun-only");
  pin(p, originalPostrun ? POSTRUN_BYTES : bytes ? cap : 1024 ** 3);
  need(fs.realpathSync(p.path) === p.path, "canonical-file");
  const fields = ["dev", "ino", "size", "mode", "nlink", "uid", "gid", "mtimeNs", "ctimeNs"];
  const namedBefore = fs.lstatSync(p.path, { bigint: true });
  need(namedBefore.isFile(), "named-file-not-regular");
  // O_NONBLOCK closes the name-swap-to-FIFO race before fstat can reject it.
  const fd = fs.openSync(p.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size === BigInt(p.bytes)
      && fields.every(k => namedBefore[k] === before[k])
      && (!privateFile || (before.uid === BigInt(process.getuid()) && (before.mode & 0o077n) === 0n)), "original-file-metadata");
    const h = crypto.createHash("sha256"), blocks = [], buffer = Buffer.alloc(Math.min(p.bytes, 1024 * 1024));
    let total = 0, n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      total += n; need(total <= p.bytes, "file-grew"); h.update(buffer.subarray(0, n));
      if (bytes) blocks.push(Buffer.from(buffer.subarray(0, n)));
    }
    const after = fs.fstatSync(fd, { bigint: true });
    const namedAfter = fs.lstatSync(p.path, { bigint: true });
    need(total === p.bytes && h.digest("hex") === p.sha256
      && namedAfter.isFile() && fs.realpathSync(p.path) === p.path
      && fields.every(k => before[k] === after[k] && after[k] === namedAfter[k]), "actual-file-drift");
    return bytes ? Buffer.concat(blocks) : null;
  } finally { fs.closeSync(fd); }
}
function jsonPin(p) {
  const b = readPin(p, { privateFile: true, bytes: true });
  need(Buffer.from(b.toString("utf8")).equals(b), "metadata-utf8");
  let parsed; try { parsed = JSON.parse(b.toString("utf8")); } catch { need(false, "metadata-json"); } return parsed;
}
async function checkManifests(witness) {
  const code = jsonPin(witness.codeManifestPin), runtime = jsonPin(witness.runtimeManifestPin);
  need(exact(code, ["schema", "files"]) && code.schema === "helmut-local-unit-diagnostic-code-manifest/1"
    && exact(runtime, ["schema", "database", "sqlSources", "files", "transport"])
    && runtime.schema === "helmut-local-unit-diagnostic-runtime-manifest/1"
    && runtime.database === target().database && Array.isArray(code.files) && Array.isArray(runtime.files)
    && code.files.length > 0 && code.files.length <= 3000 && runtime.files.length > 0 && runtime.files.length <= 3000, "measured-manifests");
  const names = new Set(); let total = 0;
  for (const p of [...code.files, ...runtime.files]) {
    pin(p); need(!names.has(p.path), "duplicate-manifest-path"); names.add(p.path); total += p.bytes;
    need(total <= 1024 ** 3, "bounded-measured-closure"); readPin(p);
  }
  const codeNames = new Set(code.files.map(p => p.path));
  need(codeNames.has(__filename) && codeNames.has(path.join(__dirname, "storage.js"))
    && code.files.some(p => p.sha256 === witness.verifierCodeHash)
    && runtime.files.some(p => p.path === fs.realpathSync(process.execPath)), "actual-executable-code-closure");
  for (const filename of Object.keys(require.cache)) if (filename.startsWith(ROOT + path.sep))
    need(codeNames.has(filename), "loaded-code-outside-pinned-closure");
  const catalog = await rpc("contract", {}, { operationId: "localUnitDiagnostic-" + runtime.database.slice(-32), commandHash: witness.scopeHash });
  need(catalog.version === "helmut-local-unit-diagnostic-native-store/1" && catalog.database === runtime.database
    && /^[0-9]+$/.test(catalog.databaseOID) && isDeepStrictEqual(catalog.sources, runtime.sqlSources), "actual-native-catalog");
  return { code, runtime, catalog };
}
function checkedJSON(text, expected) {
  need(typeof text === "string" && sha(Buffer.from(text)) === expected, "actual-native-body-hash");
  let value; try { value = JSON.parse(text); } catch { need(false, "native-canonical-json"); }
  need(P.hash(value) === expected, "canonical-native-body"); return value;
}
async function readAuthority(selection) {
  selected(selection); const t = target();
  need(t.database === "helmut_unit_diagnostic_" + selection.operationId.slice(-32), "target-selection");
  const w = await rpc("authority_read", { p_scope_hash: selection.commandHash, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-authority-witness/1" && w.operationId === selection.operationId, "authority-witness");
  // NEW verifier ABI, bound again to the actual request bytes below.
  need(exact(w.requestModels, ["D", "R"]) && /^(gpt-5-mini)(?:-eu)?$/.test(w.requestModels.D)
    && w.requestModels.R === w.requestModels.D, "native-original-request-models");
  const command = checkedJSON(w.commandCanonical, selection.commandHash), admission = checkedJSON(w.admissionCanonical, w.admissionHash);
  authority().validateAdmission(command, admission, new Date().toISOString());
  need(P.hash(command.source) === w.sourceHash && P.hash(command.target) === w.targetHash
    && command.target.database === t.database
    && isDeepStrictEqual(w.gateHashes, Object.fromEntries(Object.entries(command.gatePins).map(([key, p]) => [key, p.sha256]))), "authority-current-bindings");
  const manifests = await checkManifests(w);
  // The authentic retained image is exactly 2 GiB. Hash it incrementally with
  // the same 1 MiB buffer; never parse, clone, return or allocate its payload.
  readPin(command.target.postrunPin, { privateFile: true, originalPostrun: true });
  for (const p of [...Object.values(command.gatePins), command.target.ownerEvidencePin,
    command.target.runtimeEvidencePin, command.target.sourceRuntimePin]) readPin(p, { privateFile: true });
  readPin(admission.authorizationPin, { privateFile: true });
  const Source = require("./local-unit-diagnostic-source");
  const terminalBytes = readPin(command.source.terminalPin, { bytes: true });
  const sourceHandle = Source.extractPinnedSource({
    packetBytes: readPin(command.source.packetPin, { privateFile: true, bytes: true }), packetPath: command.source.packetPin.path,
    installPinsBytes: readPin(command.source.installPin, { privateFile: true, bytes: true }), installPin: command.source.installPin,
    terminalBytes, diagnosticNonce: selection.operationId.slice(-32), preparedAtUTC: admission.authorizedAtUTC
  });
  need(P.hash(Source.verifyCommandSource(command, sourceHandle)) === w.sourceProofHash, "actual-source-proof-binding");
  const token = Object.freeze({});
  authorityProofs.set(token, { selection: clone(selection), command, admission, sourceHandle, witness: w, ...manifests, target: t, readAt: Date.now() });
  return token;
}
function consumeAuthority(proof, selection) {
  const d = authorityProofs.get(proof); authorityProofs.delete(proof);
  need(d && isDeepStrictEqual(d.selection, selected(selection)) && Date.now() - d.readAt <= 30000, "private-authority-proof");
  sameTarget(d.target); need(admitted.size === 0 || admitted.has(selection.commandHash), "one-owned-operation");
  admitted.set(selection.commandHash, d); return { command: clone(d.command), admission: clone(d.admission), sourceHandle: d.sourceHandle };
}
function admissionFor(selection) {
  selected(selection); const d = admitted.get(selection.commandHash);
  need(d && isDeepStrictEqual(d.selection, selection), "native-admission-not-consumed"); sameTarget(d.target); return d;
}
async function readRuntime(selection) {
  const a = admissionFor(selection), measured = await checkManifests(a.witness);
  const w = await rpc("runtime_read", { p_scope_hash: selection.commandHash, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-runtime-witness/1", "runtime-witness");
  const r = checkedJSON(w.canonical, w.hash);
  need(r.operationId === selection.operationId && r.commandHash === selection.commandHash
    && r.sourceHash === P.hash(a.command.source) && r.targetHash === P.hash(a.command.target)
    && isDeepStrictEqual(r.gateHashes, a.witness.gateHashes)
    && r.postrunSHA256 === a.command.target.postrunPin.sha256
    && r.codeManifestHash === a.witness.codeManifestPin.sha256 && r.runtimeManifestHash === a.witness.runtimeManifestPin.sha256
    && r.databaseOID === measured.catalog.databaseOID && r.observedAtUTC === w.observedAtUTC
    && Date.now() >= Date.parse(r.observedAtUTC) && Date.now() - Date.parse(r.observedAtUTC) <= 30000, "fresh-actual-runtime");
  const token = Object.freeze({}); runtimeProofs.set(token, { selection: clone(selection), r, readAt: Date.now() }); return token;
}
function consumeRuntime(proof, selection, command) {
  const d = runtimeProofs.get(proof); runtimeProofs.delete(proof);
  need(d && isDeepStrictEqual(d.selection, selected(selection)) && P.hash(command) === selection.commandHash
    && Date.now() - d.readAt <= 30000 && Date.now() - Date.parse(d.r.observedAtUTC) <= 30000, "private-runtime-proof");
  admissionFor(selection); return clone(d.r);
}
async function readState(selection) {
  selected(selection); const w = await rpc("state_read", { p_scope_hash: selection.commandHash, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-state-witness/1" && Number.isSafeInteger(w.revision) && w.revision >= 0, "state-witness");
  const state = checkedJSON(w.canonical, w.hash); authority().current(state, selection);
  stateProofs.set(state, { selection: clone(selection), hash: w.hash, revision: w.revision }); return state;
}
async function readBudgetUsage() {
  need(arguments.length === 0, "budget-reader-no-caller-input");
  const scope = optionalScope(), c = context(), selection = clone(c.selection), a = admissionFor(selection), t = target();
  const U = require("./llm-usage-atomic");
  const recheck = () => {
    need(context(selection) === c && admissionFor(selection) === a, "budget-scope-changed");
    sameTarget(t); scope.assertClock();
    need(U.enabled() && process.env.HELMUT_AUTH_STATE_STORAGE === "merkle-auth-v1"
      && process.env.HELMUT_AUTH_HISTORY_READ_REUSE === "verified-history-reuse-v1"
      && process.env.HELMUT_AUTH_GRAPH_READ_REUSE === "off", "budget-reader-mode");
    authority().validateAdmission(c.command, a.admission, new Date().toISOString());
  };
  recheck();
  // Consume the complete original reader, including its fresh native history
  // proof. A control projection or an own-state DTO cannot supply this history.
  const auth = await U.read({ rowId: "main-auth", target: t.origin + "|main-auth", request: (endpoint, options) => {
    recheck(); return legacyRead(endpoint, options);
  } });
  recheck();
  need(U.hasSnapshot(auth) && Array.isArray(auth.llmUsage), "budget-history-not-confirmed");
  scope.guard(auth); recheck();
  // Keep the original reader's immutable history. Never expose the full Auth
  // snapshot as a budget/control proof, or reconstruct a caller-owned snapshot.
  return auth.llmUsage;
}
async function mutateState(selection, change) {
  selected(selection); need(typeof change === "function", "state-change-function");
  const before = await readState(selection), proof = stateProofs.get(before), next = clone(before);
  stateProofs.set(next, proof); const result = change(next);
  need(!result || typeof result.then !== "function", "async-state-callback-forbidden");
  const hash = P.hash(next), canonical = P.kanonisch(next), keys = authority().keys(selection.operationId);
  need(hash !== proof.hash && sha(Buffer.from(canonical)) === hash, "native-next-canonical");
  const claim = next[keys.journal]?.claimId; need(typeof claim === "string", "native-claim-required");
  const writer = require("./local-unit-diagnostic-original-writer");
  const args = { selection, before: { state: before, canonical: P.kanonisch(before), hash: proof.hash, revision: proof.revision }, nextState: next };
  let w;
  try {
    if (current()) w = await writer.mutateState(args);
    else {
      const admittedAuthority = admissionFor(selection), previous = authority().current(before, selection), following = authority().current(next, selection);
      authority().validateAdmission(admittedAuthority.command, admittedAuthority.admission, new Date().toISOString());
      need(previous.journal.state === "installed" && previous.journal.claimId === null && following.journal.state === "running"
        && following.journal.claimId === claim && !originalClaimIssued.has(selection.commandHash), "original-first-claim-required");
      originalClaimIssued.add(selection.commandHash);
      const capability = Object.freeze({}), nativeTarget = target();
      originalClaimCapabilities.set(capability, { selection: clone(selection), before: { hash: proof.hash, revision: proof.revision },
        ownNext: { canonical, hash }, command: clone(admittedAuthority.command),
        legacyRead: (endpoint, options = {}) => {
          need(/^\/rest\/v1\/rpc\/helmut_auth_(?:state_graph|usage)_read_v1$/.test(endpoint)
            && String(options.method || "GET").toUpperCase() === "POST", "original-claim-reader-only");
          let body; try { body = JSON.parse(options.body); } catch { need(false, "original-claim-reader-body"); }
          need(body?.id === "main-auth", "original-claim-row");
          authority().validateAdmission(admittedAuthority.command, admittedAuthority.admission, new Date().toISOString());
          return performLegacyRead(selection, nativeTarget, endpoint, options);
        } });
      w = await writer.claimState(args, capability);
    }
    need(w.version === "helmut-local-unit-diagnostic-state-ack/1" && w.hash === hash
      && w.revision === proof.revision + 1 && w.claimHash === sha(Buffer.from(claim)), "native-state-ack-unknown");
    if (next[keys.journal].state === "closed") {
      const verification = next[keys.journal].verification;
      need(exact(verification, ["authorizationHash", "controlsHash", "controlCount"])
        && w.authorizationHash === verification.authorizationHash && w.controlsHash === verification.controlsHash
        && w.controlCount === 16, "native-final-verification-ack-unknown");
    }
    // Exact persisted readback; neither an ACK-shaped JSON nor a local callback
    // return alone advances the caller. Ambiguous outcomes are never retried.
    const back = await readState(selection), backProof = stateProofs.get(back);
    need(backProof.revision === w.revision && backProof.hash === hash && isDeepStrictEqual(back, next), "state-readback-unknown");
    return result;
  } catch (error) { writer.sealUnknown(selection); throw error; }
}
function consumeOriginalWriterClaimCapability(capability) {
  const value = originalClaimCapabilities.get(capability); originalClaimCapabilities.delete(capability);
  need(value, "private-original-claim-capability");
  const a = admissionFor(value.selection);
  authority().validateAdmission(a.command, a.admission, new Date().toISOString());
  need(P.hash(a.command) === value.selection.commandHash, "original-claim-command");
  return value;
}
async function assertContract() {
  const c = context(), a = admissionFor(c.selection); await checkManifests(a.witness); return true;
}
async function readArtifact(selection, kind, logicalId, expectedHash = null) {
  context(selection);
  const w = await rpc("artifact_read", { p_scope_hash: selection.commandHash, p_kind: kind, p_logical_id: logicalId,
    p_expected_sha256: expectedHash, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-artifact-witness/1" && w.kind === kind && w.logicalId === logicalId, "artifact-witness");
  if (w.missing === true) { need(expectedHash === null, "required-artifact-missing"); return null; }
  need(w.owner === context().command.units[0].subject && (expectedHash === null || expectedHash === w.hash), "artifact-owner-hash");
  return checkedJSON(w.canonical, w.hash);
}
async function insertArtifact(selection, kind, logicalId, body, parentHash = null) {
  context(selection); const state = await readState(selection), proof = stateProofs.get(state), hash = P.hash(body);
  const writer = require("./local-unit-diagnostic-original-writer");
  try {
    const result = await writer.appendArtifact({ selection,
      before: { state, canonical: P.kanonisch(state), hash: proof.hash, revision: proof.revision }, kind, logicalId, body, parentHash });
    const w = result?.ownAck;
    need(result?.originalRowAck && w?.version === "helmut-local-unit-diagnostic-artifact-ack/1" && w.kind === kind && w.logicalId === logicalId
      && w.hash === hash && w.stateRevision === proof.revision, "artifact-insert-unknown");
    need(isDeepStrictEqual(await readArtifact(selection, kind, logicalId, hash), body), "artifact-readback-unknown");
    return { saved: true, id: logicalId, hash };
  } catch (error) { writer.sealUnknown(selection); throw error; }
}
async function readOriginalControl(selection) {
  context(selection); const a = admissionFor(selection), gate = jsonPin(a.command.gatePins.source);
  need(gate?.schema === "helmut-local-unit-native-source-gate/1" && typeof gate.originalControlHash === "string"
    && /^[a-f0-9]{64}$/.test(gate.originalControlHash) && a.command.gatePins.source.sha256 === a.witness.gateHashes.source, "original-control-source-gate");
  const U = require("./llm-usage-atomic");
  need(U.controlReadEnabled() === true, "original-control-mode-required");
  const t = target(), view = await U.readControl({ request: legacyRead, rowId: "main-auth", target: t.origin + "|main-auth" });
  sameTarget(t);
  const keys = ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"];
  need(exact(view, [...keys, "_authStoreRevision"]), "original-control-view");
  const projection = Object.fromEntries(keys.map(key => [key, view[key]]));
  need(P.hash(projection) === gate.originalControlHash, "original-control-drift");
  return projection; // Four genuine fields only; no revision, own state, clone or write snapshot.
}
function viewKind(slot) { need(["lage", "mandatsbriefing", "morgenlage"].includes(slot), "output-slot"); return slot === "morgenlage" ? "morgenbriefing" : slot; }
async function renderedRead(owner, slot, day, opts = {}) {
  const c = context(); need(owner === c.command.units[0].subject && day === c.command.calendar.executionDayUTC && opts.profilHash === undefined, "output-owner-day");
  return readArtifact(c.selection, viewKind(slot), `bf-${owner}-${slot}-${day}`);
}
async function renderedInsert(entry) {
  const c = context(), kind = viewKind(entry.slot), day = c.command.calendar.executionDayUTC;
  need(entry.user_id === c.command.units[0].subject && entry.id === `bf-${entry.user_id}-${entry.slot}-${day}`, "output-entry");
  const parentKind = { lage: "review", mandatsbriefing: "lage", morgenbriefing: "mandatsbriefing" }[kind];
  const parentId = parentKind === "review" ? draftId(c.command, "pruefung")
    : `bf-${entry.user_id}-${parentKind}-${day}`;
  const parent = await readArtifact(c.selection, parentKind, parentId); need(parent, "output-parent-missing");
  return insertArtifact(c.selection, kind, entry.id, entry, P.hash(parent));
}
function draftId(command, phase) { return `bf-${command.units[0].subject}-lage-pruefentwurf-${command.calendar.executionDayUTC}-${command.slot.plan.runId}-${phase}`; }
async function draftRead(owner, id) {
  const c = context(); need(owner === c.command.units[0].subject, "draft-owner");
  const phase = id === draftId(c.command, "entwurf") ? "draft" : id === draftId(c.command, "pruefung") ? "review" : null;
  need(phase, "draft-identity"); return readArtifact(c.selection, phase, id);
}
async function draftInsert(entry) {
  const c = context(), phase = entry.payload?.phase;
  need(["entwurf", "pruefung"].includes(phase) && entry.id === draftId(c.command, phase)
    && entry.user_id === c.command.units[0].subject && entry.slot === "lage-pruefentwurf"
    && entry.payload.auslieferbar === false && entry.payload.qualitaetBestanden === false, "draft-entry");
  let parent = null;
  if (phase === "pruefung") {
    const d = await readArtifact(c.selection, "immutable-D", c.command.slot.plan.intents[0].id); need(d, "review-parent-missing"); parent = P.hash(d);
  }
  return insertArtifact(c.selection, phase === "entwurf" ? "draft" : "review", entry.id, entry, parent);
}
async function recordUsage(entry, ticket) {
  const c = context(); optionalScope().assertTicket(ticket);
  const Transport = require("./local-unit-diagnostic-transport");
  Transport.assertTicket(ticket);
  const actualModel = Transport.model();
  need(ticket.execution?.commandHash === c.selection.commandHash && ["D", "R"].includes(ticket.admission?.phase), "usage-ticket");
  // The fixed AI choke passes its actual Responses usage object unchanged.
  // Missing/null token counts remain unknown; no normalized legacy fallback.
  const input = entry.usage?.input_tokens, output = entry.usage?.output_tokens;
  const phaseMaxOutput = ticket.admission.phase === "D" ? 3000 : 6000;
  need(ticket.maxOutputTokens === phaseMaxOutput && Number.isSafeInteger(input) && input >= 0 && input <= 272000
    && Number.isSafeInteger(output) && output >= 0 && output <= ticket.maxOutputTokens
    && (entry.usage.total_tokens === undefined || Number.isSafeInteger(entry.usage.total_tokens) && entry.usage.total_tokens === input + output)
    && typeof entry.success === "boolean", "actual-usage-unavailable");
  const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), model: actualModel, promptTokens: input,
    completionTokens: output, totalTokens: input + output, estimatedCost: Math.ceil((275 * input + 2200 * output) / 1000) / 1000000,
    success: entry.success, scopeHash: c.selection.commandHash, budgetTicketId: ticket.id, costIntentId: ticket.admission.intentId,
    costPlanHash: ticket.admission.planHash, costRequestHash: ticket.admission.actualRequestHash, costPhase: ticket.admission.phase,
    runId: ticket.admission.runId, politicianId: c.command.units[0].subject, costBasis: "local-fixture-simulation-not-provider-charge" };
  need(entry.model === record.model && entry.politicianId === record.politicianId && entry.runId === record.runId, "usage-original-metadata");
  const before = await readState(c.selection), proof = stateProofs.get(before);
  const persisted = await require("./local-unit-diagnostic-original-writer").appendUsage({ selection: c.selection,
    before: { state: before, canonical: P.kanonisch(before), hash: proof.hash, revision: proof.revision }, record, ticket });
  need(persisted?.receipt && persisted.ownAck?.hash === P.hash(record), "original-usage-not-confirmed");
  const handle = Object.freeze({}); usageReceipts.set(handle, { selection: clone(c.selection), ticket: P.hash(ticket), record, recordHash: P.hash(record) }); return handle;
}
function readUsageReceipt(handle, ticket) {
  const d = usageReceipts.get(handle); if (!d) return null;
  const c = context(); optionalScope().assertTicket(ticket);
  need(isDeepStrictEqual(c.selection, d.selection) && d.ticket === P.hash(ticket), "private-usage-receipt"); return clone({ record: d.record, recordHash: d.recordHash });
}
function usagePersisted(state, handle, ticket) {
  const d = usageReceipts.get(handle), p = stateProofs.get(state); if (!d || !p) return false;
  const c = context(); optionalScope().assertTicket(ticket);
  const a = authority().current(state, c.selection), call = a.costs.calls[ticket.id];
  return isDeepStrictEqual(p.selection, d.selection) && d.ticket === P.hash(ticket) && call?.status === "sent"
    && P.hash(call.ticket) === d.ticket && d.recordHash === P.hash(d.record);
}
async function evidenceInsert(selection, body) { return insertArtifact(selection, "evidence", "diagnostic-result", body); }
async function evidenceRead(selection) { return readArtifact(selection, "evidence", "diagnostic-result"); }
async function acquireLock(jobName, ttlMs) {
  const c = context();
  need(jobName === "lage-briefing-" + c.command.units[0].subject && Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 600000, "owned-lock-job");
  const state = await readState(c.selection); optionalScope().guard(state);
  const claimHash = sha(Buffer.from(authority().current(state, c.selection).journal.claimId));
  const w = await rpc("lease_acquire", { p_scope_hash: c.selection.commandHash, p_claim_hash: claimHash,
    p_job: jobName, p_ttl_ms: ttlMs, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-lease-ack/1" && w.job === jobName && w.claimHash === claimHash, "native-lease-ack");
  if (w.acquired === false) { need(w.token === null, "native-lease-contention"); return null; }
  need(w.acquired === true && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(w.token)
    && Number.isSafeInteger(w.revision) && w.revision >= 0 && Date.parse(w.expiresAtUTC) > Date.now(), "native-lease-ownership");
  const handle = Object.freeze({}); locks.set(handle, { selection: clone(c.selection), claimHash, jobName, token: w.token }); return handle;
}
async function releaseLock(handle) {
  const d = locks.get(handle); locks.delete(handle); need(d, "private-lock-handle"); context(d.selection);
  const w = await rpc("lease_release", { p_scope_hash: d.selection.commandHash, p_claim_hash: d.claimHash,
    p_job: d.jobName, p_token: d.token, p_nonce: nonce() });
  need(w.version === "helmut-local-unit-diagnostic-lease-release/1" && w.job === d.jobName
    && w.claimHash === d.claimHash && typeof w.released === "boolean", "native-lease-release-unknown");
  return w.released;
}
async function readTransportOriginals(selection) {
  const a = admissionFor(selection), r = a.runtime, meta = r.transport;
  // NEW source-verifier ABI. Response/latency outputs are pure-producer
  // derivations, not purported historical raw capture files. This consumer
  // neither guesses any private original schema nor produces replacement bytes.
  need(exact(meta, ["schema", "originalPins", "phases"])
    && meta.schema === "helmut-local-unit-diagnostic-source-producer-transport/1"
    && exact(meta.originalPins, ["preparedRequests", "actualRequestBindings", "providerFixtures"])
    && exact(meta.phases, ["D", "R"]), "original-transport-metadata");
  need(path.basename(meta.originalPins.preparedRequests.path) === "NEW_PREPARED_REQUESTS.PRIVATE.json"
    && path.basename(meta.originalPins.actualRequestBindings.path) === "ALL500_ACTUAL_REQUEST_TEMPLATE_BINDINGS.SAFE.json", "original-request-source-names");
  for (const p of Object.values(meta.originalPins)) readPin(p, { privateFile: true });
  const selectedSource = require("./local-unit-diagnostic-source").readSelection(a.sourceHandle), phases = {};
  // Reproduce the actual selected bytes from all three authentic original
  // inputs. A matching producer/output manifest alone is never a derivation.
  const Producer = require("./local-unit-diagnostic-original-producer");
  const derived = Producer.derive({ sourceHandle: a.sourceHandle,
    preparedBytes: readPin(meta.originalPins.preparedRequests, { privateFile: true, bytes: true }),
    bindingBytes: readPin(meta.originalPins.actualRequestBindings, { privateFile: true, bytes: true }),
    fixtureBytes: readPin(meta.originalPins.providerFixtures, { privateFile: true, bytes: true }) });
  need(derived.sourceIndex === 499 && derived.diagnosticUnit === 0 && exact(derived.phases, ["D", "R"]), "fresh-original-derivation");
  for (const [index, phase] of ["D", "R"].entries()) {
    const x = meta.phases[phase];
    need(exact(x, ["sourceIntentId", "requestPin", "derivedResponsePin", "derivedLatencyPin", "responseStatus", "latencyMs", "derivation"])
      && x.sourceIntentId === selectedSource.intents[index].id && x.requestPin.bytes === a.command.requestPins[phase].bytes
      && x.requestPin.sha256 === a.command.requestPins[phase].sha256, "original-capture-binding");
    const d = x.derivation;
    need(exact(d, ["schema", "producerPin", "inputPins", "originalPinsHash", "requestSHA256", "responseSHA256", "latencySHA256"])
      && d.schema === "helmut-local-unit-diagnostic-pure-producer-derivation/1"
      && Array.isArray(d.inputPins) && d.inputPins.length > 0 && d.inputPins.length <= 32
      && d.originalPinsHash === P.hash(meta.originalPins)
      && Object.values(meta.originalPins).every(p => d.inputPins.some(input => isDeepStrictEqual(input, p)))
      && d.producerPin.path === path.join(__dirname, "local-unit-diagnostic-original-producer.js")
      && a.code.files.some(p => isDeepStrictEqual(p, d.producerPin))
      && d.requestSHA256 === x.requestPin.sha256 && d.responseSHA256 === x.derivedResponsePin.sha256
      && d.latencySHA256 === x.derivedLatencyPin.sha256, "source-producer-derivation-binding");
    // Executable source is already bound in the read-only code closure. Only
    // original input files use the private-data permissions contract.
    readPin(d.producerPin);
    for (const p of d.inputPins) readPin(p, { privateFile: true });
    phases[phase] = { sourceIntentId: x.sourceIntentId, requestBytes: readPin(x.requestPin, { privateFile: true, bytes: true }),
      responseBytes: readPin(x.derivedResponsePin, { privateFile: true, bytes: true, cap: 8 * 1024 * 1024 }),
      latencyBytes: readPin(x.derivedLatencyPin, { privateFile: true, bytes: true, cap: 65536 }), responseStatus: x.responseStatus, latencyMs: x.latencyMs };
    const produced = derived.phases[phase];
    need(produced && ["requestBytes", "responseBytes", "latencyBytes"].every(k => Buffer.isBuffer(produced[k]) && produced[k].equals(phases[phase][k]))
      && produced.responseStatus === x.responseStatus && produced.latencyMs === x.latencyMs, "fresh-derived-output-mismatch");
    need(Buffer.from(phases[phase].requestBytes.toString("utf8")).equals(phases[phase].requestBytes), "actual-request-utf8");
    let request; try { request = JSON.parse(phases[phase].requestBytes.toString("utf8")); } catch { need(false, "actual-request-json"); }
    need(request.model === a.witness.requestModels[phase], "actual-request-model-binding");
  }
  const proof = Object.freeze({}); transportProofs.set(proof, { selection: clone(selection), sourceHandle: a.sourceHandle,
    originalPins: clone(meta.originalPins), phases, readAt: Date.now() }); return proof;
}
function consumeTransportOriginals(proof, selection, command) {
  const d = transportProofs.get(proof); transportProofs.delete(proof);
  need(d && isDeepStrictEqual(d.selection, selected(selection)) && P.hash(command) === selection.commandHash
    && Date.now() - d.readAt <= 30000, "private-original-transport-proof");
  admissionFor(selection); return { schema: "helmut-local-unit-diagnostic-transport-originals/1", selection: clone(selection),
    sourceHandle: d.sourceHandle, originalPins: clone(d.originalPins), phases: d.phases };
}
function denyLegacyWrite() { need(false, "legacy-write-forbidden"); }
function guardLegacyRead(endpoint, options = {}) {
  const c = context(); admissionFor(c.selection);
  const method = String(options.method || "GET").toUpperCase();
  need((method === "GET" && /^\/rest\/v1\/[a-z][a-z0-9_]*(?:\?|$)/.test(endpoint))
    || (method === "POST" && /^\/rest\/v1\/rpc\/helmut_auth_(?:state_graph|usage)_read_v1$/.test(endpoint)), "legacy-write-or-rpc-forbidden");
}
async function legacyRead(endpoint, options = {}) {
  guardLegacyRead(endpoint, options); const c = context(), t = target();
  return performLegacyRead(c.selection, t, endpoint, options);
}
async function performLegacyRead(selection, t, endpoint, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  need(options.body === undefined || typeof options.body === "string", "legacy-read-body");
  const body = Buffer.from(options.body || ""); need(method !== "GET" || body.length === 0, "legacy-get-body");
  const response = await require("./local-unit-diagnostic-endpoint").request(selection, t.database, method, endpoint, body);
  sameTarget(t); need(response.status === 200, "legacy-read-not-confirmed");
  need(response.body.length <= (options.maxResponseBytes || 36 * 1024 * 1024), "legacy-read-cap");
  need(Buffer.from(response.body.toString("utf8")).equals(response.body), "legacy-read-utf8");
  try { return JSON.parse(response.body.toString("utf8")); } catch { need(false, "legacy-read-json"); }
}
module.exports = Object.freeze({ active, current, readAuthority, consumeAuthority, readRuntime, consumeRuntime, readState, mutateState,
  assertContract, insertArtifact, readArtifact, renderedRead, renderedInsert, draftRead, draftInsert, recordUsage, readUsageReceipt,
  usagePersisted, evidenceInsert, evidenceRead, acquireLock, releaseLock, readTransportOriginals, consumeTransportOriginals, denyLegacyWrite,
  guardLegacyRead, legacyRead, consumeOriginalWriterClaimCapability, readOriginalControl, readBudgetUsage });
