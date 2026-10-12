"use strict";

// Pure administrative proposal for the FIRST EU500 day's budget book only.
// No ENV, clock, storage, reservation, RPC, sender, authority or activation.
// PostgreSQL must independently recompute and lock the genuine native state.
const K = require("./testkosten-budget");
const EU = require("./synthetik-500-eu-service-contract");
const P = require("./synthetik-500-profile");
const KO = require("./knowledge-object-version");
const VERSION = "helmut-synthetik500-eu-current-daybook-init/1";
const INPUT_VERSION = "helmut-synthetik500-eu-current-daybook-init-input/1";
const RPC_NAME = "helmut_synthetik500_eu_daybook_init";
const object = x => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (x, keys) => object(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const same = (a, b) => P.hash(a) === P.hash(b);
const md5 = x => typeof x === "string" && /^[a-f0-9]{32}$/.test(x);
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const fail = code => { throw Error("synthetik500-eu-daybook-init-" + code); };
const requireThat = (ok, code) => { if (!ok) fail(code); };
function utc(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function day(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00.000Z"))
    && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
}
function metadata(m, nowUTC) {
  requireThat(exact(m, ["expectedDeployment", "observedDeployment", "observedAtUTC",
    "expectedNativeFingerprints", "observedNativeFingerprints"]), "metadata-shape");
  for (const d of [m.expectedDeployment, m.observedDeployment])
    requireThat(exact(d, ["productionCommit", "deploymentId", "deploymentHost", "budgetSourceSHA256", "serviceContractHash"])
      && typeof d.productionCommit === "string" && /^[a-f0-9]{40}$/.test(d.productionCommit)
      && typeof d.deploymentId === "string" && /^dpl_[A-Za-z0-9]{1,100}$/.test(d.deploymentId)
      && typeof d.deploymentHost === "string" && d.deploymentHost.length <= 253
      && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/.test(d.deploymentHost)
      && sha(d.budgetSourceSHA256) && d.serviceContractHash === EU.HASH, "deployment-source-binding");
  requireThat(same(m.expectedDeployment, m.observedDeployment), "deployment-source-drift");
  requireThat(utc(m.observedAtUTC) && Date.parse(nowUTC) >= Date.parse(m.observedAtUTC)
    && Date.parse(nowUTC) - Date.parse(m.observedAtUTC) <= 60000, "snapshot-time-unbound");
  for (const f of [m.expectedNativeFingerprints, m.observedNativeFingerprints])
    requireThat(exact(f, ["authMD5", "mainMD5", "profilesMD5"])
      && md5(f.authMD5) && md5(f.mainMD5) && md5(f.profilesMD5), "native-fingerprint-shape");
  requireThat(same(m.expectedNativeFingerprints, m.observedNativeFingerprints), "native-fingerprint-drift");
}
function prepare(input) {
  KO.jsonValue(input);
  requireThat(exact(input, ["version", "day", "nowUTC", "budgetProjection", "counter", "metadata"])
    && input.version === INPUT_VERSION && utc(input.nowUTC) && day(input.day)
    && input.day === input.nowUTC.slice(0, 10), "actual-current-UTC-day-required");
  metadata(input.metadata, input.nowUTC);
  requireThat(exact(input.counter, ["ok", "tag", "used"]) && input.counter.ok === true
    && input.counter.tag === input.day && Number.isSafeInteger(input.counter.used)
    && input.counter.used >= 0 && input.counter.used <= 714, "genuine-current-day-counter-required");
  requireThat(exact(input.budgetProjection, [K.KEY, K.AUFTRAG_KEY, "llmUsage"])
    && object(input.budgetProjection[K.KEY]) && object(input.budgetProjection[K.AUFTRAG_KEY])
    && Array.isArray(input.budgetProjection.llmUsage), "safe-budget-projection-required");
  const before = structuredClone(input.budgetProjection);
  const books = before[K.KEY], order = before[K.AUFTRAG_KEY], count = Object.keys(books).length;
  requireThat(K.euOrder(order) && order.id === EU.CONTRACT.orderId
    && order.abTag === EU.CONTRACT.orderSinceUTC && order.limit === EU.ORDER_MICRO_USD
    && order.privateReserveMicroUSD === EU.PRIVATE_MICRO_USD && order.runDayUTC === null
    && order.serviceContractHash === EU.HASH && Number.isSafeInteger(order.bookCapacity), "known-EU-unbound-order-required");
  requireThat(input.day >= EU.CONTRACT.orderSinceUTC && input.day <= EU.CONTRACT.lastOrderUTCDate
    && Date.parse(input.nowUTC) >= Date.parse(EU.CONTRACT.priceStartsUTC)
    && Date.parse(input.nowUTC) <= Date.parse(EU.CONTRACT.priceEndsUTC), "EU-order-price-period-required");
  requireThat(count > 0 && count <= EU.MAX_BOOKS, "book-inventory-unbound");
  const present = Object.hasOwn(books, input.day), targetCapacity = present ? count : count + 1;
  requireThat(targetCapacity <= EU.MAX_BOOKS
    && (present ? order.bookCapacity === count
      : order.bookCapacity === count || order.bookCapacity === count + 1), "exact-minimum-capacity-required");
  for (const [d, book] of Object.entries(books)) {
    requireThat(day(d) && d <= input.day, "historical-book-date-unbound");
    K.pruefeTag(book, d);
    K.kontrolliere(before, d);
    requireThat(!Object.values(book.calls).some(c => K.euCall(c)
      && ["reserviert", "ungeklaert"].includes(c.status)), "prior-EU-reservation-unsettled");
  }
  // Existing unmodified budget law: billable count must equal the native raw
  // counter; skipped records remain non-billable only with all required zeros.
  const baseline = K.historie(before, input.day, input.counter.used);
  requireThat(Number.isSafeInteger(baseline) && baseline >= 0, "history-baseline-unbound");
  const book = { version: EU.DAY_VERSION, day: input.day, tarif: EU.RATE_ID,
    limit: EU.DAY_MICRO_USD, serviceContractHash: EU.HASH, spent: baseline,
    baseline, baselineCalls: input.counter.used, manualCalls: 0, manualUntil: null,
    calls: {}, frozen: null };
  if (present) requireThat(same(books[input.day], book), "existing-book-not-pristine-EU-init");
  const after = structuredClone(before);
  if (!present) {
    after[K.KEY][input.day] = structuredClone(book);
    after[K.AUFTRAG_KEY].bookCapacity = targetCapacity;
  }
  const opening = K.auftragsStand(after, input.day);
  // Faithfully calculated nonzero history is declined; never replace it with0.
  // The initializer is narrower than the general daily budget lifecycle.
  try { EU.assertOpening({ dayOtherMicroUSD: baseline, cumulativeMicroUSD: opening.gebundenMicroUsd }); }
  catch (error) { error.calculatedBaselineMicroUSD = baseline; throw error; }
  const start = K.pruefeStart(after, input.day, input.counter);
  requireThat(start.startklar === true && start.tagesbuchVorhanden === true
    && start.offeneReservierungen === 0 && start.limitUsd === EU.DAY_MICRO_USD / 1e6
    && after[K.AUFTRAG_KEY].runDayUTC === null, "planned-pristine-start-policy-unbound");
  requireThat(same(before.llmUsage, after.llmUsage)
    && same({ ...order, bookCapacity: targetCapacity }, after[K.AUFTRAG_KEY])
    && Object.keys(books).every(d => same(books[d], after[K.KEY][d])), "preserved-budget-state-drift");
  const native = input.metadata.expectedNativeFingerprints;
  return { version: VERSION, plannedStatus: present ? "already-present" : "initialized",
    day: input.day, plannedBook: structuredClone(book), writeRequired: !present,
    administrativeDelta: present ? null : {
      insertBook: { path: [K.KEY, input.day], value: structuredClone(book) },
      capacity: order.bookCapacity === targetCapacity ? null
        : { path: [K.AUFTRAG_KEY, "bookCapacity"], from: order.bookCapacity, to: targetCapacity },
      runDayUTC: { from: null, to: null, changed: false } },
    canonicalPins: { scope: "safe-budget-projection-only-not-whole-native-auth",
      beforeBudgetProjectionSHA256: P.hash(before), afterBudgetProjectionSHA256: P.hash(after),
      beforeBooksAndOrderSHA256: P.hash({ days: books, order }),
      afterBooksAndOrderSHA256: P.hash({ days: after[K.KEY], order: after[K.AUFTRAG_KEY] }),
      unchangedUsageSHA256: P.hash(before.llmUsage) },
    nativeExpectedFingerprints: structuredClone(native),
    nativeAfterAuthMD5: null,
    sourceDeploymentMetadata: structuredClone(input.metadata.observedDeployment),
    rpc: { schema: "public", name: RPC_NAME, authenticatedRoleRequired: "service_role",
      args: { p_day: input.day, p_expected_auth_md5: native.authMD5,
        p_expected_main_md5: native.mainMD5, p_expected_profiles_md5: native.profilesMD5,
        p_expected_counter_used: input.counter.used, p_expected_baseline_micro_usd: baseline },
      expectedResultStatus: present ? "already-present" : "initialized",
      nativeRecomputationAndAtomicLocksRequired: true },
    preserved: { historicalBooks: true, usage: true, callsAndUnknownLegacyU: true,
      privateReserveMicroUSD: EU.PRIVATE_MICRO_USD, serviceContractHash: EU.HASH,
      limits: true, runDayUTC: null, journalControlSourceRootAndProfiles: "outside-this-projection-no-update-planned" },
    afterBudgetProjection: after,
    actualRootAuthority: null, atomicityProven: false, credentialUsabilityProven: false,
    actual500Ready: false, paidTestGo: false, paidRunDayAuthorityGranted: false,
    storageCalls: 0, rpcCalls: 0, modelCalls: 0, productionWrites: 0,
    reservationsCreated: 0, profilesActivated: false, commandsInstalled: false };
}
module.exports = { VERSION, INPUT_VERSION, RPC_NAME, prepare };
