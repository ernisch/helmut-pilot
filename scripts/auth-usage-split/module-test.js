"use strict";

const assert = require("node:assert/strict");
const A = require("../../lib/helmut/llm-usage-atomic");
const { fixture, record, withoutRevision } = require("./fixture");
const target = "http://127.0.0.1:1|component-auth", rowId = "component-auth";
const proof = { generation: "22222222-2222-4222-8222-222222222222", count: 32,
  head: "a".repeat(64), originalHash: "b".repeat(64) };
const clone = x => JSON.parse(JSON.stringify(x));
let checks = 0;
const check = async (name, run) => { await run();checks++;console.log(`PASS ${name}`); };
function fake(data = fixture()) {
  let contents = clone(data), currentProof = { ...proof, count: data.llmUsage.length }, calls = 0;
  const request = async (route, options) => {
    calls++;const body = JSON.parse(options.body);
    if (route.endsWith("read_v1")) return { data: clone(contents), proof: clone(currentProof) };
    assert(route.endsWith("cas_v1"));assert.equal(body.id, rowId);
    assert(!Object.hasOwn(body.data, "llmUsage"));
    if (body.expectedRevision !== contents._authStoreRevision) return [];
    contents = { ...clone(body.data), llmUsage: [...clone(body.additions), ...contents.llmUsage] };
    currentProof = { ...currentProof, count: currentProof.count + body.additions.length,
      ...(body.additions.length ? { head: "c".repeat(64) } : {}) };
    return [{ id: rowId, revision: contents._authStoreRevision, proof: clone(currentProof) }];
  };
  return { request, calls: () => calls, contents: () => contents };
}
async function main() {
  await check("Default off, strict explicit mode and loopback-only/VERCEL guards", async () => {
    assert.equal(A.enabled({}), false);assert.equal(A.enabled({ HELMUT_LLM_USAGE_STORAGE: "blob" }), false);
    assert.throws(() => A.enabled({ HELMUT_LLM_USAGE_STORAGE: "typo" }));
    for (const SUPABASE_URL of ["https://127.0.0.1", "http://10.0.0.1", "http://192.168.0.1", "http://example.invalid", "https://example.supabase.co"]) {
      assert.throws(() => A.enabled({ HELMUT_LLM_USAGE_STORAGE: A.VERSION, SUPABASE_URL }));
    }
    assert.throws(() => A.enabled({ HELMUT_LLM_USAGE_STORAGE: A.VERSION, SUPABASE_URL: "http://127.0.0.1", VERCEL: "1" }));
    assert.equal(A.enabled({ HELMUT_LLM_USAGE_STORAGE: A.VERSION, SUPABASE_URL: "http://127.0.0.1:1234" }), true);
  });
  process.env.HELMUT_LLM_USAGE_STORAGE = A.VERSION;process.env.SUPABASE_URL = "http://127.0.0.1:1";delete process.env.VERCEL;
  await check("v5/v6 complete lossless read and recursively immutable history", async () => {
    for (const orderVersion of [5,6]) {
      const data = fixture({ orderVersion }), service = fake(data), read = await A.read({ request: service.request, rowId, target });
      assert.deepEqual(withoutRevision(read), withoutRevision(data));assert(A.hasSnapshot(read));
      assert(Object.isFrozen(read.llmUsage));assert(Object.isFrozen(read.llmUsage[0].futureTechnicalField));
      assert.throws(() => { read.llmUsage[0].futureTechnicalField.padding = "changed"; });
      const accepted = await A.write(read, { request: service.request, rowId, target });
      assert.deepEqual(withoutRevision(accepted), withoutRevision(data));
    }
  });
  await check("Append preserves exact history and private receipt cannot be forged", async () => {
    const service = fake(), original = await A.read({ request: service.request, rowId, target }), added = record("component-new");
    original.llmUsage = [added, ...original.llmUsage];
    assert.throws(() => A.receipt(added, original));
    const accepted = await A.write(original, { request: service.request, rowId, target }), receipt = A.receipt(added, original);
    assert(A.confirmed(receipt));assert(A.persisted(accepted, receipt));assert(!A.confirmed(clone(receipt)));
    assert(!A.persisted(accepted, clone(receipt)));assert(!A.persisted({ ...accepted, llmUsage: [] }, receipt));
    assert.deepEqual(accepted.llmUsage, [added, ...fixture().llmUsage]);
    assert.equal(receipt.keinAufruf, true);assert.deepEqual(receipt.futureTechnicalField, added.futureTechnicalField);
  });
  await check("History deletion/reorder/replacement, marker and revision mutation rejected before IO", async () => {
    for (const mutate of [s => { s.llmUsage = s.llmUsage.slice(1); },s => { s.llmUsage = [...s.llmUsage].reverse(); },
      s => { s.llmUsage = clone(s.llmUsage); },s => { s[A.MARKER] = {}; },s => { s._authStoreRevision = "33333333-3333-4333-8333-333333333333"; }]) {
      const service = fake(), read = await A.read({ request: service.request, rowId, target });mutate(read);
      await assert.rejects(A.write(read, { request: service.request, rowId, target }));assert.equal(service.calls(), 1);
    }
  });
  await check("Unbound/wrong-target snapshots and invalid EU order rejected", async () => {
    const service = fake();await assert.rejects(A.write(fixture(), { request: service.request, rowId, target }));
    const read = await A.read({ request: service.request, rowId, target });
    await assert.rejects(A.write(read, { request: service.request, rowId, target: target + "wrong" }));
    for (const patch of [{ version: 4 },{ serviceContractHash: "0".repeat(64) },{ orderRenewalHash: "0".repeat(64) }]) {
      const another = await A.read({ request: service.request, rowId, target });Object.assign(another.testKostenAuftrag, patch);
      await assert.rejects(A.write(another, { request: service.request, rowId, target }));
    }
  });
  await check("Request payload captured before awaiting; caller mutation cannot change confirmed result", async () => {
    const service = fake(), read = await A.read({ request: service.request, rowId, target }), added = record("component-race");
    read.llmUsage = [added, ...read.llmUsage];let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    const request = async (route, options) => { started();await new Promise(resolve => { release = resolve; });return service.request(route, options); };
    const writing = A.write(read, { request, rowId, target });await ready;
    read.adminSettings.nested.value = 999;added.futureTechnicalField.padding = "tamper";release();
    const accepted = await writing;assert.equal(accepted.adminSettings.nested.value, 1);
    assert.equal(accepted.llmUsage[0].futureTechnicalField.padding, "");assert.throws(() => A.receipt(added, read));
  });
  await check("Concurrent snapshots lose stale CAS and retain the winner", async () => {
    const service = fake(), first = await A.read({ request: service.request, rowId, target }), second = await A.read({ request: service.request, rowId, target });
    first.adminSettings.winner = true;await A.write(first, { request: service.request, rowId, target });
    second.adminSettings.winner = false;await assert.rejects(A.write(second, { request: service.request, rowId, target }), { code: "AUTH_STORE_CONFLICT" });
    assert.equal(service.contents().adminSettings.winner, true);
  });
  await check("Committed but lost ACK is never replayed or branded; fresh read sees actual poststate", async () => {
    const service = fake(), read = await A.read({ request: service.request, rowId, target }), added = record("component-lost");read.llmUsage = [added, ...read.llmUsage];
    let attempts = 0;const request = async (route, options) => { attempts++;await service.request(route, options);throw Error("SIMULATED_LOST_ACK"); };
    await assert.rejects(A.write(read, { request, rowId, target }), /SIMULATED_LOST_ACK/);assert.equal(attempts, 1);
    assert.throws(() => A.receipt(added, read));const after = await A.read({ request: service.request, rowId, target });assert.equal(after.llmUsage[0].id, added.id);
  });
  await check("Malformed read and ambiguous ACK deny success", async () => {
    for (const result of [null,{ data: fixture(), proof: { ...proof, count: 0 } },{ data: { ...fixture(), [A.MARKER]: {} }, proof }]) {
      await assert.rejects(A.read({ request: async () => result, rowId, target }));
    }
    for (const result of [null,[{}],[{ id: rowId, revision: "0".repeat(36), proof }]]) {
      const service = fake(), read = await A.read({ request: service.request, rowId, target });
      await assert.rejects(A.write(read, { request: async () => result, rowId, target }));
    }
  });
  console.log(JSON.stringify({ scope: "pure component contract; no database/network/provider/500-run", checks, pass: true }));
}
if (require.main === module) main().catch(error => { console.error(error.stack);process.exitCode = 1; });
module.exports = { main };
