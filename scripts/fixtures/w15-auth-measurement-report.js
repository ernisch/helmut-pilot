"use strict";

// Reporting only. Never authorizes, dispatches, mutates Auth or retries a write.
function summarize({ mutations = [], usageSinks = [], casWrites = [] }) {
  const calls = [...mutations, ...usageSinks];
  const complete = r => r.acknowledged === true && Number.isFinite(r.wallMs) && r.wallMs >= 0
    && Number.isFinite(r.beginMS) && Number.isFinite(r.ackMS) && Number.isFinite(r.endMS)
    && r.beginMS <= r.ackMS && r.ackMS <= r.endMS;
  const maximum = rows => rows.length ? Math.max(...rows.map(r => r.wallMs)) : null;
  const completedCalls = calls.filter(complete), completedCAS = casWrites.filter(complete);
  const kinds = {};
  for (const r of completedCalls) {
    const key = r.api || r.kind;
    kinds[key] = { count: (kinds[key]?.count || 0) + 1, maximumWallMs: Math.max(kinds[key]?.maximumWallMs || 0, r.wallMs) };
  }
  return { observedFullCalls: calls.length, completedFullCalls: completedCalls.length,
    observedCASWrites: casWrites.length, completedCASWrites: completedCAS.length,
    maximumFullCallWallMs: maximum(completedCalls), maximumCASWallMs: maximum(completedCAS),
    incompleteFullCalls: calls.length - completedCalls.length, incompleteCASWrites: casWrites.length - completedCAS.length,
    perAPI: kinds, timingsUseWholeCallThroughACK: true };
}

// Retain only allowlisted machine transport metadata. Raw messages, headers,
// request bodies, URLs, credentials and arbitrary causes never enter reports.
function failureMetadata(error) {
  const get = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
  const codes = new Set(["UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT", "UND_ERR_ABORTED", "UND_ERR_RES_CONTENT_LENGTH_MISMATCH",
    "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ABORT_ERR", "ENOTFOUND"]);
  const name = get(error, "name"), code = get(error, "code"), cause = get(error, "cause"), causeCode = get(cause, "code");
  const result = { name: ["Error", "TypeError", "AbortError", "TimeoutError"].includes(name) ? name : "Error" };
  if (codes.has(code)) result.code = code;
  if (codes.has(causeCode)) result.causeCode = causeCode;
  for (const key of ["bytesRead", "bytesWritten"]) {
    const value = get(get(cause, "socket"), key);
    if (Number.isSafeInteger(value) && value >= 0) (result.socket ||= {})[key] = value;
  }
  // Existing storage prefixes; the internal deadline message is exact-only.
  // A label describes this error only; historical UNKNOWNs are not relabelled.
  const message = get(error, "message");
  const timeout = typeof message === "string" && /^Supabase storage timed out after (\d+)ms:/.exec(message);
  const http = typeof message === "string" && /^Supabase storage failed \((\d{3})\):/.exec(message);
  if (code === "ERR_ASSERTION") result.failureKind = "assertion";
  else if (code === "ATOMIC_USAGE_READ_INVALID" || message === "ATOMIC_USAGE_READ_INVALID") result.failureKind = "atomic-read-invalid";
  else if (code === "STORE_READ_INVALID") result.failureKind = "store-read-invalid";
  else if (timeout && Number(timeout[1]) > 0 && Number(timeout[1]) <= 20000) {
    result.failureKind = "storage-timeout"; result.timeoutMs = Number(timeout[1]);
  } else if (message === "Supabase request deadline exceeded") {
    result.failureKind = "storage-timeout";
  } else if (http && Number(http[1]) >= 400 && Number(http[1]) <= 599) {
    result.failureKind = "storage-http-error"; result.httpStatus = Number(http[1]);
  } else if (result.code || result.causeCode) result.failureKind = "transport-error";
  else if (name === "AbortError") result.failureKind = "aborted";
  else result.failureKind = "unknown";
  return result;
}

function retainOnTermination(snapshot, write) {
  let attempted = false;
  const handlers = {};
  for (const [signal, exitCode] of [["SIGTERM", 143], ["SIGINT", 130]]) {
    handlers[signal] = () => {
      if (attempted) return;
      attempted = true;
      try { write({ ...snapshot(), status: "FAIL_OR_UNKNOWN", terminationSignal: signal,
        retainedAtUTC: new Date().toISOString(), bestEffortOnly: true, retryAllowed: false }); }
      catch { process.stderr.write("w15-abort-observations-unavailable\n"); }
      finally { process.exit(exitCode); }
    };
    process.once(signal, handlers[signal]);
  }
  return () => { for (const [signal, fn] of Object.entries(handlers)) process.removeListener(signal, fn); };
}

module.exports = { summarize, retainOnTermination, failureMetadata };
