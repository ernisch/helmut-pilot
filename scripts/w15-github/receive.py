"""Local library for one selected W15 reception; no CLI, network or test authority.

Cipher hash/size and the complete context must arrive independently. Partial
destinations remain private and may never be reused. No plaintext tar is saved.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import threading

SPEC = importlib.util.spec_from_file_location("w15_receive_seal", Path(__file__).with_name("seal.py"))
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
REQUEST = Path(__file__).with_name("source-export-request.json")
TOTAL = 242570240
MAX_MANIFEST = 65536
MAX_OVERHEAD = 65536
PAYLOADS = {"auth", "evidenceRows", "privateDraftStoreRows", "resultRows",
            "privateDraftReviewRows", "seed", "currentCommand", "frozenSourceDump", "localRoles"}
CONTROLS = {"bound", "boundReview", "reception"}
FIXTURES = PAYLOADS - {"seed", "currentCommand", "frozenSourceDump", "localRoles"}
STATUS = "PASS_SELECTED_INPUT_BYTES_DECRYPTED_START_BLOCKED"


class ReceiveError(Exception):
    """Only fixed public error codes belong in exceptions."""


def require(value, code="RECEPTION_REJECTED"):
    if not value:
        raise ReceiveError(code)


def decode(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, "DUPLICATE_JSON_KEY")
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs)


def expected_pins():
    request = decode(REQUEST.read_bytes())
    require(set(request["payloads"]) == PAYLOADS and set(request["controls"]) == CONTROLS)
    pins = {**request["payloads"], **request["controls"]}
    pins["reception"] = {**pins["reception"], "bytes": 12357}
    for pin in pins.values():
        require(type(pin["bytes"]) is int and pin["bytes"] > 0)
        require(isinstance(pin["sha256"], str) and re.fullmatch("[a-f0-9]{64}", pin["sha256"]))
    require(len({(v["bytes"], v["sha256"]) for v in pins.values()}) == 12)
    require(sum(v["bytes"] for v in pins.values()) == TOTAL)
    return pins


def private_open(path):
    path = S._absolute(path)
    parent = S._directory(os.path.dirname(path), private=True)
    try:
        return S._file(parent, os.path.basename(path))
    finally:
        os.close(parent)


def write(fd, name, blocks):
    out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
    digest = hashlib.sha256()
    size = 0
    with os.fdopen(out, "wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        for block in blocks:
            stream.write(block)
            digest.update(block)
            size += len(block)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(fd)
    return size, digest.hexdigest()


class LimitedPipe:
    def __init__(self, stream):
        self.stream, self.count = stream, 0

    def read(self, size):
        require(0 <= size <= S.CHUNK)
        block = self.stream.read(size)
        self.count += len(block)
        require(self.count <= TOTAL + MAX_MANIFEST + MAX_OVERHEAD, "PLAINTEXT_LIMIT")
        return block


def manifest(raw, expected, pins):
    value = decode(raw)
    require(isinstance(value, dict) and set(value) == {"version", "exactCommit", "runId",
            "runAttempt", "inputManifestSHA", "recipientFingerprint", "files"})
    require(type(value["version"]) is int and value["version"] == 1)
    require(type(value["runAttempt"]) is int and value["runAttempt"] == 1)
    require(all(value[k] == v for k, v in expected.items()), "CONTEXT_MISMATCH")
    require(isinstance(value["files"], list) and len(value["files"]) == 12, "FILE_SET_INVALID")
    lookup = {(v["bytes"], v["sha256"]): k for k, v in pins.items()}
    names, keys = set(), set()
    entries = []
    for entry in value["files"]:
        require(isinstance(entry, dict) and set(entry) == {"path", "bytes", "sha256"})
        S._parts(entry["path"])
        require(type(entry["bytes"]) is int and isinstance(entry["sha256"], str))
        key = lookup.get((entry["bytes"], entry["sha256"]))
        require(key is not None and key not in keys and entry["path"] not in names, "FILE_SET_INVALID")
        names.add(entry["path"])
        keys.add(key)
        entries.append((key, entry))
    require(keys == set(pins), "FILE_SET_INVALID")
    return entries


def verify_controls(values, pins):
    bound, review, reception = (decode(values[k]) for k in ("bound", "boundReview", "reception"))
    require(all(bound.get(k) is False for k in ("executionAuthority", "actualExecution",
            "costOrQualityAcceptance", "full500Acceptance", "originalInputModified")))
    require(bound.get("totalUsageRows") == 6000 and bound.get("preservedOriginalUsageRows") == 5139)
    require(set(bound.get("protectedOutputPins", {})) == FIXTURES)
    for key in FIXTURES:
        require(all(bound["protectedOutputPins"][key].get(k) == pins[key][k]
                    for k in ("bytes", "sha256")))
    require(review.get("status") == "PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY")
    require(all(review.get("inputReportPin", {}).get(k) == pins["bound"][k]
                for k in ("path", "bytes", "sha256")))
    require(reception.get("actualFileCount") == 11 and reception.get("actualPayloadBytes") == 96530256
            and reception.get("allPathsSizesSHA256Match") is True)
    rows = reception.get("files")
    require(isinstance(rows, list) and len(rows) == 11 and len({r["key"] for r in rows}) == 11)
    for key in ("frozenSourceDump", "localRoles"):
        row = next(r for r in rows if r["key"] == key)
        require(row.get("expectedBytes") == pins[key]["bytes"] and row.get("expectedSHA256") == pins[key]["sha256"])


def receive(cipher, *, cipher_sha256, cipher_bytes, destination, private_home,
            passphrase_file, exact_commit, run_id, input_manifest_sha256, recipient_fingerprint):
    """Decrypt one independently bound cipher into one NEW private directory."""
    expected = {"exactCommit": exact_commit, "runId": run_id,
                "inputManifestSHA": input_manifest_sha256, "recipientFingerprint": recipient_fingerprint}
    for text, pattern in ((exact_commit, "[a-f0-9]{40}"), (run_id, "[0-9]{5,20}"),
            (input_manifest_sha256, "[a-f0-9]{64}"), (cipher_sha256, "[a-f0-9]{64}"),
            (recipient_fingerprint, "(?:[A-F0-9]{40}|[A-F0-9]{64})")):
        require(isinstance(text, str) and re.fullmatch(pattern, text), "CONTEXT_INVALID")
    require(type(cipher_bytes) is int and 0 < cipher_bytes <= TOTAL + MAX_MANIFEST + MAX_OVERHEAD)
    pins = expected_pins()
    cipher_fd, snap = private_open(cipher)
    home_fd = pass_fd = parent_fd = root_fd = payload_fd = provenance_fd = None
    process = timer = None
    agent_close_attempted = False
    def close_owned_agent():
        nonlocal agent_close_attempted
        agent_close_attempted = True
        try:
            result = subprocess.run(["/usr/bin/gpgconf", "--homedir", private_home, "--kill", "gpg-agent"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=S._gpg_env(), timeout=15, check=False)
            require(result.returncode == 0, "AGENT_CLOSE_FAILED")
        except (OSError, subprocess.TimeoutExpired):
            raise ReceiveError("AGENT_CLOSE_FAILED") from None
    try:
        require(snap[2] == cipher_bytes and S._hash_fd(cipher_fd) == (cipher_bytes, cipher_sha256), "CIPHER_MISMATCH")
        require(S._snapshot(os.fstat(cipher_fd)) == snap, "CIPHER_CHANGED")
        os.lseek(cipher_fd, 0, os.SEEK_SET)
        home_fd = S._directory(private_home, private=True)
        pass_fd, pass_snap = private_open(passphrase_file)
        require(0 < pass_snap[2] <= 4096, "PASSPHRASE_FILE_INVALID")
        # GPG's agent needs a stable real homedir after inherited FDs close.
        # All path components were opened without following links above.
        home_identity = os.fstat(home_fd)
        base = S._gpg_base(private_home) + ["--disable-dirmngr"]
        listed = subprocess.run(base + ["--with-colons", "--list-keys", recipient_fingerprint],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, pass_fds=(home_fd,), env=S._gpg_env(), timeout=30)
        require(listed.returncode == 0 and len(listed.stdout) <= 65536, "RECIPIENT_MISMATCH")
        primary, awaiting = [], False
        for line in listed.stdout.decode("ascii").splitlines():
            row = line.split(":")
            if row[0] == "pub":
                require(row[1] not in ("r", "e", "d"), "RECIPIENT_MISMATCH")
                awaiting = True
            elif row[0] == "fpr" and awaiting:
                primary.append(row[9])
                awaiting = False
        require(primary == [recipient_fingerprint], "RECIPIENT_MISMATCH")
        destination = S._absolute(destination)
        parent_fd = S._directory(os.path.dirname(destination), private=True)
        os.mkdir(os.path.basename(destination), 0o700, dir_fd=parent_fd)
        root_fd = os.open(os.path.basename(destination), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
        for name in ("payloads", "provenance"):
            os.mkdir(name, 0o700, dir_fd=root_fd)
        payload_fd = os.open("payloads", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        provenance_fd = os.open("provenance", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        os.fsync(parent_fd)
        decrypt_base = [arg for arg in base if arg != "--no-autostart"]
        process = subprocess.Popen(decrypt_base + ["--pinentry-mode", "loopback", "--passphrase-fd", str(pass_fd), "--decrypt"],
                stdin=cipher_fd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                pass_fds=(home_fd, pass_fd), env=S._gpg_env(), bufsize=0)
        timer = threading.Timer(120, process.kill)
        timer.daemon = True
        timer.start()
        controls, mapping, total, offset = {}, {}, 0, 0
        with tarfile.open(fileobj=LimitedPipe(process.stdout), mode="r|") as archive:
            first = archive.next()
            require(first is not None and first.name == "W15_MANIFEST.PRIVATE.json"
                    and first.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and first.sparse is None
                    and not first.linkname and not first.pax_headers
                    and first.offset_data == 512 and 0 < first.size <= MAX_MANIFEST, "MANIFEST_INVALID")
            raw = archive.extractfile(first).read(MAX_MANIFEST + 1)
            require(len(raw) == first.size)
            entries = manifest(raw, expected, pins)
            write(root_fd, "W15_MANIFEST.PRIVATE.json", [raw])
            offset = first.offset_data + ((first.size + 511) // 512) * 512
            for key, entry in entries:
                member = archive.next()
                require(member is not None and member.name == "files/" + entry["path"]
                        and member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and member.sparse is None
                        and not member.linkname and not member.pax_headers
                        and member.offset_data == offset + 512 and member.size == entry["bytes"], "TAR_MEMBER_INVALID")
                target = payload_fd if key in PAYLOADS or key == "bound" else provenance_fd
                name = "bound.json" if key == "bound" else key + ".PRIVATE"
                stream = archive.extractfile(member)
                retained = []
                def blocks():
                    while block := stream.read(S.CHUNK):
                        if key in CONTROLS:
                            retained.append(block)
                        yield block
                require(write(target, name, blocks()) == (entry["bytes"], entry["sha256"]), "PAYLOAD_MISMATCH")
                if key in CONTROLS:
                    controls[key] = b"".join(retained)
                else:
                    mapping[key] = name
                total += member.size
                offset = member.offset_data + ((member.size + 511) // 512) * 512
            require(archive.next() is None, "EXTRA_MEMBER")
            tail = 0
            while block := archive.fileobj.read(S.CHUNK):
                require(not any(block), "TRAILING_DATA")
                tail += len(block)
            require(tail >= 512, "TAR_EOF_MISSING")
        require(process.wait(timeout=15) == 0, "GPG_INTEGRITY_FAILED")
        check_home = S._directory(private_home, private=True)
        try:
            current_home = os.fstat(check_home)
            require((current_home.st_dev, current_home.st_ino) == (home_identity.st_dev, home_identity.st_ino), "PRIVATE_HOME_CHANGED")
        finally:
            os.close(check_home)
        require(total == TOTAL and S._snapshot(os.fstat(cipher_fd)) == snap, "TOTAL_OR_CIPHER_CHANGED")
        require(S._snapshot(os.fstat(pass_fd)) == pass_snap, "PASSPHRASE_FILE_CHANGED")
        verify_controls(controls, pins)
        for key, pin in pins.items():
            target = payload_fd if key in PAYLOADS or key == "bound" else provenance_fd
            name = "bound.json" if key == "bound" else key + ".PRIVATE"
            fd, before = S._file(target, name)
            try:
                require(S._hash_fd(fd) == (pin["bytes"], pin["sha256"]), "FINAL_FILE_MISMATCH")
                require(S._snapshot(os.fstat(fd)) == before, "FINAL_FILE_CHANGED")
            finally:
                os.close(fd)
        close_owned_agent()
        write(payload_fd, "manifest.json", [json.dumps(mapping, sort_keys=True).encode() + b"\n"])
        receipt = {"status": STATUS, "verifiedFiles": 12, "verifiedBytes": total,
                "cipherSHA256": cipher_sha256, "cipherBytes": cipher_bytes,
                "sealedManifestSHA256": hashlib.sha256(raw).hexdigest(), **expected,
                "runAttempt": 1, "executionAuthority": False, "testStarted": False, "readiness": "BLOCKED"}
        write(root_fd, "RECEPTION.SAFE.json", [json.dumps(receipt, sort_keys=True).encode() + b"\n"])
        os.fsync(root_fd)
        return receipt
    finally:
        if timer is not None:
            timer.cancel()
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.stdout.close()
            process.wait(timeout=15)
            # Never replace the original reception error with a cleanup error.
            if not agent_close_attempted:
                try:
                    close_owned_agent()
                except ReceiveError:
                    pass
        for fd in (provenance_fd, payload_fd, root_fd, parent_fd, pass_fd, home_fd, cipher_fd):
            if fd is not None:
                os.close(fd)
