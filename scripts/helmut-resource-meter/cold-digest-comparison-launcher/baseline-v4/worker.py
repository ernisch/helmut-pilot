"""Native worker: one persistent clone, unchanged setup, one selected read."""
import copy
import hashlib
import json
import os
import re
import selectors
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

def mount(path):
    rows=[r.split() for r in Path('/proc/self/mountinfo').read_text().splitlines()
          if r.split()[4]==str(path)]
    C.require(len(rows)==1,'exact owned mount missing')
    r=rows[0]
    sep=r.index('-')
    return {'filesystem':r[sep+1],'options':r[5].split(',')+r[sep+3].split(',')}

def guard():
    global LAST_DISK_CHECK
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

def capture(argv,label,timeout=30):
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
            stderr=subprocess.PIPE,env=env())
        sel=selectors.DefaultSelector()
        for i,stream in enumerate((child.stdout,child.stderr)):
            os.set_blocking(stream.fileno(),False)
            sel.register(stream,selectors.EVENT_READ,i)
        while sel.get_map():
            guard()
            if time.monotonic()>=deadline:
                failed='CLIENT_30S_DEADLINE'
                raise TimeoutError(failed)
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
        C.save(OUT,label+'.CAPTURE.SAFE.json',{'exitCode':code,'failure':failed,
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

def psql(file,label,variables=None):
    args=[str(PGBIN/'psql'),'-X','-qAt','-w','-h',str(SOCKET),
        '-U','postgres','-d',C.DATABASE,'-v','ON_ERROR_STOP=1']
    for key,value in (variables or {}).items():
        args+=['-v',key+'='+value]
    return capture(args+['-f',str(file)],label)

def json_stream(text):
    decoder=json.JSONDecoder()
    rows=[]
    pos=0
    while pos<len(text):
        while pos<len(text) and text[pos].isspace():
            pos+=1
        if pos==len(text):
            break
        value,pos=decoder.raw_decode(text,pos)
        rows.append(value)
        C.require(len(rows)<=8,'unexpected extra SQL output')
    return rows

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

def main():
    global CONFIG,CLOSING,PHASE,LIBRARY_PATH
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
    measurement=None
    measurement_attempted=False
    mode=CONFIG.get('measurementMode')
    read_nonce=CONFIG.get('readNonce')
    selected=None
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
        selected=C.selected_measurement(CONFIG['preparation'],mode)
        C.validate_read_nonce(mode,read_nonce)
        C.require(CONFIG['measurementSQLPin']==selected['pin'],'worker measurement SQL pin binding')
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
        original_qualified=True
        record('install-only-reviewed-renderer')
        psql(Path('/tools/install-reviewed-renderer.sql'),'RENDERER_SETUP')
        catalog_after=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_AFTER'))
        target=copy.deepcopy(catalog_before)
        target['catalog']['state']['functions']['helmut_auth_state_expand_local_v1']['hash']=C.NEW_RENDERER
        C.require(catalog_after==target,'only exact renderer body may change; ABI/ACL/store/roles unchanged')
        renderer_qualified=True
        C.save(OUT,'ACTUAL_NATIVE_CATALOG.SAFE.json',{'before':catalog_before,'installed':catalog_after,
            'fullOriginalCatalogQualified':True,'onlyReviewedRendererBodyChanged':True,
            'setupSQLSessions':3,'setupSQLStatements':16,
            'setupStatementCountScope':'two five-statement catalog files plus six-statement install file'})
        C.require(not log_overflow.is_set(),'PG log cap')
        record('single-read-'+mode+'-only')
        measurement_attempted=True
        variables={'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256']}
        if mode in ('02','03'):
            variables['read_nonce']=read_nonce
        text=psql(Path(selected['pin']['path']),selected['capture'],variables)
        rows=json_stream(text)
        C.require(len(rows)==4 and all(isinstance(rows[i],dict) for i in (0,1,3))
                  and rows[0].get('kind')=='bound-original-state'
                  and rows[1].get('kind')=='reachable-metadata'
                  and rows[3].get('kind')=='target-transaction-temp-observation',
                  'exact bounded identity/reachability/temp output shape')
        C.require(all(type(rows[i].get('qualified')) is int and rows[i]['qualified']==1 for i in (0,1,3)),
                  'all actual SQL guards passed')
        C.require(rows[3]['invoker']=='service_role' and
                  rows[0]['cloneReceiptSHA256']==CONFIG['rootAdoptionPin']['sha256'],
                  'actual invoker/adoption binding')
        observed_measurement={'measurementMode':mode,'measurementSQLPin':selected['pin'],
            'identity':rows[0],'reachability':rows[1],'tempObservation':rows[3],
            'readNonce':read_nonce}
        if mode=='01':
            C.require(isinstance(rows[2],list) and len(rows[2])==1 and
                      isinstance(rows[2][0],dict) and 'Plan' in rows[2][0],'exact bounded 01 JSON plan')
            observed_measurement.update(plan=rows[2],sql01Only=True,nativeControl02Executed=False)
        elif mode=='02':
            C.require(all(isinstance(row,dict) for row in rows) and set(rows[2])=={
                'kind','qualified','resultNativeBytes','resultTextBytes','resultTextSHA256',
                'requestTextBytes','requestTextSHA256','payloadOmitted','checksFresh',
                'clientTokenAcceptanceProven','httpTransportMeasured'} and
                rows[2]['kind']=='native-warm-control-result' and
                type(rows[2]['qualified']) is int and rows[2]['qualified']==1,
                'exact bounded 02 four-dictionary output shape')
            C.require(rows[2]['payloadOmitted'] is True and rows[2]['checksFresh'] is True
                and rows[2]['clientTokenAcceptanceProven'] is False
                and rows[2]['httpTransportMeasured'] is False,'02 fresh checks/payload/transport fields')
            C.require(all(type(rows[2][k]) is int and 0<rows[2][k]<=C.QUERY_LIMIT
                          for k in ('resultNativeBytes','resultTextBytes','requestTextBytes'))
                and all(type(rows[2][k]) is str and re.fullmatch('[a-f0-9]{64}',rows[2][k])
                        for k in ('resultTextSHA256','requestTextSHA256')),'02 bounded hashes/sizes')
            # The unchanged pinned SQL's qualified expression checks BOTH
            # historyReuse.nonce and graphReuse.nonce against this supplied UUID.
            # Raw nonce echoes are not emitted by that SQL; do not invent them.
            observed_measurement.update(nativeWarmControlResult=rows[2],nativeControl02Executed=True,
                nonceEchoVerifiedBySQL=True,
                nonceEchoProof='pinned SQL qualified=1 verifies both response nonces against supplied read_nonce',
                clientTokenAcceptanceProven=False,httpTransportMeasured=False)
        else:
            C.require(all(isinstance(row,dict) for row in rows) and set(rows[2])=={
                'kind','qualified','resultNativeBytes','resultTextBytes','resultTextSHA256',
                'requestTextBytes','requestTextSHA256','payloadOmitted','historyReused','graphReused',
                'actualPayloadsChecked','graphNodeCount','graphNodeDigest','nonceEchoVerified',
                'clientTokenAcceptanceProven','httpTransportMeasured'} and
                rows[2]['kind']=='native-cold-control-result' and
                type(rows[2]['qualified']) is int and rows[2]['qualified']==1,
                'exact bounded 03 four-dictionary output shape')
            C.require(rows[2]['payloadOmitted'] is False and rows[2]['historyReused'] is True
                and rows[2]['graphReused'] is False and rows[2]['actualPayloadsChecked'] is False
                and rows[2]['nonceEchoVerified'] is True and type(rows[2]['graphNodeCount']) is int
                and rows[2]['graphNodeCount']==1848
                and rows[2]['graphNodeDigest']==rows[1]['hashesOnlySHA256']
                and rows[2]['clientTokenAcceptanceProven'] is False
                and rows[2]['httpTransportMeasured'] is False,'03 cold graph/history/digest/nonce fields')
            # These are lengths of a large IN-DATABASE result, not captured payload.
            C.require(all(type(rows[2][k]) is int and 0<rows[2][k]<=16*C.MIB
                          for k in ('resultNativeBytes','resultTextBytes'))
                and type(rows[2]['requestTextBytes']) is int
                and 0<rows[2]['requestTextBytes']<=C.QUERY_LIMIT
                and all(type(rows[2][k]) is str and re.fullmatch('[a-f0-9]{64}',rows[2][k])
                        for k in ('resultTextSHA256','requestTextSHA256','graphNodeDigest')),
                '03 bounded result/request hashes and sizes')
            observed_measurement.update(nativeColdControlResult=rows[2],nativeControl03Executed=True,
                nonceEchoVerifiedBySQL=True,
                nonceEchoProof='pinned SQL qualified=1 verifies both response nonces against supplied read_nonce',
                clientTokenAcceptanceProven=False,httpTransportMeasured=False)
        C.save(OUT,selected['artifact'],observed_measurement)
        measurement=observed_measurement
        record('measurement-complete')
    except BaseException as error:
        failed=type(error).__name__
        failure_reason=str(error)[:240]
    finally:
        CLOSING=True
        PHASE='close-PG-and-prove-source'
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
        result={'schema':'helmut-late-read-spill-worker-result/1',
            'pass':bool(not failed and copied_verified and source_unchanged and clean_pg
                        and measurement and jit_report),
            'errorType':failed,'failureReason':failure_reason,'postgresExitCode':pg.returncode if pg else None,
            'allOwnedDatabaseChildrenClosed':clean_pg,'sourceUnchangedFullManifest':source_unchanged,
            'pgLogEOFObserved':log_eof.is_set(),'pgLogDrainErrors':log_errors,
            'pgLogDrainThreadEnded':log_thread is not None and not log_thread.is_alive(),
            'sourceManifestSHA256':C.SOURCE_SHA,'sourceFileCount':1709,'sourceFileBytes':369399611,
            'persistentDiskPGDATA':True,'copiedManifestVerified':copied_verified,
            'jitClosureRestored':bool(jit_report),'fullOriginalCatalogQualified':original_qualified,
            'onlyReviewedRendererBodyChanged':renderer_qualified,
            'setupSQLSessions':3 if renderer_qualified else None,
            'setupSQLStatements':16 if renderer_qualified else None,
            'measurementSQLFilesAttempted':1 if measurement_attempted else 0,
            'measurementSQLFilesCompleted':1 if measurement else 0,
            'measurementMode':mode,'measurementSQLPin':selected['pin'] if selected else None,
            'readNonce':read_nonce,'nonceEchoVerifiedBySQL':bool(mode in ('02','03') and measurement),
            'nativeControl02Attempted':bool(mode=='02' and measurement_attempted),
            'nativeControl02Executed':(True if measurement else None) if mode=='02' and measurement_attempted else False,
            'nativeControl03Attempted':bool(mode=='03' and measurement_attempted),
            'nativeControl03Executed':(True if measurement else None) if mode=='03' and measurement_attempted else False,
            'wallSeconds':time.monotonic()-started,'postgrestStarted':False,'nodeStarted':False,
            'cacheWarmthComparableToFullRunClaimed':False,'full500':False,'production':False,
            'providerCalls':0,'automaticRetry':False}
        C.save(OUT,'WORKER_RESULT.SAFE.json',result)
    return 0 if result['pass'] else 1

if __name__=='__main__':
    raise SystemExit(main())

