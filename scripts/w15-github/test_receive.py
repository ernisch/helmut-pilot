"""Fictional local tar/fake-GPG checks. Never load keys or original W15 data."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("w15_receive_test", Path(__file__).with_name("receive.py"))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
SHA = lambda raw: hashlib.sha256(raw).hexdigest()


class FakeGPG:
    def __init__(self, raw, code=0):
        self.stdout, self.code = io.BytesIO(raw), code

    def wait(self, timeout=None):
        return self.code

    def poll(self):
        return self.code

    def kill(self):
        self.code = -9


class ReceptionChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="w15-fictional-receive-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.home = self.base / "home"
        self.home.mkdir(mode=0o700)
        self.passphrase = self.base / "passphrase"
        self.private_write(self.passphrase, b"FICTIONAL-PASSPHRASE\n")
        self.cipher = self.base / "cipher.gpg"
        self.private_write(self.cipher, b"FICTIONAL-CIPHER-NOT-OPENPGP")
        self.context = {"exactCommit": "a" * 40, "runId": "123456789",
                        "inputManifestSHA": "b" * 64, "recipientFingerprint": "C" * 40}
        self.data = {k: ("FICTIONAL-" + k).encode() for k in sorted(R.PAYLOADS)}
        self.pins = {k: self.pin(v) for k, v in self.data.items()}
        bound = {k: False for k in ("executionAuthority", "actualExecution", "costOrQualityAcceptance",
                                   "full500Acceptance", "originalInputModified")}
        bound.update(totalUsageRows=6000, preservedOriginalUsageRows=5139,
                     protectedOutputPins={k: self.pins[k] for k in R.FIXTURES})
        self.data["bound"] = json.dumps(bound).encode()
        self.pins["bound"] = {**self.pin(self.data["bound"]), "path": "/historical/bound"}
        self.data["boundReview"] = json.dumps({"status": "PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY",
                                              "inputReportPin": self.pins["bound"]}).encode()
        rows = [{"key": k, "expectedBytes": self.pins[k]["bytes"],
                 "expectedSHA256": self.pins[k]["sha256"]} for k in ("frozenSourceDump", "localRoles")]
        rows += [{"key": "old" + str(i)} for i in range(9)]
        self.data["reception"] = json.dumps({"actualFileCount": 11, "actualPayloadBytes": 96530256,
                         "allPathsSizesSHA256Match": True, "files": rows}).encode()
        self.pins.update({k: self.pin(v) for k, v in self.data.items() if k != "bound"})
        self.entries = [{"path": "selected/" + k, **self.pin(v)} for k, v in self.data.items()]
        self.manifest = {"version": 1, "runAttempt": 1, **self.context, "files": self.entries}
        self.args = {"cipher_sha256": SHA(self.cipher.read_bytes()), "cipher_bytes": self.cipher.stat().st_size,
                     "destination": str(self.base / "received"), "private_home": str(self.home),
                     "passphrase_file": str(self.passphrase), "exact_commit": self.context["exactCommit"],
                     "run_id": self.context["runId"], "input_manifest_sha256": self.context["inputManifestSHA"],
                     "recipient_fingerprint": self.context["recipientFingerprint"]}
        self.total = sum(len(v) for v in self.data.values())

    @staticmethod
    def pin(raw):
        return {"bytes": len(raw), "sha256": SHA(raw)}

    @staticmethod
    def private_write(path, raw):
        path.write_bytes(raw)
        path.chmod(0o600)

    def archive(self, mutate=None, manifest=None):
        items = [("W15_MANIFEST.PRIVATE.json", json.dumps(manifest or self.manifest).encode(), None)]
        items += [("files/" + e["path"], self.data[k], None) for k, e in zip(self.data, self.entries)]
        if mutate:
            mutate(items)
        out = io.BytesIO()
        with tarfile.open(fileobj=out, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for name, raw, kind in items:
                info = R.S._member(name, len(raw))
                if kind:
                    info.type, info.linkname, info.size = kind, "../outside", 0
                archive.addfile(info, io.BytesIO(raw))
        return out.getvalue()

    def invoke(self, raw=None, code=0, fingerprint=None):
        listed = ("pub:-:::::::::\nfpr:::::::::" + (fingerprint or self.context["recipientFingerprint"]) + ":\n").encode()
        with patch.object(R, "TOTAL", self.total), patch.object(R, "expected_pins", return_value=self.pins), \
                patch.object(R.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, listed)) as meta, \
                patch.object(R.subprocess, "Popen", return_value=FakeGPG(raw if raw is not None else self.archive(), code)) as opened:
            result = R.receive(str(self.cipher), **self.args)
            self.assertEqual(meta.call_count, 2)  # Public fingerprint read, then owned-agent cleanup.
            command, options = opened.call_args.args[0], opened.call_args.kwargs
            self.assertNotIn("FICTIONAL-PASSPHRASE", " ".join(command))
            self.assertNotIn("--passphrase", command)
            self.assertIn("--passphrase-fd", command)
            self.assertNotIn("--no-autostart", command)
            self.assertNotIn("/proc/self/fd/", " ".join(command))
            self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"})
            self.assertEqual(options["stderr"], subprocess.DEVNULL)
            self.assertIsInstance(options["stdin"], int)
            return result

    def test_valid_closed_set_and_prepare_layout_no_plaintext_archive(self):
        result = self.invoke()
        self.assertEqual(result["status"], R.STATUS)
        self.assertEqual(result["verifiedBytes"], self.total)
        self.assertFalse(result["executionAuthority"])
        root = Path(self.args["destination"])
        self.assertEqual({p.name for p in root.iterdir()}, {"payloads", "provenance", "W15_MANIFEST.PRIVATE.json", "RECEPTION.SAFE.json"})
        mapping = json.loads((root / "payloads/manifest.json").read_bytes())
        self.assertEqual(set(mapping), R.PAYLOADS)
        self.assertEqual(len(list((root / "payloads").iterdir())), 11)
        self.assertEqual(len(list((root / "provenance").iterdir())), 2)
        for key, relative in mapping.items():
            self.assertEqual((root / "payloads" / relative).read_bytes(), self.data[key])
        for path in root.rglob("*"):
            self.assertEqual(path.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)

    def test_cipher_checksum_rejected_before_any_gpg(self):
        self.args["cipher_sha256"] = "0" * 64
        with patch.object(R, "expected_pins", return_value=self.pins), \
                patch.object(R.subprocess, "run") as meta, patch.object(R.subprocess, "Popen") as opened:
            with self.assertRaisesRegex(R.ReceiveError, "CIPHER_MISMATCH"):
                R.receive(str(self.cipher), **self.args)
            meta.assert_not_called()
            opened.assert_not_called()

    def test_failed_agent_close_cannot_write_pass_receipt(self):
        listed = ("pub:-:::::::::\nfpr:::::::::" + self.context["recipientFingerprint"] + ":\n").encode()
        results = [subprocess.CompletedProcess([], 0, listed), subprocess.CompletedProcess([], 1, b"")]
        with patch.object(R, "TOTAL", self.total), patch.object(R, "expected_pins", return_value=self.pins), \
                patch.object(R.subprocess, "run", side_effect=results) as metadata, \
                patch.object(R.subprocess, "Popen", return_value=FakeGPG(self.archive())):
            with self.assertRaisesRegex(R.ReceiveError, "AGENT_CLOSE_FAILED"):
                R.receive(str(self.cipher), **self.args)
        self.assertEqual(metadata.call_count, 2)
        self.assertFalse((Path(self.args["destination"]) / "RECEPTION.SAFE.json").exists())

    def test_contiguous_regular_tar_type_is_rejected(self):
        original = self.archive()
        with tarfile.open(fileobj=io.BytesIO(original), mode="r:") as parsed:
            offsets = [member.offset for member in parsed.getmembers()[:2]]
        for offset in offsets:
            modified = bytearray(original)
            header = modified[offset:offset + 512]
            header[156] = ord("7")
            header[148:156] = b" " * 8
            header[148:156] = ("%06o\x00 " % sum(header)).encode("ascii")
            modified[offset:offset + 512] = header
            with self.subTest(offset=offset), self.assertRaises(R.ReceiveError):
                self.invoke(bytes(modified))
            target = Path(self.args["destination"])
            if target.exists():
                target.rename(self.base / ("partial-contiguous-" + str(offset)))

    def test_context_mismatch(self):
        for key in self.context:
            value = copy.deepcopy(self.manifest)
            value[key] = "WRONG"
            with self.subTest(key=key), self.assertRaises(R.ReceiveError):
                self.invoke(self.archive(manifest=value))
            Path(self.args["destination"]).rename(self.base / ("partial-" + key))

    def test_wrong_recipient_metadata(self):
        with self.assertRaisesRegex(R.ReceiveError, "RECIPIENT_MISMATCH"):
            self.invoke(fingerprint="D" * 40)
        self.assertFalse(Path(self.args["destination"]).exists())

    def test_private_inputs_reject_modes_symlinks_and_hardlinks(self):
        self.passphrase.chmod(0o644)
        with self.assertRaises(R.S.SealError):
            self.invoke()
        self.passphrase.chmod(0o600)
        os.link(self.passphrase, self.base / "passphrase-alias")
        with self.assertRaises(R.S.SealError):
            self.invoke()
        (self.base / "passphrase-alias").unlink()
        alias = self.base / "home-alias"
        alias.symlink_to(self.home, target_is_directory=True)
        self.args["private_home"] = str(alias)
        with self.assertRaises(OSError):
            self.invoke()
        self.assertFalse(Path(self.args["destination"]).exists())

    def test_duplicate_missing_or_replayed_manifest(self):
        values = [copy.deepcopy(self.manifest) for _ in range(3)]
        values[0]["files"][1] = values[0]["files"][0]
        values[1]["files"].pop()
        values[2]["runAttempt"] = 2
        for index, value in enumerate(values):
            with self.subTest(index=index), self.assertRaises(R.ReceiveError):
                self.invoke(self.archive(manifest=value))
            Path(self.args["destination"]).rename(self.base / ("partial-manifest-" + str(index)))

    def test_manifest_paths_and_pin_drift(self):
        for name in ("../outside", "/absolute", "a\\b", "a//b", "a/./b"):
            value = copy.deepcopy(self.manifest)
            value["files"][0]["path"] = name
            with self.subTest(name=name), self.assertRaises((R.ReceiveError, R.S.SealError)):
                self.invoke(self.archive(manifest=value))
            Path(self.args["destination"]).rename(self.base / ("partial-path-" + str(len(list(self.base.iterdir())))))
        value = copy.deepcopy(self.manifest)
        value["files"][0]["sha256"] = "e" * 64
        with self.assertRaises(R.ReceiveError):
            self.invoke(self.archive(manifest=value))

    def test_symlinks_hardlinks_extra_missing_and_hash_drift(self):
        variants = [lambda xs: xs.__setitem__(1, (xs[1][0], b"", tarfile.SYMTYPE)),
                    lambda xs: xs.__setitem__(1, (xs[1][0], b"", tarfile.LNKTYPE)),
                    lambda xs: xs.append(("files/extra", b"extra", None)), lambda xs: xs.pop(),
                    lambda xs: xs.__setitem__(1, (xs[1][0], b"X" * len(xs[1][1]), None))]
        for index, mutate in enumerate(variants):
            with self.subTest(index=index), self.assertRaises(R.ReceiveError):
                self.invoke(self.archive(mutate))
            root = Path(self.args["destination"])
            self.assertFalse((root / "RECEPTION.SAFE.json").exists())
            root.rename(self.base / ("partial-invalid-" + str(index)))

    def test_gpg_integrity_failure_retains_private_partials(self):
        with self.assertRaisesRegex(R.ReceiveError, "GPG_INTEGRITY_FAILED"):
            self.invoke(code=2)
        root = Path(self.args["destination"])
        self.assertTrue((root / "payloads/auth.PRIVATE").exists())
        self.assertFalse((root / "RECEPTION.SAFE.json").exists())
        with self.assertRaises(FileExistsError):
            self.invoke()

    def test_bad_tar_eof_and_nonzero_trailing_data(self):
        raw = self.archive()
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as archive:
            last = archive.getmembers()[-1]
            end = last.offset_data + ((last.size + 511) // 512) * 512
        for index, broken in enumerate((raw[:end], raw + b"UNEXPECTED-TRAILER")):
            with self.subTest(index=index), self.assertRaises(R.ReceiveError):
                self.invoke(broken)
            Path(self.args["destination"]).rename(self.base / ("partial-eof-" + str(index)))

    def test_pax_surprise_and_plaintext_cap(self):
        raw = self.archive(lambda xs: xs.__setitem__(1, ("files/" + "x" * 150, xs[1][1], None)))
        with self.assertRaises(R.ReceiveError):
            self.invoke(raw)
        with self.assertRaisesRegex(R.ReceiveError, "PLAINTEXT_LIMIT"), patch.object(R, "TOTAL", 0):
            reader = R.LimitedPipe(io.BytesIO(b"x" * (R.MAX_MANIFEST + R.MAX_OVERHEAD + 1)))
            reader.read(R.S.CHUNK)


if __name__ == "__main__":
    unittest.main()
