#!/usr/bin/env python3
"""Inert namespace preparation only. No daemon/workload/account lifecycle action.

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
PREFIXES = ('helmut-cpu-epoch-20261015', 'helmut-hetzner-preparation-evidence-20261025',
            'helmut-parallel-20261015', 'helmut-ram-fix-20261020')
ANCHORS = ('/workspace', '/opt/codex', '/opt/helmut-public-pr942')
FLAG = '--prepare-native-context-once'
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


def observe():
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
    pid, sock = socket_facts()
    need(pid == int(fields['MainPID']), 'SERVICE_SOCKET_PID')
    root = '/proc/' + str(pid)
    status = dict(line.split(':', 1) for line in proc(root + '/status').splitlines())
    need(status.get('Uid', '').split() == status.get('Gid', '').split() == ['0'] * 4, 'DAEMON_OWNER')
    need(proc(root + '/comm', 64) == 'dockerd\n'
         and os.readlink(root + '/exe') == BASE + '/bin/dockerd'
         and proc(root + '/cgroup', 4096) == '0::/system.slice/' + SERVICE + '/daemon\n', 'DAEMON_SERVICE_BINDING')
    raw = proc(root + '/stat', 16384)
    tail = raw.rsplit(')', 1)[1].split()
    need(raw.startswith(str(pid) + ' (dockerd)') and len(tail) > 19
         and tail[0] not in ('Z', 'X') and tail[19].isdigit(), 'DAEMON_START')
    namespace = os.stat(root + '/ns/mnt')
    pid1 = os.stat('/proc/1/ns/mnt')
    need(identity(namespace) != identity(pid1), 'DAEMON_NAMESPACE_IS_HOST')
    private = private_propagation(proc(root + '/mountinfo'), required=False)
    return {'pid': pid, 'start_ticks': int(tail[19]), 'namespace': list(identity(namespace)),
            'pid1_namespace': list(identity(pid1)), 'socket': list(sock), 'private': private}


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


def prepare(stage_sha, public=None, observer=observe, child_runner=run_child):
    admin()
    root = directory(BASE)
    held, output_fd, namespace = [], None, None
    anchors_created, anchors_attempted, phase, proof = [], [], 'preflight', None
    try:
        proof = stage_proof(stage_sha)
        out = BASE + '/native-context-' + proof['case_id']
        need(missing(BASE + '/NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json')
             and missing(BASE + '/NATIVE_CONTEXT_ATTEMPT.SAFE.json') and missing(out), 'CONTEXT_ALREADY_ATTEMPTED')
        reserved_uid()
        expected = observer()
        need(expected['namespace'] != expected['pid1_namespace'] and type(expected['private']) is bool,
             'DAEMON_NAMESPACE_IS_HOST')
        namespace = os.open('/proc/' + str(expected['pid']) + '/ns/mnt', os.O_RDONLY | os.O_CLOEXEC)
        need(namespace_identity(namespace) == expected['namespace'] and observer() == expected, 'DAEMON_CHANGED')
        paths = [(proof['root'] + '/workspace/' + name, name) for name in PREFIXES]
        paths += [(proof['root'] + '/opt/codex', 'codex'), (proof['root'] + '/usr/local/bin', 'bin')]
        for path, name in paths:
            held.append((directory(path), name))
        no_source_submounts([path for path, name in paths])
        socket_fd = os.open(SOCKET, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC)
        held.append((socket_fd, 'socket'))
        need(list(identity(os.fstat(socket_fd))) == expected['socket'], 'SOCKET_CHANGED')
        if public is not None:
            raise Stop('PUBLIC_CHECKOUT_NOT_QUALIFIED')
        needed = ANCHORS[:2]
        for path in needed: anchor(path)
        need(stage_proof(stage_sha) == proof and observer() == expected, 'PREFLIGHT_CHANGED')
        # No operational mutation precedes all checks above.
        phase = 'attempt'
        active = os.open('.', RFLAGS | os.O_DIRECTORY, dir_fd=root)
        try: write_json(active, 'NATIVE_CONTEXT_ATTEMPT.SAFE.json', {'case_id': proof['case_id'], 'stage_sha256': stage_sha, 'daemon': expected})
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
        for path in needed:
            need(observer() == expected, 'DAEMON_CHANGED')
            if missing(path): anchors_attempted.append(path)
            if anchor(path, create=True): anchors_created.append(path)
        phase = 'private-mounts'
        need(observer() == expected, 'DAEMON_CHANGED')
        proofs = check_proofs(steps, child_runner(namespace, expected, steps, observer), expected)
        actual = observer()
        need(same_daemon(actual, expected) and actual['private'] is True, 'DAEMON_CHANGED')
        receipt = {'status': 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED', 'case_id': proof['case_id'],
            'scope_sha256': SCOPE, 'stage_ready_sha256': stage_sha, 'daemon': actual,
            'propagationWasPrivate': expected['private'],
            'globalEmptyAnchorsCreated': anchors_created, 'mountTargets': [row[1] for row in steps],
            'canonicalProofs': proofs,
            'runnerUid': 1000, 'runnerGid': 1000, 'publicEnginePresent': False,
            'publicEngineState': 'NOT_PRESENT_NOT_QUALIFIED',
            'nativeQualified': False, 'nativeGOConsumed': False, 'budgetParentCreated': False}
        write_json(output_fd, 'CONTEXT_RECEIPT.PENDING.SAFE.json', receipt)
        rename = ctypes.CDLL(None, use_errno=True).renameat2
        rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
        rename.restype = ctypes.c_int
        if rename(output_fd, b'CONTEXT_RECEIPT.PENDING.SAFE.json', output_fd, b'CONTEXT_RECEIPT.SAFE.json', 1):
            raise OSError(ctypes.get_errno(), 'context-receipt-publication')
        return receipt
    except BaseException as error:
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
            try: write_json(active, 'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json', record)
            finally: os.close(active)
        except BaseException: pass
        raise
    finally:
        for fd in [item[0] for item in held] + [namespace, output_fd, root]:
            if fd is not None:
                try: os.close(fd)
                except OSError: pass


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] != FLAG:
        print('native-context: NOT_EXECUTED_EXPLICIT_PREPARE_FLAG_REQUIRED'); return 2
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage-ready-sha256', required=True)
    args = parser.parse_args(argv[1:])
    try:
        result = prepare(args.stage_ready_sha256)
        print(result['status']); return 0
    except BaseException:
        print('native-context: FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY'); return 1


if __name__ == '__main__':
    raise SystemExit(main())
