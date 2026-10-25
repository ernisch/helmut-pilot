"""Synthetic-only tests: fake GPG outputs, fabricated private files, no subprocess."""
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

from helmut_native_test_support import load_source, read_noatime, source

# This is the exact flat recipient prefix of the pinned public server.
RECIPIENT_SOURCE = source('recipient')
m = load_source('recipient')
PRIMARY = 'A' * 40
SUBKEY = 'B' * 40
CREATED = 1792970000
PUBLIC = (b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n'
          + base64.b64encode(b'FABRICATED-NONKEY-PUBLIC-PACKET')
          + b'\n-----END PGP PUBLIC KEY BLOCK-----\n')
SENSITIVE = b'SYNTHETIC_PRIVATE_SENTINEL_MUST_NEVER_APPEAR'


def listing(created=CREATED, lifetime=604800, uid=m.USER_ID, usage='cEC'):
    def key(kind, algorithm, fingerprint, capabilities, curve):
        row = [''] * 21
        for index, value in {0: kind, 1: 'u', 2: '255', 3: algorithm,
                             4: fingerprint[-16:], 5: str(created),
                             6: str(created + lifetime), 11: capabilities,
                             16: curve}.items():
            row[index] = value
        return ':'.join(row)
    uidrow = [''] * 21
    uidrow[0], uidrow[1], uidrow[9] = 'uid', 'u', uid
    return ('\n'.join([key('pub', '22', PRIMARY, usage, 'ed25519'),
                       'fpr:::::::::' + PRIMARY + ':', ':'.join(uidrow),
                       key('sub', '18', SUBKEY, 'e', 'cv25519'),
                       'fpr:::::::::' + SUBKEY + ':']) + '\n').encode('ascii')


class FakeTool:
    def __init__(self, case):
        self.case = case
        self.calls = []
        self.fail_at = None
        self.exception_at = None
        self.mutate_at = None
        self.replies = [b'[GNUPG:] KEY_CREATED P ' + PRIMARY.encode() + b'\n',
                        b'[GNUPG:] KEY_CREATED S ' + SUBKEY.encode() + b'\n',
                        listing(), PUBLIC]

    def __call__(self, path, args, input=None, timeout=None):
        index = len(self.calls)
        self.calls.append((path, args, input, timeout))
        self.case.assertEqual(path, '/usr/bin/env')
        self.case.assertEqual(args[:4], ('-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C', '/usr/bin/gpg'))
        self.case.assertIn('--no-options', args)
        self.case.assertEqual(args[args.index('--homedir') + 1], str(self.case.home))
        self.case.assertFalse(any(arg.startswith(('HOME=', 'GNUPGHOME=', 'GPG_AGENT_INFO=')) for arg in args))
        if index == self.exception_at:
            raise RuntimeError(SENSITIVE.decode())
        if index == 0:
            private = self.case.home / 'private-keys-v1.d'
            private.mkdir(mode=0o700)
            for name in (PRIMARY + '.key', SUBKEY + '.key'):
                fd = os.open(private / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                try:
                    os.write(fd, SENSITIVE)
                finally:
                    os.close(fd)
        if self.mutate_at is not None and index == self.mutate_at[0]:
            self.mutate_at[1]()
        return types.SimpleNamespace(returncode=7 if index == self.fail_at else 0,
                                     stdout=self.replies[index], stderr=SENSITIVE)


class RecipientSyntheticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='recipient-synthetic-')
        self.base = Path(self.temp.name)
        self.home = self.base / m.HOME_NAME
        self.patches = [patch.object(m, 'TARGET_BASE', str(self.base)),
                        patch.object(m.os, 'geteuid', return_value=0),
                        patch.object(m.os, 'getegid', return_value=0),
                        patch.object(m, '_owned', return_value=True),
                        patch.object(m.time, 'time', return_value=CREATED)]
        for item in self.patches:
            item.start()
        # Only the synthetic base is opened; production ancestor ownership is
        # covered separately by metadata tests. No /opt target access occurs.
        self.open_patch = patch.object(m, '_open_base', side_effect=lambda path: os.open(self.base, m._DFLAGS))
        self.open_patch.start()
        self.tool = FakeTool(self)

    def tearDown(self):
        self.open_patch.stop()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def run_setup(self):
        result = m.create_recipient(str(self.base), self.tool)
        self.assertNotIn(SENSITIVE.decode(), json.dumps(result))
        for path in self.base.glob('*.SAFE.json'):
            self.assertNotIn(SENSITIVE, read_noatime(path))
        return result

    def test_success_four_fixed_commands_and_public_binding(self):
        result = self.run_setup()
        self.assertTrue(result['ok'], result)
        self.assertEqual(len(self.tool.calls), 4)
        self.assertEqual(result['primary_fingerprint'], PRIMARY)
        self.assertEqual(result['subkey_fingerprint'], SUBKEY)
        self.assertEqual(result['public_key_sha256'], hashlib.sha256(PUBLIC).hexdigest())
        self.assertEqual(read_noatime((self.base / m.PUBLIC_NAME)), PUBLIC)
        self.assertEqual(json.loads(read_noatime((self.base / m.RESULT_NAME)).decode("utf-8")), result)
        operations = [call[1] for call in self.tool.calls]
        self.assertEqual(operations[0][-5:], ('--quick-generate-key', m.USER_ID, 'ed25519', 'cert', '7d'))
        self.assertEqual(operations[1][-5:], ('--quick-add-key', PRIMARY, 'cv25519', 'encr', '7d'))
        self.assertEqual(operations[2][-7:], ('--with-colons', '--fixed-list-mode', '--with-fingerprint',
                                           '--with-subkey-fingerprint', '--list-keys', '--', PRIMARY))
        self.assertEqual(operations[3][-4:], ('--armor', '--export', '--', PRIMARY))
        self.assertEqual([call[2] for call in self.tool.calls], [b'\n', b'\n', None, None])
        self.assertEqual([call[3] for call in self.tool.calls], [90, 90, 30, 30])
        for path in self.base.rglob('*'):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700 if path.is_dir() else 0o600)
        encoded = repr(self.tool.calls)
        self.assertNotIn('export-secret', encoded)
        self.assertNotIn('gpgconf', encoded)
        self.assertNotIn('--kill', encoded)

    def test_second_call_preserves_every_file_and_makes_no_process_call(self):
        self.assertTrue(self.run_setup()['ok'])
        before = {str(p): read_noatime(p) for p in self.base.rglob('*') if p.is_file()}
        result = self.run_setup()
        self.assertFalse(result['ok'])
        self.assertEqual(result['first_error']['code'], 'RECIPIENT_ALREADY_ATTEMPTED')
        self.assertEqual(len(self.tool.calls), 4)
        self.assertEqual(before, {str(p): read_noatime(p) for p in self.base.rglob('*') if p.is_file()})

    def test_first_failure_retains_partial_state_and_no_retry(self):
        self.tool.fail_at = 1
        result = self.run_setup()
        self.assertEqual(result['first_error'], {'phase': 'add-subkey', 'code': 'TOOL_EXIT_NONZERO'})
        self.assertTrue(result['first_error_recorded'])
        evidence = read_noatime((self.base / m.ERROR_NAME))
        self.assertTrue((self.home / 'private-keys-v1.d' / (PRIMARY + '.key')).exists())
        self.assertFalse((self.base / m.PUBLIC_NAME).exists())
        self.run_setup()
        self.assertEqual(read_noatime((self.base / m.ERROR_NAME)), evidence)
        self.assertEqual(len(self.tool.calls), 2)

    def test_exception_is_redacted(self):
        self.tool.exception_at = 0
        result = self.run_setup()
        self.assertEqual(result['first_error']['code'], 'TOOL_EXECUTION_FAILED')
        self.assertEqual(len(self.tool.calls), 1)

    def test_oversized_output_is_rejected(self):
        self.tool.replies[0] = b'X' * (m.MAX_TOOL_OUTPUT + 1)
        result = self.run_setup()
        self.assertEqual(result['first_error']['code'], 'TOOL_OUTPUT_LIMIT')
        self.assertEqual(len(self.tool.calls), 1)

    def test_nonbytes_result_is_rejected(self):
        self.tool.replies[0] = 'not bytes'
        self.assertEqual(self.run_setup()['first_error']['code'], 'TOOL_RESULT_TYPE')

    def test_wrong_status_kind_is_rejected(self):
        self.tool.replies[0] = b'[GNUPG:] KEY_CREATED B ' + PRIMARY.encode() + b'\n'
        self.assertEqual(self.run_setup()['first_error']['code'], 'KEY_STATUS_INVALID')

    def test_bad_public_expiry_is_rejected(self):
        self.tool.replies[2] = listing(lifetime=0)
        result = self.run_setup()
        self.assertEqual(result['first_error']['code'], 'PUBLIC_EXPIRY_INVALID')
        self.assertEqual(len(self.tool.calls), 3)

    def test_extra_primary_signing_usage_is_rejected(self):
        self.tool.replies[2] = listing(usage='scEC')
        self.assertEqual(self.run_setup()['first_error']['code'], 'PUBLIC_USAGE_MISMATCH')

    def test_wrong_user_id_is_rejected(self):
        self.tool.replies[2] = listing(uid='OTHER USER')
        self.assertEqual(self.run_setup()['first_error']['code'], 'PUBLIC_IDENTITY_OR_VALIDITY')

    def test_private_export_shaped_output_is_rejected(self):
        self.tool.replies[3] = PUBLIC.replace(b'PUBLIC KEY', b'PRIVATE KEY')
        self.assertEqual(self.run_setup()['first_error']['code'], 'PUBLIC_ARMOR_INVALID')
        self.assertFalse((self.base / m.PUBLIC_NAME).exists())

    def test_private_bad_permissions_fail_without_fixing(self):
        private = self.home / 'private-keys-v1.d' / (PRIMARY + '.key')
        self.tool.mutate_at = (3, lambda: private.chmod(0o644))
        self.assertEqual(self.run_setup()['first_error']['code'], 'PRIVATE_FILE_PERMISSIONS')
        self.assertEqual(stat.S_IMODE(private.stat().st_mode), 0o644)

    def test_private_symlink_is_rejected_without_read(self):
        self.tool.mutate_at = (3, lambda: (self.home / 'private-keys-v1.d' / 'EXTERNAL').symlink_to('/DO-NOT-READ'))
        self.assertEqual(self.run_setup()['first_error']['code'], 'PRIVATE_SPECIAL_FILE')

    def test_preexisting_public_symlink_is_preserved(self):
        public = self.base / m.PUBLIC_NAME
        public.symlink_to('/DO-NOT-READ')
        result = self.run_setup()
        self.assertEqual(result['first_error']['code'], 'RECIPIENT_ALREADY_ATTEMPTED')
        self.assertEqual(os.readlink(public), '/DO-NOT-READ')
        self.assertEqual(self.tool.calls, [])
        self.assertFalse((self.base / m.ATTEMPT_NAME).exists())

    def test_wrong_base_or_nonroot_fails_before_open(self):
        result = m.create_recipient(str(self.base) + '/different', self.tool)
        self.assertEqual(result['first_error']['code'], 'TARGET_BASE_REJECTED')
        self.open_patch.stop()
        with patch.object(m, '_open_base', side_effect=AssertionError('must not open')):
            with patch.object(m.os, 'geteuid', return_value=1000):
                result = m.create_recipient(str(self.base), self.tool)
                self.assertEqual(result['first_error']['code'], 'ROOT_REQUIRED')
        self.open_patch.start()
        self.assertEqual(self.tool.calls, [])

    def test_first_error_write_failure_preserves_original_error(self):
        self.tool.fail_at = 0
        original = m._json_new
        def fail_only_error(directory, name, value):
            if name == m.ERROR_NAME:
                raise OSError(SENSITIVE.decode())
            return original(directory, name, value)
        with patch.object(m, '_json_new', side_effect=fail_only_error):
            result = self.run_setup()
        self.assertEqual(result['first_error']['code'], 'TOOL_EXIT_NONZERO')
        self.assertFalse(result['first_error_recorded'])
        self.assertTrue((self.base / m.ATTEMPT_NAME).exists())

    def test_attempt_write_failure_records_first_error_without_generation(self):
        original = m._json_new
        def fail_attempt(directory, name, value):
            if name == m.ATTEMPT_NAME:
                raise OSError(SENSITIVE.decode())
            return original(directory, name, value)
        with patch.object(m, '_json_new', side_effect=fail_attempt):
            result = self.run_setup()
        self.assertEqual(result['first_error']['phase'], 'attempt')
        self.assertTrue(result['first_error_recorded'])
        self.assertEqual(json.loads(read_noatime((self.base / m.ERROR_NAME)).decode("utf-8")), result)
        self.assertEqual(self.tool.calls, [])
        self.assertFalse(self.home.exists())

    def test_result_write_failure_retains_public_file_and_correct_phase(self):
        original = m._json_new
        def fail_result(directory, name, value):
            if name == m.RESULT_NAME:
                raise OSError(SENSITIVE.decode())
            return original(directory, name, value)
        with patch.object(m, '_json_new', side_effect=fail_result):
            result = self.run_setup()
        self.assertFalse(result['ok'])
        self.assertEqual(result['first_error']['phase'], 'write-result')
        self.assertEqual(read_noatime((self.base / m.PUBLIC_NAME)), PUBLIC)
        self.assertEqual(json.loads(read_noatime((self.base / m.ERROR_NAME)).decode("utf-8")), result)
        self.run_setup()
        self.assertEqual(len(self.tool.calls), 4)

    def test_umask_restored_after_success(self):
        before = os.umask(0o027)
        try:
            self.assertTrue(self.run_setup()['ok'])
            found = os.umask(0o027)
            self.assertEqual(found, 0o027)
        finally:
            os.umask(before)

    def test_metadata_helpers_reject_nonroot_and_writable_ancestors(self):
        # Bypass the functional test's ownership stub for these fabricated stats.
        with patch.object(m, '_owned', side_effect=lambda s: s.st_uid == 0 and s.st_gid == 0):
            for uid, gid, permissions, code in [(1000, 0, 0o700, 'DIRECTORY_OWNER_OR_TYPE'),
                                               (0, 1000, 0o700, 'DIRECTORY_OWNER_OR_TYPE'),
                                               (0, 0, 0o777, 'DIRECTORY_PERMISSIONS')]:
                info = types.SimpleNamespace(st_mode=stat.S_IFDIR | permissions, st_uid=uid, st_gid=gid)
                with self.assertRaises(m._Stop) as raised:
                    m._dir(info)
                self.assertEqual(raised.exception.code, code)
        self.assertTrue(m._DFLAGS & os.O_NOFOLLOW)
        self.assertTrue(m._DFLAGS & os.O_NOATIME)
        self.assertTrue(m._WFLAGS & os.O_EXCL)
        self.assertTrue(m._WFLAGS & os.O_NOFOLLOW)

    def test_module_has_no_process_or_network_backend(self):
        tree = ast.parse(RECIPIENT_SOURCE.decode('utf-8'))
        imports = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        self.assertFalse(imports & {'subprocess', 'socket', 'requests', 'urllib'})
        self.assertNotIn('os.system', RECIPIENT_SOURCE.decode('utf-8'))
        self.assertNotIn('export-secret', RECIPIENT_SOURCE.decode('utf-8'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
