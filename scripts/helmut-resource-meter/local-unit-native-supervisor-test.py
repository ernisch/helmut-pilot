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

class OwnerRuntimeMounts(unittest.TestCase):
    def setUp(self):
        self.case = Path('/workspace/helmut-unit-diagnostic-native/'+'a'*32)
        self.cid = 'b'*64
        self.rows = [{'source': {'path': '/retained/public-runtime-'+str(i), 'bytes': i+1, 'sha256': str(i)*64},
                      'imagePath': target, 'readonly': True} for i,target in enumerate(m.OWNER_RUNTIME_TARGETS)]
        self.rows.append({'source': {'path': '/retained/postgres', 'bytes': 2, 'sha256': 'f'*64},
                          'imagePath': '/usr/lib/postgresql/17/bin/postgres', 'readonly': True})
        copies = [{'originalSource': copy.deepcopy(row['source']),
                   'copy': {**row['source'], 'path': str(self.case/'owner-public'/('runtime-'+str(i).zfill(3)))},
                   'imagePath': row['imagePath'],
                   'mode': 0o555 if row['imagePath'].endswith('/ld-linux-x86-64.so.2') else 0o444,
                   'installerContainerId': self.cid} for i,row in enumerate(self.rows[:-1])]
        self.plan = {'ownerRuntimeCopies': copies, 'knownSetupContainerIds': [self.cid],
                     'sourceOwnerRuntimeMounts': [(row['copy']['path'],row['imagePath'],True) for row in copies]}

    def test_owner_selection_requires_exact_complete_original_subset(self):
        self.assertEqual(m.owner_runtime_bindings(self.rows), self.rows[:-1])
        for rows in (self.rows[1:], self.rows+self.rows[:1]):
            with self.assertRaises(RuntimeError): m.owner_runtime_bindings(rows)

    def test_source_uses_measured_public_copies_and_preserves_other_original_mounts(self):
        before = copy.deepcopy(self.rows)
        mounts = m.source_runtime_mounts(self.rows,self.plan,self.case)
        self.assertEqual(mounts[:-1], [(Path(p),target,ro) for p,target,ro in self.plan['sourceOwnerRuntimeMounts']])
        self.assertEqual(mounts[-1], (Path('/retained/postgres'),self.rows[-1]['imagePath'],True))
        self.assertEqual(self.rows,before)
        self.assertEqual(m.source_runtime_mounts(self.rows,None,self.case),
                         [(Path(row['source']['path']),row['imagePath'],True) for row in self.rows])

    def test_unknown_incomplete_changed_or_writable_mirrors_are_rejected(self):
        for fault in ('missing','duplicate','origin','bytes','hash','outside','name','mode','installer','mount','extra'):
            plan = copy.deepcopy(self.plan); row = plan['ownerRuntimeCopies'][0]
            if fault=='missing': plan['ownerRuntimeCopies'].pop()
            if fault=='duplicate': plan['ownerRuntimeCopies'][1]=copy.deepcopy(row)
            if fault=='origin': row['originalSource']['path']='/foreign/runtime'
            if fault=='bytes': row['copy']['bytes']+=1
            if fault=='hash': row['copy']['sha256']='e'*64
            if fault=='outside': row['copy']['path']='/outside/runtime-000'
            if fault=='name': row['copy']['path']=str(self.case/'owner-public'/'unqualified')
            if fault=='mode': row['mode']=0o777
            if fault=='installer': row['installerContainerId']='c'*64
            if fault=='mount': plan['sourceOwnerRuntimeMounts'][0]=(row['copy']['path'],row['imagePath'],False)
            if fault=='extra': row['extra']=True
            with self.subTest(fault=fault),self.assertRaises(RuntimeError): m.source_runtime_mounts(self.rows,plan,self.case)
        rows=copy.deepcopy(self.rows);rows[-1]['readonly']=False
        with self.assertRaises(RuntimeError): m.source_runtime_mounts(rows,None,self.case)

if __name__=='__main__':unittest.main()
