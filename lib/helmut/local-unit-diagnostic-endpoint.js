"use strict";

// A root-owned, read-only mount is the trust root. A response-shaped object,
// caller URL, environment flag or caller public key cannot replace that mount.
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const { isDeepStrictEqual } = require("node:util");
const nativeRequest = http.request;
const DIRECTORY = "/run/helmut-local-unit-diagnostic";
const TRUST = DIRECTORY + "/trust.json", SOCKET = DIRECTORY + "/broker.sock";
const CAP = 36 * 1024 * 1024;
const ORIGINAL_WRITE = "/rest/v1/rpc/local_unit_diagnostic_original_write_v1";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...keys].sort().join("|");
function need(ok, code) { if (!ok) throw Error("local-unit-diagnostic-endpoint-" + code); }
function identity(s) { return [s.dev, s.ino, s.mode, s.uid, s.gid, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String); }
function paths() {
  const mounts = fs.readFileSync("/proc/self/mountinfo", "utf8").trim().split("\n");
  need(mounts.some(line => { const f = line.split(" "); return f[4] === DIRECTORY && f[5].split(",").includes("ro"); }), "readonly-trust-mount");
  const directories = ["/", "/run", DIRECTORY].map(p => {
    const s = fs.lstatSync(p, { bigint: true });
    need(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0n && (s.mode & 0o022n) === 0n, "root-directory");
    return [p, identity(s)];
  });
  const s = fs.lstatSync(SOCKET, { bigint: true });
  need(s.isSocket() && s.uid === 0n && (s.mode & 0o777n) === 0o666n, "root-socket");
  return [...directories, [SOCKET, identity(s)]];
}
function readTrust(selection, database) {
  need(typeof process.getuid === "function" && process.getuid() === 1000, "unprivileged-client-required");
  const beforePaths = paths(), named = fs.lstatSync(TRUST, { bigint: true });
  need(named.isFile() && named.uid === 0n && named.nlink === 1n
    && (named.mode & 0o777n) === 0o444n && named.size > 0n && named.size <= 65536n, "root-trust-file");
  const fd = fs.openSync(TRUST, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let raw;
  try {
    const a = fs.fstatSync(fd, { bigint: true }); need(isDeepStrictEqual(identity(named), identity(a)), "trust-open-identity");
    raw = fs.readFileSync(fd); need(raw.length === Number(a.size), "trust-size");
    need(isDeepStrictEqual(identity(a), identity(fs.fstatSync(fd, { bigint: true })))
      && isDeepStrictEqual(identity(a), identity(fs.lstatSync(TRUST, { bigint: true }))), "trust-read-drift");
  } finally { fs.closeSync(fd); }
  need(isDeepStrictEqual(beforePaths, paths()), "root-path-drift");
  let anchor; try { anchor = JSON.parse(raw.toString("utf8")); } catch { need(false, "trust-json"); }
  need(exact(anchor, ["schema", "operationId", "commandHash", "database", "publicKeyPEM", "broker", "upstream", "measuredCgroup", "legacy", "ownerQualificationPin", "originalService"])
    && anchor.schema === "helmut-local-unit-diagnostic-root-anchor/2"
    && anchor.operationId === selection.operationId && anchor.commandHash === selection.commandHash
    && anchor.database === database, "root-anchor-binding");
  let publicKey; try { publicKey = crypto.createPublicKey(anchor.publicKeyPEM); } catch { need(false, "public-key"); }
  need(publicKey.asymmetricKeyType === "ed25519" && anchor.broker?.uid === 0
    && Number.isSafeInteger(anchor.broker.pid) && anchor.broker.pid > 0
    && /^[0-9]+$/.test(anchor.broker.startTicks) && /^[a-f0-9]{64}$/.test(anchor.broker.codeSHA256)
    && Number.isSafeInteger(anchor.upstream?.pid) && anchor.upstream.pid > 0
    && /^[0-9]+$/.test(anchor.upstream.startTicks), "root-anchor-processes");
  const source = anchor.originalService;
  need(source?.schema === "helmut-local-unit-original-source-binding/1" && source.operationId === selection.operationId
    && source.commandHash === selection.commandHash && source.database === database
    && source.socketPath === "/ram/helmut-original-write-bridge.sock" && /^[a-f0-9]{64}$/.test(source.containerId)
    && /^pid:\[[1-9][0-9]*\]$/.test(source.pidNamespace) && /^[a-f0-9]{64}$/.test(source.hmacKeySHA256)
    && source.service?.uid === 1000 && source.supervisor?.uid === 1000
    && Number.isSafeInteger(source.service.pid) && source.service.pid > 0
    && /^[0-9]+$/.test(source.service.startTicks), "root-source-binding");
  return { anchor, publicKey, rawSHA256: sha(raw), paths: beforePaths, fileIdentity: identity(named) };
}
function verifyEnvelope(raw, trust, request, started) {
  let envelope; try { envelope = JSON.parse(raw.toString("utf8")); } catch { need(false, "response-json"); }
  need(exact(envelope, ["attestation", "bodyBase64", "signatureBase64"])
    && typeof envelope.bodyBase64 === "string" && typeof envelope.signatureBase64 === "string", "response-envelope");
  const a = envelope.attestation, body = Buffer.from(envelope.bodyBase64, "base64");
  need(body.length <= CAP && body.toString("base64") === envelope.bodyBase64
    && exact(a, ["schema", "operationId", "commandHash", "database", "nonce", "method", "path", "requestSHA256", "bodySHA256", "status", "observedAtUTC", "broker", "upstream", "measuredCgroup", "backendKind"])
    && a.schema === "helmut-local-unit-diagnostic-signed-response/2"
    && a.operationId === request.operationId && a.commandHash === request.commandHash && a.database === request.database
    && a.nonce === request.nonce && a.method === request.method && a.path === request.path
    && a.requestSHA256 === sha(Buffer.from(request.bodyBase64, "base64")) && a.bodySHA256 === sha(body)
    && Number.isSafeInteger(a.status) && a.status >= 100 && a.status <= 599
    && isDeepStrictEqual(a.broker, trust.anchor.broker)
    && a.backendKind === (request.path === ORIGINAL_WRITE ? "owner-psql" : "postgrest")
    && (request.path !== ORIGINAL_WRITE || request.method === "POST")
    && isDeepStrictEqual(a.upstream, request.path === ORIGINAL_WRITE ? trust.anchor.originalService : trust.anchor.upstream)
    && isDeepStrictEqual(a.measuredCgroup, trust.anchor.measuredCgroup), "signed-bindings");
  const observed = Date.parse(a.observedAtUTC), now = Date.now();
  need(typeof a.observedAtUTC === "string" && Number.isFinite(observed)
    && new Date(observed).toISOString() === a.observedAtUTC && observed >= started - 1000
    && observed <= now && now - observed <= 30000, "response-freshness");
  const signature = Buffer.from(envelope.signatureBase64, "base64");
  need(signature.length === 64 && signature.toString("base64") === envelope.signatureBase64
    && crypto.verify(null, Buffer.from(JSON.stringify(a)), trust.publicKey, signature), "ed25519-signature");
  return { status: a.status, body };
}
async function request(selection, database, method, pathname, bytes) {
  need(http.request === nativeRequest, "http-replaced");
  need(["GET", "POST"].includes(method) && typeof pathname === "string" && pathname.startsWith("/rest/v1/")
    && !/[\r\n#]/.test(pathname) && Buffer.isBuffer(bytes) && bytes.length <= CAP, "closed-request");
  const trust = readTrust(selection, database), started = Date.now(), monotonic = process.hrtime.bigint();
  const message = { operationId: selection.operationId, commandHash: selection.commandHash, database,
    nonce: crypto.randomBytes(32).toString("hex"), method, path: pathname, bodyBase64: bytes.toString("base64") };
  const payload = Buffer.from(JSON.stringify(message));
  const raw = await new Promise((resolve, reject) => {
    let req, res, settled = false, size = 0; const blocks = [];
    const timer = setTimeout(() => finish(null, "deadline-outcome-unknown"), 30000);
    function finish(value, code) {
      if (settled) return; settled = true; clearTimeout(timer);
      if (code) { req?.destroy(); res?.destroy(); reject(Error("local-unit-diagnostic-endpoint-" + code)); }
      else resolve(value);
    }
    try {
      req = nativeRequest({ socketPath: SOCKET, path: "/v1/execute", method: "POST", agent: false,
        headers: { "content-type": "application/json", "content-length": payload.length } }, incoming => {
        res = incoming;
        if (incoming.statusCode !== 200) return finish(null, "broker-rejected-unknown");
        incoming.on("data", b => { size += b.length; if (size > CAP * 4 / 3 + 65536) finish(null, "response-cap"); else blocks.push(b); });
        incoming.once("aborted", () => finish(null, "response-aborted-unknown"));
        incoming.once("error", () => finish(null, "response-error-unknown"));
        incoming.once("end", () => finish(Buffer.concat(blocks)));
      });
      req.once("error", () => finish(null, "request-outcome-unknown")); req.end(payload);
    } catch { finish(null, "request-outcome-unknown"); }
  });
  need(process.hrtime.bigint() - monotonic < 30000000000n, "native-deadline");
  const after = readTrust(selection, database);
  need(after.rawSHA256 === trust.rawSHA256 && isDeepStrictEqual(after.paths, trust.paths)
    && isDeepStrictEqual(after.fileIdentity, trust.fileIdentity), "root-replaced-during-request");
  return verifyEnvelope(raw, trust, message, started);
}
module.exports = Object.freeze({ request });
