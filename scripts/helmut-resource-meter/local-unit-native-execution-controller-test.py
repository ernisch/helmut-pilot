"""RAM-only coordinator protocol tests: no child/socket/database is started."""
import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
FILE = Path(__file__).with_name('local-unit-native-execution-controller.py')


def snapshot():
    fd = os.open(FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        a = os.fstat(fd); assert stat.S_ISREG(a.st_mode) and a.st_nlink == 1 and a.st_size < 100000
        raw = os.read(fd, a.st_size + 1); b, c = os.fstat(fd), FILE.lstat()
        for field in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'):
            assert getattr(a, field) == getattr(b, field) == getattr(c, field)
        assert len(raw) == a.st_size
        return raw, hashlib.sha256(raw).hexdigest()
    finally:
        os.close(fd)


BEFORE, DIGEST = snapshot()


def module():
    m = types.ModuleType('offline_execution_controller'); m.__file__ = str(FILE)
    exec(compile(BEFORE, str(FILE), 'exec'), m.__dict__)
    return m


def pin(name):
    return {'path': str(name), 'bytes': 3, 'sha256': hashlib.sha256(str(name).encode()).hexdigest()}


class Clock:
    def __init__(self):
        self.now = 1.

    def monotonic(self):
        return self.now

    def monotonic_ns(self):
        return int(self.now * 1000000000)

    def sleep(self, n):
        self.now += n


class MemoryPath:
    fs = {}
    clock = None
    terminal_at = None

    def __init__(self, *parts):
        self.name = '/'.join(str(p).rstrip('/') for p in parts)

    def __str__(self):
        return self.name

    def __truediv__(self, other):
        return MemoryPath(self.name + '/' + str(other))

    @property
    def parent(self):
        return MemoryPath(self.name.rsplit('/', 1)[0])

    def exists(self):
        if self.name.endswith('/ATTEMPT_TERMINAL.SAFE.json') and self.terminal_at is not None:
            return self.clock.now >= self.terminal_at
        return self.name in self.fs

    def resolve(self):
        return self

    def __eq__(self, other):
        return str(self) == str(other)

    def mkdir(self, mode):
        assert mode == 0o700 and self.name not in self.fs
        self.fs[self.name] = b''

    def lstat(self):
        return types.SimpleNamespace(st_dev=1, st_ino=3, st_mode=stat.S_IFREG | 0o600, st_uid=1000, st_gid=1000,
                                     st_nlink=1, st_size=3, st_mtime_ns=1, st_ctime_ns=1)


class Fixture:
    """Only internal dependency replacements, never an exposed native callback."""
    def __init__(self, *, failure=None, append_seconds=0., terminal_seconds=20.):
        self.m, self.clock, self.events = module(), Clock(), []
        MemoryPath.fs, MemoryPath.clock, MemoryPath.terminal_at = {}, self.clock, None
        self.failure, self.append_seconds, self.terminal_seconds = failure, append_seconds, terminal_seconds
        self.c = object.__new__(self.m._Controller)
        c = self.c
        c.selection = {'operationId': 'localUnitDiagnostic-' + 'a' * 32, 'commandHash': 'b' * 64}
        c.database, c.expires = 'helmut_unit_diagnostic_' + 'a' * 32, '2026-10-22T12:03:00.000Z'
        c.pg = None
        c.bridge = {'qualification': {}}
        c.c = {'nonce': 'a' * 32, 'raw': pin('/original/image.raw'), 'database': c.database,
               'repository': '/repo', 'nodePin': pin('/node'), 'sourceObserverPin': pin('/observer'),
               'executionControllerPin': pin('/controller')}
        c.catalog = {'databaseOID': '123'}
        c.preparation = {'originalPins': {'packet': pin('/original/packet')}, 'prepared': {}}
        c.built = {'initialState': {}}
        c.command = {'vmOnly': True}
        c.query_pin, c.code_pin, c.runtime_pin = pin('/worker'), pin('/code'), pin('/runtime')
        c.initial_usage = {'proof': {'generation': 'VM', 'head': 'VM'}, 'revision': 'VM'}
        c.native_catalog = {'vmOnly': True}
        c.immutable = []
        c.service = None
        c.host_ready = {'ownerPID': 2, 'ownerStartTicks': '5', 'brokerCodePin': pin('/broker')}
        c.client_report = {'rootTrustSHA256': 'd' * 64}
        c.last_host = {'source': {'namespaces': {'time': 'time:[8]'}}}
        self.saved, self.calls, self.append_calls = {}, [], []
        c.w = types.SimpleNamespace(OUT=MemoryPath('/bench'), PGBIN=MemoryPath('/pg'), LIBRARY_PATH='/lib',
            pin=lambda path: pin(str(path)), save=self.save, query=lambda *a: self.fail('query-unexpected'), guard=lambda conf: None)
        c.source = types.SimpleNamespace(source_group=lambda conf: {}, postgres_identity=lambda *a: {})
        c.updater = types.SimpleNamespace(append_observation=self.append)
        c.observer = types.SimpleNamespace(binding={'pidNamespace': 'pid:[4]'}, check=lambda: self.fail_at('observer'))
        c.stage = lambda name: self.stage(name)
        c.private = self.private
        c.files = lambda: (c.code_pin, c.runtime_pin, {'files': [pin('/code-file')]}, {'files': [pin('/runtime-file')]}, [])
        c.start_owner = self.start_owner
        c.verify_source = lambda *a: self.fail_at('verify') or {'vmOnly': 'verification'}
        c.source_authority = lambda *a: self.fail_at('authority') or {'authority': {'vmOnly': True}}
        c.seed = lambda *a: self.fail_at('seed') or {'ordinal': 1, 'proofHash': 'e' * 64, 'observedAtUTC': '2026-10-22T12:00:00.000Z'}
        c.service_close = lambda: self.fail_at('service-close')
        c.host_observation = lambda value: self.fail_at('host-observe') or value
        c.immutable_check = lambda: self.fail_at('immutable')
        c.final = types.SimpleNamespace(final_acceptance=self.final_acceptance)
        c.host = types.SimpleNamespace(call=self.host_call, sealed=False)
        self.terminal = {'selection': c.selection, 'result': {'completedUnits': 1}}
        self.terminal_pin = pin('/bench/client/ATTEMPT_TERMINAL.SAFE.json')
        self.process_close = {'vmOnly': 'actual-exit-and-eof'}

    def fail(self, name):
        raise RuntimeError('offline-failure-' + name)

    def fail_at(self, name):
        self.events.append(name)
        if self.failure == name:
            self.fail(name)

    def stage(self, name):
        self.events.append('stage:' + name)

    def save(self, name, value):
        assert name not in self.saved
        self.saved[name] = copy.deepcopy(value)

    def private(self, name, **kwargs):
        if name == 'client/ATTEMPT_TERMINAL.SAFE.json':
            return copy.deepcopy(self.terminal), self.terminal_pin
        return {'vmOnly': 'configuration'}, pin('/bench/' + name)

    def start_owner(self, *args):
        self.fail_at('owner')
        self.c.service = types.SimpleNamespace(poll=lambda: self.fail_at('service-poll'),
             finish=lambda **kw: self.events.append('cleanup-service'))

    def append(self, query, **kwargs):
        self.fail_at('append')
        self.append_calls.append((self.clock.now, copy.deepcopy(kwargs['expected_previous'])))
        self.clock.now += self.append_seconds
        return {'tip': {'ordinal': kwargs['expected_previous']['ordinal'] + 1, 'proofHash': 'f' * 64, 'observedAtUTC': '2026-10-22T12:00:01.000Z'}}

    def host_call(self, stage, body, **kwargs):
        assert body == {}
        self.calls.append(stage); self.fail_at(stage)
        if stage == 'ENTRY_START':
            assert 'MOTOR_ENTRY_REQUESTED.SAFE.json' in self.saved
            MemoryPath.terminal_at = self.clock.now + self.terminal_seconds
            return {'containerId': 'VM', 'startedAtUTC': 'VM'}
        if stage == 'ENTRY_RESULT':
            return {'processClose': {}, 'actualEntryProcessClose': self.process_close,
                    'terminalPin': self.terminal_pin, 'terminal': copy.deepcopy(self.terminal)}
        if stage == 'OWNER_STOP':
            identity = dict(zip(self.m.META, (1, 2, stat.S_IFREG | 0o600, 0, 0, 1, 3, 1, 1)))
            return {'ownerStop': {'cleanShutdown': True, 'failed': False}, 'ownerProcessClose': {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True},
                'controlReadTrace': {'pin': pin('/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl'), 'identity': identity,
                    'value': {'header': {**self.c.selection, 'ownerPID': 2, 'ownerStartTicks': '5', 'pidNamespace': 'pid:[4]', 'timeNamespace': 'time:[8]',
                        'brokerCodeSHA256': pin('/broker')['sha256'], 'sourceBindingSHA256': self.m.sha(self.m.canonical(self.c.observer.binding)),
                        'trustSHA256': 'd' * 64}, 'footer': {'complete': True}}}}
        return {}

    def final_acceptance(self, query, **kwargs):
        self.fail_at('final')
        assert kwargs['actualEntryProcessClose'] == self.process_close
        assert kwargs['actualEntryTerminal'] == self.terminal
        assert kwargs['expectedInitialUsageProof'] == self.c.initial_usage
        return {'nativeSingleUnitAccepted': True, 'snapshot': {'positionCount': 3, 'controlCount': 16, 'freshGraphReadCount': 16,
                                                               'ownArtifactCount': 9, 'originalResultRowCount': 7}}

    def patches(self):
        def compact(worker, name, value):
            self.save(name, value); return pin('/bench/' + name)
        return (mock.patch.object(self.m, 'Path', MemoryPath), mock.patch.object(self.m, 'time', self.clock),
                mock.patch.object(self.m, '_move_prepared', return_value=pin('/bench/PREPARED_COMMAND.PRIVATE.json')),
                mock.patch.object(self.m, '_compact', side_effect=compact), mock.patch.object(self.m, 'utc', return_value='2026-10-22T12:00:01.000Z'),
                mock.patch.object(self.m.os, 'urandom', return_value=bytes(32)))

    def run(self, wrapper=False):
        from contextlib import ExitStack
        with ExitStack() as stack:
            for patch in self.patches():
                stack.enter_context(patch)
            if wrapper:
                stack.enter_context(mock.patch.object(self.m, '_Controller', return_value=self.c))
                return self.m.run_single_unit(self.c.w, self.c.c, None, None, None, None, None)
            return self.c.run()


class Tests(unittest.TestCase):
    def test_closed_once_sequence_and_no_acceptance_before_service_close(self):
        f = Fixture(); result = f.run()
        self.assertEqual(result['schema'], 'helmut-local-unit-native-execution-result/1')
        self.assertEqual(result['actualEntryCalls'], 1); self.assertEqual(result['motorCalls'], 1)
        self.assertEqual(f.calls.count('ENTRY_START'), 1); self.assertEqual(f.calls.count('ENTRY_RESULT'), 1)
        self.assertLess(f.calls.index('ENTRY_RESULT'), f.calls.index('OWNER_STOP'))
        self.assertLess(f.events.index('final'), f.events.index('service-close'))
        self.assertIn('FINAL_ACCEPTANCE.PRIVATE.json', f.saved)
        self.assertFalse(result['copiedOriginalAuthRowUnchanged']); self.assertFalse(result['independentProductAcceptance'])

    def test_updater_uses_confirmed_tip_and_start_based_eight_second_schedule(self):
        f = Fixture(append_seconds=3.5, terminal_seconds=20); f.run()
        starts = [r[0] for r in f.append_calls]
        self.assertGreaterEqual(len(starts), 3)
        self.assertTrue(all(7.999999 <= b - a < 8.1 for a, b in zip(starts, starts[1:])))
        self.assertEqual([r[1]['ordinal'] for r in f.append_calls], list(range(1, len(starts) + 1)))

    def test_full_fsync_span_over_fifteen_seconds_stops_before_entry(self):
        f = Fixture(append_seconds=15.001)
        with self.assertRaises(f.m.ExecutionError): f.run()
        self.assertNotIn('ENTRY_START', f.calls); self.assertNotIn('FINAL_ACCEPTANCE.PRIVATE.json', f.saved)

    def test_each_pre_entry_failure_blocks_marker_and_execution(self):
        for failure in ('owner', 'verify', 'authority', 'seed', 'append'):
            f = Fixture(failure=failure)
            with self.assertRaises(Exception): f.run()
            self.assertNotIn('MOTOR_ENTRY_REQUESTED.SAFE.json', f.saved); self.assertNotIn('ENTRY_START', f.calls)

    def test_unknown_start_exit_trace_and_final_failure_never_yield_success(self):
        for failure in ('ENTRY_START', 'ENTRY_RESULT', 'OWNER_STOP', 'final', 'service-close'):
            f = Fixture(failure=failure)
            with self.assertRaises(Exception): f.run(wrapper=True)
            self.assertIn('MOTOR_ENTRY_REQUESTED.SAFE.json', f.saved)
            self.assertNotIn('FINAL_ACCEPTANCE.PRIVATE.json', f.saved)
            self.assertTrue(f.c.host.sealed)
            self.assertEqual(f.calls.count('ENTRY_START'), 1)

    def test_same_nonce_remains_consumed_after_unknown(self):
        f = Fixture(failure='ENTRY_START')
        with self.assertRaises(f.m.ExecutionError): f.run(wrapper=True)
        with self.assertRaises(f.m.ExecutionError): f.run(wrapper=True)
        self.assertEqual(f.calls.count('ENTRY_START'), 1)

    def test_no_authority_after_client_terminal_substitution(self):
        f = Fixture(); original = f.host_call
        def changed(stage, body, **kwargs):
            value = original(stage, body, **kwargs)
            if stage == 'ENTRY_RESULT': value['terminalPin'] = {**value['terminalPin'], 'sha256': '0' * 64}
            return value
        f.c.host.call = changed
        with self.assertRaises(f.m.ExecutionError): f.run()
        self.assertNotIn('OWNER_STOP', f.calls); self.assertNotIn('FINAL_ACCEPTANCE.PRIVATE.json', f.saved)

    def test_root_trace_private_identity_and_binding_drift_block_snapshot(self):
        for mutation in ('uid', 'mode', 'source', 'broker', 'footer'):
            f = Fixture(); original = f.host_call
            def changed(stage, body, **kwargs):
                value = original(stage, body, **kwargs)
                if stage == 'OWNER_STOP':
                    trace = value['controlReadTrace']
                    if mutation == 'uid': trace['identity']['st_uid'] = 1000
                    if mutation == 'mode': trace['identity']['st_mode'] = stat.S_IFREG | 0o644
                    if mutation == 'source': trace['value']['header']['sourceBindingSHA256'] = '0' * 64
                    if mutation == 'broker': trace['value']['header']['brokerCodeSHA256'] = '0' * 64
                    if mutation == 'footer': trace['value']['footer']['complete'] = False
                return value
            f.c.host.call = changed
            with self.assertRaises(f.m.ExecutionError): f.run()
            self.assertNotIn('final', f.events)

    def test_host_source_service_and_root_heartbeat_are_bound_to_real_ids(self):
        m = module(); c = object.__new__(m._Controller)
        c.c = {'nodePin': pin('/node'), 'actualSourceContainerId': 'a' * 64}
        c.selection = {'operationId': 'VM', 'commandHash': 'b' * 64}
        c.observer = types.SimpleNamespace(binding={'pidNamespace': 'pid:[4]'}, supervisor={'startTicks': '4'}, service={'pid': 8, 'startTicks': '5'})
        c.source = types.SimpleNamespace(parse_utc=lambda s: __import__('datetime').datetime.fromisoformat(s.replace('Z', '+00:00')))
        c.host_ready = {'ownerPID': 10, 'ownerStartTicks': '6', 'upstreamPID': 11, 'upstreamStartTicks': '7'}
        at = '2026-10-22T12:00:00.000Z'
        root = {'uids': [0]*4, 'gids': [0]*4, 'capabilitiesZero': True, 'noNewPrivileges': True, 'membership': '0::/\n', 'pidNamespace': 'pid:[4]'}
        value = {'observedAtUTC': at, 'sourceContainerId': 'a'*64, 'knownContainerIds': ['a'*64],
            'source': {'namespacePID': os.getpid(), 'startTicks': '4', 'namespaces': {'pid': 'pid:[4]'}},
            'sourceService': {'namespacePID': 8, 'startTicks': '5', 'exe': '/node', 'membership': '0::/\n', 'namespaces': {'pid': 'pid:[4]'}},
            'ownerObservation': {'schema': 'helmut-local-unit-native-owner-observation/1', **c.selection, 'observedAtUTC': at,
                'owner': {**root, 'pid': 10, 'startTicks': '6'}, 'upstream': {**root, 'pid': 11, 'startTicks': '7'}}}
        with mock.patch.object(m, 'utc', return_value=at):
            c.host_observation(value)
            for change in ('service', 'root', 'stale', 'container'):
                bad = copy.deepcopy(value)
                if change == 'service': bad['sourceService']['startTicks'] = '9'
                if change == 'root': bad['ownerObservation']['owner']['uids'] = [1000]*4
                if change == 'stale': bad['ownerObservation']['observedAtUTC'] = '2026-10-22T11:59:44.000Z'
                if change == 'container': bad['sourceContainerId'] = 'c'*64
                with self.assertRaises(m.ExecutionError): c.host_observation(bad)

    def test_initial_usage_checks_all_empty_namespace_counts(self):
        m = module(); usage = {'proof': {'generation': 'VM', 'count': 0, 'head': 'VM', 'originalHash': 'VM'}, 'revision': 'VM'}
        value = {'usage': usage, **{k: 0 for k in ('authority', 'state', 'artifacts', 'leases', 'observations', 'ownKeys')}}
        calls = []
        def query(db, sql, label): calls.append((db, sql, label)); return json.dumps(value)
        worker = types.SimpleNamespace(query=query)
        self.assertEqual(m._initial_usage(worker, 'helmut_unit_diagnostic_'+'a'*32, 'a'*32), usage)
        self.assertTrue(calls[0][1].startswith('BEGIN READ ONLY;') and calls[0][1].endswith('ROLLBACK;'))
        for key in value:
            if key == 'usage': continue
            value[key] = 1
            with self.assertRaises(m.ExecutionError): m._initial_usage(worker, 'helmut_unit_diagnostic_'+'a'*32, 'a'*32)
            value[key] = 0

    def test_seed_confirmation_binds_actual_tip_and_generates_only_readonly_sql(self):
        m = module(); captured = []
        init = {'authority': {}, 'observation': {'proofCanonical': '{}', 'proofHash': 'e'*64, 'observedAtUTC': '2026-10-22T12:00:00.000Z'}, 'initialState': {}}
        tip = {'ordinal': 1, 'proofHash': 'e'*64, 'observedAtUTC': init['observation']['observedAtUTC']}
        worker = types.SimpleNamespace(query=lambda db, sql, label: captured.append(sql) or json.dumps(tip))
        selection = {'operationId': 'localUnitDiagnostic-'+'a'*32, 'commandHash': 'b'*64}
        m._confirmed_seed(worker, 'helmut_unit_diagnostic_'+'a'*32, selection, init, {}, 'c'*64)
        self.assertTrue(captured[0].startswith('BEGIN READ ONLY;') and captured[0].endswith('ROLLBACK;'))
        self.assertNotRegex(captured[0], r'\b(?:INSERT|UPDATE|DELETE|ALTER|COPY|CREATE)\b')
        tip['proofHash'] = 'd'*64
        with self.assertRaises(m.ExecutionError): m._confirmed_seed(worker, 'helmut_unit_diagnostic_'+'a'*32, selection, init, {}, 'c'*64)

    def test_sql_payload_cannot_inject_dollar_block_or_statement(self):
        m = module(); value = {'vm': "x');$native_sources$;DROP TABLE forbidden;--"}
        encoded = m._json_sql(value)
        self.assertNotIn('DROP', encoded); self.assertNotIn('$native_sources$', encoded)
        with self.assertRaises(m.ExecutionError): m._readonly('postgres', 'SELECT 1;')
        with self.assertRaises(m.ExecutionError): m.parse('{"x":1,"x":2}')

    def test_source_verifier_requires_actual_close_late_hashes_and_process(self):
        for mutation in (None, 'eof', 'exit', 'source', 'pid', 'old-time', 'stdout'):
            m = module(); c = object.__new__(m._Controller); saved, inputs, events = {}, {}, []
            at = '2026-10-22T12:00:00.000Z'; late = '2026-10-22T11:59:59.000Z'
            c.selection = {'operationId': 'VM-only', 'commandHash': 'a'*64}; c.expires = '2026-10-22T12:03:00.000Z'
            c.pg = None; c.c = {'nonce':'a'*32,'nodePin':pin('/node')}; c.database='helmut_unit_diagnostic_'+'a'*32
            c.built = {'admission': {'authorizedAtUTC': late}, 'sourceBinding': {'preparation': {'preparedAtUTC': late}}}
            c.preparation = {'ready': {k: 'b'*64 for k in ('selectionHash','selectedProfileHash','selectedSourcesHash','originalControlHash','producerProofHash')}}
            c.preparation['ready'].update(producerTransport={}, derivedPins={})
            c.preparation['ready']['runId']='nachlauf500-123456'; c.preparation['originalPins']={}
            c.w = types.SimpleNamespace(OUT=MemoryPath('/bench'), save=lambda n,v: saved.update({n:v}))
            child = types.SimpleNamespace(process={'pid': 7, 'startTicks': '4', 'exe': '/node'}, child=types.SimpleNamespace(returncode=3 if mutation=='exit' else 0),
                                          eof=[True, mutation != 'eof'])
            def finish(**kwargs): events.append('finish'); return b'VM unexpected' if mutation=='stdout' else b''
            child.finish = finish
            def node(*args): self.assertEqual(args[3], '--verify-own-native-source'); return child
            c.source = types.SimpleNamespace(NodeChild=node, postgres_identity=lambda *a: {},
                parse_utc=lambda s: __import__('datetime').datetime.fromisoformat(s.replace('Z','+00:00')))
            c.observer_module = types.SimpleNamespace(node_budget=lambda v: events.append('budget'))
            prepared_pin = pin('/bench/PREPARED_COMMAND.PRIVATE.json')
            def private(name, **kwargs):
                if name == 'PREPARE_CONFIG.PRIVATE.json': return {'nonce':c.c['nonce'],'database':c.database,'runId':c.preparation['ready']['runId'],
                    'originalPins':{},'nodePin':c.c['nodePin']}, pin('/bench/'+name)
                self.assertIn('finish', events)
                value = {**inputs['VERIFY_EXPECTED.PRIVATE.json'], 'schema':'helmut-local-unit-native-source-verification/1',
                         'configPin':pin('/bench/VERIFY_CONFIG.PRIVATE.json'),'expectedPin':pin('/bench/VERIFY_EXPECTED.PRIVATE.json'),
                         'process':dict(child.process),'actualNodeBudget':{},'checkedAtUTC':at}
                value.update(nonce=c.c['nonce'],runId=c.preparation['ready']['runId'],database=c.database)
                if mutation=='source': value['sourceProofHash']='f'*64
                if mutation=='pid': value['process']['pid']=8
                if mutation=='old-time': value['checkedAtUTC']='2026-10-22T11:59:55.000Z'
                return value, pin('/bench/'+name)
            c.private = private
            def compact(w,n,v): inputs[n]=v; return pin('/bench/'+n)
            with mock.patch.object(m,'_compact',side_effect=compact), mock.patch.object(m,'utc',return_value=at):
                if mutation is None:
                    value = c.verify_source(prepared_pin); self.assertEqual(value['authorizedAtUTC'], late)
                    self.assertIn('SOURCE_VERIFICATION_PROCESS.PRIVATE.json',saved)
                else:
                    with self.assertRaises(m.ExecutionError): c.verify_source(prepared_pin)
                    self.assertNotIn('SOURCE_VERIFICATION_PROCESS.PRIVATE.json',saved)

    def test_service_ledger_pairs_actual_children_and_rejects_post_ack_failure(self):
        for mutation in (None,'eof','exit','terminal','child-eof','child-nonzero','missing-close','wrong-pid'):
            m=module(); c=object.__new__(m._Controller); saved={}
            c.selection={'operationId':'VM','commandHash':'a'*64}
            c.w=types.SimpleNamespace(OUT=MemoryPath('/bench'),save=lambda n,v:saved.update({n:v}))
            c.service=types.SimpleNamespace(process={'pid':7,'startTicks':'4'},child=types.SimpleNamespace(returncode=1 if mutation=='exit' else 0),
                eof=[True,mutation!='eof'],finish=lambda **kwargs:b'{}\n')
            header={'event':'header','servicePID':7,'commandHash':'a'*64}
            spawn={'event':'spawn','index':0,'process':{'pid':8,'startTicks':'5'},'requestNonceSHA256':'b'*64}
            close={'event':'close','index':0,'pid':8,'startTicks':'5','requestNonceSHA256':'b'*64,'exitObserved':True,'exitCode':0,
                   'exitSignal':None,'stdoutEOF':True,'stderrEOF':True,'failure':None,'confirmed':True}
            if mutation=='child-eof': close['stdoutEOF']=False
            if mutation=='child-nonzero': close['exitCode']=3
            if mutation=='wrong-pid': close['pid']=9
            rows=[header,spawn]+([] if mutation=='missing-close' else [close])
            raw=b''.join((json.dumps(row)+'\n').encode() for row in rows); ledger={'path':'/bench/ORIGINAL_SERVICE_CHILDREN.SAFE.jsonl','bytes':len(raw),'sha256':m.sha(raw)}
            stop={'schema':'helmut-local-unit-original-service-stop/1',**c.selection,'servicePID':7,'serviceStartTicks':'4','cleanShutdown':True,
                  'terminal':mutation=='terminal','serverClosed':True,'childrenEmpty':True,'ledgerComplete':True,'ledgerPin':ledger,
                  'eventCount':len(rows),'spawnCount':1,'closeCount':1,'confirmedCount':1}
            c.private=lambda *a,**kw:(stop,pin('/bench/stop'))
            with mock.patch.object(m,'_raw',return_value=(raw,ledger,None)):
                if mutation is None:
                    c.service_close(); self.assertIn('SERVICE_PROCESS_CLOSE.PRIVATE.json',saved)
                else:
                    with self.assertRaises(m.ExecutionError): c.service_close()
                    self.assertNotIn('SERVICE_PROCESS_CLOSE.PRIVATE.json',saved)

    def test_source_private_move_keeps_inode_and_never_replaces_destination(self):
        for mutation in (None,'inode','bytes','exists'):
            m=module(); MemoryPath.fs={}; source=MemoryPath('/bench/client/PREPARED_COMMAND.PRIVATE.json'); target=MemoryPath('/bench/PREPARED_COMMAND.PRIVATE.json')
            raw=b'{"vmOnly":1}'; MemoryPath.fs[str(source)]=raw
            if mutation=='exists': MemoryPath.fs[str(target)]=b'VM existing'
            worker=types.SimpleNamespace(OUT=MemoryPath('/bench')); events=[]
            def read(path,cap):
                value=MemoryPath.fs[str(path)]; identity=source.lstat()
                if str(path)==str(target) and mutation=='inode': identity.st_ino=99
                return value,{'path':str(path),'bytes':len(value),'sha256':m.sha(value)},identity
            def rename(a,b):
                events.append('rename')
                if str(b) in MemoryPath.fs: raise FileExistsError('offline-existing')
                MemoryPath.fs[str(b)]=MemoryPath.fs.pop(str(a))
                if mutation=='bytes': MemoryPath.fs[str(b)]=b'{"vmOnly":2}'
            with mock.patch.object(m,'_raw',side_effect=read), mock.patch.object(m,'_rename',side_effect=rename), mock.patch.object(m,'_sync',side_effect=lambda p:events.append('sync')):
                if mutation is None:
                    value=m._move_prepared(worker,{'prepared':{'vmOnly':1}})
                    self.assertEqual(value['path'],str(target)); self.assertFalse(source.exists()); self.assertEqual(events,['rename','sync','sync'])
                else:
                    with self.assertRaises(Exception): m._move_prepared(worker,{'prepared':{'vmOnly':1}})

    def test_fresh_native_contract_also_requires_original_relations(self):
        m=module(); sources={'helmut_unit_diagnostic.vm_only()':'a'*64}
        contract={'version':'helmut-local-unit-diagnostic-native-store/1','database':'helmut_unit_diagnostic_'+'a'*32,
                  'databaseOID':'123','sources':sources,'legacyReadRPCs':[{},{}],'sourceQualified':False}
        result={'contract':contract,'originalRelations':[{'vmOnly':'actual-source-ddl'}]}; calls=[]
        worker=types.SimpleNamespace(query=lambda db,sql,label:calls.append(sql) or json.dumps(result))
        m._native_readback(worker,contract['database'],sources,'123',result['originalRelations'])
        self.assertNotRegex(calls[0],r'\b(?:INSERT|UPDATE|DELETE|ALTER|COPY|CREATE)\b')
        with self.assertRaises(m.ExecutionError):m._native_readback(worker,contract['database'],sources,'123',[])


if __name__ == '__main__':
    # A mistaken new transport path must fail before any native operation.
    with (mock.patch.object(subprocess, 'Popen', side_effect=AssertionError('offline-no-process')),
          mock.patch.object(socket, 'socket', side_effect=AssertionError('offline-no-socket'))):
        result = unittest.TestResult()
        unittest.defaultTestLoader.loadTestsFromTestCase(Tests).run(result)
    after, digest = snapshot()
    good = result.wasSuccessful() and digest == DIGEST and after == BEFORE
    if good:
        print('Execution controller pure checks PASS: %d; source SHA256=%s; native processes/database/provider calls=0.' % (result.testsRun, DIGEST))
    else:
        names = [case.id().rsplit('.', 1)[-1] for case, _ in result.failures + result.errors]
        print('Execution controller pure checks FAIL: ' + ','.join(names), file=sys.stderr)
    sys.exit(0 if good else 1)
