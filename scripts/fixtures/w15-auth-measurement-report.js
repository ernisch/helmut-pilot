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

module.exports = { summarize, retainOnTermination };
