#!/usr/bin/env python3
"""Inert, fixed-case local restore recovery. No transfer, service or native action.

The caller must supply the independently observed historical receipt hash and
run this synchronous component under the existing enclosing deadline watchdog.
This component alone cannot interrupt a blocked restore callable.
"""
import ctypes
import fcntl
import hashlib
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
OLD_SOURCE = '3262e1cf895daa03e0ef1a0a26c548f4d51f4e948273dd76dd4ff7543a20ea70'
RESTORE_SOURCE = 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'
CIPHER = '468610327368d51360815d18538ad0c3fcdc4d98825bb8bf0499daa96112ab3c'
GZIP_SHA = 'be423c617c14d92ed833c6e8a97c3a094eb70c23dc13b05b2c114c953f73b18a'
GZIP_SIZE, FILE_COUNT, TOTAL_BYTES, ENTRY_COUNT = 487052181, 1767, 2865680705, 1866
FLOOR = 8 * 1024**3
CASE_DIR = 'stage-' + CASE
OLD_FILES = ('once/' + PLAN + '.stage-case.json', 'STAGE_FIRST_ERROR.SAFE.json',
             CASE_DIR + '/restored/RESTORE_RECEIPT.PRIVATE.json')
INPUT = CASE_DIR + '/payload.tar.gz'
OUTPUT = CASE_DIR + '/restored-pax-recovery'
ATTEMPT = 'once/' + PLAN + '.pax-recovery.json'
ERROR = 'RESTORE_PAX_RECOVERY_FIRST_ERROR.SAFE.json'
PENDING = 'RESTORE_PAX_RECOVERY_READY.PENDING.SAFE.json'
READY = 'RESTORE_PAX_RECOVERY_READY.SAFE.json'
R = os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
D = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


class Stop(Exception):
    pass


def need(value, code):
    if not value:
        raise Stop(code)


def owner(info):
    return info.st_uid == info.st_gid == 0


def metadata(info):
    return tuple(getattr(info, name) for name in ('st_dev', 'st_ino', 'st_mode',
        'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns',
        'st_ctime_ns', 'st_rdev', 'st_blocks'))


def directory(path):
    need(path.startswith('/') and all(x not in ('', '.', '..') for x in path.split('/')[1:]), 'DIRECTORY_PATH')
    fd = os.open('/', D)
    try:
        for part in path.split('/')[1:]:
            child = os.open(part, D, dir_fd=fd)
            try:
                info = os.fstat(child)
                need(owner(info) and not stat.S_IMODE(info.st_mode) & 0o022, 'DIRECTORY_IDENTITY')
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def parent(relative):
    need(type(relative) is str and not relative.startswith('/')
         and all(x not in ('', '.', '..') for x in relative.split('/')), 'FIXED_PATH')
    path, _, name = relative.rpartition('/')
    return directory(BASE + ('/' + path if path else '')), name


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def parsed(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            need(key not in value, 'DUPLICATE_JSON')
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'JSON_CONSTANT'))


def capacity(deadline, extra=0):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'DEADLINE')
    value = os.statvfs(BASE)
    need(value.f_bavail * value.f_frsize >= FLOOR + extra, 'CAPACITY')


def read(relative, cap, deadline, digest_only=False):
    root, name = parent(relative)
    fd = None
    try:
        root_before = metadata(os.fstat(root))
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and owner(info) and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == 0o600 and 0 <= info.st_size <= cap, 'FILE_IDENTITY')
        before = metadata(info)
        data, total, digest = bytearray(), 0, hashlib.sha256()
        while True:
            capacity(deadline)
            block = os.read(fd, min(65536, cap + 1 - total))
            if not block:
                break
            total += len(block)
            need(total <= cap, 'FILE_LIMIT')
            digest.update(block)
            if not digest_only:
                data.extend(block)
        need(total == info.st_size and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             and root_before == metadata(os.fstat(root)), 'FILE_CHANGED')
        return (None if digest_only else bytes(data)), digest.hexdigest(), before
    finally:
        if fd is not None:
            os.close(fd)
        os.close(root)


def absent(relative):
    root, name = parent(relative)
    try:
        try:
            os.stat(name, dir_fd=root, follow_symlinks=False)
        except FileNotFoundError:
            return True
        return False
    finally:
        os.close(root)


def new(relative, value, deadline):
    raw = encoded(value)
    need(len(raw) <= 32768, 'RECEIPT_LIMIT')
    root, name = parent(relative)
    fd = sync = None
    try:
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root)
        at = 0
        while at < len(raw):
            count = os.write(fd, raw[at:])
            need(count > 0, 'SHORT_WRITE')
            at += count
        os.fsync(fd)
        os.close(fd)
        fd = None
        sync = os.open('.', R | os.O_DIRECTORY, dir_fd=root)
        os.fsync(sync)
        need(read(relative, 32768, deadline)[0] == raw, 'RECEIPT_READBACK')
    finally:
        if fd is not None:
            os.close(fd)
        if sync is not None:
            os.close(sync)
        os.close(root)
    return hashlib.sha256(raw).hexdigest()


def publish():
    root = directory(BASE)
    try:
        function = ctypes.CDLL(None, use_errno=True).renameat2
        function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        function.restype = ctypes.c_int
        need(function(root, PENDING.encode(), root, READY.encode(), 1) == 0, 'PUBLICATION')
    finally:
        os.close(root)


def historical(rows, expected):
    binding, error, receipt = (parsed(row[0]) for row in rows)
    need(type(expected) is str and re.fullmatch('[a-f0-9]{64}', expected)
         and rows[2][1] == expected, 'HISTORICAL_RECEIPT_HASH')
    need(type(binding) is dict and set(binding) == {'schema', 'nonce', 'source_sha256',
         'capsule_sha256', 'case_id', 'scope_sha256'}
         and binding['schema'] == 'helmut-private-drive-stage-case-binding-v1'
         and binding['source_sha256'] == OLD_SOURCE and binding['case_id'] == CASE
         and binding['scope_sha256'] == SCOPE
         and all(type(binding[k]) is str and re.fullmatch('[a-f0-9]{64}', binding[k])
                 for k in ('nonce', 'capsule_sha256')), 'HISTORICAL_BINDING')
    need(type(error) is dict and error.get('schema') == 'helmut-private-drive-stage-result-v1'
         and error.get('status') == 'FAIL_KEEP_STATE_NO_RETRY' and error.get('code') == 'STAGE_RESTORE'
         and error.get('native_qualified') is False and error.get('plan_sha256') == PLAN
         and error.get('case_id') == CASE and error.get('scope_sha256') == SCOPE
         and error.get('capsule_sha256') == binding['capsule_sha256']
         and error.get('cipher_sha256') == CIPHER and error.get('compressed_tar_sha256') == GZIP_SHA,
         'HISTORICAL_STAGE')
    need(type(receipt) is dict and receipt.get('schema') == 'helmut-bound-byte-restore-v1'
         and receipt.get('ok') is False and receipt.get('status') == 'FAIL_KEEP_STATE_NO_RETRY'
         and receipt.get('scope_sha256') == SCOPE and receipt.get('native_qualified') is False
         and receipt.get('code') == 'PATH_ESCAPE'
         and type(receipt.get('actual_file_count')) is int and receipt['actual_file_count'] == 0
         and type(receipt.get('actual_bytes')) is int and receipt['actual_bytes'] == 0
         and receipt.get('actual_files') == [] and receipt.get('metadata_state') == 'UNKNOWN'
         and receipt.get('partial_file_state') in ('NONE', 'UNKNOWN')
         and type(receipt.get('remaining_entries')) is int and receipt['remaining_entries'] == ENTRY_COUNT
         and type(receipt.get('unverified_entries')) is list
         and len(receipt['unverified_entries']) == ENTRY_COUNT, 'HISTORICAL_RESTORE')


def completed(receipt):
    need(type(receipt) is dict and receipt.get('schema') == 'helmut-bound-byte-restore-v1'
         and receipt.get('ok') is True and receipt.get('status') == 'BYTES_RESTORED_NOT_NATIVE_QUALIFIED'
         and receipt.get('native_qualified') is False and receipt.get('scope_sha256') == SCOPE
         and type(receipt.get('actual_file_count')) is int and receipt['actual_file_count'] == FILE_COUNT
         and type(receipt.get('actual_bytes')) is int and receipt['actual_bytes'] == TOTAL_BYTES
         and type(receipt.get('remaining_entries')) is int and receipt['remaining_entries'] == 0
         and receipt.get('unverified_entries') == [] and receipt.get('partial_file_state') == 'NONE'
         and receipt.get('metadata_state') == 'VERIFIED' and receipt.get('code') is None,
         'RESTORE_RECEIPT')
    files = receipt.get('actual_files')
    need(type(files) is list and len(files) == FILE_COUNT, 'RESTORE_RECEIPT')
    names, total = set(), 0
    for row in files:
        need(type(row) is dict and type(row.get('archiveMember')) is str
             and row['archiveMember'].startswith('files/') and row['archiveMember'] not in names
             and type(row.get('sha256')) is str and re.fullmatch('[a-f0-9]{64}', row['sha256'])
             and type(row.get('bytes')) is int and 0 <= row['bytes'] <= TOTAL_BYTES, 'RESTORE_RECEIPT')
        names.add(row['archiveMember'])
        total += row['bytes']
    need(total == TOTAL_BYTES, 'RESTORE_RECEIPT')


def recover(expected_old_receipt_sha256, restore_source_bytes, deadline):
    phase, reserved, writable = 'preflight', False, False
    guard = None
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'ROOT_REQUIRED')
        root = directory(BASE)
        try:
            need(stat.S_IMODE(os.fstat(root).st_mode) == 0o700, 'BASE_IDENTITY')
            before = metadata(os.fstat(root))
            guard = os.open('.', R | os.O_DIRECTORY, dir_fd=root)
            try:
                fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Stop('RECOVERY_BUSY') from None
            need(metadata(os.fstat(guard)) == before == metadata(os.fstat(root)), 'BASE_CHANGED')
        finally:
            os.close(root)
        need(all(absent(p) for p in (ATTEMPT, ERROR, PENDING, READY, OUTPUT)), 'ALREADY_ATTEMPTED')
        writable = True
        capacity(deadline, TOTAL_BYTES + 2 * 1024**2)
        need(type(restore_source_bytes) is bytes and hashlib.sha256(restore_source_bytes).hexdigest()
             == RESTORE_SOURCE, 'RESTORE_SOURCE_HASH')
        originals = [read(path, 1024**2, deadline) for path in OLD_FILES]
        historical(originals, expected_old_receipt_sha256)
        compressed = read(INPUT, GZIP_SIZE, deadline, True)
        need(compressed[1] == GZIP_SHA and compressed[2][6] == GZIP_SIZE, 'INPUT_HASH')
        namespace = {'__name__': 'helmut_bound_restore_component'}
        exec(compile(restore_source_bytes, '<reviewed-bound-restore>', 'exec'), namespace)
        need(callable(namespace.get('restore_bound_archive')), 'RESTORE_CALLABLE')
        capacity(deadline, TOTAL_BYTES + 2 * 1024**2)
        phase = 'reserve'
        reserved = None  # A failed create/write/readback may already have spent it.
        new(ATTEMPT, {'schema': 'helmut-local-pax-recovery-attempt-v1', 'case_id': CASE,
            'plan_sha256': PLAN, 'scope_sha256': SCOPE, 'historical_receipt_sha256': expected_old_receipt_sha256,
            'restore_source_sha256': RESTORE_SOURCE, 'state': 'UNKNOWN_NO_RETRY'}, deadline)
        reserved = True
        phase = 'restore'
        capacity(deadline, TOTAL_BYTES + 2 * 1024**2)
        result = namespace['restore_bound_archive'](BASE + '/' + INPUT, BASE + '/' + OUTPUT)
        capacity(deadline)
        need(type(result) is dict and result.get('ok') is True and result.get('receipt_saved') is True, 'RESTORE_FAILED')
        phase = 'verify'
        saved = read(OUTPUT + '/RESTORE_RECEIPT.PRIVATE.json', 1024**2, deadline)
        completed(parsed(saved[0]))
        need(result.get('receipt_sha256') == saved[1], 'RESTORE_RESULT_BINDING')
        need([read(path, 1024**2, deadline) for path in OLD_FILES] == originals, 'ORIGINAL_RECEIPTS_CHANGED')
        need(read(INPUT, GZIP_SIZE, deadline, True) == compressed, 'INPUT_CHANGED')
        capacity(deadline)
        value = {'schema': 'helmut-local-pax-recovery-ready-v1',
            'status': 'RESTORED_NOT_NATIVE_QUALIFIED', 'case_id': CASE, 'plan_sha256': PLAN,
            'scope_sha256': SCOPE, 'historical_stage_source_sha256': OLD_SOURCE,
            'historical_receipt_sha256': expected_old_receipt_sha256,
            'restore_source_sha256': RESTORE_SOURCE, 'compressed_tar_sha256': GZIP_SHA,
            'restore_receipt_sha256': saved[1], 'actual_file_count': FILE_COUNT,
            'actual_bytes': TOTAL_BYTES, 'metadata_state': 'VERIFIED',
            'native_qualified': False, 'native_go_consumed': False}
        phase = 'publish'
        new(PENDING, value, deadline)
        capacity(deadline)
        need(absent(ERROR), 'RECOVERY_CONFLICT')
        publish()
        return value
    except Exception as error:
        # An O_EXCL loser does not own this attempt and must not poison its
        # winner with a global error record. No restore was called by the loser.
        conflict = phase == 'reserve' and isinstance(error, FileExistsError)
        if conflict:
            reserved = False
        value = {'status': 'FAIL_KEEP_STATE_NO_RETRY', 'phase': phase,
            'code': 'ALREADY_ATTEMPTED' if conflict else
                    str(error) if type(error) is Stop else 'FILESYSTEM_OR_FORMAT_FAILURE',
            'exception_type': type(error).__name__, 'errno': getattr(error, 'errno', None),
            'recovery_once_reserved': reserved, 'native_qualified': False, 'native_go_consumed': False}
        if writable and not conflict:
            try:
                new(ERROR, value, time.monotonic() + 10)
            except Exception:
                pass
        return value
    finally:
        if guard is not None:
            os.close(guard)


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
