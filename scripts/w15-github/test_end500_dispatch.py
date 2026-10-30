"""Only new End500 admission/control seams, with synthetic data and tools."""
import sys
sys.dont_write_bytecode = True
import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zlib

spec=importlib.util.spec_from_file_location('end_sender_tested',Path(__file__).with_name('end500_dispatch.py'))
D=importlib.util.module_from_spec(spec);spec.loader.exec_module(D)
TARGET,LAUNCHER='99ca7a0e899804ed84860f01f8cfb4eb546f2f1e','b'*40
RECEIVER_CI,RECEIVER_PR=41052111872,986
NONCE='26d5a413-5ca7-415c-a412-62fc45b561c8'
PRIVATE='FICTIONAL_NOT_A_REAL_SIGNATURE'


def digest(value):return hashlib.sha256(D.canonical(value)).hexdigest()


def acceptance():
    return {'schema':D.ACCEPTANCE_SCHEMA,'status':'PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE',
        'scope':D.W.SCOPES['end500-restore-gated'],'exactCommit':TARGET,'runId':'12345678901','runAttempt':1,
        'receiptSHA256':'c'*64,'independentOfImplementation':True,'executionAuthority':False,
        'verifiedFiles':12,'verifiedBytes':242570240,'profiles':500,'activeProfiles':0,
        **{key:True for key in ('fullRestoreAccepted','backupRoundtripVerified','remoteReadbackObserved',
                               'databaseRestoreObserved','resourcesAccepted','cleanupVerified')}}


class Clock:
    def __init__(self):self.value=datetime(2026,10,30,10,tzinfo=timezone.utc)
    def __call__(self):return self.value
    def advance(self,seconds):self.value+=timedelta(seconds=seconds)


class API:
    def __init__(self,test):
        self.t=test;self.record=acceptance();self.missing=False;self.duplicate=False;self.fail_run=False
        self.ref=TARGET;self.delay=0;self.posts=[];self.post_error=False
        self.run={'id':12345678901,'head_sha':TARGET,'head_branch':D.BRANCH,'event':'workflow_dispatch',
                  'status':'completed','conclusion':'success','run_attempt':1,'workflow_id':D.WORKFLOW}
    def __call__(self,method,path,body=None):
        self.t.events.append((method,path))
        if method=='POST':
            self.posts.append(body)
            if self.post_error:raise RuntimeError(PRIVATE)
            return None
        if path=='/actions/runs/12345678901':
            if self.fail_run:raise RuntimeError(PRIVATE)
            return self.run
        if path.startswith('/pulls/'):
            launcher=path=='/pulls/999';review=self.t.review(launcher)
            records=[review]+([] if launcher or self.missing else [self.record])
            if self.duplicate and not launcher:records.append(self.record)
            return {'state':'open','merged':False,'head':{'sha':LAUNCHER if launcher else TARGET},
                    'body':'\n'.join('```json\n'+D.canonical(row).decode()+'\n```' for row in records)}
        if '/jobs?' in path:return {'total_count':2,'jobs':[{'name':n,'status':'completed','conclusion':'success'} for n in D.M.CHECKS]}
        if path.startswith('/actions/runs/'):return {'head_sha':TARGET if str(RECEIVER_CI) in path else LAUNCHER,
            'status':'completed','conclusion':'success','workflow_id':D.WORKFLOW}
        if path.startswith('/actions/workflows/'):return {'id':D.WORKFLOW,'state':'active','path':'.github/workflows/ci.yml'}
        if path.endswith('/deployment-branch-policies'):return {'total_count':1,'branch_policies':[{'name':D.BRANCH,'type':'branch'}]}
        if path.startswith('/environments/'):return {'name':D.ENVIRONMENT,
            'deployment_branch_policy':{'protected_branches':False,'custom_branch_policies':True},'protection_rules':[{'type':'branch_policy'}]}
        if path.startswith('/git/ref/'):
            self.t.clock.advance(self.delay);self.delay=0
            return {'object':{'sha':self.ref}}
        raise AssertionError('unexpected synthetic route')


class EndSenderChecks(unittest.TestCase):
    def setUp(self):
        self.clock=Clock();self.events=[]
        q={'schema':'helmut-w15-static-source-qualification/1','scope':'ISOLATED_GITHUB_W15_SOURCE_ONLY',
           'status':'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW','exactCommit':TARGET,'sourcePins':{},
           'historicalDeltas':[],'executionAuthority':False,'testStarted':False}
        raw=D.canonical(q);self.envelope={'encoding':'zlib-base64','sha256':digest(q),'data':base64.b64encode(zlib.compress(raw)).decode()}
        self.api=API(self)
        issued=self.clock().strftime('%Y-%m-%dT%H:%M:%SZ');expires=(self.clock()+timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
        inner={'schema':'helmut-w15-workflow-start-approval/1','scope':D.SCOPE,'authorized':True,'exactCommit':TARGET,
            'branch':'refs/heads/'+D.BRANCH,'runAttempt':1,'nonce':NONCE,'mode':D.MODE,'limits':D.W.LIMITS,
            'maximumWallSeconds':3600,'sourceQualificationSHA256':self.envelope['sha256'],'maxReceiveAttempts':1,
            'issuedAt':issued,'expiresAt':expires,'maxStorageUSD':'0.05','maxProviderCalls':0,
            'restoreAcceptance':{key:self.api.record[key] for key in ('status','exactCommit','runId','receiptSHA256')}}
        self.request={'nonce':NONCE,'sourceQualification':self.envelope,'approval':inner,'limits':D.W.LIMITS,'maximumWallSeconds':3600}
        self.go={'schema':'helmut-w15-end500-dispatch-approval/1','scope':D.SCOPE,'authorized':True,'targetCommit':TARGET,
            'launcherCommit':LAUNCHER,'branch':D.BRANCH,'environment':D.ENVIRONMENT,'workflowId':D.WORKFLOW,'nonce':NONCE,
            'runAttempt':1,'maxReceiveAttempts':1,'targetCI':RECEIVER_CI,'targetPR':RECEIVER_PR,'launcherCI':98765432,'launcherPR':999,
            'reviewSHA256':digest(self.review()),'launcherReviewSHA256':digest(self.review(True)),
            'sourceQualificationSHA256':self.envelope['sha256'],'restoreAcceptanceReviewSHA256':digest(self.api.record),
            'requestSHA256':digest(self.request),'advanceAllowedBranch':False,'stateDir':'/tmp/pending',
            'issuedAt':issued,'expiresAt':expires}
        self.git=SimpleNamespace(check_launcher=Mock(),qualify=Mock())
    def review(self,launcher=False):
        return {'schema':D.LAUNCHER_REVIEW_SCHEMA if launcher else D.REVIEW_SCHEMA,'scope':D.SCOPE,
            'exactCommit':LAUNCHER if launcher else TARGET,'status':'PASS_INDEPENDENT_STATIC_CODE_REVIEW_ONLY',
            'independentOfImplementation':True,'remainingCriticalOrHighCodeFindings':0,'executionAuthority':False,
            **({} if launcher else {'sourceQualificationSHA256':self.envelope['sha256']})}
    def run_case(self,margin=180,encode_delay=0,cleanup=None,state=None):
        if state is None:
            temporary=tempfile.TemporaryDirectory(prefix='w15-synthetic-end-dispatch-');self.addCleanup(temporary.cleanup)
            state=Path(temporary.name);state.chmod(0o700);self.go['stateDir']=str(state)
        def ready():self.events.append(('READY',None))
        def provider():
            self.events.append(('LINKS',None));query=D.M.urllib.parse.urlencode({'sp':'r','sr':'b','se':D.M.iso(self.clock()+timedelta(seconds=margin)),'sig':PRIVATE})
            return ['https://fictional.oaiusercontent.com/part-'+str(i)+'?'+query for i in range(15)]
        def encrypt(raw,target,root):
            self.events.append(('ENCRYPT',None));self.clock.advance(encode_delay)
            self.assertEqual(json.loads(raw)['expectedCommit'],TARGET)
            data=base64.b64encode(b'\x84'+b'x'*48).decode()
            return '-----BEGIN PGP MESSAGE-----\n\n'+'\n'.join(data[i:i+64] for i in range(0,len(data),64))+'\n-----END PGP MESSAGE-----'
        return D.execute(self.go,TARGET,LAUNCHER,self.request,api=self.api,git=self.git,now=self.clock,
            encrypt=encrypt,link_provider=provider,ready=ready,state_dir=state,cleanup=cleanup)
    def test_end_only_scope_with_real_record_and_run_gate_before_fresh_links(self):
        self.api.delay=240;result=self.run_case()
        self.assertTrue(result['dispatchAccepted']);self.assertFalse(result['end500Accepted'])
        self.assertEqual((len(self.go),len(self.request['approval'])),(24,17))
        ready=self.events.index(('READY',None));self.assertLess(self.events.index(('GET','/actions/runs/12345678901')),ready)
        self.assertTrue(all(method not in ('GET','PATCH') for method,path in self.events[ready:]))
        self.assertEqual(len(self.api.posts),1);inputs=self.api.posts[0]['inputs']
        self.assertEqual(set(inputs),{'w15_mode','expected_commit','w15_cipher_index','w15_request'})
        self.assertEqual(inputs['w15_mode'],'end500-full-gated');self.assertEqual(inputs['expected_commit'],TARGET)
        self.assertNotIn(PRIVATE,json.dumps(result));self.assertFalse(result['branchChanged'])
    def test_same_head_receiver_launcher_uses_both_real_review_gates(self):
        self.go['launcherCommit']=TARGET
        with patch.dict(globals(),{'LAUNCHER':TARGET}):
            self.go['launcherReviewSHA256']=digest(self.review(True))
            result=self.run_case()
        self.assertTrue(result['dispatchAccepted']);self.assertEqual(result['launcherCommit'],TARGET)
        self.assertEqual(len(self.api.posts),1);self.assertFalse(result['end500Accepted'])

    def test_absent_diagnostic_or_incomplete_restore_record_cannot_be_promoted(self):
        changes=[('status','PASS_ISOLATED_GITHUB_RESTORE_EXPORT_DIAGNOSTIC_ONLY'),('scope',D.W.SCOPES[D.W.DIAGNOSTIC]),
            ('exactCommit','a'*40),('receiptSHA256','d'*64),('runId','12345678902'),('independentOfImplementation',False),
            ('verifiedFiles',11),('profiles',499),('activeProfiles',1),('resourcesAccepted','UNKNOWN'),
            *[(key,False) for key in ('fullRestoreAccepted','backupRoundtripVerified','remoteReadbackObserved','databaseRestoreObserved','cleanupVerified')]]
        for key,value in changes:
            with self.subTest(key=key):
                self.api.record={**acceptance(),key:value};self.go['restoreAcceptanceReviewSHA256']=digest(self.api.record)
                self.events.clear();result=self.run_case()
                self.assertEqual(result['firstFailedPhase'],'restore-acceptance');self.assertNotIn(('READY',None),self.events)
        self.api.record=acceptance()
        for fault in ('missing','duplicate'):
            setattr(self.api,fault,True);self.events.clear();result=self.run_case();setattr(self.api,fault,False)
            self.assertEqual(result['firstFailedPhase'],'restore-acceptance');self.assertEqual(self.api.posts,[])
    def test_exact_actual_previous_workflow_run_is_required(self):
        original=copy.deepcopy(self.api.run)
        for key,value in [('head_sha','a'*40),('event','pull_request'),('run_attempt',2),('status','in_progress'),
                          ('conclusion','failure'),('head_branch','other'),('workflow_id',1),('id',12345678902)]:
            with self.subTest(key=key):
                self.api.run={**original,key:value};self.events.clear();result=self.run_case()
                self.assertEqual(result['firstFailedPhase'],'restore-run');self.assertNotIn(('READY',None),self.events)
        self.api.run=original;self.api.fail_run=True;result=self.run_case()
        self.assertEqual(result['firstFailedPhase'],'restore-run');self.assertEqual(self.api.posts,[])
    def test_missing_restore_acceptance_or_wrong_end_contract_blocks_before_prepare(self):
        original=copy.deepcopy(self.request)
        for key,value in [('restoreAcceptance',{}),('mode','end500-restore-gated'),('maximumWallSeconds',1800),('maxProviderCalls',1)]:
            self.request=copy.deepcopy(original);self.request['approval'][key]=value;self.go['requestSHA256']=digest(self.request)
            self.events.clear();result=self.run_case()
            self.assertEqual(result['firstFailedPhase'],'approval');self.assertNotIn(('READY',None),self.events)
    def test_changed_independent_record_digest_is_not_trusted(self):
        self.go['restoreAcceptanceReviewSHA256']='0'*64;result=self.run_case()
        self.assertEqual(result['firstFailedPhase'],'restore-acceptance');self.assertEqual(self.api.posts,[])
    def test_expiry_and_single_post_unknown_remain_fail_closed_in_end_mode(self):
        result=self.run_case(margin=150,encode_delay=61)
        self.assertEqual(result['firstFailedPhase'],'final-expiry');self.assertEqual(self.api.posts,[])
        self.api.post_error=True;result=self.run_case()
        self.assertEqual(result['status'],'UNKNOWN_END500_DISPATCH_OUTCOME');self.assertEqual(len(self.api.posts),1)
        repeated=self.run_case(state=Path(self.go['stateDir']))
        self.assertEqual(repeated['firstFailedPhase'],'private-root');self.assertEqual(len(self.api.posts),1)
    def test_restore_failure_keeps_first_phase_when_cleanup_fails(self):
        self.api.fail_run=True;result=self.run_case(cleanup=Mock(side_effect=RuntimeError(PRIVATE)))
        self.assertEqual(result['firstFailedPhase'],'restore-run');self.assertEqual(result['secondaryCleanupFailures'],['stdin-restore'])
        self.assertNotIn(PRIVATE,json.dumps(result))
    def test_existing_receiver_enforces_previous_run_differs_from_actual_new_run(self):
        for actual,accepted in [('12345678902',True),('12345678901',False)]:
            value={**self.request,'mode':D.MODE,'exactCommit':TARGET,'branch':'refs/heads/'+D.BRANCH,
                   'runId':actual,'runAttempt':1,'imageId':'sha256:'+'a'*64}
            env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':value['branch'],
                 'GITHUB_SHA':TARGET,'GITHUB_RUN_ID':actual,'GITHUB_RUN_ATTEMPT':'1'}
            payload={'cipherIndex':'SYNTHETIC','keyB64':'SYNTHETIC','passphrase':'SYNTHETIC','eventInputs':{},'artifactCredentials':{}}
            with patch.dict(os.environ,env,clear=True):
                if accepted:D.W.validate_admission(value,payload,now=self.clock())
                else:
                    with self.assertRaises(D.W.WorkflowRejected):D.W.validate_admission(value,payload,now=self.clock())
    def test_default_end_entry_is_inert_and_reuses_qualified_neutral_helpers(self):
        result=subprocess.run([sys.executable,'-I','-B',D.__file__],capture_output=True,check=False)
        self.assertEqual(result.returncode,0);plan=json.loads(result.stdout)
        self.assertEqual(plan['mode'],D.MODE);self.assertFalse(plan['executionAuthority'])
        self.assertIs(D.Git,D.F.Git);self.assertIs(D.source_parts,D.F.source_parts)
        self.assertTrue(issubclass(D.PrivateLinksInput,D.F.PrivateLinksInput))

if __name__=='__main__':unittest.main()
