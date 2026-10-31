"""Focused fictional callback failures; no worker, originals, DB or native tools."""
import sys
sys.dont_write_bytecode = True

import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_full_capture_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


F, B, C, MEMORY = [load(name) for name in (
    'test_restore_workflow', 'restore_backup', 'restore_connection', 'common_resources')]
W = F.W


def cached_memory():
    return {'configuredLimitBytes': 2560000000, 'kernelLifetimePeakBytes': 1644433408,
        'currentBytes': 1455034368, 'swapMaximumBytes': 0, 'swapCurrentBytes': 0,
        'lastReadbackValid': True, 'events': {key: 0 for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class FullCaptureChecks(unittest.TestCase):
    def failure(self, error, *, mode='end500-restore-gated', wrap_connection=False,
                controller_exit=False, later_cleanup_failure=False, memory=None, memory_error=False):
        fixture = F.WorkerChecks(); fixture.setUp(); self.addCleanup(fixture.doCleanups)
        manifest, private = fixture.setup_worker(mode)
        fixture.backup.BackupRuntimeError = B.BackupRuntimeError
        complete = Mock(side_effect=error)
        fixture.backup.restore_completion_hook.return_value = complete
        fixture.backup.completion_hook.return_value = complete
        fixture.resources.failure_observation = Mock(
            return_value=memory, side_effect=RuntimeError('FICTIONAL_RESOURCE_READBACK_UNKNOWN') if memory_error else None)
        original_load = W._load.side_effect

        def component(name, repo=None):
            if name == 'common_resources': return MEMORY
            value = original_load(name, repo)
            if name == 'restore_connection': value.RestoreConnectionError = C.RestoreConnectionError
            return value

        W._load.side_effect = component

        def consume(callback):
            try:
                callback(FICTIONAL_CALLBACK_INPUT=True)
            except BaseException:
                if controller_exit: raise SystemExit(1) from None
                if later_cleanup_failure: raise RuntimeError('FICTIONAL_LATER_RESOURCE_CLEANUP_FAILURE') from None
                if wrap_connection: raise C.RestoreConnectionError('export-' + error.actionName) from None
                raise

        fixture.connection.restore_only.side_effect = lambda *, backup_completion: consume(backup_completion)
        fixture.forward.main.side_effect = lambda **kwargs: consume(kwargs['backup_completion'])
        with self.assertRaises(W.WorkflowRejected) as caught:
            W.run_worker(manifest, private)
        complete.assert_called_once()
        fixture.prepare.assert_called_once()
        self.assertEqual(fixture.connection.restore_only.call_count, int(mode == 'end500-restore-gated'))
        self.assertEqual(fixture.forward.main.call_count, int(mode == 'end500-full-gated'))
        self.assertNotIn('FICTIONAL_', str(caught.exception))
        return caught.exception

    def test_full_restore_capture_does_not_replace_actual_connection_export_action(self):
        for action in W.EXPORT_ACTIONS:
            with self.subTest(action=action):
                error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export', actionName=action)
                caught = self.failure(error, wrap_connection=True, memory=cached_memory())
                self.assertEqual(caught.phase, 'connection-export-' + action)
                self.assertEqual(caught.worker_memory, cached_memory())

    def test_legacy_full_controller_exit_keeps_first_export_action(self):
        for action in W.EXPORT_ACTIONS:
            with self.subTest(action=action):
                error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export', actionName=action)
                caught = self.failure(error, mode='end500-full-gated', controller_exit=True,
                    memory=cached_memory())
                self.assertEqual(caught.phase, 'connection-export-' + action)
                self.assertEqual(caught.worker_memory, cached_memory())

    def test_direct_export_error_cannot_override_its_previously_captured_action(self):
        error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export', actionName='backup-dump')
        caught = self.failure(error, memory=cached_memory())
        self.assertEqual(caught.phase, 'connection-export-backup-dump')

    def test_later_resource_cleanup_error_preserves_first_export_and_cached_values(self):
        error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export', actionName='backup-roles')
        caught = self.failure(error, mode='end500-full-gated', later_cleanup_failure=True,
            memory=cached_memory())
        self.assertEqual(caught.phase, 'connection-export-backup-roles')
        self.assertEqual(caught.worker_memory, cached_memory())

    def test_unknown_resource_values_remain_missing_instead_of_becoming_zero(self):
        for kwargs in ({'memory_error': True}, {'memory': None}, {'memory': {'kernelLifetimePeakBytes': 0}}):
            with self.subTest(resource=kwargs):
                error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export', actionName='backup-after')
                caught = self.failure(error, controller_exit=True, **kwargs)
                self.assertEqual(caught.phase, 'connection-export-backup-after')
                self.assertIsNone(caught.worker_memory)

    def test_unknown_or_foreign_action_metadata_does_not_invent_an_export_action(self):
        foreign = RuntimeError('FICTIONAL_PRIVATE_SQL')
        foreign.phase, foreign.actionName = 'backup-export', 'backup-dump'
        errors = [foreign]
        for action in (None, 'FICTIONAL_PRIVATE_PATH', ['backup-dump'], {'private': True}):
            error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase='backup-export')
            error.actionName = action
            errors.append(error)
        for error in errors:
            with self.subTest(action=error.actionName):
                caught = self.failure(error, controller_exit=True)
                self.assertEqual(caught.phase, 'backup-export')
                self.assertIsNone(caught.worker_memory)

    def test_other_existing_backup_checkpoints_keep_their_own_phase(self):
        for checkpoint in ('backup-freeze', 'backup-seal', 'backup-recovery', 'backup-postcheck'):
            with self.subTest(checkpoint=checkpoint):
                error = B.BackupRuntimeError('FICTIONAL_PRIVATE_SQL', phase=checkpoint, actionName='backup-dump')
                caught = self.failure(error, mode='end500-full-gated', controller_exit=True)
                self.assertEqual(caught.phase, checkpoint)


if __name__ == '__main__': unittest.main()
