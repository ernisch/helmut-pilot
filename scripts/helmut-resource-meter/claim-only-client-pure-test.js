"use strict";

// Narrow claim-only VM regressions. Mock-FS/host primitives copied from the
// existing native-run fixture; no original, network, process or DB operation runs.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto");
const sourceRootOption = process.argv.indexOf("--source-root");
if (sourceRootOption !== -1 && (!process.argv[sourceRootOption + 1] || process.argv[sourceRootOption + 1].startsWith("--")))
  throw Error("--source-root requires a path");
const sourceRoot = path.resolve(sourceRootOption === -1 ? path.join(__dirname, "../..") : process.argv[sourceRootOption + 1]);
const nativeDirectory = path.join(sourceRoot, "scripts/helmut-resource-meter");
const filename = path.join(nativeDirectory, "local-unit-native-claim-only.js");
const unitFile = path.join(nativeDirectory, "local-unit-native-run.js");
const source = fs.readFileSync(filename, "utf8"), unitSource=fs.readFileSync(unitFile,"utf8");
const nonce = "a".repeat(32), directory = "/workspace/helmut-unit-diagnostic-native/" + nonce, selectionPath = directory + "/SELECTION.SAFE.json";
const selected = { operationId: "localUnitDiagnostic-" + nonce, commandHash: "b".repeat(64) };
const selectionBytes = Buffer.from(JSON.stringify(selected) + "\n");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
let checks = 0;
function node(kind, mode, data = null) { return { kind, mode, uid: 1000, gid: 1000, dev: 1, ino: 100, nlink: 1, mtimeNs: 1, ctimeNs: 1, data }; }
function files() {
  return new Map([["/", node("dir", 0o755)], ["/workspace", node("dir", 0o755)],
    ["/workspace/helmut-unit-diagnostic-native", node("dir", 0o700)], [directory, node("dir", 0o700)],
    [selectionPath, node("file", 0o600, Buffer.from(selectionBytes))]]);
}
async function scenario(options = {}, shared = null) {
  const entries = shared || files(), descriptors = new Map(), offsets = new Map(), events = [], stderr = [], diagnostics = new WeakMap(); let nextFD = 10, monotonic = 0, selectorStats = 0, calls = 0;
  if (options.file) Object.assign(entries.get(selectionPath), options.file);
  if (options.caseMode !== undefined) entries.get(directory).mode = options.caseMode;
  if (options.selectorJSON) entries.get(selectionPath).data = Buffer.from(options.selectorJSON);
  if (options.attemptExists) entries.set(directory + "/ATTEMPT_STARTED.SAFE.json", node("file", 0o600, Buffer.from("PRESERVED\n")));
  if (options.terminalExists) entries.set(directory + "/ATTEMPT_TERMINAL.SAFE.json", node("file", 0o600, Buffer.from("PRESERVED\n")));
  if (options.budgetExists) entries.set(directory + "/NodeBudgetDirectory", node("dir", 0o700));
  if (options.diagnosticExists) entries.set(directory + "/FAILURE_PHASE_DIAGNOSTIC.PRIVATE.json", node("file", 0o600, Buffer.from("PRESERVED\n")));
  const fail = code => { const e = Error(code); e.code = code; throw e; };
  function stat(name, big = false) {
    const value = entries.get(name); if (!value) fail("ENOENT");
    const cast = n => big ? BigInt(n) : n;
    return { dev: cast(value.dev), ino: cast(value.ino), mode: cast((value.kind === "dir" ? 0o040000 : 0o100000) | value.mode),
      uid: cast(value.uid), gid: cast(value.gid), size: cast(value.data?.length || 0), nlink: cast(value.nlink),
      mtimeNs: cast(value.mtimeNs), ctimeNs: cast(value.ctimeNs),
      isFile: () => value.kind === "file", isDirectory: () => value.kind === "dir", isSymbolicLink: () => value.kind === "symlink" };
  }
  const fakeFS = { constants: fs.constants,
    realpathSync: name => options.symlink && name === selectionPath ? "/tmp/unrelated" : name,
    lstatSync: (name, opts) => stat(name, opts?.bigint),
    openSync: (name, flags, mode) => {
      events.push("open:" + path.basename(name));
      if (options.diagnosticOpenFailure && path.basename(name) === "FAILURE_PHASE_DIAGNOSTIC.PRIVATE.json") fail("EIO");
      assert(flags & fs.constants.O_NOFOLLOW, "every opened case path uses O_NOFOLLOW");
      if (flags & fs.constants.O_CREAT) {
        assert(flags & fs.constants.O_EXCL, "every output creation is exclusive");
        if (entries.has(name)) fail("EEXIST");
        const value = node("file", mode, Buffer.alloc(0)); value.ino = nextFD + 100; entries.set(name, value);
      } else if (!entries.has(name)) fail("ENOENT");
      if (name === selectionPath && options.selectorOpenSwap) entries.get(name).kind = "fifo";
      const fd = nextFD++; descriptors.set(fd, name); offsets.set(fd, 0); return fd;
    },
    fstatSync: (fd, opts) => {
      const name = descriptors.get(fd), value = stat(name, opts?.bigint);
      if (name === selectionPath && options.drift && ++selectorStats === 2) value.mtimeNs += 1n;
      return value;
    },
    readFileSync: (name, encoding) => {
      if (name === "/proc/self/stat") return "7 (synthetic node entry) " + Array.from({ length: 20 }, (_, i) => i === 19 ? "345" : i === 0 ? "S" : "0").join(" ");
      if (name === "/proc/self/status") return "NSpid:\t7\n";
      throw Error("unexpected synthetic read");
    },
    readSync: (fd, buffer, offset, length) => {
      const name = descriptors.get(fd); events.push("read:" + path.basename(name));
      assert(length <= 4097, "selector read remains capped");
      const data = entries.get(name).data, start = offsets.get(fd), count = Math.min(length, data.length - start);
      data.copy(buffer, offset, start, start + count); offsets.set(fd, start + count); return count;
    },
    readlinkSync: name => { assert.equal(name, "/proc/self/ns/pid"); return "pid:[1234]"; },
    writeSync: (fd, bytes) => {
      const name = descriptors.get(fd); events.push("write:" + path.basename(name));
      const count = (options.shortStart && path.basename(name) === "ATTEMPT_STARTED.SAFE.json"
        || options.shortDiagnostic && path.basename(name) === "FAILURE_PHASE_DIAGNOSTIC.PRIVATE.json") ? bytes.length - 1 : bytes.length;
      entries.get(name).data = Buffer.from(bytes.subarray(0, count)); return count;
    },
    fsyncSync: fd => {
      const name = path.basename(descriptors.get(fd)); events.push("fsync:" + name);
      if (options.startSyncFailure && name === "ATTEMPT_STARTED.SAFE.json") fail("EIO");
      if (options.diagnosticSyncFailure && name === "FAILURE_PHASE_DIAGNOSTIC.PRIVATE.json") fail("EIO");
    }, closeSync: fd => { descriptors.delete(fd); offsets.delete(fd); },
    mkdirSync: (name, opts) => { if (entries.has(name)) fail("EEXIST"); entries.set(name, node("dir", opts.mode)); events.push("mkdir:" + path.basename(name)); }
  };
  const process = { version: options.version || "v24.19.0", getuid: () => options.uid ?? 1000, geteuid: () => options.uid ?? 1000, pid: 7,
    argv: ["node", filename, "--selector", selectionPath], execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"],
    env: { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "384", HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: "http://127.0.0.1:8000/",
      HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: "helmut_unit_diagnostic_" + nonce },
    memoryUsage: () => ({ rss: 100, heapTotal: 80, heapUsed: 40, external: 4, arrayBuffers: 2 }),
    stderr: { write: text => { stderr.push(text); return text.length; } }, exitCode: 0 };
  if (options.argv) process.argv = options.argv;
  if (options.execArgv) process.execArgv = options.execArgv;
  if (!options.unit) process.env.HELMUT_LOCAL_UNIT_NATIVE_DIAGNOSTIC = "fresh-claim-only-v1";
  Object.assign(process.env, options.env || {});
  const module = { exports: {} };
  const localRequire = name => {
    if (name === "node:fs") return fakeFS;
    if (name === "node:path") return path;
    if (name === "node:crypto") return crypto;
    if (name === "node:v8") return { getHeapStatistics: () => ({ heap_size_limit: 400000000, used_heap_size: 40 }) };
    if (name === "node:perf_hooks") return { performance: { now: () => ++monotonic } };
    if (name === "./http-meter") return { install: output => {
      events.push("meter.install"); assert.equal(output, directory + "/NodeBudgetDirectory");
      if (options.meterFailure) throw Error("LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT");
    } };
    if (name === "./local-unit-native-observation-gate") {
      events.push("gate.import"); return {
        async wait(args) { events.push("gate.wait"); assert.equal(JSON.stringify(args), JSON.stringify({ selection: selected,
          process: { pid: 7, startTicks: "345" }, kind: "entry" }));
          if (options.gateFailure) throw Error("local-unit-native-observation-gate-frame-binding"); },
        async quiesce() { events.push("gate.quiesce");
          assert(entries.has(directory + "/ATTEMPT_TERMINAL.SAFE.json"));
          if (options.exitGateFailure) throw Error("local-unit-native-observation-gate-exit-timeout"); }
      };
    }
    if (name === "../../lib/helmut/local-unit-diagnostic-scope") {
      events.push("scope.import");
      return {
        currentVerified() { return { selection: options.badSelection ? { ...selected, commandHash:"c".repeat(64) } : selected }; },
        assertClock() { events.push("scope.clock"); },
        consumeFailureDiagnostics() { return null; },
        async runClaimed(selection, work) {
          calls++; events.push("scope.runClaimed");
          assert.equal(JSON.stringify(selection), JSON.stringify(selected));
          if (options.scopeFailure) throw Error("local-unit-diagnostic-native-state-readback-unknown");
          if (options.skipCallback) return claimDTO();
          const value=await work();
          if (options.twice) await work();
          return options.returnPatch ? {...value,...options.returnPatch} : value;
        }
      };
    }
    if (name === "../../lib/helmut/local-unit-diagnostic-adapter" && options.unit) {
      events.push("adapter.import");
      return { async execute() { calls++; return claimDTO(); } };
    }
    throw Error("unexpected application import");
  };
  localRequire.main = options.importOnly ? {} : module;
  await vm.runInNewContext((options.unit ? unitSource : source) + "\nexecution;", { require: localRequire, module, exports: module.exports, process, Buffer, URL, Date }, { filename });
  return { entries, events, stderr: stderr.join(""), calls, process };
}

function claimDTO() { return { mode:"fresh-claim-only-v1",...selected,claimCallbackReached:true,callbackCalls:1,
 motorCalls:0,providerCalls:0,completedUnits:0,expectedPositions:0,controlCount:0,claimStillRunning:true,authorityConsumed:true,
 unit60Qualified:false,auth30Qualified:false,independentFinalAcceptance:false,full500Accepted:false,production:false,
 paidProviderCallsAllowed:false,retryAllowed:false }; }
function term(r) { const f=r.entries.get(directory+"/ATTEMPT_TERMINAL.SAFE.json"); return f ? JSON.parse(f.data) : null; }
let failures=0;
async function check(id,action) {
 if (process.argv.includes("--only-client-dto") && id!=="client.callbackCountResultType") return;
 try { await action(); checks++; console.log(JSON.stringify({id,status:"PASS"})); }
 catch(e) { failures++; console.log(JSON.stringify({id,status:"FAIL",error:e.name,message:e.message.slice(0,240)})); }
}
(async()=>{
 await check("client.genuineFixtureCutOnly",async()=>{const r=await scenario();const t=term(r);
  assert.equal(r.calls,1);assert.equal(r.process.exitCode,0);assert.equal(t.status,"diagnosed");
  assert.equal(t.schema,"helmut-local-unit-native-claim-only-terminal/1");assert.equal(t.result.callbackCalls,1);
  assert.equal(t.result.motorCalls,0);assert.equal(t.result.providerCalls,0);assert.equal(t.result.unit60Qualified,false);
  assert.equal(t.result.authorityConsumed,true);assert.equal(t.result.claimStillRunning,true);
  assert(!r.events.includes("adapter.import"));assert(r.events.indexOf("gate.wait")<r.events.indexOf("scope.runClaimed"));
  assert.equal(r.events.filter(x=>x==="gate.quiesce").length,1);
 });
 for(const mode of [undefined,"","run-native-single-unit","fresh-claim-only-v2"])
  await check("client.badMode."+String(mode),async()=>{const r=await scenario({env:{HELMUT_LOCAL_UNIT_NATIVE_DIAGNOSTIC:mode}});
   assert.equal(r.calls,0);assert.equal(r.process.exitCode,1);assert.equal(term(r),null);assert(!r.events.includes("meter.install"));});
 for(const options of [{twice:true},{skipCallback:true},{scopeFailure:true},{badSelection:true},
  {returnPatch:{mode:"run-native-single-unit"}},{returnPatch:{motorCalls:1}},{returnPatch:{authorityConsumed:false}},
  {returnPatch:{claimStillRunning:false}},{returnPatch:{completedUnits:1}}])
  await check("client.reject."+JSON.stringify(options),async()=>{const r=await scenario(options);
   assert.equal(r.calls,1);assert.equal(r.process.exitCode,1);assert.equal(term(r).status,"failed");assert.equal(term(r).result,null);});
 await check("client.callbackCountResultType",async()=>{
  for(const callbackCalls of [2,0,true,"1",null]){const r=await scenario({returnPatch:{callbackCalls}});
   assert.equal(r.process.exitCode,1,"invalid returned callbackCalls must fail before diagnosed: "+String(callbackCalls));
   assert.equal(term(r).status,"failed");}
 });
 await check("unit.rejectClaimOnlyDTO",async()=>{const r=await scenario({unit:true});
  assert.equal(r.calls,1);assert.equal(r.process.exitCode,1);assert.equal(term(r).status,"failed");assert.equal(term(r).result,null);});
 console.log(JSON.stringify({schema:"helmut-fresh-claim-only-client-pure-result/1",passed:checks,failed:failures,nativeEvidence:false}));
 process.exitCode=failures?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
