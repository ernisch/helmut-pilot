"""Bounded read-only process/cgroup observations. No allocation attribution."""
import hashlib
import json
import os
import stat
import time
from pathlib import Path

MAX_PIDS=32
MAX_GROUPS=32
MAX_FRAMES=256
LOG_LIMIT=1024*1024
INTERVAL_NS=50_000_000
PERIODIC_OPERATIONS={1,17,18,26,27}
SMAPS_FIELDS=('Rss','Pss','Pss_Anon','Pss_File','Pss_Shmem','Anonymous',
              'Private_Clean','Private_Dirty','Shared_Clean','Shared_Dirty','Swap')
STATUS_FIELDS=('VmRSS','RssAnon','RssFile','RssShmem','VmSwap')
GROUP_FIELDS=('anon','file','kernel','kernel_stack','pagetables','slab','sock',
              'shmem','file_mapped','file_dirty','file_writeback','anon_thp',
              'active_anon','inactive_anon','active_file','inactive_file','unevictable')
METHODS=(['read','write']+['readControl']*6)*3+['read','write','read']

def need(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def bounded(path, limit):
    fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        need(stat.S_ISREG(os.fstat(stream.fileno()).st_mode),'observation file must be regular')
        data=stream.read(limit+1)
    if len(data)>limit:
        raise OverflowError('observation read cap')
    return data.decode('ascii')

def stat_identity(pid):
    text=bounded(Path('/proc',str(pid),'stat'),4096)
    # comm can contain spaces and parentheses. Fields after its final ')' begin
    # at field3; parent PID is field4 and starttime ticks is field22.
    left,sep,tail=text.rpartition(')')
    fields=tail.split()
    need(sep and left.startswith(str(pid)+' (') and len(fields)>19,'bounded PID stat identity')
    return {'pid':pid,'ppid':int(fields[1]),'startTicks':int(fields[19])}

def census(root):
    """PIDs as seen in THIS reader's PID namespace, never presumed host PIDs."""
    root=Path(root)
    pending=[root]
    rows=[]
    errors=[]
    while pending:
        need(len(rows)+len(pending)<=MAX_GROUPS,'owned descendant cgroup cap')
        directory=pending.pop()
        rel=str(directory.relative_to(root))
        try:
            need(not directory.is_symlink(),'cgroup alias')
            values=[int(x) for x in bounded(directory/'cgroup.procs',4096).split()]
            need(all(x>=0 for x in values),'invalid cgroup PID')
            rows.append([rel,sorted(set(values))])
            with os.scandir(directory) as entries:
                for entry in entries:
                    need(not entry.is_symlink(),'cgroup descendant alias')
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(Path(entry.path))
            need(len({p for _,ps in rows for p in ps if p})<=MAX_PIDS,'owned process census cap')
        except OSError as error:
            errors.append([rel,type(error).__name__])
    return {'groups':sorted(rows),'errors':errors,
            'zeroPIDObserved':any(0 in ps for _,ps in rows)}

def ids(value):
    return sorted({p for _,ps in value['groups'] for p in ps if p>0})

def process_identity(pid):
    before=stat_identity(pid)
    text=bounded(Path('/proc',str(pid),'status'),16384)
    status={k:v.strip() for k,sep,v in (line.partition(':') for line in text.splitlines()) if sep}
    nspid=[int(x) for x in status.get('NSpid','').split()]
    need(nspid and nspid[0]==pid,'PID namespace status mismatch')
    namespace=os.readlink(Path('/proc',str(pid),'ns/pid'))
    cgroup=bounded(Path('/proc',str(pid),'cgroup'),4096).strip()
    after=stat_identity(pid)
    need(before==after,'PID changed while reading provenance')
    return {**before,'nspid':nspid,'pidNamespace':namespace,'cgroup':cgroup},status

def host_census(root):
    """Called only in the existing host controller loop; no memory sum."""
    begin=time.monotonic_ns()
    before=census(root)
    rows=[]
    for pid in ids(before):
        try:
            item,_=process_identity(pid)
            rows.append(item)
        except (OSError,ValueError,RuntimeError) as error:
            rows.append({'pid':pid,'identity':'UNKNOWN','error':type(error).__name__})
    after=census(root)
    return {'readBeforeNs':str(begin),'readAfterNs':str(time.monotonic_ns()),
            'readerPIDNamespace':os.readlink('/proc/self/ns/pid'),
            'readerNSpid':bounded('/proc/self/status',16384).split('NSpid:',1)[1].splitlines()[0].split(),
            'cgroupInode':Path(root).stat().st_ino,'before':before,'after':after,
            'bootId':bounded('/proc/sys/kernel/random/boot_id',128).strip(),
            'startTicksPerSecond':os.sysconf('SC_CLK_TCK'),
            'processes':rows,'stableMembership':before==after,
            'memorySample':False,'overheadOutsideNativeWorkloadGroup':True,
            'completeDescendantMemoryCoverageClaimed':False}

def kib(value):
    if value is None:
        return None
    parts=value.split()
    need(len(parts)==2 and parts[0].isdigit() and parts[1]=='kB','numeric proc memory KiB')
    return int(parts[0])*1024

class Collector:
    def __init__(self,root,out,common,known):
        self.root,self.out,self.C=Path(root),Path(out),common
        self.known=known
        self.rows=0
        self.used=0
        self.next_ns=0
        self.markers=[]
        self.partial=0
        self.process_errors=0
        self.max_read_ns=0
        self.total_read_ns=0
        self.total_append_ns=0
        self.stream=None
        self.closed=False
        self.error=None
        self.path=self.out/'OWNERSHIP.PRIVATE.jsonl'
        self.C.require(not self.path.exists() and not self.path.is_symlink(),'new ownership log')
        self.stream=self.path.open('xb')
        self.path.chmod(0o600)
        try:
            self.append({'schema':'helmut-native-ownership-frames/1','pidColumns':
                ['pid','startTicks','ppid','pidNamespace','nspid','cgroup','role','statusBytes','smapsBytes','readBeforeNs','readAfterNs','error'],
                'statusColumns':STATUS_FIELDS,'smapsColumns':SMAPS_FIELDS,'groupStatColumns':GROUP_FIELDS,
                'groupCurrentIsNotSumRSS':True,'sharedMemoryIncludedInFile':True,
                'workerNamespaceCensusIsNotHostComplete':True,'periodicRPCs':sorted(PERIODIC_OPERATIONS),
                'periodicIntervalNs':INTERVAL_NS,'maximumFrames':MAX_FRAMES,'logCapBytes':LOG_LIMIT,
                'allOperationBoundaryFrames':81,'collectorOverheadIncluded':True})
            self.append({'readerPID':os.getpid(),'readerPIDNamespace':os.readlink('/proc/self/ns/pid'),
                'readerNSpid':bounded('/proc/self/status',16384).split('NSpid:',1)[1].splitlines()[0].split(),
                'cgroupInode':self.root.stat().st_ino,'startTicksPerSecond':os.sysconf('SC_CLK_TCK'),
                'bootId':bounded('/proc/sys/kernel/random/boot_id',128).strip(),
                'pidRowsAreTGIDsNotThreads':True,'knownDirectPIDs':known})
        except BaseException:
            try:
                self.stream.close()
            finally:
                self.closed=self.stream.closed
            raise

    def append(self,item):
        begin=time.monotonic_ns()
        block=(json.dumps(item,separators=(',',':'),ensure_ascii=True)+'\n').encode()
        self.C.require(self.used+len(block)<=LOG_LIMIT,'ownership 1MiB log cap')
        self.C.require(self.C.output_bytes(self.out)+len(block)<=self.C.OUTPUT_LIMIT,
                       'unchanged total 4MiB evidence cap')
        self.C.floor(self.out,len(block))
        self.stream.write(block)
        self.stream.flush()
        self.used+=len(block)
        self.total_append_ns+=time.monotonic_ns()-begin

    def group(self):
        start=time.monotonic_ns()
        current=int(bounded(self.root/'memory.current',64))
        peak=int(bounded(self.root/'memory.peak',64))
        mem=dict(line.split() for line in bounded(self.root/'memory.stat',16384).splitlines())
        events=dict((k,int(v)) for k,v in (line.split() for line in bounded(self.root/'memory.events',4096).splitlines()))
        return [str(start),str(time.monotonic_ns()),current,peak,
                [int(mem[k]) if k in mem else None for k in GROUP_FIELDS],events]

    def process(self,pid,pg_members,identities):
        begin=time.monotonic_ns()
        identity=None
        status_values=None
        smaps_values=None
        error=None
        try:
            identity,status=process_identity(pid)
            need(pid in identities and identities[pid]=={k:identity[k] for k in ('pid','ppid','startTicks')},
                 'PID ancestry identity changed before memory read')
            status_values=[kib(status.get(k)) for k in STATUS_FIELDS]
            rollup=bounded(Path('/proc',str(pid),'smaps_rollup'),8192)
            values={k:v.strip() for k,sep,v in (line.partition(':') for line in rollup.splitlines()) if sep}
            smaps_values=[kib(values.get(k)) for k in SMAPS_FIELDS]
            need(all(smaps_values[SMAPS_FIELDS.index(k)] is not None for k in
                     ('Rss','Pss','Anonymous','Private_Clean','Private_Dirty')),'required smaps fields missing')
            need(stat_identity(pid)=={k:identity[k] for k in ('pid','ppid','startTicks')},
                 'PID changed during memory read')
        except (OSError,ValueError,RuntimeError) as exc:
            error=type(exc).__name__
            self.process_errors+=1
        role=next((name for name,value in self.known.items() if value==pid),
                  'postgres-descendant' if pid in pg_members else 'owned-UNKNOWN-role')
        return [pid,identity['startTicks'] if identity else None,identity['ppid'] if identity else None,
                identity['pidNamespace'] if identity else None,identity['nspid'] if identity else None,
                identity['cgroup'] if identity else None,role,status_values,smaps_values,
                str(begin),str(time.monotonic_ns()),error]

    def sample(self,kind,op_index,edge=None):
        self.C.require(self.rows<MAX_FRAMES,'ownership frame cap; never drop to PASS')
        begin=time.monotonic_ns()
        group_before=self.group()
        before=census(self.root)
        pids=ids(before)
        # Identity reads prove ancestry when readable. Never infer PG ownership
        # from common UID or a generic process name.
        parents={}
        identities={}
        for pid in pids:
            try:
                identities[pid]=stat_identity(pid)
                parents[pid]=identities[pid]['ppid']
            except (OSError,ValueError,RuntimeError):
                pass
        pg_members={self.known['postgres']}
        for _ in range(MAX_PIDS):
            newer=pg_members|{pid for pid,parent in parents.items() if parent in pg_members}
            if newer==pg_members:
                break
            pg_members=newer
        rows=[self.process(pid,pg_members,identities) for pid in pids]
        after=census(self.root)
        group_after=self.group()
        end=time.monotonic_ns()
        unstable=before!=after or bool(before['errors'] or after['errors']) or any(x[-1] for x in rows)
        self.partial+=int(unstable)
        self.max_read_ns=max(self.max_read_ns,end-begin)
        self.total_read_ns+=end-begin
        self.rows+=1
        item={'n':self.rows,'kind':kind,'op':op_index,'edge':edge,'t':[str(begin),str(end)],
              'groupBefore':group_before,'groupAfter':group_after,'before':before,'after':after,
              'p':rows,'stableReadableVisibleSet':not unstable,
              'namespaceComplete':False,'hostCensusReconciliationRequired':True}
        self.append(item)
        self.next_ns=end+INTERVAL_NS
        return item

    def periodic(self):
        if self.markers:
            last=self.markers[-1]
            if last['opIndex'] in PERIODIC_OPERATIONS and last['edge']!='VERIFIED_END' and time.monotonic_ns()>=self.next_ns:
                self.sample('periodic',last['opIndex'])

    def observe_marker(self,child,config):
        sequence=len(self.markers)+1
        if sequence>81:
            self.C.require(not(self.out/'OP_82.MARKER.SAFE.json').exists(),'extra operation marker')
            return
        path=self.out/('OP_'+str(sequence)+'.MARKER.SAFE.json')
        if not path.exists():
            self.periodic()
            return
        read_before=time.monotonic_ns()
        raw=bounded(path,512)
        item=json.loads(raw)
        edge=('PRE','U_RETURN','VERIFIED_END')[(sequence-1)%3]
        op=(sequence-1)//3+1
        fixed={'schema':'helmut-u-op/1','sequence':sequence,'opIndex':op,
               'method':METHODS[op-1],'edge':edge,'nodePID':child.pid,
               'nonce':config['rootNonce'],'preparedSHA256':config['preparedPin']['sha256']}
        timing={'atNs'}|({'uStartNs','uReturnNs'} if edge!='PRE' else set())|(
            {'verifiedNs'} if edge=='VERIFIED_END' else set())
        self.C.require(type(item) is dict and set(item)==set(fixed)|timing and
                       all(item[k]==v and type(item[k]) is type(v) for k,v in fixed.items()),
                       'exact 81 operation marker identity/order')
        for key in timing:
            self.C.require(type(item[key]) is str and item[key].isdigit() and
                           len(item[key])<=24 and int(item[key])>0,'bounded monotonic marker time')
        self.C.require(int(item['atNs'])<=read_before,'Node/Python monotonic clock domain mismatch')
        if edge=='PRE':
            if self.markers:
                self.C.require(int(item['atNs'])>=self.last_ack_ns,'serial operation follows prior ACK')
        else:
            self.C.require(int(item['uStartNs'])<=int(item['uReturnNs'])<=int(item['atNs']),
                           'actual U start/return bracket')
            previous=self.markers[-1]
            if edge=='U_RETURN':
                self.C.require(previous['edge']=='PRE' and int(item['uStartNs'])>=self.last_ack_ns,
                               'actual U starts only after PRE sample ACK')
            else:
                self.C.require(item['uStartNs']==previous['uStartNs'] and
                               item['uReturnNs']==previous['uReturnNs'] and
                               self.last_ack_ns<=int(item['verifiedNs'])<=int(item['atNs']),
                               'separate verifier interval after U_RETURN ACK')
        sample=self.sample('boundary',op,edge)
        ack={'sequence':sequence,'markerSHA256':hashlib.sha256(raw.encode('ascii')).hexdigest(),
             'readBeforeNs':sample['t'][0],'readAfterNs':sample['t'][1],
             'ackNs':str(time.monotonic_ns()),'sampleSequence':sample['n']}
        name='OP_'+str(sequence)+'.ACK.SAFE.json'
        self.C.require(not(self.out/name).exists(),'new operation ACK')
        self.C.save(self.out,name+'.tmp',ack)
        (self.out/(name+'.tmp')).rename(self.out/name)
        self.last_ack_ns=int(ack['ackNs'])
        self.markers.append(item)

    def finish(self,complete=False,error_type=None):
        self.C.require(not self.closed,'ownership collector double close')
        try:
            self.stream.flush()
        finally:
            try:
                self.stream.close()
            finally:
                self.closed=self.stream.closed
        result={'schema':'helmut-native-ownership-capture/1','pass':bool(complete and len(self.markers)==81),
                'errorType':error_type,
                'logPin':self.C.pin(self.path),'logClosed':self.stream.closed,'logBytes':self.used,
                'frames':self.rows,'operationMarkers':len(self.markers),'partialVisibleFrames':self.partial,
                'processReadErrors':self.process_errors,'maximumFrameReadNs':str(self.max_read_ns),
                'totalFrameReadNs':str(self.total_read_ns),'totalLogAppendNs':str(self.total_append_ns),
                'hostCensusReconciliationRequired':True,'owner':'UNKNOWN_PENDING_ACTUAL_SAMPLE_ANALYSIS',
                'allDescendantsMemoryReadableClaimed':False,'kernelPeakDecomposed':False,
                'samplerOverheadIncluded':True,'forcedGC':False,'additionalSQL':0,'additionalProcesses':0}
        self.C.save(self.out,'OWNERSHIP_CAPTURE.SAFE.json',result)
        return result
