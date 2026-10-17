#!/usr/bin/env python3
"""Fixed next LOCAL resource slot; preparation is never execution authority.

The two consumed attempts and the completed input correction are immutable.
The corrected fixture is input provenance only, never a reusable owner GO.
No effects on import. This module cannot reserve, activate, repair or run.
"""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path

BIN=Path(__file__).resolve().parent
BASE=Path('/workspace/helmut-parallel-20261015')
METER=BASE/'wave19-resource-meter'
AUTHORIZATION='USER_GO_20261017_EXACT_ONE_RESOURCE_ONLY_V3'
CLAIM=METER/'NEXT_RESOURCE17_V3_GO_CLAIM.SAFE.json'
RESERVATION=METER/'NEXT_RESOURCE17_V3_SETUP_RESERVATION.SAFE.json'
SUBNET='172.16.248.0/24'
OLD_MARKERS=[METER/name for name in [
 'ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json','GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json',
 'ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json','DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json',
 'DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json']]
PRESERVED_MARKER_PINS=[{'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json', 'bytes': 815, 'sha256': '92096d184adc88feaefa1393c3115840dd2e0960379d108de42be2d1e57005e5'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/GLOBAL_RESOURCE_SETUP_RESERVATION.SAFE.json', 'bytes': 1203, 'sha256': 'e0dfa98ab19d0ed917e7fca15817766a370a593005625b807f4474ff3a827cc4'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_DAY16_INPUT_CORRECTION_CLAIM.SAFE.json', 'bytes': 454, 'sha256': 'e01e8a20f8cded6a9285d07763fe40ce0cac7d279479c5faa05ad6a4a1de4e60'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/DAY16_REPAIR_RESOURCE_GO_CLAIM.SAFE.json', 'bytes': 815, 'sha256': 'a376c1abf5541728b2e5c565c0b0576ee6a87723f8d06125d5a0ec574ddc8853'}, {'path': '/workspace/helmut-parallel-20261015/wave19-resource-meter/DAY16_REPAIR_RESOURCE_SETUP_RESERVATION.SAFE.json', 'bytes': 1203, 'sha256': '7ea29623fc80b6a75dd475463d1c1802e340e75b1c6509ebf7e6d45d21357088'}]
CORRECTED_CAPTURE=BASE/'wave20-resource-integration/attempt-64a99d4ac9fb/corrected-input/READ_ONLY_SOURCE_CAPTURE.SAFE.json'
CORRECTED_CAPTURE_SHA='37701d014b73311da59f3daf92d8344074a48aaea5586c7f73d1728026d185a3'

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
    require(final==METER/('OWNER_RESOURCE17_V3_'+suffix+'.PRIVATE.json'),'exact new owner GO path required')
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

def verify_preexisting_capture(capture_pin,*,actual=True):
    """Read actual native bytes plus fixed historical receipt/claim provenance.

    This validates DATA. It never invokes the old owner() authority verifier,
    repeats its correction, grants a resource attempt or mutates an old GO.
    """
    require(capture_pin['path']==str(CORRECTED_CAPTURE)and capture_pin['sha256']==CORRECTED_CAPTURE_SHA,
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
