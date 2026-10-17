#!/usr/bin/env python3
"""One explicitly authorized correction of fixture INPUT; never runs Helmut.

Only a new database in the original LOCAL server may be written. The immutable
original dump is restored first. Capture/repair are preexisting input preparation,
outside the subsequently measured workflow; their wall time is reported separately.
No retries, profile activation, provider access or replacement of old claims.
"""
import datetime,hashlib,importlib.util,json,re,subprocess,time
from pathlib import Path

B=Path(__file__).parent
spec=importlib.util.spec_from_file_location('local_source',B/'capture-local-source.py')
S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
AREA=S.BASE/'wave20-resource-integration'
M=S.BASE/'wave19-resource-meter'
CORRECTION_CLAIM=M/'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json'
AUTHORIZATION='USER_GO_20261017_EXACT_ONE_DAY16_CORRECTION_AND_RESOURCE_RUN_V1'
NODE='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'

def pin(p):
    p=Path(p)
    if p.is_symlink() or p.resolve()!=p or not p.is_file():raise RuntimeError('canonical regular input required')
    b=p.read_bytes();return dict(path=str(p),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())

def read(p):
    if pin(p['path'])!=p:raise RuntimeError('zero-day input pin drift')
    return json.loads(Path(p['path']).read_text())

def save(p,v):
    with Path(p).open('x')as f:json.dump(v,f,indent=2);f.write('\n')
    Path(p).chmod(0o600);return pin(p)

def query(db,sql,*,readonly=True):
    if db not in [S.SOURCE,'postgres'] and not re.fullmatch(r'helmut_resource_input_20261017_[a-f0-9]{12}',db):raise RuntimeError('only explicit local input database allowed')
    text=("BEGIN READ ONLY;SET LOCAL statement_timeout='20s';"+sql+'ROLLBACK;')if readonly else sql
    r=subprocess.run(S.DOCKER+['exec','-i',S.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-f','-'],input=text,text=True,capture_output=True,check=True,timeout=40)
    return json.loads(r.stdout)if r.stdout.strip()else None

FINANCIAL="SELECT jsonb_build_object('nativeAuthText',(select data::text from helmut_store where id='main-auth'),'nativeAuthSHA',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id='main-auth'),'completeNativeCounterText',(select coalesce(jsonb_agg(to_jsonb(c)order by to_jsonb(c)::text),'[]'::jsonb)::text from llm_budget_counters c));"

def witness(db):
    w=query(db,FINANCIAL)
    for text,digest in [('nativeAuthText','nativeAuthSHA'),('completeNativeCounterText','completeNativeCounterSHA')]:
        actual=hashlib.sha256(w[text].encode()).hexdigest()
        if digest in w and actual!=w[digest]:raise RuntimeError('native financial hash mismatch')
        w[digest]=actual
    return w

def owner(p):
    o=read(p)
    if o.get('authorizationId')!=AUTHORIZATION or o.get('production')is not False or o.get('syntheticProfiles')!=500 or o.get('paidProviderCallsAllowed')is not False or o.get('exactlyOneResourceAttempt')is not True:raise RuntimeError('exact new user authorization required')
    suffix=o['targetDatabase'].removeprefix('helmut_resource_fixture_20261017_')
    if not re.fullmatch('[a-f0-9]{12}',suffix)or o.get('correctionDatabase')!='helmut_resource_input_20261017_'+suffix:raise RuntimeError('new local input/target binding invalid')
    case=AREA/('attempt-'+suffix)
    if o.get('correctedSourceCapturePath')!=str(case/'corrected-input/READ_ONLY_SOURCE_CAPTURE.SAFE.json'):raise RuntimeError('exact new corrected input capture path required')
    read(o['previousConsumedClaimPin']);read(o['previousSetupReservationPin'])
    return o,case

def validate_change(original,corrected):
    a=json.loads(original['nativeAuthText']);b=json.loads(corrected['nativeAuthText'])
    if original['completeNativeCounterText']!=corrected['completeNativeCounterText']or json.loads(original['completeNativeCounterText'])!=[]:raise RuntimeError('complete actual counter table must remain exactly empty')
    if '2026-10-16'in a['testKostenTage']or set(b['testKostenTage'])!=set(a['testKostenTage'])|{'2026-10-16'}:raise RuntimeError('only missing historical16 may be inserted')
    c=json.loads(json.dumps(b));del c['testKostenTage']['2026-10-16'];c['testKostenAuftrag']['bookCapacity']=a['testKostenAuftrag']['bookCapacity']
    if c!=a or b['testKostenAuftrag']['bookCapacity']!=38:raise RuntimeError('existing financial content/limits changed')
    return True

def verify_capture(capture_pin,owner_pin):
    o,case=owner(owner_pin);c=read(capture_pin)
    if capture_pin['path']!=o['correctedSourceCapturePath']or c.get('freshOwnerGO')!=owner_pin:raise RuntimeError('corrected input authority mismatch')
    original=read(c['originalFinancialWitnessPin']);actual_original=witness(S.SOURCE)
    if any(actual_original[k]!=original[k]for k in actual_original):raise RuntimeError('original monetary state changed')
    corrected=read(c['correctedFinancialWitnessPin']);actual=witness(o['correctionDatabase'])
    if actual!=corrected:raise RuntimeError('corrected input copy changed')
    validate_change(original,actual)
    receipt=read(c['correctionReceiptPin'])
    if receipt.get('pass')is not True or receipt.get('freshOwnerGO')!=owner_pin or receipt.get('historicalDaysAdded')!=['2026-10-16']or receipt.get('correctionWrites')!=1:raise RuntimeError('exact single correction receipt absent')
    for p in [c['sourceDump'],c['localRolesSQL'],c['postgrestBinary']]:
        if pin(p['path'])!=p:raise RuntimeError('corrected fixture artifact drift')
    return actual

def apply(owner_pin):
    o,case=owner(owner_pin);began=time.monotonic()
    if CORRECTION_CLAIM.exists():raise RuntimeError('correction already claimed; never repeat')
    now=datetime.datetime.now(datetime.timezone.utc)
    if now.date().isoformat()!='2026-10-17'or(datetime.datetime.fromisoformat('2026-10-17T08:59:59.999+00:00')-now).total_seconds()<8689.543088:raise RuntimeError('insufficient reviewed day window before correction')
    base=read(o['originalSourceCapturePin']);original=read(o['originalFinancialWitnessPin']);fresh=witness(S.SOURCE)
    if any(fresh[k]!=original[k]for k in fresh):raise RuntimeError('original complete financial witness drift')
    if base['before']!=S.identity()or base['before']!=base['after']or base['sourceWrites']!=0:raise RuntimeError('original source identity drift')
    if query('postgres','SELECT count(*)from pg_database where datname='+S.lit(o['correctionDatabase'])+';')!=0:raise RuntimeError('correction input database already exists')
    for p in [base['sourceDump'],base['localRolesSQL'],base['postgrestBinary']]:
        if pin(p['path'])!=p:raise RuntimeError('original capture artifact drift')
    projection_pin=o['financialModulePin'];pin_bytes=Path(projection_pin['path']).read_bytes()
    if pin(projection_pin['path'])!=projection_pin:raise RuntimeError('original financial projection module drift')
    js="const fs=require('fs'),assert=require('assert/strict'),K=require(process.argv[1]),EU=require(process.argv[2]),P=require(process.argv[3]);const w=JSON.parse(fs.readFileSync(0,'utf8'));assert.equal(w.completeNativeCounterText,'[]');const x=P.prepareMissingHistoricalZeroDays(JSON.parse(w.nativeAuthText),'2026-10-17',{scope:'ACTUAL_FROZEN_LOCAL_COUNTER_TABLE',readSucceeded:true,rows:[]},K,EU);assert.deepEqual(x.addedHistoricalDays,['2026-10-16']);const f=require(process.argv[4]).financialProposal(x.auth,0,new Date().toISOString(),K,EU);assert.equal(f.projection.restreserveMikroUsd,EU.RUN_MAX_MICRO_USD);process.stdout.write(JSON.stringify(x.auth));"
    proposed=subprocess.run([NODE,'-e',js,str(S.BASE.parent/'helmut-cpu-epoch-20261015/lib/helmut/testkosten-budget.js'),str(S.BASE.parent/'helmut-cpu-epoch-20261015/lib/helmut/synthetik-500-eu-service-contract.js'),str(B/'local-historical-zero-day.PROPOSAL.js'),projection_pin['path']],input=json.dumps(original),text=True,capture_output=True,check=True,timeout=30).stdout
    save(CORRECTION_CLAIM,{'freshOwnerGO':owner_pin,'correctionDatabase':o['correctionDatabase'],'atUTC':now.isoformat(),'once':True,'resourceRunGOConsumed':False,'noAutomaticRetry':True})
    out=case/'corrected-input';out.mkdir(mode=0o700,parents=True,exist_ok=False)
    query('postgres','CREATE DATABASE "'+o['correctionDatabase']+'";',readonly=False)
    subprocess.run(S.DOCKER+['exec','-i',S.CONTAINER,'pg_restore','-U','postgres','--exit-on-error','-d',o['correctionDatabase']],input=Path(base['sourceDump']['path']).read_bytes(),capture_output=True,check=True,timeout=120)
    if witness(o['correctionDatabase'])!=fresh:raise RuntimeError('new copy does not equal complete frozen financial original')
    # Complete counter table SHARE lock prevents concurrent writes; auth row
    # equality and the table equality are checked again INSIDE the transaction.
    sql="BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='20s';LOCK TABLE llm_budget_counters IN SHARE MODE;DO $repair$ BEGIN IF (SELECT data::text FROM helmut_store WHERE id='main-auth' FOR UPDATE)IS DISTINCT FROM "+S.lit(original['nativeAuthText'])+" OR (SELECT coalesce(jsonb_agg(to_jsonb(c)order by to_jsonb(c)::text),'[]'::jsonb)::text FROM llm_budget_counters c)IS DISTINCT FROM "+S.lit(original['completeNativeCounterText'])+" THEN RAISE EXCEPTION 'zero-day-native-state-drift';END IF;UPDATE helmut_store SET data="+S.lit(proposed)+"::jsonb WHERE id='main-auth';IF NOT FOUND THEN RAISE EXCEPTION 'zero-day-auth-row-absent';END IF;END $repair$;COMMIT;"
    query(o['correctionDatabase'],sql,readonly=False)
    corrected=witness(o['correctionDatabase']);validate_change(original,corrected)
    if witness(S.SOURCE)!=fresh or S.identity()!=base['before']:raise RuntimeError('original source changed during isolated correction')
    corrected_pin=save(out/'CORRECTED_NATIVE_FINANCIAL_WITNESS.PRIVATE.json',corrected)
    receipt=save(out/'CORRECTION_RESULT.SAFE.json',{'pass':True,'freshOwnerGO':owner_pin,'database':o['correctionDatabase'],'historicalDaysAdded':['2026-10-16'],'correctionWrites':1,'existingBooksPreserved':37,'monetaryLimitsUnchanged':True,'originalSourceUnchanged':True,'originalFinancialWitnessPin':o['originalFinancialWitnessPin'],'correctedFinancialWitnessPin':corrected_pin,'inputPreparationWallMS':(time.monotonic()-began)*1000,'scope':'ISOLATED_INPUT_PREPARATION_OUTSIDE_MEASURED_HELMUT_WORKFLOW','resourceGOConsumed':False,'profileActivations':0,'production':False})
    dump=out/'CORRECTED_FROZEN_SOURCE.PRIVATE.dump'
    with dump.open('xb')as f:subprocess.run(S.DOCKER+['exec',S.CONTAINER,'pg_dump','-U','postgres','-Fc','-d',o['correctionDatabase']],stdout=f,stderr=subprocess.PIPE,check=True,timeout=120)
    dump.chmod(0o600)
    capture={**base,'sourceDump':pin(dump),'originalSourceCapturePin':o['originalSourceCapturePin'],'originalFinancialWitnessPin':o['originalFinancialWitnessPin'],'correctedFinancialWitnessPin':corrected_pin,'correctionReceiptPin':receipt,'capturedFromNewLocalInputDatabase':o['correctionDatabase'],'freshOwnerGO':owner_pin,'inputCorrectionScope':'ONLY_MISSING_ZERO_DAY16_NEW_COPY_NOT_ORIGINAL','captureWallMS':(time.monotonic()-began)*1000}
    p=save(out/'READ_ONLY_SOURCE_CAPTURE.SAFE.json',capture);verify_capture(p,owner_pin);return p

if __name__=='__main__':raise SystemExit('IMPORT_ONLY_REVIEWED_EXACT_NEW_OWNER_GO_REQUIRED')
