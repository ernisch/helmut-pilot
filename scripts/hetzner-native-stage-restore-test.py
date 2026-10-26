"""Small synthetic byte-restore cases; no original data, keys or target access."""
import ast
import contextlib
import copy
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import struct
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

HELPER = Path(__file__).with_name('hetzner-native-stage-restore.py')
fd = os.open(HELPER, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
with os.fdopen(fd, 'rb') as source:
    SOURCE = source.read()


def module():
    result = types.ModuleType('synthetic_bound_restore')
    exec(compile(SOURCE, str(HELPER), 'exec'), result.__dict__)
    return result


class BoundRestoreTests(unittest.TestCase):
    def setUp(self):
        self.m = module()
        self.temp = tempfile.TemporaryDirectory(prefix='.synthetic-restore-', dir=Path.cwd())
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.uid, self.gid = os.getuid(), os.getgid()
        self.py = '/opt/codex/runtimes/codex-primary-runtime/dependencies/python'
        self.path = self.py + '/lib/data.bin'
        self.payload = b'bound synthetic bytes\x00\xff\n'
        self.scope = {
            'schema': 'helmut-encrypted-transport-scope-v4',
            'regularFileCount': 1, 'regularLogicalBytes': len(self.payload),
            'items': [{'path': self.path, 'archiveMember': 'files' + self.path,
                'bytes': len(self.payload), 'sha256': hashlib.sha256(self.payload).hexdigest(),
                'mode': '0o644', 'uid': self.uid, 'gid': self.gid}],
            'pythonDirectoriesAndLinks': [
                {'path': self.py + '/lib', 'type': 'directory', 'statBefore': {
                    'st_mode': stat.S_IFDIR | 0o755, 'st_uid': self.uid, 'st_gid': self.gid}},
                {'path': self.py + '/lib/data.link', 'type': 'symlink', 'target': 'data.bin',
                 'statBefore': {'st_mode': stat.S_IFLNK | 0o777, 'st_uid': self.uid, 'st_gid': self.gid}}],
        }
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(self.m, '_sr_admin', return_value=None))
        self.stack.enter_context(patch.object(self.m, '_sr_owned', return_value=True))
        def metadata(descriptor, uid, gid, mode):
            self.assertEqual((uid, gid), (self.uid, self.gid))
            os.fchmod(descriptor, mode)
        self.stack.enter_context(patch.object(self.m, '_sr_metadata', side_effect=metadata))
        self.stack.enter_context(patch.object(self.m, '_sr_link_metadata', return_value=None))

    def entries(self, scope=None):
        scope = scope or self.scope
        entries = []
        for row in scope['items']:
            entries.append(({'name': row['archiveMember'], 'type': tarfile.REGTYPE,
                'mode': int(row['mode'], 8), 'uid': row['uid'], 'gid': row['gid']}, self.payload))
        for row in scope['pythonDirectoriesAndLinks']:
            info = row['statBefore']
            entries.append(({'name': 'files' + row['path'],
                'type': tarfile.DIRTYPE if row['type'] == 'directory' else tarfile.SYMTYPE,
                'mode': stat.S_IMODE(info['st_mode']), 'uid': info['st_uid'], 'gid': info['st_gid'],
                'linkname': row.get('target', '')}, b''))
        return entries

    def archive(self, scope=None, entries=None, prefix_entries=(), tar_tail=b'', compressed_tail=b''):
        scope = scope or self.scope
        raw_scope = json.dumps(scope, sort_keys=True, separators=(',', ':')).encode()
        self.m._SR_SCOPE_SHA256 = hashlib.sha256(raw_scope).hexdigest()
        entries = self.entries(scope) if entries is None else entries
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as writer:
            all_entries = [*prefix_entries, ({'name': 'SOURCE_SCOPE.PRIVATE.json',
                'type': tarfile.REGTYPE, 'mode': 0o600, 'uid': self.uid, 'gid': self.gid}, raw_scope), *entries]
            for fields, payload in all_entries:
                info = tarfile.TarInfo(fields['name'])
                for key, value in fields.items():
                    setattr(info, key, value)
                info.size = len(payload)
                info.mtime = 1788486253
                writer.addfile(info, io.BytesIO(payload))
        path = self.base / 'input.tar.gz'
        path.write_bytes(gzip.compress(output.getvalue() + tar_tail) + compressed_tail)
        path.chmod(0o600)
        return path

    def restore(self, source=None, out=None):
        return self.m.restore_bound_archive(str(source or self.archive()), str(out or self.base / 'restored'))

    def test_success_actual_bytes_hash_modes_and_private_root(self):
        source = self.archive()
        before = source.stat()
        old = os.umask(0o077)
        try:
            result = self.restore(source)
        finally:
            os.umask(old)
        self.assertTrue(result['ok'], result)
        self.assertEqual(source.stat(), before)
        root = self.base / 'restored'
        self.assertEqual(stat.S_IMODE(root.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((root / 'files').stat().st_mode), 0o755)
        target = root / ('files' + self.path)
        self.assertEqual(target.read_bytes(), self.payload)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)
        self.assertEqual(os.readlink(target.with_name('data.link')), 'data.bin')
        self.assertEqual(result['actual_file_count'], 1)
        self.assertEqual(result['actual_bytes'], len(self.payload))
        self.assertEqual(result['actual_files'][0]['sha256'], hashlib.sha256(self.payload).hexdigest())
        self.assertEqual(result['unverified_entries'], [])
        self.assertEqual(result['metadata_state'], 'VERIFIED')
        self.assertFalse(result['native_qualified'])
        self.assertTrue((root / 'RESTORE_RECEIPT.PRIVATE.json').is_file())
        self.assertEqual(result['receipt_sha256'], hashlib.sha256(
            (root / 'RESTORE_RECEIPT.PRIVATE.json').read_bytes()).hexdigest())
        self.assertFalse((root / 'RESTORE_RECEIPT.PENDING.PRIVATE.json').exists())

    def test_regular_long_path_and_local_pax_mtime(self):
        scope = copy.deepcopy(self.scope)
        path = self.py + '/lib/' + 'segment-' * 16 + '/data.bin'
        scope['items'][0].update(path=path, archiveMember='files' + path)
        scope['pythonDirectoriesAndLinks'] = scope['pythonDirectoriesAndLinks'][:1]
        entries = self.entries(scope)
        entries[0][0]['pax_headers'] = {'mtime': '1788486253.123456789'}
        result = self.restore(self.archive(scope, entries))
        self.assertTrue(result['ok'], result)
        target = self.base / 'restored' / ('files' + path)
        self.assertEqual(target.stat().st_mtime_ns, 1788486253123456789)
        self.assertEqual(result['actual_files'][0]['mtime_ns'], 1788486253123456789)

    def test_stdlib_pax_long_directory_terminal_slash_restores_metadata_and_bytes(self):
        scope = copy.deepcopy(self.scope)
        directory = self.py + '/lib/python3.12/asyncio/__pycache__'
        scope['items'][0].update(path=directory+'/synthetic.bin',archiveMember='files'+directory+'/synthetic.bin')
        scope['pythonDirectoriesAndLinks'] = scope['pythonDirectoriesAndLinks'][:1]
        scope['pythonDirectoriesAndLinks'][0]['path'] = directory
        entries = self.entries(scope)
        source = self.archive(scope,[entries[1],entries[0]])
        self.assertGreater(len(('files'+directory+'/').encode()),100)
        self.assertIn((' path=files'+directory+'/\n').encode(),gzip.decompress(source.read_bytes()))
        result = self.restore(source)
        self.assertTrue(result['ok'],result)
        self.assertEqual(result['metadata_state'],'VERIFIED')
        self.assertEqual((self.base/'restored'/('files'+directory+'/synthetic.bin')).read_bytes(),self.payload)

    def test_pax_regular_file_terminal_slash_is_never_authorized(self):
        entries = self.entries()
        entries[0][0]['pax_headers'] = {'path':entries[0][0]['name']+'/'}
        result = self.restore(self.archive(entries=entries))
        self.assertEqual(result.get('code'),'PATH_ESCAPE');self.assertFalse(result['ok'])

    def test_pax_symlink_terminal_slash_is_never_authorized(self):
        entries = self.entries()
        entries[2][0]['pax_headers'] = {'path':entries[2][0]['name']+'/'}
        result = self.restore(self.archive(entries=entries))
        self.assertEqual(result.get('code'),'PATH_ESCAPE');self.assertFalse(result['ok'])

    def test_directory_pax_never_normalizes_absolute_parent_or_duplicate_slashes(self):
        for index,path in enumerate(('/files/absolute/','files/../../escape/','files//intermediate/',
                                     'files/valid//','files/./dot/')):
            entries = self.entries();entries[1][0]['pax_headers'] = {'path':path}
            result = self.restore(self.archive(entries=entries),self.base/('bad-dir-pax-'+str(index)))
            self.assertEqual(result.get('code'),'PATH_ESCAPE');self.assertFalse(result['ok'])

    def test_plain_directory_header_double_terminal_slash_is_rejected(self):
        entries = self.entries();entries[1][0]['name'] += '//'
        result = self.restore(self.archive(entries=entries))
        self.assertEqual(result.get('code'),'PATH_ESCAPE');self.assertFalse(result['ok'])

    def test_restored_python_source_matches_preserved_timestamp_pyc_header(self):
        scope = copy.deepcopy(self.scope)
        py_path = self.py + '/lib/synthetic.py'
        pyc_path = self.py + '/lib/__pycache__/synthetic.cpython-312.pyc'
        seconds = 1788486253
        # A timestamp-based CPython header is inspected only; no bytecode executes.
        pyc = b'FAKE' + struct.pack('<III', 0, seconds, len(self.payload)) + b'NOT_EXECUTABLE'
        scope['items'][0].update(path=py_path, archiveMember='files' + py_path)
        cached = copy.deepcopy(scope['items'][0])
        cached.update(path=pyc_path, archiveMember='files' + pyc_path,
                      bytes=len(pyc), sha256=hashlib.sha256(pyc).hexdigest())
        scope['items'].append(cached)
        scope.update(regularFileCount=2, regularLogicalBytes=len(self.payload) + len(pyc))
        scope['pythonDirectoriesAndLinks'] = scope['pythonDirectoriesAndLinks'][:1]
        entries = self.entries(scope)
        entries[0][0]['pax_headers'] = {'mtime': str(seconds) + '.987654321'}
        entries[1] = (entries[1][0], pyc)
        result = self.restore(self.archive(scope, entries))
        self.assertTrue(result['ok'], result)
        root = self.base / 'restored'
        source = root / ('files' + py_path)
        cached_bytes = (root / ('files' + pyc_path)).read_bytes()
        expected_seconds, expected_size = struct.unpack('<II', cached_bytes[8:16])
        self.assertEqual(source.stat().st_mtime_ns // 10**9, expected_seconds)
        self.assertEqual(source.stat().st_size, expected_size)
        self.assertEqual(source.stat().st_mtime_ns, seconds * 10**9 + 987654321)

    def test_directories_final_after_children_and_symlink_time_is_nofollow(self):
        scope = copy.deepcopy(self.scope)
        directory_ns, link_ns = 1788486253123456789, 1788486254111111111
        scope['pythonDirectoriesAndLinks'][0]['statBefore']['st_mtime_ns'] = directory_ns
        scope['pythonDirectoriesAndLinks'][1]['statBefore']['st_mtime_ns'] = link_ns
        entries = self.entries(scope)
        entries[1][0]['pax_headers'] = {'mtime': '1788486253.123456789'}
        entries[2][0]['pax_headers'] = {'mtime': '1788486254.111111111'}
        entries = [entries[1], entries[2], entries[0]]  # Writer emits metadata first.
        source = self.archive(scope, entries)
        before = source.stat()
        result = self.restore(source)
        self.assertTrue(result['ok'], result)
        root = self.base / 'restored' / ('files' + self.py)
        self.assertEqual((root / 'lib').stat().st_mtime_ns, directory_ns)
        self.assertEqual((root / 'lib/data.link').lstat().st_mtime_ns, link_ns)
        self.assertEqual((root / 'lib/data.bin').stat().st_mtime_ns, 1788486253 * 10**9)
        self.assertEqual(source.stat(), before)

    def test_mtime_precision_and_range_are_bounded_without_float_rounding(self):
        self.assertEqual(self.m._sr_mtime('-0.000000001'), -1)
        self.assertEqual(self.m._sr_mtime('1788486253.123456789'), 1788486253123456789)
        for value in ('nan', '1e9', '1.1234567890', '999999999999'):
            with self.assertRaises(self.m._SRStop):
                self.m._sr_mtime(value)

    def test_wrong_scope_hash_precedes_output_creation(self):
        source = self.archive()
        self.m._SR_SCOPE_SHA256 = '0' * 64
        result = self.restore(source)
        self.assertEqual(result.get('code'), 'SCOPE_HASH')
        self.assertFalse((self.base / 'restored').exists())

    def test_scope_must_be_first_logical_entry(self):
        source = self.archive(prefix_entries=[({'name': 'unexpected', 'type': tarfile.REGTYPE}, b'x')])
        self.assertEqual(self.restore(source).get('code'), 'SCOPE_FIRST')
        self.assertFalse((self.base / 'restored').exists())

    def test_duplicate_retains_first_file_without_overwrite(self):
        entries = self.entries()
        entries.append(entries[0])
        result = self.restore(self.archive(entries=entries))
        self.assertEqual(result.get('code'), 'TAR_EXTRA_OR_DUPLICATE')
        self.assertEqual((self.base / 'restored' / ('files' + self.path)).read_bytes(), self.payload)

    def test_extra_file_is_rejected(self):
        entries = self.entries() + [({'name': 'files/extra', 'type': tarfile.REGTYPE}, b'not-selected')]
        self.assertEqual(self.restore(self.archive(entries=entries)).get('code'), 'TAR_EXTRA_OR_DUPLICATE')

    def test_missing_entries_never_create_deferred_symlink(self):
        result = self.restore(self.archive(entries=self.entries()[:1]))
        self.assertEqual(result.get('code'), 'TAR_MISSING_ENTRIES')
        self.assertEqual(len(result['unverified_entries']), 2)
        self.assertFalse((self.base / 'restored' / ('files' + self.py) / 'lib/data.link').exists())

    def test_hash_mismatch_keeps_unknown_partial(self):
        entries = self.entries()
        entries[0] = (entries[0][0], b'X' * len(self.payload))
        result = self.restore(self.archive(entries=entries))
        self.assertEqual(result.get('code'), 'FILE_HASH')
        self.assertEqual(result['partial_file_state'], 'UNKNOWN')
        self.assertEqual(result['actual_file_count'], 0)
        self.assertTrue((self.base / 'restored' / ('files' + self.path)).is_file())

    def test_actual_written_bytes_are_independently_read_back(self):
        real = self.m._sr_write
        def write(descriptor, data):
            return real(descriptor, b'X' * len(data) if data == self.payload else data)
        with patch.object(self.m, '_sr_write', side_effect=write):
            result = self.restore()
        self.assertEqual(result.get('code'), 'RESTORED_FILE_HASH')
        self.assertEqual(result['actual_file_count'], 0)
        self.assertEqual(result['partial_file_state'], 'UNKNOWN')

    def test_size_mode_uid_gid_must_exactly_match(self):
        for field, value in (('mode', 0o777), ('uid', self.uid + 1), ('gid', self.gid + 1), ('size', 1)):
            with self.subTest(field=field):
                entries = self.entries()
                if field == 'size':
                    entries[0] = (entries[0][0], b'x')
                else:
                    entries[0][0][field] = value
                source = self.archive(entries=entries)
                result = self.restore(source, self.base / ('out-' + field))
                self.assertEqual(result.get('code'), 'TAR_METADATA')

    def test_archive_absolute_parent_and_control_paths_rejected(self):
        for index, name in enumerate(('/escape', '../escape', 'files/../escape', 'files/a\nb')):
            with self.subTest(name=name):
                entries = self.entries()
                entries[0][0]['name'] = name
                result = self.restore(self.archive(entries=entries), self.base / ('badpath-' + str(index)))
                self.assertFalse(result['ok'])
                self.assertIn(result.get('code'), ('PATH_ESCAPE', 'PATH_FORMAT'))
        self.assertFalse((self.base / 'escape').exists())

    def test_scope_path_escape_rejected_before_output(self):
        scope = copy.deepcopy(self.scope)
        scope['items'][0]['path'] = '/workspace/../escape'
        self.assertFalse(self.restore(self.archive(scope=scope))['ok'])
        self.assertFalse((self.base / 'restored').exists())

    def test_hardlinks_devices_sparse_and_gnu_types_rejected(self):
        for index, kind in enumerate((tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE,
                                     tarfile.FIFOTYPE, tarfile.GNUTYPE_SPARSE, tarfile.GNUTYPE_LONGNAME)):
            entries = self.entries()
            fields = dict(entries[0][0], type=kind)
            entries[0] = (fields, b'')
            with self.subTest(kind=kind):
                result = self.restore(self.archive(entries=entries), self.base / ('badtype-' + str(index)))
                self.assertEqual(result.get('code'), 'TAR_ENTRY_TYPE')

    def test_pax_unknown_sparse_and_escape_keys_rejected(self):
        for index, headers in enumerate(({'GNU.sparse.realsize': '123'}, {'uid': '0'}, {'path': '../escape'})):
            entries = self.entries()
            entries[0][0]['pax_headers'] = headers
            with self.subTest(headers=headers):
                result = self.restore(self.archive(entries=entries), self.base / ('badpax-' + str(index)))
                self.assertIn(result.get('code'), ('PAX_KEY', 'PATH_ESCAPE'))

    def test_pax_duplicate_and_bad_length_rejected(self):
        def record(key, value):
            body = (key + '=' + value + '\n').encode()
            length = len(body) + 2
            while len(str(length)) + 1 + len(body) != length:
                length = len(str(length)) + 1 + len(body)
            return str(length).encode() + b' ' + body
        for raw in (record('path', 'files/x') * 2, b'999 path=x\n', b'0 path=x\n'):
            with self.assertRaises(self.m._SRStop):
                self.m._sr_pax(raw)

    def test_pax_header_limit_checked_before_payload(self):
        source = self.archive(prefix_entries=[({'name': '././@PaxHeader',
            'type': tarfile.XHDTYPE}, b'x' * 65537)])
        self.assertEqual(self.restore(source).get('code'), 'PAX_LIMIT')
        self.assertFalse((self.base / 'restored').exists())

    def test_global_pax_rejected(self):
        source = self.archive(prefix_entries=[({'name': '././@PaxHeader',
            'type': tarfile.XGLTYPE}, b'x')])
        self.assertEqual(self.restore(source).get('code'), 'TAR_ENTRY_TYPE')

    def test_truncated_gzip_trailer_rejected(self):
        source = self.archive()
        source.write_bytes(source.read_bytes()[:-6])
        result = self.restore(source)
        self.assertEqual(result.get('code'), 'GZIP_TRUNCATED')
        self.assertFalse(result['ok'])

    def test_second_gzip_member_and_trailing_compressed_bytes_rejected(self):
        for index, extra in enumerate((gzip.compress(b'another archive'), b'trailing')):
            result = self.restore(self.archive(compressed_tail=extra), self.base / ('gzip-extra-' + str(index)))
            self.assertEqual(result.get('code'), 'GZIP_TRAILING_BYTES')

    def test_trailing_tar_nonzero_and_extra_zero_bytes_rejected(self):
        for index, extra in enumerate((b'not-an-entry', b'\0', b'\0' * 10240)):
            result = self.restore(self.archive(tar_tail=extra), self.base / ('tar-extra-' + str(index)))
            self.assertEqual(result.get('code'), 'TAR_TRAILING_BYTES')

    def test_symlink_targets_must_be_relative_selected_regular(self):
        for index, target in enumerate(('/etc/passwd', '../outside', 'not-selected')):
            scope = copy.deepcopy(self.scope)
            scope['pythonDirectoriesAndLinks'][1]['target'] = target
            result = self.restore(self.archive(scope), self.base / ('badlink-' + str(index)))
            self.assertFalse(result['ok'])
            self.assertFalse((self.base / ('badlink-' + str(index))).exists())

    def test_links_are_created_only_after_all_regular_bytes_exist(self):
        real = os.symlink
        def create(target, name, **kwargs):
            self.assertEqual((self.base / 'restored' / ('files' + self.path)).read_bytes(), self.payload)
            return real(target, name, **kwargs)
        with patch.object(self.m._sr_os, 'symlink', side_effect=create) as call:
            self.assertTrue(self.restore()['ok'])
            self.assertEqual(call.call_count, 1)

    def test_existing_destination_is_never_reused_or_overwritten(self):
        source = self.archive()
        self.assertTrue(self.restore(source)['ok'])
        target = self.base / 'restored' / ('files' + self.path)
        before = target.stat()
        second = self.restore(source)
        self.assertFalse(second['ok'])
        self.assertEqual(target.stat(), before)
        self.assertEqual(target.read_bytes(), self.payload)

    def test_input_hardlink_or_symlink_rejected(self):
        source = self.archive()
        hardlink = self.base / 'hardlink'
        os.link(source, hardlink)
        self.assertEqual(self.restore(source).get('code'), 'INPUT_IDENTITY')
        hardlink.unlink()
        symlink = self.base / 'symlink'
        symlink.symlink_to(source.name)
        self.assertFalse(self.restore(symlink)['ok'])
        self.assertFalse((self.base / 'restored').exists())

    def test_fifo_input_is_rejected_before_opening(self):
        path = self.base / 'fifo'
        os.mkfifo(path, 0o600)
        real = os.open
        def opening(name, flags, *args, **kwargs):
            self.assertNotEqual(name, 'fifo')
            return real(name, flags, *args, **kwargs)
        with patch.object(self.m._sr_os, 'open', side_effect=opening):
            self.assertEqual(self.restore(path).get('code'), 'INPUT_IDENTITY')

    def test_pending_receipt_failure_never_publishes_success(self):
        real = self.m._sr_new
        def write(root, name, data):
            real(root, name, data)
            if name == 'RESTORE_RECEIPT.PENDING.PRIVATE.json':
                raise OSError('synthetic fsync failure')
        with patch.object(self.m, '_sr_new', side_effect=write):
            result = self.restore()
        self.assertFalse(result['ok'])
        self.assertFalse(result['receipt_saved'])
        self.assertTrue((self.base / 'restored' / 'RESTORE_RECEIPT.PENDING.PRIVATE.json').is_file())
        self.assertFalse((self.base / 'restored' / 'RESTORE_RECEIPT.PRIVATE.json').exists())

    def test_cli_default_is_off_before_function_call(self):
        guard = ast.parse(SOURCE).body[-1]
        called = unittest.mock.Mock(side_effect=AssertionError('must not restore'))
        env = {'__name__': '__main__', '_sr_sys': types.SimpleNamespace(argv=['helper']),
               'restore_bound_archive': called}
        with contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(SystemExit) as result:
                exec(compile(ast.Module(body=[guard], type_ignores=[]), str(HELPER), 'exec'), env)
        self.assertEqual(result.exception.code, 2)
        called.assert_not_called()
        self.assertIn('NOT_EXECUTED', output.getvalue())

    def test_parent_identity_failure_closes_both_pinned_descriptors(self):
        with patch.object(self.m._sr_os, 'open', side_effect=[11, 12]), \
                patch.object(self.m._sr_os, 'fstat', side_effect=[
                    types.SimpleNamespace(identity=1), types.SimpleNamespace(identity=2)]), \
                patch.object(self.m._sr_os, 'close') as closing:
            with self.assertRaisesRegex(self.m._SRStop, '^PARENT_CHANGED$'):
                self.m._sr_parent('/leaf')
        self.assertCountEqual([call.args[0] for call in closing.call_args_list], [11, 12])


if __name__ == '__main__':
    unittest.main(verbosity=2)
