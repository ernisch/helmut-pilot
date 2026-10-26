#!/usr/bin/env python3
"""One fixed setup phase in one bounded transient service. Default entrypoint inert.

Component READY is not acceptance. The caller must persist its own ACCEPTED only
after this guard returns the positive lifecycle proof. No workload/native action.
"""
import ctypes
import hashlib
import json
import math
import os
import re
import select
import signal
import stat
import subprocess
import sys
import time

BASE = '/opt/helmut-native-test/automation-20261026'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
ASSETS = ('guard.py', 'driver.py', 'recovery.py', 'restore.py', 'public.py', 'context.py', 'image.py')
PHASES = ('recover', 'checkout', 'context', 'image')
DATA_KEYS = ('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256')
ROLES = ('historical_binding', 'historical_error', 'historical_receipt', 'recovery_once',
         'recovery_ready', 'recovery_receipt', 'public_once', 'public_ready', 'public_repository',
         'context_once', 'context_receipt', 'image_receipt')
MARGIN = {'recover': 10, 'checkout': 190, 'context': 90, 'image': 70}
FLOOR = 8 * 1024**3
CAP, ASSET_CAP, TOTAL_CAP = 16384, 131072, 524288
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
D = R | os.O_DIRECTORY
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}
SUCCESS = 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED'
PROPERTIES = ('Id', 'Transient', 'Type', 'MainPID', 'ControlPID', 'ControlGroup', 'KillMode',
              'RuntimeMaxUSec', 'TimeoutStopUSec', 'Restart', 'RemainAfterExit', 'User', 'Group',
              'UMask', 'StandardOutput', 'StandardError', 'Delegate', 'ExecStart',
              'InvocationID', 'ActiveState', 'SubState', 'ExecMainPID', 'ExecMainCode',
              'ExecMainStatus', 'ExecMainStartTimestampMonotonic', 'ExecMainExitTimestampMonotonic', 'Result',
              'SendSIGKILL', 'KillSignal', 'FinalKillSignal', 'TimeoutStopFailureMode')
HOOK_PROPERTIES = ('ExecStartPre', 'ExecStartPost', 'ExecCondition', 'ExecStop', 'ExecStopPost', 'ExecReload')


class Stop(Exception):
    pass


def need(value, code):
    if not value:
        raise Stop(code)


def hex64(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')


def parsed(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result, 'DUPLICATE_JSON')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'JSON_CONSTANT'))


def metadata(info):
    return [getattr(info, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
            'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def admin():
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'ROOT_REQUIRED')


def directory(path):
    need(type(path) is str and path.startswith('/') and
         all(part not in ('', '.', '..') for part in path.split('/')[1:]), 'DIRECTORY_PATH')
    fd = os.open('/', D)
    try:
        for part in path.split('/')[1:]:
            child = os.open(part, D, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            need(info.st_uid == info.st_gid == 0 and not stat.S_IMODE(info.st_mode) & 0o022,
                 'DIRECTORY_IDENTITY')
        return fd
    except BaseException:
        os.close(fd)
        raise


def private_dir(path):
    fd = directory(path)
    try:
        need(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'DIRECTORY_PRIVATE')
        return fd
    except BaseException:
        os.close(fd)
        raise


def regular(root, name, cap=CAP, mode=0o600):
    need(type(name) is str and '/' not in name and name not in ('', '.', '..'), 'FILE_NAME')
    fd = os.open(name, R, dir_fd=root)
    try:
        info = os.fstat(fd)
        before = metadata(info)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= cap, 'FILE_IDENTITY')
        data = bytearray()
        while True:
            block = os.read(fd, min(65536, cap + 1 - len(data)))
            if not block:
                break
            data.extend(block)
            need(len(data) <= cap, 'FILE_LIMIT')
        need(len(data) == info.st_size and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False)), 'FILE_CHANGED')
        return bytes(data)
    finally:
        os.close(fd)


def absent(root, name):
    try:
        os.stat(name, dir_fd=root, follow_symlinks=False)
    except FileNotFoundError:
        return True
    return False


def write_new(root, name, raw, mode=0o600):
    need(type(name) is str and '/' not in name and name not in ('', '.', '..'), 'FILE_NAME')
    cap = ASSET_CAP if name in ASSETS else CAP
    need(type(raw) is bytes and 0 < len(raw) <= cap, 'WRITE_LIMIT')
    temporary = '.setup-write-' + os.urandom(16).hex() + '.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 mode, dir_fd=root)
    try:
        os.fchmod(fd, mode)
        at = 0
        while at < len(raw):
            count = os.write(fd, raw[at:])
            need(count > 0, 'SHORT_WRITE')
            at += count
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(root)
    need(regular(root, temporary, cap, mode) == raw, 'WRITE_READBACK')
    function = ctypes.CDLL(None, use_errno=True).renameat2
    function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    function.restype = ctypes.c_int
    if function(root, temporary.encode('ascii'), root, name.encode('ascii'), 1):
        raise OSError(ctypes.get_errno(), 'setup-write-publication')
    os.fsync(root)


def rename_result(root):
    function = ctypes.CDLL(None, use_errno=True).renameat2
    function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    function.restype = ctypes.c_int
    need(function(root, b'RESULT.PENDING.PRIVATE.json', root, b'RESULT.PRIVATE.json', 1) == 0,
         'RESULT_PUBLICATION')
    os.fsync(root)


def bounded(deadline, margin=0, capacity=True):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and margin < deadline - time.monotonic() <= 300, 'DEADLINE')
    if capacity:
        value = os.statvfs(BASE)
        need(value.f_bavail * value.f_frsize >= FLOOR, 'CAPACITY')


def kernel_read(path, cap=65536):
    fd = os.open(path, R)
    try:
        raw = os.read(fd, cap + 1)
        need(len(raw) <= cap, 'KERNEL_LIMIT')
        return raw
    finally:
        os.close(fd)


def boot_id():
    value = kernel_read('/proc/sys/kernel/random/boot_id', 64).decode('ascii').strip()
    need(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value), 'BOOT_ID')
    return value


def process(pid):
    need(type(pid) is int and pid > 1, 'PROCESS_PID')
    base = '/proc/' + str(pid)
    raw = kernel_read(base + '/stat', CAP).decode('ascii')
    tail = raw.rsplit(')', 1)[1].split()
    need(raw.startswith(str(pid) + ' (') and len(tail) > 19 and tail[0] not in ('Z', 'X')
         and tail[19].isdigit(), 'PROCESS_START')
    fields = dict(line.split(':', 1) for line in kernel_read(base + '/status', CAP).decode('ascii').splitlines())
    need(fields.get('Uid', '').split() == fields.get('Gid', '').split() == ['0'] * 4, 'PROCESS_OWNER')
    namespace = os.stat(base + '/ns/mnt')
    return {'pid': pid, 'start_ticks': int(tail[19]), 'namespace': [namespace.st_dev, namespace.st_ino]}


def exited(pidfd):
    poll = select.poll()
    poll.register(pidfd, select.POLLIN | select.POLLHUP | select.POLLERR)
    return bool(poll.poll(0))


def command(argv, deadline, timeout=5):
    bounded(deadline, capacity=False)
    child = subprocess.Popen(argv, env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True)
    end, raw, done = min(deadline, time.monotonic() + timeout), bytearray(), False
    try:
        os.set_blocking(child.stdout.fileno(), False)
        while True:
            need(time.monotonic() < end, 'CONTROL_COMMAND_DEADLINE')
            if select.select([child.stdout], [], [], min(.05, max(0, end-time.monotonic())))[0]:
                block = os.read(child.stdout.fileno(), 65537 - len(raw))
                need(len(raw) + len(block) <= 65536, 'CONTROL_COMMAND_LIMIT')
                raw.extend(block)
                if not block:
                    break
        need(child.wait(timeout=max(.01, end-time.monotonic())) == 0, 'CONTROL_COMMAND_FAILED')
        done = True
        return bytes(raw)
    finally:
        if not done:
            try: os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            child.wait()
        child.stdout.close()


def unit_name(nonce):
    need(hex64(nonce), 'NONCE')
    return 'helmut-native-setup-' + nonce + '.service'


def worker_argv(nonce):
    return ['/usr/bin/env', '-i', 'PATH=' + ENV['PATH'], 'LC_ALL=C', '/usr/bin/python3',
            '-I', '-S', '-B', BASE + '/setup-jobs/' + nonce + '/guard.py', '--setup-phase-worker', nonce]


def duration(value):
    parts = value.split()
    total = 0.0
    for part in parts:
        match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)(us|ms|s|min|h)', part)
        need(match is not None, 'UNIT_DURATION')
        total += float(match[1]) * {'us': .000001, 'ms': .001, 's': 1, 'min': 60, 'h': 3600}[match[2]]
    need(parts and math.isfinite(total), 'UNIT_DURATION')
    return total


def unit_fields(name, deadline):
    raw = command(['/usr/bin/systemctl', 'show', name, '--no-pager', '--property=' + ','.join(PROPERTIES)], deadline)
    fields = {}
    for line in raw.decode('ascii').splitlines():
        key, sep, value = line.partition('=')
        need(sep and key not in fields, 'UNIT_FORMAT')
        fields[key] = value
    need(set(fields) == set(PROPERTIES), 'UNIT_PROPERTIES')
    return fields


def unit_hooks(name, deadline):
    # systemctl show omits empty Exec arrays even with --all. Only an explicit,
    # correctly typed empty D-Bus array proves that a hook has no commands.
    path = '/org/freedesktop/systemd1/unit/' + name.replace('-', '_2d').replace('.', '_2e')
    for interface, key, signature, expected in (
            ('Unit', 'Id', 's', name),
            *(('Service', key, 'a(sasbttttuii)', []) for key in HOOK_PROPERTIES)):
        raw = command(['/usr/bin/busctl', '--system', '--json=short', 'get-property',
                       'org.freedesktop.systemd1', path, 'org.freedesktop.systemd1.' + interface, key], deadline)
        try:
            value = parsed(raw.decode('ascii'))
        except (ValueError, UnicodeError, RecursionError):
            raise Stop('UNIT_DBUS_FORMAT') from None
        need(type(value) is dict and set(value) == {'type', 'data'}
             and value['type'] == signature and type(value['data']) is type(expected), 'UNIT_DBUS_TYPE')
        need(value['data'] == expected, 'UNIT_DBUS_IDENTITY' if key == 'Id' else 'UNIT_EXTRA_COMMAND')


def unit_snapshot(job, finished=False):
    nonce, deadline = job['request']['nonce'], job['deadline']
    name = unit_name(nonce)
    fields = unit_fields(name, deadline)
    required = {'Id': name, 'Transient': 'yes', 'Type': 'exec', 'ControlPID': '0',
        'KillMode': 'control-group', 'Restart': 'no',
        'RemainAfterExit': 'yes', 'User': 'root', 'Group': 'root', 'UMask': '0077',
        'StandardOutput': 'null', 'StandardError': 'null', 'Delegate': 'no', 'SendSIGKILL': 'yes',
        'KillSignal': '15', 'FinalKillSignal': '9', 'TimeoutStopFailureMode': 'kill'}
    need(all(fields[k] == v for k, v in required.items()), 'UNIT_IDENTITY')
    need(fields['ControlGroup'] in (('', '/system.slice/' + name) if finished else ('/system.slice/' + name,)),
         'UNIT_CGROUP')
    need(duration(fields['RuntimeMaxUSec']) == job['runtime_seconds']
         and duration(fields['TimeoutStopUSec']) == 5, 'UNIT_BOUNDS')
    start = '{ path=/usr/bin/env ; argv[]=' + ' '.join(worker_argv(nonce)) + ' ; ignore_errors=no ;'
    need(fields['ExecStart'].startswith(start) and fields['ExecStart'].count('{') == 1
         and fields['ExecStart'].count('}') == 1, 'UNIT_COMMAND')
    need(re.fullmatch('[a-f0-9]{32}', fields['InvocationID'])
         and fields['ExecMainStartTimestampMonotonic'].isdigit()
         and int(fields['ExecMainStartTimestampMonotonic']) > 0, 'UNIT_INVOCATION')
    if finished:
        need(fields['MainPID'] == '0' and fields['ExecMainCode'] == '1'
             and fields['ExecMainStatus'] == '0' and fields['Result'] == 'success'
             and fields['ActiveState'] == 'active' and fields['SubState'] == 'exited'
             and fields['ExecMainExitTimestampMonotonic'].isdigit()
             and int(fields['ExecMainExitTimestampMonotonic']) >= int(fields['ExecMainStartTimestampMonotonic']),
             'UNIT_EXIT')
    else:
        need(fields['MainPID'].isdigit() and int(fields['MainPID']) > 1
             and fields['ExecMainPID'] == fields['MainPID'] and fields['ActiveState'] == 'active'
             and fields['SubState'] == 'running', 'UNIT_RUNNING')
    unit_hooks(name, deadline)
    need(unit_fields(name, deadline) == fields, 'UNIT_CHANGED')
    return fields


def assets_check(assets, expected):
    need(type(assets) is dict and set(assets) == set(ASSETS) and type(expected) is dict
         and set(expected) == set(ASSETS), 'ASSET_SET')
    total = 0
    for name in ASSETS:
        raw, pin = assets[name], expected[name]
        need(type(pin) is dict and set(pin) == {'sha256', 'bytes'} and hex64(pin['sha256'])
             and type(pin['bytes']) is int and 0 < pin['bytes'] <= ASSET_CAP
             and type(raw) is bytes and len(raw) == pin['bytes'] and sha(raw) == pin['sha256'], 'ASSET_PIN')
        total += len(raw)
    need(total <= TOTAL_CAP, 'ASSET_TOTAL')


def phase_data_check(phase, data):
    need(phase in PHASES and type(data) is dict and set(data) == set(DATA_KEYS), 'PHASE_DATA')
    index = PHASES.index(phase)
    for number, key in enumerate(DATA_KEYS):
        need(hex64(data[key]) if number <= index else data[key] is None, 'PHASE_BINDING')


def request_check(request, context):
    need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deadline'}
         and context['base'] == BASE and hex64(context['source_sha256']), 'CONTEXT')
    need(type(request) is dict and set(request) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256'}
         and request['schema'] == 'helmut-native-control-request-v1' and request['operation'] == 'admit'
         and hex64(request['nonce']) and request['plan_sha256'] == PLAN
         and request['payload_sha256'] == context['source_sha256'], 'REQUEST')
    bounded(context['deadline'])


def result_check(value, phase):
    need(type(value) is dict and set(value) == {'status', 'phase', 'ready_sha256',
         'native_qualified', 'native_go_consumed', 'bindings'} and value['status'] == SUCCESS
         and value['phase'] == phase and hex64(value['ready_sha256'])
         and value['native_qualified'] is False and value['native_go_consumed'] is False, 'DRIVER_RESULT')
    rows = value['bindings']
    need(type(rows) is dict and 0 < len(rows) <= len(ROLES) and set(rows) <= set(ROLES), 'DRIVER_BINDINGS')
    for role, row in rows.items():
        need(type(row) is dict and set(row) == {'sha256', 'metadata'}
             and (row['sha256'] is None if role == 'public_repository' else hex64(row['sha256']))
             and type(row['metadata']) is list and len(row['metadata']) == 12
             and all(type(n) is int and -(2**63) <= n < 2**64 for n in row['metadata']), 'DRIVER_BINDINGS')
    need(len(encoded(value)) <= CAP, 'RESULT_LIMIT')
    return value


def job_check(job, nonce):
    keys = {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
            'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets'}
    need(type(job) is dict and set(job) == keys and job['schema'] == 'helmut-setup-service-job-v1'
         and job['plan_sha256'] == PLAN and job['case_id'] == CASE, 'JOB_SCHEMA')
    context = {'base': BASE, 'source_sha256': job['controller_source_sha256'], 'deadline': job['deadline']}
    request_check(job['request'], context)
    need(job['request']['nonce'] == nonce and job['boot_id'] == boot_id(), 'JOB_IDENTITY')
    need(type(job['runtime_seconds']) is int and 0 < job['runtime_seconds'] <= 295
         and type(job['controller']) is dict and set(job['controller']) == {'pid', 'start_ticks', 'namespace'}
         and all(type(job['controller'][k]) is int and job['controller'][k] > 1 for k in ('pid', 'start_ticks'))
         and type(job['controller']['namespace']) is list and len(job['controller']['namespace']) == 2
         and all(type(n) is int and n >= 0 for n in job['controller']['namespace']), 'JOB_CONTROLLER')
    phase_data_check(job['phase'], job['phase_data'])
    need(type(job['assets']) is dict and set(job['assets']) == set(ASSETS), 'ASSET_SET')


def load_job(root, nonce, expected_raw=None):
    raw = regular(root, 'JOB.PRIVATE.json')
    if expected_raw is not None:
        need(raw == expected_raw, 'JOB_CHANGED')
    job = parsed(raw)
    job_check(job, nonce)
    assets = {name: regular(root, name, ASSET_CAP, 0o500) for name in ASSETS}
    assets_check(assets, job['assets'])
    return job, raw, assets


def worker_identity(job, root, raw, baseline=None):
    load_job(root, job['request']['nonce'], raw)
    fields = unit_snapshot(job)
    pid = int(fields['MainPID'])
    facts = process(pid)
    need(kernel_read('/proc/' + str(pid) + '/cmdline', CAP).split(b'\0') ==
         [part.encode() for part in worker_argv(job['request']['nonce'])[4:]] + [b''], 'WORKER_COMMAND')
    executable = os.stat('/proc/' + str(pid) + '/exe')
    python = os.stat('/usr/bin/python3')
    need(stat.S_ISREG(python.st_mode) and python.st_uid == python.st_gid == 0
         and not stat.S_IMODE(python.st_mode) & 0o022
         and (executable.st_dev, executable.st_ino) == (python.st_dev, python.st_ino), 'WORKER_EXE')
    need(kernel_read('/proc/' + str(pid) + '/cgroup', CAP) == ('0::' + fields['ControlGroup'] + '\n').encode(),
         'WORKER_CGROUP')
    need(boot_id() == job['boot_id'] and process(pid) == facts
         and facts['namespace'] == job['controller']['namespace'], 'WORKER_CHANGED')
    proof = {'worker': facts, 'invocation_id': fields['InvocationID'],
             'unit_start_us': int(fields['ExecMainStartTimestampMonotonic']), 'cgroup': fields['ControlGroup']}
    if baseline is not None:
        need(proof == baseline, 'WORKER_CHANGED')
    return proof


def cgroup_pids(cgroup):
    need(type(cgroup) is str and re.fullmatch('/system.slice/helmut-native-setup-[a-f0-9]{64}\\.service', cgroup),
         'CGROUP_PATH')
    root = directory('/sys/fs/cgroup' + cgroup)
    visited, pids = 0, set()
    def visit(fd):
        nonlocal visited
        visited += 1
        need(visited <= 128, 'CGROUP_LIMIT')
        file = os.open('cgroup.procs', R, dir_fd=fd)
        try:
            raw = os.read(file, 65537)
        finally:
            os.close(file)
        need(len(raw) <= 65536 and re.fullmatch(b'(?:[1-9][0-9]*\n)*', raw), 'CGROUP_CONTENT')
        pids.update(int(row) for row in raw.splitlines())
        need(len(pids) <= 4096, 'CGROUP_LIMIT')
        for name in os.listdir(fd):
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(not stat.S_ISLNK(info.st_mode), 'CGROUP_SYMLINK')
            if stat.S_ISDIR(info.st_mode):
                need(info.st_uid == info.st_gid == 0 and not stat.S_IMODE(info.st_mode) & 0o022, 'CGROUP_OWNER')
                child = os.open(name, D, dir_fd=fd)
                try: visit(child)
                finally: os.close(child)
    try:
        visit(root)
        return sorted(pids)
    finally:
        os.close(root)


def stop_owned(job, root, raw, baseline):
    # Never stop by name alone. RuntimeMaxSec remains the fallback if proof fails.
    worker_identity(job, root, raw, baseline)
    command(['/usr/bin/systemctl', '--no-block', 'stop', unit_name(job['request']['nonce'])],
            job['deadline'], timeout=3)


def safe_error(error, phase):
    code = str(error) if isinstance(error, Stop) or type(error).__name__ == 'Stop' else getattr(error, 'code', None)
    if not isinstance(code, str) or not re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code):
        code = 'FILESYSTEM_OR_PHASE_FAILURE'
    name = type(error).__name__
    return {'schema': 'helmut-setup-service-error-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'phase': phase if phase in PHASES else None, 'code': code,
        'exception_type': name if re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,63}', name) else 'Exception',
        'errno': error.errno if type(getattr(error, 'errno', None)) is int else None,
        'native_qualified': False, 'native_go_consumed': False}


def error_check(row, phase):
    need(type(row) is dict and set(row) == {'schema', 'status', 'phase', 'code', 'exception_type',
         'errno', 'native_qualified', 'native_go_consumed'}
         and row['schema'] == 'helmut-setup-service-error-v1' and row['status'] == 'FAIL_KEEP_STATE_NO_RETRY'
         and row['phase'] == phase and type(row['code']) is str
         and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', row['code'])
         and type(row['exception_type']) is str and re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,63}', row['exception_type'])
         and (row['errno'] is None or type(row['errno']) is int)
         and row['native_qualified'] is False and row['native_go_consumed'] is False, 'CHILD_ERROR')
    return row


def save_error(root, error, phase):
    try: write_new(root, 'FIRST_ERROR.PRIVATE.json', encoded(safe_error(error, phase)))
    except BaseException: pass


def controller_alive(job, pidfd):
    need(not exited(pidfd) and boot_id() == job['boot_id']
         and process(job['controller']['pid']) == job['controller'], 'CONTROLLER_LOST')


def worker_watch(job, controller_fd):
    bounded(job['deadline'])
    controller_alive(job, controller_fd)


def phase_child(job, assets, controller_fd):
    read_fd, write_fd = os.pipe2(os.O_CLOEXEC)
    pid = os.fork()
    if pid == 0:
        os.close(read_fd)
        try:
            modules = {}
            for name in ASSETS[2:]:
                key = name[:-3]
                namespace = {'__name__': 'helmut_setup_' + key, '__source_bytes__': assets[name],
                             '__file__': BASE + '/setup-jobs/' + job['request']['nonce'] + '/' + name}
                exec(compile(assets[name], '<pinned-setup-' + key + '>', 'exec'), namespace)
                modules[key] = namespace
            driver = {'__name__': 'helmut_setup_driver', '__source_bytes__': assets['driver.py'],
                      '__file__': BASE + '/setup-jobs/' + job['request']['nonce'] + '/driver.py'}
            exec(compile(assets['driver.py'], '<pinned-setup-driver>', 'exec'), driver)
            value = result_check(driver['execute_phase'](job['phase'], job['phase_data'], modules, job['deadline']), job['phase'])
            message, code = {'ok': True, 'result': value}, 0
        except BaseException as error:
            message, code = {'ok': False, 'error': safe_error(error, job['phase'])}, 1
        raw = encoded(message)
        if len(raw) > CAP:
            os._exit(1)
        at = 0
        while at < len(raw):
            count = os.write(write_fd, raw[at:])
            if count <= 0: os._exit(1)
            at += count
        os.close(write_fd)
        os._exit(code)
    os.close(write_fd)
    raw, eof, status = bytearray(), False, None
    try:
        os.set_blocking(read_fd, False)
        while not eof or status is None:
            worker_watch(job, controller_fd)
            if not eof and select.select([read_fd], [], [], .05)[0]:
                block = os.read(read_fd, CAP + 1 - len(raw))
                need(len(raw) + len(block) <= CAP, 'CHILD_RESULT_LIMIT')
                raw.extend(block)
                eof = not block
            child, code = os.waitpid(pid, os.WNOHANG) if status is None else (0, 0)
            if child:
                status = os.waitstatus_to_exitcode(code)
            if eof and status is None:
                time.sleep(.01)
        value = parsed(raw)
        if type(value) is dict and set(value) == {'ok', 'error'} and value['ok'] is False:
            error = Stop('PHASE_FAILED')
            error.phase_error = error_check(value['error'], job['phase'])
            raise error
        need(status == 0 and type(value) is dict and set(value) == {'ok', 'result'}
             and value['ok'] is True, 'CHILD_EXIT')
        return result_check(value['result'], job['phase'])
    finally:
        os.close(read_fd)


def worker(nonce):
    admin()
    need(hex64(nonce), 'NONCE')
    root = private_dir(BASE + '/setup-jobs/' + nonce)
    controller_fd, job, raw, baseline = None, None, None, None
    parked = False
    try:
        job, raw, assets = load_job(root, nonce)
        need(all(absent(root, name) for name in ('ACK.PRIVATE.json', 'RESULT.PENDING.PRIVATE.json',
             'RESULT.PRIVATE.json', 'FIRST_ERROR.PRIVATE.json')), 'WORKER_ALREADY_ATTEMPTED')
        baseline = worker_identity(job, root, raw)
        need(baseline['worker']['pid'] == os.getpid(), 'WORKER_SELF')
        controller_fd = os.pidfd_open(job['controller']['pid'], 0)
        arm_expected = {'schema': 'helmut-setup-service-arm-v1', 'nonce': nonce,
            'job_sha256': sha(raw), 'controller_source_sha256': job['controller_source_sha256'],
            'worker': baseline['worker']}
        while absent(root, 'ARM.PRIVATE.json'):
            worker_watch(job, controller_fd)
            time.sleep(.025)
        need(parsed(regular(root, 'ARM.PRIVATE.json')) == arm_expected, 'ARM_BINDING')
        worker_watch(job, controller_fd)
        load_job(root, nonce, raw)
        bounded(job['deadline'], MARGIN[job['phase']])
        result = phase_child(job, assets, controller_fd)
        worker_watch(job, controller_fd)
        load_job(root, nonce, raw)
        need(cgroup_pids(baseline['cgroup']) == [os.getpid()], 'CGROUP_NOT_SOLE_WORKER')
        pending = encoded(result)
        parked = True  # No new child from this point, including failure handling.
        write_new(root, 'RESULT.PENDING.PRIVATE.json', pending)
        ack_expected = {'schema': 'helmut-setup-service-ack-v1', 'nonce': nonce,
                        'job_sha256': sha(raw), 'result_sha256': sha(pending), 'worker': baseline['worker']}
        while absent(root, 'ACK.PRIVATE.json'):
            worker_watch(job, controller_fd)
            time.sleep(.025)
        need(parsed(regular(root, 'ACK.PRIVATE.json')) == ack_expected, 'ACK_BINDING')
        worker_watch(job, controller_fd)
        load_job(root, nonce, raw)
        need(absent(root, 'FIRST_ERROR.PRIVATE.json')
             and regular(root, 'RESULT.PENDING.PRIVATE.json') == pending, 'RESULT_CHANGED')
        rename_result(root)
        return 0
    except BaseException as error:
        if type(getattr(error, 'phase_error', None)) is dict:
            try: write_new(root, 'FIRST_ERROR.PRIVATE.json', encoded(error.phase_error))
            except BaseException: pass
        save_error(root, error, job['phase'] if job else None)
        if not parked and baseline is not None:
            try: stop_owned(job, root, raw, baseline)
            except BaseException: pass
        # A failed Main exit also stops its KillMode=control-group service.
        return 1
    finally:
        if controller_fd is not None: os.close(controller_fd)
        os.close(root)


def create_job(request, context, phase, assets, expected_assets, phase_data):
    root = private_dir(BASE)
    jobs = job_fd = None
    try:
        try:
            os.mkdir('setup-jobs', 0o700, dir_fd=root)
            os.fsync(root)
        except FileExistsError:
            pass
        jobs = private_dir(BASE + '/setup-jobs')
        nonce = request['nonce']
        os.mkdir(nonce, 0o700, dir_fd=jobs)  # Durable, exclusive replay/partial-state guard.
        os.fsync(jobs)
        job_fd = private_dir(BASE + '/setup-jobs/' + nonce)
        for name in ASSETS:
            bounded(context['deadline'])
            write_new(job_fd, name, assets[name], 0o500)
        job = {'schema': 'helmut-setup-service-job-v1', 'request': request,
            'controller_source_sha256': context['source_sha256'], 'plan_sha256': PLAN, 'case_id': CASE,
            'phase': phase, 'boot_id': boot_id(), 'deadline': context['deadline'],
            'runtime_seconds': min(295, int(context['deadline'] - time.monotonic()) - 5),
            'controller': process(os.getpid()), 'phase_data': phase_data, 'assets': expected_assets}
        job_check(job, nonce)
        raw = encoded(job)
        write_new(job_fd, 'JOB.PRIVATE.json', raw)
        answer, job_fd = job_fd, None
        return answer, job, raw
    except BaseException as error:
        if job_fd is not None: save_error(job_fd, error, phase)
        raise
    finally:
        for fd in (job_fd, jobs, root):
            if fd is not None: os.close(fd)


def start_service(job):
    bounded(job['deadline'])
    need(job['runtime_seconds'] <= job['deadline'] - time.monotonic(), 'UNIT_RUNTIME')
    props = ['KillMode=control-group', 'RuntimeMaxSec=' + str(job['runtime_seconds']), 'TimeoutStopSec=5',
        'Restart=no', 'RemainAfterExit=yes', 'Type=exec', 'StandardOutput=null', 'StandardError=null',
        'UMask=0077', 'User=root', 'Group=root', 'Delegate=no', 'SendSIGKILL=yes',
        'KillSignal=SIGTERM', 'FinalKillSignal=SIGKILL', 'TimeoutStopFailureMode=kill']
    argv = ['/usr/bin/systemd-run', '--quiet', '--unit=' + unit_name(job['request']['nonce'])]
    argv += ['--property=' + value for value in props] + ['--'] + worker_argv(job['request']['nonce'])
    command(argv, job['deadline'])


def accepted_exit(job, baseline, fields):
    need(fields['InvocationID'] == baseline['invocation_id']
         and fields['ExecMainPID'] == str(baseline['worker']['pid'])
         and int(fields['ExecMainStartTimestampMonotonic']) == baseline['unit_start_us'], 'UNIT_REPLACED')


def exit_snapshot(job, baseline):
    end = min(job['deadline'], time.monotonic() + 3)
    while True:
        try:
            fields = unit_snapshot(job, finished=True)
            accepted_exit(job, baseline, fields)
            return fields
        except Stop as error:
            # pidfd notification can precede systemd's SIGCHLD accounting.
            if str(error) != 'UNIT_EXIT' or time.monotonic() >= end:
                raise
            time.sleep(.025)


def run_setup_phase(request, context, phase, assets, expected_assets, phase_data):
    root = pidfd = job = raw = baseline = None
    try:
        admin()
        request_check(request, context)
        phase_data_check(phase, phase_data)
        assets_check(assets, expected_assets)
        bounded(context['deadline'], MARGIN[phase])
        root, job, raw = create_job(request, context, phase, assets, expected_assets, phase_data)
        start_service(job)
        baseline = worker_identity(job, root, raw)
        pidfd = os.pidfd_open(baseline['worker']['pid'], 0)
        need(not exited(pidfd), 'WORKER_EXITED')
        worker_identity(job, root, raw, baseline)
        arm = {'schema': 'helmut-setup-service-arm-v1', 'nonce': request['nonce'], 'job_sha256': sha(raw),
               'controller_source_sha256': context['source_sha256'], 'worker': baseline['worker']}
        write_new(root, 'ARM.PRIVATE.json', encoded(arm))
        while absent(root, 'RESULT.PENDING.PRIVATE.json'):
            bounded(job['deadline'])
            need(absent(root, 'FIRST_ERROR.PRIVATE.json'), 'WORKER_FAILED')
            need(not exited(pidfd), 'WORKER_EXITED')
            time.sleep(.025)
        pending = regular(root, 'RESULT.PENDING.PRIVATE.json')
        value = result_check(parsed(pending), phase)
        worker_identity(job, root, raw, baseline)
        need(not exited(pidfd) and absent(root, 'FIRST_ERROR.PRIVATE.json')
             and cgroup_pids(baseline['cgroup']) == [baseline['worker']['pid']], 'CGROUP_NOT_SOLE_WORKER')
        sole = {'cgroup': baseline['cgroup'], 'pids': [baseline['worker']['pid']], 'worker': baseline['worker']}
        ack = {'schema': 'helmut-setup-service-ack-v1', 'nonce': request['nonce'], 'job_sha256': sha(raw),
               'result_sha256': sha(pending), 'worker': baseline['worker']}
        write_new(root, 'ACK.PRIVATE.json', encoded(ack))
        while not exited(pidfd):
            bounded(job['deadline'])
            need(absent(root, 'FIRST_ERROR.PRIVATE.json'), 'WORKER_FAILED')
            time.sleep(.025)
        bounded(job['deadline'])
        exit_snapshot(job, baseline)
        load_job(root, request['nonce'], raw)
        need(boot_id() == job['boot_id'] and absent(root, 'FIRST_ERROR.PRIVATE.json')
             and absent(root, 'RESULT.PENDING.PRIVATE.json')
             and regular(root, 'RESULT.PRIVATE.json') == pending, 'FINAL_RESULT')
        lifecycle = {'schema': 'helmut-setup-service-lifecycle-v1', 'nonce': request['nonce'],
            'phase': phase, 'controller_source_sha256': context['source_sha256'], 'job_sha256': sha(raw),
            'boot_id': job['boot_id'], 'unit': unit_name(request['nonce']), 'runtime_seconds': job['runtime_seconds'],
            'invocation_id': baseline['invocation_id'], 'worker': baseline['worker'], 'sole_worker': sole,
            'pidfd_exited': True, 'unit_exit_code': 0, 'result_sha256': sha(pending)}
        return {**value, 'lifecycle_proof': lifecycle}
    except BaseException as error:
        if root is not None:
            save_error(root, error, phase)
        if baseline is not None:
            try: stop_owned(job, root, raw, baseline)
            except BaseException: pass
        return {'status': 'FAIL_KEEP_STATE_NO_RETRY', 'phase': phase if phase in PHASES else None,
                'code': str(error) if isinstance(error, Stop) else 'SETUP_GUARD_FAILURE',
                'native_qualified': False, 'native_go_consumed': False}
    finally:
        for fd in (pidfd, root):
            if fd is not None: os.close(fd)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2 or argv[0] != '--setup-phase-worker':
        print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
        return 2
    try: return worker(argv[1])
    except BaseException: return 1


if __name__ == '__main__':
    raise SystemExit(main())
