"""Actual declarative authority helpers with TEST_ONLY data; no native actions."""
from pathlib import Path
from unittest.mock import patch
import copy,datetime,importlib.util,unittest

def load(name,file):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
A=load('exact_case_operator_authority','next-resource-authority.py')
I=load('shared_window_authority','isolation.py')

class OperatorBindingTest(unittest.TestCase):
    def setUp(self):
        now=datetime.datetime.now(datetime.timezone.utc)
        self.pin={'path':'/TEST_ONLY_NOT_OPERATIVE/OPERATOR_RECORD','bytes':0,'sha256':'0'*64}
        self.connection={'preparedWithoutGO':False,
          'targetDatabase':'helmut_resource_fixture_'+A.DATE_TAG+'_'+A.CASE_SUFFIX,
          'operationId':'synthetik500-resources21-'+A.CASE_SUFFIX,
          'caseDirectory':str(A.BASE/'wave20-resource-integration'/('attempt-'+A.CASE_SUFFIX)),
          'sourceCapture':{'TEST_ONLY':'NO_OPERATIVE_SOURCE'},'sourceCommit':'a'*40,
          'dayBindingAcceptance':{'TEST_ONLY':'NO_OPERATIVE_CALENDAR'}}
        c=self.connection
        self.owner={'schema':'helmut-owner-local-fixture-go/1','authorized':True,
          'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
          'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':A.AUTHORIZATION,
          **{k:c[k]for k in ['targetDatabase','operationId','caseDirectory','sourceCommit']},
          'sourceCapturePin':c['sourceCapture'],'dayBindingAcceptancePin':c['dayBindingAcceptance'],
          'previousConsumedMarkers':copy.deepcopy(A.PRESERVED_MARKER_PINS),
          'finalOwnerGOPath':str(A.METER/('OWNER_RESOURCE21_V12_'+A.CASE_SUFFIX+'.PRIVATE.json')),
          'requiredConfirmation':'GO_LOCAL_ONLY_CREATE_'+c['targetDatabase']+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE',
          'approvedAtUTC':now.isoformat(),'ownerAuthorizationReference':'TEST_ONLY_NO_REAL_OPERATOR_OR_GO',
          'ownerAuthorizationEvidencePin':self.pin}
        self.owner['confirmation']=self.owner['requiredConfirmation']
        scope={'day':A.DAY,'slotVersion':A.SLOT_VERSION,'caseSuffix':A.CASE_SUFFIX,'commit':c['sourceCommit'],
          'operationId':c['operationId'],'caseDirectory':c['caseDirectory'],'targetDatabase':c['targetDatabase'],
          'sourceCapturePin':c['sourceCapture'],'dayBindingAcceptancePin':c['dayBindingAcceptance'],
          'exactlyOneResourceAttempt':True,'syntheticProfiles':500,'targetUsablePositions':1500,
          'controlsPerProfile':16,'requiresAll32FreshStartConditions':True,'hardMemoryBytes':2048000000,
          'commonTargetBytes':1548000000,'reserveTargetBytes':500000000,'paidProviderCallsAllowed':False,
          'production':False,'allowDispose':False,'automaticRetry':False}
        self.record={'schema':'helmut-current-operator-local-full500-binding/2','production':False,
          'globalSlotVersion':12,'resourceAttemptGrantCount':1,'operatorMessageTimestampNotInvented':True,
          'machineConfirmationIsRootTechnicalBindingNotVerbatimOperatorText':True,
          'actualUserMessageVerbatim':'TEST_ONLY fixture, no actual operator approval or execution authority.',
          'recordedAtUTC':(now-datetime.timedelta(seconds=1)).isoformat(),'rootTechnicalScopeBinding':scope}
        p=patch.object(A,'read',side_effect=lambda p:copy.deepcopy(self.record)if p==self.pin else {})
        p.start();self.addCleanup(p.stop)
        p=patch.object(A.subprocess,'run',side_effect=AssertionError('NO_NATIVE_PROCESS'))
        p.start();self.addCleanup(p.stop)
    def check(self):return A.validate_owner(self.owner,self.connection)
    def test_exact_pinned_scope_is_read_by_actual_validator(self):
        self.assertTrue(self.check()['actualGO'])
    def test_missing_or_wrong_evidence_cannot_grant_authority(self):
        for evidence in [None,{}, {'path':'/TEST_ONLY_WRONG','bytes':0,'sha256':'0'*64}]:
            with self.subTest(evidence=evidence):
                self.owner['ownerAuthorizationEvidencePin']=evidence
                with self.assertRaises(RuntimeError):self.check()
    def test_old_schema_extra_grant_or_false_provenance_is_denied(self):
        original=copy.deepcopy(self.record)
        for key,value in [('schema','helmut-current-operator-local-full500-binding/1'),('production',True),
          ('globalSlotVersion',11),('globalSlotVersion',True),('resourceAttemptGrantCount',2),
          ('operatorMessageTimestampNotInvented',False),
          ('machineConfirmationIsRootTechnicalBindingNotVerbatimOperatorText',False),('actualUserMessageVerbatim','')]:
            with self.subTest(key=key):
                self.record={**original,key:value}
                with self.assertRaises(RuntimeError):self.check()
    def test_every_case_code_input_limit_and_control_binding_is_required(self):
        original=copy.deepcopy(self.record)
        for key in original['rootTechnicalScopeBinding']:
            with self.subTest(key=key):
                self.record=copy.deepcopy(original);del self.record['rootTechnicalScopeBinding'][key]
                with self.assertRaises(RuntimeError):self.check()
        for key,value in [('caseSuffix','b'*12),('commit','b'*40),('syntheticProfiles',499),
          ('controlsPerProfile',15),('hardMemoryBytes',2048000001),('reserveTargetBytes',499999999),
          ('paidProviderCallsAllowed',True),('automaticRetry',True),('slotVersion',True)]:
            with self.subTest(key=key,value=value):
                self.record=copy.deepcopy(original);self.record['rootTechnicalScopeBinding'][key]=value
                with self.assertRaises(RuntimeError):self.check()
    def test_other_valid_suffix_stays_denied_even_if_owner_and_connection_agree(self):
        for suffix in ['86075a3a65e9','5e6c3f02136c','b'*12]:
            with self.subTest(suffix=suffix):
                c={**self.connection,'targetDatabase':'helmut_resource_fixture_'+A.DATE_TAG+'_'+suffix,
                  'operationId':'synthetik500-resources21-'+suffix,
                  'caseDirectory':str(A.BASE/'wave20-resource-integration'/('attempt-'+suffix))}
                owner={**self.owner,**{k:c[k]for k in ['targetDatabase','operationId','caseDirectory']}}
                with self.assertRaises(RuntimeError):A.validate_owner(owner,c)
    def test_source_commit_calendar_or_record_time_drift_is_denied(self):
        for field,value in [('sourceCommit','b'*40),('dayBindingAcceptancePin',{'TEST_ONLY':'WRONG'})]:
            with self.subTest(field=field):
                owner={**self.owner,field:value}
                with self.assertRaises(RuntimeError):A.validate_owner(owner,self.connection)
        self.record['recordedAtUTC']=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat()
        with self.assertRaises(RuntimeError):self.check()

class SharedWindowTest(unittest.TestCase):
    def test_actual_workflow_without_ten_minute_reserve_is_denied(self):
        now=datetime.datetime(2026,10,21,12,tzinfo=datetime.timezone.utc)
        with self.assertRaises(RuntimeError):I.verify_remaining_window(now,now+datetime.timedelta(seconds=10685.884867))
    def test_reserve_boundary_and_one_microsecond_short(self):
        now=datetime.datetime(2026,10,21,12,tzinfo=datetime.timezone.utc)
        end=now+datetime.timedelta(seconds=11285.884867)
        I.verify_remaining_window(now,end)
        with self.assertRaises(RuntimeError):I.verify_remaining_window(now,end-datetime.timedelta(microseconds=1))
    def test_extra_reserve_passes_and_expired_window_fails(self):
        now=datetime.datetime(2026,10,21,12,tzinfo=datetime.timezone.utc)
        I.verify_remaining_window(now,now+datetime.timedelta(seconds=11286))
        with self.assertRaises(RuntimeError):I.verify_remaining_window(now,now-datetime.timedelta(seconds=1))

if __name__=='__main__':unittest.main()
