"""Only public canary bytes and fictional files; no real secret or network."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_public_canary_test', Path(__file__).with_name('handoff_canary.py'))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


class CanaryChecks(unittest.TestCase):
    def call(self, argv=None):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = C.main(['--check-public-canary-only'] if argv is None else argv)
        return code, json.loads(out.getvalue())

    def test_matching_public_environment_value_never_accepts_protection_or_private_handoff(self):
        with patch.object(C.os, 'environ', {C.NAME: C.PUBLIC_VALUE}):
            code, result = self.call()
        self.assertEqual(code, 0)
        self.assertTrue(result['publicCanaryMatched'])
        self.assertEqual(result['readiness'], 'BLOCKED')
        for key in ('protectedConfigurationVerified', 'sameThreadConfigurationApplyVerified',
                    'privateHandoffAuthorized', 'privateKeyRequested', 'passphraseRequested', 'executionAuthority'):
            self.assertFalse(result[key])

    def test_missing_or_proxy_like_value_is_closed_without_echo_and_no_other_environment_reads(self):
        class SingleName(dict):
            def get(self, key, default=None):
                if key != C.NAME: raise AssertionError('unrelated environment read')
                return super().get(key, default)
        for env in (SingleName(), SingleName({C.NAME: 'fictional-do-not-echo'})):
            with patch.object(C.os, 'environ', env):
                code, result = self.call()
            self.assertEqual(code, 1)
            self.assertFalse(result['publicCanaryMatched'])
            self.assertNotIn('fictional-do-not-echo', json.dumps(result))

    def test_matching_private_canary_file_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / (C.NAME + '.txt')
            path.write_bytes(C.PUBLIC_VALUE.encode()); path.chmod(0o600)
            code, result = self.call(['--check-public-canary-only', '--canary-file', str(path)])
            self.assertEqual(code, 0)
            self.assertTrue(result['publicCanaryMatched'])
            self.assertFalse(result['privateHandoffAuthorized'])

    def test_symlink_wrong_name_permissions_or_oversize_file_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / C.NAME
            other = Path(tmp) / 'not-a-canary'
            other.write_bytes(C.PUBLIC_VALUE.encode()); other.chmod(0o600)
            path.symlink_to(other)
            for filename in (path, other):
                self.assertEqual(self.call(['--check-public-canary-only', '--canary-file', str(filename)])[0], 1)
            path.unlink(); path.write_bytes(C.PUBLIC_VALUE.encode()); path.chmod(0o644)
            self.assertEqual(self.call(['--check-public-canary-only', '--canary-file', str(path)])[0], 1)
            path.write_bytes(b'x' * 257); path.chmod(0o600)
            self.assertEqual(self.call(['--check-public-canary-only', '--canary-file', str(path)])[0], 1)

    def test_unsupported_run_and_private_arguments_are_not_echoed(self):
        for args in ([], ['--run'], ['--check-public'], ['--passphrase', 'fictional-do-not-echo']):
            code, result = self.call(args)
            self.assertEqual(code, 1)
            self.assertNotIn('fictional-do-not-echo', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
