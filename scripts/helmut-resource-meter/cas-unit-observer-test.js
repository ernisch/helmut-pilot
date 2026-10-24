"use strict";
// Pure writer/transport fixtures and literal staging; no DB, native launch or GO.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process"), vm = require("node:vm");
const { install } = require("./cas-unit-observer");
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log("PASS " + name); }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(writer = async fn => fn({})) {
  const mutations = [], units = [], events = []; let tick = 0;
  const result = { original: true };
  const storage = { mutateAuthStore: writer, synthetik500PreparedDiagnostics: () => ({ checkpoints: [] }) };
  const J = { enter(auth, hash, claim, index, utc) { auth.inFlight = { deadlineAtUTC: utc }; return result; },
    finish() { return result; }, current: auth => auth };
  const observer = install({ storage, J, mutations, units, event: (...args) => events.push(args),
    failure: e => ({ code: e.code ?? null, name: e.name }), now: () => tick++ });
  const enter = (index = 0, utc = "2030-01-01T00:01:00.000Z") => storage.mutateAuthStore(auth => J.enter(auth, null, null, index, utc));
  const finish = (index = 0) => storage.mutateAuthStore(auth => J.finish(auth, null, null, index));
  return { storage, J, mutations, units, events, observer, result, enter, finish };
}
(async () => {
  await check("enter and finish publish only at outer ACK and preserve original results", async () => {
    const f = fixture(); assert.equal(await f.enter(), f.result); assert.equal(f.units.length, 1);
    assert.equal(f.units[0].finalACKMS, null); assert.equal(await f.finish(), f.result);
    assert.equal(f.units[0].finalACKMS, f.mutations[1].ackMS);
    assert.equal(f.mutations[1].finishIndex, 0); assert(f.mutations.every(m => m.ok));
  });
  await check("confirmed conflict then success keeps one unit and earliest begin/deadline", async () => {
    const f = fixture(async fn => { await fn({}); return fn({}); }); let call = 0;
    await f.storage.mutateAuthStore(auth => f.J.enter(auth, null, null, 0,
      ++call === 1 ? "2030-01-01T00:01:00.000Z" : "2030-01-01T00:01:01.000Z"));
    const row = f.mutations[0]; assert.equal(row.callbackRuns, 2); assert.deepEqual(row.confirmedConflictAttempts, [0]);
    assert.deepEqual(row.callbacks.map(c => c.outcome), ["confirmed-conflict", "confirmed"]);
    assert.equal(f.units.length, 1); assert.equal(f.events.length, 1);
    assert.equal(f.units[0].beginMS, row.callbacks[0].enter.beginMS);
    assert.equal(f.units[0].deadlineAtUTC, "2030-01-01T00:01:00.000Z");
    assert.equal(f.units[0].persistedDeadlineAtUTC, "2030-01-01T00:01:01.000Z");
  });
  await check("finish conflict counts one confirmed final ACK", async () => {
    let writes = 0; const f = fixture(async fn => { if (writes++ > 0) await fn({}); return fn({}); });
    await f.enter(); await f.finish(); assert.equal(f.units.length, 1);
    assert.deepEqual(f.mutations[1].confirmedConflictAttempts, [0]);
    assert.equal(f.units[0].finalACKMS, f.mutations[1].ackMS);
  });
  await check("pending outer writer never publishes tentative enter", async () => {
    const ran = deferred(), ack = deferred();
    const f = fixture(async fn => { const value = await fn({}); ran.resolve(); await ack.promise; return value; });
    const pending = f.enter(); await ran.promise; assert.equal(f.units.length, 0);
    assert.equal(f.events.length, 0); assert.equal(f.mutations[0].ackMS, undefined);
    ack.resolve(); await pending; assert.equal(f.units.length, 1);
  });
  for (const code of ["ACK_LOST", "ETIMEDOUT", "REJECTED"]) await check(code + " stays unconfirmed without retry", async () => {
    const error = Object.assign(Error(code), { code }); let calls = 0;
    const f = fixture(async fn => { calls++; await fn({}); throw error; });
    await assert.rejects(f.enter(), e => e === error); assert.equal(calls, 1);
    assert.equal(f.units.length, 0); assert.equal(f.events.length, 0);
    assert.equal(f.mutations[0].ackMS, undefined); assert.equal(f.mutations[0].callbacks[0].outcome, "unconfirmed");
  });
  await check("lost finish ACK cannot confirm a final unit", async () => {
    let writes = 0; const lost = Error("lost finish ACK");
    const f = fixture(async fn => { const value = await fn({}); if (writes++ > 0) throw lost; return value; });
    await f.enter(); await assert.rejects(f.finish(), e => e === lost);
    assert.equal(f.units[0].finalACKMS, null); assert.equal(f.mutations[1].finishIndex, null);
  });
  await check("exhausted confirmed conflict is separate from unknown ACK", async () => {
    const conflict = Object.assign(Error("confirmed revision conflict"), { code: "AUTH_STORE_CONFLICT" });
    const f = fixture(async fn => { await fn({}); throw conflict; });
    await assert.rejects(f.enter(), e => e === conflict); assert.equal(f.units.length, 0);
    assert.deepEqual(f.mutations[0].confirmedConflictAttempts, [0]);
    assert.equal(f.mutations[0].callbacks[0].outcome, "confirmed-conflict");
  });
  await check("conflict followed by lost ACK preserves both distinct outcomes", async () => {
    const lost = Error("unknown second write"), f = fixture(async fn => { await fn({}); await fn({}); throw lost; });
    await assert.rejects(f.enter(), e => e === lost); assert.equal(f.units.length, 0);
    assert.deepEqual(f.mutations[0].callbacks.map(c => c.outcome), ["confirmed-conflict", "unconfirmed"]);
  });
  await check("missing callback and false outer result are not ACKs", async () => {
    for (const [writer, callbackFails] of [[async () => undefined, false],
      [async fn => { await fn({}); return false; }, false],
      [async fn => { try { await fn({}); } catch {} }, true]]) {
      const f = fixture(writer);
      await assert.rejects(callbackFails
        ? f.storage.mutateAuthStore(() => { throw Error("callback failed"); }) : f.enter());
      assert.equal(f.units.length, 0); assert.equal(f.mutations[0].ackMS, undefined);
    }
  });
  await check("retry cannot omit or change its tentative enter", async () => {
    for (const changed of [false, true]) {
      let calls = 0; const f = fixture(async fn => { await fn({}); return fn({}); });
      await assert.rejects(f.storage.mutateAuthStore(auth => {
        if (calls++ === 0) f.J.enter(auth, null, null, 0, "first");
        else if (changed) f.J.enter(auth, null, null, 1, "later");
      }));
      assert.equal(f.units.length, 0); assert.equal(f.mutations[0].ackMS, undefined);
    }
  });
  await check("duplicate unit index and unbound finish fail closed", async () => {
    const f = fixture(); await f.enter(); await assert.rejects(f.enter(), /Duplicate confirmed unit/);
    assert.equal(f.units.length, 1); await f.finish(); await assert.rejects(f.finish(), /Duplicate confirmed finish/);
    const empty = fixture(); await assert.rejects(empty.finish(), /no unique confirmed enter/);
  });
  await check("parallel async mutations retain their own attribution", async () => {
    const ready = deferred(), release = deferred(), f = fixture(); const seen = [];
    const a = f.storage.mutateAuthStore(async auth => {
      seen.push(f.observer.currentMutation().index); f.J.enter(auth, null, null, 0, "first");
      ready.resolve(); await release.promise; seen.push(f.observer.currentMutation().index);
    });
    await ready.promise;
    await f.storage.mutateAuthStore(async auth => {
      seen.push(f.observer.currentMutation().index); await Promise.resolve();
      f.J.enter(auth, null, null, 1, "second"); seen.push(f.observer.currentMutation().index);
    });
    release.resolve(); await a; assert.deepEqual(seen, [0, 1, 1, 0]);
    assert.deepEqual(f.units.map(u => u.index), [1, 0]); assert.equal(f.observer.currentMutation(), null);
    assert(f.mutations.every(m => m.callbacks.length === 1 && m.ok));
  });
  await check("journal calls outside a writer callback are rejected", async () => {
    const f = fixture(); assert.throws(() => f.J.enter({}, null, null, 0, "late"), /outside active/);
    assert.equal(f.units.length, 0);
  });
  await check("literal new lease staging installs isolated observer and preserves original", async () => {
    const directory = __dirname, original = "/workspace/helmut-parallel-20261015/wave15/native-end-preparation/observe-app.js";
    const before = fs.readFileSync(original);
    const python = `import importlib.util,json,sys\nfrom pathlib import Path\nfrom unittest.mock import patch\np=Path(sys.argv[1]);s=importlib.util.spec_from_file_location('pure_render',p/'connect-local500.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)\nc.BIN=p;c.REPO=p.parents[1]\nd={'schema':'helmut-local-atomic-usage-resource-input/1','mode':'relational-atomic-v1','production':False,'stateStorage':'merkle-auth-v1','historyReadReuse':'verified-history-reuse-v1','controlRead':'verified-control-view-v1','boundedRead':'bounded-native-read-v1','senderClaimRead':'verified-control-claim-v1','sourcePins':[],'localSourceDeltaPin':{'fixture':True},'pipelineLockLease':{'mode':'invocation-lease-v1','acceptancePin':{}}}\nwith patch.object(c,'read_atomic_descriptor',return_value=d),patch.object(c,'read_pin',return_value=d):\n rows=c.render_templates(c.AREA/'attempt-0123456789ab',target='helmut_resource_fixture_20261021_0123456789ab',container='helmut-meter-db-w20-0123456789ab',operation='synthetik500-resources21-0123456789ab',day_rows_pin={'path':str(c.BASE/'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},owner_go_pin={'path':'/tmp/NEVER_CREATED_GO'},atomic_usage_pin={})\nprint(json.dumps(next(x['text'] for x in rows if x['destination'].endswith('/observe-app.js'))))\n`;
    const rendered = spawnSync("python3", ["-c", python, directory], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr); const source = JSON.parse(rendered.stdout);
    new vm.Script(source); assert(source.includes('casObserver.currentMutation()?.index'));
    assert(!source.includes('activeMutation')); assert(!source.includes('units.push('));
    assert(source.includes(JSON.stringify(path.join(directory, "cas-unit-observer.js"))));
    assert.deepEqual(fs.readFileSync(original), before);
    // Execute the complete rendered setup with inert surrounding dependencies.
    const f = fixture(), proc = { argv: ["node", "pure", "config"], execArgv: [], env: {}, resourceUsage: () => ({ maxRSS: 1 }) };
    // Use fresh, unwrapped journal/writer for the literal install.
    const storage = { mutateAuthStore: async fn => fn({}), synthetik500PreparedDiagnostics: () => ({ checkpoints: [] }) };
    for (const key of ['withSynthetik500PreparedCommand','withSynthetik500InstallationCommand','readSynthetik500Runtime','readSynthetik500CurrentInputs','getProfileFromDb','synthetik500ReviewStorageContract','storeSynthetik500ImmutableDraft','getSynthetik500ImmutableDraft','insertLageEntwurfsbeleg','retainSynthetik500ProductionEvidence','recordLlmUsage','reserveLlmCall','loadSynthetik500ProductionCommand']) storage[key] = () => {};
    const J = { enter: (auth, a, b, index, deadlineAtUTC) => { auth.inFlight = { deadlineAtUTC }; return f.result; }, finish() {}, current: auth => auth, expiredUnclaimedPredecessor() {} };
    const R = '/workspace/helmut-cpu-epoch-20261015';
    const modules = { 'node:fs': { appendFileSync() {} }, 'node:assert/strict': assert, 'node:perf_hooks': require('node:perf_hooks'),
      'node:http': { request() {}, globalAgent: {} }, 'node:https': {}, './local-io': { configure: () => ({ config: { selector: {}, finalSourceBinding: 'source', sourcePins: [], originalPredecessor: {} } }), environment: () => ({ SUPABASE_URL: 'http://127.0.0.1:7439' }), file: () => 'unused' },
      [R+'/lib/helmut/storage']: storage, [R+'/lib/helmut/synthetik-500-content-runner']: { sourceBinding: () => 'source' },
      [R+'/lib/helmut/synthetik-500-production-command']: { validate() {} }, [R+'/lib/helmut/synthetik-500-dispatch-journal']: J, [R+'/lib/helmut/synthetik-500-profile']: {},
      [path.join(directory, 'runtime-failure-receipt.js')]: { failure: e => ({ name: e.name }) }, [path.join(directory, 'cas-unit-observer.js')]: { install } };
    const sandbox = { module: { exports: {} }, process: proc, URL, Buffer, Date, console: { log() {} }, global: { fetch: async () => ({}) }, require(name) { assert(Object.hasOwn(modules, name), name); return modules[name]; } };
    vm.runInNewContext(source, sandbox); const obs = sandbox.module.exports.setup('PURE');
    await obs.storage.mutateAuthStore(auth => obs.J.enter(auth, null, null, 0, '2030-01-01T00:01:00.000Z'));
    assert.equal(obs.units.length, 1); assert.equal(obs.mutations[0].ok, true);
  });
  console.log(JSON.stringify({ pass: true, checks, databaseCalls: 0, nativeLaunches: 0, full500Runs: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
