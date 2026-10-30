"use strict";
// Execute only the actual per-unit provider guard, with invented observations.
// No controller, database, HTTP, timer, key or 500-unit sequence is started.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const runtimePath = require.resolve("./synthetik-500-w15-full500-runtime");
const runtime = require(runtimePath), source = fs.readFileSync(runtimePath, "utf8");
const begin = source.indexOf("      const phases = providerPhases.slice(phaseOffset);");
const end = source.indexOf("      const unitAuth =", begin);
assert(begin >= 0 && end > begin, "actual-runtime-provider-guard-present");
const guard = source.slice(begin, end);
const execute = vm.compileFunction(guard, ["assert", "index", "providerPhases", "phaseOffset", "providerPhasesUnder20"]);
function phases(index, duration = 1) {
  return ["D", "R"].map(phase => ({ index, phase, beginMS: 10, endMS: 10 + duration,
    actualDelayMS: duration, nativePermanentSendClaim: true, nativeCostReservation: true }));
}
function check(index, observations) {
  execute(assert, index, observations, 0, runtime.providerPhasesUnder20);
}
let checked = 0;
for (const index of [1, 250]) {
  check(index, phases(index, 19999)); checked++;
  for (const duration of [20000, 20001]) {
    assert.throws(() => check(index, phases(index, duration)),
      error => error?.code === "ERR_ASSERTION", "middle-provider-must-stop-at-exclusive20s");
    checked++;
  }
}
for (const patch of [{ actualDelayMS: -1 }, { actualDelayMS: NaN }, { beginMS: NaN },
  { endMS: Infinity }, { endMS: 9 }, { actualDelayMS: undefined }, { actualDelayMS: 0 }]) {
  const rows = phases(250); Object.assign(rows[1], patch);
  assert.throws(() => check(250, rows), error => error?.code === "ERR_ASSERTION"); checked++;
}
check(0, phases(0, 19900)); check(499, phases(499, 19999)); checked += 2;
assert.equal(runtime.providerPhasesUnder20([]), false); checked++;
assert.equal(runtime.providerPhasesUnder20(null), false); checked++;
console.log(JSON.stringify({ status: "PASS_PROVIDER_GUARD_BOUNDARIES_ONLY", checks: checked,
  actualRuntimeGuardExecuted: true, databaseStarted: false, fullMock500Started: false }));
