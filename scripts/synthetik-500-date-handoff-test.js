"use strict";
// Fictional offline integration only. Mocked snapshot branding is NOT a genuine
// B2 proof or a requalification of any of the accepted 500 profiles.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const Dates = require("../lib/helmut/synthetik-500-date-binding");
const T = require("../lib/helmut/synthetik-500-lage-input");
const Q = require("../lib/helmut/lage-quellenbeleg");
const H = require("../lib/helmut/blocker2-d-historical-binding");
const Adapter = require("../lib/helmut/synthetik-500-production-adapter");
const START = "2026-10-12T06:00:00.000Z", END = "2026-10-12T15:00:00.000Z";
const CAPTURE = "2026-10-11T04:00:00.000Z";
const plan = { startsAtUTC: START, endsAtUTC: END,
  routeContract: { version: EU.ROUTE_VERSION, serviceContractHash: EU.HASH } };
const d = { profile: { id: "fictional-only" }, briefingDatum: CAPTURE,
  briefingEingabe: { version: 2, eingabe: { tag: "2026-10-11" },
    acceptedSnapshot: { leaf: { capturedAtUTC: CAPTURE } } } };
let groups = 0;
const test = async (name, fn) => { await fn(); groups++; console.log("PASS " + name); };
const noNet = () => { throw Error("date handoff integration forbids network"); };
global.fetch = require("node:https").request = require("node:http").request = noNet;
(async () => {
  await test("opaque token binds real execution window without rewriting original bytes", () => {
    const oldDate = global.Date, before = P.hash(d), clock = { value: START };
    global.Date = class extends oldDate {
      constructor(...args) { super(...(args.length ? args : [clock.value])); }
      static now() { return oldDate.parse(clock.value); }
    };
    try {
      const token = T.create(d, plan), value = T.read(token, d.profile);
      assert.equal(value.briefingDatum, CAPTURE);
      assert.equal(value.dateBinding.executionDay, "2026-10-12");
      assert.equal(value.dateBinding.startsAtUTC, START);
      assert.throws(() => T.read(structuredClone(token), d.profile), /forged/);
      assert.throws(() => T.read(value, d.profile), /forged/);
      assert.throws(() => T.read(token, { id: "other" }), /profile-drift/);
      clock.value = END;
      assert.throws(() => T.read(token, d.profile), /synthetik500-date-binding-/);
      // Legacy token contract keeps its original behavior; no new replay right.
      const legacy = T.read(T.create(d), d.profile);
      assert.equal(legacy.dateBinding, null); assert.equal(legacy.briefingDatum, CAPTURE);
      assert.equal(P.hash(d), before);
    } finally { global.Date = oldDate; }
  });
  await test("JSON time binding does not bypass original Merkle membership", () => {
    const binding = Dates.bind(d, plan);
    assert.throws(() => H.verify(d.briefingEingabe, d.profile, d.profile.id, new Date(CAPTURE)), /historical-binding-/);
    assert.throws(() => Q.kennzeichneAufnahme([], binding), /historical-binding-snapshot-token/);
  });
  await test("captured ordinary sources remain dated background in both D and R", () => {
    const ko = { vorgang_id: "fixture-vg" }, source = { title: "Fiktive damalige Beratung",
      summary: "Eine Beratung war vorgesehen.", source_name: "Offlinefixture",
      url: "https://example.org/fictional-source", published_at: "2026-10-10T12:00:00.000Z" };
    const kos = [ko], sources = { "fixture-vg": [source] }, before = P.hash({ kos, sources });
    const snapshot = Object.freeze({}), originals = { assertProjection: H.assertProjection, metadata: H.metadata };
    // Simulate ONLY the post-proof interface for the new projection wiring.
    H.assertProjection = (s, k, q) => {
      assert.equal(s, snapshot); assert.equal(P.hash({ kos: k, sources: q }), before);
    };
    H.metadata = s => { assert.equal(s, snapshot); return { version: H.VERSION,
      sourceCaptureUTC: CAPTURE, inputHash: P.hash("fictional-input") }; };
    try {
      const plain = Q.baueEingabe(kos, sources, new Date(CAPTURE), {});
      const labeled = Q.kennzeichneAufnahme(plain, snapshot);
      assert.deepEqual(labeled.map(x => x.quellenbelege), plain.map(x => x.quellenbelege));
      assert.equal(labeled[0].quellenbelege[0].veroeffentlichtAm, source.published_at);
      assert.equal(labeled[0].historischerKontext.sourceCaptureUTC, CAPTURE);
      assert(JSON.stringify(labeled).length <= Q.MAX_EINGABE_ZEICHEN);
      const D = require("../lib/helmut/ai").buildLageBriefingPrompt(labeled, d.profile, { briefingDatum: START });
      const R = require("../lib/helmut/lage-textqualitaet").prompt([], labeled, d.profile);
      assert(D.includes(Q.HISTORICAL_RULE) && R.includes(Q.HISTORICAL_RULE));
      assert(D.includes(START), "D request uses the admitted stable run start");
      assert(D.includes(source.published_at));
      assert.equal(P.hash({ kos, sources }), before);
      // A historical label grants no wider ordinary-source date window.
      const old = { "fixture-vg": [{ ...source, published_at: "2026-09-20T12:00:00.000Z" }] };
      H.assertProjection = s => assert.equal(s, snapshot);
      assert.deepEqual(Q.kennzeichneAufnahme(Q.baueEingabe(kos, old, new Date(CAPTURE), {}), snapshot), []);
      const over = [{ ...plain[0], extra: "x".repeat(Q.MAX_EINGABE_ZEICHEN) }];
      const overHash = P.hash(over);
      assert.throws(() => Q.kennzeichneAufnahme(over, snapshot), /aufnahme-kontext-budget/);
      assert.equal(P.hash(over), overHash, "oversize must fail without dropping a selected source");
    } finally { Object.assign(H, originals); }
  });
  await test("native D/R evidence lookup uses execution day; legacy keeps source day", async () => {
    const path = require.resolve("../lib/helmut/storage"), previous = require.cache[path], ids = [];
    require.cache[path] = { id: path, filename: path, loaded: true, exports: {
      getLageEntwurfsbeleg: async (owner, id) => { ids.push(id); return { payload: { phase: id.endsWith("entwurf") ? "entwurf" : "pruefung" } }; },
      readAuthStore: async () => ({ synthetik500KostenAdmission: { planHash: P.hash(plan), consumed: {}, draftCompletions: {}, reviewBindings: {} } })
    } };
    try {
      const command = { version: "helmut-synthetik500-production-command/2-direct", mode: "D-R-500",
        slot: { plan: { ...plan, runId: "nachlauf500-123456" }, planHash: P.hash(plan) },
        drafts: [d], units: [{ intentIds: [] }] };
      await Adapter.directArtifacts(command, 0, true);
      assert(ids.length === 2 && ids.every(id => id.includes("-2026-10-12-")));
      ids.length = 0; command.slot.plan.routeContract = null;
      await Adapter.directArtifacts(command, 0, true);
      assert(ids.every(id => id.includes("-2026-10-11-")));
    } finally { if (previous) require.cache[path] = previous; else delete require.cache[path]; }
  });
  console.log("date handoff: " + groups + " offline groups; no actual source acceptance or Production call");
})().catch(error => { console.error(error); process.exitCode = 1; });
