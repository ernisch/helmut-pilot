#!/usr/bin/env python3
"""One new capped0active allocation diagnostic. Never a DR/Mock500 execution."""
import datetime,hashlib,importlib.util,json,os,pathlib,posixpath,shutil,subprocess,threading,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
ASSETS=pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028')
WORK=pathlib.Path('/workspace/shared/helmut-w15-memory-atomic-20261028a')
BASE='/tmp/w15-memory-atomic-20261028a'
DB='helmut_w15_memory_atomic_20261028a'
CONTAINER='w15-memory-atomic-20261028a'
spec=importlib.util.spec_from_file_location('existing_w15_controller',ROOT/'scripts/synthetik-500-w15-full500-controller.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
M.WORK=WORK;M.BASE=BASE;M.DB=DB;M.CONTAINER=CONTAINER
BUDGET=json.loads((ROOT/'scripts/fixtures/w15-local-memory-budget.json').read_text())

class Watch(M.Supervisor):
    def __init__(self,cgroup):
        self.cas_records=[];self.last_component=0
        super().__init__(cgroup)
    def write_progress(self):
        try:
            while not self.progress_finished.is_set()or not self.progress_queue.empty():
                try:record=self.progress_queue.get(timeout=.2)
                except M.queue.Empty:continue
                try:
                    if record['name']=='kernel-components':
                        # PSS/RSS is diagnostic context, never summed as acceptance.
                        processes=[]
                        for pid in (self.cgroup/'cgroup.procs').read_text().split():
                            try:
                                p=pathlib.Path('/proc')/pid;name=(p/'comm').read_text().strip()
                                rollup={k:int(v.split()[0])*1024 for k,v in(x.split(':',1)for x in(p/'smaps_rollup').read_text().splitlines()if ':'in x)if k in ['Rss','Pss','Private_Clean','Private_Dirty','Shared_Clean','Shared_Dirty']}
                                processes.append({'pid':int(pid),'name':name,**rollup})
                            except (FileNotFoundError,ProcessLookupError):pass
                            except PermissionError:
                                try:
                                    p=pathlib.Path('/proc')/pid
                                    status={k:v.strip()for k,v in(x.split(':',1)for x in(p/'status').read_text().splitlines()if ':'in x)}
                                    processes.append({'pid':int(pid),'name':(p/'comm').read_text().strip(),
                                      'Rss':int(status.get('VmRSS','0 kB').split()[0])*1024,
                                      'HighWaterRSS':int(status.get('VmHWM','0 kB').split()[0])*1024,
                                      'RssAnon':int(status.get('RssAnon','0 kB').split()[0])*1024,
                                      'RssFile':int(status.get('RssFile','0 kB').split()[0])*1024,
                                      'RssShmem':int(status.get('RssShmem','0 kB').split()[0])*1024,
                                      'Pss':None,'pssReadPermitted':False})
                                except(FileNotFoundError,ProcessLookupError,PermissionError):pass
                        record['processes']=processes
                        record['processesObservedAtUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat()
                    self.progress.write(json.dumps(record,separators=(',',':'))+'\n');self.progress.flush();os.fdatasync(self.progress.fileno())
                    if record.get('message'):print(record['message'],flush=True)
                finally:self.progress_queue.task_done()
        except BaseException as e:self.first_failure(e)
        finally:self.progress.close()
    def sample(self):
        super().sample() # Exact existing outer kernel limit/reserve/swap/event guard.
        if time.monotonic()-self.last_component>=1:
            stats={k:int(v)for k,v in(x.split()for x in(self.cgroup/'memory.stat').read_text().splitlines())}
            self.progress_queue.put_nowait({'name':'kernel-components','atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'casCompleted':len(self.cas_records),'kernel':self.last.copy(),'stat':stats})
            self.last_component=time.monotonic()
    def publish(self,name,index=None,status=None):
        with self.progress_lock:
            mem=self.last;peak=None if mem is None else mem['kernelLifetimePeakBytes']
            message='RAM-Diagnose | CAS '+str(len(self.cas_records))+'/500 | '+name
            if mem:
                message+=' | RAM {:.1f} MB | Peak {:.1f} MB | Reserve {:.1f} MB ({:.2f} %)'.format(mem['currentBytes']/1e6,peak/1e6,(M.LIMIT-peak)/1e6,100*(M.LIMIT-peak)/M.LIMIT)
            if self.cas_records:message+=' | Auth-Max {:.9f} s'.format(self.cas_records[-1]['authTimings']['maximumFullCallWallMs']/1000)
            self.progress_queue.put_nowait({'name':name,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'casCompleted':len(self.cas_records),
              'kernel':mem,'failure':self.failure,'authTimings':self.cas_records[-1]['authTimings']if self.cas_records else None,'message':message})
            self.last_terminal_monotonic=time.monotonic()
    def observe_line(self,raw,stage):
        if stage!='run'or len(raw)>4096:return
        try:x=json.loads(raw)
        except(ValueError,UnicodeError):return
        if x.get('name')!='memory-cas-accepted':return
        assert x.get('index')==len(self.cas_records),'w15-forward-cas-sequence'
        assert x['postimagePreserved']is True and x['revisionReadback']is True
        self.cas_records.append(x)
        self.publish('memory-cas-accepted',x['index'],'PASS')

def pin(pin):
    p=pathlib.Path(pin['path']);assert p.is_file()and not p.is_symlink()and p.stat().st_mode&0o777==0o600
    b=p.read_bytes();assert len(b)==pin['bytes']and hashlib.sha256(b).hexdigest()==pin['sha256']
    return p,b
def inner(w,action,seconds):
    command='umask 077; echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-memory-forward.js '+action
    w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',command],action,seconds)
def main():
    target=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
    integration=json.loads((pathlib.Path(target['work'])/'INTEGRATION_RESULT.SAFE.json').read_text())
    assert integration['status']=='PASS_PREPARED0_ATOMIC_COMPONENTS_RAM_PENDING'and integration['activeProfiles']==0
    assert integration['originalSourceUnchanged']is True and integration['units']==0
    parser=json.loads((ASSETS/'sql-preflight-atomic-a/SQL_PREFLIGHT.SAFE.json').read_text())
    assert parser['status']=='PASS_ALL_GENERATED_DIAGNOSTIC_SQL_PARSE_DESCRIBE_NO_EXECUTION'and parser['plannedDatabase']==DB
    for name,expected in parser['sourcePins'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,'atomic-sql-reviewed-source-drift'
    review=json.loads(pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/MEMORY_PRESTART_REVIEW_FINAL.SAFE.json').read_text())
    assert review['status']=='PASS_PRESTART_ATOMIC_END500_ALLOCATION_ONLY'
    for pin in review['sourcePins']:
        p=ROOT/pin['path'];b=p.read_bytes();assert len(b)==pin['bytes']and hashlib.sha256(b).hexdigest()==pin['sha256'],'atomic-memory-reviewed-source-drift'
    assert not WORK.exists(),'w15-forward-once-only'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    created=False;w=None;failure=None;result=None;zero=False
    try:
        bound=json.loads((ASSETS/'END500_MEMORY_BOUND.SAFE.json').read_text())
        independent=json.loads((ASSETS/'END500_FIXTURE_INDEPENDENT_REVIEW.SAFE.json').read_text())
        assert bound['executionAuthority']is False and bound['totalUsageRows']==6000 and bound['preservedOriginalUsageRows']==5139
        # Review is an offline data review, not a made-up execution authority.
        assert independent['status']=='PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY'
        reviewed_path,reviewed_bytes=pin(independent['inputReportPin'])
        assert reviewed_path==ASSETS/'END500_MEMORY_BOUND.SAFE.json'
        assert json.loads(reviewed_bytes)==bound
        paths={k:pin(v)[0]for k,v in bound['protectedOutputPins'].items()}
        receipt=json.loads(M.RECEIPT.read_text());assert hashlib.sha256(M.RECEIPT.read_bytes()).hexdigest()==M.RECEIPT_SHA
        original={k:next(x for x in receipt['files']if x['key']==k)for k in ['frozenSourceDump','localRoles']}
        for v in original.values():
            b=pathlib.Path(v['receivedPath']).read_bytes();assert len(b)==v['expectedBytes']and hashlib.sha256(b).hexdigest()==v['expectedSHA256']
        stage=WORK/'stage';stage.mkdir(mode=0o700)
        for source,target in [('synthetik500-runtime-pg-7e1c20261027:/tmp/w15-processing-20261027/app','app'),
          ('synthetik500-runtime-pg-7e1c20261027:/tmp/w15-processing-20261027/node','node'),
          ('synthetik500-runtime-pg-7e1c20261027:/tmp/w15-postgrest-20261027','postgrest')]:M.docker('cp',source,str(stage/target))
        shutil.copytree(ROOT/'lib',stage/'app/lib',dirs_exist_ok=True)
        shutil.copy2(ROOT/'server.js',stage/'app/server.js')
        for n in ['synthetik-500-w15-memory-forward.js','synthetik-500-w15-full500-runtime.js','fixtures/w15-auth-measurement-report.js','fixtures/w15-durable-observations.js','fixtures/w15-owned-process-stop.js','fixtures/w15-local-memory-budget.json','fixtures/w15-atomic-integration-target.json','fixtures/z3-plattform.js','fixtures/w15-memory-contract.js','fixtures/w15-memory-contract.json','lokal.js','lokaler-netzschutz.js']:
            shutil.copy2(ROOT/'scripts'/n,stage/'app/scripts'/n)
        for n,h in [('node','bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest','870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:
            assert hashlib.sha256((stage/n).read_bytes()).hexdigest()==h
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700)
        state=WORK/'state';state.mkdir(mode=0o700)
        M.docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no','--memory=2048000000','--memory-swap=2048000000',
          '--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data',
          '--mount','type=bind,src='+str(state)+',dst='+BASE+'/state','-e','POSTGRES_HOST_AUTH_METHOD=trust',M.IMAGE,
          'postgres','-c','helmut.local_usage_experiment=on','-c','max_wal_size='+str(BUDGET['postgresMaxWalMiB'])+'MB','-c','work_mem='+str(BUDGET['postgresWorkMemMiB'])+'MB',
          '-c','autovacuum_naptime='+str(BUDGET['postgresAutovacuumNaptimeSeconds'])+'s');created=True
        M.docker('start',CONTAINER);info=json.loads(M.docker('inspect',CONTAINER))[0]
        assert info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==M.LIMIT and info['HostConfig']['MemorySwap']==M.LIMIT
        pid=info['State']['Pid'];rel=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('0::')[-1]
        cgroup=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+rel.lstrip('/')).lstrip('/');assert info['Id']in str(cgroup)
        w=Watch(cgroup);w.sample();w.thread.start()
        for _ in range(100):
            r=subprocess.run(M.DOCKER+['exec',CONTAINER,'pg_isready','-U','postgres'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
            if r.returncode==0:break
            time.sleep(.2)
        assert r.returncode==0,'w15-forward-pg-readiness'
        M.docker('exec',CONTAINER,'mkdir','-p',BASE)
        M.docker('exec',CONTAINER,'chmod','700',BASE)
        for n in ['app','node','postgrest']:M.copy_in(stage/n,BASE+'/'+n)
        assert state.stat().st_mode&0o777==0o700
        for k,n in [('localRoles','roles.PRIVATE.sql'),('frozenSourceDump','input.PRIVATE.dump')]:M.copy_in(original[k]['receivedPath'],BASE+'/'+n)
        target=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
        command_path=pathlib.Path(target['work'])/'current-command.PRIVATE.json'
        command_bytes=command_path.read_bytes()
        command_pin={'path':str(command_path),'bytes':len(command_bytes),'sha256':hashlib.sha256(command_bytes).hexdigest(),'executionAuthority':False}
        M.save('CURRENT_COMMAND_BINDING.SAFE.json',command_pin)
        M.copy_in(command_path,BASE+'/state/current-command.PRIVATE.json')
        M.copy_in(WORK/'CURRENT_COMMAND_BINDING.SAFE.json',BASE+'/state/CURRENT_COMMAND_BINDING.SAFE.json')
        M.copy_in(ASSETS/'END500_MEMORY_BOUND.SAFE.json',BASE+'/state/END500_MEMORY_BOUND.SAFE.json')
        M.docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
        M.docker('exec',CONTAINER,'chmod','700',BASE+'/node',BASE+'/postgrest')
        M.sql('create database '+DB+';',database='postgres')
        M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f',BASE+'/roles.PRIVATE.sql')
        M.docker('exec',CONTAINER,'pg_restore','--exit-on-error','--file='+BASE+'/restore.PRIVATE.sql',BASE+'/input.PRIVATE.dump')
        M.docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d',DB,
          '-f',BASE+'/restore.PRIVATE.sql','-c','update public.mandate_profiles set aktiv=false where aktiv;')
        assert M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
        # Seed all retained500-end positions in native tables, one bounded row
        # per statement. No fake execution/quality claims or source mutation.
        seed=WORK/'seed.PRIVATE.sql';row_ids={}
        with seed.open('x')as out:
            os.chmod(seed,0o600);out.write('begin;\n')
            raw=paths['auth'].read_text().strip()
            out.write("with incoming as(select "+M.literal(raw)+"::jsonb expected),written as(update public.helmut_store set data=(select expected from incoming)where id='main-auth' returning data)select jsonb_build_object('id','main-auth','matches',written.data=incoming.expected)from written,incoming;\n")
            for key in ['evidenceRows','privateDraftStoreRows','resultRows','privateDraftReviewRows']:
                rows=json.loads(paths[key].read_text());row_ids[key]=[x['id']for x in rows]
                for row in rows:
                    if key in ['evidenceRows','privateDraftStoreRows']:
                        out.write('with incoming as(select '+M.literal(row['id'])+'::text id,'+M.literal(json.dumps(row['data'],separators=(',',':'),ensure_ascii=False))+'::jsonb data),written as(insert into public.helmut_store(id,data)select id,data from incoming returning id,data)select jsonb_build_object(\'id\',written.id,\'matches\',written.data=incoming.data)from written join incoming using(id);\n')
                    else:
                        cols=['id','slot','payload','user_id','created_at','generated_at']
                        value=M.literal(json.dumps(row,separators=(',',':'),ensure_ascii=False))
                        out.write('with incoming as(select *from jsonb_populate_record(null::public.briefings,'+value+'::jsonb)),written as(insert into public.briefings('+','.join(cols)+')select '+','.join(cols)+' from incoming returning *)select jsonb_build_object(\'id\',written.id,\'matches\',to_jsonb(written)=to_jsonb(incoming))from written join incoming using(id);\n')
            out.write('commit;\n')
        M.copy_in(seed,BASE+'/seed.PRIVATE.sql')
        M.docker('exec',CONTAINER,'chown','1000:1000',BASE+'/seed.PRIVATE.sql')
        seed_cmd='umask 077; echo $$ >'+BASE+'/state/setup.pid; exec timeout --signal=TERM --kill-after=5s 170s psql -X -w -qAt -v ON_ERROR_STOP=1 -U postgres -d '+DB+' -f '+BASE+'/seed.PRIVATE.sql'
        w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',seed_cmd],'seed',180)
        native=[json.loads(line)for line in(WORK/'seed.PRIVATE.log').read_text().splitlines()if line.startswith('{')]
        expected={'main-auth'}|set(x for ids in row_ids.values()for x in ids)
        assert len(native)==len(expected)==3501 and {x['id']for x in native}==expected and all(x['matches']is True for x in native),'w15-forward-native-seed-postimage'
        counts={}
        for key,ids in row_ids.items():
            table='public.helmut_store'if key in ['evidenceRows','privateDraftStoreRows']else'public.briefings'
            counts[key]=M.read('select count(*)from '+table+' where id=any(array['+','.join(map(M.literal,ids))+']);',database=DB)
            assert counts[key]==len(ids),'w15-forward-committed-native-rowcount'
        assert M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
        M.save('SEED.SAFE.json',{'nativeCommittedCounts':counts,'nativeExactPostimageChecks':3501,'activeProfiles':0,'executionAuthority':False,'actualResults':False})
        # Install only in this new netless copy after all native seed postimages.
        M.sql((ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_text(),database=DB)
        initial=M.read("select jsonb_build_object('logicalHash',encode(sha256(convert_to((data-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',jsonb_array_length(data->'llmUsage'))from public.helmut_store where id='main-auth';",database=DB)
        M.sql("select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')))from public.helmut_store where id='main-auth';",database=DB)
        converted=M.read("select jsonb_build_object('logicalHash',encode(sha256(convert_to(((public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data')-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',(select count(*)from public.llm_usage where usage_store_id='main-auth'));",database=DB)
        assert initial==converted and converted['usage']==6000,'w15-atomic-full-history-bootstrap'
        M.save('ATOMIC_BOOTSTRAP.SAFE.json',{'status':'PASS_EXACT_LOGICAL_STATE_PRESERVED','before':initial,'after':converted})
        inner(w,'setup',90)
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','umask 077; echo $$ >'+BASE+'/state/postgrest.pid; exec '+BASE+'/postgrest '+BASE+'/state/postgrest.PRIVATE.conf >'+BASE+'/state/postgrest.PRIVATE.log 2>&1')
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-memory-forward.js gateway >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
        for _ in range(50):
            r=subprocess.run(M.DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/gateway.PRIVATE.json'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode==0:break
            time.sleep(.1)
        assert r.returncode==0,'w15-forward-gateway-readiness'
        inner(w,'run',1800)
        M.copy_out('FORWARD_RESULT.SAFE.json');result=json.loads((WORK/'FORWARD_RESULT.SAFE.json').read_text())
        assert result['status']=='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING'
        assert len(w.cas_records)==500
        # Growth is added to real peak, never subtracted from its accounting.
        projected=result['projectedAdditionalPhysicalBytes'];w.sample()
        assert w.maximum+projected+BUDGET['minimumCommonHeadroomBytes']<=M.MAXIMUM,'w15-forward-projected-common-reserve'
    except BaseException as e:failure={'type':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        if created:
            try:
                M.stop_owned(['run','setup','gateway','postgrest'])
                zero=M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
                assert zero,'w15-forward-active-unknown'
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            for n in ['FORWARD_RESULT.SAFE.json','FORWARD_ABORT.SAFE.json']:
                try:M.copy_out(n)
                except BaseException:pass
        if w:
            try:w.sample()
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            w.stop()
            if w.failure:failure=failure or w.failure
            if result and w.maximum+result['projectedAdditionalPhysicalBytes']+BUDGET['minimumCommonHeadroomBytes']>M.MAXIMUM:
                failure=failure or {'reason':'w15-forward-final-projected-common-reserve'}
        M.save('CONTROLLER_RESULT.SAFE.json',{'status':'PASS_FORWARD_ALLOCATION_INDEPENDENT_REVIEW_PENDING'if not failure and zero else'FAIL_OR_UNKNOWN',
          'failure':failure,'innerStopFailure':w.stop_failure if w else None,'activeProfiles':0 if zero else None,'CASCompleted':len(w.cas_records)if w else 0,
          'commonKernelPeakBytes':w.maximum if w else None,'lastKernel':w.last if w else None,
          'projectedAdditionalPhysicalBytes':result.get('projectedAdditionalPhysicalBytes')if result else None,
          'additionalProjectionMarginBytes':BUDGET['minimumCommonHeadroomBytes'],'units':0,'providerCalls':0,'profileActivations':0,'executionAuthority':False,
          'full500Acceptance':False,'retryAllowed':False})
    print(json.dumps({'status':'PASS'if not failure and zero else'FAIL_OR_UNKNOWN','failure':failure,'zero':zero}),flush=True)
    if failure or not zero:raise SystemExit(1)
if __name__=='__main__':main()
