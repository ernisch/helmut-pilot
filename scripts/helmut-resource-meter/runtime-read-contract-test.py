#!/usr/bin/env python3
"""Targeted static read closure/early error regressions. No GO or activation."""
import copy,hashlib,importlib.util,json,subprocess,tempfile,unittest
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
  self.correction_data=[doc('completed-book17-claim.json',{'TEST_ONLY':'NO_RESOURCE_GO'}),doc('previous-input-witness.json',{}),
   doc('completed-book18-claim.json',{'TEST_ONLY':'NO_RESOURCE_GO'}),doc('current-input-witness.json',{})]
  provenance=patch.object(I.A,'capture_data_pins',return_value=[capture,leaf,*self.correction_data])
  provenance.start();self.addCleanup(provenance.stop)
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
  for pin in self.correction_data:self.assertIn(pin['path'],paths)
  self.assertEqual(len(paths),len(manifest['pins']))
  self.assertIn(str(self.root/'FUTURE_GO.json'),manifest['generatedInputsRequireFreshRuntimeBinding'])
  self.assertFalse((self.root/'FUTURE_GO.json').exists())

 def test_control_descriptor_uses_shared_runtime_manifest_without_review_file_reads(self):
  local_source_delta=I.A.pin(BIN.parents[1]/'docs/betrieb/belege/local-unit-storage-source-20261022/CURRENT_LOCAL_SOURCE_DELTA.SAFE.json')
  code="process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor({stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',controlRead:'verified-control-view-v1',localSourceDeltaPin:JSON.parse(process.argv[2])})))"
  descriptor=json.loads(subprocess.check_output(['node','-e',code,str(BIN/'atomic-usage-integration.js'),json.dumps(local_source_delta)],text=True))
  candidate=self.doc('atomic-control-descriptor.json',descriptor)
  request=self.doc('control-request.json',{'sourcePins':[self.leaf],'primaries':{'original':self.leaf},'atomicUsageInput':candidate})
  connection={**self.connection,'atomicUsageInput':candidate,'runtimeRequest':request}
  recipe={**self.recipe,'fixtureConnectionPin':self.doc('control-connection.json',connection)}
  manifest=I.runtime_read_manifest(recipe);paths={p['path']:p for p in manifest['pins']}
  self.assertEqual(paths[candidate['path']],candidate)
  for source in descriptor['sourcePins']:self.assertEqual(paths[source['path']],source)
  for name in ['synthetik-500-production-adapter.js','synthetik-500-dispatch-journal.js']:
   self.assertTrue(any(Path(p).name==name for p in paths))
  for review in ['independentReview','transportClosure']:
   self.assertFalse(any(Path(p).name==descriptor['controlSourceAcceptance'][review]['name']for p in paths))
  acceptance=descriptor['controlSourceAcceptance'];view=acceptance['localViewBindingCallerDelta']
  self.assertEqual(view['file'],'lib/helmut/synthetik-500-production-adapter.js')
  self.assertEqual(view['originalSHA256'],acceptance['localReadCallerDelta']['candidateSourceSHA256'][view['file']])
  adapter=next(p for p in descriptor['sourcePins'] if p['path'].endswith('/'+view['file']))
  self.assertEqual(view['sha256'],adapter['sha256']);self.assertNotEqual(view['sha256'],view['originalSHA256'])
  self.assertTrue(view['requiresFreshIntegrationAcceptance'])
  for key in ['newGlueAccepted','full500Accepted','RAMOrTimeGainAccepted']:self.assertIs(view[key],False)
  review_pin=view['independentSourceReview']
  review_path=BIN.parents[1]/'docs/betrieb/belege/local-view-binding-20261022'/review_pin['name']
  review_bytes=review_path.read_bytes();self.assertEqual(len(review_bytes),review_pin['bytes'])
  self.assertEqual(hashlib.sha256(review_bytes).hexdigest(),review_pin['sha256'])
  reviewed=json.loads(review_bytes)
  self.assertEqual(next(p for p in reviewed['sourcePins'] if p['file']==view['file'])['sha256'],view['sha256'])
  self.assertEqual(reviewed['baselineAdapter']['sha256'],view['originalSHA256'])
  self.assertIs(reviewed['historicalAcceptanceTransferred'],False)
  self.assertIs(reviewed['executionAuthority'],False);self.assertIs(reviewed['nativeUnit60Qualified'],False)
  self.assertNotIn(str(review_path),paths)
  for kind in ['missing-review','forged-source-hash','forged-authority']:
   bad=copy.deepcopy(descriptor)
   if kind=='missing-review':del bad['controlSourceAcceptance']['localViewBindingCallerDelta']
   elif kind=='forged-source-hash':bad['controlSourceAcceptance']['localViewBindingCallerDelta']['sha256']='0'*64
   else:bad['controlSourceAcceptance']['localViewBindingCallerDelta']['full500Accepted']=True
   altered=self.doc(kind+'-descriptor.json',bad)
   reject="const assert=require('node:assert/strict'),AU=require(process.argv[1]);assert.throws(()=>AU.readDescriptor(JSON.parse(process.argv[2])),e=>e.code==='ERR_ASSERTION');"
   with self.subTest(kind=kind):subprocess.run(['node','-e',reject,str(BIN/'atomic-usage-integration.js'),json.dumps(altered)],check=True,capture_output=True,text=True)
  # A new exact reviewed hash still rejects changed actual adapter bytes and
  # never masks disagreement with another separately supplied source delta.
  conflicting=json.loads(Path(local_source_delta['path']).read_bytes())
  conflicting['sourcePins'].append({'file':view['file'],'bytes':adapter['bytes'],'sha256':view['originalSHA256']})
  conflicting_pin=self.doc('conflicting-reviewed-source-delta.SAFE.json',conflicting)
  check=r"""
const assert=require('node:assert/strict'),fs=require('node:fs');
const AU=require(process.argv[1]);
const options={stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',controlRead:'verified-control-view-v1',localSourceDeltaPin:JSON.parse(process.argv[3])};
const d=AU.descriptor(options),view=d.controlSourceAcceptance.localViewBindingCallerDelta,read=fs.readFileSync;
try{fs.readFileSync=function(file,...args){const b=read.call(this,file,...args);return String(file).endsWith('/'+view.file)?Buffer.concat([b,Buffer.from('\n')]):b;};
 assert.throws(()=>AU.descriptor(options),/Reviewed control source drift/);
}finally{fs.readFileSync=read;}
assert.throws(()=>AU.descriptor({...options,localSourceDeltaPin:JSON.parse(process.argv[4])}),e=>e.code==='ERR_ASSERTION');
"""
  subprocess.run(['node','-e',check,str(BIN/'atomic-usage-integration.js'),'unused',json.dumps(local_source_delta),json.dumps(conflicting_pin)],check=True,capture_output=True,text=True)
  # The separately reviewed cost caller is a SOURCE-only allowance. Keep its
  # historical baseline and every old native-acceptance boundary explicit.
  cost=acceptance['localCostCallerDelta']
  self.assertEqual(cost['file'],'lib/helmut/testkosten-budget.js')
  self.assertEqual(cost['baselineCommit'],'d6778b7805adc7ebe0b466b1604947d4a86114d9')
  self.assertEqual(cost['originalSHA256'],'9f36d5379ae9c94140cae9e2cf97c12dd91ae6efe9431ca4f16746b9efa5da2e')
  budget=next(p for p in descriptor['sourcePins'] if p['path'].endswith('/'+cost['file']))
  self.assertEqual(cost['sha256'],budget['sha256']);self.assertNotEqual(cost['sha256'],cost['originalSHA256'])
  for key in ['sourceOnly','requiresFreshIntegrationAcceptance']:self.assertIs(cost[key],True)
  no_acceptance=['historicalAcceptanceTransferred','nativeLeaseAcceptanceTransferred','historicalGlobalCounterOrFinancialEquivalence',
                 'executionAuthority','nativeUnit60Qualified','production','newGlueAccepted','full500Accepted','RAMOrTimeGainAccepted']
  for key in no_acceptance:self.assertIs(cost[key],False)
  cost_review_pin=cost['independentSourceReview']
  cost_review_path=BIN.parents[1]/'docs/betrieb/belege/local-unit-cost-caller-source-20261022'/cost_review_pin['name']
  cost_review_bytes=cost_review_path.read_bytes()
  self.assertEqual(len(cost_review_bytes),cost_review_pin['bytes'])
  self.assertEqual(hashlib.sha256(cost_review_bytes).hexdigest(),cost_review_pin['sha256'])
  cost_review=json.loads(cost_review_bytes)
  self.assertEqual(cost_review['schema'],'helmut-local-unit-cost-caller-source-review/1')
  self.assertEqual(cost_review['baselineCommit'],cost['baselineCommit'])
  self.assertEqual(cost_review['baselineSource'],{'file':cost['file'],'bytes':32969,'sha256':cost['originalSHA256']})
  self.assertEqual(cost_review['sourcePins'],[{'file':cost['file'],'bytes':budget['bytes'],'sha256':cost['sha256']}])
  for key in ['sourceOnly','independent','pass','requiresFreshIntegrationAcceptance']:self.assertIs(cost_review[key],True)
  for key in no_acceptance:self.assertIs(cost_review[key],False)
  self.assertNotIn(str(cost_review_path),paths)
  for kind in ['missing-cost-review','forged-cost-source-hash','forged-cost-review-pin','forged-cost-authority']:
   bad=copy.deepcopy(descriptor)
   if kind=='missing-cost-review':del bad['controlSourceAcceptance']['localCostCallerDelta']
   elif kind=='forged-cost-source-hash':bad['controlSourceAcceptance']['localCostCallerDelta']['sha256']='0'*64
   elif kind=='forged-cost-review-pin':bad['controlSourceAcceptance']['localCostCallerDelta']['independentSourceReview']['sha256']='0'*64
   else:bad['controlSourceAcceptance']['localCostCallerDelta']['full500Accepted']=True
   altered=self.doc(kind+'-descriptor.json',bad)
   with self.subTest(kind=kind):subprocess.run(['node','-e',reject,str(BIN/'atomic-usage-integration.js'),json.dumps(altered)],check=True,capture_output=True,text=True)
  cost_conflicting=json.loads(Path(local_source_delta['path']).read_bytes())
  cost_conflicting['sourcePins'].append({'file':cost['file'],'bytes':32969,'sha256':cost['originalSHA256']})
  cost_conflicting_pin=self.doc('conflicting-cost-source-delta.SAFE.json',cost_conflicting)
  cost_check=r"""
const assert=require('node:assert/strict'),fs=require('node:fs');
const AU=require(process.argv[1]);
const options={stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',controlRead:'verified-control-view-v1',localSourceDeltaPin:JSON.parse(process.argv[2])};
const d=AU.descriptor(options),cost=d.controlSourceAcceptance.localCostCallerDelta,read=fs.readFileSync;
assert(Object.isFrozen(d.controlSourceAcceptance));assert(Object.isFrozen(cost));assert(Object.isFrozen(cost.independentSourceReview));
try{fs.readFileSync=function(file,...args){const b=read.call(this,file,...args);return String(file).endsWith('/'+cost.file)?Buffer.concat([b,Buffer.from('\n')]):b;};
 assert.throws(()=>AU.descriptor(options),/Reviewed control source drift/);
}finally{fs.readFileSync=read;}
assert.throws(()=>AU.descriptor({...options,localSourceDeltaPin:JSON.parse(process.argv[3])}),e=>e.code==='ERR_ASSERTION');
"""
  subprocess.run(['node','-e',cost_check,str(BIN/'atomic-usage-integration.js'),json.dumps(local_source_delta),json.dumps(cost_conflicting_pin)],check=True,capture_output=True,text=True)
  # Real visibility in the actual container remains a separate mandatory gate;
  # this file-list assertion does not fabricate its result.
  changed=self.doc('changed-descriptor.json',{**descriptor,'sourcePins':[{**descriptor['sourcePins'][0],'sha256':'0'*64}]})
  bad_request=self.doc('bad-control-request.json',{'sourcePins':[],'primaries':{},'atomicUsageInput':changed})
  bad_connection=self.doc('bad-control-connection.json',{**connection,'atomicUsageInput':changed,'runtimeRequest':bad_request})
  with self.assertRaises(RuntimeError):I.runtime_read_manifest({**recipe,'fixtureConnectionPin':bad_connection})

 def test_historical_source_delta_cannot_admit_current_storage(self):
  historical=I.A.pin(BIN.parents[1]/'docs/betrieb/belege/local-lock-lease-20261021/ROOT_LOCAL_SOURCE_DELTA.SAFE.json')
  # The supplemental source-only review is an explicit new input. Neither
  # consumer may replace a caller's historical pin with the current review.
  reject=r"""
const assert=require('node:assert/strict'),AU=require(process.argv[1]),LEASE=require(process.argv[2]);
const historical=JSON.parse(process.argv[3]);
assert.throws(()=>LEASE.sourceDelta(historical),e=>e.code==='ERR_ASSERTION');
assert.throws(()=>AU.descriptor({stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',
 controlRead:'verified-control-view-v1',localSourceDeltaPin:historical}),e=>e.code==='ERR_ASSERTION');
"""
  subprocess.run(['node','-e',reject,str(BIN/'atomic-usage-integration.js'),
                 str(BIN/'pipeline-lock-lease-integration.js'),json.dumps(historical)],
                check=True,capture_output=True,text=True)

 def test_missing_additional_completed_correction_provenance_fails_before_container(self):
  Path(self.correction_data[0]['path']).unlink()
  with self.assertRaises(RuntimeError):I.runtime_read_manifest(self.recipe)

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
   with (self.subTest(error=type(error).__name__),patch.object(R.os,'getpid',return_value=1),patch.object(R,'run_workflow',side_effect=error),
      patch.object(R,'finish_children',return_value={'graceful':True})as processes,
      patch.object(R,'stop_owned_database',return_value={'mounted':True,'cleanShutdownConfirmed':True})as database,
      patch.object(R,'save_new')as save):
    self.assertEqual(R.main(),1);processes.assert_called_once();database.assert_called_once()
    self.assertNotIn('PRIVATE',json.dumps(save.call_args.args[1]))

 def test_process_cleanup_failure_does_not_skip_database_stop(self):
  with (patch.object(R.os,'getpid',return_value=1),patch.object(R,'run_workflow',side_effect=RuntimeError('test')),
     patch.object(R,'finish_children',side_effect=RuntimeError('test')),
     patch.object(R,'stop_owned_database',return_value={'mounted':False})as stop,patch.object(R,'save_new')):
   self.assertEqual(R.main(),1);stop.assert_called_once()

 def test_host_invocation_never_enters_workflow_or_signals_any_process(self):
  with (patch.object(R.os,'getpid',return_value=31337),patch.object(R,'run_workflow')as run,
     patch.object(R,'finish_children')as processes,patch.object(R,'stop_owned_database')as database):
   with self.assertRaisesRegex(RuntimeError,'private container PID1'):R.main()
   run.assert_not_called();processes.assert_not_called();database.assert_not_called()
  with patch.object(R.os,'getpid',return_value=31337),patch.object(R.os,'kill')as kill:
   with self.assertRaisesRegex(RuntimeError,'private container PID1'):R.finish_children()
   kill.assert_not_called()

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
