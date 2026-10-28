"use strict";

// OFFLINE DATA ASSEMBLY ONLY. No storage, environment, clock, provider,
// constructor, admission, activation or execution API is used here.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const SCOPE = "INERT_END500_MEMORY_FIXTURE_NOT_EXECUTION_COST_QUALITY_OR_SOURCE_EVIDENCE";
const copy = x => structuredClone(x);
const json = x => JSON.stringify(x);
const bytes = x => Buffer.byteLength(json(x));
const hash = x => crypto.createHash("sha256").update(typeof x === "string" ? x : json(x)).digest("hex");
const marker = () => ({ scope: SCOPE, executionAuthority: false, actualExecution: false,
  costReceipt: false, qualityVerdict: false, sourceOrProfileApproval: false });
const inertID = (kind, id) => "INERT-W15-MEMORY-" + kind + "-" + hash(id);

// Frozen input-derived envelopes: no generated row feeds back into its own
// maximum. Object fields use their observed union/maxima, arrays use the
// largest complete observed array. This is a finite data-size envelope.
function maximumShape(values) {
  const xs = values.filter(x => x !== undefined);
  assert(xs.length > 0);
  const largest = xs.reduce((a,b) => bytes(a) >= bytes(b) ? a : b);
  if (largest === null || typeof largest !== "object" || Array.isArray(largest)) return copy(largest);
  const objects = xs.filter(x => x && typeof x === "object" && !Array.isArray(x));
  return Object.fromEntries([...new Set(objects.flatMap(Object.keys))].sort()
    .map(k => [k, maximumShape(objects.filter(x => Object.hasOwn(x,k)).map(x => x[k]))]));
}
function fieldMaxima(values) {
  return Object.fromEntries([...new Set(values.flatMap(Object.keys))].sort()
    .map(k => [k, Math.max(...values.map(x => x[k] === undefined ? 0 : bytes(x[k])))]));
}
function entropy(count, seed) {
  let text = "", n = 0;
  while (text.length < count) text += crypto.createHash("sha256").update(seed + ":" + n++).digest("base64");
  return text.slice(0,count);
}
function pad(record, minimumBytes, seed, target = record) {
  const needed = minimumBytes - bytes(record);
  if (needed > 0) target.w15InertSizePadding = entropy(needed, seed);
  assert(bytes(record) >= minimumBytes);
  return record;
}
function mark(record) { record.w15MemoryFixture = marker(); return record; }
function denyVerdicts(x) {
  if (!x || typeof x !== "object") return;
  for (const k of Object.keys(x)) {
    if (typeof x[k] === "boolean") x[k] = false;
    else if (/signatur|signature/i.test(k) && typeof x[k] === "string") x[k] = "INERT-NOT-A-SIGNATURE-" + x[k];
    else denyVerdicts(x[k]);
  }
}

function buildEnd500({ rawAuth, commandPacket, qualifiedFixtures, nativeExport }) {
  const rawBefore = hash(rawAuth);
  // Codec decoding is pure byte/dictionary restoration, not FullC/qualification.
  const packet = commandPacket?.command ? commandPacket
    : require("../../lib/helmut/synthetik-500-direct-codec").decode(commandPacket);
  const command = packet.command;
  assert(command && command.units.length === 500 && command.drafts.length === 500);
  assert(Array.isArray(qualifiedFixtures) && qualifiedFixtures.length === 500);
  assert(nativeExport.readOnly === "on" && nativeExport.activeProfiles === 0);
  for (const [key,count] of Object.entries({ evidenceRows:69, resultRows:207,
    privateDraftReviewRows:138, privateDraftStoreRows:69 })) assert.equal(nativeExport[key].length,count);
  const auth = copy(rawAuth), slot = auth.synthetik500KostenAdmission;
  const operationId = slot.plan.operationId, planHash = slot.planHash;
  assert.equal(operationId,nativeExport.operationId);
  assert.equal(operationId,command.slot.plan.operationId);
  assert.equal(planHash,command.slot.planHash);
  assert.equal(slot.plan.intents.length,1000);
  const operation = auth.synthetik500DispatchJournal.operations[operationId];
  assert(operation && operation.units.length === 500);
  const intents = new Map(slot.plan.intents.map(i => [i.id,i]));
  assert.equal(intents.size,1000);
  const fixtures = new Map(qualifiedFixtures.map(f => [f.owner,f]));
  assert.equal(fixtures.size,500);
  for (const u of command.units) {
    assert(fixtures.has(u.subject) && u.intentIds.length === 2);
    assert.deepEqual(u.intentIds.map(id => intents.get(id)?.phase),["D","R"]);
  }
  const currentUsage = rawAuth.llmUsage.filter(u => u.costPlanHash === planHash);
  assert.equal(rawAuth.llmUsage.length,5139); assert.equal(currentUsage.length,139);
  const existingUsage = new Map(currentUsage.map(u => [u.costIntentId,u]));
  assert.equal(existingUsage.size,139);
  const history = rawAuth.llmUsage.filter(u => u.costPlanHash !== planHash);
  assert.equal(history.length,5000);
  const day = slot.plan.startsAtUTC.slice(0,10), book = auth.testKostenTage[day];
  assert(book && Object.keys(book.calls).length === 139);
  const templates = {
    usage: Object.fromEntries(["D","R"].map(p => [p,maximumShape(currentUsage.filter(u => u.costPhase === p))])),
    attempt: maximumShape(Object.values(operation.attempts)), consumed: maximumShape(Object.values(slot.consumed)),
    call: maximumShape(Object.values(book.calls)), completion: maximumShape(Object.values(slot.draftCompletions)),
    review: maximumShape(Object.values(slot.reviewBindings)), output: maximumShape(Object.values(operation.outputs)),
    evidence: maximumShape(nativeExport.evidenceRows.map(r => r.data)),
    privateStore: maximumShape(nativeExport.privateDraftStoreRows.map(r => r.data))
  };
  const originalMaps = { attempts: copy(operation.attempts), outputs: copy(operation.outputs), calls: copy(book.calls),
    consumed: copy(slot.consumed), draftCompletions: copy(slot.draftCompletions), reviewBindings: copy(slot.reviewBindings) };
  const newUsage = [], usageByIntent = new Map(existingUsage), tickets = new Map();
  for (const i of slot.plan.intents) {
    const previous = operation.attempts[i.id];
    const ticket = previous?.ticketId || inertID("TICKET",i.id); tickets.set(i.id,ticket);
    const f = fixtures.get(i.owner); assert(f);
    const requestHash = i.phase === "D" ? f.requestBodySHA256 : f.reviewRequestBodySHA256;
    assert(/^[a-f0-9]{64}$/.test(requestHash));
    if (!existingUsage.has(i.id)) {
      const u = mark(copy(templates.usage[i.phase]));
      Object.assign(u,{ id:inertID("USAGE",i.id), costIntentId:i.id, costPhase:i.phase,
        budgetTicketId:ticket, costRequestHash:requestHash, costPlanHash:planHash,
        userId:i.owner, profileId:i.owner, politicianId:i.owner, model:"INERT-NOT-MODEL-OUTPUT",
        callType:"INERT-MEMORY-RECEIPT", success:false, costBasis:"INERT-NOT-A-COST-RECEIPT" });
      pad(u,bytes(templates.usage[i.phase]),i.id); newUsage.push(u); usageByIntent.set(i.id,u);
    }
    if (!previous) operation.attempts[i.id] = mark({ ...copy(templates.attempt), ticketId:ticket,
      day, status:"INERT-NOT-AN-EXECUTED-ATTEMPT" });
    if (!Object.hasOwn(slot.consumed,i.id)) slot.consumed[i.id] = mark({ ...copy(templates.consumed),
      day, ticketId:ticket, actualRequestHash:requestHash });
    if (!Object.hasOwn(book.calls,ticket)) {
      const c = mark(copy(templates.call)); c.status = "INERT-NOT-A-PAID-CALL";
      c.usageReceiptId = usageByIntent.get(i.id).id;
      Object.assign(c.admission,{ intentId:i.id,phase:i.phase,actualRequestHash:requestHash,
        operationId,planHash });
      book.calls[ticket] = c;
    }
  }
  assert.equal(newUsage.length,861);
  auth.llmUsage = [...newUsage,...auth.llmUsage];
  for (const unit of command.units) {
    const [d,r] = unit.intentIds;
    if (!Object.hasOwn(slot.draftCompletions,d)) {
      const c = mark(copy(templates.completion));
      Object.assign(c,{ owner:unit.subject, dIntentId:d, operationId, planHash,
        version:"INERT-NOT-A-D-COMPLETION", dTicket:{id:tickets.get(d),day},
        usageReceipt:{ id:usageByIntent.get(d).id, recordHash:hash(usageByIntent.get(d)) } });
      slot.draftCompletions[d] = c;
    }
    if (!Object.hasOwn(slot.reviewBindings,r)) {
      const b = mark(copy(templates.review));
      Object.assign(b,{ version:"INERT-NOT-A-REVIEW-BINDING", dIntentId:d });
      Object.assign(b.storedD,{ owner:unit.subject,id:inertID("PRIVATE-D",d) }); slot.reviewBindings[r] = b;
    }
  }

  const resultRows = copy(nativeExport.resultRows), evidenceRows = copy(nativeExport.evidenceRows);
  const privateDraftReviewRows = copy(nativeExport.privateDraftReviewRows), privateDraftStoreRows = copy(nativeExport.privateDraftStoreRows);
  const resultTemplates = Object.fromEntries(["mandatsbriefing","morgenlage","lage"].map(s =>
    [s,maximumShape(nativeExport.resultRows.filter(r => r.slot === s))]));
  const privateTemplates = Object.fromEntries(["entwurf","pruefung"].map(s =>
    [s,maximumShape(nativeExport.privateDraftReviewRows.filter(r => r.payload.phase === s))]));
  const knownBriefings = command.drafts.map(d => d.briefingEingabe.briefing);
  resultTemplates.mandatsbriefing.payload.briefing = maximumShape([
    ...nativeExport.resultRows.filter(r => r.slot === "mandatsbriefing").map(r => r.payload.briefing),...knownBriefings]);
  const largestProfileBytes = Math.max(...command.drafts.map(d => bytes(d.profile)));
  const largestMockBytes = Math.max(...qualifiedFixtures.map(f => bytes(f.draftOutput)+bytes(f.reviewOutput)));
  const largestSourceBytes = Math.max(...command.drafts.flatMap(d => d.sources.documents.map(bytes)));
  // Add the complete largest known profile, mock-output pair and Source23
  // representation as explicit per-row slack; never infer unknown BT output
  // size merely from the first69 BB/BE observations.
  const rowSlack = largestProfileBytes+largestMockBytes+largestSourceBytes;
  const resultFloors = Object.fromEntries(Object.entries(resultTemplates).map(([s,t]) => [s,bytes(t)+rowSlack]));
  const privateFloors = Object.fromEntries(Object.entries(privateTemplates).map(([s,t]) => [s,bytes(t)+rowSlack]));
  const slotArea = { mandatsbriefing:"mandatsbriefing", morgenlage:"morgenbriefing", lage:"lage" };
  const byOwner = new Map();
  for (let index=0;index<500;index++) {
    const unit=command.units[index],owner=unit.subject;
    const rows=resultRows.filter(r => r.user_id===owner);
    for (const s of Object.keys(resultTemplates)) if (!rows.some(r => r.slot===s)) {
      const row=copy(resultTemplates[s]);Object.assign(row,{id:inertID("RESULT-"+s,owner),user_id:owner});
      denyVerdicts(row.payload);mark(row.payload);pad(row,resultFloors[s],row.id,row.payload);
      resultRows.push(row);rows.push(row);
    }
    assert.equal(rows.length,3);byOwner.set(owner,rows);
    for (const phase of ["entwurf","pruefung"]) if (!privateDraftReviewRows.some(r=>r.user_id===owner&&r.payload.phase===phase)) {
      const row=copy(privateTemplates[phase]);Object.assign(row,{id:inertID("PRIVATE-"+phase,owner),user_id:owner});
      denyVerdicts(row.payload);mark(row.payload);row.payload.phase=phase;
      pad(row,privateFloors[phase],row.id,row.payload);privateDraftReviewRows.push(row);
    }
    if (!Object.hasOwn(operation.outputs,String(index))) {
      const positions=rows.map(row=>({status:"INERT-NOT-STORED-OR-REVIEWED",bereich:slotArea[row.slot],
        mandatsId:owner,fachstatus:"INERT-NOT-A-QUALITY-VERDICT",ergebnisHash:"INERT-"+hash(row)}));
      operation.outputs[index]=mark({...copy(templates.output),resultHash:"INERT-"+hash(positions),positions});
      const e=copy(templates.evidence);denyVerdicts(e);mark(e);
      Object.assign(e,{index,operationId,commandHash:operation.commandHash,version:"INERT-NOT-EXECUTION-EVIDENCE",fachabnahme:false,
        intentIds:[...unit.intentIds],positions:positions.map(p=>({...p,row:rows.find(row=>slotArea[row.slot]===p.bereich)}))});
      if(e.activeRuntime)Object.assign(e.activeRuntime,{aktiv:0,zustand:"INERT-NOT-A-RUNTIME",quittungBindungBestaetigt:false});
      const row={id:inertID("EVIDENCE",String(index)),data:e};
      pad(row,bytes(templates.evidence)+rows.reduce((n,r)=>n+bytes(r),0)+rowSlack,row.id,e);evidenceRows.push(row);
    }
    if (!privateDraftStoreRows.some(r=>r.data.completion.owner===owner)) {
      const row={id:inertID("PRIVATE-STORE",owner),data:copy(templates.privateStore)};
      denyVerdicts(row.data);mark(row.data);row.data.version="INERT-NOT-D-STORAGE-EVIDENCE";
      row.data.entry=copy(privateDraftReviewRows.find(r=>r.user_id===owner&&r.payload.phase==="entwurf"));
      row.data.completion=copy(slot.draftCompletions[unit.intentIds[0]]);row.data.usage=copy(usageByIntent.get(unit.intentIds[0]));
      pad(row,bytes(templates.privateStore)+rowSlack,row.id,row.data);privateDraftStoreRows.push(row);
    }
    operation.units[index].entered=true;
  }
  operation.index=500;operation.inFlight=null;operation.stopRequested=true;
  operation.state="INERT-MEMORY-FIXTURE-NOT-EXECUTABLE";operation.terminalReason=SCOPE;
  // Genuine J.close retains another COMPLETE slot. Its data volume must not
  // disappear from the maximum-size fixture even though no close API is run.
  operation.closedSlot=copy(slot);
  auth.w15MemoryFixture={...marker(),historicalUsageRows:5000,preservedActualTestUsageRows:139,
    syntheticUsageRows:861,counterGrowthSlack:entropy(4096,"counter-growth")};
  assert.equal(auth.llmUsage.length,6000);
  assert.deepEqual(auth.llmUsage.slice(861),rawAuth.llmUsage);
  assert.equal(Object.keys(operation.attempts).length,1000);assert.equal(Object.keys(operation.outputs).length,500);
  assert.equal(Object.keys(book.calls).length,1000);assert.equal(Object.keys(slot.consumed).length,1000);
  assert.equal(Object.keys(slot.draftCompletions).length,500);assert.equal(Object.keys(slot.reviewBindings).length,500);
  assert(operation.units.every(u=>u.entered));
  for (const [key,values] of Object.entries(originalMaps)) for (const [id,value] of Object.entries(values)) {
    const actual=key==="calls"?book.calls:key in operation?operation[key]:slot[key];assert.deepEqual(actual[id],value);
  }
  const allowed=new Set(["llmUsage","synthetik500DispatchJournal","synthetik500KostenAdmission","testKostenTage"]);
  for(const k of Object.keys(rawAuth))if(!allowed.has(k))assert.deepEqual(auth[k],rawAuth[k]);
  for(const [id,op]of Object.entries(rawAuth.synthetik500DispatchJournal.operations))if(id!==operationId)
    assert.deepEqual(auth.synthetik500DispatchJournal.operations[id],op);
  for(const [d,b]of Object.entries(rawAuth.testKostenTage))if(d!==day)assert.deepEqual(auth.testKostenTage[d],b);
  assert.equal(hash(rawAuth),rawBefore);
  for(const [rows,n]of [[evidenceRows,500],[resultRows,1500],[privateDraftReviewRows,1000],[privateDraftStoreRows,500]]) {
    assert.equal(rows.length,n);assert.equal(new Set(rows.map(r=>r.id)).size,n);
  }
  const collections={evidenceRows,resultRows,privateDraftReviewRows,privateDraftStoreRows};
  const sizes=Object.fromEntries(Object.entries(collections).map(([k,rows])=>[k,{rows:rows.length,
    serializedBytes:bytes(rows),maximumRowBytes:Math.max(...rows.map(bytes)),sha256:hash(rows)}]));
  const report={schema:"helmut-w15-inert-end500-memory-fixture/1",scope:SCOPE,
    executionAuthority:false,actualExecution:false,costOrQualityAcceptance:false,sourceQualificationRepeated:false,
    inputAuthSHA256:rawBefore,authSHA256:hash(auth),authJSONBytes:bytes(auth),closedSlotJSONBytes:bytes(operation.closedSlot),
    preservedOriginalUsageRows:5139,preservedHistoricalUsageRows:5000,preservedActualTestUsageRows:139,
    syntheticUsageRows:861,totalUsageRows:6000,enteredUnits:500,outputs:500,attempts:1000,costCalls:1000,
    consumed:1000,draftCompletions:500,reviewBindings:500,allOtherOriginalAuthFieldsPreserved:true,
    preservedExistingMapEntries:true,originalInputModified:false,collections:sizes,
    envelope:{maximumProfileBytes:largestProfileBytes,maximumQualifiedMockPairBytes:largestMockBytes,
      maximumSelectedSource23Bytes:largestSourceBytes,perGeneratedRowSlackBytes:rowSlack,resultFloors,privateFloors,
      nativeUsageFieldMaxima:fieldMaxima(currentUsage),nativeEvidenceFieldMaxima:fieldMaxima(nativeExport.evidenceRows.map(r=>r.data)),
      nativeResultFieldMaxima:fieldMaxima(nativeExport.resultRows),
      description:"One-time original native field maxima plus all500 known B/profile/source/mock inputs, with explicit complete-record slack and deterministic high-entropy padding. No generated row feeds back into the maxima. This is a conservative finite fixture envelope, not a mathematical guarantee for unknown future application fields."},
    inertness:["Only offline object assembly; no engine/API/DB methods invoked.","Original5139 usage and all existing map entries remain exact.",
      "Generated861 receipts and all new evidence/results carry INERT markers; generated quality/authority booleans are denied.",
      "Selected operation state is invalid for execution and stopRequested=true. New attempts/calls/completions are explicitly invalid as real evidence.",
      "Original approval/plan fields and reviewBindingsHash are preserved, not renewed or recalculated as authority.",
      "The full closedSlot duplicate is present solely as retained allocation volume.","Do not install in an original database or call execution/accounting/quality APIs with this fixture."],
    commonMemoryGainProven:false,full500Acceptance:false};
  return {auth,...collections,report};
}

module.exports={buildEnd500,SCOPE};
