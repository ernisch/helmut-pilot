"""Offline mutation tests only: callbacks are metadata mocks, NEVER a SQL runner.

Actual repository SQL/JS bytes supply source expectations. No graph, auth data,
authority, credential, process, socket or database is created by these tests.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
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
                'negativeChecks': 11 if installed else 0}

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
        self.assertEqual(result['executedNegativeChecks'], 22)
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

    def test_writer_and_runtime_xmin_grants_are_columns_only(self):
        f = Fixture()
        proposal = (REPO / f.m.PROPOSAL).read_text()
        grants = re.findall(r"execute format\('(grant [^']+ on public\.(?:helmut_store|briefings) to %I)',(writer|runtime_name)\);", proposal)
        self.assertCountEqual(grants, [
            ('grant select(id,data,xmin),update(data) on public.helmut_store to %I', 'writer'),
            ('grant select(id,user_id,slot,generated_at,payload,xmin),insert(id,user_id,slot,generated_at,payload) on public.briefings to %I', 'writer'),
            ('grant insert(id,data) on public.helmut_store to %I', 'writer'),
            ('grant select(id,data) on public.helmut_store to %I', 'runtime_name'),
            ('grant select(id,user_id,slot,generated_at,payload,xmin) on public.briefings to %I', 'runtime_name')])
        self.assertIn('nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', proposal)
        self.assertIn("create policy original_bridge_auth_read on public.helmut_store for select to %I using(id=''main-auth'')", proposal)
        self.assertIn('original-bridge-role-membership-forbidden', proposal)
        # The compiler still requires actual row xmin and unchanged auth metadata.
        compiler = (REPO / f.m.COMPILER).read_text()
        self.assertIn('SELECT data,xmin::text INTO STRICT a,auth_xmin FROM public.helmut_store', compiler)
        self.assertIn('original_xmin IS DISTINCT FROM mod(pg_current_xact_id()', compiler)
        self.assertIn('after_meta IS DISTINCT FROM before_meta', compiler)

    def test_acl_guard_checks_exact_system_and_user_columns_without_table_select(self):
        f = Fixture()
        sql = f.m._security_sql(f.database)
        allowed_text = re.search(r"allowed jsonb:='([^']+)'::jsonb", sql).group(1)
        allowed = json.loads(allowed_text)
        self.assertEqual(allowed['helmut_store'], {'SELECT': ['id', 'data', 'xmin'], 'INSERT': ['id', 'data'], 'UPDATE': ['data']})
        self.assertEqual(allowed['briefings'], {'SELECT': ['id', 'user_id', 'slot', 'generated_at', 'payload', 'xmin'],
                                              'INSERT': ['id', 'user_id', 'slot', 'generated_at', 'payload']})
        self.assertIn('attnum<>0 AND NOT attisdropped', sql)
        self.assertIn('FOR col IN SELECT attname,attnum FROM pg_attribute WHERE attrelid=t.oid AND attnum<>0 AND NOT attisdropped', sql)
        self.assertIn('has_column_privilege(w,t.oid,col.attnum,priv) IS DISTINCT FROM', sql)
        self.assertIn("has_table_privilege(r,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')", sql)
        self.assertIn("has_function_privilege(r,'public.helmut_auth_state_cas_v1(jsonb)','EXECUTE')", sql)
        self.assertIn('NOT admin_option AND NOT inherit_option AND set_option', sql)

    def test_actual_writer_consumer_probe_is_readonly_empty_and_principal_bound(self):
        f = Fixture()
        sql = f.m._writer_read_probe_sql(f.database)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertTrue(sql.endswith('RESET SESSION AUTHORIZATION;ROLLBACK;\n'))
        self.assertIn('SET SESSION AUTHORIZATION helmut_ud_bridge_writer_' + 'a' * 32 + ';', sql)
        self.assertIn('session_user IS DISTINCT FROM', sql)
        self.assertIn('current_user IS DISTINCT FROM session_user', sql)
        self.assertIn("current_setting('transaction_read_only')<>'on'", sql)
        self.assertIn("current_setting('row_security')<>'on'", sql)
        self.assertIn('rolsuper OR rolbypassrls OR rolcanlogin OR rolinherit', sql)
        self.assertIn('AND relrowsecurity AND relowner<>', sql)
        reads = re.findall(r'PERFORM ([^;]+) FROM public\.([a-z_]+) LIMIT 0;', sql)
        self.assertCountEqual(reads, [('id,data,xmin::text', 'helmut_store'),
                                     ('id,user_id,slot,generated_at,payload,xmin::text', 'briefings'),
                                     ('updated_at', 'helmut_store'), ('created_at', 'briefings'),
                                     ('xmax', 'helmut_store'), ('xmax', 'briefings')])
        self.assertEqual(sql.count("EXCEPTION WHEN insufficient_privilege THEN NULL;END;"), 4)
        self.assertNotRegex(sql, r'\b(INSERT|UPDATE|DELETE|CREATE|GRANT|COMMIT)\b')
        self.assertNotIn('main-auth', sql)
        self.assertNotIn('original_bridge_args', sql)

    def test_writer_read_consumer_probe_runs_after_install_and_before_each_qualification(self):
        f = Fixture(); f.run()
        before, install, fresh = [call[1] for call in f.calls]
        probe = f.m._writer_read_probe_sql(f.database)
        self.assertNotIn(probe, before)
        self.assertEqual(install.count(probe), 1)
        self.assertEqual(fresh.count(probe), 1)
        self.assertLess(install.index((REPO / f.m.PROPOSAL).read_text()), install.index(probe))
        self.assertLess(install.index(probe), install.index('DO $bridge_acl$'))
        self.assertTrue(fresh.startswith(probe))
        for sql in (install, fresh):
            self.assertLess(sql.index(probe), sql.index('DO $runtime_probe$'))
            self.assertLess(sql.index(probe), sql.index("'helmut-local-unit-native-bridge-catalog/1'"))

    def test_unconfirmed_actual_writer_read_never_returns_qualification_or_retries(self):
        for failed_label in ('BRIDGE_INSTALL_AND_QUALIFY', 'BRIDGE_FRESH_READBACK'):
            f = Fixture()
            def permission_error(db, sql, label):
                f.calls.append((db, sql, label))
                if label == failed_label:
                    self.assertIn(f.m._writer_read_probe_sql(db), sql)
                    raise PermissionError('untrusted-native-error-detail')
                return f.catalog(label != 'BRIDGE_SOURCE_CATALOG')
            self.rejected(f, permission_error)
            calls = len(f.calls)
            self.rejected(f)
            self.assertEqual(len(f.calls), calls)
            self.assertEqual(calls, 2 if failed_label == 'BRIDGE_INSTALL_AND_QUALIFY' else 3)

    def test_runtime_invoker_receipt_read_gets_xmin_but_no_extra_columns_or_writes(self):
        f = Fixture()
        proposal = (REPO / f.m.PROPOSAL).read_text()
        receipt = f.m._definitions(proposal)['helmut_unit_diagnostic.original_bridge_receipt_v1']
        self.assertEqual(receipt['prosrcSHA256'], f.helpers['helmut_unit_diagnostic.original_bridge_receipt_v1']['prosrcSHA256'])
        self.assertRegex(proposal, r'original_bridge_receipt_v1\([^\n]+\) returns void\nlanguage plpgsql stable security invoker')
        self.assertIn('into strict actual_body,actual_time,original_xmin from public.briefings t', proposal)
        compiler = (REPO / f.m.COMPILER).read_text()
        self.assertIn('SET SESSION AUTHORIZATION ${auth};\nSET LOCAL ROLE ${runtime};', compiler)
        self.assertIn('ack:=public.local_unit_diagnostic_artifact_insert_v1(', compiler)
        guards = (REPO / f.m.STORE).read_text()
        self.assertIn("helmut_unit_diagnostic.sha(j->>'claimId'),'artifact',own_row.body_hash,own_row.revision", guards)
        runtime_grants = re.findall(r"execute format\('(grant [^']+)',runtime_name\);", proposal)
        self.assertCountEqual(runtime_grants, ['grant select(id,data) on public.helmut_store to %I',
            'grant select(id,user_id,slot,generated_at,payload,xmin) on public.briefings to %I'])
        self.assertFalse(any(re.search(r'\b(?:update|insert|delete|truncate|references|trigger)\b', g) for g in runtime_grants))
        acl = f.m._security_sql(f.database)
        self.assertIn("has_table_privilege(r,'public.briefings','SELECT')", acl)
        self.assertIn('actual_runtime_column.attnum<>0 AND NOT actual_runtime_column.attisdropped', acl)
        self.assertIn("actual_runtime_column.attname IN('id','user_id','slot','generated_at','payload')", acl)
        self.assertIn("actual_runtime_column.attnum<0 AND actual_runtime_column.attname='xmin'", acl)
        self.assertIn('original-bridge-runtime-receipt-columns', acl)

    def test_runtime_read_probe_uses_real_authenticator_role_readonly_and_empty_read(self):
        f = Fixture(); sql = f.m._runtime_read_probe_sql(f.database)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog;SET LOCAL row_security=on;'))
        self.assertTrue(sql.endswith('RESET ROLE;RESET SESSION AUTHORIZATION;ROLLBACK;\n'))
        self.assertIn("session_user<>'postgres' OR current_user<>session_user", sql)
        self.assertIn('SET SESSION AUTHORIZATION helmut_ud_authenticator_' + 'a' * 32 + ';SET LOCAL ROLE helmut_ud_runtime_' + 'a' * 32 + ';', sql)
        self.assertIn('PERFORM helmut_unit_diagnostic.runtime_role();', sql)
        self.assertIn("session_user IS DISTINCT FROM 'helmut_ud_authenticator_", sql)
        self.assertIn("current_user IS DISTINCT FROM 'helmut_ud_runtime_", sql)
        self.assertIn("current_setting('transaction_read_only')<>'on'", sql)
        self.assertIn("current_setting('row_security')<>'on'", sql)
        self.assertIn('AND relrowsecurity AND relowner<>', sql)
        reads = re.findall(r'PERFORM ([^;]+) FROM public\.([a-z_]+) LIMIT 0;', sql)
        self.assertCountEqual(reads, [('id,data,xmin::text', 'helmut_store'),
                                     ('id,user_id,slot,generated_at,payload,xmin::text', 'briefings'),
                                     ('created_at', 'briefings'), ('xmax', 'briefings')])
        self.assertIn("oid IN('public.briefings'::regclass,'public.helmut_store'::regclass)", sql)
        self.assertIn('rolname=current_user))<>2', sql)
        self.assertEqual(sql.count('EXCEPTION WHEN insufficient_privilege THEN NULL;END;'), 2)
        self.assertNotRegex(sql, r'\b(?:INSERT|UPDATE|DELETE|CREATE|GRANT|COMMIT)\b')
        self.assertNotIn('original_bridge_args', sql)
        self.assertNotIn('original_bridge_receipt_v1(', sql)
        self.assertNotRegex(sql, r'@[A-Z_]+@')

    def test_runtime_read_is_after_install_before_both_catalogs_and_write_denial_is_counted(self):
        f = Fixture(); result = f.run()
        before, install, fresh = [call[1] for call in f.calls]
        probe = f.m._runtime_read_probe_sql(f.database)
        self.assertNotIn(probe, before)
        self.assertLess(install.index((REPO / f.m.PROPOSAL).read_text()), install.index(probe))
        for sql in (install, fresh):
            self.assertEqual(sql.count(probe), 1)
            self.assertLess(sql.index(f.m._writer_read_probe_sql(f.database)), sql.index(probe))
            self.assertLess(sql.index(probe), sql.index('DO $bridge_acl$'))
            self.assertLess(sql.index(probe), sql.index('DO $runtime_probe$'))
            self.assertLess(sql.index(probe), sql.index("'helmut-local-unit-native-bridge-catalog/1'"))
        negatives, count = f.m._probes_sql(f.database, f.digest())
        self.assertEqual(count, 11)
        self.assertEqual(negatives.count('EXCEPTION WHEN insufficient_privilege THEN checks:=checks+1;END;'), 10)
        self.assertIn("EXECUTE 'UPDATE public.briefings SET payload=payload WHERE false'", negatives)
        self.assertIn("SQLERRM<>'original-bridge-root-temp-relations-required'", negatives)
        self.assertEqual(result['executedNegativeChecks'], 22)

    def test_unknown_runtime_read_permission_or_role_outcome_never_returns_or_retries(self):
        for failed_label in ('BRIDGE_INSTALL_AND_QUALIFY', 'BRIDGE_FRESH_READBACK'):
            f = Fixture()
            def denied(db, sql, label):
                f.calls.append((db, sql, label))
                if label == failed_label:
                    self.assertIn(f.m._runtime_read_probe_sql(db), sql)
                    raise PermissionError('private-runtime-receipt-read-error')
                return f.catalog(label != 'BRIDGE_SOURCE_CATALOG')
            self.rejected(f, denied)
            count = len(f.calls)
            self.rejected(f, denied)
            self.assertEqual(len(f.calls), count)
            self.assertEqual(count, 2 if failed_label == 'BRIDGE_INSTALL_AND_QUALIFY' else 3)


if __name__ == '__main__':
    unittest.main()
