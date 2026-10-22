#!/usr/bin/env python3
"""Source-local native qualification. No default run and no full500 entry.

Every workload starts below one fresh kernel parent. Originals are read-only
mounts. A preparation/DDL result is deliberately not an engine acceptance.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time
import types

BIN = Path(__file__).resolve().parent
REPO = BIN.parent.parent
BASE = Path('/workspace/helmut-ram-fix-20261020')
ARCH = BASE / 'architecture-correction-20261020'
SOURCE = Path('/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-f3375a7d5548')
RAW = Path('/workspace/helmut-parallel-20261015/wave19-resource-meter/full500-owned-storage21-f3375a7d5548/image.raw')
RAW_SHA = '54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693'
OUT = Path('/workspace/helmut-unit-diagnostic-native')
JIT = BASE / 'auth-working-set-20261020/jit-closure-v2'
READER = BASE / 'next-single-go-20261020/postrun-canonical-readback-preparation/readonly_ext4.py'
LEGACY = BASE / 'next-full500-20261021/v12-http-lock-comparison/worker-http-lock.py'
COPY_MANIFEST = BASE / 'next-full500-20261021/v12-postrun-readback/COPIED_PGDATA_FILE_MANIFEST.SAFE.json'
PYTHON = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python')
NODE = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node')
FLOOR = 8 * 1024**3


def pin(path):
    path = Path(path)
    before = path.lstat()
    if path.resolve() != path or not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise RuntimeError('canonical single-link regular file required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        h, size = hashlib.sha256(), 0
        while chunk := os.read(fd, 1024 * 1024):
            h.update(chunk)
            size += len(chunk)
        after, named = os.fstat(fd), path.lstat()
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if any(getattr(before, k) != getattr(opened, k) or getattr(opened, k) != getattr(after, k)
               or getattr(after, k) != getattr(named, k) for k in fields) or size != opened.st_size:
            raise RuntimeError('source file changed during pin')
        return {'path': str(path), 'bytes': size, 'sha256': h.hexdigest()}
    finally:
        os.close(fd)


def save(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def load(name, path):
    module = types.ModuleType(name)
    module.__file__ = str(path)
    exec(compile(Path(path).read_bytes(), str(path), 'exec'), module.__dict__)
    return module


def available():
    v = os.statvfs('/workspace')
    return v.f_bavail * v.f_frsize


def bindings():
    rows = json.loads((ARCH / 'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json').read_text())['bindings']
    assert len(rows) == 548
    rows = list(rows)
    shell = json.loads((ARCH / 'auth-component-shell/SOURCE.SAFE.json').read_text())['file']
    rows.append({'imagePath': '/bin/sh', 'source': shell, 'readonly': True})
    compat = BASE / 'next-single-go-20261020/dio-component-python-compat-runtime'
    seen = {row['imagePath'] for row in rows}
    for name, meta in json.loads((compat / 'SOURCE_COMPAT_FILES.SAFE.json').read_text())['files'].items():
        target = '/' + meta['sourcePath']
        if target not in seen:
            rows.append({'imagePath': target, 'readonly': True,
                         'source': {'path': str(compat / name), 'bytes': meta['bytes'], 'sha256': meta['sha256']}})
            seen.add(target)
    for row in rows:
        if row['readonly'] is not True or pin(row['source']['path']) != row['source']:
            raise RuntimeError('native runtime binding drift')
    return rows


def identity(docker, cid, parent, runtime, mounts):
    row = json.loads(docker(['inspect', cid]).stdout)[0]
    h = row['HostConfig']
    if row['Id'] != cid or h['CgroupParent'] != '/' + parent or h['NetworkMode'] != 'none':
        raise RuntimeError('owned container identity drift')
    if not h['ReadonlyRootfs'] or h['CapAdd'] or h['Privileged'] or h['CapDrop'] != ['ALL']:
        raise RuntimeError('unexpected workload privileges')
    if row['Image'] != runtime['imageId'] or row['Config']['User'] != '1000:1000' or h['SecurityOpt'] != ['no-new-privileges']:
        raise RuntimeError('workload image/user/privilege binding drift')
    actual = {m['Destination']: m for m in row['Mounts'] if m['Type'] == 'bind'}
    if set(actual) != {str(target) for _, target, _ in mounts}:
        raise RuntimeError('actual bind mount closure differs')
    for source, target, readonly in mounts:
        observed = actual[str(target)]
        if observed['Source'] != str(source) or observed['RW'] == readonly or observed['Propagation'] != 'rprivate':
            raise RuntimeError('actual source mount or readonly binding drift')
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qualify-native-store', action='store_true')
    args = parser.parse_args()
    if not args.qualify_native_store:
        parser.error('explicit --qualify-native-store required; no motor/full500 entry')
    if not (sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode):
        raise RuntimeError('use python -I -S -B')
    if available() < FLOOR + 2 * 1024**3:
        raise RuntimeError('persistent floor plus bounded native preparation capacity missing')
    raw = pin(RAW)
    if raw['bytes'] != 2147483648 or raw['sha256'] != RAW_SHA:
        raise RuntimeError('authentic original POSTRUN missing')
    native = load('local_unit_budget', BIN / 'native-memory-budget.py')
    kernel = load('local_unit_kernel', BIN / 'kernel-meter.py')
    runtime_path = ARCH / 'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'
    original_runtime = json.loads(runtime_path.read_text())
    original_helper = pin(original_runtime['sourcePin']['path'])
    current_helper = pin(BIN / 'native-memory-budget-helper.c')
    if original_helper != original_runtime['sourcePin'] or any(original_helper[k] != current_helper[k] for k in ['bytes', 'sha256']):
        raise RuntimeError('original native helper source differs from integration source')
    # Fresh metadata for the new worktree: identical compiled image/source bytes.
    # The preserved runtime receipt is never edited or presented as this binding.
    runtime = {**original_runtime, 'sourcePin': current_helper}
    native.validate_runtime(runtime)
    runtime_rows = bindings()
    manifest_pin = pin(COPY_MANIFEST)
    if manifest_pin['bytes'] != 313128 or manifest_pin['sha256'] != 'e231e66ff343420e0fe79496833f7c21d00272507d050b92e0403796b4aef895':
        raise RuntimeError('original POSTRUN extraction manifest drift')
    plan = json.loads((JIT / 'JIT_CLOSURE_PLAN.SAFE.json').read_text())
    root_manifest = json.loads(Path(plan['rootManifest']['path']).read_text())
    library_names = {'libcom_err.so.2': 'libcom_err.so.2.1', 'libuuid.so.1': 'libuuid.so.1.3.0',
                     'libblkid.so.1': 'libblkid.so.1.1.0', 'libe2p.so.2': 'libe2p.so.2.3', 'libext2fs.so.2': 'libext2fs.so.2.4'}
    libraries = []
    for soname, original_name in library_names.items():
        original_path = 'usr/lib/x86_64-linux-gnu/' + original_name
        entry = root_manifest[original_path]
        if entry['type'] != '0':
            raise RuntimeError('original readonly library must be regular')
        libraries.append({'path': '/tmp/helmut-meter-filesystem-tools/lib/' + soname,
                          'originalPath': original_path, 'bytes': entry['size'], 'sha256': entry['sha256']})
    if libraries[-1]['sha256'] != 'dc840deeb5e4348fc46b8390527359309b230b53329cae237d2cc95f77699380':
        raise RuntimeError('qualified readonly native ABI drift')
    nonce = secrets.token_hex(16)
    OUT.mkdir(mode=0o700, exist_ok=True)
    out_info = OUT.lstat()
    if OUT.resolve() != OUT or not stat.S_ISDIR(out_info.st_mode) or out_info.st_mode & 0o077:
        raise RuntimeError('private canonical output directory required')
    case = OUT / nonce
    case.mkdir(mode=0o700)
    parent = 'helmut-meter-memorybudget-' + secrets.token_hex(12)
    sources = [pin(p) for p in [Path(__file__), BIN / 'local-unit-native-worker.py',
                               BIN / 'local-unit-diagnostic-store.sql', BIN / 'local-unit-native-role-qualification.py',
                               BIN / 'kernel-meter.py', BIN / 'native-memory-budget.py',
                               runtime_path, BIN / 'native-memory-budget-helper.c', READER, LEGACY, COPY_MANIFEST,
                               JIT / 'restore_original_jit.py', JIT / 'JIT_CLOSURE_PLAN.SAFE.json']]
    config = {'schema': 'helmut-local-unit-native-qualification/1', 'nonce': nonce,
              'repository': str(REPO), 'parent': parent, 'raw': raw, 'reader': pin(READER),
              'legacyHelper': pin(LEGACY), 'jitHelper': pin(JIT / 'restore_original_jit.py'),
              'roleQualifier': pin(BIN / 'local-unit-native-role-qualification.py'),
              'copyManifest': manifest_pin, 'nativeReaderLibraries': libraries,
              'runtime': runtime, 'originalBudgetRuntimePin': pin(runtime_path),
              'helperSourcePathReboundOnly': True,
              'sources': sources, 'runtimeBindings': runtime_rows, 'full500': False,
              'motorCalls': 0, 'paidProviderCalls': 0, 'oldAuthorityReused': False}
    save(case / 'STARTED.SAFE.json', {**config, 'availableBefore': available(),
                                      'purpose': 'Fresh source-local readonly extraction and native DDL qualification only',
                                      'authorization': 'Operator request 2026-10-22: qualify originals/runtime/native single-unit integration',
                                      'controlDeadlineSeconds': 300, 'privateTestSecretsRemainLocal': True,
                                      'originalResourcesModified': False, 'newFull500Authority': False,
                                      'atUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    budget, cid, failure, close_errors, mounts = None, None, None, [], []
    mounts_observed = False
    start = time.monotonic()
    sample_count = 0
    try:
        budget = native.start(case / 'native-memory-budget', parent, runtime)
        group = native.parent_path(parent)
        config.update(parentInode=group.stat().st_ino, parentDevice=group.stat().st_dev)
        save(case / 'WORKER_CONFIG.SAFE.json', config)
        mounts = [(case, '/bench', False), (REPO, str(REPO), True), (PYTHON, str(PYTHON), True),
                  (NODE, str(NODE), True), (group, '/owned-group', True), (RAW, str(RAW), True),
                  (READER.parent, str(READER.parent), True), (COPY_MANIFEST, str(COPY_MANIFEST), True),
                  (LEGACY, str(LEGACY), True), (JIT, str(JIT), True),
                  (Path(plan['archive']['path']), plan['archive']['path'], True),
                  (Path(plan['rootManifest']['path']), plan['rootManifest']['path'], True)]
        mounts.extend((Path(row['source']['path']), row['imagePath'], True) for row in runtime_rows)
        destinations = [str(target) for _, target, _ in mounts]
        if len(set(destinations)) != len(destinations):
            raise RuntimeError('duplicate mount target')
        argv = ['create', '--name', 'helmut-unitdiag-qualify-' + nonce, '--network', 'none', '--read-only',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
                '--cgroup-parent=/' + parent, '--cgroupns', 'private', '--log-driver', 'none',
                '--shm-size', str(16 * 1024**2), '--tmpfs', '/ram:rw,exec,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700',
                '--tmpfs', '/tmp/helmut-meter-filesystem-tools:rw,exec,nosuid,nodev,size=2097152,uid=1000,gid=1000,mode=0700',
                '--tmpfs', '/usr/lib/postgresql/17/lib:rw,exec,nosuid,nodev,size=1048576,uid=1000,gid=1000,mode=0755',
                '--entrypoint', '/bin/sh']
        for source, target, readonly in mounts:
            argv += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + str(target) + (',readonly' if readonly else '')]
        worker = str(BIN / 'local-unit-native-worker.py')
        command = 'exec ' + str(PYTHON / 'bin/python3.12') + ' -I -S -B ' + worker + ' > /bench/BOOTSTRAP.PRIVATE.log 2>&1'
        argv += [runtime['imageId'], '-c', command]
        cid = native.docker(argv).stdout.strip()
        if not re.fullmatch('[a-f0-9]{64}', cid):
            raise RuntimeError('new container identity missing')
        identity(native.docker, cid, parent, runtime, mounts)
        mounts_observed = True
        save(case / 'CREATED.SAFE.json', {'id': cid, 'parent': parent, 'workloadStartsSealed': True})
        native.docker(['start', cid])
        with (case / 'KERNEL_SAMPLES.SAFE.jsonl').open('x') as stream:
            while True:
                row = identity(native.docker, cid, parent, runtime, mounts)
                snapshot = kernel.kernel_snapshot(parent)
                snapshot['elapsedSeconds'] = time.monotonic() - start
                stream.write(json.dumps(snapshot) + '\n')
                stream.flush()
                sample_count += 1
                if not row['State']['Running']:
                    break
                if time.monotonic() - start >= 300 or available() < FLOOR:
                    raise RuntimeError('bounded qualification control deadline/capacity')
                time.sleep(.25)
        exit_code = int(native.docker(['wait', cid]).stdout.strip())
        if exit_code != 0 or row['State']['OOMKilled']:
            raise RuntimeError('native qualification child failed')
        result = json.loads((case / 'NATIVE_QUALIFICATION.SAFE.json').read_text())
        if result.get('pass') is not True or result.get('motorCalls') != 0 or result.get('full500') is not False:
            raise RuntimeError('native qualification incomplete')
    except BaseException as error:
        failure = type(error).__name__ + ': ' + str(error)[:240]
    finally:
        if cid:
            try:
                row = identity(native.docker, cid, parent, runtime, mounts)
                if row['State']['Running']:
                    native.docker(['stop', '--time', '35', cid], timeout=40)
                native.docker(['wait', cid], timeout=5)
            except BaseException as error:
                close_errors.append(type(error).__name__)
                try:
                    native.docker(['kill', '--signal', 'KILL', cid], timeout=5)
                    native.docker(['wait', cid], timeout=5)
                except BaseException as final_error:
                    close_errors.append(type(final_error).__name__)
        final = None
        if budget:
            try:
                group = native.parent_path(parent)
                if (group.stat().st_dev, group.stat().st_ino) != (config['parentDevice'], config['parentInode']):
                    raise RuntimeError('new parent identity changed')
                final = kernel.kernel_snapshot(parent, require_empty=True)
                native.verify(parent, budget)
                known = {entry['id'] for entry in budget['helpers'].values()} | ({cid} if cid else set())
                ids = native.docker(['ps', '--all', '--quiet']).stdout.split()
                rows = json.loads(native.docker(['inspect', *ids]).stdout) if ids else []
                observed = {r['Id'] for r in rows if r['HostConfig']['CgroupParent'] == '/' + parent
                            or r['HostConfig']['CgroupParent'].startswith('/' + parent + '/')}
                if observed != known:
                    raise RuntimeError('unregistered or missing container in measured parent')
            except BaseException as error:
                close_errors.append(type(error).__name__)
        accepted = failure is None and not close_errors and final is not None
        receipt = {'schema': 'helmut-local-unit-native-qualification-result/1', 'pass': accepted,
                   'failure': failure, 'closureErrors': close_errors, 'parent': parent, 'containerId': cid,
                   'kernelFinal': final, 'samples': sample_count, 'case': str(case), 'full500': False,
                   'motorCalls': 0, 'unit60Qualified': False, 'full500ReserveQualified': False,
                   'originalPostrunSHA256': RAW_SHA, 'originalMountedReadonly': mounts_observed,
                   'sourcePreflightMayWarmSharedCache': True, 'noCacheOrGCManipulation': True}
        save(case / 'RESULT.SAFE.json', receipt)
        print(json.dumps({'pass': accepted, 'case': str(case), 'failure': failure,
                          'closureErrors': close_errors, 'full500': False, 'motorCalls': 0}))
    return 0 if accepted else 1


if __name__ == '__main__':
    raise SystemExit(main())
