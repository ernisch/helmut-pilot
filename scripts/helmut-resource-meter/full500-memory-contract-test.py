#!/usr/bin/env python3
"""Pure finalize regression: synthetic receipts; no Docker, DB, GO or workload."""
import importlib.util
import itertools
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.umask(0o077)
OUT = Path(sys.argv[1]).resolve()
OUT.mkdir(mode=0o700, parents=True, exist_ok=False)
SELECTION = sys.argv[2:]
SPEC = importlib.util.spec_from_file_location('memory_contract_isolation', Path(__file__).with_name('isolation.py'))
I = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(I)
CASES = itertools.count(1)


def write(path, value):
    with path.open('x') as stream:
        json.dump(value, stream)
        stream.write('\n')
    path.chmod(0o600)


def finish_case(common_peak, *, common_present=True, common_end=True, all500=True, full=True):
    case = OUT / ('case-%02d' % next(CASES))
    case.mkdir(mode=0o700)
    app_out = case/'application'; app_out.mkdir(mode=0o700)
    db_out = case/'database'; db_out.mkdir(mode=0o700)
    selector = {'operationId': 'TEST_ONLY_NO_AUTHORITY'}
    write(app_out/'RUNNER_RESULT.SAFE.json', {'pass': True, 'firstNativeDatabaseSnapshotBeforeAnyStage': None})
    write(db_out/'DATABASE_FINAL.SAFE.json', {'storageBound': {'provenUpperBytes': 8000000000}})
    write(case/'SEQUENCE_RESULT.SAFE.json', {'pass': True, 'all500FinalACK': all500, 'mode': 'combined500', 'selector': selector})
    write(case/'ASSEMBLY_RESULT.SAFE.json', {'pass': True, 'selector': selector})
    recipe = {'scope': 'owner-approved-local500-resources' if full else 'small-meter-validation',
              'originalSequenceResultPath': str(case/'SEQUENCE_RESULT.SAFE.json'),
              'assemblyResultPath': str(case/'ASSEMBLY_RESULT.SAFE.json'),
              'expectedFreshOperationId': selector['operationId']}
    parent = 'helmut-meter-test-only-no-authority'
    db_parent = parent if common_present else parent+'-separate'
    database = {'out': str(db_out), 'containerId': 'b'*64, 'parent': db_parent+'/database',
                'ownedContainerNames': ['TEST_ONLY_DB']}
    app = {'out': str(app_out), 'containerId': 'a'*64, 'parent': parent+'/application',
           'ownedContainerNames': ['TEST_ONLY_APP'], 'database': database}
    native = {'memoryPeakBytes': 1024*1024, 'memoryEvents': {'oom_kill': 0},
              'fullLastProcessExitCovered': True, 'events': {'populated': 0}}

    def kernel(group, *, require_empty=False):
        if require_empty is not True:
            raise AssertionError('finalization must require last-process exit')
        if group in [app['parent'], database['parent']]:
            return dict(native)
        if group != parent:
            raise AssertionError('unexpected group')
        return {**native, 'memoryPeakBytes': common_peak,
                'fullLastProcessExitCovered': common_end, 'events': {'populated': 0 if common_end else 1}}

    def docker(argv, **kwargs):
        if argv[0] == 'wait' and argv[1] in ['a'*64, 'b'*64]:
            return subprocess.CompletedProcess(argv, 0, '0\n', '')
        if argv == ['inspect', '--format', '{{.Id}}', 'TEST_ONLY_APP', 'TEST_ONLY_DB']:
            return subprocess.CompletedProcess(argv, 0, 'a'*64+'\n'+'b'*64+'\n', '')
        if argv == ['ps', '--all', '--quiet']:
            return subprocess.CompletedProcess(argv, 0, '', '')
        raise AssertionError('unexpected Docker API request: '+repr(argv))

    with patch.object(I.K, 'docker', side_effect=docker), \
         patch.object(I.K, 'kernel_snapshot', side_effect=kernel), \
         patch.object(I, 'container_log_counts', return_value=[]), \
         patch.object(I, 'verify_final_recipe', return_value=recipe), \
         patch.object(I.subprocess, 'run', side_effect=AssertionError('actual subprocess forbidden')):
        result = I.finalize(app)
    stored = json.loads((app_out/'COMPLETE_RESOURCE_RESULT.SAFE.json').read_text())
    if stored != result:
        raise AssertionError('returned and persisted acceptance differ')
    return result


class Full500MemoryContract(unittest.TestCase):
    def test_small_app_common_at_or_above_hard_limit_fails(self):
        for peak in [2048000000, 2050535424]:
            with self.subTest(commonPeak=peak):
                r = finish_case(peak)
                self.assertFalse(r['pass'])
                self.assertFalse(r['simultaneousAllOwnedUnder2048DecimalMB'])
                self.assertEqual(r['requestedMemoryBuffer']['status'], 'FAIL')
                self.assertEqual(r['requestedMemoryBuffer']['reason'], 'INSUFFICIENT_BUFFER')

    def test_hard_limit_stays_strict_and_buffer_stays_separate(self):
        r = finish_case(2047999999)
        self.assertTrue(r['pass'])
        self.assertEqual(r['requestedMemoryBuffer']['reserveBytes'], 1)
        self.assertEqual(r['requestedMemoryBuffer']['status'], 'FAIL')

    def test_exact_requested_buffer_boundary_passes(self):
        r = finish_case(1548000000)
        self.assertTrue(r['pass'])
        self.assertEqual(r['requestedMemoryBuffer'], {'requestedBytes': 500000000,
            'maximumCommonPeakBytes': 1548000000, 'completeRunWithCommonExitEvidence': True,
            'reserveBytes': 500000000, 'status': 'PASS', 'reason': 'SUFFICIENT_BUFFER'})

    def test_one_byte_above_buffer_boundary_does_not_fail_hard_limit(self):
        r = finish_case(1548000001)
        self.assertTrue(r['pass'])
        self.assertEqual(r['requestedMemoryBuffer']['reserveBytes'], 499999999)
        self.assertEqual(r['requestedMemoryBuffer']['status'], 'FAIL')
        self.assertEqual(r['requestedMemoryBuffer']['reason'], 'INSUFFICIENT_BUFFER')

    def test_missing_common_evidence_fails_closed(self):
        r = finish_case(None, common_present=False)
        self.assertFalse(r['pass'])
        self.assertEqual(r['requestedMemoryBuffer']['status'], 'FAIL')
        self.assertEqual(r['requestedMemoryBuffer']['reason'], 'INCOMPLETE_FULL_RUN')
        self.assertIsNone(r['requestedMemoryBuffer']['reserveBytes'])

    def test_common_end_not_covered_fails_closed(self):
        r = finish_case(1400000000, common_end=False)
        self.assertFalse(r['pass'])
        self.assertFalse(r['simultaneousAllOwnedUnder2048DecimalMB'])
        self.assertEqual(r['requestedMemoryBuffer']['reason'], 'INCOMPLETE_FULL_RUN')
        self.assertIsNone(r['requestedMemoryBuffer']['reserveBytes'])

    def test_incomplete_500_cannot_claim_buffer(self):
        r = finish_case(1400000000, all500=False)
        self.assertFalse(r['pass'])
        self.assertEqual(r['requestedMemoryBuffer']['status'], 'FAIL')
        self.assertEqual(r['requestedMemoryBuffer']['reason'], 'INCOMPLETE_FULL_RUN')
        self.assertIsNone(r['requestedMemoryBuffer']['reserveBytes'])

    def test_small_validation_scope_unchanged(self):
        r = finish_case(2050535424, full=False)
        self.assertTrue(r['pass'])
        self.assertNotIn('requestedMemoryBuffer', r)
        self.assertNotIn('simultaneousAllOwnedUnder2048DecimalMB', r)


suite = unittest.main(argv=[sys.argv[0], *SELECTION], exit=False, verbosity=2)
write(OUT/'TEST_RESULT.SAFE.json', {'pass': suite.result.wasSuccessful(), 'testsRun': suite.result.testsRun,
    'failures': len(suite.result.failures), 'errors': len(suite.result.errors),
    'DockerCallsActuallyMade': 0, 'databasesStarted': 0, 'validOwnerGOCreated': False,
    'full500Runs': 0, 'resourceGOConsumed': False, 'production': False})
raise SystemExit(0 if suite.result.wasSuccessful() else 1)
