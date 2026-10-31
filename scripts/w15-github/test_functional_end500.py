"""Tiny closed-contract/actual-controller counterexamples, no original or full run."""
import sys
sys.dont_write_bytecode = True

import ast
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent

def load(name):
    spec = importlib.util.spec_from_file_location('functional_end_checks_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

F, T, B = load('test_restore_workflow'), load('test_restore_capacity'), load('test_end500_backup_failure_boundary')
W, R, FC = F.W, load('runner_start'), load('functional_contract')
NOW = datetime(2026,11,2,10,tzinfo=timezone.utc)

class Clock(datetime):
    @classmethod
    def now(cls, tz=None): return NOW.astimezone(tz) if tz else NOW.replace(tzinfo=None)

def request():
    q = F.request(W.FUNCTIONAL)
    q['limits'] = FC.limits('end500')
    q['approval'].update(limits=copy.deepcopy(q['limits']), resourceContract=FC.CONTRACT,
        issuedAt='2026-11-02T09:59:00Z',expiresAt='2026-11-02T11:00:00Z',
        restoreFunctionAcceptance={**W._load('phase_contract').FUNCTION_REFERENCE,
            'targetCommit':F.COMMIT,'compatibilityReviewSHA256':'b'*64})
    return q

def counts():
    return dict(authCAS=500,usageRows=6000,nativePostimages=3501,activeProfiles=0,
        exportCompleted=True,ownedServicesStopped=True,authenticatedRemoteReadback=True,secondRecoveryIntegrity=True)

class FunctionalEndChecks(unittest.TestCase):
    def test_new_dispatch_finishes_gates_before_one_fresh_link_round(self):
        E=load('test_end500_dispatch');fixture=E.EndSenderChecks();fixture.setUp()
        self.addCleanup(fixture.doCleanups);fixture.clock.value=NOW
        q,go=fixture.request,fixture.go
        q['limits']=FC.limits('end500');approval=q['approval'];approval.pop('restoreAcceptance')
        approval.update(scope=E.D.FUNCTIONAL_SCOPE,mode=FC.END_MODE,limits=copy.deepcopy(q['limits']),
            resourceContract=FC.CONTRACT,restoreFunctionAcceptance={**E.D.PC.FUNCTION_REFERENCE,
                'targetCommit':E.TARGET,'compatibilityReviewSHA256':'b'*64},
            issuedAt='2026-11-02T10:00:00Z',expiresAt='2026-11-02T11:00:00Z')
        go.update(scope=E.D.FUNCTIONAL_SCOPE,issuedAt=approval['issuedAt'],expiresAt=approval['expiresAt'])
        old_review=fixture.review
        fixture.review=lambda launcher=False:{**old_review(launcher),'scope':E.D.FUNCTIONAL_SCOPE}
        go.update(reviewSHA256=E.digest(fixture.review()),launcherReviewSHA256=E.digest(fixture.review(True)),
            requestSHA256=E.digest(q))
        # Shared encrypted_index whitelist is integrated/qualified centrally.
        with patch.object(E.D.FUNCTION,'verify',return_value={'executionAuthority':False}) as proof, \
             patch.object(E.D.N,'dispatch_payload',return_value=b'{}') as payload_api:
            result=fixture.run_case()
        self.assertEqual(result['mode'],FC.END_MODE);self.assertTrue(result['dispatchAccepted'],result)
        self.assertEqual(sum(event[0]=='LINKS' for event in fixture.events),1)
        self.assertLess(next(i for i,e in enumerate(fixture.events) if e[0]=='READY'),
            next(i for i,e in enumerate(fixture.events) if e[0]=='LINKS'))
        self.assertEqual(len(fixture.api.posts),1);proof.assert_called_once()
        self.assertEqual(payload_api.call_args.kwargs['mode'],FC.END_MODE)
        self.assertEqual(set(payload_api.call_args.kwargs['extra_inputs']),{'w15_request'})

    def test_exact_explicit_new_contract_old_modes_and_limits_unchanged(self):
        q=request()
        with patch.object(W,'datetime',Clock),patch.dict(os.environ,F.environment(q)):
            W.validate_admission(q,F.payload(q)); R.validate_request(q,F.payload(q))
            for key,bad in (('resourceContract',W._load('phase_contract').END_PROFILE),
                            ('limits',copy.deepcopy(W.LIMITS)),('expiresAt','2026-11-02T09:59:59Z')):
                wrong=copy.deepcopy(q); wrong['approval'][key]=bad
                with self.assertRaises((W.WorkflowRejected,ValueError)):W.validate_admission(wrong,F.payload(wrong))
        context=R._ctx(q)
        self.assertEqual(context['functionalStage'],'end500')
        self.assertNotIn('capacityDiagnostic',context);self.assertNotIn('processingBackupStage',context)
        q['mode']=FC.MOCK_MODE
        self.assertEqual(R._ctx(q)['functionalStage'],'mock500')
        self.assertEqual(W.LIMITS['maximumConsumptionBytes'],2048000000)
        self.assertEqual(T.C.MAXIMUM,2048000000)

    def test_full_result_requires_actual_complete_new_counts_no_legacy_promotion(self):
        q=request()
        with self.assertRaises(W.WorkflowRejected):W._result(q)
        result=W._result(q,functional_results=counts());R._worker_result(result,q)
        self.assertFalse(result['legacyRegularMemoryAccepted']);self.assertFalse(result['end500Acceptance'])
        for key in counts():
            bad=copy.deepcopy(result)
            bad['functionalResults'][key]=False if type(counts()[key]) is bool else counts()[key]+1
            with self.subTest(key=key),self.assertRaises(W.WorkflowRejected):W.validate_public_result(bad)
        bad=copy.deepcopy(result);bad['functionalResults']['PRIVATE_PATH']='/do-not-export'
        with self.assertRaises(R.RunnerStartError):R._worker_result(bad,q)

    def test_final_results_read_current_native_audit_and_authenticated_recovery(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'CONTROLLER_RESULT.SAFE.json'
            record=dict(functionalContract=FC.CONTRACT,functionalProcessingClosureCompleted=True,
                functionalSafetyChecksCompleted=True,finalKernelReadbackVerified=True,failure=None,
                innerStopFailure=None,serviceClosure={'status':'PASS_GENUINE_OWNED_SERVICE_EXIT'},
                finalDatabaseExport={'status':'FICTIONAL_COMPLETE'},CASCompleted=500,activeProfiles=0,
                finalNativeAudit={'fullLogicalUsageRows':6000,'totalExactPostimages':3501})
            recovery=dict(completeTableAndSequenceInventoryMatched=True,rolesSemanticsMatched=True,
                ownedRecoveryContainerStopped=True,recoveryWatchClosed=True)
            receipt=dict(remoteReadbackObserved=True,databaseRestoreObserved=True,independentRecovery=recovery)
            path.write_text(json.dumps(record))
            self.assertEqual(W._functional_results(SimpleNamespace(WORK=Path(root)),receipt),counts())
            record['finalNativeAudit']['totalExactPostimages']=3500;path.write_text(json.dumps(record))
            with self.assertRaises(W.WorkflowRejected):W._functional_results(SimpleNamespace(WORK=Path(root)),receipt)
            record['finalNativeAudit']['totalExactPostimages']=3501;path.write_text(json.dumps(record))
            recovery['ownedRecoveryContainerStopped']=False
            with self.assertRaises(W.WorkflowRejected):W._functional_results(SimpleNamespace(WORK=Path(root)),receipt)

    def test_actual_inner_guard_observes_old_excess_but_rejects_hard_events_host_or_swap(self):
        tree=ast.parse((HERE.parent/'synthetik-500-w15-memory-forward.py').read_text())
        method=next(n for n in next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Watch').body if isinstance(n,ast.FunctionDef) and n.name=='sample')
        sample=T.sample();sample['capacityMeasurement']=T.measurement(sample)
        scope={'time':SimpleNamespace(monotonic=lambda:0),'WORK':Path('/FICTIONAL'),
            '_runtime_module':lambda name:FC,'end500_memory_assessment':lambda value:False}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[method],type_ignores=[])),'actual-functional-watch','exec'),scope)
        watch=SimpleNamespace(common_resources=SimpleNamespace(functional_stage='end500',sample=lambda:copy.deepcopy(sample)),
            start_guard=None,mock_backup_closure=False,last=None,maximum=0,memory_failure=None,disk_check=lambda:None,last_component=1)
        scope['sample'](watch);self.assertEqual(watch.maximum,3100000000)
        self.assertNotIn('capacityDiagnosticOnly',watch.last)
        bads=[]
        for key,value in [('swapCurrentBytes',1),('kernelLifetimePeakBytes',FC.HARD_LIMIT+1)]:
            bad=copy.deepcopy(sample);bad[key]=value;bads.append(bad)
        bad=copy.deepcopy(sample);bad['events']['max']=1;bads.append(bad)
        bad=copy.deepcopy(sample);bad['capacityMeasurement']['last']['hostAvailableBytes']=FC.HOST_RESERVE-1;bads.append(bad)
        for bad in bads:
            watch.common_resources.sample=lambda:copy.deepcopy(bad)
            with self.assertRaises(ValueError):scope['sample'](watch)
        self.assertIsNotNone(watch.memory_failure)

    def test_functional_backup_reaches_real_collection_without_old_ram_pass(self):
        fixture=B.End500BackupFailureBoundaryChecks();fixture.setUp();self.addCleanup(fixture.doCleanups)
        fixture.scope.update(functional=True,actual_memory_accepted=False)
        fixture.resources.functional_stage='end500';fixture.inject='collect'
        fixture.run_boundary()
        self.assertEqual(fixture.exit_error().backup_failure_phase,'backup-collect')
        self.assertEqual(fixture.calls,['collect'])
        self.assertEqual(fixture.phases,['capacity-processing-stopped','backup-collect'])
        fixture=B.End500BackupFailureBoundaryChecks();fixture.setUp();self.addCleanup(fixture.doCleanups)
        fixture.scope.update(functional=True,actual_memory_accepted=False,functional_closure_completed=False)
        fixture.run_boundary();self.assertEqual(fixture.calls,[])

if __name__=='__main__':unittest.main()
