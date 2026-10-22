"use strict";

// One separately admitted LOCAL fixture attempt through the actual Lage/AI
// pipeline. No callbacks, provider, storage implementation or old500 claim can
// be supplied by a caller. The full500 adapter remains independent.
const P = require("./synthetik-500-profile");
const C = require("./synthetik-500-production-command");
const Calendar = require("./synthetik-500-local-calendar");
const Scope = require("./local-unit-diagnostic-scope");
const now = () => new Date().toISOString();
const need = (ok, code) => { if (!ok) throw Error("local-unit-diagnostic-motor-" + code); };
function selector(args) {
  need(C.exact(args, ["operationId", "commandHash"])
    && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(args.operationId)
    && /^[a-f0-9]{64}$/.test(args.commandHash), "closed-selector-required");
}
function consumers() {
  const storage = require("./storage");
  need(["readSynthetik500CurrentInputs", "getProfileFromDb",
    "synthetik500ReviewStorageContract", "retainLocalUnitDiagnosticEvidence", "readLocalUnitDiagnosticEvidence"]
    .every(name => typeof storage[name] === "function"), "native-consumers-missing");
  need(["readState", "mutateState", "costAdmission", "confirmFinalACK"].every(name => typeof Scope[name] === "function"),
    "own-state-consumers-missing");
  return storage;
}
async function guard() {
  const { command } = Scope.currentVerified(), storage = consumers(), input = command.drafts[0];
  // Source runtime and native target are independently rechecked. No elapsed
  // timer, cached witness or JSON qualified:true can stand in for this consumer.
  await Scope.verifyRuntime();
  await storage.readSynthetik500CurrentInputs(input.sources);
  const profile = await storage.getProfileFromDb(input.profile.id);
  need(profile && C.same(profile, input.profile), "current-profile-drift");
  const bindingHash = require("./briefing-lagebindung").pruefe(input.briefingEingabe, profile,
    profile.id, new Date(input.briefingDatum), { acceptedSnapshot: true }).eingabeHash;
  Scope.guard(await Scope.readState(), now());
  return bindingHash;
}
async function beforeSend(ticket) {
  Scope.assertTicket(ticket);
  await guard();
  await Scope.beforeSend(ticket);
}
async function views(command, input) {
  const storage = consumers(), owner = input.profile.id, day = Calendar.outputDay();
  const B = require("./briefing-speicher"), L = require("./briefing-lauf");
  const bindingHash = await guard();
  await B.materialisiere({ profile: input.profile, userId: owner, briefing: input.briefingEingabe.briefing,
    aussagenEingabeHash: bindingHash, storage });
  const packet = await B.lese({ userId: owner, day, profile: input.profile, storage });
  const morning = await storage.getRenderedBriefingV3(owner, L.SLOT_ERFOLG, day, { strict: true });
  need(!morning && packet?.payload.pruefung.strukturellVollstaendig === true,
    "fresh-three-position-namespace-required");
  await guard();
  const receipt = L.quittung({ tenantId: owner, berlinTag: day, status: L.STATUS_ERFOLG,
    ausloeser: L.AUSLOESER_NACHLAUF, erzeugtAm: new Date(), fensterStart: command.slot.plan.startsAtUTC,
    signatur: L.inhaltsSignatur(packet.payload.briefing),
    ausgabeBeleg: require("./briefing-ausgabebeleg").ausPaket(packet) });
  const entry = { id: L.laufId(owner, day), user_id: owner, slot: L.SLOT_ERFOLG,
    generated_at: receipt.erzeugtAm, payload: receipt };
  need((await storage.insertSynthetik500MorningReceipt(entry))?.saved === true, "morning-insert-unknown");
  const back = await storage.getRenderedBriefingV3(owner, L.SLOT_ERFOLG, day, { strict: true });
  need(back && C.same(back.payload, receipt)
    && Date.parse(back.generated_at) === Date.parse(receipt.erzeugtAm), "morning-readback");
  const positions = [];
  for (const area of P.BEREICHE) {
    const row = await storage.getRenderedBriefingV3(owner, area === "morgenbriefing" ? L.SLOT_ERFOLG : area,
      day, { strict: true });
    const inWindow = row && Date.parse(row.generated_at) >= Date.parse(command.slot.plan.startsAtUTC)
      && Date.parse(row.generated_at) < Date.parse(command.slot.plan.endsAtUTC);
    positions.push({ mandatsId: owner, bereich: area,
      status: !row ? "missing" : inWindow ? "stored-unreviewed" : "outside-window",
      row: row || null, ergebnisHash: row ? P.hash(row) : null, fachstatus: "ausstehend" });
  }
  need(positions.length === 3 && positions.every(p => p.status === "stored-unreviewed"
    && p.row.user_id === owner), "three-native-positions-required");
  return positions;
}
async function artifacts(command) {
  const storage = consumers(), input = command.drafts[0], day = Calendar.outputDay();
  const prefix = `bf-${input.profile.id}-lage-pruefentwurf-${day}-${command.slot.plan.runId}-`;
  const draft = await storage.getLageEntwurfsbeleg(input.profile.id, prefix + "entwurf");
  const review = await storage.getLageEntwurfsbeleg(input.profile.id, prefix + "pruefung");
  need(draft?.payload.phase === "entwurf" && review?.payload.phase === "pruefung",
    "fresh-draft-review-evidence-required");
  const own = Scope.authority(await Scope.readState());
  return structuredClone({ draft, review, slot: own.slot, costs: own.costs });
}
async function execute(args) {
  selector(args); consumers();
  return Scope.runClaimed(args, async () => {
    const { command, selection } = Scope.currentVerified(), storage = consumers();
    need(selection.operationId === args.operationId && selection.commandHash === args.commandHash,
      "scope-selector-drift");
    const unit = command.units[0], input = command.drafts[0];
    const entered = Scope.authority(await Scope.readState()).journal.inFlight;
    need(entered?.index === 0 && C.utc(entered.enteredAtUTC) && C.utc(entered.deadlineAtUTC),
      "native-enter-receipt-required");
    const deadline = Date.parse(entered.deadlineAtUTC);
    let pending = { schema: "helmut-local-unit-diagnostic-evidence/1", ...args,
      sourceIndex: 499, diagnosticUnit: 0, intentIds: [...unit.intentIds], result: null, positions: [],
      enteredAtUTC: entered.enteredAtUTC, deadlineAtUTC: entered.deadlineAtUTC,
      full500Accepted: false, independentFinalAcceptance: false, production: false };
    let retentionAttempted = false;
    try {
      await storage.synthetik500ReviewStorageContract();
      await guard();
      const d = command.slot.plan.intents[0];
      pending.result = await require("./lage").buildLageBriefing(structuredClone(input.profile), {
        missingOnly: true, costRunId: command.slot.plan.runId,
        costAdmission: Scope.costAdmission(),
        costInputVersionHash: d.inputVersionHash, briefingEingabe: structuredClone(input.briefingEingabe),
        synthetik500Input: require("./synthetik-500-lage-input").create(input, command.slot.plan),
        pruefaufwandNachweis: command.slot.plan.intents[1].maxOutputTokens === 6000,
        beforeGenerate: guard, beforeSave: guard });
      need(pending.result?.available === true && pending.result.fromCache !== true, "fresh-lage-not-confirmed");
      await guard();
      pending.positions = await views(command, input);
      pending.artifacts = await artifacts(command);
      await guard();
      const evidenceHash = P.hash(pending);
      retentionAttempted = true;
      await storage.retainLocalUnitDiagnosticEvidence(selection, pending);
      const retained = await storage.readLocalUnitDiagnosticEvidence(selection);
      need(C.same(retained, pending), "evidence-readback-unknown");
      const positionHashes = pending.positions.map(p => ({ bereich: p.bereich, owner: p.mandatsId, hash: p.ergebnisHash }));
      const finalACK = await Scope.mutateState(auth => {
        Scope.retain(auth, evidenceHash, positionHashes);
        return Scope.finish(auth, evidenceHash, positionHashes, now());
      });
      await Scope.confirmFinalACK(finalACK);
      need(finalACK?.state === "closed" && finalACK.units === 1 && finalACK.completedUnits === 1
        && finalACK.expectedPositions === 3 && Date.now() < deadline, "final-ack-not-confirmed-in-unit-window");
      return { state: "closed", ...args, sourceIndex: 499, diagnosticUnit: 0, units: 1,
        completedUnits: 1, dispatchedUnits: 1, expectedPositions: 3, evidenceHash,
        independentFinalAcceptance: false, full500Accepted: false, production: false,
        paidProviderCallsAllowed: false, retryAllowed: false };
    } catch (cause) {
      // A lost insert/ACK remains terminal. Never send, refund, install or insert
      // again merely because the first operation's outcome is unknown.
      if (!retentionAttempted) {
        retentionAttempted = true;
        try { await storage.retainLocalUnitDiagnosticEvidence(selection,
          { ...pending, failure: "unit-not-confirmed" }); } catch { /* no retry */ }
      }
      try { await Scope.mutateState(auth => Scope.stop(auth, "unit-not-confirmed")); }
      catch { /* consumed claim stays consumed */ }
      throw new Error("local-unit-diagnostic-stopped-or-unknown", { cause });
    }
  });
}

module.exports = Object.freeze({ execute, beforeSend });
