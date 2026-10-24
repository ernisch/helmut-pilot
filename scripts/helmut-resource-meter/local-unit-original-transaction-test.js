"use strict";
// Pure compilation/response/static tests only. Mock source OIDs are never a
// qualification or native proof. No psql, DB, owner child or unit is executed.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const transaction = require("./local-unit-original-transaction");
const code = fs.readFileSync(path.join(__dirname, "local-unit-original-transaction.js"), "utf8");
const proposal = fs.readFileSync(path.join(__dirname, "../../supabase/proposals/local_unit_original_bridge_local.sql"), "utf8");
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
const can = v => Array.isArray(v) ? "[" + v.map(can).join(",") + "]" : v !== null && typeof v === "object"
  ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + can(v[k])).join(",") + "}" : JSON.stringify(v);
const suffix = "a".repeat(32), op = "localUnitDiagnostic-" + suffix, prefix = "localUnitDiagnostic:" + suffix + ":";
const claim = "12345678-1234-4123-8123-123456789abc", generation = "22222222-2222-4222-8222-222222222222";
const originalNames = ["state_cas_v1", "state_payload_hash_local_v1", "state_leaf_info_local_v1", "state_children_local_v1",
  "state_nodes_guard_local_v1", "state_put_nodes_local_v1", "state_expand_local_v1", "state_assert_root_local_v1",
  "state_assert_data_local_v1", "state_assert_graph_local_v1", "state_auth_guard_local_v1", "state_graph_checked_local_v1",
  "usage_guard_local_v1", "usage_insert_local_v1", "usage_checked_proof_local_v1"].map(x => "public.helmut_auth_" + x);
const nativeNames = ["contract", "authority_read", "runtime_read", "state_read", "state_cas", "artifact_insert", "artifact_read", "lease_acquire", "lease_release"];
const helperArgs = { original_bridge_top_map_v1: "text, text, text", original_bridge_value_v1: "text, text, text, jsonb, boolean",
  original_bridge_own_projection_v1: "text, text, text, text", original_bridge_compare_delta_v1: "text, text, text, text, text, jsonb",
  original_bridge_compare_seed_v1: "text, text, text, text, text, jsonb",
  original_bridge_relations_v1: "", original_bridge_row_v1: "text, text, text, jsonb", original_bridge_result_v1: "text, jsonb",
  original_bridge_receipt_v1: "text, text, text, text, bigint, text, text, text, text, text" };
const helperBodies = [...proposal.matchAll(/create function helmut_unit_diagnostic\.(original_bridge_[a-z0-9_]+)\([^;]+?as \$f\$([\s\S]*?)\$f\$;/g)];
let count = 0;
function check(name, work) { work(); count++; }
function rejects(work) { let failed = false; try { work(); } catch (e) { failed = /^local-unit-original-transaction-[a-z0-9-]+$/.test(e.message); } assert.ok(failed, "expected bounded symbolic rejection"); }
function source(name, oid) { return { name, oid: String(oid), identityArguments: "jsonb", prosrcSHA256: "b".repeat(64),
  volatility: "v", returnType: "jsonb", language: "plpgsql", config: ["search_path=pg_catalog"] }; }
function qualification() {
  const helperSources = helperBodies.map((m, i) => ({ ...source("helmut_unit_diagnostic." + m[1], 2000 + i),
    identityArguments: helperArgs[m[1]], prosrcSHA256: hash(m[2]), volatility: "s", returnType: /compare_seed|receipt|result_v1/.test(m[1]) ? "void" : "jsonb" }));
  return { schema: "helmut-local-unit-original-bridge-qualification/1", database: "helmut_unit_diagnostic_" + suffix,
    operationId: op, commandHash: "c".repeat(64),
    originalRelations: ["briefings", "helmut_auth_state_nodes_local", "helmut_store", "llm_usage", "profiles"].map((n,i)=>({name:"public."+n,oid:String(4000+i)})), originalSources: originalNames.map((n, i) => source(n, 1000 + i)), helperSources,
    nativeSources: [...helperSources, ...nativeNames.map((n, i) => source("public.local_unit_diagnostic_" + n + "_v1", 3000 + i))] };
}
function request(mode = "state") {
  const next = { localUnitDiagnosticConsumedGrantsV1: {}, ...Object.fromEntries(["journal", "costs", "reservation", "sendClaim", "review", "result"].map(x => [prefix + x, {}])) };
  next[prefix + "journal"] = { claimId: claim, state: "running" };
  next[prefix + "result"] = { state: "pending", evidenceHash: null, positions: [] };
  const body = { id: "record-D", budgetTicketId: "ticket-D", costPhase: "D", scopeHash: "c".repeat(64),
    costBasis: "local-fixture-simulation-not-provider-charge", costRequestHash: "e".repeat(64) };
  if (mode === "usage") {
    next[prefix + "costs"] = { calls: { "ticket-D": { status: "sent" } } };
    next[prefix + "journal"].attempts = { D: { status: "sent", ticketId: "ticket-D" } };
    next[prefix + "sendClaim"] = { D: { ticketId: "ticket-D", requestHash: "e".repeat(64) } };
  }
  const canonical = can(next), nextHash = hash(canonical);
  return { schema: "helmut-local-unit-original-write/1", mode, operationId: op, commandHash: "c".repeat(64), claimId: claim,
    originalCAS: { id: "main-auth", expectedRevision: "33333333-3333-4333-8333-333333333333", revision: "44444444-4444-4444-8444-444444444444",
      expectedProof: { generation, count: 499, head: "d".repeat(64), originalHash: "e".repeat(64) },
      expectedState: { version: "merkle-auth-v1", generation, root: "f".repeat(64), originalHash: "b".repeat(64) },
      root: mode === "usage" ? "f".repeat(64) : "a".repeat(64), nodes: [], additions: mode === "usage" ? [body] : [] },
    ownBefore: { hash: mode === "usage" ? nextHash : "d".repeat(64), revision: 7 }, ownNext: { canonical, hash: nextHash },
    artifact: mode === "usage" ? { kind: "usage-D", logicalId: "ticket-D", canonical: can(body), sha256: hash(can(body)), parentHash: null } : null };
}
function seedRequest() {
  // Shape-only private verifier fixture. Its source metadata is deliberately
  // synthetic, and is never presented to a native DB as qualification.
  const r = request(), q = qualification(), grantId = "9".repeat(64), commandCanonical = can({ slot: { plan: { operationId: op } } });
  r.commandHash = q.commandHash = hash(commandCanonical); r.mode = "seed"; r.claimId = null; r.ownBefore = null;
  const verifiedAtUTC = "2026-10-22T12:00:00.000Z", expiresAtUTC = "2026-10-22T12:02:00.000Z";
  const admissionCanonical = can({ grantId, commandHash: r.commandHash, expiresAtUTC });
  const proofCanonical = can({ operationId: op, commandHash: r.commandHash, observedAtUTC: verifiedAtUTC });
  r.privateOwnerInitialization = { authority: { grantId, commandCanonical, admissionCanonical, admissionHash: hash(admissionCanonical),
    sourceHash: "1".repeat(64), targetHash: "2".repeat(64), postrunHash: "3".repeat(64), sourceProofHash: "4".repeat(64),
    codeManifestPin: { path: "/shape-only/CODE_MANIFEST.SAFE.json", bytes: 2, sha256: "5".repeat(64) },
    runtimeManifestPin: { path: "/shape-only/RUNTIME_MANIFEST.SAFE.json", bytes: 2, sha256: "6".repeat(64) },
    gateHashes: Object.fromEntries(["source", "runtime", "owner", "calendar", "costs", "reservation", "sender", "review", "result", "independentAcceptance"].map(k => [k, "7".repeat(64)])),
    verifierCodeHash: "8".repeat(64), requestModels: { D: "gpt-5-mini", R: "gpt-5-mini" }, verifiedAtUTC, expiresAtUTC },
    observation: { proofCanonical, proofHash: hash(proofCanonical), observedAtUTC: verifiedAtUTC } };
  const next = JSON.parse(r.ownNext.canonical);
  next.localUnitDiagnosticConsumedGrantsV1 = { [grantId]: {} };
  next[prefix + "journal"] = { operationId: op, commandHash: r.commandHash, state: "installed", claimId: null,
    index: 0, inFlight: null, attempts: {}, stopRequested: false, reason: null };
  next[prefix + "costs"] = { calls: {}, spent: 0, slot: JSON.parse(commandCanonical).slot };
  r.ownNext.canonical = can(next); r.ownNext.hash = hash(r.ownNext.canonical);
  return { r, q };
}
function artifactRequest(kind = "draft") {
  const r = request(); r.mode = "artifact"; r.originalCAS = null; r.ownBefore.hash = r.ownNext.hash;
  const owner = "test-kohorte-synthetik-bt-001", day = "2026-10-22", run = "nachlauf500-1234567890123";
  const id = ["draft", "review"].includes(kind) ? `bf-${owner}-lage-pruefentwurf-${day}-${run}-${kind === "draft" ? "entwurf" : "pruefung"}`
    : `bf-${owner}-${kind === "morgenbriefing" ? "morgenlage" : kind}-${day}`;
  const body = kind === "immutable-D" ? { version: "shape-only", contractHash: "a".repeat(64), entry: {}, completion: {}, usage: {} }
    : kind === "evidence" ? { schema: "helmut-local-unit-diagnostic-evidence/1", operationId: op, commandHash: r.commandHash, failure: "unit-not-confirmed" }
      : { id, user_id: owner, slot: ["draft", "review"].includes(kind) ? "lage-pruefentwurf" : kind === "morgenbriefing" ? "morgenlage" : kind,
        generated_at: "2026-10-22T12:00:00.000Z", payload: {} };
  const logicalId = kind === "immutable-D" ? "intent-D" : kind === "evidence" ? "diagnostic-result" : id;
  r.artifact = { kind, logicalId, canonical: can(body), sha256: hash(can(body)), parentHash: ["draft", "evidence"].includes(kind) ? null : "9".repeat(64) };
  return r;
}
function finalRequest(closed = true) {
  const r = request(), v = JSON.parse(r.ownNext.canonical);
  v[prefix + "result"] = { state: "retained-unreviewed", evidenceHash: "1".repeat(64), positions: ["lage", "mandatsbriefing", "morgenbriefing"].map(bereich => ({
    bereich, owner: "test-kohorte-synthetik-bt-001", hash: "2".repeat(64) })) };
  if (closed) Object.assign(v[prefix + "journal"], { state: "closed", index: 1, inFlight: null, stopRequested: false,
    verification: { authorizationHash: "3".repeat(64), controlsHash: "4".repeat(64), controlCount: 16 } });
  r.ownNext = { canonical: can(v), hash: hash(can(v)) }; return r;
}
function response(r, packet) {
  const nonce = /,'([a-f0-9]{64})',pg_backend_pid\(\),pg_current_xact_id\(\)\);\nDO \$root\$/.exec(packet.sql)?.[1]; assert.ok(Boolean(nonce), "closed request nonce absent");
  if (r.mode === "artifact") return { schema: "helmut-local-unit-original-write-result/1",
    originalRowAck: { version: "helmut-local-unit-diagnostic-original-row-ack/1", scopeHash: r.commandHash, kind: r.artifact.kind,
      id: r.artifact.kind === "evidence" ? "local-unit-diagnostic-" + r.operationId + "-evidence-0" : r.artifact.kind === "immutable-D"
        ? "local-unit-diagnostic-" + r.operationId + "-immutable-D-" + r.artifact.logicalId : r.artifact.logicalId,
      hash: r.artifact.sha256, stateRevision: r.ownBefore.revision, nonce },
    ownAck: { version: "helmut-local-unit-diagnostic-artifact-ack/1", scopeHash: r.commandHash, kind: r.artifact.kind,
      logicalId: r.artifact.logicalId, hash: r.artifact.sha256, stateRevision: r.ownBefore.revision, nonce } };
  const verification = JSON.parse(r.ownNext.canonical)[prefix + "journal"].state === "closed"
    ? JSON.parse(r.ownNext.canonical)[prefix + "journal"].verification : {};
  return { schema: "helmut-local-unit-original-write-result/1", authAck: [{ id: "main-auth", revision: r.originalCAS.revision,
    proof: { ...r.originalCAS.expectedProof, count: r.originalCAS.expectedProof.count + (r.mode === "usage" ? 1 : 0),
      head: r.mode === "usage" ? "1".repeat(64) : r.originalCAS.expectedProof.head }, state: { ...r.originalCAS.expectedState, root: r.originalCAS.root } }],
    ownAck: r.mode === "seed" ? { version: "helmut-local-unit-diagnostic-seed-ack/1", scopeHash: r.commandHash,
      operationId: r.operationId, revision: 0, hash: r.ownNext.hash, nonce } : r.mode === "state" ? { version: "helmut-local-unit-diagnostic-state-ack/1", scopeHash: r.commandHash,
      hash: r.ownNext.hash, revision: r.ownBefore.revision + 1, claimHash: hash(r.claimId), nonce, ...verification }
      : { version: "helmut-local-unit-diagnostic-artifact-ack/1", scopeHash: r.commandHash, kind: r.artifact.kind,
        logicalId: r.artifact.logicalId, hash: r.artifact.sha256, stateRevision: r.ownBefore.revision, nonce } };
}
check("all four root DO scopes keep catalog aliases separate from PLpgSQL variables and retain every source guard", () => {
  // Lexical regression for this fixed compiler scope, not a PostgreSQL parser
  // or native execution proof. Relation aliases are compared to DECLARE names.
  function bindings(sql) {
    const root = /DO \$root\$\s*DECLARE ([\s\S]*?)\nBEGIN\n([\s\S]*?)END;\$root\$;/.exec(sql);
    assert.ok(root, "root DO scope missing");
    const variables = new Set(root[1].split(";").map(s => /^\s*([a-z_][a-z0-9_]*)/i.exec(s)?.[1]).filter(Boolean));
    const body = root[2].replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    const keywords = new Set(["where", "join", "cross", "left", "right", "inner", "full", "on", "into", "union", "order", "group"]);
    const aliases = [...body.matchAll(/\b(?:FROM|JOIN)\s+(?:[a-z_][a-z0-9_]*\.)*[a-z_][a-z0-9_]*\s+(?:AS\s+)?([a-z_][a-z0-9_]*)/gi)]
      .map(m => m[1]).filter(alias => !keywords.has(alias.toLowerCase()));
    return { body: root[2], variables, aliases, collisions: aliases.filter(alias => variables.has(alias)) };
  }
  const seed = seedRequest();
  for (const [mode, r, q] of [["seed", seed.r, seed.q], ["state", request(), qualification()],
    ["usage", request("usage"), qualification()], ["artifact", artifactRequest(), qualification()]]) {
    const packet = transaction.prepare(r, q), scope = bindings(packet.sql);
    assert.ok(scope.variables.has("p") && scope.variables.has("t"), mode + " record declarations omitted from scope analysis");
    assert.equal(scope.collisions.length, 0, mode + " catalog alias collides with a PLpgSQL variable");
    const proc = /FROM pg_proc ([a-z_]+) JOIN pg_namespace n ON n\.oid=([a-z_]+)\.pronamespace/.exec(scope.body);
    const trigger = /FROM pg_trigger ([a-z_]+) WHERE NOT ([a-z_]+)\.tgisinternal/.exec(scope.body);
    assert.ok(proc && trigger); assert.equal(proc[1], proc[2]); assert.equal(trigger[1], trigger[2]);
    assert.ok(scope.body.includes(`array_agg(${proc[1]}.oid ORDER BY ${proc[1]}.oid)`));
    assert.ok(scope.body.includes(`${proc[1]}.proname=ANY(ARRAY[`));
    assert.ok(scope.body.includes(`${trigger[1]}.tgrelid IN`) && scope.body.includes(`(s0->>'oid')::oid=${trigger[1]}.tgfoid`));
    for (const text of ["p0.oid=(s->>'oid')::oid", "oidvectortypes(p.proargtypes)", "encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')",
      "p.prosecdef", "to_jsonb(p.proconfig)", "p.provolatile::text", "format_type(p.prorettype,null)", "p.lanname",
      "actual_native IS DISTINCT FROM expected_native", "original_bridge_relations_v1() IS DISTINCT FROM q->'originalRelations'",
      "original-bridge-complete-original-trigger-set", "relrowsecurity AND relkind='r')<>4"])
      assert.ok(scope.body.includes(text), mode + " original source/catalog guard missing");
    for (const name of nativeNames) assert.ok(scope.body.includes("'local_unit_diagnostic_" + name + "_v1'"));
    for (const name of ["helmut_store", "helmut_auth_state_nodes_local", "llm_usage", "briefings"])
      assert.ok(scope.body.includes("'public." + name + "'::regclass"));
    // Reinstate each original collision independently: the regression must
    // detect both the actual failing JOIN and the later trigger guard alias.
    for (const [alias, variable] of [[proc[1], "p"], [trigger[1], "t"]]) {
      const changed = packet.sql.replace(new RegExp("\\b" + alias + "\\b", "g"), variable);
      assert.ok(bindings(changed).collisions.includes(variable), mode + " historical alias collision escaped the regression");
    }
  }
});
check("pure state and usage compilation with explicit privileged origin", () => {
  for (const mode of ["state", "usage"]) { const r = request(mode), packet = transaction.prepare(r, qualification());
    assert.ok(packet.preparedOnly && packet.requiredInitialSuperuser && packet.requiredInitialRole === "postgres" && !packet.originallyUnprivileged
      && !packet.unitExecutionAuthorized && !packet.full500 && packet.publicSeedBlocked && !packet.resultTransitionBlocked && packet.nativeResultProofRequired);
    assert.ok(packet.sqlSHA256 === hash(packet.sql) && packet.requestSHA256 === hash(can(r)));
    assert.ok(transaction.acceptResult(packet, JSON.stringify(response(r, packet))).schema === "helmut-local-unit-original-write-result/1");
  }
});
check("helper native prosrc pins are actual exact proposal body hashes", () => {
  assert.ok(helperBodies.length === 9);
  for (const m of helperBodies) assert.ok(code.includes(hash(m[2])), "helper source pin drift");
  const q = qualification(); q.helperSources[0].prosrcSHA256 = "0".repeat(64); rejects(() => transaction.prepare(request(), q));
});
check("private seed compiles actual original CAS and owner-only revision-zero insert", () => {
  const { r, q } = seedRequest(), packet = transaction.prepare(r, q), sql = packet.sql;
  assert.ok(packet.privateOwnerInitialization && packet.publicSeedBlocked && packet.preparedOnly && !packet.unitExecutionAuthorized);
  assert.ok((sql.match(/^BEGIN;/gm) || []).length === 1 && (sql.match(/^COMMIT;/gm) || []).length === 1);
  const authority = sql.indexOf("INSERT INTO helmut_unit_diagnostic.authority"), observation = sql.indexOf("INSERT INTO helmut_unit_diagnostic.runtime_observations");
  const original = sql.indexOf("ack:=public.helmut_auth_state_cas_v1(c)"), own = sql.indexOf("INSERT INTO helmut_unit_diagnostic.state");
  assert.ok(authority > sql.indexOf("original-bridge-complete-native-source-set") && authority < observation && observation < original && original < own);
  assert.ok(sql.indexOf("scope_hash=r->>'commandHash' FOR UPDATE;") < sql.indexOf("WHERE id='main-auth' FOR UPDATE;"));
  assert.ok(!sql.includes("SET SESSION AUTHORIZATION helmut_ud_authenticator_") && !sql.includes("SET LOCAL ROLE helmut_ud_runtime_"));
  for (const text of ["original-bridge-seed-old-own-key-present", "original_bridge_compare_seed_v1", "original-bridge-seed-exact-private-owner-required",
    "original-bridge-seed-fresh-private-initialization-required", "RETURNING * INTO STRICT inserted", "inserted IS DISTINCT FROM persisted",
    "original-bridge-seed-persisted-state-unconfirmed", "helmut-local-unit-diagnostic-seed-ack/1"])
    assert.ok(sql.includes(text), "seed binding missing");
  const result = transaction.acceptResult(packet, JSON.stringify(response(r, packet)));
  assert.deepEqual(Object.keys(result.ownAck).sort(), ["hash", "nonce", "operationId", "revision", "scopeHash", "version"]);
});
check("seed private input cannot claim consume replay inject roles or change initial own state", () => {
  for (const mutate of [r => { r.claimId = claim; }, r => { r.ownBefore = { hash: "0".repeat(64), revision: 0 }; },
    r => { r.privateOwnerInitialization.qualified = true; }, r => { r.privateOwnerInitialization.authority.scopeHash = r.commandHash; },
    r => { r.privateOwnerInitialization.observation.ordinal = 1; }, r => { r.privateOwnerInitialization.authority.commandCanonical += " "; },
    r => { r.privateOwnerInitialization.authority.admissionHash = "0".repeat(64); },
    r => { r.privateOwnerInitialization.observation.proofHash = "0".repeat(64); }, r => { r.privateOwnerInitialization.authority.verifiedAtUTC = "invalid"; },
    r => { r.originalCAS.additions = [{}]; }, r => { r.artifact = {}; }]) {
    const { r, q } = seedRequest(); mutate(r); rejects(() => transaction.prepare(r, q));
  }
  for (const mutate of [v => { v[prefix + "journal"].claimId = claim; }, v => { v[prefix + "journal"].attempts.D = {}; },
    v => { v[prefix + "journal"].state = "running"; }, v => { v[prefix + "costs"].spent = 1; },
    v => { v[prefix + "costs"].calls.ticket = {}; }, v => { v[prefix + "sendClaim"].D = {}; },
    v => { v.localUnitDiagnosticConsumedGrantsV1.oldGrant = {}; }]) {
    const { r, q } = seedRequest(), v = JSON.parse(r.ownNext.canonical); mutate(v);
    r.ownNext.canonical = can(v); r.ownNext.hash = hash(r.ownNext.canonical); rejects(() => transaction.prepare(r, q));
  }
  const r = request(); r.privateOwnerInitialization = seedRequest().r.privateOwnerInitialization;
  rejects(() => transaction.prepare(r, qualification()));
});
check("seed new-key native comparison never weakens normal delta or opens runtime seed execute", () => {
  const body = helperBodies.find(x => x[1] === "original_bridge_compare_seed_v1")[2];
  assert.ok(body.includes("if old_map?k or not(new_map?k)"));
  for (const text of ["original-bridge-outside-keyset-changed", "original-bridge-outside-child-hash-changed", "original-bridge-outside-inline-value-changed",
    "original-bridge-own-projection-mismatch", "original_bridge_top_map_v1"]) assert.ok(body.includes(text));
  assert.ok(proposal.includes("if not(old_map?k) or not(new_map?k)"));
  assert.ok(proposal.includes("original_bridge_compare_seed_v1(text,text,text,text,text,jsonb) to %I',writer"));
  assert.ok(!proposal.includes("'original_bridge_compare_seed_v1','original_bridge_receipt_v1'"));
});
check("seed ACK cannot acknowledge any old scope claim hash revision or history change", () => {
  for (const mutate of [v => { v.authAck = []; }, v => { v.authAck[0].proof.head = "0".repeat(64); },
    v => { v.authAck[0].proof.count++; }, v => { v.ownAck.version = "helmut-local-unit-diagnostic-state-ack/1"; },
    v => { v.ownAck.operationId = "old"; }, v => { v.ownAck.revision = 1; }, v => { v.ownAck.claimHash = "0".repeat(64); },
    v => { v.ownAck.nonce = "0".repeat(64); }, v => { v.ownAck.hash = "0".repeat(64); }]) {
    const { r, q } = seedRequest(), packet = transaction.prepare(r, q), value = response(r, packet); mutate(value);
    rejects(() => transaction.acceptResult(packet, JSON.stringify(value)));
  }
});
check("seven fixed original artifact kinds use one transaction and zero main auth CAS", () => {
  for (const kind of ["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"]) {
    const r = artifactRequest(kind), packet = transaction.prepare(r, qualification()), sql = packet.sql;
    assert.ok((sql.match(/^BEGIN;/gm) || []).length === 1 && (sql.match(/^COMMIT;/gm) || []).length === 1);
    assert.ok(!sql.includes("ack:=public.helmut_auth_state_cas_v1(c)") && sql.includes("INSERT INTO public.briefings") && sql.includes("INSERT INTO public.helmut_store"));
    assert.ok(sql.indexOf("WHERE scope_hash=r->>'commandHash' FOR UPDATE;") < sql.indexOf("WHERE id='main-auth' FOR UPDATE;"));
    assert.ok(sql.indexOf("INSERT INTO public.briefings") < sql.indexOf("ack:=public.local_unit_diagnostic_artifact_insert_v1"));
    assert.ok(sql.includes("WITH CHECK(phase=''originalRowAck'')") && sql.includes("parent_hash IS NOT DISTINCT FROM r#>>'{artifact,parentHash}'"));
    assert.ok(sql.includes("after_meta IS DISTINCT FROM before_meta") && sql.includes("original-bridge-artifact-original-insert-readback"));
    assert.ok(sql.includes("'originalRowAck',(SELECT value->'ack'") && sql.indexOf("COMMIT;") < sql.indexOf("SELECT jsonb_build_object('schema'"));
    const value = response(r, packet); assert.ok(transaction.acceptResult(packet, JSON.stringify(value)).originalRowAck.kind === kind);
  }
});
check("artifact DTO cannot select original rows tables mutate auth or smuggle legacy usage", () => {
  for (const mutate of [r => { r.originalRow = { table: "profiles", id: "arbitrary" }; }, r => { r.originalCAS = request().originalCAS; },
    r => { r.ownBefore.hash = "0".repeat(64); }, r => { r.artifact.table = "briefings"; }, r => { r.artifact.kind = "usage-D"; },
    r => { r.artifact.kind = "arbitrary"; }, r => { r.artifact.parentHash = "0".repeat(64); }, r => { r.artifact.logicalId += "'"; },
    r => { r.artifact.sha256 = "0".repeat(64); }]) {
    const r = artifactRequest(); mutate(r); rejects(() => transaction.prepare(r, qualification()));
  }
  const r = artifactRequest("review"); r.artifact.parentHash = null; rejects(() => transaction.prepare(r, qualification()));
});
check("native original catalog binds actual columns defaults FK RLS policies and triggers", () => {
  const body = helperBodies.find(x => x[1] === "original_bridge_relations_v1")[2];
  for (const text of ["pg_attribute", "pg_attrdef", "pg_constraint", "pg_policy", "pg_trigger", "relrowsecurity", "relforcerowsecurity",
    "pg_get_constraintdef", "pg_get_triggerdef", "pg_get_expr", "'profiles'", "'briefings'", "jsonb_array_length(answer) is distinct from 5"])
    assert.ok(body.includes(text));
  assert.ok(proposal.includes("original-bridge-actual-briefing-profile-fk-required") && proposal.includes("not fk.condeferrable"));
  for (const mutate of [q => { delete q.originalRelations; }, q => { q.originalRelations.pop(); },
    q => { q.originalRelations[0].name = "public.unrelated"; }, q => { q.originalRelations[0].oid = "0"; }]) {
    const q = qualification(); mutate(q); rejects(() => transaction.prepare(artifactRequest(), q));
  }
});
check("native row mapping uses original IDs exact five fields and timestamp instant and UTC text", () => {
  const rowBody = helperBodies.find(x => x[1] === "original_bridge_row_v1")[2], sql = transaction.prepare(artifactRequest(), qualification()).sql;
  for (const text of ["local-unit-diagnostic-", "'-immutable-D-'", "'-evidence-0'", "'-lage-pruefentwurf-'", "'-pruefung'",
    "'morgenlage'", "'id','user_id','slot','generated_at','payload'", "original-bridge-seven-original-row-kinds"])
    assert.ok((rowBody + proposal).includes(text));
  assert.ok(sql.includes("actual_time IS DISTINCT FROM helmut_unit_diagnostic.utc") && sql.includes('YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  assert.ok(!sql.includes("ON CONFLICT") && !sql.includes("UPDATE public.briefings") && !sql.includes("UPDATE public.helmut_store"));
});
check("native artifact receipt requires physical own transaction row unchanged auth and enforced writer receipt phase", () => {
  const body = helperBodies.find(x => x[1] === "original_bridge_receipt_v1")[2];
  for (const text of ["p_mode not in ('state','usage','artifact')", "phase=receipt_phase", "originalRowAck", "original-bridge-artifact-real-original-row",
    "original_xmin is distinct from mod(backend_tx::text::numeric,4294967296)::text", "actual_meta is distinct from ack->'authBefore'",
    "actual_meta is distinct from ack->'authAfter'", "original-bridge-artifact-main-auth-must-be-unchanged", "original-bridge-receipt-native-relations-changed",
    "original-bridge-artifact-native-time"]) assert.ok(body.includes(text));
  assert.ok(!body.includes("current_setting("));
});
check("artifact output ACK binds both original and own rows separately without fake auth ACK", () => {
  for (const mutate of [v => { v.authAck = []; }, v => { v.originalRowAck.id = "main-auth"; },
    v => { v.originalRowAck.hash = "0".repeat(64); }, v => { v.originalRowAck.nonce = "0".repeat(64); },
    v => { v.originalRowAck.kind = "review"; }, v => { v.originalRowAck.stateRevision++; },
    v => { v.ownAck.logicalId = "old"; }, v => { v.ownAck.hash = "0".repeat(64); }, v => { v.ownAck.nonce = "0".repeat(64); }]) {
    const r = artifactRequest(), packet = transaction.prepare(r, qualification()), value = response(r, packet); mutate(value);
    rejects(() => transaction.acceptResult(packet, JSON.stringify(value)));
  }
});
check("retained and closed states require native actual seven rows successful evidence and sixteen controls", () => {
  const body = helperBodies.find(x => x[1] === "original_bridge_result_v1")[2];
  for (const text of ["validate_state(s,next_own)", "verify_controls(evidence->'verification'", "if evidence?'failure'", "<>7",
    "original-bridge-final-original-row-readback", "original-bridge-final-native-time", "original-bridge-final-actual-artifact-hash"])
    assert.ok(body.includes(text));
  for (const closed of [false, true]) {
    const r = finalRequest(closed), packet = transaction.prepare(r, qualification());
    assert.ok(packet.nativeResultProofRequired && !packet.resultTransitionBlocked);
    assert.ok(packet.sql.indexOf("PERFORM helmut_unit_diagnostic.original_bridge_result_v1") < packet.sql.indexOf("ack:=public.helmut_auth_state_cas_v1(c)"));
    assert.ok(transaction.acceptResult(packet, JSON.stringify(response(r, packet))).ownAck.hash === r.ownNext.hash);
  }
  for (const mutate of [v => { v[prefix + "result"].positions.pop(); }, v => { v[prefix + "result"].positions[0].bereich = "other"; },
    v => { v[prefix + "journal"].verification.controlCount = 15; }, v => { v[prefix + "journal"].inFlight = {}; },
    v => { v[prefix + "journal"].stopRequested = true; }]) {
    const r = finalRequest(), v = JSON.parse(r.ownNext.canonical); mutate(v); r.ownNext = { canonical: can(v), hash: hash(can(v)) };
    rejects(() => transaction.prepare(r, qualification()));
  }
  for (const mutate of [v => { delete v.ownAck.controlsHash; }, v => { v.ownAck.authorizationHash = "0".repeat(64); }, v => { v.ownAck.controlCount = 15; }]) {
    const r = finalRequest(), packet = transaction.prepare(r, qualification()), value = response(r, packet); mutate(value);
    rejects(() => transaction.acceptResult(packet, JSON.stringify(value)));
  }
});
check("compiler has narrowly compared native stop delta without replacing native deadlines", () => {
  const sql = transaction.prepare(request(), qualification()).sql;
  for (const text of ["terminal_stop:=coalesce(", "d-(prefix||'journal')=own_row.body-(prefix||'journal')",
    "-ARRAY['state','stopRequested','reason']", "IN('running','unknown','stopped')", "AND NOT terminal_stop",
    "WHERE call.value->>'status' IN('reserved','sent','unknown')", "THEN 'unknown' ELSE 'stopped' END", "'reason']='unit-not-confirmed',false)"])
    assert.ok(sql.includes(text));
  assert.ok(!sql.includes("'^[a-z0-9-]{1,80}$',false)"), "an arbitrary stop reason cannot exempt expiration");
  assert.ok(!transaction.prepare(artifactRequest("evidence"), qualification()).sql.includes("clock_timestamp()>=authority_row.expires_at"));
});
check("receipt permits native final result validation without either obsolete shared result barrier", () => {
  const body = helperBodies.find(x => x[1] === "original_bridge_receipt_v1")[2];
  const projection = body.slice(body.indexOf("actual_own:=helmut_unit_diagnostic.original_bridge_compare_delta_v1", body.indexOf("if p_mode='artifact'")), body.indexOf("if p_mode='state' then"));
  assert.ok(projection.includes("actual_own is distinct from next_own") && projection.includes("'claimId'"));
  assert.ok(!projection.includes("'state']='closed'") && !projection.includes("prefix||'result'"), "closed and retained results must reach the native state proof");
  const state = body.slice(body.indexOf("if p_mode='state' then"), body.indexOf("-- Usage still cannot"));
  assert.ok(state.includes("perform helmut_unit_diagnostic.original_bridge_result_v1(p_scope,next_own)"));
  assert.ok(state.includes("c->'additions' is distinct from '[]'::jsonb") && state.includes("next_own is not distinct from own_row.body"));
  const usage = body.slice(body.indexOf("-- Usage still cannot"));
  assert.ok(usage.includes("next_own#>>array[prefix||'journal','state']='closed'")
    && usage.includes("next_own->(prefix||'result') is distinct from '{\"state\":\"pending\",\"evidenceHash\":null,\"positions\":[]}'::jsonb"));
  const q = qualification(); q.helperSources.find(x => x.name.endsWith(".original_bridge_receipt_v1")).prosrcSHA256 =
    "e48839cdb5eeec19e4d79baa36216d1521e053f3145a45a981e882a678aed719";
  rejects(() => transaction.prepare(finalRequest(), q));
});
check("target mode seed result and field smuggling rejected", () => {
  for (const mutate of [r => { r.mode = "seed"; }, r => { r.mode = "result"; }, r => { r.operationId = "production"; },
    r => { r.originalCAS.id = "main"; }, r => { r.originalCAS.extra = true; }, r => { r.claimId = generation; },
    r => { r.extra = true; }, r => { r.originalCAS.revision = r.originalCAS.expectedRevision; }]) {
    const r = request(); mutate(r); rejects(() => transaction.prepare(r, qualification()));
  }
  const q = qualification(); q.database = "postgres"; rejects(() => transaction.prepare(request(), q));
});
check("exact canonical own seven rejects whitespace duplicate keys arbitrary state and retained results", () => {
  for (const mutate of [v => { v.unrelated = true; }, v => { delete v[prefix + "review"]; },
    v => { v[prefix + "result"].state = "retained-unreviewed"; }, v => { v[prefix + "journal"].state = "closed"; }]) {
    const r = request(), v = JSON.parse(r.ownNext.canonical); mutate(v); r.ownNext.canonical = can(v); r.ownNext.hash = hash(r.ownNext.canonical);
    rejects(() => transaction.prepare(r, qualification()));
  }
  for (const text of [" " + request().ownNext.canonical, '{"x":1,"x":2}']) {
    const r = request(); r.ownNext.canonical = text; r.ownNext.hash = hash(text); rejects(() => transaction.prepare(r, qualification()));
  }
});
check("state delta cannot append usage or replay own hash", () => {
  for (const mutate of [r => { r.originalCAS.additions = [{}]; }, r => { r.ownBefore.hash = r.ownNext.hash; },
    r => { r.originalCAS.root = r.originalCAS.expectedState.root; }, r => { r.artifact = {}; }]) {
    const r = request(); mutate(r); rejects(() => transaction.prepare(r, qualification()));
  }
});
check("usage is exactly one current sent ticket and identical artifact", () => {
  for (const mutate of [r => { r.originalCAS.additions = []; }, r => { r.originalCAS.additions.push({}); },
    r => { r.originalCAS.additions[0].budgetTicketId = "old-ticket"; }, r => { r.artifact.parentHash = "a".repeat(64); },
    r => { r.artifact.kind = "usage-X"; }, r => { r.originalCAS.root = "a".repeat(64); }, r => { r.ownBefore.hash = "a".repeat(64); }]) {
    const r = request("usage"); mutate(r); rejects(() => transaction.prepare(r, qualification()));
  }
  const r = request("usage"), v = JSON.parse(r.ownNext.canonical); v[prefix + "costs"].calls["ticket-D"].status = "accounted";
  r.ownNext.canonical = can(v); r.ownNext.hash = hash(r.ownNext.canonical); r.ownBefore.hash = r.ownNext.hash;
  rejects(() => transaction.prepare(r, qualification()));
});
check("nodes use actual bytes hashes uniqueness and fixed size", () => {
  const r = request(), payload = '["v",{"sample":"value"}]'; r.originalCAS.nodes = [{ hash: hash(payload), payload }];
  assert.ok(transaction.prepare(r, qualification()).preparedOnly);
  r.originalCAS.nodes[0].hash = "0".repeat(64); rejects(() => transaction.prepare(r, qualification()));
  r.originalCAS.nodes[0].hash = hash(payload); r.originalCAS.nodes.push({ ...r.originalCAS.nodes[0] }); rejects(() => transaction.prepare(r, qualification()));
});
check("qualification cannot substitute code helpers namespace or grant broad legacy mutators", () => {
  for (const mutate of [q => { q.originalSources.pop(); }, q => { q.nativeSources.pop(); }, q => { q.helperSources[0].oid = "0"; },
    q => { q.originalSources[0].name = "public.helmut_auth_state_restore_v1"; },
    q => { q.originalSources[0].config = null; }, q => { q.nativeSources[0].config = null; },
    q => { q.originalSources.push(source("public.arbitrary_mutator", 8000)); },
    q => { q.originalSources[0].token = "forbidden"; }, q => { q.helperSources = []; }]) {
    const q = qualification(); mutate(q); rejects(() => transaction.prepare(request(), q));
  }
});
check("one transaction actual unchanged original call session roles lock order and postcommit result", () => {
  const sql = transaction.prepare(request(), qualification()).sql;
  assert.ok(sql.startsWith("BEGIN;\n") && (sql.match(/^BEGIN;/gm) || []).length === 1 && (sql.match(/^COMMIT;/gm) || []).length === 1);
  assert.ok(sql.indexOf("FOR UPDATE;") < sql.indexOf("WHERE id='main-auth' FOR UPDATE;"));
  assert.ok(sql.indexOf("SET SESSION AUTHORIZATION helmut_ud_bridge_writer_") < sql.indexOf("ack:=public.helmut_auth_state_cas_v1(c)"));
  assert.ok(sql.indexOf("ack:=public.helmut_auth_state_cas_v1(c)") < sql.indexOf("SET SESSION AUTHORIZATION helmut_ud_authenticator_"));
  assert.ok(sql.indexOf("COMMIT;") < sql.indexOf("SELECT jsonb_build_object('schema','helmut-local-unit-original-write-result/1'"));
  for (const required of ["original-bridge-runtime-delta-execute-required", "helmut_auth_usage_checked_proof_local_v1", "original-bridge-original-ack-unconfirmed",
    "original-bridge-exact-original-usage-row", "d IS NOT DISTINCT FROM own_row.body", "pg_my_temp_schema()",
    "p.prosecdef", "original-bridge-complete-native-source-set", "original-bridge-complete-original-trigger-set"]) assert.ok(sql.includes(required));
  assert.ok(!sql.includes("WHEN OTHERS") && !sql.includes("SECURITY DEFINER") && !sql.includes("DISABLE TRIGGER"));
});
check("state and usage keep genuine old/new comparisons inside the mandatory native receipt", () => {
  const receipt = helperBodies.find(x => x[1] === "original_bridge_receipt_v1")[2];
  const delta = helperBodies.find(x => x[1] === "original_bridge_compare_delta_v1")[2];
  for (const mode of ["state", "usage"]) {
    const sql = transaction.prepare(request(mode), qualification()).sql;
    const original = sql.slice(sql.indexOf("DO $original$"), sql.indexOf("END;$original$;"));
    assert.ok(!original.includes("original_bridge_own_projection_v1(") && !original.includes("original_bridge_compare_delta_v1("));
    assert.ok(original.includes("ack:=public.helmut_auth_state_cas_v1(c)"));
    assert.ok(sql.includes("IF NOT has_function_privilege('helmut_ud_runtime_" + suffix + "','helmut_unit_diagnostic.original_bridge_compare_delta_v1(text,text,text,text,text,jsonb)','EXECUTE')"));
  }
  const call = receipt.indexOf("actual_own:=helmut_unit_diagnostic.original_bridge_compare_delta_v1");
  assert.ok(call > receipt.indexOf("original-bridge-receipt-real-own-before")
    && call > receipt.indexOf("original-bridge-receipt-real-original-ack")
    && call > receipt.indexOf("original-bridge-receipt-native-relations-changed"));
  assert.ok(receipt.slice(call).includes("c#>>'{expectedState,root}',auth_state->>'root',r->>'operationId',next_own)"));
  assert.ok(!receipt.slice(call).includes("original_bridge_own_projection_v1("));
  for (const required of ["original-bridge-delta-runtime-principal", "receipt_pid<>pg_backend_pid()", "receipt_tx is distinct from backend_tx",
    "encode(sha256(convert_to(request_text,'UTF8')),'hex') is distinct from request_hash", "n!~'^[a-f0-9]{64}$'",
    "r->>'operationId' is distinct from operation_id", "c#>>'{expectedState,generation}' is distinct from g",
    "c#>>'{expectedState,root}' is distinct from old_root", "c->>'root' is distinct from new_root",
    "where scope_hash=r->>'commandHash'", "own_row.body_hash is distinct from r#>>'{ownBefore,hash}'",
    "own_row.revision::text is distinct from r#>>'{ownBefore,revision}'", "own_row.body is distinct from own_row.canonical_text::jsonb",
    "original_bridge_value_v1(s,g,k,old_map->k,true)", "octet_length(old_own::text)>4194304",
    "old_own is distinct from own_row.body", "original-bridge-old-full-auth-mirror",
    "original-bridge-outside-keyset-changed", "original-bridge-outside-child-hash-changed", "original-bridge-outside-inline-value-changed",
    "original_bridge_value_v1(s,g,k,new_map->k,true)", "octet_length(actual_own::text)>4194304",
    "actual_own is distinct from expected_own", "return actual_own;"]) assert.ok(delta.includes(required), "required delta proof missing: " + required);
  assert.equal((delta.match(/original_bridge_top_map_v1\(/g) || []).length, 2);
  assert.ok(delta.includes("if old_root=new_root then new_map:=old_map;\n  else new_map:=helmut_unit_diagnostic.original_bridge_top_map_v1(s,g,new_root);end if;"));
  assert.ok(delta.includes("if old_root=new_root then actual_own:=old_own;"));
  assert.ok(!/insert\s+into|update\s+helmut|set_config|current_setting|exception\s+when/i.test(delta));
  assert.ok(!transaction.prepare(artifactRequest(), qualification()).sql.includes("original-bridge-runtime-delta-execute-required"));
  const q = qualification(); q.helperSources.find(s => s.name.endsWith(".original_bridge_compare_delta_v1")).returnType = "void";
  rejects(() => transaction.prepare(request(), q));
});
check("structured argument quoting prevents caller SQL interpolation", () => {
  const r = request(), text = '["v",{"x":"\' ; COMMIT; SELECT pg_sleep(10); -- \\\\"}]';
  r.originalCAS.nodes = [{ hash: hash(text), payload: text }]; const sql = transaction.prepare(r, qualification()).sql;
  assert.ok(sql.includes("'' ; COMMIT; SELECT pg_sleep(10); --"));
  assert.ok((sql.match(/^COMMIT;/gm) || []).length === 1);
});
check("native read helpers remain SECINV bounded and never copy complete auth", () => {
  assert.ok((proposal.match(/create function helmut_unit_diagnostic\.original_bridge_/g) || []).length === 9);
  assert.ok((proposal.match(/language plpgsql stable security invoker set search_path=pg_catalog/g) || []).length === 9);
  assert.ok(!/security\s+definer|create\s+or\s+replace|disable\s+trigger|drop\s+trigger/i.test(proposal));
  for (const required of ["current_hash=any(seen)", "result?k", "original-bridge-mixed-leaf-required", "native_work+native_size>16777216",
    "original-bridge-outside-child-hash-changed", "original-bridge-own-key-missing-seed-blocked", "with check(false)", "pg_depend", "d.deptype='i'",
    "original-bridge-qualified-trigger-closure-incomplete"]) assert.ok(proposal.includes(required));
});
check("private receipt pins native temp identity ACLs columns roles backend and original tuple", () => {
  const m = helperBodies.find(x => x[1] === "original_bridge_receipt_v1"); assert.ok(Boolean(m)); const body = m[2];
  for (const required of ["pg_my_temp_schema()", "rel.relowner<>root_oid", "rel.relpersistence<>'t'", "acldefault('r',root_oid)",
    "original-bridge-temp-schema-acl", "attacl is not null", "original-bridge-temp-results-policy-shape", "original-bridge-temp-args-shape",
    "pg_get_expr(polwithcheck,polrelid)=case when p_mode='artifact'", "pg_get_expr(polwithcheck,polrelid)='(phase = ''ownAck''::text)'",
    "receipt_pid<>pg_backend_pid()", "receipt_tx is distinct from backend_tx", "pg_current_xact_id_if_assigned()",
    "auth_xmin is distinct from mod(backend_tx::text::numeric,4294967296)::text", "original-bridge-pre-own-receipt-count",
    "original-bridge-receipt-complete-sources", "original-bridge-receipt-real-original-ack", "original-bridge-receipt-real-own-projection",
    "original-bridge-receipt-exact-usage-row", "next_own is not distinct from own_row.body"]) assert.ok(body.includes(required), "required native receipt guard missing");
  assert.ok(!body.includes("current_setting("), "receipt must not use an authorization GUC");
});
check("compiler prevents runtime authAck fabrication with root-owned enforced insert policies", () => {
  const sql = transaction.prepare(request(), qualification()).sql;
  for (const required of ["backend_pid integer not null,transaction_id xid8 not null", "pg_backend_pid(),pg_current_xact_id()",
    "ALTER TABLE pg_temp.original_bridge_results ENABLE ROW LEVEL SECURITY", "ALTER TABLE pg_temp.original_bridge_results FORCE ROW LEVEL SECURITY",
    "CREATE POLICY original_bridge_auth_insert", "WITH CHECK(phase=''authAck'')", "CREATE POLICY original_bridge_own_insert",
    "WITH CHECK(phase=''ownAck'')", "REVOKE ALL ON TABLE %s FROM PUBLIC", "REVOKE ALL ON SCHEMA %I FROM PUBLIC"])
    assert.ok(sql.includes(required), "required compiler receipt policy missing");
  assert.ok(sql.indexOf("CREATE POLICY original_bridge_auth_insert") < sql.indexOf("SET SESSION AUTHORIZATION helmut_ud_bridge_writer_"));
});
check("result rejects stale native ACKs malformed output and synthetic original metadata", () => {
  for (const mode of ["state", "usage"]) for (const mutate of [v => { v.authAck = []; }, v => { v.authAck[0].revision = generation; },
    v => { v.authAck[0].proof.originalHash = "f".repeat(64); }, v => { v.authAck[0].proof.count++; },
    v => { v.authAck[0].state.root = "9".repeat(64); }, v => { v.ownAck.nonce = "0".repeat(64); },
    v => { v.ownAck.hash = "0".repeat(64); }, v => { v.ownAck.scopeHash = "0".repeat(64); }, v => { v.extra = true; }]) {
    const r = request(mode), packet = transaction.prepare(r, qualification()), v = response(r, packet); mutate(v);
    rejects(() => transaction.acceptResult(packet, JSON.stringify(v)));
  }
  const r = request(), packet = transaction.prepare(r, qualification()); rejects(() => transaction.acceptResult(packet, "not-json"));
  rejects(() => transaction.acceptResult(packet, JSON.stringify(response(r, packet))));
  rejects(() => transaction.acceptResult({ ...packet }, "{}"));
});
check("compiled snapshot cannot be changed by caller mutation before result validation", () => {
  const r = request(), packet = transaction.prepare(r, qualification()), v = response(r, packet);
  r.commandHash = "0".repeat(64); r.originalCAS.expectedProof.head = "0".repeat(64);
  assert.ok(transaction.acceptResult(packet, Buffer.from(JSON.stringify(v))).schema === "helmut-local-unit-original-write-result/1");
});
console.log("local-unit-original-transaction offline: " + count + " checks passed; native executions=0");
