"""New fixed backup checkpoints only; all IO/native/transport calls are stubs."""
import sys
sys.dont_write_bytecode = True

from contextlib import ExitStack, contextmanager
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('w15_backup_checkpoint_checks', Path(__file__).with_name('restore_backup.py'))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
CANARY = '/FICTIONAL_PRIVATE_PATH_PASSWORD_OR_SQL_NEVER_PUBLIC'
ORDER = ('backup-export', 'backup-freeze', 'backup-collect', 'backup-seal',
         'backup-transport', 'backup-authenticate', 'backup-recovery', 'backup-postcheck')


@contextmanager
def fixture(fail=None, transport_error=None):
    events = []
    def checkpoint(name, result=None):
        events.append(name)
        if fail == name:
            raise RuntimeError(CANARY)
        return result
    pin = {'bytes': 1, 'sha256': 'c' * 64}
    context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
        'nonce': '123e4567-e89b-42d3-a456-426614174000', 'exactCommit': 'a' * 40,
        'runId': '12345678901', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
        'recipientFingerprint': R.FINGERPRINT, 'executionAuthority': False}
    manifest = {'exactCommit': context['exactCommit'], 'runId': context['runId'],
        'backupRoot': '/FICTIONAL/backup', 'rollbackRoot': '/FICTIONAL/rollback',
        'binaries': {'node': {'path': '/FICTIONAL/node', **pin}}}
    collection = {'manifest': {'FICTIONAL': True}, 'manifestSHA256': 'd' * 64, 'selectedPlaintextBytes': 1}
    sealed = {**{key: context[key] for key in ('exactCommit', 'runId', 'runAttempt',
              'inputManifestSHA', 'recipientFingerprint')}, 'manifestSHA256': collection['manifestSHA256'],
              'cipherBytes': 10, 'cipherSHA256': 'e' * 64}
    calls = {'source': 0, 'running': True}
    def sources():
        calls['source'] += 1
        if calls['source'] == 2:
            checkpoint('backup-postcheck')
    inputs = SimpleNamespace(check_sources=Mock(side_effect=sources), backup_context=lambda: context,
        controller_context=lambda: {'runtimePins': {'node': pin}},
        backup_input_files=lambda: {'auth': Path('/FICTIONAL/received/payloads/auth.PRIVATE')},
        backup_provenance_files=lambda: {}, path=lambda _: Path('/FICTIONAL/received/payloads/auth.PRIVATE'))
    watch = SimpleNamespace(disk_check=Mock(), sample=Mock(), stop=Mock(), failure=None, stop_failure=None,
        finished=SimpleNamespace(is_set=lambda: True), thread=SimpleNamespace(is_alive=lambda: False),
        reporter=SimpleNamespace(is_alive=lambda: False))
    resources = SimpleNamespace(unit='FICTIONAL.slice', check_pid=Mock())
    def docker(*args, **kwargs):
        if args[0] == 'stop':
            checkpoint('backup-freeze'); calls['running'] = False; return b''
        assert args[0] == 'inspect'
        return json.dumps([{'Id': 'f' * 64, 'Image': 'sha256:' + '1' * 64,
            'HostConfig': {'CgroupParent': resources.unit},
            'State': {'Running': calls['running'], 'Pid': 1234 if calls['running'] else 0,
                      'OOMKilled': False, 'ExitCode': 0}}]).encode()
    forward = SimpleNamespace(ROOT=Path('/FICTIONAL/repo'), WORK=Path('/FICTIONAL/work'),
        PREP=Path('/FICTIONAL/prepare'), BASE='/tmp/FICTIONAL', DB='FICTIONAL', CONTAINER='FICTIONAL',
        M=SimpleNamespace(IMAGE='sha256:' + '1' * 64, docker=Mock(side_effect=docker)))
    returned = {'remoteReadbackObserved': True, 'artifactId': 123,
                'cipher': Path('/FICTIONAL/returned.gpg'),
                **{key: sealed[key] for key in ('cipherBytes', 'cipherSHA256')}}
    def transport(*args, **kwargs):
        checkpoint('backup-transport')
        if transport_error is not None:
            raise transport_error
        return returned
    guard = Mock(return_value={'FICTIONAL_RESOURCE_SAMPLE': True})
    with ExitStack() as stack:
        stack.enter_context(patch.object(R, 'export_restore_database', side_effect=lambda *a, **k: checkpoint('backup-export')))
        stack.enter_context(patch.object(R, 'collect_restore_backup', side_effect=lambda *a, **k: checkpoint('backup-collect', collection)))
        stack.enter_context(patch.object(R, 'seal_restore_backup', side_effect=lambda *a, **k: checkpoint('backup-seal', sealed)))
        stack.enter_context(patch.object(R, 'authenticated_readback', side_effect=lambda *a, **k: checkpoint('backup-authenticate', {'localAuthenticatedReadbackObserved': True})))
        stack.enter_context(patch.object(R, 'restore_readback', side_effect=lambda *a, **k: checkpoint('backup-recovery', {'databaseRestoreObserved': True})))
        stack.enter_context(patch.object(R, '_load', return_value=SimpleNamespace(roundtrip=Mock(side_effect=transport))))
        stack.enter_context(patch.object(R, '_source_pin', return_value=pin))
        stack.enter_context(patch.object(R, '_write'))
        stack.enter_context(patch.object(R.S, '_directory', return_value=999))
        stack.enter_context(patch.object(R.os, 'close'))
        stack.enter_context(patch.object(R.Path, 'is_file', return_value=True))
        stack.enter_context(patch.object(R.T.O, 'OwnedBackupRunner', return_value=SimpleNamespace(run_owned=Mock())))
        private = {'artifactCredentials': {'FICTIONAL': CANARY}}
        yield SimpleNamespace(events=events, inputs=inputs,
            restore_hook=R.restore_completion_hook(manifest, private, guard),
            full_hook=R.completion_hook(manifest, private, guard),
            restore_args={'forward': forward, 'inputs': inputs, 'resources': resources, 'watch': watch,
                          'restored': {'profiles': 500, 'active': 0}},
            full_args={'forward': forward, 'inputs': inputs, 'resources': resources,
                       'collection': collection, 'sealed': sealed, 'cipher': Path('/FICTIONAL/cipher.gpg')})


class BackupCheckpointChecks(unittest.TestCase):
    def assert_closed(self, error, phase):
        self.assertEqual(error.phase, phase)
        self.assertEqual(str(error), 'RESTORE_BACKUP_REJECTED')
        self.assertNotIn(CANARY, str(error.args))
        self.assertTrue(error.__suppress_context__)

    def test_restore_hooks_keep_functional_order_and_existing_success_contract(self):
        self.assertEqual(set(ORDER), R.BACKUP_PHASES)
        with fixture() as f:
            result = f.restore_hook(**f.restore_args)
            self.assertEqual(f.events, list(ORDER))
        self.assertTrue(result['watchClosed'] and result['ownedContainerStopped'])
        self.assertTrue(result['remoteReadbackObserved'] and result['databaseRestoreObserved'])
        self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertFalse(result['executionAuthority'])
        self.assertNotIn(CANARY, json.dumps(result))

    def test_each_restore_checkpoint_is_closed_and_failure_cannot_repeat_actions(self):
        for index, phase in enumerate(ORDER):
            with self.subTest(phase=phase), fixture(fail=phase) as f:
                with self.assertRaises(R.BackupRuntimeError) as failed:
                    f.restore_hook(**f.restore_args)
                self.assert_closed(failed.exception, phase)
                self.assertEqual(f.events, list(ORDER[:index + 1]))
                before = list(f.events)
                with self.assertRaises(R.BackupRuntimeError) as reused:
                    f.restore_hook(**f.restore_args)
                self.assert_closed(reused.exception, 'backup-export')
                self.assertEqual(f.events, before)

    def test_full_end500_hook_keeps_transport_auth_recovery_postcheck_and_one_shot(self):
        for phase in ORDER[4:]:
            with self.subTest(phase=phase), fixture(fail=phase) as f:
                with self.assertRaises(R.BackupRuntimeError) as failed:
                    f.full_hook(**f.full_args)
                self.assert_closed(failed.exception, phase)
                before = list(f.events)
                with self.assertRaises(R.BackupRuntimeError) as reused:
                    f.full_hook(**f.full_args)
                self.assert_closed(reused.exception, 'backup-transport')
                self.assertEqual(f.events, before)

    def test_full_end500_hook_success_has_only_remaining_four_checkpoints(self):
        with fixture() as f:
            result = f.full_hook(**f.full_args)
            self.assertEqual(f.events, list(ORDER[4:]))
            self.assertFalse(result['acceptedAsCompleteBackup'])
            before = list(f.events)
            with self.assertRaises(R.BackupRuntimeError) as reused:
                f.full_hook(**f.full_args)
            self.assert_closed(reused.exception, 'backup-transport')
            self.assertEqual(f.events, before)

    def test_only_known_nested_exact_type_phase_survives_both_hooks_without_text(self):
        foreign = RuntimeError(CANARY); foreign.phase = 'backup-recovery'
        cases = [(R.BackupRuntimeError(CANARY, phase='backup-recovery'), 'backup-recovery'),
                 (R.BackupRuntimeError(CANARY, phase=CANARY), 'backup-transport'),
                 (foreign, 'backup-transport')]
        for error, expected in cases:
            with self.subTest(expected=expected), fixture(transport_error=error) as f:
                with self.assertRaises(R.BackupRuntimeError) as failed:
                    f.restore_hook(**f.restore_args)
                self.assert_closed(failed.exception, expected)
                self.assertEqual(f.events, list(ORDER[:5]))

    def test_legacy_errors_have_no_invented_phase_and_unknown_values_are_dropped(self):
        error = R.BackupRuntimeError('BACKUP_RECOVERY_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED')
        self.assertIsNone(error.phase)
        self.assertEqual(str(error), 'BACKUP_RECOVERY_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED')
        error.phase = [CANARY]
        self.assertEqual(R._checkpoint_error(error, 'backup-export').phase, 'backup-export')
        self.assertIsNone(R.BackupRuntimeError(phase=CANARY).phase)


if __name__ == '__main__': unittest.main()
