"use strict";

// Dormant server-only entry. No route, CLI switch, environment flag, activation,
// generator or paid retry. DR next steps select only an unentered unit from
// the same permanent claim; a caller supplies only installed IDs.
const { randomUUID } = require("node:crypto");
const C = require("./synthetik-500-production-command");
const P = require("./synthetik-500-profile");
const J = require("./synthetik-500-dispatch-journal");
const K = require("./testkosten-budget");
const A = require("./synthetik-500-kosten-admission");
const requireThat = C.requireThat;
const now = () => new Date().toISOString();
const copy = x => structuredClone(x);
function environment(command) {
  requireThat(K.aktiv() && (process.env.HELMUT_PRODUCTION_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA) === command.slot.plan.productionCommit,
    "inactive-or-deployment-drift");
  require("./storage").synthetik500ProductionBackend();
}
function financial(auth, day) {
  requireThat([7000000, 20000000].includes(K.auftragsStand(auth, day)?.limitMicroUsd), "existing-7-or-20-USD-order-required");
  if (auth[K.KEY]?.[day]) requireThat(K.pruefeTag(auth[K.KEY][day], day).limit === 6000000, "existing-6-USD-day-required");
}
function predecessors(auth, command) {
  for (const x of command.predecessors) {
    const old = auth[J.KEY]?.operations?.[x.operationId];
    requireThat(old?.state === "closed" && old.commandHash === x.commandHash && old.planHash === x.planHash
      && !old.inFlight && old.index === old.units.length && old.units.every(u => u.kind === "U")
      && P.hash(old) === x.journalHash, "genuine-accounted-u-predecessor-required");
  }
}
async function install(commandPin, admissionPin) {
  const time = now(), packet = C.loadPacket(commandPin, admissionPin, time), command = packet.command;
  environment(command);
  const storage = require("./storage"), day = time.slice(0, 10);
  const counter = await storage.leseLlmTageszaehler(time);
  // External persistence is outside the retryable Auth callback. An unknown
  // INSERT cannot be retried/upserted into a fresh allowance.
  await storage.stageSynthetik500ProductionCommand(packet);
  await storage.mutateAuthStore(auth => {
    C.admission(command, packet.admission, now(), true);
    requireThat(C.booksHash(auth) === packet.admission.booksHash, "fresh-books-cas");
    financial(auth, day); K.pruefeStart(auth, day, counter); predecessors(auth, command);
    J.install(auth, command, P.hash(command), packet.admission.controlHash);
  });
  return { operationId: command.slot.plan.operationId, commandHash: P.hash(command), installed: true, started: false };
}
function selection(args) {
  requireThat(C.exact(args, ["operationId", "commandHash"]) && /^synthetik500-[a-z0-9-]{8,80}$/.test(args.operationId)
    && /^[a-f0-9]{64}$/.test(args.commandHash), "closed-selector-only");
}
async function load(args) {
  selection(args);
  const packet = await require("./storage").loadSynthetik500ProductionCommand(args.operationId, args.commandHash);
  C.admission(packet.command, packet.admission, now()); environment(packet.command);
  return packet;
}
async function currentInputs(command, index) {
  const unit = command.units[index], storage = require("./storage");
  requireThat(unit, "finite-unit-missing");
  const input = unit.kind === "U" ? command.understanding[index] : command.drafts[index];
  await storage.readSynthetik500CurrentInputs(input.sources);
  if (unit.kind === "DR") {
    requireThat(require("./briefing-frische").berlinTagKey(new Date(input.briefingDatum))
      === require("./briefing-frische").berlinTagKey(new Date()), "briefing-day-drift");
    const profile = await storage.getProfileFromDb(unit.subject);
    requireThat(profile && C.same(profile, input.profile), "current-profile-drift");
    require("./briefing-lagebindung").pruefe(input.briefingEingabe, profile, profile.id, new Date(input.briefingDatum));
  }
  return input;
}
async function guard(command, claimId, index) {
  environment(command);
  await currentInputs(command, index);
  return controlGuard(command, claimId, index);
}
async function controlGuard(command, claimId, index) {
  environment(command);
  const storage = require("./storage");
  const auth = await storage.readAuthStore({ strict: true });
  environment(command);
  const c = J.bind(auth, P.hash(command), claimId, now());
  requireThat(c.index === index && c.inFlight?.index === index, "current-unit-drift");
  financial(auth, now().slice(0, 10));
  if (auth[K.KEY]?.[now().slice(0, 10)]) K.kontrolliere(auth, now().slice(0, 10));
  return auth;
}
async function beforeSend(ticket) {
  // All failures here precede HTTPS, including late input/window/CAS rejection.
  // Understanding must not misclassify that rejection as content failure.
  return require("./synthetik-500-u-guard").provedPreSend(() => claimSend(ticket));
}
async function claimSend(ticket) {
  const args = { operationId: ticket.execution?.operationId, commandHash: ticket.execution?.commandHash };
  const { command } = await load(args), storage = require("./storage");
  const auth = await storage.readAuthStore({ strict: true }), c = J.bind(auth, args.commandHash, ticket.execution.claimId, now());
  await guard(command, ticket.execution.claimId, c.index);
  await storage.mutateAuthStore(store => {
    environment(command); financial(store, now().slice(0, 10));
    J.sending(store, ticket, now());
  });
  // ai revalidates captured body/route/window after this await and immediately
  // before HTTPS. A durable send claim is never reopened if that check fails.
}
function uDependencies(command, input, claimId, index) {
  const U = require("./understanding"), intent = command.slot.plan.intents.find(x => x.id === input.intentId);
  const costAdmission = { operationId: command.slot.plan.operationId, planHash: command.slot.planHash,
    routeContractHash: P.hash(command.slot.plan.routeContract) };
  const deps = U.defaultDeps({ runId: command.slot.plan.runId, costAdmission });
  require("./synthetik-500-u-guard").attach(deps, async actual => {
    requireThat(actual?.vorgangId === intent.vorgangId && actual?.contractInputHash === intent.contractInputHash, "u-pair-drift");
    await guard(command, claimId, index);
  }, () => controlGuard(command, claimId, index));
  // Only resolver readers are bound; the provider and real fenced writers stay
  // the unchanged defaultDeps implementations, never caller-supplied functions.
  for (const method of ["getExisting", "getExistingStreng", "findVorgangCandidates", "listVorgangDocuments"]) {
    const real = method === "getExisting" ? deps.getExistingStreng : deps[method], key = method === "getExistingStreng" ? "getExisting" : method;
    deps[method] = async (...args) => {
      const selector = key === "findVorgangCandidates" ? P.hash(args) : args[0];
      requireThat(Object.hasOwn(input.reads[key], selector), "outside-frozen-resolver-scope");
      const value = await real(...args);
      requireThat(C.same(value, input.reads[key][selector]), "current-resolver-drift");
      return value;
    };
  }
  // This adapter never discovers a pending/backlog population.
  deps.listPending = deps.listWiederaufnahmen = () => { throw Error("synthetik500-production-broad-discovery-forbidden"); };
  return deps;
}
async function views(command, input, claimId, index) {
  const owner = input.profile.id;
  const storage = require("./storage"), day = require("./briefing-frische").berlinTagKey(new Date());
  const B = require("./briefing-speicher"), L = require("./briefing-lauf");
  const binding = require("./briefing-lagebindung").pruefe(input.briefingEingabe, input.profile, owner, new Date(input.briefingDatum));
  await guard(command, claimId, index);
  // Supply the admitted existing briefing, never a builder which could select
  // new work or send another model. Materialization uses the existing writer.
  await B.materialisiere({ profile: input.profile, userId: owner, briefing: input.briefingEingabe.briefing,
    aussagenEingabeHash: binding.eingabeHash, storage });
  const packet = await B.lese({ userId: owner, day, profile: input.profile, storage });
  const morning = await storage.getRenderedBriefingV3(owner, L.SLOT_ERFOLG, day, { strict: true });
  if (!morning && packet?.payload.pruefung.strukturellVollstaendig) {
    await guard(command, claimId, index);
    const q = L.quittung({ tenantId: owner, berlinTag: day, status: L.STATUS_ERFOLG, ausloeser: L.AUSLOESER_NACHLAUF,
      erzeugtAm: new Date(), fensterStart: command.slot.plan.startsAtUTC,
      signatur: L.inhaltsSignatur(packet.payload.briefing), ausgabeBeleg: require("./briefing-ausgabebeleg").ausPaket(packet) });
    const entry = { id: L.laufId(owner, day), user_id: owner, slot: L.SLOT_ERFOLG, generated_at: q.erzeugtAm, payload: q };
    const saved = await storage.insertSynthetik500MorningReceipt(entry);
    requireThat(saved?.saved === true, "morning-insert-not-confirmed");
    const back = await storage.getRenderedBriefingV3(owner, L.SLOT_ERFOLG, day, { strict: true });
    requireThat(back && C.same(back.payload, q) && Date.parse(back.generated_at) === Date.parse(q.erzeugtAm), "morning-readback");
  }
  const positions = [];
  for (const area of P.BEREICHE) {
    const row = await storage.getRenderedBriefingV3(owner, area === "morgenbriefing" ? L.SLOT_ERFOLG : area, day, { strict: true });
    const inWindow = row && Date.parse(row.generated_at) >= Date.parse(command.slot.plan.startsAtUTC)
      && Date.parse(row.generated_at) < Date.parse(command.slot.plan.endsAtUTC);
    positions.push({ mandatsId: owner, bereich: area, status: !row ? "missing" : inWindow ? "stored-unreviewed" : "outside-window",
      row: row || null, ergebnisHash: row ? P.hash(row) : null, fachstatus: "ausstehend" });
  }
  return positions;
}
async function productionStart(args) {
  const { command, admission } = await load(args), storage = require("./storage"), claimId = randomUUID();
  // Check U input identity before permanently claiming the first unit.
  // The normal guard still checks it again after entry and before paid effects.
  if (command.mode === "U-prestage") await currentInputs(command, 0);
  const counter = await storage.leseLlmTageszaehler(now());
  // Never stop another winner when our concurrent claim is rejected.
  await storage.mutateAuthStore(auth => {
    requireThat(C.booksHash(auth) === admission.booksHash, "claim-books-cas");
    financial(auth, now().slice(0, 10)); K.pruefeStart(auth, now().slice(0, 10), counter);
    predecessors(auth, command); J.claim(auth, args.commandHash, claimId, now());
    if (command.mode === "D-R-500") J.enter(auth, args.commandHash, claimId, 0, now());
  });
  const indexes = command.mode === "D-R-500" ? [0] : command.units.map((_, index) => index);
  return executeUnits(args, command, claimId, storage, indexes, command.mode === "D-R-500");
}
function nextState(auth, args, claimId, index, time) {
  const c = J.bind(auth, args.commandHash, claimId, time);
  requireThat(c.operationId === args.operationId && typeof claimId === "string" && claimId.length > 0
    && Number.isSafeInteger(index) && index > 0 && index < c.units.length && c.index === index
    && !c.inFlight && c.units.every(u => u.kind === "DR") && !c.units[index].entered
    && c.units.slice(0, index).every((u, i) => u.entered && c.outputs[i]
      && u.intentIds.every(id => c.attempts[id]?.status === "accounted"))
    && Object.values(c.attempts).every(a => a.status === "accounted"), "next-unit-not-proven-unentered");
  return c;
}
async function productionNext(args) {
  const { command } = await load(args), storage = require("./storage");
  requireThat(command.mode === "D-R-500", "next-only-installed-500-dr");
  const observed = await storage.readAuthStore({ strict: true }), c = J.current(observed);
  const claimId = c?.claimId, index = c?.index;
  nextState(observed, args, claimId, index, now());
  const counter = await storage.leseLlmTageszaehler(now());
  // Pin observed claim and index across CAS retries. A losing request cannot
  // advance to a later unit or stop the winner; enter remains before the try.
  await storage.mutateAuthStore(auth => {
    environment(command); nextState(auth, args, claimId, index, now());
    financial(auth, now().slice(0, 10)); K.pruefeStart(auth, now().slice(0, 10), counter);
    J.enter(auth, args.commandHash, claimId, index, now());
  });
  return executeUnits(args, command, claimId, storage, [index], true);
}
async function executeUnits(args, command, claimId, storage, indexes, alreadyEntered) {
  let pendingEvidence = null, retentionAttempted = false;
  try {
    if (command.mode === "D-R-500") await storage.synthetik500ReviewStorageContract();
    const costAdmission = { operationId: command.slot.plan.operationId, planHash: command.slot.planHash,
      routeContractHash: P.hash(command.slot.plan.routeContract) };
    for (const index of indexes) {
      if (!alreadyEntered) await storage.mutateAuthStore(auth => J.enter(auth, args.commandHash, claimId, index, now()));
      const unit = command.units[index];
      pendingEvidence = { version: "helmut-synthetik500-production-unit-evidence/1", operationId: args.operationId,
        commandHash: args.commandHash, index, intentIds: unit.intentIds, result: null, postimage: null, positions: [], fachabnahme: false };
      retentionAttempted = false;
      await guard(command, claimId, index);
      let result, positions = [], postimage = null;
      if (unit.kind === "U") {
        requireThat(require("./verstehen-vertrag").casAktiv(), "native-u-cas-required");
        const input = command.understanding[index];
        result = await require("./understanding").understandOneCluster(copy(input.cluster), uDependencies(command, input, claimId, index), {});
        pendingEvidence.result = result;
        requireThat(["saved", "updated"].includes(result?.status), "u-not-confirmed");
        postimage = await storage.getSynthetik500UnderstandingPostimage(result.id, result.vorgangId, input.cluster.documents.map(x => x.id));
      } else {
        const input = command.drafts[index], r = command.slot.plan.intents.find(x => x.id === unit.intentIds[1]);
        result = await require("./lage").buildLageBriefing(copy(input.profile), {
          missingOnly: true, costRunId: command.slot.plan.runId, costAdmission,
          costInputVersionHash: command.slot.plan.intents.find(x => x.id === input.intentId).inputVersionHash,
          briefingEingabe: copy(input.briefingEingabe), synthetik500Input: require("./synthetik-500-lage-input").create(input),
          pruefaufwandNachweis: r.maxOutputTokens === 6000,
          beforeGenerate: () => guard(command, claimId, index), beforeSave: () => guard(command, claimId, index) });
        pendingEvidence.result = result;
        requireThat(result?.available === true, "lage-not-confirmed");
        await guard(command, claimId, index);
        positions = await views(command, input, claimId, index);
      }
      const evidence = { version: "helmut-synthetik500-production-unit-evidence/1", operationId: args.operationId,
        commandHash: args.commandHash, index, intentIds: unit.intentIds, result, postimage, positions, fachabnahme: false };
      pendingEvidence = evidence;
      retentionAttempted = true;
      await storage.retainSynthetik500ProductionEvidence(args.operationId, index, evidence);
      await storage.mutateAuthStore(auth => {
        const slot = auth.synthetik500KostenAdmission;
        for (const id of unit.intentIds) {
          const consumed = slot.consumed[id], call = auth[K.KEY]?.[consumed?.day]?.calls?.[consumed?.ticketId];
          requireThat(call?.status === "abgerechnet" && call.admission?.intentId === id && call.admission.planHash === command.slot.planHash,
            "unit-actual-ledger-not-accounted");
        }
        J.finish(auth, args.commandHash, claimId, index, P.hash(evidence), positions.map(({ row, ...p }) => p), now());
        // Final DR finish and close are one CAS: no completed-running gap and
        // no delayed prior caller can close or stop a later successful step.
        if (command.mode === "D-R-500" && index + 1 === command.units.length) J.close(auth, args.commandHash, claimId);
      });
    }
    if (command.mode !== "D-R-500") await storage.mutateAuthStore(auth => J.close(auth, args.commandHash, claimId));
    const completedUnits = indexes[indexes.length - 1] + 1;
    return { state: completedUnits === command.units.length ? "closed" : "running", operationId: args.operationId,
      units: command.units.length, completedUnits, dispatchedUnits: indexes.length,
      expectedPositions: command.mode === "D-R-500" ? 1500 : 0, independentFinalAcceptance: false, profilesActivated: false };
  } catch {
    // An await is allowed to finish and account its result. No Promise.race can
    // refund it while an actual sender is still running; no second dispatch.
    if (pendingEvidence && !retentionAttempted) {
      try { await storage.retainSynthetik500ProductionEvidence(args.operationId, pendingEvidence.index,
        { ...pendingEvidence, failure: "unit-not-confirmed" }); } catch { /* No retry of an unknown private INSERT. */ }
    }
    try { await storage.mutateAuthStore(auth => J.stop(auth, args.commandHash, "unit-not-confirmed")); }
    catch { /* The permanent claimed state remains; never retry/resume it. */ }
    throw Error("synthetik500-production-stopped-or-unknown");
  }
}
async function requestStop(args) {
  selection(args);
  await require("./storage").mutateAuthStore(auth => {
    requireThat(J.current(auth)?.operationId === args.operationId, "stop-operation");
    J.stop(auth, args.commandHash, "root-stop");
  });
}
async function status(args) {
  selection(args);
  const storage = require("./storage"), packet = await storage.loadSynthetik500ProductionCommand(args.operationId, args.commandHash);
  const auth = await storage.readAuthStore({ strict: true }), c = auth[J.KEY]?.operations?.[args.operationId];
  requireThat(c?.commandHash === args.commandHash, "status-command");
  const positions = packet.command.mode === "D-R-500" ? packet.command.drafts.flatMap((d, index) =>
    P.BEREICHE.map(area => c.outputs[index]?.positions.find(p => p.bereich === area) || {
      mandatsId: d.profile.id, bereich: area, status: c.units[index].entered ? "unconfirmed" : "not-reached", fachstatus: "ausstehend" })) : [];
  return { state: c.state, terminalReason: c.terminalReason, consumedOperation: c.claimId !== null,
    dispatchedOrUnknown: Object.keys(c.attempts).length, positions, fachabnahme: false, activationByAdapter: false };
}
module.exports = { install, productionStart, productionNext, beforeSend, requestStop, status };
