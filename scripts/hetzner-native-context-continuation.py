#!/usr/bin/env python3
"""Separate source-bound context continuation; no native execution authority.

Every mount runs in one own child, inside a held, independently private existing
daemon namespace. Parent observations stay outside that namespace. A receipt is
not authority to execute: daemon identity and all native gates must be fresh.
"""
import argparse
import ctypes
import grp
import hashlib
import http.client
import json
import os
from pathlib import PurePosixPath
import pwd
import re
import select
import selectors
import socket
import stat
import struct
import subprocess
import sys
import time

BASE = '/opt/helmut-native-test/docker28-context-20261026'
CONTROL = '/opt/helmut-native-test/automation-20261026'
SERVICE = 'helmut-native-docker28.service'
SOCKET = BASE + '/run/docker.sock'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
STAGE_SOURCE = '3262e1cf895daa03e0ef1a0a26c548f4d51f4e948273dd76dd4ff7543a20ea70'
COMMIT = '29b05ac0281347f8cde82b903b12f57e8cd5d8c9'
TREE = 'bf8551601236d89f30745d83020544e49482785f'
RECOVERY_CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
RECOVERY_SOURCE = 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'
RECOVERY_CIPHER = '468610327368d51360815d18538ad0c3fcdc4d98825bb8bf0499daa96112ab3c'
RECOVERY_GZIP = 'be423c617c14d92ed833c6e8a97c3a094eb70c23dc13b05b2c114c953f73b18a'
PREFIXES = ('helmut-cpu-epoch-20261015', 'helmut-hetzner-preparation-evidence-20261025',
            'helmut-parallel-20261015', 'helmut-ram-fix-20261020')
ANCHORS = ('/workspace', '/opt/codex', '/opt/helmut-public-pr942')
FLAG = '--prepare-native-context-once'
ATTEMPT = 'CONTEXT_DAEMON_BINDING_V2_ATTEMPT.SAFE.json'
ERROR = 'CONTEXT_DAEMON_BINDING_V2_FIRST_ERROR.PRIVATE.json'
CASE_PREFIX = 'native-context-daemon-binding-v2-'
DAEMON_BYTES = 79364736
DAEMON_SHA256 = 'ced6dbe1cc091efd959774db180954b9450d179acec042b6243b9f0772ecdd67'
DAEMON_LINK_BYTES = 49
DAEMON_LINK_SHA256 = '2392e12641e1e94be810449223d3e2d45a79677767742ba9803ecdb28816ddaa'
PFLAGS = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
RFLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC


class Stop(Exception):
    pass


def need(value, code):
    if not value:
        raise Stop(code)


def admin():
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'ROOT_REQUIRED')


def identity(info):
    return (info.st_dev, info.st_ino)


def namespace_identity(fd):
    buffer = ctypes.create_string_buffer(256)
    function = ctypes.CDLL(None, use_errno=True).fstatfs
    function.argtypes, function.restype = (ctypes.c_int, ctypes.c_void_p), ctypes.c_int
    need(function(fd, buffer) == 0 and ctypes.cast(buffer, ctypes.POINTER(ctypes.c_long))[0] == 0x6e736673
         and stat.S_ISREG(os.fstat(fd).st_mode), 'NAMESPACE_FD_NOT_NSFS')
    return list(identity(os.fstat(fd)))


def directory(path):
    need(type(path) is str and path.startswith('/') and str(PurePosixPath(path)) == path
         and '..' not in path.split('/'), 'DIRECTORY_PATH')
    fd = os.open('/', PFLAGS)
    try:
        for part in path.split('/')[1:]:
            if not part: continue
            child = os.open(part, PFLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
                 and not stat.S_IMODE(info.st_mode) & 0o022, 'DIRECTORY_OWNER_MODE')
        return fd
    except BaseException:
        os.close(fd)
        raise


def read(path, cap=65536):
    parent, name = path.rsplit('/', 1)
    root = directory(parent)
    fd = None
    try:
        fd = os.open(name, RFLAGS, dir_fd=root)
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
             and before.st_size <= cap, 'RECEIPT_IDENTITY')
        chunks, total = [], 0
        while block := os.read(fd, min(65536, cap + 1 - total)):
            total += len(block)
            need(total <= cap, 'RECEIPT_LIMIT')
            chunks.append(block)
        need(before == os.fstat(fd) == os.stat(name, dir_fd=root, follow_symlinks=False), 'RECEIPT_CHANGED')
        return b''.join(chunks)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(root)


def parse(raw):
    def pairs(rows):
        value = {}
        for key, item in rows:
            need(key not in value, 'DUPLICATE_FIELD')
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'JSON_CONSTANT'))


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def missing(path):
    try:
        os.stat(path, follow_symlinks=False)
    except FileNotFoundError:
        return True
    return False


def stage_proof(expected):
    need(re.fullmatch('[a-f0-9]{64}', expected), 'STAGE_EXPECTED_SHA')
    need(missing(CONTROL + '/STAGE_READY.PENDING.SAFE.json')
         and missing(CONTROL + '/STAGE_FIRST_ERROR.SAFE.json'), 'STAGE_UNKNOWN')
    raw = read(CONTROL + '/STAGE_READY.SAFE.json')
    need(sha(raw) == expected, 'STAGE_READY_HASH')
    ready = parse(raw)
    need(ready.get('status') == 'STAGE_READY_NOT_NATIVE_QUALIFIED'
         and ready.get('code') == 'STAGE_COMPLETE' and ready.get('native_qualified') is False
         and ready.get('plan_sha256') == PLAN and ready.get('scope_sha256') == SCOPE
         and ready.get('actual_file_count') == 1767 and ready.get('actual_bytes') == 2865680705
         and type(ready.get('case_id')) is str and re.fullmatch('[a-f0-9]{64}', ready['case_id']), 'STAGE_READY')
    case = CONTROL + '/stage-' + ready['case_id']
    receipt_raw = read(case + '/STAGE_RECEIPT.PRIVATE.json')
    need(sha(receipt_raw) == ready.get('receipt_sha256'), 'STAGE_RECEIPT_HASH')
    receipt = parse(receipt_raw)
    need(receipt.get('schema') == 'helmut-private-drive-stage-receipt-v1'
         and receipt.get('source_sha256') == STAGE_SOURCE and receipt.get('case_id') == ready['case_id']
         and receipt.get('scope_sha256') == SCOPE and receipt.get('native_qualified') is False
         and all(receipt.get(key) == ready.get(key) for key in (
             'capsule_sha256', 'cipher_sha256', 'compressed_tar_sha256', 'actual_file_count', 'actual_bytes')),
         'STAGE_RECEIPT_BINDING')
    restored_raw = read(case + '/restored/RESTORE_RECEIPT.PRIVATE.json', 1024**2)
    need(sha(restored_raw) == receipt.get('restore_receipt_sha256'), 'RESTORE_RECEIPT_HASH')
    restored = parse(restored_raw)
    need(restored.get('ok') is True and restored.get('status') == 'BYTES_RESTORED_NOT_NATIVE_QUALIFIED'
         and restored.get('scope_sha256') == SCOPE and restored.get('native_qualified') is False
         and restored.get('actual_file_count') == 1767 and restored.get('actual_bytes') == 2865680705
         and restored.get('metadata_state') == 'VERIFIED' and restored.get('remaining_entries') == 0
         and restored.get('unverified_entries') == [], 'RESTORE_RECEIPT')
    need(sha(read(case + '/restored/SOURCE_SCOPE.PRIVATE.json', 2 * 1024**2)) == SCOPE, 'RESTORE_SCOPE')
    need(missing(CONTROL + '/once/' + PLAN + '.json'), 'NATIVE_GO_ALREADY_CONSUMED')
    return {'case_id': ready['case_id'], 'ready_sha256': expected, 'root': case + '/restored/files'}


def full_metadata(info):
    # stat_result tuple equality does not compare the integer nanosecond fields.
    return [info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_atime_ns, info.st_mtime_ns, info.st_ctime_ns]


def recovery_read(path, cap=1024**2):
    parent, name = path.rsplit('/', 1)
    root, fd = directory(parent), None
    def metadata(info): return full_metadata(info) + [info.st_rdev, info.st_blocks]
    try:
        root_before = metadata(os.fstat(root))
        fd = os.open(name, RFLAGS, dir_fd=root)
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0
             and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
             and 0 < info.st_size <= cap, 'RECOVERY_FILE_IDENTITY')
        before, raw = metadata(info), bytearray()
        while block := os.read(fd, min(65536, cap + 1 - len(raw))):
            raw.extend(block)
            need(len(raw) <= cap, 'RECOVERY_FILE_LIMIT')
        need(len(raw) == info.st_size and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             and root_before == metadata(os.fstat(root)), 'RECOVERY_FILE_CHANGED')
        return bytes(raw)
    finally:
        if fd is not None: os.close(fd)
        os.close(root)


def recovery_stage_proof(expected, expected_old):
    need(type(expected) is str and re.fullmatch('[a-f0-9]{64}', expected)
         and type(expected_old) is str and re.fullmatch('[a-f0-9]{64}', expected_old), 'RECOVERY_EXPECTED_SHA')
    control = directory(CONTROL)
    try: need(stat.S_IMODE(os.fstat(control).st_mode) == 0o700, 'RECOVERY_CONTROL_MODE')
    finally: os.close(control)
    need(missing(CONTROL + '/RESTORE_PAX_RECOVERY_READY.PENDING.SAFE.json')
         and missing(CONTROL + '/RESTORE_PAX_RECOVERY_FIRST_ERROR.SAFE.json'), 'RECOVERY_UNKNOWN')
    raw = recovery_read(CONTROL + '/RESTORE_PAX_RECOVERY_READY.SAFE.json', 32768)
    need(sha(raw) == expected, 'RECOVERY_READY_HASH')
    ready = parse(raw)
    fixed = {'schema': 'helmut-local-pax-recovery-ready-v1', 'status': 'RESTORED_NOT_NATIVE_QUALIFIED',
        'case_id': RECOVERY_CASE, 'plan_sha256': PLAN, 'scope_sha256': SCOPE,
        'historical_stage_source_sha256': STAGE_SOURCE, 'historical_receipt_sha256': expected_old,
        'restore_source_sha256': RECOVERY_SOURCE, 'compressed_tar_sha256': RECOVERY_GZIP,
        'actual_file_count': 1767, 'actual_bytes': 2865680705, 'metadata_state': 'VERIFIED',
        'native_qualified': False, 'native_go_consumed': False}
    need(type(ready) is dict and set(ready) == set(fixed) | {'restore_receipt_sha256'}
         and all(type(ready[k]) is type(value) and ready[k] == value for k, value in fixed.items())
         and type(ready['restore_receipt_sha256']) is str
         and re.fullmatch('[a-f0-9]{64}', ready['restore_receipt_sha256']), 'RECOVERY_READY')
    attempt = parse(recovery_read(CONTROL + '/once/' + PLAN + '.pax-recovery.json', 32768))
    need(attempt == {'schema': 'helmut-local-pax-recovery-attempt-v1', 'case_id': RECOVERY_CASE,
        'plan_sha256': PLAN, 'scope_sha256': SCOPE, 'historical_receipt_sha256': expected_old,
        'restore_source_sha256': RECOVERY_SOURCE, 'state': 'UNKNOWN_NO_RETRY'}, 'RECOVERY_ATTEMPT')
    binding = parse(recovery_read(CONTROL + '/once/' + PLAN + '.stage-case.json'))
    need(type(binding) is dict and set(binding) == {'schema', 'nonce', 'source_sha256', 'capsule_sha256',
         'case_id', 'scope_sha256'} and binding['schema'] == 'helmut-private-drive-stage-case-binding-v1'
         and binding['source_sha256'] == STAGE_SOURCE and binding['case_id'] == RECOVERY_CASE
         and binding['scope_sha256'] == SCOPE and all(type(binding[k]) is str
             and re.fullmatch('[a-f0-9]{64}', binding[k]) for k in ('nonce', 'capsule_sha256')), 'RECOVERY_HISTORICAL_BINDING')
    error = parse(recovery_read(CONTROL + '/STAGE_FIRST_ERROR.SAFE.json'))
    need(type(error) is dict and error.get('schema') == 'helmut-private-drive-stage-result-v1'
         and error.get('status') == 'FAIL_KEEP_STATE_NO_RETRY' and error.get('code') == 'STAGE_RESTORE'
         and error.get('native_qualified') is False and error.get('plan_sha256') == PLAN
         and error.get('case_id') == RECOVERY_CASE and error.get('scope_sha256') == SCOPE
         and error.get('capsule_sha256') == binding['capsule_sha256']
         and error.get('cipher_sha256') == RECOVERY_CIPHER
         and error.get('compressed_tar_sha256') == RECOVERY_GZIP, 'RECOVERY_HISTORICAL_STAGE')
    case = CONTROL + '/stage-' + RECOVERY_CASE
    old_raw = recovery_read(case + '/restored/RESTORE_RECEIPT.PRIVATE.json')
    need(sha(old_raw) == expected_old, 'RECOVERY_HISTORICAL_RECEIPT_HASH')
    old = parse(old_raw)
    need(type(old) is dict and old.get('schema') == 'helmut-bound-byte-restore-v1'
         and old.get('ok') is False and old.get('status') == 'FAIL_KEEP_STATE_NO_RETRY'
         and old.get('scope_sha256') == SCOPE and old.get('native_qualified') is False
         and old.get('code') == 'PATH_ESCAPE' and type(old.get('actual_file_count')) is int
         and old['actual_file_count'] == 0 and type(old.get('actual_bytes')) is int and old['actual_bytes'] == 0
         and old.get('actual_files') == [] and old.get('metadata_state') == 'UNKNOWN'
         and old.get('partial_file_state') in ('NONE', 'UNKNOWN')
         and type(old.get('remaining_entries')) is int and old['remaining_entries'] == 1866
         and type(old.get('unverified_entries')) is list and len(old['unverified_entries']) == 1866,
         'RECOVERY_HISTORICAL_RESTORE')
    restored_raw = recovery_read(case + '/restored-pax-recovery/RESTORE_RECEIPT.PRIVATE.json')
    need(sha(restored_raw) == ready['restore_receipt_sha256'], 'RECOVERY_RESTORE_HASH')
    restored = parse(restored_raw)
    need(type(restored) is dict and restored.get('schema') == 'helmut-bound-byte-restore-v1'
         and restored.get('ok') is True and restored.get('status') == 'BYTES_RESTORED_NOT_NATIVE_QUALIFIED'
         and restored.get('native_qualified') is False and restored.get('scope_sha256') == SCOPE
         and type(restored.get('actual_file_count')) is int and restored['actual_file_count'] == 1767
         and type(restored.get('actual_bytes')) is int and restored['actual_bytes'] == 2865680705
         and type(restored.get('remaining_entries')) is int and restored['remaining_entries'] == 0
         and restored.get('unverified_entries') == [] and restored.get('partial_file_state') == 'NONE'
         and restored.get('metadata_state') == 'VERIFIED' and restored.get('code') is None,
         'RECOVERY_RESTORE')
    files = restored.get('actual_files')
    need(type(files) is list and len(files) == 1767, 'RECOVERY_RESTORE')
    names, total = set(), 0
    for row in files:
        need(type(row) is dict and type(row.get('archiveMember')) is str
             and row['archiveMember'].startswith('files/') and row['archiveMember'] not in names
             and type(row.get('sha256')) is str and re.fullmatch('[a-f0-9]{64}', row['sha256'])
             and type(row.get('bytes')) is int and 0 <= row['bytes'] <= 2865680705, 'RECOVERY_RESTORE')
        names.add(row['archiveMember']); total += row['bytes']
    need(total == 2865680705, 'RECOVERY_RESTORE')
    need(missing(CONTROL + '/once/' + PLAN + '.json'), 'NATIVE_GO_ALREADY_CONSUMED')
    return {'case_id': RECOVERY_CASE, 'ready_sha256': expected, 'root': case + '/restored-pax-recovery/files'}


def public_checkout(expected):
    need(type(expected) is str and re.fullmatch('[a-f0-9]{64}', expected), 'PUBLIC_EXPECTED_SHA')
    control = directory(CONTROL)
    parent = repo = receipt = None
    try:
        control_info = os.fstat(control)
        control_before = full_metadata(control_info)
        need(control_info.st_uid == control_info.st_gid == 0
             and stat.S_IMODE(control_info.st_mode) == 0o700, 'PUBLIC_CONTROL_MODE')
        for name in ('PUBLIC_CODE_PR942_RECEIPT.PENDING.SAFE.json', 'PUBLIC_CODE_PR942_FIRST_ERROR.PRIVATE.json'):
            try: os.stat(name, dir_fd=control, follow_symlinks=False)
            except FileNotFoundError: continue
            raise Stop('PUBLIC_CHECKOUT_UNKNOWN')
        name = 'PUBLIC_CODE_PR942_READY.SAFE.json'
        receipt = os.open(name, RFLAGS, dir_fd=control)
        before = os.fstat(receipt)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
             and 0 < before.st_size <= 16384, 'PUBLIC_RECEIPT_IDENTITY')
        raw = bytearray()
        while block := os.read(receipt, 16385 - len(raw)):
            raw.extend(block)
            need(len(raw) <= 16384, 'PUBLIC_RECEIPT_LIMIT')
        receipt_metadata = full_metadata(before)
        need(len(raw) == before.st_size and receipt_metadata == full_metadata(os.fstat(receipt))
             == full_metadata(os.stat(name, dir_fd=control, follow_symlinks=False)), 'PUBLIC_RECEIPT_CHANGED')
        need(sha(raw) == expected, 'PUBLIC_READY_HASH')
        ready = parse(raw)
        repository = CONTROL + '/public-code/pr942-29b05ac0'
        need(type(ready) is dict and set(ready) == {'schema', 'status', 'native_qualified', 'commit', 'tree',
             'repository', 'files', 'bytes', 'manifest_sha256'}
             and ready['schema'] == 'helmut-fixed-public-checkout-v1'
             and ready['status'] == 'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED'
             and ready['native_qualified'] is False and ready['commit'] == COMMIT and ready['tree'] == TREE
             and ready['repository'] == repository
             and type(ready['files']) is int and 0 < ready['files'] <= 30000
             and type(ready['bytes']) is int and 0 < ready['bytes'] <= 512 * 1024**2
             and type(ready['manifest_sha256']) is str and re.fullmatch('[a-f0-9]{64}', ready['manifest_sha256']),
             'PUBLIC_READY')
        parent = os.open('public-code', PFLAGS, dir_fd=control)
        parent_before = os.fstat(parent)
        need(stat.S_ISDIR(parent_before.st_mode) and parent_before.st_uid == parent_before.st_gid == 0
             and stat.S_IMODE(parent_before.st_mode) == 0o700, 'PUBLIC_PARENT_OWNER_MODE')
        # This sole fixed final directory has the checkout producer's UID/GID.
        # General directory and all mount-target guards remain root-only.
        repo = os.open('pr942-29b05ac0', PFLAGS, dir_fd=parent)
        repo_before = os.fstat(repo)
        need(stat.S_ISDIR(repo_before.st_mode) and repo_before.st_uid == repo_before.st_gid == 1000
             and stat.S_IMODE(repo_before.st_mode) == 0o700, 'PUBLIC_REPOSITORY_OWNER_MODE')
        proof = {'ready_sha256': expected, 'receipt': ready, 'receipt_metadata': receipt_metadata,
                 'control_metadata': control_before, 'parent_metadata': full_metadata(parent_before),
                 'repository_metadata': full_metadata(repo_before)}
        need(control_before == full_metadata(os.fstat(control))
             and proof['parent_metadata'] == full_metadata(os.fstat(parent))
             == full_metadata(os.stat('public-code', dir_fd=control, follow_symlinks=False))
             and proof['repository_metadata'] == full_metadata(os.fstat(repo))
             == full_metadata(os.stat('pr942-29b05ac0', dir_fd=parent, follow_symlinks=False)), 'PUBLIC_CHECKOUT_CHANGED')
        result, repo = repo, None
        return result, proof
    finally:
        for fd in (receipt, repo, parent, control):
            if fd is not None: os.close(fd)


def fresh_public(expected, held, proof):
    current, actual = public_checkout(expected)
    try:
        need(actual == proof and full_metadata(os.fstat(held)) == proof['repository_metadata'],
             'PUBLIC_CHECKOUT_CHANGED')
    finally: os.close(current)


def proc(path, cap=262144):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        data = os.read(fd, cap + 1)
        need(len(data) <= cap, 'PROC_LIMIT')
        return data.decode('ascii')
    finally:
        os.close(fd)


def private_propagation(text, required=True):
    rows = text.splitlines()
    need(0 < len(rows) <= 2048, 'MOUNTINFO_LIMIT')
    private = True
    for row in rows:
        fields = row.split()
        need('-' in fields and len(fields) >= 10, 'MOUNTINFO_FORMAT')
        optional = fields[6:fields.index('-')]
        private = private and not any(item.startswith(('shared:', 'master:', 'propagate_from:')) for item in optional)
    need(not required or private, 'DAEMON_PROPAGATION_NOT_PRIVATE')
    return private


def no_source_submounts(paths):
    for line in proc('/proc/self/mountinfo').splitlines():
        fields = line.split()
        need(len(fields) >= 10, 'MOUNTINFO_FORMAT')
        point = fields[4]
        need(not any(point == path or point.startswith(path + '/') for path in paths), 'SOURCE_SUBMOUNT')


def socket_facts(path=None):
    path = SOCKET if path is None else path
    before = os.stat(path, follow_symlinks=False)
    need(stat.S_ISSOCK(before.st_mode) and before.st_uid == 0 and before.st_gid == 1000
         and stat.S_IMODE(before.st_mode) == 0o660, 'SOCKET_UID1000_ACCESS')
    result = []
    for endpoint in ('/info', '/containers/json?all=1'):
        peer = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        peer.settimeout(3)
        connection = None
        try:
            peer.connect(path)
            credentials = struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
            need(credentials[0] > 0 and credentials[1:] == (0, 0), 'SOCKET_PEER')
            connection = http.client.HTTPConnection('localhost', timeout=3)
            connection.sock = peer
            connection.request('GET', endpoint, headers={'Connection': 'close'})
            response = connection.getresponse()
            data = response.read(65537)
            need(response.status == 200 and len(data) <= 65536, 'DOCKER_OBSERVATION')
            result.append((credentials, parse(data)))
        finally:
            if connection is not None:
                connection.close()
            else:
                peer.close()
    need(result[0][0] == result[1][0] and os.stat(path, follow_symlinks=False) == before, 'SOCKET_CHANGED')
    info, containers = result[0][1], result[1][1]
    need(info.get('ServerVersion') == '28.4.0' and info.get('Driver') == 'vfs'
         and info.get('CgroupDriver') == 'cgroupfs' and info.get('CgroupVersion') == '2'
         and type(info.get('Containers')) is int and info['Containers'] == 0
         and type(info.get('ContainersRunning')) is int and info['ContainersRunning'] == 0
         and containers == [], 'DOCKER_SCOPE')
    return result[0][0][0], identity(before)


def _service_fields():
    # This exact short metadata query is the sole allowed subprocess operation.
    query = ['/usr/bin/systemctl', 'show', SERVICE, '--no-pager',
             '--property=Id,ActiveState,SubState,MainPID,ControlGroup']
    process = subprocess.Popen(query, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
    output = bytearray()
    try:
        end = time.monotonic() + 3
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                left = end - time.monotonic()
                need(left > 0 and selector.select(left), 'SERVICE_DEADLINE')
                block = os.read(process.stdout.fileno(), 4097 - len(output))
                if not block: selector.unregister(process.stdout)
                else: output.extend(block)
                need(len(output) <= 4096, 'SERVICE_OUTPUT_LIMIT')
        need(process.wait(timeout=max(.01, end-time.monotonic())) == 0, 'SERVICE_OBSERVATION')
    finally:
        if process.poll() is None:
            process.kill(); process.wait(timeout=1)
        process.stdout.close()
    fields = dict(line.split('=', 1) for line in output.decode('ascii').splitlines())
    need(set(fields) == {'Id', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup'}
         and fields['Id'] == SERVICE and fields['ActiveState'] == 'active' and fields['SubState'] == 'running'
         and fields['MainPID'].isdigit() and int(fields['MainPID']) > 1
         and fields['ControlGroup'] == '/system.slice/' + SERVICE, 'SERVICE_IDENTITY')
    return fields


def _daemon_deadline(deadline):
    need(0 < deadline - time.monotonic() <= 30, 'DAEMON_OBSERVATION_DEADLINE')


def _held_proc(root, name, cap, deadline):
    _daemon_deadline(deadline)
    fd = os.open(name, RFLAGS, dir_fd=root)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0, 'DAEMON_OWNER')
        raw = os.read(fd, cap + 1)
        need(len(raw) <= cap and full_metadata(before) == full_metadata(os.fstat(fd)), 'DAEMON_PROC_CHANGED')
        return raw.decode('ascii')
    finally: os.close(fd)


def _process_binding(root, pid, namespace, host_namespace, deadline):
    status = dict(line.split(':', 1) for line in _held_proc(root, 'status', 65536, deadline).splitlines())
    need(status.get('Uid', '').split() == status.get('Gid', '').split() == ['0'] * 4, 'DAEMON_OWNER')
    need(_held_proc(root, 'comm', 64, deadline) == 'dockerd\n'
         and _held_proc(root, 'cgroup', 4096, deadline) == '0::/system.slice/' + SERVICE + '/daemon\n',
         'DAEMON_SERVICE_BINDING')
    raw = _held_proc(root, 'stat', 16384, deadline); tail = raw.rsplit(')', 1)[1].split()
    need(raw.startswith(str(pid) + ' (dockerd)') and len(tail) > 19
         and tail[0] in ('R','S','D','T','t','K','W','P','I') and tail[19].isdigit()
         and int(tail[19]) > 0, 'DAEMON_START')
    ns, host = namespace_identity(namespace), namespace_identity(host_namespace)
    need(ns != host and list(identity(os.stat('ns/mnt', dir_fd=root))) == ns
         and list(identity(os.stat('/proc/1/ns/mnt'))) == host, 'DAEMON_NAMESPACE_IS_HOST')
    link_info = os.stat('exe', dir_fd=root, follow_symlinks=False)
    need(stat.S_ISLNK(link_info.st_mode) and link_info.st_uid == link_info.st_gid == 0,
         'DAEMON_EXE_LINK_IDENTITY')
    link = os.fsencode(os.readlink('exe', dir_fd=root))
    need(len(link) == DAEMON_LINK_BYTES and sha(link) == DAEMON_LINK_SHA256
         and full_metadata(link_info) == full_metadata(os.stat('exe', dir_fd=root, follow_symlinks=False)),
         'DAEMON_EXE_LINK_BINDING')
    boot = proc('/proc/sys/kernel/random/boot_id', 64)
    need(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\n', boot), 'DAEMON_BOOT_ID')
    return {'pid':pid, 'start_ticks':int(tail[19]), 'namespace':ns, 'pid1_namespace':host,
            'boot_id':boot, 'exe_link_metadata':full_metadata(link_info),
            'proc_directory_metadata':full_metadata(os.fstat(root))}


def _verified_executable(root, deadline):
    # Only the held process's fixed kernel magic link is followed, never its text.
    _daemon_deadline(deadline)
    flags = os.O_RDONLY | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
    fd = os.open('exe', flags, dir_fd=root)
    fresh = None
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1
             and stat.S_IMODE(before.st_mode) == 0o555 and before.st_size == DAEMON_BYTES, 'DAEMON_EXE_IDENTITY')
        digest, total = hashlib.sha256(), 0
        while True:
            _daemon_deadline(deadline)
            block = os.read(fd, min(65536, DAEMON_BYTES + 1 - total))
            if not block: break
            total += len(block); digest.update(block)
            need(total <= DAEMON_BYTES, 'DAEMON_EXE_LIMIT')
        need(total == DAEMON_BYTES and digest.hexdigest() == DAEMON_SHA256, 'DAEMON_EXE_HASH')
        fresh = os.open('exe', flags, dir_fd=root)
        need(full_metadata(before) == full_metadata(os.fstat(fd)) == full_metadata(os.fstat(fresh)),
             'DAEMON_EXE_CHANGED')
        return full_metadata(before)
    finally:
        if fresh is not None: os.close(fresh)
        os.close(fd)


def _alive(pidfd):
    poll = select.poll(); poll.register(pidfd, select.POLLIN | select.POLLHUP | select.POLLERR)
    return not poll.poll(0)


def observe():
    deadline = time.monotonic() + 30
    root = namespace = host_namespace = pidfd = None
    try:
        fields = _service_fields(); pid, sock = socket_facts()
        need(pid == int(fields['MainPID']), 'SERVICE_SOCKET_PID')
        root = directory('/proc/' + str(pid))
        need(filesystem(root)[0] == 0x9fa0, 'DAEMON_PROC_FILESYSTEM')
        pidfd = os.pidfd_open(pid, 0); need(_alive(pidfd), 'DAEMON_EXITED')
        namespace = os.open('ns/mnt', os.O_RDONLY | os.O_CLOEXEC, dir_fd=root)
        host_namespace = os.open('/proc/1/ns/mnt', os.O_RDONLY | os.O_CLOEXEC)
        before = _process_binding(root, pid, namespace, host_namespace, deadline)
        binary = _verified_executable(root, deadline)
        private = private_propagation(_held_proc(root, 'mountinfo', 262144, deadline), required=False)
        need(_process_binding(root, pid, namespace, host_namespace, deadline) == before
             and _alive(pidfd) and _service_fields() == fields and socket_facts() == (pid, sock), 'DAEMON_CHANGED')
        # Reopen the kernel target after service/socket observations; no second full hash is needed.
        fresh = os.open('exe', os.O_RDONLY | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=root)
        try: need(full_metadata(os.fstat(fresh)) == binary, 'DAEMON_EXE_CHANGED')
        finally: os.close(fresh)
        need(_process_binding(root, pid, namespace, host_namespace, deadline) == before
             and _alive(pidfd), 'DAEMON_CHANGED')
        _daemon_deadline(deadline)
        return {**{key: before[key] for key in ('pid','start_ticks','namespace','pid1_namespace')},
                'socket':list(sock), 'private':private}
    finally:
        for fd in (pidfd, namespace, host_namespace, root):
            if fd is not None: os.close(fd)


def same_daemon(actual, expected):
    return {k:v for k,v in actual.items() if k != 'private'} == {k:v for k,v in expected.items() if k != 'private'}


def reserved_uid():
    for lookup in (pwd.getpwuid, grp.getgrgid):
        try:
            lookup(1000)
        except KeyError:
            continue
        raise Stop('UID_OR_GID1000_ASSIGNED')


def write_json(root, name, value):
    raw = (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode('ascii')
    need(len(raw) <= 16384, 'EVIDENCE_LIMIT')
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root)
    try:
        offset = 0
        while offset < len(raw):
            count = os.write(fd, raw[offset:])
            need(count > 0, 'EVIDENCE_WRITE')
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(root)


def make_dir(path, mode=0o755, uid=0, gid=0):
    os.mkdir(path, mode)
    fd = os.open(path, RFLAGS | os.O_DIRECTORY)
    try:
        os.fchown(fd, uid, gid)
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)


def anchor(path, create=False):
    need(path in ANCHORS, 'ANCHOR_SCOPE')
    parent, name = path.rsplit('/', 1)
    parent_fd = directory(parent or '/')
    os.close(parent_fd)
    if missing(path):
        if create:
            make_dir(path)
        return True
    fd = directory(path)
    readable = os.open('.', RFLAGS | os.O_DIRECTORY, dir_fd=fd)
    try:
        info = os.fstat(readable)
        need(stat.S_IMODE(info.st_mode) == 0o755 and os.listdir(readable) == [], 'ANCHOR_NOT_EMPTY_ROOT_0755')
    finally:
        os.close(readable)
        os.close(fd)
    return False


def mount(source_fd, target, readonly):
    target_fd = target_open(target)
    try:
        source, destination = os.fstat(source_fd), os.fstat(target_fd)
        need((stat.S_ISDIR(source.st_mode) and stat.S_ISDIR(destination.st_mode))
             or (stat.S_ISSOCK(source.st_mode) and stat.S_ISREG(destination.st_mode)), 'MOUNT_TARGET_TYPE')
        need(destination.st_uid == destination.st_gid == 0
             and not stat.S_IMODE(destination.st_mode) & 0o022, 'MOUNT_TARGET_OWNER')
    finally: os.close(target_fd)
    library = ctypes.CDLL(None, use_errno=True)
    function = library.mount
    function.argtypes = (ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_void_p)
    function.restype = ctypes.c_int
    source, target = ('/proc/self/fd/' + str(source_fd)).encode(), target.encode()
    if function(source, target, None, 4096 | 16384, None):
        raise OSError(ctypes.get_errno(), 'private-bind-failed')
    if function(None, target, None, 16384 | 262144, None):
        raise OSError(ctypes.get_errno(), 'new-bind-private-failed')
    if function(None, target, None, 4096 | 32 | 2 | 4 | int(readonly), None):
        raise OSError(ctypes.get_errno(), 'private-readonly-bind-failed')


def target_open(path):
    parent, name = path.rsplit('/', 1)
    root = directory(parent or '/')
    try:
        fd = os.open(name, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root)
        try:
            need(not stat.S_ISLNK(os.fstat(fd).st_mode), 'CANONICAL_TARGET_SYMLINK')
            return fd
        except BaseException:
            os.close(fd); raise
    finally: os.close(root)


def filesystem(fd):
    buffer = ctypes.create_string_buffer(256)
    function = ctypes.CDLL(None, use_errno=True).fstatfs
    function.argtypes, function.restype = (ctypes.c_int, ctypes.c_void_p), ctypes.c_int
    need(function(fd, buffer) == 0, 'FILESYSTEM_OBSERVATION')
    return [int(ctypes.cast(buffer, ctypes.POINTER(ctypes.c_long))[0]), int(os.fstatvfs(fd).f_fsid)]


def check_proofs(steps, records, expected):
    need(type(records) is list and len(records) == len(steps), 'CANONICAL_PROOF_INCOMPLETE')
    for (fd, path, readonly), record in zip(steps, records):
        info = os.fstat(fd)
        need(record == {'path': path, 'device': info.st_dev, 'inode': info.st_ino,
             'filesystem': filesystem(fd), 'readonly': readonly, 'private': True,
             'socket_peer_pid': expected['pid'] if stat.S_ISSOCK(info.st_mode) else None}, 'CANONICAL_PROOF_MISMATCH')
    return records


def canonical_proofs(steps, expected):
    text = proc('/proc/self/mountinfo')
    private_propagation(text)
    rows = [line.split() for line in text.splitlines()]
    records = []
    for source, path, readonly in steps:
        matching = [row for row in rows if row[4] == path]
        need(len(matching) == 1, 'CANONICAL_MOUNT_MISSING')
        row = matching[0]
        options = set(row[5].split(','))
        need(('ro' in options) == readonly and {'nosuid', 'nodev'} <= options, 'CANONICAL_MOUNT_FLAGS')
        fd = target_open(path)
        try:
            info = os.fstat(fd)
            original = os.fstat(source)
            need(identity(info) == identity(original) and stat.S_IFMT(info.st_mode) == stat.S_IFMT(original.st_mode),
                 'CANONICAL_TARGET_INODE')
            need(row[2] == str(os.major(info.st_dev)) + ':' + str(os.minor(info.st_dev))
                 and bool(os.fstatvfs(fd).f_flag & os.ST_RDONLY) == readonly, 'CANONICAL_TARGET_FILESYSTEM')
            record = {'path': path, 'device': info.st_dev, 'inode': info.st_ino, 'filesystem': filesystem(fd),
                      'readonly': readonly, 'private': True, 'socket_peer_pid': None}
            if stat.S_ISSOCK(info.st_mode):
                pid, socket_inode = socket_facts(path)
                need(pid == expected['pid'] and list(socket_inode) == expected['socket'], 'CANONICAL_SOCKET_PEER')
                record['socket_peer_pid'] = pid
            records.append(record)
        finally: os.close(fd)
    return check_proofs(steps, records, expected)


def enter(namespace):
    function = ctypes.CDLL(None, use_errno=True).setns
    function.argtypes, function.restype = (ctypes.c_int, ctypes.c_int), ctypes.c_int
    if function(namespace, 0x20000):
        raise OSError(ctypes.get_errno(), 'existing-mount-namespace-entry-failed')


def make_private():
    function = ctypes.CDLL(None, use_errno=True).mount
    function.argtypes = (ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_void_p)
    function.restype = ctypes.c_int
    if function(None, b'/', None, 16384 | 262144, None):
        raise OSError(ctypes.get_errno(), 'private-propagation-failed')


def child_steps(namespace, expected, steps, check, mount_call=mount, enter_call=enter, private_call=make_private,
                prove_call=canonical_proofs):
    need(namespace_identity(namespace) == expected['namespace'], 'HELD_NAMESPACE_CHANGED')
    enter_call(namespace)
    need(list(identity(os.stat('/proc/self/ns/mnt'))) == expected['namespace']
         != expected['pid1_namespace'], 'CHILD_NAMESPACE_CHANGED')
    if not private_propagation(proc('/proc/self/mountinfo'), required=False):
        check(-1, 'MAKE_PRIVATE')
        private_call()
    private_propagation(proc('/proc/self/mountinfo'))
    for index, (fd, target, readonly) in enumerate(steps):
        check(index, target)
        mount_call(fd, target, readonly)
        private_propagation(proc('/proc/self/mountinfo'))
    check(len(steps), 'COMMIT', prove_call(steps, expected))


def run_child(namespace, expected, steps, refresh):
    request_read, request_write = os.pipe2(os.O_CLOEXEC)
    ack_read, ack_write = os.pipe2(os.O_CLOEXEC)
    pid = os.fork()
    if pid == 0:
        try:
            os.setsid()
            os.close(request_read); os.close(ack_write)
            def check(index, target, proofs=None):
                value = {'index': index, 'target': target}
                if proofs is not None: value['proofs'] = proofs
                message = (json.dumps(value) + '\n').encode()
                need(len(message) <= 16384, 'CHILD_CHANNEL')
                need(os.write(request_write, message) == len(message), 'CHILD_CHANNEL')
                need(os.read(ack_read, 1) == b'1', 'CHILD_OBSERVATION_FAILED')
            child_steps(namespace, expected, steps, check)
            os._exit(0)
        except BaseException:
            os._exit(1)
    os.close(request_write); os.close(ack_read)
    protocol = ([(-1, 'MAKE_PRIVATE')] if not expected['private'] else [])
    protocol += [(index, row[1]) for index, row in enumerate(steps)] + [(len(steps), 'COMMIT')]
    data, count, waited, proofs = bytearray(), 0, False, None
    end = time.monotonic() + 60
    try:
        os.set_blocking(request_read, False)
        with selectors.DefaultSelector() as selector:
            selector.register(request_read, selectors.EVENT_READ)
            while selector.get_map():
                remaining = end - time.monotonic()
                need(remaining > 0, 'CHILD_DEADLINE')
                if not selector.select(min(1, remaining)): continue
                block = os.read(request_read, 4096)
                if not block:
                    selector.unregister(request_read)
                    break
                data.extend(block); need(len(data) <= 16384, 'CHILD_CHANNEL')
                while b'\n' in data:
                    line, _, rest = data.partition(b'\n'); data = bytearray(rest)
                    value = parse(line)
                    need(count < len(protocol), 'CHILD_STEP')
                    index, target = protocol[count]
                    if target == 'COMMIT':
                        proofs = check_proofs(steps, value.get('proofs'), expected)
                        need(value == {'index': index, 'target': target, 'proofs': proofs}, 'CHILD_STEP')
                    else: need(value == {'index': index, 'target': target}, 'CHILD_STEP')
                    actual = refresh()
                    need(same_daemon(actual, expected) and (index == -1 or actual['private'] is True), 'DAEMON_CHANGED')
                    os.write(ack_write, b'1'); count += 1
        need(not data and count == len(protocol), 'CHILD_INCOMPLETE')
        while time.monotonic() < end:
            child, status = os.waitpid(pid, os.WNOHANG)
            if child:
                waited = True
                need(os.waitstatus_to_exitcode(status) == 0, 'CHILD_FAILED')
                return proofs
            time.sleep(.01)
        raise Stop('CHILD_DEADLINE')
    except BaseException as error:
        error.context_step = protocol[max(0, count-1)][0]
        raise
    finally:
        if not waited:
            try:
                os.killpg(pid, 9)
            except ProcessLookupError:
                try: os.kill(pid, 9)
                except ProcessLookupError: pass
            os.waitpid(pid, 0)
        os.close(request_read); os.close(ack_write)


def _close_preflight(state):
    for fd in [item[0] for item in state.get('held', [])] + [state.get('namespace'), state.get('root')]:
        if fd is not None:
            try: os.close(fd)
            except OSError: pass


def _preflight(stage_sha, recovery, public, observer, state):
    admin()
    state['root'] = directory(BASE)
    def source_proof():
        return stage_proof(stage_sha) if recovery is None else recovery_stage_proof(stage_sha, recovery)
    proof = state['proof'] = source_proof()
    state['out'] = BASE + '/' + CASE_PREFIX + proof['case_id']
    need(missing(BASE + '/' + ERROR) and missing(BASE + '/' + ATTEMPT) and missing(state['out']),
         'CONTEXT_ALREADY_ATTEMPTED')
    reserved_uid()
    expected = state['expected'] = observer()
    need(expected['namespace'] != expected['pid1_namespace'] and type(expected['private']) is bool,
         'DAEMON_NAMESPACE_IS_HOST')
    state['namespace'] = os.open('/proc/' + str(expected['pid']) + '/ns/mnt', os.O_RDONLY | os.O_CLOEXEC)
    need(namespace_identity(state['namespace']) == expected['namespace'] and observer() == expected, 'DAEMON_CHANGED')
    paths = [(proof['root'] + '/workspace/' + name, name) for name in PREFIXES]
    paths += [(proof['root'] + '/opt/codex', 'codex'), (proof['root'] + '/usr/local/bin', 'bin')]
    for path, name in paths: state['held'].append((directory(path), name))
    no_source_submounts([path for path, name in paths])
    state['socket_fd'] = os.open(SOCKET, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC)
    state['held'].append((state['socket_fd'], 'socket'))
    need(list(identity(os.fstat(state['socket_fd']))) == expected['socket'], 'SOCKET_CHANGED')
    if public is not None:
        state['public_fd'], state['public_proof'] = public_checkout(public)
        state['held'].append((state['public_fd'], 'public'))
        no_source_submounts([CONTROL + '/public-code/pr942-29b05ac0'])
    state['needed'] = ANCHORS if public is not None else ANCHORS[:2]
    for path in state['needed']: anchor(path)
    def refresh():
        if recovery is not None: need(source_proof() == proof, 'RECOVERY_PROOF_CHANGED')
        if state.get('public_fd') is not None: fresh_public(public, state['public_fd'], state['public_proof'])
        return observer()
    state['refresh'] = refresh
    need(source_proof() == proof and refresh() == expected, 'PREFLIGHT_CHANGED')
    return state


def inspect_preflight(stage_sha, recovery=None, public=None):
    """Read-only preflight; even failure does not create an attempt or error record."""
    state = {'held': []}
    try:
        _preflight(stage_sha, recovery, public, observe, state)
        def fingerprint(value):
            return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii'))
        public_proof = state.get('public_proof')
        source_identity = {'source': state['proof'], 'public': None if public_proof is None else
            {key: public_proof[key] for key in ('ready_sha256', 'receipt', 'receipt_metadata', 'repository_metadata')}}
        daemon_identity = {key:value for key,value in state['expected'].items() if key != 'private'}
        return {'schema': 'helmut-context-daemon-binding-v2-preflight-v1',
            'status': 'PREFLIGHT_OBSERVED_NOT_NATIVE_QUALIFIED',
            'source_proof_sha256': fingerprint(source_identity), 'daemon_binding_sha256': fingerprint(daemon_identity),
            'held_source_count': sum(name != 'socket' for _,name in state['held']), 'anchor_count': len(state['needed']),
            'native_qualified': False, 'native_go_consumed': False}
    finally: _close_preflight(state)


def prepare(stage_sha, recovery=None, public=None, child_runner=run_child, *, observer=observe, recovery_receipt_sha=None):
    admin()
    need(recovery is None or recovery_receipt_sha is None or recovery == recovery_receipt_sha, 'RECOVERY_EXPECTED_SHA')
    recovery_receipt_sha = recovery if recovery is not None else recovery_receipt_sha
    root = None
    held, output_fd, namespace = [], None, None
    anchors_created, anchors_attempted, phase, proof = [], [], 'preflight', None
    public_fd = public_proof = None
    state = {'held': held}
    try:
        _preflight(stage_sha, recovery_receipt_sha, public, observer, state)
        root, namespace, proof, out = state['root'], state['namespace'], state['proof'], state['out']
        expected, socket_fd, needed, refresh = state['expected'], state['socket_fd'], state['needed'], state['refresh']
        public_fd, public_proof = state.get('public_fd'), state.get('public_proof')
        # No operational mutation precedes all checks above.
        phase = 'attempt'
        active = os.open('.', RFLAGS | os.O_DIRECTORY, dir_fd=root)
        try: write_json(active, ATTEMPT, {'case_id': proof['case_id'], 'stage_sha256': stage_sha, 'daemon': expected})
        finally: os.close(active)
        make_dir(out, 0o700)
        output_fd = os.open(out, RFLAGS | os.O_DIRECTORY)
        workspace, run = out + '/workspace', out + '/run'
        make_dir(workspace); make_dir(run)
        make_dir(workspace + '/helmut-unit-diagnostic-native', 0o700, 1000, 1000)
        workspace_fd, run_fd = directory(workspace), directory(run)
        held += [(workspace_fd, 'workspace'), (run_fd, 'run')]
        steps = [(workspace_fd, '/workspace', False), (run_fd, '/run', False)]
        for fd, name in held[:4]:
            make_dir(workspace + '/' + name); steps.append((fd, '/workspace/' + name, True))
        run_socket = run + '/docker.sock'
        fd = os.open(run_socket, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600); os.close(fd)
        steps += [(held[4][0], '/opt/codex', True), (held[5][0], '/usr/local/bin', True),
                  (socket_fd, '/run/docker.sock', True)]
        if public_fd is not None: steps.append((public_fd, '/opt/helmut-public-pr942', True))
        for path in needed:
            need(refresh() == expected, 'DAEMON_CHANGED')
            if missing(path): anchors_attempted.append(path)
            if anchor(path, create=True): anchors_created.append(path)
        phase = 'private-mounts'
        need(refresh() == expected, 'DAEMON_CHANGED')
        proofs = check_proofs(steps, child_runner(namespace, expected, steps, refresh), expected)
        actual = refresh()
        need(same_daemon(actual, expected) and actual['private'] is True, 'DAEMON_CHANGED')
        receipt = {'status': 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED', 'case_id': proof['case_id'],
            'scope_sha256': SCOPE, 'stage_ready_sha256': stage_sha, 'daemon': actual,
            'propagationWasPrivate': expected['private'],
            'globalEmptyAnchorsCreated': anchors_created, 'mountTargets': [row[1] for row in steps],
            'canonicalProofs': proofs,
            'runnerUid': 1000, 'runnerGid': 1000, 'publicEnginePresent': False,
            'publicEngineState': 'NOT_PRESENT_NOT_QUALIFIED',
            'nativeQualified': False, 'nativeGOConsumed': False, 'budgetParentCreated': False}
        if public_proof is not None:
            receipt.update(publicEnginePresent=True, publicEngineState='MOUNTED_REQUIRES_FRESH_SOURCE_ADMISSION',
                           publicCheckoutReadySHA256=public, publicCheckoutReceipt=public_proof['receipt'])
        if recovery_receipt_sha is not None:
            receipt.update(sourcePreparationKind='ACCEPTED_LOCAL_PAX_RECOVERY', recoveryReadySHA256=stage_sha,
                historicalRestoreReceiptSHA256=recovery_receipt_sha, historicalStageSourceSHA256=STAGE_SOURCE,
                restoreSourceSHA256=RECOVERY_SOURCE)
        write_json(output_fd, 'CONTEXT_RECEIPT.PENDING.SAFE.json', receipt)
        rename = ctypes.CDLL(None, use_errno=True).renameat2
        rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        rename.restype = ctypes.c_int
        if rename(output_fd, b'CONTEXT_RECEIPT.PENDING.SAFE.json', output_fd, b'CONTEXT_RECEIPT.SAFE.json', 1):
            raise OSError(ctypes.get_errno(), 'context-receipt-publication')
        return receipt
    except BaseException as error:
        proof = state.get('proof', proof)
        root = state.get('root', root)
        if root is None: raise
        record = {'status': 'FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY', 'phase': phase,
            'code': str(error) if isinstance(error, Stop) else 'CONTEXT_FAILURE',
            'exceptionType': type(error).__name__, 'errno': getattr(error, 'errno', None),
            'case_id': proof['case_id'] if proof else None, 'globalEmptyAnchorsCreated': anchors_created,
            'globalAnchorAttempts': anchors_attempted,
            'mountState': 'UNKNOWN' if phase == 'private-mounts' else 'NOT_STARTED',
            'lastAcknowledgedStep': getattr(error, 'context_step', None),
            'nativeQualified': False, 'nativeGOConsumed': False}
        try:
            active = os.open('.', RFLAGS | os.O_DIRECTORY, dir_fd=root)
            try: write_json(active, ERROR, record)
            finally: os.close(active)
        except BaseException: pass
        raise
    finally:
        _close_preflight(state)
        if output_fd is not None: os.close(output_fd)


def main(argv=None):
    print('context-continuation: NOT_EXECUTED_COMPONENT_ONLY')
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
