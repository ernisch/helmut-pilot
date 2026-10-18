'use strict';
// Local, read-only deterministic consumer checks. No synthetic receipts, command
// installation, service start, key generation, claim or provider request.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const ROOT = path.resolve(__dirname, '../..');
function pinned(p, privateFile = false) {
  assert(p && typeof p.path === 'string' && path.isAbsolute(p.path));
  assert.equal(fs.realpathSync(p.path), p.path);
  const stat = fs.lstatSync(p.path);
  assert(stat.isFile() && !stat.isSymbolicLink());
  if (privateFile) assert.equal(stat.mode & 0o077, 0);
  const b = fs.readFileSync(p.path);
  assert.equal(b.length, p.bytes); assert.equal(sha(b), p.sha256);
  return b;
}
const json = (p, secret = false) => JSON.parse(pinned(p, secret));
function ownerPolicy(owner, action, target, now) {
  assert.equal(owner.allowDispose, false);
  assert.equal(owner.schema, 'helmut-owner-local-fixture-go/1');
  assert.equal(owner.confirmation, action.requiredGOConfirmation);
  assert.equal(owner.targetDatabase, target); assert.equal(owner.production, false);
  assert.equal(owner.syntheticProfiles, 500); assert.equal(owner.paidProviderCallsAllowed, false);
  assert.equal(owner.exactlyOneResourceAttempt, true);
  assert(Number.isFinite(Date.parse(owner.approvedAtUTC)) && Date.parse(owner.approvedAtUTC) <= now);
  assert(typeof owner.ownerAuthorizationReference === 'string' && owner.ownerAuthorizationReference.length >= 20);
}
function ownerIntentPolicy(owner, action, target) {
  assert.equal(owner.schema,'helmut-owner-local-fixture-intent/1');
  assert.equal(owner.authorized,false); assert.equal(action.authorized,false);
  for(const k of ['confirmation','approvedAtUTC','ownerAuthorizationReference'])assert(!Object.hasOwn(owner,k));
  assert.equal(owner.allowDispose,false);assert.equal(owner.requiredConfirmation,action.requiredGOConfirmation);
  assert.equal(owner.targetDatabase,target);assert.equal(owner.production,false);
  assert.equal(owner.syntheticProfiles,500);assert.equal(owner.paidProviderCallsAllowed,false);
  assert.equal(owner.exactlyOneResourceAttempt,true);assert.equal(owner.resourceOnly,true);
  assert(!fs.existsSync(owner.finalOwnerGOPath));
}
function ownerInputs(plan, now) {
  const staged = json(plan.stagedHarness), action = json(staged.action);
  const owner = json(plan.freshOwnerGO, true);
  if(plan.planningWithoutGO===true)ownerIntentPolicy(owner,action,plan.targetDatabase);
  else ownerPolicy(owner, action, plan.targetDatabase, now);
  return {explicitPreservation:true,localOnly:true,profiles:500,paidProviderCalls:false};
}
function preparationInputs(plan) {
  require('./measured-preparation').assertInputBindings(plan,json(plan.sourceCapture));
  const request = json(plan.runtimeRequest, true);
  assert.equal(request.status, 'ROOT_REVIEWED_LOCAL_RUNTIME_INITIALIZATION');
  assert.equal(request.targetDatabase, plan.targetDatabase);
  assert.deepEqual(request.expectedOwnerGoPin, plan.freshOwnerGO);
  assert.deepEqual(request.currentDayBinding, plan.dayBindingAcceptance);
  assert.equal(request.newOperation, plan.operationId);
  const acceptance = json(request.inputAcceptance);
  for (const [k, v] of Object.entries({status:'ACCEPTED_ALL500_ORDINARY_V1_AND_ACTUAL_NATIVE_BINDING',
    positiveBoundOrdinaryVerdicts:500, actualNativeInputEquality:true, fencingAllNull:true,
    nativeUnderstandingAcceptance:false, curatedLocalFixture:true, ordinaryV1WorkerFullCCompatible:true,
    profileWrites:0, schemaChanges:0})) assert.equal(acceptance[k], v);
  assert(!acceptance.previouslyAttemptedOperationIds.includes(plan.operationId));
  for (const k of ['all500IndependentVisibleReview','sixIndependentKOFacts','actualNativeCapture','ordinaryAAndFEquality','genericU0Decision']) json(request.primaries[k]);
  assert(Array.isArray(request.sourcePins) && request.sourcePins.length > 0);
  request.sourcePins.forEach(p=>pinned(p));
  if(plan.atomicUsageInput){
    assert.deepEqual(request.atomicUsageInput,plan.atomicUsageInput);
    const d=require('./atomic-usage-integration').readDescriptor(plan.atomicUsageInput);
    for(const source of d.sourcePins)assert(request.sourcePins.some(p=>p.path===source.path&&p.sha256===source.sha256&&p.bytes===source.bytes));
  }
  const external = json(request.localExternalBelege);
  assert.equal(external.scope, 'ROOT_REVIEWED_LOCAL_EXTERNAL_FIXTURE_PRECONDITIONS_NOT_PRODUCTION');
  assert.equal(external.inputAcceptanceSHA256, request.inputAcceptance.sha256);
  assert.equal(external.nativeCaptureSHA256, request.primaries.actualNativeCapture.sha256);
  assert(external.belege.endwaechter);
  for(const state of ['berlin','brandenburg']) {
    const publication=external.belege.landesversorgung[state].publishedAt;
    assert.equal(new Date(publication).toISOString(),publication);
  }
  const packet = json(request.package);
  assert.equal(packet.profile.length, 500);
  assert.equal(new Set(packet.profile.map(p => p.mandatsId)).size, 500);
  return { originalPreparationInputsChecked:true, profiles:500, sourcePins:request.sourcePins.length };
}
function asset(plan, name) {
  const matches = [...plan.applicationReadOnlyPins, ...plan.databaseReadOnlyPins]
    .filter(p => path.basename(p.path) === name);
  assert.equal(matches.length, 1, 'One exact mounted asset required: ' + name);
  return matches[0];
}
function materialsInputs(plan) {
  const env = json(asset(plan, 'EXECUTION_ENV.PRIVATE.json'), true);
  assert.equal(env.scope, 'FICTIONAL_LOCAL_ONLY');
  assert.equal(env.HELMUT_TESTLAUF_KOMMUNIKATION, 'gesperrt');
  assert.equal(env.AZURE_OPENAI_KEY, 'fictional-local-only-never-external');
  assert.equal(env.VERCEL_ENV, 'production'); // Emulated value, no deployed action.
  assert.equal(env.HELMUT_SUPABASE_AUTH_STORE_ID, 'main-auth');
  assert.equal(env.HELMUT_SUPABASE_STORE_ID, 'main');
  assert(!env.OPENAI_API_KEY && !env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY);
  if(plan.atomicUsageInput){
    require('./atomic-usage-integration').assertLocalTarget(plan);
    require('./atomic-usage-integration').environment(env,plan.atomicUsageInput);
  }
  const secret = pinned(asset(plan, 'jwt-secret.PRIVATE.txt'), true).toString('utf8').trim();
  assert(/^[a-f0-9]{64}$/.test(secret));
  // This existing function is import-safe and invokes the actual consumer's
  // complete budget schema/primary pin/value checks, without prepare().
  const stage = path.join(plan.workflowDirectory, 'runtime-candidates/prepare-materials.candidate.js');
  const stagePin = plan.immutableWorkflowPins.find(p => p.path === stage); pinned(stagePin);
  const budgets = require(stage).budgetScenario(asset(plan, 'LOCAL_EXISTING_BUDGET_SCENARIO.PRIVATE.json'));
  for (const [k,v] of Object.entries(budgets)) assert(env[k] === undefined || env[k] === v);
  return { localMaterialsInputsChecked:true, secretValuesReported:false, providerCalls:0 };
}
function servicesInputs(plan) {
  const pg = pinned(asset(plan, 'postgrest.PRIVATE.conf')).toString('utf8');
  assert.equal(sha(pg), 'aa4acc62bed10bb23e07a041955ec5ae75b267f5c5d0f620d3a9274107581136');
  assert.equal(pg.split('helmut_u_start_fixture_005821f5').length, 2);
  assert.equal(pg.split('server-port = 38410').length, 2);
  assert(pg.includes('db-uri = "postgresql://authenticator@/helmut_u_start_fixture_005821f5?host=/var/run/postgresql"'));
  const body=pg.replace('helmut_u_start_fixture_005821f5',plan.targetDatabase).replace('server-port = 38410','server-port = 38414');
  assert(!body.includes('helmut_fresh_input_fixture_d2e98984'));
  assert.equal(plan.databaseReadOnlyPins.length,1);
  assert.equal(plan.databaseReadOnlyPins[0].sha256,'870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617');
  pinned(plan.databaseReadOnlyPins[0]);
  assert(!fs.existsSync(path.join(plan.workflowDirectory,'runtime-candidates/generated-services')));
  return {exactServiceInputs:true,newServicesStillRequired:true,servicesStarted:false};
}
function actualSourceBinding(plan) {
  // The CLI has a deliberately empty runtime environment. Bind the mode that
  // the exact pinned descriptor installs, as the actual assembly does. This
  // synchronous source-only call cannot activate a storage reader or writer.
  const keys = ['HELMUT_LLM_USAGE_STORAGE', 'HELMUT_AUTH_STATE_STORAGE', 'HELMUT_AUTH_HISTORY_READ_REUSE'];
  const before = keys.map(k => process.env[k]);
  try {
    if (plan.atomicUsageInput) {
      const env = require('./atomic-usage-integration').environment({}, plan.atomicUsageInput);
      for (const k of keys) {
        if (env[k] === undefined) delete process.env[k];
        else process.env[k] = env[k];
      }
    }
    return require(ROOT+'/lib/helmut/synthetik-500-content-runner').sourceBinding();
  } finally {
    keys.forEach((k, i) => {
      if (before[i] === undefined) delete process.env[k];
      else process.env[k] = before[i];
    });
  }
}
function profileInputs(plan) {
  const request = json(plan.runtimeRequest), approval = json(request.inputAcceptance);
  const day = json(plan.dayBindingAcceptance), rows = json(approval.currentPolicyInput);
  assert.deepEqual(approval.currentPolicyInput, day.adoptedRowsPin);
  const packet = json(request.package), ids = packet.profile.map(p => p.mandatsId).sort();
  require(ROOT+'/lib/helmut/synthetik-500-profile').pruefePaket(packet);
  assert.equal(rows.length, 500); assert.equal(new Set(rows.map(r => r.profile.id)).size, 500);
  assert.deepEqual(rows.map(r => r.profile.id).sort(), ids);
  const native = json(asset(plan, 'NATIVE_INVENTORY_TEMPLATE.PRIVATE.json'));
  assert.equal(native.knowledgeObjects.length, 6); assert([6,7].includes(native.documents.length));
  assert.equal(native.nativeUnderstandingAcceptance, false); assert.equal(native.curatedLocalFixture, true);
  const KO = require(ROOT+'/lib/helmut/knowledge-object-version');
  const W = require(ROOT+'/lib/helmut/synthetik-500-w-inventar');
  for (const ko of native.knowledgeObjects) {
    assert.deepEqual(Object.keys(ko.version).sort(), [...KO.VERSION_FIELDS].sort());
    assert.equal(ko.version.verstehen_fencing, null);
  }
  for (const d of native.documents) assert.deepEqual(Object.keys(d.version).sort(), [...W.SOURCE_VERSION_FIELDS].sort());
  assert(native.clusters.length > 0 && native.clusters.every(c => c.requiresUnderstanding === false && c.coverage?.evidence));
  const U = json(asset(plan,'PREDECESSOR_BINDING.SAFE.json'));
  const originalU = json(asset(plan,'ORIGINAL_U_PACKET.PRIVATE.json'));
  assert(U.predecessor && /^[a-f0-9]{64}$/.test(U.predecessor.journalHash));
  assert.equal(U.originalControlJournalHashMatched, true);
  assert(originalU && typeof originalU === 'object');
  for (const r of rows) {
    assert.equal(r.briefingEingabe.version,1); assert(r.briefingEingabe.urteil);
    assert.equal(r.briefingEingabe.acceptedSnapshot,undefined); assert.equal(r.profile.profileActive,true);
    // The actual assembler assigns runtime.start to EVERY row. The immutable
    // ordinary inputs intentionally have no date field to be backdated here.
    assert.equal(day.startsAtUTC.slice(0,10), plan.day);
    assert.equal(day.endsAtUTC.slice(0,10), plan.day);
    assert.equal(r.sources.documents.length,native.documents.length); assert.equal(r.sources.knowledgeObjects.length,6);
  }
  // Day17 acceptance includes original A/F/L for all500 at BOTH endpoints.
  // Reuse only its exact pinned input/code
  // bindings; do not repeat that audit or pretend it proves a future command.
  assert.equal(day.status, 'ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER');
  assert.equal(day.positiveOriginalLAtBothWindowEnds, 500);
  assert.equal(day.positiveOriginalA, 500); assert.equal(day.positiveOriginalF, 500);
  assert.equal(day.profiles, 500);
  assert.equal(day.allPositionsReviewed, true); assert.equal(day.currentTemporalJudgmentAccepted, true);
  assert.equal(day.rootAdoptsExactIndependentScope, true);
  // Invoke the real sourceBinding implementation, not a supplied hash claim.
  const sourceBinding = actualSourceBinding(plan);
  assert(/^[a-f0-9:]+$/.test(sourceBinding));
  return { pinnedProfiles:500, exactOwnerSet:true, nativeKOs:6, nativeDocuments:native.documents.length,
    priorDayAcceptanceReused:true, actualCodeSourceBindingSHA256:sha(sourceBinding), newCommandValidated:false };
}
function providerInputs(plan) {
  const request=json(plan.runtimeRequest), approval=json(request.inputAcceptance), day=json(plan.dayBindingAcceptance);
  const rows=json(approval.currentPolicyInput), native=json(asset(plan,'NATIVE_INVENTORY_TEMPLATE.PRIVATE.json'));
  const candidates=json(asset(plan,'REVIEWED_LOCAL_PROVIDER_CANDIDATES.PRIVATE.json'));
  const accepted=json(asset(plan,'ROOT_STATIC_LOCAL_R_TEMPLATE_ACCEPTANCE.SAFE.json'));
  const templates=json(accepted.canonicalTemplates);
  const stage=path.join(plan.workflowDirectory,'original-draft-request.js');
  pinned(plan.immutableWorkflowPins.find(p=>p.path===stage));
  materialsInputs(plan); // Reject conflicting/nonfictional environment first.
  const env=json(asset(plan,'EXECUTION_ENV.PRIVATE.json'),true),saved={...process.env};
  let checked=0;
  try {
    for(const k of Object.keys(process.env))delete process.env[k];
    Object.assign(process.env,{PATH:saved.PATH,LANG:'C.UTF-8',...env});
    const prepare=require(stage).prepare, ai=require(ROOT+'/lib/helmut/ai'),Q=require(ROOT+'/lib/helmut/lage-textqualitaet');
    const route=native.costInputs.routeContract;
    assert.equal(candidates.ownerMapping.length,500);
    assert.equal(new Set(candidates.ownerMapping.map(m=>m.owner)).size,500);
    assert.equal(rows.length,500);
    for(const raw of rows) {
      const owner=raw.profile.id,m=candidates.ownerMapping.find(x=>x.owner===owner);
      assert(m && Number.isSafeInteger(m.variantIndex));
      const c=candidates.candidates[m.variantIndex],t=templates.templates[m.variantIndex];assert(c&&t);
      assert.equal(t.binding.responseJSONSHA256,sha(JSON.stringify(t.response)));
      // These are pure endpoint input checks, NOT a run or a fabricated future
      // command/selector/receipt. The actual assembler repeats fresh bindings.
      for(const briefingDatum of [day.startsAtUTC,day.endsAtUTC]) {
        const row={...raw,briefingDatum},p=prepare(row,route,native.routeId);
        const body=p.requestBody;assert.equal(JSON.stringify(JSON.parse(body)),body);
        require(ROOT+'/lib/helmut/synthetik-500-eu-service-contract').assertPayload(JSON.parse(body));
        const r=ai.prepareLageReviewInput(c.draftCandidate,p.sources,row.profile);
        const actual=JSON.stringify(ai.responsesPayload(r.prompt,ai.understandingModelName(),
          {jsonSchema:Q.SCHEMA,jsonSchemaName:'knowledge_object',maxOutputTokens:3000,strictJsonSchema:true,reasoningEffort:'low'}));
        const expected=JSON.stringify({model:ai.activeModelName(),input:r.prompt,max_output_tokens:3000,
          reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'knowledge_object',schema:Q.SCHEMA,strict:true}}});
        assert.equal(actual,expected);
        assert.equal(Q.pruefe(r.paragraphs,p.sources,t.response,row.profile).ok,true);
        checked++;
      }
    }
  } finally {
    for(const k of Object.keys(process.env))delete process.env[k];Object.assign(process.env,saved);
  }
  return {profiles:500,pureEndpointChecks:checked, originalDPreparation:true, originalPreRAndQ:true,
    freshCommandBindingStillRequired:true,providerCalls:0};
}
function staticInterfaces(plan) {
  for(const relative of ['contracts.js','runtime-candidates/common.js','root-io-bridge.js']) {
    const file=path.join(plan.workflowDirectory,relative);
    pinned(plan.immutableWorkflowPins.find(p=>p.path===file));
  }
  const G=require(path.join(plan.workflowDirectory,'contracts.js'));
  assert.equal(G.ROOT,ROOT);assert.equal(G.EXPECTED_DATABASE,plan.targetDatabase);
  assert.equal(G.READ_ONLY_SOURCE_DATABASE,plan.sourceDatabase);
  assert.equal(G.TARGET_CONFIG,path.join(plan.workflowDirectory,'LOCAL_NEW_FIXTURE.PRIVATE.json'));
  assert.deepEqual(G.LIMITS,{offlineMS:90000,preparationMS:60000,unitMS:60000,authMS:30000,
    providerMS:20000,worstDelayMS:19900,applicationAndRunnerBytes:2048000000});
  const H=require(path.join(plan.workflowDirectory,'runtime-candidates/common.js'));
  assert.equal(H.TARGET,plan.targetDatabase);assert.equal(H.CONTAINER,plan.containerName);
  assert.equal(H.OUT,plan.workflowDirectory);
  const bridge=require(path.join(plan.workflowDirectory,'root-io-bridge.js'));
  const api=bridge.create({config:{},target:{database:plan.targetDatabase,container:plan.containerName}});
  for(const name of ['sql','environment','installPins','readState','readSenderClaim','readAllFinalEvidence',
    'assertNeverClaimed','assertUnsignedCertificateRejected','memoryAccounting'])assert.equal(typeof api[name],'function');
  assert.equal(asset(plan,'ORIGINAL_U_PACKET.PRIVATE.json').bytes,53018);
  const request=json(plan.runtimeRequest),native=json(asset(plan,'NATIVE_INVENTORY_TEMPLATE.PRIVATE.json'));
  const route=native.costInputs.routeContract;
  assert(require(ROOT+'/lib/helmut/synthetik-500-eu-service-contract').isRoute(route));
  assert(native.curatedWitnessReference?.reference&&/^[a-f0-9]{64}$/.test(native.curatedWitnessReference.sha256));
  assert(Array.isArray(native.costInputs.paidRoutes));
  assert.equal(route.route.productionCommit,request.route.productionCommit);
  const supported=['nativeSource17','finiteW','nativeCodec','currentFinancing','quiescence','endGuard',
    'windowAuthority','outputContract','draftEvidence','testGo'];
  assert.deepEqual([...require(ROOT+'/lib/helmut/synthetik-500-production-command').DIRECT_GATES].sort(),supported.sort());
  return {unchangedTimingAndMemoryContract:true, actualReadOnlyBridgeInterfaceChecked:true,
    originalUBytes:53018, directPurposes:supported.length, newRuntimeReceiptInvented:false};
}
function initialSourceBinding(plan) {
  const actual=actualSourceBinding(plan);
  assert(/^[a-f0-9]{64}$/.test(plan.expectedInitialSourceBindingSHA256||''),'Independently pinned initial source identity missing');
  assert.equal(sha(actual),plan.expectedInitialSourceBindingSHA256);
  return {matchesIndependentlyPinnedInitialSourceIdentity:true,
    finalBindingAfterGeneratedPublicKeyStillRequired:true};
}
function installReadOnlyGuards() {
  const denied=()=>{throw Error('READ_ONLY_PREFLIGHT_SIDE_EFFECT_FORBIDDEN');};
  const saved=[];const replace=(o,k,value)=>{saved.push([o,k,o[k]]);o[k]=value;};
  for(const name of ['http','https'])for(const key of ['request','get','createServer'])replace(require('node:'+name),key,denied);
  for(const name of ['net','tls'])for(const key of ['connect','createConnection','createServer'])replace(require('node:'+name),key,denied);
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(require('node:child_process'),key,denied);
  replace(require('node:worker_threads'),'Worker',class{constructor(){denied();}});
  replace(globalThis,'fetch',denied);
  for(const key of ['writeFileSync','appendFileSync','mkdirSync','rmSync','unlinkSync','renameSync','chmodSync','symlinkSync',
    'writeFile','appendFile','mkdir','rm','unlink','rename','chmod','symlink','createWriteStream'])replace(fs,key,denied);
  return ()=>{for(const[o,k,value]of saved.reverse())o[k]=value;};
}
const CHECKS = {ownerInputs, preparationInputs, materialsInputs, servicesInputs,profileInputs, providerInputs,staticInterfaces,initialSourceBinding};
function assess(plan, now = Date.now()) {
  const results = [];
  const restore=installReadOnlyGuards();
  try {
    for (const [id, check] of Object.entries(CHECKS)) {
      try { results.push({id, status:'PASS', evidence:check(plan, now)}); }
      catch (e) { results.push({id, status:'BLOCKED', reason:'Consumer input condition failed', errorType:e.name}); }
    }
  }finally{restore();}
  return { checks:results, pass:results.every(r=>r.status==='PASS'), activation:false, providerCalls:0 };
}
if (require.main === module) {
  installReadOnlyGuards();
  const plan = JSON.parse(fs.readFileSync(0,'utf8'));
  process.stdout.write(JSON.stringify(assess(plan))+'\n');
}
module.exports = { pinned, json, ownerPolicy, ownerIntentPolicy, ownerInputs, preparationInputs, materialsInputs, actualSourceBinding, profileInputs,
  providerInputs,staticInterfaces,initialSourceBinding,assess,installReadOnlyGuards };
