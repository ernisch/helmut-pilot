"""Small isolated contract counterexamples; never originals or a load run."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import importlib.util
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC=importlib.util.spec_from_file_location('w15_functional_contract_tests',Path(__file__).with_name('functional_contract.py'))
F=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(F)


def sample(peak=3680530432, host=None):
    cap=F.load('restore_capacity')
    return {'configuredLimit':str(F.HARD_LIMIT),'swapMaximum':'0','kernelLifetimePeakBytes':peak,
        'currentBytes':peak,'swapCurrentBytes':0,
        'events':dict.fromkeys(('max','oom','oom_kill','oom_group_kill'),0),
        'capacityMeasurement':{'schema':cap.SCHEMA,'diagnosticOnly':True,
            'legacyPeakLimitBytes':cap.LEGACY_PEAK,'legacyPeakExceeded':peak>cap.LEGACY_PEAK,
            'legacyContractAccepted':False,'sampleCount':1,'maximumObservedCurrentBytes':peak,
            'categoryMaxima':dict.fromkeys(cap.CATEGORIES,0),'phaseObservations':[],
            'last':{'hostAvailableBytes':F.HOST_RESERVE if host is None else host,
                'memoryStat':dict.fromkeys(cap.CATEGORIES,0),'memoryPressure':'UNKNOWN',
                'observedMonotonicNS':123456789,'peakCompositionKnown':False}}}


class FunctionalContractChecks(unittest.TestCase):
    def test_existing_exact_constants_and_separate_modes_keep_legacy_limits(self):
        phase=F.load('phase_contract')
        self.assertEqual((F.HARD_LIMIT,F.HOST_RESERVE),(phase.HARD_LIMIT,phase.HOST_RESERVE))
        self.assertEqual(F.stage(F.END_MODE),'end500');self.assertEqual(F.stage(F.MOCK_MODE),'mock500')
        self.assertIsNone(F.stage(phase.END_MODE));self.assertIsNone(F.stage(phase.MOCK_MODE))
        self.assertEqual(phase.processing_limits('end500')['maximumConsumptionBytes'],2048000000)
        self.assertEqual(phase.processing_limits('mock500')['maximumConsumptionBytes'],1638400000)
        for name in ('end500','mock500'):
            self.assertEqual(F.limits(name),{'comparisonBudgetBytes':F.HARD_LIMIT,
                'maximumConsumptionBytes':F.HARD_LIMIT,'requiredReserveBytes':0,'swapBytes':0})
            self.assertNotEqual(F.profile(name),phase.profile(name))
        self.assertEqual((F.MAX_ATTEMPTS,F.MAX_STORAGE_CENTS_CHAIN),(3,15))

    def test_old_processing_reference_overruns_are_observed_not_accepted_or_aborted(self):
        for name in ('end500','mock500'):
            value=sample();self.assertEqual(F.assess(value,name),value)
            report=F.reference_summary(value,name)
            self.assertTrue(report['historicalProcessingPeakExceeded'])
            for key in ('historicalRegularMemoryAccepted','providerResourceAccepted','fullLifetimeClosureAccepted','executionAuthority'):
                self.assertFalse(report[key])
            self.assertEqual(report['allocationFailureObserved'],'UNKNOWN')
        self.assertEqual(F.assess(sample(F.HARD_LIMIT),'end500')['kernelLifetimePeakBytes'],F.HARD_LIMIT)

    def test_actual_safety_cap_host_swap_events_and_unknowns_fail_closed(self):
        for mutate in (lambda x:x.update(configuredLimit='2048000000'),
                lambda x:x.update(kernelLifetimePeakBytes=F.HARD_LIMIT+1),
                lambda x:x.update(swapCurrentBytes=1),lambda x:x.update(currentBytes=True),
                lambda x:x['events'].update(max=1),lambda x:x['events'].update(oom=1),
                lambda x:x['events'].update(oom_kill=1),lambda x:x['events'].update(oom_group_kill=1),
                lambda x:x['capacityMeasurement']['last'].update(hostAvailableBytes=F.HOST_RESERVE-1),
                lambda x:x['capacityMeasurement']['last'].update(hostAvailableBytes='UNKNOWN'),
                lambda x:x.pop('capacityMeasurement')):
            value=sample();mutate(value)
            with self.assertRaises(F.FunctionalRejected):F.assess(value,'mock500')

    def test_new_window_is_real_bounded_and_preserves_full_mock_utc_berlin_day(self):
        parse=lambda text:datetime.fromisoformat(text.replace('Z','+00:00'))
        for stamp in ('2026-11-01T00:00:00Z','2026-11-07T19:29:59Z'):
            result=F.validate_window('mock500',parse(stamp))
            self.assertEqual(result['maximumWallSeconds'],12600);self.assertEqual(result['processingSeconds'],10800)
        for stamp in ('2026-10-31T23:59:59Z','2026-11-01T19:30:00Z','2026-11-07T19:30:00Z','2026-11-08T00:00:00Z'):
            with self.assertRaises(F.FunctionalRejected):F.validate_window('mock500',parse(stamp))
        F.validate_window('end500',parse('2026-11-06T23:30:00Z'))
        with self.assertRaises(F.FunctionalRejected):F.validate_window('end500',parse('2026-11-07T22:30:00Z'))
        with self.assertRaises(F.FunctionalRejected):F.validate_window('mock500',datetime(2026,11,1))

    def test_real_observer_branch_reuses_exact_parent_and_meter_without_old_flags(self):
        C=F.load('common_resources')
        with tempfile.TemporaryDirectory(prefix='functional-fictional-parent-') as tmp:
            root=Path(tmp);expected=sample()
            for name,value in {'memory.max':str(F.HARD_LIMIT),'memory.swap.max':'0',
                'memory.peak':str(expected['kernelLifetimePeakBytes']),'memory.current':str(expected['currentBytes']),
                'memory.swap.current':'0','memory.events':'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}.items():
                (root/name).write_text(value)
            inode=root.stat();resource=C.CommonResources(C.TOKEN,{},root,(inode.st_dev,inode.st_ino),functional_stage='end500')
            resource.check_pid=Mock();meter=C.functional_contract().load('component_resource_meter')
            components=C.functional_contract().load('memory_components')
            component=components._unknown();component['observationElapsedNanoseconds']=7
            raw={'memory':{'kernelLifetimePeakBytes':expected['kernelLifetimePeakBytes']},'cpuStat':{'usage_usec':9}}
            with patch.object(C,'_kernel_directory',side_effect=lambda _:os.open(root,os.O_RDONLY|os.O_DIRECTORY)), \
                patch.object(C.capacity(),'snapshot',return_value=expected['capacityMeasurement']), \
                patch.object(meter,'_kernel',return_value=raw),patch.object(components,'observe',return_value=component):
                observed=resource.sample();frame=resource.functional_observation([])
                self.assertEqual(observed,expected);self.assertEqual(frame['lastKernel'],raw)
                self.assertEqual(frame['firstKernel'],raw);self.assertEqual(frame['sampleCount'],1)
                self.assertEqual(set(frame),{'schema','resourceContract','memoryProfile','sampleCount','firstKernel','lastKernel',
                    'components','componentPSSMaxima','snapshotAtomic','peakCompositionKnown','fileCacheAdditiveToPSS',
                    'differentTimeMaximaAdditive','applicationWithTestDriverCombined','providerResourceAccepted',
                    'fullLifetimeClosureAccepted','executionAuthority'})
                self.assertEqual(frame['componentPSSMaxima'],dict.fromkeys(components.ROLES,'UNKNOWN'))
                self.assertFalse(frame['providerResourceAccepted']);self.assertFalse(frame['fileCacheAdditiveToPSS'])
                self.assertEqual(resource.profile,F.END_PROFILE);self.assertEqual(resource.container_limit,F.HARD_LIMIT)
                self.assertFalse(resource.capacity_diagnostic);self.assertFalse(resource.end_capacity_diagnostic)
                with patch.object(components,'observe',side_effect=KeyboardInterrupt):
                    with self.assertRaises(KeyboardInterrupt):resource.functional_observation([])
                (root/'memory.events').write_text('max 1\noom 0\noom_kill 0\noom_group_kill 0\n')
                with self.assertRaises(C.ResourceError):resource.sample()
            for kwargs in ({'capacity_diagnostic':True},{'processing_backup_stage':'end500'}):
                with self.assertRaises(C.ResourceError):C.CommonResources(C.TOKEN,{},root,(0,0),functional_stage='end500',**kwargs)

    def test_privileged_parent_stage_is_explicit_bound_and_legacy_units_unchanged(self):
        P=F.load('runner_parent');M=F.load('mock500_parent')
        ctx=P.context('12345678901','a'*40,'123e4567-e89b-42d3-a456-426614174000')
        new={**ctx,'functionalStage':'mock500'}
        self.assertIn(('MemoryMax='+str(F.HARD_LIMIT)+'\n').encode(),P.unit_bytes(new))
        self.assertEqual(M.unit_bytes(new),P.unit_bytes(new))
        self.assertIn(b'MemoryMax=2560000000\n',P.unit_bytes(ctx));self.assertIn(b'MemoryMax=2048000000\n',M.unit_bytes())
        self.assertEqual(P.internal_argv('prepare',new)[-2:],['--functional-stage','mock500'])
        with patch.object(M.P,'prepare_parent') as prepared:M.prepare_parent(new)
        prepared.assert_called_once_with(new)
        with patch.object(M.P,'command') as command:M.privileged('prepare',new)
        self.assertEqual(command.call_args.args[0][-2:],['--functional-stage','mock500'])
        for invalid in ({**new,'capacityDiagnostic':True},{**new,'processingBackupStage':'mock500'},
                        {**ctx,'functionalStage':'UNKNOWN'}):
            with self.assertRaises(Exception):P.unit_bytes(invalid)

    def test_functional_disk_plan_keeps_every_copy_and_rejects_old_or_tampered_binding(self):
        R=F.load('mock500_resources')
        with tempfile.TemporaryDirectory(prefix='functional-fictional-disk-') as tmp:
            with patch.object(R.D.os,'statvfs',return_value=SimpleNamespace(f_frsize=4096,f_blocks=16*1024**2,f_bavail=8*1024**2)):
                old=R.admit_disk_plan(tmp,checkout_bytes=123456,binary_bytes=143299024,additional_asset_bytes=123456789)
                new=R.admit_disk_plan(tmp,checkout_bytes=123456,binary_bytes=143299024,additional_asset_bytes=123456789,functional_stage='mock500')
                self.assertEqual(new['budgets'],old['budgets']);self.assertEqual(new['requiredAdditionalBytes'],old['requiredAdditionalBytes'])
                self.assertEqual(new['memoryProfile'],F.MOCK_PROFILE);self.assertEqual(new['commonMemoryLimitBytes'],F.HARD_LIMIT)
                resource=SimpleNamespace(profile=F.MOCK_PROFILE,functional_stage='mock500',sample=Mock(side_effect=sample))
                guard=R.DiskGuard(tmp,new,resource,started_monotonic=time.monotonic())
                self.assertEqual(guard()['memoryProfile'],F.MOCK_PROFILE)
                with self.assertRaises(Exception):R.DiskGuard(tmp,old,resource,started_monotonic=time.monotonic())
                with self.assertRaises(Exception):R.DiskGuard(tmp,{**new,'requiredMemoryReserveBytes':1},resource,started_monotonic=time.monotonic())


if __name__=='__main__':unittest.main()
