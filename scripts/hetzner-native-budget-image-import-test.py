#!/usr/bin/env python3
"""Own tiny synthetic tar/HTTP/syscall fixtures; never an authentic archive or Docker.

Only private archive constants and private root-metadata adapters are patched for
fixtures. Production has no CLI/environment override and retains the authentic pin.
"""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import stat
import struct
import tempfile
import time
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-budget-image-import.py')
fd = os.open(SOURCE, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW)
try:
    before = os.fstat(fd); source = bytearray()
    while True:
        block = os.read(fd, 65536)
        if not block: break
        source.extend(block)
    assert before == os.fstat(fd)
finally: os.close(fd)
M = types.ModuleType('synthetic_budget_import')
exec(compile(bytes(source), str(SOURCE), 'exec'), M.__dict__)


def fixture_archive(tags=None, annotations=None, config=None, layers=None, images=1):
    import tarfile
    manifest = [{'RepoTags': tags, 'Config': config or 'blobs/sha256/'+M._BI_IMAGE[7:],
                 'Layers': layers if layers is not None else ['blobs/sha256/'+M._BI_DIFF[7:]]}]*images
    index = {'schemaVersion': 2, 'manifests': [{'digest': 'sha256:'+'a'*64, 'annotations': annotations}]}
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, body in [('manifest.json', manifest), ('index.json', index)]:
            data = json.dumps(body).encode(); info = tarfile.TarInfo(name); info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return output.getvalue()


def image(**changes):
    result = {'Id': M._BI_IMAGE, 'Size': M._BI_SIZE, 'Os': 'linux', 'Architecture': 'amd64',
              'RootFS': {'Type': 'layers', 'Layers': [M._BI_DIFF]}}
    result.update(changes); return result


class Harness:
    def __init__(self, case):
        self.case, self.calls, self.after = case, [], None
        self.responses = [(200, image())]

    def __call__(self, method, path, body, fd, before, expected, observer, deadline):
        M._bi_check(fd, before, expected, observer, deadline)
        self.calls.append((method, path, body))
        if method == 'POST':
            self.case.assertTrue((self.case.base/M._BI_ATTEMPT).is_file())
            self.case.assertEqual(body, self.case.raw)
        value = self.responses.pop(0)
        if isinstance(value, Exception): raise value
        if self.after: self.after(method)
        M._bi_check(fd, before, expected, observer, deadline)
        status, value = value
        return status, value if isinstance(value, bytes) else json.dumps(value).encode()


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-budget-import-synthetic-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)/'root'; self.base.mkdir(mode=0o700)
        self.archive = Path(self.temp.name)/'own-synthetic-only.tar'
        self.raw = fixture_archive(); self.archive.write_bytes(self.raw); self.archive.chmod(0o600)
        self.fd = os.open(self.archive, M._BI_R)
        self.addCleanup(lambda: os.close(self.fd))
        self.facts = {'pid': 424242, 'start_ticks': 123456, 'namespace': [1, 20],
                      'pid1_namespace': [1, 10], 'socket': [9, 40], 'private': True}
        self.http = Harness(self)
        self.original_root = M._bi_root
        for target, value in [('_BI_BASE', str(self.base)), ('_BI_ARCHIVE_BYTES', len(self.raw)),
                ('_BI_ARCHIVE_SHA256', hashlib.sha256(self.raw).hexdigest()),
                ('_bi_root', lambda: None), ('_bi_owned', lambda s: s.st_uid == os.getuid() and s.st_gid == os.getgid()),
                ('_bi_open_base', lambda: os.open(self.base, M._BI_D)), ('_bi_http', self.http)]:
            mock = patch.object(M, target, value); mock.start(); self.addCleanup(mock.stop)
        space = patch.object(M.os, 'statvfs', return_value=types.SimpleNamespace(f_bavail=100*1024**3, f_frsize=1))
        space.start(); self.addCleanup(space.stop)

    def run_import(self):
        return M.import_bound_budget_image(self.fd, lambda: copy.deepcopy(self.facts))

    def cold(self):
        self.http.responses = [(404, {'message': 'synthetic missing'}),
            (200, b'{"stream":"synthetic load only"}\n'), (200, image())]

    def replace_fixture(self, **options):
        self.raw = fixture_archive(**options)
        with self.archive.open('wb') as stream: stream.write(self.raw)
        M._BI_ARCHIVE_BYTES = len(self.raw); M._BI_ARCHIVE_SHA256 = hashlib.sha256(self.raw).hexdigest()

    def fail(self, code, calls=None):
        result = self.run_import()
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY', result)
        self.assertEqual(result['code'], code, result)
        self.assertFalse((self.base/M._BI_READY).exists())
        self.assertFalse(result['nativeQualified']); self.assertFalse(result['nativeGOConsumed'])
        if calls is not None: self.assertEqual(len(self.http.calls), calls)
        return result

    def test_default_is_inert_and_has_no_cli_authority(self):
        with patch.object(M, '_bi_root', side_effect=AssertionError('must stay inert')), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(M.main(), 2)
        self.assertIn('NOT_EXECUTED', out.getvalue()); self.assertEqual(self.http.calls, [])

    def test_root_preflight_happens_before_open_or_observer(self):
        with patch.object(M, '_bi_root', side_effect=M._BudgetImportStop('ROOT_REQUIRED')):
            self.fail('ROOT_REQUIRED', 0)
        self.assertEqual(list(self.base.iterdir()), [])

    def test_valid_existing_image_never_loads_and_preserves_archive(self):
        before = self.archive.stat(); os.lseek(self.fd, 7, os.SEEK_SET)
        result = self.run_import()
        self.assertEqual(result['status'], 'ALREADY_PRESENT_NOT_NATIVE_QUALIFIED', result)
        self.assertEqual(result['load_requests'], 0); self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(os.lseek(self.fd, 0, os.SEEK_CUR), 7); self.assertEqual(self.archive.stat(), before)
        self.assertEqual(json.loads((self.base/M._BI_READY).read_bytes()), result)
        self.assertFalse((self.base/M._BI_PENDING).exists()); self.assertFalse((self.base/M._BI_ERROR).exists())

    def test_cold_load_exact_archive_once_then_exact_image_and_receipt(self):
        self.cold(); result = self.run_import()
        self.assertEqual(result['status'], 'IMPORTED_NOT_NATIVE_QUALIFIED', result)
        self.assertEqual(result['load_requests'], 1)
        self.assertEqual([row[:2] for row in self.http.calls], [('GET', '/images/'+M._BI_IMAGE+'/json'),
            ('POST', '/images/load?quiet=1'), ('GET', '/images/'+M._BI_IMAGE+'/json')])
        self.assertEqual((self.base/M._BI_READY).stat().st_mode & 0o777, 0o600)

    def test_completed_slot_never_adopts_or_retries(self):
        self.cold(); self.run_import(); count = len(self.http.calls)
        proof = (self.base/M._BI_READY).read_bytes()
        result = self.run_import()
        self.assertEqual(result['code'], 'ALREADY_ATTEMPTED'); self.assertEqual(len(self.http.calls), count)
        self.assertEqual((self.base/M._BI_READY).read_bytes(), proof)
        self.assertFalse((self.base/M._BI_ERROR).exists())

    def test_same_size_wrong_hash_is_not_source_authority(self):
        with self.archive.open('r+b') as stream: stream.write(b'!')
        self.fail('ARCHIVE_HASH_OR_CHANGED', 0)

    def test_writable_archive_fd_is_rejected(self):
        fd = os.open(self.archive, os.O_RDWR | os.O_NOFOLLOW | os.O_NOATIME)
        try:
            result = M.import_bound_budget_image(fd, lambda: self.facts)
            self.assertEqual(result['code'], 'ARCHIVE_FD_FLAGS'); self.assertEqual(self.http.calls, [])
        finally: os.close(fd)

    def test_noatime_and_nofollow_flags_are_mandatory(self):
        fd = os.open(self.archive, os.O_RDONLY)
        try:
            with self.assertRaises(M._BudgetImportStop) as raised: M._bi_archive(fd)
            self.assertEqual(raised.exception.code, 'ARCHIVE_FD_FLAGS')
        finally: os.close(fd)

    def test_archive_hardlink_is_rejected(self):
        os.link(self.archive, Path(self.temp.name)/'own-second-link')
        self.fail('ARCHIVE_IDENTITY', 0)

    def test_archive_permissions_are_not_relaxed(self):
        self.archive.chmod(0o644); self.fail('ARCHIVE_IDENTITY', 0)
        self.assertEqual(self.archive.stat().st_mode & 0o777, 0o644)

    def test_tagged_archive_is_hold_before_any_http(self):
        self.replace_fixture(tags=['synthetic/foreign:tag']); self.fail('ARCHIVE_TAG_OR_IMAGE', 0)

    def test_oci_reference_annotations_are_hold_before_any_http(self):
        self.replace_fixture(annotations={'org.opencontainers.image.ref.name': 'synthetic:tag'})
        self.fail('ARCHIVE_OCI_TAG_OR_IMAGE', 0)

    def test_wrong_archive_config_is_hold(self):
        self.replace_fixture(config='blobs/sha256/'+'f'*64); self.fail('ARCHIVE_TAG_OR_IMAGE', 0)

    def test_wrong_archive_layer_is_hold(self):
        self.replace_fixture(layers=['blobs/sha256/'+'f'*64]); self.fail('ARCHIVE_TAG_OR_IMAGE', 0)

    def test_multiple_images_are_not_loaded(self):
        self.replace_fixture(images=2); self.fail('ARCHIVE_TAG_OR_IMAGE', 0)

    def test_existing_wrong_image_identity_is_never_loaded(self):
        self.http.responses = [(200, image(Id='sha256:'+'f'*64))]; self.fail('IMAGE_IDENTITY', 1)

    def test_existing_wrong_size_is_not_ready(self):
        self.http.responses = [(200, image(Size=True))]; self.fail('IMAGE_IDENTITY', 1)

    def test_existing_wrong_rootfs_is_not_ready(self):
        self.http.responses = [(200, image(RootFS={'Type': 'layers', 'Layers': []}))]
        self.fail('IMAGE_IDENTITY', 1)

    def test_non404_inspect_never_loads(self):
        self.http.responses = [(500, {})]; self.fail('IMAGE_INSPECT_HTTP', 1)

    def test_load_response_error_never_becomes_ready(self):
        self.cold(); self.http.responses[1] = (200, b'{"error":"synthetic failure"}\n')
        result = self.fail('IMAGE_LOAD_ERROR', 2); self.assertEqual(result['load_requests'], 1)

    def test_load_http_failure_has_no_retry(self):
        self.cold(); self.http.responses[1] = (500, {})
        self.fail('IMAGE_LOAD_HTTP', 2); marker = (self.base/M._BI_ATTEMPT).read_bytes()
        error = (self.base/M._BI_ERROR).read_bytes(); self.fail('ALREADY_ATTEMPTED', 2)
        self.assertEqual((self.base/M._BI_ATTEMPT).read_bytes(), marker)
        self.assertEqual((self.base/M._BI_ERROR).read_bytes(), error)

    def test_unknown_post_stops_new_case_with_unknown_request_count(self):
        self.cold(); self.http.responses[1] = TimeoutError('mock timeout only')
        result = self.fail('FILESYSTEM_OR_FORMAT_FAILURE', 2)
        self.assertIsNone(result['load_requests']); self.fail('ALREADY_ATTEMPTED', 2)

    def test_post_load_missing_image_is_not_ready(self):
        self.cold(); self.http.responses[2] = (404, {})
        result = self.fail('IMAGE_INSPECT_HTTP', 3); self.assertEqual(result['load_requests'], 1)

    def test_daemon_change_before_load_blocks_it(self):
        self.cold(); self.http.after = lambda _: self.facts.update(start_ticks=999999)
        self.fail('DAEMON_CHANGED', 1)

    def test_daemon_change_after_post_keeps_unknown_no_retry(self):
        self.cold()
        self.http.after = lambda method: self.facts.update(pid=424243) if method == 'POST' else None
        result = self.fail('DAEMON_CHANGED', 2); self.assertIsNone(result['load_requests'])
        self.fail('ALREADY_ATTEMPTED', 2)

    def test_archive_changed_after_inspect_blocks_load(self):
        self.cold()
        self.http.after = lambda _: os.utime(self.archive, ns=(1000000000, 2000000000))
        self.fail('ARCHIVE_CHANGED', 1)

    def test_attempt_fsync_failure_never_reaches_http(self):
        original = M._bi_write
        def write(fd, name, raw):
            original(fd, name, raw)
            if name == M._BI_ATTEMPT: raise OSError('mock failed attempt fsync')
        with patch.object(M, '_bi_write', side_effect=write): self.fail('FILESYSTEM_OR_FORMAT_FAILURE', 0)
        self.fail('ALREADY_ATTEMPTED', 0)

    def test_pending_fsync_and_error_failure_cannot_publish_canonical_ready(self):
        self.cold(); original = M._bi_write
        def write(fd, name, raw):
            if name == M._BI_ERROR: raise OSError('mock error write also fails')
            original(fd, name, raw)
            if name == M._BI_PENDING: raise OSError('mock pending fsync failed')
        with patch.object(M, '_bi_write', side_effect=write): self.fail('FILESYSTEM_OR_FORMAT_FAILURE', 3)
        self.assertTrue((self.base/M._BI_PENDING).exists()); self.assertFalse((self.base/M._BI_ERROR).exists())
        self.fail('ALREADY_ATTEMPTED', 3)

    def test_pending_readback_corruption_blocks_publication(self):
        original = M._bi_write
        def write(fd, name, raw):
            original(fd, name, raw)
            if name == M._BI_PENDING: (self.base/name).write_bytes(b'wrong synthetic receipt')
        with patch.object(M, '_bi_write', side_effect=write): self.fail('RECEIPT_IDENTITY', 1)

    def test_no_replace_publication_failure_retains_pending(self):
        with patch.object(M, '_bi_publish', side_effect=M._BudgetImportStop('PUBLICATION_FAILED')):
            self.fail('PUBLICATION_FAILED', 1)
        self.assertTrue((self.base/M._BI_PENDING).exists())

    def test_close_errors_after_commit_do_not_invent_failure(self):
        original = os.close
        def close(fd):
            original(fd)
            if (self.base/M._BI_READY).exists(): raise OSError('mock close report after actual close')
        with patch.object(M.os, 'close', side_effect=close): result = self.run_import()
        self.assertEqual(result['status'], 'ALREADY_PRESENT_NOT_NATIVE_QUALIFIED')

    def test_observer_identity_is_a_snapshot_not_a_mutable_alias(self):
        facts = M._bi_facts(lambda: self.facts); self.facts['namespace'][1] = 12345
        self.assertEqual(facts['namespace'], [1, 20])


class PeerAndHTTPTests(unittest.TestCase):
    facts = {'pid': 424242, 'socket': [9, 40]}

    def test_exact_unix_root_peer_and_socket_are_required(self):
        info = types.SimpleNamespace(st_mode=stat.S_IFSOCK | 0o660, st_uid=0, st_gid=1000, st_dev=9, st_ino=40)
        peer = types.SimpleNamespace(family=socket.AF_UNIX, getpeername=lambda: M._BI_SOCKET,
            getsockopt=lambda level, key, *args: struct.pack('3i', 424242, 0, 0) if key == socket.SO_PEERCRED else socket.SOCK_STREAM)
        with patch.object(M.os, 'stat', return_value=info) as query:
            M._bi_peer(peer, self.facts); query.assert_called_once_with(M._BI_SOCKET, follow_symlinks=False)
            for credentials in [(424243, 0, 0), (424242, 1000, 0), (424242, 0, 1000)]:
                peer.getsockopt = lambda level, key, *args: struct.pack('3i', *credentials) if key == socket.SO_PEERCRED else socket.SOCK_STREAM
                with self.assertRaises(M._BudgetImportStop): M._bi_peer(peer, self.facts)

    def http_fixture(self, body=b'{}', headers=None):
        events = []
        class Peer:
            def __init__(self): self.closed = False
            def settimeout(self, value): events.append(('timeout', value))
            def connect(self, path): events.append(('connect', path))
            def dup(self): self.copy = Peer(); return self.copy
            def close(self): self.closed = True
        peer = Peer()
        class Response:
            status = 200
            def __init__(self): self.offset = 0; self.closed = False
            def getheader(self, name): return (headers or {}).get(name)
            def read(self, size):
                chunk = body[self.offset:self.offset+size]; self.offset += len(chunk); return chunk
            def close(self): self.closed = True
        response = Response()
        class Connection:
            def __init__(self, host, timeout): events.append(('connection', host, timeout)); self.sock = None
            def request(self, method, path, **kw): events.append(('request', method, path, kw))
            def getresponse(self): self.sock.close(); return response  # emulate Connection: close
            def close(self): self.sock.close()
        stack = contextlib.ExitStack()
        stack.enter_context(patch.object(M.socket, 'socket', return_value=peer))
        stack.enter_context(patch.object(M.http.client, 'HTTPConnection', Connection))
        stack.enter_context(patch.object(M, '_bi_check'))
        def verify(actual, expected):
            self.assertIs(actual, peer); self.assertFalse(peer.closed); self.assertEqual(expected, self.facts)
        stack.enter_context(patch.object(M, '_bi_peer', side_effect=verify))
        return stack, peer, response, events

    def test_http_uses_only_fixed_unix_peer_and_preserves_fd_for_after_eof_check(self):
        stack, peer, response, events = self.http_fixture(headers={'Content-Length': '2'})
        with stack: result = M._bi_http('GET', '/images/fixed/json', None, 9, None, self.facts, None, time.monotonic()+10)
        self.assertEqual(result, (200, b'{}')); self.assertTrue(peer.closed); self.assertTrue(response.closed)
        self.assertIn(('connect', M._BI_SOCKET), events)
        self.assertEqual(next(row for row in events if row[0] == 'request')[1:3], ('GET', '/images/fixed/json'))

    def test_bounded_http_rejects_overflow_truncation_and_ambiguous_framing(self):
        cases = [(b'x'*65537, {}, 'HTTP_BOUND'), (b'{}', {'Content-Length': '3'}, 'HTTP_EOF'),
            (b'{}', {'Transfer-Encoding': 'chunked', 'Content-Length': '2'}, 'HTTP_BOUND'),
            (b'{}', {'Content-Encoding': 'gzip'}, 'HTTP_FRAMING')]
        for body, headers, code in cases:
            with self.subTest(code=code):
                stack, peer, response, events = self.http_fixture(body, headers)
                with stack, self.assertRaises(M._BudgetImportStop) as raised:
                    M._bi_http('GET', '/images/fixed/json', None, 9, None, self.facts, None, time.monotonic()+10)
                self.assertEqual(raised.exception.code, code); self.assertTrue(peer.closed); self.assertTrue(response.closed)


if __name__ == '__main__': unittest.main()
