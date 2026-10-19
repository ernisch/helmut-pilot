#!/usr/bin/env python3
"""Stage exact existing-GO recipe inputs. No Docker/execution/claim here."""
import importlib.util,json
from pathlib import Path

BIN=Path(__file__).parent
s=importlib.util.spec_from_file_location('connector',BIN/'connect-local500.py')
C=importlib.util.module_from_spec(s);s.loader.exec_module(C)
B=C.BASE;W=C.AREA

def finish(staged_pin):
    staged=C.read_pin(staged_pin);case=Path(staged['caseDirectory']);n=case/'native-end-preparation'
    if (case/'FINAL_CONNECTION.SAFE.json').exists():raise RuntimeError('never overwrite/rebind a staged case')
    owner_pin=staged['ownerGOPin'];day=C.read_pin(staged['dayAcceptance'])
    owner=C.read_pin(owner_pin)
    capture_pin=C.pin(owner['correctedSourceCapturePath']);capture=C.read_pin(capture_pin)
    C.A.verify_preexisting_capture(capture_pin,actual=False)
    if owner['sourceCapturePin']!=capture_pin:raise RuntimeError('new input DATA binding differs')
    if capture['before']!=capture['after'] or capture['sourceWrites']!=0:raise RuntimeError('read-only source capture incomplete')
    original=json.loads((B/'wave15/ROOT_NEW_RUNTIME_REQUEST.PRIVATE.json').read_text())
    content=json.loads((B/'wave15/ROOT_NEW_CONTENT_CODE_ACCEPTANCE.PRIVATE.json').read_text())
    # Historical approvals remain dependencies, never reused as the new owner GO.
    content.update(ownerGo=owner_pin,currentPolicyInput=staged['dayRows'],inputRows=staged['dayRows'],
      currentDayAcceptance=staged['dayAcceptance'],reviewScope='Exact independently reviewed day19 relative-display transfer plus unchanged archived source/profile/nonrelative factual scope. No execution or performance acceptance.')
    content.pop('inputBases',None)
    content['previouslyAttemptedOperationIds']=list(dict.fromkeys(content['previouslyAttemptedOperationIds']+[
       'synthetik500-localnative16-b27c20261016','synthetik500-authority16-41ca20261016']))
    content_pin=C.save(case/'ROOT_NEW_CONTENT_CODE_ACCEPTANCE.PRIVATE.json',content)
    external=json.loads((B/'wave15/ROOT_NEW_LOCAL_EXTERNAL_BINDING.PRIVATE.json').read_text())
    external['inputAcceptanceSHA256']=content_pin['sha256']
    # No source publication/capture timestamp is changed. The selected source
    # window remains the preexisting13..16 window; day19 validity requires the
    # separately pinned accepted day19 evidence, never a timestamp rewrite.
    external_pin=C.save(case/'ROOT_NEW_LOCAL_EXTERNAL_BINDING.PRIVATE.json',external)
    repo=Path('/workspace/helmut-cpu-epoch-20261015')
    # A NEW command needs actual current code pins; old content acceptance is
    # input provenance, never acceptance of historical runtime file hashes.
    sources={p['path']:C.pin(p['path']) for p in original['sourcePins'] if p['path'].startswith(str(repo)+'/')}
    atomic=staged.get('atomicUsageInput')
    if atomic is not None:
        descriptor=C.read_pin(atomic)
        if descriptor.get('schema')!='helmut-local-atomic-usage-resource-input/1' or descriptor.get('production')is not False:
            raise RuntimeError('local atomic candidate binding required')
        for p in descriptor['sourcePins']:
            if C.pin(p['path'])!=p:raise RuntimeError('atomic source pin drift')
            sources[p['path']]=p
    for folder in [n,n/'runtime-candidates',BIN]:
        for p in folder.iterdir():
            if p.is_file() and p.suffix in ['.js','.py','.json'] and (folder!=BIN or not p.name.endswith(('-test.js','-test.py'))):sources[str(p.resolve())]=C.pin(p)
    sources[str(case/'assemble-after-activation.js')]=C.pin(case/'assemble-after-activation.js')
    primaries={**original['primaries'],'all500IndependentVisibleReview':staged['dayAcceptance'],'ordinaryAAndFEquality':staged['dayAcceptance']}
    request={**original,'targetDatabase':staged['targetDatabase'],'expectedOwnerGoPin':owner_pin,
      'inputAcceptance':content_pin,'sourcePins':list(sources.values()),'primaries':primaries,
      'localExternalBelege':external_pin,'newOperation':staged['operationId'],
      'rootFinalCodeAcceptance':staged['dayAcceptance'],'currentDayBinding':staged['dayAcceptance']}
    if atomic is not None:request['atomicUsageInput']=atomic
    request_pin=C.save(case/'ROOT_NEW_RUNTIME_REQUEST.PRIVATE.json',request)
    assets={}
    def add(p):
        if p['path'].startswith(str(repo)+'/'):return
        if Path(p['path']).name=='OWNER_LOCAL_GO.PRIVATE.json':raise RuntimeError('historical GO must not enter mounted inputs')
        if C.pin(p['path'])!=p:raise RuntimeError('static fixture pin drift')
        if not Path(p['path']).is_relative_to(case):assets[p['path']]=p
    for p in primaries.values():add(p)
    for p in C.A.capture_data_pins(capture_pin):add(p)
    for p in [staged['dayRows'],staged['dayAcceptance'],day['independentReview'],capture_pin,capture['sourceDump'],capture['localRolesSQL'],capture['correctedFinancialWitnessPin'],capture['correctionReceiptPin'],
      C.pin(B/'wave13/input-extraction/ORIGINAL_PACKAGE.PRIVATE.json'),C.pin(B/'wave13/NATIVE_INVENTORY_TEMPLATE.PRIVATE.json'),
      C.pin(B/'wave12/native-pdf-inputs/ACTUAL_NATIVE_SOURCE23_KO60_WITH_PDF.PRIVATE.json'),
      C.pin(B/'wave12/ROOT_STATIC_LOCAL_R_TEMPLATE_ACCEPTANCE.SAFE.json'),
      C.pin(B/'wave12/local-provider-candidates/REVIEWED_LOCAL_PROVIDER_CANDIDATES.PRIVATE.json'),
      C.pin(B/'wave12/local-provider-candidates/exact-request-binder.PROPOSAL.js'),
      C.pin(B/'wave11/cohort-requirements/PROFILES.PRIVATE.json'),
      C.pin(B/'wave9/native-fixture/ORIGINAL_U_PACKET.PRIVATE.json'),C.pin(B/'wave9/native-fixture/ORIGINAL_U_EXISTING_REVIEW.PRIVATE.json'),
      C.pin(B/'wave9/native-fixture/PREDECESSOR_BINDING.SAFE.json'),C.pin(B/'wave9/native-fixture/postgrest.PRIVATE.conf'),
      C.pin(B/'wave8/native-fixture/EXECUTION_ENV.PRIVATE.json'),C.pin(B/'wave2/db_proof_path/jwt-secret.PRIVATE.txt'),
      C.pin(B/'wave12/LOCAL_EXISTING_BUDGET_SCENARIO.PRIVATE.json'),C.pin(B/'wave13/build-native-inventory.js')]:add(p)
    templates=json.loads((B/'wave12/ROOT_STATIC_LOCAL_R_TEMPLATE_ACCEPTANCE.SAFE.json').read_text())
    for k in ['canonicalTemplates','package','independentSecurityReview','explicitThemenreinReview14of14','negativeTypeAndReasonEvidence','all500MappingEvidence']:add(templates[k])
    plan={'schema':'helmut-pinned-full500-connection/1','day':C.A.DAY,'production':False,
      'sourceInputDatabase':C.A.INPUT_DATABASE,'resourceClaimPath':str(C.A.CLAIM),
      'caseDirectory':str(case),'workflowDirectory':str(n),'sourceDatabase':staged['sourceDatabase'],
      'targetDatabase':staged['targetDatabase'],'containerName':staged['containerName'],'operationId':staged['operationId'],
      'freshOwnerGO':owner_pin,'runtimeRequest':request_pin,'sourceCapture':capture_pin,
      'originalPreflightPin':C.pin('/workspace/helmut-resource-preflight-20261016/RESOURCE_START_PREFLIGHT.SAFE.json'),
      'historicalSourcePin':C.pin(B/'wave15/native-end-preparation/LOCAL_ACTIVATION_RESULT.SAFE.json'),
      'immutableWorkflowPins':[x['staged'] for x in staged['templateDeltas']]+[staged['action'],content_pin,external_pin,request_pin],
      'dayBindingAcceptance':staged['dayAcceptance'],'applicationReadOnlyPins':list(assets.values()),
      'databaseReadOnlyPins':[capture['postgrestBinary']],
      'stagedHarness':staged_pin,'full500RunStarted':False,'resourceGOConsumed':False,
      'storageHoldSeconds':9*3600+600,'storageCapacityBytes':8000000000,
      'approvedInternalSubnet':C.A.SUBNET,
      'sourceCaptureIsPreexistingFixtureInputNotWorkflowCPU':True,
      'phases':['preparation','assembly','sequence'],'profiles':500,'controlsPerUnit':16,
      'originalUUnchangedAndRequired':True,'noProfiler':True,'noPaidProviderCalls':True,'preparedWithoutGO':staged.get('preparedWithoutGO',False)}
    if atomic is not None:plan['atomicUsageInput']=atomic
    connection=C.save(case/'FINAL_CONNECTION.SAFE.json',plan)
    # Recipe templates contain NO current preflight or final meter acceptance.
    # The controller adds those only after independent review, immediately
    # before the single global claim on the actual qualified wall-clock day.
    recipe={'scope':'owner-approved-local500-resources','full500Attempts':1,'fixtureConnectionPin':connection,
      'freshOwnerGO':owner_pin,'dayBindingAcceptance':staged['dayAcceptance'],
      'databaseSampleIntervalSeconds':1,'expectedFreshOperationId':staged['operationId'],
      'assemblyResultPath':str(case/'LOCAL_ASSEMBLY_RESULT.SAFE.json'),
      'originalSequenceResultPath':str(n/('run-combined500-'+staged['operationId'])/'SEQUENCE_RESULT.SAFE.json'),
      'stages':[
       {'name':'preparation','argv':['taskset','-c','0','node',str(BIN/'measured-preparation.js'),connection['path']],'timeoutSeconds':300,'pins':[connection]},
       {'name':'assembly','argv':['taskset','-c','0','node',str(case/'assemble-after-activation.js'),'--after-reviewed-local-activation'],'timeoutSeconds':300,'pins':[C.pin(case/'assemble-after-activation.js')]},
       {'name':'sequence','argv':['taskset','-c','0','node',str(n/'run-reviewed-sequence.js'),str(n/'runtime-candidates/FINAL_CONFIG.PRIVATE.json'),'root-approved-local-only'],'timeoutSeconds':9*3600,'pins':[C.pin(n/'run-reviewed-sequence.js')]}]}
    recipe_pin=C.save(case/'RECIPE_TEMPLATE.PRIVATE.json',recipe)
    return {'connection':connection,'recipeTemplate':recipe_pin,'applicationStaticFiles':len(assets),'sourcePins':len(sources),
       'full500RunStarted':False,'resourceGOConsumed':False}

if __name__=='__main__':raise SystemExit('IMPORT_ONLY_ROOT_STAGING_CALL_REQUIRED')
