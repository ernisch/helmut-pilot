"use strict";

// Pure, private Owner-service transaction compiler. No process, connection,
// filesystem, HTTP, token, result installation or execution entry point.
// Root must load the qualification from its genuine private verifier boundary.
// The initial authenticated PostgreSQL session is deliberately privileged;
// SET SESSION AUTHORIZATION does not erase that origin or confer independence.
const crypto = require("node:crypto"), { isDeepStrictEqual } = require("node:util");
const prepared = new WeakMap(), CAP = 36 * 1024 * 1024, OWN_CAP = 4 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = value => crypto.createHash("sha256").update(value).digest("hex");
const ORIGINAL = Object.freeze([
  "helmut_auth_state_cas_v1", "helmut_auth_state_payload_hash_local_v1", "helmut_auth_state_leaf_info_local_v1",
  "helmut_auth_state_children_local_v1", "helmut_auth_state_nodes_guard_local_v1", "helmut_auth_state_put_nodes_local_v1",
  "helmut_auth_state_expand_local_v1", "helmut_auth_state_assert_root_local_v1", "helmut_auth_state_assert_data_local_v1",
  "helmut_auth_state_assert_graph_local_v1", "helmut_auth_state_auth_guard_local_v1", "helmut_auth_state_graph_checked_local_v1",
  "helmut_auth_usage_guard_local_v1", "helmut_auth_usage_insert_local_v1", "helmut_auth_usage_checked_proof_local_v1",
]);
// Exact AS $f$ body bytes in the accompanying reviewed inert proposal. Native
// pg_proc.prosrc is hashed again in the transaction, never trusted as JSON.
const HELPERS = Object.freeze({
  original_bridge_top_map_v1: Object.freeze({ args: "text, text, text", sha: "cbab4ee2943f898ce18d0673406bcf67c8c65c57f5545e4bb1262338106918bb", result: "jsonb" }),
  original_bridge_value_v1: Object.freeze({ args: "text, text, text, jsonb, boolean", sha: "7de36453e5e664d1040649d73d537be7b9ab0fd00429ad31e7ea19ca1bf4ac50", result: "jsonb" }),
  original_bridge_own_projection_v1: Object.freeze({ args: "text, text, text, text", sha: "8074531ee40f7fa2858dc7b82f4e7e455dd34254e3489d1c53c0c8347e874622", result: "jsonb" }),
  original_bridge_compare_delta_v1: Object.freeze({ args: "text, text, text, text, text, jsonb, jsonb", sha: "1313273b41be966c4a86cb34fb933079f4312527bfe3f47b267276bba464aa71", result: "jsonb" }),
  original_bridge_compare_seed_v1: Object.freeze({ args: "text, text, text, text, text, jsonb", sha: "3a7142913b89e4255fcc622dda5a2ea28412befcdaa9cdca20186e2fdae14b62", result: "void" }),
  original_bridge_relations_v1: Object.freeze({ args: "", sha: "91505921dd30cbadb259fc439fede86c1f47b062ebcd690238dbd83d9f53797a", result: "jsonb" }),
  original_bridge_row_v1: Object.freeze({ args: "text, text, text, jsonb", sha: "290c60f33dc595e7ca7d4e893ed980fdc2a722b1513af00df51230c51b131480", result: "jsonb" }),
  original_bridge_result_v1: Object.freeze({ args: "text, jsonb", sha: "28ab1470b561bae4fa339efc678fe1ae07ff2a13d0ed58723bea9613a4d953cb", result: "void" }),
  original_bridge_receipt_v1: Object.freeze({ args: "text, text, text, text, bigint, text, text, text, text, text", sha: "058e191329a6ed64753fd3660a7219b6cb192c2f8481ad1a94aa6719b60edbdd", result: "void" }),
});
const NATIVE = Object.freeze(["contract", "authority_read", "runtime_read", "state_read", "state_cas", "artifact_insert", "artifact_read", "lease_acquire", "lease_release"]);
function need(ok, code) { if (!ok) throw Error("local-unit-original-transaction-" + code); }
const exact = (v, names) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...names].sort().join("|");
function canonical(v, depth = 0) {
  need(depth <= 64, "json-depth");
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") { need(Number.isFinite(v), "json-number"); return JSON.stringify(v); }
  if (Array.isArray(v)) return "[" + v.map(x => canonical(x, depth + 1)).join(",") + "]";
  need(v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v)), "json-value");
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k], depth + 1)).join(",") + "}";
}
function ownKeys(operationId) {
  const p = "localUnitDiagnostic:" + operationId.slice(-32) + ":";
  return ["localUnitDiagnosticConsumedGrantsV1", ...["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => p + k)];
}
function parsedCanonical(text, hash, cap) {
  need(typeof text === "string" && Buffer.byteLength(text) <= cap && HASH.test(hash || "") && SHA(text) === hash, "actual-canonical-hash");
  let value; try { value = JSON.parse(text); } catch { need(false, "canonical-json"); }
  need(canonical(value) === text, "exact-canonical-text"); return value;
}
function proof(p) { return exact(p, ["generation", "count", "head", "originalHash"]) && UUID.test(p.generation || "")
  && Number.isSafeInteger(p.count) && p.count >= 0 && HASH.test(p.head || "") && HASH.test(p.originalHash || ""); }
function state(p) { return exact(p, ["version", "generation", "root", "originalHash"]) && p.version === "merkle-auth-v1"
  && UUID.test(p.generation || "") && HASH.test(p.root || "") && HASH.test(p.originalHash || ""); }
function sourceShape(s, kind) {
  need(exact(s, ["oid", "name", "identityArguments", "prosrcSHA256", "volatility", "returnType", "language", "config"])
    && typeof s.oid === "string" && /^[1-9][0-9]{0,9}$/.test(s.oid) && BigInt(s.oid) <= 4294967295n
    && typeof s.name === "string" && /^(?:public|helmut_unit_diagnostic)\.[a-z][a-z0-9_]{0,62}$/.test(s.name)
    && typeof s.identityArguments === "string" && /^[a-z0-9_., \[\]]{0,512}$/.test(s.identityArguments)
    && typeof s.returnType === "string" && /^[a-z0-9_. \[\]]{1,128}$/.test(s.returnType)
    && typeof s.prosrcSHA256 === "string" && HASH.test(s.prosrcSHA256)
    && ["i", "s", "v"].includes(s.volatility) && ["sql", "plpgsql"].includes(s.language)
    && (s.config === null || isDeepStrictEqual(s.config, ["search_path=pg_catalog"])), "source-pin-shape");
  if (kind !== "original") need(s.config !== null, "native-helper-search-path");
}
function qualification(q, r) {
  need(exact(q, ["schema", "database", "operationId", "commandHash", "originalSources", "helperSources", "nativeSources", "originalRelations"])
    && q.schema === "helmut-local-unit-original-bridge-qualification/1"
    && q.database === "helmut_unit_diagnostic_" + r.operationId.slice(-32)
    && q.operationId === r.operationId && q.commandHash === r.commandHash, "qualified-owned-target");
  const relations = ["briefings", "helmut_auth_state_nodes_local", "helmut_store", "llm_usage", "profiles"].map(n => "public." + n);
  need(Array.isArray(q.originalRelations) && q.originalRelations.length === 5
    && isDeepStrictEqual(q.originalRelations.map(x => x?.name).sort(), relations.sort())
    && q.originalRelations.every(x => typeof x.oid === "string" && /^[1-9][0-9]{0,9}$/.test(x.oid))
    && Buffer.byteLength(canonical(q.originalRelations)) <= 512 * 1024, "actual-original-relation-catalog-required");
  for (const [key, minimum, maximum] of [["originalSources", 15, 32], ["helperSources", 9, 9], ["nativeSources", 18, 128]]) {
    need(Array.isArray(q[key]) && q[key].length >= minimum && q[key].length <= maximum, "source-pin-count");
    const oids = new Set(), names = new Set();
    for (const s of q[key]) { sourceShape(s, key === "originalSources" ? "original" : "native");
      need(!oids.has(s.oid) && !names.has(s.name), "source-pin-duplicate"); oids.add(s.oid); names.add(s.name); }
  }
  for (const name of ORIGINAL) { const s = q.originalSources.find(x => x.name === "public." + name);
    need(s && isDeepStrictEqual(s.config, ["search_path=pg_catalog"]), "original-closure-required"); }
  for (const s of q.originalSources) need(s.name.startsWith("public.") && (ORIGINAL.includes(s.name.slice(7)) || s.returnType === "trigger"), "extra-original-trigger-only");
  for (const [name, p] of Object.entries(HELPERS)) {
    const h = q.helperSources.find(s => s.name === "helmut_unit_diagnostic." + name);
    need(h && h.identityArguments === p.args && h.prosrcSHA256 === p.sha && h.returnType === p.result
      && h.volatility === "s" && h.language === "plpgsql", "exact-projection-source-required");
    need(q.nativeSources.some(s => isDeepStrictEqual(s, h)), "native-helper-source-required");
  }
  for (const name of NATIVE) need(q.nativeSources.some(s => s.name === "public.local_unit_diagnostic_" + name + "_v1"), "native-rpc-source-required");
  for (const s of q.nativeSources) need(s.name.startsWith("helmut_unit_diagnostic.")
    || NATIVE.some(n => s.name === "public.local_unit_diagnostic_" + n + "_v1"), "native-source-namespace");
}
function validate(r, q) {
  const seed = r?.mode === "seed";
  need(exact(r, ["schema", "mode", "operationId", "commandHash", "claimId", "originalCAS", "ownBefore", "ownNext", "artifact",
    ...(seed ? ["privateOwnerInitialization"] : [])])
    && r.schema === "helmut-local-unit-original-write/1" && ["seed", "state", "usage", "artifact"].includes(r.mode)
    && typeof r.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(r.operationId)
    && typeof r.commandHash === "string" && HASH.test(r.commandHash)
    && (seed ? r.claimId === null : typeof r.claimId === "string"
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.claimId)), "request-scope-private-seed-only");
  qualification(q, r);
  need((seed ? r.ownBefore === null : exact(r.ownBefore, ["hash", "revision"]) && HASH.test(r.ownBefore.hash || "")
    && Number.isSafeInteger(r.ownBefore.revision) && r.ownBefore.revision >= 0)
    && exact(r.ownNext, ["canonical", "hash"]), "own-compare-and-swap");
  const next = parsedCanonical(r.ownNext.canonical, r.ownNext.hash, OWN_CAP), keys = ownKeys(r.operationId);
  need(exact(next, keys), "own-seven-only");
  const p = "localUnitDiagnostic:" + r.operationId.slice(-32) + ":";
  need(next[p + "journal"]?.claimId === r.claimId, "own-current-claim");
  validateResult(r, next, p);
  if (seed) validateInitialization(r, next, p);
  if (r.mode === "artifact") {
    need(r.originalCAS === null && r.ownNext.hash === r.ownBefore.hash, "artifact-no-main-auth-cas");
    const a = r.artifact;
    need(exact(a, ["kind", "logicalId", "canonical", "sha256", "parentHash"])
      && ["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"].includes(a.kind)
      && typeof a.logicalId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(a.logicalId)
      && (a.parentHash === null || typeof a.parentHash === "string" && HASH.test(a.parentHash)), "seven-original-artifact-kinds");
    const body = parsedCanonical(a.canonical, a.sha256, 2097152);
    if (["draft", "evidence"].includes(a.kind)) need(a.parentHash === null, "original-artifact-root-parent");
    else need(HASH.test(a.parentHash || ""), "original-artifact-parent-required");
    if (!["immutable-D", "evidence"].includes(a.kind)) need(exact(body, ["id", "user_id", "slot", "generated_at", "payload"])
      && body.id === a.logicalId, "actual-original-briefing-body");
    if (a.kind === "evidence") need(a.logicalId === "diagnostic-result" && body.schema === "helmut-local-unit-diagnostic-evidence/1"
      && body.operationId === r.operationId && body.commandHash === r.commandHash, "actual-original-evidence-body");
    need(Buffer.byteLength(canonical(r)) <= CAP && Buffer.byteLength(canonical(q)) <= 1024 * 1024, "bounded-request");
    return next;
  }
  const cas = r.originalCAS;
  need(exact(cas, ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"])
    && cas.id === "main-auth" && UUID.test(cas.expectedRevision || "") && UUID.test(cas.revision || "")
    && cas.revision !== cas.expectedRevision && proof(cas.expectedProof) && state(cas.expectedState)
    && HASH.test(cas.root || "") && Array.isArray(cas.nodes) && cas.nodes.length <= 20000
    && Array.isArray(cas.additions), "actual-original-eight-key-cas");
  const seen = new Set(); let nodeBytes = 0;
  for (const n of cas.nodes) {
    need(exact(n, ["hash", "payload"]) && HASH.test(n.hash || "") && typeof n.payload === "string"
      && Buffer.byteLength(n.payload) <= 4194304 && SHA(n.payload) === n.hash && !seen.has(n.hash), "actual-original-node-bytes");
    seen.add(n.hash); nodeBytes += Buffer.byteLength(n.payload); need(nodeBytes <= 33554432, "actual-original-node-cap");
  }
  if (r.mode === "state" || seed) {
    need(r.artifact === null && cas.additions.length === 0 && (seed || r.ownNext.hash !== r.ownBefore.hash)
      && cas.root !== cas.expectedState.root, "state-delta-only");
  } else {
    const a = r.artifact;
    need(exact(a, ["kind", "logicalId", "canonical", "sha256", "parentHash"]) && ["usage-D", "usage-R"].includes(a.kind)
      && typeof a.logicalId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(a.logicalId) && a.parentHash === null
      && cas.additions.length === 1 && cas.root === cas.expectedState.root && cas.nodes.length === 0
      && r.ownNext.hash === r.ownBefore.hash, "one-usage-delta-only");
    const body = parsedCanonical(a.canonical, a.sha256, 2097152), phase = a.kind.slice(-1), costs = next[p + "costs"], journal = next[p + "journal"];
    need(isDeepStrictEqual(body, cas.additions[0]) && body.scopeHash === r.commandHash && body.budgetTicketId === a.logicalId
      && body.costPhase === phase && body.costBasis === "local-fixture-simulation-not-provider-charge"
      && costs?.calls?.[a.logicalId]?.status === "sent" && journal?.attempts?.[phase]?.status === "sent"
      && journal.attempts[phase].ticketId === a.logicalId && next[p + "sendClaim"]?.[phase]?.ticketId === a.logicalId
      && body.costRequestHash === next[p + "sendClaim"][phase].requestHash, "actual-own-ticket-usage");
  }
  need(Buffer.byteLength(canonical(r)) <= CAP && Buffer.byteLength(canonical(q)) <= 1024 * 1024, "bounded-request");
  return next;
}
function validateResult(r, next, p) {
  const result = next[p + "result"], journal = next[p + "journal"];
  if (isDeepStrictEqual(result, { state: "pending", evidenceHash: null, positions: [] })) {
    need(journal?.state !== "closed", "close-requires-retained-result"); return;
  }
  need(r.mode === "state" && exact(result, ["state", "evidenceHash", "positions"]) && result.state === "retained-unreviewed"
    && HASH.test(result.evidenceHash || "") && Array.isArray(result.positions) && result.positions.length === 3
    && new Set(result.positions.map(x => x?.bereich)).size === 3 && result.positions.every(x => exact(x, ["bereich", "owner", "hash"])
      && ["lage", "mandatsbriefing", "morgenbriefing"].includes(x.bereich) && typeof x.owner === "string" && HASH.test(x.hash || "")), "retained-native-artifacts-required");
  if (journal?.state === "closed") need(journal.index === 1 && journal.inFlight === null && journal.stopRequested === false
    && exact(journal.verification, ["authorizationHash", "controlsHash", "controlCount"])
    && journal.verification.controlCount === 16 && HASH.test(journal.verification.authorizationHash || "")
    && HASH.test(journal.verification.controlsHash || ""), "closed-native-verification-required");
}
function validateInitialization(r, next, p) {
  const init = r.privateOwnerInitialization;
  need(exact(init, ["authority", "observation"]), "private-initialization-shape");
  const a = init.authority, o = init.observation;
  need(exact(a, ["grantId", "commandCanonical", "admissionCanonical", "admissionHash", "sourceHash", "targetHash", "postrunHash", "sourceProofHash",
    "codeManifestPin", "runtimeManifestPin", "gateHashes", "verifierCodeHash", "requestModels", "verifiedAtUTC", "expiresAtUTC"])
    && exact(o, ["proofCanonical", "proofHash", "observedAtUTC"]), "private-initialization-fields");
  for (const key of ["grantId", "admissionHash", "sourceHash", "targetHash", "postrunHash", "sourceProofHash", "verifierCodeHash"])
    need(typeof a[key] === "string" && HASH.test(a[key]), "private-initialization-pins");
  const command = parsedCanonical(a.commandCanonical, r.commandHash, 16 * 1024 * 1024);
  const admission = parsedCanonical(a.admissionCanonical, a.admissionHash, 65536);
  const observation = parsedCanonical(o.proofCanonical, o.proofHash, 65536);
  for (const utc of [a.verifiedAtUTC, a.expiresAtUTC, o.observedAtUTC]) need(typeof utc === "string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(utc) && Number.isFinite(Date.parse(utc))
    && new Date(utc).toISOString() === utc, "private-initialization-utc");
  for (const pin of [a.codeManifestPin, a.runtimeManifestPin]) need(exact(pin, ["path", "bytes", "sha256"])
    && typeof pin.path === "string" && Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && HASH.test(pin.sha256 || ""), "private-manifest-pin");
  const gates = ["source", "runtime", "owner", "calendar", "costs", "reservation", "sender", "review", "result", "independentAcceptance"];
  need(exact(a.gateHashes, gates) && gates.every(k => HASH.test(a.gateHashes[k] || ""))
    && exact(a.requestModels, ["D", "R"]) && ["gpt-5-mini", "gpt-5-mini-eu"].includes(a.requestModels.D)
    && a.requestModels.R === a.requestModels.D, "private-runtime-source-binding-shape");
  need(admission.grantId === a.grantId && admission.commandHash === r.commandHash && admission.expiresAtUTC === a.expiresAtUTC
    && observation.operationId === r.operationId && observation.commandHash === r.commandHash && observation.observedAtUTC === o.observedAtUTC,
    "private-initialization-scope");
  need(isDeepStrictEqual(next[p + "journal"], { operationId: r.operationId, commandHash: r.commandHash, state: "installed", claimId: null,
    index: 0, inFlight: null, attempts: {}, stopRequested: false, reason: null })
    && exact(next.localUnitDiagnosticConsumedGrantsV1, [a.grantId])
    && isDeepStrictEqual(next[p + "costs"]?.calls, {}) && next[p + "costs"]?.spent === 0
    && isDeepStrictEqual(next[p + "costs"]?.slot, command.slot)
    && isDeepStrictEqual(next[p + "sendClaim"], {}) && isDeepStrictEqual(next[p + "review"], {}), "private-initial-state-no-claim");
}
function literal(value) { need(typeof value === "string" && !value.includes("\0"), "sql-text"); return "'" + value.replace(/'/g, "''") + "'"; }

function seedInitialization(owner) {
  return `SET SESSION AUTHORIZATION ${owner};
DO $initialize$
DECLARE r jsonb; a jsonb; o jsonb;
BEGIN
  IF session_user<>${literal(owner)} OR current_user<>session_user THEN RAISE EXCEPTION 'original-bridge-seed-owner-principal';END IF;
  SELECT request_text::jsonb INTO STRICT r FROM pg_temp.original_bridge_args;
  a:=r#>'{privateOwnerInitialization,authority}';o:=r#>'{privateOwnerInitialization,observation}';
  IF r->>'mode' IS DISTINCT FROM 'seed' OR r->'claimId' IS DISTINCT FROM 'null'::jsonb OR r->'ownBefore' IS DISTINCT FROM 'null'::jsonb
    OR encode(sha256(convert_to(a->>'commandCanonical','UTF8')),'hex') IS DISTINCT FROM r->>'commandHash'
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.authority WHERE scope_hash=r->>'commandHash' OR operation_id=r->>'operationId')
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash')
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.runtime_observations WHERE scope_hash=r->>'commandHash')
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=r->>'commandHash')
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.leases WHERE scope_hash=r->>'commandHash') THEN
    RAISE EXCEPTION 'original-bridge-seed-fresh-private-initialization-required';END IF;
  -- Native unchanged owner-only triggers validate command/admission/source/
  -- runtime bindings. JSON is not an independent source-verifier authority.
  INSERT INTO helmut_unit_diagnostic.authority(scope_hash,operation_id,grant_id,command_canonical,admission_canonical,admission_hash,
    source_hash,target_hash,postrun_hash,source_proof_hash,code_manifest_pin,runtime_manifest_pin,gate_hashes,verifier_code_hash,
    request_models,verified_at,expires_at)
  VALUES(r->>'commandHash',r->>'operationId',a->>'grantId',a->>'commandCanonical',a->>'admissionCanonical',a->>'admissionHash',
    a->>'sourceHash',a->>'targetHash',a->>'postrunHash',a->>'sourceProofHash',a->'codeManifestPin',a->'runtimeManifestPin',a->'gateHashes',
    a->>'verifierCodeHash',a->'requestModels',helmut_unit_diagnostic.utc(a->'verifiedAtUTC'),helmut_unit_diagnostic.utc(a->'expiresAtUTC'));
  INSERT INTO helmut_unit_diagnostic.runtime_observations(scope_hash,proof_canonical,proof_hash,observed_at)
  VALUES(r->>'commandHash',o->>'proofCanonical',o->>'proofHash',helmut_unit_diagnostic.utc(o->'observedAtUTC'));
  -- No state exists yet. The fresh authority row is the own-scope lock, held
  -- through original CAS and the later owner-only revision-zero state INSERT.
  PERFORM 1 FROM helmut_unit_diagnostic.authority WHERE scope_hash=r->>'commandHash' FOR UPDATE;
END;$initialize$;
RESET SESSION AUTHORIZATION;
`;
}
function seedOwn(owner) {
  return `SET SESSION AUTHORIZATION ${owner};
DO $seedown$
DECLARE r jsonb; n text; inserted helmut_unit_diagnostic.state%rowtype; persisted helmut_unit_diagnostic.state%rowtype; ack jsonb;
BEGIN
  IF session_user<>${literal(owner)} OR current_user<>session_user THEN RAISE EXCEPTION 'original-bridge-seed-owner-principal';END IF;
  SELECT request_text::jsonb,nonce INTO STRICT r,n FROM pg_temp.original_bridge_args;
  IF (SELECT count(*) FROM pg_temp.original_bridge_results)<>1 OR NOT EXISTS(SELECT FROM pg_temp.original_bridge_results WHERE phase='authAck')
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash') THEN RAISE EXCEPTION 'original-bridge-seed-pre-own-ack-required';END IF;
  INSERT INTO helmut_unit_diagnostic.state(scope_hash,revision,canonical_text,body_hash,body)
    VALUES(r->>'commandHash',0,r#>>'{ownNext,canonical}',r#>>'{ownNext,hash}',(r#>>'{ownNext,canonical}')::jsonb)
    RETURNING * INTO STRICT inserted;
  SELECT * INTO STRICT persisted FROM helmut_unit_diagnostic.state WHERE scope_hash=inserted.scope_hash;
  IF inserted IS DISTINCT FROM persisted OR persisted.scope_hash IS DISTINCT FROM r->>'commandHash' OR persisted.revision<>0
    OR persisted.body_hash IS DISTINCT FROM r#>>'{ownNext,hash}' OR persisted.canonical_text IS DISTINCT FROM r#>>'{ownNext,canonical}'
    OR persisted.body IS DISTINCT FROM (r#>>'{ownNext,canonical}')::jsonb
    OR encode(sha256(convert_to(persisted.canonical_text,'UTF8')),'hex') IS DISTINCT FROM persisted.body_hash
    OR NOT EXISTS(SELECT FROM helmut_unit_diagnostic.authority WHERE scope_hash=persisted.scope_hash AND operation_id=r->>'operationId')
    OR (SELECT count(*) FROM helmut_unit_diagnostic.runtime_observations WHERE scope_hash=persisted.scope_hash)<>1
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=persisted.scope_hash)
    OR EXISTS(SELECT FROM helmut_unit_diagnostic.leases WHERE scope_hash=persisted.scope_hash) THEN
    RAISE EXCEPTION 'original-bridge-seed-persisted-state-unconfirmed';END IF;
  ack:=jsonb_build_object('version','helmut-local-unit-diagnostic-seed-ack/1','scopeHash',persisted.scope_hash,
    'operationId',r->>'operationId','revision',persisted.revision,'hash',persisted.body_hash,'nonce',n);
  INSERT INTO pg_temp.original_bridge_results VALUES('ownAck',ack);
END;$seedown$;
RESET SESSION AUTHORIZATION;
`;
}
function artifactOriginal(writer) {
  return `SET SESSION AUTHORIZATION ${writer};
DO $originalrow$
DECLARE r jsonb; n text; row_dto jsonb; a jsonb; before_meta jsonb; after_meta jsonb; m jsonb; u jsonb; auth_xmin text;
  actual_body jsonb; actual_time timestamptz; original_xmin text; ack jsonb; own_row helmut_unit_diagnostic.state%rowtype;
  authority_row helmut_unit_diagnostic.authority%rowtype; own_next jsonb; prefix text;
BEGIN
  IF session_user<>${literal(writer)} OR current_user<>session_user THEN RAISE EXCEPTION 'original-bridge-writer-principal';END IF;
  SELECT request_text::jsonb,nonce INTO STRICT r,n FROM pg_temp.original_bridge_args;own_next:=(r#>>'{ownNext,canonical}')::jsonb;
  IF r->>'mode' IS DISTINCT FROM 'artifact' OR r->'originalCAS' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'original-bridge-artifact-no-auth-cas';END IF;
  SELECT * INTO STRICT own_row FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash' FOR UPDATE;
  SELECT data,xmin::text INTO STRICT a,auth_xmin FROM public.helmut_store WHERE id='main-auth' FOR UPDATE;
  SELECT * INTO STRICT authority_row FROM helmut_unit_diagnostic.authority WHERE scope_hash=r->>'commandHash';
  prefix:='localUnitDiagnostic:'||right(r->>'operationId',32)||':';
  IF authority_row.operation_id IS DISTINCT FROM r->>'operationId'
    OR own_row.body_hash IS DISTINCT FROM r#>>'{ownBefore,hash}' OR own_row.revision::text IS DISTINCT FROM r#>>'{ownBefore,revision}'
    OR own_row.body_hash IS DISTINCT FROM r#>>'{ownNext,hash}' OR own_row.canonical_text IS DISTINCT FROM r#>>'{ownNext,canonical}'
    OR own_row.body IS DISTINCT FROM own_next OR encode(sha256(convert_to(own_row.canonical_text,'UTF8')),'hex') IS DISTINCT FROM own_row.body_hash
    OR own_row.body#>>ARRAY[prefix||'journal','claimId'] IS DISTINCT FROM r->>'claimId' THEN RAISE EXCEPTION 'original-bridge-artifact-own-current-state';END IF;
  m:=public.helmut_auth_state_assert_root_local_v1(a);u:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  IF u->>'revision' IS DISTINCT FROM a->>'_authStoreRevision'
    OR helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',m->>'generation',m->>'root',r->>'operationId') IS DISTINCT FROM own_row.body THEN
    RAISE EXCEPTION 'original-bridge-artifact-old-auth-mirror';END IF;
  before_meta:=jsonb_build_object('revision',a->>'_authStoreRevision','state',m,'proof',u->'proof','xmin',auth_xmin);
  row_dto:=helmut_unit_diagnostic.original_bridge_row_v1(r->>'commandHash',r#>>'{artifact,kind}',r#>>'{artifact,logicalId}',(r#>>'{artifact,canonical}')::jsonb);
  IF row_dto->>'table'='briefings' THEN
    INSERT INTO public.briefings(id,user_id,slot,generated_at,payload) VALUES(row_dto->>'id',row_dto#>>'{body,user_id}',
      row_dto#>>'{body,slot}',helmut_unit_diagnostic.utc(row_dto#>'{body,generated_at}'),row_dto#>'{body,payload}');
    SELECT jsonb_build_object('id',t.id,'user_id',t.user_id,'slot',t.slot,
      'generated_at',to_char(t.generated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',t.payload),t.generated_at,t.xmin::text
      INTO STRICT actual_body,actual_time,original_xmin FROM public.briefings t WHERE t.id=row_dto->>'id';
    IF actual_time IS DISTINCT FROM helmut_unit_diagnostic.utc(row_dto#>'{body,generated_at}') THEN RAISE EXCEPTION 'original-bridge-artifact-original-timestamp';END IF;
  ELSE
    INSERT INTO public.helmut_store(id,data) VALUES(row_dto->>'id',row_dto#>'{body,data}');
    SELECT jsonb_build_object('id',t.id,'data',t.data),t.xmin::text INTO STRICT actual_body,original_xmin FROM public.helmut_store t WHERE t.id=row_dto->>'id';
  END IF;
  IF actual_body IS DISTINCT FROM row_dto->'body' OR original_xmin IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::text THEN
    RAISE EXCEPTION 'original-bridge-artifact-original-insert-readback';END IF;
  SELECT data,xmin::text INTO STRICT a,auth_xmin FROM public.helmut_store WHERE id='main-auth';
  m:=public.helmut_auth_state_assert_root_local_v1(a);u:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  after_meta:=jsonb_build_object('revision',a->>'_authStoreRevision','state',m,'proof',u->'proof','xmin',auth_xmin);
  IF after_meta IS DISTINCT FROM before_meta OR u->>'revision' IS DISTINCT FROM a->>'_authStoreRevision' THEN RAISE EXCEPTION 'original-bridge-artifact-no-main-auth-change';END IF;
  ack:=jsonb_build_object('version','helmut-local-unit-diagnostic-original-row-ack/1','scopeHash',own_row.scope_hash,
    'kind',r#>>'{artifact,kind}','id',row_dto->>'id','hash',r#>>'{artifact,sha256}','stateRevision',own_row.revision,'nonce',n);
  INSERT INTO pg_temp.original_bridge_results VALUES('originalRowAck',jsonb_build_object('ack',ack,'authBefore',before_meta,'authAfter',after_meta,'originalXmin',original_xmin));
END;$originalrow$;
`;
}
function compile(r, q, nonce) {
  const suffix = r.operationId.slice(-32), writer = "helmut_ud_bridge_writer_" + suffix;
  const auth = "helmut_ud_authenticator_" + suffix, runtime = "helmut_ud_runtime_" + suffix;
  const owner = "helmut_ud_owner_" + suffix, seed = r.mode === "seed", artifact = r.mode === "artifact", ownActor = seed ? owner : runtime;
  const closed = r.mode === "state" && JSON.parse(r.ownNext.canonical)["localUnitDiagnostic:" + suffix + ":journal"]?.state === "closed";
  const requestText = canonical(r), qualificationText = canonical(q);
  return `BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=pg_catalog;
SET LOCAL row_security=on;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='500ms';
SET LOCAL idle_in_transaction_session_timeout='2s';
SET LOCAL helmut.local_usage_experiment='on';
SET LOCAL helmut.local_auth_state_cas_projection='on';
SET LOCAL helmut.local_diagnostic_scope='bounded-cas-qualification-v1';
CREATE TEMP TABLE original_bridge_args(request_text text not null,request_hash text not null,qualification jsonb not null,nonce text not null,backend_pid integer not null,transaction_id xid8 not null) ON COMMIT DROP;
CREATE TEMP TABLE original_bridge_results(phase text primary key,value jsonb not null) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.original_bridge_args VALUES(${literal(requestText)},${literal(SHA(requestText))},${literal(qualificationText)}::jsonb,${literal(nonce)},pg_backend_pid(),pg_current_xact_id());
DO $root$
DECLARE q jsonb; r jsonb; s jsonb; p record; scope text; t record; roles_safe integer; expected_native oid[]; actual_native oid[];
  acl_target oid; acl_entry record; temp_name name;
BEGIN
  IF current_database()<>${literal(q.database)} OR session_user<>'postgres' OR current_user<>session_user
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN RAISE EXCEPTION 'original-bridge-initial-superuser-origin-required';END IF;
  SELECT qualification,request_text::jsonb INTO STRICT q,r FROM pg_temp.original_bridge_args;
  IF encode(sha256(convert_to((SELECT request_text FROM pg_temp.original_bridge_args),'UTF8')),'hex')
    IS DISTINCT FROM (SELECT request_hash FROM pg_temp.original_bridge_args) THEN RAISE EXCEPTION 'original-bridge-actual-request-hash';END IF;
  SELECT count(*) INTO roles_safe FROM pg_roles WHERE rolname IN(${literal(writer)},${literal(runtime)})
    AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication);
  IF roles_safe<>2 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=${literal(auth)} AND rolcanlogin
    AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
    OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${literal(writer)}))
    OR EXISTS(SELECT FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=${literal(writer)}))
    OR pg_has_role(${literal(auth)},${literal(writer)},'MEMBER') THEN RAISE EXCEPTION 'original-bridge-no-privileged-role-bridge';END IF;
${seed || artifact ? "" : `  IF NOT has_function_privilege(${literal(runtime)},'helmut_unit_diagnostic.original_bridge_compare_delta_v1(text,text,text,text,text,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'original-bridge-runtime-delta-execute-required';END IF;
`}  ${seed ? `IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=${literal(owner)}
      AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication))
    OR NOT EXISTS(SELECT FROM pg_namespace WHERE nspname='helmut_unit_diagnostic' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=${literal(owner)}))
    OR EXISTS(SELECT FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE ns.nspname='helmut_unit_diagnostic'
      AND cl.relowner<>(SELECT oid FROM pg_roles WHERE rolname=${literal(owner)}))
    OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${literal(owner)}))
    OR pg_has_role(${literal(auth)},${literal(owner)},'MEMBER') OR pg_has_role(${literal(runtime)},${literal(owner)},'MEMBER') THEN
    RAISE EXCEPTION 'original-bridge-seed-exact-private-owner-required';END IF;` : ""}
  FOR s IN SELECT value FROM jsonb_array_elements(q->'originalSources') UNION ALL SELECT value FROM jsonb_array_elements(q->'nativeSources') LOOP
    SELECT p0.*,n.nspname,l.lanname INTO STRICT p FROM pg_proc p0 JOIN pg_namespace n ON n.oid=p0.pronamespace
      JOIN pg_language l ON l.oid=p0.prolang WHERE p0.oid=(s->>'oid')::oid;
    IF p.nspname||'.'||p.proname IS DISTINCT FROM s->>'name' OR oidvectortypes(p.proargtypes) IS DISTINCT FROM s->>'identityArguments'
      OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM s->>'prosrcSHA256'
      OR p.prosecdef OR to_jsonb(p.proconfig) IS DISTINCT FROM nullif(s->'config','null'::jsonb)
      OR p.provolatile::text IS DISTINCT FROM s->>'volatility' OR format_type(p.prorettype,null) IS DISTINCT FROM s->>'returnType'
      OR p.lanname IS DISTINCT FROM s->>'language' THEN RAISE EXCEPTION 'original-bridge-actual-qualified-source-mismatch';END IF;
  END LOOP;
  SELECT array_agg((value->>'oid')::oid ORDER BY (value->>'oid')::oid) INTO expected_native FROM jsonb_array_elements(q->'nativeSources');
  SELECT array_agg(actual_proc.oid ORDER BY actual_proc.oid) INTO actual_native FROM pg_proc actual_proc JOIN pg_namespace n ON n.oid=actual_proc.pronamespace
    WHERE n.nspname='helmut_unit_diagnostic' OR (n.nspname='public' AND actual_proc.proname=ANY(ARRAY[${NATIVE.map(n => literal("local_unit_diagnostic_" + n + "_v1")).join(",")} ]));
  IF actual_native IS DISTINCT FROM expected_native THEN RAISE EXCEPTION 'original-bridge-complete-native-source-set';END IF;
  IF helmut_unit_diagnostic.original_bridge_relations_v1() IS DISTINCT FROM q->'originalRelations' THEN RAISE EXCEPTION 'original-bridge-native-original-relations-changed';END IF;
  IF EXISTS(SELECT FROM pg_trigger actual_trigger WHERE NOT actual_trigger.tgisinternal AND actual_trigger.tgrelid IN
    ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass)
    AND NOT EXISTS(SELECT FROM jsonb_array_elements(q->'originalSources') s0 WHERE (s0->>'oid')::oid=actual_trigger.tgfoid)) THEN
    RAISE EXCEPTION 'original-bridge-complete-original-trigger-set';END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,'public.llm_usage'::regclass,'public.briefings'::regclass)
    AND relrowsecurity AND relkind='r')<>4 THEN RAISE EXCEPTION 'original-bridge-legacy-rls-required';END IF;
  SELECT nspname INTO STRICT temp_name FROM pg_namespace WHERE oid=pg_my_temp_schema();
  FOR acl_entry IN SELECT DISTINCT a.grantee FROM pg_namespace ns CROSS JOIN LATERAL aclexplode(coalesce(ns.nspacl,acldefault('n',ns.nspowner))) a
    WHERE ns.oid=pg_my_temp_schema() AND a.grantee<>ns.nspowner LOOP
    IF acl_entry.grantee=0 THEN EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC',temp_name);
    ELSE EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I',temp_name,(SELECT rolname FROM pg_roles WHERE oid=acl_entry.grantee));END IF;
  END LOOP;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM postgres',temp_name);
  EXECUTE format('GRANT ALL ON SCHEMA %I TO postgres',temp_name);
  FOREACH acl_target IN ARRAY ARRAY['pg_temp.original_bridge_args'::regclass::oid,'pg_temp.original_bridge_results'::regclass::oid] LOOP
    FOR acl_entry IN SELECT DISTINCT a.grantee FROM pg_class cl CROSS JOIN LATERAL aclexplode(coalesce(cl.relacl,acldefault('r',cl.relowner))) a
      WHERE cl.oid=acl_target AND a.grantee<>cl.relowner LOOP
      IF acl_entry.grantee=0 THEN EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC',acl_target::regclass);
      ELSE EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',acl_target::regclass,(SELECT rolname FROM pg_roles WHERE oid=acl_entry.grantee));END IF;
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM postgres',acl_target::regclass);
    EXECUTE format('GRANT ALL ON TABLE %s TO postgres',acl_target::regclass);
  END LOOP;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I,%I',temp_name,${literal(writer)},${literal(ownActor)});
  EXECUTE format('GRANT SELECT ON pg_temp.original_bridge_args TO %I,%I',${literal(writer)},${literal(ownActor)});
  EXECUTE format('GRANT SELECT,INSERT ON pg_temp.original_bridge_results TO %I,%I',${literal(writer)},${literal(ownActor)});
  ALTER TABLE pg_temp.original_bridge_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pg_temp.original_bridge_results FORCE ROW LEVEL SECURITY;
  EXECUTE format('CREATE POLICY original_bridge_read ON pg_temp.original_bridge_results FOR SELECT TO %I,%I USING(true)',${literal(writer)},${literal(ownActor)});
  EXECUTE format('CREATE POLICY original_bridge_auth_insert ON pg_temp.original_bridge_results FOR INSERT TO %I WITH CHECK(phase=''${artifact ? "originalRowAck" : "authAck"}'')',${literal(writer)});
  EXECUTE format('CREATE POLICY original_bridge_own_insert ON pg_temp.original_bridge_results FOR INSERT TO %I WITH CHECK(phase=''ownAck'')',${literal(ownActor)});
END;$root$;
${seed ? seedInitialization(owner) : ""}
${artifact ? artifactOriginal(writer) : `SET SESSION AUTHORIZATION ${writer};
DO $original$
DECLARE r jsonb; c jsonb; d jsonb; a jsonb; m jsonb; u jsonb; old_own jsonb; ack jsonb; after_root jsonb; after_usage jsonb;
  own_row helmut_unit_diagnostic.state%rowtype; authority_row helmut_unit_diagnostic.authority%rowtype; prefix text; phase text; ticket text; usage_row record; top_map jsonb; k text; terminal_stop boolean:=false;
BEGIN
  IF session_user<>${literal(writer)} OR current_user<>session_user THEN RAISE EXCEPTION 'original-bridge-writer-principal';END IF;
  SELECT request_text::jsonb INTO STRICT r FROM pg_temp.original_bridge_args;c:=r->'originalCAS';d:=(r#>>'{ownNext,canonical}')::jsonb;
  prefix:='localUnitDiagnostic:'||right(r->>'operationId',32)||':';
  -- Fixed lock order: own state (seed: already locked new authority), main-auth,
  -- then usage/artifact/results. No runtime role can initialize a seed.
  ${seed ? `IF EXISTS(SELECT FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash') THEN
    RAISE EXCEPTION 'original-bridge-seed-own-state-already-present';END IF;` : `SELECT * INTO STRICT own_row FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash' FOR UPDATE;`}
  SELECT data INTO STRICT a FROM public.helmut_store WHERE id='main-auth' FOR UPDATE;
  SELECT * INTO STRICT authority_row FROM helmut_unit_diagnostic.authority WHERE scope_hash=r->>'commandHash';
  ${seed ? "" : `IF own_row.body_hash IS DISTINCT FROM r#>>'{ownBefore,hash}' OR own_row.revision::text IS DISTINCT FROM r#>>'{ownBefore,revision}'
    OR own_row.body IS DISTINCT FROM own_row.canonical_text::jsonb
    OR encode(sha256(convert_to(own_row.canonical_text,'UTF8')),'hex') IS DISTINCT FROM own_row.body_hash THEN
    RAISE EXCEPTION 'original-bridge-own-before-or-next-mismatch';END IF;`}
  ${seed ? "" : `terminal_stop:=coalesce(r->>'mode'='state' AND d-(prefix||'journal')=own_row.body-(prefix||'journal')
    AND (d->(prefix||'journal'))-ARRAY['state','stopRequested','reason']=(own_row.body->(prefix||'journal'))-ARRAY['state','stopRequested','reason']
    AND own_row.body#>>ARRAY[prefix||'journal','state'] IN('running','unknown','stopped')
    AND d#>>ARRAY[prefix||'journal','state']=CASE WHEN EXISTS(SELECT FROM jsonb_each(own_row.body#>ARRAY[prefix||'costs','calls']) call
      WHERE call.value->>'status' IN('reserved','sent','unknown')) THEN 'unknown' ELSE 'stopped' END
    AND d#>ARRAY[prefix||'journal','stopRequested']='true'::jsonb
    AND d#>>ARRAY[prefix||'journal','reason']='unit-not-confirmed',false);`}
  IF authority_row.operation_id IS DISTINCT FROM r->>'operationId' OR (clock_timestamp()>=authority_row.expires_at AND NOT terminal_stop)
    OR encode(sha256(convert_to(r#>>'{ownNext,canonical}','UTF8')),'hex') IS DISTINCT FROM r#>>'{ownNext,hash}' THEN
    RAISE EXCEPTION 'original-bridge-own-before-or-next-mismatch';END IF;
  ${seed ? "" : `IF own_row.body#>>ARRAY[prefix||'journal','claimId'] IS DISTINCT FROM r->>'claimId' THEN
    IF (r->>'mode'='state' AND own_row.body#>>ARRAY[prefix||'journal','state']='installed'
      AND own_row.body#>ARRAY[prefix||'journal','claimId']='null'::jsonb) IS NOT TRUE THEN RAISE EXCEPTION 'original-bridge-own-current-claim';END IF;
  END IF;`}
  m:=public.helmut_auth_state_assert_root_local_v1(a);u:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  IF a->>'_authStoreRevision' IS DISTINCT FROM c->>'expectedRevision' OR m IS DISTINCT FROM c->'expectedState'
    OR u->'proof' IS DISTINCT FROM c->'expectedProof' OR u->>'revision' IS DISTINCT FROM c->>'expectedRevision' THEN
    RAISE EXCEPTION 'original-bridge-original-before-stale';END IF;
  ${seed ? `top_map:=helmut_unit_diagnostic.original_bridge_top_map_v1('main-auth',m->>'generation',m->>'root');
  FOREACH k IN ARRAY ARRAY['localUnitDiagnosticConsumedGrantsV1',prefix||'journal',prefix||'costs',prefix||'reservation',prefix||'sendClaim',prefix||'review',prefix||'result'] LOOP
    IF top_map?k THEN RAISE EXCEPTION 'original-bridge-seed-old-own-key-present';END IF;
  END LOOP;` : ""}
  IF r->>'mode' IN('state','seed') THEN
    IF c->'additions'<>'[]'::jsonb ${seed ? "" : "OR d IS NOT DISTINCT FROM own_row.body"} THEN RAISE EXCEPTION 'original-bridge-no-state-noop-or-usage';END IF;
    ${seed ? "" : "PERFORM helmut_unit_diagnostic.original_bridge_result_v1(r->>'commandHash',d);"}
  ELSE
    IF jsonb_array_length(c->'additions')<>1 OR d IS DISTINCT FROM own_row.body OR c->>'root' IS DISTINCT FROM m->>'root'
      OR c->'nodes'<>'[]'::jsonb OR c#>'{additions,0}' IS DISTINCT FROM (r#>>'{artifact,canonical}')::jsonb THEN
      RAISE EXCEPTION 'original-bridge-one-identical-usage-record';END IF;
    phase:=right(r#>>'{artifact,kind}',1);ticket:=r#>>'{artifact,logicalId}';
    IF own_row.body#>>ARRAY[prefix||'costs','calls',ticket,'status'] IS DISTINCT FROM 'sent'
      OR own_row.body#>>ARRAY[prefix||'journal','attempts',phase,'status'] IS DISTINCT FROM 'sent'
      OR own_row.body#>>ARRAY[prefix||'journal','attempts',phase,'ticketId'] IS DISTINCT FROM ticket
      OR own_row.body#>>ARRAY[prefix||'sendClaim',phase,'ticketId'] IS DISTINCT FROM ticket
      OR c#>>'{additions,0,budgetTicketId}' IS DISTINCT FROM ticket OR c#>>'{additions,0,scopeHash}' IS DISTINCT FROM r->>'commandHash'
      OR c#>>'{additions,0,costRequestHash}' IS DISTINCT FROM own_row.body#>>ARRAY[prefix||'sendClaim',phase,'requestHash']
      OR c#>>'{additions,0,costBasis}' IS DISTINCT FROM 'local-fixture-simulation-not-provider-charge' THEN
      RAISE EXCEPTION 'original-bridge-real-current-ticket';END IF;
  END IF;
  ack:=public.helmut_auth_state_cas_v1(c);
  IF jsonb_typeof(ack) IS DISTINCT FROM 'array' OR jsonb_array_length(ack)<>1
    OR NOT helmut_unit_diagnostic.exact(ack->0,ARRAY['id','revision','proof','state'])
    OR NOT helmut_unit_diagnostic.exact(ack#>'{0,proof}',ARRAY['generation','count','head','originalHash'])
    OR coalesce(ack#>>'{0,proof,count}','')!~'^(0|[1-9][0-9]{0,15})$'
    OR coalesce(ack#>>'{0,proof,head}','')!~'^[a-f0-9]{64}$' OR ack#>>'{0,id}' IS DISTINCT FROM 'main-auth'
    OR ack#>>'{0,revision}' IS DISTINCT FROM c->>'revision' OR ack#>'{0,state}' IS DISTINCT FROM (m||jsonb_build_object('root',c->>'root'))
    OR ack#>>'{0,proof,generation}' IS DISTINCT FROM u#>>'{proof,generation}'
    OR ack#>>'{0,proof,originalHash}' IS DISTINCT FROM u#>>'{proof,originalHash}'
    OR (ack#>>'{0,proof,count}')::bigint<>(u#>>'{proof,count}')::bigint+jsonb_array_length(c->'additions') THEN
    RAISE EXCEPTION 'original-bridge-original-ack-unconfirmed';END IF;
  IF (r->>'mode' IN('state','seed') AND ack#>>'{0,proof,head}' IS DISTINCT FROM u#>>'{proof,head}')
    OR (r->>'mode'='usage' AND ack#>>'{0,proof,head}' IS NOT DISTINCT FROM u#>>'{proof,head}') THEN
    RAISE EXCEPTION 'original-bridge-original-history-head';END IF;
  SELECT data INTO STRICT a FROM public.helmut_store WHERE id='main-auth';
  after_root:=public.helmut_auth_state_assert_root_local_v1(a);after_usage:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
  IF after_root IS DISTINCT FROM ack#>'{0,state}' OR after_usage->'proof' IS DISTINCT FROM ack#>'{0,proof}'
    OR after_usage->>'revision' IS DISTINCT FROM c->>'revision' OR a->>'_authStoreRevision' IS DISTINCT FROM c->>'revision'
    OR coalesce(current_setting('helmut.atomic_state_seal',true),'')<>'' OR coalesce(current_setting('helmut.atomic_usage_seal',true),'')<>'' THEN
    RAISE EXCEPTION 'original-bridge-original-readback-unconfirmed';END IF;
  ${seed ? "PERFORM helmut_unit_diagnostic.original_bridge_compare_seed_v1('main-auth',m->>'generation',m->>'root',after_root->>'root',r->>'operationId',d);" : ""}
  IF r->>'mode'='usage' THEN
    SELECT * INTO STRICT usage_row FROM public.llm_usage WHERE usage_store_id='main-auth' AND usage_generation=u#>>'{proof,generation}'
      AND usage_ordinal=(u#>>'{proof,count}')::bigint+1;
    IF usage_row.id IS DISTINCT FROM c#>>'{additions,0,id}' OR usage_row.usage_record IS DISTINCT FROM c#>'{additions,0}'
      OR usage_row.usage_prev_hash IS DISTINCT FROM u#>>'{proof,head}' OR usage_row.usage_chain_hash IS DISTINCT FROM after_usage#>>'{proof,head}' THEN
      RAISE EXCEPTION 'original-bridge-exact-original-usage-row';END IF;
  END IF;
  INSERT INTO pg_temp.original_bridge_results VALUES('authAck',ack);
END;$original$;
`}
RESET SESSION AUTHORIZATION;
${seed ? seedOwn(owner) : `SET SESSION AUTHORIZATION ${auth};
SET LOCAL ROLE ${runtime};
DO $own$
DECLARE r jsonb; n text; ack jsonb; claim_hash text; current_body jsonb; current_hash text; current_revision bigint;
BEGIN
  IF session_user<>${literal(auth)} OR current_user<>${literal(runtime)} THEN RAISE EXCEPTION 'original-bridge-runtime-principal';END IF;
  SELECT request_text::jsonb,nonce INTO STRICT r,n FROM pg_temp.original_bridge_args;
  claim_hash:=encode(sha256(convert_to(r->>'claimId','UTF8')),'hex');
  IF r->>'mode'='state' THEN
    ack:=public.local_unit_diagnostic_state_cas_v1(r->>'commandHash',claim_hash,r#>>'{ownBefore,hash}',
      (r#>>'{ownBefore,revision}')::bigint,r#>>'{ownNext,canonical}',r#>>'{ownNext,hash}',n);
    SELECT body,body_hash,revision INTO STRICT current_body,current_hash,current_revision FROM helmut_unit_diagnostic.state WHERE scope_hash=r->>'commandHash';
    IF NOT helmut_unit_diagnostic.exact(ack,ARRAY['version','scopeHash','hash','revision','claimHash','nonce']${closed ? "||ARRAY['authorizationHash','controlsHash','controlCount']" : ""})
      OR ack->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-state-ack/1' OR ack->>'claimHash' IS DISTINCT FROM claim_hash
      OR coalesce(ack->>'revision','')!~'^(0|[1-9][0-9]{0,15})$'
      OR ack->>'hash' IS DISTINCT FROM r#>>'{ownNext,hash}' OR (ack->>'revision')::bigint<>(r#>>'{ownBefore,revision}')::bigint+1
      OR current_body IS DISTINCT FROM (r#>>'{ownNext,canonical}')::jsonb OR current_hash IS DISTINCT FROM ack->>'hash'
      OR current_revision IS DISTINCT FROM (ack->>'revision')::bigint ${closed ? `OR (ack-'version'-'scopeHash'-'hash'-'revision'-'claimHash'-'nonce')
        IS DISTINCT FROM current_body#>ARRAY['localUnitDiagnostic:'||right(r->>'operationId',32)||':journal','verification']` : ""} THEN RAISE EXCEPTION 'original-bridge-own-cas-ack';END IF;
  ELSE
    ack:=public.local_unit_diagnostic_artifact_insert_v1(r->>'commandHash',claim_hash,r#>>'{artifact,kind}',r#>>'{artifact,logicalId}',
      r#>>'{artifact,canonical}',r#>>'{artifact,sha256}',r#>>'{artifact,parentHash}',n);
    IF NOT helmut_unit_diagnostic.exact(ack,ARRAY['version','scopeHash','kind','logicalId','hash','stateRevision','nonce'])
      OR ack->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-artifact-ack/1'
      OR coalesce(ack->>'stateRevision','')!~'^(0|[1-9][0-9]{0,15})$'
      OR ack->>'kind' IS DISTINCT FROM r#>>'{artifact,kind}' OR ack->>'logicalId' IS DISTINCT FROM r#>>'{artifact,logicalId}'
      OR ack->>'hash' IS DISTINCT FROM r#>>'{artifact,sha256}' OR (ack->>'stateRevision')::bigint<>(r#>>'{ownBefore,revision}')::bigint
      OR NOT EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=r->>'commandHash' AND kind=r#>>'{artifact,kind}'
        AND logical_id=r#>>'{artifact,logicalId}' AND body_hash=r#>>'{artifact,sha256}' AND parent_hash IS NOT DISTINCT FROM r#>>'{artifact,parentHash}'
        AND canonical_text=r#>>'{artifact,canonical}' AND body=(r#>>'{artifact,canonical}')::jsonb) THEN RAISE EXCEPTION 'original-bridge-own-usage-artifact-ack';END IF;
  END IF;
  IF ack->>'scopeHash' IS DISTINCT FROM r->>'commandHash' OR ack->>'nonce' IS DISTINCT FROM n THEN RAISE EXCEPTION 'original-bridge-own-ack-scope';END IF;
  INSERT INTO pg_temp.original_bridge_results VALUES('ownAck',ack);
END;$own$;
RESET ROLE;
RESET SESSION AUTHORIZATION;
`}
DO $final$
BEGIN
  IF session_user<>'postgres' OR current_user<>session_user OR (SELECT count(*) FROM pg_temp.original_bridge_results)<>2 THEN
    RAISE EXCEPTION 'original-bridge-complete-atomic-result-required';END IF;
END;$final$;
COMMIT;
SELECT jsonb_build_object('schema','helmut-local-unit-original-write-result/1',
  '${artifact ? "originalRowAck" : "authAck"}',(SELECT ${artifact ? "value->'ack'" : "value"} FROM pg_temp.original_bridge_results WHERE phase='${artifact ? "originalRowAck" : "authAck"}'),
  'ownAck',(SELECT value FROM pg_temp.original_bridge_results WHERE phase='ownAck'));
`;
}
function prepare(request, inputQualification) {
  validate(request, inputQualification);
  const requestCopy = JSON.parse(canonical(request)), q = JSON.parse(canonical(inputQualification)), nonce = crypto.randomBytes(32).toString("hex");
  const sql = compile(requestCopy, q, nonce), packet = Object.freeze({ schema: "helmut-local-unit-original-transaction-plan/1",
    database: q.database, sql, sqlSHA256: SHA(sql), requestSHA256: SHA(canonical(requestCopy)), qualificationSHA256: SHA(canonical(q)),
    requiredInitialRole: "postgres", requiredInitialSuperuser: true, originallyUnprivileged: false,
    preparedOnly: true, privateOwnerInitialization: requestCopy.mode === "seed", publicSeedBlocked: true,
    resultTransitionBlocked: false, nativeResultProofRequired: true, unitExecutionAuthorized: false, full500: false });
  prepared.set(packet, { request: requestCopy, nonce }); return packet;
}
function acceptResult(packet, raw) {
  // Payload validation only. The private Owner service MUST first observe its
  // single psql process exit 0, both pipe EOFs and successful COMMIT completion.
  // The sole result SELECT follows COMMIT. Partial stdout or this pure function
  // alone still confers no independent native execution/commit authority.
  const d = prepared.get(packet); need(d, "private-prepared-plan-required"); prepared.delete(packet);
  if (Buffer.isBuffer(raw)) { need(raw.length <= 65536 && Buffer.from(raw.toString("utf8")).equals(raw), "result-utf8-cap"); raw = raw.toString("utf8"); }
  need(typeof raw === "string" && Buffer.byteLength(raw) <= 65536, "result-bytes");
  let value; try { value = JSON.parse(raw); } catch { need(false, "result-json"); }
  const r = d.request, c = r.originalCAS;
  const artifact = r.mode === "artifact", w = value?.ownAck;
  need(exact(value, ["schema", artifact ? "originalRowAck" : "authAck", "ownAck"])
    && value.schema === "helmut-local-unit-original-write-result/1", "result-shape");
  if (artifact) {
    const a = value.originalRowAck, expectedId = ["immutable-D", "evidence"].includes(r.artifact.kind)
      ? "local-unit-diagnostic-" + r.operationId + (r.artifact.kind === "evidence" ? "-evidence-0" : "-immutable-D-" + r.artifact.logicalId) : r.artifact.logicalId;
    need(exact(a, ["version", "scopeHash", "kind", "id", "hash", "stateRevision", "nonce"])
      && a.version === "helmut-local-unit-diagnostic-original-row-ack/1" && a.scopeHash === r.commandHash && a.kind === r.artifact.kind
      && a.id === expectedId && a.hash === r.artifact.sha256 && a.stateRevision === r.ownBefore.revision && a.nonce === d.nonce, "result-original-row-ack");
  } else {
    need(Array.isArray(value.authAck) && value.authAck.length === 1, "result-shape");
    const a = value.authAck[0];
    need(exact(a, ["id", "revision", "proof", "state"]) && a.id === "main-auth" && a.revision === c.revision && proof(a.proof) && state(a.state)
      && a.proof.generation === c.expectedProof.generation && a.proof.originalHash === c.expectedProof.originalHash
      && a.proof.count === c.expectedProof.count + c.additions.length
      && (r.mode === "usage" ? a.proof.head !== c.expectedProof.head : a.proof.head === c.expectedProof.head)
      && isDeepStrictEqual(a.state, { ...c.expectedState, root: c.root }), "result-original-ack");
  }
  if (r.mode === "seed") need(exact(w, ["version", "scopeHash", "operationId", "revision", "hash", "nonce"])
    && w.version === "helmut-local-unit-diagnostic-seed-ack/1" && w.hash === r.ownNext.hash
    && w.revision === 0 && w.operationId === r.operationId, "result-native-seed-ack");
  else if (r.mode === "state") {
    const next = JSON.parse(r.ownNext.canonical), journal = next["localUnitDiagnostic:" + r.operationId.slice(-32) + ":journal"], closed = journal?.state === "closed";
    need(exact(w, ["version", "scopeHash", "hash", "revision", "claimHash", "nonce", ...(closed ? ["authorizationHash", "controlsHash", "controlCount"] : [])])
      && w.version === "helmut-local-unit-diagnostic-state-ack/1" && w.hash === r.ownNext.hash
      && w.revision === r.ownBefore.revision + 1 && w.claimHash === SHA(r.claimId), "result-native-state-ack");
    if (closed) need(w.authorizationHash === journal.verification.authorizationHash && w.controlsHash === journal.verification.controlsHash
      && w.controlCount === 16, "result-native-final-verification-ack");
  }
  else need(exact(w, ["version", "scopeHash", "kind", "logicalId", "hash", "stateRevision", "nonce"])
    && w.version === "helmut-local-unit-diagnostic-artifact-ack/1" && w.kind === r.artifact.kind
    && w.logicalId === r.artifact.logicalId && w.hash === r.artifact.sha256 && w.stateRevision === r.ownBefore.revision, "result-native-artifact-ack");
  need(w.scopeHash === r.commandHash && w.nonce === d.nonce, "result-native-scope-nonce");
  return value;
}
module.exports = Object.freeze({ prepare, acceptResult });
