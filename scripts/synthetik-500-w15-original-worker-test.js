"use strict";

// One real full-content worker over the historical W15 seven-document/six-KO
// ordinary-v1 originals. Only inert runtime/config metadata is constructed in
// memory at a fixed historical test clock. No dispatch, authority or DB writes.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks"), vm = require("node:vm"), { createRequire } = require("node:module");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
const POLICY_SHA = "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04";
const ROOT = path.resolve(__dirname, ".."), HISTORICAL_NOW = Date.parse("2026-10-16T10:01:00.000Z");
const startedAt = performance.now(), progress = [];
function stage(name, details = {}) {
  const entry = { stage: name, elapsedMs: performance.now() - startedAt, atUTC: new Date().toISOString(),
    parentRssBytes: process.memoryUsage().rss, ...details };
  progress.push(entry); console.log(JSON.stringify({ w15WorkerProgress: entry }));
}
function outputPath() {
  const option = process.argv.find(x => x.startsWith("--output=")), argument = option && option.slice(9);
  const configured = process.env.HELMUT_W15_TEST_OUTPUT;
  if (argument && configured) assert.equal(path.resolve(argument), path.resolve(configured), "Conflicting report paths");
  const output = argument || configured; if (!output) return null;
  const manifest = path.resolve(process.env.HELMUT_W15_RECEIPT_MANIFEST || "");
  assert.match(manifest, /^\/workspace\/shared\/helmut-w15-receipt-[0-9]{8}\/reports\/W15_RECEPTION_REPORT\.SAFE\.json$/);
  const file = path.resolve(output); assert(file.startsWith(path.dirname(manifest) + path.sep));
  assert.equal(fs.realpathSync(path.dirname(file)), path.dirname(file));
  return file;
}
function writeReport(result) {
  const file = outputPath(); if (!file) return false;
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return true;
}
function privateBytes(file, inside) {
  assert(path.resolve(file).startsWith(inside + path.sep));
  assert.equal(fs.realpathSync(file), path.resolve(file));
  const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, process.getuid()); assert.equal(s.mode & 0o777, 0o600);
  return fs.readFileSync(file);
}
function archive(file, bytes, expectedSHA256) {
  assert.match(file || "", /^\/workspace\/attachments\/.+\.zip$/); assert.equal(fs.realpathSync(file), path.resolve(file));
  const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink());
  const b = fs.readFileSync(file); assert.equal(b.length, bytes); assert.equal(sha(b), expectedSHA256); return file;
}
function zipMember(file, member) {
  const r = spawnSync("python3", ["-I", "-S", "-B", "-c",
    "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", file, member], {
    timeout: 15000, maxBuffer: 128 * 1024, env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(r.status, 0, "Verified historical helper archive member unavailable"); return r.stdout;
}
function historicalHelpers(originalPacketPin) {
  const file = archive(process.env.HELMUT_W15_HELPER_ARCHIVE_FILE, 269598,
    "c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15");
  const supplement = archive(process.env.HELMUT_W15_ACCEPTANCE_ARCHIVE_FILE, 8511,
    "186f0bba83cecdebf093ad4a3dfbbce48e25d0fd89e90c66e27a96e044c72503");
  const manifest = JSON.parse(zipMember(file, "MANIFEST.json")), pins = [];
  const source = name => {
    const found = manifest.files.filter(x => x.sourcePath.endsWith("/native-end-preparation/" + name)); assert.equal(found.length, 1);
    const pin = found[0], bytes = zipMember(file, pin.archivePath); assert.equal(bytes.length, pin.bytes); assert.equal(sha(bytes), pin.sha256);
    pins.push({ name, bytes: bytes.length, sha256: sha(bytes) }); return bytes.toString("utf8");
  };
  const load = (text, localRequire, name) => {
    const m = { exports: {} };
    vm.runInThisContext("(function(require,module,exports,__dirname){" + text + "\n})", { filename: "verified-W15-helper/" + name })(
      localRequire, m, m.exports, __dirname); return m.exports;
  };
  const localRequire = createRequire(__filename), contracts = load(source("contracts.js"), localRequire, "contracts.js");
  // Keep the original window checks with their explicit historical-clock arg.
  // Rebase only module lookup and the checked U-file pin to this receiving repo.
  const G = { ...contracts, ROOT, checkWindow: (window, constructed) => contracts.checkWindow(window, constructed, new Date(HISTORICAL_NOW)) };
  G.pinned(originalPacketPin);
  const requireHelper = name => name === "./contracts" ? G : localRequire(name);
  const builder = load(source("build-command.js"), requireHelper, "build-command.js");
  const draft = load(source("original-draft-request.js"), requireHelper, "original-draft-request.js");
  const approvalBytes = zipMember(supplement, "original-metadata/ROOT_ALL500_CONTENT_ACCEPTANCE.PRIVATE.json");
  assert.equal(approvalBytes.length, 2701); assert.equal(sha(approvalBytes), "44b39d511667a085d040f1246617f263ddd62988bccdc906fe273a5dcbd909de");
  return { build: builder.build, prepareDraft: draft.prepare, approval: JSON.parse(approvalBytes), pins,
    acceptanceSHA256: sha(approvalBytes), historicalClock: new Date(HISTORICAL_NOW).toISOString() };
}
async function main() {
  stage("preflight", { nodeVersion: process.version,
    parentExperimentalTestCoverageFlag: process.execArgv.includes("--experimental-test-coverage"),
    parentV8CoverageDirectoryConfigured: Boolean(process.env.NODE_V8_COVERAGE) });
  const report = outputPath(); assert(report, "Set HELMUT_W15_TEST_OUTPUT or --output for first-failure preservation");
  assert(!fs.existsSync(report), "Report already exists; preserve first result and use a new explicit output path");
  const guard = require.resolve("./lokaler-netzschutz"); assert(require.cache[guard], "Use scripts/lokal.js");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.deepEqual(require(guard).pruefe(process.env), []);
  assert.equal(process.env.HELMUT_SYNTHETIK500_PG_ISOLIERT, "JA");
  const container = process.env.HELMUT_SYNTHETIK500_PG_CONTAINER, database = process.env.HELMUT_W15_PG_DATABASE;
  assert.match(container || "", /^synthetik500-runtime-pg-[a-f0-9]{8,16}$/);
  assert.match(database || "", /^helmut_w15_input_[0-9]{8}(?:_[a-f0-9]{8})?$/);
  const dataRoot = path.resolve(process.env.HELMUT_W15_DATA_ROOT || "");
  assert.match(dataRoot, /^\/workspace\/shared\/helmut-w15-receipt-[0-9]{8}\/files\/helmut-parallel-20261015$/);
  assert.equal(fs.realpathSync(dataRoot), dataRoot);
  const receiptRoot = path.dirname(path.dirname(dataRoot)), receiptPath = process.env.HELMUT_W15_RECEIPT_MANIFEST;
  assert.equal(path.resolve(receiptPath || ""), path.join(receiptRoot, "reports/W15_RECEPTION_REPORT.SAFE.json"));
  assert.match(process.env.HELMUT_W15_RECEIPT_SHA256 || "", /^[a-f0-9]{64}$/);
  const receiptBytes = privateBytes(receiptPath, receiptRoot); assert.equal(sha(receiptBytes), process.env.HELMUT_W15_RECEIPT_SHA256);
  const receipt = JSON.parse(receiptBytes); assert.equal(receipt.status, "PASS_ALL_11_FILES_COMPLETE_RECEPTION");
  assert.equal(receipt.actualFileCount, 11); assert.equal(receipt.actualPayloadBytes, 96530256);
  const dump = receipt.files.find(x => x.key === "frozenSourceDump"), cap = receipt.files.find(x => x.key === "readOnlyCapture");
  assert(dump && cap && dump.status === "PASS" && cap.status === "PASS");
  for (const pin of [dump, cap]) {
    assert.equal(pin.receivedPath, path.join(dataRoot, path.relative("/workspace/helmut-parallel-20261015", pin.originalPath)));
    const b = privateBytes(pin.receivedPath, dataRoot); assert.equal(b.length, pin.expectedBytes); assert.equal(sha(b), pin.expectedSHA256);
  }
  assert.equal(dump.expectedSHA256, "06c6f37c7189dd166641d867809d42424f5c44618ab5cf6974939057ad61025c");
  const capture = JSON.parse(privateBytes(cap.receivedPath, dataRoot));
  const originalPins = [], original = key => {
    const pin = receipt.files.find(x => x.key === key); assert(pin && pin.status === "PASS");
    assert.equal(pin.receivedPath, path.join(dataRoot, path.relative("/workspace/helmut-parallel-20261015", pin.originalPath)));
    const b = privateBytes(pin.receivedPath, dataRoot); assert.equal(b.length, pin.expectedBytes); assert.equal(sha(b), pin.expectedSHA256);
    originalPins.push({ key, bytes: b.length, sha256: sha(b) }); return JSON.parse(b);
  };
  const normalizedRows = original("normalizedCurrentPolicy"), packet = original("package");
  const native = original("nativeInventoryHistoricalTemplate"), originalU = original("originalUPacket");
  assert.equal(normalizedRows.length, 500); assert.equal(native.documents.length, 7); assert.equal(native.knowledgeObjects.length, 6);
  assert(normalizedRows.every(x => x.briefingEingabe.version === 1 && x.sources.documents.length === 7
    && x.sources.knowledgeObjects.length === 6 && !Object.hasOwn(x, "briefingDatum")));
  const policyPath = path.resolve(process.env.HELMUT_W15_PUBLICATION_POLICY_FILE || "");
  assert.match(policyPath, /^\/workspace\/shared\/helmut-w15-development-[0-9]{8}\/publication-policy\.PRIVATE\.json$/);
  const policyBytes = privateBytes(policyPath, path.dirname(policyPath));
  assert.equal(policyBytes.length, 493); assert.equal(sha(policyBytes), POLICY_SHA); JSON.parse(policyBytes);
  const policy = policyBytes.toString("utf8");
  assert(process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON === undefined || process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON === policy,
    "Existing publication policy conflicts with pinned original policy");
  process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON = policy;
  const inspect = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", container], {
    encoding: "utf8", timeout: 15000, env: { PATH: process.env.PATH }, maxBuffer: 1024 * 1024
  });
  assert.equal(inspect.status, 0, "Isolated container inspection failed");
  const info = JSON.parse(inspect.stdout)[0]; assert.equal(info.State.Running, true);
  assert.equal(info.Config.Image, "postgres:17.6-bookworm"); assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert(info.Mounts.every(x => x.Type === "volume" && x.Destination === "/var/lib/postgresql/data"));
  function sql(text, role = "postgres") {
    assert(["postgres", "service_role"].includes(role));
    const r = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
      "psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", "-"], {
      input: "begin read only;set local statement_timeout='15s';set local lock_timeout='2s';set local role " + role + ";" + text + "\nrollback;",
      encoding: "utf8", timeout: 20000, maxBuffer: 20 * 1024 * 1024,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8" }, stdio: ["pipe", "pipe", "pipe"]
    });
    assert.equal(r.status, 0, "Private original SQL read failed (row data suppressed)"); return JSON.parse(r.stdout.trim());
  }
  const digest = (table, order) => "(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)order by " + order
    + ")::text,'null'),'UTF8')),'hex')from " + table + " t)";
  const state = () => sql("select jsonb_build_object('database',current_database(),'serverVersion',current_setting('server_version_num'),"
    + "'profiles',(select count(*)from mandate_profiles),'active',(select count(*)from mandate_profiles where aktiv),"
    + "'identities',(select count(*)from profiles),'storeRows',(select count(*)from helmut_store),'profileHash',"
    + digest("mandate_profiles", 'user_id collate "C"') + ",'identityHash'," + digest("profiles", 'id collate "C"')
    + ",'storeHash'," + digest("helmut_store", 'id collate "C"') + ",'counterHash'," + digest("llm_budget_counters", 'day,scope collate "C"')
    + ",'authHash',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id='main-auth'));" );
  const before = state(); assert.equal(before.database, database); assert.equal(before.serverVersion, "170006");
  for (const k of ["profiles", "active", "profileHash", "identityHash"]) assert.equal(before[k], capture.before[k]);
  assert.equal(before.identities, 501); assert.equal(before.storeRows, 6);
  stage("before-original-profile-and-auth-read");
  const source = sql("select jsonb_build_object('mandates',(select jsonb_agg(to_jsonb(p)order by user_id collate \"C\")from mandate_profiles p),"
    + "'profiles',(select jsonb_agg(to_jsonb(p)order by id collate \"C\")from profiles p),'auth',(select data from helmut_store where id='main-auth'),"
    + "'counter16',(select coalesce(sum(used),0)from llm_budget_counters where scope='global'and day='2026-10-16'));" );
  assert.equal(source.mandates.length, 500); assert.equal(source.profiles.length, 501); assert.equal(source.counter16, 0);
  stage("after-original-profile-and-auth-read");
  const P = require("../lib/helmut/synthetik-500-profile"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
  const Budget = require("../lib/helmut/testkosten-budget"), V = require("../lib/helmut/synthetik-500-vertrag");
  const packageHash = P.hash(packet); assert.equal(P.hash(P.erzeuge({ variante: packet.generator.variante })), packageHash);
  const packageBytes = P.serialisiere(packet), operationId = "synthetik500-w15-content-only-20261016";
  const observed = new Date(HISTORICAL_NOW - 1000).toISOString(), startUTC = new Date(HISTORICAL_NOW).toISOString();
  const endUTC = new Date(HISTORICAL_NOW + 600000).toISOString(), day = startUTC.slice(0, 10);
  // The source remains active and untouched. Only this clearly modeled, inert
  // content fixture has an in-memory inactive snapshot and historical clock.
  const snapshot = { beobachtetAm: observed, mandate_profiles: source.mandates.map(x => ({ ...x, aktiv: false })), profiles: source.profiles };
  const auth = structuredClone(source.auth), journalHash = P.hash(auth.synthetik500DispatchJournal);
  assert.equal(Budget.historie(auth, day, 0), 0); assert(!Object.hasOwn(auth[Budget.KEY], day));
  auth[Budget.KEY][day] = { version: EU.DAY_VERSION, day, tarif: EU.RATE_ID, limit: EU.DAY_MICRO_USD,
    serviceContractHash: EU.HASH, spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
  auth[Budget.AUFTRAG_KEY].bookCapacity = Object.keys(auth[Budget.KEY]).length;
  auth[Budget.AUFTRAG_KEY].runDayUTC = day;
  assert.equal(P.hash(auth.synthetik500DispatchJournal), journalHash);
  const financing = Budget.pruefeStart(auth, day, { ok: true, used: 0 }), order = Budget.auftragsStand(auth, day);
  const spent = auth[Budget.KEY][day].spent, reserved = Math.round(financing.offeneReserveUsd * 1e6);
  const costs = { tag: day, beobachtetAm: observed, tageslimitMikroUsd: EU.DAY_MICRO_USD, auftragslimitMikroUsd: EU.ORDER_MICRO_USD,
    tagVerbrauchtMikroUsd: spent, tagReserviertMikroUsd: reserved, auftragVerbrauchtMikroUsd: order.gebundenMicroUsd,
    auftragReserviertMikroUsd: 0, restreserveMikroUsd: Math.min(EU.DAY_MICRO_USD - spent - reserved, EU.ORDER_MICRO_USD - order.gebundenMicroUsd),
    laufreserveMikroUsd: EU.RUN_MAX_MICRO_USD };
  const manifest = V.vorbereiten({ paketBytes: packageBytes, snapshot, operationId, vorflugAm: observed,
    startBis: new Date(HISTORICAL_NOW + 180000).toISOString(), endeAm: endUTC, kosten: costs, serviceContractHash: EU.HASH });
  // Reuse the public fixture's external-evidence SCHEMA only. These modeled
  // metadata are explicitly neither fresh observations nor operator approvals.
  const full = require("./realkohorte-500-runtime-test").belegFixture({ manifest });
  full.technik = { ...full.phaseA, art: "synthetik-technische-zugriffssperren-kommunikation-snapshot-rueckweg" }; delete full.phaseA;
  for (const key of ["technik", "fach"]) {
    full[key].paketHash = packet.bindung.paketHash; full[key].idsHash = packet.bindung.idsHash; full[key].entschiedenAm = observed;
    full[key].aussteller = "OFFLINE CONTENT FIXTURE; NOT A CURRENT APPROVAL";
    full[key].qualifikation = "Modeled schema input only; no Production or operator verdict";
  }
  for (const key of ["production", "ruhe", "kosten", "landesversorgung"]) full[key].beobachtetAm = observed;
  full.production.laufzeit.testKosten = Budget.konfiguration({ VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT: EU.HASH });
  full.kosten.auth = auth; full.kosten.counter = { ok: true, used: 0 }; full.ruhe.authHash = P.hash(auth);
  full.landesversorgung.nachrichtenfenster.bisTag = day; full.landesversorgung.berlin.publikationstag = day;
  const { endwaechter, ...belege } = full;
  const runtimeManifest = require("./synthetik-500-start-sql").erzeugeStartSql(packageBytes).baueRuntimeManifest(
    { manifest, snapshot, belege }, packageBytes, HISTORICAL_NOW);
  const productionCommit = full.production.productionCommit, route = structuredClone(native.costInputs.routeContract);
  route.runtimeManifestHash = P.hash(runtimeManifest); route.route.productionCommit = productionCommit;
  route.route.deploymentId = full.production.deploymentId; route.route.deploymentHost = "helmut-w15-offline-content.vercel.app";
  route.management.validFromUTC = startUTC; route.management.validUntilUTC = endUTC;
  for (const purpose of ["rootAdmission", "management", "serviceContext", "price"]) {
    const bytes = Buffer.from(JSON.stringify({ scope: "OFFLINE_CONTENT_METADATA_NOT_AUTHORITY", purpose, startsAtUTC: startUTC, endsAtUTC: endUTC }));
    route.management.evidencePins[purpose] = { name: "offline-content-" + purpose, bytes: bytes.length, sha256: sha(bytes) };
  }
  assert.equal(route.route.model, EU.CONTRACT.model);
  // Nonsecret model selection only; no Azure key, endpoint or sender is enabled.
  process.env.HELMUT_UNDERSTANDING_MODEL = route.route.model;
  assert.deepEqual(require(guard).pruefe(process.env), []);
  const uPin = receipt.files.find(x => x.key === "originalUPacket"), originalPacketPin = { path: uPin.receivedPath, bytes: uPin.expectedBytes, sha256: uPin.expectedSHA256 };
  const helpers = historicalHelpers(originalPacketPin), oldOperation = originalU.command.slot.plan.operationId;
  const oldJournal = source.auth.synthetik500DispatchJournal.operations[oldOperation]; assert(oldJournal, "Original U journal reference unavailable");
  const prior = { predecessor: { operationId: oldOperation, commandHash: P.hash(originalU.command), planHash: originalU.command.slot.planHash,
    journalHash: P.hash(oldJournal) }, originalPacketPin, originalJournalHash: P.hash(oldJournal) };
  const config = { selector: { operationId }, runId: "nachlauf500-" + HISTORICAL_NOW, constructedAtUTC: observed,
    window: { startsAtUTC: startUTC, endsAtUTC: endUTC } };
  // Exactly as the original W15 assembler: add a separate execution-date field;
  // preserve all received profile/source/briefing/verdict bytes and timestamps.
  const rows = normalizedRows.map(x => ({ ...x, briefingDatum: startUTC }));
  const preparationStart = performance.now(); stage("before-historical-W15-pure-command-build", { profiles: 500, documents: 7, knowledgeObjects: 6 });
  let built = helpers.build({ approval: helpers.approval, config, paket: packet, rows, native,
    runtime: { runtimeManifest, snapshot, productionCommit, briefingFensterStart: "2026-10-13T00:00:00.000Z" }, routeContract: route, prior,
    prepareDraft: row => helpers.prepareDraft(row, route, native.routeId) });
  assert.equal(built.claims.executionAuthorized, false); assert.equal(built.packet.admission, null); assert.equal(built.packet.testAuthority, null);
  assert(built.command.drafts.every(x => x.briefingEingabe.version === 1 && x.sources.documents.length === 7 && x.sources.knowledgeObjects.length === 6));
  const originalByOwner = new Map(normalizedRows.map(row => [row.profile.id, row]));
  for (const draft of built.command.drafts) {
    const originalRow = originalByOwner.get(draft.profile.id); assert(originalRow);
    for (const field of ["profile", "briefingEingabe", "sources"]) assert.equal(draft[field], originalRow[field]);
    assert.equal(draft.briefingDatum, startUTC);
  }
  assert.equal(P.hash(auth.synthetik500DispatchJournal), journalHash);
  assert.equal(built.command.executor.startrecht, false); assert.equal(built.command.executor.productionReady, false);
  const commandHash = built.commandHash; assert.equal(commandHash, P.hash(built.command));
  stage("after-historical-W15-pure-command-build", { commandHash, preparedRequests: built.preparedRequests.length });
  const Codec = require("../lib/helmut/synthetik-500-direct-codec"), runner = require("../lib/helmut/synthetik-500-content-runner");
  const sourceBinding = runner.sourceBinding(); stage("before-original-command-encode");
  let envelope = Codec.encode(built.packet); assert.equal(envelope.version, Codec.DICTIONARY_VERSION);
  const dataText = JSON.stringify(envelope), storedSHA256 = sha(dataText);
  assert(Buffer.byteLength(dataText) <= 16 * 1024 * 1024);
  const content = { operationId, commandHash, profiles: built.command.drafts.length, units: built.command.units.length,
    intents: built.command.slot.plan.intents.length, positions: built.command.executor.erwartetePositionen.length,
    inputDocuments: 7, inputKnowledgeObjects: 6, briefingInputVersion: 1, encodedVersion: envelope.version,
    expandedBytes: envelope.bytes, dictionaryBytes: envelope.dictionaryBytes, dictionarySHA256: envelope.dictionarySha256,
    expandedInsertionOrderSHA256: envelope.sha256, historicalWindow: config.window };
  assert.equal(content.intents, 1000); assert.equal(content.positions, 1500); assert.equal(content.units, 500);
  built = null; envelope = null;
  const metadataPreparationMs = performance.now() - preparationStart, started = performance.now();
  stage("before-real-worker-full-C", { timeoutMs: 90000, metadataPreparationMs, expandedBytes: content.expandedBytes });
  const answer = await runner.validateStoredContent({ dataText, storedSHA256, operationId, commandHash }, 90000);
  const workerWallMs = performance.now() - started;
  stage("after-real-worker-full-C", { workerWallMs });
  assert.equal(answer.ok, true); assert.equal(answer.mode, "full"); assert.equal(answer.commandHash, commandHash);
  assert.equal(answer.operationId, operationId); assert.equal(answer.storedSHA256, storedSHA256);
  assert.equal(answer.packet.admission, null); assert.equal(answer.packet.testAuthority, null);
  assert.equal(answer.packet.command.drafts.length, 500); assert.equal(answer.packet.command.units.length, 500);
  assert.equal(answer.diagnostics.bootQualified, true); assert.equal(answer.diagnostics.sealed, true);
  assert.equal(answer.diagnostics.commandCalls, 1); assert.equal(answer.diagnostics.enteredCount, 0);
  assert.equal(answer.diagnostics.qualifiedFalseCount, 1); assert.equal(answer.diagnostics.lastFailure, "unsupported-command-dispatch");
  assert.equal(answer.diagnostics.codecEnteredCount, 1); assert.equal(answer.facts.contextPresent, true);
  assert.equal(runner.sourceBinding(), sourceBinding); const after = state(); assert.deepEqual(after, before);
  const result = { schema: "helmut-w15-original-closed-worker-functional-test/1", status: "PASS", receiptSHA256: sha(receiptBytes),
    dumpSHA256: dump.expectedSHA256, publicationPolicySHA256: POLICY_SHA, container, database,
    scenario: "ACTUAL_W15_NORMALIZED_7_DOCUMENTS_6_KOS_ORDINARY_V1", originalPins, originalPackageCanonicalHash: packageHash,
    helperSourcePins: helpers.pins, historicalAcceptanceSHA256: helpers.acceptanceSHA256,
    encodedContent: { bytes: Buffer.byteLength(dataText), sha256: storedSHA256, installedInDatabase: false },
    modeledRuntimeMetadata: { scope: "INERT_HISTORICAL_CONTENT_FIXTURE_NOT_CURRENT_PRODUCTION_EVIDENCE", historicalClock: helpers.historicalClock,
      snapshotActiveOverrideOnlyInMemory: true, observedSourceActiveProfiles: before.active, mockDayBookAddedOnlyInMemory: day,
      existingJournalAndClaimsUnchangedInMemory: true, externalEvidenceSchema: "public belegFixture; modeled only", actualRuntimeOrBudgetApprovalClaimed: false },
    content, metadataPreparationMs, workerWallMs, progress, workerDiagnostics: answer.diagnostics, workerPhases: answer.phases, facts: answer.facts,
    before, after, originalStateUnchanged: true, realClosedWorkerFullC: true, originalCanonicalCommandHashVerified: true,
    receivedProfileBriefingAndSourceObjectsPreserved: true, originalBriefingGeneratedAtRewritten: false,
    modeledExecutionDateAddedAsSeparateField: startUTC, admissionOrTestAuthorityPresent: false, executionRightsIssued: false,
    storedBackendPrepareOrOpenQualified: false, HTTPOrPostgRESTQualified: false, full500DispatchRun: false,
    profileActivations: 0, providerCalls: 0, databaseWrites: 0, productionActions: 0,
    resourceAcceptanceClaimed: false, workerV8CoverageClaimed: false,
    scope: "ONE_ACTUAL_ORIGINAL_PINNED_WORKER_FULL_C_ONLY; NO_AUTHORITY_INSTALLATION_OR_UNIT_DISPATCH" };
  writeReport(result);
  console.log(JSON.stringify(result)); return result;
}
if (require.main === module) main().catch(error => {
  const failure = { schema: "helmut-w15-original-closed-worker-functional-test/1", status: "FAIL",
    reason: error.message, workerPhases: error.phases || null, workerDiagnostics: error.diagnostics || null,
    progress, noAutomaticRetry: true, full500DispatchRun: false, providerCalls: 0, databaseWrites: 0 };
  let reportPreserved = false;
  try { reportPreserved = writeReport(failure); } catch { /* Never overwrite an earlier result. Log sanitized evidence below. */ }
  console.error(JSON.stringify({ w15WorkerFailure: failure, reportPreserved }));
  console.error("Original W15 closed-worker content check failed: " + error.message); process.exitCode = 1;
});
module.exports = { main };
