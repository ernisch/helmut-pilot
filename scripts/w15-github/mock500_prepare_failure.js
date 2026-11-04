"use strict";
// Closed diagnostic metadata only: no authority, IO, messages or private paths.
const path = require("node:path");
const schema = "helmut-w15-mock500-prepare-failure/1";
const stages = new Set(["entry", "preconditions", "calendar", "setup", "stored-command",
  "installation", "command-read", "current-inputs", "auth-read", "bindings", "admission",
  "install", "auth-coverage", "memory", "report"]);
const kinds = new Set(["assertion", "filesystem", "module", "type", "timeout", "aborted", "unknown"]);
const prefixes = "RUNTIME|STORAGE|STORED|COMMAND|ADAPTER|EXECUTOR|CALENDAR|COST|ADMISSION|JOURNAL|CODEC|DURABLE|CONTENT_RUNNER|CONTENT_WORKER";
const check = new RegExp("^PREPARE_(?:" + prefixes + ")_CHECK_([1-9][0-9]{0,4})$");
function closed(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "category,kind,schema,stage"
    || value.schema !== schema || !stages.has(value.stage) || !kinds.has(value.kind)
    || typeof value.category !== "string") return null;
  const match = check.exec(value.category);
  if (value.category !== "PREPARE_UNMAPPED" && !(match && match[0] === value.category && Number(match[1]) <= 65535)) return null;
  return { schema, stage: value.stage, category: value.category, kind: value.kind };
}
const get = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
function project(error, stage) {
  const root = path.resolve(__dirname, "../..");
  const relativeFrames = [["scripts/synthetik-500-w15-full500-runtime.js", "RUNTIME"],
    ["lib/helmut/storage.js", "STORAGE"],
    ["lib/helmut/synthetik-500-content-runner.js", "CONTENT_RUNNER"],
    ["lib/helmut/synthetik-500-content-worker.js", "CONTENT_WORKER"],
    ...[["synthetik-500-stored-command", "STORED"], ["synthetik-500-production-command", "COMMAND"],
      ["synthetik-500-production-adapter", "ADAPTER"], ["synthetik-500-executor", "EXECUTOR"],
      ["synthetik-500-mock-calendar", "CALENDAR"], ["synthetik-500-kosten-plan", "COST"],
      ["synthetik-500-kosten-admission", "ADMISSION"], ["synthetik-500-dispatch-journal", "JOURNAL"],
      ["synthetik-500-direct-codec", "CODEC"]].map(([name, prefix]) => ["lib/helmut/" + name + ".js", prefix]),
    ["scripts/fixtures/w15-durable-observations.js", "DURABLE"]];
  const inner = get(error, "failureFrame");
  if (inner !== undefined) {
    try {
      if (inner && typeof inner === "object" && !Array.isArray(inner)
        && Object.keys(inner).sort().join(",") === "file,kind,line"
        && Number.isInteger(inner.line) && inner.line >= 1 && inner.line <= 65535 && kinds.has(inner.kind)) {
        const row = relativeFrames.find(([filename]) => filename === inner.file);
        if (row) return closed({ schema, stage: stages.has(stage) ? stage : "entry",
          category: "PREPARE_" + row[1] + "_CHECK_" + inner.line, kind: inner.kind });
      }
    } catch {}
    // Do not substitute the shared runner callback for an unknown inner site.
    return closed({ schema, stage: stages.has(stage) ? stage : "entry", category: "PREPARE_UNMAPPED", kind: "unknown" });
  }
  const frames = relativeFrames.map(([name, prefix]) => [path.join(root, name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), prefix]);
  const code = get(error, "code"), name = get(error, "name");
  const kind = name === "AssertionError" ? "assertion" : name === "TypeError" ? "type"
    : ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(code) ? "module"
    : ["EACCES", "EPERM", "ENOENT", "EEXIST", "ENOTDIR", "ELOOP", "EIO", "ENOSPC"].includes(code) ? "filesystem"
    : ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code) ? "timeout"
    : ["ABORT_ERR", "UND_ERR_ABORTED"].includes(code) ? "aborted" : "unknown";
  let category = "PREPARE_UNMAPPED";
  const stack = get(error, "stack");
  for (const line of (typeof stack === "string" ? stack.slice(0, 32768).split("\n").slice(1) : [])) {
    // Skip generic throw helpers; identify their first actual code caller.
    if (/^\s+at (?:fail|need|requireThat|fordere|fehler) \(/.test(line)) continue;
    let found = false;
    for (const [filename, prefix] of frames) {
      const match = line.match(new RegExp("^\\s+at (?:.*?\\()?" + filename + ":([0-9]+):[0-9]+\\)?$"));
      const number = match ? Number(match[1]) : 0;
      if (number >= 1 && number <= 65535) { category = "PREPARE_" + prefix + "_CHECK_" + number; found = true; break; }
    }
    if (found) break;
  }
  return closed({ schema, stage: stages.has(stage) ? stage : "entry", category, kind });
}
module.exports = { closed, project };
