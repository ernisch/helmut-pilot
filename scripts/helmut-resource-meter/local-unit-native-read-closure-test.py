"""Offline source/catalog mutation checks. No SQL runner, process or DB start."""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def load():
    spec = importlib.util.spec_from_file_location('native_read_closure_offline', HERE / 'local-unit-native-read-closure.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class Fixture:
    def __init__(self):
        self.m = load()
        self.operation = 'localUnitDiagnostic-' + 'a' * 32
        self.database = 'helmut_unit_diagnostic_' + 'a' * 32
        self.command = {'version': 'helmut-local-unit-diagnostic-command/1', 'mode': 'D-R-1-local-fixture',
                        'source': {'sourceIndex': 499, 'diagnosticUnit': 0}, 'calendar': {},
                        'target': {'database': self.database}, 'gatePins': {}, 'requestPins': {},
                        'drafts': [{'profile': {'id': 'offline-subject'}, 'sources': {'documents': [{'id': 'offline-document'}], 'knowledgeObjects': [{'id': 'offline-ko'}]}}],
                        'units': [{'kind': 'DR', 'subject': 'offline-subject'}], 'slot': {'plan': {'operationId': self.operation}},
                        'limits': {'units': 1, 'production': False, 'paidProviderCallsAllowed': False}}
        self.pins = {relative: {'path': str(REPO / relative), 'bytes': (REPO / relative).stat().st_size,
                               'sha256': hashlib.sha256((REPO / relative).read_bytes()).hexdigest()}
                     for relative in (self.m.PARTS, self.m.USAGE, self.m.BOUNDED)}
        self.password = os.urandom(32).hex()
        self.calls = []
        self.catalog = {'schema': 'helmut-native-read-closure-catalog/1', 'database': self.database, 'databaseOID': '12345',
                        'operationId': self.operation, 'commandHash': self.digest(), 'authHash': 'e' * 64, 'securityHash': 'a' * 64,
                        'functions': [{'oid': str(30000 + i), 'name': name, 'identityArguments': args, 'prosrcSHA256': sha,
                                       'volatility': vol, 'returnType': 'jsonb', 'language': 'plpgsql', 'config': ['search_path=pg_catalog'],
                                       'securityDefiner': False} for i, (name, args, sha, vol) in enumerate(self.m._expected())]}

    def text(self):
        return json.dumps(self.command, sort_keys=True, separators=(',', ':'))

    def digest(self):
        return hashlib.sha256(self.text().encode()).hexdigest()

    def query(self, db, sql, label):
        self.calls.append((db, sql, label))
        value = copy.deepcopy(self.catalog)
        value['securityHash'] = ('a' if label == 'READ_CLOSURE_SOURCE_CATALOG' else 'b') * 64
        return value

    def run(self, callback=None, **changes):
        args = dict(database=self.database, operation_id=self.operation, command_canonical=self.text(),
                    command_sha256=self.digest(), source_pins=self.pins, authenticator_password_hex=self.password)
        args.update(changes)
        with mock.patch.multiple(self.m.os, getuid=lambda: 1000, geteuid=lambda: 1000, getgid=lambda: 1000, getegid=lambda: 1000):
            return self.m.install_read_closure(callback or self.query, **args)


class ReadClosureChecks(unittest.TestCase):
    def rejected(self, f, callback=None, **kwargs):
        with self.assertRaisesRegex(f.m.ReadClosureError, '^native-read-closure-install-or-qualification-failed$'):
            f.run(callback, **kwargs)

    def test_genuine_six_source_bodies_and_private_metadata(self):
        f = Fixture()
        result = f.run()
        self.assertTrue(len(f.calls) == 3 and len(result['functions']) == len(result['qualificationFiles']) == 6)
        self.assertTrue(len(result['legacy']['tables']) == 4 and len(result['legacy']['rpcs']) == 2)
        self.assertTrue(result['negativeChecks'] == 34 and result['nativeProbeChecks'] == 49)
        self.assertTrue([r['requestKeys'] for r in result['legacy']['rpcs']] == [['id', 'knownProof', 'readNonce', 'knownGraph'], ['id']])
        self.assertTrue(f.password not in json.dumps(result))
        self.assertTrue('offline-subject' not in json.dumps(result) and 'offline-document' not in json.dumps(result))
        for doc in result['qualificationFiles']:
            raw = doc['text'].encode()
            self.assertTrue(doc['pin']['bytes'] == len(raw) and doc['pin']['sha256'] == hashlib.sha256(raw).hexdigest())
            self.assertTrue(doc['pin']['path'].startswith('/run/bootstrap/READ_') and doc['pin']['path'].endswith('.PRIVATE.json'))
            body = json.loads(raw)
            self.assertTrue(body['database'] == f.database and body['name'].startswith('helmut_auth_'))

    def test_foreign_or_full500_command_rejected_before_query(self):
        changes = [lambda c: c.update(mode='full500'), lambda c: c['target'].update(database='postgres'),
                   lambda c: c['slot']['plan'].update(operationId='localUnitDiagnostic-' + 'b' * 32),
                   lambda c: c['source'].update(sourceIndex=0), lambda c: c['source'].update(diagnosticUnit=499),
                   lambda c: c['limits'].update(production=True), lambda c: c['limits'].update(paidProviderCallsAllowed=True),
                   lambda c: c['drafts'][0]['profile'].update(id='different'), lambda c: c['units'].append(copy.deepcopy(c['units'][0]))]
        for change in changes:
            f = Fixture(); change(f.command)
            self.rejected(f)
            self.assertTrue(not f.calls)

    def test_duplicate_null_invalid_utf8_and_hash_are_rejected(self):
        for text in ('{}', 'null', '{"mode":1,"mode":2}', '\ud800'):
            f = Fixture()
            self.rejected(f, command_canonical=text, command_sha256='0' * 64)
            self.assertTrue(not f.calls)
        f = Fixture(); self.rejected(f, command_sha256='0' * 64)
        self.assertTrue(not f.calls)

    def test_source_uid_and_private_credential_inputs_are_not_bypass_flags(self):
        f = Fixture()
        with mock.patch.object(f.m.os, 'getuid', return_value=0):
            with self.assertRaisesRegex(f.m.ReadClosureError, 'source-local-uid'):
                f.m._inputs(f.database, f.operation, f.text(), f.digest(), f.pins, f.password)
        for value in (None, '0' * 64, 'G' * 64, "';COMMIT;--"):
            f = Fixture(); self.rejected(f, authenticator_password_hex=value)
            self.assertTrue(not f.calls)
        for change in (lambda c: c['limits'].update(units=True), lambda c: c['source'].update(diagnosticUnit=False),
                       lambda c: c['drafts'][0]['sources']['documents'].append({'id': 'offline-document'})):
            f = Fixture(); change(f.command); self.rejected(f)
            self.assertTrue(not f.calls)

    def test_source_pin_shape_missing_and_changed_bytes_are_rejected(self):
        for change in (lambda p: p.pop(next(iter(p))), lambda p: p[next(iter(p))].update(bytes=True),
                       lambda p: p[next(iter(p))].update(sha256='0' * 64), lambda p: p[next(iter(p))].update(path='/tmp/unreviewed.sql')):
            f = Fixture(); change(f.pins); self.rejected(f); self.assertTrue(not f.calls)

    def test_even_a_fresh_whole_file_hash_cannot_replace_original_prosrc(self):
        f = Fixture()
        with tempfile.TemporaryDirectory(prefix='helmut-read-closure-offline-') as directory:
            for relative, pin in f.pins.items():
                p = Path(directory) / relative
                p.parent.mkdir(parents=True, exist_ok=True)
                data = Path(pin['path']).read_bytes()
                if relative == f.m.BOUNDED:
                    data = data.replace(b'atomic-usage-read-input', b'atomic-usage-read-input-modified', 1)
                p.write_bytes(data)
                pin.update(path=str(p), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            self.rejected(f)
            self.assertTrue(not f.calls)

    def test_symlink_source_cannot_supply_pinned_bytes(self):
        f = Fixture()
        with tempfile.TemporaryDirectory(prefix='helmut-read-closure-link-') as directory:
            relative = f.m.PARTS
            p = Path(directory) / relative
            p.parent.mkdir(parents=True)
            p.symlink_to(f.pins[relative]['path'])
            f.pins[relative]['path'] = str(p)
            self.rejected(f)
            self.assertTrue(not f.calls)

    def test_live_catalog_function_mutations_block_before_install(self):
        for field, value in [('oid', '0'), ('identityArguments', 's text'), ('prosrcSHA256', '0' * 64),
                             ('securityDefiner', True), ('securityDefiner', None), ('volatility', 'v'),
                             ('config', None), ('returnType', 'text'), ('language', 'sql')]:
            f = Fixture(); f.catalog['functions'][0][field] = value
            self.rejected(f)
            self.assertTrue(len(f.calls) == 1)
        for change in (lambda a: a.pop(), lambda a: a.append(copy.deepcopy(a[0])), lambda a: a[1].update(oid=a[0]['oid'])):
            f = Fixture(); change(f.catalog['functions']); self.rejected(f)
            self.assertTrue(len(f.calls) == 1)

    def test_catalog_database_command_auth_and_security_drift_cannot_pass(self):
        for field, value in [('database', 'postgres'), ('commandHash', '0' * 64), ('authHash', '0' * 64),
                             ('databaseOID', '99999'), ('securityHash', 'c' * 64)]:
            f = Fixture()
            def drift(db, sql, label):
                value0 = f.query(db, sql, label)
                if label == 'READ_CLOSURE_FRESH_READBACK':
                    value0[field] = value
                return value0
            self.rejected(f, drift)
            self.assertTrue(len(f.calls) == 3)

    def test_unknown_callback_output_is_terminal_and_never_retried(self):
        for broken in (lambda *args: (_ for _ in ()).throw(RuntimeError('private-content-does-not-escape')),
                       lambda *args: '{"schema":1,"schema":2}', lambda *args: b'\xff', lambda *args: 'x' * 65537):
            f = Fixture(); calls = []
            def callback(*args):
                calls.append(1)
                return broken(*args)
            self.rejected(f, callback); self.rejected(f, callback)
            self.assertTrue(len(calls) == 1)
        f = Fixture()
        def lost(db, sql, label):
            if label == 'READ_CLOSURE_INSTALL':
                f.calls.append((db, sql, label))
                raise RuntimeError('private-outcome-unknown')
            return f.query(db, sql, label)
        self.rejected(f, lost); self.rejected(f)
        self.assertTrue(len(f.calls) == 2)

    def test_callback_dictionary_aliases_do_not_rewrite_prior_native_pins(self):
        f = Fixture()
        def alias(db, sql, label):
            f.calls.append((db, sql, label))
            if label != 'READ_CLOSURE_SOURCE_CATALOG':
                f.catalog['databaseOID'] = '55555'
            return f.catalog
        self.rejected(f, alias)
        self.assertTrue(len(f.calls) == 2)

    def test_only_callback_executes_sql_and_native_denials_are_not_mock_flags(self):
        f = Fixture(); f.run()
        sql = f.calls[1][1]
        self.assertTrue(sql.count('BEGIN;SET LOCAL') == 1 and sql.count('COMMIT;') == 1)
        self.assertTrue(sql.index('COMMIT;') < sql.rindex("SELECT jsonb_build_object('schema'"))
        self.assertTrue(sql.count('CREATE POLICY local_unit_source_read') == 7 and sql.count('INSERT INTO helmut_unit_diagnostic.legacy_read_rpcs(') == 6)
        self.assertTrue(sql.count('GRANT EXECUTE ON FUNCTION public.helmut_auth_') == 6)
        for marker in ('REVOKE SELECT ON ALL TABLES IN SCHEMA public', 'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
                       'SAVEPOINT read_closure_probes', 'ROLLBACK TO SAVEPOINT read_closure_probes',
                       'EXCEPTION WHEN insufficient_privilege', 'PERFORM helmut_unit_diagnostic.runtime_role()',
                       'read-closure-actual-selected-rows', 'oidvectortypes(p.proargtypes)', 'pg_catalog.',
                       'read-closure-original-column-type', 'read-closure-native-source-insert-guard', 'checks<>49'):
            self.assertTrue(marker in sql)
        self.assertTrue(sql.count('SELECT NULL::text WHERE false') == 7 and 'create or replace function' not in sql.lower())
        self.assertTrue('SET LOCAL ROLE helmut_ud_owner_' in sql and 'SET SESSION AUTHORIZATION helmut_ud_authenticator_' in sql)
        self.assertTrue('helmut_auth_control_read_v1' not in sql)

    def test_sql_literals_and_template_tokens_cannot_become_caller_sql(self):
        f = Fixture()
        subject = "OWNER'); COMMIT; -- COMMAND_TEXT"
        f.command['units'][0]['subject'] = subject
        f.command['drafts'][0]['profile']['id'] = subject
        f.catalog['commandHash'] = f.digest()
        f.run()
        sql = f.calls[1][1]
        self.assertTrue("OWNER''); COMMIT; -- COMMAND_TEXT" in sql)
        self.assertTrue(sql.count('\nCOMMIT;') == 1)

    def test_no_unprivileged_login_or_native_acceptance_is_claimed(self):
        f = Fixture(); result = f.run()
        self.assertTrue(result['probeSessionOrigin'] == 'initial-postgres-with-set-session-authorization')
        self.assertTrue(not any(k in result for k in ('qualified', 'authority', 'unit60', 'full500', 'nativeAccepted')))
        self.assertTrue(not hasattr(f.m, 'main'))

    def test_registry_projection_and_exact_columns_match_actual_store_source(self):
        f = Fixture(); f.run()
        source = (HERE / 'local-unit-diagnostic-store.sql').read_text()
        body = source.split('create table helmut_unit_diagnostic.legacy_read_rpcs(', 1)[1].split('\n);', 1)[0]
        actual = tuple(re.findall(r'^  ([a-z_][a-z0-9_]*) (text|boolean|oid|jsonb)\b', body, re.M))
        self.assertEqual(actual, f.m.REGISTRY_COLUMNS)
        self.assertEqual(len(actual), 6)
        self.assertEqual(set(re.findall(r"'([a-z_][a-z0-9_]*)',q\.", f.m.REGISTRY_ROW_SQL)), {name for name, _ in actual})
        self.assertIn("'function_oid',q.function_oid::bigint", f.m.REGISTRY_ROW_SQL)
        for _, sql, _ in f.calls:
            self.assertNotIn('to_jsonb(q)', sql)
            self.assertIn("'registry'", sql)
            self.assertIn(f.m.REGISTRY_ROW_SQL, sql)
            self.assertIn('read-closure-exact-registry-columns', sql)
            self.assertIn("'helmut_unit_diagnostic.legacy_read_rpcs'::regclass AND attnum>0)<>6", sql)
            self.assertIn("(3,'function_oid','pg_catalog.oid'::regtype)", sql)
            self.assertIn("(2,'http_exposed','pg_catalog.bool'::regtype)", sql)
            self.assertNotIn("'pg_catalog.boolean'::regtype", sql)
            # The guard also has a PL/pgSQL record `e`, whose last shape is
            # (nam,args,sha,vol). A SQL alias e(num,nam,typ) binds to that record
            # and fails before any registry check can run on PostgreSQL 17.
            self.assertIn('registry_column_expected(num,nam,typ)', sql)
            self.assertNotIn(' e(num,nam,typ)', sql)
            for marker in ('a.attname IS DISTINCT FROM registry_column_expected.nam', 'a.atttypid IS DISTINCT FROM registry_column_expected.typ',
                           'a.atttypmod IS DISTINCT FROM -1', 'a.attnotnull IS DISTINCT FROM true',
                           'a.attisdropped IS DISTINCT FROM false', "a.attidentity IS DISTINCT FROM ''", "a.attgenerated IS DISTINCT FROM ''"):
                self.assertIn(marker, sql)

    def test_max_unsigned_oid_stays_numeric_in_closed_expected_registry(self):
        f = Fixture(); f.catalog['functions'][0]['oid'] = '4294967295'; f.run()
        sql = f.calls[1][1]
        # This checks the emitted ABI, not PostgreSQL execution. Generic OID
        # row JSON and the explicit bigint projection must not be confused.
        self.assertIn('4294967295::oid', sql)
        self.assertIn('"function_oid":4294967295', sql)
        self.assertNotIn('"function_oid":"4294967295"', sql)
        self.assertNotIn('q.function_oid::integer', sql)
        self.assertIn('read-closure-registry-oid-bigint-codec', sql)

    def test_codec_mini_probe_is_closed_readonly_and_never_runs_itself(self):
        f = Fixture()
        sql = f.m.registry_codec_probe_sql()
        self.assertEqual(f.calls, [])
        self.assertTrue(sql.startswith('BEGIN READ ONLY;') and sql.endswith('COMMIT;\n'))
        for marker in ('to_jsonb(1::oid)', 'to_jsonb((1::oid)::bigint)', 'jsonb_typeof',
                       'explicitProjectionMatches', 'maxOIDPreserved', "('4294967295'::oid)::bigint"):
            self.assertIn(marker, sql)
        self.assertNotRegex(sql, r'(?i)\b(?:CREATE|INSERT|UPDATE|DELETE|ALTER|GRANT|PASSWORD)\b')
        self.assertNotIn('helmut_unit_diagnostic.', sql)
        self.assertNotIn('public.', sql)
        self.assertNotIn(f.password, sql)


if __name__ == '__main__':
    unittest.main()
