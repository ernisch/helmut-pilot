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
W=C.AREA;CLAIM=I.ONCE;UTC=datetime.timezone.utc

def original_preflight():
    archived=json.loads(Path('/workspace/helmut-resource-preflight-20261016/RESOURCE_START_PREFLIGHT.SAFE.json').read_text())
    for p in archived['verifiedReadOnly']['originalInputPins']:
        if C.pin(p['path'])!={k:p[k] for k in ['path','bytes','sha256']}:raise RuntimeError('original input pin drift')
    before=S.identity();expected=archived['verifiedReadOnly']['frozenSourceDatabase']
    historic=json.loads((C.BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_RESULT.SAFE.json').read_text())['sourceBefore']
    if any(before[k]!=historic[k] for k in before):raise RuntimeError('original frozen source drift')
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
    return {'originalPins':9,'originalFrozenSourceEqual':True,'nativePhysicalEquality':counts,'completeNativeLinks':len(links),'sourceWrites':0}

def accepted_metadata(acceptance_pin,connection_pin,recipe_template_pin):
    acceptance=C.read_pin(acceptance_pin);connection=C.read_pin(connection_pin);recipe=C.read_pin(recipe_template_pin)
    if acceptance.get('status')!='ROOT_ADOPTED_INDEPENDENT_COMPLETE_METER_ACCEPTANCE':raise RuntimeError('complete independent acceptance missing')
    if acceptance.get('fixtureConnectionPin')!=connection_pin or recipe.get('fixtureConnectionPin')!=connection_pin:raise RuntimeError('exact accepted connection differs')
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
    r=C.read_pin(acceptance['fullConnectionReview'])
    if r.get('model')!='deepseek-v4-pro' or r.get('route',{}).get('effort')!='high' or r.get('payload',{}).get('summary',{}).get('status')!='ok':raise RuntimeError('full connection independent review missing')
    owner=C.read_pin(recipe['freshOwnerGO']);day=C.read_pin(recipe['dayBindingAcceptance'])
    if owner['targetDatabase']!=connection['targetDatabase'] or day['day']!='2026-10-17' or day.get('positiveOriginalLAtBothWindowEnds')!=500:raise RuntimeError('owner or day binding invalid')
    for p in connection['applicationReadOnlyPins']+connection['databaseReadOnlyPins']:
        if C.pin(p['path'])!=p:raise RuntimeError('fixture asset drift')
    return acceptance,connection,recipe,day

def no_previous_attempt(connection):
    if CLAIM.exists():raise RuntimeError('one-time resources GO already claimed; never retry')
    case=Path(connection['caseDirectory']);n=case/'native-end-preparation'
    forbidden=[n/'LOCAL_ACTIVATION_STARTED.SAFE.json',n/'LOCAL_ACTIVATION_RESULT.SAFE.json',case/'FRESH_PACKET.PRIVATE.json',case/'LOCAL_ASSEMBLY_RESULT.SAFE.json',case/'CONTROLLER_STARTED.SAFE.json']
    if any(p.exists() for p in forbidden):raise RuntimeError('case already entered; no replay/retry')

def window(day):
    now=datetime.datetime.now(UTC);start=datetime.datetime.fromisoformat(day['startsAtUTC'].replace('Z','+00:00'));end=datetime.datetime.fromisoformat(day['endsAtUTC'].replace('Z','+00:00'))
    if now<start:return False,start,end
    if now.strftime('%Y-%m-%d')!=day['day'] or now.astimezone(ZoneInfo('Europe/Berlin')).strftime('%Y-%m-%d')!=day['day']:raise RuntimeError('real UTC/Berlin day mismatch')
    if (end-now).total_seconds()<8089.543088+600:raise RuntimeError('full remaining window lacks last actual workflow plus10min setup/close reserve')
    return True,start,end

def run(acceptance_pin,connection_pin,recipe_template_pin,*,wait=False):
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
    first=original_preflight()
    case=Path(connection['caseDirectory']);network='helmut-meter-net-w20-'+case.name.removeprefix('attempt-')
    parent='helmut-meter-resources17-'+case.name.removeprefix('attempt-')
    dbname=connection['containerName'];appname=dbname.replace('helmut-meter-db-','helmut-meter-app-',1)
    if I.K.docker(['inspect',dbname],check=False).returncode==0 or I.K.docker(['network','inspect',network],check=False).returncode==0:raise RuntimeError('actual owned resources already exist; no reuse')
    subnet=connection.get('approvedInternalSubnet')
    if subnet!='172.16.251.0/24':raise RuntimeError('exact original172 gateway subnet missing')
    network_ids=I.K.docker(['network','ls','-q']).stdout.split()
    networks=json.loads(I.K.docker(['network','inspect',*network_ids]).stdout)
    if any(ipaddress.ip_network(subnet).overlaps(ipaddress.ip_network(p['Subnet'])) for n in networks for p in (n['IPAM'].get('Config') or []) if ':' not in p.get('Subnet','')):
        raise RuntimeError('reviewed exact private subnet already occupied; no deletion or automatic substitute')
    I.K.save_new(case/'CONTROLLER_STARTED.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'preflight':first,'singleSetupAttempt':True,'noAutomaticRetry':True,'GOClaimed':False})
    storage_module=module('bounded','bounded-storage.py')
    # Choose one exact unbound minor with the previously accepted read-only
    # loop-control capability probe's kernel result. It is checked atomically
    # by LOOP_CONFIGURE; no occupied mapping is detached or reassigned.
    minor=acceptance['approvedFreshLoopMinor']
    storage_out=I.ONCE.parent/('full500-owned-storage17-'+case.name.removeprefix('attempt-'))
    storage=storage_module.create(storage_out,8000000000,minor,parent+'/storage',hold=connection['storageHoldSeconds'])
    if connection.get('approvedInternalSubnet')!='172.16.251.0/24':raise RuntimeError('exact unchanged172 gateway subnet missing')
    I.create_network(network,subnet=connection['approvedInternalSubnet'])
    db=I.create_database(case/'database',dbname,parent+'/database',network,scope='owner-approved-local500-resources',storage=storage,fixture=connection)
    # Fresh actual prerequisites AFTER the empty owned server is ready.
    second=original_preflight();valid,_,end=window(day)
    if not valid or CLAIM.exists():raise RuntimeError('fresh day or unused GO lost before actual start')
    q="begin read only;select count(*)from pg_database where datname in('"+connection['sourceDatabase']+"','"+connection['targetDatabase']+"');rollback;"
    empty=I.K.docker(['exec','-i','-u','postgres',dbname,'psql','-X','-qAt','-d','postgres','-c',q]).stdout.strip()
    if empty!='0':raise RuntimeError('fresh source/target database names already used in owned server')
    preflight_path=I.ONCE.parent/('RESOURCES17_START_PREFLIGHT_'+case.name.removeprefix('attempt-')+'.SAFE.json')
    preflight={'status':'PASS_EXACT_UNUSED_LOCAL500_RESOURCE_START','checkedAtUnixSeconds':time.time(),'atUTC':datetime.datetime.now(UTC).isoformat(),
      'windowEndsAtUTC':end.isoformat(),'sufficientSameUTCAndBerlinDayWindow':True,'originalSourcePreflight':second,
      'exactUnusedOwnedDatabaseVerified':True,'connectionPin':connection_pin,'independentMeterAcceptance':acceptance_pin,
      'actualEmptyDBContainerId':db['containerId'],'freshOwnerGO':recipe['freshOwnerGO'],'oneTimeGOUnused':True,'production':False}
    I.K.save_new(preflight_path,preflight)
    recipe.update(sourcePins=acceptance['sourcePins'],independentMeterAcceptance=acceptance_pin,freshStartPreflight=C.pin(preflight_path))
    I.verify_full_authority(recipe)
    app=I.launch_application(case/'application',appname,parent+'/application',network,recipe,db)
    I.K.save_new(case/'ACTUAL_RESOURCE_ATTEMPT_STARTED.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'application':app,'globalClaim':C.pin(CLAIM),'exactlyOneAttempt':True,'noRetry':True})
    print(json.dumps({'status':'ACTUAL_SINGLE_LOCAL500_RESOURCE_ATTEMPT_STARTED','caseDirectory':str(case),'globalGOClaimExists':True,'applicationContainerId':app['containerId'],'production':False}),flush=True)
    result=I.finalize(app,timeout=max(60,int((end-datetime.datetime.now(UTC)).total_seconds())+180))
    I.K.save_new(case/'CONTROLLER_COMPLETE.SAFE.json',{'atUTC':datetime.datetime.now(UTC).isoformat(),'pass':result['pass'],
      'completeResourceResult':C.pin(case/'application/COMPLETE_RESOURCE_RESULT.SAFE.json'),
      'originalSourceAfter':original_preflight(),'globalGOClaimPreserved':True,'noAutomaticRetry':True,'production':False})
    print(json.dumps({'status':'SINGLE_RESOURCE_ATTEMPT_COMPLETE','pass':result['pass'],'actualAllOwnedMemoryPeakBytes':result['simultaneousApplicationAndInfrastructureKernel']['memoryPeakBytes'],'CPUUsec':result['simultaneousApplicationAndInfrastructureKernel']['cpu']['usage_usec']}),flush=True)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--accepted-bindings',required=True);parser.add_argument('--run-exactly-once',action='store_true');parser.add_argument('--wait-for-reviewed-window',action='store_true');args=parser.parse_args()
    if not args.run_exactly_once:raise SystemExit('EXPLICIT_EXISTING_ONCE_GO_ACTION_REQUIRED')
    bindings=json.loads(Path(args.accepted_bindings).read_text())
    try:run(bindings['acceptance'],bindings['connection'],bindings['recipeTemplate'],wait=args.wait_for_reviewed_window)
    except Exception as error:
        print(json.dumps({'status':'STOP_NO_AUTOMATIC_RETRY','errorType':type(error).__name__,'reason':str(error) if isinstance(error,RuntimeError) else 'Inspect retained local evidence; do not replay any claimed attempt','globalGOClaimExists':CLAIM.exists(),'production':False}),flush=True)
        raise SystemExit(1)
