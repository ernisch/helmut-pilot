"""Small fictional evidence/transport seams; no GPG, database or network."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


def load(name):
    spec = importlib.util.spec_from_file_location('materials_evidence_test_' + name,
        Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


E, S = load('mock500_materials_evidence'), load('seal')


class MaterialsEvidenceChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-materials-evidence-fictional-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.work, self.backup = self.root / 'work', self.root / 'backup'
        self.work.mkdir(mode=0o700); self.backup.mkdir(mode=0o700)
        self.node = self.root / 'node'; self.put(self.node, b'FICTIONAL NODE; NEVER EXECUTED')
        node = {'path': str(self.node), 'bytes': self.node.stat().st_size,
                'sha256': hashlib.sha256(self.node.read_bytes()).hexdigest()}
        self.context = {'schema': 'helmut-w15-backup-context/1',
            'scope': 'ISOLATED_GITHUB_MOCK500_BACKUP_ONLY',
            'nonce': '11111111-2222-4333-8444-555555555555', 'exactCommit': 'a' * 40,
            'runId': '123456789', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
            'recipientFingerprint': E.FINGERPRINT, 'executionAuthority': False}
        self.manifest = {**{key: self.context[key] for key in (
            'nonce', 'exactCommit', 'runId', 'runAttempt')},
            'backupRoot': str(self.backup), 'binaries': {'node': node}}
        self.inputs = SimpleNamespace(backup_context=lambda: copy.deepcopy(self.context),
            controller_context=lambda: {'runtimePins': {'node': node}},
            backup_input_files=lambda: {'auth': self.root / 'receive/originals/files/auth.PRIVATE.json'})
        self.private = {'artifactCredentials': {'FICTIONAL': 'NEVER USED'}}
        self.controller = SimpleNamespace(WORK=self.work)
        self.guard = Mock()
        self.outcome = {'scope': E.SCOPE, 'category': 'FIXED_SYNTHETIC_FAILURE',
            'cleanupConfirmedZero': True, 'PRIVATE_SENTINEL': 'not-a-real-secret'}
        self.closed_contexts = []
        def context_check(value, *, expected_scope):
            self.assertEqual(expected_scope, E.SCOPE)
            self.assertEqual(value, {**self.context, 'scope': E.SCOPE})
            self.closed_contexts.append(copy.deepcopy(value))
        self.closure = SimpleNamespace(_context=context_check,
            R=SimpleNamespace(_source_pin=Mock(return_value=node)),
            authenticated_readback=Mock(side_effect=self.authenticate))
        self.seal = SimpleNamespace(**{name: getattr(S, name) for name in (
            '_directory', '_file', '_snapshot')}, seal=Mock(side_effect=self.encrypt))
        self.transport = SimpleNamespace(roundtrip=Mock(side_effect=self.roundtrip))
        self.patch = patch.object(E, 'modules', return_value=(self.closure, self.seal, self.transport))
        self.patch.start(); self.addCleanup(self.patch.stop)

    def put(self, path, raw):
        with path.open('xb') as stream:
            os.fchmod(stream.fileno(), 0o600); stream.write(raw)

    def encrypt(self, **value):
        self.assertEqual(value['recipient_fingerprint'], E.FINGERPRINT)
        self.assertEqual(value['commit'], self.context['exactCommit'])
        self.selection = Path(value['root'])
        raw = (self.selection / value['manifest']).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), value['manifest_sha256'])
        self.archive_manifest = json.loads(raw)
        for row in self.archive_manifest['files']:
            selected = self.selection / row['path']
            self.assertEqual(selected.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(selected.read_bytes()), row['bytes'])
            self.assertEqual(hashlib.sha256(selected.read_bytes()).hexdigest(), row['sha256'])
        self.put(Path(value['output']), b'FICTIONAL CIPHER; NO CRYPTO EXECUTED')
        raw = Path(value['output']).read_bytes()
        return {'cipherBytes': len(raw), 'cipherSHA256': hashlib.sha256(raw).hexdigest(),
            'manifestSHA256': value['manifest_sha256'], **{key: self.context[key] for key in (
                'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')}}

    def roundtrip(self, cipher, **value):
        self.assertEqual(value['credentials'], self.private['artifactCredentials'])
        raw = cipher.read_bytes()
        return {'cipher': cipher, 'cipherBytes': len(raw),
            'cipherSHA256': hashlib.sha256(raw).hexdigest(), 'artifactId': 123,
            'retentionDays': 1, 'remoteReadbackObserved': True}

    def authenticate(self, cipher, **value):
        self.assertEqual(value['backup_scope'], E.SCOPE)
        self.assertEqual(value['expected_manifest'], self.archive_manifest)
        self.assertEqual(value['context']['scope'], E.SCOPE)
        return {'localAuthenticatedReadbackObserved': True,
            'verifiedFiles': len(self.archive_manifest['files']),
            'verifiedBytes': sum(row['bytes'] for row in self.archive_manifest['files']),
            'cipherBytes': value['cipher_bytes'], 'cipherSHA256': value['cipher_sha256']}

    def preserve(self):
        return E.preserve(self.manifest, self.private, self.inputs, self.controller,
                          self.guard, self.outcome)

    def test_private_first_error_retained_public_result_closed(self):
        self.put(self.work / E.SOURCES[0], b'{"reason":"PRIVATE_ERROR_SENTINEL"}')
        self.put(self.work / E.SOURCES[1], b'{"reason":"PRIVATE_CONTROLLER_SENTINEL"}')
        self.put(self.work / E.SOURCES[2], b'PRIVATE_CHILD_STDERR_SENTINEL\n')
        result = self.preserve()
        self.assertEqual(result['status'], 'PASS_PRIVATE_MATERIALS_EVIDENCE_ONLY')
        for key in ('remoteReadbackObserved', 'authenticatedReadbackObserved'):
            self.assertIs(result[key], True)
        for key in ('acceptedAsCompleteBackup', 'mock500Acceptance', 'productionAcceptance',
                    'executionAuthority', 'retryAllowed'):
            self.assertIs(result[key], False)
        public = json.dumps(result)
        for private in ('PRIVATE_ERROR_SENTINEL', 'PRIVATE_CONTROLLER_SENTINEL',
                        'PRIVATE_CHILD_STDERR_SENTINEL', 'not-a-real-secret', str(self.work)):
            self.assertNotIn(private, public)
        self.assertEqual((self.selection / E.SOURCES[0]).read_bytes(),
                         b'{"reason":"PRIVATE_ERROR_SENTINEL"}')
        self.assertEqual(self.context['scope'], 'ISOLATED_GITHUB_MOCK500_BACKUP_ONLY')

    def test_large_log_bounded_truthfully_without_changing_source(self):
        original = b'FIRST_ERROR\n' + b'x' * 200000 + b'LAST_CONTEXT\n'
        self.put(self.work / E.SOURCES[2], original)
        self.preserve()
        selected = (self.selection / E.SOURCES[2]).read_bytes()
        self.assertEqual(len(selected), E.MAX_FILE)
        self.assertEqual(selected, original[:32768] + original[-32768:])
        metadata = json.loads((self.selection / 'MATERIALS_COLLECTION.PRIVATE.json').read_bytes())
        row = next(row for row in metadata['sources'] if row['path'] == E.SOURCES[2])
        self.assertIs(row['truncated'], True)
        self.assertEqual(row['originalBytes'], len(original))
        self.assertEqual((self.work / E.SOURCES[2]).read_bytes(), original)
        self.assertLessEqual(sum(row['bytes'] for row in self.archive_manifest['files'])
                             + (self.selection / 'manifest.PRIVATE.json').stat().st_size, E.MAX_TOTAL)

    def test_symlink_rejected_before_seal_or_transfer(self):
        outside = self.root / 'outside'; self.put(outside, b'FICTIONAL PRIVATE FILE')
        (self.work / E.SOURCES[0]).symlink_to(outside)
        with self.assertRaises(E.EvidenceRejected): self.preserve()
        self.seal.seal.assert_not_called(); self.transport.roundtrip.assert_not_called()

    def test_transport_failure_is_fixed_and_not_retried(self):
        self.transport.roundtrip.side_effect = RuntimeError('PRIVATE_TRANSPORT_SENTINEL')
        with self.assertRaisesRegex(E.EvidenceRejected, '^MATERIALS_PRIVATE_EVIDENCE_FAILED_OR_UNKNOWN$'):
            self.preserve()
        self.assertEqual(self.transport.roundtrip.call_count, 1)
        self.closure.authenticated_readback.assert_not_called()
        # A second invocation cannot replace partials or initiate a retry.
        with self.assertRaises(E.EvidenceRejected): self.preserve()
        self.assertEqual(self.transport.roundtrip.call_count, 1)
        self.assertEqual(self.seal.seal.call_count, 1)

    def test_authenticated_readback_failure_never_returns_pass(self):
        self.closure.authenticated_readback.side_effect = RuntimeError('PRIVATE_AUTH_FAILURE')
        with self.assertRaisesRegex(E.EvidenceRejected, '^MATERIALS_PRIVATE_EVIDENCE_FAILED_OR_UNKNOWN$'):
            self.preserve()
        self.assertEqual(self.transport.roundtrip.call_count, 1)
        self.assertTrue((self.backup / 'materials-evidence/mock500-materials-diagnostic.PRIVATE.gpg').exists())

    def test_unknown_file_is_not_collected_and_outcome_is_bounded(self):
        self.put(self.work / 'unselected.PRIVATE', b'NEVER SELECT THIS')
        self.preserve()
        self.assertNotIn('unselected.PRIVATE', [row['path'] for row in self.archive_manifest['files']])
        self.outcome['oversized'] = 'x' * 16385
        with self.assertRaises(E.EvidenceRejected): self.preserve()
        self.assertEqual(self.transport.roundtrip.call_count, 1)


if __name__ == '__main__': unittest.main()
