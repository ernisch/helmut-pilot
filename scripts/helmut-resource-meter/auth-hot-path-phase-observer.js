"use strict";

// Diagnostic copies only. No global loader hook, workload, source edit or activation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const ROOT = '/workspace/helmut-cpu-epoch-20261015/lib/helmut';
const PINS = Object.freeze({
  'llm-usage-atomic.js': '93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b',
  'auth-state-parts.js': 'f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63'
});
const sha = text => createHash('sha256').update(text).digest('hex');
function once(source, from, to) {
  assert.equal(source.split(from).length, 2, 'unique diagnostic source anchor');
  return source.replace(from, to);
}
function loadObserved({sourceRoot}) {
  assert.equal(sourceRoot, ROOT);
  const url = new URL(process.env.SUPABASE_URL);
  assert.equal(url.protocol, 'http:');
  assert.ok(/^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/.test(url.hostname));
  assert.ok(!process.env.VERCEL);
  assert.equal(process.env.HELMUT_LLM_USAGE_STORAGE, 'relational-atomic-v1');
  assert.equal(process.env.HELMUT_AUTH_STATE_STORAGE, 'merkle-auth-v1');
  assert.equal(process.env.HELMUT_AUTH_HISTORY_READ_REUSE, 'verified-history-reuse-v1');
  assert.equal(process.env.HELMUT_AUTH_CONTROL_READ, 'verified-control-view-v1');
  let active = null, operations = 0, spans = 0;
  const instrumentedSHA256 = {};
  function begin(label) {
    assert.ok(active, 'phase outside an explicit observation');
    assert.ok(++spans <= 128, 'bounded phase spans');
    const row = {label, beginMS: performance.now(), cpuBegin: process.cpuUsage(),
      memoryBefore: process.memoryUsage()};
    active.phases.push(row);
    return row;
  }
  function end(row) {
    row.wallMS = performance.now() - row.beginMS;
    row.cpu = process.cpuUsage(row.cpuBegin);
    row.memoryAfter = process.memoryUsage();
    delete row.cpuBegin;
  }
  function sync(label, fn) {
    const row = begin(label);
    try { return fn(); } finally { end(row); }
  }
  async function asynchronous(label, fn) {
    const row = begin(label);
    try { return await fn(); } finally { end(row); }
  }
  const hooks = Object.freeze({begin, end, sync});
  function readSource(name) {
    const file = path.join(ROOT, name);
    assert.equal(fs.realpathSync(file), file);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = fs.fstatSync(fd);
      assert.ok(before.isFile());
      const source = fs.readFileSync(fd, 'utf8');
      const after = fs.fstatSync(fd);
      assert.equal(before.size, after.size);
      assert.equal(before.mtimeMs, after.mtimeMs);
      assert.equal(sha(source), PINS[name]);
      assert.ok(!source.includes('__helmutPhase'));
      return source;
    } finally { fs.closeSync(fd); }
  }
  function wrapDeclaration(source, name, label) {
    source = once(source, 'function ' + name + '(', 'function __helmutPhaseOriginal_' + name + '(');
    return source + '\nfunction ' + name + '(...args) { return __helmutPhase.sync(' + JSON.stringify(label)
      + ', () => __helmutPhaseOriginal_' + name + '(...args)); }\n';
  }
  function compile(name, source, parts) {
    source = once(source, '"use strict";', '"use strict";\nconst __helmutPhase = require("helmut-private-phase-hooks");');
    const file = path.join(ROOT, name), local = Module.createRequire(file);
    const child = new Module(file, module);
    child.filename = file;
    child.paths = Module._nodeModulePaths(ROOT);
    child.require = name => name === 'helmut-private-phase-hooks' ? hooks
      : name === './auth-state-parts' && parts ? parts : local(name);
    instrumentedSHA256[name] = sha(source);
    child._compile(source, file);
    return child.exports;
  }
  let partsSource = readSource('auth-state-parts.js');
  for (const name of ['build', 'decode', 'captureWrite'])
    partsSource = wrapDeclaration(partsSource, name, 'Parts.' + name);
  const Parts = compile('auth-state-parts.js', partsSource);
  let atomicSource = readSource('llm-usage-atomic.js');
  for (const name of ['rememberControl', 'cachedControlText'])
    atomicSource = wrapDeclaration(atomicSource, name, 'U.' + name);
  atomicSource = once(atomicSource,
    '  const captured = captureMode === "single-write-capture-v1" ?',
    '  const __helmutPhaseCapture = __helmutPhase.begin("U.capture");\n  const captured = captureMode === "single-write-capture-v1" ?');
  atomicSource = once(atomicSource,
    '  const sentHistory = Object.freeze([...sentAdditions, ...snapshot.history]);',
    '  const sentHistory = Object.freeze([...sentAdditions, ...snapshot.history]);\n  __helmutPhase.end(__helmutPhaseCapture);');
  atomicSource = once(atomicSource,
    '    method: "POST", body: JSON.stringify(body)\n  });\n  if (Array.isArray(rows)',
    '    method: "POST", body: __helmutPhase.sync("U.writeSerialization", () => JSON.stringify(body))\n  });\n  if (Array.isArray(rows)');
  const original = compile('llm-usage-atomic.js', atomicSource, Parts);
  const Atomic = {...original};
  for (const name of ['read', 'readControl', 'write']) {
    Atomic[name] = (...args) => asynchronous('U.' + name, () => {
      const index = name === 'write' ? 1 : 0, options = args[index];
      const actual = options.request;
      args[index] = {...options, request: function (...requestArgs) {
        return asynchronous('request.' + name, () => actual.apply(this, requestArgs));
      }};
      return original[name](...args);
    });
  }
  async function observe(label, fn) {
    assert.ok(!active && typeof label === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(label));
    assert.ok(typeof fn === 'function' && ++operations <= 12);
    const observation = {label, phases: [], instrumentationSHA256: {...instrumentedSHA256},
      observationOverheadIncluded: true, nestedIntervalsNotAdditive: true};
    active = observation;
    const total = begin('operation');
    try {
      const value = await fn();
      return {value, observation};
    } finally {
      end(total);
      observation.incompleteSpans = observation.phases.filter(x => x.wallMS === undefined).length;
      active = null;
    }
  }
  return {Atomic: Object.freeze(Atomic), Parts, observe};
}
module.exports = {loadObserved};
