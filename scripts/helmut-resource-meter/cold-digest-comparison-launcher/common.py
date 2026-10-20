"""V5: one selected cold RAM read OR the exact native differential case list."""
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
CASES = Path('/workspace/helmut-ram-fix-20261020/cold-digest-comparison-20261020/cases')
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
PAIR_COUNT = 19
NONCE_MARKER = '__ROOT_FRESH_PAIR_NONCE__'
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

def selected_measurement(closure, mode, variant):
    require(mode in ('ram','differential'),'exactly RAM or native differential mode')
    require((mode=='ram' and variant in ('OLD','NEW')) or
            (mode=='differential' and variant is None),'explicit RAM variant; no differential RAM variant')
    variants=closure['variants']
    require(set(variants)=={'OLD','NEW'} and variants['OLD']['bodySHA256']==OLD_GRAPH,
            'exact original/candidate variant contract')
    require(all(type(v['bodySHA256']) is str and re.fullmatch('[a-f0-9]{64}',v['bodySHA256'])
                for v in variants.values()) and variants['NEW']['bodySHA256']!=OLD_GRAPH,
            'concrete distinct candidate body SHA256')
    chosen=variants[variant if mode=='ram' else 'OLD']
    sql=closure['ramSQLPin'] if mode=='ram' else closure['differentialSQLPin']
    for item in [sql,chosen['installSQLPin'],closure['requestCasesPin'],closure['interfacePin'],
                 *[v['sourcePin'] for v in variants.values()]]:
        require(item in closure['metadataAndCodeInputs'],'selected input outside adopted closure')
    return {'mode':mode,'variant':variant,
        'adoptionSchema':'helmut-cold-digest-'+mode+'-root-adoption/1',
        'action':('ROOT START COLD DIGEST RAM '+variant+' ONLY') if mode=='ram' else
                 'ROOT START COLD DIGEST DIFFERENTIAL 19 PAIRS ONLY',
        'measurementSQLPin':sql,'installSQLPin':chosen['installSQLPin'],
        'expectedBodySHA256':chosen['bodySHA256'],
        'requestCasesPin':closure['requestCasesPin'] if mode=='differential' else None,
        'differentialPairCount':PAIR_COUNT if mode=='differential' else 0,
        'ramReadCount':1 if mode=='ram' else 0}

def request_pairs(closure, nonces):
    value=read(closure['requestCasesPin'])
    cases=value['cases']
    require(value['schema']=='helmut-cold-digest-differential-request-contract/1' and
            len(cases)==PAIR_COUNT and [x['caseId'] for x in cases]==closure['differentialCaseIDs']
            and len(set(closure['differentialCaseIDs']))==PAIR_COUNT,'exact nineteen adopted cases in order')
    require(len(nonces)==PAIR_COUNT and len(set(nonces))==PAIR_COUNT and all(uuid4(n) for n in nonces),
            'fresh distinct UUIDv4 per differential pair')
    def substitute(value,nonce):
        if type(value) is str: return nonce if value==NONCE_MARKER else value
        if type(value) is list: return [substitute(x,nonce) for x in value]
        if type(value) is dict: return {k:substitute(v,nonce) for k,v in value.items()}
        return value
    pairs=[]
    for case,nonce in zip(cases,nonces):
        require(set(case)=={'caseId','role','expectedOutcome','request'} and
                type(case['caseId']) is str and re.fullmatch('[a-z][a-z0-9-]{0,63}',case['caseId']) and
                case['role'] in ('service_role','anon','authenticated') and
                case['expectedOutcome'] in ('ok','error'),'bounded exact differential case shape')
        request=json.dumps(substitute(case['request'],nonce),ensure_ascii=True,separators=(',',':'))
        require(0<len(request.encode())<=4096 and NONCE_MARKER not in request,'bounded concrete paired request')
        pairs.append({'caseId':case['caseId'],'role':case['role'],'expectedOutcome':case['expectedOutcome'],
                      'pairNonce':nonce,'requestJSON':request})
    return pairs

def validate_run_inputs(closure, selection, nonce, pairs):
    if selection['mode']=='ram':
        require(uuid4(nonce) and pairs==[],'one fresh RAM UUID; no differential requests')
    else:
        require(nonce is None and type(pairs) is list and len(pairs)==PAIR_COUNT,
                'separate exact differential case binding')
        require(pairs==request_pairs(closure,[p['pairNonce'] for p in pairs]),
                'differential requests differ from adopted templates/nonces')

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

