"use strict";

// Run only in the new root-owned measured owner container. This broker never
// accepts a URL, credential, SQL statement or alternate upstream from a client.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), http = require("node:http"), net = require("node:net");
const { isDeepStrictEqual } = require("node:util");
const v8 = require("node:v8");
const ROOT = "/run/helmut-local-unit-diagnostic", PRIVATE = "/run/helmut-local-unit-diagnostic-owner";
const ORIGINAL_SOCKET = "/ram/helmut-original-write-bridge.sock", ORIGINAL_WRITE = "/rest/v1/rpc/local_unit_diagnostic_original_write_v1";
const SOURCE_QUALIFICATION = "/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json", HMAC_KEY = "/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin";
const CAP = 36 * 1024 * 1024, sha = b => crypto.createHash("sha256").update(b).digest("hex");
const TRACE = "/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl", TRACE_CAP = 65536;
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const RPC = Object.freeze({ contract: [], authority_read: ["p_scope_hash", "p_nonce"], runtime_read: ["p_scope_hash", "p_nonce"],
  state_read: ["p_scope_hash", "p_nonce"], state_cas: ["p_scope_hash", "p_claim_hash", "p_old_hash", "p_old_revision", "p_next_canonical", "p_next_hash", "p_nonce"],
  artifact_insert: ["p_scope_hash", "p_claim_hash", "p_kind", "p_logical_id", "p_canonical", "p_sha256", "p_parent_hash", "p_nonce"],
  artifact_read: ["p_scope_hash", "p_kind", "p_logical_id", "p_expected_sha256", "p_nonce"],
  lease_acquire: ["p_scope_hash", "p_claim_hash", "p_job", "p_ttl_ms", "p_nonce"],
  lease_release: ["p_scope_hash", "p_claim_hash", "p_job", "p_token", "p_nonce"] });
function need(ok, code) { if (!ok) throw Error("local-unit-broker-" + code); }
// PRIVATE stderr diagnosis only; settled never means ACK or acceptance. Missing
// rows/caps/stream failures leave this timing unqualified, without changing I/O.
// Columns: handler begin, authorized, prechecked, optional contract await start/
// resumed, upstream await start/resumed, postchecked, handler finally. The last
// marker follows trace.finish/release and can follow the client's return.
// Require a complete unique nonce join, not "settled", for a timing comparison.
let phaseCount = 0, phaseBytes = 0, phaseDisabled = false, phaseSink = null;
function disablePhaseTiming() { phaseDisabled = true; }
function beginPhaseTiming(nonce, began) {
  try {
    if (phaseDisabled) return null;
    if (phaseCount >= 256 || typeof began !== "bigint" || began < 0n || !HASH.test(nonce)) { disablePhaseTiming(); return null; }
    if (!phaseSink) {
      const sink = process.stderr;
      if (!sink || typeof sink.write !== "function" || typeof sink.on !== "function") { disablePhaseTiming(); return null; }
      sink.on("error", disablePhaseTiming); phaseSink = sink;
    }
    return { index: phaseCount++, nonceHash: sha(nonce), times: [String(began), ...Array(8).fill(null)] };
  } catch { disablePhaseTiming(); return null; }
}
function markPhaseTiming(timing, index) {
  try {
    if (!timing || phaseDisabled) return;
    const ns = process.hrtime.bigint(), prior = timing.times.filter(x => x !== null).at(-1);
    if (!Number.isInteger(index) || index < 1 || index > 8 || timing.times[index] !== null
      || typeof ns !== "bigint" || ns < BigInt(prior) || String(ns).length > 20) { disablePhaseTiming(); return; }
    timing.times[index] = String(ns);
  } catch { disablePhaseTiming(); }
}
function finishPhaseTiming(timing, kind, outcome) {
  try {
    if (!timing || phaseDisabled) return;
    if (!["native", "legacy", "original"].includes(kind) || !["settled", "failed"].includes(outcome)) { disablePhaseTiming(); return; }
    markPhaseTiming(timing, 8); if (phaseDisabled) return;
    const row = "HELMUT_BROKER_READ_PHASES_V1 " + JSON.stringify([timing.index, kind, outcome, timing.nonceHash, timing.times]) + "\n";
    if (row.length > 512 || phaseBytes + row.length > 65536 || !/^[\x20-\x7e]+\n$/.test(row)) { disablePhaseTiming(); return; }
    phaseBytes += row.length;
    if (phaseSink.write(row, error => { if (error) disablePhaseTiming(); }) === false) disablePhaseTiming();
  } catch { disablePhaseTiming(); }
}
function statIdentity(s) { return [s.dev, s.ino, s.mode, s.uid, s.gid, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String); }
function rootParents(filename) {
  need(path.isAbsolute(filename) && path.normalize(filename) === filename && !filename.includes("\0"), "canonical-path");
  let p = "/";
  for (const name of ["", ...filename.split("/").slice(1, -1)]) {
    if (name) p = path.join(p, name);
    const s = fs.lstatSync(p);
    need(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o022) === 0, "root-parent");
  }
}
function readRegular(filename, cap, { rootPrivate = false, expected = null, procExe = false, contents = true } = {}) {
  if (!procExe) {
    need(fs.realpathSync(filename) === filename, "canonical-file");
    if (rootPrivate) rootParents(filename);
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (procExe ? 0 : fs.constants.O_NOFOLLOW));
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && a.size > 0n && a.size <= BigInt(cap)
      && (!rootPrivate || a.uid === 0n && (a.mode & 0o777n) === 0o600n), "regular-file");
    const blocks = [], hash = crypto.createHash("sha256"), buffer = Buffer.alloc(Math.min(Number(a.size), 1048576)); let size = 0, n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) { size += n; need(size <= cap, "file-cap"); hash.update(buffer.subarray(0, n)); if (contents) blocks.push(Buffer.from(buffer.subarray(0, n))); }
    const pin = { path: filename, bytes: size, sha256: hash.digest("hex") };
    need(size === Number(a.size) && isDeepStrictEqual(statIdentity(a), statIdentity(fs.fstatSync(fd, { bigint: true })))
      && (procExe || isDeepStrictEqual(statIdentity(a), statIdentity(fs.lstatSync(filename, { bigint: true })))), "file-drift");
    if (expected) need(size === expected.bytes && pin.sha256 === expected.sha256, "file-pin");
    return { bytes: Buffer.concat(blocks), pin, identity: statIdentity(a) };
  } finally { fs.closeSync(fd); }
}
function pinShape(p) { need(exact(p, ["path", "bytes", "sha256"]) && path.isAbsolute(p.path) && path.normalize(p.path) === p.path
  && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 256 * 1024 * 1024 && /^[a-f0-9]{64}$/.test(p.sha256), "pin-shape"); }
function executableMounts() {
  const namespace = fs.readlinkSync("/proc/self/ns/mnt"), raw = fs.readFileSync("/proc/self/mountinfo");
  need(/^mnt:\[[1-9][0-9]*\]$/.test(namespace) && raw.length > 0 && raw.length <= 2 * 1024 * 1024, "executable-mount-context");
  return { namespace, hash: sha(raw), text: raw.toString("utf8") };
}
function executableContinuity(pid, expected) {
  pinShape(expected); need(Number.isSafeInteger(pid) && pid > 0, "pid");
  const pin = Object.freeze({ ...expected }), proc = `/proc/${pid}/exe`, mounts = executableMounts();
  const decode = x => x.replace(/\\(040|011|012|134)/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
  const covering = mounts.text.trim().split("\n").map(line => {
    const f = line.split(" "), sep = f.indexOf("-");
    need(sep >= 6 && f.length > sep + 3 && f[4].startsWith("/"), "executable-mount-context");
    return { point: decode(f[4]), options: f[5].split(",") };
  }).filter(r => pin.path === r.point || pin.path.startsWith(r.point === "/" ? "/" : r.point + "/"));
  const longest = covering.reduce((n, r) => Math.max(n, r.point.length), 0);
  need(longest > 0 && covering.filter(r => r.point.length === longest)
    .every(r => r.options.includes("ro") && !r.options.includes("rw")), "executable-readonly-mount");
  let identity = null, terminal = false;
  function inspect(initial) {
    need(!terminal, "executable-proof-terminal");
    try {
      const sameMounts = () => { const now = executableMounts(); need(now.namespace === mounts.namespace && now.hash === mounts.hash, "executable-mount-drift"); };
      const sameNames = () => need(fs.realpathSync(pin.path) === pin.path && fs.readlinkSync(proc) === pin.path, "executable-path-drift");
      sameMounts(); sameNames();
      const named = fs.lstatSync(pin.path, { bigint: true }), metadata = identity || statIdentity(named);
      const same = s => s.isFile() && s.nlink === 1n && s.size === BigInt(pin.bytes)
        && isDeepStrictEqual(statIdentity(s), metadata);
      need(same(named), "executable-file-drift");
      let namedFD = null, procFD = null;
      try {
        namedFD = fs.openSync(pin.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        procFD = fs.openSync(proc, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
        const bound = () => {
          sameNames();
          need(same(fs.fstatSync(namedFD, { bigint: true })) && same(fs.fstatSync(procFD, { bigint: true }))
            && same(fs.lstatSync(pin.path, { bigint: true })) && same(fs.statSync(proc, { bigint: true })), "executable-file-drift");
          sameNames();
        };
        bound();
        if (initial) {
          // Hash the live executable once while its canonical named FD is also
          // held and bound. Later checks prove 9MD + unchanged RO mount context,
          // not a fresh content SHA or a mutable caller-supplied cache entry.
          const hash = crypto.createHash("sha256"), buffer = Buffer.alloc(Math.min(pin.bytes, 1048576)); let size = 0, n;
          while ((n = fs.readSync(procFD, buffer, 0, buffer.length, null)) > 0) { size += n; need(size <= pin.bytes, "executable-file-cap"); hash.update(buffer.subarray(0, n)); }
          need(size === pin.bytes && hash.digest("hex") === pin.sha256, "executable-file-pin");
        }
        bound(); sameMounts(); bound();
        if (!identity) identity = Object.freeze(metadata);
      } finally {
        try { if (procFD !== null) fs.closeSync(procFD); } finally { if (namedFD !== null) fs.closeSync(namedFD); }
      }
    } catch (error) { terminal = true; throw error; }
  }
  inspect(true);
  return Object.freeze(() => inspect(false));
}
function processInfo(pid) {
  need(Number.isSafeInteger(pid) && pid > 0, "pid");
  const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(text.slice(0, text.indexOf(" "))) === pid && !["Z", "X"].includes(fields[0]) && /^[0-9]+$/.test(fields[19])
    && /^[0-9]+$/.test(fields[1]), "live-process");
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8"), ids = label => {
    const m = new RegExp("^" + label + ":[\\t ]+([0-9\\t ]+)$", "m").exec(status), values = m?.[1].trim().split(/\s+/).map(Number);
    need(values?.length === 4 && values.every(value => value === 0), "actual-root-uid-gid"); return Object.freeze(values);
  };
  const uids = ids("Uid"), gids = ids("Gid");
  for (const name of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    need(new RegExp("^" + name + ":\\s*0+\\s*$", "m").test(status), "actual-root-capabilities");
  need(/^NoNewPrivs:\s*1\s*$/m.test(status), "actual-root-no-new-privileges");
  const pidNamespace = fs.readlinkSync(`/proc/${pid}/ns/pid`); need(/^pid:\[[1-9][0-9]*\]$/.test(pidNamespace), "actual-root-pid-namespace");
  const observed = { pid, parentPID: Number(fields[1]), startTicks: fields[19], exe: fs.readlinkSync(`/proc/${pid}/exe`),
    membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8"), pidNamespace, uids, gids, capabilitiesZero: true, noNewPrivileges: true };
  const after = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), tail = after.slice(after.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(after.slice(0, after.indexOf(" "))) === pid && !["Z", "X"].includes(tail[0])
    && tail[1] === fields[1] && tail[19] === fields[19], "actual-root-process-drift"); return Object.freeze(observed);
}
function nodeBudget(b) {
  need(exact(b, ["nodeVersion", "execArgv", "oldSpaceMiB", "semiSpaceMiB", "heapSizeLimitBytes"])
    && b.nodeVersion === "v24.19.0" && Array.isArray(b.execArgv) && b.execArgv.length === 2
    && b.execArgv.includes("--max-old-space-size=384") && b.execArgv.includes("--max-semi-space-size=16")
    && b.oldSpaceMiB === 384 && b.semiSpaceMiB === 16 && Number.isSafeInteger(b.heapSizeLimitBytes)
    && b.heapSizeLimitBytes >= 384 * 1048576 && b.heapSizeLimitBytes <= 448 * 1048576, "actual-node-budget");
}
function sourceBinding(c) {
  const o = c.originalService, b = o?.publicSourceBinding;
  need(exact(o, ["hmacKeyPath", "sourceQualificationPin", "publicSourceBinding"])
    && o.hmacKeyPath === HMAC_KEY && o.sourceQualificationPin?.path === SOURCE_QUALIFICATION, "original-private-paths");
  pinShape(o.sourceQualificationPin);
  need(exact(b, ["schema", "operationId", "commandHash", "database", "socketPath", "containerId", "pidNamespace", "supervisor", "service", "measuredCgroup", "hmacKeySHA256"])
    && b.schema === "helmut-local-unit-original-source-binding/1" && b.operationId === c.operationId
    && b.commandHash === c.commandHash && b.database === c.database && b.socketPath === ORIGINAL_SOCKET
    && /^[a-f0-9]{64}$/.test(b.containerId) && /^pid:\[[1-9][0-9]*\]$/.test(b.pidNamespace)
    && /^[a-f0-9]{64}$/.test(b.hmacKeySHA256), "original-source-binding");
  for (const p of [b.supervisor, b.service]) need(p?.uid === 1000 && Number.isSafeInteger(p.pid) && p.pid > 0
    && /^[0-9]+$/.test(p.startTicks), "source-observed-process");
  need(exact(b.supervisor, ["uid", "pid", "startTicks"]) && b.supervisor.pid !== b.service.pid
    && exact(b.service, ["uid", "pid", "startTicks", "exePin", "codePin", "configPin", "nodeBudget"]), "source-process-shape");
  for (const p of [b.service.exePin, b.service.codePin, b.service.configPin]) pinShape(p);
  nodeBudget(b.service.nodeBudget);
  need(exact(b.measuredCgroup, ["device", "inode", "procMembership"])
    && b.measuredCgroup.device === c.measuredCgroup.device && b.measuredCgroup.inode === c.measuredCgroup.inode
    && typeof b.measuredCgroup.procMembership === "string" && /^0::\/[^\0\r\n]*\n$/.test(b.measuredCgroup.procMembership), "source-measured-cgroup");
  return b;
}
function sourceQualification(c, value, now = Date.now(), fresh = false) {
  need(exact(value, ["schema", "operationId", "commandHash", "database", "issuedAtUTC", "expiresAtUTC", "publicSourceBinding"])
    && value.schema === "helmut-local-unit-source-supervisor-qualification/1" && value.operationId === c.operationId
    && value.commandHash === c.commandHash && value.database === c.database
    && isDeepStrictEqual(value.publicSourceBinding, c.originalService.publicSourceBinding), "source-supervisor-qualification");
  const issued = Date.parse(value.issuedAtUTC), expires = Date.parse(value.expiresAtUTC);
  need(Number.isFinite(issued) && Number.isFinite(expires) && new Date(issued).toISOString() === value.issuedAtUTC
    && new Date(expires).toISOString() === value.expiresAtUTC && issued <= now && now < expires
    && expires > issued && expires - issued <= 180000 && (!fresh || now - issued <= 15000), "source-qualification-window");
  return expires;
}
function validateConfig(c) {
  need(process.getuid() === 0 && !process.env.VERCEL, "root-owned-only");
  need(exact(c, ["schema", "operationId", "commandHash", "database", "upstream", "measuredCgroup", "legacy", "ownerQualificationPin", "originalService"])
    && c.schema === "helmut-local-unit-diagnostic-broker-config/2" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(c.operationId)
    && /^[a-f0-9]{64}$/.test(c.commandHash) && c.database === "helmut_unit_diagnostic_" + c.operationId.slice(-32), "config-scope");
  need(exact(c.upstream, ["port", "pid", "startTicks", "exePin", "configPin", "runtimeTokenPath"])
    && Number.isSafeInteger(c.upstream.port) && c.upstream.port >= 1024 && c.upstream.port <= 65535
    && /^[0-9]+$/.test(c.upstream.startTicks), "fixed-upstream");
  pinShape(c.upstream.exePin); pinShape(c.upstream.configPin); pinShape(c.ownerQualificationPin);
  need(exact(c.measuredCgroup, ["path", "device", "inode", "procMembership"])
    && Number.isSafeInteger(c.measuredCgroup.device) && Number.isSafeInteger(c.measuredCgroup.inode) && c.measuredCgroup.inode > 0
    && exact(c.measuredCgroup.procMembership, ["broker", "upstream"])
    && Object.values(c.measuredCgroup.procMembership).every(x => typeof x === "string" && /^0::\/[^\0\r]*\n$/.test(x)), "measured-cgroup");
  need(exact(c.legacy, ["tables", "rpcs"]) && Array.isArray(c.legacy.tables) && c.legacy.tables.length <= 64
    && new Set(c.legacy.tables).size === c.legacy.tables.length && c.legacy.tables.every(x => /^[a-z][a-z0-9_]{0,62}$/.test(x))
    && Array.isArray(c.legacy.rpcs) && c.legacy.rpcs.length <= 16, "legacy-allowlist");
  const names = new Set();
  for (const r of c.legacy.rpcs) {
    need(exact(r, ["name", "identityArguments", "oid", "prosrcSHA256", "qualificationPin", "requestKeys"])
      && /^helmut_auth_(?:state_graph|usage|control)_read_v1$/.test(r.name) && !names.has(r.name)
      && typeof r.identityArguments === "string" && r.identityArguments.length <= 512
      && /^[1-9][0-9]*$/.test(r.oid) && /^[a-f0-9]{64}$/.test(r.prosrcSHA256)
      && Array.isArray(r.requestKeys) && r.requestKeys.length <= 16 && new Set(r.requestKeys).size === r.requestKeys.length
      && r.requestKeys.every(k => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)), "qualified-read-rpc");
    pinShape(r.qualificationPin); names.add(r.name);
  }
  sourceBinding(c); return c;
}
function authorize(c, m, traceMeta = null) {
  need(exact(m, ["operationId", "commandHash", "database", "nonce", "method", "path", "bodyBase64"])
    && m.operationId === c.operationId && m.commandHash === c.commandHash && m.database === c.database
    && typeof m.nonce === "string" && /^[a-f0-9]{64}$/.test(m.nonce) && ["GET", "POST"].includes(m.method)
    && typeof m.path === "string" && m.path.length <= 16384 && !/[\0\r\n#\\]/.test(m.path)
    && typeof m.bodyBase64 === "string", "request-scope");
  const body = Buffer.from(m.bodyBase64, "base64"); need(body.length <= CAP && body.toString("base64") === m.bodyBase64, "request-bytes");
  const parsed = new URL(m.path, "http://127.0.0.1");
  need(m.path.startsWith("/rest/v1/") && parsed.origin === "http://127.0.0.1"
    && parsed.pathname === m.path.split("?")[0] && !parsed.pathname.includes("%"), "request-path");
  const native = /^\/rest\/v1\/rpc\/local_unit_diagnostic_([a-z_]+)_v1$/.exec(m.path);
  if (m.path === ORIGINAL_WRITE) {
    let args; try { args = JSON.parse(body.toString("utf8")); } catch { need(false, "original-json"); }
    need(m.method === "POST" && Buffer.from(body.toString("utf8")).equals(body) && JSON.stringify(args) === body.toString("utf8")
      && exact(args, ["schema", "mode", "operationId", "commandHash", "claimId", "originalCAS", "ownBefore", "ownNext", "artifact"])
      && args.schema === "helmut-local-unit-original-write/1" && ["state", "usage", "artifact"].includes(args.mode)
      && args.operationId === c.operationId && args.commandHash === c.commandHash
      && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(args.claimId)
      && (args.mode === "artifact" ? args.originalCAS === null
        : exact(args.originalCAS, ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"])
          && args.originalCAS.id === "main-auth") && exact(args.ownBefore, ["hash", "revision"])
      && exact(args.ownNext, ["canonical", "hash"])
      && (args.mode === "state" ? args.artifact === null : exact(args.artifact, ["kind", "logicalId", "canonical", "sha256", "parentHash"])
        && (args.mode === "usage" ? ["usage-D", "usage-R"]
          : ["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"]).includes(args.artifact.kind)), "closed-original-write");
    if (traceMeta && args.mode === "state") traceMeta.candidate = "state-write";
  } else if (native) {
    let args; try { args = JSON.parse(body.toString("utf8")); } catch { need(false, "native-json"); }
    need(m.method === "POST" && !["state_cas", "artifact_insert"].includes(native[1])
      && Object.hasOwn(RPC, native[1]) && exact(args, RPC[native[1]])
      && (!RPC[native[1]].includes("p_scope_hash") || args.p_scope_hash === c.commandHash)
      && (!RPC[native[1]].includes("p_nonce") || /^[a-f0-9]{64}$/.test(args.p_nonce)), "native-abi");
    if (traceMeta && native[1] === "state_read") traceMeta.candidate = "state-read";
  } else if (m.method === "GET") {
    need(body.length === 0 && /^\/rest\/v1\/[a-z][a-z0-9_]*(?:\?|$)/.test(m.path)
      && c.legacy.tables.includes(parsed.pathname.slice("/rest/v1/".length)), "qualified-table-read");
    for (const [key, value] of parsed.searchParams) need(!["columns", "on_conflict"].includes(key)
      && value.length <= 8192, "read-query");
  } else {
    const r = c.legacy.rpcs.find(r => m.path === "/rest/v1/rpc/" + r.name);
    let args; try { args = JSON.parse(body.toString("utf8")); } catch { need(false, "readonly-json"); }
    // The original graph protocol has two exact forms: U.read with verified
    // history, and U.readControl/graph reuse with the additional knownGraph.
    // No arbitrary optional keys or caller-selected RPCs are admitted.
    const graphHistory = r?.name === "helmut_auth_state_graph_read_v1"
      && [...r.requestKeys].sort().join("|") === ["id", "knownProof", "readNonce", "knownGraph"].sort().join("|")
      && exact(args, ["id", "knownProof", "readNonce"]);
    need(r && (exact(args, r.requestKeys) || graphHistory) && args.id === "main-auth", "qualified-readonly-rpc");
    if (traceMeta && r.name === "helmut_auth_state_graph_read_v1" && exact(args, ["id", "knownProof", "readNonce", "knownGraph"])) {
      need(typeof args.readNonce === "string" && UUID.test(args.readNonce) && Buffer.from(body.toString("utf8")).equals(body)
        && JSON.stringify(args) === body.toString("utf8"), "trace-control-request");
      traceMeta.candidate = "control-graph-4"; traceMeta.readNonceSHA256 = sha(args.readNonce);
    }
  }
  return body;
}
function serialGate() {
  let active = false, stopped = false; const waiting = [];
  function grant(resolve) {
    active = true; let released = false;
    resolve(() => {
      need(!released, "queue-release-once"); released = true;
      const next = waiting.shift(); if (next) grant(next.resolve); else active = false;
    });
  }
  return Object.freeze({ acquire: () => new Promise((resolve, reject) => {
    if (stopped || waiting.length >= 32) { reject(Error("local-unit-broker-bounded-queue")); return; }
    if (active) waiting.push({ resolve, reject }); else grant(resolve);
  }), close: () => { stopped = true; for (const item of waiting.splice(0)) item.reject(Error("local-unit-broker-queue-closed")); } });
}
async function upstream(c, m, bytes, token, remainingMs = 28000) {
  need(Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 28000, "upstream-total-deadline");
  return new Promise((resolve, reject) => {
    let req, res, done = false, requestFinish = false, size = 0; const blocks = [];
    const timer = setTimeout(() => finish(null, "upstream-deadline-unknown"), remainingMs);
    function finish(value, error) { if (done) return; done = true; clearTimeout(timer); if (error) { req?.destroy(); res?.destroy(); reject(Error(error)); } else resolve(value); }
    req = http.request({ hostname: "127.0.0.1", port: c.upstream.port, path: m.path.replace(/^\/rest\/v1/, ""),
      method: m.method, agent: false, headers: { "Content-Type": "application/json", "Content-Length": bytes.length, Authorization: "Bearer " + token } }, incoming => {
      res = incoming;
      incoming.on("data", b => { size += b.length; if (size > CAP) finish(null, "upstream-cap-unknown"); else blocks.push(b); });
      incoming.once("error", () => finish(null, "upstream-error-unknown"));
      incoming.once("aborted", () => finish(null, "upstream-aborted-unknown"));
      incoming.once("end", () => {
        if (!requestFinish || incoming.complete !== true) return finish(null, "upstream-incomplete-unknown");
        finish({ status: incoming.statusCode, bytes: Buffer.concat(blocks), traceIO: { upstreamRequestFinish: true,
          upstreamResponseEnd: true, upstreamMessageComplete: true, ownerSocketEnd: null, ownerSocketClose: null } });
      });
    });
    req.once("finish", () => { requestFinish = true; });
    req.once("error", () => finish(null, "upstream-request-unknown")); req.end(bytes);
  });
}
function originalResponse(frame, key, nonce) {
  need(Buffer.from(frame.toString("utf8")).equals(frame), "original-response-utf8");
  let r; try { r = JSON.parse(frame.toString("utf8")); } catch { need(false, "original-response-json"); }
  need(exact(r, ["schema", "nonce", "status", "bodyBase64", "hmacSHA256"])
    && JSON.stringify(r) === frame.toString("utf8") && r.schema === "helmut-local-original-owner-response/1"
    && r.nonce === nonce && [200, 500].includes(r.status) && typeof r.bodyBase64 === "string"
    && /^[a-f0-9]{64}$/.test(r.hmacSHA256), "original-response-bindings");
  const unsigned = { schema: r.schema, nonce: r.nonce, status: r.status, bodyBase64: r.bodyBase64 };
  const mac = crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest();
  need(crypto.timingSafeEqual(mac, Buffer.from(r.hmacSHA256, "hex")), "original-response-hmac");
  const bytes = Buffer.from(r.bodyBase64, "base64");
  need(bytes.length <= CAP && bytes.toString("base64") === r.bodyBase64 && r.status === 200, "original-write-unconfirmed");
  return { status: r.status, bytes };
}
async function originalUpstream(m, bytes, key, remainingMs) {
  need(Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 28000, "original-total-deadline");
  const until = process.hrtime.bigint() + BigInt(Math.floor(remainingMs * 1000000));
  const unsigned = { version: "helmut-local-original-owner-request/1", nonce: m.nonce,
    atUTC: new Date().toISOString(), bodyBase64: bytes.toString("base64") };
  const payload = Buffer.from(JSON.stringify({ ...unsigned,
    hmacSHA256: crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest("hex") }) + "\n");
  const left = Number(until - process.hrtime.bigint()) / 1000000;
  need(left > 0, "original-preparation-deadline");
  return new Promise((resolve, reject) => {
    let socket, done = false, eof = false, size = 0; const blocks = [];
    const timer = setTimeout(() => finish(null, "original-outcome-unknown"), left);
    function finish(value, code) {
      if (done) return; done = true; clearTimeout(timer);
      if (code) { socket?.destroy(); reject(Error("local-unit-broker-" + code)); } else resolve(value);
    }
    try {
      socket = net.createConnection({ path: ORIGINAL_SOCKET });
      // Keep our writable half open until the service ends its response. Its
      // async psql work must not be cancelled by net's default half-close rule.
      socket.once("connect", () => {
        if (done) return;
        if (process.hrtime.bigint() >= until) { finish(null, "original-before-write-deadline"); return; }
        try { socket.write(payload); } catch { finish(null, "original-transport-unknown"); }
      });
      socket.on("data", b => { size += b.length; if (size > CAP * 4 / 3 + 65536) finish(null, "original-response-cap-unknown"); else blocks.push(b); });
      socket.once("end", () => { eof = true; });
      socket.once("error", () => finish(null, "original-transport-unknown"));
      socket.once("close", hadError => {
        if (done) return;
        try {
          const frame = Buffer.concat(blocks);
          need(eof && !hadError && frame.at(-1) === 10 && frame.indexOf(10) === frame.length - 1, "original-response-eof");
          const value = originalResponse(frame.subarray(0, -1), key, m.nonce);
          need(process.hrtime.bigint() < until, "original-response-deadline"); finish({ ...value, traceIO: {
            upstreamRequestFinish: null, upstreamResponseEnd: null, upstreamMessageComplete: null, ownerSocketEnd: true, ownerSocketClose: true } });
        } catch { finish(null, "original-response-unconfirmed"); }
      });
    } catch { finish(null, "original-transport-unknown"); }
  });
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function monotonicClockDomain() {
  need(arguments.length === 0, "trace-clock-no-arguments");
  let namespace = null, kind = "time-namespace";
  try {
    namespace = fs.readlinkSync("/proc/self/ns/time");
  } catch (error) {
    // This kernel can lack CONFIG_TIME_NS entirely. Only actual ENOENT at the
    // fixed proc path establishes that case; permission/I/O errors prove none.
    need(error?.code === "ENOENT", "trace-time-namespace-read");
    kind = "kernel-without-time-namespaces";
  }
  need(kind === "kernel-without-time-namespaces" ? namespace === null
    : typeof namespace === "string" && namespace.endsWith("]") && /^time:\[[1-9][0-9]*\]$/.test(namespace), "trace-time-namespace");
  let raw;
  try { raw = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8"); }
  catch { need(false, "trace-boot-id-read"); }
  need(typeof raw === "string", "trace-boot-id");
  const bootId = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  need(bootId.length === 36 && UUID.test(bootId) && (raw === bootId || raw === bootId + "\n"), "trace-boot-id");
  return Object.freeze({ schema: "helmut-local-unit-monotonic-domain/1", kind, namespace, bootId });
}
function controlReadTrace(c, self, codePin, trustPin, unknown) {
  rootParents(TRACE);
  const clockDomain = monotonicClockDomain(), timeNamespace = clockDomain.namespace;
  const fd = fs.openSync(TRACE, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  let bytes = 0, records = 0, controls = 0, acks = 0, reads = 0, broken = false, publicationFailed = false, sealed = false, prior = null, finalPin = null;
  const pending = new Set(), digest = crypto.createHash("sha256");
  const mark = () => { broken = true; unknown(); };
  const stamp = () => ({ utc: new Date().toISOString(), ns: process.hrtime.bigint().toString() });
  function identity() {
    const a = fs.fstatSync(fd, { bigint: true }), b = fs.lstatSync(TRACE, { bigint: true });
    need(a.isFile() && a.uid === 0n && a.gid === 0n && a.nlink === 1n && (a.mode & 0o7777n) === 0o600n
      && a.size === BigInt(bytes) && fs.realpathSync(TRACE) === TRACE && isDeepStrictEqual(statIdentity(a), statIdentity(b)), "trace-file-identity"); return statIdentity(a);
  }
  function append(value) {
    try {
      need(!sealed && !publicationFailed, "trace-sealed"); const before = identity(); need(!prior || isDeepStrictEqual(before, prior), "trace-file-drift");
      const raw = Buffer.from(JSON.stringify(value) + "\n"); need(raw.length <= 4096 && bytes + raw.length <= TRACE_CAP, "trace-cap");
      let offset = 0; while (offset < raw.length) { const n = fs.writeSync(fd, raw, offset, raw.length - offset, null); need(n > 0, "trace-short-write"); offset += n; }
      bytes += raw.length; fs.fsyncSync(fd); prior = identity(); need(before.slice(0, 6).join() === prior.slice(0, 6).join(), "trace-write-identity"); digest.update(raw);
    } catch (error) { publicationFailed = true; mark(); throw error; }
  }
  try { append({ schema: "helmut-local-unit-native-control-read-trace/1", header: { operationId: c.operationId, commandHash: c.commandHash,
    database: c.database, ownerPID: self.pid, ownerStartTicks: self.startTicks, pidNamespace: self.pidNamespace, timeNamespace, clockDomain,
    brokerCodeSHA256: codePin.sha256, trustSHA256: trustPin.sha256, sourceBindingSHA256: sha(canonical(c.originalService.publicSourceBinding)) } }); }
  catch (error) { fs.closeSync(fd); throw error; }
  function settle(t) {
    if (t.settled || !t.handlerDone || !t.finished && !t.closed) return; t.settled = true;
    pending.delete(t);
    if (t.failed || broken || !t.finished) { mark(); t.reject(Error("local-unit-broker-trace-outcome-unknown")); return; }
    try {
      if (t.record) {
        need(records < 32 && t.finishedAt, "trace-record-cap-or-finish"); const at = t.finishedAt;
        append({ seq: records + 1, ...t.record, timing: { ...t.record.timing, finishUTC: at.utc, finishNs: at.ns },
          io: { ...t.record.io, downstreamFinish: true } }); records++;
        if (t.record.kind === "control-graph-4") controls++; else if (t.record.kind === "final-own-ack") acks++; else reads++;
      }
      t.resolve();
    } catch (error) { mark(); t.reject(error); }
  }
  return Object.freeze({ unknown: mark,
    begin(meta, m, body, res, req) {
      if (!meta.candidate) return null;
      need(!broken && !sealed && pending.size < 32 && req.complete === true, "trace-request-complete");
      const t = { candidate: meta.candidate, control: meta.readNonceSHA256 ? { readNonceSHA256: meta.readNonceSHA256 } : null,
        requestNonceSHA256: sha(m.nonce), requestBodySHA256: sha(body), handlerDone: false, finished: false, closed: false, failed: false, record: null };
      t.promise = new Promise((resolve, reject) => { t.resolve = resolve; t.reject = reject; }); t.promise.catch(() => {}); pending.add(t);
      res.once("finish", () => { t.finishedAt = stamp(); t.finished = res.writableFinished === true; if (!t.finished) { t.failed = true; mark(); } settle(t); });
      res.once("close", () => { t.closed = true; if (!t.finished) { t.failed = true; mark(); } settle(t); }); return t;
    },
    sent(t) { if (t) t.sent = stamp(); },
    ended(t) { if (t) t.ended = stamp(); },
    signed(t, answer, attestation, envelope, output) {
      if (!t) return; need(answer.status === 200 && t.sent && t.ended && answer.traceIO, "trace-upstream-success");
      let kind = t.candidate, ownAck = null, readback = null;
      if (kind !== "control-graph-4") {
        need(answer.bytes.length <= 9 * 1024 * 1024, "trace-response-cap"); const value = JSON.parse(answer.bytes.toString("utf8"));
        if (kind === "state-write") {
          const w = value?.ownAck;
          if (!Object.hasOwn(w || {}, "controlCount")) { t.ignored = true; return; }
          need(exact(value, ["schema", "authAck", "ownAck"]) && value.schema === "helmut-local-unit-original-write-result/1"
            && Array.isArray(value.authAck) && value.authAck.length === 1
            && exact(w, ["version", "scopeHash", "hash", "revision", "claimHash", "nonce", "authorizationHash", "controlsHash", "controlCount"])
            && w.version === "helmut-local-unit-diagnostic-state-ack/1" && w.scopeHash === c.commandHash
            && [w.hash, w.claimHash, w.nonce, w.authorizationHash, w.controlsHash].every(x => typeof x === "string" && HASH.test(x))
            && Number.isSafeInteger(w.revision) && w.revision > 0 && w.controlCount === 16, "trace-final-ack");
          ownAck = { version: w.version, scopeHash: w.scopeHash, hash: w.hash, revision: w.revision, claimHash: w.claimHash,
            nonceSHA256: sha(w.nonce), authorizationHash: w.authorizationHash, controlsHash: w.controlsHash, controlCount: w.controlCount }; kind = "final-own-ack";
        } else {
          const w = value; need(exact(w, ["version", "scopeHash", "canonical", "hash", "revision", "nonce"])
            && w.version === "helmut-local-unit-diagnostic-state-witness/1" && w.scopeHash === c.commandHash
            && [w.hash, w.nonce].every(x => typeof x === "string" && HASH.test(x))
            && Number.isSafeInteger(w.revision) && w.revision >= 0 && typeof w.canonical === "string"
            && Buffer.byteLength(w.canonical) <= 4 * 1024 * 1024 && sha(w.canonical) === w.hash, "trace-state-witness");
          const state = JSON.parse(w.canonical), k = "localUnitDiagnostic:" + c.operationId.slice(-32) + ":", j = state[k + "journal"], r = state[k + "result"];
          if (j?.state !== "closed") { t.ignored = true; return; }
          const v = j.verification;
          need(typeof j.claimId === "string" && UUID.test(j.claimId) && j.index === 1 && j.inFlight === null && r?.state === "retained-unreviewed"
            && exact(v, ["authorizationHash", "controlsHash", "controlCount"])
            && [r.evidenceHash, v.authorizationHash, v.controlsHash].every(x => typeof x === "string" && HASH.test(x))
            && v.controlCount === 16, "trace-closed-state");
          readback = { version: w.version, scopeHash: w.scopeHash, hash: w.hash, revision: w.revision, nonceSHA256: sha(w.nonce),
            claimIdSHA256: sha(j.claimId), journalState: j.state, journalIndex: j.index, journalInFlightNull: true,
            resultState: r.state, evidenceHash: r.evidenceHash, authorizationHash: v.authorizationHash, controlsHash: v.controlsHash, controlCount: v.controlCount }; kind = "closed-state-readback";
        }
      }
      const at = stamp(); t.record = { kind, requestNonceSHA256: t.requestNonceSHA256, requestBodySHA256: t.requestBodySHA256,
        responseBodySHA256: sha(answer.bytes), attestationSHA256: sha(JSON.stringify(attestation)), envelopeSHA256: sha(output),
        signatureSHA256: sha(Buffer.from(envelope.signatureBase64, "base64")), status: answer.status,
        timing: { sendUTC: t.sent.utc, sendNs: t.sent.ns, upstreamEndUTC: t.ended.utc, upstreamEndNs: t.ended.ns, signedUTC: at.utc, signedNs: at.ns },
        io: answer.traceIO, control: t.control, ownAck, readback };
    },
    finish(t) { if (!t) return Promise.resolve(); t.handlerDone = true; need(t.record || t.ignored, "trace-signed-response-required"); settle(t); return t.promise; },
    abort(t) { mark(); if (t) { t.failed = true; t.handlerDone = true; settle(t); } },
    seal() {
      try {
        need(!sealed && pending.size === 0, "trace-pending-at-close"); append({ event: "closed", recordCount: records, controlCount: controls,
          finalAckCount: acks, closedReadbackCount: reads, complete: !broken });
        const pin = { path: TRACE, bytes, sha256: digest.copy().digest("hex") };
        readRegular(TRACE, TRACE_CAP, { rootPrivate: true, expected: pin, contents: false }); finalPin = Object.freeze({ ...pin, complete: !broken });
        need(!broken, "trace-closed-unknown");
      } finally { sealed = true; fs.closeSync(fd); }
    },
    pin() { need(sealed && finalPin, "trace-not-sealed"); return finalPin; }
  });
}
async function start(configuration) {
  const c = validateConfig(structuredClone(configuration));
  nodeBudget({ nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384, semiSpaceMiB: 16,
    heapSizeLimitBytes: v8.getHeapStatistics().heap_size_limit });
  process.umask(0o077);
  const self = processInfo(process.pid), code = readRegular(__filename, 1024 * 1024), owner = readRegular(c.ownerQualificationPin.path, 1024 * 1024, { rootPrivate: true, expected: c.ownerQualificationPin });
  const qualification = JSON.parse(owner.bytes.toString("utf8"));
  need(exact(qualification, ["schema", "operationId", "commandHash", "database", "brokerCodeSHA256", "upstream", "measuredCgroup", "legacy", "originalService"])
    && qualification.schema === "helmut-local-unit-diagnostic-owner-qualification/2"
    && qualification.operationId === c.operationId && qualification.commandHash === c.commandHash && qualification.database === c.database
    && qualification.brokerCodeSHA256 === code.pin.sha256
    && isDeepStrictEqual(qualification.upstream, c.upstream) && isDeepStrictEqual(qualification.measuredCgroup, c.measuredCgroup)
    && isDeepStrictEqual(qualification.legacy, c.legacy)
    && isDeepStrictEqual(qualification.originalService, c.originalService), "actual-root-qualification");
  const originalKey = readRegular(c.originalService.hmacKeyPath, 32, { rootPrivate: true });
  need(originalKey.bytes.length === 32 && originalKey.pin.sha256 === c.originalService.publicSourceBinding.hmacKeySHA256, "original-key-binding");
  const sourceRecord = readRegular(c.originalService.sourceQualificationPin.path, 1048576,
    { rootPrivate: true, expected: c.originalService.sourceQualificationPin });
  const sourceExpires = sourceQualification(c, JSON.parse(sourceRecord.bytes.toString("utf8")), Date.now(), true);
  const sourceEnd = process.hrtime.bigint() + BigInt(Math.max(0, sourceExpires - Date.now())) * 1000000n;
  const originalSocket = () => {
    need(fs.realpathSync(ORIGINAL_SOCKET) === ORIGINAL_SOCKET, "original-socket-path");
    const s = fs.lstatSync(ORIGINAL_SOCKET, { bigint: true });
    need(s.isSocket() && s.uid === 1000n && s.nlink === 1n && (s.mode & 0o777n) === 0o666n, "original-source-socket");
    return statIdentity(s);
  };
  const socketIdentity = originalSocket();
  const tokenRead = readRegular(c.upstream.runtimeTokenPath, 65536, { rootPrivate: true });
  const token = tokenRead.bytes.toString("utf8").trim(); need(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), "runtime-token");
  const claim = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  need(claim.role === "helmut_ud_runtime_" + c.operationId.slice(-32), "runtime-token-role");
  const initialUpstream = processInfo(c.upstream.pid); let signingKeyRecord = null;
  need(initialUpstream.parentPID === self.pid && initialUpstream.pidNamespace === self.pidNamespace, "actual-root-upstream-parent-namespace");
  const checkExecutable = executableContinuity(c.upstream.pid, c.upstream.exePin);
  const check = () => {
    const a = processInfo(process.pid), p = processInfo(c.upstream.pid);
    need(isDeepStrictEqual(a, self) && isDeepStrictEqual(p, initialUpstream) && a.membership === c.measuredCgroup.procMembership.broker
      && p.startTicks === c.upstream.startTicks && p.exe === c.upstream.exePin.path
      && p.membership === c.measuredCgroup.procMembership.upstream, "actual-process-binding");
    const ownedSockets = new Set(fs.readdirSync(`/proc/${p.pid}/fd`).flatMap(name => {
      try { const match = /^socket:\[([0-9]+)\]$/.exec(fs.readlinkSync(`/proc/${p.pid}/fd/${name}`)); return match ? [match[1]] : []; }
      catch { return []; }
    }));
    const listeners = fs.readFileSync("/proc/net/tcp", "utf8").trim().split("\n").slice(1)
      .map(line => line.trim().split(/\s+/)).filter(f => f[3] === "0A" && parseInt(f[1].split(":")[1], 16) === c.upstream.port);
    need(listeners.length === 1 && listeners[0][1].split(":")[0] === "0100007F" && ownedSockets.has(listeners[0][9]), "actual-upstream-listener");
    const group = fs.lstatSync(c.measuredCgroup.path);
    need(group.isDirectory() && !group.isSymbolicLink() && group.dev === c.measuredCgroup.device && group.ino === c.measuredCgroup.inode
      && fs.statfsSync(c.measuredCgroup.path).type === 0x63677270, "actual-cgroup-binding");
    checkExecutable();
    readRegular(c.upstream.configPin.path, 1024 * 1024, { expected: c.upstream.configPin });
    need(isDeepStrictEqual(readRegular(__filename, 1024 * 1024).identity, code.identity), "broker-code-drift");
    need(isDeepStrictEqual(readRegular(c.upstream.runtimeTokenPath, 65536, { rootPrivate: true }).identity, tokenRead.identity), "runtime-token-drift");
    // SourceSupervisor owns UID1000 process observation. Root has no ptrace/DAC
    // capability and must not pretend it can inspect that service's /proc/exe.
    need(isDeepStrictEqual(readRegular(c.ownerQualificationPin.path, 1048576, { rootPrivate: true, expected: c.ownerQualificationPin }).identity, owner.identity)
      && isDeepStrictEqual(readRegular(c.originalService.hmacKeyPath, 32, { rootPrivate: true }).identity, originalKey.identity)
      && isDeepStrictEqual(originalSocket(), socketIdentity), "original-private-or-socket-drift");
    const q = readRegular(c.originalService.sourceQualificationPin.path, 1048576,
      { rootPrivate: true, expected: c.originalService.sourceQualificationPin });
    need(isDeepStrictEqual(q.identity, sourceRecord.identity) && process.hrtime.bigint() < sourceEnd, "source-qualification-drift-or-deadline");
    sourceQualification(c, JSON.parse(q.bytes.toString("utf8")));
    for (const r of c.legacy.rpcs) {
      const q = JSON.parse(readRegular(r.qualificationPin.path, 1024 * 1024, { rootPrivate: true, expected: r.qualificationPin }).bytes.toString("utf8"));
      need(q.schema === "helmut-local-unit-diagnostic-read-rpc-qualification/1" && q.database === c.database
        && q.name === r.name && q.oid === r.oid && q.identityArguments === r.identityArguments
        && q.prosrcSHA256 === r.prosrcSHA256 && q.readOnly === true && q.sourceReviewAccepted === true, "readonly-semantic-qualification");
    }
    if (signingKeyRecord) need(isDeepStrictEqual(readRegular(PRIVATE + "/signing-key.pem", 65536,
      { rootPrivate: true, expected: signingKeyRecord.pin, contents: false }).identity, signingKeyRecord.identity), "root-signing-key-drift");
    return { broker: a, upstream: p };
  };
  check();
  for (const [dir, mode] of [[ROOT, 0o755], [PRIVATE, 0o700]]) {
    rootParents(dir); need(!fs.existsSync(dir), "new-root-directory-required"); fs.mkdirSync(dir, { mode }); fs.chmodSync(dir, mode);
  }
  const keys = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(PRIVATE + "/signing-key.pem", keys.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
  signingKeyRecord = readRegular(PRIVATE + "/signing-key.pem", 65536, { rootPrivate: true, contents: false });
  const broker = { uid: 0, pid: process.pid, startTicks: self.startTicks, codeSHA256: code.pin.sha256 };
  const actualUpstream = { pid: c.upstream.pid, startTicks: c.upstream.startTicks, exePin: c.upstream.exePin, configPin: c.upstream.configPin };
  const anchor = { schema: "helmut-local-unit-diagnostic-root-anchor/2", operationId: c.operationId, commandHash: c.commandHash,
    database: c.database, publicKeyPEM: keys.publicKey.export({ type: "spki", format: "pem" }), broker, upstream: actualUpstream,
    measuredCgroup: c.measuredCgroup, legacy: c.legacy, ownerQualificationPin: c.ownerQualificationPin,
    originalService: c.originalService.publicSourceBinding };
  const used = new Set(), gate = serialGate(); let closed = false, trace = null, closePromise = null;
  const server = http.createServer(async (req, res) => {
    if (closed || req.method !== "POST" || req.url !== "/v1/execute") { res.writeHead(409).end(); return; }
    let size = 0, done = false, release, traceAttempt = null, phaseTiming = null, phaseKind = "native"; const blocks = [];
    const began = process.hrtime.bigint();
    const remaining = () => 28000 - Number(process.hrtime.bigint() - began) / 1000000;
    const timer = setTimeout(() => req.destroy(), 30000);
    try {
      release = await gate.acquire(); need(!closed && remaining() > 0, "queued-deadline-or-close");
      for await (const b of req) { size += b.length; need(size <= CAP * 4 / 3 + 65536, "incoming-cap"); blocks.push(b); }
      const m = JSON.parse(Buffer.concat(blocks).toString("utf8")), traceMeta = {}, bytes = authorize(c, m, traceMeta);
      need(used.size < 4096 && !used.has(m.nonce), "nonce-reuse-or-cap"); used.add(m.nonce);
      need(trace, "private-trace-required"); traceAttempt = trace.begin(traceMeta, m, bytes, res, req);
      phaseKind = m.path === ORIGINAL_WRITE ? "original" : /^\/rest\/v1\/rpc\/local_unit_diagnostic_/.test(m.path) ? "native" : "legacy";
      phaseTiming = beginPhaseTiming(m.nonce, began); markPhaseTiming(phaseTiming, 1);
      check();
      markPhaseTiming(phaseTiming, 2);
      if (!/^\/rest\/v1\/rpc\/local_unit_diagnostic_/.test(m.path)) {
        markPhaseTiming(phaseTiming, 3);
        const contract = await upstream(c, { method: "POST", path: "/rest/v1/rpc/local_unit_diagnostic_contract_v1" }, Buffer.from("{}"), token, remaining());
        markPhaseTiming(phaseTiming, 4);
        need(contract.status === 200, "actual-read-contract");
        const catalog = JSON.parse(contract.bytes.toString("utf8"));
        const expected = c.legacy.rpcs.map(r => ({ name: r.name, oid: r.oid, identityArguments: r.identityArguments,
          prosrcSHA256: r.prosrcSHA256, qualificationPin: r.qualificationPin })).sort((a, b) => a.name.localeCompare(b.name));
        need(catalog.database === c.database && catalog.version === "helmut-local-unit-diagnostic-native-store/1"
          && isDeepStrictEqual(catalog.legacyReadRPCs, expected), "actual-qualified-read-catalog");
      }
      const isOriginal = m.path === ORIGINAL_WRITE;
      trace.sent(traceAttempt);
      markPhaseTiming(phaseTiming, 5);
      const answer = isOriginal ? await originalUpstream(m, bytes, originalKey.bytes, remaining())
        : await upstream(c, m, bytes, token, remaining());
      markPhaseTiming(phaseTiming, 6);
      trace.ended(traceAttempt);
      check(); need(remaining() > 0, "total-deadline");
      markPhaseTiming(phaseTiming, 7);
      const attestation = { schema: "helmut-local-unit-diagnostic-signed-response/2", operationId: c.operationId,
        commandHash: c.commandHash, database: c.database, nonce: m.nonce, method: m.method, path: m.path,
        requestSHA256: sha(bytes), bodySHA256: sha(answer.bytes), status: answer.status,
        observedAtUTC: new Date().toISOString(), broker, backendKind: isOriginal ? "owner-psql" : "postgrest",
        upstream: isOriginal ? c.originalService.publicSourceBinding : actualUpstream, measuredCgroup: c.measuredCgroup };
      const result = { attestation, bodyBase64: answer.bytes.toString("base64"),
        signatureBase64: crypto.sign(null, Buffer.from(JSON.stringify(attestation)), keys.privateKey).toString("base64") };
      const output = Buffer.from(JSON.stringify(result)); trace.signed(traceAttempt, answer, attestation, result, output);
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": output.length }); res.end(output);
      await trace.finish(traceAttempt); done = true;
    } catch { trace?.abort(traceAttempt); if (!res.headersSent) res.writeHead(502); res.end(); }
    finally { clearTimeout(timer); if (!done) { closed = true; gate.close(); } release?.(); finishPhaseTiming(phaseTiming, phaseKind, done ? "settled" : "failed"); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 16;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(ROOT + "/broker.sock", resolve); });
  try {
  fs.chmodSync(ROOT + "/broker.sock", 0o666);
  fs.writeFileSync(ROOT + "/trust.json", JSON.stringify(anchor) + "\n", { flag: "wx", mode: 0o444 });
  fs.chmodSync(ROOT + "/trust.json", 0o444);
  const trustRecord = readRegular(ROOT + "/trust.json", 65536, { contents: false });
  const brokerSocketIdentity = statIdentity(fs.lstatSync(ROOT + "/broker.sock", { bigint: true }));
  trace = controlReadTrace(c, self, code.pin, trustRecord.pin, () => { closed = true; gate.close(); });
  function observe() {
    try {
      need(arguments.length === 0 && !closed && server.listening && server.address() === ROOT + "/broker.sock", "live-broker-listener-required");
      const actual = check();
      need(isDeepStrictEqual(readRegular(ROOT + "/trust.json", 65536, { expected: trustRecord.pin, contents: false }).identity, trustRecord.identity)
        && isDeepStrictEqual(statIdentity(fs.lstatSync(ROOT + "/broker.sock", { bigint: true })), brokerSocketIdentity), "live-root-trust-drift");
      const value = Object.freeze({ schema: "helmut-local-unit-diagnostic-broker-observation/1", observedAtUTC: new Date().toISOString(),
        ...actual, measuredCgroup: Object.freeze({ path: c.measuredCgroup.path, device: c.measuredCgroup.device, inode: c.measuredCgroup.inode }),
        brokerCodeSHA256: code.pin.sha256, upstreamExeSHA256: c.upstream.exePin.sha256,
        upstreamConfigSHA256: c.upstream.configPin.sha256, listenerObserved: true, unitExecutionQualified: false });
      need(Buffer.byteLength(JSON.stringify(value)) <= 2048, "private-observation-cap"); return value;
    } catch (error) { trace?.unknown(); closed = true; gate.close(); throw error; }
  }
  observe();
  return Object.freeze({ anchor, observe, controlReadTracePin: () => trace.pin(), close() {
    if (closePromise) return closePromise; closed = true; gate.close();
    closePromise = new Promise((resolve, reject) => server.close(error => {
      try { need(!error, "broker-server-close"); trace.seal(); resolve(); } catch (failure) { reject(failure); }
    })); return closePromise;
  } });
  } catch (error) {
    closed = true; gate.close(); trace?.unknown(); if (server.listening) await new Promise(resolve => server.close(() => resolve()));
    try { trace?.seal(); } catch { /* failed preparation never becomes a complete trace */ } throw error;
  }
}
module.exports = Object.freeze({ start });
if (require.main === module) {
  (async () => {
    need(process.argv.length === 4 && process.argv[2] === "--config", "cli-arguments");
    const c = JSON.parse(readRegular(process.argv[3], 1024 * 1024, { rootPrivate: true }).bytes.toString("utf8"));
    const running = await start(c);
    for (const sig of ["SIGTERM", "SIGINT"]) process.once(sig, () => running.close().then(() => process.exit(0), () => process.exit(1)));
  })().catch(() => { process.stderr.write("local-unit-broker-start-or-runtime-failed\n"); process.exitCode = 1; });
}
