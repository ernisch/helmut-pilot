#!/usr/bin/env python3
"""Isolated GitHub End500 memory contract only; never DR/Mock500 authority.

The independently imported controller's memory constants are scoped to this
End500 module. Historical v2 and the standalone Mock500 controller stay intact.
Old reviewed source pins still fail closed after these changes; no new start GO.
"""
import datetime,hashlib,importlib.util,json,os,pathlib,posixpath,shutil,subprocess,sys,threading,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
ASSETS=pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028')
WORK=pathlib.Path('/workspace/shared/helmut-w15-memory-atomic-20261028d')
BASE='/tmp/w15-memory-atomic-20261028d'
DB='helmut_w15_memory_atomic_20261028d'
CONTAINER='w15-memory-atomic-20261028d'
PREP=pathlib.Path('/workspace/shared/helmut-w15-memory-prepare-20261028d')
CACHE=pathlib.Path('/workspace/shared/helmut-w15-memory-atomic-20261028c/stage')
SEED=CACHE.parent/'seed.PRIVATE.sql'
SEED_SHA='a91d74064c3a717777cd25a743de27aaba4cb3dd0529b85270d24c503e5717d4'
SEED_MOUNT='/run/w15-end500-seed.PRIVATE.sql'
REPORTS=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028')
PLANNED_TOTAL=1512501248 # Includes64MiB in-flight allowance; not a filesystem quota.
PROCESSING_DISK_FLOOR=224*1024*1024
AUDIT_CLOSURE_FLOOR=64*1024*1024
STAGED_SCRIPTS=['synthetik-500-w15-memory-forward.js','synthetik-500-w15-auth-transport-probe.js','synthetik-500-w15-full500-runtime.js','fixtures/w15-auth-measurement-report.js','fixtures/w15-durable-observations.js','fixtures/w15-owned-process-stop.js','fixtures/w15-local-memory-budget.json','fixtures/w15-atomic-integration-target.json','fixtures/z3-plattform.js','fixtures/w15-memory-contract.js','fixtures/w15-memory-contract.json','fixtures/w15-end500-memory-contract.json','lokal.js','lokaler-netzschutz.js']
spec=importlib.util.spec_from_file_location('existing_w15_controller',ROOT/'scripts/synthetik-500-w15-full500-controller.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
M.WORK=WORK;M.BASE=BASE;M.DB=DB;M.CONTAINER=CONTAINER
M.MEMORY=json.loads((ROOT/'scripts/fixtures/w15-end500-memory-contract.json').read_text())
M.LIMIT=M.MEMORY['comparisonBudgetBytes']
M.RESERVE=(M.LIMIT*M.MEMORY['minimumReservePercent']+99)//100
M.MAXIMUM=M.LIMIT-M.RESERVE
assert M.MEMORY['version']=='helmut-w15-end500-memory-check/3' and M.MEMORY['scope']=='ISOLATED_GITHUB_END500_ONLY'
assert all(type(M.MEMORY[k])is int for k in ['comparisonBudgetBytes','minimumReservePercent','requiredReserveBytes','maximumConsumptionBytes','swapBytes'])
assert M.LIMIT==2560000000 and M.RESERVE==M.MEMORY['requiredReserveBytes']==512000000 and M.MAXIMUM==M.MEMORY['maximumConsumptionBytes']==2048000000
assert M.MEMORY['minimumReservePercent']==20 and M.MEMORY['swapBytes']==0 and M.MEMORY['mock500Acceptance']is False and M.MEMORY['executionAuthority']is False
BUDGET=json.loads((ROOT/'scripts/fixtures/w15-local-memory-budget.json').read_text())
audit_spec=importlib.util.spec_from_file_location('w15_final_native_audit',ROOT/'scripts/synthetik-500-w15-memory-final-audit.py')
AUDIT=importlib.util.module_from_spec(audit_spec);audit_spec.loader.exec_module(AUDIT)

def end500_memory_assessment(sample):
    """Assess genuine readbacks when provided; this pure function starts nothing."""
    if not isinstance(sample,dict):return False
    fields=['kernelLifetimePeakBytes','currentBytes','swapCurrentBytes']
    if not all(type(sample.get(k))is int and sample[k]>=0 for k in fields):return False
    events=sample.get('events')
    if not isinstance(events,dict)or not all(type(events.get(k))is int and events[k]==0 for k in ['max','oom','oom_kill','oom_group_kill']):return False
    return(sample.get('configuredLimit')==str(M.LIMIT)and sample.get('swapMaximum')=='0'
      and sample['swapCurrentBytes']==0 and sample['kernelLifetimePeakBytes']<=M.MAXIMUM
      and sample['currentBytes']<=M.MAXIMUM and M.LIMIT-sample['kernelLifetimePeakBytes']>=M.RESERVE)

def future_mock500_capacity(peak,projected):
    """Forecast only. It never changes the actual End500 memory assessment."""
    result={'executionAuthority':False,'mock500Acceptance':False,'forecastOnly':True,
      'comparisonBudgetBytes':M.MAXIMUM,'additionalProjectionMarginBytes':BUDGET['minimumCommonHeadroomBytes']}
    if not all(type(x)is int and x>=0 for x in [peak,projected]):
        return {**result,'status':'UNKNOWN','projectedMeetsBudget':None}
    projected_peak=peak+projected+BUDGET['minimumCommonHeadroomBytes']
    return {**result,'status':'DIAGNOSTIC_ONLY_NOT_MOCK500_ACCEPTANCE','measuredEnd500PeakBytes':peak,
      'projectedAdditionalPhysicalBytes':projected,'projectedPeakBytes':projected_peak,
      'projectedMeetsBudget':projected_peak<=M.MAXIMUM}

def digest_file(p):
    h=hashlib.sha256()
    with p.open('rb')as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def check_seed():
    s=SEED.lstat();assert SEED.is_file()and not SEED.is_symlink()and s.st_mode&0o777==0o600
    assert s.st_size==118800333 and digest_file(SEED)==SEED_SHA,'w15-seed-pin-drift'
def available_disk():
    s=os.statvfs('/workspace');return s.f_bavail*s.f_frsize
def prepare():
    assert not PREP.exists()and not WORK.exists(),'w15-prepare-once-only'
    plan=json.loads((REPORTS/'DISK_PLAN_D_GZIP_INDEPENDENT.SAFE.json').read_text())
    assert plan['status']=='PASS_PREPARATION_PLAN_ONLY_IMPLEMENTATION_AND_START_GATES_PENDING'
    assert available_disk()>=PLANNED_TOTAL,'w15-insufficient-preparation-disk'
    check_seed();os.umask(0o077);PREP.mkdir(mode=0o700)
    shutil.copytree(CACHE/'app',PREP/'app')
    shutil.copytree(ROOT/'lib',PREP/'app/lib',dirs_exist_ok=True)
    shutil.copy2(ROOT/'server.js',PREP/'app/server.js')
    for n in STAGED_SCRIPTS:shutil.copy2(ROOT/'scripts'/n,PREP/'app/scripts'/n)
    pins=[];allocated=0
    for p in sorted((PREP/'app').rglob('*')):
        assert not p.is_symlink(),'w15-prepared-app-symlink'
        if p.is_file():
            s=p.stat();allocated+=s.st_blocks*512;pins.append({'path':str(p.relative_to(PREP)),'bytes':s.st_size,'sha256':digest_file(p)})
    for n,h in [('node','bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest','870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:
        assert digest_file(CACHE/n)==h,'w15-cached-binary-pin'
    with(PREP/'PREPARED.SAFE.json').open('x')as f:
        os.chmod(f.name,0o600);json.dump({'status':'PASS_LOCAL_FILES_PREPARED_NO_DATABASE','appAllocatedBytes':allocated,
          'availableDiskBytes':available_disk(),'seedSHA256':SEED_SHA,'appPins':pins,'databaseCreated':False,'journalTestsRepeated':False},f,indent=2);f.write('\n');f.flush();os.fdatasync(f.fileno())
    print(json.dumps({'status':'PASS_LOCAL_FILES_PREPARED_NO_DATABASE','appAllocatedBytes':allocated,'availableDiskBytes':available_disk()}),flush=True)

class Watch(M.Supervisor):
    def __init__(self,cgroup):
        self.cas_records=[];self.last_component=0;self.disk_phase='processing';self.audit_remaining=64*1024*1024;self.disk=None
        self.memory_failure=None
        self.initial_disk_free=available_disk()
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
        memory_error=None
        try:
            super().sample() # Same common lifetime measurement, End500-scoped limits.
            assert end500_memory_assessment(self.last),'w15-end500-memory-measurement-invalid-or-out-of-contract'
            self.last.update({'memoryContractVersion':M.MEMORY['version'],'physicalHardCapBytes':M.LIMIT,
              'maximumAllowedPeakBytes':M.MAXIMUM,'requiredPhysicalReserveBytes':M.RESERVE,
              'physicalReserveBytes':M.LIMIT-self.last['kernelLifetimePeakBytes']})
        except BaseException as error:memory_error=error
        if memory_error and self.memory_failure is None:
            self.memory_failure={'type':type(memory_error).__name__,'reason':'end500-memory-readback-invalid-or-out-of-contract'}
        try:self.disk_check()
        except BaseException:
            if memory_error:raise memory_error
            raise
        if memory_error:raise memory_error
        if(WORK/'state/SERVICE_FAILURE.SAFE.json').exists():raise RuntimeError('w15-forward-service-failed')
        if time.monotonic()-self.last_component>=1:
            stats={k:int(v)for k,v in(x.split()for x in(self.cgroup/'memory.stat').read_text().splitlines())}
            self.progress_queue.put_nowait({'name':'kernel-components','atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'casCompleted':len(self.cas_records),'kernel':self.last.copy(),'disk':self.disk,'stat':stats})
            self.last_component=time.monotonic()
    def publish(self,name,index=None,status=None):
        with self.progress_lock:
            mem=self.last;peak=None if mem is None else mem['kernelLifetimePeakBytes']
            message='RAM-Diagnose | CAS '+str(len(self.cas_records))+'/500 | '+name
            if mem:
                message+=' | RAM {:.1f} MB | Peak {:.1f} MB | Reserve {:.1f} MB ({:.2f} %)'.format(mem['currentBytes']/1e6,peak/1e6,(M.LIMIT-peak)/1e6,100*(M.LIMIT-peak)/M.LIMIT)
            if self.cas_records:message+=' | Auth-Max {:.9f} s'.format(self.cas_records[-1]['authTimings']['maximumFullCallWallMs']/1000)
            if self.cas_records:message+=' | Auth+Beleg-Max {:.9f} s'.format(self.cas_records[-1]['maximumAuthThroughDurableObservationWallMs']/1000)
            if self.disk:message+=' | Platte frei {:.1f} MB'.format(self.disk['availableBytes']/1e6)
            self.progress_queue.put_nowait({'name':name,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'casCompleted':len(self.cas_records),
              'kernel':mem,'disk':self.disk,'failure':self.failure,'authTimings':self.cas_records[-1]['authTimings']if self.cas_records else None,'message':message})
            self.last_terminal_monotonic=time.monotonic()
    def observe_line(self,raw,stage):
        if stage!='run'or len(raw)>4096:return
        try:x=json.loads(raw)
        except(ValueError,UnicodeError):return
        if x.get('name')=='memory-forward-result'and x.get('status')!='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING':
            self.first_failure(RuntimeError('w15-forward-inner-failed-result'));return
        if x.get('name')!='memory-cas-accepted':return
        assert x.get('index')==len(self.cas_records),'w15-forward-cas-sequence'
        assert x['postimagePreserved']is True and x['revisionReadback']is True
        self.cas_records.append(x)
        self.publish('memory-cas-accepted',x['index'],'PASS')
    def disk_check(self):
        free=available_disk()
        floor=PROCESSING_DISK_FLOOR if self.disk_phase=='processing'else self.audit_remaining+AUDIT_CLOSURE_FLOOR
        self.disk={'availableBytes':free,'initialBytes':self.initial_disk_free,'consumedSinceWatcherBytes':self.initial_disk_free-free,
          'phase':self.disk_phase,'requiredFreeBytes':floor,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        assert free>=floor,'w15-forward-disk-closure-reserve'
        return self.disk
    def audit_guard(self,state):
        self.disk_phase=state['phase'];self.audit_remaining=state['remainingAuditAllowanceBytes']if state['phase']=='capture'else 0
        self.disk_check()

def pin(pin):
    p=pathlib.Path(pin['path']);assert p.is_file()and not p.is_symlink()and p.stat().st_mode&0o777==0o600
    b=p.read_bytes();assert len(b)==pin['bytes']and hashlib.sha256(b).hexdigest()==pin['sha256']
    return p,b
def inner(w,action,seconds):
    command='umask 077; echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-memory-forward.js '+action
    w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',command],action,seconds)
def main():
    prepared=json.loads((PREP/'PREPARED.SAFE.json').read_text())
    assert prepared['status']=='PASS_LOCAL_FILES_PREPARED_NO_DATABASE'
    assert available_disk()>=PLANNED_TOTAL-prepared['appAllocatedBytes'],'w15-insufficient-start-disk'
    for p in prepared['appPins']:
        path=PREP/p['path'];assert path.is_file()and not path.is_symlink()
        assert path.stat().st_size==p['bytes']and digest_file(path)==p['sha256'],'w15-prepared-app-drift'
    for n in STAGED_SCRIPTS:assert (ROOT/'scripts'/n).read_bytes()==(PREP/'app/scripts'/n).read_bytes(),'w15-prepared-script-drift'
    journal_review=json.loads((REPORTS/'JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json').read_text())
    assert journal_review['status']=='PASS_INDEPENDENT_BOUNDED_JOURNAL_DRAIN_AND_FOUR_FAULTS'
    for p in journal_review['actualSourcePins']:
        assert (ROOT/p['path']).stat().st_size==p['bytes']and digest_file(ROOT/p['path'])==p['sha256'],'w15-journal-proof-drift'
    check_seed()
    target=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
    integration=json.loads((pathlib.Path(target['work'])/'INTEGRATION_RESULT.SAFE.json').read_text())
    assert integration['status']=='PASS_PREPARED0_ATOMIC_COMPONENTS_RAM_PENDING'and integration['activeProfiles']==0
    assert integration['originalSourceUnchanged']is True and integration['units']==0
    parser=json.loads((ASSETS/'sql-preflight-atomic-e/SQL_PREFLIGHT.SAFE.json').read_text())
    assert parser['status']=='PASS_ALL_GENERATED_DIAGNOSTIC_SQL_PARSE_DESCRIBE_NO_EXECUTION'and parser['plannedDatabase']==DB
    for name,expected in parser['sourcePins'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,'atomic-sql-reviewed-source-drift'
    review=json.loads((REPORTS/'MEMORY_PRESTART_REVIEW_D.SAFE.json').read_text())
    assert review['status']=='PASS_PRESTART_ATOMIC_END500_ALLOCATION_ONLY'
    for reviewed_pin in review['sourcePins']:
        p=ROOT/reviewed_pin['path'];b=p.read_bytes();assert len(b)==reviewed_pin['bytes']and hashlib.sha256(b).hexdigest()==reviewed_pin['sha256'],'atomic-memory-reviewed-source-drift'
    stop_path=pathlib.Path('/workspace/shared/helmut-w15-postgrest-stop-check-20261028/RESULT.SAFE.json')
    stop_result=json.loads(stop_path.read_text())
    assert stop_result['status']=='PASS_REAL_POSTGREST_CONTROLLED_STOP'
    stop_review=json.loads(pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json').read_text())
    assert stop_review['status']=='PASS_REAL_STOP_AND_EXISTING_TRANSPORT_PROTECTIONS'
    assert stop_review['stopReportSHA256']==hashlib.sha256(stop_path.read_bytes()).hexdigest()
    assert stop_review['historicalEleventhOutcome']=='UNCHANGED_UNKNOWN_NOT_REPLAYED'
    corrections_path=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/OBSERVATION_RESULTS_REVIEW.SAFE.json')
    corrections=json.loads(corrections_path.read_text())
    assert corrections['status']=='PASS_INDEPENDENT_OBSERVATION_CORRECTIONS'
    assert review['observationCorrectionsReviewSHA256']==hashlib.sha256(corrections_path.read_bytes()).hexdigest()
    growth_path=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/RAM_B_GROWTH_LATE_WINDOWS.SAFE.json')
    assert review['growthAnalysisSHA256']==hashlib.sha256(growth_path.read_bytes()).hexdigest()
    assert not WORK.exists(),'w15-forward-once-only'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    created=False;seeded=False;w=None;failure=None;result=None;zero=False;stop_failures=[];zero_check_failure=None;service_closure=None;final_audit=None
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
        stage=PREP
        for n,h in [('node','bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest','870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:
            assert digest_file(CACHE/n)==h,'w15-cached-binary-pin'
        check_seed()
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700)
        state=WORK/'state';state.mkdir(mode=0o700)
        M.docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no','--memory='+str(M.LIMIT),'--memory-swap='+str(M.LIMIT),
          '--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data',
          '--mount','type=bind,src='+str(SEED)+',dst='+SEED_MOUNT+',readonly',
          '--mount','type=bind,src='+str(state)+',dst='+BASE+'/state','-e','POSTGRES_HOST_AUTH_METHOD=trust',M.IMAGE,
          'postgres','-c','helmut.local_usage_experiment=on','-c','max_wal_size='+str(BUDGET['postgresMaxWalMiB'])+'MB','-c','work_mem='+str(BUDGET['postgresWorkMemMiB'])+'MB',
          '-c','autovacuum_naptime='+str(BUDGET['postgresAutovacuumNaptimeSeconds'])+'s');created=True
        M.docker('start',CONTAINER);info=json.loads(M.docker('inspect',CONTAINER))[0]
        assert info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==M.LIMIT and info['HostConfig']['MemorySwap']==M.LIMIT
        seed_mounts=[x for x in info['Mounts']if x['Destination']==SEED_MOUNT]
        assert len(seed_mounts)==1 and seed_mounts[0]['Source']==str(SEED)and seed_mounts[0]['RW']is False,'w15-seed-must-be-readonly'
        M.save('READONLY_SEED_MOUNT.SAFE.json',{'sourceSHA256':SEED_SHA,'readOnly':True,'singleFileOnly':True})
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
        for n,source in [('app',stage/'app'),('node',CACHE/'node'),('postgrest',CACHE/'postgrest')]:
            w.disk_check();M.copy_in(source,BASE+'/'+n);w.disk_check()
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
        restored=M.read("select jsonb_build_object('profiles',count(*),'active',count(*)filter(where aktiv))from public.mandate_profiles;",database=DB)
        assert restored=={'profiles':500,'active':0},'w15-forward-restored500-zero'
        M.save('RESTORED500_ZERO.SAFE.json',restored)
        # Seed all retained500-end positions in native tables, one bounded row
        # per statement. No fake execution/quality claims or source mutation.
        seed=SEED;row_ids={}
        for key in ['evidenceRows','privateDraftStoreRows','resultRows','privateDraftReviewRows']:
            row_ids[key]=[x['id']for x in json.loads(paths[key].read_text())]
        seed_cmd='umask 077; echo $$ >'+BASE+'/state/setup.pid; exec timeout --signal=TERM --kill-after=5s 170s psql -X -w -qAt -v ON_ERROR_STOP=1 -U postgres -d '+DB+' -f '+SEED_MOUNT
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
        seeded=True
        # Install only in this new netless copy after all native seed postimages.
        M.sql((ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_text(),database=DB)
        initial=M.read("select jsonb_build_object('logicalHash',encode(sha256(convert_to((data-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',jsonb_array_length(data->'llmUsage'))from public.helmut_store where id='main-auth';",database=DB)
        M.sql("select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')))from public.helmut_store where id='main-auth';",database=DB)
        converted=M.read("select jsonb_build_object('logicalHash',encode(sha256(convert_to(((public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'))->'data')-'_authStoreRevision')::text,'UTF8')),'hex'),'usage',(select count(*)from public.llm_usage where usage_store_id='main-auth'));",database=DB)
        assert initial==converted and converted['usage']==6000,'w15-atomic-full-history-bootstrap'
        M.save('ATOMIC_BOOTSTRAP.SAFE.json',{'status':'PASS_EXACT_LOGICAL_STATE_PRESERVED','before':initial,'after':converted})
        inner(w,'setup',90)
        staged_dry=M.docker('exec','--user','1000:1000',CONTAINER,'env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8',
          'HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local',BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js',
          BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js','--serve-memory','--dry-run')
        dry_result=json.loads(staged_dry)
        assert dry_result['status']=='PASS_INERT_MEMORY_SERVICE_DRY'and dry_result['database']==DB and dry_result['HTTP']==dry_result['childStarts']==0
        M.save('SERVICE_STAGED_DRY.SAFE.json',dry_result)
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js --serve-memory >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
        for _ in range(120):
            r=subprocess.run(M.DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/gateway.PRIVATE.json'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode==0:break
            time.sleep(.1)
        assert r.returncode==0,'w15-forward-gateway-readiness'
        inner(w,'run',3600)
        M.copy_out('FORWARD_RESULT.SAFE.json');result=json.loads((WORK/'FORWARD_RESULT.SAFE.json').read_text())
        assert result['status']=='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING'
        assert len(w.cas_records)==500
        # Preserve the unchanged 6500-write projection as separate Mock500 context.
        # Only actual common kernel measurements determine End500 RAM acceptance.
        w.sample();result['futureMock500Capacity']=future_mock500_capacity(w.maximum,result.get('projectedAdditionalPhysicalBytes'))
    except BaseException as e:failure={'type':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        if w:w.closure_mode=True
        if created:
            # Each owned stop is attempted once. A failed stop never skips
            # the separate native read-only zero check or hides later failures.
            for action in ['run','setup','gateway','postgrest']:
                try:M.stop_owned([action])
                except BaseException as e:
                    stop_failure={'action':action,'type':type(e).__name__,
                      'reason':'owned-stop-failed-or-unknown',
                      'diagnostics':getattr(e,'safe_failure',None)}
                    stop_failures.append(stop_failure)
                    failure=failure or stop_failure
            try:
                zero=M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
                assert zero,'w15-forward-active-unknown'
            except BaseException as e:
                zero_check_failure={'type':type(e).__name__,'reason':'native-zero-check-failed-or-unknown'}
                failure=failure or zero_check_failure
            M.save('NATIVE_ZERO.SAFE.json',{'activeProfiles':0 if zero else None,
              'confirmed':zero,'failure':zero_check_failure,'readOnly':True,'profileActivations':0})
            if stop_failures:M.save('STOP_FAILURES.SAFE.json',{'failures':stop_failures,'retryAllowed':False})
            # /proc absence is not a child-exit acknowledgement. The existing
            # service parent must retain one genuine accepted TERM/exit receipt.
            try:
                rows=[json.loads(line)for line in(WORK/'state/gateway-observations.SAFE.jsonl').read_text().splitlines()]
                signals=[x for x in rows if x['name']=='postgrest-signal-request']
                exits=[x for x in rows if x['name']=='postgrest-exit']
                closed=[x for x in rows if x['name']=='services-stopped']
                assert len(signals)==len(exits)==len(closed)==1
                assert signals[0]['signal']=='SIGTERM'and signals[0]['accepted']is True
                assert (exits[0]['code']==0 and exits[0]['signal']is None)or(exits[0]['code']is None and exits[0]['signal']in ['SIGINT','SIGTERM'])
                assert closed[0]['confirmed']is True and closed[0]['forced']is False
                assert closed[0]['openSockets']==closed[0]['agentSockets']==closed[0]['agentFreeSockets']==0
                assert not(WORK/'state/SERVICE_FAILURE.SAFE.json').exists()
                drain=json.loads((WORK/'state/GATEWAY_DRAIN.SAFE.json').read_text())
                assert drain['confirmed']is True and drain['journal']['closed']is True
                assert drain['journal']['status']=='DURABLE_ACKNOWLEDGED'and drain['journal']['pendingEntries']==0
                assert drain['journal']['completedSyncs']==len(rows)and drain['journal']['acknowledgedSequence']==len(rows)-1
                service_closure={'status':'PASS_GENUINE_OWNED_SERVICE_EXIT','signalRequest':signals[0],
                  'postgrestExit':exits[0],'servicesStopped':closed[0],'durableDrain':drain}
            except BaseException as e:
                service_closure={'status':'FAIL_OR_UNKNOWN','reason':'owned-service-exit-unconfirmed','type':type(e).__name__}
                failure=failure or service_closure
            M.save('SERVICE_CLOSURE.SAFE.json',service_closure)
            for n in ['FORWARD_RESULT.SAFE.json','FORWARD_ABORT_INITIAL.SAFE.json','FORWARD_ABORT.SAFE.json','gateway-observations.SAFE.jsonl','SERVICE_FAILURE.SAFE.json','GATEWAY_DRAIN.SAFE.json']:
                try:M.copy_out(n)
                except BaseException:pass
            if seeded:
                try:
                    w.disk_phase='capture';w.audit_remaining=64*1024*1024;w.disk_check()
                    M.STARTED_INNER_ACTIONS.add('audit')
                    final_audit=AUDIT.capture(CONTAINER,DB,WORK,paths,expectedProbe=499 if not failure and result and len(w.cas_records)==500 else None,
                      guard=w.audit_guard,stop_owned=lambda:M.stop_owned(['audit'],require_registered=True))
                    assert final_audit['status']=='PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY'
                    # A second fresh0 read after the consistent audit snapshot.
                    zero=M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
                    assert zero,'w15-forward-after-audit-active-unknown'
                    M.save('NATIVE_ZERO_AFTER_AUDIT.SAFE.json',{'activeProfiles':0,'confirmed':True,'readOnly':True})
                except BaseException as error:
                    failure=failure or {'type':type(error).__name__,'reason':'w15-forward-native-final-audit-failed-or-unknown'}
        try:check_seed()
        except BaseException as error:failure=failure or {'type':type(error).__name__,'reason':'w15-readonly-seed-source-drift'}
        final_sample_verified=False
        if w:
            try:w.sample();final_sample_verified=True
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            w.stop()
            if w.failure:failure=failure or w.failure
        future_capacity=future_mock500_capacity(w.maximum,result.get('projectedAdditionalPhysicalBytes'))if w and result else None
        actual_memory_accepted=bool(w and final_sample_verified and not failure and not w.failure and not w.memory_failure
          and result and result['status']=='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING'and len(w.cas_records)==500
          and final_audit and final_audit['status']=='PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY'and zero)
        M.save('CONTROLLER_RESULT.SAFE.json',{'status':'PASS_FORWARD_ALLOCATION_INDEPENDENT_REVIEW_PENDING'if not failure and zero else'FAIL_OR_UNKNOWN',
          'failure':failure,'innerStopFailure':w.stop_failure if w else None,'stopFailures':stop_failures,'zeroCheckFailure':zero_check_failure,'serviceClosure':service_closure,'activeProfiles':0 if zero else None,'CASCompleted':len(w.cas_records)if w else 0,
          'commonKernelPeakBytes':w.maximum if w else None,'lastKernel':w.last if w else None,
          'memoryContract':M.MEMORY,'physicalHardCapBytes':M.LIMIT,'maximumAllowedPeakBytes':M.MAXIMUM,
          'requiredPhysicalReserveBytes':M.RESERVE,'finalKernelReadbackVerified':final_sample_verified,
          'end500ActualMemoryAccepted':actual_memory_accepted,'memoryMeasurementFailure':w.memory_failure if w else None,
          'futureMock500Capacity':future_capacity,
          'finalNativeAudit':final_audit,'lastDisk':w.disk if w else None,
          'projectedAdditionalPhysicalBytes':result.get('projectedAdditionalPhysicalBytes')if result else None,
          'additionalProjectionMarginBytes':BUDGET['minimumCommonHeadroomBytes'],'units':0,'providerCalls':0,'profileActivations':0,'executionAuthority':False,
          'full500Acceptance':False,'retryAllowed':False})
    print(json.dumps({'status':'PASS'if not failure and zero else'FAIL_OR_UNKNOWN','failure':failure,'zero':zero}),flush=True)
    if failure or not zero:raise SystemExit(1)
if __name__=='__main__':
    assert sys.argv[1:]in [['--prepare-only'],['--run']],'w15-memory-forward-explicit-action'
    (prepare if sys.argv[1]=='--prepare-only'else main)()
