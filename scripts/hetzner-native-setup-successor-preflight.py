#!/usr/bin/env python3
"""Inert, fixed historical evidence checks. No execution or admission authority."""
import hashlib
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
CONTEXT = '/opt/helmut-native-test/docker28-context-20261026'
NONCE = '33c5a05bbd8e9e1eb43490e67095a3ae1ce4eb570bdcc96b3185ae7653d55c9d'
CONTROLLER = '62cb2394de10b8c26f528b5d627dd0cb7720047e7fbd571d6f4dcf99d87d2ad8'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
SCOPE = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
OLD_RECEIPT = '160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be'
# Historical sources copied by the failed job, from main 17be62b5; never executed here.
ASSET_PINS = {
    'guard.py': {'sha256': 'a41ddc422f5c49f5f6abae87758ce47bd91d4008494bedf46ebff0bf9192659c', 'bytes': 34133},
    'driver.py': {'sha256': 'e2bb2bb06ef259ba7be5814f7a7535a265988d62470a85fc7c3e26cbe158d14f', 'bytes': 11824},
    'recovery.py': {'sha256': '5f0f430bf557ca0e8f103cd1e6b06e25703a2604826e1f2bb39c222609198eb1', 'bytes': 15031},
    'restore.py': {'sha256': 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88', 'bytes': 22910},
    'public.py': {'sha256': '1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb', 'bytes': 15871},
    'context.py': {'sha256': '1ee9b47014bb0227cb385dd248990980c0083dcca167d88838590fbbe538cfa9', 'bytes': 43560},
    'image.py': {'sha256': 'd355adfcd0a0a87cc1306170b5b8c0601bf9e8d9661af53609eb381dad4c337a', 'bytes': 14311}}
CAP, ASSET_CAP = 16384, 131072
R = os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
D = R | os.O_DIRECTORY
PHASES = ('recover', 'checkout', 'context', 'image')


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def _need(value, code):
    if not value: raise Stop(code)


def _bounded(deadline):
    _need(type(deadline) in (int, float) and math.isfinite(deadline)
          and 0 < deadline - time.monotonic() <= 300, 'HISTORY_DEADLINE')


def _metadata(info):
    return [getattr(info, name) for name in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
        'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def _sha(raw): return hashlib.sha256(raw).hexdigest()


def _parsed(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            _need(key not in result, 'HISTORY_DUPLICATE_JSON')
            result[key] = value
        return result
    return json.loads(raw.decode('ascii'), object_pairs_hook=pairs,
                      parse_constant=lambda _: _need(False, 'HISTORY_JSON_CONSTANT'))


def _job_path(): return BASE + '/setup-jobs/' + NONCE


def _directory(path, deadline, missing=False):
    _bounded(deadline)
    _need(type(path) is str and path.startswith('/')
          and all(part not in ('', '.', '..') for part in path.split('/')[1:]), 'HISTORY_PATH')
    fd = os.open('/', D)
    try:
        prefix = ''
        for part in path.split('/')[1:]:
            prefix += '/' + part
            _bounded(deadline)
            before = _metadata(os.fstat(fd))
            try: named = os.stat(part, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                _need(missing and before == _metadata(os.fstat(fd)), 'HISTORY_DIRECTORY_MISSING')
                os.close(fd)
                return None
            _need(stat.S_ISDIR(named.st_mode) and named.st_uid == named.st_gid == 0
                  and not stat.S_IMODE(named.st_mode) & 0o022, 'HISTORY_DIRECTORY_IDENTITY')
            if prefix in (BASE, BASE + '/setup-jobs', _job_path()):
                _need(stat.S_IMODE(named.st_mode) == 0o700, 'HISTORY_DIRECTORY_MODE')
            child = os.open(part, D, dir_fd=fd)
            try:
                _need(before == _metadata(os.fstat(fd)) and _metadata(named) == _metadata(os.fstat(child))
                      == _metadata(os.stat(part, dir_fd=fd, follow_symlinks=False)), 'HISTORY_DIRECTORY_CHANGED')
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _files(duplicate=None):
    job = _job_path()
    return {'global_error': (BASE, 'TARGET_SETUP_FIRST_ERROR.SAFE.json', CAP, 0o600),
        'job': (job, 'JOB.PRIVATE.json', CAP, 0o600),
        'worker_error': (job, 'FIRST_ERROR.PRIVATE.json', CAP, 0o600),
        **{name: (job, name, ASSET_CAP, 0o500) for name in ASSET_PINS},
        **({duplicate: (job, duplicate, CAP, 0o600)} if duplicate is not None else {})}


def _duplicate_name(names, expected):
    extras = set(names) - set(expected)
    _need(set(expected) <= set(names) and len(extras) <= 1
          and all(type(name) is str and re.fullmatch(r'\.setup-write-[a-f0-9]{32}\.tmp', name)
                  for name in extras), 'HISTORY_JOB_ENTRIES')
    return next(iter(extras)) if extras else None


def _duplicate_error(files, duplicate):
    # Before ARM, the historical Parent and Worker can each save_error once.
    # RENAME_NOREPLACE leaves at most one loser; only its exact error bytes qualify.
    if duplicate is not None:
        _need(files[duplicate]['raw'] == files['worker_error']['raw'], 'HISTORY_ERROR_DUPLICATE')


def _read(spec, deadline):
    parent, name, cap, mode = spec
    root, fd, fresh = _directory(parent, deadline), None, None
    try:
        parent_before = _metadata(os.fstat(root))
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd)
        before = _metadata(info)
        _need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1
              and stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= cap, 'HISTORY_FILE_IDENTITY')
        raw = bytearray()
        while True:
            _bounded(deadline)
            block = os.read(fd, min(65536, cap + 1 - len(raw)))
            if not block: break
            raw.extend(block)
            _need(len(raw) <= cap, 'HISTORY_FILE_LIMIT')
        fresh = _directory(parent, deadline)
        _need(len(raw) == info.st_size and before == _metadata(os.fstat(fd))
              == _metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
              == _metadata(os.stat(name, dir_fd=fresh, follow_symlinks=False))
              and parent_before == _metadata(os.fstat(root)) == _metadata(os.fstat(fresh)), 'HISTORY_FILE_CHANGED')
        raw = bytes(raw)
        return {'raw': raw, 'sha256': _sha(raw), 'metadata': before}
    finally:
        for item in (fresh, fd, root):
            if item is not None: os.close(item)


def _absent(path, deadline):
    parent, name = path.rsplit('/', 1)
    root, fresh = _directory(parent, deadline, missing=True), None
    if root is None: return True
    try:
        before = _metadata(os.fstat(root))
        try: os.stat(name, dir_fd=root, follow_symlinks=False)
        except FileNotFoundError:
            fresh = _directory(parent, deadline)
            _need(before == _metadata(os.fstat(root)) == _metadata(os.fstat(fresh)), 'HISTORY_DIRECTORY_CHANGED')
            try: os.stat(name, dir_fd=fresh, follow_symlinks=False)
            except FileNotFoundError: return True
        return False
    finally:
        for item in (fresh, root):
            if item is not None: os.close(item)


def _job_directory(deadline):
    root, fresh = _directory(_job_path(), deadline), None
    try:
        before, names = _metadata(os.fstat(root)), []
        with os.scandir(root) as entries:
            for entry in entries:
                _bounded(deadline)
                names.append(entry.name)
                _need(len(names) <= 10, 'HISTORY_JOB_ENTRIES')
        duplicate = _duplicate_name(names, {'JOB.PRIVATE.json', 'FIRST_ERROR.PRIVATE.json', *ASSET_PINS})
        fresh = _directory(_job_path(), deadline)
        _need(before == _metadata(os.fstat(root)) == _metadata(os.fstat(fresh)), 'HISTORY_DIRECTORY_CHANGED')
        return before, duplicate
    finally:
        for item in (fresh, root):
            if item is not None: os.close(item)


def _legacy_jobs_directory(deadline):
    path = BASE + '/setup-jobs'
    root, fresh = _directory(path, deadline), None
    try:
        before, names = _metadata(os.fstat(root)), []
        with os.scandir(root) as entries:
            for entry in entries:
                _bounded(deadline)
                names.append(entry.name)
                _need(len(names) <= 1, 'HISTORY_LEGACY_JOBS_ENTRIES')
        _need(names == [NONCE], 'HISTORY_LEGACY_JOBS_ENTRIES')
        fresh = _directory(path, deadline)
        _need(before == _metadata(os.fstat(root)) == _metadata(os.fstat(fresh)), 'HISTORY_DIRECTORY_CHANGED')
        return before
    finally:
        for item in (fresh, root):
            if item is not None: os.close(item)


def _history_markers(deadline):
    for phase in PHASES:
        marker = BASE + '/SETUP_' + phase.upper() + '_ACCEPTED.SAFE.json'
        for path in (marker, marker + '.PENDING'):
            _need(_absent(path, deadline), 'HISTORY_ACCEPTED_OR_PARTIAL')
    _need(_absent(BASE + '/TARGET_SETUP_FIRST_ERROR.SAFE.json.PENDING', deadline), 'HISTORY_ERROR_PARTIAL')


def _validate(files):
    global_error, worker_error, job = (_parsed(files[key]['raw']) for key in ('global_error', 'worker_error', 'job'))
    expected = {'schema': 'helmut-target-setup-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'phase': 'recover', 'code': 'UNIT_PROPERTIES', 'ready_sha256': None, 'accepted_sha256': None,
        'lifecycle_sha256': None, 'native_qualified': False, 'native_go_consumed': False}
    _need(type(global_error) is dict and global_error == expected
          and global_error['native_qualified'] is False and global_error['native_go_consumed'] is False, 'HISTORY_GLOBAL_ERROR')
    expected = {'schema': 'helmut-setup-service-error-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'phase': 'recover', 'code': 'UNIT_PROPERTIES', 'exception_type': 'Stop', 'errno': None,
        'native_qualified': False, 'native_go_consumed': False}
    _need(type(worker_error) is dict and worker_error == expected
          and worker_error['native_qualified'] is False and worker_error['native_go_consumed'] is False, 'HISTORY_WORKER_ERROR')
    keys = {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
            'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets'}
    _need(type(job) is dict and set(job) == keys and job['schema'] == 'helmut-setup-service-job-v1'
          and job['controller_source_sha256'] == CONTROLLER and job['plan_sha256'] == PLAN
          and job['case_id'] == CASE and job['phase'] == 'recover', 'HISTORY_JOB_SCHEMA')
    _need(type(job['request']) is dict and job['request'] == {'schema': 'helmut-native-control-request-v1',
        'operation': 'admit', 'nonce': NONCE, 'plan_sha256': PLAN, 'payload_sha256': CONTROLLER}, 'HISTORY_JOB_REQUEST')
    _need(type(job['boot_id']) is str and re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', job['boot_id'])
          and type(job['deadline']) in (int, float) and math.isfinite(job['deadline'])
          and 0 < job['deadline'] < 2**53 and type(job['runtime_seconds']) is int
          and 0 < job['runtime_seconds'] <= 295 and job['runtime_seconds'] < job['deadline'], 'HISTORY_JOB_TIME')
    controller = job['controller']
    _need(type(controller) is dict and set(controller) == {'pid', 'start_ticks', 'namespace'}
          and type(controller['pid']) is int and 1 < controller['pid'] < 2**31
          and type(controller['start_ticks']) is int and 1 < controller['start_ticks'] < 2**64
          and type(controller['namespace']) is list and len(controller['namespace']) == 2
          and all(type(n) is int and 0 <= n < 2**64 for n in controller['namespace']), 'HISTORY_JOB_CONTROLLER')
    _need(type(job['phase_data']) is dict and job['phase_data'] == {'old_receipt_sha256': OLD_RECEIPT,
        'recovery_ready_sha256': None, 'public_ready_sha256': None, 'context_ready_sha256': None}, 'HISTORY_JOB_PHASE_DATA')
    _need(type(job['assets']) is dict and set(job['assets']) == set(ASSET_PINS), 'HISTORY_ASSET_SET')
    for name, pin in ASSET_PINS.items():
        actual = job['assets'][name]
        _need(type(actual) is dict and set(actual) == {'sha256', 'bytes'} and actual == pin
              and type(actual['bytes']) is int and files[name]['sha256'] == pin['sha256']
              and len(files[name]['raw']) == pin['bytes'], 'HISTORY_ASSET_PIN')
    return job


def collect_history(deadline):
    """Return private internal evidence, never a grant or current process binding."""
    try:
        _need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'HISTORY_ROOT_REQUIRED')
        legacy_jobs_before = _legacy_jobs_directory(deadline)
        before, duplicate = _job_directory(deadline)
        _history_markers(deadline)
        files = {key: _read(spec, deadline) for key, spec in _files(duplicate).items()}
        job = _validate(files)
        _duplicate_error(files, duplicate)
        _history_markers(deadline)
        _need(_job_directory(deadline) == (before, duplicate), 'HISTORY_DIRECTORY_CHANGED')
        _need(_legacy_jobs_directory(deadline) == legacy_jobs_before, 'HISTORY_DIRECTORY_CHANGED')
        _bounded(deadline)
        return {'schema': 'helmut-setup-history-baseline-v1', 'files': files, 'job_directory': before,
                'legacy_jobs_directory': legacy_jobs_before, 'job': job}
    except (OSError, ValueError, RecursionError):
        raise Stop('HISTORY_IO_OR_FORMAT') from None


def history_summary(baseline):
    """Closed safe projection; do not expose the private baseline through a wire API."""
    _need(type(baseline) is dict and set(baseline) == {'schema', 'files', 'job_directory', 'legacy_jobs_directory', 'job'}
          and baseline['schema'] == 'helmut-setup-history-baseline-v1' and type(baseline['files']) is dict
          and set(_files()) <= set(baseline['files']), 'HISTORY_BASELINE')
    duplicate = _duplicate_name(baseline['files'], _files())
    rows = {}
    for key, value in baseline['files'].items():
        _need(type(value) is dict and set(value) == {'raw', 'sha256', 'metadata'} and type(value['raw']) is bytes
              and 0 < len(value['raw']) <= _files(duplicate)[key][2]
              and type(value['sha256']) is str and re.fullmatch('[a-f0-9]{64}', value['sha256'])
              and _sha(value['raw']) == value['sha256'] and type(value['metadata']) is list, 'HISTORY_BASELINE')
        rows[key] = {'sha256': value['sha256'], 'metadata': list(value['metadata'])}
    for row in (*rows.values(), {'metadata': baseline['job_directory']}, {'metadata': baseline['legacy_jobs_directory']}):
        _need(type(row['metadata']) is list and len(row['metadata']) == 12
              and all(type(n) is int and -(2**63) <= n < 2**64 for n in row['metadata']), 'HISTORY_BASELINE')
    _need(_validate(baseline['files']) == baseline['job'], 'HISTORY_BASELINE')
    _duplicate_error(baseline['files'], duplicate)
    return {'schema': 'helmut-setup-history-summary-v1', 'status': 'HISTORICAL_FAILURE_BOUND_NOT_AUTHORITY',
        'code': 'UNIT_PROPERTIES', 'files': rows, 'job_directory': list(baseline['job_directory']),
        'legacy_jobs_directory': list(baseline['legacy_jobs_directory']),
        'native_qualified': False, 'native_go_consumed': False}


def verify_history_unchanged(baseline, deadline):
    history_summary(baseline)
    _need(collect_history(deadline) == baseline, 'HISTORY_CHANGED')
    return True


def _component_paths():
    stage = BASE + '/stage-' + CASE
    context = CONTEXT + '/native-context-' + CASE
    return (BASE + '/once/' + PLAN + '.pax-recovery.json',
        BASE + '/RESTORE_PAX_RECOVERY_FIRST_ERROR.SAFE.json', BASE + '/RESTORE_PAX_RECOVERY_READY.PENDING.SAFE.json',
        BASE + '/RESTORE_PAX_RECOVERY_READY.SAFE.json', stage + '/restored-pax-recovery',
        BASE + '/PUBLIC_CODE_PR942_ATTEMPT.SAFE.json', BASE + '/PUBLIC_CODE_PR942_FIRST_ERROR.PRIVATE.json',
        BASE + '/PUBLIC_CODE_PR942_RECEIPT.PENDING.SAFE.json', BASE + '/PUBLIC_CODE_PR942_READY.SAFE.json',
        BASE + '/public-code/pr942-29b05ac0', CONTEXT + '/NATIVE_CONTEXT_ATTEMPT.SAFE.json',
        CONTEXT + '/NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json', context,
        context + '/CONTEXT_RECEIPT.PENDING.SAFE.json', context + '/CONTEXT_RECEIPT.SAFE.json',
        BASE + '/BUDGET_IMAGE_IMPORT_ATTEMPT.SAFE.json', BASE + '/BUDGET_IMAGE_IMPORT_FIRST_ERROR.PRIVATE.json',
        BASE + '/BUDGET_IMAGE_IMPORT_RECEIPT.PENDING.SAFE.json', BASE + '/BUDGET_IMAGE_IMPORT_READY.SAFE.json',
        BASE + '/once/' + PLAN + '.json')


def require_unused_components(deadline):
    """Absence of all fixed component paths is necessary, never authority to run."""
    try:
        for path in _component_paths():
            _need(_absent(path, deadline), 'SETUP_COMPONENT_PRESENT_OR_UNKNOWN')
        _bounded(deadline)
        return True
    except OSError:
        raise Stop('SETUP_COMPONENT_PRESENT_OR_UNKNOWN') from None


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
