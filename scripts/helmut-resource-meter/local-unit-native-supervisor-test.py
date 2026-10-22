"""Setup failure registry boundaries; no Docker, process or database execution."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest

spec=importlib.util.spec_from_file_location('native_supervisor_offline',Path(__file__).with_name('local-unit-native-supervisor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class SetupClosure(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='helmut-supervisor-registry-');self.addCleanup(self.temp.cleanup)
        self.case=Path(self.temp.name);self.cid='a'*64;self.parent='helmut-meter-memorybudget-'+'b'*24
        self.runtime={'imageId':'sha256:'+'c'*64};self.record={'containerId':self.cid}
        self.row={'Id':self.cid,'HostConfig':{'CgroupParent':'/'+self.parent},'Image':self.runtime['imageId'],'State':{'Running':False}}
        self.reader=types.SimpleNamespace(read_file=lambda path,cap:(json.dumps(self.record).encode(),{}),unique=json.loads)
        self.calls=[]
        def docker(args):
            self.calls.append(args);return types.SimpleNamespace(stdout=json.dumps([self.row]))
        self.native=types.SimpleNamespace(docker=docker)
    def run_check(self):return m.registered_setup_children(self.reader,self.native,self.case,self.parent,self.runtime)
    def test_no_created_record_means_no_adopted_child(self):
        self.assertEqual(self.run_check(),set());self.assertEqual(self.calls,[])
    def test_created_child_is_recovered_without_a_returned_plan(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch()
        self.assertEqual(self.run_check(),{self.cid});self.assertEqual(self.calls,[['inspect',self.cid]])
    def test_foreign_running_or_changed_child_cannot_be_adopted(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch();original=copy.deepcopy(self.row)
        for key in ('parent','running','image','id'):
            self.row=copy.deepcopy(original)
            if key=='parent':self.row['HostConfig']['CgroupParent']='/foreign'
            if key=='running':self.row['State']['Running']=True
            if key=='image':self.row['Image']='sha256:'+'d'*64
            if key=='id':self.row['Id']='d'*64
            with self.subTest(key=key),self.assertRaises(RuntimeError):self.run_check()
    def test_registry_is_not_an_arbitrary_container_selector(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch()
        for record in ({'containerId':'short'},{'containerId':self.cid,'extra':True}):
            self.record=record
            with self.assertRaises(RuntimeError):self.run_check()
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
