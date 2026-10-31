"""Stage two existing pinned public binaries and current package declarations.

This fills only the fixed CACHE seam used by forward.prepare. No download,
installation, child process, input transfer or database action is performed.
Private partials remain after failure; a fresh root is never reused.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import os
from pathlib import Path
import re
import stat

SPEC = importlib.util.spec_from_file_location('w15_cache_context', Path(__file__).with_name('controller_context.py'))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)
CHUNK = 1024 * 1024
MAX_PACKAGE_BYTES = 128 * 1024


class RuntimeCacheError(RuntimeError):
    pass


def need(value):
    if not value:
        raise RuntimeCacheError('RUNTIME_CACHE_REJECTED')


def _path(value):
    need(isinstance(value, (str, Path)))
    raw = str(value)
    need(raw.startswith('/') and raw != '/' and str(Path(raw)) == raw
         and all(part not in ('', '.', '..') for part in raw[1:].split('/'))
         and ',' not in raw and all(ord(char) >= 32 and ord(char) != 127 for char in raw))
    return Path(raw)


def _directory(path):
    path = _path(path)
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


def _snapshot(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns,
            value.st_ctime_ns, value.st_nlink, value.st_mode, value.st_uid)


def _source(path, expected):
    path = _path(path)
    parent = _directory(path.parent)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        value = os.fstat(fd)
        need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1
             and value.st_uid in (0, os.geteuid()) and stat.S_IMODE(value.st_mode) & 0o022 == 0)
        need(type(expected['bytes']) is int and expected['bytes'] > 0
             and type(expected['sha256']) is str and re.fullmatch('[a-f0-9]{64}', expected['sha256'])
             and value.st_size == expected['bytes'])
        return fd, _snapshot(value)
    except BaseException:
        os.close(fd)
        raise


def _private_directory(fd):
    value = os.fstat(fd)
    need(stat.S_ISDIR(value.st_mode) and value.st_uid == os.geteuid()
         and stat.S_IMODE(value.st_mode) == 0o700)


def _mkdir(parent, name):
    os.mkdir(name, 0o700, dir_fd=parent)
    os.fsync(parent)
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        _private_directory(fd)
        return fd
    except BaseException:
        os.close(fd)
        raise


def _geometry(forward, context):
    paths = context['hostPaths']
    need(type(paths) is dict and set(paths) == {'runRoot', 'work', 'prepare', 'cache'})
    root = _path(paths['runRoot'])
    cache = _path(paths['cache'])
    need(root.parent == _path(context['runnerTemp']) and root == cache.parent
         and paths == {'runRoot': str(root), 'work': str(root / 'work'),
                       'prepare': str(root / 'prepare'), 'cache': str(root / 'cache')}
         and Path(forward.CACHE) == cache and Path(forward.WORK) == root / 'work'
         and Path(forward.PREP) == root / 'prepare')
    need(all(context['runtimePins'][name] == C.RUNTIME[name] for name in ('node', 'postgrest')))
    return root, cache


def _copy(source, before, directory, name, mode, expected, guard):
    guard()
    need(_snapshot(os.fstat(source)) == before)
    out = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=directory)
    try:
        os.fchmod(out, mode)
        guard()
        count, digest = 0, hashlib.sha256()
        while True:
            guard()
            block = os.read(source, CHUNK)
            guard()
            if not block:
                break
            count += len(block)
            need(count <= before[2])
            digest.update(block)
            pending = memoryview(block)
            while pending:
                written = os.write(out, pending)
                need(written > 0)
                pending = pending[written:]
            guard()
        need(count == before[2] and _snapshot(os.fstat(source)) == before)
        need(digest.hexdigest() == expected['sha256'])
        os.fsync(out)
        copied = _snapshot(os.fstat(out))
        need(copied[7] == os.geteuid() and copied[5] == 1
             and stat.S_IMODE(copied[6]) == mode and copied[:2] != before[:2])
        os.lseek(out, 0, os.SEEK_SET)
        reread, reread_size = hashlib.sha256(), 0
        while True:
            guard()
            block = os.read(out, CHUNK)
            guard()
            if not block:
                break
            reread_size += len(block)
            need(reread_size <= count)
            reread.update(block)
        need(reread_size == count and reread.digest() == digest.digest()
             and _snapshot(os.fstat(out)) == copied and _snapshot(os.fstat(source)) == before)
        guard()
        os.fsync(directory)
        return count
    finally:
        os.close(out)


def stage_cache(forward, inputs, common_resources, *, node_source, postgrest_source):
    """Create a fresh fixed cache inside the already observed common parent.

    Bounds: the two exact C.RUNTIME binary sizes plus two package files of at
    most128KiB each. This is not a full app, runtime, disk or restore acceptance.
    """
    opened = []
    try:
        need(inputs is not None and common_resources is not None)
        need(forward._checked_runtime_inputs(inputs) is inputs
             and forward._checked_common_resources(inputs, common_resources) is common_resources)
        inputs.check_sources()
        context = inputs.controller_context()
        root, cache = _geometry(forward, context)
        review_raw = inputs.source_review_bytes()
        need(type(review_raw) is bytes and 0 < len(review_raw) <= 8 * 1024 * 1024)
        review = C.P.decode(review_raw)
        need(type(review) is dict and type(review.get('sourcePins')) is dict)
        package_pins = {}
        for name in ('package.json', 'package-lock.json'):
            pin = review['sourcePins'][name]
            need(type(pin) is dict and set(pin) == {'bytes', 'sha256'}
                 and type(pin['bytes']) is int and 0 < pin['bytes'] <= MAX_PACKAGE_BYTES
                 and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']))
            package_pins[name] = dict(pin)
        guard = common_resources.sample
        need(callable(guard))
        guard()
        parent = _directory(root.parent)
        opened.append(parent)
        value = os.fstat(parent)
        need(value.st_uid == os.geteuid() and stat.S_IMODE(value.st_mode) & 0o022 == 0)
        try:
            os.stat(root.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            need(False)
        declarations = ((node_source, 'node', 0o700, dict(C.RUNTIME['node'])),
                        (postgrest_source, 'postgrest', 0o700, dict(C.RUNTIME['postgrest'])),
                        (Path(forward.ROOT) / 'package.json', 'package.json', 0o600, package_pins['package.json']),
                        (Path(forward.ROOT) / 'package-lock.json', 'package-lock.json', 0o600, package_pins['package-lock.json']))
        sources = []
        for path, name, mode, expected in declarations:
            source, before = _source(path, expected)
            opened.append(source)
            sources.append((source, before, name, mode, expected))
        need(sum(row[1][2] for row in sources)
             <= C.RUNTIME['node']['bytes'] + C.RUNTIME['postgrest']['bytes'] + 2 * MAX_PACKAGE_BYTES)
        guard()
        run_fd = _mkdir(parent, root.name)
        opened.append(run_fd)
        cache_fd = _mkdir(run_fd, 'cache')
        opened.append(cache_fd)
        app_fd = _mkdir(cache_fd, 'app')
        opened.append(app_fd)
        scripts_fd = _mkdir(app_fd, 'scripts')
        opened.append(scripts_fd)
        fixtures_fd = _mkdir(scripts_fd, 'fixtures')
        opened.append(fixtures_fd)
        copied = sum(_copy(source, before, cache_fd if name in ('node', 'postgrest') else app_fd,
                           name, mode, expected, guard) for source, before, name, mode, expected in sources)
        inputs.check_sources()
        need(inputs.controller_context() == context and _geometry(forward, context) == (root, cache))
        need(forward._checked_common_resources(inputs, common_resources) is common_resources)
        guard()
        return {'status': 'PASS_FIXED_RUNTIME_CACHE_FILES_ONLY_START_BLOCKED',
                'binaryFiles': 2, 'packageFiles': 2, 'copiedBytes': copied,
                'sourceFilesModified': False, 'networkCalls': 0, 'childProcessesStarted': 0,
                'databaseStarted': False, 'fullAppAccepted': False,
                'executionAuthority': False, 'readiness': 'BLOCKED'}
    except (Exception, KeyboardInterrupt):
        raise RuntimeCacheError('RUNTIME_CACHE_REJECTED') from None
    finally:
        for fd in reversed(opened):
            os.close(fd)
