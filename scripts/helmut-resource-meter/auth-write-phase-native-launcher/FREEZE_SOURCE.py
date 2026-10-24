#!/usr/bin/env python3
"""Metadata/source-only freeze; no subject imports,tests,Git or resources."""
import difflib
import hashlib
import json
import re
from pathlib import Path
if not __debug__:
    raise RuntimeError('Source freeze requires optimization disabled')
HERE=Path(__file__).resolve().parent
PARENT=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/control-inflate-native-launcher')
CANONICAL=PARENT.parent/'auth-write-phase-native-launcher'
PRIVATE=Path('/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/preparation')
CASES='/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/cases'
PARENT_SHA='ba4358e30778ce0366446439f46016b44dadc5565302988289f8a55efcb69549'
INTENT={'path':'/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/ROOT_MEASUREMENT_INTENT_V2.SAFE.json','bytes':6870,'sha256':'0c00a06569ff3e79b7d94920a9e3080138c7722699003251e6ce0cadadd47368'}
PLAN={'path':'/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/ROOT_TWO_CASE_PLAN_V2.SAFE.json','bytes':1112,'sha256':'35fa26ca6e7b33784f6431127cf62c482d3194a96b090fde2e15e18581ae8810'}
INSTRUMENTATION_PREPARED_PIN={'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/PREPARED.SAFE.json', 'bytes': 8905, 'sha256': '721a4680c46f91d3238939f5ffb10e0c8d85bed091b6f6f34cd9749904f4df2b'}
INSTRUMENTATION_CONTRACT_PIN={'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/PROBE_CONTRACT.SAFE.json', 'bytes': 12430, 'sha256': 'eae03eb15298d4aa51d004fd184b9b4de0f5397fff0f781c59e0e751641eb473'}
INSTRUMENTATION_U_PIN={'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/INSTRUMENTED_U.js', 'bytes': 25987, 'sha256': '3b88a424d33e4630dd35411ee6e1660811cc753184fb99822e9ad47ab1332c66'}
INSTRUMENTATION_DRIVER_PIN={'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/control-driver.js', 'bytes': 27664, 'sha256': 'bd044e5aa35efb0a69df8200b01337c8c9ad64b205af099690f20b98095c4c8f'}
CORE=('common.py','run.py','worker.py','control-driver.js')
BODIES=('BODY_SOURCE_PROVENANCE.SAFE.json','COMMON_PARTS.js','INSTALL_NEW_GRAPH.sql','INSTALL_NEW_RENDERER.sql','INSTALL_OLD_GRAPH.sql','INSTALL_OLD_RENDERER.sql','NEW_U.js','OLD_U.PRIVATE.js','ORIGINAL_AUTH_READ_SOURCE.PRIVATE.sql','ORIGINAL_AUTH_STATE_PARTS_SOURCE.PRIVATE.sql','ORIGINAL_PARTS.PRIVATE.js','SHUTDOWN_POLICY.SAFE.json','catalog.sql','cycle-metrics.sql','postgrest_lifecycle.py','small-auth.sql','upstream/SOURCE_EVIDENCE.SAFE.json','upstream/ghc/libraries/base/GHC/TopHandler.hs','upstream/ghc/rts/RtsStartup.c','upstream/postgrest/default.nix','upstream/postgrest/src/PostgREST/App.hs','upstream/postgrest/src/PostgREST/AppState.hs','upstream/postgrest/src/PostgREST/CLI.hs','upstream/postgrest/src/PostgREST/Unix.hs')
def pin(path):
    p=Path(path);assert p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink()
    z=p.read_bytes();return {'path':str(p),'bytes':len(z),'sha256':hashlib.sha256(z).hexdigest()}
def save(name,value):
    p=HERE/name;assert p.parent==HERE and not p.is_symlink()
    p.write_text(json.dumps(value,sort_keys=True,indent=2)+'\n');p.chmod(0o600)
def rebind(value):
    if isinstance(value,dict):
        if set(value)=={'path','bytes','sha256'}:
            p=Path(value['path'])
            if p.is_relative_to(PARENT) and (HERE/p.relative_to(PARENT)).is_file():return pin(HERE/p.relative_to(PARENT))
        return {k:rebind(v) for k,v in value.items()}
    if isinstance(value,list):return [rebind(v) for v in value]
    return value
def blocks(t,js=False):
    pat=r'^(?:async )?function ([A-Za-z_][A-Za-z_0-9]*)\(' if js else r'^def ([A-Za-z_][A-Za-z_0-9]*)\('
    matches=list(re.finditer(pat,t,re.M));out={}
    for i,m in enumerate(matches):
        end=matches[i+1].start() if i+1<len(matches) else (t.index('if __name__',m.start()) if not js and 'if __name__' in t[m.start():] else len(t))
        out[m.group(1)]=t[m.start():end]
    return out
def freeze():
    assert HERE in (PRIVATE,CANONICAL) and HERE.resolve()==HERE,'exact own directory only'
    for item in (INSTRUMENTATION_PREPARED_PIN,INSTRUMENTATION_CONTRACT_PIN,INSTRUMENTATION_U_PIN,INSTRUMENTATION_DRIVER_PIN):
        assert type(item) is dict and set(item)=={'path','bytes','sha256'},'real instrumentation handoff missing; final freeze blocked'
        assert pin(item['path'])==item,'released instrumentation input drift'
    parent=pin(PARENT/'PREPARED.SAFE.json');assert parent['sha256']==PARENT_SHA
    assert pin(INTENT['path'])==INTENT and pin(PLAN['path'])==PLAN
    old=json.loads((PARENT/'PREPARED.SAFE.json').read_text());assert old['schema']=='helmut-control-inflate-prepared/1'
    intent=json.loads(Path(INTENT['path']).read_text());assert intent['schema']=='helmut-auth-write-phase-predeclared-intent/2'
    assert len(intent['probe']['plannedLabels'])==intent['probe']['exactAcceptedFrames']==intent['probe']['maximumFrames']==14
    assert intent['probe']['maximumExtraJSONBytes']==49152
    copied=[]
    for name in BODIES:
        a,b=pin(PARENT/name),pin(HERE/name);assert (a['bytes'],a['sha256'])==(b['bytes'],b['sha256'])
        copied.append({'parent':a,'candidate':b})
    assert len(copied)==24
    for name,item in [('CURRENT_U.js',INSTRUMENTATION_U_PIN),('control-driver.js',INSTRUMENTATION_DRIVER_PIN)]:
        a=pin(HERE/name);assert (a['bytes'],a['sha256'])==(item['bytes'],item['sha256'])
    same=[];changed={};new={};removed={}
    for name in CORE:
        a,b=blocks((PARENT/name).read_text(),name.endswith('.js')),blocks((HERE/name).read_text(),name.endswith('.js'))
        changed[name]=[];new[name]=sorted(set(b)-set(a));removed[name]=sorted(set(a)-set(b))
        for k,v in a.items():
            if k in b and v==b[k]:same.append({'file':name,'function':k,'bytes':len(v.encode()),'sha256':hashlib.sha256(v.encode()).hexdigest()})
            elif k in b:changed[name].append(k)
    for name in ('guard','capture','copy_complete','proc_diagnostic'):
        assert any(x['file']=='worker.py' and x['function']==name for x in same),'native/capture guard body drift'
    def legacy_memory_literal(text):
        start=text.index('function memory(');end=text.index('\nconst ',start)
        return text[start:end]
    legacy_memory_equal=legacy_memory_literal((PARENT/'control-driver.js').read_text())==legacy_memory_literal((HERE/'control-driver.js').read_text())
    save('GUARD_EQUIVALENCE.SAFE.json',{'schema':'helmut-auth-write-phase-source-guard-equivalence/1','status':'SOURCE_ONLY_NOT_RUN',
        'parentCorePins':[pin(PARENT/x) for x in CORE],'preparedCorePins':[pin(HERE/x) for x in CORE],
        'byteEqualFunctionBlocks':same,'changedFunctionBlocks':changed,'newFunctionBlocks':new,'removedFunctionBlocks':removed,
        'noBlanket44BlockEqualityClaim':True,'instrumentationPreparedPin':INSTRUMENTATION_PREPARED_PIN,
        'textSpanBoundaryMethod':'Def/function start through next named function; spans may include intervening top-level declarations. No AST equivalence claimed.',
        'legacyMemoryFunctionLiteralSeparatelyByteEqual':legacy_memory_equal,
        'sourceOnlyNoSubjectImportsASTTestsOrResources':True})
    save('SCOPE.SAFE.json',{'schema':'helmut-auth-write-phase-scope/1','status':'PREPARED_NOT_RUN',
        'comparisonScope':'RESTORE_WRITE_PHASE_ALLOCATION_ONLY','parentPreparedPin':parent,
        'rootMeasurementIntentPin':INTENT,'rootTwoCasePlanPin':PLAN,'caseRoot':CASES,
        'changedExecutableFiles':list(CORE)+['CURRENT_U.js'],'unchangedBodyCount':24,'unchangedFiles':copied,
        'currentOriginal939BaseUnchanged':True,'sameNEWSQLAndCommonParts':True,
        'instrumentationPreparedPin':INSTRUMENTATION_PREPARED_PIN,'phaseProbeContract':intent['probe'],
        'freshIndependentSameFreezeLifecycleBeforeWorkRequiredAtRoot':True,
        'noAutoSequenceRetriesCleanupOr500':True,'noNativeAddonOrGCManipulation':True,
        'subjectImportsASTSyntaxTestsGitResourcesOrSourcePGDATAPayloadReads':False})
    chunks=[]
    for name in (*CORE,'README.md','FREEZE_SOURCE.py','GUARD_REVIEW.md'):
        old_lines=(PARENT/name).read_text().splitlines(True) if (PARENT/name).is_file() else []
        chunks.extend(difflib.unified_diff(old_lines,(HERE/name).read_text().splitlines(True),fromfile='accepted-control-inflate/'+name,tofile='auth-write-phase/'+name))
    chunks.extend(difflib.unified_diff([],(HERE/'auth-write-phase.py.TEMPLATE').read_text().splitlines(True),fromfile='/dev/null',tofile='auth-write-phase/auth-write-phase.py.TEMPLATE'))
    chunks.extend(difflib.unified_diff((PARENT/'BEFORE_U.js').read_text().splitlines(True),(HERE/'CURRENT_U.js').read_text().splitlines(True),fromfile='current939/llm-usage-atomic.js',tofile='diagnostic-only/CURRENT_U.js'))
    (HERE/'SOURCE_DELTA.PRIVATE.diff').write_text(''.join(chunks));(HERE/'SOURCE_DELTA.PRIVATE.diff').chmod(0o600)
    value=rebind(old)
    for key in ('rootComparisonIntentPin','rootFiveCasePlanPin','mechanismEvidencePin'):value.pop(key,None)
    value['schema']='helmut-auth-write-phase-prepared/1';value['revision']='CURRENT_AUTH_WRITE_PHASE_BOUNDED14_SOURCE_ONLY'
    value['comparisonScope']='RESTORE_WRITE_PHASE_ALLOCATION_ONLY';value['caseRoot']=CASES
    value['rootMeasurementIntentPin']=INTENT;value['rootTwoCasePlanPin']=PLAN;value['parentPreparedPin']=parent
    value['instrumentationPreparedPin']=INSTRUMENTATION_PREPARED_PIN
    value['instrumentationContractPin']=INSTRUMENTATION_CONTRACT_PIN
    value['instrumentationReleasedSourcePins']=[INSTRUMENTATION_U_PIN,INSTRUMENTATION_DRIVER_PIN]
    value['phaseProbeContract']=intent['probe']
    value['expectedRootOrder']=['lifecycle-only:NONE','write-phase:CURRENT'];value['explicitModes']=['lifecycle-only','write-phase'];value['explicitVariants']=['NONE','CURRENT'];value['lifecycleBodyVariant']='CURRENT'
    value['variantSources']={'CURRENT':pin(HERE/'CURRENT_U.js')};value['variantParts']={'CURRENT':pin(HERE/'COMMON_PARTS.js')}
    value['variantInstallations']={'CURRENT':{'renderer':pin(HERE/'INSTALL_NEW_RENDERER.sql'),'graph':pin(HERE/'INSTALL_NEW_GRAPH.sql')}}
    value['variantBodies']={'CURRENT':old['variantBodies']['BEFORE']}
    value['sourceOverlays']='Readonly diagnostic-only CURRENT overlay on U939; COMMON_PARTS f300/current NEW SQL; canonical host939/f300 unchanged.'
    value['sourceDeltaPin']=pin(HERE/'SOURCE_DELTA.PRIVATE.diff');value['scopePin']=pin(HERE/'SCOPE.SAFE.json');value['guardEquivalencePin']=pin(HERE/'GUARD_EQUIVALENCE.SAFE.json');value['hostEntryTemplatePin']=pin(HERE/'auth-write-phase.py.TEMPLATE')
    value['setup']['installations']='unchanged current NEW renderer6/graph8 in both modes; identical clone/settings';value['setup']['setupSQLBytesUnchanged']=True
    value['controlContract']['boundedSynchronousPhaseObservationOnly']=True
    value['controlContract']['requestBodyParseObserverUnchanged']=True
    value['cycleObservation']['existingSixHandshakesUnchanged']=True;value['cycleObservation']['additionalRuntimeEvidenceFiles']=0
    value['lifecycleHostMapping']['actualResult']='exact declared CASES/writephase-e1ef7b555c720e139e34cbf5/ACTUAL_RESULT.SAFE.json'
    value['actualCanonicalLoadedBytesCheckedBy']='Host939/f300 separately authenticated; readonly selected diagnostic U plus Parts verified by worker and captured Node.'
    value['postgrestClosure']['helperSourcePin']=pin(HERE/'postgrest_lifecycle.py')
    value['rootIntegration']={'installedAtCanonicalRoot':HERE==CANONICAL,'canonicalLauncherPath':str(CANONICAL),'candidateSourceDirectory':str(HERE),
        'independentReviewPending':True,'nativeExecuted':False,'parentPreparedPin':parent,'unchangedCopiedBodies':24,
        'changedExecutableBodies':list(CORE)+['CURRENT_U.js'],'changes':'Diagnostic-only14 scalar frames, exact2case binding; no product fix or comparative treatment.'}
    value['capacityPlanning']={'twoCaseWorstFloorBytes':10234101760,'newRetainedEvidencePlanningBytes':33554432,'additionalQualifiedReclaimBytes':0,'phaseMetadataMaxBytesPerResult':49152,'phaseMetadataMaxBytesAcrossTwoPersistedCopies':98304,'sameCase4MiBAndCapture256KiB':True,'fullAdmissionAuthorization':False}
    value['measurementClaims'].update({'ABBAExecuted':False,'ramSavingClaimed':False,'plateauClaimed':False,'diagnosticPhaseObservationIsNotAllocatorCause':True,'groupLifetimePeakMayRemainUnlocalizedAfterFrames':True})
    value['preparationVerification']='Local source copy/edit/text/byte/hash and metadata generation only; no subject import/AST/syntax/tests/Git/resources/network/models/source PGDATA payload reads.'
    value['files']=[pin(x) for x in sorted(HERE.iterdir()) if x.is_file() and x.name!='PREPARED.SAFE.json']
    old_extra_paths={old[key]['path'] for key in ('rootComparisonIntentPin','rootFiveCasePlanPin','mechanismEvidencePin') if key in old}
    value['metadataAndCodeInputs']=[x for x in value['metadataAndCodeInputs'] if not Path(x['path']).is_relative_to(PARENT) and x['path'] not in old_extra_paths]
    for x in [*value['files'],parent,INTENT,PLAN,INSTRUMENTATION_PREPARED_PIN,INSTRUMENTATION_CONTRACT_PIN]:
        if x not in value['metadataAndCodeInputs']:value['metadataAndCodeInputs'].append(x)
    seen={}
    for x in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:assert seen.setdefault(x['path'],x)==x
    save('PREPARED.SAFE.json',value)
    rows=[x for x in HERE.rglob('*') if x.is_file()]
    print(json.dumps({'status':'PREPARED_NOT_RUN','preparedPin':pin(HERE/'PREPARED.SAFE.json'),'sourceDeltaPin':pin(HERE/'SOURCE_DELTA.PRIVATE.diff'),
        'unchangedBodies':24,'byteEqualFunctionBlocks':len(same),'canonicalIntegration':HERE==CANONICAL,'files':len(rows),
        'logicalBytes':sum(x.stat().st_size for x in rows),'fileAllocatedBytes':sum(x.stat().st_blocks*512 for x in rows),'subjectImportsTestsResourcesExecuted':False},sort_keys=True))
if __name__=='__main__':
    freeze()
