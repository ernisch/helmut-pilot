#!/usr/bin/env python3
"""One bounded PostgREST allocation check, not the new End500 diagnosis.

Existing C logical data stays unchanged: GET and full-size PATCH to a proven absent ID,
with server-enforced transaction rollback. No Auth API, native CAS or Unit.
GHC's existing GC policy is unchanged; -S only records actual collection data.
"""
import base64,datetime,hashlib,hmac,importlib.util,json,os,pathlib,posixpath,subprocess,threading,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=pathlib.Path('/workspace/shared/helmut-w15-ram-sprint-20261028d/postgrest-allocation-check')
BASE='/tmp/w15-pgr-allocation-check-20261028d'
CONTAINER='w15-memory-forward-20261028c'
DB='helmut_w15_memory_forward_20261028c'
OLD_BASE='/tmp/w15-memory-forward-20261028c'
spec=importlib.util.spec_from_file_location('read_only_c_transport',ROOT/'scripts/synthetik-500-w15-full500-controller.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
M.CONTAINER=CONTAINER;M.DB=DB
QUERY="select jsonb_build_object('db',current_database(),'readonly',current_setting('transaction_read_only'),'active',(select count(*)from public.mandate_profiles where aktiv),'usage',(select jsonb_array_length(data->'llmUsage')from public.helmut_store where id='main-auth'),'authMD5',(select md5(data::text)from public.helmut_store where id='main-auth'),'targetAbsent',not exists(select from public.helmut_store where id='w15-absent-allocation-probe'));"
DRIVER=r'''const fs=require('fs'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict');
const base=process.argv[1],c=JSON.parse(fs.readFileSync(base+'/configuration.PRIVATE.json'));
const raw=fs.readFileSync(base+'/auth.PRIVATE.json','utf8').trim(),body='{"data":'+raw+'}';
function request(method,url,payload){return new Promise((resolve,reject)=>{
 const hash=crypto.createHash('sha256');let bytes=0,small='';
 const r=http.request({host:'127.0.0.1',port:3229,path:url,method,headers:{Authorization:'Bearer '+c.token,
 'Content-Type':'application/json',Prefer:'return=representation',...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})},timeout:15000},res=>{
  res.on('data',b=>{bytes+=b.length;hash.update(b);if(method==='PATCH'){assert(bytes<1024);small+=b;}});
  res.on('end',()=>{try{assert.equal(res.statusCode,200);if(method==='PATCH')assert.deepEqual(JSON.parse(small),[]);
   else assert(bytes>=Buffer.byteLength(raw));resolve({method,bytes,sha256:hash.digest('hex')});}catch(e){reject(e);}});
 });r.on('error',reject);r.on('timeout',()=>r.destroy(Error('allocation-http-timeout')));r.end(payload);
});}
(async()=>{let ready=false;
 for(let i=0;i<50;i++){
  ready=await new Promise(resolve=>{const r=http.get({host:'127.0.0.1',port:3229,path:'/helmut_store?id=eq.w15-absent-allocation-probe&select=id',headers:{Authorization:'Bearer '+c.token},timeout:500},res=>{res.resume();res.on('end',()=>resolve(res.statusCode===200));});r.on('error',()=>resolve(false));r.on('timeout',()=>r.destroy());});
  if(ready)break;await new Promise(r=>setTimeout(r,100));
 }
 assert(ready,'allocation-schema-not-ready');let getHash;
 for(let i=0;i<16;i++){
  const get=await request('GET','/helmut_store?id=eq.main-auth&select=data');
  if(getHash)assert.equal(get.sha256,getHash);getHash=get.sha256;
  const patch=await request('PATCH','/helmut_store?id=eq.w15-absent-allocation-probe&select=id',body);
  console.log(JSON.stringify({index:i,get,patch,bodyBytes:Buffer.byteLength(body),node:process.memoryUsage()}));
 }
})().catch(()=>{console.error('w15-allocation-check-first-failure');process.exitCode=1;});'''
def main():
    assert not WORK.exists(),'allocation-check-once-only'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    before=M.read(QUERY,database=DB);assert before['db']==DB and before['readonly']=='on' and before['active']==0 and before['usage']==6000 and before['targetAbsent']is True
    bound=json.loads(pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028/END500_MEMORY_BOUND.SAFE.json').read_text())
    p=bound['protectedOutputPins']['auth'];auth=pathlib.Path(p['path']);b=auth.read_bytes();assert len(b)==p['bytes']and hashlib.sha256(b).hexdigest()==p['sha256']
    secret=os.urandom(48).hex();now=int(time.time())
    enc=lambda d:base64.urlsafe_b64encode(json.dumps(d,separators=(',',':')).encode()).rstrip(b'=')
    head=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'role':'service_role','iat':now,'exp':now+600})
    token=(head+b'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),head,hashlib.sha256).digest()).rstrip(b'=')).decode()
    (WORK/'configuration.PRIVATE.json').write_text(json.dumps({'token':token}))
    (WORK/'postgrest.PRIVATE.conf').write_text('db-uri = "postgresql://authenticator@localhost/'+DB+'?host=/var/run/postgresql"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3229\ndb-pool = 3\ndb-tx-end = "rollback"\njwt-secret = "'+secret+'"\n')
    (WORK/'driver.js').write_text(DRIVER)
    M.docker('exec',CONTAINER,'mkdir','-m','700',BASE)
    M.docker('exec',CONTAINER,'mkdir','-p',BASE+'/state',BASE+'/app/scripts/fixtures')
    M.docker('exec',CONTAINER,'chmod','700',BASE+'/state')
    for name in ['w15-owned-process-stop.js','w15-durable-observations.js','w15-auth-measurement-report.js']:M.docker('cp',str(ROOT/'scripts/fixtures'/name),CONTAINER+':'+BASE+'/app/scripts/fixtures/'+name)
    for name in ['configuration.PRIVATE.json','postgrest.PRIVATE.conf','driver.js']:M.docker('cp',str(WORK/name),CONTAINER+':'+BASE+'/'+name)
    M.docker('cp',str(auth),CONTAINER+':'+BASE+'/auth.PRIVATE.json')
    M.docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
    command='umask 077; echo $$ >'+BASE+'/state/postgrest.pid; exec '+OLD_BASE+'/postgrest '+BASE+'/postgrest.PRIVATE.conf +RTS -S'+BASE+'/ghc-gc.SAFE.log -RTS >'+BASE+'/postgrest.PRIVATE.log 2>&1'
    finished=threading.Event();failure=[];samples=[];driver=None;thread=None;started=False;after=None;rows=[];driverExit=None
    def monitor():
        try:
            with (WORK/'allocation-trace.SAFE.jsonl').open('x')as out:
                while not finished.is_set():
                    try:
                        current=int((cg/'memory.current').read_text());stats={k:int(v)for k,v in(x.split()for x in(cg/'memory.stat').read_text().splitlines())}
                        processes=[]
                        for pid in(cg/'cgroup.procs').read_text().split():
                            try:
                                status={k:v.strip()for k,v in(x.split(':',1)for x in(pathlib.Path('/proc')/pid/'status').read_text().splitlines()if ':'in x)}
                                if status['Name']=='postgrest':processes.append({'pid':int(pid),'RSSBytes':int(status['VmRSS'].split()[0])*1024,'RSSHighWaterBytes':int(status['VmHWM'].split()[0])*1024})
                            except(FileNotFoundError,ProcessLookupError,KeyError):pass
                        row={'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commonCurrentBytes':current,'anonBytes':stats['anon'],'fileBytes':stats['file'],'postgrest':processes}
                        samples.append(row);out.write(json.dumps(row)+'\n');out.flush();os.fdatasync(out.fileno())
                        if current>M.MAXIMUM:raise RuntimeError('allocation-common-current-reserve-failure')
                    except BaseException as e:first_failure(e);break
                    finished.wait(.1)
        except BaseException as e:first_failure(e)
    def first_failure(e):
        if not failure:failure.append({'type':type(e).__name__,'reason':str(e)})
    def stop(action,registration='active'):
        M.docker('exec','--user','1000:1000',CONTAINER,OLD_BASE+'/node',BASE+'/app/scripts/fixtures/w15-owned-process-stop.js',BASE,action,DB,registration,timeout=27)
    try:
        # Set before dispatch: even an uncertain Docker start must enter owned cleanup.
        started=True
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c',command)
        info=json.loads(M.docker('inspect',CONTAINER))[0];rel=pathlib.Path('/proc/'+str(info['State']['Pid'])+'/cgroup').read_text().strip().split('0::')[-1]
        cg=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+rel.lstrip('/')).lstrip('/');assert info['Id']in str(cg)
        assert info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==M.LIMIT and info['HostConfig']['MemorySwap']==M.LIMIT
        thread=threading.Thread(target=monitor);thread.start()
        # Actual schema readiness is checked before the one workload batch.
        cmd='umask 077; echo $$ >'+BASE+'/state/setup.pid; exec timeout --signal=TERM --kill-after=5s 125s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+OLD_BASE+'/node --require '+OLD_BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/driver.js '+BASE
        driver=subprocess.Popen(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',cmd],env=M.ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        end=time.monotonic()+120
        while driver.poll()is None and not failure and time.monotonic()<end:time.sleep(.1)
        if failure or driver.poll()is None:raise RuntimeError('allocation-driver-unknown-or-timeout')
        stdout,stderr=driver.communicate();driverExit=driver.returncode
        (WORK/'driver.SAFE.jsonl').write_bytes(stdout);(WORK/'driver.PRIVATE.stderr').write_bytes(stderr)
        assert driverExit==0 and not stderr,'allocation-driver-failed'
        rows=[json.loads(x)for x in stdout.splitlines()];assert len(rows)==16
        # Natural idle observation, interruptible immediately by the memory guard.
        end=time.monotonic()+2
        while not failure and time.monotonic()<end:time.sleep(.05)
        assert not failure,'allocation-monitor-first-failure'
    except BaseException as e:first_failure(e)
    finally:
        if started:
            try:stop('postgrest')
            except BaseException as e:first_failure(e)
        if driver is not None:
            try:
                if driver.poll()is None:stop('setup')
                stdout,stderr=driver.communicate(timeout=5);driverExit=driver.returncode
                if not(WORK/'driver.SAFE.jsonl').exists():
                    (WORK/'driver.SAFE.jsonl').write_bytes(stdout);(WORK/'driver.PRIVATE.stderr').write_bytes(stderr)
            except BaseException as e:first_failure(e)
        finished.set()
        if thread:
            thread.join(timeout=3)
            if thread.is_alive():first_failure(RuntimeError('allocation-monitor-not-drained'))
        # Always close against the existing DB, even after a workload failure.
        try:
            after=M.read(QUERY,database=DB)
            assert before==after,'allocation-check-modified-original-fixture'
        except BaseException as e:first_failure(e)
        for name in ['ghc-gc.SAFE.log','postgrest.PRIVATE.log']:
            try:M.docker('cp',CONTAINER+':'+BASE+'/'+name,str(WORK/name))
            except BaseException as e:first_failure(e)
    # Retain all actually completed pairs even when a later request failed.
    rows=[]
    captured=WORK/'driver.SAFE.jsonl'
    if captured.exists():
        for line in captured.read_bytes().splitlines(keepends=True):
            try:
                assert line.endswith(b'\n'),'allocation-partial-output-line'
                row=json.loads(line);assert row['index']==len(rows)
                assert row['get']['method']=='GET' and row['patch']['method']=='PATCH'
                rows.append(row)
            except BaseException as e:first_failure(e);break
    if not samples or not any(x['postgrest']for x in samples):first_failure(RuntimeError('allocation-component-samples-missing'))
    if not failure and (len(rows)!=16 or driverExit!=0):first_failure(RuntimeError('allocation-complete-pair-count-unknown'))
    report={'status':'FAIL_OR_UNKNOWN'if failure else'PASS_BOUNDED_POSTGREST_ALLOCATION_OBSERVATION_NOT_END500_ACCEPTANCE','failure':failure,'driverExitCode':driverExit,'plannedRequests':32,'completeGETPATCHPairs':len(rows),
      'databaseChanged':None if after is None else before!=after,'serverTransactionEnd':'rollback','activeProfilesBefore':before['active'],'activeProfilesAfter':after['active']if after else None,'units':0,'authAPICalls':0,'actualCASWrites':0,'providerCalls':0,
      'readinessGETsExcludedFromWorkloadCount':True,'RTSGCPolicyChanged':False,'forcedCollectionOrCacheClear':False,'originalKernelPeakIsHistoricalNotNewProof':True,
      'maximumSampledCurrentBytes':max((x['commonCurrentBytes']for x in samples),default=None),'maximumSampledPostgrestRSSBytes':max((y['RSSBytes']for x in samples for y in x['postgrest']),default=None),
      'sourceSHA256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'fixtureAuthSHA256':p['sha256'],'traceSamples':len(samples),'retryAllowed':False,'beforeAfterEqual':before==after}
    (WORK/'ALLOCATION_CHECK.SAFE.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
    if failure:raise SystemExit(1)
if __name__=='__main__':main()
