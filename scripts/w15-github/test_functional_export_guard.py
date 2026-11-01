"""Tiny actual restore/export seams under the new contract; no native/original run."""
import sys
sys.dont_write_bytecode = True

import copy
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest

HERE=Path(__file__).parent

def load(name):
    spec=importlib.util.spec_from_file_location('functional_export_checks_'+name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

R,BF,RF,T=load('restore_backup'),load('test_runtime_backup'),load('test_runtime_restore'),load('test_restore_capacity')

def sample():
    value=T.sample();value['capacityMeasurement']=T.measurement(value);return value

def resources(value,stage='end500'):
    return SimpleNamespace(functional_stage=stage,capacity_diagnostic=False,memory_phase='processing',
        processing_backup_stage=None,sample=lambda:copy.deepcopy(value))

class FunctionalExportChecks(unittest.TestCase):
    def exporter(self,stage='end500'):
        fixture=BF.RuntimeBackupChecks();fixture.setUp();self.addCleanup(fixture.doCleanups)
        fixture.context['recipientFingerprint']=R.FINGERPRINT
        fixture.supervisor.last=sample();fixture.supervisor.common_resources=resources(sample(),stage)
        return fixture

    def restore(self,stage='end500'):
        fixture=RF.RestoreChecks();fixture.setUp();self.addCleanup(fixture.doCleanups)
        fixture.w.last=sample();fixture.w.common_resources=resources(sample(),stage)
        fixture.controller.save.side_effect=lambda name,value:fixture.write(fixture.work,name,json.dumps(value).encode())
        result=fixture.restore()
        self.assertEqual((result['profiles'],result['active'],result['steps']),(500,0,5))
        self.assertFalse(result['fullRestoreAccepted'])
        return fixture

    def test_actual_five_restore_then_four_export_actions_keep_integrity_and_legacy_false(self):
        for stage in ('end500','mock500'):
            with self.subTest(stage=stage):
                restored=self.restore(stage);exported=self.exporter(stage)
                exported.work=restored.work
                result=R.export_restore_database(exported.context,expected_context=exported.context,
                    work=restored.work,container=exported.container,database=R.B.DATABASE,
                    supervisor=exported.supervisor,run_owned=exported.run_owned)
                self.assertEqual([x[1] for x in restored.calls],list(R.T.ACTIONS))
                self.assertEqual([x[1] for x in exported.calls],list(R.ACTIONS))
                self.assertEqual(result['initialKernelSample']['configuredLimit'],'4999999488')
                self.assertGreater(result['finalKernelSample']['kernelLifetimePeakBytes'],2048000000)
                self.assertFalse(result['acceptedAsCompleteBackup']);self.assertFalse(result['remoteReadbackObserved'])
                self.assertFalse(exported.supervisor.common_resources.capacity_diagnostic)
                self.assertEqual(exported.supervisor.common_resources.memory_phase,'processing')

    def test_full_end_export_reaches_four_actions_with_new_guard_but_old_mode_cannot(self):
        exported=self.exporter()
        result=exported.export()
        self.assertEqual([x[1] for x in exported.calls],list(R.ACTIONS))
        self.assertFalse(result['acceptedAsCompleteBackup'])
        exported=self.exporter();exported.supervisor.common_resources.functional_stage=None
        with self.assertRaises(Exception):exported.export()
        self.assertEqual(exported.calls,[])

    def test_actual_current_guard_rejects_hard_swap_max_and_host_before_first_native_action(self):
        bads=[]
        for key,value in (('configuredLimit','2560000000'),('kernelLifetimePeakBytes',4999999489),('swapCurrentBytes',1)):
            bad=sample();bad[key]=value;bads.append(bad)
        bad=sample();bad['events']['max']=1;bads.append(bad)
        bad=sample();bad['capacityMeasurement']['last']['hostAvailableBytes']=2147483647;bads.append(bad)
        for bad in bads:
            exported=self.exporter();exported.supervisor.common_resources=resources(bad)
            with self.assertRaises(ValueError):R.R._sample(exported.supervisor)
            self.assertEqual(exported.calls,[])

    def test_recovery_rechecks_historical_kernel_host_and_all_original_lifecycle_pins(self):
        restored=self.restore()
        fd=R.S._directory(str(restored.work),private=True)
        try:
            self.assertEqual(R._restore_closure(fd,functional_stage='end500')['profiles'],500)
            with self.assertRaises(Exception):R._restore_closure(fd)
            with self.assertRaises(Exception):R._restore_closure(fd,functional_stage='end500',capacity_diagnostic=True)
            path=restored.work/'state/restore/RESTORE_CLOSURE.PRIVATE.json'
            original=json.loads(path.read_bytes());bad=copy.deepcopy(original)
            bad['initialKernelSample']['capacityMeasurement']['last']['hostAvailableBytes']=2147483647
            path.write_text(json.dumps(bad))
            with self.assertRaises(ValueError):R._restore_closure(fd,functional_stage='end500')
            path.write_text(json.dumps(original))
            (restored.work/'state/restore/restore-apply.PRIVATE.stderr').write_bytes(b'FICTIONAL DRIFT')
            with self.assertRaises(Exception):R._restore_closure(fd,functional_stage='end500')
        finally:os.close(fd)

if __name__=='__main__':unittest.main()
