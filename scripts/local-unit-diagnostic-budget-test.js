"use strict";
// Labelled synthetic native-API/receipt stand-ins. No DB, provider, source
// original qualification, engine or real runtime authority is exercised.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const A = require("../lib/helmut/local-unit-diagnostic-authority"), P = require("../lib/helmut/synthetik-500-profile");
const H = require("./local-unit-diagnostic-authority-test"), R = require("../lib/helmut/synthetik-500-review-receipt");
const clone = x => structuredClone(x), hash = x => P.hash(x), LIB = path.resolve(__dirname, "../lib/helmut");
let checks = 0;
function moduleFixture(file, replacements) {
  const box = { module: { exports: {} }, Buffer, structuredClone, Date: class extends Date {
    constructor(value) { super(arguments.length ? value : H.at); }
  }, require(name) {
    if (Object.hasOwn(replacements, name)) return replacements[name];
    return require(name.startsWith(".") ? path.resolve(LIB, name) : name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(LIB, file), "utf8"), box, { filename: "SYNTHETIC-" + file });
  return box.module.exports;
}
function setup() {
  const f = H.start(H.fixture()), tickets = new WeakSet(), receipts = new WeakMap(), providers = new WeakMap(), artifacts = new Map();
  let state = clone(f.auth), active = true, failAccountingACK = false;
  const route = { snapshot: { provider: "local-fixture", responsesUrl: "local-unit-fixture://SYNTHETIC/responses", model: "gpt-5-mini-eu" } };
  const scope = {
    currentVerified() { return active ? { command: f.command, selection: f.selection } : null; },
    assertClock() { A.bind(state, f.selection, H.claimId, H.at); },
    async verifyRuntime() { scope.assertClock(); },
    async readState() { return clone(state); }, authority(doc) { return A.current(doc, f.selection); },
    guard(doc) { return A.bind(doc, f.selection, H.claimId, H.at); },
    costAdmission() { return { version: A.SLOT_VERSION, operationId: f.selection.operationId, planHash: f.command.slot.planHash,
      routeContractHash: hash({ version: "helmut-local-unit-diagnostic-fixture-route/1", commandHash: f.selection.commandHash,
        requestPins: f.command.requestPins, paidProviderCallsAllowed: false }) }; },
    async reserveTicket(phase, requestHash, bytes, binding) {
      const ticket = A.reserve(state, f.selection, H.claimId, phase, "SYNTHETIC-TICKET-" + phase, requestHash, H.at, binding, bytes);
      tickets.add(ticket); return ticket;
    },
    assertTicket(t) { assert(active && tickets.has(t), "SYNTHETIC private ticket required"); },
    async mutateState(change) {
      const next = clone(state), result = change(next); state = next;
      if (failAccountingACK) throw Error("SYNTHETIC_UNKNOWN_ACCOUNTING_ACK");
      return result;
    }
  };
  const storage = {
    readLocalUnitDiagnosticUsageReceipt(h, ticket) { const r = receipts.get(h); return r?.ticket === ticket ? { record: clone(r.record), recordHash: hash(r.record) } : null; },
    localUnitDiagnosticUsagePersisted(doc, h, ticket) {
      const r = receipts.get(h), call = scope.authority(doc).costs.calls[ticket.id];
      return r?.ticket === ticket && call?.status === "sent"
        && hash(artifacts.get("usage-" + ticket.admission.phase + ":" + ticket.id)) === hash(r.record);
    },
    async assertLocalUnitDiagnosticArtifactContract() { return undefined; },
    async insertLocalUnitDiagnosticArtifact(selection, kind, id, record, parentHash) {
      assert.equal(hash(selection), hash(f.selection)); assert.equal(kind, "immutable-D");
      assert.equal(parentHash, hash(artifacts.get("draft:" + record.entry.id)));
      assert(!artifacts.has(kind + ":" + id), "SYNTHETIC plain INSERT is once only"); artifacts.set(kind + ":" + id, clone(record));
    },
    async readLocalUnitDiagnosticArtifact(selection, kind, id, expected) {
      assert.equal(hash(selection), hash(f.selection)); const value = artifacts.get(kind + ":" + id);
      assert(value, "SYNTHETIC native artifact missing"); if (expected) assert.equal(hash(value), expected); return clone(value);
    }
  };
  const replacements = { "./local-unit-diagnostic-scope": scope, "./storage": storage,
    // Keep strict production plain-object checks while crossing the test VM's
    // separate intrinsic Object prototype through explicit detached copies.
    "./local-unit-diagnostic-authority": { ...A, exact: (x, keys) => A.exact(clone(x), keys) },
    "./synthetik-500-review-receipt": { ...R, validateCompletion: (c, slot) => R.validateCompletion(clone(c), slot),
      notSent(ticket) { scope.assertTicket(ticket); assert.equal(ticket.admission.phase, "D"); return false; } },
    "./local-unit-diagnostic-transport": { model: () => "gpt-5-mini-eu", route: () => route },
    "./ai": { readSynthetik500ProviderCompletion: h => providers.get(h) || null } };
  const budget = moduleFixture("local-unit-diagnostic-budget.js", replacements), draftStore = moduleFixture("local-unit-diagnostic-draft-store.js", replacements);
  const request = { model: "gpt-5-mini-eu", maxOutputTokens: 3000, runId: f.command.slot.plan.runId, politicianId: f.owner,
    phase: "entwurf", admission: scope.costAdmission(), inputVersionHash: f.d.inputVersionHash,
    actualRequestHash: f.d.actualRequestHash, runtimeRouteSnapshot: route.snapshot, requestBytes: H.dBytes };
  function mintUsage(ticket, changes = {}) {
    const record = { id: "SYNTHETIC-USAGE-" + ticket.admission.phase, createdAt: H.at, model: "gpt-5-mini-eu", promptTokens: 10, completionTokens: 2,
      totalTokens: 12, estimatedCost: budget.tokenCost(10, 2) / 1e6, success: true, scopeHash: f.selection.commandHash,
      budgetTicketId: ticket.id, costIntentId: ticket.admission.intentId, costPlanHash: f.command.slot.planHash, costRequestHash: ticket.admission.actualRequestHash,
      costPhase: ticket.admission.phase, runId: request.runId, politicianId: f.owner, costBasis: "local-fixture-simulation-not-provider-charge", ...changes };
    const handle = Object.freeze({}); receipts.set(handle, { ticket, record });
    artifacts.set("usage-" + ticket.admission.phase + ":" + ticket.id, clone(record)); return handle;
  }
  const answer = { value: "SYNTHETIC-RAW-OUTPUT" }, sources = [], profileHash = hash({ id: f.owner });
  function mintProvider(ticket) {
    const handle = Object.freeze({}); providers.set(handle, { ticket, providerResponseHash: hash("SYNTHETIC-BYTES"),
      providerTextHash: hash("SYNTHETIC-TEXT"), outputHash: hash(answer), sourceContext: { profileHash, sourcesHash: hash(sources) } }); return handle;
  }
  return { f, scope, storage, budget, draftStore, request, mintUsage, mintProvider, answer, sources, profileHash, artifacts,
    // Synthetic reviewed-R stand-in only; production still requires the actual
    // private R receipt before its reservation. This tests the separate usage cap.
    seedReviewedRTicket() {
      const completion = scope.authority(state).slot.draftCompletions[f.d.id], binding = H.review(f, completion);
      const ticket = A.reserve(state, f.selection, H.claimId, "R", "SYNTHETIC-TICKET-R", binding.actualRequestHash,
        H.at, binding, H.rBytes); tickets.add(ticket); return ticket;
    },
    state: () => state, failACK() { failAccountingACK = true; }, closeScope() { active = false; } };
}
async function expectReject(fn, pattern) { await assert.rejects(fn(), pattern); checks++; }
async function main() {
  for (const mutate of [r => r.politicianId = "OTHER_SYNTHETIC_OWNER", r => r.runId = "nachlauf500-99999",
    r => r.maxOutputTokens = 6000, r => r.model = "gpt-5-mini", r => r.inputVersionHash = "0".repeat(64),
    r => r.admission = { trusted: true }, r => r.runtimeRouteSnapshot = { provider: "azure" },
    r => r.requestBytes = Buffer.from(H.dBytes.toString().replace(",", ", "))]) {
    const c = setup(), request = { ...c.request }; mutate(request); await expectReject(() => c.budget.reserviere(request));
    assert.equal(Object.keys(c.scope.authority(c.state()).costs.calls).length, 0);
  }
  const c = setup(), ticket = await c.budget.reserviere(c.request); checks++;
  assert.equal(c.budget.tokenCost(272000, 3000), 81400);
  assert.equal(c.budget.tokenCost(272000, 6000), 88000);
  assert.equal(c.budget.tokenCost(272000, 3000) + c.budget.tokenCost(272000, 6000), 169400); checks++;
  assert.throws(() => c.budget.tokenCost(272000, 6001)); assert.throws(() => c.budget.tokenCost(272001, 6000)); checks++;
  await expectReject(() => c.budget.reserviere(c.request));
  assert.equal(c.budget.confirmedUsageReceipt({}, ticket), false); checks++;
  A.send(c.state(), ticket, H.at);
  const receipt = c.mintUsage(ticket), provider = c.mintProvider(ticket);
  assert.equal(c.budget.confirmedUsageReceipt(receipt, ticket), true); assert.equal(c.budget.confirmedUsageReceipt(clone(receipt), ticket), false); checks++;
  assert.equal(c.budget.confirmedUsageReceipt(receipt, clone(ticket)), false); checks++;
  const completion = await c.budget.abschliessen(ticket, receipt, { internalProviderCompletion: provider });
  assert.equal(completion.usageReceipt.recordHash, hash(c.artifacts.get("usage-D:" + ticket.id)));
  assert.equal(c.scope.authority(c.state()).costs.calls[ticket.id].status, "accounted"); checks++;
  const entry = { id: "bf-SYNTHETIC-NEW-DRAFT", user_id: c.f.owner, slot: "lage-pruefentwurf", generated_at: H.at,
    payload: { phase: "entwurf", runId: c.f.command.slot.plan.runId, tag: c.f.command.calendar.executionDayUTC,
      antwort: c.answer, quellen: c.sources, profilHash: c.profileHash, auslieferbar: false, qualitaetBestanden: false } };
  c.artifacts.set("draft:" + entry.id, clone(entry));
  assert.equal((await c.draftStore.contract()).version, c.draftStore.VERSION); checks++;
  const saved = await c.draftStore.store(null, entry, completion, c.draftStore.CONTRACT_HASH);
  assert.equal(hash(await c.draftStore.read(null, c.f.owner, saved.id, saved.versionHash, c.draftStore.CONTRACT_HASH)), hash(entry)); checks++;
  await expectReject(() => c.draftStore.store(null, entry, completion, c.draftStore.CONTRACT_HASH));
  await expectReject(() => c.draftStore.read(null, "OTHER_SYNTHETIC_OWNER", saved.id, saved.versionHash, c.draftStore.CONTRACT_HASH));
  await expectReject(() => c.draftStore.read(null, c.f.owner, saved.id, "0".repeat(64), c.draftStore.CONTRACT_HASH));
  const altered = clone(completion); altered.outputHash = "0".repeat(64);
  await expectReject(() => c.draftStore.store(null, entry, altered, c.draftStore.CONTRACT_HASH));
  // A schema-shaped completion/usage from JSON never replaces the private AI handle or native receipt.
  for (const bad of ["receipt", "provider", "usage", "ack"]) {
    const g = setup(), t = await g.budget.reserviere(g.request); A.send(g.state(), t, H.at);
    const q = g.mintUsage(t, bad === "usage" ? { budgetTicketId: "SYNTHETIC_FOREIGN_TICKET" } : {}), h = g.mintProvider(t);
    if (bad === "ack") g.failACK();
    await expectReject(() => g.budget.abschliessen(t, bad === "receipt" ? clone(q) : q,
      { internalProviderCompletion: bad === "provider" ? {} : h }));
    const state = g.scope.authority(g.state()); assert.equal(state.costs.calls[t.id].status, bad === "ack" ? "accounted" : "unknown");
    await expectReject(() => g.budget.reserviere(g.request));
  }
  const stopped = setup(), st = await stopped.budget.reserviere(stopped.request);
  await stopped.budget.nichtGesendet(st, { kiNichtGesendet: true });
  assert.equal(stopped.scope.authority(stopped.state()).costs.calls[st.id].status, "not-sent"); checks++;
  await expectReject(() => stopped.budget.reserviere(stopped.request));
  const closed = setup(); closed.closeScope(); await expectReject(() => closed.budget.reserviere(closed.request));
  async function completeSyntheticD(g) {
    const ticket = await g.budget.reserviere(g.request); A.send(g.state(), ticket, H.at);
    await g.budget.abschliessen(ticket, g.mintUsage(ticket), { internalProviderCompletion: g.mintProvider(ticket) });
  }
  const r6000 = setup(); await completeSyntheticD(r6000);
  const rTicket = r6000.seedReviewedRTicket(); assert.equal(rTicket.maxOutputTokens, 6000); assert.equal(rTicket.reserved, 88000);
  A.send(r6000.state(), rTicket, H.at);
  const rReceipt = r6000.mintUsage(rTicket, { promptTokens: 272000, completionTokens: 6000, totalTokens: 278000,
    estimatedCost: r6000.budget.tokenCost(272000, 6000) / 1e6 });
  await r6000.budget.abschliessen(rTicket, rReceipt); assert.equal(r6000.scope.authority(r6000.state()).costs.calls[rTicket.id].cost, 88000); checks++;
  for (const output of [3001, 6000]) {
    const g = setup(), t = await g.budget.reserviere(g.request); A.send(g.state(), t, H.at);
    const q = g.mintUsage(t, { completionTokens: output, totalTokens: 10 + output,
      estimatedCost: g.budget.tokenCost(10, output) / 1e6 });
    await expectReject(() => g.budget.abschliessen(t, q, { internalProviderCompletion: g.mintProvider(t) }));
    assert.equal(g.scope.authority(g.state()).costs.calls[t.id].status, "unknown");
  }
  const tooLargeR = setup(); await completeSyntheticD(tooLargeR);
  const tooLargeRTicket = tooLargeR.seedReviewedRTicket(); A.send(tooLargeR.state(), tooLargeRTicket, H.at);
  await expectReject(() => tooLargeR.budget.abschliessen(tooLargeRTicket, tooLargeR.mintUsage(tooLargeRTicket,
    { completionTokens: 6001, totalTokens: 6011, estimatedCost: Math.ceil((275 * 10 + 2200 * 6001) / 1000) / 1e6 })));
  assert.equal(tooLargeR.scope.authority(tooLargeR.state()).costs.calls[tooLargeRTicket.id].status, "unknown");
  // The shared dispatch must reject local JSON selectors outside their scope,
  // before touching any legacy storage or caller-supplied dependency.
  const K = require("../lib/helmut/testkosten-budget");
  await expectReject(() => K.reserviere(c.request, { storage: { readAuthStore() { throw Error("UNEXPECTED legacy storage"); } } }), /budget-scope-required/);
  await expectReject(() => K.abschliessen(ticket, receipt), /budget-scope-required/);
  assert.equal(R.readReceipt, undefined); checks++;
  console.log(JSON.stringify({ pass: true, scope: "SYNTHETIC_LOCAL_UNIT_BUDGET_DSTORE_ONLY", checks,
    nativeExecution: false, sourceOriginalQualification: false, providerCalls: 0 }));
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
