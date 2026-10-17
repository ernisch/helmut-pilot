#!/usr/bin/env python3
"""New-intent/old-GO isolation only. No Docker, writes, activation or full run."""
import copy,importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('next_authority',Path(__file__).with_name('next-resource-authority.py'))
A=importlib.util.module_from_spec(spec);spec.loader.exec_module(A)
class NextResourceAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.connection={'preparedWithoutGO':True,'targetDatabase':'helmut_resource_fixture_20261017_000000000000',
          'operationId':'synthetik500-resources17-000000000000',
          'caseDirectory':'/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-000000000000',
          'sourceCapture':{'TEST_ONLY':'NO_OPERATIVE_AUTHORITY'}}
        self.intent={'schema':'helmut-owner-local-fixture-intent/1','authorized':False,
          'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
          'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':A.AUTHORIZATION,
          **{k:self.connection[k]for k in ['targetDatabase','operationId','caseDirectory']},
          'sourceCapturePin':self.connection['sourceCapture'],
          'previousConsumedMarkers':copy.deepcopy(A.PRESERVED_MARKER_PINS),
          'finalOwnerGOPath':str(A.METER/'OWNER_RESOURCE17_V3_000000000000.PRIVATE.json'),
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
            with self.assertRaises(RuntimeError):A.validate_owner({**self.intent,'finalOwnerGOPath':str(A.OLD_MARKERS[0])},self.connection,planning=True)
    def test_only_exact_completed_data_capture_is_reusable_before_any_read(self):
        for p in [{'path':str(A.CORRECTED_CAPTURE),'sha256':'0'*64},{'path':'/tmp/OTHER','sha256':A.CORRECTED_CAPTURE_SHA}]:
            with patch.object(A,'read')as read,self.assertRaises(RuntimeError):A.verify_preexisting_capture(p)
            read.assert_not_called()
    def test_fixed_next_slot_never_aliases_any_consumed_claim(self):
        self.assertNotIn(A.CLAIM,A.OLD_MARKERS);self.assertNotIn(A.RESERVATION,A.OLD_MARKERS)
        self.assertNotEqual(A.CLAIM,A.RESERVATION);self.assertEqual(A.SUBNET,'172.16.248.0/24')
if __name__=='__main__':unittest.main()
