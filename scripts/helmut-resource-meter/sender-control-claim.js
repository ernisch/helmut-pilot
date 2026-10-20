"use strict";
// Local sender observation only. Import/create perform no database/network IO;
// each call uses the existing fresh verified control transport in this process.
const assert = require('node:assert/strict');
const Atomic = require('../../lib/helmut/llm-usage-atomic');
const MODE = 'verified-control-claim-v1';
function claimFromControl(control, selector, index, phase, day) {
  assert(['D','R'].includes(phase));assert(Number.isInteger(index)&&index>=0&&index<500);
  const value = { journal: control.synthetik500DispatchJournal,
    slot: control.synthetik500KostenAdmission, book: control.testKostenTage[day] };
  const operation=value.journal.operations[selector.operationId],unit=operation?.units?.[index];
  assert(unit);const id=unit.intentIds[phase==='D'?0:1],consumed=value.slot.consumed[id],attempt=operation.attempts[id];
  assert(consumed);const call=value.book.calls[consumed.ticketId];assert.equal(operation.inFlight.index,index);
  return {operationId:operation.operationId,commandHash:operation.commandHash,index:operation.inFlight.index,
    journalState:operation.state,attemptStatus:attempt.status,reservationStatus:call.status,
    actualRequestHash:call.admission.actualRequestHash};
}
function create({ descriptorPin, readControl }) {
  // Lazy dependency: descriptor source closure includes this file itself.
  const d = require('./atomic-usage-integration').readDescriptor(descriptorPin);
  assert.equal(d.senderClaimRead, MODE);assert.equal(d.boundedRead, 'bounded-native-read-v1');
  assert.equal(d.controlRead, 'verified-control-view-v1');assert.equal(d.stateStorage, 'merkle-auth-v1');
  assert.equal(d.historyReadReuse, 'verified-history-reuse-v1');assert.equal(typeof readControl, 'function');
  return async function readSenderClaim(selector, index, phase, body) {
    assert(Atomic.enabled() && Atomic.controlReadEnabled(), 'Explicit local verified control mode required');
    assert.equal(process.env.HELMUT_AUTH_GRAPH_READ_REUSE, undefined);
    assert.equal(process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE, undefined);
    const day = new Date().toISOString().slice(0,10);
    const control = await readControl();
    return claimFromControl(control, selector, index, phase, day);
  };
}
module.exports = { MODE, create, claimFromControl };
