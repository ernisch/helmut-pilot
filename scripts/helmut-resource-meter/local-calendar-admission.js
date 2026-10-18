"use strict";
// Source-only host checks. This does not register a transport or admit execution.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const Calendar = require("../../lib/helmut/synthetik-500-local-calendar");
const STATUS = "ROOT_AND_INDEPENDENT_ACCEPTED_LOCAL_MOCK_FIXTURE_CALENDAR";
function admit(day, read, { descriptor = null, operation = null, rowsPin = null } = {}) {
  if (day.status !== STATUS) {
    assert(!Object.hasOwn(day, "localCalendar") && !descriptor?.localCalendar);
    return null;
  }
  const p = Calendar.validatePolicyData(day.localCalendar);
  assert.equal(day.day, p.executionDayUTC); assert.equal(day.startsAtUTC, p.startsAtUTC); assert.equal(day.endsAtUTC, p.endsAtUTC);
  if (operation) assert.equal(p.operationId, operation);
  if (descriptor) {
    assert.deepEqual(descriptor.localCalendar, p); assert.equal(descriptor.production, false);
    assert.equal(descriptor.fullContractUnchanged, false); assert.equal(descriptor.timingMemoryAndLiveSecurityContractUnchanged, true);
  }
  if (rowsPin) assert.deepEqual(day.adoptedRowsPin, rowsPin);
  const source = read(day.sourceDayAcceptance);
  assert.equal(source.status, "ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER");
  assert.equal(source.day, p.sourceDay); assert.deepEqual(source.adoptedRowsPin, day.adoptedRowsPin);
  assert.equal(source.positiveOriginalA, 500); assert.equal(source.positiveOriginalF, 500); assert.equal(source.positiveOriginalLAtBothWindowEnds, 500);
  assert(Date.parse(source.startsAtUTC) <= Date.parse(p.sourceViewAtUTC) && Date.parse(p.sourceViewAtUTC) <= Date.parse(source.endsAtUTC));
  for (const k of ["positiveOriginalA", "positiveOriginalF", "positiveOriginalLAtSourceView", "profiles"]) assert.equal(day[k], 500);
  for (const k of ["allPositionsReviewed", "currentTemporalJudgmentAccepted", "rootAdoptsExactIndependentScope",
    "realExecutionClockPreserved", "freshSecurityChecksPreserved"]) assert.equal(day[k], true);
  assert(!Object.hasOwn(day, "positiveOriginalLAtBothWindowEnds"));
  const review = read(day.independentReview);
  assert.equal(review.model, "deepseek-v4-pro"); assert.equal(review.route?.effort, "high"); assert.equal(review.payload?.summary?.status, "ok");
  const rows = read(day.adoptedRowsPin); assert.equal(rows.length, 500);
  const hashes = rows.map(r => r.briefingEingabe.eingabe.eingabeHash);
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(hashes)).digest("hex"), p.sourceInputsHash);
  return p;
}
module.exports = { STATUS, admit };
