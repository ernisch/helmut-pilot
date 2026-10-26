"""Bounded byte restoration into one fresh private tree; no execution authority."""
import hashlib as _sr_hashlib
import ctypes as _sr_ctypes
import json as _sr_json
import os as _sr_os
import posixpath as _sr_path
import re as _sr_re
import stat as _sr_stat
import sys as _sr_sys
import zlib as _sr_zlib

_SR_SCOPE_SHA256 = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
_SR_FILE_CAP = 1767
_SR_BYTE_CAP = 2865680705
_SR_META_CAP = 99
_SR_STREAM_CAP = 3 * 1024**3
_SR_SCOPE_CAP = 2 * 1024**2
_SR_PAX_CAP = 65536
_SR_FLAGS = (_sr_os.O_RDONLY | _sr_os.O_NOFOLLOW | _sr_os.O_NOATIME |
             _sr_os.O_NONBLOCK | _sr_os.O_CLOEXEC)
_SR_DIR = _SR_FLAGS | _sr_os.O_DIRECTORY
_SR_PATH_DIR = _sr_os.O_PATH | _sr_os.O_DIRECTORY | _sr_os.O_NOFOLLOW | _sr_os.O_CLOEXEC


class _SRStop(Exception):
    pass


def _sr_need(value, code):
    if not value:
        raise _SRStop(code)


def _sr_owned(info):
    return info.st_uid == info.st_gid == 0


def _sr_admin():
    _sr_need(_sr_os.getuid() == _sr_os.geteuid() == _sr_os.getgid() == _sr_os.getegid() == 0, 'ROOT_REQUIRED')


def _sr_pathcheck(path, absolute=False):
    _sr_need(type(path) is str and bool(path) and len(path.encode('utf8')) <= 4096
             and not any(ord(c) < 32 or c == '\\' for c in path), 'PATH_FORMAT')
    _sr_need(path.startswith('/') == absolute and _sr_path.normpath(path) == path
             and '..' not in path.split('/') and '.' not in path.split('/'), 'PATH_ESCAPE')
    return path


def _sr_parent(path):
    _sr_pathcheck(path, True)
    descriptor = _sr_os.open('/', _SR_PATH_DIR)
    readable = None
    try:
        for part in path.split('/')[1:-1]:
            child = _sr_os.open(part, _SR_PATH_DIR, dir_fd=descriptor)
            _sr_os.close(descriptor)
            descriptor = child
            info = _sr_os.fstat(descriptor)
            _sr_need(_sr_stat.S_ISDIR(info.st_mode) and _sr_owned(info)
                     and not _sr_stat.S_IMODE(info.st_mode) & 0o022, 'UNTRUSTED_PARENT')
        readable = _sr_os.open('.', _SR_DIR, dir_fd=descriptor)
        _sr_need(_sr_os.fstat(readable) == _sr_os.fstat(descriptor), 'PARENT_CHANGED')
        _sr_os.close(descriptor)
        return readable, path.split('/')[-1]
    except BaseException:
        if readable is not None:
            _sr_os.close(readable)
        _sr_os.close(descriptor)
        raise


def _sr_metadata(descriptor, uid, gid, mode):
    _sr_os.fchown(descriptor, uid, gid)
    _sr_os.fchmod(descriptor, mode)


def _sr_link_metadata(parent, name, uid, gid):
    _sr_os.chown(name, uid, gid, dir_fd=parent, follow_symlinks=False)


def _sr_directory(root, parts):
    descriptor = _sr_os.dup(root)
    try:
        for part in parts:
            created = False
            try:
                _sr_os.mkdir(part, 0o755, dir_fd=descriptor)
                created = True
            except FileExistsError:
                pass
            child = _sr_os.open(part, _SR_DIR, dir_fd=descriptor)
            if created:
                _sr_os.fchmod(child, 0o755)
                _sr_os.fsync(child)
                _sr_os.fsync(descriptor)
            _sr_os.close(descriptor)
            descriptor = child
            _sr_need(_sr_stat.S_ISDIR(_sr_os.fstat(descriptor).st_mode), 'DESTINATION_DIRECTORY')
        return descriptor
    except BaseException:
        _sr_os.close(descriptor)
        raise


def _sr_write(descriptor, data):
    position = 0
    while position < len(data):
        written = _sr_os.write(descriptor, data[position:])
        _sr_need(written > 0, 'SHORT_WRITE')
        position += written


def _sr_new(root, name, data):
    descriptor = _sr_os.open(name, _sr_os.O_WRONLY | _sr_os.O_CREAT | _sr_os.O_EXCL |
                             _sr_os.O_NOFOLLOW | _sr_os.O_CLOEXEC, 0o600, dir_fd=root)
    try:
        _sr_os.fchmod(descriptor, 0o600)
        _sr_write(descriptor, data)
        _sr_os.fsync(descriptor)
    finally:
        _sr_os.close(descriptor)
    _sr_os.fsync(root)


def _sr_json_bytes(value):
    return _sr_json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii') + b'\n'


def _sr_publish_receipt(root):
    library = _sr_ctypes.CDLL(None, use_errno=True)
    rename = library.renameat2
    rename.argtypes = (_sr_ctypes.c_int, _sr_ctypes.c_char_p, _sr_ctypes.c_int,
                       _sr_ctypes.c_char_p, _sr_ctypes.c_uint)
    rename.restype = _sr_ctypes.c_int
    if rename(root, b'RESTORE_RECEIPT.PENDING.PRIVATE.json', root,
              b'RESTORE_RECEIPT.PRIVATE.json', 1) != 0:
        raise OSError(_sr_ctypes.get_errno(), 'receipt-publication-failed')


def _sr_json_load(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _sr_need(key not in result, 'JSON_DUPLICATE')
            result[key] = value
        return result
    def constant(value):
        raise _SRStop('JSON_CONSTANT')
    return _sr_json.loads(raw, object_pairs_hook=unique, parse_constant=constant)


class _SRGzip:
    def __init__(self, descriptor):
        self.fd, self.pending, self.count, self.compressed, self.eof = descriptor, b'', 0, 0, False
        self.decoder = _sr_zlib.decompressobj(31)

    def read(self, size):
        result = bytearray()
        while len(result) < size and not self.eof:
            if self.decoder.eof:
                _sr_need(not self.decoder.unused_data and not self.pending
                         and not _sr_os.read(self.fd, 1), 'GZIP_TRAILING_BYTES')
                self.eof = True
                break
            if not self.pending:
                self.pending = _sr_os.read(self.fd, 65536)
                _sr_need(self.pending, 'GZIP_TRUNCATED')
                self.compressed += len(self.pending)
                _sr_need(self.compressed <= _SR_STREAM_CAP, 'GZIP_INPUT_LIMIT')
            block = self.decoder.decompress(self.pending, min(size - len(result), 65536))
            self.pending = self.decoder.unconsumed_tail
            self.count += len(block)
            _sr_need(self.count <= _SR_STREAM_CAP, 'TAR_TOTAL_LIMIT')
            result.extend(block)
        return bytes(result)

    def exact(self, size):
        result = self.read(size)
        _sr_need(len(result) == size, 'TAR_TRUNCATED')
        return result

    def padding(self, size):
        _sr_need(not any(self.exact((-size) % 512)), 'TAR_NONZERO_PADDING')


def _sr_number(raw):
    value = raw.strip(b'\0 ')
    _sr_need(not value or _sr_re.fullmatch(b'[0-7]+', value), 'TAR_NUMBER')
    return int(value or b'0', 8)


def _sr_text(raw):
    return raw.split(b'\0', 1)[0].decode('utf8')


def _sr_mtime(value):
    match = _sr_re.fullmatch(r'(-?)([0-9]{1,12})(?:\.([0-9]{1,9}))?', value)
    _sr_need(match is not None, 'PAX_MTIME')
    nanoseconds = int(match[2]) * 10**9 + int((match[3] or '').ljust(9, '0'))
    if match[1]:
        nanoseconds = -nanoseconds
    _sr_need(-2**63 <= nanoseconds < 2**63, 'PAX_MTIME')
    return nanoseconds


def _sr_header(raw):
    _sr_need(raw[257:265] == b'ustar\x0000', 'TAR_FORMAT')
    _sr_need(_sr_number(raw[148:156]) == sum(raw[:148] + b' ' * 8 + raw[156:]), 'TAR_CHECKSUM')
    name, prefix = _sr_text(raw[:100]), _sr_text(raw[345:500])
    return {'name': (prefix + '/' if prefix else '') + name, 'kind': raw[156:157],
            'mode': _sr_number(raw[100:108]), 'uid': _sr_number(raw[108:116]),
            'gid': _sr_number(raw[116:124]), 'size': _sr_number(raw[124:136]),
            'link': _sr_text(raw[157:257]), 'mtime_ns': _sr_mtime(str(_sr_number(raw[136:148])))}


def _sr_pax(raw):
    values, position = {}, 0
    while position < len(raw):
        space = raw.find(b' ', position, position + 12)
        _sr_need(space > position and _sr_re.fullmatch(b'[1-9][0-9]*', raw[position:space]), 'PAX_LENGTH')
        length = int(raw[position:space])
        record = raw[space + 1:position + length]
        _sr_need(length <= len(raw) - position and record.endswith(b'\n') and b'=' in record, 'PAX_RECORD')
        key, value = record[:-1].split(b'=', 1)
        _sr_need(key in (b'path', b'mtime') and key not in values, 'PAX_KEY')
        values[key] = value.decode('utf8')
        if key == b'path':
            _sr_pathcheck(values[key])
        else:
            values[key] = _sr_mtime(values[key])
        position += length
    return values


def _sr_scope(raw):
    _sr_need(_sr_hashlib.sha256(raw).hexdigest() == _SR_SCOPE_SHA256, 'SCOPE_HASH')
    scope = _sr_json_load(raw)
    _sr_need(scope['schema'] == 'helmut-encrypted-transport-scope-v4'
             and len(scope['items']) == scope['regularFileCount'] <= _SR_FILE_CAP
             and len(scope['pythonDirectoriesAndLinks']) <= _SR_META_CAP, 'SCOPE_COUNTS')
    selected, total = {}, 0
    for row in scope['items']:
        path = _sr_pathcheck(row['path'], True)
        name = _sr_pathcheck(row['archiveMember'])
        _sr_need(name == 'files' + path and name not in selected and type(row['bytes']) is int
                 and row['bytes'] >= 0 and _sr_re.fullmatch('[0-9a-f]{64}', row['sha256']), 'SCOPE_FILE')
        selected[name] = dict(kind=b'0', size=row['bytes'], sha256=row['sha256'],
                              mode=int(row['mode'], 8), uid=row['uid'], gid=row['gid'])
        total += row['bytes']
    _sr_need(total == scope['regularLogicalBytes'] <= _SR_BYTE_CAP, 'SCOPE_BYTES')
    for row in scope['pythonDirectoriesAndLinks']:
        name = 'files' + _sr_pathcheck(row['path'], True)
        _sr_need(name not in selected and row['type'] in ('directory', 'symlink'), 'SCOPE_METADATA')
        info = row['statBefore']
        record = dict(kind=b'5' if row['type'] == 'directory' else b'2', size=0,
                      mode=_sr_stat.S_IMODE(info['st_mode']), uid=info['st_uid'], gid=info['st_gid'])
        if 'st_mtime_ns' in info:
            _sr_need(type(info['st_mtime_ns']) is int and -2**63 <= info['st_mtime_ns'] < 2**63, 'SCOPE_METADATA')
            record['mtime_ns'] = info['st_mtime_ns']
        if row['type'] == 'symlink':
            target = _sr_pathcheck(row['target'])
            resolved = _sr_path.normpath(_sr_path.join(_sr_path.dirname(name), target))
            _sr_need(resolved in selected and selected[resolved]['kind'] == b'0', 'SCOPE_LINK_TARGET')
            record['link'] = target
        selected[name] = record
    for name, row in selected.items():
        _sr_need(type(row['uid']) is int and 0 <= row['uid'] < 2**32 - 1
                 and type(row['gid']) is int and 0 <= row['gid'] < 2**32 - 1
                 and 0 <= row['mode'] <= 0o777, 'SCOPE_METADATA')
        prefix = _sr_path.dirname(name)
        while prefix:
            _sr_need(prefix not in selected or selected[prefix]['kind'] == b'5', 'SCOPE_PARENT_TYPE')
            prefix = _sr_path.dirname(prefix)
    return scope, selected


def restore_bound_archive(gzip_tar_path, fresh_own_output_root):
    """Restore one pinned archive; retain every partial file and never retry."""
    _sr_admin()
    input_parent = output_parent = source = root = None
    receipt = {'schema': 'helmut-bound-byte-restore-v1', 'ok': False, 'status': 'FAIL_KEEP_STATE_NO_RETRY',
               'scope_sha256': _SR_SCOPE_SHA256, 'native_qualified': False, 'actual_files': [],
               'actual_bytes': 0, 'remaining_entries': None, 'partial_file_state': 'NONE',
               'metadata_state': 'UNKNOWN', 'unverified_entries': None}
    receipt['mtime_binding'] = 'AUTHORIZED_ARCHIVE_HEADER_OR_PAX_NOT_A_HISTORICAL_ALL_INPUT_MTIME_PIN'
    verified, selected = set(), None
    try:
        input_parent, input_name = _sr_parent(gzip_tar_path)
        named = _sr_os.stat(input_name, dir_fd=input_parent, follow_symlinks=False)
        _sr_need(_sr_stat.S_ISREG(named.st_mode) and _sr_owned(named) and named.st_nlink == 1
                 and _sr_stat.S_IMODE(named.st_mode) == 0o600 and 0 < named.st_size <= _SR_STREAM_CAP,
                 'INPUT_IDENTITY')
        source = _sr_os.open(input_name, _SR_FLAGS, dir_fd=input_parent)
        original = _sr_os.fstat(source)
        _sr_need(original == named, 'INPUT_CHANGED')
        stream, seen, pending, selected = _SRGzip(source), set(), None, None
        links, directories = [], []
        while True:
            raw = stream.exact(512)
            if raw == b'\0' * 512:
                _sr_need(stream.exact(512) == raw and pending is None, 'TAR_END')
                padding = (-stream.count) % 10240
                tail = stream.read(10241)
                _sr_need(len(tail) in (0, padding) and not any(tail) and stream.eof, 'TAR_TRAILING_BYTES')
                break
            header = _sr_header(raw)
            if header['kind'] == b'x':
                _sr_need(pending is None and 0 < header['size'] <= _SR_PAX_CAP, 'PAX_LIMIT')
                pending = _sr_pax(stream.exact(header['size']))
                stream.padding(header['size'])
                continue
            _sr_need(header['kind'] in (b'0', b'5', b'2'), 'TAR_ENTRY_TYPE')
            name = _sr_pathcheck((pending or {}).get(b'path', header['name']).rstrip('/')
                                 if header['kind'] == b'5' else (pending or {}).get(b'path', header['name']))
            if pending and b'mtime' in pending:
                header['mtime_ns'] = pending[b'mtime']
            pending = None
            if selected is None:
                _sr_need(name == 'SOURCE_SCOPE.PRIVATE.json' and header['kind'] == b'0'
                         and 0 < header['size'] <= _SR_SCOPE_CAP, 'SCOPE_FIRST')
                scope_raw = stream.exact(header['size'])
                stream.padding(header['size'])
                scope, selected = _sr_scope(scope_raw)
                output_parent, output_name = _sr_parent(fresh_own_output_root)
                _sr_os.mkdir(output_name, 0o700, dir_fd=output_parent)
                root = _sr_os.open(output_name, _SR_DIR, dir_fd=output_parent)
                _sr_os.fchmod(root, 0o700)
                _sr_os.fsync(output_parent)
                _sr_new(root, 'SOURCE_SCOPE.PRIVATE.json', scope_raw)
                receipt['remaining_entries'] = len(selected)
                continue
            _sr_need(name in selected and name not in seen, 'TAR_EXTRA_OR_DUPLICATE')
            expected = selected[name]
            _sr_need(all(header[key] == expected[key] for key in ('kind', 'size', 'mode', 'uid', 'gid'))
                     and header['link'] == expected.get('link', ''), 'TAR_METADATA')
            _sr_need('mtime_ns' not in expected or expected['mtime_ns'] == header['mtime_ns'], 'TAR_METADATA')
            expected = dict(expected, mtime_ns=header['mtime_ns'])
            seen.add(name)
            parts = name.split('/')
            if header['kind'] == b'0':
                parent = _sr_directory(root, parts[:-1])
                descriptor = None
                try:
                    descriptor = _sr_os.open(parts[-1], _sr_os.O_RDWR | _sr_os.O_CREAT | _sr_os.O_EXCL |
                        _sr_os.O_NOFOLLOW | _sr_os.O_NOATIME | _sr_os.O_CLOEXEC, 0o600, dir_fd=parent)
                    receipt['partial_file_state'] = 'UNKNOWN'
                    digest, remaining = _sr_hashlib.sha256(), expected['size']
                    while remaining:
                        block = stream.exact(min(remaining, 65536))
                        digest.update(block)
                        _sr_write(descriptor, block)
                        remaining -= len(block)
                    _sr_need(digest.hexdigest() == expected['sha256'], 'FILE_HASH')
                    stream.padding(expected['size'])
                    _sr_metadata(descriptor, expected['uid'], expected['gid'], expected['mode'])
                    info = _sr_os.fstat(descriptor)
                    _sr_need(_sr_stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                             and (info.st_size, info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==
                             (expected['size'], expected['uid'], expected['gid'], expected['mode']), 'RESTORED_FILE_METADATA')
                    _sr_os.fsync(descriptor)
                    _sr_os.lseek(descriptor, 0, _sr_os.SEEK_SET)
                    actual_digest, unread = _sr_hashlib.sha256(), expected['size']
                    while unread:
                        block = _sr_os.read(descriptor, min(unread, 65536))
                        _sr_need(block, 'RESTORED_FILE_TRUNCATED')
                        actual_digest.update(block)
                        unread -= len(block)
                    _sr_need(not _sr_os.read(descriptor, 1) and actual_digest.hexdigest() == expected['sha256']
                             and _sr_os.fstat(descriptor) == info ==
                             _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False), 'RESTORED_FILE_HASH')
                    _sr_os.utime(descriptor, ns=(info.st_atime_ns, expected['mtime_ns']))
                    stamped = _sr_os.fstat(descriptor)
                    _sr_need(stamped.st_mtime_ns == expected['mtime_ns'] and stamped.st_atime_ns == info.st_atime_ns
                             and (stamped.st_mode, stamped.st_uid, stamped.st_gid, stamped.st_size) ==
                             (info.st_mode, info.st_uid, info.st_gid, info.st_size)
                             and stamped == _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False), 'RESTORED_MTIME')
                    info = stamped
                    _sr_os.fsync(descriptor)
                    _sr_os.fsync(parent)
                finally:
                    if descriptor is not None: _sr_os.close(descriptor)
                    _sr_os.close(parent)
                receipt['actual_files'].append({'archiveMember': name, 'bytes': expected['size'],
                    'sha256': actual_digest.hexdigest(), 'mode': oct(info.st_mode & 0o777), 'uid': info.st_uid, 'gid': info.st_gid})
                receipt['actual_files'][-1]['mtime_ns'] = info.st_mtime_ns
                receipt['actual_bytes'] += expected['size']
                verified.add(name)
                receipt['partial_file_state'] = 'NONE'
            elif header['kind'] == b'5':
                directories.append((name, expected))
                descriptor = _sr_directory(root, parts)
                _sr_os.close(descriptor)
            else:
                links.append((name, expected))
            receipt['remaining_entries'] = len(selected) - len(seen)
        _sr_need(selected is not None and seen == set(selected), 'TAR_MISSING_ENTRIES')
        _sr_need(_sr_os.fstat(source) == original, 'INPUT_CHANGED')
        for name, expected in links:
            receipt['partial_file_state'] = 'UNKNOWN'
            parts = name.split('/')
            parent = _sr_directory(root, parts[:-1])
            try:
                _sr_os.symlink(expected['link'], parts[-1], dir_fd=parent)
                _sr_link_metadata(parent, parts[-1], expected['uid'], expected['gid'])
                info = _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
                _sr_need(_sr_os.readlink(parts[-1], dir_fd=parent) == expected['link'], 'RESTORED_LINK_METADATA')
                _sr_os.utime(parts[-1], ns=(info.st_atime_ns, expected['mtime_ns']),
                             dir_fd=parent, follow_symlinks=False)
                info = _sr_os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
                _sr_need(_sr_stat.S_ISLNK(info.st_mode) and info.st_nlink == 1 and
                    (info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==
                    (expected['uid'], expected['gid'], expected['mode'])
                    and info.st_mtime_ns == expected['mtime_ns'], 'RESTORED_LINK_METADATA')
                _sr_os.fsync(parent)
                verified.add(name)
                receipt['partial_file_state'] = 'NONE'
            finally:
                _sr_os.close(parent)
        for name, expected in sorted(directories, key=lambda row: row[0].count('/'), reverse=True):
            receipt['partial_file_state'] = 'UNKNOWN'
            descriptor = _sr_directory(root, name.split('/'))
            try:
                _sr_metadata(descriptor, expected['uid'], expected['gid'], expected['mode'])
                info = _sr_os.fstat(descriptor)
                _sr_os.utime(descriptor, ns=(info.st_atime_ns, expected['mtime_ns']))
                info = _sr_os.fstat(descriptor)
                _sr_need((info.st_uid, info.st_gid, _sr_stat.S_IMODE(info.st_mode)) ==
                         (expected['uid'], expected['gid'], expected['mode'])
                         and info.st_mtime_ns == expected['mtime_ns'], 'RESTORED_DIRECTORY_METADATA')
                _sr_os.fsync(descriptor)
                verified.add(name)
                receipt['partial_file_state'] = 'NONE'
            finally:
                _sr_os.close(descriptor)
        receipt.update(ok=True, status='BYTES_RESTORED_NOT_NATIVE_QUALIFIED',
                       gzip_bytes=stream.compressed, tar_bytes=stream.count, metadata_state='VERIFIED')
    except Exception as error:
        receipt['code'] = str(error) if isinstance(error, _SRStop) else 'FILESYSTEM_OR_FORMAT_FAILURE'
    receipt['actual_file_count'] = len(receipt['actual_files'])
    if selected is not None:
        receipt['unverified_entries'] = sorted(set(selected) - verified)
        receipt['remaining_entries'] = len(receipt['unverified_entries'])
    if root is not None:
        try:
            receipt_raw = _sr_json_bytes(receipt)
            _sr_new(root, 'RESTORE_RECEIPT.PENDING.PRIVATE.json', receipt_raw)
            _sr_publish_receipt(root)
        except Exception:
            receipt.update(ok=False, status='FAIL_KEEP_STATE_NO_RETRY', receipt_saved=False)
        else:
            receipt['receipt_saved'] = True
            receipt['receipt_sha256'] = _sr_hashlib.sha256(receipt_raw).hexdigest()
    for descriptor in (root, source, output_parent, input_parent):
        if descriptor is not None:
            try:
                _sr_os.close(descriptor)
            except OSError:
                if not receipt.get('receipt_saved'):
                    raise
    return receipt


if __name__ == '__main__':
    if len(_sr_sys.argv) != 4 or _sr_sys.argv[1] != '--restore-bound-archive-once':
        print('{"status":"NOT_EXECUTED_EXPLICIT_RESTORE_FLAG_REQUIRED"}')
        raise SystemExit(2)
    _sr_result = restore_bound_archive(_sr_sys.argv[2], _sr_sys.argv[3])
    print(_sr_json_bytes({key: value for key, value in _sr_result.items() if key != 'actual_files'}).decode('ascii'), end='')
    raise SystemExit(0 if _sr_result['ok'] else 1)
