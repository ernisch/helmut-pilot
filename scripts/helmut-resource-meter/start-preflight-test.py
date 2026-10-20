#!/usr/bin/env python3
"""Targeted pre-GO regressions. No Docker, activation or resource run."""
import copy
import importlib.util
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BIN=Path(__file__).parent
def load(name,file):
    s=importlib.util.spec_from_file_location(name,BIN/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=load('start_preflight','start-preflight.py')
C=load('start_controller','full500-controller.py')

class StartPreflightTest(unittest.TestCase):
    def test_collects_every_failure_and_does_not_leak_private_error(self):
        r=P.Report()
        for name in ['missingOwner','missingDay','occupiedOutput']:
            r.check(name,'test-consumer','static-public-description',lambda:(_ for _ in ()).throw(RuntimeError('PRIVATE_AUTH_OR_TOKEN')))
        result=P.finish(r,None)
        self.assertEqual(len(result['checks']),3)
        self.assertFalse(result['pass'])
        self.assertNotIn('PRIVATE_AUTH_OR_TOKEN',json.dumps(result))
        self.assertFalse(result['oneTimeGOConsumed'])

    def test_complete_technical_plan_never_becomes_an_execution_receipt(self):
        r=P.Report();r.planning=True
        for id in P.REQUIRED_CHECKS:r.check(id,'test','test',lambda:{})
        result=P.finish(r,[])
        self.assertTrue(result['technicalReady']);self.assertFalse(result['pass'])
        self.assertEqual(result['authorizationStatus'],'MISSING_NEW_OPERATOR_GO')
        with self.assertRaises(RuntimeError):P.assert_ready(result)
        with self.assertRaises(RuntimeError):P.freeze_ready_report(result)

    def test_no_empty_partial_stale_future_or_false_receipt_is_authority(self):
        now=time.time()
        good={'schema':'helmut-complete-local-start-preflight/1','status':'READY_FOR_SEPARATE_EXACT_LOCAL_GO',
              'pass':True,'checkedAtUnixSeconds':now,'startedAtUnixSeconds':now,'checks':[{'id':id,'status':'PASS'}for id in P.REQUIRED_CHECKS]}
        P.assert_ready(good)
        for changes in [{'checks':[]},{'pass':False},{'checks':[{'id':'unusedGO','status':'PASS'}]},
                        {'checks':[{'id':id,'status':'BLOCKED'if id=='unusedGO'else'PASS'}for id in P.REQUIRED_CHECKS]},
                        {'checkedAtUnixSeconds':now-61},{'checkedAtUnixSeconds':now+5},
                        {'startedAtUnixSeconds':now-61},
                        {'status':'BLOCKED_DO_NOT_CONSUME_GO'},{'schema':'caller-hash-claim'}]:
            with self.subTest(changes=changes):
                with self.assertRaises(RuntimeError):P.assert_ready({**good,**changes})

    def test_blocked_precheck_precedes_every_controller_side_effect(self):
        blocker=type('Blocker',(),{'assess':staticmethod(lambda bindings:{'pass':False}),
            'assert_ready':staticmethod(lambda report:(_ for _ in ()).throw(RuntimeError('BLOCKED')))})
        with (patch.object(C,'module',return_value=blocker),patch.object(C,'accepted_metadata')as meta,
             patch.object(C.I.K,'save_new')as save,patch.object(C.I.K,'docker')as docker):
            with self.assertRaisesRegex(RuntimeError,'BLOCKED'):C.run({}, {}, {})
            meta.assert_not_called();save.assert_not_called();docker.assert_not_called()

    def test_real_controller_passes_independent_adoption_into_same_precheck(self):
        seen=[]
        blocker=type('Blocker',(),{'assess':staticmethod(lambda bindings:seen.append(bindings)or{'pass':False}),
            'assert_ready':staticmethod(lambda report:(_ for _ in ()).throw(RuntimeError('BLOCKED')))})
        adoption={'TEST_ONLY':'NOT_AUTHORITY'}
        with patch.object(C,'module',return_value=blocker):
            with self.assertRaises(RuntimeError):C.run({}, {}, {},start_preflight_adoption_pin=adoption)
        self.assertEqual(seen[0]['startPreflightIndependentAdoption'],adoption)

    def test_controller_original_error_survives_cleanup_and_secondary_report_failures(self):
        # All bindings are RAM-only sentinels. No reservation/GO/case file is
        # constructed and the actual one-shot workflow cannot be entered.
        invocation='TEST_ONLY_INVOCATION';reservation_pin={'TEST_ONLY':'RAM_RESERVATION'}
        connection_pin={'TEST_ONLY':'RAM_CONNECTION_NOT_AUTHORITY'}
        case='/TEST_ONLY_CASE_NEVER_CREATED'
        reservation=SimpleNamespace(exists=lambda:True)
        def read(pin):
            if pin==reservation_pin:return {'controllerInvocationId':invocation}
            if pin==connection_pin:return {'caseDirectory':case}
            raise AssertionError('unexpected actual authority read')
        for original_type in [RuntimeError,KeyboardInterrupt]:
            for cleanup_type in [OSError,KeyboardInterrupt]:
                for report_type in [OSError,KeyboardInterrupt]:
                    original=original_type('TEST_ONLY_ORIGINAL_WORKFLOW_FAILURE')
                    with self.subTest(original=original_type.__name__,cleanup=cleanup_type.__name__,report=report_type.__name__):
                        with (patch.object(C,'_run_once',side_effect=original)as workflow,
                              patch.object(C.secrets,'token_hex',return_value=invocation),
                              patch.object(C.I,'SETUP_RESERVATION',reservation),
                              patch.object(C.C,'pin',return_value=reservation_pin),
                              patch.object(C.C,'read_pin',side_effect=read),
                              patch.object(C.I,'close_failed_owned_setup',side_effect=cleanup_type('TEST_ONLY_CLOSE_FAILURE'))as close,
                              patch.object(C.N,'best_effort_save',side_effect=report_type('TEST_ONLY_SECONDARY_REPORT_FAILURE'))as report,
                              patch.object(C.I.K,'docker')as docker,patch.object(C.I.K,'save_new')as save):
                            with self.assertRaises(original_type)as caught:C.run({},connection_pin,{})
                            self.assertIs(caught.exception,original)
                            self.assertEqual(workflow.call_count,1)
                            close.assert_called_once_with(connection_pin,invocation)
                            self.assertEqual(report.call_count,1)
                            docker.assert_not_called();save.assert_not_called()
        self.assertFalse(Path(case).exists())

    def test_owned_cleanup_continues_after_stop_file_and_one_container_stop_failure(self):
        I=C.I;invocation='TEST_ONLY_INVOCATION';suffix='0123456789ab'
        case=Path('/workspace/helmut-parallel-20261015/wave20-resource-integration')/('attempt-'+suffix)
        parent='/helmut-meter-resources'+I.A.DAY[-2:]+'-'+suffix
        reservation_pin={'TEST_ONLY':'RAM_RESERVATION'};connection_pin={'TEST_ONLY':'RAM_CONNECTION_NOT_AUTHORITY'}
        runtime_pin={'TEST_ONLY':'RAM_RUNTIME'}
        connection={'caseDirectory':str(case),'nativeBudgetRuntimePin':runtime_pin}
        def read(pin):
            if pin==reservation_pin:return {'controllerInvocationId':invocation,'fixtureConnectionPin':connection_pin}
            if pin==connection_pin:return connection
            if pin==runtime_pin:return {'TEST_ONLY':'RUNTIME_METADATA_NOT_AUTHORITY'}
            raise AssertionError('unexpected actual authority read')
        for report_fails in [False,True]:
            with self.subTest(final_report_fails=report_fails):
                def row(cid,group,running=True,pid=42):
                    return {'Id':cid,'HostConfig':{'CgroupParent':group},
                        'State':{'Running':running,'Pid':pid if running else 0,'ExitCode':0}}
                rows=[row('a'*64,parent+'/application'),row('b'*64,parent+'/database'),
                      row('c'*64,parent+'/storage'),row('d'*64,parent+'/application',running=False),
                      row('e'*64,parent+'/application-other'),row('f'*64,parent+'0/application'),
                      row('9'*64,'/TEST_ONLY_FOREIGN_PARENT/application')]
                states={r['Id']:copy.deepcopy(r)for r in rows};ids=list(states);stops=[];inspected=[]
                def docker(args,**kwargs):
                    if args==['ps','--all','--quiet']:return SimpleNamespace(stdout=' '.join(ids))
                    if args==['inspect',*ids]:return SimpleNamespace(stdout=json.dumps(rows))
                    if args[0]=='stop':
                        cid=args[-1];stops.append(cid)
                        if cid=='b'*64:raise OSError('TEST_ONLY_ONE_CONTAINER_STOP_FAILURE')
                        states[cid]['State'].update(Running=False,Pid=99 if cid=='c'*64 else 0)
                        return SimpleNamespace(stdout=cid)
                    if args[0]=='inspect'and len(args)==2:
                        inspected.append(args[1]);return SimpleNamespace(stdout=json.dumps([states[args[1]]]))
                    raise AssertionError('unexpected Docker action; no actual call allowed')
                with (patch.object(I.A,'pin',return_value=reservation_pin),patch.object(I,'pin_json',side_effect=read),
                      patch.object(I.N,'close_case_helpers',return_value={'helpers':[],'allKnownHelpersClosed':True})as native_close,
                      patch.object(I.Path,'is_dir',return_value=True),patch.object(I.Path,'exists',return_value=False),
                      patch.object(I.N,'save',side_effect=OSError('TEST_ONLY_STOP_FILE_WRITE_FAILURE'))as stop_save,
                      patch.object(I.K,'docker',side_effect=docker),
                      patch.object(I.K,'save_new',side_effect=OSError('TEST_ONLY_FINAL_REPORT_WRITE_FAILURE')if report_fails else None)as report):
                    if report_fails:
                        with self.assertRaisesRegex(OSError,'FINAL_REPORT'):I.close_failed_owned_setup(connection_pin,invocation)
                        result=report.call_args.args[1]
                    else:result=I.close_failed_owned_setup(connection_pin,invocation)
                    self.assertEqual(stop_save.call_count,3,'all fixed STOP interfaces must be attempted despite write failures')
                    self.assertEqual(stops,['a'*64,'b'*64,'c'*64])
                    self.assertEqual(inspected,['a'*64,'c'*64,'d'*64])
                    self.assertEqual(native_close.call_count,1)
                    self.assertFalse(result['allKnownOwnedContainersClosed'])
                    closed={r['containerId']:r for r in result['containers']}
                    self.assertEqual(set(closed),{c*64 for c in 'abcd'})
                    self.assertTrue(closed['a'*64]['closed']);self.assertTrue(closed['d'*64]['closed'])
                    self.assertFalse(closed['b'*64]['closed']);self.assertEqual(closed['b'*64]['errorType'],'OSError')
                    self.assertFalse(closed['c'*64]['closed'],'nonzero remaining PID is not a confirmed exit')
        self.assertFalse(case.exists())

    def test_native_policy_pure_renderer_changes_only_the_exact_sequence_heap_options(self):
        connector=C.C;case=connector.AREA/'attempt-0123456789ab'
        owner={'path':str(case/'TEST_ONLY_NOT_A_GO_FILE')}
        args=dict(target='helmut_resource_fixture_'+connector.A.DATE_TAG+'_0123456789ab',
            container='helmut-meter-db-w20-0123456789ab',operation='synthetik500-resources'+connector.A.DAY[-2:]+'-0123456789ab',
            day_rows_pin={'path':str(connector.BASE/'wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json')},owner_go_pin=owner)
        self.assertFalse(case.exists());self.assertFalse(Path(owner['path']).exists())
        with patch.object(C.I.K,'docker')as docker,patch.object(connector,'save')as save:
            plain=connector.render_templates(case,**args)
            budgeted=connector.render_templates(case,**args,native_memory_budget=C.N.policy())
            self.assertEqual(len(plain),26);self.assertEqual(len(budgeted),26)
            modified={str(Path(b['destination']).relative_to(case))for a,b in zip(plain,budgeted)if a['text']!=b['text']}
            self.assertEqual(modified,{'native-end-preparation/run-reviewed-sequence.js'})
            for row in budgeted:
                text=Path(row['original']['path']).read_text()
                for change in row['replacements']:
                    self.assertEqual(text.count(change['from']),change['count'])
                    text=text.replace(change['from'],change['to'])
                self.assertEqual(text,row['text']);self.assertEqual(connector.pin(row['original']['path']),row['original'])
            sequence=next(r for r in budgeted if r['destination'].endswith('/run-reviewed-sequence.js'))
            self.assertEqual(sequence['text'].count("'--max-old-space-size=384','--max-semi-space-size=16'"),1)
            self.assertNotIn('--max-old-space-size=1536',sequence['text'])
            docker.assert_not_called();save.assert_not_called()
        self.assertFalse(case.exists());self.assertFalse(Path(owner['path']).exists())

    def test_direct_runtime_authority_cannot_skip_blocked_complete_precheck(self):
        recipe={k:{}for k in ['fixtureConnectionPin','recipeTemplatePin','independentMeterAcceptance','freshOwnerGO','completeStartPreflight']}
        recipe['setupReservation']={'path':str(C.I.SETUP_RESERVATION)}
        reservation={**{k:v for k,v in recipe.items()if k!='setupReservation'},'schema':'helmut-local-resource-setup-reservation/1'}
        with (patch.object(C.I,'verify_pre_setup_authority',return_value={'connection':{}}),
              patch.object(C.I,'pin_json',side_effect=[reservation,{'schema':'helmut-complete-local-start-preflight/1','pass':False}]),
              patch.object(C.I.K,'save_new')as save):
            with self.assertRaises(RuntimeError):C.I.verify_full_authority(recipe)
            save.assert_not_called()

    def test_all_four_binding_pins_survive_saved_report_roundtrip(self):
        r=P.Report();r.bindings={k:{'TEST_ONLY':k}for k in ['acceptance','connection','recipeTemplate','startPreflightIndependentAdoption']}
        saved=json.loads(json.dumps(P.finish(r,None)))
        self.assertEqual(saved['bindings'],r.bindings)
        self.assertIn('startPreflightIndependentAdoption',saved['bindings'])

    def test_setup_delay_does_not_expire_bound_static_proof_but_stale_at_reservation_fails(self):
        now=time.time()
        proof={'schema':'helmut-complete-local-start-preflight/1','status':'READY_FOR_SEPARATE_EXACT_LOCAL_GO',
            'pass':True,'startedAtUnixSeconds':now-120,'checkedAtUnixSeconds':now-115,
            'checks':[{'id':id,'status':'PASS'}for id in P.REQUIRED_CHECKS]}
        stamp=lambda t:P.datetime.datetime.fromtimestamp(t,P.datetime.timezone.utc).isoformat()
        with self.assertRaises(RuntimeError):P.assert_ready(proof)
        P.assert_reserved_ready(proof,{'atUTC':stamp(now-110)})
        for t in [now-121,now-50,now+1]:
            with self.assertRaises(RuntimeError):P.assert_reserved_ready(proof,{'atUTC':stamp(t)})

    def test_frozen_proof_rehashes_real_bytes_and_keeps_binding_without_host_only_ast(self):
        with tempfile.TemporaryDirectory()as td:
            file=Path(td)/'input-code.py';file.write_text('VALUE = 1\n')
            row={**P.pin(file),'guards':[]};rows=[row]
            digest=P.hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            now=time.time();report={'schema':'helmut-complete-local-start-preflight/1','status':'READY_FOR_SEPARATE_EXACT_LOCAL_GO',
                'pass':True,'startedAtUnixSeconds':now,'checkedAtUnixSeconds':now,'consumerInventory':rows,
                'bindings':{'TEST_ONLY':'NO_OPERATIONAL_AUTHORITY'},'checks':[{'id':id,'status':'PASS','evidence':
                    {'inventorySHA256':digest}if id=='completeIndependentCoverage'else{}}for id in P.REQUIRED_CHECKS]}
            frozen=P.freeze_ready_report(report)
            self.assertNotIn('consumerInventory',frozen);self.assertEqual(frozen['consumerSourcePins'],[P.pin(file)])
            self.assertEqual(frozen['bindings'],report['bindings']);self.assertEqual(frozen['consumerInventorySHA256'],digest)
            file.write_text('VALUE = 2\n')
            with self.assertRaises(RuntimeError):P.freeze_ready_report(report)

    def test_native_pin_drift_private_permissions_and_symlink_fail(self):
        with tempfile.TemporaryDirectory()as td:
            p=Path(td)/'input.json';p.write_text('{}');p.chmod(0o600);pin=P.pin(p)
            self.assertEqual(P.private_pin(pin),{})
            p.chmod(0o644)
            with self.assertRaises(RuntimeError):P.private_pin(pin)
            p.chmod(0o600);p.write_text('{"changed":true}')
            with self.assertRaises(RuntimeError):P.read(pin)
            q=Path(td)/'alias';q.symlink_to(p)
            with self.assertRaises(RuntimeError):P.pin(q)

    def test_no_unreviewed_inventory_can_pass(self):
        with self.assertRaises(KeyError):P.coverage_adopted({},[])

    def test_missing_template_and_drifted_baseline_fail_before_render(self):
        with tempfile.TemporaryDirectory()as td:
            p=Path(td)/'staged.json';p.write_text('{"templateDeltas":[]}')
            connection={'stagedHarness':P.pin(p)}
            with self.assertRaisesRegex(RuntimeError,'exact26'):P.template_replay(connection)
            with patch.object(P,'LEGACY_MANIFEST_SHA256','0'*64):
                with self.assertRaisesRegex(RuntimeError,'legacy baseline drift'):P.template_replay(connection)

    def test_a_passing_subset_or_duplicate_check_cannot_be_complete(self):
        r=P.Report()
        for id in P.REQUIRED_CHECKS:r.check(id,'test','test',lambda:{})
        self.assertTrue(P.finish(r,[])['pass'])
        last=r.checks.pop()
        self.assertFalse(P.finish(r,[])['pass'])
        r.checks.append(last);r.checks.append(last)
        self.assertFalse(P.finish(r,[])['pass'])

    def test_exact_filesystem_reserve_boundary_without_allocating_storage(self):
        runtime={'imageBytes':1000000}
        connection={'caseDirectory':'TEST_ONLY','storageCapacityBytes':8000000000,'nativeBudgetRuntimePin':{'TEST_ONLY':True}}
        helper_hulls=2*(2*1000000+64*1024**2)
        required=8000000000+8*1024**3+4*(2*437457485+64*1024**2)+512*1024**2+helper_hulls
        budget=type('Budget',(),{'validate_runtime':staticmethod(lambda r:r)})
        for available,expected in [(required,True),(required-1,False)]:
            fake=type('FS',(),{'f_bavail':available,'f_frsize':1})()
            with patch.object(P.os,'statvfs',return_value=fake),patch.object(P,'read',return_value=runtime),patch.object(P,'module',return_value=budget):
                result=P.filesystem_ready(connection)
                self.assertEqual(result['pass'],expected)
                self.assertEqual(result['shortageBytes'],0 if expected else 1)
                self.assertEqual(result['newContainerCount'],6)
                self.assertEqual(result['nativeBudgetHelperHullBytes'],helper_hulls)
                self.assertEqual(result['hostFreeFloorBytes'],8*1024**3)
        # Having room for the image alone cannot hide future vfs hull/output
        # consumption and silently spend the unchanged host free-space floor.
        fake=type('FS',(),{'f_bavail':8000000000+8*1024**3,'f_frsize':1})()
        with patch.object(P.os,'statvfs',return_value=fake),patch.object(P,'read',return_value=runtime),patch.object(P,'module',return_value=budget):
            self.assertFalse(P.filesystem_ready(connection)['pass'])

    def test_v11_factory_requires_stricter2GiB_and_full8GiB_free_floor_before_any_effect(self):
        I=C.I
        def call(size):return I.create_database('/TEST_ONLY_NEVER_CREATED','TEST_ONLY_DB','TEST_ONLY_PARENT','TEST_ONLY_NETWORK',scope='owner-approved-local500-resources',storage={'bytes':size,'directIO':True})
        sentinel=RuntimeError('TEST_STOP_BEFORE_NETWORK_OR_OUTPUT')
        with patch.object(I,'inspect_private_network',side_effect=sentinel)as network:
            with self.assertRaisesRegex(RuntimeError,'exact2GiB'):call(4*1024**3)
            network.assert_not_called()
            fake=type('FS',(),{'f_bavail':8*1024**3-1,'f_frsize':1})()
            with patch.object(I.os,'statvfs',return_value=fake):
                with self.assertRaisesRegex(RuntimeError,'floor not met'):call(2*1024**3)
            network.assert_not_called()
            fake=type('FS',(),{'f_bavail':8*1024**3,'f_frsize':1})()
            with patch.object(I.os,'statvfs',return_value=fake):
                with self.assertRaises(RuntimeError)as caught:call(2*1024**3)
            self.assertIs(caught.exception,sentinel)
            self.assertEqual(network.call_count,1)
        self.assertFalse(Path('/TEST_ONLY_NEVER_CREATED').exists())

    def test_inventory_finds_assert_raise_and_full_source_change(self):
        with tempfile.TemporaryDirectory()as td:
            p=Path(td)/'consumer.py';p.write_text('def run(owner):\n assert owner["safe"]\n verify_owner(owner)\n if not owner: raise RuntimeError("missing")\n')
            a=P.python_inventory(p)
            self.assertTrue(any(g['kind']=='Assert'for g in a['guards']))
            self.assertTrue(any(g['kind']=='Raise'for g in a['guards']))
            self.assertTrue(any(g['expression']=='verify_owner(owner)'for g in a['guards']))
            p.write_text(p.read_text()+'# Even non-guard source drift requires review\n')
            self.assertNotEqual(a['sha256'],P.python_inventory(p)['sha256'])

if __name__=='__main__':unittest.main()
