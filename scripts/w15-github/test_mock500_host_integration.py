"""Small real-module seams with fictional kernel files and private metadata.

No originals, database, Docker, GPG, systemd, network or full Mock500 run.
These tests qualify connections, never the actual 500-profile function.
"""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('mock_host_seam_' + name, HERE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


F = load('test_mock500_host_contract')
H, D = F.H, F.D
TELEMETRY = load('test_host_capacity_telemetry')
R, P, Q, W, B, HF = (load(name) for name in (
    'mock500_runner','mock500_parent','mock500_resources','mock500_workflow',
    'mock500_backup','test_host_functional_mock'))


def sample():
    value = D.sample(D.admission()); value['hostCapacitySafetyObserved'] = True
    # Privileged read_parent includes this closed measurement on the host path.
    value['capacityMeasurement'] = TELEMETRY.sample()['capacityMeasurement']
    return value


def manifest():
    return dict(F.request(), hostCapacityAdmission=D.admission())


def disk_resource():
    return SimpleNamespace(profile=H.PROFILE, host_functional_stage='mock500',
        functional_stage=None, processing_backup_stage=None, host_capacity_admission=D.admission(),
        host_capacity_budget=D.CAP.host_budget(D.admission()), container_limit=D.admission()['diagnosticHardLimitBytes'],
        sample=Mock(side_effect=sample))


class MockHostIntegrationChecks(unittest.TestCase):
    def test_context_has_explicit_host_flags_without_relabelling_old_functional_mode(self):
        q=F.request();ctx=R.S._ctx(q)
        self.assertTrue(ctx['capacityDiagnostic']);self.assertTrue(ctx['hostCapacityDiagnostic'])
        self.assertTrue(ctx['mockHostFunctional']);self.assertNotIn('functionalStage',ctx)
        self.assertNotIn('hostCapacityAdmission',ctx)
        old=dict(q,mode=R.FUNCTIONAL,limits=R.functional().limits('mock500'))
        self.assertEqual(R.S._ctx(old)['functionalStage'],'mock500')
        self.assertNotIn('hostCapacityDiagnostic',R.S._ctx(old))
        R.validate_request(q,D.F.payload(q))
        with self.assertRaises(Exception):R.validate_request(dict(q,limits=old['limits']),D.F.payload(q))

    def test_parent_unit_uses_exact_admitted_budget_and_preserves_old_five_gb_mode(self):
        ctx=R.S._ctx(F.request());ctx['hostCapacityAdmission']=D.admission()
        actual=P.unit_bytes(ctx).decode('ascii').splitlines()
        settings=dict(row.split('=',1) for row in actual if '=' in row)
        self.assertEqual(int(settings['MemoryMax']),D.admission()['diagnosticHardLimitBytes'])
        self.assertGreater(int(settings['MemoryMax']),4999999488)
        self.assertEqual(settings['MemorySwapMax'],'0')
        old=R.S._ctx(dict(F.request(),mode=R.FUNCTIONAL))
        self.assertIn(b'MemoryMax=4999999488\n',P.unit_bytes(old))
        bad=copy.deepcopy(ctx);bad['hostCapacityAdmission']['diagnosticHardLimitBytes']+=4096
        with self.assertRaises(Exception):P.unit_bytes(bad)
        with self.assertRaises(Exception):P.unit_bytes({**ctx,'functionalStage':'mock500'})

    def test_mock_observer_reads_actual_fixture_files_and_keeps_hard_host_event_guards(self):
        with tempfile.TemporaryDirectory(prefix='mock-host-fictional-kernel-') as tmp:
            root=Path(tmp);expected=sample()
            contents={'memory.max':expected['configuredLimit'],'memory.swap.max':'0',
                'memory.peak':str(expected['kernelLifetimePeakBytes']),'memory.current':str(expected['currentBytes']),
                'memory.swap.current':'0','memory.events':'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}
            for name,value in contents.items():(root/name).write_text(value)
            inode=root.stat();resource=Q.MockCommonResources(Q.TOKEN,{},root,(inode.st_dev,inode.st_ino),
                host_capacity_admission=D.admission())
            resource.check_pid=Mock();cap=Q.C.capacity()
            meter=Q.C.functional_contract().load('component_resource_meter')
            components=Q.C.functional_contract().load('memory_components')
            with patch.object(Q.C,'_kernel_directory',side_effect=lambda _:os.open(root,os.O_RDONLY|os.O_DIRECTORY)), \
                 patch.object(cap,'snapshot',return_value=None), \
                 patch.object(cap,'host_runtime_guard',return_value=expected['hostCapacityObservation']) as host_guard, \
                 patch.object(meter,'_kernel',return_value={'memory':{'kernelLifetimePeakBytes':expected['kernelLifetimePeakBytes']}}), \
                 patch.object(components,'observe',return_value=components._unknown()):
                observed=resource.sample();frame=resource.functional_observation([])
                self.assertEqual(resource.container_limit,D.admission()['diagnosticHardLimitBytes'])
                self.assertEqual(resource.profile,H.PROFILE);self.assertIsNone(resource.functional_stage)
                self.assertTrue(observed['hostCapacitySafetyObserved']);self.assertGreater(observed['kernelLifetimePeakBytes'],4999999488)
                self.assertEqual(frame['schema'],H.RESOURCE_OBSERVATION_SCHEMA)
                H.validate_resource_observation(frame,resource.host_capacity_budget)
                host_guard.assert_called_with(resource.host_capacity_admission)
                (root/'memory.events').write_text('max 1\noom 0\noom_kill 0\noom_group_kill 0\n')
                with self.assertRaises(Exception):resource.sample()
                (root/'memory.events').write_text(contents['memory.events'])
                with patch.object(cap,'host_runtime_guard',return_value={**expected['hostCapacityObservation'],
                    'status':'FAIL_HOST_RESERVE','hostAvailableBytes':1}):
                    with self.assertRaises(Exception):resource.sample()
                (root/'memory.max').write_text('4999999488')
                with self.assertRaises(Exception):resource.sample()

    def test_complete_disk_plan_and_guard_share_dynamic_budget_without_losing_copy_reserve(self):
        with tempfile.TemporaryDirectory(prefix='mock-host-fictional-disk-') as tmp, \
             patch.object(Q.D.os,'statvfs',return_value=SimpleNamespace(
                 f_frsize=4096,f_blocks=16*1024**2,f_bavail=8*1024**2)):
            args=dict(checkout_bytes=123456,binary_bytes=143299024,additional_asset_bytes=217563454)
            new=Q.admit_disk_plan(tmp,**args,host_capacity_admission=D.admission())
            old=Q.admit_disk_plan(tmp,**args,functional_stage='mock500')
            self.assertEqual(new['budgets'],old['budgets']);self.assertEqual(new['requiredAdditionalBytes'],old['requiredAdditionalBytes'])
            self.assertEqual(new['minimumFreeReserveBytes'],536870912)
            self.assertEqual(new['commonMemoryLimitBytes'],D.admission()['diagnosticHardLimitBytes'])
            resource=disk_resource();guard=Q.DiskGuard(tmp,new,resource,started_monotonic=time.monotonic())
            self.assertEqual(guard()['memoryProfile'],H.PROFILE)
            for change in ({'commonMemoryLimitBytes':4999999488},{'requiredMemoryReserveBytes':1},
                           {'hostCapacityBudget':{**resource.host_capacity_budget,'hardLimitBytes':4999999488}}):
                with self.subTest(change=change),self.assertRaises(Exception):
                    Q.DiskGuard(tmp,{**new,**change},resource,started_monotonic=time.monotonic())
            resource.sample=Mock(return_value={**sample(),'swapCurrentBytes':1})
            with self.assertRaises(Exception):guard()

    def test_worker_validator_uses_staged_contract_not_original_checkout_and_keeps_all_counts(self):
        q=manifest();worker=F.receipt(q)['workerResult']
        with patch.object(R,'host',side_effect=AssertionError('ORIGINAL_CHECKOUT_MUST_NOT_BE_READ')) as original:
            self.assertEqual(R.validate_public_result(worker,q,host_contract=H),worker)
            for field in ('storedResults','securityControls','unitChecksCompleted'):
                bad=copy.deepcopy(worker);bad['functionalResults'][field]-=1
                with self.subTest(field=field),self.assertRaises(Exception):R.validate_public_result(bad,q,host_contract=H)
            for key,value in (('profiles',True),('results',1499),('backupRoundtripVerified',False),('providerResourceAccepted',True)):
                with self.subTest(key=key),self.assertRaises(Exception):
                    R.validate_public_result({**worker,key:value},q,host_contract=H)
            original.assert_not_called()

    def test_new_start_gate_requires_real_prior_end_contract_new_bridge_and_own_go_scope(self):
        owner=HF.HostFunctionalMockChecks('runTest');self.addCleanup(owner.doCleanups)
        helper,case=owner.fixture()
        case.request.update(mode=H.MODE,limits=H.limits());case.observed['mode']=H.MODE
        case.approval.update(mode=H.MODE,scope=H.SCOPE,limits=H.limits(),resourceContract=H.CONTRACT)
        case.bridge.update(functionalContract=H.CONTRACT,mockMemoryContract=H.PROFILE)
        helper.rebind(case)
        self.assertEqual(helper.admit(case)['memoryProfile'],H.PROFILE)
        for change in ({'authorized':False},{'scope':'ISOLATED_GITHUB_MOCK500_FUNCTIONAL_ONLY'},
                       {'resourceContract':'helmut-w15-isolated-functional/1'}):
            saved=copy.deepcopy(case.approval);case.approval.update(change)
            with self.subTest(change=change),self.assertRaises(Exception):helper.admit(case)
            case.approval.clear();case.approval.update(saved)
        case.bridge['mockMemoryContract']='helmut-w15-mock500-functional/1';helper.rebind(case)
        with self.assertRaises(Exception):helper.admit(case)

    def test_parent_identity_is_saved_before_binding_failure_and_reaches_owned_cleanup(self):
        q=F.request();calls=[];cleanup=Mock(return_value=None)
        with tempfile.TemporaryDirectory(prefix='mock-host-fictional-launch-') as tmp:
            root=Path(tmp);listener=Mock();latch=SimpleNamespace(seen=False)
            # Model bind's file side effect; chmod remains the actual operation.
            listener.bind.side_effect=lambda path:Path(path).touch(mode=0o600)
            def caller():calls.append('caller-before-prepare');return {'FICTIONAL':'caller'}
            def prepare(*_):calls.append('prepare');return SimpleNamespace(stdout=b'FICTIONAL')
            def identity(*_):calls.append('identity');return (111,222)
            def bind(*_):calls.append('bind');raise ValueError('FICTIONAL_CALLER_CHANGED')
            with patch.object(R,'github_binding'),patch.object(R.S,'_identity_available',return_value=987), \
                 patch.object(R.S,'_roots',return_value=(root/'owned',root/'ipc')), \
                 patch.object(R.socket,'socket',return_value=listener), \
                 patch.object(R.P.P,'StopLatch',return_value=latch), \
                 patch.object(R.P.P.R.capacity(),'host_caller_provenance',side_effect=caller), \
                 patch.object(R.P,'privileged',side_effect=prepare),patch.object(R.P,'identity',side_effect=identity), \
                 patch.object(R.S,'_bind_host_preparation',side_effect=bind),patch.object(R.S,'_cleanup_launch',cleanup), \
                 patch.object(R.subprocess,'Popen') as process:
                with self.assertRaises(R.MockRunnerError):R.launch(q,D.F.payload(q))
            self.assertEqual(calls,['caller-before-prepare','prepare','identity','bind'])
            self.assertEqual(cleanup.call_args.args[2],(111,222));self.assertIs(cleanup.call_args.args[3],True)
            process.assert_not_called()

    def test_supervisor_loads_root_record_and_passes_exact_same_admission_to_worker(self):
        q=F.request();ctx=R.S._ctx(q);admission=D.admission()
        staged=dict(q,runnerTemp='/FICTIONAL/temp',stagedRepo='/FICTIONAL/repo',checkoutBytes=1,binaryBytes=2,
            sourcePins={'scripts/w15-github/mock500_workflow.py':{'bytes':1,'sha256':'f'*64}})
        child=Mock();fork=Mock();fork.Pipe.return_value=(Mock(),Mock());fork.Process.return_value=child
        started_at=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ');started=time.monotonic()
        read=Mock(side_effect=lambda *_args,**_kw:sample())
        with patch.object(R.os,'getuid',return_value=0),patch.object(R.P.P,'load_host_admission',return_value=admission) as root_read, \
             patch.object(R.P,'identity',return_value=(111,222)), \
             patch.object(R.P.P.R,'membership',return_value='/'+R.P.names(ctx)[0]+'/service'), \
             patch.object(R.P,'read_parent',read),patch.object(R.S,'_identity_available',return_value=987), \
             patch.object(R.S,'_stage',side_effect=lambda *_:copy.deepcopy(staged)), \
             patch.object(R.multiprocessing,'get_context',return_value=fork), \
             patch.object(R.S,'_monitor_child',return_value=({'result':F.receipt(q)['workerResult']},{})) as monitor, \
             patch.object(R.S,'_members',return_value={os.getpid()}):
            result=R.supervise(q,D.F.payload(q),started_at,started)
        self.assertTrue(result['workerExited']);root_read.assert_called_once()
        worker_manifest=fork.Process.call_args.kwargs['args'][0]
        self.assertEqual(worker_manifest['hostCapacityAdmission'],admission)
        self.assertEqual(worker_manifest['startedMonotonic'],started)
        self.assertEqual(monitor.call_args.args[4],started+12600)
        self.assertTrue(all(call.args[0]['hostCapacityAdmission']==admission for call in read.call_args_list))

    def test_existing_backup_assessor_keeps_same_admission_not_fixed_five_gb(self):
        resource=disk_resource();observed=B._resource_sample(resource)
        self.assertEqual(B._resource_profile(resource),H.PROFILE)
        self.assertGreater(observed['kernelLifetimePeakBytes'],4999999488)
        self.assertEqual(observed['hostCapacityBudget'],resource.host_capacity_budget)
        for key in ('max','oom','oom_kill','oom_group_kill'):
            bad=sample();bad['events'][key]=1;resource.sample=Mock(return_value=bad)
            with self.subTest(key=key),self.assertRaises(Exception):B._resource_sample(resource)

    def test_workflow_result_connects_actual_common_guard_to_closed_host_worker_result(self):
        q=manifest();reference=F.receipt(q);resource=disk_resource()
        resource.functional_observation=Mock(return_value=reference['workerResult']['functionalResourceObservation'])
        result=W._result(q,resource,reference['workerResult']['functionalResults'])
        self.assertEqual(result['status'],H.WORKER_STATUS)
        self.assertEqual(result['functionalContract'],H.CONTRACT)
        self.assertEqual(result['functionalResults']['unitChecksCompleted'],17000)
        self.assertFalse(result['legacyRegularMemoryAccepted']);self.assertFalse(result['mock500Acceptance'])
        bad=sample();bad['hostCapacityObservation']['hostAvailableBytes']=1
        resource.sample=Mock(return_value=bad)
        with self.assertRaises(Exception):W._result(q,resource,reference['workerResult']['functionalResults'])


if __name__=='__main__':unittest.main()
