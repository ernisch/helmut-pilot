"""Actual final MAIN boundary with fictional launch; no host or Original work."""
import sys
sys.dont_write_bytecode=True
import copy,importlib.util,io,json
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
HERE=Path(__file__).parent
def load(n):
    s=importlib.util.spec_from_file_location('mock_host_main_'+n,HERE/(n+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
T,W,R=map(load,('test_mock500_host_contract','mock500_workflow','mock500_runner'))
class MainClosureChecks(unittest.TestCase):
    def run_main(self, mutate=lambda r:None):
        q=T.request();r=T.receipt(q);mutate(r)
        envelope=dict(request=q,privatePayload=T.D.F.payload(q))
        real=W.component
        def component(n,*a,**k):return R if n=='mock500_runner' else T.H if n=='mock500_host_contract' else real(n,*a,**k)
        output=io.StringIO()
        with patch.object(W,'component',side_effect=component),patch.object(W,'validate_admission'),patch.object(W,'validate_event'), \
             patch.object(R,'launch',return_value=r) as launch,patch.object(R,'PHASE','closure'), \
             patch.object(W.sys,'stdin',SimpleNamespace(buffer=io.BytesIO(json.dumps(envelope).encode()))),redirect_stdout(output):
            code=W.main(['--launch'])
        launch.assert_called_once()
        return code,json.loads(output.getvalue())
    def test_public_root_projection_survives_actual_final_main(self):
        code,r=self.run_main();self.assertEqual(code,0,r)
        self.assertEqual(r['hostFunctionalObservation']['status'],T.H.OBSERVATION_STATUS)
        self.assertEqual(r['hostFunctionalObservation']['processingCounts'],T.H.COUNTS)
        self.assertFalse(r['legacyRegularMemoryAccepted']);self.assertFalse(r['providerResourceAccepted'])
    def test_public_budget_or_admission_mismatch_fails_closed_without_reselection(self):
        for mutation in (lambda r:r['hostCapacityBudget'].__setitem__('hardLimitBytes',r['hostCapacityBudget']['hardLimitBytes']-4096),
                         lambda r:r['hostCapacityAdmission'].__setitem__('hierarchyRootProven',False)):
            with self.subTest(mutation=mutation):
                code,r=self.run_main(mutation);self.assertEqual(code,1);self.assertEqual(r['status'],'FAIL_OR_BLOCKED_MOCK500_WORKFLOW');self.assertEqual(r['phase'],'closure')
    def test_missing_real_backup_or_audit_result_cannot_become_success(self):
        for mutation in (lambda r:r['workerResult'].__setitem__('backupRoundtripVerified',False),
                         lambda r:r['workerResult']['functionalResults'].__setitem__('unitChecksCompleted',16999)):
            with self.subTest(mutation=mutation):
                code,r=self.run_main(mutation);self.assertEqual(code,1);self.assertEqual(r['status'],'FAIL_OR_BLOCKED_MOCK500_WORKFLOW');self.assertEqual(r['phase'],'closure')
if __name__=='__main__':unittest.main()
