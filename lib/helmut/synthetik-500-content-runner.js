"use strict";
const { Worker } = require("node:worker_threads");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "../..");
const workerFile = path.join(__dirname, "synthetik-500-content-worker.js");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
// Also detects source drift after a context has been issued. This is source
// identity inside the trusted server process, not a caller-provided receipt.
function sourceBinding() {
  const raw = fs.readFileSync(path.join(__dirname, "synthetik-500-cpu-source-pins.json"));
  const manifest = JSON.parse(raw), hashes = [sha(raw)];
  if (manifest.version !== "helmut-synthetik500-cpu-source-pins/1"
    || !Array.isArray(manifest.sources) || !Array.isArray(manifest.entries)) throw Error("synthetik500-content-pins");
  let workerPinned = false;
  for (const pin of [...manifest.sources, ...manifest.entries.filter(x => x.path === "lib/helmut/synthetik-500-content-worker.js")]) {
    const filename = path.resolve(ROOT, pin.path), relative = path.relative(ROOT, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw Error("synthetik500-content-pin-path");
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) throw Error("synthetik500-content-source-drift");
    if (filename === workerFile) workerPinned = true;
  }
  if (!workerPinned) throw Error("synthetik500-content-worker-not-pinned");
  for (const filename of [__filename, "storage.js", "auth-store-cas.js", "llm-usage-atomic.js", "ai.js",
    "synthetik-500-stored-command.js", "synthetik-500-stored-command-native-pins.json",
    "synthetik-500-production-adapter.js", "synthetik-500-direct-d-store.js", "synthetik-500-direct-entry.js",
    "synthetik-500-dispatch-journal.js"])
    hashes.push(sha(fs.readFileSync(path.resolve(__dirname, filename))));
  hashes.push(sha(JSON.stringify([process.version, process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON ?? null,
    process.env.HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY ?? null,
    process.env.HELMUT_LLM_USAGE_STORAGE ?? null])));
  return hashes.join(":");
}
async function runContent(input, timeoutMs, mode) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > (mode === "full" ? 90000 : 60000)) throw Error("synthetik500-content-timeout");
  sourceBinding();
  const env = {};
  // This is the nonsecret publication acceptance policy, not runtime credentials.
  if (process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON !== undefined)
    env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON;
  const worker = new Worker(workerFile, { workerData: { ...input, mode }, env, execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 1280, maxYoungGenerationSizeMb: 64, stackSizeMb: 8 } });
  let timer;
  const measuredPhases = [];
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => { const error = Error("synthetik500-content-preparation-deadline");
        error.phases = measuredPhases; reject(error); }, timeoutMs);
      worker.once("error", reject);
      worker.once("exit", code => reject(Error("synthetik500-content-worker-exit-" + code)));
      worker.on("message", answer => {
        if (answer?.type === "phase") { measuredPhases.push(answer.measured); return; }
        if (answer?.ok !== true) { const error = Error(answer?.error || "synthetik500-content-worker-failed");
          error.phases = answer?.phases; error.diagnostics = answer?.diagnostics; reject(error); }
        else resolve(answer);
      });
    });
  } finally { clearTimeout(timer); await worker.terminate(); }
}
const validateStoredContent = (input, timeoutMs) => runContent(input, timeoutMs, "full");
// Data restoration only. Original storage must verify its signed actual-row
// certificate before calling this; restoration cannot issue a full-C proof.
const restoreStoredContent = (input, timeoutMs) => runContent(input, timeoutMs, "restore");
module.exports = Object.freeze({ sourceBinding, validateStoredContent, restoreStoredContent });
