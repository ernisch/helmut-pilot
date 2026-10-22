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
  original_bridge_receipt_v1: "text, text, text, text, bigint, text, text, text, text, text" };
const helperBodies = [...proposal.matchAll(/create function helmut_unit_diagnostic\.(original_bridge_[a-z0-9_]+)\([^;]+?as \$f\$([\s\S]*?)\$f\$;/g)];
let count = 0;
function check(name, work) { work(); count++; }
function rejects(work) { let failed = false; try { work(); } catch (e) { failed = /^local-unit-original-transaction-[a-z0-9-]+$/.test(e.message); } assert.ok(failed, "expected bounded symbolic rejection"); }
function source(name, oid) { return { name, oid: String(oid), identityArguments: "jsonb", prosrcSHA256: "b".repeat(64),
  volatility: "v", returnType: "jsonb", language: "plpgsql", config: ["search_path=pg_catalog"] }; }
function qualification() {
  const helperSources = helperBodies.map((m, i) => ({ ...source("helmut_unit_diagnostic." + m[1], 2000 + i),
    identityArguments: helperArgs[m[1]], prosrcSHA256: hash(m[2]), volatility: "s", returnType: /compare_delta|receipt/.test(m[1]) ? "void" : "jsonb" }));
  return { schema: "helmut-local-unit-original-bridge-qualification/1", database: "helmut_unit_diagnostic_" + suffix,
    operationId: op, commandHash: "c".repeat(64), originalSources: originalNames.map((n, i) => source(n, 1000 + i)), helperSources,
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
function response(r, packet) {
  const nonce = /,'([a-f0-9]{64})',pg_backend_pid\(\),pg_current_xact_id\(\)\);\nDO \$root\$/.exec(packet.sql)?.[1]; assert.ok(Boolean(nonce), "closed request nonce absent");
  return { schema: "helmut-local-unit-original-write-result/1", authAck: [{ id: "main-auth", revision: r.originalCAS.revision,
    proof: { ...r.originalCAS.expectedProof, count: r.originalCAS.expectedProof.count + (r.mode === "usage" ? 1 : 0),
      head: r.mode === "usage" ? "1".repeat(64) : r.originalCAS.expectedProof.head }, state: { ...r.originalCAS.expectedState, root: r.originalCAS.root } }],
    ownAck: r.mode === "state" ? { version: "helmut-local-unit-diagnostic-state-ack/1", scopeHash: r.commandHash,
      hash: r.ownNext.hash, revision: r.ownBefore.revision + 1, claimHash: hash(r.claimId), nonce }
      : { version: "helmut-local-unit-diagnostic-artifact-ack/1", scopeHash: r.commandHash, kind: r.artifact.kind,
        logicalId: r.artifact.logicalId, hash: r.artifact.sha256, stateRevision: r.ownBefore.revision, nonce } };
}
check("pure state and usage compilation with explicit privileged origin", () => {
  for (const mode of ["state", "usage"]) { const r = request(mode), packet = transaction.prepare(r, qualification());
    assert.ok(packet.preparedOnly && packet.requiredInitialSuperuser && packet.requiredInitialRole === "postgres" && !packet.originallyUnprivileged
      && !packet.unitExecutionAuthorized && !packet.full500 && packet.seedBlocked && packet.resultTransitionBlocked);
    assert.ok(packet.sqlSHA256 === hash(packet.sql) && packet.requestSHA256 === hash(can(r)));
    assert.ok(transaction.acceptResult(packet, JSON.stringify(response(r, packet))).schema === "helmut-local-unit-original-write-result/1");
  }
});
check("helper native prosrc pins are actual exact proposal body hashes", () => {
  assert.ok(helperBodies.length === 5);
  for (const m of helperBodies) assert.ok(code.includes(hash(m[2])), "helper source pin drift");
  const q = qualification(); q.helperSources[0].prosrcSHA256 = "0".repeat(64); rejects(() => transaction.prepare(request(), q));
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
  for (const required of ["original_bridge_compare_delta_v1", "helmut_auth_usage_checked_proof_local_v1", "original-bridge-original-ack-unconfirmed",
    "original-bridge-exact-original-usage-row", "original-bridge-old-full-auth-mirror", "d IS NOT DISTINCT FROM own_row.body", "pg_my_temp_schema()",
    "p.prosecdef", "original-bridge-complete-native-source-set", "original-bridge-complete-original-trigger-set"]) assert.ok(sql.includes(required));
  assert.ok(!sql.includes("WHEN OTHERS") && !sql.includes("SECURITY DEFINER") && !sql.includes("DISABLE TRIGGER"));
});
check("structured argument quoting prevents caller SQL interpolation", () => {
  const r = request(), text = '["v",{"x":"\' ; COMMIT; SELECT pg_sleep(10); -- \\\\"}]';
  r.originalCAS.nodes = [{ hash: hash(text), payload: text }]; const sql = transaction.prepare(r, qualification()).sql;
  assert.ok(sql.includes("'' ; COMMIT; SELECT pg_sleep(10); --"));
  assert.ok((sql.match(/^COMMIT;/gm) || []).length === 1);
});
check("native read helpers remain SECINV bounded and never copy complete auth", () => {
  assert.ok((proposal.match(/create function helmut_unit_diagnostic\.original_bridge_/g) || []).length === 5);
  assert.ok((proposal.match(/language plpgsql stable security invoker set search_path=pg_catalog/g) || []).length === 5);
  assert.ok(!/security\s+definer|create\s+or\s+replace|disable\s+trigger|drop\s+trigger/i.test(proposal));
  for (const required of ["current_hash=any(seen)", "result?k", "original-bridge-mixed-leaf-required", "native_work+native_size>16777216",
    "original-bridge-outside-child-hash-changed", "original-bridge-own-key-missing-seed-blocked", "with check(false)", "pg_depend", "d.deptype='i'",
    "original-bridge-qualified-trigger-closure-incomplete"]) assert.ok(proposal.includes(required));
});
check("private receipt pins native temp identity ACLs columns roles backend and original tuple", () => {
  const m = helperBodies.find(x => x[1] === "original_bridge_receipt_v1"); assert.ok(Boolean(m)); const body = m[2];
  for (const required of ["pg_my_temp_schema()", "rel.relowner<>root_oid", "rel.relpersistence<>'t'", "acldefault('r',root_oid)",
    "original-bridge-temp-schema-acl", "attacl is not null", "original-bridge-temp-results-policy-shape", "original-bridge-temp-args-shape",
    "pg_get_expr(polwithcheck,polrelid)='(phase = ''authAck''::text)'", "pg_get_expr(polwithcheck,polrelid)='(phase = ''ownAck''::text)'",
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
