"""Offline mutation tests only: callbacks are metadata mocks, NEVER a SQL runner.

Actual repository SQL/JS bytes supply source expectations. No graph, auth data,
authority, credential, process, socket or database is created by these tests.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def load():
    spec = importlib.util.spec_from_file_location('native_bridge_offline', HERE / 'local-unit-native-bridge-qualification.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pin(path):
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class Fixture:
    def __init__(self):
        self.m = load()
        self.operation = 'localUnitDiagnostic-' + 'a' * 32
        self.database = 'helmut_unit_diagnostic_' + 'a' * 32
        self.command = {'version': 'helmut-local-unit-diagnostic-command/1', 'mode': 'D-R-1-local-fixture',
                        'source': {'sourceIndex': 499, 'diagnosticUnit': 0}, 'calendar': {},
                        'target': {'database': self.database}, 'gatePins': {}, 'requestPins': {},
                        'drafts': [{}], 'units': [{'kind': 'DR'}], 'slot': {'plan': {'operationId': self.operation}},
                        'limits': {'units': 1, 'production': False, 'paidProviderCallsAllowed': False}}
        self.proposal = pin(REPO / self.m.PROPOSAL)
        _, _, self.original, self.native, self.helpers = self.m._sources(self.proposal)
        self.original_rows = [{'oid': str(1000 + i), **entry, 'securityDefiner': False}
                              for i, entry in enumerate(self.original.values()) if entry['name'][7:] in self.m.ORIGINAL or entry['returnType'] == 'trigger']
        self.native_rows = [{'oid': str(2000 + i), **entry, 'securityDefiner': False}
                            for i, entry in enumerate(self.native.values())]
        extra = self.m._definitions((REPO / self.m.PARTS).read_text())['public.helmut_auth_state_read_v1']
        self.input_pins = copy.deepcopy(self.original_rows) + [{'oid': '9000', **extra, 'securityDefiner': False}]
        self.calls = []

    def text(self):
        return json.dumps(self.command, sort_keys=True, separators=(',', ':'))

    def digest(self):
        return hashlib.sha256(self.text().encode()).hexdigest()

    def catalog(self, installed):
        functions = self.native_rows if installed else [s for s in self.native_rows if s['name'] not in self.helpers]
        sources = {s['name'] + '(' + s['identityArguments'] + ')': s['prosrcSHA256'] for s in functions}
        legacy = [{'oid': str(5000 + i), **self.original['public.' + name], 'securityDefiner': False, 'http': i < 2}
                  for i, name in enumerate(self.m.READERS)]
        return {'schema': 'helmut-local-unit-native-bridge-catalog/1', 'database': self.database,
                'databaseOID': '8000', 'commandHash': self.digest(), 'originalSources': copy.deepcopy(self.original_rows),
                'nativeSources': copy.deepcopy(functions), 'triggerFunctions': [s['oid'] for s in self.original_rows if s['returnType'] == 'trigger'],
                'authHash': '1' * 64, 'legacyRead': legacy,
                'originalRelations': [{'name': 'public.' + name, 'oid': str(6000 + i)} for i, name in enumerate(self.m.TABLES)] if installed else [],
                'contract': {'version': 'helmut-local-unit-diagnostic-native-store/1', 'database': self.database,
                             'databaseOID': '8000', 'sources': sources, 'legacyReadRPCs': legacy[:2], 'sourceQualified': False} if installed else None,
                'negativeChecks': 10 if installed else 0}

    def query(self, database, sql, label):
        self.calls.append((database, sql, label))
        return self.catalog(label != 'BRIDGE_SOURCE_CATALOG')

    def run(self, callback=None, **changes):
        args = dict(database=self.database, operation_id=self.operation, command_canonical=self.text(),
                    command_sha256=self.digest(), proposal_pin=self.proposal, original_source_pins=self.input_pins)
        args.update(changes)
        with mock.patch.multiple(self.m.os, getuid=lambda: 1000, geteuid=lambda: 1000, getgid=lambda: 1000, getegid=lambda: 1000):
            return self.m.install_bridge(callback or self.query, **args)


class BridgeChecks(unittest.TestCase):
    def rejected(self, fixture, callback=None, **changes):
        with self.assertRaisesRegex(fixture.m.BridgeQualificationError, '^native-original-bridge-install-or-qualification-failed$'):
            fixture.run(callback, **changes)

    def test_actual_source_closure_and_exact_compiler_qualification(self):
        f = Fixture()
        result = f.run()
        q = result['qualification']
        self.assertEqual(set(q), {'schema', 'database', 'operationId', 'commandHash', 'originalSources', 'helperSources', 'nativeSources', 'originalRelations'})
        self.assertEqual(len(q['helperSources']), 9)
        self.assertEqual(len(q['originalRelations']), 5)
        self.assertEqual(len(f.calls), 3)
        self.assertNotIn('public.helmut_auth_state_read_v1', [s['name'] for s in q['originalSources']])
        self.assertNotIn('securityDefiner', q['originalSources'][0])
        self.assertEqual(result['executedNegativeChecks'], 20)
        self.assertFalse(result['executionAuthorityInstalled'] or result['nativeWriteTransactionQualified'] or result['unit60Qualified'] or result['full500ReserveQualified'])
        self.assertTrue(result['preparationOnly'])
        self.assertEqual(result['actualContractSources'], f.catalog(True)['contract']['sources'])

    def test_correct_native_source_select_and_install_gucs(self):
        f = Fixture(); f.run()
        before, install, fresh = [call[1] for call in f.calls]
        self.assertIn('oidvectortypes(p.proargtypes)', before)
        self.assertNotIn('pg_get_function_identity_arguments', before)
        self.assertNotIn("LIKE 'helmut_auth_%'", before)
        self.assertIn("'public.briefings'::regclass", before)
        self.assertIn("WHERE NOT t.tgisinternal", before)
        self.assertIn("set_config('helmut.local_unit_original_bridge_install_target'", install)
        self.assertIn("set_config('helmut.local_unit_original_bridge_install'", install)
        self.assertIn((REPO / f.m.PROPOSAL).read_text(), install)
        self.assertIn('SET SESSION AUTHORIZATION helmut_ud_authenticator_', install)
        self.assertIn('original-bridge-root-temp-relations-required', install)
        self.assertIn('current_setting(\'helmut.bridge_negative_checks\')::integer', fresh)
        self.assertNotRegex(install, r'@[A-Z_]+@')
        self.assertNotIn('INSERT INTO helmut_unit_diagnostic.authority', install)
        self.assertNotIn('CREATE TEMP TABLE original_bridge_args', install)

    def test_source_body_oid_type_and_security_mutations(self):
        for key, value in [('prosrcSHA256', '0' * 64), ('oid', '0'), ('identityArguments', 'a jsonb'),
                           ('securityDefiner', True), ('config', None), ('volatility', 'v')]:
            f = Fixture()
            def corrupt(db, sql, label):
                c = f.query(db, sql, label)
                c['nativeSources'][0][key] = value
                return c
            self.rejected(f, corrupt)
            self.assertEqual(len(f.calls), 1)

    def test_actual_trigger_or_original_input_drift_blocks_before_install(self):
        f = Fixture()
        def corrupt(db, sql, label):
            c = f.query(db, sql, label)
            c['triggerFunctions'].append('999999')
            return c
        self.rejected(f, corrupt)
        self.assertEqual(len(f.calls), 1)
        f = Fixture(); f.input_pins[0]['prosrcSHA256'] = '0' * 64
        self.rejected(f)
        self.assertEqual(len(f.calls), 1)

    def test_missing_original_or_native_source_never_qualified(self):
        for field in ('originalSources', 'nativeSources'):
            f = Fixture()
            def corrupt(db, sql, label):
                c = f.query(db, sql, label)
                c[field].pop(0)
                return c
            self.rejected(f, corrupt)

    def test_duplicate_function_oid_and_overload_names_rejected(self):
        for key in ('oid', 'name'):
            f = Fixture()
            def corrupt(db, sql, label):
                c = f.query(db, sql, label)
                c['nativeSources'][1][key] = c['nativeSources'][0][key]
                return c
            self.rejected(f, corrupt)

    def test_contract_source_map_and_negative_counter_consumed(self):
        for change in ('map', 'count', 'qualified'):
            f = Fixture()
            def corrupt(db, sql, label):
                c = f.query(db, sql, label)
                if label != 'BRIDGE_SOURCE_CATALOG':
                    if change == 'map': c['contract']['sources'].pop(next(iter(c['contract']['sources'])))
                    if change == 'count': c['negativeChecks'] = 9
                    if change == 'qualified': c['contract']['sourceQualified'] = True
                return c
            self.rejected(f, corrupt)
            self.assertEqual(len(f.calls), 2)

    def test_original_auth_and_fresh_readback_drift_fail(self):
        for field in ('authHash', 'databaseOID'):
            f = Fixture()
            def corrupt(db, sql, label):
                c = f.query(db, sql, label)
                if label == 'BRIDGE_FRESH_READBACK': c[field] = '2' * 64 if field == 'authHash' else '8001'
                return c
            self.rejected(f, corrupt)
            self.assertEqual(len(f.calls), 3)

    def test_unknown_install_outcome_cannot_retry(self):
        f = Fixture()
        def unknown(db, sql, label):
            f.calls.append((db, sql, label))
            if label != 'BRIDGE_SOURCE_CATALOG': raise RuntimeError('untrusted-callback-detail')
            return f.catalog(False)
        self.rejected(f, unknown)
        calls = len(f.calls)
        self.rejected(f)
        self.assertEqual(len(f.calls), calls)

    def test_command_scope_and_hash_checked_before_native_callback(self):
        for section, key, value in [('limits', 'units', 500), ('limits', 'production', True),
                                    ('limits', 'paidProviderCallsAllowed', True), ('source', 'sourceIndex', 498)]:
            f = Fixture(); f.command[section][key] = value
            self.rejected(f); self.assertEqual(f.calls, [])
        f = Fixture(); self.rejected(f, command_sha256='0' * 64); self.assertEqual(f.calls, [])

    def test_uid_and_hosted_mode_rejected(self):
        f = Fixture()
        with mock.patch.dict(f.m.os.environ, {'VERCEL': '1'}): self.rejected(f)
        self.assertEqual(f.calls, [])
        with mock.patch.multiple(f.m.os, getuid=lambda: 0, geteuid=lambda: 0, getgid=lambda: 0, getegid=lambda: 0):
            with self.assertRaises(f.m.BridgeQualificationError):
                f.m.install_bridge(f.query, database=f.database, operation_id=f.operation, command_canonical=f.text(),
                                   command_sha256=f.digest(), proposal_pin=f.proposal, original_source_pins=f.input_pins)

    def test_proposal_fd_pin_and_compiler_pair_cannot_drift(self):
        f = Fixture()
        bad = dict(f.proposal, sha256='0' * 64)
        self.rejected(f, proposal_pin=bad); self.assertEqual(f.calls, [])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for relative in (f.m.PROPOSAL, f.m.COMPILER, f.m.STORE, f.m.PARTS, f.m.USAGE, f.m.BOUNDED, f.m.SCHEMA, f.m.COMMAND):
                target = root / relative; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(REPO / relative, target)
            compiler = root / f.m.COMPILER
            compiler.write_text(compiler.read_text().replace(next(iter(f.helpers.values()))['prosrcSHA256'], '0' * 64, 1))
            self.rejected(f, proposal_pin=pin(root / f.m.PROPOSAL)); self.assertEqual(f.calls, [])

    def test_capture_duplicate_keys_limits_and_exception_redaction(self):
        for raw in ('{"database":1,"database":2}', b'\xff', 'x' * (1024**2 + 1)):
            f = Fixture(); self.rejected(f, lambda *_: raw)
        f = Fixture()
        def throws(*_): raise RuntimeError('untrusted-callback-detail')
        with self.assertRaises(f.m.BridgeQualificationError) as caught: f.run(throws)
        self.assertNotIn('untrusted-callback-detail', str(caught.exception))

    def test_returned_metadata_does_not_alias_callback_catalogs(self):
        f = Fixture(); saved = []
        def callback(db, sql, label):
            c = f.query(db, sql, label); saved.append(c); return c
        result = f.run(callback)
        saved[-1]['nativeSources'][0]['prosrcSHA256'] = '0' * 64
        self.assertNotEqual(result['allNativeSources'][0]['prosrcSHA256'], '0' * 64)

    def test_precommand_expected_bridge_map_is_exact_source_only(self):
        f = Fixture()
        values = f.m.expected_bridge_sources(f.proposal)
        self.assertEqual(len(values), 9)
        self.assertEqual(values, {h['name'] + '(' + h['identityArguments'] + ')': h['prosrcSHA256'] for h in f.helpers.values()})
        self.assertEqual(f.calls, [])
        self.assertNotIn(f.database, json.dumps(values))

    def test_read_registry_rechecks_actual_six_source_bodies(self):
        f = Fixture()
        def corrupt(db, sql, label):
            c = f.query(db, sql, label)
            c['legacyRead'][0]['prosrcSHA256'] = '0' * 64
            return c
        self.rejected(f, corrupt)
        self.assertEqual(len(f.calls), 1)


if __name__ == '__main__':
    unittest.main()
