#!/usr/bin/env python3
"""Owned local infrastructure factory and final independent kernel readback.

Never invokes a Helmut recipe automatically. No published ports, no host PID
namespace, no privileged container and no existing-service
restart. All diagnostic containers/volumes/evidence are retained after exit.
"""
import importlib.util
import hashlib
import json
import os
import sys
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
_spec=importlib.util.spec_from_file_location('next_resource_authority',BIN/'next-resource-authority.py')
A=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(A)
_cal_spec=importlib.util.spec_from_file_location('isolation_calendar_binding',BIN/'local-calendar-binding.py')
Calendar=importlib.util.module_from_spec(_cal_spec);_cal_spec.loader.exec_module(Calendar)
_budget_spec=importlib.util.spec_from_file_location('isolation_native_budget',BIN/'native-memory-budget.py')
N=importlib.util.module_from_spec(_budget_spec);_budget_spec.loader.exec_module(N)
ONCE=A.CLAIM
SETUP_RESERVATION=A.RESERVATION

def local_postgrest_module():
    spec=importlib.util.spec_from_file_location('local_postgrest_backend',BIN/'local-postgrest-owner.py')
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

def local_postgrest_plan(fixture):
    if fixture is None or 'localPostgrestBackendPlanPin' not in fixture:return None
    plan=local_postgrest_module().read_backend_plan(fixture['localPostgrestBackendPlanPin'],
        case_directory=fixture['caseDirectory'],target_database=fixture['targetDatabase'],operation_id=fixture['operationId'])
    if (fixture.get('schema')!='helmut-pinned-full500-connection/1' or fixture.get('production')is not False
        or plan['day']!=A.DAY or plan['resourceClaimPath']!=str(ONCE) or plan['ownerGoPin']!=fixture['freshOwnerGO']):
        raise RuntimeError('optional owner backend differs from fixed current local authority')
    return plan

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

def verify_fixture_owner_policy(owner):
    # Assembly already requires this exact value. Reject BEFORE setup/claim;
    # never infer a missing safety declaration or repair a consumed GO.
    if owner.get('allowDispose') is not False:
        raise RuntimeError('owner GO requires explicit allowDispose=false before any setup or claim')

MINIMUM_REMAINING_MS=11285884.867

def verify_remaining_window(now,end):
    if (end-now).total_seconds()*1000 < MINIMUM_REMAINING_MS:
        raise RuntimeError('remaining same-day window lacks workflow plus600second setup/close reserve')

def verify_pre_setup_authority(recipe,*,planning=False):
    """Shared actual authority predicates that require NO created resources.

    Used before reservation AND by the original final authority check. Never
    manufacture a reservation, empty-DB receipt, CID or fresh preflight here.
    """
    # The mount builder, host precheck and container use this SAME dependency
    # closure. No separate, shorter list of "fixture assets" can qualify.
    runtime_read_manifest(recipe)
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
    added={'sourcePins','independentMeterAcceptance','freshStartPreflight','recipeTemplatePin','setupReservation','databaseContainer','databaseStopFile','databaseFinalFile','completeStartPreflight','nativeBudgetSetupPin'}
    if set(recipe)-set(template)-added:raise RuntimeError('unreviewed recipe extension')
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
    backend=local_postgrest_plan(connection)
    if backend is not None:
        expected=connection['localPostgrestBackendPlanPin']
        if recipe.get('localPostgrestBackendPlanPin')!=expected or acceptance.get('localPostgrestBackendPlanPin')!=expected:
            raise RuntimeError('owner backend needs exact recipe and independent source adoption')
        if any(p not in acceptance['sourcePins'] for p in backend['sourcePins']):
            raise RuntimeError('owner backend source absent from complete independent acceptance')
    elif 'localPostgrestBackendPlanPin' in recipe or 'localPostgrestBackendPlanPin' in acceptance:
        raise RuntimeError('owner backend cannot be selected outside exact connection')
    # This same check also runs inside the restricted application namespace:
    # validate immutable metadata here; daemon/image inspection stays on host.
    N.admit_metadata(acceptance,connection,recipe,pin_json,actual=False)
    verify_connection_files(connection)
    if connection.get('schema')!='helmut-pinned-full500-connection/1' or connection.get('day')!=A.DAY or connection.get('production') is not False:
        raise RuntimeError('exact local current500 connection missing')
    owner=pin_json(recipe['freshOwnerGO'])
    verify_fixture_owner_policy(owner)
    if not planning and (owner.get('sourceCommit')!=acceptance.get('commit')or connection.get('sourceCommit')!=acceptance.get('commit')):
        raise RuntimeError('current owner/evidence/connection source commit differs')
    A.validate_owner(owner,connection,planning=planning)
    action=pin_json(pin_json(connection['stagedHarness'])['action'])
    if action.get('authorized')is not(not planning):raise RuntimeError('pending/executable action mismatch')
    if not planning and recipe['freshOwnerGO']['path']!=owner['finalOwnerGOPath']:raise RuntimeError('actual owner GO path differs from approved fixed slot')
    A.verify_preexisting_capture(connection['sourceCapture'],actual=False)
    if not planning and (owner.get('schema')!='helmut-owner-local-fixture-go/1' or owner.get('production') is not False or owner.get('syntheticProfiles')!=500):
        raise RuntimeError('fresh local owner GO missing')
    if '/wave19-resource-meter/' not in recipe['freshOwnerGO']['path'] or recipe.get('full500Attempts')!=1:
        raise RuntimeError('historical GO or non-single attempt prohibited')
    if owner.get('targetDatabase')!=connection['targetDatabase'] or recipe['expectedFreshOperationId']!=connection['operationId']:
        raise RuntimeError('GO/connection/operation binding mismatch')
    # Only the exact independently reviewed current-day proposal may qualify this
    # connection. A caller-supplied day/version alone grants no authority.
    day=pin_json(recipe['dayBindingAcceptance'])
    descriptor=pin_json(connection['atomicUsageInput']) if connection.get('atomicUsageInput') else None
    local=Calendar.admit(day,pin_json,descriptor=descriptor,operation=connection['operationId'])
    now=datetime.now(timezone.utc);valid,start,end=Calendar.current_window(day,now=now)
    if acceptance.get('dayBindingAcceptance')!=recipe['dayBindingAcceptance'] or (local is None and day.get('status')!='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER'):
        raise RuntimeError('independently adopted exact current-day binding missing')
    if day.get('day')!=A.DAY:raise RuntimeError('actual accounting day outside reviewed binding')
    independent=pin_json(day['independentReview'])
    if independent.get('model')!='deepseek-v4-pro' or independent.get('route',{}).get('effort')!='high' or independent.get('payload',{}).get('summary',{}).get('status')!='ok':
        raise RuntimeError('current-day independent semantic acceptance missing')
    if not valid:
        raise RuntimeError('actual run window outside independent current-day scope')
    verify_remaining_window(now,end)
    return {'acceptance':acceptance,'connection':connection,'day':day}

def verify_full_authority(recipe):
    checked=verify_pre_setup_authority(recipe)
    # Every actual claim/start entrypoint requires the SAME complete pre-GO
    # proof. No caller can bypass it by calling launch_application directly.
    spec=importlib.util.spec_from_file_location('complete_pre_go_proof',BIN/'start-preflight.py')
    complete=importlib.util.module_from_spec(spec);spec.loader.exec_module(complete)
    backend=local_postgrest_plan(checked['connection'])
    if backend is not None:complete.backend_window(backend,checked['day'])
    reservation=pin_json(recipe['setupReservation'])
    if recipe['setupReservation']['path']!=str(SETUP_RESERVATION) or reservation.get('schema')!='helmut-local-resource-setup-reservation/1' or any(reservation.get(k)!=recipe[k] for k in ['fixtureConnectionPin','recipeTemplatePin','independentMeterAcceptance','freshOwnerGO','completeStartPreflight']):
        raise RuntimeError('exact global setup reservation missing')
    proof=pin_json(recipe['completeStartPreflight']);complete.assert_reserved_ready(proof,reservation)
    N.bind_setup(checked['connection'],recipe,pin_json)
    # Archive/request review documents are checked on the HOST before setup;
    # they are not workload inputs and must not be assumed mounted in the app.
    # Reuse the exact fresh, recipe-pinned Root assessment, then bind it AGAIN
    # to every currently mounted source. No arbitrary positive receipt is read
    # from a client/API. Only the controller issues this exclusive local file.
    rows=proof['consumerSourcePins']
    if not rows:raise RuntimeError('complete start proof source inventory missing')
    coverage=next(c for c in proof['checks']if c['id']=='completeIndependentCoverage')['evidence']
    if proof['consumerInventorySHA256']!=coverage['inventorySHA256']:raise RuntimeError('complete start proof inventory adoption differs')
    actual={p['path']:p for p in rows}
    required={p['path']for p in checked['acceptance']['sourcePins']if Path(p['path']).suffix in ['.js','.py']}
    if len(actual)!=len(rows) or not required<=set(actual):raise RuntimeError('complete start proof source closure incomplete')
    for p in rows:
        file=Path(p['path']);b=file.read_bytes()
        if file.resolve()!=file or file.is_symlink() or len(b)!=p['bytes']or hashlib.sha256(b).hexdigest()!=p['sha256']:
            raise RuntimeError('complete start proof actual source drift')
    for key,recipe_key in [('acceptance','independentMeterAcceptance'),('connection','fixtureConnectionPin'),('recipeTemplate','recipeTemplatePin')]:
        if proof.get('bindings',{}).get(key)!=recipe[recipe_key]:raise RuntimeError('complete start proof binding mismatch')
    if recipe['completeStartPreflight']['path']!=str(Path(checked['connection']['caseDirectory'])/'COMPLETE_START_PREFLIGHT.SAFE.json'):
        raise RuntimeError('complete start proof exact case path required')
    preflight=pin_json(recipe['freshStartPreflight'])
    if any(preflight.get(k)!=recipe[k] for k in ['freshOwnerGO','independentMeterAcceptance']) or preflight.get('connectionPin')!=recipe['fixtureConnectionPin']:
        raise RuntimeError('fresh preflight authority binding mismatch')
    if preflight.get('status')!='PASS_EXACT_UNUSED_LOCAL500_RESOURCE_START':raise RuntimeError('fresh exact start preflight missing')
    if not 0<=time.time()-preflight['checkedAtUnixSeconds']<=60:raise RuntimeError('start preflight no longer fresh')
    day=checked['day'];local=day.get('status')==Calendar.STATUS
    if local:
        if preflight.get('sufficientSameUTCFixtureWindow') is not True or preflight.get('localCalendar')!=day['localCalendar'] or 'sufficientSameUTCAndBerlinDayWindow' in preflight:
            raise RuntimeError('exact UTC fixture calendar window not demonstrated')
    elif preflight.get('sufficientSameUTCAndBerlinDayWindow') is not True:raise RuntimeError('same-day time window not demonstrated')
    now=datetime.now(timezone.utc);end=datetime.fromisoformat(preflight['windowEndsAtUTC'].replace('Z','+00:00'))
    if now.date()!=end.date() or (not local and now.astimezone(ZoneInfo('Europe/Berlin')).date()!=end.astimezone(ZoneInfo('Europe/Berlin')).date()):
        raise RuntimeError('same UTC and Berlin day required')
    Calendar.current_window(day,now=now)
    if now<datetime.fromisoformat(day['startsAtUTC'].replace('Z','+00:00')) or end>datetime.fromisoformat(day['endsAtUTC'].replace('Z','+00:00')):
        raise RuntimeError('actual run window outside independent current-day scope')
    verify_remaining_window(now,end)

def claim_full_attempt(recipe,cid,recipe_path):
    verify_full_authority(recipe)
    connection=pin_json(recipe['fixtureConnectionPin'])
    budget=N.bind_setup(connection,recipe,pin_json)
    N.verify(budget['parent'],budget)
    # One GLOBAL marker, not one marker per output directory. Never delete it.
    K.save_new(ONCE,{'schema':'helmut-local-resource-attempt-claim/1',
        'freshOwnerGO':recipe['freshOwnerGO'],'independentMeterAcceptance':recipe['independentMeterAcceptance'],
        'containerId':cid,'recipeSHA256':hashlib.sha256(Path(recipe_path).read_bytes()).hexdigest(),
        'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'noAutomaticRetry':True})

def verify_connection_files(connection):
    staged=pin_json(connection['stagedHarness'])
    case=Path(connection['caseDirectory']);suffix=case.name.removeprefix('attempt-')
    if connection['targetDatabase']!='helmut_resource_fixture_'+A.DATE_TAG+'_'+suffix or connection['containerName']!='helmut-meter-db-w20-'+suffix or connection['operationId']!='synthetik500-resources'+A.DAY[-2:]+'-'+suffix:
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
        if subnet not in [A.SUBNET,'172.16.249.0/24','172.16.250.0/24','172.16.251.0/24']:raise RuntimeError('unreviewed local connection subnet')
        args+=['--subnet',subnet]
    K.docker(args+[name])
    data=json.loads(K.docker(['network','inspect',name]).stdout)[0]
    if not data['Internal'] or data.get('Containers'):raise RuntimeError('network not private and unused')
    return data['Id']

def infra_mounts(out):
    args=K.common_mounts(out)
    return args

def runtime_read_manifest(recipe):
    """Exact static reads, not authority and not a fabricated future receipt.

    Generated case outputs and claim/reservation files are reached through the
    existing case/owned-meter mappings. Their genuine hashes/identities remain
    mandatory at runtime. Historical owner approvals are never recursively
    imported just because a provenance document mentions them.
    """
    pins={}
    def add(p):
        if not isinstance(p,dict) or set(p)!={'path','bytes','sha256'}:
            raise RuntimeError('exact runtime file pin required')
        source=Path(p['path'])
        if source.name=='OWNER_LOCAL_GO.PRIVATE.json':raise RuntimeError('historical local GO excluded')
        previous=pins.get(p['path'])
        if previous is not None and previous!=p:raise RuntimeError('conflicting runtime file pins')
        if A.pin(source)!=p:raise RuntimeError('runtime dependency drift')
        pins[p['path']]=p
    def document(p):add(p);return pin_json(p)
    acceptance=document(recipe['independentMeterAcceptance'])
    connection=document(recipe['fixtureConnectionPin'])
    backend=local_postgrest_plan(connection)
    if backend is not None:
        document(connection['localPostgrestBackendPlanPin'])
        for p in [backend['binaryPin'],backend['sourcePostgrestConfigPin'],backend['upstreamEvidencePin'],*backend['upstreamSourcePins'],*backend['sourcePins']]:add(p)
    if 'nativeBudgetRuntimePin' in connection:document(connection['nativeBudgetRuntimePin'])
    document(recipe['recipeTemplatePin'])
    for key in ['sourcePins']:
        for p in acceptance[key]:add(p)
        for p in recipe[key]:add(p)
    for scopes in ['independentReviews','fullConnectionReviews']:
        for entries in acceptance[scopes].values():
            for p in entries if isinstance(entries,list) else [entries]:add(p)
    for key in ['immutableWorkflowPins','applicationReadOnlyPins']:
        for p in connection[key]:add(p)
    document(connection['stagedHarness'])
    request=document(connection['runtimeRequest'])
    if 'atomicUsageInput' in connection:
        if request.get('atomicUsageInput')!=connection['atomicUsageInput']:raise RuntimeError('atomic usage request/connection differs')
        candidate=document(connection['atomicUsageInput'])
        if candidate.get('schema')!='helmut-local-atomic-usage-resource-input/1' or candidate.get('mode')!='relational-atomic-v1' or candidate.get('production')is not False:
            raise RuntimeError('only exact local atomic usage candidate allowed')
        for p in candidate['sourcePins']:add(p)
    for p in request['sourcePins']:add(p)
    for p in request['primaries'].values():add(p)
    for key in ['inputAcceptance','localExternalBelege','rootFinalCodeAcceptance','currentDayBinding']:
        if key in request:add(request[key])
    owner=document(recipe['freshOwnerGO'])
    if owner.get('schema')=='helmut-owner-local-fixture-go/1':document(owner['ownerAuthorizationEvidencePin'])
    for p in owner['previousConsumedMarkers']:add(p)
    capture=document(connection['sourceCapture'])
    # The same explicit data-provenance dependencies are read by the source
    # verifier and mounted here. Historical owner approvals are excluded.
    for p in A.capture_data_pins(connection['sourceCapture']):add(p)
    day=document(recipe['dayBindingAcceptance']);add(day['independentReview'])
    if day.get('status')==Calendar.STATUS:
        document(day['sourceDayAcceptance']);add(day['adoptedRowsPin'])
    # These files do not exist at a pre-GO visibility check. Once created, the
    # exact genuine pins are also overlaid read-only; no dummy file is created.
    generated=[str(ONCE),str(SETUP_RESERVATION),str(Path(connection['caseDirectory'])/'COMPLETE_START_PREFLIGHT.SAFE.json')]
    generated.append(str(Path(connection['caseDirectory'])/'native-memory-budget/READY.SAFE.json'))
    for key in ['freshStartPreflight','setupReservation','completeStartPreflight','nativeBudgetSetupPin']:
        if key in recipe:add(recipe[key])
    if connection.get('preparedWithoutGO')is True:generated.append(owner['finalOwnerGOPath'])
    rows=sorted(pins.values(),key=lambda p:p['path'])
    payload={'schema':'helmut-shared-runtime-read-manifest/1','pins':rows,
      'generatedInputsRequireFreshRuntimeBinding':sorted(set(generated)),
      'mutableWorkflowOutputsConfinedToOwnedCase':connection['caseDirectory'],
      'trustedPlatformFiles':'Pinned image and read-only Node/Python/repository mounts; unchanged platform libraries'}
    payload['sha256']=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return payload

def verify_visible_files(manifest):
    """Open every original byte inside the actual mount namespace, no workflow."""
    if manifest.get('schema')!='helmut-shared-runtime-read-manifest/1':raise RuntimeError('runtime read manifest schema invalid')
    unsigned={k:v for k,v in manifest.items()if k!='sha256'}
    if hashlib.sha256(json.dumps(unsigned,sort_keys=True,separators=(',',':')).encode()).hexdigest()!=manifest.get('sha256'):
        raise RuntimeError('runtime read manifest digest differs')
    # Longest mount point wins; an rw case parent cannot conceal an ro file
    # overlay, nor can an ro ancestor conceal an unexpected rw nested mount.
    mounts=[]
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        fields=line.split();mounts.append((Path(fields[4].replace('\\040',' ')),set(fields[5].split(','))))
    seen=set();total=0
    for p in manifest['pins']:
        if p['path']in seen:raise RuntimeError('duplicate runtime file entry')
        seen.add(p['path']);source=Path(p['path'])
        if A.pin(source)!=p:raise RuntimeError('container runtime file drift')
        covering=[(root,flags)for root,flags in mounts if source==root or source.is_relative_to(root)]
        if not covering or 'ro'not in max(covering,key=lambda x:len(x[0].parts))[1]:
            raise RuntimeError('runtime input is not read-only inside container')
        total+=p['bytes']
    return {'pass':True,'manifestSHA256':manifest['sha256'],'openedAndHashedFiles':len(seen),
      'openedAndHashedBytes':total,'allInputsReadOnlyInActualNamespace':True,
      'generatedInputsNotAssertedPresent':manifest['generatedInputsRequireFreshRuntimeBinding'],
      'activation':False,'GOConsumed':False,'workflowStagesStarted':0}

def fixture_mounts(fixture,role,*,recipe=None):
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
        if fixture.get('schema')=='helmut-pinned-full500-connection/1':
            if recipe is None:raise RuntimeError('shared full runtime read manifest required for application mounts')
            verify_connection_files(fixture)
            if pin_json(recipe['fixtureConnectionPin'])!=fixture:raise RuntimeError('mount recipe/fixture mismatch')
            pins=runtime_read_manifest(recipe)['pins']
        else:pins+=fixture.get('immutableWorkflowPins',[])
    pins=list({p['path']:p for p in pins}.values())
    if role=='database' and (len(pins)!=1 or pins[0]['sha256']!='870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'):
        raise RuntimeError('only exact existing PostgREST binary mount allowed in database')
    backend=local_postgrest_plan(fixture)
    backend_paths=set()
    if backend is not None:
        backend_pins=[fixture['localPostgrestBackendPlanPin'],backend['ownerGoPin'],backend['sourcePostgrestConfigPin'],
            backend['upstreamEvidencePin'],*backend['upstreamSourcePins']]
        backend_paths={p['path'] for p in backend_pins}
        if role=='database':
            pins=list({p['path']:p for p in [*pins,*backend_pins]}.values())
            args+=['--mount','type=bind,src='+str(ONCE.parent)+',dst='+str(ONCE.parent)+',readonly']
            receipt_parent=case/'native-end-preparation'
            args+=['--mount','type=bind,src='+str(receipt_parent)+',dst='+str(receipt_parent)+',readonly']
            args+=['--mount','type=bind,src='+backend['binaryPin']['path']+',dst='+backend['binaryPin']['path']+',readonly']
    for p in pins:
        source=Path(p['path'])
        if source.resolve()!=source or source.is_symlink() or not source.is_file() or any(c in str(source) for c in [',','\n','\r']):raise RuntimeError('canonical regular fixture input required')
        b=source.read_bytes()
        if len(b)!=p['bytes'] or hashlib.sha256(b).hexdigest()!=p['sha256']:raise RuntimeError('fixture mount pin drift')
        if source.name=='OWNER_LOCAL_GO.PRIVATE.json':raise RuntimeError('historical local GO excluded')
        if role=='application'and source.is_relative_to(K.REPOSITORY):continue # Same read-only common mount.
        if not source.is_relative_to(Path('/workspace/helmut-parallel-20261015')) and p!=fixture.get('nativeBudgetRuntimePin') and p['path'] not in backend_paths:
            # The completed Day21 input and genuine reviews live in this one
            # private sprint directory. These are exact runtime-manifest pins,
            # already checked above; no directory or writable overlay is added.
            day21_evidence=(role=='application' and recipe is not None
              and recipe.get('scope')=='owner-approved-local500-resources'
              and fixture.get('schema')=='helmut-pinned-full500-connection/1'
              and fixture.get('production')is False and fixture.get('day')=='2026-10-21'
              and A.DAY=='2026-10-21' and A.SLOT_VERSION==12
              and fixture.get('resourceClaimPath')==str(A.CLAIM)
              and Path(fixture['caseDirectory']).name=='attempt-'+A.CASE_SUFFIX
              and fixture.get('targetDatabase')=='helmut_resource_fixture_'+A.DATE_TAG+'_'+A.CASE_SUFFIX
              and source.is_relative_to(Path('/workspace/helmut-ram-fix-20261020/next-full500-20261021')))
            if not day21_evidence:raise RuntimeError('fixture mount outside original evidence workspace')
        destination='/tmp/helmut-unit-fixture-postgrest-03693bea' if role=='database' and p['sha256']=='870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617' else str(source)
        args+=['--mount','type=bind,src='+str(source)+',dst='+destination+',readonly']
    return args

def application_mounts(out,fixture,recipe):
    """Shared exact input mapping for the harmless visibility check and launch."""
    args=infra_mounts(out)+fixture_mounts(fixture,'application',recipe=recipe)
    if recipe['scope']=='owner-approved-local500-resources':
        args+=['--mount','type=bind,src='+str(ONCE.parent)+',dst='+str(ONCE.parent)+',readonly']
    return args

def check_container_visibility(fixture,recipe):
    """Small networkless read/hash process. Never executes recipe or claims GO."""
    import tempfile,uuid
    manifest=runtime_read_manifest(recipe)
    directory=tempfile.mkdtemp(prefix='helmut-read-visibility-',dir='/workspace')
    out=Path(directory);name='helmut-read-visibility-'+uuid.uuid4().hex[:12]
    K.save_new(out/'READ_MANIFEST.PRIVATE.json',manifest)
    args=['create','-i','--name',name,'--network','none','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--user',str(os.getuid())+':'+str(os.getgid()),'--entrypoint',PYTHON]
    args+=application_mounts(out,fixture,recipe)
    args+=[K.IMAGE,str(BIN/'isolation.py'),'--verify-visible-files']
    cid=K.docker(args).stdout.strip()
    try:
        r=subprocess.run(K.DOCKER+['start','--attach','--interactive',cid],input=json.dumps(manifest),
            capture_output=True,text=True,timeout=40)
        state=json.loads(K.docker(['inspect',cid]).stdout)[0]
        K.save_new(out/'CONTAINER_READ_RESULT.PRIVATE.json',{
          'containerId':cid,'state':state['State'],'mounts':state['Mounts'],
          'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
        if r.returncode or state['State']['ExitCode']!=0:raise RuntimeError('actual container input visibility/hash/read-only check failed')
        result=json.loads(r.stdout)
        if result.get('pass')is not True or result.get('manifestSHA256')!=manifest['sha256']:
            raise RuntimeError('container visibility response binding differs')
        result['sameApplicationInputMountBuilder']=True
        result['retainedReadOnlyProbeEvidence']=str(out)
        K.save_new(out/'VISIBILITY_RESULT.SAFE.json',result)
        return result
    finally:
        state=json.loads(K.docker(['inspect',cid]).stdout)[0]
        if state['State']['Running']:K.docker(['stop','--time','5',cid],timeout=15)
        # Only this fresh ephemeral read-only probe; no volumes or old
        # containers are removed. No original bytes were writable.
        K.docker(['rm',cid])

def create_database(out,name,parent,network,scope='small-meter-validation',storage=None,fixture=None):
    if not storage:raise RuntimeError('native meter requires actual owned bounded filesystem')
    if scope=='owner-approved-local500-resources' and storage['bytes']!=2147483648:raise RuntimeError('V11 local plan requires exact2GiB owned device')
    if scope=='owner-approved-local500-resources' and storage.get('directIO')is not True:
        raise RuntimeError('new local resource candidate requires actual direct IO storage')
    fs=os.statvfs('/workspace')
    floor=(8 if scope=='owner-approved-local500-resources'else 4)*1024**3
    if fs.f_bavail*fs.f_frsize<floor:
        raise RuntimeError('shared workspace free-space floor not met; preserve originals and do not create more fixture layers')
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
    backend=local_postgrest_plan(fixture)
    if backend is not None:
        if scope!='owner-approved-local500-resources':raise RuntimeError('owner backend is full local scope only')
        cfg['localPostgrestBackendPlanPin']=fixture['localPostgrestBackendPlanPin']
        (out/'control').mkdir(mode=0o700)
        cfg['stopFile']='/meter-output/control/STOP_DATABASE'
    if storage:cfg['storageReadyPin']={**storage['kernelReadyReceipt'],'path':'/meter-storage-ready.SAFE.json'}
    K.save_new(out/'DATABASE_CONFIG.SAFE.json',cfg)
    args=['create','--name',name,'--network',network,'--cgroup-parent=/'+parent,
          '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
          '--env','PGDATA='+pgdata,'--env','POSTGRES_HOST_AUTH_METHOD=trust',
          '--env','PATH='+str(K.NODE_ROOT/'bin')+':'+str(K.PYTHON_ROOT/'bin')+':/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin',
          '--entrypoint',PYTHON]
    args+=infra_mounts(out)
    args+=fixture_mounts(fixture,'database')
    if backend is not None:
        common=K.validated_parent(parent.rsplit('/',1)[0])
        if not common.is_dir():raise RuntimeError('actual common native memory group missing')
        args+=['--mount','type=bind,src='+str(common)+',dst=/local-postgrest-cgroup-parent,readonly']
    if storage:args+=['--mount','type=bind,src='+storage['kernelReadyReceipt']['path']+',dst=/meter-storage-ready.SAFE.json,readonly']
    args+=[K.IMAGE,str(BIN/'database-supervisor.py'),'/meter-output/DATABASE_CONFIG.SAFE.json']
    cid=K.docker(args).stdout.strip()
    if backend is not None:
        observed=json.loads(K.docker(['inspect',cid]).stdout)[0]
        if observed['Id']!=cid or observed['HostConfig']['CgroupParent']!='/'+parent or observed['State']['Running'] or observed['HostConfig']['PidMode']!='':
            raise RuntimeError('created DB identity/configured group differs')
        reservation_pin=A.pin(SETUP_RESERVATION);reservation=pin_json(reservation_pin)
        if reservation['freshOwnerGO']!=backend['ownerGoPin']:
            raise RuntimeError('actual setup reservation owner differs')
        local_postgrest_module().save_new(out/'LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json',{
            'schema':'helmut-local-postgrest-backend-host-binding/1','containerId':cid,'containerName':name,
            'configuredCgroupParent':'/'+parent,'kernelObservedBeforeStart':False,'privatePidMode':observed['HostConfig']['PidMode'],
            'databaseConfigPin':{**A.pin(out/'DATABASE_CONFIG.SAFE.json'),'path':'/meter-output/DATABASE_CONFIG.SAFE.json'},
            'localPostgrestBackendPlanPin':fixture['localPostgrestBackendPlanPin'],
            'controllerInvocationId':reservation['controllerInvocationId'],'setupReservationPin':reservation_pin,
            'independentMeterAcceptancePin':reservation['independentMeterAcceptance'],'production':False})
    K.docker(['start',cid])
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
    if backend is not None:
        actual=json.loads(K.docker(['inspect',cid]).stdout)[0]
        host_pid=actual['State']['Pid']
        if actual['Id']!=cid or not actual['State']['Running'] or type(host_pid)is not int or host_pid<=0:
            raise RuntimeError('live DB host PID unavailable')
        rows=[line.split(':',2)[2]for line in Path('/proc',str(host_pid),'cgroup').read_text().splitlines()if line.startswith('0::')]
        host_ticks=Path('/proc',str(host_pid),'stat').read_text().rsplit(')',1)[1].split()[19]
        if len(rows)!=1:raise RuntimeError('actual unified DB cgroup unavailable')
        group=K.CGROUP_ROOT/rows[0].lstrip('/');common=K.validated_parent(parent.rsplit('/',1)[0])
        if group.resolve()!=group or not group.is_relative_to(K.validated_parent(parent)):
            raise RuntimeError('actual DB kernel group outside configured parent')
        if host_pid not in {int(x)for x in (group/'cgroup.procs').read_text().split()}:
            raise RuntimeError('host PID missing from actual DB cgroup')
        st=group.stat()
        local_postgrest_module().save_new(out/'LOCAL_POSTGREST_BACKEND_KERNEL_BINDING.SAFE.json',{
            'schema':'helmut-local-postgrest-backend-kernel-binding/1','containerId':cid,'hostPID':host_pid,'hostPIDStartTicks':host_ticks,
            'hostBindingPin':{**A.pin(out/'LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json'),'path':'/meter-output/LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json'},
            'relativeToCommonParent':str(group.relative_to(common)),'cgroupDevice':st.st_dev,'cgroupInode':st.st_ino,
            'observedHostCgroupPath':rows[0],'kernelObservedAfterStart':True,'production':False})
        supervisor_ready=out/'local-postgrest-backend/SUPERVISOR_READY.SAFE.json'
        for _ in range(100):
            if supervisor_ready.exists():break
            if K.docker(['inspect','--format','{{.State.Running}}',cid]).stdout.strip()!='true':break
            time.sleep(.05)
        if not supervisor_ready.exists():raise RuntimeError('owner supervisor kernel-binding acknowledgement missing')
        acknowledged=pin_json(A.pin(supervisor_ready))
        expected_kernel={**A.pin(out/'LOCAL_POSTGREST_BACKEND_KERNEL_BINDING.SAFE.json'),'path':'/meter-output/LOCAL_POSTGREST_BACKEND_KERNEL_BINDING.SAFE.json'}
        if acknowledged.get('kernelBindingPin')!=expected_kernel or acknowledged.get('containerId')!=cid:
            raise RuntimeError('owner supervisor kernel-binding acknowledgement differs')
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
        N.verify(parent.rsplit('/',1)[0],N.bind_setup(connection,recipe,pin_json))
        if database.get('fixture')!=connection or database.get('name')!=connection['containerName'] or database.get('network')!=network:
            raise RuntimeError('actual database fixture differs from accepted exact connection')
        actual_id=K.docker(['inspect','--format','{{.Id}}',database['name']]).stdout.strip()
        if database.get('containerId')!=actual_id or pin_json(recipe['freshStartPreflight']).get('actualEmptyDBContainerId')!=actual_id:
            raise RuntimeError('actual owned database ID differs from fresh preflight')
    inspect_private_network(network)
    out=Path(out).resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
    (out/'http').mkdir(mode=0o700)
    (out/'bin').mkdir(mode=0o700)
    budgeted=recipe['scope']=='owner-approved-local500-resources'
    heap='export HELMUT_NATIVE_NODE_OLD_SPACE_MIB=384\n' if budgeted else ''
    heap_flag=' --max-old-space-size=384 --max-semi-space-size=16' if budgeted else ''
    shim=out/'bin/node';shim.write_text('#!/bin/sh\n'+heap+'exec '+str(K.NODE_ROOT/'bin/node')+heap_flag+' --require='+str(BIN/'http-meter.js')+' "$@"\n');shim.chmod(0o700)
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
        if database.get('fixture',{}).get('localPostgrestBackendPlanPin'):
            config['localPostgrestBackendPlanPin']=database['fixture']['localPostgrestBackendPlanPin']
            recipe['databaseStopFile']='/meter-database/control/STOP_DATABASE'
        K.save_new(broker_out/'CONFIG.PRIVATE.json',config)
        broker_name=name+'-broker'
        args=['create','--name',broker_name,'--network','none','--cgroup-parent=/'+parent,
              '--cap-drop','ALL','--security-opt','no-new-privileges',
              '--user',str(os.getuid())+':'+str(os.getgid()),
              '--group-add',str(Path('/var/run/docker.sock').stat().st_gid),
              '--entrypoint',PYTHON]
        args+=K.common_mounts(broker_out)
        backend=local_postgrest_plan(database.get('fixture'))
        if backend is not None:
            broker_pins=[database['fixture']['localPostgrestBackendPlanPin'],backend['binaryPin'],backend['ownerGoPin'],
                backend['sourcePostgrestConfigPin'],backend['upstreamEvidencePin'],*backend['upstreamSourcePins']]
            for p in {p['path']:p for p in broker_pins}.values():
                if A.pin(p['path'])!=p:raise RuntimeError('optional broker dependency drift')
                args+=['--mount','type=bind,src='+p['path']+',dst='+p['path']+',readonly']
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
    if budgeted:args+=['--env','HELMUT_NATIVE_NODE_OLD_SPACE_MIB=384']
    args+=application_mounts(out,database.get('fixture') if database else None,recipe)
    args+=['--mount','type=bind,src='+str(out/'RECIPE.PRIVATE.json')+',dst=/meter-output/RECIPE.PRIVATE.json,readonly']
    if database:
        if database.get('fixture',{}).get('localPostgrestBackendPlanPin'):
            # fixture_mounts also exposes the case RW. Protect that second
            # alias and the parent mountpoint, not only selected metadata.
            for destination in ['/meter-database',database['out']]:
                args+=['--mount','type=bind,src='+database['out']+',dst='+destination+',readonly',
                       '--mount','type=bind,src='+str(Path(database['out'])/'control')+',dst='+destination+'/control']
        else:
            args+=['--mount','type=bind,src='+database['out']+',dst=/meter-database']
    if broker:args+=['--mount','type=bind,src='+broker['out']+',dst=/meter-broker,readonly']
    args+=[K.IMAGE,str(BIN/'process-runner.py'),'/meter-output/RECIPE.PRIVATE.json']
    cid=K.docker(args).stdout.strip()
    if recipe['scope']=='owner-approved-local500-resources':claim_full_attempt(recipe,cid,out/'RECIPE.PRIVATE.json')
    K.docker(['start',cid])
    return {'out':str(out),'name':name,'containerId':cid,'parent':parent,'database':database,
            'broker':broker,'ownedContainerNames':[name]+([broker['name']] if broker else [])}

def finalize(application,timeout=180,*,native_memory_budget=None):
    code=int(K.docker(['wait',application['containerId']],timeout=timeout).stdout.strip())
    # PID1 can fail before runner baseline/try-finally (or be killed). Always
    # close only the exact newly owned DB after its application has exited.
    db=application['database']
    if db:
        stop=Path(db['out'])/('control/STOP_DATABASE' if db.get('fixture',{}).get('localPostgrestBackendPlanPin') else 'STOP_DATABASE')
        if not stop.exists():K.save_new(stop,{'ownedApplicationExited':True,'applicationExitCode':code})
    broker_final=None
    if application.get('broker'):
        broker=application['broker'];Path(broker['out'],'STOP').write_text('OWNED_RUNNER_EXITED\n')
        broker_code=int(K.docker(['wait',broker['containerId']],timeout=30).stdout.strip())
        broker_final=json.loads(Path(broker['out'],'BROKER_FINAL.SAFE.json').read_text())
        if broker_code!=0 or not broker_final['complete']:raise RuntimeError('complete broker exit not confirmed')
    app_kernel=K.kernel_snapshot(application['parent'],require_empty=True)
    db=application['database'];db_kernel=None;db_code=None
    if db:
        db_timeout=180 if db.get('fixture',{}).get('localPostgrestBackendPlanPin') else 60
        db_code=int(K.docker(['wait',db['containerId']],timeout=db_timeout).stdout.strip())
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
    native_budget_final=None
    if native_memory_budget is not None:
        if not common_parent:raise RuntimeError('native common budget requires actual shared parent')
        native_budget_final=N.verify(common_parent,native_memory_budget,require_no_oom=False)
        extra=list(native_memory_budget['helpers'].values())
        owned += [x['name'] for x in extra]
        expected_ids.update(x['id'] for x in extra)
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
            'nativeCommonMemoryBudget':native_budget_final,
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
    if db and db.get('fixture',{}).get('localPostgrestBackendPlanPin'):
        result['pass']=bool(result['pass'] and db_final.get('localPostgrestBackend',{}).get('pass')is True
            and db_final['localPostgrestBackend'].get('ownerExitCode')==0)
    if recipe['scope']=='owner-approved-local500-resources':
        if native_memory_budget is None or N.bind_setup(pin_json(recipe['fixtureConnectionPin']),recipe,pin_json)!=native_memory_budget:
            raise RuntimeError('full resource result requires exact native budget setup and final verification')
        try:result['nativeNodeHeapBudget']=N.node_receipts(out/'http')
        except Exception as error:
            result['nativeNodeHeapBudget']={'pass_':False,'errorType':type(error).__name__}
            result['pass']=False
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
        common=result['simultaneousApplicationAndInfrastructureKernel']
        common_exit=bool(common and common.get('fullLastProcessExitCovered') is True)
        budget_events=native_budget_final['memoryEvents']
        no_budget_oom=not(budget_events.get('oom',0)or budget_events.get('oom_kill',0))
        complete_run=bool(result['pass'] and common_exit and no_budget_oom)
        result['simultaneousAllOwnedUnder2048DecimalMB']=bool(common_exit and common['memoryPeakBytes']<2048000000)
        result['pass']=bool(result['pass'] and result['simultaneousAllOwnedUnder2048DecimalMB'])
        # The requested buffer is reported separately from the unchanged hard
        # limit. A partial workflow/exit cannot establish a full-run reserve.
        buffer_pass=bool(complete_run and common['memoryPeakBytes']<=1548000000)
        result['requestedMemoryBuffer']={'requestedBytes':500000000,'maximumCommonPeakBytes':1548000000,
            'completeRunWithCommonExitEvidence':complete_run,
            'reserveBytes':2048000000-common['memoryPeakBytes'] if complete_run else None,
            'status':'PASS' if buffer_pass else 'FAIL',
            'reason':'SUFFICIENT_BUFFER' if buffer_pass else ('INSUFFICIENT_BUFFER' if complete_run else 'INCOMPLETE_FULL_RUN')}
        result['requestedMemoryBuffer']['nativeBudgetOOMFree']=no_budget_oom
        if not no_budget_oom:
            result['requestedMemoryBuffer'].update(status='FAIL',reason='NATIVE_MEMORY_OOM')
        result['pass']=bool(result['pass'] and buffer_pass and no_budget_oom)
    K.save_new(out/'COMPLETE_RESOURCE_RESULT.SAFE.json',result)
    return result

def close_failed_owned_setup(connection_pin,invocation_id):
    """Error-only close; exact new reservation owner, never an old attempt."""
    reservation=pin_json(A.pin(SETUP_RESERVATION))
    if reservation.get('controllerInvocationId')!=invocation_id or reservation.get('fixtureConnectionPin')!=connection_pin:
        raise RuntimeError('refuse cleanup of another controller reservation')
    connection=pin_json(connection_pin);case=Path(connection['caseDirectory']);suffix=case.name.removeprefix('attempt-')
    if case.parent!=Path('/workspace/helmut-parallel-20261015/wave20-resource-integration') or len(suffix)!=12 or any(c not in '0123456789abcdef'for c in suffix):
        raise RuntimeError('owned error cleanup case invalid')
    parent='/helmut-meter-resources'+A.DAY[-2:]+'-'+suffix
    try:native_close=N.close_case_helpers(case,parent.removeprefix('/'),pin_json(connection['nativeBudgetRuntimePin']))
    except Exception as error:
        native_close={'allKnownHelpersClosed':False,'errorType':type(error).__name__,'noUnverifiedContainerSignalled':True}
    ids=K.docker(['ps','--all','--quiet']).stdout.split()
    containers=json.loads(K.docker(['inspect',*ids]).stdout)if ids else []
    owned=[row for row in containers if row['HostConfig']['CgroupParent']in [parent+'/application',parent+'/database',parent+'/storage']]
    # Existing stop interfaces first. Fixed disjoint directories only.
    database_stop=case/('database/control/STOP_DATABASE' if connection.get('localPostgrestBackendPlanPin') else 'database/STOP_DATABASE')
    for stop in [case/'application/broker/STOP',database_stop,A.METER/('full500-owned-storage'+A.DAY[-2:]+'-'+suffix)/'STOP']:
        try:
            if stop.parent.is_dir()and not stop.exists():N.best_effort_save(stop,{'ownedFailureClose':True})
        except Exception:pass
    stopped=[]
    for row in owned:
        try:
            if row['State']['Running']:K.docker(['stop','--time','10',row['Id']],timeout=20)
            after=json.loads(K.docker(['inspect',row['Id']]).stdout)[0]
            stopped.append({'containerId':row['Id'],'closed':not after['State']['Running']and after['State']['Pid']==0,
                'exitCode':after['State']['ExitCode']})
        except Exception as error:stopped.append({'containerId':row['Id'],'closed':False,'errorType':type(error).__name__})
    result={'schema':'helmut-owned-setup-error-close/1','controllerInvocationId':invocation_id,
      'containers':stopped,'nativeBudgetHelpers':native_close,'noOldContainerControlled':True,'noDeletionOrRetry':True,'production':False}
    result['allKnownOwnedContainersClosed']=native_close['allKnownHelpersClosed']and all(x['closed']for x in stopped)
    K.save_new(case/'OWNED_SETUP_ERROR_CLOSE.SAFE.json',result)
    return result

if __name__=='__main__':
    if sys.argv[1:]!=['--verify-visible-files']:
        raise SystemExit('ONLY_NON_ACTIVATING_FILE_VISIBILITY_CHECK_ALLOWED')
    print(json.dumps(verify_visible_files(json.load(sys.stdin))))
