#!/usr/bin/env python3
"""Metadata-only source freeze; never import the harness or start a resource."""
import difflib
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
BASE=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/combined-auth-baseline-native-launcher')
CANONICAL=BASE.parent/'auth-stability30-native-launcher'
BASE_SHA='7c32a0ced6e4cd0e50e9d5b716ea4a5d601dfb21204113b40cb832429a637266'
CONTRACT={'rounds':30,'controlsPerRound':6,'authRPCCount':243,'fullReadCount':32,
    'writeCount':31,'controlReadCount':180,'mutations':30,'restoreCount':1,
    'boundaries':60,'clientWallSeconds':180,'nodeCaptureLimitBytes':1048576,
    'sqlCaptureLimitBytes':262144,'totalEvidenceCapBytes':8388608,
    'fetchMaxSeconds':20,'sqlMaxSeconds':30,'lockMaxSeconds':1,'authOperationMaxMilliseconds':30000}
CORE=('common.py','run.py','worker.py','control-driver.js')
EXTRAS=('BASELINE_PREPARED.SAFE.json','FREEZE_SOURCE.py','GUARD_REVIEW.md',
        'CAPACITY_ESTIMATE.SAFE.json','SOURCE_DELTA.PRIVATE.diff')

def pin(path):
    path=Path(path)
    assert path.is_absolute() and path.resolve()==path and path.is_file() and not path.is_symlink()
    raw=path.read_bytes()
    return {'path':str(path),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

def save(name,value):
    path=HERE/name
    assert path.parent==HERE and not path.is_symlink()
    path.write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
    path.chmod(0o600)

def rebind(value):
    if isinstance(value,dict):
        if set(value)=={'path','bytes','sha256'}:
            path=Path(value['path'])
            if path.is_relative_to(BASE):
                return pin(HERE/path.relative_to(BASE))
        return {k:rebind(v) for k,v in value.items()}
    if isinstance(value,list):return [rebind(v) for v in value]
    return value

baseline=HERE/'BASELINE_PREPARED.SAFE.json'
assert pin(baseline)['sha256']==BASE_SHA,'preserved baseline PREPARED drift'
original=json.loads(baseline.read_text())
assert original['schema']=='helmut-combined-auth-baseline-prepared/1'
assert pin(BASE/'PREPARED.SAFE.json')['sha256']==BASE_SHA,'original frozen launcher drift'
# Product, guarded SQL, shutdown and all remaining copied bodies must be exact.
changed=set(CORE)|{'README.md','SCOPE.SAFE.json','PREPARED.SAFE.json'}
unchanged=[]
for source in sorted(BASE.rglob('*')):
    if not source.is_file() or source.relative_to(BASE).as_posix() in changed:continue
    target=HERE/source.relative_to(BASE)
    old,new=pin(source),pin(target)
    assert (old['bytes'],old['sha256'])==(new['bytes'],new['sha256']),'unexpected copied-body change'
    unchanged.append({'source':old,'candidate':new})
save('SCOPE.SAFE.json',{
    'schema':'helmut-auth-stability30-scope/1','status':'PREPARED_NOT_RUN',
    'comparisonScope':'INTEGRATED_NEW_AUTH_30_ROUND_STABILITY_ONLY',
    'caseRoot':'/workspace/helmut-ram-fix-20261020/auth-stability-20261021/cases',
    'changedExecutableFiles':list(CORE),'fixedWorkload':CONTRACT,
    'productUAndPartsBytesUnchanged':True,'NEWSQLWrapperBytesUnchanged':True,
    'strictShutdownHelperPolicyAndUpstreamBytesUnchanged':True,
    'oldFrozenLaunchersUnchanged':True,'canonicalSource827aPermanentlyProtected':True,
    'noGeneralParameterKnobs':True,'sameFinalPreparedLifecycleRequired':True,
    'nativeAndHeapAndDiskBudgetsUnchanged':True,
    'diagnosticOnlyBudgetChanges':{
        'wholeNodeBatchSeconds':{'old':30,'new':180},
        'NodeCombinedCaptureBytes':{'old':262144,'new':1048576},
        'caseEvidenceCapBytes':{'old':4194304,'new':8388608},
        'SQLCaptureAndDeadlineUnchanged':True,'AuthOperation30SecondsEnforced':True,
        'reason':'30-round complete proof projection4.8-5.2MB exceeds old4MiB; dedicated Node receipt0.7-0.8MB exceeds256KiB'},
    'requiredNativeCountersZero':['high','max','oom','oom_kill'],
    'optionalNativeCountersZeroIfPresent':['oom_group_kill'],
    'markerAndACKAtomicRenameRange':'1..60 only; no0/61/leading-zero/nondigit names',
    'unchangedFiles':unchanged,
    'subjectImportsASTSyntaxTestsSQLNativeDockerNetworkModelCallsExecuted':False,
    'full500':False,'production':False,'mergeOrDeploy':False})
# A human-reviewable source diff includes only changed executable and prose/scope bodies.
chunks=[]
for name in (*CORE,'README.md','SCOPE.SAFE.json'):
    chunks.extend(difflib.unified_diff((BASE/name).read_text().splitlines(True),
        (HERE/name).read_text().splitlines(True),fromfile='accepted-baseline/'+name,
        tofile='auth-stability30/'+name))
(HERE/'SOURCE_DELTA.PRIVATE.diff').write_text(''.join(chunks))
(HERE/'SOURCE_DELTA.PRIVATE.diff').chmod(0o600)
value=rebind(original)
value['schema']='helmut-combined-auth-new-stability-prepared/1'
value['revision']='INTEGRATED_NEW_AUTH_FIXED30_STABILITY_SOURCE_ONLY'
value['comparisonScope']='INTEGRATED_NEW_AUTH_30_ROUND_STABILITY_ONLY'
value['caseRoot']='/workspace/helmut-ram-fix-20261020/auth-stability-20261021/cases'
value['stabilityContract']=CONTRACT
value['expectedRootOrder']=['lifecycle-only:NONE','control-stability:NEW']
value['explicitModes']=['lifecycle-only','control-stability']
value['explicitVariants']=['NONE','NEW']
for key in ('variantBodies','variantInstallations','variantParts','variantSources'):
    value[key]={'NEW':value[key]['NEW']}
value['controlContract'].update({'authRPCCount':243,'controlReadCount':180,'cycles':30,
    'fullReadCount':32,'probeMutations':30,'writeCount':31,
    'realHTTP':'exact243 selected-U accepted callbacks;243 passive real sends;243 complete passive responses',
    'freshNonceHistoryReceipts':212,'freshControlGraphBindings':180,'freshConfirmedCASRevisions':31,
    'fullLogicalHistoryHashCount':63,'controlTextStringifyObservations':32,
    'authOperationMaxMilliseconds':30000})
value['cycleObservation'].update({'markers':60,'combinedClientCaptureBytes':1048576,
    'sqlInsideDiagnosticNode180Seconds':True,'diagnosticWholeNodeWallSeconds':180,
    'hostTimelineMaximumSamples':220,'hostTimelineTrimmedAfterCap':True,
    'hostTimelineIsCompleteUniformCurve':False,'completeBoundaryFramesArePrimaryTrend':True})
value['cycleObservation'].pop('sqlInsideUnchangedClient30Seconds',None)
value['totalEvidenceCapBytes']=8388608
value['nodeCombinedOutputCapBytes']=1048576
value['queryCombinedOutputCapBytes']=262144
value['diagnosticWholeNodeBatchSeconds']=180
value['diagnosticWholeNodeBatchIsNotIndividualAuthLimit']=True
value['authOperationMaxMilliseconds']=30000
value['nativeMemoryEventsRequiredZero']=['high','max','oom','oom_kill']
value['nativeMemoryEventsOptionalZero']=['oom_group_kill']
value['nativeMissingRequiredCounterFails']=True
value['setup'].update({'additionalCycleMetricSessionsControlMode':60,
    'installations':'NEW renderer6/graph8 only, byte-identical guarded wrappers',
    'setupSQLBytesUnchanged':True})
value['sourceOverlays']='readonly integrated NEW U93917a+Partsf300; canonical host pins separately authenticate identical bytes'
value['postgrestClosure']['helperSourcePin']=pin(HERE/'postgrest_lifecycle.py')
value['sourceDeltaPin']=pin(HERE/'SOURCE_DELTA.PRIVATE.diff')
value['scopePin']=pin(HERE/'SCOPE.SAFE.json')
value['baselinePreparedPin']=pin(BASE/'PREPARED.SAFE.json')
value['capacityEstimatePin']=pin(HERE/'CAPACITY_ESTIMATE.SAFE.json')
value['rootIntegration']={'installedAtCanonicalRoot':HERE==CANONICAL,
    'canonicalLauncherPath':str(CANONICAL),'candidateSourceDirectory':str(HERE),
    'independentReviewPending':True,'nativeExecuted':False,
    'sourceBaselinePreparedPin':pin(BASE/'PREPARED.SAFE.json'),
    'unchangedCopiedBodies':len(unchanged),'changedExecutableBodies':list(CORE),
    'changes':'fixed NEW-only 30-round diagnostic selection/count/deadline/capture/marker/native-counter guards; product and SQL/shutdown bodies unchanged'}
value['preparationVerification']='Source-only copy/edit/read/hash/metadata generation; no harness import/AST/syntax/test/SQL/native/Docker/resource/network/model execution'
value['retainedNativeGuards'] += ['individual Auth invocation measured<=30000ms with overrun FAIL/no retry',
    'required high/max/oom/oom_kill counters present and zero; optional oom_group_kill zero',
    'only final canonical integrated launcher path may prepare/run']
value['acceptanceScope']={'functionalSafetyPASSIsNotPlateau':True,'full500':False,
    'Unit60Offline90OrWholeMotorTimeVerified':False,'fullMotorReserveVerified':False,
    'comparisonToOld27RPCIsFairRAMComparison':False}
for name in EXTRAS:
    item=pin(HERE/name)
    value['files'].append(item)
    value['metadataAndCodeInputs'].append(item)
# Repeated file pins must agree. No external/binary/source-PGDATA rehash is done here.
seen={}
for item in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:
    old=seen.setdefault(item['path'],item)
    assert old==item,'contradictory repeated source pin'
save('PREPARED.SAFE.json',value)
print(json.dumps({'status':'PREPARED_NOT_RUN','preparedPin':pin(HERE/'PREPARED.SAFE.json'),
    'canonicalIntegration':HERE==CANONICAL,'changedExecutableBodies':list(CORE),
    'unchangedCopiedBodies':len(unchanged),'subjectImportsASTSyntaxTestsResourcesExecuted':False}))
