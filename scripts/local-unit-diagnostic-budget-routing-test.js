"use strict";

// Pure VM integration of the actual Storage, native Store and original atomic
// reader/Parts code. All endpoint replies and scopes below are synthetic RAM
// fixtures, never native qualification, credentials, a DB or a provider call.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), P = require("../lib/helmut/synthetik-500-profile");
const Parts = require("../lib/helmut/auth-state-parts"), CAS = require("../lib/helmut/auth-store-cas");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const root = path.resolve(__dirname, ".."), lib = path.join(root, "lib/helmut");
const sources = Object.fromEntries(["storage", "local-unit-diagnostic-store", "llm-usage-atomic"].map(name =>
  [name, fs.readFileSync(path.join(lib, name + ".js"), "utf8")]));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const owner = "synthetic-own-subject", day = "2026-10-22", now = day + "T12:00:00.000Z";
const uuid = "11111111-1111-4111-8111-111111111111";
const row = (id, changes = {}) => ({ id, politicianId: owner, createdAt: now, callType: "lageBriefing", success: true,
  estimatedCost: 0.25, ...changes });
function fixture(options = {}) {
  const calls = { reads: 0, guards: 0, clocks: 0, admissions: 0, legacy: 0, injected: 0, nonces: [], reuse: [] };
  let clock = Date.parse(now), active = options.active !== false, closed = false, current;
  let history = options.history || [row("one"), row("two", { success: false }), row("foreign", { politicianId: "synthetic-other-subject", estimatedCost: 2 }),
    row("skip", { callType: "skipped-lage", estimatedCost: 0 }), row("earlier-month", { createdAt: "2026-10-01T12:00:00.000Z", estimatedCost: 1.25 }),
    row("previous-month", { createdAt: "2026-09-30T12:00:00.000Z", estimatedCost: 8 })];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const env = { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: "http://127.0.0.1:3000",
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1",
    HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1", HELMUT_AUTH_GRAPH_READ_REUSE: "off",
    HELMUT_AUTH_CONTROL_READ: "verified-control-view-v1", HELMUT_MAX_LLM_CALLS_PER_DAY: "50",
    HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: "helmut_unit_diagnostic_" + "a".repeat(32) };
  const profile = { id: owner, aiBudgetDailyCents: options.daily === undefined ? 1000 : options.daily,
    aiBudgetMonthlyCents: options.monthly === undefined ? 10000 : options.monthly };
  const command = { mode: "D-R-1-local-fixture", units: [{ subject: owner }], drafts: [{ profile }], calendar: { executionDayUTC: day } };
  const selection = { operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: P.hash(command) };
  current = { command, selection };
  let reader;
  const scope = {
    currentVerified() { if (closed) throw Error("synthetic-scope-closed"); return active ? current : null; },
    assertClock() { calls.clocks++; if (closed || clock < Date.parse(now) || clock >= Date.parse(now) + 60000) throw Error("synthetic-scope-clock"); },
    guard(auth) { calls.guards++; assert.equal(reader.hasSnapshot(auth), true);
      assert.equal(auth.syntheticOwnBinding, selection.commandHash); assert.equal(auth.originalField, "synthetic-retained");
      if (options.guardFailure) throw Error("synthetic-claim-guard"); }
  };
  const forbidden = () => { throw Error("offline-real-io-forbidden"); };
  const fsStub = { existsSync: () => true, constants: fs.constants, readFileSync: forbidden, writeFileSync: forbidden,
    openSync: forbidden, mkdirSync: forbidden, promises: new Proxy({}, { get: () => forbidden }) };
  function load(name, imports, extra = {}, append = "") {
    const module = { exports: {} };
    const builtins = { fs: fsStub, "node:fs": fsStub, path, "node:path": path, crypto, "node:crypto": crypto,
      "node:zlib": require("node:zlib"), "node:util": require("node:util"), "node:async_hooks": require("node:async_hooks") };
    const sandbox = { module, exports: module.exports, Buffer, URL, URLSearchParams, TextDecoder, Date: Clock, structuredClone,
      __dirname: lib, __filename: path.join(lib, name + ".js"), process: { env },
      console: { warn() {}, error() {}, log: forbidden }, fetch: forbidden, ...extra,
      require(request) { if (Object.hasOwn(imports, request)) return imports[request];
        if (Object.hasOwn(builtins, request)) return builtins[request]; throw Error("offline-unexpected-module-" + request.replace(/[^A-Za-z0-9_-]/g, "")); } };
    vm.runInNewContext(sources[name] + append, sandbox, { filename: sandbox.__filename });
    return module.exports;
  }
  reader = load("llm-usage-atomic", { "./auth-store-cas": CAS, "./synthetik-500-eu-service-contract": EU,
    "./auth-state-parts": { ...Parts, enabled: () => Parts.enabled(env) } });
  const admitted = { command, selection, admission: {}, target: { database: env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE, origin: env.SUPABASE_URL } };
  const endpoint = { async request(s, database, method, route, bytes) {
    calls.reads++; assert.equal(JSON.stringify(s), JSON.stringify(selection)); assert.equal(database, admitted.target.database);
    assert.equal(method, "POST"); assert.equal(route, "/rest/v1/rpc/helmut_auth_state_graph_read_v1");
    const request = JSON.parse(bytes); assert.equal(Object.keys(request).sort().join("|"), "id|knownProof|readNonce");
    assert.equal(request.id, "main-auth"); assert.equal(typeof request.readNonce, "string"); calls.nonces.push(request.readNonce);
    if (options.readFailure) throw Error("synthetic-native-read-unknown");
    const graph = Parts.build({ originalField: "synthetic-retained", syntheticOwnBinding: selection.commandHash,
      testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH } });
    const proof = { generation: uuid, count: history.length, head: sha(JSON.stringify(history)), originalHash: sha("synthetic-original") };
    const state = { version: Parts.VERSION, generation: uuid, root: graph.root, originalHash: sha("synthetic-original-state") };
    const reused = JSON.stringify(request.knownProof) === JSON.stringify(proof); calls.reuse.push(reused);
    const binding = sha(["verified-history-reuse-v1", request.readNonce, sha(request.id), uuid,
      state.version, state.generation, state.root, state.originalHash,
      proof.generation, proof.count, proof.head, proof.originalHash, reused ? "1" : "0"].join("|"));
    const result = { data: { _authStoreRevision: uuid, ...(!reused ? { llmUsage: history } : {}) }, proof, state,
      graph: { root: graph.root, nodes: graph.nodes }, historyReuse: { version: "verified-history-reuse-v1", nonce: request.readNonce, reused, binding } };
    if (options.badBinding) result.historyReuse.binding = "0".repeat(64);
    if (options.badCount) result.proof.count++;
    if (options.badPayload) result.graph.nodes[0].payload += " ";
    if (options.afterRead) options.afterRead({ env, close: () => { closed = true; },
      switchScope: () => { current = { command: structuredClone(command), selection: { ...selection } }; }, expire: () => { clock += 60000; } });
    return { status: options.badStatus ? 503 : 200, body: Buffer.from(JSON.stringify(result)) };
  } };
  const store = load("local-unit-diagnostic-store", { "./synthetik-500-profile": P,
    [path.join(lib, "local-unit-diagnostic-scope.js")]: scope, "./llm-usage-atomic": reader,
    "./local-unit-diagnostic-authority": { validateAdmission() { calls.admissions++; if (options.admissionFailure) throw Error("synthetic-admission-expired"); } },
    "./local-unit-diagnostic-endpoint": endpoint }, { __fixture: { admitted } },
  "\n__fixture.admitted.target=JSON.parse(JSON.stringify(__fixture.admitted.target));admitted.set(__fixture.admitted.selection.commandHash,__fixture.admitted);");
  const storage = load("storage", { "./sources": { v1Sources: [] }, "./pending-terminal": {}, "./mandatsklasse": {},
    "./llm-usage-relational": {}, "./tenant-context": {}, "./speicherpfad-vorflug": {}, "./auth-store-cas": CAS,
    "./llm-usage-atomic": reader, "./briefing-speicher-lesediagnose": {}, "./blob-relational": {}, "./knowledge-object-version": { SELECT: "id" },
    "./local-unit-diagnostic-store": store, "./local-unit-diagnostic-scope": scope,
    "./llm-budget": require("../lib/helmut/llm-budget"), "./cost-model": require("../lib/helmut/cost-model") },
  { __fixture: { legacy() { calls.legacy++; if (options.legacyFailure) throw Error("synthetic-legacy-read-unknown"); return { llmUsage: history }; } } },
  "\nreadAuthStore=async()=>__fixture.legacy();module.exports.__legacyBackend=()=>useSupabase();");
  return { api: storage, store, calls, env, reader,
    budgets: () => ({ dailyBudgetCent: profile.aiBudgetDailyCents != null ? Number(profile.aiBudgetDailyCents) : null,
      monthlyBudgetCent: profile.aiBudgetMonthlyCents != null ? Number(profile.aiBudgetMonthlyCents) : null }),
    append(value) { history = [value, ...history]; }, deactivate() { active = false; },
    close() { closed = true; }, expire() { clock += 60000; },
    injected() { calls.injected++; throw Error("caller-injection-must-not-run"); } };
}
let checks = 0, currentTest = "initialization";
async function check(name, work) { currentTest = name; await work(); checks++; }
(async () => {
  await check("actual modules aggregate native full history without legacy configuration or fallback", async () => {
    const s = fixture(); assert.equal(s.api.__legacyBackend(), false);
    const global = await s.api.getLlmUsageToday(); assert.equal(global.calls, 3); assert.equal(global.successfulCalls, 2); assert.equal(global.estimatedCostUsd, 2.5);
    const own = await s.api.getLlmUsageToday(owner); assert.equal(own.calls, 2); assert.equal(own.estimatedCostUsd, 0.5);
    const month = await s.api.getLlmCostSince(owner, "2026-10-01"); assert.equal(month.calls, 3); assert.equal(month.estimatedCostUsd, 1.75);
    assert.equal(s.calls.legacy, 0); assert.equal(s.calls.guards, 3); assert.ok(s.calls.admissions >= 6);
    assert.equal(new Set(s.calls.nonces).size, 3); assert.equal(s.calls.reuse.join("|"), "false|true|true");
  });
  await check("own bound tenant policy uses global count and exact existing costs", async () => {
    const s = fixture(); const r = await s.api.canSpendLlmForTenant(owner, s.budgets());
    assert.equal(r.allowed, true); assert.equal(r.used, 3); assert.equal(r.tenantBudget.applied, true);
    assert.equal(r.tenantBudget.dailyRemainingCent, 950); assert.equal(r.tenantBudget.monthlyRemainingCent, 9825);
    assert.equal(s.calls.reads, 3); assert.equal(s.calls.legacy, 0);
  });
  for (const [name, daily, monthly, reason] of [["daily", 50, 10000, "tenant-daily-budget-reached"],
    ["monthly", 1000, 175, "tenant-monthly-budget-reached"]])
    await check("bound " + name + " limit remains enforced", async () => {
      const s = fixture({ daily, monthly }); const r = await s.api.canSpendLlmForTenant(owner, s.budgets());
      assert.equal(r.allowed, false); assert.equal(r.reason, reason);
    });
  await check("global usage-log limit still denies even with tenant headroom", async () => {
    const s = fixture(); s.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "3";
    const r = await s.api.canSpendLlmForTenant(owner, s.budgets()); assert.equal(r.allowed, false); assert.equal(r.reason, "daily-llm-budget-reached");
  });
  await check("inactive bound tenant amounts skip only tenant reads and preserve the global read", async () => {
    const s = fixture({ daily: null, monthly: null }); const r = await s.api.canSpendLlmForTenant(owner, s.budgets());
    assert.equal(r.allowed, true); assert.equal(r.tenantBudget.applied, false); assert.equal(s.calls.reads, 1);
  });
  await check("6000 retained history rows and newly appended own usage are actually consumed", async () => {
    const history = Array.from({ length: 6000 }, (_, i) => row("history-" + i, { estimatedCost: 0.000001 }));
    const s = fixture({ history }); s.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "6002";
    assert.equal((await s.api.getLlmUsageToday()).calls, 6000);
    s.append(row("new-own-D", { estimatedCost: 0.25 })); const r = await s.api.getLlmUsageToday();
    assert.equal(r.calls, 6001); assert.equal(r.estimatedCostUsd, 0.256); assert.equal(history.length, 6000);
    assert.equal(s.calls.reuse.join("|"), "false|false"); assert.equal(s.calls.legacy, 0);
  });
  for (const option of ["readFailure", "badBinding", "badCount", "badPayload", "badStatus", "guardFailure", "admissionFailure"])
    await check(option + " denies active pre-gate despite legacy fail-open default", async () => {
      const s = fixture({ [option]: true }); const r = await s.api.canSpendLlm();
      assert.equal(r.allowed, false); assert.equal(r.used, null); assert.equal(r.reason, "budget-check-failed-closed");
      assert.equal(s.calls.legacy, 0); assert.ok(s.calls.reads <= 1);
    });
  await check("native failure never creates tenant budget availability", async () => {
    const s = fixture({ readFailure: true }); const r = await s.api.canSpendLlmForTenant(owner, s.budgets());
    assert.equal(r.allowed, false); assert.equal(r.tenantBudget.allowed, false); assert.equal(s.calls.legacy, 0);
  });
  for (const mutation of [({ env }) => { env.SUPABASE_URL = "http://127.0.0.1:3001"; },
    ({ env }) => { env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE = "helmut_unit_diagnostic_" + "b".repeat(32); },
    ({ env }) => { env.HELMUT_AUTH_HISTORY_READ_REUSE = "off"; },
    ({ close }) => close(), ({ switchScope }) => switchScope(), ({ expire }) => expire()])
    await check("after-await target/scope/clock change is terminal", async () => {
      const s = fixture({ afterRead: mutation }); const r = await s.api.canSpendLlm();
      assert.equal(r.allowed, false); assert.equal(s.calls.legacy, 0); assert.equal(s.calls.reads, 1);
    });
  await check("foreign subject, day and month cannot redirect the native reader", async () => {
    const s = fixture(); await assert.rejects(s.api.getLlmUsageToday("synthetic-other-subject"));
    await assert.rejects(s.api.getLlmUsageToday(owner, "2026-10-21T12:00:00.000Z"));
    await assert.rejects(s.api.getLlmUsageToday(owner, "invalid"));
    await assert.rejects(s.api.getLlmCostSince(owner, "2026-09-01"));
    assert.equal((await s.api.canSpendLlm("synthetic-other-subject")).allowed, false);
    assert.equal(s.calls.reads, 0); assert.equal(s.calls.legacy, 0);
  });
  await check("same actual-day reference cannot replace the actual scope clock", async () => {
    const s = fixture(); assert.equal((await s.api.getLlmUsageToday(owner, day + "T00:00:00.000Z")).calls, 2);
    s.expire(); assert.equal((await s.api.canSpendLlm(owner, now)).allowed, false); assert.equal(s.calls.reads, 1);
  });
  await check("tenant budgets, subject and injected dependencies must match the bound scope", async () => {
    const s = fixture(); await assert.rejects(s.api.canSpendLlmForTenant("synthetic-other-subject", s.budgets()));
    await assert.rejects(s.api.canSpendLlmForTenant(null, s.budgets()));
    await assert.rejects(s.api.canSpendLlmForTenant(owner, {}));
    await assert.rejects(s.api.canSpendLlmForTenant(owner, { ...s.budgets(), dailyBudgetCent: 100000 }));
    await assert.rejects(s.api.canSpendLlmForTenant(owner, { ...s.budgets(), dailyBudgetCent: "1000" }));
    for (const key of ["canSpend", "usageToday", "costSince", "request"]) {
      await assert.rejects(s.api.canSpendLlmForTenant(owner, s.budgets(), null, { [key]: s.injected }));
    }
    await assert.rejects(s.api.canSpendLlmForTenant(owner, s.budgets(), null, Object.create({ canSpend: s.injected })));
    await assert.rejects(s.api.canSpendLlmForTenant(owner, s.budgets(), null, new Proxy({}, { get: () => s.injected })));
    await assert.rejects(s.api.canSpendLlmForTenant(owner, new Proxy(s.budgets(), {})));
    const getterBudget = { monthlyBudgetCent: 10000, get dailyBudgetCent() { s.injected(); } };
    await assert.rejects(s.api.canSpendLlmForTenant(owner, getterBudget));
    assert.equal(s.calls.injected, 0); assert.equal(s.calls.reads, 0);
  });
  await check("budget reader accepts no fake history or caller request inputs", async () => {
    const s = fixture(); await assert.rejects(s.store.readBudgetUsage({ llmUsage: [], request: s.injected }));
    assert.equal(s.calls.reads, 0); assert.equal(s.calls.injected, 0);
    const history = await s.store.readBudgetUsage(); assert.equal(Array.isArray(history), true); assert.equal(Object.isFrozen(history), true);
    assert.equal(Object.hasOwn(history, "syntheticOwnBinding"), false); assert.equal(s.reader.hasSnapshot(history), false);
  });
  await check("a warmed history never permits a native read outside its branded scope", async () => {
    const s = fixture(); await s.store.readBudgetUsage(); s.deactivate();
    await assert.rejects(s.store.readBudgetUsage()); assert.equal(s.calls.reads, 1);
  });
  await check("a caller changing its budget during a native read cannot replace the bound profile policy", async () => {
    let budgets;
    const s = fixture({ afterRead() { budgets.dailyBudgetCent = 100000; } }); budgets = s.budgets();
    await assert.rejects(s.api.canSpendLlmForTenant(owner, budgets)); assert.equal(s.calls.reads, 1); assert.equal(s.calls.legacy, 0);
  });
  for (const [key, value] of [["HELMUT_AUTH_STATE_STORAGE", "blob"], ["HELMUT_AUTH_HISTORY_READ_REUSE", "off"],
    ["HELMUT_AUTH_GRAPH_READ_REUSE", "verified-graph-reuse-v1"]])
    await check("changed reader mode cannot downgrade native budget proof", async () => {
      const s = fixture(); s.env[key] = value; assert.equal((await s.api.canSpendLlm()).allowed, false);
      assert.equal(s.calls.reads, 0); assert.equal(s.calls.legacy, 0);
    });
  await check("inactive legacy aggregation and injected tenant policy retain their original contracts", async () => {
    const s = fixture({ active: false }); assert.equal((await s.api.getLlmUsageToday(owner, now)).calls, 2);
    const result = await s.api.canSpendLlmForTenant("legacy-other-subject", { dailyBudgetCent: 100 }, now, {
      canSpend: async () => ({ allowed: true }), usageToday: async () => ({ estimatedCostUsd: 0.5 }),
      costSince: async () => ({ estimatedCostUsd: 0.75 }) });
    assert.equal(result.allowed, true); assert.equal(result.tenantBudget.dailyRemainingCent, 50); assert.equal(s.calls.reads, 0);
  });
  await check("inactive legacy read failure remains controlled by its existing fail-open flag", async () => {
    const s = fixture({ active: false, legacyFailure: true }); const open = await s.api.canSpendLlm();
    assert.equal(open.allowed, true); assert.equal(open.reason, "budget-check-failed-open");
    s.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "1"; const closed = await s.api.canSpendLlm();
    assert.equal(closed.allowed, false); assert.equal(closed.reason, "budget-check-failed-closed"); assert.equal(s.calls.reads, 0);
  });
  process.stdout.write("PASS local-unit native budget routing: " + checks + " checks; native executions 0\n");
})().catch(error => {
  const code = typeof error.message === "string" && /^[A-Za-z0-9_-]+$/.test(error.message) ? error.message : error.name;
  process.stderr.write("FAIL local-unit budget routing: " + currentTest + " [" + code + "]\n"); process.exitCode = 1;
});
