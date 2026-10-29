"""New bootstrap seams using only fictional files and mocked privileged work."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_runner_start_checks', Path(__file__).with_name('runner_start.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
COMMIT = 'a' * 40
REQUEST = {'schema': 'helmut-w15-runner-request/1', 'mode': 'end500-restore-synthetic',
           'exactCommit': COMMIT, 'runId': '123456789', 'runAttempt': 1,
           'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8', 'branch': R.BRANCH,
           'imageId': 'sha256:' + 'b' * 64, 'nodeSource': '/FICTIONAL/node',
           'postgrestSource': '/FICTIONAL/postgrest', 'sourceQualification': {}, 'approval': {},
           'limits': R.LIMITS, 'maximumWallSeconds': 300}


def worker_result(request=REQUEST):
    synthetic = request['mode'] == 'end500-restore-synthetic'
    return {'status': R.WORKER_STATUS[request['mode']],
            **{key: request[key] for key in ('mode', 'exactCommit', 'runId', 'runAttempt')},
            'verifiedFiles': 0 if synthetic else 12, 'verifiedBytes': 0 if synthetic else 242570240,
            'isolatedRestoreObserved': not synthetic, 'end500BodyCompleted': request['mode'] == 'end500-full-gated',
            'originalTransferPerformed': not synthetic, 'backupRoundtripVerified': not synthetic,
            'sourceQualificationBound': True, 'syntheticQualification': synthetic,
            **{key: False for key in R.WORKER_FALSE}}


class RunnerStartChecks(unittest.TestCase):
    def root(self):
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-bootstrap-')
        self.addCleanup(temp.cleanup)
        return Path(temp.name)

    def test_fixed_request_modes_limits_and_private_payload_boundaries(self):
        self.assertIs(R.validate_request(REQUEST, {}), REQUEST)
        for field, value in (('maximumWallSeconds', 3600), ('limits', {**R.LIMITS, 'swapBytes': 1}),
                             ('runAttempt', 2), ('branch', 'refs/heads/main'), ('mode', 'run-anything')):
            with self.subTest(field=field), self.assertRaises(Exception):
                R.validate_request({**REQUEST, field: value}, {})
        with self.assertRaises(Exception):
            R.validate_request(REQUEST, {'passphrase': 'FICTIONAL-PRIVATE'})
        private = {'cipherIndex': 'FICTIONAL-CIPHER', 'keyB64': 'FICTIONAL-KEY', 'passphrase': 'FICTIONAL-PASS',
                   'eventInputs': {}, 'artifactCredentials': {}}
        for mode in ('end500-restore-gated', 'end500-full-gated'):
            request = {**REQUEST, 'mode': mode, 'maximumWallSeconds': R.WALL[mode]}
            R.validate_request(request, private)
            with self.assertRaises(Exception):
                R.validate_request(request, {})

    def test_service_arguments_have_only_fixed_public_bootstrap_and_no_private_environment(self):
        _, ipc = R._roots(REQUEST)
        argv = R._service_argv(REQUEST, ipc)
        self.assertIn('--slice=' + R.P.names(R._ctx(REQUEST))[0], argv)
        self.assertIn('--property=RuntimeMaxSec=300', argv)
        self.assertIn('--property=KillMode=control-group', argv)
        self.assertIn('--internal-supervisor', argv)
        self.assertNotIn('restore_workflow.py', ' '.join(argv))  # fixed fork only, no arbitrary systemd worker argv
        for word in ('GITHUB_TOKEN', 'HELMUT_W15_RECEIVER', 'passphrase', 'cipherIndex', 'artifactCredentials'):
            self.assertNotIn(word, ' '.join(argv))
        env = R._worker_env({**REQUEST, 'runnerTemp': '/tmp/FICTIONAL-worker'})
        self.assertEqual(env['GITHUB_SHA'], COMMIT)
        self.assertEqual(env['GITHUB_REF'], R.BRANCH)
        self.assertFalse(any('TOKEN' in key or 'SECRET' in key or 'PASSPHRASE' in key for key in env))

    def test_tree_admission_rejects_links_traversal_duplicates_and_budget_overflow(self):
        worker = b'100644 blob ' + b'a' * 40 + b' 4\tscripts/w15-github/restore_workflow.py\0'
        self.assertEqual(len(R._tree_rows(worker)), 1)
        for raw in (worker.replace(b'100644', b'120000'), worker.replace(b'scripts/w15-github/', b'../'),
                    worker + worker, worker.replace(b'scripts/w15-github/', b'.git/')):
            with self.subTest(raw=raw[:15]), self.assertRaises(Exception):
                R._tree_rows(raw)
        with patch.object(R, 'MAX_SOURCE_BYTES', 3), self.assertRaises(Exception):
            R._tree_rows(worker)

    def test_raw_blob_copy_is_filtered_by_git_hash_and_read_back_without_checkout_hooks(self):
        root = self.root()
        data = b'FICTIONAL-RAW-GIT-BLOB\r\n'
        digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest().encode()
        process = SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(digest + b' blob ' + str(len(data)).encode() + b'\n' + data + b'\n'))
        guard = Mock()
        pin = R._copy_blob(process, root, ('lib/module.js', b'100644', digest, len(data)), guard)
        self.assertEqual((root / 'lib/module.js').read_bytes(), data)
        self.assertEqual(pin, {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        self.assertEqual((root / 'lib/module.js').stat().st_mode & 0o777, 0o600)
        self.assertGreater(guard.call_count, 2)
        with self.assertRaises(Exception):
            R._copy_blob(process, root, ('lib/module.js', b'100644', digest, len(data)), guard)

    def test_pinned_public_binary_copy_and_failed_hash_preserve_source_and_partial(self):
        root = self.root()
        source = root / 'source'
        raw = b'FICTIONAL-PUBLIC-BINARY'
        source.write_bytes(raw); source.chmod(0o755)
        expected = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        guard = Mock()
        R._binary(source, root / 'copy', expected, os.getuid(), guard)
        self.assertEqual((root / 'copy').read_bytes(), raw)
        self.assertNotEqual((root / 'copy').stat().st_ino, source.stat().st_ino)
        self.assertEqual((root / 'copy').stat().st_mode & 0o777, 0o700)
        with self.assertRaises(Exception):
            R._binary(source, root / 'bad', {**expected, 'sha256': '0' * 64}, os.getuid(), guard)
        self.assertTrue((root / 'bad').exists())
        self.assertEqual(source.read_bytes(), raw)
        self.assertEqual(source.stat().st_mode & 0o777, 0o755)

    def test_binary_source_symlink_hardlink_and_writable_file_rejected(self):
        root = self.root()
        source = root / 'source'; source.write_bytes(b'X'); source.chmod(0o755)
        pin = {'bytes': 1, 'sha256': hashlib.sha256(b'X').hexdigest()}
        alias = root / 'alias'; alias.symlink_to(source)
        with self.assertRaises(Exception):
            R._binary(alias, root / 'dest', pin, os.getuid(), Mock())
        alias.unlink(); os.link(source, alias)
        with self.assertRaises(Exception):
            R._binary(source, root / 'dest', pin, os.getuid(), Mock())
        alias.unlink(); source.chmod(0o777)
        with self.assertRaises(Exception):
            R._binary(source, root / 'dest', pin, os.getuid(), Mock())
        self.assertFalse((root / 'dest').exists())

    def test_ownership_conversion_touches_only_new_regular_unlinked_files(self):
        base = self.root(); new = base / 'new'; new.mkdir(mode=0o700)
        original = base / 'original'; original.write_bytes(b'UNCHANGED'); original.chmod(0o644)
        (new / 'code').write_bytes(b'PUBLIC')
        with patch.object(R.os, 'chown') as chown:
            self.assertEqual(R._own_new_tree(new), 6)
        self.assertTrue(all(str(call.args[0]).startswith(str(new)) for call in chown.call_args_list))
        self.assertEqual(original.stat().st_mode & 0o777, 0o644)
        os.link(original, new / 'unsafe')
        with patch.object(R.os, 'chown'), self.assertRaises(Exception):
            R._own_new_tree(new)
        self.assertEqual(original.stat().st_mode & 0o777, 0o644)

    def test_stage_builds_private_manifest_and_counts_real_new_bytes(self):
        base = self.root(); top = base / 'new'; original = base / 'original'; original.mkdir(mode=0o700)
        request = copy.deepcopy(REQUEST)
        runtime = copy.deepcopy(R.C.RUNTIME)
        for name in ('node', 'postgrest'):
            raw = ('FICTIONAL-' + name).encode()
            source = original / name; source.write_bytes(raw); source.chmod(0o755)
            request['nodeSource' if name == 'node' else 'postgrestSource'] = str(source)
            runtime[name].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        def copy_repo(request, destination, guard):
            destination.mkdir(mode=0o700)
            (destination / 'public.js').write_bytes(b'PUBLIC')
            (destination / '.git').mkdir(mode=0o700)
            (destination / '.git/HEAD').write_text(COMMIT + '\n')
            guard()
            return {'public.js': {'bytes': 6, 'sha256': hashlib.sha256(b'PUBLIC').hexdigest()}}
        guard = Mock()
        with patch.object(R, 'REPO', original), patch.object(R, '_roots', return_value=(top, base / 'ipc')), \
                patch.object(R, 'copy_committed_repo', side_effect=copy_repo), patch.object(R, '_git', return_value=(COMMIT + '\n').encode()), \
                patch.object(R.C, 'RUNTIME', runtime), patch.object(R.os, 'chown'):
            manifest = R._stage(request, guard)
        self.assertEqual(manifest['schema'], 'helmut-w15-runner-manifest/1')
        self.assertEqual(manifest['checkoutBytes'], 47)
        self.assertEqual(manifest['binaryBytes'], sum(runtime[n]['bytes'] for n in ('node', 'postgrest')))
        self.assertEqual(manifest['parentUnit'], R.P.names(R._ctx(request))[0])
        self.assertNotIn('nodeSource', manifest)
        self.assertNotIn('passphrase', manifest)
        for name in ('worker-temp', 'rollback', 'backup'):
            self.assertEqual((top / name).stat().st_mode & 0o777, 0o700)

    def test_shallow_fetch_recipe_never_hardlinks_uses_alternates_or_checkout_filters(self):
        root = self.root() / 'repo'
        row = ('scripts/w15-github/restore_workflow.py', b'100644', b'a' * 40, 4)
        process = Mock()
        process.wait.return_value = 0; process.poll.return_value = 0
        def git(repo, args, **kwargs):
            if args[:1] in (['rev-parse'],):
                return (COMMIT + '\n').encode()
            return b''
        with patch.object(R, '_git', side_effect=git) as git_call, patch.object(R, '_tree_rows', return_value=[row]), \
                patch.object(R, '_copy_blob', return_value={'bytes': 4, 'sha256': 'b' * 64}), \
                patch.object(R.subprocess, 'Popen', return_value=process):
            R.copy_committed_repo(REQUEST, root, Mock())
        commands = [call.args[1] for call in git_call.call_args_list]
        fetch = next(args for args in commands if 'fetch' in args)
        self.assertIn('--depth=1', fetch)
        self.assertIn('--no-recurse-submodules', fetch)
        self.assertIn(R.REPO.as_uri(), fetch)
        self.assertFalse(any('checkout' in args or 'clone' in args or '--shared' in args for args in commands))

    def test_worker_identity_drop_closed_output_fixed_code_and_private_pipe(self):
        root = self.root(); script = root / 'scripts/w15-github/restore_workflow.py'
        script.parent.mkdir(parents=True)
        raw = ('def run_worker(manifest, private_payload):\n return ' + repr(worker_result()) + '\n').encode()
        script.write_bytes(raw)
        manifest = {**REQUEST, 'stagedRepo': str(root), 'runnerTemp': str(root / 'worker'),
                    'sourcePins': {'scripts/w15-github/restore_workflow.py': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
        sender, receiver = Mock(), Mock()
        with patch.object(R, '_close_stdio') as stdio, patch.dict(R.os.environ, {'UNRELATED_SECRET': 'NEVER_IN_WORKER'}, clear=True), \
                patch.object(R.os, 'setgroups') as groups, patch.object(R.os, 'setgid') as gid, patch.object(R.os, 'setuid') as uid, \
                patch.object(R.os, 'getuid', return_value=1000), patch.object(R.os, 'getgid', return_value=1000), \
                patch.object(R.os, 'getgroups', return_value=[987]), self.assertRaises(SystemExit) as ended:
            R._fork_worker(manifest, {}, sender, receiver, 987)
        self.assertEqual(ended.exception.code, 0)
        stdio.assert_called_once(); groups.assert_called_once_with([987]); gid.assert_called_once_with(1000); uid.assert_called_once_with(1000)
        self.assertTrue(json.loads(sender.send_bytes.call_args.args[0])['ok'])
        receiver.close.assert_called_once(); sender.close.assert_called_once()

    def test_only_closed_context_bound_public_receipt_can_cross_ipc(self):
        result = worker_result()
        self.assertEqual(R._worker_result(result, REQUEST), result)
        for field, value in (('url', 'https://PRIVATE.invalid'), ('passphrase', 'FICTIONAL-PRIVATE'),
                             ('runId', '987654321'), ('executionAuthority', True),
                             ('verifiedFiles', True), ('originalTransferPerformed', True)):
            with self.subTest(field=field), self.assertRaises(Exception):
                R._worker_result({**result, field: value}, REQUEST)
        for mode in ('end500-restore-gated', 'end500-full-gated'):
            request = {**REQUEST, 'mode': mode, 'maximumWallSeconds': R.WALL[mode]}
            R._worker_result(worker_result(request), request)

    def test_worker_failure_phase_is_closed_and_kept_without_exception_text(self):
        failure = R._response_error({'ok': False, 'phase': 'worker', 'workerPhase': 'qualification'})
        self.assertEqual(failure.phase, 'worker')
        self.assertEqual(failure.worker_phase, 'qualification')
        self.assertEqual(failure.safe_failure, {'phase': 'worker', 'worker': {'phase': 'qualification'}})
        for value in ({'ok': False, 'phase': 'worker', 'workerPhase': '/PRIVATE/secret'},
                      {'ok': False, 'phase': 'worker', 'workerPhase': 'qualification', 'message': 'PRIVATE'}):
            with self.assertRaises(Exception):
                R._response_error(value)
        root = self.root(); script = root / 'scripts/w15-github/restore_workflow.py'
        script.parent.mkdir(parents=True)
        raw = b'class WorkflowRejected(Exception):\n phase="qualification"\ndef run_worker(manifest, private_payload):\n raise WorkflowRejected("/PRIVATE/DO_NOT_LOG")\n'
        script.write_bytes(raw)
        manifest = {**REQUEST, 'stagedRepo': str(root), 'runnerTemp': str(root / 'worker'),
                    'sourcePins': {'scripts/w15-github/restore_workflow.py': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
        sender, receiver = Mock(), Mock()
        with patch.object(R, '_close_stdio'), patch.dict(R.os.environ, {}, clear=True), \
                patch.object(R.os, 'setgroups'), patch.object(R.os, 'setgid'), patch.object(R.os, 'setuid'), \
                patch.object(R.os, 'getuid', return_value=1000), patch.object(R.os, 'getgid', return_value=1000), \
                patch.object(R.os, 'getgroups', return_value=[987]), self.assertRaises(SystemExit) as ended:
            R._fork_worker(manifest, {}, sender, receiver, 987)
        self.assertEqual(ended.exception.code, 1)
        response = json.loads(sender.send_bytes.call_args.args[0])
        self.assertEqual(response, {'ok': False, 'phase': 'worker', 'workerPhase': 'qualification'})
        self.assertNotIn('PRIVATE', str(response))

    def test_outer_final_readback_precedes_owned_parent_stop_and_cleanup_failure_closes_ipc(self):
        base = self.root()
        top, ipc = base / 'new', base / 'ipc'
        process, listener = Mock(), Mock()
        process.wait.return_value = 0; process.poll.return_value = 0
        initial = {'kernelLifetimePeakBytes': 10}
        final = {'kernelLifetimePeakBytes': 20}
        events = []
        def read(*args, **kwargs):
            self.assertTrue(kwargs['empty'])
            events.append('read')
            return initial if events.count('read') == 1 else final
        def privileged(mode, ctx):
            events.append(mode)
        result = {'ok': True, 'result': {'worker': worker_result(), 'workerExited': True,
                  'checkoutFiles': 1, 'checkoutBytes': 47, 'binaryBytes': 100,
                  'dockerSocketGID': 987, 'workerUID': 1000, 'workerGID': 1000}}
        with patch.object(R, '_roots', return_value=(top, ipc)), patch.object(R, 'github_binding'), \
                patch.object(R, '_identity_available'), patch.object(R.socket, 'socket', return_value=listener), \
                patch.object(R.os, 'chmod'), patch.object(R.P, 'privileged', side_effect=privileged), \
                patch.object(R.P, 'identity', return_value=(1, 2)), patch.object(R.P, 'read_parent', side_effect=read), \
                patch.object(R.subprocess, 'Popen', return_value=process), \
                patch.object(R, '_receive_result', return_value=result):
            observed = R.launch(REQUEST, {})
        self.assertEqual(events, ['prepare', 'read', 'read', 'remove'])
        self.assertTrue(observed['sameKernelParentIdentity'])
        self.assertEqual(observed['workerResult'], worker_result())
        listener.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
