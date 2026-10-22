#!/usr/bin/env python3
"""Explicit local native envelope; creating a budget never grants a workflow GO."""
import hashlib, json, os, re, subprocess, tarfile
from pathlib import Path

BIN = Path(__file__).resolve().parent
CGROUP_ROOT = Path('/sys/fs/cgroup')
PAGE = os.sysconf('SC_PAGE_SIZE')
TARGET = 1548000000

def policy():
    return dict(schema='helmut-native-memory-budget/2', hardLimitBytes=2048000000,
        targetCeilingBytes=TARGET, nativeMaxBytes=TARGET//PAGE*PAGE,
        nativeHighBytes=1400000000//PAGE*PAGE, swapMaxBytes=0,
        allOwnedDescendants=True, noPeakReset=True, scope='LOCAL_ONLY',
        nodeMaxOldSpaceMiB=384, nodeMaxSemiSpaceMiB=16, nodeHeapReceiptsRequired=True)

def validate_policy(value):
    # bool/int equality must not authenticate an untyped policy.
    expected=policy()
    if not isinstance(value,dict) or set(value)!=set(expected) or any(
        type(value[k]) is not type(v) or value[k]!=v for k,v in expected.items()):
        raise RuntimeError('exact native common-memory policy required')
    return value

def parent_path(parent):
    if not isinstance(parent,str) or not re.fullmatch(
        r'helmut-meter-(?:resources[0-9]{2}-[a-f0-9]{12}|memorybudget-[a-f0-9]{24})',parent):
        raise RuntimeError('exact new-owned memory parent required')
    return CGROUP_ROOT/parent

def pin(path):
    p=Path(path)
    if not p.is_absolute() or p.resolve()!=p or p.is_symlink() or not p.is_file():
        raise RuntimeError('canonical native budget file required')
    b=p.read_bytes()
    return dict(path=str(p),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())

def save(path,value):
    with Path(path).open('x') as f:json.dump(value,f,indent=2);f.write('\n')
    Path(path).chmod(0o600)

def docker(args,timeout=30,check=True):
    env=os.environ.copy()
    for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(k,None)
    return subprocess.run(['docker','--host=unix:///var/run/docker.sock',*args],env=env,
        capture_output=True,text=True,timeout=timeout,check=check)

def fresh_output(out):
    p=Path(out)
    if not p.is_absolute() or not p.is_relative_to('/workspace') or p.resolve()!=p or p.is_symlink() or p.exists():
        raise RuntimeError('fresh canonical workspace budget output required')
    p.mkdir(mode=0o755);p.chmod(0o755)
    return p

def small_setup_capacity():
    stat=os.statvfs('/workspace');free=stat.f_bavail*stat.f_frsize
    if free<8*1024**3+16*1024**2:raise RuntimeError('native helper setup lacks unchanged host reserve plus16MiB')
    return free

def prepare_runtime(out):
    """Build a tiny immutable LOCAL helper once; never called by a full run."""
    small_setup_capacity();out=fresh_output(out);source=pin(BIN/'native-memory-budget-helper.c');helper=out/'helper'
    subprocess.run(['gcc','-O2','-static','-Wall','-Wextra','-o',str(helper),source['path']],check=True,capture_output=True)
    helper.chmod(0o755);binary=pin(helper)
    if binary['bytes']>2*1024**2:raise RuntimeError('unexpected native helper size')
    archive=out/'LOCAL_HELPER_IMAGE.tar'
    with tarfile.open(archive,'w')as tar:
        for name in ['opt','output']:
            info=tarfile.TarInfo(name);info.type=tarfile.DIRTYPE;info.mode=0o755;tar.addfile(info)
        info=tarfile.TarInfo('opt/native-memory-budget');info.size=binary['bytes'];info.mode=0o755
        with helper.open('rb')as f:tar.addfile(info,f)
    image=docker(['import','--change','LABEL org.helmut.native-budget-source='+source['sha256'],
        '--change','LABEL org.helmut.native-budget-binary='+binary['sha256'],str(archive)]).stdout.strip()
    if not re.fullmatch('sha256:[a-f0-9]{64}',image):raise RuntimeError('helper image identity missing')
    size=json.loads(docker(['image','inspect','--format','{{.Size}}',image]).stdout)
    result=dict(schema='helmut-native-budget-runtime/1',imageId=image,imageBytes=size,
        sourcePin=source,helperSHA256=binary['sha256'])
    validate_runtime(result);save(out/'RUNTIME.SAFE.json',result);return result

def validate_runtime(runtime,*,actual=True):
    keys={'schema','imageId','imageBytes','sourcePin','helperSHA256'}
    if not isinstance(runtime,dict) or set(runtime)!=keys or runtime['schema']!='helmut-native-budget-runtime/1':
        raise RuntimeError('exact native budget runtime required')
    if runtime['sourcePin']!=pin(BIN/'native-memory-budget-helper.c') or not re.fullmatch('sha256:[a-f0-9]{64}',runtime['imageId']):
        raise RuntimeError('native helper source/image drift')
    if type(runtime['imageBytes']) is not int or not 0<runtime['imageBytes']<=2*1024**2 or not re.fullmatch('[a-f0-9]{64}',runtime['helperSHA256']):
        raise RuntimeError('bounded native helper identity missing')
    if not actual:return runtime
    row=json.loads(docker(['image','inspect',runtime['imageId']]).stdout)[0];labels=row['Config'].get('Labels')or{}
    if row['Id']!=runtime['imageId'] or row['Size']!=runtime['imageBytes'] or labels.get('org.helmut.native-budget-source')!=runtime['sourcePin']['sha256'] or labels.get('org.helmut.native-budget-binary')!=runtime['helperSHA256']:
        raise RuntimeError('actual native helper image differs')
    return runtime

def admit_metadata(acceptance,connection,recipe,read,*,actual=True):
    """Identical explicit policy/runtime AND reviewed source closure, no GO."""
    p=validate_policy(connection.get('nativeMemoryBudget'))
    runtime_pin=connection.get('nativeBudgetRuntimePin')
    if not runtime_pin or any(x.get('nativeMemoryBudget')!=p or x.get('nativeBudgetRuntimePin')!=runtime_pin
                              for x in [acceptance,recipe]):
        raise RuntimeError('accepted connection/recipe native budget binding differs')
    runtime=validate_runtime(read(runtime_pin),actual=actual)
    accepted={x['path']:x for x in acceptance['sourcePins']}
    for name in ['native-memory-budget.py','native-memory-budget-helper.c','native-node-budget.js','http-meter.js']:
        source=pin(BIN/name)
        if accepted.get(source['path'])!=source:raise RuntimeError('native budget source outside reviewed closure')
    return p,runtime

def bind_setup(connection,recipe,read):
    receipt_pin=recipe['nativeBudgetSetupPin'];receipt=read(receipt_pin)
    parent='helmut-meter-resources'+connection['day'][-2:]+'-'+Path(connection['caseDirectory']).name.removeprefix('attempt-')
    if receipt_pin['path']!=str(Path(connection['caseDirectory'])/'native-memory-budget/READY.SAFE.json') or receipt.get('parent')!=parent or receipt.get('schema')!='helmut-native-budget-ready/1' or receipt.get('full500Authority')is not False:
        raise RuntimeError('exact newly owned native budget setup required')
    if receipt['policy']!=connection['nativeMemoryBudget'] or receipt['runtime']!=read(connection['nativeBudgetRuntimePin']):
        raise RuntimeError('actual budget setup differs from accepted native runtime/policy')
    return receipt

def assert_setup_exclusive(group,parent,helpers,runtime):
    ids=docker(['ps','--all','--quiet']).stdout.split()
    rows=json.loads(docker(['inspect',*ids]).stdout)if ids else []
    owned={x['id']for x in helpers.values()}
    actual={r['Id']for r in rows if r['HostConfig']['CgroupParent']=='/'+parent or r['HostConfig']['CgroupParent'].startswith('/'+parent+'/')}
    if actual!=owned:raise RuntimeError('foreign or missing container in new budget parent')
    expected=set()
    for x in helpers.values():
        state=helper_state(x,parent,runtime)
        if state['Running']:expected.add(state['Pid'])
    live={int(v)for f in group.rglob('cgroup.procs')for v in f.read_text().split()}
    if live!=expected:raise RuntimeError('foreign or missing process in new budget parent')

def settings(group):
    return {k:(group/k).read_text().strip() for k in ['memory.max','memory.high','memory.swap.max']}

def events(group):
    return {k:int(v)for k,v in (line.split()for line in (group/'memory.events').read_text().splitlines())}

def helper_state(entry,parent,runtime):
    row=json.loads(docker(['inspect',entry['id']]).stdout)[0];h=row['HostConfig']
    if row['Id']!=entry['id'] or row['Name']!='/'+entry['name'] or row['Image']!=runtime['imageId'] or h['CgroupParent']!='/'+parent or h['NetworkMode']!='none' or h.get('Privileged') or not h['ReadonlyRootfs'] or h.get('CapAdd') or h.get('CapDrop')!=['ALL']:
        raise RuntimeError('exact owned budget helper identity differs')
    return row['State']

def best_effort_save(path,value):
    try:save(path,value);return True
    except Exception:return False

def close_owned_helpers(out,parent,runtime,helpers):
    """No report-write failure may skip closing an already registered CID."""
    out=Path(out)
    try:
        if not(out/'STOP').exists():best_effort_save(out/'STOP',{'ownedFailureClose':True})
    except Exception:pass
    closed=[]
    for entry in helpers.values():
        try:
            s=helper_state(entry,parent,runtime)
            if s['Running']:docker(['stop','--time','3',entry['id']],timeout=10)
            after=helper_state(entry,parent,runtime)
            closed.append(dict(id=entry['id'],closed=not after['Running'] and after['Pid']==0))
        except Exception as error:closed.append(dict(id=entry['id'],closed=False,errorType=type(error).__name__))
    result={'helpers':closed,'originalErrorPreserved':True,'allKnownHelpersClosed':all(x['closed']for x in closed)}
    best_effort_save(out/'FAILURE_CLOSE.SAFE.json',result)
    return result

def close_case_helpers(case,parent,runtime):
    """Global reservation owner supplies the fixed case; never scan-and-stop."""
    out=Path(case)/'native-memory-budget';helpers={}
    if not out.exists():return {'helpers':[],'allKnownHelpersClosed':True}
    validate_runtime(runtime)
    started=json.loads((out/'STARTED.SAFE.json').read_text())
    if started['parent']!=parent or started['runtime']!=runtime:raise RuntimeError('native helper close binding differs')
    for role in ['holder','setter']:
        path=out/(role.upper()+'_CREATED.SAFE.json')
        if path.exists():
            if path.is_symlink():raise RuntimeError('native helper close receipt alias')
            helpers[role]=json.loads(path.read_text())
    return close_owned_helpers(out,parent,runtime,helpers)

def verify(parent,receipt,*,require_no_oom=True):
    group=parent_path(parent);p=validate_policy(receipt['policy']);runtime=validate_runtime(receipt['runtime'])
    if receipt.get('schema')!='helmut-native-budget-ready/1' or receipt.get('parent')!=parent or receipt.get('full500Authority')is not False or group.is_symlink() or group.stat().st_ino!=receipt['parentInode']:
        raise RuntimeError('native budget parent binding differs')
    expected={'memory.max':str(p['nativeMaxBytes']),'memory.high':str(p['nativeHighBytes']),'memory.swap.max':'0'}
    if settings(group)!=expected:raise RuntimeError('native common budget changed')
    if set(receipt['helpers'])!={'holder','setter'}:raise RuntimeError('all budget helpers required')
    for entry in receipt['helpers'].values():
        s=helper_state(entry,parent,runtime)
        if s['Running']or s['Pid']or s['ExitCode']or s['OOMKilled']:raise RuntimeError('budget setup helper exit incomplete')
    ev=events(group)
    if require_no_oom and (ev.get('oom',0)or ev.get('oom_kill',0)):
        raise RuntimeError('native common budget OOM; no reserve acceptance')
    return dict(settings=expected,memoryEvents=ev,memoryPeakBytes=int((group/'memory.peak').read_text()),
        actualParentInode=group.stat().st_ino,setupHelpersExited=True,peakNeverReset=True)

def start(out,parent,runtime,policy_value=None):
    """Only call AFTER the original 32 gates and once-only setup reservation."""
    p=validate_policy(policy()if policy_value is None else policy_value);group=parent_path(parent)
    if group.exists()or group.is_symlink():raise RuntimeError('existing measurement group; never reuse or resize')
    validate_runtime(runtime);small_setup_capacity();out=fresh_output(out)
    save(out/'STARTED.SAFE.json',dict(parent=parent,policy=p,runtime=runtime,parentAbsentBefore=True,
        full500Authority=False,noAutomaticRetry=True))
    helpers={}
    common=['--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--user','0:0','--cgroup-parent=/'+parent,'--entrypoint','/opt/native-memory-budget']
    def create(role,args,mount):
        name='helmut-native-budget-'+role+'-'+os.urandom(6).hex()
        cid=docker(['create','--name',name,*common,'--mount',mount,runtime['imageId'],*args]).stdout.strip()
        if not re.fullmatch('[a-f0-9]{64}',cid):raise RuntimeError('actual budget helper ID missing')
        helpers[role]={'id':cid,'name':name};save(out/(role.upper()+'_CREATED.SAFE.json'),helpers[role])
        helper_state(helpers[role],parent,runtime);docker(['start',cid]);return cid
    try:
        holder=create('holder',['hold','/output/STOP'],'type=bind,src='+str(out)+',dst=/output')
        inode=group.stat().st_ino
        if group.is_symlink()or settings(group)!={k:'max'for k in ['memory.max','memory.high','memory.swap.max']}:
            raise RuntimeError('new parent settings differ before configuration')
        assert_setup_exclusive(group,parent,helpers,runtime)
        setter=create('setter',['set',parent,str(inode),str(p['nativeMaxBytes']),str(p['nativeHighBytes']),'0'],
            'type=bind,src='+str(group)+',dst=/owned-new-parent')
        if int(docker(['wait',setter],timeout=30).stdout.strip()):raise RuntimeError('native budget setup failed; never retry')
        assert_setup_exclusive(group,parent,helpers,runtime)
        save(out/'STOP',{'ownedBudgetSetupFinished':True})
        if int(docker(['wait',holder],timeout=30).stdout.strip()):raise RuntimeError('budget holder did not close')
        receipt=dict(schema='helmut-native-budget-ready/1',parent=parent,parentInode=inode,
            policy=p,runtime=runtime,helpers=helpers,full500Authority=False)
        receipt['beforeWorkload']=verify(parent,receipt);save(out/'READY.SAFE.json',receipt);return receipt
    except BaseException as error:
        try:best_effort_save(out/'FAILURE.SAFE.json',dict(errorType=type(error).__name__,full500Authority=False,noAutomaticRetry=True))
        finally:close_owned_helpers(out,parent,runtime,helpers)
        raise

def node_receipts(directory):
    """All metered Node isolates AND parent-observed private Workers must close."""
    directory=Path(directory)
    for prefix,phases in [('NODE_HEAP','STARTED|EXITED'),('NODE_WORKER','DISCOVERED|STARTED|EXITED|FAILED')]:
        for path in directory.glob(prefix+'_*.SAFE.json'):
            match=re.fullmatch(re.escape(prefix)+r'_([0-9]+)_([0-9]+)\.('+phases+r')\.SAFE.json',path.name)
            if not match or any(str(int(v))!=v for v in match.groups()[:2]):raise RuntimeError('unknown Node budget receipt filename')
    def read(path):
        if path.is_symlink():raise RuntimeError('Node budget receipt alias')
        return json.loads(path.read_text())
    def integer(n,minimum=0):return type(n)is int and n>=minimum
    def heap(row):
        return type(row.get('oldSpaceMiB'))is int and row['oldSpaceMiB']==384 and type(row.get('semiSpaceMiB'))is int and row['semiSpaceMiB']==16 and integer(row.get('heapSizeLimitBytes'),1) and row['heapSizeLimitBytes']<=448*1024**2
    def tokens(prefix,phase):
        result=set()
        for path in directory.glob(prefix+'_*.SAFE.json'):
            match=re.fullmatch(re.escape(prefix)+r'_([0-9]+)_([0-9]+)\.'+phase+r'\.SAFE.json',path.name)
            if match:result.add((int(match[1]),int(match[2])))
        return result
    expected=set();limits=[];observers={}
    for path in directory.glob('HTTP_*.STARTED.SAFE.json'):
        row=read(path);pid=row.get('pid');thread=row.get('threadId')
        if row.get('schema')!='helmut-local-http-meter-start/1' or not integer(pid,1) or not integer(thread) or path.name!='HTTP_'+str(pid)+'_'+str(thread)+'.STARTED.SAFE.json':
            raise RuntimeError('Node HTTP identity differs')
        expected.add((pid,thread))
    if not expected:raise RuntimeError('no Node runtime identities to qualify')
    if any(tokens('NODE_HEAP',phase)!=expected for phase in ['STARTED','EXITED']):
        raise RuntimeError('Node heap/HTTP identity sets differ')
    for pid,thread in expected:
        for phase in ['STARTED','EXITED']:
            row=read(directory/('NODE_HEAP_'+str(pid)+'_'+str(thread)+'.'+phase+'.SAFE.json'))
            if row.get('schema')!='helmut-local-node-heap-budget/1' or row.get('phase')!=phase or not integer(row.get('pid'),1) or row['pid']!=pid or not integer(row.get('threadId')) or row['threadId']!=thread or not heap(row):
                raise RuntimeError('actual Node heap budget differs')
            limits.append(row['heapSizeLimitBytes'])
            counts=row.get('workerCounts')
            if not isinstance(counts,dict) or set(counts)!={'discovered','measured','exited','failed'} or not all(integer(n)for n in counts.values()):
                raise RuntimeError('Node Worker counters missing')
            if phase=='STARTED' and any(counts.values()):raise RuntimeError('Node Worker observer started late')
            if phase=='EXITED':observers[(pid,thread)]=counts
    workers=tokens('NODE_WORKER','DISCOVERED')
    if any(tokens('NODE_WORKER',phase)!=workers for phase in ['STARTED','EXITED']) or tokens('NODE_WORKER','FAILED'):
        raise RuntimeError('private Worker budget/exit measurement incomplete')
    actual_counts={key:0 for key in expected}
    for pid,thread in workers:
        owner=None
        for phase in ['DISCOVERED','STARTED','EXITED']:
            row=read(directory/('NODE_WORKER_'+str(pid)+'_'+str(thread)+'.'+phase+'.SAFE.json'))
            observer=row.get('observerThreadId')
            if row.get('schema')!='helmut-local-node-worker-budget/1' or row.get('phase')!=phase or not integer(row.get('pid'),1) or row['pid']!=pid or not integer(row.get('threadId'),1) or row['threadId']!=thread or not integer(observer) or observer==thread or (pid,observer)not in expected or (owner is not None and owner!=observer):
                raise RuntimeError('private Worker identity differs')
            owner=observer
            if phase=='STARTED':
                if not heap(row) or row.get('measurement')!='LIVE_GET_HEAP_STATISTICS':raise RuntimeError('private Worker heap limit not measured')
                limits.append(row['heapSizeLimitBytes'])
            if phase=='EXITED' and (row.get('startupBudgetVerified')is not True or not integer(row.get('exitCode')) or row.get('noPostExitHeapMeasurementClaimed')is not True):
                raise RuntimeError('private Worker lifetime incomplete')
        actual_counts[(pid,owner)]+=1
    for key,counts in observers.items():
        if counts['failed'] or any(counts[k]!=actual_counts[key]for k in ['discovered','measured','exited']):
            raise RuntimeError('private Worker counts differ from receipts')
    return dict(pass_=True,isolates=len(expected|workers),httpMeteredIsolates=len(expected),privateWorkers=len(workers),oldSpaceMiB=384,semiSpaceMiB=16,
        maximumObservedHeapSizeLimitBytes=max(limits),heapLimitIsNotTotalRSS=True,totalNativePeakStillRequired=True)

if __name__=='__main__':
    raise SystemExit('Import only; no default setup or resource execution')
