"""Fictional pinned files only; no original data, inventory search or export."""
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

SPEC = importlib.util.spec_from_file_location("w15_source_inventory", Path(__file__).with_name("source_inventory.py"))
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)


class InventoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.private = self.root / "private"
        self.private.mkdir(mode=0o700)
        self.addCleanup(patch.stopall)
        patch.object(S, "SOURCE_ROOT", str(self.root)).start()
        payloads = {}
        for key in S.PAYLOAD_KEYS:
            payloads[key] = self.write(key, ("invented-" + key).encode())
        bound = {"executionAuthority": False, "actualExecution": False,
                 "costOrQualityAcceptance": False, "full500Acceptance": False,
                 "originalInputModified": False, "totalUsageRows": 6000,
                 "preservedOriginalUsageRows": 5139,
                 "protectedOutputPins": {key: copy.deepcopy(payloads[key]) for key in S.FIXTURES}}
        controls = {"bound": self.json_file("bound", bound)}
        controls["boundReview"] = self.json_file("review", {"status": S.REVIEW_STATUS, "inputReportPin": controls["bound"]})
        files = [{"key": key, "receivedPath": payloads[key]["path"],
                  "expectedBytes": payloads[key]["bytes"], "expectedSHA256": payloads[key]["sha256"]}
                 for key in S.RECEIPT_KEYS]
        files += [{"key": "unneeded" + str(i)} for i in range(9)]
        receipt = {"actualFileCount": 11, "actualPayloadBytes": 96530256,
                   "allPathsSizesSHA256Match": True, "files": files}
        controls["reception"] = self.json_file("reception", receipt)
        controls["reception"]["bytes"] = None
        for key in S.RECEIPT_KEYS:
            payloads[key]["path"] = None
        self.request = {"schema": "helmut-w15-source-export-request/1", "sourceRoot": str(self.root),
                        "executionAuthority": False, "transferAllowed": False, "testStarted": False,
                        "controls": controls, "payloads": payloads}

    def write(self, name, raw):
        path = self.private / name
        path.write_bytes(raw)
        path.chmod(0o600)
        return {"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

    def json_file(self, name, value):
        return self.write(name, json.dumps(value, sort_keys=True).encode())

    def replace_control(self, key, value):
        path = self.request["controls"][key]["path"]
        self.request["controls"][key] = self.json_file(Path(path).name, value)

    def test_complete_inventory_is_never_transfer_or_start(self):
        before = set(self.private.iterdir())
        with patch.object(subprocess, "Popen", side_effect=AssertionError("no process")), \
                patch.object(socket, "socket", side_effect=AssertionError("no network")), \
                patch.object(S.P, "tree_files", side_effect=AssertionError("no discovery")):
            result = S.inventory(self.request)
        self.assertEqual(result["verifiedPayloadFiles"], 9)
        self.assertEqual(result["verifiedControlFiles"], 3)
        self.assertEqual(result["verifiedPayloadBytes"], sum(p["bytes"] for p in self.request["payloads"].values()))
        self.assertFalse(result["transferAllowed"])
        self.assertFalse(result["testStarted"])
        self.assertNotIn(str(self.root), json.dumps(result))
        self.assertEqual(set(self.private.iterdir()), before)

    def test_missing_control_stops_before_payloads(self):
        Path(self.request["controls"]["bound"]["path"]).unlink()
        with patch.object(S.P, "inspect_file", wraps=S.P.inspect_file) as checked:
            with self.assertRaises(OSError):
                S.inventory(self.request)
        self.assertEqual(checked.call_count, 1)

    def test_control_hash_and_payload_pin_drift(self):
        self.request["controls"]["boundReview"]["sha256"] = "a" * 64
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)
        self.request["controls"]["boundReview"] = self.json_file("review", {"status": S.REVIEW_STATUS, "inputReportPin": self.request["controls"]["bound"]})
        self.write("seed", b"changed")
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)

    def test_bound_fixture_or_scope_drift(self):
        path = self.request["controls"]["bound"]["path"]
        value = json.loads(Path(path).read_text())
        value["protectedOutputPins"]["auth"]["sha256"] = "b" * 64
        self.replace_control("bound", value)
        self.replace_control("boundReview", {"status": S.REVIEW_STATUS, "inputReportPin": self.request["controls"]["bound"]})
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)
        value["actualExecution"] = True
        self.replace_control("bound", value)
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)

    def test_receipt_cannot_resolve_outside_root_or_traverse(self):
        for path in ("/etc/secret", str(self.private) + "/../outside"):
            value = json.loads(Path(self.request["controls"]["reception"]["path"]).read_text())
            value["files"][0]["receivedPath"] = path
            self.replace_control("reception", value)
            with self.assertRaises(S.P.Rejected):
                S.inventory(self.request)

    def test_symlink_hardlink_and_modes(self):
        path = self.private / "seed"
        original = path.read_bytes()
        path.unlink()
        path.symlink_to(self.private / "auth")
        with self.assertRaises(OSError):
            S.inventory(self.request)
        path.unlink()
        self.write("seed", original)
        os.link(path, self.private / "second-name")
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)
        (self.private / "second-name").unlink()
        path.chmod(0o644)
        with self.assertRaises(S.P.Rejected):
            S.inventory(self.request)

    def test_cli_has_only_closed_unavailable_result(self):
        request = self.root / "public-request.json"
        request.write_text(json.dumps(self.request))
        Path(self.request["controls"]["bound"]["path"]).unlink()
        out = io.StringIO()
        with patch.object(S, "REQUEST", request), contextlib.redirect_stdout(out):
            self.assertEqual(S.main(["--inventory-only"]), 1)
        self.assertEqual(json.loads(out.getvalue())["status"], "SOURCE_UNAVAILABLE")
        self.assertNotIn(str(self.root), out.getvalue())
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(S.main(["--export", "private-location"]), 1)
        self.assertNotIn("private-location", out.getvalue())


if __name__ == "__main__":
    unittest.main()
