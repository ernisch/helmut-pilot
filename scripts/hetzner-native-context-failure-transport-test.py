"""Closed retained-V2 read route, client output and fixed source graph only."""
import base64
import copy
import io
from pathlib import Path
import time
import types
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent


def load(name):
    module=types.ModuleType('context_failure_transport_'+name.replace('.','_'))
    module.__file__=str(HERE/name)
    exec(compile((HERE/name).read_bytes(),module.__file__,'exec'),module.__dict__)
    return module


T=load('hetzner-native-context-failure-test.py')
C=load('hetzner-native-automation-client.py')
S=load('hetzner-native-automation-server.py')


def capsule():
    now=int(time.time())
    return {'schema':'helmut-context-failure-capsule-v1','contract_id':C.CONTEXT_FAILURE_ID,
        'action':'inspect','source_sha256':'a'*64,'contract_sha256':C.CONTEXT_FAILURE_CONTRACT,
        'nonce':'c'*64,'issued_at_utc':now-1,'expires_at_utc':now+240}


class ContextFailureTransport(unittest.TestCase):
    def setUp(self):
        self.fixture=T.ReaderTests('test_no_inner_error_is_explicitly_unknown')
        self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.cap=capsule();self.context=self.fixture.context
        self.sent=C.request('status',C.STAGE_PLAN,'a'*64,C.control_request_nonce(self.cap))

    def validate(self,result):
        reply={**self.sent,'schema':'helmut-native-control-response-v1','result':result,
               'result_sha256':C.digest(C.canonical(result))}
        return C.validate_response(C.canonical(reply),self.sent,self.cap)

    def test_reader_source_and_contract_are_bound(self):
        raw=(HERE/'hetzner-native-context-failure.py').read_bytes()
        self.assertEqual((len(raw),C.digest(raw)),(S.CONTEXT_FAILURE_BYTES,S.CONTEXT_FAILURE_SHA256))
        self.assertEqual(T.M.CONTRACT_SHA256,C.CONTEXT_FAILURE_CONTRACT)
        self.assertEqual(T.M.request_nonce(self.cap),C.control_request_nonce(self.cap))

    def test_new_readonly_capsule_uses_existing_metadata_mode(self):
        raw=C.canonical(self.cap)
        env={'HELMUT_NATIVE_CONTROL_MODE':'runtime-metadata-v1','HELMUT_NATIVE_SETUP_CAPSULE':base64.b64encode(raw).decode(),
             'HELMUT_NATIVE_PLAN_SHA256':C.STAGE_PLAN,'HELMUT_NATIVE_PAYLOAD_SHA256':'a'*64}
        self.assertEqual(C.setup_capsule(env,'status'),(raw+b'\n',self.cap))
        S._context_failure_capsule(self.cap)
        self.assertEqual(S._setup_read_capsule({**self.context,'stdin':io.BytesIO(raw+b'\n')}),self.cap)
        with patch.object(S,'_setup_watchdog',return_value={'read_only':True}) as invoke:
            self.assertEqual(S.handle(self.sent,{**self.context,'stdin':io.BytesIO(raw+b'\n')}),{'read_only':True})
            self.assertEqual(invoke.call_args.kwargs,{'runtime_capsule':self.cap})

    def test_capsule_changes_reject_before_transport(self):
        for change in ({'action':'setup'},{'contract_sha256':'d'*64},{'expires_at_utc':int(time.time())-2},
                       {'nonce':'../x'},{'source_sha256':'d'*64},{'path':'private'}):
            value={**self.cap,**change}
            with self.assertRaises(ValueError):C.context_failure_capsule_check(value,'a'*64,int(time.time()))
            if 'source_sha256' in change:
                with patch.object(S,'_setup_watchdog') as execute:
                    with self.assertRaises(S._Stop):S.handle(self.sent,{**self.context,'stdin':io.BytesIO(C.canonical(value)+b'\n')})
                    execute.assert_not_called()
            else:
                with self.assertRaises(S._Stop):S._context_failure_capsule(value)

    def test_real_reader_success_and_explicit_unknown_validate(self):
        result=self.fixture.observe()
        self.assertEqual(result['cause_state'],'UNKNOWN_INNER_ERROR_ABSENT_OR_UNRECOGNIZED')
        self.validate(result)
        temporary=T.M.JOB_ROOT+'/.setup-write-'+'2'*32+'.tmp'
        self.fixture.fs.put(temporary,T.service_error())
        result=self.fixture.observe();self.validate(result)
        self.assertEqual(result['cause_records'],['job_temporary_error_0'])

    def test_readonly_failures_are_closed_and_publishable(self):
        failed=S._context_failure_result_error('SYNTHETIC_UNKNOWN',self.cap,self.context)
        self.validate(failed)
        for change in ({'records':{}},{'cause_state':'STORED_INNER_ERROR_OBSERVED'}, {'code':'private\ntext'}, {'read_only':False}):
            with self.assertRaises(ValueError):self.validate({**failed,**change})

    def test_private_extras_and_fabricated_absence_cannot_enter_artifact(self):
        original=self.fixture.observe()
        for field in ('path','raw','argv','private_key'):
            altered=copy.deepcopy(original);altered[field]='never publish'
            with self.assertRaises(ValueError):self.validate(altered)
        for change in ({'absence':None},{'sha256':'0'*64},{'source_status':'raw text'}):
            altered=copy.deepcopy(original);altered['records']['component_error'].update(change)
            with self.assertRaises(ValueError):self.validate(altered)
        altered=copy.deepcopy(original);altered['snapshot_sha256']='0'*64
        with self.assertRaises(ValueError):self.validate(altered)

    def test_source_loader_is_exact_and_never_calls_old_effect_handler(self):
        raw=(HERE/'hetzner-native-context-failure.py').read_bytes()
        with patch.object(S,'_setup_public_source',return_value=raw) as fetch, \
             patch.object(S,'_runtime_metadata_modules',return_value=(self.fixture.reader,{})), \
             patch.object(S,'_setup_successor_handle',side_effect=AssertionError('effect')):
            result=S._context_failure_handle(self.sent,self.context,self.cap)
        self.validate(result)
        self.assertEqual(fetch.call_args.args,(self.context['deployment_commit'],'scripts/hetzner-native-context-failure.py',
            self.context['deadline'],S.CONTEXT_FAILURE_BYTES,S.CONTEXT_FAILURE_SHA256,S.CONTEXT_FAILURE_BYTES))


if __name__=='__main__':unittest.main()
