"""Inert helpers for one Root-adopted disk-backed 01, 02 OR 03 read probe."""
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
CASES = Path('/workspace/helmut-ram-fix-20261020/late-read-spill-20261020/cases')
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
MEASUREMENTS = {
    '01': {'file':'01-ordered-rows.sql','action':'ROOT START ORDERED READ 01 ONLY',
           'capture':'ORDERED_01','artifact':'ORDERED_PLAN.SAFE.json'},
    '02': {'file':'02-native-warm-control.sql','action':'ROOT START NATIVE WARM CONTROL 02 ONLY',
           'capture':'NATIVE_02','artifact':'NATIVE_WARM_CONTROL.SAFE.json'},
    '03': {'file':'03-native-cold-control.sql','action':'ROOT START NATIVE COLD CONTROL 03 ONLY',
           'capture':'NATIVE_03','artifact':'NATIVE_COLD_CONTROL.SAFE.json'}}

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def selected_measurement(closure, mode):
    require(type(mode) is str and mode in MEASUREMENTS,'exactly one measurement mode 01, 02 or 03')
    value=MEASUREMENTS[mode]
    if mode=='03':
        # HERE is /tools inside the worker; keep the adopted canonical host pin.
        pins=[x for x in closure['metadataAndCodeInputs'] if Path(x['path']).name==value['file']]
    else:
        path=str(BIN/'late-read-spill'/value['file'])
        pins=[x for x in closure['metadataAndCodeInputs'] if x['path']==path]
    require(len(pins)==1,'selected measurement outside adopted SQL closure')
    return {**value,'pin':pins[0]}

def validate_read_nonce(mode, nonce):
    require((mode=='01' and nonce is None) or
        (mode in ('02','03') and type(nonce) is str and re.fullmatch(
            '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',nonce)),
        '02/03 require their fresh bound UUIDv4; 01 requires null readNonce')

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

