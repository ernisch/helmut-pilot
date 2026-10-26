"""Synthetic stage boundary tests. No GPG, SSH, network or original data."""
import base64
import contextlib
import copy
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import types
import unittest
from unittest.mock import patch

from helmut_native_test_support import ROOT, load_source, source

S=load_source('server')
C=load_source('client')
SPACE_CHECK=S._stage_space
FP,SUB='A'*40,'B'*40
RECIPIENT={'primary_fingerprint':FP,'subkey_fingerprint':SUB}
DATA=b'synthetic cipher bytes'


def sha(data):return hashlib.sha256(data).hexdigest()


def url(expires=None):
    expires=int(time.time())+280 if expires is None else expires
    stamp=datetime.datetime.fromtimestamp(expires,datetime.timezone.utc).isoformat().replace('+00:00','Z')
    return 'https://'+S.STAGE_HOST+'/files/12345678-1234-1234-1234-123456789abc/raw?sig=SYNTHETIC&se='+stamp


def capsule():
    now=int(time.time())
    return {'schema':'helmut-private-drive-stage-capsule-v1','plan_sha256':S.STAGE_PLAN,
        'scope_sha256':S.STAGE_SCOPE,'recipient_fingerprint':FP,'case_id':'c'*64,
        'created_unix':now,'expires_unix':now+270,'cipher_sha256':sha(DATA),'cipher_bytes':len(DATA),
        'compressed_tar_sha256':'d'*64,'compressed_tar_bytes':20,
        'parts':[{'index':1,'bytes':len(DATA),'sha256':sha(DATA),'url':url(now+280)}]}


def statuses():
    return ('[GNUPG:] ENC_TO '+SUB[-16:]+' 18 0\n[GNUPG:] DECRYPTION_KEY '+SUB+' '+FP+' u\n'
            '[GNUPG:] DECRYPTION_INFO 2 9 0\n[GNUPG:] DECRYPTION_OKAY\n[GNUPG:] GOODMDC\n').encode()


def encrypted_fixture():
    # Syntactic packet fixture only; cryptography is mocked throughout.
    return b'\xc1\x0b\x03'+b'1'*8+b'\x12x'+b'\xd2\x03\x01xx'


def large_encrypted_fixture():
    return encrypted_fixture()[:13]+b'\xd2\xff'+(35000).to_bytes(4,'big')+b'\x01'+b'x'*34999


class Response:
    status=200
    def __init__(self,data=DATA,headers=None):
        self.body=io.BytesIO(data)
        self.headers={'Content-Length':str(len(data))}
        if headers:self.headers.update(headers)
    def read(self,n):return self.body.read(n)
    def getheader(self,name):return self.headers.get(name)


class Connection:
    def __init__(self,response=None):
        self.response=response or Response();self.closed=False;self.requests=[]
        self.sock=types.SimpleNamespace(settimeout=lambda _:None)
    def request(self,*args,**kwargs):self.requests.append((args,kwargs))
    def getresponse(self):return self.response
    def close(self):self.closed=True


class StageBoundsTests(unittest.TestCase):
    def setUp(self):
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(S,'_CONTROL_DEADLINE',time.monotonic()+60))
        self.stack.enter_context(patch.object(S,'_stage_space',side_effect=lambda extra=0:S._stage_remaining()))
        self.stack.enter_context(patch.object(S,'_first_tool_error'))

    def rejected(self,code,call):
        with self.assertRaises(S._Stop) as raised:call()
        self.assertEqual(raised.exception.code,code)

    def test_exact_schema_pins_sizes_partorder_and_clock(self):
        value=capsule()
        self.assertEqual(S._stage_validate_capsule(json.dumps(value).encode(),RECIPIENT),value)
        changes=[('scope_sha256','0'*64,'STAGE_CAPSULE_BINDING'),
                 ('recipient_fingerprint','C'*40,'STAGE_CAPSULE_BINDING'),
                 ('case_id','../../outside','STAGE_CAPSULE_BINDING'),
                 ('cipher_bytes',True,'STAGE_SIZE'),('compressed_tar_bytes',S.STAGE_TAR_CAP+1,'STAGE_SIZE'),
                 ('created_unix',int(time.time())+31,'STAGE_CAPSULE_TIME'),
                 ('expires_unix',int(time.time())+119,'STAGE_CAPSULE_TIME')]
        for key,item,code in changes:
            with self.subTest(key=key):
                changed=copy.deepcopy(value);changed[key]=item
                self.rejected(code,lambda:S._stage_validate_capsule(json.dumps(changed).encode(),RECIPIENT))
        changed=copy.deepcopy(value);changed['parts'][0]['index']=2
        self.rejected('STAGE_PARTS',lambda:S._stage_validate_capsule(json.dumps(changed).encode(),RECIPIENT))
        changed=copy.deepcopy(value);changed['parts']*=65
        self.rejected('STAGE_PARTS',lambda:S._stage_validate_capsule(json.dumps(changed).encode(),RECIPIENT))
        self.rejected('STAGE_CAPSULE_FORMAT',lambda:S._stage_json(b'{"same":1,"same":2}'))
        self.rejected('STAGE_CAPSULE_LIMIT',lambda:S._stage_json(b'x'*(65536+1)))

    def test_two_lines_exact_eof_and_base64_limit(self):
        good=base64.b64encode(encrypted_fixture())
        self.assertEqual(S._stage_read_capsule(io.BytesIO(good+b'\n')),encrypted_fixture())
        for raw in (good,good+b'\n\n',good+b'\nPRIVATE',b'\n',b'x'*(S.STAGE_CAPSULE_B64+1)+b'\n',b'%%%%\n'):
            self.rejected('STAGE_FRAME',lambda:S._stage_read_capsule(io.BytesIO(raw)))

    def test_private_urls_redirect_variants_and_expiry_rejected(self):
        expiry=int(time.time())+250;good=url(expiry)
        host,target=S._stage_url(good,expiry)
        self.assertEqual(host,S.STAGE_HOST);self.assertIn('/files/',target)
        for bad in (good.replace('https:','http:'),good.replace(S.STAGE_HOST,'127.0.0.1'),
                    good.replace(S.STAGE_HOST,'user@'+S.STAGE_HOST),good+'#fragment',
                    good.replace('/files/','/files/../'),good.replace('/raw?','/%72aw?'),
                    good.replace(S.STAGE_HOST,S.STAGE_HOST+':444'),good+'&se=x',
                    good.replace('SYNTHETIC',''),good+'\nHeader: injected',url(expiry-1)):
            self.rejected('STAGE_URL',lambda:S._stage_url(bad,expiry))

    def test_dns_rejects_any_private_result_before_connect(self):
        for address in ('127.0.0.1','10.1.1.1','169.254.169.254','100.64.0.1','::1','fc00::1'):
            with self.subTest(address=address),patch.object(S.socket,'getaddrinfo',return_value=[
                (socket.AF_INET,socket.SOCK_STREAM,6,'',(address,443))]),patch.object(S.socket,'socket') as connect:
                self.rejected('STAGE_DNS',lambda:S._stage_connect(S.STAGE_HOST));connect.assert_not_called()

    def test_tls_connects_only_checked_ip_with_fixed_sni_and_no_proxy(self):
        expected={'sdmntpritalynorth.oaiusercontent.com','sdmntprnortheu.oaiusercontent.com',
                  'sdmntprpolandcentral.oaiusercontent.com','sdmntprukwest.oaiusercontent.com'}
        self.assertEqual(S.STAGE_HOSTS,expected)
        for host in sorted(expected):
            with self.subTest(host=host):
                raw=types.SimpleNamespace(settimeout=lambda _:None,connect=unittest.mock.Mock(),close=unittest.mock.Mock())
                context=types.SimpleNamespace(wrap_socket=unittest.mock.Mock(return_value='TLS'))
                connection=types.SimpleNamespace(sock=None)
                rows=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443))]
                with patch.object(S.socket,'getaddrinfo',return_value=rows) as dns,\
                     patch.object(S.socket,'socket',return_value=raw),\
                     patch.object(S.ssl,'create_default_context',return_value=context),\
                     patch.object(S.http.client,'HTTPSConnection',return_value=connection) as https:
                    self.assertIs(S._stage_connect(host),connection)
                dns.assert_called_once_with(host,443,type=socket.SOCK_STREAM)
                self.assertEqual(https.call_args.args,(host,443))
                raw.connect.assert_called_once_with(('8.8.8.8',443))
                context.wrap_socket.assert_called_once_with(raw,server_hostname=host)

    def test_four_hosts_bind_validated_url_to_http_host_and_exact_target(self):
        expiry=int(time.time())+250
        for host in sorted(S.STAGE_HOSTS):
            for suffix in ('',':443'):
                with self.subTest(host=host,port=suffix),tempfile.TemporaryFile() as target:
                    part=capsule()['parts'][0];part['url']=url(expiry).replace(S.STAGE_HOST,host+suffix)
                    selected,path=S._stage_url(part['url'],expiry)
                    self.assertEqual(selected,host)
                    connection=Connection();whole=hashlib.sha256()
                    with patch.object(S,'_stage_connect',return_value=connection) as connect:
                        S._stage_download(part,expiry,target.fileno(),whole)
                    connect.assert_called_once_with(host)
                    args,options=connection.requests[0]
                    self.assertEqual(args,('GET',path));self.assertEqual(options['headers']['Host'],host)
                    target.seek(0);self.assertEqual(target.read(),DATA);self.assertEqual(whole.hexdigest(),sha(DATA))

    def test_nonallowlisted_authorities_fail_before_dns_tls_or_http(self):
        bad_hosts=(S.STAGE_HOST+'.evil.invalid','prefix'+S.STAGE_HOST,'user@'+S.STAGE_HOST,
                   S.STAGE_HOST+'@127.0.0.1','sdmntprwestus.oaiusercontent.com',
                   'localhost','127.0.0.1','8.8.8.8','[::1]')
        for host in bad_hosts:
            part=capsule()['parts'][0];part['url']=part['url'].replace(S.STAGE_HOST,host)
            with self.subTest(host=host),patch.object(S,'_stage_connect') as connect:
                self.rejected('STAGE_URL',lambda:S._stage_download(part,int(time.time())+250,-1,hashlib.sha256()))
                connect.assert_not_called()
            with patch.object(S.socket,'getaddrinfo') as dns:
                self.rejected('STAGE_URL',lambda:S._stage_connect(host));dns.assert_not_called()

    def test_gpg_exit_zero_literal_bad_mdc_wrong_key_and_algorithm_fail(self):
        for text,code in ((b'plaintext','STAGE_GPG_INTEGRITY'),
                         (statuses().replace(b'GOODMDC',b'BADMDC'),'STAGE_GPG_INTEGRITY'),
                         (statuses().replace(b'2 9 0',b'2 7 0'),'STAGE_GPG_INTEGRITY'),
                         (statuses().replace(SUB.encode(),b'C'*40),'STAGE_GPG_RECIPIENT')):
            result=types.SimpleNamespace(returncode=0,stdout=b'{}',stderr=text)
            with patch.object(S,'_bounded_tool',return_value=result):
                self.rejected(code,lambda:S._stage_gpg(RECIPIENT,('--status-fd=2','--decrypt'),b'cipher'))
        with patch.object(S,'_bounded_tool',return_value=types.SimpleNamespace(returncode=0,stdout=b'{}',stderr=statuses())):
            self.assertEqual(S._stage_gpg(RECIPIENT,('--status-fd=2','--decrypt'),b'cipher'),b'{}')

    def test_http_fails_before_following_redirect_or_unexpected_size(self):
        for response in (Response(headers={'Transfer-Encoding':'chunked'}),
                         Response(headers={'Content-Length':'999'}),Response(headers={'Content-Encoding':'gzip'})):
            connection=Connection(response)
            with patch.object(S,'_stage_connect',return_value=connection):
                self.rejected('STAGE_HTTP',lambda:S._stage_download(capsule()['parts'][0],int(time.time())+250,-1,hashlib.sha256()))
            self.assertTrue(connection.closed)
        response=Response();response.status=302;connection=Connection(response)
        with patch.object(S,'_stage_connect',return_value=connection):
            self.rejected('STAGE_HTTP',lambda:S._stage_download(capsule()['parts'][0],int(time.time())+250,-1,hashlib.sha256()))
        self.assertEqual(len(connection.requests),1)

    def test_embedded_source_is_exact_reviewed_bytes_and_under_bootstrap_cap(self):
        self.assertEqual(sha(S.EMBEDDED_STAGE_RESTORE_SOURCE),S.STAGE_RESTORE_SHA256)
        self.assertEqual((ROOT/'scripts/hetzner-native-stage-restore.py').read_bytes(),S.EMBEDDED_STAGE_RESTORE_SOURCE)
        self.assertEqual(S.STAGE_RESTORE_SHA256,'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88')
        self.assertLessEqual(len(source('server')),131072)
        self.assertEqual(S.NATIVE_GO_PLAN_SHA256,None)

    def test_free_floor_and_peak_admission_are_distinct(self):
        with patch.object(S.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=S.STAGE_FREE_RESERVE,f_frsize=1)):
            SPACE_CHECK()
            self.rejected('STAGE_SPACE',lambda:SPACE_CHECK(1))
        with patch.object(S.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=S.STAGE_FREE_RESERVE-1,f_frsize=1)):
            self.rejected('STAGE_SPACE',SPACE_CHECK)

    def test_gpg_output_file_rlimit_applies_to_only_own_local_child(self):
        real_popen=subprocess.Popen
        with tempfile.TemporaryDirectory() as temporary:
            output=Path(temporary)/'bounded'
            def local(arguments,**options):
                self.assertFalse(options['start_new_session'])
                return real_popen([sys.executable,'-I','-c',
                    'import sys; f=open(sys.argv[1],"wb"); f.write(b"x"*32); f.flush()',str(output)],**options)
            with patch.object(S,'TARGET_BASE',temporary),patch.object(S,'_IN_STAGE_CHILD',True),\
                 patch.object(S.subprocess,'Popen',side_effect=local),patch.object(S,'_first_tool_error'):
                result=S._bounded_tool('/usr/bin/env',('-i','PATH=/usr/bin:/bin','LC_ALL=C','/usr/bin/gpg','--no-options'),
                                       timeout=3,file_limit=8)
            self.assertNotEqual(result.returncode,0);self.assertLessEqual(output.stat().st_size,8)


class StageStateTests(unittest.TestCase):
    def setUp(self):
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.temp=tempfile.TemporaryDirectory(prefix='.synthetic-stage-',dir=ROOT)
        self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name)
        (self.base/'once').mkdir(mode=0o700)
        self.payload=b'only synthetic original bytes\n'
        self.name='files/opt/synthetic/data.bin'
        scope={'schema':'helmut-encrypted-transport-scope-v4','regularFileCount':1,
               'regularLogicalBytes':len(self.payload),'pythonDirectoriesAndLinks':[],
               'items':[{'path':'/opt/synthetic/data.bin','archiveMember':self.name,
                         'bytes':len(self.payload),'sha256':sha(self.payload),'mode':'0o600',
                         'uid':os.getuid(),'gid':os.getgid()}]}
        scope_raw=json.dumps(scope,sort_keys=True,separators=(',',':')).encode();scope_sha=sha(scope_raw)
        buffer=io.BytesIO()
        with tarfile.open(fileobj=buffer,mode='w',format=tarfile.PAX_FORMAT) as tar:
            for name,data in [('SOURCE_SCOPE.PRIVATE.json',scope_raw),(self.name,self.payload)]:
                info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o600
                info.uid=os.getuid();info.gid=os.getgid();info.mtime=1788486253
                tar.addfile(info,io.BytesIO(data))
        self.gzip=gzip.compress(buffer.getvalue())
        helper=S.EMBEDDED_STAGE_RESTORE_SOURCE.replace(S.STAGE_SCOPE.encode(),scope_sha.encode())
        # Test-only privilege adapters; all parsing, extraction and readback are real.
        helper+=b'\n_sr_admin=lambda:None\n_sr_owned=lambda info:True\n'
        for name,value in (('TARGET_BASE',str(self.base)),('_CONTROL_DEADLINE',time.monotonic()+60),
                           ('STAGE_SCOPE',scope_sha),('STAGE_ORIGINAL_FILES',1),
                           ('STAGE_ORIGINAL_BYTES',len(self.payload)),('EMBEDDED_STAGE_RESTORE_SOURCE',helper),
                           ('STAGE_RESTORE_SHA256',sha(helper))):
            self.stack.enter_context(patch.object(S,name,value))
        self.stack.enter_context(patch.object(S,'_owned',return_value=True))
        self.stack.enter_context(patch.object(S,'_open_base',side_effect=lambda path:os.open(path,S._DFLAGS)))
        self.stack.enter_context(patch.object(S,'_stage_space',side_effect=lambda extra=0:S._stage_remaining()))
        self.ready=self.stack.enter_context(patch.object(S,'_recipient_ready',return_value={}))
        self.stack.enter_context(patch.object(S,'_read_public_file',return_value=json.dumps(RECIPIENT).encode()))
        self.value=capsule();self.value['compressed_tar_bytes']=len(self.gzip)
        self.value['compressed_tar_sha256']=sha(self.gzip)
        self.request={'operation':'stage','plan_sha256':S.STAGE_PLAN,'nonce':'1'*64}
        self.context={'source_sha256':'2'*64,'stdin':io.BytesIO(base64.b64encode(encrypted_fixture())+b'\n')}
        def gpg(path,args,input=None,timeout=None,file_limit=None):
            self.assertEqual(path,'/usr/bin/env')
            if '--status-fd=2' in args:
                attempt=json.loads((self.base/'once'/(S.STAGE_PLAN+'.stage.json')).read_bytes())
                self.assertEqual(attempt,{'schema':'helmut-private-drive-stage-attempt-v1',
                    'state':'RESERVED_UNKNOWN_NO_RETRY','nonce':self.request['nonce'],
                    'source_sha256':self.context['source_sha256'],'capsule_sha256':sha(input),
                    'scope_sha256':S.STAGE_SCOPE})
                self.assertFalse((self.base/'once'/(S.STAGE_PLAN+'.stage-case.json')).exists())
                return types.SimpleNamespace(returncode=0,stdout=json.dumps(self.value).encode(),stderr=statuses())
            self.assertEqual(file_limit,len(self.gzip))
            output=Path(args[args.index('--output')+1])
            fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as stream:stream.write(self.gzip)
            return types.SimpleNamespace(returncode=0,stdout=statuses(),stderr=b'PRIVATE_GPG_MARKER')
        self.gpg=self.stack.enter_context(patch.object(S,'_bounded_tool',side_effect=gpg))
        self.connect=self.stack.enter_context(patch.object(S,'_stage_connect',side_effect=lambda host:Connection()))

    def run_stage(self):return S._stage_run(self.request,self.context)

    def test_complete_restore_private_receipt_and_atomic_ready_then_no_retry(self):
        result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_COMPLETE',result)
        self.assertFalse(result['native_qualified'])
        self.ready.assert_called_once_with(False)
        root=self.base/('stage-'+self.value['case_id'])
        self.assertEqual((root/'restored'/self.name).read_bytes(),self.payload)
        self.assertEqual((root/'restored'/self.name).stat().st_mtime_ns,1788486253*10**9)
        self.assertEqual(sha((root/'STAGE_RECEIPT.PRIVATE.json').read_bytes()),result['receipt_sha256'])
        self.assertTrue((self.base/'STAGE_READY.SAFE.json').exists())
        self.assertFalse((self.base/'STAGE_READY.PENDING.SAFE.json').exists())
        binding=json.loads((self.base/'once'/(S.STAGE_PLAN+'.stage-case.json')).read_bytes())
        self.assertEqual(binding,{'schema':'helmut-private-drive-stage-case-binding-v1',
            'nonce':self.request['nonce'],'source_sha256':self.context['source_sha256'],
            'capsule_sha256':sha(encrypted_fixture()),'case_id':self.value['case_id'],'scope_sha256':S.STAGE_SCOPE})
        self.assertEqual(sorted(path.name for path in root.iterdir()),
                         ['STAGE_RECEIPT.PRIVATE.json','payload.cipher.pgp','payload.tar.gz','restored'])
        self.context['stdin']=io.BytesIO(base64.b64encode(encrypted_fixture())+b'\n')
        self.assertEqual(self.run_stage()['code'],'STAGE_ALREADY_ATTEMPTED')
        self.assertEqual(self.connect.call_count,1)

    def test_partial_download_preserved_unknown_attempt_cannot_restart(self):
        def partial(part,expires,fd,whole):
            os.write(fd,b'partial');raise S._Stop('STAGE_HTTP')
        with patch.object(S,'_stage_download',side_effect=partial):result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_HTTP')
        self.assertIsNone(result['actual_file_count']);self.assertIsNone(result['actual_bytes'])
        root=self.base/('stage-'+self.value['case_id'])
        self.assertEqual((root/'payload.cipher.pgp').read_bytes(),b'partial')
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())
        self.context['stdin']=io.BytesIO(base64.b64encode(encrypted_fixture())+b'\n')
        self.value['case_id']='e'*64
        self.assertEqual(self.run_stage()['code'],'STAGE_ALREADY_ATTEMPTED')
        self.connect.assert_not_called()

    def assert_first_decrypt_interruption_locks_new_request(self,mode,expected):
        marker=self.base/'entered-first-decrypt'
        def interrupted(*args,**kwargs):
            marker.write_bytes(b'only synthetic GPG entry')
            if mode=='timeout':time.sleep(5)
            else:os._exit(7)
        with patch.object(S,'_stage_gpg',side_effect=interrupted),\
             patch.object(S,'_CONTROL_DEADLINE',time.monotonic()+(.2 if mode=='timeout' else 2)):
            result=S._stage_handle(self.request,self.context)
        self.assertTrue(marker.exists())
        self.assertEqual(result['code'],expected)
        self.assertIsNone(result['actual_file_count']);self.assertIsNone(result['actual_bytes'])
        attempt=self.base/'once'/(S.STAGE_PLAN+'.stage.json')
        before=attempt.read_bytes();reservation=json.loads(before)
        self.assertEqual(reservation['state'],'RESERVED_UNKNOWN_NO_RETRY')
        self.assertEqual(reservation['nonce'],'1'*64)
        self.assertEqual(reservation['capsule_sha256'],sha(encrypted_fixture()))
        self.assertFalse((self.base/'once'/(S.STAGE_PLAN+'.stage-case.json')).exists())
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())
        # A new nonce, source version, ciphertext and case cannot reset the slot.
        self.request['nonce']='9'*64;self.context['source_sha256']='4'*64
        self.value['case_id']='e'*64
        self.context['stdin']=io.BytesIO(base64.b64encode(large_encrypted_fixture())+b'\n')
        with patch.object(S,'_stage_gpg',side_effect=AssertionError('must stay locked')) as decrypt:
            retry=self.run_stage()
        self.assertEqual(retry['code'],'STAGE_ALREADY_ATTEMPTED');decrypt.assert_not_called()
        self.assertEqual(attempt.read_bytes(),before);self.connect.assert_not_called()

    def test_first_decrypt_timeout_leaves_durable_unknown_slot(self):
        self.assert_first_decrypt_interruption_locks_new_request('timeout','STAGE_DEADLINE')

    def test_first_decrypt_child_loss_leaves_durable_unknown_slot(self):
        self.assert_first_decrypt_interruption_locks_new_request('loss','STAGE_CHILD')

    def test_capsule_validation_failure_never_releases_reserved_slot(self):
        self.value['scope_sha256']='0'*64
        result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_CAPSULE_BINDING')
        self.assertEqual(self.gpg.call_count,1)
        attempt=self.base/'once'/(S.STAGE_PLAN+'.stage.json');before=attempt.read_bytes()
        self.assertFalse((self.base/'once'/(S.STAGE_PLAN+'.stage-case.json')).exists())
        self.request['nonce']='9'*64;self.value['case_id']='e'*64;self.value['scope_sha256']=S.STAGE_SCOPE
        self.context['stdin']=io.BytesIO(base64.b64encode(large_encrypted_fixture())+b'\n')
        retry=self.run_stage()
        self.assertEqual(retry['code'],'STAGE_ALREADY_ATTEMPTED')
        self.assertEqual(self.gpg.call_count,1);self.assertEqual(attempt.read_bytes(),before)
        self.connect.assert_not_called()

    def test_corrupt_archive_never_calls_restore_or_marks_ready(self):
        self.value['compressed_tar_sha256']='0'*64
        with patch.object(S,'_stage_finish') as finish:result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_HASH');finish.assert_not_called()
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())

    def test_whole_cipher_hash_mismatch_blocks_payload_decryption(self):
        self.value['cipher_sha256']='0'*64
        result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_HASH');self.assertEqual(self.gpg.call_count,1)
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())

    def test_real_restore_hash_failure_keeps_partial_and_private_receipt(self):
        raw=gzip.decompress(self.gzip).replace(self.payload,b'z'*len(self.payload))
        self.gzip=gzip.compress(raw)
        self.value['compressed_tar_bytes']=len(self.gzip)
        self.value['compressed_tar_sha256']=sha(self.gzip)
        result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_RESTORE')
        self.assertIsNone(result['actual_file_count']);self.assertIsNone(result['actual_bytes'])
        root=self.base/('stage-'+self.value['case_id'])/'restored'
        self.assertEqual((root/self.name).read_bytes(),b'z'*len(self.payload))
        receipt=json.loads((root/'RESTORE_RECEIPT.PRIVATE.json').read_bytes())
        self.assertFalse(receipt['ok']);self.assertEqual(receipt['code'],'FILE_HASH')
        self.assertNotIn(self.name,json.dumps(result))
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())

    def test_fsync_failure_after_ledger_does_not_download_or_mark_ready(self):
        real=S.os.fsync
        def failed(fd):
            if (self.base/'once'/(S.STAGE_PLAN+'.stage.json')).exists():raise OSError('PRIVATE_IO_MARKER')
            return real(fd)
        with patch.object(S.os,'fsync',side_effect=failed):result=self.run_stage()
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.connect.assert_not_called()
        self.assertTrue((self.base/'once'/(S.STAGE_PLAN+'.stage.json')).exists())
        self.gpg.assert_not_called()
        self.assertNotIn('PRIVATE_IO_MARKER',json.dumps(result))
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())

    def test_ready_rename_failure_keeps_pending_and_private_originals(self):
        with patch.object(S,'_stage_publish_ready',side_effect=OSError('PRIVATE_COMMIT_MARKER')):result=self.run_stage()
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertTrue((self.base/'STAGE_READY.PENDING.SAFE.json').exists())
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())
        self.assertEqual((self.base/('stage-'+self.value['case_id'])/'restored'/self.name).read_bytes(),self.payload)
        self.assertNotIn('PRIVATE_COMMIT_MARKER',json.dumps(result))

    def test_atomic_ready_never_replaces_existing_entry(self):
        pending=self.base/'STAGE_READY.PENDING.SAFE.json';ready=self.base/'STAGE_READY.SAFE.json'
        pending.write_bytes(b'candidate');ready.write_bytes(b'existing')
        fd=os.open(self.base,S._DFLAGS)
        try:
            with self.assertRaises(S._Stop) as raised:S._stage_publish_ready(fd)
            self.assertEqual(raised.exception.code,'STAGE_COMMIT')
        finally:os.close(fd)
        self.assertEqual(ready.read_bytes(),b'existing');self.assertEqual(pending.read_bytes(),b'candidate')

    def corrupt_commit_file(self,name):
        original=S._write_new
        def write(directory,item,data):
            original(directory,item,data)
            if item==name:
                fd=os.open(item,os.O_WRONLY|os.O_TRUNC|os.O_NOFOLLOW,dir_fd=directory)
                try:os.write(fd,b'corrupt synthetic receipt')
                finally:os.close(fd)
        with patch.object(S,'_write_new',side_effect=write):result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_RECEIPT')
        self.assertIsNone(result['actual_file_count']);self.assertIsNone(result['actual_bytes'])
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())
        self.assertEqual((self.base/('stage-'+self.value['case_id'])/'restored'/self.name).read_bytes(),self.payload)

    def test_private_receipt_readback_failure_blocks_ready(self):
        self.corrupt_commit_file('STAGE_RECEIPT.PRIVATE.json')

    def test_pending_ready_readback_failure_blocks_publication(self):
        self.corrupt_commit_file('STAGE_READY.PENDING.SAFE.json')

    def test_small_commit_readback_uses_noatime_and_exact_bytes(self):
        path=self.base/'synthetic-receipt';path.write_bytes(b'expected');path.chmod(0o600)
        os.utime(path,ns=(1000000000,2000000000))
        fd=os.open(self.base,S._DFLAGS)
        try:
            S._stage_readback(fd,path.name,b'expected')
            self.assertEqual(path.stat().st_atime_ns,1000000000)
            with self.assertRaises(S._Stop) as raised:S._stage_readback(fd,path.name,b'different')
            self.assertEqual(raised.exception.code,'STAGE_RECEIPT')
        finally:os.close(fd)

    def test_readonly_directory_close_errors_do_not_reverse_published_ready(self):
        original_close=S.os.close;original_publish=S._stage_publish_ready;published=[]
        def publish(fd):
            original_publish(fd);published.append(True)
        def close(fd):
            directory=bool(os.fstat(fd).st_mode & 0o040000)
            original_close(fd)
            if published and directory:raise OSError('synthetic read-only close')
        with patch.object(S,'_stage_publish_ready',side_effect=publish),patch.object(S.os,'close',side_effect=close):
            result=self.run_stage()
        self.assertEqual(result['code'],'STAGE_COMPLETE')
        self.assertTrue((self.base/'STAGE_READY.SAFE.json').exists())
        self.assertFalse((self.base/'STAGE_FIRST_ERROR.SAFE.json').exists())

    def test_monitored_child_timeout_preserves_written_state(self):
        marker=self.base/'synthetic-pending'
        def blocked(request,context):
            marker.write_bytes(b'unknown');time.sleep(5)
        with patch.object(S,'_stage_run',side_effect=blocked),patch.object(S,'_CONTROL_DEADLINE',time.monotonic()+.15):
            result=S._stage_handle(self.request,self.context)
        self.assertEqual(result['code'],'STAGE_DEADLINE')
        self.assertIsNone(result['actual_file_count']);self.assertIsNone(result['actual_bytes'])
        self.assertEqual(marker.read_bytes(),b'unknown')


class StageClientTests(unittest.TestCase):
    def environment(self,temporary):
        return {'GITHUB_REPOSITORY':C.REPOSITORY,'GITHUB_REPOSITORY_OWNER':'ernisch',
            'GITHUB_REF':C.BRANCH,'GITHUB_WORKFLOW_REF':C.WORKFLOW_REF,'GITHUB_EVENT_NAME':'workflow_dispatch',
            'HELMUT_NATIVE_OPERATION':'stage','HELMUT_NATIVE_PLAN_SHA256':C.STAGE_PLAN,
            'HELMUT_NATIVE_PAYLOAD_SHA256':'2'*64,'RUNNER_TEMP':temporary,
            'HELMUT_NATIVE_STAGE_CAPSULE':base64.b64encode(encrypted_fixture()).decode()}

    def test_client_only_accepts_recipient_encrypted_packet_frame(self):
        good={'HELMUT_NATIVE_STAGE_CAPSULE':base64.b64encode(encrypted_fixture()).decode()}
        line,raw=C.stage_capsule(good,'stage')
        self.assertEqual(line,base64.b64encode(raw)+b'\n')
        for bad in ('',url(),base64.b64encode(b'{"private_url":"value"}').decode(),
                    'A'*(C.MAX_STAGE_CAPSULE+1),good['HELMUT_NATIVE_STAGE_CAPSULE']+'\n'):
            with self.assertRaisesRegex(ValueError,'^stage-capsule$'):
                C.stage_capsule({'HELMUT_NATIVE_STAGE_CAPSULE':bad},'stage')
        with self.assertRaisesRegex(ValueError,'^stage-capsule$'):C.stage_capsule(good,'status')

    def test_bidirectional_exchange_drains_output_before_child_reads_large_input(self):
        command=[sys.executable,'-I','-c',
            "import sys; sys.stdout.buffer.write(b'o'*100000); sys.stdout.buffer.flush(); "
            "data=sys.stdin.buffer.read(); sys.stdout.buffer.write(str(len(data)).encode()); sys.exit(1)"]
        raw=b'{}\n'+b'A'*48000+b'\n'
        output,code=C.bounded_exchange(command,raw,timeout=3,include_returncode=True)
        self.assertEqual(code,1);self.assertEqual(output,b'o'*100000+str(len(raw)).encode())
        with self.assertRaisesRegex(ValueError,'^ssh-timeout$'):
            C.bounded_exchange([sys.executable,'-I','-c','import time;time.sleep(2)'],raw,timeout=.05)

    def test_valid_failure_is_saved_before_client_returns_failure_even_nonzero_ssh(self):
        with tempfile.TemporaryDirectory() as temporary:
            env=self.environment(temporary)
            sent=C.request('stage',C.STAGE_PLAN,'2'*64,'3'*64)
            result=S._stage_result('STAGE_HTTP',sha(encrypted_fixture()))
            reply=dict(sent,schema='helmut-native-control-response-v1',result=result,
                       result_sha256=sha(C.canonical(result)))
            with patch.object(C.secrets,'token_hex',return_value='3'*64),\
                 patch.object(C,'transport_configuration',return_value=('100.64.0.1','PUBLIC','PRIVATE')),\
                 patch.object(C,'bounded_exchange',return_value=(C.canonical(reply),1)) as exchange,\
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(C.client(env),1)
            sent_bytes=exchange.call_args.args[1]
            self.assertEqual(sent_bytes.count(b'\n'),2)
            self.assertEqual(set(json.loads(sent_bytes.splitlines()[0])),
                             {'schema','operation','nonce','plan_sha256','payload_sha256'})
            artifact=Path(temporary)/'helmut-native-public'/'RESPONSE.SAFE.json'
            self.assertEqual(json.loads(artifact.read_bytes())['result']['code'],'STAGE_HTTP')
            self.assertNotIn(b'PRIVATE',artifact.read_bytes())

    def test_early_epipe_drains_real_child_and_only_preserves_bound_safe_failure(self):
        real_popen=subprocess.Popen;real_write=os.write
        raw=large_encrypted_fixture()
        self.assertLessEqual(len(base64.b64encode(raw)),C.MAX_STAGE_CAPSULE)
        for mode in ('valid-fail','wrong-nonce','early-ready'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as temporary:
                env=self.environment(temporary)
                env['HELMUT_NATIVE_STAGE_CAPSULE']=base64.b64encode(raw).decode()
                result=S._stage_result('RECIPIENT_EXPIRED')
                if mode=='early-ready':
                    result=S._stage_result('STAGE_COMPLETE',sha(raw),capsule(),
                        {'actual_file_count':1767,'actual_bytes':2865680705},'b'*64)
                script=('import os,sys,json,hashlib,base64\n'
                    'sent=json.loads(sys.stdin.buffer.readline())\n'
                    'os.close(0)\n'
                    'result=json.loads(base64.b64decode(sys.argv[1]))\n'
                    'reply=dict(sent,schema="helmut-native-control-response-v1",result=result)\n'
                    'reply["result_sha256"]=hashlib.sha256(json.dumps(result,sort_keys=True,separators=(",",":")).encode()).hexdigest()\n'
                    'if sys.argv[2]=="wrong-nonce":reply["nonce"]="0"*64\n'
                    'print(json.dumps(reply,sort_keys=True,separators=(",",":")),flush=True)\n'
                    'sys.exit(0 if sys.argv[2]=="early-ready" else 1)\n')
                command=[sys.executable,'-I','-c',script,base64.b64encode(C.canonical(result)).decode(),mode]
                broken=[]
                def own_child(arguments,**options):
                    self.assertEqual(arguments,command)
                    # Force pending input larger than the pipe on every Linux
                    # host; this remains a real child and real EPIPE syscall.
                    return real_popen(arguments,pipesize=4096,**options)
                def write(fd,data):
                    try:return real_write(fd,data)
                    except BrokenPipeError:broken.append(True);raise
                with patch.object(C.secrets,'token_hex',return_value='3'*64),\
                     patch.object(C,'transport_configuration',return_value=('100.64.0.1','PUBLIC','PRIVATE')),\
                     patch.object(C,'ssh_arguments',return_value=command),\
                     patch.object(C.subprocess,'Popen',side_effect=own_child),\
                     patch.object(C.os,'write',side_effect=write),contextlib.redirect_stdout(io.StringIO()):
                    if mode=='valid-fail':self.assertEqual(C.client(env),1)
                    else:
                        code='response-binding' if mode=='wrong-nonce' else 'ssh-failed'
                        with self.assertRaisesRegex(ValueError,'^'+code+'$'):C.client(env)
                self.assertTrue(broken,'test must observe a real EPIPE')
                artifact=Path(temporary)/'helmut-native-public'/'RESPONSE.SAFE.json'
                self.assertEqual(artifact.exists(),mode=='valid-fail')
                if artifact.exists():
                    reply=json.loads(artifact.read_bytes())
                    self.assertEqual(reply['nonce'],'3'*64)
                    self.assertEqual(reply['result']['code'],'RECIPIENT_EXPIRED')
                    self.assertIsNone(reply['result']['actual_file_count'])
                    self.assertIsNone(reply['result']['actual_bytes'])

    def test_ready_requires_exact_counts_receipt_pins_and_native_false(self):
        value=capsule()
        result=S._stage_result('STAGE_COMPLETE','a'*64,value,
            {'actual_file_count':1767,'actual_bytes':2865680705},'b'*64)
        C.validate_result(result,'stage','2'*64)
        for key,item in (('native_qualified',True),('receipt_sha256',None),
                         ('actual_file_count',1766),('scope_sha256','0'*64),
                         ('private_paths',['PRIVATE'])):
            changed=copy.deepcopy(result);changed[key]=item
            with self.assertRaises(ValueError):C.validate_result(changed,'stage','2'*64)
        failed=S._stage_result('STAGE_RESTORE')
        C.validate_result(failed,'stage','2'*64)
        for key in ('actual_file_count','actual_bytes'):
            changed=copy.deepcopy(failed);changed[key]=0
            with self.assertRaises(ValueError):C.validate_result(changed,'stage','2'*64)

    def test_workflow_failure_artifact_is_uploaded_then_job_fails(self):
        text=(ROOT/'.github/workflows/hetzner-native-automation.yml').read_text()
        self.assertIn('HELMUT_NATIVE_STAGE_CAPSULE: ${{ inputs.stageCapsule }}',text)
        self.assertIn('continue-on-error: true',text)
        self.assertIn("always() && steps.verify.outcome == 'success'",text)
        self.assertLess(text.index('Publish validated public JSON'),text.index('Preserve validated failure artifact'))
        self.assertIn("steps.exchange.outcome != 'success'",text)
        self.assertIn('case "$HELMUT_NATIVE_OPERATION" in status|recipient|stage)',text)


if __name__=='__main__':unittest.main(verbosity=2)


