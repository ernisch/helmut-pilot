"use strict";
// Native immutable-content proof. Authority, time, finance and journal guards
// remain fresh at their original callers; this proof supplies content only.
const crypto = require("node:crypto"), { performance } = require("node:perf_hooks");
const runner = require("./synthetik-500-content-runner");
const nativePins = Object.freeze({ ...require("./synthetik-500-stored-command-native-pins.json").nativeSources });
const VERSION = "helmut-s500-stored-command-binding/1", MAX_BYTES = 16 * 1024 * 1024;
const fail = code => { throw Error("synthetik500-stored-command-" + code); };
function selection(x) {
  if (!x || Object.keys(x).sort().join("|") !== "commandHash|operationId"
    || !/^synthetik500-[a-z0-9-]{8,80}$/.test(x.operationId || "")
    || !/^[a-f0-9]{64}$/.test(x.commandHash || "")) fail("selector");
  return Object.freeze({ operationId: x.operationId, commandHash: x.commandHash });
}
function identity(row) {
  return JSON.stringify([row.rowId, row.database, row.tableOID, row.xmin, row.ctid, row.storedBytes, row.storedSHA256]);
}
function checkedBinding(row, selected, nonce, includeData) {
  if (!row || row.version !== VERSION || row.nonce !== nonce
    || row.rowId !== "synthetik500-command-" + selected.operationId
    || typeof row.database !== "string" || !row.database || !/^[0-9]+$/.test(row.tableOID || "")
    || !/^[0-9]+$/.test(row.xmin || "") || !/^\([0-9]+,[0-9]+\)$/.test(row.ctid || "")
    || !Number.isSafeInteger(row.storedBytes) || row.storedBytes < 1 || row.storedBytes > MAX_BYTES
    || !/^[a-f0-9]{64}$/.test(row.storedSHA256 || "") || !row.nativeSources
    || Object.keys(row.nativeSources).sort().join("|") !== Object.keys(nativePins).sort().join("|")
    || Object.keys(nativePins).some(k => row.nativeSources[k] !== nativePins[k])) fail("native-binding");
  if (includeData) {
    if (typeof row.dataText !== "string" || Buffer.byteLength(row.dataText) !== row.storedBytes
      || crypto.createHash("sha256").update(row.dataText, "utf8").digest("hex") !== row.storedSHA256) fail("actual-stored-bytes");
  } else if (row.dataText !== null) fail("unexpected-body");
  return row;
}
function freezeGraph(root) {
  const seen = new WeakSet(); let objects = 0, edges = 0;
  function visit(value, depth) {
    if (value === null || typeof value !== "object") return;
    if (depth > 80) fail("graph-depth");
    if (seen.has(value)) return;
    if (++objects > 200000 || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) fail("graph-shape");
    seen.add(value);
    for (const child of Object.values(value)) { if (++edges > 2000000) fail("graph-edges"); visit(child, depth + 1); }
    Object.freeze(value);
  }
  visit(root, 0); return { objects, edges };
}
const CERT = "helmut-s500-content-proof/1", AUTHORITY = "helmut-s500-root-authority/1";
const MAX_AGE = 9 * 3600000, PUBLIC_KEY = "HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY";
const PRIVATE_KEY = "HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY";
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
function keyMaterial(signing = false) {
  const publicKey = crypto.createPublicKey(process.env[PUBLIC_KEY] || "");
  if (publicKey.asymmetricKeyType !== "ed25519") fail("issuer-key");
  const id = sha(publicKey.export({ type: "spki", format: "der" }));
  if (!signing) return { publicKey, id };
  const privateKey = crypto.createPrivateKey(process.env[PRIVATE_KEY] || "");
  if (privateKey.asymmetricKeyType !== "ed25519"
    || sha(crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" })) !== id) fail("issuer-key");
  return { publicKey, privateKey, id };
}
function signed(payload) {
  const key = keyMaterial(true);
  if (payload[1] !== key.id) fail("issuer-key");
  return Object.freeze({ payload: Object.freeze(payload), signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)), key.privateKey).toString("base64") });
}
function verified(value, domain, length) {
  const key = keyMaterial();
  if (!value || Object.keys(value).sort().join("|") !== "payload|signature"
    || !Array.isArray(value.payload) || value.payload.length !== length || value.payload[0] !== domain
    || value.payload[1] !== key.id || typeof value.signature !== "string") fail("certificate-shape");
  const bytes = Buffer.from(value.signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== value.signature
    || !crypto.verify(null, Buffer.from(JSON.stringify(value.payload)), key.publicKey, bytes)) fail("certificate-signature");
  return value.payload;
}
const canonicalAuthority = x => require("./synthetik-500-profile").kanonisch(x);
function createBackend(request, target) {
  if (typeof request !== "function" || typeof target !== "function") fail("backend");
  const tokens = new WeakMap(), proofs = new WeakMap(); let current = null, busy = false, activeSession = null;
  function revoke() { if (current) { current.revoked = true; current.packet = null; current.base = null; } current = null; }
  function rowId(kind, selected, sources = "") {
    return "synthetik500-command-synthetik500-" + kind + "-" + sha(JSON.stringify([selected.operationId, selected.commandHash, target(), sources])).slice(0, 48);
  }
  async function privateRow(id, timeoutMs, missing = false) {
    const rows = await request("/rest/v1/helmut_store?id=eq." + encodeURIComponent(id) + "&select=id,data&limit=2", { timeoutMs, maxResponseBytes: MAX_BYTES });
    if (missing && Array.isArray(rows) && rows.length === 0) return null;
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id || !rows[0].data) fail("private-read");
    return rows[0].data;
  }
  async function insert(id, data, timeoutMs) {
    const rows = await request("/rest/v1/helmut_store?select=id", { method: "POST", timeoutMs, maxResponseBytes: MAX_BYTES,
      headers: { Prefer: "return=representation" }, body: JSON.stringify({ id, data }) });
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id) fail("insert-unknown");
    const actual = await privateRow(id, timeoutMs);
    if (JSON.stringify(actual.payload) !== JSON.stringify(data.payload) || actual.signature !== data.signature) fail("insert-readback");
  }
  async function readNative(selected, includeData, timeoutMs) {
    const nonce = crypto.randomBytes(32).toString("hex");
    const row = await request("/rest/v1/rpc/helmut_s500_read_command_binding_v1", { method: "POST", timeoutMs,
      maxResponseBytes: MAX_BYTES, body: JSON.stringify({ p_operation_id: selected.operationId, p_nonce: nonce, p_include_data: includeData }) });
    return checkedBinding(row, selected, nonce, includeData);
  }
  function checkCertificate(cert, selected, sources, row = null) {
    const p = verified(cert, CERT, 13), now = Date.now(), issued = Date.parse(p[10]), expires = Date.parse(p[11]);
    if (p[2] !== selected.operationId || p[3] !== selected.commandHash || p[4] !== target() || p[5] !== sources
      || p[7] !== sha(JSON.stringify(nativePins)) || p[8] !== process.version
      || p[9] !== sha(process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON ?? "null")
      || !Number.isFinite(issued) || !Number.isFinite(expires) || new Date(issued).toISOString() !== p[10]
      || new Date(expires).toISOString() !== p[11] || issued > now || expires <= now || expires <= issued || expires - issued > MAX_AGE
      || !Number.isFinite(p[12]) || p[12] < 0 || p[12] > 90000 || row && p[6] !== identity(row)) fail("certificate-binding");
    return { expires, issued };
  }
  function establish(answer, selected, sources, row, cert) {
    const dates = checkCertificate(cert, selected, sources, row);
    if (answer.storedSHA256 !== row.storedSHA256 || answer.commandHash !== selected.commandHash
      || answer.operationId !== selected.operationId || !answer.packet?.command) fail("worker-binding");
    if (dates.expires > Date.parse(answer.packet.command.slot.plan.endsAtUTC)) fail("certificate-plan-expiry");
    // Only content is retained. Old embedded authority is never imported as a
    // current permission. Every authority packet comes from a fresh signed row.
    const base = Object.freeze({ command: answer.packet.command, admission: null, testAuthority: null,
      ...(answer.packet.commandPin ? { commandPin: answer.packet.commandPin } : {}) });
    current = { selected, target: target(), sources, identity: identity(row), base, packet: base, authority: null,
      encodedHash: sha(canonicalAuthority(JSON.parse(row.dataText))),
      cert, expires: performance.now() + (dates.expires - Date.now()), revoked: false, runtimeDerivation: null };
    return current;
  }
  function session(record, kind) {
    if (activeSession && !activeSession.closed && activeSession.kind !== "offline") fail("execution-busy");
    if (activeSession) activeSession.closed = true;
    const token = Object.freeze(Object.create(null)), value = { record, token, kind, closed: false };
    tokens.set(token, value); activeSession = value; return token;
  }
  function liveRecord(token, args) {
    const selected = selection(args), owner = tokens.get(token), record = owner?.record;
    if (!owner || owner.closed || owner !== activeSession || !record || record !== current || record.revoked
      || performance.now() >= record.expires || selected.operationId !== record.selected.operationId
      || selected.commandHash !== record.selected.commandHash || target() !== record.target || runner.sourceBinding() !== record.sources) fail("context");
    checkCertificate(record.cert, selected, record.sources);
    if (Date.now() >= Date.parse(record.base.command.slot.plan.endsAtUTC)) fail("plan-expired");
    return record;
  }
  async function authority(record, token, timeoutMs) {
    const value = await privateRow(rowId("authority", record.selected), timeoutMs, true);
    if (value === null) {
      if (!["offline", "installation"].includes(tokens.get(token)?.kind)) fail("root-authority-required");
      if (record.authority !== null) fail("authority-disappeared");
      return record.base;
    }
    const p = verified(value, AUTHORITY, 7);
    if (p[2] !== record.selected.operationId || p[3] !== record.selected.commandHash || p[4] !== record.target
      || p[5] !== record.sources || typeof p[6] !== "string") fail("authority-binding");
    const data = JSON.parse(p[6]);
    if (!data || Object.keys(data).sort().join("|") !== "admission|testAuthority" || canonicalAuthority(data) !== p[6]) fail("authority-shape");
    const id = JSON.stringify(value.payload) + value.signature;
    if (record.authority !== id) {
      if (record.authority !== null) fail("authority-changed");
      record.packet = { ...record.base, admission: data.admission, testAuthority: data.testAuthority };
      freezeGraph(record.packet); record.authority = id;
    }
    return record.packet;
  }
  async function prepare(args) {
    if (busy || activeSession && !activeSession.closed && activeSession.kind !== "offline") fail("busy");
    keyMaterial(true); busy = true; revoke(); const start = performance.now(), phases = [];
    const phase = async (name, body) => { const at = performance.now(); try { return await body(); }
      finally { phases.push({ name, wallMs: performance.now() - at }); } };
    const remaining = () => { const ms = 90000 - (performance.now() - start); if (ms <= 0) fail("offline-deadline"); return ms; };
    try {
      const selected = selection(args), initialTarget = target(), sources = runner.sourceBinding();
      if (await privateRow(rowId("proof", selected, sources), remaining(), true)) fail("proof-already-issued");
      const row = await phase("readAndHashActualStoredRow", () => readNative(selected, true, remaining()));
      const answer = await phase("isolatedFullContentValidation", () => runner.validateStoredContent({
        dataText: row.dataText, storedSHA256: row.storedSHA256, ...selected }, remaining()));
      const command = answer.packet?.command, diagnostics = answer.diagnostics;
      // A source-pinned worker may attest one COMPLETE original C for ordinary
      // v1 without entering the historical-v2 CPU optimisation. No C is skipped.
      const ordinaryLegacyC = command?.version === "helmut-synthetik500-production-command/2-direct"
        && command.mode === "D-R-500" && Array.isArray(command.drafts) && command.drafts.length === 500
        && command.drafts.every(d => d.briefingEingabe?.version === 1)
        && diagnostics?.enteredCount === 0 && diagnostics.qualifiedFalseCount === 1
        && diagnostics.lastFailure === "unsupported-command-dispatch";
      if (answer.mode !== "full" || diagnostics?.commandCalls !== 1
        || !(diagnostics?.enteredCount === 1 || ordinaryLegacyC)
        || answer.diagnostics?.codecEnteredCount !== 1 || answer.storedSHA256 !== row.storedSHA256
        || answer.commandHash !== selected.commandHash || answer.operationId !== selected.operationId) fail("worker-binding");
      const graph = await phase("freezeReturnedGraph", () => freezeGraph(answer.packet));
      const fresh = await phase("freshNativeRecheck", () => readNative(selected, false, remaining()));
      if (identity(row) !== identity(fresh) || target() !== initialTarget || runner.sourceBinding() !== sources) fail("preparation-drift");
      const issued = Date.now(), end = Math.min(issued + MAX_AGE, Date.parse(answer.packet.command.slot.plan.endsAtUTC));
      if (!(end > issued)) fail("plan-expired");
      const cert = signed([CERT, keyMaterial().id, selected.operationId, selected.commandHash, initialTarget, sources,
        identity(fresh), sha(JSON.stringify(nativePins)), process.version, sha(process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON ?? "null"),
        new Date(issued).toISOString(), new Date(end).toISOString(), performance.now() - start]);
      await phase("retainSignedContentProof", () => insert(rowId("proof", selected, sources), cert, remaining())); remaining();
      const record = establish(answer, selected, sources, { ...fresh, dataText: row.dataText }, cert), token = session(record, "offline");
      return Object.freeze({ token, metrics: Object.freeze({ wallMs: performance.now() - start, phases,
        workerPhases: answer.phases, diagnostics: answer.diagnostics, facts: answer.facts, graph,
        maxRSSBytes: process.resourceUsage().maxRSS * 1024 }), contentOnly: true, executionAuthorized: false });
    } catch (error) { revoke(); error.preparationPhases = phases; throw error; }
    finally { busy = false; }
  }
  async function open(args, installation = false) {
    if (busy || activeSession && !activeSession.closed && activeSession.kind !== "offline") fail("busy");
    if (installation) keyMaterial(true);
    busy = true; const started = performance.now(), phases = []; let opened = null;
    const remaining = () => { const ms = 60000 - (performance.now() - started); if (ms <= 0) fail("restore-deadline"); return ms; };
    try {
      const selected = selection(args), sources = runner.sourceBinding();
      if (current) {
        if (current.selected.operationId !== selected.operationId || current.selected.commandHash !== selected.commandHash) fail("different-content-active");
        checkCertificate(current.cert, selected, sources);
      } else {
        const initialTarget = target(), cert = await privateRow(rowId("proof", selected, sources), remaining());
        checkCertificate(cert, selected, sources);
        const row = await readNative(selected, true, remaining()); checkCertificate(cert, selected, sources, row);
        const at = performance.now(), answer = await runner.restoreStoredContent({ dataText: row.dataText,
          storedSHA256: row.storedSHA256, ...selected }, remaining());
        phases.push({ name: "restoreFullTWithoutC", wallMs: performance.now() - at, workerPhases: answer.phases });
        if (answer.mode !== "restore" || answer.diagnostics?.commandCalls !== 0 || answer.diagnostics?.codecEnteredCount !== 1) fail("restore-worker");
        freezeGraph(answer.packet); const fresh = await readNative(selected, false, remaining());
        if (identity(row) !== identity(fresh) || target() !== initialTarget || runner.sourceBinding() !== sources) fail("restore-drift");
        establish(answer, selected, sources, { ...fresh, dataText: row.dataText }, cert);
      }
      remaining(); const token = session(current, installation ? "installation" : "request"); opened = token;
      // No execution scope exists until this fresh actual native binding passes.
      busy = false; await read(token, selected); remaining();
      return Object.freeze({ token, metrics: Object.freeze({ wallMs: performance.now() - started, phases, offline: false,
        maxRSSBytes: process.resourceUsage().maxRSS * 1024 }), contentOnly: true, executionAuthorized: false });
    } catch (error) { if (opened) release(opened); revoke(); error.preparationPhases = phases; throw error; }
    finally { busy = false; }
  }
  async function read(token, args) {
    if (busy) fail("busy"); busy = true;
    try {
      const record = liveRecord(token, args), row = await readNative(record.selected, false, Math.min(30000, record.expires - performance.now()));
      if (identity(row) !== record.identity) fail("reuse-drift");
      const packet = await authority(record, token, Math.min(30000, record.expires - performance.now()));
      if (liveRecord(token, args) !== record) fail("reuse-drift");
      return packet;
    } catch (error) { revoke(); throw error; }
    finally { busy = false; }
  }
  async function readProof(token, args, packet) {
    if (busy) fail("busy");
    try {
      const record = liveRecord(token, args);
      if (record.packet !== packet) fail("packet-identity");
      const actual = await read(token, args);
      if (actual !== packet) fail("packet-drift");
      const proof = Object.freeze(Object.create(null));
      proofs.set(proof, { record, token, packet, authority: record.authority }); return proof;
    } catch (error) { revoke(); throw error; }
  }
  function consumeProof(token, args, command, proof) {
    const saved = proofs.get(proof); proofs.delete(proof);
    try {
      const record = liveRecord(token, args);
      if (saved?.record !== record || saved.token !== token || saved.packet !== record.packet
        || saved.authority !== record.authority || record.base.command !== command) fail("proof");
      return Object.freeze({ commandHash: record.selected.commandHash, plan: command.slot.plan });
    } catch (error) { revoke(); throw error; }
  }
  function content(token, args, command) {
    try { const record = liveRecord(token, args); return record.base.command === command
      ? Object.freeze({ commandHash: record.selected.commandHash, plan: command.slot.plan }) : null; }
    catch (error) { revoke(); throw error; }
  }
  function runtimeDerivation(token, args, command) {
    try {
      const record = liveRecord(token, args);
      if (record.base.command !== command) fail("runtime-command-identity");
      if (record.runtimeDerivation === null) {
        // Only immutable, fully checked command data is retained here. Native
        // runtime responses and their current security checks are never cached.
        const P = require("./synthetik-500-profile");
        const E = require("./synthetik-500-end-runtime").erzeugeEndRuntime(P.serialisiere(command.package));
        record.runtimeDerivation = Object.freeze({ E: Object.freeze({ ...E }), args: Object.freeze({
          operationId: command.slot.plan.operationId,
          manifestHash: P.hash(command.executor.eingaben.runtimeManifest),
          productionCommit: command.slot.plan.productionCommit
        }) });
      }
      return record.runtimeDerivation;
    } catch (error) { revoke(); throw error; }
  }
  async function installAuthority(token, args, packet) {
    if (busy) fail("busy"); busy = true;
    try {
      const record = liveRecord(token, args);
      if (tokens.get(token).kind !== "installation" || packet.command !== record.base.command) fail("authority-install-scope");
      const text = canonicalAuthority({ admission: packet.admission, testAuthority: packet.testAuthority });
      const value = signed([AUTHORITY, keyMaterial().id, args.operationId, args.commandHash, record.target, record.sources, text]);
      await insert(rowId("authority", record.selected), value, 30000); liveRecord(token, args);
    } catch (error) { revoke(); throw error; }
    finally { busy = false; }
  }
  function release(token) { const owner = tokens.get(token); if (owner) owner.closed = true; }
  function verifyFile(token, args, bytes) {
    const record = liveRecord(token, args);
    if (!Buffer.isBuffer(bytes) || sha(canonicalAuthority(JSON.parse(bytes.toString("utf8")))) !== record.encodedHash) fail("original-content-file");
  }
  return Object.freeze({ prepare, open, read, readProof, consumeProof, content, runtimeDerivation, installAuthority, verifyFile, release });
}
module.exports = Object.freeze({ createBackend, VERSION });
