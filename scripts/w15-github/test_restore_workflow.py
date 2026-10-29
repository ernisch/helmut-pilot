"""Fictional admission/IPC/controller glue only; no Docker, HTTP, GPG or DB."""
import sys
sys.dont_write_bytecode = True

import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zlib

SPEC = importlib.util.spec_from_file_location('w15_restore_workflow_tests', Path(__file__).with_name('restore_workflow.py'))
W = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(W)
COMMIT = 'a' * 40
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'


def qualification():
    record = {'schema': 'helmut-w15-static-source-qualification/1',
        'scope': 'ISOLATED_GITHUB_W15_SOURCE_ONLY', 'status': 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW',
        'exactCommit': COMMIT, 'sourcePins': {'FICTIONAL.py': {'bytes': 3, 'sha256': 'b' * 64}},
        'historicalDeltas': [], 'executionAuthority': False, 'testStarted': False}
    raw = W._encode(record)
    return {'encoding': 'zlib-base64', 'data': base64.b64encode(zlib.compress(raw)).decode(),
            'sha256': hashlib.sha256(raw).hexdigest()}


def request(mode='end500-restore-synthetic'):
    value = {'schema': 'helmut-w15-runner-request/1', 'mode': mode, 'exactCommit': COMMIT,
        'runId': '123456789', 'runAttempt': 1, 'nonce': NONCE, 'branch': W.BRANCH,
        'imageId': 'sha256:' + 'c' * 64, 'nodeSource': '/FICTIONAL/node',
        'postgrestSource': '/FICTIONAL/postgrest', 'sourceQualification': qualification(),
        'approval': {}, 'limits': copy.deepcopy(W.LIMITS), 'maximumWallSeconds': W.WALL[mode]}
    if mode != 'end500-restore-synthetic':
        now = datetime.now(timezone.utc)
        approval = {'schema': 'helmut-w15-workflow-start-approval/1', 'scope': W.SCOPES[mode],
            'authorized': True, **{k: copy.deepcopy(value[k]) for k in (
                'exactCommit', 'branch', 'runAttempt', 'nonce', 'mode', 'limits', 'maximumWallSeconds')},
            'sourceQualificationSHA256': value['sourceQualification']['sha256'], 'maxReceiveAttempts': 1,
            'issuedAt': (now - timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'expiresAt': (now + timedelta(minutes=30)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'maxStorageUSD': '0.05', 'maxProviderCalls': 0}
        if mode == 'end500-full-gated':
            approval['restoreAcceptance'] = {'runId': '123456788', 'exactCommit': COMMIT,
                'receiptSHA256': 'd' * 64, 'status': 'PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE'}
        value['approval'] = approval
    return value


def payload(value):
    if value['mode'] == 'end500-restore-synthetic':
        return {}
    return {'cipherIndex': 'FICTIONAL_CIPHER', 'keyB64': 'FICTIONAL_EXISTING_KEY',
            'passphrase': 'FICTIONAL_PASSPHRASE', 'eventInputs': inputs(value),
            'artifactCredentials': {'GITHUB_TOKEN': 'FICTIONAL_CREDENTIAL'}}


def inputs(value):
    return {'w15_mode': value['mode'], 'expected_commit': value['exactCommit'],
            'w15_request': W._encode({k: value[k] for k in W.DECLARATION_KEYS}).decode(),
            'w15_cipher_index': '' if value['mode'] == 'end500-restore-synthetic' else 'FICTIONAL_CIPHER'}


def environment(value):
    return {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
            'GITHUB_SHA': value['exactCommit'], 'GITHUB_REF': value['branch'],
            'GITHUB_RUN_ID': value['runId'], 'GITHUB_RUN_ATTEMPT': '1'}


class AdmissionChecks(unittest.TestCase):
    def test_default_and_plan_do_not_read_stdin_or_start(self):
        for argv in ([], ['--plan']):
            output = io.StringIO()
            with patch.object(sys, 'stdin', None), patch.object(W, '_load') as load, patch('sys.stdout', output):
                self.assertEqual(W.main(argv), 0)
            load.assert_not_called()
            receipt = json.loads(output.getvalue())
            self.assertFalse(receipt['originalTransferPerformed'])
            self.assertFalse(receipt['executionAuthority'])

    def test_compression_is_bounded_pinned_canonical_and_no_tail(self):
        envelope = qualification()
        raw, digest, record = W.decode_qualification(envelope)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), digest)
        self.assertFalse(record['executionAuthority'])
        for change in ('sha', 'tail', 'noncanonical', 'bomb'):
            bad = copy.deepcopy(envelope)
            if change == 'sha':
                bad['sha256'] = 'f' * 64
            elif change == 'tail':
                bad['data'] = base64.b64encode(base64.b64decode(bad['data']) + b'tail').decode()
            else:
                changed = b' ' + raw if change == 'noncanonical' else b'X' * (W.MAX_QUALIFICATION + 1)
                bad['data'] = base64.b64encode(zlib.compress(changed)).decode()
                bad['sha256'] = hashlib.sha256(changed).hexdigest()
            with self.subTest(change=change), self.assertRaises(W.WorkflowRejected):
                W.decode_qualification(bad)

    def test_duplicate_json_and_nonfinite_values_rejected(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{}' * (W.MAX_IPC + 1)):
            with self.assertRaises(W.WorkflowRejected):
                W._decode(raw)

    def test_synthetic_has_no_original_payload_or_go(self):
        value = request()
        with patch.dict(os.environ, environment(value), clear=True):
            W.validate_admission(value, {})
            for private in ({'passphrase': 'FICTIONAL'}, {'eventInputs': {}}):
                with self.assertRaises(W.WorkflowRejected):
                    W.validate_admission(value, private)
            value['approval'] = {'authorized': True}
            with self.assertRaises(W.WorkflowRejected):
                W.validate_admission(value, {})

    def test_restore_go_binds_exact_scope_commit_nonce_attempt_limits_and_cost(self):
        value = request('end500-restore-gated')
        private = payload(value)
        with patch.dict(os.environ, environment(value), clear=True):
            W.validate_admission(value, private)
            changes = {'scope': 'ISOLATED_GITHUB_END500_ONLY', 'exactCommit': 'e' * 40,
                'nonce': '46d5a413-5ca7-415c-a412-62fc45b561c8', 'runAttempt': True,
                'maximumWallSeconds': 3600, 'maxReceiveAttempts': 2, 'maxStorageUSD': '1',
                'maxProviderCalls': 1, 'sourceQualificationSHA256': '0' * 64,
                'limits': {**W.LIMITS, 'swapBytes': 1}}
            for key, changed in changes.items():
                bad = copy.deepcopy(value)
                bad['approval'][key] = changed
                with self.subTest(key=key), self.assertRaises(W.WorkflowRejected):
                    W.validate_admission(bad, private)

    def test_approval_is_fresh_with_at_most_two_hour_window(self):
        value = request('end500-restore-gated')
        fixed = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
        variants = [('2026-10-29T11:00:00Z', '2026-10-29T14:00:00Z'),
                    ('2026-10-29T11:00:00Z', '2026-10-29T12:00:00Z'),
                    ('2026-10-29T12:01:00Z', '2026-10-29T13:00:00Z'),
                    ('2026-10-29T11:00:00+00:00', '2026-10-29T13:00:00Z')]
        with patch.dict(os.environ, environment(value), clear=True):
            for issued, expires in variants:
                bad = copy.deepcopy(value)
                bad['approval'].update(issuedAt=issued, expiresAt=expires)
                with self.subTest(issued=issued, expires=expires), self.assertRaises(W.WorkflowRejected):
                    W.validate_admission(bad, payload(bad), now=fixed)

    def test_full_requires_separate_previous_restore_acceptance(self):
        value = request('end500-full-gated')
        with patch.dict(os.environ, environment(value), clear=True):
            W.validate_admission(value, payload(value))
            for field, changed in (('runId', value['runId']), ('exactCommit', 'e' * 40),
                                   ('status', 'PASS_WORKFLOW_STARTED'), ('receiptSHA256', 'invalid')):
                bad = copy.deepcopy(value)
                bad['approval']['restoreAcceptance'][field] = changed
                with self.subTest(field=field), self.assertRaises(W.WorkflowRejected):
                    W.validate_admission(bad, payload(bad))
            del value['approval']['restoreAcceptance']
            with self.assertRaises(W.WorkflowRejected):
                W.validate_admission(value, payload(value))

    def test_only_synthetic_accepts_an_omitted_or_null_empty_cipher_default(self):
        value=request()
        for null in (False,True):
            event=inputs(value)
            if null:event['w15_cipher_index']=None
            else:event.pop('w15_cipher_index')
            W._event_inputs(value,event,{})
        event=inputs(value);event['w15_cipher_index']='UNEXPECTED'
        with self.assertRaises(W.WorkflowRejected):W._event_inputs(value,event,{})
        gated=request('end500-restore-gated');event=inputs(gated);event.pop('w15_cipher_index')
        with self.assertRaises(W.WorkflowRejected):W._event_inputs(gated,event,payload(gated))

    def test_actual_event_copy_and_total_dispatch_size_are_checked_before_bootstrap(self):
        value = request('end500-restore-gated')
        private = payload(value)
        check = Mock()
        with patch.object(W, '_load', return_value=SimpleNamespace(check_event=check)):
            W._event_inputs(value, inputs(value), private)
            check.assert_called_once()
            bad = inputs(value)
            bad['w15_cipher_index'] = 'DIFFERENT'
            with self.assertRaises(W.WorkflowRejected):
                W._event_inputs(value, bad, private)
            bad = inputs(value)
            bad['w15_request'] += ' ' * W.MAX_INPUT
            with self.assertRaises(W.WorkflowRejected):
                W._event_inputs(value, bad, private)
        value = request()
        bad = inputs(value)
        bad['w15_cipher_index'] = 'FICTIONAL_CIPHER'
        with self.assertRaises(W.WorkflowRejected):
            W._event_inputs(value, bad, {})

    def test_launch_uses_private_stdin_and_only_returns_safe_bootstrap_receipt(self):
        value = request()
        envelope = W._encode({'request': value, 'privatePayload': {}})
        receipt = {'status': 'PASS_FRESH_RUNNER_OWNED_LIFETIME_ONLY', 'workerResult': W._result(value)}
        launch = Mock(return_value=receipt)
        with tempfile.TemporaryDirectory() as temp:
            event = Path(temp) / 'event.json'
            event.write_bytes(W._encode({'inputs': inputs(value)}))
            env = {**environment(value), 'GITHUB_EVENT_PATH': str(event)}
            output = io.StringIO()
            with patch.dict(os.environ, env, clear=True), patch('sys.stdin', SimpleNamespace(buffer=io.BytesIO(envelope))), \
                    patch('sys.stdout', output), patch.object(W, '_load', return_value=SimpleNamespace(launch=launch)):
                self.assertEqual(W.main(['--launch']), 0)
            launch.assert_called_once_with(value, {})
            self.assertEqual(json.loads(output.getvalue()), receipt)

    def test_failure_does_not_echo_private_values_or_retry(self):
        value = request('end500-restore-gated')
        private = payload(value)
        envelope = W._encode({'request': value, 'privatePayload': private})
        launch = Mock(side_effect=RuntimeError(private['passphrase']))
        output = io.StringIO()
        with patch.dict(os.environ, environment(value), clear=True), \
                patch('sys.stdin', SimpleNamespace(buffer=io.BytesIO(envelope))), patch('sys.stdout', output), \
                patch.object(W, 'validate_event'), patch.object(W, '_load', return_value=SimpleNamespace(launch=launch)):
            self.assertEqual(W.main(['--launch']), 1)
        launch.assert_called_once()
        text = output.getvalue()
        for secret in private['cipherIndex'], private['keyB64'], private['passphrase'], 'FICTIONAL_CREDENTIAL':
            self.assertNotIn(secret, text)
        self.assertFalse(json.loads(text)['retryAllowed'])

    def test_runner_failure_projects_only_known_phase_enums(self):
        error = RuntimeError('FICTIONAL_PRIVATE_ERROR')
        error.safe_failure = {'phase': 'worker', 'worker': {'phase': 'resources'}}
        self.assertEqual(W._safe_failure(error), {'phase': 'worker', 'worker': {'phase': 'resources'}})
        error.safe_failure['worker']['phase'] = '/FICTIONAL_PRIVATE_PATH'
        self.assertEqual(W._safe_failure(error), {'phase': 'worker'})
        error.safe_failure['phase'] = 'FICTIONAL_PASSPHRASE'
        self.assertEqual(W._safe_failure(error), {'phase': 'arguments'})


class WorkerChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-worker-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.calls = []

    def setup_worker(self, mode):
        manifest = request(mode)
        manifest.pop('nodeSource'); manifest.pop('postgrestSource')
        manifest.update(schema='helmut-w15-runner-manifest/1', stagedRepo=str(self.root / 'repo'),
            runnerTemp=str(self.root), rollbackRoot=str(self.root / 'rollback'), backupRoot=str(self.root / 'backup'),
            parentUnit='FICTIONAL.slice', sourcePins={'FICTIONAL.py': {'bytes': 3, 'sha256': 'b' * 64}},
            checkoutBytes=3, binaryBytes=4, binaries={
                'node': {'path': str(self.root / 'node'), 'bytes': 2, 'sha256': 'c' * 64},
                'postgrest': {'path': str(self.root / 'postgrest'), 'bytes': 2, 'sha256': 'd' * 64}})
        runtime = SimpleNamespace(C=SimpleNamespace(REQUIRED_SOURCE_PINS={'FICTIONAL.py'},
            RUNTIME={name: {k: pin[k] for k in ('bytes', 'sha256')} for name, pin in manifest['binaries'].items()},
            validate_context=Mock()), _validate_qualification=Mock())
        resources = SimpleNamespace(sample=Mock())
        guard = Mock(return_value={'FICTIONAL': True})
        code = SimpleNamespace(admit_disk_plan=Mock(return_value={'FICTIONAL': True}), DiskGuard=Mock(return_value=guard))
        forward = SimpleNamespace(ROOT=Path(manifest['stagedRepo']), _runtime_module=Mock(return_value=runtime),
            open_common_resources=Mock(return_value=resources), main=Mock())
        summary = {'verifiedFiles': 12, 'verifiedBytes': 242570240}
        connection = SimpleNamespace(safe_summary=Mock(return_value=summary), controller_inputs=Mock(return_value=object()))
        prepare = Mock(return_value=connection)
        backup_receipt = {'remoteReadbackObserved': True, 'databaseRestoreObserved': True}
        def complete(**kwargs):
            self.calls.append('backup')
            return copy.deepcopy(backup_receipt)
        backup = SimpleNamespace(completion_hook=Mock(return_value=complete), restore_completion_hook=Mock(return_value=complete))
        def restore_only(*, backup_completion):
            self.calls.append('restore')
            backup_completion(FICTIONAL=True)
            return {'profiles': 500, 'active': 0, 'ownedContainerStopped': True, **backup_receipt}
        connection.restore_only = Mock(side_effect=restore_only)
        def main(**kwargs):
            self.calls.append('full')
            kwargs['backup_completion'](FICTIONAL=True)
        forward.main.side_effect = main
        modules = {'restore_resources': code, 'restore_connection': SimpleNamespace(prepare_same_job=prepare),
                   'restore_backup': backup, 'encrypted_index': SimpleNamespace(check_event=Mock())}
        self.manifest, self.runtime, self.resources, self.guard = manifest, runtime, resources, guard
        self.forward, self.connection, self.prepare, self.backup = forward, connection, prepare, backup
        self.patchers = [patch.dict(os.environ, environment(manifest), clear=True), patch.object(W, '_manifest'),
                         patch.object(W, '_forward', return_value=forward),
                         patch.object(W, '_load', side_effect=lambda name, repo=None: modules[name])]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        return manifest, payload(manifest)

    def test_synthetic_exercises_private_io_and_guard_without_receive_or_restore(self):
        manifest, private = self.setup_worker('end500-restore-synthetic')
        result = W.run_worker(manifest, private)
        self.prepare.assert_not_called()
        self.forward.main.assert_not_called()
        self.connection.restore_only.assert_not_called()
        self.runtime._validate_qualification.assert_called_once()
        self.assertGreaterEqual(self.guard.call_count, 5)
        self.assertEqual(len(list(self.root.glob('synthetic-*/fictional-input.bin'))), 1)
        self.assertFalse(result['isolatedRestoreObserved'])
        self.assertFalse(result['originalTransferPerformed'])
        self.assertEqual(result['verifiedFiles'], 0)

    def test_restore_connects_single_receive_existing_restore_and_backup_then_stops(self):
        manifest, private = self.setup_worker('end500-restore-gated')
        result = W.run_worker(manifest, private)
        self.prepare.assert_called_once()
        passed = self.prepare.call_args.kwargs
        self.assertIs(passed['private_payload'], private)
        self.assertEqual(hashlib.sha256(passed['source_qualification_raw']).hexdigest(), passed['source_qualification_sha256'])
        self.assertEqual(passed['observed_context']['runId'], manifest['runId'])
        self.connection.restore_only.assert_called_once()
        self.forward.main.assert_not_called()
        self.backup.restore_completion_hook.assert_called_once_with(manifest, private, self.guard)
        self.assertEqual(self.calls, ['restore', 'backup'])
        self.assertTrue(result['isolatedRestoreObserved'])
        self.assertFalse(result['end500BodyCompleted'])
        self.assertEqual(result['verifiedFiles'], 12)
        self.assertNotIn(str(self.root), W._encode(result).decode())

    def test_full_uses_existing_main_directly_and_requires_its_backup_callback(self):
        manifest, private = self.setup_worker('end500-full-gated')
        result = W.run_worker(manifest, private)
        self.prepare.assert_called_once()
        self.connection.restore_only.assert_not_called()
        self.forward.main.assert_called_once()
        self.assertIs(self.forward.main.call_args.kwargs['common_resources'], self.resources)
        self.backup.completion_hook.assert_called_once_with(manifest, private, self.guard)
        self.assertEqual(self.calls, ['full', 'backup'])
        self.assertTrue(result['end500BodyCompleted'])
        self.assertFalse(result['end500Acceptance'])

    def test_missing_backup_readback_or_missing_callback_cannot_be_success(self):
        manifest, private = self.setup_worker('end500-full-gated')
        self.forward.main.side_effect = None
        with self.assertRaises(W.WorkflowRejected) as failed:
            W.run_worker(manifest, private)
        self.assertEqual(failed.exception.phase, 'backup')
        self.forward.main.assert_called_once()
        self.backup.completion_hook.return_value = Mock(return_value={'remoteReadbackObserved': True})
        self.forward.main.side_effect = lambda **kwargs: kwargs['backup_completion'](FICTIONAL=True)
        with self.assertRaises(W.WorkflowRejected) as failed:
            W.run_worker(manifest, private)
        self.assertEqual(failed.exception.phase, 'backup')

    def test_failed_prepare_has_no_retry_restore_or_private_error(self):
        manifest, private = self.setup_worker('end500-restore-gated')
        self.prepare.side_effect = RuntimeError('FICTIONAL_PASSPHRASE /PRIVATE/INPUT')
        with self.assertRaises(W.WorkflowRejected) as failed:
            W.run_worker(manifest, private)
        self.prepare.assert_called_once()
        self.connection.restore_only.assert_not_called()
        self.forward.main.assert_not_called()
        self.assertEqual(failed.exception.phase, 'receive-prepare')
        self.assertNotIn('PRIVATE', str(failed.exception))

    def test_public_result_is_closed_and_semantically_bound(self):
        for mode in W.WALL:
            good = W._result(request(mode))
            self.assertIs(W.validate_public_result(good), good)
            bad = copy.deepcopy(good)
            bad['path'] = '/PRIVATE'
            with self.assertRaises(W.WorkflowRejected):
                W.validate_public_result(bad)
            bad = copy.deepcopy(good)
            bad['end500Acceptance'] = True
            with self.assertRaises(W.WorkflowRejected):
                W.validate_public_result(bad)
            bad = copy.deepcopy(good)
            bad['originalTransferPerformed'] = not bad['originalTransferPerformed']
            with self.assertRaises(W.WorkflowRejected):
                W.validate_public_result(bad)


if __name__ == '__main__':
    unittest.main()
