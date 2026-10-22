"use strict";

// VM-only negative entry tests. Every filesystem, process, budget meter and
// adapter below is synthetic; the actual adapter and native proofs never run.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto");
const filename = path.join(__dirname, "helmut-resource-meter/local-unit-native-run.js"), source = fs.readFileSync(filename, "utf8");
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
  const entries = shared || files(), descriptors = new Map(), offsets = new Map(), events = [], stderr = []; let nextFD = 10, monotonic = 0, selectorStats = 0, calls = 0;
  if (options.file) Object.assign(entries.get(selectionPath), options.file);
  if (options.caseMode !== undefined) entries.get(directory).mode = options.caseMode;
  if (options.selectorJSON) entries.get(selectionPath).data = Buffer.from(options.selectorJSON);
  if (options.attemptExists) entries.set(directory + "/ATTEMPT_STARTED.SAFE.json", node("file", 0o600, Buffer.from("PRESERVED\n")));
  if (options.terminalExists) entries.set(directory + "/ATTEMPT_TERMINAL.SAFE.json", node("file", 0o600, Buffer.from("PRESERVED\n")));
  if (options.budgetExists) entries.set(directory + "/NodeBudgetDirectory", node("dir", 0o700));
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
      const count = options.shortStart && path.basename(name) === "ATTEMPT_STARTED.SAFE.json" ? bytes.length - 1 : bytes.length;
      entries.get(name).data = Buffer.from(bytes.subarray(0, count)); return count;
    },
    fsyncSync: fd => {
      const name = path.basename(descriptors.get(fd)); events.push("fsync:" + name);
      if (options.startSyncFailure && name === "ATTEMPT_STARTED.SAFE.json") fail("EIO");
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
    if (name === "../../lib/helmut/local-unit-diagnostic-adapter") {
      events.push("adapter.import");
      return { execute: async selection => {
        calls++; events.push("adapter.execute"); assert.equal(JSON.stringify(selection), JSON.stringify(selected));
        if (options.closedSummary) return { state: "closed", ...selected, sourceIndex: 499, diagnosticUnit: 0, units: 1,
          completedUnits: 1, dispatchedUnits: 1, expectedPositions: 3, evidenceHash: "e".repeat(64), independentFinalAcceptance: false,
          full500Accepted: false, production: false, paidProviderCallsAllowed: false, retryAllowed: false };
        if (options.invalidResult) return { state: "unknown", ignoredPayload: "FICTIONAL_NONCODE_TEXT" };
        const cause = Object.assign(Error(options.codeShapedText ? "local-unit-diagnostic-native-unrecognized-payload" : "FICTIONAL_NONCODE_TEXT"),
          { code: "P0001", cause: Error("synthetik500-dispatch-EU-unit-deadline") });
        throw new Error("local-unit-diagnostic-stopped-or-unknown", { cause });
      } };
    }
    throw Error("unexpected application import");
  };
  localRequire.main = options.importOnly ? {} : module;
  await vm.runInNewContext(source + "\nexecution;", { require: localRequire, module, exports: module.exports, process, Buffer, URL, Date }, { filename });
  return { entries, events, stderr: stderr.join(""), calls, process };
}
async function check(name, action) { await action(); checks++; process.stdout.write("PASS " + name + "\n"); }
(async () => {
  await check("durable start and budget installation precede the single synthetic failing adapter call", async () => {
    const result = await scenario(); assert.equal(result.calls, 1); assert.equal(result.process.exitCode, 1);
    assert(result.events.indexOf("fsync:" + nonce) < result.events.indexOf("meter.install"));
    assert(result.events.indexOf("meter.install") < result.events.indexOf("adapter.import"));
    assert(result.events.indexOf("meter.install") < result.events.indexOf("gate.import"));
    assert(result.events.indexOf("gate.wait") < result.events.indexOf("adapter.import"));
    assert(result.events.indexOf("adapter.import") < result.events.indexOf("adapter.execute"));
    const start = JSON.parse(result.entries.get(directory + "/ATTEMPT_STARTED.SAFE.json").data);
    assert.equal(start.selectorPin.sha256, sha(selectionBytes)); assert.equal(start.process.startTicks, "345");
    const terminalBytes = result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data, terminal = JSON.parse(terminalBytes);
    assert.equal(terminal.status, "failed"); assert.equal(terminal.result, null); assert.equal(terminal.retryAllowed, false);
    assert.equal(terminal.errors[1].code, "P0001"); assert.equal(terminal.errors[2].reason, "synthetik500-dispatch-EU-unit-deadline");
    assert.equal((terminalBytes.toString() + result.stderr).includes("FICTIONAL_NONCODE_TEXT"), false);
    assert.equal(terminal.memory.commonNativePeakOrReserveAccepted, false);
    assert(result.events.indexOf("fsync:ATTEMPT_TERMINAL.SAFE.json") < result.events.indexOf("gate.quiesce"));
    const replay = await scenario({}, result.entries); assert.equal(replay.calls, 0); assert(!replay.events.includes("meter.install"));
    assert(replay.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data.equals(terminalBytes));
  });
  await check("module import is inert and consumes neither host gate nor first attempt", async () => {
    const result = await scenario({ importOnly: true }); assert.equal(result.calls, 0); assert.equal(result.events.length, 0); assert.equal(result.process.exitCode, 0);
  });
  await check("failed observation gate consumes attempt and blocks adapter import and retry", async () => {
    const result = await scenario({ gateFailure: true }); assert.equal(result.calls, 0); assert.equal(result.process.exitCode, 1);
    assert(!result.events.includes("adapter.import")); assert(!result.events.includes("gate.quiesce"));
    const receipt = result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data;
    assert.equal(JSON.parse(receipt).errors[0].reason, "local-unit-native-observation-gate-frame-binding");
    const replay = await scenario({}, result.entries); assert.equal(replay.calls, 0); assert(!replay.events.includes("gate.import"));
  });
  await check("exit release failure stays failed after the terminal is durable", async () => {
    const result = await scenario({ closedSummary: true, exitGateFailure: true }); assert.equal(result.process.exitCode, 1);
    assert.equal(result.events.filter(x => x === "gate.quiesce").length, 1);
    assert(result.stderr.includes("local-unit-native-observation-gate-exit-timeout"));
    assert.equal(JSON.parse(result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data).status, "closed");
  });
  await check("synthetic closed adapter still requires one gate and exit release with no independent acceptance claim", async () => {
    const result = await scenario({ closedSummary: true }); assert.equal(result.process.exitCode, 0); assert.equal(result.calls, 1);
    const terminal = JSON.parse(result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data);
    assert.equal(terminal.status, "closed"); assert.equal(terminal.independentFinalAcceptance, false);
    assert.equal(result.events.filter(x => x === "gate.wait").length, 1); assert.equal(result.events.filter(x => x === "gate.quiesce").length, 1);
  });
  for (const [name, options] of [
    ["unsupported Node", { version: "v24.18.0" }], ["wrong UID", { uid: 0 }],
    ["missing heap flags", { execArgv: [] }], ["additional preload", { execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16", "--require=other"] }],
    ["NODE_OPTIONS even empty", { env: { NODE_OPTIONS: "" } }], ["wrong budget", { env: { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "385" } }],
    ["credential environment", { env: { SUPABASE_SERVICE_ROLE_KEY: "" } }], ["public origin", { env: { SUPABASE_URL: "https://example.org/" } }],
    ["unknown environment", { env: { UNRECOGNIZED_OPTION: "" } }],
    ["alternate meter output environment", { env: { HELMUT_RESOURCE_METER_DIR: "/tmp/unrelated" } }],
    ["module search override", { env: { NODE_PATH: "/tmp/unrelated" } }],
    ["invalid motor enum", { env: { HELMUT_AUTH_STATE_STORAGE: "unrecognized" } }],
    ["nonce/database mismatch", { env: { HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: "helmut_unit_diagnostic_" + "c".repeat(32) } }],
    ["extra CLI provider", { argv: ["node", filename, "--selector", selectionPath, "--url", "http://127.0.0.1/"] }],
    ["noncanonical selector path", { argv: ["node", filename, "--selector", directory + "/../SELECTION.SAFE.json"] }],
    ["nonprivate case", { caseMode: 0o755 }], ["nonprivate selector", { file: { mode: 0o644 } }],
    ["case special mode bits", { caseMode: 0o2700 }], ["selector special mode bits", { file: { mode: 0o4600 } }],
    ["wrong selector owner", { file: { uid: 0 } }], ["hardlinked selector", { file: { nlink: 2 } }],
    ["selector symlink", { symlink: true }], ["selector read drift", { drift: true }],
    ["selector replaced before its first fstat", { selectorOpenSwap: true }],
    ["extra selector field", { selectorJSON: JSON.stringify({ ...selected, trusted: true }) }],
    ["duplicate selector field", { selectorJSON: '{"operationId":"' + selected.operationId + '","commandHash":"' + selected.commandHash + '","commandHash":"' + selected.commandHash + '"}' }],
    ["existing first-attempt marker", { attemptExists: true }]
  ]) await check(name + " stops before budget and application imports", async () => {
    const result = await scenario(options); assert.equal(result.calls, 0); assert.equal(result.process.exitCode, 1);
    assert(!result.events.includes("meter.install")); assert(!result.events.includes("adapter.import"));
    assert(!result.entries.has(directory + "/ATTEMPT_TERMINAL.SAFE.json"));
    if (options.selectorOpenSwap) assert(!result.events.includes("read:SELECTION.SAFE.json"));
  });
  await check("a reused output directory consumes the start but never imports the adapter", async () => {
    const result = await scenario({ budgetExists: true }); assert.equal(result.calls, 0); assert.equal(result.process.exitCode, 1);
    assert(result.entries.has(directory + "/ATTEMPT_STARTED.SAFE.json")); assert(!result.events.includes("meter.install"));
  });
  await check("a prior terminal without a start is never reopened or replaced", async () => {
    const result = await scenario({ terminalExists: true }); assert.equal(result.calls, 0); assert.equal(result.process.exitCode, 1);
    assert(!result.entries.has(directory + "/ATTEMPT_STARTED.SAFE.json")); assert(!result.events.includes("meter.install"));
    assert.equal(result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data.toString(), "PRESERVED\n");
    assert(!result.events.includes("open:ATTEMPT_TERMINAL.SAFE.json"));
  });
  for (const options of [{ shortStart: true }, { startSyncFailure: true }]) {
    await check("an incomplete durable start consumes the marker before any native proof", async () => {
      const result = await scenario(options); assert.equal(result.calls, 0); assert.equal(result.process.exitCode, 1);
      assert(result.entries.has(directory + "/ATTEMPT_STARTED.SAFE.json")); assert(!result.events.includes("meter.install"));
      assert.equal(result.events.filter(e => e === "open:ATTEMPT_STARTED.SAFE.json").length, 1);
      assert.equal(result.events.filter(e => e === "open:ATTEMPT_TERMINAL.SAFE.json").length, 1);
    });
  }
  await check("known motor enums reach only the synthetic failing adapter once", async () => {
    const result = await scenario({ env: { HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1",
      HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1", HELMUT_AUTH_GRAPH_READ_REUSE: "off",
      HELMUT_AUTH_SINGLE_WRITE_CAPTURE: "off", HELMUT_AUTH_CONTROL_READ: "verified-control-view-v1",
      HELMUT_LOCAL_PIPELINE_LOCK_MODE: "invocation-lease-v1" } });
    assert.equal(result.calls, 1); assert.equal(result.process.exitCode, 1);
  });
  await check("an unknown code-shaped error message remains omitted", async () => {
    const result = await scenario({ codeShapedText: true });
    const receipt = result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data.toString();
    assert.equal((receipt + result.stderr).includes("unrecognized-payload"), false);
    assert.equal(JSON.parse(receipt).errors[1].code, "P0001");
  });
  await check("a failed native meter cannot reach application code", async () => {
    const result = await scenario({ meterFailure: true }); assert.equal(result.calls, 0); assert(!result.events.includes("adapter.import"));
    assert.equal(JSON.parse(result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data).errors[0].code, "LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT");
  });
  await check("an unclosed or unexpected adapter payload cannot become a successful terminal", async () => {
    const result = await scenario({ invalidResult: true }); assert.equal(result.calls, 1); assert.equal(result.process.exitCode, 1);
    const terminal = result.entries.get(directory + "/ATTEMPT_TERMINAL.SAFE.json").data.toString();
    assert.equal(JSON.parse(terminal).result, null); assert.equal(terminal.includes("FICTIONAL_NONCODE_TEXT"), false);
  });
  process.stdout.write("Native entry VM negatives PASS: " + checks + "; actual adapter was not loaded or executed.\n");
})().catch(() => { process.stderr.write("Native entry VM tests FAIL; no actual adapter was run.\n"); process.exitCode = 1; });
