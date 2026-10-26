"""Synthetic daemon-observation capsules, validated transport and fork boundaries."""
import base64
import copy
import io
import os
from pathlib import Path
import tempfile
import time
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def read(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
        return stream.read()


def load(name):
    path = HERE / name; module = types.ModuleType('synthetic_' + name.replace('.', '_'))
    module.__file__ = str(path)
    exec(compile(read(path), str(path), 'exec'), module.__dict__)
    return module


F = load('hetzner-native-runtime-metadata-client-test.py')  # Definitions only; no unittest runner.
C = F.M
S = load('hetzner-native-automation-server.py')
P = load('hetzner-native-daemon-binding.py')


def capsule():
    now = int(time.time())
    return {'schema': 'helmut-daemon-binding-capsule-v1', 'contract_id': C.DAEMON_BINDING_CONTRACT,
        'action': 'read', 'source_sha256': F.PAYLOAD, 'contract_sha256': C.DAEMON_BINDING_CONTRACT_SHA256,
        'nonce': 'b'*64, 'issued_at_utc': now-1, 'expires_at_utc': now+240}


def row(raw, mode=0o100444, proc=True):
    return {'sha256': C.digest(raw), 'bytes': len(raw),
        'metadata': [1, 2, mode, 0, 0, 1, 0 if proc else len(raw), 10, 11, 12, 0, 1]}


def result(cap=None, kind='DAEMON_CHILD', comm=True, exe=True):
    cap = capsule() if cap is None else cap
    original = F.result(F.capsule())
    diagnostic = original['failure_diagnostic']; records = diagnostic['records']
    records['namespace_error']['sha256'] = '08561bc6393049e003acebb7e1d4039e17f269f4b2a632c78de43c50a4933a6b'
    records['job_error'].update(code='DAEMON_SERVICE_BINDING', sha256=P.JOB_ERROR_SHA256)
    records['component_error'] = F.diagnostic_record('PRESENT', sha256=P.COMPONENT_ERROR_SHA256,
        source_status='FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY', phase='preflight', code='DAEMON_SERVICE_BINDING',
        exception_type='Stop', mount_state='NOT_STARTED', last_acknowledged_step=None,
        anchor_attempt_count=0, anchor_created_count=0)
    records['component_attempt'] = F.diagnostic_record()
    cg = {'UNIT_ROOT': ('0::'+P.UNIT_CGROUP+'\n').encode(),
          'DAEMON_CHILD': ('0::'+P.UNIT_CGROUP+'/daemon\n').encode(), 'OTHER': b'0::/SYNTHETIC_OTHER\n'}[kind]
    observation = {'unit_active_running': True, 'socket_peer_bound': True, 'process_root_owned': True,
        'process_alive': True, 'cgroup2_verified': True, 'private_namespace': False, 'private_propagation': False,
        'comm_matches': comm, 'exe_matches': exe, 'cgroup_matches': kind == 'DAEMON_CHILD', 'cgroup_kind': kind,
        'cgroup_membership_verified': kind != 'OTHER', 'boot_id_sha256': 'c'*64,
        'process_binding_sha256': 'd'*64, 'proc_binding_sha256': 'e'*64,
        'comm': row(b'dockerd\n' if comm else b'SYNTHETIC_COMM\n'),
        'exe_link': row(P.EXECUTABLE.encode() if exe else b'/SYNTHETIC_EXECUTABLE', 0o120777, False),
        'cgroup': row(cg), 'executable': row(b'SYNTHETIC_ELF', 0o100755, False),
        'unit_file': {'state': 'UNKNOWN_MISSING', 'sha256': None, 'bytes': None, 'metadata': None},
        'exec_hooks_state': 'UNKNOWN_NOT_QUERIED'}
    return {'schema': P.SCHEMA, 'status': 'DAEMON_BINDING_OBSERVED_NOT_READY', 'contract_id': P.CONTRACT_ID,
        'contract_sha256': P.CONTRACT_SHA256, 'source_sha256': F.PAYLOAD, 'code': None,
        'partial_setup_proof': original['partial_setup_proof'], 'failure_diagnostic': diagnostic,
        'observation': observation, 'native_qualified': False, 'native_go_consumed': False}


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.cap = capsule(); self.raw = C.canonical(self.cap) + b'\n'
        self.request = C.request('status', C.STAGE_PLAN, F.PAYLOAD, C.control_request_nonce(self.cap))
        self.context = {'base': S.TARGET_BASE, 'source_sha256': F.PAYLOAD, 'deployment_commit': 'a'*40,
                        'deadline': time.monotonic()+200, 'stdin': io.BytesIO(self.raw)}

    def validate(self, answer):
        return C.validate_response(C.canonical(F.response(self.request, answer)), self.request, self.cap)

    def test_new_capsule_canonical_status_mode_and_three_distinct_nonce_domains(self):
        env = F.environment(self.cap)
        self.assertEqual(C.setup_capsule(env, 'status'), (self.raw, self.cap))
        self.assertEqual(C.validate_context(env), ('status', C.STAGE_PLAN, F.PAYLOAD))
        self.assertEqual(C.control_request_nonce(self.cap), C.digest(b'helmut-daemon-binding-request-v1\0'+self.raw))
        self.assertEqual(len({C.control_request_nonce(self.cap), C.runtime_metadata_request_nonce(self.cap), C.setup_request_nonce(self.cap)}), 3)
        self.assertEqual(S._setup_read_capsule(self.context), self.cap)
        answer = S._daemon_binding_failure('SYNTHETIC_STOP', self.cap, self.context)
        with patch.object(S, '_setup_watchdog', return_value=answer) as invoke:
            self.assertEqual(S.handle(self.request, self.context | {'stdin': io.BytesIO(self.raw)}), answer)
            self.assertEqual(invoke.call_args.kwargs, {'runtime_capsule': self.cap})

    def test_client_capsule_missing_wrong_stale_duplicate_extra_and_modes_fail_before_transport(self):
        candidates = []
        for key in self.cap:
            missing = self.cap.copy(); del missing[key]; candidates.append(C.canonical(missing))
            candidates.append(C.canonical(self.cap | {key: 'SYNTHETIC_UNTRUSTED'}))
            candidates.append(C.canonical(self.cap)[:-1]+b','+C.canonical({key: self.cap[key]})[1:])
        for change in ({'chunk': 0}, {'contract_id': C.RUNTIME_METADATA_CONTRACT},
            {'contract_sha256': C.RUNTIME_METADATA_CONTRACT_SHA256}, {'issued_at_utc': True},
            {'issued_at_utc': self.cap['issued_at_utc']-1000, 'expires_at_utc': self.cap['issued_at_utc']-1},
            {'expires_at_utc': self.cap['issued_at_utc']+301}, {'nonce': 'A'*64}):
            candidates.append(C.canonical(self.cap | change))
        candidates.extend((self.raw, b' '+C.canonical(self.cap)))
        for raw in candidates:
            env = F.environment(self.cap); env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(raw).decode()
            with self.subTest(raw=raw[:45]), patch.object(C, 'transport_configuration') as transport:
                with self.assertRaises(ValueError): C.client(env)
                transport.assert_not_called()
        for operation in ('admit', 'four-tx', 'stage', 'recipient'):
            env = F.environment(self.cap); env['HELMUT_NATIVE_OPERATION'] = operation
            with self.subTest(operation=operation), patch.object(C, 'transport_configuration') as transport:
                with self.assertRaises(ValueError): C.client(env)
                transport.assert_not_called()
        for mode in ('setup-inspect-v1','setup-successor-v1','control-v1','disabled'):
            env = F.environment(self.cap); env['HELMUT_NATIVE_CONTROL_MODE'] = mode
            with self.subTest(mode=mode), self.assertRaises(ValueError): C.validate_context(env)

    def test_server_bad_canonical_framing_request_bindings_and_admit_never_reach_watchdog(self):
        for raw in (self.raw+b'\n', self.raw+self.raw, self.raw[:-1], C.canonical(self.cap | {'chunk': 0})+b'\n',
                    self.raw.replace(b'"action":"read"', b'"action":"read","action":"read"')):
            with self.subTest(raw=raw[:40]), self.assertRaises(Exception):
                S._setup_read_capsule(self.context | {'stdin': io.BytesIO(raw)})
        for change in ({'operation':'admit'}, {'nonce': C.runtime_metadata_request_nonce(self.cap)},
                       {'plan_sha256':'0'*64}, {'payload_sha256':'0'*64}, {'extra':True}):
            with self.subTest(change=change), patch.object(S, '_setup_watchdog') as invoke:
                with self.assertRaises(Exception): S.handle(self.request | change, self.context | {'stdin':io.BytesIO(self.raw)})
                invoke.assert_not_called()

    def test_valid_client_observations_keep_mismatches_private_false_and_missing_unit_not_ready(self):
        for kind, comm, exe in (('DAEMON_CHILD',True,True), ('UNIT_ROOT',True,True),
                                ('OTHER',False,False), ('DAEMON_CHILD',False,True), ('DAEMON_CHILD',True,False)):
            answer = result(self.cap, kind, comm, exe)
            self.assertEqual(self.validate(answer)['result'], answer)
            self.assertIs(answer['observation']['private_namespace'], False)
            self.assertIs(answer['observation']['private_propagation'], False)
            self.assertEqual(answer['status'], 'DAEMON_BINDING_OBSERVED_NOT_READY')
            self.assertIs(answer['native_qualified'], False)
        answer = result(self.cap); answer['observation']['unit_file'] = {'state':'PRESENT', **row(b'SYNTHETIC_UNIT',0o100644,False)}
        self.validate(answer)

    def test_client_exact_closed_nested_schema_and_positive_flags(self):
        answer = result(self.cap)
        def containers(value, path=()):
            if type(value) is dict:
                yield path, value
                for key, child in value.items(): yield from containers(child, path+(key,))
        def owner(value, path):
            for key in path: value=value[key]
            return value
        for path, value in containers(answer):
            for key in value:
                changed=copy.deepcopy(answer); del owner(changed,path)[key]
                with self.subTest(path=path,key=key), self.assertRaises(ValueError): self.validate(changed)
            changed=copy.deepcopy(answer); owner(changed,path)['private_extra']='SYNTHETIC_SECRET'
            with self.subTest(path=path,extra=True), self.assertRaises(ValueError): self.validate(changed)
        for key in ('unit_active_running','socket_peer_bound','process_root_owned','process_alive','cgroup2_verified'):
            changed=copy.deepcopy(answer); changed['observation'][key]=False
            with self.subTest(flag=key), self.assertRaises(ValueError): self.validate(changed)
        for change in ({'exec_hooks_state':'EMPTY_EXEC'}, {'exec_hooks_state':[]}, {'comm_matches':False},
                       {'exe_matches':False}, {'cgroup_matches':False}, {'cgroup_membership_verified':False},
                       {'cgroup_kind':'UNIT_ROOT'}, {'private_namespace':0}):
            changed=copy.deepcopy(answer); changed['observation'].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): self.validate(changed)

    def test_known_retained_failure_cannot_be_reflected_with_other_semantics_or_ready_state(self):
        answer=result(self.cap)
        for role,key,value in (('component_error','phase','attempt'), ('component_error','phase','private-mounts'),
            ('component_error','mount_state','UNKNOWN'), ('component_error','last_acknowledged_step',0),
            ('component_error','anchor_attempt_count',1), ('component_error','anchor_created_count',1),
            ('component_error','sha256','0'*64), ('component_error','code','CONTEXT_FAILURE'),
            ('job_error','sha256','0'*64), ('namespace_error','sha256','0'*64),
            ('component_attempt','state','UNKNOWN_UNACCEPTED')):
            changed=copy.deepcopy(answer); changed['failure_diagnostic']['records'][role][key]=value
            with self.subTest(role=role,key=key,value=value), self.assertRaises(ValueError): self.validate(changed)
        for key in ('native_qualified','native_go_consumed'):
            changed=copy.deepcopy(answer); changed[key]=True
            with self.assertRaises(ValueError): self.validate(changed)
        failure=S._daemon_binding_failure('SYNTHETIC_STOP',self.cap,self.context); self.validate(failure)
        for change in ({'code':'SYNTHETIC SECRET'}, {'observation':{}}, {'partial_setup_proof':{}},
                       {'status':'READY'}, {'code':None}, {'native_go_consumed':0}):
            with self.subTest(change=change), self.assertRaises(ValueError): self.validate(failure|change)

    def test_actual_watchdog_fork_accepts_new_schema_and_timeout_never_writes_historical_error(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-daemon-watchdog-') as tmp:
            marker=Path(tmp)/'FORBIDDEN_HISTORY_WRITE'
            def forbidden(*args): marker.write_bytes(b'SYNTHETIC_FORBIDDEN'); raise AssertionError('historical write')
            def watchdog(invoke,seconds=2):
                with patch.object(S,'_runtime_metadata_handle',side_effect=invoke),\
                     patch.object(S.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=10000000,f_frsize=4096)),\
                     patch.object(S,'_setup_first_failure',side_effect=forbidden):
                    return S._setup_watchdog(self.request,self.context|{'deadline':time.monotonic()+seconds},runtime_capsule=self.cap)
            answer=result(self.cap)
            self.assertEqual(watchdog(lambda *_:answer),answer)
            def fail(*args): raise S._Stop('SYNTHETIC_DAEMON_STOP')
            failure=watchdog(fail); self.assertEqual(failure['code'],'SYNTHETIC_DAEMON_STOP'); self.validate(failure)
            wrong=watchdog(lambda *_:answer|{'schema':'helmut-runtime-binding-metadata-read-v1'})
            self.assertEqual(wrong['code'],'SETUP_RESULT')
            def block(*args): time.sleep(3)
            started=time.monotonic(); timeout=watchdog(block,.08)
            self.assertLess(time.monotonic()-started,1); self.assertEqual(timeout['code'],'SETUP_DEADLINE')
            self.validate(timeout); self.assertFalse(marker.exists())

    def test_actual_pinned_source_graph_and_entry_reject_every_changed_module_before_observation(self):
        self.assertEqual(S.RUNTIME_METADATA_SHA256,P.READER_SHA256)
        probe=read(HERE/'hetzner-native-daemon-binding.py')
        self.assertEqual((S.DAEMON_BINDING_SHA256,S.DAEMON_BINDING_BYTES),(C.digest(probe),len(probe)))
        reader=load('hetzner-native-runtime-metadata.py')
        self.assertEqual(C.digest(read(HERE/'hetzner-native-runtime-metadata.py')),P.READER_SHA256)
        sources={pin['repoFile']:read(HERE/pin['repoFile']) for pin in reader.MODULE_PINS.values()}
        sources['hetzner-native-runtime-metadata.py']=read(HERE/'hetzner-native-runtime-metadata.py')
        synthetic_probe=('CONTRACT_ID='+repr(P.CONTRACT_ID)+'\nCONTRACT_SHA256='+repr(P.CONTRACT_SHA256)+'\n'
            'def observe_daemon_binding(context,reader,qualified):\n'
            ' assert set(context)=={"base","source_sha256","deployment_commit","deadline"}\n'
            ' assert reader["sha"](reader["__source_bytes__"])=='+repr(P.READER_SHA256)+'\n'
            ' reader["validate_config"](qualified)\n'
            ' return {"synthetic_entry":True,"modules":len(qualified)}\n').encode()
        sources['hetzner-native-daemon-binding.py']=synthetic_probe
        calls=[]; corrupt=[None]
        class Reply:
            status=200
            def __init__(self,data): self.data=data; self.offset=0
            def read(self,count):
                result=self.data[self.offset:self.offset+count];self.offset+=len(result);return result
            read1=read
            def isclosed(self): return self.offset>=len(self.data)
        class Connection:
            def __init__(self,host,timeout): self.sock=self
            def request(self,method,path,headers):
                self.path=path;self.filename=path.rsplit('/',1)[1];calls.append(path)
            def getresponse(self):
                raw=sources[self.filename]
                # Same-size, inert trailing-whitespace change isolates hash verification.
                return Reply(raw[:-1]+b' ' if corrupt[0]==self.filename else raw)
            def settimeout(self,value): pass
            def close(self): pass
        with patch.object(S.http.client,'HTTPSConnection',Connection),\
             patch.object(S,'DAEMON_BINDING_SHA256',C.digest(synthetic_probe)),\
             patch.object(S,'DAEMON_BINDING_BYTES',len(synthetic_probe)):
            self.assertEqual(S._daemon_binding_handle(self.request,self.context,self.cap),{'synthetic_entry':True,'modules':10})
            self.assertEqual(len(calls),12)
            for filename in sources:
                corrupt[0]=filename
                with self.subTest(filename=filename), self.assertRaises(Exception) as rejected:
                    S._daemon_binding_handle(self.request,self.context,self.cap)
                expected='SETUP_SOURCE_HASH'
                if filename in {pin['repoFile'] for name,pin in reader.MODULE_PINS.items()
                                if name not in ('library','preflight','successor')}:
                    expected='ASSET_BYTES'
                self.assertEqual(getattr(rejected.exception,'code',None),expected)
        for path in calls:
            commit=path.split('/')[3]
            self.assertEqual(commit,'a'*40 if path.endswith(('runtime-metadata.py','daemon-binding.py')) else S.RUNTIME_SETUP_COMMIT)
        with patch.object(S,'DAEMON_BINDING_SHA256',None), patch.object(S,'_setup_public_source') as fetch:
            with self.assertRaises(S._Stop): S._daemon_binding_handle(self.request,self.context,self.cap)
            fetch.assert_not_called()


if __name__=='__main__': unittest.main(verbosity=2)
