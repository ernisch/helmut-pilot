"use strict";
// New bounded pure/synthetic preflight orchestration only; never a 500 run or DB.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const D=require("./synthetik-500-resource-diagnostic"),F=require("./fixtures/resource500-diagnostic");
const epoch=new Date().toISOString(),nonce="a".repeat(32);
const temp=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),"resource500-fictional-"));fs.chmodSync(p,0o700);return p;};
function config(root){const claims={role:"service_role",resourceDiagnosticNonce:nonce,exp:Math.floor(Date.now()/1000)+600};
  return{schema:D.SCHEMA,mode:"preflight",count:2,nonce,database:{host:"127.0.0.1",port:5432,name:"resource_diag_preflight",user:"postgres",password:"FICTIONAL_ONLY"},
    postgrestURL:"http://127.0.0.1:3000",serviceToken:"e30."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".FICTIONAL",
    resultRoot:root,maxWallSeconds:120,datasetEpochUTC:epoch};}
function fake(root,{failWork=false,wrongActive=false,count=2}={}){
  const profiles=new Map(),active=new Set(),events=[];let counts={raw_documents:0,knowledge_objects:0,ko_document_links:0,matching_results:0,briefings:0};
  return{events,profiles,active,
    activeIDs:async()=>wrongActive&&active.size===count?["FICTIONAL_FOREIGN"]:[...active].sort(),
    profile:async id=>profiles.get(id)||null,
    provision:async spec=>{events.push("provision");profiles.set(spec.id,{id:spec.id,profileActive:false,provisionedBy:"helmut-provisioning"});return{ok:true};},
    participate:async(id,on)=>{events.push(on?"activate":"deactivate");profiles.get(id).profileActive=on;on?active.add(id):active.delete(id);return{ok:true};},
    saveSource:async()=>{counts.raw_documents++;return{saved:true};},
    understand:async cluster=>{assert.equal(active.size,count);assert.equal(cluster.documents.length,4);events.push("understand");counts.knowledge_objects++;counts.ko_document_links+=4;return{status:"saved"};},
    match:async()=>{counts.matching_results++;return{saved:1};},decide:async()=>({saved:1}),
    build:async()=>{assert.equal(active.size,count);events.push("actual-work-seam");if(failWork)throw Error("FICTIONAL_PRIVATE_FAILURE_MUST_NOT_ESCAPE");return{available:true,items:[{id:"FICTIONAL_RESULT"}]};},
    storeResult:async()=>{counts.briefings++;return true;},count:async table=>counts[table]};
}
let passed=0;async function test(name,run){await run();passed++;console.log("PASS "+name);}
async function nativeVectorBootstrapCase(){
  await test("diagnostic schema requires raw native-vector bootstrap and rejects the legacy dummy prefix",()=>{
    const calls=[],files={schemaDatei:"/tmp/FICTIONAL_NATIVE_SCHEMA.sql",migrationen:[]};
    const bootstrap={VORBEREITUNG_NATIVE_SQL:"NATIVE_ROLES_PREFIX",VORBEREITUNG_SQL:"LEGACY_DUMMY_PREFIX",NACHBEREITUNG_SQL:"NATIVE_GRANTS_SUFFIX",
      baueLokalesSchema:(root,options)=>{calls.push({root,options});return files;}};
    const native=D.nativeSchemaBootstrap("/tmp/FICTIONAL_NATIVE_SCHEMA",bootstrap);
    assert.deepEqual(calls,[{root:"/tmp/FICTIONAL_NATIVE_SCHEMA",options:{nativeVector:true}}]);
    assert.equal(native.files,files);assert.equal(native.prefix,"NATIVE_ROLES_PREFIX");assert.equal(native.suffix,"NATIVE_GRANTS_SUFFIX");
    for(const value of[undefined,"","create function public.match_knowledge_objects() returns void as 'select null where false'"])
      assert.throws(()=>D.nativeSchemaBootstrap("/tmp/FICTIONAL_NATIVE_SCHEMA",{...bootstrap,VORBEREITUNG_NATIVE_SQL:value}),/diagnostic-native-vector-bootstrap-required/);
    assert.equal(calls.length,1);assert.equal(D.closedFailure({message:"diagnostic-native-vector-version-required",code:"ERR_ASSERTION"}).assertion,"diagnostic-native-vector-version-required");
  });
}
async function projectIdentityCase(){
  await test("independent invented project titles prevent the reproduced cross-case merge",async()=>{
    const U=require("../lib/helmut/understanding"),V=require("../lib/helmut/vorgang-identity"),data=F.cases(epoch);
    const views=["Planungsnotiz","Anhoerungsprotokoll","Finanzuebersicht","Projektbericht"];
    const legacy=data.map(item=>{const title=item.topic+": synthetischer Projektbericht "+String(item.index).padStart(3,"0");
      return{...item,title,documents:item.documents.map((doc,index)=>{const summary=doc.summary.slice(item.title.length+2);
        return{...doc,title:title+" / "+views[index],summary,content_hash:F.sha(summary)};})};});
    for(const [prepared,expected]of[[legacy,"bestand"],[data,"neu"]]){
      const first=prepared[0],cluster={documents:first.documents},response=F.response({input:first.documents.map(d=>d.summary)},{type:"object"},epoch,prepared);
      const ko=U.assembleKnowledgeObject(response,cluster,U.deriveVorgangId(cluster));
      const deps={findVorgangCandidates:async()=>[ko],getExistingStreng:async()=>null,listVorgangDocuments:async()=>first.documents};
      for(const index of[5,53]){const result=await U.resolveVorgang({documents:prepared[index].documents},deps);
        assert.equal(result.resolution,expected);assert.equal(result.spuren.length,1);
        if(expected==="bestand")assert.equal(result.begruendung,"dokumente:kernueberdeckung");
        else assert.equal(result.spuren[0].gleich,false);
      }
    }
    assert.equal(new Set(data.map(c=>U.deriveVorgangId({documents:c.documents}))).size,96);
    assert.equal(new Set(data.map(c=>c.title)).size,96);
    const titles=data.map(c=>V.anchorTokens(c.title));
    for(let i=0;i<titles.length;i++)for(let j=0;j<i;j++)
      assert.equal(V.anchorOverlap(titles[i],titles[j]).spezifischeFamilien,0,"distinct-invented-project-title-required");
    assert(data.every(c=>c.documents.every(d=>d.title===c.title&&d.summary.startsWith(c.title+". "))));
    assert(F.manifest(epoch).minimumSourceTextBytes>2000);
  });
}
async function mockResponseFailureCase(){
  await test("mock response failure keeps its first closed assertion without request or response text",()=>{
    const data=F.cases(epoch),schema={type:"object"},input={input:"CASE_R500_000"};
    for(const [request,shape,prepared,label]of[[input,null,data,"diagnostic-mock-schema-required"],
      [{input:"FICTIONAL_PRIVATE_NO_MARKER"},schema,data,"diagnostic-one-explicit-case"],
      [input,schema,[],"diagnostic-mock-case-binding"],
      [input,schema,[{...data[0],party:123}],"diagnostic-mock-current-understanding-schema"]]){
      let failure;try{F.response(request,shape,epoch,prepared);}catch(error){failure=D.closedFailure(error);}
      assert.equal(failure?.assertion,label);assert.equal(failure.code,"ERR_ASSERTION");assert(!JSON.stringify(failure).includes("FICTIONAL_PRIVATE"));
    }
    const root=temp();try{const c=config(root),factory=D.mockResponseFactory(c,data),request={input:"CASE_R500_000",secret:"FICTIONAL_PRIVATE"};
      assert.throws(()=>factory(request,null));const file=path.join(root,"MOCK_RESPONSE_FAILURE.SAFE.json"),first=fs.readFileSync(file),value=JSON.parse(first);
      assert.deepEqual(Object.keys(value).sort(),["schema","nonce","phase","failureDetail","retryAllowed"].sort());
      assert.equal(value.schema,D.SCHEMA);assert.equal(value.nonce,c.nonce);assert.equal(value.phase,"services");assert.equal(value.retryAllowed,false);
      assert.equal(value.failureDetail.assertion,"diagnostic-mock-schema-required");assert(!first.includes("FICTIONAL_PRIVATE"));
      assert.throws(()=>factory({input:"FICTIONAL_PRIVATE_NO_MARKER"},schema));assert.deepEqual(fs.readFileSync(file),first);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
}
async function understandingErrorProjectionCase(){
  await test("Understanding failures retain fixed AI categories while private raw values remain UNKNOWN",async()=>{
    for(const [message,code]of[["KI Kostenbeleg nicht bestaetigt","LLM_USAGE_NOT_CONFIRMED"],["Azure HTTP 422","AI_PROVIDER_HTTP_422"],
      ["OpenAI HTTP 403","AI_PROVIDER_HTTP_403"],["Azure HTTP 404","AI_PROVIDER_HTTP_404"],["Azure HTTP 499","AI_PROVIDER_HTTP_4XX"],["OpenAI HTTP 599","AI_PROVIDER_HTTP_5XX"],
      ["AI request timeout","AI_REQUEST_TIMEOUT"],["AI request send error","AI_REQUEST_SEND_ERROR"],
      ["AI response too large","AI_RESPONSE_TOO_LARGE"],["AI response aborted","AI_RESPONSE_ABORTED"],["AI response stream error","AI_RESPONSE_STREAM_ERROR"],
      ["KI-Antwort war kein gueltiges JSON","AI_RESPONSE_INVALID_JSON"],["KI-Antwort wurde nicht vollstaendig abgeschlossen","AI_RESPONSE_NOT_COMPLETED"],
      ["KI-Anfrage konnte nicht aufgebaut werden (ERR_INVALID_URL)","AI_REQUEST_BUILD_FAILED"],["self-signed certificate in certificate chain","AI_TLS_ERROR"]]){
      assert.equal(D.understandingErrorCode(message),code);assert.equal(D.closedFailure({code}).code,code);
    }
    for(const raw of["https://FICTIONAL_PRIVATE.invalid/secret","Azure HTTP 422 FICTIONAL_PRIVATE","AI request timeout\nFICTIONAL_PRIVATE",null])
      assert.equal(D.understandingErrorCode(raw),"UNKNOWN");
    for(const [errorCode,expected]of[["KI Kostenbeleg nicht bestaetigt","LLM_USAGE_NOT_CONFIRMED"],["https://FICTIONAL_PRIVATE.invalid/secret","UNKNOWN"]]){
      const root=temp();try{const deps=fake(root);deps.understand=async()=>({status:"skipped-error",errorCode});
        await assert.rejects(D.workload(config(root),{},deps));const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
        assert.equal(result.firstFailurePhase,"understanding");assert.equal(result.firstFailureDetail.assertion,"diagnostic-positive-native-understanding-required");
        assert.equal(result.firstFailureDetail.nativeStatus,"skipped-error");assert.equal(result.firstFailureDetail.code,expected);
        assert.equal(result.finalActiveProfiles,0);assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));
      }finally{fs.rmSync(root,{recursive:true,force:true});}
    }
  });
}
async function diagnosticMigrationSelectionCase(){
  await test("application schema selection excludes protected cohort installations and requires its dependencies",()=>{
    const root=path.join(__dirname,"../supabase/migrations"),all=fs.readdirSync(root).filter(n=>n.endsWith(".sql")&&!/rollback/i.test(n)).map(n=>path.join(root,n));
    const selected=D.diagnosticMigrations(all),names=selected.map(n=>path.basename(n));assert.equal(selected.length,21);
    assert(!names.some(n=>/testfenster|end_runtime|endwaechter|eu_|current_inputs|vier_start|jobqueue/.test(n)));
    const sql=selected.map(file=>fs.readFileSync(file,"utf8")).join("\n");
    for(const symbol of["profil_extras","helmut_reserve_llm_call","helmut_acquire_pipeline_lock","helmut_publish_matching_run","helmut_klasse_belege","helmut_verstehen_speichere","kein_aufruf"])
      assert(sql.includes(symbol));
    assert(!/create extension[^;]*pg_cron|create schema helmut_end500_internal/i.test(sql));
    const missing=all.filter(file=>!file.endsWith("20260728_matching_audit.sql"));assert.throws(()=>D.diagnosticMigrations(missing),/diagnostic-required-schema-migration-missing/);
    assert.throws(()=>D.diagnosticMigrations([...all,selected[0]]),/diagnostic-schema-migration-list-unique/);
    assert.deepEqual(D.diagnosticMigrations([...all,path.join(root,"20990101000000_UNAPPROVED_FUTURE.sql")]),selected);
    const guard=fs.readFileSync(path.join(root,"20261007104720_synthetik500_unabhaengiger_endwaechter.sql"),"utf8");
    assert(guard.includes("(select count(*) from public.mandate_profiles)<>500"));
  });
}
async function localAIProjectionCase(){
  await test("local simulated AI receipt retains finite aggregate counters only",()=>{
    const value=D.localAIReport({bericht:()=>({aufrufe:3,erfolgreich:2,fehler:1,abgewiesenWegenObergrenze:0,
      eingabeZeichen:4096,ausgabeZeichen:1024,eingabeTokenGeschaetzt:1000,ausgabeTokenGeschaetzt:270,zeichenJeToken:3.8,
      gleichzeitigSpitze:1,dauerMs:{n:3,min:1,p50:2,p95:3,max:4,mittel:2.3,private:"FICTIONAL_PRIVATE"},nachModell:{FICTIONAL_PRIVATE:3},apiKey:"FICTIONAL_PRIVATE"})});
    assert.equal(value.aufrufe,3);assert.equal(value.erfolgreich,2);assert.equal(value.eingabeBytes,4096);assert.equal(value.dauerMs.p95,3);
    assert(!JSON.stringify(value).includes("FICTIONAL_PRIVATE"));assert.equal(D.localAIReport(null),"UNKNOWN");
    assert.equal(D.localAIReport({bericht:()=>({aufrufe:NaN})}).aufrufe,"UNKNOWN");
  });
}
async function representativeCoverageCases(){
  await test("all 500 selectors and three canonical geographic scopes are covered by valid synthetic responses",()=>{
    const data=F.cases(epoch),profiles=F.selectedSpecs(3),selected=F.selectedCases(data,profiles),m=F.manifest(epoch);
    const U=require("../lib/helmut/understanding"),S=require("../lib/helmut/understanding-schema");
    assert.equal(m.fixtureRequiredSelectors.profileSelectorCoverage,500);assert.equal(data.length,96);
    assert.deepEqual(profiles.map(p=>p.id),F.specs().filter((_,index)=>[0,330,450].includes(index)).map(p=>p.id));
    assert.deepEqual(selected.map(c=>c.geography.geography_id),["geo-bund","geo-land-berlin","geo-land-brandenburg"]);
    for(const [index,c]of selected.entries()){
      assert(F.matches(c,profiles[index]));const value=F.response({input:c.documents.map(d=>d.summary)},S.KNOWLEDGE_OBJECT_SCHEMA,epoch,data);
      assert.equal(S.validateKnowledgeObject(value).valid,true);assert.equal(value.political_level,index===0?"bund":"land");
      assert.equal(value.decision_level,value.political_level);assert.deepEqual(value.affected_geographies,[c.geography]);
      const actual=U.assembleKnowledgeObject(value,{documents:c.documents},U.deriveVorgangId({documents:c.documents}));
      assert.equal(S.validateKnowledgeObject(actual).valid,true);assert.equal(actual.decision_level,value.decision_level);
      assert.deepEqual(actual.affected_geographies.map(({name,level,geography_id})=>({name,level,geography_id})),value.affected_geographies);
      assert(c.documents.every(d=>d.raw.geography_id===c.geography.geography_id&&d.raw.facts.every(f=>f.region===c.geography.name)));
    }
  });
  await test("three-profile preflight explicitly executes BT, Berlin and Brandenburg then returns zero",async()=>{
    const root=temp();try{const c={...config(root),count:3};assert.equal(D.configuration(c),c);const deps=fake(root,{count:3});
      const result=await D.workload(c,{},deps);assert.equal(result.requestedProfiles,3);assert.equal(result.positiveProfileResults,3);
      assert.equal(result.understoodCases,3);assert.equal(result.finalActiveProfiles,0);assert.equal(result.formal1500Acceptance,false);
      assert.deepEqual([...deps.profiles.keys()],F.selectedSpecs(3).map(p=>p.id));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
}
async function failureProjectionCases(){
  await test("closed action failure preserves SQLSTATE and excludes private text",()=>{
    const root=temp();try{const c=config(root),error=Object.assign(Error("FICTIONAL_PRIVATE_DSN_JWT_SQL_MUST_NOT_ESCAPE"),{
        stderr:"psql:<stdin>:12: ERROR:  42P01\nFICTIONAL_PRIVATE_DSN_JWT_SQL_MUST_NOT_ESCAPE",code:"UNLISTED_PRIVATE_CODE"});
      const projected=D.closedFailure(D.databaseFailure(error));
      assert.deepEqual(projected,{assertion:"UNKNOWN",code:"UNKNOWN",sqlstate:"42P01",nativeStatus:"unknown"});
      const receipt=D.failureReceipt(c,error,"prepare-database");assert.equal(receipt.phase,"prepare-database");
      assert.equal(D.failureReceipt(c,error,"services").phase,"services");assert(!JSON.stringify(receipt).includes("FICTIONAL_PRIVATE"));
      const untrusted={safeResult:{firstFailureDetail:{assertion:"FICTIONAL_PRIVATE",code:"FICTIONAL_PRIVATE",sqlstate:"FICTIONAL_PRIVATE",nativeStatus:"FICTIONAL_PRIVATE",extra:"FICTIONAL_PRIVATE"}}};
      assert.deepEqual(D.failureReceipt(c,untrusted,"work").failureDetail,{assertion:"UNKNOWN",code:"UNKNOWN",sqlstate:"UNKNOWN",nativeStatus:"unknown"});
      assert.equal(D.closedFailure(Error("diagnostic-native-matches-required PRIVATE_SUFFIX")).assertion,"UNKNOWN");
      assert.equal(D.closedFailure(D.databaseFailure({stderr:"ERROR:  ZZ999\n"})).sqlstate,"UNKNOWN");
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("first Understanding assertion survives a secondary deactivation error",async()=>{
    const root=temp();try{const deps=fake(root),original=deps.participate;
      deps.understand=async()=>({status:"disabled",reason:"FICTIONAL_PRIVATE_REASON"});
      deps.participate=async(id,on)=>{if(!on)throw Object.assign(Error("FICTIONAL_PRIVATE_CLEANUP"),{code:"EACCES"});return original(id,on);};
      await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(result.firstFailurePhase,"understanding");
      assert.deepEqual(result.firstFailureDetail,{assertion:"diagnostic-positive-native-understanding-required",code:"ERR_ASSERTION",sqlstate:"UNKNOWN",nativeStatus:"disabled"});
      assert.deepEqual(result.cleanupFailureDetail,{assertion:"UNKNOWN",code:"EACCES",sqlstate:"UNKNOWN",nativeStatus:"unknown"});
      assert.equal(result.finalActiveProfiles,"UNKNOWN");assert.equal(result.retryAllowed,false);assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
}
async function currentSourceValidationCase(){
  const U=require("../lib/helmut/understanding"),data=F.cases(epoch);
  for(const item of F.selectedCases(data,F.selectedSpecs(3))){
    const result=await U.evaluateUnderstandingCase({name:"invented-fixture-binding",raw_documents:item.documents},
      prompt=>F.response({input:prompt},{type:"object"},epoch,data));
    assert.equal(result.valid,true,JSON.stringify(result.errors));
  }
  console.log("PASS invented BT/BE/BB responses satisfy actual source binding without gate changes");
}
async function main(){
  await test("strict independent diagnostic configuration and no full-mode aliases",()=>{
    const root=temp();try{const c=config(root);assert.equal(D.configuration(c),c);
      for(const mutate of [x=>x.count=500,x=>x.mode="mock500",x=>x.database.name="postgres",x=>x.database.host="example.invalid",x=>x.postgrestURL="https://example.invalid",
        x=>x.serviceToken="e30.e30.FICTIONAL",x=>x.privateOriginal="forbidden"]){const x=structuredClone(c);mutate(x);assert.throws(()=>D.configuration(x));}
      assert.deepEqual(D.args(["--app","--config","/tmp/FICTIONAL"]),{action:"--app",configPath:"/tmp/FICTIONAL"});
      assert.throws(()=>D.args(["--app","--count","500"]));assert.throws(()=>D.args(["--skip-gates","--config","/tmp/FICTIONAL"]));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("public dataset is varied, three days, four sources each and explicit scope",()=>{
    const m=F.manifest(epoch),data=F.cases(epoch);assert.equal(data.length,96);assert.equal(m.sourceDocumentCount,384);
    assert.equal(m.syntheticPublicationDays.length,3);assert(m.minimumSourceTextBytes>2000);
    assert.equal(new Set(data.flatMap(c=>c.documents.map(d=>d.content_hash))).size,384);
    assert.deepEqual(m.profileDistribution,{bundestag:330,"landtag-berlin":120,"landtag-brandenburg":50});
    assert.equal(F.specs().length,500);assert(F.specs().every(p=>p.synthetischErlaubt&&p.name.startsWith("Fiktive Testperson")));
    assert.equal(m.originalEquivalent,false);assert.equal(m.professionalAcceptance,false);
  });
  await test("two simulated responses use current real Understanding validation and assembly",()=>{
    const U=require("../lib/helmut/understanding"),S=require("../lib/helmut/understanding-schema"),data=F.cases(epoch);
    for(const index of[0,9]){const c=data[index],response=F.response({input:c.documents.map(d=>d.summary)},S.KNOWLEDGE_OBJECT_SCHEMA,epoch,data);
      assert.equal(S.validateKnowledgeObject(response).valid,true);
      const cluster={documents:c.documents},vorgang=U.deriveVorgangId(cluster);
      const actual=U.assembleKnowledgeObject(response,cluster,vorgang);
      assert.equal(actual.understanding_status,"complete");assert.equal(actual.vorgang_id,vorgang);
      assert.equal(S.validateKnowledgeObject(actual).valid,true);assert(actual.was_ist_passiert.length>20);
    }
    assert.throws(()=>F.response({input:"unbound"},S.KNOWLEDGE_OBJECT_SCHEMA,epoch,data));
    assert.throws(()=>F.response({input:"CASE_R500_000 CASE_R500_009"},S.KNOWLEDGE_OBJECT_SCHEMA,epoch,data));
  });
  await test("genuine provisioning validators accept synthetic specs without readiness stubs",()=>{
    const P=require("../lib/helmut/provisioning"),R=require("../lib/helmut/profile-readiness"),V=require("../lib/helmut/profile-validation");
    const specs=F.specs();for(const index of[0,330,450]){const spec={...specs[index],password:"FICTIONAL_TEST_PASSWORD_ONLY"};
      assert.deepEqual(P.validateSpec(spec),[]);const profile=P.buildProfile(spec,{aktiv:false});
      assert(R.pruefeNeuaktivierung(profile).zulaessig);assert(!["fehlerhaft","nicht_bereit"].includes(V.validateProfile({...profile,profileActive:true}).state));
    }
  });
  await test("two-profile orchestration holds exact active set through real-work seams and returns zero",async()=>{
    const root=temp();try{const deps=fake(root),result=await D.workload(config(root),{},deps);
      assert.equal(result.requestedProfiles,2);assert.equal(result.positiveProfileResults,2);assert.equal(result.understoodCases,2);
      assert.equal(result.finalActiveProfiles,0);assert(result.activeCohortReadbacks>=5);assert.equal(result.formal1500Acceptance,false);
      assert.equal(deps.events.filter(x=>x==="actual-work-seam").length,2);assert.equal(deps.active.size,0);
      const before=deps.events.length;await assert.rejects(D.workload(config(root),{},deps));assert.equal(deps.events.length,before);
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("first work failure preserves closed phase, no retry, and deactivates owned profiles",async()=>{
    const root=temp();try{const deps=fake(root,{failWork:true});await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));assert.equal(result.firstFailurePhase,"work");
      assert.equal(result.finalActiveProfiles,0);assert.equal(deps.events.filter(x=>x==="actual-work-seam").length,1);
      assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));assert.equal(result.retryAllowed,false);
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("unknown active identities never start understanding or claim cleanup zero",async()=>{
    const root=temp();try{const deps=fake(root,{wrongActive:true});await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));assert.equal(result.firstFailurePhase,"activate");
      assert.equal(result.finalActiveProfiles,"UNKNOWN");assert.equal(deps.events.includes("understand"),false);
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("an existing active cohort is preserved rather than adopted by cleanup",async()=>{
    const root=temp();try{const deps=fake(root);for(const spec of F.specs().slice(0,2)){
        deps.profiles.set(spec.id,{id:spec.id,profileActive:true,provisionedBy:"helmut-provisioning"});deps.active.add(spec.id);}
      await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(result.firstFailurePhase,"dataset");assert.equal(result.finalActiveProfiles,"UNKNOWN");
      assert.equal(deps.events.length,0);assert.equal(deps.active.size,2);
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("private file mode and symlink errors fail closed",()=>{
    const root=temp();try{const file=path.join(root,"CONFIG.PRIVATE.json");fs.writeFileSync(file,JSON.stringify(config(root)),{mode:0o600});
      assert.equal(D.privateJSON(file).schema,D.SCHEMA);fs.chmodSync(file,0o644);assert.throws(()=>D.privateJSON(file));
      const link=path.join(root,"LINK.PRIVATE.json");fs.symlinkSync(file,link);assert.throws(()=>D.privateJSON(link));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await failureProjectionCases();
  await representativeCoverageCases();
  await localAIProjectionCase();
  await diagnosticMigrationSelectionCase();
  await understandingErrorProjectionCase();
  await currentSourceValidationCase();
  await mockResponseFailureCase();
  await projectIdentityCase();
  await nativeVectorBootstrapCase();
  console.log(passed+" PASS; synthetic unit cases only; native preflight and 500 run NOT executed");
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={currentSourceValidationCase,main,failureProjectionCases,representativeCoverageCases,localAIProjectionCase,diagnosticMigrationSelectionCase,understandingErrorProjectionCase,mockResponseFailureCase,projectIdentityCase,nativeVectorBootstrapCase};
