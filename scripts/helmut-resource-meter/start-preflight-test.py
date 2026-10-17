#!/usr/bin/env python3
"""Targeted pre-GO regressions. No Docker, activation or resource run."""
import copy
import importlib.util
import json
import tempfile
import time
import unittest
from pathlib import Path
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
        required=8000000000+8*1024**3
        for available,expected in [(required,True),(required-1,False)]:
            fake=type('FS',(),{'f_bavail':available,'f_frsize':1})()
            with patch.object(P.os,'statvfs',return_value=fake):
                result=P.filesystem_ready({'caseDirectory':'TEST_ONLY','storageCapacityBytes':8000000000})
                self.assertEqual(result['pass'],expected)
                self.assertEqual(result['shortageBytes'],0 if expected else 1)

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
