"""Fictional workflow connections and closed gates; no original/DB/GPG/500 run."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('mock_workflow_tested', Path(__file__).with_name('mock500_workflow.py'))
W = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(W)


def request(mode=W.SYNTHETIC):
    return {'schema': 'helmut-w15-runner-request/1', 'mode': mode, 'exactCommit': 'a' * 40,
        'runId': '123456789', 'runAttempt': 1, 'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8',
        'branch': W.BRANCH, 'imageId': 'sha256:' + 'b' * 64, 'nodeSource': '/FICTIONAL/node',
        'postgrestSource': '/FICTIONAL/postgrest', 'sourceQualification': {}, 'approval': {},
        'limits': dict(W.LIMITS), 'maximumWallSeconds': W.WALL[mode], 'bindings': {}}


def event(value):
    return {'w15_mode': value['mode'], 'expected_commit': value['exactCommit'],
        'w15_request': W.canonical({k: value[k] for k in W.DECLARATION_KEYS}).decode(), 'w15_cipher_index': ''}


def environment(value):
    return {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
        'GITHUB_SHA': value['exactCommit'], 'GITHUB_REF': value['branch'],
        'GITHUB_RUN_ID': value['runId'], 'GITHUB_RUN_ATTEMPT': '1'}


class WorkflowChecks(unittest.TestCase):
    def test_plan_never_reads_private_input_or_opens_runner(self):
        for argv in ([], ['--plan']):
            output = io.StringIO()
            with patch('sys.stdin', None), patch('sys.stdout', output), patch.object(W, 'component') as load:
                self.assertEqual(W.main(argv), 0)
            load.assert_not_called(); result = json.loads(output.getvalue())
            self.assertFalse(result['executionAuthority']); self.assertFalse(result['fullMock500Executed'])

    def test_event_matches_every_input_and_entire_dispatch_limit(self):
        value = request(); inputs = event(value)
        W.validate_event(value, {}, event_inputs=inputs)
        for mutation in ('unknown', 'commit', 'payload', 'oversized', 'declaration'):
            bad = copy.deepcopy(inputs)
            if mutation == 'unknown': bad['extra'] = ''
            elif mutation == 'commit': bad['expected_commit'] = 'c' * 40
            elif mutation == 'payload': bad['w15_cipher_index'] = 'FICTIONAL_SECRET'
            elif mutation == 'oversized': bad['w15_request'] += ' ' * W.MAX_INPUT
            else:
                declared = json.loads(bad['w15_request']); declared['maximumWallSeconds'] += 1
                bad['w15_request'] = json.dumps(declared)
            with self.subTest(mutation=mutation), self.assertRaises(W.WorkflowRejected):
                W.validate_event(value, {}, event_inputs=bad)
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}'):
            with self.assertRaises(W.WorkflowRejected): W.decode(raw)

    def test_synthetic_rejects_secrets_go_bindings_and_v3_ram(self):
        value = request(); qualification = SimpleNamespace(decode_qualification=Mock(return_value=(b'{}', 'd' * 64, {})))
        runtime = SimpleNamespace(_validate_qualification=Mock())
        with patch.object(W, 'component', side_effect=lambda n, *args: qualification if n == 'restore_workflow' else runtime), \
                patch.dict(os.environ, environment(value), clear=True):
            W.validate_admission(value, {})
            for key, changed in [('approval', {'authorized': True}), ('bindings', {'extra': True}),
                                 ('limits', {**W.LIMITS, 'comparisonBudgetBytes': 2560000000}), ('runAttempt', True)]:
                bad = copy.deepcopy(value); bad[key] = changed
                with self.subTest(key=key), self.assertRaises(W.WorkflowRejected): W.validate_admission(bad, {})
            with self.assertRaises(W.WorkflowRejected): W.validate_admission(value, {'passphrase': 'FICTIONAL'})

    def test_full_cannot_bootstrap_without_independent_end_acceptance_and_exact_assets(self):
        value = request(W.FULL)
        qualification = SimpleNamespace(decode_qualification=Mock(return_value=(b'{}', 'd' * 64, {})))
        start = SimpleNamespace(validate_admission=Mock(side_effect=RuntimeError('FICTIONAL_NO_END_ACCEPTANCE')))
        runtime = SimpleNamespace(_validate_qualification=Mock())
        modules = {'restore_workflow': qualification, 'runtime_inputs': runtime, 'mock500_start': start}
        with patch.object(W, 'component', side_effect=lambda n, *args: modules[n]), \
                patch.dict(os.environ, environment(value), clear=True):
            with self.assertRaises(W.WorkflowRejected): W.validate_admission(value, {})
            start.validate_admission.assert_not_called()
            value['bindings'] = {'end500Acceptance': {}, 'compatibilityBridge': {},
                'inputBindingSHA256': 'e' * 64, 'additionalAssetBytes': 217550486,
                'approvedEnd500Commit': 'b6eb74495cd9cf4d7bee04ec4b37da6244b5c6a2'}
            with self.assertRaises(RuntimeError): W.validate_admission(value, {})
            self.assertEqual(start.validate_admission.call_args.kwargs['expected_end500_commit'],
                value['bindings']['approvedEnd500Commit'])
            start.validate_admission.side_effect = None
            with self.assertRaises(W.WorkflowRejected): W.validate_admission(value, {})

    def test_failed_launch_retains_fixed_phase_without_private_text_or_retry(self):
        value = request(); private = {}; output = io.StringIO()
        class Failed(RuntimeError):
            phase = 'worker'
            safe_failure = {'worker': {'phase': 'mock-receiver-asset-reception'}}
        runner = SimpleNamespace(validate_request=Mock(), launch=Mock(side_effect=Failed('FICTIONAL_PRIVATE_TEXT')))
        raw = W.canonical({'request': value, 'privatePayload': private})
        with patch('sys.stdin', SimpleNamespace(buffer=io.BytesIO(raw))), patch('sys.stdout', output), \
                patch.object(W, 'component', return_value=runner), patch.object(W, 'validate_admission'), \
                patch.object(W, 'validate_event'):
            self.assertEqual(W.main(['--launch']), 1)
        runner.launch.assert_called_once(); result = json.loads(output.getvalue())
        self.assertEqual(result['worker']['phase'], 'mock-receiver-asset-reception')
        self.assertNotIn('FICTIONAL_PRIVATE_TEXT', output.getvalue()); self.assertFalse(result['retryAllowed'])

    def test_full_worker_connects_retained_inputs_controller_and_backup_on_one_clock(self):
        value = request(W.FULL)
        value.update(runnerTemp='/FICTIONAL/temp', checkoutBytes=10, binaryBytes=20,
            startedAtUTC='2026-10-29T12:00:00Z', startedMonotonic=123.0,
            binaries={k: {'path': '/FICTIONAL/' + k} for k in ('node', 'postgrest')})
        value['bindings'] = {'additionalAssetBytes': 42, 'inputBindingSHA256': 'e' * 64,
            'end500Acceptance': {}, 'compatibilityBridge': {}, 'approvedEnd500Commit': 'b6eb74495cd9cf4d7bee04ec4b37da6244b5c6a2'}
        resources, disk, start = Mock(), Mock(), Mock()
        runtime = SimpleNamespace(path=Mock(return_value='/FICTIONAL/reception'))
        inputs = SimpleNamespace(declared_additional_input_bytes=Mock(return_value=42))
        reception = {'received_root': '/FICTIONAL/received', 'asset_paths': {'qualifiedRows': '/FICTIONAL/rows'}, 'binding_raw': b'{}'}
        finish = Mock(return_value=dict.fromkeys(('remoteReadbackObserved', 'databaseRestoreObserved',
            'ownedContainerStopped', 'watchClosed'), True))
        modules = {
            'mock500_context': SimpleNamespace(build_context=Mock(return_value={'FICTIONAL': True}),
                open_runtime_inputs=Mock(return_value=runtime)),
            'mock500_resources': SimpleNamespace(observe=Mock(return_value=resources),
                admit_disk_plan=Mock(return_value={'FICTIONAL': True}), DiskGuard=Mock(return_value=disk)),
            'mock500_start': SimpleNamespace(StartGuard=Mock(return_value=start)),
            'mock500_receive': SimpleNamespace(prepare_inputs=Mock(return_value=reception)),
            'mock500_inputs': SimpleNamespace(open_inputs=Mock(return_value=inputs)),
            'mock500_backup': SimpleNamespace(completion_hook=Mock(return_value=finish))}
        def run(bound_inputs, bound_resources, bound_start, capture, *, disk_guard):
            self.assertIs(bound_inputs, inputs); self.assertIs(bound_resources, resources)
            self.assertIs(bound_start, start); self.assertIs(disk_guard, disk)
            capture(FICTIONAL=True)
            return {'status': 'PASS_MOCK500_BODY_AND_BACKUP_INDEPENDENT_ACCEPTANCE_PENDING',
                'bodyCompleted': True, 'ownedContainerStopped': True}
        controller = SimpleNamespace(run_bound=Mock(side_effect=run))
        with patch.object(W, 'validate_admission', return_value=(b'{}', 'd' * 64)), \
                patch.object(W, 'validate_manifest'), patch.object(W, 'validate_event'), \
                patch.object(W, 'component', side_effect=lambda n: modules[n]), \
                patch.object(W, 'controller', return_value=controller), patch.object(W, '_result', return_value='SAFE'):
            self.assertEqual(W.run_worker(value, {'eventInputs': {}}), 'SAFE')
        modules['mock500_receive'].prepare_inputs.assert_called_once()
        controller.run_bound.assert_called_once(); finish.assert_called_once_with(FICTIONAL=True)
        self.assertEqual(modules['mock500_start'].StartGuard.call_args.kwargs['started_monotonic'], 123.0)
        self.assertEqual(modules['mock500_resources'].DiskGuard.call_args.kwargs['started_monotonic'], 123.0)
        self.assertEqual(modules['mock500_inputs'].open_inputs.call_args.kwargs['asset_paths']['originalReception'],
            '/FICTIONAL/reception')


if __name__ == '__main__': unittest.main()
