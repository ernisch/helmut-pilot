#!/usr/bin/env python3
"""Connect accepted existing primitives to ONE exact original local500 run.

No default action. A wait only waits for the independently reviewed wall-clock
day; it never retries an attempted workflow. Setup/claim/launch are each once.
"""
import argparse,datetime,hashlib,importlib.util,json,os,secrets,subprocess,time,ipaddress
from pathlib import Path
from zoneinfo import ZoneInfo

BIN=Path(__file__).parent
def module(name,file):
    s=importlib.util.spec_from_file_location(name,BIN/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
I=module('isolation','isolation.py');C=module('connection','connect-local500.py');S=module('source','capture-local-source.py')
Z=module('zero_day_input','local-zero-day-copy.py')
Calendar=module('resource_calendar_binding','local-calendar-binding.py')
W=C.AREA;CLAIM=I.ONCE;UTC=datetime.timezone.utc

def financial_preflight(connection):
    # This is a read-only projection of the ACTUAL frozen LOCAL source, not
    # financing authority or a mutation of historical daybooks. Catch missing
    # intervening days before any setup reservation or one-time GO claim.
    day=connection['day']
    if datetime.date.fromisoformat(day).isoformat()!=day:raise RuntimeError('financial projection day invalid')
    stage=str(Path(connection['workflowDirectory'])/'prepare-current-local-runtime.js')
    pins=[p for p in connection['immutableWorkflowPins'] if p['path']==stage]
    if len(pins)!=1:raise RuntimeError('exact reviewed financial preparation module missing')
    actual=I.A.verify_preexisting_capture(connection['sourceCapture'])
    snapshot={'auth':json.loads(actual['nativeAuthText']),'nativeAuthText':actual['nativeAuthText'],'authSHA':actual['nativeAuthSHA'],'counter':0,'counterReadOK':True}
    proc=subprocess.run([str(I.K.NODE_ROOT/'bin/node'),str(BIN/'local-financial-preflight.js'),json.dumps(pins[0]),day],input=json.dumps(snapshot),capture_output=True,text=True,timeout=30)
    try:result=json.loads(proc.stdout)
    except ValueError:raise RuntimeError('local financial preflight did not return a safe result')
    if proc.returncode!=0 or result.get('pass') is not True:
        reason=result.get('reason','financial-preflight-rejected')
        missing=','.join(result.get('missingDays',[]))
        raise RuntimeError('local financial start preflight rejected: '+reason+'; missingDays='+missing)
    return result

def original_preflight(connection,*,check_financial=True):
    archived=C.read_pin(connection['originalPreflightPin'])
    if archived.get('schema')=='helmut-restored-original-resource-preflight/1':
        if (archived.get('status')!='ACTUAL_RESTORED_FROZEN_SOURCE_READONLY_VERIFIED'
          or archived.get('sourceEnvironment',{}).get('runtimeBindingPin')!=S.verify_runtime_binding()):
            raise RuntimeError('restored frozen source preflight identity differs')
    for p in archived['verifiedReadOnly']['originalInputPins']:
        if C.pin(p['path'])!={k:p[k] for k in ['path','bytes','sha256']}:raise RuntimeError('original input pin drift')
    before=S.identity();expected=archived['verifiedReadOnly']['frozenSourceDatabase']
    before.update(S.sql('select jsonb_build_object(\'database\',current_database(),\'identities\',(select count(*)from profiles),\'profileFachHash\',(select encode(sha256(convert_to(jsonb_agg(to_jsonb(p)-\'aktiv\'-\'updated_at\' order by user_id collate "C")::text,\'UTF8\')),\'hex\')from mandate_profiles p));'))
    historic=C.read_pin(connection['historicalSourcePin'])['sourceBefore']
    if set(before)!=set(expected['comparedFields']) or any(before[k]!=historic[k] for k in before):raise RuntimeError('original frozen source drift')
    if before['database']!=expected['name'] or any(before[k]!=expected[k] for k in ['active','profiles','identities']) or expected['allOriginalStateFieldsEqualHistoricalSourceBefore'] is not True:
        raise RuntimeError('live source differs from pinned archived preflight')
    native=json.loads(S.NATIVE.read_text());counts={}
    for key,table in [('kos','knowledge_objects'),('rawDocumentsRows','raw_documents')]:
        rows=native[key];fields=list(rows[0]);expr='||'.join('jsonb_build_object('+','.join(S.lit(k)+',d."'+k+'"' for k in fields[i:i+40])+')' for i in range(0,len(fields),40))
        actual=S.sql('select coalesce(jsonb_agg(('+expr+')order by d.id),\'[]\'::jsonb)from '+table+' d where d.id in('+','.join(S.lit(r['id']) for r in rows)+');')
        if sorted(actual,key=lambda r:r['id'])!=sorted(rows,key=lambda r:r['id']):raise RuntimeError('current native physical input drift')
        counts[key]=len(rows)
    links=native['links'];fields=list(links[0]);expr='jsonb_build_object('+','.join(S.lit(k)+',l."'+k+'"' for k in fields)+')'
    actual=S.sql('select coalesce(jsonb_agg('+expr+'),\'[]\'::jsonb)from ko_document_links l where l.knowledge_object_id in('+','.join(S.lit(k['id']) for k in native['kos'])+');')
    sort=lambda a:sorted(a,key=lambda r:json.dumps(r,sort_keys=True))
    if sort(actual)!=sort(links):raise RuntimeError('complete actual native source-link set changed')
    result={'originalPins':len(archived['verifiedReadOnly']['originalInputPins']),'originalFrozenSourceEqual':True,'nativePhysicalEquality':counts,'completeNativeLinks':len(links),'sourceWrites':0}
    if check_financial:result['readOnlyFinancialProjection']=financial_preflight(connection)
    return result

def accepted_metadata(acceptance_pin,connection_pin,recipe_template_pin,*,planning=False):
    acceptance=C.read_pin(acceptance_pin);connection=C.read_pin(connection_pin);recipe=C.read_pin(recipe_template_pin)
    if acceptance.get('status')!='ROOT_ADOPTED_INDEPENDENT_COMPLETE_METER_ACCEPTANCE':raise RuntimeError('complete independent acceptance missing')
    if acceptance.get('fixtureConnectionPin')!=connection_pin or recipe.get('fixtureConnectionPin')!=connection_pin:raise RuntimeError('exact accepted connection differs')
    if acceptance.get('recipeTemplatePin')!=recipe_template_pin:raise RuntimeError('exact accepted recipe template differs')
    C.exact_case_binding(connection['caseDirectory'],connection['targetDatabase'],connection['containerName'],connection['operationId'])
    I.verify_connection_files(connection)
    for p in acceptance['sourcePins']:
        if C.pin(p['path'])!=p:raise RuntimeError('accepted actual source drift')
    scopes=acceptance['independentReviews']
    if set(scopes)!=set(['process','wal','network','storage']):raise RuntimeError('all independent scopes required before setup')
    for scope,pins in scopes.items():
        entries=pins if isinstance(pins,list) else [pins]
        if len(entries)!={'process':1,'wal':1,'network':2,'storage':2}[scope]:raise RuntimeError('complete six scoped reviews required')
        for p in pins if isinstance(pins,list) else [pins]:
            r=C.read_pin(p)
            if r.get('model')!='deepseek-v4-pro' or r.get('route',{}).get('effort')!='high' or r.get('payload',{}).get('summary',{}).get('status')!='ok':raise RuntimeError('accepted independent review missing')
    integrated=acceptance['fullConnectionReviews']
    if set(integrated)!=set(['authority','bootstrap','coverage']):raise RuntimeError('all three independent connection scopes required')
    for scope,pins in integrated.items():
        pins=pins if isinstance(pins,list) else [pins]
        if len(pins)!={'authority':1,'bootstrap':1,'coverage':2}[scope]:raise RuntimeError('complete scoped connection reviews required')
        for p in pins:
            r=C.read_pin(p)
            if r.get('model')!='deepseek-v4-pro' or r.get('route',{}).get('effort')!='high' or r.get('payload',{}).get('summary',{}).get('status')!='ok':raise RuntimeError('full connection independent review missing')
    owner=C.read_pin(recipe['freshOwnerGO']);day=C.read_pin(recipe['dayBindingAcceptance'])
    I.verify_fixture_owner_policy(owner)
    I.A.validate_owner(owner,connection,planning=planning)
    descriptor=C.read_pin(connection['atomicUsageInput']) if connection.get('atomicUsageInput') else None
    local=Calendar.admit(day,C.read_pin,descriptor=descriptor,operation=connection['operationId'])
    if owner['targetDatabase']!=connection['targetDatabase'] or day['day']!=I.A.DAY or (local is None and day.get('positiveOriginalLAtBothWindowEnds')!=500):raise RuntimeError('owner or day binding invalid')
    for p in connection['applicationReadOnlyPins']+connection['databaseReadOnlyPins']:
        if C.pin(p['path'])!=p:raise RuntimeError('fixture asset drift')
    return acceptance,connection,recipe,day

def no_previous_attempt(connection):
    if CLAIM.exists():raise RuntimeError('one-time resources GO already claimed; never retry')
    if I.SETUP_RESERVATION.exists():raise RuntimeError('one-time resources setup already reserved; no duplicate setup or automatic retry')
    case=Path(connection['caseDirectory']);n=case/'native-end-preparation'
    forbidden=[n/'LOCAL_ACTIVATION_STARTED.SAFE.json',n/'LOCAL_ACTIVATION_RESULT.SAFE.json',case/'FRESH_PACKET.PRIVATE.json',case/'LOCAL_ASSEMBLY_RESULT.SAFE.json',case/'CONTROLLER_STARTED.SAFE.json']
    if any(p.exists() for p in forbidden):raise RuntimeError('case already entered; no replay/retry')

def window(day):
    now=datetime.datetime.now(UTC);valid,start,end=Calendar.current_window(day,now=now)
    if now<start:return False,start,end
    if (end-now).total_seconds()<8089.543088+600:raise RuntimeError('full remaining window lacks last actual workflow plus10min setup/close reserve')
    return True,start,end

def run(acceptance_pin,connection_pin,recipe_template_pin,*,wait=False,start_preflight_adoption_pin=None):
    invocation_id=secrets.token_hex(16)
    try:
        return _run_once(acceptance_pin,connection_pin,recipe_template_pin,wait=wait,
            start_preflight_adoption_pin=start_preflight_adoption_pin,invocation_id=invocation_id)
    except Exception:
        # A concurrent or historical reservation never belongs to this call.
        # Preserve the original failure; record cleanup failure separately.
        if I.SETUP_RESERVATION.exists():
            reservation=C.read_pin(C.pin(I.SETUP_RESERVATION))
            if reservation.get('controllerInvocationId')==invocation_id:
                I.close_failed_owned_setup(connection_pin,invocation_id)
        raise

def _run_once(acceptance_pin,connection_pin,recipe_template_pin,*,wait=False,start_preflight_adoption_pin=None,invocation_id):
    # A caller cannot skip the complete non-mutating consumer comparison.
    # This must precede ANY reservation, correction, resource or GO side effect.
    complete=module('complete_start_preflight','start-preflight.py')
    bindings={'acceptance':acceptance_pin,'connection':connection_pin,'recipeTemplate':recipe_template_pin}
    if start_preflight_adoption_pin is not None:bindings['startPreflightIndependentAdoption']=start_preflight_adoption_pin
    checked=complete.assess(bindings)
    complete.assert_ready(checked)
    acceptance,connection,recipe,day=accepted_metadata(acceptance_pin,connection_pin,recipe_template_pin)
    no_previous_attempt(connection)
    valid,start,end=window(day)
    if not valid:
        if not wait:raise RuntimeError('reviewed day not started; stop before setup/GO')
        print(json.dumps({'status':'WAIT_ONLY_NO_TEST_NO_GO_CONSUMPTION','qualifiedStartUTC':start.isoformat(),'qualifiedStartIstanbul':start.astimezone(ZoneInfo('Europe/Istanbul')).isoformat()}),flush=True)
        while datetime.datetime.now(UTC)<start:time.sleep(min(30,max(.05,(start-datetime.datetime.now(UTC)).total_seconds())))
        acceptance,connection,recipe,day=accepted_metadata(acceptance_pin,connection_pin,recipe_template_pin)
        no_previous_attempt(connection);valid,start,end=window(day)
    # From here, each setup/launch step is attempted ONCE, never a retry loop.
    first=original_preflight(connection)
    case=Path(connection['caseDirectory']);network='helmut-meter-net-w20-'+case.name.removeprefix('attempt-')
    parent='helmut-meter-resources'+I.A.DAY[-2:]+'-'+case.name.removeprefix('attempt-')
    dbname=connection['containerName'];appname=dbname.replace('helmut-meter-db-','helmut-meter-app-',1)
    if I.K.docker(['inspect',dbname],check=False).returncode==0 or I.K.docker(['network','inspect',network],check=False).returncode==0:raise RuntimeError('actual owned resources already exist; no reuse')
    subnet=connection.get('approvedInternalSubnet')
    if subnet!=I.A.SUBNET:raise RuntimeError('exact new reviewed172 gateway subnet missing')
    network_ids=I.K.docker(['network','ls','-q']).stdout.split()
    networks=json.loads(I.K.docker(['network','inspect',*network_ids]).stdout)
    if any(ipaddress.ip_network(subnet).overlaps(ipaddress.ip_network(p['Subnet'])) for n in networks for p in (n['IPAM'].get('Config') or []) if ':' not in p.get('Subnet','')):
        raise RuntimeError('reviewed exact private subnet already occupied; no deletion or automatic substitute')
    # Exclusive GLOBAL setup reservation prevents competing controllers from
    # creating any resources for the same unused GO. It is never deleted;
    # setup failure remains retained and needs reviewed recovery, not a retry.
    # Recheck fresh prerequisites after any wait/read-only checks. Never use an
    # externally supplied pass report or a stale early observation as authority.
    checked=complete.assess(bindings)
    complete.assert_ready(checked)
    complete_path=case/'COMPLETE_START_PREFLIGHT.SAFE.json'
    I.K.save_new(complete_path,complete.freeze_ready_report(checked))
    complete_pin=C.pin(complete_path)
    I.K.save_new(I.SETUP_RESERVATION,{'schema':'helmut-local-resource-setup-reservation/1','fixtureConnectionPin':connection_pin,'recipeTemplatePin':recipe_template_pin,'independentMeterAcceptance':acceptance_pin,'freshOwnerGO':recipe['freshOwnerGO'],'completeStartPreflight':complete_pin,'controllerInvocationId':invocation_id,'atUTC':datetime.datetime.now(UTC).isoformat(),'GOConsumed':False,'noAutomaticRetry':True})
    reservation_pin=C.pin(I.SETUP_RESERVATION)
    I.K.save_new(case/'CONTROLLER_STARTED.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'preflight':first,'singleSetupAttempt':True,'noAutomaticRetry':True,'GOClaimed':False,'setupReservation':reservation_pin})
    storage_module=module('bounded','bounded-storage.py')
    # Choose one exact unbound minor with the previously accepted read-only
    # loop-control capability probe's kernel result. It is checked atomically
    # by LOOP_CONFIGURE; no occupied mapping is detached or reassigned.
    minor=acceptance['approvedFreshLoopMinor']
    storage_out=I.ONCE.parent/('full500-owned-storage'+I.A.DAY[-2:]+'-'+case.name.removeprefix('attempt-'))
    storage=storage_module.create(storage_out,8000000000,minor,parent+'/storage',hold=connection['storageHoldSeconds'])
    if connection.get('approvedInternalSubnet')!=I.A.SUBNET:raise RuntimeError('exact new reviewed172 gateway subnet missing')
    I.create_network(network,subnet=connection['approvedInternalSubnet'])
    db=I.create_database(case/'database',dbname,parent+'/database',network,scope='owner-approved-local500-resources',storage=storage,fixture=connection)
    # Fresh actual prerequisites AFTER the empty owned server is ready.
    second=original_preflight(connection);valid,_,end=window(day)
    if not valid or CLAIM.exists():raise RuntimeError('fresh day or unused GO lost before actual start')
    q="begin read only;select count(*)from pg_database where datname in('"+connection['sourceDatabase']+"','"+connection['targetDatabase']+"');rollback;"
    empty=I.K.docker(['exec','-i','-u','postgres',dbname,'psql','-X','-qAt','-d','postgres','-c',q]).stdout.strip()
    if empty!='0':raise RuntimeError('fresh source/target database names already used in owned server')
    preflight_path=I.ONCE.parent/('RESOURCES'+I.A.DAY[-2:]+'_START_PREFLIGHT_'+case.name.removeprefix('attempt-')+'.SAFE.json')
    preflight={'status':'PASS_EXACT_UNUSED_LOCAL500_RESOURCE_START','checkedAtUnixSeconds':time.time(),'atUTC':datetime.datetime.now(UTC).isoformat(),
      'windowEndsAtUTC':end.isoformat(),
      **({'sufficientSameUTCFixtureWindow':True,'localCalendar':day['localCalendar']} if day.get('status')==Calendar.STATUS
         else {'sufficientSameUTCAndBerlinDayWindow':True}),
      'originalSourcePreflight':second,
      'exactUnusedOwnedDatabaseVerified':True,'connectionPin':connection_pin,'independentMeterAcceptance':acceptance_pin,
      'actualEmptyDBContainerId':db['containerId'],'freshOwnerGO':recipe['freshOwnerGO'],'oneTimeGOUnused':True,'production':False}
    I.K.save_new(preflight_path,preflight)
    recipe.update(sourcePins=acceptance['sourcePins'],independentMeterAcceptance=acceptance_pin,freshStartPreflight=C.pin(preflight_path),recipeTemplatePin=recipe_template_pin,setupReservation=reservation_pin,completeStartPreflight=complete_pin)
    I.verify_full_authority(recipe)
    app=I.launch_application(case/'application',appname,parent+'/application',network,recipe,db)
    I.K.save_new(case/'ACTUAL_RESOURCE_ATTEMPT_STARTED.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'application':app,'globalClaim':C.pin(CLAIM),'exactlyOneAttempt':True,'noRetry':True})
    print(json.dumps({'status':'ACTUAL_SINGLE_LOCAL500_RESOURCE_ATTEMPT_STARTED','caseDirectory':str(case),'globalGOClaimExists':True,'applicationContainerId':app['containerId'],'production':False}),flush=True)
    result=I.finalize(app,timeout=max(60,int((end-datetime.datetime.now(UTC)).total_seconds())+180))
    I.K.save_new(case/'CONTROLLER_COMPLETE.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'pass':result['pass'],
      'completeResourceResult':C.pin(case/'application/COMPLETE_RESOURCE_RESULT.SAFE.json'),
      'originalSourceAfter':original_preflight(connection),'globalGOClaimPreserved':True,'noAutomaticRetry':True,'production':False})
    print(json.dumps({'status':'SINGLE_RESOURCE_ATTEMPT_COMPLETE','pass':result['pass'],'actualAllOwnedMemoryPeakBytes':result['simultaneousApplicationAndInfrastructureKernel']['memoryPeakBytes'],'CPUUsec':result['simultaneousApplicationAndInfrastructureKernel']['cpu']['usage_usec']}),flush=True)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--accepted-bindings',required=True)
    action=parser.add_mutually_exclusive_group(required=True);action.add_argument('--run-exactly-once',action='store_true');action.add_argument('--check-only',action='store_true')
    parser.add_argument('--wait-for-reviewed-window',action='store_true');parser.add_argument('--prepare-without-go',action='store_true');args=parser.parse_args()
    if args.prepare_without_go and not args.check_only:parser.error('--prepare-without-go is restricted to --check-only')
    bindings=json.loads(Path(args.accepted_bindings).read_text())
    try:
        if args.check_only:
            result=module('complete_start_preflight','start-preflight.py').assess(bindings,planning=args.prepare_without_go)
            print(json.dumps(result),flush=True)
            raise SystemExit(0 if result['pass'] else 2)
        result=run(bindings['acceptance'],bindings['connection'],bindings['recipeTemplate'],wait=args.wait_for_reviewed_window,
                   start_preflight_adoption_pin=bindings.get('startPreflightIndependentAdoption'))
        if result['pass'] is not True:raise SystemExit(1)
    except Exception as error:
        print(json.dumps({'status':'STOP_NO_AUTOMATIC_RETRY','errorType':type(error).__name__,'reason':str(error) if isinstance(error,RuntimeError) else 'Inspect retained local evidence; do not replay any claimed attempt','globalGOClaimExists':CLAIM.exists(),'production':False}),flush=True)
        raise SystemExit(1)
