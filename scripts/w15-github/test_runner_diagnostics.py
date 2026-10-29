"""Synthetic supervisor/IPC failures. No originals, services or privileged IO."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import signal
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R = load('diagnostic_runner_test', HERE / 'runner_start.py')
T = load('diagnostic_existing_fixture', HERE / 'test_runner_start.py')
M = load('diagnostic_mock_runner_test', HERE / 'mock500_runner.py')


def sample(peak=64):
    return {'configuredLimit': '2560000000', 'swapMaximum': '0',
        'kernelLifetimePeakBytes': peak, 'currentBytes': 32, 'swapCurrentBytes': 0,
        'events': {'max': 0, 'oom': 0, 'oom_kill': 0, 'oom_group_kill': 0}}


class Child:
    def __init__(self, alive=True, exitcode=1):
        self.pid, self.exitcode, self.alive = 4321, exitcode, alive
    def start(self):
        pass
    def is_alive(self):
        return self.alive
    def join(self, timeout=None):
        pass
    def terminate(self):
        self.alive, self.exitcode = False, -15
    def kill(self):
        self.alive, self.exitcode = False, -9


class DiagnosticChecks(unittest.TestCase):
    def supervise(self, guard_failure_at=None, *, close_failure=False, child=None, packet=None):
        # Real bounded OS pipe, but no fork/UID change/service or process signals.
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        sender.send_bytes(json.dumps(packet or {'ok': False, 'phase': 'worker',
            'workerPhase': 'backup-export'}).encode())
        raw_receiver = receiver
        if close_failure:
            receiver = Mock(wraps=raw_receiver)
            receiver.close.side_effect = RuntimeError('FICTIONAL_CLOSE_FAILURE')
        child = child or Child()
        fork = SimpleNamespace(Pipe=lambda **_: (receiver, sender), Process=lambda **_: child)
        reads = []
        def read(*args, **kwargs):
            reads.append(1)
            if len(reads) == guard_failure_at:
                raise R.P.R.ResourceError('FICTIONAL_GUARD_FAILURE')
            return sample()
        manifest = {**T.REQUEST, 'sourcePins': {}, 'checkoutBytes': 0, 'binaryBytes': 0}
        ctx = R._ctx(T.REQUEST)
        with patch.object(R.os, 'getuid', return_value=0), \
                patch.object(R.Path, 'read_text', return_value='0::/' + R.P.names(ctx)[0] + '/service'), \
                patch.object(R.P, 'identity', return_value=(1, 2)), \
                patch.object(R.P, 'read_parent', side_effect=read), \
                patch.object(R, '_stage', return_value=manifest), \
                patch.object(R, '_identity_available', return_value=987), \
                patch.object(R.multiprocessing, 'get_context', return_value=fork), \
                patch.object(R.time, 'sleep'):
            try:
                R.supervise(T.REQUEST, {})
            except BaseException as error:
                return error, reads
        self.fail('Expected a closed failure')

    def test_queued_inner_failure_cannot_be_masked_by_next_guard(self):
        error, _ = self.supervise(guard_failure_at=2)
        self.assertIsInstance(error, R.RunnerStartError)
        self.assertEqual(error.worker_phase, 'backup-export')

    def test_stored_inner_failure_cannot_be_masked_by_later_guard(self):
        error, _ = self.supervise(guard_failure_at=3)
        self.assertIsInstance(error, R.RunnerStartError)
        self.assertEqual(error.worker_phase, 'backup-export')

    def test_pipe_close_cannot_replace_first_inner_failure(self):
        error, _ = self.supervise(close_failure=True, child=Child(alive=False))
        self.assertIsInstance(error, R.RunnerStartError)
        self.assertEqual(error.worker_phase, 'backup-export')
        self.assertEqual(error.safe_failure['cleanup']['workerIPCClosed'], 'UNKNOWN')

    def test_rejected_complete_kernel_sample_is_not_lost(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            values = {'memory.max': '2560000000', 'memory.swap.max': '0',
                'memory.peak': str(R.P.R.MAXIMUM + 1), 'memory.current': '32',
                'memory.swap.current': '0', 'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n',
                'cgroup.events': 'populated 0\n'}
            for key, value in values.items():
                (root / key).write_text(value)
            identity = (root.stat().st_dev, root.stat().st_ino)
            with patch.object(R.P.R, '_kernel_directory', side_effect=lambda _: os.open(root, os.O_RDONLY | os.O_DIRECTORY)):
                with self.assertRaises(Exception) as ended:
                    R.P.read_parent(R._ctx(T.REQUEST), identity)
                memory = getattr(ended.exception, 'failure_memory', None)
                self.assertIsNotNone(memory)
                self.assertEqual(memory['kernelLifetimePeakBytes'], R.P.R.MAXIMUM + 1)
                self.assertFalse(memory['lastReadbackValid'])
                self.assertTrue(R.P.parent_empty(R._ctx(T.REQUEST), identity))
                with self.assertRaises(R.P.R.ResourceError):
                    R.P.R.assess(sample(R.P.R.MAXIMUM + 1))

    def launch(self, *, first=None, remove=None, identities=None, close_error=False):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        top, ipc = Path(temporary.name) / 'top', Path(temporary.name) / 'ipc'
        process, listener = Mock(), Mock()
        process.wait.return_value = 0; process.poll.return_value = 0
        if close_error:
            listener.close.side_effect = RuntimeError('FICTIONAL_LISTENER_CLOSE')
        modes = []
        def privileged(mode, ctx):
            modes.append(mode)
            if mode == 'remove' and remove is not None:
                remove()
        identity = Mock(side_effect=identities) if identities else Mock(return_value=(1, 2))
        result = {'ok': True, 'result': {'worker': T.worker_result(), 'workerExited': True,
            'checkoutFiles': 1, 'checkoutBytes': 47, 'binaryBytes': 100,
            'dockerSocketGID': 987, 'workerUID': 1000, 'workerGID': 1000}}
        with patch.object(R.os, 'chmod'), patch.object(R, '_roots', return_value=(top, ipc)), patch.object(R, 'github_binding'), \
                patch.object(R, '_identity_available'), patch.object(R.socket, 'socket', return_value=listener), \
                patch.object(R.P, 'privileged', side_effect=privileged), \
                patch.object(R.P, 'identity', identity), patch.object(R.P, 'parent_empty', create=True, return_value=True), \
                patch.object(R.P, 'read_parent', return_value=sample()), \
                patch.object(R.subprocess, 'Popen', return_value=process), patch.object(R, '_command') as command, \
                patch.object(R, '_receive_result', side_effect=first, return_value=result):
            try:
                result = R.launch(T.REQUEST, {})
            except BaseException as error:
                return error, modes, command
        return result, modes, command

    def test_outer_listener_close_cannot_replace_inner_failure(self):
        first = R.RunnerStartError('worker', 'backup-export')
        error, _, _ = self.launch(first=first, close_error=True)
        self.assertIs(error, first)
        self.assertEqual(error.worker_phase, 'backup-export')
        self.assertEqual(error.safe_failure['cleanup']['launcherListenerClosed'], 'UNKNOWN')

    def test_replaced_parent_is_neither_killed_nor_removed(self):
        first = R.RunnerStartError('worker', 'backup-export')
        error, modes, command = self.launch(first=first, identities=[(1, 2), (9, 9)])
        self.assertIs(error, first)
        self.assertEqual(modes, ['prepare'])
        command.assert_not_called()
        self.assertEqual(error.safe_failure['cleanup']['parentEmpty'], 'UNKNOWN')

    def test_term_during_successful_cleanup_cannot_return_pass(self):
        # Invoke the actual handler directly; never signal the test process.
        error, _, _ = self.launch(remove=lambda: signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None))
        self.assertIsInstance(error, R.RunnerStartError)
        self.assertEqual(error.safe_failure['runner']['reason'], 'SIGNAL_DURING_CLEANUP')

    def test_cleanup_failure_and_signal_keep_primary_with_separate_facts(self):
        first = R.RunnerStartError('worker', 'backup-export')
        def remove():
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            raise RuntimeError('FICTIONAL_REMOVE_FAILURE')
        error, _, _ = self.launch(first=first, remove=remove)
        self.assertIs(error, first)
        self.assertEqual(error.worker_phase, 'backup-export')
        self.assertEqual(error.safe_failure['runner']['secondaryReason'], 'SIGNAL_DURING_CLEANUP')
        self.assertEqual(error.safe_failure['cleanup']['parentEmpty'], 'PASS')
        self.assertEqual(error.safe_failure['cleanup']['parentUnitRemoved'], 'UNKNOWN')

    def test_incomplete_and_rejected_worker_frames_have_closed_reasons(self):
        packets = [(b'\x00\x00', 'WORKER_IPC_EOF'),
            (struct.pack('!i', 20) + b'{}', 'WORKER_IPC_EOF'),
            (struct.pack('!i', R.MAX_RESULT + 1), 'WORKER_IPC_REJECTED'),
            (struct.pack('!i', 1) + b'{', 'WORKER_IPC_REJECTED')]
        for raw, reason in packets:
            with self.subTest(reason=reason, size=len(raw)):
                receiver, sender = multiprocessing.Pipe(duplex=False)
                try:
                    os.write(sender.fileno(), raw); sender.close()
                    with self.assertRaises(R.RunnerStartError) as ended:
                        R._read_worker_response(receiver, time.monotonic() + 1)
                    self.assertEqual(ended.exception.safe_failure['runner']['reason'], reason)
                    self.assertIsNone(ended.exception.worker_phase)
                finally:
                    receiver.close(); sender.close()

    def test_partial_worker_frame_cannot_block_guard_indefinitely(self):
        receiver, sender = multiprocessing.Pipe(duplex=False)
        try:
            os.write(sender.fileno(), b'\x00\x00')
            before = time.monotonic()
            with self.assertRaises(R.RunnerStartError) as ended:
                R._read_worker_response(receiver, before + .03)
            self.assertEqual(ended.exception.safe_failure['runner']['reason'], 'WORKER_IPC_TIMEOUT')
            self.assertLess(time.monotonic() - before, 1)
        finally:
            receiver.close(); sender.close()

    def test_natural_signal_and_exit_without_report_are_not_success(self):
        for code in (-9, -15, 0, 1):
            with self.subTest(exitcode=code):
                receiver, sender = multiprocessing.Pipe(duplex=False)
                sender.close()
                child = Child(alive=False, exitcode=code)
                with self.assertRaises(R.RunnerStartError) as ended:
                    R._monitor_child(child, receiver, sender, lambda: sample(), time.monotonic() + 1)
                detail = ended.exception.safe_failure['runner']
                self.assertEqual(detail['workerExitCode'], code)
                if code < 0:
                    self.assertEqual(detail['reason'], 'WORKER_SIGNAL_EXIT')
                self.assertEqual(ended.exception.safe_failure['cleanup']['workerExited'], 'PASS')

    def test_unavailable_sample_remains_unknown_and_cached_is_explicit(self):
        no_sample = R._diagnose(RuntimeError('FICTIONAL'), 'worker', 'PARENT_READBACK_REJECTED')
        self.assertNotIn('memory', no_sample.safe_failure['runner'])
        cache = R.P.R.project_failure_memory(sample(), True)
        old = R._diagnose(RuntimeError('FICTIONAL'), 'worker', 'PARENT_READBACK_REJECTED', cache)
        self.assertEqual(old.safe_failure['runner']['memorySource'], 'CACHED_READBACK')
        self.assertFalse(old.safe_failure['runner']['memory']['lastReadbackValid'])
        current = R.P.ProbeError(memory=R.P.R.project_failure_memory(sample(R.P.R.MAXIMUM + 1), False))
        rejected = R._diagnose(current, 'worker', 'PARENT_READBACK_REJECTED', cache)
        self.assertEqual(rejected.safe_failure['runner']['memorySource'], 'CURRENT_REJECTED_READBACK')
        self.assertEqual(rejected.safe_failure['runner']['memory']['kernelLifetimePeakBytes'], R.P.R.MAXIMUM + 1)

    def test_socket_deadline_is_checked_during_partial_message(self):
        class Connection:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def getsockopt(self, *args): return struct.pack('3i', 123, 0, 0)
            def settimeout(self, value): pass
            def recv(self, size): return b'\x00'
        listener = Mock(); listener.accept.return_value = (Connection(), None)
        clock = iter([0, 0, 1, 3, 6])
        with patch.object(R.time, 'monotonic', side_effect=lambda: next(clock)), \
                self.assertRaises(R.RunnerStartError) as ended:
            R._receive_result(listener, Mock(), 5)
        self.assertEqual(ended.exception.safe_failure['runner']['reason'], 'SERVICE_IPC_TIMEOUT')

    def test_worker_optional_getter_and_systemexit_cannot_erase_phase_or_make_pass(self):
        programs = [
            'class Failure(Exception):\n phase="backup-export"\n @property\n def worker_memory(self): raise RuntimeError("FICTIONAL_PRIVATE_CANARY")\ndef run_worker(*args): raise Failure("FICTIONAL_PRIVATE_CANARY")\n',
            *['def run_worker(*args): raise SystemExit(' + value + ')\n' for value in ('0', '1', '"FICTIONAL_PRIVATE_CANARY"')]]
        for index, program in enumerate(programs):
            with self.subTest(case=index), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); script = root / 'scripts/w15-github/restore_workflow.py'
                script.parent.mkdir(parents=True); script.write_text(program)
                import hashlib
                raw = script.read_bytes()
                manifest = {**T.REQUEST, 'stagedRepo': str(root), 'runnerTemp': str(root/'worker'),
                    'sourcePins': {'scripts/w15-github/restore_workflow.py': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
                sender, receiver = Mock(), Mock()
                with patch.object(R, '_close_stdio'), patch.dict(R.os.environ, {}, clear=True), \
                        patch.object(R.os, 'setgroups'), patch.object(R.os, 'setgid'), patch.object(R.os, 'setuid'), \
                        patch.object(R.os, 'getuid', return_value=1000), patch.object(R.os, 'getgid', return_value=1000), \
                        patch.object(R.os, 'getgroups', return_value=[987]), self.assertRaises(SystemExit) as ended:
                    R._fork_worker(manifest, {}, sender, receiver, 987)
                self.assertEqual(ended.exception.code, 1)
                value = json.loads(sender.send_bytes.call_args.args[0])
                self.assertFalse(value['ok'])
                self.assertNotIn('FICTIONAL_PRIVATE_CANARY', json.dumps(value))
                if index == 0:
                    self.assertEqual(value['workerPhase'], 'backup-export')
                    self.assertNotIn('workerMemory', value)

    def test_complete_sample_survives_later_populated_rejection_and_interrupt(self):
        for parent, limit in [(R.P, 2560000000), (M.P, 2048000000)]:
            for interrupted in (False, True):
                with self.subTest(limit=limit, interrupted=interrupted), tempfile.TemporaryDirectory() as folder:
                    root = Path(folder)
                    values = {'memory.max': str(limit), 'memory.swap.max': '0', 'memory.peak': '128',
                        'memory.current': '32', 'memory.swap.current': '0',
                        'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n',
                        'cgroup.events': 'populated 1\n'}
                    for key, value in values.items(): (root/key).write_text(value)
                    identity = (root.stat().st_dev, root.stat().st_ino)
                    kernel = parent.R if parent is R.P else parent.P.R
                    original_open = os.open
                    def open_file(name, *args, **kwargs):
                        if interrupted and name == 'cgroup.events': raise KeyboardInterrupt()
                        return original_open(name, *args, **kwargs)
                    with patch.object(kernel, '_kernel_directory', side_effect=lambda _: original_open(root, os.O_RDONLY|os.O_DIRECTORY)), \
                            patch.object(os, 'open', side_effect=open_file), self.assertRaises(BaseException) as ended:
                        parent.read_parent(R._ctx(T.REQUEST), identity, empty=True)
                    if interrupted: self.assertIsInstance(ended.exception, KeyboardInterrupt)
                    self.assertEqual(ended.exception.failure_memory['kernelLifetimePeakBytes'], 128)
                    self.assertFalse(ended.exception.failure_memory['lastReadbackValid'])

    def test_monitor_does_not_promote_late_signal_cancellation(self):
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(sender.close)
        def guard():
            sender.send_bytes(b'{"ok":false,"phase":"worker","workerPhase":"backup-export"}')
            raise KeyboardInterrupt()
        with self.assertRaises(R.RunnerStartError) as ended:
            R._monitor_child(Child(), receiver, SimpleNamespace(close=lambda: None), guard, time.monotonic()+2)
        self.assertIsNone(ended.exception.worker_phase)
        self.assertEqual(ended.exception.runner['reason'], 'SUPERVISOR_INTERRUPTED')

    def test_owned_stop_is_attempted_when_empty_observation_is_unavailable(self):
        failure = R.RunnerStartError('worker', 'backup-export')
        parent, listener, process, latch = Mock(), Mock(), Mock(), Mock(seen=False)
        parent.names.return_value = ('FICTIONAL.slice', '', '')
        parent.identity.return_value = (1, 2)
        parent.read_parent.side_effect = OSError('FICTIONAL_UNREADABLE')
        parent.parent_empty.side_effect = OSError('FICTIONAL_UNREADABLE')
        process.poll.return_value = 0
        with patch.object(R, '_command') as command:
            error = R._cleanup_launch({}, parent, (1,2), True, process, listener, latch, failure)
        self.assertIs(error, failure)
        self.assertEqual([c.args[0][3] for c in command.call_args_list], ['kill', 'stop'])
        parent.privileged.assert_not_called()
        self.assertEqual(error.cleanup['parentEmpty'], 'UNKNOWN')
        self.assertEqual(error.cleanup['parentStopRequested'], 'PASS')
        self.assertEqual(error.cleanup['parentUnitRemoved'], 'UNKNOWN')

    def test_service_death_retains_final_available_kernel_values_before_stop(self):
        failure = R.RunnerStartError('service', runner={'reason':'SERVICE_EXIT_WITHOUT_REPORT',
            'serviceExitCode':-9, 'memory':R.P.R.project_failure_memory(sample(),True), 'memorySource':'CACHED_READBACK'})
        parent, listener, process, latch = Mock(), Mock(), Mock(), Mock(seen=False)
        parent.names.return_value = ('FICTIONAL.slice','',''); parent.identity.return_value = (1,2)
        latest = sample(R.P.R.MAXIMUM+1); latest['events']['oom'] = 1
        parent.read_parent.side_effect = R.P.ProbeError(memory=R.P.R.project_failure_memory(latest,False))
        parent.parent_empty.return_value = True; process.poll.return_value = 0
        with patch.object(R, '_command'):
            result = R._cleanup_launch({}, parent, (1,2), True, process, listener, latch, failure)
        self.assertEqual(result.runner['reason'], 'SERVICE_EXIT_WITHOUT_REPORT')
        self.assertEqual(result.runner['serviceExitCode'], -9)
        self.assertEqual(result.runner['memorySource'], 'POST_FAILURE_READBACK')
        self.assertEqual(result.runner['memory']['kernelLifetimePeakBytes'], R.P.R.MAXIMUM+1)
        self.assertEqual(result.runner['memory']['events']['oom'], 1)
        self.assertFalse(result.runner['memory']['lastReadbackValid'])

    def test_socket_close_cannot_replace_eof_or_valid_inner_report(self):
        for cls in (R.RunnerStartError, M.MockRunnerError):
            for packet in (None, {'ok':False,'phase':'worker','workerPhase':'backup'}):
                with self.subTest(cls=cls.__name__, packet=packet):
                    connection, listener = Mock(), Mock()
                    connection.getsockopt.return_value = struct.pack('3i',123,0,0)
                    connection.close.side_effect = OSError('FICTIONAL_PRIVATE_CANARY')
                    raw = json.dumps(packet).encode() if packet else None
                    connection.recv.side_effect = [struct.pack('!I',len(raw)),raw] if raw else [b'']
                    listener.accept.return_value = (connection,None)
                    with self.assertRaises(cls) as ended:
                        R._receive_result(listener,Mock(),time.monotonic()+2,error_type=cls)
                    failure = ended.exception
                    self.assertEqual(failure.runner['reason'], 'WORKER_REPORTED_FAILURE' if raw else 'SERVICE_IPC_EOF')
                    self.assertEqual(failure.runner['secondaryReason'],'CLEANUP_UNCONFIRMED')
                    if raw: self.assertEqual(failure.worker_phase,'backup')
                    self.assertNotIn('FICTIONAL_PRIVATE_CANARY',json.dumps(failure.safe_failure))

    def test_worker_setup_close_fault_still_emits_closed_failure(self):
        for module in (R, M):
            sender, receiver = Mock(), Mock()
            receiver.close.side_effect = OSError('FICTIONAL_PRIVATE_CANARY')
            with self.assertRaises(SystemExit) as ended:
                module._fork_worker({}, {}, sender, receiver, 987)
            self.assertEqual(ended.exception.code,1)
            packet = json.loads(sender.send_bytes.call_args.args[0])
            self.assertFalse(packet['ok'])
            self.assertEqual(packet['runner']['reason'],'WORKER_SETUP_REJECTED')
            self.assertNotIn('FICTIONAL_PRIVATE_CANARY',json.dumps(packet))

    def test_signal_keeps_its_type_in_both_resource_observers(self):
        c = R.P.R
        v = load('diagnostic_mock_resources_test',HERE/'mock500_resources.py')
        for module, observer_type, kernel in [(c,c.CommonResources,c),(v,v.MockCommonResources,v.C)]:
            with self.subTest(module=module.__name__), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); identity = (root.stat().st_dev,root.stat().st_ino)
                observer = observer_type(module.TOKEN,{},root,identity)
                observer._last_observed = sample(); observer._last_valid = True
                original_open = os.open
                with patch.object(kernel,'_kernel_directory',side_effect=lambda _:original_open(root,os.O_RDONLY|os.O_DIRECTORY)), \
                        patch.object(kernel,'membership',side_effect=KeyboardInterrupt()), \
                        patch.object(Path,'read_text',return_value='FICTIONAL'), self.assertRaises(KeyboardInterrupt) as ended:
                    observer.sample()
                self.assertIsNone(ended.exception.failure_memory)
                self.assertEqual(observer.failure_observation()['kernelLifetimePeakBytes'],64)
                self.assertFalse(observer.failure_observation()['lastReadbackValid'])

    def test_both_actions_keep_closed_failure_on_spawn_error_but_never_success(self):
        harness = r'''
const fs=require('node:fs'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync(0,'utf8')),source=fs.readFileSync(process.argv[1],'utf8'),rows=[];
for(const which of ['failure','success','partial']){
 const output=[],receipt=which==='success'?{status:'PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY'}:data.receipt;
 const context={Buffer,console:{log:line=>output.push(JSON.parse(line))},
  process:{env:{W15_MODE:data.mode,W15_REQUEST:'{}',GITHUB_EVENT_PATH:'/FICTIONAL/event'},exitCode:0},
  require:name=>name==='node:fs'?{readFileSync:()=>'{"inputs":{"w15_request":"{}"}}'}:
   {spawnSync:()=>({status:null,error:Error('FICTIONAL_PRIVATE_CANARY'),stderr:'FICTIONAL_PRIVATE_CANARY',
    stdout:which==='partial'?'{':JSON.stringify(receipt)})}};
 vm.runInNewContext(source,context,{timeout:1000});rows.push({output,exitCode:context.process.exitCode});
}process.stdout.write(JSON.stringify(rows));
'''
        for action, mode, status in [('w15-isolated','end500-restore-gated','FAIL_W15_ISOLATED_WORKFLOW'),
                ('w15-mock500','mock500-full-gated','FAIL_OR_BLOCKED_MOCK500_WORKFLOW')]:
            receipt = {'status':status,'phase':'worker','worker':{'phase':'backup'},
                'runner':{'reason':'SERVICE_EXIT_WITHOUT_REPORT','serviceExitCode':-9,
                    'memorySource':'POST_FAILURE_READBACK','memory':R.P.R.project_failure_memory(sample(),True)},
                'cleanup':R.D.unknown_cleanup(),'executionAuthority':False,'retryAllowed':False}
            result = subprocess.run([shutil.which('node'),'-e',harness,str(HERE.parents[1]/'.github/actions'/action/'index.js')],
                input=json.dumps({'receipt':receipt,'mode':mode}),text=True,capture_output=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertNotIn('FICTIONAL_PRIVATE_CANARY',result.stdout)
            rows = json.loads(result.stdout)
            self.assertEqual(rows[0]['output'][0],receipt)
            self.assertTrue(all(row['exitCode']==1 for row in rows))
            self.assertTrue(all('PASS' not in str(row['output']) for row in rows[1:]))

    def test_staging_failure_retains_earlier_supervisor_sample(self):
        ctx = R._ctx(T.REQUEST)
        with patch.object(R.os,'getuid',return_value=0), patch.object(R.P,'identity',return_value=(1,2)), \
                patch.object(R.P.R,'membership',return_value='/'+R.P.names(ctx)[0]+'/service'), \
                patch.object(R.P,'read_parent',return_value=sample()), patch.object(R,'_identity_available',return_value=987), \
                patch.object(R,'_stage',side_effect=OSError('FICTIONAL_PRIVATE_CANARY')), \
                self.assertRaises(R.RunnerStartError) as ended:
            R.supervise(T.REQUEST,{})
        self.assertEqual(ended.exception.phase,'staging')
        self.assertEqual(ended.exception.runner['memorySource'],'CACHED_READBACK')
        self.assertEqual(ended.exception.runner['memory']['kernelLifetimePeakBytes'],64)

    def test_mock_clock_interruption_is_not_a_deadline_failure(self):
        fixture = load('diagnostic_mock_fixture',HERE/'test_mock500_runner.py')
        value = fixture.request(); ctx = M.S._ctx(value)
        with patch.object(M.os,'getuid',return_value=0), patch.object(M.P,'identity',return_value=(1,2)), \
                patch.object(M.P.P.R,'membership',return_value='/'+M.P.names(ctx)[0]+'/service'), \
                patch.object(M,'_started',side_effect=KeyboardInterrupt()), \
                self.assertRaises(M.MockRunnerError) as ended:
            M.supervise(value,{},'2026-10-30T00:00:00Z',1)
        self.assertEqual(ended.exception.runner['reason'],'SUPERVISOR_INTERRUPTED')

    def test_malformed_optional_metadata_cannot_erase_known_phase_or_leak_values(self):
        for bad in ({'reason':'FICTIONAL_PRIVATE_CANARY'},
                {'reason':'SERVICE_IPC_EOF','serviceExitCode':True},
                {'reason':'SERVICE_IPC_EOF','memorySource':'FICTIONAL_PRIVATE_CANARY'}):
            candidate = {'phase':'worker','worker':{'phase':'backup-export'},'runner':bad,
                'cleanup':{**R.D.unknown_cleanup(),'private':'FICTIONAL_PRIVATE_CANARY'}}
            result = R.D.public(candidate,R.PHASES,R.WORKER_PHASES,R._closed_memory)
            self.assertEqual(result,{'phase':'worker','worker':{'phase':'backup-export'}})
            self.assertNotIn('FICTIONAL_PRIVATE_CANARY',json.dumps(result))
            with self.assertRaises(R.RunnerStartError):
                R._response_error({'ok':False,'phase':'worker','runner':bad})

    def test_observer_signal_after_complete_sample_retains_only_current_values(self):
        v = load('diagnostic_interrupted_mock_resources',HERE/'mock500_resources.py')
        for module, observer_type, kernel, limit in [(R.P.R,R.P.R.CommonResources,R.P.R,2560000000),
                (v,v.MockCommonResources,v.C,2048000000)]:
            with self.subTest(limit=limit), tempfile.TemporaryDirectory() as folder:
                root=Path(folder); identity=(root.stat().st_dev,root.stat().st_ino)
                fields={'memory.max':str(limit),'memory.swap.max':'0','memory.peak':'128',
                    'memory.current':'32','memory.swap.current':'0',
                    'memory.events':'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}
                for name,value in fields.items(): (root/name).write_text(value)
                observer=observer_type(module.TOKEN,{},root,identity)
                observer._last_observed=sample(); observer._last_valid=True
                with patch.object(kernel,'_kernel_directory',side_effect=lambda _:os.open(root,os.O_RDONLY|os.O_DIRECTORY)), \
                        patch.object(observer,'check_pid'), patch.object(module,'assess',side_effect=KeyboardInterrupt()), \
                        self.assertRaises(KeyboardInterrupt) as ended:
                    observer.sample()
                self.assertEqual(ended.exception.failure_memory['kernelLifetimePeakBytes'],128)
                self.assertFalse(ended.exception.failure_memory['lastReadbackValid'])

    def test_failed_directory_open_invalidates_cache_without_new_values(self):
        v=load('diagnostic_unreadable_mock_resources',HERE/'mock500_resources.py')
        for module, observer_type, kernel in [(R.P.R,R.P.R.CommonResources,R.P.R),(v,v.MockCommonResources,v.C)]:
            observer=observer_type(module.TOKEN,{},Path('/FICTIONAL/cgroup'),(1,2))
            observer._last_observed=sample(); observer._last_valid=True
            with patch.object(kernel,'_kernel_directory',side_effect=OSError('FICTIONAL_PRIVATE_CANARY')), \
                    self.assertRaises(OSError):
                observer.sample()
            self.assertFalse(observer.failure_observation()['lastReadbackValid'])
            self.assertEqual(observer.failure_observation()['kernelLifetimePeakBytes'],64)


if __name__ == '__main__':
    unittest.main()
