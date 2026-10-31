"use strict";

// Pure fixtures and Python AST extraction only: never import or run a controller.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
assert(require.cache[require.resolve("./lokaler-netzschutz")]);
const ROOT = path.resolve(__dirname, ".."), Window = require("./fixtures/w15-full500-window");
const Memory = require("./fixtures/w15-memory-contract"), limits = Memory.limits;
const cases = [
  ["2026-10-28T00:00:00.000Z", true],
  ["2026-10-28T19:29:59.999Z", true],
  ["2026-10-28T19:30:00.000Z", false],
  ["2026-10-27T19:29:59.000Z", false],
  ["2026-10-27T19:29:59.999Z", false],
  ["2026-10-27T19:30:00.000Z", false],
  ["2026-10-27T20:30:00.000Z", false],
  ["2026-10-27T23:59:59.999Z", false],
  ["2026-10-24T18:29:59.999Z", false],
  ["2026-10-24T18:30:00.000Z", false],
  ["2026-10-25T19:29:59.999Z", false],
  ["2026-10-25T19:30:00.000Z", false],
  ["2026-10-31T19:29:59.999Z", true],
  ["2026-10-31T19:30:00.000Z", false],
  ["2026-11-01T00:00:00.000Z", false]
];
for (const [now, pass] of cases) {
  if (!pass) { assert.throws(() => Window.window(now), /w15-full500-window-/); continue; }
  const result = Window.window(now), begin = Date.parse(now);
  assert.equal(Date.parse(result.startsAtUTC) - begin, 1);
  assert.equal(Date.parse(result.endsAtUTC) - begin, 10800000);
  assert.equal(Date.parse(result.completionDeadlineUTC) - begin, 12600000);
}
for (const invalid of [undefined, null, 0, "", "2026-02-30T10:00:00.000Z", "2026-10-27T10:00:00+01:00", "not-a-date"])
  assert.throws(() => Window.window(invalid), /w15-full500-window-/);
assert.deepEqual(Window.window("2026-10-28T19:29:59Z"), Window.window("2026-10-28T19:29:59.000Z"));
assert.equal(limits.comparisonBudgetBytes, 2048000000);
assert.equal(limits.requiredReserveBytes, 409600000);
assert.equal(limits.maximumConsumptionBytes, 1638400000);
assert.equal(Memory.assess(1638400000).reserveMeetsContract, true);
assert.equal(Memory.assess(1638400001).reserveMeetsContract, false);
assert.equal(Memory.assess(1558614016).comparisonReserveBytes - limits.requiredReserveBytes, 79785984);

const proposal = JSON.parse(fs.readFileSync(path.join(ROOT,
  "docs/betrieb/belege/w15-processing-20261027/FULL500_MOCK_GO_PROPOSAL.SAFE.json"), "utf8"));
assert.equal(proposal.executionAuthorized, false); // Historical proposal is not the new operator GO.
assert.equal(proposal.plannedContainer.existingPGDataMountAllowed, false);
assert.equal(proposal.plannedContainer.publishedPortsAllowed, false);
assert.equal(proposal.plannedContainer.newServerOrHetznerAllowed, false);
for (const flag of ["--pull=never", "--network=none", "--restart=no", "--memory=2048000000", "--memory-swap=2048000000"])
  assert(proposal.plannedContainer.flags.includes(flag));
assert.equal(proposal.memory.allAppDBGatewayDriverMockWorkersAndAuditInside, true);
assert.equal(proposal.memory.baselineSubtractionOrPeakReset, false);
assert.equal(proposal.cleanup.recoveryPeakMustNotReplaceOriginalPeak, true);
assert.equal(proposal.cleanup.missingOriginalFinalPeakOrEventsMeansUnknownNotPass, true);
assert.equal(proposal.productionOrPaidModelOrBudgetOrMergeActionsAllowed, false);

// The runtime's exported observer helper has no action or application imports.
const Observer = require("./synthetik-500-w15-full500-runtime");
const originalKinds = ["load", "load", "admission", "load", "admission", "load", "load", "admission",
  "load", "load", "admission", "load", "load", "admission", "load", "admission"];
const points = originalKinds.map((kind, index) => ({ kind, observedAt: 1793123515000 + index }));
const covered = Observer.checkpointAssessment(points);
assert.equal(covered.count, 16);
assert.equal(covered.original16FreshControls, true);
assert.equal(covered.checkpointKinds.load, 10);
assert.equal(covered.checkpointKinds.admission, 6);
assert.equal(Observer.checkpointAssessment(points.slice(1)).original16FreshControls, false);
assert.equal(Observer.checkpointAssessment([...points, { kind: "load" }]).original16FreshControls, false);
assert.equal(Observer.checkpointAssessment(points.map((point, index) => index === 0 ? { ...point, kind: "admission" } : point)).original16FreshControls, false);
assert.equal(Observer.checkpointAssessment(points.map((point, index) => index === 0 ? { ...point, observedAt: NaN } : point)).original16FreshControls, false);
const envelope = (id, kind, begin) => ({ id, kind, beginMS: begin, ackMS: begin + 50, endMS: begin + 51,
  wallMs: 51, acknowledged: true, ...(kind === "usage-sink" ? { blobAcknowledged: true, storageAcknowledged: true } : {}) });
const write = (envelopeId, begin) => ({ envelopeId, rowId: "main-auth", beginMS: begin + 10,
  ackMS: begin + 40, endMS: begin + 41, wallMs: 31, acknowledged: true });
const auth = { mutations: [envelope(1, "public-mutation", 0)], usageSinks: [envelope(2, "usage-sink", 100)],
  casWrites: [write(1, 0), write(2, 100)] };
assert.equal(Observer.authCoverageAssessment(auth).pass, true);
assert.equal(Observer.authCoverageAssessment(auth).usage1000, false);
for (const change of [
  x => { x.casWrites.pop(); },
  x => { x.casWrites[0].envelopeId = 99; },
  x => { x.casWrites[0].beginMS = -1; },
  x => { x.casWrites[0].ackMS = x.casWrites[0].beginMS - 1; },
  x => { x.casWrites[0].wallMs = -1; },
  x => { x.casWrites[0].acknowledged = false; },
  x => { x.casWrites[0].wallMs = 30000; },
  x => { x.mutations[0].wallMs = 30000; },
  x => { x.usageSinks[0].storageAcknowledged = false; },
  x => { x.usageSinks[0].id = x.mutations[0].id; }
]) {
  const invalid = structuredClone(auth); change(invalid);
  assert.equal(Observer.authCoverageAssessment(invalid).pass, false);
}
const grown = { mutations: [], usageSinks: [], casWrites: [] };
for (let i = 0; i < 1000; i++) {
  grown.usageSinks.push(envelope(i + 1, "usage-sink", i * 100));
  grown.casWrites.push(write(i + 1, i * 100));
}
assert.equal(Observer.authCoverageAssessment(grown).usage1000, true);
assert.equal(Observer.authCoverageAssessment(grown).pass, true);

// Only check_window's function body is extracted. No top-level Python statement
// from the real executor is compiled or executed by this test.
const python = String.raw`import ast,datetime,json,pathlib,sys,zoneinfo
source=pathlib.Path(sys.argv[1]);tree=ast.parse(source.read_text())
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='check_window']
assert len(functions)==1,'one pure check_window required'
scope={'datetime':datetime,'zoneinfo':zoneinfo,'ZoneInfo':zoneinfo.ZoneInfo}
for node in tree.body:
    if isinstance(node,ast.ImportFrom) and node.module in ('datetime','zoneinfo'):
        module=datetime if node.module=='datetime' else zoneinfo
        for alias in node.names:
            assert alias.name!='*','no wildcard clock imports'
            scope[alias.asname or alias.name]=getattr(module,alias.name)
exec(compile(ast.Module(body=functions,type_ignores=[]),str(source),'exec'),scope)
result=[]
for stamp,expected in json.loads(sys.argv[2]):
    now=datetime.datetime.fromisoformat(stamp.replace('Z','+00:00'))
    try:
        window=scope['check_window'](now)
    except (ValueError,AssertionError) as error:
        if expected: raise
        result.append({'pass':False})
    else:
        assert expected,'unexpected window acceptance'
        result.append({'pass':True,'window':window})
paths={}
for node in tree.body:
    if not isinstance(node,ast.Assign): continue
    for target in node.targets:
        if not isinstance(target,ast.Name) or target.id not in ('WORK','BASE','DB','CONTAINER'): continue
        value=node.value
        if isinstance(value,ast.Call) and len(value.args)==1 and not value.keywords:
            assert isinstance(value.func,ast.Attribute) and value.func.attr=='Path'
            value=value.args[0]
        paths[target.id]=ast.literal_eval(value)
assert len(paths)==4,'dedicated full500 artifact constants required'
print(json.dumps({'windows':result,'paths':paths}))`;
const controller = path.join(__dirname, "synthetik-500-w15-full500-controller.py");
const result = spawnSync("python3", ["-I", "-S", "-B", "-c", python, controller, JSON.stringify(cases)], {
  encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH }
});
assert.equal(result.status, 0, result.stderr);
const extracted = JSON.parse(result.stdout), windows = extracted.windows;
assert.match(extracted.paths.WORK, /^\/workspace\/shared\/helmut-w15-full500-[A-Za-z0-9_-]+$/);
assert.match(extracted.paths.BASE, /^\/tmp\/w15-full500-[A-Za-z0-9_-]+$/);
assert.match(extracted.paths.DB, /^helmut_w15_full500_[a-z0-9_]+$/);
assert.match(extracted.paths.CONTAINER, /^[a-zA-Z0-9_-]*full500[a-zA-Z0-9_-]*$/);
assert.notEqual(extracted.paths.DB, "helmut_w15_input_20261027");
assert.notEqual(extracted.paths.CONTAINER, "synthetik500-runtime-pg-7e1c20261027");
cases.forEach(([stamp, pass], index) => {
  assert.equal(windows[index].pass, pass);
  if (pass) {
    const expected = Window.window(stamp), actual = windows[index].window;
    for (const name of Object.keys(expected)) assert.equal(Date.parse(actual[name]), Date.parse(expected[name]));
  }
});
async function simulatedObserver() {
  // The original CAS module itself has only pure definitions. Its writer is
  // replaced before observeAuth captures it; no original request can execute.
  const Cas = require("../lib/helmut/auth-store-cas"), original = Cas.writeConditional;
  let acknowledgedWrites = 0;
  try {
    Cas.writeConditional = async function(store, options) {
      assert.equal(options.rowId, "main-auth"); await Promise.resolve(); acknowledgedWrites++; return store;
    };
    const state = {}, finalACKs = [];
    const FakeS = {
      async acquirePipelineLock() { throw Error("fictional-unused-lock"); },
      async releasePipelineLock() { throw Error("fictional-unused-lock"); },
      async mutateAuthStore(fn) { await fn(state); return Cas.writeConditional(state, { rowId: "main-auth" }); },
      async recordLlmUsage() {
        await Cas.writeConditional(state, { rowId: "main-auth" });
        return { id: "PURE_FAKE_USAGE", _ablage: { blob: true } };
      }
    };
    const observed = Observer.observeAuth(FakeS, { currentIndex: () => 7,
      onFinalACK: (index, ackMS) => {
        assert.equal(acknowledgedWrites, 1); assert.equal(index, 7);
        finalACKs.push({ index, ackMS });
      } });
    await FakeS.mutateAuthStore(async store => {
      store.fixture = true; await Promise.resolve(); observed.context().finishIndex = 7;
    });
    await FakeS.recordLlmUsage();
    assert.equal(finalACKs.length, 1);
    assert.equal(finalACKs[0].ackMS, observed.mutations[0].ackMS);
    assert.equal(observed.mutations[0].callbackRuns, 1);
    assert.equal(observed.assessment().pass, true);
    // An internal lexical usage writer must retain its own CAS envelope while
    // the surrounding public mutation later performs its separate CAS.
    await FakeS.mutateAuthStore(async () => { await FakeS.recordLlmUsage(); });
    assert.equal(observed.mutations.length, 2); assert.equal(observed.usageSinks.length, 2);
    assert.equal(observed.casWrites.length, 4); assert.equal(observed.assessment().pass, true);
    await Cas.writeConditional(state, { rowId: "main-auth" });
    assert.equal(observed.casWrites.at(-1).envelopeId, null);
    assert.equal(observed.assessment().allWritesAssigned, false);
    assert.equal(observed.assessment().pass, false);
  } finally { Cas.writeConditional = original; }
  assert.equal(Cas.writeConditional, original);
}
simulatedObserver().then(() => {
  console.log("PASS: pure full500 UTC/Berlin/order-date gates; exact3h+30min; shared20% memory boundaries; isolation/recovery artifact scope; checkpoint/Auth/CAS and fake-observer coverage; actual Python window parity. No controller, DB, container, unit or network executed.");
}).catch(error => { console.error(error); process.exitCode = 1; });
