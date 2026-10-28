#!/usr/bin/env python3
"""Fresh local signed/atomic integration only: no activation and no DR Unit."""
import datetime,hashlib,importlib.util,json,os,pathlib,posixpath,shutil,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
T=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
WORK=pathlib.Path(T['work']);BASE=T['base'];DB=T['database'];CONTAINER=T['container']
spec=importlib.util.spec_from_file_location('w15_atomic_existing_controller',ROOT/'scripts/synthetik-500-w15-full500-controller.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
M.WORK=WORK;M.BASE=BASE;M.DB=DB;M.CONTAINER=CONTAINER

def stage_inner(w,action,seconds=130):
    command='umask 077; echo $$ >'+BASE+'/state/'+('run'if action=='atomic-check'else action)+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local NODE_V8_COVERAGE='+BASE+'/state/coverage '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-full500-runtime.js '+action+' --atomic-prepared0'
    w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',command], 'run'if action=='atomic-check'else action,seconds)

def main():
    assert not WORK.exists(),'atomic-prepared0-no-rerun'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    created=False;w=None;failure=None;zero=None;before=None
    try:
        before=M.source_state();M.save('SOURCE_BEFORE.SAFE.json',before)
        receipt=json.loads(M.RECEIPT.read_text());assert hashlib.sha256(M.RECEIPT.read_bytes()).hexdigest()==M.RECEIPT_SHA
        inputs={}
        for key in ['frozenSourceDump','localRoles']:
            pin=next(x for x in receipt['files']if x['key']==key);p=pathlib.Path(pin['receivedPath']);b=p.read_bytes()
            assert len(b)==pin['expectedBytes']and hashlib.sha256(b).hexdigest()==pin['expectedSHA256'];inputs[key]=p
        stage=WORK/'stage';stage.mkdir(mode=0o700)
        for src,dst in [(M.SOURCE_CONTAINER+':/tmp/w15-processing-20261027/app','app'),(M.SOURCE_CONTAINER+':/tmp/w15-processing-20261027/node','node'),(M.SOURCE_CONTAINER+':/tmp/w15-postgrest-20261027','postgrest')]:M.docker('cp',src,str(stage/dst))
        shutil.copytree(ROOT/'lib',stage/'app/lib',dirs_exist_ok=True)
        shutil.copytree(ROOT/'scripts',stage/'app/scripts',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT/'supabase/proposals',stage/'app/supabase/proposals',dirs_exist_ok=True)
        for n in ['server.js','package.json']:shutil.copy2(ROOT/n,stage/'app'/n)
        for n,h in [('node','bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest','870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:assert hashlib.sha256((stage/n).read_bytes()).hexdigest()==h
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700);state=WORK/'state';state.mkdir(mode=0o700)
        M.docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no','--memory=2048000000','--memory-swap=2048000000',
          '--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data','--mount','type=bind,src='+str(state)+',dst='+BASE+'/state',
          '-e','POSTGRES_HOST_AUTH_METHOD=trust',M.IMAGE,'postgres','-c','helmut.local_usage_experiment=on','-c','max_wal_size=128MB','-c','work_mem=32MB','-c','autovacuum_naptime=10s');created=True
        M.docker('start',CONTAINER);info=json.loads(M.docker('inspect',CONTAINER))[0]
        assert info['Image']==M.IMAGE and info['HostConfig']['NetworkMode']=='none'and not info['NetworkSettings']['Ports']
        assert info['HostConfig']['Memory']==M.LIMIT and info['HostConfig']['MemorySwap']==M.LIMIT
        pid=info['State']['Pid'];rel=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('0::')[-1]
        cg=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+rel.lstrip('/')).lstrip('/');assert info['Id']in str(cg)
        w=M.Supervisor(cg);w.sample();w.thread.start()
        for _ in range(100):
            ready=subprocess.run(M.DOCKER+['exec',CONTAINER,'pg_isready','-U','postgres'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
            if ready.returncode==0:break
            time.sleep(.2)
        assert ready.returncode==0
        M.docker('exec',CONTAINER,'mkdir','-p',BASE);M.docker('exec',CONTAINER,'chmod','700',BASE)
        for n in ['app','node','postgrest']:M.copy_in(stage/n,BASE+'/'+n)
        for key,n in [('localRoles','roles.PRIVATE.sql'),('frozenSourceDump','input.PRIVATE.dump')]:M.copy_in(inputs[key],BASE+'/'+n)
        M.save('OWNER_GO.PRIVATE.json',{'confirmation':T['scope'],'targetDatabase':DB,'maximumUnits':0,'temporarySyntheticProfiles':0,
          'paidModelsAllowed':False,'productionAllowed':False,'full500Allowed':False,'authorization':'User coordinated local973/972 integration only; no activation/full500.'})
        M.save('setup-input.PRIVATE.json',{'commit':M.call(['git','rev-parse','HEAD']).decode().strip()})
        for n in ['OWNER_GO.PRIVATE.json','setup-input.PRIVATE.json']:M.copy_in(WORK/n,BASE+'/state/'+n)
        M.copy_in('/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json',BASE+'/state/publication-policy.PRIVATE.json')
        M.docker('exec',CONTAINER,'chown','-R','1000:1000',BASE);M.docker('exec',CONTAINER,'chmod','700',BASE+'/node',BASE+'/postgrest')
        M.sql('create database '+DB+';',database='postgres')
        M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f',BASE+'/roles.PRIVATE.sql')
        M.docker('exec',CONTAINER,'pg_restore','--exit-on-error','--file='+BASE+'/restore.PRIVATE.sql',BASE+'/input.PRIVATE.dump')
        M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d',DB,
          '-f',BASE+'/restore.PRIVATE.sql','-c','update public.mandate_profiles set aktiv=false where aktiv;')
        assert M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
        stage_inner(w,'setup')
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','umask 077; echo $$ >'+BASE+'/state/postgrest.pid; exec '+BASE+'/postgrest '+BASE+'/state/postgrest.PRIVATE.conf >'+BASE+'/state/postgrest.PRIVATE.log 2>&1')
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-full500-runtime.js gateway --atomic-prepared0 >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
        for _ in range(50):
            if (state/'runtime-public.PRIVATE.json').exists():break
            time.sleep(.1)
        assert (state/'runtime-public.PRIVATE.json').is_file()
        M.copy_out('runtime-public.PRIVATE.json')
        w.stage(['node','scripts/lokal.js','--','node','scripts/synthetik-500-w15-full500-materials.js','--atomic-prepared0'],'materials',240)
        for n in ['processing-materials.PRIVATE.json','current-command.PRIVATE.json','mock-fixtures.PRIVATE.json','audit-inputs.PRIVATE.json']:M.copy_in(WORK/n,BASE+'/state/'+n)
        # Local initializers and fullblob setup are complete BEFORE this conversion.
        M.sql((ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_text(),database=DB)
        boot=M.read("select jsonb_build_object('physicalUsage',(select count(*)from public.llm_usage),'logicalHash',encode(sha256(convert_to((data-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',jsonb_array_length(data->'llmUsage'))from public.helmut_store where id='main-auth';",database=DB)
        M.sql("select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')))from public.helmut_store where id='main-auth';",database=DB)
        after=M.read("select jsonb_build_object('physicalUsage',(select count(*)from public.llm_usage),'logicalHash',encode(sha256(convert_to(((public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data')-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',(select count(*)from public.llm_usage where usage_store_id='main-auth'));",database=DB)
        assert boot['logicalHash']==after['logicalHash']and boot['usage']==after['usage']==5000
        M.save('ATOMIC_BOOTSTRAP.SAFE.json',{'status':'PASS_FULL_LOGICAL_HASH_PRESERVED','before':boot,'after':after,'existingPhysicalRowsRetained':after['physicalUsage']==boot['physicalUsage']+5000})
        M.sql("notify pgrst,'reload schema';",database=DB)
        M.docker('exec',CONTAINER,'chown','-R','1000:1000',BASE+'/state')
        readiness="const fs=require('node:fs');const c=JSON.parse(fs.readFileSync(process.argv[1]));(async()=>{for(let i=0;i<50;i++){try{const r=await fetch(c.url+'/rest/v1/',{headers:{Authorization:'Bearer '+c.serviceToken,Accept:'application/openapi+json'},signal:AbortSignal.timeout(1000)});const v=await r.json();if(r.ok&&v.paths?.['/rpc/helmut_auth_usage_read_v1']&&v.paths?.['/rpc/helmut_auth_usage_cas_v1'])return console.log('PASS_TRUE_RPC_CACHE_READY');}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('atomic-rpc-cache-not-ready');})().catch(()=>process.exitCode=1);"
        M.docker('exec','--user','1000:1000',CONTAINER,'env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8',BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js','-e',readiness,BASE+'/state/configuration.PRIVATE.json')
        stage_inner(w,'prepare',150);M.copy_out('PREPARE.SAFE.json')
        stage_inner(w,'atomic-check',150);M.copy_out('ATOMIC_AUTH_PREPARED0.SAFE.json')
        c=json.loads((state/'configuration.PRIVATE.json').read_text())
        cfg={'database':DB,'gatewayUrl':c['url'],'token':c['serviceToken'],'commit':c['commit'],
          'sqlCommand':['psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB],
          'resultFile':BASE+'/state/ATOMIC_EU.SAFE.json'}
        M.save('eu-configuration.PRIVATE.json',cfg);M.copy_in(WORK/'eu-configuration.PRIVATE.json',BASE+'/state/eu-configuration.PRIVATE.json')
        M.docker('exec',CONTAINER,'chown','1000:1000',BASE+'/state/eu-configuration.PRIVATE.json')
        eu_command='umask 077; echo $$ >'+BASE+'/state/eu-component.pid; exec timeout --signal=TERM --kill-after=5s 140s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local NODE_V8_COVERAGE='+BASE+'/state/coverage '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-atomic-eu-check.js '+BASE+'/state/eu-configuration.PRIVATE.json'
        w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',eu_command],'eu-component',150)
        M.copy_out('ATOMIC_EU.SAFE.json')
    except BaseException as e:failure={'type':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        if created:
            try:
                M.stop_owned(['eu-component','run','prepare','setup','gateway','postgrest'])
                zero=M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
                M.save('INACTIVE_FINAL.SAFE.json',{'activeProfiles':0 if zero else None,'database':DB,'readOnly':True,'noActivationEverRequested':True})
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
        if w:
            try:w.sample()
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            w.stop()
            failure=failure or w.failure
        after_source=M.source_state();M.save('SOURCE_AFTER.SAFE.json',after_source)
        if before!=after_source:failure=failure or {'reason':'original-source-changed'}
        M.save('INTEGRATION_RESULT.SAFE.json',{'status':'PASS_PREPARED0_ATOMIC_COMPONENTS_RAM_PENDING'if not failure and zero else'FAIL_OR_UNKNOWN',
          'failure':failure,'activeProfiles':0 if zero else None,'commonKernelPeakBytes':w.maximum if w else None,'lastKernel':w.last if w else None,
          'originalSourceUnchanged':before==after_source,'units':0,'profileActivations':0,'full500Started':False,'paidModelCalls':0,'retryAllowed':False})
    print(json.dumps({'status':'PASS'if not failure and zero else'FAIL_OR_UNKNOWN','failure':failure,'activeProfiles':0 if zero else None}),flush=True)
    if failure or not zero:raise SystemExit(1)
if __name__=='__main__':main()
