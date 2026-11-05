"use strict";
// Bounded pure/synthetic preflight cases; never the full Mock100 workload or DB.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const D=require("./synthetik-500-resource-diagnostic"),F=require("./fixtures/resource500-diagnostic");
const epoch=new Date().toISOString(),nonce="a".repeat(32);
const temp=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),"resource500-fictional-"));fs.chmodSync(p,0o700);return p;};
function config(root){const claims={role:"service_role",resourceDiagnosticNonce:nonce,exp:Math.floor(Date.now()/1000)+600};
  return{schema:D.SCHEMA,mode:"preflight",count:2,nonce,database:{host:"127.0.0.1",port:5432,name:"helmut_mock100_preflight_"+nonce,user:"postgres",password:"FICTIONAL_ONLY"},
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
    generateLage:async()=>{assert.equal(active.size,count);events.push("actual-draft-review-seam");return{available:true};},
    storeResult:async()=>{counts.briefings+=3;return{verified:true,positions:3,draftPhases:1,reviewPhases:1,rowsSHA256:"b".repeat(64),tenantChecks:4};},count:async table=>counts[table]};
}
let passed=0;async function test(name,run){await run();passed++;console.log("PASS "+name);}
const progressFile=root=>path.join(root,"APP_PROGRESS.SAFE.json");
function readProgress(root){const file=progressFile(root),s=fs.lstatSync(file),raw=fs.readFileSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&(s.mode&511)===384&&s.uid===process.getuid()&&s.nlink===1&&raw.length<=8192);return JSON.parse(raw);}
async function progressChannelCases(){
  await test("three-profile success publishes bounded atomic confirmed progress before every dependency await",async()=>{
    const root=temp();try{const deps=fake(root,{count:3}),frames=[],c={...config(root),count:3};
      for(const key of Object.keys(deps).filter(key=>typeof deps[key]==="function")){const run=deps[key];deps[key]=async(...args)=>{
        const frame=readProgress(root);assert(frame.sequence>(frames.at(-1)?.sequence||0));frames.push(frame);return run(...args);};}
      await D.workload(c,{},deps);const frame=readProgress(root);
      assert.deepEqual(Object.keys(frame).sort(),["schema","nonce","requestedProfiles","sequence","phase","operation","provisionedProfiles","activatedProfiles","activeCohortReadbacks","sourceDocumentsSaved","understoodCases","matchingProfiles","decisionProfiles","positiveProfileResults","deactivatedProfiles","finalActiveProfiles"].sort());
      assert.equal(frame.phase,"closed");assert.equal(frame.operation,"closed");assert.equal(frame.requestedProfiles,3);assert.equal(frame.finalActiveProfiles,0);
      for(const key of["provisionedProfiles","activatedProfiles","understoodCases","matchingProfiles","decisionProfiles","positiveProfileResults","deactivatedProfiles"])assert.equal(frame[key],3);
      assert.equal(frame.sourceDocumentsSaved,12);assert.equal(frame.activeCohortReadbacks,11);assert(frame.sequence<=10000);
      assert(frames.every(f=>f.finalActiveProfiles==="UNKNOWN"));assert(!JSON.stringify(frame).includes("test-kohorte"));assert(!JSON.stringify(frame).includes("FICTIONAL"));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("second-profile work failure freezes its last confirmed counts despite UNKNOWN cleanup",async()=>{
    const root=temp();try{const deps=fake(root),build=deps.build,participate=deps.participate;let attempts=0,frozen;
      deps.build=async(...args)=>{if(++attempts===2)throw Error("FICTIONAL_PRIVATE_BUILD_CONTENT");return build(...args);};
      deps.participate=async(id,on)=>{if(!on){frozen=fs.readFileSync(progressFile(root));throw Object.assign(Error("FICTIONAL_PRIVATE_CLEANUP"),{code:"EACCES"});}return participate(id,on);};
      await assert.rejects(D.workload(config(root),{},deps));const frame=readProgress(root),result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(frame.phase,"work");assert.equal(frame.operation,"briefing-build");assert.equal(frame.positiveProfileResults,1);assert.equal(frame.matchingProfiles,2);assert.equal(frame.decisionProfiles,2);
      assert.equal(frame.deactivatedProfiles,0);assert.equal(frame.finalActiveProfiles,"UNKNOWN");assert.deepEqual(fs.readFileSync(progressFile(root)),frozen);
      assert.equal(result.firstFailurePhase,"work");assert.equal(result.finalActiveProfiles,"UNKNOWN");assert(!JSON.stringify(frame).includes("FICTIONAL_PRIVATE"));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("signal freezes the current phase synchronously and successful cleanup cannot replace it",async()=>{
    const root=temp();try{const deps=fake(root,{count:3}),match=deps.match;let attempts=0,frozen;
      deps.match=async(...args)=>{if(++attempts===2){process.emit("SIGTERM");frozen=fs.readFileSync(progressFile(root));}return match(...args);};
      await assert.rejects(D.workload({...config(root),count:3},{},deps));const frame=readProgress(root),result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(frame.phase,"work");assert.equal(frame.operation,"match");assert.equal(frame.matchingProfiles,1);assert.equal(frame.positiveProfileResults,1);
      assert.equal(frame.finalActiveProfiles,"UNKNOWN");assert.equal(frame.deactivatedProfiles,0);assert.deepEqual(fs.readFileSync(progressFile(root)),frozen);
      assert.equal(result.finalActiveProfiles,0);assert.equal(deps.active.size,0);
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("atomic progress never truncates an old frame or adopts an existing unsafe target",()=>{
    const root=temp();try{const c=config(root),writer=D.appProgress(c);writer.before("dataset","idle");const before=fs.readFileSync(progressFile(root)),rename=fs.renameSync;let observed=false;
      fs.renameSync=(from,to)=>{assert.deepEqual(fs.readFileSync(to),before);assert(JSON.parse(fs.readFileSync(from)).sequence>JSON.parse(before).sequence);observed=true;return rename(from,to);};
      try{writer.confirmed("provisionedProfiles");writer.before("provision","profile-provision");}finally{fs.renameSync=rename;}
      assert(observed);assert.equal(readProgress(root).provisionedProfiles,1);assert.equal(fs.readdirSync(root).length,1);
      assert.throws(()=>writer.before("work","FICTIONAL_PRIVATE_URL"));assert.throws(()=>writer.confirmed("FICTIONAL_PRIVATE_ID"));
      fs.chmodSync(progressFile(root),0o644);const old=fs.readFileSync(progressFile(root));assert.throws(()=>writer.before("work","match"));assert.deepEqual(fs.readFileSync(progressFile(root)),old);
      fs.unlinkSync(progressFile(root));const target=path.join(root,"SOURCE.PRIVATE.json");fs.writeFileSync(target,"FICTIONAL_PRIVATE",{mode:0o600});fs.symlinkSync(target,progressFile(root));
      assert.throws(()=>D.appProgress(c).before("dataset","idle"));assert.equal(fs.readFileSync(target,"utf8"),"FICTIONAL_PRIVATE");
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
}
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
    assert(F.manifest(epoch).minimumSourceTextBytes>700);assert(F.manifest(epoch).maximumSourceTextBytes<=1400);
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
  await test("all100 selected profiles and three canonical geographic scopes have valid synthetic responses",()=>{
    const data=F.cases(epoch),profiles=F.selectedSpecs(3),selected=F.selectedCases(data,profiles),m=F.manifest(epoch);
    const U=require("../lib/helmut/understanding"),S=require("../lib/helmut/understanding-schema");
    assert.equal(m.fixtureRequiredSelectors.profileSelectorCoverage,100);assert.equal(data.length,96);
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
  await test("real assertion code positions survive while forged headers, private paths and unlisted fields are discarded",()=>{
    const root=temp();try{let error;try{D.configuration({...config(root),count:99});}catch(caught){error=caught;}
      assert(error);const detail=D.closedFailure(error);assert.equal(detail.code,"ERR_ASSERTION");
      assert.equal(detail.codepoint?.module,"scripts/synthetik-500-resource-diagnostic.js");
      assert(["configuration","Object.configuration"].includes(detail.codepoint.function));assert(Number.isInteger(detail.codepoint.line)&&detail.codepoint.line>0);
      const privateText="FICTIONAL_PRIVATE_SECRET",file=path.resolve(__dirname,"synthetik-500-resource-diagnostic.js");
      const forged={name:"Error",message:privateText,stack:"UNTRUSTED HEADER\n    at workload ("+file+":12:1)"};
      assert.equal(D.closedFailure(forged).codepoint,null);
      assert.equal(D.closedFailure({...forged,stack:"Error: "+privateText+"\n    at workload (/PRIVATE/"+privateText+":12:1)"}).codepoint,null);
      for(const point of[{...detail.codepoint,raw:privateText},{...detail.codepoint,line:true},{...detail.codepoint,line:100000},
        {...detail.codepoint,module:privateText},{...detail.codepoint,function:privateText}]){
        const receipt=D.failureReceipt(config(root),{safeResult:{firstFailureDetail:{...detail,codepoint:point}}},"work");
        assert.equal(receipt.failureDetail.codepoint,null);assert(!JSON.stringify(receipt).includes(privateText));
      }
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  await test("closed action failure preserves SQLSTATE and excludes private text",()=>{
    const root=temp();try{const c=config(root),error=Object.assign(Error("FICTIONAL_PRIVATE_DSN_JWT_SQL_MUST_NOT_ESCAPE"),{
        stderr:"psql:<stdin>:12: ERROR:  42P01\nFICTIONAL_PRIVATE_DSN_JWT_SQL_MUST_NOT_ESCAPE",code:"UNLISTED_PRIVATE_CODE"});
      const projected=D.closedFailure(D.databaseFailure(error));
      assert.deepEqual(projected,{assertion:"UNKNOWN",code:"UNKNOWN",sqlstate:"42P01",nativeStatus:"unknown",codepoint:null});
      const receipt=D.failureReceipt(c,error,"prepare-database");assert.equal(receipt.phase,"prepare-database");
      assert.equal(D.failureReceipt(c,error,"services").phase,"services");assert(!JSON.stringify(receipt).includes("FICTIONAL_PRIVATE"));
      const untrusted={safeResult:{firstFailureDetail:{assertion:"FICTIONAL_PRIVATE",code:"FICTIONAL_PRIVATE",sqlstate:"FICTIONAL_PRIVATE",nativeStatus:"FICTIONAL_PRIVATE",extra:"FICTIONAL_PRIVATE",
        codepoint:{module:"FICTIONAL_PRIVATE",function:"FICTIONAL_PRIVATE",line:1,raw:"FICTIONAL_PRIVATE"}}}};
      assert.deepEqual(D.failureReceipt(c,untrusted,"work").failureDetail,{assertion:"UNKNOWN",code:"UNKNOWN",sqlstate:"UNKNOWN",nativeStatus:"unknown",codepoint:null});
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
      assert.deepEqual({...result.firstFailureDetail,codepoint:null},{assertion:"diagnostic-positive-native-understanding-required",code:"ERR_ASSERTION",sqlstate:"UNKNOWN",nativeStatus:"disabled",codepoint:null});
      assert.deepEqual({...result.cleanupFailureDetail,codepoint:null},{assertion:"UNKNOWN",code:"EACCES",sqlstate:"UNKNOWN",nativeStatus:"unknown",codepoint:null});
      assert.equal(result.cleanupFailureDetail.codepoint?.module,"scripts/synthetik-500-resource-diagnostic.js");
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
async function mock100ContractCases(){
  await test("Mock100 configuration accepts exactly100 and rejects old500 and off-by-one counts before work",()=>{
    const root=temp();try{
      const c={...config(root),mode:"mock100",count:100,database:{...config(root).database,name:"helmut_mock100_"+nonce}};
      assert.equal(D.configuration(c),c);
      for(const count of[0,1,2,3,99,101,500,"100",true,NaN])assert.throws(()=>D.configuration({...c,count}));
      for(const mode of["synthetic500","mock500","production100","production500"])
        assert.throws(()=>D.configuration({...c,mode}));
      assert.equal(fs.readdirSync(root).length,0,"contract checks must not start a workload or write evidence");
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  await test("Mock100 cohort is a deterministic unique66/24/10 selection with valid fictional tenant specifications",()=>{
    const selected=F.selectedSpecs(100),all=F.specs(),data=F.cases(epoch);
    assert.equal(selected.length,100);assert.equal(new Set(selected.map(p=>p.id)).size,100);
    assert.deepEqual(F.selectedSpecs(100),selected);
    const distribution={bundestag:0,"landtag-berlin":0,"landtag-brandenburg":0};
    const P=require("../lib/helmut/provisioning"),R=require("../lib/helmut/profile-readiness");
    for(const spec of selected){
      const key=spec.parliamentType==="Bundestag"?"bundestag":spec.state==="Berlin"?"landtag-berlin":spec.state==="Brandenburg"?"landtag-brandenburg":null;
      assert(key,"unexpected mandate level or state");distribution[key]++;
      assert.deepEqual(all.find(p=>p.id===spec.id),spec,"selection must preserve canonical synthetic identities");
      assert(spec.synthetischErlaubt&&spec.name.startsWith("Fiktive Testperson")&&spec.email.endsWith("@example.invalid"));
      assert.deepEqual(P.validateSpec({...spec,password:"FICTIONAL_TEST_PASSWORD_ONLY"}),[]);
      assert(R.pruefeNeuaktivierung(P.buildProfile(spec,{aktiv:false})).zulaessig);
      assert(data.some(item=>F.matches(item,spec)),"each selected mandate needs source selectors before work");
    }
    assert.deepEqual(distribution,{bundestag:66,"landtag-berlin":24,"landtag-brandenburg":10});
    for(const invalid of[0,1,99,101,500,"100",true])assert.throws(()=>F.selectedSpecs(invalid));
  });
  await test("confirmed progress cannot overcount or publish unconfirmed final zero",()=>{
    const root=temp();try{const writer=D.appProgress(config(root));writer.before("work","briefing-store");
      assert.throws(()=>writer.zero());
      writer.confirmed("positiveProfileResults");writer.before("work","briefing-store");
      assert.equal(readProgress(root).positiveProfileResults,1);
      writer.confirmed("positiveProfileResults");writer.before("work","briefing-store");
      assert.equal(readProgress(root).positiveProfileResults,2);
      assert.throws(()=>writer.confirmed("positiveProfileResults"));
      writer.freeze();const frozen=fs.readFileSync(progressFile(root));
      writer.confirmed("positiveProfileResults");writer.before("closed","closed");
      assert.deepEqual(fs.readFileSync(progressFile(root)),frozen);
      assert.equal(readProgress(root).finalActiveProfiles,"UNKNOWN");
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
}
async function mock100ReactionCases(){
  await test("a false or incomplete native receipt cannot acknowledge a profile",async()=>{
    const good={verified:true,positions:3,draftPhases:1,reviewPhases:1,rowsSHA256:"b".repeat(64),tenantChecks:4};
    for(const receipt of[true,false,null,{...good,verified:false},{...good,positions:2},{...good,positions:4},
      {...good,draftPhases:0},{...good,reviewPhases:0},{...good,tenantChecks:0},{...good,rowsSHA256:"FICTIONAL_PRIVATE"}]){
      const root=temp();try{const deps=fake(root);let writes=0;deps.storeResult=async()=>{writes++;return receipt;};
        await assert.rejects(D.workload(config(root),{},deps));
        const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
        assert.equal(writes,1);assert.equal(result.positiveProfileResults,0);assert.equal(result.firstFailurePhase,"work");
        assert.equal(readProgress(root).positiveProfileResults,0);assert.equal(result.finalActiveProfiles,0);
        assert.equal(result.retryAllowed,false);assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));
      }finally{fs.rmSync(root,{recursive:true,force:true});}
    }
  });
  await test("second native result failure retains exactly one confirmed profile and stops the remaining cohort",async()=>{
    const root=temp();try{const deps=fake(root,{count:3}),store=deps.storeResult;let attempts=0;
      deps.storeResult=async(...args)=>{if(++attempts===2)throw Object.assign(Error("FICTIONAL_PRIVATE_READBACK"),{code:"EIO"});return store(...args);};
      await assert.rejects(D.workload({...config(root),count:3},{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(attempts,2);assert.equal(result.positiveProfileResults,1);assert.equal(readProgress(root).positiveProfileResults,1);
      assert.equal(result.finalActiveProfiles,0);assert.equal(deps.active.size,0);assert.equal(result.firstFailurePhase,"work");
      assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  await test("abort during model work prevents the next output stage and still performs owned cleanup",async()=>{
    const root=temp();try{const deps=fake(root),generate=deps.generateLage;let modelCalls=0;
      deps.generateLage=async(...args)=>{modelCalls++;process.emit("SIGTERM");return generate(...args);};
      await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(modelCalls,1);assert.equal(deps.events.includes("actual-work-seam"),false);
      assert.equal(result.positiveProfileResults,0);assert.equal(result.finalActiveProfiles,0);assert.equal(deps.active.size,0);
      assert.equal(result.firstFailureDetail.assertion,"diagnostic-stop-or-deadline");
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  await test("one owned cleanup failure cannot suppress attempts for other profiles or replace the first work failure",async()=>{
    const root=temp();try{const deps=fake(root,{failWork:true}),participate=deps.participate,activeIDs=deps.activeIDs;
      const cleanupAttempts=[];let cleanupStarted=false,finalReads=0;
      deps.participate=async(id,on)=>{if(!on){cleanupStarted=true;cleanupAttempts.push(id);if(cleanupAttempts.length===1)throw Object.assign(Error("FICTIONAL_PRIVATE_CLEANUP"),{code:"EACCES"});}return participate(id,on);};
      deps.activeIDs=async()=>{if(cleanupStarted)finalReads++;return activeIDs();};
      await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));
      assert.equal(cleanupAttempts.length,2);assert.equal(new Set(cleanupAttempts).size,2);assert(finalReads>=1);
      assert.equal(result.firstFailurePhase,"work");assert.equal(result.cleanupFailureDetail.code,"EACCES");
      assert.notEqual(result.finalActiveProfiles,0);assert.equal(result.positiveProfileResults,0);
      assert(!JSON.stringify(result).includes("FICTIONAL_PRIVATE"));
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  await test("final evidence write failure preserves the first bounded runtime cause and completed cleanup",async()=>{
    const root=temp(),open=fs.openSync;try{const deps=fake(root);let caught;
      deps.understand=async()=>({status:"disabled"});
      fs.openSync=(file,...args)=>{if(file===path.join(root,"APP_RESULT.SAFE.json"))throw Object.assign(Error("FICTIONAL_PRIVATE_DISK"),{code:"EACCES"});return open(file,...args);};
      try{await D.workload(config(root),{},deps);}catch(error){caught=error;}
      assert(caught,"failure must propagate");assert(caught.safeResult,"original closed evidence must survive a failed file write");
      assert.equal(caught.safeResult.firstFailurePhase,"understanding");
      assert.equal(caught.safeResult.firstFailureDetail.assertion,"diagnostic-positive-native-understanding-required");
      assert.equal(caught.safeResult.firstFailureDetail.nativeStatus,"disabled");
      assert.equal(caught.safeResult.finalActiveProfiles,0);assert.equal(deps.active.size,0);
      assert(!JSON.stringify(caught.safeResult).includes("FICTIONAL_PRIVATE"));
    }finally{fs.openSync=open;fs.rmSync(root,{recursive:true,force:true});}
  });
}
function nativeRowsFixture(){
  const B=require("../lib/helmut/briefing-speicher"),L=require("../lib/helmut/briefing-lauf"),A=require("../lib/helmut/briefing-ausgabebeleg");
  const profile={id:"mock100-unit-fictional",committees:["Haushalt"],focusTopics:["Rentenreform"]};
  const generatedAt=new Date().toISOString(),day=require("../lib/helmut/briefing-frische").berlinTagKey(generatedAt);
  const lage=require("./fixtures/lage-beleg").payload(),Q=require("../lib/helmut/lage-quellenbeleg");
  for(const group of lage.quellen)for(const q of group.quellenbelege){const previous=q.quelle_id;
    q.quelle_id=Q.quelleIdFuer(group.vorgang_id,q.url);q.auszug=q.titel;q.veroeffentlichtAm=generatedAt;
    for(const p of lage.paragraphs)if(p.quellen_ids[0]===previous){p.quellen_ids=[q.quelle_id];p.belegstellen[0].quelle_id=q.quelle_id;}}
  lage.quellenHash=Q.hashEingabe(lage.quellen);
  const briefing={available:true,items:[{title:"Fiktive Beratung vorbereiten"}],
    currentHelmutState:{tagesAnlass:{art:"neue-quelle",text:"Fiktive Tagesberatung"}},currentRadarState:{}};
  const packet={id:`bf-${profile.id}-mandatsbriefing-${day}`,user_id:profile.id,slot:"mandatsbriefing",generated_at:generatedAt,
    payload:{version:B.VERSION,mandat:profile.id,tag:day,profilHash:B.profilHash(profile),profilHashVersion:2,
      briefing,lage,inhaltHash:B.hash({briefing,lage}),pruefung:B.pruefeInhalt(briefing,lage),erzeugtAm:generatedAt}};
  const receipt=L.quittung({tenantId:profile.id,berlinTag:day,status:L.STATUS_ERFOLG,erzeugtAm:generatedAt,
    signatur:L.inhaltsSignatur(briefing),ausgabeBeleg:A.ausPaket(packet)});
  return{profile,rows:[packet,{id:`bf-${profile.id}-lage-${day}`,user_id:profile.id,slot:"lage",generated_at:generatedAt,payload:lage},
    {id:`bf-${profile.id}-morgenlage-${day}`,user_id:profile.id,slot:"morgenlage",generated_at:generatedAt,payload:receipt}],
    options:{day,startedAt:generatedAt,expectedSources:lage.quellen.flatMap(v=>v.quellenbelege.map(q=>({url:q.url,title:q.titel,summary:q.auszug,published_at:q.veroeffentlichtAm})))}};
}
async function nativeResultsCases(){
  await test("all three native positions require matching tenant, content, source and morning receipt bindings",()=>{
    const f=nativeRowsFixture(),receipt=D.verifyProfileRows(f.profile,f.rows,f.options);
    assert.equal(receipt.verified,true);assert.equal(receipt.positions,3);assert.equal(receipt.tenantChecks,4);
    assert.match(receipt.rowsSHA256,/^[a-f0-9]{64}$/);
    const reverse=[...f.rows].reverse();assert.equal(D.verifyProfileRows(f.profile,reverse,f.options).verified,true);
    assert.deepEqual(D.assessProfileRows(f.profile,f.rows,f.options),{missing:0,empty:0,duplicate:0,technicallyInvalid:0,unusable:0});
  });
  await test("native output assessment records each of the five failure categories without converting unobserved rows into success",()=>{
    const mutations=[
      ["missing",rows=>rows.pop()],
      ["empty",rows=>{rows[1].payload={};}],
      ["duplicate",rows=>rows.push(structuredClone(rows[0]))],
      ["technicallyInvalid",rows=>{rows[2].user_id="foreign";}],
      ["unusable",rows=>{rows[0].payload.pruefung.strukturellVollstaendig=false;}]
    ];
    for(const [category,mutate]of mutations){const f=nativeRowsFixture();mutate(f.rows);
      const assessment=D.assessProfileRows(f.profile,f.rows,f.options);assert(assessment[category]>0,category);
      assert.deepEqual(Object.keys(assessment).sort(),["missing","empty","duplicate","technicallyInvalid","unusable"].sort());
      assert(Object.values(assessment).every(n=>Number.isInteger(n)&&n>=0));
      assert.throws(()=>D.verifyProfileRows(f.profile,f.rows,f.options),error=>{
        assert.deepEqual(error.diagnosticOutputErrors,assessment);return true;});
    }
    const f=nativeRowsFixture();assert.equal(D.assessProfileRows(f.profile,null,f.options).missing,3);
  });
  await test("missing, duplicate, empty, unusable or technically inconsistent outputs cannot pass native completeness",()=>{
    const mutations=[
      rows=>rows.pop(),
      rows=>rows.push(structuredClone(rows[0])),
      rows=>{rows[2]=structuredClone(rows[1]);},
      rows=>{rows[1].payload.paragraphs=[];},
      rows=>{rows[0].payload.briefing.items=[];},
      rows=>{rows[0].payload.pruefung.strukturellVollstaendig=false;},
      rows=>{rows[2].payload.status="fehler";},
      rows=>{rows[2].payload.signatur="a".repeat(64);},
      rows=>{rows[0].payload.briefing.items[0].title="FICTIONAL_CHANGED_AFTER_STORAGE";},
      rows=>{rows[1].payload.paragraphs[0].text+=" Unbelegt wurden 987654321 neue Stellen geschaffen.";}
    ];
    for(const mutate of mutations){const f=nativeRowsFixture();mutate(f.rows);assert.throws(()=>D.verifyProfileRows(f.profile,f.rows,f.options));}
  });
  await test("foreign tenant, stale timestamps, unbound sources and forged receipt all stop native output validation",()=>{
    for(const mutate of[
      f=>{f.rows[0].user_id="foreign";},f=>{f.rows[1].id="bf-foreign-lage-"+f.options.day;},
      f=>{f.rows[2].payload.tenantId="foreign";},f=>{f.rows[2].payload.ausgabeBeleg.mandat="foreign";},
      f=>{f.rows[1].generated_at=new Date(Date.parse(f.options.startedAt)-1).toISOString();},
      f=>{f.rows[0].generated_at=new Date(Date.now()+60000).toISOString();},
      f=>{f.options.expectedSources=[];},f=>{f.options.expectedSources[0].title="FICTIONAL_OTHER_SOURCE";}
    ]){const f=nativeRowsFixture();mutate(f);assert.throws(()=>D.verifyProfileRows(f.profile,f.rows,f.options));}
  });
}
async function main(){
  await mock100ContractCases();
  await mock100ReactionCases();
  await nativeResultsCases();
  await test("strict independent diagnostic configuration and no full-mode aliases",()=>{
    const root=temp();try{const c=config(root);assert.equal(D.configuration(c),c);
      for(const mutate of [x=>x.count=500,x=>x.mode="mock500",x=>x.database.name="postgres",x=>x.database.host="example.invalid",x=>x.postgrestURL="https://example.invalid",
        x=>x.serviceToken="e30.e30.FICTIONAL",x=>x.privateOriginal="forbidden"]){const x=structuredClone(c);mutate(x);assert.throws(()=>D.configuration(x));}
      assert.deepEqual(D.args(["--app","--config","/tmp/FICTIONAL"]),{action:"--app",configPath:"/tmp/FICTIONAL"});
      assert.throws(()=>D.args(["--app","--count","500"]));assert.throws(()=>D.args(["--skip-gates","--config","/tmp/FICTIONAL"]));
    }finally{fs.rmSync(root,{recursive:true,force:true});}});
  await test("public dataset is varied, currently dated, four sources each and explicit100 scope",()=>{
    const m=F.manifest(epoch),data=F.cases(epoch);assert.equal(data.length,96);assert.equal(m.sourceDocumentCount,384);
    assert.equal(m.syntheticPublicationDays.length,1);assert(m.minimumSourceTextBytes>700);assert(m.maximumSourceTextBytes<=1400);
    assert(data.every(item=>item.documents.every(doc=>Date.parse(doc.published_at)<=Date.parse(epoch)
      &&Date.parse(epoch)-Date.parse(doc.published_at)<60000)),"all synthetic current-day inputs must precede their bound run epoch");
    assert.equal(new Set(data.flatMap(c=>c.documents.map(d=>d.content_hash))).size,384);
    assert.deepEqual(m.profileDistribution,{bundestag:66,berlin:24,brandenburg:10});assert.equal(m.profileCount,100);
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
  await test("unknown active identities never start understanding while proven-owned cleanup must read actual zero",async()=>{
    const root=temp();try{const deps=fake(root,{wrongActive:true});await assert.rejects(D.workload(config(root),{},deps));
      const result=JSON.parse(fs.readFileSync(path.join(root,"APP_RESULT.SAFE.json")));assert.equal(result.firstFailurePhase,"activate");
      assert.equal(result.finalActiveProfiles,0);assert.equal(deps.active.size,0);assert.equal(deps.events.includes("understand"),false);
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
  await progressChannelCases();
  console.log(passed+" PASS; synthetic unit cases only; native preflight and full Mock100 NOT executed");
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={currentSourceValidationCase,main,failureProjectionCases,representativeCoverageCases,localAIProjectionCase,diagnosticMigrationSelectionCase,understandingErrorProjectionCase,mockResponseFailureCase,projectIdentityCase,nativeVectorBootstrapCase,progressChannelCases};
