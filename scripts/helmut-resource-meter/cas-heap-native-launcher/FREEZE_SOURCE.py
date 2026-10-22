#!/usr/bin/env python3
"""Root-run metadata freeze only: no subject imports or resource execution."""
import difflib
import hashlib
import json
import re
from pathlib import Path

if not __debug__:
    raise RuntimeError('Source freeze requires optimization disabled')
HERE=Path(__file__).resolve().parent
PARENT=Path('/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/auth-write-phase-native-launcher')
CANONICAL=PARENT.parent/'cas-heap-native-launcher'
PRIVATE=Path('/workspace/helmut-ram-fix-20261020/cas-heap-20261021/launcher-preparation')
CASES='/workspace/helmut-ram-fix-20261020/cas-heap-20261021/cases'
PARENT_SHA='1868119f68f6d27a67c26281b8a71db7c9cb5b6e7d878405bb16f8492f6f30b3'
INTENT={"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_MEASUREMENT_INTENT.SAFE.json","bytes":8774,"sha256":"34f71d2eaad42706bfabc713ab34b8be6f011ecc7a24d5e0ce7da6c1d4579aa0"}
PLAN={"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/ROOT_TWO_CASE_PLAN.SAFE.json","bytes":820,"sha256":"b4dfe25b96c3ff8160539da1993753ff228598692f66b191068e6fc82f58a833"}
SQL_PREPARED={"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/PREPARED.SAFE.json","bytes":4932,"sha256":"0cd77787b9a37046c6e5fd18ece5b91bf6b4cdf580439c443d4a3f495091ddff"}
SQL_CONTRACT={"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/HEAP_CONTRACT.SAFE.json","bytes":10426,"sha256":"74f37ac8545dc4b692197bd051704be2c42150d4d28bd5c541a4763106ab19aa"}
SQL_SCRIPTS={"overlay":{"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/INSTALL_CAS_HEAP_DIAGNOSTIC.sql","bytes":30524,"sha256":"4df66d34e79749867a582273702d8ecfe6cfd7fa4fefd96008178e9b825a1e2f"},"aclPrepare":{"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/ACL_PREPARE.sql","bytes":15269,"sha256":"2dc6eb8de5194e9b6a13af341f9e08938a70b0f674cefa4a17080b53236d9874"},"aclSelected":{"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/ACL_SELECTED.sql","bytes":6539,"sha256":"1df6e2561436225bfbfb6bcb2692dabe247549c73d7f5c9c585cbdd770b892bd"},"aclRestore":{"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/sql-preparation/ACL_RESTORE.sql","bytes":15100,"sha256":"a7d32b7a1b2ce118f9e2749da07e416e64c2c5957247c4dad02749a654a8e91d"}}
ABI_SOURCE_BINDING={"path":"/workspace/helmut-ram-fix-20261020/cas-heap-20261021/independent-review/official-source/PG_CATALOG_ABI_BINDING.SAFE.json","bytes":974,"sha256":"547032ba7a86dc7d6074ad526f79a254a85fb124922fa2087f6ec671c0cb82fc"}
CORE=('common.py','run.py','worker.py')
BODIES=('BODY_SOURCE_PROVENANCE.SAFE.json','COMMON_PARTS.js','INSTALL_NEW_GRAPH.sql','INSTALL_NEW_RENDERER.sql','INSTALL_OLD_GRAPH.sql','INSTALL_OLD_RENDERER.sql','NEW_U.js','OLD_U.PRIVATE.js','ORIGINAL_AUTH_READ_SOURCE.PRIVATE.sql','ORIGINAL_AUTH_STATE_PARTS_SOURCE.PRIVATE.sql','ORIGINAL_PARTS.PRIVATE.js','SHUTDOWN_POLICY.SAFE.json','cycle-metrics.sql','postgrest_lifecycle.py','small-auth.sql','upstream/SOURCE_EVIDENCE.SAFE.json','upstream/ghc/libraries/base/GHC/TopHandler.hs','upstream/ghc/rts/RtsStartup.c','upstream/postgrest/default.nix','upstream/postgrest/src/PostgREST/App.hs','upstream/postgrest/src/PostgREST/AppState.hs','upstream/postgrest/src/PostgREST/CLI.hs','upstream/postgrest/src/PostgREST/Unix.hs','CURRENT_U.js','control-driver.js')

def pin(path):
    p=Path(path)
    assert p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink()
    raw=p.read_bytes()
    return {'path':str(p),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

def checked(item):
    assert type(item) is dict and set(item)=={'path','bytes','sha256'}
    assert pin(item['path'])==item,'released input drift'
    return json.loads(Path(item['path']).read_text())

def save(name,value):
    p=HERE/name
    assert p.parent==HERE and not p.is_symlink()
    p.write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
    p.chmod(0o600)

def rebind(value):
    if isinstance(value,dict):
        if set(value)=={'path','bytes','sha256'}:
            p=Path(value['path'])
            if p.is_relative_to(PARENT) and (HERE/p.relative_to(PARENT)).is_file():
                return pin(HERE/p.relative_to(PARENT))
        return {k:rebind(v) for k,v in value.items()}
    if isinstance(value,list):
        return [rebind(v) for v in value]
    return value

def blocks(text):
    matches=list(re.finditer(r'^def ([A-Za-z_][A-Za-z_0-9]*)\(',text,re.M))
    result={}
    for i,m in enumerate(matches):
        end=matches[i+1].start() if i+1<len(matches) else (
            text.index('if __name__',m.start()) if 'if __name__' in text[m.start():] else len(text))
        result[m.group(1)]=text[m.start():end]
    return result

def span(text,start,end):
    pos=text.index(start)
    return text[pos:text.index(end,pos)]

def freeze():
    assert HERE in (PRIVATE,CANONICAL) and HERE.resolve()==HERE
    parent=pin(PARENT/'PREPARED.SAFE.json')
    assert parent['sha256']==PARENT_SHA
    old=checked(parent)
    assert old['schema']=='helmut-auth-write-phase-prepared/1'
    intent=checked(INTENT);plan=checked(PLAN)
    source=checked(SQL_PREPARED);contract=checked(SQL_CONTRACT)
    assert checked(ABI_SOURCE_BINDING)['schema']=='helmut-cas-heap-pg17-catalog-source-binding/1'
    assert source['heapContractPin']==SQL_CONTRACT and source['scriptPin']==SQL_SCRIPTS['overlay']
    assert source['SQLPins']==contract['SQLPins']==SQL_SCRIPTS
    assert source['catalogTargets']==contract['catalogTargets']
    assert intent['serverHeapProbe']['contractPin']==SQL_CONTRACT
    assert intent['schema']=='helmut-cas-heap-predeclared-intent/1'
    assert intent['status']=='PREDECLARED_NO_START_ADOPTION'
    assert intent['scope']=='CAS_SERVER_MEMORY_CONTEXTS_ONLY'
    assert intent['orderedSeparatelyAdoptedCases']==['lifecycle-only:NONE','cas-heap:CURRENT']
    assert plan['schema']=='helmut-cas-heap-two-case-plan/1' and plan['intentPin']==INTENT
    assert len(plan['cases'])==2 and plan['cases'][0]['measurementMode']=='lifecycle-only'
    assert plan['cases'][1]['measurementMode']=='cas-heap'
    assert intent['probe']==old['phaseProbeContract']
    common_text=(HERE/'common.py').read_text()
    for key,item in [('EXPECTED_INTENT_PIN',INTENT),('EXPECTED_CASE_PLAN_PIN',PLAN),
                     ('EXPECTED_SQL_PREPARED_PIN',SQL_PREPARED),('EXPECTED_SQL_CONTRACT_PIN',SQL_CONTRACT),
                     ('EXPECTED_SQL_INSTALL_PIN',SQL_SCRIPTS['overlay']),('EXPECTED_ABI_SOURCE_PIN',ABI_SOURCE_BINDING)]:
        match=re.search(r'^'+key+r' = (.+)$',common_text,re.M)
        assert match and json.loads(match.group(1))==item,'runtime/metadata binding drift: '+key
    cases=re.findall(r"'(heap-[a-f0-9]{24})':\('([^']+)','([^']+)'\)",common_text)
    assert cases==[(Path(x['case']).name,x['measurementMode'],x['variant']) for x in plan['cases']]
    assert set(SQL_SCRIPTS)=={'overlay','aclPrepare','aclSelected','aclRestore'}
    for item in SQL_SCRIPTS.values():
        assert pin(item['path'])==item
        own=pin(HERE/Path(item['path']).name)
        assert (own['bytes'],own['sha256'])==(item['bytes'],item['sha256'])
    copied=[]
    for name in BODIES:
        a,b=pin(PARENT/name),pin(HERE/name)
        assert (a['bytes'],a['sha256'])==(b['bytes'],b['sha256'])
        copied.append({'parent':a,'candidate':b})
    assert len(copied)==25
    before_catalog=(PARENT/'catalog.sql').read_text()
    expected_catalog=before_catalog.replace("'statement_timeout','lock_timeout'))",
        "'statement_timeout','lock_timeout','log_error_verbosity','log_min_error_statement'))")
    assert expected_catalog!=before_catalog and (HERE/'catalog.sql').read_text()==expected_catalog
    same=[];changed={};added={};removed={}
    for name in CORE:
        a,b=blocks((PARENT/name).read_text()),blocks((HERE/name).read_text())
        changed[name]=[];added[name]=sorted(set(b)-set(a));removed[name]=sorted(set(a)-set(b))
        for key,value in a.items():
            if key in b and value==b[key]:
                same.append({'file':name,'function':key,'bytes':len(value.encode()),
                             'sha256':hashlib.sha256(value.encode()).hexdigest()})
            elif key in b:
                changed[name].append(key)
    for name in ('guard','capture','copy_complete','proc_diagnostic','rest_logger','rest_eof'):
        assert any(x['file']=='worker.py' and x['function']==name for x in same),'native/capture guard drift'
    a=(PARENT/'worker.py').read_text();b=(HERE/'worker.py').read_text()
    spans=[]
    for role,start,end in (
        ('PostgREST strict close','        if rest is not None:\n','        if node_started:\n'),
        ('external PG SIGINT/wait/EOF','        if pg is not None:\n','        if clean_pg:\n')):
        x,y=span(a,start,end),span(b,start,end)
        assert x==y,role+' changed'
        spans.append({'role':role,'bytes':len(x.encode()),'sha256':hashlib.sha256(x.encode()).hexdigest()})
    save('GUARD_EQUIVALENCE.SAFE.json',{'schema':'helmut-cas-heap-source-guard-equivalence/1',
        'status':'SOURCE_ONLY_NOT_RUN','byteEqualFunctionBlocks':same,'changedFunctionBlocks':changed,
        'newFunctionBlocks':added,'removedFunctionBlocks':removed,'byteEqualClosureSpans':spans,
        'unchangedCopiedFiles':copied,'catalogOnlyTwoLoggingReadbacksAdded':True,
        'textSpanOnlyNoASTSemanticEquivalenceClaim':True})
    save('SCOPE.SAFE.json',{'schema':'helmut-cas-heap-scope/1','status':'PREPARED_NOT_RUN',
        'parentPreparedPin':parent,'rootMeasurementIntentPin':INTENT,'rootTwoCasePlanPin':PLAN,
        'caseRoot':CASES,'comparisonScope':'CAS_SERVER_MEMORY_CONTEXTS_ONLY',
        'serverHeapPreparedPin':SQL_PREPARED,'serverHeapContractPin':SQL_CONTRACT,'serverHeapABIProofPin':ABI_SOURCE_BINDING,
        'sourceScripts':SQL_SCRIPTS,'unchangedCopiedFileCount':25,
        'diagnosticOnlyLoggingSettings':{'log_error_verbosity':'terse','log_min_error_statement':'fatal'},
        'observerMetadataSessionNamespace':'fixed SET search_path TO pg_catalog; guarded actual current_setting/backendPID before each C metadata script',
        'fullViewAndBuiltinOutputABIBeforeAnyGrant':True,
        'temporaryObserverACLIsExplicitExceptionNotGlobalCatalogEquality':True,
        'exact4AcceptedCAS12LogRecords':True,'sourceOnlyNoResourceActions':True,
        'sameFreezeFreshLifecycleRequired':True,'noAutomaticSequenceRetryCleanupOr500':True})
    chunks=[]
    for name in (*CORE,'catalog.sql','README.md','FREEZE_SOURCE.py','GUARD_REVIEW.md'):
        chunks.extend(difflib.unified_diff((PARENT/name).read_text().splitlines(True),
            (HERE/name).read_text().splitlines(True),fromfile='accepted-write-phase/'+name,tofile='cas-heap/'+name))
    for name in ['cas-heap.py.TEMPLATE',*[Path(x['path']).name for x in SQL_SCRIPTS.values()]]:
        chunks.extend(difflib.unified_diff([], (HERE/name).read_text().splitlines(True),
            fromfile='/dev/null',tofile='cas-heap/'+name))
    (HERE/'SOURCE_DELTA.PRIVATE.diff').write_text(''.join(chunks))
    (HERE/'SOURCE_DELTA.PRIVATE.diff').chmod(0o600)
    value=rebind(old)
    value.update({'schema':'helmut-cas-heap-prepared/1','revision':'SINGLE_CURRENT27_SERVER_MEMORY_CONTEXTS_SOURCE_ONLY',
        'comparisonScope':'CAS_SERVER_MEMORY_CONTEXTS_ONLY','caseRoot':CASES,
        'rootMeasurementIntentPin':INTENT,'rootTwoCasePlanPin':PLAN,'parentPreparedPin':parent,
        'serverHeapPreparedPin':SQL_PREPARED,'serverHeapContractPin':SQL_CONTRACT,'serverHeapABIProofPin':ABI_SOURCE_BINDING,
        'serverHeapInstallations':{k:pin(HERE/Path(x['path']).name) for k,x in SQL_SCRIPTS.items()},
        'serverHeapCatalogTargets':source['catalogTargets'],'serverHeapContract':contract,
        'baseVariantBodies':old['variantBodies'],'phaseProbeContract':intent['probe'],
        'expectedRootOrder':['lifecycle-only:NONE','cas-heap:CURRENT'],
        'explicitModes':['lifecycle-only','cas-heap'],'explicitVariants':['NONE','CURRENT'],
        'independentReview':{'status':'PENDING_FINAL_SOURCE_AND_ACTUAL','nativeStarted':False}})
    hashes={x['function']:x['afterProsrcSHA256'] for x in source['catalogTargets']}
    value['variantBodies']={'CURRENT':{'renderer':hashes['helmut_auth_state_expand_local_v1'],
        'graph':old['variantBodies']['CURRENT']['graph'],'cas':hashes['helmut_auth_state_cas_v1']}}
    value['sourceOverlays']='U3b88/driverbd044/Parts f300 byte-equal; C diagnostic body overlay and explicitly temporary observer ACL; no product change.'
    value['sourceDeltaPin']=pin(HERE/'SOURCE_DELTA.PRIVATE.diff')
    value['scopePin']=pin(HERE/'SCOPE.SAFE.json')
    value['guardEquivalencePin']=pin(HERE/'GUARD_EQUIVALENCE.SAFE.json')
    value['hostEntryTemplatePin']=pin(HERE/'cas-heap.py.TEMPLATE')
    value['setup'].update({'GUCsUnchanged':False,'allOtherPGStartupSettingsUnchanged':True,
        'installations':'unchanged NEW base plus pinned diagnostic body/observer ACL and exact restore',
        'setupSQLBytesUnchanged':False,'setupSessionsAndStatementsUnchanged':False,
        'baseNEWRendererAndGraphInstallBytesUnchanged':True,'observerSQLContractPin':SQL_CONTRACT,
        'diagnosticLoggingSettings':{'log_error_verbosity':'terse','log_min_error_statement':'fatal'},
        'observerMetadataSearchPathOnly':'pg_catalog with actual same-session backendPID/readback',
        'setupSQLSessions':10,'setupSQLStatementsMinimum':76,'setupSQLStatementsMaximum':78,
        'observerRestoreSessions':1,'observerRestoreStatementsMinimum':15,'observerRestoreStatementsMaximum':17,
        'temporaryTwoObjectObserverACLReceiptAndExactRestoreRequired':True})
    value['setup'].pop('unchangedSetupSessions',None);value['setup'].pop('unchangedSetupStatements',None)
    value['lifecycleHostMapping']['actualResult']=plan['cases'][0]['case']+'/ACTUAL_RESULT.SAFE.json'
    value['lifecycleHostMapping']['readonlyMountsAndWorkerValidation']='five exact HOST proof pins returned by lifecycle_file_pins; result/worker/stop/server-heap/observer-ACL'
    value['rootIntegration']={'installedAtCanonicalRoot':HERE==CANONICAL,
        'canonicalLauncherPath':str(CANONICAL),'candidateSourceDirectory':str(HERE),
        'independentReviewPending':True,'nativeExecuted':False,'parentPreparedPin':parent,
        'changes':'fresh2cases; C SQL/temporary observer ACL/LOG proof; unchanged Node and external stop lifetime'}
    value['measurementClaims'].update({'ramSavingClaimed':False,'plateauClaimed':False,
        'backendContextCountersAreRSS':False,'exactPeakOwnerClaimed':False,'projectionON':False})
    value['capacityPlanning'].update({'sameCase4MiBAndCapture256KiB':True,
        'serverDiagnosticJSONMaxBytes':24576,'serverParsedEvidenceMaxBytes':32768})
    value['preparationVerification']='Source copy/edit/text/hash metadata only; no subject imports/AST/tests/CLI/native/Git/resources/PGDATA payload reads by preparer.'
    excluded={old[key]['path'] for key in ('rootMeasurementIntentPin','rootTwoCasePlanPin') if key in old}
    value['metadataAndCodeInputs']=[x for x in value['metadataAndCodeInputs']
        if not Path(x['path']).is_relative_to(PARENT) and x['path'] not in excluded]
    value['files']=[pin(x) for x in sorted(HERE.iterdir()) if x.is_file() and x.name!='PREPARED.SAFE.json']
    for item in [*value['files'],parent,INTENT,PLAN,SQL_PREPARED,SQL_CONTRACT,
                 contract['logContractPin'],contract['methodReviewPin'],ABI_SOURCE_BINDING,*SQL_SCRIPTS.values()]:
        if item not in value['metadataAndCodeInputs']:
            value['metadataAndCodeInputs'].append(item)
    seen={}
    for item in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:
        assert seen.setdefault(item['path'],item)==item
    save('PREPARED.SAFE.json',value)
    print(json.dumps({'status':'PREPARED_NOT_RUN','preparedPin':pin(HERE/'PREPARED.SAFE.json'),
        'sourceDeltaPin':pin(HERE/'SOURCE_DELTA.PRIVATE.diff'),'unchangedFiles':25,
        'subjectImportsTestsResourcesExecuted':False},sort_keys=True))

if __name__=='__main__':
    freeze()
