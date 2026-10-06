"use strict";

// Neue Plan3/KO60-Faelle, nur fiktive Originals und Transportattrappen.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const KO = require("../lib/helmut/knowledge-object-version");
const W = require("../lib/helmut/synthetik-500-w-inventar");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const U = require("../lib/helmut/understanding");
const identity = require("../lib/helmut/vorgang-identity");
const storage = require("../lib/helmut/storage");
const { fixture } = require("./synthetik-500-kosten-plan-test");
const paket = P.erzeuge(), copy = structuredClone;
const evidence = { reference: "fictional-local-capture-only", sha256: P.hash("fictional") };
const byteHash = x => crypto.createHash("sha256").update(x, "utf8").digest("hex");
function ko(vorgangId = "fictional-cluster", index = 0) {
  return { ...Object.fromEntries(KO.VERSION_FIELDS.map(k => [k, null])), id: "fictional-ko-" + index,
    vorgang_id: vorgangId, ko_version: 1, verstehen_fencing: index + 1,
    status: "complete", understanding_status: "complete", updated_at: "2026-10-02T10:00:00.000Z" };
}
function bind(e) {
  const s = C.sourceVersions(e.documents, e.knowledgeObjects, e.clusters, e.version);
  e.understandingInputs = s.clusters.filter(c => c.requiresUnderstanding).map(c => ({ versionKey: c.key,
    contractInputHash: c.contractInputHash, requestBody: JSON.stringify({ model: "gpt-5-mini",
      input: "Fiktives U " + c.key, max_output_tokens: 3000 }), routeId: "offline-text", attemptLimit: 1 }));
  e.understandingCompleteness = { version: C.PROOF_VERSION, documentInventoryHash: P.hash(s.documents),
    knowledgeObjectInventoryHash: P.hash(s.knowledgeObjects), clusterInventoryHash: P.hash(s.clusters),
    requiredVersionKeys: s.clusters.filter(c => c.requiresUnderstanding).map(c => c.key), evidence: copy(evidence) };
  e.paidRoutes = null;
  const p = C.vorbereite(paket, e);
  e.paidRoutes = [{ id: "offline-text", provider: "azure-openai", api: "responses", deploymentId: "fictional-only",
    model: "gpt-5-mini", disposition: "aufgenommen", admittedRequestIds: [...p.phasePositions.U, ...p.phasePositions.D].map(x => x.requestId).sort(),
    priceContract: "existing-conservative-text", exclusionEvidence: null }];
  return e;
}
function inputs(multi = true) {
  const e = fixture(false, multi); e.version = C.ARTICLE_INPUT_VERSION;
  e.knowledgeObjects = [{ vorgangId: "fictional-cluster", koVersion: 1, version: ko() }];
  e.clusters.forEach(c => { c.artikelkontextVersuch = null; });
  return bind(e);
}
function wInputs() {
  const f = inputs(false);
  f.documents.forEach(d => { d.version = { ...Object.fromEntries(W.SOURCE_VERSION_FIELDS.map(k => [k, null])),
    id: d.id, title: "Fiktive Verkehrskonferenz Neustadt Bahnstrecken",
    summary: "Die Verkehrskonferenz in Neustadt diskutiert Bahnstrecken.", source_id: "fictional-source", source_type: "fictional-only" }; });
  f.clusters[0].documentKeys = C.sourceVersions(f.documents, null, null, f.version).documents.map(d => d.key);
  f.draftInputs.forEach(d => { d.documentKeys = [...f.clusters[0].documentKeys]; });
  return f;
}
function mappedWInputs(f) {
  const originals = copy(f.documents);
  f.documents = f.documents.map(x => ({ ...x, version: require("../lib/helmut/quellen-auszug").geleseneQuelle(copy(x.version)) }));
  f.clusters[0].documentKeys = C.sourceVersions(f.documents, null, null, f.version).documents.map(d => d.key);
  f.draftInputs.forEach(d => { d.documentKeys = [...f.clusters[0].documentKeys]; });
  return originals;
}
async function routeWFixture(routed = true) {
  const input = wInputs(); input.knowledgeObjects = [];
  const originals = mappedWInputs(input), cluster = { documents: input.documents.map(d => d.version) };
  const vorgangId = U.deriveVorgangId(cluster);
  input.clusters[0].vorgangId = vorgangId;
  const route = { version: A.ROUTE_CONTRACT_VERSION, runtimeManifestHash: input.runtimeManifestHash,
    route: { provider: "azure", responsesUrl: "https://helmut-resource.openai.azure.com/openai/v1/responses",
      model: "gpt-5-mini", productionCommit: input.productionCommit, deploymentHost: "helmut-fictional-immutable.vercel.app",
      deploymentId: "dpl_FictionalImmutable", authMode: "api-key" },
    management: { modelFamily: "gpt-5-mini", versionPolicy: "family-context-price-class-re-admit-on-contradiction",
      contextTokens: 400000, maxInputTokens: 272000, inputReserveTokens: 400000, maxOutputTokens: 128000,
      reasoningIncludedInOutput: true, inputUsdPerMillion: 0.5, outputUsdPerMillion: 4,
      validFromUTC: input.window.startUTC, validUntilUTC: input.window.endUTC,
      evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"].map(name =>
        [name, { name: "fictional-" + name, sha256: P.hash("fixture-only-" + name), bytes: 10 }])) } };
  if (routed) { input.version = C.ROUTE_INPUT_VERSION; input.routeContract = route; }
  bind(input);
  const prefixes = identity.candidatePrefixes(cluster, 3, { personengruppenAltbestand: true });
  const resolution = await U.resolveVorgang(cluster, { findVorgangCandidates: () => [], getExistingStreng: () => null });
  const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
    documents: originals, linkedDocuments: [], knowledgeObjects: [], prefixes: prefixes.length ? [{ prefixes, rows: [], evidence }] : [],
    exacts: [{ vorgangId, knowledgeObjectId: null, evidence }], links: [],
    reservations: [{ vorgangId, row: null, evidence }], memos: [{ vorgangId, row: null, evidence }],
    decisions: [{ versionKey: C.sourceVersions(input.documents, [], input.clusters, input.version).clusters[0].key,
      cluster, resolution, eligibilityEvidence: evidence }] };
  const inventoryBytes = JSON.stringify(w), capture = { reference: "fictional-route-W-original", sha256: byteHash(inventoryBytes) };
  input.understandingCompleteness.evidence = capture;
  const routeBytes = JSON.stringify(route), routeEvidence = { reference: "fictional-route-original", sha256: byteHash(routeBytes) };
  return { input, w, inventoryBytes, capture, routeBytes, routeEvidence };
}
const routeIntake = x => W.vorbereiteRoute(paket, JSON.stringify(x.input), x.inventoryBytes, x.capture, x.routeBytes, x.routeEvidence);
const rehash = slot => { slot.planHash = P.hash(slot.plan); return slot; };
const request = (slot, x) => ({ admission: { operationId: slot.plan.operationId, planHash: slot.planHash }, runId: slot.plan.runId,
  phase: null, vorgangId: x.vorgangId, contractInputHash: x.contractInputHash,
  actualRequestHash: x.actualRequestHash, model: x.model, maxOutputTokens: x.maxOutputTokens });
async function main() {
  const savedFetch = global.fetch, https = require("node:https"), http = require("node:http");
  const savedHttps = https.request, savedHttp = http.request;
  let outsideCalls = 0, passed = 0;
  const blocked = () => { outsideCalls++; throw new Error("offline-only"); };
  global.fetch = https.request = http.request = blocked;
  const only = process.argv.includes("--only") ? new RegExp(process.argv[process.argv.indexOf("--only") + 1]) : null;
  async function test(name, fn) { if (only && !only.test(name)) return; await fn(); passed++; console.log("PASS " + name); }
  try {
    const e = inputs(), plan = C.vorbereite(paket, e), slot = plan.admissionCandidate;
    await test("Input4-W-route LegacyInput3 bleibt exakt getrennt und unveraendert", async () => {
      const old = await routeWFixture(false), inputBytes = JSON.stringify(old.input), expected = C.vorbereite(paket, old.input);
      assert.deepEqual(await W.vorbereite(paket, inputBytes, old.inventoryBytes, old.capture), {
        version: W.VERSION, inputBytesSha256: byteHash(inputBytes), inventoryBytesSha256: old.capture.sha256,
        sourceBinding: expected.admissionCandidate.plan.sourceBinding, plan: expected,
        actualInputAcceptanceVerified: false, eligibilityAcceptanceVerified: false,
        primitiveAndCodecAcceptanceVerified: false, executionReady: false, installationAvailable: false });
      assert.equal(expected.admissionCandidate.plan.sourceBinding.inputVersion, C.ARTICLE_INPUT_VERSION);
      await assert.rejects(routeIntake(old), /originalinput-w-bindung/);
      const routed = await routeWFixture();
      await assert.rejects(W.vorbereite(paket, JSON.stringify(routed.input), routed.inventoryBytes, routed.capture), /originalinput-w-bindung/);
    });
    await test("Input4-W-route OriginalbyteSHA und semantischeHashes binden Input4 Plan4 Slot3", async () => {
      const x = await routeWFixture(), result = await routeIntake(x), candidate = result.plan.admissionCandidate;
      assert.equal(result.version, W.ROUTE_VERSION); assert.equal(result.plan.version, C.ROUTE_VERSION);
      assert.equal(result.inputBytesSha256, byteHash(JSON.stringify(x.input)));
      assert.equal(result.routeBinding.inputHash, P.hash(x.input));
      assert.equal(result.routeBinding.routeBytesSha256, byteHash(x.routeBytes));
      assert.equal(result.routeBinding.routeContractHash, P.hash(x.input.routeContract));
      assert.notEqual(result.routeBinding.routeBytesSha256, result.routeBinding.routeContractHash);
      assert.deepEqual(result.routeBinding.routeEvidence, x.routeEvidence);
      assert.notEqual(result.routeBinding.routeEvidence, x.routeEvidence);
      assert.equal(candidate.version, A.ROUTE_VERSION); assert.equal(candidate.plan.version, A.ROUTE_PLAN_VERSION);
      assert.equal(candidate.plan.sourceBinding.inputVersion, C.ROUTE_INPUT_VERSION);
      assert.equal(candidate.plan.sourceBinding.inputHash, P.hash(x.input));
      assert.deepEqual(candidate.plan.routeContract, x.input.routeContract);
      assert.equal(candidate.planHash, P.hash(candidate.plan)); assert.equal(result.routeBinding.admissionPlanHash, candidate.planHash);
      assert.doesNotThrow(() => C.pruefe(result.plan, paket));
      for (const key of ["actualInputAcceptanceVerified", "eligibilityAcceptanceVerified", "primitiveAndCodecAcceptanceVerified",
        "executionReady", "installationAvailable"]) assert.equal(result[key], false);
      assert.equal(result.plan.status.executionReady, false); assert.equal(result.plan.status.budgetGo, false);
    });
    await test("Input4-W-route falsche und nichtkanonische Originalbytes werden abgewiesen", async () => {
      const x = await routeWFixture();
      await assert.rejects(routeIntake({ ...x, routeEvidence: { ...x.routeEvidence, sha256: "0".repeat(64) } }), /originalroute-hash/);
      const pretty = JSON.stringify(x.input.routeContract, null, 2);
      await assert.rejects(routeIntake({ ...x, routeBytes: pretty, routeEvidence: { ...x.routeEvidence, sha256: byteHash(pretty) } }), /original-kanonisch/);
      const different = copy(x.input.routeContract); different.route.deploymentId = "dpl_OtherFictional";
      const bytes = JSON.stringify(different);
      await assert.rejects(routeIntake({ ...x, routeBytes: bytes, routeEvidence: { ...x.routeEvidence, sha256: byteHash(bytes) } }), /originalinput4-route-bindung/);
      await assert.rejects(W.vorbereiteRoute(paket, JSON.stringify(x.input, null, 2), x.inventoryBytes, x.capture,
        x.routeBytes, x.routeEvidence), /original-kanonisch/);
    });
    await test("Input4-W-route Commit Runtime und Fenster sowie fehlende Route sind geschlossen", async () => {
      const x = await routeWFixture();
      for (const mutate of [f => { f.productionCommit = "a".repeat(40); }, f => { f.runtimeManifestHash = "b".repeat(64); },
        f => { f.window.endUTC = "2026-10-02T14:00:00.000Z"; }, f => { f.routeContract = null; },
        f => { f.productionCommit = null; }, f => { f.runtimeManifestHash = null; }]) {
        const input = copy(x.input); mutate(input);
        await assert.rejects(routeIntake({ ...x, input }), /synthetik500-/);
      }
    });
    await test("Input4-W-route fehlende D-Kontexte bleiben ohne Admission oder erfundene U-only Abnahme", async () => {
      const x = await routeWFixture(); x.input.draftInputs = null; x.input.paidRoutes = null;
      const result = await routeIntake(x);
      assert.equal(result.plan.admissionCandidate, null); assert.equal(result.sourceBinding, null);
      assert.equal(result.routeBinding.admissionPlanHash, null); assert.equal(result.executionReady, false);
      assert.equal(result.actualInputAcceptanceVerified, false); assert.equal(result.plan.status.budgetGo, false);
      assert.ok(result.plan.requiredActualInputs.includes("final-profile-context-and-actual-draft-payloads"));
      assert.equal(result.plan.phasePositions.D.length, 500);
      assert.ok(result.plan.phasePositions.D.every(d => d.inputVersionHash === null && d.requestId === null));
    });
    await test("Input4-W-route falsche D-Profil und Sourcebindungen werden abgewiesen", async () => {
      const x = await routeWFixture();
      for (const mutate of [f => { f.draftInputs[0].profileHash = "0".repeat(64); },
        f => { f.draftInputs[0].documentKeys = ["f".repeat(64)]; },
        f => { f.draftInputs[0].knowledgeObjectKeys = ["e".repeat(64)]; }, f => { f.draftInputs[0].context = {}; }]) {
        const input = copy(x.input); mutate(input);
        await assert.rejects(routeIntake({ ...x, input }), /draft-input|draft-source-binding/);
      }
      const result = await routeIntake(x), candidate = result.plan.admissionCandidate;
      const u = candidate.plan.intents.find(i => i.phase === "U");
      const command = { version: require("../lib/helmut/synthetik-500-production-command").VERSION, mode: "D-R-500",
        package: paket, executor: null, slot: candidate,
        understanding: [{ intentId: u.id, cluster: copy(x.w.decisions[0].cluster),
          reads: { getExisting: {}, findVorgangCandidates: {}, listVorgangDocuments: {} },
          sources: { documents: x.w.documents.map(d => copy(d.version)), knowledgeObjects: [] }, options: {} }],
        drafts: [], predecessors: [], native: null, units: [] };
      assert.throws(() => require("../lib/helmut/synthetik-500-production-command").validate(command), /future-u-dependent-D-not-admissible/);
    });
    await test("Input4-W-route unvollstaendige W Resolver CAS und Quellenbelege bleiben abgewiesen", async () => {
      const x = await routeWFixture();
      for (const mutate of [w => { w.exacts = []; }, w => { w.reservations = []; }, w => { w.memos = []; },
        w => { w.decisions = []; }, w => { w.decisions[0].resolution.vorgangId = "fictional-foreign"; },
        w => { w.documents[0].version.title += " drift"; }]) {
        const w = copy(x.w); mutate(w); const inventoryBytes = JSON.stringify(w), capture = { ...x.capture, sha256: byteHash(inventoryBytes) };
        const input = copy(x.input); input.understandingCompleteness.evidence = capture;
        await assert.rejects(routeIntake({ ...x, input, inventoryBytes, capture }), /synthetik500-w-inventar-/);
      }
    });
    await test("KO60 hat feste60-Feldidentitaet und verlangt vollstaendige verlustfreieJSON-Werte", () => {
      assert.equal(KO.VERSION_FIELDS.length, 60);
      assert.equal(KO.FIELDSET_HASH, "74ffb7ce60c0bfeae472c37dce8ad10e9faae6300c094b2ef7a7b409150e1357");
      assert.equal(KO.VERSION_FIELDS.includes("embedding"), false);
      for (const mutate of [k => { delete k.verstehen_fencing; }, k => { k.embedding = []; },
        k => { k.verstehen_fencing = undefined; }, k => { k.verstehen_fencing = Number.MAX_SAFE_INTEGER + 1; },
        k => { k.action_items = new Array(2); }, k => { Object.defineProperty(k, "headline", { get: () => "x", enumerable: true }); }]) {
        const bad = ko(); mutate(bad); assert.throws(() => KO.pruefe(bad), /knowledge-object-version-/);
      }
      const badInput = copy(e); delete badInput.knowledgeObjects[0].version.verstehen_fencing;
      assert.throws(() => C.vorbereite(paket, badInput), /ko60-felder/);
    });
    await test("NurInput3 erzeugtPlan3 im unveraendertenSlot2 mit rekonstruiertemOriginalhash", () => {
      assert.equal(slot.version, A.REVIEW_VERSION); assert.equal(slot.plan.version, A.MULTI_U_PLAN_VERSION);
      assert.deepEqual(slot.plan.sourceBinding, { inputVersion: C.ARTICLE_INPUT_VERSION, inputHash: P.hash(e),
        projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH });
      assert.equal(Object.keys(slot.plan).length, 9); assert.equal(C.pruefe(plan, paket).planHash, plan.planHash);
      assert.equal(plan.completeness.multiVersionUAdmissionSupported, true);
      assert.equal(plan.completeness.actualInputAcceptanceVerified, false); assert.equal(plan.status.executionReady, false);
      for (const version of [C.INPUT_VERSION, C.REVIEW_INPUT_VERSION]) {
        const old = copy(e); old.version = version; old.clusters.forEach(c => { delete c.artikelkontextVersuch; }); bind(old);
        const p = C.vorbereite(paket, old); assert.equal(p.admissionCandidate, null);
        assert.equal(p.completeness.multiVersionUAdmissionSupported, false);
        assert.ok(p.requiredActualInputs.includes("central-admission-multiple-u-versions-per-vorgang"));
      }
      const one = inputs(false), p = C.vorbereite(paket, one);
      assert.equal(p.admissionCandidate.plan.version, A.MULTI_U_PLAN_VERSION);
      one.understandingCompleteness = null;
      assert.equal(C.vorbereite(paket, one).admissionCandidate, null);
    });
    await test("NeuePaar-Moduswahl gilt gleichzeitig fuerSubject und eindeutigenRequestmatch", () => {
      const us = slot.plan.intents.filter(x => x.phase === "U"), auth = { [A.KEY]: copy(slot) };
      assert.equal(us.length, 2); assert.equal(us[0].vorgangId, us[1].vorgangId);
      for (const x of us) assert.equal(A.pruefe(auth, request(slot, x), slot.plan.startsAtUTC, slot.plan.productionCommit).intentId, x.id);
      const wrong = request(slot, us[0]); wrong.contractInputHash = "f".repeat(40);
      assert.throws(() => A.pruefe(auth, wrong, slot.plan.startsAtUTC, slot.plan.productionCommit), /intent-missing/);
      const dup = copy(slot), original = dup.plan.intents.find(x => x.phase === "U");
      const second = dup.plan.intents.filter(x => x.phase === "U")[1];
      second.contractInputHash = original.contractInputHash; second.id = A.intentHash(dup.plan.runId, second);
      assert.throws(() => A.pruefeSlot(rehash(dup)), /duplicate-subject/);
      const admission = A.pruefe(auth, request(slot, us[0]), slot.plan.startsAtUTC, slot.plan.productionCommit);
      const ticket = { id: "offline-ticket", day: slot.plan.startsAtUTC.slice(0, 10), reserved: 212000 };
      A.verbrauche(auth, admission, ticket, slot.plan.startsAtUTC);
      auth.testKostenTage = { [ticket.day]: { calls: { [ticket.id]: { admission, reserved: ticket.reserved } } } };
      assert.throws(() => A.pruefe(auth, request(slot, us[0]), slot.plan.startsAtUTC, slot.plan.productionCommit), /intent-consumed/);
      assert.equal(A.pruefe(auth, request(slot, us[1]), slot.plan.startsAtUTC, slot.plan.productionCommit).intentId, us[1].id);
    });
    await test("LegacySingle-U und alle verbotenenVersionenkreuze bleiben gesperrt", () => {
      for (const [sv, pv] of [[A.VERSION, A.PLAN_VERSION], [A.REVIEW_VERSION, A.REVIEW_PLAN_VERSION]]) {
        const bad = copy(slot); bad.version = sv; bad.plan.version = pv; delete bad.plan.sourceBinding;
        if (sv === A.VERSION) { delete bad.draftCompletions; delete bad.reviewBindings; delete bad.reviewBindingsHash;
          bad.plan.intents = bad.plan.intents.filter(x => x.phase === "U"); }
        assert.throws(() => A.pruefeSlot(rehash(bad)), /duplicate-subject/);
      }
      for (const [sv, pv] of [[A.VERSION, A.REVIEW_PLAN_VERSION], [A.VERSION, A.MULTI_U_PLAN_VERSION],
        [A.REVIEW_VERSION, A.PLAN_VERSION], ["helmut-synthetik500-kosten-admission/3", A.MULTI_U_PLAN_VERSION]]) {
        const bad = copy(slot); bad.version = sv; bad.plan.version = pv;
        assert.throws(() => A.pruefeSlot(rehash(bad)), /slot-format|plan-bindung/);
      }
      const old = fixture(); const oldPlan = C.vorbereite(paket, old).admissionCandidate;
      oldPlan.plan.sourceBinding = copy(slot.plan.sourceBinding);
      assert.throws(() => A.pruefeSlot(rehash(oldPlan)), /plan-bindung/);
    });
    await test("SourceBinding- undOriginalinputdrift werden getrennt erkannt;Format ist keineAbnahme", () => {
      for (const mutate of [b => { delete b.inputHash; }, b => { b.extra = true; }, b => { b.inputVersion = C.REVIEW_INPUT_VERSION; },
        b => { b.projectionVersion = "unknown"; }, b => { b.projectionFieldsetHash = "0".repeat(64); }, b => { b.inputHash = "bad"; }]) {
        const bad = copy(slot); mutate(bad.plan.sourceBinding); assert.throws(() => A.pruefeSlot(rehash(bad)), /source-binding/);
      }
      const drift = copy(plan); drift.inputs.knowledgeObjects[0].version.headline = "GeaendertesOriginal";
      assert.throws(() => C.pruefe(drift, paket), /endlichkeitsbeleg-binding|plan-drift/);
      const changed = copy(slot); changed.plan.sourceBinding.inputHash = "a".repeat(64);
      assert.throws(() => A.pruefeSlot(changed), /plan-bindung/);
      assert.doesNotThrow(() => A.pruefeSlot(rehash(changed))); // Bewusste Formatgrenze.
      const forged = copy(plan); forged.admissionCandidate = changed;
      assert.throws(() => C.pruefe(forged, paket), /plan-drift/);
    });
    await test("Ticket2/D-R-Quittungsformen binden den neuenPlanHash und lehnen alteQuittungen ab", () => {
      const d = slot.plan.intents.find(x => x.phase === "D"), r = slot.plan.intents.find(x => x.dependsOn === d.id);
      const completed = copy(slot), day = slot.plan.startsAtUTC.slice(0, 10), h = P.hash("fictional-output");
      const base = { version: R.COMPLETION_VERSION, planHash: slot.planHash, operationId: slot.plan.operationId,
        runId: slot.plan.runId, dIntentId: d.id, dTicket: { id: "fictional-d-ticket", day }, owner: d.owner,
        contextHash: d.inputVersionHash, providerResponseHash: h, providerTextHash: h, outputHash: h,
        sourceContext: { profileHash: h, sourcesHash: h }, usageReceipt: { id: "fictional-usage", recordHash: h },
        costMicroUsd: 42, completedAtUTC: slot.plan.startsAtUTC };
      const c = { ...base, completionHash: P.hash(base) };
      completed.draftCompletions[d.id] = c;
      completed.consumed[d.id] = { ticketId: c.dTicket.id, day, consumedAtUTC: c.completedAtUTC,
        actualRequestHash: d.actualRequestHash, reserved: 212000 };
      assert.doesNotThrow(() => A.pruefeSlot(completed));
      const bindingBase = { version: R.VERSION, dCompletionHash: c.completionHash, dIntentId: d.id,
        storedD: { id: "fictional-stored-d", owner: d.owner, runId: slot.plan.runId, versionHash: h,
          outputHash: h, contextHash: d.inputVersionHash, profileHash: h, sourcesHash: h, storageContractHash: h },
        rule: r.reviewRule, promptHash: h, actualRequestHash: h, bodySha256: h };
      const b = { ...bindingBase, bindingHash: P.hash(bindingBase) };
      assert.doesNotThrow(() => R.validateBinding(b, completed, r));
      const old = copy(c); old.planHash = P.hash("historical-plan2");
      const { completionHash, ...oldBase } = old; old.completionHash = P.hash(oldBase);
      assert.throws(() => R.validateCompletion(old, completed), /D-completion-binding/);
      const a = A.pruefe({ [A.KEY]: slot }, { admission: { operationId: slot.plan.operationId, planHash: slot.planHash },
        phase: "entwurf", politicianId: d.owner, runId: slot.plan.runId, model: d.model, maxOutputTokens: d.maxOutputTokens,
        actualRequestHash: d.actualRequestHash, inputVersionHash: d.inputVersionHash }, slot.plan.startsAtUTC, slot.plan.productionCommit);
      assert.equal(a.version, A.REVIEW_VERSION); assert.equal(a.phase, "D"); assert.equal(a.planHash, slot.planHash);
    });
    await test("Nur exakteStorage-Leser fordernKO60;App59/pending/prefix15/Schreiben bleiben erhalten", async () => {
      const saved = Object.fromEntries(["HELMUT_V3_STORE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map(k => [k, process.env[k]]));
      const paths = []; let fail = false;
      try {
        Object.assign(process.env, { HELMUT_V3_STORE: "1", SUPABASE_URL: "https://offline.invalid", SUPABASE_SERVICE_ROLE_KEY: "fictional-only" });
        global.fetch = async (url, options) => {
          const parsed = new URL(url); assert.equal(parsed.hostname, "offline.invalid"); paths.push(parsed);
          if (options.method === "POST") {
            const written = JSON.parse(options.body);
            assert.equal(Object.hasOwn(written, "verstehen_fencing"), false);
            assert.equal(Object.hasOwn(written, "embedding"), false);
            assert.deepEqual(Object.keys(written).sort(), [...storage.V3_KNOWLEDGE_OBJECT_COLUMNS].sort());
            return { ok: true, status: 200, text: async () => JSON.stringify([written]) };
          }
          const select = parsed.searchParams.get("select");
          return { ok: !fail, status: fail ? 503 : 200, text: async () => fail ? "fictional-error"
            : JSON.stringify([{ ...Object.fromEntries(select.split(",").map(k => [k, ko()[k]])) }]),
            json: async () => [{ ...Object.fromEntries(select.split(",").map(k => [k, ko()[k]])) }] };
        };
        const byId = await storage.getKnowledgeObjectById("fictional-ko");
        const byVorgang = await storage.getKnowledgeObjectByVorgang("fictional-cluster", { throwOnError: true });
        assert.equal(Object.keys(byId).length, 60); assert.equal(Object.keys(byVorgang).length, 60);
        assert.equal(paths[0].searchParams.get("select"), KO.SELECT); assert.equal(paths[0].searchParams.get("limit"), "1");
        assert.equal(paths[1].searchParams.get("order"), "updated_at.desc");
        await storage.listKnowledgeObjects({ limit: 1 }); await storage.listPendingKnowledgeObjects({ limit: 1 });
        await storage.listKnowledgeObjectsByVorgangPrefix(["vg-fictional"], 8);
        assert.equal(paths[2].searchParams.get("select").split(",").length, 59);
        assert.equal(paths[3].searchParams.get("select"), paths[2].searchParams.get("select"));
        assert.equal(paths[4].searchParams.get("select"), W.PREFIX_FIELDS.join(","));
        assert.equal(storage.V3_KNOWLEDGE_OBJECT_COLUMNS.length, 59);
        assert.equal((await storage.saveKnowledgeObject(ko())).saved, true);
        fail = true;
        const log = console.error; console.error = () => {};
        try {
          assert.equal(await storage.getKnowledgeObjectById("fictional-ko"), null);
          assert.equal(await storage.getKnowledgeObjectByVorgang("fictional-cluster"), null);
          await assert.rejects(storage.getKnowledgeObjectByVorgang("fictional-cluster", { throwOnError: true }), e => e.name === "StorageReadError");
        } finally { console.error = log; }
      } finally {
        global.fetch = blocked;
        for (const [k, value] of Object.entries(saved)) { if (value === undefined) delete process.env[k]; else process.env[k] = value; }
      }
    });
    await test("W intake bindet kanonischeOriginalbytes/Captures/Resolver ohne echteAbnahme oderLiveFallback", async () => {
      const f = wInputs(); f.knowledgeObjects = [];
      const originalDocs = mappedWInputs(f);
      const cluster = { documents: f.documents.map(d => d.version) }, vorgangId = U.deriveVorgangId(cluster);
      f.clusters[0].vorgangId = vorgangId; bind(f);
      const ps = identity.candidatePrefixes(cluster, 3, { personengruppenAltbestand: true });
      const resolution = await U.resolveVorgang(cluster, { findVorgangCandidates: () => [], getExistingStreng: () => null });
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: originalDocs, linkedDocuments: [], knowledgeObjects: [], prefixes: ps.length ? [{ prefixes: ps, rows: [], evidence }] : [],
        exacts: [{ vorgangId, knowledgeObjectId: null, evidence }], links: [],
        reservations: [{ vorgangId, row: null, evidence }], memos: [{ vorgangId, row: null, evidence }],
        decisions: [{ versionKey: C.sourceVersions(f.documents, [], f.clusters, f.version).clusters[0].key,
          cluster, resolution, eligibilityEvidence: evidence }] };
      const wb = JSON.stringify(w), ev = { reference: "fictional-whole-W-original", sha256: byteHash(wb) };
      f.understandingCompleteness.evidence = ev;
      const result = await W.vorbereite(paket, JSON.stringify(f), wb, ev);
      assert.equal(result.sourceBinding.inputHash, P.hash(f)); assert.equal(result.inventoryBytesSha256, byteHash(wb));
      assert.equal(result.actualInputAcceptanceVerified, false); assert.equal(result.eligibilityAcceptanceVerified, false);
      assert.equal(result.installationAvailable, false); assert.equal(result.executionReady, false);
      for (const mutate of [x => { x.exacts = []; }, x => { x.reservations = []; }, x => { x.decisions = []; },
        x => { x.decisions[0].resolution.vorgangId = "foreign"; }, x => { x.documents[0].version.title += "drift"; }]) {
        const bad = copy(w); mutate(bad); const bytes = JSON.stringify(bad), evidence2 = { ...ev, sha256: byteHash(bytes) };
        const fe = copy(f); fe.understandingCompleteness.evidence = evidence2;
        await assert.rejects(W.vorbereite(paket, JSON.stringify(fe), bytes, evidence2), /synthetik500-w-inventar-/);
      }
      await assert.rejects(W.vorbereite(paket, JSON.stringify(f, null, 2), wb, ev), /original-kanonisch/);
      const adapter = W.baueLeseAdapter(w);
      assert.throws(() => adapter.deps.getExistingStreng("uncaptured"), /exakt-capture-fehlt/);
      assert.throws(() => adapter.deps.listVorgangDocuments("uncaptured"), /link-capture-fehlt/);
    });
    await test("W akzeptiert den echten nicht-exaktenPrefix15-Resolverausgang mit separaterKO60-Bindung", async () => {
      const f = wInputs();
      const originalDocs = mappedWInputs(f);
      const cluster = { documents: f.documents.map(d => d.version) };
      const ps = identity.candidatePrefixes(cluster, 3, { personengruppenAltbestand: true });
      assert.ok(ps.length > 0);
      const proposed = U.deriveVorgangId(cluster), legacy = ps[0] + "-fictional-existing";
      const full = ko(legacy), prefix = Object.fromEntries(W.PREFIX_FIELDS.map(k => [k, full[k]]));
      f.knowledgeObjects = [{ vorgangId: legacy, koVersion: 1, version: full }];
      f.clusters[0].vorgangId = legacy; f.clusters[0].mode = "update"; f.clusters[0].koVersion = 2; bind(f);
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: originalDocs, linkedDocuments: [], knowledgeObjects: f.knowledgeObjects,
        prefixes: [{ prefixes: ps, rows: [prefix], evidence }],
        exacts: [{ vorgangId: proposed, knowledgeObjectId: null, evidence }, { vorgangId: legacy, knowledgeObjectId: full.id, evidence }],
        links: [{ knowledgeObjectId: full.id, rows: f.documents.map(d => ({ knowledge_object_id: full.id,
          raw_document_id: d.id, created_at: "2026-10-02T10:00:00.000Z" })), evidence }],
        reservations: [{ vorgangId: legacy, row: null, evidence }], memos: [{ vorgangId: legacy, row: null, evidence }], decisions: [] };
      const resolution = await U.resolveVorgang(cluster, W.baueLeseAdapter(w).deps);
      assert.equal(resolution.resolution, "bestand"); assert.equal(Object.keys(resolution.existing).length, 15);
      w.decisions = [{ versionKey: C.sourceVersions(f.documents, f.knowledgeObjects, f.clusters, f.version).clusters[0].key,
        cluster, resolution, eligibilityEvidence: evidence }];
      const wb = JSON.stringify(w), ev = { reference: "fictional-prefix-W-original", sha256: byteHash(wb) };
      f.understandingCompleteness.evidence = ev;
      const result = await W.vorbereite(paket, JSON.stringify(f), wb, ev);
      assert.equal(result.actualInputAcceptanceVerified, false); assert.equal(result.plan.completeness.U, 1);
    });
    await test("W Adapter weist App59, Grenzgleichstaende,40-Linkoverflow und verwaisteLinks ab", () => {
      const rows = Array.from({ length: 9 }, (_, n) => ko("vg-fictional-" + n, n));
      rows.forEach((row, n) => { row.updated_at = new Date(Date.parse("2026-10-02T10:00:00Z") - n * 1000).toISOString(); });
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: [], linkedDocuments: [], knowledgeObjects: rows.map(version => ({ vorgangId: version.vorgang_id, koVersion: 1, version })),
        prefixes: [{ prefixes: ["vg-fictional"], rows: rows.map(row => Object.fromEntries(W.PREFIX_FIELDS.map(k => [k, row[k]]))), evidence }],
        exacts: [], links: [], reservations: [], memos: [], decisions: [] };
      assert.doesNotThrow(() => W.baueLeseAdapter(w));
      const partial = copy(w); delete partial.knowledgeObjects[0].version.verstehen_fencing;
      assert.throws(() => W.baueLeseAdapter(partial), /ko60-felder/);
      const absent = copy(w); absent.exacts = [{ vorgangId: rows[0].vorgang_id, knowledgeObjectId: null, evidence }];
      assert.throws(() => W.baueLeseAdapter(absent), /exakt-oder-abwesenheit/);
      const missing = copy(w); missing.prefixes[0].rows.pop();
      assert.throws(() => W.baueLeseAdapter(missing), /prefix-bekannte-ko-fehlen/);
      const duplicate = copy(w); duplicate.knowledgeObjects[1].version.vorgang_id = rows[0].vorgang_id;
      duplicate.knowledgeObjects[1].vorgangId = rows[0].vorgang_id;
      assert.throws(() => W.baueLeseAdapter(duplicate), /ko-version/);
      const tie = copy(w); tie.knowledgeObjects[8].version.updated_at = tie.knowledgeObjects[7].version.updated_at;
      tie.prefixes[0].rows[8].updated_at = tie.prefixes[0].rows[7].updated_at;
      assert.throws(() => W.baueLeseAdapter(tie), /prefix-8-grenzgleichstand/);
      const links = copy(w); links.links = [{ knowledgeObjectId: rows[0].id, rows: Array(41).fill({}), evidence }];
      assert.throws(() => W.baueLeseAdapter(links), /links-vollstaendig-40/);
      links.links[0].rows = [{ knowledge_object_id: rows[0].id, raw_document_id: "foreign", created_at: "2026-10-02" }];
      assert.throws(() => W.baueLeseAdapter(links), /link-verwaist-oder-doppelt/);
    });
    await test("W source mapper erhaelt exakt den Runtime-LinkedDTO und lehnt fehlendeAliaswerte ab", () => {
      const f = wInputs(), full = ko("vg-fictional"), doc = f.documents[0];
      doc.version.summary = "Die Verkehrskonferenz in Neustadt diskutiert neue Bahnstrecken fuer mehrere kleinere Gemeinden im Umland.";
      doc.version.quellenauszug_beleg = { status: "ergaenzt" };
      doc.version.dip_quellfelder = { fictionalOnly: true };
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: [doc], linkedDocuments: [], knowledgeObjects: [{ vorgangId: full.vorgang_id, koVersion: 1, version: full }],
        prefixes: [], exacts: [], links: [{ knowledgeObjectId: full.id, rows: [{ knowledge_object_id: full.id,
          raw_document_id: doc.id, created_at: "2026-10-02T10:00:00.000Z" }], evidence }], reservations: [], memos: [], decisions: [] };
      const linked = W.baueLeseAdapter(w).deps.listVorgangDocuments(full.id)[0];
      const projected = Object.fromEntries(W.LINKED_SOURCE_FIELDS.map(k => [k, doc.version[k]]));
      assert.deepEqual(linked, require("../lib/helmut/quellen-auszug").geleseneQuelle(projected));
      assert.equal(Object.hasOwn(linked, "source_type"), false); assert.equal(Object.hasOwn(linked, "raw"), false);
      assert.equal(Object.hasOwn(linked, "retrieved_at"), false); assert.equal(Object.hasOwn(linked, "quellenauszug_beleg"), false);
      assert.equal(linked.summary, doc.version.summary); assert.deepEqual(linked.dip_quellfelder, doc.version.dip_quellfelder);
      for (const mutate of [x => { delete x.documents[0].version.dip_quellfelder; },
        x => { x.documents[0].version.raw = { helmutPardokBeleg: "foreign-identity" }; },
        x => { x.documents[0].version.berlin_abgerufen_at = "fictional-different-time"; }]) {
        const bad = copy(w); mutate(bad); assert.throws(() => W.baueLeseAdapter(bad), /dokument/);
      }
    });
    await test("W neutrale Zusatzquellen behalten RuntimeDTO und strikte Eingangsquellenebenen", () => {
      const full = ko("vg-fictional"), doc = copy(wInputs().documents[0]); doc.scope = null;
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: [], linkedDocuments: [doc], knowledgeObjects: [{ vorgangId: full.vorgang_id, koVersion: 1, version: full }],
        prefixes: [], exacts: [], links: [{ knowledgeObjectId: full.id, rows: [{ knowledge_object_id: full.id,
          raw_document_id: doc.id, created_at: "2026-10-02T10:00:00.000Z" }], evidence }],
        reservations: [], memos: [], decisions: [] };
      const adapter = W.baueLeseAdapter(w);
      assert.equal(adapter.inventar.linkedDocuments[0].scope, null);
      const dto = adapter.deps.listVorgangDocuments(full.id)[0];
      assert.deepEqual(dto, require("../lib/helmut/quellen-auszug").geleseneQuelle(
        Object.fromEntries(W.LINKED_SOURCE_FIELDS.map(k => [k, doc.version[k]]))));
      assert.equal(Object.hasOwn(dto, "scope"), false);
      const input = copy(w); input.documents = input.linkedDocuments; input.linkedDocuments = [];
      assert.throws(() => W.baueLeseAdapter(input), /dokument/);
      for (const scope of ["BT", "BE", "BB"]) {
        const scoped = copy(input); scoped.documents[0].scope = scope;
        assert.doesNotThrow(() => W.baueLeseAdapter(scoped));
      }
      for (const field of ["dip_quellfelder", "bundestag_artikelstand", "berlin_artikelstand", "brandenburg_artikelstand"]) {
        const bad = copy(w); bad.linkedDocuments[0].version[field] = {};
        assert.throws(() => W.baueLeseAdapter(bad), /dokument/);
      }
      for (const mutate of [x => { x.linkedDocuments[0].scope = "unknown"; },
        x => { delete x.linkedDocuments[0].version.dip_quellfelder; },
        x => { x.documents = copy(x.linkedDocuments); x.documents[0].scope = "BT"; },
        x => { x.links[0].rows[0].raw_document_id = "missing-source"; }]) {
        const bad = copy(w); mutate(bad);
        assert.throws(() => W.baueLeseAdapter(bad), /dokument|link-verwaist-oder-doppelt/);
      }
    });
    await test("W bindet roheSOURCE23-Originale getrennt vom normalisierten aktuellenResolvercluster", async () => {
      const f = wInputs(); f.knowledgeObjects = [];
      f.documents[0].version.quellenauszug_beleg = { status: "ergaenzt" };
      f.documents[0].version.summary = "Cookie-Hinweis ohne belastbaren Originalartikel.";
      const originalDocs = mappedWInputs(f);
      assert.equal(f.documents[0].version.summary, null);
      assert.equal(Object.hasOwn(f.documents[0].version, "quellenauszug_beleg"), false);
      const cluster = { documents: f.documents.map(d => d.version) }, vorgangId = U.deriveVorgangId(cluster);
      f.clusters[0].vorgangId = vorgangId; bind(f);
      const ps = identity.candidatePrefixes(cluster, 3, { personengruppenAltbestand: true });
      const resolution = await U.resolveVorgang(cluster, { findVorgangCandidates: () => [], getExistingStreng: () => null });
      const w = { version: W.VERSION, projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH,
        documents: originalDocs, linkedDocuments: [], knowledgeObjects: [],
        prefixes: ps.length ? [{ prefixes: ps, rows: [], evidence }] : [], exacts: [{ vorgangId, knowledgeObjectId: null, evidence }],
        links: [], reservations: [{ vorgangId, row: null, evidence }], memos: [{ vorgangId, row: null, evidence }],
        decisions: [{ versionKey: C.sourceVersions(f.documents, [], f.clusters, f.version).clusters[0].key,
          cluster, resolution, eligibilityEvidence: evidence }] };
      const wb = JSON.stringify(w), ev = { reference: "fictional-normalized-W-original", sha256: byteHash(wb) };
      f.understandingCompleteness.evidence = ev;
      const result = await W.vorbereite(paket, JSON.stringify(f), wb, ev);
      assert.equal(result.actualInputAcceptanceVerified, false);
      const rawInput = copy(f); rawInput.documents = originalDocs;
      await assert.rejects(W.vorbereite(paket, JSON.stringify(rawInput), wb, ev), /originalinput-w-bindung/);
      const rawCluster = copy(w); rawCluster.decisions[0].cluster.documents = originalDocs.map(x => x.version);
      const rawBytes = JSON.stringify(rawCluster), rawEvidence = { ...ev, sha256: byteHash(rawBytes) };
      const bound = copy(f); bound.understandingCompleteness.evidence = rawEvidence;
      await assert.rejects(W.vorbereite(paket, JSON.stringify(bound), rawBytes, rawEvidence), /resolver-originalquellen/);
    });
    assert.equal(outsideCalls, 0);
    console.log(JSON.stringify({ newGroups: passed, passed, providerCalls: 0, databaseCalls: 0, nativeCalls: 0,
      actualInputAcceptanceVerified: false, executionReady: false }));
  } finally { global.fetch = savedFetch; https.request = savedHttps; http.request = savedHttp; }
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
