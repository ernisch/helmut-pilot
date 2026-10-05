"use strict";
// Consistency of supplied, retained bytes only. No Native admission, execution
// or vendor-origin proof; no guarantee against privileged administration.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const P = require("./synthetik-500-profile"), A = require("./synthetik-500-kosten-admission");
const R = require("./synthetik-500-review-receipt"), C = require("./synthetik-500-production-command");
const B = require("./briefing-speicher"), Q = require("./lage-textqualitaet");
const VERSION = "bounded-consumed-D/1";
const CLAIM = Object.freeze({ scope: "retained-full-draft-to-declared-review-body", globalImmutable: false,
  platformAdministrationEnforced: false, actualExecutionVerified: false, admissionGranted: false });
const hashBytes = b => crypto.createHash("sha256").update(b).digest("hex");
function need(ok, reason) { if (!ok) throw Error("bounded-consumed-D-" + reason); }
function readOriginal(pin) {
  need(C.exact(pin, ["path", "bytes", "sha256"]) && typeof pin.path === "string"
    && /^(\/tmp\/|\/workspace\/)/.test(pin.path) && Number.isSafeInteger(pin.bytes)
    && pin.bytes > 0 && pin.bytes <= 16 * 1024 * 1024
    && /^[a-f0-9]{64}$/.test(pin.sha256), "original-pin");
  const physical = fs.realpathSync(pin.path);
  need(/^(\/tmp\/|\/workspace\/)/.test(physical), "original-location");
  outsideRepository(physical);
  const fd = fs.openSync(pin.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    need(before.isFile() && before.nlink === 1 && (before.mode & 0o777) === 0o600
      && before.size === pin.bytes, "private-original");
    // Bounded reads also reject growth rather than allocating an unbounded file.
    const buffer = Buffer.alloc(pin.bytes + 1); let count = 0, read;
    while (count < buffer.length && (read = fs.readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += read;
    const after = fs.fstatSync(fd), named = fs.lstatSync(pin.path);
    const identity = s => [s.dev, s.ino, s.mode, s.nlink, s.uid, s.gid, s.size, s.mtimeMs, s.ctimeMs].join("|");
    need(identity(before) === identity(after) && identity(before) === identity(named)
      && physical === fs.realpathSync(pin.path) && count === pin.bytes, "original-drift");
    outsideRepository(physical);
    const bytes = buffer.subarray(0, count);
    need(hashBytes(bytes) === pin.sha256 && Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "original-bytes");
    return bytes;
  } finally { fs.closeSync(fd); }
}
function outsideRepository(physical) {
  // Resolve parent aliases as well; an empty .git directory is not a repository.
  let dir = path.dirname(physical);
  for (;;) {
    need(!(fs.existsSync(path.join(dir, "HEAD")) && fs.existsSync(path.join(dir, "objects"))
      && fs.existsSync(path.join(dir, "config"))), "original-inside-repository");
    const marker = path.join(dir, ".git");
    if (fs.existsSync(marker)) {
      const stat = fs.lstatSync(marker);
      need(!stat.isFile() && !stat.isSymbolicLink()
        && !fs.existsSync(path.join(marker, "HEAD")), "original-inside-repository");
    }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
}
function callFor(auth, slot, intent, requestHash, binding) {
  const consumed = slot.consumed[intent.id], plan = slot.plan;
  const call = auth.testKostenTage?.[consumed?.day]?.calls?.[consumed?.ticketId], a = call?.admission;
  need(consumed && a && call.status === "abgerechnet" && Number.isSafeInteger(call.cost)
    && call.cost >= 0 && call.cost <= call.reserved && call.reserved === consumed.reserved
    && a.version === slot.version && a.planHash === slot.planHash && a.intentId === intent.id
    && a.phase === intent.phase && a.actualRequestHash === requestHash
    && consumed.actualRequestHash === requestHash && a.operationId === plan.operationId
    && a.runId === plan.runId && a.productionCommit === plan.productionCommit
    && a.startsAtUTC === plan.startsAtUTC && a.endsAtUTC === plan.endsAtUTC
    && consumed.day === plan.startsAtUTC.slice(0, 10), "accounted-ticket-drift");
  if (binding) need(a.reviewBindingHash === binding.bindingHash, "review-ticket-drift");
  if (slot.version === A.ROUTE_VERSION) need(a.routeContractHash === P.hash(plan.routeContract)
    && A.pruefeRouteSnapshot(a.runtimeRouteSnapshot) === A.pruefeRouteSnapshot(plan.routeContract.route), "route-drift");
  return call;
}
function pruefe(input) {
  require("./knowledge-object-version").jsonValue(input);
  need(C.exact(input, ["auth", "dIntentId", "rIntentId", "originalCanonicalDraftPin",
    "actualReviewBodyPin", "profile", "sources", "claim"])
    && C.same(input.claim, CLAIM), "scope");
  const { auth, dIntentId, rIntentId, profile, sources } = input, slot = auth[A.KEY];
  const { p: plan, byId } = A.pruefeSlot(slot), d = byId.get(dIntentId), r = byId.get(rIntentId);
  need(d?.phase === "D" && r?.phase === "R" && r.dependsOn === dIntentId
    && r.owner === d.owner && profile?.id === d.owner, "position");
  const completion = R.validateCompletion(slot.draftCompletions[dIntentId], slot);
  const binding = R.validateBinding(slot.reviewBindings[rIntentId], slot, r);
  const dCall = callFor(auth, slot, d, d.actualRequestHash);
  callFor(auth, slot, r, binding.actualRequestHash, binding);
  need(dCall.cost === completion.costMicroUsd, "completion-cost");
  const usage = (auth.llmUsage || []).filter(x => x.id === completion.usageReceipt.id);
  need(usage.length === 1 && P.hash(usage[0]) === completion.usageReceipt.recordHash, "usage");
  const bytes = readOriginal(input.originalCanonicalDraftPin), entry = JSON.parse(bytes.toString("utf8"));
  need(bytes.length <= 524288 && bytes.equals(Buffer.from(P.kanonisch(entry), "utf8"))
    && hashBytes(bytes) === binding.storedD.versionHash && P.hash(entry) === binding.storedD.versionHash
    && entry.id === binding.storedD.id && entry.user_id === d.owner && entry.payload?.runId === plan.runId
    && P.hash(entry.payload.antwort) === completion.outputHash
    && P.hash(entry.payload.quellen) === completion.sourceContext.sourcesHash
    && P.hash(sources) === completion.sourceContext.sourcesHash
    && entry.payload.profilHash === completion.sourceContext.profileHash
    && B.profilHash(profile) === completion.sourceContext.profileHash, "original-draft-drift");
  const rawBody = readOriginal(input.actualReviewBodyPin), body = rawBody.toString("utf8");
  const derived = require("./ai").prepareLageReviewInput(entry.payload.antwort, sources, profile);
  const expected = JSON.stringify({ model: "gpt-5-mini", input: derived.prompt, max_output_tokens: r.maxOutputTokens,
    reasoning: { effort: binding.rule.reasoningEffort }, text: { format: { type: "json_schema",
      name: "knowledge_object", schema: Q.SCHEMA, strict: true } } });
  need(body === expected && hashBytes(rawBody) === binding.bodySha256
    && A.requestHash(body) === binding.actualRequestHash && P.hash(derived.prompt) === binding.promptHash, "review-body-drift");
  const base = { version: VERSION, planHash: slot.planHash, dIntentId, rIntentId,
    completionHash: completion.completionHash, draftVersionHash: binding.storedD.versionHash,
    reviewBodySha256: binding.bodySha256, actualRequestHash: binding.actualRequestHash,
    originalCanonicalDraftPin: input.originalCanonicalDraftPin, actualReviewBodyPin: input.actualReviewBodyPin,
    claim: CLAIM };
  return { version: VERSION, bindingsConsistent: true, bindingHash: P.hash(base),
    draftVersionHash: base.draftVersionHash, reviewBodySha256: base.reviewBodySha256,
    actualRequestHash: base.actualRequestHash, claim: { ...CLAIM } };
}
module.exports = { VERSION, CLAIM, pruefe };
