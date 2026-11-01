"""Tiny first transport cause across actual worker/IPC/JS projections, no GET."""
import sys
sys.dont_write_bytecode=True
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

HERE=Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location('transport_chain_'+name,HERE/(name+'.py'))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
T,F,MF,W,R=map(load,('test_receive_transport_phase','test_restore_failure_phase',
    'test_mock500_receive','mock500_workflow','mock500_runner'))
CANARY='FICTIONAL_PRIVATE_URL_TOKEN_OR_PATH'

def project_action(stage,receipts):
    code=r'''
const fs=require('node:fs'),vm=require('node:vm');
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
const source=fs.readFileSync(process.argv[1],'utf8');
const output=rows.map(receipt=>{
 const lines=[],context={Buffer,process:{env:{W15_MODE:'qualification-only',W15_REQUEST:'{}',GITHUB_EVENT_PATH:'/FICTIONAL_EVENT'}},
 console:{log:x=>lines.push(JSON.parse(x))},require:name=>{
  if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:'{}'}})};
  if(name==='node:child_process')return{spawnSync:()=>({status:1,stdout:JSON.stringify(receipt)})};
  throw Error('UNEXPECTED_IMPORT');}};
 vm.runInNewContext(source,context,{timeout:1000});
 return{lines,exitCode:context.process.exitCode};});
process.stdout.write(JSON.stringify(output));
'''
    path=HERE.parents[1]/'.github/actions'/stage/'index.js'
    result=subprocess.run(['node','-e',code,str(path)],input=json.dumps(receipts),text=True,
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,check=True)
    assert CANARY not in result.stdout
    return json.loads(result.stdout)

def mock_worker(error):
    resources=SimpleNamespace(sample=Mock(),failure_observation=lambda:None)
    start=SimpleNamespace(before_dispatch=Mock(),closure_guard=Mock())
    modules={'mock500_context':SimpleNamespace(build_context=lambda _:{}),
        'mock500_resources':SimpleNamespace(observe=lambda _:resources,admit_disk_plan=Mock(return_value={}),DiskGuard=Mock(return_value=Mock())),
        'mock500_start':SimpleNamespace(StartGuard=Mock(return_value=start)),
        'mock500_receive':MF.M,'common_resources':SimpleNamespace(closed_failure_memory=lambda _:None)}
    manifest={'mode':W.FULL,'branch':W.BRANCH,'exactCommit':'a'*40,'runId':'123456789','runAttempt':1,
        'nonce':'123e4567-e89b-42d3-a456-426614174000','runnerTemp':'/FICTIONAL','checkoutBytes':1,'binaryBytes':2,
        'startedMonotonic':123.0,'startedAtUTC':'2026-11-01T00:00:00Z','approval':{},
        'bindings':{'additionalAssetBytes':1,'end500Acceptance':{},'compatibilityBridge':{},
            'approvedEnd500Commit':'a'*40,'inputBindingSHA256':'b'*64}}
    with patch.object(W,'validate_admission',return_value=(b'{}','c'*64)),patch.object(W,'validate_manifest'),\
         patch.object(W,'validate_event'),patch.object(W,'component',side_effect=lambda n:modules[n]),\
         patch.object(MF.M,'prepare_inputs',side_effect=error),\
         patch.dict(sys.modules,{'w15_github_mock500_receive':MF.M}):
        try:W.run_worker(manifest,{'eventInputs':{}})
        except W.WorkflowRejected as actual:return actual
    raise AssertionError('worker should stop')

class TransportChainChecks(unittest.TestCase):
    def test_actual_midstream_expiry_survives_end_worker_supervisor_and_action(self):
        tiny=T.TransportPhaseChecks();self.addCleanup(tiny.doCleanups)
        actual=tiny.run_download(ttl=2,delay=3)
        self.assertEqual(actual.failure.phase,'download-expired')
        worker=F.RestoreFailurePhaseChecks().worker_failure(F.R.RestoreConnectionError('receive'),actual.failure.phase)
        self.assertEqual(worker.phase,'receiver-download-expired')
        failure=F.A._worker_failure(worker,'WORKER_RESULT_REJECTED')
        packet=F.A._failure_packet(failure)
        safe=F.W._safe_failure(F.A._response_error(packet))
        self.assertEqual(safe,{'phase':'worker','worker':{'phase':'receiver-download-expired'}})
        receipt={'status':'FAIL_W15_ISOLATED_WORKFLOW',**safe,'executionAuthority':False,'retryAllowed':False,'private':CANARY}
        output=project_action('w15-isolated',[receipt])[0]
        self.assertEqual(output,{'exitCode':1,'lines':[{k:v for k,v in receipt.items() if k!='private'}]})

    def test_all_fixed_mock_causes_survive_original_receiver_cleanup_worker_and_action(self):
        receipts=[]
        for phase in sorted(MF.M.E.DOWNLOAD_PHASES):
            with tempfile.TemporaryDirectory(prefix='fictional-original-transport-') as tmp:
                with self.assertRaises(MF.M.MockReceiveError) as failed:
                    MF.MockReceiveChecks().receive(Path(tmp),original_error=MF.M.E.DownloadRejected(phase),close_failure=True)
            self.assertEqual(failed.exception.phase,'original-'+phase)
            error=mock_worker(failed.exception)
            expected='mock-receiver-original-'+phase
            self.assertEqual(error.phase,expected)
            inner=R.S._worker_failure(error,'WORKER_RESULT_REJECTED',error_type=R.MockRunnerError)
            safe=W._safe_failure(R.S._response_error(R.S._failure_packet(inner),error_type=R.MockRunnerError))
            self.assertEqual(safe,{'phase':'worker','worker':{'phase':expected}})
            receipts.append({'status':'FAIL_OR_BLOCKED_MOCK500_WORKFLOW',**safe,'executionAuthority':False,'retryAllowed':False,'private':CANARY})
        output=project_action('w15-mock500',receipts)
        for actual,receipt in zip(output,receipts,strict=True):
            self.assertEqual(actual,{'exitCode':1,'lines':[{k:v for k,v in receipt.items() if k!='private'}]})

if __name__=='__main__':unittest.main()
