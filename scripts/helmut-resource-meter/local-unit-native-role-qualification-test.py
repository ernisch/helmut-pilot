"""Offline fail-closed tests. No SQL callback below opens a native connection."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest


PATH = Path(__file__).with_name("local-unit-native-role-qualification.py")
SPEC = importlib.util.spec_from_file_location("native_role_qualification", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
NONCE = "b" * 32
DATABASE = "helmut_unit_diagnostic_" + NONCE


def catalog():
    return {"schema": "helmut-local-unit-native-role-catalog/1",
            "nativeCatalogPin": "a" * 64, "privilegeCatalogPin": "c" * 64, "roleCatalogPin": "f" * 64,
            **{key: True for key in MODULE.FLAGS},
            **{key: 0 for key in MODULE.ROW_COUNTS}}


def probes():
    return {"schema": "helmut-local-unit-native-role-probes/1",
            "runtimeContractConfirmed": True, "contractSourceCount": 32,
            "contractResponsePin": "d" * 64, "executedNegativeCases": 31,
            "emptyArtifactReadConfirmed": True, "nativeSHAConfirmed": True,
            "separateQualificationRole": True, "unrelatedSentinelUnchanged": True,
            "ownAuthorityRows": 0, "ownStateRows": 0, "ownLeaseRows": 0}


class Callback:
    def __init__(self, answers=None, serialization=None):
        self.answers = copy.deepcopy(answers if answers is not None else [catalog(), probes(), catalog()])
        self.calls = []
        self.serialization = serialization

    def __call__(self, database, sql, label):
        self.calls.append((database, sql, label))
        answer = self.answers[len(self.calls) - 1]
        if isinstance(answer, Exception):
            raise answer
        return self.serialization(answer) if self.serialization else answer


class QualificationTests(unittest.TestCase):
    def rejects(self, callback, symbolic=None):
        with self.assertRaises(MODULE.QualificationError) as caught:
            MODULE.qualify(callback, DATABASE, NONCE)
        if symbolic:
            self.assertEqual(str(caught.exception), "native-role-qualification-" + symbolic)

    def test_explicitly_separates_preparation_from_state_machine_measurement(self):
        callback = Callback()
        result = MODULE.qualify(callback, DATABASE, NONCE)
        self.assertTrue(result["executedChecksPassed"])
        self.assertEqual(result["negativeChecks"], 31)
        self.assertEqual(result["actualAuthorityRowsConsumed"], 0)
        for key in ("successfulCASMeasured", "CASRevisionConflictMeasured", "lostACKNoReplayMeasured",
                    "leaseAcquisitionMeasured", "leaseTTLFencingMeasured", "concurrentInstanceFencingMeasured",
                    "fullNativeStateMachineQualified", "unitExecutionAuthorized", "full500Accepted", "production"):
            self.assertIs(result[key], False, key)
        self.assertEqual(result["contractResponsePin"], "d" * 64)
        self.assertEqual(len(callback.calls), 3)
        self.assertEqual(callback.calls[0], callback.calls[2][:2] + ("role-qualification-before",))
        self.assertEqual([call[2] for call in callback.calls], ["role-qualification-before",
                         "role-qualification-native-probes", "role-qualification-after-rollback"])

    def test_bounded_utf8_json_callback_results(self):
        for serialize in (json.dumps, lambda value: json.dumps(value).encode("utf-8")):
            self.assertTrue(MODULE.qualify(Callback(serialization=serialize), DATABASE, NONCE)["executedChecksPassed"])

    def test_target_validation_precedes_every_callback(self):
        callback = Callback()
        cases = [(None, DATABASE, NONCE), (callback, "postgres", NONCE),
                 (callback, DATABASE, "C" * 32), (callback, DATABASE + "'", NONCE),
                 (callback, DATABASE, NONCE + ";SELECT 1"), (callback, 7, NONCE)]
        for args in cases:
            with self.assertRaises(MODULE.QualificationError):
                MODULE.qualify(*args)
        self.assertEqual(callback.calls, [])

    def test_every_catalog_guard_is_required_as_boolean_true(self):
        for key in MODULE.FLAGS:
            for value in (False, None, 1, "true"):
                before = catalog()
                before[key] = value
                callback = Callback([before])
                self.rejects(callback, "catalog-guard")
                self.assertEqual(len(callback.calls), 1)

    def test_existing_auth_state_or_lease_aborts_before_mutations(self):
        for key in MODULE.ROW_COUNTS:
            for value in (1, False, "0", -1):
                before = catalog()
                before[key] = value
                callback = Callback([before])
                self.rejects(callback, "nonempty-authority-store")
                self.assertEqual(len(callback.calls), 1)

    def test_catalog_pin_shape_and_catalog_extra_fields_rejected(self):
        for key in ("nativeCatalogPin", "privilegeCatalogPin", "roleCatalogPin"):
            for value in (None, "A" * 64, "a" * 63, 42):
                before = catalog()
                before[key] = value
                self.rejects(Callback([before]), "catalog-pin")
        before = catalog()
        before["unexpected"] = True
        self.rejects(Callback([before]), "catalog-shape")

    def test_each_native_probe_result_must_be_measured_true(self):
        for key in ("runtimeContractConfirmed", "emptyArtifactReadConfirmed", "nativeSHAConfirmed",
                    "separateQualificationRole", "unrelatedSentinelUnchanged"):
            for value in (False, None, 1, "true"):
                result = probes()
                result[key] = value
                callback = Callback([catalog(), result])
                self.rejects(callback, "probes-unconfirmed")
                self.assertEqual(len(callback.calls), 2)

    def test_probe_counts_are_not_truthiness_or_substring_passes(self):
        for key, values in (("executedNegativeCases", [30, 32, True, "31"]),
                            ("contractSourceCount", [8, 257, True, "32"]),
                            ("ownAuthorityRows", [1, False, "0"]),
                            ("ownStateRows", [1, False, "0"]),
                            ("ownLeaseRows", [1, False, "0"])):
            for value in values:
                result = probes()
                result[key] = value
                self.rejects(Callback([catalog(), result]), "probe-counts")
        result = probes()
        result["contractResponsePin"] = "PASS"
        self.rejects(Callback([catalog(), result]), "contract-pin")
        result = probes()
        result["extra"] = True
        self.rejects(Callback([catalog(), result]), "probes-shape")

    def test_rollback_must_restore_roles_schema_and_catalog_pins(self):
        for key in ("nativeCatalogPin", "privilegeCatalogPin", "roleCatalogPin"):
            after = catalog()
            after[key] = "e" * 64
            self.rejects(Callback([catalog(), probes(), after]), "catalog-changed")
        for key in ("qualificationRoleAbsent", "qualificationSchemaAbsent"):
            after = catalog()
            after[key] = False
            self.rejects(Callback([catalog(), probes(), after]), "catalog-guard")

    def test_callback_errors_and_malformed_output_do_not_export_contents(self):
        marker = "synthetic-private-content-must-not-escape"
        bad_answers = [RuntimeError(marker), marker, b"\xff", "\ud800", "x" * 16385,
                       b"x" * 16385, [marker], '{"schema":"x","schema":"' + marker + '"}']
        for bad in bad_answers:
            callback = Callback([bad])
            with self.assertRaises(MODULE.QualificationError) as caught:
                MODULE.qualify(callback, DATABASE, NONCE)
            self.assertNotIn(marker, str(caught.exception))
            self.assertTrue(str(caught.exception).startswith("native-role-qualification-"))
            self.assertEqual(len(callback.calls), 1)

    def test_generated_sql_calls_real_contract_and_all_nine_rpc_signatures(self):
        callback = Callback()
        MODULE.qualify(callback, DATABASE, NONCE)
        native = callback.calls[1][1]
        preflight = callback.calls[0][1]
        self.assertIn("c:=public.local_unit_diagnostic_contract_v1()", native)
        self.assertIn("role-qualification-contract-catalog-binding", native)
        self.assertIn("convert_to(p.prosrc,'UTF8')", native)
        self.assertIn("'sourceQualified' IS DISTINCT FROM 'false'::jsonb", native)
        self.assertIn("has_any_column_privilege", preflight)
        self.assertIn("pg_get_constraintdef", preflight)
        self.assertIn("pg_get_triggerdef", preflight)
        for name, args, _ in MODULE.RPCS:
            signature = "public.local_unit_diagnostic_" + name + "_v1(" + args + ")"
            self.assertIn(signature, preflight)
            self.assertIn(signature, native)

    def test_generated_probes_have_exact_native_denials_and_no_escape_path(self):
        sql, count = MODULE._probe_sql(DATABASE, NONCE, "a" * 32)
        self.assertEqual(count, 31)
        self.assertTrue(sql.startswith("BEGIN;"))
        self.assertTrue(sql.endswith("ROLLBACK;"))
        self.assertEqual(sql.count("EXCEPTION WHEN SQLSTATE"), 31)
        self.assertNotIn("WHEN OTHERS", sql.upper())
        self.assertNotIn("COMMIT", sql.upper())
        self.assertNotIn("SET SESSION_REPLICATION_ROLE", sql.upper())
        self.assertNotIn("UPDATE PUBLIC.", sql.upper())
        self.assertIn("GET STACKED DIAGNOSTICS detail_message=MESSAGE_TEXT", sql)
        self.assertIn("local-unit-store-lease-ttl", sql)
        self.assertIn("role-qualification-expected-denial-missing", sql)
        self.assertIn("role-qualification-privileged-session-accepted", sql)
        self.assertIn("role-qualification-owner-bridge-accepted", sql)
        self.assertIn("WITH INHERIT FALSE, SET TRUE, ADMIN FALSE", sql)
        self.assertIn("SET SESSION AUTHORIZATION helmut_ud_qualifier_", sql)

    def test_module_has_no_process_network_connection_or_top_level_execution(self):
        import ast
        tree = ast.parse(PATH.read_text(encoding="utf-8"))
        imports = {alias.name for item in tree.body if isinstance(item, ast.Import) for alias in item.names}
        self.assertEqual(imports, {"hashlib", "json", "re"})
        self.assertFalse(any(isinstance(item, (ast.If, ast.Expr)) and not
                             (isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant)
                              and isinstance(item.value.value, str)) for item in tree.body))


if __name__ == "__main__":
    unittest.main()
