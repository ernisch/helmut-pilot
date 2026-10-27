"use strict";

// Private original-data integration, explicitly excluded from automatic suites.
// Actual application, Ed25519, HTTP, PostgREST, SQL and runtime guards; no
// security doubles or clock replacement. Derived calendar/review bindings and
// local deployment/approval metadata are TEST FIXTURES, never Production GO.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), http = require("node:http"), vm = require("node:vm");
const { spawnSync, fork } = require("node:child_process"), { performance } = require("node:perf_hooks");
const ROOT = path.resolve(__dirname, ".."), CONTAINER = "synthetik500-runtime-pg-7e1c20261027";
const SOURCE_DB = "helmut_w15_input_20261027", DB = "helmut_w15_chain_20261027_d";
const WORK = "/workspace/shared/helmut-w15-signed-chain-20261027";
const RECEIPT = "/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json";
const RECEIPT_HASH = "2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1";
const PUB = "HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY", PRIV = "HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY";
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const literal = x => "'" + String(x).replaceAll("'", "''") + "'", json = x => literal(JSON.stringify(x)) + "::jsonb";
const stages = [], checks = [], start = performance.now();
function stage(name, extra = {}) { const x = { name, elapsedMs: performance.now() - start,
  observedAtUTC: new Date().toISOString(), parentRssBytes: process.memoryUsage().rss, ...extra };
  stages.push(x); console.log(JSON.stringify({ stage: x })); }
function pass(name, evidence = {}) { checks.push({ name, status: "PASS", ...evidence }); console.log("PASS " + name); }
function privateFile(file) { const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, process.getuid()); assert.equal(s.mode & 0o777, 0o600); return fs.readFileSync(file); }
function retain(name, value) { const file = path.join(WORK, name), b = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  fs.writeFileSync(file, b, { flag: "wx", mode: 0o600 }); return { path: file, bytes: b.length, sha256: sha(b) }; }
function sql(text, database = DB) {
  assert([DB, SOURCE_DB].includes(database));
  const r = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", CONTAINER,
    "psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", "-"], {
    input: text, encoding: "utf8", timeout: 25000, maxBuffer: 24 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
  if (r.status !== 0) throw Error((r.stderr || "").match(/(?:real500|synthetik500|w15)-[a-z0-9-]+/)?.[0] || "w15-isolated-sql-failed");
  return r.stdout.trim();
}
const read = (text, database = DB) => JSON.parse(sql("begin read only;set local statement_timeout='15s';" + text + "rollback;", database));
function state(database) { return read("select jsonb_build_object('database',current_database(),"
  + "'profiles',(select count(*)from mandate_profiles),'active',(select count(*)from mandate_profiles where aktiv),"
  + "'identities',(select count(*)from profiles),'storeRows',(select count(*)from helmut_store),"
  + "'profileHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),"
  + "'storeHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from helmut_store p));", database); }
function originals() { const raw = privateFile(RECEIPT); assert.equal(sha(raw), RECEIPT_HASH);
  const m = JSON.parse(raw); assert.equal(m.actualFileCount, 11); assert.equal(m.actualPayloadBytes, 96530256);
  return key => { const p = m.files.find(x => x.key === key); assert(p && p.status === "PASS");
    const b = privateFile(p.receivedPath); assert.equal(b.length, p.expectedBytes); assert.equal(sha(b), p.expectedSHA256);
    return { value: JSON.parse(b), pin: { path: p.receivedPath, bytes: b.length, sha256: sha(b) } }; };
}
function localEnvironment(config) {
  assert(new URL(config.url).hostname === "127.0.0.1");
  for (const name of ["OPENAI_API_KEY", "AZURE_OPENAI_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"])
    assert(!process.env[name], "Provider credentials must be stripped by lokal.js");
  Object.assign(process.env, { SUPABASE_URL: config.url, SUPABASE_SERVICE_ROLE_KEY: config.serviceToken,
    HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: config.storeId || "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", HELMUT_V3_STORE: "on", HELMUT_PROFILE_DB_MODE: "1",
    HELMUT_PROFILE_DB_EXCLUSIVE: "1", HELMUT_SOURCE_MODE: "off", VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: config.commit, VERCEL_URL: config.host, VERCEL_DEPLOYMENT_ID: config.deploymentId,
    HELMUT_ADMIN_SECRET: config.adminSecret, HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
    HELMUT_MAX_LLM_CALLS_PER_DAY: "2416", HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT: config.euHash, HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL: config.renewalHash,
    HELMUT_PUBLICATION_ELIGIBILITY_JSON: config.policy, HELMUT_UNDERSTANDING_MODEL: "gpt-5-mini-eu", [PUB]: config.publicKey });
}
async function serve() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  const config = JSON.parse(privateFile(process.env.HELMUT_W15_LOCAL_CONFIG)); localEnvironment(config);
  assert(!process.env[PRIV]);
  const S = require("../lib/helmut/storage"), C = require("../lib/helmut/synthetik-500-production-command");
  const server = http.createServer(require("../server"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.send({ type: "ready", port: server.address().port });
  process.on("message", async message => {
    if (message.type === "close") { server.closeAllConnections(); server.close(() => process.exit(0)); return; }
    try {
      const result = await S.withSynthetik500PreparedCommand(message.selector, async () => {
        const packet = await S.loadSynthetik500ProductionCommand(message.selector.operationId, message.selector.commandHash);
        await C.validateStored(packet); await C.admitStored(packet);
        if (message.type === "activation-guard") {
          await require("../lib/helmut/synthetik-500-production-adapter").directRuntime(packet.command);
          throw Error("w15-inactive-runtime-unexpectedly-admitted");
        }
        if (message.type === "journal-claim") {
          const J = require("../lib/helmut/synthetik-500-dispatch-journal");
          await S.mutateAuthStore(auth => J.claim(auth, message.selector.commandHash, message.claimId, new Date().toISOString()));
          return { claimed: true, unitEntered: false };
        }
        if (message.type === "journal-stop") {
          const J = require("../lib/helmut/synthetik-500-dispatch-journal");
          await S.mutateAuthStore(auth => J.stop(auth, message.selector.commandHash, "local-test-end-no-unit-dispatch"));
          return { stopped: true, unitEntered: false };
        }
        return { runtime: await S.readSynthetik500Runtime(packet.command), diagnostics: S.synthetik500PreparedDiagnostics(),
          maxRSSBytes: process.resourceUsage().maxRSS * 1024, privateSigningKeyPresent: Boolean(process.env[PRIV]) };
      });
      process.send({ type: "result", id: message.id, result });
    } catch (error) { process.send({ type: "error", id: message.id, reason: error.message }); }
  });
}
async function childServer(configPin) {
  const child = fork(__filename, ["--serve"], { env: { PATH: process.env.PATH, LANG: "C.UTF-8",
    HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local", HELMUT_W15_LOCAL_CONFIG: configPin.path },
    execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const pending = new Map(); let sequence = 0;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("w15-local-server-start-timeout")), 10000);
    child.on("message", message => {
      if (message.type === "ready") { clearTimeout(timer); resolve(message.port); return; }
      const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); clearTimeout(waiter.timer);
      if (message.type === "error") waiter.reject(Error(message.reason)); else waiter.resolve(message.result);
    });
    child.once("exit", code => { clearTimeout(timer); reject(Error("w15-local-server-exited-" + code));
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("w15-local-server-exited")); } pending.clear(); });
  });
  return { port: await ready, request(selector, type = "runtime", extra = {}) { return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error("w15-local-runtime-timeout")); }, 90000);
    pending.set(id, { resolve, reject, timer }); child.send({ type, id, selector, ...extra }); }); },
    async close() { if (child.exitCode !== null) return; child.send({ type: "close" });
      await new Promise(resolve => { const timer = setTimeout(() => child.kill("SIGTERM"), 2000);
        child.once("exit", () => { clearTimeout(timer); resolve(); }); }); } };
}

function originalBuilder() {
  const archive = "/workspace/attachments/1ba8d4a9-bf54-4cbe-b89b-2fb3f2b7518b/HELMUT_HANDOFF_20261016_MINIMAL.zip";
  const bytes = fs.readFileSync(archive); assert.equal(bytes.length, 269598);
  assert.equal(sha(bytes), "c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15");
  const member = name => { const r = spawnSync("python3", ["-I", "-S", "-B", "-c", "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", archive, name], {
    maxBuffer: 1024 * 1024, timeout: 10000, env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(r.status, 0); return r.stdout; };
  const manifest = JSON.parse(member("MANIFEST.json")), pins = [];
  function source(name) { const p = manifest.files.find(x => x.sourcePath.endsWith("/native-end-preparation/" + name));
    const b = member(p.archivePath); assert.equal(b.length, p.bytes); assert.equal(sha(b), p.sha256); pins.push({ name, bytes: b.length, sha256: sha(b) }); return b.toString("utf8"); }
  const load = (text, req, name) => { const m = { exports: {} };
    vm.runInThisContext("(function(require,module,exports,__dirname){" + text + "\n})", { filename: name })(req, m, m.exports, __dirname); return m.exports; };
  const today = new Date().toISOString().slice(0, 10), contractsText = source("contracts.js");
  assert.equal(contractsText.split("'2026-10-16'").length - 1, 2);
  const contracts = { ...load(contractsText.replaceAll("'2026-10-16'", JSON.stringify(today)), require, "local-current-date-contracts"), ROOT };
  const req = name => name === "./contracts" ? contracts : require(name), builderText = source("build-command.js");
  const old = "assert.equal(row.briefingDatum.slice(0,10),'2026-10-16');";
  assert.equal(builderText.split(old).length - 1, 1);
  const builder = load(builderText.replace(old, "assert.equal(row.briefingDatum.slice(0,10),config.window.startsAtUTC.slice(0,10));"), req, "local-current-date-builder");
  const draft = load(source("original-draft-request.js"), req, "original-draft-request");
  return { build: builder.build, prepareDraft: draft.prepare, sourcePins: pins,
    scope: "DERIVED_LOCAL_TEST_ASSEMBLER: three obsolete fixture date literals rebound; real checkWindow/Date and application guards unchanged" };
}

async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.version, "v24.19.0");
  const beforeSource = state(SOURCE_DB); assert.equal(beforeSource.active, 500); assert.equal(beforeSource.storeRows, 6);
  assert.deepEqual({ ...state(DB), database: SOURCE_DB }, beforeSource,
    "Test target must be a new pristine copy; never rerun against a prior test state");
  const creds = JSON.parse(privateFile(path.join(WORK, "transport/credentials.PRIVATE.json")));
  assert.equal(creds.database, DB);
  const get = originals(), packet = get("package").value, originalRows = get("normalizedCurrentPolicy").value;
  const native = get("nativeInventoryHistoricalTemplate").value, oldU = get("originalUPacket");
  const policy = privateFile("/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json").toString("utf8");
  assert.equal(sha(policy), "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04");
  const keys = crypto.generateKeyPairSync("ed25519"), publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const P = require("../lib/helmut/synthetik-500-profile"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
  assert.equal(EU.HASH, "78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f");
  const tunnel = await require("./fixtures/w15-postgrest-tunnel").start({ container: CONTAINER });
  const gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: tunnel.port });
  const config = { ...creds, url: gateway.url, publicKey, policy, euHash: EU.HASH, renewalHash: EU.ORDER_RENEWAL_HASH,
    commit: crypto.createHash("sha1").update("ISOLATED_TEST_BUILD:" + require("../lib/helmut/synthetik-500-content-runner").sourceBinding()).digest("hex"),
    host: "helmut-w15-local-integration.vercel.app", deploymentId: "dpl_W15LocalIntegrationNotProduction" };
  localEnvironment(config); process.env[PRIV] = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  let app;
  try {
    const K = require("../lib/helmut/testkosten-budget"), C = require("../lib/helmut/synthetik-500-production-command");
    const I = require("../lib/helmut/synthetik-500-import"), J = require("../lib/helmut/synthetik-500-dispatch-journal");
    stage("rebind-current-calendar-originals", { rows: originalRows.length });
    const changedPaths = new Set(), day = new Date().toISOString().slice(0, 10), temporaryDate = new Date().toISOString();
    const rows = originalRows.map(row => { const x = require("./fixtures/w15-local-calendar").rebindOrdinaryRow(row, temporaryDate);
      x.report.changedPaths.forEach(p => changedPaths.add(p)); return x.row; });
    assert.equal(rows.length, 500); pass("derived calendar fixture preserves original content/profile/source/verdict texts", { changedPaths: [...changedPaths] });
    sql("begin;set local statement_timeout='15s';update public.mandate_profiles set aktiv=false where aktiv;commit;");
    let source = read("select jsonb_build_object('mandates',(select jsonb_agg(to_jsonb(p)order by user_id collate \"C\")from mandate_profiles p),"
      + "'profiles',(select jsonb_agg(to_jsonb(p)order by id collate \"C\")from profiles p),"
      + "'auth',(select data from helmut_store where id='main-auth'),'main',(select data from helmut_store where id='main'));" );
    assert(source.mandates.every(x => !x.aktiv));
    const auth = structuredClone(source.auth), originalBooks = structuredClone(auth[K.KEY]);
    for (let ms = Date.parse(EU.CONTRACT.orderSinceUTC); ms <= Date.parse(day); ms += 86400000) {
      const d = new Date(ms).toISOString().slice(0, 10);
      auth[K.KEY][d] ||= { version: EU.DAY_VERSION, day: d, tarif: EU.RATE_ID, limit: EU.DAY_MICRO_USD,
        serviceContractHash: EU.HASH, spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
    }
    Object.assign(auth[K.AUFTRAG_KEY], { version: EU.ORDER_RENEWAL.orderVersion, orderRenewalHash: EU.ORDER_RENEWAL_HASH,
      bookCapacity: Object.keys(auth[K.KEY]).length, runDayUTC: day });
    for (const [d, b] of Object.entries(originalBooks)) assert.deepEqual(auth[K.KEY][d], b);
    K.pruefeStart(auth, day, { ok: true, used: 0 });
    sql("begin;update helmut_store set data=" + json(auth) + " where id='main-auth';commit;");
    const now = Date.now(), observed = new Date(now - 1000).toISOString(), end = new Date(now + 600000).toISOString();
    const operationId = "synthetik500-w15-signed-local-" + now;
    const snapshot = { beobachtetAm: observed, mandate_profiles: source.mandates, profiles: source.profiles };
    const ids = packet.profile.map(x => x.mandatsId), wanted = new Set(ids);
    const receipt = { version: "helmut-synthetik500-import/1", operationId, ...I.projizierteBindung(packet),
      zustand: "inaktiv-importiert", profiles: source.profiles.filter(x => wanted.has(x.id)), mandate_profiles: source.mandates };
    sql("begin;insert into helmut_store(id,data)values(" + literal("synthetik500-import-" + operationId) + "," + json(receipt) + ");commit;");
    const daily = K.pruefeStart(auth, day, { ok: true, used: 0 }), order = K.auftragsStand(auth, day);
    const reserved = Math.round(daily.offeneReserveUsd * 1e6), spent = auth[K.KEY][day].spent;
    const costs = { tag: day, beobachtetAm: observed, tageslimitMikroUsd: EU.DAY_MICRO_USD, auftragslimitMikroUsd: EU.ORDER_MICRO_USD,
      tagVerbrauchtMikroUsd: spent, tagReserviertMikroUsd: reserved, auftragVerbrauchtMikroUsd: order.gebundenMicroUsd,
      auftragReserviertMikroUsd: 0, restreserveMikroUsd: Math.min(EU.DAY_MICRO_USD - spent - reserved, EU.ORDER_MICRO_USD - order.gebundenMicroUsd),
      laufreserveMikroUsd: EU.RUN_MAX_MICRO_USD };
    const bytes = P.serialisiere(packet), V = require("../lib/helmut/synthetik-500-vertrag");
    const manifest = V.vorbereiten({ paketBytes: bytes, snapshot, operationId, vorflugAm: observed,
      startBis: new Date(now + 180000).toISOString(), endeAm: end, kosten: costs, serviceContractHash: EU.HASH });
    const full = require("./realkohorte-500-runtime-test").belegFixture({ manifest });
    full.technik = { ...full.phaseA, art: "synthetik-technische-zugriffssperren-kommunikation-snapshot-rueckweg" }; delete full.phaseA;
    for (const k of ["technik", "fach"]) Object.assign(full[k], { paketHash: packet.bindung.paketHash, idsHash: packet.bindung.idsHash,
      entschiedenAm: observed, aussteller: "ISOLATED LOCAL TEST FIXTURE NOT PRODUCTION APPROVAL" });
    for (const k of ["production", "ruhe", "kosten", "landesversorgung"]) full[k].beobachtetAm = observed;
    Object.assign(full.production, { mainCommit: config.commit, productionCommit: config.commit, deploymentId: config.deploymentId });
    full.production.laufzeit.commit = config.commit;
    full.production.laufzeit.testKosten = K.konfiguration(process.env);
    full.kosten.auth = auth; full.kosten.counter = { ok: true, used: 0 };
    full.ruhe.authHash = P.hash(auth); full.ruhe.mainHash = P.hash(source.main);
    full.landesversorgung.productionCommit = config.commit; full.landesversorgung.nachrichtenfenster.bisTag = day;
    full.landesversorgung.berlin.publikationstag = day;
    const { endwaechter, ...belege } = full, G = require("./synthetik-500-start-sql").erzeugeStartSql(bytes);
    const runtimeManifest = G.baueRuntimeManifest({ manifest, snapshot, belege }, bytes, Date.now());
    const prepare = { runtimeManifest, snapshot, belege, schritt: "vorbereiten", aktivierungsGo: null };
    stage("install-real-prepared0-runtime"); sql(G.baueSql(prepare, bytes, Date.now()));
    pass("real native runtime prepared0 installed without activation");
    const constructedAtUTC = new Date().toISOString(), route = structuredClone(native.costInputs.routeContract);
    Object.assign(route, { runtimeManifestHash: P.hash(runtimeManifest), orderRenewalHash: EU.ORDER_RENEWAL_HASH });
    Object.assign(route.route, { productionCommit: config.commit, deploymentId: config.deploymentId, deploymentHost: config.host });
    Object.assign(route.management, { validFromUTC: constructedAtUTC, validUntilUTC: end });
    const startsAtUTC = new Date(Date.parse(constructedAtUTC) + 1).toISOString();
    const currentConfig = { selector: { operationId }, runId: "nachlauf500-" + Date.now(), constructedAtUTC,
      window: { startsAtUTC, endsAtUTC: end } };
    rows.forEach(row => { row.briefingDatum = constructedAtUTC; });
    const oldOperation = oldU.value.command.slot.plan.operationId, oldJournal = auth[J.KEY].operations[oldOperation]; assert(oldJournal);
    const prior = { predecessor: { operationId: oldOperation, commandHash: P.hash(oldU.value.command), planHash: oldU.value.command.slot.planHash,
      journalHash: P.hash(oldJournal) }, originalPacketPin: oldU.pin, originalJournalHash: P.hash(oldJournal) };
    const builder = originalBuilder(), historicalRows = new Map(originalRows.map(row => {
      assert(!Object.hasOwn(row, "briefingDatum"));
      const originalDay = row.briefingEingabe.eingabe.tag;
      assert.equal(originalDay, "2026-10-16");
      return [row.profile.id, { ...row, briefingDatum: originalDay + "T10:01:00.000Z" }];
    }));
    // The original v1 sources are too old for today's D sender. Prove that
    // rejection, then reconstruct historical request bytes from unchanged
    // originals ONLY as a protocol
    // fixture. Current descriptor hashes and historical request hashes are
    // distinct bindings; their semantic equivalence is expressly NOT claimed.
    let rejectedCurrentOwner = null, currentPreflights = 0;
    for (const row of rows) {
      currentPreflights++;
      try { builder.prepareDraft(row, route, native.routeId); }
      catch (error) { assert.match(error.message, /koLite.length>0/); rejectedCurrentOwner = row.profile.id; break; }
    }
    assert(rejectedCurrentOwner, "Expected known current source-context rejection");
    const requestFixture = { historicalRequestFixture: true, currentDPreflightRejected: true,
      currentSenderQualified: false, historicalRequestsReconstructedWithActualOriginalPreparer: true,
      reusedHistoricalRequestBytesClaimed: false, currentPreflights, rejectedCurrentOwner,
      historicalRequestDates: [...new Set([...historicalRows.values()].map(row => row.briefingDatum))],
      currentDescriptorDate: constructedAtUTC, historicalRequestHashes: [] };
    pass("current original-v1 D preflight correctly rejects expired source context", {
      currentDPreflightRejected: true, currentSenderQualified: false });
    stage("build-current-signed-protocol-command-with-historical-request-fixture");
    let built = builder.build({ approval: { status: "ACCEPTED_ALL500_ORDINARY_V1_AND_ACTUAL_NATIVE_BINDING", actualNativeInputEquality: true,
      positiveBoundOrdinaryVerdicts: 500, scope: "FRESH LOCAL TEST DATA APPROVAL ONLY; NO PRODUCTION OR EXECUTION" }, config: currentConfig,
      paket: packet, rows, native, runtime: { runtimeManifest, snapshot, productionCommit: config.commit,
        briefingFensterStart: "2026-10-13T00:00:00.000Z" }, routeContract: route, prior,
      prepareDraft: row => { const original = historicalRows.get(row.profile.id);
        const result = builder.prepareDraft(original, route, native.routeId);
        requestFixture.historicalRequestHashes.push({ owner: row.profile.id, originalBriefingDatum: original.briefingDatum,
          requestBodySHA256: sha(result.requestBody) }); return result; } });
    const Codec = require("../lib/helmut/synthetik-500-direct-codec"), selector = { operationId, commandHash: built.commandHash };
    const encoded = Codec.encode(built.packet), commandPin = retain("current-command.PRIVATE.json", encoded);
    sql("begin;insert into helmut_store(id,data)values(" + literal("synthetik500-command-" + operationId) + "," + json(encoded) + ");commit;");
    built = null; source = null;
    const S = require("../lib/helmut/storage"); stage("actual-signed-backend-prepare");
    const prepared = await S.prepareSynthetik500StoredCommand(selector);
    assert.equal(prepared.executionAuthorized, false); pass("actual prepare fullC/native readback/Ed25519 proof", { metrics: prepared.metrics });
    const primaryPin = retain("local-approval.PRIVATE.json", { scope: "ISOLATED W15 SIGNED CHAIN ONLY", operatorInstruction: "2026-10-27 local test approvals/signatures, simulated costs, zero provider calls", selector,
      activatedProfiles: 0, full500DispatchAuthorized: false, productionApproval: false, originalReceiptSHA256: RECEIPT_HASH });
    const issued = new Date().toISOString(), testGo = { version: "helmut-synthetik500-test-go/1", operationId,
      productionCommit: config.commit, deploymentId: config.deploymentId, planHash: encoded.command?.slot?.planHash,
      paketHash: packet.bindung.paketHash, startsAtUTC, endsAtUTC: end, authorizedAtUTC: issued,
      authorizationReference: "LOCAL_FIXTURE_ONLY_NO_PRODUCTION_OR_500_DISPATCH:" + primaryPin.sha256,
      confirmation: "SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST" };
    // command may be dictionary-encoded; obtain the exact immutable content in
    // the genuine installation context instead of retaining a second big graph.
    let actualCommand;
    await S.withSynthetik500InstallationCommand(selector, async () => {
      const actual = await S.loadSynthetik500ProductionCommand(operationId, selector.commandHash); actualCommand = actual.command;
      testGo.planHash = actual.command.slot.planHash;
    });
    const goPin = retain("local-test-go.PRIVATE.json", testGo), evidencePins = {}, gates = {};
    for (const purpose of C.DIRECT_GATES) {
      gates[purpose] = true;
      evidencePins[purpose] = retain("gate-" + purpose + ".PRIVATE.json", { version: C.ACTUAL_GATE_VERSION, purpose, rootExecutor: "/root",
        operationId, runId: currentConfig.runId, productionCommit: config.commit, planHash: actualCommand.slot.planHash,
        commandHash: selector.commandHash, acceptedActualScope: true, primaryEvidencePins: [purpose === "testGo" ? goPin : primaryPin] });
    }
    const admissionPin = retain("local-admission.PRIVATE.json", { version: C.ADMISSION_VERSION, executor: "/root", purpose: "finite-D-R-500",
      commandHash: selector.commandHash, planHash: actualCommand.slot.planHash, productionCommit: config.commit,
      admittedAtUTC: new Date().toISOString(), expiresAtUTC: end, controlHash: C.controlHash(auth), booksHash: C.booksHash(auth), gates, evidencePins });
    await require("../lib/helmut/synthetik-500-production-adapter").install(commandPin, admissionPin);
    actualCommand = null; delete process.env[PRIV];
    pass("fresh local Root authority file pins and Ed25519 installation via actual adapter");
    const configPin = retain("app-configuration.PRIVATE.json", config); app = await childServer(configPin);
    stage("cold-request-open-http-runtime");
    const runtime = await app.request(selector); assert.equal(runtime.runtime.zustand, "vorbereitet"); assert.equal(runtime.runtime.aktiv, 0);
    assert.equal(runtime.runtime.gesamt, 500); assert.equal(runtime.runtime.identitaeten, 501); assert.equal(runtime.privateSigningKeyPresent, false);
    pass("cold public-key-only open/restore/ALS and actual PostgREST native runtime", runtime);
    await assert.rejects(app.request(selector, "activation-guard"), /synthetik500-production-direct-exact500-active-runtime-required/);
    pass("actual adapter rejects prepared0 at exact500 active-runtime guard before claim");
    async function request(action, extra = {}, token = config.adminSecret) {
      const r = await fetch("http://127.0.0.1:" + app.port + "/api/ops/synthetik500-direkt", { method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + token, Connection: "close" }, body: JSON.stringify({ action, ...selector, ...extra }) });
      return { status: r.status, body: await r.json() };
    }
    const status = await request("status"); assert.equal(status.status, 200); assert.equal(status.body.result.dispatchedOrUnknown, 0);
    assert.equal(status.body.result.positions.length, 1500); pass("actual server HTTP route returns installed status, not dispatched results");
    const denied = await request("start"); assert.equal(denied.status, 409); assert.equal(denied.body.retryAllowed, false);
    const unauthorized = await request("status", {}, "wrong-local-token"); assert.equal(unauthorized.status, 404);
    const foreign = await request("status", { profileId: "foreign-profile" }); assert.equal(foreign.status, 409); assert.equal(foreign.body.dispatchAttempted, false);
    pass("real HTTP unauthorized/profile injection/start before activation rejected without dispatch");
    const finalAuth = read("select data from helmut_store where id='main-auth';"), operation = finalAuth[J.KEY].operations[operationId];
    assert.equal(operation.claimId, null); assert.equal(Object.keys(operation.attempts).length, 0); assert(operation.units.every(x => !x.entered));
    assert.deepEqual(finalAuth[K.KEY], auth[K.KEY]);
    const beforeProfileProbe = state(DB);
    const profileProbe = JSON.parse(sql("begin;set local role service_role;create temporary table w15_profile_probe(reason text);"
      + "update public.mandate_profiles set partei='W15_ISOLATED_NEGATIVE_PROFILE' where user_id=" + literal(ids[0]) + ";"
      + "do $w15_probe$ begin begin perform public.helmut_synthetik500_lesung(" + literal(operationId) + ","
      + literal(P.hash(runtimeManifest)) + "," + literal(config.commit) + ");"
      + "exception when others then insert into w15_profile_probe values(sqlerrm);end;end $w15_probe$;"
      + "select jsonb_build_object('reason',(select reason from w15_profile_probe));rollback;"));
    assert.equal(profileProbe.reason, "synthetik500-runtime-fremd-fachbestand");
    assert.deepEqual(state(DB), beforeProfileProbe);
    pass("wrong stored profile rejected by actual native runtime; entire negative transaction rolled back", profileProbe);
    const actualProof = read("select data from helmut_store where data->'payload'->>0='helmut-s500-content-proof/1' and data->'payload'->>2="
      + literal(operationId) + ";");
    const binding = require("../lib/helmut/synthetik-500-content-runner").sourceBinding();
    for (const kind of ["bad-signature", "expired"]) {
      const caseConfig = { ...config, storeId: "w15-negative-" + kind }, target = sha(JSON.stringify([config.url, config.serviceToken, caseConfig.storeId]));
      const payload = [...actualProof.payload]; payload[4] = target;
      if (kind === "expired") { payload[10] = new Date(Date.now() - 2000).toISOString(); payload[11] = new Date(Date.now() - 1000).toISOString(); }
      const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keys.privateKey);
      if (kind === "bad-signature") signature[0] ^= 1;
      const cert = { payload, signature: signature.toString("base64") };
      const id = "synthetik500-command-synthetik500-proof-" + sha(JSON.stringify([operationId, selector.commandHash, target, binding])).slice(0, 48);
      const response = await fetch(gateway.url + "/rest/v1/helmut_store?select=id", { method: "POST",
        headers: { Authorization: "Bearer " + config.serviceToken, "Content-Type": "application/json", Prefer: "return=representation", Connection: "close" },
        body: JSON.stringify({ id, data: cert }) });
      assert.equal(response.status, 201); await response.arrayBuffer();
      const negative = await childServer(retain("app-" + kind + ".PRIVATE.json", caseConfig));
      try {
        await assert.rejects(negative.request(selector), kind === "bad-signature"
          ? /synthetik500-stored-command-certificate-signature/ : /synthetik500-stored-command-certificate-binding/);
        const httpResult = await fetch("http://127.0.0.1:" + negative.port + "/api/ops/synthetik500-direkt", { method: "POST",
          headers: { Authorization: "Bearer " + config.adminSecret, "Content-Type": "application/json", Connection: "close" },
          body: JSON.stringify({ action: "status", ...selector }) });
        assert.equal(httpResult.status, 409); assert.equal((await httpResult.json()).dispatchAttempted, false);
        pass("actual signature/expiry verification and real HTTP reject " + kind);
      } finally { await negative.close(); }
    }
    const claimId = crypto.randomUUID();
    assert.equal((await app.request(selector, "journal-claim", { claimId })).claimed, true);
    await assert.rejects(app.request(selector, "journal-claim", { claimId: crypto.randomUUID() }), /synthetik500-dispatch-already-claimed-or-window/);
    assert.equal((await app.request(selector, "journal-stop")).stopped, true);
    await app.close(); app = await childServer(configPin);
    await assert.rejects(app.request(selector, "journal-claim", { claimId: crypto.randomUUID() }), /synthetik500-dispatch-already-claimed-or-window/);
    pass("persistent one-time execution claim rejects duplicate and process restart; zero unit entries");
    const endedAuth = read("select data from helmut_store where id='main-auth';"), ended = endedAuth[J.KEY].operations[operationId];
    assert.equal(ended.claimId, claimId); assert.equal(Object.keys(ended.attempts).length, 0); assert(ended.units.every(x => !x.entered));
    assert.deepEqual(endedAuth[K.KEY], auth[K.KEY]);
    assert.deepEqual(state(SOURCE_DB), beforeSource);
    const report = { schema: "helmut-w15-signed-chain-integration/1", status: "PASS_ISOLATED_SIGNED_CHAIN_PREPARED0", checks, stages,
      codeScope: "PR971 plus selected PR967 renewal", originalSourceUnchanged: true,
      originalSourceComparisonScope: "complete mandate_profiles and helmut_store hashes, profiles count; not an all-table digest",
      originalReceiptSHA256: RECEIPT_HASH,
      realClockUnmodified: true, securityFunctionsMocked: false, simulatedLocalApprovalsAndCosts: true,
      currentProfessionalOrProductionApprovalClaimed: false, requestFixture,
      sourceContractHashUnchanged: EU.HASH, renewalHash: EU.ORDER_RENEWAL_HASH,
      preparedMetrics: prepared.metrics, coldRuntime: runtime, transport: gateway.bericht(), tunnel: tunnel.metrics,
      proofExecutionAuthorized: prepared.executionAuthorized, activatedProfiles: 0, unitEntries: 0, full500Dispatch: false,
      providerCalls: 0, productionActions: 0, commonMemoryAcceptanceClaimed: false,
      claimTestScope: "actual CAS-persisted claim, never a unit entry; ended permanently, restart cannot claim again",
      remaining: ["active500 runtime/actual unit dispatch", "Production deployment/authority/provider qualification", "common time and RAM/headroom acceptance"] };
    retain("SIGNED_CHAIN_ATTEMPT_4_RESULT.SAFE.json", report);
    console.log(JSON.stringify({ connected: true, remaining: report.remaining, checks: checks.length }));
  } finally { if (app) await app.close(); await gateway.stoppe(); await tunnel.close(); }
}
if (require.main === module) (process.argv.includes("--serve") ? serve() : main()).catch(error => {
  if (process.argv.includes("--serve")) { process.send?.({ type: "startup-error", reason: error.message }); process.exitCode = 1; return; }
  const report = { schema: "helmut-w15-signed-chain-first-failure/1", status: "FAIL", reason: error.message, stages,
    observedAtUTC: new Date().toISOString(), noAutomaticRetry: true, full500Dispatch: false, paidModelCalls: 0 };
  try { retain("SIGNED_CHAIN_ATTEMPT_4_FAILURE.SAFE.json", report); } catch { /* Preserve prior failures. */ }
  console.error("W15 signed integration failed: " + error.message); process.exitCode = 1;
});
module.exports = { main, childServer };
