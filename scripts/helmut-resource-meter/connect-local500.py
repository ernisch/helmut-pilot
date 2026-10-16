#!/usr/bin/env python3
"""Stage ONLY pinned existing local500 harness with exact owned bindings.

No Docker, activation, database, model, GO claim or execution on import/stage.
Original harness/data remain unchanged. Each textual delta is retained for
independent review; no application/engine file is edited.
"""
import hashlib,json,os,re,secrets
from pathlib import Path

REPO=Path('/workspace/helmut-cpu-epoch-20261015')
BASE=Path('/workspace/helmut-parallel-20261015')
AREA=BASE/'wave20-resource-integration'
BIN=REPO/'scripts/helmut-resource-meter'
SOURCE='helmut_fresh_input_fixture_d2e98984'

def pin(file):
    p=Path(file)
    if p.is_symlink() or not p.is_file():raise RuntimeError('regular pinned file required')
    b=p.read_bytes();return {'path':str(p.resolve()),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

def read_pin(p):
    if pin(p['path'])!=p:raise RuntimeError('input pin drift')
    return json.loads(Path(p['path']).read_text())

def save(p,value):
    p=Path(p)
    with p.open('x') as f:f.write(value if isinstance(value,str) else json.dumps(value,indent=2)+'\n')
    p.chmod(0o600);return pin(p)

def stage(case,*,target,container,operation,day_rows_pin,day_acceptance_pin,owner_go_pin):
    case=Path(case).resolve()
    if case.parent!=AREA or not re.fullmatch('attempt-[a-f0-9]{12}',case.name):raise RuntimeError('exact fresh local case directory required')
    if not re.fullmatch('helmut_resource_fixture_20261017_[a-f0-9]{12}',target):raise RuntimeError('new owned target required')
    if not re.fullmatch('helmut-meter-db-w20-[a-f0-9]{12}',container):raise RuntimeError('new owned container required')
    if not re.fullmatch('synthetik500-resources17-[a-f0-9]{12}',operation):raise RuntimeError('new operation required')
    read_pin(day_rows_pin)
    day=read_pin(day_acceptance_pin)
    if day.get('status')!='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER' or day.get('day')!='2026-10-17':raise RuntimeError('accepted actual day17 binding missing')
    if day.get('adoptedRowsPin')!=day_rows_pin:raise RuntimeError('accepted exact current inputs required')
    owner=read_pin(owner_go_pin)
    if owner.get('production') is not False or owner.get('syntheticProfiles')!=500 or owner.get('targetDatabase')!=target:
        raise RuntimeError('existing once GO exact new local binding required')
    templates=json.loads((BIN/'legacy-harness-pins.json').read_text())['files']
    for p in templates:
        if pin(p['path'])!={k:p[k] for k in ['path','bytes','sha256']}:raise RuntimeError('original harness drift')
    case.mkdir(mode=0o700,exist_ok=False);n=case/'native-end-preparation';n.mkdir(mode=0o700);(n/'runtime-candidates').mkdir(mode=0o700)
    replacements=[('helmut_fresh_runtime_fixture_b27c2026',target),('helmut-boundary-pg-bd7dd5da',container),
      ('synthetik500-localnative16-b27c20261016',operation),('2026-10-16','2026-10-17'),
      ("B+'/wave15/native-end-preparation'",repr(str(n))),
      ("B+'/wave13/NORMALIZED500_CURRENT_POLICY.PRIVATE.json'",repr(day_rows_pin['path'])),
      ("O+'/OWNER_LOCAL_GO.PRIVATE.json'",repr(owner_go_pin['path'])),
      ('/tmp/helmut-fresh-runtime-fixture-b27c2026.conf','/tmp/helmut-resource-fixture.conf')]
    deltas=[]
    for template in templates:
        original=Path(template['path']).read_text();text=original;changes=[]
        for old,new in replacements:
            count=text.count(old)
            if count:text=text.replace(old,new);changes.append({'from':old,'to':new,'count':count})
        if template['relative']=='native-end-preparation/prepare-current-local-runtime.js':
            old="Date.parse(day+'T23:59:59.999Z'),berlinEnd)"
            new="Date.parse(day+'T23:59:59.999Z'),berlinEnd,Date.parse(ACTION.reviewedDayWindowEndUTC))"
            if text.count(old)!=1:raise RuntimeError('exact original window expression required')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
        if template['relative']=='native-end-preparation/runtime-candidates/start-services.candidate.js':
            old="H.assert(/^172\\.(?:\\d{1,3}\\.){2}\\d{1,3}$/.test(ips[0]));"
            # Preserve this guard unchanged: the private Docker bridge uses172/8.
            if text.count(old)!=1:raise RuntimeError('original internal-address guard missing')
        if template['relative']=='assemble-after-activation.js':
            old="const initialSourceBinding=require(R+'/lib/helmut/synthetik-500-content-runner').sourceBinding()"
            if text.count(old)!=1:raise RuntimeError('original assembly source binding missing')
        if template['relative']=='native-end-preparation/local-provider.js':
            old="      const deliver=()=>{"
            new="      record.mockResponsePayloadBytes=Buffer.byteLength(response);record.mockResponseDelivered=false;\n      const deliver=()=>{"
            if text.count(old)!=1:raise RuntimeError('original mock response observation point missing')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
            old="const reply=new EventEmitter();reply.statusCode=200;"
            new="record.mockResponseDelivered=true;const reply=new EventEmitter();reply.statusCode=200;"
            if text.count(old)!=1:raise RuntimeError('original mock delivery point missing')
            text=text.replace(old,new);changes.append({'from':old,'to':new,'count':1})
        destination=case/template['relative'];save(destination,text)
        deltas.append({'original':{k:template[k] for k in ['path','bytes','sha256']},'staged':pin(destination),'replacements':changes})
    original_action=json.loads((BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_ACTION.SAFE.json').read_text())
    action={**original_action,'container':container,'sourceDatabaseReadOnly':SOURCE,'onlyNewTargetDatabase':target,
      'newOperationId':operation,'reviewedDayWindowEndUTC':day['endsAtUTC'],
      'status':'BOUND_EXISTING_UNUSED_ONE_TIME_LOCAL_RESOURCES_GO_ONLY','requiredGOConfirmation':
      'GO_LOCAL_ONLY_CREATE_'+target+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE','authorized':True,
      'allowedLocalEffectsAfterGO':[str(x).replace('16Oct','17Oct') for x in original_action['allowedLocalEffectsAfterGO']]}
    save(n/'LOCAL_ACTIVATION_ACTION.SAFE.json',action)
    plan={'schema':'helmut-exact-local500-connection/1','scope':'STAGED_NOT_EXECUTED','caseDirectory':str(case),
      'workflowDirectory':str(n),'sourceDatabase':SOURCE,'targetDatabase':target,'containerName':container,
      'operationId':operation,'day':'2026-10-17','dayAcceptance':day_acceptance_pin,'dayRows':day_rows_pin,
      'ownerGOPath':owner_go_pin['path'],'ownerGOPin':owner_go_pin,'originalAction':pin(BASE/'wave15/native-end-preparation/LOCAL_ACTIVATION_ACTION.SAFE.json'),
      'action':pin(n/'LOCAL_ACTIVATION_ACTION.SAFE.json'),'templateDeltas':deltas,
      'freshSelectorComesFromPinnedActualAssembly':True,'full500RunStarted':False,'resourceGOConsumed':False,
      'engineModified':False,'originalFilesModified':False,'production':False}
    save(case/'STAGED_CONNECTION.SAFE.json',plan);return plan

if __name__=='__main__':
    raise SystemExit('IMPORT_ONLY_EXACT_ROOT_REVIEWED_STAGE_CALL_REQUIRED')
