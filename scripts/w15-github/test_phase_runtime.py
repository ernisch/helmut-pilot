"""Small real-IO/IPC counterexamples; ordinary invented files, never cgroup writes."""
import sys
sys.dont_write_bytecode = True
from contextlib import contextmanager, ExitStack
import copy
import importlib.util
import json
import multiprocessing
from multiprocessing.connection import Connection
import os
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
# Development-only selection; CI uses the colocated committed implementation.
SOURCE = Path(os.environ.get('W15_PHASE_TEST_SOURCE_ROOT', str(HERE.parents[1]))) / 'scripts/w15-github'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


S = load(SOURCE / 'runner_start.py', 'phase_runtime_runner')
P, C = S.P, S.P.R
H, CAP = C.phase_contract(), C.capacity()
F = load(HERE / 'test_phase_contract.py', 'phase_runtime_fictional_values')


@contextmanager
def counters(stage='end500', peak=1000000000):
    """Redirect only the sysfs directory adapter to an owned ordinary temp tree."""
    with tempfile.TemporaryDirectory() as temporary, ExitStack() as stack:
        root = Path(temporary)
        ctx = {**F.CTX, 'processingBackupStage': stage, 'processingBackupPhase': 'processing',
               'processingImageId': 'sha256:' + '1' * 64}
        parent = root / P.names(ctx)[0]; parent.mkdir()
        values = {'memory.max': str(H.processing_limits(stage)['comparisonBudgetBytes']),
            'memory.swap.max': '0', 'memory.peak': str(peak), 'memory.current': str(peak),
            'memory.swap.current': '0', 'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n',
            'memory.stat': 'anon 1000\nfile 2000\nkernel 3000\nshmem 0\nfile_dirty 0\nfile_writeback 0\n',
            'memory.pressure': 'some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n',
            'cgroup.events': 'populated 0\n'}
        for name, raw in values.items(): (parent / name).write_text(raw)
        ident = (parent.stat().st_dev, parent.stat().st_ino)
        original_open = os.open
        def directory(path):
            if Path(path) != parent: raise AssertionError('UNEXPECTED_FICTIONAL_PARENT')
            return original_open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.enter_context(patch.object(C, 'KERNEL_ROOT', root))
        stack.enter_context(patch.object(C, '_kernel_directory', side_effect=directory))
        stack.enter_context(patch.object(CAP, 'host_available', return_value=8 * 1024**3))
        stack.enter_context(patch.object(CAP, 'host_admission', return_value=F.host()))
        stack.enter_context(patch.object(P.os, 'getuid', return_value=0))
        resources = C.CommonResources(C.TOKEN, F.CTX, parent, ident, processing_backup_stage=stage)
        stack.enter_context(patch.object(resources, 'check_pid'))
        yield SimpleNamespace(root=root, path=parent, identity=ident, context=ctx, resources=resources)


def acknowledge(tree, proof):
    before, after, host = P.advance_backup(tree.context, tree.identity)
    return H.ack(proof, before, after, host,
                 {'device': tree.identity[0], 'inode': tree.identity[1]})


class FakeChild:
    """Only lifecycle acknowledgements; no OS process or original worker starts."""
    pid = 999991
    exitcode = None
    alive = False
    def start(self): self.alive = True
    def is_alive(self): return self.alive
    def join(self, timeout=None): pass
    def terminate(self): self.alive = False; self.exitcode = -15
    def kill(self): self.alive = False; self.exitcode = -9


class PhaseRuntimeChecks(unittest.TestCase):
    def test_common_actual_counter_reads_ack_and_final_closure_share_same_parent(self):
        with counters() as tree:
            resources = tree.resources
            self.assertEqual(resources.sample()['kernelLifetimePeakBytes'], 1000000000)
            resources.backup_transition = lambda proof: acknowledge(tree, proof)
            ack = resources.begin_backup(F.boundary())
            self.assertEqual(ack['parentIdentity'], {'device': tree.identity[0], 'inode': tree.identity[1]})
            self.assertEqual(resources.memory_phase, 'backup')
            self.assertEqual(resources.container_limit, 4999999488)
            (tree.path / 'memory.peak').write_text('3680530432')
            (tree.path / 'memory.current').write_text('3000000000')
            closed = resources.phase_closure()
            self.assertEqual(closed['overallKernelLifetimePeakBytes'], 3680530432)
            self.assertTrue(closed['processingMemoryChecksCompleted'])
            self.assertTrue(closed['backupSafetyChecksCompleted'])
            self.assertFalse(closed['commonLifetimeMemoryAccepted'])
            with self.assertRaises(Exception): resources.begin_backup(F.boundary())
        with counters() as tree:
            bad = H.ack(F.boundary(), F.processing(), F.backup(1000000000), F.host(),
                        {'device': tree.identity[0], 'inode': tree.identity[1] + 1})
            with self.assertRaises(Exception): tree.resources.accept_backup_ack(bad)
            self.assertTrue(tree.resources._phase_state.failed)
            self.assertEqual(tree.resources.memory_phase, 'processing')

    def test_common_historical69_rejection_latches_and_never_calls_transition(self):
        with counters('mock500', 1640103936) as tree:
            resources = tree.resources; transition = Mock()
            resources.backup_transition = transition
            with self.assertRaises(C.ResourceError): resources.sample()
            self.assertTrue(resources._phase_state.failed)
            self.assertFalse(resources.last_observation()['lastReadbackValid'])
            with self.assertRaises(Exception): resources.begin_backup(F.boundary('mock500'))
            transition.assert_not_called()
            # An otherwise valid later ACK cannot heal the failed real read.
            good = H.ack(F.boundary('mock500'), F.processing('mock500'), F.backup(1000000000),
                         F.host(), {'device': tree.identity[0], 'inode': tree.identity[1]})
            with self.assertRaises(Exception): resources.accept_backup_ack(good)
            self.assertIsNone(resources.backup_ack)
            self.assertEqual((tree.path / 'memory.max').read_text(), '2048000000')

    def test_parent_transition_writes_only_fixed_memory_max_once_without_peak_reset(self):
        with counters() as tree:
            before_files = {p.name: p.read_bytes() for p in tree.path.iterdir()}
            original_open, original_write = os.open, os.write
            opened, writes = [], []
            def opening(path, flags, *args, **kwargs):
                if flags & (os.O_WRONLY | os.O_RDWR): opened.append(str(path))
                return original_open(path, flags, *args, **kwargs)
            def writing(fd, data):
                writes.append(data); return original_write(fd, data)
            with patch.object(P.os, 'open', side_effect=opening), patch.object(P.os, 'write', side_effect=writing):
                old, new, host = P.advance_backup(tree.context, tree.identity)
                with self.assertRaises(Exception): P.advance_backup(tree.context, tree.identity)
            self.assertEqual(opened, ['memory.max'])
            self.assertEqual(writes, [b'4999999488'])
            self.assertEqual(old['configuredLimit'], '2560000000')
            self.assertEqual(new['configuredLimit'], '4999999488')
            self.assertEqual(old['kernelLifetimePeakBytes'], new['kernelLifetimePeakBytes'])
            for name, raw in before_files.items():
                if name != 'memory.max': self.assertEqual((tree.path / name).read_bytes(), raw)
            self.assertEqual(tree.context['processingBackupPhase'], 'backup')

    def test_parent_bad_old_peak_host_or_identity_cannot_raise_the_cap(self):
        for failure in ('peak', 'host', 'identity'):
            with self.subTest(failure=failure), counters() as tree:
                identity = tree.identity
                if failure == 'peak': (tree.path / 'memory.peak').write_text('2048000001')
                if failure == 'identity': identity = (identity[0], identity[1] + 1)
                with patch.object(CAP, 'host_admission', side_effect=ValueError('FICTIONAL_HOST_REJECTED')) if failure == 'host' else ExitStack():
                    with self.assertRaises(Exception): P.advance_backup(tree.context, identity)
                self.assertEqual((tree.path / 'memory.max').read_text(), '2560000000')
                self.assertEqual(tree.context['processingBackupPhase'], 'processing')

    def test_parent_rejects_peak_decrease_after_write_without_issuing_ack(self):
        with counters() as tree:
            original_write = os.write
            def counter_reset(fd, raw):
                written = original_write(fd, raw)
                (tree.path / 'memory.peak').write_text('999999999')
                return written
            with patch.object(P.os, 'write', side_effect=counter_reset):
                with self.assertRaises(Exception): P.advance_backup(tree.context, tree.identity)
            # No rollback or reset by production code after uncertain readback.
            self.assertEqual((tree.path / 'memory.max').read_text(), '4999999488')
            self.assertEqual(tree.context['processingBackupPhase'], 'backup')

    def test_supervisor_checks_actual_stopped_primary_and_remaining_members_before_write(self):
        ctx = {**F.CTX, 'processingBackupStage': 'end500', 'processingBackupPhase': 'processing',
               'processingImageId': 'sha256:' + '1' * 64}
        ident = (42, 100); child = SimpleNamespace(pid=999991, is_alive=lambda: True)
        original = {'Id': 'b' * 64, 'Image': ctx['processingImageId'],
            'Config': {'Labels': {'helmut.w15.scope': 'isolated-end500-only', 'helmut.w15.run': F.CTX['runId'], 'helmut.w15.nonce': F.CTX['nonce'],
                                  'helmut.w15.commit': F.CTX['exactCommit']}},
            'HostConfig': {'CgroupParent': P.names(ctx)[0]},
            'State': {'Running': False, 'Pid': 0, 'ExitCode': 0, 'OOMKilled': False}}
        for failure in (None, 'live', 'identity', 'member', 'label', 'scope', 'deadline'):
            with self.subTest(failure=failure):
                info = copy.deepcopy(original)
                if failure == 'live': info['State']['Running'] = True
                if failure == 'identity': info['Id'] = 'c' * 64
                if failure == 'label': info['Config']['Labels']['helmut.w15.nonce'] = 'wrong'
                if failure == 'scope': info['Config']['Labels']['helmut.w15.scope'] = 'wrong'
                members = {os.getpid(), child.pid} | ({999992} if failure == 'member' else set())
                last = {'memory': None}
                with patch.object(S.os, 'getuid', return_value=0), \
                     patch.object(S, '_command', return_value=json.dumps([info]).encode()), \
                     patch.object(S, '_members', return_value=members), \
                     patch.object(P, 'advance_backup', return_value=(F.processing(), F.backup(1000000000), F.host())) as advance:
                    guard=Mock(side_effect=S.RunnerStartError('worker',runner={'reason':'SUPERVISOR_DEADLINE'})) if failure=='deadline' else Mock()
                    transition = S._supervisor_backup_transition(dict(ctx), ident, last, child, 'end500',guard=guard)
                    if failure is None:
                        ack = transition(F.boundary())
                        self.assertEqual(ack['parentIdentity'], {'device': 42, 'inode': 100})
                        advance.assert_called_once()
                        self.assertEqual(last['backupAck'], ack)
                    else:
                        with self.assertRaises(S.RunnerStartError): transition(F.boundary())
                        advance.assert_not_called()
                        # A rejected first request is consumed; no repair/retry.
                        with self.assertRaises(S.RunnerStartError): transition(F.boundary())
                        advance.assert_not_called()

    def test_existing_duplex_pipe_carries_one_bound_request_ack_and_worker_rejects_repeat(self):
        parent, worker = multiprocessing.Pipe(duplex=True)
        transition = S._worker_backup_transition(worker, {**F.CTX, 'mode': H.END_MODE}, 'end500')
        expected = F.acknowledgement(); values, errors = [], []
        def invoke():
            try: values.append(transition(F.boundary()))
            except BaseException as error: errors.append(error)
        thread = threading.Thread(target=invoke)
        try:
            thread.start()
            callback = Mock(return_value=expected)
            response = S._read_worker_response(parent, time.monotonic() + 3, wait=1, transition=callback)
            thread.join(timeout=2)
            self.assertFalse(thread.is_alive()); self.assertEqual(errors, [])
            self.assertIsNone(response); self.assertEqual(values, [expected])
            callback.assert_called_once_with(F.boundary())
            with self.assertRaises(S.RunnerStartError): transition(F.boundary())
            self.assertFalse(parent.poll(0))
        finally:
            if thread.is_alive():
                parent.send_bytes(S._encode({'kind': 'rejected'})); thread.join(timeout=2)
            parent.close(); worker.close()

    def test_default_legacy_receiver_rejects_control_frame_without_sending_ack(self):
        parent, worker = multiprocessing.Pipe(duplex=True)
        try:
            worker.send_bytes(S._encode({'kind': 'backup-transition', 'boundary': F.boundary()}))
            with self.assertRaises(S.RunnerStartError):
                S._read_worker_response(parent, time.monotonic() + 2, wait=1)
            self.assertFalse(worker.poll(0))
        finally:
            parent.close(); worker.close()

    def test_worker_first_failure_never_drains_a_later_transition_with_authority(self):
        parent, worker = multiprocessing.Pipe(duplex=True)
        child = FakeChild(); transition = Mock()
        worker.send_bytes(S._encode({'ok': False, 'phase': 'worker', 'workerPhase': 'backup-export'}))
        worker.send_bytes(S._encode({'kind': 'backup-transition', 'boundary': F.boundary()}))
        with patch.object(parent, 'send_bytes', wraps=parent.send_bytes) as send:
            with self.assertRaises(S.RunnerStartError) as observed:
                S._monitor_child(child, parent, worker, lambda: None, time.monotonic() + 2,
                                 transition=transition)
            transition.assert_not_called(); send.assert_not_called()
        self.assertEqual(observed.exception.worker_phase, 'backup-export')
        self.assertEqual(observed.exception.cleanup['workerExited'], 'PASS')

    def test_guard_failure_drain_cannot_ack_a_control_frame_arriving_at_the_failure(self):
        parent, worker = multiprocessing.Pipe(duplex=True)
        # The monitor closes its inherited child endpoint after start. A small
        # owned duplicate models the actual child's still-open private pipe.
        late_child = Connection(os.dup(worker.fileno()), readable=True, writable=True)
        child = FakeChild(); transition = Mock()
        def guard():
            late_child.send_bytes(S._encode({'kind': 'backup-transition', 'boundary': F.boundary()}))
            raise S.RunnerStartError('worker', runner={'reason': 'PARENT_READBACK_REJECTED'})
        try:
            with patch.object(parent, 'send_bytes', wraps=parent.send_bytes) as send:
                with self.assertRaises(S.RunnerStartError) as observed:
                    S._monitor_child(child, parent, worker, guard, time.monotonic() + 2,
                                     transition=transition)
                transition.assert_not_called(); send.assert_not_called()
            self.assertEqual(observed.exception.runner['reason'], 'PARENT_READBACK_REJECTED')
            self.assertEqual(observed.exception.cleanup['workerExited'], 'PASS')
        finally:
            late_child.close()


    def test_cleanup_preserves_known_backup_snapshot_when_outer_phase_is_stale(self):
        ctx={**F.CTX,'processingBackupStage':'end500','processingBackupPhase':'processing'}
        known=C.project_failure_memory(F.backup(),True)
        later=F.backup(3200000000);later.pop('capacityMeasurement')
        problem=ValueError('FIXTURE_REJECTED_READBACK')
        problem.failure_memory=C.project_failure_memory(later,False)
        failure=S.RunnerStartError('worker',runner={'reason':'WORKER_RESULT_REJECTED',
            'memory':known,'memorySource':'CACHED_READBACK'})
        parent=SimpleNamespace(names=P.names,identity=lambda _: (42,100),
            read_parent=Mock(side_effect=problem),parent_empty=Mock(return_value=True),privileged=Mock())
        latch=SimpleNamespace(seen=False,cleaning=False,close=Mock())
        with patch.object(S,'_command',return_value=b''):
            result=S._cleanup_launch(ctx,parent,(42,100),True,SimpleNamespace(poll=lambda:0),
                Mock(),latch,failure)
        self.assertIs(result,failure)
        self.assertEqual(result.phase,'worker')
        sample=result.runner['memory']
        self.assertEqual(sample['kernelLifetimePeakBytes'],3200000000)
        self.assertFalse(sample['lastReadbackValid'])
        self.assertEqual(sample['capacityMeasurement'],known['capacityMeasurement'])
        self.assertFalse(sample['capacityMeasurement']['last']['peakCompositionKnown'])
        self.assertEqual(ctx['processingBackupPhase'],'processing')


if __name__ == '__main__':
    unittest.main()
