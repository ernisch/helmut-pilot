#!/usr/bin/env python3
"""Inventory only: read the explicitly requested source files; never export.

Only --inventory-only is accepted. The public request is the adjacent
source-export-request.json. The source root is fixed; no search or discovery.
Private source paths and exception text never appear in the result.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("w15_inventory_prepare", Path(__file__).with_name("prepare.py"))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)
SOURCE_ROOT = "/workspace"
REQUEST = Path(__file__).with_name("source-export-request.json")
FIXTURES = {"auth", "evidenceRows", "privateDraftStoreRows", "resultRows", "privateDraftReviewRows"}
RECEIPT_KEYS = {"frozenSourceDump", "localRoles"}
PAYLOAD_KEYS = FIXTURES | RECEIPT_KEYS | {"seed", "currentCommand"}
CONTROL_KEYS = {"bound", "boundReview", "reception"}
MAX_CONTROL = 128 * 1024
REVIEW_STATUS = "PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY"


def _source_root():
    # /workspace is a shared ancestor, not itself a private data directory.
    # inspect_file enforces private0700 on every component below this root.
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for name in P.parts(SOURCE_ROOT[1:]):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _relative(path):
    P.require(isinstance(path, str) and path.startswith(SOURCE_ROOT + "/"), "SOURCE_UNAVAILABLE")
    relative = P.relative(path, SOURCE_ROOT)
    P.require(len(P.parts(relative)) >= 2, "SOURCE_UNAVAILABLE")
    return relative


def _pin(pin, nullable_bytes=False, nullable_path=False):
    P.require(isinstance(pin, dict) and {"path", "bytes", "sha256"} <= set(pin), "SOURCE_UNAVAILABLE")
    P.require((nullable_bytes and pin["bytes"] is None)
              or (type(pin["bytes"]) is int and pin["bytes"] >= 0), "SOURCE_UNAVAILABLE")
    P.require(isinstance(pin["sha256"], str) and P.SHA.fullmatch(pin["sha256"]), "SOURCE_UNAVAILABLE")
    if not (nullable_path and pin["path"] is None):
        _relative(pin["path"])


def _control(fd, pin):
    expected = pin if pin["bytes"] is not None else None
    raw = P.inspect_file(fd, _relative(pin["path"]), expected, retain_limit=MAX_CONTROL)
    P.require(hashlib.sha256(raw).hexdigest() == pin["sha256"], "SOURCE_UNAVAILABLE")
    return P.decode(raw), len(raw)


def inventory(request):
    P.require(isinstance(request, dict) and request.get("schema") == "helmut-w15-source-export-request/1"
              and request.get("sourceRoot") == SOURCE_ROOT, "SOURCE_UNAVAILABLE")
    P.require(all(request.get(key) is False for key in ("executionAuthority", "transferAllowed", "testStarted")), "SOURCE_UNAVAILABLE")
    controls, payloads = request.get("controls"), request.get("payloads")
    P.require(isinstance(controls, dict) and set(controls) == CONTROL_KEYS
              and isinstance(payloads, dict) and set(payloads) == PAYLOAD_KEYS, "SOURCE_UNAVAILABLE")
    for key, pin in controls.items():
        _pin(pin, nullable_bytes=key == "reception")
    for key, pin in payloads.items():
        _pin(pin, nullable_path=key in RECEIPT_KEYS)
    P.require(all(payloads[key]["path"] is None for key in RECEIPT_KEYS), "SOURCE_UNAVAILABLE")
    fd = _source_root()
    try:
        # All three pinned small controls must pass before any payload is read.
        loaded, sizes = {}, {}
        for key in ("bound", "boundReview", "reception"):
            loaded[key], sizes[key] = _control(fd, controls[key])
        bound, review, receipt = (loaded[key] for key in ("bound", "boundReview", "reception"))
        P.require(isinstance(bound, dict) and all(bound.get(key) is False for key in (
            "executionAuthority", "actualExecution", "costOrQualityAcceptance", "full500Acceptance", "originalInputModified")), "SOURCE_UNAVAILABLE")
        P.require(bound.get("totalUsageRows") == 6000 and bound.get("preservedOriginalUsageRows") == 5139,
                  "SOURCE_UNAVAILABLE")
        fixture_pins = bound.get("protectedOutputPins")
        P.require(isinstance(fixture_pins, dict) and set(fixture_pins) == FIXTURES, "SOURCE_UNAVAILABLE")
        for key in FIXTURES:
            _pin(fixture_pins[key])
            P.require(all(fixture_pins[key][field] == payloads[key][field]
                          for field in ("path", "bytes", "sha256")), "SOURCE_UNAVAILABLE")
        P.require(isinstance(review, dict) and review.get("status") == REVIEW_STATUS, "SOURCE_UNAVAILABLE")
        reviewed = review.get("inputReportPin")
        P.require(isinstance(reviewed, dict) and all(reviewed.get(field) == controls["bound"][field]
                  for field in ("path", "bytes", "sha256")), "SOURCE_UNAVAILABLE")
        P.require(isinstance(receipt, dict) and receipt.get("actualFileCount") == 11
                  and receipt.get("actualPayloadBytes") == 96530256
                  and receipt.get("allPathsSizesSHA256Match") is True, "SOURCE_UNAVAILABLE")
        received = receipt.get("files")
        P.require(isinstance(received, list) and len(received) == 11
                  and all(isinstance(row, dict) and isinstance(row.get("key"), str) for row in received), "SOURCE_UNAVAILABLE")
        P.require(len({row["key"] for row in received}) == 11, "SOURCE_UNAVAILABLE")
        paths = {key: pin["path"] for key, pin in payloads.items()}
        for key in RECEIPT_KEYS:
            matches = [row for row in received if row["key"] == key]
            P.require(len(matches) == 1, "SOURCE_UNAVAILABLE")
            row = matches[0]
            P.require(row.get("expectedBytes") == payloads[key]["bytes"]
                      and row.get("expectedSHA256") == payloads[key]["sha256"], "SOURCE_UNAVAILABLE")
            paths[key] = row.get("receivedPath")
            _relative(paths[key])
        P.require(len(set(paths.values()) | {pin["path"] for pin in controls.values()}) == 12,
                  "SOURCE_UNAVAILABLE")
        for key in sorted(PAYLOAD_KEYS):
            P.inspect_file(fd, _relative(paths[key]), payloads[key])
        # Reject control drift observed after the payload streams, without replay.
        for key in ("bound", "boundReview", "reception"):
            _control(fd, controls[key])
    finally:
        os.close(fd)
    payload_bytes = sum(pin["bytes"] for pin in payloads.values())
    return {"status": "PASS_SOURCE_INVENTORY_ONLY_START_BLOCKED", "readiness": "BLOCKED",
            "filesFreshlyVerified": True, "verifiedPayloadFiles": 9, "verifiedControlFiles": 3,
            "verifiedPayloadBytes": payload_bytes, "verifiedControlBytes": sum(sizes.values()),
            "verifiedTotalBytes": payload_bytes + sum(sizes.values()),
            "payloads": {key: {field: payloads[key][field] for field in ("bytes", "sha256")}
                         for key in sorted(PAYLOAD_KEYS)},
            "executionAuthority": False, "transferAllowed": False, "testStarted": False,
            "units": 0, "providerCalls": 0, "backupComplete": False}


def main(argv=None):
    try:
        parser = P.Parser(description=__doc__)
        parser.add_argument("--inventory-only", action="store_true", required=True)
        parser.parse_args(argv)
        P.require(REQUEST.stat().st_size <= MAX_CONTROL, "SOURCE_UNAVAILABLE")
        result = inventory(P.decode(REQUEST.read_bytes()))
    except (Exception, KeyboardInterrupt):
        print(json.dumps({"status": "SOURCE_UNAVAILABLE", "readiness": "BLOCKED",
                          "filesFreshlyVerified": False, "executionAuthority": False,
                          "transferAllowed": False, "testStarted": False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
