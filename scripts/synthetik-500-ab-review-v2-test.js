"use strict";
// Nur die neue A/B -> C/2 Offline-Naht; keine alten Suiten/Provider/DB.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const P = require("../lib/helmut/synthetik-500-profile");
const I = require("../lib/helmut/synthetik-500-import");
const V = require("../lib/helmut/synthetik-500-vertrag");
const N = require("../lib/helmut/synthetik-500-nachweis");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const B = require("../lib/helmut/synthetik-500-executor");
const ACli = require("./synthetik-500-kosten-plan"), BCli = require("./synthetik-500-executor");
const paket = P.erzeuge(), copy = structuredClone;
const START = "2026-10-02T12:00:00.000Z", END = "2026-10-02T13:00:00.000Z", OBS = "2026-10-02T11:59:30.000Z";
function fixture(tokens = 3000) {
  const rows = I.erzeugeZeilen(paket), snapshot = { beobachtetAm: OBS,
    profiles: [...rows.profileRows, { id: "review-v2-fictional-foreign", name: "Fiktive geschuetzte Identitaet" }],
    mandate_profiles: rows.mandateRows.map(p => ({ ...p, geloescht_at: null, updated_at: OBS })) };
  const operationId = "synthetik500-review-v2-offline-20261002", productionCommit = "c".repeat(40);
  const profilvertrag = V.vorbereiten({ paketBytes: P.serialisiere(paket), snapshot, operationId,
    vorflugAm: OBS, startBis: "2026-10-02T12:04:30.000Z", endeAm: END, kosten: {
      tag: "2026-10-02", beobachtetAm: OBS, tageslimitMikroUsd: 6000000, auftragslimitMikroUsd: 7000000,
      tagVerbrauchtMikroUsd: 0, tagReserviertMikroUsd: 0, auftragVerbrauchtMikroUsd: 0,
      auftragReserviertMikroUsd: 0, restreserveMikroUsd: 6000000, laufreserveMikroUsd: 224000 } });
  const grund = Object.fromEntries(["belegHash", "technikHash", "fachHash", "productionHash", "ruheHash", "kostenHash",
    "landesversorgungHash", "snapshotHash", "authHash", "mainHash"].map(k => [k, P.hash("fictional-" + k)]));
  Object.assign(grund, { snapshotHash: P.hash(snapshot), productionCommit, deploymentId: "dpl_OFFLINEREVIEW" });
  const runtimeManifest = { version: "helmut-synthetik500-runtime-manifest/1", profilManifestHash: P.hash(profilvertrag),
    profilvertrag, startbelegeGrundlinie: grund };
  const documents = ["BT", "BE", "BB"].map(scope => ({ id: "fictional-" + scope, scope,
    version: { id: "fictional-" + scope, text: "Ausschliesslich fiktiver lokaler Quelldatensatz" } }));
  const source = C.sourceVersions(documents, [], null), documentKeys = source.documents.map(x => x.key);
  const clusters = [{ vorgangId: "fictional-cluster", mode: "erst", koVersion: null, documentKeys,
    requiresUnderstanding: true, coverage: null }];
  const versions = C.sourceVersions(documents, [], clusters), u = versions.clusters[0];
  const body = input => JSON.stringify({ model: "gpt-5-mini", input, max_output_tokens: 3000 });
  const e = { version: C.REVIEW_INPUT_VERSION, operationId, runId: "nachlauf500-1790942400000",
    productionCommit, runtimeManifestHash: P.hash(runtimeManifest), window: { startUTC: START, endUTC: END },
    documents, knowledgeObjects: [], clusters, understandingInputs: [{ versionKey: u.key, contractInputHash: u.contractInputHash,
      requestBody: body("Fiktive U-Version"), routeId: "fixture-route", attemptLimit: 1 }],
    understandingCompleteness: { version: C.PROOF_VERSION, documentInventoryHash: P.hash(versions.documents),
      knowledgeObjectInventoryHash: P.hash(versions.knowledgeObjects), clusterInventoryHash: P.hash(versions.clusters),
      requiredVersionKeys: [u.key], evidence: { reference: "offline-only-fixture", sha256: P.hash("fictional") } },
    draftInputs: paket.profile.map(p => ({ owner: p.mandatsId, profileHash: P.hash(p), context: { fictional: p.mandatsId },
      documentKeys, knowledgeObjectKeys: [], requestBody: body("Fiktiver D-Input " + p.mandatsId), routeId: "fixture-route", attemptLimit: 1 })),
    reviewMaxOutputTokens: tokens, paidRoutes: null, otherPaidInputs: [] };
  const first = C.vorbereite(paket, e);
  e.paidRoutes = [{ id: "fixture-route", provider: "azure-openai", api: "responses", deploymentId: "fictional-only-model",
    model: "gpt-5-mini", disposition: "aufgenommen", admittedRequestIds: [...first.phasePositions.U, ...first.phasePositions.D]
      .map(x => x.requestId).sort(), priceContract: "existing-conservative-text", exclusionEvidence: null }];
  const kostenPlan = C.vorbereite(paket, e);
  const sollplan = N.erzeugeSollplan(paket, { operationId, productionCommit, deploymentId: grund.deploymentId,
    runtimeManifestHash: P.hash(runtimeManifest), definiertAm: "2026-10-02T11:58:00.000Z", startsAt: START,
    endsAt: END, briefingFensterStart: "2026-10-02T00:00:00.000Z" });
  return { e, b: { version: B.REVIEW_INPUT_VERSION, snapshot, runtimeManifest, sollplan,
    kostenPlan, kostenSlot: copy(kostenPlan.admissionCandidate) } };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  const f = fixture(), hi = fixture(6000);
  await test("Explizites/2 erzeugt echte C-Regeln3000low/6000medium und500gebundeneR-IDs", () => {
    for (const [x, effort] of [[f, "low"], [hi, "medium"]]) {
      const p = x.b.kostenPlan, slot = p.admissionCandidate;
      assert.equal(p.version, C.REVIEW_VERSION); assert.equal(slot.version, A.REVIEW_VERSION);
      assert.equal(slot.plan.version, A.REVIEW_PLAN_VERSION); assert.equal(C.pruefe(p, paket).planHash, p.planHash);
      A.pruefeSlot(slot); const drafts = new Map(slot.plan.intents.filter(x => x.phase === "D").map(x => [x.id, x]));
      for (const r of slot.plan.intents.filter(x => x.phase === "R")) {
        assert.deepEqual(r.reviewRule, { version: R.RULE_VERSION, reasoningEffort: effort });
        assert(R.validRule(r.reviewRule, r.maxOutputTokens)); assert.equal(r.id, A.intentHash(slot.plan.runId, r));
        assert.equal(drafts.get(r.dependsOn).owner, r.owner); assert.equal(drafts.get(r.dependsOn).inputVersionHash, r.contextVersionHash);
        const { reviewRule, ...oldDescriptor } = r; assert.notEqual(r.id, A.intentHash(slot.plan.runId, oldDescriptor));
        assert.equal(r.actualRequestHash, null); assert.equal(r.inputVersionHash, null);
      }
      assert.deepEqual(slot.consumed, {}); assert.deepEqual(slot.draftCompletions, {}); assert.deepEqual(slot.reviewBindings, {});
      assert.equal(slot.reviewBindingsHash, P.hash({})); assert.equal(slot.planHash, P.hash(slot.plan));
      const b = B.vorbereite(paket, x.b); B.pruefe(b, paket);
      assert.equal(b.version, B.REVIEW_VERSION); assert.equal(b.kostenPlanHash, p.planHash);
      assert.equal(b.laufBindung.admissionPlanHash, slot.planHash); assert.equal(b.erwartetePositionen.length, 1500);
      assert.equal(b.productionReady, false); assert.equal(b.startrecht, false); assert.equal(p.status.paidGo, false);
      assert.equal(p.money.wholeRunMaximumCostMicroUsd, null);
    }
  });
  await test("NeueVersionswahl behaelt/1 als Default; kein automatischesUpgrade oder gemischterSlot", () => {
    assert.equal(B.offeneEingaben().version, B.INPUT_VERSION);
    assert.equal(B.vorbereite(paket).version, B.VERSION);
    const old = C.vorbereite(paket, { ...f.e, version: C.INPUT_VERSION });
    assert.equal(old.version, C.VERSION); assert.equal(old.admissionCandidate.version, A.VERSION);
    assert(!Object.hasOwn(old.admissionCandidate, "reviewBindings"));
    assert(old.phasePositions.R.every(x => !Object.hasOwn(x.admissionIntent, "reviewRule")));
    assert.throws(() => B.vorbereite(paket, { ...f.b, version: B.INPUT_VERSION }), /admission-version-opt-in/);
    assert.throws(() => B.vorbereite(paket, { ...f.b, kostenSlot: old.admissionCandidate }), /admission-version-opt-in/);
  });
  await test("FalscheRule trotzneuHash und vorgespiegelteCompletion/Reviewbindung werden abgewiesen", () => {
    const bad = copy(f.b), r = bad.kostenSlot.plan.intents.find(x => x.phase === "R");
    r.reviewRule.reasoningEffort = "medium"; r.id = A.intentHash(bad.kostenSlot.plan.runId, r);
    bad.kostenSlot.planHash = P.hash(bad.kostenSlot.plan);
    assert.throws(() => B.vorbereite(paket, bad), /r-derivation-rule/);
    for (const field of ["draftCompletions", "reviewBindings"]) {
      const forged = copy(f.b); forged.kostenSlot[field].forged = { trusted: true };
      forged.kostenSlot.reviewBindingsHash = P.hash(forged.kostenSlot.reviewBindings);
      assert.throws(() => B.vorbereite(paket, forged));
    }
    const hash = copy(f.b); hash.kostenSlot.reviewBindingsHash = "0".repeat(64);
    assert.throws(() => B.vorbereite(paket, hash), /review-bindings-hash/);
  });
  await test("Internvalider/2D-R-Slotdrift scheitert exaktanA/B-Kostenplanbindung", () => {
    const bad = copy(f.b), slot = bad.kostenSlot, d = slot.plan.intents.find(x => x.phase === "D"), oldId = d.id;
    d.actualRequestHash = P.hash("different-fictional-D"); d.id = A.intentHash(slot.plan.runId, d);
    const r = slot.plan.intents.find(x => x.dependsOn === oldId); r.dependsOn = d.id; r.id = A.intentHash(slot.plan.runId, r);
    slot.planHash = P.hash(slot.plan); A.pruefeSlot(slot);
    assert.throws(() => B.vorbereite(paket, bad), /vollkostenplan-admission-drift/);
  });
  await test("Neue/2Simulation gibtRniemalsanCallbackweiter undlaesstPlanhashundQuittungsmengenleer", async () => {
    const before = P.hash(f.b.kostenSlot), prep = B.vorbereite(paket, f.b), seen = [];
    const result = await B.simuliere(prep, paket, { modus: B.SIMULATION, jetzt: () => Date.parse(START), fixture: x => {
      seen.push(x.intent.phase); return { intentId: x.intent.id, actualRequestHash: x.request.actualRequestHash,
        status: "fixture-quittiert", evidenceHash: P.hash("fixture-only") };
    } });
    assert.deepEqual(seen, ["U", "D"]); assert.equal(result.grund, "r-storage-receipt-adapter-und-resume-offen");
    assert.equal(result.version, B.REVIEW_VERSION); assert.equal(result.productionReady, false);
    assert.equal(result.positionen.length, 1500); assert.equal(P.hash(f.b.kostenSlot), before);
    assert(result.offeneProductionTore.includes("native-immutable-d-storage-und-retention"));
    assert(result.offeneProductionTore.includes("restart-resume-nicht-verfuegbar"));
  });
  await test("DateiCLIs/2gebenkorrekteVersionenausundbleibenreineprivateVorbereitung", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-review-v2-cli-")), saved = console.log;
    try {
      const save = (name, value) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(value), { flag: "wx", mode: 0o600 }); return p; };
      const pack = save("paket.json", paket), a = save("a.json", f.e), b = save("b.json", f.b);
      console.log = () => {};
      const ar = ACli.main(["--paket", pack, "--eingaben", a]);
      const br = BCli.main(["--paket", pack, "--eingaben", b]);
      assert.equal(ar.version, C.REVIEW_VERSION); assert.equal(br.version, B.REVIEW_VERSION);
      assert.equal(ar.status.executionReady, false); assert.equal(br.startrecht, false);
    } finally { console.log = saved; fs.rmSync(dir, { recursive: true }); }
  });
  console.log(JSON.stringify({ newGroups: passed, passed, oldSuitesRun: 0, providerCalls: 0, databaseCalls: 0,
    nativeCalls: 0, productionReady: false, paidGo: false, nativeStorageContract: "unavailable", restartResume: "unavailable" }));
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { main };
