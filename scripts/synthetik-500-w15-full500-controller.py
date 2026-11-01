#!/usr/bin/env python3
"""Exactly one explicitly authorized full local mock run. No action on import."""
import datetime, zoneinfo, hashlib, json, math, os, pathlib, posixpath, queue, signal, stat, subprocess, threading, time
import importlib.util, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
# Fresh server/container/PGDATA; the database namespace deliberately remains
# unchanged so the already qualified source installer and its pins stay exact.
WORK=pathlib.Path('/workspace/shared/helmut-w15-full500-20261028d')
BASE='/tmp/w15-full500-20261028d'
DB='helmut_w15_full500_20261028b'
CONTAINER='w15-full500-20261028d'
SOURCE_DB='helmut_w15_input_20261027'
SOURCE_CONTAINER='synthetik500-runtime-pg-7e1c20261027'
IMAGE='sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e'
RECEIPT=pathlib.Path('/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json')
RECEIPT_SHA='2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'
REVIEW=pathlib.Path('/workspace/shared/helmut-w15-full500-review-20261028d/REVIEW_READY.SAFE.json')
QUALIFICATION=pathlib.Path('/workspace/shared/helmut-w15-current-source-update-20261028/qualification-b')
AUTH_WITNESS=pathlib.Path('/workspace/shared/helmut-w15-auth-observer-check-20261028/AUTH_MEASUREMENT_CHECK.SAFE.json')
AUTH_WITNESS_SOURCE=pathlib.Path('/workspace/shared/helmut-w15-auth-observer-check-20261028/stage/app/scripts/synthetik-500-w15-full500-runtime.js')
DOCKER=['docker','--host=unix:///var/run/docker.sock']
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
STARTED_INNER_ACTIONS=set()
MEMORY=json.loads((ROOT/'scripts/fixtures/w15-memory-contract.json').read_text())
LOCAL_MEMORY=json.loads((ROOT/'scripts/fixtures/w15-local-memory-budget.json').read_text())
LIMIT=MEMORY['comparisonBudgetBytes']
RESERVE=(LIMIT*MEMORY['minimumReservePercent']+99)//100
MAXIMUM=LIMIT-RESERVE
_BOUND_CONTEXT_SHA=None

def _mock_module(name):
    assert name in ('mock500_inputs','mock500_resources','mock500_start','mock500_backup',
      'functional_contract','mock500_host_contract','end500_capacity_roles')
    key='w15_github_'+name
    if key not in sys.modules:
        spec=importlib.util.spec_from_file_location(key,ROOT/'scripts/w15-github'/(name+'.py'))
        module=importlib.util.module_from_spec(spec);sys.modules[key]=module
        try:spec.loader.exec_module(module)
        except BaseException:del sys.modules[key];raise
    assert pathlib.Path(sys.modules[key].__file__).absolute()==ROOT/'scripts/w15-github'/(name+'.py')
    return sys.modules[key]

def check_window(now=None):
    now=now or datetime.datetime.now(datetime.timezone.utc)
    assert isinstance(now,datetime.datetime) and now.tzinfo is not None
    now=now.astimezone(datetime.timezone.utc)
    end=now+datetime.timedelta(hours=3)
    complete=now+datetime.timedelta(hours=3,minutes=30)
    berlin=zoneinfo.ZoneInfo('Europe/Berlin')
    assert now.date()==end.date()==complete.date(), 'full500-utc-day-window-unavailable'
    assert now.astimezone(berlin).date()==end.astimezone(berlin).date()==complete.astimezone(berlin).date(), 'full500-berlin-day-window-unavailable'
    assert '2026-10-28'<=now.date().isoformat()<='2026-10-31', 'full500-contract-date'
    return {'startsAtUTC':(now+datetime.timedelta(milliseconds=1)).isoformat(timespec='milliseconds').replace('+00:00','Z'),
      'endsAtUTC':end.isoformat(timespec='milliseconds').replace('+00:00','Z'),
      'completionDeadlineUTC':complete.isoformat(timespec='milliseconds').replace('+00:00','Z')}

def sha(data):return hashlib.sha256(data).hexdigest()
def literal(x):return "'"+str(x).replace("'","''")+"'"
def private_json_pin(pin,expected=None):
    p=pathlib.Path(pin['path'])
    assert p.is_absolute()and p.is_file()and not p.is_symlink()
    if expected is not None:assert p==expected
    s=p.stat();assert s.st_uid==os.getuid()and s.st_mode&0o777==0o600
    b=p.read_bytes();assert len(b)==pin['bytes']and sha(b)==pin['sha256'],'full500-auth-review-pin-drift'
    return json.loads(b)
def check_auth_witness(review):
    accepted=review['authMeasurementCheck']
    assert accepted['status']=='PASS_GENUINE_ALL_AUTH_WRITES_TIMED'and accepted['independentReviewAccepted']is True
    actual=private_json_pin(accepted['reportPin'],AUTH_WITNESS)
    independent=private_json_pin(accepted['independentReviewPin'])
    assert independent['status']=='PASS_INDEPENDENT_GENUINE_AUTH_MEASUREMENT_REVIEW'
    assert independent['reportPin']==accepted['reportPin'],'full500-independent-auth-report-binding'
    assert actual['status']==accepted['status']and actual['coverage']['pass']is True
    assert actual['coverage']['observedCASWrites']==4 and actual['unassignedCASWrites']==0
    for key in ['profileActivations','unitExecutions','providerCalls','activeProfilesBefore','activeProfilesAfter','originalDatabaseWrites']:
        assert actual[key]==0,'full500-auth-witness-scope'
    assert actual['sourceQualifierRepeated']is False
    pin=actual['runtimeSourcePin'];assert pin['path']=='scripts/synthetik-500-w15-full500-runtime.js'
    b=(ROOT/pin['path']).read_bytes()
    # Reuse the genuine Auth proof only for byte-identical observer/assessment
    # bodies. Namespace and reporting-only edits do not rerun four APIs.
    original=AUTH_WITNESS_SOURCE.read_bytes()
    assert len(original)==pin['bytes']and sha(original)==pin['sha256'],'full500-auth-original-source-pin'
    def observer_body(value):
        text=value.decode();a=text.index('function authCoverageAssessment(');z=text.index('async function setup()',a)
        return text[a:z].encode()
    assert observer_body(b)==observer_body(original),'full500-auth-observer-source-drift'
    expected=review['authMeasurementCheck']['unchangedObserverBodySHA256']
    assert sha(observer_body(b))==expected,'full500-reviewed-auth-observer-binding'
    # Read the complete real observation, never rerun an API or trust a timing
    # summary alone. This is a pre-resource gate, not another Auth test.
    envelopes=actual['mutations']+actual['usageSinks'];writes=actual['casWrites']
    assert len(writes)==4 and len(envelopes)==4
    assert len(actual['usageSinks'])==1
    assert sum(e['kind']=='public-mutation'for e in actual['mutations'])==1
    for api in ['acquirePipelineLock','releasePipelineLock']:
        locks=[e for e in actual['mutations']if e['kind']=='pipeline-lock'and e['api']==api]
        assert len(locks)==1 and locks[0]['blobAcknowledged']is True
    by_id={e['id']:e for e in envelopes};assert len(by_id)==len(envelopes)
    def timed(row):
        assert row['acknowledged']is True
        assert all(type(row[k])in [int,float]and math.isfinite(row[k])for k in ['beginMS','ackMS','endMS','wallMs'])
        assert row['beginMS']<=row['ackMS']<=row['endMS']and 0<=row['wallMs']<30000
        assert row['endMS']-row['beginMS']<30000
    for row in envelopes:timed(row)
    for row in actual['usageSinks']:assert row['blobAcknowledged']is True
    used=set()
    for row in writes:
        timed(row);assert row['rowId']=='main-auth'
        envelope=by_id[row['envelopeId']];used.add(row['envelopeId'])
        assert envelope['beginMS']<=row['beginMS']<=row['ackMS']<=row['endMS']<=envelope['endMS']
    assert used==set(by_id)
def save(name,value):
    p=WORK/name
    with p.open('x') as f:os.chmod(p,0o600);json.dump(value,f,indent=2);f.write('\n')
def safe_stop_stderr(raw):
    # Child stderr is untrusted. Retain only this helper's closed JSON schema;
    # never store arbitrary Docker, PostgreSQL or process messages.
    try:
        assert isinstance(raw,bytes)and 0<len(raw)<=4096
        v=json.loads(raw.decode('utf-8'))
        assert isinstance(v,dict)and set(v)<={'kind','status','phase','reason','code','pid','journalFailure'}
        assert v['kind']=='W15_OWNED_STOP_FAILURE'and v['status']=='STOP_FAILURE'
        assert v['phase']in ['entry','stop-marker','pid-registration','proc-list','proc-stat','proc-cmdline','proc-ownership','identity-read','identity-start-ticks','signal-term','signal-kill']
        assert v['reason']in ['owned-pid-registration-unknown','unowned-live-process','inner-handler-registration-unknown','inner-process-pid-reused','owned-process-group-still-live','owned-stop-unknown']
        if 'code'in v:assert v['code']in ['ERR_ASSERTION','ENOENT','ESRCH','EACCES','EPERM','EIO','EINVAL','EMFILE','ENFILE','ENOSPC','EBADF']
        if 'pid'in v:assert type(v['pid'])is int and v['pid']>1
        if 'journalFailure'in v:assert v['journalFailure']is True
        return v
    except (AssertionError,KeyError,ValueError,TypeError,UnicodeError):return None

class CommandFailure(RuntimeError):
    def __init__(self,command,returncode,stderr=b'',timed_out=False):
        super().__init__('full500-command-failed:'+command+':'+str(returncode))
        safe_stderr=safe_stop_stderr(stderr)
        self.safe_failure={'kind':'CHILD_COMMAND_FAILURE','returncode':returncode,'timedOut':timed_out,
          'safeStderr':safe_stderr,'stderrClassification':'owned-stop-structured'if safe_stderr else'redacted-or-empty'}

def call(args,input=None,timeout=120):
    try:r=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,cwd=ROOT,timeout=timeout)
    except subprocess.TimeoutExpired as e:raise CommandFailure(args[0],None,e.stderr or b'',True)from None
    if r.returncode:raise CommandFailure(args[0],r.returncode,r.stderr)
    return r.stdout

def docker(*args,**kw):return call(DOCKER+list(args),**kw)
def sql(query,database=DB,source=False):
    assert (source and database==SOURCE_DB and query.startswith('begin read only;'))or(not source and database in [DB,'postgres'])
    return docker('exec','-i',SOURCE_CONTAINER if source else CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-',input=query.encode(),timeout=35).decode().strip()
def read(query,database=DB,source=False):return json.loads(sql("begin read only;set local statement_timeout='15s';set local lock_timeout='3s';"+query+'rollback;',database,source))
def verify_functional_connections():
    """Native server limit and one explicitly partial client-count observation."""
    value=read("select jsonb_build_object('maxConnections',current_setting('max_connections')::int,"
      "'clientBackends',(select count(*)from pg_stat_activity where backend_type='client backend'));",database='postgres')
    assert type(value)is dict and set(value)=={'maxConnections','clientBackends'}
    assert type(value['maxConnections'])is int and value['maxConnections']==60
    assert type(value['clientBackends'])is int and 1<=value['clientBackends']<=60
    return {**value,'observerIncluded':True,'trueConnectionPeak':'UNKNOWN'}
def functional_role_bindings(resources,postgres_pid,container_id,work):
    """Reuse attested host/namespace identity; absent or changing peers stay unknown."""
    peers={}
    for role,name in (('helmut-node','gateway.pid'),('postgrest','postgrest.pid')):
        fd=None
        try:
            fd=os.open(pathlib.Path(work)/'state'/name,os.O_RDONLY|os.O_NOFOLLOW)
            before=os.fstat(fd);raw=os.read(fd,65)
            assert stat.S_ISREG(before.st_mode)and before.st_uid==os.getuid()and stat.S_IMODE(before.st_mode)==0o600
            assert before.st_nlink==1 and 0<before.st_size<=16 and len(raw)==before.st_size
            after=os.fstat(fd)
            assert all(getattr(after,k)==getattr(before,k)for k in
              ('st_dev','st_ino','st_mode','st_uid','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
            assert raw.isdigit()and 1<int(raw)<=2**53-1
            peers[role]=int(raw)
        except Exception:pass
        finally:
            if fd is not None:os.close(fd)
    return _mock_module('end500_capacity_roles').bindings(resources.path,resources._identity,postgres_pid,container_id,peers)
def functional_result_summary(runtime,audit,cleanup_result):
    """Project only current-run measured numeric aggregates after existing audit.

    Private rows/identities/content and their hashes never leave this boundary.
    Missing timing observations remain UNKNOWN, even when other checks passed.
    """
    assert type(runtime)is dict and type(audit)is dict and type(cleanup_result)is dict
    units=runtime.get('unitReports');phases=runtime.get('providerPhases');positions=audit.get('positions')
    assert type(units)is list and len(units)==500 and type(phases)is list and len(phases)==1000
    assert type(positions)is list and len(positions)==1500 and type(audit.get('units'))is list and len(audit['units'])==500
    assert all(type(row)is dict for row in units+phases+positions+audit['units'])
    assert len({row.get('owner')for row in units})==500
    counts={'simultaneouslyActiveProfiles':runtime.get('activeProfilesAtLastRead'),
      'completedUnits':runtime.get('completedUnits'),'localProviderPhases':len(phases),
      'storedResults':audit.get('actualStoredRows'),'auditedPositions':len(positions),
      'unitChecksCompleted':audit.get('unitChecksCompleted'),
      'securityControls':sum(row['count']for row in units),
      'activeProfiles':cleanup_result.get('after',{}).get('active')}
    expected={'simultaneouslyActiveProfiles':500,'completedUnits':500,'localProviderPhases':1000,
      'storedResults':1500,'auditedPositions':1500,'unitChecksCompleted':17000,'securityControls':8000,'activeProfiles':0}
    assert all(type(counts[k])is int and counts[k]==v for k,v in expected.items())
    assert all(type(row.get('count'))is int and row['count']==16 for row in units)
    categories=audit.get('categories')
    assert type(categories)is dict and set(categories)=={'missing','empty','duplicate','technicallyInvalid','unusable'}
    assert all(type(v)is int and 0<=v<=1500 for v in categories.values())
    assert audit.get('storedResultsAccepted')is True and cleanup_result.get('confirmedZero')is True and cleanup_result.get('nativeBoundZero')is True
    def maximum(rows,key):
        if type(rows)is not list or not rows:return 'UNKNOWN'
        values=[row.get(key)if type(row)is dict else None for row in rows]
        return max(values)if all(type(v)in(int,float)and math.isfinite(v)and v>=0 for v in values)else'UNKNOWN'
    calls=(runtime['authMutations']+runtime['usageSinks']if type(runtime.get('authMutations'))is list and type(runtime.get('usageSinks'))is list else None)
    timings={'auth':maximum(calls,'wallMs'),'cas':maximum(runtime.get('casWrites'),'wallMs'),
      'unit':maximum(units,'wallMS'),'provider':maximum(phases,'actualDelayMS')}
    complete=all(type(v)in(int,float)for v in timings.values())
    bounds={'auth':30000,'cas':30000,'unit':60000,'provider':20000}
    assert all(value=='UNKNOWN'or value<bounds[key]for key,value in timings.items())
    return {'schema':'helmut-w15-mock500-functional-results/1',**counts,'categories':dict(categories),
      'maximumTimingsMs':timings,'timingsComplete':complete,'timeLimitsObserved':True if complete else'UNKNOWN',
      'executionAuthority':False,'mock500Acceptance':False,'productionAcceptance':False}
def source_state():
    return read("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'profiles',(select count(*)from mandate_profiles),'identities',(select count(*)from profiles),'profileHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),'storeHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from helmut_store p),'rawHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from raw_documents p));",SOURCE_DB,True)
def copy_in(src,dst):docker('cp',str(src),CONTAINER+':'+dst)
def copy_out(name):
    p=WORK/name
    if p.exists():return
    r=subprocess.run(DOCKER+['exec',CONTAINER,'cat',BASE+'/state/'+name],env=ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
    if r.returncode==0:
        with p.open('xb')as f:os.chmod(p,0o600);f.write(r.stdout)

class Supervisor:
    def __init__(self,cgroup):
        self.cgroup=cgroup;self.finished=threading.Event();self.failure=None;self.last=None;self.process=None;self.maximum=0;self.last_events=None;self.closure_mode=False;self.stage_name=None
        self.progress_lock=threading.RLock();self.failure_lock=threading.Lock();self.accepted_indexes=set();self.last_accepted_index=None
        self.inner_stop_thread=None;self.stop_dispatched=False;self.stop_failure=None
        self.started_monotonic=time.monotonic();self.last_ack_monotonic=None;self.last_terminal_monotonic=self.started_monotonic
        self.progress=(WORK/'outer-progress.SAFE.jsonl').open('x');os.chmod(WORK/'outer-progress.SAFE.jsonl',0o600)
        self.progress_queue=queue.Queue(maxsize=2048);self.progress_finished=threading.Event()
        self.unit_max_ms=None;self.auth_max_ms=None;self.cas_max_ms=None
        self.common_resources=None;self.start_guard=None;self.disk_guard=None;self.backup_runner=None;self.mock_backup_closure=False
        self.reporter=threading.Thread(target=self.write_progress,daemon=True);self.reporter.start()
        self.thread=threading.Thread(target=self.monitor,daemon=True)
    def write_progress(self):
        try:
            while not self.progress_finished.is_set()or not self.progress_queue.empty():
                try:record=self.progress_queue.get(timeout=.2)
                except queue.Empty:continue
                try:
                    line=json.dumps(record,separators=(',',':'))
                    self.progress.write(line+'\n');self.progress.flush();os.fdatasync(self.progress.fileno());print(record['message'],flush=True)
                finally:self.progress_queue.task_done()
        except BaseException as e:self.first_failure(e)
        finally:self.progress.close()
    def publish(self,name,index=None,status=None):
        # Only existing kernel samples and sanitized runtime ACK events enter
        # this public-shaped record. No SQL, Docker exec or memory read here.
        with self.progress_lock:
            now=time.monotonic();m=self.last
            actual_limit=None if m is None else m['configuredLimit']
            backup=(getattr(self.common_resources,'processing_backup_stage',None)=='mock500'
                    and self.common_resources.memory_phase=='backup')
            functional=(getattr(self.common_resources,'functional_stage',None)=='mock500' or getattr(self.common_resources,'host_functional_stage',None)=='mock500')
            higher=backup or functional
            budget=self.common_resources.container_limit if higher else LIMIT
            reserve=0 if higher else RESERVE;maximum=budget if higher else MAXIMUM
            memory=None if m is None else {'sampleAtUTC':m['sampleAtUTC'],'comparisonBudgetBytes':budget,
              'kernelLimitBytes':int(actual_limit)if actual_limit.isdigit()else actual_limit,
              'kernelLimitMB':int(actual_limit)/1000000 if actual_limit.isdigit()else None,'kernelSwapMaximum':m['swapMaximum'],
              'currentBytes':m['currentBytes'],'currentMB':round(m['currentBytes']/1000000,3),'currentPercentOfCap':round(100*m['currentBytes']/budget,6),
              'kernelLifetimePeakBytes':m['kernelLifetimePeakBytes'],'peakMB':round(m['kernelLifetimePeakBytes']/1000000,3),'peakPercentOfCap':round(100*m['kernelLifetimePeakBytes']/budget,6),
              'reserveBytes':budget-m['kernelLifetimePeakBytes'],'reserveMB':round((budget-m['kernelLifetimePeakBytes'])/1000000,3),
              'reservePercentOfCap':round(100*(budget-m['kernelLifetimePeakBytes'])/budget,6),'requiredReserveBytes':reserve,
              'requiredReservePercent':0 if higher else MEMORY['minimumReservePercent'],'maximumAllowedPeakBytes':maximum,'maximumAllowedPeakMB':maximum/1000000,
              'swapCurrentBytes':m['swapCurrentBytes'],'events':m['events']}
            record={'name':name,'observedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':self.stage_name or 'between-stages-or-cleanup',
              'acceptedProfiles':len(self.accepted_indexes),'expectedProfiles':500,'lastAcceptedIndex':self.last_accepted_index,
              'noNewAcceptedACKForSeconds':round(now-(self.last_ack_monotonic or self.started_monotonic),3),
              'noAcceptedProfileYet':not self.accepted_indexes,'memory':memory,
              'maximumUnitWallMs':self.unit_max_ms,'maximumAuthFullCallWallMs':self.auth_max_ms,'maximumCASWallMs':self.cas_max_ms}
            if index is not None:record['index']=index
            if status is not None:record['status']=status
            if name=='supervisor-first-failure':record['failure']=self.failure
            ram='RAM noch ohne verifizierten Sample'
            if memory is not None:
                ram=('RAM {currentMB:.1f} MB ({currentPercentOfCap:.2f} %) | Peak {peakMB:.1f} MB ({peakPercentOfCap:.2f} %)'
                  ' | Peak-Reserve {reserveMB:.1f} MB ({reservePercentOfCap:.2f} %)').format(**memory)
            if name=='unit-final-ack-accepted':
                record['message']='Profil '+str(index+1)+'/500 abgeschlossen | '+ram+' | Unit-Max {:.3f} s | Auth-Max {:.3f} s | CAS-Max {:.3f} s'.format(self.unit_max_ms/1000,self.auth_max_ms/1000,self.cas_max_ms/1000)
            elif name=='supervisor-first-failure':
                pending=' | nächstes nicht akzeptiertes Profil '+str(len(self.accepted_indexes)+1)+'/500'if len(self.accepted_indexes)<500 else''
                record['message']='FEHLER | Phase '+record['phase']+' | '+str(len(self.accepted_indexes))+'/500 akzeptiert'+pending+' | '+str(self.failure['reason'])+' | '+ram
            else:
                record['message']='Status | Phase '+record['phase']+' | '+str(len(self.accepted_indexes))+'/500 akzeptiert | kein neuer akzeptierter ACK seit '+str(record['noNewAcceptedACKForSeconds'])+' s | '+ram
            # Terminal/disk backpressure must never stall the safety monitor.
            self.progress_queue.put_nowait(record);self.last_terminal_monotonic=now
    def observe_line(self,raw,stage):
        if stage!='run' or len(raw)>4096:return
        try:value=json.loads(raw)
        except (ValueError,UnicodeError):return
        if not isinstance(value,dict)or value.get('name')!='unit-final-ack-accepted'or value.get('status')!='PASS':return
        index=value.get('index')
        with self.progress_lock:
            if type(index)is not int or not 0<=index<500 or index!=len(self.accepted_indexes):
                self.first_failure(RuntimeError('full500-accepted-ack-sequence-unknown'));return
            timings=value.get('authTimings')or{}
            numbers=[value.get('unitWallMs'),timings.get('maximumFullCallWallMs'),timings.get('maximumCASWallMs')]
            if not all(type(x)in [int,float]and math.isfinite(x)and x>=0 for x in numbers)or timings.get('incompleteFullCalls')or timings.get('incompleteCASWrites'):
                self.first_failure(RuntimeError('full500-live-auth-timing-unknown'));return
            self.unit_max_ms=max(self.unit_max_ms or 0,numbers[0]);self.auth_max_ms=max(self.auth_max_ms or 0,numbers[1]);self.cas_max_ms=max(self.cas_max_ms or 0,numbers[2])
            self.accepted_indexes.add(index);self.last_accepted_index=index;self.last_ack_monotonic=time.monotonic()
            self.publish('unit-final-ack-accepted',index,'PASS')
    def first_failure(self,error):
        if self.backup_runner is not None and self.stage_name in self.backup_runner.actions:
            return self.backup_runner.first_failure(error)
        with self.failure_lock:
            first=self.failure is None
            self.failure=self.failure or {'type':type(error).__name__,'reason':str(error)}
            p=self.process
        # Stop first; terminal/file reporting cannot delay the existing bound stop.
        if not self.closure_mode and p and p.poll()is None:
            action={'seed':'setup'}.get(self.stage_name,self.stage_name)
            if action in ['prepare','run','setup','audit','signal-proof','eu-component']:
                with self.failure_lock:
                    if not self.stop_dispatched:
                        self.stop_dispatched=True
                        def signal_inner():
                            try:stop_owned([action],require_registered=True)
                            except BaseException as e:
                                self.stop_failure={'type':type(e).__name__,'reason':str(e),'innerStopConfirmed':False}
                                save('INNER_STOP_UNKNOWN.SAFE.json',self.stop_failure)
                            finally:
                                # The inner stop was attempted first. Bound even a
                                # failed/unknown helper; preserve its own receipt.
                                try:p.wait(timeout=1)
                                except subprocess.TimeoutExpired:
                                    try:os.killpg(p.pid,signal.SIGTERM)
                                    except ProcessLookupError:pass
                        self.inner_stop_thread=threading.Thread(target=signal_inner,daemon=True)
                        self.inner_stop_thread.start()
            else:
                try:os.killpg(p.pid,signal.SIGTERM)
                except ProcessLookupError:pass
        if first:
            try:self.publish('supervisor-first-failure',status='FAIL')
            except BaseException:pass # First failure and bound stop already persist independently.
    def sample(self):
        if self.start_guard is not None:
            (self.start_guard.closure_guard if self.closure_mode or self.mock_backup_closure else self.start_guard.before_dispatch)()
        if self.disk_guard is not None:self.disk_guard()
        if self.common_resources is not None:
            common=self.common_resources.sample()
            functional=(getattr(self.common_resources,'functional_stage',None)=='mock500' or getattr(self.common_resources,'host_functional_stage',None)=='mock500')
            if (functional or (getattr(self.common_resources,'processing_backup_stage',None)=='mock500'
                    and self.common_resources.memory_phase=='backup')):
                # The sole higher-cap phase starts after the original
                # services/watch have actually closed. Existing recovery uses
                # this supervisor with the same monotone parent, not v2 again.
                self.maximum=max(self.maximum,common['kernelLifetimePeakBytes'])
                self.last={**common,'sampleAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'comparisonBudgetBytes':self.common_resources.container_limit,
                  'requiredReserveBytes':0,'maximumConsumptionBytes':self.common_resources.container_limit,
                  'comparisonReserveBytes':self.common_resources.container_limit-common['kernelLifetimePeakBytes']}
                if functional and time.monotonic()-getattr(self,'functional_last_observed',-1)>=1:
                    self.functional_last_observed=time.monotonic()
                    observer=getattr(self.common_resources,'functional_observation',None)
                    if callable(observer):
                        role_provider=getattr(self,'functional_role_provider',lambda:[])
                        self.functional_resource_observation=observer(role_provider())
                return
        if self.stage_name!='materials'and(WORK/'processing-materials.PRIVATE.json').exists():
            m=json.loads((WORK/'processing-materials.PRIVATE.json').read_text())
            now=datetime.datetime.now(datetime.timezone.utc)
            deadline=datetime.datetime.fromisoformat(m['completionDeadlineUTC'].replace('Z','+00:00'))
            if now>=deadline:raise RuntimeError('full500-completion-deadline')
            if self.stage_name=='run'and now>=datetime.datetime.fromisoformat(m['endsAtUTC'].replace('Z','+00:00')):
                raise RuntimeError('full500-processing-deadline')
        at=lambda n:(self.cgroup/n).read_text().strip()
        events=dict((k,int(v))for k,v in(x.split()for x in at('memory.events').splitlines()))
        peak=int(at('memory.peak'));self.maximum=max(self.maximum,peak)
        self.last={'sampleAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'configuredLimit':at('memory.max'),'swapMaximum':at('memory.swap.max'),
          'kernelLifetimePeakBytes':peak,'currentBytes':int(at('memory.current')),'swapCurrentBytes':int(at('memory.swap.current')),'events':events,
          'comparisonBudgetBytes':LIMIT,'requiredReserveBytes':RESERVE,'maximumConsumptionBytes':MAXIMUM,'comparisonReserveBytes':LIMIT-peak}
        assert self.last['configuredLimit']==str(LIMIT)and self.last['swapMaximum']=='0','full500-kernel-limit-mismatch'
        if peak>MAXIMUM or self.last['swapCurrentBytes'] or any(events.get(k,0)for k in ['oom','oom_kill','oom_group_kill','max']):
            raise RuntimeError('full500-memory-reserve-or-oom')
    def monitor(self):
        while not self.finished.is_set():
            try:
                self.sample()
                with self.progress_lock:
                    if time.monotonic()-self.last_terminal_monotonic>=20:self.publish('supervisor-heartbeat')
            except BaseException as e:self.first_failure(e)
            self.finished.wait(.1)
    def stage(self,cmd,name,seconds,extra_env=None):
        if self.failure and not self.closure_mode:raise RuntimeError('full500-supervisor-first-failure')
        assert self.thread.is_alive(),'full500-memory-supervisor-not-alive'
        self.stage_name=name;self.stop_dispatched=False;self.inner_stop_thread=None
        action={'seed':'setup'}.get(name,name)
        if action in ['prepare','run','setup','audit','signal-proof','eu-component']:STARTED_INNER_ACTIONS.add(action)
        with (WORK/(name+'.PRIVATE.log')).open('xb')as log:
            self.process=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=extra_env or ENV,cwd=ROOT,start_new_session=True)
            process=self.process
            # A first failure may have arrived after the entry check while no
            # child existed. Bind its stop to this newly assigned owned group.
            if self.failure and not self.closure_mode:
                self.first_failure(RuntimeError('full500-supervisor-first-failure'))
            def drain():
                try:
                    partial=False
                    while True:
                        raw=process.stdout.readline(65536)
                        if not raw:break
                        log.write(raw);log.flush()
                        if not partial and raw.endswith(b'\n'):self.observe_line(raw,name)
                        partial=not raw.endswith(b'\n')
                except BaseException as e:self.first_failure(e)
            reader=threading.Thread(target=drain,daemon=True);reader.start()
            try:
                r=self.process.wait(timeout=seconds);self.last_stage_exit_code=r
                if r:
                    error=RuntimeError('full500-stage-failed:'+name+':'+str(r))
                    self.first_failure(error);raise error
            except subprocess.TimeoutExpired:
                self.first_failure(RuntimeError('full500-stage-timeout:'+name))
                try:self.process.wait(timeout=25)
                except subprocess.TimeoutExpired:
                    os.killpg(self.process.pid,signal.SIGKILL);self.process.wait()
                raise RuntimeError('full500-stage-timeout:'+name)
            finally:
                if self.inner_stop_thread:self.inner_stop_thread.join(timeout=25)
                if self.stop_failure:self.failure=self.failure or self.stop_failure
                reader.join(timeout=5)
                if reader.is_alive():self.first_failure(RuntimeError('full500-output-reader-not-drained'))
                else:process.stdout.close()
                self.process=None;self.stage_name=None
        if self.failure and not self.closure_mode:raise RuntimeError('full500-supervisor-first-failure')
    def stop(self):
        self.finished.set()
        if self.thread.ident is not None:self.thread.join(timeout=2)
        self.progress_finished.set();self.reporter.join(timeout=5)
        if self.reporter.is_alive():self.failure=self.failure or {'type':'RuntimeError','reason':'full500-progress-output-not-drained'}

def inner(supervisor,action,seconds=120):
    if action=='audit'and(WORK/'processing-materials.PRIVATE.json').exists():
        m=json.loads((WORK/'processing-materials.PRIVATE.json').read_text())
        seconds=min(seconds,int((datetime.datetime.fromisoformat(m['completionDeadlineUTC'].replace('Z','+00:00'))-datetime.datetime.now(datetime.timezone.utc)).total_seconds())-2)
        assert seconds>10,'full500-no-remaining-audit-window'
    runtime='synthetik-500-w15-full500-runtime.js'
    script=runtime if action!='audit'else'synthetik-500-w15-full500-audit.js'
    suffix=' '+action if action!='audit'else''
    bound_env=(' HELMUT_W15_MOCK_CONTEXT='+BASE+'/state/mock-context.PRIVATE.json HELMUT_W15_MOCK_CONTEXT_SHA256='+_BOUND_CONTEXT_SHA)if _BOUND_CONTEXT_SHA else''
    cmd='umask 077; echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local'+bound_env+' '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/'+script+suffix
    supervisor.stage(DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',cmd],action,seconds)

def stop_owned(actions,require_registered=False):
    for action in actions:
        assert action in ['prepare','run','setup','audit','gateway','postgrest','signal-proof','eu-component']
        docker('exec','--user','1000:1000',CONTAINER,BASE+'/node',
          BASE+'/app/scripts/fixtures/w15-owned-process-stop.js',BASE,action,DB,
          'active'if require_registered or action in STARTED_INNER_ACTIONS else'never-started',timeout=27)

def cleanup():
    cpath=WORK/'cleanup-context.PRIVATE.json'
    result={'automaticUnitRetry':False,'endWriteAttempts':0}
    active=read("select jsonb_build_object('database',current_database(),'active',(select count(*)from mandate_profiles where aktiv));")
    assert active['database']==DB;result['before']=active
    if active['active']and(WORK/'END_WRITE_ATTEMPT_STARTED.SAFE.json').exists():
        # Unknown prior write: read only, never retry the end write.
        result['writeOutcome']='UNKNOWN'
    elif active['active']:
        assert active['active']==500 and cpath.exists()
        c=json.loads(cpath.read_text());assert c['database']==DB
        args=[c['operationId'],c['manifestHash'],c['productionCommit'],'notstopp','GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN']
        result['endWriteAttempts']=1
        save('END_WRITE_ATTEMPT_STARTED.SAFE.json',{'database':DB,'operationId':c['operationId']})
        try:result['nativeResponse']=json.loads(sql("begin;set local lock_timeout='3s';set local statement_timeout='15s';set local role service_role;select public.helmut_synthetik500_ende("+','.join(map(literal,args))+');commit;'))
        except BaseException as e:result['writeOutcome']='UNKNOWN';result['writeFailureType']=type(e).__name__
    result['after']=read("select jsonb_build_object('database',current_database(),'active',(select count(*)from mandate_profiles where aktiv));")
    if cpath.exists():
        c=json.loads(cpath.read_text());result['nativeReadback']=read('set local role service_role;select public.helmut_synthetik500_lesung('+','.join(map(literal,[c['operationId'],c['manifestHash'],c['productionCommit']]))+');')
        native=result['nativeReadback']
        result['nativeBoundZero']=native.get('operationId')==c['operationId']and native.get('manifestHash')==c['manifestHash']and native.get('productionCommit')==c['productionCommit']and native.get('zustand')=='beendet'and native.get('aktiv')==0 and native.get('fachfelderUnveraendert')is True and native.get('quittungBindungBestaetigt')is True
    result['confirmedZero']=result['after']['active']==0 and (not cpath.exists()or result.get('nativeBoundZero')is True)
    save('CLEANUP.SAFE.json',result)
    assert result['confirmedZero'],'full500-zero-not-confirmed'
    return result

def recover_postgres_only(supervisor):
    # Exactly one recovery marker, same immutable container entry point/PGDATA.
    save('PG_CLEANUP_ONLY_RECOVERY.SAFE.json',{'attempts':1,'originalMemory':supervisor.last if supervisor else None,'newPeakCannotReplaceOriginal':True})
    if supervisor:supervisor.stop()
    running=json.loads(docker('inspect',CONTAINER))[0]['State']['Running']
    if running:docker('restart','--time=10',CONTAINER)
    else:docker('start',CONTAINER)
    for _ in range(100):
        r=subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-U','postgres'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
        if r.returncode==0:return
        time.sleep(.2)
    raise RuntimeError('full500-cleanup-only-pg-recovery-unavailable')

def _private_write(path,value):
    raw=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()+b'\n'
    with pathlib.Path(path).open('xb')as stream:
        os.fchmod(stream.fileno(),0o600);stream.write(raw);stream.flush();os.fsync(stream.fileno())
    return sha(raw)

def _bound_container(identifier,context,mounts,owned_id=None,*,memory_limit=LIMIT):
    info=json.loads(docker('inspect',identifier))[0]
    expected={'helmut.w15.scope':'isolated-mock500-only','helmut.w15.run':context['runId'],
      'helmut.w15.nonce':context['nonce'],'helmut.w15.commit':context['exactCommit']}
    assert info['Config']['Labels']==expected and info['Image']==IMAGE
    assert info['Name']=='/'+CONTAINER and len(info['Id'])==64 and all(c in '0123456789abcdef'for c in info['Id'])
    assert owned_id is None or info['Id']==owned_id
    host=info['HostConfig']
    assert host['NetworkMode']=='none'and host['Memory']==memory_limit and host['MemorySwap']==memory_limit
    assert host['CgroupParent']=='w15_'+context['runId']+'_'+context['nonce'].replace('-','')+'.slice'
    assert host['RestartPolicy']['Name']=='no'and not info['NetworkSettings']['Ports']
    assert len(info['Mounts'])==len(mounts)
    assert {row['Destination']for row in info['Mounts']}==set(mounts)
    for row in info['Mounts']:
        assert row['Destination']in mounts
        source,readonly=mounts[row['Destination']]
        assert row['Source']==str(source)and row['Type']=='bind'and row['RW']is(not readonly)
    return info

def run_bound(inputs,resources,start_guard,backup_completion,*,disk_guard=None):
    """Explicit canonical Mock500 seam. main() and imports remain locked.

    Reuses the actual runtime, native setup/prepare/run, cleanup,1500 auditor
    and the existing supervisor. The caller must supply the independently
    approved fresh V2 parent, inputs and start guard. No legacy approval is used.
    """
    global WORK,BASE,DB,CONTAINER,IMAGE,_BOUND_CONTEXT_SHA
    assert type(inputs)is _mock_module('mock500_inputs').Mock500Inputs
    assert type(resources)is _mock_module('mock500_resources').MockCommonResources
    assert type(start_guard)is _mock_module('mock500_start').StartGuard
    assert callable(backup_completion)and callable(disk_guard)
    assert (LIMIT,RESERVE,MAXIMUM)==(2048000000,409600000,1638400000)
    host_functional=getattr(resources,'host_functional_stage',None)=='mock500'
    functional=getattr(resources,'functional_stage',None)=='mock500' or host_functional
    physical_limit=resources.container_limit if functional else LIMIT
    container_options={'memory_limit':physical_limit}if functional else{}
    context=inputs.controller_context();plan=_mock_module('mock500_inputs').namespace(context)
    assert start_guard.context==context and start_guard.resources is resources
    start_guard.before_dispatch(kind='prepare');inputs.claim(resources);disk_guard()
    root=pathlib.Path(context['hostPaths']['runRoot'])
    assert not root.exists()
    previous=(WORK,BASE,DB,CONTAINER,IMAGE,_BOUND_CONTEXT_SHA)
    WORK,BASE,DB,CONTAINER=plan['work'],plan['base'],plan['database'],plan['container']
    IMAGE=context['runtimePins']['imageId']
    failure=None;supervisor=None;gateway_process=None;gateway_log=None;owned_id=None;attempted=False
    closed=False;close_started=False;cleanup_result=None;backup=None;result=None;mounts={};actual_functional_results=None
    def guard():
        start_guard.closure_guard();disk_guard()
    def close_owned():
        nonlocal closed,close_started
        assert not closed and not close_started and owned_id is not None and supervisor is not None
        close_started=True
        info=_bound_container(owned_id,context,mounts,owned_id,**container_options)
        if info['State']['Running']:docker('stop','--time','5',owned_id,timeout=12)
        final=_bound_container(owned_id,context,mounts,owned_id,**container_options)
        assert final['State']['Running']is False and final['State']['Pid']==0
        assert final['State'].get('OOMKilled')is False and final['State'].get('ExitCode')==0
        observation_error=None
        try:supervisor.sample()
        except BaseException:observation_error=True
        finally:supervisor.stop()
        closed=not supervisor.thread.is_alive()and not supervisor.reporter.is_alive()
        assert closed and observation_error is None and supervisor.failure is None and supervisor.stop_failure is None
        resources.sample()
        return {'ownedContainerStopped':True,'watchClosed':True,
          **({'primaryContainerId':owned_id}if getattr(resources,'processing_backup_stage',None)=='mock500'else{})}
    try:
        root.mkdir(mode=0o700)
        for key in ('work','prepare','cache'):pathlib.Path(context['hostPaths'][key]).mkdir(mode=0o700)
        for name in ('pgdata','state'):(WORK/name).mkdir(mode=0o700)
        inputs.stage_sources(WORK/'stage',guard)
        _private_write(WORK/'MOCK_INPUT_BINDING.PRIVATE.json',inputs._record)
        _private_write(WORK/'OWNER_GO.PRIVATE.json',{'confirmation':'GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO',
          'targetDatabase':DB,'maximumUnits':500,'temporarySyntheticProfiles':500,'paidModelsAllowed':False,
          'productionAllowed':False,'full500Allowed':True,'authorizationBinding':start_guard.admission,
          'noRetryOrResume':True})
        _private_write(WORK/'state/OWNER_GO.PRIVATE.json',json.loads((WORK/'OWNER_GO.PRIVATE.json').read_bytes()))
        _private_write(WORK/'state/setup-input.PRIVATE.json',{'commit':context['exactCommit']})
        import shutil
        shutil.copyfile(inputs.path('publicationPolicy'),WORK/'state/publication-policy.PRIVATE.json')
        os.chmod(WORK/'state/publication-policy.PRIVATE.json',0o600)
        mounts={'/var/lib/postgresql/data':(WORK/'pgdata',False),BASE+'/state':(WORK/'state',False),
          BASE+'/app':(WORK/'stage/app',True),BASE+'/node':(WORK/'stage/node',True),
          BASE+'/postgrest':(WORK/'stage/postgrest',True),
          BASE+'/roles.PRIVATE.sql':(inputs.path('localRoles'),True),
          BASE+'/input.PRIVATE.dump':(inputs.path('frozenSourceDump'),True)}
        assert json.loads(docker('image','inspect',IMAGE))[0]['Id']==IMAGE
        assert not docker('ps','-a','--filter','name=^/'+CONTAINER+'$','--format','{{.ID}}').strip()
        labels={'helmut.w15.scope':'isolated-mock500-only','helmut.w15.run':context['runId'],
          'helmut.w15.nonce':context['nonce'],'helmut.w15.commit':context['exactCommit']}
        args=[item for key,value in labels.items()for item in ('--label',key+'='+value)]
        args += [item for target,(source,readonly)in mounts.items()for item in ('--mount','type=bind,src='+str(source)+',dst='+target+(',readonly'if readonly else''))]
        attempted=True
        docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no',
          '--memory='+str(physical_limit),'--memory-swap='+str(physical_limit),'--cgroup-parent='+resources.unit,*args,
          '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE,'postgres','-c','helmut.local_usage_experiment=on',
          '-c','max_wal_size=128MB','-c','work_mem=32MB','-c','autovacuum_naptime=10s',
          *(('-c','max_connections=60')if functional else()))
        owned_id=_bound_container(CONTAINER,context,mounts,**container_options)['Id'];docker('start',owned_id)
        info=_bound_container(owned_id,context,mounts,owned_id,**container_options)
        assert info['State']['Running']is True;resources.check_pid(info['State']['Pid'],owned_id)
        supervisor=Supervisor(resources.path);supervisor.common_resources=resources
        if functional:
            supervisor.functional_role_provider=lambda:functional_role_bindings(resources,info['State']['Pid'],owned_id,WORK)
        supervisor.start_guard=start_guard;supervisor.disk_guard=disk_guard
        supervisor.sample();supervisor.thread.start()
        save('SUPERVISOR_READY.SAFE.json',{'pid':os.getpid(),'container':CONTAINER,'realMemoryCap':physical_limit,
          'swapMaximum':0,'image':IMAGE,'commonParent':resources.unit})
        ready=False
        for _ in range(100):
            guard()
            p=subprocess.run(DOCKER+['exec',owned_id,'pg_isready','-h','127.0.0.1','-U','postgres','--timeout=1'],
              env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
            if p.returncode==0:ready=True;break
            time.sleep(.2)
        assert ready
        if functional:save('FUNCTIONAL_DB_INITIAL.SAFE.json',verify_functional_connections())
        docker('exec',owned_id,'mkdir','-p',BASE);docker('exec',owned_id,'chmod','700',BASE)
        docker('exec',owned_id,'chown','1000:1000',BASE)
        _mock_module('mock500_backup').restore_database(sys.modules[__name__],supervisor,resources,guard)
        assert read('select count(*)from mandate_profiles where aktiv;')==0
        baseline=read("select jsonb_build_object('database',current_database(),'profiles',(select count(*)from mandate_profiles),"
          "'active',(select count(*)from mandate_profiles where aktiv),'identities',(select count(*)from profiles),"
          "'storeRows',(select count(*)from helmut_store),"
          "'profileHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),"
          "'profileFachHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)-'aktiv' order by user_id collate \"C\")::text,'UTF8')),'hex')from mandate_profiles p),"
          "'storeHash',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)order by id collate \"C\")::text,'UTF8')),'hex')from helmut_store p));")
        descriptor=inputs.private_descriptor();descriptor['sourceBaseline']=baseline;descriptor['window']=start_guard.window
        if functional:
            contract=_mock_module('mock500_host_contract' if host_functional else 'functional_contract')
            descriptor['functionalResourceContract']={'contract':contract.CONTRACT,
              'mode':contract.MODE if host_functional else contract.MOCK_MODE,
              'memoryProfile':contract.PROFILE if host_functional else contract.MOCK_PROFILE,
              'hardMemoryBytes':resources.container_limit if host_functional else contract.HARD_LIMIT,
              'hostReserveBytes':_mock_module('functional_contract').HOST_RESERVE,
              **({'hostCapacityBudget':resources.host_capacity_budget} if host_functional else {}),
              'legacyRegularMemoryAccepted':False,'providerResourceAccepted':False}
        descriptor_path=WORK/'mock-context.PRIVATE.json';_BOUND_CONTEXT_SHA=_private_write(descriptor_path,descriptor)
        copy_in(descriptor_path,BASE+'/state/mock-context.PRIVATE.json')
        inner(supervisor,'setup')
        gateway_log=(WORK/'gateway-client.PRIVATE.log').open('xb');os.chmod(gateway_log.name,0o600)
        command=['env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8','HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local',
          'HELMUT_W15_MOCK_CONTEXT='+BASE+'/state/mock-context.PRIVATE.json','HELMUT_W15_MOCK_CONTEXT_SHA256='+_BOUND_CONTEXT_SHA,
          BASE+'/node','--max-old-space-size=512','--require',BASE+'/app/scripts/lokaler-netzschutz.js',
          BASE+'/app/scripts/synthetik-500-w15-full500-runtime.js','gateway']
        gateway_process=subprocess.Popen(DOCKER+['exec','--user','1000:1000',owned_id,*command],
          env=ENV,stdin=subprocess.DEVNULL,stdout=gateway_log,stderr=gateway_log,close_fds=True)
        ready=False
        for _ in range(100):
            guard();assert gateway_process.poll()is None
            if (WORK/'state/runtime-public.PRIVATE.json').exists():ready=True;break
            time.sleep(.1)
        assert ready;copy_out('runtime-public.PRIVATE.json')
        start_guard.before_dispatch(kind='prepare')
        material_env={**ENV,'HELMUT_SOURCE_MODE':'off','HELMUT_STORAGE_BACKEND':'local',
          'HELMUT_W15_MOCK_CONTEXT':str(descriptor_path),'HELMUT_W15_MOCK_CONTEXT_SHA256':_BOUND_CONTEXT_SHA}
        supervisor.stage([str(WORK/'stage/node'),'--require',str(ROOT/'scripts/lokaler-netzschutz.js'),
          str(ROOT/'scripts/synthetik-500-w15-full500-materials.js')],'materials',240,material_env)
        for name in ('processing-materials.PRIVATE.json','current-command.PRIVATE.json','mock-fixtures.PRIVATE.json','audit-inputs.PRIVATE.json'):
            copy_in(WORK/name,BASE+'/state/'+name)
        sql((ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_text(),database=DB)
        sql("select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')))from public.helmut_store where id='main-auth';",database=DB)
        sql("notify pgrst,'reload schema';",database=DB)
        inner(supervisor,'prepare',130);start_guard.before_dispatch(kind='unit');inner(supervisor,'run',10815)
    except BaseException:
        failure={'status':'FAIL_OR_UNKNOWN','phase':'mock500-body','retryAllowed':False}
    finally:
        if attempted and owned_id is not None:
            try:
                if supervisor:supervisor.closure_mode=True
                stop_owned(['prepare','run','setup','audit'])
                cleanup_result=cleanup()
                assert cleanup_result['confirmedZero']is True and cleanup_result.get('nativeBoundZero')is True
                if supervisor:inner(supervisor,'audit',900)
            except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'cleanup-audit'}
            try:
                if gateway_process is not None:
                    stop_owned(['gateway'],require_registered=True)
                    assert gateway_process.wait(timeout=20)==0
                    service=json.loads((WORK/'state/SERVICE_CLOSURE.SAFE.json').read_bytes())
                    assert service['status']=='PASS_OWNED_MOCK500_SERVICES_CHILD_CLOSE'
                    assert service['postgrestSignalAccepted']is True and service['gatewayStopped']is True
                    assert service['forced']is False and service['journal']['closed']is True and service['journal']['pendingEntries']==0
                    save('SERVICE_CLOSURE.SAFE.json',{**service,'gatewayClientReturncode':0})
            except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'services'}
            try:
                for name in ('PREPARE.SAFE.json','FULL500_RUNTIME_RESULT.SAFE.json','FULL500_RUNTIME_FAILURE.SAFE.json','RESULTS_INDEPENDENT.SAFE.json','runtime-progress.SAFE.jsonl'):
                    copy_out(name)
                audit=json.loads((WORK/'state/RESULTS_INDEPENDENT.SAFE.json').read_bytes())
                assert audit['storedResultsAccepted']is True
                runtime=json.loads((WORK/'state/FULL500_RUNTIME_RESULT.SAFE.json').read_bytes())
                assert runtime['completedUnits']==500 and runtime['localSimulations']==1000
                assert runtime['checks']['all8000FreshControls']is True and runtime['technicallyStoredPositions']==1500
                assert runtime['checks']['everyAuthAssignedAndUnder30']is True
                assert failure is None and supervisor.failure is None
                if functional:save('FUNCTIONAL_DB_FINAL.SAFE.json',verify_functional_connections())
                inputs.check_sources();guard()
                result={'status':'PASS_LOCAL_MOCK500_BODY_ONLY','profiles':500,'units':500,'controls':8000,
                  'positions':1500,'localProviderPhases':1000,'cleanupConfirmedZero':True,
                  'executionAuthority':False,'mock500Acceptance':False,'productionAcceptance':False}
                save('CONTROLLER_BODY.SAFE.json',result)
                backup=backup_completion(controller=sys.modules[__name__],inputs=inputs,resources=resources,
                  supervisor=supervisor,result=result,close_owned=close_owned)
                assert all(backup[key]is True for key in ('remoteReadbackObserved','databaseRestoreObserved','ownedContainerStopped','watchClosed'))and closed
                if functional:actual_functional_results=functional_result_summary(runtime,audit,cleanup_result)
            except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'backup-closure'}
            if not closed and not close_started:
                try:close_owned()
                except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'owned-closure'}
            if supervisor is not None and supervisor.thread.is_alive():
                supervisor.stop()
        if gateway_process is not None and gateway_process.poll()is None:
            # Never signal an arbitrary service: owned gateway stop was already
            # attempted, and closing our pinned container is the final boundary.
            try:gateway_process.wait(timeout=10)
            except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'gateway-client-close'}
        if gateway_log is not None:gateway_log.close()
        try:
            inputs.check_sources();resources.sample();disk_guard()
            final={'status':'PASS_MOCK500_BODY_AND_BACKUP_INDEPENDENT_ACCEPTANCE_PENDING'if failure is None and backup else'FAIL_OR_UNKNOWN',
              'failure':failure,'bodyCompleted':bool(result),'remoteReadbackObserved':bool(backup and backup.get('remoteReadbackObserved')),
              'databaseRestoreObserved':bool(backup and backup.get('databaseRestoreObserved')),
              'ownedContainerStopped':closed,'mock500Acceptance':False,'executionAuthority':False,
              'productionAcceptance':False,'retryAllowed':False,'commonParent':resources.last_observation()}
            if functional and actual_functional_results is not None:final['functionalResults']=actual_functional_results
            _private_write(root/'FINAL_MOCK500_CLOSURE.SAFE.json',final)
        except BaseException:failure=failure or {'status':'FAIL_OR_UNKNOWN','phase':'final-observation'}
        WORK,BASE,DB,CONTAINER,IMAGE,_BOUND_CONTEXT_SHA=previous
    if failure is not None or backup is None:raise RuntimeError('mock500-bound-sequence-failed-or-unknown')from None
    return final

def main():
    raise RuntimeError('full500-new-explicit-user-go-and-independent-atomic-review-required-no-start-in-integration-sprint')
    check_window() # Before any new resource; no shortened window or later resume.
    assert LIMIT==2048000000 and RESERVE==409600000
    assert REVIEW.exists(),'full500-independent-review-missing'
    review=json.loads(REVIEW.read_text());assert review['status']=='PASS_PRESTART_STATIC_AND_PURE_CHECKS'
    assert review['restorePreflight']['status']=='PASS_COMMITTED_ORIGINAL_RESTORE_WITH_500_INACTIVE_PROFILES'
    assert review['restorePreflight']['independentReviewAccepted']is True
    check_auth_witness(review)
    qualification=review['sourceQualification']
    assert qualification['status']=='PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS'
    assert qualification['independentReviewAccepted']is True
    qpin=qualification['reportPin'];qpath=QUALIFICATION/'ALL500_MOCK_BINDINGS_CHECK.SAFE.json'
    assert qpin['path']==str(qpath)and qpath.is_file()and not qpath.is_symlink()
    qb=qpath.read_bytes();assert len(qb)==qpin['bytes']and sha(qb)==qpin['sha256'],'full500-qualified-report-drift'
    qr=json.loads(qb)
    assert qr['status']==qualification['status']and qr['completedOwners']==500 and qr['qualifiedOwners']==500 and qr['failedOwners']==0
    assert qr['qualifiedAssetsPinned']is True
    assert qr['originalDatabaseWrites']==0 and qr['profileActivations']==0 and qr['unitExecutions']==0 and qr['providerCalls']==0
    assert qr['sourceDatesRewritten']is False and qr['originalFilesWritten']is False
    assert qr['executionISO'][:10]==datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'full500-qualified-day-expired'
    for key,name in [('rows','QUALIFIED_ROWS.PRIVATE.json'),('fixtures','QUALIFIED_MOCK_FIXTURES.PRIVATE.json'),('native','QUALIFIED_NATIVE.PRIVATE.json'),('derivations','QUALIFIED_DERIVATIONS.PRIVATE.json'),('replacements','CURRENT_NATIVE_REPLACEMENTS.PRIVATE.json')]:
        pin=qr['currentNativeReplacementsPin']if key=='replacements'else qr['qualifiedAssets'][key]
        p=QUALIFICATION/name;assert pin['path']==str(p)and p.is_file()and not p.is_symlink()
        b=p.read_bytes();assert len(b)==pin['bytes']and sha(b)==pin['sha256'],'full500-qualified-assets-drift'
    for pin in qr['sourceCodePins']:
        b=(ROOT/pin['path']).read_bytes();assert len(b)==pin['bytes']and sha(b)==pin['sha256'],'full500-qualified-constructor-source-drift'
    for pin in review['pins']:
        b=(ROOT/pin['path']).read_bytes();assert len(b)==pin['bytes']and sha(b)==pin['sha256'],'full500-reviewed-source-drift'
    assert not WORK.exists(),'full500-once-only-existing-attempt'
    os.umask(0o077);WORK.mkdir(mode=0o700)
    created=False;supervisor=None;before=None;failure=None;cleanup_result=None;cleanup_failure=None;recovery=False
    try:
        before=source_state();save('SOURCE_BEFORE.SAFE.json',before)
        receipt_raw=RECEIPT.read_bytes();assert sha(receipt_raw)==RECEIPT_SHA
        receipt=json.loads(receipt_raw);assert receipt['actualFileCount']==11 and receipt['actualPayloadBytes']==96530256
        inputs={}
        for key in ['frozenSourceDump','localRoles']:
            pin=next(p for p in receipt['files']if p['key']==key);p=pathlib.Path(pin['receivedPath']);b=p.read_bytes()
            assert p.is_file()and not p.is_symlink()and len(b)==pin['expectedBytes']and sha(b)==pin['expectedSHA256'];inputs[key]=p
        assert json.loads(docker('image','inspect',IMAGE))[0]['Id']==IMAGE
        assert not json.loads(docker('ps','-a','--filter','name=^/'+CONTAINER+'$','--format','json').decode()or'null')
        commit=call(['git','rev-parse','HEAD']).decode().strip()
        save('OWNER_GO.PRIVATE.json',{'confirmation':'GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO','targetDatabase':DB,
          'maximumUnits':500,'temporarySyntheticProfiles':500,'paidModelsAllowed':False,'productionAllowed':False,'full500Allowed':True,
          'authorizedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownerAuthorizationReference':'Latest explicit user GO for exactly one W15 local Mock500 per reviewed PR972 plan; no retry/resume; strict3h+30m; bound zero cleanup.'})
        save('setup-input.PRIVATE.json',{'commit':commit})
        stage=WORK/'stage';stage.mkdir(mode=0o700)
        docker('cp',SOURCE_CONTAINER+':/tmp/w15-processing-20261027/app',str(stage/'app'))
        docker('cp',SOURCE_CONTAINER+':/tmp/w15-processing-20261027/node',str(stage/'node'))
        docker('cp',SOURCE_CONTAINER+':/tmp/w15-postgrest-20261027',str(stage/'postgrest'))
        for name,size,digest in [('node',125989464,'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'),('postgrest',17309560,'870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617')]:
            p=stage/name;assert p.stat().st_size==size and sha(p.read_bytes())==digest,'full500-cached-binary-drift'
        # Application files remain actual current repository bytes, not archived runtime code.
        import shutil
        shutil.copytree(ROOT/'lib',stage/'app/lib',dirs_exist_ok=True)
        for name in ['server.js','package.json']:shutil.copy2(ROOT/name,stage/'app'/name)
        names=['synthetik-500-w15-full500-runtime.js','synthetik-500-w15-full500-audit.js','synthetik-500-w15-signed-chain-test.js','fixtures/w15-auth-measurement-report.js',
          'fixtures/w15-durable-observations.js','fixtures/w15-owned-process-stop.js','fixtures/w15-full500-provider.js','fixtures/w15-unit0-provider.js','fixtures/w15-memory-contract.js','fixtures/w15-memory-contract.json','fixtures/w15-full500-window.js','fixtures/w15-atomic-integration-target.json','fixtures/w15-local-memory-budget.json']
        for n in names:shutil.copy2(ROOT/'scripts'/n,stage/'app/scripts'/n)
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700)
        state=WORK/'state';state.mkdir(mode=0o700)
        docker('create','--name',CONTAINER,'--label','helmut.w15.full500=20261028d','--pull=never','--network=none','--restart=no',
          '--memory=2048000000','--memory-swap=2048000000','--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data',
          '--mount','type=bind,src='+str(state)+',dst='+BASE+'/state',
          '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE,'postgres','-c','helmut.local_usage_experiment=on','-c','max_wal_size=128MB','-c','work_mem=32MB','-c','autovacuum_naptime=10s');created=True
        docker('start',CONTAINER)
        info=json.loads(docker('inspect',CONTAINER))[0]
        assert info['Image']==IMAGE and info['HostConfig']['NetworkMode']=='none'and not info['NetworkSettings']['Ports']
        assert info['HostConfig']['Memory']==LIMIT and info['HostConfig']['MemorySwap']==LIMIT
        assert {(m['Source'],m['Destination'])for m in info['Mounts']}=={(str(pgdata),'/var/lib/postgresql/data'),(str(state),BASE+'/state')}
        pid=info['State']['Pid'];cgrel=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('0::')[-1]
        cgroup=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+cgrel.lstrip('/')).lstrip('/');assert info['Id']in str(cgroup)
        supervisor=Supervisor(cgroup)
        try:supervisor.sample()
        except BaseException as e:supervisor.first_failure(e);raise
        supervisor.thread.start()
        save('SUPERVISOR_READY.SAFE.json',{'pid':os.getpid(),'container':CONTAINER,'realMemoryCap':LIMIT,'swapMaximum':0,'cgroup':str(cgroup),'image':IMAGE})
        # Readiness is bounded, never a dispatch/DB-write retry.
        ready=False
        for _ in range(100):
            r=subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-U','postgres'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
            if r.returncode==0:ready=True;break
            time.sleep(.2)
        assert ready,'full500-pg-not-ready'
        docker('exec',CONTAINER,'mkdir','-p',BASE)
        docker('exec',CONTAINER,'chmod','700',BASE)
        copy_in(stage/'app',BASE+'/app');copy_in(stage/'node',BASE+'/node');copy_in(stage/'postgrest',BASE+'/postgrest')
        assert state.stat().st_mode&0o777==0o700
        for n in ['OWNER_GO.PRIVATE.json','setup-input.PRIVATE.json']:copy_in(WORK/n,BASE+'/state/'+n)
        copy_in('/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json',BASE+'/state/publication-policy.PRIVATE.json')
        copy_in(inputs['localRoles'],BASE+'/roles.PRIVATE.sql');copy_in(inputs['frozenSourceDump'],BASE+'/input.PRIVATE.dump')
        docker('exec',CONTAINER,'chown','-R','1000:1000',BASE)
        docker('exec',CONTAINER,'chmod','700',BASE+'/node',BASE+'/postgrest')
        sql('create database '+DB+';','postgres')
        docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f',BASE+'/roles.PRIVATE.sql')
        docker('exec',CONTAINER,'pg_restore','--exit-on-error','--file='+BASE+'/restore.PRIVATE.sql',BASE+'/input.PRIVATE.dump')
        # One transaction: the original active flags are never committed.
        docker('exec',CONTAINER,'psql','-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d',DB,
          '-f',BASE+'/restore.PRIVATE.sql','-c',"set local statement_timeout='15s';update public.mandate_profiles set aktiv=false where aktiv;")
        assert read('select count(*)from mandate_profiles where aktiv;')==0
        inner(supervisor,'setup')
        docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','umask 077; echo $$ >'+BASE+'/state/postgrest.pid; exec '+BASE+'/postgrest '+BASE+'/state/postgrest.PRIVATE.conf >'+BASE+'/state/postgrest.PRIVATE.log 2>&1')
        docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --max-old-space-size=512 --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-full500-runtime.js gateway >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
        gateway_ready=False
        for _ in range(40):
            r=subprocess.run(DOCKER+['exec',CONTAINER,'test','-f',BASE+'/state/runtime-public.PRIVATE.json'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode==0:gateway_ready=True;break
            time.sleep(.1)
        assert gateway_ready,'full500-gateway-not-ready'
        copy_out('runtime-public.PRIVATE.json');copy_out('SETUP.SAFE.json')
        env=os.environ.copy();env['NODE_V8_COVERAGE']=str(WORK/'coverage-materials')
        supervisor.stage(['node','scripts/lokal.js','--','node','scripts/synthetik-500-w15-full500-materials.js'],'materials',240,env)
        for n in ['processing-materials.PRIVATE.json','current-command.PRIVATE.json','mock-fixtures.PRIVATE.json','audit-inputs.PRIVATE.json']:copy_in(WORK/n,BASE+'/state/'+n)
        docker('exec',CONTAINER,'chown','-R','1000:1000',BASE+'/state')
        sql((ROOT/'supabase/proposals/auth_usage_atomic_local.sql').read_text(),database=DB)
        sql("select public.helmut_auth_usage_bootstrap_v1(jsonb_build_object('id','main-auth','expectedHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')))from public.helmut_store where id='main-auth';",database=DB)
        sql("notify pgrst,'reload schema';",database=DB)
        inner(supervisor,'prepare',130);copy_out('PREPARE.SAFE.json')
        inner(supervisor,'run',10815)
    except BaseException as e:
        failure={'type':type(e).__name__,'reason':str(e),'retryAllowed':False}
    finally:
        if created:
            try:
                running=json.loads(docker('inspect',CONTAINER))[0]['State']['Running']
                if not running:
                    recovery=True
                    # Only PostgreSQL is the container entry point. No dispatcher/services restart.
                    recover_postgres_only(supervisor)
                else:
                    try:stop_owned(['prepare','run','setup','audit'])
                    except BaseException as e:
                        failure=failure or {'type':type(e).__name__,'reason':str(e),'innerStopConfirmed':False}
                        # The bound native zero path is still mandatory with PG
                        # available; a telemetry/stop error cannot skip it.
                        if not(WORK/'INNER_STOP_UNKNOWN.SAFE.json').exists():save('INNER_STOP_UNKNOWN.SAFE.json',failure)
                # Bound outstanding server statements can settle; no unit or write retry.
                if failure:time.sleep(16)
                cleanup_result=cleanup()
                if cleanup_result.get('writeOutcome')=='UNKNOWN':failure=failure or {'type':'UnknownEndWrite','reason':'no-endwrite-retry'}
            except BaseException as e:
                cleanup_failure={'type':type(e).__name__,'reason':str(e),'activeZeroUnknown':True}
                # Only a confirmed PostgreSQL outage permits the one PG-only
                # recovery. SQL/guard errors do not authorize another write.
                if not recovery:
                    try:
                        r=subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-U','postgres'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
                        if r.returncode!=0:
                            recovery=True;recover_postgres_only(supervisor);cleanup_result=cleanup()
                            cleanup_failure['recoveredZero']=cleanup_result['confirmedZero']
                    except BaseException as re:cleanup_failure['recoveryFailureType']=type(re).__name__
            if cleanup_result and cleanup_result['confirmedZero']:
                try:
                    if supervisor and not recovery:
                        # Closure never resumes processing. Keep the historical
                        # first failure, but allow bounded read-only classification.
                        supervisor.closure_mode=True
                        inner(supervisor,'audit',900)
                    elif recovery:
                        # PostgreSQL-only recovery never starts any application
                        # service. The pure read-only auditor is a closure action.
                        m=json.loads((WORK/'processing-materials.PRIVATE.json').read_text())
                        remaining=int((datetime.datetime.fromisoformat(m['completionDeadlineUTC'].replace('Z','+00:00'))-datetime.datetime.now(datetime.timezone.utc)).total_seconds())-10
                        seconds=min(900,remaining);assert seconds>0,'full500-no-remaining-audit-window'
                        with(WORK/'audit.PRIVATE.log').open('xb')as log:
                            subprocess.run(DOCKER+['exec','--user','1000:1000',CONTAINER,'timeout','--signal=TERM','--kill-after=5s',str(seconds)+'s','env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8','HELMUT_SOURCE_MODE=off','HELMUT_STORAGE_BACKEND=local',BASE+'/node','--require',BASE+'/app/scripts/lokaler-netzschutz.js',BASE+'/app/scripts/synthetik-500-w15-full500-audit.js'],env=ENV,stdout=log,stderr=log,timeout=seconds+10,check=True)
                except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
            try:
                if not recovery:stop_owned(['gateway','postgrest'])
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':'owned-services-stop-unconfirmed'}
            for n in ['SETUP.SAFE.json','PREPARE.SAFE.json','PREPARE_ABORT_OBSERVATIONS.SAFE.json','FULL500_RUNTIME_RESULT.SAFE.json','FULL500_RUNTIME_FAILURE.SAFE.json','FULL500_ABORT_OBSERVATIONS.SAFE.json','RESULTS_INDEPENDENT.SAFE.json','run-FIRST-FAILURE.SAFE.json','prepare-FIRST-FAILURE.SAFE.json','audit-FIRST-FAILURE.SAFE.json','runtime-progress.SAFE.jsonl']:
                try:copy_out(n)
                except BaseException:pass
        if supervisor:
            final_sample_verified=False
            if not recovery:
                try:supervisor.sample();final_sample_verified=True
                except BaseException as e:
                    supervisor.first_failure(e);failure=failure or {'type':type(e).__name__,'reason':str(e)}
            supervisor.stop();save('FINAL_COMMON_MEMORY.SAFE.json',{'originalCgroup':str(supervisor.cgroup),'originalLastVerifiedSample':supervisor.last,
              'maximumObservedPeakBytes':supervisor.maximum,'originalFinalPeakVerified':final_sample_verified and not recovery and supervisor.failure is None,'recoveryOccurred':recovery,'failure':supervisor.failure})
        if before is not None:
            try:
                after=source_state();save('SOURCE_AFTER.SAFE.json',after);assert after==before,'original-source-changed'
            except BaseException as e:failure=failure or {'type':type(e).__name__,'reason':str(e)}
        audit_file=WORK/'RESULTS_INDEPENDENT.SAFE.json'
        audit=json.loads(audit_file.read_text())if audit_file.exists()else{}
        if supervisor and supervisor.failure:failure=failure or supervisor.failure
        if recovery:failure=failure or {'type':'RecoveryOccurred','reason':'original-memory-proof-not-replaced'}
        result={'status':'PASS_LOCAL_MOCK500_ONLY'if not failure and not cleanup_failure and audit.get('storedResultsAccepted')else'FAIL_OR_UNKNOWN',
          'failure':failure,'cleanupFailure':cleanup_failure,'cleanupConfirmedZero':bool(cleanup_result and cleanup_result['confirmedZero']),
          'independent1500ResultsAccepted':audit.get('storedResultsAccepted',False),'categories':audit.get('categories',{'notAudited':1500}),
          'full500ProductionProof':False,'noRetryOrResume':True,'realModelCalls':0,'newTestContainers':int(created),'recoveryOccurred':recovery}
        save('CONTROLLER_RESULT.SAFE.json',result);print(json.dumps(result))
    if result['status']!='PASS_LOCAL_MOCK500_ONLY':raise SystemExit(1)

if __name__=='__main__':main()
