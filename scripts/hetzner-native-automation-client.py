#!/usr/bin/env python3
"""Pinned, standard-library-only client for the restricted HELMUT control account.

No remote log is printed or retained. Only a validated, public, nonce-bound
response and its SHA256 digest can enter the fixed public artifact directory.
"""
import base64
import binascii
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import subprocess
import sys
import tempfile
import time

REPOSITORY = "ernisch/helmut-pilot"
BRANCH = "refs/heads/main"
WORKFLOW_REF = REPOSITORY + "/.github/workflows/hetzner-native-automation.yml@" + BRANCH
HOST_FINGERPRINT = "SHA256:u48IkPIpHilVGYw2MwJuE1pv4XMjlJ88cQjUzN4Lh1c"
OPERATIONS = ("status", "recipient", "stage", "admit", "four-tx")
ENABLED_OPERATIONS = ("status", "recipient", "stage", "admit")
MAX_STAGE_CAPSULE = 48 * 1024
SETUP_CONTRACT = 'setup-successor-unit-properties-v1'
SETUP_PREFIX = b'helmut-setup-successor-request-v1\0'
SETUP_CAPSULE_KEYS = {'schema', 'contract_id', 'action', 'phase', 'source_sha256', 'contract_sha256',
    'nonce', 'inspection_nonce', 'inspection_result_sha256', 'issued_at_utc', 'expires_at_utc'}
SETUP_PHASES = ('recover', 'checkout', 'context', 'image')
RUNTIME_METADATA_CONTRACT = 'runtime-metadata-20261026-v1'
RUNTIME_METADATA_CONTRACT_SHA256 = '8909ca48f13ea836abdf6b8833bd1341a5c2dec2007a7ea2f4e0088cd5a9c91b'
RUNTIME_METADATA_PREFIX = b'helmut-runtime-metadata-request-v1\0'
RUNTIME_METADATA_CAPSULE_KEYS = {'schema', 'contract_id', 'action', 'chunk', 'source_sha256',
    'contract_sha256', 'nonce', 'issued_at_utc', 'expires_at_utc'}
RUNTIME_METADATA_SHA256 = '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475'
RUNTIME_METADATA_BYTES = 207733
RUNTIME_METADATA_SETUP = {
    'source_sha256': '1fc63bf8c90a6f13a2eebf4981d7f0c7da0b10f5e5c2fd563551e117f0ec58fe',
    'deployment_commit': '8139b3a99d04e3e854f886123869bf669da6389d',
    'contract_sha256': 'e5ffcce62f8a419f11596e7ef88e9d10f4585d33b1b18e7d962670475d4d4059',
    'asset_set_sha256': '9941129431d0575caa1afe9afab497fd7d111c18ede0566b5498ec5089751c07'}
STAGE_PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
STAGE_SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
STAGE_CODES = frozenset(('STAGE_COMPLETE', 'STAGE_INTERNAL_FAILURE', 'STAGE_DEADLINE',
    'STAGE_FRAME', 'STAGE_CAPSULE_LIMIT', 'STAGE_CAPSULE_FORMAT', 'STAGE_CAPSULE_BINDING',
    'STAGE_CAPSULE_TIME', 'STAGE_PARTS', 'STAGE_URL', 'STAGE_DNS', 'STAGE_HTTP',
    'STAGE_SIZE', 'STAGE_HASH', 'STAGE_SPACE', 'STAGE_ALREADY_ATTEMPTED',
    'STAGE_GPG', 'STAGE_GPG_INTEGRITY', 'STAGE_GPG_RECIPIENT', 'STAGE_RESTORE',
    'STAGE_HELPER_HASH', 'STAGE_RECEIPT', 'STAGE_CHILD', 'STAGE_COMMIT',
    'RECIPIENT_NOT_ACCEPTED', 'RECIPIENT_EXPIRED', 'RECIPIENT_PUBLIC_HASH',
    'RECOVERY_ORIGINAL_BINDING'))
MAX_RESPONSE = 256 * 1024
MAX_PUBLIC_KEY = 64 * 1024
RESPONSE_FIELDS = {
    "schema", "operation", "nonce", "plan_sha256", "payload_sha256",
    "result", "result_sha256",
}
SAFE_CODES = {
    "execution-context-denied", "operation-denied", "operation-not-qualified",
    "pin-required", "host-denied", "host-key-denied", "ssh-key-required",
    "runner-temp-denied", "response-size", "response-json", "duplicate-key",
    "response-fields", "response-binding", "response-hash", "result-fields",
    "result-status", "native-enabled-denied", "enabled-operations-denied",
    "recipient-format", "recipient-hash", "recipient-private-material",
    "recipient-fingerprint", "recipient-validation", "ssh-failed",
    "ssh-timeout", "mode-denied", "public-output-exists", "source-pin-drift", "stage-capsule",
    "setup-mode", "setup-capsule", "setup-result", "runtime-metadata-capsule", "runtime-metadata-result",
}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def pinned_sha(value):
    require(type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value), "pin-required")
    return value


def validate_context(environment):
    require(environment.get("GITHUB_REPOSITORY") == REPOSITORY and
            environment.get("GITHUB_REPOSITORY_OWNER") == "ernisch" and
            environment.get("GITHUB_REF") == BRANCH and
            environment.get("GITHUB_WORKFLOW_REF") == WORKFLOW_REF and
            environment.get("GITHUB_EVENT_NAME") == "workflow_dispatch",
            "execution-context-denied")
    operation = environment.get("HELMUT_NATIVE_OPERATION")
    require(operation in OPERATIONS, "operation-denied")
    # Native transactions remain unqualified.
    require(operation in ENABLED_OPERATIONS, "operation-not-qualified")
    stage_capsule(environment, operation)
    setup_capsule(environment, operation)
    return operation, pinned_sha(environment.get("HELMUT_NATIVE_PLAN_SHA256")), \
        pinned_sha(environment.get("HELMUT_NATIVE_PAYLOAD_SHA256"))


def request(operation, plan_sha256, payload_sha256, nonce):
    require(operation in ENABLED_OPERATIONS, "operation-not-qualified")
    require(re.fullmatch(r"[a-f0-9]{64}", nonce), "response-binding")
    return {
        "schema": "helmut-native-control-request-v1", "operation": operation,
        "nonce": nonce, "plan_sha256": pinned_sha(plan_sha256),
        "payload_sha256": pinned_sha(payload_sha256),
    }


def json_unique(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            require(key not in result, "duplicate-key")
            result[key] = value
        return result
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                          parse_constant=lambda _: require(False, "response-json"))
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("response-json") from None


def stage_capsule(environment, operation):
    encoded = environment.get('HELMUT_NATIVE_STAGE_CAPSULE', '')
    if operation != 'stage':
        require(encoded == '', 'stage-capsule')
        return b'', b''
    require(type(encoded) is str and 0 < len(encoded) <= MAX_STAGE_CAPSULE
            and re.fullmatch(r'[A-Za-z0-9+/]+={0,2}',encoded), 'stage-capsule')
    try:
        raw = base64.b64decode(encoded,validate=True)
    except (ValueError,binascii.Error):
        raise ValueError('stage-capsule') from None
    require(base64.b64encode(raw).decode('ascii') == encoded, 'stage-capsule')
    # Accept a binary recipient-encrypted message, never literal/signed plaintext.
    position, packets = 0, []
    while position < len(raw):
        header=raw[position];position+=1
        require(header & 128,'stage-capsule')
        tag=(header & 63) if header & 64 else (header >> 2) & 15
        chunks=[]
        while True:
            if header & 64:
                require(position<len(raw),'stage-capsule');first=raw[position];position+=1
                partial=224<=first<255
                if first<192:length=first
                elif first<224:
                    require(position<len(raw),'stage-capsule')
                    length=((first-192)<<8)+raw[position]+192;position+=1
                elif first==255:
                    require(position+4<=len(raw),'stage-capsule')
                    length=int.from_bytes(raw[position:position+4],'big');position+=4
                else:length=1 << (first & 31)
            else:
                kind=header & 3;require(kind!=3,'stage-capsule');width=1 << kind
                require(position+width<=len(raw),'stage-capsule')
                length=int.from_bytes(raw[position:position+width],'big');position+=width;partial=False
            require(position+length<=len(raw),'stage-capsule')
            chunks.append(raw[position:position+length]);position+=length
            if not partial:break
        packets.append((tag,b''.join(chunks)))
    require(len(packets)==2 and packets[0][0]==1 and len(packets[0][1])>=10
            and packets[0][1][0]==3 and packets[0][1][9]==18
            and packets[1][0]==18 and packets[1][1][:1]==b'\x01','stage-capsule')
    return encoded.encode('ascii')+b'\n',raw


def _setup_capsule_check(value, payload, now=None):
    require(type(value) is dict and set(value) == SETUP_CAPSULE_KEYS
            and value['schema'] == 'helmut-setup-successor-capsule-v1'
            and value['contract_id'] == SETUP_CONTRACT and value['action'] in ('inspect', 'setup')
            and value['source_sha256'] == payload, 'setup-capsule')
    for key in ('source_sha256', 'contract_sha256', 'nonce'): pinned_sha(value[key])
    require(type(value['issued_at_utc']) is int and type(value['expires_at_utc']) is int
            and 0 < value['issued_at_utc'] < value['expires_at_utc']
            and value['expires_at_utc'] - value['issued_at_utc'] <= 300, 'setup-capsule')
    if now is not None:
        require(value['issued_at_utc'] <= now <= value['expires_at_utc'], 'setup-capsule')
    if value['action'] == 'inspect':
        require(value['phase'] is None and value['inspection_nonce'] is None
                and value['inspection_result_sha256'] is None, 'setup-capsule')
    else:
        require(value['phase'] in SETUP_PHASES, 'setup-capsule')
        for key in ('inspection_nonce', 'inspection_result_sha256'): pinned_sha(value[key])


def _runtime_metadata_capsule_check(value, payload, now=None):
    require(type(value) is dict and set(value) == RUNTIME_METADATA_CAPSULE_KEYS
            and value['schema'] == 'helmut-runtime-metadata-capsule-v1'
            and value['contract_id'] == RUNTIME_METADATA_CONTRACT and value['action'] == 'read'
            and type(value['chunk']) is int and 0 <= value['chunk'] <= 3
            and value['source_sha256'] == payload and value['contract_sha256'] == RUNTIME_METADATA_CONTRACT_SHA256,
            'runtime-metadata-capsule')
    for key in ('source_sha256', 'contract_sha256', 'nonce'): pinned_sha(value[key])
    require(type(value['issued_at_utc']) is int and type(value['expires_at_utc']) is int
            and 0 < value['issued_at_utc'] < value['expires_at_utc']
            and value['expires_at_utc'] - value['issued_at_utc'] <= 300, 'runtime-metadata-capsule')
    if now is not None:
        require(value['issued_at_utc'] <= now <= value['expires_at_utc'], 'runtime-metadata-capsule')


def setup_capsule(environment, operation):
    encoded = environment.get('HELMUT_NATIVE_SETUP_CAPSULE', '')
    mode = environment.get('HELMUT_NATIVE_CONTROL_MODE', 'control-v1')
    if encoded == '':
        require(mode == 'control-v1', 'setup-mode')
        return b'', None
    require(mode in ('setup-inspect-v1', 'setup-successor-v1', 'runtime-metadata-v1'), 'setup-mode')
    require(operation in ('status', 'admit') and environment.get('HELMUT_NATIVE_STAGE_CAPSULE', '') == ''
            and environment.get('HELMUT_NATIVE_PLAN_SHA256') == STAGE_PLAN, 'setup-capsule')
    require(type(encoded) is str and 0 < len(encoded) <= 10924
            and re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', encoded), 'setup-capsule')
    try: raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error): raise ValueError('setup-capsule') from None
    require(0 < len(raw) <= 8191 and base64.b64encode(raw).decode('ascii') == encoded, 'setup-capsule')
    value = json_unique(raw)
    require(canonical(value) == raw, 'setup-capsule')
    if mode == 'runtime-metadata-v1':
        require(operation == 'status', 'setup-mode')
        _runtime_metadata_capsule_check(value, pinned_sha(environment.get('HELMUT_NATIVE_PAYLOAD_SHA256')), int(time.time()))
        return raw + b'\n', value
    _setup_capsule_check(value, pinned_sha(environment.get('HELMUT_NATIVE_PAYLOAD_SHA256')), int(time.time()))
    require((mode, operation, value['action']) in (('setup-inspect-v1', 'status', 'inspect'),
            ('setup-successor-v1', 'admit', 'setup')), 'setup-mode')
    return raw + b'\n', value


def setup_request_nonce(capsule):
    return digest(SETUP_PREFIX + canonical(capsule) + b'\n')


def runtime_metadata_request_nonce(capsule):
    return digest(RUNTIME_METADATA_PREFIX + canonical(capsule) + b'\n')


def control_request_nonce(capsule):
    if capsule['schema'] == 'helmut-runtime-metadata-capsule-v1':
        return runtime_metadata_request_nonce(capsule)
    return setup_request_nonce(capsule)


def validate_runtime_metadata_result(result, sent, capsule):
    _runtime_metadata_capsule_check(capsule, sent['payload_sha256'])
    require(sent['operation'] == 'status' and sent['plan_sha256'] == STAGE_PLAN
            and sent['nonce'] == runtime_metadata_request_nonce(capsule), 'response-binding')
    require(type(result) is dict and len(canonical(result)) <= 131072
            and result.get('schema') == 'helmut-runtime-binding-metadata-read-v1'
            and result.get('contract_id') == RUNTIME_METADATA_CONTRACT
            and result.get('contract_sha256') == capsule['contract_sha256']
            and result.get('source_sha256') == sent['payload_sha256']
            and result.get('dataset_sha256') == RUNTIME_METADATA_SHA256
            and type(result.get('dataset_bytes')) is int and result['dataset_bytes'] == RUNTIME_METADATA_BYTES
            and type(result.get('chunk_index')) is int and result['chunk_index'] == capsule['chunk']
            and result.get('native_qualified') is False and result.get('native_go_consumed') is False,
            'runtime-metadata-result')
    common = {'schema', 'status', 'contract_id', 'contract_sha256', 'source_sha256', 'dataset_sha256',
              'dataset_bytes', 'chunk_index', 'data_base64', 'native_qualified', 'native_go_consumed'}
    require(common <= set(result), 'runtime-metadata-result')
    if result['status'] == 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED':
        require(set(result) == common | {'code'} and result['data_base64'] is None
                and type(result['code']) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', result['code']),
                'runtime-metadata-result')
        return
    require(set(result) == common | {'file_binding', 'scope_sha256', 'source_row_sha256', 'setup_proof',
            'chunk_count', 'chunk_size', 'chunk_sha256', 'json_summary'}
            and result['status'] == 'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED'
            and result['scope_sha256'] == STAGE_SCOPE
            and type(result['chunk_count']) is int and result['chunk_count'] == 4
            and type(result['chunk_size']) is int and result['chunk_size'] == 65536, 'runtime-metadata-result')
    pinned_sha(result['source_row_sha256']); pinned_sha(result['chunk_sha256'])
    binding = result['file_binding']
    require(type(binding) is dict and set(binding) == {'sha256', 'bytes', 'metadata'}
            and binding['sha256'] == RUNTIME_METADATA_SHA256 and type(binding['bytes']) is int
            and binding['bytes'] == RUNTIME_METADATA_BYTES, 'runtime-metadata-result')
    _setup_metadata(binding['metadata'])
    require(binding['metadata'][6] == RUNTIME_METADATA_BYTES, 'runtime-metadata-result')
    proof = result['setup_proof']
    require(type(proof) is dict and set(proof) == {'schema', *RUNTIME_METADATA_SETUP, 'authority_sha256',
            'once_sha256', 'accepted_sha256', 'job_seal_sha256', 'baseline_sha256'}
            and proof['schema'] == 'helmut-runtime-metadata-setup-proof-v1'
            and all(proof[key] == value for key, value in RUNTIME_METADATA_SETUP.items()), 'runtime-metadata-result')
    for key in ('authority_sha256', 'once_sha256', 'baseline_sha256'): pinned_sha(proof[key])
    for key in ('accepted_sha256', 'job_seal_sha256'):
        require(type(proof[key]) is dict and set(proof[key]) == set(SETUP_PHASES), 'runtime-metadata-result')
        for value in proof[key].values(): pinned_sha(value)
    summary = result['json_summary']
    types = {'dict', 'list', 'str', 'int', 'float', 'bool', 'NoneType'}
    require(type(summary) is dict and set(summary) == {'root_type', 'nodes', 'max_depth', 'type_counts',
            'ascii_only', 'utf8_valid', 'schema_value_sha256'} and type(summary['root_type']) is str
            and summary['root_type'] in types
            and type(summary['nodes']) is int and 0 < summary['nodes'] <= 100000
            and type(summary['max_depth']) is int and 0 <= summary['max_depth'] <= 64
            and type(summary['ascii_only']) is bool and summary['utf8_valid'] is True
            and type(summary['type_counts']) is dict and set(summary['type_counts']) == types
            and all(type(n) is int and 0 <= n <= 100000 for n in summary['type_counts'].values())
            and sum(summary['type_counts'].values()) == summary['nodes'], 'runtime-metadata-result')
    if summary['schema_value_sha256'] is not None: pinned_sha(summary['schema_value_sha256'])
    data = result['data_base64']
    require(type(data) is str and 0 < len(data) <= 87384
            and re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', data), 'runtime-metadata-result')
    try: raw = base64.b64decode(data, validate=True)
    except (ValueError, binascii.Error): raise ValueError('runtime-metadata-result') from None
    require(base64.b64encode(raw).decode('ascii') == data
            and len(raw) == min(65536, RUNTIME_METADATA_BYTES - result['chunk_index'] * 65536)
            and digest(raw) == result['chunk_sha256']
            and (not summary['ascii_only'] or raw.isascii()), 'runtime-metadata-result')


def _setup_metadata(value):
    require(type(value) is list and len(value) == 12
            and all(type(n) is int and -(2**63) <= n < 2**64 for n in value), 'setup-result')


def _setup_history(value):
    require(type(value) is dict and set(value) == {'schema', 'status', 'code', 'files', 'job_directory', 'legacy_jobs_directory',
            'native_qualified', 'native_go_consumed'} and value['schema'] == 'helmut-setup-history-summary-v1'
            and value['status'] == 'HISTORICAL_FAILURE_BOUND_NOT_AUTHORITY' and value['code'] == 'UNIT_PROPERTIES'
            and value['native_qualified'] is False and value['native_go_consumed'] is False, 'setup-result')
    fixed = {'global_error', 'job', 'worker_error', 'guard.py', 'driver.py', 'recovery.py', 'restore.py',
             'public.py', 'context.py', 'image.py'}
    require(type(value['files']) is dict and fixed <= set(value['files']), 'setup-result')
    extras = set(value['files']) - fixed
    require(len(extras) <= 1 and all(re.fullmatch(r'\.setup-write-[a-f0-9]{32}\.tmp', name)
            for name in extras), 'setup-result')
    for row in value['files'].values():
        require(type(row) is dict and set(row) == {'sha256', 'metadata'}, 'setup-result')
        pinned_sha(row['sha256']); _setup_metadata(row['metadata'])
    for name in extras:
        master = (value['files']['worker_error']['sha256'], value['files']['worker_error']['metadata'][6])
        loser = (value['files'][name]['sha256'], value['files'][name]['metadata'][6])
        # The historical guard checks FIRST_ERROR before worker_identity/ARM.
        # If the parent already wrote UNIT_PROPERTIES, this exact other Stop can lose publication.
        require(loser == master or (master, loser) == (
            ('16add10cda6a9f5ba7c73ddf5f57dc5599c792b69c80567f44ba62420d976060', 211),
            ('97dc56c00c04996da08ab3ccd98e410b35de30dca5714a87d02db0ba4150c18f', 220)), 'setup-result')
    _setup_metadata(value['job_directory'])
    _setup_metadata(value['legacy_jobs_directory'])


def _setup_runtime(value):
    require(type(value) is dict and set(value) == {'boot_id', 'mount_identity', 'namespace_identity',
            'old_unit', 'old_controller_ended'} and value['old_controller_ended'] is True
            and type(value['boot_id']) is str
            and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value['boot_id']), 'setup-result')
    for key, count in (('mount_identity', 8), ('namespace_identity', 2)):
        require(type(value[key]) is list and len(value[key]) == count
                and all(type(n) is int and 0 <= n < 2**64 for n in value[key]), 'setup-result')
    unit = value['old_unit']
    require(type(unit) is dict and set(unit) == {'fields_sha256', 'invocation_id', 'main_pid', 'cgroup'}
            and type(unit['invocation_id']) is str and re.fullmatch('[a-f0-9]{32}', unit['invocation_id'])
            and type(unit['main_pid']) is int and 1 < unit['main_pid'] < 2**31, 'setup-result')
    pinned_sha(unit['fields_sha256'])
    group = unit['cgroup']
    require(type(group) is dict and set(group) == {'state', 'identity'}, 'setup-result')
    if group['state'] == 'ABSENT': require(group['identity'] is None, 'setup-result')
    else:
        require(group['state'] == 'EMPTY', 'setup-result')
        _setup_metadata(group['identity'])


def validate_setup_result(result, sent, capsule):
    _setup_capsule_check(capsule, sent['payload_sha256'])
    require(sent['plan_sha256'] == STAGE_PLAN and sent['nonce'] == setup_request_nonce(capsule)
            and sent['operation'] == ('status' if capsule['action'] == 'inspect' else 'admit'), 'response-binding')
    require(type(result) is dict and result.get('native_qualified') is False
            and result.get('native_go_consumed') is False, 'setup-result')
    if result.get('schema') == 'helmut-setup-successor-result-v1':
        hashes = ('authority_sha256', 'attempt_sha256', 'ready_sha256', 'accepted_sha256', 'lifecycle_sha256')
        require(set(result) == {'schema', 'status', 'contract_id', 'contract_sha256', 'phase', 'code',
                'native_qualified', 'native_go_consumed', *hashes}
                and result['contract_id'] == SETUP_CONTRACT and result['contract_sha256'] == capsule['contract_sha256']
                and type(result['code']) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', result['code']), 'setup-result')
        if result['status'] == 'FAIL_KEEP_STATE_NO_RETRY':
            require(result['phase'] in ('preflight', capsule['phase']) and all(result[key] is None for key in hashes), 'setup-result')
            if capsule['action'] == 'inspect': require(result['phase'] == 'preflight', 'setup-result')
        else:
            require(capsule['action'] == 'setup' and result['status'] == 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED'
                    and result['phase'] == capsule['phase'] and result['code'] == 'SETUP_PHASE_COMPLETE', 'setup-result')
            for key in hashes: pinned_sha(result[key])
        return
    require(capsule['action'] == 'inspect' and set(result) == {'schema', 'status', 'request_nonce', 'capsule',
            'source_sha256', 'asset_set_sha256', 'contract_sha256', 'coordinator_sha256', 'runtime', 'history',
            'gzip', 'observed_at_utc', 'native_qualified', 'native_go_consumed'}
            and result['schema'] == 'helmut-setup-successor-inspection-v1' and result['status'] == 'INSPECTED_NOT_ADMITTED'
            and result['request_nonce'] == sent['nonce'] and result['source_sha256'] == sent['payload_sha256']
            and result['contract_sha256'] == capsule['contract_sha256']
            and type(result['observed_at_utc']) is int
            and capsule['issued_at_utc'] <= result['observed_at_utc'] <= capsule['expires_at_utc'], 'setup-result')
    _setup_capsule_check(result['capsule'], sent['payload_sha256'])
    require(canonical(result['capsule']) == canonical(capsule), 'response-binding')
    for key in ('asset_set_sha256', 'coordinator_sha256'): pinned_sha(result[key])
    _setup_runtime(result['runtime']); _setup_history(result['history'])
    gzip = result['gzip']
    require(type(gzip) is dict and set(gzip) == {'sha256', 'bytes', 'metadata'}
            and gzip['sha256'] == 'be423c617c14d92ed833c6e8a97c3a094eb70c23dc13b05b2c114c953f73b18a'
            and type(gzip['bytes']) is int and gzip['bytes'] == 487052181, 'setup-result')
    _setup_metadata(gzip['metadata'])
    require(gzip['metadata'][6] == gzip['bytes'], 'setup-result')


def public_packets(raw):
    """Reject secret and unknown OpenPGP packet types before invoking GnuPG."""
    position, primary = 0, 0
    while position < len(raw):
        header = raw[position]
        position += 1
        require(header & 128, "recipient-format")
        if header & 64:
            tag = header & 63
            require(position < len(raw), "recipient-format")
            length = raw[position]
            position += 1
            if 192 <= length <= 223:
                require(position < len(raw), "recipient-format")
                length = ((length - 192) << 8) + raw[position] + 192
                position += 1
            elif length == 255:
                require(position + 4 <= len(raw), "recipient-format")
                length = int.from_bytes(raw[position:position + 4], "big")
                position += 4
            else:
                require(length < 224, "recipient-format")
        else:
            tag, kind = (header >> 2) & 15, header & 3
            require(kind != 3, "recipient-format")
            width = (1, 2, 4)[kind]
            require(position + width <= len(raw), "recipient-format")
            length = int.from_bytes(raw[position:position + width], "big")
            position += width
        require(tag not in (5, 7), "recipient-private-material")
        require(tag in (2, 6, 13, 14, 17) and length > 0 and
                position + length <= len(raw), "recipient-format")
        primary += tag == 6
        position += length
    require(primary == 1, "recipient-format")


def validate_recipient(recipient):
    require(type(recipient) is dict and set(recipient) == {
        "fingerprint", "public_key_base64", "public_sha256"}, "result-fields")
    fingerprint = recipient["fingerprint"]
    require(type(fingerprint) is str and
            re.fullmatch(r"[A-F0-9]{40}", fingerprint), "recipient-fingerprint")
    encoded = recipient["public_key_base64"]
    require(type(encoded) is str and 0 < len(encoded) <= (MAX_PUBLIC_KEY + 2) // 3 * 4,
            "recipient-format")
    try:
        public = base64.b64decode(encoded, validate=True)
        text = public.decode("ascii")
    except (ValueError, binascii.Error, UnicodeError):
        raise ValueError("recipient-format") from None
    require(0 < len(public) <= MAX_PUBLIC_KEY and
            digest(public) == pinned_sha(recipient["public_sha256"]), "recipient-hash")
    lines = text.splitlines()
    require(len(lines) >= 5 and lines[0] == "-----BEGIN PGP PUBLIC KEY BLOCK-----" and
            lines[1] == "" and lines[-1] == "-----END PGP PUBLIC KEY BLOCK-----",
            "recipient-format")
    body = lines[2:-1]
    if body and re.fullmatch(r"=[A-Za-z0-9+/]{4}", body[-1]):
        body = body[:-1]
    require(body and all(re.fullmatch(r"[A-Za-z0-9+/]{1,76}={0,2}", line)
                        for line in body), "recipient-format")
    try:
        public_packets(base64.b64decode("".join(body), validate=True))
    except binascii.Error:
        raise ValueError("recipient-format") from None
    with tempfile.TemporaryDirectory(prefix="helmut-public-gpg-") as home:
        completed = subprocess.run([
            "/usr/bin/gpg", "--no-options", "--batch", "--no-tty", "--no-autostart",
            "--homedir", home, "--no-auto-key-retrieve", "--auto-key-locate", "clear",
            "--with-colons", "--import-options", "show-only", "--import",
        ], input=public, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=10, check=False)
    require(completed.returncode == 0 and len(completed.stdout) <= MAX_RESPONSE,
            "recipient-validation")
    records = completed.stdout.decode("ascii").splitlines()
    require(sum(line.startswith("pub:") for line in records) == 1 and
            not any(line.startswith(("sec:", "ssb:")) for line in records),
            "recipient-private-material")
    fingerprints = [line.split(":")[9] for line in records if line.startswith("fpr:")]
    require(fingerprints and fingerprints[0] == fingerprint, "recipient-fingerprint")


DIAGNOSTIC_PHASES = ('preflight', 'attempt', 'home', 'generate', 'add-subkey',
    'verify-public', 'export-public', 'verify-private-metadata', 'write-public', 'write-result',
    'recovery-preflight', 'recovery-public-before', 'recovery-trust-refresh',
    'recovery-public-after', 'recovery-public-export', 'recovery-private-metadata',
    'recovery-write-public', 'recovery-write-result')
DIAGNOSTIC_CODES = ('BASE_IDENTITY_CHANGED', 'DIRECTORY_OWNER_OR_TYPE',
    'DIRECTORY_PERMISSIONS', 'EXECUTOR_REQUIRED', 'FILESYSTEM_OR_INTERNAL_FAILURE',
    'FILE_SIZE_OR_TYPE', 'FILE_WRITE_SHORT', 'HOME_IDENTITY_CHANGED', 'KEY_STATUS_INVALID',
    'NEW_FILE_METADATA', 'PRIVATE_DIRECTORY_CHANGED', 'PRIVATE_FILE_PERMISSIONS',
    'PRIVATE_KEY_COUNT', 'PRIVATE_KEY_METADATA', 'PRIVATE_OWNER', 'PRIVATE_SPECIAL_FILE',
    'PRIVATE_TREE_DEPTH', 'PRIVATE_TREE_LIMIT', 'PUBLIC_ALGORITHM_MISMATCH',
    'PUBLIC_ARMOR_INVALID', 'PUBLIC_EXPIRY_INVALID', 'PUBLIC_FINGERPRINT_MISMATCH',
    'PUBLIC_IDENTITY_OR_VALIDITY', 'PUBLIC_LIST_FIELDS', 'PUBLIC_LIST_INVALID',
    'PUBLIC_LIST_SHAPE', 'PUBLIC_USAGE_MISMATCH', 'RECIPIENT_ALREADY_ATTEMPTED',
    'ROOT_REQUIRED', 'TARGET_BASE_REJECTED', 'TOOL_EXECUTION_FAILED', 'TOOL_EXIT_NONZERO',
    'TOOL_OUTPUT_LIMIT', 'TOOL_RESULT_TYPE', 'RECOVERY_ORIGINAL_BINDING',
    'RECOVERY_ALREADY_ATTEMPTED', 'RECOVERY_CACHE_NOT_PROVEN',
    'RECOVERY_KEY_METADATA_CHANGED', 'RECOVERY_PUBLIC_RING_CHANGED')
DIAGNOSTIC_TOOL_CLASSES = ('AGENT_CONNECTION', 'AGENT_GENERATION', 'PERMISSION_DENIED',
    'MISSING_FILE', 'PINENTRY', 'UNSUPPORTED_OPTION', 'UNSUPPORTED_ALGORITHM', 'UNCLASSIFIED')


def validate_recipient_diagnostic(diagnostic):
    require(type(diagnostic) is dict and set(diagnostic) == {'recipient', 'gpg'}, 'result-fields')
    for name in ('recipient', 'gpg'):
        row = diagnostic[name]
        extra = {'phase'} if name == 'recipient' else {'stderr_classes'}
        require(type(row) is dict and set(row) == {'state', 'sha256', 'code'} | extra,
                'result-fields')
        state = row['state']
        require(type(state) is str and state in ('ABSENT', 'UNTRUSTED', 'UNRECOGNIZED', 'OBSERVED'),
                'result-fields')
        if state in ('ABSENT', 'UNTRUSTED'):
            require(row['sha256'] is None, 'result-fields')
        else:
            pinned_sha(row['sha256'])
        if state != 'OBSERVED':
            require(row['code'] is None and (row['phase'] is None if name == 'recipient'
                    else row['stderr_classes'] == []), 'result-fields')
        elif name == 'recipient':
            require(type(row['phase']) is str and row['phase'] in DIAGNOSTIC_PHASES
                    and type(row['code']) is str and row['code'] in DIAGNOSTIC_CODES, 'result-fields')
        else:
            code = row['code']
            require(type(code) is str, 'result-fields')
            number = re.fullmatch(r'EXIT_(-?[0-9]{1,3})', code)
            require(code in ('TOOL_TIMEOUT', 'TOOL_OUTPUT_LIMIT', 'TOOL_EXECUTION_FAILURE')
                    or number is not None and -64 <= int(number[1]) <= 255, 'result-fields')
            classes = row['stderr_classes']
            require(type(classes) is list and 0 < len(classes) <= len(DIAGNOSTIC_TOOL_CLASSES)
                    and all(type(value) is str and value in DIAGNOSTIC_TOOL_CLASSES for value in classes)
                    and classes == sorted(set(classes))
                    and ('UNCLASSIFIED' not in classes or classes == ['UNCLASSIFIED']), 'result-fields')


STAGE_DIAG_CODES = ('CASE_BINDING_ABSENT','CASE_BINDING_UNTRUSTED','CASE_BINDING_INVALID',
    'STAGE_ERROR_ABSENT','STAGE_ERROR_UNTRUSTED','STAGE_ERROR_INVALID',
    'RESTORE_RECEIPT_ABSENT','RESTORE_RECEIPT_UNTRUSTED','RESTORE_RECEIPT_OVERSIZE',
    'RESTORE_RECEIPT_INVALID','SAVED_RESTORE_RECEIPT')
STAGE_RESTORE_CODES = ('DESTINATION_DIRECTORY', 'FILESYSTEM_OR_FORMAT_FAILURE', 'FILE_HASH',
    'GZIP_INPUT_LIMIT', 'GZIP_TRAILING_BYTES', 'GZIP_TRUNCATED', 'INPUT_CHANGED', 'INPUT_IDENTITY',
    'JSON_CONSTANT', 'JSON_DUPLICATE', 'PARENT_CHANGED', 'PATH_ESCAPE', 'PATH_FORMAT', 'PAX_KEY',
    'PAX_LENGTH', 'PAX_LIMIT', 'PAX_MTIME', 'PAX_RECORD', 'RESTORED_DIRECTORY_METADATA',
    'RESTORED_FILE_HASH', 'RESTORED_FILE_METADATA', 'RESTORED_FILE_TRUNCATED',
    'RESTORED_LINK_METADATA', 'RESTORED_MTIME', 'ROOT_REQUIRED', 'SCOPE_BYTES', 'SCOPE_COUNTS',
    'SCOPE_FILE', 'SCOPE_FIRST', 'SCOPE_HASH', 'SCOPE_LINK_TARGET', 'SCOPE_METADATA',
    'SCOPE_PARENT_TYPE', 'SHORT_WRITE', 'TAR_CHECKSUM', 'TAR_END', 'TAR_ENTRY_TYPE',
    'TAR_EXTRA_OR_DUPLICATE', 'TAR_FORMAT', 'TAR_METADATA', 'TAR_MISSING_ENTRIES',
    'TAR_NONZERO_PADDING', 'TAR_NUMBER', 'TAR_TOTAL_LIMIT', 'TAR_TRAILING_BYTES', 'TAR_TRUNCATED',
    'UNTRUSTED_PARENT')

def validate_stage_diagnostic(value):
    require(type(value) is dict and set(value)=={'schema','state','diagnostic_code','stage_code',
        'restore_status','restore_code','receipt_sha256','actual_file_count','actual_bytes',
        'remaining_entries','partial_file_state','metadata_state','last_verified_member_name_sha256'},'result-fields')
    require(value['schema']=='helmut-stage-first-error-diagnostic-v1'
            and value['state'] in ('ABSENT','UNKNOWN','RECORDED')
            and value['diagnostic_code'] in STAGE_DIAG_CODES
            and value['stage_code'] in (None,'STAGE_RESTORE'),'result-fields')
    for key in ('receipt_sha256','last_verified_member_name_sha256'):
        if value[key] is not None:pinned_sha(value[key])
    if value['state']!='RECORDED':
        require(value['diagnostic_code']!='SAVED_RESTORE_RECEIPT'
                and value['diagnostic_code'].endswith('_ABSENT')==(value['state']=='ABSENT')
                and all(value[key] is None for key in ('restore_status','restore_code','actual_file_count',
                    'actual_bytes','remaining_entries','partial_file_state','metadata_state','last_verified_member_name_sha256')),
                'result-fields')
        if value['state']=='ABSENT':require(value['receipt_sha256'] is None,'result-fields')
        return
    require(value['diagnostic_code']=='SAVED_RESTORE_RECEIPT' and value['stage_code']=='STAGE_RESTORE'
            and value['receipt_sha256'] is not None
            and value['restore_status'] in ('FAIL_KEEP_STATE_NO_RETRY','BYTES_RESTORED_NOT_NATIVE_QUALIFIED')
            and value['partial_file_state'] in ('NONE','UNKNOWN')
            and value['metadata_state'] in ('UNKNOWN','VERIFIED'),'result-fields')
    for key,cap in (('actual_file_count',1767),('actual_bytes',2865680705),('remaining_entries',1866)):
        require(type(value[key]) is int and 0<=value[key]<=cap,'result-fields')
    require((value['last_verified_member_name_sha256'] is None)==(value['actual_file_count']==0),'result-fields')
    if value['restore_status']=='FAIL_KEEP_STATE_NO_RETRY':
        require(type(value['restore_code']) is str and value['restore_code'] in STAGE_RESTORE_CODES,'result-fields')
    else:
        require(value['restore_code'] is None and value['actual_file_count']==1767
                and value['actual_bytes']==2865680705 and value['remaining_entries']==0
                and value['partial_file_state']=='NONE' and value['metadata_state']=='VERIFIED','result-fields')


def validate_result(result, operation, payload_sha256):
    require(type(result) is dict, "result-fields")
    if operation == "status":
        fields={"status", "enabled_operations", "native_enabled","source_sha256", "recipient_diagnostic"}
        require(set(result) in (fields,fields|{'stage_diagnostic'}), "result-fields")
        require(result["status"] == "CONTROL_READY", "result-status")
        require(result["enabled_operations"] in (list(ENABLED_OPERATIONS), list(ENABLED_OPERATIONS[:-1])),
                "enabled-operations-denied")
        require(result["native_enabled"] is False, "native-enabled-denied")
        require(pinned_sha(result["source_sha256"]) == payload_sha256, "source-pin-drift")
        validate_recipient_diagnostic(result['recipient_diagnostic'])
        if 'stage_diagnostic' in result:validate_stage_diagnostic(result['stage_diagnostic'])
    elif operation == "recipient":
        require(set(result) in ({"status", "recipient"}, {"status", "recipient", "recovery"}), "result-fields")
        require(result["status"] == "RECIPIENT_READY", "result-status")
        validate_recipient(result["recipient"])
        if 'recovery' in result:
            validate_recovery_receipt(result['recovery'], result['recipient']['public_sha256'])
    elif operation == 'stage':
        require(set(result)=={'schema','status','native_qualified','plan_sha256','scope_sha256',
            'capsule_sha256','case_id','cipher_sha256','compressed_tar_sha256',
            'actual_file_count','actual_bytes','receipt_sha256','code'},'result-fields')
        require(result['schema']=='helmut-private-drive-stage-result-v1'
                and result['native_qualified'] is False and result['plan_sha256']==STAGE_PLAN
                and result['scope_sha256']==STAGE_SCOPE and result['code'] in STAGE_CODES,'result-fields')
        for key in ('capsule_sha256','case_id','cipher_sha256','compressed_tar_sha256','receipt_sha256'):
            if result[key] is not None:pinned_sha(result[key])
        ready=result['code']=='STAGE_COMPLETE'
        require(result['status']==('STAGE_READY_NOT_NATIVE_QUALIFIED' if ready else 'FAIL_KEEP_STATE_NO_RETRY'),
                'result-status')
        if ready:
            require(all(result[key] is not None for key in
                        ('capsule_sha256','case_id','cipher_sha256','compressed_tar_sha256','receipt_sha256'))
                    and result['actual_file_count']==1767 and result['actual_bytes']==2865680705,'result-fields')
            require(type(result['actual_file_count']) is int and type(result['actual_bytes']) is int,'result-fields')
        else:
            require(result['receipt_sha256'] is None and result['actual_file_count'] is None
                    and result['actual_bytes'] is None,'result-fields')
    elif operation == 'admit':
        require(set(result) == {'schema', 'status', 'phase', 'code', 'ready_sha256',
                'accepted_sha256', 'lifecycle_sha256', 'native_qualified', 'native_go_consumed'}, 'result-fields')
        require(result['schema'] == 'helmut-target-setup-result-v1'
                and result['native_qualified'] is False and result['native_go_consumed'] is False,
                'result-fields')
        require(result['phase'] in ('preflight', 'recover', 'checkout', 'context', 'image', 'complete')
                and type(result['code']) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', result['code']),
                'result-fields')
        for key in ('ready_sha256', 'accepted_sha256', 'lifecycle_sha256'):
            if result[key] is not None: pinned_sha(result[key])
        if result['status'] == 'FAIL_KEEP_STATE_NO_RETRY':
            require(all(result[key] is None for key in ('ready_sha256', 'accepted_sha256', 'lifecycle_sha256')),
                    'result-fields')
        else:
            complete = result['status'] == 'SETUP_COMPLETE_NOT_NATIVE_QUALIFIED'
            require(result['status'] in ('SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED',
                                         'SETUP_COMPLETE_NOT_NATIVE_QUALIFIED')
                    and result['code'] == ('SETUP_COMPLETE' if complete else 'SETUP_PHASE_COMPLETE')
                    and (result['phase'] == 'complete' if complete else result['phase'] in
                         ('recover', 'checkout', 'context', 'image'))
                    and all(result[key] is not None for key in
                            ('ready_sha256', 'accepted_sha256', 'lifecycle_sha256')), 'result-fields')
    else:
        raise ValueError("operation-not-qualified")


def validate_recovery_receipt(receipt, public_sha256):
    require(type(receipt) is dict and set(receipt) == {
        'original_error_sha256', 'receipt_sha256', 'before_validity', 'after_validity',
        'ownertrust', 'identity_matches', 'trust_cache_refreshed',
        'private_key_metadata_unchanged', 'pubring_sha256', 'public_sha256',
        'key_generation_attempts', 'subkey_add_attempts'}, 'result-fields')
    require(receipt['original_error_sha256'] ==
        '7d168d7defda650d313e152bd1b015b13becc24c9827eb411de775d6a6beae50', 'result-fields')
    for key in ('receipt_sha256', 'pubring_sha256', 'public_sha256'):
        pinned_sha(receipt[key])
    require(receipt['public_sha256'] == public_sha256, 'recipient-hash')
    before = receipt['before_validity']
    require(type(before) is list and len(before) == 3
            and all(type(value) is str and value in ('u', '-', 'o', 'q') for value in before),
            'result-fields')
    require(receipt['after_validity'] == ['u', 'u', 'u'] and receipt['ownertrust'] == 'u'
            and receipt['identity_matches'] is True and receipt['private_key_metadata_unchanged'] is True,
            'result-fields')
    require(type(receipt['trust_cache_refreshed']) is bool
            and receipt['trust_cache_refreshed'] == (before != ['u', 'u', 'u']), 'result-fields')
    require(all(type(receipt[key]) is int and receipt[key] == 0
                for key in ('key_generation_attempts', 'subkey_add_attempts')), 'result-fields')


def validate_response(raw, sent, successor_capsule=None):
    require(type(raw) is bytes and 0 < len(raw) <= MAX_RESPONSE, "response-size")
    reply = json_unique(raw)
    require(type(reply) is dict and set(reply) == RESPONSE_FIELDS, "response-fields")
    require(reply["schema"] == "helmut-native-control-response-v1" and
            all(reply[key] == sent[key] for key in
                ("operation", "nonce", "plan_sha256", "payload_sha256")),
            "response-binding")
    require(pinned_sha(reply["result_sha256"]) == digest(canonical(reply["result"])),
            "response-hash")
    if successor_capsule is None:
        validate_result(reply["result"], sent["operation"], sent["payload_sha256"])
    elif type(successor_capsule) is dict and successor_capsule.get('schema') == 'helmut-runtime-metadata-capsule-v1':
        validate_runtime_metadata_result(reply['result'], sent, successor_capsule)
    else:
        validate_setup_result(reply['result'], sent, successor_capsule)
    if sent['operation']=='stage':require(sent['plan_sha256']==STAGE_PLAN,'response-binding')
    return reply


def transport_configuration(environment):
    try:
        address = ipaddress.ip_address(environment.get("HELMUT_CI_HOST", ""))
    except ValueError:
        raise ValueError("host-denied") from None
    require(address.version == 4 and address in ipaddress.ip_network("100.64.0.0/10"),
            "host-denied")
    host = str(address)
    public = environment.get("HELMUT_CI_HOST_PUBLIC_KEY", "")
    require(re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}", public), "host-key-denied")
    try:
        blob = base64.b64decode(public.split()[1], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("host-key-denied") from None
    require(len(blob) == 51 and blob[:19] ==
            b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" and
            "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
            == HOST_FINGERPRINT, "host-key-denied")
    private = environment.get("HELMUT_CI_SSH_KEY", "")
    require(type(private) is str and 0 < len(private) <= 16384 and
            private.startswith("-----BEGIN OPENSSH PRIVATE KEY-----\n"), "ssh-key-required")
    return host, public, private


def ssh_arguments(host, key, known_hosts):
    return [
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", "22", "-i", str(key),
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
        "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known_hosts}",
        "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ForwardAgent=no",
        "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
        "-o", "ConnectTimeout=15", "-o", "ConnectionAttempts=1", "-o", "LogLevel=ERROR",
        "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
        f"root@{host}", "helmut-native-control-v1",
    ]


def bounded_exchange(arguments, raw_request, timeout=360, include_returncode=False):
    require(0 < len(raw_request) <= 8192+MAX_STAGE_CAPSULE+1, "response-size")
    process = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL,
                               env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    deadline = time.monotonic() + timeout
    output = bytearray()
    try:
        offset=0;write_failed=False
        os.set_blocking(process.stdin.fileno(),False)
        os.set_blocking(process.stdout.fileno(),False)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdin,selectors.EVENT_WRITE,'input')
            selector.register(process.stdout, selectors.EVENT_READ,'output')
            while selector.get_map():
                remaining = deadline - time.monotonic()
                require(remaining > 0, "ssh-timeout")
                events=selector.select(remaining)
                require(events, "ssh-timeout")
                for key,_ in events:
                    if key.data=='input':
                        try:count=os.write(process.stdin.fileno(),raw_request[offset:offset+4096])
                        except BrokenPipeError:
                            # An early server FAIL can close SSH input before it
                            # consumes the capsule. Still drain and validate its
                            # reply; incomplete input can never establish READY.
                            write_failed=True;selector.unregister(process.stdin)
                            try:process.stdin.close()
                            except BrokenPipeError:pass
                            continue
                        require(count>0,'ssh-failed');offset+=count
                        if offset==len(raw_request):
                            selector.unregister(process.stdin);process.stdin.close()
                    else:
                        chunk=os.read(process.stdout.fileno(),min(65536,MAX_RESPONSE+1-len(output)))
                        if not chunk:selector.unregister(process.stdout)
                        else:output.extend(chunk)
                        require(len(output)<=MAX_RESPONSE,'response-size')
        code=process.wait(timeout=max(0.01,deadline-time.monotonic()))
        if write_failed:code=code or 1
        if include_returncode:return bytes(output),code
        require(code==0,'ssh-failed')
        return bytes(output)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()
        if not process.stdin.closed:process.stdin.close()


def write_public_artifact(directory, reply):
    directory = Path(directory)
    require(not directory.exists(), "public-output-exists")
    directory.mkdir(mode=0o700)
    content = canonical(reply) + b"\n"
    for name, raw in (("RESPONSE.SAFE.json", content),
                      ("RESPONSE.SAFE.sha256", (digest(content) +
                       "  RESPONSE.SAFE.json\n").encode("ascii"))):
        descriptor = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)


def client(environment):
    operation, plan, payload = validate_context(environment)
    setup_line, successor = setup_capsule(environment, operation)
    sent = request(operation, plan, payload, control_request_nonce(successor) if successor is not None else secrets.token_hex(32))
    capsule_line,capsule_raw=stage_capsule(environment,operation)
    host, public, private = transport_configuration(environment)
    require(successor is None or host == '100.96.83.66', 'host-denied')
    temporary = Path(environment.get("RUNNER_TEMP", ""))
    require(temporary.is_absolute() and temporary.is_dir(), "runner-temp-denied")
    with tempfile.TemporaryDirectory(prefix="helmut-native-private-", dir=temporary) as directory:
        key, hosts = Path(directory) / "key", Path(directory) / "known_hosts"
        for path, value in ((key, private), (hosts, host + " " + public + "\n")):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(value)
        raw,code = bounded_exchange(ssh_arguments(host,key,hosts),canonical(sent)+b'\n'+(setup_line or capsule_line),
                                   include_returncode=True)
        reply = validate_response(raw, sent, successor)
        failed=(successor is not None or operation in ('stage', 'admit')) and reply['result']['status'] in (
            'FAIL_KEEP_STATE_NO_RETRY', 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED')
        require(code==0 or failed,'ssh-failed')
        if operation=='stage' and reply['result']['capsule_sha256'] is not None:
            require(reply['result']['capsule_sha256']==digest(capsule_raw),'response-binding')
    write_public_artifact(temporary / "helmut-native-public", reply)
    print("helmut-native-control: validated-public-response " + digest(canonical(reply) + b"\n"))
    return 1 if failed else 0


def main():
    try:
        if sys.argv[1:] == ["validate"]:
            validate_context(os.environ)
        elif sys.argv[1:] == ["client"]:
            return client(os.environ) or 0
        else:
            raise ValueError("mode-denied")
        return 0
    except (OSError, ValueError, TypeError, KeyError, IndexError,
            UnicodeError, RecursionError, subprocess.SubprocessError) as error:
        code = error.args[0] if isinstance(error, ValueError) and error.args else "validation-failed"
        if code not in SAFE_CODES:
            code = "validation-failed"
        print("helmut-native-control: rejected: " + code, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
