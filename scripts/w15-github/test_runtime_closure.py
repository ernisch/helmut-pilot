"""Evaluate actual report expressions only; no controller import or execution."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).absolute().parents[1] / 'synthetik-500-w15-memory-forward.py'


class RuntimeClosureChecks(unittest.TestCase):
    def test_pre_backup_report_cannot_accept_common_lifetime(self):
        tree = ast.parse(SOURCE.read_text())
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and node.func.attr == 'save'
                 and node.args and isinstance(node.args[0], ast.Constant)
                 and node.args[0].value == 'CONTROLLER_RESULT.SAFE.json']
        self.assertEqual(len(calls), 1)
        code = compile(ast.Expression(calls[0].args[1]), 'actual-pre-backup-report', 'eval')
        scope = dict(failure=None, zero=True, actual_memory_accepted=True,
                     capacity_diagnostic=False, functional=False, physical_limit=2560000000, functional_closure_completed=True,
                     w=SimpleNamespace(stop_failure=None, cas_records=[None] * 500,
                                       maximum=1900000000, last={}, memory_failure=None, disk={}),
                     stop_failures=[], zero_check_failure=None, service_closure={},
                     M=SimpleNamespace(MEMORY={}, LIMIT=2560000000, MAXIMUM=2048000000, RESERVE=512000000),
                     final_sample_verified=True, future_capacity=None, final_audit={}, database_export={},
                     result={}, BUDGET={'minimumCommonHeadroomBytes': 67108864})
        runtime = eval(code, {**scope, 'inputs': object()})
        self.assertTrue(runtime['preBackupMemoryChecksPassed'])
        self.assertFalse(runtime['end500ActualMemoryAccepted'])
        self.assertFalse(runtime['fullLifetimeClosureAccepted'])
        self.assertFalse(runtime['full500Acceptance'])
        legacy = eval(code, {**scope, 'inputs': None})
        self.assertTrue(legacy['end500ActualMemoryAccepted'])
        diagnostic = eval(code, {**scope, 'inputs': object(), 'capacity_diagnostic': True,
            'physical_limit':4999999488, 'actual_memory_accepted':False,
            '_runtime_module':lambda _:SimpleNamespace(end_capacity_trace=lambda:SimpleNamespace(PROFILE='helmut-w15-end500-capacity-diagnostic/1'))})
        self.assertTrue(diagnostic['functionalProcessingClosureCompleted'])
        self.assertFalse(diagnostic['preBackupMemoryChecksPassed'])
        self.assertFalse(diagnostic['end500ActualMemoryAccepted'])
        self.assertEqual(diagnostic['physicalHardCapBytes'],4999999488)
        self.assertEqual(diagnostic['requiredPhysicalReserveBytes'],0)
        self.assertEqual(diagnostic['requiredHostReserveBytes'],2147483648)
        functional = eval(code, {**scope,'inputs':object(),'functional':True,'physical_limit':4999999488,
            'actual_memory_accepted':False,'common_resources':None,'functional_observation':lambda _:None,'_runtime_module':lambda _:SimpleNamespace(END_PROFILE='helmut-w15-end500-functional/1',CONTRACT='helmut-w15-isolated-functional/1')})
        self.assertEqual(functional['memoryContract'],'helmut-w15-end500-functional/1')
        self.assertEqual(functional['maximumAllowedPeakBytes'],4999999488)
        self.assertEqual(functional['historicalProcessingPeakBytes'],2048000000)
        self.assertFalse(functional['preBackupMemoryChecksPassed'])
        self.assertFalse(functional['legacyRegularMemoryAccepted'])

    def test_final_closure_retains_failure_and_requires_real_seal_result(self):
        tree = ast.parse(SOURCE.read_text())
        rows = [node.value for node in ast.walk(tree) if isinstance(node, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'closing' for t in node.targets)]
        self.assertEqual(len(rows), 1)
        code = compile(ast.Expression(rows[0]), 'actual-final-closure', 'eval')
        observed = {'lastReadbackValid': False, 'lastObservedKernelSample': {'kernelLifetimePeakBytes': 2048000001}}
        scope = {'common_resources': SimpleNamespace(last_observation=lambda: observed),'functional':False}
        for failure, sealed in ((None, None), ({'reason': 'late-budget-failure'}, None), (None, {'cipherBytes': 123})):
            with self.subTest(failure=failure, sealed=sealed):
                row = eval(code, {**scope, 'failure': failure, 'sealed_backup': sealed})
                self.assertEqual(row['failure'], failure)
                self.assertEqual(row['commonParent'], observed)
                self.assertEqual(row['localArchiveCreated'], sealed is not None)
                for key in ('end500ActualMemoryAccepted', 'fullLifetimeClosureAccepted',
                            'databaseRestoreObserved', 'remoteReadbackObserved', 'acceptedAsCompleteBackup'):
                    self.assertFalse(row[key])


if __name__ == '__main__':
    unittest.main()
