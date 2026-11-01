"""Actual passive producer crosses closed public JS boundary; no real work."""
import sys
sys.dont_write_bytecode=True
import base64
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location('public_test_'+name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
C,E=load('common_resources'),load('receive_existing_inputs')
class FunctionalPublicChecks(unittest.TestCase):
    def frame(self):
        obj=object.__new__(C.CommonResources)
        obj.functional_stage='mock500';obj.profile=C.functional_contract().MOCK_PROFILE
        obj._functional_samples=1;obj._functional_component_maxima={}
        obj._functional_first_kernel=obj._functional_kernel={'memory':{'kernelLifetimePeakBytes':3100000000},
            'cpuStat':{'usage_usec':17},'effectiveCpuset':'0-3'}
        with tempfile.TemporaryDirectory() as tmp:
            obj.path=Path(tmp);s=obj.path.stat();obj._identity=(s.st_dev,s.st_ino)
            return obj.functional_observation([])
    def closed(self,value):
        js="const fs=require('node:fs'),f=require('./.github/actions/w15-isolated/functional-resources');process.stdout.write(JSON.stringify(f.closed(JSON.parse(fs.readFileSync(0,'utf8')))));"
        out=subprocess.run(['node','-e',js],input=json.dumps(value),text=True,capture_output=True,
            cwd=HERE.parents[1],check=True,timeout=10)
        return json.loads(out.stdout)
    def test_actual_unknown_component_producer_survives_without_fake_acceptance(self):
        frame=self.frame();self.assertEqual(self.closed(frame),frame)
        self.assertEqual(frame['componentPSSMaxima'],dict.fromkeys(frame['componentPSSMaxima'],'UNKNOWN'))
        self.assertEqual(self.closed('UNKNOWN'),'UNKNOWN')
    def test_private_extra_strings_and_false_acceptance_do_not_cross(self):
        for change in ({'PRIVATE_PATH':'/FICTIONAL'}, {'providerResourceAccepted':True},
                       {'sampleCount':True}, {'firstKernel':{'memory':'https://FICTIONAL'}}):
            frame=self.frame();frame.update(change);self.assertIsNone(self.closed(frame))
        frame=self.frame();frame['components']['resourceGuardAccepted']=True
        self.assertIsNone(self.closed(frame))
    def test_existing_receiver_admits_new_mode_then_checks_actual_event(self):
        payload={'cipherIndex':'FICTIONAL','keyB64':base64.b64encode(b'FICTIONAL').decode(),
            'passphrase':'FICTIONAL','eventInputs':{'w15_request':'{}'}}
        marker=RuntimeError('FICTIONAL_EVENT_CHECK')
        with patch.object(E,'source_binding',return_value={}),patch.object(E,'projection',return_value=[]), \
             patch.object(E.N,'check_event',side_effect=marker) as event:
            with self.assertRaisesRegex(RuntimeError,'FICTIONAL_EVENT_CHECK'):
                E._receive_existing_verified('a'*40,'/FICTIONAL',private_payload=payload,mode='end500-full-functional-gated')
            self.assertEqual(event.call_args.kwargs['mode'],'end500-full-functional-gated')
if __name__=='__main__':unittest.main()
