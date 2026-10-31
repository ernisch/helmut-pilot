"""Small counterexamples for private evidence and the new End500 admission."""
import sys
sys.dont_write_bytecode = True
import copy,hashlib,importlib.util,json,os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch


def load(name):
    spec=importlib.util.spec_from_file_location('phased_checks_'+name,Path(__file__).with_name(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


T,WT,C=load('test_end500_dispatch'),load('test_restore_workflow'),load('test_phase_contract')
D,F=T.D,load('restore_function_acceptance')


def fixture():
    baseline=F.P.FUNCTION_REFERENCE['exactCommit'];target='a'*40
    receipt={'status':'COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY','exactCommit':baseline,
        'runId':F.P.FUNCTION_REFERENCE['runId'],'legacyRestoreAccepted':False,'commonLifetimeMemoryAccepted':False,
        'ownedChildrenExited':True,'workerResult':{'backupRoundtripVerified':True}}
    review={'independentOfOriginalExecution':True,'remainingCriticalOrHighFindings':0,'legacyContractAccepted':False,
        'legacyRestoreAccepted':False,'commonLifetimeMemoryAccepted':False,'restoreAndBackup':{
          'fullAuthenticatedRemoteReadbackCompleted':True,'secondFreshIsolatedRecoveryCompleted':True,
          'allTableDataAndSequenceInventoryAndRoleSemanticsCompared':True}}
    reference={**F.P.FUNCTION_REFERENCE,'receiptSHA256':hashlib.sha256(F.canonical(receipt)+b'\n').hexdigest(),
        'independentReviewSHA256':hashlib.sha256(F.canonical(review)+b'\n').hexdigest()}
    compatibility={'schema':F.COMPATIBILITY,'status':'PASS_INDEPENDENT_RESTORE_FUNCTION_COMPATIBILITY',
        'baselineCommit':baseline,'targetCommit':target,'sourceQualificationSHA256':'b'*64,
        'publicCodeDiffSHA256':hashlib.sha256(b'fictional public code delta').hexdigest(),
        'functionReceiptSHA256':reference['receiptSHA256'],'functionReviewSHA256':reference['independentReviewSHA256'],
        'independentOfImplementation':True,'remainingCriticalOrHighFindings':0,'functionalAlgorithmsUnchanged':True,
        'resourceAndGateChangesReviewed':True,'executionAuthority':False}
    digest=hashlib.sha256(F.canonical(compatibility)).hexdigest()
    public={**reference,'targetCommit':target,'compatibilityReviewSHA256':digest}
    packet={'schema':F.SCHEMA,'receipt':receipt,'independentReview':review,'compatibility':compatibility}
    git=SimpleNamespace(command=Mock(return_value=SimpleNamespace(stdout=b'fictional public code delta')))
    api=Mock(return_value={'id':int(reference['runId']),'head_sha':baseline,
        'head_branch':'codex/w15-github-end500-preparation-20261028','event':'workflow_dispatch','status':'completed',
        'conclusion':'success','run_attempt':1,'workflow_id':313506164})
    return reference,packet,public,target,digest,git,api


class PhasedEndChecks(unittest.TestCase):
    def test_private_functional_proof_reused_without_legacy_promotion_or_original_io(self):
        ref,packet,public,target,digest,git,api=fixture()
        with patch.object(F.P,'FUNCTION_REFERENCE',ref):
            result=F.verify(packet,public,target,'b'*64,digest,git=git,api=api)
        self.assertIs(result['legacyRestoreAccepted'],False)
        self.assertIs(result['executionAuthority'],False)
        self.assertEqual(api.call_count,1)
        self.assertEqual(api.call_args.args[0],'GET')
        self.assertNotIn('receipt',result)

    def test_mutated_or_unreviewed_private_proofs_stop_before_network(self):
        for change in ('receipt','compatibility','ram','target'):
            ref,packet,public,target,digest,git,api=fixture()
            if change=='receipt':packet['receipt']['ownedChildrenExited']=False
            if change=='compatibility':packet['compatibility']['functionalAlgorithmsUnchanged']=False
            if change=='ram':packet['receipt']['legacyRestoreAccepted']=True
            if change=='target':public['targetCommit']='c'*40
            with patch.object(F.P,'FUNCTION_REFERENCE',ref):
                with self.assertRaises(F.FunctionRejected):F.verify(packet,public,target,'b'*64,digest,git=git,api=api)
            api.assert_not_called()

    def test_real_code_diff_and_actual_completed_baseline_are_required(self):
        for change in ('diff','run'):
            ref,packet,public,target,digest,git,api=fixture()
            if change=='diff':git.command.return_value.stdout=b'changed fictional delta'
            else:api.return_value['conclusion']='failure'
            with patch.object(F.P,'FUNCTION_REFERENCE',ref):
                with self.assertRaises(F.FunctionRejected):F.verify(packet,public,target,'b'*64,digest,git=git,api=api)

    def test_new_mode_requires_explicit_contract_reference_and_completed_phases(self):
        W=WT.W;request=WT.request(W.PHASED);private=WT.payload(request)
        request['approval'].update(resourceContract=C.P.END_PROFILE,
            restoreFunctionAcceptance={**C.P.FUNCTION_REFERENCE,'targetCommit':WT.COMMIT,'compatibilityReviewSHA256':'b'*64})
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ID':request['runId'],
             'GITHUB_RUN_ATTEMPT':'1','GITHUB_SHA':request['exactCommit'],'GITHUB_REF':request['branch']}
        self.enterContext(patch.dict(os.environ,env))
        W.validate_admission(request,private)
        with self.assertRaises(W.WorkflowRejected):W._result(request)
        context={k:request[k]for k in ('exactCommit','runId','runAttempt','nonce')}
        boundary=C.P.boundary('end500',context,'b'*64,result_counts=C.P.expected_counts('end500'))
        ack=C.P.ack(boundary,C.processing(),C.backup(1000000000),C.host(),C.IDENTITY)
        phases=C.P.closure(ack,C.backup())
        result=W._result(request,phases)
        self.assertTrue(result['processingMemoryChecksCompleted'])
        self.assertTrue(result['end500BodyCompleted'])
        self.assertFalse(result['fullLifetimeMemoryAccepted'])
        bad=copy.deepcopy(request);bad['approval']['restoreFunctionAcceptance']['legacyRestoreAccepted']=True
        with self.assertRaises(W.WorkflowRejected):W.validate_admission(bad,private)

    def test_sender_selects_new_scope_before_ready_and_binds_actual_workflow_mode(self):
        t=T.EndSenderChecks();t.setUp();self.addCleanup(t.doCleanups)
        selected=D.PC.SCOPES[D.PC.END_MODE]
        original=t.review
        t.review=lambda launcher=False:{**original(launcher),'scope':selected}
        t.request['approval'].pop('restoreAcceptance')
        t.request['approval'].update(scope=selected,mode=D.PC.END_MODE,resourceContract=D.PC.END_PROFILE,
            restoreFunctionAcceptance={**D.PC.FUNCTION_REFERENCE,'targetCommit':T.TARGET,'compatibilityReviewSHA256':'c'*64})
        t.go.update(scope=selected,requestSHA256=T.digest(t.request),reviewSHA256=T.digest(t.review()),
            launcherReviewSHA256=T.digest(t.review(True)),restoreAcceptanceReviewSHA256='c'*64)
        def checked(*args,**kwargs):t.events.append(('PRIVATE_FUNCTION_CHECK',None))
        with patch.object(D.FUNCTION,'verify',side_effect=checked):result=t.run_case()
        self.assertTrue(result['dispatchAccepted'])
        self.assertLess(t.events.index(('PRIVATE_FUNCTION_CHECK',None)),t.events.index(('READY',None)))
        self.assertEqual(t.api.posts[0]['inputs']['w15_mode'],D.PC.END_MODE)
        declaration=json.loads(t.api.posts[0]['inputs']['w15_request'])
        self.assertNotIn('independentReview',declaration['approval']['restoreFunctionAcceptance'])
        self.assertNotIn('receipt',declaration['approval']['restoreFunctionAcceptance'])
        self.assertFalse(result['end500Accepted'])

    def test_mock_privileged_entry_pins_new_capacity_and_contract_sources(self):
        M=load('mock500_runner')
        req={'mode':M.PHASED,'exactCommit':'a'*40,'branch':'refs/heads/codex/w15-github-end500-preparation-20261028',
             'runId':'123456789','runAttempt':1}
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':req['exactCommit'],
             'GITHUB_REF':req['branch'],'GITHUB_RUN_ID':req['runId'],'GITHUB_RUN_ATTEMPT':'1'}
        for corrupt in (False,True):
            queries=[]
            def git(repo,args,**kwargs):
                if args==['rev-parse','HEAD']:return (req['exactCommit']+'\n').encode()
                self.assertEqual(args[:2],['ls-tree','-z'])
                relative=args[-1];queries.append(relative)
                raw=(M.REPO/relative).read_bytes()
                sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
                if corrupt and relative.endswith('/restore_capacity.py'):sha='0'*40
                return ('100644 blob '+sha+'\t'+relative+'\0').encode()
            with patch.dict(os.environ,env),patch.object(M.S,'_git',side_effect=git):
                if corrupt:
                    with self.assertRaises(M.MockRunnerError):M.github_binding(req)
                else:M.github_binding(req)
            self.assertIn('scripts/w15-github/restore_capacity.py',queries)
            if not corrupt:self.assertIn('scripts/w15-github/phase_contract.py',queries)


    def test_missing_private_evidence_never_reaches_original_link_provider(self):
        with self.assertRaises(F.FunctionRejected):F.verify(None,{},'a'*40,'b'*64,'c'*64,git=Mock(),api=Mock())


if __name__=='__main__':unittest.main()
