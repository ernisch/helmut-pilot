"""Exact new evidence root only; pure mount builder, no Docker/DB/GO."""
from pathlib import Path
from unittest.mock import patch
import copy,importlib.util,tempfile,unittest

spec=importlib.util.spec_from_file_location('day21_mount_scope',Path(__file__).with_name('isolation.py'))
I=importlib.util.module_from_spec(spec);spec.loader.exec_module(I)
N=Path('/workspace/helmut-ram-fix-20261020/next-full500-20261021')
CASE=Path('/workspace/helmut-parallel-20261015/wave20-resource-integration')/('attempt-'+I.A.CASE_SUFFIX)

class Day21EvidenceMountTest(unittest.TestCase):
    def setUp(self):
        self.file=I.A.pin(N/'ROOT_TARGETED_VALIDATION.SAFE.json')
        self.fixture={'schema':'helmut-pinned-full500-connection/1','caseDirectory':str(CASE),
          'production':False,'day':'2026-10-21','resourceClaimPath':str(I.A.CLAIM),
          'targetDatabase':'helmut_resource_fixture_'+I.A.DATE_TAG+'_'+I.A.CASE_SUFFIX,
          'applicationReadOnlyPins':[self.file],'databaseReadOnlyPins':[]}
        self.recipe={'scope':'owner-approved-local500-resources','fixtureConnectionPin':{'TEST_ONLY':'NO_AUTHORITY'}}
        for obj,name,value in [(I.Path,'is_dir',lambda p:True),(I,'verify_connection_files',lambda f:None),
          (I,'pin_json',lambda p:self.fixture),
          (I,'runtime_read_manifest',lambda r:{'pins':[self.file]}),
          (I.K,'docker',lambda *a,**k:(_ for _ in ()).throw(AssertionError('NO_DOCKER')) )]:
            p=patch.object(obj,name,value);p.start();self.addCleanup(p.stop)
    def args(self):return I.fixture_mounts(self.fixture,'application',recipe=self.recipe)
    def test_exact_day21_manifest_file_is_individually_readonly(self):
        args=self.args();mount='type=bind,src='+self.file['path']+',dst='+self.file['path']+',readonly'
        self.assertIn(mount,args)
        self.assertFalse(any('src='+str(N)+','in s for s in args))
    def test_other_day_claim_production_or_schema_is_denied(self):
        baseline=copy.deepcopy(self.fixture)
        for key,value in [('day','2026-10-20'),('production',True),('production',None),
          ('resourceClaimPath','SPENT_V11'),('schema','helmut-small-local-fixture/1')]:
            with self.subTest(key=key,value=value):
                self.fixture={**baseline,key:value}
                with self.assertRaises(RuntimeError):self.args()
        self.fixture=baseline
    def test_other_global_slot_or_scope_is_denied(self):
        with patch.object(I.A,'SLOT_VERSION',11),self.assertRaises(RuntimeError):self.args()
        with patch.object(I.A,'DAY','2026-10-20'),self.assertRaises(RuntimeError):self.args()
        self.recipe['scope']='small-meter-validation'
        with self.assertRaises(RuntimeError):self.args()
    def test_unrelated_workspace_file_is_denied(self):
        with tempfile.TemporaryDirectory(prefix='helmut-exact-mount-scope-',dir='/workspace')as d:
            f=Path(d)/'TEST_ONLY.txt';f.write_text('not evidence')
            self.file=I.A.pin(f)
            with self.assertRaises(RuntimeError):self.args()
    def test_hash_drift_is_denied_before_root_admission(self):
        self.file={**self.file,'sha256':'0'*64}
        with self.assertRaisesRegex(RuntimeError,'pin drift'):self.args()
    def test_symbolic_file_is_denied(self):
        with tempfile.TemporaryDirectory(prefix='helmut-exact-mount-link-',dir=N)as d:
            link=Path(d)/'TEST_ONLY_LINK';link.symlink_to(self.file['path'])
            self.file={**self.file,'path':str(link)}
            with self.assertRaisesRegex(RuntimeError,'canonical'):self.args()
    def test_database_role_cannot_use_the_new_evidence_root(self):
        self.fixture['databaseReadOnlyPins']=[self.file]
        with self.assertRaisesRegex(RuntimeError,'PostgREST'):I.fixture_mounts(self.fixture,'database')

if __name__=='__main__':unittest.main()
