"use strict";
// Observation only. The original conditional writer owns retries and confirms
// persistence; this module never retries, reads, writes or races a deadline.
const assert = require("node:assert/strict");
const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");

function install({ storage, J, mutations, units, event, failure, now = () => performance.now() }) {
  const context = new AsyncLocalStorage(), closedRows = new WeakSet(), mutate = storage.mutateAuthStore;
  const enter = J.enter, finish = J.finish;
  const count = () => storage.synthetik500PreparedDiagnostics()?.checkpoints.length ?? null;
  const active = () => {
    const value = context.getStore();
    assert(value?.callback && !value.callback.closed && !closedRows.has(value.row),
      "Journal observation outside active mutation callback");
    return value;
  };
  J.enter = function (...args) {
    const { row, callback } = active(), beginMS = now(), startCheckpointCount = count();
    assert(!callback.enter && !callback.finish, "Repeated journal transition in callback");
    const result = enter.apply(this, args), index = args[3];
    assert(Number.isSafeInteger(index) && index >= 0);
    const observed = { index, beginMS, beginUTC: args[4], startCheckpointCount,
      deadlineAtUTC: J.current(args[0]).inFlight.deadlineAtUTC, finalACKMS: null };
    if (row.firstEnter) assert.equal(index, row.firstEnter.index, "Enter index changed across conflict");
    else row.firstEnter = observed;
    callback.enter = observed;
    return result;
  };
  J.finish = function (...args) {
    const { callback } = active();
    assert(!callback.finish && !callback.enter, "Repeated journal transition in callback");
    const result = finish.apply(this, args);
    callback.finish = { index: args[3] };
    return result;
  };
  storage.mutateAuthStore = function (fn, ...rest) {
    assert.equal(typeof fn, "function");
    const row = { index: mutations.length, beginMS: now(), callbacks: [], callbackRuns: 0,
      finishIndex: null, confirmedConflictAttempts: [] };
    mutations.push(row);
    return context.run({ row }, async () => {
      let previous = null, last = null, callbackOpen = false;
      try {
        const result = await mutate.call(this, async (...args) => {
          assert(!callbackOpen && !closedRows.has(row), "Overlapping or late mutation callback");
          // The trusted writer invokes its callback again only after a confirmed
          // AUTH_STORE_CONFLICT. Unknown transport outcomes never reach here.
          if (previous) {
            assert(previous.completed && previous.closed, "Overlapping mutation callbacks");
            previous.outcome = "confirmed-conflict";
            row.confirmedConflictAttempts.push(previous.attempt);
          }
          const callback = { attempt: row.callbacks.length, beginMS: now(), outcome: "pending" };
          row.callbacks.push(callback); row.callbackRuns++;
          const attempt = { callback, result: undefined }; last = attempt; callbackOpen = true;
          return context.run({ row, callback }, async () => {
            try {
              const value = await fn(...args);
              attempt.result = value; callback.completed = true; return value;
            } finally { callbackOpen = false; callback.closed = true; callback.endMS = now(); previous = callback; }
          });
        }, ...rest);
        assert(last?.callback.completed && last.callback.closed && Object.is(result, last.result),
          "Conditional writer resolved without the completed callback result");
        const final = last.callback, ackMS = now();
        assert(!row.firstEnter || final.enter, "Confirmed callback omitted tentative enter");
        if (final.enter) {
          assert(!units.some(unit => unit.index === final.enter.index), "Duplicate confirmed unit index");
          // Keep the FIRST attempted begin/deadline: a conflict must never buy
          // the observer more Unit60 time. The persisted deadline is separate.
          units.push({ ...row.firstEnter, enterACKMS: ackMS,
            persistedDeadlineAtUTC: final.enter.deadlineAtUTC });
          event("actual_J_enter", { index: final.enter.index });
        }
        if (final.finish) {
          const matching = units.filter(unit => unit.index === final.finish.index);
          assert.equal(matching.length, 1, "Finish has no unique confirmed enter");
          assert.equal(matching[0].finalACKMS, null, "Duplicate confirmed finish");
          matching[0].finalACKMS = ackMS; matching[0].endCheckpointCount = count();
          row.finishIndex = final.finish.index;
        }
        final.outcome = "confirmed"; row.ackMS = ackMS; row.ok = true;
        return result;
      } catch (error) {
        if (last && last.callback.outcome === "pending") {
          const confirmedConflict = error?.code === "AUTH_STORE_CONFLICT" && last.callback.completed;
          last.callback.outcome = confirmedConflict ? "confirmed-conflict" : "unconfirmed";
          if (confirmedConflict) row.confirmedConflictAttempts.push(last.callback.attempt);
        }
        row.error = failure(error); throw error;
      } finally {
        closedRows.add(row);
        delete row.firstEnter;
        row.endMS = now(); row.wallMS = row.endMS - row.beginMS;
        row.queueAndReadMS = row.callbacks.length ? row.callbacks[0].beginMS - row.beginMS : null;
        row.callbackMS = row.callbacks.reduce((sum, cb) => sum + cb.endMS - cb.beginMS, 0);
        row.afterCallbackThroughACKMS = row.ackMS !== undefined && row.callbacks.length
          ? row.ackMS - row.callbacks.at(-1).endMS : null;
      }
    });
  };
  return Object.freeze({ currentMutation: () => {
    const row = context.getStore()?.row;
    return row && !closedRows.has(row) ? row : null;
  } });
}
module.exports = Object.freeze({ install });
