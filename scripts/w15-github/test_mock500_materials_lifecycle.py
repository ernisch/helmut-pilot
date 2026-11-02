"""Actual root closure and public main with tiny inert diagnostic fixtures."""
import sys
sys.dont_write_bytecode=True
import importlib.util,io,json
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
HERE=Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location('materials_lifecycle_'+name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
S,W,R,T=map(load,('runner_start','mock500_workflow','mock500_runner','test_mock500_materials_diagnostic'))

class LifecycleChecks(unittest.TestCase):
    def closure(self,*,remove_error=False):
        parent=Mock();parent.names.return_value=('FICTIONAL.slice','','');parent.identity.return_value=(1,2)
        if remove_error:parent.privileged.side_effect=OSError('FICTIONAL_STOP_FAILED')
        process=Mock();process.poll.return_value=0
        latch=SimpleNamespace(seen=False,close=Mock())
        observed=S.D.unknown_cleanup();observed.update(workerExited='PASS',workerIPCClosed='PASS')
        result=S._cleanup_launch({},parent,(1,2),True,process,Mock(),latch,None,
            empty_observed=True,observed_cleanup=observed)
        parent.privileged.assert_called_once_with('remove',{})
        return result,observed

    def test_success_exports_all_actual_cleanup_observations_after_unit_remove(self):
        result,observed=self.closure();self.assertIsNone(result)
        self.assertEqual(set(observed.values()),{'PASS'})

    def test_failed_unit_stop_never_becomes_confirmed_cleanup(self):
        result,observed=self.closure(remove_error=True)
        self.assertEqual(result.runner['reason'],'CLEANUP_UNCONFIRMED')
        self.assertEqual(observed['parentUnitRemoved'],'UNKNOWN')
        self.assertEqual(observed['parentStopRequested'],'UNKNOWN')

    def test_real_public_main_keeps_failed_material_outcome_and_zero_counts(self):
        q,value=T.MaterialsResultChecks('runTest').fixture()
        q['maximumWallSeconds']=1080;q['limits']=W.limits(W.MATERIALS)
        receipt=T.HOST.receipt(q);receipt.update(status=T.CONTRACT.OUTER_STATUS,workerResult=value,
            cleanup=dict.fromkeys(S.D.CLEANUP_KEYS,'PASS'))
        private=T.HOST.D.F.payload(q)
        envelope=dict(request=q,privatePayload=private)
        real=W.component
        def component(name,*args,**kwargs):
            return R if name=='mock500_runner' else real(name,*args,**kwargs)
        output=io.StringIO()
        with patch.object(W,'component',side_effect=component),patch.object(W,'validate_admission'),patch.object(W,'validate_event'),\
             patch.object(R,'launch',return_value=receipt),\
             patch.object(W.sys,'stdin',SimpleNamespace(buffer=io.BytesIO(json.dumps(envelope).encode()))),redirect_stdout(output):
            code=W.main(['--launch'])
        # Wire/owned closure succeeds; the JS action separately returns failure
        # for materialsCompleted=false. Neither layer claims a full Mock PASS.
        self.assertEqual(code,0);public=json.loads(output.getvalue())
        self.assertFalse(public['workerResult']['materialsCompleted'])
        self.assertEqual(public['workerResult']['units'],0)
        self.assertFalse(public['workerResult']['backupRoundtripVerified'])
        self.assertEqual(public['workerResult']['firstFailure'],value['firstFailure'])

if __name__=='__main__':unittest.main()
