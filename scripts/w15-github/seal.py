#!/usr/bin/env python3
"""Seal an explicitly enumerated private tree locally; never upload or authorize.

The caller must independently establish backup completeness and freeze the tree.
No supplied file list can prove either property. Only public-key encryption is
performed here. The private manifest and every listed file are inside the stream.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import select
import stat
import subprocess
import tarfile
import tempfile
import time

CHUNK = 1024 * 1024
MAX_MANIFEST = 8 * CHUNK
MAX_PUBLIC_KEY = CHUNK
GPG = "/usr/bin/gpg"
STATUS = "LOCAL_SEAL_ONLY_REMOTE_RECEIPT_AND_COMPLETENESS_PENDING"


class SealError(Exception):
    """Deliberately contains no private diagnostic detail."""


def require(value):
    if not value:
        raise SealError()


def _parts(value):
    require(isinstance(value, str) and 0 < len(value.encode("utf-8")) <= 4096)
    require(not value.startswith("/") and "\\" not in value)
    parts = value.split("/")
    require(all(x not in ("", ".", "..") for x in parts))
    require(all(ord(c) >= 32 and ord(c) != 127 for c in value))
    return parts


def _absolute(value):
    value = os.fspath(value)
    require(os.path.isabs(value) and value != "/")
    _parts(value[1:])
    return value


def _directory(path, private=False):
    """Open every absolute component with O_NOFOLLOW, without resolving links."""
    path = _absolute(path)
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in _parts(path[1:]):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=fd)
            os.close(fd)
            fd = child
        if private:
            _private_directory(fd)
        return fd
    except BaseException:
        os.close(fd)
        raise


def _private_directory(fd):
    value = os.fstat(fd)
    require(stat.S_ISDIR(value.st_mode) and value.st_uid == os.geteuid())
    require(stat.S_IMODE(value.st_mode) == 0o700)


def _snapshot(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns,
            value.st_ctime_ns, value.st_mode, value.st_uid, value.st_nlink)


def _file(root, relative):
    parts = _parts(relative)
    directory = os.dup(root)
    try:
        _private_directory(directory)
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=directory)
            os.close(directory)
            directory = child
            _private_directory(directory)
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                     dir_fd=directory)
        try:
            value = os.fstat(fd)
            require(stat.S_ISREG(value.st_mode) and value.st_uid == os.geteuid())
            require(stat.S_IMODE(value.st_mode) == 0o600 and value.st_nlink == 1)
            return fd, _snapshot(value)
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(directory)


def _hash_fd(fd, guard=None):
    digest = hashlib.sha256()
    size = 0
    while True:
        if guard is not None:
            guard()
        chunk = os.read(fd, CHUNK)
        if not chunk:
            return size, digest.hexdigest()
        size += len(chunk)
        digest.update(chunk)


def _verify_file(root, entry, expected_snapshot=None, guard=None):
    fd, before = _file(root, entry["path"])
    try:
        require(expected_snapshot is None or before == expected_snapshot)
        require(before[2] == entry["bytes"])
        size, digest = _hash_fd(fd, guard)
        require(size == entry["bytes"] and digest == entry["sha256"])
        require(_snapshot(os.fstat(fd)) == before)
        return before
    finally:
        os.close(fd)


def _manifest(root, relative, digest, commit, run_id, input_digest, fingerprint):
    require(re.fullmatch(r"[a-f0-9]{64}", digest) is not None)
    require(re.fullmatch(r"[a-f0-9]{40}", commit) is not None)
    require(re.fullmatch(r"[0-9]{5,20}", run_id) is not None)
    require(re.fullmatch(r"[a-f0-9]{64}", input_digest) is not None)
    require(re.fullmatch(r"(?:[A-F0-9]{40}|[A-F0-9]{64})", fingerprint) is not None)
    fd, snap = _file(root, relative)
    try:
        require(0 < snap[2] <= MAX_MANIFEST)
        chunks = []
        remaining = snap[2]
        while remaining:
            chunk = os.read(fd, min(CHUNK, remaining))
            require(bool(chunk))
            chunks.append(chunk)
            remaining -= len(chunk)
        require(os.read(fd, 1) == b"" and _snapshot(os.fstat(fd)) == snap)
        raw = b"".join(chunks)
        require(hashlib.sha256(raw).hexdigest() == digest)
    finally:
        os.close(fd)

    def unique_pairs(items):
        out = {}
        for key, value in items:
            require(key not in out)
            out[key] = value
        return out

    value = json.loads(raw, object_pairs_hook=unique_pairs)
    require(isinstance(value, dict) and set(value) == {
        "version", "exactCommit", "runId", "runAttempt", "inputManifestSHA",
        "recipientFingerprint", "files"})
    require(type(value["version"]) is int and value["version"] == 1)
    require(type(value["runAttempt"]) is int and value["runAttempt"] == 1)
    require((value["exactCommit"], value["runId"], value["inputManifestSHA"],
             value["recipientFingerprint"]) == (commit, run_id, input_digest, fingerprint))
    entries = value["files"]
    require(isinstance(entries, list) and 0 < len(entries) <= 100000)
    names = {relative}
    total = 0
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) == {"path", "bytes", "sha256"})
        _parts(entry["path"])
        require(entry["path"] not in names)
        names.add(entry["path"])
        require(type(entry["bytes"]) is int and 0 <= entry["bytes"] <= 2**63 - 1)
        require(isinstance(entry["sha256"], str)
                and re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]) is not None)
        total += entry["bytes"]
        require(total <= 2**63 - 1)
    return raw, snap, entries


def _public_packets(raw):
    """Reject secret OpenPGP packets before GPG can import anything."""
    text = raw.decode("ascii")
    lines = text.splitlines()
    require(lines and lines[0] == "-----BEGIN PGP PUBLIC KEY BLOCK-----")
    require(lines[-1] == "-----END PGP PUBLIC KEY BLOCK-----")
    require(lines.count(lines[0]) == 1 and lines.count(lines[-1]) == 1)
    index = 1
    while index < len(lines) - 1 and lines[index]:
        require(re.fullmatch(r"(?:Version|Comment|Charset): [\x20-\x7e]*", lines[index]) is not None)
        index += 1
    require(index < len(lines) - 1 and lines[index] == "")
    payload = lines[index + 1:-1]
    if payload and payload[-1].startswith("="):
        require(re.fullmatch(r"=[A-Za-z0-9+/]{4}", payload[-1]) is not None)
        payload = payload[:-1]
    require(payload and all(re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", x) for x in payload))
    data = base64.b64decode("".join(payload), validate=True)
    offset = 0
    seen_primary = 0
    while offset < len(data):
        header = data[offset]
        offset += 1
        require(header & 0x80)
        if header & 0x40:
            tag = header & 0x3f
            require(offset < len(data))
            length = data[offset]
            offset += 1
            if 192 <= length <= 223:
                require(offset < len(data))
                length = ((length - 192) << 8) + data[offset] + 192
                offset += 1
            elif length == 255:
                require(offset + 4 <= len(data))
                length = int.from_bytes(data[offset:offset + 4], "big")
                offset += 4
            else:
                require(length < 192)  # Reject unbounded/partial packet lengths.
        else:
            tag = (header >> 2) & 15
            length_type = header & 3
            require(length_type != 3)
            width = (1, 2, 4)[length_type]
            require(offset + width <= len(data))
            length = int.from_bytes(data[offset:offset + width], "big")
            offset += width
        require(tag in {2, 6, 10, 13, 14, 17})  # Never secret primary/subkey tags 5/7.
        seen_primary += tag == 6
        require(length >= 0 and offset + length <= len(data))
        offset += length
    require(seen_primary == 1)


def _read_public_key(path):
    path = _absolute(path)
    parent = _directory(os.path.dirname(path))
    try:
        fd = os.open(os.path.basename(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                     dir_fd=parent)
        try:
            snap = _snapshot(os.fstat(fd))
            require(stat.S_ISREG(snap[5]) and snap[6] == os.geteuid() and snap[7] == 1)
            require(0 < snap[2] <= MAX_PUBLIC_KEY)
            # Inspect only the armor header before accepting a public-key input.
            first = os.read(fd, 38)
            require(first.startswith(b"-----BEGIN PGP PUBLIC KEY BLOCK-----\n")
                    or first.startswith(b"-----BEGIN PGP PUBLIC KEY BLOCK-----\r\n"))
            raw = first
            while len(raw) < snap[2]:
                chunk = os.read(fd, min(CHUNK, snap[2] - len(raw)))
                require(bool(chunk))
                raw += chunk
            require(os.read(fd, 1) == b"" and _snapshot(os.fstat(fd)) == snap)
        finally:
            os.close(fd)
    finally:
        os.close(parent)
    _public_packets(raw)
    return raw


def _gpg_base(home):
    return [GPG, "--no-options", "--homedir", home, "--batch", "--no-tty",
            "--no-autostart", "--no-auto-key-retrieve", "--no-auto-key-import",
            "--no-auto-check-trustdb"]


def _gpg_env():
    return {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}


def _import_public(home, raw, fingerprint):
    base = _gpg_base(home)
    shown = subprocess.run(base + ["--with-colons", "--import-options", "show-only",
                           "--dry-run", "--import"], input=raw, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, env=_gpg_env(), timeout=30)
    require(shown.returncode == 0 and len(shown.stdout) <= 4 * MAX_PUBLIC_KEY)
    primary = []
    awaiting = False
    for line in shown.stdout.decode("utf-8").splitlines():
        fields = line.split(":")
        require(fields[0] not in ("sec", "ssb"))
        if fields[0] == "pub":
            require(fields[1] not in ("r", "e", "d"))
            awaiting = True
        elif fields[0] == "fpr" and awaiting:
            primary.append(fields[9])
            awaiting = False
    require(primary == [fingerprint])
    imported = subprocess.run(base + ["--import"], input=raw, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, env=_gpg_env(), timeout=30)
    require(imported.returncode == 0)


class _EncryptPipe:
    def __init__(self, process, guard=None):
        self.process = process
        self.guard = guard
        self.fd = process.stdin.fileno()
        os.set_blocking(self.fd, False)

    def write(self, data):
        total = len(data)
        view = memoryview(data)
        deadline = time.monotonic() + 60
        while view:
            if self.guard is not None:
                self.guard()
            require(self.process.poll() is None and time.monotonic() < deadline)
            if not select.select([], [self.fd], [], min(1, max(0, deadline - time.monotonic())))[1]:
                continue
            try:
                count = os.write(self.fd, view[:CHUNK])
            except BlockingIOError:
                continue
            require(count > 0)
            view = view[count:]
        return total


class _StreamingReader:
    def __init__(self, fd, guard=None):
        self.fd = fd
        self.guard = guard
        self.size = 0
        self.digest = hashlib.sha256()

    def read(self, size):
        if self.guard is not None:
            self.guard()
        require(0 <= size <= CHUNK)
        chunk = os.read(self.fd, size)
        self.size += len(chunk)
        self.digest.update(chunk)
        return chunk


def _member(name, size):
    info = tarfile.TarInfo(name)
    info.size = size
    info.mode = 0o600
    info.mtime = 0
    info.uid = info.gid = 0
    return info


def _write_archive(stream, root, raw, entries, snapshots, guard=None):
    with tarfile.open(fileobj=stream, mode="w|", format=tarfile.PAX_FORMAT) as archive:
        archive.addfile(_member("W15_MANIFEST.PRIVATE.json", len(raw)), io.BytesIO(raw))
        for entry, expected in zip(entries, snapshots):
            if guard is not None:
                guard()
            fd, before = _file(root, entry["path"])
            try:
                require(before == expected)
                reader = _StreamingReader(fd, guard)
                archive.addfile(_member("files/" + entry["path"], entry["bytes"]), reader)
                require(reader.size == entry["bytes"]
                        and reader.digest.hexdigest() == entry["sha256"])
                require(os.read(fd, 1) == b"" and _snapshot(os.fstat(fd)) == before)
            finally:
                os.close(fd)
        # A file changed after its archive member was written must also fail.
        for entry, expected in zip(entries, snapshots):
            if guard is not None:
                guard()
            _verify_file(root, entry, expected, guard)


def seal(*, root, manifest, manifest_sha256, public_key, recipient_fingerprint,
         commit, run_id, input_manifest_sha256, output, guard=None):
    require(guard is None or callable(guard))
    if guard is not None:
        guard()
    root = _absolute(root)
    output = _absolute(output)
    require(os.path.commonpath([root, output]) != root)
    root_fd = _directory(root, private=True)
    parent_fd = None
    output_fd = None
    process = None
    try:
        root_identity = os.fstat(root_fd)
        raw, manifest_snapshot, entries = _manifest(
            root_fd, manifest, manifest_sha256, commit, run_id,
            input_manifest_sha256, recipient_fingerprint)
        snapshots = [_verify_file(root_fd, entry, guard=guard) for entry in entries]
        key = _read_public_key(public_key)
        with tempfile.TemporaryDirectory(prefix="w15-public-seal-") as home:
            os.chmod(home, 0o700)
            _import_public(home, key, recipient_fingerprint)
            parent_fd = _directory(os.path.dirname(output), private=True)
            output_fd = os.open(os.path.basename(output),
                                os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                0o600, dir_fd=parent_fd)
            os.fchmod(output_fd, 0o600)
            os.fsync(parent_fd)
            process = subprocess.Popen(
                _gpg_base(home) + ["--trust-model", "always", "--compress-algo", "none",
                                  "--recipient", recipient_fingerprint, "--encrypt"],
                stdin=subprocess.PIPE, stdout=output_fd, stderr=subprocess.DEVNULL,
                env=_gpg_env(), bufsize=0)
            _write_archive(_EncryptPipe(process, guard), root_fd, raw, entries, snapshots, guard)
            _verify_file(root_fd, {"path": manifest, "bytes": len(raw),
                                  "sha256": manifest_sha256}, manifest_snapshot, guard)
            check_root = _directory(root, private=True)
            try:
                current = os.fstat(check_root)
                require((current.st_dev, current.st_ino) ==
                        (root_identity.st_dev, root_identity.st_ino))
            finally:
                os.close(check_root)
            process.stdin.close()
            require(process.wait(timeout=60) == 0)
            os.fsync(output_fd)
            value = os.fstat(output_fd)
            require(stat.S_ISREG(value.st_mode) and value.st_uid == os.geteuid()
                    and stat.S_IMODE(value.st_mode) == 0o600 and value.st_nlink == 1)
            named_fd = os.open(os.path.basename(output), os.O_RDONLY | os.O_NOFOLLOW,
                               dir_fd=parent_fd)
            try:
                require(_snapshot(os.fstat(named_fd)) == _snapshot(value))
            finally:
                os.close(named_fd)
            os.lseek(output_fd, 0, os.SEEK_SET)
            size, digest = _hash_fd(output_fd, guard)
            require(size > 0 and _snapshot(os.fstat(output_fd)) == _snapshot(value))
            if guard is not None:
                guard()
            os.fsync(parent_fd)
            return {"status": STATUS, "cipherSHA256": digest, "cipherBytes": size,
                    "fileCount": len(entries), "manifestSHA256": manifest_sha256,
                    "recipientFingerprint": recipient_fingerprint, "exactCommit": commit,
                    "runId": run_id, "runAttempt": 1,
                    "inputManifestSHA": input_manifest_sha256}
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if process.stdin is not None and not process.stdin.closed:
                process.stdin.close()
        if output_fd is not None:
            # An unsuccessful/partial cipher is retained exclusively, never retried.
            os.fchmod(output_fd, 0o600)
            os.fsync(output_fd)
            os.close(output_fd)
        if parent_fd is not None:
            os.fsync(parent_fd)
            os.close(parent_fd)
        os.close(root_fd)


def main():
    class PrivateArgumentParser(argparse.ArgumentParser):
        def error(self, message):
            raise SealError()

    parser = PrivateArgumentParser(description=__doc__)
    for flag in ("root", "manifest", "manifest-sha256", "public-key",
                 "recipient-fingerprint", "commit", "run-id",
                 "input-manifest-sha256", "output"):
        parser.add_argument("--" + flag, required=True)
    try:
        args = parser.parse_args()
        result = seal(**vars(args))
    except (Exception, KeyboardInterrupt):
        print(json.dumps({"status": "FAIL_LOCAL_SEAL"}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
