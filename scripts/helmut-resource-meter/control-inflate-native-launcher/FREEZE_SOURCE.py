#!/usr/bin/env python3
"""Local source/metadata freeze only; no subject imports,tests,Git or resources."""
import difflib
import hashlib
import json
import re
from pathlib import Path
if not __debug__:
    raise RuntimeError('Source freeze requires optimization disabled')
HERE=Path(__file__).resolve().parent
PARENT=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/combined-auth-baseline-native-launcher')
CANONICAL=PARENT.parent/'control-inflate-native-launcher'
PRIVATE=Path('/workspace/helmut-ram-fix-20261020/control-inflate-20261021/preparation')
CASES='/workspace/helmut-ram-fix-20261020/control-inflate-20261021/cases'
PARENT_SHA='7c32a0ced6e4cd0e50e9d5b716ea4a5d601dfb21204113b40cb832429a637266'
INTENT={'path':'/workspace/helmut-ram-fix-20261020/control-inflate-20261021/ROOT_COMPARISON_INTENT.SAFE.json','bytes':5192,'sha256':'e0d224b3620cc10de99c35c5e98780dc4762c718ea310fe08ea3438c4f3074aa'}
PLAN={'path':'/workspace/helmut-ram-fix-20261020/control-inflate-20261021/ROOT_FIVE_CASE_PLAN.SAFE.json','bytes':1575,'sha256':'13b65a073b1c5b25ef850491dc94f6c84e4bea7a6ae6cd326c299f76f2d0d0c1'}
BEFORE_SHA='93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b'
AFTER_SHA='40d7e584e7856ea893a491d0598ca55b071fc9a07d2dfeb72d55cd10b14b9d1a'
CORE=('common.py','run.py','worker.py','control-driver.js')
BODIES=('BODY_SOURCE_PROVENANCE.SAFE.json','COMMON_PARTS.js','INSTALL_NEW_GRAPH.sql','INSTALL_NEW_RENDERER.sql','INSTALL_OLD_GRAPH.sql','INSTALL_OLD_RENDERER.sql','NEW_U.js','OLD_U.PRIVATE.js','ORIGINAL_AUTH_READ_SOURCE.PRIVATE.sql','ORIGINAL_AUTH_STATE_PARTS_SOURCE.PRIVATE.sql','ORIGINAL_PARTS.PRIVATE.js','SHUTDOWN_POLICY.SAFE.json','catalog.sql','cycle-metrics.sql','postgrest_lifecycle.py','small-auth.sql','upstream/SOURCE_EVIDENCE.SAFE.json','upstream/ghc/libraries/base/GHC/TopHandler.hs','upstream/ghc/rts/RtsStartup.c','upstream/postgrest/default.nix','upstream/postgrest/src/PostgREST/App.hs','upstream/postgrest/src/PostgREST/AppState.hs','upstream/postgrest/src/PostgREST/CLI.hs','upstream/postgrest/src/PostgREST/Unix.hs')
def pin(path):
    p=Path(path)
    assert p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink()
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
    assert HERE in (PRIVATE,CANONICAL) and HERE.resolve()==HERE,'exact own preparation or canonical integration only'
    parent_pin=pin(PARENT/'PREPARED.SAFE.json');assert parent_pin['sha256']==PARENT_SHA
    assert pin(INTENT['path'])==INTENT and pin(PLAN['path'])==PLAN
    old=json.loads((PARENT/'PREPARED.SAFE.json').read_text());assert old['schema']=='helmut-combined-auth-baseline-prepared/1'
    unchanged=[]
    for name in BODIES:
        a,b=pin(PARENT/name),pin(HERE/name)
        assert (a['bytes'],a['sha256'])==(b['bytes'],b['sha256']),'protected body drift'
        unchanged.append({'parent':a,'candidate':b})
    assert len(unchanged)==24
    assert pin(HERE/'BEFORE_U.js')['sha256']==BEFORE_SHA and pin(HERE/'AFTER_U.js')['sha256']==AFTER_SHA
    same=[];changed={}
    for name in CORE:
        a,b=blocks((PARENT/name).read_text(),name.endswith('.js')),blocks((HERE/name).read_text(),name.endswith('.js'))
        assert set(a)==set(b);changed[name]=[]
        for k,v in a.items():
            if v==b[k]:same.append({'file':name,'function':k,'bytes':len(v.encode()),'sha256':hashlib.sha256(v.encode()).hexdigest()})
            else:changed[name].append(k)
    for name in ('installObserver','request','verifyLogical','invoke','memory','validateProof'):
        assert any(x['file']=='control-driver.js' and x['function']==name for x in same)
    for name in ('guard','capture','copy_complete','proc_diagnostic'):
        assert any(x['file']=='worker.py' and x['function']==name for x in same)
    save('GUARD_EQUIVALENCE.SAFE.json',{'schema':'helmut-control-inflate-source-guard-equivalence/1','status':'SOURCE_ONLY_NOT_RUN',
        'parentCorePins':[pin(PARENT/x) for x in CORE],'preparedCorePins':[pin(HERE/x) for x in CORE],
        'byteEqualFunctionBlocks':same,'changedFunctionBlocks':changed,
        'all27RPCCountsCapsNativeOriginalCloneRestorationAndRawProofRetentionPreserved':True,
        'OLDVariantPerformanceAssertionsPresentInParentDriver':False,
        'onlyDriverChanges':'Header,receipt/marker schema,receipt filename and BEFORE/AFTER labels. Probe/request/invoke/hashes/observer/naturalGC unchanged; boundary algorithm unchanged with new marker schema.',
        'sourceOnlyNoSubjectImportsASTTestsOrResources':True})
    save('SCOPE.SAFE.json',{'schema':'helmut-control-inflate-scope/1','status':'PREPARED_NOT_RUN',
        'comparisonScope':'CONTROL_INFLATE_SINGLE_BUFFER_ONLY','parentPreparedPin':parent_pin,
        'rootComparisonIntentPin':INTENT,'rootFiveCasePlanPin':PLAN,'caseRoot':CASES,
        'changedExecutableFiles':list(CORE),'unchangedBodyCount':24,'unchangedFiles':unchanged,
        'sameNEWSQLAndCommonPartsBothArms':True,'originalV11ComparisonClaim':False,
        'sameFreezeZeroAuthLifecycleRequiredBeforeEveryWorkAdoption':True,
        'noAutoSequenceRetriesCleanupOr500':True,'noNativeAddonOrObserverExpansion':True,
        'subjectImportsASTSyntaxTestsGitResourcesOrSourcePGDATAPayloadReads':False})
    chunks=[]
    for name in (*CORE,'README.md'):
        chunks.extend(difflib.unified_diff((PARENT/name).read_text().splitlines(True),(HERE/name).read_text().splitlines(True),
            fromfile='accepted-combined-auth27/'+name,tofile='control-inflate/'+name))
    for name in ('FREEZE_SOURCE.py','GUARD_REVIEW.md','control-inflate.py.TEMPLATE'):
        chunks.extend(difflib.unified_diff([],(HERE/name).read_text().splitlines(True),fromfile='/dev/null',tofile='control-inflate/'+name))
    chunks.extend(difflib.unified_diff((HERE/'BEFORE_U.js').read_text().splitlines(True),(HERE/'AFTER_U.js').read_text().splitlines(True),
        fromfile='control-inflate/BEFORE_U.js',tofile='control-inflate/AFTER_U.js'))
    (HERE/'SOURCE_DELTA.PRIVATE.diff').write_text(''.join(chunks));(HERE/'SOURCE_DELTA.PRIVATE.diff').chmod(0o600)
    value=rebind(old)
    value.pop('preservedV9',None);value.pop('candidatePreparedPin',None);value.pop('candidateCommit',None)
    value['historicalOriginalCommitProvenance']=value.pop('originalCommit')
    value['schema']='helmut-control-inflate-prepared/1'
    value['revision']='INTEGRATED_CONTROL_INFLATE_SINGLE_BUFFER_SOURCE_ONLY'
    value['comparisonScope']='CONTROL_INFLATE_SINGLE_BUFFER_ONLY';value['caseRoot']=CASES
    value['rootComparisonIntentPin']=INTENT;value['rootFiveCasePlanPin']=PLAN;value['parentPreparedPin']=parent_pin
    value['expectedRootOrder']=['lifecycle-only:NONE','control-inflate:BEFORE','control-inflate:AFTER','control-inflate:AFTER','control-inflate:BEFORE']
    value['explicitModes']=['lifecycle-only','control-inflate'];value['explicitVariants']=['NONE','BEFORE','AFTER'];value['lifecycleBodyVariant']='BEFORE'
    value['variantSources']={'BEFORE':pin(HERE/'BEFORE_U.js'),'AFTER':pin(HERE/'AFTER_U.js')}
    value['variantParts']={arm:pin(HERE/'COMMON_PARTS.js') for arm in ('BEFORE','AFTER')}
    value['variantInstallations']={arm:{'renderer':pin(HERE/'INSTALL_NEW_RENDERER.sql'),'graph':pin(HERE/'INSTALL_NEW_GRAPH.sql')} for arm in ('BEFORE','AFTER')}
    value['variantBodies']={arm:old['variantBodies']['NEW'] for arm in ('BEFORE','AFTER')}
    value['sourceOverlays']='Readonly BEFORE U939 or AFTER U40d7; identical COMMON_PARTS f300 and NEW SQL; host R939/f300 checked separately.'
    value['sourceDeltaPin']=pin(HERE/'SOURCE_DELTA.PRIVATE.diff');value['scopePin']=pin(HERE/'SCOPE.SAFE.json')
    value['guardEquivalencePin']=pin(HERE/'GUARD_EQUIVALENCE.SAFE.json');value['hostEntryTemplatePin']=pin(HERE/'control-inflate.py.TEMPLATE')
    value['mechanismEvidencePin']=json.loads(Path(INTENT['path']).read_text())['actualEmbeddedSourcePin']
    value['setup']['installations']='identical NEW renderer6/graph8 in both integrated U arms; same clone/settings'
    value['setup']['setupSQLBytesUnchanged']=True
    value['lifecycleHostMapping']['actualResult']='exact declared first CASES/inflate-ecda0cd673313ed20dfd14c8/ACTUAL_RESULT.SAFE.json'
    value['actualCanonicalLoadedBytesCheckedBy']='Same selected frozen U/Parts bytes verified at canonical readonly overlays by worker and actual Node; common Parts and SQL identical.'
    value['postgrestClosure']['helperSourcePin']=pin(HERE/'postgrest_lifecycle.py')
    value['rootIntegration']={'installedAtCanonicalRoot':HERE==CANONICAL,'canonicalLauncherPath':str(CANONICAL),
        'candidateSourceDirectory':str(HERE),'independentReviewPending':True,'nativeExecuted':False,
        'parentPreparedPin':parent_pin,'unchangedCopiedBodies':24,'changedExecutableBodies':list(CORE),
        'changes':'Only integrated U buffer option differs; binding/assertion/schema changes preserve original27RPC workload and all caps.'}
    value['capacityPlanning']={'fiveWorstCaseFloorBytes':12700352512,'newRetainedEvidencePlanningBytes':67108864,
        'additionalQualifiedReclaimBytes':0,'fullAdmissionAuthorization':False,
        'actualPreparationAllocation':'Printed after this local freeze; never a reservation or RAM saving.'}
    value['preparationVerification']='Local source copy/edit/text/byte/hash and metadata generation only; no subject import/AST/syntax/tests/Git/resources/network/models/source PGDATA payload reads.'
    value['files']=[pin(x) for x in sorted(HERE.iterdir()) if x.is_file() and x.name!='PREPARED.SAFE.json']
    value['metadataAndCodeInputs']=[x for x in value['metadataAndCodeInputs'] if not Path(x['path']).is_relative_to(PARENT)]
    for x in [*value['files'],parent_pin,INTENT,PLAN,value['mechanismEvidencePin']]:
        if x not in value['metadataAndCodeInputs']:value['metadataAndCodeInputs'].append(x)
    seen={}
    for x in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:
        assert seen.setdefault(x['path'],x)==x,'contradictory source pin'
    save('PREPARED.SAFE.json',value)
    allfiles=[x for x in HERE.rglob('*') if x.is_file()]
    print(json.dumps({'status':'PREPARED_NOT_RUN','preparedPin':pin(HERE/'PREPARED.SAFE.json'),
        'sourceDeltaPin':pin(HERE/'SOURCE_DELTA.PRIVATE.diff'),'unchangedCopiedBodies':24,
        'byteEqualFunctionBlocks':len(same),'canonicalIntegration':HERE==CANONICAL,
        'preparationFiles':len(allfiles),'preparationLogicalBytes':sum(x.stat().st_size for x in allfiles),
        'preparationAllocatedBytes':sum(x.stat().st_blocks*512 for x in allfiles),
        'subjectImportsTestsGitResourcesExecuted':False},sort_keys=True))
if __name__=='__main__':
    freeze()
