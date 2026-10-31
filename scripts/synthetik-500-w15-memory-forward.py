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
STAGED_SCRIPTS=['synthetik-500-w15-memory-forward.js','synthetik-500-w15-auth-transport-probe.js','synthetik-500-w15-full500-runtime.js','fixtures/w15-auth-measurement-report.js','fixtures/w15-native-failure.js','fixtures/w15-durable-observations.js','fixtures/w15-owned-process-stop.js','fixtures/w15-local-memory-budget.json','fixtures/w15-atomic-integration-target.json','fixtures/z3-plattform.js','fixtures/w15-memory-contract.js','fixtures/w15-memory-contract.json','fixtures/w15-end500-memory-contract.json','lokal.js','lokaler-netzschutz.js','bb-nachweis-importpaket-generator.js','w15-github/mock500_bindings.js']
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

def _runtime_module(component='runtime_inputs'):
    assert component in ['runtime_inputs','runtime_backup','runtime_owned_backup','common_resources','runtime_materialization','runtime_cache','runtime_restore','runner_diagnostics']
    name='w15_github_'+component
    if name not in sys.modules:
        spec=importlib.util.spec_from_file_location(name,ROOT/'scripts/w15-github'/(component+'.py'))
        module=importlib.util.module_from_spec(spec);sys.modules[name]=module
        try:spec.loader.exec_module(module)
        except BaseException:
            del sys.modules[name];raise
    return sys.modules[name]

def open_runtime_inputs(*args,**kwargs):
    """Observe received inputs/current source review only. Never start work."""
    return _runtime_module().open_inputs(*args,**kwargs)

def open_common_resources(context):
    """Observe only; caller must already be in the actual limited parent."""
    return _runtime_module('common_resources').observe(context)

def _checked_common_resources(inputs,resources):
    if inputs is not None:
        assert type(resources)is _runtime_module('common_resources').CommonResources,'w15-common-parent-required'
        resources.check_context(inputs.controller_context())
    else:assert resources is None,'w15-common-parent-explicit-runtime-only'
    return resources

def _checked_runtime_inputs(inputs):
    if inputs is not None:
        assert type(inputs)is _runtime_module().RuntimeInputs,'w15-runtime-input-binding-type'
        assert M.WORK==AUDIT.WORK==WORK and M.BASE==AUDIT.BASE==BASE,'w15-runtime-host-bindings'
        assert M.DB==AUDIT.DATABASE==DB and M.CONTAINER==AUDIT.CONTAINER==CONTAINER,'w15-runtime-database-bindings'
        assert (M.LIMIT,M.RESERVE,M.MAXIMUM)==(2560000000,512000000,2048000000),'w15-runtime-memory-bindings'
        inputs.check_controller(work=WORK,prepare=PREP,cache=CACHE,base=BASE,database=DB,container=CONTAINER,image=M.IMAGE)
    return inputs

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
def check_seed(inputs=None):
    seed=SEED if inputs is None else inputs.path('seed')
    s=seed.lstat();assert seed.is_file()and not seed.is_symlink()and s.st_mode&0o777==0o600
    assert s.st_size==118800333 and digest_file(seed)==SEED_SHA,'w15-seed-pin-drift'
    return seed
def available_disk():
    path=WORK.parent
    while not path.exists():path=path.parent
    s=os.statvfs(path);return s.f_bavail*s.f_frsize
def prepare(inputs=None,common_resources=None):
    inputs=_checked_runtime_inputs(inputs)
    _checked_common_resources(inputs,common_resources)
    assert not PREP.exists()and not WORK.exists(),'w15-prepare-once-only'
    plan=inputs.report('DISK_PLAN_D_GZIP_INDEPENDENT.SAFE.json')if inputs else json.loads((REPORTS/'DISK_PLAN_D_GZIP_INDEPENDENT.SAFE.json').read_text())
    assert plan['status']=='PASS_PREPARATION_PLAN_ONLY_IMPLEMENTATION_AND_START_GATES_PENDING'
    assert available_disk()>=PLANNED_TOTAL,'w15-insufficient-preparation-disk'
    check_seed(inputs);os.umask(0o077);PREP.mkdir(mode=0o700)
    shutil.copytree(CACHE/'app',PREP/'app')
    shutil.copytree(ROOT/'lib',PREP/'app/lib',dirs_exist_ok=True)
    for name in ['server.js','vercel.json']:
        shutil.copy2(ROOT/name,PREP/'app'/name)
    (PREP/'app/scripts/w15-github').mkdir(mode=0o700,exist_ok=True)
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

def capacity_phase(resources,name):
    if getattr(resources,'end_capacity_diagnostic',False):
        resources.phase_observer('capacity-'+name)

def backup_phase(resources,name):
    assert name in ('backup-collect','backup-seal','backup-postcheck')
    observer=getattr(resources,'phase_observer',None)
    if observer is not None:observer(name)

class Watch(M.Supervisor):
    def __init__(self,cgroup):
        self.backup_runner=None;self.common_resources=None;self.disk_guard=None
        self.cas_records=[];self.last_component=0;self.disk_phase='processing';self.audit_remaining=64*1024*1024;self.disk=None
        self.memory_failure=None
        self.native_failure=None
        self.initial_disk_free=available_disk()
        super().__init__(cgroup)
    def first_failure(self,error):
        if getattr(self,'native_failure',None) is not None:
            error.native_failure=self.native_failure
        if self.backup_runner is not None and self.stage_name in self.backup_runner.actions:
            return self.backup_runner.first_failure(error)
        return super().first_failure(error)
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
            if self.common_resources is not None:self.common_resources.sample()
            if getattr(self.common_resources,'capacity_diagnostic',False) is True or getattr(self.common_resources,'memory_phase',None)=='backup':
                # Explicit capacity admission owns the unchanged hard/time/disk safety checks.
                assert self.start_guard is None and not self.mock_backup_closure
                self.last=self.common_resources.sample()
                self.maximum=max(self.maximum,self.last['kernelLifetimePeakBytes'])
                self.last.update({'capacityDiagnosticOnly':True,'legacyContractAccepted':False})
            else:
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
            capacity=getattr(self.common_resources,'capacity_diagnostic',False) is True or getattr(self.common_resources,'memory_phase',None)=='backup'
            physical=self.common_resources.container_limit if capacity else M.LIMIT
            message=('Restore-Kapazitaet | '+name if capacity else 'RAM-Diagnose | CAS '+str(len(self.cas_records))+'/500 | '+name)
            if mem:
                label='Parentrest' if capacity else 'Reserve'
                message+=(' | RAM {:.1f} MB | Peak {:.1f} MB | '+label+' {:.1f} MB ({:.2f} %)').format(mem['currentBytes']/1e6,peak/1e6,(physical-peak)/1e6,100*(physical-peak)/physical)
            if self.cas_records:message+=' | Auth-Max {:.9f} s'.format(self.cas_records[-1]['authTimings']['maximumFullCallWallMs']/1000)
            if self.cas_records:message+=' | Auth+Beleg-Max {:.9f} s'.format(self.cas_records[-1]['maximumAuthThroughDurableObservationWallMs']/1000)
            if self.disk:message+=' | Platte frei {:.1f} MB'.format(self.disk['availableBytes']/1e6)
            self.progress_queue.put_nowait({'name':name,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'casCompleted':len(self.cas_records),
              'kernel':mem,'disk':self.disk,'failure':self.failure,'authTimings':self.cas_records[-1]['authTimings']if self.cas_records else None,'message':message})
            self.last_terminal_monotonic=time.monotonic()
    def observe_line(self,raw,stage):
        if stage not in ('setup','run')or len(raw)>4096:return
        try:x=json.loads(raw)
        except(ValueError,UnicodeError):return
        if type(x)is not dict:return
        if x.get('name')=='memory-forward-first-failure':
            value=_runtime_module('runner_diagnostics').native_failure(x.get('failure'))
            if value is not None and getattr(self,'native_failure',None) is None:
                self.native_failure=value
                try:M.save('NATIVE_FIRST_FAILURE.SAFE.json',value)
                except Exception:pass
                observer=getattr(self.common_resources,'native_failure_observer',None)
                if callable(observer):
                    try:observer(value)
                    except Exception:pass
            # Receiving a first failure must not interrupt the producer's
            # finally/drain. The existing final-result/stage-exit stops Watch.
            return
        if stage!='run':return
        if x.get('name')=='memory-forward-result'and x.get('status')!='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING':
            self.first_failure(RuntimeError('w15-forward-inner-failed-result'));return
        if x.get('name')!='memory-cas-accepted':return
        assert x.get('index')==len(self.cas_records),'w15-forward-cas-sequence'
        assert x['postimagePreserved']is True and x['revisionReadback']is True
        self.cas_records.append(x)
        if getattr(self.common_resources,'end_capacity_diagnostic',False):
            self.common_resources.capacity_observer(progress={'authCAS':{'value':len(self.cas_records),'kind':'CONFIRMED_LOWER_BOUND'}})
        self.publish('memory-cas-accepted',x['index'],'PASS')
    def disk_check(self):
        if self.disk_guard is not None:self.disk_guard()
        free=available_disk()
        floor=PROCESSING_DISK_FLOOR if self.disk_phase=='processing'else self.audit_remaining+AUDIT_CLOSURE_FLOOR
        self.disk={'availableBytes':free,'initialBytes':self.initial_disk_free,'consumedSinceWatcherBytes':self.initial_disk_free-free,
          'phase':self.disk_phase,'requiredFreeBytes':floor,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        assert free>=floor,'w15-forward-disk-closure-reserve'
        return self.disk
    def audit_guard(self,state):
        self.disk_phase=state['phase'];self.audit_remaining=state['remainingAuditAllowanceBytes']if state['phase']=='capture'else 0
        self.disk_check()

def pin(pin,inputs=None):
    p=pathlib.Path(pin['path'])if inputs is None else inputs.resolve(pin)
    assert p.is_file()and not p.is_symlink()and p.stat().st_mode&0o777==0o600
    b=p.read_bytes();assert len(b)==pin['bytes']and hashlib.sha256(b).hexdigest()==pin['sha256']
    return p,b
def inner(w,action,seconds):
    command='umask 077; echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-memory-forward.js '+action
    w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',command],action,seconds)
def _checked_prepared(inputs=None,common_resources=None):
    """Share the existing prepared-file admission with the bounded restore path."""
    inputs=_checked_runtime_inputs(inputs)
    _checked_common_resources(inputs,common_resources)
    prepared=json.loads((PREP/'PREPARED.SAFE.json').read_text())
    assert prepared['status']=='PASS_LOCAL_FILES_PREPARED_NO_DATABASE'
    assert available_disk()>=PLANNED_TOTAL-prepared['appAllocatedBytes'],'w15-insufficient-start-disk'
    for p in prepared['appPins']:
        path=PREP/p['path'];assert path.is_file()and not path.is_symlink()
        assert path.stat().st_size==p['bytes']and digest_file(path)==p['sha256'],'w15-prepared-app-drift'
    for n in STAGED_SCRIPTS:assert (ROOT/'scripts'/n).read_bytes()==(PREP/'app/scripts'/n).read_bytes(),'w15-prepared-script-drift'
    return prepared

def _restore_database(inputs,w):
    """The shared restore boundary ends before seed, native postimages and CAS."""
    restore=_runtime_module('runtime_restore')
    if inputs is None:return restore.restore_legacy(M)
    previous=w.backup_runner
    w.backup_runner=_runtime_module('runtime_owned_backup').OwnedBackupRunner(
      w,M,base=BASE,container=CONTAINER,database=DB,scope='end500-restore')
    try:return restore.restore_owned(M,w,run_owned=w.backup_runner.run_owned)
    finally:w.backup_runner=previous

def _runtime_container_labels(inputs):
    context=inputs.controller_context()
    return {'helmut.w15.scope':'isolated-end500-only','helmut.w15.run':context['runId'],
      'helmut.w15.nonce':context['nonce'],'helmut.w15.commit':context['exactCommit']}

def _owned_runtime_container(inputs,resources,expected_id=None):
    info=json.loads(M.docker('inspect',expected_id or CONTAINER))[0]
    assert info['Name']=='/'+CONTAINER and info['Config']['Labels']==_runtime_container_labels(inputs)
    assert info['Image']==M.IMAGE and info['HostConfig']['CgroupParent']==resources.unit
    assert len(info['Id'])==64 and all(c in '0123456789abcdef'for c in info['Id'])
    assert expected_id is None or info['Id']==expected_id
    return info

def _stop_runtime_container(inputs,resources,owned_id):
    info=_owned_runtime_container(inputs,resources,owned_id)
    if info['State']['Running']:M.docker('stop','--time','5',info['Id'],timeout=12)
    final=_owned_runtime_container(inputs,resources,info['Id'])
    assert final['State']['Running']is False and final['State']['Pid']==0
    assert final['State'].get('OOMKilled')is False and final['State'].get('ExitCode')==0
    resources.sample()
    return {'status':'PASS_OWNED_END500_DATABASE_STOP','confirmed':True,'exitCode':0,'oomKilled':False}

def main(inputs=None,common_resources=None,*,backup_completion=None,disk_guard=None):
    inputs=_checked_runtime_inputs(inputs)
    common_resources=_checked_common_resources(inputs,common_resources)
    physical_limit=common_resources.container_limit if getattr(common_resources,'end_capacity_diagnostic',False) else M.LIMIT
    prepared=_checked_prepared(inputs,common_resources)
    journal_review=inputs.report('JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json')if inputs else json.loads((REPORTS/'JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json').read_text())
    assert journal_review['status']=='PASS_INDEPENDENT_BOUNDED_JOURNAL_DRAIN_AND_FOUR_FAULTS'
    for p in journal_review['actualSourcePins']:
        if inputs:inputs.check_historical_source(p)
        else:assert (ROOT/p['path']).stat().st_size==p['bytes']and digest_file(ROOT/p['path'])==p['sha256'],'w15-journal-proof-drift'
    seed=check_seed(inputs)
    target=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
    integration=inputs.report('INTEGRATION_RESULT.SAFE.json')if inputs else json.loads((pathlib.Path(target['work'])/'INTEGRATION_RESULT.SAFE.json').read_text())
    assert integration['status']=='PASS_PREPARED0_ATOMIC_COMPONENTS_RAM_PENDING'and integration['activeProfiles']==0
    assert integration['originalSourceUnchanged']is True and integration['units']==0
    parser=inputs.report('SQL_PREFLIGHT_D.SAFE.json')if inputs else json.loads((ASSETS/'sql-preflight-atomic-e/SQL_PREFLIGHT.SAFE.json').read_text())
    assert parser['status']=='PASS_ALL_GENERATED_DIAGNOSTIC_SQL_PARSE_DESCRIBE_NO_EXECUTION'and parser['plannedDatabase']==DB
    for name,expected in parser['sourcePins'].items():
        if inputs:inputs.check_historical_source({'path':name,'sha256':expected})
        else:assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,'atomic-sql-reviewed-source-drift'
    review=inputs.report('MEMORY_PRESTART_REVIEW_D.SAFE.json')if inputs else json.loads((REPORTS/'MEMORY_PRESTART_REVIEW_D.SAFE.json').read_text())
    assert review['status']=='PASS_PRESTART_ATOMIC_END500_ALLOCATION_ONLY'
    for reviewed_pin in review['sourcePins']:
        if inputs:inputs.check_historical_source(reviewed_pin)
        else:
            p=ROOT/reviewed_pin['path'];b=p.read_bytes();assert len(b)==reviewed_pin['bytes']and hashlib.sha256(b).hexdigest()==reviewed_pin['sha256'],'atomic-memory-reviewed-source-drift'
    stop_path=inputs.report_path('POSTGREST_STOP_RESULT.SAFE.json')if inputs else pathlib.Path('/workspace/shared/helmut-w15-postgrest-stop-check-20261028/RESULT.SAFE.json')
    stop_result=json.loads(stop_path.read_text())
    assert stop_result['status']=='PASS_REAL_POSTGREST_CONTROLLED_STOP'
    stop_review=inputs.report('POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json')if inputs else json.loads(pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json').read_text())
    assert stop_review['status']=='PASS_REAL_STOP_AND_EXISTING_TRANSPORT_PROTECTIONS'
    assert stop_review['stopReportSHA256']==hashlib.sha256(stop_path.read_bytes()).hexdigest()
    assert stop_review['historicalEleventhOutcome']=='UNCHANGED_UNKNOWN_NOT_REPLAYED'
    corrections_path=inputs.report_path('OBSERVATION_RESULTS_REVIEW.SAFE.json')if inputs else pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/OBSERVATION_RESULTS_REVIEW.SAFE.json')
    corrections=json.loads(corrections_path.read_text())
    assert corrections['status']=='PASS_INDEPENDENT_OBSERVATION_CORRECTIONS'
    assert review['observationCorrectionsReviewSHA256']==hashlib.sha256(corrections_path.read_bytes()).hexdigest()
    growth_path=inputs.report_path('RAM_B_GROWTH_LATE_WINDOWS.SAFE.json')if inputs else pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/RAM_B_GROWTH_LATE_WINDOWS.SAFE.json')
    assert review['growthAnalysisSHA256']==hashlib.sha256(growth_path.read_bytes()).hexdigest()
    assert not WORK.exists(),'w15-forward-once-only'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    created=False;owned_id=None;seeded=False;w=None;failure=None;result=None;zero=False;stop_failures=[];zero_check_failure=None;service_closure=None;final_audit=None;database_export=None;backup_result=None;sealed_backup=None;backup_stage=None;backup_failure_phase=None
    try:
        if inputs is not None:
            for name,raw in [('CURRENT_SOURCE_REVIEW.SAFE.json',inputs.source_review_bytes()),
                             ('CURRENT_RUNTIME_CONTEXT.SAFE.json',(json.dumps(inputs.controller_context(),sort_keys=True)+'\n').encode())]:
                with(WORK/name).open('xb')as output:
                    os.chmod(output.name,0o600);output.write(raw);output.flush();os.fdatasync(output.fileno())
        bound_path=ASSETS/'END500_MEMORY_BOUND.SAFE.json'if inputs is None else inputs.path('bound')
        review_path=ASSETS/'END500_FIXTURE_INDEPENDENT_REVIEW.SAFE.json'if inputs is None else inputs.path('boundReview')
        bound=json.loads(bound_path.read_text())
        independent=json.loads(review_path.read_text())
        assert bound['executionAuthority']is False and bound['totalUsageRows']==6000 and bound['preservedOriginalUsageRows']==5139
        # Review is an offline data review, not a made-up execution authority.
        assert independent['status']=='PASS_OFFLINE_INERT_FIXTURE_AND_PROVENANCE_ONLY'
        reviewed_path,reviewed_bytes=pin(independent['inputReportPin'],inputs)
        assert reviewed_path==bound_path
        assert json.loads(reviewed_bytes)==bound
        paths={k:pin(v,inputs)[0]for k,v in bound['protectedOutputPins'].items()}
        receipt_path=M.RECEIPT if inputs is None else inputs.path('reception')
        receipt=json.loads(receipt_path.read_text());assert hashlib.sha256(receipt_path.read_bytes()).hexdigest()==M.RECEIPT_SHA
        original={k:next(x for x in receipt['files']if x['key']==k)for k in ['frozenSourceDump','localRoles']}
        original_paths={}
        for v in original.values():
            path=pathlib.Path(v['receivedPath'])if inputs is None else inputs.resolve({'path':v['receivedPath'],'bytes':v['expectedBytes'],'sha256':v['expectedSHA256']})
            b=path.read_bytes();assert len(b)==v['expectedBytes']and hashlib.sha256(b).hexdigest()==v['expectedSHA256']
            original_paths[v['key']]=path
        stage=PREP
        for n,h in [('node','bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest','870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:
            assert digest_file(CACHE/n)==h,'w15-cached-binary-pin'
        seed=check_seed(inputs)
        target=json.loads((ROOT/'scripts/fixtures/w15-atomic-integration-target.json').read_text())
        command_path=pathlib.Path(target['work'])/'current-command.PRIVATE.json'if inputs is None else inputs.path('currentCommand')
        command_bytes=command_path.read_bytes()
        command_pin={'path':str(command_path),'bytes':len(command_bytes),'sha256':hashlib.sha256(command_bytes).hexdigest(),'executionAuthority':False}
        M.save('CURRENT_COMMAND_BINDING.SAFE.json',command_pin)
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700)
        state=WORK/'state';state.mkdir(mode=0o700)
        runtime_mounts=()
        capacity_phase(common_resources,'materialization')
        if inputs is not None:
            runtime_mounts=_runtime_module('runtime_materialization').materialize(
              PREP/'runtime-files',app=stage/'app',node=CACHE/'node',postgrest=CACHE/'postgrest',
              roles=original_paths['localRoles'],dump=original_paths['frozenSourceDump'],state=state,
              command=command_path,command_binding=WORK/'CURRENT_COMMAND_BINDING.SAFE.json',
              bound=bound_path,guard=common_resources.sample)
        M.docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no','--memory='+str(physical_limit),'--memory-swap='+str(physical_limit),
          *(['--cgroup-parent='+common_resources.unit]if common_resources is not None else[]),
          *([item for key,value in _runtime_container_labels(inputs).items()for item in('--label',key+'='+value)]if inputs is not None else[]),
          '--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data',
          '--mount','type=bind,src='+str(seed)+',dst='+SEED_MOUNT+',readonly',
          '--mount','type=bind,src='+str(state)+',dst='+BASE+'/state',*runtime_mounts,'-e','POSTGRES_HOST_AUTH_METHOD=trust',M.IMAGE,
          'postgres','-c','helmut.local_usage_experiment=on','-c','max_wal_size='+str(BUDGET['postgresMaxWalMiB'])+'MB','-c','work_mem='+str(BUDGET['postgresWorkMemMiB'])+'MB',
          '-c','autovacuum_naptime='+str(BUDGET['postgresAutovacuumNaptimeSeconds'])+'s');created=True
        if inputs is not None:owned_id=_owned_runtime_container(inputs,common_resources)['Id']
        M.docker('start',owned_id or CONTAINER);info=json.loads(M.docker('inspect',owned_id or CONTAINER))[0]
        if inputs is not None:_owned_runtime_container(inputs,common_resources,owned_id)
        assert info['HostConfig']['NetworkMode']=='none'and info['HostConfig']['Memory']==physical_limit and info['HostConfig']['MemorySwap']==physical_limit
        if inputs is not None:
            _runtime_module('runtime_materialization').verify_mounts(info['Mounts'],PREP/'runtime-files')
        seed_mounts=[x for x in info['Mounts']if x['Destination']==SEED_MOUNT]
        assert len(seed_mounts)==1 and seed_mounts[0]['Source']==str(seed)and seed_mounts[0]['RW']is False,'w15-seed-must-be-readonly'
        M.save('READONLY_SEED_MOUNT.SAFE.json',{'sourceSHA256':SEED_SHA,'readOnly':True,'singleFileOnly':True})
        pid=info['State']['Pid'];rel=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('0::')[-1]
        cgroup=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+rel.lstrip('/')).lstrip('/');assert info['Id']in str(cgroup)
        if common_resources is not None:
            assert info['HostConfig']['CgroupParent']==common_resources.unit,'w15-common-parent-container-setting'
            common_resources.check_pid(pid,info['Id']);cgroup=common_resources.path
        w=Watch(cgroup);w.common_resources=common_resources;w.disk_guard=disk_guard
        if getattr(common_resources,'end_capacity_diagnostic',False):
            w.phase_observer=common_resources.phase_observer
        if inputs is not None:w.backup_runner=_runtime_module('runtime_owned_backup').OwnedBackupRunner(w,M,base=BASE,container=CONTAINER,database=DB)
        w.sample();w.thread.start()
        for _ in range(100):
            r=subprocess.run(M.DOCKER+['exec',CONTAINER,'pg_isready','-h','127.0.0.1','-U','postgres'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
            if r.returncode==0:break
            time.sleep(.2)
        assert r.returncode==0,'w15-forward-pg-readiness'
        M.docker('exec',CONTAINER,'mkdir','-p',BASE)
        M.docker('exec',CONTAINER,'chmod','700',BASE)
        assert state.stat().st_mode&0o777==0o700
        if inputs is None:
            for n,source in [('app',stage/'app'),('node',CACHE/'node'),('postgrest',CACHE/'postgrest')]:
                w.disk_check();M.copy_in(source,BASE+'/'+n);w.disk_check()
            for k,n in [('localRoles','roles.PRIVATE.sql'),('frozenSourceDump','input.PRIVATE.dump')]:M.copy_in(original_paths[k],BASE+'/'+n)
            M.copy_in(command_path,BASE+'/state/current-command.PRIVATE.json')
            M.copy_in(WORK/'CURRENT_COMMAND_BINDING.SAFE.json',BASE+'/state/CURRENT_COMMAND_BINDING.SAFE.json')
            M.copy_in(bound_path,BASE+'/state/END500_MEMORY_BOUND.SAFE.json')
            M.docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
            M.docker('exec',CONTAINER,'chmod','700',BASE+'/node',BASE+'/postgrest')
        else:
            # The host copies already belong to UID1000; readonly mounts must
            # not be recursively chowned/chmodded by an out-of-parent daemon.
            M.docker('exec',CONTAINER,'chown','1000:1000',BASE)
        if getattr(common_resources,'end_capacity_diagnostic',False):
            common_resources.capacity_observer(binding={'postgresHostPID':pid,'containerId':info['Id'],'namespacePIDs':{}})
        _restore_database(inputs,w)
        capacity_phase(common_resources,'restore-ready')
        capacity_phase(common_resources,'seed')
        # Seed all retained500-end positions in native tables, one bounded row
        # per statement. No fake execution/quality claims or source mutation.
        row_ids={}
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
        capacity_phase(common_resources,'seed-ready')
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
        M.docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','umask 077; env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size='+str(BUDGET['nodeOldSpaceMiB'])+' --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-auth-transport-probe.js --serve-memory >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
        for _ in range(120):
            r=subprocess.run(M.DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/gateway.PRIVATE.json'],env=M.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode==0:break
            time.sleep(.1)
        assert r.returncode==0,'w15-forward-gateway-readiness'
        if getattr(common_resources,'end_capacity_diagnostic',False):
            namespace_pids={}
            for role,filename in (('helmut-node','gateway.pid'),('postgrest','postgrest.pid')):
                raw=(WORK/'state'/filename).read_text()
                assert raw.isascii() and raw.isdigit() and 0<int(raw)<2**31,'w15-capacity-process-binding'
                namespace_pids[role]=int(raw)
            common_resources.capacity_observer(binding={'postgresHostPID':pid,'containerId':info['Id'],'namespacePIDs':namespace_pids})
        capacity_phase(common_resources,'auth-cas')
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
                    capacity_phase(common_resources,'native-audit')
                    w.disk_phase='capture';w.audit_remaining=64*1024*1024;w.disk_check()
                    M.STARTED_INNER_ACTIONS.add('audit')
                    final_audit=AUDIT.capture(CONTAINER,DB,WORK,paths,expectedProbe=499 if not failure and result and len(w.cas_records)==500 else None,
                      input_binding=inputs,
                      guard=w.audit_guard,stop_owned=lambda:M.stop_owned(['audit'],require_registered=True))
                    assert final_audit['status']=='PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY'
                    if getattr(common_resources,'end_capacity_diagnostic',False) and not failure and len(w.cas_records)==500:
                        assert final_audit['fullLogicalUsageRows']==6000 and final_audit['totalExactPostimages']==3501
                        common_resources.capacity_observer(progress={key:{'value':n,'kind':'EXACT'} for key,n in (('authCAS',500),('usageRows',6000),('nativePostimages',3501))})
                    # A second fresh0 read after the consistent audit snapshot.
                    zero=M.read('select count(*)from public.mandate_profiles where aktiv;',database=DB)==0
                    assert zero,'w15-forward-after-audit-active-unknown'
                    M.save('NATIVE_ZERO_AFTER_AUDIT.SAFE.json',{'activeProfiles':0,'confirmed':True,'readOnly':True})
                except BaseException as error:
                    failure=failure or {'type':type(error).__name__,'reason':'w15-forward-native-final-audit-failed-or-unknown'}
        if inputs is not None and w and created and seeded and zero and not failure and not w.failure and final_audit:
            try:
                capacity_phase(common_resources,'export')
                w.disk_phase='processing'
                database_export=_runtime_module('runtime_backup').export_final_database(
                  inputs.backup_context(),expected_context=inputs.backup_context(),work=WORK,
                  container=CONTAINER,database=DB,supervisor=w,run_owned=w.backup_runner.run_owned)
            except BaseException as error:
                failure=failure or {'type':type(error).__name__,'reason':'w15-final-database-export-failed-or-unknown'}
        if inputs is not None and created:
            try:M.save('OWNED_DATABASE_STOP.SAFE.json',_stop_runtime_container(inputs,common_resources,owned_id))
            except BaseException as error:
                failure=failure or {'type':type(error).__name__,'reason':'w15-owned-database-stop-failed-or-unknown'}
        try:check_seed(inputs)
        except BaseException as error:failure=failure or {'type':type(error).__name__,'reason':'w15-readonly-seed-source-drift'}
        final_sample_verified=False
        if w:
            try:w.sample();final_sample_verified=True
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            w.stop()
            if w.failure:failure=failure or w.failure
        future_capacity=future_mock500_capacity(w.maximum,result.get('projectedAdditionalPhysicalBytes'))if w and result else None
        functional_closure_completed=bool(w and final_sample_verified and not failure and not w.failure and not w.memory_failure
          and result and result['status']=='PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING'and len(w.cas_records)==500
          and final_audit and final_audit['status']=='PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY'and zero
          and(inputs is None or database_export is not None))
        capacity_diagnostic=getattr(common_resources,'end_capacity_diagnostic',False)
        actual_memory_accepted=functional_closure_completed and not capacity_diagnostic
        M.save('CONTROLLER_RESULT.SAFE.json',{'status':('PASS_FORWARD_PHASE_COMMON_CLOSURE_PENDING'if inputs is not None else'PASS_FORWARD_ALLOCATION_INDEPENDENT_REVIEW_PENDING')if not failure and zero else'FAIL_OR_UNKNOWN',
          'failure':failure,'innerStopFailure':w.stop_failure if w else None,'stopFailures':stop_failures,'zeroCheckFailure':zero_check_failure,'serviceClosure':service_closure,'activeProfiles':0 if zero else None,'CASCompleted':len(w.cas_records)if w else 0,
          'commonKernelPeakBytes':w.maximum if w else None,'lastKernel':w.last if w else None,
          'memoryContract':(_runtime_module('common_resources').end_capacity_trace().PROFILE if capacity_diagnostic else M.MEMORY),
          'physicalHardCapBytes':physical_limit,'maximumAllowedPeakBytes':M.MAXIMUM,'legacyPeakDiagnosticOnly':capacity_diagnostic,
          'requiredPhysicalReserveBytes':0 if capacity_diagnostic else M.RESERVE,
          'requiredHostReserveBytes':2147483648 if capacity_diagnostic else None,
          'functionalProcessingClosureCompleted':functional_closure_completed,'finalKernelReadbackVerified':final_sample_verified,
          'end500ActualMemoryAccepted':actual_memory_accepted if inputs is None else False,
          'preBackupMemoryChecksPassed':actual_memory_accepted if inputs is not None else None,
          'fullLifetimeClosureAccepted':False,'memoryMeasurementFailure':w.memory_failure if w else None,
          'futureMock500Capacity':future_capacity,
          'finalNativeAudit':final_audit,'finalDatabaseExport':database_export,'lastDisk':w.disk if w else None,
          'projectedAdditionalPhysicalBytes':result.get('projectedAdditionalPhysicalBytes')if result else None,
          'additionalProjectionMarginBytes':BUDGET['minimumCommonHeadroomBytes'],'units':0,'providerCalls':0,'profileActivations':0,'executionAuthority':False,
          'full500Acceptance':False,'retryAllowed':False})
        if inputs is not None:
            # The prior container-only result is never a complete acceptance.
            # Collection and encryption remain inside the same parent lifetime,
            # guarded at each streamed chunk after the progress files freeze.
            try:
                assert not failure and (functional_closure_completed if capacity_diagnostic else actual_memory_accepted),'w15-backup-requires-successful-owned-closure'
                if capacity_diagnostic:
                    assert service_closure['status']=='PASS_GENUINE_OWNED_SERVICE_EXIT'
                    assert w.finished.is_set() and not w.thread.is_alive() and not w.reporter.is_alive() and not w.stop_failure
                    common_resources.sample()
                    capacity_phase(common_resources,'processing-stopped')
                if getattr(common_resources,'processing_backup_stage',None)=='end500':
                    assert service_closure['status']=='PASS_GENUINE_OWNED_SERVICE_EXIT'
                    assert w.finished.is_set() and not w.thread.is_alive() and not w.reporter.is_alive() and not w.stop_failure
                    phase_contract=_runtime_module('common_resources').phase_contract()
                    proof=phase_contract.boundary('end500',_runtime_module('common_resources').phase_context(inputs.controller_context()),
                      owned_id,result_counts={'authCAS':len(w.cas_records),'usageRows':final_audit['fullLogicalUsageRows'],'nativePostimages':final_audit['totalExactPostimages']})
                    common_resources.begin_backup(proof)
                run_root=WORK.parent
                backup_stage='backup-collect';backup_phase(common_resources,backup_stage)
                backup_result=_runtime_module('runtime_backup').collect_backup(
                  inputs.backup_context(),expected_context=inputs.backup_context(),
                  input_files=inputs.backup_input_files(),work=WORK,prepared=PREP,
                  provenance_files=inputs.backup_provenance_files(),destination=run_root/'backup',
                  guard=common_resources.sample)
                backup_stage='backup-seal';backup_phase(common_resources,backup_stage)
                cipher_root=run_root/'cipher';cipher_root.mkdir(mode=0o700)
                seal=_runtime_module('runtime_backup').S
                public_key=ROOT/'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc'
                assert hashlib.sha256(public_key.read_bytes()).hexdigest()=='3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443'
                context=inputs.backup_context()
                sealed_backup=seal.seal(root=str(run_root/'backup'),manifest='manifest.PRIVATE.json',
                  manifest_sha256=backup_result['manifestSHA256'],public_key=str(public_key),
                  recipient_fingerprint=context['recipientFingerprint'],commit=context['exactCommit'],
                  run_id=context['runId'],input_manifest_sha256=context['inputManifestSHA'],
                  output=str(cipher_root/'end500-full.PRIVATE.gpg'),guard=common_resources.sample)
                if backup_completion is not None:
                    backup_stage=None # The completion hook retains its own first closed phase.
                    backup_completion(forward=sys.modules[__name__], inputs=inputs, resources=common_resources,
                        collection=backup_result, sealed=sealed_backup, cipher=cipher_root/'end500-full.PRIVATE.gpg')
                backup_stage='backup-postcheck';backup_phase(common_resources,backup_stage)
                final_common=common_resources.safe_summary()
                receipt={'status':'PASS_LOCAL_BACKUP_BYTES_ONLY_RESTORE_AND_REMOTE_PENDING',
                  'sealed':sealed_backup,'finalCommonParent':final_common,'databaseRestoreObserved':False,
                  'remoteReadbackObserved':False,'acceptedAsCompleteBackup':False,
                  'executionAuthority':False,'testStartedByReceipt':False,'retryAllowed':False}
                with(cipher_root/'LOCAL_BACKUP.SAFE.json').open('x')as output:
                    os.chmod(output.name,0o600);json.dump(receipt,output);output.write('\n');output.flush();os.fdatasync(output.fileno())
                common_resources.sample()
            except BaseException as error:
                if failure is None and not getattr(w,'native_failure',None) and backup_failure_phase is None:
                    backup_failure_phase=backup_stage
                failure=failure or {'type':type(error).__name__,'reason':'w15-complete-backup-or-common-closure-failed-or-unknown'}
            # Outside the frozen archive tree, exclusive and durable. A later
            # closure failure never leaves a durable full-lifetime RAM PASS.
            closing={'status':'FAIL_OR_UNKNOWN_COMMON_CLOSURE'if failure else'LOCAL_CLOSURE_ONLY_INDEPENDENT_ACCEPTANCE_PENDING',
              'failure':failure,'end500ActualMemoryAccepted':False,'fullLifetimeClosureAccepted':False,
              'localArchiveCreated':sealed_backup is not None,
              'commonParent':common_resources.last_observation(),
              'databaseRestoreObserved':False,'remoteReadbackObserved':False,
              'acceptedAsCompleteBackup':False,'executionAuthority':False,'retryAllowed':False}
            try:
                with(WORK.parent/'FINAL_CLOSURE.SAFE.json').open('x')as output:
                    os.chmod(output.name,0o600);json.dump(closing,output);output.write('\n');output.flush();os.fdatasync(output.fileno())
                common_resources.sample()
            except BaseException as error:
                if failure is None and not getattr(w,'native_failure',None) and backup_failure_phase is None:
                    backup_failure_phase='backup-postcheck'
                failure=failure or {'type':type(error).__name__,'reason':'w15-final-closure-receipt-or-kernel-unconfirmed'}
    status=('LOCAL_END500_WORK_AND_CIPHER_ONLY_ACCEPTANCE_PENDING'if inputs is not None else'PASS')if not failure and zero else'FAIL_OR_UNKNOWN'
    final_public={'status':status,'failure':failure,'zero':zero}
    if common_resources is not None:final_public['commonParent']=common_resources.last_observation()
    print(json.dumps(final_public),flush=True)
    if failure or not zero:
        error=SystemExit(1)
        if w and w.native_failure is not None:error.native_failure=w.native_failure
        if backup_failure_phase is not None:error.backup_failure_phase=backup_failure_phase
        raise error
if __name__=='__main__':
    assert sys.argv[1:]in [['--prepare-only'],['--run']],'w15-memory-forward-explicit-action'
    (prepare if sys.argv[1]=='--prepare-only'else main)()
