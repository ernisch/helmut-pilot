"""Read-only W15 receive-to-controller path binding; never a launch adapter.

Historical paths remain immutable provenance. A relocation resolves only an
exact already verified original path/size/hash triple to its selected received
file. This does not replace any controller or auditor function, materialize old
paths, or turn historical reviews into authority for a new run.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
from types import MappingProxyType


def _import(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


P = _import("w15_input_port_prepare", "prepare.py")
R = _import("w15_input_port_receive", "receive.py")
REPO = Path(__file__).absolute().parents[2]
REQUEST = Path(__file__).with_name("source-export-request.json")
CONTEXT_KEYS = {"exactCommit", "runId", "inputManifestSHA", "recipientFingerprint"}
STATUS = "PASS_RECEIVED_INPUT_RELOCATION_ONLY_START_BLOCKED"

# These are historical public evidence bytes, not fresh run or resource reviews.
_REPORT_ROOT = "docs/betrieb/belege/w15-atomic-usage-integration-20261028/"
_HISTORICAL_REPORTS = "/workspace/shared/helmut-w15-atomic-integration-source-20261028/"
PUBLIC_PROVENANCE = (
    (_HISTORICAL_REPORTS + "DISK_PLAN_D_GZIP_INDEPENDENT.SAFE.json", "DISK_PLAN_D_GZIP_INDEPENDENT.SAFE.json", 5471, "a62c58e1c0c451666cb845edfb36963531f96496ff62e024d034a509033d6b78"),
    (_HISTORICAL_REPORTS + "JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json", "JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json", 12102, "25157d93434b749c8dbd38fa9dc5e5336b62f7be328f414ea5449c715525b3ac"),
    ("/workspace/shared/helmut-w15-memory-forward-20261028/sql-preflight-atomic-e/SQL_PREFLIGHT.SAFE.json", "SQL_PREFLIGHT_D.SAFE.json", 442705, "3003fac4718db331fa288783bbf53212ebf248d201cd2e6a0571ac433a870293"),
    (_HISTORICAL_REPORTS + "MEMORY_PRESTART_REVIEW_D.SAFE.json", "MEMORY_PRESTART_REVIEW_D.SAFE.json", 17395, "03352a0c51134df2fc68096f17c81ce5e98415660793df30dce5235bd5424e72"),
    ("/workspace/shared/helmut-w15-postgrest-stop-check-20261028/RESULT.SAFE.json", "POSTGREST_STOP_RESULT.SAFE.json", 4023, "9d96d1873f33a7cbfa4b8e1cfdf64ce77e79c9d6425e04183c4f95362798267f"),
    (_HISTORICAL_REPORTS + "POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json", "POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json", 5643, "5d8e01a755465fb7570c5ffc5d9b57c537702aa32de2cef610d0210ff3bb6a61"),
    (_HISTORICAL_REPORTS + "OBSERVATION_RESULTS_REVIEW.SAFE.json", "OBSERVATION_RESULTS_REVIEW.SAFE.json", 5328, "f7f335be3ca17e683f81c0efdefe731ffc1f78c90cfb08429083db385ec6c2ba"),
    (_HISTORICAL_REPORTS + "RAM_B_GROWTH_LATE_WINDOWS.SAFE.json", "RAM_B_GROWTH_LATE_WINDOWS.SAFE.json", 21418, "c812728a95fddd76b507a1501da82797e6f8939b2b1d06cd5e99d1f9873aef22"),
    ("/workspace/shared/helmut-w15-atomic-integration-20261028d/INTEGRATION_RESULT.SAFE.json", "INTEGRATION_RESULT.SAFE.json", 832, "089b989a76d0382f150da0d98df65232d84d8ddabb22c82337ef7fa264040685"),
)


class InputPortError(Exception):
    """Only closed public error codes; never include private path/content."""


def require(value):
    if not value:
        raise InputPortError("INPUT_RELOCATION_REJECTED")


def _original_path(value):
    require(isinstance(value, str) and value.startswith("/workspace/"))
    P.parts(value[1:])
    return value


def _relative(key):
    if key == "bound":
        return "payloads/bound.json"
    return ("payloads/" if key in R.PAYLOADS else "provenance/") + key + ".PRIVATE"


def _context(value):
    require(isinstance(value, dict) and set(value) == CONTEXT_KEYS)
    patterns = {"exactCommit": r"[a-f0-9]{40}", "runId": r"[0-9]{5,20}",
                "inputManifestSHA": r"[a-f0-9]{64}",
                "recipientFingerprint": r"(?:[A-F0-9]{40}|[A-F0-9]{64})"}
    require(all(isinstance(value[k], str) and re.fullmatch(pattern, value[k])
                for k, pattern in patterns.items()))
    return dict(value)


class RelocatedInputs:
    """Opaque validated map. Resolving rechecks bytes; nothing is rewritten."""

    def __init__(self, root, records, context, checkout_commit, verified_bytes):
        self._root = root
        self._records = MappingProxyType({key: MappingProxyType(dict(row)) for key, row in records.items()})
        self._context = MappingProxyType(dict(context))
        self._checkout_commit = checkout_commit
        self._verified_bytes = verified_bytes

    def resolve(self, original_pin):
        """Return the selected actual file for this exact historical pin only."""
        try:
            require(isinstance(original_pin, dict))
            matches = [row for row in self._records.values()
                       if all(original_pin.get(k) == row[k] for k in ("path", "bytes", "sha256"))]
            require(len(matches) == 1 and type(original_pin.get("bytes")) is int)
            row = matches[0]
            fd = P.open_root(self._root)
            try:
                P.inspect_file(fd, row["receivedRelativePath"], row)
            finally:
                os.close(fd)
            return Path(self._root) / row["receivedRelativePath"]
        except (Exception, KeyboardInterrupt):
            raise InputPortError("INPUT_RELOCATION_REJECTED") from None

    def original_pin(self, key):
        """A copy of the original triple, retaining its historical path."""
        try:
            row = self._records[key]
            return {k: row[k] for k in ("path", "bytes", "sha256")}
        except (KeyError, TypeError):
            raise InputPortError("INPUT_RELOCATION_REJECTED") from None

    def safe_summary(self):
        return {"status": STATUS, "verifiedFiles": 12, "verifiedBytes": self._verified_bytes,
                "checkoutCommit": self._checkout_commit, "transferContext": dict(self._context),
                "originalPathFieldsModified": False, "controllerImported": False,
                "controllerStarted": False, "executionAuthority": False, "readiness": "BLOCKED",
                "remainingGates": ["originalControllerInputResolution", "freshSourceQualification",
                    "runtimeResourcesAndCompleteBackup", "freshIndependentReview", "separateEnd500GO"]}


def verify_received(root, *, expected_transfer_context, expected_sealed_manifest_sha256,
                    checkout_commit, repo=REPO):
    """Validate all received bytes plus provenance, without following old paths.

The caller supplies the independently pinned sealed-manifest hash/context.
checkout_commit names the current consumer checkout; it is deliberately separate
from the old source-tool commit sealed into the transfer manifest.
"""
    fd = None
    try:
        repo = Path(repo)
        require(isinstance(checkout_commit, str) and P.HEX.fullmatch(checkout_commit)
                and P.git_head(repo) == checkout_commit)
        expected = _context(expected_transfer_context)
        require(isinstance(expected_sealed_manifest_sha256, str)
                and P.SHA.fullmatch(expected_sealed_manifest_sha256))
        root = str(root)
        fd = P.open_root(root)
        expected_files = {_relative(k) for k in R.PAYLOADS | R.CONTROLS} | {
            "payloads/manifest.json", "W15_MANIFEST.PRIVATE.json", "RECEPTION.SAFE.json"}
        require(P.tree_files(fd) == (expected_files, {"payloads", "provenance"}))
        pins = R.expected_pins()
        require(REQUEST.stat().st_size <= 65536)
        request = P.decode(REQUEST.read_bytes())
        require(set(request["payloads"]) == R.PAYLOADS and set(request["controls"]) == R.CONTROLS)
        request_pins = {**request["payloads"], **request["controls"]}
        require(set(request_pins) == set(pins))
        for key, pin in pins.items():
            require(request_pins[key]["sha256"] == pin["sha256"]
                    and (request_pins[key]["bytes"] == pin["bytes"]
                         or key == "reception" and request_pins[key]["bytes"] is None))
        controls = {}
        for key in sorted(pins):
            raw = P.inspect_file(fd, _relative(key), pins[key],
                                 retain_limit=128 * 1024 if key in R.CONTROLS else 0)
            if key in R.CONTROLS:
                controls[key] = raw
        R.verify_controls(controls, pins)
        mapping = P.decode(P.inspect_file(fd, "payloads/manifest.json", retain_limit=16384))
        require(mapping == {key: key + ".PRIVATE" for key in R.PAYLOADS})
        sealed_raw = P.inspect_file(fd, "W15_MANIFEST.PRIVATE.json", retain_limit=65536)
        require(hashlib.sha256(sealed_raw).hexdigest() == expected_sealed_manifest_sha256)
        R.manifest(sealed_raw, expected, pins)
        receipt = P.decode(P.inspect_file(fd, "RECEPTION.SAFE.json", retain_limit=16384))
        require(receipt["status"] == R.STATUS and receipt["readiness"] == "BLOCKED"
                and receipt["executionAuthority"] is False and receipt["testStarted"] is False
                and type(receipt["verifiedFiles"]) is int and receipt["verifiedFiles"] == 12
                and type(receipt["verifiedBytes"]) is int and receipt["verifiedBytes"] == R.TOTAL
                and type(receipt["runAttempt"]) is int and receipt["runAttempt"] == 1
                and receipt["sealedManifestSHA256"] == expected_sealed_manifest_sha256
                and all(receipt[k] == v for k, v in expected.items()))
        bound, reception = P.decode(controls["bound"]), P.decode(controls["reception"])
        historical = {key: pin["path"] for key, pin in request_pins.items()}
        for key in R.FIXTURES:
            require(bound["protectedOutputPins"][key]["path"] == historical[key])
        for key in ("frozenSourceDump", "localRoles"):
            require(historical[key] is None)
            rows = [row for row in reception["files"] if row["key"] == key]
            require(len(rows) == 1)
            historical[key] = rows[0]["receivedPath"]
        require(len({_original_path(value) for value in historical.values()}) == 12)
        records = {key: {"path": historical[key], "bytes": pin["bytes"], "sha256": pin["sha256"],
                         "receivedRelativePath": _relative(key)} for key, pin in pins.items()}
        require(P.tree_files(fd) == (expected_files, {"payloads", "provenance"})
                and P.git_head(repo) == checkout_commit)
        return RelocatedInputs(root, records, expected, checkout_commit, R.TOTAL)
    except (Exception, KeyboardInterrupt):
        raise InputPortError("RECEIVED_INPUT_BINDING_REJECTED") from None
    finally:
        if fd is not None:
            os.close(fd)


def public_provenance(repo=REPO):
    """Observe nine existing public reports. No historical path is followed."""
    try:
        repo = Path(repo)
        rows = []
        for historical, filename, size, digest in PUBLIC_PROVENANCE:
            path = _REPORT_ROOT + filename
            P.parts(path)
            current = repo / path
            require(current.is_file() and not current.is_symlink())
            raw = current.read_bytes()
            require(len(raw) == size and hashlib.sha256(raw).hexdigest() == digest)
            report = P.decode(raw)
            rows.append({"historicalPath": historical, "repositoryPath": path,
                         "bytes": size, "sha256": digest, "historicalStatus": report.get("status"),
                         "newRunAuthority": False})
        return {"status": "PASS_HISTORICAL_PUBLIC_PROVENANCE_BYTES_ONLY", "reports": rows,
                "newRunAuthority": False, "sourceCompatibilityReaccepted": False,
                "executionAuthority": False, "readiness": "BLOCKED"}
    except (Exception, KeyboardInterrupt):
        raise InputPortError("PUBLIC_PROVENANCE_REJECTED") from None
