"""Small fictional selection/command tests; no file exports, processes or network."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("w15_backup_contract", Path(__file__).with_name("backup_contract.py"))
B = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B)


class BackupChecks(unittest.TestCase):
    def setUp(self):
        self.context = {"schema": "helmut-w15-backup-context/1", "scope": "ISOLATED_GITHUB_END500_BACKUP_ONLY",
                        "nonce": "11111111-2222-4333-8444-555555555555", "exactCommit": "a" * 40,
                        "runId": "123456789", "runAttempt": 1, "inputManifestSHA": "b" * 64,
                        "recipientFingerprint": "C" * 40, "executionAuthority": False}
        self.pins = {"input:" + str(i): {"bytes": i + 1, "sha256": hashlib.sha256(str(i).encode()).hexdigest()}
                     for i in range(12)}
        self.selected = [{"role": key, "path": "inputs/" + key.split(":")[1], **pin}
                         for key, pin in self.pins.items()]
        self.selected += [{"role": role, "path": path, "bytes": 1, "sha256": "d" * 64}
                          for role, path in B.REQUIRED.items()]
        self.selected += [{"role": "diagnostic", "path": "work/state/gateway.PRIVATE.log",
                           "bytes": 1, "sha256": "e" * 64}]
        self.inventory = [{key: row[key] for key in ("path", "bytes", "sha256")} for row in self.selected]

    def plan(self, **kwargs):
        with patch.object(B, "input_pins", return_value=self.pins):
            return B.selection_plan(kwargs.get("context", self.context), kwargs.get("selection", self.selected),
                                    kwargs.get("observed", self.inventory), expected_context=self.context)

    def test_full_catalog_remains_blocked_and_seal_compatible(self):
        result = self.plan()
        self.assertEqual(set(result["manifest"]), {"version", "exactCommit", "runId", "runAttempt",
                         "inputManifestSHA", "recipientFingerprint", "files"})
        self.assertEqual(result["fileCount"], len(self.inventory))
        self.assertFalse(result["acceptedAsCompleteBackup"])
        self.assertFalse(result["executionAuthority"])
        self.assertEqual(result["readiness"], "BLOCKED")
        self.assertFalse(result["databaseConsistencyObserved"])

    def test_missing_final_dump_or_audit_cannot_pass(self):
        for role in ("finalDump", "finalRoles", "nativeAudit", "snapshotEvidence"):
            rows = [r for r in self.selected if r["role"] != role]
            inventory = [{k: r[k] for k in ("path", "bytes", "sha256")} for r in rows]
            with self.assertRaises(B.BackupRejected):
                self.plan(selection=rows, observed=inventory)

    def test_omitted_diagnostic_detected_by_independent_inventory(self):
        with self.assertRaises(B.BackupRejected):
            self.plan(selection=self.selected[:-1])

    def test_wrong_input_pin_is_rejected(self):
        rows = copy.deepcopy(self.selected)
        rows[0]["sha256"] = "f" * 64
        with self.assertRaises(B.BackupRejected):
            self.plan(selection=rows)

    def test_context_replay_or_authority_rejected(self):
        for key, value in (("runAttempt", 2), ("exactCommit", "f" * 40), ("executionAuthority", True),
                           ("recipientFingerprint", "F" * 40), ("runId", "01234")):
            context = {**self.context, key: value}
            with self.assertRaises(B.BackupRejected):
                self.plan(context=context)
        with self.assertRaises(B.BackupRejected):
            self.plan(context={**self.context, "allChecks": True})

    def test_empty_dump_or_roles_cannot_fill_required_categories(self):
        for role in ("finalDump", "finalRoles", "snapshotEvidence"):
            rows = copy.deepcopy(self.selected)
            next(row for row in rows if row["role"] == role)["bytes"] = 0
            inventory = [{k: r[k] for k in ("path", "bytes", "sha256")} for r in rows]
            with self.assertRaises(B.BackupRejected):
                self.plan(selection=rows, observed=inventory)

    def test_path_alias_and_role_alias_rejected(self):
        rows = copy.deepcopy(self.selected)
        rows[-1]["path"] = rows[0]["path"]
        with self.assertRaises(B.BackupRejected):
            self.plan(selection=rows)
        rows = copy.deepcopy(self.selected)
        rows[-1]["role"] = "finalDump"
        with self.assertRaises(B.BackupRejected):
            self.plan(selection=rows)

    def test_traversal_pgdata_and_keys_rejected(self):
        for path in ("../outside", "work/pgdata/base/123", "work/gnupg/private.key", "work/receiver-private.key",
                     "work/receiver-passphrase.PRIVATE.txt"):
            rows = copy.deepcopy(self.selected)
            rows[-1]["path"] = path
            with self.assertRaises(B.BackupRejected):
                self.plan(selection=rows)

    def test_database_plan_is_bound_and_never_executes(self):
        container = "w15-end500-123456789-11111111222243338444555555555555"
        result = B.database_export_plan(self.context, database=B.DATABASE, container=container)
        self.assertEqual(result["databaseCommand"][0], "pg_dump")
        self.assertEqual(result["rolesCommand"][0], "pg_dumpall")
        self.assertNotIn("--no-role-passwords", result["rolesCommand"])
        self.assertFalse(result["executed"])
        self.assertFalse(result["peakResetAllowed"])
        self.assertEqual(result["maximumLifetimePeakBytes"], 2048000000)
        with self.assertRaises(B.BackupRejected):
            B.database_export_plan(self.context, database="postgres", container=container)
        with self.assertRaises(B.BackupRejected):
            B.database_export_plan(self.context, database=B.DATABASE, container="old-container")


if __name__ == "__main__":
    unittest.main()
