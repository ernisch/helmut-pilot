"""Small synthetic filesystem checks only. No Docker, network, database or run."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("w15_prepare", Path(__file__).with_name("prepare.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        self.contract = copy.deepcopy(json.loads(P.CONTRACT.read_text()))
        self.mapping = {}
        pins = {}
        for key in list(self.contract["hardPins"]) + self.contract["fixtureKeys"]:
            data = ("fictional-" + key).encode()
            self.mapping[key] = key + ".private"
            self.write(self.mapping[key], data)
            pin = {"path": "/historical/provenance/" + key, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            if key in self.contract["hardPins"]:
                self.contract["hardPins"][key] = pin
            else:
                pins[key] = pin
        bound = json.dumps({"executionAuthority": False, "totalUsageRows": 6000, "protectedOutputPins": pins}).encode()
        self.write("bound.json", bound)
        self.contract["bound"] = {"bytes": len(bound), "sha256": hashlib.sha256(bound).hexdigest()}
        self.write("manifest.json", json.dumps(self.mapping).encode())

    def write(self, name, data):
        path = self.root / name
        path.write_bytes(data)
        path.chmod(0o600)

    def verify(self):
        with patch.object(P, "git_head", return_value="a" * 40):
            return P.verify(str(self.root), "manifest.json", "bound.json", "a" * 40, self.contract)

    def rejected(self, code=None):
        with self.assertRaises(P.Rejected) as caught:
            self.verify()
        if code:
            self.assertEqual(str(caught.exception), code)

    def test_complete_set_only_proves_bytes(self):
        result = self.verify()
        self.assertEqual(result["verifiedPayloadFiles"], 9)
        self.assertFalse(result["executionAuthority"])
        self.assertFalse(result["testStarted"])
        self.assertEqual(result["readiness"], "BLOCKED")

    def test_pin_drift(self):
        self.write("auth.private", b"changed")
        self.rejected("PIN_MISMATCH")

    def test_bound_drift(self):
        self.write("bound.json", b"{}")
        self.rejected("PIN_MISMATCH")

    def test_traversal(self):
        self.mapping["auth"] = "../outside"
        self.write("manifest.json", json.dumps(self.mapping).encode())
        self.rejected("PATH_INVALID")

    def test_symlink_payload_and_parent(self):
        path = self.root / "auth.private"
        path.unlink()
        path.symlink_to(self.root / "seed.private")
        self.rejected("FILE_TYPE_INVALID")
        path.unlink()
        alias = self.root.parent / (self.root.name + "-alias")
        alias.symlink_to(self.root, target_is_directory=True)
        self.addCleanup(alias.unlink)
        with self.assertRaises(OSError):
            P.open_root(str(alias))

    def test_modes_and_hardlinks(self):
        path = self.root / "auth.private"
        path.chmod(0o644)
        self.rejected("MODE_INVALID")
        path.chmod(0o600)
        os.link(path, self.root / "extra")
        self.rejected("HARDLINK_FORBIDDEN")

    def test_root_and_nested_directory_modes(self):
        self.root.chmod(0o755)
        self.rejected("MODE_INVALID")
        self.root.chmod(0o700)
        nested = self.root / "nested"
        nested.mkdir(mode=0o700)
        (self.root / "auth.private").rename(nested / "auth.private")
        self.mapping["auth"] = "nested/auth.private"
        self.write("manifest.json", json.dumps(self.mapping).encode())
        self.assertFalse(self.verify()["testStarted"])
        nested.chmod(0o755)
        self.rejected("MODE_INVALID")

    def test_extra_file_and_empty_directory(self):
        self.write("unnecessary-original", b"private")
        self.rejected("FILE_SET_INVALID")
        (self.root / "unnecessary-original").unlink()
        (self.root / "extra").mkdir(mode=0o700)
        self.rejected("FILE_SET_INVALID")

    def test_manifest_missing_or_alias(self):
        self.mapping.pop("auth")
        self.write("manifest.json", json.dumps(self.mapping).encode())
        self.rejected("MANIFEST_KEYS_INVALID")

    def test_commit_mismatch(self):
        with patch.object(P, "git_head", return_value="b" * 40):
            with self.assertRaisesRegex(P.Rejected, "COMMIT_MISMATCH"):
                P.verify(str(self.root), "manifest.json", "bound.json", "a" * 40, self.contract)

    def test_public_plan_has_no_process_or_private_access(self):
        output = io.StringIO()
        with patch.object(P, "verify", side_effect=AssertionError("must not inspect inputs")), contextlib.redirect_stdout(output):
            self.assertEqual(P.main(["--plan"]), 0)
        self.assertFalse(json.loads(output.getvalue())["executionAuthority"])
        source = Path(P.__file__).read_text()
        self.assertNotIn("import subprocess", source)
        self.assertNotIn("os.system", source)

    def test_byte_verification_never_spawns_or_connects(self):
        with patch.object(subprocess, "Popen", side_effect=AssertionError("process forbidden")), \
                patch.object(socket, "socket", side_effect=AssertionError("network forbidden")), \
                patch.object(os, "system", side_effect=AssertionError("shell forbidden")):
            self.assertFalse(self.verify()["testStarted"])

    def test_direct_git_worktree_and_packed_heads(self):
        repo = self.root / "git-example"
        repo.mkdir(mode=0o700)
        git = repo / ".git"
        git.mkdir(mode=0o700)
        (git / "HEAD").write_text("a" * 40 + "\n")
        self.assertEqual(P.git_head(repo), "a" * 40)
        (git / "HEAD").write_text("ref: refs/heads/work\n")
        (git / "packed-refs").write_text("b" * 40 + " refs/heads/work\n")
        self.assertEqual(P.git_head(repo), "b" * 40)
        worktree = repo / "worktree"
        worktree.mkdir(mode=0o700)
        (worktree / ".git").write_text("gitdir: ../.git\n")
        self.assertEqual(P.git_head(worktree), "b" * 40)

    def test_rejection_does_not_echo_private_path(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(P.main(["--verify-inputs", "--input-root", str(self.root)]), 1)
        self.assertNotIn(str(self.root), output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["reason"], "ARGUMENTS_INVALID")

    def test_metadata_growth_is_bounded_during_read(self):
        self.write("growing.json", b"{}")
        root_fd = P.open_root(str(self.root))
        original_read = os.read
        grew = False

        def grow_before_read(fd, size):
            nonlocal grew
            if not grew:
                grew = True
                with (self.root / "growing.json").open("ab") as target:
                    target.write(b"x" * 65)
            return original_read(fd, size)

        try:
            with patch.object(P.os, "read", grow_before_read):
                with self.assertRaisesRegex(P.Rejected, "METADATA_TOO_LARGE"):
                    P.inspect_file(root_fd, "growing.json", retain_limit=64)
        finally:
            os.close(root_fd)


if __name__ == "__main__":
    unittest.main()
