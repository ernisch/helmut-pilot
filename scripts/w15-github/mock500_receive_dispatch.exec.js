'use strict';
// Tool-runtime entry, imported with explicit tools; import performs no work.
// Call only after a fresh explicit GO. Never print the returned Drive payload.
async function dispatchReceive(tools, config) {
  const receiver='13b858b1a1e83a695e1fa64446573b5b550921ea';
  if(!config || config.executeAfterGo!==true || !/^[a-f0-9]{40}$/.test(config.launcherCommit||'') ||
     ![config.projectRoot,config.approvalFile,config.stateDir].every(p=>typeof p==='string'&&/^\/workspace\/[A-Za-z0-9_./-]+$|^\/tmp\/[A-Za-z0-9_./-]+$/.test(p)&&!p.split('/').includes('..')))
    return {status:'BLOCKED',phase:'arguments',receiverCommit:receiver};
  let session,fetches=0,phase='metadata',launcherStopped='UNKNOWN';
  async function cancel() {
    if(session)try{
      let result=await tools.write_stdin({session_id:session,chars:'\u0003',yield_time_ms:1000,max_output_tokens:1000});
      const until=Date.now()+10000;
      while(result.exit_code===undefined&&Date.now()<until)
        result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:1000});
      if(result.exit_code!==undefined)launcherStopped='PASS';
    }catch(_){}
  }
  function safe(output) {
    const rows=(output||'').split(/\r?\n/);
    for(const row of rows.reverse())try{
      const value=JSON.parse(row);
      if(value&&typeof value.status==='string'&&/^(PASS|FAIL|BLOCKED|UNKNOWN)/.test(value.status))
        return {status:value.status,phase:typeof (value.phase||value.firstFailedPhase)==='string'&&/^[a-z-]+$/.test(value.phase||value.firstFailedPhase)?(value.phase||value.firstFailedPhase):phase,receiverCommit:receiver,fetchAttempts:fetches,launcherStopped};
    }catch(_){}
    return {status:'UNKNOWN',phase,receiverCommit:receiver,fetchAttempts:fetches};
  }
  try {
    const metadata=await tools.mcp__codex_apps__google_drive_get_file_metadata({fileId:'1koFG3XkeJr82wVNmMZwu94wgFFtBklor',
      fields:'id,name,mimeType,size,parents,trashed,permissions(type,role)',supportsAllDrives:true});
    const m=metadata.structuredContent;
    if(metadata.isError||!m||m.trashed===true||m.id!=='1koFG3XkeJr82wVNmMZwu94wgFFtBklor'||Number(m.size)!==17780398||
       !(m.parent_ids||m.parents||[]).includes('1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd')||
       !Array.isArray(m.permissions)||m.permissions.length!==1||m.permissions[0].role!=='owner')throw Error('metadata');
    phase='preparation';
    const command='python3 -I -B -u scripts/w15-github/mock500_receive_dispatch.py --execute-after-go --expected-launcher-commit '+
      config.launcherCommit+' --approval-file '+config.approvalFile+' --state-dir '+config.stateDir;
    let result=await tools.exec_command({cmd:command,workdir:config.projectRoot,tty:true,yield_time_ms:1000,max_output_tokens:2000});
    session=result.session_id;
    let output=result.output||'';
    let deadline=Date.now()+120000;
    while(!output.split(/\r?\n/).includes('READY_FOR_FRESH_PRIVATE_LINK')) {
      if(!session||result.exit_code!==undefined||Date.now()>=deadline)throw Error('not-ready');
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:2000});
      output+=result.output||'';
    }
    if(!session||result.exit_code!==undefined)throw Error('worker-exited');
    deadline=Date.now()+120000;
    // First and only original-capability creation happens after READY.
    phase='fresh-link';fetches++;
    const fetched=await tools.mcp__codex_apps__google_drive_fetch({url:'https://drive.google.com/file/d/1koFG3XkeJr82wVNmMZwu94wgFFtBklor/view',download_raw_file:true,include_base64:false});
    const f=fetched.structuredContent;
    const url=f?.file_uri?.download_url||f?.structuredContent?.file_uri?.download_url||f?.structuredContent?.download_url;
    if(fetched.isError||typeof url!=='string'||url.length>4096||!/^https:\/\/[a-z0-9-]+\.oaiusercontent\.com(?::443)?\//.test(url))throw Error('capability');
    phase='handoff';
    result=await tools.write_stdin({session_id:session,chars:JSON.stringify({url})+'\n',yield_time_ms:1000,max_output_tokens:2000});
    output=result.output||'';
    while(result.exit_code===undefined&&Date.now()<deadline) {
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:2000});
      output+=result.output||'';
    }
    if(result.exit_code===undefined){await cancel();return {status:'UNKNOWN',phase:'handoff',receiverCommit:receiver,fetchAttempts:fetches,launcherStopped};}
    launcherStopped='PASS';
    return safe(output);
  } catch(_) {
    await cancel();
    return {status:'BLOCKED',phase,receiverCommit:receiver,fetchAttempts:fetches,launcherStopped};
  }
}
if(typeof module!=='undefined')module.exports={dispatchReceive};
