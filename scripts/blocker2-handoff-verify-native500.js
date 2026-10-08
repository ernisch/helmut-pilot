"use strict";
const F=require('fs'),C=require('crypto'),A=require('assert/strict'),R=require('readline');
const T=require('./privater-nachweis-transport');
const ctx=JSON.parse(F.readFileSync(__dirname+'/FRESH_GITHUB_CONTEXT.json'));
const key=F.readFileSync(ctx.privateKey.path),rows=[],manifests=[];
const stream=R.createInterface({input:process.stdin,crlfDelay:Infinity});
const sha=s=>C.createHash('sha256').update(s).digest('hex');
stream.on('line',line=>{
 try{
  const x=JSON.parse(line),position=x.name==='manifest.json'?1:Number(x.name.slice(0,4));
  A.equal(x.envelope.meta.empfaenger,'8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7');
  const value=T.entschluesseln(x.envelope,key,{runId:'37790661298',commit:'7904945181ad58faf456d013bec7f5fdd718052a',tag:'2026-10-08',abPosition:position,anzahl:1});
  if(x.name==='manifest.json'){
   A.equal(value.runId,'37790661298');A.equal(value.purpose,'blocker2-readonly500-manifest');
   manifests.push({sourceArtifactId:x.sourceArtifactId,manifest:value});return;
  }
  A.equal(value.position,position);A.equal(value.tag,'2026-10-08');A.equal(value.productionCommit,'d6147232add23e83b39e15235a290552d96703cb');
  A.equal(value.fullBodyRetained,true);A.equal(value.response.httpStatus,200);
  A.equal(sha(value.response.rawBody),value.response.rawBodySHA256);
  const body=JSON.parse(value.response.rawBody);A.equal(body.profile.id,value.userId);A.equal(body.profile.profileActive,false);A.equal(body.synthetisch,true);
  A.equal(body.productionCommit,value.productionCommit);A.equal(body.reinLesend,true);A.equal(body.schreibaufrufe,0);A.equal(body.modellaufrufe,0);A.equal(body.all500InputAcceptance,false);
  rows.push({position,userId:value.userId,bodySHA256:value.response.rawBodySHA256,inputHash:body.result.eingabe.eingabeHash});
 }catch{console.error('fresh-native500-integrity-stopped');process.exit(1);}
});
stream.on('close',()=>{
 try{
  rows.sort((a,b)=>a.position-b.position);A.equal(rows.length,500);A.equal(new Set(rows.map(r=>r.userId)).size,500);
  A.deepEqual(rows.map(r=>r.position),Array.from({length:500},(_,i)=>i+1));A.equal(manifests.length,28);
  const final=manifests.find(r=>r.sourceArtifactId===11557257710)?.manifest;A(final);A.equal(final.statuses.length,500);
  A.deepEqual(final.statuses.map(r=>r.userId),rows.map(r=>r.userId));A.equal(final.productionDataWrites,0);A.equal(final.paidModelCalls,0);A.equal(final.all500InputAcceptance,false);
  const proof={status:'PASS',sourceRun:'37790661298',cipherTransportRun:'37815559846',nativeOriginalProfiles:500,authenticatedCheckpointManifests:28,allBodySHA256Verified:true,allProfilesInactiveSynthetic:true,privateKeySource:'Fresh authenticated private Drive fetch',artifactSource:'Fresh GitHub connector artifact downloads',oldWorkspaceOriginalFilesRead:0,newProductionRequests:0,models:0,newSemanticAcceptance:0,rows};
  F.writeFileSync(__dirname+'/NATIVE500_FRESH_RECOVERY_PROOF.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('PASS: all500 native originals authenticated and body hashes verified;0 new Production requests');
 }catch{console.error('fresh-native500-final-integrity-stopped');process.exit(1);}
});
