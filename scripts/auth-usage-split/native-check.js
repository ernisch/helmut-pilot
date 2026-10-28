"use strict";

// Small independent component contract against genuine local PG/PostgREST.
// No original data, profiles, engine, model, activation or complete500 program.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const A = require("../../lib/helmut/llm-usage-atomic");
const { fixture, record, withoutRevision, hash } = require("./fixture");
const S = require("./support");
const clone = value => JSON.parse(JSON.stringify(value));
async function ready(request) {
  const until = Date.now() + 6000;let last;
  do {
    try {
      const catalog = await request("/", { headers: { Accept: "application/openapi+json" } });
      assert(catalog.paths?.["/helmut_store"] && catalog.paths?.["/rpc/helmut_auth_usage_read_v1"]
        && catalog.paths?.["/rpc/helmut_auth_usage_cas_v1"], "PostgREST function schema cache not ready");
      await request("/rest/v1/helmut_store?select=id&limit=1");return;
    } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < until);
  throw last;
}
async function main(config) {
  const sql = S.sqlClient(config), request = S.requester(config), checks = [];
  const check = async (name, body) => { await body();checks.push(name);console.log(`PASS ${name}`); };
  process.env.HELMUT_LLM_USAGE_STORAGE = A.VERSION;process.env.SUPABASE_URL = config.apiBase;delete process.env.VERCEL;
  assert.equal(sql.json("SELECT to_jsonb(current_database());"), config.database);
  assert.equal(sql.json("SELECT to_jsonb(split_part(current_setting('server_version'),' ',1));"), "17.6");
  S.createFixtureTables(sql);S.installProposal(sql);sql("NOTIFY pgrst,'reload schema';");await ready(request);
  const init = (id, options = {}) => {
    const data = fixture(options);data.llmUsage = data.llmUsage.map(x => ({ ...x, id: id + "-" + x.id }));
    S.seed(sql, id, data);const boot = S.bootstrap(sql, id);
    return { id, rowId: id, target: config.apiBase + "|" + id, request, data, boot };
  };
  const logical = c => A.read(c);
  const physicalHash = id => sql.json(`SELECT to_jsonb(encode(sha256(convert_to(jsonb_build_object(
    'data',(SELECT data FROM public.helmut_store WHERE id=${S.literal(id)}),
    'history',(SELECT jsonb_agg(to_jsonb(u) ORDER BY usage_ordinal) FROM public.llm_usage u WHERE usage_store_id=${S.literal(id)}))::text,'UTF8')),'hex'));`);
  const original = init("component-primary");
  await check("Native v6 bootstrap, full-history reconstruction and exact future-field retention", async () => {
    const read = await logical(original);assert.deepEqual(withoutRevision(read), withoutRevision(original.data));
    const witness = S.witness(sql, original.id);assert.equal(witness.usageRows, 32);
    assert(!Object.hasOwn(witness.data, "llmUsage"));assert.equal(witness.data[A.MARKER].count, 32);
    assert.equal(original.boot.proof.count, 32);
  });
  await check("Native v5 bootstrap, no silent loss or changed economic fields", async () => {
    const c = init("component-v5", { orderVersion: 5 });assert.deepEqual(withoutRevision(await logical(c)), withoutRevision(c.data));
    const read = await logical(c);read.adminSettings.check = true;const next = await A.write(read, c);
    assert.equal(next.testKostenAuftrag.cap, c.data.testKostenAuftrag.cap);assert.equal(next.llmUsage.length, 32);
  });
  await check("Native bootstrap rejects wrong v5/v6 contract binding and rolls back unchanged", async () => {
    for (const [suffix, patch] of [["version",{version:4}],["contract",{serviceContractHash:"0".repeat(64)}],
      ["renewal",{orderRenewalHash:"0".repeat(64)}]]) {
      const id = "component-invalid-" + suffix, data = fixture({ historyCount: 2 });Object.assign(data.testKostenAuftrag, patch);
      data.llmUsage = data.llmUsage.map(x => ({ ...x, id: id + "-" + x.id }));S.seed(sql, id, data);
      const before = physicalHash(id);assert.throws(() => S.bootstrap(sql, id));assert.equal(physicalHash(id), before);
    }
  });
  await check("Actual RPC append atomically commits full receipt and exact nonusage state", async () => {
    const read = await logical(original), added = record("component-native-added", 40);
    read.llmUsage = [added, ...read.llmUsage];read.adminSettings.nested.value = 2;
    const accepted = await A.write(read, original), receipt = A.receipt(added, read), fresh = await logical(original);
    assert(A.confirmed(receipt));assert(A.persisted(fresh, receipt));assert.equal(fresh.llmUsage.length, 33);
    assert.deepEqual(withoutRevision(fresh), withoutRevision(accepted));assert.deepEqual(fresh.llmUsage[0], added);
    assert.deepEqual(fresh.llmUsage.slice(1), original.data.llmUsage);
    assert.deepEqual(sql.json(`SELECT jsonb_build_object('keinAufruf',kein_aufruf,'sourceId',source_id,'packageId',package_id,
      'vorgangId',vorgang_id,'knowledgeObjectId',knowledge_object_id) FROM public.llm_usage WHERE id='component-native-added';`),
    { keinAufruf: true, sourceId: added.sourceId, packageId: added.packageId, vorgangId: added.vorgangId, knowledgeObjectId: added.knowledgeObjectId });
    assert(!A.confirmed(clone(receipt)));assert(!A.persisted(fresh, clone(receipt)));
  });
  await check("Actual duplicate ID rolls back state/revision/history as one transaction", async () => {
    const before = physicalHash(original.id), read = await logical(original), duplicate = record(read.llmUsage[0].id);
    read.llmUsage = [duplicate, ...read.llmUsage];read.adminSettings.nested.value = 999;
    await assert.rejects(A.write(read, original));assert.equal(physicalHash(original.id), before);
    assert.throws(() => A.receipt(duplicate, read));
  });
  await check("Actual concurrent writers: one CAS winner, stale loser; explicit fresh read preserves both changes", async () => {
    const c = init("component-concurrent", { historyCount: 8 }), first = await logical(c), second = await logical(c);
    const a = record("component-concurrent-a"), b = record("component-concurrent-b");
    first.llmUsage = [a, ...first.llmUsage];second.llmUsage = [b, ...second.llmUsage];
    first.adminSettings.writer = "a";second.adminSettings.writer = "b";
    const results = await Promise.allSettled([A.write(first, c), A.write(second, c)]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    const rejected = results.find(x => x.status === "rejected");assert.equal(rejected.reason.code, "AUTH_STORE_CONFLICT");
    const fresh = await logical(c), missing = fresh.llmUsage[0].id === a.id ? b : a;
    assert.equal(fresh.llmUsage.length, 9);fresh.llmUsage = [missing, ...fresh.llmUsage];
    await A.write(fresh, c);const after = await logical(c);
    assert.equal(after.llmUsage.length, 10);assert.equal(after.llmUsage.filter(x => [a.id,b.id].includes(x.id)).length, 2);
    assert.deepEqual(after.llmUsage.slice(2), c.data.llmUsage);
  });
  await check("Actual committed lost ACK: one attempt, no receipt/replay, fresh state shows single insert", async () => {
    const read = await logical(original), added = record("component-native-lost-ack"), before = read.llmUsage.length;
    read.llmUsage = [added, ...read.llmUsage];let attempts = 0;
    const lost = { ...original, request: async (route, options) => { attempts++;await request(route, options);throw Error("SIMULATED_LOST_ACK_AFTER_REAL_COMMIT"); } };
    await assert.rejects(A.write(read, lost), /SIMULATED_LOST_ACK_AFTER_REAL_COMMIT/);assert.equal(attempts, 1);
    assert.throws(() => A.receipt(added, read));const after = await logical(original);
    assert.equal(after.llmUsage.length, before + 1);assert.equal(after.llmUsage.filter(x => x.id === added.id).length, 1);
    await assert.rejects(A.write(read, original), { code: "AUTH_STORE_CONFLICT" });
  });
  await check("Actual in-flight caller mutation leaves confirmed transport contents exact", async () => {
    const read = await logical(original), added = record("component-native-inflight"), previous = clone(read.adminSettings);
    read.llmUsage = [added, ...read.llmUsage];let release, arrived;
    const ready = new Promise(resolve => { arrived = resolve; });
    const delayed = { ...original, request: async (route, options) => { arrived();await new Promise(resolve => { release = resolve; });return request(route, options); } };
    const writing = A.write(read, delayed);await ready;read.adminSettings.nested.value = 999;added.model = "changed";release();
    await writing;const after = await logical(original);assert.deepEqual(after.adminSettings, previous);
    assert.equal(after.llmUsage[0].model, "INERT-NOT-A-MODEL");assert.throws(() => A.receipt(added, read));
  });
  await check("Existing full-blob writers/direct history modifications/truncate fail closed", async () => {
    const before = physicalHash(original.id), read = await logical(original);
    await assert.rejects(request(`/rest/v1/helmut_store?id=eq.${original.id}`, { method: "PATCH", body: JSON.stringify({ data: read }) }));
    const bad = sql(`SET ROLE service_role;UPDATE public.llm_usage SET usage_record='{}'::jsonb WHERE usage_store_id=${S.literal(original.id)};`, { allowFailure: true });
    assert.notEqual(bad.status, 0);
    const truncate = sql("SET ROLE service_role;TRUNCATE public.helmut_store,public.llm_usage;", { allowFailure: true });assert.notEqual(truncate.status, 0);
    assert.equal(physicalHash(original.id), before);
  });
  await check("Native chain detects actual stored corruption including SQL NULL, transaction rolls back", async () => {
    const before = physicalHash(original.id);
    for (const update of ["usage_prev_hash=NULL", "usage_record=NULL", "usage_record=jsonb_set(usage_record,'{model}','\"CORRUPTED\"'::jsonb)"]) {
      const result = sql(`BEGIN;ALTER TABLE public.llm_usage DISABLE TRIGGER helmut_usage_record_immutable_local;
        UPDATE public.llm_usage SET ${update} WHERE usage_store_id=${S.literal(original.id)} AND usage_ordinal=1;
        SET LOCAL ROLE service_role;SELECT public.helmut_auth_usage_read_v1(jsonb_build_object('id',${S.literal(original.id)}));ROLLBACK;`, { allowFailure: true });
      assert.notEqual(result.status, 0);assert.match(result.error, /history-corrupt/);assert.equal(physicalHash(original.id), before);
    }
  });
  await check("Catalog/RLS/ALWAYS triggers and public/anon/customer function privileges retained", async () => {
    const catalog = sql.json(`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('name',proname,'definer',prosecdef,
      'public',EXISTS(SELECT FROM aclexplode(coalesce(proacl,acldefault('f',proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'anon',has_function_privilege('anon',oid,'EXECUTE'),'customer',has_function_privilege('authenticated',oid,'EXECUTE')) ORDER BY proname)
      FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'helmut_auth_usage_%'),
      'always',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'helmut_usage_%' AND tgenabled='A'),
      'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.llm_usage'::regclass));`);
    assert(catalog.functions.length >= 6);assert.equal(catalog.always, 4);assert.equal(catalog.rls, true);
    assert(catalog.functions.every(x => !x.definer && !x.public && !x.anon && !x.customer));
    for (const role of ["anon","authenticated"]) {
      const denied = S.requester(config, role);await assert.rejects(S.rpc(denied, "helmut_auth_usage_read_v1", { id: original.id }));
      await assert.rejects(denied("/rest/v1/llm_usage?select=id"));
    }
  });
  await check("Local SQL experiment gate absent denies RPC before exposing data", async () => {
    const result = sql(`BEGIN;SET LOCAL helmut.local_usage_experiment='off';SET LOCAL ROLE service_role;
      SELECT public.helmut_auth_usage_read_v1(jsonb_build_object('id',${S.literal(original.id)}));ROLLBACK;`, { allowFailure: true });
    assert.notEqual(result.status, 0);assert.match(result.error, /local-only/);
  });
  await check("Restore requires fresh revision, restores entire exact state and retains immutable relational history", async () => {
    const before = await logical(original), physical = S.witness(sql, original.id);
    await assert.rejects(S.rpc(request, "helmut_auth_usage_restore_v1", { id: original.id, expectedRevision: original.data._authStoreRevision }));
    const restored = await S.rpc(request, "helmut_auth_usage_restore_v1", { id: original.id, expectedRevision: before._authStoreRevision });
    assert.equal(restored.restored, true);assert.equal(restored.historyRowsRetained, true);
    const after = S.witness(sql, original.id);assert.equal(after.usageRows, physical.usageRows);
    assert.deepEqual(withoutRevision(after.data), withoutRevision(before));assert(!Object.hasOwn(after.data, A.MARKER));
    assert.notEqual(after.data._authStoreRevision, before._authStoreRevision);
  });
  const result = { schema: "helmut-auth-usage-split-native-contract/1", pass: true, checks: checks.length, groups: checks,
    server: "PostgreSQL17.6 with genuine local PostgREST", wire: request.stats,
    originalData: false, profiles: 0, engineUnits: 0, modelCalls: 0, complete500Attempts: 0 };
  result.integration = await require("./integration-check").main(config);
  if (config.resultFile) fs.writeFileSync(config.resultFile, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(result));return result;
}
if (require.main === module) main(S.readConfig(process.argv[2])).catch(error => { console.error(error.stack);process.exitCode = 1; });
module.exports = { main, ready };
