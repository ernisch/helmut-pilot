"use strict";

// Client-only, read-only endpoint qualification. No source preparation, opaque
// source handles, SQL connector, claims, seed, engine, provider or raw mutator.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), v8 = require("node:v8");
const Module = require("node:module"), { isDeepStrictEqual } = require("node:util");
const ROOT = path.resolve(__dirname, "../.."), ENDPOINT = path.join(ROOT, "lib/helmut/local-unit-diagnostic-endpoint.js");
const TRUST_DIR = "/run/helmut-local-unit-diagnostic", TRUST = TRUST_DIR + "/trust.json", SOCKET = TRUST_DIR + "/broker.sock";
const CONTRACT = "/rest/v1/rpc/local_unit_diagnostic_contract_v1", CAP = 1024 * 1024, CGROUP2 = 0x63677270;
const ENV = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "HELMUT_STORAGE_BACKEND", "SUPABASE_URL",
  "HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE", "HELMUT_NATIVE_NODE_OLD_SPACE_MIB"]);
const META = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && Reflect.ownKeys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const hash = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x), sha = b => crypto.createHash("sha256").update(b).digest("hex");
const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const need = (ok, code) => { if (!ok) throw Error("local-unit-native-endpoint-qualification-" + code); };
let attempted = false;
function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x !== null && typeof x === "object") return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
function canonicalPath(name) {
  need(typeof name === "string" && path.isAbsolute(name) && path.normalize(name) === name && fs.realpathSync(name) === name, "canonical-path");
  let current = path.parse(name).root;
  for (const part of name.slice(current.length).split(path.sep)) { current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component"); }
}
function pinShape(p, cap = 256 * 1024 * 1024) {
  need(exact(p, ["path", "bytes", "sha256"]) && typeof p.path === "string" && path.isAbsolute(p.path) && path.normalize(p.path) === p.path
    && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= cap && hash(p.sha256), "file-pin");
}
function readFile(name, { pin = null, privateFile = false, cap = CAP, keep = true, rootTrust = false } = {}) {
  if (pin) { pinShape(pin, cap); need(pin.path === name, "pin-path"); } canonicalPath(name);
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && a.size > 0n && a.size <= BigInt(cap) && (!pin || a.size === BigInt(pin.bytes))
      && (!privateFile || a.uid === 1000n && (a.mode & 0o7777n) === 0o600n)
      && (!rootTrust || a.uid === 0n && (a.mode & 0o7777n) === 0o444n), "file-metadata");
    const h = crypto.createHash("sha256"), blocks = [], buffer = Buffer.alloc(Math.min(Number(a.size) + 1, 65536)); let total = 0;
    while (true) { const n = fs.readSync(fd, buffer, 0, Math.min(buffer.length, Number(a.size) - total + 1), null);
      if (!n) break; total += n; need(total <= Number(a.size), "file-grew"); h.update(buffer.subarray(0, n)); if (keep) blocks.push(Buffer.from(buffer.subarray(0, n))); }
    const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(name, { bigint: true }), hex = h.digest("hex");
    need(total === Number(a.size) && META.every(k => a[k] === b[k] && b[k] === named[k]) && fs.realpathSync(name) === name
      && (!pin || hex === pin.sha256), "file-drift");
    return { bytes: keep ? Buffer.concat(blocks) : null, pin: { path: name, bytes: total, sha256: hex }, identity: META.map(k => String(a[k])) };
  } finally { fs.closeSync(fd); }
}
function parseJSON(bytes, pretty = false) {
  const text = bytes.toString("utf8"); need(Buffer.from(text).equals(bytes), "json-utf8");
  let value; try { value = JSON.parse(text); } catch { need(false, "json-invalid"); }
  let syntax = text;
  if (pretty) { syntax = ""; let quoted = false, escaped = false;
    for (const ch of text) { if (quoted || !/\s/.test(ch)) syntax += ch;
      if (quoted && escaped) escaped = false; else if (quoted && ch === "\\") escaped = true; else if (ch === '"') quoted = !quoted; }
  }
  need(JSON.stringify(value) === syntax, "json-unique"); return value;
}
function selector(value) {
  need(exact(value, ["operationId", "commandHash"]) && typeof value.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(value.operationId)
    && hash(value.commandHash), "selection"); return value;
}
function nodeBudget() {
  need(process.version === "v24.19.0" && process.getuid() === 1000 && process.geteuid() === 1000 && process.execArgv.length === 2
    && process.execArgv[0] === "--max-old-space-size=384" && process.execArgv[1] === "--max-semi-space-size=16"
    && !Object.hasOwn(process.env, "NODE_OPTIONS") && process.env.HELMUT_NATIVE_NODE_OLD_SPACE_MIB === "384"
    && Object.keys(process.env).every(k => ENV.has(k)), "client-budget-environment");
  const heapSizeLimitBytes = v8.getHeapStatistics().heap_size_limit;
  need(Number.isSafeInteger(heapSizeLimitBytes) && heapSizeLimitBytes > 0 && heapSizeLimitBytes <= 448 * 1024 * 1024, "actual-heap-limit");
  return { nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes };
}
function checkConfig(c, selection) {
  need(exact(c, ["schema", "selection", "database", "databaseOID", "sqlSources", "publicSourceBinding", "codePins", "nodePin",
    "issuedAtUTC", "expiresAtUTC", "measuredCgroup"]) && c.schema === "helmut-local-unit-native-endpoint-qualification-config/1"
    && isDeepStrictEqual(selector(c.selection), selection) && c.database === "helmut_unit_diagnostic_" + selection.operationId.slice(-32)
    && typeof c.databaseOID === "string" && /^[1-9][0-9]{0,9}$/.test(c.databaseOID) && BigInt(c.databaseOID) <= 4294967295n, "configuration");
  need(utc(c.issuedAtUTC) && utc(c.expiresAtUTC) && Date.parse(c.issuedAtUTC) <= Date.now() && Date.now() - Date.parse(c.issuedAtUTC) <= 10000
    && Date.parse(c.expiresAtUTC) > Date.now() && Date.parse(c.expiresAtUTC) - Date.parse(c.issuedAtUTC) <= 180000, "configuration-window");
  need(c.sqlSources && typeof c.sqlSources === "object" && !Array.isArray(c.sqlSources) && Object.keys(c.sqlSources).length > 0
    && Object.keys(c.sqlSources).length <= 128 && Object.entries(c.sqlSources).every(([name, value]) =>
      /^(?:helmut_unit_diagnostic\.[a-z][a-z0-9_]*|public\.local_unit_diagnostic_[a-z_]+_v1)\([a-z0-9_. ,\[\]]*\)$/.test(name) && hash(value)), "sql-sources");
  need(c.publicSourceBinding?.schema === "helmut-local-unit-original-source-binding/1" && c.publicSourceBinding.operationId === selection.operationId
    && c.publicSourceBinding.commandHash === selection.commandHash && c.publicSourceBinding.database === c.database, "public-source-binding");
  need((!process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE || process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === c.database)
    && (!process.env.HELMUT_STORAGE_BACKEND || process.env.HELMUT_STORAGE_BACKEND === "supabase"), "environment-target");
  if (process.env.SUPABASE_URL) { let url; try { url = new URL(process.env.SUPABASE_URL); } catch { need(false, "local-origin"); }
    need(url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
      && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname) || /^10\.\d+\.\d+\.\d+$/.test(url.hostname)
        || /^192\.168\.\d+\.\d+$/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname)), "local-origin"); }
  pinShape(c.nodePin); need(c.nodePin.path === fs.realpathSync(process.execPath), "node-pin");
  need(exact(c.measuredCgroup, ["path", "device", "inode", "procMembership"]) && c.measuredCgroup.path === "/owned-group"
    && Number.isSafeInteger(c.measuredCgroup.device) && Number.isSafeInteger(c.measuredCgroup.inode) && c.measuredCgroup.inode > 0
    && c.measuredCgroup.procMembership === "0::/\n", "cgroup-pin");
  need(Array.isArray(c.codePins) && c.codePins.length >= 2 && c.codePins.length <= 4096, "code-pins"); const names = new Set();
  for (const p of c.codePins) { pinShape(p, 16 * 1024 * 1024); need(p.path.startsWith(ROOT + path.sep) && /\.(?:js|json)$/.test(p.path)
    && !names.has(p.path), "code-path"); names.add(p.path); }
  need(names.has(__filename) && names.has(ENDPOINT), "genuine-endpoint-code-required");
}
function processIdentity() {
  const pid = process.pid, text = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), a = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(text.slice(0, text.indexOf(" "))) === pid && !["Z", "X"].includes(a[0]) && /^[0-9]+$/.test(a[19]), "client-process");
  const namespaces = Object.fromEntries(["pid", "mnt", "cgroup", "user"].map(name => {
    const value = fs.readlinkSync("/proc/self/ns/" + name); need(new RegExp("^" + name + ":\\[[1-9][0-9]*\\]$").test(value), "namespace"); return [name, value]; }));
  return { pid, startTicks: a[19], exe: fs.readlinkSync(`/proc/${pid}/exe`), membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8"), namespaces };
}
function group(c, self) {
  canonicalPath(c.measuredCgroup.path); const s = fs.statSync(c.measuredCgroup.path), type = fs.statfsSync(c.measuredCgroup.path).type;
  const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n");
  need(s.isDirectory() && s.dev === c.measuredCgroup.device && s.ino === c.measuredCgroup.inode && type === CGROUP2
    && self.membership === c.measuredCgroup.procMembership && mounts.some(line => { const f = line.split(" ");
      return f[4] === c.measuredCgroup.path && f[5].split(",").includes("ro") && line.split(" - ")[1]?.split(" ")[0] === "cgroup2"; }), "actual-measured-cgroup");
}
function loader(c) {
  const pins = new Map(c.codePins.map(p => [p.path, p])), original = Module._load;
  need(Object.keys(Module._cache).every(name => name === __filename), "fresh-module-cache");
  for (const p of c.codePins) readFile(p.path, { pin: p, cap: 16 * 1024 * 1024, keep: false });
  function pinned(request, parent, isMain) { if (!Module.isBuiltin(request)) {
    const name = Module._resolveFilename(request, parent, isMain), p = pins.get(name); need(p, "unqualified-import"); readFile(name, { pin: p, cap: 16 * 1024 * 1024, keep: false }); }
    return Reflect.apply(original, this, arguments); }
  Module._load = pinned;
  return { check() { need(Module._load === pinned, "loader-drift"); for (const name of Object.keys(Module._cache)) need(name === __filename || pins.has(name), "cache-drift"); },
    close() { need(Module._load === pinned, "loader-drift"); Module._load = original; } };
}
function trust(c, selection) {
  const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n");
  need(mounts.some(line => { const f = line.split(" "); return f[4] === TRUST_DIR && f[5].split(",").includes("ro"); }), "readonly-root-trust");
  const paths = ["/", "/run", TRUST_DIR].map(name => { const s = fs.lstatSync(name, { bigint: true });
    need(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0n && (s.mode & 0o022n) === 0n, "root-trust-parent"); return [name, META.map(k => String(s[k]))]; });
  const socket = fs.lstatSync(SOCKET, { bigint: true }); need(socket.isSocket() && socket.uid === 0n && socket.nlink === 1n
    && (socket.mode & 0o7777n) === 0o666n, "root-trust-socket"); paths.push([SOCKET, META.map(k => String(socket[k]))]);
  const raw = readFile(TRUST, { rootTrust: true, cap: 65536 }), anchor = parseJSON(raw.bytes, true);
  need(anchor.schema === "helmut-local-unit-diagnostic-root-anchor/2" && anchor.operationId === selection.operationId
    && anchor.commandHash === selection.commandHash && anchor.database === c.database
    && isDeepStrictEqual(anchor.originalService, c.publicSourceBinding), "actual-root-source-binding");
  return { rawSHA256: raw.pin.sha256, identity: raw.identity, paths, anchor };
}
function contract(value, c, anchor) {
  need(exact(value, ["version", "database", "databaseOID", "sources", "legacyReadRPCs", "sourceQualified"])
    && value.version === "helmut-local-unit-diagnostic-native-store/1" && value.database === c.database && value.databaseOID === c.databaseOID
    && value.sourceQualified === false && isDeepStrictEqual(value.sources, c.sqlSources), "actual-contract");
  need(Array.isArray(anchor.legacy?.rpcs) && anchor.legacy.rpcs.length === 2 && new Set(anchor.legacy.rpcs.map(r => r.name)).size === 2 && anchor.legacy.rpcs.every(r =>
    ["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"].includes(r.name)), "root-read-contract");
  const expected = anchor.legacy.rpcs.map(r => ({ name: r.name, oid: r.oid, identityArguments: r.identityArguments,
    prosrcSHA256: r.prosrcSHA256, qualificationPin: r.qualificationPin })).sort((a, b) => a.name.localeCompare(b.name));
  need(isDeepStrictEqual(value.legacyReadRPCs, expected), "actual-read-contract");
}
function writeReport(directory, report) {
  canonicalPath(directory); const before = fs.lstatSync(directory, { bigint: true });
  need(before.isDirectory() && before.uid === 1000n && (before.mode & 0o022n) === 0n, "case-directory");
  const name = path.join(directory, "ENDPOINT_QUALIFICATION.SAFE.json"), bytes = Buffer.from(JSON.stringify(report) + "\n"); need(bytes.length <= CAP, "report-cap");
  const fd = fs.openSync(name, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try { const a = fs.fstatSync(fd, { bigint: true }); need(a.isFile() && a.uid === 1000n && a.nlink === 1n && a.size === 0n && (a.mode & 0o7777n) === 0o600n, "report-metadata");
    let n = 0; while (n < bytes.length) { const count = fs.writeSync(fd, bytes, n, bytes.length - n, null); need(count > 0, "report-short-write"); n += count; }
    fs.fsyncSync(fd); const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(name, { bigint: true }), after = fs.lstatSync(directory, { bigint: true });
    need(b.size === BigInt(bytes.length) && ["dev", "ino", "mode", "uid", "gid", "nlink"].every(k => a[k] === b[k])
      && META.every(k => b[k] === named[k]) && before.dev === after.dev && before.ino === after.ino, "report-drift");
  } finally { fs.closeSync(fd); }
  const pin = { path: name, bytes: bytes.length, sha256: sha(bytes) }; readFile(name, { pin, privateFile: true, keep: false }); return pin;
}
async function start() {
  need(!attempted && arguments.length === 0, "once-only"); attempted = true;
  need(process.argv.length === 4 && process.argv[2] === "--selector" && require.main?.filename === __filename, "explicit-cli");
  const match = /^\/workspace\/helmut-unit-diagnostic-native\/([a-f0-9]{32})\/SELECTION\.SAFE\.json$/.exec(process.argv[3]); need(match, "selector-path");
  const actualNodeBudget = nodeBudget(), directory = path.dirname(process.argv[3]);
  const selectionFile = readFile(process.argv[3]), selection = selector(parseJSON(selectionFile.bytes, true));
  need(selection.operationId === "localUnitDiagnostic-" + match[1], "selector-case");
  const name = path.join(directory, "ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json"), configFile = readFile(name, { privateFile: true }), c = parseJSON(configFile.bytes);
  checkConfig(c, selection); const self = processIdentity(), began = process.hrtime.bigint(); need(self.exe === c.nodePin.path, "actual-node-exe"); group(c, self);
  readFile(c.nodePin.path, { pin: c.nodePin, cap: 256 * 1024 * 1024, keep: false }); const loading = loader(c);
  const guard = () => { loading.check(); need(isDeepStrictEqual(processIdentity(), self), "client-process-drift"); group(c, self);
    need(Date.now() < Date.parse(c.expiresAtUTC) && process.hrtime.bigint() - began < 180000000000n, "expired");
    readFile(name, { pin: configFile.pin, privateFile: true, keep: false }); readFile(process.argv[3], { pin: selectionFile.pin, keep: false }); };
  try {
    const Endpoint = require(ENDPOINT); need(exact(Endpoint, ["request"]) && typeof Endpoint.request === "function", "genuine-endpoint"); guard();
    const before = trust(c, selection), response = await Endpoint.request(selection, c.database, "POST", CONTRACT, Buffer.from("{}")); guard();
    need(exact(response, ["status", "body"]) && response.status === 200 && Buffer.isBuffer(response.body) && response.body.length <= CAP, "signed-contract-response");
    const catalog = parseJSON(response.body, true); contract(catalog, c, before.anchor);
    const foreign = { ...selection, commandHash: (selection.commandHash[0] === "0" ? "1" : "0") + selection.commandHash.slice(1) };
    let rejected = false;
    try { await Endpoint.request(foreign, c.database, "POST", CONTRACT, Buffer.from("{}")); }
    catch (error) { rejected = error?.message === "local-unit-diagnostic-endpoint-root-anchor-binding"; }
    need(rejected, "foreign-scope-pre-request-rejection-required"); guard();
    const after = trust(c, selection); need(before.rawSHA256 === after.rawSHA256 && isDeepStrictEqual(before.identity, after.identity)
      && isDeepStrictEqual(before.paths, after.paths), "root-trust-drift");
    for (const p of [...c.codePins, c.nodePin]) readFile(p.path, { pin: p, cap: 256 * 1024 * 1024, keep: false }); guard();
    const report = { schema: "helmut-local-unit-native-endpoint-qualification/1", selection, database: c.database, databaseOID: c.databaseOID,
      observedAtUTC: new Date().toISOString(), configPin: configFile.pin, selectorPin: selectionFile.pin, rootTrustSHA256: before.rawSHA256,
      publicSourceBindingCanonicalSHA256: sha(canonical(before.anchor.originalService)), contractBodySHA256: sha(response.body),
      sqlSourcesCanonicalSHA256: sha(canonical(catalog.sources)), sqlSourceCount: Object.keys(catalog.sources).length,
      actualNodeBudget, process: self, measuredCgroup: c.measuredCgroup, codePinCount: c.codePins.length,
      signedReadonlyContractObserved: true, foreignScopeRejectedBeforeRequest: true,
      foreignScopeNativeRequestCount: null, foreignScopeNativeRequestCountMeasured: false,
      liveRawMutatorNegativesPerformed: false, liveOriginalControlReadPerformed: false, nativeACLProofPerformed: false,
      seedPerformed: false, scopeClaimConsumed: false, unitExecutionQualified: false, full500Qualified: false };
    const reportPin = writeReport(directory, report); guard();
    process.stdout.write(JSON.stringify({ schema: "helmut-local-unit-native-endpoint-qualification-result/1", reportPin,
      rootTrustSHA256: report.rootTrustSHA256, actualNodeBudget, process: self, signedReadonlyContractObserved: true,
      liveRawMutatorNegativesPerformed: false, seedPerformed: false, scopeClaimConsumed: false, unitExecutionQualified: false }) + "\n");
    return report;
  } finally { loading.close(); }
}
module.exports = Object.freeze({ start });
if (require.main === module) start().catch(() => {
  process.exitCode = 1; process.stderr.write('{"schema":"helmut-local-unit-native-endpoint-qualification-failure/1","qualified":false,"retryAllowed":false}\n');
});
