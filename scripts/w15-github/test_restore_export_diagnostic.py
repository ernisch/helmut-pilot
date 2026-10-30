"""Small fictional diagnostic connections; no originals, Docker, DB or models."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_export_diagnostic_tests_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


F, FC, FS, R, RI = [load(n) for n in ('test_restore_workflow', 'test_restore_connection',
    'test_mock500_start', 'runner_start', 'runtime_inputs')]
W = F.W
MODE = W.DIAGNOSTIC


def request():
    value = F.request(MODE); value['approval']['maxStorageUSD'] = '0'
    private = F.payload(value); private['artifactCredentials'] = {}; private['eventInputs'] = F.inputs(value)
    return value, private


def sample():
    return {'configuredLimitBytes': 2560000000, 'kernelLifetimePeakBytes': 1000000,
        'currentBytes': 500000, 'swapMaximumBytes': 0, 'swapCurrentBytes': 0,
        'lastReadbackValid': True, 'events': {k: 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class DiagnosticChecks(unittest.TestCase):
    def test_new_scope_zero_storage_and_no_artifact_credentials_are_strictly_separate(self):
        value, private = request()
        with patch.dict(os.environ, F.environment(value), clear=True):
            W.validate_admission(value, private)
            R.validate_request(value, private)
            for key, changed in [('scope', W.SCOPES['end500-restore-gated']), ('maxStorageUSD', '0.05'),
                    ('maxReceiveAttempts', 2), ('maxProviderCalls', 1), ('authorized', False), ('maximumWallSeconds', 3600)]:
                bad = copy.deepcopy(value); bad['approval'][key] = changed
                with self.subTest(key=key), self.assertRaises(W.WorkflowRejected): W.validate_admission(bad, private)
            private['artifactCredentials'] = {'GITHUB_TOKEN': 'FICTIONAL_PRIVATE'}
            with self.assertRaises(W.WorkflowRejected): W.validate_admission(value, private)
        self.assertEqual(W.LIMITS, R.LIMITS)
        self.assertEqual(W.WALL[MODE], 1800)

    def test_diagnostic_receipt_is_closed_and_cannot_become_end500_or_mock_acceptance(self):
        value, private = request(); result = W._result(value)
        self.assertEqual((result['restoreSteps'], result['exportActions'], result['profiles'], result['activeProfiles']), (5, 4, 500, 0))
        self.assertFalse(result['backupRoundtripVerified'] or result['fullRestoreAccepted']
            or result['remoteReadbackObserved'] or result['end500BodyCompleted'] or result['end500Acceptance'])
        self.assertEqual(R._worker_result(result, value), dict(sorted(result.items())))
        for key, changed in [('backupRoundtripVerified', True), ('exportActions', 3), ('profiles', 499),
                ('fullRestoreAccepted', True), ('watchStopped', False), ('private', 'FICTIONAL_SECRET')]:
            bad = {**result, key: changed}
            with self.subTest(key=key), self.assertRaises(W.WorkflowRejected): W.validate_public_result(bad)
            with self.subTest(runner_key=key), self.assertRaises(R.RunnerStartError): R._worker_result(bad, value)
        full = F.request('end500-full-gated'); full['approval']['restoreAcceptance']['status'] = result['status']
        with patch.dict(os.environ, F.environment(full), clear=True), self.assertRaises(W.WorkflowRejected):
            W.validate_admission(full, F.payload(full))
        original = FS.StartChecks(); original.setUp(); self.addCleanup(original.doCleanups)
        original.end['status'] = result['status']; original.end_envelope = FS.envelope(original.end)
        with self.assertRaisesRegex(FS.S.StartRejected, 'POSITIVE_FROZEN_END500_ACCEPTANCE_REQUIRED'): original.admit()

    def test_diagnostic_four_inputs_use_actual_encrypted_index_mode_and_size_guard(self):
        value, private = request(); armor = load('test_encrypted_index').armor()
        private['cipherIndex'] = armor
        event = F.inputs(value); event['w15_cipher_index'] = armor; private['eventInputs'] = event
        W._event_inputs(value, event, private)
        for bad in ({**event, 'unexpected': ''}, {**event, 'expected_commit': 'b' * 40}):
            with self.assertRaises(Exception): W._event_inputs(value, bad, private)

    def test_existing_qualified_source_observation_accepts_only_the_new_fixed_mode(self):
        value, private = request()
        context = {k: value[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')}
        observed = {**context, 'branch': W.BRANCH, 'mode': MODE}
        _, digest, qualification = W.decode_qualification(value['sourceQualification'])
        record = {'schema': 'helmut-w15-qualified-runtime-observation/1',
            'status': 'PASS_STATIC_SOURCE_QUALIFICATION_AND_OBSERVED_CONTEXT_BINDING',
            'exactCommit': value['exactCommit'], 'contextSHA256': 'f' * 64,
            'sourcePins': qualification['sourcePins'], 'historicalDeltas': qualification['historicalDeltas'],
            'qualification': qualification, 'qualificationSHA256': digest, 'observedContext': observed,
            'executionAuthority': False, 'testStarted': False}
        with patch.dict(os.environ, F.environment(value), clear=True), \
                patch.object(RI.C, 'validate_context', return_value={'contextSHA256': 'f' * 64}), \
                patch.object(RI, '_validate_qualification'):
            RI._validate_observation(context, record, HERE.parents[1])
            record['observedContext']['mode'] = 'end500-unapproved-diagnostic'
            with self.assertRaises(RI.RuntimeInputError): RI._validate_observation(context, record, HERE.parents[1])

    def connection_fixture(self):
        fixture = FC.SameJobConnectionChecks(); fixture.setUp(); self.addCleanup(fixture.doCleanups)
        connection = fixture.setup_restore()
        original_watch = fixture.forward.Watch
        def watch(path):
            result = original_watch(path)
            result.finished = SimpleNamespace(is_set=lambda: result.stopped == 1)
            result.thread.is_alive.return_value = False
            result.reporter = SimpleNamespace(is_alive=lambda: False)
            return result
        fixture.forward.Watch = watch
        return fixture, connection

    def test_actual_restore_connection_runs_only_export_callback_then_own_cleanup(self):
        fixture, connection = self.connection_fixture(); events = []
        fixture.inputs.backup_context = lambda: {'FICTIONAL_BACKUP_CONTEXT': True}
        result = {'status': 'PASS_DATABASE_AND_ROLES_EXPORTED_RESTORE_AND_READBACK_PENDING',
            'pins': {name: {'FICTIONAL': True} for name in W.EXPORT_ACTIONS},
            'databaseRestoreObserved': False, 'remoteReadbackObserved': False, 'acceptedAsCompleteBackup': False}
        def export(*args, **kwargs):
            events.extend(W.EXPORT_ACTIONS)
            self.assertEqual(fixture.restore.call_count, 1)
            self.assertTrue(fixture.running)
            self.assertIs(kwargs['supervisor'], fixture.watch)
            return result
        owned = Mock(return_value=SimpleNamespace(run_owned=Mock()))
        backup = SimpleNamespace(_bind_disk_guard=Mock(), T=SimpleNamespace(O=SimpleNamespace(OwnedBackupRunner=owned)),
            export_restore_database=Mock(side_effect=export), completion_hook=Mock(), restore_completion_hook=Mock())
        callback = W._diagnostic_export_hook(backup, Mock())
        with patch.object(FC.R.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            observed = connection.restore_only(backup_completion=callback, export_diagnostic=True)
        self.assertEqual(events, list(W.EXPORT_ACTIONS))
        self.assertEqual(fixture.stop_calls, [FC.CID]); self.assertEqual(fixture.watch.stopped, 1)
        self.assertEqual(observed['exportActions'], 4); self.assertTrue(observed['watchStopped'])
        self.assertFalse(observed['remoteReadbackObserved'] or observed['databaseRestoreObserved'])
        self.assertEqual(owned.call_args.kwargs['scope'], 'end500-backup')
        backup.completion_hook.assert_not_called(); backup.restore_completion_hook.assert_not_called()
        fixture.forward.main.assert_not_called()

    def test_first_export_action_failure_survives_connection_cleanup_failure(self):
        for action in W.EXPORT_ACTIONS:
            with self.subTest(action=action):
                fixture, connection = self.connection_fixture()
                fixture.watch_close_failure = True
                class ActionFailed(RuntimeError):
                    phase, actionName = 'backup-export', action
                def failed(**kwargs): raise ActionFailed('FICTIONAL_PRIVATE_ERROR')
                with patch.object(FC.R.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), \
                        self.assertRaises(FC.R.RestoreConnectionError) as got:
                    connection.restore_only(backup_completion=failed, export_diagnostic=True)
                self.assertEqual(got.exception.phase, 'export-' + action)
                self.assertNotIn('PRIVATE', str(got.exception))
                self.assertEqual(fixture.stop_calls, [FC.CID]); self.assertEqual(fixture.watch.stopped, 1)

    def test_workflow_uses_diagnostic_connection_without_complete_backup_hooks(self):
        fixture = F.WorkerChecks(); fixture.setUp(); self.addCleanup(fixture.doCleanups)
        manifest, private = fixture.setup_worker(MODE)
        manifest['approval']['maxStorageUSD'] = '0'; private['artifactCredentials'] = {}; private['eventInputs'] = F.inputs(manifest)
        def restore(*, backup_completion, export_diagnostic):
            self.assertTrue(export_diagnostic); self.assertTrue(callable(backup_completion))
            return {'profiles': 500, 'active': 0, 'restoreSteps': 5, 'exportActions': 4,
                'ownedContainerStopped': True, 'watchStopped': True, 'diagnosticExportOnly': True,
                'remoteReadbackObserved': False, 'databaseRestoreObserved': False}
        fixture.connection.restore_only.side_effect = restore
        result = W.run_worker(manifest, private)
        self.assertEqual(result['status'], W.STATUSES[MODE]); self.assertFalse(result['backupRoundtripVerified'])
        fixture.connection.restore_only.assert_called_once()
        fixture.backup.completion_hook.assert_not_called(); fixture.backup.restore_completion_hook.assert_not_called()
        fixture.forward.main.assert_not_called()
        # The runner/IPC keeps the new fixed action phase and the existing cache.
        for action in W.EXPORT_ACTIONS:
            code = SimpleNamespace(RestoreConnectionError=FC.R.RestoreConnectionError)
            error = FC.R.RestoreConnectionError('export-' + action)
            phase = W._connection_failure_phase(error, code, 'restore')
            projected = R._worker_failure(W.WorkflowRejected(phase, sample()), 'WORKER_REPORTED_FAILURE')
            packet = R._failure_packet(projected); observed = R._response_error(packet)
            self.assertEqual(observed.worker_phase, 'connection-export-' + action)
            self.assertEqual(observed.worker_memory, sample())

    def test_javascript_projects_action_phase_cache_and_unknown_cleanup_without_tokens(self):
        action = HERE.parents[1] / '.github/actions/w15-isolated/index.js'
        code = r'''const fs=require('node:fs'),cp=require('node:child_process');
const original=fs.readFileSync;fs.readFileSync=(p,...a)=>p==='FICTIONAL_EVENT'?JSON.stringify({inputs:{}}):original(p,...a);
const logs=[];const print=console.log;console.log=x=>logs.push(JSON.parse(x));
cp.spawnSync=(...a)=>{const p=JSON.parse(a[2].input).privatePayload;
if(Object.keys(p.artifactCredentials).length)throw Error('UNEXPECTED_ARTIFACT_CREDENTIAL');
return {status:1,stdout:JSON.stringify({status:'FAIL_W15_ISOLATED_WORKFLOW',phase:'worker',
worker:{phase:'connection-export-backup-dump',memory:JSON.parse(process.env.FICTIONAL_MEMORY)},
cleanup:Object.fromEntries(['workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'].map(k=>[k,'UNKNOWN'])),
executionAuthority:false,retryAllowed:false})};};
require(process.env.FICTIONAL_ACTION);print(JSON.stringify(logs));'''
        env = {'PATH': os.defpath, 'W15_MODE': MODE, 'W15_REQUEST': '{}', 'GITHUB_EVENT_PATH': 'FICTIONAL_EVENT',
            'FICTIONAL_ACTION': str(action), 'FICTIONAL_MEMORY': json.dumps(sample()),
            'GITHUB_TOKEN': 'FICTIONAL_PRIVATE_TOKEN', 'ACTIONS_RUNTIME_TOKEN': 'FICTIONAL_PRIVATE_TOKEN'}
        node = shutil.which('node'); self.assertIsNotNone(node)
        result = subprocess.run([node, '-e', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=10)
        self.assertEqual(result.returncode, 1)  # Action correctly retains failure.
        rows = json.loads(result.stdout)
        self.assertEqual(rows[-1]['worker']['phase'], 'connection-export-backup-dump')
        self.assertEqual(rows[-1]['worker']['memory'], sample())
        self.assertEqual(set(rows[-1]['cleanup'].values()), {'UNKNOWN'})
        self.assertNotIn(b'FICTIONAL_PRIVATE_TOKEN', result.stdout + result.stderr)


if __name__ == '__main__': unittest.main()
