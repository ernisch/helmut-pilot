#!/usr/bin/env python3
"""One new two-phase setup contract; retained failures and all original rights stay closed."""
import fcntl
import hashlib
import http.client
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
NAMESPACE = 'setup-context-daemon-binding-v2'
STATE_ROOT = BASE + '/' + NAMESPACE
AUTHORITY = 'SETUP_CONTEXT_DAEMON_BINDING_V2_AUTHORITY.PRIVATE.json'
ONCE = NAMESPACE + '.json'
ERROR = 'FIRST_ERROR.PRIVATE.json'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
PHASES = ('context', 'image')
COUNTS = (11, 12)
PRIMARY = ('context_receipt', 'image_receipt')
OLD_RECEIPT = '160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be'
RECOVERY_READY = '0156f043d7bfa7f50a68864d415ab71f02bdb2522048ca45bfe400b5d7c01939'
PUBLIC_READY = '54ae9b1327aaaabe221a5b4bcc39a973026fddade8da91dd22995d9cc0a34187'
READER_SHA = 'edcc93c55404685d3637abb096589f90c02ec1fce2a0e75b54dc53003b269046'
CAP = 262144
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
PREFIX = b'helmut-context-continuation-request-v1\0'
CAPSULE_KEYS = {'schema', 'contract_id', 'action', 'phase', 'source_sha256', 'contract_sha256',
    'nonce', 'inspection_nonce', 'inspection_result_sha256', 'issued_at_utc', 'expires_at_utc'}
FILES = {'guard.py': 'hetzner-native-context-continuation-service.py',
    'driver.py': 'hetzner-native-context-continuation-driver.py',
    'recovery.py': 'hetzner-native-local-restore-recovery.py',
    'restore.py': 'hetzner-native-stage-restore.py', 'public.py': 'hetzner-native-public-checkout.py',
    'context.py': 'hetzner-native-context-continuation.py', 'image.py': 'hetzner-native-context-continuation-image.py'}
INSPECTION_KEYS = {'schema','status','contract_id','request_nonce','capsule','source_sha256','contract_sha256',
    'asset_set_sha256','coordinator_sha256','old_baseline_sha256','partial_setup_proof','failure_diagnostic',
    'daemon_identity_sha256','preflight','observed_at_utc','native_qualified','native_go_consumed'}

class Stop(Exception):
    @property
    def code(self): return self.args[0]

def need(value, code):
    if not value: raise Stop(code)

def sha(raw): return hashlib.sha256(raw).hexdigest()

def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None

def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False) + '\n').encode('ascii')

def parsed(raw):
    def unique(rows):
        value = {}
        for key, item in rows:
            need(key not in value, 'CONTINUATION_DUPLICATE_JSON')
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: need(False, 'CONTINUATION_JSON_CONSTANT'))

def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'CONTINUATION_DEADLINE')

def metadata_check(value):
    need(type(value) is list and len(value) == 12
         and all(type(n) is int and -(2**63) <= n < 2**64 for n in value), 'CONTINUATION_METADATA')

def capsule_check(capsule, context, contract_sha, now=None):
    need(type(capsule) is dict and set(capsule) == CAPSULE_KEYS
         and capsule['schema'] == 'helmut-context-continuation-capsule-v1'
         and capsule['contract_id'] == NAMESPACE and capsule['action'] in ('inspect', 'setup')
         and capsule['source_sha256'] == context['source_sha256']
         and capsule['contract_sha256'] == contract_sha and hex64(capsule['nonce']), 'CONTINUATION_CAPSULE')
    need(type(capsule['issued_at_utc']) is int and type(capsule['expires_at_utc']) is int
         and 0 < capsule['issued_at_utc'] < capsule['expires_at_utc']
         and capsule['expires_at_utc'] - capsule['issued_at_utc'] <= 300, 'CONTINUATION_CAPSULE_TIME')
    if now is not None:
        need(capsule['issued_at_utc'] <= now <= capsule['expires_at_utc'], 'CONTINUATION_CAPSULE_TIME')
    if capsule['action'] == 'inspect':
        need(capsule['phase'] is None and capsule['inspection_nonce'] is None
             and capsule['inspection_result_sha256'] is None, 'CONTINUATION_CAPSULE')
    else:
        need(capsule['phase'] in PHASES and hex64(capsule['inspection_nonce'])
             and hex64(capsule['inspection_result_sha256']), 'CONTINUATION_CAPSULE')

def read_bound(path, name, library, deadline, cap=CAP, mode=0o600):
    bounded(deadline)
    root, fresh, fd = library['directory'](path), None, None
    try:
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd)
        before = library['metadata'](info)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= cap, 'CONTINUATION_FILE_IDENTITY')
        raw = bytearray()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, cap + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            need(len(raw) <= cap, 'CONTINUATION_FILE_LIMIT')
        fresh = library['directory'](path)
        need(len(raw) == info.st_size and before == library['metadata'](os.fstat(fd))
             == library['metadata'](os.stat(name, dir_fd=root, follow_symlinks=False))
             == library['metadata'](os.stat(name, dir_fd=fresh, follow_symlinks=False))
             and (os.fstat(root).st_dev, os.fstat(root).st_ino)
             == (os.fstat(fresh).st_dev, os.fstat(fresh).st_ino), 'CONTINUATION_FILE_CHANGED')
        raw = bytes(raw)
        return raw, {'sha256': sha(raw), 'metadata': before}
    finally:
        for fd in (fd, fresh, root):
            if fd is not None: os.close(fd)

def seal_name(phase):
    need(phase in PHASES, 'CONTINUATION_SEAL_PHASE')
    return 'JOB_SEAL_' + phase.upper() + '.PRIVATE.json'

def job_snapshot(nonce, assets, expected, library, deadline):
    """Read every physical success artifact; never treat an absent job as empty."""
    need(hex64(nonce) and type(assets) is dict and type(expected) is dict
         and set(assets) == set(expected) == {'guard.py', 'driver.py', 'recovery.py', 'restore.py',
                                           'public.py', 'context.py', 'image.py'}, 'CONTINUATION_JOB_ASSETS')
    names = set(assets) | {'JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'ACK.PRIVATE.json', 'RESULT.PRIVATE.json'}
    path = STATE_ROOT + '/jobs/' + nonce
    root, fresh = library['directory'](path), None
    try:
        info = os.fstat(root)
        before = library['metadata'](info)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and stat.S_IMODE(info.st_mode) == 0o700, 'CONTINUATION_JOB_DIRECTORY')
        def members(fd):
            found = []
            with os.scandir(fd) as entries:
                for entry in entries:
                    bounded(deadline)
                    found.append(entry.name)
                    need(len(found) <= 11, 'CONTINUATION_JOB_FILES')
            need(set(found) == names, 'CONTINUATION_JOB_FILES')
        members(root)
        rows, raw = {}, {}
        for name in sorted(names):
            source = name in assets
            raw[name], rows[name] = read_bound(path, name, library, deadline,
                                             131072 if source else 16384, 0o500 if source else 0o600)
            if source:
                pin = expected[name]
                need(type(pin) is dict and set(pin) == {'sha256', 'bytes'}
                     and type(pin['bytes']) is int and type(assets[name]) is bytes
                     and raw[name] == assets[name] and len(raw[name]) == pin['bytes']
                     and sha(raw[name]) == pin['sha256'], 'CONTINUATION_JOB_ASSET_CHANGED')
        fresh = library['directory'](path)
        members(root); members(fresh)
        need(before == library['metadata'](os.fstat(root)) == library['metadata'](os.fstat(fresh)),
             'CONTINUATION_JOB_DIRECTORY_CHANGED')
        return {'directory': before, 'files': rows}, raw
    finally:
        for fd in (fresh, root):
            if fd is not None: os.close(fd)

def job_evidence(nonce, phase, proof, value, data, context, assets, expected, guard, library, deadline,
                 current=False):
    snapshot, raw = job_snapshot(nonce, assets, expected, library, deadline)
    job = parsed(raw['JOB.PRIVATE.json'])
    need(type(job) is dict and type(job.get('deadline')) in (int, float)
         and math.isfinite(job['deadline']) and 0 < job['deadline'] < 2**53
         and (not current or job['deadline'] == context['deadline']), 'CONTINUATION_SEALED_JOB_TIME')
    request = {'schema': 'helmut-native-control-request-v1', 'operation': 'admit', 'nonce': nonce,
               'plan_sha256': PLAN, 'payload_sha256': context['source_sha256']}
    guard['result_check'](value, phase)
    # A historic finished job has no current run authority. This library check
    # validates its closed stored schema/proof against its original deadline;
    # never call guard.job_check(), which applies a live monotonic deadline.
    lifecycle_check(proof, request, {**context, 'deadline': job['deadline']}, phase, value,
                    guard, data, expected, library)
    need(type(proof) is dict and raw['RESULT.PRIVATE.json'] == encoded(value)
         and sha(raw['JOB.PRIVATE.json']) == proof['job_sha256']
         and sha(raw['RESULT.PRIVATE.json']) == proof['result_sha256'], 'CONTINUATION_JOB_RESULT_BINDING')
    arm = {'schema': 'helmut-context-daemon-binding-v2-service-arm-v1', 'nonce': nonce,
           'job_sha256': proof['job_sha256'], 'controller_source_sha256': context['source_sha256'],
           'worker': proof['worker']}
    ack = {'schema': 'helmut-context-daemon-binding-v2-service-ack-v1', 'nonce': nonce,
           'job_sha256': proof['job_sha256'], 'result_sha256': proof['result_sha256'], 'worker': proof['worker']}
    need(raw['ARM.PRIVATE.json'] == encoded(arm) and raw['ACK.PRIVATE.json'] == encoded(ack),
         'CONTINUATION_JOB_HANDSHAKE')
    return snapshot

def seal_value(nonce, phase, proof, snapshot, context, asset_set, authority_sha, contract_sha):
    return {'schema': 'helmut-context-continuation-job-seal-v1', 'contract_id': NAMESPACE,
        'phase': phase, 'nonce': nonce, 'source_sha256': context['source_sha256'],
        'asset_set_sha256': asset_set, 'authority_sha256': authority_sha, 'contract_sha256': contract_sha,
        'guard_result_sha256': proof['result_sha256'], 'lifecycle_sha256': sha(encoded(proof)),
        'lifecycle_proof': proof, 'job_directory': snapshot['directory'], 'files': snapshot['files']}

def state_check(root, library, accepted, authority_sha, contract_sha, deadline):
    need(library['absent'](root, ERROR) and library['absent'](root, ERROR + '.PENDING'), 'CONTINUATION_PREVIOUS_FAILURE')
    allowed = ({'jobs'} | {library['marker_name'](p) for p in PHASES}
               | {'ATTEMPT_' + p.upper() + '.PRIVATE.json' for p in PHASES} | {seal_name(p) for p in PHASES})
    names = []
    with os.scandir(root) as entries:
        for entry in entries:
            names.append(entry.name)
            need(len(names) <= len(allowed), 'CONTINUATION_STATE_UNKNOWN')
    need(set(names) <= allowed, 'CONTINUATION_STATE_UNKNOWN')
    for index, phase in enumerate(PHASES):
        name = 'ATTEMPT_' + phase.upper() + '.PRIVATE.json'
        if index < len(accepted):
            raw, _ = read_bound(STATE_ROOT, name, library, deadline, 16384)
            need(parsed(raw) == attempt_value(phase, accepted[index][0]['nonce'], authority_sha, contract_sha),
                 'CONTINUATION_ATTEMPT_CHANGED')
            need(not library['absent'](root, seal_name(phase)), 'CONTINUATION_JOB_SEAL_MISSING')
        else:
            need(library['absent'](root, name) and library['absent'](root, seal_name(phase)),
                 'CONTINUATION_UNACCEPTED_ATTEMPT')

def safe_code(error):
    code = getattr(error, 'code', None)
    if code is None and type(error).__name__ in ('Stop', 'SetupError') and len(error.args) == 1:
        code = error.args[0]
    return code if type(code) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) else 'CONTINUATION_IO_OR_FORMAT'

def jobs_root(): return STATE_ROOT + '/jobs'


def data_for(accepted):
    return {'old_receipt_sha256': OLD_RECEIPT, 'recovery_ready_sha256': RECOVERY_READY,
            'public_ready_sha256': PUBLIC_READY,
            'context_ready_sha256': accepted[0][0]['ready_sha256'] if accepted else None}


def expected_assets(contract):
    need(type(contract.get('assets')) is dict and set(contract['assets']) == set(FILES), 'CONTINUATION_ASSETS')
    expected = {}
    for name, filename in FILES.items():
        pin = contract['assets'][name]
        need(type(pin) is dict and set(pin) == {'repoFile','sha256','bytes'} and pin['repoFile'] == filename
             and hex64(pin['sha256']) and type(pin['bytes']) is int and 0 < pin['bytes'] <= 131072,
             'CONTINUATION_ASSET_PIN')
        expected[name] = {key:pin[key] for key in ('sha256','bytes')}
    need(sum(pin['bytes'] for pin in expected.values()) <= 524288, 'CONTINUATION_ASSET_TOTAL')
    return expected, sha(encoded(expected))


def load_assets(context, contract, library):
    expected, asset_set = expected_assets(contract)
    assets, modules = {}, {}
    for name, filename in FILES.items():
        raw = fetch_asset(context['deployment_commit'], filename, expected[name], context['deadline'])
        need(len(raw) == expected[name]['bytes'] and sha(raw) == expected[name]['sha256'], 'CONTINUATION_ASSET_HASH')
        assets[name] = raw
        module = {'__name__':'qualified_context_continuation_'+name.replace('.','_'),
                  '__file__':'<qualified-'+filename+'>','__source_bytes__':raw}
        exec(compile(raw,module['__file__'],'exec'),module)
        modules[name] = module
    return assets, modules, expected, asset_set


def fetch_asset(commit, filename, pin, deadline):
    need(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit) and filename in FILES.values(),
         'CONTINUATION_ASSET_LOCATION')
    bounded(deadline)
    connection = http.client.HTTPSConnection('raw.githubusercontent.com', timeout=min(10,deadline-time.monotonic()))
    try:
        connection.request('GET','/ernisch/helmut-pilot/'+commit+'/scripts/'+filename,
                           headers={'Accept':'application/octet-stream'})
        response = connection.getresponse()
        need(response.status == 200, 'CONTINUATION_ASSET_HTTP_STATUS')
        raw = response.read(pin['bytes']+1)
        need(len(raw) == pin['bytes'] and sha(raw) == pin['sha256'], 'CONTINUATION_ASSET_BYTES')
        return raw
    finally: connection.close()

def lifecycle_check(proof, request, context, phase, value, guard, data, expected, library):
    need(type(proof) is dict and set(proof) == {'schema', 'nonce', 'phase', 'controller_source_sha256', 'job_sha256',
         'boot_id', 'unit', 'runtime_seconds', 'invocation_id', 'worker', 'sole_worker', 'pidfd_exited', 'unit_exit_code', 'result_sha256'}
         and proof['schema'] == 'helmut-context-daemon-binding-v2-service-lifecycle-v1' and proof['nonce'] == request['nonce']
         and proof['phase'] == phase and proof['controller_source_sha256'] == context['source_sha256']
         and proof['unit'] == guard['unit_name'](request['nonce']) and hex64(proof['job_sha256'])
         and type(proof['boot_id']) is str and re.fullmatch('[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}', proof['boot_id'])
         and type(proof['invocation_id']) is str and re.fullmatch('[a-f0-9]{32}', proof['invocation_id'])
         and type(proof['runtime_seconds']) is int and 0 < proof['runtime_seconds'] <= 295
         and proof['pidfd_exited'] is True and type(proof['unit_exit_code']) is int and proof['unit_exit_code'] == 0
         and proof['result_sha256'] == sha(encoded(value)), 'LIFECYCLE_PROOF')
    worker, sole = proof['worker'], proof['sole_worker']
    need(type(worker) is dict and set(worker) == {'pid', 'start_ticks', 'namespace'}
         and type(worker['pid']) is int and worker['pid'] > 1 and type(worker['start_ticks']) is int and worker['start_ticks'] > 0
         and type(worker['namespace']) is list and len(worker['namespace']) == 2
         and all(type(n) is int and n > 0 for n in worker['namespace'])
         and type(sole) is dict and set(sole) == {'cgroup', 'pids', 'worker'} and sole['worker'] == worker
         and sole['pids'] == [worker['pid']] and type(sole['pids'][0]) is int
         and sole['cgroup'] == '/system.slice/' + proof['unit'], 'LIFECYCLE_PROOF')
    root = library['directory'](jobs_root() + '/' + request['nonce'])
    try: raw = library['read_at'](root, 'JOB.PRIVATE.json')
    finally: os.close(root)
    job = parsed(raw)
    job_keys = {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
                'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets'}
    job_keys.add('job_namespace')
    job_schema = 'helmut-context-daemon-binding-v2-service-job-v1'
    need(sha(raw) == proof['job_sha256'] and type(job) is dict
         and set(job) == job_keys and job['schema'] == job_schema
         and job['job_namespace'] == NAMESPACE and job['request'] == request
         and job['controller_source_sha256'] == context['source_sha256'] and job['plan_sha256'] == PLAN
         and job['case_id'] == 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
         and job['phase'] == phase and job['phase_data'] == data and job['assets'] == expected
         and type(job['deadline']) in (int, float) and job['deadline'] == context['deadline']
         and type(job['runtime_seconds']) is int and job['runtime_seconds'] == proof['runtime_seconds']
         and job['boot_id'] == proof['boot_id'] and type(job['controller']) is dict
         and set(job['controller']) == {'pid', 'start_ticks', 'namespace'}
         and all(type(job['controller'][key]) is int and job['controller'][key] > 1 for key in ('pid', 'start_ticks'))
         and job['controller']['namespace'] == worker['namespace'], 'LIFECYCLE_JOB')

def contract_check(raw, context, reader):
    need(type(raw) is bytes and 0 < len(raw) <= 16384, 'CONTINUATION_CONTRACT_LIMIT')
    value = parsed(raw)
    keys = {'schema','contract_id','authorization_source','setup_authorized','base','case_id','plan_sha256',
        'scope_sha256','target_host','target_public_ip','server_sha256','coordinator_sha256','asset_set_sha256',
        'assets','metadata_reader','not_before_utc','not_after_utc','allowed_phases','native_qualified','native_go_consumed'}
    need(type(value) is dict and set(value) == keys and value['schema'] == 'helmut-context-continuation-contract-v1'
         and value['contract_id'] == NAMESPACE and value['authorization_source'] == 'operator-setup-request-20261026-working-test-environment'
         and value['setup_authorized'] is True and value['base'] == BASE and value['case_id'] == CASE
         and value['plan_sha256'] == PLAN and value['scope_sha256'] == SCOPE
         and value['target_host'] == '100.96.83.66' and value['target_public_ip'] == '2.28.77.245'
         and value['allowed_phases'] == list(PHASES) and value['native_qualified'] is False
         and value['native_go_consumed'] is False, 'CONTINUATION_CONTRACT')
    own = globals().get('__source_bytes__')
    need(type(own) is bytes and value['coordinator_sha256'] == sha(own)
         and value['server_sha256'] == context['source_sha256'] and hex64(value['server_sha256']), 'CONTINUATION_SOURCE')
    pin = value['metadata_reader']
    need(type(reader) is dict and type(reader.get('__source_bytes__')) is bytes
         and sha(reader['__source_bytes__']) == READER_SHA
         and pin == {'repoFile':'hetzner-native-runtime-metadata.py','sha256':READER_SHA,'bytes':len(reader['__source_bytes__'])},
         'CONTINUATION_READER_PIN')
    _, asset_set = expected_assets(value)
    need(value['asset_set_sha256'] == asset_set, 'CONTINUATION_ASSET_SET')
    now = time.time()
    need(type(value['not_before_utc']) is int and type(value['not_after_utc']) is int
         and 0 < value['not_before_utc'] < value['not_after_utc']
         and value['not_after_utc'] - value['not_before_utc'] <= 21600
         and value['not_before_utc'] <= now <= value['not_after_utc']
         and context['deadline'] - time.monotonic() <= value['not_after_utc'] - now, 'CONTINUATION_CONTRACT_TIME')
    return value


def retained_baseline(reader, qualified, deadline):
    config = reader['validate_config'](qualified)
    value = reader['verify_setup_baseline'](config, qualified, deadline)
    records = value['failure_diagnostic']['records']
    need(records['component_error']['sha256'] == '24124f28a62c92b0cc373f70e35b6926cf06f8df13f5fede02770a74a66fe33b'
         and records['job_error']['sha256'] == '97ddf7c9c97a700d90a3b4a419ba7125849ffa251c33a8655446a84d91909a18'
         and all(records[key]['state'] == 'ABSENT' for key in
                 ('component_attempt','component_receipt','component_receipt_pending')),
         'CONTINUATION_RETAINED_FAILURE')
    return value


def daemon_identity(module):
    value = module['observe']()
    need(type(value) is dict and set(value) == {'pid','start_ticks','namespace','pid1_namespace','socket','private'}
         and type(value['private']) is bool, 'CONTINUATION_DAEMON')
    return sha(encoded({key:item for key,item in value.items() if key != 'private'})[:-1])


def component_errors(driver):
    context = '/opt/helmut-native-test/docker28-context-20261026'
    case = context + '/native-context-daemon-binding-v2-' + CASE
    return (context + '/CONTEXT_DAEMON_BINDING_V2_FIRST_ERROR.PRIVATE.json',
        case + '/CONTEXT_RECEIPT.PENDING.SAFE.json',
        BASE + '/BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_FIRST_ERROR.PRIVATE.json',
        BASE + '/BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_RECEIPT.PENDING.SAFE.json')


def unused_components(driver, library):
    return all(library['path_absent'](path) for path in (
        driver['paths']()['context_once'], driver['paths']()['context_receipt'],
        driver['paths']()['image_receipt'], BASE + '/BUDGET_IMAGE_DAEMON_BINDING_V2_IMPORT_ATTEMPT.SAFE.json',
        '/opt/helmut-native-test/docker28-context-20261026/native-context-daemon-binding-v2-' + CASE,
        *component_errors(driver)))


def accepted_chain(root, context, asset_set, driver, library):
    rows, gap = [], False
    previous = driver['bindings'](driver['roles'](9))
    for index, phase in enumerate(PHASES):
        name = library['marker_name'](phase)
        if library['absent'](root, name): gap = True; continue
        need(not gap, 'CONTINUATION_ACCEPTED_GAP')
        raw = library['read_at'](root,name); marker = parsed(raw)
        need(type(marker) is dict and set(marker) == {'schema','phase','controller_source_sha256','asset_set_sha256',
            'nonce','ready_sha256','guard_result_sha256','lifecycle_sha256','bindings','native_qualified','native_go_consumed'}
            and marker['schema'] == 'helmut-context-continuation-accepted-v1' and marker['phase'] == phase
            and marker['controller_source_sha256'] == context['source_sha256'] and marker['asset_set_sha256'] == asset_set
            and all(hex64(marker[key]) for key in ('nonce','ready_sha256','guard_result_sha256','lifecycle_sha256'))
            and marker['native_qualified'] is False and marker['native_go_consumed'] is False, 'CONTINUATION_ACCEPTED')
        library['bindings_check'](marker['bindings'], COUNTS[index])
        value = {'status':library['SUCCESS'],'phase':phase,'ready_sha256':marker['ready_sha256'],
                 'native_qualified':False,'native_go_consumed':False,'bindings':marker['bindings']}
        need(marker['guard_result_sha256'] == sha(encoded(value))
             and driver['bindings'](tuple(marker['bindings'])) == marker['bindings']
             and driver['read'](driver['paths']()[PRIMARY[index]])[1]['sha256'] == marker['ready_sha256']
             and all(marker['bindings'].get(key) == row for key,row in previous.items()), 'CONTINUATION_ACCEPTED_BINDINGS')
        rows.append((marker,sha(raw))); previous = marker['bindings']
    return rows


def jobs_check(accepted, library, deadline):
    expected = {row['nonce'] for row,_ in accepted}
    need(len(expected) == len(accepted), 'CONTINUATION_JOB_NONCE')
    if library['path_absent'](jobs_root()): need(not expected, 'CONTINUATION_JOB_MISSING'); return
    root = library['directory'](jobs_root())
    try:
        before = library['metadata'](os.fstat(root)); names=[]
        with os.scandir(root) as entries:
            for entry in entries:
                bounded(deadline); names.append(entry.name); need(len(names) <= 2, 'CONTINUATION_UNACCEPTED_JOB')
        fresh = library['directory'](jobs_root())
        try:
            need(set(names) == expected and stat.S_IMODE(os.fstat(root).st_mode) == 0o700
                 and before == library['metadata'](os.fstat(root)) == library['metadata'](os.fstat(fresh)),
                 'CONTINUATION_UNACCEPTED_JOB')
        finally: os.close(fresh)
    finally: os.close(root)


def verify_job_seals(accepted, context, assets, expected, asset_set, authority_sha, contract_sha, guard, library, deadline):
    for index,(marker,_) in enumerate(accepted):
        raw,_ = read_bound(STATE_ROOT,seal_name(marker['phase']),library,deadline,16384)
        seal = parsed(raw)
        need(type(seal) is dict and type(seal.get('lifecycle_proof')) is dict, 'CONTINUATION_SEAL')
        proof = seal['lifecycle_proof']
        value = {'status':library['SUCCESS'],'phase':marker['phase'],'ready_sha256':marker['ready_sha256'],
                 'native_qualified':False,'native_go_consumed':False,'bindings':marker['bindings']}
        need(sha(encoded(proof)) == marker['lifecycle_sha256'] and proof.get('result_sha256') == marker['guard_result_sha256'],
             'CONTINUATION_SEAL_LIFECYCLE')
        snapshot = job_evidence(marker['nonce'],marker['phase'],proof,value,data_for(accepted[:index]),context,
                                assets,expected,guard,library,deadline)
        need(raw == encoded(seal_value(marker['nonce'],marker['phase'],proof,snapshot,context,asset_set,authority_sha,contract_sha)),
             'CONTINUATION_SEAL_CHANGED')


def saved_inspection(capsule, context, contract_sha, asset_set, library, deadline):
    raw,binding = read_bound(BASE+'/results',capsule['inspection_nonce']+'.json',library,deadline)
    value = parsed(raw)
    need(type(value) is dict and set(value) == {'schema','operation','nonce','plan_sha256','payload_sha256','result','result_sha256'}
         and raw == encoded(value) and value['schema'] == 'helmut-native-control-response-v1' and value['operation'] == 'status'
         and value['nonce'] == capsule['inspection_nonce'] and value['plan_sha256'] == PLAN
         and value['payload_sha256'] == context['source_sha256'], 'CONTINUATION_INSPECTION_RESPONSE')
    report = value['result']
    need(type(report) is dict and set(report) == INSPECTION_KEYS
         and report['schema'] == 'helmut-context-continuation-inspection-v1' and report['status'] == 'INSPECTED_NOT_ADMITTED'
         and report['contract_id'] == NAMESPACE and report['request_nonce'] == value['nonce']
         and report['source_sha256'] == context['source_sha256'] and report['contract_sha256'] == contract_sha
         and report['asset_set_sha256'] == asset_set and report['coordinator_sha256'] == sha(globals()['__source_bytes__'])
         and report['native_qualified'] is False and report['native_go_consumed'] is False
         and type(report['observed_at_utc']) is int, 'CONTINUATION_INSPECTION')
    capsule_check(report['capsule'],context,contract_sha)
    need(report['capsule']['action'] == 'inspect' and sha(PREFIX+encoded(report['capsule'])) == value['nonce']
         and report['capsule']['issued_at_utc'] <= report['observed_at_utc'] <= report['capsule']['expires_at_utc']
         and value['result_sha256'] == capsule['inspection_result_sha256'] == sha(encoded(report)[:-1]), 'CONTINUATION_INSPECTION_BINDING')
    return report,binding


def authority_value(nonce, capsule, context, contract_sha, asset_set, report, binding):
    return {'schema':'helmut-context-continuation-authority-v1','contract_id':NAMESPACE,
        'authorization_source':'operator-setup-request-20261026-working-test-environment',
        'source_sha256':context['source_sha256'],'deployment_commit':context['deployment_commit'],
        'contract_sha256':contract_sha,'asset_set_sha256':asset_set,'coordinator_sha256':sha(globals()['__source_bytes__']),
        'admitted_by_nonce':nonce,'inspection_nonce':capsule['inspection_nonce'],
        'inspection_result_sha256':capsule['inspection_result_sha256'],'inspection_binding':binding,
        'old_baseline_sha256':report['old_baseline_sha256'],'daemon_identity_sha256':report['daemon_identity_sha256'],
        'native_qualified':False,'native_go_consumed':False}


def attempt_value(phase,nonce,authority_sha,contract_sha):
    return {'schema':'helmut-context-continuation-attempt-v1','contract_id':NAMESPACE,'phase':phase,'nonce':nonce,
        'authority_sha256':authority_sha,'contract_sha256':contract_sha,'state':'CONSUMED_BEFORE_COMPONENT_NO_RETRY'}


def fail_result(phase,code,contract_sha=None):
    return {'schema':'helmut-context-continuation-result-v1','status':'FAIL_KEEP_STATE_NO_RETRY',
        'contract_id':NAMESPACE,'contract_sha256':contract_sha,'phase':phase,'code':code,
        'authority_sha256':None,'attempt_sha256':None,'ready_sha256':None,'accepted_sha256':None,'lifecycle_sha256':None,
        'native_qualified':False,'native_go_consumed':False}
def coordinate_continuation(request, context, capsule, contract_raw, reader, qualified):
    lock = base = root = None
    phase, contract_sha, began = 'preflight', None, False
    library = qualified.get('library', {})
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'CONTINUATION_ROOT_REQUIRED')
        need(type(context) is dict and set(context) == {'base','source_sha256','deployment_commit','deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}',context['deployment_commit']),
             'CONTINUATION_CONTEXT')
        deadline = context['deadline']; bounded(deadline)
        contract = contract_check(contract_raw,context,reader); contract_sha = sha(contract_raw)
        capsule_check(capsule,context,contract_sha,int(time.time()))
        need(type(request) is dict and set(request) == {'schema','operation','nonce','plan_sha256','payload_sha256'}
             and request['schema'] == 'helmut-native-control-request-v1'
             and request['operation'] == ('status' if capsule['action'] == 'inspect' else 'admit')
             and request['plan_sha256'] == PLAN and request['payload_sha256'] == context['source_sha256']
             and request['nonce'] == sha(PREFIX+encoded(capsule)), 'CONTINUATION_REQUEST')
        base = library['directory'](BASE)
        need(stat.S_IMODE(os.fstat(base).st_mode) == 0o700, 'CONTINUATION_BASE_MODE')
        lock = os.open(library['LOCK'],R,dir_fd=base); info = os.fstat(lock)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and info.st_size == 0 and stat.S_IMODE(info.st_mode) == 0o600, 'CONTINUATION_LOCK')
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise Stop('CONTINUATION_BUSY') from None
        lock_binding = library['metadata'](info)
        old = retained_baseline(reader,qualified,deadline)
        assets, modules, expected, asset_set = load_assets(context,contract,library)
        guard, driver, ctx = (modules[key] for key in ('guard.py','driver.py','context.py'))
        need(asset_set == contract['asset_set_sha256'], 'CONTINUATION_ASSET_SET')
        inherited = qualified['driver.py']['bindings'](qualified['driver.py']['roles'](9))
        need(driver['bindings'](driver['roles'](9)) == inherited, 'CONTINUATION_INHERITED_BINDINGS')
        identity = daemon_identity(ctx)
        authority_path, once_path = BASE+'/'+AUTHORITY, BASE+'/once/'+ONCE
        partial = (authority_path+'.PENDING',once_path+'.PENDING')
        need(all(library['path_absent'](path) for path in partial), 'CONTINUATION_AUTHORITY_PARTIAL')
        if capsule['action'] == 'inspect':
            need(all(library['path_absent'](path) for path in (authority_path,once_path,STATE_ROOT))
                 and unused_components(driver,library), 'CONTINUATION_ALREADY_ATTEMPTED')
            preflight = ctx['inspect_preflight'](RECOVERY_READY,recovery=OLD_RECEIPT,public=PUBLIC_READY)
            need(type(preflight) is dict and preflight.get('native_qualified') is False
                 and preflight.get('native_go_consumed') is False and hex64(preflight.get('source_proof_sha256'))
                 and preflight.get('daemon_binding_sha256') == identity, 'CONTINUATION_PREFLIGHT')
            need(retained_baseline(reader,qualified,deadline) == old and daemon_identity(ctx) == identity
                 and unused_components(driver,library), 'CONTINUATION_INSPECTION_DRIFT')
            capsule_check(capsule,context,contract_sha,int(time.time()))
            return {'schema':'helmut-context-continuation-inspection-v1','status':'INSPECTED_NOT_ADMITTED',
                'contract_id':NAMESPACE,'request_nonce':request['nonce'],'capsule':capsule,
                'source_sha256':context['source_sha256'],'contract_sha256':contract_sha,'asset_set_sha256':asset_set,
                'coordinator_sha256':sha(globals()['__source_bytes__']),'old_baseline_sha256':old['baseline_sha256'],
                'partial_setup_proof':old['partial_setup_proof'],'failure_diagnostic':old['failure_diagnostic'],
                'daemon_identity_sha256':identity,'preflight':preflight,'observed_at_utc':int(time.time()),
                'native_qualified':False,'native_go_consumed':False}
        phase = capsule['phase']
        report, inspection_binding = saved_inspection(capsule,context,contract_sha,asset_set,library,deadline)
        need(report['old_baseline_sha256'] == old['baseline_sha256']
             and report['partial_setup_proof'] == old['partial_setup_proof']
             and report['failure_diagnostic'] == old['failure_diagnostic']
             and report['daemon_identity_sha256'] == identity, 'CONTINUATION_INSPECTION_DRIFT')
        fresh = library['path_absent'](authority_path)
        if fresh:
            need(phase == 'context' and library['path_absent'](once_path) and library['path_absent'](STATE_ROOT)
                 and unused_components(driver,library)
                 and 0 <= int(time.time())-report['observed_at_utc'] <= 300, 'CONTINUATION_AUTHORITY_MISSING_OR_SPENT')
            need(ctx['inspect_preflight'](RECOVERY_READY,recovery=OLD_RECEIPT,public=PUBLIC_READY) == report['preflight'],
                 'CONTINUATION_PREFLIGHT_CHANGED')
            authority = authority_value(request['nonce'],capsule,context,contract_sha,asset_set,report,inspection_binding)
            accepted = []
        else:
            raw,authority_binding = read_bound(BASE,AUTHORITY,library,deadline,16384)
            authority = parsed(raw)
            need(type(authority) is dict and hex64(authority.get('admitted_by_nonce'))
                 and raw == encoded(authority_value(authority['admitted_by_nonce'],capsule,context,
                    contract_sha,asset_set,report,inspection_binding)), 'CONTINUATION_AUTHORITY_CHANGED')
            root = library['directory'](STATE_ROOT)
            accepted = accepted_chain(root,context,asset_set,driver,library)
            need(accepted and accepted[0][0]['nonce'] == authority['admitted_by_nonce'], 'CONTINUATION_AUTHORITY_ATTEMPT')
        authority_sha = sha(encoded(authority))
        once = {'schema':'helmut-context-continuation-once-v1','contract_id':NAMESPACE,
                'authority_sha256':authority_sha,'state':'ADMITTED_CONTEXT_IMAGE_ONLY_NO_REARM'}
        if not fresh:
            once_raw,once_binding = read_bound(BASE+'/once',ONCE,library,deadline,16384)
            need(once_raw == encoded(once), 'CONTINUATION_ONCE_CHANGED')
            state_check(root,library,accepted,authority_sha,contract_sha,deadline)
            jobs_check(accepted,library,deadline)
            verify_job_seals(accepted,context,assets,expected,asset_set,authority_sha,contract_sha,guard,library,deadline)
        need(len(accepted) < 2 and phase == PHASES[len(accepted)], 'CONTINUATION_PHASE_ORDER')
        need(all(library['path_absent'](path) for path in component_errors(driver)), 'CONTINUATION_COMPONENT_PARTIAL')
        previous = accepted[-1][0]['bindings'] if accepted else driver['bindings'](driver['roles'](9))
        prior = {}
        for marker,_ in accepted:
            for name in (library['marker_name'](marker['phase']),'ATTEMPT_'+marker['phase'].upper()+'.PRIVATE.json',seal_name(marker['phase'])):
                prior[name] = read_bound(STATE_ROOT,name,library,deadline,16384)
        data = data_for(accepted)
        need(retained_baseline(reader,qualified,deadline) == old and daemon_identity(ctx) == identity
             and saved_inspection(capsule,context,contract_sha,asset_set,library,deadline) == (report,inspection_binding)
             and lock_binding == library['metadata'](os.fstat(lock))
             == library['metadata'](os.stat(library['LOCK'],dir_fd=base,follow_symlinks=False)), 'CONTINUATION_PRE_EFFECT_DRIFT')
        capsule_check(capsule,context,contract_sha,int(time.time()))
        if fresh:
            os.mkdir(NAMESPACE,0o700,dir_fd=base); os.fsync(base); began=True
            root = library['directory'](STATE_ROOT)
            library['publish'](base,AUTHORITY,authority)
            once_root = library['directory'](BASE+'/once')
            try: library['publish'](once_root,ONCE,once)
            finally: os.close(once_root)
            authority_raw,authority_binding = read_bound(BASE,AUTHORITY,library,deadline,16384)
            once_raw,once_binding = read_bound(BASE+'/once',ONCE,library,deadline,16384)
            need(authority_raw == encoded(authority) and once_raw == encoded(once), 'CONTINUATION_AUTHORITY_READBACK')
        began=True
        attempt = attempt_value(phase,request['nonce'],authority_sha,contract_sha)
        attempt_name = 'ATTEMPT_'+phase.upper()+'.PRIVATE.json'
        attempt_sha = library['publish'](root,attempt_name,attempt)
        attempt_raw,attempt_binding = read_bound(STATE_ROOT,attempt_name,library,deadline,16384)
        need(attempt_raw == encoded(attempt) and attempt_sha == sha(attempt_raw), 'CONTINUATION_ATTEMPT_READBACK')
        def preserved():
            need(contract['not_before_utc'] <= time.time() <= contract['not_after_utc']
                 and retained_baseline(reader,qualified,deadline) == old and daemon_identity(ctx) == identity
                 and driver['bindings'](driver['roles'](9)) == inherited
                 == qualified['driver.py']['bindings'](qualified['driver.py']['roles'](9))
                 and read_bound(BASE,AUTHORITY,library,deadline,16384) == (encoded(authority),authority_binding)
                 and read_bound(BASE+'/once',ONCE,library,deadline,16384) == (encoded(once),once_binding)
                 and read_bound(STATE_ROOT,attempt_name,library,deadline,16384) == (attempt_raw,attempt_binding)
                 and saved_inspection(capsule,context,contract_sha,asset_set,library,deadline) == (report,inspection_binding)
                 and all(read_bound(STATE_ROOT,name,library,deadline,16384) == value for name,value in prior.items()),
                 'CONTINUATION_BINDINGS_CHANGED')
            verify_job_seals(accepted,context,assets,expected,asset_set,authority_sha,contract_sha,guard,library,deadline)
        preserved(); capsule_check(capsule,context,contract_sha,int(time.time())); jobs_check(accepted,library,deadline)
        output = guard['run_setup_phase'](request,{key:context[key] for key in ('base','source_sha256','deadline')} |
                    {'job_namespace':NAMESPACE},phase,assets,expected,data)
        preserved()
        if type(output) is dict and output.get('status') == 'FAIL_KEEP_STATE_NO_RETRY':
            raise Stop(output['code'] if type(output.get('code')) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}',output['code'])
                       else 'CONTINUATION_GUARD_FAILED')
        need(type(output) is dict and set(output) == {'status','phase','ready_sha256','native_qualified','native_go_consumed','bindings','lifecycle_proof'},
             'CONTINUATION_GUARD_RESULT')
        value = {key:item for key,item in output.items() if key != 'lifecycle_proof'}
        guard['result_check'](value,phase); library['bindings_check'](value['bindings'],COUNTS[len(accepted)])
        snapshot = job_evidence(request['nonce'],phase,output['lifecycle_proof'],value,data,context,assets,expected,guard,library,deadline,current=True)
        need(all(value['bindings'].get(key) == item for key,item in previous.items())
             and driver['bindings'](tuple(value['bindings'])) == value['bindings']
             and driver['read'](driver['paths']()[PRIMARY[len(accepted)]])[1]['sha256'] == value['ready_sha256']
             and all(library['path_absent'](path) for path in component_errors(driver)), 'CONTINUATION_FINAL_BINDINGS')
        preserved()
        lifecycle_sha = sha(encoded(output['lifecycle_proof']))
        marker = {'schema':'helmut-context-continuation-accepted-v1','phase':phase,
            'controller_source_sha256':context['source_sha256'],'asset_set_sha256':asset_set,'nonce':request['nonce'],
            'ready_sha256':value['ready_sha256'],'guard_result_sha256':sha(encoded(value)),
            'lifecycle_sha256':lifecycle_sha,'bindings':value['bindings'],'native_qualified':False,'native_go_consumed':False}
        seal = seal_value(request['nonce'],phase,output['lifecycle_proof'],snapshot,context,asset_set,authority_sha,contract_sha)
        seal_sha = library['publish'](root,seal_name(phase),seal)
        seal_raw,seal_binding = read_bound(STATE_ROOT,seal_name(phase),library,deadline,16384)
        need(seal_raw == encoded(seal) and seal_sha == sha(seal_raw), 'CONTINUATION_SEAL_READBACK')
        candidate = accepted+[(marker,sha(encoded(marker)))]
        verify_job_seals(candidate,context,assets,expected,asset_set,authority_sha,contract_sha,guard,library,deadline)
        jobs_check(candidate,library,deadline)
        accepted_sha = library['publish'](root,library['marker_name'](phase),marker)
        final = accepted_chain(root,context,asset_set,driver,library)
        need(final == accepted+[(marker,accepted_sha)], 'CONTINUATION_ACCEPTED_READBACK')
        state_check(root,library,final,authority_sha,contract_sha,deadline); jobs_check(final,library,deadline)
        verify_job_seals(final,context,assets,expected,asset_set,authority_sha,contract_sha,guard,library,deadline)
        need(read_bound(STATE_ROOT,seal_name(phase),library,deadline,16384) == (seal_raw,seal_binding), 'CONTINUATION_SEAL_CHANGED')
        preserved()
        return {'schema':'helmut-context-continuation-result-v1','status':library['SUCCESS'],'contract_id':NAMESPACE,
            'contract_sha256':contract_sha,'phase':phase,'code':'SETUP_PHASE_COMPLETE','authority_sha256':authority_sha,
            'attempt_sha256':attempt_sha,'ready_sha256':value['ready_sha256'],'accepted_sha256':accepted_sha,
            'lifecycle_sha256':lifecycle_sha,'native_qualified':False,'native_go_consumed':False}
    except BaseException as error:
        result = fail_result(phase,safe_code(error),contract_sha)
        if began and root is not None:
            try: library['publish'](root,ERROR,result)
            except BaseException: pass
        return result
    finally:
        for fd in (root,lock,base):
            if fd is not None: os.close(fd)


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_QUALIFIED_CONTROLLER_ONLY"}')
    raise SystemExit(2)
