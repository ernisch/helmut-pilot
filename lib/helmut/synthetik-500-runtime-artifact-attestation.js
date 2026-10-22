"use strict";
// Nonsecret evidence only, inside the existing authenticated configuration read.
// No DB, network, Worker, signing, key generation or execution authority.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), MAX_TOTAL = 32 * 1024 * 1024;
const VERSION = "helmut-s500-runtime-artifacts/1", REQUIRED_NODE = "v24.19.0";
const PUB = "HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY", PRIV = "HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
function boundedFile(file, cap, charge = () => {}) {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || fs.realpathSync(file) !== file || st.size <= 0 || st.size > cap) throw Error("file");
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const current = fs.fstatSync(fd);
    if (current.dev !== st.dev || current.ino !== st.ino || current.size !== st.size) throw Error("file-drift");
    const chunks = []; let bytes = 0;
    while (bytes < st.size) {
      const chunk = Buffer.alloc(Math.min(65536, st.size - bytes));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) throw Error("file-short-read");
      bytes += count; charge(count);
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    if (bytes !== st.size || after.size !== st.size || after.mtimeMs !== current.mtimeMs) throw Error("file-drift");
    return Buffer.concat(chunks, bytes);
  } finally { fs.closeSync(fd); }
}
function keyPresence(env) {
  let publicKey = { status: "ABSENT", spkiSHA256: null };
  if (Object.hasOwn(env, PUB)) {
    try {
      if (typeof env[PUB] !== "string" || Buffer.byteLength(env[PUB]) > 16384
        || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\r?\n?$/.test(env[PUB])) throw Error("public-spki-required");
      const key = crypto.createPublicKey(env[PUB]);
      publicKey = key.asymmetricKeyType === "ed25519"
        ? { status: "VALID_ED25519_PUBLIC_KEY", spkiSHA256: sha(key.export({ type: "spki", format: "der" })) }
        : { status: "INVALID", spkiSHA256: null };
    } catch (_) { publicKey = { status: "INVALID", spkiSHA256: null }; }
  }
  return { publicKey, privateSigningKeyNamePresent: Object.hasOwn(env, PRIV) };
}
function read(env = process.env) {
  const keys = keyPresence(env), result = { version: VERSION,
    scope: "CURRENT_PROCESS_LOCAL_ARTIFACT_AND_KEY_METADATA_NOT_EXECUTION_GO",
    nodeVersion: process.version, requiredNodeVersion: REQUIRED_NODE,
    nodePatchMatchesCurrentQualification: process.version === REQUIRED_NODE,
    ...keys, actualWorkerStarted: false, databaseReads: 0, modelCalls: 0,
    executionAuthority: false, allRuntimeInstancesOrOfflineSignerProven: false,
    full500QualificationProven: false };
  try {
    const manifestFile = path.join(__dirname, "synthetik-500-release-artifacts.json");
    const raw = boundedFile(manifestFile, 65536), manifest = JSON.parse(raw);
    if (manifest.version !== "helmut-s500-release-artifact-manifest/1" || !Array.isArray(manifest.files)
      || manifest.files.length < 1 || manifest.files.length > 128
      || !/^[a-f0-9]{64}$/.test(manifest.sourceMappingSHA256)) throw Error("manifest");
    const paths = new Set(), actual = []; let total = 0, mismatches = 0, missing = 0;
    for (const pin of manifest.files) {
      if (typeof pin.path !== "string" || !/^(?:api\/index\.js|server\.js|vercel\.json|package(?:-lock)?\.json|lib\/helmut\/[a-zA-Z0-9_\/-]+\.(?:js|json))$/.test(pin.path)
        || pin.path.split("/").some(x => !x || x === "." || x === "..") || path.isAbsolute(pin.path)
        || paths.has(pin.path) || !Number.isSafeInteger(pin.bytes) || pin.bytes <= 0
        || pin.bytes > MAX_TOTAL || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw Error("pin");
      paths.add(pin.path);
      const file = path.resolve(ROOT, pin.path);
      try {
        // Charge even a subsequently rejected read against the shared IO budget.
        const bytes = boundedFile(file, MAX_TOTAL - total, count => { total += count; });
        const row = { path: pin.path, bytes: bytes.length, sha256: sha(bytes) };
        actual.push(row); if (row.bytes !== pin.bytes || row.sha256 !== pin.sha256) mismatches++;
      } catch (_) { missing++; }
    }
    // JSON format intentionally matches the offline manifest writer, not JS key insertion order.
    const mapping = sha(JSON.stringify(actual.map(x => ({ bytes: x.bytes, path: x.path, sha256: x.sha256 }))));
    Object.assign(result, { status: "CURRENT_PROCESS_ARTIFACT_METADATA",
      manifestSHA256: sha(raw), filesExpected: manifest.files.length, filesRead: actual.length,
      mismatches, missingOrUnsafeFiles: missing, actualSourceMappingSHA256: mapping,
      expectedSourceMappingSHA256: manifest.sourceMappingSHA256,
      sourceBytesMatchExpected: !missing && !mismatches && mapping === manifest.sourceMappingSHA256 });
  } catch (_) {
    Object.assign(result, { status: "ARTIFACT_EVIDENCE_UNAVAILABLE", sourceBytesMatchExpected: false });
  }
  result.artifactAndNodeReadyInThisProcess = result.sourceBytesMatchExpected && result.nodePatchMatchesCurrentQualification;
  result.publicOnlyKeyReadyInThisProcess = result.publicKey.status === "VALID_ED25519_PUBLIC_KEY" && !result.privateSigningKeyNamePresent;
  return result;
}
module.exports = Object.freeze({ read });
