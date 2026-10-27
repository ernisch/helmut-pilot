"use strict";
// Private original-data preparation only; not an automatic test suite or execution permission.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process"),{performance}=require("node:perf_hooks");
const {originalBuilder,localEnvironment}=require("./synthetik-500-w15-signed-chain-test");
const ROOT = path.resolve(__dirname, ".."), CONTAINER = "w15-full500-20261028";
const SOURCE_DB = "helmut_w15_input_20261027";
const UNIT0 = true;
const DB = "helmut_w15_full500_20261028";
const WORK = "/workspace/shared/helmut-w15-full500-20261028";
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
  if(database===SOURCE_DB)assert(text.startsWith("begin read only;"));
  const r = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", database===SOURCE_DB?"synthetik500-runtime-pg-7e1c20261027":CONTAINER,
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
  + "'profileFachHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)-'aktiv' order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),"
  + "'storeHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from helmut_store p));", database); }
function originals() { const raw = privateFile(RECEIPT); assert.equal(sha(raw), RECEIPT_HASH);
  const m = JSON.parse(raw); assert.equal(m.actualFileCount, 11); assert.equal(m.actualPayloadBytes, 96530256);
  return key => { const p = m.files.find(x => x.key === key); assert(p && p.status === "PASS");
    const b = privateFile(p.receivedPath); assert.equal(b.length, p.expectedBytes); assert.equal(sha(b), p.expectedSHA256);
    return { value: JSON.parse(b), pin: { path: p.receivedPath, bytes: b.length, sha256: sha(b) } }; };
}
async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.version, "v24.19.0");
  const beforeSource = state(SOURCE_DB); assert.equal(beforeSource.active, 500); assert.equal(beforeSource.storeRows, 6);
  if(UNIT0){
    const target=state(DB);assert.equal(target.active,0);
    const {profileHash:sourceHash,...sourceComparable}=beforeSource;
    const {profileHash:targetHash,...targetComparable}=target;
    assert.deepEqual({...targetComparable,database:SOURCE_DB,active:500},sourceComparable,
      "Only initial deactivation may differ in the newly cloned database");
  }else assert.deepEqual({ ...state(DB), database: SOURCE_DB }, beforeSource,
    "Test target must be a new pristine copy; never rerun against a prior test state");
  const config = JSON.parse(privateFile(path.join(WORK, "runtime-public.PRIVATE.json")));
  const get = originals(), packet = get("package").value, originalRows = get("normalizedCurrentPolicy").value;
  const derive = require("./fixtures/w15-synthetic-window");
  const derivedNative = derive.deriveNative(get("nativeInventoryHistoricalTemplate").value, new Date().toISOString());
  const native = derivedNative.native, oldU = get("originalUPacket");
  const P = require("../lib/helmut/synthetik-500-profile"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
  localEnvironment(config);
  {
    const K = require("../lib/helmut/testkosten-budget"), C = require("../lib/helmut/synthetik-500-production-command");
    const I = require("../lib/helmut/synthetik-500-import"), J = require("../lib/helmut/synthetik-500-dispatch-journal");
    stage("rebind-current-calendar-originals", { rows: originalRows.length });
    const changedPaths = new Set(), day = new Date().toISOString().slice(0, 10), temporaryDate = new Date().toISOString();
    const derivationReports = [];
    const rows = originalRows.map(row => { const x = derive.deriveRow(row, temporaryDate);
      derivationReports.push(x.report); x.report.changedPaths.forEach(p => changedPaths.add(p)); return x.row; });
    assert.equal(rows.length, 500); pass("explicit synthetic fixture preserves content/profiles and original files", { changedPaths: [...changedPaths] });
    assert.equal(sql("begin;set local statement_timeout='15s';update public.mandate_profiles set aktiv=false where aktiv;"
      + "with changed as (update public.raw_documents set published_at=" + literal(derivedNative.report.syntheticPublishedAt)
      + " where id=" + literal(derivedNative.report.sourceId) + " and published_at=" + literal(derivedNative.report.originalPublishedAt)
      + " returning id) select count(*) from changed;commit;"), "1");
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
    const constructedAtUTC = new Date().toISOString();
    rows.forEach(row => { row.briefingDatum = constructedAtUTC; });
    const candidates=get("reviewedMockCandidates"), templates=get("staticMockTemplates");
    const fixtures=[];
    process.env.AZURE_OPENAI_ENDPOINT=new URL(native.costInputs.routeContract.route.responsesUrl).origin;
    process.env.AZURE_OPENAI_KEY="LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY";process.env.AZURE_OPENAI_DEPLOYMENT="gpt-5-mini-eu";
    const Provider=require("./fixtures/w15-full500-provider");
    const sortedRows=[...rows].sort((a,b)=>a.profile.id.localeCompare(b.profile.id));
    for(let index=0;index<500;index++){
      const row=sortedRows[index],mapping=candidates.value.ownerMapping.find(x=>x.owner===row.profile.id);assert(mapping);
      fixtures.push(Provider.prepare({index,row,candidate:candidates.value.candidates[mapping.variantIndex],template:templates.value.templates[mapping.variantIndex],
        model:native.costInputs.routeContract.route.model,responsesURL:native.costInputs.routeContract.route.responsesUrl}));
    }
    delete process.env.AZURE_OPENAI_ENDPOINT;delete process.env.AZURE_OPENAI_KEY;delete process.env.AZURE_OPENAI_DEPLOYMENT;
    retain("mock-fixtures.PRIVATE.json",fixtures);
    retain("audit-inputs.PRIVATE.json",sortedRows.map((row,index)=>({index,owner:row.profile.id,profile:row.profile,briefingEingabeHash:row.briefingEingabe.eingabe.eingabeHash})));
    // Observe the actual database after all expensive fixture construction.
    const observed=new Date().toISOString(), priorSource=source;
    source=read("select jsonb_build_object('mandates',(select jsonb_agg(to_jsonb(p)order by user_id collate \"C\")from mandate_profiles p),"
      + "'profiles',(select jsonb_agg(to_jsonb(p)order by id collate \"C\")from profiles p),"
      + "'auth',(select data from helmut_store where id='main-auth'),'main',(select data from helmut_store where id='main'));" );
    assert.deepEqual(source.mandates,priorSource.mandates);assert.deepEqual(source.profiles,priorSource.profiles);
    assert.deepEqual(source.main,priorSource.main);assert.deepEqual(source.auth,auth);
    const now=Date.now();assert(now-Date.parse(observed)<60000,"w15-full500-snapshot-real-freshness");
    const plannedWindow=require("./fixtures/w15-full500-window").window(new Date(now).toISOString());
    const end=plannedWindow.endsAtUTC;
    const operationId = (UNIT0 ? "synthetik500-w15-full500-" : "synthetik500-w15-processing-") + now;
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
    if (!UNIT0) {
      stage("install-real-prepared0-runtime"); sql(G.baueSql(prepare, bytes, Date.now()));
      pass("real native runtime prepared0 installed without activation");
    }
    if (UNIT0) {
      const owner = JSON.parse(privateFile(path.join(WORK, "OWNER_GO.PRIVATE.json")));
      assert.equal(owner.targetDatabase, DB); assert.equal(owner.maximumUnits, 500);
      assert.equal(owner.temporarySyntheticProfiles, 500); assert.equal(owner.paidModelsAllowed, false);
      assert.equal(owner.confirmation, "GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO");
      // Existing reviewed local external assumption, never a Production watcher receipt.
      // The independent outer controller performs the genuine bound native cleanup.
      full.endwaechter = {...endwaechter, operationId, manifestHash:P.hash(runtimeManifest),
        productionCommit:config.commit, beobachtetAm:observed};
      const activationGo = { version:"helmut-synthetik500-aktivierungs-go/1",operationId,
        manifestHash:P.hash(runtimeManifest),productionCommit:config.commit,
        aktion:"EXAKT_500_SYNTHETISCHE_PROFILE_AKTIVIEREN_UND_TEST_STARTEN",
        freigegebenAm:new Date().toISOString(),aussteller:"ROOT_BOUND_USER_FULL500_MOCK_GO",
        primaerbeleg:{referenz:path.join(WORK,"OWNER_GO.PRIVATE.json"),sha256:sha(privateFile(path.join(WORK,"OWNER_GO.PRIVATE.json")))} };
      retain("cleanup-context.PRIVATE.json",{operationId,manifestHash:P.hash(runtimeManifest),productionCommit:config.commit,database:DB});
      retain("activation-context.PRIVATE.json", {runtimeManifest,snapshot,belege:full,activationGo});
      const prepareSQL = G.baueSql(prepare, bytes, Date.now());
      const activateSQL = G.baueSql({runtimeManifest,snapshot,belege:full,schritt:"aktivieren",aktivierungsGo:activationGo},bytes,Date.now());
      const supervisor=JSON.parse(privateFile(path.join(WORK,"SUPERVISOR_READY.SAFE.json")));
      process.kill(supervisor.pid,0);assert.equal(supervisor.container,CONTAINER);assert.equal(supervisor.realMemoryCap,2048000000);
      stage("fresh-original-preparation-and-authorized-activation");
      sql(prepareSQL); sql(activateSQL);
      const nativeReceipt = read("set local role service_role;select public.helmut_synthetik500_lesung(" + [operationId,P.hash(runtimeManifest),config.commit].map(literal).join(",") + ");");
      assert.equal(nativeReceipt.aktiv,500);assert.equal(nativeReceipt.zustand,"aktiv");
      assert.equal(nativeReceipt.gesamt,500);assert.equal(nativeReceipt.identitaeten,501);
      retain("ACTIVATION.SAFE.json",{status:"PASS",nativeReceipt,temporaryActiveProfiles:500,maximumUnits:500,
        sourceUnchanged:JSON.stringify(state(SOURCE_DB))===JSON.stringify(beforeSource),productionWatcherClaimed:false});
    }
    const route = structuredClone(native.costInputs.routeContract);
    Object.assign(route, { runtimeManifestHash: P.hash(runtimeManifest), orderRenewalHash: EU.ORDER_RENEWAL_HASH });
    Object.assign(route.route, { productionCommit: config.commit, deploymentId: config.deploymentId, deploymentHost: config.host });
    Object.assign(route.management, { validFromUTC: constructedAtUTC, validUntilUTC: end });
    const startsAtUTC = plannedWindow.startsAtUTC;
    const currentConfig = { selector: { operationId }, runId: "nachlauf500-" + Date.now(), constructedAtUTC,
      window: { startsAtUTC, endsAtUTC: end } };
    rows.forEach(row => { row.briefingDatum = constructedAtUTC; });
    const oldOperation = oldU.value.command.slot.plan.operationId, oldJournal = auth[J.KEY].operations[oldOperation]; assert(oldJournal);
    const prior = { predecessor: { operationId: oldOperation, commandHash: P.hash(oldU.value.command), planHash: oldU.value.command.slot.planHash,
      journalHash: P.hash(oldJournal) }, originalPacketPin: oldU.pin, originalJournalHash: P.hash(oldJournal) };
    const builder = originalBuilder(), requests = [];
    stage("prepare-all500-current-synthetic-requests");
    const built = builder.build({ approval: { status: "ACCEPTED_ALL500_ORDINARY_V1_AND_ACTUAL_NATIVE_BINDING", actualNativeInputEquality: true,
      positiveBoundOrdinaryVerdicts: 500, scope: "SYNTHETIC PERFORMANCE FIXTURE ONLY; NO PROFESSIONAL/PRODUCTION OR UNIT EXECUTION APPROVAL" },
      config: currentConfig, paket: packet, rows, native, runtime: { runtimeManifest, snapshot, productionCommit: config.commit,
        briefingFensterStart: "2026-10-13T00:00:00.000Z" }, routeContract: route, prior,
      prepareDraft: row => { const result = builder.prepareDraft(row, route, native.routeId);
        requests.push({ owner: row.profile.id, requestBodySHA256: sha(result.requestBody), inputDate: row.briefingDatum,
          contextSources: result.sources.length }); return result; } });
    assert.equal(requests.length,500); assert(requests.every(x=>x.contextSources>0));
    for(let index=0;index<500;index++){
      assert.equal(requests[index].owner,fixtures[index].owner);assert.equal(requests[index].requestBodySHA256,fixtures[index].requestBodySHA256);
    }
    const encoded = require("../lib/helmut/synthetik-500-direct-codec").encode(built.packet);
    const selector = { operationId, commandHash: built.commandHash };
    const commandPin = retain("current-command.PRIVATE.json", encoded);
    sql("begin;insert into helmut_store(id,data)values(" + literal("synthetik500-command-" + operationId) + "," + json(encoded) + ");commit;");
    assert.deepEqual(state(SOURCE_DB),beforeSource);
    retain("processing-materials.PRIVATE.json", { selector, runId: currentConfig.runId, startsAtUTC, endsAtUTC:end,completionDeadlineUTC:plannedWindow.completionDeadlineUTC,
      planHash:built.command.slot.planHash, paketHash:packet.bindung.paketHash, commandPin,
      controlHash:C.controlHash(auth), booksHash:C.booksHash(auth), sourceReceiptSHA256:RECEIPT_HASH,
      database: DB, runtimeManifestHash:P.hash(runtimeManifest), productionCommit:config.commit,
      scope:"SYNTHETIC_PERFORMANCE_FIXTURE_NOT_NEWS_OR_PRODUCTION", full500DispatchAuthorized:true, activatedProfiles:UNIT0?500:0 });
    retain("PROCESSING_INPUTS.SAFE.json", { status:"PASS_ALL500_ACTUAL_D_PREPARATIONS", scope:"SYNTHETIC_PERFORMANCE_FIXTURE_NOT_NEWS_OR_PRODUCTION",
      actualOriginalPreparer:true, currentDescriptorAndActualRequestDatesMatch:true, originalFilesModified:false,
      sourceRestorePreserved:true, sourceComparisonScope:"mandate/store hashes and profile counts", sourceReceiptSHA256:RECEIPT_HASH,
      uniqueSyntheticSourceTimestamps:1,nativeDerivation:derivedNative.report,derivedRows:derivationReports.length,
      derivationHash:P.hash(derivationReports),requests, changedPaths:[...changedPaths], securityClockReal:true,
      globalDateReplaced:false, providerCalls:0, profileActivations:UNIT0?500:0, full500Dispatch:false,maximumAuthorizedUnits:500 });
    pass("all500 real D preparations have nonempty contexts and exact current request bindings");

  }
}
if(require.main===module)main().catch(error=>{try{retain(UNIT0?"MATERIALS_FIRST_FAILURE.SAFE.json":"PROCESSING_MATERIALS_ATTEMPT_B_FAILURE.SAFE.json",{status:"FAIL",reason:error.message,stages});}catch{}console.error(error.message);process.exitCode=1;});
