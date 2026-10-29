"""New topology-adapter boundaries only; no sudo/systemd/Docker invocation."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_parent_probe_test', Path(__file__).with_name('runner_parent.py'))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)
CTX = P.context('40758148874', 'a' * 40, '82451be8-92ca-4912-935a-ab28b4c41310')


def sample():
    return {'configuredLimit': '2560000000', 'swapMaximum': '0', 'kernelLifetimePeakBytes': 1234,
            'currentBytes': 123, 'swapCurrentBytes': 0,
            'events': {k: 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class ParentProbeChecks(unittest.TestCase):
    def test_cross_uid_git_trust_is_explicit_and_limited_to_the_fixed_checkout(self):
        def command(argv, **kwargs):
            self.assertIn('safe.directory=' + str(P.REPO), argv)
            self.assertNotIn('safe.directory=*', argv)
            self.assertIn('core.hooksPath=/dev/null', argv)
            self.assertIn('core.fsmonitor=false', argv)
            if argv[-2:] == ['rev-parse', 'HEAD']:
                raw = (CTX['exactCommit'] + '\n').encode()
            else:
                relative = argv[-1]; raw = (P.REPO / relative).read_bytes()
                digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest()
                raw = ('100644 blob ' + digest + '\t' + relative + '\x00').encode()
            return subprocess.CompletedProcess(argv, 0, raw)
        env = {'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': CTX['runId'], 'GITHUB_RUN_ATTEMPT': '1'}
        with patch.dict(P.os.environ, env, clear=True), patch.object(P, 'command', side_effect=command) as call:
            P.github_binding(CTX['runId'], CTX['exactCommit'])
        self.assertEqual(call.call_count, 3)

    def test_github_mismatch_and_attempt_two_reject_before_processes(self):
        for env in ({}, {'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': CTX['runId'], 'GITHUB_RUN_ATTEMPT': '2'},
                    {'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': '999999', 'GITHUB_RUN_ATTEMPT': '1'}):
            with patch.dict(P.os.environ, env, clear=True), patch.object(P, 'command') as call:
                with self.assertRaises(P.ProbeError): P.github_binding(CTX['runId'], CTX['exactCommit'])
                call.assert_not_called()

    def test_invalid_public_arguments_and_raw_failure_never_leak_or_start(self):
        for argv in ([], ['--run'], ['--probe-parent-only', '--run-id', '../PRIVATE', '--expected-commit', 'a' * 40],
                     ['--probe-parent-only', '--run-id', CTX['runId'], '--expected-commit', 'a' * 40,
                      '--nonce', CTX['nonce']]):
            with patch.object(P, 'probe') as probe, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(P.main(argv), 1)
                probe.assert_not_called()
            result = json.loads(out.getvalue())
            self.assertNotIn('PRIVATE', out.getvalue())
            self.assertFalse(result['executionAuthority'])
        argv = ['--probe-parent-only', '--run-id', CTX['runId'], '--expected-commit', CTX['exactCommit']]
        with patch.object(P, 'github_binding'), patch.object(P, 'probe', side_effect=RuntimeError('/private/SECRET')), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(P.main(argv), 1)
        self.assertNotIn('SECRET', out.getvalue())

    def test_child_environment_and_output_are_bounded_and_stderr_discarded(self):
        result = subprocess.CompletedProcess(['fixed'], 0, b'fine')
        with patch.object(P.subprocess, 'run', return_value=result) as call:
            P.command(['fixed'])
        kwargs = call.call_args.kwargs
        self.assertEqual(kwargs['env'], P.ENV)
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertFalse(kwargs['shell'])
        self.assertNotIn('GITHUB_TOKEN', kwargs['env'])
        with patch.object(P.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'x' * 65537)):
            with self.assertRaises(P.ProbeError): P.command(['fixed'])

    def test_unavailable_local_image_never_creates_parent_or_pulls(self):
        with patch.object(P, 'command', side_effect=P.ProbeError('fixed')) as call, \
                patch.object(P, 'privileged') as privileged:
            with self.assertRaises(P.ProbeError): P.probe(CTX)
        privileged.assert_not_called()
        self.assertEqual(call.call_args.args[0], P.DOCKER + ['image', 'inspect', '--format', '{{.Id}}', P.IMAGE])

    def test_prepare_defines_limits_before_start_and_never_reuses_unit(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); units = base / 'units'; units.mkdir(); kernel = base / 'kernel'; kernel.mkdir()
            calls = []
            def command(argv, **kwargs):
                self.assertEqual((units / P.names(CTX)[0]).read_bytes(), P.unit_bytes())
                calls.append(argv)
            with patch.object(P, 'UNIT_ROOT', units), patch.object(P.R, 'KERNEL_ROOT', kernel), \
                    patch.object(P.os, 'getuid', return_value=0), \
                    patch.object(P.Path, 'read_text', return_value='systemd\n'), \
                    patch.object(P, 'command', side_effect=command), patch.object(P, 'identity', return_value=(1, 2)), \
                    patch.object(P, 'read_parent') as read:
                P.prepare_parent(CTX)
                self.assertEqual(calls, [['/usr/bin/systemctl', 'daemon-reload'],
                                         ['/usr/bin/systemctl', 'start', P.names(CTX)[0]]])
                read.assert_called_once_with(CTX, (1, 2), empty=True)
                with self.assertRaises(FileExistsError): P.prepare_parent(CTX)
            self.assertEqual(stat.S_IMODE((units / P.names(CTX)[0]).stat().st_mode), 0o600)

    def test_root_supervisor_drops_to_exact_docker_group_and_waits_for_worker(self):
        worker = Mock(pid=54321, returncode=0)
        worker.poll.return_value = 0
        worker.communicate.return_value = (json.dumps({'rootSupervisorPID': os.getpid(),
                                                       'uid1000WorkerPID': worker.pid}).encode(), None)
        with patch.object(P.os, 'getuid', return_value=0), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P, 'identity', return_value=(1, 2)), patch.object(P, 'read_parent'), \
                patch.object(P, 'command', return_value=subprocess.CompletedProcess([], 0, ('sha256:' + 'f' * 64 + '\n').encode())), \
                patch.object(P, 'inspect', return_value=None), \
                patch.object(P.Path, 'read_text', return_value='0::/' + P.names(CTX)[0] + '/control.service\n'), \
                patch.object(P.subprocess, 'Popen', return_value=worker) as popen, \
                patch.object(P, 'stop_container') as stop:
            P.supervise(CTX)
        kwargs = popen.call_args.kwargs
        self.assertEqual((kwargs['user'], kwargs['group'], kwargs['extra_groups']), (1000, 1000, [987]))
        self.assertEqual(kwargs['env'], P.process_env(CTX))
        self.assertNotIn('sudo', ' '.join(popen.call_args.args[0]))
        stop.assert_called_once_with(CTX, 'sha256:' + 'f' * 64)
        worker.terminate.assert_not_called()

    def test_probe_final_readback_occurs_after_supervisor_exit_and_before_slice_stop(self):
        order = []
        image = 'sha256:' + 'f' * 64
        def command(argv, **kwargs):
            if argv[:3] == P.DOCKER + ['image']:
                return subprocess.CompletedProcess(argv, 0, (image + '\n').encode())
            self.assertIn('--slice=' + P.names(CTX)[0], argv)
            self.assertNotIn('--property=MemoryMax=2560000000', argv)  # Limit is the parent slice.
            order.append('supervisor-exited')
            return subprocess.CompletedProcess(argv, 0, json.dumps({'observedImageId': image}).encode())
        def privileged(action, ctx): order.append(action)
        def read(ctx, inode, **kwargs):
            self.assertTrue(kwargs['empty']); order.append('empty-readback'); return sample()
        with patch.object(P, 'command', side_effect=command), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P, 'privileged', side_effect=privileged), patch.object(P, 'identity', return_value=(1, 2)), \
                patch.object(P, 'read_parent', side_effect=read):
            result = P.probe(CTX)
        self.assertEqual(order, ['prepare', 'empty-readback', 'supervisor-exited', 'empty-readback', 'remove'])
        self.assertEqual(result['status'], 'PASS_PARENT_TOPOLOGY_ONLY_START_BLOCKED')
        for flag in ('executionAuthority', 'end500Acceptance', 'mock500Acceptance', 'commonLifetimeMemoryAccepted',
                     'fullRestoreCapacityAccepted', 'controllerStarted', 'databaseStarted'):
            self.assertIs(result[flag], False)

    def test_failed_final_readback_never_passes_but_still_stops_owned_slice(self):
        image = 'sha256:' + 'f' * 64
        def command(argv, **kwargs):
            raw = (image + '\n').encode() if argv[:3] == P.DOCKER + ['image'] else json.dumps({'observedImageId': image}).encode()
            return subprocess.CompletedProcess(argv, 0, raw)
        with patch.object(P, 'command', side_effect=command), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P, 'privileged') as privileged, patch.object(P, 'identity', return_value=(1, 2)), \
                patch.object(P, 'read_parent', side_effect=[sample(), P.ProbeError('fixed')]):
            with self.assertRaises(P.ProbeError): P.probe(CTX)
        self.assertEqual([c.args[0] for c in privileged.call_args_list], ['prepare', 'remove'])

    def test_real_worker_route_is_fixed_sleep_and_observes_root_client_and_container(self):
        resources = Mock(); resources.sample.return_value = sample()
        image = 'sha256:' + 'f' * 64
        value = {'running': True, 'parent': P.names(CTX)[0], 'memory': P.R.LIMIT,
                 'swap': P.R.LIMIT, 'network': 'none', 'image': image, 'pid': 22222, 'id': 'b' * 64,
                 'labels': P.container_labels(CTX)}
        wait = Mock(pid=33333); wait.wait.return_value = 0
        def command(argv, **kwargs): return subprocess.CompletedProcess(argv, 0, (image + '\n').encode())
        with patch.object(P.os, 'getuid', return_value=1000), patch.object(P.os, 'getgid', return_value=1000), \
                patch.object(P.os, 'getgroups', return_value=[987]), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P.R, 'observe', return_value=resources), patch.object(P, 'command', side_effect=command) as commands, \
                patch.object(P, 'inspect', side_effect=[None, value]), patch.object(P.subprocess, 'Popen', return_value=wait), \
                patch.object(P, 'stop_container') as stop:
            result = P.worker(CTX)
        argv = commands.call_args_list[1].args[0]
        for flag in ('--pull=never', '--network=none', '--read-only', '--memory=2560000000',
                     '--memory-swap=2560000000', '--cgroup-parent=' + P.names(CTX)[0], '--entrypoint=/bin/sleep'):
            self.assertIn(flag, argv)
        self.assertEqual(argv[-2:], [P.IMAGE, '90'])
        resources.check_pid.assert_any_call(os.getppid())
        resources.check_pid.assert_any_call(22222, 'b' * 64)
        resources.check_pid.assert_any_call(33333)
        stop.assert_called_once()
        self.assertEqual(result['workerSupplementaryGroups'], [987])

    def test_colliding_container_with_any_missing_owner_binding_is_never_stopped(self):
        image = 'sha256:' + 'f' * 64
        valid = {'id': 'b' * 64, 'labels': P.container_labels(CTX), 'parent': P.names(CTX)[0],
                 'image': image, 'running': True, 'pid': 22222}
        for key, wrong in (('id', 'unknown'), ('labels', {}), ('parent', 'system.slice'), ('image', 'sha256:' + 'e' * 64)):
            row = {**valid, key: wrong}
            with patch.object(P, 'inspect', return_value=row), patch.object(P, 'command') as command:
                with self.assertRaises(P.ProbeError): P.stop_container(CTX, image)
                command.assert_not_called()

    def test_run_client_timeout_can_only_stop_fresh_labelled_exact_container_id(self):
        image = 'sha256:' + 'f' * 64
        value = {'running': True, 'parent': P.names(CTX)[0], 'image': image, 'pid': 22222,
                 'id': 'b' * 64, 'labels': P.container_labels(CTX)}
        stopped = {**value, 'running': False, 'pid': 0}
        def command(argv, **kwargs):
            if argv[:3] == P.DOCKER + ['run']:
                raise subprocess.TimeoutExpired('fixed', 20)
            return subprocess.CompletedProcess(argv, 0, (image + '\n').encode())
        with patch.object(P.os, 'getuid', return_value=1000), patch.object(P.os, 'getgid', return_value=1000), \
                patch.object(P.os, 'getgroups', return_value=[987]), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P.R, 'observe', return_value=Mock()), \
                patch.object(P, 'inspect', side_effect=[None, value, stopped]), \
                patch.object(P, 'command', side_effect=command) as commands:
            with self.assertRaises(P.ProbeError) as failure: P.worker(CTX)
        self.assertEqual(failure.exception.record['code'], 'COMMAND_TIMEOUT')
        self.assertEqual(failure.exception.record['phase'], 'worker-container-start')
        self.assertEqual(commands.call_args.args[0], P.DOCKER + ['stop', '--time', '5', 'b' * 64])

    def test_preexisting_name_is_rejected_before_run_and_not_cleaned_up(self):
        with patch.object(P.os, 'getuid', return_value=1000), patch.object(P.os, 'getgid', return_value=1000), \
                patch.object(P.os, 'getgroups', return_value=[987]), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P.R, 'observe', return_value=Mock()), patch.object(P, 'inspect', return_value={'id': 'foreign'}), \
                patch.object(P, 'command', return_value=subprocess.CompletedProcess([], 0, ('sha256:' + 'f' * 64).encode())) as command, \
                patch.object(P, 'stop_container') as stop:
            with self.assertRaises(P.ProbeError): P.worker(CTX)
        self.assertEqual(command.call_count, 1)
        stop.assert_not_called()

    def test_outer_term_latches_once_and_cannot_interrupt_cleanup(self):
        with patch.object(P.signal, 'signal') as signal:
            latch = P.StopLatch()
            with self.assertRaises(KeyboardInterrupt): latch.term(P.signal.SIGTERM, None)
            latch.term(P.signal.SIGTERM, None)
            latch.cleaning = True
            latch.term(P.signal.SIGTERM, None)
            latch.close()
        self.assertEqual(signal.call_count, 2)
        with patch.object(P.signal, 'signal'):
            latch = P.StopLatch(); latch.cleaning = True
            latch.term(P.signal.SIGTERM, None)
            self.assertTrue(latch.seen)

    def test_term_during_successful_cleanup_cannot_publish_pass(self):
        def probe(ctx, stop_latch):
            stop_latch.cleaning = True
            stop_latch.term(P.signal.SIGTERM, None)
            return {'status': 'PASS_PARENT_TOPOLOGY_ONLY_START_BLOCKED'}
        argv = ['--probe-parent-only', '--run-id', CTX['runId'], '--expected-commit', CTX['exactCommit']]
        with patch.object(P, 'github_binding'), patch.object(P, 'probe', side_effect=probe), \
                patch.object(P.signal, 'signal'), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(P.main(argv), 1)
        self.assertEqual(json.loads(out.getvalue())['status'], 'FAIL_OR_UNKNOWN_PARENT_PROBE_START_BLOCKED')

    def test_outside_reader_rejects_parent_replacement_and_live_owned_children(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); value = sample()
            files = {'memory.max': value['configuredLimit'], 'memory.swap.max': '0',
                     'memory.peak': str(value['kernelLifetimePeakBytes']), 'memory.current': str(value['currentBytes']),
                     'memory.swap.current': '0', 'memory.events': '\n'.join(k + ' 0' for k in value['events']),
                     'cgroup.events': 'populated 0\nfrozen 0'}
            for name, raw in files.items(): (base / name).write_text(raw)
            s = base.stat(); inode = (s.st_dev, s.st_ino)
            with patch.object(P.R, '_kernel_directory', side_effect=lambda _: os.open(base, os.O_RDONLY | os.O_DIRECTORY)):
                self.assertEqual(P.read_parent(CTX, inode, empty=True), value)
                with self.assertRaises(P.ProbeError): P.read_parent(CTX, (0, 0), empty=True)
                (base / 'cgroup.events').write_text('populated 1\nfrozen 0')
                with self.assertRaises(P.ProbeError): P.read_parent(CTX, inode, empty=True)

    def test_cleanup_rejects_foreign_or_replaced_unit_before_systemctl(self):
        with tempfile.TemporaryDirectory() as tmp:
            units = Path(tmp); file = units / P.names(CTX)[0]; file.write_bytes(b'foreign'); file.chmod(0o600)
            with patch.object(P, 'UNIT_ROOT', units), patch.object(P.os, 'getuid', return_value=0), \
                    patch.object(P, 'command') as command:
                with self.assertRaises(P.ProbeError): P.remove_parent(CTX)
                command.assert_not_called()
            self.assertTrue(file.exists())

    def test_closed_internal_failure_preserves_actual_phase_and_exit_only(self):
        row = {'phase': 'parent-start', 'code': 'COMMAND_FAILED', 'exitCode': 1, 'via': []}
        raw = json.dumps({'w15ParentProbeFailure': row}).encode()
        P.phase('outer-prepare')
        with patch.object(P.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, raw)):
            with self.assertRaises(P.ProbeError) as failure: P.command(['fixed'])
        self.assertEqual(failure.exception.record, {**row, 'via': ['outer-prepare']})
        for bad in (b'/private/SECRET', b'{"error":"SECRET"}',
                    json.dumps({'w15ParentProbeFailure': {**row, 'phase': '/private/SECRET'}}).encode(),
                    json.dumps({'w15ParentProbeFailure': {**row, 'code': 'SECRET'}}).encode(),
                    json.dumps({'w15ParentProbeFailure': {**row, 'exitCode': True}}).encode(),
                    json.dumps({'w15ParentProbeFailure': {**row, 'extra': 'SECRET'}}).encode()):
            with patch.object(P.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, bad)):
                with self.assertRaises(P.ProbeError) as failure: P.command(['fixed'])
            self.assertEqual(failure.exception.record['phase'], 'outer-prepare')
            self.assertNotIn('SECRET', json.dumps(failure.exception.record))

    def test_internal_errors_publish_only_allowlisted_fixed_fields(self):
        def prepare(ctx):
            P.phase('parent-unit-write')
            raise PermissionError('/private/SECRET')
        argv = ['--internal', 'prepare', '--run-id', CTX['runId'], '--expected-commit', CTX['exactCommit'], '--nonce', CTX['nonce']]
        with patch.object(P, 'github_binding'), patch.object(P, 'prepare_parent', side_effect=prepare), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(P.main(argv), 1)
        row = json.loads(out.getvalue())['w15ParentProbeFailure']
        self.assertEqual(row, {'phase': 'parent-unit-write', 'code': 'FILESYSTEM_ACCESS_DENIED', 'exitCode': None, 'via': []})
        self.assertNotIn('SECRET', out.getvalue())

    def test_fixed_worker_loader_reports_unreadable_script_without_traceback_or_path(self):
        result = subprocess.run([sys.executable, '-B', '-c', P.WORKER_LOADER,
                                 '/fictional-w15-nonexistent-private-SECRET/entry.py'],
                                env=P.ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                stdin=subprocess.DEVNULL, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr, b'')
        P.phase('supervisor-worker')
        row = P.child_failure(result.stdout)
        self.assertEqual(row['phase'], 'worker-load')
        self.assertEqual(row['code'], 'WORKER_SOURCE_UNAVAILABLE')
        self.assertNotIn('SECRET', result.stdout.decode())

    def test_cleanup_failure_cannot_replace_actual_outer_first_failure(self):
        image = 'sha256:' + 'f' * 64
        def privileged(action, ctx):
            if action == 'remove': raise P.ProbeError(code='COMMAND_FAILED', exit_code=1)
        def read(ctx, inode, **kwargs):
            P.phase('outer-initial-readback')
            raise PermissionError('/private/SECRET')
        with patch.object(P, 'command', return_value=subprocess.CompletedProcess([], 0, (image + '\n').encode())), \
                patch.object(P, 'socket_gid', return_value=987), patch.object(P, 'identity', return_value=(1, 2)), \
                patch.object(P, 'privileged', side_effect=privileged), patch.object(P, 'read_parent', side_effect=read):
            with self.assertRaises(P.ProbeError) as failure: P.probe(CTX)
        self.assertEqual(failure.exception.record['phase'], 'outer-initial-readback')
        self.assertEqual(failure.exception.record['code'], 'FILESYSTEM_ACCESS_DENIED')

    def test_worker_termination_failure_preserves_supervisor_first_failure(self):
        child = Mock(pid=54321)
        child.poll.return_value = None
        child.terminate.side_effect = ProcessLookupError('do-not-publish')
        with patch.object(P.os, 'getuid', return_value=0), patch.object(P, 'socket_gid', return_value=987), \
                patch.object(P, 'identity', return_value=(1, 2)), patch.object(P, 'read_parent'), \
                patch.object(P, 'command', return_value=subprocess.CompletedProcess([], 0, ('sha256:' + 'f' * 64).encode())), \
                patch.object(P, 'inspect', return_value=None), \
                patch.object(P.Path, 'read_text', return_value='0::/' + P.names(CTX)[0] + '/control.service\n'), \
                patch.object(P.subprocess, 'Popen', return_value=child), \
                patch.object(P.time, 'monotonic', side_effect=[0, 61]):
            with self.assertRaises(P.ProbeError) as failure: P.supervise(CTX)
        self.assertEqual(failure.exception.record['phase'], 'supervisor-worker')
        self.assertEqual(failure.exception.record['code'], 'CHECK_REJECTED')
        self.assertNotIn('do-not-publish', json.dumps(failure.exception.record))


if __name__ == '__main__':
    unittest.main()
