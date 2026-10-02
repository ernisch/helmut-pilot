"use strict";

// Nur neue Offline-Plan-/CLI-Naht; keine alten Admission-Suiten oder Anbieter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const V = require("../lib/helmut/verstehen-vertrag");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const CLI = require("./synthetik-500-kosten-plan");
const paket = P.erzeuge(), clone = x => structuredClone(x);
const evidence = { reference: "offline-fictional-inventory-review", sha256: P.hash("fictional-only") };
const body = (input, tokens = 3000, model = "gpt-5-mini") => JSON.stringify({ model, input, max_output_tokens: tokens });
function emptyInputs() {
  return { version: C.INPUT_VERSION, operationId: "synthetik500-offline-cost-plan-20261002", runId: "nachlauf500-1790935200000",
    window: { startUTC: "2026-10-02T12:00:00.000Z", endUTC: "2026-10-02T13:00:00.000Z" },
    productionCommit: null, runtimeManifestHash: null, documents: null, knowledgeObjects: null, clusters: null,
    understandingInputs: null, understandingCompleteness: null, draftInputs: null, reviewMaxOutputTokens: 3000,
    paidRoutes: null, otherPaidInputs: null };
}
function proof(e) {
  const s = C.sourceVersions(e.documents, e.knowledgeObjects, e.clusters);
  return { version: C.PROOF_VERSION, documentInventoryHash: P.hash(s.documents),
    knowledgeObjectInventoryHash: P.hash(s.knowledgeObjects), clusterInventoryHash: P.hash(s.clusters),
    requiredVersionKeys: s.clusters.filter(x => x.requiresUnderstanding).map(x => x.key), evidence };
}
function fixture(covered = false, multi = false) {
  const e = emptyInputs(); e.productionCommit = "c".repeat(40); e.runtimeManifestHash = P.hash("fictional-runtime");
  e.documents = ["BT", "BE", "BB"].map(scope => ({ id: "fictional-document-" + scope.toLowerCase(), scope,
    version: { id: "fictional-document-" + scope.toLowerCase(), text: "Fiktiver unverkuerzter Inhalt", revision: 1 } }));
  e.knowledgeObjects = covered ? [{ vorgangId: "fictional-cluster", koVersion: 1,
    version: { id: "fictional-ko", vorgang_id: "fictional-cluster", ko_version: 1, text: "Fiktiver KO" } }] : [];
  const s = C.sourceVersions(e.documents, e.knowledgeObjects, null), docKey = s.documents[0].key;
  const docKeys = s.documents.map(x => x.key);
  const hash = V.eingabeHash({ vorgangId: "fictional-cluster", dokumente: e.documents, modus: "erst" });
  e.clusters = [{ vorgangId: "fictional-cluster", mode: "erst", koVersion: null, documentKeys: docKeys,
    requiresUnderstanding: !covered, coverage: covered ? { knowledgeObjectKey: s.knowledgeObjects[0].key,
      documentKeys: docKeys, contractInputHash: hash, evidence } : null }];
  if (multi) e.clusters.push({ ...clone(e.clusters[0]), mode: "update", koVersion: 2 });
  const all = C.sourceVersions(e.documents, e.knowledgeObjects, e.clusters);
  e.understandingInputs = all.clusters.filter(x => x.requiresUnderstanding).map(v => ({ versionKey: v.key,
    contractInputHash: v.contractInputHash, requestBody: body("fictional-understanding-" + v.mode), routeId: "offline-text", attemptLimit: 1 }));
  e.understandingCompleteness = proof(e);
  e.draftInputs = paket.profile.map(p => ({ owner: p.mandatsId, profileHash: P.hash(p),
    context: { fictionalOnly: true, version: 1, mandatsId: p.mandatsId }, documentKeys: [docKey],
    knowledgeObjectKeys: s.knowledgeObjects.map(x => x.key), requestBody: body("Fiktive lokale Lage " + p.mandatsId),
    routeId: "offline-text", attemptLimit: 1 }));
  e.otherPaidInputs = [];
  const preliminary = C.vorbereite(paket, e);
  e.paidRoutes = [{ id: "offline-text", provider: "azure-openai", api: "responses", deploymentId: "fictional-gpt5-mini",
    model: "gpt-5-mini", disposition: "aufgenommen", admittedRequestIds: [...preliminary.phasePositions.U, ...preliminary.phasePositions.D]
      .map(x => x.requestId).sort(), priceContract: "existing-conservative-text", exclusionEvidence: null }];
  return e;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function rejects(mutate, pattern = /synthetik500-kostenplan-/) {
  const e = fixture(); mutate(e); assert.throws(() => C.vorbereite(paket, e), pattern);
}
function capture(fn) {
  const saved = console.log, lines = [];
  try { console.log = x => lines.push(String(x)); return { result: fn(), stdout: lines.join("\n") }; }
  finally { console.log = saved; }
}
function main() {
  const oldFetch = global.fetch, https = require("node:https"), oldRequest = https.request;
  let calls = 0;
  global.fetch = https.request = () => { calls++; throw new Error("offline-only"); };
  try {
    test("Fehlende echte Inputs bleiben offen;500D/R und1500Sollausgaben sind keine Providercalls", () => {
      const p = C.vorbereite(paket, emptyInputs());
      assert.equal(p.packageBinding.expectedOutputs, 1500); assert.equal(p.phasePositions.D.length, 500);
      assert.equal(p.phasePositions.R.length, 500); assert.equal(p.phasePositions.U, null);
      assert.equal(p.admissionCandidate, null); assert.equal(p.money.wholeRunMaximumCostMicroUsd, null);
      assert.ok(p.requiredActualInputs.includes("accepted-bt-be-bb-document-versions"));
      assert.ok(p.phasePositions.D.every(x => x.requestId === null));
      assert.equal(p.status.executionReady, false); assert.equal(p.status.budgetGo, false);
    });
    test("Echte lokale Vollversionen/Payloads ergeben bestehende Admission-IDs und separate Bytehashes", () => {
      const e = fixture(), p = C.vorbereite(paket, e), u = p.phasePositions.U[0];
      assert.equal(u.contractInputHash.length, 40); assert.equal(u.inputVersionHash.length, 64);
      assert.equal(u.request.actualRequestHash, A.requestHash(e.understandingInputs[0].requestBody));
      assert.equal(u.requestId, A.intentHash(e.runId, u.admissionIntent));
      assert.equal(u.request.frozenBodySha256.length, 64); assert.equal(u.request.frozenBodyBytes, Buffer.byteLength(e.understandingInputs[0].requestBody));
      assert.doesNotThrow(() => A.pruefeSlot(p.admissionCandidate));
      assert.equal(p.admissionCandidate.plan.intents.length, 1001);
      assert.deepEqual(p.requiredActualInputs, []); assert.equal(p.status.runtimeEnforcement, false);
      assert.equal(p.completeness.actualInputAcceptanceVerified, false);
    });
    test("R haelt echten D-Parent/Kontext aber niemals erfundenen Output-/Reviewpayloadhash", () => {
      const p = C.vorbereite(paket, fixture()), drafts = new Map(p.phasePositions.D.map(x => [x.requestId, x]));
      for (const r of p.phasePositions.R) {
        assert.equal(r.owner, drafts.get(r.dependsOn).owner); assert.equal(r.contextVersionHash, drafts.get(r.dependsOn).inputVersionHash);
        assert.equal(r.actualInputVersionHash, null); assert.equal(r.actualRequestHash, null);
        assert.equal(r.admissionIntent.inputVersionHash, null); assert.equal(r.attemptLimit, 1);
      }
      assert.equal(p.completeness.pendingActualReviewPayloads, 500);
    });
    test("U=[] braucht voll gebundene vorhandene KO-Abdeckung und positiven Endlichkeitsbeleg", () => {
      const e = fixture(true), p = C.vorbereite(paket, e);
      assert.equal(p.completeness.U, 0); assert.equal(p.completeness.localFiniteProofBound, true);
      e.understandingCompleteness = null;
      assert.throws(() => C.vorbereite(paket, e), /u-leer-ohne-positivbeleg/);
      const f = fixture(); f.understandingInputs = [];
      assert.throws(() => C.vorbereite(paket, f), /u-version-ungedeckt/);
    });
    test("Erst/Update desselben Vorgangs bleiben endliche unterschiedliche Versionen, zentrale Grenze offen", () => {
      const p = C.vorbereite(paket, fixture(false, true));
      assert.equal(p.phasePositions.U.length, 2); assert.equal(p.completeness.multiVersionUAdmissionSupported, false);
      assert.notEqual(p.phasePositions.U[0].contractInputHash, p.phasePositions.U[1].contractInputHash);
      assert.equal(p.admissionCandidate, null);
      assert.ok(p.requiredActualInputs.includes("central-admission-multiple-u-versions-per-vorgang"));
      assert.equal(p.money.phaseGrossReserveMicroUsd.U, 424000);
    });
    test("Vollinhalt und KO-Versionen sind staerker gebunden als der bestehende40er Kennungsvertrag", () => {
      const e = fixture(), old = C.vorbereite(paket, e), changed = clone(e);
      changed.documents[0].version.text += " Neu";
      assert.equal(V.eingabeHash({ vorgangId: e.clusters[0].vorgangId, dokumente: e.documents }),
        e.understandingInputs[0].contractInputHash);
      assert.throws(() => C.vorbereite(paket, changed), /cluster-dokument-fehlt/);
      const tampered = clone(old); tampered.inputs = changed;
      assert.throws(() => C.pruefe(tampered, paket));
      const covered = fixture(true); covered.knowledgeObjects[0].version.ko_version = 2;
      assert.throws(() => C.vorbereite(paket, covered), /ko-version/);
    });
    test("Jede eingefrorene Dokument-/U-Version muss genau gedeckt sein, keine doppelten Calls", () => {
      rejects(e => e.understandingInputs.pop(), /u-version-ungedeckt/);
      rejects(e => e.understandingInputs.push(clone(e.understandingInputs[0])), /u-version-doppelt/);
      rejects(e => e.documents.push({ id: "uncovered", scope: "BT", version: { id: "uncovered", text: "Fiktiv" } }), /dokument-ungedeckt/);
      rejects(e => e.clusters.push(clone(e.clusters[0])), /cluster-doppelt/);
      rejects(e => e.documents.push(clone(e.documents[0])), /dokument-doppelt/);
      rejects(e => { e.draftInputs[1] = clone(e.draftInputs[0]); }, /draft-owner-doppelt/);
    });
    test("Positive Belege akzeptieren weder falsche Inventarhashes noch fremde KO-/Dokumentversionen", () => {
      rejects(e => { e.understandingCompleteness.documentInventoryHash = "0".repeat(64); }, /endlichkeitsbeleg-binding/);
      rejects(e => { e.understandingCompleteness.requiredVersionKeys = []; }, /endlichkeitsbeleg-binding/);
      const e = fixture(true); e.clusters[0].coverage.documentKeys = [P.hash("foreign")];
      assert.throws(() => C.vorbereite(paket, e), /u-ausschluss-positivbeleg/);
    });
    test("Kein Caller darf Attempts, Tokens, Vertragshash oder tatsächliche Requestbytes umdeklarieren", () => {
      rejects(e => { e.understandingInputs[0].attemptLimit = 2; }, /u-input/);
      rejects(e => { e.understandingInputs[0].contractInputHash = "f".repeat(40); }, /u-version-binding/);
      rejects(e => { e.draftInputs[0].requestBody = body("Fiktiv", 1500); }, /request-binding/);
      rejects(e => { e.draftInputs[0].requestBody = '{"model":"bad","model":"gpt-5-mini","input":"Fiktiv","max_output_tokens":3000}'; }, /request-binding/);
      rejects(e => { e.draftInputs[0].requestBody = JSON.stringify({ model: "gpt-5-mini", input: "Fiktiv", max_output_tokens: 3000, max_tokens: 8000 }); }, /request-binding/);
      rejects(e => { e.draftInputs[0].actualRequestHash = P.hash("self-declared"); }, /draft-input/);
    });
    test("Route braucht exakt vorhandene Requestbindungen; Aussperrung bleibt Beleg ohne Durchsetzung", () => {
      rejects(e => { e.paidRoutes[0].admittedRequestIds.pop(); }, /route-request-binding/);
      rejects(e => { e.paidRoutes[0].disposition = "ausgeschlossen"; e.paidRoutes[0].exclusionEvidence = evidence; }, /route-ausschluss-request/);
      rejects(e => { e.paidRoutes[0].model = "other-model"; }, /route-modell-binding/);
      const e = fixture(); e.paidRoutes.push({ id: "offline-excluded-embedding", provider: null, api: null,
        deploymentId: null, model: null, disposition: "ausgeschlossen", admittedRequestIds: [], priceContract: null, exclusionEvidence: evidence });
      const p = C.vorbereite(paket, e); assert.ok(p.routeInventory.every(x => x.enforcementProof === null));
      assert.equal(p.completeness.runtimeRouteEnforcementProven, false);
      e.paidRoutes[1].disposition = "unbekannt"; e.paidRoutes[1].exclusionEvidence = null;
      assert.ok(C.vorbereite(paket, e).requiredActualInputs.includes("other-paid-route-disposition"));
    });
    test("Embedding/sonstige Inputs werden mit echten Payloadhashes aufgelistet, kein erfundener Tarif", () => {
      const e = fixture(); e.paidRoutes = null;
      e.otherPaidInputs = [{ id: "fictional-embedding", routeId: "offline-embedding", inputVersion: { fictionalInput: "full" },
        requestBody: JSON.stringify({ model: "text-embedding-3-small", input: "Fiktiver Text" }),
        model: "text-embedding-3-small", maxOutputTokens: null, attemptLimit: 1 }];
      const preliminary = C.vorbereite(paket, e), o = preliminary.phasePositions.other[0];
      assert.equal(o.request.actualRequestHash, A.requestHash(e.otherPaidInputs[0].requestBody));
      assert.equal(o.reserveMicroUsd, null); assert.equal(preliminary.money.wholeRunMaximumCostMicroUsd, null);
      assert.ok(preliminary.requiredActualInputs.includes("other-paid-input-tariff-and-reserve-contract"));
    });
    test("Phasen-Bruttosummen und sequenzielle Spitzenreserve sind getrennt,6/7/Rest bleiben unveraendert", () => {
      const p = C.vorbereite(paket, fixture());
      assert.deepEqual(p.money.phaseGrossReserveMicroUsd, { U: 212000, D: 106000000, R: 106000000, other: 0 });
      assert.equal(p.money.enumeratedGrossReserveMicroUsd, 212212000); assert.equal(p.money.sequentialKnownPeakReserveMicroUsd, 212000);
      assert.equal(p.money.dailyLimitMicroUsd, 6000000); assert.equal(p.money.cumulativeLimitMicroUsd, 7000000);
      assert.equal(p.money.actualDayAndOrderHeadroomMicroUsd, null); assert.equal(p.money.requestedBudgetMicroUsd, null);
      assert.equal(p.money.wholeRunMaximumCostMicroUsd, null);
      assert.equal(p.money.conditionalInventoryReserveUpperBoundMicroUsd, 212212000);
      const e = fixture(); e.reviewMaxOutputTokens = 6000;
      assert.equal(C.vorbereite(paket, e).money.phaseGrossReserveMicroUsd.R, 112000000);
    });
    test("Hash/Rekonstruktion friert komplette Inputs ein; GO/Preis-/Output-Drift ist kein neues Gruen", () => {
      const e = fixture(), p = C.vorbereite(paket, e);
      assert.deepEqual(C.vorbereite(paket, clone(e)), p);
      assert.equal(C.pruefe(JSON.parse(C.serialisiere(p, paket)), paket).planHash, p.planHash);
      for (const mutate of [x => { x.status.executionReady = true; }, x => { x.money.dailyLimitMicroUsd++; },
        x => { x.phasePositions.R[0].actualRequestHash = P.hash("invented-review"); },
        x => { x.inputs.draftInputs[0].context.version++; }]) {
        const drift = clone(p); mutate(drift); assert.throws(() => C.pruefe(drift, paket), /plan-drift|route-request-binding/);
      }
      rejects(x => { x.paidGo = true; }, /eingaben-format/);
      rejects(x => { x.reviewMaxOutputTokens = "3000"; }, /qualitaetsmodus/);
    });
    test("PrivateCLI0600+EXCL, keine IDs/Inhalte im stdout, Symlink/Repository-Ausgabe verweigert", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-cost-plan-tests-"));
      try {
        const pfile = path.join(dir, "paket.json"), ifile = path.join(dir, "inputs.json"), out = path.join(dir, "plan.json");
        fs.writeFileSync(pfile, P.serialisiere(paket), { mode: 0o600 }); fs.writeFileSync(ifile, JSON.stringify(fixture()), { mode: 0o600 });
        const { stdout, result } = capture(() => CLI.main(["--paket", pfile, "--eingaben", ifile, "--out", out]));
        assert.equal(result.status.paidGo, false); assert.equal(fs.statSync(out).mode & 0o777, 0o600);
        assert.doesNotMatch(stdout, /fictional-cluster|Fiktiver|test-kohorte-synthetik-|fictional-gpt5/);
        const before = fs.readFileSync(out); assert.throws(() => capture(() => CLI.main(["--paket", pfile, "--eingaben", ifile, "--out", out])));
        assert.deepEqual(fs.readFileSync(out), before);
        fs.chmodSync(ifile, 0o644); assert.throws(() => CLI.lesePrivat(ifile), /private-eingabe/);
        const link = path.join(dir, "link.json"); fs.symlinkSync(pfile, link); assert.throws(() => CLI.lesePrivat(link));
        assert.throws(() => capture(() => CLI.main(["--paket", pfile, "--eingaben", pfile])));
        assert.throws(() => require("./realkohorte-500-start-sql").schreibePrivat(path.join(__dirname, "cost-plan-must-not-exist.json"), "{}"), /ausgabe-im-repository/);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    assert.equal(calls, 0); assert.equal(passed, 14);
    console.log("synthetik500-kosten-plan: " + passed + "/" + passed + " neue Offlinepruefungen bestanden;0 Anbieteraufrufe");
    return { passed, providerCalls: calls };
  } finally { global.fetch = oldFetch; https.request = oldRequest; }
}
if (require.main === module) main();
module.exports = { main, fixture, emptyInputs };
