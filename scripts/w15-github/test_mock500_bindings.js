"use strict";
// Three small public calendar fixtures; no500 qualification/controller/API.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const B = require("./mock500_bindings");
const nonce = "26d5a413-5ca7-415c-a412-62fc45b561c8", temp = "/FICTIONAL";
const root = temp + "/w15-mock500-123456789-" + nonce.replaceAll("-", "");
const context = { schema: "helmut-w15-mock500-controller-context/1", scope: "ISOLATED_GITHUB_MOCK500_BINDING_ONLY",
  nonce, runId: "123456789", runAttempt: 1, exactCommit: "a".repeat(40), runnerTemp: temp,
  hostPaths: { runRoot: root, work: root + "/work", prepare: root + "/prepare", cache: root + "/cache" } };
const LegacyMemory = require("../fixtures/w15-memory-contract");
const safety = require("./separated_resources_contract.json").referenceLabProposal;
const functional = { context, functionalResourceContract: { contract: "helmut-w15-isolated-functional/1",
  mode: "mock500-full-functional-gated", memoryProfile: "helmut-w15-mock500-functional/1",
  hardMemoryBytes: safety.commonHostHardBytes, hostReserveBytes: safety.hostAvailableReserveBytes,
  legacyRegularMemoryAccepted: false, providerResourceAccepted: false } };
assert.deepEqual(B.memoryLimits(null), LegacyMemory.limits);
assert.deepEqual(B.memoryLimits({}), LegacyMemory.limits);
assert.equal(B.memoryAssessment(null, 1638400001).reserveMeetsContract, false);
assert.equal(B.memoryAssessment(functional, 3680530432).reserveMeetsContract, true);
assert.equal(B.memoryAssessment(functional, safety.commonHostHardBytes + 1).reserveMeetsContract, false);
assert.equal(B.memoryLimits(functional).maximumConsumptionBytes, safety.commonHostHardBytes);
assert.equal(B.memoryLimits(functional).requiredReserveBytes, 0);
for (const [key, value] of [["hardMemoryBytes", 5000000000], ["mode", "mock500-full-gated"], ["memoryProfile", "unapproved"],
  ["contract", "unapproved"], ["hostReserveBytes", 0], ["legacyRegularMemoryAccepted", true], ["providerResourceAccepted", true]])
  assert.throws(() => B.memoryLimits({ ...functional, functionalResourceContract: { ...functional.functionalResourceContract, [key]: value } }));
assert.throws(() => B.memoryAssessment(functional, true));
const Runtime = require("../synthetik-500-w15-full500-runtime");
const observation = { configuredLimit: String(safety.commonHostHardBytes), swapMaximum: "0", swapCurrentBytes: 0,
  events: { max: 0, oom: 0, oom_kill: 0, oom_group_kill: 0 }, ...B.memoryAssessment(functional, 3680530432) };
assert.equal(Runtime.memoryAccepted(observation, functional), true);
assert.equal(Runtime.memoryAccepted(observation), false);
for (const key of ["max", "oom", "oom_kill", "oom_group_kill"])
  assert.equal(Runtime.memoryAccepted({ ...observation, events: { ...observation.events, [key]: 1 } }, functional), false);
assert.equal(Runtime.memoryAccepted({ ...observation, swapCurrentBytes: 1 }, functional), false);
assert.equal(B.namespace(context).base, B.BASE); assert.equal(B.namespace(context).database, B.DB);
assert.throws(() => B.namespace({ ...context, runAttempt: 2 }));
assert.throws(() => B.namespace({ ...context, hostPaths: { ...context.hostPaths, work: "/OLD" } }));
const bound = { calendar: { utcDay: "2026-10-29", berlinDay: "2026-10-29", sourceDatesRewritten: false, signaturesReused: false },
  window: { startsAtUTC: "2026-10-29T10:00:00.001Z", endsAtUTC: "2026-10-29T13:00:00.000Z", completionDeadlineUTC: "2026-10-29T13:30:00.000Z" } };
assert.equal(B.currentCalendar(bound, "2026-10-29T10:05:00.000Z"), "2026-10-29T10:05:00.000Z");
assert.deepEqual(B.fixedWindow(bound, "2026-10-29T10:05:00.000Z"), bound.window);
assert.throws(() => B.currentCalendar(bound, "2026-10-28T10:05:00.000Z"));
assert.throws(() => B.currentCalendar(bound, "2026-10-29T23:05:00.000Z")); // Berlin already next day.
assert.throws(() => B.fixedWindow(bound, "2026-10-29T13:00:00.000Z"));
assert.throws(() => B.fixedWindow({ ...bound, window: { ...bound.window, endsAtUTC: "2026-10-29T13:05:00.000Z" } }, "2026-10-29T10:05:00.000Z"));
const previous = process.env.HELMUT_W15_MOCK_CONTEXT; delete process.env.HELMUT_W15_MOCK_CONTEXT;
assert.equal(B.readBound(), null);
if (previous !== undefined) process.env.HELMUT_W15_MOCK_CONTEXT = previous;
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "w15-fictional-mock-"));
try {
  const file = path.join(folder, "input"), data = Buffer.from("FICTIONAL ONLY");
  fs.writeFileSync(file, data, { mode: 384 });
  const pin = { path: file, bytes: data.length, sha256: crypto.createHash("sha256").update(data).digest("hex") };
  assert.deepEqual(B.privateBytes(pin), data);
  assert.throws(() => B.privateBytes({ ...pin, sha256: "0".repeat(64) }));
  fs.symlinkSync(file, path.join(folder, "link"));
  assert.throws(() => B.privateBytes({ ...pin, path: path.join(folder, "link") }));
} finally { fs.rmSync(folder, { recursive: true }); }
console.log("PASS mock500 namespace, actual UTC/Berlin calendar, original fixed window and private relocated pins; no originals or runtime execution");
