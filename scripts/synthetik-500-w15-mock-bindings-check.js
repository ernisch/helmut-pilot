"use strict";

// One data-only qualification of all500 bindings after two current original sources. No HTTP provider hook,
// command, authority, activation, dispatcher, retry or clock override.
// Only the new isolated preparation DB receives the two original-source fixtures; genuine HTTP reads qualify candidates.
// Original files and old source dates stay unchanged; only derived local source/KO/mock selections change.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, ".."), EXPECTED = 500;
const RECEIPT = "/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json";
const RECEIPT_SHA = "2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1";
const POLICY = "/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json";
const POLICY_SHA = "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04";
const DATA = "/workspace/shared/helmut-w15-current-source-update-20261028";
const OUT = DATA + "/qualification-b";
const PREP_DB = "helmut_w15_source_bindings_20261028";
const LOCAL_CONFIG = "/tmp/w15-publication-bindings-20261028/configuration.PRIVATE.json";
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
  assert(/^[A-Z0-9_]+\.(?:SAFE|PRIVATE)\.json$/.test(name));
  const b = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, name), b, { flag: "wx", mode: 0o600 });
  return { path: path.join(OUT, name), bytes: b.length, sha256: sha(b) };
}
function reasonOf(error) {
  const code = error?.grund || error?.message || error?.code;
  // Assertions can contain source text. Only bounded error codes enter reports.
  const reason = typeof code === "string" && /^[A-Za-z][A-Za-z0-9:_/.~-]{0,179}$/.test(code)
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

async function main() {
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
  save("ATTEMPT_STARTED.SAFE.json", { scope: "ONE_ISOLATED_ORIGINAL_SOURCE_AND_ALL500_MOCK_QUALIFICATION", atUTC: new Date().toISOString(),
    databaseWrites: "ONLY_NEW_ISOLATED_PREPARATION_DATABASE", originalDatabaseWrites: 0, profileActivations: 0, unitExecutions: 0, providerCalls: 0, retryAllowed: false });
  const report = { schema: "helmut-w15-all500-current-original-mock-bindings/2", status: "UNKNOWN",
    scope: "Ordinary-v1 current local source/KO selections and explicit manual B/A/F mock review, genuine unchanged B/L/AI/Q/D/R; actual-day14day source window; no execution authority",
    startedAtUTC: new Date().toISOString(), expectedOwners: EXPECTED, completedOwners: 0, qualifiedOwners: 0,
    failedOwners: 0, records: [], failures: [], originalPins: [], sourceCodePins: [],
    databaseWrites: "ONLY_NEW_ISOLATED_PREPARATION_DATABASE", originalDatabaseWrites: 0,
    profileActivations: 0, unitExecutions: 0, providerCalls: 0, paidModelCalls: 0,
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
    const Current = require("./fixtures/w15-current-input-bindings");
    const CurrentMocks = require("./fixtures/w15-current-mock-data");
    const CurrentNative = require("./fixtures/w15-current-native-data");
    const B = require("../lib/helmut/briefing-lagebindung"), L = require("../lib/helmut/lage");
    const Provider = require("./fixtures/w15-full500-provider");
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
    assert.equal(executionISO.slice(0, 10), "2026-10-28", "w15-current-qualified-actual-test-day");
    report.sourceWindowDays = Fresh.relevanzTage(process.env);
    const evidenceFiles = ["BERLIN_TAX_20261023.SOURCE_NORMALIZATION.PRIVATE.json",
      "BT_HOUSING_20261016.SOURCE.PRIVATE.json", "MANUAL_SOURCE_REVIEW.SAFE.json"];
    const evidence = evidenceFiles.map(name => {
      const bytes = privateBytes(path.join(DATA, name), 64 * 1024);
      return { value: JSON.parse(bytes), pin: { path: path.join(DATA, name), bytes: bytes.length, sha256: sha(bytes) } };
    });
    report.currentSourceEvidencePins = evidence.map(e => e.pin);
    const sourceEvidence = { BE: evidence[0].value, BT: evidence[1].value };
    for (const [scope, filename, expected] of [["BE", "BERLIN_TAX_20261023.ORIGINAL.html", sourceEvidence.BE.originalHTMLSHA256],
      ["BT", "BT_HOUSING_20261016.ORIGINAL.html", sourceEvidence.BT.htmlSHA256]]) {
      const bytes = privateBytes(path.join(DATA, filename), 512 * 1024);
      assert.equal(sha(bytes), expected, "w15-current-source-original-html-hash");
      report.currentSourceEvidencePins.push({ scope, path: path.join(DATA, filename), bytes: bytes.length, sha256: expected });
    }
    const fixtureWindowStart = "2026-10-16T00:00:00.000Z";
    const witnessPin = save("MANUAL_CURATED_U0_SCOPE.SAFE.json", {
      scope: "EXPLICIT_MANUAL_OFFLINE_FIXTURE_NOT_NATIVE_UNDERSTANDING_OR_MODEL_REVIEW",
      observedAtUTC: executionISO, sourceEvidencePins: report.currentSourceEvidencePins,
      manualSourceReviewBy: "required_data_audit; separate Root original HTML/excerpt/content review",
      sourcePublicationDatesUnchanged: true, newLocalManualSourceAndKOSelection: true,
      sourceContent: { BE: "Forecast31.3/32.4bn2026/2027 and attributed economic uncertainty; no realized receipts or committee role",
        BT: "Greens social-housing/stock-conversion proposal and attributed permitting diagnosis; no8OctPDF numbers" },
      existingLocalManualU0ContractReused: true, nativeUnderstandingAcceptance: false,
      paidModelCalls: 0, executionAuthority: false, productionAcceptance: false,
      briefingReadingWindow: { start: fixtureWindowStart, end: executionISO,
        kind: "EXPLICIT_LOCAL_CURATED_TEST_READING_WINDOW_NOT_TODAY_NEWS_OR_NATIVE_MORNING_RECEIPT" },
      actualDay14DaySourceGuardUnchanged: true });
    const manualReviewEvidence = { reference: evidence[2].pin.path, sha256: evidence[2].pin.sha256 };
    const curatedCoverageWitness = { reference: witnessPin.path, sha256: witnessPin.sha256 };
    const bindings = Current.createBindings({ sourceEvidence, manualReviewEvidence, executionISO, fixtureWindowStart });
    const derivedNative = CurrentNative.deriveNative(native, bindings.nativeReplacements, curatedCoverageWitness);
    const config = JSON.parse(privateBytes(LOCAL_CONFIG, 64 * 1024));
    assert.equal(config.database, PREP_DB, "w15-current-isolated-preparation-database");
    assert.equal(new URL(config.url).hostname, "127.0.0.1", "w15-current-loopback-postgrest-only");
    const Database = require("./fixtures/w15-current-input-database"), { spawnSync } = require("node:child_process");
    const sql = text => {
      const p = spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", PREP_DB, "-f", "-"], {
        input: text, encoding: "utf8", timeout: 25000, maxBuffer: 1024 * 1024,
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
      assert.equal(p.status, 0, "w15-current-isolated-fixture-sql"); return p.stdout.trim();
    };
    sql(Database.installSQL(bindings.nativeReplacements));
    const postimage = JSON.parse(sql("begin read only;set local statement_timeout='15s';"
      + Database.postimageSQL(bindings.nativeReplacements) + "rollback;"));
    const sortedById = list => [...list].sort((a,b)=>a.id.localeCompare(b.id));
    assert.equal(postimage.active, 0, "w15-current-preparation-must-stay-zero");
    assert.equal(P.hash(postimage.documents), P.hash(sortedById(bindings.nativeReplacements.map(r => r.document))),
      "w15-current-original-source23-postimage-drift");
    assert.equal(P.hash(postimage.knowledgeObjects), P.hash(sortedById(bindings.nativeReplacements.map(r => r.knowledgeObject))),
      "w15-current-manual-ko60-postimage-drift");
    const expectedLinks = bindings.nativeReplacements.map(r => ({ knowledge_object_id: r.knowledgeObject.id,
      raw_document_id: r.document.id })).sort((a,b)=>a.knowledge_object_id.localeCompare(b.knowledge_object_id));
    assert.equal(P.hash(postimage.links), P.hash(expectedLinks), "w15-current-complete-source-link-postimage-drift");
    report.currentNativeReplacementsPin = save("CURRENT_NATIVE_REPLACEMENTS.PRIVATE.json", bindings.nativeReplacements);
    report.originalSourceAndKOReadback = { status: "PASS_COMPLETE_NATIVE23_KO60_AND_LINK_POSTIMAGES", database: PREP_DB,
      activeProfiles: 0, insertedNewOriginalDocuments: 2, insertedExplicitManualKOs: 2, insertedSourceLinks: 2,
      source23Hash: P.hash(postimage.documents), ko60Hash: P.hash(postimage.knowledgeObjects), linksHash: P.hash(postimage.links) };
    Object.assign(process.env, { SUPABASE_URL: config.url, SUPABASE_SERVICE_ROLE_KEY: config.serviceToken,
      HELMUT_STORAGE_BACKEND: "supabase" });
    const storage = require("../lib/helmut/storage");
    report.publicationQualification = await bindings.qualifyPublications(storage);
    const preparedRows = [], preparedFixtures = [], derivationReports = [];
    report.nativeDerivation = derivedNative.report;
    report.briefingReadingWindow = { start: fixtureWindowStart, end: executionISO,
      scope: "EXPLICIT_LOCAL_FIXTURE_NOT_CURRENT_MORNING_NEWS_ACCEPTANCE" };
    report.nativeInventoryHashBefore = P.hash(native);
    report.originalNativeSources = native.documents.map(x => ({ sourceId: x.id,
      publishedAt: x.version.published_at ?? null }));
    for (const relative of ["scripts/synthetik-500-w15-mock-bindings-check.js", "scripts/fixtures/w15-local-calendar.js",
      "scripts/fixtures/w15-unit0-provider.js", "scripts/fixtures/w15-full500-provider.js",
      "scripts/fixtures/w15-current-input-bindings.js", "scripts/fixtures/w15-current-mock-data.js",
      "scripts/fixtures/w15-current-native-data.js", "scripts/fixtures/w15-current-input-database.js",
      "lib/helmut/storage.js", "lib/helmut/publication-eligibility.js", "lib/helmut/radarState.js",
      "lib/helmut/briefingContract.js", "lib/helmut/briefing-lagebindung.js", "lib/helmut/lage.js",
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
        const failure = { index, owner, variantIndex, phase, ...reasonOf(error), sources: r.currentSources || r.originalSources,
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
      if (!r.phases.some(p => p.status === "FAIL")) try {
        const rebound = bindings.deriveRow(sourceRow);
        row = rebound.row;
        r.derivation = rebound.report;
        r.currentSources = originalSourceMetadata(row);
        assert.equal(P.hash(row.profile), P.hash(sourceRow.profile), "w15-current-original-profile-drift");
        assert.equal(P.hash(row.sources.documents.slice().sort((a,b)=>a.id.localeCompare(b.id))),
          P.hash(derivedNative.native.documents.map(d=>d.version).sort((a,b)=>a.id.localeCompare(b.id))),
          "w15-current-native-document-selection-drift");
        assert.equal(P.hash(row.sources.knowledgeObjects.slice().sort((a,b)=>a.id.localeCompare(b.id))),
          P.hash(derivedNative.native.knowledgeObjects.map(k=>k.version).sort((a,b)=>a.id.localeCompare(b.id))),
          "w15-current-native-ko-selection-drift");
        r.phases.push({ phase: "current-source-bindings-constructed", status: "PASS" });
      } catch (e) { fail("current-source-bindings-constructed", e); }
      if (row && !r.phases.some(p => p.status === "FAIL")) {
        try {
          const bound = B.pruefe(row.briefingEingabe, row.profile, owner, now, { acceptedSnapshot: true });
          assert(!bound.historicalSnapshot, "w15-mock-check-no-historical-source-fallback");
          context = L.prepareDContext(bound.ranked, bound.sources, now, bound).koLite;
          r.contextCount = context.length;
          r.contextReferences = context.map(v => ({ vorgangId: v.vorgang_id,
            quelleIds: (v.quellenbelege || []).map(q => q.quelle_id) }));
          r.phases.push({ phase: "genuine-current-B-A-F-L-context", status: "PASS", contextCount: context.length });
          assert(context.length > 0, "w15-current-no-qualifiable-context");
        } catch (e) { fail("genuine-current-B-A-F-L-context", e); }
        if (candidate && template && !r.phases.some(p => p.status === "FAIL")) {
          try {
            // This existing function owns every B/L/AI/Q check and both genuine
            // responses constructors. No new B/R helper or substituted verdict.
            if ([4, 6].includes(variantIndex)) {
              const fresh = CurrentMocks[variantIndex === 4 ? "createVariant4" : "createVariant6"]({
                profile: row.profile, context, sourceEvidence: sourceEvidence[variantIndex === 4 ? "BE" : "BT"] });
              candidate = fresh.candidate; template = fresh.template; r.newManualMockBinding = fresh.report;
              r.mockReferences = metadataReferences(candidate.draftCandidate);
            }
            const prepared = Provider.prepare({ index, row, model: route.model, candidate, template,
              responsesURL: route.responsesUrl });
            assert(context?.length > 0, "w15-mock-check-provider-context-disagreement");
            r.DRequest = { status: "PASS", bodySHA256: prepared.requestBodySHA256,
              outputSHA256: prepared.draftOutputSHA256 };
            r.RRequest = { status: "PASS", bodySHA256: prepared.reviewRequestBodySHA256,
              outputSHA256: prepared.reviewOutputSHA256 };
            r.phases.push({ phase: "unchanged-provider-prepare-B-L-AI-Q-D-R", status: "PASS" });
            preparedRows.push(row); preparedFixtures.push(prepared); derivationReports.push(r.derivation);
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
      if (r.status === "PASS") report.qualifiedOwners++; else {
        report.failedOwners++; report.stoppedAtFirstFailure = true; break;
      }
    }
    report.nativeInventoryHashAfter = P.hash(native);
    assert.equal(report.nativeInventoryHashAfter, report.nativeInventoryHashBefore, "w15-mock-check-native-mutated");
    assert.equal(report.records.length, report.completedOwners);
    report.contextEmptyOwners = report.records.filter(r => r.contextCount === 0).length;
    report.summaryByVariant = candidates.candidates.map((c, variantIndex) => {
      const selected = report.records.filter(r => r.variantIndex === variantIndex);
      return { variantIndex, variantKey: c.key, owners: selected.length,
        qualified: selected.filter(r => r.status === "PASS").length,
        failed: selected.filter(r => r.status !== "PASS").length,
        emptyCurrentContext: selected.filter(r => r.contextCount === 0).length };
    });
    report.status = report.qualifiedOwners === EXPECTED ? "PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS"
      : "FAIL_FIRST_CURRENT_BINDING_NO_RETRY";
    if (report.qualifiedOwners === EXPECTED) {
      assert.equal(preparedRows.length, 500); assert.equal(preparedFixtures.length, 500);
      report.qualifiedAssets = {
        rows: save("QUALIFIED_ROWS.PRIVATE.json", preparedRows),
        fixtures: save("QUALIFIED_MOCK_FIXTURES.PRIVATE.json", preparedFixtures),
        native: save("QUALIFIED_NATIVE.PRIVATE.json", derivedNative),
        derivations: save("QUALIFIED_DERIVATIONS.PRIVATE.json", derivationReports)
      };
      report.qualifiedAssetsPinned = true;
    }
  } catch (error) {
    report.status = "FAIL_OR_UNKNOWN_QUALIFICATION_PREREQUISITE";
    report.prerequisiteFailure = reasonOf(error);
  } finally {
    for (const key of ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
      delete process.env[key];
  }
  report.completedAtUTC = new Date().toISOString();
  const result = save("ALL500_MOCK_BINDINGS_CHECK.SAFE.json", report);
  console.log(JSON.stringify({ status: report.status, completedOwners: report.completedOwners,
    qualifiedOwners: report.qualifiedOwners, failedOwners: report.failedOwners, result }));
  if (report.status !== "PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS") process.exitCode = 1;
  return report;
}

if (require.main === module) main().catch(() => { process.exitCode = 1; console.error("w15-current-qualification-unhandled-prerequisite"); });
module.exports = { main };
