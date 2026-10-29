"""Fictional bytes and mocked GPG only. Never generate keys or read real secrets."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_recipient_test', Path(__file__).with_name('verify_receiver_key.py'))
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)
KEY, SECRET = b'fictional-protected-key-bytes-only', b'fictional-passphrase-only'


def listing(kind, fingerprint=V.FINGERPRINT):
    return (kind + ':u::::::::\nfpr:::::::::' + fingerprint + ':\n').encode()


class ReceiverChecks(unittest.TestCase):
    def gpg(self, root, home, action, args, **kwargs):
        self.assertEqual(args[0], '--disable-dirmngr')
        self.assertNotIn(SECRET.decode(), repr(args))
        if action == 'key-import':
            self.assertEqual(kwargs['data'], KEY)
            self.assertEqual(kwargs['secret'], SECRET)
        if action == 'secret-primary': return listing('sec')
        if action == 'public-primary': return listing('pub')
        if action == 'control-encrypt':
            self.assertEqual(kwargs['data'], V.CONTROL)
            self.assertEqual(args[args.index('--recipient') + 1], V.FINGERPRINT)
            self.assertNotIn('secret', kwargs)
            os.write(kwargs['output'], b'fictional-control-cipher')
        if action == 'control-decrypt':
            self.assertEqual(kwargs['secret'], SECRET)
            os.write(kwargs['output'], V.CONTROL)
        # Mock the helper's exclusive private log without invoking GPG.
        fd = V.A._file(root, action + '.PRIVATE.log'); os.close(fd)
        return b''

    def proof(self, root, gpg=None, close_code=0):
        with patch.object(V.A.resource, 'setrlimit'), patch.object(V.A, '_run', side_effect=gpg or self.gpg), \
                patch.object(V.A, '_binary', return_value='/usr/bin/gpgconf'), \
                patch.object(V.subprocess, 'run', return_value=subprocess.CompletedProcess([], close_code)):
            return V.verify_existing_recipient(KEY, SECRET, str(root))

    def test_fixed_recipient_control_success_has_only_closed_safe_scalars(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.proof(Path(tmp))
            self.assertTrue(result['existingRecipientControlVerified'])
            self.assertEqual(result['recipientFingerprint'], V.FINGERPRINT)
            self.assertEqual(result['readiness'], 'BLOCKED')
            for key in ('executionAuthority', 'privateHandoffAuthorized', 'originalCipherDecrypted',
                        'archiveOrDatabaseRestoreAccepted', 'commonLifetimeMemoryAccepted',
                        'end500Acceptance', 'mock500Acceptance', 'controllerStarted'):
                self.assertFalse(result[key])
            self.assertTrue(all(type(value) in (str, bool) for value in result.values()))
            root = next(Path(tmp).iterdir())
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'gnupg').stat().st_mode & 0o777, 0o700)
            for file in root.iterdir():
                if file.is_file(): self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            text = (root / 'RECIPIENT_CONTROL.SAFE.json').read_text()
            self.assertNotIn(SECRET.decode(), text)
            self.assertNotIn(str(root), text)

    def test_wrong_or_extra_primary_and_revoked_key_block_before_control(self):
        values = (listing('sec', 'A' * 40), listing('sec') * 2,
                  listing('sec').replace(b'sec:u', b'sec:r'), b'fpr:::::::::unknown:\n')
        for value in values:
            with self.subTest(value=value), self.assertRaises(V.ReceiverError): V.primary(value, 'sec')
        calls = []
        def gpg(root, home, action, args, **kwargs):
            calls.append(action)
            return listing('sec', 'A' * 40) if action == 'secret-primary' else self.gpg(root, home, action, args, **kwargs)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(V.ReceiverError): self.proof(Path(tmp), gpg=gpg)
        self.assertEqual(calls, ['key-import', 'secret-primary'])

    def test_wrong_control_and_agent_closure_failure_never_accept(self):
        def wrong(root, home, action, args, **kwargs):
            if action == 'control-decrypt':
                os.write(kwargs['output'], b'wrong-public-control')
                return b''
            return self.gpg(root, home, action, args, **kwargs)
        for gpg, close_code in ((wrong, 0), (self.gpg, 1)):
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(V.ReceiverError): self.proof(Path(tmp), gpg, close_code)
                root = next(Path(tmp).iterdir())
                self.assertFalse(json.loads((root / 'RECIPIENT_CONTROL.SAFE.json').read_bytes())['existingRecipientControlVerified'])

    def test_only_dedicated_env_inputs_are_consumed_with_strict_base64_and_passphrase(self):
        env = {V.KEY_NAME: base64.b64encode(KEY).decode(), V.PASS_NAME: SECRET.decode(),
               'HELMUT_W15_ARCHIVE_PASSPHRASE': 'fictional-do-not-consume'}
        with patch.dict(V.os.environ, env, clear=True):
            self.assertEqual(V.read_environment(), (KEY, SECRET))
            self.assertNotIn(V.KEY_NAME, V.os.environ); self.assertNotIn(V.PASS_NAME, V.os.environ)
            self.assertIn('HELMUT_W15_ARCHIVE_PASSPHRASE', V.os.environ)
        for key, secret in (('not base64!', 'fake'), (base64.b64encode(KEY).decode(), 'fake\n'),
                            ('', 'fake'), (base64.b64encode(KEY).decode(), '')):
            with patch.dict(V.os.environ, {V.KEY_NAME: key, V.PASS_NAME: secret}, clear=True):
                with self.assertRaises((V.ReceiverError, ValueError)): V.read_environment()
                self.assertNotIn(V.KEY_NAME, V.os.environ); self.assertNotIn(V.PASS_NAME, V.os.environ)

    def test_invalid_runtime_or_cli_never_reads_secret_or_launches_gpg(self):
        with patch.dict(V.os.environ, {}, clear=True), patch.object(V.subprocess, 'run') as command:
            with self.assertRaises(V.ReceiverError): V.bind_runtime('a' * 40)
            command.assert_not_called()
        for argv in ([], ['--run'], ['--verify-existing-recipient-only', '--runner-temp', 'relative', '--expected-commit', 'a' * 40]):
            with patch.object(V, 'read_environment') as secret, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(V.main(argv), 1)
            secret.assert_not_called()
            self.assertFalse(json.loads(out.getvalue())['existingRecipientControlVerified'])

    def test_actions_commit_and_all_three_public_source_blobs_precede_secrets(self):
        commit = 'a' * 40
        env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REF': V.BRANCH, 'GITHUB_SHA': commit,
               'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_RUN_ID': '40847487765'}
        def git(argv, **kwargs):
            self.assertEqual(kwargs['env'], V.ENV)
            self.assertIn('safe.directory=' + str(V.REPO), argv)
            if argv[-2:] == ['rev-parse', 'HEAD']:
                raw = (commit + '\n').encode()
            else:
                relative = argv[-1]; raw = (V.REPO / relative).read_bytes()
                digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest()
                raw = ('100644 blob ' + digest + '\t' + relative + '\x00').encode()
            return subprocess.CompletedProcess(argv, 0, raw)
        with patch.dict(V.os.environ, env, clear=True), patch.object(V.subprocess, 'run', side_effect=git) as calls:
            result = V.bind_runtime(commit)
        self.assertEqual(calls.call_count, 4)
        self.assertEqual(result['runAttempt'], 1)
        for field, value in (('GITHUB_REF', 'refs/heads/main'), ('GITHUB_RUN_ATTEMPT', '2'), ('GITHUB_SHA', 'b' * 40)):
            with patch.dict(V.os.environ, {**env, field: value}, clear=True), patch.object(V.subprocess, 'run') as calls:
                with self.assertRaises(V.ReceiverError): V.bind_runtime(commit)
                calls.assert_not_called()

    def test_private_destination_rejects_symlinks_writable_parent_and_existing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); target = base / 'target'; target.mkdir(mode=0o700)
            link = base / 'link'; link.symlink_to(target, target_is_directory=True)
            with self.assertRaises(OSError): V.private_root(str(link))
            target.chmod(0o777)
            with self.assertRaises(V.ReceiverError): V.private_root(str(target))
            with patch.object(V.uuid, 'uuid4', return_value=SimpleNamespace(hex='a' * 32)):
                root = V.private_root(str(base))
                with self.assertRaises(FileExistsError): V.private_root(str(base))
            file = root / 'unchanged'; file.write_bytes(b'keep'); file.chmod(0o600)
            with self.assertRaises(FileExistsError): V.A._file(root, 'unchanged')
            self.assertEqual(file.read_bytes(), b'keep')

    def test_existing_helper_passes_secret_only_by_fd_with_clean_environment_and_private_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); home = root / 'gnupg'; home.mkdir(mode=0o700)
            def gpg(argv, **kwargs):
                self.assertNotIn(SECRET.decode(), repr(argv))
                self.assertNotIn(V.KEY_NAME, kwargs['env']); self.assertNotIn(V.PASS_NAME, kwargs['env'])
                self.assertEqual(kwargs['env'], V.ENV)
                self.assertEqual(os.read(kwargs['pass_fds'][0], 4096), SECRET + b'\n')
                self.assertEqual(os.fstat(kwargs['stderr']).st_mode & 0o777, 0o600)
                return subprocess.CompletedProcess(argv, 0, b'fake-control')
            with patch.object(V.A, '_binary', side_effect=lambda name: '/usr/bin/' + name), \
                    patch.object(V.A.subprocess, 'run', side_effect=gpg):
                for action, operation in (('import-fd-only', '--import'), ('decrypt-fd-only', '--decrypt')):
                    self.assertEqual(V.A._run(root, home, action, ['--disable-dirmngr', operation], secret=SECRET), b'fake-control')


if __name__ == '__main__':
    unittest.main()
