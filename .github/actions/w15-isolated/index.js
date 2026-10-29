'use strict';
// Runtime artifact credentials exist in JavaScript actions. They travel only
// through private stdin, never shell expansion, arguments or public outputs.
const fs = require('node:fs');
const cp = require('node:child_process');
const KEYS = ['ACTIONS_RUNTIME_TOKEN','ACTIONS_RESULTS_URL','ACTIONS_RUNTIME_URL',
  'GITHUB_TOKEN','GITHUB_API_URL','GITHUB_SERVER_URL','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'];
function main() {
  const mode = process.env.W15_MODE;
  const synthetic = mode === 'end500-restore-synthetic';
  const declared = JSON.parse(process.env.W15_REQUEST || '{}');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const privatePayload = synthetic ? {} : {
    cipherIndex: process.env.HELMUT_W15_CIPHER_INDEX_GPG,
    keyB64: process.env.HELMUT_W15_RECEIVER_PROTECTED_KEY_B64,
    passphrase: process.env.HELMUT_W15_RECEIVER_PASSPHRASE,
    eventInputs: event.inputs,
    artifactCredentials: Object.fromEntries(KEYS.filter(k => process.env[k]).map(k => [k,process.env[k]]))
  };
  for (const key of ['HELMUT_W15_CIPHER_INDEX_GPG','HELMUT_W15_RECEIVER_PROTECTED_KEY_B64',
    'HELMUT_W15_RECEIVER_PASSPHRASE',...KEYS.filter(k => k.includes('TOKEN'))]) delete process.env[key];
  const request = {schema:'helmut-w15-runner-request/1', mode,
    exactCommit:process.env.EXPECTED_COMMIT, runId:process.env.GITHUB_RUN_ID,
    runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT), branch:process.env.GITHUB_REF,
    nonce:declared.nonce, imageId:process.env.W15_IMAGE_ID,
    nodeSource:process.env.W15_NODE_SOURCE, postgrestSource:process.env.W15_POSTGREST_SOURCE,
    sourceQualification:declared.sourceQualification, approval:declared.approval,
    limits:declared.limits, maximumWallSeconds:declared.maximumWallSeconds};
  if (synthetic) {
    const inputs=event.inputs || {};
    let declarationMatches=false;
    try {
      const eventDeclared=JSON.parse(inputs.w15_request);
      declarationMatches=Object.keys(declared).length===Object.keys(eventDeclared).length
        && Object.keys(declared).every(k=>JSON.stringify(declared[k])===JSON.stringify(eventDeclared[k]));
    } catch (_) {}
    console.log(JSON.stringify({status:'PUBLIC_SYNTHETIC_EVENT_OBSERVATION',
      inputCount:Object.keys(inputs).length,
      exactInputSet:JSON.stringify(Object.keys(inputs).sort())===JSON.stringify(['expected_commit','w15_cipher_index','w15_mode','w15_request']),
      inputsAreStrings:Object.values(inputs).every(v=>typeof v==='string'),
      modeMatches:inputs.w15_mode===mode,commitMatches:inputs.expected_commit===request.exactCommit,
      declarationMatches,cipherEmpty:inputs.w15_cipher_index===''}));
  }
  const input = JSON.stringify({request,privatePayload});
  if (Buffer.byteLength(input) > 1024*1024) throw Error('bound');
  const result = cp.spawnSync('/usr/bin/python3', ['-B','scripts/w15-github/restore_workflow.py','--launch'],
    {input, encoding:'utf8', env:process.env, maxBuffer:1024*1024,
     timeout:(synthetic ? 420 : mode === 'end500-full-gated' ? 3720 : 1920)*1000});
  if (result.error) throw Error('worker');
  if (result.status !== 0) {
    const failed = JSON.parse(result.stdout);
    const phases = ['arguments','event','approval','qualification','binding','resources','synthetic',
      'receive-prepare','restore','end500','backup','closure','parent','service','staging','worker','ipc'];
    if (failed.status !== 'FAIL_W15_ISOLATED_WORKFLOW' || !phases.includes(failed.phase)
      || failed.executionAuthority !== false || failed.retryAllowed !== false) throw Error('receipt');
    const safe = {status:failed.status,phase:failed.phase,executionAuthority:false,retryAllowed:false};
    if (failed.worker && Object.keys(failed.worker).length === 1 && phases.includes(failed.worker.phase))
      safe.worker={phase:failed.worker.phase};
    console.log(JSON.stringify(safe)); process.exitCode=1; return;
  }
  // The Python boundary emits one strictly bounded public receipt.
  const receipt = JSON.parse(result.stdout);
  console.log(JSON.stringify(receipt));
}
try { main(); } catch (_) { console.log('{"status":"FAIL_OR_BLOCKED_W15_ISOLATED_JOB"}'); process.exitCode=1; }
