"""Five-action diagnostic counterprobes; fictional outputs, no native DB."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_restore_action_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


M = load('runtime_restore')
D = load('test_restore_export_diagnostic')
W, R = D.W, D.R


class RestoreActionChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-restore-phase-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name); self.root.chmod(0o700)
        self.calls = []; self.saved = []

    def invoke(self, failed_action='restore-create', *, kind='raised', close_failure=False,
               precondition_failure=False, closure_failure=False):
        work = self.root / ('work-' + str(len(list(self.root.iterdir()))))
        work.mkdir(mode=0o700); (work / 'state').mkdir(mode=0o700)
        controller = SimpleNamespace(BASE=M.BASE, DB=M.DATABASE, WORK=work,
            CONTAINER='w15-end500-123456789-11111111222243338444555555555555', DOCKER=list(M.DOCKER),
            save=lambda *args: self.saved.append(args))
        if precondition_failure: controller.BASE = '/FICTIONAL_INVALID_BASE'
        controller.save = Mock(side_effect=RuntimeError('FICTIONAL_PRIVATE_CLOSURE')) if closure_failure else controller.save
        pin = {'bytes': 1, 'sha256': 'c' * 64}
        failed = False
        def identity(action): return {'phase': action, 'pid': 1234, 'startTicks': '5678'}
        def read_json(fd, name, **kwargs):
            if name.endswith('.node.SAFE.json'): return identity(name[:-len('.node.SAFE.json')])
            if name.endswith('.SAFE.json'):
                action = name[:-len('.SAFE.json')]
                if action == failed_action and kind == 'receipt': return {'status': 'FICTIONAL_INVALID_RECEIPT'}
                result = {'status': 'PASS_OWNED_ISOLATED_RESTORE_STEP', 'action': action, 'returncode': 0,
                    'signal': None, 'output': pin, 'stderr': pin, 'identity': identity(action), 'lifecycle': pin}
                if action == 'restore-render': result['renderedSQL'] = pin
                return result
            return {'profiles': 500, 'active': 0}
        class Owned:
            def run_owned(owned, argv, action, seconds):
                nonlocal failed
                self.calls.append(action)
                if action == failed_action:
                    failed = True
                    if kind == 'completed': return subprocess.CompletedProcess(argv, 3)
                    if kind == 'receipt': return subprocess.CompletedProcess(argv, 0)
                    if kind == 'called': raise subprocess.CalledProcessError(7, argv, stderr=b'FICTIONAL_PRIVATE_SQL')
                    if kind == 'wrong-argv': return subprocess.CompletedProcess(['unrelated'], 3)
                    if kind == 'bool': return subprocess.CompletedProcess(argv, True)
                    if kind == 'timeout': raise subprocess.TimeoutExpired(argv, 0)
                    if kind == 'nested': raise M.RestoreRuntimeError(actionName='restore-create', runnerReturncode=9)
                    raise RuntimeError('FICTIONAL_PRIVATE_SQL_AND_PATH')
                return subprocess.CompletedProcess(argv, 0)
        runner = Owned(); runner.scope = 'end500-restore'; runner.actions = M.ACTIONS; runner.controller = controller
        supervisor = SimpleNamespace(backup_runner=runner, common_resources=object(), last_stage_exit_code=0)
        close = os.close; closes = []
        def closing(fd):
            close(fd)
            if failed: closes.append(fd)
            if close_failure and failed and len(closes) == 1: raise OSError('FICTIONAL_PRIVATE_CLEANUP')
        with patch.object(M.B, '_sample', return_value={'fictional': True}), \
                patch.object(M.B, '_json', side_effect=read_json), patch.object(M.B, '_pin', return_value=pin), \
                patch.object(M, '_lifecycle', side_effect=lambda fd, action: identity(action)), \
                patch.object(M.B, '_write'), patch.object(M.os, 'close', side_effect=closing):
            try: result = M.restore_owned(controller, supervisor, run_owned=runner.run_owned)
            except M.RestoreRuntimeError as caught: return None, caught, closes
        return result, None, closes

    def test_each_actual_restore_action_survives_instead_of_generic_loss(self):
        for action in M.ACTIONS:
            with self.subTest(action=action):
                self.calls.clear(); result, error, _ = self.invoke(action)
                self.assertIsNone(result)
                self.assertEqual(getattr(error, 'actionName', None), action)
                self.assertEqual(self.calls, list(M.ACTIONS[:M.ACTIONS.index(action) + 1]))
                self.assertIsNone(error.nativeExit); self.assertIsNone(error.runnerReturncode)
                self.assertNotIn('FICTIONAL_PRIVATE', str(error))

    def test_only_direct_matching_client_returncode_is_observed_never_native_or_stale_zero(self):
        for kind, expected in [('completed', 3), ('called', 7), ('receipt', 0),
                               ('wrong-argv', None), ('bool', None), ('timeout', None)]:
            with self.subTest(kind=kind):
                _, error, _ = self.invoke('restore-roles', kind=kind)
                self.assertEqual(error.actionName, 'restore-roles'); self.assertEqual(error.runnerReturncode, expected)
                self.assertIsNone(error.nativeExit)

    def test_first_failure_survives_cleanup_and_all_descriptors_still_close(self):
        _, error, closes = self.invoke('restore-render', close_failure=True)
        self.assertEqual(error.actionName, 'restore-render'); self.assertEqual(len(closes), 3)
        self.assertIsNone(error.nativeExit); self.assertIsNone(error.runnerReturncode)
        _, nested, _ = self.invoke('restore-roles', kind='nested')
        self.assertEqual((nested.actionName, nested.runnerReturncode), ('restore-create', 9))

    def test_before_and_after_whole_restore_do_not_invent_last_action_or_zero(self):
        _, before, _ = self.invoke(precondition_failure=True)
        self.assertEqual(self.calls, []); self.assertIsNone(before.actionName); self.assertIsNone(before.runnerReturncode)
        _, after, _ = self.invoke(failed_action=None, closure_failure=True)
        self.assertEqual(self.calls, list(M.ACTIONS)); self.assertIsNone(after.actionName)
        self.assertIsNone(after.runnerReturncode); self.assertIsNone(after.nativeExit)
        for action, code in [('private/path', 1), (True, True), ('restore-apply', 256), ('restore-check', 'private')]:
            error = M.RestoreRuntimeError(actionName=action, runnerReturncode=code)
            self.assertIsNone(error.nativeExit)
            if action not in M.ACTIONS: self.assertIsNone(error.actionName)
            if type(code) is not int or not -255 <= code <= 255: self.assertIsNone(error.runnerReturncode)

    def test_success_preserves_five_unchanged_actions_and_500_inactive_only_receipt(self):
        result, error, _ = self.invoke(failed_action=None)
        self.assertIsNone(error); self.assertEqual(self.calls, list(M.ACTIONS))
        self.assertEqual((result['steps'], result['profiles'], result['active']), (5, 500, 0))
        self.assertFalse(result['fullRestoreAccepted'] or result['acceptedAsCompleteBackup']
            or result['end500Started'] or result['mock500Started'] or result['executionAuthority'])

    def test_connection_workflow_runner_and_javascript_keep_closed_restore_action(self):
        # The actual runtime exception is supplied at the native seam. The
        # connection still performs its existing owned-container/watch cleanup.
        for action in M.ACTIONS:
            with self.subTest(action=action):
                _, error, _ = self.invoke(action, kind='called')
                fixture, connection = D.DiagnosticChecks().connection_fixture()
                # This helper registers its temporary files on its own case.
                # Own their cleanup explicitly because it is not run by unittest.
                self.addCleanup(fixture.doCleanups)
                fixture.restore.side_effect = error; fixture.watch_close_failure = True
                with patch.object(D.FC.R.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), \
                        self.assertRaises(D.FC.R.RestoreConnectionError) as got:
                    connection.restore_only(backup_completion=Mock(), export_diagnostic=True)
                self.assertEqual(got.exception.phase, action)
                self.assertEqual(fixture.stop_calls, [D.FC.CID]); self.assertEqual(fixture.watch.stopped, 1)
                phase = W._connection_failure_phase(got.exception, D.FC.R, 'restore')
                projected = R._worker_failure(W.WorkflowRejected(phase, D.sample()), 'WORKER_REPORTED_FAILURE')
                projected.cleanup = R.D.unknown_cleanup(); projected.refresh()
                observed = R._response_error(R._failure_packet(projected))
                failed = {'status': 'FAIL_W15_ISOLATED_WORKFLOW', **W._safe_failure(observed),
                    'executionAuthority': False, 'retryAllowed': False}
                rows = D.DiagnosticChecks().javascript_projection(failed)
                self.assertEqual(rows[-1]['worker'], {'phase': 'connection-' + action, 'memory': D.sample()})
                self.assertEqual(set(rows[-1]['cleanup'].values()), {'UNKNOWN'})


if __name__ == '__main__': unittest.main()
