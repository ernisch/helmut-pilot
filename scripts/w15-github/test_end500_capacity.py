"""Targeted fictional admission, inner guard, IPC and failure counterexamples."""
import sys
sys.dont_write_bytecode = True
import ast
import copy
import hashlib
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location('end_capacity_test_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


T, F, A = load('test_restore_capacity'), load('test_restore_workflow'), load('test_end500_dispatch')
R, W, C = T.R, F.W, T.C
TRACE = C.end_capacity_trace()


def sample(peak=3100000000):
    value = T.sample(peak)
    value['capacityMeasurement'] = T.measurement(value)
    return value


def request():
    value = F.request(W.END_CAPACITY)
    value['limits'] = copy.deepcopy(T.D.LIMITS)
    value['approval'].update(limits=copy.deepcopy(T.D.LIMITS), resourceContract=TRACE.PROFILE,
        restoreFunctionAcceptance={**C.phase_contract().FUNCTION_REFERENCE, 'targetCommit':F.COMMIT,
                                  'compatibilityReviewSHA256':'b'*64})
    return value


class EndCapacityChecks(unittest.TestCase):
    def test_exact_new_go_contract_and_closed_success_never_promote_legacy(self):
        q=request()
        with patch.dict(os.environ,F.environment(q)):
            W.validate_admission(q,F.payload(q)); R.validate_request(q,F.payload(q))
            for key, bad in (('limits',W.LIMITS),('maximumWallSeconds',1800)):
                altered=copy.deepcopy(q); altered[key]=bad
                with self.assertRaises(W.WorkflowRejected):W.validate_admission(altered,F.payload(altered))
            altered=copy.deepcopy(q);altered['approval']['resourceContract']=C.phase_contract().END_PROFILE
            with self.assertRaises(W.WorkflowRejected):W.validate_admission(altered,F.payload(altered))
        result=W._result(q);R._worker_result(result,q)
        self.assertTrue(result['end500BodyCompleted']);self.assertTrue(result['capacityDiagnosticOnly'])
        self.assertFalse(result['legacyRestoreAccepted']);self.assertFalse(result['end500Acceptance'])
        self.assertEqual(R._ctx(q)['endCapacityDiagnostic'],True)
        self.assertEqual((W.LIMITS['maximumConsumptionBytes'],C.MAXIMUM),(2048000000,2048000000))

    def test_real_inner_watch_accepts_measured_old_excess_only_with_explicit_capacity(self):
        # Execute the unchanged class source with the same fake base used by the
        # existing restore capacity tests; no database or native process starts.
        source=Path(__file__).parents[1]/'synthetik-500-w15-memory-forward.py'
        tree=ast.parse(source.read_text()); method=next(x for x in next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='Watch').body if isinstance(x,ast.FunctionDef) and x.name=='sample')
        scope={'time':SimpleNamespace(monotonic=lambda:0),'WORK':Path('/FICTIONAL'),
               'end500_memory_assessment':lambda _:False}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[method],type_ignores=[])),'selected-inner-guard','exec'),scope)
        watch=SimpleNamespace(common_resources=SimpleNamespace(capacity_diagnostic=True,sample=lambda:sample()),
            start_guard=None,mock_backup_closure=False,last=None,maximum=0,memory_failure=None,
            disk_check=lambda:None,last_component=1)
        scope['sample'](watch)
        self.assertGreater(watch.maximum,2048000000)
        watch.common_resources.sample=lambda:(_ for _ in ()).throw(ValueError('synthetic hard/OOM/swap rejection'))
        with self.assertRaises(ValueError):scope['sample'](watch)
        self.assertIsNotNone(watch.memory_failure)

    def test_full_controller_connects_existing_five_restore_and_four_export_checkpoints(self):
        source=Path(__file__).parents[1]/'synthetik-500-w15-memory-forward.py'
        tree=ast.parse(source.read_text())
        node=next(x for x in ast.walk(tree) if isinstance(x,ast.If)
            and any(isinstance(y,ast.Assign) and any(isinstance(z,ast.Attribute) and z.attr=='phase_observer'
                for z in y.targets) for y in x.body))
        observer=[];watch=SimpleNamespace(thread=SimpleNamespace(is_alive=lambda:True),
            finished=SimpleNamespace(is_set=lambda:False),failure=None,stop_failure=None,process=None,
            closure_mode=True,last_stage_exit_code=0,stage=lambda *args:None)
        scope={'w':watch,'common_resources':SimpleNamespace(end_capacity_diagnostic=True,phase_observer=observer.append)}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'actual-full-watch-binding','exec'),scope)
        O=load('runtime_owned_backup');base='/tmp/w15-memory-atomic-20261028d';db='helmut_w15_memory_atomic_20261028d'
        container='w15-end500-123456-'+'a'*32
        controller=SimpleNamespace(BASE=base,DB=db,CONTAINER=container,DOCKER=['docker','--host=unix:///var/run/docker.sock'])
        for domain,actions in (('end500-restore',O.RESTORE_ACTIONS),('end500-backup',O.ACTIONS)):
            runner=O.OwnedBackupRunner(watch,controller,base=base,container=container,database=db,scope=domain)
            watch.backup_runner=runner
            for action in actions:
                runner.run_owned(controller.DOCKER+['exec','--user','1000:1000',container,'sh','-c','FICTIONAL'],action,60)
        self.assertEqual(observer,['connection-'+x for x in O.RESTORE_ACTIONS]+['connection-export-'+x for x in O.ACTIONS])

    def test_confirmed_progress_pipe_drain_survives_worker_eof_without_new_memory_sample(self):
        receive,send=multiprocessing.Pipe(duplex=False)
        last={'endTrace':TRACE.Collector(),'memory':C.project_failure_memory(sample(),True)}
        last['endTrace'].observe(sample())
        callback=R._capacity_checkpoint(last,{},None)
        report=R._capacity_reporter(send)
        report(progress={'authCAS':{'value':17,'kind':'CONFIRMED_LOWER_BOUND'}})
        send.close()
        try:
            with self.assertRaises(R.RunnerStartError):
                R._read_worker_response(receive,time.monotonic()+2,capacity_checkpoint=callback)
        finally:receive.close()
        trace=last['memory']['end500CapacityTrace']
        self.assertEqual(trace['progress']['authCAS']['value'],17)
        self.assertEqual(trace['progress']['usageRows'],'UNKNOWN')
        self.assertEqual(trace['sampleCount'],1)
        self.assertFalse(trace['anyCapacitySafetyFailureOrUnknown'])
        self.assertEqual(trace['progress']['authCAS']['timeBasis'],'CONFIRMED_PROGRESS_RECEIVED')

    def test_progress_mode_sequence_bounds_and_counter_regression_rejected(self):
        last={'endTrace':TRACE.Collector()};last['endTrace'].observe(sample())
        callback=R._capacity_checkpoint(last,{},None)
        base={'kind':'capacity-checkpoint','sequence':1,'progress':{'authCAS':{'value':10,'kind':'CONFIRMED_LOWER_BOUND'}},'binding':None}
        callback(base)
        for packet in ({**base,'sequence':1},{**base,'sequence':2,'progress':{'authCAS':{'value':9,'kind':'EXACT'}}},
                       {**base,'sequence':2,'progress':{'authCAS':{'value':501,'kind':'EXACT'}}}):
            with self.assertRaises(R.RunnerStartError):callback(packet)

    def test_final_pre_stop_drain_keeps_first_memory_failure_and_late_confirmed_counter(self):
        last={'endTrace':TRACE.Collector(),'memory':C.project_failure_memory(sample(),True)}
        last['endTrace'].observe(sample());last['memory']['end500CapacityTrace']=last['endTrace'].summary()
        callback=R._capacity_checkpoint(last,{},None)
        receive,send=multiprocessing.Pipe(duplex=False)
        R._capacity_reporter(send)(progress={'authCAS':{'value':23,'kind':'CONFIRMED_LOWER_BOUND'}})
        send.close()
        child=SimpleNamespace(pid=4321,exitcode=1,alive=True,start=lambda:None,join=lambda **_:None)
        child.is_alive=lambda:child.alive
        child.terminate=lambda:setattr(child,'alive',False)
        child.kill=child.terminate
        original=R._read_worker_response;calls=[]
        def read(*args,**kwargs):
            calls.append(1)
            return None if len(calls)==1 else original(*args,**kwargs)
        def guard():
            error=ValueError('synthetic hard rejection')
            error.failure_memory=copy.deepcopy(last['memory'])
            raise error
        with patch.object(R,'_read_worker_response',side_effect=read):
            with self.assertRaises(R.RunnerStartError) as caught:
                R._monitor_child(child,receive,SimpleNamespace(close=lambda:None),guard,time.monotonic()+2,
                    memory=lambda:last['memory'],capacity_checkpoint=callback)
        failure=caught.exception
        self.assertEqual(failure.runner['reason'],'SUPERVISOR_REJECTED')
        self.assertEqual(failure.runner['memory']['kernelLifetimePeakBytes'],3100000000)
        self.assertEqual(failure.runner['memory']['end500CapacityTrace']['progress']['authCAS']['value'],23)
        self.assertEqual(failure.cleanup['workerExited'],'PASS')

    def test_both_privileged_entry_checks_reject_dirty_new_helper_blobs(self):
        q=request()
        for owner in (R,R.P):
            for changed in ('end500_capacity_trace.py','end500_capacity_roles.py','memory_components.py'):
                seen=[]
                def raw(relative):
                    seen.append(relative);value=(owner.REPO/relative).read_bytes()
                    sha=hashlib.sha1(b'blob '+str(len(value)).encode()+b'\0'+value).hexdigest()
                    if relative.endswith('/'+changed):sha='0'*40
                    return ('100644 blob '+sha+'\t'+relative+'\0').encode()
                def git(repo,args,**kwargs):
                    return (q['exactCommit']+'\n').encode() if args==['rev-parse','HEAD'] else raw(args[-1])
                def command(args,**kwargs):
                    return SimpleNamespace(stdout=(q['exactCommit']+'\n').encode() if args[-1]=='HEAD' else raw(args[-1]))
                with patch.dict(os.environ,F.environment(q)):
                    if owner is R:
                        with patch.object(owner,'_git',side_effect=git),self.assertRaises(R.RunnerStartError):owner.github_binding(q)
                    else:
                        with patch.object(owner,'command',side_effect=command),self.assertRaises(Exception):
                            owner.github_binding(q['runId'],q['exactCommit'],capacity_diagnostic=True)
                self.assertTrue(any(n.endswith('/'+changed) for n in seen))

    def test_parent_guard_keeps_trace_after_missing_inner_report_and_rejected_sample(self):
        ctx={'endCapacityDiagnostic':True,'capacityDiagnostic':True}
        last={'memory':None,'observedPhase':{'name':'capacity-seed','sequence':22,'meaning':'ENTERED_NOT_COMPLETED'}}
        parent=SimpleNamespace(read_parent=lambda *a,**k:sample())
        with patch.object(R,'_load',side_effect=Exception('optional attribution unavailable')):
            R._parent_readback(parent,ctx,(1,2),last)
        self.assertIsNotNone(C.closed_failure_memory(last['memory']))
        bad=ValueError('synthetic limit');bad.failure_memory=C.project_failure_memory(sample(4999999489),False)
        parent.read_parent=lambda *a,**k:(_ for _ in ()).throw(bad)
        with self.assertRaises(R.RunnerStartError) as caught:R._parent_readback(parent,ctx,(1,2),last)
        memory=caught.exception.runner['memory']
        self.assertEqual(memory['kernelLifetimePeakBytes'],4999999489)
        self.assertEqual(memory['end500CapacityTrace']['phaseObservations'][-1]['phase']['name'],'capacity-seed')
        self.assertTrue(memory['end500CapacityTrace']['anyCapacitySafetyFailureOrUnknown'])

    def test_final_outer_guard_rejection_cannot_erase_completed_inner_trace(self):
        inner=TRACE.Collector();inner.observe(sample(),phase={'name':'capacity-processing-stopped','sequence':31,'meaning':'ENTERED_NOT_COMPLETED'})
        inner.confirm_progress({key:{'value':n,'kind':'EXACT'} for key,n in
            (('authCAS',500),('usageRows',6000),('nativePostimages',3501))},2000000)
        last={'endTrace':TRACE.Collector(),'serviceEndTrace':inner.summary()}
        last['endTrace'].observe(sample(100))
        last['memory']=C.project_failure_memory(sample(100),True)
        error=ValueError('synthetic final root rejection')
        error.failure_memory=C.project_failure_memory(sample(4999999489),False)
        parent=SimpleNamespace(read_parent=lambda *a,**k:(_ for _ in ()).throw(error))
        with self.assertRaises(R.RunnerStartError) as caught:
            R._parent_readback(parent,{'endCapacityDiagnostic':True,'capacityDiagnostic':True},(1,2),last,empty=True)
        memory=caught.exception.runner['memory']
        self.assertEqual(memory['kernelLifetimePeakBytes'],4999999489)
        self.assertEqual(memory['end500CapacityTrace'],last['serviceEndTrace'])
        for key,n in (('authCAS',500),('usageRows',6000),('nativePostimages',3501)):
            self.assertEqual(memory['end500CapacityTrace']['progress'][key]['value'],n)
            self.assertEqual(memory['end500CapacityTrace']['progress'][key]['kind'],'EXACT')

    def test_failure_envelope_deduplicates_only_optional_worker_history_and_js_closes_trace(self):
        collector=TRACE.Collector();collector.observe(sample(),phase={'name':'capacity-auth-cas','sequence':24,'meaning':'ENTERED_NOT_COMPLETED'})
        core=C.project_failure_memory(sample(),False);core['end500CapacityTrace']=collector.summary()
        failure=R.RunnerStartError('worker','end500',core,runner={'reason':'PARENT_READBACK_REJECTED','memory':core,'memorySource':'CURRENT_REJECTED_READBACK'})
        packet=R._failure_packet(failure)
        self.assertNotIn('capacityMeasurement',packet['workerMemory'])
        self.assertEqual(packet['workerPhase'],'end500')
        self.assertLess(len(R._encode(packet,R.MAX_RESULT)),R.MAX_RESULT)
        validator=Path(__file__).parents[2]/'.github/actions/w15-isolated/capacity-trace.js'
        program="const c=require(process.argv[1]).closed;const v=JSON.parse(require('fs').readFileSync(0,'utf8'));if(!c(v)||c({...v,secret:'PRIVATE'})||c({...v,hardLimitBytes:5000000000}))process.exit(1);"
        result=subprocess.run(['node','-e',program,str(validator)],input=json.dumps(core['end500CapacityTrace']),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        # Exercise the action's actual second projection, including its local
        # module resolution, rather than only testing the separate validator.
        action=validator.with_name('index.js')
        program="const fs=require('fs'),vm=require('vm'),m=require('module');const p=process.argv[1],ctx={require:m.createRequire(p)};vm.createContext(ctx);vm.runInContext(fs.readFileSync(p,'utf8').split('// Runtime artifact')[0],ctx);const v=JSON.parse(fs.readFileSync(0,'utf8'));if(!ctx.closedFailureMemory(v)?.end500CapacityTrace)process.exit(1);v.end500CapacityTrace.secret='PRIVATE';if(ctx.closedFailureMemory(v)?.end500CapacityTrace)process.exit(2);if(!ctx.closedFailureMemory(v))process.exit(3);"
        result=subprocess.run(['node','-e',program,str(action)],input=json.dumps(core),text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_sender_requires_capacity_scope_before_ready_and_single_bound_post(self):
        sender=A.EndSenderChecks();sender.setUp();self.addCleanup(sender.doCleanups)
        D=A.D; original=sender.review
        sender.review=lambda launcher=False:{**original(launcher),'scope':TRACE.SCOPE}
        sender.request['limits']=copy.deepcopy(D.CAP.LIMITS)
        sender.request['approval'].pop('restoreAcceptance')
        sender.request['approval'].update(scope=TRACE.SCOPE,mode=TRACE.MODE,limits=copy.deepcopy(D.CAP.LIMITS),resourceContract=TRACE.PROFILE,
            restoreFunctionAcceptance={**D.PC.FUNCTION_REFERENCE,'targetCommit':A.TARGET,'compatibilityReviewSHA256':'c'*64})
        sender.go.update(scope=TRACE.SCOPE,requestSHA256=A.digest(sender.request),reviewSHA256=A.digest(sender.review()),
            launcherReviewSHA256=A.digest(sender.review(True)),restoreAcceptanceReviewSHA256='c'*64)
        with patch.object(D.FUNCTION,'verify',side_effect=lambda *a,**k:sender.events.append(('PRIVATE_FUNCTION_CHECK',None))):
            result=sender.run_case()
        self.assertTrue(result['dispatchAccepted']);self.assertEqual(len(sender.api.posts),1)
        self.assertEqual(sender.api.posts[0]['inputs']['w15_mode'],TRACE.MODE)
        self.assertLess(sender.events.index(('PRIVATE_FUNCTION_CHECK',None)),sender.events.index(('READY',None)))
        self.assertFalse(result['end500Accepted'])


if __name__=='__main__':unittest.main()
