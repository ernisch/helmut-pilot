"use strict";
// Lossless transport of the complete direct command/packet, never projection.
// Both encoded and decoded sizes are finite; hashes cover original UTF8 bytes.
const crypto = require("node:crypto"), zlib = require("node:zlib");
const VERSION = "helmut-synthetik500-direct-gzip/1";
const MAX_BYTES = 64 * 1024 * 1024, MAX_ENCODED = 16 * 1024 * 1024;
const direct = x => (x?.command ?? x)?.version === "helmut-synthetik500-production-command/2-direct"
  && (x?.command ?? x)?.mode === "D-R-500";
const directInput = x => x?.executorInputs?.version === "helmut-synthetik500-executor-eingaben/4-direct"
  && Object.keys(x).sort().join("|") === "drafts|executorInputs|package|predecessors";
const supported = x => direct(x) || directInput(x) || x?.version === "helmut-synthetik500-direct-result-export/1"
  && /^synthetik500-[a-z0-9-]{8,80}$/.test(x.operationId || "") && /^[a-f0-9]{64}$/.test(x.commandHash || "")
  && x.result && typeof x.result === "object";
const requireThat = ok => { if (!ok) throw Error("synthetik500-production-direct-codec-invalid"); };
function encode(value) {
  requireThat(supported(value)); require("./knowledge-object-version").jsonValue(value);
  const raw = Buffer.from(JSON.stringify(value)); requireThat(raw.length <= MAX_BYTES);
  const envelope = { version: VERSION, bytes: raw.length, sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    data: zlib.gzipSync(raw).toString("base64") };
  requireThat(Buffer.byteLength(JSON.stringify(envelope)) <= MAX_ENCODED); return envelope;
}
function decode(value) {
  if (value?.version !== VERSION) return value;
  requireThat(Object.keys(value).sort().join("|") === "bytes|data|sha256|version"
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_BYTES
    && typeof value.data === "string" && Buffer.byteLength(JSON.stringify(value)) <= MAX_ENCODED
    && /^[a-f0-9]{64}$/.test(value.sha256 || ""));
  const gzip = Buffer.from(value.data, "base64"); requireThat(gzip.toString("base64") === value.data);
  const raw = zlib.gunzipSync(gzip, { maxOutputLength: value.bytes });
  requireThat(raw.length === value.bytes && crypto.createHash("sha256").update(raw).digest("hex") === value.sha256
    && Buffer.from(raw.toString("utf8"), "utf8").equals(raw));
  const result = JSON.parse(raw); requireThat(supported(result)); require("./knowledge-object-version").jsonValue(result);
  return result;
}
module.exports = { VERSION, MAX_BYTES, MAX_ENCODED, encode, decode };
