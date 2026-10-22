#!/usr/bin/env python3
"""Verify/stage existing private originals. No fetch, decrypt, execution or GO.

Only use after reviewing the exact consumer commit in a trusted environment.
Source layout is <private-bundle>/<canonical path relative to /workspace>.
All destination files must be absent. Failed writes are retained, never retried
or deleted automatically. No original contents or underlying exceptions are logged.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

MANIFEST = Path(__file__).with_name('private-original-ci-manifest.json')
MANIFEST_SHA256 = 'b2e3584818b16fed2f4bfd845f9379732d9f9eb045c83f59ad94034d9e6c46ef'
FILE_COUNT = 84
TOTAL_BYTES = 83496520
MAX_TOTAL_BYTES = 90 * 1024 * 1024
MAX_FILE_BYTES = 20 * 1024 * 1024
FREE_FLOOR_BYTES = 8 * 1024 ** 3
PROVISION_HEADROOM_BYTES = 16 * 1024 * 1024
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def require(condition):
    if not condition:
        raise RuntimeError('private original provision rejected')


def validate_manifest(value):
    require(isinstance(value, dict) and set(value) == {
        'schema', 'canonicalWorkspace', 'fileCount', 'totalBytes', 'files'})
    require(value['schema'] == 'helmut-private-ci-originals/1')
    require(value['canonicalWorkspace'] == '/workspace')
    require(type(value['fileCount']) is int and value['fileCount'] == FILE_COUNT)
    require(type(value['totalBytes']) is int and value['totalBytes'] == TOTAL_BYTES)
    rows = value['files']
    require(isinstance(rows, list) and len(rows) == FILE_COUNT)
    seen = set()
    for row in rows:
        require(isinstance(row, dict) and set(row) == {'path', 'bytes', 'sha256'})
        name = row['path']
        require(isinstance(name, str) and '\x00' not in name and '\\' not in name)
        path = PurePosixPath(name)
        require(path.is_absolute() and str(path) == name and '..' not in path.parts)
        require(path.parts[:2] == ('/', 'workspace') and len(path.parts) > 3)
        require(name not in seen)
        seen.add(name)
        require(type(row['bytes']) is int and 0 < row['bytes'] <= MAX_FILE_BYTES)
        require(isinstance(row['sha256'], str) and re.fullmatch('[a-f0-9]{64}', row['sha256']))
    require(sum(row['bytes'] for row in rows) == TOTAL_BYTES <= MAX_TOTAL_BYTES)
    require(not any(a.startswith(b + '/') for a in seen for b in seen if a != b))
    return rows


def load_manifest():
    require(not MANIFEST.is_symlink() and MANIFEST.is_file())
    raw = MANIFEST.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == MANIFEST_SHA256)
    return validate_manifest(json.loads(raw))


def root_fd(path, private=False):
    """Walk from / with O_NOFOLLOW; resolve() alone can conceal symlink parents."""
    require(isinstance(path, str) and '\x00' not in path and '\\' not in path)
    parsed = PurePosixPath(path)
    require(parsed.is_absolute() and str(parsed) == path and '..' not in parsed.parts)
    fd = os.open('/', DIR_FLAGS)
    try:
        for part in parsed.parts[1:]:
            child = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
        if private:
            info = os.fstat(fd)
            require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) & 0o077 == 0)
        return fd
    except BaseException:
        os.close(fd)
        raise


def parent_fd(root, relative, create=False):
    fd = os.dup(root)
    try:
        for part in relative.parts[:-1]:
            try:
                child = os.open(part, DIR_FLAGS, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(part, mode=0o700, dir_fd=fd)
                child = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def relative_path(row):
    return PurePosixPath(row['path']).relative_to('/workspace')


def read_original(root, row):
    relative = relative_path(row)
    parent = parent_fd(root, relative)
    try:
        fd = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1)
        require(before.st_uid == os.getuid() and stat.S_IMODE(before.st_mode) & 0o077 == 0)
        require(before.st_size == row['bytes'])
        data = bytearray()
        while len(data) <= row['bytes']:
            block = os.read(fd, min(65536, row['bytes'] + 1 - len(data)))
            if not block:
                break
            data.extend(block)
        after = os.fstat(fd)
        # Reading may update atime; all identity/content metadata must stay fixed.
        identity = lambda info: (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
                                 info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        require(identity(after) == identity(before))
        require(len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'])
        return data
    finally:
        os.close(fd)


def assert_absent(root, row):
    relative = relative_path(row)
    try:
        parent = parent_fd(root, relative)
    except FileNotFoundError:
        return
    try:
        try:
            os.stat(relative.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return
        raise RuntimeError('private original destination occupied')
    finally:
        os.close(parent)


def assert_root_identity(path, expected):
    current = root_fd(path)
    try:
        before, after = os.fstat(expected), os.fstat(current)
        require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino))
    finally:
        os.close(current)


def provision(bundle, destination_workspace, *, write=False):
    require(type(write) is bool)
    rows = load_manifest()
    source = root_fd(bundle, private=True)
    try:
        target = root_fd(destination_workspace)
        try:
            source_stat, target_stat = os.fstat(source), os.fstat(target)
            require((source_stat.st_dev, source_stat.st_ino) != (target_stat.st_dev, target_stat.st_ino))
            capacity = os.fstatvfs(target)
            require(capacity.f_bavail * capacity.f_frsize >= TOTAL_BYTES + FREE_FLOOR_BYTES + PROVISION_HEADROOM_BYTES)
            # Authenticate every byte and every destination before the first mkdir/write.
            contents = []
            for row in rows:
                assert_absent(target, row)
                contents.append(read_original(source, row))
            assert_root_identity(bundle, source)
            assert_root_identity(destination_workspace, target)
            if write:
                for row, data in zip(rows, contents):
                    relative = relative_path(row)
                    parent = parent_fd(target, relative, create=True)
                    try:
                        fd = os.open(relative.name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                                     0o600, dir_fd=parent)
                    finally:
                        os.close(parent)
                    try:
                        remaining = memoryview(data)
                        while remaining:
                            count = os.write(fd, remaining)
                            require(count > 0)
                            remaining = remaining[count:]
                        os.fsync(fd)
                        os.lseek(fd, 0, os.SEEK_SET)
                        digest = hashlib.sha256()
                        while block := os.read(fd, 65536):
                            digest.update(block)
                        info = os.fstat(fd)
                        require(info.st_size == row['bytes'] and stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
                        require(stat.S_IMODE(info.st_mode) & 0o077 == 0 and digest.hexdigest() == row['sha256'])
                    finally:
                        os.close(fd)
                # Verify the canonical names again, not just open write handles.
                for row in rows:
                    read_original(target, row)
                assert_root_identity(destination_workspace, target)
                capacity = os.fstatvfs(target)
                require(capacity.f_bavail * capacity.f_frsize >= FREE_FLOOR_BYTES)
            return {'schema': 'helmut-private-ci-original-provision/1', 'pass': True,
                    'filesVerified': FILE_COUNT, 'bytesVerified': TOTAL_BYTES,
                    'filesCreated': FILE_COUNT if write else 0, 'originalsExecuted': False,
                    'consumerTestsRun': False, 'ciPassed': False}
        finally:
            os.close(target)
    finally:
        os.close(source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--destination-workspace', required=True)
    parser.add_argument('--write', action='store_true', help='stage verified bytes; default verifies without writes')
    args = parser.parse_args()
    try:
        result = provision(args.bundle, args.destination_workspace, write=args.write)
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'pass': False, 'reason': 'PRIVATE_ORIGINAL_PROVISION_REJECTED',
                          'partialFilesMayRemain': args.write, 'ciPassed': False}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
