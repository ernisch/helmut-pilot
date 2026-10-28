#!/usr/bin/env python3
"""One bounded fresh-nonce transport probe. Never replay the old UNKNOWN write."""
import argparse,datetime,hashlib,json,os,pathlib,secrets,subprocess,time,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=pathlib.Path('/workspace/shared/helmut-w15-auth-transport-probe-20261028a')
BASE='/tmp/w15-auth-transport-probe-20261028a'
OLD='/tmp/w15-memory-atomic-20261028a'
SOURCE='helmut_w15_memory_atomic_20261028a'
DB='helmut_w15_transport_probe_20261028a'
CONTAINER='w15-memory-atomic-20261028a'
DOCKER=['docker','--host=unix:///var/run/docker.sock']
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
def docker(*args,input=None,timeout=60,check=True):
    r=subprocess.run(DOCKER+list(args),input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=timeout)
    if check and r.returncode:raise RuntimeError('transport-probe-docker-exit:'+str(r.returncode))
    return r
def sql(text,db):
    assert db in [SOURCE,DB,'postgres']
    return docker('exec','-i',CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-',input=text.encode(),timeout=60).stdout.decode().strip()
def native(db):
    q="""begin read only;set local statement_timeout='45s';set local lock_timeout='3s';
with a as materialized(select public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data' data)
select jsonb_build_object('database',current_database(),'readonly',current_setting('transaction_read_only'),
'profiles',(select count(*)from public.mandate_profiles),'active',(select count(*)from public.mandate_profiles where aktiv),
'usage',jsonb_array_length(a.data->'llmUsage'),
'probe',(select data->'w15TransportProbe'from public.helmut_store where id='main-auth'),
'oldProbe',(select data->'w15MemoryProbeSequence'from public.helmut_store where id='main-auth'),
'authHash',encode(sha256(convert_to(a.data::text,'UTF8')),'hex'),
'authInvariantHash',encode(sha256(convert_to((a.data-'_authStoreRevision'-'w15TransportProbe')::text,'UTF8')),'hex'),
'storeHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by id collate "C"),'UTF8')),'hex')from public.helmut_store x),
'storeNonAuthHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by id collate "C"),'UTF8')),'hex')from public.helmut_store x where id<>'main-auth'),
'briefingsHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by id collate "C"),'UTF8')),'hex')from public.briefings x),
'usageHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by id collate "C"),'UTF8')),'hex')from public.llm_usage x),
'profileHash',(select encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|'order by user_id collate "C"),'UTF8')),'hex')from public.mandate_profiles x))from a;rollback;"""
    return json.loads(sql(q,db))
def save(name,x):
    fd=os.open(WORK/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w')as f:json.dump(x,f,indent=2);f.write('\n')
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    assert not WORK.exists(),'transport-probe-existing-attempt'
    sourcework=pathlib.Path('/workspace/shared/helmut-w15-memory-atomic-20261028a')
    binding=json.loads((sourcework/'CURRENT_COMMAND_BINDING.SAFE.json').read_text())
    command=sourcework/'state/current-command.PRIVATE.json';b=command.read_bytes()
    assert len(b)==binding['bytes']and hashlib.sha256(b).hexdigest()==binding['sha256']and binding['executionAuthority']is False
    if a.dry_run:
        print(json.dumps({'status':'PASS_DRY_ARGUMENTS_PATHS_COMMAND_PIN_ONLY','databaseReads':0,'HTTPRequests':0,'createdDatabase':False}));return
    os.umask(0o077);WORK.mkdir(mode=0o700)
    before=None;created=False;staged=False;failure=None;target_final=None;source_final=None;process=None;configuration=None
    try:
        before=native(SOURCE);assert before['database']==SOURCE and before['active']==0 and before['usage']==6000 and before['oldProbe']==9 and before['probe']is None
        save('SOURCE_BEFORE.SAFE.json',before)
        info=json.loads(docker('inspect',CONTAINER).stdout)[0]
        assert info['State']['Running']and info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==2048000000 and info['HostConfig']['MemorySwap']==2048000000
        sql('create database '+DB+' template '+SOURCE+';','postgres');created=True
        baseline=native(DB);assert {k:v for k,v in baseline.items()if k!='database'}=={k:v for k,v in before.items()if k!='database'}
        save('TARGET_BASELINE.SAFE.json',baseline)
        docker('exec','--user','1000:1000',CONTAINER,'mkdir','-m','700',BASE);staged=True
        docker('exec','--user','1000:1000',CONTAINER,'mkdir','-m','700',BASE+'/state')
        for n in ['app','node','postgrest']:docker('exec','--user','1000:1000',CONTAINER,'cp','-a',OLD+'/'+n,BASE+'/'+n,timeout=120)
        docker('cp',str(ROOT/'lib'),CONTAINER+':'+BASE+'/app')
        docker('cp',str(ROOT/'server.js'),CONTAINER+':'+BASE+'/app/server.js')
        for n in ['synthetik-500-w15-auth-transport-probe.js','synthetik-500-w15-full500-runtime.js','fixtures/w15-durable-observations.js','fixtures/w15-auth-measurement-report.js','fixtures/w15-owned-process-stop.js','fixtures/w15-atomic-integration-target.json','fixtures/z3-plattform.js','lokaler-netzschutz.js']:
            docker('cp',str(ROOT/'scripts'/n),CONTAINER+':'+BASE+'/app/scripts/'+n)
        docker('cp',str(command),CONTAINER+':'+BASE+'/state/current-command.PRIVATE.json')
        configuration={'base':BASE,'database':DB,'nonce':str(uuid.uuid4()),'maximumMutations':16,'commandPin':binding}
        save('configuration.PRIVATE.json',configuration)
        # JWT/config generated once by local Node; no inherited provider keys.
        setup="""const fs=require('fs'),crypto=require('crypto'),p=process.argv[1],c=JSON.parse(fs.readFileSync(p));
const secret=crypto.randomBytes(48).toString('hex'),now=Math.floor(Date.now()/1000),b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const head=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'service_role',iat:now,exp:now+3600});c.token=head+'.'+crypto.createHmac('sha256',secret).update(head).digest('base64url');
fs.writeFileSync(p,JSON.stringify(c),{mode:384});fs.writeFileSync(c.base+'/state/postgrest.PRIVATE.conf','db-uri = "postgresql://authenticator@localhost/'+c.database+'?host=/var/run/postgresql"\\ndb-schemas = "public"\\nserver-host = "127.0.0.1"\\nserver-port = 3228\\ndb-pool = 3\\njwt-secret = "'+secret+'"\\n',{flag:'wx',mode:384});"""
        docker('cp',str(WORK/'configuration.PRIVATE.json'),CONTAINER+':'+BASE+'/state/configuration.PRIVATE.json')
        docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
        docker('exec','--user','1000:1000',CONTAINER,BASE+'/node','-e',setup,BASE+'/state/configuration.PRIVATE.json')
        # A true file dry invocation validates the staged argv/config without HTTP/DB.
        dry=docker('exec','--user','1000:1000',CONTAINER,'env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8','HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local',BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js',BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js','--dry-run')
        save('STAGED_DRY.SAFE.json',{'exitCode':dry.returncode,'stdout':dry.stdout.decode()})
        command='umask 077; echo $$ >'+BASE+'/state/run.pid; exec timeout --signal=TERM --kill-after=5s 305s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js'
        fd=os.open(WORK/'driver.PRIVATE.log',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb')as log:
            process=subprocess.Popen(DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',command],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=ENV)
            for line in process.stdout:
                log.write(line);log.flush();os.fdatasync(log.fileno());print(line.decode(errors='replace').rstrip(),flush=True)
            code=process.wait(timeout=325)
        if code:raise RuntimeError('transport-probe-driver-exit:'+str(code))
    except BaseException as e:failure={'name':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        stops=[]
        if staged:
            for action in ['run','gateway','postgrest']:
                r=docker('exec','--user','1000:1000',CONTAINER,BASE+'/node',BASE+'/app/scripts/fixtures/w15-owned-process-stop.js',BASE,action,DB,'never-started',check=False,timeout=28)
                stops.append({'action':action,'exitCode':r.returncode})
                if r.returncode:failure=failure or {'name':'OwnedStopUnknown','reason':action}
            docker('cp',CONTAINER+':'+BASE+'/state',str(WORK/'state'),check=False)
        if created:
            try:
                target_final=native(DB);assert target_final['active']==0 and target_final['usage']==6000 and target_final['oldProbe']==9
                for k in ['authInvariantHash','storeNonAuthHash','briefingsHash','usageHash','profileHash']:assert target_final[k]==before[k],k
                probe=target_final['probe']
                if probe is not None:assert configuration and probe['nonce']==configuration['nonce'] and type(probe['index'])is int and 0<=probe['index']<16
                save('TARGET_FINAL_INDEPENDENT_READONLY.SAFE.json',target_final)
            except BaseException as e:failure=failure or {'name':type(e).__name__,'reason':'target-final-unknown'}
        if before:
            try:
                source_final=native(SOURCE);assert source_final==before;save('SOURCE_AFTER_READONLY.SAFE.json',source_final)
            except BaseException as e:failure=failure or {'name':type(e).__name__,'reason':'source-final-unknown'}
        save('CONTROLLER_RESULT.SAFE.json',{'status':'FAIL_OR_UNKNOWN'if failure else'PASS_BOUNDED_TRANSPORT_OBSERVATION_REVIEW_PENDING','failure':failure,'stops':stops,'sourceUnchanged':bool(before and source_final==before),'targetActive':target_final.get('active')if target_final else None,'oldWriteReplayed':False,'units':0,'activations':0,'models':0,'RAMAcceptance':False,'retryAllowed':False})
    if failure:raise SystemExit(1)
if __name__=='__main__':main()
