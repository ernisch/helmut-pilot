"""Pure synthetic installer integration; no SSH, GPG, network or target I/O.

Run with scripts/hetzner-native-automation-tests.py.
The source loader reads with O_NOATIME|O_NOFOLLOW and supplies public sibling
bootstrap/server sources plus a synthetic precheck. Every installation effect
is replaced by an in-memory object before main() is invoked.
"""
import ast
import base64
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import types
import unittest
from unittest import mock

from helmut_native_test_support import (SCRIPTS, read_noatime,
                                        source as pinned_source)


def selected_source():
    return SCRIPTS / 'hetzner-native-automation-installer.py'


def source_bytes(path):
    return read_noatime(path)


def load():
    source = selected_source()
    namespace = {
        '__name__': 'synthetic_installer_definitions',
        'BOOTSTRAP_SOURCE': pinned_source('bootstrap'),
        'SERVER_SOURCE': pinned_source('server'),
        'PRECHECK_SOURCE': b"def main(argv):\n    raise AssertionError('unbound synthetic precheck')\n",
    }
    exec(compile(pinned_source('installer'), str(source), 'exec'), namespace)
    return namespace


def key_material():
    blob = base64.b64encode(b'\0\0\0\x0bssh-ed25519\0\0\0 ' + bytes(range(32))).decode('ascii')
    public = 'ssh-ed25519 ' + blob
    raw = ('from="100.64.0.0/10",restrict,command="/usr/bin/python3 -I /usr/local/libexec/helmut-ci-bridge.py gate" ' + public + '\n').encode('ascii')
    return public, raw


SETTINGS = b'pubkeyauthentication yes\npermitrootlogin prohibit-password\nforcecommand none\npermituserenvironment no\nauthorizedkeyscommand none\ntrustedusercakeys none\nacceptenv LANG LC_*\nauthorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2\n'


class InstallerIntegration(unittest.TestCase):
    def setUp(self):
        self.q = load()
        self.public, self.raw = key_material()

    def rejected(self, fn, code):
        with self.assertRaises(self.q['B']['Stop']) as found:
            fn()
        self.assertEqual(found.exception.code, code)

    def append_fixture(self, rename_failure=False):
        q = self.q
        before = b'# legacy root key bytes without newline'
        metadata = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=0, st_gid=0)
        written, events = bytearray(), []
        fake = types.SimpleNamespace(**{name: getattr(os, name) for name in ('O_WRONLY', 'O_CREAT', 'O_EXCL', 'O_NOFOLLOW', 'O_CLOEXEC')})
        fake.path = os.path
        fake.open = lambda *args, **kwargs: 12
        fake.fchmod = lambda *args: events.append(('fchmod', args))
        fake.write = lambda fd, data: (written.extend(data) or len(data))
        fake.fsync = lambda fd: None
        fake.fstat = lambda fd: metadata
        fake.stat = lambda *args, **kwargs: metadata
        fake.close = lambda fd: None
        def rename(*args, **kwargs):
            events.append(('rename', args))
            if rename_failure:
                raise OSError('synthetic rename failure')
        fake.rename = rename
        q['os'] = fake
        q['B']['trusted_dir'] = lambda path: 11
        reads = iter(((before, metadata), (None, metadata)))
        def read(*args, **kwargs):
            data, info = next(reads)
            return (bytes(written) if data is None else data), info
        q['read'] = read
        return before, metadata, written, events

    def preflight_fixture(self):
        q = self.q
        saved = []
        q['os'] = types.SimpleNamespace(getuid=lambda: 0, geteuid=lambda: 0, getgid=lambda: 0,
            getegid=lambda: 0, umask=lambda mode: None, close=lambda fd: None,
            path=types.SimpleNamespace(lexists=lambda path: False, dirname=os.path.dirname))
        q['B']['trusted_dir'] = lambda path: 11
        q['B']['write_once'] = lambda path, data: saved.append((path, json.loads(data)))
        report = {'summary': {'FAIL': 1, 'BLOCKED': 0}, 'checks': {
            'mounts': {'status': 'FAIL', 'actual': {'expectedValue': False}}}}
        q['P']['main'] = lambda argv: (print(json.dumps(report)) or 1)
        q['read'] = mock.Mock(side_effect=AssertionError('key read before admission'))
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = q['main']()
        return code, json.loads(output.getvalue()), saved

    def test_01_exact_existing_public_key(self):
        self.assertEqual(self.q['public_ci_key'](self.raw), self.public)

    def test_02_reject_missing_restrict(self):
        self.rejected(lambda: self.q['public_ci_key'](self.raw.replace(b'restrict,', b'')), 'CI_PUBLIC_KEY_FORMAT')

    def test_03_reject_extra_key_source_line(self):
        self.rejected(lambda: self.q['public_ci_key'](self.raw + b'# extra\n'), 'CI_PUBLIC_KEY_FORMAT')

    def test_04_effective_root_authorized_paths(self):
        self.assertEqual(self.q['authorized_paths'](SETTINGS, '/root'), ['/root/.ssh/authorized_keys', '/root/.ssh/authorized_keys2'])

    def test_05_reject_trusted_user_ca(self):
        self.rejected(lambda: self.q['authorized_paths'](SETTINGS.replace(b'trustedusercakeys none', b'trustedusercakeys /tmp/ca'), '/root'), 'ROOT_SSH_POLICY_UNQUALIFIED')

    def test_06_reject_shell_environment(self):
        self.rejected(lambda: self.q['authorized_paths'](SETTINGS.replace(b'acceptenv LANG LC_*', b'acceptenv BASH_ENV'), '/root'), 'SSH_ACCEPTENV_UNQUALIFIED')

    def test_07_reject_parent_path(self):
        self.rejected(lambda: self.q['authorized_paths'](SETTINGS.replace(b'.ssh/authorized_keys2', b'../keys'), '/root'), 'SSH_AUTHORIZED_PATH_UNSAFE')

    def test_08_preserve_existing_bytes(self):
        before, metadata, written, events = self.append_fixture()
        self.q['append_key']('/root/.ssh/authorized_keys', before, metadata, self.public)
        self.assertTrue(bytes(written).startswith(before + b'\nfrom="100.64.0.0/10",restrict,command="/usr/bin/env -i '))

    def test_09_one_fixed_forced_command(self):
        before, metadata, written, events = self.append_fixture()
        self.q['append_key']('/root/.ssh/authorized_keys', before, metadata, self.public)
        self.assertEqual(bytes(written).count(self.public.encode()), 1)
        self.assertIn(b'HELMUT_REQUEST_COMMAND=\\"$SSH_ORIGINAL_COMMAND\\"', written)
        self.assertIn(b'/usr/bin/python3 -I -S -B ' + self.q['BASE'].encode() + b'/bootstrap.py', written)

    def test_10_preserve_exact_mode(self):
        before, metadata, written, events = self.append_fixture()
        self.q['append_key']('/root/.ssh/authorized_keys', before, metadata, self.public)
        self.assertIn(('fchmod', (12, 0o640)), events)
        self.assertTrue(self.q['KEY_WRITE_ATTEMPTED'] and self.q['KEY_WRITE_VERIFIED'])

    def test_11_append_reports_one_entry(self):
        before, metadata, written, events = self.append_fixture()
        result = self.q['append_key']('/root/.ssh/authorized_keys', before, metadata, self.public)
        self.assertEqual(result['added_entries'], 1)
        self.assertEqual(result['after_sha256'], hashlib.sha256(written).hexdigest())

    def test_12_rename_failure_stays_unknown(self):
        before, metadata, written, events = self.append_fixture(rename_failure=True)
        with self.assertRaises(OSError):
            self.q['append_key']('/root/.ssh/authorized_keys', before, metadata, self.public)
        self.assertTrue(self.q['KEY_WRITE_ATTEMPTED'])
        self.assertFalse(self.q['KEY_WRITE_VERIFIED'])

    def test_13_failed_precheck_retains_actuals_and_blocks_key_read(self):
        code, result, saved = self.preflight_fixture()
        self.assertEqual(code, 1)
        self.assertEqual(result['key_write_state'], 'NOT_ATTEMPTED')
        self.assertEqual(result['precheck_failures']['mounts']['actual'], {'expectedValue': False})
        self.q['read'].assert_not_called()

    def test_14_preflight_private_error_has_fixed_sibling(self):
        code, result, saved = self.preflight_fixture()
        self.assertEqual(saved[0][0], self.q['BASE'] + '.PREFLIGHT_ERROR.PRIVATE.json')
        self.assertTrue(result['first_tool_diagnostic_saved'])

    def test_15_stdout_redacts_public_armor_but_root_result_keeps_it(self):
        q, saved, created = self.q, [], []
        target = '/root/.ssh/authorized_keys'
        metadata = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_gid=0,
            st_dev=1, st_ino=2, st_atime_ns=3, st_mtime_ns=4, st_ctime_ns=5)
        q['os'] = types.SimpleNamespace(getuid=lambda: 0, geteuid=lambda: 0, getgid=lambda: 0,
            getegid=lambda: 0, umask=lambda mode: None, close=lambda fd: None,
            path=types.SimpleNamespace(lexists=lambda path: path == target, dirname=os.path.dirname, normpath=os.path.normpath),
            mkdir=lambda path, mode: created.append(path),
            statvfs=lambda path: types.SimpleNamespace(f_bavail=20 * 1024**3, f_frsize=1))
        q['pwd'] = types.SimpleNamespace(getpwnam=lambda user: types.SimpleNamespace(pw_uid=0, pw_gid=0, pw_dir='/root'))
        q['B'].update(trusted_dir=lambda path: 11, main_commit=lambda: 'a' * 40,
            qualify_ci=lambda commit: {'qualified': True}, get=lambda url, limit: q['SERVER_SOURCE'],
            write_once=lambda path, data: saved.append((path, data)))
        report = {'summary': {'FAIL': 0, 'BLOCKED': 0}, 'checks': {'freeCapacity': {'status': 'PASS', 'actual': {'freeBytes': 20 * 1024**3}}}}
        q['P'] = {'main': lambda argv: (print(json.dumps(report)) or 0), 'M': {'kernel': lambda path: 'synthetic-boot'}}
        gate_digest = '85111232a240a41d43622a2ad188f74232ca04b6dd5458da0871c254977d69d9'
        q['hashlib'] = types.SimpleNamespace(sha256=lambda data: types.SimpleNamespace(hexdigest=lambda: gate_digest) if data == b'synthetic-gate' else hashlib.sha256(data))
        def read(path, limit=65536):
            return ({q['KEY_SOURCE']: self.raw, q['GATE']: b'synthetic-gate', target: b'legacy-key\n'}[path], metadata)
        q['read'] = read
        q['tool'] = lambda path, args: SETTINGS if path.endswith('/sshd') else b'gpg (GnuPG) 2.4.1\nPubkey: EDDSA ECDH\n'
        q['append_key'] = lambda *args: {'path': target, 'added_entries': 1}
        recipient = {'fingerprint': 'A' * 40, 'public_sha256': 'b' * 64, 'public_key_base64': 'SYNTHETIC_PUBLIC_ARMOR'}
        q['S']['handle'] = lambda request, context: {'recipient': recipient}
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = q['main']()
        printed = json.loads(output.getvalue())
        self.assertEqual(code, 0, printed)
        self.assertEqual(printed['recipient'], {key: recipient[key] for key in ('fingerprint', 'public_sha256')})
        result = next(json.loads(data) for path, data in saved if path.endswith('/INSTALLATION_RESULT.SAFE.json'))
        self.assertEqual(result['recipient'], recipient)
        self.assertNotIn('SYNTHETIC_PUBLIC_ARMOR', output.getvalue())

    def test_16_exact_explicit_install_flag_only(self):
        path = selected_source()
        tree = ast.parse(source_bytes(path), str(path))
        guard = tree.body[-1]
        self.assertIsInstance(guard, ast.If)
        code = compile(ast.Module(body=[guard], type_ignores=[]), str(path), 'exec')
        for arguments, expected in (([], 2), (['--other'], 2),
            (['--install-bounded-native-automation-once', 'extra'], 2),
            (['--install-bounded-native-automation-once'], 71)):
            with self.subTest(arguments=arguments):
                called = mock.Mock(return_value=71)
                env = {'__name__': '__main__', 'sys': types.SimpleNamespace(argv=['installer', *arguments]),
                    'json': json, 'main': called}
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    with self.assertRaises(SystemExit) as exited:
                        exec(code, env)
                self.assertEqual(exited.exception.code, expected)
                if expected == 71:
                    called.assert_called_once_with()
                else:
                    called.assert_not_called()
                    self.assertEqual(json.loads(output.getvalue())['status'], 'NOT_EXECUTED_EXPLICIT_INSTALL_FLAG_REQUIRED')


if __name__ == '__main__':
    unittest.main(verbosity=2)
