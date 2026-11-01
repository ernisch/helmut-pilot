'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {dispatchFullRestore,SOURCE_PARTS}=require('./full_restore_dispatch.exec.js');
const standalone={exports:{}};
new Function('module',fs.readFileSync(path.join(__dirname,'full_restore_dispatch.exec.js'),'utf8'))(standalone);
assert.equal(typeof standalone.exports.dispatchFullRestore,'function');
assert.deepEqual(standalone.exports.SOURCE_PARTS,SOURCE_PARTS);
const projection=JSON.parse(fs.readFileSync(path.join(__dirname,'restore-diagnostic-source-parts.SAFE.json'),'utf8'));
assert.deepEqual(SOURCE_PARTS,projection.parts.map(row=>({index:row.index,id:row.driveFileId,name:row.name,bytes:row.bytes})));
const config={executeAfterGo:true,expectedLauncherCommit:'b'.repeat(40),expectedReceiverCommit:'a'.repeat(40),projectRoot:'/workspace/fictional',approvalFile:'/tmp/fictional/approval.json',requestFile:'/tmp/fictional/request.json',stateDir:'/tmp/fictional/private'};

async function scenario(kind){
  const calls=[],metadata=[],fetched=[];
  let activeMetadata=0,maximumMetadata=0,activeFetch=0,maximumFetch=0,ready=false,fed=false;
  const privateURL=index=>'https://fictional.oaiusercontent.com/part-'+index+'?sp=r&sr=b&sig=FICTIONAL_PRIVATE_SIGNATURE';
  const tools={
    mcp__codex_apps__google_drive_get_file_metadata:async args=>{
      calls.push('metadata');metadata.push(args.fileId);activeMetadata++;maximumMetadata=Math.max(maximumMetadata,activeMetadata);
      await Promise.resolve();activeMetadata--;
      const part=SOURCE_PARTS.find(row=>row.id===args.fileId);assert.ok(part);
      return {structuredContent:{id:part.id,name:part.name,mime_type:'application/octet-stream',size:kind==='metadata'&&part.index===2?0:part.bytes,
        parent_ids:['1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd'],permissions:[{type:'user',role:'owner'}]}};
    },
    exec_command:async args=>{
      calls.push('prepare');assert.equal(metadata.length,15);assert.equal(new Set(metadata).size,15);
      assert.equal(fetched.length,0);assert.ok(!args.cmd.includes('FICTIONAL_PRIVATE_SIGNATURE'));
      assert.ok(args.cmd.includes('--expected-launcher-commit '+config.expectedLauncherCommit));assert.equal(args.tty,true);assert.ok(args.cmd.includes('--expected-receiver-commit '+config.expectedReceiverCommit));
      if(kind==='prepare')return {exit_code:1,output:'BLOCKED'};
      if(kind==='exited')return {session_id:7,exit_code:1,output:'READY_FOR_FRESH_PRIVATE_FULL_RESTORE_LINKS\n'};
      return {session_id:7,output:'PREPARING\n'};
    },
    write_stdin:async args=>{
      if(args.chars==='\u0003'){calls.push('cancel');return {exit_code:1,output:'BLOCKED'};}
      if(!args.chars){calls.push('ready');ready=true;return {session_id:7,output:'READY_FOR_FRESH_PRIVATE_FULL_RESTORE_LINKS\n'};}
      calls.push('feed');fed=true;
      const value=JSON.parse(args.chars);assert.equal(Object.keys(value).join(','),'urls');assert.equal(value.urls.length,15);
      assert.deepEqual(value.urls,SOURCE_PARTS.map(row=>privateURL(row.index)));assert.ok(args.chars.length<=70000);
      if(kind==='handoff')throw Error('FICTIONAL_PRIVATE_SIGNATURE');
      if(kind==='hostile-output')return {exit_code:0,output:'{"status":"PASS_PRIVATE_SIGNATURE","phase":"private-signature"}\n'};
      if(kind==='hostile-phase')return {exit_code:0,output:'{"status":"PASS_SINGLE_FULL_RESTORE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING","phase":"private-signature"}\n'};
      return {exit_code:0,output:'{"status":"PASS_SINGLE_FULL_RESTORE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING","phase":"dispatch","dispatchAttempted":true,"dispatchAccepted":true,"branchChanged":true}\n'};
    },
    mcp__codex_apps__google_drive_fetch:async args=>{
      calls.push('fetch');assert.ok(ready);assert.equal(metadata.length,15);assert.equal(args.download_raw_file,true);assert.equal(args.include_base64,false);
      const part=SOURCE_PARTS.find(row=>args.url.includes('/'+row.id+'/'));assert.ok(part);
      fetched.push(part.id);activeFetch++;maximumFetch=Math.max(maximumFetch,activeFetch);
      await Promise.resolve();activeFetch--;
      if(kind==='fetch'&&part.index===7)throw Error('FICTIONAL_PRIVATE_SIGNATURE');
      return {structuredContent:{file_uri:{download_url:kind==='uri'&&part.index===4?'sediment://fictional':privateURL(part.index)}}};
    }
  };
  const entry=kind==='standalone'?standalone.exports.dispatchFullRestore:dispatchFullRestore;
  const result=await entry(tools,config);
  assert.ok(!JSON.stringify(result).includes('FICTIONAL_PRIVATE_SIGNATURE'));
  assert.ok(maximumMetadata<=3&&maximumFetch<=3);
  assert.equal(fetched.length,new Set(fetched).size);assert.ok(fetched.length<=15);
  if(kind==='ok'||kind==='standalone'){
    assert.equal(result.status,'PASS_SINGLE_FULL_RESTORE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING');assert.equal(fetched.length,15);
    assert.ok(fed);assert.equal(result.launcherStopped,'PASS');assert.equal(result.dispatchAccepted,true);
    assert.ok(calls.indexOf('prepare')>calls.lastIndexOf('metadata'));
    assert.ok(calls.indexOf('fetch')>calls.indexOf('ready'));
  }else if(kind==='hostile-phase'){
    assert.equal(result.phase,'handoff');assert.ok(!JSON.stringify(result).includes('private-signature'));
  }else if(kind==='hostile-output'){
    assert.equal(result.status,'UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME');assert.ok(!JSON.stringify(result).includes('private-signature'));
  }else if(kind==='handoff'){
    assert.equal(result.status,'UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME');assert.equal(result.dispatchAttempted,'UNKNOWN');
    assert.equal(result.dispatchAccepted,'UNKNOWN');assert.ok(calls.includes('cancel'));
  }else{
    assert.equal(result.status,'BLOCKED_FULL_RESTORE_DISPATCH');assert.ok(!fed);
    if(['metadata','prepare','exited'].includes(kind))assert.equal(fetched.length,0);
  }
}

(async()=>{
  for(const kind of ['ok','standalone','metadata','prepare','exited','fetch','uri','handoff','hostile-output','hostile-phase'])await scenario(kind);
  let operations=0;
  const inert={mcp__codex_apps__google_drive_fetch:async()=>{operations++;throw Error('unexpected');}};
  assert.equal((await dispatchFullRestore(inert,{})).phase,'arguments');
  assert.equal((await dispatchFullRestore(inert,{...config,projectRoot:'/tmp/../unsafe'})).phase,'arguments');
  assert.equal((await dispatchFullRestore(inert,{...config,projectRoot:'/tmp/fictional\n'})).phase,'arguments');
  assert.equal(operations,0);
  console.log('PASS: 12 synthetic metadata/READY/15-fetch/error groups; zero real Drive or GitHub operations');
})().catch(error=>{console.error(error);process.exitCode=1;});
