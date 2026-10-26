#!/usr/bin/env python3
"""Fixed working/test setup successor. Inert without qualified caller and contract."""
import fcntl
import hashlib
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
NAMESPACE = 'setup-successor-unit-properties-v1'
STATE_ROOT = BASE + '/' + NAMESPACE
AUTHORITY = 'SETUP_SUCCESSOR_UNIT_PROPERTIES_AUTHORITY.PRIVATE.json'
ONCE = NAMESPACE + '.json'
ERROR = 'FIRST_ERROR.PRIVATE.json'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
PHASES = ('recover', 'checkout', 'context', 'image')
CAP = 262144
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
PREFIX = b'helmut-setup-successor-request-v1\0'
CAPSULE_KEYS = {'schema', 'contract_id', 'action', 'phase', 'source_sha256', 'contract_sha256',
    'nonce', 'inspection_nonce', 'inspection_result_sha256', 'issued_at_utc', 'expires_at_utc'}
INSPECTION_KEYS = {'schema', 'status', 'request_nonce', 'capsule', 'source_sha256', 'asset_set_sha256',
    'contract_sha256', 'coordinator_sha256', 'runtime', 'history', 'gzip', 'observed_at_utc',
    'native_qualified', 'native_go_consumed'}


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
            need(key not in value, 'SUCCESSOR_DUPLICATE_JSON')
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: need(False, 'SUCCESSOR_JSON_CONSTANT'))


def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'SUCCESSOR_DEADLINE')


def metadata_check(value):
    need(type(value) is list and len(value) == 12
         and all(type(n) is int and -(2**63) <= n < 2**64 for n in value), 'SUCCESSOR_METADATA')


def capsule_check(capsule, context, contract_sha, now=None):
    need(type(capsule) is dict and set(capsule) == CAPSULE_KEYS
         and capsule['schema'] == 'helmut-setup-successor-capsule-v1'
         and capsule['contract_id'] == NAMESPACE and capsule['action'] in ('inspect', 'setup')
         and capsule['source_sha256'] == context['source_sha256']
         and capsule['contract_sha256'] == contract_sha and hex64(capsule['nonce']), 'SUCCESSOR_CAPSULE')
    need(type(capsule['issued_at_utc']) is int and type(capsule['expires_at_utc']) is int
         and 0 < capsule['issued_at_utc'] < capsule['expires_at_utc']
         and capsule['expires_at_utc'] - capsule['issued_at_utc'] <= 300, 'SUCCESSOR_CAPSULE_TIME')
    if now is not None:
        need(capsule['issued_at_utc'] <= now <= capsule['expires_at_utc'], 'SUCCESSOR_CAPSULE_TIME')
    if capsule['action'] == 'inspect':
        need(capsule['phase'] is None and capsule['inspection_nonce'] is None
             and capsule['inspection_result_sha256'] is None, 'SUCCESSOR_CAPSULE')
    else:
        need(capsule['phase'] in PHASES and hex64(capsule['inspection_nonce'])
             and hex64(capsule['inspection_result_sha256']), 'SUCCESSOR_CAPSULE')


def contract_check(raw, context, library, preflight):
    need(type(raw) is bytes and 0 < len(raw) <= 16384, 'SUCCESSOR_CONTRACT_LIMIT')
    contract = parsed(raw.decode('ascii'))
    keys = {'schema', 'contract_id', 'authorization_source', 'setup_authorized', 'base', 'case_id',
        'plan_sha256', 'scope_sha256', 'target_host', 'target_public_ip', 'server_sha256',
        'coordinator_sha256', 'asset_set_sha256', 'library', 'preflight', 'not_before_utc',
        'not_after_utc', 'allowed_phases', 'native_qualified', 'native_go_consumed'}
    need(type(contract) is dict and set(contract) == keys
         and contract['schema'] == 'helmut-setup-successor-contract-v1'
         and contract['contract_id'] == NAMESPACE
         and contract['authorization_source'] == 'operator-setup-request-20261026-working-test-environment'
         and contract['setup_authorized'] is True and contract['base'] == BASE
         and contract['case_id'] == CASE and contract['plan_sha256'] == PLAN
         and contract['scope_sha256'] == SCOPE and contract['target_host'] == '100.96.83.66'
         and contract['target_public_ip'] == '2.28.77.245'
         and contract['allowed_phases'] == list(PHASES)
         and contract['native_qualified'] is False and contract['native_go_consumed'] is False,
         'SUCCESSOR_CONTRACT')
    own = globals().get('__source_bytes__')
    need(type(own) is bytes and contract['coordinator_sha256'] == sha(own)
         and hex64(contract['server_sha256']) and contract['server_sha256'] == context['source_sha256']
         and hex64(contract['asset_set_sha256']), 'SUCCESSOR_SOURCE')
    for key, module, filename in (('library', library, 'hetzner-native-setup-coordinator.py'),
            ('preflight', preflight, 'hetzner-native-setup-successor-preflight.py')):
        pin = contract[key]
        need(type(module) is dict and type(module.get('__source_bytes__')) is bytes
             and type(pin) is dict and set(pin) == {'repoFile', 'sha256', 'bytes'}
             and pin['repoFile'] == filename and type(pin['bytes']) is int
             and 0 < pin['bytes'] <= 131072 and pin['bytes'] == len(module['__source_bytes__'])
             and pin['sha256'] == sha(module['__source_bytes__']), 'SUCCESSOR_LIBRARY_PIN')
    now = int(time.time())
    need(type(contract['not_before_utc']) is int and type(contract['not_after_utc']) is int
         and 0 < contract['not_before_utc'] < contract['not_after_utc']
         and contract['not_after_utc'] - contract['not_before_utc'] <= 21600
         and contract['not_before_utc'] <= now <= contract['not_after_utc'], 'SUCCESSOR_CONTRACT_TIME')
    need(context['deadline'] - time.monotonic() <= contract['not_after_utc'] - time.time(),
         'SUCCESSOR_CONTRACT_TIME')
    expected, asset_set = library['asset_pins']()
    need(asset_set == contract['asset_set_sha256'], 'SUCCESSOR_ASSET_SET')
    return contract, expected, asset_set


def read_bound(path, name, library, deadline, cap=CAP, mode=0o600):
    bounded(deadline)
    root, fresh, fd = library['directory'](path), None, None
    try:
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd)
        before = library['metadata'](info)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= cap, 'SUCCESSOR_FILE_IDENTITY')
        raw = bytearray()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, cap + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            need(len(raw) <= cap, 'SUCCESSOR_FILE_LIMIT')
        fresh = library['directory'](path)
        need(len(raw) == info.st_size and before == library['metadata'](os.fstat(fd))
             == library['metadata'](os.stat(name, dir_fd=root, follow_symlinks=False))
             == library['metadata'](os.stat(name, dir_fd=fresh, follow_symlinks=False))
             and (os.fstat(root).st_dev, os.fstat(root).st_ino)
             == (os.fstat(fresh).st_dev, os.fstat(fresh).st_ino), 'SUCCESSOR_FILE_CHANGED')
        raw = bytes(raw)
        return raw, {'sha256': sha(raw), 'metadata': before}
    finally:
        for fd in (fd, fresh, root):
            if fd is not None: os.close(fd)


def stat_process(raw, pid):
    text = raw.decode('ascii')
    tail = text.rsplit(')', 1)[1].split()
    need(text.startswith(str(pid) + ' (') and len(tail) > 19 and tail[19].isdigit()
         and tail[0] in ('R', 'S', 'D', 'Z', 'T', 't', 'X', 'x', 'K', 'W', 'P', 'I'), 'SUCCESSOR_PROCESS_FORMAT')
    return tail[0], int(tail[19])


def require_controller_ended(job, guard):
    old = job['controller']
    path = '/proc/' + str(old['pid']) + '/stat'
    try: raw = guard['kernel_read'](path, 16384)
    except FileNotFoundError: return
    state, start = stat_process(raw, old['pid'])
    if start != old['start_ticks']: return
    need(state in ('Z', 'X', 'x'), 'SUCCESSOR_OLD_CONTROLLER_ALIVE')
    fd = os.pidfd_open(old['pid'], 0)
    try:
        need(guard['exited'](fd) and stat_process(guard['kernel_read'](path, 16384), old['pid'])
             == (state, start), 'SUCCESSOR_OLD_CONTROLLER_UNKNOWN')
    finally: os.close(fd)


def mount_identity(guard):
    namespace = os.stat('/proc/self/ns/mnt')
    lines = guard['kernel_read']('/proc/self/mountinfo', 65536).decode('ascii').splitlines()
    matches = []
    for line in lines:
        left, sep, right = line.partition(' - ')
        parts, tail = left.split(), right.split()
        need(sep and len(parts) >= 6 and len(tail) >= 3, 'SUCCESSOR_MOUNT_FORMAT')
        if parts[4] == '/sys/fs/cgroup': matches.append((parts, tail))
    need(len(matches) == 1, 'SUCCESSOR_CGROUP_MOUNT')
    parts, tail = matches[0]
    need(parts[0].isdigit() and parts[1].isdigit() and re.fullmatch('[0-9]+:[0-9]+', parts[2])
         and parts[3] == '/' and tail[0] == 'cgroup2', 'SUCCESSOR_CGROUP_MOUNT')
    root = guard['directory']('/sys/fs/cgroup')
    parent = guard['directory']('/sys/fs/cgroup/system.slice')
    try:
        cg, system = os.fstat(root), os.fstat(parent)
        need(cg.st_dev == system.st_dev
             and [os.major(cg.st_dev), os.minor(cg.st_dev)] == list(map(int, parts[2].split(':'))),
             'SUCCESSOR_CGROUP_MOUNT')
        mount = [int(parts[0]), int(parts[1]), *map(int, parts[2].split(':')),
                 cg.st_dev, cg.st_ino, system.st_dev, system.st_ino]
        return mount, [namespace.st_dev, namespace.st_ino]
    finally:
        os.close(parent); os.close(root)


def old_cgroup_empty(name, guard, metadata):
    parent = guard['directory']('/sys/fs/cgroup/system.slice')
    try:
        before = metadata(os.fstat(parent))
        try: info = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            need(before == metadata(os.fstat(parent)), 'SUCCESSOR_CGROUP_CHANGED')
            try: os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError: return {'state': 'ABSENT', 'identity': None}
            raise Stop('SUCCESSOR_CGROUP_CHANGED')
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and not stat.S_IMODE(info.st_mode) & 0o022, 'SUCCESSOR_CGROUP_IDENTITY')
        group = '/system.slice/' + name
        need(guard['cgroup_pids'](group) == [] and metadata(info)
             == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False))
             and guard['cgroup_pids'](group) == [], 'SUCCESSOR_OLD_CGROUP_ACTIVE')
        return {'state': 'EMPTY', 'identity': metadata(info)}
    finally: os.close(parent)


def runtime_snapshot(history, guard, library, deadline):
    bounded(deadline)
    job = history['job']
    boot = guard['boot_id']()
    need(boot == job['boot_id'], 'SUCCESSOR_OLD_BOOT_CHANGED')
    mount, namespace = mount_identity(guard)
    need(namespace == job['controller']['namespace'], 'SUCCESSOR_NAMESPACE_CHANGED')
    require_controller_ended(job, guard)
    name = guard['unit_name'](job['request']['nonce'])
    fields = guard['unit_fields'](name, deadline)
    required = {'Id': name, 'Transient': 'yes', 'Type': 'exec', 'MainPID': '0', 'ControlPID': '0',
        'KillMode': 'control-group', 'Restart': 'no', 'RemainAfterExit': 'yes', 'User': 'root', 'Group': 'root',
        'UMask': '0077', 'StandardOutput': 'null', 'StandardError': 'null', 'Delegate': 'no',
        'SendSIGKILL': 'yes', 'KillSignal': '15', 'FinalKillSignal': '9', 'TimeoutStopFailureMode': 'kill',
        'ExecMainCode': '1', 'ExecMainStatus': '1', 'Result': 'exit-code'}
    need(all(fields[key] == value for key, value in required.items())
         and fields['ActiveState'] in ('failed', 'inactive') and fields['SubState'] in ('failed', 'dead')
         and fields['ControlGroup'] in ('', '/system.slice/' + name), 'SUCCESSOR_OLD_UNIT_STATE')
    start = '{ path=/usr/bin/env ; argv[]=' + ' '.join(guard['worker_argv'](job['request']['nonce'])) + ' ; ignore_errors=no ;'
    need(fields['ExecStart'].startswith(start) and fields['ExecStart'].count('{') == fields['ExecStart'].count('}') == 1
         and guard['duration'](fields['RuntimeMaxUSec']) == job['runtime_seconds']
         and guard['duration'](fields['TimeoutStopUSec']) == 5
         and re.fullmatch('[a-f0-9]{32}', fields['InvocationID'])
         and fields['ExecMainPID'].isdigit() and int(fields['ExecMainPID']) > 1
         and fields['ExecMainStartTimestampMonotonic'].isdigit()
         and fields['ExecMainExitTimestampMonotonic'].isdigit()
         and 0 < int(fields['ExecMainStartTimestampMonotonic']) <= int(fields['ExecMainExitTimestampMonotonic']),
         'SUCCESSOR_OLD_UNIT_BINDING')
    guard['unit_hooks'](name, deadline)
    cgroup = old_cgroup_empty(name, guard, library['metadata'])
    need(guard['unit_fields'](name, deadline) == fields, 'SUCCESSOR_OLD_UNIT_CHANGED')
    require_controller_ended(job, guard)
    need(guard['boot_id']() == boot and mount_identity(guard) == (mount, namespace), 'SUCCESSOR_RUNTIME_CHANGED')
    bounded(deadline)
    return {'boot_id': boot, 'mount_identity': mount, 'namespace_identity': namespace,
        'old_unit': {'fields_sha256': sha(encoded(fields)), 'invocation_id': fields['InvocationID'],
                     'main_pid': int(fields['ExecMainPID']), 'cgroup': cgroup},
        'old_controller_ended': True}


def gzip_snapshot(recovery, deadline):
    raw, digest, metadata = recovery['read'](recovery['INPUT'], recovery['GZIP_SIZE'], deadline, digest_only=True)
    metadata = list(metadata)
    metadata_check(metadata)
    need(raw is None and digest == recovery['GZIP_SHA'] and metadata[6] == recovery['GZIP_SIZE'], 'SUCCESSOR_GZIP')
    return {'sha256': digest, 'bytes': recovery['GZIP_SIZE'], 'metadata': metadata}


def inspection(request, context, capsule, contract_sha, asset_set, history, runtime, gzip, preflight):
    return {'schema': 'helmut-setup-successor-inspection-v1', 'status': 'INSPECTED_NOT_ADMITTED',
        'request_nonce': request['nonce'], 'capsule': capsule, 'source_sha256': context['source_sha256'],
        'asset_set_sha256': asset_set, 'contract_sha256': contract_sha,
        'coordinator_sha256': sha(globals()['__source_bytes__']), 'runtime': runtime,
        'history': preflight['history_summary'](history), 'gzip': gzip, 'observed_at_utc': int(time.time()),
        'native_qualified': False, 'native_go_consumed': False}


def saved_inspection(capsule, context, contract_sha, asset_set, library, deadline):
    name = capsule['inspection_nonce'] + '.json'
    raw, binding = read_bound(BASE + '/results', name, library, deadline)
    value = parsed(raw.decode('ascii'))
    need(type(value) is dict and set(value) == {'schema', 'operation', 'nonce', 'plan_sha256',
        'payload_sha256', 'result', 'result_sha256'} and encoded(value) == raw
        and value['schema'] == 'helmut-native-control-response-v1' and value['operation'] == 'status'
        and value['nonce'] == capsule['inspection_nonce'] and value['plan_sha256'] == PLAN
        and value['payload_sha256'] == context['source_sha256'], 'SUCCESSOR_INSPECTION_RESPONSE')
    result = value['result']
    need(type(result) is dict and set(result) == INSPECTION_KEYS
         and result['schema'] == 'helmut-setup-successor-inspection-v1'
         and result['status'] == 'INSPECTED_NOT_ADMITTED' and result['request_nonce'] == value['nonce']
         and result['source_sha256'] == context['source_sha256'] and result['contract_sha256'] == contract_sha
         and result['asset_set_sha256'] == asset_set and result['coordinator_sha256'] == sha(globals()['__source_bytes__'])
         and result['native_qualified'] is False and result['native_go_consumed'] is False
         and type(result['observed_at_utc']) is int, 'SUCCESSOR_INSPECTION')
    capsule_check(result['capsule'], context, contract_sha)
    need(result['capsule']['action'] == 'inspect' and sha(PREFIX + encoded(result['capsule'])) == value['nonce']
         and result['capsule']['issued_at_utc'] <= result['observed_at_utc'] <= result['capsule']['expires_at_utc']
         and value['result_sha256'] == capsule['inspection_result_sha256'] == sha(encoded(result)[:-1]),
         'SUCCESSOR_INSPECTION_BINDING')
    return result, binding


def authority_value(request_nonce, capsule, context, contract_sha, asset_set, report, binding):
    return {'schema': 'helmut-setup-successor-authority-v1', 'contract_id': NAMESPACE,
        'authorization_source': 'operator-setup-request-20261026-working-test-environment',
        'source_sha256': context['source_sha256'], 'contract_sha256': contract_sha,
        'deployment_commit': context['deployment_commit'],
        'asset_set_sha256': asset_set, 'coordinator_sha256': sha(globals()['__source_bytes__']),
        'admitted_by_nonce': request_nonce, 'inspection_nonce': capsule['inspection_nonce'],
        'inspection_result_sha256': capsule['inspection_result_sha256'], 'inspection_binding': binding,
        'runtime': report['runtime'], 'history': report['history'], 'gzip': report['gzip'],
        'native_qualified': False, 'native_go_consumed': False}


def attempt_value(phase, nonce, authority_sha, contract_sha):
    return {'schema': 'helmut-setup-successor-attempt-v1', 'contract_id': NAMESPACE, 'phase': phase,
        'nonce': nonce, 'authority_sha256': authority_sha, 'contract_sha256': contract_sha,
        'state': 'CONSUMED_BEFORE_COMPONENT_NO_RETRY'}


def seal_name(phase):
    need(phase in PHASES, 'SUCCESSOR_SEAL_PHASE')
    return 'JOB_SEAL_' + phase.upper() + '.PRIVATE.json'


def job_snapshot(nonce, assets, expected, library, deadline):
    """Read every physical success artifact; never treat an absent job as empty."""
    need(hex64(nonce) and type(assets) is dict and type(expected) is dict
         and set(assets) == set(expected) == {'guard.py', 'driver.py', 'recovery.py', 'restore.py',
                                           'public.py', 'context.py', 'image.py'}, 'SUCCESSOR_JOB_ASSETS')
    names = set(assets) | {'JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'ACK.PRIVATE.json', 'RESULT.PRIVATE.json'}
    path = STATE_ROOT + '/jobs/' + nonce
    root, fresh = library['directory'](path), None
    try:
        info = os.fstat(root)
        before = library['metadata'](info)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and stat.S_IMODE(info.st_mode) == 0o700, 'SUCCESSOR_JOB_DIRECTORY')
        def members(fd):
            found = []
            with os.scandir(fd) as entries:
                for entry in entries:
                    bounded(deadline)
                    found.append(entry.name)
                    need(len(found) <= 11, 'SUCCESSOR_JOB_FILES')
            need(set(found) == names, 'SUCCESSOR_JOB_FILES')
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
                     and sha(raw[name]) == pin['sha256'], 'SUCCESSOR_JOB_ASSET_CHANGED')
        fresh = library['directory'](path)
        members(root); members(fresh)
        need(before == library['metadata'](os.fstat(root)) == library['metadata'](os.fstat(fresh)),
             'SUCCESSOR_JOB_DIRECTORY_CHANGED')
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
         and (not current or job['deadline'] == context['deadline']), 'SUCCESSOR_SEALED_JOB_TIME')
    request = {'schema': 'helmut-native-control-request-v1', 'operation': 'admit', 'nonce': nonce,
               'plan_sha256': PLAN, 'payload_sha256': context['source_sha256']}
    guard['result_check'](value, phase)
    # A historic finished job has no current run authority. This library check
    # validates its closed stored schema/proof against its original deadline;
    # never call guard.job_check(), which applies a live monotonic deadline.
    library['lifecycle_check'](proof, request, {**context, 'deadline': job['deadline']}, phase, value,
                               guard, data, expected, job_namespace=NAMESPACE)
    need(type(proof) is dict and raw['RESULT.PRIVATE.json'] == encoded(value)
         and sha(raw['JOB.PRIVATE.json']) == proof['job_sha256']
         and sha(raw['RESULT.PRIVATE.json']) == proof['result_sha256'], 'SUCCESSOR_JOB_RESULT_BINDING')
    arm = {'schema': 'helmut-setup-service-arm-v1', 'nonce': nonce,
           'job_sha256': proof['job_sha256'], 'controller_source_sha256': context['source_sha256'],
           'worker': proof['worker']}
    ack = {'schema': 'helmut-setup-service-ack-v1', 'nonce': nonce,
           'job_sha256': proof['job_sha256'], 'result_sha256': proof['result_sha256'], 'worker': proof['worker']}
    need(raw['ARM.PRIVATE.json'] == encoded(arm) and raw['ACK.PRIVATE.json'] == encoded(ack),
         'SUCCESSOR_JOB_HANDSHAKE')
    return snapshot


def seal_value(nonce, phase, proof, snapshot, context, asset_set, authority_sha, contract_sha):
    return {'schema': 'helmut-setup-successor-job-seal-v1', 'contract_id': NAMESPACE,
        'phase': phase, 'nonce': nonce, 'source_sha256': context['source_sha256'],
        'asset_set_sha256': asset_set, 'authority_sha256': authority_sha, 'contract_sha256': contract_sha,
        'guard_result_sha256': proof['result_sha256'], 'lifecycle_sha256': sha(encoded(proof)),
        'lifecycle_proof': proof, 'job_directory': snapshot['directory'], 'files': snapshot['files']}


def verify_job_seals(accepted, context, assets, expected, asset_set, authority_sha, contract_sha,
                     guard, library, deadline):
    """Accepted alone is insufficient: every sealed physical job must still exist."""
    for index, (marker, _) in enumerate(accepted):
        phase, nonce = marker['phase'], marker['nonce']
        raw, _ = read_bound(STATE_ROOT, seal_name(phase), library, deadline, 16384)
        seal = parsed(raw)
        need(type(seal) is dict and type(seal.get('lifecycle_proof')) is dict, 'SUCCESSOR_JOB_SEAL')
        value = {'status': library['SUCCESS'], 'phase': phase, 'ready_sha256': marker['ready_sha256'],
                 'native_qualified': False, 'native_go_consumed': False, 'bindings': marker['bindings']}
        data = dict(zip(('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256'),
            [library['EXPECTED_OLD_RECEIPT']] + [row[0]['ready_sha256'] for row in accepted[:index]]
            + [None] * (3 - index)))
        proof = seal['lifecycle_proof']
        need(sha(encoded(proof)) == marker['lifecycle_sha256']
             and proof.get('result_sha256') == marker['guard_result_sha256'], 'SUCCESSOR_JOB_SEAL_LIFECYCLE')
        snapshot = job_evidence(nonce, phase, proof, value, data, context, assets, expected,
                                guard, library, deadline)
        need(seal == seal_value(nonce, phase, proof, snapshot, context, asset_set, authority_sha, contract_sha)
             and raw == encoded(seal), 'SUCCESSOR_JOB_SEAL_CHANGED')


def state_check(root, library, accepted, authority_sha, contract_sha, deadline):
    need(library['absent'](root, ERROR) and library['absent'](root, ERROR + '.PENDING'), 'SUCCESSOR_PREVIOUS_FAILURE')
    allowed = ({'jobs'} | {library['marker_name'](p) for p in PHASES}
               | {'ATTEMPT_' + p.upper() + '.PRIVATE.json' for p in PHASES} | {seal_name(p) for p in PHASES})
    names = []
    with os.scandir(root) as entries:
        for entry in entries:
            names.append(entry.name)
            need(len(names) <= len(allowed), 'SUCCESSOR_STATE_UNKNOWN')
    need(set(names) <= allowed, 'SUCCESSOR_STATE_UNKNOWN')
    for index, phase in enumerate(PHASES):
        name = 'ATTEMPT_' + phase.upper() + '.PRIVATE.json'
        if index < len(accepted):
            raw, _ = read_bound(STATE_ROOT, name, library, deadline, 16384)
            need(parsed(raw) == attempt_value(phase, accepted[index][0]['nonce'], authority_sha, contract_sha),
                 'SUCCESSOR_ATTEMPT_CHANGED')
            need(not library['absent'](root, seal_name(phase)), 'SUCCESSOR_JOB_SEAL_MISSING')
        else:
            need(library['absent'](root, name) and library['absent'](root, seal_name(phase)),
                 'SUCCESSOR_UNACCEPTED_ATTEMPT')


def fail_result(phase, code, contract_sha=None):
    return {'schema': 'helmut-setup-successor-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'contract_id': NAMESPACE, 'contract_sha256': contract_sha, 'phase': phase, 'code': code,
        'authority_sha256': None, 'attempt_sha256': None, 'ready_sha256': None,
        'accepted_sha256': None, 'lifecycle_sha256': None, 'native_qualified': False, 'native_go_consumed': False}


def safe_code(error):
    code = getattr(error, 'code', None)
    if code is None and type(error).__name__ in ('Stop', 'SetupError') and len(error.args) == 1:
        code = error.args[0]
    return code if type(code) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) else 'SUCCESSOR_IO_OR_FORMAT'


def coordinate_successor(request, context, capsule, contract_raw, library, preflight):
    lock = base = root = None
    phase, contract_sha, history, began = 'preflight', None, None, False
    failure_contract = capsule.get('contract_sha256') if type(capsule) is dict else None
    if not hex64(failure_contract): failure_contract = None
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'SUCCESSOR_ROOT_REQUIRED')
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']),
             'SUCCESSOR_CONTEXT')
        deadline = context['deadline']; bounded(deadline)
        contract, expected, asset_set = contract_check(contract_raw, context, library, preflight)
        contract_sha = sha(contract_raw)
        capsule_check(capsule, context, contract_sha, int(time.time()))
        need(type(request) is dict and set(request) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256'}
             and request['schema'] == 'helmut-native-control-request-v1'
             and request['operation'] == ('status' if capsule['action'] == 'inspect' else 'admit')
             and request['plan_sha256'] == PLAN and request['payload_sha256'] == context['source_sha256']
             and request['nonce'] == sha(PREFIX + encoded(capsule)), 'SUCCESSOR_REQUEST')
        base = library['directory'](BASE)
        need(stat.S_IMODE(os.fstat(base).st_mode) == 0o700, 'SUCCESSOR_BASE_MODE')
        lock = os.open(library['LOCK'], R, dir_fd=base)
        info = os.fstat(lock)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and info.st_size == 0 and stat.S_IMODE(info.st_mode) == 0o600, 'SUCCESSOR_LOCK_IDENTITY')
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise Stop('SUCCESSOR_BUSY') from None
        lock_binding = library['metadata'](info)
        assets, modules = library['load_assets'](context, expected)
        guard, driver = modules['guard.py'], modules['driver.py']
        history = preflight['collect_history'](deadline)
        runtime = runtime_snapshot(history, guard, library, deadline)
        gzip = gzip_snapshot(modules['recovery.py'], deadline)
        need(preflight['verify_history_unchanged'](history, deadline) is True, 'SUCCESSOR_HISTORY_CHANGED')
        if capsule['action'] == 'inspect':
            need(preflight['require_unused_components'](deadline) is True, 'SUCCESSOR_COMPONENTS')
            need(all(library['path_absent'](p) for p in (BASE + '/' + AUTHORITY, BASE + '/' + AUTHORITY + '.PENDING',
                BASE + '/once/' + ONCE, BASE + '/once/' + ONCE + '.PENDING', STATE_ROOT)), 'SUCCESSOR_ALREADY_ADMITTED')
            need(runtime_snapshot(history, guard, library, deadline) == runtime
                 and preflight['verify_history_unchanged'](history, deadline) is True, 'SUCCESSOR_RUNTIME_CHANGED')
            capsule_check(capsule, context, contract_sha, int(time.time()))
            report = inspection(request, context, capsule, contract_sha, asset_set, history, runtime, gzip, preflight)
            need(capsule['issued_at_utc'] <= report['observed_at_utc'] <= capsule['expires_at_utc'],
                 'SUCCESSOR_CAPSULE_TIME')
            return report

        phase = capsule['phase']
        report, inspection_binding = saved_inspection(capsule, context, contract_sha, asset_set, library, deadline)
        need(report['runtime'] == runtime and report['history'] == preflight['history_summary'](history)
             and report['gzip'] == gzip, 'SUCCESSOR_INSPECTION_DRIFT')
        authority_path, once_path = BASE + '/' + AUTHORITY, BASE + '/once/' + ONCE
        fresh = library['path_absent'](authority_path)
        need(all(library['path_absent'](p) for p in (authority_path + '.PENDING', once_path + '.PENDING')),
             'SUCCESSOR_AUTHORITY_PARTIAL')
        if fresh:
            need(phase == 'recover' and library['path_absent'](once_path) and library['path_absent'](STATE_ROOT),
                 'SUCCESSOR_AUTHORITY_MISSING_OR_SPENT')
            need(0 <= int(time.time()) - report['observed_at_utc'] <= 300, 'SUCCESSOR_INSPECTION_STALE')
            need(preflight['require_unused_components'](deadline) is True, 'SUCCESSOR_COMPONENTS')
            authority = authority_value(request['nonce'], capsule, context, contract_sha, asset_set, report, inspection_binding)
        else:
            raw, authority_binding = read_bound(BASE, AUTHORITY, library, deadline, 16384)
            authority = parsed(raw)
            need(type(authority) is dict and hex64(authority.get('admitted_by_nonce'))
                 and authority == authority_value(authority['admitted_by_nonce'], capsule, context,
                    contract_sha, asset_set, report, inspection_binding) and encoded(authority) == raw,
                 'SUCCESSOR_AUTHORITY_CHANGED')
        authority_sha = sha(encoded(authority))
        once = {'schema': 'helmut-setup-successor-once-v1', 'contract_id': NAMESPACE,
                'authority_sha256': authority_sha, 'state': 'ADMITTED_FIXED_FOUR_PHASES_NO_REARM'}
        if not fresh:
            once_raw, once_binding = read_bound(BASE + '/once', ONCE, library, deadline, 16384)
            need(once_raw == encoded(once), 'SUCCESSOR_ONCE_CHANGED')
            root = library['directory'](STATE_ROOT)
            accepted = library['accepted_chain'](root, context, asset_set, driver)
            library['guard_jobs_check'](accepted, job_namespace=NAMESPACE)
            state_check(root, library, accepted, authority_sha, contract_sha, deadline)
            verify_job_seals(accepted, context, assets, expected, asset_set, authority_sha, contract_sha,
                             guard, library, deadline)
            need(accepted and accepted[0][0]['nonce'] == authority['admitted_by_nonce'], 'SUCCESSOR_AUTHORITY_ATTEMPT')
        else:
            accepted = []
        need(len(accepted) < 4 and phase == PHASES[len(accepted)], 'SUCCESSOR_PHASE_ORDER')
        previous = accepted[-1][0]['bindings'] if accepted else driver['bindings'](library['ROLES'][:3])
        prior_files = {}
        for row, _ in accepted:
            for name in (library['marker_name'](row['phase']), 'ATTEMPT_' + row['phase'].upper() + '.PRIVATE.json',
                         seal_name(row['phase'])):
                prior_files[name] = read_bound(STATE_ROOT, name, library, deadline, 16384)
        data = dict(zip(('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256'),
            [library['EXPECTED_OLD_RECEIPT']] + [row[0]['ready_sha256'] for row in accepted] + [None] * (3 - len(accepted))))
        need(runtime_snapshot(history, guard, library, deadline) == runtime
             and preflight['verify_history_unchanged'](history, deadline) is True
             and saved_inspection(capsule, context, contract_sha, asset_set, library, deadline) == (report, inspection_binding)
             and lock_binding == library['metadata'](os.fstat(lock))
             == library['metadata'](os.stat(library['LOCK'], dir_fd=base, follow_symlinks=False)), 'SUCCESSOR_PRE_EFFECT_DRIFT')
        capsule_check(capsule, context, contract_sha, int(time.time()))
        if fresh:
            os.mkdir(NAMESPACE, 0o700, dir_fd=base); os.fsync(base)
            root = library['directory'](STATE_ROOT)
            began = True
            library['publish'](base, AUTHORITY, authority)
            once_root = library['directory'](BASE + '/once')
            try: library['publish'](once_root, ONCE, once)
            finally: os.close(once_root)
            authority_raw, authority_binding = read_bound(BASE, AUTHORITY, library, deadline, 16384)
            once_raw, once_binding = read_bound(BASE + '/once', ONCE, library, deadline, 16384)
            need(authority_raw == encoded(authority) and once_raw == encoded(once), 'SUCCESSOR_AUTHORITY_READBACK')
        need(stat.S_IMODE(os.fstat(root).st_mode) == 0o700, 'SUCCESSOR_STATE_MODE')
        began = True
        attempt = attempt_value(phase, request['nonce'], authority_sha, contract_sha)
        attempt_name = 'ATTEMPT_' + phase.upper() + '.PRIVATE.json'
        attempt_sha = library['publish'](root, attempt_name, attempt)
        attempt_raw, attempt_binding = read_bound(STATE_ROOT, attempt_name, library, deadline, 16384)
        need(attempt_raw == encoded(attempt) and attempt_sha == sha(attempt_raw), 'SUCCESSOR_ATTEMPT_READBACK')
        def preserved():
            need(contract['not_before_utc'] <= time.time() <= contract['not_after_utc']
                 and preflight['verify_history_unchanged'](history, deadline) is True
                 and runtime_snapshot(history, guard, library, deadline) == runtime
                 and read_bound(BASE, AUTHORITY, library, deadline, 16384) == (encoded(authority), authority_binding)
                 and read_bound(BASE + '/once', ONCE, library, deadline, 16384) == (encoded(once), once_binding)
                 and read_bound(STATE_ROOT, attempt_name, library, deadline, 16384) == (attempt_raw, attempt_binding)
                 and saved_inspection(capsule, context, contract_sha, asset_set, library, deadline)
                 == (report, inspection_binding)
                 and all(read_bound(STATE_ROOT, name, library, deadline, 16384) == binding
                         for name, binding in prior_files.items()), 'SUCCESSOR_BINDINGS_CHANGED')
            verify_job_seals(accepted, context, assets, expected, asset_set, authority_sha, contract_sha,
                             guard, library, deadline)
        preserved()
        capsule_check(capsule, context, contract_sha, int(time.time()))
        library['guard_jobs_check'](accepted, job_namespace=NAMESPACE)
        output = guard['run_setup_phase'](request,
            {key: context[key] for key in ('base', 'source_sha256', 'deadline')} | {'job_namespace': NAMESPACE},
            phase, assets, expected, data)
        preserved()
        if type(output) is dict and output.get('status') == 'FAIL_KEEP_STATE_NO_RETRY':
            raise Stop(output['code'] if type(output.get('code')) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', output['code'])
                       else 'SUCCESSOR_GUARD_FAILED')
        need(type(output) is dict and set(output) == {'status', 'phase', 'ready_sha256', 'native_qualified',
            'native_go_consumed', 'bindings', 'lifecycle_proof'}, 'SUCCESSOR_GUARD_RESULT')
        value = {key: item for key, item in output.items() if key != 'lifecycle_proof'}
        guard['result_check'](value, phase)
        library['bindings_check'](value['bindings'], library['COUNTS'][len(accepted)])
        snapshot = job_evidence(request['nonce'], phase, output['lifecycle_proof'], value, data, context,
                                assets, expected, guard, library, deadline, current=True)
        need(all(value['bindings'].get(role) == row for role, row in previous.items()), 'SUCCESSOR_PREVIOUS_BINDINGS_CHANGED')
        need(driver['bindings'](tuple(value['bindings'])) == value['bindings']
             and driver['read'](driver['paths']()[library['PRIMARY'][len(accepted)]])[1]['sha256'] == value['ready_sha256'],
             'SUCCESSOR_FINAL_BINDINGS_CHANGED')
        need(all(library['path_absent'](path) for row in library['component_paths'](driver)[1] for path in row),
             'SUCCESSOR_COMPONENT_UNKNOWN')
        preserved()
        lifecycle_sha = sha(encoded(output['lifecycle_proof']))
        marker = {'schema': 'helmut-target-setup-accepted-v1', 'phase': phase,
            'controller_source_sha256': context['source_sha256'], 'asset_set_sha256': asset_set,
            'nonce': request['nonce'], 'ready_sha256': value['ready_sha256'], 'guard_result_sha256': sha(encoded(value)),
            'lifecycle_sha256': lifecycle_sha, 'bindings': value['bindings'],
            'native_qualified': False, 'native_go_consumed': False}
        seal = seal_value(request['nonce'], phase, output['lifecycle_proof'], snapshot, context,
                          asset_set, authority_sha, contract_sha)
        seal_sha = library['publish'](root, seal_name(phase), seal)
        seal_raw, seal_binding = read_bound(STATE_ROOT, seal_name(phase), library, deadline, 16384)
        need(seal_raw == encoded(seal) and seal_sha == sha(seal_raw), 'SUCCESSOR_JOB_SEAL_READBACK')
        candidate = accepted + [(marker, sha(encoded(marker)))]
        verify_job_seals(candidate, context, assets, expected, asset_set, authority_sha, contract_sha,
                         guard, library, deadline)
        library['guard_jobs_check'](candidate, job_namespace=NAMESPACE)
        accepted_sha = library['publish'](root, library['marker_name'](phase), marker)
        final = library['accepted_chain'](root, context, asset_set, driver)
        library['guard_jobs_check'](final, job_namespace=NAMESPACE)
        need(final == accepted + [(marker, accepted_sha)], 'SUCCESSOR_ACCEPTED_READBACK')
        state_check(root, library, final, authority_sha, contract_sha, deadline)
        verify_job_seals(final, context, assets, expected, asset_set, authority_sha, contract_sha,
                         guard, library, deadline)
        need(read_bound(STATE_ROOT, seal_name(phase), library, deadline, 16384) == (seal_raw, seal_binding),
             'SUCCESSOR_JOB_SEAL_CHANGED')
        preserved()
        return {'schema': 'helmut-setup-successor-result-v1', 'status': 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED',
            'contract_id': NAMESPACE, 'contract_sha256': contract_sha, 'phase': phase, 'code': 'SETUP_PHASE_COMPLETE',
            'authority_sha256': authority_sha, 'attempt_sha256': attempt_sha, 'ready_sha256': value['ready_sha256'],
            'accepted_sha256': accepted_sha, 'lifecycle_sha256': lifecycle_sha,
            'native_qualified': False, 'native_go_consumed': False}
    except BaseException as error:
        code = safe_code(error)
        if began and history is not None:
            try:
                need(preflight['verify_history_unchanged'](history, context['deadline']) is True, 'SUCCESSOR_HISTORY_CHANGED')
            except BaseException: code = 'SUCCESSOR_HISTORY_CHANGED'
        failure = fail_result(phase, code, failure_contract)
        if began and root is not None:
            try: library['publish'](root, ERROR, failure)
            except BaseException: pass
        return failure
    finally:
        for fd in (root, lock, base):
            if fd is not None: os.close(fd)


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
