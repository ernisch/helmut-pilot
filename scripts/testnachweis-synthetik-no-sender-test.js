"use strict";
// Fictional, offline contract tests. No fixture is an actual no-sender admission.
const A = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const C = require("../lib/helmut/synthetik-500-production-command"), J = require("../lib/helmut/synthetik-500-dispatch-journal");
const P = require("../lib/helmut/synthetik-500-profile"), N = require("../lib/helmut/synthetik-500-u-no-sender");
// Reuse the existing fictional input constructor, without running its suite.
const original = fs.readFileSync(path.join(__dirname, "synthetik-500-production-adapter-test.js"), "utf8");
const fixture = new Function("require", original.slice(0, original.indexOf("async function main()")) + "\nreturn fixture;")(require);
const START = "2030-01-02T12:00:00.000Z", clone = structuredClone;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("PASS " + name); };
function setup() {
  const f = fixture();
  const KO = require("../lib/helmut/knowledge-object-version");
  f.command.understanding[0].sources.knowledgeObjects = [{ ...Object.fromEntries(KO.VERSION_FIELDS.map(k => [k, null])),
    id: "ko-fiktive-präsidentin", vorgang_id: "fixture-only", ko_version: 1, verstehen_fencing: 1, status: "complete", understanding_status: "complete" }];
  const originalCommand = clone(f.command); J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth));
  J.claim(f.auth, P.hash(f.command), "fictional-original-claim", START); J.enter(f.auth, P.hash(f.command), "fictional-original-claim", 0, START);
  J.stop(f.auth, P.hash(f.command), "unit-not-confirmed");
  const old = clone(J.current(f.auth));
  f.command.slot.plan.operationId = "synthetik500-production-fake-next"; f.command.slot.planHash = P.hash(f.command.slot.plan);
  const pred = { operationId: old.operationId, commandHash: old.commandHash, planHash: old.planHash, journalHash: P.hash(old), qualification: "no-sender", noSenderProofHash: "e".repeat(64) };
  f.command.predecessors = [pred];
  return { ...f, old, pred, originalCommand };
}
function refresh(f) { Object.assign(f.record, { commandHash: P.hash(f.command), planHash: f.command.slot.planHash, controlHash: C.controlHash(f.auth), booksHash: C.booksHash(f.auth) }); }
const proofFor = f => ({ version: N.VERSION, predecessor: Object.fromEntries(N.BASE_KEYS.map(k => [k, f.pred[k]])), originalJournal: f.old,
  providerCalls: 0, productionCommit: "c".repeat(40), primaryEvidencePins: [], originalEvidencePins: {} });
function main() {
  test("one qualified handover preserves the failed operation and all books", () => {
    const f = setup(), before = clone(f.auth), oldPin = P.hash(f.old); C.validate(f.command);
    J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth));
    A.equal(P.hash(f.auth[J.KEY].operations[f.old.operationId]), oldPin); A.equal(J.current(f.auth).state, "installed");
    A.deepEqual(f.auth.testKostenAuftrag, before.testKostenAuftrag); A.deepEqual(f.auth.testKostenTage, before.testKostenTage);
    A.equal(f.auth[J.KEY].operations[f.old.operationId].state, "unknown"); A.equal(f.auth[J.KEY].operations[f.old.operationId].units[0].entered, true);
    A.throws(() => J.claim(f.auth, f.old.commandHash, "old-replay", START), /already-claimed/);
    A.throws(() => J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth)), /previous-operation|permanent-once/);
  });
  for (const status of ["reserved", "sent", "unknown", "not-sent", "accounted"]) test("attempt " + status + " never qualifies", () => {
    const f = setup(); f.old.attempts[f.old.units[0].intentIds[0]] = { status }; f.pred.journalHash = P.hash(f.old);
    A.equal(N.qualified(f.old, f.command), false);
  });
  const edits = [x => x.outputs[0] = { resultHash: "f".repeat(64) }, x => x.state = "closed", x => x.stopRequested = false,
    x => x.index = 1, x => x.terminalReason = "other", x => x.claimId = null, x => x.claimId = "", x => x.closedSlot = {},
    x => x.units[0].entered = false, x => x.units[0].kind = "DR", x => x.units.push(clone(x.units[0])), x => x.inFlight = null,
    x => x.inFlight.index = 1, x => x.inFlight.intentIds = ["other"], x => x.units[0].intentIds = []];
  edits.forEach((edit, i) => test("structural negative " + i + " even with recomputed journal pin", () => {
    const f = setup(); edit(f.old); f.pred.journalHash = P.hash(f.old); A.equal(N.qualified(f.old, f.command), false);
  }));
  test("changed old journal refuses its original pin", () => { const f = setup(); f.old.claimedAtUTC = "2030-01-02T12:00:01.000Z"; A.equal(N.qualified(f.old, f.command), false); });
  for (const edit of [f => f.command.units[0].subject = "other-pair", f => f.command.mode = "D-R-500"]) test("first handover cannot skip the required U pair", () => {
    const f = setup(), before = clone(f.auth); edit(f); A.throws(() => J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth)), /first-handover/); A.deepEqual(f.auth, before);
  });
  test("a later entered U remains consumed despite the qualified original", () => {
    const f = setup(); J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth));
    J.claim(f.auth, P.hash(f.command), "fictional-next", START); J.enter(f.auth, P.hash(f.command), "fictional-next", 0, START);
    const next = J.current(f.auth); next.state = "closed"; next.inFlight = null; // Fictional already-accounted boundary only.
    f.command.slot.plan.operationId = "synthetik500-production-fake-third"; f.command.slot.planHash = P.hash(f.command.slot.plan);
    const before = clone(f.auth); A.throws(() => J.install(f.auth, f.command, P.hash(f.command), C.controlHash(f.auth)), /u-predecessor-consumed/); A.deepEqual(f.auth, before);
  });
  for (const edit of [f => f.command.predecessors.push(clone(f.pred)), f => f.pred.qualification = "retry", f => f.pred.noSenderProofHash = "bad", f => f.pred.extra = true]) test("closed predecessor shape rejects override", () => {
    const f = setup(); edit(f); A.throws(() => C.validate(f.command), /predecessor/);
  });
  test("ordinary U admission does not acquire a new mandatory gate", () => {
    const f = fixture(); A.equal(C.admission(f.command, f.record, START, true), P.hash(f.command));
  });
  test("noSender predecessor requires an additional genuine gate", () => {
    const f = setup(); refresh(f); A.throws(() => C.admission(f.command, f.record, START, true), /complete-actual-gates/);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-no-sender-fictional-")); fs.chmodSync(dir, 0o700);
  try {
    const pin = file => { const b = fs.readFileSync(file); return { path: file, bytes: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex") }; };
    const write = (file, value) => { fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return pin(file); };
    const primaries = [0, 1, 2].map(i => write(path.join(dir, `fictional-primary-${i}.json`), { fictional: true, i }));
    const f = setup(), proof = proofFor(f), plan = f.originalCommand.slot.plan;
    const evidence = {
      scope: { method: "POST", path: "/api/cron/testnachweis-status?modus=synthetik500-u-vorlauf", retry: false, actual500: false, profilesActive: 0,
        body: JSON.stringify({ operationId: f.old.operationId, commandHash: f.old.commandHash }), commit: proof.productionCommit, host: plan.routeContract.route.deploymentHost },
      native: { slot: f.originalCommand.slot, journal: f.old, operationId: f.old.operationId, selectedUsageBlob: [], selectedUsageRelational: [], activeProfiles: 0,
        ownTicketSummary: Object.fromEntries(["cost", "status", "reserved", "admission", "createdAt", "maxOutputTokens"].map(k => [k, null])), ownEvidenceCount: 1,
        ownEvidence: { operationId: f.old.operationId, commandHash: f.old.commandHash, index: 0, result: null, postimage: null, failure: "unit-not-confirmed" } },
      packet: { command: f.originalCommand },
      installed: { operationId: f.old.operationId, commandHash: f.old.commandHash,
        ...Object.fromEntries(["packetExact", "slotExact", "journalExact", "exactOwnAuditRow", "oldFullParentRowsAndXminsUnchanged", "todayUsageNativeHashUnchanged", "todayCounterNativeHashUnchanged"].map(k => [k, true])) },
      runtime: { content: [{ type: "text", text: JSON.stringify({ result: { deployment: { state: "READY", meta: { githubCommitSha: proof.productionCommit },
        url: plan.routeContract.route.deploymentHost, id: plan.routeContract.route.deploymentId } } }) }] },
      qualification: { status: "QUALIFIED_ZERO_PROVIDER_SENDERS_NOT_YET_NATIVE_RECONCILED", actualProviderCalls: 0, actualHTTPAttemptsToHelmut: 1,
        independentReview: { status: "ok" }, originalProductionCommit: proof.productionCommit, originalJournal: f.old, ...proof.predecessor },
      reader: "async function readSynthetik500CurrentInputs(expected) { /* !/^[A-Za-z0-9_-]{1,200}$/.test(id) */ }",
      adapter: "await storage.readSynthetik500CurrentInputs(input.sources); async function executeUnits() { await guard(command, claimId, index); await u.understandOneCluster(); }"
    };
    const evidenceBytes = Object.fromEntries(Object.entries(evidence).map(([role, value]) => [role, Buffer.from(typeof value === "string" ? value : JSON.stringify(value))]));
    proof.originalEvidencePins = Object.fromEntries(Object.entries(evidenceBytes).map(([role, value]) => {
      const file = path.join(dir, "fictional-" + role + ".txt"); fs.writeFileSync(file, value, { mode: 0o600 }); return [role, pin(file)];
    }));
    proof.primaryEvidencePins = [...primaries, ...Object.values(proof.originalEvidencePins)];
    const proofPin = write(path.join(dir, "proof.json"), proof); f.pred.noSenderProofHash = proofPin.sha256; refresh(f);
    f.record.gates.noSender = true; const gates = [...Object.keys(f.record.gates)];
    for (const purpose of gates) f.record.evidencePins[purpose] = write(path.join(dir, purpose + ".json"), {
      version: C.ACTUAL_GATE_VERSION, purpose, rootExecutor: "/root", operationId: f.command.slot.plan.operationId,
      runId: f.command.slot.plan.runId, productionCommit: f.record.productionCommit, planHash: f.record.planHash, commandHash: f.record.commandHash,
      acceptedActualScope: true, primaryEvidencePins: purpose === "noSender" ? [proofPin] : [primaries[0]] });
    const commandPin = write(path.join(dir, "command.json"), f.command), recordPin = write(path.join(dir, "admission.json"), f.record);
    test("real loader verifies the complete fictional private gate/proof chain", () => { A.equal(C.loadPacket(commandPin, recordPin, START).command.version, C.VERSION); });
    for (const [role, edit] of [
      ["scope", x => x.commit = "f".repeat(40)], ["scope", x => x.body = JSON.stringify({ operationId: "foreign", commandHash: f.old.commandHash })],
      ["native", x => x.selectedUsageRelational.push({ runId: "fictional-sent" })], ["native", x => x.ownTicketSummary.status = "reserviert"],
      ["native", x => x.ownEvidence.commandHash = "f".repeat(64)], ["installed", x => x.packetExact = false],
      ["qualification", x => x.actualProviderCalls = 1], ["runtime", x => x.isError = true]
    ]) test("original semantic evidence negative " + role, () => {
      const bad = { ...evidenceBytes }, value = clone(evidence[role]); edit(value); bad[role] = Buffer.from(JSON.stringify(value));
      A.throws(() => N.validateOriginalEvidence(proof, bad), /original|qualification/);
    });
    test("a changed nested primary is refused by the real loader", () => {
      fs.writeFileSync(primaries[2].path, "changed"); A.throws(() => C.loadPacket(commandPin, recordPin, START), /private-evidence-file|evidence-bytes/);
    });
    for (const edit of [x => x.providerCalls = 1, x => x.originalJournal = {}, x => x.primaryEvidencePins = [], x => x.productionCommit = "bad", x => x.override = true]) test("proof structural negative", () => {
      const bad = clone(proof); edit(bad); A.throws(() => N.validateProof(bad, f.command), /private-qualified-proof/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(JSON.stringify({ passed, modelCalls: 0, production: false, actualNoSenderAdmission: false }));
}
if (require.main === module) main();
module.exports = { main };
