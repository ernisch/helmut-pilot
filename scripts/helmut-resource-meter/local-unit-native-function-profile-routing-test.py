"""Pure routing tests: no native imports, files created, processes, or database."""
import argparse
import ast
import contextlib
import io
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent


def definitions(name, symbols, namespace):
    tree = ast.parse((ROOT / name).read_text())
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef))
                and node.name in symbols]
    if {node.name for node in selected} != set(symbols):
        raise AssertionError('required actual routing definitions missing')
    exec(compile(ast.Module(body=selected, type_ignores=[]), name, 'exec'), namespace)
    return namespace


ARGS = definitions('local-unit-native-supervisor.py', ['arguments'], {'argparse': argparse})['arguments']
SELECT = definitions('local-unit-native-execution-controller.py',
                     ['ExecutionError', 'need', 'transaction_guard_entry'], {})['transaction_guard_entry']


class Routing(unittest.TestCase):
    def test_normal_guard_routes_unchanged(self):
        for case in ('state', 'same-root-usage', 'late-old-mirror', 'late-outside'):
            with self.subTest(case=case):
                args = ARGS(['--diagnose-native-transaction-guard', '--transaction-guard-case', case])
                self.assertFalse(args.profile_functions)
                self.assertEqual(SELECT({'nativeDiagnosticMode': 'native-transaction-guard-v1',
                                         'transactionGuardCase': case}),
                                 'local-unit-native-transaction-guard.js')

    def test_explicit_profile_only(self):
        args = ARGS(['--diagnose-native-transaction-guard', '--transaction-guard-case',
                     'same-root-usage', '--profile-functions'])
        self.assertTrue(args.profile_functions)
        self.assertEqual(SELECT({'nativeDiagnosticMode': 'native-transaction-guard-v1',
                                 'transactionGuardCase': 'same-root-usage',
                                 'transactionGuardFunctionProfile': True}),
                         'local-unit-native-function-profile.js')

    def test_no_profile_in_other_modes(self):
        for mode in ('--run-native-single-unit', '--diagnose-native-claim-only',
                     '--diagnose-native-readonly-http', '--qualify-native-bindings', '--qualify-native-store'):
            with self.subTest(mode=mode), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    ARGS([mode, '--profile-functions'])

    def test_no_profile_other_case(self):
        for case in ('state', 'late-old-mirror', 'late-outside'):
            with self.subTest(case=case), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    ARGS(['--diagnose-native-transaction-guard', '--transaction-guard-case', case,
                          '--profile-functions'])

    def test_no_implicit_profile_case(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            ARGS(['--diagnose-native-transaction-guard', '--profile-functions'])

    def test_no_profile_config_for_entry(self):
        for mode in (None, 'fresh-claim-only-v1', 'readonly-http-pre-admission-v1'):
            with self.subTest(mode=mode), self.assertRaises(RuntimeError):
                SELECT({'nativeDiagnosticMode': mode, 'transactionGuardCase': 'same-root-usage',
                        'transactionGuardFunctionProfile': True})

    def test_strict_boolean(self):
        for value in (None, 0, 1, 'true', [], {}):
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                SELECT({'nativeDiagnosticMode': 'native-transaction-guard-v1',
                        'transactionGuardCase': 'same-root-usage', 'transactionGuardFunctionProfile': value})

    def test_no_profile_config_wrong_case(self):
        for case in (None, 'state', 'late-old-mirror', 'late-outside', '../entry.js'):
            with self.subTest(case=case), self.assertRaises(RuntimeError):
                SELECT({'nativeDiagnosticMode': 'native-transaction-guard-v1',
                        'transactionGuardCase': case, 'transactionGuardFunctionProfile': True})


if __name__ == '__main__':
    unittest.main()
