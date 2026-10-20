#!/usr/bin/env python3
"""Fixed next LOCAL resource slot; preparation is never execution authority.

Consumed attempts and completed input corrections are immutable.
The corrected fixture is input provenance only, never a reusable owner GO.
No effects on import. This module cannot reserve, activate, repair or run.
"""
import datetime
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

BIN=Path(__file__).resolve().parent
BASE=Path('/workspace/helmut-parallel-20261015')
METER=BASE/'wave19-resource-meter'
DAY='2026-10-20'
DATE_TAG='20261020'
# Both real entrypoints read this same source-pinned local definition. Updating
# a fixed slot must never leave the measured JS stage on a spent old claim.
SLOT=json.loads((BIN/'local-resource-authority-slot.json').read_text())
if (type(SLOT)is not dict or set(SLOT)!={'schema','day','version'}
  or SLOT['schema']!='helmut-local-resource-authority-slot/1' or SLOT['day']!=DAY
  or type(SLOT['version'])is not int or SLOT['version']!=11):
    raise RuntimeError('invalid pinned local resource authority slot')
SLOT_VERSION=SLOT['version']
_source_spec=importlib.util.spec_from_file_location('bound_frozen_source_runtime',BIN/'capture-local-source.py')
SOURCE_RUNTIME=importlib.util.module_from_spec(_source_spec);_source_spec.loader.exec_module(SOURCE_RUNTIME)
AUTHORIZATION=f'USER_GO_{DATE_TAG}_EXACT_ONE_RESOURCE_ONLY_V{SLOT_VERSION}'
CLAIM=METER/f'NEXT_RESOURCE{DAY[-2:]}_V{SLOT_VERSION}_GO_CLAIM.SAFE.json'
RESERVATION=METER/f'NEXT_RESOURCE{DAY[-2:]}_V{SLOT_VERSION}_SETUP_RESERVATION.SAFE.json'
SUBNET='172.16.241.0/24'
OLD_MARKERS=[METER/name for name in [
 'ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json','GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json',
 'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json',
 'DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json','NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json','NEXT_RESOURCE17_V4_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE18_V5_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V5_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE18_V6_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V6_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE18_V7_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V7_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE19_V8_GO_CLAIM.SAFE.json','NEXT_RESOURCE19_V8_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE19_V9_GO_CLAIM.SAFE.json','NEXT_RESOURCE19_V9_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE20_V10_GO_CLAIM.SAFE.json','NEXT_RESOURCE20_V10_SETUP_RESERVATION.SAFE.json']]
PRESERVED_MARKER_PINS=[{'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json', 'bytes': 815, 'sha256': '92096d184adc88feaefa1393c3115840dd2e0960379d108de42be2d1e57005e5'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json', 'bytes': 1203, 'sha256': 'e0dfa98ab19d0ed917e7fca15817766a370a593005625b807f4474ff3a827cc4'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json', 'bytes': 454, 'sha256': 'e01e8a20f8cded6a9285d07763fe40ce0cac7d279479c5faa05ad6a4a1de4e60'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json', 'bytes': 815, 'sha256': 'a376c1abf5541728b2e5c565c0b0576ee6a87723f8d06125d5a0ec574ddc8853'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json', 'bytes': 1203, 'sha256': '7ea29623fc80b6a75dd475463d1c1802e340e75b1c6509ebf7e6d45d21357088'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json'),'bytes':799,'sha256':'8fe50e440b83c4f2a67225a1585c86997bc8fc60e04dcc0ef7bb997dff648a81'},
 {'path':str(METER/'NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json'),'bytes':1458,'sha256':'260b16e6e841c77ef814a7389ad0e0b883518c33cbba3ac9bc00a2fb54dcd036'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json'),'bytes':796,'sha256':'6d51c4f9eab8bcb8d465c46ee21e7d926f428f6ec1ff1553840fcc7ef50e6481'},
 {'path':str(METER/'NEXT_RESOURCE17_V4_SETUP_RESERVATION.SAFE.json'),'bytes':1519,'sha256':'6f899ce4c4faff5635f6d1d6798be93c85f5681aee22ad44ae8046a0327a6ad5'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE18_V5_GO_CLAIM.SAFE.json'),'bytes':808,'sha256':'d03997e1319ec12edcf5c536aaa35f1521462c48337f6cf694710336f63c45f1'},
 {'path':str(METER/'NEXT_RESOURCE18_V5_SETUP_RESERVATION.SAFE.json'),'bytes':1531,'sha256':'870e9c1f2c06bebf2cb6ff9b539680f5741df6fca39c80b7443d679b8a02aaed'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE18_V6_GO_CLAIM.SAFE.json'),'bytes':800,'sha256':'20fcaaa21241b24bca520dbfbee05c765c92e05ab44e2f30ff55c5e8937845bb'},
 {'path':str(METER/'NEXT_RESOURCE18_V6_SETUP_RESERVATION.SAFE.json'),'bytes':1523,'sha256':'28ecd650cf8ea502eac2c0cb987b60a769c38dc2006aad6178c8aead5952bd78'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE18_V7_GO_CLAIM.SAFE.json'),'bytes':797,'sha256':'29132c4c3dbf98593d4a2b49b5a752a0d18e0c0a621e31c5959abec05c73c3ba'},
 {'path':str(METER/'NEXT_RESOURCE18_V7_SETUP_RESERVATION.SAFE.json'),'bytes':1520,'sha256':'c7c721eaa11c2796e3ee7740c526e44e468ca96b989f63648ee5a50b0fc77524'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE19_V8_GO_CLAIM.SAFE.json'),'bytes':792,'sha256':'39323645802fe815cec4244b229f68ce265140e4186b5bddf99d03eee5154aa3'},
 {'path':str(METER/'NEXT_RESOURCE19_V8_SETUP_RESERVATION.SAFE.json'),'bytes':1515,'sha256':'3beab4bfacc5835b4cedc5c214653e18ec719883f1ee73be37cad2383650141b'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE19_V9_GO_CLAIM.SAFE.json'),'bytes':866,'sha256':'3af635b8f5450ea4e0fc23cbaceab7c6f8261028b938c1a542c0a1a9498ad9f1'},
 {'path':str(METER/'NEXT_RESOURCE19_V9_SETUP_RESERVATION.SAFE.json'),'bytes':1589,'sha256':'32054d5a770a926c57688f6aad38feec06449999e18d24245f7ef31c60f02022'}]
PRESERVED_MARKER_PINS += [
 {'path':str(METER/'NEXT_RESOURCE20_V10_GO_CLAIM.SAFE.json'),'bytes':875,'sha256':'6fdb6f4189d0a5150db693eff38935a2273c6b0eb373d1be101c87db50f45cfe'},
 {'path':str(METER/'NEXT_RESOURCE20_V10_SETUP_RESERVATION.SAFE.json'),'bytes':1598,'sha256':'7e1d8938c585c6fc983eaf98f4d13c0f01d1cba66532204be2f8fa84323ce7c2'}]
PREVIOUS_CAPTURE=BASE/'wave20-resource-integration/attempt-64a99d4ac9fb/corrected-input/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
PREVIOUS_CAPTURE_SHA='37701d014b73311da59f3daf92d8344074a48aaea5586c7f73d1728026d185a3'
BOOK17_CAPTURE=BASE/'wave30-resource-start-gaps/input18-ab76c911dac8/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
BOOK17_CAPTURE_SHA='1c99ee530e83e65967ea723be857841b501ca8b13c6e783a4c8f3c99687f8cfc'
BOOK17_INPUT_DATABASE='helmut_resource_input_20261018_ab76c911dac8'
BOOK18_CAPTURE=BASE/'wave41-approved-local-preparations/input19-e400dff25393/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
BOOK18_CAPTURE_SHA='d77599a0e5178e7ecaad89c7da80c95b1aee83db0cbf4a30dd2782f4a44d5db0'
BOOK18_INPUT_DATABASE='helmut_resource_input_20261019_e400dff25393'
BOOK17_CLAIM_PIN={'path':str(BASE/'wave30-resource-start-gaps/ONCE_ONLY_BOOK17_INPUT_CORRECTION_CLAIM.SAFE.json'),
  'bytes':734,'sha256':'3b60362f7d92b5deee52b29d91e4420e1f72974a496122603d4b4237eb7c3dd3'}
BOOK18_CLAIM_PIN={'path':str(BASE/'wave41-approved-local-preparations/ONCE_ONLY_BOOK18_INPUT_CORRECTION_CLAIM.SAFE.json'),
  'bytes':1447,'sha256':'487bf4db5882589ad6f84c75673a0422d8011adce83941da236d4f2d20a326e5'}

def require(ok,reason):
    if not ok:raise RuntimeError(reason)

def pin(file):
    p=Path(file);require(p.is_absolute()and p.resolve()==p and not p.is_symlink()and p.is_file(),'canonical regular input required')
    b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

def read(p):
    require(pin(p['path'])==p,'next resource binding drift')
    return json.loads(Path(p['path']).read_text())

def validate_owner(owner,connection,*,planning=False):
    """Shared technical policy; a planning-only intent NEVER satisfies real GO."""
    require(type(planning)is bool,'planning must be an explicit boolean')
    require(connection.get('preparedWithoutGO')is planning,'pending/executable candidate mode mismatch')
    expected={'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
      'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':AUTHORIZATION,
      'targetDatabase':connection['targetDatabase'],'operationId':connection['operationId'],
      'caseDirectory':connection['caseDirectory'],'sourceCapturePin':connection['sourceCapture']}
    for k,v in expected.items():
        require(type(owner.get(k))is type(v)and owner.get(k)==v,'exact next local owner policy required: '+k)
    claims=owner.get('previousConsumedMarkers',[])
    require(len(claims)==len(OLD_MARKERS)and{p['path']for p in claims}==set(map(str,OLD_MARKERS)),
      'all consumed markers must remain independently pinned')
    require({p['path']:p for p in claims}=={p['path']:p for p in PRESERVED_MARKER_PINS},'historical marker baseline differs')
    for p in claims:read(p)
    final=Path(owner.get('finalOwnerGOPath',''))
    suffix=Path(connection['caseDirectory']).name.removeprefix('attempt-')
    require(final==METER/(f'OWNER_RESOURCE{DAY[-2:]}_V{SLOT_VERSION}_'+suffix+'.PRIVATE.json'),'exact new owner GO path required')
    confirmation='GO_LOCAL_ONLY_CREATE_'+connection['targetDatabase']+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE'
    require(owner.get('requiredConfirmation')==confirmation,'exact proposed confirmation required')
    if planning:
        require(owner.get('schema')=='helmut-owner-local-fixture-intent/1'and owner.get('authorized')is False,
          'planning requires an explicitly unauthorized intent')
        require(not any(k in owner for k in ['approvedAtUTC','ownerAuthorizationReference','confirmation']),
          'intent must not fabricate approval fields')
        require(not final.exists()and not final.is_symlink(),'future actual owner GO already exists')
    else:
        require(owner.get('schema')=='helmut-owner-local-fixture-go/1'and owner.get('authorized')is True,
          'new explicit actual owner GO missing')
        require(owner.get('confirmation')==confirmation,'new owner confirmation missing')
        try:approved=datetime.datetime.fromisoformat(owner['approvedAtUTC'].replace('Z','+00:00'))
        except (ValueError,KeyError,TypeError):raise RuntimeError('new owner approval time missing')
        require(approved.tzinfo is not None and approved<=datetime.datetime.now(datetime.timezone.utc),'new owner approval time invalid')
        require(isinstance(owner.get('ownerAuthorizationReference'),str)and len(owner['ownerAuthorizationReference'])>=20,
          'new explicit user authorization reference missing')
    return {'allPriorClaimsPreserved':len(claims),'allowDispose':False,'actualGO':not planning}

def _verify_previous_capture(capture_pin,*,actual=True):
    """Read actual native bytes plus fixed historical receipt/claim provenance.

    This validates DATA. It never invokes the old owner() authority verifier,
    repeats its correction, grants a resource attempt or mutates an old GO.
    """
    require(capture_pin['path']==str(PREVIOUS_CAPTURE)and capture_pin['sha256']==PREVIOUS_CAPTURE_SHA,
      'only exact already corrected input may be reused')
    capture=read(capture_pin)
    require(capture['sourceWrites']==0 and capture['before']==capture['after'],'original capture must be read-only')
    receipt=read(capture['correctionReceiptPin'])
    historical=read(pin(METER/'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json'))
    consumed=read(pin(METER/'DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json'))
    require(historical['freshOwnerGO']==capture['freshOwnerGO']==receipt['freshOwnerGO']==consumed['freshOwnerGO'],
      'historical data correction provenance mismatch')
    require(historical['correctionDatabase']==capture['capturedFromNewLocalInputDatabase']==receipt['database'],
      'corrected input identity mismatch')
    require(receipt['pass']is True and receipt['historicalDaysAdded']==['2026-10-16']and receipt['correctionWrites']==1
      and receipt['monetaryLimitsUnchanged']is True and receipt['originalSourceUnchanged']is True,
      'exact completed correction receipt required')
    for k in ['correctedFinancialWitnessPin','originalFinancialWitnessPin']:
        require(capture[k]==receipt[k],'historical witness binding differs')
    if not actual:return capture
    SOURCE_RUNTIME.verify_runtime_binding()
    spec=importlib.util.spec_from_file_location('existing_zero_day_data',BIN/'local-zero-day-copy.py')
    Z=importlib.util.module_from_spec(spec);spec.loader.exec_module(Z)
    original=read(capture['originalFinancialWitnessPin']);actual_original=Z.witness(Z.S.SOURCE)
    require(all(original[k]==v for k,v in actual_original.items()),'original native finances changed')
    actual=Z.witness(capture['capturedFromNewLocalInputDatabase'])
    require(actual==read(capture['correctedFinancialWitnessPin']),'corrected native finances changed')
    Z.validate_change(original,actual)
    for key in ['sourceDump','localRolesSQL','postgrestBinary']:require(pin(capture[key]['path'])==capture[key],'preexisting fixture asset changed')
    return actual


def _book17_data_pins(capture_pin):
    """Shared exact source-data reads for host checks AND container mounts.

    Explicit provenance only: owner approvals mentioned by these documents are
    never opened, recursively mounted or reused as resource authority.
    """
    require(capture_pin['path']==str(BOOK17_CAPTURE)and capture_pin['sha256']==BOOK17_CAPTURE_SHA,
      'only exact already corrected input may be reused')
    capture=read(capture_pin)
    previous_pin=capture['previousCorrectedCapturePin']
    require(previous_pin['path']==str(PREVIOUS_CAPTURE)and previous_pin['sha256']==PREVIOUS_CAPTURE_SHA,
      'exact prior input correction provenance required')
    previous=read(previous_pin)
    paths=[capture_pin,previous_pin]
    paths += [capture[k] for k in ['originalFinancialWitnessPin','previousCorrectedFinancialWitnessPin',
      'correctedFinancialWitnessPin','correctionReceiptPin','sourceDump','localRolesSQL','postgrestBinary']]
    paths += [previous['correctionReceiptPin']]
    paths += [p for p in PRESERVED_MARKER_PINS if Path(p['path']).name in
      ['ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json']]
    # This is a completed INPUT correction receipt/claim, never a resource GO.
    paths.append(BOOK17_CLAIM_PIN)
    distinct={p['path']:p for p in paths}
    require(len(distinct)==len(paths),'unexpected duplicate source-data binding')
    for p in paths:require(pin(p['path'])==p,'source-data dependency drift')
    return paths


def _book18_data_pins(capture_pin):
    """Complete explicit new/previous DATA closure for checks and mounts.

    freshOwnerGO/authorityPin values are compared as historical provenance
    links only. Their owner-GO files are never opened or mounted here.
    """
    require(capture_pin['path']==str(BOOK18_CAPTURE)and capture_pin['sha256']==BOOK18_CAPTURE_SHA,
      'only exact completed book18 input may be reused')
    capture=read(capture_pin)
    previous_pin=capture['previousCorrectedCapturePin']
    require(previous_pin['path']==str(BOOK17_CAPTURE)and previous_pin['sha256']==BOOK17_CAPTURE_SHA,
      'exact book17 input provenance required')
    paths=_book17_data_pins(previous_pin)+[capture_pin,BOOK18_CLAIM_PIN]
    paths += [capture[k] for k in ['correctedFinancialWitnessPin','correctionReceiptPin','sourceDump']]
    # Shared original witness/roles/binary are already in the historical closure.
    previous=read(previous_pin)
    for key in ['originalSourceCapturePin','originalFinancialWitnessPin','localRolesSQL','postgrestBinary']:
        require(capture[key]==previous[key],'prior input provenance changed')
    require(capture['previousCorrectedFinancialWitnessPin']==previous['correctedFinancialWitnessPin'],
      'prior native witness differs')
    require(len({p['path']for p in paths})==len(paths),'unexpected duplicate source-data binding')
    for p in paths:require(pin(p['path'])==p,'source-data dependency drift')
    return paths


def _query_input_database(sql,database):
    """Read only one of the two exact preserved local input databases."""
    require(database in [BOOK17_INPUT_DATABASE,BOOK18_INPUT_DATABASE,INPUT_DATABASE],'fixed completed input database required')
    SOURCE_RUNTIME.verify_runtime_binding()
    command=SOURCE_RUNTIME.DOCKER+['exec','-i',SOURCE_RUNTIME.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-']
    text="BEGIN READ ONLY;SET LOCAL statement_timeout='20s';"+sql+'ROLLBACK;'
    result=subprocess.run(command,input=text,text=True,capture_output=True,timeout=40,check=True)
    return json.loads(result.stdout)


def _query_book18_input(sql):
    """Read ONLY the current fixed completed19Oct input; never a writable mode."""
    return _query_input_database(sql,BOOK18_INPUT_DATABASE)


def _verify_book17_capture(capture_pin,*,actual=True):
    """Verify both completed corrections as DATA, never as reusable approval."""
    _book17_data_pins(capture_pin)
    capture=read(capture_pin);previous=read(capture['previousCorrectedCapturePin'])
    _verify_previous_capture(capture['previousCorrectedCapturePin'],actual=actual)
    require(capture['source']==BOOK17_INPUT_DATABASE and capture['before']==capture['after']==previous['before']
      and capture['sourceWrites']==0 and capture['newCopyFinancialWrites']==1
      and capture['resourceGOConsumed']is False and capture['production']is False,'local input correction scope differs')
    for key in ['originalSourceCapturePin','originalFinancialWitnessPin','localRolesSQL','postgrestBinary']:
        require(capture[key]==previous[key],'prior input provenance changed')
    require(capture['previousCorrectedFinancialWitnessPin']==previous['correctedFinancialWitnessPin'],
      'prior native witness differs')
    receipt=read(capture['correctionReceiptPin']);claim=read(BOOK17_CLAIM_PIN)
    require(receipt['pass']is True and receipt['historicalDaysAdded']==['2026-10-17']and receipt['correctionWrites']==1
      and receipt['database']==BOOK17_INPUT_DATABASE and receipt['monetaryLimitsUnchanged']is True
      and receipt['originalSourceUnchanged']is True and receipt['priorCorrectedSourceUnchanged']is True
      and receipt['resourceGOConsumed']is False and receipt['profileActivations']==0 and receipt['full500Runs']==0,
      'exact completed book17 correction required')
    require(claim['targetDatabase']==BOOK17_INPUT_DATABASE and claim['exactlyOneInputCorrection']is True
      and claim['resourceGOConsumed']is False and claim['freshOwnerGO']==capture['freshOwnerGO']==receipt['freshOwnerGO']
      and receipt['correctedFinancialWitnessPin']==capture['correctedFinancialWitnessPin'],'completed correction receipt/claim differs')
    before=read(capture['previousCorrectedFinancialWitnessPin']);after=read(capture['correctedFinancialWitnessPin'])
    for witness in [before,after]:
        require(hashlib.sha256(witness['nativeAuthText'].encode()).hexdigest()==witness['nativeAuthSHA']
          and witness['completeNativeCounterText']=='[]'
          and hashlib.sha256(witness['completeNativeCounterText'].encode()).hexdigest()==witness['completeNativeCounterSHA'],
          'native financial content binding differs')
    require(before['nativeAuthSHA']=='dad8257d816e7bd1890151a4e0d67f93ac593bfb97315015ebe60ab1fc61b884'
      and after['nativeAuthSHA']=='5da973fb04fa285ff8c192de0beab8cc53b705179f2de46f91d659c83be57634',
      'reviewed financial hashes differ')
    a=json.loads(before['nativeAuthText']);b=json.loads(after['nativeAuthText'])
    require('2026-10-17'not in a['testKostenTage']and len(a['testKostenTage'])==38
      and set(b['testKostenTage'])==set(a['testKostenTage'])|{'2026-10-17'}
      and a['testKostenAuftrag']['bookCapacity']==38 and b['testKostenAuftrag']['bookCapacity']==39,
      'only approved historical book17/capacity delta required')
    del b['testKostenTage']['2026-10-17'];b['testKostenAuftrag']['bookCapacity']=38
    require(a==b,'other financial content changed')
    if not actual:return capture
    spec=importlib.util.spec_from_file_location('existing_native_financial_sql',BIN/'local-zero-day-copy.py')
    Z=importlib.util.module_from_spec(spec);spec.loader.exec_module(Z)
    native=_query_input_database(Z.FINANCIAL,BOOK17_INPUT_DATABASE)
    native['completeNativeCounterSHA']=hashlib.sha256(native['completeNativeCounterText'].encode()).hexdigest()
    require(native==after,'actual completed input finance changed')
    return native


def _verify_book18_capture(capture_pin,*,actual=True):
    """Verify exact16/17/18Oct completed corrections as DATA, never run GO."""
    _book18_data_pins(capture_pin)
    capture=read(capture_pin)
    previous=_verify_book17_capture(capture['previousCorrectedCapturePin'],actual=False)
    require(capture['source']==BOOK18_INPUT_DATABASE and capture['before']==capture['after']==previous['before']
      and capture['sourceWrites']==0 and capture['newCopyFinancialWrites']==1
      and capture['historicalDaysAdded']==['2026-10-18']
      and capture['resourceGOConsumed']is False and capture['production']is False,'book18 input correction scope differs')
    receipt=read(capture['correctionReceiptPin']);claim=read(BOOK18_CLAIM_PIN)
    require(receipt['pass']is True and receipt['database']==BOOK18_INPUT_DATABASE
      and receipt['historicalDaysAdded']==['2026-10-18']and receipt['correctionWrites']==1
      and receipt['existingBooksPreserved']==39 and receipt['resultHistoricalBooks']==40
      and receipt['bookCapacityBefore']==39 and receipt['bookCapacityAfter']==40
      and receipt['monetaryLimitsUnchanged']is True and receipt['onlySpecifiedDelta']is True
      and receipt['originalSourceUnchanged']is True and receipt['priorCorrectedSourceUnchanged']is True
      and receipt['fullCounterTableUnchanged']is True and receipt['allOtherRelationDataUnchanged']is True
      and receipt['resourceGOConsumed']is False and receipt['profileActivations']==0
      and receipt['full500Runs']==0 and receipt['production']is False,'exact completed book18 correction required')
    require(claim['target']==BOOK18_INPUT_DATABASE and claim['correctionExactlyOnce']is True
      and claim['automaticRetryAllowed']is False and claim['resourceGOConsumed']is False
      and claim['authorityPin']==capture['freshOwnerGO']==receipt['freshOwnerGO']
      and receipt['claimPin']==BOOK18_CLAIM_PIN
      and receipt['correctedFinancialWitnessPin']==capture['correctedFinancialWitnessPin']
      and receipt['sourceDump']==capture['sourceDump']
      and receipt['sourceIdentityBeforeAndAfter']==capture['before'],
      'completed book18 correction receipt/claim differs')
    before=read(capture['previousCorrectedFinancialWitnessPin']);after=read(capture['correctedFinancialWitnessPin'])
    for witness in [before,after]:
        require(hashlib.sha256(witness['nativeAuthText'].encode()).hexdigest()==witness['nativeAuthSHA']
          and witness['completeNativeCounterText']=='[]'
          and hashlib.sha256(witness['completeNativeCounterText'].encode()).hexdigest()==witness['completeNativeCounterSHA'],
          'native financial content binding differs')
    require(before['nativeAuthSHA']=='5da973fb04fa285ff8c192de0beab8cc53b705179f2de46f91d659c83be57634'
      and after['nativeAuthSHA']=='f1a1bb64e96d854712ffa8a714a5eb5021b3b7ec65fd93aba42d054d3a8c61ef'
      and receipt['beforeNativeAuthSHA256']==before['nativeAuthSHA']
      and receipt['afterNativeAuthSHA256']==after['nativeAuthSHA'],'reviewed book18 financial hashes differ')
    a=json.loads(before['nativeAuthText']);b=json.loads(after['nativeAuthText'])
    require('2026-10-18'not in a['testKostenTage']and len(a['testKostenTage'])==39
      and set(b['testKostenTage'])==set(a['testKostenTage'])|{'2026-10-18'}
      and a['testKostenAuftrag']['bookCapacity']==39 and b['testKostenAuftrag']['bookCapacity']==40,
      'only approved historical book18/capacity delta required')
    del b['testKostenTage']['2026-10-18'];b['testKostenAuftrag']['bookCapacity']=39
    require(a==b,'other financial content changed')
    if not actual:return capture
    # Preserve both historical native verifiers, with their original DB names.
    _verify_book17_capture(capture['previousCorrectedCapturePin'],actual=True)
    spec=importlib.util.spec_from_file_location('current_native_financial_sql',BIN/'local-zero-day-copy.py')
    Z=importlib.util.module_from_spec(spec);spec.loader.exec_module(Z)
    native=_query_book18_input(Z.FINANCIAL)
    native['completeNativeCounterSHA']=hashlib.sha256(native['completeNativeCounterText'].encode()).hexdigest()
    require(native==after,'actual completed book18 input finance changed')
    return native


# Fixed new20Oct data binding; not a GO or a template substitute. This file is
# part of the ordinary immutable repo/runtime source closure.
DAY20_INPUT_BINDING=json.loads((BIN/'local-day20-input-binding.json').read_text())
require(set(DAY20_INPUT_BINDING)=={'schema','sourceInputDatabase','capturePin','correctionClaimPin','beforeNativeAuthSHA256','afterNativeAuthSHA256'}
  and DAY20_INPUT_BINDING['schema']=='helmut-completed-day20-local-input-binding/1'
  and DAY20_INPUT_BINDING['sourceInputDatabase']=='helmut_resource_input_20261020_4d77e2fe6616'
  and DAY20_INPUT_BINDING['beforeNativeAuthSHA256']=='f1a1bb64e96d854712ffa8a714a5eb5021b3b7ec65fd93aba42d054d3a8c61ef'
  and DAY20_INPUT_BINDING['afterNativeAuthSHA256']=='b5c615212f5f887ddaa029b0e9b70a3b4a8fd793661fc2dd852f6c1ec93e06d4',
  'exact completed20Oct source binding required')
INPUT_DATABASE=DAY20_INPUT_BINDING['sourceInputDatabase']
CORRECTED_CAPTURE=Path(DAY20_INPUT_BINDING['capturePin']['path'])
CORRECTED_CAPTURE_SHA=DAY20_INPUT_BINDING['capturePin']['sha256']
BOOK19_CLAIM_PIN=DAY20_INPUT_BINDING['correctionClaimPin']
require(CORRECTED_CAPTURE==BASE/'wave52-bounded-native-read-preparation/book19-input/completed-input/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
  and BOOK19_CLAIM_PIN['path']==str(BASE/'wave52-bounded-native-read-preparation/book19-input/ONCE_ONLY_BOOK19_INPUT_CORRECTION_CLAIM.SAFE.json'),
  'fixed new completed data paths required')


def capture_data_pins(capture_pin):
    """Complete16/17/18/19Oct DATA closure; never open historical owner GO."""
    require(capture_pin==DAY20_INPUT_BINDING['capturePin'],'only exact completed book19 input may be reused')
    capture=read(capture_pin)
    previous_pin=capture['previousCorrectedCapturePin']
    require(previous_pin['path']==str(BOOK18_CAPTURE)and previous_pin['sha256']==BOOK18_CAPTURE_SHA,
      'exact book18 source provenance required')
    paths=_book18_data_pins(previous_pin)+[capture_pin,BOOK19_CLAIM_PIN]
    paths += [capture[k]for k in ['correctedFinancialWitnessPin','correctionReceiptPin','sourceDump']]
    previous=read(previous_pin)
    for key in ['originalSourceCapturePin','originalFinancialWitnessPin','localRolesSQL','postgrestBinary']:
        require(capture[key]==previous[key],'prior book18 input provenance changed')
    require(capture['previousCorrectedFinancialWitnessPin']==previous['correctedFinancialWitnessPin'],
      'prior book18 native witness differs')
    require(len({p['path']for p in paths})==len(paths),'unexpected duplicate20Oct data binding')
    for p in paths:require(pin(p['path'])==p,'completed20Oct data dependency drift')
    return paths


def query_input(sql):
    """Read ONLY fixed completed20Oct input; no writable SQL mode."""
    return _query_input_database(sql,INPUT_DATABASE)


def verify_preexisting_capture(capture_pin,*,actual=True):
    """Verify completed19Oct null-book delta above all historical layers."""
    capture_data_pins(capture_pin)
    capture=read(capture_pin)
    previous=_verify_book18_capture(capture['previousCorrectedCapturePin'],actual=False)
    require(capture['source']==INPUT_DATABASE and capture['before']==capture['after']==previous['before']
      and capture['sourceWrites']==0 and capture['newCopyFinancialWrites']==1
      and capture['historicalDaysAdded']==['2026-10-19'] and capture['resourceGOConsumed']is False
      and capture['newOwnedRestoreWillBeMeasured']is True and capture['production']is False,'book19 input scope differs')
    receipt=read(capture['correctionReceiptPin']);claim=read(BOOK19_CLAIM_PIN)
    require(receipt['pass']is True and receipt['database']==INPUT_DATABASE and receipt['historicalDaysAdded']==['2026-10-19']
      and receipt['correctionWrites']==1 and receipt['sourceWrites']==0
      and receipt['existingBooksPreserved']==40 and receipt['resultHistoricalBooks']==41
      and receipt['bookCapacityBefore']==40 and receipt['bookCapacityAfter']==41
      and receipt['monetaryLimitsUnchanged']is True and receipt['onlySpecifiedDelta']is True
      and receipt['originalSourceUnchanged']is True and receipt['priorCorrectedSourceUnchanged']is True
      and receipt['fullCounterTableUnchanged']is True and receipt['allOtherRelationDataUnchanged']is True
      and receipt['preexistingActiveFlagsPreserved']is True and receipt['resourceGOConsumed']is False
      and receipt['profileActivations']==0 and receipt['full500Runs']==0 and receipt['production']is False,
      'exact completed book19 correction required')
    require(claim['target']==INPUT_DATABASE and claim['correctionExactlyOnce']is True
      and claim['automaticRetryAllowed']is False and claim['resourceGOConsumed']is False
      and claim['authorityPin']==capture['freshOwnerGO']==receipt['freshOwnerGO']
      and receipt['claimPin']==BOOK19_CLAIM_PIN and receipt['correctedFinancialWitnessPin']==capture['correctedFinancialWitnessPin']
      and receipt['sourceDump']==capture['sourceDump'] and receipt['sourceIdentityBeforeAndAfter']==capture['before'],
      'completed book19 receipt/claim differs')
    before=read(capture['previousCorrectedFinancialWitnessPin']);after=read(capture['correctedFinancialWitnessPin'])
    for witness in [before,after]:
        require(hashlib.sha256(witness['nativeAuthText'].encode()).hexdigest()==witness['nativeAuthSHA']
          and witness['completeNativeCounterText']=='[]'
          and hashlib.sha256(witness['completeNativeCounterText'].encode()).hexdigest()==witness['completeNativeCounterSHA'],
          'native20Oct financial content differs')
    require(before['nativeAuthSHA']==DAY20_INPUT_BINDING['beforeNativeAuthSHA256']
      and after['nativeAuthSHA']==DAY20_INPUT_BINDING['afterNativeAuthSHA256']
      and receipt['beforeNativeAuthSHA256']==before['nativeAuthSHA']and receipt['afterNativeAuthSHA256']==after['nativeAuthSHA'],
      'reviewed book19 native hashes differ')
    a=json.loads(before['nativeAuthText']);b=json.loads(after['nativeAuthText'])
    require('2026-10-19'not in a['testKostenTage']and len(a['testKostenTage'])==40
      and set(b['testKostenTage'])==set(a['testKostenTage'])|{'2026-10-19'}
      and a['testKostenAuftrag']['bookCapacity']==40 and b['testKostenAuftrag']['bookCapacity']==41,
      'only historical19Oct book/capacity delta required')
    del b['testKostenTage']['2026-10-19'];b['testKostenAuftrag']['bookCapacity']=40
    require(a==b,'other financial content changed in20Oct input')
    if not actual:return capture
    _verify_book18_capture(capture['previousCorrectedCapturePin'],actual=True)
    spec=importlib.util.spec_from_file_location('day20_financial_reader',BIN/'local-zero-day-copy.py')
    Z=importlib.util.module_from_spec(spec);spec.loader.exec_module(Z)
    native=query_input(Z.FINANCIAL)
    native['completeNativeCounterSHA']=hashlib.sha256(native['completeNativeCounterText'].encode()).hexdigest()
    require(native==after,'actual completed book19 input finance changed')
    identity=query_input("SELECT jsonb_build_object('profiles',(SELECT count(*)FROM mandate_profiles),'active',(SELECT count(*)FROM mandate_profiles WHERE aktiv),'profileHash',(SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(p)ORDER BY user_id COLLATE \"C\")::text,'UTF8')),'hex')FROM mandate_profiles p),'identityHash',(SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(p)ORDER BY id COLLATE \"C\")::text,'UTF8')),'hex')FROM profiles p),'uSHA',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM helmut_store WHERE id='synthetik500-command-synthetik500-one-u-preparation-1791311693883'));")
    require(identity==capture['before'],'actual completed20Oct profiles/identities/U changed')
    return native
