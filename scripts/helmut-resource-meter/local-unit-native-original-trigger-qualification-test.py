"""Pure source/catalog mutation tests; no child, socket, database or SQL runner."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def load():
    spec = importlib.util.spec_from_file_location('original_trigger_offline', HERE / 'local-unit-native-original-trigger-qualification.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Fixture:
    def __init__(self):
        self.m = load()
        self.database = 'helmut_unit_diagnostic_' + 'a' * 32
        self.texts = {name: (REPO / name).read_text() for name in self.m.SOURCES}
        self.pins = {name: {'path': str(REPO / name), 'bytes': len(text.encode()),
                            'sha256': hashlib.sha256(text.encode()).hexdigest()} for name, text in self.texts.items()}
        self.expected = self.m._expected(self.texts)
        self.baseline = {'database': self.database, 'databaseOID': '18405', 'originalTriggers': [], 'originalSources': []}
        self.actual = {'schema': 'helmut-native-original-trigger-catalog/1', 'database': self.database, 'databaseOID': '18405',
                       'sessionUser': 'postgres', 'currentUser': 'postgres', 'readOnly': 'on', 'replicationRole': 'origin',
                       'tables': [], 'triggers': []}
        for i, name in enumerate(self.m.TABLES):
            self.actual['tables'].append({'oid': str(1000 + i), 'name': name, 'owner': 'postgres', 'ownerOID': '10',
                'kind': 'r', 'persistence': 'p', 'partition': False, 'rls': True, 'parents': []})
        functions = {}
        for i, e in enumerate(self.expected.values()):
            if e['function'] not in functions:
                oid = str(2000 + len(functions))
                functions[e['function']] = oid
                self.baseline['originalSources'].append({'oid': oid, 'name': e['function'], 'identityArguments': '',
                    'prosrcSHA256': e['functionSourceSHA256'], 'volatility': 'v', 'returnType': 'trigger',
                    'language': 'plpgsql', 'config': ['search_path=pg_catalog'], 'securityDefiner': False})
            base = {'oid': str(3000 + i), 'table': e['table'], 'name': e['name'], 'functionOID': functions[e['function']],
                    'enabled': e['enabled'], 'type': e['type'], 'definitionSHA256': e['definitionSHA256']}
            self.baseline['originalTriggers'].append(base)
            self.actual['triggers'].append({**base, 'tableOID': str(1000 + self.m.TABLES.index(e['table'])),
                'tableOwner': 'postgres', 'tableOwnerOID': '10', 'function': e['function'], 'functionOwner': 'postgres',
                'functionOwnerOID': '10', 'functionIdentityArguments': '', 'functionReturnType': 'trigger',
                'functionLanguage': 'plpgsql', 'functionSourceSHA256': e['functionSourceSHA256'],
                'functionConfig': ['search_path=pg_catalog'], 'functionSecurityDefiner': False,
                'functionVolatility': 'v', 'functionKind': 'f', 'functionIsStrict': False, 'functionLeakproof': False,
                'attributes': [], 'whenSHA256': None, 'argumentsHex': '', 'argumentCount': 0, 'constraintOID': '0',
                'deferrable': False, 'initiallyDeferred': False, 'oldTransitionTable': None, 'newTransitionTable': None, 'parentTriggerOID': '0'})
        self.calls = []

    def query(self, database, sql, label):
        self.calls.append((database, sql, label))
        return copy.deepcopy(self.actual)

    def run(self, callback=None, **changes):
        args = dict(database=self.database, catalog=self.baseline, source_pins=self.pins)
        args.update(changes)
        with mock.patch.multiple(self.m.os, getuid=lambda: 1000, geteuid=lambda: 1000, getgid=lambda: 1000, getegid=lambda: 1000):
            return self.m.qualify_original_triggers(callback or self.query, **args)


class TriggerChecks(unittest.TestCase):
    def rejected(self, fixture, callback=None, **changes):
        with self.assertRaisesRegex(fixture.m.OriginalTriggerQualificationError, '^native-original-trigger-qualification-failed$'):
            fixture.run(callback, **changes)

    def test_complete_source_contract_two_fresh_reads_no_execution_authority(self):
        f = Fixture(); result = f.run()
        self.assertEqual(len(result['originalTriggers']), 10)
        self.assertEqual(len(result['originalTables']), 4)
        self.assertEqual(result['sourcePins'], f.pins)
        self.assertEqual(result['freshReadonlyCatalogs'], 2)
        self.assertEqual([c[2] for c in f.calls], ['ORIGINAL_TRIGGER_BEFORE', 'ORIGINAL_TRIGGER_AFTER'])
        self.assertEqual(result['originalTriggersSHA256'], f.m._sha(f.m._json(result['originalTriggers'])))
        self.assertTrue(result['preparationOnly'])
        self.assertFalse(result['executionAuthorityInstalled'] or result['unit60Qualified'] or result['full500Qualified'])

    def test_source_derives_trigger_event_bits_and_postgres_deparse_order(self):
        f = Fixture(); e = f.expected['helmut_store.helmut_s500_command_immutable_row_v1']
        text = 'CREATE TRIGGER helmut_s500_command_immutable_row_v1 BEFORE DELETE OR UPDATE ON public.helmut_store FOR EACH ROW EXECUTE FUNCTION helmut_s500_command_immutable_row_v1()'
        self.assertEqual(e['type'], 27)
        self.assertEqual(e['definitionSHA256'], f.m._sha(text))
        self.assertEqual({e['type'] for e in f.expected.values()}, {27, 31, 34})

    def test_query_is_readonly_catalog_only_with_closed_four_tables(self):
        f = Fixture(); f.run(); sql = f.calls[0][1]
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertNotRegex(sql, r'(?i)\b(?:create|insert|update|delete|truncate|call|do|commit)\b')
        self.assertIn('pg_catalog.pg_get_triggerdef(t.oid,false)', sql)
        self.assertIn('t.tgattr::smallint[]', sql)
        self.assertNotIn('pg_catalog.coalesce', sql)
        for table in f.m.TABLES:
            self.assertIn("'public." + table + "'::regclass", sql)

    def test_missing_extra_duplicate_and_disabled_trigger_fail(self):
        for change in ('missing', 'extra', 'duplicate', 'disabled'):
            f = Fixture()
            if change == 'missing': f.actual['triggers'].pop()
            elif change == 'extra': f.actual['triggers'].append(copy.deepcopy(f.actual['triggers'][0]))
            elif change == 'duplicate': f.actual['triggers'][1] = copy.deepcopy(f.actual['triggers'][0])
            else: f.actual['triggers'][0]['enabled'] = 'D'
            self.rejected(f)
            self.assertEqual(len(f.calls), 1)

    def test_rewiring_definition_event_owner_attrs_when_and_args_fail(self):
        for key, value in [('type', 29), ('functionOID', '12345'), ('function', 'public.other'),
                           ('definitionSHA256', '0' * 64), ('tableOwner', 'other'), ('tableOwnerOID', '11'),
                           ('functionOwner', 'other'), ('functionOwnerOID', '11'), ('attributes', [1]),
                           ('whenSHA256', '0' * 64), ('argumentsHex', '00'), ('argumentCount', 1),
                           ('constraintOID', '1'), ('parentTriggerOID', '1'), ('deferrable', True),
                           ('initiallyDeferred', True), ('oldTransitionTable', 'old_rows'), ('newTransitionTable', 'new_rows')]:
            with self.subTest(key=key):
                f = Fixture(); f.actual['triggers'][0][key] = value; self.rejected(f)

    def test_function_source_type_security_and_configuration_fail(self):
        for key, value in [('functionSourceSHA256', '0' * 64), ('functionIdentityArguments', 'text'),
                           ('functionReturnType', 'void'), ('functionLanguage', 'sql'), ('functionConfig', None),
                           ('functionSecurityDefiner', True), ('functionVolatility', 's'), ('functionKind', 'p'),
                           ('functionIsStrict', True), ('functionLeakproof', True)]:
            with self.subTest(key=key):
                f = Fixture(); f.actual['triggers'][0][key] = value; self.rejected(f)

    def test_table_shape_including_table_without_triggers_is_checked(self):
        for key, value in [('name', 'other'), ('owner', 'other'), ('ownerOID', '11'), ('kind', 'v'),
                           ('persistence', 'u'), ('partition', True), ('rls', False), ('parents', ['123'])]:
            with self.subTest(key=key):
                f = Fixture(); f.actual['tables'][-1][key] = value; self.rejected(f)

    def test_input_catalog_is_not_its_own_expected_contract(self):
        for key, value in [('enabled', 'D'), ('type', 29), ('definitionSHA256', '0' * 64)]:
            f = Fixture(); f.baseline['originalTriggers'][0][key] = value
            f.actual['triggers'][0][key] = value
            self.rejected(f); self.assertEqual(f.calls, [])
        f = Fixture(); f.baseline['originalSources'][0]['prosrcSHA256'] = '0' * 64
        self.rejected(f); self.assertEqual(f.calls, [])

    def test_fresh_catalog_and_source_drift_fail(self):
        f = Fixture()
        def drift(db, sql, label):
            value = f.query(db, sql, label)
            if label.endswith('AFTER'): value['tables'][0]['oid'] = '9999'
            return value
        self.rejected(f, drift); self.assertEqual(len(f.calls), 2)
        f = Fixture(); read = f.m._source; calls = 0
        def source(pin, relative):
            nonlocal calls
            calls += 1
            if calls > 4: raise RuntimeError('source changed')
            return read(pin, relative)
        with mock.patch.object(f.m, '_source', source): self.rejected(f)
        self.assertEqual(len(f.calls), 1)

    def test_closed_source_set_and_pin_before_query(self):
        f = Fixture(); pins = dict(f.pins); pins.pop(f.m.COMMAND)
        self.rejected(f, source_pins=pins); self.assertEqual(f.calls, [])
        f = Fixture(); pins = copy.deepcopy(f.pins); pins[f.m.PARTS]['sha256'] = '0' * 64
        self.rejected(f, source_pins=pins); self.assertEqual(f.calls, [])

    def test_source_missing_always_extra_trigger_or_unsupported_when_fail(self):
        f = Fixture()
        variants = [f.texts[f.m.PARTS].replace('enable always trigger', 'enable trigger', 1),
                    f.texts[f.m.PARTS] + '\ncreate trigger extra before update on public.briefings for each row execute function public.helmut_auth_state_nodes_guard_local_v1();\n',
                    f.texts[f.m.PARTS].replace('for each row execute function', 'for each row when (true) execute function', 1)]
        for changed in variants:
            with self.subTest():
                texts = {**f.texts, f.m.PARTS: changed}
                with self.assertRaises(f.m.OriginalTriggerQualificationError): f.m._expected(texts)

    def test_function_body_comments_cannot_manufacture_trigger_ddl(self):
        f = Fixture(); texts = dict(f.texts)
        texts[f.m.BOUNDED] += "\n-- create trigger ignored before delete on public.briefings;\nDO $fake$ BEGIN 'create trigger ignored;'; END; $fake$;\n"
        self.assertEqual(f.m._expected(texts), f.expected)

    def test_wrong_database_read_mode_session_or_replication_role_fail(self):
        for key, value in [('database', 'postgres'), ('databaseOID', '9'), ('sessionUser', 'other'),
                           ('currentUser', 'other'), ('readOnly', 'off'), ('replicationRole', 'replica')]:
            f = Fixture(); f.actual[key] = value; self.rejected(f)

    def test_duplicate_json_nonfinite_oversize_and_callback_failure_are_sanitized(self):
        for raw in ('{"schema":1,"schema":2}', '{"schema":NaN}', ' ' * 131073):
            f = Fixture(); self.rejected(f, lambda *_: raw)
        f = Fixture()
        def failed(*_): raise RuntimeError('private callback detail')
        self.rejected(f, failed)

    def test_uid_hosted_and_database_scope_fail_before_callback(self):
        f = Fixture()
        with mock.patch.dict(f.m.os.environ, {'VERCEL': '1'}): self.rejected(f)
        self.assertEqual(f.calls, [])
        f = Fixture(); self.rejected(f, database='postgres'); self.assertEqual(f.calls, [])


if __name__ == '__main__':
    unittest.main()
