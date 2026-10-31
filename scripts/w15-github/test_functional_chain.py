"""Bounded chain and real shared payload counterexamples; no database or transfer."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid

HERE=Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location('chain_test_'+name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
C,N,T=load('functional_chain'),load('encrypted_index'),load('test_encrypted_index')
class ChainChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.chain=C.Chain(self.temp.name,str(uuid.uuid4()))
        self.serial=0
    def reserve(self,stage='end500',commit='a'*40,**kw):
        return self.chain.reserve(stage,commit,str(uuid.uuid4()),'b'*64,'c'*64,'d'*64,**kw)
    def finish(self,row,status):
        self.serial+=1;self.chain.bind_run(row['nonce'],str(10000+self.serial))
        self.chain.finish(row['nonce'],status,'e'*64,processes_stopped=True,independent_acceptance_sha='f'*64)
    def test_unknown_blocks_another_attempt_and_mock_requires_real_prior_acceptance(self):
        with self.assertRaises(ValueError):self.reserve('mock500')
        row=self.reserve()
        with self.assertRaises(ValueError):self.reserve()
        with self.assertRaises(ValueError):self.chain.finish(row['nonce'],'PASS','e'*64,processes_stopped=False,independent_acceptance_sha='f'*64)
        self.finish(row,'PASS');self.finish(self.reserve('mock500'),'PASS')
        with self.assertRaises(ValueError):self.reserve('mock500')
    def test_exactly_one_corrected_attempt_no_identical_replay(self):
        row=self.reserve();self.finish(row,'FAIL')
        correction={'causeProofSHA256':'1'*64,'targetedTestsSHA256':'2'*64}
        with self.assertRaises(ValueError):self.reserve()
        with self.assertRaises(ValueError):self.reserve(correction=correction)
        fixed=self.reserve(commit='3'*40,correction=correction);self.finish(fixed,'PASS')
        mock=self.reserve('mock500',commit='3'*40);self.finish(mock,'FAIL')
        with self.assertRaises(ValueError):self.reserve('mock500',commit='4'*40,correction=correction)
        record=json.loads((Path(self.temp.name)/'CHAIN.SAFE.json').read_text())
        self.assertEqual(sum(r['reservedStorageCents'] for r in record['attempts']),15)
    def test_final_mock_may_use_single_corrected_attempt_after_accepted_end(self):
        self.finish(self.reserve(),'PASS');self.finish(self.reserve('mock500'),'FAIL')
        correction={'causeProofSHA256':'1'*64,'targetedTestsSHA256':'2'*64}
        fixed=self.reserve('mock500',commit='3'*40,correction=correction)
        self.finish(fixed,'PASS')
    def test_actual_shared_encrypted_payload_all_new_modes_and_full_limit(self):
        for mode in ('end500-full-functional-gated','mock500-full-functional-gated'):
            raw=N.dispatch_payload('a'*40,T.armor(),mode=mode,extra_inputs={'w15_request':'{}'})
            value=json.loads(raw);self.assertEqual(value['inputs']['w15_mode'],mode)
            self.assertEqual(value['inputs']['w15_request'],'{}');self.assertLessEqual(len(raw),65535)
            with self.assertRaises(ValueError):N.dispatch_payload('a'*40,T.armor(),mode=mode,extra_inputs={'w15_request':'X'*65535})
if __name__=='__main__':unittest.main()
