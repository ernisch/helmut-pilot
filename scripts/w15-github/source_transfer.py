#!/usr/bin/env python3
"""One bound SOURCE-side staging/seal operation; never upload or run a test.

Requires the separately granted plan hash. An existing output root is a hard
stop, including after failure. The twelve originals are never changed.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
ASSETS = REPO / 'docs/betrieb/belege/w15-end500-transfer-20261029'
PLAN_SHA = '84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5'
TEMPLATE_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
REQUEST_SHA = '010ccfd7f5dc639b8a852cd4eeaf8929550d779ad0c755a16fed1895c763d464'
READBACK_SHA = '5987ef39b60f4d3c0b407a456352260a61a5d5fc6fef03520e4132e884c0aa4a'


def load(name):
    spec = importlib.util.spec_from_file_location('w15_transfer_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


I, S = load('source_inventory'), load('seal')


def require(value):
    if not value:
        raise ValueError('SOURCE_TRANSFER_REJECTED')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def private_write(directory, name, raw):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=directory)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(directory)


def original_fd(root, path):
    parts = I._relative(path).split('/')
    fd = os.dup(root)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            I.P.private_stat(os.fstat(fd), directory=True)
        child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            I.P.private_stat(os.fstat(child))
            return child
        except BaseException:
            os.close(child)
            raise
    finally:
        os.close(fd)


def copy_one(root, source, target, name, pin):
    fd = original_fd(root, source)
    try:
        before = S._snapshot(os.fstat(fd))
        require(before[2] == pin['bytes'])
        out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                      0o600, dir_fd=target)
        digest, size = hashlib.sha256(), 0
        with os.fdopen(out, 'wb') as stream:
            while block := os.read(fd, S.CHUNK):
                size += len(block)
                require(size <= pin['bytes'])
                digest.update(block)
                stream.write(block)
            stream.flush()
            os.fsync(stream.fileno())
        require(size == pin['bytes'] and digest.hexdigest() == pin['sha256'])
        require(S._snapshot(os.fstat(fd)) == before)
        os.fsync(target)
        return before
    finally:
        os.close(fd)


def split_cipher(cipher, directory, *, part_bytes=16777216, maximum_bytes=242701312):
    require(type(part_bytes) is int and 0 < part_bytes <= 16777216)
    require(type(maximum_bytes) is int and 0 < maximum_bytes <= 242701312)
    parent = S._directory(str(cipher.parent), private=True)
    fd = None
    try:
        fd, snap = S._file(parent, cipher.name)
        require(0 < snap[2] <= maximum_bytes)
        rows, whole, total = [], hashlib.sha256(), 0
        while total < snap[2]:
            raw = bytearray()
            while len(raw) < min(part_bytes, snap[2] - total):
                block = os.read(fd, min(S.CHUNK, part_bytes - len(raw), snap[2] - total - len(raw)))
                require(bool(block))
                raw.extend(block)
            name = 'end500.gpg.part-' + str(len(rows) + 1).zfill(3)
            private_write(directory, name, raw)
            whole.update(raw)
            total += len(raw)
            rows.append({'index': len(rows) + 1, 'name': name, 'bytes': len(raw), 'sha256': sha(raw)})
            require(len(rows) <= 15)
        require(os.read(fd, 1) == b'' and S._snapshot(os.fstat(fd)) == snap)
        return {'cipherBytes': total, 'cipherSHA256': whole.hexdigest(), 'parts': rows}
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def export_once(approved_plan_sha256):
    require(approved_plan_sha256 == PLAN_SHA)
    raw = (ASSETS / 'TRANSFER_PLAN.SAFE.json').read_bytes()
    require(sha(raw) == PLAN_SHA)
    plan = I.P.decode(raw)
    for pin in plan['preparedCodePins']:
        value = (REPO / pin['path']).read_bytes()
        require(len(value) == pin['bytes'] and sha(value) == pin['sha256'])
    request_raw = (HERE / 'source-export-request.json').read_bytes()
    require(sha(request_raw) == REQUEST_SHA)
    request = I.P.decode(request_raw)
    manifest = (ASSETS / 'SEALED_MANIFEST_TEMPLATE.json').read_bytes()
    require(len(manifest) == 2150 and sha(manifest) == TEMPLATE_SHA)
    key = ASSETS / 'receiver-public.asc'
    require(key.stat().st_size == 1367 and sha(S._read_public_key(str(key))) == plan['receiver']['publicKeySHA256'])
    # This is a byte/readback receipt, not independent offhost key decryption.
    recovery_raw = (ASSETS / 'RECIPIENT_CLOUD_READBACK.SAFE.json').read_bytes()
    require(len(recovery_raw) == 1360 and sha(recovery_raw) == READBACK_SHA)
    recovery = I.P.decode(recovery_raw)
    require(recovery['status'] == 'PASS_PUBLIC_RECIPIENT_AND_ENCRYPTED_NEW_KEY_BACKUP_REMOTE_BYTES_ONLY'
            and recovery['planSHA256'] == PLAN_SHA
            and recovery['receiverFingerprint'] == plan['receiver']['fingerprint']
            and recovery['driveFolderId'] == plan['transport']['folderId']
            and recovery['folderAndRecoveryCipherShared'] is False)
    expected = {plan['receiver']['publicKeySHA256'], plan['durableRecovery']['recoveryCipherSHA256']}
    require(len(recovery['files']) == 2 and {x['sha256'] for x in recovery['files']} == expected
            and all(x['fullRemoteReadback'] == 'PASS' for x in recovery['files']))
    first = I.inventory(request)
    require(first['filesFreshlyVerified'] is True and first['verifiedTotalBytes'] == 242570240)
    source_root = I._source_root()
    parent = stage = cipher = None
    try:
        receipt, _ = I._control(source_root, request['controls']['reception'])
        pins = plan['source']['selectedInputPins']
        paths = {k: v['path'] for k, v in {**request['payloads'], **request['controls']}.items()}
        for name in I.RECEIPT_KEYS:
            paths[name] = next(x['receivedPath'] for x in receipt['files'] if x['key'] == name)
        stage_path = Path(plan['source']['privateStageRoot'])
        cipher_path = Path(plan['source']['cipherRoot'])
        run_root = stage_path.parent
        require(run_root.parent == Path('/workspace/shared') and cipher_path.parent == run_root)
        disk = os.statvfs(run_root.parent)
        require(disk.f_bavail * disk.f_frsize >= plan['source']['minimumFreeDiskBeforeOperationBytes'])
        parent = S._directory(str(run_root.parent))
        require(os.fstat(parent).st_uid == os.geteuid() and stat.S_IMODE(os.fstat(parent).st_mode) & 0o022 == 0)
        os.mkdir(run_root.name, 0o700, dir_fd=parent)  # Never resume, even after a failed attempt.
        run = os.open(run_root.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            os.mkdir('input', 0o700, dir_fd=run)
            os.mkdir('cipher', 0o700, dir_fd=run)
            os.fsync(run)
        finally:
            os.close(run)
        stage = S._directory(str(stage_path), private=True)
        cipher = S._directory(str(cipher_path), private=True)
        snapshots = {k: copy_one(source_root, paths[k], stage, pins[k]['stagedPath'], pins[k]) for k in sorted(pins)}
        private_write(stage, 'manifest.PRIVATE.json', manifest)
        result = S.seal(root=str(stage_path), manifest='manifest.PRIVATE.json', manifest_sha256=TEMPLATE_SHA,
                        public_key=str(key), recipient_fingerprint=plan['receiver']['fingerprint'],
                        commit=plan['source']['sourceToolCommit'], run_id=plan['transferRunId'],
                        input_manifest_sha256=PLAN_SHA, output=str(cipher_path / 'end500.gpg'))
        parts = split_cipher(cipher_path / 'end500.gpg', cipher)
        require(all(parts[k] == result[k] for k in ('cipherBytes', 'cipherSHA256')))
        for name, before in snapshots.items():
            fd = original_fd(source_root, paths[name])
            try:
                require(S._snapshot(os.fstat(fd)) == before)
            finally:
                os.close(fd)
        require(I.inventory(request) == first)
        receipt = {**result, **parts, 'schema': 'helmut-w15-selected-source-seal/1',
                   'status': 'PASS_SELECTED_SOURCE_SEALED_UPLOAD_PENDING_START_BLOCKED',
                   'transferId': plan['transferId'], 'sourceFiles': 12, 'sourceBytes': 242570240,
                   'originalsUnchanged': True, 'uploads': 0, 'executionAuthority': False,
                   'testStarted': False, 'retryAllowed': False}
        private_write(cipher, 'SOURCE_SEAL_RECEIPT.SAFE.json', (json.dumps(receipt, sort_keys=True) + '\n').encode())
        return receipt
    finally:
        for fd in (cipher, stage, parent, source_root):
            if fd is not None:
                os.close(fd)


def main(argv=None):
    try:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--export-once', action='store_true', required=True)
        parser.add_argument('--approved-plan-sha256', required=True)
        args = parser.parse_args(argv)
        result = export_once(args.approved_plan_sha256)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'status': 'FAIL_OR_UNKNOWN_SELECTED_SOURCE_EXPORT',
                          'uploads': 0, 'testStarted': False, 'retryAllowed': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
