'''Targeted synthetic historical source admission cases. No work on import.'''

import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_HERE = Path(__file__).resolve().parent
_FIXTURE_PATH = _HERE / 'test_mock500_start.py'


def _load_fixture():
    if str(_HERE) not in sys.path:
        sys.path.insert(0, str(_HERE))
    spec = importlib.util.spec_from_file_location('_w15_mock500_start_fixture', _FIXTURE_PATH)
    if spec is None or spec.loader is None:
        raise ImportError('cannot load test_mock500_start.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _canonical_sha256(value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)
    return hashlib.sha256(raw.encode('ascii')).hexdigest()


class HistoricalSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_fixture()
        cls.S = cls.mod.S

    def setUp(self):
        validator = patch.object(self.S, 'validate_functional_end_acceptance', return_value=None)
        validator.start()
        self.addCleanup(validator.stop)
        self.base = self._new_base()

    def _new_base(self):
        base = self.mod.StartChecks()
        base.setUp()
        self.addCleanup(base.doCleanups)
        return base

    def _to_host_functional(self, base):
        S = self.S
        host = S.host()
        host_functional = S.host_functional()

        base.request['mode'] = S.HOST_FUNCTIONAL
        base.observed['mode'] = S.HOST_FUNCTIONAL
        base.request['limits'] = host.limits()

        base.approval['mode'] = S.HOST_FUNCTIONAL
        base.approval['scope'] = S.mode_scope(S.HOST_FUNCTIONAL)
        base.approval['limits'] = host.limits()
        base.approval['resourceContract'] = host.CONTRACT
        base.approval['sourceContract'] = S.SOURCE_REPLAY

        base.end['schema'] = host_functional.ACCEPTANCE_SCHEMA
        base.end['scope'] = host_functional.SCOPE
        base.end_envelope = self.mod.envelope(base.end)

        base.bridge['mockMemoryContract'] = host.PROFILE
        base.bridge['functionalContract'] = host.CONTRACT
        base.bridge['end500FunctionalContract'] = host_functional.CONTRACT
        base.bridge['end500AcceptanceSHA256'] = base.end_envelope['sha256']
        base.bridge_envelope = self.mod.envelope(base.bridge)

        base.approval['end500AcceptanceSHA256'] = base.end_envelope['sha256']
        base.approval['compatibilitySHA256'] = base.bridge_envelope['sha256']
        return base

    def _expected_source_authorization(self, base, approval_sha):
        return {
            'schema': 'helmut-w15-isolated-mock-source-authorization/1',
            'contract': self.S.SOURCE_REPLAY,
            'branch': base.request['branch'],
            'exactCommit': base.request['exactCommit'],
            'runId': base.observed['runId'],
            'runAttempt': base.request['runAttempt'],
            'nonce': base.request['nonce'],
            'approvalSHA256': approval_sha,
            'sourceQualificationSHA256': base.request['sourceQualificationSHA256'],
            'productionAllowed': False,
            'paidModelsAllowed': False,
        }

    def test_valid_new_source_authorization_binds_exact_fields(self):
        base = self._to_host_functional(self.base)
        approval_sha = _canonical_sha256(base.approval)

        result = base.admit()

        self.assertEqual(
            result['sourceReplayAuthorization'],
            self._expected_source_authorization(base, approval_sha),
        )
        self.assertFalse(result.get('executionAuthority', False))
        self.assertFalse(result.get('mock500Acceptance', False))

    def test_legacy_mode_has_no_source_authorization_and_rejects_source_field(self):
        result = self.base.admit()

        self.assertNotIn('sourceReplayAuthorization', result)
        self.assertFalse(result.get('executionAuthority', False))
        self.assertFalse(result.get('mock500Acceptance', False))

        self.base.approval['sourceContract'] = self.S.SOURCE_REPLAY
        with self.assertRaises(self.S.StartRejected):
            self.base.admit()

    def test_wrong_unknown_source_version_or_source_as_of_rejects(self):
        for name, value in (
            ('wrongVersion', self.S.SOURCE_REPLAY + '/2'),
            ('unknownVersion', 'unknown-source-replay/1'),
        ):
            with self.subTest(name=name):
                base = self._to_host_functional(self._new_base())
                base.approval['sourceContract'] = value
                with self.assertRaises(self.S.StartRejected):
                    base.admit()

        with self.subTest(name='extraSourceAsOf'):
            base = self._to_host_functional(self._new_base())
            base.approval['sourceAsOf'] = '2026-10-29T09:00:00Z'
            with self.assertRaises(self.S.StartRejected):
                base.admit()

    def test_expired_unauthorized_or_wrong_nonce_go_has_no_source_authorization(self):
        def expire(approval):
            approval['issuedAt'] = '2026-10-29T08:59:00Z'
            approval['expiresAt'] = '2026-10-29T09:59:00Z'

        def unauthorized(approval):
            approval['authorized'] = False

        def wrong_nonce(approval):
            approval['nonce'] = '99999999-8888-4777-8666-555555555555'

        for name, mutate in (
            ('expired', expire),
            ('unauthorized', unauthorized),
            ('wrongNonce', wrong_nonce),
        ):
            with self.subTest(name=name):
                base = self._to_host_functional(self._new_base())
                mutate(base.approval)
                try:
                    result = base.admit()
                except self.S.StartRejected:
                    continue
                self.assertNotIn('sourceReplayAuthorization', result)
                self.assertFalse(result.get('executionAuthority', False))
                self.assertFalse(result.get('mock500Acceptance', False))


class HistoricalSourcePinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('_w15_replay_pins', _HERE / 'mock500_inputs.py')
        cls.M = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.M)
        cls.repo = _HERE.parents[1]
        old = json.loads((cls.repo / cls.M.ATOMIC / 'SOURCE_COMPATIBILITY.SAFE.json').read_text())
        cls.qualification = {'sourceCodePins': old['unchangedSourcePins']
                            + [row['oldPin'] for row in old['reboundSourcePins']]}

    def test_closed_new_bridge_checks_all18_current_code_bindings(self):
        result = self.M.validate_source_compatibility(self.qualification, self.repo, source_replay=True)
        self.assertEqual(result['unchangedSources'], 13)
        self.assertEqual(result['scopedCodeBindings'], 5)
        self.assertFalse(result['constructorChecksRepeated'])
        self.assertFalse(result['executionAuthority'])
        with self.assertRaises(self.M.MockInputError):
            self.M.validate_source_compatibility(self.qualification, self.repo)

    def test_unknown_extra_or_changed_new_pin_fails_closed(self):
        target = self.repo / 'scripts/w15-github/mock500_source_replay_pins.json'
        original = Path.read_bytes
        for mutation in ('unknown', 'missing', 'changed'):
            bridge = json.loads(original(target))
            if mutation == 'unknown': bridge['historicalSourceRebindings'][0]['oldPin']['path'] = 'lib/helmut/ai.js'
            elif mutation == 'missing': bridge['historicalSourceRebindings'].pop()
            else: bridge['historicalSourceRebindings'][0]['currentPin']['sha256'] = '0' * 64
            def read(path):
                return json.dumps(bridge).encode() if path == target else original(path)
            with self.subTest(mutation=mutation), patch.object(Path, 'read_bytes', read):
                with self.assertRaises(self.M.MockInputError):
                    self.M.validate_source_compatibility(self.qualification, self.repo, source_replay=True)

    def test_original_qualification_pin_cannot_be_replaced(self):
        value = json.loads(json.dumps(self.qualification))
        value['sourceCodePins'][0]['sha256'] = '0' * 64
        with self.assertRaises(self.M.MockInputError):
            self.M.validate_source_compatibility(value, self.repo, source_replay=True)


if __name__ == "__main__":
    unittest.main()
