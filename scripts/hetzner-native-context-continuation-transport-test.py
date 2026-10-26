"""Synthetic continuation wire protocol, source graph and real fork watchdog tests."""
import base64
import copy
import io
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

# These modules only define fixtures and tests under non-main names.
HERE = Path(__file__).resolve().parent
import types


def read(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
        return stream.read()


def load(filename):
    path=HERE/filename;module=types.ModuleType('synthetic_continuation_'+filename.replace('.','_'))
    module.__file__=str(path);module.__source_bytes__=read(path)
    exec(compile(module.__source_bytes__,str(path),'exec'),module.__dict__)
    return module


D=load('hetzner-native-daemon-binding-transport-test.py')
C,S=D.C,D.S
P=load('hetzner-native-context-continuation-coordinator.py')
PARENT_SHA=C.digest(P.__source_bytes__)


def contract():
    now=int(time.time())
    assets={name:{'repoFile':filename,'sha256':C.digest(read(HERE/filename)), 'bytes':len(read(HERE/filename))}
            for name,filename in P.FILES.items()}
    expected={name:{key:pin[key] for key in ('sha256','bytes')} for name,pin in assets.items()}
    reader=read(HERE/'hetzner-native-runtime-metadata.py')
    return {'schema':'helmut-context-continuation-contract-v1','contract_id':P.NAMESPACE,
        'authorization_source':'operator-setup-request-20261026-working-test-environment','setup_authorized':True,
        'base':P.BASE,'case_id':P.CASE,'plan_sha256':P.PLAN,'scope_sha256':P.SCOPE,
        'target_host':'100.96.83.66','target_public_ip':'2.28.77.245','server_sha256':D.F.PAYLOAD,
        'coordinator_sha256':PARENT_SHA,'asset_set_sha256':P.sha(P.encoded(expected)),'assets':assets,
        'metadata_reader':{'repoFile':'hetzner-native-runtime-metadata.py','sha256':P.READER_SHA,'bytes':len(reader)},
        'not_before_utc':now-10,'not_after_utc':now+3600,'allowed_phases':['context','image'],
        'native_qualified':False,'native_go_consumed':False}


def capsule(raw_contract,action='inspect',phase='context'):
    now=int(time.time())
    return {'schema':'helmut-context-continuation-capsule-v1','contract_id':P.NAMESPACE,'action':action,
        'phase':None if action=='inspect' else phase,'source_sha256':D.F.PAYLOAD,'contract_sha256':P.sha(raw_contract),
        'nonce':'b'*64,'inspection_nonce':None if action=='inspect' else 'c'*64,
        'inspection_result_sha256':None if action=='inspect' else 'd'*64,'issued_at_utc':now-1,'expires_at_utc':now+240}


def request(cap):
    return C.request('status' if cap['action']=='inspect' else 'admit',C.STAGE_PLAN,D.F.PAYLOAD,C.control_request_nonce(cap))


def inspection(cap):
    old=D.result(D.capsule())
    return {'schema':'helmut-context-continuation-inspection-v1','status':'INSPECTED_NOT_ADMITTED',
        'contract_id':P.NAMESPACE,'request_nonce':request(cap)['nonce'],'capsule':copy.deepcopy(cap),
        'source_sha256':D.F.PAYLOAD,'contract_sha256':cap['contract_sha256'],'asset_set_sha256':'e'*64,
        'coordinator_sha256':PARENT_SHA,'old_baseline_sha256':old['partial_setup_proof']['baseline_sha256'],
        'partial_setup_proof':old['partial_setup_proof'],'failure_diagnostic':old['failure_diagnostic'],
        'daemon_identity_sha256':'f'*64,'preflight':{'schema':'helmut-context-daemon-binding-v2-preflight-v1',
            'status':'PREFLIGHT_OBSERVED_NOT_NATIVE_QUALIFIED','source_proof_sha256':'1'*64,
            'daemon_binding_sha256':'f'*64,'held_source_count':7,'anchor_count':3,
            'native_qualified':False,'native_go_consumed':False},
        'observed_at_utc':int(time.time()),'native_qualified':False,'native_go_consumed':False}


def phase_result(cap,failed=False):
    return {'schema':'helmut-context-continuation-result-v1',
        'status':'FAIL_KEEP_STATE_NO_RETRY' if failed else 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED',
        'contract_id':P.NAMESPACE,'contract_sha256':cap['contract_sha256'],'phase':cap['phase'] or 'preflight',
        'code':'SYNTHETIC_CONTINUATION_STOP' if failed else 'SETUP_PHASE_COMPLETE',
        **{key:None if failed else 'a'*64 for key in
           ('authority_sha256','attempt_sha256','ready_sha256','accepted_sha256','lifecycle_sha256')},
        'native_qualified':False,'native_go_consumed':False}


class ContinuationTransportTests(unittest.TestCase):
    def setUp(self):
        self.contract=P.encoded(contract());self.cap=capsule(self.contract)
        self.context={'base':S.TARGET_BASE,'source_sha256':D.F.PAYLOAD,'deployment_commit':'a'*40,
                      'deadline':time.monotonic()+200}
        self.pin=patch.object(C,'CONTINUATION_COORDINATOR_SHA256',PARENT_SHA);self.pin.start();self.addCleanup(self.pin.stop)

    def validate(self,answer,cap=None):
        cap=self.cap if cap is None else cap;sent=request(cap)
        return C.validate_response(C.canonical(D.F.response(sent,answer)),sent,cap)

    def env(self,cap=None):
        cap=self.cap if cap is None else cap
        return D.F.environment(cap)|{'HELMUT_NATIVE_CONTROL_MODE':'context-continuation-v1',
            'HELMUT_NATIVE_OPERATION':'status' if cap['action']=='inspect' else 'admit'}

    def test_exact_capsule_modes_nonce_domains_and_server_dispatch(self):
        for cap in (self.cap,capsule(self.contract,'setup','context'),capsule(self.contract,'setup','image')):
            raw=C.canonical(cap)+b'\n';operation=request(cap)['operation']
            self.assertEqual(C.setup_capsule(self.env(cap),operation),(raw,cap))
            self.assertEqual(C.control_request_nonce(cap),C.digest(P.PREFIX+raw))
            self.assertEqual(len({C.control_request_nonce(cap),C.setup_request_nonce(cap),C.runtime_metadata_request_nonce(cap),
                C.digest(C.DAEMON_BINDING_PREFIX+raw)}),4)
            context=self.context|{'stdin':io.BytesIO(raw)}
            self.assertEqual(S._setup_read_capsule(context),cap)
            with patch.object(S,'_setup_watchdog',return_value={'synthetic':'dispatch'}) as invoke:
                self.assertEqual(S.handle(request(cap),context|{'stdin':io.BytesIO(raw)}),{'synthetic':'dispatch'})
                self.assertEqual(invoke.call_args.kwargs,{'successor_capsule':cap})
        for change in ({'operation':'admit'},{'nonce':C.setup_request_nonce(self.cap)},
                       {'payload_sha256':'0'*64},{'plan_sha256':'0'*64}):
            with patch.object(S,'_setup_watchdog') as invoke,self.assertRaises(Exception):
                S.handle(request(self.cap)|change,self.context|{'stdin':io.BytesIO(C.canonical(self.cap)+b'\n')})
            invoke.assert_not_called()

    def test_bad_capsule_schema_phase_expiry_extra_and_operation_fail_before_transport(self):
        caps=[self.cap,capsule(self.contract,'setup')]
        for cap in caps:
            raw_candidates=[]
            for key in cap:
                missing=cap.copy();del missing[key];raw_candidates.append(C.canonical(missing))
                raw_candidates.append(C.canonical(cap|{key:'SYNTHETIC_UNTRUSTED'}))
                raw_candidates.append(C.canonical(cap)[:-1]+b','+C.canonical({key:cap[key]})[1:])
            for delta in ({'chunk':0},{'phase':'recover'},{'phase':'checkout'},{'contract_id':C.SETUP_CONTRACT},
                          {'issued_at_utc':True},{'expires_at_utc':cap['issued_at_utc']-1},
                          {'expires_at_utc':cap['issued_at_utc']+301},{'nonce':'A'*64}):
                raw_candidates.append(C.canonical(cap|delta))
            raw_candidates.extend((C.canonical(cap)+b'\n',b' '+C.canonical(cap)))
            for raw in raw_candidates:
                env=self.env(cap);env['HELMUT_NATIVE_SETUP_CAPSULE']=base64.b64encode(raw).decode()
                with self.subTest(action=cap['action'],raw=raw[:50]),patch.object(C,'transport_configuration') as transport:
                    with self.assertRaises(ValueError):C.client(env)
                    transport.assert_not_called()
            for operation in ('four-tx','stage','recipient','admit' if cap['action']=='inspect' else 'status'):
                with patch.object(C,'transport_configuration') as transport:
                    with self.assertRaises(ValueError):C.client(self.env(cap)|{'HELMUT_NATIVE_OPERATION':operation})
                    transport.assert_not_called()
            for mode in ('setup-successor-v1','setup-inspect-v1','runtime-metadata-v1','control-v1','disabled'):
                with self.subTest(mode=mode),self.assertRaises(ValueError):C.validate_context(self.env(cap)|{'HELMUT_NATIVE_CONTROL_MODE':mode})

    def test_client_exact_inspection_proof_source_time_counts_and_no_private_extra(self):
        answer=inspection(self.cap);self.assertEqual(set(answer),P.INSPECTION_KEYS);self.validate(answer)
        def containers(value,path=()):
            if type(value)is dict:
                yield path,value
                for key,child in value.items():yield from containers(child,path+(key,))
        def owner(value,path):
            for key in path:value=value[key]
            return value
        for path,value in containers(answer):
            for key in value:
                changed=copy.deepcopy(answer);del owner(changed,path)[key]
                with self.subTest(path=path,key=key),self.assertRaises(ValueError):self.validate(changed)
            changed=copy.deepcopy(answer);owner(changed,path)['raw_private']='SYNTHETIC_SECRET'
            with self.subTest(path=path),self.assertRaises(ValueError):self.validate(changed)
        for delta in ({'coordinator_sha256':'0'*64},{'source_sha256':'0'*64},{'old_baseline_sha256':'0'*64},
                      {'observed_at_utc':True},{'observed_at_utc':self.cap['expires_at_utc']+1},
                      {'request_nonce':C.setup_request_nonce(self.cap)},{'native_qualified':True}):
            with self.subTest(delta=delta),self.assertRaises(ValueError):self.validate(answer|delta)
        for delta in ({'held_source_count':8},{'held_source_count':True},{'anchor_count':2},
                      {'daemon_binding_sha256':'0'*64},{'native_go_consumed':0}):
            changed=copy.deepcopy(answer);changed['preflight'].update(delta)
            with self.subTest(delta=delta),self.assertRaises(ValueError):self.validate(changed)

    def test_actual_readonly_public_preflight_count_matches_the_client_inspection_abi(self):
        fixture=load('hetzner-native-context-continuation-test.py')
        case=fixture.ContinuationPublicInspectionTests();case.setUp()
        try:
            with patch.object(fixture.m,'observe',side_effect=case.observer):
                preflight=fixture.m.inspect_preflight(fixture.m.sha(case.ready_raw),public=fixture.m.sha(case.public_raw))
            self.assertEqual((preflight['held_source_count'],preflight['anchor_count']),(7,3))
            answer=inspection(self.cap);answer['preflight']=preflight
            answer['daemon_identity_sha256']=preflight['daemon_binding_sha256'];self.validate(answer)
        finally:case.doCleanups()

    def test_phase_success_and_retained_failure_keep_exact_thirteen_keys_and_five_hash_rules(self):
        hashes=('authority_sha256','attempt_sha256','ready_sha256','accepted_sha256','lifecycle_sha256')
        for phase in ('context','image'):
            cap=capsule(self.contract,'setup',phase)
            for failed in (True,False):
                answer=phase_result(cap,failed);self.validate(answer,cap);self.assertEqual(len(answer),13)
                for key in answer:
                    changed=answer.copy();del changed[key]
                    with self.subTest(phase=phase,failed=failed,key=key),self.assertRaises(ValueError):self.validate(changed,cap)
                for key in hashes:
                    changed=answer|{key:'a'*64 if failed else None}
                    with self.assertRaises(ValueError):self.validate(changed,cap)
                for change in ({'native_qualified':True},{'native_go_consumed':0},{'phase':'recover'},
                               {'code':'SYNTHETIC PRIVATE TEXT'},{'raw_argv':[]},{'contract_id':C.SETUP_CONTRACT}):
                    with self.assertRaises(ValueError):self.validate(answer|change,cap)
            for change in ({'phase':'image' if phase=='context' else 'context'},{'status':'READY'},
                           {'code':'OTHER'},{'contract_sha256':None}):
                with self.assertRaises(ValueError):self.validate(phase_result(cap)|change,cap)

    def test_pinned_parent_validates_full_capsule_semantics_before_lock_or_component_load(self):
        raw=b'{}';good=capsule(raw,'setup')
        directory=Mock(side_effect=AssertionError('no filesystem before capsule validation'))
        with patch.object(P,'contract_check',return_value={}),patch.object(P,'load_assets') as assets:
            for delta in ({'phase':'recover'},{'phase':'checkout'},{'inspection_nonce':None},
                          {'expires_at_utc':good['issued_at_utc']-1},{'extra':True}):
                cap=good|delta
                with patch.object(P.os,'getuid',return_value=0),patch.object(P.os,'geteuid',return_value=0),\
                     patch.object(P.os,'getgid',return_value=0),patch.object(P.os,'getegid',return_value=0):
                    answer=P.coordinate_continuation(request(cap),self.context,cap,raw,{}, {'library':{'directory':directory}})
                self.assertEqual(answer['status'],'FAIL_KEEP_STATE_NO_RETRY')
                self.assertIn(answer['code'],('CONTINUATION_CAPSULE','CONTINUATION_CAPSULE_TIME'))
            directory.assert_not_called();assets.assert_not_called()

    def test_actual_successor_watchdog_new_inspection_result_failure_timeout_preserve_old_first_error(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-continuation-watchdog-') as tmp:
            marker=Path(tmp)/'FORBIDDEN_OLD_HISTORY_WRITE'
            def forbidden(*args):marker.write_bytes(b'SYNTHETIC_FORBIDDEN');raise AssertionError('old write')
            def watchdog(cap,invoke,seconds=2):
                with patch.object(S,'_setup_successor_handle',side_effect=invoke),\
                     patch.object(S.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=10000000,f_frsize=4096)),\
                     patch.object(S,'_setup_first_failure',side_effect=forbidden):
                    return S._setup_watchdog(request(cap),self.context|{'deadline':time.monotonic()+seconds},successor_capsule=cap)
            for cap,answer in ((self.cap,inspection(self.cap)),(capsule(self.contract,'setup'),phase_result(capsule(self.contract,'setup')))):
                self.assertEqual(watchdog(cap,lambda *_:answer),answer)
                def fail(*args):raise S._Stop('SYNTHETIC_CONTINUATION_STOP')
                failure=watchdog(cap,fail);self.assertEqual(failure['code'],'SYNTHETIC_CONTINUATION_STOP');self.validate(failure,cap)
            def block(*args):time.sleep(3)
            started=time.monotonic();failure=watchdog(self.cap,block,.08)
            self.assertLess(time.monotonic()-started,1);self.assertEqual(failure['code'],'SETUP_DEADLINE')
            self.validate(failure);self.assertFalse(marker.exists())

    def test_real_parent_contract_frozen_reader_and_ten_old_sources_are_checked_before_entry_effects(self):
        reader=load('hetzner-native-runtime-metadata.py')
        sources={pin['repoFile']:read(HERE/pin['repoFile']) for pin in reader.MODULE_PINS.values()}
        sources['hetzner-native-runtime-metadata.py']=read(HERE/'hetzner-native-runtime-metadata.py')
        sources['hetzner-native-context-continuation-coordinator.py']=P.__source_bytes__
        sources[Path(S.CONTINUATION_CONTRACT).name]=self.contract
        calls=[];corrupt=[None]
        class Reply:
            status=200
            def __init__(self,data):self.data=data;self.offset=0
            def read(self,count):block=self.data[self.offset:self.offset+count];self.offset+=len(block);return block
            read1=read
            def isclosed(self):return self.offset>=len(self.data)
        class Connection:
            def __init__(self,host,timeout):self.sock=self
            def request(self,method,path,headers):self.path=path;self.filename=path.rsplit('/',1)[1];calls.append(path)
            def getresponse(self):
                raw=sources[self.filename];return Reply(raw[:-1]+b' ' if corrupt[0]==self.filename else raw)
            def settimeout(self,value):pass
            def close(self):pass
        # Framing accepts the removed phase; the actual pinned parent rejects it before any lock/effect.
        cap=capsule(self.contract,'setup','recover')
        with patch.object(S,'CONTINUATION_SHA256',PARENT_SHA),patch.object(S,'CONTINUATION_BYTES',len(P.__source_bytes__)),\
             patch.object(S.http.client,'HTTPSConnection',Connection),\
             patch.object(S.os,'getuid',return_value=0),patch.object(S.os,'geteuid',return_value=0),\
             patch.object(S.os,'getgid',return_value=0),patch.object(S.os,'getegid',return_value=0):
            answer=S._continuation_handle(request(cap),self.context,cap)
            self.assertEqual(answer['code'],'CONTINUATION_CAPSULE');self.assertEqual(len(calls),13)
            for filename in sources:
                corrupt[0]=filename
                with self.subTest(filename=filename),self.assertRaises(Exception) as rejected:
                    S._continuation_handle(request(cap),self.context,cap)
                expected='SETUP_SOURCE_HASH'
                if filename==Path(S.CONTINUATION_CONTRACT).name:expected='CONTINUATION_CONTRACT_HASH'
                elif filename in {pin['repoFile'] for name,pin in reader.MODULE_PINS.items() if name not in ('library','preflight','successor')}:
                    expected='ASSET_BYTES'
                self.assertEqual(getattr(rejected.exception,'code',None),expected)
        self.assertEqual(C.digest(sources['hetzner-native-runtime-metadata.py']),P.READER_SHA)
        with patch.object(S,'CONTINUATION_SHA256',None),patch.object(S,'_setup_public_source') as fetch:
            with self.assertRaises(S._Stop):S._continuation_handle(request(cap),self.context,cap)
            fetch.assert_not_called()


if __name__=='__main__':unittest.main(verbosity=2)
