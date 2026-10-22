"""Pure protocol/SQL/closure mutations only; no PG/container/service starts.

The fixture catalog/source observer/host results are explicitly mocked. They are
not native observations, authority, source provenance or performance evidence.
The real pinned Worker.query consumer executes with its capture mocked, so no
database connection or process is opened by these tests.
"""
import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
HOST_CALLS = []
HOST_RETURN = None
HOST_ERROR = False


def offline_host_guard(**kwargs):
    HOST_CALLS.append(kwargs)
    if HOST_ERROR:
        raise RuntimeError('offline host guard rejected')
    return HOST_RETURN


def load(filename, name):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pin(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class LedgerStat:
    def __init__(self, actual, uid):
        self.actual, self.st_uid = actual, uid

    def __getattr__(self, key):
        return getattr(self.actual, key)


class Fixture:
    def __init__(self):
        global HOST_RETURN, HOST_ERROR
        HOST_RETURN, HOST_ERROR = None, False
        HOST_CALLS.clear()
        self.m = load('local-unit-native-observation-updater.py', 'observation_offline')
        self.worker = load('local-unit-native-worker.py', 'observation_worker_offline')
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.ledger = self.root / 'ledger'
        self.ledger.mkdir(mode=0o700)
        self.ledger_uid = self.ledger_entry_uid = 1000
        self.at = datetime.datetime(2026, 10, 22, 12, 0, 10, 100000, datetime.timezone.utc)
        self.previous = {'ordinal': 7, 'proofHash': 'f' * 64, 'observedAtUTC': '2026-10-22T12:00:05.100Z'}
        self.b = {'schema': 'helmut-local-unit-observation-baseline/1',
                  'database': 'helmut_unit_diagnostic_' + 'a' * 32, 'databaseOID': '12345',
                  'operationId': 'localUnitDiagnostic-' + 'a' * 32, 'commandHash': None,
                  'initialTip': copy.deepcopy(self.previous), 'attemptDirectory': str(self.ledger),
                  'hostVerifierFunction': 'offline_host_guard',
                  'pins': {'observer': pin(HERE / 'local-unit-native-source-qualification.py'),
                           'query': pin(HERE / 'local-unit-native-worker.py'), 'hostVerifier': pin(__file__)},
                  'files': []}
        native = [{'signature': 'helmut_unit_diagnostic.offline_' + str(i) + '()', 'sha256': str(i % 10) * 64}
                  for i in range(36)]
        self.b['catalog'] = {'database': self.b['database'], 'databaseOID': self.b['databaseOID'],
                             'functions': native, 'relations': [], 'roles': [{}, {}, {}, {}], 'memberships': [],
                             'schemas': [], 'databaseACL': {}, 'readRegistry': [{'http_exposed': i < 2} for i in range(6)]}
        code_files = [pin(HERE / 'local-unit-native-observation-updater.py')] + list(self.b['pins'].values())
        runtime_file = self.file('offline-runtime', b'offline, not an executable provenance claim')
        code = self.metadata('CODE_MANIFEST.SAFE.json', {'schema': 'helmut-local-unit-diagnostic-code-manifest/1', 'files': code_files})
        runtime = self.metadata('RUNTIME_MANIFEST.SAFE.json', {'schema': 'helmut-local-unit-diagnostic-runtime-manifest/1',
                               'database': self.b['database'], 'sqlSources': {f['signature']: f['sha256'] for f in native},
                               'files': [runtime_file], 'transport': {'fixture': 'offline-only'}})
        gates = {g: self.file('gate-' + g, ('offline-' + g).encode()) for g in self.m.GATES}
        command = {'version': 'helmut-local-unit-diagnostic-command/1', 'mode': 'D-R-1-local-fixture',
                   'source': {'sourceIndex': 499, 'diagnosticUnit': 0}, 'target': {'database': self.b['database']},
                   'calendar': {'endsAtUTC': '2026-10-22T12:01:00.100Z'}, 'drafts': [{}], 'units': [{}],
                   'slot': {'plan': {'operationId': self.b['operationId'], 'runtimeManifestHash': runtime['sha256']}},
                   'limits': {'unitMs': 60000, 'authMs': 30000, 'controlsPerUnit': 16, 'units': 1,
                              'production': False, 'paidProviderCallsAllowed': False}, 'gatePins': gates}
        self.b['commandHash'] = self.m._sha(self.m._json(command))
        admission = {'commandHash': self.b['commandHash'], 'grantId': 'b' * 64, 'expiresAtUTC': command['calendar']['endsAtUTC']}
        self.b['authority'] = {'grantId': 'b' * 64, 'commandCanonical': self.m._json(command),
                               'admissionCanonical': self.m._json(admission), 'admissionHash': self.m._sha(self.m._json(admission)),
                               'sourceHash': 'c' * 64, 'targetHash': 'd' * 64, 'postrunHash': 'e' * 64,
                               'sourceProofHash': 'f' * 64, 'verifierCodeHash': code_files[0]['sha256'],
                               'codeManifestPin': code, 'runtimeManifestPin': runtime,
                               'gateHashes': {g: p['sha256'] for g, p in gates.items()},
                               'requestModels': {'D': 'gpt-5-mini', 'R': 'gpt-5-mini'},
                               'verifiedAtUTC': '2026-10-22T12:00:00.100Z', 'expiresAtUTC': command['calendar']['endsAtUTC']}
        self.b['sourceBinding'] = {'schema': 'helmut-local-unit-original-source-binding/1',
                                   **{k: self.b[k] for k in ('operationId', 'commandHash', 'database')},
                                   'socketPath': '/ram/helmut-original-write-bridge.sock',
                                   'service': {'uid': 1000}, 'supervisor': {'uid': 1000}}
        # metadata() registered the two physical manifest bindings already.
        for p in code_files + [runtime_file] + list(gates.values()):
            self.b['files'].append({'logical': p, 'physical': p})
        self.calls, self.mutation = [], None
        self.unknown = False

    def file(self, name, raw):
        path = self.root / name
        path.write_bytes(raw)
        path.chmod(0o600)
        return pin(path)

    def metadata(self, name, value):
        physical = self.file(name, self.m._json(value).encode())
        logical = {**physical, 'path': '/workspace/helmut-unit-diagnostic-native/' + 'a' * 32 + '/' + name}
        self.b['files'].append({'logical': logical, 'physical': physical})
        return logical

    def capture(self, argv, label, *, data):
        sql = data.decode()
        self.calls.append((argv, sql, label))
        if self.unknown:
            raise RuntimeError('offline exit/EOF/commit not confirmed')
        match = re.search(r"VALUES\('([a-f0-9]{64})','(\{[^\n]*\})','([a-f0-9]{64})','([^']+)'::timestamptz\)", sql)
        if not match:
            raise RuntimeError('offline closed insert not found')
        scope, canonical, digest, at = match.groups()
        # Our proof contains only closed ASCII values, no SQL apostrophes.
        proof = json.loads(canonical)
        previous_text = re.search(r"'previous','(\{[^']+\})'::jsonb", sql)[1]
        previous = json.loads(previous_text)
        value = {'schema': 'helmut-local-unit-observation-append-ack/1',
                 **{k: self.b[k] for k in ('database', 'databaseOID', 'operationId', 'commandHash')},
                 'previous': previous, 'canonical': canonical,
                 'tip': {'ordinal': previous['ordinal'] + 2, 'proofHash': digest, 'observedAtUTC': at}}
        if self.mutation:
            value = self.mutation(value)
        return value.encode() if type(value) is str else self.m._json(value).encode()

    def run(self, *, previous=None, host=None, source=None, **changes):
        self.b.update(changes)
        # CI's tempfile owner need not be the SOURCE actor. Model only this
        # synthetic ledger's owner; retain real inode/mode/link/byte metadata
        # and leave every file outside the ledger untouched.
        def ledger_stat(value):
            key = (value.st_dev, value.st_ino)
            directory = self.ledger.lstat()
            if key == (directory.st_dev, directory.st_ino):
                return LedgerStat(value, self.ledger_uid)
            for path in self.ledger.iterdir():
                entry = path.lstat()
                if key == (entry.st_dev, entry.st_ino):
                    return LedgerStat(value, self.ledger_entry_uid)
            return value
        class ActorPath(type(Path())):
            def lstat(path, *args, **kwargs):
                return ledger_stat(super().lstat(*args, **kwargs))
        actor_os = types.SimpleNamespace(**vars(os))
        actor_os.getuid = actor_os.geteuid = actor_os.getgid = actor_os.getegid = lambda: 1000
        actor_os.fstat = lambda *a, **k: ledger_stat(os.fstat(*a, **k))
        actor_os.stat = lambda *a, **k: ledger_stat(os.stat(*a, **k))
        with mock.patch.object(self.m, 'os', actor_os), \
             mock.patch.object(self.m, 'Path', ActorPath), \
             mock.patch.object(self.m, '_now', return_value=self.at), \
             mock.patch.object(self.m, '_source', side_effect=source or (lambda *_: 'a' * 64)), \
             mock.patch.object(self.worker, 'capture', side_effect=self.capture):
            return self.m.append_observation(self.worker.query, baseline=self.b, source_observer=object(),
                                             verify_host_and_closure=host or offline_host_guard,
                                             expected_previous=previous or self.previous)

    def close(self):
        self.temporary.cleanup()


class ObservationChecks(unittest.TestCase):
    def fixture(self):
        f = Fixture()
        self.addCleanup(f.close)
        return f

    def rejects(self, f, **kwargs):
        with self.assertRaisesRegex(f.m.ObservationError, '^native-observation-not-confirmed-no-retry$'):
            f.run(**kwargs)

    def test_exact_proof_real_query_consumer_and_postcommit_ack(self):
        f = self.fixture()
        result = f.run()
        self.assertEqual(result['tip']['ordinal'], 9)  # Identity gaps are legal.
        argv, sql, label = f.calls[0]
        self.assertIn('ON_ERROR_STOP=1', argv)
        self.assertEqual(sql.count('INSERT INTO '), 1)
        self.assertEqual(sql.count('\nCOMMIT;'), 1)
        self.assertLess(sql.index('FOR UPDATE'), sql.index('INSERT INTO'))
        self.assertLess(sql.index('COMMIT;'), sql.rindex("SELECT jsonb_build_object('schema'"))
        self.assertIn('observation-native-catalog-drift', sql)
        self.assertIn('RESET SESSION AUTHORIZATION;', sql)
        self.assertNotIn('@CATALOG', sql)
        self.assertEqual(len(HOST_CALLS), 2)
        self.assertEqual(set(HOST_CALLS[0]), {'observed_at_utc', 'sample_started_ns', 'baseline_hash'})
        self.assertTrue(label.startswith('RUNTIME_OBSERVATION_'))
        committed = next(f.ledger.glob('*.COMMITTED.PRIVATE.json'))
        stored = json.loads(committed.read_text())
        self.assertEqual(set(json.loads(stored['ack']['canonical'])), f.m.PROOF_KEYS)
        self.assertFalse(result['audit']['unitExecutionQualified'])
        self.assertFalse(result['audit']['full500Qualified'])
        self.assertFalse(result['audit']['reserveQualified'])
        self.assertEqual(committed.stat().st_mode & 0o777, 0o600)

    def test_monotonic_confirmed_chain_survives_module_reload(self):
        f = self.fixture()
        first = f.run()
        f.m = load('local-unit-native-observation-updater.py', 'observation_reload')
        f.at += datetime.timedelta(seconds=5)
        second = f.run(previous=first['tip'])
        self.assertEqual(second['tip']['ordinal'], 11)
        self.assertEqual(len(f.calls), 2)
        self.assertEqual(len(list(f.ledger.glob('*.COMMITTED.PRIVATE.json'))), 2)

    def test_unknown_query_is_durable_terminal_no_retry(self):
        f = self.fixture(); f.unknown = True
        self.rejects(f)
        self.assertEqual(len(f.calls), 1)
        self.assertTrue((f.ledger / 'SEALED.PRIVATE.json').is_file())
        f.m = load('local-unit-native-observation-updater.py', 'observation_unknown_reload')
        f.unknown = False
        self.rejects(f)
        self.assertEqual(len(f.calls), 1)

    def test_foreign_ledger_directory_or_entry_owner_is_rejected(self):
        for uid in (0, 1001):
            with self.subTest(uid=uid, kind='directory'):
                f = self.fixture(); f.ledger_uid = uid
                self.rejects(f)
                self.assertFalse(f.calls)
            with self.subTest(uid=uid, kind='entry'):
                f = self.fixture(); first = f.run()
                f.m = load('local-unit-native-observation-updater.py', 'observation_foreign_owner')
                f.at += datetime.timedelta(seconds=5)
                f.ledger_entry_uid = uid
                self.rejects(f, previous=first['tip'])
                self.assertEqual(len(f.calls), 1)

    def test_partial_ack_duplicate_json_and_wrong_binding_are_terminal(self):
        mutations = [lambda v: '', lambda v: '{}', lambda v: 'true',
                     lambda v: '{"schema":1,"schema":2}',
                     lambda v: {**v, 'extra': True}, lambda v: {**v, 'commandHash': '0' * 64},
                     lambda v: {**v, 'canonical': '{}'},
                     lambda v: {**v, 'previous': {**v['previous'], 'ordinal': 1}},
                     lambda v: {**v, 'tip': {**v['tip'], 'ordinal': 7}},
                     lambda v: {**v, 'tip': {**v['tip'], 'ordinal': True}},
                     lambda v: {**v, 'tip': {**v['tip'], 'ordinal': 9007199254740992}},
                     lambda v: {**v, 'tip': {**v['tip'], 'proofHash': '0' * 64}}]
        for mutation in mutations:
            f = self.fixture(); f.mutation = mutation
            self.rejects(f)
            self.assertFalse(list(f.ledger.glob('*.COMMITTED.PRIVATE.json')))

    def test_bad_authority_scope_limits_gates_and_catalog_fail_before_query(self):
        mutations = [lambda b: b.update(extra=True), lambda b: b.update(database='postgres'),
                     lambda b: b.update(databaseOID='4294967296'),
                     lambda b: b['authority'].update(expiresAtUTC='2026-10-22T12:00:00.100Z'),
                     lambda b: b['authority'].update(sourceHash=''),
                     lambda b: b['authority']['gateHashes'].update(source='0' * 64),
                     lambda b: b['catalog']['readRegistry'].append({'http_exposed': False}),
                     lambda b: b['catalog'].update(databaseOID='99')]
        for change in mutations:
            f = self.fixture(); change(f.b)
            self.rejects(f)
            self.assertFalse(f.calls)

    def test_sample_interval_and_authority_are_not_extended(self):
        for seconds in (-1, 0, 15.001, 30):
            f = self.fixture()
            f.at = f.m._utc(f.previous['observedAtUTC']) + datetime.timedelta(seconds=seconds)
            self.rejects(f)
            self.assertFalse(f.calls)
        f = self.fixture(); f.at = f.m._utc(f.b['authority']['expiresAtUTC'])
        self.rejects(f)
        self.assertFalse(f.calls)

    def test_monotonic_deadline_cannot_be_renewed_by_wall_clock(self):
        f = self.fixture()
        ticks = iter([1, 2, f.m.MAX_NS + 2])
        with mock.patch.object(f.m.time, 'monotonic_ns', side_effect=lambda: next(ticks)):
            self.rejects(f)
        self.assertEqual(len(f.calls), 1)
        self.assertFalse(list(f.ledger.glob('*.COMMITTED.PRIVATE.json')))

    def test_host_flags_exception_and_postcommit_failure_never_succeed(self):
        global HOST_RETURN, HOST_ERROR
        f = self.fixture(); HOST_RETURN = {'qualified': True}
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture(); HOST_ERROR = True
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture()
        def source_side_effect(*_):
            if f.calls:
                raise RuntimeError('offline postcommit source changed')
            return 'a' * 64
        self.rejects(f, source=source_side_effect)
        self.assertEqual(len(f.calls), 1)
        self.assertFalse(list(f.ledger.glob('*.COMMITTED.PRIVATE.json')))

    def test_unpinned_wrapper_or_lambda_is_not_a_host_guard(self):
        f = self.fixture()
        self.rejects(f, host=lambda **_: None)
        self.assertFalse(f.calls)

    def test_fd_code_pin_detects_implementation_and_binding_drift(self):
        f = self.fixture()
        f.b['pins']['hostVerifier']['sha256'] = '0' * 64
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture()
        f.b['files'][0]['physical']['sha256'] = '0' * 64
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture()
        f.b['files'].append(copy.deepcopy(f.b['files'][0]))
        self.rejects(f); self.assertFalse(f.calls)

    def test_missing_extra_symlink_and_changed_closure_fail_closed(self):
        f = self.fixture(); f.b['files'].pop()
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture(); p = f.file('extra', b'offline extra')
        f.b['files'].append({'logical': p, 'physical': p})
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture(); row = f.b['files'][-1]
        Path(row['physical']['path']).write_bytes(b'changed')
        self.rejects(f); self.assertFalse(f.calls)
        f = self.fixture(); row = f.b['files'][-1]
        destination = f.root / 'alias'; destination.symlink_to(row['physical']['path'])
        row['physical']['path'] = str(destination)
        self.rejects(f); self.assertFalse(f.calls)

    def test_previous_tip_is_exact_after_restart(self):
        f = self.fixture(); first = f.run()
        f.m = load('local-unit-native-observation-updater.py', 'observation_stale_reload')
        f.at += datetime.timedelta(seconds=5)
        self.rejects(f, previous=f.previous)
        self.assertEqual(len(f.calls), 1)
        self.assertFalse(first['audit']['unitExecutionQualified'])

    def test_incomplete_or_modified_persistent_ledger_cannot_be_reconciled(self):
        f = self.fixture(); f.run()
        next(f.ledger.glob('*.COMMITTED.PRIVATE.json')).unlink()
        f.m = load('local-unit-native-observation-updater.py', 'observation_pending_reload')
        self.rejects(f); self.assertEqual(len(f.calls), 1)
        f = self.fixture(); f.run()
        (f.ledger / 'BASELINE.PRIVATE.json').write_text('{}')
        f.m = load('local-unit-native-observation-updater.py', 'observation_header_reload')
        self.rejects(f); self.assertEqual(len(f.calls), 1)

    def test_catalog_context_oid_codecs_and_no_legacy_write(self):
        f = self.fixture(); f.run()
        sql = f.calls[0][1]
        self.assertTrue(f.m.observation_catalog_sql().startswith('BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;'))
        self.assertIn('q.function_oid::bigint', sql)
        self.assertNotIn('to_jsonb(q)', sql)
        self.assertNotIn('SELECT c.oid,c.*', sql)
        self.assertIn('current_user<>session_user', sql)
        self.assertIn("clock_timestamp()>=a.expires_at", sql)
        self.assertIn("interval '15 seconds'", sql)
        self.assertNotIn('UPDATE public.', sql)
        self.assertNotIn('INSERT INTO public.', sql)
        self.assertNotIn('ALTER ', sql)
        self.assertNotIn('CREATE ', sql)

    def test_sql_literal_tokens_are_not_recursively_replaced(self):
        f = self.fixture()
        b = copy.deepcopy(f.b)
        b['authority']['commandCanonical'] = "literal ' @DB@ $append$ \\ text"
        p = {'observedAtUTC': f.m._text_time(f.at)}
        sql = f.m._sql(b, f.previous, p, '{}', 'a' * 64)
        self.assertTrue(f.m._q(f.m._json(b['authority'])) in sql)
        self.assertIn("SET LOCAL standard_conforming_strings=on;", sql)
        self.assertRegex(sql, r'DO \$obs_appendtag_[a-f0-9]{32}\$ DECLARE')
        self.assertNotIn('DO $append$', sql)
        self.assertNotIn('@SCOPE@', sql)

    def test_real_source_methods_are_required_instead_of_dto_flags(self):
        f = self.fixture()
        with self.assertRaises(f.m.ObservationError):
            f.m._source(f.b, {'qualified': True, 'binding': f.b['sourceBinding']})
        module = load('local-unit-native-source-qualification.py', 'observation_source_offline')
        observer = module.SourceServiceObserver.__new__(module.SourceServiceObserver)
        observer.binding = copy.deepcopy(f.b['sourceBinding'])
        # Pin checks accept actual source methods; this is NOT a constructed
        # native observer, so its missing actual process guard fields must fail.
        with self.assertRaises(AttributeError):
            f.m._source(f.b, observer)

    def test_actual_observer_qualification_executes_fresh_process_and_fd_guards(self):
        f = self.fixture()
        source = load('local-unit-native-source-qualification.py', 'observation_actual_consumer_offline')
        observer = source.SourceServiceObserver.__new__(source.SourceServiceObserver)
        observer.binding = copy.deepcopy(f.b['sourceBinding'])
        observer.expires_at = f.b['authority']['expiresAtUTC']
        observer.child = mock.Mock(pid=90001)
        observer.child.poll.return_value = None
        observer.service, observer.supervisor, observer.postgres = ({'pid': p} for p in (90001, 90002, 90003))
        observer.pins = []
        group = f.root / 'offline-group'; group.mkdir()
        for name, value in [('memory.max', '1547997184'), ('memory.high', '1399996416'), ('memory.swap.max', '0')]:
            (group / name).write_text(value)
        observer.group = {'path': str(group), 'device': group.stat().st_dev, 'inode': group.stat().st_ino}
        observer.socket = f.root / 'offline-socket-metadata'
        observer.socket.write_bytes(b'offline metadata, not a listening socket')
        observer.socket_identity = source.identity(observer.socket.lstat())
        observer.listener_inode = '555'
        class OfflineClock(datetime.datetime):
            @classmethod
            def now(cls, tz=None):
                return f.at
        class OfflineFDDirectory:
            def iterdir(self):
                return ['/offline-owned-fd']
        real_readlink = os.readlink
        def path_factory(*args):
            if args == ('/proc', '90001', 'fd'):
                return OfflineFDDirectory()
            return Path(*args)
        def readlink(path, *args, **kwargs):
            return 'socket:[555]' if path == '/offline-owned-fd' else real_readlink(path, *args, **kwargs)
        with mock.patch.object(source, 'process_identity', side_effect=lambda p: {'pid': p}) as process_guard, \
             mock.patch.object(source, 'Path', side_effect=path_factory), \
             mock.patch.object(source.os, 'readlink', side_effect=readlink), \
             mock.patch.object(source.datetime, 'datetime', OfflineClock), \
             mock.patch.object(f.m, '_now', return_value=f.at):
            self.assertTrue(f.m._hash(f.m._source(f.b, observer)))
            self.assertEqual(process_guard.call_count, 3)
            observer.child.poll.return_value = 1
            with self.assertRaises(source.SourceQualificationError):
                f.m._source(f.b, observer)

    def test_source_bound_query_and_host_callbacks_cannot_be_substituted(self):
        f = self.fixture()
        f.b['pins']['query'] = f.b['pins']['hostVerifier']
        self.rejects(f)
        self.assertFalse(f.calls)
        f = self.fixture(); f.b['hostVerifierFunction'] = 'another_reviewed_function'
        self.rejects(f)
        self.assertFalse(f.calls)

    def test_active_scope_cannot_start_a_parallel_observation(self):
        f = self.fixture(); f.m._active.add(f.b['commandHash'])
        self.rejects(f)
        self.assertFalse(f.calls)
        self.assertIn(f.b['commandHash'], f.m._active)
        self.assertIn(f.b['commandHash'], f.m._sealed)


if __name__ == '__main__':
    unittest.main(verbosity=1)
