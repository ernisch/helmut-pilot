"use strict";
// Public diagnostic scalars only. No messages, paths, identifiers or authority.
const AuthReport = require("./w15-auth-measurement-report");
const schema = "helmut-w15-native-end500-failure/1";
const stages = new Set(["UNKNOWN", "setup", "journal-ready", "database-preflight", "command-read", "command-decode",
  "command-freeze", "server-import", "auth-read", "auth-fixture", "auth-baseline", "observer-install", "auth-mutate",
  "auth-durable-ack", "auth-readback", "auth-postimage", "processing-contract", "final-native-sample", "final-node-sample",
  "journal-close", "report-write"]);
const actions = Object.freeze({ assertion:"INSPECT_NAMED_CHECK", "atomic-read-invalid":"INSPECT_ATOMIC_READ_BINDING",
  "store-read-invalid":"INSPECT_AUTH_ROW_BINDING", "storage-timeout":"INSPECT_LOCAL_STORAGE_TIMEOUT",
  "storage-http-error":"INSPECT_STORAGE_PERMISSION_OR_RPC", "transport-error":"INSPECT_LOCAL_TRANSPORT",
  "durable-io-error":"INSPECT_DURABLE_OBSERVATION", "module-load-error":"INSPECT_STAGED_CODE_DEPENDENCIES",
  aborted:"INSPECT_OWNED_STOP", unknown:"INSPECT_FIXED_STAGE" });
const codes = new Set(["UNKNOWN", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_ABORTED", "UND_ERR_RES_CONTENT_LENGTH_MISMATCH", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ABORT_ERR", "ENOTFOUND",
  "W15_DURABLE_QUEUE_OVERFLOW", "W15_DURABLE_WRITE_FAILED", "W15_DURABLE_SYNC_FAILED", "W15_DURABLE_DEADLINE", "W15_DURABLE_CLOSED",
  "W15_DURABLE_SERIALIZE_FAILED", "W15_DURABLE_OBSERVER_FAILED", "W15_DURABLE_CLOSE_FAILED"]);
const checks = new Set(["UNKNOWN", "w15-forward-readonly-sql", "w15-forward-common-input-binding", "w15-forward-command-binding",
  "w15-forward-command-shape", "w15-forward-auth-usage-count", "w15-forward-auth-fixture", "w15-forward-auth-baseline-bytes",
  "w15-forward-auth-baseline-budget", "w15-forward-auth-workmem", "w15-forward-no-second-native-write",
  "w15-forward-auth30-including-durable-observation", "w15-forward-auth-revision", "w15-forward-auth-sequence",
  "w15-forward-postimage", "w15-forward-auth-coverage", "w15-forward-stop-requested", "w15-forward-disk-closure-reserve",
  "w15-forward-natural-major-gc", "w15-forward-checkpoint-cycles", "w15-forward-natural-autovacuum",
  "w15-forward-wal-footprint", "w15-forward-wal-segments-not-recycled", "w15-forward-native-auth-spill",
  "w15-forward-close-deadline", "w15-forward-pending-operation-at-close", "w15-forward-concurrent-operation"]);
const keys = ["schema", "stage", "kind", "code", "causeCode", "httpStatus", "timeoutMs", "check", "acknowledgedCAS", "acknowledgedCASKind", "writeOutcome", "requiredAction"];
const get = (o,k) => { try { return o?.[k]; } catch { return undefined; } };
function closed(v) {
  if (!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).sort().join(",")!==[...keys].sort().join(",") ||
    v.schema!==schema || !stages.has(v.stage) || !Object.hasOwn(actions,v.kind) || !codes.has(v.code) || !codes.has(v.causeCode) ||
    !checks.has(v.check) || v.writeOutcome!=="UNKNOWN" || v.requiredAction!==actions[v.kind] ||
    !(v.acknowledgedCAS==="UNKNOWN" || Number.isSafeInteger(v.acknowledgedCAS)&&v.acknowledgedCAS>=0&&v.acknowledgedCAS<=500) ||
    v.acknowledgedCASKind!==(v.acknowledgedCAS==="UNKNOWN"?"UNKNOWN":"CONFIRMED_LOWER_BOUND") ||
    !(v.httpStatus==="UNKNOWN" || Number.isInteger(v.httpStatus)&&v.httpStatus>=400&&v.httpStatus<=599) ||
    !(v.timeoutMs==="UNKNOWN" || Number.isInteger(v.timeoutMs)&&v.timeoutMs>0&&v.timeoutMs<=20000)) return null;
  return Object.fromEntries(keys.map(k=>[k,v[k]]));
}
function project(error, context={}) {
  const metadata=AuthReport.failureMetadata(error), moduleCode=get(error,"code");
  const moduleFailure=moduleCode==="MODULE_NOT_FOUND"||moduleCode==="ERR_MODULE_NOT_FOUND";
  const kind=moduleFailure?"module-load-error":Object.hasOwn(actions,metadata.failureKind)?metadata.failureKind:"unknown";
  const candidateCheck=get(context,"check") || get(error,"message");
  const result={schema, stage:stages.has(get(context,"stage"))?context.stage:"UNKNOWN", kind,
    code:moduleFailure?moduleCode:codes.has(metadata.code)?metadata.code:"UNKNOWN", causeCode:codes.has(metadata.causeCode)?metadata.causeCode:"UNKNOWN",
    httpStatus:metadata.httpStatus??"UNKNOWN", timeoutMs:metadata.timeoutMs??"UNKNOWN",
    check:checks.has(candidateCheck)?candidateCheck:"UNKNOWN", acknowledgedCAS:get(context,"acknowledgedCAS"),
    acknowledgedCASKind:"CONFIRMED_LOWER_BOUND", writeOutcome:"UNKNOWN", requiredAction:actions[kind]};
  // A missing count remains unconfirmed; callers must supply their durable ACK lower bound.
  if (!Number.isSafeInteger(result.acknowledgedCAS)||result.acknowledgedCAS<0||result.acknowledgedCAS>500) {
    result.acknowledgedCAS="UNKNOWN";result.acknowledgedCASKind="UNKNOWN";
  }
  return closed(result);
}
module.exports={project,closed};
