"use strict";
// Import is inert. Only an explicitly admitted, fresh local diagnostic harness
// may call run(). No process/container/DB startup, network client or authority.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const sha = x => crypto.createHash("sha256").update(x, "utf8").digest("hex");
const lit = x => "'" + String(x).replaceAll("'", "''") + "'";
const node = value => { const payload = JSON.stringify(value); return { payload, hash: sha(payload) }; };
const json = x => lit(JSON.stringify(x)) + "::jsonb";
async function run({ sql, rpc, storage, State, U, wire, copy, omitRevision }) {
  for (const f of [sql, rpc, storage?.readAuthStore, State?.build, copy, omitRevision]) assert.equal(typeof f, "function");
  assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE, "merkle-auth-v1");
  assert.equal(sql("SELECT current_user='postgres' AND current_setting('helmut.local_usage_experiment',true)='on' AND to_regclass('public.mandate_profiles')IS NULL;"), "t");
  const checks = [];
  async function check(name, fn) {
    const begin = performance.now();let evidence;
    try { evidence = await fn(); } catch (e) { e.nativeCase = name;e.message = name + ": " + e.name;throw e; }
    checks.push({ name, pass: true, wallMS: performance.now() - begin, ...(evidence || {}) });
  }
  function witness() {
    return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object("
      + "'root',(SELECT jsonb_build_object('hash',encode(sha256(convert_to(data::text,'UTF8')),'hex'),'xmin',xmin::text,'ctid',ctid::text)FROM public.helmut_store WHERE id='main-auth'),"
      + "'nodes',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(node_hash||':'||node_seq::text||':'||xmin::text||':'||ctid::text||':'||encode(sha256(convert_to(payload,'UTF8')),'hex'),'|'ORDER BY generation,node_hash),''),'UTF8')),'hex'))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'),"
      + "'usage',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(id||':'||usage_generation||':'||usage_ordinal::text||':'||usage_record_hash||':'||usage_chain_hash,'|'ORDER BY usage_generation,usage_ordinal),''),'UTF8')),'hex'),'cost',coalesce(sum(estimated_cost),0))FROM public.llm_usage WHERE usage_store_id='main-auth'));ROLLBACK;"));
  }
  async function rejected(fn) { const before = witness();await assert.rejects(fn);assert.deepEqual(witness(), before); }
  function txRejected(statement, expectedState = null) {
    const before = witness();let error;
    try { sql("BEGIN;SET LOCAL statement_timeout='5s';" + statement + ";ROLLBACK;"); } catch (e) { error = e; }
    assert(error, "Native negative must reject, not merely roll back successfully");
    if (expectedState) assert.match(String(error.stderr || error.message), new RegExp(expectedState));
    assert.deepEqual(witness(), before);
  }
  const read = () => rpc("helmut_auth_state_read_v1", { id: "main-auth" });
  function cas(a, { root = a.state.root, nodes = [], additions = [] } = {}) {
    return { id: "main-auth", expectedRevision: a.data._authStoreRevision, expectedProof: a.proof,
      expectedState: a.state, revision: crypto.randomUUID(), root, nodes, additions };
  }
  function insertFragment(generation, nodes, id = "main-auth") {
    return "DO $native$BEGIN PERFORM set_config('helmut.atomic_state_seal',"
      + lit(JSON.stringify({ id, gen: generation, action: "write" })) + ",true);PERFORM public.helmut_auth_state_put_nodes_local_v1("
      + lit(id) + "," + lit(generation) + "," + json(nodes) + ");END;$native$;";
  }
  async function badGraph(nodes, root, prefix = "") {
    const a = await read(), graft = node(["m", [["0", a.state.root], ["1", root]]]);
    txRejected(prefix + "SELECT public.helmut_auth_state_cas_v1(" + json(cas(a, { root: graft.hash, nodes: [...nodes, graft] })) + ");", "P0001");
  }
  await check("native-generated-payload-hash-and-always-immutable-guards", async () => {
    assert.equal(sql("SELECT bool_and(node_hash=encode(sha256(convert_to(payload,'UTF8')),'hex'))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth';"), "t");
    const a = await read(), g = a.state.generation, root = a.state.root, v = node(["v", "direct-unsealed"]);
    txRejected("INSERT INTO public.helmut_auth_state_nodes_local(store_id,generation,payload,node_hash)VALUES('main-auth'," + lit(g) + "," + lit(v.payload) + "," + lit(v.hash) + ")", "428C9");
    const target = "WHERE store_id='main-auth'AND generation=" + lit(g) + "AND node_hash=" + lit(root);
    for (const statement of [
      "INSERT INTO public.helmut_auth_state_nodes_local(store_id,generation,payload)VALUES('main-auth'," + lit(g) + "," + lit(v.payload) + ")",
      "UPDATE public.helmut_auth_state_nodes_local SET payload=payload " + target,
      "DELETE FROM public.helmut_auth_state_nodes_local " + target,
      "TRUNCATE public.helmut_auth_state_nodes_local",
      "UPDATE public.helmut_store SET data=data WHERE id='main-auth'",
      "DELETE FROM public.helmut_store WHERE id='main-auth'", "TRUNCATE public.helmut_store",
      "SET LOCAL session_replication_role='replica';DELETE FROM public.helmut_auth_state_nodes_local " + target,
      "SET LOCAL session_replication_role='replica';UPDATE public.helmut_store SET data=data WHERE id='main-auth'"
    ]) txRejected(statement, "P0001");
    return { generatedOverrideRejected: true, directDMLAndReplicaCases: 9, allWitnessesUnchanged: true };
  });
  await check("native-role-privileges-and-actual-RLS-foreign-node-scope", async () => {
    for (const role of ["anon", "authenticated"]) {
      txRejected("SET LOCAL ROLE " + role + ";SELECT count(*)FROM public.helmut_auth_state_nodes_local");
      txRejected("SET LOCAL ROLE " + role + ";SELECT public.helmut_auth_state_children_local_v1('[\"v\",null]')");
    }
    const before = witness(), g = crypto.randomUUID(), n = node(["v", "foreign-diagnostic-" + crypto.randomUUID()]);
    const result = sql("BEGIN;SET LOCAL statement_timeout='5s';" + insertFragment(g, [n], "other-native-fixture")
      + "SET LOCAL ROLE bench_writer;SELECT NOT EXISTS(SELECT FROM public.helmut_auth_state_nodes_local WHERE store_id='other-native-fixture');ROLLBACK;");
    assert.equal(result, "t");assert.deepEqual(witness(), before);
    return { deniedRoleReadAndHelperCases: 4, realForeignRowHiddenByRLS: true, rollbackOnly: true };
  });
  await check("native-missing-cross-generation-and-malformed-root-fail-closed", async () => {
    const a = await read(), absent = sha("absent-native-" + crypto.randomUUID());
    await rejected(() => rpc("helmut_auth_state_cas_v1", cas(a, { root: absent })));
    const missing = node(["o", [["localSecurityMissing", absent]]]);await badGraph([missing], missing.hash);
    const foreign = node(["v", "foreign-generation-" + crypto.randomUUID()]), g = crypto.randomUUID();
    const ref = node(["o", [["localSecurityForeign", foreign.hash]]]);
    await badGraph([ref], ref.hash, insertFragment(g, [foreign]));
    txRejected("SELECT public.helmut_auth_state_assert_root_local_v1(data||'{\"unexpected\":true}'::jsonb)FROM public.helmut_store WHERE id='main-auth'");
    const banned = node(["v", []]), field = node(["o", [["llmUsage", banned.hash]]]);await badGraph([banned, field], field.hash);
    return { absentRoot: true, absentChild: true, wrongGenerationChild: true, physicalExtraField: true, forbiddenLogicalControl: true };
  });
  await check("native-CAS-required-shape-and-incoming-count-reject-before-write", async () => {
    const a = await read(), valid = cas(a), missing = copy(valid), nullField = copy(valid), extra = copy(valid);
    delete missing.root;nullField.expectedState = null;extra.unexpectedNativeArgument = true;
    for (const body of [missing, nullField, extra]) await rejected(() => rpc("helmut_auth_state_cas_v1", body));
    const repeated = node(["v", null]), overCount = cas(a, { nodes: Array(20001).fill(repeated) });
    txRejected("SELECT public.helmut_auth_state_cas_v1(" + json(overCount) + ")", "P0001");
    return { requiredFieldMissingRejected: true, nullBindingRejected: true, extraFieldRejected: true,
      incomingNodes: 20001, uniqueIncomingNodes: 1, nativeIncomingCountGuardRejected: true,
      incomingPayloadSumOver32MiB: "source-bound review only; no oversized probe" };
  });
  await check("native-rollback-only-payload-replacement-or-removal-breaks-read", async () => {
    const a = await read(), target = "WHERE store_id='main-auth'AND generation=" + lit(a.state.generation) + "AND node_hash=" + lit(a.state.root);
    for (const statement of ["DELETE FROM public.helmut_auth_state_nodes_local " + target,
      "UPDATE public.helmut_auth_state_nodes_local SET payload=payload||' ' " + target])
      txRejected("ALTER TABLE public.helmut_auth_state_nodes_local DISABLE TRIGGER helmut_auth_state_nodes_immutable_local;" + statement
        + ";SELECT public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}'::jsonb)");
    return { faultInjectionRolledBack: true, actualNativeReadRejectedBoth: true };
  });
  await check("native-duplicate-keys-child-types-and-depth65-rejected", async () => {
    const x = node(["v", { sharedKey: 1 }]), y = node(["v", { sharedKey: 2 }]);
    const duplicate = node(["m", [["0", x.hash], ["1", y.hash]]]);await badGraph([x, y, duplicate], duplicate.hash);
    const duplicateObject = node(["o", [["same", x.hash], ["same", y.hash]]]);await badGraph([x, y, duplicateObject], duplicateObject.hash);
    const array = node(["v", [1]]), list = node(["l", [x.hash]]), map = node(["m", [["0", array.hash]]]);
    await badGraph([x, list], list.hash);await badGraph([array, map], map.hash);
    let value = null;for (let i = 0; i < 65; i++) value = [value];
    const deep = node(["v", value]), deepRoot = node(["o", [["localSecurityDepth", deep.hash]]]);await badGraph([deep, deepRoot], deepRoot.hash);
    const chain = [node(["v", []])];for (let i = 0; i < 64; i++) chain.push(node(["l", [chain.at(-1).hash]]));
    await badGraph(chain, chain.at(-1).hash);
    return { crossMapDuplicate: true, objectDuplicate: true, childTypeCases: 2, compactLeafDepth65: true, graphDepth65: true };
  });
  await check("native-shared-empty-DAG-is-bounded-without-expanded-path-traversal", async () => {
    const before = witness(), g = crypto.randomUUID(), nodes = [node(["v", []])];
    for (let i = 0; i < 18; i++) nodes.push(node(["l", Array(32).fill(nodes.at(-1).hash)]));
    const start = performance.now();let outcome, nativeSqlState = null;
    try {
      const result = sql("BEGIN;SET LOCAL statement_timeout='5s';" + insertFragment(g, nodes)
        + "SELECT public.helmut_auth_state_expand_local_v1('main-auth'," + lit(g) + "," + lit(nodes.at(-1).hash) + ")='[]'::jsonb;ROLLBACK;");
      assert.equal(result, "t");outcome = "ACCEPTED_EXACT_EMPTY_ARRAY";
    } catch (e) {
      // The native allocation budget deliberately overcounts shared container
      // overhead. Its safe rejection is allowed; timeouts are never accepted.
      assert.match(String(e.stderr || e.message), /P0001/);
      outcome = "SAFE_REJECTED_CONSERVATIVE_NATIVE_BUDGET";nativeSqlState = "P0001";
    }
    assert.deepEqual(witness(), before);
    return { uniqueNodes: nodes.length, depth: 18, fanout: 32, outcome, nativeSqlState,
      exactExpandedValue: outcome === "ACCEPTED_EXACT_EMPTY_ARRAY" ? "empty-array" : null,
      nativeWallMS: performance.now() - start, statementTimeoutMS: 5000, allWitnessesUnchanged: true };
  });
  await check("native-explosive-shared-DAG-and-single-payload-bound-reject", async () => {
    const scalar = node(["v", "x".repeat(256 * 1024)]), seed = node(["a", [scalar.hash]]), nodes = [scalar, seed];
    // The second fanout already exceeds 256 MiB; prior output is only ~8 MiB.
    for (let i = 0; i < 3; i++) nodes.push(node(["l", Array(32).fill(nodes.at(-1).hash)]));
    await badGraph(nodes, nodes.at(-1).hash);
    const over = node(["v", "x".repeat(4194304)]);await badGraph([over], over.hash);
    return { explosiveUniqueNodes: nodes.length, fanout: 32, quarterMiBScalarSeedAvoidsHugeIntermediate: true, overflowRejectedBeforeUnboundedConcatenation: true, rejectedPayloadBytes: Buffer.byteLength(over.payload) };
  });
  await check("native-staged-nodes-and-new-usage-all-rollback-on-late-root-failure", async () => {
    const a = await read(), value = copy(a.data);value.localNativeQualificationLateFailure = crypto.randomUUID();
    const old = State.build(a.data), built = State.build(value), freshNodes = built.nodes.filter(n => !old.hashes.has(n.hash));assert(freshNodes.length > 0);
    const record = { id: "local-native-late-failure-" + crypto.randomUUID(), createdAt: new Date().toISOString(), model: "none", estimatedCost: 0, keinAufruf: true };
    const body = cas(a, { root: built.root, nodes: freshNodes, additions: [record] });
    const trigger = "CREATE TEMP TABLE local_native_fault_context(id integer)ON COMMIT DROP;CREATE FUNCTION pg_temp.local_native_root_failure()RETURNS trigger LANGUAGE plpgsql AS $fault$BEGIN "
      + "IF NOT EXISTS(SELECT FROM public.llm_usage WHERE id=" + lit(record.id) + ") OR NOT EXISTS(SELECT FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'AND generation="
      + lit(a.state.generation) + "AND node_hash=" + lit(freshNodes.at(-1).hash) + ")THEN RAISE EXCEPTION USING ERRCODE='P0202',MESSAGE='native-staging-not-observed';END IF;"
      + "RAISE EXCEPTION USING ERRCODE='P0201',MESSAGE='native-observed-staging-root-failure';END;$fault$;"
      + "CREATE TRIGGER zz_local_native_root_failure BEFORE UPDATE ON public.helmut_store FOR EACH ROW EXECUTE FUNCTION pg_temp.local_native_root_failure();";
    txRejected(trigger + "SELECT public.helmut_auth_state_cas_v1(" + json(body) + ")", "P0201");
    return { newNodesSeenByFaultTrigger: true, newUsageSeenByFaultTrigger: true, physicalRootNodesAndUsageUnchangedAfterRollback: true };
  });
  await check("native-arbitrary-nested-roundtrip-and-unchanged-node-row-identities", async () => {
    const before = await storage.readAuthStore(), native = await read(), oldTree = State.build(before);
    const identities = () => JSON.parse(sql("SELECT jsonb_object_agg(node_hash,jsonb_build_object('xmin',xmin::text,'ctid',ctid::text,'seq',node_seq))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'AND generation=" + lit(native.state.generation) + ";"));
    const oldRows = identities(), original = omitRevision(before);
    const special = JSON.parse('{"__proto__":{"constructor":"literal"},"constructor":{"prototype":true},"nil":null,"emptyObject":{},"emptyArray":[],"zero":0,"negative":-2,"decimal":1.25,"unicode":"ä Ελληνικά 😀","ordered":[3,2,1]}');
    await storage.mutateAuthStore(auth => { auth.localNativeQualification = special; });
    const mid = await storage.readAuthStore();assert.deepEqual(mid.localNativeQualification, special);
    await storage.mutateAuthStore(auth => { auth.localNativeQualification.nil = { nested: [null, {}, [], false, 1.25] };delete auth.localNativeQualification.negative; });
    const after = await storage.readAuthStore(), expected = copy(original);expected.localNativeQualification = copy(special);
    expected.localNativeQualification.nil = { nested: [null, {}, [], false, 1.25] };delete expected.localNativeQualification.negative;
    assert.deepEqual(omitRevision(after), expected);const afterTree = State.build(after), newRows = identities();
    let unchanged = 0;for (const hash of oldTree.hashes) if (afterTree.hashes.has(hash)) { assert.deepEqual(newRows[hash], oldRows[hash]);unchanged++; }
    assert(unchanged > 0);assert.equal(State.build((await read()).data).root, afterTree.root);
    assert.equal(sql("SELECT (SELECT count(*)FROM jsonb_object_keys(data))=3 FROM public.helmut_store WHERE id='main-auth';").replace(/^$/, ""), "t");
    return { exactAllLogicalFieldsEqual: true, literalPrototypeKeysPreserved: true, unchangedReachableRows: unchanged, metadataAndNestedCASCount: 2 };
  });
  await check("native-noncanonical-privileged-input-fails-JS-closed-and-is-recoverable", async () => {
    const a = await read(), expected = omitRevision(a.data), built = State.build(a.data);
    const rootNode = built.nodes.find(n => n.hash === built.root), rawPayload = rootNode.payload + " ";
    const rawNode = { payload: rawPayload, hash: sha(rawPayload) }, before = witness();let rows;
    try { rows = await rpc("helmut_auth_state_cas_v1", cas(a, { root: rawNode.hash, nodes: [rawNode] })); }
    catch (e) { assert(e.statusCode >= 400);assert.deepEqual(witness(), before);return { nativeRejectedAlternativeLayout: true }; }
    assert.equal(rows.length, 1);assert.equal(rows[0].state.root, rawNode.hash);
    await assert.rejects(storage.readAuthStore(), { code: "AUTH_STATE_CONTENT_MISMATCH" });
    const native = await read();assert.deepEqual(omitRevision(native.data), expected);
    await rpc("helmut_auth_state_restore_v1", { id: "main-auth", expectedRevision: native.data._authStoreRevision, expectedState: native.state });
    let rebootstrap;
    try {
      delete process.env.HELMUT_AUTH_STATE_STORAGE;
      const usage = await storage.readAuthStore();assert.deepEqual(omitRevision(usage), expected);
      assert.notEqual(usage._authStoreRevision, native.data._authStoreRevision);
      const tree = State.build(usage), physicalHash = sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");
      rebootstrap = await rpc("helmut_auth_state_bootstrap_v1", { id: "main-auth", expectedHash: physicalHash, root: tree.root, nodes: tree.nodes });
    } finally { process.env.HELMUT_AUTH_STATE_STORAGE = State.VERSION; }
    const after = await storage.readAuthStore();assert.deepEqual(omitRevision(after), expected);assert.equal(State.build(after).root, rebootstrap.state.root);
    return { privilegedNativeAlternativeLayoutCommittedExactData: true, jsRejectedBeforeContentUse: true,
      nativeRestoreExactUsageOnlyContent: true, explicitRebootstrapValidState: true, automaticFallback: false };
  });

  // Source-change qualification: output vectors add only the acceptance areas
  // missing from the preceding native cases. Existing budgets are exercised by
  // the original shared-DAG/type/depth cases above, without oversized probes.
  function smallTokenGraph(build) {
    const records = new Map();
    const add = payload => { const n = node(payload);if (!records.has(n.hash)) records.set(n.hash, n);return n; };
    const result = build(add);return { ...result, nodes: [...records.values()] };
  }
  function assertTokenGraph(graph) {
    const before = witness(), generation = crypto.randomUUID();
    const result = JSON.parse(sql("BEGIN;SET LOCAL statement_timeout='5s';" + insertFragment(generation, graph.nodes)
      + "SELECT jsonb_build_object('value',x.v,'nativeEqual',x.v=" + json(graph.expected) + ")FROM(SELECT public.helmut_auth_state_expand_local_v1('main-auth',"
      + lit(generation) + "," + lit(graph.root.hash) + ")AS v OFFSET 0)x;ROLLBACK;"));
    assert.equal(result.nativeEqual, true);assert.deepEqual(result.value, graph.expected);assert.deepEqual(witness(), before);
    return { uniqueNodes: graph.nodes.length, exactIndependentLiteral: true, rollbackOnly: true };
  }
  await check("token-shared-mixed-DAG-full-versus-flatten-order", async () => {
    const graph = smallTokenGraph(add => {
      const object = add(["v", { alias: { retained: true }, value: 7 }]);
      const array = add(["v", [1, { marker: "shared" }, null, false, 0, ""]]), scalar = add(["v", "scalar"]);
      const aliases = add(["o", [["left", object.hash], ["right", object.hash], ["scalar", scalar.hash]]]);
      const full = add(["a", [array.hash, array.hash, object.hash, scalar.hash]]), flat = add(["l", [array.hash, array.hash]]);
      const nested = add(["o", [["nested", aliases.hash]]]), extra = add(["v", { nativeTokenMap: true }]);
      const map = add(["m", [["0", nested.hash], ["1", extra.hash]]]);
      const root = add(["o", [["fullArray", full.hash], ["flatArray", flat.hash], ["mixedObject", map.hash]]]);
      return { root, expected: {
        fullArray: [[1, { marker: "shared" }, null, false, 0, ""], [1, { marker: "shared" }, null, false, 0, ""], { alias: { retained: true }, value: 7 }, "scalar"],
        flatArray: [1, { marker: "shared" }, null, false, 0, "", 1, { marker: "shared" }, null, false, 0, ""],
        mixedObject: { nested: { left: { alias: { retained: true }, value: 7 }, right: { alias: { retained: true }, value: 7 }, scalar: "scalar" }, nativeTokenMap: true }
      } };
    });
    return { ...assertTokenGraph(graph), sharedObjectFullOccurrences: 3, sharedArrayFullOccurrences: 2, sharedArrayFlattenOccurrences: 2,
      allNodeTags: ["v", "o", "m", "a", "l"], orderAndMultiplicityPreserved: true, falsyScalarsPreserved: true };
  });
  await check("token-empty-first-middle-last-separators", async () => {
    const graph = smallTokenGraph(add => {
      const emptyArray = add(["v", []]), emptyObject = add(["v", {}]), one = add(["v", [1]]), two = add(["v", [2]]);
      const retained = add(["v", { kept: [false, 0, null, ""] }]);
      const emptyA = add(["a", []]), emptyO = add(["o", []]), emptyL = add(["l", []]), emptyM = add(["m", []]);
      const list = add(["l", [emptyArray.hash, one.hash, emptyArray.hash, two.hash, emptyArray.hash]]);
      const map = add(["m", [["0", emptyObject.hash], ["1", retained.hash], ["2", emptyObject.hash]]]);
      const allList = add(["l", [emptyArray.hash, emptyA.hash, emptyL.hash]]);
      const allMap = add(["m", [["0", emptyObject.hash], ["1", emptyO.hash], ["2", emptyM.hash]]]);
      const nestedEmpty = add(["a", [emptyArray.hash, emptyArray.hash]]);
      const root = add(["o", [["concatenated", list.hash], ["merged", map.hash], ["allEmptyList", allList.hash], ["allEmptyMap", allMap.hash],
        ["emptyA", emptyA.hash], ["emptyO", emptyO.hash], ["emptyL", emptyL.hash], ["emptyM", emptyM.hash], ["twoEmptyItems", nestedEmpty.hash]]]);
      return { root, expected: { concatenated: [1, 2], merged: { kept: [false, 0, null, ""] }, allEmptyList: [], allEmptyMap: {},
        emptyA: [], emptyO: {}, emptyL: [], emptyM: {}, twoEmptyItems: [[], []] } };
    });
    return { ...assertTokenGraph(graph), emptyChunksAtFirstMiddleLast: true, allEmptyContainers: true, fullArrayKeepsTwoEmptyItems: true };
  });
  await check("token-escape-and-nested-duplicate-uniqueness", async () => {
    // Object.fromEntries creates a literal own __proto__ property safely.
    const entries = [["quote\"back\\slash\n\t{}[],:", "value\"\\\n\t{}[],:"], ["unicode😀ä", "Ελληνικά 😀"], ["", ""],
      ["0", "zero-key"], ["01", "leading-zero-key"], ["42", "numeric-key"], ["__proto__", "literal-own-key"],
      ["constructor", "literal-constructor"], ["delimiters{}[],:", "}{][,::null,false,0,\"\""]];
    const literal = Object.fromEntries(entries);assert(Object.hasOwn(literal, "__proto__"));
    const graph = smallTokenGraph(add => {
      const packed = add(["v", literal]), explicit = add(["o", entries.map(([key, value]) => [key, add(["v", value]).hash])]);
      const wrapped = add(["a", [packed.hash, explicit.hash]]), root = add(["o", [["packed", packed.hash], ["explicit", explicit.hash], ["wrapped", wrapped.hash]]]);
      return { root, expected: { packed: copy(literal), explicit: copy(literal), wrapped: [copy(literal), copy(literal)] } };
    });
    const positive = assertTokenGraph(graph);
    const duplicateRawPayload = '["v",{"same":1,"\\u0073ame":2}]';assert(duplicateRawPayload.includes('\\u0073ame'));
    const duplicateRaw = { payload: duplicateRawPayload, hash: sha(duplicateRawPayload) };
    const duplicateRoot = node(["o", [["localTokenDuplicateRaw", duplicateRaw.hash]]]);
    await badGraph([duplicateRaw, duplicateRoot], duplicateRoot.hash);
    const plain = node(["v", { same: 1 }]), escapedPayload = '["v",{"\\u0073ame":2}]';assert(escapedPayload.includes('\\u0073ame'));
    const escaped = { payload: escapedPayload, hash: sha(escapedPayload) };
    const duplicateMap = node(["m", [["0", plain.hash], ["1", escaped.hash]]]);
    const nested = node(["o", [["localTokenNestedDuplicate", duplicateMap.hash]]]);
    await badGraph([plain, escaped, duplicateMap, nested], nested.hash);
    return { ...positive, delimiterAndUnicodeKeysAndStringsExact: true, literalOwnPrototypeKeys: true,
      duplicateEscapedRawKeyRejected: true, nestedMergeEscapedDuplicateRejected: true, negativeSQLState: "P0001", allNegativeWitnessesUnchanged: true };
  });
  await check("token-top-level-controls-and-nested-literal-contract", async () => {
    const controls = ["llmUsage", "_llmUsageRef", "_authStateRef", "_authStoreRevision"];
    for (const control of controls) {
      const value = control === "llmUsage" ? [] : "literal-forbidden-control";
      const packed = node(["v", { [control]: value }]);await badGraph([packed], packed.hash);
      const scalar = node(["v", value]), explicit = node(["o", [[control, scalar.hash]]]), empty = node(["v", {}]);
      const flattened = node(["m", [["0", empty.hash], ["1", explicit.hash]]]);
      await badGraph([scalar, explicit, empty, flattened], flattened.hash);
    }
    const before = await storage.readAuthStore(), expected = omitRevision(before);
    assert.equal(Object.hasOwn(before, "localTokenNestedLiteralControls"), false);
    const nested = { nested: { llmUsage: [], _llmUsageRef: "literal", _authStateRef: "literal", _authStoreRevision: "literal" } };
    expected.localTokenNestedLiteralControls = copy(nested);
    await storage.mutateAuthStore(auth => { auth.localTokenNestedLiteralControls = copy(nested); });
    const after = await storage.readAuthStore();assert.deepEqual(omitRevision(after), expected);
    const actual = await read();assert.equal(State.build(after).root, actual.state.root);
    return { forbiddenTopLevelControls: controls, packedAndFlattenedRejectCases: 8, negativeSQLState: "P0001",
      allNegativeWitnessesUnchanged: true, nestedLiteralControlsPreserved: true, allOtherLogicalFieldsAndOriginalUsageEqual: true,
      existingLateRootFailureGroupStillRequired: true, actualNestedDiagnosticCASCount: 1 };
  });
  return checks;
}

// Target only the newly generated immutable leaf metadata and packed bounds.
// The previously accepted storage/concurrency/native groups are not repeated.
async function runLeafInfo({sql,rpc}){
  assert.equal(typeof sql,"function");assert.equal(typeof rpc,"function");
  assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE,"merkle-auth-v1");
  const checks=[];
  function witness(){return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object('root',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'),'nodes',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(node_hash||':'||xmin::text||':'||ctid::text||':'||coalesce(leaf_info::text,'null'),'|'ORDER BY generation,node_hash),''),'UTF8')),'hex'))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'),'usage',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(id||':'||usage_record_hash||':'||usage_chain_hash,'|'ORDER BY usage_generation,usage_ordinal),''),'UTF8')),'hex'),'cost',coalesce(sum(estimated_cost),0))FROM public.llm_usage WHERE usage_store_id='main-auth'));ROLLBACK;"));}
  async function check(name,fn){const tick=performance.now();try{const result=await fn();checks.push({name,pass:true,wallMS:performance.now()-tick,...result});}catch(e){e.nativeCase=name;e.message=name+": "+e.name;throw e;}}
  function txReject(statement,code){const before=witness();let error;try{sql("BEGIN;SET LOCAL statement_timeout='5s';"+statement+";ROLLBACK;");}catch(e){error=e;}assert(error);assert.match(String(error.stderr||error.message),new RegExp(code));assert.deepEqual(witness(),before);}
  const native=await rpc("helmut_auth_state_read_v1",{id:"main-auth"}),generation=native.state.generation;
  const seal="SELECT set_config('helmut.atomic_state_seal',"+lit(JSON.stringify({id:"main-auth",gen:generation,action:"write"}))+",true);";
  const put=n=>"SELECT public.helmut_auth_state_put_nodes_local_v1('main-auth',"+lit(generation)+","+json([n])+")";
  await check("native-leaf-info-is-independent-actual-payload-depth-text-native-size",async()=>{
    // This walk is written independently of the generated helper: literal
    // payload is reparsed and every JSON edge is visited by a lateral walk.
    const result=JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object('leafCount',count(*),'allEqual',bool_and(n.leaf_info=jsonb_build_object('depth',v.depth,'textBytes',octet_length((n.payload::jsonb->1)::text),'nativeBytes',pg_column_size(n.payload::jsonb->1))))FROM public.helmut_auth_state_nodes_local n CROSS JOIN LATERAL(WITH RECURSIVE edges(value,edge_depth)AS(SELECT n.payload::jsonb->1,0 UNION ALL SELECT c.value,e.edge_depth+1 FROM edges e CROSS JOIN LATERAL(SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(e.value)='object'THEN e.value ELSE '{}'::jsonb END)UNION ALL SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.value)='array'THEN e.value ELSE '[]'::jsonb END))c)SELECT max(edge_depth+CASE WHEN jsonb_typeof(value)IN('object','array')THEN 1 ELSE 0 END)AS depth FROM edges)v WHERE n.store_id='main-auth'AND n.generation="+lit(generation)+"AND n.payload::jsonb->>0='v';ROLLBACK;"));
    assert(result.leafCount>0);assert.equal(result.allEqual,true);
    assert.equal(sql("SELECT count(*)FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'AND generation="+lit(generation)+"AND payload::jsonb->>0<>'v'AND leaf_info IS NOT NULL;"),"0");
    return{actualLeafRows:result.leafCount,independentDepthWalk:true,actualPayloadTextBytes:true,actualNativeFlatBytes:true,nonLeafMetadataNull:true};
  });
  await check("native-leaf-info-generated-override-and-unrelated-roles-reject",async()=>{
    const n=node(["v","local-leaf-generated-override"]);
    txReject(seal+"INSERT INTO public.helmut_auth_state_nodes_local(store_id,generation,payload,leaf_info)VALUES('main-auth',"+lit(generation)+","+lit(n.payload)+",'{}'::jsonb)","428C9");
    for(const role of ["anon","authenticated"])txReject("SET LOCAL ROLE "+role+";SELECT public.helmut_auth_state_leaf_info_local_v1('[\"v\",null]')","42501");
    return{generatedOverrideSQLState:"428C9",unrelatedRoleHelperSQLState:"42501",allWitnessesUnchanged:true};
  });
  await check("native-packed-leaf20513-visits-and-depth65-reject-at-insert",async()=>{
    const value=Array.from({length:32},()=>Array(640).fill(0)),n=node(["v",value]);
    assert(Buffer.byteLength(n.payload)<65536);txReject(seal+put(n),"P0001");
    let deep=null;for(let i=0;i<65;i++)deep=[deep];txReject(seal+put(node(["v",deep])),"P0001");
    return{rawArrayItems:32,zeroItemsPerArray:640,constructedVisits:1+32+32*640,rawPayloadBytes:Buffer.byteLength(n.payload),visitsRejectedAtInsert:true,depth65RejectedAtInsert:true,allWitnessesUnchanged:true};
  });
  await check("native-object16KiB-array64KiB-boundaries-and-overflows",async()=>{
    const rows=[];
    for(const[kind,limit]of [["object",16384],["array",65536]]){
      const make=n=>kind==="object"?{localLeafBoundary:"b".repeat(n)}:["b".repeat(n),...Array(31).fill("")];
      const overhead=Buffer.byteLength(node(["v",make(0)]).payload),n=node(["v",make(limit-overhead)]);
      assert.equal(Buffer.byteLength(n.payload),limit);const before=witness();
      const result=JSON.parse(sql("BEGIN;SET LOCAL statement_timeout='5s';"+seal+put(n)+";SELECT jsonb_build_object('payloadBytes',octet_length(payload),'actualGenerated',leaf_info IS NOT NULL,'hashExact',node_hash=encode(sha256(convert_to(payload,'UTF8')),'hex'))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'AND generation="+lit(generation)+"AND node_hash="+lit(n.hash)+";ROLLBACK;").split("\n").filter(x=>x.startsWith('{')).at(-1));
      assert.equal(result.payloadBytes,limit);assert.equal(result.actualGenerated,true);assert.equal(result.hashExact,true);assert.deepEqual(witness(),before);
      const over=node(["v",make(limit-overhead+1)]);assert.equal(Buffer.byteLength(over.payload),limit+1);txReject(seal+put(over),"P0001");rows.push({kind,acceptedBytes:limit,rejectedBytes:limit+1,allWitnessesUnchanged:true});
    }
    return{bounds:rows,rollbackOnly:true};
  });
  return checks;
}


// Graph-reader integration only: the accepted native/fullreader groups above
// remain separate and are not rerun by this adapter. Inert until explicit run.
async function runGraph({ sql, rpc, storage, State, U, copy, omitRevision }) {
  for (const fn of [sql, rpc, storage?.readAuthStore, State?.decode, State?.build, U?.read, copy, omitRevision])
    assert.equal(typeof fn, "function");
  assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE, State.VERSION);
  assert.equal(sql("SELECT current_user='postgres'AND current_setting('helmut.local_usage_experiment',true)='on'AND to_regclass('public.mandate_profiles')IS NULL;"), "t");
  const checks = [];
  async function check(name, fn) {
    const start = performance.now();try { const evidence = await fn();checks.push({ name, pass: true, wallMS: performance.now() - start, ...evidence }); }
    catch (e) { e.nativeCase = name;e.message = name + ": " + e.name;throw e; }
  }
  function witness() {
    return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object("
      + "'root',(SELECT jsonb_build_object('hash',encode(sha256(convert_to(data::text,'UTF8')),'hex'),'xmin',xmin::text,'ctid',ctid::text)FROM public.helmut_store WHERE id='main-auth'),"
      + "'nodes',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(node_hash||':'||node_seq::text||':'||xmin::text||':'||ctid::text||':'||encode(sha256(convert_to(payload,'UTF8')),'hex'),'|'ORDER BY generation,node_hash),''),'UTF8')),'hex'))FROM public.helmut_auth_state_nodes_local WHERE store_id='main-auth'),"
      + "'usage',(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(id||':'||usage_generation||':'||usage_ordinal::text||':'||usage_record_hash||':'||usage_chain_hash,'|'ORDER BY usage_generation,usage_ordinal),''),'UTF8')),'hex'),'cost',coalesce(sum(estimated_cost),0))FROM public.llm_usage WHERE usage_store_id='main-auth'));ROLLBACK;"));
  }
  const fullRead = () => rpc("helmut_auth_state_read_v1", { id: "main-auth" });
  const graphRead = () => rpc("helmut_auth_state_graph_read_v1", { id: "main-auth" });
  function cas(a, root, nodes) {
    return { id: "main-auth", expectedRevision: a.data._authStoreRevision, expectedProof: a.proof,
      expectedState: a.state, revision: crypto.randomUUID(), root, nodes, additions: [] };
  }
  function insertFragment(generation, nodes) {
    return "DO $graph$BEGIN PERFORM set_config('helmut.atomic_state_seal',"
      + lit(JSON.stringify({ id: "main-auth", gen: generation, action: "write" })) + ",true);PERFORM public.helmut_auth_state_put_nodes_local_v1('main-auth',"
      + lit(generation) + "," + json(nodes) + ");END;$graph$;";
  }
  function txRejected(statement, expectedSQLState) {
    const before = witness();let error;
    try { sql("BEGIN;SET LOCAL statement_timeout='5s';" + statement + ";ROLLBACK;"); } catch (e) { error = e; }
    assert(error);assert.match(String(error.stderr || error.message), new RegExp(expectedSQLState));assert.deepEqual(witness(), before);
  }
  await check("graph-fresh-readonly-snapshot-equals-fullreader-and-actual-node-bytes", async () => {
    const before = witness(), g = await graphRead(), native = await fullRead();
    assert.deepEqual(Object.keys(g).sort(), ["data", "graph", "proof", "state"]);
    assert.deepEqual(Object.keys(g.data).sort(), ["_authStoreRevision", "llmUsage"]);
    assert.deepEqual(g.proof, native.proof);assert.deepEqual(g.state, native.state);
    assert.equal(g.data._authStoreRevision, native.data._authStoreRevision);assert.deepEqual(g.data.llmUsage, native.data.llmUsage);
    for (const n of g.graph.nodes) assert.equal(sha(n.payload), n.hash);
    // Force only a mathematical fact-cache miss, without touching live data.
    State.build({ localGraphCanonicalFactReset: crypto.randomUUID() });
    const decoded = State.decode(g.graph, g.state.root);
    assert.deepEqual({ ...decoded.data, ...g.data }, native.data);assert.equal(decoded.root, g.state.root);
    const warm = State.decode(g.graph, g.state.root);assert.deepEqual(warm.data, decoded.data);
    const actual = await storage.readAuthStore({ strict: true });assert.deepEqual(omitRevision(actual), omitRevision(native.data));
    const stable = JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object("
      + "'stateBound',x.v->'state'=(SELECT data->'_authStateRef'FROM public.helmut_store WHERE id='main-auth'),"
      + "'proofBound',x.v->'proof'=(SELECT(data->'_llmUsageRef')-'version'FROM public.helmut_store WHERE id='main-auth'),"
      + "'revisionBound',x.v#>>'{data,_authStoreRevision}'=(SELECT data->>'_authStoreRevision'FROM public.helmut_store WHERE id='main-auth'),"
      + "'nodesActual',NOT EXISTS(SELECT FROM jsonb_array_elements(x.v#>'{graph,nodes}')n LEFT JOIN public.helmut_auth_state_nodes_local t ON t.store_id='main-auth'AND t.generation=x.v#>>'{state,generation}'AND t.node_hash=n->>'hash'WHERE t.node_hash IS NULL OR t.payload IS DISTINCT FROM n->>'payload'),"
      + "'nodeCount',jsonb_array_length(x.v#>'{graph,nodes}'))FROM(SELECT public.helmut_auth_state_graph_read_v1('{\"id\":\"main-auth\"}'::jsonb)v OFFSET 0)x;ROLLBACK;"));
    assert.equal(stable.stateBound, true);assert.equal(stable.proofBound, true);assert.equal(stable.revisionBound, true);assert.equal(stable.nodesActual, true);
    assert.equal(stable.nodeCount, g.graph.nodes.length);assert.deepEqual(witness(), before);
    return { exactFullLogicalDataEqual: true, unknownAndKnownCanonicalRootPaths: true, freshActualPayloadSHA256: true,
      nativeReadOnlyStableSnapshot: true, physicalStateProofRevisionBound: true, actualStoredNodePayloadsBound: true, nodeCount: stable.nodeCount, witnessUnchanged: true };
  });
  await check("graph-rpc-input-role-and-missing-scope-rejections", async () => {
    for (const role of ["anon", "authenticated", "bench_denied"])
      txRejected("SET LOCAL ROLE " + role + ";SELECT public.helmut_auth_state_graph_read_v1('{\"id\":\"main-auth\"}'::jsonb)", "42501");
    const before = witness();
    for (const body of [{}, { id: null }, { id: "main-auth", extra: true }])
      await assert.rejects(rpc("helmut_auth_state_graph_read_v1", body), e => e.statusCode >= 400 && e.code === "P0001");
    await assert.rejects(rpc("helmut_auth_state_graph_read_v1", { id: "other-auth-target" }), e => e.statusCode >= 400 && ["P0002", "42501"].includes(e.code));
    assert.deepEqual(witness(), before);
    return { deniedRoleCases: 3, malformedInputCases: 3, foreignMissingTargetRejected: true, allWitnessesUnchanged: true };
  });
  await check("graph-mode-native-prepass-rejects-missing-foreign-depth-types-and-work", async () => {
    let cases = 0;
    function reject(nodes, root, prefix = "") {
      const generation = crypto.randomUUID();
      txRejected(prefix + insertFragment(generation, nodes) + "SELECT public.helmut_auth_state_expand_local_v1('main-auth',"
        + lit(generation) + "," + lit(root) + ",true)", "P0001");cases++;
    }
    reject([], sha("local-graph-missing-" + crypto.randomUUID()));
    const foreignGeneration = crypto.randomUUID(), foreign = node(["v", "local-foreign-generation-" + crypto.randomUUID()]);
    const foreignRoot = node(["o", [["foreign", foreign.hash]]]);reject([foreignRoot], foreignRoot.hash, insertFragment(foreignGeneration, [foreign]));
    const object = node(["v", { localGraphType: true }]), array = node(["v", [1]]);
    const badList = node(["l", [object.hash]]), badMap = node(["m", [["0", array.hash]]]);
    reject([object, badList], badList.hash);reject([array, badMap], badMap.hash);
    const deep = [node(["v", []])];for (let i = 0; i < 64; i++) deep.push(node(["l", [deep.at(-1).hash]]));reject(deep, deep.at(-1).hash);
    const shared = [node(["v", []])];for (let i = 0; i < 18; i++) shared.push(node(["l", Array(32).fill(shared.at(-1).hash)]));reject(shared, shared.at(-1).hash);
    const scalar = node(["v", "x".repeat(256 * 1024)]), seed = node(["a", [scalar.hash]]), explosive = [scalar, seed];
    for (let i = 0; i < 3; i++) explosive.push(node(["l", Array(32).fill(explosive.at(-1).hash)]));reject(explosive, explosive.at(-1).hash);
    return { storageOrGraphPrepassRejectCases: cases, asGraphTrueRequested: true, missingRoot: true, foreignGenerationChildRejectedBeforeTransport: true,
      foreignChildMayRejectAtInsertBeforeExpand: true, childTypeCases: 2, graphDepth65: true, sharedEmptyBudgetBeforeTransport: true,
      nonemptyFanoutWorkBeforeTransport: true, exactNativeSQLState: "P0001", timeoutNeverAccepted: true, rollbackOnly: true };
  });
  await check("graph-client-payload-root-node-and-envelope-tamper-rejections", async () => {
    const before = witness(), g = await graphRead();let nodeCases = 0, envelopeCases = 0;
    const reject = (mutate, code) => { const graph = copy(g.graph);mutate(graph);assert.throws(() => State.decode(graph, g.state.root), { code });nodeCases++; };
    reject(x => { x.nodes[0].payload += " "; }, "AUTH_STATE_PAYLOAD_HASH_MISMATCH");
    reject(x => { x.nodes[0].hash = "0".repeat(64); }, "AUTH_STATE_PAYLOAD_HASH_MISMATCH");
    reject(x => { x.root = "0".repeat(64); }, "AUTH_STATE_GRAPH_INVALID");
    reject(x => { x.nodes.push(copy(x.nodes[0])); }, "AUTH_STATE_GRAPH_NODE_INVALID");
    reject(x => { x.nodes.shift(); }, "AUTH_STATE_GRAPH_POSTORDER_INVALID");
    reject(x => { x.nodes.reverse(); }, "AUTH_STATE_GRAPH_POSTORDER_INVALID");
    reject(x => { x.nodes.push(node(["v", "local-unreachable-graph-diagnostic"])); }, "AUTH_STATE_GRAPH_UNREACHABLE");
    async function badEnvelope(mutate, expected) {
      const reply = copy(g);mutate(reply);let reads = 0;
      await assert.rejects(U.read({ rowId: "main-auth", target: "local-graph-invalid-envelope-only", request: async (path, options) => {
        reads++;assert.equal(path, "/rest/v1/rpc/helmut_auth_state_graph_read_v1");assert.deepEqual(JSON.parse(options.body), { id: "main-auth" });return reply;
      } }), expected);assert.equal(reads, 1);envelopeCases++;
    }
    await badEnvelope(x => { x.proof.head = "invalid"; }, { code: "ATOMIC_USAGE_READ_INVALID" });
    await badEnvelope(x => { x.state.generation = "invalid"; }, { code: "AUTH_STATE_BINDING_INVALID" });
    await badEnvelope(x => { x.state.root = "0".repeat(64); }, { code: "AUTH_STATE_GRAPH_INVALID" });
    await badEnvelope(x => { x.proof.count++; }, { code: "ATOMIC_USAGE_READ_INVALID" });
    await badEnvelope(x => { x.data.extraAuthority = true; }, { code: "AUTH_STATE_GRAPH_DATA_INVALID" });
    await badEnvelope(x => { x.data._authStoreRevision = "invalid"; }, e => !e.code && /Ungueltige Version des Kontenspeichers/.test(e.message));
    assert.deepEqual(witness(), before);
    return { actualPayloadAndNodeCases: nodeCases, invalidEnvelopeCases: envelopeCases, exactlyOneReadPerInvalidEnvelope: true,
      noRetryOrWrites: true, allWitnessesUnchanged: true };
  });
  await check("graph-shared-alias-prototype-isolation-and-fresh-stale-CAS", async () => {
    const before = await storage.readAuthStore(), expected = omitRevision(before);
    assert.equal(Object.hasOwn(before, "localGraphAliasQualification"), false);
    const shared = { nested: { counter: 0 }, pad: "g".repeat(40 * 1024) };
    assert(Buffer.byteLength(JSON.stringify(shared)) > 16384);assert(Buffer.byteLength(JSON.stringify([shared, shared])) > 65536);
    const literal = JSON.parse('{"__proto__":{"localGraphPrototypeSentinel":"literal"},"constructor":{"prototype":"literal"},"quote\\\"back\\\\slash\\n\\t":"😀 {}[],:","empty":[],"nil":null}');
    const diagnostic = { left: copy(shared), right: copy(shared), array: [copy(shared), copy(shared)], literal };
    expected.localGraphAliasQualification = copy(diagnostic);
    await storage.mutateAuthStore(auth => { auth.localGraphAliasQualification = copy(diagnostic); });
    const a = await storage.readAuthStore(), n = await fullRead();assert.deepEqual(omitRevision(a), expected);assert.deepEqual(omitRevision(n.data), expected);
    const value = a.localGraphAliasQualification;
    assert.notStrictEqual(value.left, value.right);assert.notStrictEqual(value.left.nested, value.right.nested);
    assert.notStrictEqual(value.array[0], value.array[1]);assert.notStrictEqual(value.array[0].nested, value.array[1].nested);
    assert(Object.hasOwn(value.literal, "__proto__"));assert.equal(({}).localGraphPrototypeSentinel, undefined);
    value.left.nested.counter = 1;assert.equal(value.right.nested.counter, 0);assert.equal(value.array[0].nested.counter, 0);assert.equal(value.array[1].nested.counter, 0);
    const b = await storage.readAuthStore();assert.equal(b.localGraphAliasQualification.left.nested.counter, 0);
    const beforeWinner = await graphRead(), ack = await storage.writeAuthStore({ ...b, localGraphFreshWinner: "kept" });
    const fresh = await storage.readAuthStore(), afterWinner = await graphRead();
    assert.equal(fresh.localGraphFreshWinner, "kept");assert.equal(ack._authStoreRevision, fresh._authStoreRevision);
    assert.notEqual(afterWinner.data._authStoreRevision, beforeWinner.data._authStoreRevision);assert.notEqual(afterWinner.state.root, beforeWinner.state.root);
    assert.deepEqual(afterWinner.proof, beforeWinner.proof);
    assert.equal(afterWinner.data._authStoreRevision, fresh._authStoreRevision);assert.equal(State.build(fresh).root, afterWinner.state.root);
    const winnerWitness = witness();await assert.rejects(storage.writeAuthStore({ ...a, localGraphFreshWinner: "stale" }), { code: "AUTH_STORE_CONFLICT" });
    assert.deepEqual(witness(), winnerWitness);const end = await storage.readAuthStore();assert.equal(end.localGraphFreshWinner, "kept");
    assert.equal(end.localGraphAliasQualification.left.nested.counter, 0);
    const expectedWinner = copy(expected);expectedWinner.localGraphFreshWinner = "kept";assert.deepEqual(omitRevision(end), expectedWinner);
    return { sharedObjectBytes: Buffer.byteLength(JSON.stringify(shared)), sharedArrayExceedsRaw64KiBBound: true, literalPrototypeAndDelimiterKeys: true,
      independentMutableOccurrences: true, localMutationDoesNotChangeDB: true, freshReaderObservesNewCASRevisionAndRoot: true,
      noNewUsageInWinnerCAS: true, staleCASRejectedBeforeChanges: true, allUntargetedLogicalFieldsPreserved: true };
  });
  await check("graph-unknown-noncanonical-root-fails-closed-and-native-restores", async () => {
    const a = await fullRead(), expected = omitRevision(a.data), built = State.build(a.data);
    const rootNode = built.nodes.find(n => n.hash === built.root), payload = rootNode.payload + " ";
    const rawNode = { payload, hash: sha(payload) }, rows = await rpc("helmut_auth_state_cas_v1", cas(a, rawNode.hash, [rawNode]));
    assert.equal(rows.length, 1);assert.equal(rows[0].state.root, rawNode.hash);
    await assert.rejects(storage.readAuthStore(), { code: "AUTH_STATE_CONTENT_MISMATCH" });
    const native = await fullRead();assert.deepEqual(omitRevision(native.data), expected);
    await rpc("helmut_auth_state_restore_v1", { id: "main-auth", expectedRevision: native.data._authStoreRevision, expectedState: native.state });
    let rebootstrap;
    try {
      delete process.env.HELMUT_AUTH_STATE_STORAGE;
      const usage = await storage.readAuthStore();assert.deepEqual(omitRevision(usage), expected);assert.notEqual(usage._authStoreRevision, native.data._authStoreRevision);
      const tree = State.build(usage), physicalHash = sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");
      rebootstrap = await rpc("helmut_auth_state_bootstrap_v1", { id: "main-auth", expectedHash: physicalHash, root: tree.root, nodes: tree.nodes });
    } finally { process.env.HELMUT_AUTH_STATE_STORAGE = State.VERSION; }
    const after = await storage.readAuthStore();assert.deepEqual(omitRevision(after), expected);assert.equal(State.build(after).root, rebootstrap.state.root);
    const fresh = await graphRead();assert.deepEqual(fresh.state, rebootstrap.state);assert.deepEqual(fresh.proof, native.proof);
    return { privilegedNativeAlternativeLayoutCommittedExactData: true, unknownRootRejectedBeforeContentUse: true,
      exactContentMismatchCode: true, nativeRestoreExactUsageAndData: true, rebootstrapFreshGenerationAccepted: true, automaticFallback: false };
  });
  return checks;
}

module.exports = { run, runLeafInfo, runGraph };
