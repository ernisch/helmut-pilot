#!/usr/bin/env python3
"""New-intent/old-GO isolation only. No Docker, writes, activation or full run."""
import copy,hashlib,importlib.util,json,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('next_authority',Path(__file__).with_name('next-resource-authority.py'))
A=importlib.util.module_from_spec(spec);spec.loader.exec_module(A)
OLD_V4_AUTHORIZATION='USER_GO_20261017_EXACT_ONE_RESOURCE_ONLY_V4'
OLD17_V4_OWNER_GO=str(A.METER/'OWNER_RESOURCE17_V4_000000000000.PRIVATE.json')
OLD_V5_AUTHORIZATION='USER_GO_20261018_EXACT_ONE_RESOURCE_ONLY_V5'
OLD18_V5_OWNER_GO=str(A.METER/'OWNER_RESOURCE18_V5_000000000000.PRIVATE.json')
SPENT_V5_PINS=[
 {'path':str(A.METER/'NEXT_RESOURCE18_V5_GO_CLAIM.SAFE.json'),'bytes':808,'sha256':'d03997e1319ec12edcf5c536aaa35f1521462c48337f6cf694710336f63c45f1'},
 {'path':str(A.METER/'NEXT_RESOURCE18_V5_SETUP_RESERVATION.SAFE.json'),'bytes':1531,'sha256':'870e9c1f2c06bebf2cb6ff9b539680f5741df6fca39c80b7443d679b8a02aaed'}]
SPENT_V7_PINS=[
 {'path':str(A.METER/'NEXT_RESOURCE18_V7_GO_CLAIM.SAFE.json'),'bytes':797,'sha256':'29132c4c3dbf98593d4a2b49b5a752a0d18e0c0a621e31c5959abec05c73c3ba'},
 {'path':str(A.METER/'NEXT_RESOURCE18_V7_SETUP_RESERVATION.SAFE.json'),'bytes':1520,'sha256':'c7c721eaa11c2796e3ee7740c526e44e468ca96b989f63648ee5a50b0fc77524'}]
SPENT_V11_PINS=[
 {'path':str(A.METER/'NEXT_RESOURCE20_V11_GO_CLAIM.SAFE.json'),'bytes':876,'sha256':'3d5524a14ee87fc2cead403ca30c8006f36ded9d520b831b05c0fd436faf5e16'},
 {'path':str(A.METER/'NEXT_RESOURCE20_V11_SETUP_RESERVATION.SAFE.json'),'bytes':1599,'sha256':'2b7f529b850ceb9e812906a1a8497cb2ffc6f9e0c75e1a4673337b185574188a'}]
class NextResourceAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.connection={'preparedWithoutGO':True,'targetDatabase':'helmut_resource_fixture_20261021_'+A.CASE_SUFFIX,
          'operationId':'synthetik500-resources21-'+A.CASE_SUFFIX,
          'caseDirectory':'/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-'+A.CASE_SUFFIX,
          'sourceCapture':{'TEST_ONLY':'NO_OPERATIVE_AUTHORITY'}}
        self.intent={'schema':'helmut-owner-local-fixture-intent/1','authorized':False,
          'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
          'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':A.AUTHORIZATION,
          **{k:self.connection[k]for k in ['targetDatabase','operationId','caseDirectory']},
          'sourceCapturePin':self.connection['sourceCapture'],
          'previousConsumedMarkers':copy.deepcopy(A.PRESERVED_MARKER_PINS),
          'finalOwnerGOPath':str(A.METER/('OWNER_RESOURCE21_V12_'+A.CASE_SUFFIX+'.PRIVATE.json')),
          'requiredConfirmation':'GO_LOCAL_ONLY_CREATE_'+self.connection['targetDatabase']+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE'}
    def test_intent_is_only_technical_and_never_actual_go(self):
        with patch.object(A,'read',return_value={}):
            self.assertFalse(A.validate_owner(self.intent,self.connection,planning=True)['actualGO'])
            with self.assertRaises(RuntimeError):A.validate_owner(self.intent,self.connection)
    def test_literal_preservation_and_all_local_scope_fields_remain_required(self):
        with patch.object(A,'read',return_value={}):
            for v in [None,True,0,'false']:
                with self.subTest(value=v),self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'allowDispose':v},self.connection,planning=True)
            for k,v in [('production',True),('syntheticProfiles',499),('paidProviderCallsAllowed',True),('exactlyOneResourceAttempt',False),('resourceOnly',False)]:
                with self.subTest(k=k),self.assertRaises(RuntimeError):A.validate_owner({**self.intent,k:v},self.connection,planning=True)
    def test_fake_approval_fields_or_historical_schema_are_not_an_intent(self):
        with patch.object(A,'read',return_value={}):
            for k,v in [('approvedAtUTC','TEST_ONLY'),('confirmation','TEST_ONLY'),('ownerAuthorizationReference','TEST_ONLY'),('authorized',True),('schema','helmut-owner-local-fixture-go/1')]:
                with self.subTest(k=k),self.assertRaises(RuntimeError):A.validate_owner({**self.intent,k:v},self.connection,planning=True)
    def test_all_consumed_markers_must_still_be_pinned_and_unmodified(self):
        with patch.object(A,'read',return_value={}):
            for pins in [[],self.intent['previousConsumedMarkers'][:-1],self.intent['previousConsumedMarkers']*2]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'previousConsumedMarkers':pins},self.connection,planning=True)
        with patch.object(A,'read',side_effect=RuntimeError('DRIFT')):
            with self.assertRaisesRegex(RuntimeError,'DRIFT'):A.validate_owner(self.intent,self.connection,planning=True)
    def test_existing_final_go_and_nonfixed_paths_are_not_reused(self):
        with patch.object(A,'read',return_value={}),patch.object(A.Path,'exists',return_value=True):
            with self.assertRaises(RuntimeError):A.validate_owner(self.intent,self.connection,planning=True)
        with patch.object(A,'read',return_value={}):
            for path in [str(A.OLD_MARKERS[0]),OLD17_V4_OWNER_GO]:
                with self.subTest(path=path),self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'finalOwnerGOPath':path},self.connection,planning=True)
    def test_old_v4_authorization_cannot_authorize_new_intent(self):
        with patch.object(A,'read',return_value={}):
            with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'authorizationId':OLD_V4_AUTHORIZATION},self.connection,planning=True)
    def test_planning_and_execution_mode_types_do_not_cross_grant(self):
        with patch.object(A,'read',return_value={}):
            for planning,schema in [(False,'helmut-owner-local-fixture-intent/1'),(True,'helmut-owner-local-fixture-go/1')]:
                with self.subTest(planning=planning,schema=schema),self.assertRaises(RuntimeError):
                    A.validate_owner({**self.intent,'schema':schema},self.connection,planning=planning)
    def test_only_exact_completed_data_capture_is_reusable_before_any_read(self):
        for p in [{'path':str(A.CORRECTED_CAPTURE),'sha256':'0'*64},{'path':'/tmp/OTHER','sha256':A.CORRECTED_CAPTURE_SHA}]:
            with patch.object(A,'read')as read,self.assertRaises(RuntimeError):A.verify_preexisting_capture(p)
            read.assert_not_called()
    def test_fixed_next_slot_never_aliases_any_consumed_claim(self):
        self.assertEqual((A.DAY,A.DATE_TAG),('2026-10-21','20261021'))
        self.assertNotIn(A.CLAIM,A.OLD_MARKERS);self.assertNotIn(A.RESERVATION,A.OLD_MARKERS)
        self.assertNotEqual(A.CLAIM,A.RESERVATION);self.assertEqual(A.SUBNET,'172.16.244.0/24')
    def test_spent_or_nonfixed_slot_config_is_rejected_on_import(self):
        for change in [{'version':9},{'version':10},{'version':11},{'version':13},{'day':'2026-10-19'},{'day':'2026-10-20'},{'day':'2026-10-22'}]:
            other=importlib.util.spec_from_file_location('rejected_authority_slot',Path(A.__file__))
            module=importlib.util.module_from_spec(other)
            with self.subTest(change=change),patch.object(Path,'read_text',return_value=json.dumps({**A.SLOT,**change})):
                with self.assertRaisesRegex(RuntimeError,'invalid pinned'):other.loader.exec_module(module)
    def test_all_twentythree_spent_markers_stay_pinned_including_both_v7_and_v11(self):
        self.assertEqual(len(A.OLD_MARKERS),23)
        self.assertEqual(len(A.PRESERVED_MARKER_PINS),23)
        self.assertEqual({p['path'] for p in A.PRESERVED_MARKER_PINS},set(map(str,A.OLD_MARKERS)))
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for expected in SPENT_V5_PINS+SPENT_V7_PINS+SPENT_V11_PINS:
            with self.subTest(pin=expected['path']):self.assertEqual(by_path[expected['path']],expected)
        for expected in SPENT_V11_PINS:
            with self.subTest(realbytes=expected['path']):self.assertEqual(A.pin(expected['path']),expected)
        for name in ['ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json','GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json',
          'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json',
          'DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json','NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json',
          'NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json','NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json',
          'NEXT_RESOURCE17_V4_SETUP_RESERVATION.SAFE.json','NEXT_RESOURCE20_V11_GO_CLAIM.SAFE.json',
          'NEXT_RESOURCE20_V11_SETUP_RESERVATION.SAFE.json']:
            with self.subTest(kept=name):self.assertIn(str(A.METER/name),by_path)
        intent_pins={p['path']:p for p in self.intent['previousConsumedMarkers']}
        for expected in SPENT_V5_PINS+SPENT_V7_PINS+SPENT_V11_PINS:
            with self.subTest(intent=expected['path']):self.assertEqual(intent_pins[expected['path']],expected)
        with patch.object(A,'read',return_value={}):
            for key,bad in [('sha256','0'*64),('bytes',807)]:
                tampered=[{**p,key:bad} if p['path']==SPENT_V5_PINS[0]['path'] else p
                  for p in self.intent['previousConsumedMarkers']]
                with self.subTest(tampered=key),self.assertRaises(RuntimeError):
                    A.validate_owner({**self.intent,'previousConsumedMarkers':tampered},self.connection,planning=True)
    def test_v12_slot_is_fixed_and_distinct_from_every_old_slot(self):
        self.assertEqual(A.SLOT,{'schema':'helmut-local-resource-authority-slot/2','day':'2026-10-21','version':12,'caseSuffix':A.CASE_SUFFIX})
        self.assertEqual(A.SLOT_VERSION,12)
        self.assertEqual(A.AUTHORIZATION,'USER_GO_20261021_EXACT_ONE_RESOURCE_ONLY_V12')
        self.assertEqual(A.AUTHORIZATION,self.intent['authorizationId'])
        self.assertNotEqual(A.AUTHORIZATION,OLD_V4_AUTHORIZATION)
        self.assertNotEqual(A.AUTHORIZATION,OLD_V5_AUTHORIZATION)
        self.assertEqual(A.CLAIM,A.METER/'NEXT_RESOURCE21_V12_GO_CLAIM.SAFE.json')
        self.assertEqual(A.RESERVATION,A.METER/'NEXT_RESOURCE21_V12_SETUP_RESERVATION.SAFE.json')
        self.assertEqual(str(A.CLAIM),'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE21_V12_GO_CLAIM.SAFE.json')
        self.assertEqual(str(A.RESERVATION),'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE21_V12_SETUP_RESERVATION.SAFE.json')
        self.assertNotEqual(A.CLAIM,A.RESERVATION)
        self.assertEqual(Path(self.intent['finalOwnerGOPath']).name,('OWNER_RESOURCE21_V12_'+A.CASE_SUFFIX+'.PRIVATE.json'))
        old_names=set(map(str,A.OLD_MARKERS))
        self.assertNotIn(str(A.CLAIM),old_names)
        self.assertNotIn(str(A.RESERVATION),old_names)
        for expected in SPENT_V5_PINS+SPENT_V11_PINS:
            with self.subTest(old=expected['path']):self.assertIn(expected['path'],old_names)
    def test_old_v5_authorization_and_old_v5_final_go_path_cannot_authorize_new_intent(self):
        self.assertNotEqual(A.AUTHORIZATION,OLD_V5_AUTHORIZATION)
        self.assertNotEqual(self.intent['finalOwnerGOPath'],OLD18_V5_OWNER_GO)
        with patch.object(A,'read',return_value={}):
            with self.assertRaises(RuntimeError):
                A.validate_owner({**self.intent,'authorizationId':OLD_V5_AUTHORIZATION},self.connection,planning=True)
            with self.assertRaises(RuntimeError):
                A.validate_owner({**self.intent,'finalOwnerGOPath':OLD18_V5_OWNER_GO},self.connection,planning=True)
            with self.assertRaises(RuntimeError):
                A.validate_owner({**self.intent,'authorizationId':OLD_V5_AUTHORIZATION,
                  'finalOwnerGOPath':OLD18_V5_OWNER_GO},self.connection,planning=True)
    def test_consumed_v6_cannot_be_reused_and_its_real_marker_bytes_are_preserved(self):
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for name in ['NEXT_RESOURCE18_V6_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V6_SETUP_RESERVATION.SAFE.json']:
            p=A.METER/name;self.assertEqual(A.pin(p),by_path[str(p)])
        self.assertFalse(A.CLAIM.exists());self.assertFalse(A.RESERVATION.exists())
        with patch.object(A,'read',return_value={}):
            for delta in [{'authorizationId':'USER_GO_20261018_EXACT_ONE_RESOURCE_ONLY_V6'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE18_V6_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**delta},self.connection,planning=True)
    def test_consumed_v7_is_preserved_and_cannot_authorize_day19_v9(self):
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for p in SPENT_V7_PINS:
            self.assertEqual(by_path[p['path']],p);self.assertEqual(A.pin(p['path']),p)
        with patch.object(A,'read',return_value={}):
            for delta in [{'authorizationId':'USER_GO_20261018_EXACT_ONE_RESOURCE_ONLY_V7'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE18_V7_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**delta},self.connection,planning=True)
            for key,value in [('sha256','0'*64),('bytes',798)]:
                pins=[{**p,key:value}if p['path']==SPENT_V7_PINS[0]['path']else p for p in self.intent['previousConsumedMarkers']]
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'previousConsumedMarkers':pins},self.connection,planning=True)
    def test_current_and_historical_native_read_paths_are_exact_and_readonly(self):
        with patch.object(A.subprocess,'run',return_value=SimpleNamespace(stdout='{}'))as run, patch.object(A.SOURCE_RUNTIME,'verify_runtime_binding'):
            A.query_input('SELECT 1;')
            self.assertEqual(run.call_args.args[0][run.call_args.args[0].index('-d')+1],A.INPUT_DATABASE)
            self.assertEqual(run.call_args.kwargs['input'],"BEGIN READ ONLY;SET LOCAL statement_timeout='20s';SELECT 1;ROLLBACK;")
            A._query_input_database('SELECT 1;',A.BOOK17_INPUT_DATABASE)
            self.assertEqual(run.call_args.args[0][run.call_args.args[0].index('-d')+1],A.BOOK17_INPUT_DATABASE)
            with self.assertRaises(RuntimeError):A._query_input_database('SELECT 1;','FOREIGN')
    def test_spent_v8_is_preserved_and_cannot_authorize_the_new_slot(self):
        expected=[
          {'path':str(A.METER/'NEXT_RESOURCE19_V8_GO_CLAIM.SAFE.json'),'bytes':792,'sha256':'39323645802fe815cec4244b229f68ce265140e4186b5bddf99d03eee5154aa3'},
          {'path':str(A.METER/'NEXT_RESOURCE19_V8_SETUP_RESERVATION.SAFE.json'),'bytes':1515,'sha256':'3beab4bfacc5835b4cedc5c214653e18ec719883f1ee73be37cad2383650141b'}]
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for p in expected:
            self.assertEqual(by_path[p['path']],p);self.assertEqual(A.pin(p['path']),p)
        with patch.object(A,'read',return_value={}):
            for change in [{'authorizationId':'USER_GO_20261019_EXACT_ONE_RESOURCE_ONLY_V8'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE19_V8_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**change},self.connection,planning=True)
        self.assertFalse(A.CLAIM.exists());self.assertFalse(A.RESERVATION.exists())
    def test_spent_v9_exact_bytes_cannot_authorize_v12(self):
        expected=[
          {'path':str(A.METER/'NEXT_RESOURCE19_V9_GO_CLAIM.SAFE.json'),'bytes':866,'sha256':'3af635b8f5450ea4e0fc23cbaceab7c6f8261028b938c1a542c0a1a9498ad9f1'},
          {'path':str(A.METER/'NEXT_RESOURCE19_V9_SETUP_RESERVATION.SAFE.json'),'bytes':1589,'sha256':'32054d5a770a926c57688f6aad38feec06449999e18d24245f7ef31c60f02022'}]
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for p in expected:
            self.assertEqual(by_path[p['path']],p);self.assertEqual(A.pin(p['path']),p)
        with patch.object(A,'read',return_value={}):
            for bad in [{'authorizationId':'USER_GO_20261019_EXACT_ONE_RESOURCE_ONLY_V9'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE19_V9_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**bad},self.connection,planning=True)
        self.assertNotIn(A.CLAIM,A.OLD_MARKERS);self.assertFalse(A.CLAIM.exists());self.assertFalse(A.RESERVATION.exists())
    def test_spent_v10_exact_bytes_cannot_authorize_v12(self):
        expected=[
          {'path':str(A.METER/'NEXT_RESOURCE20_V10_GO_CLAIM.SAFE.json'),'bytes':875,'sha256':'6fdb6f4189d0a5150db693eff38935a2273c6b0eb373d1be101c87db50f45cfe'},
          {'path':str(A.METER/'NEXT_RESOURCE20_V10_SETUP_RESERVATION.SAFE.json'),'bytes':1598,'sha256':'7e1d8938c585c6fc983eaf98f4d13c0f01d1cba66532204be2f8fa84323ce7c2'}]
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for p in expected:
            self.assertEqual(by_path[p['path']],p);self.assertEqual(A.pin(p['path']),p)
        with patch.object(A,'read',return_value={}):
            for bad in [{'authorizationId':'USER_GO_20261020_EXACT_ONE_RESOURCE_ONLY_V10'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE20_V10_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**bad},self.connection,planning=True)
            changed=[{**p,'sha256':'0'*64}if p['path']==expected[0]['path']else p for p in self.intent['previousConsumedMarkers']]
            with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'previousConsumedMarkers':changed},self.connection,planning=True)
        self.assertFalse(A.CLAIM.exists());self.assertFalse(A.RESERVATION.exists())
    def test_spent_v11_exact_bytes_cannot_authorize_v12(self):
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for p in SPENT_V11_PINS:
            self.assertEqual(by_path[p['path']],p);self.assertEqual(A.pin(p['path']),p)
        with patch.object(A,'read',return_value={}):
            for bad in [{'authorizationId':'USER_GO_20261020_EXACT_ONE_RESOURCE_ONLY_V11'},
              {'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE20_V11_000000000000.PRIVATE.json')}]:
                with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,**bad},self.connection,planning=True)
            for key,value in [('sha256','0'*64),('bytes',877)]:
                pins=[{**p,key:value}if p['path']==SPENT_V11_PINS[0]['path']else p for p in self.intent['previousConsumedMarkers']]
                with self.subTest(tampered=key),self.assertRaises(RuntimeError):
                    A.validate_owner({**self.intent,'previousConsumedMarkers':pins},self.connection,planning=True)
        self.assertNotIn(A.CLAIM,A.OLD_MARKERS);self.assertFalse(A.CLAIM.exists());self.assertFalse(A.RESERVATION.exists())
    def test_restored_container_identity_fails_before_any_native_sql(self):
        source=A.SOURCE_RUNTIME
        expected='|'.join([source.CONTAINER,'/'+source.RUNTIME_BINDING['containerName'],source.RUNTIME_BINDING['imageId'],'none'])
        with patch.object(source.subprocess,'run',return_value=SimpleNamespace(stdout=expected+'\n'))as run:
            self.assertEqual(source.verify_runtime_binding(),source.RUNTIME_BINDING_PIN)
            self.assertIn('inspect',run.call_args.args[0]);self.assertIn(source.CONTAINER,run.call_args.args[0])
        with patch.object(source.subprocess,'run',return_value=SimpleNamespace(stdout='FOREIGN|/old|other|host'))as run:
            with self.assertRaisesRegex(RuntimeError,'container differs'):source.sql('SELECT 1;')
            self.assertEqual(run.call_count,1)

class CompletedBook19DataTest(unittest.TestCase):
    """Bound immutable Day20 fixture data only; all native entrypoints stay mocked."""
    def setUp(self):
        self.capture_pin=A.DAY20_INPUT_BINDING['capturePin']
        self.capture=A.read(self.capture_pin)
        self.original_read=A.read
        self.overrides={}
        self.seen=[]
        def data_read(p):
            self.seen.append(p['path'])
            return copy.deepcopy(self.overrides[p['path']]) if p['path']in self.overrides else self.original_read(p)
        mock=patch.object(A,'read',side_effect=data_read);mock.start();self.addCleanup(mock.stop)
        native=patch.object(A.subprocess,'run',side_effect=AssertionError('NO_NATIVE_PROCESS_IN_DATA_TEST'))
        native.start();self.addCleanup(native.stop)
    def changed(self,p,mutate):
        value=self.original_read(p);mutate(value);self.overrides[p['path']]=value
    def test_exact_four_correction_chain_qualifies_only_as_data_and_reads_are_mounted(self):
        paths=A._book19_data_pins(self.capture_pin)
        self.assertEqual(A._verify_book19_capture(self.capture_pin,actual=False),self.capture)
        allowed={p['path']for p in paths}
        self.assertTrue(set(self.seen)<=allowed)
        self.assertIn(A.BOOK19_CLAIM_PIN,paths);self.assertIn(A.BOOK18_CLAIM_PIN,paths);self.assertIn(A.BOOK17_CLAIM_PIN,paths)
        self.assertIn(self.capture['previousCorrectedCapturePin'],paths)
        self.assertNotIn(self.capture['freshOwnerGO']['path'],allowed)
        self.assertNotIn('OWNER_RESOURCE',json.dumps(sorted(allowed)))
        self.assertEqual(A.BOOK17_INPUT_DATABASE,'helmut_resource_input_20261018_ab76c911dac8')
        self.assertEqual(A.BOOK19_INPUT_DATABASE,'helmut_resource_input_20261020_4d77e2fe6616')
        self.assertEqual(A.INPUT_DATABASE,A.DAY21_INPUT_BINDING['sourceInputDatabase'])
    def test_prior_capture_or_current_database_cannot_be_substituted(self):
        with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture['previousCorrectedCapturePin'],actual=False)
        for value in [A.BOOK17_INPUT_DATABASE,A.INPUT_DATABASE]:
            with self.subTest(source=value):
                self.overrides={};self.changed(self.capture_pin,lambda c,v=value:c.update({'source':v}))
                with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture_pin,actual=False)
        for key,value in [('previousCorrectedCapturePin',self.capture['originalSourceCapturePin']),('sourceWrites',1)]:
            with self.subTest(key=key):
                self.overrides={};self.changed(self.capture_pin,lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture_pin,actual=False)
    def test_new_claim_shape_and_historical_authority_links_are_required(self):
        for key,value in [('target',A.BOOK17_INPUT_DATABASE),('target',A.INPUT_DATABASE),('correctionExactlyOnce',False),('automaticRetryAllowed',True),('authorityPin',{'TEST_ONLY':'NOT_A_NEW_RESOURCE_GO'})]:
            with self.subTest(key=key,value=value):
                self.overrides={};self.changed(A.BOOK19_CLAIM_PIN,lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture_pin,actual=False)
        self.overrides={}
        def old_shape(c):c['targetDatabase']=c.pop('target');c['exactlyOneInputCorrection']=c.pop('correctionExactlyOnce')
        self.changed(A.BOOK19_CLAIM_PIN,old_shape)
        with self.assertRaises((RuntimeError,KeyError)):A._verify_book19_capture(self.capture_pin,actual=False)
    def test_receipt_run_or_money_expansion_is_rejected(self):
        for key,value in [('historicalDaysAdded',['2026-10-20']),('correctionWrites',2),('bookCapacityAfter',42),('monetaryLimitsUnchanged',False),('resourceGOConsumed',True),('profileActivations',1),('full500Runs',1),('production',True),('sourceDump',{'TEST_ONLY':'WRONG_DUMP'}),('sourceIdentityBeforeAndAfter',{})]:
            with self.subTest(key=key):
                self.overrides={};self.changed(self.capture['correctionReceiptPin'],lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture_pin,actual=False)
    def test_current_auth_counter_and_only_delta_tampering_are_rejected(self):
        witness=self.capture['correctedFinancialWitnessPin']
        for mutation in ['money','book','capacity','counter','hash']:
            with self.subTest(mutation=mutation):
                self.overrides={}
                def change(w):
                    if mutation=='counter':
                        w['completeNativeCounterText']='[{"used":1}]'
                        w['completeNativeCounterSHA']=hashlib.sha256(w['completeNativeCounterText'].encode()).hexdigest()
                    elif mutation=='hash':w['nativeAuthSHA']='0'*64
                    else:
                        auth=json.loads(w['nativeAuthText'])
                        if mutation=='money':auth['testKostenAuftrag']['limit']+=1
                        elif mutation=='book':auth['testKostenTage']['2026-10-18']['spent']=1
                        else:auth['testKostenAuftrag']['bookCapacity']=42
                        w['nativeAuthText']=json.dumps(auth)
                        w['nativeAuthSHA']=hashlib.sha256(w['nativeAuthText'].encode()).hexdigest()
                self.changed(witness,change)
                with self.assertRaises(RuntimeError):A._verify_book19_capture(self.capture_pin,actual=False)

class CompletedBook20DataTest(unittest.TestCase):
    """Current Day21 completed-data closure only; native entrypoints stay mocked."""
    def setUp(self):
        self.capture_pin=A.DAY21_INPUT_BINDING['capturePin']
        self.capture=A.read(self.capture_pin)
        self.original_read=A.read
        self.overrides={}
        self.seen=[]
        def data_read(p):
            self.seen.append(p['path'])
            return copy.deepcopy(self.overrides[p['path']]) if p['path']in self.overrides else self.original_read(p)
        mock=patch.object(A,'read',side_effect=data_read);mock.start();self.addCleanup(mock.stop)
        native=patch.object(A.subprocess,'run',side_effect=AssertionError('NO_NATIVE_PROCESS_IN_DATA_TEST'))
        native.start();self.addCleanup(native.stop)
    def changed(self,p,mutate):
        value=self.original_read(p);mutate(value);self.overrides[p['path']]=value
    def test_exact_five_layer_data_closure_is_mounted_without_owner_go(self):
        paths=A.capture_data_pins(self.capture_pin)
        self.assertEqual(A.verify_preexisting_capture(self.capture_pin,actual=False),self.capture)
        allowed={p['path']for p in paths}
        self.assertTrue(set(self.seen)<=allowed)
        for pin in [A.BOOK17_CLAIM_PIN,A.BOOK18_CLAIM_PIN,A.BOOK19_CLAIM_PIN,A.BOOK20_CLAIM_PIN]:
            self.assertIn(pin,paths)
        day16_claim=str(A.METER/'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json')
        self.assertIn(day16_claim,allowed)
        self.assertIn(self.capture['previousCorrectedCapturePin'],paths)
        self.assertNotIn(self.capture['freshOwnerGO']['path'],allowed)
        self.assertNotIn(self.capture['freshOwnerGO']['path'],self.seen)
        self.assertNotIn('OWNER_RESOURCE',json.dumps(sorted(allowed)))
        receipt=self.original_read(self.capture['correctionReceiptPin'])
        claim=self.original_read(A.BOOK20_CLAIM_PIN)
        for proof in receipt['protectedNativeWitnessPins'].values():
            self.assertIn(proof['path'],allowed);self.assertIn(proof['path'],self.seen)
        self.assertEqual(claim['freshOwnerGO'],self.capture['freshOwnerGO'])
        self.assertEqual(claim['freshOwnerGO'],receipt['freshOwnerGO'])
        self.assertEqual(claim['sourceAcceptancePin'],receipt['sourceAcceptancePin'])
        self.assertEqual(receipt['claimPin'],A.BOOK20_CLAIM_PIN)
        self.assertEqual(receipt['resultHistoricalBooks'],42)
        self.assertEqual(receipt['historicalDaysAdded'],['2026-10-20'])
        self.assertEqual(receipt['bookCapacityBefore'],41)
        self.assertEqual(receipt['bookCapacityAfter'],42)
        self.assertEqual(A.INPUT_DATABASE,A.DAY21_INPUT_BINDING['sourceInputDatabase'])
    def test_old_capture_or_old_source_cannot_be_substituted(self):
        with self.assertRaises(RuntimeError):A.verify_preexisting_capture(A.DAY20_INPUT_BINDING['capturePin'],actual=False)
        with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture['previousCorrectedCapturePin'],actual=False)
        for value in [A.BOOK17_INPUT_DATABASE,A.BOOK19_INPUT_DATABASE]:
            with self.subTest(source=value):
                self.overrides={};self.changed(self.capture_pin,lambda c,v=value:c.update({'source':v}))
                with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture_pin,actual=False)
        for key,value in [('previousCorrectedCapturePin',self.capture['originalSourceCapturePin']),('sourceWrites',1)]:
            with self.subTest(key=key):
                self.overrides={};self.changed(self.capture_pin,lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture_pin,actual=False)
    def test_current_claim_links_no_retry_and_target_are_required(self):
        for key,value in [('target',A.BOOK19_INPUT_DATABASE),('target','FOREIGN'),('freshOwnerGO',{'TEST_ONLY':'WRONG_OWNER_GO'}),('sourceAcceptancePin',{'TEST_ONLY':'WRONG_SOURCE_ACCEPTANCE'}),('correctionExactlyOnce',False),('automaticRetryAllowed',True),('resourceGOConsumed',True)]:
            with self.subTest(key=key):
                self.overrides={};self.changed(A.BOOK20_CLAIM_PIN,lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture_pin,actual=False)
    def test_receipt_books_day_capacity_and_run_invariants_are_required(self):
        for key,value in [('historicalDaysAdded',['2026-10-21']),('existingBooksPreserved',40),('resultHistoricalBooks',43),('bookCapacityBefore',40),('bookCapacityAfter',43),('correctionWrites',2),('sourceWrites',1),('monetaryLimitsUnchanged',False),('onlySpecifiedDelta',False),('originalSourceUnchanged',False),('priorCorrectedSourceUnchanged',False),('fullCounterTableUnchanged',False),('allOtherRelationDataUnchanged',False),('preexistingActiveFlagsPreserved',False),('resourceGOConsumed',True),('profileActivations',1),('full500Runs',1),('production',True),('sourceDump',{'TEST_ONLY':'WRONG_DUMP'}),('sourceIdentityBeforeAndAfter',{})]:
            with self.subTest(key=key):
                self.overrides={};self.changed(self.capture['correctionReceiptPin'],lambda c,k=key,v=value:c.update({k:v}))
                with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture_pin,actual=False)
    def test_hash_valid_changed_money_book_capacity_counter_and_current_native_are_rejected(self):
        witness=self.capture['correctedFinancialWitnessPin']
        for mutation in ['money','historicalbook','capacity','counter','currentnative','hash']:
            with self.subTest(mutation=mutation):
                self.overrides={}
                def change(w):
                    if mutation=='counter':
                        w['completeNativeCounterText']='[{"used":1}]'
                        w['completeNativeCounterSHA']=hashlib.sha256(w['completeNativeCounterText'].encode()).hexdigest()
                        return
                    if mutation=='hash':
                        w['nativeAuthSHA']='0'*64
                        return
                    auth=json.loads(w['nativeAuthText'])
                    if mutation=='money':auth['testKostenAuftrag']['limit']+=1
                    elif mutation=='historicalbook':auth['testKostenTage']['2026-10-19']['spent']=1
                    elif mutation=='capacity':auth['testKostenAuftrag']['bookCapacity']=43
                    else:auth['testKostenTage']['2026-10-20']['spent']=1
                    w['nativeAuthText']=json.dumps(auth)
                    w['nativeAuthSHA']=hashlib.sha256(w['nativeAuthText'].encode()).hexdigest()
                self.changed(witness,change)
                with self.assertRaises(RuntimeError):A.verify_preexisting_capture(self.capture_pin,actual=False)

if __name__=='__main__':unittest.main()
