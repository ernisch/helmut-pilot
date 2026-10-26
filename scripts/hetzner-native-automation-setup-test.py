"""Synthetic controller ABI and bounded public-code fetch; no target/network I/O."""
import copy
import hashlib
import json
import os
import time
import unittest
from unittest.mock import patch

from helmut_native_test_support import ROOT, load_source

S, C = load_source('server'), load_source('client')


def phase_result(failed=False, complete=False):
    return {'schema':'helmut-target-setup-result-v1',
        'status':'FAIL_KEEP_STATE_NO_RETRY' if failed else
                 'SETUP_COMPLETE_NOT_NATIVE_QUALIFIED' if complete else 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED',
        'phase':'preflight' if failed else 'complete' if complete else 'recover',
        'code':'SYNTHETIC_FAILURE' if failed else 'SETUP_COMPLETE' if complete else 'SETUP_PHASE_COMPLETE',
        'ready_sha256':None if failed else '1'*64, 'accepted_sha256':None if failed else '2'*64,
        'lifecycle_sha256':None if failed else '3'*64, 'native_qualified':False, 'native_go_consumed':False}


class Response:
    status=200
    def __init__(self, raw, close_on_last=True):
        self.raw=raw;self.closed=False;self.close_on_last=close_on_last;self.offset=0
    def isclosed(self):return self.closed
    def read1(self, maximum):
        result=self.raw[self.offset:self.offset+maximum];self.offset+=len(result)
        if self.offset==len(self.raw) and self.close_on_last:self.closed=True
        return result


class Connection:
    def __init__(self, response):self.response=response;self.sock=self;self.closed=False;self.requests=[]
    def request(self,*args,**kwargs):self.requests.append((args,kwargs))
    def getresponse(self):return self.response
    def settimeout(self,value):
        if self.response.closed:raise OSError('synthetic-closed-socket')
        if value<=0:raise AssertionError('nonpositive timeout')
    def close(self):self.closed=True


class SetupControllerTests(unittest.TestCase):
    def test_runtime_reader_and_all_historical_sources_match_fixed_pins(self):
        from helmut_native_test_support import read_noatime
        raw=read_noatime(ROOT/'scripts/hetzner-native-runtime-metadata.py')
        self.assertEqual((len(raw),hashlib.sha256(raw).hexdigest()),
                         (S.RUNTIME_METADATA_BYTES,S.RUNTIME_METADATA_SHA256))
        reader={'__name__':'runtime_metadata_pins'}
        exec(compile(raw,'runtime_metadata_pins','exec'),reader)
        self.assertEqual(reader['CONTRACT_ID'],S.RUNTIME_METADATA_ID)
        self.assertEqual(reader['CONTRACT_SHA256'],S.RUNTIME_METADATA_CONTRACT_SHA256)
        self.assertEqual(reader['SETUP_CONFIG']['setup_deployment_commit'],S.RUNTIME_SETUP_COMMIT)
        self.assertEqual(reader['SETUP_CONFIG']['setup_server_sha256'],S.RUNTIME_SETUP_SOURCE)
        self.assertEqual(reader['SETUP_CONFIG']['contract_sha256'],
                         '029d6e301758fd27172a58c03ae99ae2003f93f84c37959192ad1124a93a5738')
        for name,pin in reader['MODULE_PINS'].items():
            with self.subTest(module=name):
                source=read_noatime(ROOT/'scripts'/pin['repoFile'])
                self.assertEqual((len(source),hashlib.sha256(source).hexdigest()),
                                 (pin['bytes'],pin['sha256']))

    def test_deployed_public_assets_and_coordinator_match_exact_repository_bytes(self):
        from helmut_native_test_support import read_noatime
        raw=read_noatime(ROOT/'scripts/hetzner-native-setup-coordinator.py')
        self.assertEqual((len(raw),hashlib.sha256(raw).hexdigest()),
                         (S.SETUP_COORDINATOR_BYTES,S.SETUP_COORDINATOR_SHA256))
        namespace={'__name__':'pinned_coordinator_manifest'}
        exec(compile(raw,'pinned_coordinator_manifest','exec'),namespace)
        self.assertEqual(set(namespace['ASSET_MAP']),set(namespace['FILES']))
        for name,pin in namespace['ASSET_MAP'].items():
            with self.subTest(asset=name):
                self.assertEqual(pin['repoFile'],namespace['FILES'][name])
                source=read_noatime(ROOT/'scripts'/pin['repoFile'])
                self.assertEqual((len(source),hashlib.sha256(source).hexdigest()),
                                 (pin['bytes'],pin['sha256']))
        self.assertLessEqual(len(read_noatime(ROOT/'scripts/hetzner-native-automation-server.py')),131072)
        # Real source graph and the fixed same-commit authorization configuration.
        # Inject a time inside its declared window; later CI must not renew it.
        contract_raw=read_noatime(ROOT/S.SETUP_SUCCESSOR_CONTRACT)
        contract=json.loads(contract_raw)
        self.assertEqual(contract['server_sha256'],hashlib.sha256(
            read_noatime(ROOT/'scripts/hetzner-native-automation-server.py')).hexdigest())
        self.assertEqual(contract['coordinator_sha256'],S.SETUP_SUCCESSOR_COORDINATOR_SHA256)
        self.assertEqual((contract['preflight']['sha256'],contract['preflight']['bytes']),
                         (S.SETUP_SUCCESSOR_PREFLIGHT_SHA256,S.SETUP_SUCCESSOR_PREFLIGHT_BYTES))
        namespace['__source_bytes__']=raw
        selected={}
        for role,filename in (('preflight',contract['preflight']['repoFile']),
                              ('successor','hetzner-native-setup-successor.py')):
            source=read_noatime(ROOT/'scripts'/filename)
            selected[role]={'__name__':'pinned_'+role,'__source_bytes__':source}
            exec(compile(source,filename,'exec'),selected[role])
        self.assertEqual(len(selected['successor']['__source_bytes__']),S.SETUP_SUCCESSOR_COORDINATOR_BYTES)
        with patch.object(selected['successor']['time'],'time',return_value=contract['not_before_utc']+1):
            selected['successor']['contract_check'](contract_raw,
                {'base':namespace['BASE'],'source_sha256':contract['server_sha256'],
                 'deployment_commit':'a'*40,'deadline':time.monotonic()+10},namespace,selected['preflight'])

    def source(self,value=None):
        value=phase_result() if value is None else value
        return ('if __name__=="__main__": raise AssertionError("no-main-execution")\n'
                'def coordinate_setup(request,context):\n    return '+repr(value)+'\n').encode()

    def invoke(self,raw=None,response=None,value=None,sha=None,commit=None):
        raw=self.source(value) if raw is None else raw
        connection=Connection(Response(raw) if response is None else response)
        context={'base':S.TARGET_BASE,'source_sha256':'b'*64,
                 'deadline':time.monotonic()+60,'deployment_commit':'a'*40 if commit is None else commit,
                 'ci':{'status':'SYNTHETIC_SUCCESS'},'stdin':object(),
                 'once_directory':S.TARGET_BASE+'/once'}
        with patch.object(S,'SETUP_COORDINATOR_SHA256',hashlib.sha256(raw).hexdigest() if sha is None else sha),\
             patch.object(S,'SETUP_COORDINATOR_BYTES',len(raw)),\
             patch.object(S.http.client,'HTTPSConnection',return_value=connection) as call:
            result=S._setup_handle({'operation':'admit'},context)
        return result,connection,call

    def test_unqualified_setup_stops_before_network(self):
        with patch.object(S,'SETUP_COORDINATOR_SHA256',None),\
             patch.object(S.http.client,'HTTPSConnection') as connect:
            with self.assertRaises(S._Stop):S._setup_handle({}, {})
        connect.assert_not_called()

    def test_public_source_has_exact_commit_and_pinned_bytes_nonmain_only(self):
        result,connection,call=self.invoke()
        self.assertEqual(result,phase_result());self.assertTrue(connection.closed)
        self.assertEqual(call.call_args.args,('raw.githubusercontent.com',))
        self.assertEqual(connection.requests[0][0],('GET','/ernisch/helmut-pilot/'+'a'*40+
            '/scripts/hetzner-native-setup-coordinator.py'))

    def test_eof_closes_socket_on_last_exact_chunk_and_success_still_valid(self):
        result,connection,_=self.invoke()
        self.assertEqual(result['native_qualified'],False)
        self.assertTrue(connection.response.isclosed())

    def test_full_bootstrap_context_is_projected_to_exact_coordinator_contract(self):
        raw=('def coordinate_setup(request,context):\n'
             '    assert set(context)=={"base","source_sha256","deployment_commit","deadline"}\n'
             '    assert context["base"]=='+repr(S.TARGET_BASE)+'\n'
             '    assert context["source_sha256"]=="b"*64\n'
             '    return '+repr(phase_result())+'\n').encode()
        result,_,_=self.invoke(raw=raw)
        self.assertEqual(result,phase_result())

    def test_redirect_never_runs_or_follows_another_url(self):
        response=Response(self.source());response.status=302
        with self.assertRaises(S._Stop):self.invoke(response=response)

    def test_source_hash_mismatch_does_not_execute(self):
        with self.assertRaises(S._Stop):self.invoke(sha='0'*64)

    def test_short_and_extra_source_bytes_are_rejected(self):
        for body in (b'short',self.source()+b' '):
            with self.assertRaises(S._Stop):self.invoke(response=Response(body))

    def test_invalid_commit_cannot_select_arbitrary_source_path(self):
        for commit in ('../private','A'*40,'a'*39,True):
            with self.assertRaises(S._Stop):self.invoke(commit=commit)

    def test_source_cannot_return_native_authority(self):
        for key in ('native_qualified','native_go_consumed'):
            value=phase_result();value[key]=True
            with self.assertRaises(S._Stop):self.invoke(value=value)

    def test_client_accepts_exact_phase_complete_failure_and_all_complete(self):
        for value in (phase_result(),phase_result(failed=True),phase_result(complete=True)):
            C.validate_result(value,'admit','a'*64)

    def test_client_rejects_private_extra_fields_and_false_positive_proofs(self):
        examples=[]
        for key,value in (('private_path','SECRET_MUST_NOT_APPEAR'),('native_qualified',True),
                          ('native_go_consumed',True),('ready_sha256',False),('phase','four-tx')):
            row=phase_result();row[key]=value;examples.append(row)
        row=phase_result(failed=True);row['ready_sha256']='1'*64;examples.append(row)
        row=phase_result();row['accepted_sha256']=None;examples.append(row)
        row=phase_result();row['status']='NATIVE_QUALIFIED';examples.append(row)
        row=phase_result();row['code']='private error contents';examples.append(row)
        for row in examples:
            with self.assertRaises(ValueError):C.validate_result(row,'admit','a'*64)

    def watchdog(self, handler, duration=2, extra_pipe=False, no_space=False):
        real_fork, real_pipe = os.fork, os.pipe2
        pids, extras = [], []
        def fork():
            value=real_fork()
            if value:pids.append(value)
            return value
        def pipe(flags):
            pair=real_pipe(flags)
            if extra_pipe:extras.append(os.dup(pair[1]))
            return pair
        try:
            with patch.object(S,'_setup_qualified',return_value=True),\
                 patch.object(S,'TARGET_BASE',str(ROOT)),\
                 patch.object(S,'_setup_handle',side_effect=handler),\
                 patch.object(S,'_setup_first_failure') as record,\
                 patch.object(S.os,'fork',side_effect=fork),\
                 patch.object(S.os,'pipe2',side_effect=pipe):
                if no_space:
                    from types import SimpleNamespace
                    with patch.object(S.os,'statvfs',return_value=SimpleNamespace(f_bavail=0,f_frsize=1)):
                        result=S._setup_watchdog({}, {'deadline':time.monotonic()+duration})
                else:result=S._setup_watchdog({}, {'deadline':time.monotonic()+duration})
            for pid in pids:
                with self.assertRaises(ChildProcessError):os.waitpid(pid,os.WNOHANG)
            return result
        finally:
            for fd in extras:os.close(fd)

    def test_real_own_child_watchdog_requires_positive_exit_eof_and_native_false(self):
        self.assertEqual(self.watchdog(lambda *_:phase_result()),phase_result())
        bad=phase_result();bad['native_qualified']=True
        self.assertEqual(self.watchdog(lambda *_:bad)['status'],'FAIL_KEEP_STATE_NO_RETRY')

    def test_absolute_outer_deadline_interrupts_blocked_source_or_coordinator(self):
        def blocked(*_):
            while True:time.sleep(10)
        value=self.watchdog(blocked,duration=.1)
        self.assertEqual(value['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(value['code'],'SETUP_DEADLINE')

    def test_valid_json_without_pipe_eof_is_not_accepted(self):
        value=self.watchdog(lambda *_:phase_result(),duration=.1,extra_pipe=True)
        self.assertEqual(value['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(value['code'],'SETUP_DEADLINE')

    def test_low_space_stops_and_reaps_only_own_child(self):
        def blocked(*_):
            while True:time.sleep(10)
        value=self.watchdog(blocked,no_space=True)
        self.assertEqual(value['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(value['code'],'SETUP_FREE_SPACE')


if __name__=='__main__':unittest.main(verbosity=2)
