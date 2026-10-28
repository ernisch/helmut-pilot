"use strict";

// One data-only qualification of all500 existing mocks. No HTTP provider hook,
// database, command, authority, activation, dispatcher, retry or clock override.
// Ordinary source dates and the original source inventory stay unchanged.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, ".."), EXPECTED = 500;
const RECEIPT = "/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json";
const RECEIPT_SHA = "2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1";
const POLICY = "/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json";
const POLICY_SHA = "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04";
const OUT = "/workspace/shared/helmut-w15-mock-bindings-check-20261028";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function privateBytes(filename, cap) {
  const s = fs.lstatSync(filename);
  assert(s.isFile() && !s.isSymbolicLink() && fs.realpathSync(filename) === filename,
    "w15-mock-check-original-regular-file");
  assert(s.uid === process.getuid() && (s.mode & 511) === 384 && s.size > 0 && s.size <= cap,
    "w15-mock-check-original-file-metadata");
  return fs.readFileSync(filename);
}
function save(name, value) {
  assert(/^[A-Z0-9_]+\.SAFE\.json$/.test(name));
  const b = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, name), b, { flag: "wx", mode: 0o600 });
  return { path: path.join(OUT, name), bytes: b.length, sha256: sha(b) };
}
function reasonOf(error) {
  const code = error?.grund || error?.message || error?.code;
  // Assertions can contain source text. Only bounded error codes enter reports.
  const reason = typeof code === "string" && /^[A-Za-z][A-Za-z0-9:_-]{0,179}$/.test(code)
    ? code : (error?.code === "ERR_ASSERTION" ? "ERR_ASSERTION" : "w15-mock-check-validation-error");
  return { reason, errorType: error?.name || "Error",
    ...(typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code) ? { code: error.code } : {}) };
}
function originalSourceMetadata(row) {
  const byCase = row?.briefingEingabe?.korrekturBasis?.sourcesByVorgang || {};
  const used = new Set((row?.briefingEingabe?.briefing?.items || []).map(i => i.vorgangId));
  const records = [];
  for (const [vorgangId, documents] of Object.entries(byCase)) {
    if (!used.has(vorgangId) || !Array.isArray(documents)) continue;
    for (const d of documents) records.push({ vorgangId, sourceId: d.id,
      publishedAt: d.published_at ?? null });
  }
  return records;
}
function metadataReferences(draft) {
  return (Array.isArray(draft?.paragraphs) ? draft.paragraphs : []).map((p, index) => ({
    paragraphIndex: index, vorgangIds: Array.isArray(p?.vorgang_ids) ? [...p.vorgang_ids] : [],
    quelleId: typeof p?.quelle_id === "string" ? p.quelle_id : null
  }));
}
function rejectedReferenceMetadata(record) {
  if (!Array.isArray(record.contextReferences)) return { status: "CONTEXT_NOT_OBSERVED" };
  const allowedVorgangIds = new Set(record.contextReferences.map(x => x.vorgangId));
  const ownersByQuelle = new Map();
  for (const context of record.contextReferences) for (const id of context.quelleIds) {
    const owners = ownersByQuelle.get(id) || new Set(); owners.add(context.vorgangId); ownersByQuelle.set(id, owners);
  }
  const mismatches = (record.mockReferences || []).flatMap(p => {
    const owners = ownersByQuelle.get(p.quelleId);
    const vorgangMismatch = p.vorgangIds.length !== 1 || p.vorgangIds.some(id => !allowedVorgangIds.has(id));
    const quelleVorgangMismatch = !owners || !owners.has(p.vorgangIds[0]);
    return vorgangMismatch || quelleVorgangMismatch ? [{ ...p, vorgangMismatch, quelleVorgangMismatch,
      allowedVorgangIdsForQuelleId: owners ? [...owners] : [] }] : [];
  });
  return { status: "METADATA_ONLY_NOT_A_VALIDATOR", mismatches,
    invalidQuelleIds: [...new Set(mismatches.map(p => p.quelleId).filter(id => typeof id === "string"))] };
}

function main() {
  const guard = require.resolve("./lokaler-netzschutz");
  assert(require.cache[guard], "w15-mock-check-preloaded-network-guard");
  assert.deepEqual(require(guard).pruefe(process.env), []);
  assert.equal(process.version, "v24.19.0");
  assert(!process.env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY, "w15-mock-check-no-private-key");
  assert(!process.env.SUPABASE_SERVICE_ROLE_KEY, "w15-mock-check-no-database-credential");
  assert(!process.env.AZURE_OPENAI_KEY && !process.env.AZURE_OPENAI_API_KEY && !process.env.OPENAI_API_KEY,
    "w15-mock-check-no-real-provider-credential");
  const parent = path.dirname(OUT);
  assert.equal(fs.realpathSync(parent), parent);
  fs.mkdirSync(OUT, { mode: 0o700 }); // Exclusive attempt marker; no automatic rerun/overwrite.
  save("ATTEMPT_STARTED.SAFE.json", { scope: "ONE_DATA_ONLY_ALL500_MOCK_QUALIFICATION", atUTC: new Date().toISOString(),
    databaseWrites: 0, profileActivations: 0, unitExecutions: 0, providerCalls: 0, retryAllowed: false });
  const report = { schema: "helmut-w15-all500-calendar-only-mock-bindings/1", status: "UNKNOWN",
    scope: "Original ordinary-v1 calendar-only rows, unchanged source dates/native inventory, genuine existing B/L and unchanged provider.prepare constructors; no execution authority",
    startedAtUTC: new Date().toISOString(), expectedOwners: EXPECTED, completedOwners: 0, qualifiedOwners: 0,
    failedOwners: 0, records: [], failures: [], originalPins: [], sourceCodePins: [],
    databaseWrites: 0, profileActivations: 0, unitExecutions: 0, providerCalls: 0, paidModelCalls: 0,
    sourceDatesRewritten: false, originalFilesWritten: false, globalDateReplaced: false,
    retryAllowed: false, full500RunAuthorized: false, productionApproval: false, actualModelOutput: false,
    currentProfessionalAcceptance: false };
  try {
    const rawReceipt = privateBytes(RECEIPT, 1024 * 1024);
    assert.equal(sha(rawReceipt), RECEIPT_SHA, "w15-mock-check-original-receipt-hash");
    const receipt = JSON.parse(rawReceipt);
    assert.equal(receipt.actualFileCount, 11); assert.equal(receipt.actualPayloadBytes, 96530256);
    report.originalReceiptSHA256 = RECEIPT_SHA;
    const original = key => {
      const p = receipt.files.find(x => x.key === key);
      assert(p && p.status === "PASS", "w15-mock-check-original-pin-missing");
      const b = privateBytes(p.receivedPath, 128 * 1024 ** 2);
      assert.equal(b.length, p.expectedBytes); assert.equal(sha(b), p.expectedSHA256);
      report.originalPins.push({ key, bytes: b.length, sha256: p.expectedSHA256 });
      return JSON.parse(b);
    };
    const rows = original("normalizedCurrentPolicy"), native = original("nativeInventoryHistoricalTemplate");
    const candidates = original("reviewedMockCandidates"), templates = original("staticMockTemplates");
    assert.equal(rows.length, EXPECTED); assert.equal(new Set(rows.map(r => r.profile.id)).size, EXPECTED);
    assert.equal(candidates.candidates.length, 7); assert.equal(templates.templates.length, 7);
    assert.equal(candidates.ownerMapping.length, EXPECTED);
    assert(rows.every(r => r.profile.synthetisch === true && r.briefingEingabe.version === 1));
    const policy = privateBytes(POLICY, 65536); assert.equal(sha(policy), POLICY_SHA);
    const policyStat = fs.lstatSync(POLICY);
    report.policyPin = { path: POLICY, bytes: policy.length, sha256: POLICY_SHA,
      observedAtUTC: new Date().toISOString(), fileModifiedAtUTC: policyStat.mtime.toISOString() };
    process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = policy.toString("utf8");
    const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
    const P = require("../lib/helmut/synthetik-500-profile");
    const Fresh = require("../lib/helmut/briefing-frische");
    const Calendar = require("./fixtures/w15-local-calendar");
    const B = require("../lib/helmut/briefing-lagebindung"), L = require("../lib/helmut/lage");
    const Provider = require("./fixtures/w15-unit0-provider");
    assert.equal(Fresh.relevanzTage(process.env), 14, "w15-mock-check-original14day-window-required");
    assert.equal(Fresh.vertragAktiv(process.env), true, "w15-mock-check-source-freshness-guard-required");
    const route = native.costInputs.routeContract.route;
    assert.equal(route.model, EU.CONTRACT.model); assert.equal(route.responsesUrl, EU.CONTRACT.responseURL);
    // Local dummy selection is required only for the genuine pure constructors.
    // No HTTPS hook is installed; the preloaded network guard remains in place.
    Object.assign(process.env, { AZURE_OPENAI_ENDPOINT: new URL(route.responsesUrl).origin,
      AZURE_OPENAI_KEY: "LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini-eu" });
    const executionISO = new Date().toISOString(), now = new Date(executionISO);
    report.executionISO = executionISO;
    report.sourceWindowDays = Fresh.relevanzTage(process.env);
    report.nativeInventoryHashBefore = P.hash(native);
    report.originalNativeSources = native.documents.map(x => ({ sourceId: x.id,
      publishedAt: x.version.published_at ?? null }));
    for (const relative of ["scripts/synthetik-500-w15-mock-bindings-check.js", "scripts/fixtures/w15-local-calendar.js",
      "scripts/fixtures/w15-unit0-provider.js", "lib/helmut/briefing-lagebindung.js", "lib/helmut/lage.js",
      "lib/helmut/ai.js", "lib/helmut/lage-textqualitaet.js", "lib/helmut/lage-quellenbeleg.js", "lib/helmut/briefing-frische.js"]) {
      const bytes = fs.readFileSync(path.join(ROOT, relative));
      report.sourceCodePins.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
    }
    const sorted = [...rows].sort((a, b) => a.profile.id.localeCompare(b.profile.id));
    for (let index = 0; index < EXPECTED; index++) {
      const sourceRow = sorted[index], owner = sourceRow.profile.id;
      const matches = candidates.ownerMapping.filter(x => x.owner === owner);
      const variantIndex = matches.length === 1 ? matches[0].variantIndex : null;
      const r = { index, owner, variantIndex, parliament: sourceRow.profile.parlament,
        originalSources: originalSourceMetadata(sourceRow), phases: [], status: "FAIL",
        contextCount: null, DRequest: { status: "NOT_QUALIFIED" }, RRequest: { status: "NOT_QUALIFIED" } };
      const fail = (phase, error) => {
        const failure = { index, owner, variantIndex, phase, ...reasonOf(error), sources: r.originalSources,
          mockReferences: r.mockReferences || [], contextReferences: r.contextReferences || [],
          contextObserved: Array.isArray(r.contextReferences),
          ...(phase === "unchanged-provider-prepare-B-L-AI-Q-D-R" ? { rejectedReferences: rejectedReferenceMetadata(r) } : {}) };
        r.phases.push({ phase, status: "FAIL", reason: failure.reason }); report.failures.push(failure);
      };
      let row, context, candidate, template;
      try {
        assert.equal(matches.length, 1, "w15-mock-check-owner-mapping-cardinality");
        assert(Number.isInteger(variantIndex) && variantIndex >= 0 && variantIndex < 7,
          "w15-mock-check-variant-range");
        candidate = candidates.candidates[variantIndex]; template = templates.templates[variantIndex];
        assert(candidate && template && template.variantIndex === variantIndex, "w15-mock-check-variant-template-binding");
        r.variantKey = candidate.key;
        r.mockReferences = metadataReferences(candidate.draftCandidate);
        r.phases.push({ phase: "owner-variant-binding", status: "PASS" });
      } catch (e) { fail("owner-variant-binding", e); }
      try {
        const originalSourcesHash = P.hash(sourceRow.sources);
        const rebound = Calendar.rebindOrdinaryRow(sourceRow, executionISO);
        row = rebound.row;
        assert.equal(P.hash(row.sources), originalSourcesHash, "w15-mock-check-source-data-changed");
        assert.equal(P.hash(row.briefingEingabe.korrekturBasis.sourcesByVorgang),
          P.hash(sourceRow.briefingEingabe.korrekturBasis.sourcesByVorgang), "w15-mock-check-correction-sources-changed");
        r.calendar = { changedPaths: rebound.report.changedPaths, originalRowHash: rebound.report.originalRowHash,
          derivedRowHash: rebound.report.derivedRowHash, originalSourcesHash };
        r.phases.push({ phase: "calendar-only-original-B-A-F", status: "PASS" });
      } catch (e) { fail("calendar-only-original-B-A-F", e); }
      if (row) {
        try {
          const bound = B.pruefe(row.briefingEingabe, row.profile, owner, now, { acceptedSnapshot: true });
          assert(!bound.historicalSnapshot, "w15-mock-check-no-historical-source-fallback");
          context = L.prepareDContext(bound.ranked, bound.sources, now, bound).koLite;
          r.contextCount = context.length;
          r.contextReferences = context.map(v => ({ vorgangId: v.vorgang_id,
            quelleIds: (v.quellenbelege || []).map(q => q.quelle_id) }));
          r.phases.push({ phase: "genuine-B-L-current-context", status: "PASS", contextCount: context.length });
          if (!context.length) {
            r.DRequest = { status: "NOT_CONSTRUCTIBLE", reason: "no-current-d-context" };
            r.RRequest = { status: "NOT_CONSTRUCTIBLE", reason: "no-current-d-context" };
          }
        } catch (e) { fail("genuine-B-L-current-context", e); }
        if (candidate && template) {
          try {
            // This existing function owns every B/L/AI/Q check and both genuine
            // responses constructors. No new B/R helper or substituted verdict.
            const prepared = Provider.prepare({ row, model: route.model, candidate, template,
              responsesURL: route.responsesUrl });
            assert(context?.length > 0, "w15-mock-check-provider-context-disagreement");
            r.DRequest = { status: "PASS", bodySHA256: prepared.requestBodySHA256,
              outputSHA256: prepared.draftOutputSHA256 };
            r.RRequest = { status: "PASS", bodySHA256: prepared.reviewRequestBodySHA256,
              outputSHA256: prepared.reviewOutputSHA256 };
            r.phases.push({ phase: "unchanged-provider-prepare-B-L-AI-Q-D-R", status: "PASS" });
          } catch (e) {
            fail("unchanged-provider-prepare-B-L-AI-Q-D-R", e);
            if (r.RRequest.status !== "NOT_CONSTRUCTIBLE") r.RRequest = {
              status: "NOT_QUALIFIED", reason: reasonOf(e).reason,
              note: "Existing pre-R/quality/constructor path rejected; no R request was qualified." };
          }
        }
      } else {
        r.DRequest = { status: "NOT_CONSTRUCTIBLE", reason: "calendar-binding-rejected" };
        r.RRequest = { status: "NOT_CONSTRUCTIBLE", reason: "calendar-binding-rejected" };
      }
      r.status = r.phases.every(p => p.status === "PASS") && r.DRequest.status === "PASS"
        && r.RRequest.status === "PASS" ? "PASS" : "FAIL";
      report.records.push(r); report.completedOwners++;
      if (r.status === "PASS") report.qualifiedOwners++; else report.failedOwners++;
    }
    report.nativeInventoryHashAfter = P.hash(native);
    assert.equal(report.nativeInventoryHashAfter, report.nativeInventoryHashBefore, "w15-mock-check-native-mutated");
    assert.equal(report.records.length, EXPECTED); assert.equal(report.completedOwners, EXPECTED);
    report.contextEmptyOwners = report.records.filter(r => r.contextCount === 0).length;
    report.summaryByVariant = candidates.candidates.map((c, variantIndex) => {
      const selected = report.records.filter(r => r.variantIndex === variantIndex);
      return { variantIndex, variantKey: c.key, owners: selected.length,
        qualified: selected.filter(r => r.status === "PASS").length,
        failed: selected.filter(r => r.status !== "PASS").length,
        emptyCurrentContext: selected.filter(r => r.contextCount === 0).length };
    });
    report.status = report.qualifiedOwners === EXPECTED ? "PASS_ALL500_CURRENT_UNCHANGED_MOCK_BINDINGS"
      : "FAIL_ALL500_COMPLETED_NOT_ALL_CURRENT_BINDINGS_QUALIFIED";
  } catch (error) {
    report.status = "FAIL_OR_UNKNOWN_QUALIFICATION_PREREQUISITE";
    report.prerequisiteFailure = reasonOf(error);
  } finally {
    for (const key of ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT"])
      delete process.env[key];
  }
  report.completedAtUTC = new Date().toISOString();
  const result = save("ALL500_MOCK_BINDINGS_CHECK.SAFE.json", report);
  console.log(JSON.stringify({ status: report.status, completedOwners: report.completedOwners,
    qualifiedOwners: report.qualifiedOwners, failedOwners: report.failedOwners, result }));
  if (report.status !== "PASS_ALL500_CURRENT_UNCHANGED_MOCK_BINDINGS") process.exitCode = 1;
  return report;
}

if (require.main === module) main();
module.exports = { main };
