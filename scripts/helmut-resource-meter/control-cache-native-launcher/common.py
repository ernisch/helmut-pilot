"""V6: separately adopted PostgREST lifecycle and exact three-RPC control read."""
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
CASES = Path('/workspace/helmut-ram-fix-20261020/control-cache-native-20261020/cases')
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

def selected_measurement(closure, mode):
    require(mode in ('lifecycle-only','control-cache'),'exactly two separately adopted modes')
    require(closure['graphBodySHA256']==NEW_GRAPH and
            closure['rendererBodySHA256']==NEW_RENDERER,'current reviewed engine/renderer only')
    for key in ('installSQLPin','engineSourcePin','nodeBinaryPin','postgrestBinaryPin'):
        require(closure[key] in closure['metadataAndCodeInputs'],'selected input outside adopted closure')
    require(closure['engineSourcePin']['sha256']=='e7530ffd737179fb261d8a680ade77262d88e4685b3d8d90f2a92ecb5fad83c5'
            and closure['nodeBinaryPin']['path']==str(NODE_ROOT/'bin/node')
            and closure['postgrestBinaryPin']['path']==str(POSTGREST)
            and closure['postgrestConfigSHA256']==hashlib.sha256(POSTGREST_CONFIG.encode()).hexdigest(),
            'exact original runtime/current engine/config contract')
    return {'mode':mode,'adoptionSchema':'helmut-control-cache-'+mode+'-root-adoption/1',
        'action':('ROOT START POSTGREST LIFECYCLE ONLY' if mode=='lifecycle-only' else
                  'ROOT START CONTROL CACHE THREE RPCS ONLY'),
        'installSQLPin':closure['installSQLPin'],'expectedBodySHA256':NEW_GRAPH,
        'authRPCCount':0 if mode=='lifecycle-only' else 3,
        'nodeLaunchCount':0 if mode=='lifecycle-only' else 1,
        'postgrestConfigSHA256':closure['postgrestConfigSHA256']}

def lifecycle_proof(item, frozen):
    value=read(item)
    require(value['schema']=='helmut-control-cache-result/1' and value['status']=='PASS'
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
    worker=read(value['workerResultPin'])
    stop=read(worker['postgrestStopReceiptPin'])
    closure=read(frozen)
    require(stop['pins']['binary']==closure['postgrestBinaryPin']
            and stop['pins']['config']['path']=='/ram/postgrest.conf'
            and stop['pins']['config']['sha256']==closure['postgrestConfigSHA256'],
            'actual lifecycle binary/config pins')
    require(worker['pass'] is True and worker['measurementMode']=='lifecycle-only'
            and worker['sourceUnchangedFullManifest'] and worker['allOwnedDatabaseChildrenClosed']
            and worker['catalogUnchangedAfterOperation'] and worker['authRPCCount']==0
            and worker['nodeStarted'] is False and worker['postgrestSocketReady']
            and stop['pass'] is True and stop['preStopReturnCode'] is None
            and type(stop['returnCode']) is int and stop['returnCode'] in (0,-15)
            and stop['signalSent'] and stop['reaped'] and not stop['timedOut']
            and not stop['killRequested'] and not stop['errors'] and stop['persistError'] is None
            and stop['parentLogClosed'] and stop['logEOFProof']['eofObserved']
            and stop['logEOFProof']['drainEnded'] and not stop['logEOFProof']['errors']
            and not stop['logEOFProof']['overflow'] and worker['postgrestVersionQualified'],
            'strict persisted actual lifecycle closure')
    return item

def lifecycle_file_pins(item, frozen):
    lifecycle_proof(item,frozen)
    value=read(item)
    worker=read(value['workerResultPin'])
    return [item,value['workerResultPin'],worker['postgrestStopReceiptPin']]

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
            total += (Path(current)/name).stat().st_size
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

