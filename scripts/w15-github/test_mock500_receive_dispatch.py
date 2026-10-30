"""Fictional ordering/clock/attempt proofs; no real links, API or cipher reads."""
import sys
sys.dont_write_bytecode = True
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_timing_dispatch_tested', Path(__file__).with_name('mock500_receive_dispatch.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
LAUNCHER = 'a' * 40
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'
PRIVATE = 'FICTIONAL_SIGNATURE_NOT_A_CREDENTIAL'


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc)
    def __call__(self): return self.value
    def advance(self, seconds): self.value += timedelta(seconds=seconds)


def armor(count=48):
    payload = base64.b64encode(b'\x84' + b'x' * count).decode('ascii')
    return '-----BEGIN PGP MESSAGE-----\n\n' + '\n'.join(payload[i:i+64] for i in range(0, len(payload), 64)) + '\n-----END PGP MESSAGE-----'


def review(schema, commit):
    return {'schema': schema, 'exactCommit': commit, 'status': 'PASS_INDEPENDENT_STATIC_CODE_REVIEW_ONLY',
        'independentOfImplementation': True, 'remainingCriticalOrHighCodeFindings': 0}


def approval(root, clock):
    return {'schema': 'helmut-w15-mock-original-receive-dispatch-approval/1',
        'scope': 'ISOLATED_GITHUB_MOCK_ORIGINALS_RECEIVE_ONLY', 'authorized': True,
        'receiverCommit': M.RECEIVER, 'launcherCommit': LAUNCHER, 'branch': M.BRANCH,
        'environment': M.ENVIRONMENT, 'workflowId': M.WORKFLOW, 'nonce': NONCE,
        'runAttempt': 1, 'maxReceiveAttempts': 1, 'receiverCI': M.RECEIVER_CI,
        'launcherCI': 12345678, 'launcherPR': 983, 'advanceAllowedBranch': True, 'stateDir': str(root),
        'receiverReviewSHA256': hashlib.sha256(M.canonical(review(M.RECEIVER_REVIEW, M.RECEIVER))).hexdigest(),
        'launcherReviewSHA256': hashlib.sha256(M.canonical(review(M.LAUNCHER_REVIEW, LAUNCHER))).hexdigest(),
        'issuedAt': M.iso(clock()), 'expiresAt': M.iso(clock() + timedelta(hours=1))}


def link(clock, seconds=150, **changes):
    query = {'se': M.iso(clock() + timedelta(seconds=seconds)), 'sp': 'r', 'sr': 'b', 'sig': PRIVATE}
    query.update(changes)
    return 'https://fictional.oaiusercontent.com/existing/opaque-object?' + M.urllib.parse.urlencode(query)


class API:
    def __init__(self, clock, events, *, delay=0, fail=None):
        self.clock, self.events, self.delay, self.fail = clock, events, delay, fail
        self.ref = 'b' * 40; self.posts = []; self.ref_reads = 0
    def __call__(self, method, path, body=None):
        self.events.append((method, path))
        if method == 'POST':
            self.posts.append(body)
            if self.fail == 'post': raise RuntimeError(PRIVATE)
            return None
        if self.fail == 'ci' and path.startswith('/actions/runs/'): raise RuntimeError(PRIVATE)
        if path.startswith('/pulls/'):
            receiver = path == '/pulls/' + str(M.RECEIVER_PR)
            commit, schema = (M.RECEIVER, M.RECEIVER_REVIEW) if receiver else (LAUNCHER, M.LAUNCHER_REVIEW)
            record = review(schema, commit)
            if self.fail == 'review': record['remainingCriticalOrHighCodeFindings'] = 1
            return {'state': 'open', 'merged': False, 'head': {'sha': commit}, 'body': '```json\n' + M.canonical(record).decode() + '\n```'}
        if path.startswith('/actions/runs/'):
            if '/jobs?' in path:
                jobs = [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in M.CHECKS]
                return {'total_count': 2, 'jobs': jobs}
            commit = M.RECEIVER if path == '/actions/runs/' + str(M.RECEIVER_CI) else LAUNCHER
            return {'head_sha': commit, 'status': 'completed', 'conclusion': 'success', 'workflow_id': M.WORKFLOW}
        if path.startswith('/actions/workflows/'):
            return {'id': M.WORKFLOW, 'state': 'active', 'path': '.github/workflows/ci.yml'}
        if path.endswith('/deployment-branch-policies'):
            return {'total_count': 1, 'branch_policies': [{'name': M.BRANCH, 'type': 'branch'}]}
        if path.startswith('/environments/'):
            return {'name': M.ENVIRONMENT, 'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True},
                'protection_rules': [{'type': 'branch_policy'}]}
        if method == 'PATCH':
            self.assert_patch = body
            if self.fail == 'patch': raise RuntimeError(PRIVATE)
            self.ref = body['sha']; return {'object': {'sha': self.ref}}
        if path.startswith('/git/ref/'):
            self.ref_reads += 1
            if self.ref_reads == 2:
                self.clock.advance(self.delay)
                if self.fail == 'readback': raise RuntimeError(PRIVATE)
            return {'object': {'sha': self.ref}}
        raise AssertionError('unknown fictional route')


class TimingChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-dispatch-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.root.chmod(0o700)
        self.clock = Clock(); self.events = []; self.api = API(self.clock, self.events)
        self.go = approval(self.root, self.clock)
        self.git = SimpleNamespace(check_launcher=Mock(), is_ancestor=Mock(return_value=True))

    def run_case(self, *, margin=150, encode_delay=0, encoded=None, provider=None, cleanup=None, state_dir=None):
        def ready(): self.events.append(('READY', None))
        def get_link():
            self.events.append(('LINK', None))
            return provider() if provider else link(self.clock, margin)
        def encrypt(raw, commit, root):
            self.events.append(('ENCRYPT', None)); self.clock.advance(encode_delay)
            self.assertEqual(commit, M.RECEIVER)
            self.assertEqual(json.loads(raw)['archive']['driveId'], M.H.DRIVE_ID)
            return armor() if encoded is None else encoded
        return M.execute(self.go, LAUNCHER, api=self.api, git=self.git, now=self.clock,
            encrypt=encrypt, link_provider=get_link, ready=ready, state_dir=state_dir or self.root, cleanup=cleanup)

    def test_delayed_preparation_finishes_before_ready_and_fresh_link_is_not_consumed(self):
        self.api.delay = 240
        result = self.run_case()
        self.assertEqual(result['status'], 'PASS_SINGLE_RECEIVE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING')
        self.assertFalse(result['originalReceptionAccepted'])
        self.assertTrue(result['branchChanged'] and result['dispatchAttempted'] and result['dispatchAccepted'])
        ready = self.events.index(('READY', None)); get_link = self.events.index(('LINK', None))
        self.assertLess(ready, get_link)
        self.assertTrue(all(method not in ('GET', 'PATCH') for method, path in self.events[ready:]))
        self.assertEqual(self.events[-1], ('POST', '/actions/workflows/' + str(M.WORKFLOW) + '/dispatches'))
        self.assertEqual(self.api.assert_patch, {'sha': M.RECEIVER, 'force': False})
        self.assertEqual(len(self.api.posts), 1)
        self.assertEqual(set(self.api.posts[0]['inputs']), {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'})
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_ci_or_review_failure_never_requests_a_fresh_link(self):
        for failure, phase in [('ci', 'receiver-ci'), ('review', 'receiver-review')]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); root.chmod(0o700)
                self.go['stateDir'] = str(root); self.api = API(self.clock, self.events, fail=failure)
                result = self.run_case(state_dir=root)
                self.assertEqual(result['firstFailedPhase'], phase)
                self.assertNotIn(('READY', None), self.events); self.assertNotIn(('LINK', None), self.events)
                self.assertEqual(self.api.posts, [])

    def test_actual_se_expiry_excludes90_seconds_and_accepts_more_than90(self):
        for seconds, expected in [(90, False), (89, False), (-1, False), (90.001, True)]:
            with self.subTest(seconds=seconds), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); root.chmod(0o700); self.go['stateDir'] = str(root)
                self.events.clear(); self.api = API(self.clock, self.events)
                result = self.run_case(margin=seconds, state_dir=root)
                self.assertEqual(result['dispatchAccepted'], expected)
                self.assertEqual(len(self.api.posts), int(expected))

    def test_slow_encryption_stops_before_post_and_does_not_extend_expiry(self):
        result = self.run_case(margin=150, encode_delay=61)
        self.assertEqual(result['firstFailedPhase'], 'final-expiry')
        self.assertFalse(result['dispatchAttempted']); self.assertEqual(self.api.posts, [])

    def test_expired_after_marker_fsync_is_checked_again_immediately_before_post(self):
        original = M.write_public
        def marker(fd, name, value):
            original(fd, name, value)
            if name.startswith('POST_ATTEMPT_'): self.clock.advance(61)
        with patch.object(M, 'write_public', side_effect=marker): result = self.run_case(margin=150)
        self.assertEqual(result['firstFailedPhase'], 'final-expiry'); self.assertFalse(result['dispatchAttempted'])
        self.assertTrue((self.root / ('POST_ATTEMPT_' + NONCE + '.SAFE.json')).exists())

    def test_malformed_write_or_ip_bound_sas_never_reaches_encryption_or_post(self):
        variants = [lambda: link(self.clock, sp='rw'), lambda: link(self.clock, sr='c'),
            lambda: link(self.clock, sip='127.0.0.1'), lambda: link(self.clock, sig=''),
            lambda: link(self.clock) + '&sp=r', lambda: link(self.clock).replace('https:', 'http:'),
            lambda: link(self.clock).replace('fictional.oaiusercontent.com', 'evil.example'),
            lambda: link(self.clock).replace('se=', 'missing='), lambda: link(self.clock) + '#fragment']
        for index, provider in enumerate(variants):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); root.chmod(0o700); self.go['stateDir'] = str(root)
                self.events.clear(); self.api = API(self.clock, self.events)
                result = self.run_case(provider=provider, state_dir=root)
                self.assertEqual(result['firstFailedPhase'], 'link')
                self.assertNotIn(('ENCRYPT', None), self.events); self.assertEqual(self.api.posts, [])

    def test_oversized_entire_parameter_payload_stops_before_post(self):
        result = self.run_case(encoded=armor(49100))
        self.assertEqual(result['firstFailedPhase'], 'payload'); self.assertEqual(self.api.posts, [])

    def test_ambiguous_post_consumes_attempt_and_retry_with_other_directory_is_rejected(self):
        self.api.fail = 'post'; result = self.run_case()
        self.assertEqual(result['firstFailedPhase'], 'dispatch')
        self.assertTrue(result['dispatchAttempted']); self.assertFalse(result['dispatchAccepted'])
        self.assertEqual(len(self.api.posts), 1)
        self.assertTrue((self.root / ('POST_ATTEMPT_' + NONCE + '.SAFE.json')).exists())
        repeated = self.run_case()
        self.assertEqual(repeated['firstFailedPhase'], 'private-root'); self.assertEqual(len(self.api.posts), 1)
        with tempfile.TemporaryDirectory() as tmp:
            other = Path(tmp); other.chmod(0o700)
            second = self.run_case(state_dir=other)
            self.assertEqual(second['firstFailedPhase'], 'approval'); self.assertEqual(len(self.api.posts), 1)

    def test_branch_change_truth_survives_readback_or_patch_ambiguity(self):
        for fault, phase, changed in [('readback', 'branch-readback', True), ('patch', 'branch-update', 'UNKNOWN')]:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); root.chmod(0o700); self.go['stateDir'] = str(root)
                self.events.clear(); self.api = API(self.clock, self.events, fail=fault)
                result = self.run_case(state_dir=root)
                self.assertEqual(result['firstFailedPhase'], phase); self.assertEqual(result['branchChanged'], changed)
                self.assertTrue(result['branchUpdateAttempted']); self.assertNotIn(('LINK', None), self.events)

    def test_primary_failure_survives_safe_receipt_or_terminal_cleanup_failures(self):
        self.api.fail = 'ci'; original = M.write_public
        def failed_result(fd, name, value):
            if name.startswith('RESULT_'): raise RuntimeError(PRIVATE)
            return original(fd, name, value)
        with patch.object(M, 'write_public', side_effect=failed_result):
            result = self.run_case(cleanup=Mock(side_effect=RuntimeError(PRIVATE)))
        self.assertEqual(result['firstFailedPhase'], 'receiver-ci')
        self.assertEqual(result['secondaryCleanupFailures'], ['stdin-restore', 'result-write'])
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_stdin_json_is_bounded_and_echo_is_disabled_before_ready(self):
        previous = [0, 0, 0, M.termios.ECHO | M.termios.ICANON, 0, 0, [b'\0'] * 32]
        events = []
        stdin = SimpleNamespace(fileno=lambda: 99, buffer=io.BytesIO(b'{"url":"FICTIONAL_PRIVATE_LINK"}\n'))
        with patch.object(M.sys, 'stdin', stdin), patch.object(M.os, 'isatty', return_value=True), \
                patch.object(M.termios, 'tcgetattr', return_value=previous), \
                patch.object(M.termios, 'tcflush'), \
                patch.object(M.select, 'select', return_value=([99], [], [])), \
                patch.object(M.os, 'read', return_value=b'{"url":"FICTIONAL_PRIVATE_LINK"}\n'), \
                patch.object(M.termios, 'tcsetattr', side_effect=lambda fd, when, cfg: events.append(('echo', bool(cfg[3] & M.termios.ECHO)))), \
                patch('builtins.print', side_effect=lambda *args, **kwargs: events.append(('print', args[0]))):
            private = M.PrivateLinkInput(); private.ready(); value = private.read()
        self.assertEqual(events, [('echo', False), ('print', 'READY_FOR_FRESH_PRIVATE_LINK'), ('echo', True)])
        self.assertEqual(value, 'FICTIONAL_PRIVATE_LINK')
        self.assertNotIn('FICTIONAL_PRIVATE_LINK', str(events))

    def test_private_read_deadline_and_long_noncanonical_frame(self):
        from unittest.mock import call
        previous = [0, 0, 0, M.termios.ECHO | M.termios.ICANON, 0, 0, [b'\0'] * 32]
        raw = M.canonical({'url': 'x' * 4096}) + b'\n'
        for timeout in (False, True):
            with self.subTest(timeout=timeout), patch.object(M.sys, 'stdin', SimpleNamespace(fileno=lambda: 99)), \
                    patch.object(M.os, 'isatty', return_value=True), \
                    patch.object(M.termios, 'tcgetattr', return_value=previous), \
                    patch.object(M.termios, 'tcflush') as flush, \
                    patch.object(M.termios, 'tcsetattr') as tty, \
                    patch.object(M.select, 'select', return_value=([] if timeout else [99], [], [])), \
                    patch.object(M.os, 'read', side_effect=[raw[:4096], raw[4096:]]), patch('builtins.print'):
                private = M.PrivateLinkInput(); private.ready()
                hidden = tty.call_args.args[2]
                self.assertFalse(hidden[3] & (M.termios.ECHO | M.termios.ICANON))
                if timeout:
                    with self.assertRaises(M.DispatchRejected) as rejected: private.read()
                    self.assertEqual(rejected.exception.phase, 'link')
                else: self.assertEqual(private.read(), 'x' * 4096)
                flush.assert_called_once_with(99, M.termios.TCIFLUSH)
                self.assertEqual(tty.call_args.args[2], previous)

    def test_default_cli_plan_has_no_credential_or_api_work_and_safe_error_handler(self):
        with patch.object(M.sys, 'argv', ['dispatch.py']), patch.object(M, 'GitHub') as github, \
                patch('builtins.print') as output:
            self.assertEqual(M.main(), 0)
        github.assert_not_called(); self.assertIn('BLOCKED_', output.call_args.args[0])
        with patch.object(M.sys, 'argv', ['dispatch.py', '--execute-after-go']), patch('builtins.print') as output:
            self.assertEqual(M.main(), 1)
        failed = json.loads(output.call_args.args[0])
        self.assertEqual(failed['firstFailedPhase'], 'arguments'); self.assertFalse(failed['dispatchAttempted'])


if __name__ == '__main__': unittest.main()
