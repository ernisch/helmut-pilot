"""Only new Mock runner seams; all processes, resources and worker data fictional."""
import sys
sys.dont_write_bytecode = True
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('w15_mock_runner_checks', Path(__file__).with_name('mock500_runner.py'))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
CANARY = 'FICTIONAL_PRIVATE_VALUE_DO_NOT_PUBLISH'


def request(full=False):
    value = {'schema': 'helmut-w15-runner-request/1',
        'mode': 'mock500-full-gated' if full else 'mock500-runner-synthetic', 'exactCommit': 'a' * 40,
        'runId': '12345678901', 'runAttempt': 1, 'nonce': '123e4567-e89b-42d3-a456-426614174000',
        'branch': R.BRANCH if full else R.SYNTHETIC_BRANCH, 'imageId': 'sha256:' + 'b' * 64,
        'nodeSource': '/FICTIONAL/node', 'postgrestSource': '/FICTIONAL/postgrest',
        'sourceQualification': {}, 'approval': {}, 'limits': dict(R.LIMITS),
        'maximumWallSeconds': 12600 if full else 300, 'bindings': {}}
    if full:
        record = {'raw': 'FICTIONAL_PUBLIC_RECORD', 'sha256': 'c' * 64}
        value['bindings'] = {'end500Acceptance': dict(record), 'compatibilityBridge': dict(record),
            'inputBindingSHA256': 'd' * 64, 'additionalAssetBytes': 1, 'approvedEnd500Commit': 'e' * 40}
    return value


def private():
    return {'cipherIndex': CANARY, 'keyB64': CANARY, 'passphrase': CANARY,
            'eventInputs': {}, 'artifactCredentials': {}}


def result(value):
    synthetic = value['mode'] == 'mock500-runner-synthetic'
    return {'status': R.STATUS[value['mode']], 'mode': value['mode'],
        **{key: value[key] for key in ('exactCommit', 'runId', 'runAttempt')},
        'syntheticQualification': synthetic, 'originalTransferPerformed': not synthetic,
        'profiles': 0 if synthetic else 500, 'activeProfiles': 0, 'units': 0 if synthetic else 500,
        'providerPhases': 0 if synthetic else 1000, 'results': 0 if synthetic else 1500,
        'controls': 0 if synthetic else 8000, 'backupRoundtripVerified': not synthetic,
        'executionAuthority': False, 'mock500Acceptance': False, 'end500Acceptance': False}


def sample(peak=1234):
    return {'configuredLimit': '2048000000', 'swapMaximum': '0', 'kernelLifetimePeakBytes': peak,
            'currentBytes': 123, 'swapCurrentBytes': 0,
            'events': {key: 0 for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class MockRunnerChecks(unittest.TestCase):
    def test_modes_branches_limits_and_private_payload_are_separate(self):
        R.validate_request(request(), {})
        R.validate_request(request(True), private())
        cases = []
        value = request(); value['limits'] = dict(R.S.LIMITS); cases.append((value, {}))
        value = request(True); value['branch'] = R.SYNTHETIC_BRANCH; cases.append((value, private()))
        value = request(); value['bindings'] = {'end500Acceptance': CANARY}; cases.append((value, {}))
        value = request(); cases.append((value, private()))
        value = request(True); value['bindings']['additionalAssetBytes'] = True; cases.append((value, private()))
        value = request(); value['maximumWallSeconds'] = 12600; cases.append((value, {}))
        for value, payload in cases:
            with self.subTest(mode=value['mode']), self.assertRaises(R.MockRunnerError):
                R.validate_request(value, payload)
        self.assertEqual(R.S.LIMITS['comparisonBudgetBytes'], 2560000000)

    def test_closed_receipt_rejects_claims_paths_and_bool_as_counter(self):
        for full in (False, True):
            value = request(full); receipt = result(value)
            self.assertEqual(R.validate_public_result(receipt, value), receipt)
            for key, content in (('mock500Acceptance', True), ('profiles', False), ('path', CANARY)):
                malformed = dict(receipt); malformed[key] = content
                with self.assertRaises(R.MockRunnerError): R.validate_public_result(malformed, value)

    def test_original_clock_is_not_reset_for_service_or_late_stages(self):
        value = request(True)
        with patch.object(R.time, 'monotonic', return_value=150):
            argv = R._service_argv(value, Path('/FICTIONAL/ipc'), 100)
        self.assertIn('--property=RuntimeMaxSec=12550', argv)
        self.assertIn('--slice=' + R.P.names(R.S._ctx(value))[0], argv)
        self.assertNotIn(CANARY, ' '.join(argv))
        self.assertNotIn('--property=MemoryMax=2560000000', argv)
        with self.assertRaises(R.MockRunnerError):
            R._started(datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), time.monotonic() - 301, 300)

    def test_fixed_worker_uses_staged_public_pin_uid_and_private_pipe(self):
        value = request()
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-worker-') as tmp:
            path = Path(tmp) / 'scripts/w15-github/mock500_workflow.py'; path.parent.mkdir(parents=True)
            raw = ('def run_worker(manifest, private_payload):\n return ' + repr(result(value)) + '\n').encode()
            path.write_bytes(raw)
            manifest = {**value, 'stagedRepo': tmp, 'runnerTemp': tmp + '/worker-temp',
                'sourcePins': {'scripts/w15-github/mock500_workflow.py': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
            sender, receiver = Mock(), Mock()
            with patch.object(R.S, '_close_stdio'), patch.dict(os.environ, {}, clear=True), \
                    patch.object(R.os, 'setgroups') as groups, patch.object(R.os, 'setgid') as gid, \
                    patch.object(R.os, 'setuid') as uid, patch.object(R.os, 'getuid', return_value=1000), \
                    patch.object(R.os, 'getgid', return_value=1000), patch.object(R.os, 'getgroups', return_value=[987]), \
                    patch.object(R.P.P, 'StopLatch', return_value=SimpleNamespace(seen=False, close=Mock())):
                with self.assertRaises(SystemExit) as done:
                    R._fork_worker(manifest, {}, sender, receiver, 987)
            self.assertEqual(done.exception.code, 0)
            self.assertEqual(json.loads(sender.send_bytes.call_args.args[0]), {'ok': True, 'result': result(value)})
            groups.assert_called_once_with([987]); gid.assert_called_once_with(1000); uid.assert_called_once_with(1000)
            receiver.close.assert_called_once(); sender.close.assert_called_once()

    def test_safe_failure_has_only_whitelisted_checkpoint(self):
        failure = R._failure({'ok': False, 'phase': 'worker', 'workerPhase': 'receiver-key-import'})
        self.assertEqual(failure.safe_failure, {'phase': 'worker', 'worker': {'phase': 'receiver-key-import'}})
        for value in ({'ok': False, 'phase': 'worker', 'workerPhase': CANARY},
                      {'ok': False, 'phase': 'worker', 'message': CANARY}):
            with self.assertRaises(R.MockRunnerError): R._failure(value)

    def test_supervisor_keeps_original_clock_through_staging_and_owned_worker_exit(self):
        value = request(); ctx = R.S._ctx(value)
        started_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); started_mono = time.monotonic()
        manifest = {**value, 'runnerTemp': '/FICTIONAL/worker-temp', 'stagedRepo': '/FICTIONAL/repo',
            'sourcePins': {'scripts/w15-github/mock500_workflow.py': {'bytes': 1, 'sha256': 'f' * 64}},
            'checkoutBytes': 1, 'binaryBytes': 2}
        read = Mock(return_value=sample())
        def stage(request, guard):
            self.assertGreater(read.call_count, 0)
            guard(); return manifest
        child = Mock(pid=54321, exitcode=0); child.is_alive.return_value = False
        receiver, sender, fork = Mock(), Mock(), Mock()
        receiver.poll.return_value = True
        receiver.recv_bytes.return_value = json.dumps({'ok': True, 'result': result(value)}).encode()
        fork.Pipe.return_value = (receiver, sender); fork.Process.return_value = child
        with patch.object(R.os, 'getuid', return_value=0), patch.object(R.P, 'identity', return_value=(1, 2)), \
                patch.object(R.P.P.R, 'membership', return_value='/' + R.P.names(ctx)[0] + '/service'), \
                patch.object(R.P, 'read_parent', read), patch.object(R.S, '_identity_available', return_value=987), \
                patch.object(R.S, '_stage', side_effect=stage), \
                patch.object(R.multiprocessing, 'get_context', return_value=fork), \
                patch.object(R.S, '_members', return_value={os.getpid()}):
            observed = R.supervise(value, {}, started_at, started_mono)
        worker_manifest = fork.Process.call_args.kwargs['args'][0]
        self.assertEqual(worker_manifest['startedAtUTC'], started_at)
        self.assertEqual(worker_manifest['startedMonotonic'], started_mono)
        self.assertEqual(worker_manifest['bindings'], {})
        self.assertTrue(observed['workerExited'])
        child.join.assert_called_once_with(timeout=5)
        child.terminate.assert_not_called(); receiver.close.assert_called_once()

    def test_internal_service_keeps_private_stdin_open_while_closing_log_descriptors(self):
        value = request(); ctx = R.S._ctx(value)
        started_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); started_mono = time.monotonic()
        envelope = {'request': value, 'private': {}, 'startedAtUTC': started_at, 'startedMonotonic': started_mono}
        stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(envelope).encode()))
        argv = ['--internal-supervisor', '--expected-commit', ctx['exactCommit'], '--run-id', ctx['runId'],
                '--nonce', ctx['nonce'], '--ipc-dir', '/FICTIONAL/ipc']
        latch = SimpleNamespace(seen=False, close=Mock())
        with patch.object(R.os, 'getuid', return_value=0), patch.object(R.os, 'open', return_value=999), \
                patch.object(R.os, 'dup2') as dup, patch.object(R.os, 'close'), \
                patch.object(R.sys, 'stdin', stdin), patch.object(R.P.P, 'StopLatch', return_value=latch), \
                patch.object(R, 'supervise', return_value={}) as supervise, patch.object(R.S, '_send_result') as send:
            self.assertEqual(R.main(argv), 0)
        self.assertEqual([call.args[1] for call in dup.call_args_list], [1, 2])
        supervise.assert_called_once_with(value, {}, started_at, started_mono)
        send.assert_called_once_with('/FICTIONAL/ipc', ctx, {'ok': True, 'result': {}})

    def launch_fixture(self, failed_final=False):
        value = request(); order = []; process = Mock(); process.wait.return_value = 0; process.poll.return_value = 0
        roles = {'worker': result(value), 'workerExited': True, 'checkoutFiles': 2, 'checkoutBytes': 100,
                 'binaryBytes': 200, 'dockerSocketGID': 987, 'workerUID': 1000, 'workerGID': 1000}
        def privileged(mode, ctx): order.append(mode)
        def read(ctx, inode, **kwargs):
            self.assertTrue(kwargs['empty']); order.append('empty-readback')
            if failed_final and order.count('empty-readback') == 2: raise ValueError(CANARY)
            return sample(1234 + order.count('empty-readback'))
        def receive(*args): order.append('service-exited'); return {'ok': True, 'result': roles}
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-launch-') as tmp:
            with patch.object(R, 'github_binding'), patch.object(R.S, '_identity_available', return_value=987), \
                    patch.object(R.S, '_roots', return_value=(Path(tmp) / 'worker', Path(tmp) / 'ipc')), \
                    patch.object(R.P, 'privileged', side_effect=privileged), patch.object(R.P, 'identity', return_value=(1, 2)), \
                    patch.object(R.P, 'read_parent', side_effect=read), patch.object(R.subprocess, 'Popen', return_value=process) as spawn, \
                    patch.object(R.S, '_receive_result', side_effect=receive), patch.object(R.S, '_command') as command:
                if failed_final:
                    with self.assertRaises(R.MockRunnerError) as failure: R.launch(value, {})
                    self.assertNotIn(CANARY, str(failure.exception))
                    command.assert_called_once()
                    receipt = None
                else:
                    receipt = R.launch(value, {})
                    command.assert_not_called()
                self.assertEqual(spawn.call_args.kwargs['stdout'], R.subprocess.DEVNULL)
                self.assertEqual(spawn.call_args.kwargs['stderr'], R.subprocess.DEVNULL)
                envelope = json.loads(process.stdin.write.call_args.args[0])
                self.assertEqual(envelope['private'], {})
                self.assertGreater(envelope['startedMonotonic'], 0)
        return order, receipt

    def test_final_empty_readback_follows_service_exit_before_parent_removal(self):
        order, receipt = self.launch_fixture()
        self.assertEqual(order, ['prepare', 'empty-readback', 'service-exited', 'empty-readback', 'remove'])
        self.assertTrue(receipt['ownedChildrenExited'])
        self.assertEqual(receipt['finalCommonParentAfterOwnedExits']['configuredLimit'], '2048000000')
        self.assertFalse(receipt['mock500Acceptance'])

    def test_failed_final_readback_never_returns_pass_but_removes_owned_parent(self):
        order, receipt = self.launch_fixture(True)
        self.assertIsNone(receipt)
        self.assertEqual(order, ['prepare', 'empty-readback', 'service-exited', 'empty-readback', 'remove'])


if __name__ == '__main__': unittest.main()
