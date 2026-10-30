'use strict';
const assert=require('node:assert/strict');
const {dispatchReceive}=require('./mock500_receive_dispatch.exec.js');
const config={executeAfterGo:true,launcherCommit:'a'.repeat(40),projectRoot:'/workspace/fixture',approvalFile:'/tmp/approval.json',stateDir:'/tmp/private-state'};
async function scenario(kind) {
  const calls=[],secret='https://fictional.oaiusercontent.com/cipher?sig=FICTIONAL_PRIVATE';
  let fed=false;
  const tools={
    mcp__codex_apps__google_drive_get_file_metadata:async()=>{calls.push('metadata');return {structuredContent:{id:'1koFG3XkeJr82wVNmMZwu94wgFFtBklor',size:17780398,parent_ids:['1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd'],permissions:[{role:kind==='metadata'?'reader':'owner'}]}};},
    exec_command:async args=>{calls.push('prepare');assert.ok(!args.cmd.includes(secret));return kind==='prepare'?{exit_code:1,output:'FAIL'}:kind==='exited'?{session_id:7,exit_code:1,output:'READY_FOR_FRESH_PRIVATE_LINK\n'}:{session_id:7,output:'PREPARING\n'};},
    write_stdin:async args=>{
      if(args.chars==='\u0003'){calls.push('cancel');return {exit_code:1,output:'BLOCKED'};}
      if(args.chars){calls.push('feed');assert.equal(JSON.parse(args.chars).url,secret);fed=true;return {exit_code:0,output:'{"status":"PASS_SINGLE_RECEIVE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING"}\n'};}
      calls.push('ready');return {session_id:7,output:'READY_FOR_FRESH_PRIVATE_LINK\n'};
    },
    mcp__codex_apps__google_drive_fetch:async args=>{calls.push('fetch');assert.ok(calls.indexOf('ready')<calls.indexOf('fetch'));assert.equal(args.include_base64,false);if(kind==='fetch')throw Error(secret);return {structuredContent:{file_uri:{download_url:kind==='uri'?'sediment://fictional':secret}}};}
  };
  const result=await dispatchReceive(tools,config);
  assert.ok(!JSON.stringify(result).includes('FICTIONAL_PRIVATE'));
  assert.ok(calls.filter(x=>x==='fetch').length<=1);
  if(kind==='ok'){assert.equal(result.status,'PASS_SINGLE_RECEIVE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING');assert.ok(fed);assert.deepEqual(calls,['metadata','prepare','ready','fetch','feed']);}
  else {assert.equal(result.status,'BLOCKED');assert.ok(!fed);if(['prepare','metadata','exited'].includes(kind))assert.ok(!calls.includes('fetch'));}
}
(async()=>{for(const kind of ['ok','metadata','prepare','exited','fetch','uri'])await scenario(kind);
assert.equal((await dispatchReceive({},{})).phase,'arguments');
console.log('PASS: 7 synthetic tool-order/error groups; no real fetch or dispatch');})().catch(error=>{console.error(error);process.exitCode=1;});
