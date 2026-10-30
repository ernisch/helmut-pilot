"""Fictional 15-link ordering/expiry/attempt tests; no real API, keys or transfer."""
import sys
sys.dont_write_bytecode = True
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zlib

SPEC = importlib.util.spec_from_file_location('w15_diagnostic_sender_tested', Path(__file__).with_name('restore_diagnostic_dispatch.py'))
D = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(D)
TARGET, NONCE = 'a' * 40, '26d5a413-5ca7-415c-a412-62fc45b561c8'
PRIVATE = 'FICTIONAL_NOT_A_REAL_SIGNATURE'


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc)
    def __call__(self): return self.value
    def advance(self, seconds): self.value += timedelta(seconds=seconds)


def review():
    return {'schema': D.REVIEW_SCHEMA, 'scope': D.SCOPE, 'exactCommit': TARGET,
        'status': 'PASS_INDEPENDENT_STATIC_CODE_REVIEW_ONLY', 'independentOfImplementation': True,
        'remainingCriticalOrHighCodeFindings': 0, 'executionAuthority': False}


def packets(root, clock):
    qualification = {'schema': 'helmut-w15-static-source-qualification/1', 'scope': 'ISOLATED_GITHUB_W15_SOURCE_ONLY',
        'status': 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW', 'exactCommit': TARGET, 'sourcePins': {},
        'historicalDeltas': [], 'executionAuthority': False, 'testStarted': False}
    raw = D.canonical(qualification)
    envelope = {'encoding': 'zlib-base64', 'sha256': hashlib.sha256(raw).hexdigest(),
                'data': base64.b64encode(zlib.compress(raw)).decode('ascii')}
    issued, expires = clock().strftime('%Y-%m-%dT%H:%M:%SZ'), (clock()+timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
    approval = {'schema': 'helmut-w15-workflow-start-approval/1', 'scope': D.SCOPE, 'authorized': True,
        'exactCommit': TARGET, 'branch': 'refs/heads/' + D.BRANCH, 'runAttempt': 1, 'nonce': NONCE,
        'mode': D.MODE, 'limits': D.W.LIMITS, 'maximumWallSeconds': 1800,
        'sourceQualificationSHA256': envelope['sha256'], 'maxReceiveAttempts': 1,
        'issuedAt': issued, 'expiresAt': expires, 'maxStorageUSD': '0', 'maxProviderCalls': 0}
    request = {'nonce': NONCE, 'sourceQualification': envelope, 'approval': approval,
               'limits': D.W.LIMITS, 'maximumWallSeconds': 1800}
    outer = {'schema': 'helmut-w15-restore-diagnostic-dispatch-approval/1', 'scope': D.SCOPE, 'authorized': True,
        'targetCommit': TARGET, 'launcherCommit': TARGET, 'branch': D.BRANCH, 'environment': D.ENVIRONMENT,
        'workflowId': D.WORKFLOW, 'nonce': NONCE, 'runAttempt': 1, 'maxReceiveAttempts': 1,
        'targetCI': 12345678, 'targetPR': 999, 'reviewSHA256': hashlib.sha256(D.canonical(review())).hexdigest(),
        'requestSHA256': hashlib.sha256(D.canonical(request)).hexdigest(), 'advanceAllowedBranch': True,
        'stateDir': str(root), 'issuedAt': issued, 'expiresAt': expires}
    return outer, request


def armor(count=48):
    data = base64.b64encode(b'\x84' + b'x' * count).decode('ascii')
    return '-----BEGIN PGP MESSAGE-----\n\n' + '\n'.join(data[i:i+64] for i in range(0,len(data),64)) + '\n-----END PGP MESSAGE-----'


def links(clock, margin=150, **changes):
    query = {'se': D.M.iso(clock()+timedelta(seconds=margin)), 'sp':'r', 'sr':'b', 'sig': PRIVATE}
    query.update(changes)
    return ['https://fictional.oaiusercontent.com/part-' + str(i) + '?' + D.M.urllib.parse.urlencode(query) for i in range(1,16)]


class API:
    def __init__(self, events, clock, fail=None, delay=0):
        self.events,self.clock,self.fail,self.delay=events,clock,fail,delay
        self.ref='b'*40;self.posts=[];self.ref_reads=0
    def __call__(self,method,path,body=None):
        self.events.append((method,path))
        if method=='POST':
            self.posts.append(body)
            if self.fail=='post':raise RuntimeError(PRIVATE)
            return None
        if self.fail=='ci' and path.startswith('/actions/runs/'):raise RuntimeError(PRIVATE)
        if path.startswith('/pulls/'):
            record=review()
            if self.fail=='review':record['remainingCriticalOrHighCodeFindings']=1
            return {'state':'open','merged':False,'head':{'sha':TARGET},'body':'```json\n'+D.canonical(record).decode()+'\n```'}
        if '/jobs?' in path:
            jobs=[{'name':name,'status':'completed','conclusion':'success'} for name in D.M.CHECKS]
            return {'total_count':2,'jobs':jobs}
        if path.startswith('/actions/runs/'):
            return {'head_sha':TARGET,'status':'completed','conclusion':'success','workflow_id':D.WORKFLOW}
        if path.startswith('/actions/workflows/'):
            return {'id':D.WORKFLOW,'state':'active','path':'.github/workflows/ci.yml'}
        if path.endswith('/deployment-branch-policies'):
            return {'total_count':1,'branch_policies':[{'name':D.BRANCH,'type':'branch'}]}
        if path.startswith('/environments/'):
            return {'name':D.ENVIRONMENT,'deployment_branch_policy':{'protected_branches':False,'custom_branch_policies':True},'protection_rules':[{'type':'branch_policy'}]}
        if method=='PATCH':
            if self.fail=='patch':raise RuntimeError(PRIVATE)
            assert body=={'sha':TARGET,'force':False}
            self.ref=body['sha'];return {'object':{'sha':self.ref}}
        if path.startswith('/git/ref/'):
            self.ref_reads+=1
            if self.ref_reads==2:
                self.clock.advance(self.delay)
                if self.fail=='readback':raise RuntimeError(PRIVATE)
            return {'object':{'sha':self.ref}}
        raise AssertionError('unexpected fictional route')


class DispatchChecks(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory(prefix='w15-fictional-diagnostic-sender-');self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name);self.root.chmod(0o700)
        self.clock=Clock();self.events=[];self.go,self.request=packets(self.root,self.clock)
        self.api=API(self.events,self.clock)
        self.git=SimpleNamespace(check_launcher=Mock(),is_ancestor=Mock(return_value=True),qualify=Mock())
    def run_case(self, margin=150, encode_delay=0, given_links=None, encoded=None, cleanup=None, state_dir=None):
        def ready():self.events.append(('READY',None))
        def provider():self.events.append(('LINKS',None));return links(self.clock,margin) if given_links is None else given_links
        def encrypt(raw,target,root):
            self.events.append(('ENCRYPT',None));self.clock.advance(encode_delay)
            value=json.loads(raw);self.assertEqual(target,TARGET)
            self.assertEqual(value['schema'],'helmut-w15-private-cipher-url-index/1');self.assertEqual(len(value['parts']),15)
            return armor() if encoded is None else encoded
        return D.execute(self.go,TARGET,TARGET,self.request,api=self.api,git=self.git,now=self.clock,
            encrypt=encrypt,link_provider=provider,ready=ready,state_dir=state_dir or self.root,cleanup=cleanup)

    def test_slow_preparation_finishes_before_ready_and_all15_private_links(self):
        self.api.delay=240
        result=self.run_case()
        self.assertTrue(result['dispatchAccepted']);self.assertFalse(result['restoreAccepted'])
        position=self.events.index(('READY',None));self.assertLess(position,self.events.index(('LINKS',None)))
        self.assertTrue(all(method not in ('GET','PATCH') for method,path in self.events[position:]))
        self.assertEqual(len(self.api.posts),1)
        self.assertEqual(set(self.api.posts[0]['inputs']),{'w15_mode','expected_commit','w15_request','w15_cipher_index'})
        self.assertEqual(self.api.posts[0]['inputs']['w15_mode'],D.MODE)
        self.assertEqual(self.api.posts[0]['inputs']['w15_request'],D.canonical(self.request).decode())
        self.assertNotIn(PRIVATE,json.dumps(result));self.git.qualify.assert_called_once()

    def test_ci_review_qualification_or_nonancestor_ref_refuses_before_ready(self):
        for fault,phase in [('ci','ci'),('review','review'),('qualification','qualification'),('ancestor','branch')]:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);root.chmod(0o700);self.go['stateDir']=str(root);self.events.clear()
                self.api=API(self.events,self.clock,fail=fault)
                self.git.qualify=Mock(side_effect=RuntimeError(PRIVATE) if fault=='qualification' else None)
                self.git.is_ancestor=Mock(return_value=fault!='ancestor')
                result=self.run_case(state_dir=root)
                self.assertEqual(result['firstFailedPhase'],phase);self.assertEqual(self.api.posts,[])
                self.assertNotIn(('READY',None),self.events)

    def test_fifteen_unique_readonly_nonip_bound_sas_capabilities_required(self):
        variants=[links(self.clock)[:14],links(self.clock)+links(self.clock)[:1],links(self.clock,sp='rw'),links(self.clock,sr='c'),
            links(self.clock,sip='127.0.0.1'),links(self.clock,sig=''),[links(self.clock)[0]]*15,
            [url+'&sp=r' for url in links(self.clock)],[url.replace('https:','http:') for url in links(self.clock)]]
        for i,values in enumerate(variants):
            with self.subTest(case=i),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);root.chmod(0o700);self.go['stateDir']=str(root);self.events.clear();self.api=API(self.events,self.clock)
                result=self.run_case(given_links=values,state_dir=root)
                self.assertEqual(result['firstFailedPhase'],'link');self.assertNotIn(('ENCRYPT',None),self.events)
                self.assertEqual(self.api.posts,[])

    def test_earliest_actual_expiry_and_90second_boundary_are_enforced(self):
        for margin,expected in [(90,False),(89,False),(90.001,True)]:
            with self.subTest(margin=margin),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);root.chmod(0o700);self.go['stateDir']=str(root);self.api=API(self.events,self.clock)
                values=links(self.clock,300);values[7]=links(self.clock,margin)[7]
                result=self.run_case(given_links=values,state_dir=root)
                self.assertEqual(result['dispatchAccepted'],expected)

    def test_slow_encryption_and_fsync_expiry_stop_without_extending_links(self):
        result=self.run_case(encode_delay=61)
        self.assertEqual(result['firstFailedPhase'],'final-expiry');self.assertEqual(self.api.posts,[])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);root.chmod(0o700);self.go['stateDir']=str(root);self.api=API(self.events,self.clock)
            original=D.M.write_public
            def write(fd,name,value):
                original(fd,name,value)
                if name.startswith('POST_ATTEMPT_'):self.clock.advance(61)
            with patch.object(D.M,'write_public',side_effect=write):result=self.run_case(state_dir=root)
            self.assertEqual(result['firstFailedPhase'],'final-expiry');self.assertFalse(result['dispatchAttempted'])
            self.assertTrue((root/('POST_ATTEMPT_'+NONCE+'.SAFE.json')).exists())

    def test_full_payload_size_request_binding_and_expired_approval_stop_before_post(self):
        result=self.run_case(encoded=armor(49100))
        self.assertEqual(result['firstFailedPhase'],'payload');self.assertFalse(result['dispatchAttempted'])
        self.request['approval']['maxProviderCalls']=1
        result=self.run_case();self.assertEqual(result['firstFailedPhase'],'approval')
        self.assertEqual(self.api.posts,[])

    def test_approval_expiring_during_attempt_fsync_refuses_dispatch(self):
        expires=(self.clock()+timedelta(seconds=5)).strftime('%Y-%m-%dT%H:%M:%SZ')
        self.go['expiresAt']=self.request['approval']['expiresAt']=expires
        self.go['requestSHA256']=hashlib.sha256(D.canonical(self.request)).hexdigest()
        original=D.M.write_public
        def write(fd,name,value):
            original(fd,name,value)
            if name.startswith('POST_ATTEMPT_'):self.clock.advance(6)
        with patch.object(D.M,'write_public',side_effect=write):result=self.run_case()
        self.assertEqual(result['firstFailedPhase'],'approval');self.assertEqual(self.api.posts,[])

    def test_unknown_post_or_ref_mutation_is_not_retried_or_declared_unchanged(self):
        self.api.fail='post';result=self.run_case()
        self.assertEqual(result['status'],'UNKNOWN_DIAGNOSTIC_DISPATCH_OUTCOME')
        self.assertTrue(result['dispatchAttempted']);self.assertFalse(result['dispatchAccepted'])
        self.assertEqual(len(self.api.posts),1)
        repeated=self.run_case();self.assertEqual(repeated['firstFailedPhase'],'private-root');self.assertEqual(len(self.api.posts),1)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);root.chmod(0o700);other=self.run_case(state_dir=root)
            self.assertEqual(other['firstFailedPhase'],'approval');self.assertEqual(len(self.api.posts),1)
        for fault,changed in [('patch','UNKNOWN'),('readback',True)]:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);root.chmod(0o700);self.go['stateDir']=str(root);self.api=API(self.events,self.clock,fail=fault)
                result=self.run_case(state_dir=root)
                self.assertEqual(result['branchChanged'],changed);self.assertTrue(result['branchUpdateAttempted'])

    def test_first_failure_survives_terminal_or_receipt_cleanup_failures(self):
        self.api.fail='ci';original=D.M.write_public
        def write(fd,name,value):
            if name.startswith('RESULT_'):raise RuntimeError(PRIVATE)
            original(fd,name,value)
        with patch.object(D.M,'write_public',side_effect=write):result=self.run_case(cleanup=Mock(side_effect=RuntimeError(PRIVATE)))
        self.assertEqual(result['firstFailedPhase'],'ci')
        self.assertEqual(result['secondaryCleanupFailures'],['stdin-restore','result-write'])
        self.assertNotIn(PRIVATE,json.dumps(result))

    def test_large_private_stdin_frame_and_malformed_frames_are_bounded(self):
        for data,accepted in [({'urls':['https://fictional.oaiusercontent.com/'+('x'*3400)+str(i) for i in range(15)]},True),
                              ({'urls':['x']*14},False),({'urls':['x']*15,'extra':True},False)]:
            with self.subTest(accepted=accepted):
                path=self.root/'frame';path.write_bytes(D.canonical(data)+b'\n')
                fd=os.open(path,os.O_RDONLY);reader=object.__new__(D.PrivateLinksInput);reader.descriptor=fd;reader.previous=None
                try:
                    if accepted:self.assertEqual(reader.read(),data['urls'])
                    else:
                        with self.assertRaises(D.DispatchRejected):reader.read()
                finally:os.close(fd)

    def test_public_source_mapping_matches_original15_pins_and_default_plan_is_inert(self):
        rows=D.source_parts();self.assertEqual(len(rows),15);self.assertEqual(sum(row['bytes'] for row in rows),242693044)
        result=subprocess.run([sys.executable,'-B',str(Path(D.__file__))],capture_output=True,check=False)
        self.assertEqual(result.returncode,0);plan=json.loads(result.stdout)
        self.assertEqual(plan['mode'],D.MODE);self.assertFalse(plan['executionAuthority'])


if __name__=='__main__':unittest.main()
