#!/usr/bin/env python3
"""Runs a pinned local recipe inside the dedicated application cgroup.

This is measurement plumbing, never Helmut authority. Original stage guards
still authorize every operation. Small meter validation is the only default
scope; a full recipe additionally requires its explicit fresh owner GO pin.
"""
import hashlib
import json
import os
import signal
import subprocess
import sys
import threading
import time
import re
import socket
import importlib.util
import stat
from pathlib import Path
from network_meter import network,settled_network
from http_receipts import HTTPReceiptValidationError,validate as validate_http_receipts

REPO=Path('/workspace/helmut-cpu-epoch-20261015')
NODE=Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
DOCKER=['docker','--host=unix:///var/run/docker.sock']
DATABASE_DIRECTORY=Path('/meter-database')
BACKEND_RESULT='/meter-output/local-postgrest-backend/output/RESULT.SAFE.json'
BACKEND_SCOPE='/meter-output/local-postgrest-backend/SCOPE.SAFE.json'

def close_file(path,limit=65536,expected=None):
    """Bounded stable regular input, including a nonblocking open after lstat."""
    path=Path(path)
    if not path.is_absolute() or path.resolve()!=path or path.is_symlink():raise RuntimeError('noncanonical close evidence')
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1:raise RuntimeError('regular single-link close evidence required')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        info=os.fstat(fd)
        fields=('st_dev','st_ino','st_size','st_nlink','st_mtime_ns','st_ctime_ns')
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or not 0<info.st_size<=limit
                or any(getattr(info,k)!=getattr(before,k)for k in fields)):
            raise RuntimeError('close evidence descriptor changed')
        chunks=[];size=0
        while size<=limit:
            block=os.read(fd,min(65536,limit+1-size))
            if not block:break
            chunks.append(block);size+=len(block)
        if size>limit or size!=info.st_size:raise RuntimeError('bounded complete close evidence required')
        after,current=os.fstat(fd),path.lstat()
        if (not stat.S_ISREG(after.st_mode) or not stat.S_ISREG(current.st_mode) or path.is_symlink() or path.resolve()!=path
                or any(getattr(after,k)!=getattr(info,k)or getattr(current,k)!=getattr(info,k)for k in fields)):
            raise RuntimeError('close evidence changed while reading')
        raw=b''.join(chunks)
        if expected is not None and (expected['bytes']!=size or expected['sha256']!=hashlib.sha256(raw).hexdigest()):
            raise RuntimeError('close evidence pin drift')
        return json.loads(raw)
    finally:os.close(fd)

def close_pin(pin,path=None):
    if (not isinstance(pin,dict)or set(pin)!={'path','bytes','sha256'}or not isinstance(pin['path'],str)
            or type(pin['bytes'])is not int or pin['bytes']<=0
            or not isinstance(pin['sha256'],str)or re.fullmatch('[a-f0-9]{64}',pin['sha256'])is None
            or not Path(pin['path']).is_absolute()or str(Path(pin['path']))!=pin['path']
            or '..'in Path(pin['path']).parts or(path is not None and pin['path']!=path)):
        raise RuntimeError('exact close evidence pin required')

def optional_database_final(final,cfg,directory):
    """PG exit alone cannot confirm the separately owned PostgREST lifecycle."""
    backend=final.get('localPostgrestBackend')
    fields={'enabled','pass','ownerExitCode','resultPin','scopePin','nonce','configPin','containerId','operationId','requestSHA256','failure','production'}
    if (not isinstance(backend,dict)or set(backend)!=fields or backend['enabled']is not True or backend['pass']is not True
            or type(backend['ownerExitCode'])is not int or backend['ownerExitCode']!=0
            or backend['failure']is not None or backend['production']is not False
            or type(final.get('serverExitCode'))is not int or final['serverExitCode']!=0):
        raise RuntimeError('optional database owner closure not confirmed')
    close_pin(backend['resultPin'],BACKEND_RESULT);close_pin(backend['scopePin'],BACKEND_SCOPE)
    close_pin(backend['configPin'],'/tmp/helmut-resource-fixture.conf')
    for key,pattern in [('nonce','[a-f0-9]{32}'),('containerId','[a-f0-9]{64}'),('requestSHA256','[a-f0-9]{64}'),
                        ('operationId','synthetik500-resources[0-9]{2}-[a-f0-9]{12}')]:
        if not isinstance(backend[key],str)or re.fullmatch(pattern,backend[key])is None:raise RuntimeError('owner closure identity malformed')
    # These are the ONLY DB-to-app result/scope translations. Never open the
    # path supplied in resultPin inside the application namespace.
    receipt=close_file(directory/'local-postgrest-backend/output/RESULT.SAFE.json',expected=backend['resultPin'])
    scope=close_file(directory/'local-postgrest-backend/SCOPE.SAFE.json',expected=backend['scopePin'])
    if (receipt.get('schema')!='helmut-local-fullcase-postgrest-owner-result/1'or receipt.get('pass')is not True
            or scope.get('schema')!='helmut-local-fullcase-postgrest-owner-scope/1'):
        raise RuntimeError('actual owner result or scope invalid')
    for key in ['scopePin','nonce','configPin','requestSHA256','containerId','operationId']:
        if receipt.get(key)!=backend[key]:raise RuntimeError('actual owner result binding differs')
    for key in ['nonce','configPin','requestSHA256','containerId','operationId']:
        if scope.get(key)!=backend[key]:raise RuntimeError('actual owner scope binding differs')
    for value in [receipt,scope]:
        if value.get('production')is not False or value.get('automaticRetry')is not False:
            raise RuntimeError('local owner result authority differs')
    if (receipt.get('executionAuthority')is not False or receipt.get('full500Qualification')is not False
            or receipt.get('reason')!='NORMAL_BOUND_STOP'):
        raise RuntimeError('owner result is not a normal local close')
    plan_pin=cfg['localPostgrestBackendPlanPin'];close_pin(plan_pin)
    plan=close_file(plan_pin['path'],limit=1024*1024,expected=plan_pin)
    host=close_file(directory/'LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json')
    if (plan.get('schema')!='helmut-local-supervised-postgrest-backend-plan/1'or plan.get('mode')!='supervised-owner-v1'
            or plan.get('production')is not False or plan.get('automaticRetry')is not False
            or plan.get('operationId')!=backend['operationId']or plan.get('targetDatabase')!=scope.get('targetDatabase')
            or host.get('localPostgrestBackendPlanPin')!=plan_pin or host.get('containerId')!=backend['containerId']
            or host.get('controllerInvocationId')!=scope.get('controllerInvocationId')):
        raise RuntimeError('actual owner close differs from configured backend')
    return backend

def close_owned_database(recipe=None,reason='OWNED_APPLICATION_EXIT_INCLUDING_EARLY_AUTHORITY_FAILURE\n'):
    directory=DATABASE_DIRECTORY
    if not directory.exists():
        if recipe is not None:raise RuntimeError('expected owned database mount missing')
        return {'mounted':False}
    if directory.resolve()!=directory or directory.is_symlink():raise RuntimeError('owned database mount invalid')
    cfg=close_file(directory/'DATABASE_CONFIG.SAFE.json')
    optional='localPostgrestBackendPlanPin'in cfg
    stop_relative='control/STOP_DATABASE'if optional else'STOP_DATABASE'
    if (cfg.get('scope')not in ['small-meter-validation','owner-approved-local500-resources']or
            cfg.get('freshInitdbVolume')is not True or cfg.get('stopFile')!='/meter-output/'+stop_relative or
            cfg.get('finalFile')!='/meter-output/DATABASE_FINAL.SAFE.json'):
        raise RuntimeError('owned database shutdown identity invalid')
    if optional:close_pin(cfg['localPostgrestBackendPlanPin'])
    if recipe is not None:
        if (recipe.get('databaseStopFile')!=str(directory/stop_relative)or recipe.get('databaseFinalFile')!=str(directory/'DATABASE_FINAL.SAFE.json')
                or recipe.get('localPostgrestBackendPlanPin')!=cfg.get('localPostgrestBackendPlanPin')):
            raise RuntimeError('recipe database close binding differs')
    target=directory/stop_relative
    if target.parent.resolve()!=target.parent or target.is_symlink():raise RuntimeError('owned database stop symlink rejected')
    try:
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    except FileExistsError:
        info=target.lstat()
        if not stat.S_ISREG(info.st_mode)or info.st_nlink!=1:raise RuntimeError('owned database stop file invalid')
    else:
        try:os.write(fd,reason.encode())
        finally:os.close(fd)
    until=time.monotonic()+(180 if optional else 45)
    final=directory/'DATABASE_FINAL.SAFE.json'
    while not final.exists()and time.monotonic()<until:time.sleep(.05)
    if not final.exists():raise RuntimeError('owned database shutdown not confirmed')
    result=close_file(final)
    if result.get('serverExitCode')!=0:raise RuntimeError('owned database clean shutdown failed')
    backend=optional_database_final(result,cfg,directory)if optional else None
    return {'mounted':True,'cleanShutdownConfirmed':True,**({'localPostgrestBackend':backend}if optional else{})}

def save_new(path,value):
    with Path(path).open('x') as f:f.write(json.dumps(value,indent=2)+'\n')
    Path(path).chmod(0o600)

def pinned(pin):
    p=Path(pin['path'])
    if p.is_symlink() or not p.is_file():raise RuntimeError('invalid recipe pin')
    b=p.read_bytes()
    if len(b)!=pin['bytes'] or hashlib.sha256(b).hexdigest()!=pin['sha256']:raise RuntimeError('recipe pin drift')
    return b

def assert_claim_identity(recipe_bytes,recipe,claim,hostname):
    if claim.get('schema')!='helmut-local-resource-attempt-claim/1' or not re.fullmatch(r'[a-f0-9]{12}',hostname) or not re.fullmatch(r'[a-f0-9]{64}',claim.get('containerId','')):
        raise RuntimeError('claim identity schema invalid')
    if claim.get('recipeSHA256')!=hashlib.sha256(recipe_bytes).hexdigest() or not claim.get('containerId','').startswith(hostname):
        raise RuntimeError('full run has no exact claimed recipe/container')
    if claim.get('freshOwnerGO')!=recipe['freshOwnerGO'] or claim.get('independentMeterAcceptance')!=recipe['independentMeterAcceptance']:
        raise RuntimeError('claim authority mismatch')

def db_query(container,sql):
    text="BEGIN READ ONLY;SET LOCAL statement_timeout='10s';SET LOCAL application_name='helmut-resource-observer';"+sql+'ROLLBACK;'
    r=subprocess.run(DOCKER+['exec','-i','-u','postgres',container,'psql','-X','-qAt','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],
                     input=text,text=True,capture_output=True,timeout=15,check=True)
    return json.loads(r.stdout.strip()),len(text.encode()),len(r.stdout.encode())

def own_survivors():
    # The container has its own PID namespace. Never traverse host processes.
    result=[]
    for p in Path('/proc').glob('[0-9]*'):
        try:
            pid=int(p.name)
            if pid in [1,os.getpid()]:continue
            status=(p/'status').read_text()
            if '\nState:\tZ' in '\n'+status:continue
            result.append(pid)
        except (FileNotFoundError,PermissionError):pass
    return result

def finish_children():
    if os.getpid()!=1:raise RuntimeError('owned cleanup requires private container PID1')
    pids=own_survivors()
    for pid in pids:
        try:os.kill(pid,signal.SIGTERM)
        except ProcessLookupError:pass
    until=time.monotonic()+15
    while time.monotonic()<until:
        while True:
            try:
                pid,_=os.waitpid(-1,os.WNOHANG)
                if not pid:break
            except ChildProcessError:break
        if not own_survivors():return {'graceful':True,'ownedSurvivorsSignalled':len(pids)}
        time.sleep(.05)
    raise RuntimeError('owned helper did not terminate; complete exit coverage not yet closed')

def run_workflow():
    out=Path('/meter-output');recipe_bytes=Path(sys.argv[1]).read_bytes();recipe=json.loads(recipe_bytes)
    if recipe['scope'] not in ['small-meter-validation','owner-approved-local500-resources']:raise RuntimeError('unknown recipe scope')
    if any(k not in ['PATH','LANG','HELMUT_RESOURCE_METER_DIR'] for k in recipe.get('localEnvironment',{})):
        raise RuntimeError('unapproved inherited environment variable')
    if recipe['scope']=='owner-approved-local500-resources':
        spec=importlib.util.spec_from_file_location('resource_isolation',Path(__file__).with_name('isolation.py'))
        authority=importlib.util.module_from_spec(spec);spec.loader.exec_module(authority)
        authority.verify_full_authority(recipe)
        claim=json.loads(authority.ONCE.read_text())
        assert_claim_identity(recipe_bytes,recipe,claim,socket.gethostname())
        owner=json.loads(pinned(recipe['freshOwnerGO']))
        if owner.get('production') is not False or owner.get('syntheticProfiles')!=500:raise RuntimeError('local GO not bound')
        if recipe['freshOwnerGO']['path'].find('/wave19-resource-meter/')<0:raise RuntimeError('historical owner GO prohibited')
        if recipe.get('full500Attempts')!=1:raise RuntimeError('exactly one attempt required')
        if [x['name'] for x in recipe['stages']]!=['preparation','assembly','sequence'] or any(x.get('expectedExitCode',0)!=0 for x in recipe['stages']):
            raise RuntimeError('full run must preserve all three original stages and successful exits')
    for pin in recipe.get('sourcePins',[]):pinned(pin)
    save_new(out/'RUNNER_STARTED.SAFE.json',{'scope':recipe['scope'],'pid':os.getpid(),'oneAttempt':True,'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
    start=time.monotonic();net_before=network();stages=[];stop=threading.Event();ready=threading.Event();meter_errors=[]
    samples={'count':0,'SQLBytes':0,'answerBytes':0};first_native=None;previous_native=None
    sql=None
    if recipe.get('databaseContainer'):
        budget_args=['--max-old-space-size=384','--max-semi-space-size=16','--require='+str(REPO/'scripts/helmut-resource-meter/http-meter.js')] if recipe['scope']=='owner-approved-local500-resources' else []
        sql=subprocess.run([str(NODE),*budget_args,'-e',"process.stdout.write(require(process.argv[1]).snapshotSQL())",str(REPO/'scripts/helmut-resource-meter/database-meter.js')],capture_output=True,text=True,check=True).stdout
    def record(row,sent,received):
        nonlocal first_native,previous_native
        if row.get('schema')!='helmut-postgres-resource-snapshot/1' or not row.get('version','').startswith('17.'):
            raise RuntimeError('native PostgreSQL snapshot schema/version invalid')
        if row.get('externalTablespaces')!='0':raise RuntimeError('database storage outside owned PGDATA filesystem')
        def lsn(x):
            if not re.fullmatch(r'[0-9A-Fa-f]{1,8}/[0-9A-Fa-f]{1,8}',x):raise RuntimeError('native LSN invalid')
            a,b=x.split('/');return (int(a,16)<<32)+int(b,16)
        lsn(row['walLSN'])
        if any(not re.fullmatch(r'0|[1-9][0-9]*',row['wal'][k]) for k in ['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']):
            raise RuntimeError('native WAL counter invalid')
        if previous_native:
            if lsn(row['walLSN'])<lsn(previous_native['walLSN']) or row['wal']['stats_reset']!=previous_native['wal']['stats_reset']:
                raise RuntimeError('native WAL reset/regression')
            for k in ['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']:
                if int(row['wal'][k])<int(previous_native['wal'][k]):raise RuntimeError('native WAL counter regressed')
            key=lambda x:(x['backend_type'],x['object'],x['context'])
            prior={key(x):x['stats_reset'] for x in previous_native['io']}
            if any(prior.get(key(x),x['stats_reset'])!=x['stats_reset'] for x in row['io']):raise RuntimeError('native IO statistics reset')
            prior={x['oid']:x['stats']['stats_reset'] for x in previous_native['databases']}
            if any(x['oid'] in prior and prior[x['oid']]!=x['stats']['stats_reset'] for x in row['databases']):raise RuntimeError('native database statistics reset')
        if first_native is None:first_native=row
        previous_native=row
        item={'snapshot':row,'measurementSQLBytes':sent,'measurementAnswerBytes':received}
        with (out/'DATABASE_SAMPLES.SAFE.jsonl').open('a') as f:f.write(json.dumps(item)+'\n')
        samples['count']+=1;samples['SQLBytes']+=sent;samples['answerBytes']+=received
    def sample():
        while not stop.is_set():
            try:
                row,sent,received=db_query(recipe['databaseContainer'],sql)
                record(row,sent,received)
                ready.set()
            except Exception as e:meter_errors.append(type(e).__name__)
            stop.wait(recipe.get('databaseSampleIntervalSeconds',1))
    thread=threading.Thread(target=sample,name='owned-db-observer') if sql else None
    if thread:
        thread.start()
        if not ready.wait(timeout=15):
            stop.set();thread.join(timeout=20)
            meter_errors.append('BASELINE_NOT_READY_NO_STAGE_AUTHORIZED')
    status=0;failure=None;failures=[]
    def record_failure(code):
        nonlocal status,failure
        status=1
        if failure is None:failure=code
        if code not in failures:failures.append(code)
    try:
        if meter_errors:raise RuntimeError('complete native database baseline missing; no stage launched')
        for stage in recipe['stages']:
            if recipe['scope']=='owner-approved-local500-resources':authority.verify_connection_files(authority.pin_json(recipe['fixtureConnectionPin']))
            for pin in stage.get('pins',[]):pinned(pin)
            argv=stage['argv'];name=stage['name']
            if not isinstance(argv,list) or not argv or not all(isinstance(x,str) for x in argv):raise RuntimeError('stage argv invalid')
            if not name.replace('-','').replace('_','').isalnum():raise RuntimeError('stage name invalid')
            began=time.monotonic()
            with (out/(name+'.PRIVATE.log')).open('xb') as log:
                child=subprocess.Popen(argv,stdout=log,stderr=subprocess.STDOUT,env={
                    'PATH':os.environ['PATH'],'LANG':'C.UTF-8',
                    'HELMUT_RESOURCE_METER_DIR':str(out/'http'),**recipe.get('localEnvironment',{})},start_new_session=False)
                child.wait(timeout=stage['timeoutSeconds'])
            row={'name':name,'wallMS':(time.monotonic()-began)*1000,'exitCode':child.returncode,
                 'stdoutAndStderrBytes':(out/(name+'.PRIVATE.log')).stat().st_size}
            stages.append(row);save_new(out/(name+'.SAFE.json'),row)
            if child.returncode!=stage.get('expectedExitCode',0):
                record_failure('STAGE_EXIT');break
    except Exception as e:record_failure(type(e).__name__)
    finally:
        stop.set()
        if thread:thread.join(timeout=20)
        if thread and thread.is_alive():record_failure('METER_THREAD_NOT_EXITED')
    try:cleanup=finish_children()
    except Exception:
        record_failure('HELPER_SHUTDOWN_INCOMPLETE');cleanup={'graceful':False}
    final_native=None
    if sql:
        try:
            row,sent,received=db_query(recipe['databaseContainer'],sql)
            record(row,sent,received);final_native=row
            save_new(out/'LAST_LIVE_DATABASE_SNAPSHOT.SAFE.json',row)
        except Exception as e:meter_errors.append(type(e).__name__)
    if recipe.get('databaseStopFile'):
        try:close_owned_database(recipe,'NORMAL_MEASUREMENT_SHUTDOWN\n')
        except Exception:record_failure('DATABASE_LAST_EXIT_NOT_CONFIRMED')
    for pin in recipe.get('sourcePins',[]):pinned(pin)
    if recipe['scope']=='owner-approved-local500-resources':
        authority.verify_connection_files(authority.pin_json(recipe['fixtureConnectionPin']))
        assert_claim_identity(Path(sys.argv[1]).read_bytes(),recipe,json.loads(authority.ONCE.read_text()),socket.gethostname())
    rows=[];start_count=None;http_validation_passed=False;http_error=None
    needs_http=recipe['scope']=='owner-approved-local500-resources' or (bool(stages) and any(any(Path(a).name=='node' for a in s['argv']) for s in recipe['stages']))
    try:
        rows,start_count=validate_http_receipts(out/'http',required=needs_http,strict=recipe['scope']=='owner-approved-local500-resources')
        http_validation_passed=True
    except Exception as error:
        if isinstance(error,HTTPReceiptValidationError):rows,start_count=error.rows,error.start_count
        http_error=type(error).__name__
        record_failure('HTTP_RECEIPTS_INCOMPLETE_OR_INVALID')
    network_tail=None
    try:network_tail=settled_network()
    except Exception:record_failure('NETWORK_TAIL_INCOMPLETE')
    if meter_errors:record_failure('DATABASE_SAMPLE_ERRORS')
    result={'schema':'helmut-resource-process-runner/1','scope':recipe['scope'],'pass':status==0,
            'failure':failure,'failures':failures,'stages':stages,'wallMS':(time.monotonic()-start)*1000,
            'networkBefore':net_before,'networkAfterAllOwnedClientsExited':network(),
            'networkTail':network_tail,'HTTPStartedReceiptCount':start_count,
            'networkMetricsArePerInterfaceDirectionsNotDoubleCountedTotals':True,
            'httpProcessCounters':rows,'httpReceiptValidationPassed':http_validation_passed,
            'httpReceiptValidationErrorType':http_error,
            'httpReceiptCountersAvailable':start_count is not None,
            'databaseSnapshotCount':samples['count'],
            'firstNativeDatabaseSnapshotBeforeAnyStage':first_native,
            'lastNativeDatabaseSnapshotAfterAllClientsExited':final_native,
            'databaseObserverErrors':meter_errors,'databaseObserverSQLBytes':samples['SQLBytes'],
            'databaseObserverAnswerBytes':samples['answerBytes'],
            'observerKeepsOnlyFirstAndLatestSnapshotInRAM':True,
            'helperShutdown':cleanup,'kernelLastExitMeasurementExternalAndStillPending':True,
            'full500Run':recipe['scope']=='owner-approved-local500-resources',
            'paidModelCountMustComeFromOriginalMockGuardReceipts':True,'production':False}
    save_new(out/'RUNNER_RESULT.SAFE.json',result)
    # The host reads the dedicated cgroup only after this process has exited.
    return status

def stop_owned_database():
    """Fixed owned mount, never a path or container name from invalid JSON."""
    return close_owned_database()

def main():
    # Before even the error handler: never enumerate/signal host processes if
    # someone invokes this container entrypoint directly on the host.
    if os.getpid()!=1:raise RuntimeError('owned runner requires private container PID1')
    # Includes JSON parsing, pin/authority checks and observer initialization.
    # No early exception may bypass owned-process and owned-DB cleanup again.
    code=1;error=None;cleanup={}
    try:code=run_workflow()
    except Exception as exception:error=type(exception).__name__
    finally:
        try:cleanup['processes']=finish_children()
        except Exception as exception:code=1;cleanup['processError']=type(exception).__name__
        try:cleanup['database']=stop_owned_database()
        except Exception as exception:code=1;cleanup['databaseError']=type(exception).__name__
    if error or 'processError'in cleanup or 'databaseError'in cleanup:
        path=Path('/meter-output/RUNNER_EARLY_FAILURE.SAFE.json')
        if not path.exists():save_new(path,{'schema':'helmut-owned-runner-failure/1','pass':False,
            'errorType':error,'cleanup':cleanup,'noAutomaticRetry':True,'production':False})
        return 1
    return code

if __name__=='__main__':
    sys.exit(main())
