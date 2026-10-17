#!/usr/bin/env python3
"""Targeted static read closure/early error regressions. No GO or activation."""
import copy,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

BIN=Path(__file__).parent
def load(name,file):
 s=importlib.util.spec_from_file_location(name,BIN/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
I=load('read_contract_isolation','isolation.py')
R=load('read_contract_runner','process-runner.py')
C=load('read_contract_controller','full500-controller.py')

class RuntimeReadContractTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  def doc(name,value):
   p=self.root/name;p.write_text(json.dumps(value));return I.A.pin(p)
  self.doc=doc
  leaf=doc('required-historical-source.json',{})
  self.leaf=leaf
  capture=doc('capture.json',{k:leaf for k in ['correctionReceiptPin','sourceDump','localRolesSQL','correctedFinancialWitnessPin']})
  owner=doc('intent.json',{'previousConsumedMarkers':[leaf],'finalOwnerGOPath':str(self.root/'FUTURE_GO.json')})
  day=doc('day.json',{'independentReview':leaf})
  request=doc('request.json',{'sourcePins':[leaf],'primaries':{'original':leaf}})
  self.connection={'caseDirectory':str(self.root),'preparedWithoutGO':True,'immutableWorkflowPins':[],
   'applicationReadOnlyPins':[],'stagedHarness':leaf,'runtimeRequest':request,'sourceCapture':capture}
  connection=doc('connection.json',self.connection)
  acceptance=doc('acceptance.json',{'sourcePins':[leaf],
   'independentReviews':{'scope':[leaf]},'fullConnectionReviews':{'scope':leaf}})
  self.recipe={'independentMeterAcceptance':acceptance,'fixtureConnectionPin':connection,
   'recipeTemplatePin':doc('recipe-template.json',{}),'sourcePins':[leaf],'freshOwnerGO':owner,'dayBindingAcceptance':day}

 def test_authority_and_source_only_dependencies_are_not_omitted(self):
  manifest=I.runtime_read_manifest(self.recipe);paths={p['path']for p in manifest['pins']}
  for pin in [self.recipe['independentMeterAcceptance'],self.leaf,self.recipe['freshOwnerGO']]:self.assertIn(pin['path'],paths)
  self.assertEqual(len(paths),len(manifest['pins']))
  self.assertIn(str(self.root/'FUTURE_GO.json'),manifest['generatedInputsRequireFreshRuntimeBinding'])
  self.assertFalse((self.root/'FUTURE_GO.json').exists())

 def test_conflicting_or_drifted_source_pin_is_rejected(self):
  for bad in [{**self.leaf,'sha256':'0'*64},{**self.leaf,'bytes':self.leaf['bytes']+1}]:
   with self.subTest(bad=bad),self.assertRaises(RuntimeError):I.runtime_read_manifest({**self.recipe,'sourcePins':[bad]})

 def test_missing_original_dependency_and_symlink_fail_closed(self):
  Path(self.leaf['path']).unlink()
  with self.assertRaises(RuntimeError):I.runtime_read_manifest(self.recipe)
  other=self.root/'other.json';other.write_text('{}');Path(self.leaf['path']).symlink_to(other)
  with self.assertRaises(RuntimeError):I.runtime_read_manifest(self.recipe)

 def test_historical_owner_go_never_enters_the_shared_file_list(self):
  forbidden=self.doc('OWNER_LOCAL_GO.PRIVATE.json',{})
  with self.assertRaisesRegex(RuntimeError,'historical local GO excluded'):
   I.runtime_read_manifest({**self.recipe,'sourcePins':[forbidden]})

 def test_writable_mount_cannot_pass_visibility(self):
  manifest=I.runtime_read_manifest(self.recipe)
  with patch.object(I.Path,'read_text',return_value='1 0 0:1 / / rw - overlay overlay rw\n'):
   with self.assertRaisesRegex(RuntimeError,'not read-only'):I.verify_visible_files(manifest)

 def test_manifest_change_is_rejected_before_reading(self):
  manifest=I.runtime_read_manifest(self.recipe);manifest['pins']=[]
  with self.assertRaisesRegex(RuntimeError,'digest differs'):I.verify_visible_files(manifest)

 def test_early_authority_or_parse_failure_always_cleans_processes_and_db(self):
  for error in [FileNotFoundError('PRIVATE'),ValueError('PRIVATE'),RuntimeError('PRIVATE')]:
   with (self.subTest(error=type(error).__name__),patch.object(R,'run_workflow',side_effect=error),
      patch.object(R,'finish_children',return_value={'graceful':True})as processes,
      patch.object(R,'stop_owned_database',return_value={'mounted':True,'cleanShutdownConfirmed':True})as database,
      patch.object(R,'save_new')as save):
    self.assertEqual(R.main(),1);processes.assert_called_once();database.assert_called_once()
    self.assertNotIn('PRIVATE',json.dumps(save.call_args.args[1]))

 def test_process_cleanup_failure_does_not_skip_database_stop(self):
  with (patch.object(R,'run_workflow',side_effect=RuntimeError('test')),
     patch.object(R,'finish_children',side_effect=RuntimeError('test')),
     patch.object(R,'stop_owned_database',return_value={'mounted':False})as stop,patch.object(R,'save_new')):
   self.assertEqual(R.main(),1);stop.assert_called_once()

 def test_controller_does_not_close_old_or_concurrent_reservation(self):
  reservation=self.root/'reservation.json';reservation.write_text(json.dumps({'controllerInvocationId':'ANOTHER_CONTROLLER'}))
  with (patch.object(C.I,'SETUP_RESERVATION',reservation),patch.object(C,'_run_once',side_effect=RuntimeError('blocked')),
     patch.object(C.I,'close_failed_owned_setup')as close):
   with self.assertRaisesRegex(RuntimeError,'blocked'):C.run({}, {}, {})
   close.assert_not_called()

 def test_controller_closes_only_its_own_new_setup_on_failure(self):
  reservation=self.root/'reservation.json';seen=[]
  def fail(*args,**kwargs):
   seen.append(kwargs['invocation_id']);reservation.write_text(json.dumps({'controllerInvocationId':seen[-1]}));raise RuntimeError('failed-own-setup')
  with (patch.object(C.I,'SETUP_RESERVATION',reservation),patch.object(C,'_run_once',side_effect=fail),
     patch.object(C.I,'close_failed_owned_setup')as close):
   with self.assertRaisesRegex(RuntimeError,'failed-own-setup'):C.run({}, {'TEST_ONLY':True}, {})
   close.assert_called_once_with({'TEST_ONLY':True},seen[0])

if __name__=='__main__':unittest.main()
