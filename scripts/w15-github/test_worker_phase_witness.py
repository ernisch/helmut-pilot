"""Fictional pipe/checkpoint failures only; no originals, DB or resource writes."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import itertools
import json
import multiprocessing
import os
from pathlib import Path
import signal
import struct
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('phase_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R, O, B = load('runner_start'), load('runtime_owned_backup'), load('restore_backup')
F = load('test_runner_diagnostics')


def frame(sequence=1, phase='backup-collect', **extra):
    return {'kind': 'phase', 'sequence': sequence, 'phase': phase, **extra}


def memory():
    return {'configuredLimitBytes': 2560000000, 'kernelLifetimePeakBytes': 2048000001,
        'currentBytes': 2048000001, 'swapMaximumBytes': 0, 'swapCurrentBytes': 0,
        'lastReadbackValid': False, 'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0),
        'postFailureMemoryStat': {'anon': 1000, 'file': 2000, 'kernel': 3000, 'shmem': 4000,
            'file_dirty': 5000, 'file_writeback': 'UNKNOWN',
            'observedAfterFailure': True, 'peakCompositionKnown': False}}


def killed_worker(sender, receiver):
    receiver.close()
    R._phase_reporter(sender)('backup-seal')
    os.kill(os.getpid(), signal.SIGKILL)


class PhaseWitnessChecks(unittest.TestCase):
    def monitor(self, messages, guard=None, *, partial=False, alive=True, enabled=True):
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        for value in messages:
            sender.send_bytes(json.dumps(value).encode())
        if partial:
            os.write(sender.fileno(), struct.pack('!i', 100) + b'{"kind":')
            sender.close()
            parent_sender = sender
        else:
            # Represents the still-open child-side writer without forking here.
            parent_sender = Mock(close=lambda: None)
        observed = {} if enabled else None
        with self.assertRaises(R.RunnerStartError) as ended:
            R._monitor_child(F.Child(alive=alive), receiver, parent_sender,
                guard or (lambda: None), time.monotonic() + 3, observed=observed)
        return ended.exception

    def test_ram_reject_without_worker_final_keeps_phase_kernel_and_cleanup(self):
        def guard():
            raise R._diagnose(R.P.ProbeError(memory=memory()), 'worker', 'PARENT_READBACK_REJECTED')
        error = self.monitor([frame()], guard)
        self.assertEqual(error.runner['reason'], 'PARENT_READBACK_REJECTED')
        self.assertEqual(error.runner['memorySource'], 'CURRENT_REJECTED_READBACK')
        self.assertEqual(error.runner['memory'], memory())
        self.assertEqual(error.runner['lastObservedPhase'],
            {'name': 'backup-collect', 'sequence': 1, 'meaning': 'ENTERED_NOT_COMPLETED'})
        self.assertIsNone(error.worker_phase)
        self.assertEqual(error.cleanup['workerExited'], 'PASS')
        self.assertEqual(error.cleanup['workerIPCClosed'], 'PASS')
        packet = R._failure_packet(error)
        again = R._response_error(packet)
        self.assertEqual(again.runner, error.runner)

    def test_buffered_inner_failure_wins_with_checkpoint_as_separate_metadata(self):
        error = self.monitor([frame(), {'ok': False, 'phase': 'worker', 'workerPhase': 'backup-export'}],
                             lambda: self.fail('Guard must not replace available inner failure'))
        self.assertEqual(error.worker_phase, 'backup-export')
        self.assertEqual(error.runner['reason'], 'WORKER_REPORTED_FAILURE')
        self.assertEqual(error.runner['lastObservedPhase']['name'], 'backup-collect')

    def test_real_owned_child_killed_without_final_report_and_partial_eof(self):
        context = multiprocessing.get_context('fork')
        receiver, sender = context.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        child = context.Process(target=killed_worker, args=(sender, receiver))
        with self.assertRaises(R.RunnerStartError) as ended:
            R._monitor_child(child, receiver, sender, lambda: None, time.monotonic() + 5, observed={})
        self.assertEqual(ended.exception.runner['lastObservedPhase']['name'], 'backup-seal')
        self.assertFalse(child.is_alive())
        self.assertEqual(child.exitcode, -signal.SIGKILL)
        error = self.monitor([frame()], partial=True, alive=False)
        self.assertEqual(error.runner['reason'], 'WORKER_IPC_EOF')
        self.assertEqual(error.runner['lastObservedPhase']['name'], 'backup-collect')

    def test_unknown_before_first_frame_and_malformed_input_never_leak(self):
        error = self.monitor([], lambda: (_ for _ in ()).throw(RuntimeError('FICTIONAL_PRIVATE')))
        self.assertEqual(error.runner['lastObservedPhase'], 'UNKNOWN')
        for bad in [frame(1), frame(3), frame(2, 'FICTIONAL_PRIVATE'),
                    frame(2, private='FICTIONAL_PRIVATE'), frame(True),
                    frame(2, 'backup-seal', padding='FICTIONAL_PRIVATE' * 40)]:
            with self.subTest(value=bad):
                error = self.monitor([frame(), bad])
                self.assertEqual(error.runner['reason'], 'WORKER_IPC_REJECTED')
                self.assertEqual(error.runner['lastObservedPhase']['sequence'], 1)
                self.assertNotIn('FICTIONAL_PRIVATE', json.dumps(error.safe_failure))

    def test_frame_flood_and_shared_drain_deadline_are_bounded(self):
        raw = b''.join(struct.pack('!i', len(b)) + b for b in (
            json.dumps(frame(n)).encode() for n in range(1, 130)))
        for clock in (lambda: 0, itertools.count(0, .04).__next__):
            data = bytearray(raw)
            def read(fd, count):
                block = bytes(data[:count]); del data[:count]; return block
            receiver = SimpleNamespace(poll=lambda *a: bool(data), fileno=lambda: 123)
            observed = {}
            with patch.object(R.os, 'read', side_effect=read), \
                    patch.object(R.select, 'select', return_value=([123], [], [])), \
                    patch.object(R.time, 'monotonic', side_effect=clock):
                with self.assertRaises(R.RunnerStartError) as ended:
                    R._read_worker_response(receiver, 10, observed=observed)
            self.assertIn(ended.exception.runner['reason'], ('WORKER_IPC_REJECTED', 'WORKER_IPC_TIMEOUT'))
            self.assertLessEqual(observed['sequence'], 128)

    def test_legacy_pipe_and_optional_projection_preserve_core_failures(self):
        error = self.monitor([{'ok': False, 'phase': 'worker', 'workerPhase': 'backup-export'}], enabled=False)
        self.assertNotIn('lastObservedPhase', error.runner)
        for bad in (None, False, [], 'FICTIONAL_PRIVATE', {'name': 'backup-seal', 'sequence': True,
                       'meaning': 'ENTERED_NOT_COMPLETED'}, {'name': 'backup-seal', 'sequence': 1,
                       'meaning': 'ENTERED_NOT_COMPLETED', 'private': 'FICTIONAL_PRIVATE'}):
            core = {'reason': 'PARENT_READBACK_REJECTED', 'memory': memory(),
                    'memorySource': 'CURRENT_REJECTED_READBACK'}
            self.assertEqual(R.D.runner({**core, 'lastObservedPhase': bad}, R._closed_memory), core)
        self.assertEqual(R.WORKER_PHASES, R.D.OBSERVED_PHASES)

    def test_native_primary_actions_and_recovery_context_are_not_confused(self):
        controller = SimpleNamespace(BASE=O.BASE if hasattr(O, 'BASE') else B.B.BASE, DB=B.B.DATABASE,
            CONTAINER='w15-end500-123456-' + 'a' * 32, DOCKER=list(B.DOCKER))
        observed = []
        resources = SimpleNamespace(phase_observer=observed.append)
        for primary in (True, False):
            watch = SimpleNamespace(thread=SimpleNamespace(is_alive=lambda: True),
                finished=SimpleNamespace(is_set=lambda: False), failure=None, stop_failure=None,
                process=None, closure_mode=True, last_stage_exit_code=0, stage=lambda *args: None,
                common_resources=resources)
            if primary:
                watch.phase_observer = observed.append
            else:
                B._observe(resources, 'backup-recovery')
            runner = O.OwnedBackupRunner(watch, controller, base=controller.BASE,
                container=controller.CONTAINER, database=controller.DB, scope='end500-restore')
            watch.backup_runner = runner
            argv = controller.DOCKER + ['exec', '--user', '1000:1000', controller.CONTAINER, 'sh', '-c', 'FICTIONAL']
            runner.run_owned(argv, 'restore-check', 30)
        self.assertEqual(observed, ['connection-restore-check', 'backup-recovery'])

    def test_late_parent_failure_after_worker_success_retains_checkpoint(self):
        fixture = F.DiagnosticChecks()
        self.addCleanup(fixture.doCleanups)
        original = F.R._monitor_child
        def monitor(*args, **kwargs):
            kwargs['observed'].update(name='backup-postcheck', sequence=8, meaning='ENTERED_NOT_COMPLETED')
            return original(*args, **kwargs)
        with patch.object(F.R, '_monitor_child', side_effect=monitor):
            error, _ = fixture.supervise(guard_failure_at=2, child=F.Child(alive=False, exitcode=0),
                packet={'ok': True, 'result': F.T.worker_result()})
        self.assertEqual(error.phase, 'closure')
        self.assertEqual(error.runner['reason'], 'PARENT_READBACK_REJECTED')
        self.assertEqual(error.runner['lastObservedPhase']['name'], 'backup-postcheck')

    def test_cipher_readback_reports_fixed_phase_before_existing_integrity_scan(self):
        fixture_module = load('test_receive_existing_inputs')
        fixture = fixture_module.ExistingReceiveChecks()
        self.addCleanup(fixture.doCleanups)
        data, pins = fixture.fake_parts()
        original = fixture_module.E.download
        observed = []
        def download(*args, **kwargs):
            return original(*args, **kwargs, phase_observer=observed.append)
        with tempfile.TemporaryDirectory(prefix='w15-fictional-phase-download-') as folder, \
                patch.object(fixture_module.E, 'download', side_effect=download):
            fixture.download(Path(folder), data, pins)
        self.assertEqual(observed, ['receiver-cipher-readback'])


if __name__ == '__main__':
    unittest.main()
