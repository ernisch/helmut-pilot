"""Small fictional receive-layout checks; no original input or controller import."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("w15_input_port_test", Path(__file__).with_name("input_port.py"))
I = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(I)
SHA = lambda raw: hashlib.sha256(raw).hexdigest()


class InputPortChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="w15-fictional-input-port-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "received"
        self.root.mkdir(mode=0o700)
        for name in ("payloads", "provenance"):
            (self.root / name).mkdir(mode=0o700)
        self.repo = self.base / "repo"
        self.repo.mkdir(mode=0o700)
        (self.repo / ".git").mkdir(mode=0o700)
        self.commit = "a" * 40
        (self.repo / ".git/HEAD").write_text(self.commit + "\n")
        self.context = {"exactCommit": "b" * 40, "runId": "123456789",
                        "inputManifestSHA": "c" * 64, "recipientFingerprint": "D" * 40}
        self.data = {key: ("FICTIONAL-" + key).encode() for key in sorted(I.R.PAYLOADS)}
        self.pins = {key: self.pin(raw, key) for key, raw in self.data.items()}
        bound = {key: False for key in ("executionAuthority", "actualExecution", "costOrQualityAcceptance",
                                       "full500Acceptance", "originalInputModified")}
        bound.update(totalUsageRows=6000, preservedOriginalUsageRows=5139,
                     protectedOutputPins={key: self.pins[key] for key in I.R.FIXTURES})
        self.data["bound"] = self.encode(bound)
        self.pins["bound"] = self.pin(self.data["bound"], "bound")
        self.data["boundReview"] = self.encode({"status": "PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY",
                                                "inputReportPin": self.pins["bound"]})
        rows = [{"key": key, "expectedBytes": self.pins[key]["bytes"],
                 "expectedSHA256": self.pins[key]["sha256"], "receivedPath": self.pins[key]["path"]}
                for key in ("frozenSourceDump", "localRoles")]
        rows += [{"key": "unused-old-" + str(n)} for n in range(9)]
        self.data["reception"] = self.encode({"actualFileCount": 11, "actualPayloadBytes": 96530256,
                                              "allPathsSizesSHA256Match": True, "files": rows})
        for key in I.R.CONTROLS - {"bound"}:
            self.pins[key] = self.pin(self.data[key], key)
        self.total = sum(len(raw) for raw in self.data.values())
        self.request = {"payloads": {key: dict(self.pins[key]) for key in I.R.PAYLOADS},
                        "controls": {key: dict(self.pins[key]) for key in I.R.CONTROLS}}
        for key in ("frozenSourceDump", "localRoles"):
            self.request["payloads"][key]["path"] = None
        self.request_path = self.base / "request.json"
        self.write(self.request_path, self.encode(self.request))
        for key, raw in self.data.items():
            self.write(self.root / I._relative(key), raw)
        self.write(self.root / "payloads/manifest.json", self.encode({key: key + ".PRIVATE" for key in I.R.PAYLOADS}))
        sealed = {"version": 1, "runAttempt": 1, **self.context,
                  "files": [{"path": key + ".original", "bytes": len(raw), "sha256": SHA(raw)}
                            for key, raw in self.data.items()]}
        self.sealed_raw = self.encode(sealed)
        self.write(self.root / "W15_MANIFEST.PRIVATE.json", self.sealed_raw)
        self.receipt = {"status": I.R.STATUS, "readiness": "BLOCKED", "executionAuthority": False,
                        "testStarted": False, "verifiedFiles": 12, "verifiedBytes": self.total,
                        "runAttempt": 1, "sealedManifestSHA256": SHA(self.sealed_raw), **self.context}
        self.write(self.root / "RECEPTION.SAFE.json", self.encode(self.receipt))

    @staticmethod
    def encode(value):
        return json.dumps(value, sort_keys=True).encode()

    @staticmethod
    def pin(raw, key):
        return {"path": "/workspace/old-provenance/" + key, "bytes": len(raw), "sha256": SHA(raw)}

    @staticmethod
    def write(path, raw):
        path.write_bytes(raw)
        path.chmod(0o600)

    def invoke(self, **overrides):
        args = {"expected_transfer_context": self.context, "expected_sealed_manifest_sha256": SHA(self.sealed_raw),
                "checkout_commit": self.commit, "repo": self.repo, **overrides}
        with patch.object(I, "REQUEST", self.request_path), patch.object(I.R, "expected_pins", return_value=self.pins), \
                patch.object(I.R, "TOTAL", self.total):
            return I.verify_received(str(self.root), **args)

    def test_received_map_keeps_original_paths_and_separates_transfer_from_checkout_commit(self):
        with patch.object(subprocess, "Popen", side_effect=AssertionError("no process")), \
                patch.object(socket, "socket", side_effect=AssertionError("no network")):
            port = self.invoke()
        self.assertEqual(port.resolve(self.pins["auth"]), self.root / "payloads/auth.PRIVATE")
        self.assertEqual(port.original_pin("auth"), self.pins["auth"])
        summary = port.safe_summary()
        self.assertEqual(summary["checkoutCommit"], self.commit)
        self.assertEqual(summary["transferContext"]["exactCommit"], self.context["exactCommit"])
        self.assertEqual(summary["verifiedBytes"], self.total)
        self.assertFalse(summary["controllerStarted"])
        self.assertFalse(summary["executionAuthority"])
        self.assertEqual(summary["readiness"], "BLOCKED")
        self.assertFalse(summary["originalPathFieldsModified"])

    def test_independent_manifest_context_and_checkout_binding_reject_drift(self):
        mutations = ({"expected_sealed_manifest_sha256": "e" * 64}, {"checkout_commit": "e" * 40},
                     {"expected_transfer_context": {**self.context, "runId": "987654321"}},
                     {"expected_transfer_context": {**self.context, "executionAuthority": True}})
        for values in mutations:
            with self.subTest(values=values), self.assertRaises(I.InputPortError):
                self.invoke(**values)

    def test_receipt_cannot_grant_authority_or_change_run_attempt(self):
        for key, value in (("executionAuthority", True), ("testStarted", True), ("runAttempt", 2),
                           ("verifiedFiles", True), ("sealedManifestSHA256", "e" * 64)):
            with self.subTest(key=key):
                self.write(self.root / "RECEPTION.SAFE.json", self.encode({**self.receipt, key: value}))
                with self.assertRaises(I.InputPortError):
                    self.invoke()
        self.write(self.root / "RECEPTION.SAFE.json", self.encode(self.receipt))

    def test_resolver_refuses_unregistered_original_path_hash_size_or_boolean(self):
        port = self.invoke()
        for key, value in (("path", "/workspace/other/auth"), ("sha256", "e" * 64), ("bytes", 0), ("bytes", True)):
            with self.subTest(key=key, value=value), self.assertRaises(I.InputPortError):
                port.resolve({**self.pins["auth"], key: value})

    def test_resolve_rechecks_payload_drift_after_validation(self):
        port = self.invoke()
        self.write(self.root / "payloads/auth.PRIVATE", b"CHANGED")
        with self.assertRaises(I.InputPortError):
            port.resolve(self.pins["auth"])

    def test_symlink_hardlink_and_extra_file_are_rejected(self):
        actual = self.root / "payloads/auth.PRIVATE"
        saved = self.base / "saved-auth"
        actual.rename(saved)
        actual.symlink_to(saved)
        with self.assertRaises(I.InputPortError):
            self.invoke()
        actual.unlink()
        os.link(saved, actual)
        with self.assertRaises(I.InputPortError):
            self.invoke()
        actual.unlink()
        saved.rename(actual)
        self.write(self.root / "extra", b"unexpected")
        with self.assertRaises(I.InputPortError):
            self.invoke()

    def test_immutable_bound_historical_fixture_path_must_match_original_request(self):
        request = copy.deepcopy(self.request)
        request["payloads"]["auth"]["path"] = "/workspace/other-provenance/auth"
        self.write(self.request_path, self.encode(request))
        with self.assertRaises(I.InputPortError):
            self.invoke()

    def test_mapping_alias_and_missing_control_are_rejected(self):
        self.write(self.root / "payloads/manifest.json", self.encode({key: "auth.PRIVATE" for key in I.R.PAYLOADS}))
        with self.assertRaises(I.InputPortError):
            self.invoke()
        (self.root / "provenance/boundReview.PRIVATE").unlink()
        with self.assertRaises(I.InputPortError):
            self.invoke()

    def test_public_historical_reports_never_grant_fresh_authority(self):
        folder = self.repo / I._REPORT_ROOT
        folder.mkdir(parents=True)
        raw = self.encode({"status": "HISTORICAL_PASS"})
        path = folder / "fictional.json"
        self.write(path, raw)
        reports = (("/workspace/unreachable-old/fictional.json", "fictional.json", len(raw), SHA(raw)),)
        with patch.object(I, "PUBLIC_PROVENANCE", reports):
            result = I.public_provenance(self.repo)
            self.assertFalse(result["newRunAuthority"])
            self.assertFalse(result["sourceCompatibilityReaccepted"])
            self.assertFalse(result["reports"][0]["newRunAuthority"])
            self.assertEqual(result["readiness"], "BLOCKED")
            self.write(path, b"changed")
            with self.assertRaises(I.InputPortError):
                I.public_provenance(self.repo)


if __name__ == "__main__":
    unittest.main()
