"""Synthetic manual-binding checks only; no runner, links, Originals, DB or network."""
import sys
sys.dont_write_bytecode = True
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
from pathlib import Path
import unittest
import uuid

SPEC = importlib.util.spec_from_file_location('manual_start_test', Path(__file__).with_name('mock500_manual_start.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
NOW = datetime(2026, 11, 4, 7, 30, 0, 123456, tzinfo=timezone.utc)


class ManualBindingChecks(unittest.TestCase):
    def setUp(self):
        self.grant = 'a' * 64
        self.authority = dict(schema=M.AUTHORITY_SCHEMA, scope=M.SCOPE, environment='helmut-ci-originals',
            seriesGrantSHA256=self.grant, firstCommit=M.FIRST, maximumAttempts=3,
            maximumPerRunUSD='0.05', maximumTotalUSD='0.15', maximumModelUSD='0.00',
            actualOperatorInstruction='Synthetic operator GO: manual start of the same bounded series.',
            operatorObservedAtUTC='2026-11-04T07:20:00Z', explicitManualStart=True,
            codexThreadId='synthetic-thread', runtimeEnvironmentId='synthetic-runtime',
            cloudEnvironmentId='synthetic-cloud')
        self.pin = M.digest(self.authority)
        self.proof = dict(schema=M.PROOF_SCHEMA, status='AUTHENTICATED_MANUAL_START_BINDING', mode='MANUAL',
            seriesGrantSHA256=self.grant, authoritySHA256=self.pin, controlCommit='c' * 40,
            targetCommit=M.FIRST, nonce=str(uuid.uuid4()), ordinal=1,
            codexThreadId='synthetic-thread', runtimeEnvironmentId='synthetic-runtime',
            cloudEnvironmentId='synthetic-cloud', issuedAtUTC='2026-11-04T07:30:00Z',
            expiresAtUTC='2026-11-04T09:30:00Z', maximumAttempts=1, automaticRetry=False, linkRefresh=False)
        # The synthetic trusted source has its own immutable canonical contents.
        self.source = M.canonical(self.authority)
        self.options = dict(authority=self.authority, expected_authority_sha256=self.pin,
            series_grant_sha256=self.grant, control_commit=self.proof['controlCommit'], target_commit=M.FIRST,
            nonce=self.proof['nonce'], ordinal=1, thread_id='synthetic-thread',
            runtime_environment_id='synthetic-runtime', cloud_environment_id='synthetic-cloud', now=NOW,
            authenticate=lambda authority: M.canonical(authority) == self.source)

    def check(self, proof=None, **options):
        return M.validate_manual_binding(self.proof if proof is None else proof, **(self.options | options))

    def blocked(self, proof=None, **options):
        with self.assertRaises(M.ManualBindingRejected) as caught:
            self.check(proof, **options)
        self.assertEqual(str(caught.exception), 'MOCK500_MANUAL_BINDING_REJECTED')

    def trusted_authority(self, **changes):
        authority = self.authority | changes
        pin = M.digest(authority)
        source = M.canonical(authority)
        return self.proof | {'authoritySHA256': pin}, dict(authority=authority, expected_authority_sha256=pin,
            authenticate=lambda candidate: M.canonical(candidate) == source)

    def test_authenticated_current_manual_binding_and_two_hour_limit(self):
        original = M.canonical([self.authority, self.proof])
        self.assertIs(self.check(), True)
        self.assertIs(self.check(now=NOW.replace(microsecond=0)), True)
        self.assertIs(self.check(now=NOW.replace(hour=9, minute=29, second=59, microsecond=999999)), True)
        self.assertEqual(M.canonical([self.authority, self.proof]), original)
        for ordinal in (2, 3):
            self.assertIs(self.check(self.proof | {'ordinal': ordinal}, ordinal=ordinal), True)

    def test_parameters_and_json_booleans_cannot_authenticate_operator_authority(self):
        for result in (False, None, 1, 'true', {'authenticated': True}):
            with self.subTest(result=result):
                self.blocked(authenticate=lambda authority: result)
        self.blocked(authenticate=True)
        self.blocked(authority=True)
        self.blocked(self.proof | {'operatorAuthorized': True})
        self.blocked(self.proof | {'schedulerVerified': True})
        def failure(authority):
            raise RuntimeError('synthetic-private-value')
        self.blocked(authenticate=failure)

    def test_authority_hash_mutation_and_untrusted_replacement_are_rejected(self):
        self.blocked(expected_authority_sha256='0' * 64)
        self.blocked(expected_authority_sha256=self.pin.upper())
        changed = self.authority | {'actualOperatorInstruction': 'Another synthetic instruction'}
        self.blocked(authority=changed)
        changed_pin = M.digest(changed)
        self.blocked(self.proof | {'authoritySHA256': changed_pin}, authority=changed,
                     expected_authority_sha256=changed_pin)
        def mutate(authority):
            authority['actualOperatorInstruction'] = 'Mutated by callback'
            return True
        self.blocked(authenticate=mutate)

    def test_manual_schema_mode_and_status_never_substitute_scheduler_proof(self):
        for key, value in [('schema', 'helmut-w15-scheduler-binding/1'), ('mode', 'SCHEDULER'),
                           ('status', 'in_progress'), ('status', 'AUTOMATION_VERIFIED')]:
            with self.subTest(key=key, value=value):
                self.blocked(self.proof | {key: value})
        for changes in ({'explicitManualStart': False}, {'explicitManualStart': 1},
                        {'schema': 'helmut-w15-scheduler-authority/1'}, {'scope': 'PRODUCTION'},
                        {'environment': 'different-environment'}, {'actualOperatorInstruction': ''},
                        {'actualOperatorInstruction': '   '}, {'actualOperatorInstruction': True},
                        {'actualOperatorInstruction': 'x' * 8193}):
            proof, options = self.trusted_authority(**changes)
            self.blocked(proof, **options)

    def test_wrong_epoch_expiry_future_issue_and_timestamp_format_are_rejected(self):
        for changes in ({'issuedAtUTC': '2026-11-05T07:30:00Z', 'expiresAtUTC': '2026-11-05T09:30:00Z'},
                        {'expiresAtUTC': '2026-11-04T07:30:00Z'},
                        {'expiresAtUTC': '2026-11-04T09:30:01Z'},
                        {'issuedAtUTC': '2026-11-04T07:30:01Z'},
                        {'issuedAtUTC': '2026-11-04T07:19:59Z'},
                        {'issuedAtUTC': '2026-11-04T07:30:00.000000Z'},
                        {'issuedAtUTC': '2026-11-04T07:30:00+00:00'},
                        {'issuedAtUTC': '2026-11-04T07:30:00'}, {'expiresAtUTC': '2026-02-30T09:30:00Z'}):
            with self.subTest(changes=changes):
                self.blocked(self.proof | changes)
        self.blocked(now=NOW.replace(hour=9, minute=30, microsecond=0))
        self.blocked(now=NOW.replace(tzinfo=None))
        self.blocked(now=NOW.astimezone(timezone(timedelta(hours=1))))
        self.blocked(now='2026-11-04T07:30:00Z')
        for observed in ('2026-11-04T07:30:01Z', '2026-11-04T07:20:00.0Z', 'invalid'):
            proof, options = self.trusted_authority(operatorObservedAtUTC=observed)
            self.blocked(proof, **options)

    def test_series_controller_target_nonce_and_ordinal_are_exactly_bound(self):
        for key, value in [('seriesGrantSHA256', 'b' * 64), ('authoritySHA256', 'b' * 64),
                           ('controlCommit', 'b' * 40), ('targetCommit', 'b' * 40),
                           ('nonce', str(uuid.uuid4())), ('ordinal', 2), ('ordinal', True)]:
            with self.subTest(key=key):
                self.blocked(self.proof | {key: value})
        for key, value in [('series_grant_sha256', 'A' * 64), ('control_commit', 'C' * 40),
                           ('target_commit', '0' * 39), ('ordinal', True), ('ordinal', 0), ('ordinal', 4)]:
            self.blocked(**{key: value})
        for nonce in ('invalid', str(uuid.uuid1()), self.proof['nonce'].upper()):
            self.blocked(self.proof | {'nonce': nonce}, nonce=nonce)
        for changes in ({'seriesGrantSHA256': 'b' * 64}, {'firstCommit': 'b' * 40}):
            proof, options = self.trusted_authority(**changes)
            self.blocked(proof, **options)

    def test_thread_and_both_environments_are_required_typed_and_exact(self):
        contexts = [('codexThreadId', 'thread_id'), ('runtimeEnvironmentId', 'runtime_environment_id'),
                    ('cloudEnvironmentId', 'cloud_environment_id')]
        for key, parameter in contexts:
            for value in ('', 'different', None, True, '/private/synthetic-path'):
                with self.subTest(key=key, value=value):
                    self.blocked(self.proof | {key: value})
                    self.blocked(**{parameter: value})
                    proof, options = self.trusted_authority(**{key: value})
                    self.blocked(proof, **options)
            for record in (self.proof, self.authority):
                incomplete = {k: v for k, v in record.items() if k != key}
                if record is self.proof:
                    self.blocked(incomplete)
                else:
                    self.blocked(authority=incomplete)

    def test_limit_inflation_and_numeric_boolean_confusion_are_rejected(self):
        for changes in ({'maximumAttempts': 4}, {'maximumAttempts': True}, {'maximumAttempts': 3.0},
                        {'maximumPerRunUSD': '0.06'}, {'maximumPerRunUSD': 0.05},
                        {'maximumTotalUSD': '0.16'}, {'maximumModelUSD': '0.01'}):
            proof, options = self.trusted_authority(**changes)
            self.blocked(proof, **options)
        for key, value in [('maximumAttempts', 2), ('maximumAttempts', True), ('maximumAttempts', 1.0),
                           ('automaticRetry', True), ('automaticRetry', 0), ('linkRefresh', True), ('linkRefresh', 0)]:
            self.blocked(self.proof | {key: value})
        self.blocked(self.proof | {'rawPrivatePath': '/private/synthetic'})
        self.blocked(authority=self.authority | {'secret': 'synthetic'})

    def test_closed_schema_value_types_and_callback_mutation_are_rejected(self):
        for key in M.PROOF_KEYS:
            self.blocked({k: v for k, v in self.proof.items() if k != key})
        for key in M.AUTHORITY_KEYS:
            self.blocked(authority={k: v for k, v in self.authority.items() if k != key})
        for key in M.PROOF_KEYS - {'ordinal', 'maximumAttempts', 'automaticRetry', 'linkRefresh'}:
            for value in (True, 1, None, [], {}):
                self.blocked(self.proof | {key: value})
        class PretendString:
            def __eq__(self, other):
                return True
        self.blocked(self.proof | {'controlCommit': PretendString()})
        def mutate(authority):
            self.proof['targetCommit'] = 'f' * 40
            return True
        self.blocked(authenticate=mutate)

    def test_existing_series_and_start_files_remain_byte_identical(self):
        expected = {'mock500_series.py': '96599dc11fac29847288748f0719537276edc3754c3809bd9eba7d964630abc2',
                    'mock500_start.py': 'eb1365e8a5613245d954666c183fc0b5c297f4e090e4244a80442e821c00fbdc'}
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
