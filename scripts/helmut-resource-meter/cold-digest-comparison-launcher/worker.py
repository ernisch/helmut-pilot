"""V5 native worker: selected cold RAM read OR nineteen exact differential pairs."""
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

def qualified_rows(rows,kinds):
    C.require(len(rows)==4 and all(type(row) is dict for row in rows)
              and [row.get('kind') for row in rows]==kinds
              and all(type(row.get('qualified')) is int and row['qualified']==1 for row in rows),
              'four exact qualified native output dictionaries')
    interface=C.read(CONFIG['preparation']['interfacePin'])
    protocol=interface['resource' if CONFIG['measurementMode']=='ram' else 'differential']
    C.require(interface['schema']=='helmut-cold-digest-private-interface/1' and
              protocol['outputKinds']==kinds and len(protocol['outputKeys'])==4 and
              all(set(row)==set(keys) for row,keys in zip(rows,protocol['outputKeys'])),
              'all four dictionary key sets match the frozen exact SQL interface')
    C.require(rows[0]['cloneReceiptSHA256']==CONFIG['rootAdoptionPin']['sha256'] and
              rows[0]['database']==C.DATABASE and rows[0]['databaseOID']==18405,
              'native actual clone/adoption/database binding')

def sha256(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{64}',value)

def validate_ram(rows,selection):
    qualified_rows(rows,['bound-original-state','reachable-metadata','native-cold-control-result',
                         'target-transaction-temp-observation'])
    C.require(rows[0]['expectedGraphReadBodySHA256']==selection['expectedBodySHA256'] and
              rows[3]['invoker']=='service_role' and rows[0]['backendPID']==rows[3]['backendPID'],
              'selected body and same actual RAM backend')
    result=rows[2]
    hashes=('resultTextSHA256','requestTextSHA256','graphNodeDigest','graphSHA256','dataSHA256',
            'stateSHA256','proofSHA256','componentSemanticDigestSHA256')
    C.require(set(result)=={'kind','qualified','resultNativeBytes','resultTextBytes','requestTextBytes',
              'payloadOmitted','historyReused','graphReused','actualPayloadsChecked','graphNodeCount',
              'nonceEchoVerified','clientTokenAcceptanceProven','httpTransportMeasured',*hashes},
              'exact shared OLD/NEW RAM observer result shape')
    C.require(result['payloadOmitted'] is False and result['historyReused'] is True and
              result['graphReused'] is False and result['actualPayloadsChecked'] is False and
              result['nonceEchoVerified'] is True and type(result['graphNodeCount']) is int and
              result['graphNodeCount']==1848 and result['graphNodeDigest']==rows[1]['hashesOnlySHA256'] and
              result['clientTokenAcceptanceProven'] is False and result['httpTransportMeasured'] is False,
              'cold graph/history/digest/nonce/transport guards')
    C.require(all(type(result[k]) is int and 0<result[k]<=16*C.MIB for k in
                  ('resultNativeBytes','resultTextBytes')) and
              type(result['requestTextBytes']) is int and 0<result['requestTextBytes']<=C.QUERY_LIMIT and
              all(sha256(result[k]) for k in hashes),'bounded internal result/request sizes and hashes')

def validate_differential(rows,pair,preparation):
    qualified_rows(rows,['bound-original-state','cold-digest-native-differential',
                         'candidate-ABI-ACL-and-data-unchanged','baseline-body-restored'])
    result=rows[1]
    C.require(set(result)=={'kind','qualified','role','expectedOutcome','caseId','pairNonce',
              'requestInputSHA256','oldFunctionBodySHA256','newFunctionBodySHA256',
              'onlyFunctionBodyCatalogDelta','catalogBeforeSHA256','catalogCandidateSHA256',
              'exactWholeResponsesEqual','identicalErrors','errorSQLSTATE','errorMessage',
              'resultTextBytes','resultNativeBytes','resultTextSHA256','historyReuse','graphReuse',
              'proof','state','revision'},'exact differential metadata shape; no full result payload')
    C.require((result['caseId'],result['role'],result['expectedOutcome'],result['pairNonce'])==
              (pair['caseId'],pair['role'],pair['expectedOutcome'],pair['pairNonce']) and
              result['requestInputSHA256']==hashlib.sha256(pair['requestJSON'].encode()).hexdigest() and
              result['oldFunctionBodySHA256']==C.OLD_GRAPH and
              result['newFunctionBodySHA256']==preparation['variants']['NEW']['bodySHA256'] and
              result['onlyFunctionBodyCatalogDelta'] is True and
              rows[2]['functionBodySHA256']==preparation['variants']['NEW']['bodySHA256'] and
              rows[3]['fullCatalogRestored'] is True and
              all(sha256(result[k]) for k in ('catalogBeforeSHA256','catalogCandidateSHA256')),
              'paired case/role/nonce/candidate/catalog restoration binding')
    if pair['expectedOutcome']=='ok':
        C.require(result['exactWholeResponsesEqual'] is True and result['identicalErrors'] is None and
                  result['errorSQLSTATE'] is None and result['errorMessage'] is None and
                  all(type(result[k]) is int and 0<result[k]<=16*C.MIB for k in
                      ('resultTextBytes','resultNativeBytes')) and sha256(result['resultTextSHA256']),
                  'exact successful whole JSONB response equality')
    else:
        C.require(result['identicalErrors'] is True and result['exactWholeResponsesEqual'] is None and
                  type(result['errorSQLSTATE']) is str and re.fullmatch('[0-9A-Z]{5}',result['errorSQLSTATE']) and
                  type(result['errorMessage']) is str and len(result['errorMessage'].encode())<=512 and
                  all(result[k] is None for k in ('resultTextBytes','resultNativeBytes','resultTextSHA256')),
                  'identical bounded SQLSTATE and error message')

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
    graph_qualified=False
    measurement=None
    measurement_attempted=0
    completed_pairs=[]
    post_diff_catalog_attempted=False
    mode=CONFIG.get('measurementMode')
    variant=CONFIG.get('variant')
    read_nonce=CONFIG.get('readNonce')
    pairs=CONFIG.get('differentialRequests')
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
        selected=C.selected_measurement(CONFIG['preparation'],mode,variant)
        C.validate_run_inputs(CONFIG['preparation'],selected,read_nonce,pairs)
        C.require(CONFIG['selection']==selected,'worker exact mode/variant/SQL/install/case binding')
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
        catalog_renderer=catalog_after
        psql(Path(selected['installSQLPin']['path']),'GRAPH_SETUP_'+(variant or 'OLD'),
             {'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256']})
        catalog_after=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_SELECTED'))
        target['catalog']['state']['functions']['helmut_auth_state_graph_read_v1']['hash']=selected['expectedBodySHA256']
        C.require(catalog_after==target,'only selected graph_read body may change; complete ABI/ACL/Auth unchanged')
        graph_qualified=True
        C.save(OUT,'ACTUAL_NATIVE_CATALOG.SAFE.json',{'before':catalog_before,'installed':catalog_after,
            'rendererInstalled':catalog_renderer,'fullOriginalCatalogQualified':True,
            'onlyReviewedRendererAndSelectedGraphBodyChanged':True,'selection':selected,
            'setupSQLSessions':5,'setupSQLStatements':29,
            'setupStatementCountScope':'three catalog files x5, renderer install6, selected OLD/NEW graph install8'})
        C.require(not log_overflow.is_set(),'PG log cap')
        if mode=='ram':
            record('one-cold-RAM-'+variant)
            measurement_attempted+=1
            rows=json_stream(psql(Path(selected['measurementSQLPin']['path']),'COLD_RAM_'+variant,
                {'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256'],
                 'read_nonce':read_nonce,'expected_graph_read_sha256':selected['expectedBodySHA256']}))
            validate_ram(rows,selected)
            observed_measurement={'selection':selected,'readNonce':read_nonce,'identity':rows[0],
                'reachability':rows[1],'nativeColdControlResult':rows[2],'tempObservation':rows[3],
                'nonceEchoVerifiedBySQL':True,'componentDigestIsWholeResultHash':False,
                'ramComparisonPerformed':False,'clientTokenAcceptanceProven':False,'httpTransportMeasured':False}
            C.save(OUT,'COLD_RAM.SAFE.json',observed_measurement)
            measurement=observed_measurement
        else:
            for index,pair in enumerate(pairs,1):
                record('native-differential-'+pair['caseId'])
                measurement_attempted+=1
                rows=json_stream(psql(Path(selected['measurementSQLPin']['path']),'DIFF_'+str(index).zfill(2),
                    {'root_clone_receipt_sha256':CONFIG['rootAdoptionPin']['sha256'],
                     'diff_case_id':pair['caseId'],'diff_pair_nonce':pair['pairNonce'],
                     'diff_role':pair['role'],'diff_expected_outcome':pair['expectedOutcome'],
                     'diff_request_json':pair['requestJSON']}))
                validate_differential(rows,pair,CONFIG['preparation'])
                receipt={'pair':pair,'rows':rows,'exactComparisonExecutedInDatabase':True,
                         'ramComparisonPerformed':False,'nativePeakIsDiagnosticOnly':True}
                C.save(OUT,'DIFF_'+str(index).zfill(2)+'.SAFE.json',receipt)
                completed_pairs.append(receipt)
            C.require(len(completed_pairs)==C.PAIR_COUNT,'all nineteen pairs completed')
            # One independent whole-catalog read after all nineteen rollback proofs.
            post_diff_catalog_attempted=True
            restored=json.loads(psql(Path('/tools/catalog.sql'),'CATALOG_AFTER_DIFFERENTIAL'))
            C.require(restored==catalog_after,'full original OLD+renderer catalog/ACL/Auth restored after pairs')
            observed_measurement={'selection':selected,'differentialRequests':pairs,'pairs':completed_pairs,
                'exactWholeResponseOrSQLSTATEAndMessageEquality':True,'fullCatalogRestored':True,
                'ramComparisonPerformed':False,'nativePeakIsDiagnosticOnly':True}
            C.save(OUT,'DIFFERENTIAL.SAFE.json',observed_measurement)
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
        result={'schema':'helmut-cold-digest-worker-result/1',
            'pass':bool(not failed and copied_verified and source_unchanged and clean_pg
                        and measurement and jit_report and graph_qualified),
            'errorType':failed,'failureReason':failure_reason,'postgresExitCode':pg.returncode if pg else None,
            'allOwnedDatabaseChildrenClosed':clean_pg,'sourceUnchangedFullManifest':source_unchanged,
            'pgLogEOFObserved':log_eof.is_set(),'pgLogDrainErrors':log_errors,
            'pgLogDrainThreadEnded':log_thread is not None and not log_thread.is_alive(),
            'sourceManifestSHA256':C.SOURCE_SHA,'sourceFileCount':1709,'sourceFileBytes':369399611,
            'persistentDiskPGDATA':True,'copiedManifestVerified':copied_verified,
            'jitClosureRestored':bool(jit_report),'fullOriginalCatalogQualified':original_qualified,
            'rendererBodyQualified':renderer_qualified,'selectedGraphBodyQualified':graph_qualified,
            'onlyReviewedRendererAndSelectedGraphBodyChanged':graph_qualified,
            'setupSQLSessions':5 if graph_qualified else None,
            'setupSQLStatements':29 if graph_qualified else None,
            'postDifferentialCatalogVerificationSessionsAttempted':1 if post_diff_catalog_attempted else 0,
            'postDifferentialCatalogVerificationSessionsCompleted':1 if mode=='differential' and measurement else 0,
            'measurementSQLFilesAttempted':measurement_attempted,
            'ramReadsCompleted':1 if mode=='ram' and measurement else 0,
            'differentialPairsCompleted':len(completed_pairs),
            'measurementMode':mode,'variant':variant,'selection':selected,
            'differentialRequests':pairs,'readNonce':read_nonce,
            'nonceEchoVerifiedBySQL':bool(mode=='ram' and measurement),
            'ramComparisonPerformed':False,'differentialPeakIsDiagnosticOnly':mode=='differential',
            'wallSeconds':time.monotonic()-started,'postgrestStarted':False,'nodeStarted':False,
            'cacheWarmthComparableToFullRunClaimed':False,'full500':False,'production':False,
            'providerCalls':0,'automaticRetry':False}
        C.save(OUT,'WORKER_RESULT.SAFE.json',result)
    return 0 if result['pass'] else 1

if __name__=='__main__':
    raise SystemExit(main())

