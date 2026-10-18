#!/usr/bin/env python3
"""New-intent/old-GO isolation only. No Docker, writes, activation or full run."""
import copy,importlib.util,unittest
from pathlib import Path
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
class NextResourceAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.connection={'preparedWithoutGO':True,'targetDatabase':'helmut_resource_fixture_20261018_000000000000',
          'operationId':'synthetik500-resources18-000000000000',
          'caseDirectory':'/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-000000000000',
          'sourceCapture':{'TEST_ONLY':'NO_OPERATIVE_AUTHORITY'}}
        self.intent={'schema':'helmut-owner-local-fixture-intent/1','authorized':False,
          'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
          'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':A.AUTHORIZATION,
          **{k:self.connection[k]for k in ['targetDatabase','operationId','caseDirectory']},
          'sourceCapturePin':self.connection['sourceCapture'],
          'previousConsumedMarkers':copy.deepcopy(A.PRESERVED_MARKER_PINS),
          'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE18_V7_000000000000.PRIVATE.json'),
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
        self.assertEqual((A.DAY,A.DATE_TAG),('2026-10-18','20261018'))
        self.assertNotIn(A.CLAIM,A.OLD_MARKERS);self.assertNotIn(A.RESERVATION,A.OLD_MARKERS)
        self.assertNotEqual(A.CLAIM,A.RESERVATION);self.assertEqual(A.SUBNET,'172.16.244.0/24')
    def test_all_thirteen_spent_markers_stay_pinned_including_both_v6(self):
        self.assertEqual(len(A.OLD_MARKERS),13)
        self.assertEqual(len(A.PRESERVED_MARKER_PINS),13)
        self.assertEqual({p['path'] for p in A.PRESERVED_MARKER_PINS},set(map(str,A.OLD_MARKERS)))
        by_path={p['path']:p for p in A.PRESERVED_MARKER_PINS}
        for expected in SPENT_V5_PINS:
            with self.subTest(pin=expected['path']):self.assertEqual(by_path[expected['path']],expected)
        for name in ['ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json','GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json',
          'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json',
          'DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json','NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json',
          'NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json','NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json',
          'NEXT_RESOURCE17_V4_SETUP_RESERVATION.SAFE.json']:
            with self.subTest(kept=name):self.assertIn(str(A.METER/name),by_path)
        intent_pins={p['path']:p for p in self.intent['previousConsumedMarkers']}
        for expected in SPENT_V5_PINS:
            with self.subTest(intent=expected['path']):self.assertEqual(intent_pins[expected['path']],expected)
        with patch.object(A,'read',return_value={}):
            for key,bad in [('sha256','0'*64),('bytes',807)]:
                tampered=[{**p,key:bad} if p['path']==SPENT_V5_PINS[0]['path'] else p
                  for p in self.intent['previousConsumedMarkers']]
                with self.subTest(tampered=key),self.assertRaises(RuntimeError):
                    A.validate_owner({**self.intent,'previousConsumedMarkers':tampered},self.connection,planning=True)
    def test_v7_slot_is_fixed_and_distinct_from_every_old_slot(self):
        self.assertEqual(A.SLOT,{'schema':'helmut-local-resource-authority-slot/1','day':'2026-10-18','version':7})
        self.assertEqual(A.SLOT_VERSION,7)
        self.assertEqual(A.AUTHORIZATION,'USER_GO_20261018_EXACT_ONE_RESOURCE_ONLY_V7')
        self.assertEqual(A.AUTHORIZATION,self.intent['authorizationId'])
        self.assertNotEqual(A.AUTHORIZATION,OLD_V4_AUTHORIZATION)
        self.assertNotEqual(A.AUTHORIZATION,OLD_V5_AUTHORIZATION)
        self.assertEqual(A.CLAIM,A.METER/'NEXT_RESOURCE18_V7_GO_CLAIM.SAFE.json')
        self.assertEqual(A.RESERVATION,A.METER/'NEXT_RESOURCE18_V7_SETUP_RESERVATION.SAFE.json')
        self.assertEqual(str(A.CLAIM),'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE18_V7_GO_CLAIM.SAFE.json')
        self.assertEqual(str(A.RESERVATION),'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE18_V7_SETUP_RESERVATION.SAFE.json')
        self.assertNotEqual(A.CLAIM,A.RESERVATION)
        self.assertEqual(Path(self.intent['finalOwnerGOPath']).name,'OWNER_RESOURCE18_V7_000000000000.PRIVATE.json')
        old_names=set(map(str,A.OLD_MARKERS))
        self.assertNotIn(str(A.CLAIM),old_names)
        self.assertNotIn(str(A.RESERVATION),old_names)
        for expected in SPENT_V5_PINS:
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
if __name__=='__main__':unittest.main()
