"""Only the new full-controller owned-container stop, never the 500 body."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('w15_full_stop', Path(__file__).parents[1]/'synthetik-500-w15-memory-forward.py')
F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)


class FullStopChecks(unittest.TestCase):
    def setUp(self):
        self.inputs = SimpleNamespace(controller_context=lambda: {
            'runId':'123456789','nonce':'26d5a413-5ca7-415c-a412-62fc45b561c8','exactCommit':'a'*40})
        self.resources = SimpleNamespace(unit='FICTIONAL.slice',sample=Mock())
        self.info = {'Id':'b'*64,'Name':'/'+F.CONTAINER,'Image':F.M.IMAGE,
            'Config':{'Labels':F._runtime_container_labels(self.inputs)},
            'HostConfig':{'CgroupParent':'FICTIONAL.slice'},
            'State':{'Running':True,'Pid':123,'OOMKilled':False,'ExitCode':0}}

    def test_only_owned_id_stops_and_final_native_exit_is_required(self):
        final=copy.deepcopy(self.info); final['State'].update(Running=False,Pid=0)
        with patch.object(F.M,'docker',side_effect=[json.dumps([self.info]),'',json.dumps([final])]) as docker:
            result=F._stop_runtime_container(self.inputs,self.resources,'b'*64)
        self.assertTrue(result['confirmed'])
        self.assertEqual(docker.call_args_list[1].args,('stop','--time','5','b'*64))
        self.resources.sample.assert_called_once()

    def test_wrong_labels_image_parent_or_id_never_stops_foreign_container(self):
        for field in ('label','image','parent','id'):
            bad=copy.deepcopy(self.info)
            if field=='label':bad['Config']['Labels']['helmut.w15.commit']='c'*40
            if field=='image':bad['Image']='sha256:'+'c'*64
            if field=='parent':bad['HostConfig']['CgroupParent']='foreign.slice'
            if field=='id':bad['Id']='c'*64
            with self.subTest(field=field),patch.object(F.M,'docker',return_value=json.dumps([bad])) as docker:
                with self.assertRaises(AssertionError):F._stop_runtime_container(self.inputs,self.resources,'b'*64)
                self.assertEqual(docker.call_count,1)

    def test_nonzero_native_exit_rejects_success(self):
        final=copy.deepcopy(self.info);final['State'].update(Running=False,Pid=0,ExitCode=1)
        with patch.object(F.M,'docker',side_effect=[json.dumps([self.info]),'',json.dumps([final])]):
            with self.assertRaises(AssertionError):F._stop_runtime_container(self.inputs,self.resources,'b'*64)


if __name__=='__main__':unittest.main()
