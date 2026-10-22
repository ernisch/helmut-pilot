#!/usr/bin/env python3
"""Pure input-chain failures. RAM sentinels cannot authorize any actual case."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

BIN=Path(__file__).resolve().parent
def load(name,file):
    s=importlib.util.spec_from_file_location(name,BIN/file)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
F=load('pure_backend_finish','finish-connection.py')
P=load('pure_backend_preflight','start-preflight.py')

def sentinel(name):return {'path':'/NEVER_CREATED_PURE_BACKEND_'+name,'bytes':1,'sha256':'0'*64}

class BackendConsumers(unittest.TestCase):
    def setUp(self):
        self.plan_pin=sentinel('PLAN')
        self.key='localPostgrestBackendPlanPin'
        self.config=sentinel('postgrest.PRIVATE.conf');self.config['path']='/NEVER_CREATED_PURE/postgrest.PRIVATE.conf'
        self.binary=sentinel('BINARY');self.source=sentinel('SOURCE')
        self.day={'day':F.C.A.DAY,'startsAtUTC':F.C.A.DAY+'T00:00:00Z','endsAtUTC':F.C.A.DAY+'T23:59:59Z'}
        self.connection={'caseDirectory':'/NEVER_CREATED_PURE_CASE','targetDatabase':'PURE_NOT_A_DATABASE','operationId':'PURE_NOT_AN_OPERATION',
            self.key:self.plan_pin,'freshOwnerGO':sentinel('NOT_AUTHORITY'),'resourceClaimPath':str(F.C.A.CLAIM),
            'stagedHarness':sentinel('STAGED'),'runtimeRequest':sentinel('REQUEST'),'dayBindingAcceptance':sentinel('DAY'),
            'applicationReadOnlyPins':[self.config],'databaseReadOnlyPins':[self.binary]}
        self.staged={self.key:self.plan_pin,'caseDirectory':self.connection['caseDirectory'],
            'targetDatabase':self.connection['targetDatabase'],'operationId':self.connection['operationId'],
            'ownerGOPin':self.connection['freshOwnerGO'],'dayAcceptance':self.connection['dayBindingAcceptance']}
        self.request={self.key:self.plan_pin,'sourcePins':[self.source]}
        self.recipe={self.key:self.plan_pin}
        self.backend={'ownerGoPin':self.connection['freshOwnerGO'],'day':self.day['day'],
            'resourceClaimPath':str(F.C.A.CLAIM),'sourcePostgrestConfigPin':self.config,'binaryPin':self.binary,
            'sourcePins':[self.source],'workEndsAtUTC':F.C.A.DAY+'T12:00:00Z','closeByUTC':F.C.A.DAY+'T12:01:00Z','maximumLifecycleSeconds':33000}
        self.now=P.datetime.datetime.fromisoformat(F.C.A.DAY+'T06:00:00+00:00').timestamp()
        self.docs={self.connection['stagedHarness']['path']:self.staged,self.connection['runtimeRequest']['path']:self.request,
            self.connection['dayBindingAcceptance']['path']:self.day}

    def check(self):
        with patch.object(P,'read',side_effect=lambda p:self.docs[p['path']]),patch.object(P,'module',return_value=F.C), \
             patch.object(F.C,'read_postgrest_backend_plan',return_value=self.backend) as canonical,patch.object(P.time,'time',return_value=self.now):
            result=P.backend_plan(self.connection,recipe=self.recipe)
        return result,canonical

    def test_shared_canonical_gate_and_all_four_bindings(self):
        result,canonical=self.check();self.assertEqual(result,self.backend)
        canonical.assert_called_once_with(self.plan_pin,self.connection['caseDirectory'],self.connection['targetDatabase'],self.connection['operationId'])

    def test_missing_null_or_other_pin_on_any_side_is_rejected(self):
        for name in ['connection','staged','request','recipe']:
            doc=getattr(self,name);original=doc[self.key]
            for value in ['ABSENT',None,sentinel('OTHER')]:
                with self.subTest(side=name,value=value):
                    if value=='ABSENT':doc.pop(self.key,None)
                    else:doc[self.key]=value
                    with self.assertRaises(RuntimeError):self.check()
                    doc[self.key]=original

    def test_wrong_owner_day_claim_original_materials_window_or_source_rejected(self):
        mutations={'ownerGoPin':sentinel('OTHER'),'day':'2026-10-20','resourceClaimPath':'/WRONG_CONSUMED_CLAIM',
            'sourcePostgrestConfigPin':sentinel('OTHER'),'binaryPin':sentinel('OTHER'),
            'closeByUTC':'2026-10-22T00:00:00Z','workEndsAtUTC':self.day['startsAtUTC'],'sourcePins':[sentinel('MISSING_SOURCE')]}
        for key,value in mutations.items():
            original=self.backend[key];self.backend[key]=value
            with self.subTest(key=key):
                with self.assertRaises(RuntimeError):self.check()
            self.backend[key]=original

    def test_equal_work_close_is_rejected_by_both_python_consumers(self):
        self.backend['closeByUTC']=self.backend['workEndsAtUTC']
        with self.assertRaises(RuntimeError):self.check()
        with patch.object(F.C,'read_postgrest_backend_plan',return_value=self.backend):
            with self.assertRaisesRegex(RuntimeError,'lifetime exceeds'):
                F.backend_inputs(self.staged,self.day,{'sourcePostgrestConfig':self.config},{'postgrestBinary':self.binary})

    def test_backend_real_work_window_and_lifecycle_must_cover_full_floor(self):
        P.backend_window(self.backend,self.day,now=self.now)
        for now in [self.now+6*3600,self.now+4*3600]:
            with self.subTest(now=now):
                with self.assertRaisesRegex(RuntimeError,'window lacks'):P.backend_window(self.backend,self.day,now=now)
        with self.assertRaisesRegex(RuntimeError,'lifecycle cannot'):
            P.backend_window({**self.backend,'maximumLifecycleSeconds':1},self.day,now=self.now)

    def test_legacy_absence_does_not_load_optional_owner(self):
        for d in [self.connection,self.staged,self.request,self.recipe]:d.pop(self.key)
        result,canonical=self.check();self.assertIsNone(result);canonical.assert_not_called()
        with patch.object(F.C,'read_postgrest_backend_plan')as canonical:
            self.assertIsNone(F.backend_inputs(self.staged,self.day,None,{}))
            canonical.assert_not_called()

    def test_rejected_backend_precedes_first_finish_write(self):
        capture_pin=sentinel('CAPTURE')
        owner={'correctedSourceCapturePath':capture_pin['path'],'sourceCapturePin':capture_pin}
        capture={'before':{},'after':{},'sourceWrites':0,'postgrestBinary':self.binary}
        docs={**self.docs,self.connection['freshOwnerGO']['path']:owner,capture_pin['path']:capture,'STAGED_RAM_ONLY':self.staged}
        with patch.object(F.C,'read_pin',side_effect=lambda p:docs[p['path']]),patch.object(F.C,'pin',return_value=capture_pin), \
             patch.object(F.C.A,'verify_preexisting_capture'),patch.object(F.C,'save')as save, \
             patch.object(F.C,'read_postgrest_backend_plan',side_effect=ValueError('REJECTED_CANONICAL_BACKEND')):
            with self.assertRaisesRegex(ValueError,'REJECTED_CANONICAL_BACKEND'):F.finish({'path':'STAGED_RAM_ONLY'})
            save.assert_not_called()
        self.assertFalse(Path(self.connection['caseDirectory']).exists())

    def test_owner_inventory_requires_new_explicit_infrastructure_sources(self):
        fixtures=load('pure_backend_coverage_fixtures','observer-source-adoption-test.py')
        rows,docs=fixtures.CoverageNegativeFixtureTest().documents(include_observer=True)
        rows.append(P.pin(BIN/'local-postgrest-owner.py'))
        docs['adoption']['consumerInventorySHA256']=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        with patch.object(P,'read',side_effect=lambda p:docs[p]):
            with self.assertRaisesRegex(RuntimeError,'review did not receive required actual source files'):
                P.coverage_adopted({'startPreflightIndependentAdoption':'adoption'},rows)

    def test_actual_final_authority_rechecks_backend_window_before_claim(self):
        isolation=load('pure_backend_final_authority','isolation.py')
        checked={'connection':self.connection,'day':self.day}
        for now in [self.now+6*3600,self.now+4*3600]:
            with self.subTest(now=now),patch.object(isolation,'verify_pre_setup_authority',return_value=checked), \
                 patch.object(isolation,'local_postgrest_plan',return_value=self.backend),patch.object(P.time,'time',return_value=now), \
                 patch.object(isolation,'pin_json')as read,patch.object(isolation.K,'save_new')as save,patch.object(isolation.K,'docker')as docker:
                with self.assertRaisesRegex(RuntimeError,'backend window lacks'):isolation.verify_full_authority({})
                read.assert_not_called();save.assert_not_called();docker.assert_not_called()

if __name__=='__main__':unittest.main()
