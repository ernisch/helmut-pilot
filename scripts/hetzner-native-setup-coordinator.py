#!/usr/bin/env python3
"""One source-bound, service-guarded setup phase; never native execution authority."""
import ctypes
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
CONTEXT = '/opt/helmut-native-test/docker28-context-20261026'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
EXPECTED_OLD_RECEIPT = '160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be'
PHASES = ('recover', 'checkout', 'context', 'image')
ROLES = ('historical_binding', 'historical_error', 'historical_receipt', 'recovery_once',
         'recovery_ready', 'recovery_receipt', 'public_once', 'public_ready', 'public_repository',
         'context_once', 'context_receipt', 'image_receipt')
COUNTS = (6, 9, 11, 12)
PRIMARY = ('recovery_ready', 'public_ready', 'context_receipt', 'image_receipt')
SUCCESS = 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED'
LOCK = 'TARGET_SETUP_LOCK.PRIVATE'
ERROR = 'TARGET_SETUP_FIRST_ERROR.SAFE.json'
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
D = R | os.O_DIRECTORY
FILES = {'guard.py': 'hetzner-native-setup-service.py', 'driver.py': 'hetzner-native-setup-driver.py',
    'recovery.py': 'hetzner-native-local-restore-recovery.py', 'restore.py': 'hetzner-native-stage-restore.py',
    'public.py': 'hetzner-native-public-checkout.py', 'context.py': 'hetzner-native-context.py',
    'image.py': 'hetzner-native-budget-image-import.py'}
# Exact independently qualified public sources at the CI-verified deployment commit.
ASSET_MAP = {'guard.py': {'repoFile': 'hetzner-native-setup-service.py',
              'sha256': 'eea7e8eca1d439b7fa2cfa6387de527fdcdc829ed7b502e5fcfab926577cd3f2',
              'bytes': 35236},
 'driver.py': {'repoFile': 'hetzner-native-setup-driver.py',
               'sha256': 'e2bb2bb06ef259ba7be5814f7a7535a265988d62470a85fc7c3e26cbe158d14f',
               'bytes': 11824},
 'recovery.py': {'repoFile': 'hetzner-native-local-restore-recovery.py',
                 'sha256': '5f0f430bf557ca0e8f103cd1e6b06e25703a2604826e1f2bb39c222609198eb1',
                 'bytes': 15031},
 'restore.py': {'repoFile': 'hetzner-native-stage-restore.py',
                'sha256': 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88',
                'bytes': 22910},
 'public.py': {'repoFile': 'hetzner-native-public-checkout.py',
               'sha256': '1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb',
               'bytes': 15871},
 'context.py': {'repoFile': 'hetzner-native-context.py',
                'sha256': '1ee9b47014bb0227cb385dd248990980c0083dcca167d88838590fbbe538cfa9',
                'bytes': 43560},
 'image.py': {'repoFile': 'hetzner-native-budget-image-import.py',
              'sha256': 'd355adfcd0a0a87cc1306170b5b8c0601bf9e8d9661af53609eb381dad4c337a',
              'bytes': 14311}}


class SetupError(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise SetupError(code)


def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None
def sha(raw): return hashlib.sha256(raw).hexdigest()
def encoded(value): return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
def metadata(info):
    return [getattr(info, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink',
        'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def parsed(raw):
    def unique(rows):
        result = {}
        for key, value in rows:
            need(key not in result, 'DUPLICATE_JSON'); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: need(False, 'JSON_CONSTANT'))


def directory(path):
    need(type(path) is str and path.startswith('/') and all(x not in ('', '.', '..') for x in path.split('/')[1:]), 'DIRECTORY_PATH')
    fd = os.open('/', D)
    try:
        for part in path.split('/')[1:]:
            child = os.open(part, D, dir_fd=fd); os.close(fd); fd = child
            info = os.fstat(fd)
            need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and not info.st_mode & 0o022, 'DIRECTORY_IDENTITY')
        return fd
    except BaseException: os.close(fd); raise


def absent(root, name):
    try: os.stat(name, dir_fd=root, follow_symlinks=False)
    except FileNotFoundError: return True
    return False


def read_at(root, name):
    parent_before = metadata(os.fstat(root))
    fd = os.open(name, R, dir_fd=root)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1
             and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= 16384, 'MARKER_IDENTITY')
        raw = bytearray()
        while block := os.read(fd, 16385 - len(raw)):
            raw.extend(block); need(len(raw) <= 16384, 'MARKER_LIMIT')
        need(len(raw) == before.st_size and metadata(before) == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             and parent_before == metadata(os.fstat(root)), 'MARKER_CHANGED')
        return bytes(raw)
    finally: os.close(fd)


def publish(root, name, value):
    raw, pending = encoded(value), name + '.PENDING'
    need(len(raw) <= 16384, 'MARKER_LIMIT')
    fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root)
    try:
        at = 0
        while at < len(raw):
            count = os.write(fd, raw[at:]); need(count > 0, 'MARKER_WRITE'); at += count
        os.fsync(fd)
    finally: os.close(fd)
    need(read_at(root, pending) == raw, 'MARKER_READBACK')
    function = ctypes.CDLL(None, use_errno=True).renameat2
    function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    function.restype = ctypes.c_int
    need(function(root, pending.encode(), root, name.encode(), 1) == 0, 'MARKER_PUBLICATION')
    os.fsync(root)
    need(read_at(root, name) == raw, 'MARKER_READBACK')
    return sha(raw)


def asset_pins():
    need(type(ASSET_MAP) is dict and set(ASSET_MAP) == set(FILES), 'ASSETS_UNQUALIFIED')
    total, expected = 0, {}
    for alias, filename in FILES.items():
        row = ASSET_MAP[alias]
        need(type(row) is dict and set(row) == {'repoFile', 'sha256', 'bytes'} and row['repoFile'] == filename
             and hex64(row['sha256']) and type(row['bytes']) is int and 0 < row['bytes'] <= 131072, 'ASSETS_UNQUALIFIED')
        total += row['bytes']; expected[alias] = {'sha256': row['sha256'], 'bytes': row['bytes']}
    need(total <= 256 * 1024, 'ASSET_TOTAL')
    return expected, sha(encoded(ASSET_MAP))


def fetch_asset(commit, filename, pin, deadline):
    need(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit) and filename in FILES.values(), 'ASSET_LOCATION')
    remaining = deadline - time.monotonic(); need(remaining > 0, 'DEADLINE')
    connection = http.client.HTTPSConnection('raw.githubusercontent.com', timeout=min(10, remaining))
    try:
        connection.request('GET', '/ernisch/helmut-pilot/' + commit + '/scripts/' + filename,
                           headers={'Accept': 'application/octet-stream'})
        response = connection.getresponse()
        need(response.status == 200, 'ASSET_HTTP_STATUS')
        raw = response.read(pin['bytes'] + 1)
        need(len(raw) == pin['bytes'] and sha(raw) == pin['sha256'], 'ASSET_BYTES')
        return raw
    finally: connection.close()


def load_assets(context, expected):
    assets, modules = {}, {}
    for alias, filename in FILES.items():
        raw = fetch_asset(context['deployment_commit'], filename, expected[alias], context['deadline'])
        assets[alias] = raw
        namespace = {'__name__': 'helmut_qualified_setup_' + alias[:-3], '__file__': filename, '__source_bytes__': raw}
        exec(compile(raw, filename, 'exec'), namespace); modules[alias] = namespace
    return assets, modules


def marker_name(phase): return 'SETUP_' + phase.upper() + '_ACCEPTED.SAFE.json'


def bindings_check(rows, count):
    need(type(rows) is dict and set(rows) == set(ROLES[:count]), 'BINDINGS')
    for role, row in rows.items():
        need(type(row) is dict and set(row) == {'sha256', 'metadata'}
             and (row['sha256'] is None if role == 'public_repository' else hex64(row['sha256']))
             and type(row['metadata']) is list and len(row['metadata']) == 12
             and all(type(n) is int and -(2**63) <= n < 2**64 for n in row['metadata']), 'BINDINGS')


def component_paths(driver):
    p = driver['paths']()
    bad = ((BASE + '/RESTORE_PAX_RECOVERY_FIRST_ERROR.SAFE.json', BASE + '/RESTORE_PAX_RECOVERY_READY.PENDING.SAFE.json'),
        (BASE + '/PUBLIC_CODE_PR942_FIRST_ERROR.PRIVATE.json', BASE + '/PUBLIC_CODE_PR942_RECEIPT.PENDING.SAFE.json'),
        (CONTEXT + '/NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json', p['context_receipt'].rsplit('/', 1)[0] + '/CONTEXT_RECEIPT.PENDING.SAFE.json'),
        (BASE + '/BUDGET_IMAGE_IMPORT_FIRST_ERROR.PRIVATE.json', BASE + '/BUDGET_IMAGE_IMPORT_RECEIPT.PENDING.SAFE.json'))
    unfinished = ((p['recovery_once'], p['recovery_ready'], p['recovery_receipt'].rsplit('/', 1)[0]),
        (p['public_once'], p['public_ready'], p['public_repository']),
        (p['context_once'], p['context_receipt'].rsplit('/', 1)[0]),
        (BASE + '/BUDGET_IMAGE_IMPORT_ATTEMPT.SAFE.json', p['image_receipt']))
    return p, bad, unfinished


def path_absent(path):
    parent, name = path.rsplit('/', 1)
    # A missing ancestor is absence; symlinks and untrusted existing ancestors fail.
    try: root = directory(parent)
    except FileNotFoundError: return True
    try: return absent(root, name)
    finally: os.close(root)


def accepted_chain(root, context, asset_set, driver):
    accepted, hole = [], False
    p, bad, unfinished = component_paths(driver)
    for index, phase in enumerate(PHASES):
        name = marker_name(phase)
        need(absent(root, name + '.PENDING'), 'ACCEPTED_PARTIAL')
        need(all(path_absent(path) for path in bad[index]), 'COMPONENT_UNKNOWN')
        if absent(root, name):
            hole = True
            need(all(path_absent(path) for path in unfinished[index]), 'COMPONENT_UNKNOWN')
            continue
        need(not hole, 'ACCEPTED_ORDER')
        raw = read_at(root, name); value = parsed(raw)
        need(type(value) is dict and set(value) == {'schema', 'phase', 'controller_source_sha256', 'asset_set_sha256',
             'nonce', 'ready_sha256', 'guard_result_sha256', 'lifecycle_sha256', 'bindings', 'native_qualified', 'native_go_consumed'}
             and value['schema'] == 'helmut-target-setup-accepted-v1' and value['phase'] == phase
             and value['native_qualified'] is False and value['native_go_consumed'] is False
             and all(hex64(value[key]) for key in ('nonce', 'ready_sha256', 'guard_result_sha256', 'lifecycle_sha256')), 'ACCEPTED_MARKER')
        need(value['controller_source_sha256'] == context['source_sha256'] and value['asset_set_sha256'] == asset_set, 'ACCEPTED_SOURCE')
        need(value['nonce'] not in [row[0]['nonce'] for row in accepted], 'ACCEPTED_ORDER')
        bindings_check(value['bindings'], COUNTS[index])
        original = {'status': SUCCESS, 'phase': phase, 'ready_sha256': value['ready_sha256'],
                    'native_qualified': False, 'native_go_consumed': False, 'bindings': value['bindings']}
        need(value['guard_result_sha256'] == sha(encoded(original)), 'ACCEPTED_MARKER')
        need(driver['bindings'](tuple(value['bindings'])) == value['bindings']
             and driver['read'](p[PRIMARY[index]])[1]['sha256'] == value['ready_sha256'], 'ACCEPTED_BINDINGS_CHANGED')
        accepted.append((value, sha(raw)))
    return accepted


def lifecycle_check(proof, request, context, phase, value, guard, data, expected):
    need(type(proof) is dict and set(proof) == {'schema', 'nonce', 'phase', 'controller_source_sha256', 'job_sha256',
         'boot_id', 'unit', 'runtime_seconds', 'invocation_id', 'worker', 'sole_worker', 'pidfd_exited', 'unit_exit_code', 'result_sha256'}
         and proof['schema'] == 'helmut-setup-service-lifecycle-v1' and proof['nonce'] == request['nonce']
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
    root = directory(BASE + '/setup-jobs/' + request['nonce'])
    try: raw = read_at(root, 'JOB.PRIVATE.json')
    finally: os.close(root)
    job = parsed(raw)
    need(sha(raw) == proof['job_sha256'] and type(job) is dict
         and set(job) == {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
                         'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets'}
         and job['schema'] == 'helmut-setup-service-job-v1' and job['request'] == request
         and job['controller_source_sha256'] == context['source_sha256'] and job['plan_sha256'] == PLAN
         and job['case_id'] == 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
         and job['phase'] == phase and job['phase_data'] == data and job['assets'] == expected
         and type(job['deadline']) in (int, float) and job['deadline'] == context['deadline']
         and type(job['runtime_seconds']) is int and job['runtime_seconds'] == proof['runtime_seconds']
         and job['boot_id'] == proof['boot_id'] and type(job['controller']) is dict
         and set(job['controller']) == {'pid', 'start_ticks', 'namespace'}
         and all(type(job['controller'][key]) is int and job['controller'][key] > 1 for key in ('pid', 'start_ticks'))
         and job['controller']['namespace'] == worker['namespace'], 'LIFECYCLE_JOB')


def guard_jobs_check(accepted):
    try: root = directory(BASE + '/setup-jobs')
    except FileNotFoundError: return
    try:
        names = []
        with os.scandir(root) as entries:
            for entry in entries:
                names.append(entry.name); need(len(names) <= 4, 'UNACCEPTED_JOB')
        need(stat.S_IMODE(os.fstat(root).st_mode) == 0o700
             and set(names) <= {row[0]['nonce'] for row in accepted}, 'UNACCEPTED_JOB')
    finally: os.close(root)


def result(status, phase, code, ready=None, accepted=None, lifecycle=None):
    return {'schema': 'helmut-target-setup-result-v1', 'status': status, 'phase': phase, 'code': code,
        'ready_sha256': ready, 'accepted_sha256': accepted, 'lifecycle_sha256': lifecycle,
        'native_qualified': False, 'native_go_consumed': False}


def safe_code(error, modules):
    code = error.code if type(error) is SetupError else None
    for alias, name in (('driver.py', 'SetupError'), ('guard.py', 'Stop')):
        namespace = modules.get(alias, {})
        known = namespace.get(name)
        if isinstance(known, type) and type(error) is known:
            code = getattr(error, 'code', None)
            if code is None and alias == 'guard.py' and len(error.args) == 1:
                code = error.args[0]
    return code if type(code) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) else 'SETUP_COORDINATOR_FAILURE'


def coordinate_setup(request, context):
    root = lock = None
    modules = {}
    owned, began, phase = False, False, 'preflight'
    try:
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit'])
             and type(context['deadline']) in (int, float) and math.isfinite(context['deadline'])
             and 0 < context['deadline'] - time.monotonic() <= 300, 'CONTEXT')
        need(type(request) is dict and set(request) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256'}
             and request['schema'] == 'helmut-native-control-request-v1' and request['operation'] == 'admit'
             and hex64(request['nonce']) and request['plan_sha256'] == PLAN
             and request['payload_sha256'] == context['source_sha256'], 'REQUEST')
        expected, asset_set = asset_pins()
        root = directory(BASE)
        need(stat.S_IMODE(os.fstat(root).st_mode) == 0o700, 'BASE_MODE')
        lock = os.open(LOCK, R | os.O_CREAT, 0o600, dir_fd=root)
        info = os.fstat(lock)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
             and info.st_size == 0 and stat.S_IMODE(info.st_mode) == 0o600, 'LOCK_IDENTITY')
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise SetupError('SETUP_BUSY') from None
        owned = True
        need(metadata(info) == metadata(os.fstat(lock)) == metadata(os.stat(LOCK, dir_fd=root, follow_symlinks=False)), 'LOCK_CHANGED')
        need(absent(root, ERROR) and absent(root, ERROR + '.PENDING'), 'SETUP_PREVIOUS_FAILURE')
        assets, modules = load_assets(context, expected)
        driver, guard = modules['driver.py'], modules['guard.py']
        accepted = accepted_chain(root, context, asset_set, driver)
        guard_jobs_check(accepted)
        if len(accepted) == 4:
            last, digest = accepted[-1]
            return result('SETUP_COMPLETE_NOT_NATIVE_QUALIFIED', 'complete', 'SETUP_COMPLETE', last['ready_sha256'], digest, last['lifecycle_sha256'])
        phase = PHASES[len(accepted)]
        need(request['nonce'] not in [row[0]['nonce'] for row in accepted], 'NONCE_ALREADY_USED')
        previous = accepted[-1][0]['bindings'] if accepted else driver['bindings'](ROLES[:3])
        data = dict(zip(('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256'),
                        [EXPECTED_OLD_RECEIPT] + [row[0]['ready_sha256'] for row in accepted] + [None] * (3 - len(accepted))))
        began = True
        output = guard['run_setup_phase'](request, {key: context[key] for key in ('base', 'source_sha256', 'deadline')}, phase, assets, expected, data)
        if (type(output) is dict and set(output) == {'status', 'phase', 'code', 'native_qualified', 'native_go_consumed'}
                and output['status'] == 'FAIL_KEEP_STATE_NO_RETRY' and output['phase'] == phase
                and output['native_qualified'] is False and output['native_go_consumed'] is False
                and type(output['code']) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', output['code'])):
            raise SetupError(output['code'])
        need(type(output) is dict and set(output) == {'status', 'phase', 'ready_sha256', 'native_qualified', 'native_go_consumed', 'bindings', 'lifecycle_proof'}, 'GUARD_RESULT')
        value = {key: item for key, item in output.items() if key != 'lifecycle_proof'}
        guard['result_check'](value, phase)
        need(value['status'] == SUCCESS and value['phase'] == phase and value['native_qualified'] is False
             and value['native_go_consumed'] is False and hex64(value['ready_sha256']), 'GUARD_RESULT')
        bindings_check(value['bindings'], COUNTS[len(accepted)])
        lifecycle_check(output['lifecycle_proof'], request, context, phase, value, guard, data, expected)
        need(all(value['bindings'].get(role) == row for role, row in previous.items()), 'PREVIOUS_BINDINGS_CHANGED')
        p = driver['paths']()
        need(driver['bindings'](tuple(value['bindings'])) == value['bindings']
             and driver['read'](p[PRIMARY[len(accepted)]])[1]['sha256'] == value['ready_sha256'], 'FINAL_BINDINGS_CHANGED')
        need(all(path_absent(path) for row in component_paths(driver)[1] for path in row), 'COMPONENT_UNKNOWN')
        need(time.monotonic() < context['deadline'], 'DEADLINE')
        # Full service lifecycle proof is produced only by the qualified guard;
        # this controller verifies its bindings and publishes no helper-only READY.
        proof_sha = sha(encoded(output['lifecycle_proof']))
        marker = {'schema': 'helmut-target-setup-accepted-v1', 'phase': phase,
            'controller_source_sha256': context['source_sha256'], 'asset_set_sha256': asset_set,
            'nonce': request['nonce'], 'ready_sha256': value['ready_sha256'], 'guard_result_sha256': sha(encoded(value)),
            'lifecycle_sha256': proof_sha, 'bindings': value['bindings'], 'native_qualified': False, 'native_go_consumed': False}
        digest = publish(root, marker_name(phase), marker)
        return result(SUCCESS, phase, 'SETUP_PHASE_COMPLETE', value['ready_sha256'], digest, proof_sha)
    except BaseException as error:
        code = safe_code(error, modules)
        failure = result('FAIL_KEEP_STATE_NO_RETRY', phase, code)
        if owned and began:
            try: publish(root, ERROR, failure)
            except BaseException: pass
        return failure
    finally:
        for fd in (lock, root):
            if fd is not None: os.close(fd)


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_EXPLICIT_CONTROLLER_REQUIRED"}')
    raise SystemExit(2)
