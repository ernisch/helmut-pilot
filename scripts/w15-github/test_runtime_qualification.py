"""Static reviewer record and future observed context stay distinct."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('w15_qualification_fixture', Path(__file__).with_name('test_runtime_inputs.py'))
T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
R = T.R


class QualificationChecks(unittest.TestCase):
    def setUp(self):
        self.fixture = T.RuntimeInputChecks(); self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        f = self.fixture
        f.context['runAttempt'] = 1
        self.observed = {key: f.context[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')}
        self.observed.update(branch='refs/heads/codex/w15-github-end500-preparation-20261028', mode='end500-restore-gated')
        self.qualification = {'schema': 'helmut-w15-static-source-qualification/1',
            'scope': 'ISOLATED_GITHUB_W15_SOURCE_ONLY', 'status': 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW',
            'exactCommit': f.context['exactCommit'], 'sourcePins': f.now,
            'historicalDeltas': R._deltas(f.now, f.old), 'executionAuthority': False, 'testStarted': False}
        self.env = {'GITHUB_ACTIONS': 'true', 'GITHUB_SHA': f.context['exactCommit'],
            'GITHUB_REF': self.observed['branch'], 'GITHUB_RUN_ID': f.context['runId'], 'GITHUB_RUN_ATTEMPT': '1'}

    def call(self, qualification=None, observed=None, digest=None):
        f = self.fixture
        raw = json.dumps(self.qualification if qualification is None else qualification,
                         sort_keys=True, separators=(',', ':')).encode('ascii')
        with patch.dict(os.environ, self.env), patch.object(R.C, 'validate_context', return_value={'contextSHA256': 'c' * 64}), \
             patch.object(R, 'source_requirements', return_value=(f.now, f.old)), patch.object(R, '_require_commit_contents'):
            result, sha = R.observe_source_qualification(f.context, raw, digest or T.SHA(raw),
                self.observed if observed is None else observed, f.repo)
            self.assertEqual(T.SHA(result), sha)
            return R.validate_source_review(f.context, result, sha, f.repo)

    def test_future_run_binding_does_not_claim_a_new_independent_runtime_review(self):
        review = self.call()
        self.assertEqual(review['qualification'], self.qualification)
        self.assertEqual(review['observedContext'], self.observed)
        self.assertNotEqual(review['status'], 'PASS_INDEPENDENT_CURRENT_SOURCE_AND_ADAPTER_REVIEW')
        self.assertFalse(review['executionAuthority'])

    def test_changed_code_commit_review_or_digest_is_rejected(self):
        for key, replacement in [('exactCommit', 'b' * 40), ('sourcePins', {}),
                                 ('historicalDeltas', []), ('executionAuthority', True), ('testStarted', True),
                                 ('status', 'PASS')]:
            bad = copy.deepcopy(self.qualification); bad[key] = replacement
            with self.subTest(key=key), self.assertRaises(R.RuntimeInputError): self.call(qualification=bad)
        with self.assertRaises(R.RuntimeInputError): self.call(digest='f' * 64)

    def test_observed_run_branch_attempt_mode_and_nonce_cannot_drift(self):
        for key, replacement in [('exactCommit', 'b' * 40), ('branch', 'refs/heads/main'),
                                 ('runId', '987654321'), ('runAttempt', 2), ('mode', 'standard'), ('nonce', 'x')]:
            bad = dict(self.observed); bad[key] = replacement
            with self.subTest(key=key), self.assertRaises(R.RuntimeInputError): self.call(observed=bad)
        self.env['GITHUB_RUN_ATTEMPT'] = '2'
        with self.assertRaises(R.RuntimeInputError): self.call()


if __name__ == '__main__': unittest.main()
