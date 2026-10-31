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
function fake(root,{failWork=false,wrongActive=false}={}){
  const profiles=new Map(),active=new Set(),events=[];let counts={raw_documents:0,knowledge_objects:0,ko_document_links:0,matching_results:0,briefings:0};
  return{events,profiles,active,
    activeIDs:async()=>wrongActive&&active.size===2?["FICTIONAL_FOREIGN"]:[...active].sort(),
    profile:async id=>profiles.get(id)||null,
    provision:async spec=>{events.push("provision");profiles.set(spec.id,{id:spec.id,profileActive:false,provisionedBy:"helmut-provisioning"});return{ok:true};},
    participate:async(id,on)=>{events.push(on?"activate":"deactivate");profiles.get(id).profileActive=on;on?active.add(id):active.delete(id);return{ok:true};},
    saveSource:async()=>{counts.raw_documents++;return{saved:true};},
    understand:async cluster=>{assert.equal(active.size,2);assert.equal(cluster.documents.length,4);events.push("understand");counts.knowledge_objects++;counts.ko_document_links+=4;return{status:"saved"};},
    match:async()=>{counts.matching_results++;return{saved:1};},decide:async()=>({saved:1}),
    build:async()=>{assert.equal(active.size,2);events.push("actual-work-seam");if(failWork)throw Error("FICTIONAL_PRIVATE_FAILURE_MUST_NOT_ESCAPE");return{available:true,items:[{id:"FICTIONAL_RESULT"}]};},
    storeResult:async()=>{counts.briefings++;return true;},count:async table=>counts[table]};
}
let passed=0;async function test(name,run){await run();passed++;console.log("PASS "+name);}
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
  console.log(passed+" PASS; synthetic unit cases only; native preflight and 500 run NOT executed");
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
