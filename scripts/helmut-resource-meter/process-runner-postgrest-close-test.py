#!/usr/bin/env python3
"""Targeted fake close receipts; temporary files only, no Docker/native/DB."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

BIN=Path(__file__).resolve().parent
sys.path.insert(0,str(BIN))
spec=importlib.util.spec_from_file_location('pure_runner_postgrest_close',BIN/'process-runner.py')
R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)


class CloseContract(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='helmut-pure-runner-owner-close-');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.db=self.root/'database';self.db.mkdir();(self.db/'control').mkdir()
        (self.db/'local-postgrest-backend/output').mkdir(parents=True)
        self.directory=patch.object(R,'DATABASE_DIRECTORY',self.db);self.directory.start();self.addCleanup(self.directory.stop)
        self.plan={'schema':'helmut-local-supervised-postgrest-backend-plan/1','mode':'supervised-owner-v1',
            'production':False,'automaticRetry':False,'operationId':'synthetik500-resources21-0123456789ab',
            'targetDatabase':'helmut_resource_fixture_20261021_0123456789ab'}
        self.plan_pin=self.document(self.root/'PLAN.SAFE.json',self.plan)
        self.cfg={'scope':'owner-approved-local500-resources','freshInitdbVolume':True,
            'stopFile':'/meter-output/control/STOP_DATABASE','finalFile':'/meter-output/DATABASE_FINAL.SAFE.json',
            'localPostgrestBackendPlanPin':self.plan_pin}
        self.scope={'schema':'helmut-local-fullcase-postgrest-owner-scope/1','production':False,'automaticRetry':False,
            'nonce':'a'*32,'containerId':'b'*64,'controllerInvocationId':'c'*32,'operationId':self.plan['operationId'],
            'targetDatabase':self.plan['targetDatabase'],'requestSHA256':'d'*64,
            'configPin':{'path':'/tmp/helmut-resource-fixture.conf','bytes':300,'sha256':'e'*64}}
        self.scope_pin=self.document(self.db/'local-postgrest-backend/SCOPE.SAFE.json',self.scope,R.BACKEND_SCOPE)
        self.receipt={'schema':'helmut-local-fullcase-postgrest-owner-result/1','pass':True,'production':False,
            'full500Qualification':False,'executionAuthority':False,'automaticRetry':False,'reason':'NORMAL_BOUND_STOP',
            **{key:self.scope[key]for key in ['nonce','configPin','requestSHA256','containerId','operationId']},
            'scopePin':self.scope_pin}
        self.backend={'enabled':True,'pass':True,'ownerExitCode':0,'failure':None,'production':False,
            **{key:self.scope[key]for key in ['nonce','configPin','requestSHA256','containerId','operationId']},
            'scopePin':self.scope_pin}
        self.final={'schema':'helmut-isolated-database-final/1','serverExitCode':0,'localPostgrestBackend':self.backend}
        self.host={'localPostgrestBackendPlanPin':self.plan_pin,'containerId':self.scope['containerId'],
            'controllerInvocationId':self.scope['controllerInvocationId']}
        self.document(self.db/'LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json',self.host)
        self.document(self.db/'DATABASE_CONFIG.SAFE.json',self.cfg)
        self.save_receipt()
        self.recipe={'scope':'small-meter-validation','stages':[],
            'databaseStopFile':str(self.db/'control/STOP_DATABASE'),'databaseFinalFile':str(self.db/'DATABASE_FINAL.SAFE.json'),
            'localPostgrestBackendPlanPin':self.plan_pin}

    def document(self,path,value,declared=None):
        raw=json.dumps(value).encode();path.write_bytes(raw)
        return {'path':declared or str(path),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

    def save_receipt(self):
        self.backend['resultPin']=self.document(self.db/'local-postgrest-backend/output/RESULT.SAFE.json',self.receipt,R.BACKEND_RESULT)
        self.document(self.db/'DATABASE_FINAL.SAFE.json',self.final)

    def workflow(self):
        recipe_file=self.root/'RECIPE.PRIVATE.json';self.document(recipe_file,self.recipe)
        with (patch.object(R.sys,'argv',['pure',str(recipe_file)]),patch.object(R,'network',return_value={}),
              patch.object(R,'settled_network',return_value={}),patch.object(R,'finish_children',return_value={'graceful':True}),
              patch.object(R,'validate_http_receipts',return_value=([],0)),patch.object(R,'save_new')as saved):
            code=R.run_workflow()
        result=next(call.args[1]for call in saved.call_args_list if call.args[0].name=='RUNNER_RESULT.SAFE.json')
        return code,result

    def test_optional_confirmed_close_uses_control_stop_and_actual_pinned_result(self):
        result=R.stop_owned_database()
        self.assertIs(result['cleanShutdownConfirmed'],True)
        self.assertEqual(result['localPostgrestBackend'],self.backend)
        self.assertTrue((self.db/'control/STOP_DATABASE').is_file());self.assertFalse((self.db/'STOP_DATABASE').exists())

    def test_pg_zero_alone_and_boolean_owner_exit_never_confirm(self):
        for mutate in [lambda b:b.update(ownerExitCode=False),lambda b:b.update(ownerExitCode=1),
                       lambda b:b.__setitem__('pass',False),lambda b:b.update(failure='OWNER_CLOCK_DRIFT')]:
            with self.subTest(mutate=mutate):
                original=copy.deepcopy(self.backend);mutate(self.backend)
                self.document(self.db/'DATABASE_FINAL.SAFE.json',self.final)
                with self.assertRaises(RuntimeError):R.stop_owned_database()
                self.backend.clear();self.backend.update(original)
        self.document(self.db/'DATABASE_FINAL.SAFE.json',{'serverExitCode':0})
        with self.assertRaises(RuntimeError):R.stop_owned_database()

    def test_summary_false_and_missing_fields_fail_strictly(self):
        for key,value in [('pass',False),('enabled',1),('production',True),('serverExitCode',False)]:
            original=copy.deepcopy(self.final)
            if key=='serverExitCode':self.final[key]=value
            else:self.backend[key]=value
            self.document(self.db/'DATABASE_FINAL.SAFE.json',self.final)
            with self.subTest(key=key),self.assertRaises(RuntimeError):R.stop_owned_database()
            self.final.clear();self.final.update(original);self.backend=self.final['localPostgrestBackend']

    def test_foreign_declared_result_path_is_never_opened(self):
        self.backend['resultPin']['path']='/tmp/FOREIGN_OWNER_RESULT.SAFE.json'
        self.document(self.db/'DATABASE_FINAL.SAFE.json',self.final)
        with self.assertRaisesRegex(RuntimeError,'exact close evidence pin'):R.stop_owned_database()

    def test_actual_result_hash_drift_and_symlink_are_rejected(self):
        path=self.db/'local-postgrest-backend/output/RESULT.SAFE.json'
        path.write_bytes(path.read_bytes()+b' ')
        with self.assertRaisesRegex(RuntimeError,'pin drift'):R.stop_owned_database()
        path.unlink();path.symlink_to(self.root/'PLAN.SAFE.json')
        with self.assertRaisesRegex(RuntimeError,'noncanonical'):R.stop_owned_database()

    def test_result_and_scope_identities_are_cross_bound(self):
        for key in ['scopePin','nonce','configPin','requestSHA256','containerId','operationId']:
            original=copy.deepcopy(self.receipt)
            self.receipt[key]={}if key.endswith('Pin')else'foreign'
            self.save_receipt()
            with self.subTest(key=key),self.assertRaisesRegex(RuntimeError,'result binding differs'):R.stop_owned_database()
            self.receipt=original
        self.scope['nonce']='f'*32
        self.scope_pin=self.document(self.db/'local-postgrest-backend/SCOPE.SAFE.json',self.scope,R.BACKEND_SCOPE)
        self.receipt['scopePin']=self.backend['scopePin']=self.scope_pin;self.save_receipt()
        with self.assertRaisesRegex(RuntimeError,'scope binding differs'):R.stop_owned_database()

    def test_configured_plan_and_host_binding_must_match(self):
        self.host['containerId']='f'*64
        self.document(self.db/'LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json',self.host)
        with self.assertRaisesRegex(RuntimeError,'configured backend'):R.stop_owned_database()

    def test_waits_are_fixed_legacy45_and_optional180_in_both_paths(self):
        final_path=self.db/'DATABASE_FINAL.SAFE.json';final_path.unlink()
        for optional,seconds in [(True,180),(False,45)]:
            cfg=copy.deepcopy(self.cfg);recipe=copy.deepcopy(self.recipe)
            if not optional:
                del cfg['localPostgrestBackendPlanPin'];cfg['stopFile']='/meter-output/STOP_DATABASE'
                del recipe['localPostgrestBackendPlanPin'];recipe['databaseStopFile']=str(self.db/'STOP_DATABASE')
            self.document(self.db/'DATABASE_CONFIG.SAFE.json',cfg)
            for direct in [True,False]:
                with self.subTest(optional=optional,direct=direct),patch.object(R.time,'monotonic',side_effect=[10,10+seconds])as clock:
                    with self.assertRaisesRegex(RuntimeError,'shutdown not confirmed'):
                        if direct:R.stop_owned_database()
                        else:R.close_owned_database(recipe,'NORMAL_MEASUREMENT_SHUTDOWN\n')
                    self.assertEqual(clock.call_count,2)

    def test_workflow_uses_optional_strict_close_before_claiming_success(self):
        code,result=self.workflow();self.assertEqual(code,0);self.assertIs(result['pass'],True)
        self.backend['ownerExitCode']=False;self.document(self.db/'DATABASE_FINAL.SAFE.json',self.final)
        code,result=self.workflow();self.assertEqual(code,1);self.assertIs(result['pass'],False)
        self.assertIn('DATABASE_LAST_EXIT_NOT_CONFIRMED',result['failures'])

    def test_missing_expected_mount_cannot_qualify_workflow_close(self):
        with patch.object(R,'DATABASE_DIRECTORY',self.root/'ABSENT_DATABASE'):
            self.assertEqual(R.stop_owned_database(),{'mounted':False})
            with self.assertRaisesRegex(RuntimeError,'mount missing'):R.close_owned_database(self.recipe)

    def test_early_parse_error_still_closes_optional_owned_database(self):
        bad=self.root/'BAD_RECIPE.PRIVATE.json';bad.write_text('not JSON')
        with (patch.object(R.os,'getpid',return_value=1),patch.object(R.sys,'argv',['pure',str(bad)]),
              patch.object(R,'finish_children',side_effect=RuntimeError('pure process failure')),
              patch.object(R,'save_new')as save):
            self.assertEqual(R.main(),1)
        self.assertTrue((self.db/'control/STOP_DATABASE').exists())
        self.assertIs(save.call_args.args[1]['cleanup']['database']['cleanShutdownConfirmed'],True)

    def test_close_reader_rejects_fifo_race_before_read_and_always_nonblocks_open(self):
        source=self.root/'READ.SAFE.json';source.write_text('{}');info=source.stat()
        fake=SimpleNamespace(**{key:getattr(info,key)for key in ['st_dev','st_ino','st_size','st_nlink','st_mtime_ns','st_ctime_ns']},
                             st_mode=stat.S_IFIFO|0o600)
        with (patch.object(R.os,'open',return_value=42)as opened,patch.object(R.os,'fstat',return_value=fake),
              patch.object(R.os,'read')as read,patch.object(R.os,'close')):
            with self.assertRaisesRegex(RuntimeError,'descriptor changed'):R.close_file(source)
        self.assertTrue(opened.call_args.args[1]&os.O_NONBLOCK);read.assert_not_called()

    def test_close_reader_caps_growth_and_rejects_hardlinks(self):
        source=self.root/'READ.SAFE.json';source.write_text('{}');sizes=[]
        def growing(fd,count):sizes.append(count);return b'x'*count
        with patch.object(R.os,'read',side_effect=growing):
            with self.assertRaisesRegex(RuntimeError,'bounded complete'):R.close_file(source,limit=64)
        self.assertEqual(sum(sizes),65)
        os.link(source,self.root/'HARDLINK.SAFE.json')
        with self.assertRaisesRegex(RuntimeError,'single-link'):R.close_file(source)


if __name__=='__main__':unittest.main()
