"""Synthetic local seal checks; no old keys, network, containers or uploads.

The one disposable key is created inside this test's temporary directory. The
decrypted archive is read as a pipe and never written to a plaintext tar file.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("w15_local_seal", Path(__file__).with_name("seal.py"))
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
COMMIT = "a" * 40
INPUT = "b" * 64
RUN = "40758148874"


@unittest.skipUnless(shutil.which("gpg") and Path(S.GPG).is_file(), "GPG unavailable")
class SealChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory(prefix="w15-synthetic-key-")
        cls.home = Path(cls.keys.name) / "keyring"
        cls.home.mkdir(mode=0o700)
        base = [S.GPG, "--no-options", "--homedir", str(cls.home), "--batch", "--no-tty"]
        made = subprocess.run(base + ["--pinentry-mode", "loopback", "--passphrase", "",
                              "--quick-generate-key", "W15 synthetic <w15@example.invalid>",
                              "rsa2048", "encr", "1d"], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, env=S._gpg_env(), timeout=45)
        if made.returncode:
            cls.keys.cleanup()
            raise RuntimeError("Synthetic key setup failed")
        listed = subprocess.run(base + ["--with-colons", "--list-keys"],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                env=S._gpg_env(), check=True, timeout=15)
        cls.fingerprint = next(x.split(":")[9] for x in listed.stdout.decode().splitlines()
                               if x.startswith("fpr:"))
        cls.public = Path(cls.keys.name) / "public.asc"
        exported = subprocess.run(base + ["--armor", "--export", cls.fingerprint],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  env=S._gpg_env(), check=True, timeout=15)
        cls.public.write_bytes(exported.stdout)
        cls.public.chmod(0o600)

    @classmethod
    def tearDownClass(cls):
        subprocess.run(["/usr/bin/gpgconf", "--homedir", str(cls.home), "--kill", "gpg-agent"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env=S._gpg_env(), timeout=15, check=False)
        cls.keys.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="w15-seal-fixture-")
        self.base = Path(self.temp.name)
        self.root = self.base / "input"
        self.root.mkdir(mode=0o700)
        self.out = self.base / "output"
        self.out.mkdir(mode=0o700)
        self.data = self.root / "synthetic.bin"
        self.data.write_bytes(b"synthetic-only\x00data\n")
        self.data.chmod(0o600)
        self._write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def _write_manifest(self, entries=None):
        if entries is None:
            with self.data.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            entries = [{"path": self.data.name, "bytes": self.data.stat().st_size, "sha256": digest}]
        value = {"version": 1, "exactCommit": COMMIT, "runId": RUN, "runAttempt": 1,
                 "inputManifestSHA": INPUT, "recipientFingerprint": self.fingerprint,
                 "files": entries}
        self.manifest = self.root / "manifest.PRIVATE.json"
        self.raw = json.dumps(value, sort_keys=True).encode()
        self.manifest.write_bytes(self.raw)
        self.manifest.chmod(0o600)
        self.args = {"root": str(self.root), "manifest": self.manifest.name,
                     "manifest_sha256": hashlib.sha256(self.raw).hexdigest(),
                     "public_key": str(self.public), "recipient_fingerprint": self.fingerprint,
                     "commit": COMMIT, "run_id": RUN, "input_manifest_sha256": INPUT,
                     "output": str(self.out / "evidence.gpg")}

    def test_stream_larger_than_8mib_roundtrip_and_exclusive_output(self):
        chunk = b"0123456789abcdef" * (S.CHUNK // 16)
        with self.data.open("wb") as stream:
            for _ in range(9):
                stream.write(chunk)
        self._write_manifest()
        result = S.seal(**self.args)
        self.assertEqual(result["status"], S.STATUS)
        self.assertEqual(set(result), {"status", "cipherSHA256", "cipherBytes", "fileCount",
                         "manifestSHA256", "recipientFingerprint", "exactCommit", "runId",
                         "runAttempt", "inputManifestSHA"})
        output = Path(self.args["output"])
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        with output.open("rb") as stream:
            self.assertEqual(hashlib.file_digest(stream, "sha256").hexdigest(), result["cipherSHA256"])
        process = subprocess.Popen([S.GPG, "--no-options", "--homedir", str(self.home),
                                    "--batch", "--no-tty", "--decrypt", str(output)],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   env=S._gpg_env())
        recovered = {}
        with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
            for member in archive:
                stream = archive.extractfile(member)
                digest = hashlib.sha256()
                count = 0
                while True:
                    block = stream.read(S.CHUNK)
                    if not block:
                        break
                    count += len(block)
                    digest.update(block)
                recovered[member.name] = (count, digest.hexdigest())
        while process.stdout.read(S.CHUNK):
            pass
        process.stdout.close()
        self.assertEqual(process.wait(timeout=15), 0)
        self.assertEqual(recovered["W15_MANIFEST.PRIVATE.json"],
                         (len(self.raw), hashlib.sha256(self.raw).hexdigest()))
        original = json.loads(self.raw)["files"][0]
        self.assertEqual(recovered["files/synthetic.bin"], (original["bytes"], original["sha256"]))
        before = result["cipherSHA256"]
        with self.assertRaises(FileExistsError):
            S.seal(**self.args)
        with output.open("rb") as stream:
            self.assertEqual(hashlib.file_digest(stream, "sha256").hexdigest(), before)

    def test_symlink_and_symlink_parent_rejected(self):
        self.data.unlink()
        self.data.symlink_to(self.public)
        with self.assertRaises((S.SealError, OSError)):
            S.seal(**self.args)
        self.assertFalse(Path(self.args["output"]).exists())
        self.data.unlink()
        self.data.write_bytes(b"synthetic-only\x00data\n")
        self.data.chmod(0o600)
        alias = self.base / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        self.args["root"] = str(alias)
        with self.assertRaises((S.SealError, OSError)):
            S.seal(**self.args)

    def test_traversal_rejected(self):
        self._write_manifest([{"path": "../outside", "bytes": 1, "sha256": "c" * 64}])
        with self.assertRaises(S.SealError):
            S.seal(**self.args)
        self.assertFalse(Path(self.args["output"]).exists())

    def test_wrong_independent_fingerprint_rejected(self):
        self.args["recipient_fingerprint"] = "C" * 40
        with self.assertRaises(S.SealError):
            S.seal(**self.args)
        self.assertFalse(Path(self.args["output"]).exists())
        self.fingerprint = "C" * 40
        self._write_manifest()
        with self.assertRaises(S.SealError):
            S.seal(**self.args)  # Matching false manifest still fails key fingerprint inspection.
        self.assertFalse(Path(self.args["output"]).exists())

    def test_stream_drift_retains_private_partial_cipher(self):
        original = S._StreamingReader.read
        changed = False

        def read_and_change(reader, size):
            nonlocal changed
            value = original(reader, size)
            if not changed and value:
                changed = True
                with self.data.open("r+b") as stream:
                    stream.write(b"X")
                    stream.flush()
                    os.fsync(stream.fileno())
            return value

        with patch.object(S._StreamingReader, "read", read_and_change):
            with self.assertRaises(S.SealError):
                S.seal(**self.args)
        output = Path(self.args["output"])
        self.assertTrue(output.exists())
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        with self.assertRaises((S.SealError, FileExistsError)):
            S.seal(**self.args)

    def test_hardlink_and_unsafe_mode_rejected(self):
        os.link(self.data, self.root / "second-name")
        with self.assertRaises(S.SealError):
            S.seal(**self.args)
        (self.root / "second-name").unlink()
        self.data.chmod(0o644)
        with self.assertRaises(S.SealError):
            S.seal(**self.args)


if __name__ == "__main__":
    unittest.main()
