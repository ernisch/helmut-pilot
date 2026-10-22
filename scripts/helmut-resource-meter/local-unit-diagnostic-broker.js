"use strict";

// Run only in the new root-owned measured owner container. This broker never
// accepts a URL, credential, SQL statement or alternate upstream from a client.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), http = require("node:http");
const { isDeepStrictEqual } = require("node:util");
const ROOT = "/run/helmut-local-unit-diagnostic", PRIVATE = "/run/helmut-local-unit-diagnostic-owner";
const CAP = 36 * 1024 * 1024, sha = b => crypto.createHash("sha256").update(b).digest("hex");
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const RPC = Object.freeze({ contract: [], authority_read: ["p_scope_hash", "p_nonce"], runtime_read: ["p_scope_hash", "p_nonce"],
  state_read: ["p_scope_hash", "p_nonce"], state_cas: ["p_scope_hash", "p_claim_hash", "p_old_hash", "p_old_revision", "p_next_canonical", "p_next_hash", "p_nonce"],
  artifact_insert: ["p_scope_hash", "p_claim_hash", "p_kind", "p_logical_id", "p_canonical", "p_sha256", "p_parent_hash", "p_nonce"],
  artifact_read: ["p_scope_hash", "p_kind", "p_logical_id", "p_expected_sha256", "p_nonce"],
  lease_acquire: ["p_scope_hash", "p_claim_hash", "p_job", "p_ttl_ms", "p_nonce"],
  lease_release: ["p_scope_hash", "p_claim_hash", "p_job", "p_token", "p_nonce"] });
function need(ok, code) { if (!ok) throw Error("local-unit-broker-" + code); }
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
function processInfo(pid) {
  need(Number.isSafeInteger(pid) && pid > 0, "pid");
  const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(!["Z", "X"].includes(fields[0]) && /^[0-9]+$/.test(fields[19]), "live-process");
  return { pid, startTicks: fields[19], exe: fs.readlinkSync(`/proc/${pid}/exe`), membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8") };
}
function validateConfig(c) {
  need(process.getuid() === 0 && !process.env.VERCEL, "root-owned-only");
  need(exact(c, ["schema", "operationId", "commandHash", "database", "upstream", "measuredCgroup", "legacy", "ownerQualificationPin"])
    && c.schema === "helmut-local-unit-diagnostic-broker-config/1" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(c.operationId)
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
  return c;
}
function authorize(c, m) {
  need(exact(m, ["operationId", "commandHash", "database", "nonce", "method", "path", "bodyBase64"])
    && m.operationId === c.operationId && m.commandHash === c.commandHash && m.database === c.database
    && /^[a-f0-9]{64}$/.test(m.nonce) && ["GET", "POST"].includes(m.method)
    && typeof m.path === "string" && m.path.length <= 16384 && !/[\0\r\n#\\]/.test(m.path)
    && typeof m.bodyBase64 === "string", "request-scope");
  const body = Buffer.from(m.bodyBase64, "base64"); need(body.length <= CAP && body.toString("base64") === m.bodyBase64, "request-bytes");
  const parsed = new URL(m.path, "http://127.0.0.1");
  need(m.path.startsWith("/rest/v1/") && parsed.origin === "http://127.0.0.1"
    && parsed.pathname === m.path.split("?")[0] && !parsed.pathname.includes("%"), "request-path");
  const native = /^\/rest\/v1\/rpc\/local_unit_diagnostic_([a-z_]+)_v1$/.exec(m.path);
  if (native) {
    let args; try { args = JSON.parse(body.toString("utf8")); } catch { need(false, "native-json"); }
    need(m.method === "POST" && Object.hasOwn(RPC, native[1]) && exact(args, RPC[native[1]])
      && (!RPC[native[1]].includes("p_scope_hash") || args.p_scope_hash === c.commandHash)
      && (!RPC[native[1]].includes("p_nonce") || /^[a-f0-9]{64}$/.test(args.p_nonce)), "native-abi");
  } else if (m.method === "GET") {
    need(body.length === 0 && /^\/rest\/v1\/[a-z][a-z0-9_]*(?:\?|$)/.test(m.path)
      && c.legacy.tables.includes(parsed.pathname.slice("/rest/v1/".length)), "qualified-table-read");
    for (const [key, value] of parsed.searchParams) need(!["columns", "on_conflict"].includes(key)
      && value.length <= 8192, "read-query");
  } else {
    const r = c.legacy.rpcs.find(r => m.path === "/rest/v1/rpc/" + r.name);
    let args; try { args = JSON.parse(body.toString("utf8")); } catch { need(false, "readonly-json"); }
    need(r && exact(args, r.requestKeys), "qualified-readonly-rpc");
  }
  return body;
}
async function upstream(c, m, bytes, token, remainingMs = 28000) {
  need(Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 28000, "upstream-total-deadline");
  return new Promise((resolve, reject) => {
    let req, res, done = false, size = 0; const blocks = [];
    const timer = setTimeout(() => finish(null, "upstream-deadline-unknown"), remainingMs);
    function finish(value, error) { if (done) return; done = true; clearTimeout(timer); if (error) { req?.destroy(); res?.destroy(); reject(Error(error)); } else resolve(value); }
    req = http.request({ hostname: "127.0.0.1", port: c.upstream.port, path: m.path.replace(/^\/rest\/v1/, ""),
      method: m.method, agent: false, headers: { "Content-Type": "application/json", "Content-Length": bytes.length, Authorization: "Bearer " + token } }, incoming => {
      res = incoming;
      incoming.on("data", b => { size += b.length; if (size > CAP) finish(null, "upstream-cap-unknown"); else blocks.push(b); });
      incoming.once("error", () => finish(null, "upstream-error-unknown"));
      incoming.once("aborted", () => finish(null, "upstream-aborted-unknown"));
      incoming.once("end", () => finish({ status: incoming.statusCode, bytes: Buffer.concat(blocks) }));
    });
    req.once("error", () => finish(null, "upstream-request-unknown")); req.end(bytes);
  });
}
async function start(configuration) {
  const c = validateConfig(structuredClone(configuration));
  process.umask(0o077);
  const self = processInfo(process.pid), code = readRegular(__filename, 1024 * 1024), owner = readRegular(c.ownerQualificationPin.path, 1024 * 1024, { rootPrivate: true, expected: c.ownerQualificationPin });
  const qualification = JSON.parse(owner.bytes.toString("utf8"));
  need(qualification.schema === "helmut-local-unit-diagnostic-owner-qualification/1"
    && qualification.operationId === c.operationId && qualification.commandHash === c.commandHash && qualification.database === c.database
    && qualification.brokerCodeSHA256 === code.pin.sha256
    && isDeepStrictEqual(qualification.upstream, c.upstream) && isDeepStrictEqual(qualification.measuredCgroup, c.measuredCgroup)
    && isDeepStrictEqual(qualification.legacy, c.legacy), "actual-root-qualification");
  const tokenRead = readRegular(c.upstream.runtimeTokenPath, 65536, { rootPrivate: true });
  const token = tokenRead.bytes.toString("utf8").trim(); need(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), "runtime-token");
  const claim = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  need(claim.role === "helmut_ud_runtime_" + c.operationId.slice(-32), "runtime-token-role");
  const check = () => {
    const a = processInfo(process.pid), p = processInfo(c.upstream.pid);
    need(a.startTicks === self.startTicks && a.exe === self.exe && a.membership === c.measuredCgroup.procMembership.broker
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
    readRegular(`/proc/${p.pid}/exe`, 256 * 1024 * 1024, { expected: c.upstream.exePin, procExe: true, contents: false });
    readRegular(c.upstream.configPin.path, 1024 * 1024, { expected: c.upstream.configPin });
    need(isDeepStrictEqual(readRegular(__filename, 1024 * 1024).identity, code.identity), "broker-code-drift");
    need(isDeepStrictEqual(readRegular(c.upstream.runtimeTokenPath, 65536, { rootPrivate: true }).identity, tokenRead.identity), "runtime-token-drift");
    for (const r of c.legacy.rpcs) {
      const q = JSON.parse(readRegular(r.qualificationPin.path, 1024 * 1024, { rootPrivate: true, expected: r.qualificationPin }).bytes.toString("utf8"));
      need(q.schema === "helmut-local-unit-diagnostic-read-rpc-qualification/1" && q.database === c.database
        && q.name === r.name && q.oid === r.oid && q.identityArguments === r.identityArguments
        && q.prosrcSHA256 === r.prosrcSHA256 && q.readOnly === true && q.sourceReviewAccepted === true, "readonly-semantic-qualification");
    }
    return true;
  };
  check();
  for (const [dir, mode] of [[ROOT, 0o755], [PRIVATE, 0o700]]) {
    rootParents(dir); need(!fs.existsSync(dir), "new-root-directory-required"); fs.mkdirSync(dir, { mode }); fs.chmodSync(dir, mode);
  }
  const keys = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(PRIVATE + "/signing-key.pem", keys.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
  const broker = { uid: 0, pid: process.pid, startTicks: self.startTicks, codeSHA256: code.pin.sha256 };
  const actualUpstream = { pid: c.upstream.pid, startTicks: c.upstream.startTicks, exePin: c.upstream.exePin, configPin: c.upstream.configPin };
  const anchor = { schema: "helmut-local-unit-diagnostic-root-anchor/1", operationId: c.operationId, commandHash: c.commandHash,
    database: c.database, publicKeyPEM: keys.publicKey.export({ type: "spki", format: "pem" }), broker, upstream: actualUpstream,
    measuredCgroup: c.measuredCgroup, legacy: c.legacy, ownerQualificationPin: c.ownerQualificationPin };
  const used = new Set(); let busy = false, closed = false;
  const server = http.createServer(async (req, res) => {
    if (closed || busy || req.method !== "POST" || req.url !== "/v1/execute") { res.writeHead(409).end(); return; }
    busy = true; let size = 0, done = false; const blocks = [];
    const began = process.hrtime.bigint();
    const remaining = () => 28000 - Number(process.hrtime.bigint() - began) / 1000000;
    const timer = setTimeout(() => req.destroy(), 30000);
    try {
      for await (const b of req) { size += b.length; need(size <= CAP * 4 / 3 + 65536, "incoming-cap"); blocks.push(b); }
      const m = JSON.parse(Buffer.concat(blocks).toString("utf8")), bytes = authorize(c, m);
      need(used.size < 4096 && !used.has(m.nonce), "nonce-reuse-or-cap"); used.add(m.nonce);
      check();
      if (!/^\/rest\/v1\/rpc\/local_unit_diagnostic_/.test(m.path)) {
        const contract = await upstream(c, { method: "POST", path: "/rest/v1/rpc/local_unit_diagnostic_contract_v1" }, Buffer.from("{}"), token, remaining());
        need(contract.status === 200, "actual-read-contract");
        const catalog = JSON.parse(contract.bytes.toString("utf8"));
        const expected = c.legacy.rpcs.map(r => ({ name: r.name, oid: r.oid, identityArguments: r.identityArguments,
          prosrcSHA256: r.prosrcSHA256, qualificationPin: r.qualificationPin })).sort((a, b) => a.name.localeCompare(b.name));
        need(catalog.database === c.database && catalog.version === "helmut-local-unit-diagnostic-native-store/1"
          && isDeepStrictEqual(catalog.legacyReadRPCs, expected), "actual-qualified-read-catalog");
      }
      const answer = await upstream(c, m, bytes, token, remaining()); check(); need(remaining() > 0, "total-deadline");
      const attestation = { schema: "helmut-local-unit-diagnostic-signed-response/1", operationId: c.operationId,
        commandHash: c.commandHash, database: c.database, nonce: m.nonce, method: m.method, path: m.path,
        requestSHA256: sha(bytes), bodySHA256: sha(answer.bytes), status: answer.status,
        observedAtUTC: new Date().toISOString(), broker, upstream: actualUpstream, measuredCgroup: c.measuredCgroup };
      const result = { attestation, bodyBase64: answer.bytes.toString("base64"),
        signatureBase64: crypto.sign(null, Buffer.from(JSON.stringify(attestation)), keys.privateKey).toString("base64") };
      const output = Buffer.from(JSON.stringify(result)); res.writeHead(200, { "Content-Type": "application/json", "Content-Length": output.length }); res.end(output); done = true;
    } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
    finally { clearTimeout(timer); busy = false; if (!done) closed = true; }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 16;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(ROOT + "/broker.sock", resolve); });
  fs.chmodSync(ROOT + "/broker.sock", 0o666);
  fs.writeFileSync(ROOT + "/trust.json", JSON.stringify(anchor) + "\n", { flag: "wx", mode: 0o444 });
  fs.chmodSync(ROOT + "/trust.json", 0o444);
  return Object.freeze({ anchor, close: () => new Promise((resolve, reject) => { closed = true; server.close(error => error ? reject(error) : resolve()); }) });
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
