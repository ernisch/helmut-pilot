"""Disposable fictional key/archive/control only; never the actual archive secret."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_archive_proof_test', Path(__file__).with_name('verify_archive_key.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class ArchiveKeyChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-recovery-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.home = cls.root / 'fixture-home'; cls.home.mkdir(mode=0o700)
        cls.addClassCleanup(subprocess.run, ['gpgconf', '--homedir', str(cls.home), '--kill', 'gpg-agent'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = ['gpg', '--no-options', '--homedir', str(cls.home), '--batch', '--pinentry-mode', 'loopback', '--passphrase', '']
        def gpg(args, data=None):
            return subprocess.run(base + args, input=data, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, check=True, timeout=30).stdout
        gpg(['--quick-generate-key', 'Fictional W15 recovery <recovery@invalid>', 'ed25519', 'cert', '1d'])
        rows = gpg(['--with-colons', '--fingerprint', '--list-secret-keys']).decode().splitlines()
        cls.fingerprint = next(line.split(':')[9] for line in rows if line.startswith('fpr:'))
        gpg(['--quick-add-key', cls.fingerprint, 'cv25519', 'encr', '1d'])
        exported = gpg(['--export-secret-keys', cls.fingerprint])
        cls.secret = b'fictional-archive-passphrase-only'
        read_fd, write_fd = os.pipe()
        os.write(write_fd, cls.secret + b'\n'); os.close(write_fd)
        try:
            args = ['gpg', '--no-options', '--homedir', str(cls.home), '--batch', '--pinentry-mode', 'loopback',
                    '--passphrase-fd', str(read_fd), '--cipher-algo', 'AES256', '--symmetric']
            cls.key_cipher = subprocess.run(args, input=exported, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL, pass_fds=(read_fd,), check=True, timeout=30).stdout
        finally:
            os.close(read_fd)
        challenge = b'Fictional pinned control. Never a W15 input.'
        cls.challenge_cipher = gpg(['--trust-model', 'always', '--recipient', cls.fingerprint, '--encrypt'], challenge)
        cls.expected = {'exportSHA256': hashlib.sha256(exported).hexdigest(), 'fingerprint': cls.fingerprint,
                        'challengeSHA256': hashlib.sha256(challenge).hexdigest()}

    def test_inherited_path_cannot_select_a_password_capturing_binary(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('gpg', 'gpgconf'):
                path = Path(tmp) / name
                path.write_text('#!/bin/sh\nexit 99\n'); path.chmod(0o700)
            with patch.dict(os.environ, {'PATH': tmp + ':/usr/bin:/bin'}):
                for name in ('gpg', 'gpgconf'):
                    self.assertIn(R._binary(name), ('/usr/bin/' + name, '/bin/' + name))
                self.assertNotEqual(R._gpg(self.home)[0], str(Path(tmp) / 'gpg'))

    def test_real_archive_key_import_and_pinned_challenge_without_secret_in_child_args_or_env(self):
        original = subprocess.run
        def guarded(cmd, **kwargs):
            self.assertNotIn(self.secret.decode(), repr(cmd))
            self.assertNotIn(self.secret.decode(), repr(kwargs.get('env')))
            self.assertNotIn(R.SECRET_NAME, kwargs.get('env', {}))
            return original(cmd, **kwargs)
        output = self.root / 'successful'
        with patch.object(R.subprocess, 'run', side_effect=guarded):
            result = R._proof(self.key_cipher, self.challenge_cipher, self.secret, output, self.expected)
        self.assertEqual(result['status'], 'PASS_RECOVERY_KEY_AND_PINNED_CONTROL_ONLY')
        self.assertEqual(result['recoveredFingerprint'], self.fingerprint)
        self.assertFalse(result['w15RecipientRestored'])
        self.assertFalse(result['archiveOrDatabaseRestoreAccepted'])
        self.assertFalse(result['executionAuthority'])
        self.assertEqual(output.stat().st_mode & 0o777, 0o700)
        for file in output.iterdir():
            if file.is_file(): self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(self.secret.decode(), (output / 'KEY_RECOVERY.SAFE.json').read_text())
        with self.assertRaises(R.RecoveryError):
            R._proof(self.key_cipher, self.challenge_cipher, self.secret, output, self.expected)

    def test_wrong_password_never_produces_key_acceptance_or_retries(self):
        output = self.root / 'wrong-password'
        with self.assertRaises(R.RecoveryError):
            R._proof(self.key_cipher, self.challenge_cipher, b'wrong-fictional-passphrase', output, self.expected)
        result = json.loads((output / 'KEY_RECOVERY.SAFE.json').read_bytes())
        self.assertEqual(result['status'], 'FAIL_KEY_OR_CONTROL_PROOF')
        self.assertFalse(result['w15RecipientRestored'])
        self.assertFalse((output / 'key-import.PRIVATE.log').exists())
        self.assertEqual((output / 'recovered-key.PRIVATE.pgp').stat().st_mode & 0o777, 0o600)

    def test_wrong_export_or_control_hash_refuses_otherwise_genuine_key(self):
        for key in ('exportSHA256', 'challengeSHA256'):
            with self.subTest(key=key):
                output = self.root / ('wrong-' + key)
                with self.assertRaises(R.RecoveryError):
                    R._proof(self.key_cipher, self.challenge_cipher, self.secret, output, {**self.expected, key: '0' * 64})
                self.assertEqual(json.loads((output / 'KEY_RECOVERY.SAFE.json').read_bytes())['status'], 'FAIL_KEY_OR_CONTROL_PROOF')

    def test_unavailable_secret_and_bad_input_fail_before_gpg_or_secret_echo(self):
        with patch.object(R.os, 'environ', {}), patch.object(R.subprocess, 'run', side_effect=AssertionError('no process')):
            with self.assertRaises(R.RecoveryError): R.read_secret()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('KEY_BACKUP.PRIVATE.pgp', 'CHALLENGE.PRIVATE.pgp'):
                path = root / name; path.write_bytes(b'wrong'); path.chmod(0o600)
            with patch.object(R, 'read_secret') as secret, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(R.main(['--verify-archive-key-only', '--evidence-root', str(root)]), 1)
            secret.assert_not_called()
            self.assertFalse(json.loads(out.getvalue())['keyRecoveryVerified'])


if __name__ == '__main__':
    unittest.main()
