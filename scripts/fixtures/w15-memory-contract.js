"use strict";
// Current isolated W15 acceptance criterion. Does not configure a cgroup or budget.
const assert = require("node:assert/strict");
const contract = require("./w15-memory-contract.json");
assert.equal(contract.version, "helmut-w15-memory-check/2");
assert(Number.isSafeInteger(contract.comparisonBudgetBytes) && contract.comparisonBudgetBytes > 0);
assert.equal(contract.minimumReservePercent, 20);
const requiredReserveBytes = Math.ceil(contract.comparisonBudgetBytes * contract.minimumReservePercent / 100);
const limits = Object.freeze({ ...contract, requiredReserveBytes,
  maximumConsumptionBytes: contract.comparisonBudgetBytes - requiredReserveBytes });
function assess(kernelLifetimePeakBytes) {
  assert(Number.isSafeInteger(kernelLifetimePeakBytes) && kernelLifetimePeakBytes >= 0);
  const comparisonReserveBytes = limits.comparisonBudgetBytes - kernelLifetimePeakBytes;
  return { ...limits, kernelLifetimePeakBytes, comparisonReserveBytes,
    reserveMeetsContract: comparisonReserveBytes >= requiredReserveBytes };
}
module.exports = Object.freeze({ limits, assess });
