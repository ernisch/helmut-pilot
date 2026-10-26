#!/usr/bin/env python3
"""Inert, fixed original-image ingestion; only a trusted root caller may invoke the ABI.

The caller supplies an accepted-stage archive FD and the pinned context helper's
observe callback. That callback must freshly enforce its service, process/start,
namespace, socket, Docker 28.4/vfs/cgroupfs/v2 and zero-container checks. No CLI
argument, environment value or user response supplies either authority.
"""
import ctypes
import fcntl
import hashlib
import http.client
import io
import json
import os
import socket
import stat
import struct
import tarfile
import time

_BI_BASE = '/opt/helmut-native-test/automation-20261026'
_BI_SOCKET = '/opt/helmut-native-test/docker28-context-20261026/run/docker.sock'
_BI_ARCHIVE_BYTES = 808960
_BI_ARCHIVE_SHA256 = '8dacbc3efa3b48cf6d7fbf2f06c200e2cabafcbe7d1499bb0348080126d9adfe'
_BI_IMAGE = 'sha256:34e72f77a5fa0728d44b75766cdfdb1851aea196b3ba6c4fb9242f5d339a678b'
_BI_DIFF = 'sha256:350989595ee85809ed9d9ec05e5051f296042d13788b1c80918b542bd29ad5ae'
_BI_SIZE = 794376
_BI_ATTEMPT = 'BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_ATTEMPT.SAFE.json'
_BI_ERROR = 'BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_FIRST_ERROR.PRIVATE.json'
_BI_PENDING = 'BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_RECEIPT.PENDING.SAFE.json'
_BI_READY = 'BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_READY.SAFE.json'
_BI_D = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC
_BI_R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC


class _BudgetImportStop(Exception):
    def __init__(self, code): self.code = code


def _bi_need(value, code):
    if not value: raise _BudgetImportStop(code)


def _bi_encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode('ascii')


def _bi_parse(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _bi_need(key not in result, 'JSON_DUPLICATE'); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: _bi_need(False, 'JSON_CONSTANT'))


def _bi_root():
    _bi_need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'ROOT_REQUIRED')


def _bi_owned(info):
    return info.st_uid == info.st_gid == 0


def _bi_directory(info, private=False):
    _bi_need(stat.S_ISDIR(info.st_mode) and _bi_owned(info)
             and (stat.S_IMODE(info.st_mode) == 0o700 if private else not info.st_mode & 0o022), 'BASE_IDENTITY')


def _bi_open_base():
    fd = os.open('/', _BI_D)
    try:
        _bi_directory(os.fstat(fd))
        for part in _BI_BASE.strip('/').split('/'):
            child = os.open(part, _BI_D, dir_fd=fd); os.close(fd); fd = child
            _bi_directory(os.fstat(fd))
        _bi_directory(os.fstat(fd), True)
        return fd
    except BaseException:
        os.close(fd); raise


def _bi_missing(fd, name):
    try: os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError: return True
    return False


def _bi_write(fd, name, raw):
    _bi_need(type(raw) is bytes and len(raw) <= 16384, 'RECEIPT_BOUND')
    out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=fd)
    try:
        offset = 0
        while offset < len(raw):
            count = os.write(out, raw[offset:]); _bi_need(count > 0, 'SHORT_WRITE'); offset += count
        os.fsync(out)
    finally: os.close(out)
    os.fsync(fd)


def _bi_readback(fd, name, raw):
    item = os.open(name, _BI_R, dir_fd=fd)
    try:
        before = os.fstat(item)
        _bi_need(stat.S_ISREG(before.st_mode) and _bi_owned(before)
                 and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
                 and before.st_size == len(raw), 'RECEIPT_IDENTITY')
        actual = bytearray()
        while len(actual) <= len(raw):
            block = os.read(item, len(raw)+1-len(actual))
            if not block: break
            actual.extend(block)
        _bi_need(bytes(actual) == raw and before == os.fstat(item), 'RECEIPT_READBACK')
    finally: os.close(item)


def _bi_archive(fd):
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    _bi_need(flags & os.O_ACCMODE == os.O_RDONLY and flags & os.O_NOATIME
             and flags & os.O_NOFOLLOW, 'ARCHIVE_FD_FLAGS')
    before = os.fstat(fd)
    _bi_need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
             and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size == _BI_ARCHIVE_BYTES, 'ARCHIVE_IDENTITY')
    chunks, count = [], 0
    while count < _BI_ARCHIVE_BYTES:
        block = os.pread(fd, min(65536, _BI_ARCHIVE_BYTES-count), count)
        _bi_need(bool(block), 'ARCHIVE_EOF'); chunks.append(block); count += len(block)
    raw = b''.join(chunks)
    _bi_need(before == os.fstat(fd) and hashlib.sha256(raw).hexdigest() == _BI_ARCHIVE_SHA256, 'ARCHIVE_HASH_OR_CHANGED')
    # This is only a tag guard on already hash-authenticated bytes, never extraction.
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
        members = archive.getmembers()
        _bi_need(len(members) <= 32 and len({m.name for m in members}) == len(members), 'ARCHIVE_STRUCTURE')
        def document(name):
            item = archive.getmember(name)
            _bi_need(item.isreg() and item.size <= 16384, 'ARCHIVE_STRUCTURE')
            stream = archive.extractfile(item)
            try: return _bi_parse(stream.read(16385))
            finally: stream.close()
        manifest, index = document('manifest.json'), document('index.json')
        _bi_need(type(manifest) is list and len(manifest) == 1 and type(manifest[0]) is dict
                 and manifest[0].get('RepoTags') in (None, [])
                 and manifest[0].get('Config') == 'blobs/sha256/'+_BI_IMAGE[7:]
                 and manifest[0].get('Layers') == ['blobs/sha256/'+_BI_DIFF[7:]], 'ARCHIVE_TAG_OR_IMAGE')
        descriptors = index.get('manifests') if type(index) is dict else None
        _bi_need(type(descriptors) is list and len(descriptors) == 1 and type(descriptors[0]) is dict
                 and index.get('annotations') in (None, {})
                 and descriptors[0].get('annotations') in (None, {}), 'ARCHIVE_OCI_TAG_OR_IMAGE')
    return raw, before


def _bi_facts(observer):
    facts = observer()
    _bi_need(type(facts) is dict and set(facts) == {'pid', 'start_ticks', 'namespace', 'pid1_namespace', 'socket', 'private'}
             and type(facts['pid']) is int and facts['pid'] > 1
             and type(facts['start_ticks']) is int and facts['start_ticks'] > 0
             and type(facts['private']) is bool, 'CONTEXT_OBSERVER')
    for name in ('namespace', 'pid1_namespace', 'socket'):
        _bi_need(type(facts[name]) is list and len(facts[name]) == 2
                 and all(type(n) is int and n >= 0 for n in facts[name]), 'CONTEXT_OBSERVER')
    _bi_need(facts['namespace'] != facts['pid1_namespace'], 'CONTEXT_OBSERVER')
    return _bi_parse(_bi_encoded(facts))


def _bi_check(fd, before, expected, observer, deadline):
    _bi_need(time.monotonic() < deadline, 'DEADLINE')
    _bi_need(os.fstat(fd) == before, 'ARCHIVE_CHANGED')
    _bi_need(_bi_facts(observer) == expected, 'DAEMON_CHANGED')
    space = os.statvfs(_BI_BASE)
    _bi_need(space.f_bavail * space.f_frsize >= 8*1024**3+2*1024**2, 'DISK_FLOOR')
    _bi_need(time.monotonic() < deadline, 'DEADLINE')


def _bi_peer(peer, expected):
    info = os.stat(_BI_SOCKET, follow_symlinks=False)
    _bi_need(stat.S_ISSOCK(info.st_mode) and info.st_uid == 0 and info.st_gid == 1000
             and stat.S_IMODE(info.st_mode) == 0o660
             and [info.st_dev, info.st_ino] == expected['socket'], 'SOCKET_IDENTITY')
    credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
    _bi_need(peer.family == socket.AF_UNIX and peer.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) == socket.SOCK_STREAM
             and peer.getpeername() == _BI_SOCKET and credentials == (expected['pid'], 0, 0), 'SOCKET_PEER')


def _bi_http(method, path, body, fd, before, expected, observer, deadline):
    _bi_check(fd, before, expected, observer, deadline)
    peer = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection = response = None
    try:
        peer.settimeout(min(3, max(.001, deadline-time.monotonic()))); peer.connect(_BI_SOCKET)
        _bi_peer(peer, expected)
        connection = http.client.HTTPConnection('localhost', timeout=3)
        # Keep our independently checked peer FD alive even when HTTP closes its
        # duplicate on a Connection: close response, before body readback ends.
        connection.sock = peer.dup()
        connection.request(method, path, body=body, headers={'Host': 'localhost', 'Connection': 'close',
                           'Content-Type': 'application/x-tar', 'Content-Length': str(len(body) if body else 0)})
        response = connection.getresponse()
        transfer = response.getheader('Transfer-Encoding')
        _bi_need(response.getheader('Content-Encoding') in (None, 'identity')
                 and transfer in (None, 'chunked'), 'HTTP_FRAMING')
        length = response.getheader('Content-Length')
        _bi_need(not (transfer and length) and (length is None or
                 (length.isascii() and length.isdecimal() and int(length) <= 65536)), 'HTTP_BOUND')
        raw = bytearray()
        while True:
            _bi_need(time.monotonic() < deadline, 'DEADLINE')
            block = response.read(min(4096, 65537-len(raw)))
            if not block: break
            raw.extend(block); _bi_need(len(raw) <= 65536, 'HTTP_BOUND')
        _bi_need(length is None or len(raw) == int(length), 'HTTP_EOF')
        _bi_peer(peer, expected)
        _bi_check(fd, before, expected, observer, deadline)
        return response.status, bytes(raw)
    finally:
        try:
            if response is not None: response.close()
        finally:
            try:
                if connection is not None: connection.close()
            finally: peer.close()


def _bi_image(raw):
    image = _bi_parse(raw)
    _bi_need(type(image) is dict and image.get('Id') == _BI_IMAGE
             and type(image.get('Size')) is int and image['Size'] == _BI_SIZE
             and image.get('Os') == 'linux' and image.get('Architecture') == 'amd64'
             and image.get('RootFS') == {'Type': 'layers', 'Layers': [_BI_DIFF]}, 'IMAGE_IDENTITY')


def _bi_publish(fd):
    rename = ctypes.CDLL(None, use_errno=True).renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    _bi_need(rename(fd, _BI_PENDING.encode(), fd, _BI_READY.encode(), 1) == 0, 'PUBLICATION_FAILED')


def import_bound_budget_image(archive_fd, observer):
    """Trusted-root ABI only. No retry/adoption; observer is pinned context.observe."""
    base = held = None
    published = record_error = False
    phase, requests, deadline = 'preflight', 0, time.monotonic()+60
    result = {'schema': 'helmut-original-budget-image-daemon-binding-v2-import-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
              'image': _BI_IMAGE, 'archive_sha256': _BI_ARCHIVE_SHA256,
              'nativeQualified': False, 'nativeGOConsumed': False, 'load_requests': 0}
    old = os.umask(0o077)
    try:
        _bi_root(); base = _bi_open_base()
        _bi_need(all(_bi_missing(base, name) for name in (_BI_ATTEMPT, _BI_ERROR, _BI_PENDING, _BI_READY)), 'ALREADY_ATTEMPTED')
        record_error = True
        held = os.dup(archive_fd); raw, before = _bi_archive(held)
        expected = _bi_facts(observer); _bi_check(held, before, expected, observer, deadline)
        attempt = _bi_encoded({'schema': 'helmut-original-budget-image-daemon-binding-v2-import-attempt-v1',
            'state': 'UNKNOWN_NO_RETRY', 'image': _BI_IMAGE, 'archive_sha256': _BI_ARCHIVE_SHA256, 'daemon': expected})
        _bi_write(base, _BI_ATTEMPT, attempt); _bi_readback(base, _BI_ATTEMPT, attempt)
        phase = 'inspect-before'
        path = '/images/'+_BI_IMAGE+'/json'
        status, body = _bi_http('GET', path, None, held, before, expected, observer, deadline)
        if status == 200:
            _bi_image(body); status_name = 'ALREADY_PRESENT_NOT_NATIVE_QUALIFIED'
        else:
            _bi_need(status == 404, 'IMAGE_INSPECT_HTTP')
            phase, requests = 'load', None
            status, body = _bi_http('POST', '/images/load?quiet=1', raw, held, before, expected, observer, deadline)
            requests = 1
            _bi_need(status == 200, 'IMAGE_LOAD_HTTP')
            for line in body.splitlines():
                if line:
                    message = _bi_parse(line)
                    _bi_need(type(message) is dict and 'error' not in message and 'errorDetail' not in message, 'IMAGE_LOAD_ERROR')
            phase = 'inspect-after'
            status, body = _bi_http('GET', path, None, held, before, expected, observer, deadline)
            _bi_need(status == 200, 'IMAGE_INSPECT_HTTP'); _bi_image(body)
            status_name = 'IMPORTED_NOT_NATIVE_QUALIFIED'
        phase = 'publication'; _bi_check(held, before, expected, observer, deadline)
        result.update(status=status_name, load_requests=requests, image_bytes=_BI_SIZE,
                      rootfs_diff_id=_BI_DIFF, archive_bytes=_BI_ARCHIVE_BYTES, daemon=expected)
        proof = _bi_encoded(result); _bi_write(base, _BI_PENDING, proof); _bi_readback(base, _BI_PENDING, proof)
        _bi_check(held, before, expected, observer, deadline)
        _bi_publish(base); published = True
        return result
    except Exception as error:
        result.update(status='FAIL_KEEP_STATE_NO_RETRY', phase=phase, load_requests=requests,
                      code=error.code if isinstance(error, _BudgetImportStop) else 'FILESYSTEM_OR_FORMAT_FAILURE')
        if base is not None and record_error:
            try: _bi_write(base, _BI_ERROR, _bi_encoded(result))
            except Exception: pass
        return result
    finally:
        os.umask(old)
        for fd in (held, base):
            if fd is not None:
                try: os.close(fd)
                except OSError:
                    if not published: raise


def main():
    print('{"status":"NOT_EXECUTED_TRUSTED_ROOT_CALLER_ABI_REQUIRED"}')
    return 2


if __name__ == '__main__': raise SystemExit(main())
