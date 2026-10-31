"""Copy existing runtime files in the common parent, then declare read-only mounts.

No Docker, process, network or controller execution. Newly written file pages
belong to the copying process; this alone accepts neither a full memory lifetime
nor restore/disk capacity. Originals and failed private partials are preserved.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import os
from pathlib import Path
import stat

BASE = '/tmp/w15-memory-atomic-20261028d'
NAMES = ('app', 'node', 'postgrest', 'roles.PRIVATE.sql', 'input.PRIVATE.dump')
CHUNK, MAX_BYTES, MAX_FILES = 1024 * 1024, 1024 * 1024 * 1024, 4096


class RuntimeMaterializationError(RuntimeError):
    pass


def require(value):
    if not value:
        raise RuntimeMaterializationError('RUNTIME_MATERIALIZATION_REJECTED')


def _directory(path):
    path = str(path)
    require(path.startswith('/') and path != '/' and ',' not in path
            and all(ord(c) >= 32 and ord(c) != 127 for c in path))
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path[1:].split('/'):
            require(part not in ('', '.', '..'))
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


def _owned(value, *, directory=False, private=False):
    require(value.st_uid == os.geteuid() and stat.S_IMODE(value.st_mode) & 0o022 == 0)
    require(stat.S_ISDIR(value.st_mode) if directory else (
        stat.S_ISREG(value.st_mode) and value.st_nlink == 1))
    if private:
        require(stat.S_IMODE(value.st_mode) == (0o700 if directory else 0o600))


def _copy(source_fd, name, target_fd, target, mode, private, budget, guard):
    child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=source_fd)
    try:
        before = os.fstat(child)
        _owned(before, private=private)
        budget[0] += before.st_size
        budget[1] += 1
        require(budget[0] <= MAX_BYTES and budget[1] <= MAX_FILES)
        guard()
        out = os.open(target, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=target_fd)
        try:
            os.fchmod(out, mode)
            digest, size = hashlib.sha256(), 0
            while block := os.read(child, CHUNK):
                guard()
                size += len(block)
                require(size <= before.st_size)
                digest.update(block)
                pending = memoryview(block)
                while pending:
                    written = os.write(out, pending)
                    require(written > 0)
                    pending = pending[written:]
                guard()
            require(size == before.st_size and _snapshot(os.fstat(child)) == _snapshot(before))
            os.fsync(out)
            copied = _snapshot(os.fstat(out))
            os.lseek(out, 0, os.SEEK_SET)
            readback, read_size = hashlib.sha256(), 0
            while block := os.read(out, CHUNK):
                guard()
                readback.update(block)
                read_size += len(block)
                require(read_size <= size)
                guard()
            require(read_size == size and readback.digest() == digest.digest()
                    and _snapshot(os.fstat(out)) == copied
                    and _snapshot(os.fstat(child)) == _snapshot(before)
                    and (before.st_dev, before.st_ino) != copied[:2])
            guard()
        finally:
            os.close(out)
        os.fsync(target_fd)
    finally:
        os.close(child)


def _tree(source, target, budget, guard):
    before = os.fstat(source)
    _owned(before, directory=True)
    for name in sorted(os.listdir(source)):
        guard()
        value = os.stat(name, dir_fd=source, follow_symlinks=False)
        if stat.S_ISDIR(value.st_mode):
            _owned(value, directory=True)
            os.mkdir(name, 0o700, dir_fd=target)
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source)
            try:
                copied = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=target)
                try:
                    _tree(child, copied, budget, guard)
                finally:
                    os.close(copied)
            finally:
                os.close(child)
        else:
            _copy(source, name, target, name, 0o600, False, budget, guard)
    require(_snapshot(os.fstat(source)) == _snapshot(before))
    os.fsync(target)
    guard()


def materialize(root, *, app, node, postgrest, roles, dump, state, command,
                command_binding, bound, guard):
    """Create at most 1GiB/4096 new file copies; caller supplies live parent guard.

    Keep this root under PREP, whose backup walk accepts executable files. WORK
    and its state retain their strict 0600 private-file backup contract.
    """
    opened = []
    try:
        require(callable(guard))
        guard()
        root, state = Path(root), Path(state)
        parent = _directory(root.parent)
        opened.append(parent)
        _owned(os.fstat(parent), directory=True, private=True)
        state_fd = _directory(state)
        opened.append(state_fd)
        _owned(os.fstat(state_fd), directory=True, private=True)
        require(',' not in str(root) and all(ord(c) >= 32 and ord(c) != 127 for c in str(root)))
        os.mkdir(root.name, 0o700, dir_fd=parent)
        target = _directory(root)
        opened.append(target)
        app_fd = _directory(app)
        opened.append(app_fd)
        os.mkdir('app', 0o700, dir_fd=target)
        app_target = os.open('app', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=target)
        opened.append(app_target)
        budget = [0, 0]
        _tree(app_fd, app_target, budget, guard)
        rows = ((node, target, 'node', 0o700, False),
                (postgrest, target, 'postgrest', 0o700, False),
                (roles, target, 'roles.PRIVATE.sql', 0o600, True),
                (dump, target, 'input.PRIVATE.dump', 0o600, True),
                (command, state_fd, 'current-command.PRIVATE.json', 0o600, True),
                (command_binding, state_fd, 'CURRENT_COMMAND_BINDING.SAFE.json', 0o600, True),
                (bound, state_fd, 'END500_MEMORY_BOUND.SAFE.json', 0o600, True))
        for source, destination, name, mode, private in rows:
            source = Path(source)
            source_parent = _directory(source.parent)
            try:
                _copy(source_parent, source.name, destination, name, mode, private, budget, guard)
            finally:
                os.close(source_parent)
        guard()
        return tuple(item for name in NAMES for item in (
            '--mount', 'type=bind,src=' + str(root / name) + ',dst=' + BASE + '/' + name + ',readonly'))
    except (Exception, KeyboardInterrupt):
        raise RuntimeMaterializationError('RUNTIME_MATERIALIZATION_REJECTED') from None
    finally:
        for fd in reversed(opened):
            os.close(fd)


def verify_mounts(mounts, root):
    """Check actual docker-inspect rows before private restore; no acceptance flag."""
    try:
        require(isinstance(mounts, list) and all(isinstance(row, dict) for row in mounts))
        require(all(isinstance(row.get('Destination'), str) and row['Destination'].startswith('/')
                    for row in mounts))
        root = Path(root)
        require(root.is_absolute())
        for name in NAMES:
            destination = BASE + '/' + name
            selected = [row for row in mounts if row['Destination'] == destination]
            require(len(selected) == 1)
            row = selected[0]
            require(row.get('Type') == 'bind' and row.get('Source') == str(root / name)
                    and row.get('RW') is False)
            require(not any(other is not row and (
                other['Destination'].startswith(destination + '/')
                or destination.startswith(other['Destination'].rstrip('/') + '/')) for other in mounts))
    except (Exception, KeyboardInterrupt):
        raise RuntimeMaterializationError('RUNTIME_MOUNT_READBACK_REJECTED') from None
