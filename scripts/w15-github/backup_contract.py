"""Closed End500 backup selection and export plan; no CLI or side effects.

This module never exports a database, seals files, uploads data or grants start
authority. ``observed`` must come from an independent complete frozen-tree
inventory. Agreement with a caller-supplied inventory is not proof that a live
run's files were all collected, that a database snapshot is consistent, or that
remote ciphertext was read back. All results explicitly preserve those gates.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import json
from pathlib import Path
import re
import uuid

SHA = re.compile(r"[a-f0-9]{64}\Z")
COMMIT = re.compile(r"[a-f0-9]{40}\Z")
FINGERPRINT = re.compile(r"(?:[A-F0-9]{40}|[A-F0-9]{64})\Z")
REQUEST = Path(__file__).with_name("source-export-request.json")
TOTAL_INPUT_BYTES = 242570240
DATABASE = "helmut_w15_memory_atomic_20261028d"
BASE = "/tmp/w15-memory-atomic-20261028d"
REQUIRED = {
    "controllerResult": "work/CONTROLLER_RESULT.SAFE.json",
    "runtimeResult": "work/FORWARD_RESULT.SAFE.json",
    "serviceClosure": "work/SERVICE_CLOSURE.SAFE.json",
    "zeroBeforeAudit": "work/NATIVE_ZERO.SAFE.json",
    "zeroAfterAudit": "work/NATIVE_ZERO_AFTER_AUDIT.SAFE.json",
    "nativeAudit": "work/FINAL_NATIVE_AUDIT.PRIVATE.jsonl.gz",
    "nativeAuditSummary": "work/FINAL_NATIVE_AUDIT.SAFE.json",
    "nativeAuditAttempt": "work/FINAL_NATIVE_AUDIT_ATTEMPT.SAFE.json",
    "nativeAuditStderr": "work/FINAL_NATIVE_AUDIT_STDERR.PRIVATE.log",
    "outerProgress": "work/outer-progress.SAFE.jsonl",
    "preparedManifest": "prepare/PREPARED.SAFE.json",
    "finalDump": "database/final.PRIVATE.dump",
    "finalRoles": "database/roles.PRIVATE.sql",
    "snapshotEvidence": "database/SNAPSHOT_CLOSURE.PRIVATE.json",
}
EXTRA_ROLES = {"diagnostic", "provenance"}
PENDING = (
    "independentCompleteRunTreeCollection",
    "genuineWriterClosureAndConsistentFullDatabaseExport",
    "commonLifetimePeakIncludingExportAndClosure",
    "genuineCompleteDatabaseRestoreAndRoleVerification",
    "encryptedCompleteArchiveAndAuthenticatedRemoteReadback",
    "freshIndependentAcceptanceAndSeparateEnd500GO",
)


class BackupRejected(ValueError):
    """Fixed public codes only; never include private paths or contents."""


def require(value, code="BACKUP_SELECTION_REJECTED"):
    if not value:
        raise BackupRejected(code)


def _path(value):
    require(isinstance(value, str) and 0 < len(value.encode("utf-8")) <= 4096)
    require(not value.startswith("/") and "\\" not in value)
    parts = value.split("/")
    require(all(part not in ("", ".", "..") for part in parts))
    require(all(ord(c) >= 32 and ord(c) != 127 for c in value))
    # Live physical PGDATA is not a consistent logical backup; keys are never
    # part of the selected run. Fail instead of silently omitting either.
    lower = [part.lower() for part in parts]
    require(not any(part in {"pgdata", "gnupg", "keyring", "private-keys-v1.d"}
                    or "passphrase" in part or "private-key" in part or "secret-key" in part
                    or part.endswith(".key") for part in lower), "BACKUP_FORBIDDEN_FILE")
    return parts


def _pin(value, role=False):
    require(isinstance(value, dict) and set(value) == ({"role"} if role else set())
            | {"path", "bytes", "sha256"})
    _path(value["path"])
    require(type(value["bytes"]) is int and 0 <= value["bytes"] <= 2**63 - 1)
    require(isinstance(value["sha256"], str) and SHA.fullmatch(value["sha256"]))
    return {key: value[key] for key in ("path", "bytes", "sha256")}


def _context(context):
    require(isinstance(context, dict) and set(context) == {
        "schema", "scope", "nonce", "exactCommit", "runId", "runAttempt",
        "inputManifestSHA", "recipientFingerprint", "executionAuthority"})
    require(context["schema"] == "helmut-w15-backup-context/1"
            and context["scope"] == "ISOLATED_GITHUB_END500_BACKUP_ONLY"
            and context["executionAuthority"] is False)
    require(isinstance(context["exactCommit"], str) and COMMIT.fullmatch(context["exactCommit"]))
    require(isinstance(context["runId"], str) and re.fullmatch(r"[1-9][0-9]{4,19}", context["runId"]))
    require(type(context["runAttempt"]) is int and context["runAttempt"] == 1)
    require(isinstance(context["inputManifestSHA"], str) and SHA.fullmatch(context["inputManifestSHA"]))
    require(isinstance(context["recipientFingerprint"], str)
            and FINGERPRINT.fullmatch(context["recipientFingerprint"]))
    require(isinstance(context["nonce"], str))
    try:
        nonce = uuid.UUID(context["nonce"])
    except ValueError:
        raise BackupRejected("BACKUP_CONTEXT_REJECTED") from None
    require(str(nonce) == context["nonce"] and nonce.version == 4
            and nonce.variant == uuid.RFC_4122)
    return nonce


def input_pins():
    request = json.loads(REQUEST.read_bytes())
    pins = {**request["payloads"], **request["controls"]}
    pins["reception"] = {**pins["reception"], "bytes": 12357}
    require(len(pins) == 12 and sum(pin["bytes"] for pin in pins.values()) == TOTAL_INPUT_BYTES)
    return {"input:" + key: {k: pin[k] for k in ("bytes", "sha256")}
            for key, pin in pins.items()}


def selection_plan(context, selection, observed, *, expected_context):
    """Return a seal.py-compatible manifest, never completeness/start approval.

    ``selection`` adds roles to private relative file pins. ``observed`` is a
    complete independent inventory of the collected private backup tree, not a
    recursive glob of SAFE names. No supplied booleans can bypass missing files.
    """
    _context(context)
    _context(expected_context)
    require(context == expected_context, "BACKUP_CONTEXT_MISMATCH")
    require(isinstance(selection, list) and 0 < len(selection) <= 100000)
    require(isinstance(observed, list) and len(observed) == len(selection))
    pins = input_pins()
    selected, roles = {}, {}
    for row in selection:
        pin = _pin(row, role=True)
        require(pin["path"] not in selected, "BACKUP_PATH_ALIAS")
        role = row["role"]
        require(isinstance(role, str) and role in set(pins) | set(REQUIRED) | EXTRA_ROLES)
        if role not in EXTRA_ROLES:
            require(role not in roles, "BACKUP_ROLE_ALIAS")
            roles[role] = pin
        if role in pins:
            require(pin["path"].startswith("inputs/")
                    and all(pin[k] == pins[role][k] for k in ("bytes", "sha256")), "BACKUP_INPUT_PIN")
        elif role in REQUIRED:
            require(pin["path"] == REQUIRED[role], "BACKUP_REQUIRED_PATH")
            require(role == "nativeAuditStderr" or pin["bytes"] > 0, "BACKUP_REQUIRED_FILE_EMPTY")
        else:
            require(pin["path"].startswith("provenance/" if role == "provenance" else ("work/", "prepare/")))
        selected[pin["path"]] = pin
    require(set(roles) == set(pins) | set(REQUIRED), "BACKUP_REQUIRED_FILE_MISSING")
    inventory = {}
    for row in observed:
        pin = _pin(row)
        require(pin["path"] not in inventory, "BACKUP_INVENTORY_ALIAS")
        inventory[pin["path"]] = pin
    require(inventory == selected, "BACKUP_FROZEN_TREE_MISMATCH")
    files = [selected[path] for path in sorted(selected)]
    total = sum(row["bytes"] for row in files)
    require(total <= 2**63 - 1)
    manifest = {"version": 1, **{key: context[key] for key in (
        "exactCommit", "runId", "runAttempt", "inputManifestSHA", "recipientFingerprint")}, "files": files}
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":"), allow_nan=False).encode() + b"\n"
    return {"status": "PASS_SELECTION_BINDING_ONLY_COMPLETENESS_AND_READBACK_PENDING",
            "manifest": manifest, "manifestSHA256": hashlib.sha256(raw).hexdigest(),
            "manifestSerialization": "UTF-8 sorted compact JSON plus LF",
            "fileCount": len(files), "selectedPlaintextBytes": total,
            "inputFiles": len(pins), "inputBytes": TOTAL_INPUT_BYTES,
            "collectionCompletenessObserved": False, "databaseConsistencyObserved": False,
            "databaseRestoreObserved": False, "remoteReadbackObserved": False,
            "acceptedAsCompleteBackup": False, "readiness": "BLOCKED",
            "executionAuthority": False, "testStarted": False, "pendingGates": list(PENDING)}


def database_export_plan(context, *, database, container):
    """Describe bounded future commands; do not start any executable or resource.

    Run only in the already owned netless test container after genuine writer
    closure, while the original common-cgroup lifetime monitor is still active.
    The owner must make outputs exclusive, retain stderr, and record outcomes.
    """
    nonce = _context(context)
    require(database == DATABASE)
    require(container == "w15-end500-" + context["runId"] + "-" + nonce.hex)
    return {"status": "COMMAND_PLAN_ONLY_CONSISTENCY_AND_EXECUTION_UNOBSERVED",
            "container": container, "database": database,
            "databaseCommand": ["pg_dump", "--no-password", "--host=/var/run/postgresql", "--port=5432",
                                "--username=postgres", "--format=custom",
                                "--create", "--file=" + BASE + "/state/final.PRIVATE.dump", "--dbname=" + database],
            "rolesCommand": ["pg_dumpall", "--no-password", "--host=/var/run/postgresql", "--port=5432",
                             "--username=postgres", "--database=postgres", "--roles-only",
                             "--file=" + BASE + "/state/final-roles.PRIVATE.sql"],
            "requiredOrder": ["ownedWritersAndServicesGenuinelyClosed", "nativeAuditAndFreshZero",
                              "exclusivePrivateOutputsAndFullStderrCapture", "databaseAndRoleExports",
                              "freshNativeZeroAndFullLifetimeKernelReadback", "collectAndFreezeAllRunFiles",
                              "independentCompleteRestoreVerification", "sealThenAuthenticatedRemoteReadback"],
            "mustRemainInOriginalCommonCgroup": True, "peakResetAllowed": False,
            "containerMemoryLimitBytes": 2560000000, "maximumLifetimePeakBytes": 2048000000,
            "requiredReserveBytes": 512000000, "swapBytes": 0,
            "requiresControllerClosureIntegration": True, "executed": False,
            "acceptedAsCompleteBackup": False, "executionAuthority": False,
            "testStarted": False, "readiness": "BLOCKED"}
