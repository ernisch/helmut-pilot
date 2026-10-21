"""Write-phase diagnostic only: same-freeze zero-Auth lifecycle and one current27RPC case."""
import hashlib
import json
import os
import re
import stat
import sys
import time
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = Path('/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/cases')
REPO = Path('/workspace/helmut-cpu-epoch-20261015')
BIN = REPO/'scripts/helmut-resource-meter'
D = Path('/workspace/helmut-ram-fix-20261020/auth-working-set-20261020')
OLD = Path('/workspace/helmut-ram-fix-20261020/next-single-go-20261020')
ARCH = Path('/workspace/helmut-ram-fix-20261020/architecture-correction-20261020')
SOURCE = OLD/'postrun-canonical-readback/PGDATA_COPY_NOT_AN_ORIGINAL'
RUNTIME = ARCH/'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'
BINDINGS = ARCH/'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json'
PYTHON = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python')
COMPAT = OLD/'dio-component-python-compat-runtime'
DATABASE = 'helmut_resource_fixture_20261020_3b3bf56650bc'
SOURCE_SHA = '827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396'
OLD_RENDERER = 'b3157fffe12d3bc8f5b2c1d2443b97e44830082a3c6aca73124f60b260345a6a'
NEW_RENDERER = 'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32'
OLD_GRAPH = '1644ff690fb4ae70ab2511b3ccf41353e622595bc9fed2d61005c4f655171af0'
NEW_GRAPH = '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0'
NODE_ROOT = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node')
POSTGREST = Path('/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned')
POSTGREST_CONFIG = ('db-uri = "postgresql://postgres@localhost/'+DATABASE+'?host=/ram/socket"\n'
    'db-anon-role = "service_role"\ndb-schemas = "public"\n'
    'server-host = "127.0.0.1"\nserver-port = 38419\ndb-pool = 2\nlog-level = "error"\n')
MIB = 1024**2
FLOOR = 8*1024**3
OUTPUT_LIMIT = 4*MIB
QUERY_LIMIT = 256*1024
DISK_LIMIT = 768*MIB
ADMISSION = DISK_LIMIT+16*MIB
RAM_LIMIT = 256*MIB
WORK_SECONDS = 300
TOTAL_SECONDS = 360
LIMITS = {'memory.max':'1547997184','memory.high':'1399996416','memory.swap.max':'0'}

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def uuid4(value):
    return type(value) is str and re.fullmatch(
        '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value)

CANONICAL_U = REPO/'lib/helmut/llm-usage-atomic.js'
CANONICAL_PARTS = REPO/'lib/helmut/auth-state-parts.js'
EXPECTED_INTENT_PIN = {'path':'/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/ROOT_MEASUREMENT_INTENT_V2.SAFE.json','bytes':6870,'sha256':'0c00a06569ff3e79b7d94920a9e3080138c7722699003251e6ce0cadadd47368'}
EXPECTED_CASE_PLAN_PIN = {'path':'/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/ROOT_TWO_CASE_PLAN_V2.SAFE.json','bytes':1112,'sha256':'35fa26ca6e7b33784f6431127cf62c482d3194a96b090fde2e15e18581ae8810'}
EXPECTED_INSTRUMENTATION_PREPARED_PIN = {'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/PREPARED.SAFE.json', 'bytes': 8905, 'sha256': '721a4680c46f91d3238939f5ffb10e0c8d85bed091b6f6f34cd9749904f4df2b'}
EXPECTED_DIAGNOSTIC_U_SHA = '3b88a424d33e4630dd35411ee6e1660811cc753184fb99822e9ad47ab1332c66'
EXPECTED_INSTRUMENTATION_CONTRACT_PIN = {'path': '/workspace/helmut-ram-fix-20261020/auth-write-phase-20261021/instrumentation-preparation/PROBE_CONTRACT.SAFE.json', 'bytes': 12430, 'sha256': 'eae03eb15298d4aa51d004fd184b9b4de0f5397fff0f781c59e0e751641eb473'}
CASE_SPECS = {
    'writephase-e1ef7b555c720e139e34cbf5':('lifecycle-only','NONE'),
    'writephase-cb6f5b59288add4d64037fb3':('write-phase','CURRENT')}
PHASE_LABELS = ['driver.restore.beforeU', 'U.beforeSnapshotCapture', 'U.afterSnapshotCapture', 'U.afterPartsBuild', 'driver.request.afterSerializationBeforeHTTP', 'driver.request.afterBodyObserverBeforeHTTP', 'driver.request.afterRPCJSONParsed', 'U.beforeAttach', 'U.afterAttach', 'U.beforeReturn', 'driver.afterU.beforeVerifyLogical', 'driver.afterVerifyLogical', 'driver.beforeFinalRead', 'driver.afterFinalRead']
PHASE_MAX_FRAMES = 14
PHASE_MAX_EXTRA_JSON_BYTES = 49152

def selected_measurement(closure, mode, variant=None):
    require(mode in ('lifecycle-only','write-phase'),'exactly two separately adopted modes')
    require(type(EXPECTED_INSTRUMENTATION_PREPARED_PIN) is dict and
            type(EXPECTED_DIAGNOSTIC_U_SHA) is str and
            re.fullmatch('[a-f0-9]{64}',EXPECTED_DIAGNOSTIC_U_SHA),
            'instrumentation source handoff missing; no runnable final freeze')
    require(closure['rootMeasurementIntentPin']==EXPECTED_INTENT_PIN and
            EXPECTED_INTENT_PIN in closure['metadataAndCodeInputs'] and
            closure['rootTwoCasePlanPin']==EXPECTED_CASE_PLAN_PIN and
            EXPECTED_CASE_PLAN_PIN in closure['metadataAndCodeInputs'], 'exact fresh measurement intent and two-case plan')
    intent=read(EXPECTED_INTENT_PIN);plan=read(EXPECTED_CASE_PLAN_PIN)
    require(intent['schema']=='helmut-auth-write-phase-predeclared-intent/2' and
            intent['status']=='PREDECLARED_NO_START_ADOPTION' and intent['scope']=='RESTORE_WRITE_PHASE_ALLOCATION_ONLY' and
            intent['orderedSeparatelyAdoptedCases']==closure['expectedRootOrder']==[
                'lifecycle-only:NONE','write-phase:CURRENT'] and
            intent['sameFreezeIndependentlyAcceptedLifecycleRequired'] is True and
            intent['noAutomaticSequenceRetriesOrExtraCases'] is True and
            intent['workload']=={'rounds':3,'authRPCs':27,'fullReads':5,'confirmedCAS':4,
                'controls':18,'mutations':3,'restoreCount':1,'boundaries':6,'historyRows':6000} and
            intent['probe']['plannedLabels']==PHASE_LABELS and
            intent['probe']['maximumFrames']==PHASE_MAX_FRAMES and
            intent['probe']['exactAcceptedFrames']==PHASE_MAX_FRAMES and
            intent['probe']['maximumExtraJSONBytes']==PHASE_MAX_EXTRA_JSON_BYTES and
            closure['phaseProbeContract']==intent['probe'], 'fixed one-case workload and fourteen-label bounded phase probe')
    require(plan['schema']=='helmut-auth-write-phase-two-case-plan/2' and
            plan['intentPin']==EXPECTED_INTENT_PIN and plan['noAutomaticStartOrSequence'] is True and
            plan['full500'] is False and plan['production'] is False and
            plan['cases']==[{'index':i,'case':str(CASES/name),'measurementMode':pair[0],
                'variant':pair[1],'authRPCs':0 if i==0 else 27}
                for i,(name,pair) in enumerate(CASE_SPECS.items())], 'exact two fresh cases/mode/variant only')
    require(closure['comparisonScope']=='RESTORE_WRITE_PHASE_ALLOCATION_ONLY' and
            closure['lifecycleBodyVariant']=='CURRENT' and
            closure['instrumentationPreparedPin']==EXPECTED_INSTRUMENTATION_PREPARED_PIN and
            EXPECTED_INSTRUMENTATION_PREPARED_PIN in closure['metadataAndCodeInputs'],
            'exact diagnostic source binding; no product integration or comparator')
    preparation=read(EXPECTED_INSTRUMENTATION_PREPARED_PIN)
    require(closure['instrumentationContractPin']==EXPECTED_INSTRUMENTATION_CONTRACT_PIN and
            EXPECTED_INSTRUMENTATION_CONTRACT_PIN in closure['metadataAndCodeInputs'] and
            preparation['schema']=='helmut-auth-write-phase-instrumentation-prepared/1' and
            preparation['status']=='PREPARED_SOURCE_ONLY_HANDOFF_READ_ONLY' and
            preparation['sourceContractPin']==EXPECTED_INSTRUMENTATION_CONTRACT_PIN,
            'exact released diagnostic source/contract metadata')
    contract=read(EXPECTED_INSTRUMENTATION_CONTRACT_PIN)
    require(contract['schema']=='helmut-auth-write-phase-probe-source-contract/1' and
            contract['overlayPin']['sha256']==EXPECTED_DIAGNOSTIC_U_SHA and
            contract['driverPin']['sha256']=='bd044e5aa35efb0a69df8200b01337c8c9ad64b205af099690f20b98095c4c8f' and
            contract['requiredPhaseConfiguration']['plannedLabels']==PHASE_LABELS,
            'exact diagnostic overlay/driver/fourteen-label contract')
    require(closure['variantBodies']=={'CURRENT':{'renderer':NEW_RENDERER,'graph':NEW_GRAPH}}, 'identical current NEW SQL body pair')
    for key in ('engineSourcePin','rendererSourcePin','nodeBinaryPin','postgrestBinaryPin'):
        require(closure[key] in closure['metadataAndCodeInputs'],'selected input outside adopted closure')
    require(closure['engineSourcePin']['sha256']=='e7530ffd737179fb261d8a680ade77262d88e4685b3d8d90f2a92ecb5fad83c5'
            and closure['nodeBinaryPin']['path']==str(NODE_ROOT/'bin/node')
            and closure['postgrestBinaryPin']['path']==str(POSTGREST)
            and closure['postgrestConfigSHA256']==hashlib.sha256(POSTGREST_CONFIG.encode()).hexdigest(),
            'exact original runtime/current reviewed SQL source/config contract')
    require(closure['postgrestShutdownPolicyPin'] in closure['metadataAndCodeInputs'] and
            closure['upstreamEvidencePin'] in closure['metadataAndCodeInputs'] and
            read(closure['postgrestShutdownPolicyPin'])==closure['postgrestShutdownPolicy'] and
            closure['upstreamEvidencePin']['sha256']==closure['postgrestShutdownPolicy']['upstreamEvidenceSHA256'],
            'exact local shutdown policy/upstream evidence pins')
    variant = 'NONE' if mode=='lifecycle-only' and variant is None else variant
    require((mode=='lifecycle-only' and variant=='NONE') or
            (mode=='write-phase' and variant=='CURRENT'),'exact separately adopted current diagnostic variant')
    require(not any(x['path'] in (str(CANONICAL_U),str(CANONICAL_PARTS)) for x in closure['metadataAndCodeInputs']),
            'canonical overlay destinations cannot carry host-byte expectations')
    require(len(closure['hostOnlyInputPins'])==2 and
            {x['path']:x['sha256'] for x in closure['hostOnlyInputPins']}=={
                str(CANONICAL_U):'93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b',
                str(CANONICAL_PARTS):'f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63'},
            'authenticate unchanged current Root939/Parts host sources separately')
    require(set(closure['variantSources'])==set(closure['variantParts'])==set(closure['variantInstallations'])=={'CURRENT'} and
            closure['variantSources']['CURRENT']['sha256']==EXPECTED_DIAGNOSTIC_U_SHA and
            Path(closure['variantSources']['CURRENT']['path']).name=='CURRENT_U.js' and
            closure['variantParts']['CURRENT']['sha256']=='f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63',
            'one exact diagnostic overlay over current U; no failedinflate candidate')
    installs=closure['variantInstallations']['CURRENT']
    require(set(installs)=={'renderer','graph'},'exact same two current SQL installations')
    for kind in ('renderer','graph'):
        item=installs[kind]
        expected_sql={'renderer':'81e665a5c524bab6e5b19f6322f3192bb07a3cba6c875b1da9da3f6118cc8a72',
                      'graph':'d10d920e4a4d07098f29e62a595021d22e65e0db96a7676ef1b280a7cc9629fa'}
        require(item in closure['files'] and item in closure['metadataAndCodeInputs'] and
                Path(item['path']).name=='INSTALL_NEW_'+kind.upper()+'.sql' and item['sha256']==expected_sql[kind],
                'exact unchanged current NEW SQL wrapper')
    require(closure['variantSources']['CURRENT'] in closure['files'] and
            closure['variantSources']['CURRENT'] in closure['metadataAndCodeInputs'] and
            closure['variantParts']['CURRENT'] in closure['metadataAndCodeInputs'],'selected overlays outside closure')
    return {'mode':mode,'variant':variant,'bodyVariant':'CURRENT',
        'comparisonScope':'RESTORE_WRITE_PHASE_ALLOCATION_ONLY',
        'uOverlayPin':closure['variantSources']['CURRENT'],'partsOverlayPin':closure['variantParts']['CURRENT'],
        'adoptionSchema':'helmut-auth-write-phase-'+mode+'-root-adoption/1',
        'action':('ROOT START AUTH WRITE PHASE CURRENT BODY LIFECYCLE ONLY' if mode=='lifecycle-only' else
                  'ROOT START AUTH WRITE PHASE SINGLE 27 RPC DIAGNOSTIC ONLY'),
        'rendererInstallSQLPin':installs['renderer'],'installSQLPin':installs['graph'],
        'expectedRendererBodySHA256':NEW_RENDERER,'expectedBodySHA256':NEW_GRAPH,
        'authRPCCount':0 if mode=='lifecycle-only' else 27,'nodeLaunchCount':0 if mode=='lifecycle-only' else 1,
        'postgrestConfigSHA256':closure['postgrestConfigSHA256'],
        'postgrestShutdownPolicy':closure['postgrestShutdownPolicy'],'upstreamEvidencePin':closure['upstreamEvidencePin']}



def phase_peak_status(summary, final_peak):
    """Pure final-lifetime comparison; a later valid peak is unlocalized, not FAIL."""
    require(type(summary) is dict and type(summary['maximumFramePeakAfterBytes']) is int and
            0<=summary['maximumFramePeakAfterBytes']<=18446744073709551615 and
            type(final_peak) is int and summary['maximumFramePeakAfterBytes']<=final_peak<=18446744073709551615,
            'invalid or regressed final native lifetime peak')
    return ('UNLOCALIZED_OUTSIDE_OR_AFTER_FRAMES' if final_peak>summary['maximumFramePeakAfterBytes'] else
            'BOUNDED_FRAME_INCREMENTS_ONLY')


def lifecycle_proof(item, frozen):
    # This exact HOST case path also exists readonly at the same absolute path
    # in the new worker. Never use current /bench or a global path alias.
    require(type(item) is dict and set(item)=={'path','bytes','sha256'},'exact actual result pin shape')
    actual=Path(item['path'])
    case=actual.parent
    require(actual.is_absolute() and actual.resolve()==actual and actual.name=='ACTUAL_RESULT.SAFE.json'
            and case.parent==CASES and case.name==next(iter(CASE_SPECS))
            and re.fullmatch('writephase-[a-f0-9]{24}',case.name),
            'lifecycle result must be inside the exact adopted host case')
    value=read(item)
    require(value['schema']=='helmut-auth-write-phase-result/1' and value['status']=='PASS'
            and value['preparedPin']==frozen and value['measurementMode']=='lifecycle-only'
            and value['authRPCCount']==0 and value['nodeStarted'] is False
            and value['sourceManifestSHA256']==SOURCE_SHA,
            'actual matching lifecycle PASS required before any control start')
    kernel=value['kernelThroughLastOwnedExit']
    require(kernel['fullLastProcessExitCovered'] and not kernel['populatedSubgroups']
            and not kernel['memoryEvents'].get('oom',0) and not kernel['memoryEvents'].get('oom_kill',0)
            and value['nativeBudgetAfterLastExit']['setupHelpersExited']
            and value['actualContainerClosure']['exitCode']==0
            and value['actualContainerClosure']['allOwnedWorkloadExited'], 'lifecycle native last exit')
    worker_pin=value['workerResultPin']
    require(worker_pin['path']==str(case/'WORKER_RESULT.SAFE.json'),'exact same-case worker result pin')
    worker=read(worker_pin)
    stored=worker['postgrestStopReceiptPin']
    require(type(stored) is dict and set(stored)=={'path','bytes','sha256'}
            and stored['path']=='/bench/POSTGREST_STOP.SAFE.json',
            'only the exact stored worker stop-receipt basename may translate')
    host_stop={**stored,'path':str(case/'POSTGREST_STOP.SAFE.json')}
    stop=read(host_stop) # Same expected bytes/SHA; only exact case-bound path differs.
    closure=read(frozen)
    expected_selection=selected_measurement(closure,'lifecycle-only')
    require(value['selection']==expected_selection and worker['selection']==expected_selection,
            'actual result and worker bind the same frozen lifecycle policy/selection')
    require(stop['pins']['binary']==closure['postgrestBinaryPin']
            and stop['pins']['config']['path']=='/ram/postgrest.conf'
            and stop['pins']['config']['sha256']==closure['postgrestConfigSHA256'],
            'actual lifecycle binary/config pins')
    signed=stop['returnCode']
    signal_status=bool(type(signed) is int and (signed in (0,-15) or (signed==-2
        and stop.get('acceptedExpectedTranslation') is True
        and stop.get('returnCodeClassification')=='expected-original-12.2.3-sigterm-userinterrupt-sigint'
        and stop.get('shutdownPolicy')==closure['postgrestShutdownPolicy']
        and stop['pins']['binary']['bytes']==closure['postgrestShutdownPolicy']['originalBinaryBytes']
        and stop['pins']['binary']['sha256']==closure['postgrestShutdownPolicy']['originalBinarySHA256']
        and stop['pins']['config']['bytes']==closure['postgrestShutdownPolicy']['configBytes']
        and stop['pins']['config']['sha256']==closure['postgrestShutdownPolicy']['configSHA256']
        and stop['logEOFProof'].get('versionSeen') is True)))
    require(worker['pass'] is True and worker['measurementMode']=='lifecycle-only'
            and worker['sourceUnchangedFullManifest'] and worker['allOwnedDatabaseChildrenClosed']
            and worker['catalogUnchangedAfterOperation'] and worker['authRPCCount']==0
            and worker['nodeStarted'] is False and worker['postgrestSocketReady']
            and stop['pass'] is True and stop['preStopReturnCode'] is None
            and stop['schema']=='helmut-owned-postgrest-stop/3' and signal_status
            and type(stop['knownPID']) is int and stop['knownPID']>0 and stop['knownPID']==stop['observedPID']
            and stop['signalRequested']=='SIGTERM' and stop['killSent'] is False
            and stop['signalSent'] and stop['reaped'] and not stop['timedOut']
            and not stop['killRequested'] and not stop['errors'] and stop['persistError'] is None
            and stop['parentLogClosed'] and stop['logEOFProof']['eofObserved']
            and stop['logEOFProof']['drainEnded'] and not stop['logEOFProof']['errors']
            and not stop['logEOFProof']['overflow'] and worker['postgrestVersionQualified'],
            'strict persisted actual lifecycle closure')
    return [item,worker_pin,host_stop]

def lifecycle_file_pins(item, frozen):
    return lifecycle_proof(item,frozen)

def validate_run_inputs(closure, selection, lifecycle, frozen):
    if selection['mode']=='lifecycle-only':
        require(lifecycle is None,'lifecycle mode has no prior proof dependency')
    else:
        require(type(lifecycle) is dict,'explicit actual lifecycle result pin')
        lifecycle_proof(lifecycle,frozen)

def load(name, path, *, expected_pin):
    # Read ONCE and authenticate exactly the bytes compiled below. Never ask a
    # SourceFileLoader to select a potentially stale/unpinned __pycache__ file.
    p=Path(path)
    require(p.is_absolute() and p.resolve()==p and not p.is_symlink()
            and expected_pin['path']==str(p),'canonical pinned module required')
    require(type(expected_pin['bytes']) is int and 0<expected_pin['bytes']<=4*MIB
            and re.fullmatch('[a-f0-9]{64}',expected_pin['sha256']),
            'bounded explicit module source pin')
    fd=os.open(p,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        before=os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode),'regular module source required')
        source=stream.read(expected_pin['bytes']+1)
        after=os.fstat(stream.fileno())
    require((before.st_ino,before.st_size,before.st_mtime_ns)==
            (after.st_ino,after.st_size,after.st_mtime_ns)
            and len(source)==expected_pin['bytes']
            and hashlib.sha256(source).hexdigest()==expected_pin['sha256'],
            'module source bytes differ from adopted closure')
    require(name not in sys.modules,'module name already loaded')
    module=types.ModuleType(name)
    module.__file__=str(p)
    module.__package__=''
    module.__cached__=None
    sys.modules[name]=module
    try:
        exec(compile(source,str(p),'exec',dont_inherit=True),module.__dict__)
    except BaseException:
        sys.modules.pop(name,None)
        raise
    return module

def pin(path):
    p = Path(path)
    require(p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink(),
            'canonical regular input required')
    h = hashlib.sha256()
    size = 0
    with p.open('rb') as f:
        while block := f.read(MIB):
            h.update(block)
            size += len(block)
    return {'path':str(p),'bytes':size,'sha256':h.hexdigest()}

def checked(item):
    require(pin(item['path'])==item, 'frozen input drift')
    return Path(item['path'])

def read(item):
    return json.loads(checked(item).read_text())

def available(path):
    s = os.statvfs(path)
    return s.f_bavail*s.f_frsize

def floor(path, extra=0):
    n = available(path)
    require(n>=FLOOR+extra, 'unchanged 8GiB host floor/admission')
    return n

def output_bytes(root):
    total = 0
    for current,dirs,files in os.walk(root,followlinks=False):
        if Path(current)==Path(root):
            dirs[:]=[d for d in dirs if d!='disk']
        for name in dirs+files:
            require(not (Path(current)/name).is_symlink(),'output symlink')
        for name in files:
            try:
                size = (Path(current)/name).stat().st_size
            except FileNotFoundError:
                # The pinned Node writer publishes exactly six root markers by
                # atomic rename. Count their published bytes conservatively;
                # never ignore an unknown missing file or relax the output cap.
                require(Path(current)==Path(root) and
                        re.fullmatch(r'CYCLE_[1-6]\.MARKER\.SAFE\.json\.tmp',name),
                        'unknown file disappeared during evidence accounting')
                published = Path(current)/name[:-4]
                info = published.lstat()
                require(stat.S_ISREG(info.st_mode) and 0<info.st_size<=512,
                        'renamed marker must have bounded regular published counterpart')
                size = 512
            total += size
    return total

def save_bytes(root, relative, data):
    root = Path(root)
    p = root/relative
    require(p.parent==root and not p.exists() and not p.is_symlink(), 'new owned evidence only')
    require(output_bytes(root)+len(data)<=OUTPUT_LIMIT, '4MiB total evidence cap')
    floor(root,len(data))
    with p.open('xb') as f:
        p.chmod(0o600)
        f.write(data)
    return pin(p)

def save(root, relative, value):
    return save_bytes(root, relative, (json.dumps(value,indent=2,ensure_ascii=True)+'\n').encode())

def runtime_bindings():
    # Metadata only here. Actual file hashes are checked inside the new group.
    data = json.loads(BINDINGS.read_text())
    require(len(data['bindings'])==548,'original runtime binding count')
    result = list(data['bindings'])
    shell = json.loads((ARCH/'auth-component-shell/SOURCE.SAFE.json').read_text())
    result.append({'imagePath':'/bin/sh','source':shell['file'],'readonly':True})
    compat = json.loads((COMPAT/'SOURCE_COMPAT_FILES.SAFE.json').read_text())
    require(compat['sourceImageConfig']=='sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e',
            'original compatibility image differs')
    destinations = {x['imagePath'] for x in result}
    for name, meta in compat['files'].items():
        dest = '/'+meta['sourcePath']
        if dest not in destinations:
            result.append({'imagePath':dest,'source':{'path':str(COMPAT/name),
                'bytes':meta['bytes'],'sha256':meta['sha256']},'readonly':True})
            destinations.add(dest)
    require(len(result)==553 and len(destinations)==553,'unique original runtime closure')
    for x in result:
        require(x['readonly'] is True and Path(x['source']['path']).resolve()==Path(x['source']['path']),
                'readonly canonical runtime binding')
    return result

def manifest(root, guard):
    rows = []
    for p in [root,*sorted(root.rglob('*'))]:
        guard()
        info = p.lstat()
        row = {'path':str(p.relative_to(root)),'mode':stat.S_IMODE(info.st_mode)}
        if stat.S_ISDIR(info.st_mode):
            row['type']='directory'
        elif stat.S_ISREG(info.st_mode):
            h = hashlib.sha256()
            size = 0
            with p.open('rb') as f:
                while block := f.read(MIB):
                    guard()
                    h.update(block)
                    size += len(block)
            after = p.lstat()
            require((size,after.st_size,after.st_mtime_ns,after.st_ino)==
                    (info.st_size,info.st_size,info.st_mtime_ns,info.st_ino),'input changed while hashing')
            row.update(type='file',bytes=size,sha256=h.hexdigest())
        else:
            raise RuntimeError('PGDATA link or special file outside reviewed copy')
        rows.append(row)
    digest = hashlib.sha256(json.dumps(rows,separators=(',',':'),sort_keys=True).encode()).hexdigest()
    return {'schema':'helmut-complete-pgdata-file-manifest/1','records':rows,
        'fileCount':sum(x['type']=='file' for x in rows),
        'fileBytes':sum(x.get('bytes',0) for x in rows),'manifestSHA256':digest}

