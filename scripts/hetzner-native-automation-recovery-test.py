"""Synthetic one-shot recovery tests. No GPG, network or original key reads."""
from contextlib import ExitStack
import base64
import copy
import errno
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

from helmut_native_test_support import load_source, read_noatime

SERVER = load_source('server')
CLIENT = load_source('client')
ORIGINAL_ERROR_PIN = SERVER.RECOVERY_ORIGINAL_ERROR_SHA256
EXPECTED_ERROR_PIN = '7d168d7defda650d313e152bd1b015b13becc24c9827eb411de775d6a6beae50'
PRIMARY, SUBKEY = 'A' * 40, 'B' * 40
CREATED = 1792970000
NOW = CREATED + 60
SENTINEL = b'SYNTHETIC_PRIVATE_KEY_CONTENT_MUST_NEVER_BE_READ'
PUBLIC = (b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n'
          + base64.b64encode(b'FABRICATED-NONKEY-PUBLIC-PACKET')
          + b'\n-----END PGP PUBLIC KEY BLOCK-----\n')
ATTEMPT_BYTES = b'{"operation":"create-once","schema":"helmut-recipient-v1"}\n'


def listing(validity=('u', 'u', 'u'), edits=None):
    def key(kind, algorithm, fingerprint, usage, curve, valid):
        row = [''] * 21
        for index, value in {0: kind, 1: valid, 2: '255', 3: algorithm,
                             4: fingerprint[-16:], 5: str(CREATED),
                             6: str(CREATED + 7 * 86400), 8: 'u',
                             11: usage, 16: curve}.items():
            row[index] = value
        return row
    uid = [''] * 21
    uid[0], uid[1], uid[9] = 'uid', validity[1], SERVER.USER_ID
    rows = [key('pub', '22', PRIMARY, 'cEC', 'ed25519', validity[0]),
            ['fpr', *([''] * 8), PRIMARY, ''], uid,
            key('sub', '18', SUBKEY, 'e', 'cv25519', validity[2]),
            ['fpr', *([''] * 8), SUBKEY, '']]
    for (row, field), value in (edits or {}).items():
        rows[row][field] = value
    return ('\n'.join(':'.join(row) for row in rows) + '\n').encode('ascii')


class RecoveryHarness:
    def __init__(self, case, before=None, after=None):
        self.case = case
        self.before = listing(('-', 'o', 'q')) if before is None else before
        self.after = listing() if after is None else after
        self.calls, self.reads = [], []
        self.mutate = None
        self.real_open, self.real_fsync = os.open, os.fsync

    def write(self, path, raw, exclusive=True):
        flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_EXCL if exclusive else os.O_TRUNC)
        fd = self.real_open(path, flags, 0o600)
        try:
            os.write(fd, raw)
        finally:
            os.close(fd)

    def read(self, path):
        path = Path(path)
        self.case.assertTrue(path.is_relative_to(self.base))
        self.case.assertFalse(path.name.endswith('.key'))
        self.reads.append(path)
        fd = self.real_open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
        try:
            before = os.fstat(fd)
            self.case.assertTrue(stat.S_ISREG(before.st_mode))
            self.case.assertEqual(stat.S_IMODE(before.st_mode), 0o600)
            raw = os.read(fd, SERVER.MAX_TOOL_OUTPUT + 1)
            self.case.assertLessEqual(len(raw), SERVER.MAX_TOOL_OUTPUT)
            self.case.assertEqual(os.fstat(fd), before)
            return raw
        finally:
            os.close(fd)

    def __enter__(self):
        self.temp = tempfile.TemporaryDirectory(prefix='native-recovery-synthetic-')
        self.base = Path(self.temp.name)
        self.home = self.base / SERVER.HOME_NAME
        self.home.mkdir(mode=0o700)
        self.private = self.home / 'private-keys-v1.d'
        self.private.mkdir(mode=0o700)
        for fingerprint in (PRIMARY, SUBKEY):
            self.write(self.private / (fingerprint + '.key'), SENTINEL)
        self.write(self.home / 'pubring.kbx', b'SYNTHETIC_PUBLIC_RING')
        self.error_path = self.base / SERVER.ERROR_NAME
        original = {'schema': 'helmut-recipient-v1', 'ok': False,
            'private_material_exported': False, 'phase': 'verify-public',
            'first_error': {'phase': 'verify-public', 'code': 'PUBLIC_IDENTITY_OR_VALIDITY'},
            'primary_fingerprint': PRIMARY, 'subkey_fingerprint': SUBKEY}
        self.original_raw = (json.dumps(original, sort_keys=True) + '\n').encode('ascii')
        self.write(self.error_path, self.original_raw)
        self.write(self.base / SERVER.ATTEMPT_NAME, ATTEMPT_BYTES)
        os.utime(self.base / SERVER.ATTEMPT_NAME, ns=(CREATED * 10**9, CREATED * 10**9))
        os.utime(self.error_path, ns=((CREATED + 2) * 10**9, (CREATED + 2) * 10**9))
        self.fake_pin = hashlib.sha256(self.original_raw).hexdigest()
        self.stack = ExitStack()
        def bind(owner, name, **kwargs):
            return self.stack.enter_context(patch.object(owner, name, **kwargs))
        bind(SERVER, 'TARGET_BASE', new=str(self.base))
        bind(SERVER, 'RECOVERY_ORIGINAL_ERROR_SHA256', new=self.fake_pin)
        bind(SERVER, '_owned', return_value=True)
        bind(SERVER.os, 'geteuid', return_value=0)
        bind(SERVER.os, 'getegid', return_value=0)
        bind(SERVER.time, 'time', return_value=NOW)
        bind(SERVER, '_open_base', side_effect=lambda path: self.real_open(self.base, SERVER._DFLAGS))
        bind(SERVER, '_read_public_file', side_effect=lambda path, limit=65536: self.read(path))
        def no_key_open(path, flags, *args, **kwargs):
            self.case.assertFalse(os.fsdecode(path).endswith('.key'), 'private content open forbidden')
            return self.real_open(path, flags, *args, **kwargs)
        bind(SERVER.os, 'open', side_effect=no_key_open)
        bind(SERVER.subprocess, 'Popen', side_effect=AssertionError('no real process allowed'))
        bind(SERVER.subprocess, 'run', side_effect=AssertionError('no real process allowed'))
        return self

    def __exit__(self, *args):
        self.stack.close()
        self.temp.cleanup()

    def execute(self, path, args, input=None, timeout=None):
        self.case.assertEqual(path, '/usr/bin/env')
        self.case.assertEqual(args[:5], ('-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C', '/usr/bin/gpg', '--no-options'))
        self.case.assertEqual(args[args.index('--homedir') + 1], str(self.home))
        self.case.assertIn('--no-auto-check-trustdb', args)
        self.case.assertIn('--no-auto-key-retrieve', args)
        self.case.assertIn('--no-autostart', args)
        self.case.assertIsNone(input)
        self.case.assertFalse(any(value in args for value in (
            '--quick-generate-key', '--quick-add-key', '--gen-key', '--import',
            '--import-ownertrust', '--edit-key', '--export-secret-keys')))
        self.calls.append(args)
        if self.mutate is not None:
            self.mutate(len(self.calls), args)
        if '--list-keys' in args:
            number = sum('--list-keys' in call for call in self.calls)
            raw = self.before if number == 1 else self.after
        elif '--check-trustdb' in args:
            self.case.assertEqual(args[-2:], ('--no-autostart', '--check-trustdb'))
            self.write(self.home / 'trustdb.gpg', b'SYNTHETIC_LOCAL_TRUST_CACHE')
            raw = b''
        else:
            self.case.assertEqual(args[-4:], ('--armor', '--export', '--', PRIMARY))
            raw = PUBLIC
        return types.SimpleNamespace(returncode=0, stdout=raw, stderr=b'')

    def recover(self):
        result = SERVER.recover_recipient(str(self.base), self.execute)
        self.case.assertNotIn(SENTINEL.decode(), json.dumps(result))
        self.case.assertFalse(any(path.name.endswith('.key') for path in self.reads))
        return result

    def refreshes(self):
        return sum('--check-trustdb' in call for call in self.calls)

    def fail_candidate_fsync(self, fd):
        try:
            pending = (self.base / SERVER.RECOVERY_PENDING_RESULT).stat()
        except FileNotFoundError:
            return self.real_fsync(fd)
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino) == (pending.st_dev, pending.st_ino):
            raise OSError(errno.ENOSPC, 'SYNTHETIC_PENDING_FSYNC_FAILURE')
        return self.real_fsync(fd)


class RecoveryTests(unittest.TestCase):
    def test_original_error_pin_remains_exact_independently_of_synthetic_fixture_pin(self):
        self.assertEqual(ORIGINAL_ERROR_PIN, EXPECTED_ERROR_PIN)

    def test_cached_validities_refresh_once_then_require_full_strict_validity(self):
        with RecoveryHarness(self) as h:
            result = h.recover()
            self.assertTrue(result['ok'], result)
            self.assertEqual(h.refreshes(), 1)
            self.assertEqual(len(h.calls), 4)
            receipt = json.loads(h.read(h.base / SERVER.RECOVERY_RECEIPT))
            self.assertEqual(receipt['before']['validity'], ['-', 'o', 'q'])
            self.assertEqual(receipt['after']['validity'], ['u', 'u', 'u'])
            self.assertTrue(receipt['trust_cache_refreshed'])
            self.assertTrue(receipt['private_key_metadata_unchanged'])
            self.assertEqual(receipt['key_generation_attempts'], 0)
            self.assertEqual(receipt['subkey_add_attempts'], 0)
            self.assertEqual(h.read(h.error_path), h.original_raw)
            self.assertEqual(h.read(h.base / SERVER.PUBLIC_NAME), PUBLIC)
            attempt = json.loads(h.read(h.base / SERVER.RECOVERY_ATTEMPT))
            self.assertEqual(attempt, {'schema': 'helmut-recipient-recovery-attempt-v1',
                                      'original_error_sha256': h.fake_pin})

    def test_already_ultimate_validity_never_refreshes_trust(self):
        with RecoveryHarness(self, before=listing()) as h:
            result = h.recover()
            self.assertTrue(result['ok'], result)
            self.assertEqual(h.refreshes(), 0)
            self.assertEqual(len(h.calls), 3)
            self.assertFalse((h.home / 'trustdb.gpg').exists())

    def test_uid_fingerprint_ownertrust_validity_algorithm_usage_expiry_reject_before_trust_write(self):
        cases = [
            ({(2, 9): 'SYNTHETIC_OTHER_UID'}, 'PUBLIC_IDENTITY_OR_VALIDITY'),
            ({(1, 9): 'C' * 40}, 'PUBLIC_FINGERPRINT_MISMATCH'),
            ({(4, 9): 'C' * 40}, 'PUBLIC_FINGERPRINT_MISMATCH'),
            ({(0, 8): 'q'}, 'PUBLIC_IDENTITY_OR_VALIDITY'),
            ({(0, 1): 'r'}, 'RECOVERY_CACHE_NOT_PROVEN'),
            ({(2, 1): 'e'}, 'RECOVERY_CACHE_NOT_PROVEN'),
            ({(3, 1): 'd'}, 'RECOVERY_CACHE_NOT_PROVEN'),
            ({(0, 2): '256'}, 'PUBLIC_ALGORITHM_MISMATCH'),
            ({(0, 3): '1'}, 'PUBLIC_ALGORITHM_MISMATCH'),
            ({(0, 16): 'cv25519'}, 'PUBLIC_ALGORITHM_MISMATCH'),
            ({(3, 3): '22'}, 'PUBLIC_ALGORITHM_MISMATCH'),
            ({(3, 16): 'ed25519'}, 'PUBLIC_ALGORITHM_MISMATCH'),
            ({(0, 11): 'scEC'}, 'PUBLIC_USAGE_MISMATCH'),
            ({(3, 11): 'se'}, 'PUBLIC_USAGE_MISMATCH'),
            ({(0, 4): 'C' * 16}, 'PUBLIC_USAGE_MISMATCH'),
            ({(0, 6): str(CREATED + 6 * 86400)}, 'PUBLIC_EXPIRY_INVALID'),
            ({(3, 6): str(CREATED)}, 'PUBLIC_EXPIRY_INVALID'),
            ({(0, 5): str(CREATED + 20)}, 'PUBLIC_EXPIRY_INVALID'),
        ]
        for edits, code in cases:
            with self.subTest(fields=list(edits)):
                with RecoveryHarness(self, before=listing(('-', 'o', 'q'), edits)) as h:
                    result = h.recover()
                    self.assertFalse(result['ok'])
                    self.assertEqual(result['first_error']['code'], code)
                    self.assertEqual(h.refreshes(), 0)
                    self.assertEqual(len(h.calls), 1)
                    self.assertFalse((h.base / SERVER.RESULT_NAME).exists())

    def test_refresh_cannot_accept_cached_validity_in_final_full_parser(self):
        with RecoveryHarness(self, after=listing(('q', 'q', 'q'))) as h:
            result = h.recover()
            self.assertFalse(result['ok'])
            self.assertEqual(result['first_error']['code'], 'PUBLIC_IDENTITY_OR_VALIDITY')
            self.assertEqual(h.refreshes(), 1)
            self.assertFalse((h.base / SERVER.RECOVERY_RECEIPT).exists())
            self.assertFalse((h.base / SERVER.RESULT_NAME).exists())

    def test_original_error_hash_mismatch_never_invokes_tool_and_consumes_attempt(self):
        with RecoveryHarness(self) as h:
            with patch.object(SERVER, 'RECOVERY_ORIGINAL_ERROR_SHA256', '0' * 64):
                result = h.recover()
            self.assertFalse(result['ok'])
            self.assertEqual(result['first_error']['code'], 'RECOVERY_ORIGINAL_BINDING')
            self.assertEqual(h.calls, [])
            self.assertTrue((h.base / SERVER.RECOVERY_ATTEMPT).exists())
            again = h.recover()
            self.assertEqual(again['first_error']['code'], 'RECOVERY_ALREADY_ATTEMPTED')
            self.assertEqual(h.calls, [])

    def test_noncanonical_original_attempt_bytes_never_invoke_tool(self):
        with RecoveryHarness(self) as h:
            h.write(h.base / SERVER.ATTEMPT_NAME, ATTEMPT_BYTES + b' ', exclusive=False)
            result = h.recover()
            self.assertFalse(result['ok'])
            self.assertEqual(result['first_error']['code'], 'RECOVERY_ORIGINAL_BINDING')
            self.assertEqual(h.calls, [])

    def test_key_metadata_drift_stops_without_private_content_read(self):
        with RecoveryHarness(self) as h:
            key = h.private / (PRIMARY + '.key')
            before = key.stat()
            h.mutate = lambda count, args: os.utime(key, ns=(before.st_atime_ns + 1, before.st_mtime_ns)) if count == 1 else None
            result = h.recover()
            self.assertFalse(result['ok'])
            self.assertEqual(result['first_error']['code'], 'RECOVERY_KEY_METADATA_CHANGED')
            self.assertEqual(h.refreshes(), 0)

    def test_public_ring_byte_or_metadata_drift_stops(self):
        for mutation in ('bytes', 'metadata'):
            with self.subTest(mutation=mutation):
                with RecoveryHarness(self) as h:
                    path = h.home / 'pubring.kbx'
                    before = path.stat()
                    def mutate(count, args):
                        if count == 1:
                            if mutation == 'bytes':
                                h.write(path, b'SYNTHETIC_DIFFERENT_RING', exclusive=False)
                            else:
                                os.utime(path, ns=(before.st_atime_ns, before.st_mtime_ns + 1))
                    h.mutate = mutate
                    result = h.recover()
                    self.assertFalse(result['ok'])
                    self.assertEqual(result['first_error']['code'], 'RECOVERY_PUBLIC_RING_CHANGED')
                    self.assertEqual(h.refreshes(), 0)

    def test_original_error_or_attempt_change_during_tool_stops(self):
        for name in (SERVER.ERROR_NAME, SERVER.ATTEMPT_NAME):
            with self.subTest(name=name):
                with RecoveryHarness(self) as h:
                    h.mutate = lambda count, args: h.write(h.base / name, b'CHANGED_SYNTHETIC_ORIGINAL', exclusive=False) if count == 1 else None
                    result = h.recover()
                    self.assertFalse(result['ok'])
                    self.assertEqual(result['first_error']['code'], 'RECOVERY_ORIGINAL_BINDING')
                    self.assertEqual(h.refreshes(), 0)

    def test_successful_recovery_has_no_second_entry_or_generation(self):
        with RecoveryHarness(self) as h:
            self.assertTrue(h.recover()['ok'])
            calls_before = list(h.calls)
            receipt_before = h.read(h.base / SERVER.RECOVERY_RECEIPT)
            result = h.recover()
            self.assertFalse(result['ok'])
            self.assertEqual(result['first_error']['code'], 'RECOVERY_ALREADY_ATTEMPTED')
            self.assertEqual(h.calls, calls_before)
            self.assertEqual(h.read(h.base / SERVER.RECOVERY_RECEIPT), receipt_before)

    def test_recovery_tool_diagnostic_uses_own_file_and_restores_old_logger_name(self):
        with RecoveryHarness(self) as h:
            previous = SERVER._TOOL_ERROR_NAME
            def failed_tool(*args, **kwargs):
                self.assertEqual(SERVER._TOOL_ERROR_NAME, 'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json')
                SERVER._first_tool_error([bytearray(), bytearray(b'SYNTHETIC_TOOL_ERROR')], 'EXIT_7')
                raise SERVER._Stop('TOOL_TIMEOUT')
            with patch.object(SERVER, '_bounded_tool', side_effect=failed_tool):
                with self.assertRaises(SERVER._Stop):
                    SERVER._recovery_tool('/usr/bin/env', ('-i',), timeout=1)
            self.assertEqual(SERVER._TOOL_ERROR_NAME, previous)
            self.assertTrue((h.base / 'GPG_RECOVERY_FIRST_TOOL_ERROR.PRIVATE.json').exists())
            self.assertFalse((h.base / 'GPG_FIRST_TOOL_ERROR.PRIVATE.json').exists())
            self.assertEqual(h.read(h.error_path), h.original_raw)

    def test_receipt_write_failure_cannot_publish_ready(self):
        with RecoveryHarness(self) as h:
            original = SERVER._json_new
            def fail_receipt(directory, name, value):
                if name == SERVER.RECOVERY_RECEIPT:
                    raise OSError('SYNTHETIC_RECEIPT_FAILURE')
                return original(directory, name, value)
            with patch.object(SERVER, '_json_new', side_effect=fail_receipt):
                result = h.recover()
            self.assertFalse(result['ok'])
            self.assertTrue((h.base / SERVER.RECOVERY_ERROR).exists())
            self.assertFalse((h.base / SERVER.RESULT_NAME).exists())

    def assert_handle_rejects_pending_or_error(self, h):
        with patch.object(SERVER, '_read_public_file', side_effect=AssertionError('must reject before reading READY')), \
                patch.object(SERVER, 'create_recipient') as create, \
                patch.object(SERVER, 'recover_recipient') as recover:
            with self.assertRaises(SERVER._Stop) as raised:
                SERVER.handle({'operation': 'recipient'}, {'base': str(h.base), 'deadline': None})
            self.assertEqual(raised.exception.code, 'RECIPIENT_NOT_ACCEPTED')
            create.assert_not_called()
            recover.assert_not_called()

    def test_fsync_failure_after_complete_pending_bytes_cannot_publish_ready(self):
        with RecoveryHarness(self) as h:
            with patch.object(SERVER.os, 'fsync', side_effect=h.fail_candidate_fsync):
                result = h.recover()
            self.assertFalse(result['ok'])
            pending = json.loads(h.read(h.base / SERVER.RECOVERY_PENDING_RESULT))
            self.assertTrue(pending['ok'])
            self.assertEqual(pending['phase'], 'complete')
            self.assertFalse((h.base / SERVER.RESULT_NAME).exists())
            self.assertTrue((h.base / SERVER.RECOVERY_ERROR).exists())
            self.assert_handle_rejects_pending_or_error(h)

    def test_candidate_fsync_and_error_creation_both_fail_without_ready_or_reentry(self):
        with RecoveryHarness(self) as h:
            original = SERVER._json_new
            def fail_error(directory, name, value):
                if name == SERVER.RECOVERY_ERROR:
                    raise OSError(errno.ENOSPC, 'SYNTHETIC_ERROR_CREATE_FAILURE')
                return original(directory, name, value)
            with patch.object(SERVER.os, 'fsync', side_effect=h.fail_candidate_fsync), \
                    patch.object(SERVER, '_json_new', side_effect=fail_error):
                result = h.recover()
            self.assertFalse(result['ok'])
            self.assertTrue((h.base / SERVER.RECOVERY_PENDING_RESULT).exists())
            self.assertFalse((h.base / SERVER.RESULT_NAME).exists())
            self.assertFalse((h.base / SERVER.RECOVERY_ERROR).exists())
            self.assert_handle_rejects_pending_or_error(h)
            calls = list(h.calls)
            self.assertEqual(h.recover()['first_error']['code'], 'RECOVERY_ALREADY_ATTEMPTED')
            self.assertEqual(h.calls, calls)

    def test_atomic_publish_moves_exact_synthetic_inode_and_bytes(self):
        with tempfile.TemporaryDirectory(prefix='recovery-atomic-publish-') as name:
            base = Path(name)
            pending, ready = base / SERVER.RECOVERY_PENDING_RESULT, base / SERVER.RESULT_NAME
            raw = b'{"ok":true,"phase":"complete","synthetic":true}\n'
            fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                os.write(fd, raw)
                os.fsync(fd)
                original = os.fstat(fd)
            finally:
                os.close(fd)
            directory = os.open(base, SERVER._DFLAGS)
            try:
                SERVER._publish_recovery_result(directory)
            finally:
                os.close(directory)
            self.assertFalse(pending.exists())
            self.assertEqual(read_noatime(ready), raw)
            self.assertEqual((ready.stat().st_dev, ready.stat().st_ino), (original.st_dev, original.st_ino))
            self.assertEqual(stat.S_IMODE(ready.stat().st_mode), 0o600)

    def test_atomic_publish_never_overwrites_existing_ready(self):
        with tempfile.TemporaryDirectory(prefix='recovery-atomic-no-replace-') as name:
            base = Path(name)
            paths = {SERVER.RECOVERY_PENDING_RESULT: b'SYNTHETIC_PENDING',
                     SERVER.RESULT_NAME: b'SYNTHETIC_EXISTING_READY'}
            before = {}
            for filename, raw in paths.items():
                path = base / filename
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                try:
                    os.write(fd, raw)
                    os.fsync(fd)
                    before[filename] = os.fstat(fd)
                finally:
                    os.close(fd)
            directory = os.open(base, SERVER._DFLAGS)
            try:
                with self.assertRaises(OSError) as raised:
                    SERVER._publish_recovery_result(directory)
            finally:
                os.close(directory)
            self.assertEqual(raised.exception.errno, errno.EEXIST)
            for filename, raw in paths.items():
                path = base / filename
                self.assertEqual(read_noatime(path), raw)
                self.assertEqual(path.stat(), before[filename])

    def test_handle_requires_recovered_receipt_hash_original_pin_and_public_hash(self):
        for changed_field in ('recovery_receipt_sha256', 'recovered_from_error_sha256',
                              'original_error_sha256', 'public_sha256'):
            with self.subTest(field=changed_field):
                with RecoveryHarness(self) as h:
                    self.assertTrue(h.recover()['ok'])
                    ready_path = h.base / SERVER.RESULT_NAME
                    ready = json.loads(h.read(ready_path))
                    if changed_field in ('recovery_receipt_sha256', 'recovered_from_error_sha256'):
                        ready[changed_field] = '0' * 64
                    else:
                        receipt_path = h.base / SERVER.RECOVERY_RECEIPT
                        receipt = json.loads(h.read(receipt_path))
                        receipt[changed_field] = '0' * 64
                        raw = (json.dumps(receipt, sort_keys=True) + '\n').encode('ascii')
                        h.write(receipt_path, raw, exclusive=False)
                        ready['recovery_receipt_sha256'] = hashlib.sha256(raw).hexdigest()
                    h.write(ready_path, (json.dumps(ready) + '\n').encode('ascii'), exclusive=False)
                    calls = list(h.calls)
                    with self.assertRaises(SERVER._Stop) as raised:
                        SERVER.handle({'operation': 'recipient'}, {'base': str(h.base), 'deadline': None})
                    self.assertEqual(raised.exception.code, 'RECOVERY_ORIGINAL_BINDING')
                    self.assertEqual(h.calls, calls)


def public_summary():
    return {'original_error_sha256': EXPECTED_ERROR_PIN, 'receipt_sha256': '1' * 64,
        'before_validity': ['-', 'o', 'q'], 'after_validity': ['u', 'u', 'u'],
        'ownertrust': 'u', 'identity_matches': True, 'trust_cache_refreshed': True,
        'private_key_metadata_unchanged': True, 'pubring_sha256': '2' * 64,
        'public_sha256': hashlib.sha256(PUBLIC).hexdigest(),
        'key_generation_attempts': 0, 'subkey_add_attempts': 0}


class RecoverySummaryTests(unittest.TestCase):
    def test_exact_public_summary_accepts_refreshed_or_already_ultimate_cache(self):
        summary = public_summary()
        CLIENT.validate_recovery_receipt(summary, summary['public_sha256'])
        summary.update(before_validity=['u', 'u', 'u'], trust_cache_refreshed=False)
        CLIENT.validate_recovery_receipt(summary, summary['public_sha256'])

    def test_public_summary_rejects_secret_fields_pin_drift_invalid_validity_and_generation(self):
        baseline = public_summary()
        for field, value in (
                ('private_key', SENTINEL.decode()), ('original_error_sha256', '0' * 64),
                ('receipt_sha256', 'A' * 64), ('public_sha256', '0' * 64),
                ('before_validity', ['r', 'u', 'u']), ('after_validity', ['q', 'u', 'u']),
                ('ownertrust', 'q'), ('identity_matches', False), ('identity_matches', 1),
                ('private_key_metadata_unchanged', False), ('trust_cache_refreshed', False),
                ('trust_cache_refreshed', 1), ('key_generation_attempts', 1),
                ('subkey_add_attempts', True)):
            changed = copy.deepcopy(baseline)
            changed[field] = value
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    CLIENT.validate_recovery_receipt(changed, baseline['public_sha256'])
