#!/usr/bin/env python3
"""Negative authority, ownership, OOM and exact-byte budget guard tests.
No Docker, business requests, database or full500 execution in this suite.
"""
import copy, importlib.util, json, os, subprocess, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
BIN=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('tested_native_budget',BIN/'native-memory-budget.py')
N=importlib.util.module_from_spec(spec);spec.loader.exec_module(N)
PARENT='helmut-meter-memorybudget-'+'a'*24

def done(value):return SimpleNamespace(stdout=json.dumps(value))

def runtime():
    return dict(schema='helmut-native-budget-runtime/1',imageId='sha256:'+'b'*64,
        imageBytes=1000000,sourcePin=N.pin(BIN/'native-memory-budget-helper.c'),helperSHA256='c'*64)

def node_fixture(directory,pid=42,thread=0):
    """Synthetic receipt bytes only; never a resource authority document."""
    identity=dict(schema='helmut-local-http-meter-start/1',pid=pid,threadId=thread)
    (directory/f'HTTP_{pid}_{thread}.STARTED.SAFE.json').write_text(json.dumps(identity))
    for phase in ['STARTED','EXITED']:
        row=dict(schema='helmut-local-node-heap-budget/1',phase=phase,pid=pid,threadId=thread,
            oldSpaceMiB=384,semiSpaceMiB=16,heapSizeLimitBytes=432*1024**2,heapLimitIsNotTotalRSS=True,
            workerCounts=dict(discovered=0,measured=0,exited=0,failed=0))
        (directory/f'NODE_HEAP_{pid}_{thread}.{phase}.SAFE.json').write_text(json.dumps(row))

def worker_fixture(directory,pid=42,thread=1,observer=0,exit_code=0):
    for phase in ['DISCOVERED','STARTED','EXITED']:
        row=dict(schema='helmut-local-node-worker-budget/1',phase=phase,pid=pid,threadId=thread,observerThreadId=observer)
        if phase=='STARTED':row.update(oldSpaceMiB=384,semiSpaceMiB=16,heapSizeLimitBytes=432*1024**2,measurement='LIVE_GET_HEAP_STATISTICS')
        if phase=='EXITED':row.update(exitCode=exit_code,startupBudgetVerified=True,noPostExitHeapMeasurementClaimed=True)
        (directory/f'NODE_WORKER_{pid}_{thread}.{phase}.SAFE.json').write_text(json.dumps(row))
    p=directory/f'NODE_HEAP_{pid}_{observer}.EXITED.SAFE.json';row=json.loads(p.read_text())
    row['workerCounts']={key:1 if key!='failed'else 0 for key in ['discovered','measured','exited','failed']}
    p.write_text(json.dumps(row))

def reject_receipts(test,directory):
    with test.assertRaises((RuntimeError,ValueError,FileNotFoundError,KeyError)):
        N.node_receipts(directory)

class BudgetGuards(unittest.TestCase):
    def test_stop_path_stat_error_does_not_skip_known_helper_close(self):
        helpers={'holder':{'id':'a'*64,'name':'TEST_ONLY_OWNED'}}
        state={'Running':False,'Pid':0,'ExitCode':0,'OOMKilled':False}
        with patch.object(Path,'exists',side_effect=OSError('TEST_ONLY_IO_ERROR')), \
             patch.object(N,'best_effort_save',return_value=False), \
             patch.object(N,'helper_state',return_value=state)as inspected:
            result=N.close_owned_helpers('/workspace/TEST_ONLY_NEVER_CREATED',PARENT,{},helpers)
        self.assertTrue(result['allKnownHelpersClosed'])
        self.assertEqual(inspected.call_count,2)

    def test_private_host_umask_does_not_hide_stop_directory_from_capless_helper(self):
        with tempfile.TemporaryDirectory(dir='/workspace')as td:
            old=os.umask(0o077)
            try:out=N.fresh_output(Path(td)/'setup')
            finally:os.umask(old)
            self.assertEqual(out.stat().st_mode&0o777,0o755)
            N.save(out/'STOP',{'owned':True})
            self.assertEqual((out/'STOP').stat().st_mode&0o777,0o600)

    def test_exact_policy_never_loosens_total_target_or_uses_swap(self):
        p=N.policy();N.validate_policy(p)
        self.assertLessEqual(p['nativeMaxBytes'],1548000000)
        self.assertLess(1548000000-p['nativeMaxBytes'],N.PAGE)
        self.assertGreaterEqual(2048000000-p['nativeMaxBytes'],500000000)
        for key,value in [('nativeMaxBytes',2048000000),('nativeHighBytes',p['nativeMaxBytes']),
                          ('swapMaxBytes',False),('allOwnedDescendants',1),('noPeakReset',False),
                          ('scope','PRODUCTION'),('nodeMaxOldSpaceMiB',1536),
                          ('nodeMaxOldSpaceMiB',384.0),('nodeMaxSemiSpaceMiB',8),
                          ('nodeHeapReceiptsRequired',False),('extra',True)]:
            with self.subTest(key=key),self.assertRaises(RuntimeError):N.validate_policy({**p,key:value})
        for key in p:
            q=p.copy();q.pop(key)
            with self.assertRaises(RuntimeError):N.validate_policy(q)

    def test_no_ancestor_existing_group_or_path_alias_before_docker(self):
        with patch.object(N,'docker')as docker:
            for parent in ['','/','helmut-meter-resources20-'+'a'*12+'/database',
                           PARENT+'/../other','system.slice',PARENT.upper()]:
                with self.subTest(parent=parent),self.assertRaises(RuntimeError):N.start('/workspace/UNUSED',parent,{})
            with tempfile.TemporaryDirectory()as td,patch.object(N,'CGROUP_ROOT',Path(td)):
                (Path(td)/PARENT).mkdir()
                with self.assertRaisesRegex(RuntimeError,'existing'):N.start('/workspace/UNUSED',PARENT,{})
            docker.assert_not_called()

    def test_runtime_image_source_and_readback_drift_rejected(self):
        r=runtime();row=dict(Id=r['imageId'],Size=r['imageBytes'],Config={'Labels':{
            'org.helmut.native-budget-source':r['sourcePin']['sha256'],
            'org.helmut.native-budget-binary':r['helperSHA256']}})
        with patch.object(N,'docker',return_value=done([row])):N.validate_runtime(r)
        for field in ['Id','Size']:
            bad=copy.deepcopy(row);bad[field]='drift' if field=='Id' else row[field]+1
            with patch.object(N,'docker',return_value=done([bad])),self.assertRaises(RuntimeError):N.validate_runtime(r)
        bad=copy.deepcopy(row);bad['Config']['Labels']['org.helmut.native-budget-binary']='0'*64
        with patch.object(N,'docker',return_value=done([bad])),self.assertRaises(RuntimeError):N.validate_runtime(r)
        r['sourcePin']={**r['sourcePin'],'sha256':'0'*64}
        with patch.object(N,'docker')as docker,self.assertRaises(RuntimeError):N.validate_runtime(r)
        docker.assert_not_called()

    def test_missing_metadata_or_review_closure_never_activates_budget(self):
        p=N.policy();r=runtime();rp={'TEST_ONLY':'NOT_AUTHORITY'}
        c=dict(nativeMemoryBudget=p,nativeBudgetRuntimePin=rp)
        sources=[N.pin(BIN/name)for name in ['native-memory-budget.py','native-memory-budget-helper.c','native-node-budget.js','http-meter.js']]
        a={**c,'sourcePins':sources}
        with patch.object(N,'validate_runtime',return_value=r),patch.object(N,'docker')as docker:
            self.assertEqual(N.admit_metadata(a,c,c,lambda pin:r),(p,r))
            for bad in [{},{**c,'nativeMemoryBudget':{**p,'swapMaxBytes':1}},{**c,'nativeBudgetRuntimePin':{}}]:
                with self.assertRaises(RuntimeError):N.admit_metadata(a,bad,c,lambda pin:r)
            with self.assertRaises(RuntimeError):N.admit_metadata({**a,'sourcePins':[]},c,c,lambda pin:r)
            for omitted in sources:
                with self.subTest(omitted=omitted['path']),self.assertRaises(RuntimeError):
                    N.admit_metadata({**a,'sourcePins':[s for s in sources if s!=omitted]},c,c,lambda pin:r)
            docker.assert_not_called()

    def test_foreign_container_or_process_in_new_parent_rejected(self):
        owned={'holder':{'id':'a'*64,'name':'holder'}}
        row={'Id':'a'*64,'HostConfig':{'CgroupParent':'/'+PARENT}}
        def docker(args,**kw):return SimpleNamespace(stdout='a'*64)if args[0]=='ps' else done([row])
        with tempfile.TemporaryDirectory()as td:
            g=Path(td);(g/'cgroup.procs').write_text('42\n')
            with patch.object(N,'docker',side_effect=docker),patch.object(N,'helper_state',return_value={'Running':True,'Pid':42}):
                N.assert_setup_exclusive(g,PARENT,owned,{})
                (g/'cgroup.procs').write_text('42\n43\n')
                with self.assertRaisesRegex(RuntimeError,'process'):N.assert_setup_exclusive(g,PARENT,owned,{})
            row['Id']='f'*64
            with patch.object(N,'docker',side_effect=docker),self.assertRaisesRegex(RuntimeError,'container'):
                N.assert_setup_exclusive(g,PARENT,owned,{})

    def test_final_native_state_must_keep_inode_limits_all_exits_and_no_oom(self):
        with tempfile.TemporaryDirectory()as td,patch.object(N,'CGROUP_ROOT',Path(td)):
            g=Path(td)/PARENT;g.mkdir();p=N.policy()
            for k,v in [('memory.max',p['nativeMaxBytes']),('memory.high',p['nativeHighBytes']),
                        ('memory.swap.max',0),('memory.peak',7000000)]: (g/k).write_text(str(v))
            (g/'memory.events').write_text('oom 0\noom_kill 0\n')
            receipt=dict(schema='helmut-native-budget-ready/1',parent=PARENT,parentInode=g.stat().st_ino,
                policy=p,runtime=runtime(),helpers={'holder':{},'setter':{}},full500Authority=False)
            state={'Running':False,'Pid':0,'ExitCode':0,'OOMKilled':False}
            with patch.object(N,'validate_runtime',return_value=receipt['runtime']),patch.object(N,'helper_state',return_value=state):
                self.assertEqual(N.verify(PARENT,receipt)['memoryPeakBytes'],7000000)
                for key,value in [('oom',1),('oom_kill',1)]:
                    (g/'memory.events').write_text(key+' '+str(value)+'\n')
                    with self.assertRaisesRegex(RuntimeError,'OOM'):N.verify(PARENT,receipt)
                    # A failed completed run still retains its real counters;
                    # the caller must reject its acceptance, not lose evidence.
                    self.assertEqual(N.verify(PARENT,receipt,require_no_oom=False)['memoryEvents'][key],1)
                (g/'memory.events').write_text('oom 0\noom_kill 0\n')
                (g/'memory.max').write_text('max')
                with self.assertRaisesRegex(RuntimeError,'changed'):N.verify(PARENT,receipt)
                (g/'memory.max').write_text(str(p['nativeMaxBytes']))
                for change in [{'parentInode':0},{'full500Authority':True},{'helpers':{'holder':{}}}]:
                    with self.assertRaises(RuntimeError):N.verify(PARENT,{**receipt,**change})
                for field,value in [('Running',True),('Pid',42),('ExitCode',1),('OOMKilled',True)]:
                    with patch.object(N,'helper_state',return_value={**state,field:value}),self.assertRaises(RuntimeError):N.verify(PARENT,receipt)

    def test_setup_receipt_cannot_cross_cases_or_runtime_bindings(self):
        c=dict(caseDirectory='/workspace/attempt-'+'a'*12,day='2026-10-20',
               nativeMemoryBudget=N.policy(),nativeBudgetRuntimePin={'TEST_ONLY':'RUNTIME'})
        receipt=dict(schema='helmut-native-budget-ready/1',parent='helmut-meter-resources20-'+'a'*12,
            policy=N.policy(),runtime=runtime(),full500Authority=False)
        recipe={'nativeBudgetSetupPin':{'path':c['caseDirectory']+'/native-memory-budget/READY.SAFE.json'}}
        read=lambda p:runtime()if p==c['nativeBudgetRuntimePin'] else receipt
        self.assertEqual(N.bind_setup(c,recipe,read),receipt)
        for key,value in [('parent','other'),('full500Authority',True),('policy',{})]:
            bad={**receipt,key:value}
            with self.assertRaises(RuntimeError):N.bind_setup(c,recipe,lambda p:runtime()if p==c['nativeBudgetRuntimePin']else bad)

    def test_node_receipts_cover_multiple_actual_pid_and_worker_identities(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);node_fixture(directory,pid=42,thread=1);node_fixture(directory,pid=43,thread=0)
            result=N.node_receipts(directory)
            self.assertTrue(result['pass_']);self.assertEqual(result['isolates'],3)
            self.assertEqual(result['oldSpaceMiB'],384)
            self.assertEqual(result['maximumObservedHeapSizeLimitBytes'],432*1024**2)
            self.assertTrue(result['heapLimitIsNotTotalRSS']);self.assertTrue(result['totalNativePeakStillRequired'])

    def test_missing_node_start_or_exit_never_qualifies(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);reject_receipts(self,directory)
            node_fixture(directory)
            for phase in ['STARTED','EXITED']:
                p=directory/f'NODE_HEAP_42_0.{phase}.SAFE.json';body=p.read_text();p.unlink()
                reject_receipts(self,directory);p.write_text(body)

    def test_node_receipt_malformed_identity_phase_and_effective_heap_rejected(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory)
            p=directory/'NODE_HEAP_42_0.EXITED.SAFE.json';good=json.loads(p.read_text())
            for change in [{'pid':43},{'threadId':1},{'phase':'STARTED'},
                           {'schema':'future-unreviewed'},{'oldSpaceMiB':1536},
                           {'semiSpaceMiB':8},
                           {'heapSizeLimitBytes':4496293888},{'heapSizeLimitBytes':0},
                           {'heapSizeLimitBytes':True},{'heapSizeLimitBytes':432.0*1024**2}]:
                with self.subTest(change=change):
                    p.write_text(json.dumps({**good,**change}));reject_receipts(self,directory)
            p.write_text('{truncated');reject_receipts(self,directory)

    def test_additional_node_start_or_exit_identity_never_qualifies(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory)
            for phase in ['STARTED','EXITED']:
                extra=directory/f'NODE_HEAP_99_0.{phase}.SAFE.json'
                row=json.loads((directory/f'NODE_HEAP_42_0.{phase}.SAFE.json').read_text());row['pid']=99
                extra.write_text(json.dumps(row))
                with self.subTest(phase=phase):reject_receipts(self,directory)
                extra.unlink()

    def test_node_receipt_integer_identity_not_coerced_from_boolean_or_float(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory,pid=1)
            p=directory/'NODE_HEAP_1_0.EXITED.SAFE.json';good=json.loads(p.read_text())
            for change in [{'pid':True},{'pid':1.0},{'threadId':False},{'threadId':0.0}]:
                p.write_text(json.dumps({**good,**change}))
                with self.subTest(change=change):reject_receipts(self,directory)

    def test_http_identity_filename_and_schema_must_match_node_receipts(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory)
            p=directory/'HTTP_42_0.STARTED.SAFE.json';good=json.loads(p.read_text())
            for change in [{'schema':'wrong-schema'},{'pid':True},{'pid':42.0},{'threadId':False},{'threadId':0.0}]:
                p.write_text(json.dumps({**good,**change}))
                with self.subTest(change=change):reject_receipts(self,directory)
            p.write_text(json.dumps(good));p.rename(directory/'HTTP_99_0.STARTED.SAFE.json')
            reject_receipts(self,directory)

    def test_node_receipt_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory)
            p=directory/'NODE_HEAP_42_0.EXITED.SAFE.json';real=directory/'OWN_TEST_TARGET.json';p.rename(real);p.symlink_to(real)
            reject_receipts(self,directory)

    def test_private_worker_without_http_is_qualified_by_its_actual_parent_observation(self):
        for code in [0,1]:
            with self.subTest(exit_code=code),tempfile.TemporaryDirectory()as td:
                directory=Path(td);node_fixture(directory);worker_fixture(directory,exit_code=code)
                result=N.node_receipts(directory)
                self.assertTrue(result['pass_']);self.assertEqual(result['isolates'],2)
                self.assertEqual(result['httpMeteredIsolates'],1);self.assertEqual(result['privateWorkers'],1)

    def test_worker_with_own_http_receipts_is_not_double_counted_as_an_isolate(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);node_fixture(directory,thread=1);worker_fixture(directory)
            result=N.node_receipts(directory)
            self.assertEqual(result['isolates'],2);self.assertEqual(result['httpMeteredIsolates'],2)
            self.assertEqual(result['privateWorkers'],1)

    def test_private_worker_missing_discovery_measurement_or_exit_is_not_complete(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);worker_fixture(directory)
            for phase in ['DISCOVERED','STARTED','EXITED']:
                path=directory/f'NODE_WORKER_42_1.{phase}.SAFE.json';body=path.read_text();path.unlink()
                with self.subTest(phase=phase):reject_receipts(self,directory)
                path.write_text(body)

    def test_private_worker_identity_owner_or_effective_budget_drift_is_rejected(self):
        changes=[('DISCOVERED',{'observerThreadId':99}),('DISCOVERED',{'observerThreadId':1}),
                 ('DISCOVERED',{'observerThreadId':False}),('DISCOVERED',{'threadId':0}),
                 ('DISCOVERED',{'pid':42.0}),('STARTED',{'observerThreadId':1}),
                 ('STARTED',{'oldSpaceMiB':1536}),('STARTED',{'semiSpaceMiB':64}),
                 ('STARTED',{'heapSizeLimitBytes':4496293888}),('STARTED',{'measurement':'CLAIM_NOT_LIVE'}),
                 ('EXITED',{'startupBudgetVerified':False}),('EXITED',{'noPostExitHeapMeasurementClaimed':False}),
                 ('EXITED',{'exitCode':-1}),('EXITED',{'exitCode':True}),('EXITED',{'exitCode':1.0})]
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);worker_fixture(directory)
            for phase,change in changes:
                path=directory/f'NODE_WORKER_42_1.{phase}.SAFE.json';body=path.read_text()
                path.write_text(json.dumps({**json.loads(body),**change}))
                with self.subTest(phase=phase,change=change):reject_receipts(self,directory)
                path.write_text(body)

    def test_worker_counter_mismatch_failure_or_late_startup_cannot_pass(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);worker_fixture(directory)
            path=directory/'NODE_HEAP_42_0.EXITED.SAFE.json';body=path.read_text();good=json.loads(body)
            for change in [{'discovered':2},{'measured':0},{'exited':0},{'failed':1},{'exited':True},{'extra':0}]:
                row=copy.deepcopy(good);row['workerCounts'].update(change);path.write_text(json.dumps(row))
                with self.subTest(change=change):reject_receipts(self,directory)
            path.write_text(body)
            start=directory/'NODE_HEAP_42_0.STARTED.SAFE.json';row=json.loads(start.read_text());row['workerCounts']['discovered']=1
            start.write_text(json.dumps(row));reject_receipts(self,directory)

    def test_unmatched_failed_or_noncanonical_worker_receipt_cannot_pass(self):
        with tempfile.TemporaryDirectory()as td:
            directory=Path(td);node_fixture(directory);worker_fixture(directory)
            for name,body in [('NODE_WORKER_42_99.EXITED.SAFE.json',{}),
                              ('NODE_WORKER_42_1.FAILED.SAFE.json',{}),
                              ('NODE_WORKER_042_01.DISCOVERED.SAFE.json',{}),
                              ('NODE_WORKER_42_1.UNKNOWN.SAFE.json',{})]:
                path=directory/name;path.write_text(json.dumps(body))
                with self.subTest(name=name):reject_receipts(self,directory)
                path.unlink()

    def test_failed_helper_identity_does_not_mask_original_error_or_stop_unknown_id(self):
        with tempfile.TemporaryDirectory(dir='/workspace')as td:
            directory=Path(td);group_root=directory/'groups';group_root.mkdir();out=directory/'setup'
            original=RuntimeError('TEST_ONLY_ORIGINAL_START_FAILURE');cleanup=RuntimeError('TEST_ONLY_IDENTITY_UNAVAILABLE')
            def docker(args,**kw):
                if args[0]=='create':return SimpleNamespace(stdout='a'*64)
                if args[0]=='start':raise original
                raise AssertionError('an unverified helper must not be stopped')
            with patch.object(N,'CGROUP_ROOT',group_root),patch.object(N,'validate_runtime'),patch.object(N,'small_setup_capacity'),\
                 patch.object(N,'docker',side_effect=docker)as calls,patch.object(N,'helper_state',side_effect=[{'Running':False},cleanup]):
                with self.assertRaises(RuntimeError)as caught:N.start(out,PARENT,runtime())
            self.assertIs(caught.exception,original)
            self.assertEqual([c.args[0][0]for c in calls.call_args_list],['create','start'])
            close=json.loads((out/'FAILURE_CLOSE.SAFE.json').read_text())
            self.assertTrue(close['originalErrorPreserved']);self.assertFalse(close['helpers'][0]['closed'])
            self.assertEqual(close['helpers'][0]['errorType'],'RuntimeError')
            self.assertTrue((out/'STOP').exists());self.assertFalse((out/'READY.SAFE.json').exists())

    def test_unknown_setter_start_is_not_retried_and_only_verified_helpers_close(self):
        with tempfile.TemporaryDirectory(dir='/workspace')as td:
            directory=Path(td);group_root=directory/'groups';group_root.mkdir();out=directory/'setup';group=group_root/PARENT
            original=subprocess.TimeoutExpired('TEST_ONLY_UNKNOWN_SETTER_OUTCOME',1)
            ids=['a'*64,'b'*64];running={};created=[]
            def docker(args,**kw):
                command=args[0]
                if command=='create':
                    cid=ids[len(created)];created.append(cid);running[cid]=False;return SimpleNamespace(stdout=cid)
                if command=='start':
                    running[args[1]]=True
                    if args[1]==ids[0]:
                        group.mkdir()
                        for name in ['memory.max','memory.high','memory.swap.max']:(group/name).write_text('max')
                        return SimpleNamespace(stdout=args[1])
                    raise original
                if command=='stop':running[args[-1]]=False;return SimpleNamespace(stdout=args[-1])
                raise AssertionError('unknown setter outcome must stop, never wait/retry')
            state=lambda entry,*args:{'Running':running[entry['id']],
                'Pid':42+ids.index(entry['id'])if running[entry['id']]else 0,'ExitCode':0,'OOMKilled':False}
            with patch.object(N,'CGROUP_ROOT',group_root),patch.object(N,'validate_runtime'),patch.object(N,'small_setup_capacity'),\
                 patch.object(N,'docker',side_effect=docker)as calls,patch.object(N,'helper_state',side_effect=state),patch.object(N,'assert_setup_exclusive'):
                with self.assertRaises(subprocess.TimeoutExpired)as caught:N.start(out,PARENT,runtime())
            self.assertIs(caught.exception,original);self.assertEqual(created,ids)
            starts=[c.args[0]for c in calls.call_args_list if c.args[0][0]=='start']
            self.assertEqual(starts,[['start',ids[0]],['start',ids[1]]])
            stopped=[c.args[0][-1]for c in calls.call_args_list if c.args[0][0]=='stop']
            self.assertEqual(stopped,ids);self.assertFalse(any(running.values()))
            self.assertFalse((out/'READY.SAFE.json').exists())
            close=json.loads((out/'FAILURE_CLOSE.SAFE.json').read_text());self.assertTrue(all(x['closed']for x in close['helpers']))

    def test_failed_diagnostic_write_does_not_replace_original_start_error(self):
        with tempfile.TemporaryDirectory(dir='/workspace')as td:
            directory=Path(td);group_root=directory/'groups';group_root.mkdir();out=directory/'setup'
            original=RuntimeError('TEST_ONLY_ORIGINAL_START_FAILURE');real_save=N.save
            def save(path,value):
                if Path(path).name=='FAILURE.SAFE.json':raise OSError('TEST_ONLY_DIAGNOSTIC_FILESYSTEM_FAILURE')
                return real_save(path,value)
            def docker(args,**kw):
                if args[0]=='create':return SimpleNamespace(stdout='a'*64)
                if args[0]=='start':raise original
                raise AssertionError('no other Docker action expected')
            with patch.object(N,'CGROUP_ROOT',group_root),patch.object(N,'validate_runtime'),patch.object(N,'small_setup_capacity'),\
                 patch.object(N,'docker',side_effect=docker),patch.object(N,'helper_state',return_value={'Running':False,'Pid':0}),patch.object(N,'save',side_effect=save):
                with self.assertRaises(RuntimeError)as caught:N.start(out,PARENT,runtime())
            self.assertIs(caught.exception,original)
            self.assertTrue((out/'STOP').exists())
            self.assertTrue(json.loads((out/'FAILURE_CLOSE.SAFE.json').read_text())['allKnownHelpersClosed'])

    def test_compiled_helper_rejects_invalid_scope_bounds_and_missing_owned_bind(self):
        with tempfile.TemporaryDirectory()as td:
            exe=Path(td)/'helper'
            subprocess.run(['gcc','-static','-O2','-Wall','-Wextra','-Werror','-o',str(exe),str(BIN/'native-memory-budget-helper.c')],check=True,capture_output=True)
            valid=['set',PARENT,'1','50331648','33554432','0']
            cases=[[],['hold','/tmp/STOP'],valid,
                   ['set','/sys/fs/cgroup','1','50331648','33554432','0'],
                   ['set',PARENT,'1','2048000000','33554432','0'],
                   ['set',PARENT,'1','50331649','33554432','0'],
                   ['set',PARENT,'-1','50331648','33554432','0'],
                   ['set',PARENT,'1','50331648','50331648','0'],
                   ['set',PARENT,'1','50331648','33554432','1']]
            for args in cases:
                with self.subTest(args=args):self.assertNotEqual(subprocess.run([str(exe),*args],capture_output=True).returncode,0)

if __name__=='__main__':unittest.main()
