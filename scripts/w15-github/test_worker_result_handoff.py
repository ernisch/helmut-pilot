"""Real local IPC for fictional HOST results; no database, original or cgroup.

Run as UID/GID 1000 or root (root drops the child to UID/GID 1000), through
``node scripts/lokal.js -- [sudo -n] python3 -B ...``.  The real staged public
validators stay intact; only run_worker is replaced by a fictional completion.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import struct
import tempfile
import time
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('w15_handoff_runner', HERE / 'runner_start.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
COMMIT = 'a' * 40
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'


def _child(manifest, sender, receiver, original_script):
    # An already UID1000 process cannot repeat root's setgroups operation.
    # Neutralize only identity setup after checking the real UID/GID.  A primary
    # GID1000 with no supplemental groups has the same fixture file access as
    # GID1000 also listed supplementally; the kernel identity is never mocked.
    # The root branch below performs the real root -> 1000 privilege drop.
    with patch.object(R, 'SCRIPT', original_script):
        if os.getuid() == os.getgid() == 1000 and os.getgroups() in ([], [1000]):
            def same_ids(value):
                if value != 1000:
                    raise AssertionError('FICTIONAL_IDENTITY_DRIFT')
            def same_groups(value):
                if value != [1000]:
                    raise AssertionError('FICTIONAL_GROUP_DRIFT')
            with patch.object(R.os, 'setgroups', same_groups), \
                    patch.object(R.os, 'setgid', same_ids), patch.object(R.os, 'setuid', same_ids), \
                    patch.object(R.os, 'getgroups', return_value=[1000]):
                R._fork_worker(manifest, {}, sender, receiver, 1000)
        else:
            R._fork_worker(manifest, {}, sender, receiver, 1000)


class WorkerResultHandoff(unittest.TestCase):
    def fixture(self, *, unreadable_original=False, false_gate=False, actual_checkout_probe=False):
        self.assertTrue(os.getuid() == 0 or
                        os.getuid() == os.getgid() == 1000 and os.getgroups() in ([], [1000]),
                        'Run this small UID-bound suite as root or exact UID/GID/groups 1000.')
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-handoff-')
        base = Path(temp.name)
        base.chmod(0o755)  # Only fictional public code; permit the dropped child.
        original, staged = base / 'original', base / 'staged'
        public = ('restore_workflow.py', 'runner_diagnostics.py', 'common_resources.py')
        for root in (original, staged):
            directory = root / 'scripts/w15-github'
            directory.mkdir(parents=True)
            for name in public:
                shutil.copyfile(HERE / name, directory / name)
            for path in [root, root / 'scripts', directory]:
                path.chmod(0o755)
            for path in directory.iterdir():
                path.chmod(0o644)
        script = original / 'scripts/w15-github/runner_start.py'
        shutil.copyfile(HERE / 'runner_start.py', script)
        script.chmod(0o644)
        worker = staged / 'scripts/w15-github/restore_workflow.py'
        # Existing _result/validate_public_result/validate_functional_results
        # remain byte-identical.  No admission or original action is invoked.
        probe = '''
    observed = dict(uid=os.getuid(), sourceReadable=False, errorClass=None)
    try:
        with open(CHECKOUT_SOURCE, 'rb') as stream:
            stream.read(1)
        observed['sourceReadable'] = True
    except OSError as error:
        observed['errorClass'] = type(error).__name__
    fd = os.open(PROBE_DESTINATION, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(observed, stream, sort_keys=True)
'''.replace('CHECKOUT_SOURCE', repr(str(HERE / 'restore_workflow.py'))).replace(
            'PROBE_DESTINATION', repr(str(staged / 'PROBE.json'))) if actual_checkout_probe else ''
        stub = '''
# Fictional local handoff fixture only; not an operational worker.
def run_worker(manifest, private_payload, *, phase_observer=None, **unused):
ACTUAL_CHECKOUT_PROBE
    if phase_observer is not None:
        phase_observer('closure')
    proof = dict(authCAS=500, usageRows=6000, nativePostimages=3501,
        activeProfiles=0, exportCompleted=EXPORT_COMPLETED,
        ownedServicesStopped=True, authenticatedRemoteReadback=True,
        secondRecoveryIntegrity=True)
    return _result(manifest, functional_results=proof)
'''.replace('EXPORT_COMPLETED', repr(not false_gate)).replace('ACTUAL_CHECKOUT_PROBE', probe)
        with worker.open('ab') as stream:
            stream.write(stub.encode('ascii'))
        if os.getuid() == 0:
            for directory, _, files in os.walk(staged):
                os.chown(directory, 1000, 1000)
                for name in files:
                    os.chown(Path(directory) / name, 1000, 1000)
        if unreadable_original:
            original.chmod(0)  # Real access denial, never a mocked loader.
        def clean():
            original.chmod(0o755)
            temp.cleanup()
        self.addCleanup(clean)
        raw = worker.read_bytes()
        manifest = dict(mode=R.HOST_CAPACITY, exactCommit=COMMIT,
            runId='123456789', runAttempt=1, nonce=NONCE, branch=R.BRANCH,
            stagedRepo=str(staged), runnerTemp=str(base / 'worker-temp'),
            sourcePins={'scripts/w15-github/restore_workflow.py':
                        {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}})
        return manifest, HERE / 'runner_start.py' if actual_checkout_probe else script

    def handoff(self, **options):
        manifest, script = self.fixture(**options)
        context = multiprocessing.get_context('fork')
        receiver, sender = context.Pipe(duplex=False)
        child = context.Process(target=_child, args=(manifest, sender, receiver, script))
        observed = {}
        try:
            response, cleanup = R._monitor_child(child, receiver, sender,
                lambda: None, time.monotonic() + 10, observed=observed)
            failure = None
        except R.RunnerStartError as error:
            response, failure, cleanup = None, error.safe_failure, error.cleanup
        self.assertEqual(observed.get('name'), 'closure')
        self.assertEqual(cleanup['workerExited'], 'PASS')
        self.assertEqual(cleanup['workerIPCClosed'], 'PASS')
        return response, failure, child.exitcode, manifest

    def test_readable_original_control_completes_real_pipe(self):
        response, failure, exitcode, _ = self.handoff()
        self.assertIsNone(failure)
        self.assertEqual(exitcode, 0)
        self.assertTrue(response['ok'])
        self.assertEqual(response['result']['diagnosticResults']['authCAS'], 500)

    def test_staged_result_survives_unreadable_original_checkout(self):
        response, failure, exitcode, _ = self.handoff(unreadable_original=True)
        self.assertIsNone(failure, json.dumps(failure, sort_keys=True))
        self.assertEqual(exitcode, 0)
        self.assertTrue(response['ok'])

    def test_false_completion_gate_remains_rejected(self):
        response, failure, exitcode, _ = self.handoff(false_gate=True)
        self.assertIsNone(response)
        self.assertEqual(exitcode, 1)
        self.assertEqual(failure['worker']['phase'], 'closure')

    def test_actual_public_checkout_access_observed_under_real_worker_uid(self):
        response, failure, exitcode, manifest = self.handoff(actual_checkout_probe=True)
        self.assertIsNone(failure, json.dumps(failure, sort_keys=True))
        self.assertEqual(exitcode, 0)
        self.assertTrue(response['ok'])
        probe = Path(manifest['stagedRepo']) / 'PROBE.json'
        self.assertEqual(probe.stat().st_mode & 0o777, 0o600)
        observed = json.loads(probe.read_bytes())
        self.assertEqual(set(observed), {'uid', 'sourceReadable', 'errorClass'})
        self.assertEqual(observed['uid'], 1000)
        self.assertIs(type(observed['sourceReadable']), bool)
        if observed['sourceReadable']:
            self.assertIsNone(observed['errorClass'])
        else:
            self.assertIs(type(observed['errorClass']), str)
            self.assertTrue(observed['errorClass'])
        # Public code only: no path, source byte, exception text or private input.
        print('::notice title=W15 UID1000 source access::W15_PUBLIC_CHECKOUT_UID1000_PROBE '
              + json.dumps(observed, sort_keys=True), flush=True)

    def test_result_over_checkpoint_limit_crosses_actual_pipe(self):
        response, failure, _, manifest = self.handoff()
        self.assertIsNone(failure)
        # JSON whitespace increases wire size without relaxing its closed keys.
        raw = R._encode(response) + b' ' * 2048
        self.assertGreater(len(raw), 1024)
        self.assertLess(len(raw), R.MAX_RESULT)
        receiver, sender = multiprocessing.get_context('fork').Pipe(duplex=False)
        try:
            sender.send_bytes(raw)
            actual = R._read_worker_response(receiver, time.monotonic() + 2)
            self.assertEqual(actual, response)
            self.assertEqual(R._worker_result(actual['result'], manifest), response['result'])
        finally:
            sender.close()
            receiver.close()

    def test_oversized_result_frame_stays_rejected(self):
        receiver, sender = multiprocessing.get_context('fork').Pipe(duplex=False)
        try:
            # A too-large advertised frame is rejected before allocating or
            # waiting for its body.  No blocking 64-KiB pipe write is necessary.
            os.write(sender.fileno(), struct.pack('!i', R.MAX_RESULT + 1))
            with self.assertRaises(R.RunnerStartError) as rejected:
                R._read_worker_response(receiver, time.monotonic() + 2)
            self.assertEqual(rejected.exception.runner['reason'], 'WORKER_IPC_REJECTED')
        finally:
            sender.close()
            receiver.close()


if __name__ == '__main__':
    unittest.main()
