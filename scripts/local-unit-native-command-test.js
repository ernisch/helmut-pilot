"use strict";

// SYNTHETIC PURE CONSTRUCTION ONLY. Source and producer inputs below are test
// stand-ins. No genuine source proof, owner approval, database, transport,
// provider, runtime qualification or diagnostic execution is created.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const Module = require("node:module"), crypto = require("node:crypto");
const A = require("../lib/helmut/local-unit-diagnostic-authority");
const P = require("../lib/helmut/synthetik-500-profile");
const Admission = require("../lib/helmut/synthetik-500-kosten-admission");
const Producer = require("../lib/helmut/local-unit-diagnostic-original-producer");
const forbidden = () => { throw Error("native-command-test-side-effect-forbidden"); };
global.fetch = forbidden;
for (const name of ["node:http", "node:https"]) { require(name).request = forbidden; require(name).get = forbidden; }
require("node:net").connect = forbidden; require("node:net").createConnection = forbidden; require("node:tls").connect = forbidden;
for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  require("node:child_process")[key] = forbidden;
for (const key of ["writeFileSync", "writeFile", "appendFileSync", "appendFile", "mkdirSync", "mkdir", "rmSync", "rm",
  "renameSync", "rename", "unlinkSync", "unlink", "createWriteStream"]) fs[key] = forbidden;
crypto.randomUUID = forbidden; crypto.randomBytes = forbidden; crypto.randomFillSync = forbidden;
const sha = value => crypto.createHash("sha256").update(value).digest("hex"), copy = value => structuredClone(value);
const pin = name => ({ path: "/tmp/SYNTHETIC-NATIVE-COMMAND-" + name, bytes: 1, sha256: sha(name) });
const bodyProof = bytes => ({ bytes: bytes.length, sha256: sha(bytes), actualRequestHash: Admission.requestHash(bytes.toString()) });
const filename = path.join(__dirname, "helmut-resource-meter/local-unit-native-command.js"), localRequire = Module.createRequire(filename);
let checks = 0;
function check(name, action) { action(); checks++; process.stdout.write("PASS " + name + "\n"); }
function fixture() {
  const sourceHandle = Object.freeze({}), owner = P.erzeuge().profile[0].mandatsId;
  const dBytes = Buffer.from(JSON.stringify({ model: "gpt-5-mini-eu", input: "SYNTHETIC D", max_output_tokens: 3000, reasoning: { effort: "low" } }));
  const rBytes = Buffer.from(JSON.stringify({ model: "gpt-5-mini-eu", input: "SYNTHETIC R", max_output_tokens: 6000, reasoning: { effort: "medium" } }));
  const originalR = Buffer.from(JSON.stringify({ model: "gpt-5-mini-eu", input: "SYNTHETIC R", max_output_tokens: 3000, reasoning: { effort: "low" } }));
  const descriptor = { owner, synthetic: true }, profile = { id: owner }, sources = { documents: [], knowledgeObjects: [] };
  const d = { id: sha("SYNTHETIC ORIGINAL D"), phase: "D", owner, inputVersionHash: P.hash(descriptor),
    actualRequestHash: Admission.requestHash(dBytes.toString()), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  const r = { id: sha("SYNTHETIC ORIGINAL R"), phase: "R", owner, inputVersionHash: null, actualRequestHash: null,
    dependsOn: d.id, contextVersionHash: d.inputVersionHash, model: d.model, maxOutputTokens: 3000, attemptLimit: 1,
    reviewRule: { version: "helmut-synthetik500-review-body/1", reasoningEffort: "low" } };
  const selected = { sourceIndex: 499, diagnosticUnit: 0, sourceOperationId: "synthetik500-resources21-" + "c".repeat(12),
    sourceDay: "2026-10-21", sourceViewAtUTC: "2026-10-21T14:07:08.254Z",
    draft: { intentId: d.id, profile, descriptor, briefingEingabe: {}, briefingDatum: "2026-10-21T14:07:08.254Z", sources },
    unit: { kind: "DR", subject: owner, intentIds: [d.id, r.id] }, intents: [d, r] };
  const source = { sourceIndex: 499, diagnosticUnit: 0, sourceDay: selected.sourceDay, sourceOperationId: selected.sourceOperationId,
    packetPin: pin("PACKET"), installPin: pin("INSTALL"), terminalPin: pin("TERMINAL"), selectionBindingSHA256: sha("SELECTION"),
    expandedSHA256: sha("EXPANDED"), draftSHA256: P.hash(selected.draft) };
  const sourceBinding = { selectionSHA256: sha("SELECTED BYTES"), executionAuthority: false };
  const diagnosticRule = { maxOutputTokens: 6000, reviewRule: { version: r.reviewRule.version, reasoningEffort: "medium" } };
  const phases = Object.fromEntries(["D", "R"].map(phase => [phase, { requestBytes: phase === "D" ? dBytes : rBytes,
    responseBytes: Buffer.from("SYNTHETIC RESPONSE " + phase), latencyBytes: Buffer.from("SYNTHETIC LATENCY " + phase), responseStatus: 200, latencyMs: 19900 }]));
  const producerResult = { schema: Producer.VERSION, sourceIndex: 499, diagnosticUnit: 0, phases,
    proof: { schema: Producer.PROOF_VERSION, sourceIndex: 499, diagnosticUnit: 0, sourceOperationId: selected.sourceOperationId,
      sourceSelectionSHA256: sourceBinding.selectionSHA256, sourceDraftSHA256: P.hash(selected.draft), sourceProfileSHA256: P.hash(profile),
      sourceBindingsSHA256: P.hash(sources), sourceIntentIds: { D: d.id, R: r.id }, sourceIntentSHA256: { D: P.hash(d), R: P.hash(r) },
      originalInputs: copy(Producer.ORIGINAL_INPUTS), originalDByteIdentical: true, originalRByteIdentical: false, originalRDiffers: true,
      originalOutputsPreserved: true, actualModelOutput: false, executionAuthority: false, full500Accepted: false, production: false,
      originalRequests: { D: bodyProof(dBytes), R: bodyProof(originalR) },
      diagnosticRequests: { D: { ...bodyProof(dBytes), maxOutputTokens: 3000, reasoningEffort: "low" },
        R: { ...bodyProof(rBytes), maxOutputTokens: 6000, reasoningEffort: "medium" } },
      diagnosticReviewOverride: { schema: "helmut-local-unit-diagnostic-review-override/1", sourceIntentModified: false,
        sourceIntentSHA256: P.hash(r), originalRule: { maxOutputTokens: 3000, reviewRule: copy(r.reviewRule) }, diagnosticRule,
        basis: { commandVersion: A.VERSION, limitsSHA256: P.hash(A.LIMITS), sourceViewAtUTC: selected.sourceViewAtUTC },
        diagnosticRequestSHA256: sha(rBytes), originalRequestSHA256: sha(originalR) } } };
  const nonce = "a".repeat(32);
  const args = { sourceHandle, producerResult, nonce, runId: "nachlauf500-1792670400000", nowUTC: "2026-10-22T12:00:01.000Z",
    window: { startsAtUTC: "2026-10-22T12:00:00.000Z", endsAtUTC: "2026-10-22T12:05:00.000Z" },
    target: { database: "helmut_unit_diagnostic_" + nonce, postrunPin: pin("POSTRUN"), ownerEvidencePin: pin("OWNER"),
      runtimeEvidencePin: pin("RUNTIME"), sourceRuntimePin: pin("SOURCE-RUNTIME") },
    gatePins: Object.fromEntries(A.GATES.map(k => [k, pin(k)])), codeCommit: "b".repeat(40), runtimeManifestPin: pin("RUNTIME-MANIFEST"),
    authPin: pin("AUTHORIZATION"), freshGrantId: sha("SYNTHETIC CALLER GRANT") };
  let verified = 0, mapped = 0;
  const valid = handle => { assert.equal(handle, sourceHandle, "synthetic opaque handle required"); };
  const sourceApi = { readSelection: handle => { valid(handle); return selected; }, sourceBinding: handle => { valid(handle); return sourceBinding; },
    commandSource: handle => { valid(handle); return source; }, diagnosticIntents: (handle, runId) => {
      valid(handle); mapped++; const [ownD, ownR] = copy(selected.intents);
      ownD.id = Admission.intentHash(runId, ownD); ownR.dependsOn = ownD.id; ownR.maxOutputTokens = 6000;
      ownR.reviewRule.reasoningEffort = "medium"; ownR.id = Admission.intentHash(runId, ownR); return [ownD, ownR];
    }, verifyCommandSource: (command, handle) => {
      valid(handle); verified++; assert.deepEqual(command.source, source);
      const { intentId, ...draft } = command.drafts[0], { intentId: old, ...before } = selected.draft;
      assert.deepEqual(draft, before); assert(!selected.unit.intentIds.includes(intentId)); return sourceBinding;
    } };
  const module = { exports: {} }, load = vm.runInThisContext("(function(require,module,exports){\n" + fs.readFileSync(filename, "utf8") + "\n})", { filename });
  load(name => name === "../../lib/helmut/local-unit-diagnostic-source" ? sourceApi : localRequire(name), module, module.exports);
  return { args, selected, sourceBinding, build: module.exports.build, verified: () => verified, mapped: () => mapped };
}
check("synthetic proposal passes real full admission validation", () => {
  const f = fixture(), result = f.build(f.args);
  assert.deepEqual(Object.keys(result).sort(), ["admission", "command", "initialState", "selection", "sourceBinding"]);
  assert.deepEqual(A.validateAdmission(result.command, result.admission, f.args.nowUTC), result.selection);
  assert.equal(f.verified(), 1); assert.equal(f.mapped(), 1);
  assert.equal(result.command.slot.plan.runtimeManifestHash, f.args.runtimeManifestPin.sha256);
  assert.equal(result.admission.grantId, f.args.freshGrantId); assert.deepEqual(result.admission.authorizationPin, f.args.authPin);
});
check("only seven fresh keys exist with no claim, old state or provider rights", () => {
  const f = fixture(), result = f.build(f.args), keys = A.keys(result.selection.operationId), state = result.initialState;
  assert.equal(Object.keys(state).length, 7); assert.equal(state[keys.journal].state, "installed");
  assert.equal(state[keys.journal].claimId, null); assert.equal(state[keys.journal].inFlight, null);
  assert.equal(state[keys.costs].spent, 0); assert.deepEqual(state[keys.costs].calls, {});
  assert.deepEqual(state[keys.sendClaim], {}); assert.deepEqual(state[keys.review], {});
  assert.equal(state[keys.result].state, "pending"); assert.deepEqual(state[keys.result].positions, []);
  assert.equal(result.command.limits.production, false); assert.equal(result.command.limits.paidProviderCallsAllowed, false);
  assert.equal(result.command.mode, "D-R-1-local-fixture"); assert.equal(result.command.units.length, 1);
});
check("source bytes stay untouched and only supplied diagnostic identities change", () => {
  const f = fixture(), before = P.hash(f.args), selected = P.hash(f.selected), result = f.build(f.args);
  assert.equal(P.hash(f.args), before); assert.equal(P.hash(f.selected), selected);
  assert.equal(f.selected.intents[1].maxOutputTokens, 3000); assert.equal(f.selected.intents[1].reviewRule.reasoningEffort, "low");
  assert.equal(result.command.slot.plan.intents[1].maxOutputTokens, 6000); assert.equal(result.command.slot.plan.intents[1].reviewRule.reasoningEffort, "medium");
  assert(!f.selected.unit.intentIds.includes(result.command.drafts[0].intentId));
  assert.deepEqual(result.sourceBinding, f.sourceBinding); assert(Object.isFrozen(result.initialState));
  for (const phase of ["D", "R"]) assert.deepEqual(Object.keys(result.command.requestPins[phase]).sort(), ["bytes", "sha256"]);
  assert(!JSON.stringify(result.command).includes("requestBytes"));
});
for (const [name, mutate] of [
  ["arbitrary approval switch", a => { a.qualified = true; }],
  ["old state input", a => { a.initialState = { oldGO: true }; }],
  ["invented handle", a => { a.sourceHandle = {}; }],
  ["nonce traversal", a => { a.nonce = "../old"; }],
  ["replayed target identity", a => { a.target.database = "helmut_unit_diagnostic_" + "c".repeat(32); }],
  ["invalid code identity", a => { a.codeCommit = "unknown"; }],
  ["invalid caller grant", a => { a.freshGrantId = "grant-me"; }],
  ["missing gate", a => { delete a.gatePins.sender; }],
  ["boolean gate attestation", a => { a.gatePins.sender = { qualified: true }; }],
  ["unbounded auth pin", a => { a.authPin.bytes = 17 * 1024 * 1024; }],
  ["invalid runtime pin", a => { a.runtimeManifestPin.sha256 = "missing"; }],
  ["noncanonical UTC", a => { a.nowUTC = "2026-10-22T12:00:01Z"; }],
  ["future window", a => { a.window.startsAtUTC = "2026-10-22T12:01:00.000Z"; }],
  ["expired window", a => { a.window.endsAtUTC = "2026-10-22T12:00:00.000Z"; }],
  ["cross-day window", a => { a.window.endsAtUTC = "2026-10-23T00:00:00.000Z"; }],
  ["oversized window", a => { a.window.endsAtUTC = "2026-10-22T23:00:00.000Z"; }],
  ["unrelated producer source", a => { a.producerResult.proof.sourceSelectionSHA256 = "0".repeat(64); }],
  ["old review replay claim", a => { a.producerResult.proof.originalRByteIdentical = true; }],
  ["unbound override", a => { a.producerResult.proof.diagnosticReviewOverride.basis.sourceViewAtUTC = a.nowUTC; }],
  ["arbitrary output body", a => { a.producerResult.phases.R.requestBytes = Buffer.from("{}"); }],
  ["hypothetical phase delay", a => { a.producerResult.phases.R.latencyMs = 19901; }]
]) check(name + " is rejected", () => { const f = fixture(); mutate(f.args); assert.throws(() => f.build(f.args)); });
process.stdout.write("Pure native command construction PASS: " + checks + " synthetic checks; no native qualification or execution.\n");
