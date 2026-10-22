#!/usr/bin/env python3
"""Source identity checks only; no native/DB/model call or new acceptance.

Descriptor production uses the retained genuine LOCAL_COMPONENT_ONLY lease
proof. In-memory coverage documents are NEGATIVE fixtures and never published
as approvals. The independent DeepSeek Pro High admission contract is unchanged.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

BIN = Path(__file__).resolve().parent
ROOT = BIN.parents[1]
OBSERVER = BIN / 'cas-unit-observer.js'
QUALIFIED = Path('/workspace/helmut-ram-fix-20261020/next-full500-20261021/'
                 'v12-local-lock-lease-integration/FINAL_GENUINE_DESCRIPTOR.SAFE.json')
spec = importlib.util.spec_from_file_location('observer_source_preflight', BIN / 'start-preflight.py')
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


def node(source, *args):
    return subprocess.run(['node', '-e', source, str(BIN / 'atomic-usage-integration.js'), *map(str, args)],
                          text=True, capture_output=True, timeout=30)


class GenuineDescriptorSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_bytes = QUALIFIED.read_bytes()
        result = node("const fs=require('node:fs'),A=require(process.argv[1]);"
                      "const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));"
                      "const options=Object.fromEntries(['stateStorage','historyReadReuse','controlRead','boundedRead',"
                      "'senderClaimRead','pipelineLockLease','localSourceDeltaPin'].map(k=>[k,d[k]]));"
                      "process.stdout.write(JSON.stringify(A.descriptor(options)));", QUALIFIED)
        if result.returncode:
            raise AssertionError('Real existing component proof descriptor rejected: ' + result.stderr)
        cls.descriptor = json.loads(result.stdout)

    def validate(self, descriptor):
        with tempfile.TemporaryDirectory(prefix='helmut-observer-source-negative-') as temporary:
            file = Path(temporary) / 'SOURCE_IDENTITY_ONLY.SAFE.json'
            file.write_text(json.dumps(descriptor))
            return node("const A=require(process.argv[1]);A.readDescriptor(A.pin(process.argv[2]));", file)

    def test_real_producer_binds_exact_observer_before_staging(self):
        pins = [p for p in self.descriptor['sourcePins'] if p['path'] == str(OBSERVER)]
        self.assertEqual(pins, [P.pin(OBSERVER)])
        self.assertEqual(self.validate(self.descriptor).returncode, 0)
        self.assertEqual(QUALIFIED.read_bytes(), self.old_bytes)

    def test_missing_observer_pin_is_rejected(self):
        candidate = copy.deepcopy(self.descriptor)
        candidate['sourcePins'] = [p for p in candidate['sourcePins'] if p['path'] != str(OBSERVER)]
        self.assertNotEqual(self.validate(candidate).returncode, 0)

    def test_drifted_observer_hash_and_size_are_rejected(self):
        for field, value in [('sha256', '0' * 64), ('bytes', 1)]:
            with self.subTest(field=field):
                candidate = copy.deepcopy(self.descriptor)
                next(p for p in candidate['sourcePins'] if p['path'] == str(OBSERVER))[field] = value
                self.assertNotEqual(self.validate(candidate).returncode, 0)

    def test_default_off_has_no_observer_runtime_dependency(self):
        result = node("process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor()));")
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertNotIn('pipelineLockLease', value)
        self.assertFalse(any(p['path'] == str(OBSERVER) for p in value['sourcePins']))

    def test_retained_component_proof_grants_no_full_run_authority(self):
        admission = self.descriptor['pipelineLockLeaseAcceptance']
        self.assertEqual(admission['scope'], 'LOCAL_COMPONENT_ONLY')
        for key in ['production', 'full500Accepted', 'executionAuthority', 'automaticRetry', 'oldAuthorityReused']:
            self.assertIs(admission[key], False)
        self.assertIs(self.descriptor['production'], False)


class CoverageNegativeFixtureTest(unittest.TestCase):
    def documents(self, *, include_observer=False, model='deepseek-v4-pro', effort='high'):
        rows = [P.pin(OBSERVER)]
        digest = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        required = ['start-preflight.py', 'full500-controller.py', 'isolation.py', 'connect-local500.py',
                    'start-guard-inventory.js', 'legacy-harness-pins.json', 'next-resource-authority.py',
                    'finish-connection.py', 'measured-preparation.js', 'process-runner.py',
                    'native-memory-budget.py', 'native-memory-budget-helper.c', 'native-node-budget.js', 'http-meter.js']
        if include_observer:
            required.append('cas-unit-observer.js')
        infrastructure = [P.pin(BIN / name) for name in required]
        consumer = [P.pin(BIN / name) for name in ['start-input-checks.js', 'START_PREFLIGHT_COVERAGE.md']]
        # All values below remain private in-memory NEGATIVE fixtures.
        docs = {'adoption': {'consumerInventorySHA256': digest,
                'status': 'ROOT_ADOPTED_PRO_HIGH_COMPLETE_START_PREFLIGHT', 'uncoveredPrecomputableConditions': [],
                'independentReviews': {'infrastructure': 'infra', 'consumerInputs': 'consumer'},
                'expectedInitialSourceBindingSHA256': 'INVALID_NEVER_POSITIVE'},
                'infra': {'model': model, 'route': {'effort': effort}, 'payload': {'summary': {'status': 'ok'}},
                          'requestManifestPin': 'infraPacket'},
                'consumer': {'model': 'deepseek-v4-pro', 'route': {'effort': 'high'},
                             'payload': {'summary': {'status': 'ok'}}, 'requestManifestPin': 'consumerPacket'},
                'infraPacket': {'explicitSourcePins': infrastructure}, 'consumerPacket': {'explicitSourcePins': consumer}}
        return rows, docs

    def test_inventory_observer_requires_explicit_independent_source_pin(self):
        rows, docs = self.documents()
        with patch.object(P, 'read', side_effect=lambda key: docs[key]):
            with self.assertRaisesRegex(RuntimeError, 'review did not receive required actual source files'):
                P.coverage_adopted({'startPreflightIndependentAdoption': 'adoption'}, rows)

    def test_explicit_observer_source_pin_drift_is_rejected(self):
        rows, docs = self.documents(include_observer=True)
        next(p for p in docs['infraPacket']['explicitSourcePins'] if p['path'] == str(OBSERVER))['sha256'] = '0' * 64
        with patch.object(P, 'read', side_effect=lambda key: docs[key]):
            with self.assertRaisesRegex(RuntimeError, 'reviewed actual code drifted'):
                P.coverage_adopted({'startPreflightIndependentAdoption': 'adoption'}, rows)

    def test_deepseek_pro_high_hardcheck_is_unchanged(self):
        for model, effort in [('other-model', 'high'), ('deepseek-v4-pro', 'low')]:
            with self.subTest(model=model, effort=effort):
                rows, docs = self.documents(include_observer=True, model=model, effort=effort)
                with patch.object(P, 'read', side_effect=lambda key: docs[key]):
                    with self.assertRaisesRegex(RuntimeError, 'independent Pro High acceptance missing'):
                        P.coverage_adopted({'startPreflightIndependentAdoption': 'adoption'}, rows)


if __name__ == '__main__':
    unittest.main()
