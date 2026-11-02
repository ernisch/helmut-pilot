"""Four tiny fictional capsule cases; no keys, GPG, SDK, DB or network work."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('capsule_reader_tested',
    Path(__file__).with_name('mock500_materials_capsule_readback.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
NOW = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
PRIVATE = 'FICTIONAL_PRIVATE_CANARY_MUST_NEVER_BE_PUBLIC'


def category():
    return {'schema': 'helmut-w15-materials-first-failure/1',
        'category': 'MATERIALS_MAIN_CHECK_047', 'kind': 'assertion', 'stage': 'builder'}


def archive(*, input_sha=None, truncated=False, extra=False):
    outcome = {'materialsCompleted': True, 'firstFailure': category(),
        'cleanup': {'confirmedZero': True, 'profileFieldsUnchanged': True,
            'profiles': 500, 'activeProfiles': 0, 'nativeZeroState': 'BOUND_PREPARED_ZERO'}}
    node = M.canonical({'safe': category(), 'reason': PRIVATE, 'stack': PRIVATE})
    controller = M.canonical({'phase': 'mock500-controller-materials', 'type': 'PermissionError',
        'message': PRIVATE, 'traceback': 'Traceback (most recent call last):\n'
        '  File "/private/' + PRIVATE + '/scripts/synthetik-500-w15-full500-controller.py", line 817, in run_bound\n'
        '    private_call()\nPermissionError: ' + PRIVATE})
    payloads = {M.SOURCES[0]: node, M.SOURCES[1]: controller, M.SOURCES[2]: b''}
    metadata = []
    if truncated:
        payloads[M.SOURCES[0]] = b'NOT_COMPLETE_JSON' + b'x' * (M.MAX_FILE - 17)
        payloads[M.SOURCES[1]] = b''
        outcome['cleanup'] = {'confirmedZero': True, 'after': {'active': 0}}
    for name, data in payloads.items():
        cut = truncated and name == M.SOURCES[0]
        metadata.append({'path': name, 'present': True, 'originalBytes': len(data) + (1 if cut else 0),
            'retainedBytes': len(data), 'truncated': cut,
            'strategy': 'FIRST_AND_LAST_32768_BYTES_NOT_COMPLETE' if cut else 'COMPLETE'})
    payloads[M.OUTCOME] = M.canonical(outcome)
    payloads[M.COLLECTION] = M.canonical({'scope': 'ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY',
        'privateSelectionOnly': True, 'completeBackup': False, 'sources': metadata})
    manifest = {'version': 1, 'exactCommit': M.SOURCE_COMMIT, 'runId': str(M.SOURCE_RUN),
        'runAttempt': 1, 'inputManifestSHA': M.SOURCE_INPUT_SHA if input_sha is None else input_sha,
        'recipientFingerprint': M.V.FINGERPRINT,
        'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                  for name, data in sorted(payloads.items())]}
    buffer = io.BytesIO()
    if not extra:
        # Use the source582 producer, including PAX_FORMAT. Its short ASCII
        # members have ordinary USTAR headers and need no extended records.
        with tempfile.TemporaryDirectory(prefix='w15ct-') as tmp:
            root = Path(tmp)
            for name, data in payloads.items():
                path = root / name; path.write_bytes(data); path.chmod(0o600)
            fd = M.S._directory(str(root), private=True)
            try:
                snapshots = [M.S._verify_file(fd, row) for row in manifest['files']]
                M.S._write_archive(buffer, fd, M.canonical(manifest), manifest['files'], snapshots)
            finally: os.close(fd)
        return buffer.getvalue()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        rows = [('W15_MANIFEST.PRIVATE.json', M.canonical(manifest))]
        rows += [('files/' + name, data) for name, data in sorted(payloads.items())]
        if extra: rows.append(('files/' + M.SOURCES[0], node))
        for name, data in rows:
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o600
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class CapsuleReadbackChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15c-'); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cipher = b'FICTIONAL_CIPHER_NO_CRYPTO_OR_REAL_DATA'
        pin = {'bytes': len(self.cipher), 'sha256': hashlib.sha256(self.cipher).hexdigest()}
        self.request = {'schema': 'helmut-w15-materials-capsule-readback-request/1', 'scope': M.SCOPE,
            'authorized': True, 'exactCommit': 'e' * 40, 'nonce': '11111111-2222-4333-8444-555555555555',
            'sourceRun': M.SOURCE_RUN, 'sourceCommit': M.SOURCE_COMMIT, 'sourceArtifact': M.SOURCE_ARTIFACT,
            'cipherPin': pin, 'issuedAt': '2026-11-02T11:59:00Z', 'expiresAt': '2026-11-02T12:10:00Z'}
        self.secret = Mock(return_value=(b'FICTIONAL_KEY', b'FICTIONAL_PASSPHRASE'))
        self.decrypt = Mock(return_value=archive()); self.stop = Mock()
        def private_root(_):
            root = self.root / 'g'; root.mkdir(mode=0o700); return root
        for target, name, value in ((M, 'CIPHER', pin),
            (M, 'bind_runtime', Mock(return_value={'exactCommit': 'e' * 40, 'runId': '987654321', 'runAttempt': 1})),
            (M.V, 'read_environment', self.secret), (M.V, 'private_root', private_root),
            (M, 'decrypt', self.decrypt), (M, 'stop_agent', self.stop)):
            task = patch.object(target, name, value); task.start(); self.addCleanup(task.stop)

    def admit(self):
        return M.admit(self.request, 'e' * 40, str(self.root), now=NOW)

    def download(self, data=None):
        path = self.root / M.ROOT_NAME / 'cipher' / M.CIPHER_NAME
        path.write_bytes(self.cipher if data is None else data); path.chmod(0o644)
        return path

    def read(self):
        return M.read_existing(self.request, 'e' * 40, str(self.root), now=NOW)

    def test_closed_read_reports_source_fields_without_raw_canary_or_false_full_pass(self):
        self.admit(); self.secret.assert_not_called(); cipher = self.download()
        result = self.read()
        self.assertEqual(result['status'], 'PASS_EXISTING_CAPSULE_READ_ONLY')
        self.assertIs(result['materialsCompleted'], True)  # A later cleanup failure may coexist.
        self.assertEqual(result['firstFailure'], category()); self.assertEqual(result['nodeFirstFailure'], category())
        self.assertEqual(result['controllerFailure'], {'phase': 'mock500-controller-materials',
            'kind': 'filesystem', 'location': 'CONTROLLER_PUBLIC_LINE_817'})
        self.assertEqual(result['sourceReportedActiveProfiles'], 0)
        self.assertEqual(cipher.stat().st_mode & 0o777, 0o600)
        self.assertFalse(result['independentManifestPinAvailable'] or result['completeBackupAccepted']
                         or result['mock500Acceptance'] or result['executionAuthority'])
        self.assertNotIn(PRIVATE, json.dumps(result)); self.assertNotIn('/private/', json.dumps(result))
        self.secret.assert_called_once(); self.decrypt.assert_called_once(); self.stop.assert_called_once()
        with self.assertRaises(M.CapsuleError): self.read()
        self.secret.assert_called_once(); self.decrypt.assert_called_once()

    def test_wrong_request_or_cipher_pin_stops_before_secret_access_and_has_no_retry(self):
        for change in ({'sourceArtifact': M.SOURCE_ARTIFACT + 1}, {'scope': 'ISOLATED_GITHUB_MOCK500_ONLY'},
                       {'expiresAt': '2026-11-02T12:00:00Z'}, {'authorized': False}):
            with self.subTest(change=change), self.assertRaises(M.CapsuleError):
                M.validate_request({**self.request, **change}, 'e' * 40, now=NOW)
        self.admit(); self.download(b'WRONG_CIPHER')
        with self.assertRaises(M.CapsuleError): self.read()
        self.secret.assert_not_called(); self.decrypt.assert_not_called(); self.stop.assert_not_called()
        with self.assertRaises(M.CapsuleError): self.read()

    def test_exact_source_input_pin_and_no_duplicate_or_partial_json_reinterpretation(self):
        bad = archive(input_sha='84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5')
        for raw in (bad, archive(extra=True)):
            with self.assertRaises(M.CapsuleError): M.parse_capsule(raw, self.root)
        good = archive(truncated=True)
        result = M.parse_capsule(good, self.root)
        self.assertTrue(result['collectionTruncated']); self.assertIsNone(result['nodeFirstFailure'])
        self.assertIsNone(result['controllerFailure']); self.assertEqual(result['firstFailure'], category())
        self.assertEqual(result['sourceReportedActiveProfiles'], 'UNKNOWN')
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_agent_stop_unknown_prevents_pass_and_keeps_only_closed_projection(self):
        self.admit(); self.download(); self.stop.side_effect = RuntimeError(PRIVATE)
        with self.assertRaises(M.CapsuleError) as failed: self.read()
        self.assertEqual(failed.exception.phase, 'agent-close')
        self.assertEqual(failed.exception.projection['firstFailure'], category())
        self.assertNotIn(PRIVATE, json.dumps(failed.exception.projection))
        self.assertEqual(str(failed.exception), 'EXISTING_MATERIALS_CAPSULE_REJECTED')
        self.stop.assert_called_once()


if __name__ == '__main__': unittest.main()
