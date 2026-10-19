"use strict";
// Explicitly invoked only by the fresh, network-none native diagnostic fixture.
// Every differential CAS is rolled back inside a server subtransaction.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const lit = x => "'" + String(x).replaceAll("'", "''") + "'";
const json = x => lit(JSON.stringify(x)) + "::jsonb";
const contract = "78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f";
async function run({ sql, rpc }) {
  assert.equal(sql("SELECT current_setting('helmut.local_auth_state_cas_projection')='on' AND current_setting('helmut.local_diagnostic_scope')='bounded-cas-qualification-v1' AND to_regclass('public.mandate_profiles')IS NULL;"), "t");
  const checks = [], graphs = [];
  function graph(name, accepted, build) {
    const nodes = new Map();
    const raw = payload => { const n = { payload, hash: sha(payload) };nodes.set(n.hash, n);return n; };
    const add = x => raw(JSON.stringify(x));
    const v = x => add(["v", x]);
    const o = entries => add(["o", entries.map(([k, x]) => [k, x.hash])]);
    const m = entries => add(["m", entries.map((x, i) => [i.toString(16), x.hash])]);
    const c = () => v({ version: "5", serviceContractHash: contract });
    const root = build({ add, raw, v, o, m, c });
    graphs.push({ name, accepted, root: root.hash, nodes: [...nodes.values()] });
  }
  graph("compact-root", true, ({ v }) => v({ testKostenAuftrag: { version: "5", serviceContractHash: contract } }));
  graph("numeric-version5", true, ({ v }) => v({ testKostenAuftrag: { version: 5, serviceContractHash: contract } }));
  graph("split-root", true, ({ o, c }) => o([["testKostenAuftrag", c()]]));
  graph("split-contract", true, ({ v, o }) => o([["testKostenAuftrag", o([["version", v("5")], ["serviceContractHash", v(contract)]])]]));
  graph("nested-virtual-buckets", true, ({ v, o, m }) => m([v({}), m([o([["testKostenAuftrag", m([v({ version: "5" }), o([["serviceContractHash", v(contract)]])])]])])]));
  graph("same-valid-DAG-under-two-distinct-fields", true, ({ v, o, c }) => { const x = v({ retained: [1, 2, 3] });return o([["testKostenAuftrag", c()], ["left", x], ["right", x]]); });
  graph("literal-prototype-unicode-escaped-keys", true, ({ v, o, c }) => o([["testKostenAuftrag", c()], ["__proto__", v({ constructor: "literal" })], ['quote"slash\\😀', v("ä\n😀")]]));
  graph("empty-map-and-list-DAG", true, ({ v, add, o, m, c }) => { const x = v([]), y = add(["l", [x.hash, x.hash]]);return m([v({}), o([["testKostenAuftrag", c()], ["empty", y]])]); });
  graph("binary-distinct-keys-through-map", true, ({ v, o, m, c }) => m([o([["testKostenAuftrag", c()]]), v({ A: 1, a: 2, "ä": 3, "ä": 4, "ß": 5, ss: 6 })]));
  for (const key of ["llmUsage", "_llmUsageRef", "_authStateRef", "_authStoreRevision"])
    graph("forbidden-root-" + key, false, ({ v, o, m, c }) => m([o([["testKostenAuftrag", c()]]), v({ [key]: null })]));
  for (const value of [null, [], true, "5", 5])
    graph("nonobject-root-" + JSON.stringify(value), false, ({ v }) => v(value));
  for (const value of [null, [], "5", 5, {}, { version: "5" }, { version: "4", serviceContractHash: contract }, { version: "5", serviceContractHash: contract + "0" }])
    graph("invalid-contract-" + JSON.stringify(value), false, ({ v }) => v({ testKostenAuftrag: value }));
  graph("missing-contract", false, ({ v }) => v({ other: true }));
  graph("numeric-version5-point0", false, ({ raw }) => raw('["v",{"testKostenAuftrag":{"version":5.0,"serviceContractHash":"' + contract + '"}}]'));
  graph("duplicate-root-field-between-buckets", false, ({ v, m }) => m([v({ testKostenAuftrag: { version: "5", serviceContractHash: contract } }), v({ testKostenAuftrag: null })]));
  graph("duplicate-hidden-below-array", false, ({ v, add, o, m, c }) => o([["testKostenAuftrag", c()], ["unrelated", add(["a", [m([v({ collision: 1 }), v({ collision: 2 })]).hash]])]]));
  graph("duplicate-same-child-edge", false, ({ v, o, m, c }) => { const x = v({ collision: 1 });return o([["testKostenAuftrag", c()], ["unrelated", m([x, x])]]); });
  graph("duplicate-object-label", false, ({ v, o, c }) => o([["testKostenAuftrag", c()], ["same", v(1)], ["same", v(2)]]));
  graph("raw-leaf-duplicate", false, ({ raw }) => raw('["v",{"testKostenAuftrag":{"version":"5","version":"5","serviceContractHash":"' + contract + '"}}]'));
  graph("flatten-child-wrong-type", false, ({ v, o, m, c }) => o([["testKostenAuftrag", c()], ["unrelated", m([v([])])]]));
  graph("missing-child", false, ({ add, o, c }) => o([["testKostenAuftrag", c()], ["unrelated", add(["a", ["0".repeat(64)]])]]));
  graph("leaf-depth65", false, ({ v, o, c }) => { let x = null;for (let i = 0; i < 65; i++) x = [x];return o([["testKostenAuftrag", c()], ["unrelated", v(x)]]); });
  graph("explosive-shared-DAG", false, ({ v, add, o, c }) => { let x = add(["a", [v("x".repeat(262144)).hash]]);for (let i = 0; i < 3; i++) x = add(["l", Array(32).fill(x.hash)]);return o([["testKostenAuftrag", c()], ["unrelated", x]]); });
  const read = () => rpc("helmut_auth_state_read_v1", { id: "main-auth" });
  const a = await read();
  function witness() { return sql("SELECT jsonb_build_object('root',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'),'nodes',(SELECT count(*)FROM public.helmut_auth_state_nodes_local),'ledger',(SELECT count(*)FROM public.llm_usage),'cost',(SELECT sum(estimated_cost)FROM public.llm_usage))::text;"); }
  // The one forced exception rolls successful work back too. Catching a failure
  // returns its SQLSTATE; no failed request can silently look like success.
  const probe = `CREATE FUNCTION pg_temp.cas_projection_probe(body jsonb,enabled boolean)RETURNS jsonb
    LANGUAGE plpgsql AS $probe$DECLARE answer jsonb;BEGIN
    BEGIN
      PERFORM set_config('helmut.local_auth_state_cas_projection',CASE WHEN enabled THEN 'on' ELSE 'off' END,true);
      answer:=public.helmut_auth_state_cas_v1(body);
      IF jsonb_array_length(answer)<>1 THEN RAISE EXCEPTION 'unexpected-empty-ack';END IF;
      RAISE EXCEPTION USING ERRCODE='P0450',MESSAGE='successful-probe-rollback';
    EXCEPTION WHEN SQLSTATE 'P0450' THEN RETURN jsonb_build_object('accepted',true,'ack',answer);
      WHEN OTHERS THEN RETURN jsonb_build_object('accepted',false,'code',SQLSTATE);
    END;END;$probe$;`;
  for (const g of graphs) {
    const before = witness();
    const body = { id: "main-auth", expectedRevision: a.data._authStoreRevision, expectedProof: a.proof,
      expectedState: a.state, revision: crypto.randomUUID(), root: g.root, nodes: g.nodes, additions: [] };
    const result = JSON.parse(sql("BEGIN;SET LOCAL statement_timeout='5s';" + probe
      + "SELECT jsonb_build_object('old',pg_temp.cas_projection_probe(" + json(body) + ",false),'candidate',pg_temp.cas_projection_probe(" + json(body) + ",true));ROLLBACK;"));
    assert.equal(result.old.accepted, g.accepted, g.name + ": old oracle");
    assert.deepEqual(result.candidate, result.old, g.name + ": exact native CAS verdict/ACK");
    if (!g.accepted) assert.notEqual(result.old.code, "57014", "timeout is not a valid negative");
    assert.equal(witness(), before, g.name + ": all mutations rolled back");
    checks.push({ name: g.name, pass: true, accepted: g.accepted, exactNativeCASVerdictAndACK: true, originalStatePreserved: true });
  }
  const before = witness();
  // Even privileged fault injection must not turn a stored hash claim into proof.
  // Drop the generated expression ONLY inside this rolled-back fault transaction.
  let rejected = false;
  try {
    sql("BEGIN;ALTER TABLE public.helmut_auth_state_nodes_local DISABLE TRIGGER helmut_auth_state_nodes_immutable_local;"
      + "ALTER TABLE public.helmut_auth_state_nodes_local ALTER COLUMN node_hash DROP EXPRESSION;"
      + "UPDATE public.helmut_auth_state_nodes_local SET payload=payload||' ' WHERE store_id='main-auth' AND generation=" + lit(a.state.generation) + " AND node_hash=" + lit(a.state.root) + ";"
      + "SELECT public.helmut_auth_state_assert_graph_local_v1('main-auth'," + lit(a.state.generation) + "," + lit(a.state.root) + ");ROLLBACK;");
  } catch (e) { assert.match(String(e.stderr || e.message), /P0001/);rejected = true; }
  assert(rejected);assert.equal(witness(), before);
  checks.push({ name: "fresh-actual-stored-payload-rehash-rejects-frozen-hash-tamper", pass: true, faultInjectionRolledBack: true });
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql("SELECT NOT has_function_privilege(" + lit(role) + ",'public.helmut_auth_state_assert_graph_local_v1(text,text,text)','EXECUTE');"), "t");
  }
  checks.push({ name: "new-helper-not-public-or-customer-executable", pass: true });
  assert.deepEqual(await read(), a);
  // Exercise the actual two-connection REST writer and the unchanged root lock,
  // expected revision/state/proof and atomically appended accounting record.
  const record = { id: "local-projection-race-" + crypto.randomUUID(), createdAt: new Date().toISOString(), model: "none", estimatedCost: 0, keinAufruf: true };
  const base = { id: "main-auth", expectedRevision: a.data._authStoreRevision, expectedProof: a.proof,
    expectedState: a.state, root: a.state.root, nodes: [], additions: [record] };
  const answers = await Promise.all([rpc("helmut_auth_state_cas_v1", { ...base, revision: crypto.randomUUID() }), rpc("helmut_auth_state_cas_v1", { ...base, revision: crypto.randomUUID() })]);
  assert.deepEqual(answers.map(x => x.length).sort(), [0, 1]);
  const after = await read();
  assert.equal(after.state.root, a.state.root);assert.equal(after.proof.count, a.proof.count + 1);
  assert.deepEqual(after.data.llmUsage.filter(x => x.id !== record.id), a.data.llmUsage);
  assert.equal(after.data.llmUsage.filter(x => x.id === record.id).length, 1);
  assert.equal(sql("SELECT count(*)FROM public.llm_usage WHERE id=" + lit(record.id) + ";"), "1");
  const oldRest = { ...a.data }, newRest = { ...after.data };
  delete oldRest._authStoreRevision;delete newRest._authStoreRevision;delete oldRest.llmUsage;delete newRest.llmUsage;
  assert.deepEqual(newRest, oldRest);
  const stale = await rpc("helmut_auth_state_cas_v1", { ...base, revision: crypto.randomUUID() });assert.deepEqual(stale, []);
  assert.deepEqual(await read(), after);
  checks.push({ name: "two-actual-concurrent-CAS-exactly-one-ACK-and-one-ledger-entry-stale-replay-empty", pass: true, originalHistoryAndAllLogicalDataPreserved: true, zeroCostRecordOnly: true });
  return checks;
}
module.exports = { run };
