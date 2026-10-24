#!/usr/bin/env python3
"""Pure AST-isolated final-check cases; no worker import or original-file I/O."""
import ast
import copy
import io
import json
from pathlib import Path
import types
import unittest
from unittest import mock


WORKER = Path(__file__).with_name('local-unit-native-worker.py')
TREE = ast.parse(WORKER.read_text(), filename=str(WORKER))
CAPTURE = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'capture_final_original_failure')
HELPERS = [n for n in TREE.body if isinstance(n, ast.FunctionDef)
           and n.name in ('stop', 'failure_text', 'capture_first_failure', 'close_native_children')]
MAIN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
START = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Assign)
             and isinstance(n.targets[0], ast.Tuple)
             and [v.id for v in n.targets[0].elts] == ['original_preserved', 'sources_preserved'])
START -= 1  # Include propagation of terminal cleanup errors.
END = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Assign)
           and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'accepted')
CODE = compile(ast.Module(body=[CAPTURE, *HELPERS, *MAIN.body[START:END + 1]], type_ignores=[]), str(WORKER), 'exec')
REPORT_END = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Expr)
                  and isinstance(n.value, ast.Call) and isinstance(n.value.func, ast.Name)
                  and n.value.func.id == 'save' and n.value.args[0].value == 'NATIVE_QUALIFICATION.SAFE.json')
REPORT_CODE = compile(ast.Module(body=[CAPTURE, *HELPERS, *MAIN.body[START:REPORT_END + 1]], type_ignores=[]), str(WORKER), 'exec')
FRESH_INIT = next(n for n in MAIN.body if isinstance(n, ast.Assign)
                  and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'fresh_binding_result')
QUALIFY = next(n for n in ast.walk(MAIN) if isinstance(n, ast.If) and isinstance(n.test, ast.Compare)
               and isinstance(n.test.left, ast.Call) and n.test.left.args
               and isinstance(n.test.left.args[0], ast.Constant) and n.test.left.args[0].value == 'qualifyNativeBindings')
QUALIFY_TRY = next(n for n in ast.walk(MAIN) if isinstance(n, ast.Try) and QUALIFY in n.body)
MOTOR_END = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Assign)
                 and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'actual_motor_calls')
MOTOR_CODE = compile(ast.fix_missing_locations(ast.Module(body=[CAPTURE, *HELPERS, FRESH_INIT,
    ast.Try(body=[QUALIFY], handlers=QUALIFY_TRY.handlers, orelse=[], finalbody=[]),
    *MAIN.body[START:MOTOR_END + 1]], type_ignores=[])), str(WORKER), 'exec')


class NoMessageError(OSError):
    def __str__(self):
        raise AssertionError('Exception text must not be inspected')


class FailingStderr(io.StringIO):
    def write(self, value):
        raise OSError(32, 'simulated stderr failure')


class FinalCaptureTests(unittest.TestCase):
    def run_motor_result(self, *, requested, execution_error=False, late_original_failure=False):
        raw = {'path': 'raw', 'bytes': 1, 'sha256': 'a' * 64}
        binding_calls, saved = [], []

        class Marker:
            def __truediv__(self, name):
                assert name == 'MOTOR_ENTRY_REQUESTED.SAFE.json'
                return self
            def exists(self):
                return requested

        def qualify(*args):
            binding_calls.append('qualify')
            if execution_error:
                raise RuntimeError('simulated execution failure')
            return {'motorCalls': 1}

        def pin(name):
            self.assertEqual(name, 'raw')
            if late_original_failure:
                raise PermissionError(13, 'simulated final original failure')
            return copy.deepcopy(raw)

        module_name = 'isolated_worker_final_count'
        state = {'__name__': module_name, 'Path': Path, 'pin': pin,
                 'save': lambda name, value: saved.append((name, value)), 'OUT': Marker(),
                 'sys': types.SimpleNamespace(stderr=io.StringIO(), modules={module_name: object()}),
                 'load': lambda *args: types.SimpleNamespace(qualify=qualify), 'pg': object(), 'catalog': {},
                 'config': {'raw': raw, 'sources': [], 'qualifyNativeBindings': True,
                            'bindingPreparationPin': {}, 'executeNativeSingleUnit': True},
                 'original_before': copy.deepcopy(raw), 'failure': None, 'result': {'motorCalls': 0},
                 'codes': {'postgres': 0}, 'CHILDREN': [], 'closure_errors': [], 'FINALIZATION_SIGNALS': {}}
        exec(MOTOR_CODE, state)
        self.assertEqual(binding_calls, ['qualify'])
        return state

    def run_final(self, *, path=None, mismatch=False, primary=None, persistence_failure=False, stderr_failure=False,
                  deep=False, interrupt_at=None, closure_errors=None, report=False):
        raw = {'path': 'raw', 'bytes': 1, 'sha256': 'a' * 64}
        sources = [{'path': 'source-' + str(i), 'bytes': 1, 'sha256': 'b' * 64} for i in range(3)]
        pins = {p['path']: p for p in [raw, *sources]}
        calls, saves = [], []
        stderr = FailingStderr() if stderr_failure else io.StringIO()

        def raise_deep(depth):
            if depth:
                return raise_deep(depth - 1)
            raise NoMessageError(5, 'not rendered')

        def pin(name):
            calls.append(name)
            if name == interrupt_at:
                state['stop'](15, None)
                state['stop'](15, None)
            if name == path:
                if mismatch:
                    return {**pins[name], 'bytes': 2}
                if deep:
                    raise_deep(24)
                raise PermissionError(13, 'simulated read failure')
            return copy.deepcopy(pins[name])

        def save(name, value):
            if persistence_failure:
                raise OSError(28, 'simulated capture failure')
            saves.append((name, copy.deepcopy(value)))

        state = {'pin': pin, 'save': save, 'Path': Path, 'sys': types.SimpleNamespace(stderr=stderr),
                 'config': {'raw': raw, 'sources': sources}, 'original_before': copy.deepcopy(raw),
                 'failure': primary, 'result': {'originalRAWUnchanged': True}, 'codes': {'postgres': 0}, 'CHILDREN': [],
                 'closure_errors': closure_errors or [], 'FINALIZING': True, 'FINALIZATION_SIGNALS': {},
                 'fresh_binding_result': None}
        exec(REPORT_CODE if report else CODE, state)
        return state, calls, saves, stderr.getvalue()

    def check_capture(self, saves, phase, index, count, kind, errno):
        self.assertEqual(len(saves), 1)
        name, dto = saves[0]
        self.assertEqual(name, 'FINAL_ORIGINAL_CHECK_FAILURE.PRIVATE.json')
        self.assertEqual(set(dto), {'schema', 'phase', 'sourceIndex', 'checkedCount', 'exceptionType', 'errno', 'stack', 'stackTruncated'})
        self.assertEqual(dto['schema'], 'helmut-local-unit-final-original-check-failure/1')
        self.assertEqual((dto['phase'], dto['sourceIndex'], dto['checkedCount'], dto['exceptionType'], dto['errno']),
                         (phase, index, count, kind, errno))
        self.assertTrue(0 < len(dto['stack']) <= 12)
        for frame in dto['stack']:
            self.assertEqual(set(frame), {'file', 'function', 'line'})
            self.assertNotIn('/', frame['file'])
            self.assertLessEqual(len(frame['file']), 160)
            self.assertLessEqual(len(frame['function']), 96)
            self.assertIs(type(frame['line']), int)
        self.assertLess(len(json.dumps(dto)), 8192)
        return dto

    def test_success_order_and_no_capture(self):
        state, calls, saves, stderr = self.run_final()
        self.assertEqual(calls, ['raw', 'source-0', 'source-1', 'source-2'])
        self.assertTrue(state['original_preserved'] and state['sources_preserved'] and state['accepted'])
        self.assertIsNone(state['failure'])
        self.assertEqual((saves, stderr), ([], ''))

    def test_raw_pin_and_compare_failures_stop_before_sources(self):
        for mismatch in (False, True):
            with self.subTest(mismatch=mismatch):
                state, calls, saves, stderr = self.run_final(path='raw', mismatch=mismatch)
                self.assertEqual(calls, ['raw'])
                self.assertFalse(state['original_preserved'] or state['sources_preserved'] or state['accepted'])
                self.check_capture(saves, 'raw-compare' if mismatch else 'raw-pin', None, 0,
                                   'AssertionError' if mismatch else 'PermissionError', None if mismatch else 13)
                self.assertEqual(stderr, '')

    def test_source_pin_and_compare_failures_keep_checked_count(self):
        for mismatch in (False, True):
            with self.subTest(mismatch=mismatch):
                state, calls, saves, stderr = self.run_final(path='source-1', mismatch=mismatch)
                self.assertEqual(calls, ['raw', 'source-0', 'source-1'])
                self.assertTrue(state['original_preserved'])
                self.assertFalse(state['sources_preserved'] or state['accepted'])
                self.check_capture(saves, 'source-compare' if mismatch else 'source-pin', 1, 1,
                                   'AssertionError' if mismatch else 'PermissionError', None if mismatch else 13)
                self.assertEqual(stderr, '')

    def test_existing_primary_failure_is_unchanged(self):
        primary = 'ExecutionError: prior-failure'
        for path in (None, 'raw', 'source-1'):
            with self.subTest(path=path):
                state, _, _, _ = self.run_final(path=path, primary=primary)
                self.assertEqual(state['failure'], primary)
                self.assertFalse(state['accepted'])

    def test_followup_interrupt_finishes_all_pins_but_never_accepts(self):
        for primary in (None, 'ExecutionError: first-cause'):
            for interrupt_at in ('raw', 'source-1'):
                with self.subTest(primary=primary, interrupt_at=interrupt_at):
                    state, calls, saves, _ = self.run_final(primary=primary, interrupt_at=interrupt_at)
                    self.assertEqual(calls, ['raw', 'source-0', 'source-1', 'source-2'])
                    self.assertTrue(state['original_preserved'] and state['sources_preserved'])
                    self.assertFalse(state['accepted'] or state['FINALIZING'])
                    self.assertEqual(state['FINALIZATION_SIGNALS'], {'15': 2})
                    self.assertEqual(state['failure'], primary or 'native finalization interrupted')
                    self.assertEqual(saves, [])
                    with self.assertRaises(InterruptedError): state['stop'](15, None)

    def test_cleanup_failure_does_not_skip_readbacks_or_mask_first_error(self):
        for primary in (None, 'ExecutionError: first-cause'):
            state, calls, _, _ = self.run_final(primary=primary, closure_errors=['postgres-close-PermissionError', 'log-save-FileExistsError'])
            self.assertEqual(calls, ['raw', 'source-0', 'source-1', 'source-2'])
            self.assertFalse(state['accepted'])
            self.assertEqual(state['failure'], primary or 'postgres-close-PermissionError')

    def test_report_distinguishes_verified_originals_from_failed_execution(self):
        state, _, saves, _ = self.run_final(interrupt_at='raw', report=True)
        report = saves[-1][1]
        self.assertEqual(saves[-1][0], 'NATIVE_QUALIFICATION.SAFE.json')
        self.assertFalse(report['pass'])
        self.assertTrue(report['originalPostrunPreserved'] and report['originalSourcePinsUnchanged'])
        self.assertEqual(report['finalizationSignals'], {'15': 2})
        self.assertEqual(report['finalOriginalChecks'], {'complete': True, 'sourcePinsChecked': 3, 'sourcePinsExpected': 3})
        self.assertFalse(state['FINALIZING'])

    def test_report_never_claims_mutation_or_completed_checks_from_raw_read_error(self):
        _, _, saves, _ = self.run_final(path='raw', primary='ExecutionError: first-cause', report=True)
        report = saves[-1][1]
        self.assertFalse(report['pass'] or report['originalPostrunPreserved'] or report['originalSourcePinsUnchanged'] or report['originalRAWUnchanged'])
        self.assertEqual(report['failure'], 'ExecutionError: first-cause')
        self.assertEqual(report['finalOriginalChecks'], {'complete': False, 'sourcePinsChecked': 0, 'sourcePinsExpected': 3})

    def test_pg_and_log_cleanup_errors_remain_separate_and_real(self):
        state, _, _, _ = self.run_final()
        events = []
        pg = types.SimpleNamespace(returncode=None)
        pg.poll = lambda: pg.returncode
        pg.send_signal = mock.Mock(side_effect=PermissionError(13, 'synthetic-deny'))
        def kill():
            events.append('kill'); pg.returncode = -9
        pg.kill = kill
        pg.wait = lambda **kw: pg.returncode
        row = {'thread': mock.Mock(), 'eof': False, 'overflow': False, 'error': None,
               'label': 'POSTGRES', 'data': b''}
        row['thread'].join.side_effect = RuntimeError('synthetic-join-failure')
        state.update({'LOGS': [row], 'OUT': Path('/synthetic-only'),
                      'signal': types.SimpleNamespace(SIGINT=2),
                      'os': types.SimpleNamespace(O_WRONLY=1, O_CREAT=2, O_EXCL=4, O_NOFOLLOW=8,
                          open=mock.Mock(side_effect=FileExistsError(17, 'synthetic-existing-log')))})
        codes, errors = state['close_native_children'](pg)
        self.assertEqual(codes, {'postgres': -9})
        self.assertEqual(events, ['kill'])
        self.assertEqual(errors, ['postgres-close-PermissionError', 'native-child-log-close-RuntimeError',
                                  'native-child-log-save-FileExistsError'])

    def test_first_failure_capture_cannot_replace_bad_message_with_cleanup_error(self):
        state, _, saves, _ = self.run_final()
        state['capture_first_failure'](NoMessageError(5, 'private'))
        self.assertEqual(saves[0][0], 'NATIVE_FIRST_FAILURE.PRIVATE.json')
        self.assertEqual(saves[0][1]['message'], 'exception-message-unavailable')

    def test_generic_controller_wrapper_retains_private_original_cause(self):
        state, _, saves, _ = self.run_final()
        error = RuntimeError('generic-public-failure-no-retry')
        error.native_first_failure = PermissionError(13, 'synthetic-first-source-failure')
        state['capture_first_failure'](error)
        self.assertEqual(saves[0][1]['exceptionType'], 'PermissionError')
        self.assertEqual(saves[0][1]['message'], '[Errno 13] synthetic-first-source-failure')

    def test_first_failure_persistence_error_has_valid_closed_json_fallback(self):
        state, _, _, _ = self.run_final()
        output = io.StringIO()
        state['sys'].stderr = output
        state['json'] = json
        state['save'] = mock.Mock(side_effect=OSError(28, 'private sentinel'))
        state['capture_first_failure'](RuntimeError('private primary sentinel'))
        self.assertEqual(json.loads(output.getvalue()), {
            'schema': 'helmut-local-unit-native-first-failure-capture/1',
            'code': 'private-capture-not-persisted'})
        self.assertNotIn('sentinel', output.getvalue())

    def test_persistence_failure_never_heals_or_claims_capture(self):
        for primary in (None, 'ExecutionError: prior-failure'):
            with self.subTest(primary=primary):
                state, calls, saves, stderr = self.run_final(path='source-1', primary=primary, persistence_failure=True)
                self.assertEqual(calls, ['raw', 'source-0', 'source-1'])
                self.assertTrue(state['original_preserved'])
                self.assertFalse(state['sources_preserved'] or state['accepted'])
                self.assertEqual(state['failure'], primary or 'final source verification failed: PermissionError')
                self.assertEqual(saves, [])
                self.assertEqual(json.loads(stderr), {'schema': 'helmut-local-unit-final-original-capture-failure/1',
                                                      'code': 'private-capture-not-persisted'})

    def test_bounded_stack_has_no_exception_message_or_locals(self):
        state, _, saves, stderr = self.run_final(path='raw', deep=True)
        self.assertFalse(state['accepted'])
        dto = self.check_capture(saves, 'raw-pin', None, 0, 'NoMessageError', 5)
        self.assertEqual(len(dto['stack']), 12)
        self.assertTrue(dto['stackTruncated'])
        self.assertEqual(stderr, '')


    def test_capture_and_stderr_failures_do_not_mask_primary_or_end_report(self):
        for primary in (None, 'ExecutionError: prior-failure'):
            with self.subTest(primary=primary):
                state, calls, saves, stderr = self.run_final(path='source-1', primary=primary,
                                                           persistence_failure=True, stderr_failure=True)
                self.assertEqual(calls, ['raw', 'source-0', 'source-1'])
                self.assertTrue(state['original_preserved'])
                self.assertFalse(state['sources_preserved'] or state['accepted'])
                self.assertEqual(state['failure'], primary or 'final source verification failed: PermissionError')
                self.assertEqual((saves, stderr), ([], ''))


    def test_requested_execution_failure_does_not_reuse_preparation_zero(self):
        state = self.run_motor_result(requested=True, execution_error=True)
        self.assertTrue(state['requested'])
        self.assertEqual(state['result']['motorCalls'], 0)
        self.assertIsNone(state['fresh_binding_result'])
        self.assertIsNone(state['actual_motor_calls'])
        self.assertEqual(state['failure'], 'RuntimeError: simulated execution failure')
        self.assertFalse(state['accepted'])

    def test_execution_failure_without_entry_request_keeps_zero(self):
        state = self.run_motor_result(requested=False, execution_error=True)
        self.assertFalse(state['requested'])
        self.assertEqual(state['actual_motor_calls'], 0)
        self.assertEqual(state['failure'], 'RuntimeError: simulated execution failure')
        self.assertFalse(state['accepted'])

    def test_returned_one_survives_later_original_check_failure(self):
        for late_failure in (False, True):
            with self.subTest(late_failure=late_failure):
                state = self.run_motor_result(requested=True, late_original_failure=late_failure)
                self.assertEqual(state['actual_motor_calls'], 1)
                self.assertEqual(state['fresh_binding_result'], {'motorCalls': 1})
                self.assertEqual(state['accepted'], not late_failure)
                self.assertEqual(state['failure'], 'final source verification failed: PermissionError' if late_failure else None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
