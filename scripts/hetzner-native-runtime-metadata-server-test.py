"""Synthetic control framing, historical source binding and fork watchdog checks."""
import hashlib
import io
import json
import os
from pathlib import Path
import time
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-automation-server.py')
fd = os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
with os.fdopen(fd, 'rb') as stream: RAW = stream.read()
M = types.ModuleType('runtime_metadata_server_synthetic')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)


def encoded(value):
    return (json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode('ascii')


class RuntimeMetadataServerTests(unittest.TestCase):
    def setUp(self):
        now=int(time.time())
        self.capsule={'schema':'helmut-runtime-metadata-capsule-v1','contract_id':M.RUNTIME_METADATA_ID,
            'action':'read','chunk':0,'source_sha256':'b'*64,'contract_sha256':M.RUNTIME_METADATA_CONTRACT_SHA256,
            'nonce':'c'*64,'issued_at_utc':now,'expires_at_utc':now+240}
        self.raw=encoded(self.capsule)
        self.context={'base':M.TARGET_BASE,'source_sha256':'b'*64,'deployment_commit':'a'*40,
            'deadline':time.monotonic()+200,'stdin':io.BytesIO(self.raw)}
        self.request={'schema':'helmut-native-control-request-v1','operation':'status','plan_sha256':M.STAGE_PLAN,
            'payload_sha256':'b'*64,'nonce':hashlib.sha256(b'helmut-runtime-metadata-request-v1\0'+self.raw).hexdigest()}

    def test_exact_runtime_capsule_is_distinct_and_requires_canonical_eof(self):
        self.assertEqual(M._setup_read_capsule(self.context),self.capsule)
        for raw in (self.raw+b'\n',self.raw+self.raw,self.raw[:-1],json.dumps(self.capsule).encode()+b'\n',
                    self.raw.replace(b'"chunk":0',b'"chunk":0,"chunk":0')):
            with self.subTest(raw=raw[:55]),self.assertRaises(Exception):
                M._setup_read_capsule({**self.context,'stdin':io.BytesIO(raw)})
        for delta in ({'chunk':True},{'chunk':-1},{'chunk':4},{'action':'setup'},{'phase':None},
                      {'contract_sha256':'e'*64},{'issued_at_utc':True},{'expires_at_utc':now_value()-1},
                      {'expires_at_utc':now_value()+301},{'issued_at_utc':now_value()+30}):
            with self.subTest(delta=delta),self.assertRaises(Exception):
                M._setup_read_capsule({**self.context,'stdin':io.BytesIO(encoded(self.capsule|delta))})

    def test_exact_runtime_request_routes_only_status_before_effect(self):
        answer=M._runtime_metadata_failure('SYNTHETIC_STOP',self.capsule,self.context)
        with patch.object(M,'_setup_watchdog',return_value=answer) as invoke:
            self.assertEqual(M.handle(self.request,self.context),answer)
            self.assertEqual(invoke.call_args.kwargs,{'runtime_capsule':self.capsule})
        for delta in ({'operation':'admit'},{'plan_sha256':'e'*64},{'payload_sha256':'e'*64},
                      {'nonce':'e'*64},{'schema':'other'},{'unexpected':True}):
            with self.subTest(delta=delta),patch.object(M,'_setup_watchdog') as invoke:
                with self.assertRaises(Exception):
                    M.handle(self.request|delta,self.context|{'stdin':io.BytesIO(self.raw)})
                invoke.assert_not_called()

    def test_unqualified_reader_stops_without_public_fetch_or_private_publication(self):
        with patch.object(M,'RUNTIME_METADATA_SHA256',None),patch.object(M,'_setup_public_source') as fetch,\
             patch.object(M,'_setup_first_failure') as publish:
            with self.assertRaises(M._Stop):M._runtime_metadata_handle(self.request,self.context,self.capsule)
            fetch.assert_not_called();publish.assert_not_called()

    def test_fixed_reader_and_all_historical_pins_are_checked_before_entry(self):
        sha=lambda raw:hashlib.sha256(raw).hexdigest()
        asset=b'SYNTHETIC_ASSET=True\n'
        preflight=b'SYNTHETIC_PREFLIGHT=True\n'
        successor=b'SYNTHETIC_SUCCESSOR=True\n'
        library=(b'FILES={"guard.py":"hetzner-native-setup-service.py"}\n'
            b'def asset_pins():return {"guard.py":{}},"synthetic-asset-set"\n'
            b'def load_assets(context,expected):\n'
            b' assert context["deployment_commit"]=="18c2736ac4da2cf946ccb4494ad2963091de7d32"\n'
            b' assert context["source_sha256"]=="afbccf72ad9f60ea84091567268c3b7927bcc6df9d99dac0c5da61e27e546a85"\n'
            b' return {},{"guard.py":{"__source_bytes__":b"SYNTHETIC_ASSET=True\\n"}}\n')
        rows={'library':('hetzner-native-setup-coordinator.py',library),
            'preflight':('hetzner-native-setup-successor-preflight.py',preflight),
            'successor':('hetzner-native-setup-successor.py',successor),
            'guard.py':('hetzner-native-setup-service.py',asset)}
        pins={key:{'repoFile':name,'sha256':sha(raw),'bytes':len(raw)} for key,(name,raw) in rows.items()}
        reader=('CONTRACT_ID='+repr(M.RUNTIME_METADATA_ID)+'\nCONTRACT_SHA256='+repr(self.capsule['contract_sha256'])+
            '\nMODULE_PINS='+repr(pins)+'\ndef read_runtime_metadata(chunk,context,qualified):\n'
            ' assert chunk==0 and set(context)=={"base","source_sha256","deployment_commit","deadline"}\n'
            ' return {"synthetic":"entry","source_sha256":context["source_sha256"]}\n').encode()
        by_path={'scripts/'+name:raw for name,raw in rows.values()}
        by_path['scripts/hetzner-native-runtime-metadata.py']=reader
        calls=[]
        def fetch(commit,path,deadline,limit,expected_sha=None,expected_bytes=None):
            raw=by_path[path];calls.append((commit,path))
            self.assertEqual((sha(raw),len(raw)),(expected_sha,expected_bytes))
            self.assertEqual(commit,'a'*40 if path.endswith('runtime-metadata.py') else M.RUNTIME_SETUP_COMMIT)
            return raw
        with patch.object(M,'_setup_public_source',side_effect=fetch),\
             patch.object(M,'RUNTIME_METADATA_SHA256',sha(reader)),patch.object(M,'RUNTIME_METADATA_BYTES',len(reader)),\
             patch.object(M,'SETUP_COORDINATOR_SHA256',sha(library)),patch.object(M,'SETUP_COORDINATOR_BYTES',len(library)),\
             patch.object(M,'SETUP_SUCCESSOR_PREFLIGHT_SHA256',sha(preflight)),patch.object(M,'SETUP_SUCCESSOR_PREFLIGHT_BYTES',len(preflight)),\
             patch.object(M,'SETUP_SUCCESSOR_COORDINATOR_SHA256',sha(successor)),patch.object(M,'SETUP_SUCCESSOR_COORDINATOR_BYTES',len(successor)):
            answer=M._runtime_metadata_handle(self.request,self.context,self.capsule)
        self.assertEqual(answer,{'synthetic':'entry','source_sha256':'b'*64});self.assertEqual(len(calls),4)

    def watchdog(self,result=None,invoke=None,seconds=2):
        context=self.context|{'deadline':time.monotonic()+seconds}
        if invoke is None:invoke=lambda *_:result
        with patch.object(M,'_runtime_metadata_qualified',return_value=True),\
             patch.object(M,'_runtime_metadata_handle',side_effect=invoke),\
             patch.object(M.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=10000000,f_frsize=4096)),\
             patch.object(M,'_setup_first_failure',side_effect=AssertionError('no historical writes')) as publish:
            answer=M._setup_watchdog(self.request,context,runtime_capsule=self.capsule)
            publish.assert_not_called()
        return answer

    def test_runtime_large_metadata_body_has_own_cap_and_fork_transport(self):
        result={'schema':'helmut-runtime-binding-metadata-read-v1','status':'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED',
                'data_base64':'a'*90000,'native_qualified':False,'native_go_consumed':False}
        self.assertEqual(self.watchdog(result),result)
        result['data_base64']='a'*131072
        answer=self.watchdog(result)
        self.assertEqual(answer['status'],'FAIL_CLOSED_NOT_NATIVE_QUALIFIED');self.assertIsNone(answer['data_base64'])

    def test_runtime_error_and_timeout_keep_legacy_history_untouched(self):
        def fail(*_):raise M._Stop('SYNTHETIC_RO_STOP')
        answer=self.watchdog(invoke=fail)
        self.assertEqual(answer['code'],'SYNTHETIC_RO_STOP');self.assertIsNone(answer['data_base64'])
        def block(*_):time.sleep(3)
        started=time.monotonic();answer=self.watchdog(invoke=block,seconds=.08)
        self.assertLess(time.monotonic()-started,1)
        self.assertEqual(answer['code'],'SETUP_DEADLINE');self.assertIsNone(answer['data_base64'])


def now_value():return int(time.time())


if __name__=='__main__':unittest.main()
