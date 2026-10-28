#!/usr/bin/env python3
"""Read-only byte preparation; never starts Docker, a test, or a network request.

--plan needs no private data. Verification interface:
  --verify-inputs --input-root /private/root --manifest manifest.json
  --bound bound.json --expected-commit <40 lowercase hex characters>
Manifest and bound paths may be relative to input-root or absolute below it.
The manifest maps exactly nine contract keys to unique relative payload paths.
Only these nine payloads, manifest, bound and their parent directories may exist.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

REPO = Path(__file__).absolute().parents[2]
CONTRACT = Path(__file__).with_name("end500-contract.json")
HEX = re.compile(r"[0-9a-f]{40}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")


class Rejected(Exception):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def decode(data):
    try:
        return json.loads(data, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError):
        raise Rejected("INVALID_JSON") from None


def git_head(repo):
    """Read normal/worktree Git metadata without executing Git or hooks."""
    git = repo / ".git"
    if git.is_file():
        value = git.read_text().strip()
        require(value.startswith("gitdir: "), "GIT_METADATA_INVALID")
        git = repo / value[8:]
    head = (git / "HEAD").read_text().strip()
    if head.startswith("ref: "):
        ref = head[5:]
        require(re.fullmatch(r"refs/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+", ref)
                and ".." not in ref, "GIT_METADATA_INVALID")
        common = git / (git / "commondir").read_text().strip() if (git / "commondir").exists() else git
        if (common / ref).is_file():
            head = (common / ref).read_text().strip()
        else:
            matches = [line.split()[0] for line in (common / "packed-refs").read_text().splitlines()
                       if not line.startswith(("#", "^")) and line.endswith(" " + ref)]
            require(len(matches) == 1, "GIT_METADATA_INVALID")
            head = matches[0]
    require(HEX.fullmatch(head), "GIT_METADATA_INVALID")
    return head


def parts(value):
    require(isinstance(value, str) and value and not value.startswith("/")
            and all(p not in ("", ".", "..") for p in value.split("/"))
            and "\x00" not in value and "\\" not in value, "PATH_INVALID")
    return value.split("/")


def relative(value, root):
    if value.startswith("/"):
        require(value.startswith(root + "/"), "PATH_OUTSIDE_ROOT")
        value = value[len(root) + 1:]
    parts(value)
    return value


def private_stat(value, directory=False):
    require((stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode)), "FILE_TYPE_INVALID")
    require(value.st_uid == os.getuid(), "OWNER_INVALID")
    require(stat.S_IMODE(value.st_mode) == (0o700 if directory else 0o600), "MODE_INVALID")
    if not directory:
        require(value.st_nlink == 1, "HARDLINK_FORBIDDEN")


def open_root(root):
    require(root.startswith("/") and root != "/", "ROOT_INVALID")
    names = parts(root[1:])
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for name in names:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        private_stat(os.fstat(fd), directory=True)
        return fd
    except BaseException:
        os.close(fd)
        raise


def inspect_file(root_fd, name, expected=None, retain_limit=0):
    fd = os.dup(root_fd)
    try:
        names = parts(name)
        for parent in names[:-1]:
            child = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            private_stat(os.fstat(fd), directory=True)
        child = os.open(names[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        os.close(fd)
        fd = child
        before = os.fstat(fd)
        private_stat(before)
        if expected is not None:
            require(type(expected.get("bytes")) is int and expected["bytes"] >= 0
                    and isinstance(expected.get("sha256"), str) and SHA.fullmatch(expected["sha256"]), "PIN_INVALID")
            require(before.st_size == expected["bytes"], "PIN_MISMATCH")
        if retain_limit:
            require(before.st_size <= retain_limit, "METADATA_TOO_LARGE")
        digest = hashlib.sha256()
        retained = []
        while block := os.read(fd, 1024 * 1024):
            digest.update(block)
            if retain_limit:
                retained.append(block)
        after = os.fstat(fd)
        require((before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_size, after.st_mtime_ns, after.st_ctime_ns), "INPUT_CHANGED")
        if expected is not None:
            require(digest.hexdigest() == expected["sha256"], "PIN_MISMATCH")
        return b"".join(retained)
    finally:
        os.close(fd)


def tree_files(fd, prefix=""):
    files = set()
    directories = set()
    for name in os.listdir(fd):
        path = prefix + name
        value = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if stat.S_ISDIR(value.st_mode):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                private_stat(os.fstat(child), directory=True)
                nested_files, nested_dirs = tree_files(child, path + "/")
            finally:
                os.close(child)
            files |= nested_files
            directories |= nested_dirs | {path}
        else:
            private_stat(value)
            files.add(path)
    return files, directories


def verify(root, manifest, bound_name, expected_commit, contract, repo=REPO):
    require(HEX.fullmatch(expected_commit), "COMMIT_INVALID")
    require(git_head(repo) == expected_commit, "COMMIT_MISMATCH")
    manifest, bound_name = relative(manifest, root), relative(bound_name, root)
    fd = open_root(root)
    try:
        mapping = decode(inspect_file(fd, manifest, retain_limit=16384))
        require(isinstance(mapping, dict), "MANIFEST_INVALID")
        keys = set(contract["hardPins"]) | set(contract["fixtureKeys"])
        require(set(mapping) == keys and len(keys) == 9, "MANIFEST_KEYS_INVALID")
        for path in mapping.values():
            parts(path)
        allowed = set(mapping.values()) | {manifest, bound_name}
        require(len(allowed) == 11, "MANIFEST_PATH_ALIAS")
        parents = {"/".join(path.split("/")[:i]) for path in allowed for i in range(1, len(path.split("/")))}
        require(tree_files(fd) == (allowed, parents), "FILE_SET_INVALID")
        bound = decode(inspect_file(fd, bound_name, contract["bound"], retain_limit=16384))
        require(isinstance(bound, dict) and bound.get("executionAuthority") is False
                and bound.get("totalUsageRows") == 6000, "BOUND_SCOPE_INVALID")
        pins = bound.get("protectedOutputPins")
        require(isinstance(pins, dict) and set(pins) == set(contract["fixtureKeys"]), "BOUND_KEYS_INVALID")
        for pin in pins.values():
            require(isinstance(pin, dict) and isinstance(pin.get("path"), str)
                    and pin["path"], "PIN_INVALID")
        for key in keys:
            inspect_file(fd, mapping[key], contract["hardPins"].get(key, pins.get(key)))
        require(tree_files(fd) == (allowed, parents), "FILE_SET_INVALID")
    finally:
        os.close(fd)
    return {"status": "PASS_INPUT_BYTES_ONLY_START_BLOCKED", "verifiedPayloadFiles": 9,
            "verifiedMetadataFiles": 2, "executionAuthority": False, "testStarted": False, "readiness": "BLOCKED"}


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise Rejected("ARGUMENTS_INVALID")


def main(argv=None):
    try:
        parser = Parser(description=__doc__)
        action = parser.add_mutually_exclusive_group(required=True)
        action.add_argument("--plan", action="store_true")
        action.add_argument("--verify-inputs", action="store_true")
        for option in ("input-root", "manifest", "bound", "expected-commit"):
            parser.add_argument("--" + option)
        args = parser.parse_args(argv)
        contract = decode(CONTRACT.read_bytes())
        if args.plan:
            require(all(value is None for value in (args.input_root, args.manifest, args.bound, args.expected_commit)), "ARGUMENTS_INVALID")
            result = contract
        else:
            require(all((args.input_root, args.manifest, args.bound, args.expected_commit)), "ARGUMENTS_INVALID")
            result = verify(args.input_root, args.manifest, args.bound, args.expected_commit, contract)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except Rejected as error:
        reason = str(error)
    except OSError:
        reason = "FILESYSTEM_CHECK_FAILED"
    except Exception:
        reason = "CHECK_FAILED"
    print(json.dumps({"status": "FAIL_INPUT_CHECK_START_BLOCKED", "reason": reason,
                      "executionAuthority": False, "testStarted": False, "readiness": "BLOCKED"}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
