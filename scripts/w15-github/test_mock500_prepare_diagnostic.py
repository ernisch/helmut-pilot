"""Tiny actual admission/controller/zero seams; no original data or native calls."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

HERE=Path(__file__).parent
def load(name):
    s=importlib.util.spec_from_file_location('prepare_diag_'+name,HERE/(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

P,T,F,R=map(load,('mock500_prepare_contract','test_mock500_materials_diagnostic','test_mock500_inputs','mock500_runner'))
CANARY='FICTIONAL_PRIVATE_CAUSE_NOT_PUBLIC'

class PrepareDiagnosticChecks(unittest.TestCase):
    def admission(self):
        t=T.MaterialsAdmissionChecks('runTest');self.addCleanup(t.doCleanups)
        start,case=t.fixture()
        case.approval.update(scope=P.SCOPE,resourceContract=P.CONTRACT,sourceContract=start.SOURCE_REPLAY,
            simulationCalendar=start.SIMULATION_CALENDAR,diagnosticOfRunId=P.DIAGNOSTIC_OF,
            inputBindingSHA256=case.request.get('bindings',{}).get('inputBindingSHA256','d'*64))
        return t,start,case

    def test_own_scope_and_exact_zero_contract_produce_only_bound_diagnostic_authority(self):
        t,start,c=self.admission();v=t.admit(start,c)
        a=v['prepareDiagnosticAuthorization'];self.assertEqual(a['scope'],P.SCOPE)
        self.assertEqual(a['contract'],P.CONTRACT);self.assertFalse(v['executionAuthority'])
        P.validate_authorization(a,c.observed,binding_sha=c.approval['inputBindingSHA256'],
            source_sha=c.approval['sourceQualificationSHA256'],approval_sha=v['sourceReplayAuthorization']['approvalSHA256'])
        self.assertEqual(a['approvalSHA256'],v['simulationCalendarAuthorization']['approvalSHA256'])

    def test_full_old_expired_wrong_parent_and_nonzero_grants_never_unlock_prepare_variant(self):
        t,start,c=self.admission();original=copy.deepcopy(c.approval)
        for change in ({'scope':T.CONTRACT.SCOPE},{'resourceContract':T.CONTRACT.CONTRACT},
                       {'expectedUnits':1},{'maxProviderCalls':1},{'diagnosticOfRunId':'123456789'},
                       {'inputBindingSHA256':'PRIVATE'},{'authorized':False},{'expiresAt':'2026-11-02T09:59:59Z'},
                       {'nonce':'22222222-2222-4333-8444-555555555555'},{'simulationCalendar':'UNKNOWN'}):
            c.approval.clear();c.approval.update(original);c.approval.update(change)
            with self.subTest(change=change),self.assertRaises(start.StartRejected):t.admit(start,c)
        c.approval.clear();c.approval.update(original);c.approval.pop('sourceContract')
        with self.assertRaises(start.StartRejected):t.admit(start,c)

    def test_closed_authorization_rejects_private_extras_binding_drift_and_wrong_context(self):
        t,start,c=self.admission();a=t.admit(start,c)['prepareDiagnosticAuthorization']
        for bad in ({**a,'raw':CANARY},{**a,'inputBindingSHA256':'a'*64},{**a,'runAttempt':True},
                    {**a,'scope':T.CONTRACT.SCOPE},{**a,'nonce':'22222222-2222-4333-8444-555555555555'}):
            with self.subTest(keys=list(bad)),self.assertRaises(ValueError):
                P.validate_authorization(bad,c.observed,binding_sha=c.approval['inputBindingSHA256'])

    def pipeline(self, *, fail=False, corrupt_check=False):
        fixture=F.ControllerAdmissionChecks('runTest');self.addCleanup(fixture.doCleanups)
        def inject(owner,c):
            original=c.Supervisor.stage
            def stage(s,command,name,*args,**kwargs):
                if name=='materials':self.assertIn('--atomic-prepared0',command)
                result=original(s,command,name,*args,**kwargs)
                if name=='prepare'and fail:
                    s.prepare_failure={'schema':'helmut-w15-mock500-prepare-failure/1','stage':'stored-command',
                        'category':'PREPARE_STORED_CHECK_123','kind':'assertion'}
                    s.failure={'type':'RuntimeError','reason':'full500-stage-failed:prepare:1'}
                    raise RuntimeError(CANARY)
                if name=='prepare'and corrupt_check:
                    p=c.WORK/'state/PREPARE_DIAGNOSTIC_CHECKS.SAFE.json';v=json.loads(p.read_text());v['authorityInstalled']=True;p.write_text(json.dumps(v));p.chmod(0o600)
                return result
            p=patch.object(c.Supervisor,'stage',stage);p.start();owner.addCleanup(p.stop)
        return fixture._run_fictional_bound_pipeline(diagnostic=True,prepare_diagnostic=True,inject=inject)

    def test_actual_pipeline_ends_after_prepare_and_proves_zero_and_owned_stop(self):
        value,events=self.pipeline();self.assertTrue(value['prepareCompleted'])
        self.assertFalse(value['authorityInstalled']);self.assertEqual(events.count('prepare'),1)
        self.assertEqual(value['activeProfiles'],0)
        for action in ('run','audit','backup','atomic-check'):self.assertNotIn(action,events)

    def test_actual_workflow_forwards_only_bound_prepare_authorization_and_no_backup(self):
        t,start,c=self.admission();authorization=t.admit(start,c)['prepareDiagnosticAuthorization']
        w=load('test_mock500_workflow').WorkflowChecks('runTest');self.addCleanup(w.doCleanups)
        w._fictional_full_worker(prepare_authorization=authorization)

    def test_actual_prepare_failure_and_bad_stop_check_cannot_become_function_success(self):
        value,_=self.pipeline(fail=True);self.assertFalse(value['prepareCompleted'])
        self.assertEqual(value['firstFailurePhase'],'mock500-controller-prepare')
        self.assertEqual(value['prepareFailure']['category'],'PREPARE_STORED_CHECK_123')
        self.assertNotIn(CANARY,json.dumps(value));self.assertFalse(value['mock500Acceptance'])
        value,_=self.pipeline(corrupt_check=True);self.assertFalse(value['prepareCompleted'])

    def fixture_zero(self):
        fixture=F.ControllerAdmissionChecks('runTest');self.addCleanup(fixture.doCleanups)
        c=fixture.load_controller()
        tmp=tempfile.TemporaryDirectory(prefix='fictional-prepare-zero-');self.addCleanup(tmp.cleanup)
        root=Path(tmp.name);baseline={'profileFachHash':'a'*64,'prepareNativeInventory':'b'*64,'prepareDiagnosticCommit':'c'*40}
        observed={'database':c.DB,'profiles':500,'active':0,'profileFachHash':'a'*64}
        ctx={'database':c.DB,'operationId':'synthetik500-fictional-zero','manifestHash':'d'*64,'productionCommit':'c'*40}
        for name,value in [('WORK',root),('read',Mock(return_value=observed)),('sql',Mock()),('save',Mock())]:
            p=patch.object(c,name,value);p.start();self.addCleanup(p.stop)
        return c,root,baseline,observed,ctx

    def test_zero_is_actual_read_and_missing_context_requires_unchanged_native_inventory(self):
        c,root,b,o,ctx=self.fixture_zero()
        c.read.side_effect=[o,'b'*64];self.assertEqual(c.prepare_cleanup(b)['nativeZeroState'],'NO_NEW_NATIVE_SLOT_OBSERVED')
        for actual in ('f'*64,OSError(CANARY)):
            c.read.side_effect=[o,actual]
            with self.assertRaises((AssertionError,OSError)):c.prepare_cleanup(b)
        c.sql.assert_not_called()

    def test_bound_prepared_native_zero_only_and_never_repair_unexpected_activation(self):
        c,root,b,o,ctx=self.fixture_zero();p=root/'cleanup-context.PRIVATE.json';p.write_text(json.dumps(ctx));p.chmod(0o600)
        native={**ctx,'zustand':'vorbereitet','aktiv':0,'fachfelderUnveraendert':True,'quittungBindungBestaetigt':True}
        c.read.side_effect=[o,{'present':True},native]
        self.assertEqual(c.prepare_cleanup(b)['nativeZeroState'],'BOUND_PREPARED_ZERO')
        for bad in ({'active':1},{'active':500},{'profileFachHash':'f'*64}):
            c.read.side_effect=[{**o,**bad}]
            with self.assertRaises(AssertionError):c.prepare_cleanup(b)
        c.read.side_effect=[o,{'present':True},{**native,'zustand':'aktiv'}]
        with self.assertRaises(AssertionError):c.prepare_cleanup(b)
        c.sql.assert_not_called()

    def test_native_inventory_uses_actual_json_reader_and_json_typed_sql(self):
        fixture=F.ControllerAdmissionChecks('runTest');self.addCleanup(fixture.doCleanups)
        c=fixture.load_controller()
        with patch.object(c,'sql',return_value=json.dumps('b'*64))as sql:
            self.assertEqual(c.prepare_native_inventory(),'b'*64)
            self.assertIn('select to_jsonb(encode(',sql.call_args.args[0])
        with patch.object(c,'sql',return_value='b'*64),self.assertRaises(json.JSONDecodeError):
            c.prepare_native_inventory()

    def test_missing_rpc_private_extra_or_unknown_native_binding_never_means_absent(self):
        c,root,b,o,ctx=self.fixture_zero();p=root/'cleanup-context.PRIVATE.json';p.write_text(json.dumps(ctx));p.chmod(0o600)
        c.read.side_effect=[o,RuntimeError(CANARY)]
        with self.assertRaises(RuntimeError):c.prepare_cleanup(b)
        p.unlink();p.symlink_to(root/'ABSENT')
        c.read.side_effect=[o]
        with self.assertRaises(OSError):c.prepare_cleanup(b)
        c.sql.assert_not_called()

    def test_worker_and_check_shapes_reject_false_processing_or_authority_claims(self):
        value,_=self.pipeline();m={k:value[k]for k in ('mode','runId','runAttempt','nonce','exactCommit')}
        m['approval']={'scope':P.SCOPE,'resourceContract':P.CONTRACT}
        R.validate_public_result(value,m)
        for change in ({'units':1},{'providerPhases':1},{'authorityInstalled':True},{'activeProfiles':1},
                       {'mock500Acceptance':True},{'nativeZeroState':'UNKNOWN'},
                       {'nativeZeroState':'NO_OWNED_NATIVE_SLOT'},{'nativeZeroState':'NO_NEW_NATIVE_SLOT_OBSERVED'},{'raw':CANARY}):
            with self.subTest(change=change),self.assertRaises(ValueError):P.validate_result({**value,**change},m)

class ExternalPrepareAdmissionChecks(unittest.TestCase):
    def setUp(self):
        self.f=load('test_mock500_full_dispatch');self.c=self.f.MockFullDispatchChecks()
        self.c.setUp();self.addCleanup(self.c.doCleanups);self.d=self.f.D
        self.now=datetime(2026,11,4,10,tzinfo=timezone.utc)
        for target in (self.c.go,self.c.request['approval']):
            target.update(issuedAt=self.d.M.iso(self.now),expiresAt=self.d.M.iso(self.now+timedelta(hours=1)))
        self.c.go['scope']=P.SCOPE
        self.c.request.update(limits=self.d.W.limits(P.MODE),maximumWallSeconds=P.WALL_SECONDS)
        self.c.request['approval'].update(mode=P.MODE,scope=P.SCOPE,resourceContract=P.CONTRACT,
            limits=self.c.request['limits'],processingSeconds=P.PROCESSING_SECONDS,completionSeconds=P.WALL_SECONDS,
            expectedUnits=0,expectedPositions=0,expectedControls=0,sourceContract=self.d.S.SOURCE_REPLAY,
            simulationCalendar=self.d.S.SIMULATION_CALENDAR,diagnosticOfRunId=P.DIAGNOSTIC_OF,
            inputBindingSHA256=self.c.go['inputBindingSHA256'])

    def validate(self):
        self.c.go['requestSHA256']=self.d.digest(self.c.request)
        return self.d.validate_approval(self.c.go,self.f.TARGET,self.f.LAUNCHER,self.c.request,self.now)

    def test_exact_prepare_scope_and_both_historical_bindings_required_before_ready(self):
        self.validate();original=copy.deepcopy(self.c.request['approval'])
        for key in ('sourceContract','simulationCalendar'):
            self.c.request['approval']=copy.deepcopy(original);self.c.request['approval'].pop(key)
            with self.subTest(missing=key),self.assertRaises(self.d.DispatchRejected):self.validate()
        for change in ({'scope':T.CONTRACT.SCOPE},{'expectedUnits':500},{'maxProviderCalls':1},
                       {'resourceContract':T.CONTRACT.CONTRACT},{'diagnosticOfRunId':'123456789'},
                       {'inputBindingSHA256':'f'*64}):
            self.c.request['approval']={**original,**change}
            with self.subTest(change=change),self.assertRaises(self.d.DispatchRejected):self.validate()
        self.assertEqual(self.c.api.posts,[])


class PrepareEvidenceChecks(unittest.TestCase):
    def test_fixed_prepare_sources_are_cipher_only_with_unchanged_caps_and_safe_receipt(self):
        e=load('test_mock500_materials_evidence');t=e.MaterialsEvidenceChecks('runTest')
        t.setUp();self.addCleanup(t.doCleanups)
        t.manifest['approval']={'resourceContract':P.CONTRACT}
        state=t.work/'state';state.mkdir(mode=0o700)
        t.put(t.work/'prepare.PRIVATE.log',b'PRIVATE_PREPARE_STDERR')
        t.put(state/'prepare-FIRST-FAILURE.SAFE.json',b'{"schema":"fictional-first-error"}')
        t.put(t.work/'command.PRIVATE.json',b'MUST_NOT_SELECT_COMMAND')
        result=t.preserve();selected={row['path']for row in t.archive_manifest['files']}
        self.assertIn('prepare.PRIVATE.log',selected);self.assertIn('prepare-FIRST-FAILURE.SAFE.json',selected)
        self.assertNotIn('command.PRIVATE.json',selected)
        self.assertNotIn('PRIVATE_PREPARE_STDERR',json.dumps(result));self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertEqual(t.transport.roundtrip.call_count,1)
        self.assertLessEqual(sum(row['bytes']for row in t.archive_manifest['files']),e.E.MAX_TOTAL)

if __name__=='__main__':unittest.main()
