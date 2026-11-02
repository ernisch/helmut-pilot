"""Tiny actual Materials/copy/error seams; no Node, DB, original or 500 run."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent
CANARY = 'FICTIONAL_PRIVATE_INPUT_SQL_PATH_MUST_NOT_ESCAPE'
OUTPUTS = ('processing-materials.PRIVATE.json', 'current-command.PRIVATE.json',
           'mock-fixtures.PRIVATE.json', 'audit-inputs.PRIVATE.json')
LABELS = ('processing', 'command', 'fixtures', 'audit')

def load(name):
    spec = importlib.util.spec_from_file_location('materials_output_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

F, FIRST = map(load, ('test_mock500_inputs', 'test_mock500_first_failure'))

def fixed():
    return {'schema': 'helmut-w15-materials-first-failure/1',
            'category': 'MATERIALS_BINDING_CHECK_123', 'kind': 'assertion', 'stage': 'calendar'}

class MaterialsOutputChecks(unittest.TestCase):
    def fixture(self):
        case = F.ControllerAdmissionChecks('runTest'); self.addCleanup(case.doCleanups)
        return case, case.load_controller()

    def test_same_real_helper_enables_recorder_and_copies_all_four_in_order(self):
        _, controller = self.fixture()
        supervisor = SimpleNamespace(stage=Mock())
        environment = {'HELMUT_STORAGE_BACKEND': 'local'}
        with patch.object(controller, 'copy_in') as copied:
            controller._prepare_bound_materials(supervisor, environment)
        self.assertEqual(supervisor.stage.call_args.args[3]['HELMUT_W15_MATERIALS_DIAGNOSTIC'], '1')
        self.assertNotIn('HELMUT_W15_MATERIALS_DIAGNOSTIC', environment)
        self.assertEqual([call.args[0].name for call in copied.call_args_list], list(OUTPUTS))
        self.assertEqual([call.args[1] for call in copied.call_args_list],
                         [controller.BASE + '/state/' + name for name in OUTPUTS])

    def test_node_first_category_survives_actual_workflow_and_terminal_projection(self):
        _, controller = self.fixture()
        with tempfile.TemporaryDirectory(prefix='materials-node-fictional-') as tmp:
            root = Path(tmp); file = root / 'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json'
            file.write_text(json.dumps(fixed())); file.chmod(0o600)
            supervisor = SimpleNamespace(stage=Mock(side_effect=RuntimeError(CANARY)))
            with patch.object(controller, 'WORK', root), patch.object(controller, 'copy_in') as copied:
                with self.assertRaises(controller.Mock500ControllerFailure) as caught:
                    controller._prepare_bound_materials(supervisor, {})
            copied.assert_not_called()
        self.assertEqual(caught.exception.phase, 'mock500-controller-materials-calendar')
        self.assertEqual(caught.exception.materials_failure, fixed())
        self.assertNotIn(CANARY, str(caught.exception))
        forward = FIRST.FirstFailureChecks('runTest'); self.addCleanup(forward.doCleanups)
        public = forward.forwarded(caught.exception, controller.Mock500ControllerFailure)
        self.assertEqual(public['runner']['materialsFailure'], fixed())
        self.assertEqual(public['worker']['phase'], caught.exception.phase)

    def test_invalid_private_extra_large_or_symlink_never_becomes_public_category(self):
        _, controller = self.fixture()
        with tempfile.TemporaryDirectory(prefix='materials-invalid-fictional-') as tmp:
            root = Path(tmp); file = root / 'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json'
            for kind in ('private-extra', 'large', 'symlink'):
                with self.subTest(kind=kind):
                    if file.exists() or file.is_symlink(): file.unlink()
                    if kind == 'private-extra': file.write_text(json.dumps(dict(fixed(), raw=CANARY)))
                    elif kind == 'large': file.write_bytes(b'X' * 4097)
                    else: file.symlink_to(root / 'MISSING_PRIVATE_TARGET')
                    if not file.is_symlink(): file.chmod(0o600)
                    supervisor = SimpleNamespace(stage=Mock(side_effect=RuntimeError(CANARY)))
                    with patch.object(controller, 'WORK', root), patch.object(controller, 'copy_in') as copied:
                        with self.assertRaises(controller.Mock500ControllerFailure) as caught:
                            controller._prepare_bound_materials(supervisor, {})
                    copied.assert_not_called()
                    self.assertEqual(caught.exception.phase, 'mock500-controller-materials')
                    self.assertEqual(caught.exception.materials_failure['category'], 'MATERIALS_FAILURE_UNAVAILABLE')
                    self.assertNotIn(CANARY, json.dumps(caught.exception.materials_failure))

    def test_forged_or_nonmaterials_phase_cannot_attach_materials_metadata(self):
        _, controller = self.fixture()
        unrelated = controller.Mock500ControllerFailure('mock500-controller-setup', fixed())
        self.assertIsNone(unrelated.materials_failure)
        with patch.object(controller, '_mock_module', side_effect=PermissionError(CANARY)):
            inaccessible = controller.Mock500ControllerFailure('mock500-controller-materials', fixed())
        self.assertEqual(inaccessible.phase, 'mock500-controller-materials')
        self.assertIsNone(inaccessible.materials_failure)
        class Lookalike(RuntimeError):
            phase = 'mock500-controller-materials-calendar'
            materials_failure = fixed()
        modified = controller.Mock500ControllerFailure('mock500-controller-materials-calendar', fixed())
        modified.phase = []
        for error in (Lookalike(CANARY), modified):
            forward = FIRST.FirstFailureChecks('runTest'); self.addCleanup(forward.doCleanups)
            public = forward.forwarded(error, controller.Mock500ControllerFailure)
            self.assertNotIn('materialsFailure', public.get('runner', {}))

    def test_optional_witness_close_error_cannot_replace_first_node_failure(self):
        _, controller = self.fixture()
        with tempfile.TemporaryDirectory(prefix='materials-close-fictional-') as tmp:
            root = Path(tmp); file = root / 'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json'
            file.write_text(json.dumps(fixed())); file.chmod(0o600)
            supervisor = SimpleNamespace(stage=Mock(side_effect=RuntimeError(CANARY)))
            with patch.object(controller, 'WORK', root), \
                    patch.object(controller.os, 'close', side_effect=OSError('FICTIONAL_LATER_FD_CLOSE')) as close:
                with self.assertRaises(controller.Mock500ControllerFailure) as caught:
                    controller._prepare_bound_materials(supervisor, {})
            # Release this test's deliberately unclosed descriptor after the seam.
            for call in close.call_args_list: os.close(call.args[0])
            self.assertEqual(caught.exception.phase, 'mock500-controller-materials-calendar')
            self.assertEqual(caught.exception.materials_failure, fixed())

    def test_every_copy_failure_has_its_own_first_operation_without_retry(self):
        _, controller = self.fixture()
        for at, label in enumerate(LABELS):
            with self.subTest(operation=label):
                supervisor = SimpleNamespace(stage=Mock())
                def fail(source, destination):
                    if source.name == OUTPUTS[at]: raise PermissionError(CANARY)
                with patch.object(controller, 'copy_in', side_effect=fail) as copied:
                    with self.assertRaises(controller.Mock500ControllerFailure) as caught:
                        controller._prepare_bound_materials(supervisor, {})
                self.assertEqual(copied.call_count, at + 1)
                self.assertEqual(caught.exception.phase, 'mock500-controller-materials-copy-' + label)
                self.assertEqual(caught.exception.materials_failure['kind'], 'filesystem')
                self.assertEqual(caught.exception.materials_failure['stage'], 'output')

    def test_existing_scoped_diagnosis_runs_copies_then_zero_without_units_or_bootstrap(self):
        for failed in (*OUTPUTS, None):
            helper, _ = self.fixture()
            copied = []
            def inject(fixture, controller):
                original = controller.copy_in
                def copying(source, destination):
                    if source.name in OUTPUTS:
                        copied.append(source.name)
                        if source.name == failed: raise PermissionError(CANARY)
                    return original(source, destination)
                task = patch.object(controller, 'copy_in', side_effect=copying)
                task.start(); fixture.addCleanup(task.stop)
            with self.subTest(failed=failed):
                result, events = helper._run_fictional_bound_pipeline(inject=inject, diagnostic=True)
                self.assertEqual((result['units'], result['providerPhases'], result['activeProfiles']), (0, 0, 0))
                self.assertIs(result['materialsCompleted'], failed is None)
                self.assertEqual(len(copied), len(OUTPUTS) if failed is None else OUTPUTS.index(failed) + 1)
                if failed:
                    self.assertEqual(result['firstFailure']['category'], 'MATERIALS_PROCESS_REJECTED')
                for forbidden in ('prepare', 'run', 'audit', 'backup'):
                    self.assertNotIn(forbidden, events)

    def test_later_cleanup_does_not_replace_the_actual_first_copy_failure(self):
        helper, _ = self.fixture()
        def inject(fixture, controller):
            original_copy, original_docker = controller.copy_in, controller.docker
            def copying(source, destination):
                if source.name == OUTPUTS[1]: raise PermissionError(CANARY)
                return original_copy(source, destination)
            def docker(*args, **kwargs):
                if args[0] == 'stop': raise OSError('FICTIONAL_LATER_STOP')
                return original_docker(*args, **kwargs)
            for target, name, replacement in ((controller, 'copy_in', copying), (controller, 'docker', docker)):
                task = patch.object(target, name, side_effect=replacement)
                task.start(); fixture.addCleanup(task.stop)
        with self.assertRaises(RuntimeError) as caught:
            helper._run_fictional_bound_pipeline(inject=inject, diagnostic=True, expect_failure=True)
        self.assertEqual(caught.exception.phase, 'mock500-controller-materials-copy-command')
        self.assertEqual(caught.exception.materials_failure['category'], 'MATERIALS_PROCESS_REJECTED')
        self.assertNotIn(CANARY, str(caught.exception))

if __name__ == '__main__': unittest.main()
