"""Tiny existing-SDK private-log seams; no network, SDK process or GPG."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
from contextlib import redirect_stdout
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('capsule_read_transport', Path(__file__).with_name('artifact_transport.py'))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)
CANARY = 'FICTIONAL_SDK_SIGNED_URL_AND_ERROR_DO_NOT_PUBLISH'


class CapsuleTransportChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='capsule-sdk-fictional-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / 'cipher').mkdir(mode=0o700)
        self.tool = self.root / 'download.js'
        raw = b'FICTIONAL SDK; NEVER EXECUTED'
        self.tool.write_bytes(raw)
        self.tool.chmod(0o600)
        expected = (*T.TOOLS['download'][:2], len(raw), hashlib.sha256(raw).hexdigest())
        task = patch.dict(T.TOOLS, {'download': expected})
        task.start()
        self.addCleanup(task.stop)
        self.credentials = {'GITHUB_TOKEN': 'FICTIONAL_TOKEN', 'GITHUB_REPOSITORY': 'ernisch/helmut-pilot',
                            'GITHUB_RUN_ID': '12345678901'}
        self.inputs = {'artifact-ids': '13145634042', 'run-id': '41455150159',
                       'repository': 'ernisch/helmut-pilot', 'github-token': 'FICTIONAL_TOKEN',
                       'merge-multiple': 'true', 'path': str(self.root / 'cipher')}

    def test_closed_cross_run_read_uses_existing_private_sdk_log_and_no_runtime_credentials(self):
        def child(argv, **kwargs):
            self.assertEqual(argv, ['/FICTIONAL/node', str(self.tool)])
            self.assertNotIn('ACTIONS_RUNTIME_TOKEN', kwargs['env'])
            self.assertNotIn('HELMUT_W15_RECEIVER_PROTECTED_KEY_B64', kwargs['env'])
            self.assertEqual(kwargs['env']['INPUT_GITHUB-TOKEN'], 'FICTIONAL_TOKEN')
            self.assertIs(kwargs['stdout'], kwargs['stderr'])
            kwargs['stdout'].write(CANARY.encode())
            return SimpleNamespace(poll=lambda: 0, returncode=0)
        public = io.StringIO()
        with patch.object(T.subprocess, 'Popen', side_effect=child), redirect_stdout(public):
            self.assertEqual(T._run('/FICTIONAL/node', self.tool, self.root,
                self.credentials, self.inputs, Mock(), existing_capsule_readonly=True), '')
        self.assertNotIn(CANARY, public.getvalue())
        log = self.root / 'download.log.PRIVATE'
        self.assertEqual(log.read_text(), CANARY)
        self.assertEqual(log.stat().st_mode & 0o777, 0o600)

    def test_readonly_cannot_select_upload_another_source_or_extra_credentials(self):
        variants = [({'artifact-ids': '99999'}, None), ({'run-id': '99999'}, None),
                    ({'path': str(self.root)}, None), ({'repository': 'other/repository'}, None),
                    (None, {**self.credentials, 'ACTIONS_RUNTIME_TOKEN': 'FICTIONAL'}),
                    (None, {**self.credentials, 'GITHUB_REPOSITORY': 'other/repository'})]
        with patch.object(T.subprocess, 'Popen') as process:
            for change, credentials in variants:
                inputs = dict(self.inputs, **(change or {}))
                with self.subTest(change=change), self.assertRaises(ValueError):
                    T._run('/FICTIONAL/node', self.tool, self.root,
                        credentials or self.credentials, inputs, Mock(), existing_capsule_readonly=True)
            with self.assertRaises(ValueError):
                T._run('/FICTIONAL/node', self.root / 'upload.js', self.root,
                    self.credentials, self.inputs, Mock(), existing_capsule_readonly=True)
            process.assert_not_called()

    def test_sdk_failure_keeps_raw_error_private_and_propagates_only_fixed_rejection(self):
        def child(*args, **kwargs):
            kwargs['stderr'].write(CANARY.encode())
            return SimpleNamespace(poll=lambda: 1, returncode=1)
        public = io.StringIO()
        with patch.object(T.subprocess, 'Popen', side_effect=child), redirect_stdout(public):
            with self.assertRaisesRegex(ValueError, '^CIPHER_ARTIFACT_TRANSPORT_REJECTED$'):
                T._run('/FICTIONAL/node', self.tool, self.root, self.credentials,
                    self.inputs, Mock(), existing_capsule_readonly=True)
        self.assertEqual(public.getvalue(), '')
        self.assertEqual((self.root / 'download.log.PRIVATE').read_text(), CANARY)

    def test_default_transport_keeps_existing_runtime_credential_requirement(self):
        with patch.object(T.subprocess, 'Popen') as process, self.assertRaises(ValueError):
            T._run('/FICTIONAL/node', self.tool, self.root, self.credentials, self.inputs, Mock())
        process.assert_not_called()


if __name__ == '__main__':
    unittest.main()
