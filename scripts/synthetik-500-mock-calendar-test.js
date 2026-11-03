'use strict';
const assert = require('assert');
const { VERSION, validateRecord } = require('../lib/helmut/synthetik-500-mock-calendar');

const SOURCE = {
  schema: 'helmut-w15-isolated-mock-source-authorization/1', contract: 'helmut-w15-mock-historical-qualified-source-replay/1',
  branch: 'refs/heads/codex/w15-github-end500-preparation-20261028', exactCommit: 'a'.repeat(40),
  runId: '12345678', runAttempt: 1,
  nonce: '12345678-1234-4123-8123-123456789abc', approvalSHA256: 'b'.repeat(64),
  sourceQualificationSHA256: 'c'.repeat(64),
  productionAllowed: false, paidModelsAllowed: false
};

const DAYS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];

function authorization() {
  return { ...SOURCE, schema: 'helmut-w15-isolated-mock-calendar-authorization/1', contract: VERSION, historicalPricesOnly: true };
}

function windowFor(day) {
  return { startsAtUTC: `${day}T10:00:00.000Z`, endsAtUTC: `${day}T12:59:59.999Z`, completionDeadlineUTC: `${day}T13:29:59.999Z` };
}

function record(day) {
  return {
    schema: 'helmut-w15-mock-calendar-scope/1',
    contract: VERSION,
    authorization: authorization(),
    sourceAuthorization: { ...SOURCE },
    window: windowFor(day),
    selector: { operationId: 'synthetik500-calendar-fixture', commandHash: 'd'.repeat(64) }
  };
}

function run() {
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const throws = (fn, msg) => { assert.throws(fn, /synthetik500-mock-calendar-/, msg); checks++; };

  for (const day of DAYS) {
    const input = record(day);
    const out = validateRecord(input, `${day}T12:00:00.000Z`);
    ok(out !== input, `${day}: clone`);
    ok(out.permission === undefined, `${day}: no permission`);
    out.selector.operationId = 'changed';
    out.authorization.nonce = 'changed';
    out.window.startsAtUTC = 'changed';
    ok(input.selector.operationId === 'synthetik500-calendar-fixture' && input.authorization.nonce === SOURCE.nonce && input.window.startsAtUTC === `${day}T10:00:00.000Z`, `${day}: unlinked`);
  }
  const noSelector = record('2026-11-03');
  noSelector.selector = null;
  ok(validateRecord(noSelector, '2026-11-03T12:00:00.000Z').selector === null, 'null selector accepted');
  console.log(`PASS group 1: approved days and clone (${checks} checks)`);

  for (const day of ['2026-10-31', '2026-11-08']) {
    throws(() => validateRecord(record(day), `${day}T12:00:00.000Z`), `${day}: outside window`);
  }
  console.log(`PASS group 2: unapproved days (${checks} checks)`);

  const reject = (mutate, label) => {
    const input = record('2026-11-03');
    mutate(input);
    throws(() => validateRecord(input, '2026-11-03T12:00:00.000Z'), label);
  };
  reject((r) => { r.authorization.nonce = '00000000-0000-4000-8000-000000000000'; }, 'nonce binding');
  reject((r) => { r.sourceAuthorization.exactCommit = 'e'.repeat(40); }, 'commit binding');
  reject((r) => { r.sourceAuthorization.productionAllowed = true; r.authorization.productionAllowed = true; }, 'production flag');
  reject((r) => { r.sourceAuthorization.paidModelsAllowed = true; r.authorization.paidModelsAllowed = true; }, 'paid flag');
  reject((r) => { r.authorization.historicalPricesOnly = false; }, 'historical only');
  reject((r) => { r.extra = true; }, 'unknown field');
  reject((r) => { r.schema = 'helmut-w15-mock-calendar-scope/2'; }, 'unknown version');
  console.log(`PASS group 3: bindings and schema (${checks} checks)`);

  throws(() => validateRecord(record('2026-11-03'), '2026-11-03T09:59:59.999Z'), 'before start');
  throws(() => validateRecord(record('2026-11-03'), '2026-11-03T13:29:59.999Z'), 'expired');
  const crossing = record('2026-11-03');
  crossing.window = { startsAtUTC: '2026-11-03T23:00:00.000Z', endsAtUTC: '2026-11-04T01:59:59.999Z', completionDeadlineUTC: '2026-11-04T02:29:59.999Z' };
  throws(() => validateRecord(crossing, '2026-11-04T00:00:00.000Z'), 'day crossing');
  const shortEnd = record('2026-11-03');
  shortEnd.window.endsAtUTC = '2026-11-03T12:59:58.999Z';
  throws(() => validateRecord(shortEnd, '2026-11-03T12:00:00.000Z'), 'window duration');
  const shortDeadline = record('2026-11-03');
  shortDeadline.window.completionDeadlineUTC = '2026-11-03T13:29:58.999Z';
  throws(() => validateRecord(shortDeadline, '2026-11-03T12:00:00.000Z'), 'completion duration');
  const loose = record('2026-11-03');
  loose.window.startsAtUTC = '2026-11-03T10:00:00Z';
  throws(() => validateRecord(loose, '2026-11-03T12:00:00.000Z'), 'canonical iso');
  console.log(`PASS group 4: now and windows (${checks} checks)`);
  console.log(`PASS total ${checks} checks`);
}

if (require.main === module) {
  try { run(); } catch (err) { console.error(`FAIL ${err.message}`); process.exit(1); }
}

module.exports = { record };
