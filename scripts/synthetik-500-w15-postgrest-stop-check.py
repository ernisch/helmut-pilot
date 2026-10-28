#!/usr/bin/env python3
"""Exactly one real service-stop check; existing isolated database stays read-only."""
import argparse,base64,hashlib,hmac,json,os,pathlib,secrets,subprocess,time,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=pathlib.Path('/workspace/shared/helmut-w15-postgrest-stop-check-20261028')
BASE='/tmp/w15-postgrest-stop-check-20261028'
OLD='/tmp/w15-memory-atomic-20261028a'
DB='helmut_w15_transport_probe_20261028a'
CONTAINER='w15-memory-atomic-20261028a'
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
DOCKER=['docker','--host=unix:///var/run/docker.sock']
FILES=['synthetik-500-w15-auth-transport-probe.js','fixtures/z3-plattform.js','fixtures/w15-durable-observations.js',
       'fixtures/w15-auth-measurement-report.js','fixtures/w15-owned-process-stop.js','lokaler-netzschutz.js']
def docker(*words,input=None,timeout=60,check=True):
    r=subprocess.run(DOCKER+list(words),input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=timeout)
    if check and r.returncode:raise RuntimeError('real-stop-docker-exit:'+str(r.returncode))
    return r
def save(name,value):
    fd=os.open(WORK/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w')as f:json.dump(value,f,indent=2);f.write('\n')
def pin(p,label):
    b=p.read_bytes();return {'path':label,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def native():
    # Native relation SELECTs, not the application's Auth RPC/API.
    q="""begin read only;set local statement_timeout='20s';set local lock_timeout='3s';
select jsonb_build_object('database',current_database(),'readonly',current_setting('transaction_read_only'),
'profiles',(select count(*)from public.mandate_profiles),'active',(select count(*)from public.mandate_profiles where aktiv),
'usage',(select count(*)from public.llm_usage where usage_store_id='main-auth'),
'authenticatorConnections',(select count(*)from pg_stat_activity where datname=current_database()and usename='authenticator'and pid<>pg_backend_pid()),
'authHash',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth'),
'usageHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by id collate "C"),'UTF8')),'hex')from public.llm_usage x));rollback;"""
    r=docker('exec','-i',CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f','-',input=q.encode(),timeout=30)
    x=json.loads(r.stdout);assert x['database']==DB and x['readonly']=='on'and x['profiles']==500 and x['active']==0 and x['usage']==6000 and x['authenticatorConnections']==0
    return x
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    assert not WORK.exists(),'real-stop-once-only-output-exists'
    pins=[pin(ROOT/'scripts'/n,'scripts/'+n)for n in FILES]
    pins.append(pin(pathlib.Path(__file__),'scripts/'+pathlib.Path(__file__).name))
    if args.dry_run:
        print(json.dumps({'status':'PASS_DRY_STOP_CHECK_PLAN_NO_HTTP_OR_DATABASE','sourcePins':pins,'newDatabase':False,'authCalls':0}));return
    os.umask(0o077);WORK.mkdir(mode=0o700);staged=False;before=None;after=None;failure=None;inner=None;stops=[]
    try:
        info=json.loads(docker('inspect',CONTAINER).stdout)[0]
        assert info['State']['Running']and info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==2048000000 and info['HostConfig']['MemorySwap']==2048000000
        before=native();save('NATIVE_BEFORE_READONLY.SAFE.json',before);save('SOURCE_PINS.SAFE.json',{'sourcePins':pins})
        docker('exec','--user','1000:1000',CONTAINER,'mkdir','-m','700',BASE);staged=True
        docker('exec','--user','1000:1000',CONTAINER,'mkdir','-m','700','-p',BASE+'/state',BASE+'/app/scripts/fixtures')
        for name in ['node','postgrest']:docker('exec','--user','1000:1000',CONTAINER,'cp','-a',OLD+'/'+name,BASE+'/'+name,timeout=90)
        for name in FILES:docker('cp',str(ROOT/'scripts'/name),CONTAINER+':'+BASE+'/app/scripts/'+name)
        secret=secrets.token_hex(48);now=int(time.time());b64=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
        unsigned=b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'role':'service_role','iat':now,'exp':now+3600})
        token=unsigned+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),unsigned.encode(),hashlib.sha256).digest()).decode().rstrip('=')
        save('configuration.PRIVATE.json',{'base':BASE,'database':DB,'maximumMutations':0,'mode':'REAL_SERVICE_STOP_ONLY_NO_AUTH','nonce':str(uuid.uuid4()),'token':token})
        conf='db-uri = "postgresql://authenticator@localhost/'+DB+'?host=/var/run/postgresql"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3228\ndb-pool = 3\njwt-secret = "'+secret+'"\n'
        fd=os.open(WORK/'postgrest.PRIVATE.conf',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w')as f:f.write(conf)
        for n in ['configuration.PRIVATE.json','postgrest.PRIVATE.conf']:docker('cp',str(WORK/n),CONTAINER+':'+BASE+'/state/'+n)
        docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
        node=[BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js',BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js','--stop-check']
        dry=docker('exec','--user','1000:1000',CONTAINER,'env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8','HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local',*node,'--dry-run')
        save('STAGED_FILE_DRY.SAFE.json',{'exitCode':dry.returncode,'result':json.loads(dry.stdout)})
        command='umask 077; echo $$ >'+BASE+'/state/run.pid; exec timeout --signal=TERM --kill-after=5s 35s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+' '.join(node)
        r=docker('exec','--user','1000:1000',CONTAINER,'sh','-c',command,timeout=45,check=False)
        fd=os.open(WORK/'driver.PRIVATE.log',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb')as f:f.write(r.stdout+r.stderr);f.flush();os.fdatasync(f.fileno())
        assert r.returncode==0,'real-stop-driver-failed'
    except BaseException as e:failure={'name':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        if staged:
            for action in ['run','gateway','postgrest']:
                try:
                    r=docker('exec','--user','1000:1000',CONTAINER,BASE+'/node',BASE+'/app/scripts/fixtures/w15-owned-process-stop.js',BASE,action,DB,'never-started',timeout=28,check=False)
                    stops.append({'action':action,'exitCode':r.returncode});assert r.returncode==0
                except BaseException:failure=failure or {'name':'OwnedStopUnknown','reason':action}
            copied=docker('cp',CONTAINER+':'+BASE+'/state',str(WORK/'state'),check=False)
            if copied.returncode:failure=failure or {'name':'EvidenceUnknown','reason':'state-copy'}
            else:
                try:inner=json.loads((WORK/'state/RESULT.SAFE.json').read_bytes());assert inner['status']=='PASS_REAL_POSTGREST_CONTROLLED_STOP'
                except BaseException:failure=failure or {'name':'InnerStopUnknown','reason':'missing-or-negative-result'}
        if before:
            try:after=native();assert after==before;save('NATIVE_AFTER_READONLY.SAFE.json',after)
            except BaseException:failure=failure or {'name':'NativeFinalUnknown','reason':'readonly-state-changed-or-unavailable'}
        result={'status':'PASS_REAL_POSTGREST_CONTROLLED_STOP'if not failure and inner and after==before else'FAIL_REAL_POSTGREST_CONTROLLED_STOP_UNKNOWN',
          'failure':failure,'inner':inner,'ownedStops':stops,'databaseUnchanged':bool(before and after==before),'profiles':after.get('profiles')if after else None,
          'activeProfiles':after.get('active')if after else None,'usage':after.get('usage')if after else None,'authCalls':0,'CASWrites':0,'units':0,'modelCalls':0,
          'newDatabase':False,'gatewayRPCs':0,'sourcePins':pins,'retryAllowed':False,'RAMAcceptance':False}
        save('RESULT.SAFE.json',result);print(json.dumps({'status':result['status'],'active':result['activeProfiles'],'authCalls':0,'CASWrites':0}),flush=True)
    if result['status']!='PASS_REAL_POSTGREST_CONTROLLED_STOP':raise SystemExit(1)
if __name__=='__main__':main()
