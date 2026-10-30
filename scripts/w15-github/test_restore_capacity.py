"""Small fictional counter/admission/IPC counterexamples; no original execution."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location('capacity_test_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


R = load('runner_start')
C, P = R.P.R, R.P
D = C.capacity()
F = load('test_restore_workflow')
S = load('test_full_restore_dispatch')
PSI = 'some avg10=0.01 avg60=0.00 avg300=0.00 total=12\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=4\n'


def sample(peak=3100000000):
    return {'configuredLimit': '4999999488', 'swapMaximum': '0',
            'kernelLifetimePeakBytes': peak, 'currentBytes': 3000000000,
            'swapCurrentBytes': 0, 'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}


def observation():
    return {'hostAvailableBytes': 8 * 1024**3, 'memoryStat': dict.fromkeys(D.CATEGORIES, 1000),
            'memoryPressure': D.pressure(PSI), 'observedMonotonicNS': 1000000, 'peakCompositionKnown': False}


def measurement(value=None):
    with patch.object(D, 'capture', return_value=observation()):
        return D.snapshot(value or sample(), 999)


class CapacityChecks(unittest.TestCase):
    def test_above_old_peak_is_measurement_only_but_hard_swap_and_oom_still_stop(self):
        self.assertEqual(D.assess(sample())['kernelLifetimePeakBytes'], 3100000000)
        for bad in ({**sample(), 'kernelLifetimePeakBytes': D.HARD_LIMIT + 1},
                    {**sample(), 'swapCurrentBytes': 1},
                    {**sample(), 'configuredLimit': '2560000000'},
                    {**sample(), 'events': {**sample()['events'], 'max': 1}}):
            with self.assertRaises(ValueError): D.assess(bad)
        with self.assertRaises(C.ResourceError): C.assess(sample())
        self.assertEqual((C.LIMIT, C.MAXIMUM, C.RESERVE), (2560000000, 2048000000, 512000000))

    def test_actual_host_and_finite_root_headroom_required_without_vendor_capacity_assumptions(self):
        info = 'MemTotal:       16000000 kB\nMemAvailable:   12000000 kB\n'
        unlimited = {'maximum': 'max', 'current': None}
        result = D.host_admission(meminfo=info, ancestor=unlimited, psi=PSI)
        self.assertEqual(result['hostTotalBytes'], 16000000 * 1024)
        self.assertEqual(result['kernelPageBytes'], 4096)
        self.assertEqual(D.HARD_LIMIT % result['kernelPageBytes'], 0)
        self.assertLessEqual(D.HARD_LIMIT, 5000000000)
        with patch.object(D.os, 'sysconf', return_value=65536):
            with self.assertRaises(ValueError): D.host_admission(meminfo=info, ancestor=unlimited, psi=PSI)
        self.assertGreaterEqual(result['availableBeyondDiagnosticHardLimitBytes'], D.HOST_RESERVE)
        for kwargs in ({'meminfo': 'MemTotal: 16000000 kB\n'},
                       {'meminfo': 'MemTotal: 7000000 kB\nMemAvailable: 6000000 kB\n'},
                       {'ancestor': {'maximum': '8000000000', 'current': '2000000000'}},
                       {'psi': 'some FICTIONAL_PRIVATE'}):
            with self.assertRaises(ValueError):
                D.host_admission(**({'meminfo': info, 'ancestor': unlimited, 'psi': PSI} | kwargs))
        def read(path):
            return {'/proc/meminfo': info, '/sys/fs/cgroup/memory.max': '9000000000',
                    '/sys/fs/cgroup/memory.current': '7000000000'}[str(path)]
        with patch.object(D, 'read', side_effect=read): self.assertEqual(D.host_available(), 2000000000)
        bad = sample(); bad['capacityMeasurement'] = measurement()
        bad['capacityMeasurement']['last']['hostAvailableBytes'] = D.HOST_RESERVE - 1
        with self.assertRaises(ValueError): D.assess(bad)

    def test_real_file_readers_keep_kernel_peak_cache_pressure_and_do_not_reset(self):
        ctx = P.context('123456789', 'a' * 40, '26d5a413-5ca7-415c-a412-62fc45b561c8')
        ctx['capacityDiagnostic'] = True
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            values = {'memory.max': '4999999488', 'memory.swap.max': '0', 'memory.peak': '3100000000',
                'memory.current': '3000000000', 'memory.swap.current': '0',
                'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n', 'cgroup.events': 'populated 0\n',
                'memory.stat': 'anon 1000\nfile 2900000000\nkernel 2000\nfile_dirty 1000\n', 'memory.pressure': PSI}
            for key, value in values.items(): (root / key).write_text(value)
            identity = (root.stat().st_dev, root.stat().st_ino)
            with patch.object(C, '_kernel_directory', side_effect=lambda _: os.open(root, os.O_RDONLY | os.O_DIRECTORY)), \
                 patch.object(D, 'host_available', return_value=8 * 1024**3):
                value = P.read_parent(ctx, identity, empty=True)
                self.assertEqual(value['capacityMeasurement']['last']['memoryStat']['file'], 2900000000)
                self.assertEqual(value['capacityMeasurement']['last']['memoryStat']['shmem'], 'UNKNOWN')
                self.assertEqual(value['capacityMeasurement']['last']['memoryPressure']['some']['total'], 12)
                resources = C.CommonResources(C.TOKEN, ctx, root, identity, capacity_diagnostic=True)
                with patch.object(resources, 'check_pid'): self.assertEqual(resources.sample()['kernelLifetimePeakBytes'], 3100000000)
                last = {}; value = R._parent_readback(P, ctx, identity, last)
                self.assertTrue(last['memory']['capacityMeasurement']['legacyPeakExceeded'])
                self.assertFalse(last['memory']['capacityMeasurement']['legacyContractAccepted'])
            self.assertEqual((root / 'memory.peak').read_text(), '3100000000')
            self.assertEqual((root / 'memory.stat').read_text(), values['memory.stat'])
        self.assertIn(b'MemoryMax=4999999488', P.unit_bytes(ctx))
        self.assertIn('--capacity-diagnostic', P.internal_argv('remove', ctx))
        self.assertIn(b'MemoryMax=2560000000', P.unit_bytes())

    def test_signals_and_first_failure_survive_optional_diagnostics(self):
        with patch.object(D, 'os') as mocked:
            mocked.open.side_effect = KeyboardInterrupt
            with self.assertRaises(KeyboardInterrupt): D.capture(999)
        core = C.project_failure_memory(sample(), False); core['capacityMeasurement'] = measurement()
        original = P.ProbeError(memory=core)
        ctx = {'capacityDiagnostic': True}
        with patch.object(P, 'read_parent', side_effect=original), patch.object(D, 'merge', side_effect=ValueError):
            with self.assertRaises(R.RunnerStartError) as stopped:
                R._parent_readback(P, ctx, (1, 2), {})
        self.assertEqual(stopped.exception.runner['reason'], 'PARENT_READBACK_REJECTED')
        self.assertEqual(stopped.exception.runner['memory']['kernelLifetimePeakBytes'], 3100000000)

    def test_summary_is_bounded_numeric_and_does_not_claim_peak_composition(self):
        first = measurement()
        phase = {'name': 'backup-seal', 'sequence': 40, 'meaning': 'ENTERED_NOT_COMPLETED'}
        second = measurement(sample(3500000000)); second['categoryMaxima']['file'] = 2500000000
        merged = D.merge(first, second, sample(3500000000), phase)
        self.assertEqual(merged['categoryMaxima']['file'], 2500000000)
        self.assertEqual(merged['phaseObservations'][0]['name'], 'backup-seal')
        self.assertFalse(merged['last']['peakCompositionKnown'])
        self.assertIsNotNone(C.closed_failure_memory({**C.project_failure_memory(sample(), False), 'capacityMeasurement': merged}))
        for mutate in (lambda d: d.update(private='FICTIONAL_PRIVATE'),
                       lambda d: d['last'].update(private='FICTIONAL_PRIVATE'),
                       lambda d: d.update(phaseObservations=d['phaseObservations'] * 129)):
            bad = copy.deepcopy(merged); mutate(bad); self.assertIsNone(D.closed(bad))

    def test_separate_admission_go_and_result_cannot_be_legacy_acceptance(self):
        value = F.request(D.MODE)
        value['limits'] = copy.deepcopy(D.LIMITS); value['approval']['limits'] = copy.deepcopy(D.LIMITS)
        with patch.dict(os.environ, F.environment(value), clear=True):
            F.W.validate_admission(value, F.payload(value))
            R.validate_request(value, F.payload(value))
            wrong = copy.deepcopy(value); wrong['approval']['scope'] = F.W.SCOPES['end500-restore-gated']
            with self.assertRaises(F.W.WorkflowRejected): F.W.validate_admission(wrong, F.payload(wrong))
            wrong = copy.deepcopy(value); wrong['mode'] = 'end500-restore-gated'
            with self.assertRaises(R.RunnerStartError): R.validate_request(wrong, F.payload(wrong))
        result = F.W._result(value)
        self.assertEqual(result['status'], 'MEASURED_FULL_RESTORE_CAPACITY_ONLY_LEGACY_ACCEPTANCE_BLOCKED')
        self.assertFalse(result['legacyRestoreAccepted']); self.assertFalse(result['end500Acceptance'])
        self.assertFalse(result['mock500Acceptance']); self.assertTrue(result['backupRoundtripVerified'])
        R._worker_result(result, value)
        result['legacyRestoreAccepted'] = True
        with self.assertRaises(F.W.WorkflowRejected): F.W.validate_public_result(result)

    def test_existing_source_qualification_observation_accepts_only_bound_capacity_mode(self):
        qualified = load('test_runtime_qualification')
        fixture = qualified.QualificationChecks()
        fixture.setUp()
        try:
            fixture.observed['mode'] = D.MODE
            review = fixture.call()
            self.assertEqual(review['observedContext']['mode'], D.MODE)
            self.assertFalse(review['executionAuthority'])
            fixture.observed['mode'] = 'UNBOUND_FICTIONAL_MODE'
            with self.assertRaises(qualified.R.RuntimeInputError):
                fixture.call()
        finally:
            fixture.doCleanups()

    def test_genuine_fictional_restore_closure_uses_explicit_diagnostic_profile(self):
        backup = load('test_restore_backup')
        fixture = backup.BackupChecks(); fixture.setUp()
        try:
            restored = fixture.restore_fixture()
            path = restored.state / 'restore/RESTORE_CLOSURE.PRIVATE.json'
            value = json.loads(path.read_text())
            value.update(initialKernelSample=sample(), finalKernelSample=sample())
            path.write_text(json.dumps(value))
            fd = backup.R.S._directory(str(restored.work), private=True)
            try:
                self.assertEqual(backup.R._restore_closure(fd, capacity_diagnostic=True)['profiles'], 500)
                with self.assertRaises(backup.R.Q.C.ResourceError): backup.R._restore_closure(fd)
            finally:
                os.close(fd)
        finally:
            fixture.doCleanups()

    def test_existing_restore_watch_uses_validated_capacity_samples_without_old_peak_abort(self):
        fixture = load('test_end500_memory').End500MemoryChecks()
        fixture.setUp()
        try:
            watch = fixture.scope['Watch'].__new__(fixture.scope['Watch'])
            watch.cgroup = fixture.cgroup; watch.stage_name = None; watch.maximum = 0
            watch.common_resources = SimpleNamespace(capacity_diagnostic=True, sample=lambda: sample())
            watch.start_guard = None; watch.disk_guard = None; watch.mock_backup_closure = False
            watch.last_component = float('inf'); watch.memory_failure = None; watch.disk_check = lambda: None
            watch.sample()
            self.assertEqual(watch.maximum, 3100000000)
            self.assertFalse(watch.last['legacyContractAccepted'])
            self.assertIsNone(watch.memory_failure)
        finally:
            fixture.doCleanups()

    def test_progress_message_reports_diagnostic_parent_headroom_not_old_negative_reserve(self):
        import ast, datetime, queue, threading, time
        source = Path(__file__).parents[1] / 'synthetik-500-w15-memory-forward.py'
        tree = ast.parse(source.read_text())
        watch = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Watch')
        publish = next(n for n in watch.body if isinstance(n, ast.FunctionDef) and n.name == 'publish')
        scope = {'M': SimpleNamespace(LIMIT=2560000000), 'datetime': datetime, 'time': time}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[publish], type_ignores=[])), 'selected-capacity-publish', 'exec'), scope)
        current = SimpleNamespace(progress_lock=threading.RLock(), last=sample(),
            common_resources=SimpleNamespace(capacity_diagnostic=True, container_limit=4999999488),
            cas_records=[], disk=None, failure=None, progress_queue=queue.SimpleQueue())
        scope['publish'](current, 'backup-seal')
        record = current.progress_queue.get_nowait()
        self.assertIn('Parentrest 1900.0 MB', record['message'])
        self.assertNotIn('CAS', record['message'])

    def test_no_worker_final_report_keeps_capacity_measurement_and_last_phase(self):
        import multiprocessing, time
        from unittest.mock import Mock
        helper = load('test_runner_diagnostics')
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        sender.send_bytes(json.dumps({'kind': 'phase', 'sequence': 1, 'phase': 'backup-seal'}).encode())
        core = C.project_failure_memory(sample(), False); core['capacityMeasurement'] = measurement()
        def guard():
            raise R._diagnose(P.ProbeError(memory=core), 'worker', 'PARENT_READBACK_REJECTED')
        with self.assertRaises(R.RunnerStartError) as stopped:
            R._monitor_child(helper.Child(alive=True), receiver, Mock(close=lambda: None),
                             guard, time.monotonic() + 3, observed={})
        self.assertEqual(stopped.exception.runner['lastObservedPhase']['name'], 'backup-seal')
        self.assertEqual(stopped.exception.runner['memory']['capacityMeasurement'], core['capacityMeasurement'])
        self.assertEqual(stopped.exception.cleanup['workerExited'], 'PASS')

    def test_capacity_receipt_is_rejected_by_existing_end500_acceptance_gate(self):
        end = load('end500_dispatch')
        record = {'schema': end.ACCEPTANCE_SCHEMA, 'scope': D.SCOPE,
                  'status': 'MEASURED_FULL_RESTORE_CAPACITY_ONLY_LEGACY_ACCEPTANCE_BLOCKED',
                  'exactCommit': 'a' * 40, 'runId': '123456788', 'receiptSHA256': 'b' * 64}
        import hashlib
        approval = {'restoreAcceptanceReviewSHA256': hashlib.sha256(end.canonical(record)).hexdigest()}
        previous = {k: record[k] for k in ('status', 'runId', 'receiptSHA256')}
        pr = {'state': 'open', 'merged': False, 'head': {'sha': 'a' * 40},
              'body': '```json\n' + end.canonical(record).decode() + '\n```'}
        from unittest.mock import Mock
        api = Mock()
        with self.assertRaises(end.DispatchRejected):
            end.verify_restore_acceptance(pr, 'a' * 40, approval, previous, api=api)
        api.assert_not_called()

    def test_actual_cli_preserves_diagnostic_completion_and_rejects_old_pass_status(self):
        import io
        value = F.request(D.MODE)
        value['limits'] = copy.deepcopy(D.LIMITS); value['approval']['limits'] = copy.deepcopy(D.LIMITS)
        private = F.payload(value)
        result = {'status': 'COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY',
                  'workerResult': F.W._result(value), 'legacyRestoreAccepted': False,
                  'capacityMeasurement': measurement()}
        original_load = F.W._load
        for status, expected in ((result['status'], 0), ('PASS_FRESH_RUNNER_OWNED_LIFETIME_ONLY', 1)):
            returned = copy.deepcopy(result); returned['status'] = status
            launcher = SimpleNamespace(launch=lambda *args: returned)
            output = io.StringIO()
            def selected(name, *args):
                return launcher if name == 'runner_start' else original_load(name, *args)
            body = F.W._encode({'request': value, 'privatePayload': private})
            with patch.dict(os.environ, F.environment(value), clear=True), \
                 patch.object(F.W, 'validate_event'), patch.object(F.W, '_load', side_effect=selected), \
                 patch.object(sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(body))), patch.object(sys, 'stdout', output):
                self.assertEqual(F.W.main(['--launch']), expected)
            reported = json.loads(output.getvalue())
            self.assertEqual(reported['status'], status if expected == 0 else 'FAIL_W15_ISOLATED_WORKFLOW')
            if expected == 0: self.assertFalse(reported['legacyRestoreAccepted'])

    def test_new_sender_profile_requires_new_scope_limits_and_reviews(self):
        with tempfile.TemporaryDirectory() as temporary:
            clock = S.Clock(); approval, request = S.packets(Path(temporary), clock)
            approval['scope'] = D.SCOPE
            request['limits'] = copy.deepcopy(D.LIMITS)
            request['approval'].update(mode=D.MODE, scope=D.SCOPE, limits=copy.deepcopy(D.LIMITS))
            import hashlib
            approval['requestSHA256'] = hashlib.sha256(S.D.canonical(request)).hexdigest()
            S.D.validate_approval(approval, S.TARGET, S.LAUNCHER, request, clock())
            self.assertEqual(S.D.profile(approval), (D.MODE, D.SCOPE, D.LIMITS))
            wrong = copy.deepcopy(approval); wrong['scope'] = S.D.SCOPE
            with self.assertRaises(S.D.DispatchRejected): S.D.validate_approval(wrong, S.TARGET, S.LAUNCHER, request, clock())


if __name__ == '__main__': unittest.main()
