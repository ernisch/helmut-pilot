"""Small fictional capacity/policy/IPC tests; never a host/original test."""
import sys
sys.dont_write_bytecode=True
import copy
import importlib.util
import json
import os
import re
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

def load(name):
    s=importlib.util.spec_from_file_location('host_test_'+name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

CAP=load('restore_capacity');F=load('test_restore_workflow');R=load('runner_start');P=R.P
GiB=1024**3

def observation(finite=True):
    rows=[dict(relativePath='/system.slice/runner.service',identity=[1,3],maximumBytes=10*GiB if finite else 'UNLIMITED',
        currentBytes=GiB,headroomBytes=9*GiB if finite else 'UNLIMITED'),
        dict(relativePath='/system.slice',identity=[1,2],maximumBytes='UNLIMITED',currentBytes=GiB,headroomBytes='UNLIMITED'),
        dict(relativePath='/',identity=[1,1],maximumBytes='UNLIMITED_ROOT',currentBytes='NOT_APPLICABLE',headroomBytes='UNLIMITED_ROOT')]
    return dict(hostTotalBytes=16*GiB,hostAvailableBytes=14*GiB+123,hierarchyRootIdentity=[1,1],
                callerRelativePath='/system.slice/runner.service',ancestors=rows,observedMonotonicNS=123456)

def admission(finite=True):return CAP.host_admission_dynamic(observation=observation(finite))

def sample(a):
    b=CAP.host_budget(a)
    return dict(configuredLimit=str(b['hardLimitBytes']),kernelLifetimePeakBytes=6*GiB,currentBytes=6*GiB,
        swapMaximum='0',swapCurrentBytes=0,events=dict(max=0,oom=0,oom_kill=0,oom_group_kill=0),
        hostCapacityBudget=b,hostCapacitySafetyObserved=False,
        hostCapacityObservation=dict(schema=CAP.HOST_OBSERVATION_SCHEMA,status='PASS',hostAvailableBytes=3*GiB,
        minimumAncestorHeadroomBytes=9*GiB,requiredAncestorHeadroomBytes=9*GiB,minimumHostReserveBytes=2*GiB,
        observedMonotonicNS=999999,ancestorIdentitiesMatch=True))

def request():
    q=F.request(F.W.HOST_CAPACITY);q['limits']=dict(CAP.HOST_POLICY)
    q['approval'].update(limits=dict(CAP.HOST_POLICY),resourceContract=CAP.HOST_PROFILE,
        restoreFunctionAcceptance={**P.R.phase_contract().FUNCTION_REFERENCE,'targetCommit':F.COMMIT,
                                  'compatibilityReviewSHA256':'b'*64})
    return q

class DynamicHostCapacity(unittest.TestCase):
    def test_exact_minimum_all_ancestors_and_page_floor_no_five_gb_cap(self):
        a=admission();self.assertEqual(a['diagnosticHardLimitBytes'],7*GiB)
        b=admission(False);self.assertEqual(b['diagnosticHardLimitBytes'],12*GiB)
        self.assertGreater(a['diagnosticHardLimitBytes'],CAP.HARD_LIMIT)
        self.assertEqual(CAP.HARD_LIMIT,4999999488)
        self.assertEqual(CAP.HOST_RESERVE,2147483648)
        for amount in (0,GiB):
            o=observation();o['hostAvailableBytes']=amount
            with self.assertRaises(ValueError):CAP.host_admission_dynamic(observation=o)

    def test_bound_admission_rejects_cap_change_extra_paths_and_boolean(self):
        for change in ({'diagnosticHardLimitBytes':8*GiB},{'hostTotalBytes':True},{'privateURL':'MUST_NOT_ESCAPE'},
                       {'callerRelativePath':'/../unsafe'}):
            a=admission();a.update(change);self.assertIsNone(CAP.host_closed_admission(a))
        a=admission();a['ancestors'][0]['identity']=[1,1];self.assertIsNone(CAP.host_closed_admission(a))
        self.assertNotIn('callerRelativePath',CAP.host_public_admission(admission()))
        self.assertNotIn('identity',json.dumps(CAP.host_public_admission(admission())))

    def test_pure_sample_accepts_old_excess_only_with_admitted_budget(self):
        a=admission();v=sample(a);CAP.host_assess(v,a)
        for k,x in [('configuredLimit','4999999488'),('swapCurrentBytes',1),('kernelLifetimePeakBytes',8*GiB)]:
            bad=copy.deepcopy(v);bad[k]=x
            with self.assertRaises(ValueError):CAP.host_assess(bad,a)
        for event in ('max','oom','oom_kill','oom_group_kill'):
            bad=copy.deepcopy(v);bad['events'][event]=1
            with self.assertRaises(ValueError):CAP.host_assess(bad,a)
        bad=copy.deepcopy(v);bad['hostCapacityObservation']['minimumAncestorHeadroomBytes']=8*GiB
        with self.assertRaises(ValueError):CAP.host_assess(bad,a)

    def test_runtime_preserves_original_caller_identity_and_stops_on_loss(self):
        a=admission();anc=copy.deepcopy({r['relativePath']:r for r in a['ancestors']})
        with patch.object(CAP,'_host_root_proof',return_value=[1,1]),patch.object(CAP,'_host_meminfo',return_value=(16*GiB,3*GiB)),patch.object(CAP,'_host_ancestor',side_effect=lambda p:copy.deepcopy(anc[p])):
            self.assertEqual(CAP.host_runtime_guard(a)['status'],'PASS')
            anc['/system.slice/runner.service']['headroomBytes']-=4096
            anc['/system.slice/runner.service']['currentBytes']+=4096
            self.assertEqual(CAP.host_runtime_guard(a)['status'],'FAIL_ANCESTOR_HEADROOM')
            anc['/system.slice/runner.service']['identity']=[1,999]
            self.assertEqual(CAP.host_runtime_guard(a)['status'],'UNKNOWN')
        with patch.object(CAP,'_host_root_proof',return_value=[1,1]),patch.object(CAP,'_host_meminfo',return_value=(16*GiB,GiB)),patch.object(CAP,'_host_ancestor',side_effect=lambda p:copy.deepcopy(a['ancestors'][['/system.slice/runner.service','/system.slice','/'].index(p)])):
            self.assertEqual(CAP.host_runtime_guard(a)['status'],'FAIL_HOST_RESERVE')

    def test_new_policy_scope_and_request_unchanged_no_execution_acceptance(self):
        q=request();before=copy.deepcopy(q)
        with patch.dict(os.environ,F.environment(q)):
            F.W.validate_admission(q,F.payload(q));R.validate_request(q,F.payload(q))
            for key,value in [('limits',CAP.LIMITS),('maximumWallSeconds',1800)]:
                bad=copy.deepcopy(q);bad[key]=value
                with self.assertRaises(Exception):F.W.validate_admission(bad,F.payload(bad))
        self.assertEqual(q,before)
        ctx=R._ctx(q);self.assertTrue(ctx['hostCapacityDiagnostic']);self.assertNotIn('hostCapacityAdmission',ctx)
        self.assertNotIn('functionalStage',ctx)
        proof=dict(authCAS=500,usageRows=6000,nativePostimages=3501,activeProfiles=0,
            exportCompleted=True,ownedServicesStopped=True,authenticatedRemoteReadback=True,secondRecoveryIntegrity=True)
        body=F.W._result(q,functional_results=proof);R._worker_result(body,q)
        self.assertTrue(body['hostCapacityDiagnosticOnly']);self.assertFalse(body['end500Acceptance'])
        self.assertFalse(body['legacyRestoreAccepted']);self.assertNotIn('functionalContract',body)

    def test_same_budget_is_kernel_unit_limit_and_old_modes_unchanged(self):
        ctx=P.context('123456789',F.COMMIT,F.NONCE);ctx.update(capacityDiagnostic=True,hostCapacityDiagnostic=True,hostCapacityAdmission=admission())
        self.assertIn(b'MemoryMax='+str(7*GiB).encode()+b'\n',P.unit_bytes(ctx))
        self.assertIn('--host-capacity-diagnostic',P.internal_argv('prepare',ctx))
        self.assertIn(b'MemoryMax=4999999488\n',P.unit_bytes(dict(ctx,hostCapacityDiagnostic=False)))
        self.assertEqual(F.W.LIMITS['maximumConsumptionBytes'],2048000000)

    def test_workflow_selects_actual_host_job_and_provenance_is_not_budget(self):
        workflow=Path(__file__).parents[2]/'.github/workflows/ci.yml'
        section=re.search(r'(?ms)^  w15-isolated:\n(.*?)(?=^  [A-Za-z0-9_-]+:|\Z)',workflow.read_text()).group(1)
        self.assertIn("inputs.w15_mode == '"+CAP.HOST_MODE+"'",section)
        provenance=CAP.host_caller_provenance(admission())
        changed=admission();changed['ancestors'][0]['identity']=[1,777]
        self.assertNotEqual(provenance,CAP.host_caller_provenance(changed))
        self.assertNotIn('diagnosticHardLimitBytes',provenance)

    def test_privileged_reply_bound_to_actual_outer_caller_before_any_originals(self):
        a=admission();provenance=CAP.host_caller_provenance(a)
        reply=SimpleNamespace(stdout=json.dumps(dict(status='PASS_ROOT_BOUND_HOST_CAPACITY_PARENT_ONLY',hostCapacityAdmission=a)).encode())
        ctx=R._ctx(request());public=R._bind_host_preparation(ctx,reply,provenance)
        self.assertEqual(ctx['hostCapacityAdmission'],a)
        self.assertEqual(public['diagnosticHardLimitBytes'],7*GiB)
        self.assertNotIn('callerRelativePath',public)
        wrong=copy.deepcopy(provenance);wrong['callerRelativePath']='/different.scope'
        with self.assertRaises(R.RunnerStartError):R._bind_host_preparation(R._ctx(request()),reply,wrong)
        with self.assertRaises(R.RunnerStartError):R._bind_host_preparation({},reply,provenance)

if __name__=='__main__':unittest.main()
