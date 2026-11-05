"use strict";
// Closed diagnostics only. Reuse the existing code-site projection after
// removing the complete verified Error header; messages never supply frames.
const Prepare = require("./mock500_prepare_failure");
const schema = "helmut-w15-mock500-run-failure/1";
const evidenceSchema = "helmut-w15-mock500-run-evidence/1";
const kinds = new Set(["assertion", "filesystem", "module", "type", "timeout", "aborted", "unknown"]);
const prefixes = "RUNTIME|STORAGE|STORED|COMMAND|ADAPTER|EXECUTOR|CALENDAR|COST|ADMISSION|JOURNAL|CODEC|DURABLE|CONTENT_RUNNER|CONTENT_WORKER";
const check = new RegExp("^RUN_(?:" + prefixes + ")_CHECK_([1-9][0-9]{0,4})$");
const fallback = new Set(["RUN_UNMAPPED", "RUN_PROCESS_EXIT", "RUN_PROCESS_TIMEOUT",
  "RUN_SUPERVISOR_REJECTED", "RUN_FAILURE_UNAVAILABLE"]);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === keys;
const matches = (value, expression) => typeof value === "string" && expression.exec(value)?.[0] === value;
const count = value => Number.isInteger(value) && value >= 0 && value <= 500;
const countOrUnknown = value => value === "UNKNOWN" || count(value);
const boolOrUnknown = value => value === "UNKNOWN" || typeof value === "boolean";
function closed(value) {
  try {
    if (!exact(value, "category,kind,schema,stage")) return null;
    const { schema: version, stage, category, kind } = value;
    if (version !== schema || stage !== "run" || !kinds.has(kind) || typeof category !== "string") return null;
    const match = check.exec(category);
    if (!fallback.has(category) && !(match && match[0] === category && Number(match[1]) <= 65535)) return null;
    return { schema, stage: "run", category, kind };
  } catch { return null; }
}
function project(error) {
  const unknown = { schema, stage: "run", category: "RUN_UNMAPPED", kind: "unknown" };
  try {
    const inner = error?.failureFrame;
    let input;
    if (inner !== undefined) input = { failureFrame: inner };
    else {
      const name = error?.name, code = error?.code, message = error?.message, stack = error?.stack;
      let frames;
      if (typeof name === "string" && name.length <= 256
        && typeof message === "string" && message.length <= 8192
        && typeof stack === "string" && stack.length <= 32768) {
        const headers = [name + ": " + message + "\n"];
        if (message === "") headers.push(name + "\n");
        if (typeof code === "string" && code.length <= 256) headers.push(name + " [" + code + "]: " + message + "\n");
        const header = headers.find(value => stack.startsWith(value));
        if (header) frames = "Error\n" + stack.slice(header.length);
      }
      input = { name, code, stack: frames };
    }
    const prepared = Prepare.project(input, "entry");
    return closed({ schema, stage: "run", category: prepared.category.replace(/^PREPARE_/, "RUN_"), kind: prepared.kind }) || unknown;
  } catch { return unknown; }
}
function closedEvidence(value) {
  try {
    if (!exact(value, "binding,completedProfiles,completionMeaning,firstFailure,nativeCleanup,schema")) return null;
    const { schema: version, binding, firstFailure, completedProfiles, completionMeaning, nativeCleanup } = value;
    if (version !== evidenceSchema || !exact(binding, "exactCommit,inputBindingSHA256,nonce,runAttempt,runId")
      || !exact(nativeCleanup, "activeProfiles,confirmedZero,nativeBoundZero,status")) return null;
    const { exactCommit, runId, runAttempt, nonce, inputBindingSHA256 } = binding;
    if (!matches(exactCommit, /^[a-f0-9]{40}$/) || !matches(runId, /^[1-9][0-9]{4,19}$/) || runAttempt !== 1
      || !matches(nonce, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
      || !matches(inputBindingSHA256, /^[a-f0-9]{64}$/) || !countOrUnknown(completedProfiles)
      || completionMeaning !== (count(completedProfiles) ? "CONFIRMED_LOWER_BOUND" : "UNKNOWN")) return null;
    const failure = firstFailure === "UNKNOWN" ? "UNKNOWN" : closed(firstFailure);
    if (!failure) return null;
    const { status, activeProfiles, confirmedZero, nativeBoundZero } = nativeCleanup;
    if (!countOrUnknown(activeProfiles) || !boolOrUnknown(confirmedZero) || !boolOrUnknown(nativeBoundZero)) return null;
    const expected = activeProfiles === 0 && confirmedZero === true && nativeBoundZero === true ? "PASS"
      : (count(activeProfiles) && activeProfiles > 0 || confirmedZero === false || nativeBoundZero === false) ? "FAIL" : "UNKNOWN";
    if (status !== expected) return null;
    return { schema: evidenceSchema, binding: { exactCommit, runId, runAttempt, nonce, inputBindingSHA256 },
      firstFailure: failure, completedProfiles, completionMeaning,
      nativeCleanup: { status, activeProfiles, confirmedZero, nativeBoundZero } };
  } catch { return null; }
}
module.exports = { closed, project, closedEvidence };
