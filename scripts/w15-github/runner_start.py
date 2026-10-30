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
import select
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
D = _load('runner_diagnostics')
LIMITS = {'comparisonBudgetBytes': 2560000000, 'maximumConsumptionBytes': 2048000000,
          'requiredReserveBytes': 512000000, 'swapBytes': 0}
DIAGNOSTIC = 'end500-restore-export-diagnostic'
WALL = {DIAGNOSTIC: 1800, 'end500-restore-synthetic': 300, 'end500-restore-gated': 1800, 'end500-full-gated': 3600}
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
WORKER_STATUS = {DIAGNOSTIC: 'PASS_RESTORE_EXPORT_DIAGNOSTIC_ONLY_FULL_RESTORE_BLOCKED', 'end500-restore-synthetic': 'PASS_SYNTHETIC_RUNNER_BINDINGS_ONLY_START_BLOCKED',
                 'end500-restore-gated': 'PASS_SAME_JOB_RESTORE_BACKUP_500_INACTIVE_ONLY_START_BLOCKED',
                 'end500-full-gated': 'PASS_END500_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'}
WORKER_BOOLEANS = {'isolatedRestoreObserved', 'end500BodyCompleted', 'originalTransferPerformed',
                   'backupRoundtripVerified', 'sourceQualificationBound', 'syntheticQualification'}
WORKER_FALSE = {'executionAuthority', 'end500Acceptance', 'mock500Acceptance',
                'productionActions', 'fullLifetimeMemoryAccepted'}
WORKER_PHASES = {'arguments', 'event', 'approval', 'qualification', 'binding', 'resources',
                 'synthetic', 'receive-prepare', 'restore', 'end500', 'backup', 'closure',
                 'connection-binding', 'connection-receive', 'connection-input-binding',
                 'connection-cache', 'connection-prepare', 'connection-restore', 'connection-closure',
                 'connection-prepared-check', 'connection-materialization', 'connection-container-start',
                 'connection-readiness', 'connection-native-restore', 'connection-backup',
                 'receiver-arguments', 'receiver-source-binding', 'receiver-private-inputs',
                 'receiver-index', 'receiver-disk-admission', 'receiver-key-import',
                 'receiver-encrypted-index', 'receiver-download', 'receiver-cipher-readback',
                 'receiver-authenticated-reception', 'receiver-relocation', 'receiver-agent-close'}
BACKUP_PHASES = {'backup-export', 'backup-freeze', 'backup-collect', 'backup-seal',
                 'backup-transport', 'backup-authenticate', 'backup-recovery', 'backup-postcheck'}
WORKER_PHASES |= {'connection-export-' + action for action in ('backup-before', 'backup-dump', 'backup-roles', 'backup-after')}
WORKER_PHASES |= BACKUP_PHASES | {'connection-' + phase for phase in BACKUP_PHASES}


class RunnerStartError(RuntimeError):
    allowed_worker_phases = WORKER_PHASES

    def __init__(self, phase=None, worker_phase=None, worker_memory=None, *, runner=None, cleanup=None):
        self.phase = phase if type(phase) is str and phase in PHASES else PHASE if PHASE in PHASES else 'arguments'
        self.worker_phase = worker_phase if type(worker_phase) is str and worker_phase in self.allowed_worker_phases else None
        self.worker_memory = _closed_memory(worker_memory)
        self.runner = D.runner(runner, _closed_memory)
        self.cleanup = D.cleanup(cleanup)
        self.refresh()
        super().__init__('RUNNER_START_FAILED_OR_UNKNOWN')

    def refresh(self):
        self.safe_failure = {'phase': self.phase}
        if self.worker_phase is not None:
            self.safe_failure['worker'] = {'phase': self.worker_phase}
            if self.worker_memory is not None:
                self.safe_failure['worker']['memory'] = self.worker_memory
        if self.runner is not None:
            self.safe_failure['runner'] = self.runner
        if self.cleanup is not None:
            self.safe_failure['cleanup'] = self.cleanup


def _closed_memory(value):
    try:
        return P.R.closed_failure_memory(value)
    except BaseException:
        return None


def _diagnose(error, phase, reason, cached=None, *, error_type=RunnerStartError):
    if isinstance(error, KeyboardInterrupt):
        reason = 'SUPERVISOR_INTERRUPTED'
    first = error if isinstance(error, error_type) else error_type(phase)
    detail = dict(first.runner) if first.runner is not None else {
        'reason': 'WORKER_REPORTED_FAILURE' if first.worker_phase is not None else reason}
    observed = _closed_memory(D.attribute(error, 'failure_memory'))
    if observed is not None:
        detail.update(memory=observed, memorySource='CURRENT_REJECTED_READBACK')
    elif 'memory' not in detail and cached is not None:
        cached = dict(cached)
        if reason in ('PARENT_READBACK_REJECTED', 'SUPERVISOR_INTERRUPTED'):
            cached['lastReadbackValid'] = False
        detail.update(memory=cached, memorySource='CACHED_READBACK')
    first.runner = D.runner(detail, _closed_memory)
    first.refresh()
    return first


def _failure_packet(error):
    packet = {'ok': False, 'phase': error.phase}
    if error.worker_phase is not None:
        packet['workerPhase'] = error.worker_phase
        if error.worker_memory is not None:
            packet['workerMemory'] = error.worker_memory
    if error.runner is not None:
        packet['runner'] = error.runner
    if error.cleanup is not None:
        packet['cleanup'] = error.cleanup
    return packet


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
    diagnostic = request['mode'] == DIAGNOSTIC
    if diagnostic:
        fields |= {'diagnosticExportOnly', 'restoreSteps', 'exportActions', 'profiles', 'activeProfiles',
            'ownedContainerStopped', 'watchStopped', 'remoteReadbackObserved', 'databaseRestoreObserved', 'fullRestoreAccepted'}
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
         and result['backupRoundtripVerified'] is (not synthetic and not diagnostic)
         and result['end500BodyCompleted'] is (request['mode'] == 'end500-full-gated'))
    if diagnostic:
        need(result['diagnosticExportOnly'] is True and result['ownedContainerStopped'] is True
             and result['watchStopped'] is True and result['remoteReadbackObserved'] is False
             and result['databaseRestoreObserved'] is False and result['fullRestoreAccepted'] is False
             and all(type(result[k]) is int for k in ('restoreSteps', 'exportActions', 'profiles', 'activeProfiles'))
             and (result['restoreSteps'], result['exportActions'], result['profiles'], result['activeProfiles']) == (5, 4, 500, 0))
    return {key: result[key] for key in sorted(result)}


def _response_error(value, *, error_type=RunnerStartError):
    keys = {'ok', 'phase', 'workerPhase', 'workerMemory', 'runner', 'cleanup'}
    valid = type(value) is dict and {'ok', 'phase'} <= set(value) <= keys and value['ok'] is False
    valid = valid and type(value['phase']) is str and value['phase'] in PHASES
    valid = valid and ('workerPhase' not in value or type(value['workerPhase']) is str
        and value['workerPhase'] in error_type.allowed_worker_phases)
    valid = valid and ('workerMemory' not in value or 'workerPhase' in value and _closed_memory(value['workerMemory']) is not None)
    valid = valid and ('runner' not in value or D.runner(value['runner'], _closed_memory) is not None)
    valid = valid and ('cleanup' not in value or D.cleanup(value['cleanup']) is not None)
    if not valid:
        raise error_type('ipc', runner={'reason': 'WORKER_IPC_REJECTED'})
    return error_type(value['phase'], value.get('workerPhase'), value.get('workerMemory'),
        runner=value.get('runner'), cleanup=value.get('cleanup'))


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
    for file in (SCRIPT, SCRIPT.with_name('runner_parent.py'), SCRIPT.with_name('common_resources.py'), SCRIPT.with_name('runner_diagnostics.py'),
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


def _worker_failure(error, reason, *, error_type=RunnerStartError):
    if isinstance(error, KeyboardInterrupt):
        reason = 'WORKER_INTERRUPTED'
    phase = D.attribute(error, 'phase')
    phase = phase if type(phase) is str and phase in error_type.allowed_worker_phases else None
    memory = _closed_memory(D.attribute(error, 'worker_memory')) if phase is not None else None
    return error_type('worker', phase, memory, runner=None if phase is not None else {'reason': reason})


def _fork_worker(manifest, private_payload, sender, receiver, docker_gid):
    code, latch, result, failure = 1, None, None, None
    reason = 'WORKER_SETUP_REJECTED'
    try:
        receiver.close()
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
        reason = 'WORKER_RESULT_REJECTED'
        result = module.run_worker(manifest, private_payload)
        result = _worker_result(result, manifest)
        need(not latch.seen)
    except BaseException as error:
        failure = _worker_failure(error, reason)
    finally:
        if latch is not None:
            latch.cleaning = True
            try:
                latch.close()
                if latch.seen and failure is None:
                    failure = RunnerStartError('worker', runner={'reason': 'WORKER_CLEANUP_UNCONFIRMED'})
            except BaseException:
                if failure is None:
                    failure = RunnerStartError('worker', runner={'reason': 'WORKER_CLEANUP_UNCONFIRMED'})
        try:
            packet = _failure_packet(failure) if failure is not None else {'ok': True, 'result': result}
            sender.send_bytes(_encode(packet, MAX_RESULT))
            code = 0 if failure is None else 1
        except BaseException:
            code = 1  # The observer will classify missing/partial IPC and exit.
        try:
            sender.close()
        except BaseException:
            code = 1
    raise SystemExit(code)


def _members(ctx):
    root = P.R.KERNEL_ROOT / P.names(ctx)[0]
    return {int(pid) for file in root.rglob('cgroup.procs') for pid in file.read_text().split()}


def _read_worker_response(receiver, deadline, *, wait=0, error_type=RunnerStartError):
    """Read one existing Pipe frame with bounded reads, including partial EOF."""
    try:
        if not receiver.poll(wait):
            return None
        fd = receiver.fileno()
        end = min(deadline, time.monotonic() + 1)
        def read(size):
            raw = b''
            while len(raw) < size:
                remaining = max(0, end - time.monotonic())
                if not select.select([fd], [], [], remaining)[0]:
                    raise error_type('ipc', runner={'reason': 'WORKER_IPC_TIMEOUT'})
                part = os.read(fd, size - len(raw))
                if not part:
                    raise error_type('ipc', runner={'reason': 'WORKER_IPC_EOF'})
                raw += part
            return raw
        length = struct.unpack('!i', read(4))[0]
        if not 0 < length <= MAX_RESULT:
            raise error_type('ipc', runner={'reason': 'WORKER_IPC_REJECTED'})
        value = _decode(read(length))
        if type(value) is not dict or value.get('ok') not in (True, False) or type(value['ok']) is not bool:
            raise error_type('ipc', runner={'reason': 'WORKER_IPC_REJECTED'})
        if value['ok'] is False:
            _response_error(value, error_type=error_type)  # Validate before it can become a witness.
        elif set(value) != {'ok', 'result'} or type(value['result']) is not dict:
            raise error_type('ipc', runner={'reason': 'WORKER_IPC_REJECTED'})
        return value
    except error_type:
        raise
    except Exception:
        raise error_type('ipc', runner={'reason': 'WORKER_IPC_REJECTED'}) from None


def _parent_readback(parent, ctx, identity, last, *, empty=False, error_type=RunnerStartError, phase=None):
    try:
        value = parent.read_parent(ctx, identity, empty=empty)
    except BaseException as error:
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'PARENT_READBACK_REJECTED'
        raise _diagnose(error, phase or PHASE, reason, last.get('memory'), error_type=error_type) from None
    last['memory'] = P.R.project_failure_memory(value, True)
    return value


def _monitor_child(child, receiver, sender, guard, deadline, *, memory=lambda: None,
                   latch=None, error_type=RunnerStartError):
    """Keep the first validated failure, then stop only this owned child."""
    response, failure = None, None
    cleanup = D.unknown_cleanup()
    try:
        try:
            child.start(); sender.close()
        except BaseException as error:
            raise _diagnose(error, 'worker', 'WORKER_START_REJECTED', memory(), error_type=error_type) from None
        while child.is_alive():
            if response is None:
                response = _read_worker_response(receiver, deadline, error_type=error_type)
            if type(response) is dict and response['ok'] is False:
                raise _response_error(response, error_type=error_type)
            guard()
            time.sleep(.1)
        child.join(timeout=5)
        if response is None:
            response = _read_worker_response(receiver, deadline, wait=1, error_type=error_type)
        if type(response) is dict and response['ok'] is False:
            raise _response_error(response, error_type=error_type)
        code = child.exitcode
        if code != 0 or response is None:
            detail = {'reason': 'WORKER_SIGNAL_EXIT' if type(code) is int and code < 0 else
                      'WORKER_EXIT_REJECTED' if response is not None else 'WORKER_EXIT_WITHOUT_REPORT'}
            if type(code) is int and -255 <= code <= 255:
                detail['workerExitCode'] = code
            raise error_type('worker', runner=detail)
    except BaseException as error:
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'SUPERVISOR_REJECTED'
        failure = _diagnose(error, 'worker', reason, memory(), error_type=error_type)
        # A guard can race a message already in the pipe. Drain once BEFORE
        # cleanup/signals; no later cancellation response may become primary.
        if failure.runner and failure.runner['reason'] in {
                'PARENT_READBACK_REJECTED', 'SUPERVISOR_DEADLINE', 'SUPERVISOR_INTERRUPTED', 'SUPERVISOR_REJECTED'}:
            try:
                pending = response
                if pending is None and failure.runner['reason'] != 'SUPERVISOR_INTERRUPTED':
                    pending = _read_worker_response(receiver, deadline, error_type=error_type)
                if type(pending) is dict and pending.get('ok') is False:
                    first = _response_error(pending, error_type=error_type)
                    detail = dict(first.runner or failure.runner)
                    if first.runner:
                        detail['secondaryReason'] = failure.runner['reason']
                    for key in ('memory', 'memorySource'):
                        if key in failure.runner:
                            detail[key] = failure.runner[key]
                    first.runner = D.runner(detail, _closed_memory); first.refresh()
                    failure = first
            except BaseException:
                pass
    finally:
        if latch is not None:
            latch.cleaning = True
        bad, stopped_by_us = False, False
        try:
            if child.pid is not None:
                if child.is_alive():
                    stopped_by_us = True
                    child.terminate(); child.join(timeout=30)
                    if child.is_alive():
                        child.kill(); child.join(timeout=5)
                cleanup['workerExited'] = 'FAIL' if child.is_alive() else 'PASS'
                bad = cleanup['workerExited'] != 'PASS'
        except BaseException:
            bad = True
        closed = True
        for pipe in (receiver, sender):
            try:
                pipe.close()
            except BaseException:
                closed, bad = False, True
        if closed:
            cleanup['workerIPCClosed'] = 'PASS'
        if latch is not None and latch.seen and failure is None:
            failure = error_type('worker', runner={'reason': 'SIGNAL_DURING_CLEANUP'})
        if bad and failure is None:
            failure = error_type('worker', runner={'reason': 'CLEANUP_UNCONFIRMED'})
        if failure is not None:
            code = D.attribute(child, 'exitcode')
            if not stopped_by_us and type(code) is int and -255 <= code <= 255:
                detail = dict(failure.runner or {'reason': 'WORKER_REPORTED_FAILURE' if failure.worker_phase is not None else 'WORKER_EXIT_REJECTED'})
                detail['workerExitCode'] = code
                if code < 0 and failure.worker_phase is None and detail['reason'] in {
                        'WORKER_IPC_EOF', 'WORKER_EXIT_WITHOUT_REPORT', 'WORKER_EXIT_REJECTED'}:
                    detail['reason'] = 'WORKER_SIGNAL_EXIT'
                failure.runner = D.runner(detail, _closed_memory)
            failure.cleanup = cleanup; failure.refresh()
        if latch is not None and failure is None:
            latch.cleaning = False
    if failure is not None:
        raise failure from None
    return response, cleanup


def supervise(request, private_payload, *, latch=None):
    """Already inside the bounded root service; no setup write precedes guard."""
    global PHASE
    validate_request(request, private_payload)
    need(os.getuid() == 0)
    ctx = _ctx(request); path = P.R.KERNEL_ROOT / P.names(ctx)[0]
    identity = P.identity(path)
    need(P.R.membership(Path('/proc/self/cgroup').read_text()).startswith('/' + P.names(ctx)[0] + '/'))
    deadline = time.monotonic() + request['maximumWallSeconds']
    last = {'memory': None}
    def guard():
        if time.monotonic() >= deadline:
            raise RunnerStartError(PHASE, runner={'reason': 'SUPERVISOR_DEADLINE'})
        return _parent_readback(P, ctx, identity, last)
    try:
        guard(); docker_gid = _identity_available()
        PHASE = 'staging'; manifest = _stage(request, guard)
    except BaseException as error:
        raise _diagnose(error, PHASE, 'SUPERVISOR_REJECTED', last['memory']) from None
    PHASE = 'worker'
    try:
        fork = multiprocessing.get_context('fork')
        receiver, sender = fork.Pipe(duplex=False)
        child = fork.Process(target=_fork_worker, args=(manifest, private_payload, sender, receiver, docker_gid))
    except BaseException as error:
        raise _diagnose(error, 'worker', 'WORKER_START_REJECTED', last['memory']) from None
    cleanup = None
    try:
        response, cleanup = _monitor_child(child, receiver, sender, guard, deadline,
            memory=lambda: last['memory'], latch=latch)
        response['result'] = _worker_result(response['result'], request)
        PHASE = 'closure'; guard()
        need(_members(ctx) == {os.getpid()})
        return {'worker': response['result'], 'workerExited': True,
                'checkoutFiles': len(manifest['sourcePins']), 'checkoutBytes': manifest['checkoutBytes'],
                'binaryBytes': manifest['binaryBytes'], 'dockerSocketGID': docker_gid,
                'workerUID': 1000, 'workerGID': 1000}
    except BaseException as error:
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'WORKER_RESULT_REJECTED'
        failure = _diagnose(error, PHASE, reason, last['memory'])
        if cleanup is not None:
            failure.cleanup = cleanup; failure.refresh()
        raise failure from None


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


def _receive_result(listener, process, deadline, *, error_type=RunnerStartError):
    connection, failure, result = None, None, None
    while connection is None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise error_type('ipc', runner={'reason': 'SERVICE_IPC_TIMEOUT'})
        listener.settimeout(min(.2, remaining))
        try:
            connection, _ = listener.accept()
        except socket.timeout:
            code = process.poll()
            if code is not None:
                detail = {'reason': 'SERVICE_EXIT_WITHOUT_REPORT'}
                if type(code) is int and -255 <= code <= 255:
                    detail['serviceExitCode'] = code
                raise error_type('service', runner=detail)
        except Exception:
            raise error_type('ipc', runner={'reason': 'SERVICE_IPC_REJECTED'}) from None
    try:
        if struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1] != 0:
            raise error_type('ipc', runner={'reason': 'SERVICE_IPC_REJECTED'})
        end = min(deadline, time.monotonic() + 5)
        def read(size):
            raw = b''
            while len(raw) < size:
                remaining = end - time.monotonic()
                if remaining <= 0:
                    raise error_type('ipc', runner={'reason': 'SERVICE_IPC_TIMEOUT'})
                connection.settimeout(remaining)
                chunk = connection.recv(size - len(raw))
                if not chunk:
                    raise error_type('ipc', runner={'reason': 'SERVICE_IPC_EOF'})
                raw += chunk
            return raw
        length = struct.unpack('!I', read(4))[0]
        if not 0 < length <= MAX_RESULT:
            raise error_type('ipc', runner={'reason': 'SERVICE_IPC_REJECTED'})
        result = _decode(read(length))
        if type(result) is dict and result.get('ok') is False:
            failure = _response_error(result, error_type=error_type)
    except BaseException as error:
        reason = 'SERVICE_IPC_TIMEOUT' if isinstance(error, socket.timeout) else 'SERVICE_IPC_REJECTED'
        failure = _diagnose(error, 'ipc', reason, error_type=error_type)
    finally:
        try:
            connection.close()
        except BaseException:
            if failure is None:
                failure = error_type('ipc', runner={'reason': 'CLEANUP_UNCONFIRMED'})
            else:
                detail = dict(failure.runner or {'reason': 'WORKER_REPORTED_FAILURE' if failure.worker_phase else 'SERVICE_IPC_REJECTED'})
                detail['secondaryReason'] = 'CLEANUP_UNCONFIRMED'
                failure.runner = D.runner(detail, _closed_memory); failure.refresh()
    if failure is not None:
        raise failure from None
    return result


def _cleanup_launch(ctx, parent, identity, created, process, listener, latch, failure,
                    *, empty_observed=False, error_type=RunnerStartError, kernel_root=None):
    """Separate observed cleanup facts from the immutable first failure."""
    cleanup = dict(failure.cleanup) if failure is not None and failure.cleanup is not None else D.unknown_cleanup()
    seen_before_cleanup = latch.seen
    latch.cleaning = True
    bad = False
    if created:
        path = (P.R.KERNEL_ROOT if kernel_root is None else kernel_root) / parent.names(ctx)[0]
        owned = False
        try:
            owned = identity is not None and parent.identity(path) == identity
        except BaseException:
            pass
        if not owned:
            bad = True  # Never kill OR remove a replaced/unknown parent.
        else:
            if failure is not None:
                detail = dict(failure.runner or {'reason': 'WORKER_REPORTED_FAILURE' if failure.worker_phase else 'SUPERVISOR_REJECTED'})
                if detail.get('memorySource') != 'CURRENT_REJECTED_READBACK' and failure.worker_memory is None:
                    observed = None
                    try:
                        observed = P.R.project_failure_memory(parent.read_parent(ctx, identity), True)
                    except BaseException as error:
                        observed = _closed_memory(D.attribute(error, 'failure_memory'))
                    if observed is not None:
                        detail.update(memory=observed, memorySource='POST_FAILURE_READBACK')
                failure.runner = D.runner(detail, _closed_memory); failure.refresh()
                try:
                    _command(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'kill', '--kill-whom=all',
                              '--signal=SIGKILL', parent.names(ctx)[0]], timeout=15)
                    cleanup['parentStopRequested'] = 'PASS'
                except BaseException:
                    bad = True
            if empty_observed:
                cleanup['parentEmpty'] = 'PASS'
            else:
                try:
                    end = time.monotonic() + 5
                    while True:
                        if parent.parent_empty(ctx, identity):
                            cleanup['parentEmpty'] = 'PASS'
                            break
                        if time.monotonic() >= end:
                            cleanup['parentEmpty'] = 'FAIL'
                            break
                        time.sleep(.05)
                except BaseException:
                    bad = True
            # Even missing observations cannot suppress a bounded stop of our
            # still-owned unit. A replaced parent is never touched.
            if cleanup['parentEmpty'] != 'PASS':
                try:
                    if parent.identity(path) == identity:
                        _command(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'stop', parent.names(ctx)[0]], timeout=30)
                        cleanup['parentStopRequested'] = 'PASS'
                        cleanup['parentEmpty'] = 'UNKNOWN'
                        if parent.parent_empty(ctx, identity):
                            cleanup['parentEmpty'] = 'PASS'
                        else:
                            cleanup['parentEmpty'] = 'FAIL'
                except BaseException:
                    bad = True
            # Remove only after actual emptiness at the unchanged identity.
            try:
                if cleanup['parentEmpty'] == 'PASS' and parent.identity(path) == identity:
                    parent.privileged('remove', ctx)
                    cleanup['parentUnitRemoved'] = 'PASS'
                else:
                    bad = True
            except BaseException:
                bad = True
    try:
        if process is not None:
            if process.poll() is None:
                process.kill(); process.wait(timeout=10)
            cleanup['serviceLauncherExited'] = 'PASS' if process.poll() is not None else 'FAIL'
            bad = bad or cleanup['serviceLauncherExited'] != 'PASS'
    except BaseException:
        bad = True
    try:
        listener.close(); cleanup['launcherListenerClosed'] = 'PASS'
    except BaseException:
        bad = True
    try:
        latch.close(); cleanup['launcherSignalsRestored'] = 'PASS'
    except BaseException:
        bad = True
    if latch.seen and failure is None:
        failure = error_type('closure', runner={'reason': 'SIGNAL_DURING_CLEANUP'})
    if bad and failure is None:
        failure = error_type('closure', runner={'reason': 'CLEANUP_UNCONFIRMED'})
    if failure is not None:
        failure.cleanup = cleanup
        if latch.seen and not seen_before_cleanup:
            if failure.runner is None:
                failure.runner = {'reason': 'SIGNAL_DURING_CLEANUP'}
            elif 'secondaryReason' not in failure.runner:
                failure.runner['secondaryReason'] = 'SIGNAL_DURING_CLEANUP'
        if failure.runner is None and bad:
            failure.runner = {'reason': 'CLEANUP_UNCONFIRMED'}
        failure.refresh()
    return failure


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
    last, empty_observed = {'memory': None}, False
    try:
        PHASE = 'parent'; P.privileged('prepare', ctx); created = True
        identity = P.identity(P.R.KERNEL_ROOT / P.names(ctx)[0])
        initial = _parent_readback(P, ctx, identity, last, empty=True)
        PHASE = 'service'
        process = subprocess.Popen(_service_argv(request, ipc_dir), stdin=subprocess.PIPE,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   env=ENV, close_fds=True, start_new_session=True)
        raw = _encode({'request': request, 'private': private_payload})
        process.stdin.write(raw); process.stdin.close()
        result = _receive_result(listener, process, time.monotonic() + request['maximumWallSeconds'] + 45)
        if type(result) is dict and result.get('ok') is False:
            raise _response_error(result)
        code = process.wait(timeout=45)
        if code != 0:
            detail = {'reason': 'SERVICE_EXIT_REJECTED'}
            if type(code) is int and -255 <= code <= 255:
                detail['serviceExitCode'] = code
            raise RunnerStartError('service', runner=detail)
        need(type(result) is dict and result.get('ok') is True)
        need(type(result.get('result')) is dict)
        result['result']['worker'] = _worker_result(result['result']['worker'], request)
        PHASE = 'closure'
        final = _parent_readback(P, ctx, identity, last, empty=True)
        need(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes'] and not latch.seen)
        empty_observed = True
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
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'SUPERVISOR_REJECTED'
        failure = _diagnose(error, PHASE, reason, last['memory'])
        raise failure from None
    finally:
        after = _cleanup_launch(ctx, P, identity, created, process, listener, latch, failure,
            empty_observed=empty_observed)
        if failure is None and after is not None:
            raise after from None


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
        result = supervise(request, private_payload, latch=latch)
        need(not latch.seen)
        _send_result(args.ipc_dir, ctx, {'ok': True, 'result': result})
        return 0
    except BaseException as error:
        try:
            failure = _diagnose(error, PHASE, 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'SUPERVISOR_REJECTED')
            result = _failure_packet(failure)
            _send_result(args.ipc_dir, ctx, result)
        except BaseException:
            pass
        return 1
    finally:
        latch.close()


if __name__ == '__main__':
    raise SystemExit(main())
