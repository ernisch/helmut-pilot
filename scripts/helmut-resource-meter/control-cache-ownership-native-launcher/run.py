#!/usr/bin/env python3
"""PREPARED, NOT RUN. prepare is metadata-only; start needs a NEW Root receipt."""
import argparse
import datetime
import json
import re
import secrets
import time
from pathlib import Path
import common as C

def modules(closure):
    def expected(path):
        values=[x for x in closure['metadataAndCodeInputs'] if x['path']==str(path)]
        C.require(len(values)==1,'module outside adopted source closure')
        return values[0]
    n=C.BIN/'native-memory-budget.py'
    k=C.BIN/'kernel-meter.py'
    return (C.load('spill_native_budget',n,expected_pin=expected(n)),
            C.load('spill_kernel_meter',k,expected_pin=expected(k)))

def prepared():
    p = C.HERE/'PREPARED.SAFE.json'
    value = json.loads(p.read_text())
    C.require(value['schema']=='helmut-control-cache-prepared/1'
              and value['nativeQualification']=='NOT_RUN','prepared source closure')
    for item in value['files']+value['metadataAndCodeInputs']+value['hostOnlyInputPins']:
        C.checked(item)
    return C.pin(p),value

def safe_case(path, absent=False):
    path = Path(path)
    C.require(path.is_absolute() and path.resolve()==path and
              path.parent==C.CASES and re.fullmatch(r'control-[a-f0-9]{24}',path.name),
              'new dedicated case path required')
    if absent:
        C.require(not path.exists(),'case must be new; never reuse')
    return path

def source_not_live(N):
    # Mount/process metadata only; never start, stop or read source PGDATA here.
    ids = N.docker(['ps','-q','--no-trunc']).stdout.split()
    rows = json.loads(N.docker(['inspect',*ids]).stdout) if ids else []
    for row in rows:
        for mount in row.get('Mounts',[]):
            p = Path(mount['Source'])
            C.require(not (p==C.SOURCE or C.SOURCE.is_relative_to(p) or p.is_relative_to(C.SOURCE)),
                      'original source has a live container binding')

def prepare(case, mode, lifecycle_path, variant):
    frozen,value = prepared()
    selected=C.selected_measurement(value,mode,variant)
    C.floor(C.HERE,C.ADMISSION)
    C.CASES.mkdir(mode=0o700,parents=True,exist_ok=True)
    case = safe_case(case,absent=True)
    lifecycle=C.pin(lifecycle_path) if lifecycle_path else None
    C.validate_run_inputs(value,selected,lifecycle,frozen)
    N,K = modules(value)
    runtime = json.loads(C.RUNTIME.read_text())
    N.validate_runtime(runtime)
    C.require(N.policy()['nativeMaxBytes']==1547997184 and
              N.policy()['nativeHighBytes']==1399996416 and N.policy()['swapMaxBytes']==0,
              'unchanged exact native policy')
    source_not_live(N)
    C.require(json.loads(N.docker(['info','--format','{{json .Driver}}']).stdout)=='vfs',
              'known local storage driver')
    bindings = C.runtime_bindings()
    case.mkdir(mode=0o700)
    result = {'schema':'helmut-control-cache-preflight/1','status':'READY_FOR_ROOT_ADOPTION_ONLY',
        'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'case':str(case),
        'preparedPin':frozen,'runtimePin':C.pin(C.RUNTIME),'bindings':bindings,
        'nativePolicy':N.policy(),'hostAvailableBytes':C.available(case),
        'admissionBytes':C.ADMISSION,'diskCopyLimitBytes':C.DISK_LIMIT,
        'source':str(C.SOURCE),'sourceManifestSHA256':C.SOURCE_SHA,
        'sourceFileCount':1709,'sourceFileBytes':369399611,
        'runtimeActualFilesVerifiedInsideNewGroup':False,
        'measurementMode':mode,'variant':selected['variant'],'selection':selected,'lifecycleResultPin':lifecycle,'setupRendererInstallationRequired':True,
        'ramComparisonPerformed':False,'threeRPCPlateauClaimed':False,
        'postgrestStarted':False,'nodeStarted':False,'full500':False,'production':False,
        'providerCalls':0,'containersStarted':0,'sqlExecuted':0,'automaticRetry':False}
    C.save(case,'PREFLIGHT.SAFE.json',result)
    print(json.dumps({'status':result['status'],'case':str(case),'admissionBytes':C.ADMISSION,
                      'selection':selected,'lifecycleResultPin':lifecycle}))

def utc(text):
    value = datetime.datetime.fromisoformat(text.replace('Z','+00:00'))
    C.require(value.tzinfo is not None,'timezone-aware Root receipt required')
    return value.astimezone(datetime.timezone.utc)

def start(adoption_path):
    frozen,prepared_value = prepared()
    adoption_pin = C.pin(adoption_path)
    adoption = C.read(adoption_pin)
    mode=adoption['measurementMode']
    selected=C.selected_measurement(prepared_value,mode,adoption['variant'])
    lifecycle=adoption['lifecycleResultPin']
    C.validate_run_inputs(prepared_value,selected,lifecycle,frozen)
    now = datetime.datetime.now(datetime.timezone.utc)
    C.require(adoption['schema']==selected['adoptionSchema'] and
              adoption['action']==selected['action'] and
              adoption['selection']==selected and
              type(adoption['authRPCCount']) is int and adoption['authRPCCount']==selected['authRPCCount'] and
              type(adoption['nodeLaunchCount']) is int and adoption['nodeLaunchCount']==selected['nodeLaunchCount'] and
              re.fullmatch('[a-f0-9]{24}',adoption['nonce']) and
              now<=utc(adoption['expiresUTC'])<=now+datetime.timedelta(minutes=15) and
              now-datetime.timedelta(minutes=15)<=utc(adoption['atUTC'])<=now and
              adoption['preparedPin']==frozen and adoption['installReviewedRenderer'] is True and
              adoption['sourceManifestSHA256']==C.SOURCE_SHA and
              adoption['full500'] is False and adoption['production'] is False,
              'fresh exact bounded Root START adoption')
    pf = C.read(adoption['preflightPin'])
    case = safe_case(pf['case'])
    C.require(adoption['preflightPin']['path']==str(case/'PREFLIGHT.SAFE.json') and
              pf['schema']=='helmut-control-cache-preflight/1' and
              pf['preparedPin']==frozen and pf['source']==str(C.SOURCE) and
              pf['measurementMode']==mode and pf['selection']==selected and
              pf['lifecycleResultPin']==lifecycle and
              pf['sourceManifestSHA256']==C.SOURCE_SHA and
              pf['status']=='READY_FOR_ROOT_ADOPTION_ONLY' and
              now-datetime.timedelta(minutes=15)<=utc(pf['atUTC'])<=now,
              'fresh matching case preflight')
    C.require(not(case/'STARTED.SAFE.json').exists(),'one-shot START already spent')
    C.floor(case,C.ADMISSION)
    N,K = modules(prepared_value)
    own_path=C.HERE/'ownership.py'
    own_pin=next(x for x in prepared_value['files'] if x['path']==str(own_path))
    O=C.load('host_ownership_census',own_path,expected_pin=own_pin)
    runtime = C.read(pf['runtimePin'])
    N.validate_runtime(runtime)
    C.require(pf['nativePolicy']==N.policy() and pf['bindings']==C.runtime_bindings(),
              'runtime/native policy closure drift')
    source_not_live(N)
    parent = 'helmut-meter-memorybudget-'+secrets.token_hex(12)
    name = 'helmut-control-cache-'+secrets.token_hex(12)
    started = time.monotonic()
    deadline = started+C.WORK_SECONDS
    final_deadline = started+C.TOTAL_SECONDS
    C.save(case,'STARTED.SAFE.json',{'atUTC':now.isoformat(),'parent':parent,
        'rootAdoptionPin':adoption_pin,'preflightPin':adoption['preflightPin'],
        'preparedPin':frozen,'nonce':adoption['nonce'],'automaticRetry':False,
        'measurementMode':mode,'variant':selected['variant'],'selection':selected,'lifecycleResultPin':lifecycle,
        'workSeconds':C.WORK_SECONDS,'totalSecondsIncludingClosure':C.TOTAL_SECONDS,
        'full500':False,'production':False,'providerCalls':0})
    original_docker,original_save = N.docker,N.save
    closing_control = False
    def docker(argv,**kwargs):
        C.require(not closing_control or argv[0] not in ('create','start'),
                  'no new resource during closure')
        if argv[0] in ('create','start'):
            C.floor(case,2*C.MIB)
        remaining = final_deadline-time.monotonic()
        C.require(closing_control or remaining>0,'total probe/control deadline')
        kwargs['timeout']=min(kwargs.get('timeout',30),45 if closing_control else remaining)
        return original_docker(argv,**kwargs)
    def save_native(path,value):
        # The existing native controller's fixed small receipt files remain
        # within this case and the SAME total evidence cap.
        path = Path(path)
        C.require(path.is_relative_to(case/'native-budget-setup'),'native receipt outside case')
        data = (json.dumps(value,indent=2)+'\n').encode()
        C.require(C.output_bytes(case)+len(data)<=C.OUTPUT_LIMIT,'total evidence cap')
        C.floor(case,len(data))
        original_save(path,value)
    N.docker,N.save = docker,save_native
    budget = None
    cid = None
    create_entered = False
    final_kernel = None
    final_budget = None
    closure = None
    worker = None
    forced = None
    failure = None
    samples = []
    passed = False
    node_receipts = None
    ownership_host_evidence = None
    minimum_free = C.available(case)
    def identity():
        row = json.loads(N.docker(['inspect',cid]).stdout)[0]
        h = row['HostConfig']
        C.require(row['Id']==cid and row['Name']=='/'+name and row['Image']==runtime['imageId']
                  and h['CgroupParent']=='/'+parent,'owned exact workload identity')
        return row
    mounts = []
    try:
        # No source hash/copy/JIT/PG setup happens before this returns READY.
        budget = N.start(case/'native-budget-setup',parent,runtime)
        disk = case/'disk'
        disk.mkdir(mode=0o700)
        config = {'parent':parent,'parentInode':budget['parentInode'],
            'rootAdoptionPin':adoption_pin,'rootNonce':adoption['nonce'],'workDeadlineMonotonic':deadline,
            'finalDeadlineMonotonic':final_deadline,'preparedPin':frozen,
            'measurementMode':mode,'variant':selected['variant'],'selection':selected,'lifecycleResultPin':lifecycle,
            'runtimeBindings':pf['bindings'],'preparation':prepared_value}
        C.save(case,'WORKER_CONFIG.SAFE.json',config)
        jit_plan = json.loads((C.D/'jit-closure-v2/JIT_CLOSURE_PLAN.SAFE.json').read_text())
        mounts = [(C.SOURCE,'/source-pgdata',True),(disk,'/disk',False),
            (case,'/bench',False),(C.HERE,'/tools',True),
            (Path(frozen['path']),frozen['path'],True),
            (C.PYTHON,str(C.PYTHON),True),(N.parent_path(parent),'/owned-group',True)]
        if lifecycle is not None:
            for proof_pin in C.lifecycle_file_pins(lifecycle,frozen):
                mounts.append((Path(proof_pin['path']),proof_pin['path'],True))
        # Canonical require paths load selected frozen bytes. These destinations
        # are intentionally absent from metadataAndCodeInputs; old host bytes
        # are authenticated separately by hostOnlyInputPins before/after start.
        mounts += [(Path(selected['uOverlayPin']['path']),str(C.CANONICAL_U),True),
                   (Path(selected['partsOverlayPin']['path']),str(C.CANONICAL_PARTS),True)]
        # Native worker accesses these same immutable absolute code/metadata paths.
        for item in prepared_value['metadataAndCodeInputs']:
            p = Path(item['path'])
            mounts.append((p,str(p),True))
        mounts += [(Path(jit_plan['archive']['path']),jit_plan['archive']['path'],True),
                   (Path(jit_plan['rootManifest']['path']),jit_plan['rootManifest']['path'],True)]
        # The adjacent restorer plan must retain its path under __file__.parent.
        mounts.append((C.D/'jit-closure-v2',str(C.D/'jit-closure-v2'),True))
        seen = {}
        for s,d,ro in mounts:
            C.require(d not in seen or seen[d]==(str(s),ro),'mount destination collision')
            seen[d]=(str(s),ro)
        mounts = [(Path(s),d,ro) for d,(s,ro) in seen.items()]
        argv = ['create','--name',name,'--network','none','--read-only','--cap-drop','ALL',
            '--security-opt','no-new-privileges','--user','1000:1000','--cgroup-parent=/'+parent,
            '--cgroupns','private','--log-driver','none','--shm-size',str(16*C.MIB),
            '--tmpfs','/ram:rw,exec,nosuid,nodev,size='+str(C.RAM_LIMIT)+',uid=1000,gid=1000,mode=0700',
            '--tmpfs','/usr/lib/postgresql/17/lib:rw,exec,nosuid,nodev,size='+str(C.MIB)+',uid=1000,gid=1000,mode=0755',
            '--entrypoint',str(C.PYTHON/'bin/python'),'--env','PYTHONDONTWRITEBYTECODE=1',
            '--env','LANG=C.UTF-8','--env','LC_ALL=C.UTF-8']
        for b in pf['bindings']:
            argv += ['--mount','type=bind,src='+b['source']['path']+',dst='+b['imagePath']+',readonly']
        for s,d,ro in mounts:
            argv += ['--mount','type=bind,src='+str(s)+',dst='+d+(',readonly' if ro else '')]
        argv += [runtime['imageId'],'/tools/worker.py']
        create_entered = True
        rawcid = N.docker(argv).stdout.strip()
        C.require(re.fullmatch('[a-f0-9]{64}',rawcid),'actual owned container ID')
        cid = rawcid
        C.save(case,'CREATED.SAFE.json',{'id':cid,'name':name,'parent':parent})
        row = identity()
        h = row['HostConfig']
        C.require(h['NetworkMode']=='none' and h['ReadonlyRootfs'] and not h.get('Privileged')
                  and not h.get('CapAdd') and h['CapDrop']==['ALL']
                  and h['LogConfig']['Type']=='none' and h.get('CgroupnsMode')=='private'
                  and row['Config']['User']=='1000:1000','owned workload confinement')
        C.require(h.get('ShmSize')==16*C.MIB and h.get('Tmpfs')=={
            '/ram':'rw,exec,nosuid,nodev,size='+str(C.RAM_LIMIT)+',uid=1000,gid=1000,mode=0700',
            '/usr/lib/postgresql/17/lib':'rw,exec,nosuid,nodev,size='+str(C.MIB)+',uid=1000,gid=1000,mode=0755'},
            'exact bounded JIT/socket tmpfs and shared memory')
        expected={(b['source']['path'],b['imagePath'],False) for b in pf['bindings']}
        expected.update((str(s),d,not ro) for s,d,ro in mounts)
        actual={(m['Source'],m['Destination'],m['RW']) for m in row['Mounts'] if m['Type']=='bind'}
        C.require(actual==expected,'exact complete workload bind mounts')
        C.require(set(h.get('Tmpfs') or {})=={'/ram','/usr/lib/postgresql/17/lib'},
                  'PGDATA must not be a tmpfs')
        N.docker(['start',cid])
        while True:
            row=identity()
            snap=K.kernel_snapshot(parent)
            snap.update(atUnixSeconds=time.time(),memoryStat=K.key_values(N.parent_path(parent)/'memory.stat'))
            if mode=='control-cache':
                snap['ownershipHostPIDCensus']=O.host_census(N.parent_path(parent))
            samples.append(snap)
            if len(samples)>220:
                C.require(mode!='control-cache','ownership host timeline cap; never drop to PASS')
                del samples[20]
            free=C.available(case)
            minimum_free=min(minimum_free,free)
            if not row['State']['Running']:
                break
            if free<C.FLOOR: forced='HOST_FREE_FLOOR'
            elif C.output_bytes(case)>C.OUTPUT_LIMIT: forced='OUTPUT_CAP'
            elif time.monotonic()>=deadline: forced='WORK_DEADLINE'
            elif snap['memoryEvents'].get('oom',0) or snap['memoryEvents'].get('oom_kill',0): forced='NATIVE_OOM'
            if forced: break
            time.sleep(.25)
    except BaseException as error:
        forced=forced or 'CONTROL_FAILURE'
        failure=type(error).__name__
    finally:
        closing_control = True
        # Only this known new CID and the existing controller's own new helpers.
        if not cid and create_entered:
            try:
                row=json.loads(N.docker(['inspect',name]).stdout)[0]
                C.require(row['Name']=='/'+name and row['Image']==runtime['imageId']
                          and row['HostConfig']['CgroupParent']=='/'+parent,
                          'interrupted create identity')
                cid=row['Id']
            except BaseException:
                forced=forced or 'CREATE_OUTCOME_OR_CLOSURE_UNKNOWN'
        if cid:
            try:
                row=identity()
                if row['State']['Running']:
                    N.docker(['stop','--time','40',cid],timeout=45)
                code=int(N.docker(['wait',cid],timeout=10).stdout.strip())
                row=identity()
                closure={'id':cid,'name':name,'state':row['State'],'exitCode':code,
                    'allOwnedWorkloadExited':not row['State']['Running'] and row['State']['Pid']==0,
                    'containerPreserved':True,'persistentCopyPreserved':True}
            except BaseException as error:
                forced=forced or 'OWNED_CLOSE_FAILURE'
                failure=failure or type(error).__name__
        if not budget and (case/'native-budget-setup/STARTED.SAFE.json').exists():
            helpers={}
            for role in ('holder','setter'):
                p=case/'native-budget-setup'/(role.upper()+'_CREATED.SAFE.json')
                if p.exists():
                    helpers[role]=json.loads(p.read_text())
            N.close_owned_helpers(case/'native-budget-setup',parent,runtime,helpers)
        if N.parent_path(parent).exists():
            try:
                final_kernel=K.kernel_snapshot(parent,require_empty=True)
                final_kernel['memoryStat']=K.key_values(N.parent_path(parent)/'memory.stat')
                if budget:
                    final_budget=N.verify(parent,budget,require_no_oom=False)
            except BaseException as error:
                forced=forced or 'LAST_EXIT_UNVERIFIED'
                failure=failure or type(error).__name__
        wp=case/'WORKER_RESULT.SAFE.json'
        if wp.exists():
            worker=json.loads(wp.read_text())
        if mode=='control-cache' and worker and worker.get('nodeStarted'):
            try:
                node_receipts=N.node_receipts(case/'node-observations')
                C.require(node_receipts['httpMeteredIsolates']==1 and node_receipts['privateWorkers']==0,
                          'exact one Node isolate; no worker launch')
                C.require(type(worker.get('nodePID')) is int and worker['nodePID']>0 and
                          (case/'node-observations'/('NODE_HEAP_'+str(worker['nodePID'])+'_0.STARTED.SAFE.json')).is_file(),
                          'heap receipt bound to actually captured Node PID')
                stored=worker['ownershipCapturePin']
                C.require(set(stored)=={'path','bytes','sha256'} and
                          stored['path']=='/bench/OWNERSHIP_CAPTURE.SAFE.json','exact worker ownership receipt path')
                host_receipt={**stored,'path':str(case/'OWNERSHIP_CAPTURE.SAFE.json')}
                own=C.read(host_receipt)
                C.require(own==worker['ownershipCapture'] and own['pass'] is True and own['logClosed'] is True
                          and own['operationMarkers']==81 and 81<=own['frames']<=O.MAX_FRAMES,
                          'actual persisted complete ownership capture')
                stored_log=own['logPin']
                C.require(set(stored_log)=={'path','bytes','sha256'} and
                          stored_log['path']=='/bench/OWNERSHIP.PRIVATE.jsonl' and
                          0<stored_log['bytes']<=O.LOG_LIMIT,'exact bounded worker ownership log path')
                host_log={**stored_log,'path':str(case/'OWNERSHIP.PRIVATE.jsonl')}
                C.checked(host_log)
                C.require(stored_log['bytes']==own['logBytes'] and
                          any('ownershipHostPIDCensus' in sample for sample in samples),
                          'closed log length and actual host namespace census evidence')
                ownership_host_evidence={'capturePin':host_receipt,'logPin':host_log,
                    'exactSameCaseTranslation':True,'allDescendantsMemoryReadableClaimed':False}
            except BaseException as error:
                forced=forced or 'NODE_HEAP_OR_EXIT_UNVERIFIED'
                failure=failure or type(error).__name__
        passed=bool(not forced and closure and closure['exitCode']==0
            and not closure['state']['OOMKilled'] and closure['allOwnedWorkloadExited']
            and worker and worker.get('pass') is True
            and worker.get('measurementMode')==mode and worker.get('selection')==selected
            and worker.get('lifecycleResultPin')==lifecycle
            and worker.get('authRPCCount')==selected['authRPCCount']
            and worker.get('postgrestStopQualified') is True and worker.get('catalogUnchangedAfterOperation') is True
            and ((mode=='lifecycle-only' and worker.get('nodeStarted') is False)
                 or (mode=='control-cache' and node_receipts and node_receipts['pass_'] and ownership_host_evidence
                     and worker.get('ownershipCapture') and worker['ownershipCapture']['pass']
                     and worker['ownershipCapture']['operationMarkers']==81
                     and worker['ownershipCapture']['logClosed']
                     and worker.get('nodeStarted') is True and worker.get('nodeExitCode')==0))
            and final_kernel and final_kernel['fullLastProcessExitCovered'] and final_budget
            and not final_kernel['memoryEvents'].get('oom',0)
            and not final_kernel['memoryEvents'].get('oom_kill',0)
            and minimum_free>=C.FLOOR and time.monotonic()<=final_deadline
            and prepared()[0]==frozen)
        C.save(case,'NATIVE_TIMELINE.SAFE.json',samples)
        result={'schema':'helmut-control-cache-result/1','status':'PASS' if passed else 'FAIL',
            'forcedStop':forced,'errorType':failure,'parent':parent,'rootAdoptionPin':adoption_pin,
            'preflightPin':adoption['preflightPin'],'preparedPin':frozen,
            'kernelThroughLastOwnedExit':final_kernel,'nativeBudgetAfterLastExit':final_budget,
            'actualContainerClosure':closure,'workerResultPin':C.pin(wp) if wp.exists() else None,
            'minimumSampledHostAvailableBytes':minimum_free,'continuousHostFloorProven':False,
            'wallSeconds':time.monotonic()-started,
            'measurementMode':mode,'variant':selected['variant'],'selection':selected,'lifecycleResultPin':lifecycle,
            'sourceManifestSHA256':C.SOURCE_SHA,'authRPCCount':worker.get('authRPCCount') if worker else None,
            'ramComparisonPerformed':False,'threeRPCPlateauClaimed':False,
            'ownershipCapture':worker.get('ownershipCapture') if worker else None,
            'ownershipHostEvidence':ownership_host_evidence,
            'ownerConclusion':'UNKNOWN_PENDING_ACTUAL_SAMPLE_ANALYSIS','kernelPeakDecomposed':False,
            'postgrestStarted':worker.get('postgrestStarted') if worker else None,
            'nodeStarted':worker.get('nodeStarted') if worker else None,'nodeHeapAndExitReceipts':node_receipts,
            'persistentDiskPGDATA':True,'noColdCacheClaim':True,'peakReset':False,
            'nativeQualification':'ACTUAL' if passed else 'FAILED_OR_INCOMPLETE',
            'full500':False,'production':False,'providerCalls':0,'automaticRetry':False}
        result_pin=C.save(case,'ACTUAL_RESULT.SAFE.json',result)
        candidates=[]
        if cid:
            candidates.append({'kind':'container','role':'control-cache-probe-worker','id':cid,'name':name})
        for role in ('holder','setter'):
            p=case/'native-budget-setup'/(role.upper()+'_CREATED.SAFE.json')
            if p.exists():
                entry=json.loads(p.read_text())
                candidates.append({'kind':'container','role':role,'id':entry['id'],'name':entry['name']})
        proofs={}
        for label in ('SOURCE_BEFORE_FULL_MANIFEST.PRIVATE.json','SOURCE_AFTER_FULL_MANIFEST.PRIVATE.json',
                      'WORKER_RESULT.SAFE.json','PG_LOG.SAFE.json','OFFLINE_AFTER.CAPTURE.SAFE.json',
                      'PG_LOG.PRIVATE.txt','NATIVE_TIMELINE.SAFE.json','CONTROL_CACHE.SAFE.json',
                      'POSTGREST_STOP.SAFE.json','POSTGREST_LOG.PRIVATE.txt','NODE_CONTROL.CAPTURE.SAFE.json',
                      'OWNERSHIP_CAPTURE.SAFE.json','OWNERSHIP.PRIVATE.jsonl'):
            p=case/label
            if p.exists():
                proofs[label]=C.pin(p)
        C.save(case,'RETIREMENT_CANDIDATES.SAFE.json',{
            'schema':'helmut-control-cache-retirement-candidates/1','case':str(case),
            'parent':parent,'containers':candidates,'freshDerivedPGDATAPath':str(case/'disk/pgdata'),
            'measurementMode':mode,'variant':selected['variant'],'selection':selected,'lifecycleResultPin':lifecycle,
            'sourceProofExitLogAndPlanPins':proofs,'resultPin':result_pin,
            'resourcesStopped':bool(closure and closure['allOwnedWorkloadExited'] and final_budget
                                    and final_budget['setupHelpersExited']),
            'namespacesEmpty':bool(final_kernel and final_kernel['fullLastProcessExitCovered']
                                   and not final_kernel['populatedSubgroups']),
            'workingCopyLifecycle':prepared_value['derivedPGDATAClassification'],
            'actualPASSObserved':passed,
            'eligibleForDeletion':False,'completeVerifiedBackup':False,'rootRetirementReview':False,
            'requiredBeforeDeletion':'actual PASS, complete retained measurement/integrity/full restoration/process closure evidence, then separate Root dependency/unknown-use review and exact-target adoption; FAIL/UNKNOWN retained',
            'fullPhysicalWALArchiveAlwaysRequired':False,
            'backupFieldMeaning':'not performed here; separate Root determines any necessary artifact preservation',
            'protectedOriginalPaths':[str(C.SOURCE),str(C.RUNTIME),str(C.BINDINGS),
                str(jit_plan['archive']['path']) if 'jit_plan' in locals() else None,
                str(jit_plan['rootManifest']['path']) if 'jit_plan' in locals() else None],
            'imagesVolumesLoopsAndOldContainersProtected':True,'deletionExecuted':False,
            'automaticCleanup':False,'production':False})
        print(json.dumps({'status':result['status'],'parent':parent,'forcedStop':forced}))
    return 0 if passed else 1

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='action',required=True)
    pre=sub.add_parser('prepare')
    pre.add_argument('--case',type=Path,required=True)
    pre.add_argument('--measurement',choices=('lifecycle-only','control-cache'),required=True)
    pre.add_argument('--lifecycle-result',type=Path)
    pre.add_argument('--variant',choices=('NONE','NEW'),required=True)
    sub.add_parser('start').add_argument('--root-adoption',type=Path,required=True)
    args=p.parse_args()
    if args.action=='prepare':
        prepare(args.case,args.measurement,args.lifecycle_result,args.variant)
        return 0
    return start(args.root_adoption)

if __name__=='__main__':
    raise SystemExit(main())

