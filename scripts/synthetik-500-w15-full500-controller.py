#!/usr/bin/env python3
"""Exactly one explicitly authorized full local mock run. No action on import."""
import datetime, zoneinfo, hashlib, json, math, os, pathlib, posixpath, queue, signal, subprocess, threading, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
# Fresh server/container/PGDATA; the database namespace deliberately remains
# unchanged so the already qualified source installer and its pins stay exact.
WORK=pathlib.Path('/workspace/shared/helmut-w15-full500-20261028c')
BASE='/tmp/w15-full500-20261028c'
DB='helmut_w15_full500_20261028b'
CONTAINER='w15-full500-20261028c'
SOURCE_DB='helmut_w15_input_20261027'
SOURCE_CONTAINER='synthetik500-runtime-pg-7e1c20261027'
IMAGE='sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e'
RECEIPT=pathlib.Path('/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json')
RECEIPT_SHA='2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'
REVIEW=pathlib.Path('/workspace/shared/helmut-w15-full500-review-20261028c/REVIEW_READY.SAFE.json')
QUALIFICATION=pathlib.Path('/workspace/shared/helmut-w15-current-source-update-20261028/qualification-b')
AUTH_WITNESS=pathlib.Path('/workspace/shared/helmut-w15-auth-observer-check-20261028/AUTH_MEASUREMENT_CHECK.SAFE.json')
DOCKER=['docker','--host=unix:///var/run/docker.sock']
ENV={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
MEMORY=json.loads((ROOT/'scripts/fixtures/w15-memory-contract.json').read_text())
LIMIT=MEMORY['comparisonBudgetBytes']
RESERVE=(LIMIT*MEMORY['minimumReservePercent']+99)//100
MAXIMUM=LIMIT-RESERVE

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
    b=(ROOT/pin['path']).read_bytes();assert len(b)==pin['bytes']and sha(b)==pin['sha256'],'full500-auth-observer-source-drift'
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
def call(args,input=None,timeout=120):
    r=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,cwd=ROOT,timeout=timeout)
    if r.returncode:raise RuntimeError('full500-command-failed:'+args[0]+':'+str(r.returncode))
    return r.stdout

def docker(*args,**kw):return call(DOCKER+list(args),**kw)
def sql(query,database=DB,source=False):
    assert (source and database==SOURCE_DB and query.startswith('begin read only;'))or(not source and database in [DB,'postgres'])
    return docker('exec','-i',SOURCE_CONTAINER if source else CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-',input=query.encode(),timeout=35).decode().strip()
def read(query,database=DB,source=False):return json.loads(sql("begin read only;set local statement_timeout='15s';set local lock_timeout='3s';"+query+'rollback;',database,source))
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
        self.started_monotonic=time.monotonic();self.last_ack_monotonic=None;self.last_terminal_monotonic=self.started_monotonic
        self.progress=(WORK/'outer-progress.SAFE.jsonl').open('x');os.chmod(WORK/'outer-progress.SAFE.jsonl',0o600)
        self.progress_queue=queue.Queue(maxsize=2048);self.progress_finished=threading.Event()
        self.reporter=threading.Thread(target=self.write_progress,daemon=True);self.reporter.start()
        self.thread=threading.Thread(target=self.monitor,daemon=True)
    def write_progress(self):
        try:
            while not self.progress_finished.is_set()or not self.progress_queue.empty():
                try:record=self.progress_queue.get(timeout=.2)
                except queue.Empty:continue
                try:
                    line=json.dumps(record,separators=(',',':'))
                    self.progress.write(line+'\n');self.progress.flush();print(record['message'],flush=True)
                finally:self.progress_queue.task_done()
        except BaseException as e:self.first_failure(e)
        finally:self.progress.close()
    def publish(self,name,index=None,status=None):
        # Only existing kernel samples and sanitized runtime ACK events enter
        # this public-shaped record. No SQL, Docker exec or memory read here.
        with self.progress_lock:
            now=time.monotonic();m=self.last
            actual_limit=None if m is None else m['configuredLimit']
            memory=None if m is None else {'sampleAtUTC':m['sampleAtUTC'],'comparisonBudgetBytes':LIMIT,
              'kernelLimitBytes':int(actual_limit)if actual_limit.isdigit()else actual_limit,
              'kernelLimitMB':int(actual_limit)/1000000 if actual_limit.isdigit()else None,'kernelSwapMaximum':m['swapMaximum'],
              'currentBytes':m['currentBytes'],'currentMB':round(m['currentBytes']/1000000,3),'currentPercentOfCap':round(100*m['currentBytes']/LIMIT,6),
              'kernelLifetimePeakBytes':m['kernelLifetimePeakBytes'],'peakMB':round(m['kernelLifetimePeakBytes']/1000000,3),'peakPercentOfCap':round(100*m['kernelLifetimePeakBytes']/LIMIT,6),
              'reserveBytes':LIMIT-m['kernelLifetimePeakBytes'],'reserveMB':round((LIMIT-m['kernelLifetimePeakBytes'])/1000000,3),
              'reservePercentOfCap':round(100*(LIMIT-m['kernelLifetimePeakBytes'])/LIMIT,6),'requiredReserveBytes':RESERVE,
              'requiredReservePercent':MEMORY['minimumReservePercent'],'maximumAllowedPeakBytes':MAXIMUM,'maximumAllowedPeakMB':MAXIMUM/1000000,
              'swapCurrentBytes':m['swapCurrentBytes'],'events':m['events']}
            record={'name':name,'observedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':self.stage_name or 'between-stages-or-cleanup',
              'acceptedProfiles':len(self.accepted_indexes),'expectedProfiles':500,'lastAcceptedIndex':self.last_accepted_index,
              'noNewAcceptedACKForSeconds':round(now-(self.last_ack_monotonic or self.started_monotonic),3),
              'noAcceptedProfileYet':not self.accepted_indexes,'memory':memory}
            if index is not None:record['index']=index
            if status is not None:record['status']=status
            if name=='supervisor-first-failure':record['failure']=self.failure
            ram='RAM noch ohne verifizierten Sample'
            if memory is not None:
                ram=('RAM {currentMB:.1f} MB ({currentPercentOfCap:.2f} %) | Peak {peakMB:.1f} MB ({peakPercentOfCap:.2f} %)'
                  ' | Peak-Reserve {reserveMB:.1f} MB ({reservePercentOfCap:.2f} %)').format(**memory)
            if name=='unit-final-ack-accepted':
                record['message']='Profil '+str(index+1)+'/500 abgeschlossen | '+ram
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
            self.accepted_indexes.add(index);self.last_accepted_index=index;self.last_ack_monotonic=time.monotonic()
            self.publish('unit-final-ack-accepted',index,'PASS')
    def first_failure(self,error):
        with self.failure_lock:
            first=self.failure is None
            self.failure=self.failure or {'type':type(error).__name__,'reason':str(error)}
            p=self.process
        # Stop first; terminal/file reporting cannot delay the existing bound stop.
        if not self.closure_mode and p and p.poll()is None:
            try:os.killpg(p.pid,signal.SIGTERM)
            except ProcessLookupError:pass
        if first:
            try:self.publish('supervisor-first-failure',status='FAIL')
            except BaseException:pass # First failure and bound stop already persist independently.
    def sample(self):
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
        self.stage_name=name
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
                r=self.process.wait(timeout=seconds)
                if r:
                    error=RuntimeError('full500-stage-failed:'+name+':'+str(r))
                    self.first_failure(error);raise error
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid,signal.SIGTERM)
                try:self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:os.killpg(self.process.pid,signal.SIGKILL);self.process.wait()
                raise RuntimeError('full500-stage-timeout:'+name)
            finally:
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
    cmd='echo $$ >'+BASE+'/state/'+action+'.pid; exec timeout --signal=TERM --kill-after=5s '+str(seconds-10)+'s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/'+script+suffix
    supervisor.stage(DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',cmd],action,seconds)

def stop_owned(actions):
    for a in actions:
        assert a in ['prepare','run','setup','audit','gateway','postgrest']
        # The minimal cached image has neither ps nor /bin/kill. Use the already
        # available Node to verify every live member of the owned timeout group.
        code=r'''const fs=require('fs'),assert=require('assert/strict');
const [base,action,db]=process.argv.slice(1),f=base+'/state/'+action+'.pid';
if(!fs.existsSync(f))process.exit(0);const p=Number(fs.readFileSync(f,'utf8'));assert(Number.isSafeInteger(p)&&p>1);
const grouped=['prepare','run','setup','audit'].includes(action);
function members(){const out=[];for(const d of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{
const s=fs.readFileSync('/proc/'+d+'/stat','utf8'),fields=s.slice(s.lastIndexOf(') ')+2).split(' '),id=Number(d);
if(fields[0]==='Z'||(grouped?Number(fields[2])!==p:id!==p))continue;
const cmd=fs.readFileSync('/proc/'+d+'/cmdline','utf8').replaceAll('\0',' ');
assert(cmd.includes(base)||(grouped&&cmd.includes('psql')&&cmd.includes(db)),'unowned-live-process');out.push(id);
}catch(e){if(e.code==='ENOENT'||e.code==='ESRCH')continue;throw e;}}return out;}
async function wait(ms){const end=Date.now()+ms;while(members().length&&Date.now()<end)await new Promise(r=>setTimeout(r,50));}
(async()=>{if(!members().length)return;try{process.kill(grouped?-p:p,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
await wait(5000);if(members().length){process.kill(grouped?-p:p,'SIGKILL');await wait(2000);}
assert.equal(members().length,0,'owned-process-group-still-live');})().catch(()=>{process.exitCode=1;});'''
        docker('exec','--user','1000:1000',CONTAINER,BASE+'/node','--eval',code,BASE,a,DB,timeout=12)

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

def main():
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
        names=['synthetik-500-w15-full500-runtime.js','synthetik-500-w15-full500-audit.js','synthetik-500-w15-signed-chain-test.js',
          'fixtures/w15-full500-provider.js','fixtures/w15-unit0-provider.js','fixtures/w15-memory-contract.js','fixtures/w15-memory-contract.json','fixtures/w15-full500-window.js']
        for n in names:shutil.copy2(ROOT/'scripts'/n,stage/'app/scripts'/n)
        pgdata=WORK/'pgdata';pgdata.mkdir(mode=0o700)
        docker('create','--name',CONTAINER,'--label','helmut.w15.full500=20261028c','--pull=never','--network=none','--restart=no',
          '--memory=2048000000','--memory-swap=2048000000','--mount','type=bind,src='+str(pgdata)+',dst=/var/lib/postgresql/data',
          '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE);created=True
        docker('start',CONTAINER)
        info=json.loads(docker('inspect',CONTAINER))[0]
        assert info['Image']==IMAGE and info['HostConfig']['NetworkMode']=='none'and not info['NetworkSettings']['Ports']
        assert info['HostConfig']['Memory']==LIMIT and info['HostConfig']['MemorySwap']==LIMIT
        assert len(info['Mounts'])==1 and info['Mounts'][0]['Source']==str(pgdata)and info['Mounts'][0]['Destination']=='/var/lib/postgresql/data'
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
        docker('exec',CONTAINER,'mkdir','-m','700',BASE)
        copy_in(stage/'app',BASE+'/app');copy_in(stage/'node',BASE+'/node');copy_in(stage/'postgrest',BASE+'/postgrest')
        docker('exec',CONTAINER,'mkdir','-m','700',BASE+'/state')
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
        docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','echo $$ >'+BASE+'/state/postgrest.pid; exec '+BASE+'/postgrest '+BASE+'/state/postgrest.PRIVATE.conf >'+BASE+'/state/postgrest.PRIVATE.log 2>&1')
        docker('exec','--user','1000:1000','-d',CONTAINER,'sh','-c','env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-full500-runtime.js gateway >'+BASE+'/state/gateway.PRIVATE.log 2>&1')
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
                else:stop_owned(['prepare','run','setup','audit'])
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
            for n in ['SETUP.SAFE.json','PREPARE.SAFE.json','FULL500_RUNTIME_RESULT.SAFE.json','FULL500_RUNTIME_FAILURE.SAFE.json','RESULTS_INDEPENDENT.SAFE.json','run-FIRST-FAILURE.SAFE.json','prepare-FIRST-FAILURE.SAFE.json','audit-FIRST-FAILURE.SAFE.json','runtime-progress.SAFE.jsonl']:
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
