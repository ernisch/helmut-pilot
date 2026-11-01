"""Tiny fake read1 streams/UTC only; no network, original, GPG or test dispatch."""
import sys
sys.dont_write_bytecode=True
import base64
from datetime import datetime,timedelta,timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import socket
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('w15_tiny_transport',Path(__file__).with_name('receive_existing_inputs.py'))
E=importlib.util.module_from_spec(spec);spec.loader.exec_module(E)
PRIVATE='FICTIONAL_PRIVATE_URL_TOKEN_OR_PATH'
URL='https://fictional.oaiusercontent.com/cipher?sig='+PRIVATE
BODY=b'fictional-cipher-only'
NOW=datetime(2026,11,1,0,20,tzinfo=timezone.utc)

class Clock:
    def __init__(self):self.utc=NOW;self.mono=100
    def step(self,seconds):self.utc+=timedelta(seconds=seconds);self.mono+=seconds

class Stream:
    def __init__(self,clock,*,data=BODY,delay=0,error=None,close_error=None):
        self.clock,self.data,self.delay,self.error,self.close_error=clock,data,delay,error,close_error
        self.status=200;self.headers={'Content-Length':str(len(BODY))};self.delivered=False
        self.socket=Mock();self.fp=SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))
    def __enter__(self):return self
    def __exit__(self,*args):
        if self.close_error:raise self.close_error
        return False
    def geturl(self):return URL
    def read1(self,size):
        if self.error:raise self.error
        if self.delivered:self.fp=None;return b''
        self.delivered=True;self.clock.step(self.delay);return self.data
    def read(self,*args):raise AssertionError('read1 required')

class TransportPhaseChecks(unittest.TestCase):
    def run_download(self,*,ttl=10,delay=0,error=None,open_error=None,close_error=None,mutate=None,
                     guard=None,observer=None,file_close_signal=False,write_error=None):
        clock=Clock();stream=Stream(clock,delay=delay,error=error,close_error=close_error)
        if mutate:mutate(stream)
        opener=Mock();opener.open.side_effect=open_error if open_error else lambda *a,**k:stream
        observed=[]
        def report(value):
            observed.append(value)
            if observer:observer(value)
        temporary=tempfile.TemporaryDirectory(prefix='fictional-transport-phase-');self.addCleanup(temporary.cleanup)
        root=Path(temporary.name);pin={'index':1,'bytes':len(BODY),'sha256':hashlib.sha256(BODY).hexdigest()}
        failure=None;result=None
        real_fdopen=E.os.fdopen
        class FileFault:
            def __init__(self,stream):self.stream=stream
            def __enter__(self):return self
            def __exit__(self,*args):
                self.stream.__exit__(*args)
                if file_close_signal:raise KeyboardInterrupt(PRIVATE)
            def __getattr__(self,name):return getattr(self.stream,name)
            def write(self,data):
                if write_error:raise write_error
                return self.stream.write(data)
        def fdopen(*args):
            stream=real_fdopen(*args)
            return FileFault(stream)if file_close_signal or write_error else stream
        with patch.object(E,'datetime',SimpleNamespace(now=lambda _:clock.utc)),\
             patch.object(E.time,'monotonic',side_effect=lambda:clock.mono),\
             patch.object(E.urllib.request,'build_opener',return_value=opener),\
             patch.object(E.os,'fdopen',side_effect=fdopen),\
             patch.object(E,'TOTAL',len(BODY)),patch.object(E,'CIPHER_SHA',pin['sha256']):
            try:result=E.download(root,[URL],NOW+timedelta(seconds=ttl),[pin],guard=guard,phase_observer=report)
            except BaseException as caught:failure=caught
        return SimpleNamespace(failure=failure,result=result,phase=E.PHASE,stream=stream,opener=opener,
            observed=observed,root=root)

    def assert_phase(self,value,expected):
        self.assertIsInstance(value.failure,E.DownloadRejected)
        self.assertEqual(value.failure.phase,expected);self.assertEqual(value.phase,expected)
        self.assertEqual(value.observed,['receiver-'+expected])
        self.assertNotIn(PRIVATE,str(value.failure));self.assertNotIn(str(value.root),str(value.failure))
        self.assertLessEqual(value.opener.open.call_count,1)

    def test_mid_read_utc_expiry_is_exact_first_phase_and_timeout_cannot_outlive_link(self):
        value=self.run_download(ttl=2,delay=3)
        self.assert_phase(value,'download-expired')
        self.assertEqual(value.opener.open.call_args.kwargs['timeout'],2)
        self.assertEqual(value.stream.socket.settimeout.call_args.args,(2,))
        self.assertTrue((value.root/'part-01.PRIVATE.pgp').exists())
        self.assertEqual((value.root/'source-cipher.PRIVATE.gpg').stat().st_size,0)
        # Previously both socket calls used60s even with2s actual UTC life.
        value=self.run_download(ttl=120)
        self.assertIsNone(value.failure);self.assertEqual(value.result.read_bytes(),BODY)
        self.assertEqual(value.opener.open.call_args.kwargs['timeout'],60)

    def test_http_status_redirect_timeout_and_network_io_are_distinct_without_error_text(self):
        for error,expected in ((E.urllib.error.HTTPError(URL,403,PRIVATE,{},None),'download-http'),
            (socket.timeout(PRIVATE),'download-timeout'),
            (E.urllib.error.URLError(socket.timeout(PRIVATE)),'download-timeout'),
            (ConnectionResetError(PRIVATE),'download-io'),(RuntimeError(PRIVATE),'download-unknown'),
            (KeyboardInterrupt(PRIVATE),'download-interrupted')):
            with self.subTest(kind=type(error).__name__):self.assert_phase(self.run_download(open_error=error),expected)
        self.assert_phase(self.run_download(mutate=lambda s:setattr(s,'status',302)),'download-http')
        try:E.NoRedirect().redirect_request(None,None,302,PRIVATE,{},URL)
        except E.DownloadRejected as error:self.assertEqual(error.phase,'download-http')

    def test_length_hash_and_incomplete_stream_fail_as_integrity_and_keep_no_retry(self):
        for mutate in (lambda s:s.headers.update({'Content-Length':'999'}),
                       lambda s:setattr(s,'data',b'X'*len(BODY)),lambda s:setattr(s,'data',BODY[:-1])):
            with self.subTest(mutate=mutate):self.assert_phase(self.run_download(mutate=mutate),'download-integrity')
        self.assert_phase(self.run_download(error=E.http.client.IncompleteRead(b'PRIVATE',len(BODY))),'download-integrity')

    def test_guard_failure_stops_before_http_and_first_cause_survives_callback_and_close_signal(self):
        value=self.run_download(guard=Mock(side_effect=ValueError(PRIVATE)))
        self.assert_phase(value,'download-guard');value.opener.open.assert_not_called()
        def interrupt(_):raise KeyboardInterrupt(PRIVATE)
        value=self.run_download(ttl=2,delay=3,observer=interrupt,close_error=KeyboardInterrupt(PRIVATE))
        self.assert_phase(value,'download-expired')
        value=self.run_download(error=socket.timeout(PRIVATE),close_error=KeyboardInterrupt(PRIVATE))
        self.assert_phase(value,'download-timeout')
        value=self.run_download(open_error=E.urllib.error.HTTPError(URL,403,PRIVATE,{},None),file_close_signal=True)
        self.assert_phase(value,'download-http')
        value=self.run_download(write_error=OSError(PRIVATE),close_error=KeyboardInterrupt(PRIVATE))
        self.assert_phase(value,'download-io')
        def broken_socket(stream):stream.socket.settimeout.side_effect=socket.timeout(PRIVATE)
        self.assert_phase(self.run_download(mutate=broken_socket,close_error=KeyboardInterrupt(PRIVATE)),'download-timeout')

    def test_receiver_keeps_download_failure_when_owned_agent_cleanup_is_interrupted(self):
        observed=[]
        def failed_download(*args,**kwargs):
            E.phase('download-integrity');kwargs['phase_observer']('receiver-download-integrity')
            raise E.DownloadRejected('download-integrity')
        payload={'cipherIndex':'FICTIONAL_CIPHER','keyB64':base64.b64encode(b'FICTIONAL').decode(),
                 'passphrase':'FICTIONAL','eventInputs':{'w15_request':'FICTIONAL'}}
        with tempfile.TemporaryDirectory(prefix='fictional-agent-closure-')as tmp:
            root=Path(tmp)
            with patch.object(E,'source_binding',return_value={}),patch.object(E,'projection',return_value=[]),\
                 patch.object(E.V,'private_root',return_value=root),patch.object(E.V,'primary'),\
                 patch.object(E.os,'statvfs',return_value=SimpleNamespace(f_bavail=1024**3,f_frsize=1)),\
                 patch.object(E.A.resource,'setrlimit'),patch.object(E.A,'_run',return_value=b'FICTIONAL'),\
                 patch.object(E.A,'_binary',return_value='/FICTIONAL/gpgconf'),\
                 patch.object(E.N,'check_event',return_value=1),patch.object(E.N,'decrypt_index',return_value='FICTIONAL'),\
                 patch.object(E,'url_index',return_value=([URL],NOW+timedelta(seconds=2))),\
                 patch.object(E,'download',side_effect=failed_download),\
                 patch.object(E.subprocess,'run',side_effect=KeyboardInterrupt(PRIVATE)),\
                 patch.object(E.R,'receive')as receive:
                with self.assertRaises(ValueError)as failure:
                    E._receive_existing_verified('a'*40,str(root),private_payload=payload,
                        mode='end500-full-functional-gated',phase_observer=observed.append)
                self.assertEqual(E.PHASE,'download-integrity')
                self.assertEqual(observed[-1],'receiver-download-integrity');receive.assert_not_called()
                self.assertNotIn(PRIVATE,str(failure.exception))

if __name__=='__main__':unittest.main()
