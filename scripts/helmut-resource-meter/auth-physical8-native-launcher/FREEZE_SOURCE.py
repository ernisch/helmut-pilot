#!/usr/bin/env python3
"""Metadata-only physical8 freeze; no subject imports, tests, Git or resources."""
import difflib
import hashlib
import json
from pathlib import Path
if not __debug__:
    raise RuntimeError('Source freeze requires optimization disabled')
HERE=Path(__file__).resolve().parent
PARENT=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/auth-stability30-native-launcher')
CANONICAL=PARENT.parent/'auth-physical8-native-launcher'
PARENT_SHA='fd846c435352b0280c8607995f3d55a690f72094a0bfde17949cdef04c7375ad'
CONTRACT={'rounds':8,'controlsPerRound':6,'authRPCCount':67,'fullReadCount':10,'writeCount':9,
    'controlReadCount':48,'mutations':8,'restoreCount':1,'boundaries':16,'clientWallSeconds':180,
    'nodeCaptureLimitBytes':1048576,'sqlCaptureLimitBytes':262144,'totalEvidenceCapBytes':8388608,
    'fetchMaxSeconds':20,'sqlMaxSeconds':30,'lockMaxSeconds':1,'authOperationMaxMilliseconds':30000,
    'extraMetadataMaxBytes':65536,'gcRingMaxEvents':16,'spaceCountMax':32,'gcAgeToleranceMilliseconds':250}
CORE=('common.py','run.py','worker.py','control-driver.js')
EXTRAS=('FREEZE_SOURCE.py','GUARD_REVIEW.md','PREDECLARED_DIAGNOSTIC.SAFE.json','auth-physical8.py.TEMPLATE','SOURCE_DELTA.PRIVATE.diff')
def pin(p):
    p=Path(p);assert p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink()
    b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def save(n,v):
    p=HERE/n;assert p.parent==HERE and not p.is_symlink()
    p.write_text(json.dumps(v,indent=2,sort_keys=True)+'\n');p.chmod(0o600)
def rebind(v):
    if isinstance(v,dict):
        if set(v)=={'path','bytes','sha256'}:
            p=Path(v['path'])
            if p.is_relative_to(PARENT) and (HERE/p.relative_to(PARENT)).is_file():return pin(HERE/p.relative_to(PARENT))
        return {k:rebind(x) for k,x in v.items()}
    if isinstance(v,list):return [rebind(x) for x in v]
    return v
parent_pin=pin(PARENT/'PREPARED.SAFE.json');assert parent_pin['sha256']==PARENT_SHA
original=json.loads((PARENT/'PREPARED.SAFE.json').read_text())
assert original['schema']=='helmut-combined-auth-new-stability-prepared/1'
unchanged=[]
for row in json.loads((PARENT/'SCOPE.SAFE.json').read_text())['unchangedFiles']:
    p=Path(row['candidate']['path']);q=HERE/p.relative_to(PARENT);a,b=pin(p),pin(q)
    assert (a['bytes'],a['sha256'])==(b['bytes'],b['sha256']),'unchanged body drift'
    unchanged.append({'parent':a,'candidate':b})
assert len(unchanged)==24
save('SCOPE.SAFE.json',{'schema':'helmut-auth-physical8-scope/1','status':'PREPARED_NOT_RUN',
    'parentPreparedPin':parent_pin,'comparisonScope':'INTEGRATED_NEW_AUTH_PHYSICAL8_DIAGNOSTIC_ONLY',
    'caseRoot':'/workspace/helmut-ram-fix-20261020/auth-physical8-20261021/cases',
    'fixedPhysical8Contract':CONTRACT,'changedExecutableFiles':list(CORE),
    'unchangedBodyCount':24,'unchangedFiles':unchanged,'productSQLShutdownRuntimeBudgetsUnchanged':True,
    'oldPreparedActualsAdoptionsAndSource827aImmutable':True,'sameFinalPreparedFreshLifecycleRequired':True,
    'GC':'natural callbacks plus existing terminal takeRecords only; each reconciles all16 sample brackets; globalring16; overlaps4 per frame',
    'fixedComparison':'all8 endpoints retained; only1-based4vs8 operational GC-stage screen; no substitute pair',
    'attribution':'INCONCLUSIVE while GC delivery/live-object-stage equivalence unknown; never exact RSS-minus-V8 or additive capacity claim',
    'extraSerializedMetadataCapBytes':65536,'newRuntimeEvidenceFiles':0,'hostEntryTemplateNeedsFinalPreparedSHA':True,
    'subjectImportsASTSyntaxTestsGitResourcesOrSourcePGDATAPayloadReads':False,'full500':False,'production':False})
chunks=[]
for name in (*CORE,'README.md','GUARD_REVIEW.md','FREEZE_SOURCE.py'):
    chunks.extend(difflib.unified_diff((PARENT/name).read_text().splitlines(True),(HERE/name).read_text().splitlines(True),
        fromfile='accepted-stability30/'+name,tofile='physical8/'+name))
(HERE/'SOURCE_DELTA.PRIVATE.diff').write_text(''.join(chunks));(HERE/'SOURCE_DELTA.PRIVATE.diff').chmod(0o600)
value=rebind(original)
# No duplicate old baseline/capacity artifact: copied operational files only.
value['files']=[p for p in value['files'] if Path(p['path']).parent==HERE]
value['metadataAndCodeInputs']=[p for p in value['metadataAndCodeInputs']
    if not Path(p['path']).is_relative_to(PARENT) or Path(p['path']).name=='PREPARED.SAFE.json']
# Rebound copied files/upstream still belong to the new HERE and remain in this list.
value['schema']='helmut-auth-physical8-prepared/1'
value['revision']='INTEGRATED_NEW_AUTH_FIXED8_PHYSICAL_V8_RSS_SOURCE_ONLY'
value['comparisonScope']='INTEGRATED_NEW_AUTH_PHYSICAL8_DIAGNOSTIC_ONLY'
value['caseRoot']='/workspace/helmut-ram-fix-20261020/auth-physical8-20261021/cases'
value.pop('stabilityContract',None);value['physical8Contract']=CONTRACT
value['expectedRootOrder']=['lifecycle-only:NONE','control-physical:NEW']
value['explicitModes']=['lifecycle-only','control-physical'];value['explicitVariants']=['NONE','NEW']
value['controlContract'].update({'authRPCCount':67,'controlReadCount':48,'cycles':8,'fullReadCount':10,
    'probeMutations':8,'writeCount':9,'realHTTP':'exact67 selected-U accepted callbacks;67 real sends and complete responses',
    'freshNonceHistoryReceipts':58,'freshControlGraphBindings':48,'freshConfirmedCASRevisions':9,
    'fullLogicalHistoryHashCount':19,'controlTextStringifyObservations':10})
value['cycleObservation'].update({'markers':16,'completeBoundaryFramesArePrimaryTrend':True,
    'physicalV8SequentialBracketFrames':16,'snapshotsAtomic':False,'newMetadataMaxBytes':65536,
    'allGCEventsReconcileAllExistingBrackets':True,'globalNaturalGCEventRing':16,'rawOverlapEventsPerBracketMax':4})
value['setup']['additionalCycleMetricSessionsControlMode']=16
value['sourceDeltaPin']=pin(HERE/'SOURCE_DELTA.PRIVATE.diff');value['scopePin']=pin(HERE/'SCOPE.SAFE.json')
value.pop('capacityEstimatePin',None);value['parentPreparedPin']=parent_pin
value['predeclaredDiagnosticPin']=pin(HERE/'PREDECLARED_DIAGNOSTIC.SAFE.json')
value['hostEntryTemplatePin']=pin(HERE/'auth-physical8.py.TEMPLATE')
value['rootIntegration']={'installedAtCanonicalRoot':HERE==CANONICAL,'canonicalLauncherPath':str(CANONICAL),
    'candidateSourceDirectory':str(HERE),'independentReviewPending':True,'nativeExecuted':False,
    'parentPreparedPin':parent_pin,'unchangedCopiedBodies':24,'changedExecutableBodies':list(CORE),
    'changes':'fixed8-round67RPC with bounded sequential physicalV8/process snapshots and reconciled naturalGC metadata only'}
value['acceptanceScope']={'functionalSafetyPASSIsNotAttributionOrPlateau':True,'all8EndpointsDescriptive':True,
    'fixedOperationalPair':[4,8],'noSubstitutePair':True,'undeliveredGCUnknown':True,'exactRSSMinusPhysicalAttribution':False,
    'full500':False,'Unit60Offline90OrWholeMotorTimeVerified':False,'fullMotorReserveVerified':False}
value['preparationVerification']='Source-only copy/edit/read/hash/metadata generation; no subject import/AST/syntax/tests/Git/resources/network/models/source PGDATA payload reads'
for n in EXTRAS:
    item=pin(HERE/n)
    if item not in value['files']:value['files'].append(item)
    if item not in value['metadataAndCodeInputs']:value['metadataAndCodeInputs'].append(item)
# Scope/prose are local operational inputs, same as the accepted closure.
for item in value['files']:
    if item not in value['metadataAndCodeInputs']:value['metadataAndCodeInputs'].append(item)
if parent_pin not in value['metadataAndCodeInputs']:value['metadataAndCodeInputs'].append(parent_pin)
seen={}
for item in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:
    assert seen.setdefault(item['path'],item)==item,'contradictory source pin'
save('PREPARED.SAFE.json',value)
print(json.dumps({'status':'PREPARED_NOT_RUN','preparedPin':pin(HERE/'PREPARED.SAFE.json'),
    'unchangedCopiedBodies':24,'canonicalIntegration':HERE==CANONICAL,
    'preparationLogicalBytes':sum(p.stat().st_size for p in HERE.rglob('*') if p.is_file()),
    'importsTestsGitResourcesExecuted':False}))
