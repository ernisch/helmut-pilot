#!/usr/bin/env python3
"""Owned local infrastructure factory and final independent kernel readback.

Never invokes a Helmut recipe automatically. No published ports, no host PID
namespace, no privileged container, no cgroup writes and no existing-service
restart. All diagnostic containers/volumes/evidence are retained after exit.
"""
import importlib.util
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo

spec=importlib.util.spec_from_file_location('kernel_meter',Path(__file__).with_name('kernel-meter.py'))
K=importlib.util.module_from_spec(spec);spec.loader.exec_module(K)
PYTHON=str(K.PYTHON_ROOT/'bin/python')
BIN=K.REPOSITORY/'scripts/helmut-resource-meter'
ONCE=Path('/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json')

def inspect_private_network(name):
    data=json.loads(K.docker(['network','inspect',name]).stdout)[0]
    if not data['Internal'] or not name.startswith('helmut-meter-net-'):
        raise RuntimeError('requires a private dedicated internal network')
    return data

def pin_json(pin):
    p=Path(pin['path'])
    if p.is_symlink():raise RuntimeError('symlink pin rejected')
    b=p.read_bytes()
    if len(b)!=pin['bytes'] or hashlib.sha256(b).hexdigest()!=pin['sha256']:
        raise RuntimeError('final meter acceptance/input drift')
    return json.loads(b)

def verify_full_authority(recipe):
    acceptance=pin_json(recipe['independentMeterAcceptance'])
    if acceptance.get('status')!='ROOT_ADOPTED_INDEPENDENT_COMPLETE_METER_ACCEPTANCE':
        raise RuntimeError('independent complete meter acceptance missing')
    reviews=acceptance['independentReviews']
    if set(reviews)!=set(['process','storage','network','wal']):raise RuntimeError('all four independent review scopes required')
    for scope,pins in reviews.items():
        pins=pins if isinstance(pins,list) else [pins]
        if len(pins)!=({'process':1,'wal':1,'network':2,'storage':2}[scope]):raise RuntimeError('complete bounded scope reviews required')
        for pin in pins:
            review=pin_json(pin)
            if review.get('model')!='deepseek-v4-pro' or review.get('payload',{}).get('summary',{}).get('status')!='ok' or review.get('route',{}).get('effort')!='high':
                raise RuntimeError('actual independent Pro High ok review missing')
    expected={p['path']:p for p in acceptance['sourcePins']}
    if {p['path'] for p in recipe['sourcePins']}!=set(expected):raise RuntimeError('complete accepted source set required')
    for p in recipe['sourcePins']:
        if p['path'] not in expected or p!=expected[p['path']]:raise RuntimeError('unaccepted resource source')
        pin_json(p) if p['path'].endswith('.json') else None
    for p in acceptance['sourcePins']:
        b=Path(p['path']).read_bytes()
        if len(b)!=p['bytes'] or hashlib.sha256(b).hexdigest()!=p['sha256']:raise RuntimeError('accepted meter source drift')
    owner=pin_json(recipe['freshOwnerGO'])
    if owner.get('schema')!='helmut-owner-local-fixture-go/1' or owner.get('production') is not False or owner.get('syntheticProfiles')!=500:
        raise RuntimeError('fresh local owner GO missing')
    if '/wave19-resource-meter/' not in recipe['freshOwnerGO']['path'] or recipe.get('full500Attempts')!=1:
        raise RuntimeError('historical GO or non-single attempt prohibited')
    preflight=pin_json(recipe['freshStartPreflight'])
    if preflight.get('status')!='PASS_EXACT_UNUSED_LOCAL500_RESOURCE_START':raise RuntimeError('fresh exact start preflight missing')
    if not 0<=time.time()-preflight['checkedAtUnixSeconds']<=60:raise RuntimeError('start preflight no longer fresh')
    if preflight.get('sufficientSameUTCAndBerlinDayWindow') is not True:raise RuntimeError('same-day time window not demonstrated')
    now=datetime.now(timezone.utc);end=datetime.fromisoformat(preflight['windowEndsAtUTC'].replace('Z','+00:00'))
    if now.date()!=end.date() or now.astimezone(ZoneInfo('Europe/Berlin')).date()!=end.astimezone(ZoneInfo('Europe/Berlin')).date():
        raise RuntimeError('same UTC and Berlin day required')
    # The currently retained fixture has an explicit16Oct qualification. A
    # later day needs an independently reviewed fresh day binding, never a
    # silent redatestamp. This does not create a new owner-GO requirement.
    if now.strftime('%Y-%m-%d')!='2026-10-16':raise RuntimeError('retained fixture day binding expired')
    if (end-now).total_seconds()*1000 < 8089543.088:
        raise RuntimeError('remaining same-day window shorter than actual last complete workflow')

def claim_full_attempt(recipe,cid,recipe_path):
    verify_full_authority(recipe)
    # One GLOBAL marker, not one marker per output directory. Never delete it.
    K.save_new(ONCE,{'schema':'helmut-local-resource-attempt-claim/1',
        'freshOwnerGO':recipe['freshOwnerGO'],'independentMeterAcceptance':recipe['independentMeterAcceptance'],
        'containerId':cid,'recipeSHA256':hashlib.sha256(Path(recipe_path).read_bytes()).hexdigest(),
        'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'noAutomaticRetry':True})

def container_log_counts(ids):
    rows=[]
    for cid in ids:
        r=K.docker(['logs',cid],check=False)
        if r.returncode:raise RuntimeError('complete container logs unavailable')
        rows.append({'containerId':cid,'stdoutBytes':len(r.stdout.encode()),'stderrBytes':len(r.stderr.encode()),
                     'scope':'Producer stdout/stderr payload, not unknown provider serialization overhead'})
    return rows

def create_network(name):
    K.docker(['network','create','--internal',name])
    data=json.loads(K.docker(['network','inspect',name]).stdout)[0]
    if not data['Internal'] or data.get('Containers'):raise RuntimeError('network not private and unused')
    return data['Id']

def infra_mounts(out):
    args=K.common_mounts(out)
    return args

def create_database(out,name,parent,network,scope='small-meter-validation',storage=None):
    if not storage:raise RuntimeError('native meter requires actual owned bounded filesystem')
    if scope=='owner-approved-local500-resources' and storage['bytes']!=8000000000:raise RuntimeError('full prepared local plan requires exact8GB owned device')
    fs=os.statvfs('/workspace')
    if fs.f_bavail*fs.f_frsize<4*1024**3:
        raise RuntimeError('shared workspace has less than4GiB free; preserve originals and do not create more fixture layers')
    inspect_private_network(network)
    out=Path(out).resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
    K.save_new(out/'DATABASE_FACTORY_STARTED.SAFE.json',{'scope':scope,'name':name,'parent':parent,'originalDatabasesTouched':False})
    K.initialize_parent(parent,name+'-group-init')
    volume=storage['volume']
    if K.docker(['inspect','--format','{{.State.Running}}',storage['containerId']]).stdout.strip()!='true':
        raise RuntimeError('owned storage holder not live')
    K.save_new(Path(storage['out'])/'DATABASE_INITIALIZATION_STARTED.SAFE.json',{'container':name,'volume':volume,'oneInitializationOnly':True,'full500RunAuthority':False})
    pgdata='/var/lib/postgresql/data/pgdata'
    initialize=name+'-initialization'
    K.docker(['create','--name',initialize,'--network',network,'--cgroup-parent=/'+parent,
              '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
              '--env','PGDATA='+pgdata,
              '--env','POSTGRES_HOST_AUTH_METHOD=trust',K.IMAGE])
    K.docker(['start',initialize])
    ready=False
    for _ in range(100):
        result=K.docker(['exec','-u','postgres',initialize,'pg_isready','-q'],check=False)
        main=K.docker(['exec',initialize,'cat','/proc/1/comm'],check=False)
        if result.returncode==0 and main.stdout.strip()=='postgres':ready=True;break
        time.sleep(.1)
    if not ready:raise RuntimeError('owned empty PG bootstrap not ready; retain state')
    # Initialization is an isolated meter fixture, not any original database.
    K.docker(['stop','--time','40',initialize],timeout=45)
    if K.docker(['inspect','--format','{{.State.ExitCode}}',initialize]).stdout.strip()!='0':
        raise RuntimeError('empty PG initialization did not shut down cleanly; no measured run')
    cfg={'scope':scope,'pgdata':pgdata,'stopFile':'/meter-output/STOP_DATABASE',
         'finalFile':'/meter-output/DATABASE_FINAL.SAFE.json','freshInitdbVolume':True}
    if storage:cfg['storageReadyPin']={**storage['kernelReadyReceipt'],'path':'/meter-storage-ready.SAFE.json'}
    K.save_new(out/'DATABASE_CONFIG.SAFE.json',cfg)
    args=['create','--name',name,'--network',network,'--cgroup-parent=/'+parent,
          '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
          '--env','PATH='+str(K.NODE_ROOT/'bin')+':'+str(K.PYTHON_ROOT/'bin')+':/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin',
          '--entrypoint',PYTHON]
    args+=infra_mounts(out)
    if storage:args+=['--mount','type=bind,src='+storage['kernelReadyReceipt']['path']+',dst=/meter-storage-ready.SAFE.json,readonly']
    args+=[K.IMAGE,str(BIN/'database-supervisor.py'),'/meter-output/DATABASE_CONFIG.SAFE.json']
    cid=K.docker(args).stdout.strip();K.docker(['start',cid])
    ready=False
    for _ in range(150):
        result=K.docker(['exec','-u','postgres',name,'pg_isready','-q'],check=False)
        if result.returncode==0:ready=True;break
        state=K.docker(['inspect','--format','{{.State.Running}}',name]).stdout.strip()
        if state!='true':break
        time.sleep(.1)
    if not ready:
        raise RuntimeError('traced owned PG server not ready; no application attempt')
    result={'name':name,'containerId':cid,'parent':parent,'network':network,'volume':volume,
            'ownedContainerNames':[initialize,name],
            'out':str(out),'scope':scope,'storage':storage,'publishedPorts':False,'originalDatabasesTouched':False}
    K.save_new(out/'DATABASE_FACTORY_READY.SAFE.json',result)
    return result

def launch_application(out,name,parent,network,recipe,database=None):
    if recipe['scope']=='owner-approved-local500-resources':
        verify_full_authority(recipe)
        if not database or not database.get('storage'):raise RuntimeError('actual bounded owned database required')
    inspect_private_network(network)
    out=Path(out).resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
    (out/'http').mkdir(mode=0o700)
    (out/'bin').mkdir(mode=0o700)
    shim=out/'bin/node';shim.write_text('#!/bin/sh\nexec '+str(K.NODE_ROOT/'bin/node')+' --require='+str(BIN/'http-meter.js')+' "$@"\n');shim.chmod(0o700)
    K.initialize_parent(parent,name+'-group-init')
    recipe=dict(recipe)
    broker=None
    if database:
        recipe.update(databaseContainer=database['name'],databaseStopFile='/meter-database/STOP_DATABASE',
                      databaseFinalFile='/meter-database/DATABASE_FINAL.SAFE.json')
        broker_out=out/'broker';broker_out.mkdir(mode=0o700)
        config={'output':'/meter-output','containerName':database['name'],
                'containerId':database['containerId'],
                'postgrestBinary':'/tmp/helmut-unit-fixture-postgrest-03693bea',
                'postgrestConfig':'/tmp/helmut-resource-fixture.conf'}
        K.save_new(broker_out/'CONFIG.PRIVATE.json',config)
        broker_name=name+'-broker'
        args=['create','--name',broker_name,'--network','none','--cgroup-parent=/'+parent,
              '--cap-drop','ALL','--security-opt','no-new-privileges',
              '--user',str(os.getuid())+':'+str(os.getgid()),
              '--group-add',str(Path('/var/run/docker.sock').stat().st_gid),
              '--entrypoint',PYTHON]
        args+=K.common_mounts(broker_out)
        args+=['--mount','type=bind,src=/usr/local/bin/docker,dst=/usr/local/bin/docker,readonly',
               '--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
               K.IMAGE,str(BIN/'docker-broker.py'),'server','/meter-output/CONFIG.PRIVATE.json']
        broker_id=K.docker(args).stdout.strip();K.docker(['start',broker_id])
        for _ in range(100):
            if (broker_out/'socket').exists():break
            time.sleep(.05)
        if not (broker_out/'socket').exists():raise RuntimeError('owned restricted broker not ready')
        broker={'name':broker_name,'containerId':broker_id,'out':str(broker_out)}
        shim=out/'bin/docker';shim.write_text('#!/bin/sh\nexec '+PYTHON+' '+str(BIN/'docker-broker.py')+' client "$@"\n');shim.chmod(0o700)
    K.save_new(out/'RECIPE.PRIVATE.json',recipe)
    # Only the narrow RPC client is mounted. No daemon socket or CLI in app/DB.
    args=['create','--name',name,'--network',network,'--cgroup-parent=/'+parent,
          '--cap-drop','ALL','--security-opt','no-new-privileges',
          '--user',str(os.getuid())+':'+str(os.getgid()),
          '--env','PATH=/meter-output/bin:'+str(K.PYTHON_ROOT/'bin')+':'+str(K.NODE_ROOT/'bin')+':/usr/local/bin:/usr/bin:/bin',
          '--entrypoint',PYTHON]
    args+=infra_mounts(out)
    if database:args+=['--mount','type=bind,src='+database['out']+',dst=/meter-database']
    if broker:args+=['--mount','type=bind,src='+broker['out']+',dst=/meter-broker,readonly']
    if recipe['scope']=='owner-approved-local500-resources':
        args+=['--mount','type=bind,src='+str(ONCE.parent)+',dst='+str(ONCE.parent)+',readonly']
    args+=[K.IMAGE,str(BIN/'process-runner.py'),'/meter-output/RECIPE.PRIVATE.json']
    cid=K.docker(args).stdout.strip()
    if recipe['scope']=='owner-approved-local500-resources':claim_full_attempt(recipe,cid,out/'RECIPE.PRIVATE.json')
    K.docker(['start',cid])
    return {'out':str(out),'name':name,'containerId':cid,'parent':parent,'database':database,
            'broker':broker,'ownedContainerNames':[name]+([broker['name']] if broker else [])}

def finalize(application,timeout=180):
    code=int(K.docker(['wait',application['containerId']],timeout=timeout).stdout.strip())
    broker_final=None
    if application.get('broker'):
        broker=application['broker'];Path(broker['out'],'STOP').write_text('OWNED_RUNNER_EXITED\n')
        broker_code=int(K.docker(['wait',broker['containerId']],timeout=30).stdout.strip())
        broker_final=json.loads(Path(broker['out'],'BROKER_FINAL.SAFE.json').read_text())
        if broker_code!=0 or not broker_final['complete']:raise RuntimeError('complete broker exit not confirmed')
    app_kernel=K.kernel_snapshot(application['parent'],require_empty=True)
    db=application['database'];db_kernel=None;db_code=None
    if db:
        db_code=int(K.docker(['wait',db['containerId']],timeout=60).stdout.strip())
        db_kernel=K.kernel_snapshot(db['parent'],require_empty=True)
    storage=db.get('storage') if db else None;storage_final=None;storage_kernel=None
    if storage:
        spec=importlib.util.spec_from_file_location('bounded_storage',BIN/'bounded-storage.py')
        bounded=importlib.util.module_from_spec(spec);spec.loader.exec_module(bounded)
        storage_final=bounded.finish(storage)
        storage_kernel=K.kernel_snapshot(storage['parent'],require_empty=True)
    out=Path(application['out'])
    result=json.loads((out/'RUNNER_RESULT.SAFE.json').read_text())
    db_final=json.loads((Path(db['out'])/'DATABASE_FINAL.SAFE.json').read_text()) if db else None
    owned=list(application['ownedContainerNames'])+(db['ownedContainerNames'] if db else [])+([storage['name']]+storage.get('ownedAuxiliaryContainerNames',[]) if storage else [])
    expected_ids=set(K.docker(['inspect','--format','{{.Id}}',*owned]).stdout.split())
    common_parent=None
    if db and application['parent'].rsplit('/',1)[0]==db['parent'].rsplit('/',1)[0]:
        common_parent=application['parent'].rsplit('/',1)[0]
    parents={'/'+common_parent} if common_parent else ({'/'+application['parent']}|({'/'+db['parent']} if db else set()))
    all_ids=K.docker(['ps','--all','--quiet']).stdout.split()
    if all_ids:
        topology=K.docker(['inspect','--format','{{.Id}}|{{.HostConfig.CgroupParent}}',*all_ids]).stdout.splitlines()
        for line in topology:
            cid,parent=line.split('|',1)
            if any(parent==p or parent.startswith(p+'/') for p in parents) and cid not in expected_ids:
                raise RuntimeError('foreign container found in dedicated measurement parent')
    logs=container_log_counts(owned)
    file_logs=[]
    for directory in [out]+([Path(db['out'])] if db else []):
        for p in directory.rglob('*.log'):
            if p.is_file():file_logs.append({'role':'database' if db and directory==Path(db['out']) else 'application',
                'relativeName':str(p.relative_to(directory)),'bytes':p.stat().st_size})
    result={'schema':'helmut-isolated-resource-final/1','application':result,
            'applicationExitCode':code,'applicationKernelAfterLastExit':app_kernel,
            'databaseExitCode':db_code,'databaseKernelAfterLastExit':db_kernel,
            'databaseFinal':db_final,'kernelCountersIncludeAllContainerDescendantsAndThreads':True,
            'restrictedDockerBroker':broker_final,
            'ownedBoundedStorageFinal':storage_final,'storageHolderKernelAfterExit':storage_kernel,
            'simultaneousApplicationAndInfrastructureKernel':K.kernel_snapshot(common_parent,require_empty=True) if common_parent else None,
            'noForeignContainerInApplicationParent':True,'ownedContainerIDsVerified':sorted(expected_ids),
            'containerProducerLogs':logs,'retainedPrivateLogFiles':file_logs,
            'logPayloadBytes':sum(x['stdoutBytes']+x['stderrBytes'] for x in logs)+sum(x['bytes'] for x in file_logs),
            'providerLogSerializationOverheadNotAssumedZero':True,
            'thresholdApplicationAndRunnerBytes':2048000000,
            'underUnchangedApplicationMemoryLimit':app_kernel['memoryPeakBytes']<2048000000,
            'databaseInfrastructureReportedSeparatelyAsExistingContractRequires':True,
            'allInvolvedContainersRetained':True,'paidProviderCountMustComeFromOriginalRuntimeReceipts':True,'production':False}
    first_snapshot=result['application']['firstNativeDatabaseSnapshotBeforeAnyStage']
    if db and first_snapshot and db_final.get('endOfWALUpperLSNBytes'):
        first=first_snapshot['walLSN']
        high,low=first.split('/');start_lsn=(int(high,16)<<32)+int(low,16)
        upper=int(db_final['endOfWALUpperLSNBytes'])-start_lsn
        if upper<0:raise RuntimeError('WAL timeline regressed')
        result['WALSinceApplicationBaselineConservativeUpperBytes']=str(upper)
        if not db_final.get('freshInitdbVolume'):raise RuntimeError('whole infrastructure WAL baseline not established')
        # Fresh initdb starts in nonnegative LSN space. Zero is a strict lower
        # bound, not an estimate of first record position: this includes startup,
        # fixture setup and initial LSN padding, explicitly as an upper bound.
        result['completeWALGenerationConservativeUpperBytes']=db_final['endOfWALUpperLSNBytes']
        result['completeWALUpperIncludesFreshInitdbAndInitialLSNPadding']=True
        result['WALUpperIncludesNormalServerShutdownNotJustLastLiveSample']=True
    result['pass']=bool(code==0 and result['application']['pass'] and
                    result['underUnchangedApplicationMemoryLimit'] and
                    app_kernel['memoryEvents']['oom_kill']==0 and
                    (not db or (db_code==0 and bool(db_final.get('storageBound',{}).get('provenUpperBytes')))))
    recipe=json.loads((out/'RECIPE.PRIVATE.json').read_text())
    if recipe['scope']=='owner-approved-local500-resources':
        original_path=Path(recipe['originalSequenceResultPath'])
        original=json.loads(original_path.read_text()) if original_path.exists() else {}
        if original.get('pass') is not True or original.get('all500FinalACK') is not True or original.get('mode')!='combined500' or original.get('selector')!=recipe['expectedFreshSelector']:
            result['pass']=False;result['originalWorkflowAcceptanceMissing']=True
        else:result['originalAll500FinalACK']=True
    K.save_new(out/'COMPLETE_RESOURCE_RESULT.SAFE.json',result)
    return result
