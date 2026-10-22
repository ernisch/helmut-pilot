"""Current U write-phase diagnostic; same original clone/runtime/current NEW SQL/Parts."""
import copy
import datetime
import hashlib
import json
import os
import re
import selectors
import socket
import signal
import stat
import subprocess
import threading
import time
from pathlib import Path
import common as C

OUT=Path('/bench')
SOURCE=Path('/source-pgdata')
DISK=Path('/disk')
PGDATA=DISK/'pgdata'
RAM=Path('/ram')
SOCKET=RAM/'socket'
GROUP=Path('/owned-group')
PGBIN=Path('/usr/lib/postgresql/17/bin')
LIBRARY_PATH=''
CONFIG=None
CLOSING=False
PHASE='initial'
LAST_DISK_CHECK=0.0
REST_STATE=None

def mount(path):
    rows=[r.split() for r in Path('/proc/self/mountinfo').read_text().splitlines()
          if r.split()[4]==str(path)]
    C.require(len(rows)==1,'exact owned mount missing')
    r=rows[0]
    sep=r.index('-')
    return {'filesystem':r[sep+1],'options':r[5].split(',')+r[sep+3].split(',')}

def guard():
    global LAST_DISK_CHECK
    if REST_STATE is not None and not CLOSING:
        C.require(not REST_STATE['overflow'].is_set() and not REST_STATE['errors'],
                  'PostgREST pipe log failure/cap')
    C.require({k:(GROUP/k).read_text().strip() for k in C.LIMITS}==C.LIMITS,
              'native limits changed')
    C.require(time.monotonic()<(CONFIG['finalDeadlineMonotonic'] if CLOSING
                               else CONFIG['workDeadlineMonotonic']),'probe deadline')
    C.floor(OUT)
    C.require(C.output_bytes(OUT)<=C.OUTPUT_LIMIT,'total 4MiB output cap')
    events=dict(line.split() for line in (GROUP/'memory.events').read_text().splitlines())
    if not CLOSING:
        C.require(not int(events.get('oom',0)) and not int(events.get('oom_kill',0)),'native OOM')
    if time.monotonic()-LAST_DISK_CHECK>=.5:
        allocated=0
        for p in DISK.rglob('*'):
            C.require(not p.is_symlink(),'derived disk alias')
            allocated+=p.lstat().st_blocks*512
        C.require(allocated<=C.DISK_LIMIT,'admitted persistent-copy allocation exceeded')
        LAST_DISK_CHECK=time.monotonic()

def snapshot():
    guard()
    def pairs(name):
        return {k:int(v) for k,v in (r.split() for r in (GROUP/name).read_text().splitlines())}
    return {'phase':PHASE,'atUnixSeconds':time.time(),'parentInode':GROUP.stat().st_ino,
        'memoryCurrentBytes':int((GROUP/'memory.current').read_text()),
        'memoryPeakBytes':int((GROUP/'memory.peak').read_text()),
        'memoryStat':pairs('memory.stat'),'memoryEvents':pairs('memory.events'),
        'cpu':pairs('cpu.stat'),'peakNeverReset':True,'notLastExitCoverage':True}

def env():
    result={'PATH':str(PGBIN)+':/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8',
        'PGCONNECT_TIMEOUT':'5','HOME':str(RAM),'TMPDIR':str(RAM),
        'PYTHONDONTWRITEBYTECODE':'1'}
    if LIBRARY_PATH:
        result['LD_LIBRARY_PATH']=LIBRARY_PATH
    return result

def capture(argv,label,timeout=30,extra_env=None,observer=None):
    child=None
    sel=None
    buffers=[bytearray(),bytearray()]
    failed=None
    primary=None
    code=None
    observed=0
    started=time.monotonic()
    deadline=started+timeout
    try:
        guard()
        child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,env={**env(),**(extra_env or {})})
        sel=selectors.DefaultSelector()
        for i,stream in enumerate((child.stdout,child.stderr)):
            os.set_blocking(stream.fileno(),False)
            sel.register(stream,selectors.EVENT_READ,i)
        while sel.get_map():
            guard()
            if time.monotonic()>=deadline:
                failed='CLIENT_30S_DEADLINE'
                raise TimeoutError(failed)
            if observer is not None:
                observer(child,deadline)
            for key,_ in sel.select(.05):
                block=os.read(key.fileobj.fileno(),8192)
                if not block:
                    sel.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                observed+=len(block)
                if sum(map(len,buffers))+len(block)>C.QUERY_LIMIT:
                    failed='COMBINED_256KIB_OUTPUT_CAP'
                    raise RuntimeError(failed)
                buffers[key.data].extend(block)
        if observer is not None:
            observer(child,deadline)
        remaining=deadline-time.monotonic()
        if remaining<=0:
            failed='CLIENT_30S_DEADLINE'
            raise TimeoutError(failed)
        # Pipe EOF is not process exit. Exit wait consumes the SAME wall budget.
        code=child.wait(timeout=remaining)
        if time.monotonic()>=deadline:
            failed='CLIENT_30S_DEADLINE'
            raise TimeoutError(failed)
    except BaseException as error:
        primary=error
        failed=failed or ('CLIENT_30S_DEADLINE' if time.monotonic()>=deadline
                          else type(error).__name__)
    finally:
        if sel is not None:
            try:
                sel.close()
            except BaseException as error:
                primary=primary or error
                failed=failed or type(error).__name__
        if child is not None:
            try:
                if child.poll() is None:
                    child.kill()
                    child.wait(timeout=5)  # Failure-only bounded kill/reap.
                code=child.poll()
            except BaseException as error:
                primary=primary or error
                failed=failed or 'BOUNDED_REAP_FAILED'
            for stream in (child.stdout,child.stderr):
                try:
                    stream.close()
                except BaseException as error:
                    primary=primary or error
                    failed=failed or type(error).__name__
        if time.monotonic()>=deadline:
            failed=failed or 'CLIENT_30S_DEADLINE'
        evidence_errors=[]
        # Guard/selector/read/wait failures still retain bounded buffers and
        # the observed exit code after closing the known child. Evidence writes
        # cannot override the host floor or output cap if those caused failure.
        for suffix,data in (('.stdout.PRIVATE.txt',bytes(buffers[0])),
                            ('.stderr.PRIVATE.txt',bytes(buffers[1]))):
            try:
                C.save_bytes(OUT,label+suffix,data)
            except BaseException as error:
                evidence_errors.append(type(error).__name__)
        C.save(OUT,label+'.CAPTURE.SAFE.json',{'exitCode':code,'childPID':child.pid if child else None,'failure':failed,
            'exceptionType':type(primary).__name__ if primary else None,
            'stdoutBytes':len(buffers[0]),'stderrBytes':len(buffers[1]),
            'combinedBytesObserved':observed,'combinedCapBytes':C.QUERY_LIMIT,
            'wallBeforeStatusSaveSeconds':time.monotonic()-started,
            'childReaped':child is None or child.poll() is not None,
            'bufferEvidenceErrors':evidence_errors})
    if primary is not None:
        raise primary
    text=bytes(buffers[0]).decode('utf8')
    C.require(code==0 and failed is None and not evidence_errors,
              'bounded child failed: '+label)
    C.require(time.monotonic()<deadline,'CLIENT_30S_DEADLINE_AT_RETURN: '+label)
    return text

def psql(file,label,variables=None,timeout=30):
    args=[str(PGBIN/'psql'),'-X','-qAt','-w','-h',str(SOCKET),
        '-U','postgres','-d',C.DATABASE,'-v','ON_ERROR_STOP=1']
    for key,value in (variables or {}).items():
        args+=['-v',key+'='+value]
    return capture(args+['-f',str(file)],label,timeout=timeout)

def rest_logger(child, stream):
    state={'eof':threading.Event(),'overflow':threading.Event(),'errors':[],
           'count':0,'versionSeen':False,'thread':None}
    def drain():
        tail=bytearray()
        try:
            while True:
                block=child.stdout.read1(4096)
                if not block:
                    state['eof'].set()
                    break
                state['count']+=len(block)
                tail.extend(block)
                del tail[:-1024]
                if b'Starting PostgREST 12.2.3...' in tail:
                    state['versionSeen']=True
                before=stream.tell()
                stream.write(block[:max(0,C.QUERY_LIMIT-before)])
                stream.flush()
                if state['count']>C.QUERY_LIMIT:
                    state['overflow'].set()
        except BaseException as error:
            state['errors'].append({'type':type(error).__name__})
        finally:
            try:
                child.stdout.close()
            except BaseException as error:
                state['errors'].append({'type':type(error).__name__})
    state['thread']=threading.Thread(target=drain,daemon=True)
    state['thread'].start()
    return state

def rest_eof(state):
    state['thread'].join(timeout=5)
    return {'eofObserved':state['eof'].is_set(),'drainEnded':not state['thread'].is_alive(),
            'overflow':state['overflow'].is_set(),'errors':list(state['errors']),
            'totalObservedBytes':state['count'],'versionSeen':state['versionSeen']}

def copy_complete(before):
    C.require(not PGDATA.exists(),'derived PGDATA must be new')
    PGDATA.mkdir(mode=0o700)
    for row in before['records']:
        guard()
        if row['path']=='.':
            continue
        source,target=SOURCE/row['path'],PGDATA/row['path']
        if row['type']=='directory':
            target.mkdir(mode=row['mode'])
            target.chmod(row['mode'])
        else:
            with source.open('rb') as inp,target.open('xb') as out:
                while block:=inp.read(C.MIB):
                    guard()
                    out.write(block)
            target.chmod(row['mode'])
    PGDATA.chmod(before['records'][0]['mode'])

def proc_diagnostic(pid):
    # Explicit known child PID only. Unreadable is unknown, never zero.
    try:
        status={k:v.strip() for k,sep,v in (r.partition(':') for r in
            Path('/proc',str(pid),'status').read_text().splitlines()) if sep}
        return {'pid':pid,'readable':True,'status':{k:status.get(k) for k in
            ('VmRSS','RssAnon','RssFile','RssShmem','VmSwap','Threads')},
            'ioRaw':Path('/proc',str(pid),'io').read_text()}
    except OSError as error:
        return {'pid':pid,'readable':False,'errorType':type(error).__name__}

def physical_auth(value):
    C.require(value['rows']==1 and value['physicalBytes']==606 and
              value['ledgerRows']==6000 and value['referencedLedgerRows']==6000,
              'small physical root and unchanged 6000 native ledger rows')
    data=value['data']
    C.require(type(data) is dict and set(data)=={'_authStoreRevision','_llmUsageRef','_authStateRef'}
              and C.uuid4(data['_authStoreRevision'])
              and data['_llmUsageRef']['count']==6000,'exact physical three-field root/revision')
    return data

def validate_phase_probe(probe, expected_node_pid, expected_config, actual_source_pins, selected_source_pins):
    """Pure scalar receipt validation. All identities/pins are explicit caller inputs."""
    def require(ok, reason):
        if not ok:raise RuntimeError(reason)
    def same_keys(value, expected):
        require(type(value) is dict and set(value)==set(expected),'phase exact scalar field whitelist')
    def integer(value):
        require(type(value) is int and 0<=value<=9007199254740991,'phase safe nonnegative integer')
    def counter(value):
        require(type(value) is str and re.fullmatch('0|[1-9][0-9]{0,19}',value) and
                int(value)<=18446744073709551615,'phase bounded u64 decimal counter; missing never zero')
        return int(value)
    def moment(value):
        same_keys(value,('monotonicMilliseconds','utcISO'))
        m=value['monotonicMilliseconds'];s=value['utcISO']
        require(type(m) in (int,float) and 0<=m<=9007199254740991,'phase finite nonnegative monotonic clock')
        require(type(s) is str and 0<len(s)<=32 and s.isascii(),'phase bounded ASCII UTC text')
        d=datetime.datetime.fromisoformat(s)
        require(d.tzinfo is not None and d.utcoffset()==datetime.timedelta(0),'phase explicit UTC timestamp')
        return m,d
    same_keys(expected_config,('schema','groupInode','maximumFrames','maximumExtraJSONBytes','plannedLabels'))
    require(expected_config['schema']=='helmut-auth-write-phase-probe-config/1' and
            type(expected_config['maximumFrames']) is int and expected_config['maximumFrames']==14 and
            type(expected_config['maximumExtraJSONBytes']) is int and expected_config['maximumExtraJSONBytes']==49152,
            'phase immutable fourteen-frame49152B method')
    integer(expected_node_pid);integer(expected_config['groupInode'])
    require(expected_node_pid>0 and expected_config['groupInode']>0,'phase positive known PID/group identity')
    labels=expected_config['plannedLabels']
    require(type(labels) is list and len(labels)==14 and all(type(x) is str for x in labels) and len(set(labels))==14,
            'phase exact unique predeclared labels')
    same_keys(actual_source_pins,('u','parts'));same_keys(selected_source_pins,('u','parts'))
    for role,path in [('u','/workspace/helmut-cpu-epoch-20261015/lib/helmut/llm-usage-atomic.js'),
                      ('parts','/workspace/helmut-cpu-epoch-20261015/lib/helmut/auth-state-parts.js')]:
        actual,selected=actual_source_pins[role],selected_source_pins[role]
        for item in (actual,selected):
            same_keys(item,('path','bytes','sha256'));integer(item['bytes'])
            require(item['bytes']>0 and type(item['path']) is str and item['path'].startswith('/') and
                    type(item['sha256']) is str and re.fullmatch('[a-f0-9]{64}',item['sha256']),'phase source pin shape')
        require(actual['path']==path and (actual['bytes'],actual['sha256'])==(selected['bytes'],selected['sha256']),
                'phase actual readonly canonical source bytes differ from selected frozen overlays')
    frame_keys=('label','nodePID','groupInode','begin','peakBefore','process','processLifetimeMaxRSSKiB','v8','group','peakAfter','end')
    process_keys=('rss','heapTotal','heapUsed','external','arrayBuffers')
    v8_keys=('total_heap_size','total_heap_size_executable','total_physical_size','total_available_size',
        'used_heap_size','heap_size_limit','malloced_memory','peak_malloced_memory','external_memory',
        'number_of_native_contexts','number_of_detached_contexts','total_global_handles_size','used_global_handles_size')
    stat_keys=('anon','file','kernel','shmem','kernel_stack','pagetables','slab','sock','file_mapped')
    cpu_keys=('usage_usec','user_usec','system_usec','nr_periods','nr_throttled','throttled_usec')
    io_values=('rbytes','wbytes','rios','wios','dbytes','dios');io_keys=('device',*io_values)
    fixed={'schema':'helmut-auth-write-phase-frames/1','maximumFrames':14,'maximumExtraJSONBytes':49152,
        'maximumFrameJSONBytes':3072,'maximumEnvelopeJSONBytes':4096,'staticMaximumJSONBytes':47117,
        'plannedLabels':labels,'groupPath':'/owned-group','groupInode':expected_config['groupInode'],
        'memoryStatSelectedKeys':list(stat_keys),'cpuStatSelectedKeys':list(cpu_keys),
        'v8SelectedKeys':list(v8_keys),'ioSelectedKeys':list(io_values),
        'maximumIODeviceRows':4,'maximumRawCounterFileBytes':4096,'snapshotsAtomic':False,
        'fileIncludesShmem':True,'externalIncludesArrayBuffers':True,'maxRSSUnit':'KiB',
        'peakIncreasesInsideFramesObserverAmbiguous':True,'betweenFramesIncludeRecordingOverhead':True,
        'metadataSerializationAfterFrameEnd':True,'exactPeakOwnerClaimed':False,'allocatorCauseClaimed':False,
        'inputObjectsRetained':False,'complete':True}
    same_keys(probe,(*fixed,'extraMetadataBytes','frames'))
    for key,value in fixed.items():
        require(type(probe[key]) is type(value) and probe[key]==value,'phase exact envelope policy/interpretation')
    require(type(probe['frames']) is list and len(probe['frames'])==14,'fourteen exact phase frames required')
    integer(probe['extraMetadataBytes'])
    encoded=json.dumps({'phaseProbe':probe},separators=(',',':')).encode()
    require(0<len(encoded)==probe['extraMetadataBytes']<=47117 and len(encoded)<=49152,
            'phase exact complete added-metadata byte receipt and49152B cap')
    empty_envelope={**probe,'frames':[]}
    require(len(json.dumps({'phaseProbe':empty_envelope},separators=(',',':')).encode())<=4096,
            'phase whole empty envelope4096B cap')
    previous_end=None;previous_peak=None;first_begin=None
    for index,frame in enumerate(probe['frames']):
        same_keys(frame,frame_keys)
        require(len(json.dumps(frame,separators=(',',':')).encode())<=3072,'phase per-frame3072B cap')
        require(frame['label']==labels[index] and type(frame['nodePID']) is int and
                frame['nodePID']==expected_node_pid and type(frame['groupInode']) is int and
                frame['groupInode']==expected_config['groupInode'],'phase exact label/order/captured PID/group inode')
        begin=moment(frame['begin']);end=moment(frame['end'])
        require(begin[0]<=end[0] and begin[1]<=end[1] and end[0]-begin[0]<=30000,'phase valid complete begin/end brackets')
        if previous_end is not None:
            require(previous_end[0]<=begin[0] and previous_end[1]<=begin[1],'phase ordered nonoverlapping frame clocks')
        if first_begin is None:first_begin=begin
        require(end[0]-first_begin[0]<=30000 and (end[1]-first_begin[1]).total_seconds()<=30,
                'phase frames inside unchanged30s Node batch')
        before=counter(frame['peakBefore']);after=counter(frame['peakAfter'])
        require(0<before<=after and (previous_peak is None or previous_peak<=before),'phase lifetime peak never reset')
        same_keys(frame['process'],process_keys)
        for value in frame['process'].values():integer(value)
        require(frame['process']['rss']>0,'phase captured Node resident counter required')
        integer(frame['processLifetimeMaxRSSKiB']);same_keys(frame['v8'],v8_keys)
        for value in frame['v8'].values():integer(value)
        require(frame['v8']['heap_size_limit']==452984832,'phase original Node384plus16 heap limit')
        same_keys(frame['group'],('memoryCurrentBytes','memoryStat','cpuStat','ioStat'))
        current=counter(frame['group']['memoryCurrentBytes'])
        require(0<current<=after,'phase current counter within last observed lifetime high-water')
        same_keys(frame['group']['memoryStat'],stat_keys);same_keys(frame['group']['cpuStat'],cpu_keys)
        for value in [*frame['group']['memoryStat'].values(),*frame['group']['cpuStat'].values()]:counter(value)
        rows=frame['group']['ioStat'];require(type(rows) is list and len(rows)<=4,'phase at most four IO devices')
        devices=[]
        for row in rows:
            same_keys(row,io_keys);device=row['device']
            require(type(device) is str and re.fullmatch('[0-9]{1,10}:[0-9]{1,10}',device) and device not in devices,
                    'phase exact unique bounded IO device')
            devices.append(device)
            for key in io_values:counter(row[key])
        previous_end=end;previous_peak=after
    return {'frames':14,'serializedAddedMetadataBytes':len(encoded),'capturedNodePID':expected_node_pid,
        'groupInode':expected_config['groupInode'],
        'maximumFramePeakAfterBytes':max(int(x['peakAfter']) for x in probe['frames']),
        'currentCountersDecomposePeak':False,'allocatorOrRetainedObjectCauseProven':False}



def main():
    global CONFIG,CLOSING,PHASE,LIBRARY_PATH,REST_STATE
    CONFIG=json.loads((OUT/'WORKER_CONFIG.SAFE.json').read_text())
    phases=[]
    pg=None
    log_thread=None
    log_count=0
    log_tail=bytearray()
    log_full=bytearray()
    log_overflow=threading.Event()
    log_eof=threading.Event()
    log_errors=[]
    before=None
    source_unchanged=False
    copied_verified=False
    clean_pg=False
    jit_report=None
    catalog_before=None
    catalog_after=None
    original_qualified=False
    renderer_qualified=False
    graph_qualified=False
    operations_done=False
    catalog_unchanged=False
    mode=CONFIG.get('measurementMode')
    lifecycle=CONFIG.get('lifecycleResultPin')
    rest=None
    rest_log=None
    stop_helper=None
    stop_receipt=None
    stop_receipt_pin=None
    rest_pins=None
    socket_ready=False
    node_started=False
    node_exit=None
    node_pid=None
    auth_rpc_count=0
    selected=None
    small_before=None
    small_after=None
    small_qualified=False
    cycle_records=[]
    phase_probe_summary=None
    failed=None
    failure_reason=None
    started=time.monotonic()
    def stop(signum,frame):
        raise InterruptedError('owned worker stop')
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    def record(phase):
        global PHASE
        PHASE=phase
        phases.append(snapshot())
    def drain():
        nonlocal log_count
        try:
            while True:
                block=pg.stdout.read1(4096)
                if not block:
                    log_eof.set()
                    break
                log_count+=len(block)
                log_full.extend(block[:max(0,C.QUERY_LIMIT-len(log_full))])
                log_tail.extend(block)
                del log_tail[:-16384]
                if log_count>C.QUERY_LIMIT:
                    log_overflow.set()
        except BaseException as error:
            log_errors.append({'type':type(error).__name__,'message':str(error)[:240]})
    try:
        selected=C.selected_measurement(CONFIG['preparation'],mode,CONFIG['selection']['variant'])
        C.validate_run_inputs(CONFIG['preparation'],selected,lifecycle,CONFIG['preparedPin'])
        C.require(CONFIG['selection']==selected,'worker exact mode/install/lifecycle binding')
        C.require(os.getuid()==1000 and GROUP.stat().st_ino==CONFIG['parentInode'],
                  'owned UID/parent inode')
        C.require(Path('/proc/self/cgroup').read_text()=='0::/\n','private cgroup namespace')
        C.require('ro' in mount(SOURCE)['options'],'source PGDATA must be readonly')
        C.require(mount(DISK)['filesystem'] not in ('tmpfs','ramfs') and
                  'rw' in mount(DISK)['options'],'PGDATA requires persistent disk')
        C.require(mount(RAM)['filesystem']=='tmpfs' and
                  os.statvfs(RAM).f_blocks*os.statvfs(RAM).f_frsize==C.RAM_LIMIT,
                  'bounded original-JIT/socket-only tmpfs')
        C.require(mount(Path('/usr/lib/postgresql/17/lib'))['filesystem']=='tmpfs',
                  'owned JIT link mount')
        for item in CONFIG['preparation']['files']:
            actual=C.pin(Path('/tools')/Path(item['path']).name)
            C.require((actual['bytes'],actual['sha256'])==(item['bytes'],item['sha256']),
                      'prepared worker/SQL closure drift')
        for item in CONFIG['preparation']['metadataAndCodeInputs']:
            C.checked(item)
        for canonical,item in ((C.CANONICAL_U,selected['uOverlayPin']),
                               (C.CANONICAL_PARTS,selected['partsOverlayPin'])):
            C.require('ro' in mount(canonical)['options'],'canonical selected module overlay readonly')
            actual=C.pin(canonical)
            C.require((actual['bytes'],actual['sha256'])==(item['bytes'],item['sha256']),
                      'actual canonical selected module bytes differ')
        for b in CONFIG['runtimeBindings']:
            actual=C.pin(b['imagePath'])
            C.require((actual['bytes'],actual['sha256'])==(b['source']['bytes'],b['source']['sha256']),
                      'actual original runtime file drift')
        record('source-before-hash')
        C.require(not(SOURCE/'postmaster.pid').exists(),'source postmaster marker')
        before=C.manifest(SOURCE,guard)
        C.require((before['fileCount'],before['fileBytes'],before['manifestSHA256'])==
                  (1709,369399611,C.SOURCE_SHA),'complete original V11 source binding')
        C.save(OUT,'SOURCE_BEFORE_FULL_MANIFEST.PRIVATE.json',before)
        record('persistent-copy')
        copy_complete(before)
        copied=C.manifest(PGDATA,guard)
        C.require(copied==before,'persistent complete clone differs')
        copied_verified=True
        C.save(OUT,'COPIED_MANIFEST_VERIFIED.SAFE.json',
            {k:copied[k] for k in ('schema','fileCount','fileBytes','manifestSHA256')})
        record('original-JIT-restoration')
        helper_path=C.D/'jit-closure-v2/restore_original_jit.py'
        helper_pins=[x for x in CONFIG['preparation']['metadataAndCodeInputs']
                     if x['path']==str(helper_path)]
        C.require(len(helper_pins)==1,'JIT helper outside adopted source closure')
        helper=C.load('spill_original_jit',helper_path,expected_pin=helper_pins[0])
        jit_report=helper.restore(RAM/'jit-root',cgroup_dir=GROUP,
                                   expected_cgroup_membership='0::/\n')
        C.require(len(jit_report['postgresLibLinks'])==3,'original JIT lib links')
        for entry in jit_report['postgresLibLinks']:
            p,target=Path(entry['path']),Path(entry['target'])
            C.require(p.parent==Path('/usr/lib/postgresql/17/lib') and
                      target.is_relative_to(RAM/'jit-root') and target.exists(),
                      'JIT link confinement')
            p.symlink_to(target)
        LIBRARY_PATH=jit_report['libraryPath']+':/usr/lib/x86_64-linux-gnu'
        C.save(OUT,'RESTORED_ORIGINAL_JIT.SAFE.json',jit_report)
        control=capture([str(PGBIN/'pg_controldata'),str(PGDATA)],'OFFLINE_BEFORE')
        fields=dict((a.strip(),b.strip()) for a,sep,b in
                    (line.partition(':') for line in control.splitlines()) if sep)
        C.require(fields.get('Database cluster state')=='shut down' and
                  fields.get('Bytes per WAL segment')=='16777216','exact shut-down PG17 source')
        record('start-PG')
        SOCKET.mkdir(mode=0o700)
        args=[str(PGBIN/'postgres'),'-D',str(PGDATA),'-k',str(SOCKET),'-p','5432']
        settings={'listen_addresses':'','data_directory':str(PGDATA),
            'hba_file':str(PGDATA/'pg_hba.conf'),'ident_file':str(PGDATA/'pg_ident.conf'),
            'shared_buffers':'128MB','work_mem':'4MB',
            'temp_file_limit':'128MB','max_parallel_workers_per_gather':'0',
            'jit':'on','autovacuum':'off','default_transaction_read_only':'off',
            'statement_timeout':'30s','lock_timeout':'1s','logging_collector':'off',
            'log_statement':'none','log_min_duration_statement':'-1','helmut.local_usage_experiment':'on'}
        for key,value in settings.items():
            args+=['-c',key+'='+value]
        pg=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,env=env())
        log_thread=threading.Thread(target=drain,daemon=True)
        log_thread.start()
        ready=time.monotonic()+30
        while not (SOCKET/'.s.PGSQL.5432').exists() or b'database system is ready to accept connections' not in log_tail:
            guard()
            C.require(pg.poll() is None and time.monotonic()<ready and not log_overflow.is_set()
                      and not log_errors,
                      'bounded PG readiness')
            time.sleep(.05)
        record('original-catalog-qualification')
        catalog_before=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_BEFORE'))
        expected=C.read(next(x for x in CONFIG['preparation']['metadataAndCodeInputs']
                        if x['path']==str(C.D/'candidate-abba-02/ACTUAL_NATIVE_CATALOG.SAFE.json')))['before']
        C.require(catalog_before['catalog']==expected,'full original native catalog qualification')
        C.require(catalog_before['store']=={'rows':1,'physicalBytes':606,
          'sha':'9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'},
          'original physical auth must remain at 6000')
        C.require(catalog_before['identity']['database']==C.DATABASE and
                  catalog_before['identity']['oid']=='18405' and
                  catalog_before['identity']['versionNum']=='170006','actual PG17.6 identity')
        C.require(catalog_before['identity']['dataDirectory']==str(PGDATA) and
                  catalog_before['identity']['hbaFile']==str(PGDATA/'pg_hba.conf') and
                  catalog_before['identity']['identFile']==str(PGDATA/'pg_ident.conf'),
                  'actual PG configuration must target only the new clone')
        small_before=json.loads(psql(Path('/tools/small-auth.sql'),'SMALL_AUTH_BEFORE'))
        physical_auth(small_before)
        C.require({k:small_before[k] for k in ('rows','physicalBytes','sha')}==catalog_before['store'],
                  'independent small original physical root equals full catalog SHA')
        original_qualified=True
        record('install-selected-renderer')
        psql(Path('/tools')/Path(selected['rendererInstallSQLPin']['path']).name,'RENDERER_SETUP',
             {'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256']})
        catalog_after=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_AFTER'))
        target=copy.deepcopy(catalog_before)
        target['catalog']['state']['functions']['helmut_auth_state_expand_local_v1']['hash']=selected['expectedRendererBodySHA256']
        C.require(catalog_after==target,'only selected exact renderer body may change; ABI/ACL/store/roles unchanged')
        renderer_qualified=True
        catalog_renderer=catalog_after
        psql(Path('/tools')/Path(selected['installSQLPin']['path']).name,'GRAPH_SETUP_SELECTED',
             {'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256']})
        catalog_after=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_SELECTED'))
        target['catalog']['state']['functions']['helmut_auth_state_graph_read_v1']['hash']=selected['expectedBodySHA256']
        C.require(catalog_after==target,'only selected graph_read body may change; complete ABI/ACL/Auth unchanged')
        graph_qualified=True
        C.save(OUT,'ACTUAL_NATIVE_CATALOG.SAFE.json',{'before':catalog_before,'installed':catalog_after,
            'rendererInstalled':catalog_renderer,'fullOriginalCatalogQualified':True,
            'onlyReviewedRendererAndSelectedGraphBodyChanged':True,'selection':selected,'comparisonScope':'RESTORE_WRITE_PHASE_ALLOCATION_ONLY',
            'setupSQLSessions':5,'setupSQLStatements':29,
            'additionalV8ObservationSQL':'two small physical roots; six cycle metrics in comparison only; final catalog separately',
            'setupStatementCountScope':'three catalog files x5, selected renderer install6, selected graph install8; identical current NEW wrappers in both comparator arms'})
        C.require(not log_overflow.is_set(),'PG log cap')
        record('start-owned-PostgREST')
        helper_pin=next(x for x in CONFIG['preparation']['files']
                        if Path(x['path']).name=='postgrest_lifecycle.py')
        helper_actual={**helper_pin,'path':'/tools/postgrest_lifecycle.py'}
        stop_helper=C.load('v6_strict_postgrest_stop',Path(helper_actual['path']),expected_pin=helper_actual)
        config_path=RAM/'postgrest.conf'
        config_path.write_text(C.POSTGREST_CONFIG)
        config_path.chmod(0o600)
        C.save_bytes(OUT,'POSTGREST_CONFIG.PRIVATE.txt',C.POSTGREST_CONFIG.encode())
        rest_pins={'binary':CONFIG['preparation']['postgrestBinaryPin'],'config':C.pin(config_path)}
        C.checked(rest_pins['binary'])
        C.require(rest_pins['config']['sha256']==selected['postgrestConfigSHA256'],
                  'exact current clone-only PostgREST config')
        C.floor(OUT,C.QUERY_LIMIT)
        C.require(C.output_bytes(OUT)+C.QUERY_LIMIT<=C.OUTPUT_LIMIT,'reserve capped PostgREST log evidence')
        rest_log=(OUT/'POSTGREST_LOG.PRIVATE.txt').open('xb')
        Path(rest_log.name).chmod(0o600)
        rest=subprocess.Popen([rest_pins['binary']['path'],rest_pins['config']['path']],
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env())
        REST_STATE=rest_logger(rest,rest_log)
        ready=time.monotonic()+15
        while True:
            guard()
            C.require(rest.poll() is None and time.monotonic()<ready,'bounded live PostgREST socket readiness')
            try:
                with socket.create_connection(('127.0.0.1',38419),timeout=.1):
                    socket_ready=True
                if REST_STATE['versionSeen']:
                    break
                time.sleep(.05)
            except OSError:
                time.sleep(.05)
        C.require(REST_STATE['versionSeen'],'actual pinned PostgREST 12.2.3 startup banner')
        record('PostgREST-socket-ready-no-HTTP-probe')
        if mode=='write-phase':
            (OUT/'node-observations').mkdir(mode=0o700)
            node_started=True
            phase_config={'schema':'helmut-auth-write-phase-probe-config/1',
                'groupInode':CONFIG['parentInode'],'maximumFrames':C.PHASE_MAX_FRAMES,
                'maximumExtraJSONBytes':C.PHASE_MAX_EXTRA_JSON_BYTES,'plannedLabels':C.PHASE_LABELS}
            C.save(OUT,'CLIENT_CONFIG.SAFE.json',{'variant':selected['variant'],
                'uOverlayPin':selected['uOverlayPin'],'partsOverlayPin':selected['partsOverlayPin'],
                'phaseProbe':phase_config})
            def observe_cycle(child,outer_deadline):
                # Handshake metadata is tiny, exact, same order/overhead in both
                # variants. All SQL/EOF/wait work consumes the SAME Node 30s.
                index=len(cycle_records)+1
                marker=OUT/('CYCLE_'+str(index)+'.MARKER.SAFE.json')
                if not marker.exists():
                    return
                C.require(index<=6 and not marker.is_symlink() and marker.stat().st_size<=512,
                          'bounded exact cycle marker')
                item=json.loads(marker.read_text())
                expected={'schema':'helmut-auth-write-phase-cycle-marker/1','sequence':index,
                    'round':(index-1)//2,'edge':'start' if index%2 else 'end','nodePID':child.pid}
                C.require(item==expected,'exact cycle order/round/known Node PID')
                native=snapshot()
                native['phase']='cycle-'+str(item['round'])+'-'+item['edge']
                native['ioStatRaw']=(GROUP/'io.stat').read_text()
                proc={'node':proc_diagnostic(child.pid),'postgres':proc_diagnostic(pg.pid),
                      'postgrest':proc_diagnostic(rest.pid)}
                remaining=outer_deadline-time.monotonic()
                C.require(remaining>0,'cycle observer within same client deadline')
                sql=json.loads(psql(Path('/tools/cycle-metrics.sql'),'CYCLE_'+str(index)+'_SQL',
                                    timeout=min(30,remaining)))
                C.require(time.monotonic()<outer_deadline,'same Node wall after metrics SQL EOF/wait')
                row={'marker':item,'native':native,'processes':proc,'sql':sql,
                     'overheadIncluded':True,'noSummedMemoryPeaks':True,
                     'postgresStatsMayLag':True,'forcedStatsFlush':False}
                C.save(OUT,'CYCLE_'+str(index)+'.OBSERVATION.SAFE.json',row)
                ack='CYCLE_'+str(index)+'.ACK.SAFE.json'
                C.require(not(OUT/ack).exists(),'cycle ACK must be new')
                C.save(OUT,ack+'.tmp',item)
                (OUT/(ack+'.tmp')).rename(OUT/ack) # Publish complete ACK atomically.
                cycle_records.append(row)
            node_text=capture([str(C.NODE_ROOT/'bin/node'),'--max-old-space-size=384',
                '--max-semi-space-size=16','--require='+str(C.BIN/'http-meter.js'),
                '/tools/control-driver.js'],'NODE_CONTROL',extra_env={
                    'HELMUT_NATIVE_NODE_OLD_SPACE_MIB':'384',
                    'HELMUT_RESOURCE_METER_DIR':'/bench/node-observations',
                    'HELMUT_STORAGE_BACKEND':'supabase','SUPABASE_URL':'http://127.0.0.1:38419',
                    'SUPABASE_SERVICE_ROLE_KEY':'isolated-no-provider-secret',
                    'HELMUT_AUTH_STORE_CAS_TRANSPORT':'scalar-jsonb-rpc',
                    'HELMUT_LLM_USAGE_STORAGE':'relational-atomic-v1',
                    'HELMUT_AUTH_STATE_STORAGE':'merkle-auth-v1',
                    'HELMUT_AUTH_HISTORY_READ_REUSE':'verified-history-reuse-v1',
                    'HELMUT_AUTH_CONTROL_READ':'verified-control-view-v1',
                    'HELMUT_AUTH_GRAPH_READ_REUSE':'off','HELMUT_AUTH_SINGLE_WRITE_CAPTURE':'off'},observer=observe_cycle)
            node_exit=0
            observed=json.loads(node_text)
            node_capture=json.loads((OUT/'NODE_CONTROL.CAPTURE.SAFE.json').read_text())
            C.require(type(node_capture['childPID']) is int and node_capture['childPID']>0 and
                      node_capture['exitCode']==0,'actual same captured Node exit0 for phase frames')
            phase_probe_summary=validate_phase_probe(observed['phaseProbe'],node_capture['childPID'],phase_config,
                {'u':C.pin(C.CANONICAL_U),'parts':C.pin(C.CANONICAL_PARTS)},
                {'u':selected['uOverlayPin'],'parts':selected['partsOverlayPin']})
            C.require(observed['schema']=='helmut-auth-write-phase-27-rpc/1' and observed['variant']==selected['variant'] and observed['pass'] is True
                      and observed['authRPCCount']==27 and observed['fullReadCount']==5 and observed['writeCount']==4
                      and observed['controlReadCount']==18 and observed['mutations']==3 and observed['restoreCount']==1
                      and observed['uCalls']==(['read','write']+['readControl']*6)*3+['read','write','read']
                      and observed['rpcResponsesCompleted']==27 and observed['nativeHTTPSendCount']==27
                      and len(cycle_records)==6
                      and observed['nodeVersion']=='v24.19.0' and observed['noExtraFullAuthSerialization'] is True
                      and observed['freshNativeChecksAcceptedBySelectedU'] is True,
                      'actual deterministic 27-RPC selected U acceptance')
            C.require(json.loads((OUT/'AUTH_WRITE_PHASE.SAFE.json').read_text())==observed,
                      'Node stdout/persisted receipt identity')
            auth_rpc_count=27
        small_after=json.loads(psql(Path('/tools/small-auth.sql'),'SMALL_AUTH_AFTER'))
        before_data=physical_auth(small_before)
        after_data=physical_auth(small_after)
        target_after=copy.deepcopy(small_before)
        if mode=='write-phase':
            C.require(C.uuid4(after_data['_authStoreRevision']) and
                      after_data['_authStoreRevision']!=before_data['_authStoreRevision'] and
                      after_data['_authStoreRevision']==observed['finalRevision'],
                      'only exact fresh confirmed final revision may change')
            target_after['data']['_authStoreRevision']=after_data['_authStoreRevision']
            # This SHA is obtained INDEPENDENTLY from small readonly native SQL,
            # not accepted from the client/candidate. No other field exception.
            target_after['sha']=small_after['sha']
        C.require(small_after==target_after,'all physical fields/refs/root/ledger unchanged except exact revision')
        small_qualified=True
        catalog_final=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_AFTER_OPERATION'))
        expected_final=copy.deepcopy(catalog_after)
        if mode=='write-phase':
            expected_final['store']={k:small_after[k] for k in ('rows','physicalBytes','sha')}
        C.require(catalog_final==expected_final,'complete catalog/ABI/ACL/Auth exact except independently measured revision SHA')
        C.save(OUT,'CATALOG_OPERATION_UNCHANGED.SAFE.json',{'unchangedExceptAuthorizedRevision':True,
            'actual':catalog_final,'authRPCCount':auth_rpc_count,
            'smallBefore':small_before,'smallAfter':small_after,
            'revisionChanged':mode=='write-phase','allOtherPhysicalFieldsExact':True})
        catalog_unchanged=True
        operations_done=True
        record('measurement-complete')
    except BaseException as error:
        failed=type(error).__name__
        failure_reason=str(error)[:240]
    finally:
        CLOSING=True
        PHASE='close-PostgREST-then-PG-and-prove-source'
        if rest is not None:
            try:
                stop_receipt=stop_helper.stop_postgrest(rest,rest_log,known_pid=rest.pid,pins=rest_pins,
                    persist=lambda value:C.save(OUT,'POSTGREST_STOP.SAFE.json',value),
                    prove_log_eof=lambda:rest_eof(REST_STATE),
                    shutdown_policy=CONFIG['preparation']['postgrestShutdownPolicy'])
                C.require(stop_receipt['pass'] is True,'strict PostgREST closure failed')
                stop_receipt_pin=C.pin(OUT/'POSTGREST_STOP.SAFE.json')
            except BaseException as error:
                failed=failed or type(error).__name__
                failure_reason=failure_reason or str(error)[:240]
                # Failure-only fallback for an exception before the strict helper could reap.
                try:
                    if rest.poll() is None:
                        rest.kill()
                        rest.wait(timeout=5)
                    if REST_STATE is not None:
                        rest_eof(REST_STATE)
                    if rest_log is not None and not rest_log.closed:
                        rest_log.close()
                except BaseException as close_error:
                    failed=failed or type(close_error).__name__
                if (OUT/'POSTGREST_STOP.SAFE.json').exists():
                    stop_receipt_pin=C.pin(OUT/'POSTGREST_STOP.SAFE.json')
        if node_started:
            auth_rpc_count=None
            try:
                node_status=json.loads((OUT/'NODE_CONTROL.CAPTURE.SAFE.json').read_text())
                node_exit=node_status['exitCode']
                node_pid=node_status['childPID']
                node_observed=json.loads((OUT/'AUTH_WRITE_PHASE.SAFE.json').read_text())
                auth_rpc_count=node_observed['authRPCCount']
            except BaseException as error:
                failed=failed or type(error).__name__
        if pg is not None:
            try:
                if pg.poll() is None:
                    pg.send_signal(signal.SIGINT)
                    pg.wait(timeout=min(30,max(1,CONFIG['finalDeadlineMonotonic']-time.monotonic())))
                clean_pg=pg.returncode==0
            except BaseException as error:
                failed=failed or type(error).__name__
                if pg.poll() is None:
                    pg.kill()
                    pg.wait(timeout=5)
                clean_pg=False
            if log_thread:
                log_thread.join(timeout=5)
                clean_pg=clean_pg and not log_thread.is_alive()
            clean_pg=clean_pg and not log_overflow.is_set() and log_eof.is_set() and not log_errors
        if clean_pg:
            try:
                control=capture([str(PGBIN/'pg_controldata'),str(PGDATA)],'OFFLINE_AFTER')
                clean_pg=any(a.strip()=='Database cluster state' and b.strip()=='shut down'
                  for a,sep,b in (line.partition(':') for line in control.splitlines()) if sep)
            except BaseException as error:
                failed=failed or type(error).__name__
                clean_pg=False
        try:
            after=C.manifest(SOURCE,guard)
            C.save(OUT,'SOURCE_AFTER_FULL_MANIFEST.PRIVATE.json',after)
            source_unchanged=before is not None and before==after
        except BaseException as error:
            failed=failed or type(error).__name__
        C.save_bytes(OUT,'PG_LOG.PRIVATE.txt',bytes(log_full))
        C.save(OUT,'PG_LOG.SAFE.json',{'totalBytes':log_count,'retainedBytes':len(log_full),
            'retainedTailBytes':len(log_tail),
            'tailSHA256':hashlib.sha256(log_tail).hexdigest(),'logCapBytes':C.QUERY_LIMIT,
            'overflow':log_overflow.is_set(),'completeLogRetained':log_count==len(log_full),
            'eofObserved':log_eof.is_set(),'drainErrors':log_errors,
            'drainThreadEnded':log_thread is not None and not log_thread.is_alive(),
            'fullAuthPayloadExported':False})
        try:
            phases.append(snapshot())
        except BaseException as error:
            failed=failed or type(error).__name__
        C.save(OUT,'PHASES.SAFE.json',phases)
        result={'schema':'helmut-auth-write-phase-worker-result/1',
            'pass':bool(not failed and copied_verified and source_unchanged and clean_pg
                        and operations_done and jit_report and graph_qualified and catalog_unchanged and small_qualified
                        and (mode=='lifecycle-only' or phase_probe_summary is not None)
                        and stop_receipt and stop_receipt['pass'] and stop_receipt_pin
                        and REST_STATE and REST_STATE['versionSeen']),
            'errorType':failed,'failureReason':failure_reason,'postgresExitCode':pg.returncode if pg else None,
            'allOwnedDatabaseChildrenClosed':clean_pg,'sourceUnchangedFullManifest':source_unchanged,
            'pgLogEOFObserved':log_eof.is_set(),'pgLogDrainErrors':log_errors,
            'pgLogDrainThreadEnded':log_thread is not None and not log_thread.is_alive(),
            'sourceManifestSHA256':C.SOURCE_SHA,'sourceFileCount':1709,'sourceFileBytes':369399611,
            'persistentDiskPGDATA':True,'copiedManifestVerified':copied_verified,
            'jitClosureRestored':bool(jit_report),'fullOriginalCatalogQualified':original_qualified,
            'rendererBodyQualified':renderer_qualified,'selectedGraphBodyQualified':graph_qualified,
            'onlyReviewedRendererAndSelectedGraphBodyChanged':graph_qualified,
            'setupSQLSessions':5 if graph_qualified else None,'setupSQLStatements':29 if graph_qualified else None,
            'catalogUnchangedAfterOperation':catalog_unchanged,
            'catalogMeaning':'exact except sole independently observed authorized revision SHA in comparison mode',
            'smallPhysicalSQLSessions':2 if small_qualified else None,
            'cycleMetricSQLSessions':len(cycle_records),
            'smallPhysicalAuthQualified':small_qualified,'cycleObservationCount':len(cycle_records),'postOperationCatalogSessions':1 if catalog_unchanged else 0,
            'measurementMode':mode,'variant':selected['variant'] if selected else None,'selection':selected,'lifecycleResultPin':lifecycle,
            'authRPCCount':auth_rpc_count,'postgrestStarted':rest is not None,
            'postgrestSocketReady':socket_ready,'postgrestVersionQualified':bool(REST_STATE and REST_STATE['versionSeen']),
            'postgrestStopQualified':bool(stop_receipt and stop_receipt['pass'] and stop_receipt_pin),
            'postgrestStopReceiptPin':stop_receipt_pin,'postgrestStopReturnedReceipt':stop_receipt,
            'nodeStarted':node_started,'nodeExitCode':node_exit,'nodePID':node_pid,
            'phaseProbeQualified':bool(mode=='write-phase' and phase_probe_summary),
            'phaseProbeSummary':phase_probe_summary,
            'wallSeconds':time.monotonic()-started,'ramComparisonPerformed':False,'threeRPCPlateauClaimed':False,
            'full500':False,'production':False,'providerCalls':0,'automaticRetry':False}
        C.save(OUT,'WORKER_RESULT.SAFE.json',result)
    return 0 if result['pass'] else 1

if __name__=='__main__':
    raise SystemExit(main())

