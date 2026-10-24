'use strict';
// Exercise authenticated observer functions only; never execute the driver/main.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const base = path.join(__dirname, 'auth-physical8-native-launcher');
const raw = fs.readFileSync(path.join(base, 'PREPARED.SAFE.json'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(raw), '2b8b40fdb62a5b69b98325e3538fd45dea84b3b5a95bde3b186cfd7256b52875');
const prepared = JSON.parse(raw), file = path.join(base, 'control-driver.js');
const bytes = fs.readFileSync(file), pin = prepared.files.find(p => p.path === file);
assert(pin && pin.bytes === bytes.length && pin.sha256 === sha(bytes));
const source = bytes.toString('utf8');
const first = source.slice(source.indexOf('function reconcileGC('), source.indexOf('const gcObserver='));
const second = source.slice(source.indexOf('function physicalDiagnostics('), source.indexOf('const wireFields='));
assert(first.startsWith('function reconcileGC(') && second.startsWith('function physicalDiagnostics('));
const gc = {count: 0, durationMilliseconds: 0, kinds: {}, last16: []};
const brackets = [];
const context = vm.createContext({gc, brackets, performance: {now: () => 10000},
  physicalClock: {snapshotsAtomic: false}, perfConstants: {NODE_PERFORMANCE_GC_MAJOR: 4},
  requireThat(ok, message) { if (!ok) throw Error(message); }});
vm.runInContext(first + '\n' + second + '\nthis.api={recordGC,reconcileGC,physicalDiagnostics};', context,
  {timeout: 1000, filename: 'authenticated-physical8-observer-functions'});
const api = context.api, checks = [];
function check(name, condition) { assert(condition, name); checks.push(name); }
function event(startTime, duration = 1, kind = 4, flags = 0) {
  return {startTime, duration, detail: {kind, flags}};
}
const frame = {round: 1, edge: 'end', sampleBefore: 10, sampleAfter: 20,
  gc: {countAtSample: 0, latestBefore: null, overlapCount: 0, overlaps: []}};
brackets.push(frame);
api.recordGC(event(8));
check('late delivery reconciles preceding major', frame.gc.latestBefore.startTime === 8);
api.recordGC(event(3));
check('older event delivered later cannot replace latest by time', frame.gc.latestBefore.startTime === 8);
api.recordGC(event(19, 4));
check('late overlap is annotated retrospectively', frame.gc.overlapCount === 1);
for (let i = 0; i < 8; i++) api.recordGC(event(12, 1, 1));
check('all overlaps counted', frame.gc.overlapCount === 9);
check('raw overlap storage bounded at four', frame.gc.overlaps.length === 4);
for (let i = 0; i < 40; i++) api.recordGC(event(100 + i));
check('global ring bounded at sixteen', gc.last16.length === 16);
check('ring truncation retains retrospective overlap evidence', frame.gc.overlapCount === 9 && frame.gc.overlaps.length === 4);
check('preceding event annotation survives ring truncation', frame.gc.latestBefore.startTime === 8);
brackets.length = 0;
for (let i = 1; i <= 8; i++) brackets.push({round: i, edge: 'end', sampleBefore: 1000 + i,
  gc: {latestBefore: {kind: 4, flags: 0, startTime: 990 + i, duration: 1, deliveredAt: 1000 + i},
    overlapCount: 0, overlaps: []}});
let report = api.physicalDiagnostics();
check('only predeclared fixed four/eight pair', JSON.stringify(report.fixedPair) === '[4,8]');
check('all eight endpoints retained', JSON.stringify(report.endpointRounds) === '[1,2,3,4,5,6,7,8]');
check('operational compatibility is recorded', report.operationalStageCompatible === true);
check('compatible screen never becomes causal attribution', report.attributionStatus === 'INCONCLUSIVE' && report.undeliveredEventsUnknown);
brackets[3].gc.latestBefore = null;
check('missing fixed endpoint cannot be replaced by another pair', api.physicalDiagnostics().operationalStageCompatible === false);
brackets[3].gc.latestBefore = {kind: 4, flags: 1, startTime: 994, duration: 1};
check('different flags reject compatibility', api.physicalDiagnostics().operationalStageCompatible === false);
brackets[3].gc.latestBefore.flags = 0;
brackets[3].gc.overlapCount = 1;
check('overlapping physical sample rejects compatibility', api.physicalDiagnostics().operationalStageCompatible === false);
brackets[3].gc.overlapCount = 0;
brackets[3].gc.latestBefore.kind = 1;
check('minor GC cannot be branded equivalent major stage', api.physicalDiagnostics().operationalStageCompatible === false);
brackets[3].gc.latestBefore.kind = 4;
brackets[3].gc.latestBefore.startTime = 10;
check('age difference beyond predeclared tolerance rejects compatibility', api.physicalDiagnostics().operationalStageCompatible === false);
console.log(JSON.stringify({pass: true, gcChecks: checks.length, checks,
  testScope: 'Actual authenticated observer functions with synthetic late GC events; no driver, process sampling or EOF test',
  nativeActions: 0, sqlActions: 0, modelCalls: 0, full500: false}));
