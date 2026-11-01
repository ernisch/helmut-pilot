"""Fictional source-review and real controller input seams; no resource starts."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


R = load('w15_github_runtime_inputs', HERE / 'runtime_inputs.py')
F = load('w15_runtime_input_forward_test', HERE.parent / 'synthetik-500-w15-memory-forward.py')
A = F.AUDIT
SHA = lambda raw: hashlib.sha256(raw).hexdigest()


class RuntimeInputChecks(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-runtime-')
        self.addCleanup(temp.cleanup)
        self.repo = Path(temp.name)
        (self.repo / '.git').mkdir()
        (self.repo / '.git/HEAD').write_text('a' * 40)
        self.path = self.repo / 'app.js'
        self.path.write_bytes(b'FICTIONAL-CURRENT-SOURCE')
        self.now = {'app.js': {'bytes': self.path.stat().st_size, 'sha256': SHA(self.path.read_bytes())}}
        self.old = [{'path': 'app.js', 'bytes': 10, 'sha256': 'b' * 64}]
        self.context = {'exactCommit': 'a' * 40, 'runId': '123456789',
                        'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8',
                        'runtimePins': {'imageId': 'sha256:' + 'd' * 64},
                        'inputManifestPin': {'sha256': 'f' * 64},
                        'hostPaths': {'work': '/tmp/fake/work', 'prepare': '/tmp/fake/prepare', 'cache': '/tmp/fake/cache'}}
        self.review = {'schema': 'helmut-w15-current-source-review/1',
                       'scope': 'ISOLATED_GITHUB_END500_SOURCE_BINDINGS_ONLY',
                       'status': 'PASS_INDEPENDENT_CURRENT_SOURCE_AND_ADAPTER_REVIEW',
                       'contextSHA256': 'c' * 64, 'exactCommit': 'a' * 40,
                       'sourcePins': self.now, 'historicalDeltas': R._deltas(self.now, self.old),
                       'executionAuthority': False, 'testStarted': False}

    def validate(self, review=None, digest=None):
        raw = json.dumps(self.review if review is None else review).encode()
        with patch.object(R.C, 'validate_context', return_value={'contextSHA256': 'c' * 64}), \
                patch.object(R, 'source_requirements', return_value=(self.now, self.old)), \
                patch.object(R, '_require_commit_contents'):
            return R.validate_source_review(self.context, raw, SHA(raw) if digest is None else digest, self.repo)

    def test_review_binds_exact_closure_and_delta_but_no_authority(self):
        result = self.validate()
        self.assertFalse(result['executionAuthority'])
        self.assertEqual(result['sourcePins'], self.now)
        self.assertEqual(len(result['historicalDeltas']), 1)

    def test_wrong_external_review_hash_rejected(self):
        with self.assertRaises(R.RuntimeInputError):
            self.validate(digest='0' * 64)

    def test_wrong_current_context_rejected(self):
        value = {**self.review, 'contextSHA256': 'd' * 64}
        with self.assertRaises(R.RuntimeInputError):
            self.validate(value)

    def test_missing_changed_historical_source_review_rejected(self):
        with self.assertRaises(R.RuntimeInputError):
            self.validate({**self.review, 'historicalDeltas': []})

    def test_unlisted_source_or_execution_authority_rejected(self):
        for value in ({**self.review, 'sourcePins': {}}, {**self.review, 'executionAuthority': True}):
            with self.subTest(value=value):
                with self.assertRaises(R.RuntimeInputError):
                    self.validate(value)

    def test_current_source_drift_rejected_after_open(self):
        obj = R.RuntimeInputs(R.TOKEN, None, self.context, self.review, self.repo)
        mutated = {'app.js': {**self.now['app.js'], 'sha256': 'd' * 64}}
        with patch.object(R, 'source_requirements', return_value=(mutated, self.old)):
            with self.assertRaises(R.RuntimeInputError):
                obj.check_sources()

    def test_foreign_historical_source_cannot_use_fresh_review(self):
        obj = R.RuntimeInputs(R.TOKEN, None, self.context, self.review, self.repo)
        with patch.object(R, '_reports', return_value={}), \
                patch.object(R, '_historical_pins', return_value=self.old):
            with self.assertRaises(R.RuntimeInputError):
                obj.check_historical_source({'path': 'app.js', 'bytes': 10, 'sha256': '0' * 64})

    def test_public_source_symlink_parent_rejected(self):
        (self.repo / 'link').symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(OSError):
            R._public_bytes(self.repo, 'link/app.js')

    def test_public_source_hardlink_rejected(self):
        os.link(self.path, self.repo / 'alias.js')
        with self.assertRaises(R.RuntimeInputError):
            R._public_bytes(self.repo, 'app.js')

    def test_commit_content_gate_rejects_dirty_source(self):
        raw = self.path.read_bytes()
        digest = SHA(raw)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest()
        result = __import__('subprocess').CompletedProcess([], 0, b'100644 blob ' + blob.encode() + b'\tapp.js\x00')
        with patch.object(R.subprocess, 'run', return_value=result) as git:
            R._require_commit_contents(self.repo, 'a' * 40, self.now)
            self.path.write_bytes(b'FICTIONAL-DIRTY-SOURCE')
            with self.assertRaises(R.RuntimeInputError):
                R._require_commit_contents(self.repo, 'a' * 40, self.now)
            self.assertIn('ls-tree', git.call_args.args[0])

    def test_commit_content_gate_rejects_untracked_source(self):
        result = __import__('subprocess').CompletedProcess([], 0, b'')
        with patch.object(R.subprocess, 'run', return_value=result):
            with self.assertRaises(R.RuntimeInputError):
                R._require_commit_contents(self.repo, 'a' * 40, self.now)

    def test_forward_and_auditor_use_received_bytes_preserving_old_paths(self):
        root = self.repo / 'private'
        root.mkdir(mode=0o700)
        data = {'auth': {'llmUsage': [None] * 6000}}
        data.update({key: [{'id': 'FICTIONAL-' + key}] for key in A.COUNTS})
        pins, actual = {}, {}
        for key, value in data.items():
            raw = json.dumps(value).encode()
            path = root / (key + '.json')
            path.write_bytes(raw)
            path.chmod(0o600)
            pins[key] = {'path': '/workspace/fictional-old/' + key, 'bytes': len(raw), 'sha256': SHA(raw)}
            actual[key] = path
        bound = {'executionAuthority': False, 'totalUsageRows': 6000, 'protectedOutputPins': copy.deepcopy(pins)}
        raw = json.dumps(bound).encode()
        actual['bound'] = root / 'bound.json'
        actual['bound'].write_bytes(raw)
        actual['bound'].chmod(0o600)
        pins['bound'] = {'path': '/workspace/fictional-old/bound', 'bytes': len(raw), 'sha256': SHA(raw)}
        class Received:
            def original_pin(self, key):
                return dict(pins[key])
            def resolve(self, pin):
                key, = [key for key, expected in pins.items() if pin == expected]
                return actual[key]
        binding = R.RuntimeInputs(R.TOKEN, Received(), self.context, self.review, self.repo)
        with patch.object(F.M, 'docker') as docker, patch.object(A.subprocess, 'Popen') as popen, \
                patch.object(A, 'BOUND_SHA', SHA(raw)), patch.object(A, 'COUNTS', {key: 1 for key in A.COUNTS}):
            path, body = F.pin(pins['auth'], binding)
            loaded = A._fixtures(None, input_binding=binding)
            self.assertEqual(path, actual['auth'])
            self.assertEqual(len(loaded['auth']['llmUsage']), 6000)
            self.assertEqual(actual['bound'].read_bytes(), raw)
            self.assertEqual(bound['protectedOutputPins'], {key: pins[key] for key in data})
            docker.assert_not_called()
            popen.assert_not_called()

    def test_auditor_rejects_unvalidated_binding_before_read(self):
        with patch.object(A, '_private_read') as read:
            with self.assertRaises(A.AuditError):
                A._fixtures(None, input_binding=object())
            read.assert_not_called()

    def test_controller_rejects_image_not_bound_to_current_context(self):
        obj = R.RuntimeInputs(R.TOKEN, None, self.context, self.review, self.repo)
        with patch.object(obj, 'check_sources') as checked:
            with self.assertRaises(R.RuntimeInputError):
                obj.check_controller(work='/tmp/fake/work', prepare='/tmp/fake/prepare', cache='/tmp/fake/cache',
                                     base=R.C.BASE, database=R.C.DATABASE,
                                     container='w15-end500-123456789-26d5a4135ca7415ca41262fc45b561c8',
                                     image='sha256:' + 'e' * 64)
            checked.assert_not_called()

    def test_context_input_manifest_must_be_the_received_manifest(self):
        with patch.object(R, 'validate_source_review', return_value=self.review), \
                patch.object(R.IP, 'verify_received') as received:
            with self.assertRaises(R.RuntimeInputError):
                R.open_inputs('/fictional', context=self.context, expected_transfer_context={},
                              expected_sealed_manifest_sha256='0' * 64,
                              source_review_raw=b'fictional', source_review_sha256='0' * 64, repo=self.repo)
            received.assert_not_called()

    def test_forward_rejects_mutated_ram_globals_before_input_use(self):
        obj = R.RuntimeInputs(R.TOKEN, None, self.context, self.review, self.repo)
        with patch.object(F.M, 'MAXIMUM', 1900000000), patch.object(obj, 'check_controller') as checked:
            with self.assertRaises(AssertionError):
                F._checked_runtime_inputs(obj)
            checked.assert_not_called()


if __name__ == '__main__':
    unittest.main()
