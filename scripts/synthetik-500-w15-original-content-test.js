"use strict";

// Pure original-data integration. Historical dates are preserved as explicit
// function arguments; no historical admission, GO or claim is executed.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
function main() {
  const guard = require.resolve("./lokaler-netzschutz"); assert(require.cache[guard], "Use scripts/lokal.js");
  assert.deepEqual(require(guard).pruefe(process.env), []);
  const manifestPath = path.resolve(process.env.HELMUT_W15_RECEIPT_MANIFEST || "");
  assert.match(manifestPath, /^\/workspace\/shared\/helmut-w15-receipt-[0-9]{8}\/reports\/W15_RECEPTION_REPORT\.SAFE\.json$/);
  assert.equal(fs.realpathSync(manifestPath), manifestPath);
  const raw = fs.readFileSync(manifestPath); assert.equal(sha(raw), process.env.HELMUT_W15_RECEIPT_SHA256);
  const receipt = JSON.parse(raw), pins = [];
  assert.equal(receipt.status, "PASS_ALL_11_FILES_COMPLETE_RECEPTION");
  assert.equal(receipt.actualFileCount, 11); assert.equal(receipt.actualPayloadBytes, 96530256);
  const filesRoot = path.resolve(path.dirname(manifestPath), "../files/helmut-parallel-20261015");
  function original(key) {
    const p = receipt.files.find(x => x.key === key); assert(p && p.status === "PASS");
    assert.equal(p.receivedPath, path.join(filesRoot, path.relative("/workspace/helmut-parallel-20261015", p.originalPath)));
    assert.equal(fs.realpathSync(p.receivedPath), p.receivedPath);
    const st = fs.lstatSync(p.receivedPath); assert(st.isFile() && !st.isSymbolicLink());
    assert.equal(st.uid, process.getuid()); assert.equal(st.mode & 0o777, 0o600);
    const b = fs.readFileSync(p.receivedPath); assert.equal(b.length, p.expectedBytes); assert.equal(sha(b), p.expectedSHA256);
    pins.push({ key, bytes: b.length, sha256: sha(b) }); return JSON.parse(b);
  }
  const rows = original("normalizedCurrentPolicy"), packet = original("package"), native = original("nativeInventoryHistoricalTemplate");
  const u = original("originalUPacket"), candidates = original("reviewedMockCandidates"), templates = original("staticMockTemplates");
  // Existing nonsecret operator config is a separate runtime input. Never
  // remove a hold or rewrite accepted original policy fields to make a test pass.
  const eligibility = require("../lib/helmut/publication-eligibility");
  const policyPath = path.resolve(process.env.HELMUT_W15_PUBLICATION_POLICY_FILE || "");
  assert.match(policyPath, /^\/workspace\/shared\/helmut-w15-development-[0-9]{8}\/publication-policy\.PRIVATE\.json$/);
  assert.equal(fs.realpathSync(policyPath), policyPath);
  const policyStat = fs.lstatSync(policyPath); assert(policyStat.isFile() && !policyStat.isSymbolicLink());
  assert.equal(policyStat.uid, process.getuid()); assert.equal(policyStat.mode & 0o777, 0o600);
  const policyRaw = fs.readFileSync(policyPath, "utf8"), policyInfo = eligibility.publicInfo(eligibility.parse(policyRaw));
  assert.equal(policyInfo?.hash, "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04");
  assert(rows.every(r => JSON.stringify(r.briefingEingabe.briefing.publicationEligibilityPolicy) === JSON.stringify(policyInfo)
    && JSON.stringify(r.briefingEingabe.eingabe.publicationEligibilityPolicy) === JSON.stringify(policyInfo)));
  process.env[eligibility.ENV] = policyRaw; // This local child only, no Vercel update.
  const P = require("../lib/helmut/synthetik-500-profile"), C = require("../lib/helmut/synthetik-500-production-command");
  const Codec = require("../lib/helmut/synthetik-500-direct-codec"), E = require("../lib/helmut/synthetik-500-executor");
  const checks = [], pass = name => { checks.push({ name, status: "PASS" }); console.log("PASS " + name); };
  const sourceBinding = require("../lib/helmut/synthetik-500-content-runner").sourceBinding();
  assert(sourceBinding.length > 64); pass("complete W15 source graph and worker pins match current development files");
  assert.equal(rows.length, 500); assert.equal(new Set(rows.map(r => r.profile.id)).size, 500);
  P.pruefePaket(packet);
  const distribution = Object.fromEntries(["bundestag", "landtag-berlin", "landtag-brandenburg"].map(k => [k, rows.filter(r => r.profile.parlament === k).length]));
  assert.deepEqual(distribution, { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
  assert(rows.every(r => r.profile.synthetisch === true && r.profile.profileActive === true));
  pass("unchanged original synthetic cohort has exactly330 Bundestag/120 Berlin/50 Brandenburg profiles");
  const checkedU = C.validate(u.command); assert.equal(u.command.mode, "U-prestage");
  assert.equal(checkedU.commandHash, P.hash(u.command));
  pass("complete original U command validates as content only; historical authority and claims are never used");
  const B = require("../lib/helmut/briefing-lagebindung"), L = require("../lib/helmut/lage");
  const ai = require("../lib/helmut/ai"), Q = require("../lib/helmut/lage-textqualitaet");
  const regional = [];
  for (const parliament of Object.keys(distribution)) {
    const row = rows.find(r => r.profile.parlament === parliament), date = new Date(row.briefingEingabe.briefing.generatedAt);
    const bound = B.pruefe(row.briefingEingabe, row.profile, row.profile.id, date, { acceptedSnapshot: true });
    const { koLite } = L.prepareDContext(bound.ranked, bound.sources, date, bound); assert(koLite.length > 0);
    const mapping = candidates.ownerMapping.find(x => x.owner === row.profile.id); assert(mapping);
    const candidate = candidates.candidates[mapping.variantIndex], template = templates.templates[mapping.variantIndex];
    assert.equal(sha(JSON.stringify(template.response)), template.binding.responseJSONSHA256);
    const review = ai.prepareLageReviewInput(candidate.draftCandidate, koLite, row.profile);
    const verdict = Q.pruefe(review.paragraphs, koLite, template.response, row.profile); assert.equal(verdict.ok, true);
    const schema = structuredClone(ai.LAGE_BRIEFING_SCHEMA); delete schema.properties.paragraphs.minItems; delete schema.properties.paragraphs.maxItems;
    const prompt = ai.buildLageBriefingPrompt(koLite, structuredClone(row.profile), { briefingDatum: date.toISOString() });
    const request = ai.responsesPayload(prompt, native.costInputs.routeContract.route.model, {
      jsonSchema: schema, jsonSchemaName: "knowledge_object", maxOutputTokens: 3000, strictJsonSchema: true, reasoningEffort: "low"
    });
    require("../lib/helmut/synthetik-500-eu-service-contract").assertPayload(request);
    assert.throws(() => B.pruefe(row.briefingEingabe, { ...row.profile, id: "foreign" }, row.profile.id, date));
    assert.equal(Q.pruefe([], koLite, template.response, row.profile).ok, false);
    regional.push({ parliament, historicalBriefingDate: date.toISOString(), originalContextSources: koLite.length,
      preparedRequestSHA256: sha(JSON.stringify(request)), mockReviewAccepted: true, actualModelOutput: false });
    pass("original briefing to D request and independently reviewed local R template: " + parliament);
  }
  // Transport the complete received500 rows. This data-only input is deliberately
  // not an executable command, admission or full-C certificate.
  const input = { package: packet, executorInputs: { version: E.DIRECT_INPUT_VERSION }, drafts: rows, predecessors: [] };
  const envelope = Codec.encode(input); assert.equal(envelope.version, Codec.DICTIONARY_VERSION);
  assert(envelope.bytes > Codec.MAX_BYTES);
  const decoded = Codec.decode(envelope); assert.equal(decoded.drafts.length, 500);
  assert.equal(P.hash(decoded), P.hash(input)); assert(Object.isFrozen(decoded) && Object.isFrozen(decoded.drafts[0].profile));
  assert.throws(() => { decoded.drafts[0].profile.fullName = "drift"; }, TypeError);
  assert.throws(() => Codec.decode({ ...envelope, dictionarySha256: "0".repeat(64) }), /codec-invalid/);
  pass("complete original input uses v2 dictionary, preserves canonical content, freezes decoded data and rejects tampering");
  const result = { schema: "helmut-w15-original-content-functional-test/1", status: "PASS", passed: checks.length, checks,
    receiptSHA256: sha(raw), originalPins: pins, publicationPolicyHash: policyInfo.hash, distribution, regional,
    transport: { version: envelope.version, expandedBytes: envelope.bytes, dictionaryBytes: envelope.dictionaryBytes,
      encodedBytes: Buffer.byteLength(JSON.stringify(envelope)), dataOnlyNotExecutableCommand: true },
    workerSourceIdentityChecked: true, workerPositiveFullCOrRestoreClaimed: false, providerCalls: 0, full500Run: false,
    historicalDatesRewritten: false, originalFilesWritten: false, productionActions: 0 };
  const output = process.argv.find(x => x.startsWith("--output="));
  if (output) {
    const p = path.resolve(output.slice(9)); assert(p.startsWith(path.dirname(manifestPath) + path.sep));
    assert.equal(fs.realpathSync(path.dirname(p)), path.dirname(p));
    fs.writeFileSync(p, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  console.log(JSON.stringify(result)); return result;
}
if (require.main === module) { try { main(); } catch (error) { console.error("W15 original content check failed: " + error.message); process.exitCode = 1; } }
module.exports = { main };
