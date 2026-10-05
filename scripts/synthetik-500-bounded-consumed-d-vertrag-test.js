"use strict";
// Synthetic file/receipt countercases only; no provider, database or Native run.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const crypto = require("node:crypto");
const P = require("../lib/helmut/synthetik-500-profile"), A = require("../lib/helmut/synthetik-500-kosten-admission");
const R = require("../lib/helmut/synthetik-500-review-receipt"), V = require("../lib/helmut/synthetik-500-bounded-consumed-d-vertrag");
const B = require("../lib/helmut/briefing-speicher"), ai = require("../lib/helmut/ai"), Q = require("../lib/helmut/lage-textqualitaet");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-bounded-proof-")); fs.chmodSync(root, 0o700);
let serial = 0, passed = 0;
function fixture() {
  const dir = path.join(root, String(++serial)); fs.mkdirSync(dir, { mode: 0o700 });
  const owner = "test-kohorte-synthetik-bt-001", runId = "nachlauf500-1791194400000";
  const profile = { id: owner, committees: ["Arbeit und Soziales"] };
  const sources = [{ vorgang_id: "vg-fictional", quellenbelege: [{ quelle_id: "q-fictional",
    url: "https://example.org/fictional", titel: "Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.", quelle: "Offlinefixture" }] }];
  const answer = { paragraphs: [{ text: "Die Quelle berichtet ueber einen Entwurf.", vorgang_ids: ["vg-fictional"],
    quelle_id: "q-fictional", auswahlbegruendung: "Institutionelle Passung zum Ausschuss Arbeit und Soziales.",
    mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } },
    { text: "Ein Termin ist noch nicht benannt.", vorgang_ids: ["vg-fictional"],
      quelle_id: "q-fictional", auswahlbegruendung: "Institutionelle Passung zum Ausschuss Arbeit und Soziales.",
      mandatsbezug: { feld: "ausschuss", wert: "Arbeit und Soziales" } }] };
  const entry = { id: "offline-draft", user_id: owner, payload: { antwort: answer, quellen: sources,
    profilHash: B.profilHash(profile), runId } };
  const contextHash = P.hash({ profile, sources }), rule = { version: R.RULE_VERSION, reasoningEffort: "low" };
  const make = x => ({ id: A.intentHash(runId, x), ...x });
  const d = make({ phase: "D", owner, inputVersionHash: contextHash, actualRequestHash: P.hash("offline-D-request"),
    model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 });
  const r = make({ phase: "R", owner, inputVersionHash: null, actualRequestHash: null, dependsOn: d.id,
    contextVersionHash: contextHash, model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1, reviewRule: rule });
  const plan = { version: A.REVIEW_PLAN_VERSION, operationId: "synthetik500-bounded-offline-20261005", runId,
    productionCommit: "c".repeat(40), runtimeManifestHash: P.hash("fictional-runtime"),
    startsAtUTC: "2026-10-05T10:00:00.000Z", endsAtUTC: "2026-10-05T11:00:00.000Z", intents: [d, r] };
  const slot = { version: A.REVIEW_VERSION, plan, planHash: P.hash(plan), consumed: {}, draftCompletions: {},
    reviewBindings: {}, reviewBindingsHash: P.hash({}) };
  const usage = { id: "offline-usage-D", model: "gpt-5-mini", totalTokens: 12 };
  const c = { version: R.COMPLETION_VERSION, planHash: slot.planHash, operationId: plan.operationId, runId,
    dIntentId: d.id, dTicket: { id: "offline-ticket-D", day: "2026-10-05" }, owner, contextHash,
    providerResponseHash: P.hash("fictional-provider-response"), providerTextHash: P.hash("fictional-provider-text"),
    outputHash: P.hash(answer), sourceContext: { profileHash: B.profilHash(profile), sourcesHash: P.hash(sources) },
    usageReceipt: { id: usage.id, recordHash: P.hash(usage) }, costMicroUsd: 12, completedAtUTC: "2026-10-05T10:00:10.000Z" };
  c.completionHash = P.hash(c); slot.draftCompletions[d.id] = c;
  const prompt = ai.prepareLageReviewInput(answer, sources, profile).prompt;
  const body = JSON.stringify({ model: "gpt-5-mini", input: prompt, max_output_tokens: 3000, reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "knowledge_object", schema: Q.SCHEMA, strict: true } } });
  const b = { version: R.VERSION, dCompletionHash: c.completionHash, dIntentId: d.id,
    storedD: { id: entry.id, owner, runId, versionHash: P.hash(entry), outputHash: c.outputHash,
      contextHash, profileHash: c.sourceContext.profileHash, sourcesHash: c.sourceContext.sourcesHash,
      storageContractHash: P.hash("offline-storage-contract") }, rule, promptHash: P.hash(prompt),
    actualRequestHash: A.requestHash(body), bodySha256: sha(body) };
  b.bindingHash = P.hash(b); slot.reviewBindings[r.id] = b; slot.reviewBindingsHash = P.hash(slot.reviewBindings);
  const calls = {};
  for (const intent of [d, r]) {
    const ticketId = "offline-ticket-" + intent.phase, requestHash = intent.phase === "R" ? b.actualRequestHash : d.actualRequestHash;
    slot.consumed[intent.id] = { ticketId, day: "2026-10-05", consumedAtUTC: "2026-10-05T10:00:01.000Z",
      actualRequestHash: requestHash, reserved: 212000, ...(intent.phase === "R" ? { reviewBindingHash: b.bindingHash } : {}) };
    calls[ticketId] = { status: "abgerechnet", reserved: 212000, cost: 12, admission: { version: slot.version,
      planHash: slot.planHash, operationId: plan.operationId, runId, intentId: intent.id, actualRequestHash: requestHash,
      startsAtUTC: plan.startsAtUTC, endsAtUTC: plan.endsAtUTC, productionCommit: plan.productionCommit,
      phase: intent.phase, ...(intent.phase === "R" ? { reviewBindingHash: b.bindingHash } : {}) } };
  }
  const write = (name, text) => { const file = path.join(dir, name); fs.writeFileSync(file, text, { mode: 0o600 });
    return { path: file, bytes: Buffer.byteLength(text), sha256: sha(text) }; };
  return { input: { auth: { [A.KEY]: slot, llmUsage: [usage], testKostenTage: { "2026-10-05": { calls } } },
    dIntentId: d.id, rIntentId: r.id, originalCanonicalDraftPin: write("draft.json", P.kanonisch(entry)),
    actualReviewBodyPin: write("body.json", body), profile, sources, claim: { ...V.CLAIM } }, slot, calls, entry, b, write, dir };
}
function check(name, fn) { const f = fixture(); fn(f); passed++; console.log("ok " + name); }
try {
  check("consistent retained pair remains an unverified bounded claim", f => {
    const result = V.pruefe(f.input); assert.equal(result.bindingsConsistent, true);
    assert.equal(result.claim.globalImmutable, false); assert.equal(result.claim.actualExecutionVerified, false);
    assert.equal(result.claim.admissionGranted, false);
  });
  check("unknown D cost remains rejected", f => { f.calls["offline-ticket-D"].status = "unknown"; assert.throws(() => V.pruefe(f.input)); });
  check("cost exceeds reservation", f => { f.calls["offline-ticket-R"].cost = 212001; assert.throws(() => V.pruefe(f.input)); });
  check("ledger request drift", f => { f.calls["offline-ticket-R"].admission.actualRequestHash = P.hash("forged"); assert.throws(() => V.pruefe(f.input)); });
  check("duplicate usage identity", f => { f.input.auth.llmUsage.push({ ...f.input.auth.llmUsage[0] }); assert.throws(() => V.pruefe(f.input)); });
  check("usage hash drift", f => { f.input.auth.llmUsage[0].totalTokens++; assert.throws(() => V.pruefe(f.input)); });
  check("replacement draft pin does not replace the bound version", f => { f.entry.payload.antwort.paragraphs[0].text = "Fiktiver Ersatz";
    f.input.originalCanonicalDraftPin = f.write("replacement.json", P.kanonisch(f.entry)); assert.throws(() => V.pruefe(f.input)); });
  check("JSONB-style reencoding is not original canonical bytes", f => { f.input.originalCanonicalDraftPin = f.write("pretty.json", JSON.stringify(f.entry, null, 2));
    assert.throws(() => V.pruefe(f.input)); });
  check("rehashing a forged request does not prove its derivation", f => {
    const body = JSON.parse(fs.readFileSync(f.input.actualReviewBodyPin.path, "utf8")); body.input = "Forged prompt";
    const text = JSON.stringify(body); f.input.actualReviewBodyPin = f.write("forged-body.json", text);
    f.b.promptHash = P.hash(body.input); f.b.bodySha256 = sha(text); f.b.actualRequestHash = A.requestHash(text);
    const { bindingHash, ...base } = f.b; f.b.bindingHash = P.hash(base); f.slot.reviewBindingsHash = P.hash(f.slot.reviewBindings);
    f.slot.consumed[f.input.rIntentId].actualRequestHash = f.b.actualRequestHash;
    f.slot.consumed[f.input.rIntentId].reviewBindingHash = f.b.bindingHash;
    Object.assign(f.calls["offline-ticket-R"].admission, { actualRequestHash: f.b.actualRequestHash, reviewBindingHash: f.b.bindingHash });
    assert.throws(() => V.pruefe(f.input), /review-body-drift/);
  });
  check("global claim cannot be granted", f => { f.input.claim.globalImmutable = true; assert.throws(() => V.pruefe(f.input)); });
  check("wrong position replay", f => { f.input.profile.id = "test-kohorte-synthetik-bt-002"; assert.throws(() => V.pruefe(f.input)); });
  check("nonprivate original refused", f => { fs.chmodSync(f.input.originalCanonicalDraftPin.path, 0o644); assert.throws(() => V.pruefe(f.input)); });
  check("final-component symlink refused", f => { const alias = path.join(f.dir, "alias.json"); fs.symlinkSync(f.input.originalCanonicalDraftPin.path, alias);
    f.input.originalCanonicalDraftPin.path = alias; assert.throws(() => V.pruefe(f.input)); });
  check("repository ancestor through directory alias refused", f => {
    const repo = path.join(f.dir, "repo"); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, ".git")); fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    const file = path.join(repo, "draft.json"); fs.copyFileSync(f.input.originalCanonicalDraftPin.path, file); fs.chmodSync(file, 0o600);
    const alias = path.join(f.dir, "repo-alias"); fs.symlinkSync(repo, alias, "dir"); f.input.originalCanonicalDraftPin.path = path.join(alias, "draft.json");
    assert.throws(() => V.pruefe(f.input), /original-inside-repository/);
  });
  check("hardlink can expose a repository original and is refused", f => {
    const alias = path.join(f.dir, "hardlink.json"); fs.linkSync(f.input.originalCanonicalDraftPin.path, alias);
    f.input.originalCanonicalDraftPin.path = alias; assert.throws(() => V.pruefe(f.input), /private-original/);
  });
  check("bare repository ancestor refused", f => {
    fs.writeFileSync(path.join(f.dir, "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(f.dir, "config"), "[core]\n bare = true\n"); fs.mkdirSync(path.join(f.dir, "objects"));
    assert.throws(() => V.pruefe(f.input), /original-inside-repository/);
  });
  check("file larger than declared pin refused", f => {
    fs.appendFileSync(f.input.originalCanonicalDraftPin.path, " "); assert.throws(() => V.pruefe(f.input), /private-original/);
  });
  check("file growth during bounded read refused", f => {
    const originalRead = fs.readSync; let changed = false;
    fs.readSync = function (...args) {
      if (!changed) { changed = true; fs.appendFileSync(f.input.originalCanonicalDraftPin.path, " "); }
      return originalRead.apply(this, args);
    };
    try { assert.throws(() => V.pruefe(f.input), /original-drift/); } finally { fs.readSync = originalRead; }
  });
  check("location outside private workspace or tmp rejected before open", f => {
    f.input.originalCanonicalDraftPin.path = "/var/bounded-proof-must-not-be-opened.json";
    assert.throws(() => V.pruefe(f.input), /original-pin/);
  });
  console.log(passed + "/" + passed + " bounded-consumed-D countercases passed (synthetic, no Production).");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
