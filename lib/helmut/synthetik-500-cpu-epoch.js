"use strict";

// This is a local, opt-in clean-entry optimisation gate, not an authority or a
// security verdict. A source-pinned first CJS entry and its closed import graph
// are the trust premise. Unknown entries/process history keep the literal body.
// No caller receives the codec's certification closure or an epoch setter.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const Module = require("node:module"), util = require("node:util");
const dc = require("node:diagnostics_channel"), inspector = require("node:inspector");
const stream = require("node:stream"), events = require("node:events"), asyncHooks = require("node:async_hooks");
const zlib = require("node:zlib");
const apply = Reflect.apply, ownKeys = Reflect.ownKeys, proto = Object.getPrototypeOf;
const desc = Object.getOwnPropertyDescriptor, define = Object.defineProperty;
const create = Object.create, has = Object.hasOwn, isProxy = util.types.isProxy;
const sameValue = Object.is, freeze = Object.freeze, nativeGlobal = globalThis;
const objectPrototype = Object.prototype;
const wGet = WeakMap.prototype.get, wSet = WeakMap.prototype.set;
const sHas = Set.prototype.has, sAdd = Set.prototype.add;
const ownRoots = new WeakMap(), nativeProcess = process, nativeEnv = process.env;
const main = require.main, thisModule = module, rootDirectory = path.resolve(__dirname, "../..");
const readFile = fs.readFileSync, createHash = crypto.createHash;
const jsonParse = JSON.parse, jsonStringify = JSON.stringify;
const resolvePath = path.resolve, relativePath = path.relative, separator = path.sep;
const inspectorUrl = inspector.url;
const MANIFEST_VERSION = "helmut-synthetik500-cpu-source-pins/1";
const MAX_OBJECTS = 100000, MAX_SLOTS = 600000;
let bootAttempted = false, bootQualified = false, sealed = false, active = false, leaseKind = null;
let commandBody, commandWrapper, selector, facts, codecBound = false;
let codecBody, codecWrapper, codecFrame = null;
let runningCalls = 0;
let records = [], moduleRecords = [], expectedCache, expectedCacheKeys, expectedCachePrototype, expectedPathCache;
let expectedModules, globalSlots, processSlots, envPrototype, bootstrapCacheKeys;
let commandCalls = 0, enteredCount = 0, qualifiedFalseCount = 0, codecCalls = 0, codecEnteredCount = 0, lastFailure = "not-bootstrapped";
const reject = reason => { lastFailure = reason; return false; };

const push = (xs, value) => { define(xs, xs.length, { value, writable: true, enumerable: true, configurable: true }); };
const call = (fn, receiver, args) => apply(fn, receiver, args);
const object = value => value !== null && (typeof value === "object" || typeof value === "function");
const safe = value => !object(value) || !isProxy(value);
function sameKeys(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function slot(objectValue, key) {
  if (!safe(objectValue)) return null;
  const d = desc(objectValue, key);
  if (!d) return undefined;
  const result = create(null);
  result.enumerable = d.enumerable; result.configurable = d.configurable;
  result.data = has(d, "value");
  if (result.data) { result.value = d.value; result.writable = d.writable; }
  else { result.get = has(d, "get") ? d.get : undefined; result.set = has(d, "set") ? d.set : undefined; }
  return result;
}
function equalSlot(value, key, expected) {
  const actual = slot(value, key);
  if (actual === null || actual === undefined || expected === undefined) return actual === expected;
  if (actual.data !== expected.data || actual.enumerable !== expected.enumerable || actual.configurable !== expected.configurable) return false;
  return actual.data ? sameValue(actual.value, expected.value) && actual.writable === expected.writable
    : actual.get === expected.get && actual.set === expected.set;
}
function snapshot(value) {
  if (!object(value) || !safe(value)) return null;
  const record = create(null); record.value = value; record.prototype = proto(value);
  record.keys = ownKeys(value); record.slots = [];
  for (let i = 0; i < record.keys.length; i++) push(record.slots, slot(value, record.keys[i]));
  return record;
}
function unchanged(record) {
  const value = record.value;
  if (!safe(value) || proto(value) !== record.prototype || !sameKeys(ownKeys(value), record.keys)) return false;
  for (let i = 0; i < record.keys.length; i++) if (!equalSlot(value, record.keys[i], record.slots[i])) return false;
  return true;
}
function captureGraph(roots) {
  const seen = new Set(), queue = [], result = []; let slots = 0;
  for (let i = 0; i < roots.length; i++) if (object(roots[i])) push(queue, roots[i]);
  for (let i = 0; i < queue.length; i++) {
    const value = queue[i];
    // Module itself is a self-referential constructor. Its mutable caches and
    // bookkeeping are pinned by the specialised loader/module records below.
    if (value === Module || value === Module._cache || value === Module._pathCache) continue;
    if (call(sHas, seen, [value])) continue;
    if (!safe(value) || result.length >= MAX_OBJECTS) return null;
    call(sAdd, seen, [value]);
    const record = snapshot(value); slots += record.keys.length;
    if (slots > MAX_SLOTS) return null;
    push(result, record);
    if (object(record.prototype)) push(queue, record.prototype);
    for (let k = 0; k < record.slots.length; k++) {
      const d = record.slots[k];
      if (d.data) { if (object(d.value)) push(queue, d.value); }
      else { if (object(d.get)) push(queue, d.get); if (object(d.set)) push(queue, d.set); }
    }
  }
  return result;
}
function startupSupported() {
  if (nativeProcess.version !== "v24.19.0" || !main || !safe(main) || thisModule.parent !== main) return false;
  const options = nativeEnv.NODE_OPTIONS;
  if (options !== undefined && options !== "") return false;
  const flags = nativeProcess.execArgv;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (typeof flag !== "string" || !(flag === "--expose-gc" || /^--max-old-space-size=[1-9][0-9]*$/.test(flag))) return false;
  }
  const unsupported = ["NODE_DEBUG", "NODE_DEBUG_NATIVE", "WATCH_REPORT_DEPENDENCIES", "NODE_V8_COVERAGE",
    "NODE_CHANNEL_FD", "NODE_UNIQUE_ID", "NODE_INSPECT_RESUME_ON_START", "NODE_REDIRECT_WARNINGS"];
  for (let i = 0; i < unsupported.length; i++) {
    const value = nativeEnv[unsupported[i]];
    if (value !== undefined && value !== "") return false;
  }
  return call(inspectorUrl, inspector, []) === undefined;
}
function sha256(bytes) {
  const hash = call(createHash, crypto, ["sha256"]);
  return hash.update(bytes).digest("hex");
}
function pinnedFile(pin, absoluteAllowed) {
  if (!pin || typeof pin.path !== "string" || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1
      || typeof pin.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pin.sha256)) return null;
  const filename = absoluteAllowed && path.isAbsolute(pin.path)
    ? call(resolvePath, path, [pin.path]) : call(resolvePath, path, [rootDirectory, pin.path]);
  if (!absoluteAllowed) {
    const relative = call(relativePath, path, [rootDirectory, filename]);
    if (relative === "" || relative === ".." || relative.startsWith(".." + separator) || path.isAbsolute(relative)) return null;
  }
  const bytes = call(readFile, fs, [filename]);
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) return null;
  return { filename, text: bytes.toString("utf8") };
}
function bootstrap() {
  if (bootAttempted || sealed) return reject("bootstrap-already-attempted-or-sealed");
  bootAttempted = true;
  try {
    if (!startupSupported() || !safe(Module._cache) || !safe(Module._pathCache)) return reject("unsupported-startup");
    bootstrapCacheKeys = ownKeys(Module._cache);
    // A known first repository entry is necessary, not merely empty execArgv.
    for (let i = 0; i < bootstrapCacheKeys.length; i++) {
      const d = slot(Module._cache, bootstrapCacheKeys[i]);
      if (!d || !d.data || d.value !== main && d.value !== thisModule) return reject("not-first-repository-entry");
    }
    const manifestPath = call(resolvePath, path, [__dirname, "synthetik-500-cpu-source-pins.json"]);
    const manifest = call(jsonParse, JSON, [call(readFile, fs, [manifestPath]).toString("utf8")]);
    if (manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.sources) || !Array.isArray(manifest.entries)
        || manifest.sources.length < 54 || manifest.sources.length > 100 || manifest.entries.length > 8) return reject("invalid-source-manifest");
    let entry = false;
    for (let i = 0; i < manifest.entries.length; i++) {
      // Other pinned diagnostic entries need not exist in this deployment.
      // The actual running entry must still pass its complete byte/SHA check.
      const pin = manifest.entries[i];
      if (!pin || typeof pin.path !== "string") return reject("invalid-entry-pin");
      const filename = path.isAbsolute(pin.path)
        ? call(resolvePath, path, [pin.path]) : call(resolvePath, path, [rootDirectory, pin.path]);
      if (filename !== main.filename) continue;
      const checked = pinnedFile(manifest.entries[i], true);
      if (checked && checked.filename === main.filename) entry = true;
    }
    if (!entry) return reject("entry-source-not-pinned");
    const sourceFiles = [], filenames = new Set();
    for (let i = 0; i < manifest.sources.length; i++) {
      const checked = pinnedFile(manifest.sources[i], false);
      if (!checked || call(sHas, filenames, [checked.filename])) return reject("critical-source-pin-failed");
      call(sAdd, filenames, [checked.filename]); push(sourceFiles, checked);
    }
    // All original module initialisers run outside the epoch. Prewarm only the
    // literal dependencies inside the reviewed finite graph, never other files.
    for (let i = 0; i < sourceFiles.length; i++) require(sourceFiles[i].filename);
    for (let i = 0; i < sourceFiles.length; i++) {
      const source = sourceFiles[i], localRequire = Module.createRequire(source.filename);
      const expression = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
      let match;
      while ((match = expression.exec(source.text)) !== null) {
        const name = match[1];
        if (!name.startsWith(".")) continue;
        const resolved = localRequire.resolve(name);
        if (call(sHas, filenames, [resolved])) localRequire.resolve(name);
      }
    }
    expectedModules = new Set([main, thisModule]);
    for (let i = 0; i < sourceFiles.length; i++) {
      const instance = Module._cache[sourceFiles[i].filename];
      if (!instance || !safe(instance) || instance.loaded !== true || instance.filename !== sourceFiles[i].filename) return reject("critical-cache-instance-failed");
      call(sAdd, expectedModules, [instance]);
    }
    bootQualified = true; lastFailure = "none";
    return true;
  } catch (_) { bootQualified = false; return reject("bootstrap-read-preload-or-manifest-error"); }
}
function passiveDictionaryEnvelope(value) {
  // This selector runs only captured passive reflection. It does not replace
  // any original envelope/byte/hash/UTF8/shape/size/expandedHash validation.
  if (!object(value) || !safe(value) || proto(value) !== objectPrototype && proto(value) !== null) return false;
  const keys = ownKeys(value);
  const names = ["version", "bytes", "sha256", "dictionaryBytes", "dictionarySha256", "data"];
  if (keys.length !== names.length) return false;
  for (let i = 0; i < keys.length; i++) {
    let known = false;
    for (let j = 0; j < names.length; j++) if (keys[i] === names[j]) known = true;
    if (!known) return false;
  }
  for (let i = 0; i < names.length; i++) {
    const name = names[i], d = slot(value, name);
    if (!d || !d.data || !d.enumerable || typeof d.value !== (name === "bytes" || name === "dictionaryBytes" ? "number" : "string")) return false;
    if (name === "version" && d.value !== "helmut-synthetik500-direct-dictionary-gzip/2") return false;
  }
  return true;
}
function revoke() {
  active = false; leaseKind = null;
  if (codecFrame) codecFrame.revoked = true;
  try { if (facts) call(facts.end, undefined, []); } catch (_) {}
}
function bindCodec(factory) {
  if (typeof factory !== "function") throw Error("synthetik500-cpu-codec-binding");
  if (sealed || codecBound) return factory(function uncertifiedLegacyRoot() {}, function noExpandedFact() { return null; });
  codecBound = true;
  const api = factory(function certifyOwnedRoot(root, context, commandRoot) {
    if (!active || leaseKind !== "codec" || !codecFrame || codecFrame.revoked || !sealed || !bootQualified
        || !object(root) || !safe(root) || !object(context) || !safe(context)) return;
    // Only this private codec closure can pass a newly checked dictionary to
    // the optional context interner. Its public observer method cannot acquire
    // a lease. No decoded values[] graph is exposed or retained here.
    // The COMPLETE original decode has already run under this very lease.
    // An end-only probe could not exclude a self-restoring JSON/crypto hook.
    if (!facts) return;
    if (facts.prepare) {
      try {
        const interned = call(facts.prepare, undefined, [context]);
        if (!object(interned) || !safe(interned)) return;
        context = interned;
      } catch (_) { return; }
    }
    if (!active || leaseKind !== "codec" || codecFrame.revoked) return;
    call(wSet, ownRoots, [root, context]);
    // The sole codec closure selected this actual child before compacting its
    // fully checked dictionary. No public root-registration API is exposed.
    if (object(commandRoot) && safe(commandRoot) && typeof context.commandRootToken === "number") {
      const childContext = create(null);
      childContext.raw = context.raw; childContext.rootToken = context.commandRootToken;
      call(wSet, ownRoots, [commandRoot, childContext]);
    }
  }, function readOriginalExpandedDigest(raw) {
    if (!active || leaseKind !== "codec" || !codecFrame || codecFrame.revoked || !facts || !facts.expandedHash) return null;
    return call(facts.expandedHash, undefined, [raw]);
  });
  const decodeSlot = slot(api, "decode");
  if (!decodeSlot || !decodeSlot.data || typeof decodeSlot.value !== "function") throw Error("synthetik500-cpu-codec-api");
  codecBody = decodeSlot.value;
  codecWrapper = function decode(value) {
    codecCalls++;
    const nested = runningCalls !== 0; runningCalls++;
    let frame = null;
    try {
      if (nested || active) { revoke(); return call(codecBody, this, arguments); }
      if (passiveDictionaryEnvelope(value) && qualified()) {
        frame = create(null); frame.revoked = false; codecFrame = frame;
        leaseKind = "codec"; active = true; codecEnteredCount++;
      }
      return call(codecBody, this, arguments);
    } finally {
      runningCalls--;
      if (frame) {
        revoke();
        if (codecFrame === frame) codecFrame = null;
      }
    }
  };
  define(api, "decode", { value: codecWrapper, writable: decodeSlot.writable,
    enumerable: decodeSlot.enumerable, configurable: decodeSlot.configurable });
  return api;
}
function bindSelector(passiveSelector) {
  if (sealed || selector) return;
  if (typeof passiveSelector !== "function") throw Error("synthetik500-cpu-selector-binding");
  selector = passiveSelector;
}
function bindFacts(observer) {
  if (sealed || facts) return;
  if (!observer || typeof observer.begin !== "function" || typeof observer.end !== "function") throw Error("synthetik500-cpu-facts-binding");
  facts = { begin: observer.begin, end: observer.end, prepare: typeof observer.prepare === "function" ? observer.prepare : undefined,
    expandedHash: typeof observer.expandedHash === "function" ? observer.expandedHash : undefined };
}
function bindCommand(originalBody) {
  if (typeof originalBody !== "function") throw Error("synthetik500-cpu-command-binding");
  if (sealed || commandBody) return originalBody;
  commandBody = originalBody;
  commandWrapper = function validate(command) {
    commandCalls++;
    const nested = runningCalls !== 0; runningCalls++;
    let factsStarted = false;
    try {
      // Also reject nested activation inside a literal legacy call. A legacy
      // accessor/callback is not a new trusted top-level entry.
      if (nested || active) { revoke(); return call(originalBody, this, arguments); }
      const context = object(command) && safe(command) ? call(wGet, ownRoots, [command]) : undefined;
      try {
        if (context && qualified() && call(selector, undefined, [command]) === true) {
          // The observer additionally checks isActive before accepting data.
          // At this point the private root and whole closed callgraph passed.
          active = true; leaseKind = "command"; factsStarted = true;
          enteredCount++;
          if (call(facts.begin, undefined, [command, context]) !== true) { active = false; leaseKind = null; lastFailure = "facts-cap-or-scope-rejected"; }
        } else {
          qualifiedFalseCount++;
          if (!context) lastFailure = "root-not-codec-owned";
          else if (lastFailure === "none") lastFailure = "unsupported-command-dispatch";
        }
      } catch (_) { revoke(); lastFailure = "private-selector-or-facts-error"; }
      return call(originalBody, this, arguments);
    } finally {
      runningCalls--;
      active = false; leaseKind = null;
      if (factsStarted) { try { call(facts.end, undefined, []); } catch (_) {} }
    }
  };
  return commandWrapper;
}
function seal() {
  if (sealed) return bootQualified;
  sealed = true;
  if (!bootQualified || !commandBody || !commandWrapper || !selector || !facts || !codecBound) { bootQualified = false; return reject("boot-or-private-binding-incomplete"); }
  try {
    const roots = [commandBody, commandWrapper, codecBody, codecWrapper, selector, facts.begin, facts.end, facts.prepare, fs, crypto, util, dc, inspector, stream, events, asyncHooks, zlib];
    const globalNames = ["Object", "Array", "Function", "Reflect", "String", "Number", "Boolean", "Math", "JSON", "RegExp", "Date", "Intl", "URL", "URLSearchParams",
      "Error", "TypeError", "RangeError", "EvalError", "SyntaxError", "ReferenceError", "URIError", "AggregateError", "Promise",
      "parseInt", "parseFloat", "isFinite", "isNaN", "decodeURIComponent", "encodeURIComponent", "decodeURI", "encodeURI", "atob", "btoa", "Infinity", "NaN", "undefined", "globalThis", "global",
      "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "FinalizationRegistry", "Symbol", "BigInt", "Buffer", "ArrayBuffer", "SharedArrayBuffer", "DataView",
      "Uint8Array", "Uint8ClampedArray", "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
      "structuredClone", "process"];
    globalSlots = [];
    for (let i = 0; i < globalNames.length; i++) {
      const name = globalNames[i];
      // Node exposes some standard globals lazily. Resolve them at the known
      // clean boot, then pin both their actual getter slots and their values.
      const value = nativeGlobal[name], d = slot(nativeGlobal, name);
      if (!d) { bootQualified = false; return reject("missing-standard-global:" + name); }
      push(globalSlots, { key: name, slot: d });
      if (!d.data) { push(roots, d.get); push(roots, d.set); }
      if (name !== "process" && name !== "globalThis" && name !== "global") push(roots, value);
    }
    processSlots = [];
    const processNames = ["env", "execArgv", "argv", "version", "versions", "nextTick", "_tickCallback", "emitWarning", "binding", "_linkedBinding", "dlopen", "send"];
    for (let i = 0; i < processNames.length; i++) {
      const name = processNames[i], d = slot(nativeProcess, name);
      push(processSlots, { key: name, slot: d });
      if (d && d.data && name !== "env") push(roots, d.value);
    }
    push(roots, proto(nativeProcess)); envPrototype = proto(nativeEnv); if (object(envPrototype)) push(roots, envPrototype);
    // Retain the actual clean-boot channels, not fresh same-name replacements.
    const tracing = dc.tracingChannel("module.require");
    const channelNames = ["start", "end", "asyncStart", "asyncEnd", "error"];
    for (let i = 0; i < channelNames.length; i++) {
      const channel = tracing[channelNames[i]];
      if (!channel || channel.hasSubscribers !== false) { bootQualified = false; return reject("require-tracing-active"); }
      push(roots, channel);
    }
    push(roots, proto([][Symbol.iterator]())); push(roots, proto(new Map()[Symbol.iterator]()));
    push(roots, proto(new Set()[Symbol.iterator]())); push(roots, proto(""[Symbol.iterator]()));
    expectedCache = Module._cache; expectedCacheKeys = ownKeys(expectedCache); expectedCachePrototype = proto(expectedCache);
    expectedPathCache = snapshot(Module._pathCache);
    moduleRecords = [];
    for (let i = 0; i < expectedCacheKeys.length; i++) {
      const key = expectedCacheKeys[i], d = slot(expectedCache, key), instance = d && d.data && d.value;
      if (!instance || !call(sHas, expectedModules, [instance]) || !safe(instance)) { bootQualified = false; return reject("unclassified-loaded-module"); }
      const record = create(null); record.key = key; record.cacheSlot = d; record.instance = instance;
      record.prototype = proto(instance);
      record.keys = ownKeys(instance); record.slots = [];
      for (let j = 0; j < record.keys.length; j++) {
        const name = record.keys[j], v = slot(instance, name);
        push(record.slots, v);
        if (name !== "children" && name !== "parent" && name !== "loaded" && name !== "exports" && v && v.data) push(roots, v.value);
      }
      push(roots, instance.exports); push(moduleRecords, record);
    }
    // Module caches/bookkeeping are handled separately; pin all other loader
    // slots, functions, extension handlers and full reachable descriptors.
    const moduleKeys = ownKeys(Module);
    const moduleLoaderSlots = [];
    for (let i = 0; i < moduleKeys.length; i++) {
      const key = moduleKeys[i], d = slot(Module, key); push(moduleLoaderSlots, { key, slot: d });
      if (key !== "_cache" && key !== "_pathCache" && d && d.data) push(roots, d.value);
    }
    push(roots, proto(Module));
    records = captureGraph(roots);
    if (!records) { bootQualified = false; return reject("passive-snapshot-bound-or-proxy"); }
    // Keep the special Module snapshot private and outside recursive traversal.
    const loaderRecord = create(null); loaderRecord.loader = true; loaderRecord.prototype = proto(Module); loaderRecord.keys = moduleKeys; loaderRecord.slots = moduleLoaderSlots;
    push(records, loaderRecord);
    lastFailure = "none"; return true;
  } catch (_) { bootQualified = false; return reject("seal-snapshot-error"); }
}
function qualified() {
  if (!sealed || !bootQualified) return false;
  try {
    for (let i = 0; i < globalSlots.length; i++) if (!equalSlot(nativeGlobal, globalSlots[i].key, globalSlots[i].slot)) return reject("global-drift:" + globalSlots[i].key);
    for (let i = 0; i < processSlots.length; i++) if (!equalSlot(nativeProcess, processSlots[i].key, processSlots[i].slot)) return reject("process-drift:" + processSlots[i].key);
    if (!safe(nativeEnv) || proto(nativeEnv) !== envPrototype) return reject("native-environment-drift");
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.loader) {
        if (proto(Module) !== record.prototype || !sameKeys(ownKeys(Module), record.keys)) return reject("loader-descriptor-drift");
        for (let k = 0; k < record.slots.length; k++) if (!equalSlot(Module, record.slots[k].key, record.slots[k].slot)) return reject("loader-slot-drift");
      } else if (!unchanged(record)) return reject("passive-descriptor-drift:" + i);
    }
    // All operations used by startupSupported (including its native inspector
    // accessor and regexp prototypes) have now passed passive identity probes.
    if (!startupSupported()) return reject("startup-mode-drift");
    if (Module._cache !== expectedCache || !safe(expectedCache) || proto(expectedCache) !== expectedCachePrototype || !sameKeys(ownKeys(expectedCache), expectedCacheKeys)
        || Module._pathCache !== expectedPathCache.value || !unchanged(expectedPathCache)) return reject("loader-cache-drift");
    for (let i = 0; i < moduleRecords.length; i++) {
      const record = moduleRecords[i], instance = record.instance;
      if (!equalSlot(expectedCache, record.key, record.cacheSlot) || !safe(instance) || proto(instance) !== record.prototype || !sameKeys(ownKeys(instance), record.keys)) return reject("source-module-drift");
      for (let j = 0; j < record.keys.length; j++) {
        const key = record.keys[j];
        if (key === "children") {
          const d = slot(instance, key), children = d && d.data && d.value;
          if (!Array.isArray(children) || !safe(children) || proto(children) !== Array.prototype) return reject("module-children-drift");
          const keys = ownKeys(children);
          if (keys.length !== children.length + 1 || keys[keys.length - 1] !== "length") return reject("module-children-slots-drift");
          for (let k = 0; k < children.length; k++) {
            const child = slot(children, "" + k);
            if (!child || !child.data || !call(sHas, expectedModules, [child.value])) return reject("module-child-unclassified");
          }
        } else if (key === "loaded" && instance === main) {
          const d = slot(instance, key); if (!d || !d.data || typeof d.value !== "boolean") return reject("entry-module-loaded-drift");
        } else if (!equalSlot(instance, key, record.slots[j])) return reject("source-module-slot-drift");
      }
    }
    return true;
  } catch (_) { return reject("passive-qualification-error"); }
}
// Ordinary v1 executes the literal validator outside the CPU epoch. It may
// change ordinary internal data (for example RegExp.lastIndex), but it may not
// load or replace code after seal. The CPU epoch's full qualified() is unchanged.
function verifyClosedModuleGraph() {
  if (!sealed || !bootQualified) return false;
  try {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record.loader) continue;
      if (proto(Module) !== record.prototype || !sameKeys(ownKeys(Module), record.keys)) return reject("loader-descriptor-drift");
      for (let k = 0; k < record.slots.length; k++) if (!equalSlot(Module, record.slots[k].key, record.slots[k].slot)) return reject("loader-slot-drift");
    }
    if (Module._cache !== expectedCache || !safe(expectedCache) || proto(expectedCache) !== expectedCachePrototype || !sameKeys(ownKeys(expectedCache), expectedCacheKeys)
        || Module._pathCache !== expectedPathCache.value || !unchanged(expectedPathCache)) return reject("loader-cache-drift");
    for (let i = 0; i < moduleRecords.length; i++) {
      const record = moduleRecords[i], instance = record.instance;
      if (!equalSlot(expectedCache, record.key, record.cacheSlot) || !safe(instance) || proto(instance) !== record.prototype || !sameKeys(ownKeys(instance), record.keys)) return reject("source-module-drift");
      for (let j = 0; j < record.keys.length; j++) {
        const key = record.keys[j];
        if (key === "children") {
          const d = slot(instance, key), children = d && d.data && d.value;
          if (!Array.isArray(children) || !safe(children) || proto(children) !== Array.prototype) return reject("module-children-drift");
          const keys = ownKeys(children);
          if (keys.length !== children.length + 1 || keys[keys.length - 1] !== "length") return reject("module-children-slots-drift");
          for (let k = 0; k < children.length; k++) {
            const child = slot(children, "" + k);
            if (!child || !child.data || !call(sHas, expectedModules, [child.value])) return reject("module-child-unclassified");
          }
        } else if (key === "loaded" && instance === main) {
          const d = slot(instance, key); if (!d || !d.data || typeof d.value !== "boolean") return reject("entry-module-loaded-drift");
        } else if (!equalSlot(instance, key, record.slots[j])) return reject("source-module-slot-drift");
      }
    }
    return true;
  } catch (_) { return reject("module-graph-qualification-error"); }
}
function isActive() { return active; }
function diagnostics() {
  const result = create(null);
  result.bootAttempted = bootAttempted; result.bootQualified = bootQualified; result.sealed = sealed;
  result.commandCalls = commandCalls; result.enteredCount = enteredCount; result.qualifiedFalseCount = qualifiedFalseCount; result.lastFailure = lastFailure;
  result.codecCalls = codecCalls; result.codecEnteredCount = codecEnteredCount;
  return call(freeze, Object, [result]);
}

// Passive observation only: grants no epoch, content fact or execution authority.
module.exports = Object.freeze({ bootstrap, bindCodec, bindCommand, bindSelector, bindFacts, seal,
  verifyClosedModuleGraph, isActive, diagnostics });
