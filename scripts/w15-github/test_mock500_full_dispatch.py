"""Fictional dispatch seams only: no network, GPG, originals, DB or units."""
import sys
sys.dont_write_bytecode = True

import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zlib

SPEC = importlib.util.spec_from_file_location('mock_full_sender_tested', Path(__file__).with_name('mock500_full_dispatch.py'))
D = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(D)
TARGET, LAUNCHER, BASELINE = 'a' * 40, 'b' * 40, 'c' * 40
NONCE = '11111111-2222-4333-8444-555555555555'
PRIVATE = 'FICTIONAL_PRIVATE_SIGNATURE_NOT_VALID'


def envelope(value):
    raw = D.canonical(value).decode('ascii')
    return {'raw': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest()}


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 31, 10, tzinfo=timezone.utc)
    def __call__(self): return self.value
    def advance(self, seconds): self.value += timedelta(seconds=seconds)


class API:
    def __init__(self, case):
        self.case = case; self.posts = []; self.post_error = False; self.branch = TARGET
        self.end_bad = None; self.review_bad = None; self.ci_bad = None; self.environment_bad = False
        self.get_error = None
        self.prior_run = {'id': 87654321, 'head_sha': BASELINE, 'head_branch': D.BRANCH,
            'event': 'workflow_dispatch', 'status': 'completed', 'conclusion': 'success',
            'run_attempt': 1, 'workflow_id': D.WORKFLOW}

    def __call__(self, method, path, body=None):
        t = self.case; t.events.append((method, path))
        if method == 'POST':
            self.posts.append(body)
            if self.post_error: raise RuntimeError(PRIVATE)
            return None
        if path == self.get_error: raise RuntimeError(PRIVATE)
        if path == '/actions/runs/87654321': return self.prior_run
        if path.startswith('/pulls/'):
            end, launcher = path == '/pulls/997', path == '/pulls/999'
            records = [copy.deepcopy(t.end)] if end else [t.review(launcher)] + ([] if launcher else [copy.deepcopy(t.bridge)])
            if self.end_bad and end: records[0].update(self.end_bad)
            if self.review_bad and not end: records[0].update(self.review_bad)
            return {'state': 'open', 'merged': False, 'head': {'sha': BASELINE if end else LAUNCHER if launcher else TARGET},
                    'body': '\n'.join('```json\n' + D.canonical(row).decode() + '\n```' for row in records)}
        if '/jobs?' in path:
            return {'total_count': 2, 'jobs': [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in D.M.CHECKS]}
        if path.startswith('/actions/runs/'):
            return {'head_sha': TARGET if path.endswith('11111111') else LAUNCHER,
                    'status': 'completed', 'conclusion': self.ci_bad or 'success', 'workflow_id': D.WORKFLOW}
        if path.startswith('/actions/workflows/'):
            return {'id': D.WORKFLOW, 'state': 'active', 'path': '.github/workflows/ci.yml'}
        if path.endswith('/deployment-branch-policies'):
            return {'total_count': 1, 'branch_policies': [{'name': D.BRANCH, 'type': 'branch'}]}
        if path.startswith('/environments/'):
            return {'name': D.ENVIRONMENT, 'deployment_branch_policy': {'protected_branches': self.environment_bad, 'custom_branch_policies': True},
                    'protection_rules': [{'type': 'branch_policy'}]}
        if path.startswith('/git/ref/'): return {'object': {'sha': self.branch}}
        raise AssertionError('unexpected synthetic route')


class MockFullDispatchChecks(unittest.TestCase):
    def setUp(self):
        self.clock = Clock(); self.events = []; self.api = API(self)
        qualification = {'schema': 'helmut-w15-static-source-qualification/1', 'scope': 'ISOLATED_GITHUB_W15_SOURCE_ONLY',
            'status': 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW', 'exactCommit': TARGET, 'sourcePins': {},
            'historicalDeltas': [], 'executionAuthority': False, 'testStarted': False}
        q = D.canonical(qualification)
        self.qualification = {'encoding': 'zlib-base64', 'sha256': hashlib.sha256(q).hexdigest(), 'data': base64.b64encode(zlib.compress(q)).decode()}
        self.end = {'schema': 'helmut-w15-independent-end500-acceptance/2', 'scope': D.PC.SCOPES[D.PC.END_MODE],
            'status': 'PASS_INDEPENDENT_GITHUB_END500_PHASED_ACCEPTANCE', 'exactCommit': BASELINE,
            'runId': '87654321', 'runAttempt': 1, 'receiptSHA256': 'd' * 64,
            'resourceContract': D.PC.END_PROFILE, 'commonLifetimeMemoryAccepted': False,
            **{key: True for key in ('processingMemoryAccepted', 'backupSafetyAccepted', 'independentRestoreFunctionAccepted', 'completeBackupAccepted')},
            'profiles': 500, 'activeProfiles': 0, 'inputManifestSHA': D.S.INPUT_SHA,
            'recipientFingerprint': D.S.FINGERPRINT, 'productionAcceptance': False, 'mock500Acceptance': False, 'executionAuthority': False}
        self.bridge = {'schema': 'helmut-w15-mock500-baseline-bridge/1', 'status': 'PASS_INDEPENDENT_BASELINE_COMPATIBILITY_REVIEW',
            'baselineExactCommit': BASELINE, 'mockExactCommit': TARGET, 'sourceQualificationSHA256': self.qualification['sha256'],
            'end500AcceptanceSHA256': envelope(self.end)['sha256'], 'inputManifestSHA': D.S.INPUT_SHA,
            'recipientFingerprint': D.S.FINGERPRINT, 'end500CodeReexecuted': False,
            'mockMemoryContract': D.PC.MOCK_PROFILE, 'executionAuthority': False}
        assets = {key: {'bytes': row[1], 'sha256': row[2]} for key, row in D.D.FILES.items()}
        assets['originalReception'] = {'bytes': 12357, 'sha256': '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'}
        self.input_binding = {'schema': 'helmut-w15-mock500-static-input-binding/1', 'scope': D.R.SCOPE,
            'status': 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY', 'exactCommit': TARGET, 'assets': assets,
            'sourceComparison': {'status': 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON', 'originalSourceChecks': 16,
                'currentSourceChecks': 2, 'qualificationSHA256': assets['qualificationReport']['sha256'],
                'sourceDatesRewritten': False, 'originalsUnchanged': True}, 'executionAuthority': False, 'testStarted': False}
        issued = D.M.iso(self.clock()); expires = D.M.iso(self.clock() + timedelta(hours=1))
        bindings = {'end500Acceptance': envelope(self.end), 'compatibilityBridge': envelope(self.bridge),
            'inputBindingSHA256': D.digest(self.input_binding), 'additionalAssetBytes': D.D.TOTAL, 'approvedEnd500Commit': BASELINE}
        inner = {'schema': 'helmut-w15-mock500-start-approval/1', 'scope': D.SCOPE, 'authorized': True,
            'mode': D.MODE, 'exactCommit': TARGET, 'branch': 'refs/heads/' + D.BRANCH, 'runAttempt': 1, 'nonce': NONCE,
            'sourceQualificationSHA256': self.qualification['sha256'], 'end500AcceptanceSHA256': bindings['end500Acceptance']['sha256'],
            'compatibilitySHA256': bindings['compatibilityBridge']['sha256'], 'limits': D.W.LIMITS,
            'processingSeconds': 10800, 'completionSeconds': 12600, 'expectedProfiles': 500, 'expectedUnits': 500,
            'expectedPositions': 1500, 'expectedControls': 8000, 'maxProviderCalls': 0, 'maxStorageUSD': '0.05',
            'maxReceiveAttempts': 1, 'issuedAt': issued, 'expiresAt': expires}
        self.request = {'nonce': NONCE, 'sourceQualification': self.qualification, 'approval': inner,
            'limits': D.W.LIMITS, 'maximumWallSeconds': 12600, 'bindings': bindings}
        self.go = {'schema': 'helmut-w15-mock500-full-dispatch-approval/1', 'scope': D.SCOPE, 'authorized': True,
            'targetCommit': TARGET, 'launcherCommit': LAUNCHER, 'branch': D.BRANCH, 'environment': D.ENVIRONMENT,
            'workflowId': D.WORKFLOW, 'nonce': NONCE, 'runAttempt': 1, 'maxReceiveAttempts': 1,
            'targetCI': 11111111, 'targetPR': 998, 'reviewSHA256': D.digest(self.review()), 'launcherCI': 22222222,
            'launcherPR': 999, 'launcherReviewSHA256': D.digest(self.review(True)),
            'sourceQualificationSHA256': self.qualification['sha256'], 'end500PR': 997,
            'end500AcceptanceSHA256': bindings['end500Acceptance']['sha256'], 'compatibilitySHA256': bindings['compatibilityBridge']['sha256'],
            'inputBindingSHA256': bindings['inputBindingSHA256'], 'requestSHA256': D.digest(self.request),
            'advanceAllowedBranch': False, 'stateDir': '/tmp/pending', 'issuedAt': issued, 'expiresAt': expires}
        self.git = SimpleNamespace(check_launcher=Mock(), qualify=Mock())

    def review(self, launcher=False):
        return {'schema': D.LAUNCHER_REVIEW_SCHEMA if launcher else D.REVIEW_SCHEMA, 'scope': D.SCOPE,
            'exactCommit': LAUNCHER if launcher else TARGET, 'status': 'PASS_INDEPENDENT_STATIC_CODE_REVIEW_ONLY',
            'independentOfImplementation': True, 'remainingCriticalOrHighCodeFindings': 0, 'executionAuthority': False,
            **({} if launcher else {'sourceQualificationSHA256': self.qualification['sha256'], 'inputBindingSHA256': D.digest(self.input_binding)})}

    def run_case(self, margin=180, encode_delay=0, cleanup=None, state=None, mutation=None, encrypted_padding=48):
        if state is None:
            temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-mock-full-'); self.addCleanup(temporary.cleanup)
            state = Path(temporary.name); state.chmod(0o700)
        self.go['stateDir'] = str(state)
        def links():
            self.events.append(('LINKS', None))
            query = D.M.urllib.parse.urlencode({'sp': 'r', 'sr': 'b', 'se': D.M.iso(self.clock() + timedelta(seconds=margin)), 'sig': PRIVATE})
            values = {'original': ['https://fictional.oaiusercontent.com/part-' + str(i) + '?' + query for i in range(15)],
                      'archive': 'https://fictional.oaiusercontent.com/archive?' + query}
            if mutation: mutation(values)
            return values
        def encrypt(raw, target, root, *, index_schema):
            self.events.append(('ENCRYPT', None)); self.clock.advance(encode_delay)
            self.assertEqual(index_schema, D.INDEX_SCHEMA); self.index = json.loads(raw)
            data = base64.b64encode(b'\x84' + b'x' * encrypted_padding).decode()
            return '-----BEGIN PGP MESSAGE-----\n\n' + '\n'.join(data[i:i + 64] for i in range(0, len(data), 64)) + '\n-----END PGP MESSAGE-----'
        return D.execute(self.go, TARGET, LAUNCHER, self.request, self.input_binding,
            api=self.api, git=self.git, now=self.clock, encrypt=encrypt, link_provider=links,
            ready=lambda: self.events.append(('READY', None)), state_dir=state, cleanup=cleanup)

    def test_preparation_then_fresh_combined_index_and_one_post(self):
        self.git.qualify.side_effect = lambda *args: self.clock.advance(300)
        result = self.run_case()
        self.assertTrue(result['dispatchAccepted']); self.assertFalse(result['mock500Accepted'])
        ready = self.events.index(('READY', None))
        self.assertLess(self.events.index(('GET', '/actions/runs/87654321')), ready)
        self.assertTrue(all(method not in ('GET', 'PATCH') for method, path in self.events[ready:]))
        self.assertEqual(len(self.api.posts), 1)
        inputs = self.api.posts[0]['inputs']
        self.assertEqual(set(inputs), {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'})
        self.assertEqual(inputs['w15_mode'], D.MODE); self.assertEqual(inputs['expected_commit'], TARGET)
        self.assertEqual(self.index['inputBinding'], D.canonical(self.input_binding).decode())
        self.assertEqual(len(self.index['original']['parts']), 15)
        self.assertEqual(self.index['assets']['format'], D.A.FORMAT)
        self.assertNotIn(PRIVATE, json.dumps(result)); self.assertNotIn(PRIVATE, json.dumps(self.api.posts))

    def test_approval_limits_counts_commit_request_binding_and_scope_fail_closed(self):
        for key, bad in [('scope', 'ISOLATED_GITHUB_END500_ONLY'), ('authorized', False), ('targetCommit', BASELINE),
                         ('advanceAllowedBranch', True), ('runAttempt', 2), ('maxReceiveAttempts', 2), ('inputBindingSHA256', '0' * 64)]:
            with self.subTest(key=key):
                saved = self.go[key]; self.go[key] = bad; self.events.clear()
                self.assertFalse(self.run_case()['dispatchAttempted']); self.assertNotIn(('READY', None), self.events)
                self.go[key] = saved
        self.request['approval']['expectedControls'] = 7999; self.go['requestSHA256'] = D.digest(self.request)
        self.assertFalse(self.run_case()['dispatchAttempted'])

    def test_all_prior_review_ci_environment_branch_gates_precede_ready(self):
        for field, bad in [('end_bad', {'processingMemoryAccepted': False}), ('review_bad', {'executionAuthority': True}),
                           ('ci_bad', 'failure'), ('environment_bad', True), ('branch', BASELINE)]:
            with self.subTest(field=field):
                previous = getattr(self.api, field); setattr(self.api, field, bad); self.events.clear()
                result = self.run_case(); setattr(self.api, field, previous)
                self.assertFalse(result['dispatchAttempted']); self.assertNotIn(('READY', None), self.events)
        self.api.prior_run['head_sha'] = TARGET; self.events.clear()
        self.assertEqual(self.run_case()['firstFailedPhase'], 'end500-run')
        self.assertNotIn(('READY', None), self.events)

    def test_expiry_both_packages_encryption_latency_and_no_retry(self):
        for margin, delay in [(90, 0), (180, 90)]:
            with self.subTest(margin=margin, delay=delay):
                self.clock = Clock(); result = self.run_case(margin=margin, encode_delay=delay)
                self.assertEqual(result['firstFailedPhase'], 'link' if margin == 90 else 'final-expiry')
                self.assertFalse(result['dispatchAttempted'])
        self.assertEqual(self.api.posts, [])
        self.clock = Clock(); result = self.run_case(mutation=lambda values: values.update(archive=values['original'][0]))
        self.assertEqual(result['firstFailedPhase'], 'link'); self.assertFalse(result['dispatchAttempted'])

    def test_explicit_bridge_input_binding_and_missing_prior_api_fail_before_ready(self):
        self.input_binding['exactCommit'] = BASELINE
        self.events.clear(); result = self.run_case()
        self.assertEqual(result['firstFailedPhase'], 'input-binding'); self.assertNotIn(('READY', None), self.events)
        self.input_binding['exactCommit'] = TARGET
        self.bridge['mockMemoryContract'] = 'unapproved-profile'
        self.events.clear(); result = self.run_case()
        self.assertEqual(result['firstFailedPhase'], 'bridge'); self.assertNotIn(('READY', None), self.events)
        self.bridge['mockMemoryContract'] = D.PC.MOCK_PROFILE
        for path, phase in [('/pulls/997', 'end500-acceptance'), ('/actions/runs/87654321', 'end500-run')]:
            self.api.get_error = path; self.events.clear(); result = self.run_case()
            self.assertEqual(result['firstFailedPhase'], phase); self.assertNotIn(('READY', None), self.events)

    def test_owner_expiry_and_actual_utc_berlin_window_before_ready_and_final_post(self):
        D.check_start_window(datetime(2026, 10, 31, 19, 29, 59, tzinfo=timezone.utc))
        for at in [datetime(2026, 10, 31, 19, 30, tzinfo=timezone.utc), datetime(2026, 11, 1, 10, tzinfo=timezone.utc)]:
            with self.assertRaises(D.DispatchRejected): D.check_start_window(at)
        self.clock.advance(3600); self.events.clear()
        self.assertEqual(self.run_case()['firstFailedPhase'], 'approval'); self.assertNotIn(('READY', None), self.events)
        self.clock = Clock(); self.clock.value = datetime(2026, 10, 31, 19, 29, 50, tzinfo=timezone.utc)
        for obj in (self.go, self.request['approval']):
            obj['issuedAt'] = D.M.iso(self.clock()); obj['expiresAt'] = D.M.iso(self.clock() + timedelta(hours=1))
        self.go['requestSHA256'] = D.digest(self.request)
        result = self.run_case(encode_delay=20)
        self.assertEqual(result['firstFailedPhase'], 'start-window'); self.assertFalse(result['dispatchAttempted'])
        self.assertEqual(self.api.posts, [])

    def test_matching_digest_but_invalid_static_schema_or_pin_never_requests_links(self):
        valid = copy.deepcopy(self.input_binding)
        for kind in ('schema', 'pin'):
            with self.subTest(kind=kind):
                self.input_binding = copy.deepcopy(valid)
                if kind == 'schema': self.input_binding['schema'] = 'unapproved-input-binding'
                else: self.input_binding['assets']['qualifiedRows']['sha256'] = '0' * 64
                approved_digest = D.digest(self.input_binding)
                self.go['inputBindingSHA256'] = approved_digest
                self.request['bindings']['inputBindingSHA256'] = approved_digest
                self.go['requestSHA256'] = D.digest(self.request)
                self.go['reviewSHA256'] = D.digest(self.review())
                self.events.clear(); result = self.run_case()
                self.assertEqual(result['firstFailedPhase'], 'input-binding')
                self.assertNotIn(('READY', None), self.events); self.assertNotIn(('LINKS', None), self.events)
                self.assertEqual(self.api.posts, [])

    def test_oversize_payload_single_unknown_post_and_first_error_cleanup(self):
        # A valid-shaped armored parameter fits alone, but the actual serialized
        # combined request does not. Exercise the unchanged real payload helper.
        self.assertEqual(self.run_case(encrypted_padding=47000)['firstFailedPhase'], 'payload')
        self.api.post_error = True; result = self.run_case(cleanup=Mock(side_effect=RuntimeError(PRIVATE)))
        self.assertEqual(len(self.api.posts), 1); self.assertTrue(result['dispatchAttempted'])
        self.assertFalse(result['dispatchAccepted']); self.assertEqual(result['firstFailedPhase'], 'dispatch')
        self.assertEqual(result['secondaryCleanupFailures'], ['stdin-restore'])
        self.assertNotIn(PRIVATE, json.dumps(result)); self.assertFalse(result['retryAllowed'])

    def test_safe_persisted_cleanup_receipt_keeps_first_failure(self):
        self.api.post_error = True
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-cleanup-') as name:
            state = Path(name); state.chmod(0o700)
            result = self.run_case(state=state, cleanup=Mock(side_effect=RuntimeError(PRIVATE)))
            saved = json.loads((state / ('RESULT_' + NONCE + '.SAFE.json')).read_bytes())
            self.assertEqual(saved['status'], result['status'])
            self.assertEqual(saved['firstFailedPhase'], 'dispatch'); self.assertNotIn(PRIVATE, json.dumps(saved))

    def test_same_attempt_cannot_dispatch_twice(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-once-') as name:
            state = Path(name); state.chmod(0o700)
            self.assertTrue(self.run_case(state=state)['dispatchAccepted'])
            self.assertFalse(self.run_case(state=state)['dispatchAttempted'])
            self.assertEqual(len(self.api.posts), 1)

    def test_framed_stdin_and_inert_cli(self):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, D.canonical({'original': ['fictional'] * 15, 'archive': 'fictional'}) + b'\n')
            instance = D.PrivateLinksInput.__new__(D.PrivateLinksInput)
            instance.descriptor = read_fd; instance.previous = None
            self.assertEqual(instance.read()['archive'], 'fictional')
        finally:
            os.close(write_fd); os.close(read_fd)
        result = subprocess.run([sys.executable, '-I', '-B', D.__file__], capture_output=True, check=False)
        self.assertEqual(result.returncode, 0); plan = json.loads(result.stdout)
        self.assertFalse(plan['executionAuthority']); self.assertEqual(plan['mode'], D.MODE)
        self.assertIs(D.Git, D.F.Git)


if __name__ == '__main__': unittest.main()
