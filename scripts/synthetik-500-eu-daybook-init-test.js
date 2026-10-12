"use strict";
// Focused pure initializer tests. Fictional metadata/budget records only.
// No HTTP, database, provider, credentials, activation, old suite or writer.
const assert = require("node:assert/strict");
const K = require("../lib/helmut/testkosten-budget");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const P = require("../lib/helmut/synthetik-500-profile");
const Init = require("../lib/helmut/synthetik-500-eu-daybook-init");
const DAY = "2026-10-13", NOW = DAY + "T05:00:00.000Z";
const clone = structuredClone;
function legacyBook(day) {
  return { version: 2, day, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 6000000,
    spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
}
function euBook(day, baseline = 0, calls = 0) {
  return { version: EU.DAY_VERSION, day, tarif: EU.RATE_ID, limit: EU.DAY_MICRO_USD,
    serviceContractHash: EU.HASH, spent: baseline, baseline, baselineCalls: calls,
    manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
}
function fixture(present = false) {
  const books = {};
  for (let t = Date.parse("2026-09-09T00:00:00.000Z"); t < Date.parse(DAY + "T00:00:00.000Z"); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10); books[day] = legacyBook(day);
  }
  // Known historic cost plus a protected LEGACY unknown-U reservation.
  // Held unknown cost remains in the cumulative bound, never erased/refunded.
  books[EU.CONTRACT.orderSinceUTC].baseline = 1402061;
  books[EU.CONTRACT.orderSinceUTC].spent = 1402061;
  books["2026-10-06"].calls.historicUnknownU = { status: "ungeklaert", reserved: 212000,
    maxOutputTokens: 3000, manual: false, createdAt: "2026-10-06T12:00:00.000Z",
    marker: "Fictional protected legacy unknown U; never retried or cleared" };
  books["2026-10-06"].frozen = "test-usd-ausgang-unklar";
  if (present) books[DAY] = euBook(DAY);
  const deployment = { productionCommit: "c".repeat(40), deploymentId: "dpl_Offline",
    deploymentHost: "helmut-offline.vercel.app", budgetSourceSHA256: "b".repeat(64), serviceContractHash: EU.HASH };
  const fingerprints = { authMD5: "a".repeat(32), mainMD5: "b".repeat(32), profilesMD5: "c".repeat(32) };
  return { version: Init.INPUT_VERSION, day: DAY, nowUTC: NOW,
    budgetProjection: { [K.KEY]: books, [K.AUFTRAG_KEY]: { version: EU.ORDER_VERSION,
      id: EU.CONTRACT.orderId, abTag: EU.CONTRACT.orderSinceUTC, limit: EU.ORDER_MICRO_USD,
      externGebunden: 5195303, serviceContractHash: EU.HASH, privateReserveMicroUSD: EU.PRIVATE_MICRO_USD,
      bookCapacity: Object.keys(books).length, runDayUTC: null },
      llmUsage: [{ createdAt: "2026-10-06T12:00:00.000Z", model: "gpt-5-mini", success: false,
        promptTokens: 400000, completionTokens: 3000, totalTokens: 403000, estimatedCost: 0.212 }] },
    counter: { ok: true, tag: DAY, used: 0 },
    metadata: { expectedDeployment: clone(deployment), observedDeployment: clone(deployment),
      observedAtUTC: DAY + "T04:59:59.000Z", expectedNativeFingerprints: clone(fingerprints),
      observedNativeFingerprints: clone(fingerprints) } };
}
function billable(prompt = 0, output = 0) {
  return { createdAt: DAY + "T04:55:00.000Z", model: EU.CONTRACT.model, success: true,
    promptTokens: prompt, completionTokens: output, totalTokens: prompt + output, estimatedCost: 0 };
}
function skipped() {
  return { createdAt: DAY + "T04:55:00.000Z", keinAufruf: true, success: false,
    callType: "skipped-budget", model: "none", estimatedCost: 0,
    promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
function freeze(x) {
  if (x && typeof x === "object") { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
  return x;
}
function main() {
  let passed = 0;
  const checks = [];
  const check = (name, fn) => { fn(); passed++; checks.push(name); };
  const rejected = (name, change, pattern, present = false) => check(name, () => {
    const input = fixture(present); change(input); const before = P.hash(input);
    assert.throws(() => Init.prepare(input), error => pattern.test(error.message));
    assert.equal(P.hash(input), before, "Rejected proposals must not mutate any input");
  });
  check("missing-current-book adds exactminimum-capacity and no paid authority", () => {
    const input = freeze(fixture()), before = P.hash(input), result = Init.prepare(input);
    assert.equal(Object.keys(input.budgetProjection[K.KEY]).length, 34);
    assert.equal(result.plannedStatus, "initialized"); assert.equal(result.writeRequired, true);
    assert.deepEqual(result.plannedBook, euBook(DAY));
    assert.deepEqual(result.administrativeDelta.capacity, { path: [K.AUFTRAG_KEY, "bookCapacity"], from: 34, to: 35 });
    assert.equal(result.afterBudgetProjection[K.AUFTRAG_KEY].runDayUTC, null);
    assert.equal(result.afterBudgetProjection[K.AUFTRAG_KEY].bookCapacity, 35);
    assert.equal(P.hash(input), before);
    assert.equal(result.atomicityProven, false); assert.equal(result.actualRootAuthority, null);
    assert.equal(result.actual500Ready, false); assert.equal(result.paidTestGo, false);
    assert.equal(result.paidRunDayAuthorityGranted, false); assert.equal(result.rpcCalls, 0);
    assert.equal(result.storageCalls, 0); assert.equal(result.modelCalls, 0); assert.equal(result.productionWrites, 0);
  });
  check("minimum-already-provisioned preservescapacity without lowering", () => {
    const input = fixture(); input.budgetProjection[K.AUFTRAG_KEY].bookCapacity = 35;
    const result = Init.prepare(input); assert.equal(result.administrativeDelta.capacity, null);
    assert.equal(result.afterBudgetProjection[K.AUFTRAG_KEY].bookCapacity, 35);
  });
  check("existing-pristine-current-EUbook is no-write idempotent", () => {
    const input = freeze(fixture(true)), result = Init.prepare(input);
    assert.equal(result.plannedStatus, "already-present"); assert.equal(result.writeRequired, false);
    assert.equal(result.administrativeDelta, null);
    assert.equal(result.canonicalPins.beforeBudgetProjectionSHA256, result.canonicalPins.afterBudgetProjectionSHA256);
    assert.deepEqual(result.afterBudgetProjection, input.budgetProjection);
  });
  check("all-historic-books-usage-and-legacy-unknownU preserved byteforbyte", () => {
    const input = fixture(), result = Init.prepare(input);
    for (const [day, book] of Object.entries(input.budgetProjection[K.KEY]))
      assert.deepEqual(result.afterBudgetProjection[K.KEY][day], book);
    assert.deepEqual(result.afterBudgetProjection.llmUsage, input.budgetProjection.llmUsage);
    assert.equal(result.afterBudgetProjection[K.KEY]["2026-10-06"].calls.historicUnknownU.status, "ungeklaert");
    assert.equal(result.afterBudgetProjection[K.KEY]["2026-10-06"].frozen, "test-usd-ausgang-unklar");
    assert.equal(K.auftragsStand(result.afterBudgetProjection, DAY).gebundenMicroUsd, EU.OPENING_MICRO_USD);
  });
  check("nativeRPC contains six scalar expected arguments, not uploadedauth or JS atomicity flag", () => {
    const result = Init.prepare(fixture());
    assert.equal(result.rpc.schema, "public"); assert.equal(result.rpc.name, "helmut_synthetik500_eu_daybook_init");
    assert.deepEqual(result.rpc.args, { p_day: DAY, p_expected_auth_md5: "a".repeat(32),
      p_expected_main_md5: "b".repeat(32), p_expected_profiles_md5: "c".repeat(32),
      p_expected_counter_used: 0, p_expected_baseline_micro_usd: 0 });
    assert.equal(result.rpc.nativeRecomputationAndAtomicLocksRequired, true);
    assert.equal(result.nativeAfterAuthMD5, null);
    assert.equal(result.canonicalPins.scope, "safe-budget-projection-only-not-whole-native-auth");
  });
  check("skipped-records preserved without fabricatedbillablecounter", () => {
    const input = fixture(); input.budgetProjection.llmUsage.push(skipped());
    const result = Init.prepare(input); assert.equal(result.plannedBook.baselineCalls, 0);
    assert.deepEqual(result.afterBudgetProjection.llmUsage, input.budgetProjection.llmUsage);
  });
  check("genuine zero-token billable-count boundary714", () => {
    const input = fixture(); input.counter.used = 714;
    for (let i = 0; i < 714; i++) input.budgetProjection.llmUsage.push(billable());
    const result = Init.prepare(input); assert.equal(result.plannedBook.baselineCalls, 714);
    assert.equal(result.plannedBook.baseline, 0);
  });
  check("nonzero genuinehistory computed faithfully then declined without zeroing", () => {
    const input = fixture(); input.counter.used = 1; input.budgetProjection.llmUsage.push(billable(1000, 100));
    assert.equal(K.historie(input.budgetProjection, DAY, 1), 900);
    const before = P.hash(input);
    assert.throws(() => Init.prepare(input), error => error.message === "synthetik500-eu-fresh-opening-not-financed"
      && error.calculatedBaselineMicroUSD === 900);
    assert.equal(P.hash(input), before);
  });
  rejected("futureday refused", x => { x.day = "2026-10-14"; x.counter.tag = x.day; }, /actual-current-UTC-day-required/);
  rejected("pastday refused", x => { x.day = "2026-10-12"; x.counter.tag = x.day; }, /actual-current-UTC-day-required/);
  rejected("counterday mismatch", x => { x.counter.tag = "2026-10-12"; }, /genuine-current-day-counter-required/);
  rejected("counterunknown", x => { x.counter.ok = false; }, /genuine-current-day-counter-required/);
  rejected("counterabove714", x => { x.counter.used = 715; }, /genuine-current-day-counter-required/);
  rejected("fractionalcounter", x => { x.counter.used = 0.5; }, /genuine-current-day-counter-required/);
  rejected("negativecounter", x => { x.counter.used = -1; }, /genuine-current-day-counter-required/);
  rejected("history-counter countgap", x => { x.counter.used = 1; }, /test-usd-historie-unvollstaendig/);
  rejected("unknownhistory model", x => { const r = billable(); r.model = "gpt-5.5"; x.budgetProjection.llmUsage.push(r); x.counter.used = 1; }, /test-usd-historie-unvollstaendig/);
  rejected("unknownhistory tokenmoney", x => { const r = billable(); delete r.promptTokens; x.budgetProjection.llmUsage.push(r); x.counter.used = 1; }, /test-usd-token-unbekannt/);
  rejected("fractionalhistory tokens", x => { x.budgetProjection.llmUsage.push(billable(0.5)); x.counter.used = 1; }, /test-usd-token-unbekannt/);
  rejected("skipped-success ambiguity", x => { const r = skipped(); r.success = true; x.budgetProjection.llmUsage.push(r); }, /test-usd-historie-unvollstaendig/);
  rejected("skipped-token ambiguity", x => { const r = skipped(); r.totalTokens = 1; x.budgetProjection.llmUsage.push(r); }, /test-usd-historie-unvollstaendig/);
  rejected("legacyorder refuses auto-upgrade", x => { x.budgetProjection[K.AUFTRAG_KEY].version = 4; }, /known-EU-unbound-order-required/);
  rejected("higherorderlimit refused", x => { x.budgetProjection[K.AUFTRAG_KEY].limit++; }, /known-EU-unbound-order-required/);
  rejected("private636000 reserve cannot change", x => { x.budgetProjection[K.AUFTRAG_KEY].privateReserveMicroUSD = 0; }, /known-EU-unbound-order-required/);
  rejected("runDay authorization cannot be supplied", x => { x.budgetProjection[K.AUFTRAG_KEY].runDayUTC = DAY; }, /known-EU-unbound-order-required/);
  rejected("unknownextraorder field", x => { x.budgetProjection[K.AUFTRAG_KEY].extraAllowance = 1; }, /test-usd-auftrag-unlesbar/);
  rejected("highercapacity refused", x => { x.budgetProjection[K.AUFTRAG_KEY].bookCapacity += 2; }, /exact-minimum-capacity-required/);
  rejected("no forty-eighth book allowance", x => {
    for (let i = 0; i < 13; i++) { const d = new Date(Date.parse("2026-09-08T00:00:00.000Z") - i * 86400000).toISOString().slice(0, 10); x.budgetProjection[K.KEY][d] = legacyBook(d); }
    x.budgetProjection[K.AUFTRAG_KEY].bookCapacity = 47;
  }, /exact-minimum-capacity-required/);
  rejected("lowercapacity refused", x => { x.budgetProjection[K.AUFTRAG_KEY].bookCapacity--; }, /exact-minimum-capacity-required/);
  rejected("unknowncapacity refused", x => { x.budgetProjection[K.AUFTRAG_KEY].bookCapacity = null; }, /known-EU-unbound-order-required/);
  rejected("existingbook highercapacity is not no-op", x => { x.budgetProjection[K.AUFTRAG_KEY].bookCapacity++; }, /exact-minimum-capacity-required/, true);
  rejected("existinglegacy-daybook refusesconversion", x => { x.budgetProjection[K.KEY][DAY] = legacyBook(DAY); }, /existing-book-not-pristine-EU-init/, true);
  rejected("existingticketed-daybook refusesreinterpretation", x => {
    const b = x.budgetProjection[K.KEY][DAY]; b.calls.settled = { status: "abgerechnet", reserved: 81400,
      maxOutputTokens: 3000, manual: false, createdAt: NOW, cost: 0, contractHash: EU.HASH, tarif: EU.RATE_ID };
  }, /existing-book-not-pristine-EU-init/, true);
  rejected("existingfrozendaybook refusesreset", x => { x.budgetProjection[K.KEY][DAY].frozen = "test-usd-ausgang-unklar"; }, /existing-book-not-pristine-EU-init/, true);
  rejected("historical orderday gap cannot become free", x => { delete x.budgetProjection[K.KEY]["2026-09-26"]; }, /test-usd-buch-unlesbar/);
  rejected("futurebook seeded state refused", x => { x.budgetProjection[K.KEY]["2026-10-14"] = legacyBook("2026-10-14"); x.budgetProjection[K.AUFTRAG_KEY].bookCapacity++; }, /historical-book-date-unbound/);
  rejected("priorEUunknown remainsblocked not cleared", x => {
    const b = euBook("2026-10-07"); b.calls.pending = { status: "ungeklaert", reserved: 81400,
      maxOutputTokens: 3000, manual: false, createdAt: "2026-10-07T12:00:00.000Z", contractHash: EU.HASH, tarif: EU.RATE_ID };
    b.frozen = "test-usd-ausgang-unklar"; x.budgetProjection[K.KEY][b.day] = b;
  }, /prior-EU-reservation-unsettled/);
  rejected("cumulativeopening increase refused", x => { x.budgetProjection[K.AUFTRAG_KEY].externGebunden++; }, /synthetik500-eu-fresh-opening-not-financed/);
  rejected("post-orderday refused", x => { x.day = "2026-10-26"; x.nowUTC = x.day + "T05:00:00.000Z"; x.counter.tag = x.day; x.metadata.observedAtUTC = x.day + "T04:59:59.000Z"; }, /EU-order-price-period-required/);
  rejected("deployment drift cannot be metadata-admitted", x => { x.metadata.observedDeployment.productionCommit = "d".repeat(40); }, /deployment-source-drift/);
  rejected("source drift cannot be metadata-admitted", x => { x.metadata.observedDeployment.budgetSourceSHA256 = "d".repeat(64); }, /deployment-source-drift/);
  rejected("native auth fingerprintdrift", x => { x.metadata.observedNativeFingerprints.authMD5 = "d".repeat(32); }, /native-fingerprint-drift/);
  rejected("old native snapshot timestamp", x => { x.metadata.observedAtUTC = DAY + "T04:58:59.000Z"; }, /snapshot-time-unbound/);
  rejected("safe projection cannot pretend to be full auth", x => { x.budgetProjection.synthetik500DispatchJournal = { oldUnknown: true }; }, /safe-budget-projection-required/);
  check("no reservedticket or modelwriter dependency called", () => {
    const originals = Object.fromEntries(["reserviere", "abschliessen", "nichtGesendet"].map(k => [k, K[k]]));
    for (const key of Object.keys(originals)) K[key] = () => { throw Error("forbidden-writer-call"); };
    try { const result = Init.prepare(fixture()); assert.equal(result.reservationsCreated, 0); }
    finally { for (const [key, fn] of Object.entries(originals)) K[key] = fn; }
  });
  console.log(JSON.stringify({ pureInitializerChecksPassed: passed, checks,
    networkRequests: 0, databaseCalls: 0, modelCalls: 0, productionWrites: 0, profilesActivated: false,
    limitation: "Fictional pure proposals; native atomicity and authorization are not established" }));
  return passed;
}
if (require.main === module) main();
module.exports = { fixture, main };
