"""Only new synthetic index-channel checks; no originals, HTTP or new keys."""
import sys
sys.dont_write_bytecode = True

import base64
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_encrypted_index_checks', HERE / 'encrypted_index.py')
N = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(N)
COMMIT = 'a' * 40


def armor(size=200):
    raw = b'\x84' + b'X' * size
    encoded = base64.b64encode(raw).decode()
    body = '\n'.join(encoded[start:start + 64] for start in range(0, len(encoded), 64))
    return '-----BEGIN PGP MESSAGE-----\n\n' + body + '\n-----END PGP MESSAGE-----\n'


class EncryptedIndexChecks(unittest.TestCase):
    def private_root(self):
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-index-')
        self.addCleanup(temp.cleanup)
        return Path(temp.name)

    def test_payload_only_ciphertext_and_actual_total_limit(self):
        encrypted = armor()
        raw = N.dispatch_payload(COMMIT, encrypted)
        data = json.loads(raw)
        self.assertEqual(data['ref'], N.BRANCH)
        self.assertEqual(data['inputs'], {'w15_mode': N.MODE, 'expected_commit': COMMIT, N.INPUT_NAME: encrypted})
        self.assertLessEqual(len(raw), 65535)
        self.assertNotIn(b'https:', raw)
        # The envelope, field names and escaped line breaks also count. This
        # example fits as an input value but exceeds the full request limit.
        encrypted = armor(47600)
        self.assertLessEqual(len(encrypted), 65535)
        with self.assertRaises(ValueError):
            N.dispatch_payload(COMMIT, encrypted)

    def test_plaintext_private_keys_headers_extra_text_and_non_pkesk_rejected(self):
        for value in ('https://fake.oaiusercontent.com/FICTIONAL', '{}',
                      armor().replace('PGP MESSAGE', 'PGP PRIVATE KEY BLOCK'),
                      armor().replace('\n\n', '\nComment: https://fake.oaiusercontent.com\n\n'),
                      armor() + 'TRAILING', armor().replace('hFhY', 'rFhY'),
                      '-----BEGIN PGP MESSAGE-----\n\neyJmb28iOiJodHRwczovL2Zha2UifQ==\n-----END PGP MESSAGE-----\n'):
            with self.subTest(kind=value[:20]), self.assertRaises(Exception):
                N.dispatch_payload(COMMIT, value)

    def test_actual_event_mode_commit_parameter_match_required(self):
        root = self.private_root()
        path = root / 'event.json'
        expected = json.loads(N.dispatch_payload(COMMIT, armor()))['inputs']
        env = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_EVENT_PATH': str(path)}
        with patch.dict(os.environ, env, clear=True):
            path.write_text(json.dumps({'inputs': expected}))
            self.assertGreater(N.check_event(COMMIT, armor()), 0)
            for changed in ({**expected, 'extra': 'unexpected'}, {**expected, 'w15_mode': 'standard'},
                            {**expected, 'expected_commit': 'b' * 40}, {**expected, N.INPUT_NAME: armor(201)}):
                path.write_text(json.dumps({'inputs': changed}))
                with self.assertRaises(ValueError):
                    N.check_event(COMMIT, armor())
            path.write_text(json.dumps({'inputs': expected}))
            with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'pull_request'}), self.assertRaises(ValueError):
                N.check_event(COMMIT, armor())

    def test_real_public_key_encryption_of_fictional_index_without_key_generation(self):
        root = self.private_root()
        raw = json.dumps({'schema': 'helmut-w15-private-cipher-url-index/1', 'expectedCommit': COMMIT,
                          'createdAtUTC': '2026-10-29T12:00:00Z', 'expiresAtUTC': '2026-10-29T12:05:00Z',
                          'parts': [{'index': i, 'url': f'https://fake-{i}.oaiusercontent.com/FICTIONAL'} for i in range(1, 16)]})
        encrypted = N.encrypt_index(raw, COMMIT, root)
        self.assertTrue(N.cipher_bytes(encrypted))
        self.assertNotIn('FICTIONAL', encrypted)
        self.assertNotIn('https:', encrypted)
        self.assertLessEqual(len(N.dispatch_payload(COMMIT, encrypted)), 65535)
        self.assertEqual((root / 'download-index.ENCRYPTED.asc').stat().st_mode & 0o777, 0o600)

    def test_public_key_pin_mismatch_blocks_before_encryption(self):
        root = self.private_root()
        raw = json.dumps({'schema': 'helmut-w15-private-cipher-url-index/1', 'expectedCommit': COMMIT})
        with patch.object(N, 'PUBLIC_KEY_SHA', '0' * 64), self.assertRaises(ValueError):
            N.encrypt_index(raw, COMMIT, root)
        self.assertFalse((root / 'download-index.ENCRYPTED.asc').exists())

    def fake_child(self, *, size=12, status=True, exit_code=0):
        status_rows = ('[GNUPG:] DECRYPTION_KEY ' + N.V.FINGERPRINT + ' ' + N.V.FINGERPRINT
                       + ' u\n[GNUPG:] DECRYPTION_OKAY\n[GNUPG:] GOODMDC\n') if status else ''
        code = ('import os,sys;assert "FICTIONAL_SECRET" not in os.environ;args=sys.argv;'
                'fd=int(args[args.index("--status-fd")+1]);'
                'os.write(fd,' + repr(status_rows.encode()) + ');'
                'sys.stdout.buffer.write(b"X"*' + str(size) + ');sys.stdout.buffer.flush();'
                'sys.exit(' + str(exit_code) + ')')
        return [sys.executable, '-c', code]

    def test_bounded_regular_file_output_status_authentication_and_clean_child_environment(self):
        root = self.private_root()
        with patch.object(N.A, '_gpg', return_value=self.fake_child()), patch.dict(os.environ, {'FICTIONAL_SECRET': 'NOT_IN_CHILD'}):
            self.assertEqual(N.decrypt_index(armor(), root, root, b'FICTIONAL-PASSPHRASE'), 'X' * 12)
        self.assertEqual((root / 'cipher-url-index.PRIVATE.json').stat().st_mode & 0o777, 0o600)
        self.assertTrue((root / 'index-decrypt.PRIVATE.status').exists())

    def test_oversize_decrypt_is_physically_bounded_and_preserves_partial(self):
        root = self.private_root()
        with patch.object(N.A, '_gpg', return_value=self.fake_child(size=N.MAX_PLAINTEXT_BYTES + 8192)), self.assertRaises(ValueError):
            N.decrypt_index(armor(), root, root, b'FICTIONAL')
        partial = root / 'cipher-url-index.PRIVATE.json'
        self.assertTrue(partial.exists())
        self.assertLessEqual(partial.stat().st_size, N.MAX_PLAINTEXT_BYTES)

    def test_missing_authenticated_status_or_nonzero_exit_never_yields_plaintext(self):
        for kwargs in ({'status': False}, {'exit_code': 1}):
            root = self.private_root()
            with patch.object(N.A, '_gpg', return_value=self.fake_child(**kwargs)), self.assertRaises(ValueError):
                N.decrypt_index(armor(), root, root, b'FICTIONAL')
            self.assertTrue((root / 'cipher-url-index.PRIVATE.json').exists())

    def test_changed_receipt_handoff_connects_to_existing_original_verification(self):
        spec = importlib.util.spec_from_file_location('w15_existing_fake_channel', HERE / 'test_receive_existing_inputs.py')
        tests = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(tests)
        case = tests.ExistingReceiveChecks()
        root = self.private_root()
        result, _, download, receive, verify = case.run_receiver(root)
        self.assertEqual(result['verifiedFiles'], 12)
        self.assertEqual(result['verifiedBytes'], 242570240)
        self.assertEqual(result['indexHandoff'], 'GPG_WORKFLOW_INPUT_NO_SECRET_WRITE')
        self.assertEqual(download.call_count, 1)
        self.assertEqual(receive.call_count, 1)
        self.assertEqual(verify.call_count, 1)
        self.assertFalse(result['executionAuthority'])

    def test_workflow_uses_input_env_and_only_existing_two_secrets(self):
        workflow = (HERE.parents[1] / '.github/workflows/ci.yml').read_text()
        receiver = workflow.split('  w15-receive-inputs:\n', 1)[1]
        self.assertIn('HELMUT_W15_CIPHER_INDEX_GPG: ${{ inputs.w15_cipher_index }}', receiver)
        self.assertNotIn('HELMUT_W15_CIPHER_URL_INDEX', receiver)
        self.assertEqual(receiver.count('${{ secrets.'), 2)
        self.assertNotIn('${{ inputs.', receiver.split('        run: python3', 1)[1])
        source = (HERE / 'receive_existing_inputs.py').read_text()
        self.assertNotIn('gh secret', source)
        self.assertNotIn('HELMUT_W15_CIPHER_URL_INDEX', source)


if __name__ == '__main__':
    unittest.main()
