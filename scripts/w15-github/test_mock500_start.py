"""Synthetic admission/window edges; no source acquisition or Mock500 work."""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_mock_start_tests', Path(__file__).with_name('mock500_start.py'))
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
NOW = datetime(2026, 10, 29, 10, tzinfo=timezone.utc)


def envelope(value):
    raw = json.dumps(value, sort_keys=True) + '\n'
    return {'raw': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest()}


def sample():
    return {'configuredLimit': '2048000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
        'kernelLifetimePeakBytes': 12345, 'currentBytes': 1234,
        'events': {k: 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class StartChecks(unittest.TestCase):
    def setUp(self):
        # A fresh GitHub VM can have less than 300s uptime. Fictional elapsed
        # time must use its own monotonic clock rather than a negative origin.
        clock = patch.object(S.time, 'monotonic', return_value=1000.0)
        clock.start(); self.addCleanup(clock.stop)
        self.request = {'mode': S.MODE, 'branch': S.BRANCH, 'exactCommit': 'a' * 40, 'runAttempt': 1,
            'nonce': '11111111-2222-4333-8444-555555555555', 'limits': S.LIMITS,
            'sourceQualificationSHA256': 'b' * 64}
        self.observed = {k: self.request[k] for k in ('mode', 'branch', 'exactCommit', 'runAttempt', 'nonce')}
        self.observed['runId'] = '12345678'
        self.end = {'schema': 'helmut-w15-independent-end500-acceptance/1', 'scope': 'ISOLATED_GITHUB_END500_ONLY',
            'status': 'PASS_INDEPENDENT_GITHUB_END500_ACCEPTANCE', 'exactCommit': S.BASELINE_COMMIT,
            'runId': '87654321', 'runAttempt': 1, 'receiptSHA256': 'c' * 64,
            'resourceContract': 'helmut-w15-end500-memory-check/3', 'commonLifetimeMemoryAccepted': True,
            'completeBackupAccepted': True, 'independentRestoreAccepted': True,
            'profiles': 500, 'activeProfiles': 0, 'inputManifestSHA': S.INPUT_SHA,
            'recipientFingerprint': S.FINGERPRINT, 'productionAcceptance': False,
            'mock500Acceptance': False, 'executionAuthority': False}
        self.end_envelope = envelope(self.end)
        self.bridge = {'schema': 'helmut-w15-mock500-baseline-bridge/1',
            'status': 'PASS_INDEPENDENT_BASELINE_COMPATIBILITY_REVIEW', 'baselineExactCommit': S.BASELINE_COMMIT,
            'mockExactCommit': self.request['exactCommit'], 'sourceQualificationSHA256': 'b' * 64,
            'end500AcceptanceSHA256': self.end_envelope['sha256'], 'inputManifestSHA': S.INPUT_SHA,
            'recipientFingerprint': S.FINGERPRINT, 'end500CodeReexecuted': False,
            'mockMemoryContract': S.R.PROFILE, 'executionAuthority': False}
        self.bridge_envelope = envelope(self.bridge)
        self.approval = {'schema': 'helmut-w15-mock500-start-approval/1', 'scope': 'ISOLATED_GITHUB_MOCK500_ONLY',
            'authorized': True, **self.request, 'end500AcceptanceSHA256': self.end_envelope['sha256'],
            'compatibilitySHA256': self.bridge_envelope['sha256'], 'processingSeconds': 10800,
            'completionSeconds': 12600, 'expectedProfiles': 500, 'expectedUnits': 500,
            'expectedPositions': 1500, 'expectedControls': 8000, 'maxProviderCalls': 0,
            'maxStorageUSD': '0.05', 'maxReceiveAttempts': 1,
            'issuedAt': '2026-10-29T09:59:00Z', 'expiresAt': '2026-10-29T10:59:00Z'}
        self.request['approval'] = self.approval
        self.context = {'schema': 'helmut-w15-mock500-controller-context/1', 'scope': S.R.SCOPE,
            **{k: self.observed[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')}}
        self.resources = SimpleNamespace(profile=S.R.PROFILE, check_context=Mock(return_value=sample()))

    def admit(self):
        return S.validate_admission(self.request, self.end_envelope, compatibility_bridge=self.bridge_envelope,
                                    observed_context=self.observed, now=NOW)

    def guard(self, **changes):
        kwargs = {'compatibility_bridge': self.bridge_envelope, 'observed_context': self.observed,
            'started_at': NOW - timedelta(minutes=5), 'started_monotonic': time.monotonic() - 300, 'now': NOW}
        kwargs.update(changes)
        return S.StartGuard(self.context, self.approval, self.end_envelope, self.resources, **kwargs)

    def test_distinct_frozen_baseline_and_current_mock_commit_are_bound_without_rerun(self):
        result = self.admit()
        self.assertEqual(result['end500BaselineCommit'], S.BASELINE_COMMIT)
        self.assertEqual(result['exactCommit'], 'a' * 40)
        self.assertFalse(result['executionAuthority'])
        self.assertFalse(result['mock500Acceptance'])
        self.assertNotIn('runId', self.approval)

    def test_separate_go_observed_nonce_and_exact_counts_are_required(self):
        for key, bad in (('authorized', False), ('expectedControls', 7999), ('expectedPositions', 1499),
                         ('expectedProfiles', True), ('maxProviderCalls', 1), ('processingSeconds', 10801),
                         ('maxReceiveAttempts', 2)):
            old = self.approval[key]
            self.approval[key] = bad
            with self.subTest(key=key), self.assertRaises(S.StartRejected):
                self.admit()
            self.approval[key] = old
        self.approval['runId'] = self.observed['runId']
        with self.assertRaises(S.StartRejected):
            self.admit()

    def test_negative_end500_or_unreviewed_bridge_never_becomes_positive_mock_evidence(self):
        self.end['commonLifetimeMemoryAccepted'] = False
        self.end_envelope = envelope(self.end)
        with self.assertRaises(S.StartRejected):
            self.admit()
        self.end['commonLifetimeMemoryAccepted'] = True
        self.end_envelope = envelope(self.end)
        self.bridge['status'] = 'PENDING'
        self.bridge_envelope = envelope(self.bridge)
        with self.assertRaises(S.StartRejected):
            self.admit()

    def test_frozen_native_fixture_candidate_still_requires_positive_original_end500_acceptance(self):
        candidate = 'deb812f9e7e3a2d58e5b4e593a1eec00ef1e22d8'
        self.end.update(exactCommit=candidate, status='PASS_SYNTHETIC_NATIVE_FIXTURE_ONLY_START_BLOCKED')
        self.end_envelope = envelope(self.end)
        self.bridge.update(baselineExactCommit=candidate, end500AcceptanceSHA256=self.end_envelope['sha256'])
        self.bridge_envelope = envelope(self.bridge)
        self.approval.update(end500AcceptanceSHA256=self.end_envelope['sha256'],
                             compatibilitySHA256=self.bridge_envelope['sha256'])
        with self.assertRaisesRegex(S.StartRejected, 'POSITIVE_FROZEN_END500_ACCEPTANCE_REQUIRED'):
            S.validate_admission(self.request, self.end_envelope,
                compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
                expected_end500_commit=candidate, now=NOW)

    def test_expired_start_go_or_wrong_actual_run_binding_is_rejected(self):
        self.approval['expiresAt'] = '2026-10-29T10:00:00Z'
        with self.assertRaises(S.StartRejected):
            self.admit()
        self.approval['expiresAt'] = '2026-10-29T10:59:00Z'
        self.observed['nonce'] = '99999999-2222-4333-8444-555555555555'
        with self.assertRaises(S.StartRejected):
            self.admit()

    def bind_receiver13_candidate(self, candidate='13b858b1a1e83a695e1fa64446573b5b550921ea'):
        self.end['exactCommit'] = candidate
        self.end_envelope = envelope(self.end)
        self.bridge.update(baselineExactCommit=candidate, end500AcceptanceSHA256=self.end_envelope['sha256'])
        self.bridge_envelope = envelope(self.bridge)
        self.approval.update(end500AcceptanceSHA256=self.end_envelope['sha256'],
                             compatibilitySHA256=self.bridge_envelope['sha256'])
        return candidate

    def test_receiver13_candidate_rejects_receive_native_fixture_and_incomplete_end500_records(self):
        changes = [('status', 'PASS_MOCK_ORIGINALS_RECEIVED_ONLY_START_BLOCKED'),
                   ('status', 'PASS_REAL_SYNTHETIC_CONNECTION_ONLY'),
                   ('status', 'PASS_SYNTHETIC_NATIVE_FIXTURE_ONLY_START_BLOCKED'),
                   ('commonLifetimeMemoryAccepted', False), ('completeBackupAccepted', False),
                   ('independentRestoreAccepted', False), ('profiles', 499), ('activeProfiles', 1),
                   ('resourceContract', 'helmut-w15-memory-check/2')]
        original = dict(self.end)
        for key, value in changes:
            with self.subTest(key=key, value=value):
                self.end = {**original, key: value}
                candidate = self.bind_receiver13_candidate()
                with self.assertRaisesRegex(S.StartRejected, 'POSITIVE_FROZEN_END500_ACCEPTANCE_REQUIRED'):
                    S.validate_admission(self.request, self.end_envelope,
                        compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
                        expected_end500_commit=candidate, now=NOW)

    def test_fictional_positive13_gate_keeps_bridge_distinct_head_and_separate_go_requirements(self):
        candidate = self.bind_receiver13_candidate()
        def admit():
            return S.validate_admission(self.request, self.end_envelope,
                compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
                expected_end500_commit=candidate, now=NOW)
        # Only fictional admission records: no real End500 or Mock acceptance.
        result = admit()
        self.assertEqual(result['end500BaselineCommit'], candidate)
        self.assertFalse(result['executionAuthority'] or result['mock500Acceptance'])
        self.approval['authorized'] = False
        with self.assertRaisesRegex(S.StartRejected, 'SEPARATE_EXPLICIT_GO_REQUIRED'): admit()
        self.approval['authorized'] = True
        self.bridge['status'] = 'PENDING'
        self.bridge_envelope = envelope(self.bridge)
        self.approval['compatibilitySHA256'] = self.bridge_envelope['sha256']
        with self.assertRaisesRegex(S.StartRejected, 'REVIEWED_BASELINE_BRIDGE_REQUIRED'): admit()
        self.request['exactCommit'] = candidate
        self.observed['exactCommit'] = candidate
        self.approval['exactCommit'] = candidate
        with self.assertRaises(S.StartRejected): admit()

    def test_export_diagnostic_prefix_cannot_be_used_as_positive_end500_acceptance(self):
        self.end['status'] = 'PASS_RESTORE_EXPORT_DIAGNOSTIC_ONLY_FULL_RESTORE_BLOCKED'
        candidate = self.bind_receiver13_candidate('a2d0f542df9526534c239e3db8291e366798a67a')
        with self.assertRaisesRegex(S.StartRejected, 'POSITIVE_FROZEN_END500_ACCEPTANCE_REQUIRED'):
            S.validate_admission(self.request, self.end_envelope,
                compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
                expected_end500_commit=candidate, now=NOW)

    def test_original_start_sets_same_three_hour_and_thirty_minute_window(self):
        guard = self.guard()
        self.assertEqual(guard.window, {'startsAtUTC': '2026-10-29T09:55:00.001Z',
            'endsAtUTC': '2026-10-29T12:55:00.000Z', 'completionDeadlineUTC': '2026-10-29T13:25:00.000Z'})
        with self.assertRaises(S.StartRejected):
            guard.before_dispatch(now=NOW + timedelta(hours=3))
        guard.closure_guard(now=NOW + timedelta(hours=3))
        with self.assertRaises(S.StartRejected):
            guard.before_dispatch(now=NOW)
        with self.assertRaises(S.StartRejected):
            guard.closure_guard(now=NOW + timedelta(hours=4))

    def test_native_duration_thresholds_remain_exclusive_and_first_failure_is_retained(self):
        for kind, maximum in (('auth', 30000), ('unit', 60000), ('provider', 20000)):
            guard = self.guard()
            self.assertEqual(guard.observe_duration(kind, maximum - .001), maximum - .001)
            with self.assertRaises(S.StartRejected):
                guard.observe_duration(kind, maximum)
            with self.assertRaises(S.StartRejected):
                guard.before_dispatch(now=NOW)
            guard.closure_guard(now=NOW)

    def test_plan_remains_locked_and_preserves_historical_failure(self):
        result = S.plan()
        self.assertTrue(result['status'].startswith('BLOCKED'))
        self.assertEqual(result['historicalMockFailure']['completedControls'], 1104)
        self.assertEqual(result['historicalMockFailure']['completedResults'], 207)
        self.assertFalse(result['historicalMockFailure']['acceptedAsPass'])
        self.assertFalse(result['executionAuthority'])

    def test_replacement_end500_baseline_requires_explicit_root_argument_and_matching_bridge(self):
        replacement = 'c' * 40
        self.end['exactCommit'] = replacement
        self.end_envelope = envelope(self.end)
        self.bridge.update({'baselineExactCommit': replacement,
                            'end500AcceptanceSHA256': self.end_envelope['sha256']})
        self.bridge_envelope = envelope(self.bridge)
        self.approval.update({'end500AcceptanceSHA256': self.end_envelope['sha256'],
                              'compatibilitySHA256': self.bridge_envelope['sha256']})
        with self.assertRaises(S.StartRejected):
            self.admit()
        accepted = S.validate_admission(self.request, self.end_envelope,
            compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
            expected_end500_commit=replacement, now=NOW)
        self.assertEqual(accepted['end500BaselineCommit'], replacement)
        with self.assertRaises(S.StartRejected):
            S.validate_admission(self.request, self.end_envelope,
                compatibility_bridge=self.bridge_envelope, observed_context=self.observed,
                expected_end500_commit='d' * 40, now=NOW)


if __name__ == '__main__':
    unittest.main()
