#!/usr/bin/env python3
"""Explicit one-shot encrypted source bundle; default invocation performs no I/O.

Only the exact approved scope is packed. No upload, restore, native execution,
private-key import, key generation, recursive source walk or automatic retry.
Recipient validation deliberately uses the reviewed 05a7b36 / PR950 snapshot
client in this worktree, not a moving stage/current-client version.
"""
import argparse
import base64
import ctypes
import errno
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import tarfile
import threading
import types

SCOPE_SHA256 = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
CLIENT_SHA256 = 'e1d30fe24dbffec3d32863820ef4d99da5d8e365c49d4f9d48b32bd8b0d8adf4'
SERVER_SHA256 = 'ab941ccf07e78c5f1b91c35ff383d652af42f989cab7700a0ceadba77e846c92'
REGULAR_COUNT, REGULAR_BYTES, PYTHON_METADATA_COUNT = 1767, 2865680705, 99
PYTHON_LINK_COUNT = 3
PYTHON_ROOT = '/opt/codex/runtimes/codex-primary-runtime/dependencies/python'
NODE_FILE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
PART_BYTES, MAX_CIPHER_BYTES = 16 * 1024**2, 4 * 1024**3
DISK_RESERVE_BYTES = 8 * 1024**3
MAX_SCOPE_BYTES = 8 * 1024**2
FLAG = '--encrypt-approved-source-scope-once'
DFLAGS = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}


class Stop(Exception):
    pass


def need(condition, code):
    if not condition:
        raise Stop(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def json_unique(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            need(key not in result, 'DUPLICATE_JSON_FIELD')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique)


def canonical_path(path):
    need(type(path) is str and path.startswith('/') and str(PurePosixPath(path)) == path
         and all(part not in ('.', '..') for part in path.split('/')[1:])
         and '\x00' not in path and '\n' not in path, 'SOURCE_PATH')
    return path


def parent_fd(path):
    parts = canonical_path(path).split('/')[1:]
    need(parts and parts[-1], 'SOURCE_PATH')
    fd = os.open('/', DFLAGS)
    try:
        for part in parts[:-1]:
            child = os.open(part, DFLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd, parts[-1]
    except BaseException:
        os.close(fd)
        raise


def metadata(info):
    return {key: getattr(info, key) for key in dir(info)
            if key.startswith('st_') and isinstance(getattr(info, key), (int, float))}


def ro_runtime(row):
    path, roles = row['path'], row['roles']
    return (path.startswith(PYTHON_ROOT + '/lib/') and roles == ['original-Python-runtime-no-site-packages']
            or path == PYTHON_ROOT + '/bin/python3.12' and roles == ['historical-non-code-source']
            or path == NODE_FILE and roles == ['nodePin']
            or path in {'/usr/local/bin/' + name for name in (
                'docker', 'dockerd', 'containerd', 'containerd-shim-runc-v2', 'ctr',
                'docker-init', 'docker-proxy', 'runc')} and 'original-Docker28-distribution' in roles)


def open_regular(row):
    parent, name = parent_fd(row['path'])
    fd = None
    try:
        named = os.stat(name, dir_fd=parent, follow_symlinks=False)
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
        method = 'O_NOATIME'
        try:
            fd = os.open(name, flags | os.O_NOATIME, dir_fd=parent)
        except OSError as error:
            if error.errno not in (errno.EPERM, errno.EACCES) or not ro_runtime(row):
                raise
            fd = os.open(name, flags, dir_fd=parent)
            method = 'IMMUTABLE_READONLY_FD_EXCEPTION'
        before = os.fstat(fd)
        readonly = bool(os.fstatvfs(fd).f_flag & os.ST_RDONLY)
        need(method == 'O_NOATIME' or readonly, 'READONLY_EXCEPTION_NOT_PROVEN')
        need(metadata(named) == metadata(before) and stat.S_ISREG(before.st_mode)
             and before.st_size == row['bytes'] and before.st_uid == row['uid']
             and before.st_gid == row['gid'] and stat.S_IMODE(before.st_mode) == int(row['mode'], 8),
             'SOURCE_FILE_IDENTITY')
        return fd, parent, name, before, readonly, method
    except BaseException:
        if fd is not None:
            os.close(fd)
        os.close(parent)
        raise


def verify_regular(opened):
    fd, parent, name, before, readonly, method = opened
    after_readonly = bool(os.fstatvfs(fd).f_flag & os.ST_RDONLY)
    need(method == 'O_NOATIME' or readonly and after_readonly, 'READONLY_EXCEPTION_CHANGED')
    need(metadata(before) == metadata(os.fstat(fd)) == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)),
         'SOURCE_METADATA_CHANGED')


def read_noatime(path, limit):
    # Control files never use the managed-runtime exception.
    parent, name = parent_fd(str(path))
    fd = None
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= limit, 'CONTROL_FILE_SIZE_TYPE')
        raw = bytearray()
        while chunk := os.read(fd, min(65536, limit + 1 - len(raw))):
            raw.extend(chunk)
            need(len(raw) <= limit, 'CONTROL_FILE_SIZE_TYPE')
        need(metadata(before) == metadata(os.fstat(fd)) == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)),
             'CONTROL_FILE_CHANGED')
        return bytes(raw)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def validate_scope(raw):
    need(digest(raw) == SCOPE_SHA256, 'SCOPE_SHA256')
    scope = json_unique(raw)
    need(scope['schema'] == 'helmut-encrypted-transport-scope-v4', 'SCOPE_SCHEMA')
    files, extra = scope['items'], scope['pythonDirectoriesAndLinks']
    need(type(files) is list and len(files) == scope['regularFileCount'] == REGULAR_COUNT
         and type(extra) is list and len(extra) == PYTHON_METADATA_COUNT, 'SCOPE_COUNT')
    paths, members, total = set(), {'SOURCE_SCOPE.PRIVATE.json'}, 0
    for row in files:
        path = canonical_path(row['path'])
        need(row['archiveMember'] == 'files' + path and path not in paths
             and row['archiveMember'] not in members, 'DUPLICATE_OR_UNSAFE_MEMBER')
        need(type(row['bytes']) is int and 0 <= row['bytes'] <= REGULAR_BYTES
             and type(row['uid']) is int and row['uid'] >= 0
             and type(row['gid']) is int and row['gid'] >= 0
             and re.fullmatch(r'0o[0-7]{3}', row['mode']) is not None
             and re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is not None
             and type(row['roles']) is list, 'SCOPE_FILE_FIELDS')
        need(not set(path.split('/')) & {'.ssh', '.gnupg', '.aws', 'site-packages'}, 'OPERATOR_OR_EXCLUDED_PATH')
        paths.add(path)
        members.add(row['archiveMember'])
        total += row['bytes']
    need(total == scope['regularLogicalBytes'] == REGULAR_BYTES, 'SCOPE_BYTES')
    links = 0
    for row in extra:
        path = canonical_path(row['path'])
        need((path == PYTHON_ROOT + '/lib' or path.startswith(PYTHON_ROOT + '/lib/')) and path not in paths
             and 'files' + path not in members and row['type'] in ('directory', 'symlink')
             and row['statBefore'] == row['statAfter']
             and row['readonlyBefore'] is row['readonlyAfter'] is True
             and row['fullMetadataIncludingAtimeUnchanged'] is True
             and 'site-packages' not in path.split('/'), 'PYTHON_METADATA')
        if row['type'] == 'symlink':
            target = row['target']
            need(type(target) is str and target and not target.startswith('/')
                 and '..' not in target.split('/') and '\x00' not in target
                 and str(PurePosixPath(path).parent / target) in paths, 'PYTHON_LINK_TARGET')
            links += 1
        members.add('files' + path)
    need(links == PYTHON_LINK_COUNT, 'PYTHON_LINK_COUNT')
    return scope


def validate_recipient_inputs(response_path, response_sha, public_path):
    raw = read_noatime(response_path, 256 * 1024)
    need(re.fullmatch(r'[a-f0-9]{64}', response_sha) is not None and digest(raw) == response_sha,
         'RECIPIENT_RESPONSE_PIN')
    client_path = Path(__file__).with_name('hetzner-native-automation-client.py')
    client_raw = read_noatime(client_path, 128 * 1024)
    need(digest(client_raw) == CLIENT_SHA256, 'CLIENT_SOURCE_PIN')
    client = types.ModuleType('pinned_bundle_recipient_validator')
    exec(compile(client_raw, str(client_path), 'exec'), client.__dict__)
    response = json_unique(raw)
    need(response['operation'] == 'recipient' and response['payload_sha256'] == SERVER_SHA256,
         'RECIPIENT_RESPONSE_SOURCE')
    sent = client.request('recipient', response['plan_sha256'], response['payload_sha256'], response['nonce'])
    client.validate_response(raw, sent)
    recipient = response['result']['recipient']
    public = read_noatime(public_path, 64 * 1024)
    need(public == base64.b64decode(recipient['public_key_base64'], validate=True)
         and digest(public) == recipient['public_sha256'], 'RECIPIENT_PUBLIC_KEY_BINDING')
    return recipient['fingerprint'], public


def write_once(directory, name, value):
    raw = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
    try:
        offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:])
            need(count > 0, 'OUTPUT_SHORT_WRITE')
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(directory)


def fresh_output(path):
    parent, name = parent_fd(path)
    try:
        os.mkdir(name, 0o700, dir_fd=parent)
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC, dir_fd=parent)
        info = os.fstat(fd)
        need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'OUTPUT_OWNER_MODE')
        return fd
    finally:
        os.close(parent)


class Parts:
    def __init__(self, directory):
        self.directory, self.fd = directory, None
        self.parts, self.total, self.whole = [], 0, hashlib.sha256()
        self.part_size, self.part_hash, self.name = 0, None, None

    def _close_part(self):
        if self.fd is not None:
            try:
                os.fsync(self.fd)
            finally:
                os.close(self.fd)
                self.fd = None
            self.parts.append({'name': self.name, 'bytes': self.part_size, 'sha256': self.part_hash.hexdigest()})

    def write(self, raw):
        need(self.total + len(raw) <= MAX_CIPHER_BYTES, 'CIPHER_TOTAL_BOUND')
        offset = 0
        while offset < len(raw):
            if self.fd is None:
                self.name = 'SOURCE.tar.gz.gpg.part' + str(len(self.parts) + 1).zfill(4)
                self.fd = os.open(self.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                                  0o600, dir_fd=self.directory)
                self.part_size, self.part_hash = 0, hashlib.sha256()
            chunk = raw[offset:offset + min(PART_BYTES - self.part_size, 65536)]
            filesystem = os.fstatvfs(self.directory)
            need(filesystem.f_bavail * filesystem.f_frsize >= DISK_RESERVE_BYTES + len(chunk),
                 'OUTPUT_DISK_RESERVE')
            count = os.write(self.fd, chunk)
            need(count > 0, 'CIPHER_SHORT_WRITE')
            actual = chunk[:count]
            self.part_hash.update(actual)
            self.whole.update(actual)
            self.part_size += count
            self.total += count
            offset += count
            if self.part_size == PART_BYTES:
                self._close_part()
        return len(raw)

    def close(self):
        self._close_part()


def tool_error(directory, phase, code, error=None, prefix=b'', stderr_bytes=0, returncode=None):
    # Preserve the first bounded observation before terminating our own process.
    try:
        write_once(directory, 'GPG_FIRST_ERROR.PRIVATE.json', {
            'phase': phase, 'code': code, 'exceptionType': type(error).__name__ if error else None,
            'errno': getattr(error, 'errno', None), 'returncode': returncode,
            'stderrBytesObserved': stderr_bytes,
            'stderrPrefixBase64': base64.b64encode(bytes(prefix[:8192])).decode('ascii')})
    except BaseException:
        pass


def stop_process(process):
    if process is None:
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=5)


def public_recipient_file(public, directory):
    """Copy exact validated public bytes and return a pinned read-only FD.

    No keyring import or GPG process runs here. The child receives this same
    descriptor through --recipient-file; no later pathname lookup selects a key.
    The public copy remains in the fresh private output on every failure.
    """
    need(type(public) is bytes and 0 < len(public) <= 65536, 'PUBLIC_KEY_BYTES')
    name = 'RECIPIENT.PUBLIC.asc'
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=directory)
    try:
        offset = 0
        while offset < len(public):
            count = os.write(fd, public[offset:])
            need(count > 0, 'PUBLIC_KEY_COPY_SHORT_WRITE')
            offset += count
        os.fsync(fd)
        written = os.fstat(fd)
    finally:
        os.close(fd)
    os.fsync(directory)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=directory)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
             and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size == len(public)
             and metadata(before) == metadata(written), 'PUBLIC_KEY_COPY_IDENTITY')
        copied = bytearray()
        while len(copied) <= len(public):
            block = os.read(fd, min(65536, len(public) + 1 - len(copied)))
            if not block:
                break
            copied.extend(block)
        need(bytes(copied) == public and metadata(before) == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=directory, follow_symlinks=False)), 'PUBLIC_KEY_COPY_CHANGED')
        os.lseek(fd, 0, os.SEEK_SET)
        return fd
    except BaseException:
        os.close(fd)
        raise


class GPGEncryptor:
    def __init__(self, sink, output, fingerprint, public):
        self.process, self.readers = None, []
        self.errors, self.stderr_prefix, self.stderr_bytes = [], bytearray(), 0
        self.done = threading.Event()
        self.directory = sink.directory
        try:
            self._start(output, fingerprint, public, sink)
        except BaseException as error:
            tool_error(self.directory, 'encrypt-constructor', 'GPG_CONSTRUCTOR_FAILED', error,
                       self.stderr_prefix, self.stderr_bytes)
            try:
                self.close_failed()
            except BaseException:
                pass
            raise

    def _start(self, output, fingerprint, public, sink):
        home = str(Path(output) / 'public-gpg-home')
        os.mkdir(home, 0o700)
        common = ['/usr/bin/gpg', '--no-options', '--batch', '--no-tty', '--no-autostart',
                  '--homedir', home, '--no-default-keyring', '--no-auto-key-retrieve', '--auto-key-locate', 'clear']
        recipient_fd = public_recipient_file(public, self.directory)
        try:
            self.process = subprocess.Popen([*common, '--rfc4880', '--force-mdc', '--trust-model', 'always', '--cipher-algo', 'AES256',
                '--compress-algo', 'none', '--recipient-file', '/proc/self/fd/' + str(recipient_fd), '--output', '-', '--encrypt'],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env=ENV, start_new_session=True, close_fds=True, pass_fds=(recipient_fd,))
        finally:
            os.close(recipient_fd)
        def output_reader():
            try:
                while chunk := self.process.stdout.read(65536):
                    sink.write(chunk)
            except BaseException as error:
                self.errors.append(error)
                tool_error(self.directory, 'encrypt-output', 'GPG_OUTPUT_FAILED', error,
                           self.stderr_prefix, self.stderr_bytes)
                self.abort()
        def error_reader():
            try:
                while chunk := self.process.stderr.read(4096):
                    self.stderr_bytes += len(chunk)
                    self.stderr_prefix.extend(chunk[:max(0, 8192 - len(self.stderr_prefix))])
                    need(self.stderr_bytes <= 65536, 'GPG_STDERR_BOUND')
            except BaseException as error:
                self.errors.append(error)
                tool_error(self.directory, 'encrypt-stderr', 'GPG_STDERR_BOUND', error,
                           self.stderr_prefix, self.stderr_bytes)
                self.abort()
        def deadline():
            if not self.done.wait(3600):
                self.errors.append(Stop('GPG_DEADLINE'))
                tool_error(self.directory, 'encrypt-deadline', 'GPG_DEADLINE', prefix=self.stderr_prefix,
                           stderr_bytes=self.stderr_bytes)
                self.abort()
        self.readers = [threading.Thread(target=function, daemon=True) for function in (output_reader, error_reader)]
        for reader in self.readers:
            reader.start()
        threading.Thread(target=deadline, daemon=True).start()

    def write(self, raw):
        need(not self.errors, 'GPG_STREAM_FAILED')
        return self.process.stdin.write(raw)

    def abort(self):
        if self.process is None:
            return
        try:
            os.killpg(self.process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def finish(self):
        try:
            self.process.stdin.close()
            code = self.process.wait(timeout=30)
            for reader in self.readers:
                reader.join(timeout=5)
            need(not any(reader.is_alive() for reader in self.readers), 'GPG_STREAM_CLOSE')
            if self.errors:
                raise self.errors[0]
            need(code == 0, 'GPG_ENCRYPT_FAILED')
            self.process.stdout.close()
            self.process.stderr.close()
        except BaseException as error:
            tool_error(self.directory, 'encrypt-close', 'GPG_ENCRYPT_FAILED', error,
                       self.stderr_prefix, self.stderr_bytes)
            raise
        finally:
            self.done.set()

    def close_failed(self):
        self.done.set()
        try:
            stop_process(self.process)
        finally:
            for reader in self.readers:
                if reader.ident is not None:
                    reader.join(timeout=5)
            if self.process is not None:
                for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                    if stream is not None and not stream.closed:
                        stream.close()


class HashedSink:
    def __init__(self, output):
        self.output, self.hash, self.bytes = output, hashlib.sha256(), 0

    def write(self, raw):
        count = self.output.write(raw)
        need(count == len(raw), 'PLAINTEXT_SHORT_WRITE')
        self.hash.update(raw)
        self.bytes += count
        return count

    def flush(self):
        pass


class SourceReader:
    def __init__(self, fd):
        self.fd, self.hash, self.bytes = fd, hashlib.sha256(), 0

    def read(self, length):
        chunks, remaining = [], length
        while remaining:
            chunk = os.read(self.fd, min(65536, remaining))
            if not chunk:
                break
            self.hash.update(chunk)
            self.bytes += len(chunk)
            chunks.append(chunk)
            remaining -= len(chunk)
        return b''.join(chunks)


def tar_info(name, mode, uid=0, gid=0, mtime_ns=None):
    info = tarfile.TarInfo(name)
    info.mode, info.uid, info.gid, info.mtime = mode, uid, gid, 0
    info.uname = info.gname = ''
    if mtime_ns is not None:
        need(type(mtime_ns) is int, 'SOURCE_MTIME')
        info.mtime = mtime_ns // 1000000000
        seconds, fraction = divmod(abs(mtime_ns), 1000000000)
        info.pax_headers['mtime'] = ('-' if mtime_ns < 0 else '') + str(seconds) + '.' + str(fraction).zfill(9)
    return info


def pack(scope, raw, output):
    matched, total, metadata_count = 0, 0, 0
    with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0, compresslevel=6) as compressed:
        with tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            info = tar_info('SOURCE_SCOPE.PRIVATE.json', 0o600)
            info.size = len(raw)
            archive.addfile(info, io.BytesIO(raw))
            for row in scope['pythonDirectoriesAndLinks']:
                parent, name = parent_fd(row['path'])
                fd = None
                try:
                    fd = os.open(name, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
                    before = os.fstat(fd)
                    need(metadata(before) == row['statBefore'], 'PYTHON_METADATA_CHANGED')
                    info = tar_info('files' + row['path'], stat.S_IMODE(before.st_mode), before.st_uid, before.st_gid,
                                    before.st_mtime_ns)
                    if row['type'] == 'directory':
                        need(stat.S_ISDIR(before.st_mode), 'PYTHON_DIRECTORY_TYPE')
                        info.type = tarfile.DIRTYPE
                    else:
                        need(stat.S_ISLNK(before.st_mode) and bool(os.fstatvfs(fd).f_flag & os.ST_RDONLY),
                             'PYTHON_LINK_READONLY')
                        need(os.readlink('', dir_fd=fd) == row['target'], 'PYTHON_LINK_CHANGED')
                        info.type, info.linkname = tarfile.SYMTYPE, row['target']
                        need(bool(os.fstatvfs(fd).f_flag & os.ST_RDONLY), 'PYTHON_LINK_READONLY')
                    need(metadata(os.fstat(fd)) == row['statBefore']
                         == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'PYTHON_METADATA_CHANGED')
                    archive.addfile(info)
                    metadata_count += 1
                finally:
                    if fd is not None:
                        os.close(fd)
                    os.close(parent)
            for row in scope['items']:
                opened = open_regular(row)
                try:
                    source = SourceReader(opened[0])
                    info = tar_info(row['archiveMember'], int(row['mode'], 8), row['uid'], row['gid'],
                                    opened[3].st_mtime_ns)
                    info.size = row['bytes']
                    archive.addfile(info, source)
                    need(source.bytes == row['bytes'] and source.hash.hexdigest() == row['sha256'], 'SOURCE_HASH_MISMATCH')
                    verify_regular(opened)
                    matched += 1
                    total += source.bytes
                finally:
                    os.close(opened[0])
                    os.close(opened[1])
    return {'matchedRegularFiles': matched, 'matchedRegularBytes': total, 'matchedPythonMetadataEntries': metadata_count}


def publish_result(directory):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(directory, b'BUNDLE_RESULT.PENDING.SAFE.json', directory, b'BUNDLE_RESULT.SAFE.json', 1):
        raise OSError(ctypes.get_errno(), 'bundle-result-publication')


def build_bundle(scope_path, output, response_path, response_sha, public_path,
                 encryptor_factory=GPGEncryptor, recipient_validator=validate_recipient_inputs):
    directory, parts, encryptor, stage = None, None, None, 'fresh-output'
    try:
        directory = fresh_output(output)
        write_once(directory, 'BUNDLE_ATTEMPT.SAFE.json', {'schema': 'helmut-source-bundle-attempt-v1', 'scope_sha256': SCOPE_SHA256})
        stage = 'scope'
        raw = read_noatime(scope_path, MAX_SCOPE_BYTES)
        scope = validate_scope(raw)
        stage = 'recipient'
        fingerprint, public = recipient_validator(response_path, response_sha, public_path)
        need(type(fingerprint) is str and re.fullmatch(r'[A-F0-9]{40}', fingerprint), 'RECIPIENT_FINGERPRINT')
        parts = Parts(directory)
        stage = 'encrypt-pack'
        encryptor = encryptor_factory(parts, output, fingerprint, public)
        plaintext = HashedSink(encryptor)
        matched = pack(scope, raw, plaintext)
        stage = 'encrypt-close'
        encryptor.finish()
        parts.close()
        need(parts.total > 0 and len(parts.parts) <= MAX_CIPHER_BYTES // PART_BYTES, 'EMPTY_OR_EXCESSIVE_CIPHER')
        result = {'schema': 'helmut-source-encrypted-bundle-v1', 'status': 'ENCRYPTED_SCOPE_COMPLETE',
            'scope_sha256': digest(raw), 'recipient_fingerprint': fingerprint,
            'recipient_response_sha256': response_sha, 'cipher': 'AES256', 'gpgCompression': 'none',
            'archive': 'tar+gzip', 'compressedTarSHA256': plaintext.hash.hexdigest(),
            'compressedTarBytes': plaintext.bytes, 'cipherSHA256': parts.whole.hexdigest(),
            'cipherBytes': parts.total, 'parts': parts.parts, **matched,
            'transferPerformed': False, 'targetRestored': False, 'nativeStarted': False}
        stage = 'result'
        write_once(directory, 'BUNDLE_RESULT.PENDING.SAFE.json', result)
        publish_result(directory)
        return result
    except BaseException as error:
        if encryptor is not None:
            try:
                encryptor.close_failed()
            except BaseException:
                pass
        if parts is not None:
            try:
                parts.close()
            except BaseException:
                pass
        if directory is not None:
            observed = str(error) if isinstance(error, Stop) else None
            code = observed if observed and re.fullmatch(r'[A-Z0-9_]{1,96}', observed) else 'BUNDLE_FAILED'
            record = {'status': 'FAIL_KEEP_PARTIALS_NO_RETRY', 'stage': stage, 'code': code,
                'exceptionType': type(error).__name__, 'errno': getattr(error, 'errno', None),
                'cipherBytesWritten': parts.total if parts is not None else 0}
            if encryptor is not None and hasattr(encryptor, 'stderr_prefix'):
                record['toolStderrPrefixBase64'] = base64.b64encode(bytes(encryptor.stderr_prefix[:2048])).decode('ascii')
            try:
                write_once(directory, 'BUNDLE_FIRST_ERROR.PRIVATE.json', record)
            except BaseException:
                pass
        raise
    finally:
        if directory is not None:
            try:
                os.close(directory)
            except OSError:
                pass


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] != FLAG:
        print('source-bundle: NOT_EXECUTED_EXPLICIT_ONCE_FLAG_REQUIRED')
        return 2
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('scope', 'output', 'recipient-response', 'recipient-response-sha256', 'recipient-public-key'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(argv[1:])
    try:
        result = build_bundle(args.scope, args.output, args.recipient_response,
                              args.recipient_response_sha256, args.recipient_public_key)
        print('source-bundle: ENCRYPTED_SCOPE_COMPLETE ' + result['cipherSHA256'])
        return 0
    except BaseException:
        print('source-bundle: FAILED_KEEP_PARTIALS_NO_RETRY', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
