"""Tiny input/read-admission seams only; no keys, originals, DB or HTTP."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
def load(name):
    s = importlib.util.spec_from_file_location('context_test_' + name, HERE / (name + '.py'))
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
M, F = load('mock500_context_preflight'), load('test_mock500_archive_receive')
H = M.H

class ContextChecks(unittest.TestCase):
    def test_existing_caller_finite_headroom_uses_real_reserve_and_keeps_identity_and_safety_checks(self):
        check=M.ContextCheck('/FICTIONAL');check.admission={};check.issued=datetime.now(timezone.utc);check.baseline={}
        reserve=M.C.HOST_RESERVE
        base={'status':'FAIL_ANCESTOR_HEADROOM','ancestorIdentitiesMatch':True,
              'hostAvailableBytes':reserve+1000,'minimumAncestorHeadroomBytes':reserve+500}
        for change,accepted in (({},True),({'minimumAncestorHeadroomBytes':reserve-1},False),
                                ({'hostAvailableBytes':reserve-1},False),({'ancestorIdentitiesMatch':False},False),
                                ({'status':'UNKNOWN'},False),({'minimumAncestorHeadroomBytes':'UNKNOWN'},False)):
            with patch.object(M.C,'host_runtime_guard',return_value={**base,**change}),patch.object(check,'events',return_value={}),patch.object(M.C,'_host_raw',return_value='SwapTotal: 0 kB\nSwapFree: 0 kB\n'):
                if accepted:check.guard()
                else:
                    with self.assertRaises(Exception):check.guard()

    def test_separate_current_approval_and_event_not_legacy_receive_or_full_mock(self):
        now = datetime(2026, 11, 3, 12, tzinfo=timezone.utc);r = F.approval(now)
        r.update(schema='helmut-w15-mock-input-context-approval/1',scope='ISOLATED_GITHUB_MOCK_INPUT_CONTEXTS_ONLY',expiresAt=(now+timedelta(minutes=10)).isoformat())
        inputs={'w15_mode':H.CONTEXT_MODE,'expected_commit':F.COMMIT,'w15_request':json.dumps(r),'w15_cipher_index':'FICTIONAL'}
        with patch.object(H.N,'check_event') as check:
            self.assertEqual(H.validate_request(F.COMMIT,r,inputs,now=now,context_preflight=True),F.NONCE)
            self.assertEqual(check.call_args.kwargs['mode'],H.CONTEXT_MODE)
        for change in ({'scope':'ISOLATED_GITHUB_MOCK500_ONLY'},{'schema':'helmut-w15-mock-originals-receive-approval/1'},
                       {'expiresAt':(now+timedelta(minutes=16)).isoformat()},{'issuedAt':(now-timedelta(days=1)).isoformat()},
                       {'maxReceiveAttempts':2},{'authorized':False}):
            bad={**r,**change}
            with patch.object(H.N,'check_event'),self.assertRaises(Exception):H.validate_request(F.COMMIT,bad,{**inputs,'w15_request':json.dumps(bad)},now=now,context_preflight=True)
        with patch.object(H.N,'check_event'),self.assertRaises(Exception):H.validate_request(F.COMMIT,r,inputs,now=now)
        for start,end in (('2026-11-03T22:55:00+00:00','2026-11-03T23:05:00+00:00'),
                          ('2026-11-03T23:55:00+00:00','2026-11-04T00:01:00+00:00'),
                          ('2026-11-07T23:05:00+00:00','2026-11-07T23:05:00+00:00'),
                          ('2026-11-07T22:55:00+00:00','2026-11-07T22:55:00+00:00')):
            issued,observed=map(datetime.fromisoformat,(start,end));bad={**r,'issuedAt':issued.isoformat(),'expiresAt':(issued+timedelta(minutes=15)).isoformat()}
            with patch.object(H.N,'check_event'),self.assertRaises(Exception):H.validate_request(F.COMMIT,bad,{**inputs,'w15_request':json.dumps(bad)},now=observed,context_preflight=True)

    def test_safe_complete_per_index_projection_rejects_private_fields_and_forged_pass(self):
        report={'schema':'helmut-w15-mock500-input-contexts/1','bindingAccepted':True,'expected':500,'inspected':500,
            'counts':{'valid':500,'missing':0,'empty':0,'unusable':0,'technical':0},'all500Valid':True,
            'results':[{'index':i,'status':'VALID','contextCount':1,'timeOnlyExclusion':False,'phase':'COMPLETE'}for i in range(500)]}
        self.assertEqual(M.closed_report(report),report)
        for change in ('private','index','empty','count','inspected','phase'):
            bad=copy.deepcopy(report)
            if change=='private':bad['results'][0]['private']='DO_NOT_EMIT'
            elif change=='index':bad['results'][499]['index']=0
            elif change=='empty':bad['results'][499]['contextCount']=0
            elif change=='count':bad['counts']['valid']=499
            elif change=='inspected':bad['inspected']=0
            else:bad['results'][0]['phase']='PRIVATE_PATH'
            with self.subTest(change=change),self.assertRaises(Exception):M.closed_report(bad)

    def test_owned_node_group_is_stopped_on_guard_failure_and_secrets_are_not_forwarded(self):
        actual = subprocess.Popen
        def fictional_process(command, **kwargs):
            self.assertEqual(set(kwargs['env']), {'PATH','LANG','HOME','HELMUT_STORAGE_BACKEND','HELMUT_SOURCE_MODE'})
            self.assertEqual(command[1],'--require')
            self.assertTrue(command[2].endswith('/scripts/lokaler-netzschutz.js'))
            self.assertTrue(kwargs['start_new_session'])
            return actual([sys.executable,'-c','import time;time.sleep(30)'], **kwargs)
        with tempfile.TemporaryDirectory(prefix='w15-input-context-fictional-') as tmp:
            os.chmod(tmp,0o700);check=M.ContextCheck(tmp)
            paths={k:Path(tmp)/k for k in ('qualificationReport','qualifiedRows','qualifiedFixtures','publicationPolicy')}
            def stop(): raise ValueError('FICTIONAL_GUARD_FAILURE')
            with patch.object(M.subprocess,'Popen',side_effect=fictional_process),self.assertRaisesRegex(ValueError,'FICTIONAL_GUARD_FAILURE'):
                check(paths,Path(tmp),stop)
            self.assertEqual(check.node_stopped,'PASS')

    def test_real_node_entry_rejects_unavailable_original_pins_privately_and_closes(self):
        with tempfile.TemporaryDirectory(prefix='w15-input-context-missing-') as tmp:
            os.chmod(tmp,0o700);check=M.ContextCheck(tmp)
            decoder=H.load('mock500_original_archive')
            paths={k:Path(tmp)/row[0] for k,row in decoder.FILES.items()}
            with self.assertRaises(Exception):check(paths,Path(tmp),lambda:None)
            self.assertEqual(check.node_stopped,'PASS')
            self.assertEqual((Path(tmp)/'CONTEXTS.PRIVATE.log').read_text(),'INPUT_CONTEXT_FILE_BINDING_REJECTED\n')
            self.assertEqual((Path(tmp)/'CONTEXTS.SAFE.json').read_bytes(),b'')

if __name__=='__main__':unittest.main()
