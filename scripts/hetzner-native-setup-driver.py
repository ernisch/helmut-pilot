#!/usr/bin/env python3
"""Fixed setup components only; requires the separately qualified service guard.

No native execution authority. Successful component bytes are insufficient for
advancement without the controller's independent lifecycle ACCEPTED record.
"""
import hashlib
import json
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
CONTEXT = '/opt/helmut-native-test/docker28-context-20261026'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
OLD_RECEIPT = '160b4d04df86ba0ddb9a0c0366980f1d3848a5d34249b62d8b880562e20f48be'
IMAGE = 'sha256:34e72f77a5fa0728d44b75766cdfdb1851aea196b3ba6c4fb9242f5d339a678b'
PHASES = ('recover', 'checkout', 'context', 'image')
DATA_KEYS = {'old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256'}
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
D = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


class SetupError(Exception):
    @property
    def code(self):
        return self.args[0] if self.args else 'SETUP_DRIVER_FAILURE'


def need(value, code):
    if not value:
        raise SetupError(code)


def metadata(info):
    return [getattr(info, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
        'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def owner(info):
    return info.st_uid == info.st_gid == 0


def directory(path):
    need(type(path) is str and path.startswith('/')
         and all(x not in ('', '.', '..') for x in path.split('/')[1:]), 'DIRECTORY_PATH')
    fd = os.open('/', D)
    try:
        for part in path.split('/')[1:]:
            child = os.open(part, D, dir_fd=fd)
            try:
                need(owner(os.fstat(child)) and not stat.S_IMODE(os.fstat(child).st_mode) & 0o022,
                     'DIRECTORY_IDENTITY')
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def paths():
    old = BASE + '/stage-' + CASE
    return {
        'historical_binding': BASE + '/once/' + PLAN + '.stage-case.json',
        'historical_error': BASE + '/STAGE_FIRST_ERROR.SAFE.json',
        'historical_receipt': old + '/restored/RESTORE_RECEIPT.PRIVATE.json',
        'recovery_once': BASE + '/once/' + PLAN + '.pax-recovery.json',
        'recovery_ready': BASE + '/RESTORE_PAX_RECOVERY_READY.SAFE.json',
        'recovery_receipt': old + '/restored-pax-recovery/RESTORE_RECEIPT.PRIVATE.json',
        'public_once': BASE + '/PUBLIC_CODE_PR942_ATTEMPT.SAFE.json',
        'public_ready': BASE + '/PUBLIC_CODE_PR942_READY.SAFE.json',
        'public_repository': BASE + '/public-code/pr942-29b05ac0',
        'context_once': CONTEXT + '/NATIVE_CONTEXT_ATTEMPT.SAFE.json',
        'context_receipt': CONTEXT + '/native-context-' + CASE + '/CONTEXT_RECEIPT.SAFE.json',
        'image_receipt': BASE + '/BUDGET_IMAGE_IMPORT_READY.SAFE.json'}


def read(path):
    parent, name = path.rsplit('/', 1)
    root, fd = directory(parent), None
    try:
        parent_before = metadata(os.fstat(root))
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and owner(info) and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == 0o600 and 0 < info.st_size <= 1024**2, 'RECEIPT_IDENTITY')
        before, raw = metadata(info), bytearray()
        while block := os.read(fd, min(65536, 1024**2 + 1 - len(raw))):
            raw.extend(block)
            need(len(raw) <= 1024**2, 'RECEIPT_LIMIT')
        need(len(raw) == info.st_size and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             and parent_before == metadata(os.fstat(root)), 'RECEIPT_CHANGED')
        return bytes(raw), {'sha256': hashlib.sha256(raw).hexdigest(), 'metadata': before}
    finally:
        if fd is not None:
            os.close(fd)
        os.close(root)


def parsed(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            need(key not in result, 'DUPLICATE_JSON')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: need(False, 'JSON_CONSTANT'))


def absent(path):
    root_path, name = path.rsplit('/', 1)
    root = directory(root_path)
    try:
        try: os.stat(name, dir_fd=root, follow_symlinks=False)
        except FileNotFoundError: return True
        return False
    finally: os.close(root)


def roles(count):
    return tuple(paths())[:count]


def bindings(selected):
    result = {}
    for role in selected:
        path = paths()[role]
        if role != 'public_repository':
            result[role] = read(path)[1]
            continue
        root, fd = directory(path.rsplit('/', 1)[0]), None
        try:
            fd = os.open(path.rsplit('/', 1)[1], D, dir_fd=root)
            info = os.fstat(fd)
            need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 1000
                 and stat.S_IMODE(info.st_mode) == 0o700, 'PUBLIC_DIRECTORY_IDENTITY')
            before = metadata(info)
            need(before == metadata(os.fstat(fd))
                 == metadata(os.stat(path.rsplit('/', 1)[1], dir_fd=root, follow_symlinks=False)),
                 'PUBLIC_DIRECTORY_CHANGED')
            result[role] = {'sha256': None, 'metadata': before}
        finally:
            if fd is not None: os.close(fd)
            os.close(root)
    return result


def validate_data(phase, data):
    need(phase in PHASES and type(data) is dict and set(data) == DATA_KEYS, 'PHASE_DATA')
    required = ('old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256')
    for index, key in enumerate(required):
        if index <= PHASES.index(phase):
            need(type(data[key]) is str and re.fullmatch('[a-f0-9]{64}', data[key]), 'PHASE_DATA')
        else: need(data[key] is None, 'PHASE_DATA')
    need(data['old_receipt_sha256'] == OLD_RECEIPT, 'OBSERVED_OLD_RECEIPT_HASH')


def context_ready(expected, data, context_module):
    need(absent(CONTEXT + '/NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json'), 'CONTEXT_UNKNOWN')
    root = CONTEXT + '/native-context-' + CASE
    need(absent(root + '/CONTEXT_RECEIPT.PENDING.SAFE.json'), 'CONTEXT_UNKNOWN')
    raw, binding = read(paths()['context_receipt'])
    need(binding['sha256'] == expected, 'CONTEXT_READY_HASH')
    record = parsed(raw)
    need(type(record) is dict and record.get('status') == 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED'
         and record.get('case_id') == CASE and record.get('scope_sha256') == context_module['SCOPE']
         and record.get('sourcePreparationKind') == 'ACCEPTED_LOCAL_PAX_RECOVERY'
         and record.get('recoveryReadySHA256') == data['recovery_ready_sha256']
         and record.get('historicalRestoreReceiptSHA256') == OLD_RECEIPT
         and record.get('publicCheckoutReadySHA256') == data['public_ready_sha256']
         and record.get('publicEnginePresent') is True
         and record.get('publicEngineState') == 'MOUNTED_REQUIRES_FRESH_SOURCE_ADMISSION'
         and record.get('nativeQualified') is False and record.get('nativeGOConsumed') is False,
         'CONTEXT_READY')
    actual = context_module['observe']()
    need(actual.get('private') is True and context_module['same_daemon'](actual, record['daemon']), 'DAEMON_CHANGED')
    return record


def execute_phase(phase, data, modules, deadline):
    validate_data(phase, data)
    need(0 < deadline - time.monotonic() <= 300, 'DEADLINE')
    need(absent(BASE + '/once/' + PLAN + '.json'), 'NATIVE_GO_ALREADY_CONSUMED')
    counts_before, counts_after = {'recover': (3, 6), 'checkout': (6, 9), 'context': (9, 11), 'image': (11, 12)}[phase]
    before = bindings(roles(counts_before))
    context_module = modules['context']
    if phase != 'recover':
        context_module['recovery_stage_proof'](data['recovery_ready_sha256'], OLD_RECEIPT)
    if phase in ('context', 'image'):
        fd, _ = context_module['public_checkout'](data['public_ready_sha256'])
        os.close(fd)
    if phase == 'recover':
        result = modules['recovery']['recover'](OLD_RECEIPT, modules['restore']['__source_bytes__'], deadline)
        need(result.get('status') == 'RESTORED_NOT_NATIVE_QUALIFIED'
             and result.get('native_qualified') is False and result.get('native_go_consumed') is False,
             'RECOVERY_FAILED')
        ready_role = 'recovery_ready'
    elif phase == 'checkout':
        need(deadline - time.monotonic() >= 190, 'CHECKOUT_DEADLINE_ADMISSION')
        result = modules['public']['create_public_checkout']()
        need(result.get('status') == 'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED'
             and result.get('native_qualified') is False, 'PUBLIC_CHECKOUT_FAILED')
        ready_role = 'public_ready'
    elif phase == 'context':
        need(deadline - time.monotonic() >= 90, 'CONTEXT_DEADLINE_ADMISSION')
        result = context_module['prepare'](data['recovery_ready_sha256'], public=data['public_ready_sha256'],
                                          recovery_receipt_sha=OLD_RECEIPT)
        need(result.get('status') == 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED'
             and result.get('nativeQualified') is False and result.get('nativeGOConsumed') is False,
             'CONTEXT_FAILED')
        ready_role = 'context_receipt'
    else:
        need(deadline - time.monotonic() >= 70, 'IMAGE_DEADLINE_ADMISSION')
        accepted_context = context_ready(data['context_ready_sha256'], data, context_module)
        archive = BASE + '/stage-' + CASE + '/restored-pax-recovery/files/workspace/' + \
                  'helmut-hetzner-preparation-evidence-20261025/ORIGINAL_BUDGET_IMAGE.DOCKER_SAVE.PRIVATE.tar'
        parent, name = archive.rsplit('/', 1)
        root, fd = directory(parent), None
        try:
            fd = os.open(name, R, dir_fd=root)
            archive_before = metadata(os.fstat(fd))
            def observer():
                actual = context_module['observe']()
                need(actual.get('private') is True, 'CONTEXT_NOT_PRIVATE')
                need(context_module['same_daemon'](actual, accepted_context['daemon']), 'DAEMON_CHANGED')
                return actual
            result = modules['image']['import_bound_budget_image'](fd, observer)
            need(archive_before == metadata(os.fstat(fd))
                 == metadata(os.stat(name, dir_fd=root, follow_symlinks=False)), 'ARCHIVE_CHANGED')
        finally:
            if fd is not None: os.close(fd)
            os.close(root)
        need(result.get('status') in ('ALREADY_PRESENT_NOT_NATIVE_QUALIFIED', 'IMPORTED_NOT_NATIVE_QUALIFIED')
             and result.get('image') == IMAGE and result.get('nativeQualified') is False
             and result.get('nativeGOConsumed') is False, 'IMAGE_FAILED')
        ready_role = 'image_receipt'
    need(0 < deadline - time.monotonic(), 'DEADLINE')
    after = bindings(roles(counts_after))
    need(all(after[role] == value for role, value in before.items()), 'PREVIOUS_BINDINGS_CHANGED')
    raw, primary = read(paths()[ready_role])
    need(parsed(raw) == result, 'COMPONENT_SAVED_RESULT')
    return {'status': 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED', 'phase': phase,
        'ready_sha256': primary['sha256'], 'native_qualified': False,
        'native_go_consumed': False, 'bindings': after}


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_SERVICE_GUARD_REQUIRED"}')
    raise SystemExit(2)
