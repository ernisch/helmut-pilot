#!/usr/bin/env python3
"""Local synthetic source-bundle tests; no actual scope, key or GPG is consumed."""
from contextlib import ExitStack, redirect_stdout
from decimal import Decimal
import base64
import copy
import errno
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).with_name('hetzner-native-source-bundle.py')
fd = os.open(PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
with os.fdopen(fd, 'rb') as stream:
    SOURCE = stream.read()
m = types.ModuleType('synthetic_source_bundle_under_test')
m.__file__ = str(PATH)
exec(compile(SOURCE, str(PATH), 'exec'), m.__dict__)
SECRET = 'SYNTHETIC_PRIVATE_ERROR_NOT_FOR_STDOUT'
FP = 'A' * 40


class FakeEncryptor:
    """Echo the small compressed synthetic stream to exercise the real splitter."""
    def __init__(self, sink, output, fingerprint, public):
        self.sink, self.finished, self.aborted = sink, False, False

    def write(self, raw):
        return self.sink.write(raw)

    def finish(self):
        self.finished = True

    def close_failed(self):
        self.aborted = True


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='source-bundle-synthetic-')
        self.base = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.sources = self.base / 'sources'
        self.sources.mkdir(mode=0o700)
        self.python = self.base / 'python'
        (self.python / 'lib').mkdir(parents=True, mode=0o700)
        self.paths = [self.sources / ('long-' + 'x' * 140), self.python / 'lib/public.dat']
        self.contents = [b'SYNTHETIC_FIRST_PAYLOAD\n', b'SYNTHETIC_STDLIB_PAYLOAD\n']
        for index, (path, raw) in enumerate(zip(self.paths, self.contents)):
            self.write(path, raw)
            os.utime(path, ns=(path.stat().st_atime_ns, 1792970000123456789 + index))
        self.scope = {'schema': 'helmut-encrypted-transport-scope-v4',
            'regularFileCount': 2, 'regularLogicalBytes': sum(map(len, self.contents)),
            'pythonDirectoriesAndLinks': [], 'items': []}
        for index, (path, raw) in enumerate(zip(self.paths, self.contents)):
            s = path.stat()
            self.scope['items'].append({'path': str(path), 'archiveMember': 'files' + str(path),
                'bytes': len(raw), 'sha256': m.digest(raw), 'mode': oct(stat.S_IMODE(s.st_mode)),
                'uid': s.st_uid, 'gid': s.st_gid, 'roles':
                ['original-Python-runtime-no-site-packages'] if index else ['host-original-input']})
        self.scope_path = self.base / 'SYNTHETIC_SCOPE.PRIVATE.json'
        self.output = self.base / 'encrypted-output'
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m, 'REGULAR_COUNT', 2))
        self.stack.enter_context(patch.object(m, 'REGULAR_BYTES', self.scope['regularLogicalBytes']))
        self.stack.enter_context(patch.object(m, 'PYTHON_METADATA_COUNT', 0))
        self.stack.enter_context(patch.object(m, 'PYTHON_LINK_COUNT', 0))
        self.stack.enter_context(patch.object(m, 'PYTHON_ROOT', str(self.python)))
        self.stack.enter_context(patch.object(m, 'DISK_RESERVE_BYTES', 0))
        self.stack.enter_context(patch.object(m.subprocess, 'Popen', side_effect=AssertionError('no real process')))
        self.stack.enter_context(patch.object(m.subprocess, 'run', side_effect=AssertionError('no real process')))
        self.pin_scope()

    def write(self, path, raw, exclusive=True):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_EXCL if exclusive else os.O_TRUNC), 0o600)
        try:
            os.write(fd, raw)
        finally:
            os.close(fd)

    def read(self, path):
        return m.read_noatime(str(path), 8 * 1024**2)

    def pin_scope(self):
        self.raw = json.dumps(self.scope, sort_keys=True, separators=(',', ':')).encode('ascii')
        self.write(self.scope_path, self.raw, exclusive=not self.scope_path.exists())
        self.stack.enter_context(patch.object(m, 'SCOPE_SHA256', m.digest(self.raw)))

    def bundle(self, factory=FakeEncryptor):
        return m.build_bundle(str(self.scope_path), str(self.output), 'synthetic-response', '1' * 64,
            'synthetic-public-key', encryptor_factory=factory,
            recipient_validator=lambda *args: (FP, b'SYNTHETIC_PUBLIC_ONLY'))

    def ciphertext(self, result):
        return b''.join(self.read(self.output / row['name']) for row in result['parts'])

    def test_default_invocation_is_noop_before_control_or_source_file_access(self):
        with patch.object(m, 'fresh_output', side_effect=AssertionError('must not open output')), \
                patch.object(m, 'read_noatime', side_effect=AssertionError('must not read input')), \
                redirect_stdout(io.StringIO()) as output:
            self.assertEqual(m.main([]), 2)
        self.assertIn('NOT_EXECUTED', output.getvalue())

    def test_exact_first_scope_member_only_whitelisted_sources_and_canonical_tar_metadata(self):
        self.write(self.sources / 'UNSELECTED_PRIVATE_KEY', b'SYNTHETIC_UNSELECTED')
        result = self.bundle()
        compressed = self.ciphertext(result)
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(compressed)), mode='r:') as archive:
            members = archive.getmembers()
            self.assertEqual([row.name for row in members],
                             ['SOURCE_SCOPE.PRIVATE.json', *[row['archiveMember'] for row in self.scope['items']]])
            self.assertEqual(archive.extractfile(members[0]).read(), self.raw)
            for row, expected, source in zip(members[1:], self.contents, self.paths):
                self.assertEqual(archive.extractfile(row).read(), expected)
                self.assertEqual(int(Decimal(row.pax_headers['mtime']) * 1000000000), source.stat().st_mtime_ns)
                self.assertLessEqual(len(row.pax_headers['mtime'].partition('.')[2]), 9)
                self.assertEqual(set(row.pax_headers) - {'path'}, {'mtime'})
                self.assertEqual((row.uname, row.gname), ('', ''))
                self.assertEqual(row.mode, 0o600)
                self.assertEqual((row.uid, row.gid), (os.getuid(), os.getgid()))
        self.assertEqual(result['matchedRegularFiles'], 2)
        self.assertEqual(result['matchedRegularBytes'], sum(map(len, self.contents)))
        self.assertEqual(result['compressedTarSHA256'], m.digest(compressed))
        self.assertEqual(result['cipherSHA256'], m.digest(compressed))
        self.assertEqual(result['compressedTarBytes'], len(compressed))
        self.assertEqual(result['scope_sha256'], m.digest(self.raw))
        self.assertFalse(result['transferPerformed'])
        self.assertTrue((self.output / 'BUNDLE_RESULT.SAFE.json').exists())
        self.assertFalse((self.output / 'BUNDLE_RESULT.PENDING.SAFE.json').exists())
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        self.assertTrue(all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in self.output.iterdir()))

    def test_part_boundaries_hash_every_part_whole_and_reject_excess(self):
        directory = m.fresh_output(str(self.output))
        try:
            with patch.object(m, 'PART_BYTES', 8), patch.object(m, 'MAX_CIPHER_BYTES', 16):
                parts = m.Parts(directory)
                parts.write(b'0123456789ABCDEF')
                with self.assertRaisesRegex(m.Stop, '^CIPHER_TOTAL_BOUND$'):
                    parts.write(b'X')
                parts.close()
            self.assertEqual([row['bytes'] for row in parts.parts], [8, 8])
            self.assertEqual([row['sha256'] for row in parts.parts], [m.digest(b'01234567'), m.digest(b'89ABCDEF')])
            self.assertEqual(parts.total, 16)
            self.assertEqual(parts.whole.hexdigest(), m.digest(b'0123456789ABCDEF'))
        finally:
            os.close(directory)

    def test_eight_gibibyte_reserve_is_checked_before_each_cipher_write(self):
        directory = m.fresh_output(str(self.output))
        reserve = 8 * 1024**3
        try:
            parts = m.Parts(directory)
            with patch.object(m, 'DISK_RESERVE_BYTES', reserve), \
                    patch.object(m.os, 'fstatvfs', side_effect=[
                        types.SimpleNamespace(f_bavail=reserve + 4, f_frsize=1),
                        types.SimpleNamespace(f_bavail=reserve, f_frsize=1)]), \
                    patch.object(m.os, 'write', wraps=os.write) as writing:
                parts.write(b'ABCD')
                with self.assertRaisesRegex(m.Stop, '^OUTPUT_DISK_RESERVE$'):
                    parts.write(b'X')
                self.assertEqual(writing.call_count, 1)
            parts.close()
            self.assertEqual(parts.total, 4)
            self.assertEqual(self.read(self.output / parts.parts[0]['name']), b'ABCD')
        finally:
            os.close(directory)

    def test_scope_pin_failure_precedes_any_source_or_recipient_use(self):
        self.write(self.scope_path, self.raw + b' ', exclusive=False)
        with patch.object(m, 'open_regular', side_effect=AssertionError('no source read')):
            with self.assertRaisesRegex(m.Stop, '^SCOPE_SHA256$'):
                self.bundle()
        error = json.loads(self.read(self.output / 'BUNDLE_FIRST_ERROR.PRIVATE.json'))
        self.assertEqual(error['stage'], 'scope')

    def test_rejects_duplicate_traversal_operator_paths_and_count_or_byte_drift(self):
        changes = []
        duplicate = copy.deepcopy(self.scope)
        duplicate['items'][1] = copy.deepcopy(duplicate['items'][0])
        changes.append(duplicate)
        for value in ('../outside', '/absolute', 'files/../../outside'):
            altered = copy.deepcopy(self.scope)
            altered['items'][0]['archiveMember'] = value
            changes.append(altered)
        altered = copy.deepcopy(self.scope)
        altered['items'][0]['path'] = str(self.sources / '.ssh/id_ed25519')
        altered['items'][0]['archiveMember'] = 'files' + altered['items'][0]['path']
        changes.append(altered)
        for field in ('regularFileCount', 'regularLogicalBytes'):
            altered = copy.deepcopy(self.scope)
            altered[field] += 1
            changes.append(altered)
        for value in changes:
            raw = json.dumps(value).encode()
            with patch.object(m, 'SCOPE_SHA256', m.digest(raw)):
                with self.assertRaises(m.Stop):
                    m.validate_scope(raw)

    def test_source_hash_mismatch_keeps_partial_cipher_first_error_and_no_result(self):
        self.write(self.paths[0], b'X' * len(self.contents[0]), exclusive=False)
        with self.assertRaisesRegex(m.Stop, '^SOURCE_HASH_MISMATCH$'):
            self.bundle()
        self.assertTrue(list(self.output.glob('*.part*')))
        self.assertTrue((self.output / 'BUNDLE_ATTEMPT.SAFE.json').exists())
        self.assertTrue((self.output / 'BUNDLE_FIRST_ERROR.PRIVATE.json').exists())
        self.assertFalse((self.output / 'BUNDLE_RESULT.SAFE.json').exists())
        before = self.read(self.output / 'BUNDLE_FIRST_ERROR.PRIVATE.json')
        with self.assertRaises(FileExistsError):
            self.bundle()
        self.assertEqual(self.read(self.output / 'BUNDLE_FIRST_ERROR.PRIVATE.json'), before)

    def test_source_metadata_drift_is_rejected_after_streaming(self):
        original = m.SourceReader.read
        changed = []
        def read(reader, length):
            raw = original(reader, length)
            if not changed:
                info = os.fstat(reader.fd)
                os.utime(self.paths[0], ns=(info.st_atime_ns + 1, info.st_mtime_ns))
                changed.append(True)
            return raw
        with patch.object(m.SourceReader, 'read', new=read):
            with self.assertRaisesRegex(m.Stop, '^SOURCE_METADATA_CHANGED$'):
                self.bundle()

    def test_sources_and_ancestors_never_follow_symlinks(self):
        row = copy.deepcopy(self.scope['items'][0])
        link = self.sources / 'link'
        link.symlink_to(self.paths[0])
        row['path'] = str(link)
        with self.assertRaises(OSError):
            m.open_regular(row)
        directory_link = self.base / 'directory-link'
        directory_link.symlink_to(self.sources, target_is_directory=True)
        with self.assertRaises(OSError):
            m.parent_fd(str(directory_link / self.paths[0].name))

    def test_project_originals_never_use_readonly_exception(self):
        row = self.scope['items'][0]
        real_open = os.open
        observed = []
        def opening(path, flags, *args, **kwargs):
            if os.fsdecode(path) == self.paths[0].name:
                observed.append(flags)
                if flags & os.O_NOATIME:
                    raise PermissionError(errno.EPERM, 'synthetic noatime denial')
            return real_open(path, flags, *args, **kwargs)
        with patch.object(m.os, 'open', side_effect=opening):
            with self.assertRaises(PermissionError):
                m.open_regular(row)
        self.assertEqual(len(observed), 1)
        self.assertTrue(observed[0] & os.O_NOATIME)

    def test_only_scoped_runtime_fallback_requires_readonly_fd_before_any_read_and_after(self):
        row = self.scope['items'][1]
        real_open = os.open
        observed = []
        def opening(path, flags, *args, **kwargs):
            if os.fsdecode(path) == self.paths[1].name:
                observed.append(flags)
                if flags & os.O_NOATIME:
                    raise PermissionError(errno.EPERM, 'synthetic noatime denial')
            return real_open(path, flags, *args, **kwargs)
        with patch.object(m.os, 'open', side_effect=opening), \
                patch.object(m.os, 'fstatvfs', return_value=types.SimpleNamespace(f_flag=0)), \
                patch.object(m.os, 'read', side_effect=AssertionError('readonly proof must precede read')):
            with self.assertRaisesRegex(m.Stop, '^READONLY_EXCEPTION_NOT_PROVEN$'):
                m.open_regular(row)
        self.assertEqual(len(observed), 2)
        self.assertTrue(all(flags & os.O_NOFOLLOW for flags in observed))
        with patch.object(m.os, 'open', side_effect=opening), \
                patch.object(m.os, 'fstatvfs', side_effect=[types.SimpleNamespace(f_flag=os.ST_RDONLY),
                                                        types.SimpleNamespace(f_flag=0)]):
            opened = m.open_regular(row)
            try:
                with self.assertRaisesRegex(m.Stop, '^READONLY_EXCEPTION_CHANGED$'):
                    m.verify_regular(opened)
            finally:
                os.close(opened[0])
                os.close(opened[1])

    def test_python_directory_and_internal_symlink_tar_metadata_only(self):
        directory = self.python / 'lib'
        link = directory / 'alias.dat'
        link.symlink_to('public.dat')
        rows = []
        for path, kind in ((directory, 'directory'), (link, 'symlink')):
            info = os.stat(path, follow_symlinks=False)
            rows.append({'path': str(path), 'type': kind, 'statBefore': m.metadata(info),
                'statAfter': m.metadata(info), 'readonlyBefore': True, 'readonlyAfter': True,
                'fullMetadataIncludingAtimeUnchanged': True, **({'target': 'public.dat'} if kind == 'symlink' else {})})
        self.scope['pythonDirectoriesAndLinks'] = rows
        self.stack.enter_context(patch.object(m, 'PYTHON_METADATA_COUNT', 2))
        self.stack.enter_context(patch.object(m, 'PYTHON_LINK_COUNT', 1))
        self.pin_scope()
        with patch.object(m.os, 'readlink', return_value='public.dat'), \
                patch.object(m.os, 'fstatvfs', return_value=types.SimpleNamespace(
                    f_flag=os.ST_RDONLY, f_bavail=10**9, f_frsize=4096)):
            result = self.bundle()
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(self.ciphertext(result))), mode='r:') as archive:
            entries = archive.getmembers()
            self.assertEqual(entries[0].name, 'SOURCE_SCOPE.PRIVATE.json')
            self.assertTrue(entries[1].isdir())
            self.assertTrue(entries[2].issym())
            self.assertEqual(entries[2].linkname, 'public.dat')
            for entry, original in zip(entries[1:3], rows):
                self.assertEqual(int(Decimal(entry.pax_headers['mtime']) * 1000000000),
                                 original['statBefore']['st_mtime_ns'])
        bad = copy.deepcopy(self.scope)
        bad['pythonDirectoriesAndLinks'][1]['target'] = '../../outside'
        raw = json.dumps(bad).encode()
        with patch.object(m, 'SCOPE_SHA256', m.digest(raw)):
            with self.assertRaisesRegex(m.Stop, '^PYTHON_LINK_TARGET$'):
                m.validate_scope(raw)

    def test_encryptor_failure_retains_partials_and_bounded_redacted_first_error(self):
        instances = []
        class Failing(FakeEncryptor):
            def __init__(inner, *args):
                super().__init__(*args)
                instances.append(inner)
            def write(inner, raw):
                inner.sink.write(raw)
                raise ValueError(SECRET)
        with self.assertRaises(ValueError):
            self.bundle(Failing)
        self.assertTrue(instances[0].aborted)
        raw = self.read(self.output / 'BUNDLE_FIRST_ERROR.PRIVATE.json')
        self.assertLess(len(raw), 8192)
        self.assertNotIn(SECRET.encode(), raw)
        self.assertTrue(list(self.output.glob('*.part*')))
        self.assertFalse((self.output / 'BUNDLE_RESULT.SAFE.json').exists())

    def test_result_fsync_failure_never_publishes_canonical_result(self):
        original = m.write_once
        def write(directory, name, value):
            original(directory, name, value)
            if name == 'BUNDLE_RESULT.PENDING.SAFE.json':
                raise OSError(errno.ENOSPC, 'synthetic result fsync failure')
        with patch.object(m, 'write_once', side_effect=write):
            with self.assertRaises(OSError):
                self.bundle()
        self.assertTrue((self.output / 'BUNDLE_RESULT.PENDING.SAFE.json').exists())
        self.assertFalse((self.output / 'BUNDLE_RESULT.SAFE.json').exists())

    def test_recipient_response_pin_and_public_bytes_use_existing_pinned_validator_without_real_gpg(self):
        public = (b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n' + base64.b64encode(b'\xc6\x01\x04')
                  + b'\n=AAAA\n-----END PGP PUBLIC KEY BLOCK-----\n')
        recipient = {'fingerprint': FP, 'public_key_base64': base64.b64encode(public).decode(), 'public_sha256': m.digest(public)}
        result = {'status': 'RECIPIENT_READY', 'recipient': recipient}
        response = {'schema': 'helmut-native-control-response-v1', 'operation': 'recipient',
            'nonce': '3' * 64, 'plan_sha256': '1' * 64, 'payload_sha256': m.SERVER_SHA256,
            'result': result, 'result_sha256': m.digest(json.dumps(result, sort_keys=True, separators=(',', ':')).encode())}
        raw = json.dumps(response).encode()
        response_path, public_path = self.base / 'response.json', self.base / 'recipient.public.asc'
        self.write(response_path, raw)
        self.write(public_path, public)
        completed = subprocess.CompletedProcess([], 0, b'pub:-:255:22:0000000000000000:::::::\nfpr:::::::::' + FP.encode() + b':\n', b'')
        with patch.object(m.subprocess, 'run', return_value=completed):
            self.assertEqual(m.validate_recipient_inputs(str(response_path), m.digest(raw), str(public_path)), (FP, public))
        with self.assertRaisesRegex(m.Stop, '^RECIPIENT_RESPONSE_PIN$'):
            m.validate_recipient_inputs(str(response_path), '0' * 64, str(public_path))
        self.write(public_path, b'WRONG_SYNTHETIC_PUBLIC_BYTES', exclusive=False)
        with patch.object(m.subprocess, 'run', return_value=completed):
            with self.assertRaisesRegex(m.Stop, '^RECIPIENT_PUBLIC_KEY_BINDING$'):
                m.validate_recipient_inputs(str(response_path), m.digest(raw), str(public_path))

    def test_encryptor_uses_exact_readonly_recipient_file_without_import_or_agent(self):
        self.output = self.base / ('deep-' + 'x'*80) / ('fresh-' + 'y'*80)
        self.output.mkdir(mode=0o700, parents=True)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        process = types.SimpleNamespace(stdin=Mock(), stdout=io.BytesIO(b'SYNTHETIC_CIPHER'),
                                        stderr=io.BytesIO(), wait=Mock(return_value=0), pid=123456)
        sink = m.Parts(directory)
        public = b'SYNTHETIC_PUBLIC_ONLY'
        def spawn(arguments, **options):
            fd, = options['pass_fds']
            self.assertEqual(arguments[arguments.index('--recipient-file') + 1], '/proc/self/fd/' + str(fd))
            self.assertEqual(os.read(fd, 65536), public)
            os.lseek(fd, 0, os.SEEK_SET)
            with self.assertRaises(OSError) as raised:os.write(fd, b'x')
            self.assertEqual(raised.exception.errno, errno.EBADF)
            return process
        try:
            with patch.object(m.subprocess, 'Popen', side_effect=spawn) as opening:
                encryptor = m.GPGEncryptor(sink, str(self.output), FP, public)
                encryptor.finish()
            sink.close()
            self.assertEqual(opening.call_count, 1)
            arguments = opening.call_args.args[0]
            self.assertEqual(arguments[arguments.index('--cipher-algo') + 1], 'AES256')
            self.assertEqual(arguments[arguments.index('--compress-algo') + 1], 'none')
            self.assertNotIn('--recipient', arguments)
            self.assertIn('--encrypt', arguments)
            self.assertIn('--rfc4880', arguments)
            self.assertIn('--force-mdc', arguments)
            self.assertIn('--no-autostart', arguments)
            self.assertIn('--no-default-keyring', arguments)
            self.assertEqual(arguments[arguments.index('--trust-model') + 1], 'always')
            home = self.output / 'public-gpg-home'
            self.assertEqual(arguments[arguments.index('--homedir') + 1], str(home))
            self.assertEqual(home.stat().st_mode & 0o777, 0o700)
            self.assertEqual(list(home.iterdir()), [])
            self.assertEqual(self.read(self.output / 'RECIPIENT.PUBLIC.asc'), public)
            self.assertEqual(opening.call_args.kwargs['env'], {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
            self.assertTrue(opening.call_args.kwargs['start_new_session'])
            self.assertFalse(any(word in arguments for word in (
                '--import', '--import-options', '--generate-key', '--quick-generate-key',
                '--import-ownertrust', '--export-secret-keys', 'gpg-agent')))
            self.assertFalse(hasattr(m, 'public_import'))
            self.assertEqual(self.read(self.output / sink.parts[0]['name']), b'SYNTHETIC_CIPHER')
        finally:
            os.close(directory)

    def test_public_file_is_pinned_readonly_and_never_overwrites_prior_copy(self):
        self.output.mkdir(mode=0o700)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        fd = None
        try:
            fd = m.public_recipient_file(b'SYNTHETIC_PUBLIC_ONLY', directory)
            self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o600)
            self.assertFalse(os.get_inheritable(fd))
            with self.assertRaises(FileExistsError):m.public_recipient_file(b'OTHER_PUBLIC_ONLY', directory)
            path = self.output / 'RECIPIENT.PUBLIC.asc'
            self.assertEqual(self.read(path), b'SYNTHETIC_PUBLIC_ONLY')
            path.rename(self.output / 'PRESERVED.PUBLIC.asc')
            self.write(path, b'OTHER_PUBLIC_ONLY')
            self.assertEqual(os.read(fd, 65536), b'SYNTHETIC_PUBLIC_ONLY')
        finally:
            if fd is not None:os.close(fd)
            os.close(directory)

    def test_public_copy_mismatch_prevents_process_start_and_preserves_failure(self):
        self.output.mkdir(mode=0o700)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        real_read = os.read
        def wrong(fd, size):
            data = real_read(fd, size)
            return data.replace(b'SYNTHETIC', b'CORRUPTED')
        try:
            with patch.object(m.os, 'read', side_effect=wrong),patch.object(m.subprocess, 'Popen') as opening:
                with self.assertRaisesRegex(m.Stop, '^PUBLIC_KEY_COPY_CHANGED$'):
                    m.GPGEncryptor(m.Parts(directory), str(self.output), FP, b'SYNTHETIC_PUBLIC_ONLY')
            opening.assert_not_called()
            record = json.loads(self.read(self.output / 'GPG_FIRST_ERROR.PRIVATE.json'))
            self.assertEqual(record['phase'], 'encrypt-constructor')
            self.assertEqual(self.read(self.output / 'RECIPIENT.PUBLIC.asc'), b'SYNTHETIC_PUBLIC_ONLY')
        finally:os.close(directory)

    def test_constructor_thread_start_failure_records_first_error_then_closes_only_own_process(self):
        self.output.mkdir(mode=0o700)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        process = types.SimpleNamespace(stdin=io.BytesIO(), stdout=io.BytesIO(), stderr=io.BytesIO(),
                                        wait=Mock(return_value=-9), pid=123456)
        events, original_error = [], m.tool_error
        def record(*args, **kwargs):
            events.append('error')
            return original_error(*args, **kwargs)
        try:
            with patch.object(m.subprocess, 'Popen', return_value=process), \
                    patch.object(m.threading.Thread, 'start', side_effect=RuntimeError(SECRET)), \
                    patch.object(m, 'tool_error', side_effect=record), \
                    patch.object(m.os, 'killpg', side_effect=lambda *args: events.append(('kill', args))):
                with self.assertRaises(RuntimeError):
                    m.GPGEncryptor(m.Parts(directory), str(self.output), FP, b'SYNTHETIC_PUBLIC_ONLY')
            self.assertEqual(events[0], 'error')
            self.assertEqual(events[1], ('kill', (123456, m.signal.SIGKILL)))
            process.wait.assert_called_once_with(timeout=5)
            self.assertTrue(all(stream.closed for stream in (process.stdin, process.stdout, process.stderr)))
            record = self.read(self.output / 'GPG_FIRST_ERROR.PRIVATE.json')
            self.assertNotIn(SECRET.encode(), record)
        finally:
            os.close(directory)

    def test_original_nanosecond_mtime_has_exact_integer_header_and_bounded_local_pax(self):
        for nanoseconds in (0, 1792970000123456789, 1792970000000000001, -1):
            info = m.tar_info('files/synthetic', 0o600, mtime_ns=nanoseconds)
            self.assertEqual(info.mtime, nanoseconds // 1000000000)
            self.assertEqual(int(Decimal(info.pax_headers['mtime']) * 1000000000), nanoseconds)
            self.assertLessEqual(len(info.pax_headers['mtime'].partition('.')[2]), 9)


if __name__ == '__main__':
    unittest.main(verbosity=2)
