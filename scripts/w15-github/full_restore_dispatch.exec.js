'use strict';
// Explicit tool-runtime entry only. Import/default call performs no transfer.
// Never print fetched responses or private capability URLs.
const SOURCE_PARTS = [{"index":1,"id":"1Ayq9jyUETS8dHspU3IBD69-Sa8NBbJNP","name":"end500.gpg.part-001","bytes":16777216},{"index":2,"id":"12nG2PV45T8ykvEWAhyR2W5khTw4zDxEu","name":"end500.gpg.part-002","bytes":16777216},{"index":3,"id":"1LBmD_895_dN5gQIwuxwr9KPx20WWnSGS","name":"end500.gpg.part-003","bytes":16777216},{"index":4,"id":"1WYW7O50yytISi254tIKRVmnveBswQrfy","name":"end500.gpg.part-004","bytes":16777216},{"index":5,"id":"1R8ctZo7KIUSbyAw9rlN17CsqvT24tBEZ","name":"end500.gpg.part-005","bytes":16777216},{"index":6,"id":"1v8APK-ASXtbVz5h2ZNrnhxJ4kqXZXi66","name":"end500.gpg.part-006","bytes":16777216},{"index":7,"id":"1IHNq9mnq0gNZbrr4NoFWR4HF3Kuw9OQX","name":"end500.gpg.part-007","bytes":16777216},{"index":8,"id":"1Ow6WmQyrupgvcYSSR0DIf3wDu5es3DKT","name":"end500.gpg.part-008","bytes":16777216},{"index":9,"id":"1De2HVrdY7QZVU9AmX_UCIrZSUdWTnezK","name":"end500.gpg.part-009","bytes":16777216},{"index":10,"id":"1qe4UPq9ToxdMbP34dkRfE1wZdstAX1AD","name":"end500.gpg.part-010","bytes":16777216},{"index":11,"id":"1UkWjp6N_gZ3WtuBfIv9XPoHIUItbCWbh","name":"end500.gpg.part-011","bytes":16777216},{"index":12,"id":"1eaIf41HYbo26KScJB_sPHuCjrcpr1gVa","name":"end500.gpg.part-012","bytes":16777216},{"index":13,"id":"1lM_lALP8TBDH-S67Utpy9CxfQPSmbTfS","name":"end500.gpg.part-013","bytes":16777216},{"index":14,"id":"1RdutCBAqxQr1WWdsiOe2fGK68-4OiqXB","name":"end500.gpg.part-014","bytes":16777216},{"index":15,"id":"12tw8CS8gFD22XjfMe3sS4ZcuNGKRz3UI","name":"end500.gpg.part-015","bytes":7812020}];


async function dispatchFullRestore(tools, config) {
  const target=config?.expectedLauncherCommit,receiver=config?.expectedReceiverCommit;
  function path(value) {
    return typeof value==='string'&&/^(?:\/workspace|\/tmp)\/[A-Za-z0-9_./-]+$/.test(value)&&!value.split('/').includes('..')&&!/\s/.test(value);
  }
  if(!config||config.executeAfterGo!==true||!(/^[a-f0-9]{40}$/).test(target||'')||!(/^[a-f0-9]{40}$/).test(receiver||'')||
      ![config.projectRoot,config.approvalFile,config.requestFile,config.stateDir].every(path))
    return {status:'BLOCKED_SEPARATE_FULL_RESTORE_GO_REQUIRED',phase:'arguments',fetchAttempts:0};
  let phase='metadata',session,fetches=0,launcherStopped='UNKNOWN',handoffAttempted=false;
  const base=()=>({phase,targetCommit:receiver,launcherCommit:target,fetchAttempts:fetches,launcherStopped});
  async function cancel() {
    if(!session)return;
    try{
      let result=await tools.write_stdin({session_id:session,chars:'\u0003',yield_time_ms:1000,max_output_tokens:1000});
      const deadline=Date.now()+10000;
      while(result.exit_code===undefined&&Date.now()<deadline)
        result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:1000});
      if(result.exit_code!==undefined)launcherStopped='PASS';
    }catch(_){}
  }
  function summary(output) {
    for(const row of (output||'').split(/\r?\n/).reverse())try{
      const value=JSON.parse(row);
      if(value&&['PASS_SINGLE_FULL_RESTORE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING','UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME','BLOCKED_FULL_RESTORE_DISPATCH','FAIL_FULL_RESTORE_DISPATCH_CLEANUP_UNCONFIRMED'].includes(value.status)) {
        const p=value.phase||value.firstFailedPhase;
        return {...base(),status:value.status,phase:['arguments','approval','qualification','launcher','review','ci','workflow','environment','branch','branch-readback','receiver-review','launcher-review','receiver-ci','launcher-ci','private-root','link','index','encryption','payload','final-expiry','attempt-marker','dispatch','cleanup'].includes(p)?p:phase,
          dispatchAttempted:typeof value.dispatchAttempted==='boolean'?value.dispatchAttempted:'UNKNOWN',
          dispatchAccepted:typeof value.dispatchAccepted==='boolean'?value.dispatchAccepted:'UNKNOWN',
          branchChanged:[true,false,'UNKNOWN'].includes(value.branchChanged)?value.branchChanged:'UNKNOWN'};
      }
    }catch(_){}
    return {...base(),status:'UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME'};
  }
  try {
    // Only the 15 exact retained object IDs: no Drive inventory or payload GET.
    // All metadata work finishes before the CLI can emit READY.
    let next=0,bad=false,verifiedMetadata=0;
    await Promise.allSettled(Array.from({length:3},async()=>{
      while(!bad){
        const index=next++;if(index>=SOURCE_PARTS.length)return;
        const part=SOURCE_PARTS[index];
        try{
          const result=await tools.mcp__codex_apps__google_drive_get_file_metadata({fileId:part.id,
            fields:'id,name,mimeType,size,parents,trashed,permissions(type,role)',supportsAllDrives:true});
          const m=result.structuredContent;
          if(result.isError||!m||m.id!==part.id||(m.title||m.name)!==part.name||Number(m.size)!==part.bytes||
              m.trashed===true||!['application/octet-stream','application/pgp-encrypted'].includes(m.mime_type||m.mimeType)||
              !(m.parent_ids||m.parents||[]).includes('1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd')||
              !Array.isArray(m.permissions)||m.permissions.length!==1||m.permissions[0].role!=='owner'||m.permissions[0].type!=='user')
            bad=true;
          else verifiedMetadata++;
        }catch(_){bad=true;}
      }
    }));
    if(bad||verifiedMetadata!==15)throw Error('metadata');
    phase='preparation';
    const command='python3 -I -B -u scripts/w15-github/full_restore_dispatch.py --execute-after-go --expected-launcher-commit '+target+
      ' --expected-receiver-commit '+receiver+' --approval-file '+config.approvalFile+' --request-file '+config.requestFile+' --state-dir '+config.stateDir;
    let result=await tools.exec_command({cmd:command,workdir:config.projectRoot,tty:true,yield_time_ms:1000,max_output_tokens:2000});
    session=result.session_id;
    let output=result.output||'',deadline=Date.now()+120000;
    while(!output.split(/\r?\n/).includes('READY_FOR_FRESH_PRIVATE_FULL_RESTORE_LINKS')) {
      if(!session||result.exit_code!==undefined||Date.now()>=deadline)throw Error('not-ready');
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:2000});
      output+=result.output||'';
    }
    if(!session||result.exit_code!==undefined)throw Error('worker-exited');
    phase='fresh-links';
    const links=new Array(15);next=0;bad=false;
    await Promise.allSettled(Array.from({length:3},async()=>{
      while(!bad){
        const index=next++;if(index>=SOURCE_PARTS.length)return;
        const part=SOURCE_PARTS[index];fetches++;
        try{
          const result=await tools.mcp__codex_apps__google_drive_fetch({url:'https://drive.google.com/file/d/'+part.id+'/view',download_raw_file:true,include_base64:false});
          const f=result.structuredContent;
          const url=f?.file_uri?.download_url||f?.structuredContent?.file_uri?.download_url||f?.structuredContent?.download_url;
          if(result.isError||typeof url!=='string'||url.length>4096||!/^https:\/\/[a-z0-9-]+\.oaiusercontent\.com(?::443)?\//.test(url))throw Error('capability');
          links[index]=url;
        }catch(_){bad=true;}
      }
    }));
    if(bad||links.filter(url=>typeof url==='string').length!==15||fetches!==15)throw Error('capability');
    phase='handoff';deadline=Date.now()+120000;
    const frame=JSON.stringify({urls:links})+'\n';
    if(frame.length>70000)throw Error('frame');
    handoffAttempted=true;
    result=await tools.write_stdin({session_id:session,chars:frame,yield_time_ms:1000,max_output_tokens:2000});
    output=result.output||'';
    while(result.exit_code===undefined&&Date.now()<deadline){
      result=await tools.write_stdin({session_id:session,chars:'',yield_time_ms:1000,max_output_tokens:2000});
      output+=result.output||'';
    }
    if(result.exit_code===undefined){await cancel();return {...base(),status:'UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME'};}
    launcherStopped='PASS';return summary(output);
  }catch(_){
    await cancel();return {...base(),status:handoffAttempted?'UNKNOWN_FULL_RESTORE_DISPATCH_OUTCOME':'BLOCKED_FULL_RESTORE_DISPATCH',
      dispatchAttempted:handoffAttempted?'UNKNOWN':false,dispatchAccepted:handoffAttempted?'UNKNOWN':false};
  }
}
if(typeof module!=='undefined')module.exports={dispatchFullRestore,SOURCE_PARTS};
