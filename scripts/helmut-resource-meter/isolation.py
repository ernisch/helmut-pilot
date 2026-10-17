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
# A NEW explicit user authorization, never a reset/replay of the consumed GO.
# Fixed globally for this authorization, NOT selected per case/environment.
ONCE=Path('/workspace/helmut-parallel-20261015/wave19-resource-meter/DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json')
SETUP_RESERVATION=ONCE.with_name('DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json')

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
    for p in acceptance['sourcePins']:
        b=Path(p['path']).read_bytes()
        if len(b)!=p['bytes'] or hashlib.sha256(b).hexdigest()!=p['sha256']:raise RuntimeError('accepted meter source drift')
    if acceptance.get('fixtureConnectionPin')!=recipe['fixtureConnectionPin']:raise RuntimeError('unaccepted full500 fixture connection')
    if acceptance.get('recipeTemplatePin')!=recipe.get('recipeTemplatePin'):raise RuntimeError('unaccepted recipe template')
    template=pin_json(recipe['recipeTemplatePin'])
    if any(recipe.get(k)!=v for k,v in template.items()):raise RuntimeError('serialized recipe changed an accepted template field')
    added={'sourcePins','independentMeterAcceptance','freshStartPreflight','recipeTemplatePin','setupReservation','databaseContainer','databaseStopFile','databaseFinalFile'}
    if set(recipe)-set(template)-added:raise RuntimeError('unreviewed recipe extension')
    reservation=pin_json(recipe['setupReservation'])
    if recipe['setupReservation']['path']!=str(SETUP_RESERVATION) or reservation.get('schema')!='helmut-local-resource-setup-reservation/1' or any(reservation.get(k)!=recipe[k] for k in ['fixtureConnectionPin','recipeTemplatePin','independentMeterAcceptance','freshOwnerGO']):
        raise RuntimeError('exact global setup reservation missing')
    integrated=acceptance['fullConnectionReviews']
    if set(integrated)!=set(['authority','bootstrap','coverage']):raise RuntimeError('all three independent connection scopes required')
    for scope,pins in integrated.items():
        pins=pins if isinstance(pins,list) else [pins]
        if len(pins)!={'authority':1,'bootstrap':1,'coverage':2}[scope]:raise RuntimeError('complete scoped connection reviews required')
        for p in pins:
            integration=pin_json(p)
            if integration.get('model')!='deepseek-v4-pro' or integration.get('route',{}).get('effort')!='high' or integration.get('payload',{}).get('summary',{}).get('status')!='ok':
                raise RuntimeError('independent complete500 connection acceptance missing')
    connection=pin_json(recipe['fixtureConnectionPin'])
    verify_connection_files(connection)
    if connection.get('schema')!='helmut-pinned-full500-connection/1' or connection.get('day')!='2026-10-17' or connection.get('production') is not False:
        raise RuntimeError('exact local current500 connection missing')
    owner=pin_json(recipe['freshOwnerGO'])
    repair=pin_json(connection['sourceCapture'])
    if owner.get('authorizationId')!='USER_GO_20261017_EXACT_ONE_DAY16_CORRECTION_AND_RESOURCE_RUN_V1' or repair.get('freshOwnerGO')!=recipe['freshOwnerGO']:
        raise RuntimeError('new exact zero-day/resource authorization missing')
    pin_json(owner['previousConsumedClaimPin']);pin_json(owner['previousSetupReservationPin'])
    corrected=pin_json(repair['correctionReceiptPin'])
    if corrected.get('pass')is not True or corrected.get('freshOwnerGO')!=recipe['freshOwnerGO'] or corrected.get('historicalDaysAdded')!=['2026-10-16'] or corrected.get('correctionWrites')!=1:
        raise RuntimeError('independently bound input correction missing')
    if owner.get('schema')!='helmut-owner-local-fixture-go/1' or owner.get('production') is not False or owner.get('syntheticProfiles')!=500:
        raise RuntimeError('fresh local owner GO missing')
    if '/wave19-resource-meter/' not in recipe['freshOwnerGO']['path'] or recipe.get('full500Attempts')!=1:
        raise RuntimeError('historical GO or non-single attempt prohibited')
    if owner.get('targetDatabase')!=connection['targetDatabase'] or recipe['expectedFreshOperationId']!=connection['operationId']:
        raise RuntimeError('GO/connection/operation binding mismatch')
    preflight=pin_json(recipe['freshStartPreflight'])
    if any(preflight.get(k)!=recipe[k] for k in ['freshOwnerGO','independentMeterAcceptance']) or preflight.get('connectionPin')!=recipe['fixtureConnectionPin']:
        raise RuntimeError('fresh preflight authority binding mismatch')
    if preflight.get('status')!='PASS_EXACT_UNUSED_LOCAL500_RESOURCE_START':raise RuntimeError('fresh exact start preflight missing')
    if not 0<=time.time()-preflight['checkedAtUnixSeconds']<=60:raise RuntimeError('start preflight no longer fresh')
    if preflight.get('sufficientSameUTCAndBerlinDayWindow') is not True:raise RuntimeError('same-day time window not demonstrated')
    now=datetime.now(timezone.utc);end=datetime.fromisoformat(preflight['windowEndsAtUTC'].replace('Z','+00:00'))
    if now.date()!=end.date() or now.astimezone(ZoneInfo('Europe/Berlin')).date()!=end.astimezone(ZoneInfo('Europe/Berlin')).date():
        raise RuntimeError('same UTC and Berlin day required')
    # Only the exact independently reviewed day17 proposal may qualify this
    # connection. A caller-supplied day/version alone grants no authority.
    day=pin_json(recipe['dayBindingAcceptance'])
    if acceptance.get('dayBindingAcceptance')!=recipe['dayBindingAcceptance'] or day.get('status')!='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER':
        raise RuntimeError('independently adopted exact current-day binding missing')
    if day.get('day')!='2026-10-17' or now.strftime('%Y-%m-%d')!=day['day'] or now.astimezone(ZoneInfo('Europe/Berlin')).strftime('%Y-%m-%d')!=day['day']:
        raise RuntimeError('actual UTC/Berlin day outside reviewed binding')
    independent=pin_json(day['independentReview'])
    if independent.get('model')!='deepseek-v4-pro' or independent.get('route',{}).get('effort')!='high' or independent.get('payload',{}).get('summary',{}).get('status')!='ok':
        raise RuntimeError('current-day independent semantic acceptance missing')
    if now<datetime.fromisoformat(day['startsAtUTC'].replace('Z','+00:00')) or end>datetime.fromisoformat(day['endsAtUTC'].replace('Z','+00:00')):
        raise RuntimeError('actual run window outside independent current-day scope')
    if (end-now).total_seconds()*1000 < 8089543.088:
        raise RuntimeError('remaining same-day window shorter than actual last complete workflow')

def claim_full_attempt(recipe,cid,recipe_path):
    verify_full_authority(recipe)
    # One GLOBAL marker, not one marker per output directory. Never delete it.
    K.save_new(ONCE,{'schema':'helmut-local-resource-attempt-claim/1',
        'freshOwnerGO':recipe['freshOwnerGO'],'independentMeterAcceptance':recipe['independentMeterAcceptance'],
        'containerId':cid,'recipeSHA256':hashlib.sha256(Path(recipe_path).read_bytes()).hexdigest(),
        'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'noAutomaticRetry':True})

def verify_connection_files(connection):
    staged=pin_json(connection['stagedHarness'])
    case=Path(connection['caseDirectory']);suffix=case.name.removeprefix('attempt-')
    if connection['targetDatabase']!='helmut_resource_fixture_20261017_'+suffix or connection['containerName']!='helmut-meter-db-w20-'+suffix or connection['operationId']!='synthetik500-resources17-'+suffix:
        raise RuntimeError('owned case/target/container/operation binding mismatch')
    if staged['caseDirectory']!=str(case):raise RuntimeError('staged case mismatch')
    for p in connection['immutableWorkflowPins']:
        actual=Path(p['path'])
        if actual.resolve()!=actual or not actual.is_relative_to(case):raise RuntimeError('noncanonical immutable workflow file')
        b=actual.read_bytes()
        if len(b)!=p['bytes'] or hashlib.sha256(b).hexdigest()!=p['sha256']:raise RuntimeError('immutable staged workflow drift')
    required=[x['staged'] for x in staged['templateDeltas']]+[staged['action']]
    expected={p['path']:p for p in connection['immutableWorkflowPins']}
    if any(expected.get(p['path'])!=p for p in required):raise RuntimeError('complete staged workflow pins missing')

def verify_final_recipe(recipe_path,cid):
    b=Path(recipe_path).read_bytes();recipe=json.loads(b)
    if recipe['scope']=='owner-approved-local500-resources':
        claim=json.loads(ONCE.read_text())
        if claim['containerId']!=cid or claim['recipeSHA256']!=hashlib.sha256(b).hexdigest():raise RuntimeError('final recipe drift after exclusive claim')
    return recipe

def container_log_counts(ids):
    rows=[]
    for cid in ids:
        r=subprocess.run(K.DOCKER+['logs',cid],capture_output=True,timeout=30)
        if r.returncode:raise RuntimeError('complete container logs unavailable')
        rows.append({'containerId':cid,'stdoutBytes':len(r.stdout),'stderrBytes':len(r.stderr),
                     'scope':'Producer stdout/stderr payload, not unknown provider serialization overhead'})
    return rows

def create_network(name,subnet=None):
    args=['network','create','--internal']
    if subnet is not None:
        # Retain the original gateway's172-only address contract. Two small
        # disjoint explicitly owned prefixes avoid Docker's exhausted default
        # address pool without touching any retained network or host routes.
        if subnet not in ['172.16.249.0/24','172.16.250.0/24','172.16.251.0/24']:raise RuntimeError('unreviewed local connection subnet')
        args+=['--subnet',subnet]
    K.docker(args+[name])
    data=json.loads(K.docker(['network','inspect',name]).stdout)[0]
    if not data['Internal'] or data.get('Containers'):raise RuntimeError('network not private and unused')
    return data['Id']

def infra_mounts(out):
    args=K.common_mounts(out)
    return args

def fixture_mounts(fixture,role):
    if fixture is None:return []
    if role not in ['application','database']:raise RuntimeError('fixture mount role invalid')
    case=Path(fixture['caseDirectory'])
    area=Path('/workspace/helmut-parallel-20261015/wave20-resource-integration')
    if case.parent!=area or case.resolve()!=case or case.is_symlink() or not case.is_dir() or not case.name.startswith('attempt-'):
        raise RuntimeError('exact owned local fixture directory required')
    args=[]
    pins=list(fixture['databaseReadOnlyPins'] if role=='database' else fixture['applicationReadOnlyPins'])
    if role=='application':
        args+=['--mount','type=bind,src='+str(case)+',dst='+str(case)]
        pins+=fixture.get('immutableWorkflowPins',[])
        if fixture.get('schema')=='helmut-pinned-full500-connection/1':
            verify_connection_files(fixture)
            pins+=[fixture['stagedHarness']]
            for source in [case/'FINAL_CONNECTION.SAFE.json',case/'RECIPE_TEMPLATE.PRIVATE.json']:
                b=source.read_bytes();pins.append({'path':str(source),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
    if role=='database' and (len(pins)!=1 or pins[0]['sha256']!='870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'):
        raise RuntimeError('only exact existing PostgREST binary mount allowed in database')
    for p in pins:
        source=Path(p['path'])
        if source.resolve()!=source or source.is_symlink() or not source.is_file() or any(c in str(source) for c in [',','\n','\r']):raise RuntimeError('canonical regular fixture input required')
        b=source.read_bytes()
        if len(b)!=p['bytes'] or hashlib.sha256(b).hexdigest()!=p['sha256']:raise RuntimeError('fixture mount pin drift')
        if source.name=='OWNER_LOCAL_GO.PRIVATE.json':raise RuntimeError('historical local GO excluded')
        if not source.is_relative_to(Path('/workspace/helmut-parallel-20261015')):raise RuntimeError('fixture mount outside original evidence workspace')
        destination='/tmp/helmut-unit-fixture-postgrest-03693bea' if role=='database' else str(source)
        args+=['--mount','type=bind,src='+str(source)+',dst='+destination+',readonly']
    return args

def create_database(out,name,parent,network,scope='small-meter-validation',storage=None,fixture=None):
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
    cfg={'scope':scope,'pgdata':pgdata,'stopFile':'/meter-output/STOP_DATABASE',
         'finalFile':'/meter-output/DATABASE_FINAL.SAFE.json','freshInitdbVolume':True}
    if storage:cfg['storageReadyPin']={**storage['kernelReadyReceipt'],'path':'/meter-storage-ready.SAFE.json'}
    K.save_new(out/'DATABASE_CONFIG.SAFE.json',cfg)
    args=['create','--name',name,'--network',network,'--cgroup-parent=/'+parent,
          '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
          '--env','PGDATA='+pgdata,'--env','POSTGRES_HOST_AUTH_METHOD=trust',
          '--env','PATH='+str(K.NODE_ROOT/'bin')+':'+str(K.PYTHON_ROOT/'bin')+':/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin',
          '--entrypoint',PYTHON]
    args+=infra_mounts(out)
    args+=fixture_mounts(fixture,'database')
    if storage:args+=['--mount','type=bind,src='+storage['kernelReadyReceipt']['path']+',dst=/meter-storage-ready.SAFE.json,readonly']
    args+=[K.IMAGE,str(BIN/'database-supervisor.py'),'/meter-output/DATABASE_CONFIG.SAFE.json']
    cid=K.docker(args).stdout.strip();K.docker(['start',cid])
    ready=False
    for _ in range(150):
        result=K.docker(['exec','-u','postgres',name,'pg_isready','-q'],check=False)
        # pg_isready alone can see the temporary initdb bootstrap server.
        # The direct entrypoint child becomes postgres only at its final exec.
        final=K.docker(['exec',name,PYTHON,'-c',"from pathlib import Path;p=Path('/meter-output/DB_SUPERVISOR_READY');n=int(p.read_text());print(Path('/proc',str(n),'comm').read_text().strip())"],check=False)
        if result.returncode==0 and final.stdout.strip()=='postgres':ready=True;break
        state=K.docker(['inspect','--format','{{.State.Running}}',name]).stdout.strip()
        if state!='true':break
        time.sleep(.1)
    if not ready:
        raise RuntimeError('traced owned PG server not ready; no application attempt')
    result={'name':name,'containerId':cid,'parent':parent,'network':network,'volume':volume,'fixture':fixture,
            'ownedContainerNames':[name],
            'out':str(out),'scope':scope,'storage':storage,'publishedPorts':False,'originalDatabasesTouched':False}
    K.save_new(out/'DATABASE_FACTORY_READY.SAFE.json',result)
    return result

def launch_application(out,name,parent,network,recipe,database=None):
    if recipe['scope']=='owner-approved-local500-resources':
        verify_full_authority(recipe)
        if not database or not database.get('storage'):raise RuntimeError('actual bounded owned database required')
        connection=pin_json(recipe['fixtureConnectionPin'])
        if database.get('fixture')!=connection or database.get('name')!=connection['containerName'] or database.get('network')!=network:
            raise RuntimeError('actual database fixture differs from accepted exact connection')
        actual_id=K.docker(['inspect','--format','{{.Id}}',database['name']]).stdout.strip()
        if database.get('containerId')!=actual_id or pin_json(recipe['freshStartPreflight']).get('actualEmptyDBContainerId')!=actual_id:
            raise RuntimeError('actual owned database ID differs from fresh preflight')
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
    args+=['--mount','type=bind,src='+str(out/'RECIPE.PRIVATE.json')+',dst=/meter-output/RECIPE.PRIVATE.json,readonly']
    args+=fixture_mounts(database.get('fixture') if database else None,'application')
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
    recipe=verify_final_recipe(out/'RECIPE.PRIVATE.json',application['containerId'])
    file_logs=[]
    log_roots=[out]+([Path(db['out'])] if db else [])
    if db and db.get('fixture'):
        # One disjoint case root includes assembly errors, structured phase
        # JSONL, application/DB/gateway logs. Never count the same file twice.
        log_roots=[Path(db['fixture']['caseDirectory'])]
    for directory in log_roots:
        for p in directory.rglob('*'):
            is_log=p.suffix in ['.log','.jsonl'] or p.name.endswith(('_FAILURE.PRIVATE.txt','_ERROR.PRIVATE.txt'))
            if is_log and p.is_file():file_logs.append({'role':'database' if db and p.is_relative_to(Path(db['out'])) else 'application-or-workflow',
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
    if recipe['scope']=='owner-approved-local500-resources':
        original_path=Path(recipe['originalSequenceResultPath'])
        original=json.loads(original_path.read_text()) if original_path.exists() else {}
        assembled_path=Path(recipe['assemblyResultPath'])
        assembled=json.loads(assembled_path.read_text()) if assembled_path.exists() else {}
        if original.get('pass') is not True or original.get('all500FinalACK') is not True or original.get('mode')!='combined500' or original.get('selector')!=assembled.get('selector') or original.get('selector',{}).get('operationId')!=recipe['expectedFreshOperationId'] or assembled.get('pass') is not True:
            result['pass']=False;result['originalWorkflowAcceptanceMissing']=True
        else:
            result['originalAll500FinalACK']=True
            result['actualFreshSelector']=original['selector']
            result['actualSelectorBoundThroughOriginalAssemblyAndInstall']=True
        result['simultaneousAllOwnedUnder2048DecimalMB']=bool(result['simultaneousApplicationAndInfrastructureKernel'] and result['simultaneousApplicationAndInfrastructureKernel']['memoryPeakBytes']<2048000000)
    K.save_new(out/'COMPLETE_RESOURCE_RESULT.SAFE.json',result)
    return result
