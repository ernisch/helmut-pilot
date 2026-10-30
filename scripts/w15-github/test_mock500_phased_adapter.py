"""Small fictional phase seams; no originals, keys, database or network."""
import sys
sys.dont_write_bytecode = True

import ast
import copy
import datetime
import importlib.util
import json
import os
from pathlib import Path
import queue
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('mock_phased_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


F, BF, P = load('test_mock500_start'), load('test_mock500_backup'), load('phase_contract')


class PhasedMockAdapters(unittest.TestCase):
    def admission_fixture(self):
        fixture = F.StartChecks('runTest')
        fixture.setUp(); self.addCleanup(fixture.doCleanups)
        fixture.request['mode'] = F.S.PHASED
        fixture.observed['mode'] = F.S.PHASED
        fixture.approval.update(mode=F.S.PHASED, scope='ISOLATED_GITHUB_MOCK500_PHASED_ONLY')
        fixture.end.update(schema='helmut-w15-independent-end500-acceptance/2',
            scope='ISOLATED_GITHUB_END500_PHASED_ONLY', status='PASS_INDEPENDENT_GITHUB_END500_PHASED_ACCEPTANCE',
            resourceContract=P.END_PROFILE, commonLifetimeMemoryAccepted=False,
            processingMemoryAccepted=True, backupSafetyAccepted=True, independentRestoreFunctionAccepted=True)
        fixture.bridge['mockMemoryContract'] = P.MOCK_PROFILE
        self.rebind(fixture)
        return fixture

    def rebind(self, fixture):
        fixture.end_envelope = F.envelope(fixture.end)
        fixture.bridge['end500AcceptanceSHA256'] = fixture.end_envelope['sha256']
        fixture.bridge_envelope = F.envelope(fixture.bridge)
        fixture.approval.update(end500AcceptanceSHA256=fixture.end_envelope['sha256'],
                               compatibilitySHA256=fixture.bridge_envelope['sha256'])

    def test_new_gate_accepts_only_positive_phased_end500_and_preserves_false_lifetime(self):
        fixture = self.admission_fixture()
        self.assertEqual(fixture.admit()['memoryProfile'], P.MOCK_PROFILE)
        self.assertFalse(fixture.end['commonLifetimeMemoryAccepted'])
        for key in ('processingMemoryAccepted', 'backupSafetyAccepted', 'completeBackupAccepted',
                    'independentRestoreFunctionAccepted'):
            fixture.end[key] = False; self.rebind(fixture)
            with self.subTest(key=key), self.assertRaises(F.S.StartRejected):
                fixture.admit()
            fixture.end[key] = True
        fixture.end['commonLifetimeMemoryAccepted'] = True; self.rebind(fixture)
        with self.assertRaises(F.S.StartRejected):
            fixture.admit()

    def test_capacity_or_69_unit_report_never_qualifies_as_positive_end500(self):
        fixture = self.admission_fixture()
        for status in ('COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY', 'FAIL_OR_UNKNOWN'):
            fixture.end['status'] = status; self.rebind(fixture)
            with self.subTest(status=status), self.assertRaises(F.S.StartRejected):
                fixture.admit()
        self.assertEqual(F.S.R.HISTORICAL_FAILURE['completedUnits'], 69)
        for peak in (1640103936, 1644748800):
            sample = F.sample(); sample['kernelLifetimePeakBytes'] = peak
            with self.assertRaises(P.PhaseRejected):
                P.assess(sample, 'mock500', 'processing')

    def test_old_scope_or_bridge_profile_cannot_open_phased_gate(self):
        fixture = self.admission_fixture()
        fixture.approval['scope'] = 'ISOLATED_GITHUB_MOCK500_ONLY'
        with self.assertRaises(F.S.StartRejected):
            fixture.admit()
        fixture.approval['scope'] = 'ISOLATED_GITHUB_MOCK500_PHASED_ONLY'
        fixture.bridge['mockMemoryContract'] = F.S.R.PROFILE; self.rebind(fixture)
        with self.assertRaises(F.S.StartRejected):
            fixture.admit()

    def test_start_guard_rejects_return_to_processing_after_backup(self):
        fixture = self.admission_fixture()
        fixture.resources.profile = P.MOCK_PROFILE
        fixture.resources.processing_backup_stage = 'mock500'
        fixture.resources.memory_phase = 'processing'
        with patch.object(F.S.R.phases(), 'assess', side_effect=lambda value, *a, **k: value):
            guard = fixture.guard()
            fixture.resources.memory_phase = 'backup'
            with self.assertRaisesRegex(F.S.StartRejected, 'RETURN_TO_PROCESSING'):
                guard.before_dispatch(kind='unit', now=F.NOW)

    def backup_fixture(self):
        fixture = BF.MockBackupChecks('runTest')
        fixture.setUp(); self.addCleanup(fixture.doCleanups)
        fixture.resources.processing_backup_stage = 'mock500'
        fixture.resources.memory_phase = 'processing'
        fixture.resources.profile = P.MOCK_PROFILE
        fixture.body.update(profiles=500, units=500, localProviderPhases=1000, positions=1500, controls=8000)
        manifest = {'exactCommit': fixture.context['exactCommit'], 'runId': fixture.context['runId'],
                    'backupRoot': str(fixture.backup)}
        inputs = SimpleNamespace(backup_context=lambda: fixture.context,
            controller_context=lambda: {'hostPaths': {'prepare': str(fixture.prepared)}})
        return fixture, manifest, inputs

    def test_transition_occurs_after_export_and_real_close_before_any_collection(self):
        fixture, manifest, inputs = self.backup_fixture(); events = []
        def begin(proof):
            P.validate_boundary(proof, 'mock500', {k: fixture.context[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')})
            self.assertEqual(events, ['export', 'close'])
            events.append('root-ack'); fixture.resources.memory_phase = 'backup'
        fixture.resources.begin_backup = Mock(side_effect=begin)
        close = Mock(side_effect=lambda: events.append('close') or
                     {'ownedContainerStopped': True, 'watchClosed': True, 'primaryContainerId': 'd' * 64})
        hook = BF.B.completion_hook(manifest, {}, fixture.guard)
        with patch.object(BF.B, 'export_database', side_effect=lambda *a, **k: events.append('export')), \
             patch.object(BF.B, 'collect', side_effect=RuntimeError('FICTIONAL STOP AT COLLECTION')) as collect:
            with self.assertRaisesRegex(RuntimeError, 'FICTIONAL STOP AT COLLECTION'):
                hook(controller=fixture.controller, inputs=inputs, resources=fixture.resources,
                     supervisor=fixture.w, result=fixture.body, close_owned=close)
        self.assertEqual(events, ['export', 'close', 'root-ack'])
        fixture.resources.begin_backup.assert_called_once(); collect.assert_called_once()
        with self.assertRaises(BF.B.BackupRejected):
            hook(controller=fixture.controller, inputs=inputs, resources=fixture.resources,
                 supervisor=fixture.w, result=fixture.body, close_owned=close)

    def test_failed_export_stop_or_root_ack_never_reaches_collection(self):
        for failure in ('export', 'stop', 'ack'):
            with self.subTest(failure=failure):
                fixture, manifest, inputs = self.backup_fixture()
                fixture.resources.begin_backup = Mock(side_effect=RuntimeError('FICTIONAL ACK FAIL') if failure == 'ack' else None)
                hook = BF.B.completion_hook(manifest, {}, fixture.guard)
                close = Mock(return_value={'ownedContainerStopped': failure != 'stop', 'watchClosed': True,
                                           'primaryContainerId': 'd' * 64})
                with patch.object(BF.B, 'export_database', side_effect=RuntimeError('FICTIONAL EXPORT FAIL') if failure == 'export' else None), \
                     patch.object(BF.B, 'collect') as collect:
                    with self.assertRaises((RuntimeError, BF.B.BackupRejected)):
                        hook(controller=fixture.controller, inputs=inputs, resources=fixture.resources,
                             supervisor=fixture.w, result=fixture.body, close_owned=close)
                close.assert_called_once(); collect.assert_not_called()

    def test_backup_recovery_sample_uses_explicit_phase_and_rejects_processing_peak(self):
        cap = P.capacity(); sample = F.sample()
        sample.update(configuredLimit=str(P.HARD_LIMIT), kernelLifetimePeakBytes=3100000000, currentBytes=3000000000)
        sample['capacityMeasurement'] = {'schema': cap.SCHEMA, 'diagnosticOnly': True,
            'legacyPeakLimitBytes': cap.LEGACY_PEAK, 'legacyPeakExceeded': True, 'legacyContractAccepted': False,
            'sampleCount': 1, 'maximumObservedCurrentBytes': 3000000000,
            'categoryMaxima': dict.fromkeys(cap.CATEGORIES, 'UNKNOWN'), 'phaseObservations': [],
            'last': {'hostAvailableBytes': 3 * 1024**3, 'memoryStat': dict.fromkeys(cap.CATEGORIES, 'UNKNOWN'),
                     'memoryPressure': 'UNKNOWN', 'observedMonotonicNS': 1, 'peakCompositionKnown': False}}
        resource = SimpleNamespace(processing_backup_stage='mock500', memory_phase='backup',
                                   profile=P.MOCK_PROFILE, sample=lambda: copy.deepcopy(sample))
        self.assertEqual(BF.B._resource_sample(resource)['kernelLifetimePeakBytes'], 3100000000)
        resource.memory_phase = 'processing'
        with self.assertRaises(ValueError):
            BF.B._resource_sample(resource)

    def test_phased_mock_resource_delegates_real_common_constructor_and_irreversible_ack(self):
        R = load('mock500_resources'); cap = R.C.capacity()
        with tempfile.TemporaryDirectory(prefix='mock-phase-fictional-kernel-') as folder:
            path = Path(folder); identity = path.stat(); context = {
                'exactCommit': 'a' * 40, 'runId': '12345678', 'runAttempt': 1,
                'nonce': '11111111-2222-4333-8444-555555555555'}
            raw = {'memory.max': '2048000000', 'memory.peak': '1500000000', 'memory.current': '1400000000',
                   'memory.swap.max': '0', 'memory.swap.current': '0',
                   'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}
            for name, value in raw.items():
                (path / name).write_text(value)
            resource = R.MockCommonResources(R.TOKEN, context, path, (identity.st_dev, identity.st_ino),
                                             processing_backup_stage='mock500')
            self.assertEqual(resource.profile, P.MOCK_PROFILE)
            capture = {'hostAvailableBytes': 3 * 1024**3, 'memoryStat': dict.fromkeys(cap.CATEGORIES, 'UNKNOWN'),
                       'memoryPressure': 'UNKNOWN', 'observedMonotonicNS': 1, 'peakCompositionKnown': False}
            proof = P.boundary('mock500', context, 'd' * 64, result_counts=P.expected_counts('mock500'))
            host = cap.host_admission(meminfo='MemTotal: 16000000 kB\nMemAvailable: 15000000 kB\n',
                ancestor={'maximum': 'max', 'current': None},
                psi='some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n')
            def transition(boundary):
                before = resource.sample()
                backup = copy.deepcopy(before); backup.update(configuredLimit=str(P.HARD_LIMIT),
                    kernelLifetimePeakBytes=3100000000, currentBytes=3000000000)
                backup['capacityMeasurement'] = cap.snapshot(backup, None)
                for name, value in [('memory.max', P.HARD_LIMIT), ('memory.peak', 3100000000), ('memory.current', 3000000000)]:
                    (path / name).write_text(str(value))
                return P.ack(boundary, before, backup, host, {'device': identity.st_dev, 'inode': identity.st_ino})
            resource.backup_transition = Mock(side_effect=transition)
            with patch.object(R.C, '_kernel_directory', side_effect=lambda _: os.open(path, os.O_RDONLY | os.O_DIRECTORY)), \
                 patch.object(resource, 'check_pid'), patch.object(cap, 'capture', return_value=capture):
                resource.sample(); resource.begin_backup(proof)
                self.assertEqual(resource.memory_phase, 'backup')
                self.assertEqual(resource.container_limit, P.HARD_LIMIT)
                closure = resource.phase_closure()
                self.assertEqual(closure['overallKernelLifetimePeakBytes'], 3100000000)
                self.assertFalse(closure['commonLifetimeMemoryAccepted'])
                with self.assertRaises(Exception):
                    resource.begin_backup(proof)
                resource.backup_transition.assert_called_once()

    def test_existing_recovery_supervisor_and_progress_use_acknowledged_backup_budget(self):
        source = HERE.parent / 'synthetik-500-w15-full500-controller.py'
        tree = ast.parse(source.read_text())
        original = next(row for row in tree.body if isinstance(row, ast.ClassDef) and row.name == 'Supervisor')
        original.body = [row for row in original.body if isinstance(row, ast.FunctionDef) and row.name in ('sample', 'publish')]
        code = ast.fix_missing_locations(ast.Module(body=[original], type_ignores=[]))
        namespace = {'datetime': datetime, 'time': time, 'json': json,
                     'LIMIT': 2048000000, 'MAXIMUM': 1638400000, 'RESERVE': 409600000,
                     'MEMORY': {'minimumReservePercent': 20}}
        exec(compile(code, str(source), 'exec'), namespace)
        watch = namespace['Supervisor']()
        observed = F.sample(); observed.update(configuredLimit=str(P.HARD_LIMIT),
            kernelLifetimePeakBytes=3100000000, currentBytes=3000000000)
        watch.common_resources = SimpleNamespace(processing_backup_stage='mock500', memory_phase='backup',
            container_limit=P.HARD_LIMIT, sample=lambda: copy.deepcopy(observed))
        watch.start_guard = watch.disk_guard = None
        watch.maximum = 0; watch.progress_lock = threading.RLock(); watch.progress_queue = queue.Queue()
        watch.accepted_indexes = set(); watch.last_accepted_index = watch.last_ack_monotonic = None
        watch.started_monotonic = time.monotonic(); watch.stage_name = 'backup-recovery'
        watch.unit_max_ms = watch.auth_max_ms = watch.cas_max_ms = None
        watch.sample(); watch.publish('supervisor-heartbeat')
        record = watch.progress_queue.get_nowait()
        self.assertEqual(watch.maximum, 3100000000)
        self.assertEqual(record['memory']['comparisonBudgetBytes'], P.HARD_LIMIT)
        self.assertEqual(record['memory']['reserveBytes'], P.HARD_LIMIT - 3100000000)
        self.assertEqual(record['memory']['requiredReserveBytes'], 0)
        self.assertIn('sampleAtUTC', watch.last)

    def test_common_processing_failure_cannot_be_healed_by_backup_transition(self):
        R = load('mock500_resources')
        with tempfile.TemporaryDirectory(prefix='mock-phase-rejected-kernel-') as folder:
            path = Path(folder); inode = path.stat(); context = {
                'exactCommit': 'a' * 40, 'runId': '12345678', 'runAttempt': 1,
                'nonce': '11111111-2222-4333-8444-555555555555'}
            for name, value in {'memory.max': '2048000000', 'memory.peak': '1640103936',
                    'memory.current': '1400000000', 'memory.swap.max': '0', 'memory.swap.current': '0',
                    'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}.items():
                (path / name).write_text(value)
            resource = R.MockCommonResources(R.TOKEN, context, path, (inode.st_dev, inode.st_ino),
                                             processing_backup_stage='mock500')
            resource.backup_transition = Mock(side_effect=RuntimeError('MUST NOT REQUEST ROOT ACK AFTER PROCESSING FAIL'))
            proof = P.boundary('mock500', context, 'd' * 64, result_counts=P.expected_counts('mock500'))
            with patch.object(R.C, '_kernel_directory', side_effect=lambda _: os.open(path, os.O_RDONLY | os.O_DIRECTORY)), \
                 patch.object(resource, 'check_pid'):
                with self.assertRaises(Exception):
                    resource.sample()
                with self.assertRaises(Exception):
                    resource.begin_backup(proof)
            resource.backup_transition.assert_not_called()


if __name__ == '__main__':
    unittest.main()
