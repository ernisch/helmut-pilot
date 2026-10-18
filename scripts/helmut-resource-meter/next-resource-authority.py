#!/usr/bin/env python3
"""Fixed next LOCAL resource slot; preparation is never execution authority.

The three consumed attempts and the completed input correction are immutable.
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
DAY='2026-10-18'
DATE_TAG='20261018'
# Both real entrypoints read this same source-pinned local definition. Updating
# a fixed slot must never leave the measured JS stage on a spent old claim.
SLOT=json.loads((BIN/'local-resource-authority-slot.json').read_text())
if (type(SLOT)is not dict or set(SLOT)!={'schema','day','version'}
  or SLOT['schema']!='helmut-local-resource-authority-slot/1' or SLOT['day']!=DAY
  or type(SLOT['version'])is not int or not 1<=SLOT['version']<=9999):
    raise RuntimeError('invalid pinned local resource authority slot')
SLOT_VERSION=SLOT['version']
AUTHORIZATION=f'USER_GO_{DATE_TAG}_EXACT_ONE_RESOURCE_ONLY_V{SLOT_VERSION}'
CLAIM=METER/f'NEXT_RESOURCE{DAY[-2:]}_V{SLOT_VERSION}_GO_CLAIM.SAFE.json'
RESERVATION=METER/f'NEXT_RESOURCE{DAY[-2:]}_V{SLOT_VERSION}_SETUP_RESERVATION.SAFE.json'
SUBNET='172.16.244.0/24'
OLD_MARKERS=[METER/name for name in [
 'ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json','GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json',
 'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json',
 'DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json','NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json','NEXT_RESOURCE17_V4_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE18_V5_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V5_SETUP_RESERVATION.SAFE.json',
 'NEXT_RESOURCE18_V6_GO_CLAIM.SAFE.json','NEXT_RESOURCE18_V6_SETUP_RESERVATION.SAFE.json']]
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
PREVIOUS_CAPTURE=BASE/'wave20-resource-integration/attempt-64a99d4ac9fb/corrected-input/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
PREVIOUS_CAPTURE_SHA='37701d014b73311da59f3daf92d8344074a48aaea5586c7f73d1728026d185a3'
CORRECTED_CAPTURE=BASE/'wave30-resource-start-gaps/input18-ab76c911dac8/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
CORRECTED_CAPTURE_SHA='1c99ee530e83e65967ea723be857841b501ca8b13c6e783a4c8f3c99687f8cfc'
INPUT_DATABASE='helmut_resource_input_20261018_ab76c911dac8'
BOOK17_CLAIM_PIN={'path':str(BASE/'wave30-resource-start-gaps/ONCE_ONLY_BOOK17_INPUT_CORRECTION_CLAIM.SAFE.json'),
  'bytes':734,'sha256':'3b60362f7d92b5deee52b29d91e4420e1f72974a496122603d4b4237eb7c3dd3'}

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
    spec=importlib.util.spec_from_file_location('existing_zero_day_data',BIN/'local-zero-day-copy.py')
    Z=importlib.util.module_from_spec(spec);spec.loader.exec_module(Z)
    original=read(capture['originalFinancialWitnessPin']);actual_original=Z.witness(Z.S.SOURCE)
    require(all(original[k]==v for k,v in actual_original.items()),'original native finances changed')
    actual=Z.witness(capture['capturedFromNewLocalInputDatabase'])
    require(actual==read(capture['correctedFinancialWitnessPin']),'corrected native finances changed')
    Z.validate_change(original,actual)
    for key in ['sourceDump','localRolesSQL','postgrestBinary']:require(pin(capture[key]['path'])==capture[key],'preexisting fixture asset changed')
    return actual


def capture_data_pins(capture_pin):
    """Shared exact source-data reads for host checks AND container mounts.

    Explicit provenance only: owner approvals mentioned by these documents are
    never opened, recursively mounted or reused as resource authority.
    """
    require(capture_pin['path']==str(CORRECTED_CAPTURE)and capture_pin['sha256']==CORRECTED_CAPTURE_SHA,
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


def query_input(sql):
    """Read ONLY the fixed completed local input; no writable mode exists."""
    command=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY',
      '-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock','exec','-i',
      'helmut-boundary-pg-bd7dd5da','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',INPUT_DATABASE,'-f','-']
    text="BEGIN READ ONLY;SET LOCAL statement_timeout='20s';"+sql+'ROLLBACK;'
    result=subprocess.run(command,input=text,text=True,capture_output=True,timeout=40,check=True)
    return json.loads(result.stdout)


def verify_preexisting_capture(capture_pin,*,actual=True):
    """Verify both completed corrections as DATA, never as reusable approval."""
    capture_data_pins(capture_pin)
    capture=read(capture_pin);previous=read(capture['previousCorrectedCapturePin'])
    _verify_previous_capture(capture['previousCorrectedCapturePin'],actual=actual)
    require(capture['source']==INPUT_DATABASE and capture['before']==capture['after']==previous['before']
      and capture['sourceWrites']==0 and capture['newCopyFinancialWrites']==1
      and capture['resourceGOConsumed']is False and capture['production']is False,'local input correction scope differs')
    for key in ['originalSourceCapturePin','originalFinancialWitnessPin','localRolesSQL','postgrestBinary']:
        require(capture[key]==previous[key],'prior input provenance changed')
    require(capture['previousCorrectedFinancialWitnessPin']==previous['correctedFinancialWitnessPin'],
      'prior native witness differs')
    receipt=read(capture['correctionReceiptPin']);claim=read(BOOK17_CLAIM_PIN)
    require(receipt['pass']is True and receipt['historicalDaysAdded']==['2026-10-17']and receipt['correctionWrites']==1
      and receipt['database']==INPUT_DATABASE and receipt['monetaryLimitsUnchanged']is True
      and receipt['originalSourceUnchanged']is True and receipt['priorCorrectedSourceUnchanged']is True
      and receipt['resourceGOConsumed']is False and receipt['profileActivations']==0 and receipt['full500Runs']==0,
      'exact completed book17 correction required')
    require(claim['targetDatabase']==INPUT_DATABASE and claim['exactlyOneInputCorrection']is True
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
    native=query_input(Z.FINANCIAL)
    native['completeNativeCounterSHA']=hashlib.sha256(native['completeNativeCounterText'].encode()).hexdigest()
    require(native==after,'actual completed input finance changed')
    return native
