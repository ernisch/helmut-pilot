"""Synthetic diagnostic projection only: no PostgreSQL, Docker, GPG or originals."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_restore_export_phase_tested', Path(__file__).with_name('restore_backup.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)


class ExportPhaseChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-export-phase-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name); self.root.chmod(0o700)
        self.context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
            'nonce': '11111111-2222-4333-8444-555555555555', 'exactCommit': 'a' * 40,
            'runId': '123456789', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
            'recipientFingerprint': M.FINGERPRINT, 'executionAuthority': False}
        self.calls = []
        self.supervisor = SimpleNamespace(last_stage_exit_code=0)  # Deliberately stale, never evidence.

    def invoke(self, failed_action='backup-before', *, kind='raised', close_failure=False,
               precondition_failure=False, closure_failure=False):
        work = self.root / ('work-' + str(len(list(self.root.iterdir()))))
        work.mkdir(mode=0o700); (work / 'state').mkdir(mode=0o700)
        identity = lambda action: {'phase': action, 'pid': 1234, 'startTicks': '5678'}
        pin = {'bytes': 1, 'sha256': 'c' * 64}
        failed = False
        def read_json(fd, name, **kwargs):
            if name.endswith('.node.SAFE.json'): return identity(name[:-len('.node.SAFE.json')])
            if name.endswith('.SAFE.json'):
                action = name[:-len('.SAFE.json')]
                return {'status': 'PASS_OWNED_DATABASE_EXPORT_STEP', 'action': action, 'returncode': 0,
                        'signal': None, 'output': pin, 'stderr': pin, 'identity': identity(action), 'lifecycle': pin}
            # The whole-export closure is deliberately rejected; assigning it
            # the last successful backup-after action would be false evidence.
            raise RuntimeError('FICTIONAL_PRIVATE_CLOSURE_DETAIL')
        def run_owned(argv, action, seconds):
            nonlocal failed
            self.calls.append(action)
            if action == failed_action:
                failed = True
                if kind == 'completed': return subprocess.CompletedProcess(argv, 3)
                if kind == 'called': raise subprocess.CalledProcessError(7, argv, stderr=b'FICTIONAL_PRIVATE_STDERR')
                if kind == 'wrong-argv': return subprocess.CompletedProcess(['unrelated'], 3)
                if kind == 'bool': return subprocess.CompletedProcess(argv, True)
                if kind == 'timeout': raise subprocess.TimeoutExpired(argv, 0)
                if kind == 'nested': raise M.BackupRuntimeError(phase='backup-export', actionName='backup-before', runnerReturncode=9)
                raise RuntimeError('FICTIONAL_PRIVATE_SQL_AND_PATH_MUST_NOT_ESCAPE')
            return subprocess.CompletedProcess(argv, 0)
        real_close, closes = os.close, []
        def close(fd):
            real_close(fd)
            if failed: closes.append(fd)
            if close_failure and failed and len(closes) == 1:
                raise OSError('FICTIONAL_PRIVATE_CLEANUP_DETAIL')
        def prepare(fd):
            if precondition_failure: raise RuntimeError('FICTIONAL_PRIVATE_PREREQUISITE')
        with patch.object(M.B, 'database_export_plan'), patch.object(M, '_restore_closure', side_effect=prepare), \
             patch.object(M, '_sample', return_value={'fictional': True}), \
             patch.object(M, '_json', side_effect=read_json), patch.object(M, '_pin', return_value=pin), \
             patch.object(M, '_lifecycle', side_effect=lambda fd, action: identity(action)), patch.object(M.os, 'close', side_effect=close):
            with self.assertRaises(M.BackupRuntimeError) as got:
                M.export_restore_database(self.context, expected_context=self.context, work=work,
                    container='w15-end500-123456789-11111111222243338444555555555555',
                    database=M.B.DATABASE, supervisor=self.supervisor, run_owned=run_owned)
        self.assertNotIn('FICTIONAL_PRIVATE', str(got.exception))
        return got.exception, closes

    def test_each_actual_export_action_failure_is_retained_instead_of_generic_loss(self):
        for action in M.ACTIONS:
            with self.subTest(action=action):
                self.calls.clear(); error, _ = self.invoke(action)
                self.assertEqual(getattr(error, 'actionName', None), action)
                self.assertEqual(error.phase, 'backup-export')
                self.assertEqual(self.calls, list(M.ACTIONS[:M.ACTIONS.index(action) + 1]))
                self.assertIsNone(error.nativeExit)
                self.assertIsNone(error.runnerReturncode)

    def test_only_direct_matching_docker_client_exit_is_reported_not_native_exit(self):
        for kind, expected in [('completed', 3), ('called', 7), ('wrong-argv', None), ('bool', None), ('timeout', None)]:
            with self.subTest(kind=kind):
                error, _ = self.invoke('backup-dump', kind=kind)
                self.assertEqual(error.runnerReturncode, expected)
                self.assertIsNone(error.nativeExit)
                self.assertEqual(error.actionName, 'backup-dump')

    def test_cleanup_failure_cannot_replace_first_action_and_other_fds_still_close(self):
        error, closes = self.invoke('backup-roles', close_failure=True)
        self.assertEqual(error.actionName, 'backup-roles')
        self.assertEqual(error.phase, 'backup-export')
        self.assertEqual(len(closes), 3)

    def test_unstarted_and_whole_export_closure_failure_do_not_invent_an_action(self):
        before, _ = self.invoke(precondition_failure=True)
        self.assertIsNone(before.actionName)
        self.assertIsNone(before.runnerReturncode)
        self.assertEqual(self.calls, [])
        after, _ = self.invoke(failed_action=None, closure_failure=True)
        self.assertIsNone(after.actionName)
        self.assertIsNone(after.runnerReturncode)
        self.assertIsNone(after.nativeExit)

    def test_checkpoint_wrapping_preserves_first_fixed_action_and_drops_untrusted_data(self):
        error, _ = self.invoke('backup-roles', kind='nested')
        wrapped = M._checkpoint_error(error, 'backup-freeze')
        self.assertEqual((wrapped.phase, wrapped.actionName, wrapped.runnerReturncode), ('backup-export', 'backup-before', 9))
        self.assertIsNone(wrapped.nativeExit)
        wrapped = M._checkpoint_error(RuntimeError('FICTIONAL_PRIVATE_DETAIL'), 'backup-export')
        self.assertEqual(wrapped.phase, 'backup-export')
        self.assertIsNone(wrapped.actionName)
        self.assertIsNone(wrapped.runnerReturncode)
        for action, returncode in [('private/path', 2), (True, True), ('backup-dump', 256), ('backup-before', 'secret')]:
            with self.subTest(action=action):
                sanitized = M.BackupRuntimeError(actionName=action, runnerReturncode=returncode)
                self.assertIsNone(sanitized.nativeExit)
                if action not in M.ACTIONS: self.assertIsNone(sanitized.actionName)
                if type(returncode) is not int or not -255 <= returncode <= 255: self.assertIsNone(sanitized.runnerReturncode)


if __name__ == '__main__': unittest.main()
