"""New cipher-only transport boundary; synthetic files, no APIs or keys."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('w15_artifact_checks', Path(__file__).with_name('artifact_transport.py'))
A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)


class TransportChecks(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory(prefix='w15-fictional-cipher-'); self.addCleanup(t.cleanup)
        self.root = Path(t.name); self.cipher = self.root / 'backup.PRIVATE.gpg'
        self.cipher.write_bytes(b'FICTIONAL-CIPHER-ONLY'); self.cipher.chmod(0o600)
        self.credentials = {'GITHUB_RUN_ID': '123456789', 'GITHUB_REPOSITORY': 'fictional/repo',
            'ACTIONS_RUNTIME_TOKEN': 'FICTIONAL-DO-NOT-PRINT', 'ACTIONS_RESULTS_URL': 'https://example.invalid'}
        self.calls = []

    def run_roundtrip(self, *, corrupt=False, upload_output='artifact-id=123\n', extra=False):
        def tool(kind, root, guard): return root / (kind + '.js')
        def run(node, script, root, credentials, inputs, guard):
            self.calls.append((script.stem, inputs))
            if script.stem == 'upload': return upload_output
            target = Path(inputs['path']) / self.cipher.name
            target.write_bytes(b'CORRUPT' if corrupt else self.cipher.read_bytes())
            if extra: (target.parent / 'unexpected').write_text('extra')
            return ''
        with patch.object(A, '_tool', side_effect=tool), patch.object(A, '_run', side_effect=run):
            return A.roundtrip(self.cipher, destination=self.root/'transport', node=Path('/fictional/node'),
                               credentials=self.credentials, guard=lambda: None)

    def test_only_cipher_exact_path_one_day_and_remote_bytes_are_accepted(self):
        result = self.run_roundtrip()
        self.assertEqual(result['cipherSHA256'], hashlib.sha256(self.cipher.read_bytes()).hexdigest())
        self.assertTrue(result['remoteReadbackObserved']); self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertEqual(result['cipher'].stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.calls[0][1]['path'], str(self.cipher))
        self.assertEqual(self.calls[0][1]['retention-days'], '1')
        self.assertEqual(self.calls[0][1]['overwrite'], 'false')

    def test_corrupt_or_extra_download_fails_without_another_attempt(self):
        for mode in ('corrupt', 'extra'):
            with self.subTest(mode=mode):
                if (self.root/'transport').exists():
                    import shutil; shutil.rmtree(self.root/'transport')
                self.calls=[]
                with self.assertRaises(ValueError): self.run_roundtrip(**{mode: True})
                self.assertEqual(len(self.calls), 2)

    def test_ambiguous_or_absent_artifact_id_stops_before_download(self):
        with self.assertRaises(ValueError): self.run_roundtrip(upload_output='artifact-id=12\nartifact-id=13\n')
        self.assertEqual(len(self.calls), 1)

    def test_links_permissions_and_size_are_rejected_before_transport(self):
        self.cipher.chmod(0o644)
        with self.assertRaises(ValueError): A.pin(self.cipher, lambda: None)
        self.cipher.chmod(0o600)
        os.link(self.cipher, self.root/'hardlink')
        with self.assertRaises(ValueError): A.pin(self.cipher, lambda: None)
        (self.root/'hardlink').unlink()
        with patch.object(A, 'MAX_CIPHER_BYTES', 1), self.assertRaises(ValueError): A.pin(self.cipher, lambda: None)

    def test_guard_failure_prevents_a_pass(self):
        def fail(): raise RuntimeError('FICTIONAL-GUARD-FAILURE')
        with self.assertRaises(RuntimeError): A.pin(self.cipher, fail)

    def test_unexpected_credentials_cannot_become_child_environment(self):
        with self.assertRaises(ValueError):
            A._run(Path('/fictional/node'), Path('/fictional/upload.js'), self.root,
                   {'LD_PRELOAD': 'FICTIONAL'}, {}, lambda: None)

    def test_real_official_action_file_command_heredoc_is_parsed(self):
        result = self.run_roundtrip(upload_output='artifact-id<<ghadelimiter_FAKE\n123\nghadelimiter_FAKE\n'
            'artifact-url<<ghadelimiter_OTHER\nhttps://example.invalid\nghadelimiter_OTHER\n')
        self.assertEqual(result['artifactId'], 123)
        for raw in ('artifact-id<<missing\n123\n', 'artifact-id<<x\n123\nx\nartifact-id=124\n',
                    'artifact-id<<x\n123\n456\nx\n'):
            with self.subTest(raw_size=len(raw)), self.assertRaises(ValueError): A._artifact_id(raw)


if __name__ == '__main__': unittest.main()
