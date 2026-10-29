"""Fresh measured GitHub worker bootstrap; no original-data action on import.

launch() accepts a bounded public request and a separate private in-memory
payload. A root service stages committed Git blobs and pinned public binaries
inside the fresh limited parent, then forks only restore_workflow.run_worker.
The service and worker have closed stdout/stderr. Results use private IPC.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import grp
import hashlib
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import pwd
import re
import signal
import socket
import stat
import struct
import subprocess
import time
import uuid

SCRIPT = Path(__file__).absolute()
REPO = SCRIPT.parents[2]


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_start_' + name, SCRIPT.with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


P, C = _load('runner_parent'), _load('controller_context')
LIMITS = {'comparisonBudgetBytes': 2560000000, 'maximumConsumptionBytes': 2048000000,
          'requiredReserveBytes': 512000000, 'swapBytes': 0}
WALL = {'end500-restore-synthetic': 300, 'end500-restore-gated': 1800, 'end500-full-gated': 3600}
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
MAX_FILES, MAX_SOURCE_BYTES, MAX_BLOB = 4096, 128 * 1024 * 1024, 16 * 1024 * 1024
MAX_IPC, MAX_RESULT, CHUNK = 1024 * 1024, 65536, 1024 * 1024
REQUEST_KEYS = {'schema', 'mode', 'exactCommit', 'runId', 'runAttempt', 'nonce', 'branch', 'imageId',
                'nodeSource', 'postgrestSource', 'sourceQualification', 'approval', 'limits', 'maximumWallSeconds'}
ENV = {**P.ENV, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
       'GIT_TERMINAL_PROMPT': '0', 'GIT_OPTIONAL_LOCKS': '0'}
GIT_OPTIONS = ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
               '-c', 'core.autocrlf=false', '-c', 'core.attributesFile=/dev/null', '-c', 'gc.auto=0',
               '-c', 'maintenance.auto=false']
PHASE = 'arguments'
PHASES = {'arguments', 'binding', 'parent', 'service', 'staging', 'worker', 'closure', 'ipc'}
WORKER_STATUS = {'end500-restore-synthetic': 'PASS_SYNTHETIC_RUNNER_BINDINGS_ONLY_START_BLOCKED',
                 'end500-restore-gated': 'PASS_SAME_JOB_RESTORE_BACKUP_500_INACTIVE_ONLY_START_BLOCKED',
                 'end500-full-gated': 'PASS_END500_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'}
WORKER_BOOLEANS = {'isolatedRestoreObserved', 'end500BodyCompleted', 'originalTransferPerformed',
                   'backupRoundtripVerified', 'sourceQualificationBound', 'syntheticQualification'}
WORKER_FALSE = {'executionAuthority', 'end500Acceptance', 'mock500Acceptance',
                'productionActions', 'fullLifetimeMemoryAccepted'}
WORKER_PHASES = {'arguments', 'event', 'approval', 'qualification', 'binding', 'resources',
                 'synthetic', 'receive-prepare', 'restore', 'end500', 'backup', 'closure'}


class RunnerStartError(RuntimeError):
    def __init__(self, phase=None, worker_phase=None):
        self.phase = phase if phase in PHASES else PHASE if PHASE in PHASES else 'arguments'
        self.worker_phase = worker_phase if type(worker_phase) is str and worker_phase in WORKER_PHASES else None
        self.safe_failure = {'phase': self.phase}
        if self.worker_phase is not None:
            self.safe_failure['worker'] = {'phase': self.worker_phase}
        super().__init__('RUNNER_START_FAILED_OR_UNKNOWN')


def need(value):
    if not value:
        raise RunnerStartError()


def _decode(raw):
    need(isinstance(raw, bytes) and 0 < len(raw) <= MAX_IPC)
    return C.P.decode(raw)


def _encode(value, maximum=MAX_IPC):
    raw = json.dumps(value, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')
    need(0 < len(raw) <= maximum)
    return raw


def _worker_result(result, request):
    """Only B's closed public scalar receipt can leave the private IPC channel."""
    fields = {'status', 'mode', 'exactCommit', 'runId', 'runAttempt', 'verifiedFiles', 'verifiedBytes'}
    need(type(result) is dict and set(result) == fields | WORKER_BOOLEANS | WORKER_FALSE
         and result['status'] == WORKER_STATUS[request['mode']]
         and all(result[key] == request[key] for key in ('mode', 'exactCommit', 'runId', 'runAttempt'))
         and type(result['runAttempt']) is int and result['runAttempt'] == 1
         and all(type(result[key]) is bool for key in WORKER_BOOLEANS | WORKER_FALSE)
         and all(result[key] is False for key in WORKER_FALSE)
         and type(result['verifiedFiles']) is int and type(result['verifiedBytes']) is int
         and result['sourceQualificationBound'] is True)
    synthetic = request['mode'] == 'end500-restore-synthetic'
    need(result['verifiedFiles'] == (0 if synthetic else 12)
         and result['verifiedBytes'] == (0 if synthetic else 242570240)
         and result['syntheticQualification'] is synthetic
         and result['originalTransferPerformed'] is (not synthetic)
         and result['isolatedRestoreObserved'] is (not synthetic)
         and result['backupRoundtripVerified'] is (not synthetic)
         and result['end500BodyCompleted'] is (request['mode'] == 'end500-full-gated'))
    return {key: result[key] for key in sorted(result)}


def _response_error(value):
    need(type(value) is dict and value.get('ok') is False
         and set(value) in ({'ok', 'phase'}, {'ok', 'phase', 'workerPhase'})
         and value.get('phase') in PHASES
         and ('workerPhase' not in value or value['workerPhase'] in WORKER_PHASES))
    return RunnerStartError(value['phase'], value.get('workerPhase'))


def _path(value):
    need(type(value) is str and value.startswith('/') and value != '/'
         and str(Path(value)) == value and all(p not in ('', '.', '..') for p in value[1:].split('/'))
         and all(ord(c) >= 32 and ord(c) != 127 for c in value))
    return Path(value)


def _directory(path):
    path = _path(str(path))
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in str(path)[1:].split('/'):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def validate_request(request, private_payload):
    need(type(request) is dict and set(request) == REQUEST_KEYS
         and request['schema'] == 'helmut-w15-runner-request/1' and request['mode'] in WALL
         and type(request['runAttempt']) is int and request['runAttempt'] == 1
         and request['branch'] == BRANCH and request['limits'] == LIMITS
         and all(type(v) is int for v in request['limits'].values())
         and type(request['maximumWallSeconds']) is int
         and request['maximumWallSeconds'] == WALL[request['mode']]
         and re.fullmatch('sha256:[a-f0-9]{64}', request['imageId']))
    P.context(request['runId'], request['exactCommit'], request['nonce'])
    _path(request['nodeSource']); _path(request['postgrestSource'])
    need(type(request['sourceQualification']) is dict and type(request['approval']) is dict
         and len(_encode(request['sourceQualification'])) <= 512 * 1024)
    need(type(private_payload) is dict)
    if request['mode'] == 'end500-restore-synthetic':
        need(private_payload == {})
    else:
        need(set(private_payload) == {'cipherIndex', 'keyB64', 'passphrase', 'eventInputs', 'artifactCredentials'})
        for key, maximum in (('cipherIndex', 65535), ('keyB64', 49152), ('passphrase', 4096)):
            need(type(private_payload[key]) is str and 0 < len(private_payload[key].encode('utf-8')) <= maximum)
        need(type(private_payload['eventInputs']) is dict and len(_encode(private_payload['eventInputs'])) <= 65535
             and type(private_payload['artifactCredentials']) is dict
             and len(_encode(private_payload['artifactCredentials'])) <= 65536)
    _encode({'request': request, 'private': private_payload})
    return request


def _ctx(request):
    return P.context(request['runId'], request['exactCommit'], request['nonce'])


def _roots(request):
    stem = 'helmut-w15-runner-' + request['runId'] + '-' + uuid.UUID(request['nonce']).hex
    return Path('/tmp') / stem, Path('/tmp') / (stem + '-ipc')


def _command(argv, *, timeout=60, maximum=2 * 1024 * 1024):
    result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=ENV, timeout=timeout, close_fds=True)
    need(result.returncode == 0 and len(result.stdout) <= maximum)
    return result.stdout


def _git(repo, args, **kwargs):
    return _command(['/usr/bin/git', *GIT_OPTIONS, '-c', 'safe.directory=' + str(repo),
                     '-C', str(repo), *args], **kwargs)


def github_binding(request):
    need(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_RUN_ID') == request['runId'] and os.environ.get('GITHUB_RUN_ATTEMPT') == '1'
         and os.environ.get('GITHUB_SHA') == request['exactCommit'] and os.environ.get('GITHUB_REF') == BRANCH)
    need(_git(REPO, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    for file in (SCRIPT, SCRIPT.with_name('runner_parent.py'), SCRIPT.with_name('common_resources.py'),
                 SCRIPT.with_name('controller_context.py')):
        relative = str(file.relative_to(REPO))
        entry = _git(REPO, ['ls-tree', '-z', request['exactCommit'], '--', relative])
        header, name = entry.rstrip(b'\0').split(b'\t')
        mode, kind, digest = header.split()
        need(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() == relative and not file.is_symlink())
        raw = file.read_bytes()
        need(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == digest)


def _identity_available():
    need(pwd.getpwuid(1000).pw_uid == 1000 and grp.getgrgid(1000).gr_gid == 1000)
    return P.socket_gid()


def _tree_rows(raw):
    need(isinstance(raw, bytes) and len(raw) <= 2 * 1024 * 1024)
    rows, total, seen = [], 0, set()
    for entry in raw.split(b'\0'):
        if not entry:
            continue
        header, filename = entry.split(b'\t', 1)
        mode, kind, digest, size = header.split()
        name = filename.decode('utf-8')
        parts = C.P.parts(name)
        need(not any(p.casefold() == '.git' for p in parts) and len(filename) <= 4096
             and all(ord(c) >= 32 and ord(c) != 127 for c in name) and name not in seen
             and mode in (b'100644', b'100755') and kind == b'blob' and re.fullmatch(b'[a-f0-9]{40}', digest))
        count = int(size)
        need(0 <= count <= MAX_BLOB)
        total += count; seen.add(name)
        need(len(seen) <= MAX_FILES and total <= MAX_SOURCE_BYTES)
        rows.append((name, mode, digest, count))
    need(rows and 'scripts/w15-github/restore_workflow.py' in seen)
    return rows


def _copy_blob(process, root, row, guard):
    name, mode, digest, size = row
    parts = C.P.parts(name)
    parent = _directory(root)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=parent)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent); parent = child
        process.stdin.write(digest + b'\n'); process.stdin.flush()
        header = process.stdout.readline(128)
        need(header == digest + b' blob ' + str(size).encode() + b'\n')
        fd = os.open(parts[-1], os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o700 if mode == b'100755' else 0o600, dir_fd=parent)
        try:
            sha, git_sha, remaining = hashlib.sha256(), hashlib.sha1(), size
            git_sha.update(b'blob ' + str(size).encode() + b'\0')
            while remaining:
                guard()
                block = process.stdout.read(min(CHUNK, remaining))
                need(block)
                sha.update(block); git_sha.update(block); remaining -= len(block)
                view = memoryview(block)
                while view:
                    written = os.write(fd, view); need(written > 0); view = view[written:]
                guard()
            need(process.stdout.read(1) == b'\n' and git_sha.hexdigest().encode() == digest)
            os.fsync(fd)
            os.lseek(fd, 0, os.SEEK_SET)
            back, read_size = hashlib.sha256(), 0
            while True:
                guard()
                block = os.read(fd, CHUNK)
                guard()
                if not block:
                    break
                read_size += len(block); back.update(block)
            need(read_size == size and back.digest() == sha.digest())
            return {'bytes': size, 'sha256': sha.hexdigest()}
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def copy_committed_repo(request, destination, guard):
    """Own shallow object DB, raw blobs and index; no filters, alternates or links."""
    destination = Path(destination)
    need(not destination.exists())
    destination.mkdir(mode=0o700)
    guard()
    _git(destination, ['init', '--quiet', '--template='])
    _git(destination, ['-c', 'protocol.file.allow=always', 'fetch', '--quiet', '--depth=1', '--no-tags',
                       '--no-recurse-submodules', REPO.as_uri(), request['exactCommit']], timeout=90)
    need(_git(destination, ['rev-parse', 'FETCH_HEAD']) == (request['exactCommit'] + '\n').encode())
    _git(destination, ['update-ref', '--no-deref', 'HEAD', request['exactCommit']])
    _git(destination, ['read-tree', request['exactCommit']])
    _git(destination, ['fsck', '--strict', '--no-reflogs', '--connectivity-only', request['exactCommit']], timeout=90)
    need(not (destination / '.git/objects/info/alternates').exists())
    rows = _tree_rows(_git(destination, ['ls-tree', '-rlz', '--full-tree', request['exactCommit']]))
    guard()
    process = subprocess.Popen(['/usr/bin/git', *GIT_OPTIONS, '-C', str(destination), 'cat-file', '--batch'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               env=ENV, close_fds=True)
    pins = {}
    try:
        for row in rows:
            pins[row[0]] = _copy_blob(process, destination, row, guard)
        process.stdin.close()
        need(process.wait(timeout=15) == 0)
    finally:
        if process.poll() is None:
            process.kill(); process.wait(timeout=10)
        process.stdout.close()
        if not process.stdin.closed:
            process.stdin.close()
    need(_git(destination, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    guard()
    return pins


def _binary(source, destination, expected, source_uid, guard):
    parent = _directory(Path(source).parent)
    fd = None
    try:
        fd = os.open(Path(source).name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid in (0, source_uid)
             and before.st_mode & 0o022 == 0 and before.st_size == expected['bytes'])
        with open(destination, 'xb', buffering=0) as output:
            os.fchmod(output.fileno(), 0o700)
            sha, size = hashlib.sha256(), 0
            while True:
                guard(); block = os.read(fd, CHUNK); guard()
                if not block:
                    break
                size += len(block); need(size <= expected['bytes']); sha.update(block)
                view = memoryview(block)
                while view:
                    written = output.write(view); need(written > 0); view = view[written:]
                guard()
            after = os.fstat(fd)
            need(size == expected['bytes'] and sha.hexdigest() == expected['sha256']
                 and (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns,
                      before.st_nlink, before.st_uid, before.st_mode) ==
                     (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns,
                      after.st_nlink, after.st_uid, after.st_mode))
            os.fsync(output.fileno())
        sha, size = hashlib.sha256(), 0
        with open(destination, 'rb', buffering=0) as copied:
            while True:
                guard(); block = copied.read(CHUNK); guard()
                if not block:
                    break
                size += len(block); sha.update(block)
        need(size == expected['bytes'] and sha.hexdigest() == expected['sha256'])
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def _own_new_tree(root):
    """Only the exclusively created new tree; never chmod/chown source checkout."""
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        path = Path(directory)
        need(path.is_dir() and not path.is_symlink())
        os.chmod(path, 0o700, follow_symlinks=False); os.chown(path, 1000, 1000, follow_symlinks=False)
        for name in files:
            file = path / name
            value = file.lstat()
            need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1)
            os.chmod(file, 0o700 if value.st_mode & 0o111 else 0o600, follow_symlinks=False)
            os.chown(file, 1000, 1000, follow_symlinks=False)
            total += value.st_size
        need(not any((path / name).is_symlink() for name in dirs))
    return total


def _stage(request, guard):
    root, _ = _roots(request)
    need(not root.exists())
    need(_git(REPO, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    root.mkdir(mode=0o700)
    repo = root / 'repo'
    pins = copy_committed_repo(request, repo, guard)
    binaries_root = root / 'binaries'; binaries_root.mkdir(mode=0o700)
    source_uid = REPO.lstat().st_uid
    binaries = {}
    for name, source in (('node', request['nodeSource']), ('postgrest', request['postgrestSource'])):
        destination = binaries_root / name
        _binary(source, destination, C.RUNTIME[name], source_uid, guard)
        binaries[name] = {'path': str(destination), 'bytes': C.RUNTIME[name]['bytes'], 'sha256': C.RUNTIME[name]['sha256']}
    for name in ('worker-temp', 'rollback', 'backup'):
        (root / name).mkdir(mode=0o700)
    # Count the actual new repo including its independent shallow Git objects.
    checkout_bytes = _own_new_tree(repo)
    _own_new_tree(root)
    need(_git(REPO, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    guard()
    manifest = {key: value for key, value in request.items() if key not in ('nodeSource', 'postgrestSource', 'schema')}
    manifest.update(schema='helmut-w15-runner-manifest/1', stagedRepo=str(repo), runnerTemp=str(root / 'worker-temp'),
                    rollbackRoot=str(root / 'rollback'), backupRoot=str(root / 'backup'),
                    parentUnit=P.names(_ctx(request))[0], binaries=binaries, sourcePins=pins,
                    checkoutBytes=checkout_bytes, binaryBytes=sum(row['bytes'] for row in binaries.values()))
    need(len(_encode(manifest)) <= MAX_IPC)
    return manifest


def _close_stdio():
    fd = os.open('/dev/null', os.O_RDWR)
    try:
        for target in (0, 1, 2):
            os.dup2(fd, target)
    finally:
        if fd > 2:
            os.close(fd)


def _worker_env(manifest):
    return {**P.ENV, 'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
            'GITHUB_SHA': manifest['exactCommit'], 'GITHUB_REF': manifest['branch'],
            'GITHUB_RUN_ID': manifest['runId'], 'GITHUB_RUN_ATTEMPT': '1', 'RUNNER_TEMP': manifest['runnerTemp']}


def _fork_worker(manifest, private_payload, sender, receiver, docker_gid):
    receiver.close()
    code = 1
    latch = None
    try:
        _close_stdio()
        os.environ.clear(); os.environ.update(_worker_env(manifest))
        os.setgroups([docker_gid]); os.setgid(1000); os.setuid(1000)
        need(os.getuid() == os.getgid() == 1000 and os.getgroups() == [docker_gid])
        latch = P.StopLatch()
        script = Path(manifest['stagedRepo']) / 'scripts/w15-github/restore_workflow.py'
        raw = script.read_bytes(); pin = manifest['sourcePins']['scripts/w15-github/restore_workflow.py']
        need(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256'])
        spec = importlib.util.spec_from_file_location('w15_fixed_staged_restore_worker', script)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        result = module.run_worker(manifest, private_payload)
        result = _worker_result(result, manifest)
        need(not latch.seen)
        sender.send_bytes(_encode({'ok': True, 'result': result}, MAX_RESULT))
        code = 0
    except BaseException as error:
        try:
            child_phase = getattr(error, 'phase', None)
            failure = {'ok': False, 'phase': 'worker'}
            if type(child_phase) is str and child_phase in WORKER_PHASES:
                failure['workerPhase'] = child_phase
            sender.send_bytes(_encode(failure, MAX_RESULT))
        except BaseException:
            pass
    finally:
        if latch is not None:
            latch.close()
        sender.close()
    raise SystemExit(code)


def _members(ctx):
    root = P.R.KERNEL_ROOT / P.names(ctx)[0]
    return {int(pid) for file in root.rglob('cgroup.procs') for pid in file.read_text().split()}


def supervise(request, private_payload):
    """Already inside the bounded root service; no setup write precedes guard."""
    global PHASE
    validate_request(request, private_payload)
    need(os.getuid() == 0)
    ctx = _ctx(request); path = P.R.KERNEL_ROOT / P.names(ctx)[0]
    identity = P.identity(path)
    need(P.R.membership(Path('/proc/self/cgroup').read_text()).startswith('/' + P.names(ctx)[0] + '/'))
    deadline = time.monotonic() + request['maximumWallSeconds']
    def guard():
        need(time.monotonic() < deadline)
        return P.read_parent(ctx, identity)
    guard(); docker_gid = _identity_available()
    PHASE = 'staging'; manifest = _stage(request, guard)
    PHASE = 'worker'
    fork = multiprocessing.get_context('fork')
    receiver, sender = fork.Pipe(duplex=False)
    child = fork.Process(target=_fork_worker, args=(manifest, private_payload, sender, receiver, docker_gid))
    response = None
    try:
        child.start(); sender.close()
        while child.is_alive():
            guard()
            if response is None and receiver.poll(0):
                response = _decode(receiver.recv_bytes(maxlength=MAX_RESULT))
            time.sleep(.1)
        child.join(timeout=5)
        if response is None and receiver.poll(1):
            response = _decode(receiver.recv_bytes(maxlength=MAX_RESULT))
        if type(response) is dict and response.get('ok') is False:
            raise _response_error(response)
        need(child.exitcode == 0 and type(response) is dict and set(response) == {'ok', 'result'}
             and response['ok'] is True and type(response['result']) is dict)
        response['result'] = _worker_result(response['result'], request)
        PHASE = 'closure'; guard()
        need(_members(ctx) == {os.getpid()})
        return {'worker': response['result'], 'workerExited': True,
                'checkoutFiles': len(manifest['sourcePins']), 'checkoutBytes': manifest['checkoutBytes'],
                'binaryBytes': manifest['binaryBytes'], 'dockerSocketGID': docker_gid,
                'workerUID': 1000, 'workerGID': 1000}
    finally:
        if child.pid is not None and child.is_alive():
            child.terminate(); child.join(timeout=30)
            if child.is_alive():
                child.kill(); child.join(timeout=5)
        receiver.close(); sender.close()


def _send_result(ipc_dir, ctx, value):
    _, expected = _roots(ctx)
    need(Path(ipc_dir) == expected and expected.lstat().st_mode & 0o777 == 0o700 and not expected.is_symlink())
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(10); connection.connect(str(expected / 'result.sock'))
        raw = _encode(value, MAX_RESULT)
        connection.sendall(struct.pack('!I', len(raw)) + raw)


def _service_argv(request, ipc_dir):
    ctx = _ctx(request); unit, service, _ = P.names(ctx)
    return ['/usr/bin/sudo', '-n', '/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
            '--service-type=exec', '--unit=' + service, '--slice=' + unit,
            '--property=User=0', '--property=Group=0', '--property=RuntimeMaxSec=' + str(request['maximumWallSeconds']),
            '--property=TimeoutStopSec=40', '--property=KillMode=control-group',
            '/usr/bin/env', '-i', *[key + '=' + value for key, value in P.process_env(ctx).items()],
            '/usr/bin/python3', '-B', str(SCRIPT), '--internal-supervisor', '--expected-commit', ctx['exactCommit'],
            '--run-id', ctx['runId'], '--nonce', ctx['nonce'], '--ipc-dir', str(ipc_dir)]


def _receive_result(listener, process, deadline):
    listener.settimeout(.2)
    connection = None
    while connection is None:
        need(time.monotonic() < deadline)
        try:
            connection, _ = listener.accept()
        except socket.timeout:
            need(process.poll() is None)
    with connection:
        need(struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1] == 0)
        connection.settimeout(5)
        def read(size):
            raw = b''
            while len(raw) < size:
                chunk = connection.recv(size - len(raw)); need(chunk); raw += chunk
            return raw
        length = struct.unpack('!I', read(4))[0]
        need(0 < length <= MAX_RESULT)
        return _decode(read(length))


def launch(request, private_payload):
    """Explicit entry, no arbitrary command/worker/path selector and no retry."""
    global PHASE
    request = _decode(_encode(request)); private_payload = _decode(_encode(private_payload))
    validate_request(request, private_payload)
    PHASE = 'binding'; github_binding(request); _identity_available()
    ctx = _ctx(request); root, ipc_dir = _roots(request)
    need(not root.exists() and not ipc_dir.exists())
    ipc_dir.mkdir(mode=0o700)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(ipc_dir / 'result.sock')); os.chmod(ipc_dir / 'result.sock', 0o600); listener.listen(1)
    created, process, failure, result, identity, latch = False, None, None, None, None, P.StopLatch()
    try:
        PHASE = 'parent'; P.privileged('prepare', ctx); created = True
        identity = P.identity(P.R.KERNEL_ROOT / P.names(ctx)[0])
        initial = P.read_parent(ctx, identity, empty=True)
        PHASE = 'service'
        process = subprocess.Popen(_service_argv(request, ipc_dir), stdin=subprocess.PIPE,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   env=ENV, close_fds=True, start_new_session=True)
        raw = _encode({'request': request, 'private': private_payload})
        process.stdin.write(raw); process.stdin.close()
        result = _receive_result(listener, process, time.monotonic() + request['maximumWallSeconds'] + 45)
        if type(result) is dict and result.get('ok') is False:
            raise _response_error(result)
        need(process.wait(timeout=45) == 0 and type(result) is dict and result.get('ok') is True)
        need(type(result.get('result')) is dict)
        result['result']['worker'] = _worker_result(result['result']['worker'], request)
        PHASE = 'closure'
        final = P.read_parent(ctx, identity, empty=True)
        need(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes'] and not latch.seen)
        return {'status': 'PASS_FRESH_RUNNER_OWNED_LIFETIME_ONLY', 'exactCommit': ctx['exactCommit'],
                'runId': ctx['runId'], 'runAttempt': 1, 'mode': request['mode'],
                'initialCommonParent': initial, 'finalCommonParentAfterOwnedExits': final,
                'sameKernelParentIdentity': True, 'ownedChildrenExited': True,
                'workerResult': result['result']['worker'],
                'workerRoles': {key: result['result'][key] for key in (
                    'workerExited', 'checkoutFiles', 'checkoutBytes', 'binaryBytes',
                    'dockerSocketGID', 'workerUID', 'workerGID')}, 'executionAuthority': False,
                'end500Acceptance': False, 'mock500Acceptance': False,
                'commonLifetimeMemoryAccepted': False, 'retryAllowed': False}
    except BaseException as error:
        failure = error if isinstance(error, RunnerStartError) else RunnerStartError(PHASE)
        raise failure from None
    finally:
        latch.cleaning = True
        cleanup_error = None
        if created:
            try:
                # On failure, terminate only the exclusively created parent.
                # Its inode/content remain available until final readback.
                if failure is not None:
                    if identity is not None:
                        need(P.identity(P.R.KERNEL_ROOT / P.names(ctx)[0]) == identity)
                    _command(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'kill', '--kill-whom=all',
                              '--signal=SIGKILL', P.names(ctx)[0]], timeout=15)
            except BaseException as error:
                cleanup_error = error
            try:
                P.privileged('remove', ctx)
            except BaseException:
                cleanup_error = True
        try:
            if process is not None and process.poll() is None:
                process.kill(); process.wait(timeout=10)
        except BaseException:
            cleanup_error = True
        finally:
            listener.close(); latch.close()
        if cleanup_error is not None and failure is None:
            raise RunnerStartError('closure') from None


def main(argv=None):
    """Internal service only; public launch is called by the fixed worker CLI."""
    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument('--internal-supervisor', action='store_true', required=True)
    parser.add_argument('--expected-commit', required=True); parser.add_argument('--run-id', required=True)
    parser.add_argument('--nonce', required=True); parser.add_argument('--ipc-dir', required=True)
    args = parser.parse_args(argv)
    ctx = P.context(args.run_id, args.expected_commit, args.nonce)
    # This process must never send Python output to the journal or Actions log.
    null = os.open('/dev/null', os.O_WRONLY)
    try:
        os.dup2(null, 1); os.dup2(null, 2)
    finally:
        os.close(null)
    latch = P.StopLatch()
    try:
        need(os.getuid() == 0)
        envelope = _decode(sys.stdin.buffer.read(MAX_IPC + 1))
        need(type(envelope) is dict and set(envelope) == {'request', 'private'})
        request, private_payload = envelope['request'], envelope['private']
        validate_request(request, private_payload)
        need(_ctx(request) == ctx)
        # root privileged helper env intentionally contains no secret values.
        result = supervise(request, private_payload)
        need(not latch.seen)
        _send_result(args.ipc_dir, ctx, {'ok': True, 'result': result})
        return 0
    except BaseException as error:
        try:
            failure = error if isinstance(error, RunnerStartError) else RunnerStartError(PHASE)
            result = {'ok': False, 'phase': failure.phase}
            if failure.worker_phase is not None:
                result['workerPhase'] = failure.worker_phase
            _send_result(args.ipc_dir, ctx, result)
        except BaseException:
            pass
        return 1
    finally:
        latch.close()


if __name__ == '__main__':
    raise SystemExit(main())
