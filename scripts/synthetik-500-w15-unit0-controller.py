#!/usr/bin/env python3
"""One authorized local sequence. First failure terminal, native cleanup always attempted once."""
import json, os, pathlib, subprocess, hashlib, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=pathlib.Path('/workspace/shared/helmut-w15-unit0b-20261027')
CONTAINER='synthetik500-runtime-pg-7e1c20261027'
DB='helmut_w15_unit0b_20261027'
SOURCE='helmut_w15_input_20261027'
BASE='/tmp/w15-unit0b-20261027'
DOCKER=['docker','--host=unix:///var/run/docker.sock']
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}

def command(args,input=None,timeout=120):
    result=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,cwd=ROOT,timeout=timeout)
    if result.returncode:
        raise RuntimeError('w15-unit0-command-failed:'+args[0]+':'+str(result.returncode))
    return result.stdout

def docker(*args,**kw): return command(DOCKER+list(args),**kw)
def literal(x): return "'"+str(x).replace("'","''")+"'"
def sql(query,database=DB):
    assert database in [DB,SOURCE,'postgres']
    return docker('exec','-i',CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-',input=query.encode()).decode().strip()
def read(query,database=DB): return json.loads(sql("begin read only;set local statement_timeout='15s';"+query+'rollback;',database))
def save(name,value):
    p=WORK/name
    with p.open('x') as f:
        os.chmod(p,0o600);json.dump(value,f,indent=2);f.write('\n')
def copy_in(source,destination): docker('cp',str(source),CONTAINER+':'+destination)
def copy_safe(name):
    data=docker('exec',CONTAINER,'cat',BASE+'/state/'+name)
    p=WORK/name
    with p.open('xb') as f: os.chmod(p,0o600);f.write(data)
def inner(action,timeout=120):
    seconds=timeout-15
    shell='echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-unit0-runtime.js '+action
    args=DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',shell]
    result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,cwd=ROOT,timeout=timeout)
    log=WORK/(action+'.PRIVATE.log')
    with log.open('xb') as f: os.chmod(log,0o600);f.write(result.stdout+result.stderr)
    if result.returncode: raise RuntimeError('w15-unit0-'+action+'-failed-no-retry')

def source_state():
    return read("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'profiles',(select count(*)from mandate_profiles),'identities',(select count(*)from profiles),'profileHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),'storeHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from helmut_store p),'rawHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from raw_documents p));",SOURCE)

def cleanup():
    current=read("select jsonb_build_object('database',current_database(),'active',(select count(*)from mandate_profiles where aktiv));")
    assert current['database']==DB
    context_path=WORK/'cleanup-context.PRIVATE.json'
    result={'before':current,'nativeEndWriteAttempts':0,'automaticRetry':False}
    if current['active']:
        assert current['active']==500 and context_path.exists()
        c=json.loads(context_path.read_text());assert c['database']==DB
        args=[c['operationId'],c['manifestHash'],c['productionCommit'],'notstopp','GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN']
        # One existing native RPC, no write retry. New database is hardcoded.
        result['nativeEndWriteAttempts']=1
        try:
            result['nativeResult']=json.loads(sql("begin;set local lock_timeout='3s';set local statement_timeout='15s';set local role service_role;select public.helmut_synthetik500_ende("+','.join(map(literal,args))+');commit;'))
        except BaseException as error:
            result['nativeWriteOutcome']='unknown';result['writeErrorType']=type(error).__name__
    after=read("select jsonb_build_object('database',current_database(),'active',(select count(*)from mandate_profiles where aktiv));")
    result['after']=after;result['confirmedZero']=after['active']==0
    if context_path.exists():
        c=json.loads(context_path.read_text())
        result['nativeReadback']=read('set local role service_role;select public.helmut_synthetik500_lesung('+','.join(map(literal,[c['operationId'],c['manifestHash'],c['productionCommit']]))+');')
    save('CLEANUP.SAFE.json',result);assert result['confirmedZero']
    assert result.get('nativeWriteOutcome')!='unknown','Native end write outcome remains unknown; no retry'

def stop_inner():
    # GNU timeout has its own process group. Only groups whose owned command
    # still contains this fresh protected path may be signalled.
    docker('exec',CONTAINER,'sh','-c',
      'for a in prepare run; do f='+BASE+'/state/$a.pid; '
      'if test -f "$f"; then p=$(cat "$f"); case "$p" in *[!0-9]*|"") exit 1;; esac; '
      'if test -e /proc/"$p"/cmdline; then '
      'tr "\\000" " " </proc/"$p"/cmdline | grep -Fq '+BASE+' || exit 1; '
      '/bin/kill -TERM -- -"$p"; n=0; '
      'while test -e /proc/"$p"/cmdline && test "$n" -lt 50; do sleep 0.1; n=$((n+1)); done; '
      'if test -e /proc/"$p"/cmdline; then /bin/kill -KILL -- -"$p"; sleep 0.1; fi; '
      'test ! -e /proc/"$p"/cmdline || exit 1; fi; fi; done')

def stop_owned():
    # Only the two child services launched from this new private path.
    docker('exec',CONTAINER,'sh','-c',
      'for f in '+BASE+'/state/gateway.pid '+BASE+'/state/postgrest.pid; do '
      'if test -f "$f"; then p=$(cat "$f"); '
      'case "$p" in *[!0-9]*|"") exit 1;; esac; '
      'if test -e /proc/"$p"/cmdline; then '
      'tr "\\000" " " </proc/"$p"/cmdline | grep -Fq '+BASE+' || exit 1; '
      'kill -TERM "$p"; n=0; '
      'while test -e /proc/"$p"/cmdline && test "$n" -lt 50; do sleep 0.1; n=$((n+1)); done; '
      'test ! -e /proc/"$p"/cmdline || exit 1; fi; fi; done')

os.umask(0o077)
assert not WORK.exists(), 'No automatic repeat or overwrite'
WORK.mkdir(mode=0o700)
created=False;started=False;source_before=None;failure=None;cleanup_failure=None
try:
    info=json.loads(docker('inspect',CONTAINER))[0]
    assert info['HostConfig']['NetworkMode']=='none' and not info['NetworkSettings']['Ports']
    assert info['HostConfig']['Memory']==0 and info['HostConfig']['MemorySwap']==0
    assert read('select count(*) from pg_database where datname='+literal(DB)+';','postgres')==0
    source_before=source_state();save('SOURCE_BEFORE.SAFE.json',source_before)
    save('OWNER_GO.PRIVATE.json',{'confirmation':'GO_EXACTLY_ONE_ISOLATED_W15_DR_MOCK_UNIT_AND_RETURN_TO_ZERO',
      'targetDatabase':DB,'approvedAtUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'temporarySyntheticProfiles':500,'maximumUnits':1,
      'localMockCalls':2,'paidModelsAllowed':False,'productionAllowed':False,'full500Allowed':False,
      'ownerAuthorizationReference':'User explicit GO for exactly one isolated W15 function test per PR972 proposal; fresh operation/signatures; first failure stops; cleanup required.'})
    sql('create database '+DB+' template '+SOURCE+';','postgres');created=True
    sql('begin;update mandate_profiles set aktiv=false where aktiv;commit;')
    assert read('select count(*)from mandate_profiles where aktiv;')==0
    docker('exec',CONTAINER,'sh','-c','test ! -e '+BASE+' && mkdir -m 700 '+BASE+' && mkdir -m 700 '+BASE+'/state && cp -a /tmp/w15-processing-20261027/app '+BASE+'/app && cp /tmp/w15-processing-20261027/node '+BASE+'/node && cp /tmp/w15-postgrest-20261027 '+BASE+'/postgrest && chown -R 1000:1000 '+BASE)
    for name in ['synthetik-500-w15-unit0-runtime.js','synthetik-500-w15-processing-materials.js','fixtures/w15-unit0-provider.js']:
        copy_in(ROOT/'scripts'/name,BASE+'/app/scripts/'+name)
    copy_in('/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json',BASE+'/state/publication-policy.PRIVATE.json')
    docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
    inner('setup')
    # Existing cached binary, loopback only; no image/download/new infrastructure.
    docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c',BASE+'/postgrest '+BASE+'/state/postgrest.PRIVATE.conf >'+BASE+'/state/postgrest.PRIVATE.log 2>&1 & echo $! >'+BASE+'/state/postgrest.pid; wait')
    docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-unit0-runtime.js gateway >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
    started=True
    ready=False
    for _ in range(40):
        result=subprocess.run(DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/runtime-public.PRIVATE.json'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode==0:ready=True;break
        time.sleep(0.1)
    assert ready,'Gateway readiness missing'
    copy_safe('runtime-public.PRIVATE.json');copy_safe('SETUP.SAFE.json')
    env=os.environ.copy();env['NODE_V8_COVERAGE']=str(WORK/'coverage-materials')
    with (WORK/'materials.PRIVATE.log').open('xb') as log:
        result=subprocess.run(['node','scripts/lokal.js','--','node','scripts/synthetik-500-w15-processing-materials.js','--authorized-unit0'],cwd=ROOT,env=env,stdout=log,stderr=log,timeout=180)
    assert result.returncode==0,'Material preparation failed; no retry'
    for name in ['processing-materials.PRIVATE.json','current-command.PRIVATE.json','unit0-provider-input.PRIVATE.json']:
        copy_in(WORK/name,BASE+'/state/'+name)
    docker('exec',CONTAINER,'chown','-R','1000:1000',BASE+'/state')
    inner('prepare',timeout=120)
    copy_safe('PREPARE.SAFE.json')
    inner('run',timeout=150)
except BaseException as error:
    failure={'type':type(error).__name__,'reason':str(error),'noAutomaticRetry':True}
finally:
    if started:
        try:stop_inner()
        except BaseException as error:cleanup_failure={'type':type(error).__name__,'reason':'inner-process-exit-not-confirmed'}
    if created:
        try:cleanup()
        except BaseException as error:cleanup_failure={'type':type(error).__name__,'reason':str(error),'noWriteRetry':True}
    if started:
        for name in ['UNIT0_RESULT.SAFE.json','run-FIRST-FAILURE.SAFE.json','prepare-FIRST-FAILURE.SAFE.json']:
            try:
                exists=subprocess.run(DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/'+name],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
                if exists:copy_safe(name)
            except BaseException:pass
        try:stop_owned()
        except BaseException as error:
            save('SERVICE_STOP_FAILURE.SAFE.json',{'type':type(error).__name__})
            failure=failure or {'type':type(error).__name__,'reason':'owned-service-stop-not-confirmed'}
    if source_before is not None:
        try:
            source_after=source_state();save('SOURCE_AFTER.SAFE.json',source_after)
            assert source_after==source_before,'Original source changed'
        except BaseException as error:failure=failure or {'type':type(error).__name__,'reason':str(error)}
    if created:
        try:
            raw=docker('exec',CONTAINER,'cat','/sys/fs/cgroup/memory.current','/sys/fs/cgroup/memory.peak','/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory.swap.current','/sys/fs/cgroup/memory.events').decode().strip().splitlines()
            peak=int(raw[1]);save('FINAL_COMMON_MEMORY.SAFE.json',{'currentBytes':int(raw[0]),'kernelLifetimePeakBytes':peak,'configuredLimit':raw[2],'swapCurrentBytes':int(raw[3]),'events':dict((k,int(v))for k,v in (x.split()for x in raw[4:])),
              'comparisonBudgetBytes':2048000000,'requiredReserveBytes':500000000,'comparisonReserveBytes':2048000000-peak,'technicalCapEnforced':False,'peakReset':False})
        except BaseException as error:failure=failure or {'type':type(error).__name__,'reason':'final-memory-read-missing'}
    save('CONTROLLER_RESULT.SAFE.json',{'status':'PASS_BOUNDED_SEQUENCE' if failure is None and cleanup_failure is None else 'STOPPED_FIRST_FAILURE_OR_UNKNOWN',
      'failure':failure,'cleanupFailure':cleanup_failure,'database':DB,'existingContainerNetwork':'none','containerResourceLimitsUnchanged':True,
      'technicalMemoryCapEnforced':False,'originalSourcePreserved':source_before is not None and (WORK/'SOURCE_AFTER.SAFE.json').exists() and json.loads((WORK/'SOURCE_AFTER.SAFE.json').read_text())==source_before,
      'noAutomaticRetry':True,'maximumUnits':1,'productionActions':0,'paidProviderCalls':0})
    print(json.dumps(json.loads((WORK/'CONTROLLER_RESULT.SAFE.json').read_text())))
if failure is not None or cleanup_failure is not None:raise SystemExit(1)
