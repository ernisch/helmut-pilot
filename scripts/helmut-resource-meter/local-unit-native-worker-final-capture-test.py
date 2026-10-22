#!/usr/bin/env python3
"""Pure AST-isolated final-check cases; no worker import or original-file I/O."""
import ast
import copy
import io
import json
from pathlib import Path
import types
import unittest


WORKER = Path(__file__).with_name('local-unit-native-worker.py')
TREE = ast.parse(WORKER.read_text(), filename=str(WORKER))
CAPTURE = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'capture_final_original_failure')
MAIN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
START = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Assign)
             and isinstance(n.targets[0], ast.Tuple)
             and [v.id for v in n.targets[0].elts] == ['original_preserved', 'sources_preserved'])
END = next(i for i, n in enumerate(MAIN.body) if isinstance(n, ast.Assign)
           and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'accepted')
CODE = compile(ast.Module(body=[CAPTURE, *MAIN.body[START:END + 1]], type_ignores=[]), str(WORKER), 'exec')


class NoMessageError(OSError):
    def __str__(self):
        raise AssertionError('Exception text must not be inspected')


class FailingStderr(io.StringIO):
    def write(self, value):
        raise OSError(32, 'simulated stderr failure')


class FinalCaptureTests(unittest.TestCase):
    def run_final(self, *, path=None, mismatch=False, primary=None, persistence_failure=False, stderr_failure=False, deep=False):
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
                 'failure': primary, 'result': {}, 'codes': {'postgres': 0}, 'CHILDREN': []}
        exec(CODE, state)
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


if __name__ == '__main__':
    unittest.main(verbosity=2)
