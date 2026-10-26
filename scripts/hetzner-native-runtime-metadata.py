"""Read only: exact retained failed-context case and one fixed SAFE dataset.

Only the qualified source loader may supply config bytes and namespaces. No
paths, sources, release flags, limits or baseline hashes come from wire input.
"""
import base64
import hashlib
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
NAMESPACE = 'setup-successor-unit-properties-v1'
PHASES = ('recover', 'checkout', 'context', 'image')
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
SCOPE_SHA = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
MEMBER = ('files/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/'
          'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json')
RESTORED = BASE + '/stage-' + CASE + '/restored-pax-recovery'
LEAF = RESTORED + '/' + MEMBER
SCOPE_FILE = RESTORED + '/SOURCE_SCOPE.PRIVATE.json'
FILE_BYTES = 207733
FILE_SHA = '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475'
CHUNK_BYTES, CHUNKS, OUTPUT_CAP = 65536, 4, 131072
CONTRACT_ID = 'runtime-metadata-failed-context-20261026-v1'
RETAINED = {
    'authority_sha256': '2afddc86477157c81ad537bbc06037aa9f5039a690ef4c7e774c79e942824ad3',
    'recover': {'nonce': '420237c072fd5a129baa77086222a430b4c18dacc0d095549d9c18b5fcfe3cef',
        'accepted_sha256': 'e3b41edd946e54519f101803fbb1ef4012b5b025c927e97119ceac1a79e5dbd5',
        'ready_sha256': '0156f043d7bfa7f50a68864d415ab71f02bdb2522048ca45bfe400b5d7c01939',
        'lifecycle_sha256': 'bc3bf66feb62b2db904f2d4c36e6c84318120b9474a3cd2784d0283cc8b01541'},
    'checkout': {'nonce': 'fb859f135823b8b1796b94f3a98be53a1c75aee1a8fdfae71840aaf9b33c8b31',
        'accepted_sha256': 'f4f57bdbf31298950e3d932859521318da3eb2d520a10603f80054560294767b',
        'ready_sha256': '54ae9b1327aaaabe221a5b4bcc39a973026fddade8da91dd22995d9cc0a34187',
        'lifecycle_sha256': 'e1e7d32cad7fbbafa7d5e2112e767a7adb48acb4269873b907233826362dc5fa'},
    'failed_nonce': '8e1471f3745f196f402ccc4ed96000225c73d725f0349e75a481e1f858073d59',
    'failed_response_sha256': 'b4099527980858a10433f5f24749d8a6d4241947a257491b4214650e5fedb2fd',
    'failed_result_sha256': 'b5d407c5ea19a08bbba3d1151cbf274622ff80821a2b92c8be4199bca0612e30'}
MODULE_PINS = {
    'library': {'repoFile': 'hetzner-native-setup-coordinator.py', 'bytes': 23644,
                'sha256': '0bec349c325d402e1357e77a8238e98ede64cf59047d712d93afcaecc19bbb2d'},
    'successor': {'repoFile': 'hetzner-native-setup-successor.py', 'bytes': 41531,
                  'sha256': '43f837860b111924aef3da593c8f808c773fd617ad06cad3c1279c4416b0ead9'},
    'preflight': {'repoFile': 'hetzner-native-setup-successor-preflight.py', 'bytes': 19099,
                  'sha256': '726534ef06f5649efa1282c0aabdc49857706104a4a82f2677259cc837a1764b'},
    'guard.py': {'repoFile': 'hetzner-native-setup-service.py', 'bytes': 37312,
                 'sha256': 'b748266c62b899764aa042be62937607f564641dd66163811ee7e363366bc662'},
    'driver.py': {'repoFile': 'hetzner-native-setup-driver.py', 'bytes': 11824,
                  'sha256': 'e2bb2bb06ef259ba7be5814f7a7535a265988d62470a85fc7c3e26cbe158d14f'},
    'recovery.py': {'repoFile': 'hetzner-native-local-restore-recovery.py', 'bytes': 15031,
                    'sha256': '5f0f430bf557ca0e8f103cd1e6b06e25703a2604826e1f2bb39c222609198eb1'},
    'restore.py': {'repoFile': 'hetzner-native-stage-restore.py', 'bytes': 22910,
                   'sha256': 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'},
    'public.py': {'repoFile': 'hetzner-native-public-checkout.py', 'bytes': 15871,
                  'sha256': '1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb'},
    'context.py': {'repoFile': 'hetzner-native-context.py', 'bytes': 43560,
                   'sha256': '1ee9b47014bb0227cb385dd248990980c0083dcca167d88838590fbbe538cfa9'},
    'image.py': {'repoFile': 'hetzner-native-budget-image-import.py', 'bytes': 14311,
                 'sha256': 'd355adfcd0a0a87cc1306170b5b8c0601bf9e8d9661af53609eb381dad4c337a'}}
SETUP_CONFIG = {'schema': 'helmut-runtime-metadata-read-contract-v1', 'contract_id': CONTRACT_ID,
    'setup_qualification_commit': '747d6c59088fbc89170f8426f5e2a2fc4ceedd08',
    'setup_deployment_commit': '8139b3a99d04e3e854f886123869bf669da6389d',
    'setup_server_sha256': '1fc63bf8c90a6f13a2eebf4981d7f0c7da0b10f5e5c2fd563551e117f0ec58fe',
    'contract_sha256': 'e5ffcce62f8a419f11596e7ef88e9d10f4585d33b1b18e7d962670475d4d4059',
    'asset_set_sha256': '9941129431d0575caa1afe9afab497fd7d111c18ede0566b5498ec5089751c07',
    'scope_sha256': SCOPE_SHA, 'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES,
    'member': MEMBER, 'modules': MODULE_PINS, 'read_only': True,
    'released_safe_sha256': FILE_SHA, 'retained_failure': RETAINED,
    'native_qualified': False, 'native_go_consumed': False}
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
D = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
MODULE_NAMES = {'library', 'successor', 'preflight', 'guard.py', 'driver.py', 'recovery.py',
                'restore.py', 'public.py', 'context.py', 'image.py'}
CONTEXT_ERROR_CODES = frozenset('ANCHOR_NOT_EMPTY_ROOT_0755 ANCHOR_SCOPE CANONICAL_MOUNT_FLAGS CANONICAL_MOUNT_MISSING CANONICAL_PROOF_INCOMPLETE CANONICAL_PROOF_MISMATCH CANONICAL_SOCKET_PEER CANONICAL_TARGET_FILESYSTEM CANONICAL_TARGET_INODE CANONICAL_TARGET_SYMLINK CHILD_CHANNEL CHILD_DEADLINE CHILD_FAILED CHILD_INCOMPLETE CHILD_NAMESPACE_CHANGED CHILD_OBSERVATION_FAILED CHILD_STEP CONTEXT_ALREADY_ATTEMPTED CONTEXT_FAILURE DAEMON_CHANGED DAEMON_NAMESPACE_IS_HOST DAEMON_OWNER DAEMON_PROPAGATION_NOT_PRIVATE DAEMON_SERVICE_BINDING DAEMON_START DIRECTORY_OWNER_MODE DIRECTORY_PATH DOCKER_OBSERVATION DOCKER_SCOPE DUPLICATE_FIELD EVIDENCE_LIMIT EVIDENCE_WRITE FILESYSTEM_OBSERVATION HELD_NAMESPACE_CHANGED JSON_CONSTANT MOUNTINFO_FORMAT MOUNTINFO_LIMIT MOUNT_TARGET_OWNER MOUNT_TARGET_TYPE NAMESPACE_FD_NOT_NSFS NATIVE_GO_ALREADY_CONSUMED PREFLIGHT_CHANGED PROC_LIMIT PUBLIC_CHECKOUT_CHANGED PUBLIC_CHECKOUT_UNKNOWN PUBLIC_CONTROL_MODE PUBLIC_EXPECTED_SHA PUBLIC_PARENT_OWNER_MODE PUBLIC_READY PUBLIC_READY_HASH PUBLIC_RECEIPT_CHANGED PUBLIC_RECEIPT_IDENTITY PUBLIC_RECEIPT_LIMIT PUBLIC_REPOSITORY_OWNER_MODE RECEIPT_CHANGED RECEIPT_IDENTITY RECEIPT_LIMIT RECOVERY_ATTEMPT RECOVERY_CONTROL_MODE RECOVERY_EXPECTED_SHA RECOVERY_FILE_CHANGED RECOVERY_FILE_IDENTITY RECOVERY_FILE_LIMIT RECOVERY_HISTORICAL_BINDING RECOVERY_HISTORICAL_RECEIPT_HASH RECOVERY_HISTORICAL_RESTORE RECOVERY_HISTORICAL_STAGE RECOVERY_PROOF_CHANGED RECOVERY_READY RECOVERY_READY_HASH RECOVERY_RESTORE RECOVERY_RESTORE_HASH RECOVERY_UNKNOWN RESTORE_RECEIPT RESTORE_RECEIPT_HASH RESTORE_SCOPE ROOT_REQUIRED SERVICE_DEADLINE SERVICE_IDENTITY SERVICE_OBSERVATION SERVICE_OUTPUT_LIMIT SERVICE_SOCKET_PID SOCKET_CHANGED SOCKET_PEER SOCKET_UID1000_ACCESS SOURCE_SUBMOUNT STAGE_EXPECTED_SHA STAGE_READY STAGE_READY_HASH STAGE_RECEIPT_BINDING STAGE_RECEIPT_HASH STAGE_UNKNOWN UID_OR_GID1000_ASSIGNED'.split())
JOB_ERROR_CODES = frozenset('ACK_BINDING ARCHIVE_CHANGED ARM_BINDING ASSET_PIN ASSET_SET ASSET_TOTAL BOOT_ID CAPACITY CGROUP_CONTENT CGROUP_LIMIT CGROUP_NOT_SOLE_WORKER CGROUP_OWNER CGROUP_PATH CGROUP_SYMLINK CHECKOUT_DEADLINE_ADMISSION CHILD_ERROR CHILD_EXIT CHILD_RESULT_LIMIT COMPONENT_SAVED_RESULT CONTEXT CONTEXT_DEADLINE_ADMISSION CONTEXT_FAILED CONTEXT_NOT_PRIVATE CONTEXT_READY CONTEXT_READY_HASH CONTEXT_UNKNOWN CONTROLLER_LOST CONTROL_COMMAND_DEADLINE CONTROL_COMMAND_FAILED CONTROL_COMMAND_LIMIT DAEMON_CHANGED DEADLINE DIRECTORY_IDENTITY DIRECTORY_PATH DIRECTORY_PRIVATE DRIVER_BINDINGS DRIVER_RESULT DUPLICATE_JSON FILESYSTEM_OR_PHASE_FAILURE FILE_CHANGED FILE_IDENTITY FILE_LIMIT FILE_NAME FINAL_RESULT IMAGE_DEADLINE_ADMISSION IMAGE_FAILED JOB_CHANGED JOB_CONTROLLER JOB_IDENTITY JOB_NAMESPACE JOB_SCHEMA JSON_CONSTANT KERNEL_LIMIT NATIVE_GO_ALREADY_CONSUMED NONCE OBSERVED_OLD_RECEIPT_HASH PHASE_BINDING PHASE_DATA PHASE_FAILED PREVIOUS_BINDINGS_CHANGED PROCESS_OWNER PROCESS_PID PROCESS_START PUBLIC_CHECKOUT_FAILED PUBLIC_DIRECTORY_CHANGED PUBLIC_DIRECTORY_IDENTITY RECEIPT_CHANGED RECEIPT_IDENTITY RECEIPT_LIMIT RECOVERY_FAILED REQUEST RESULT_CHANGED RESULT_LIMIT RESULT_PUBLICATION ROOT_REQUIRED SHORT_WRITE UNIT_BOUNDS UNIT_CGROUP UNIT_CHANGED UNIT_COMMAND UNIT_DBUS_FORMAT UNIT_DBUS_IDENTITY UNIT_DBUS_TYPE UNIT_DURATION UNIT_EXIT UNIT_EXTRA_COMMAND UNIT_FORMAT UNIT_IDENTITY UNIT_INVOCATION UNIT_PROPERTIES UNIT_REPLACED UNIT_RUNNING UNIT_RUNTIME WORKER_ALREADY_ATTEMPTED WORKER_CGROUP WORKER_CHANGED WORKER_COMMAND WORKER_EXE WORKER_EXITED WORKER_FAILED WORKER_SELF WRITE_LIMIT WRITE_READBACK'.split())
JOB_GUARD_DRIVER_CODES = JOB_ERROR_CODES
# phase_child transports a qualified Context Stop unchanged in phase_error.
JOB_ERROR_CODES = JOB_GUARD_DRIVER_CODES | CONTEXT_ERROR_CODES
ERROR_CODES = JOB_ERROR_CODES
EXCEPTION_TYPES = frozenset('''ArithmeticError AssertionError AttributeError BaseException BaseExceptionGroup
BlockingIOError BrokenPipeError BufferError BytesWarning ChildProcessError ConnectionAbortedError ConnectionError
ConnectionRefusedError ConnectionResetError DeprecationWarning EOFError EncodingWarning EnvironmentError Exception
ExceptionGroup FileExistsError FileNotFoundError FloatingPointError FutureWarning GeneratorExit IOError ImportError
ImportWarning IndentationError IndexError InterruptedError IsADirectoryError KeyError KeyboardInterrupt LookupError
MemoryError ModuleNotFoundError NameError NotADirectoryError NotImplementedError OSError OverflowError
PendingDeprecationWarning PermissionError ProcessLookupError RecursionError ReferenceError ResourceWarning RuntimeError
RuntimeWarning SetupError Stop StopAsyncIteration StopIteration SyntaxError SyntaxWarning SystemError SystemExit
TabError TimeoutError TypeError UnboundLocalError UnicodeDecodeError UnicodeEncodeError UnicodeError UnicodeTranslateError
UnicodeWarning UserWarning ValueError Warning ZeroDivisionError'''.split())
CONTEXT_BASE = '/opt/helmut-native-test/docker28-context-20261026'
RECORD_NAMES = ('namespace_error', 'job_error', 'component_error', 'component_attempt',
                'component_receipt_pending', 'component_receipt')


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise Stop(code)


def sha(raw): return hashlib.sha256(raw).hexdigest()
def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None
def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False) + '\n').encode('ascii')
def metadata(info):
    return [getattr(info, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
        'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'METADATA_DEADLINE')


def unique_json(raw):
    def pairs(rows):
        value = {}
        for key, item in rows:
            need(key not in value, 'METADATA_DUPLICATE_JSON')
            value[key] = item
        return value
    text = raw.decode('utf-8', errors='strict')
    value = json.loads(text, object_pairs_hook=pairs,
                       parse_constant=lambda _: need(False, 'METADATA_JSON_CONSTANT'))
    stack, nodes, depth = [(value, 0)], 0, 0
    counts = dict.fromkeys(('dict', 'list', 'str', 'int', 'float', 'bool', 'NoneType'), 0)
    while stack:
        item, level = stack.pop(); nodes += 1; depth = max(depth, level)
        need(nodes <= 100000 and level <= 64, 'METADATA_JSON_LIMIT')
        kind = type(item).__name__
        need(type(item) in (dict, list, str, int, float, bool, type(None)), 'METADATA_JSON_TYPE')
        counts[kind] = counts.get(kind, 0) + 1
        if type(item) is float: need(math.isfinite(item), 'METADATA_JSON_CONSTANT')
        if type(item) is dict: stack.extend((child, level + 1) for child in item.values())
        if type(item) is list: stack.extend((child, level + 1) for child in item)
    summary = {'root_type': type(value).__name__, 'nodes': nodes, 'max_depth': depth,
               'type_counts': counts, 'ascii_only': raw.isascii(), 'utf8_valid': True,
               'schema_value_sha256': None}
    if type(value) is dict and type(value.get('schema')) is str:
        summary['schema_value_sha256'] = sha(value['schema'].encode('utf-8'))
    return value, summary


def trusted_parent(path):
    need(type(path) is str and path.startswith('/') and all(part not in ('', '.', '..')
         for part in path.split('/')[1:]), 'METADATA_FIXED_PATH')
    fd = os.open('/', D)
    chain = []
    try:
        info = os.fstat(fd)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and not stat.S_IMODE(info.st_mode) & 0o022, 'METADATA_PARENT_IDENTITY')
        prefix = ''
        for part in path.split('/')[1:-1]:
            prefix += '/' + part
            child = os.open(part, D, dir_fd=fd)
            try:
                info = os.fstat(child)
                need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
                     and not stat.S_IMODE(info.st_mode) & 0o022, 'METADATA_PARENT_IDENTITY')
                if prefix == BASE: need(stat.S_IMODE(info.st_mode) == 0o700, 'METADATA_BASE_MODE')
            except BaseException:
                os.close(child)
                raise
            chain.append([prefix, metadata(info)])
            os.close(fd); fd = child
        readable = os.open('.', R | os.O_DIRECTORY, dir_fd=fd)
        try: need(metadata(os.fstat(readable)) == metadata(os.fstat(fd)), 'METADATA_PARENT_CHANGED')
        except BaseException:
            os.close(readable)
            raise
        os.close(fd)
        return readable, path.rsplit('/', 1)[1], chain
    except BaseException:
        os.close(fd)
        raise


def read_fixed(path, deadline, limit, expected_bytes, expected_sha, owner, mode, allow_empty=False):
    bounded(deadline)
    root, name, chain = trusted_parent(path)
    fd = fresh = None
    try:
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd); before = metadata(info)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and (info.st_uid, info.st_gid) == tuple(owner)
             and stat.S_IMODE(info.st_mode) == mode and 0 <= info.st_size <= limit
             and (allow_empty or info.st_size > 0)
             and (expected_bytes is None or info.st_size == expected_bytes), 'METADATA_LEAF_IDENTITY')
        raw, digest = bytearray(), hashlib.sha256()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, limit + 1 - len(raw)))
            if not block: break
            raw.extend(block); digest.update(block)
            need(len(raw) <= limit, 'METADATA_FILE_LIMIT')
        fresh, again, second_chain = trusted_parent(path)
        need(again == name and second_chain == chain and len(raw) == info.st_size
             and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             == metadata(os.stat(name, dir_fd=fresh, follow_symlinks=False)), 'METADATA_FILE_CHANGED')
        need(expected_sha is None or digest.hexdigest() == expected_sha, 'METADATA_FILE_HASH')
        return bytes(raw), {'sha256': digest.hexdigest(), 'bytes': len(raw), 'metadata': before}
    finally:
        for item in (fresh, fd, root):
            if item is not None: os.close(item)


def validate_config(qualified):
    config = SETUP_CONFIG
    need(hex64(CONTRACT_SHA256) and sha(encoded(config)) == CONTRACT_SHA256, 'METADATA_CONFIG_NOT_QUALIFIED')
    need(type(config) is dict and set(config) == {'schema', 'contract_id', 'setup_qualification_commit',
        'setup_deployment_commit', 'setup_server_sha256', 'contract_sha256', 'asset_set_sha256',
        'scope_sha256', 'dataset_sha256', 'dataset_bytes', 'member', 'modules', 'read_only',
        'released_safe_sha256', 'retained_failure', 'native_qualified', 'native_go_consumed'}
        and config['schema'] == 'helmut-runtime-metadata-read-contract-v1' and config['contract_id'] == CONTRACT_ID
        and config['setup_qualification_commit'] == '747d6c59088fbc89170f8426f5e2a2fc4ceedd08'
        and type(config['setup_deployment_commit']) is str
        and re.fullmatch('[a-f0-9]{40}', config['setup_deployment_commit'])
        and all(hex64(config[key]) for key in ('setup_server_sha256', 'contract_sha256', 'asset_set_sha256'))
        and config['scope_sha256'] == SCOPE_SHA and config['dataset_sha256'] == FILE_SHA
        and config['dataset_bytes'] == FILE_BYTES and type(config['dataset_bytes']) is int
        and config['member'] == MEMBER and config['read_only'] is True
        and config['native_qualified'] is False and config['native_go_consumed'] is False
        and config['retained_failure'] == RETAINED
        and config['released_safe_sha256'] in (None, FILE_SHA), 'METADATA_BASELINE_NOT_READY')
    need(type(qualified) is dict and set(qualified) == MODULE_NAMES
         and type(config['modules']) is dict and set(config['modules']) == MODULE_NAMES, 'METADATA_MODULE_SET')
    for name in sorted(MODULE_NAMES):
        module, pin = qualified[name], config['modules'][name]
        need(type(module) is dict and type(module.get('__source_bytes__')) is bytes
             and type(pin) is dict and set(pin) == {'repoFile', 'sha256', 'bytes'}
             and type(pin['repoFile']) is str and re.fullmatch('hetzner-native-[a-z0-9-]+[.]py', pin['repoFile'])
             and type(pin['bytes']) is int
             and 0 < pin['bytes'] <= 131072 and len(module['__source_bytes__']) == pin['bytes']
             and sha(module['__source_bytes__']) == pin['sha256'], 'METADATA_MODULE_PIN')
    return config


def directory_snapshot(path, library, deadline, expected=None, cap=16):
    bounded(deadline)
    root = library['directory'](path)
    try:
        info = os.fstat(root); before = metadata(info)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and stat.S_IMODE(info.st_mode) == 0o700, 'METADATA_CASE_DIRECTORY')
        names = []
        with os.scandir(root) as entries:
            for entry in entries:
                bounded(deadline); names.append(entry.name)
                need(len(names) <= cap, 'METADATA_CASE_MEMBERSHIP')
        need(expected is None or set(names) == set(expected), 'METADATA_CASE_MEMBERSHIP')
        fresh = library['directory'](path)
        try:
            need(before == metadata(os.fstat(root)) == metadata(os.fstat(fresh)), 'METADATA_CASE_DIRECTORY_CHANGED')
        finally: os.close(fresh)
        return {'metadata': before, 'members': sorted(names)}
    finally: os.close(root)


def diagnostic_record(raw, binding, kind):
    row = dict.fromkeys(('state', 'sha256', 'bytes', 'metadata', 'source_status', 'phase', 'code',
        'exception_type', 'errno', 'mount_state', 'last_acknowledged_step', 'anchor_attempt_count',
        'anchor_created_count'))
    row['state'] = 'ABSENT'
    if raw is None: return row
    row.update(state='UNKNOWN', sha256=binding['sha256'], bytes=len(raw), metadata=binding['metadata'])
    if kind in ('component_attempt', 'component_receipt_pending', 'component_receipt'):
        row['state'] = 'UNKNOWN_UNACCEPTED'
        return row
    try:
        value, _ = unique_json(raw)
        need(type(value) is dict, 'METADATA_DIAGNOSTIC_UNKNOWN')
        semantic = {}
        if kind in ('namespace_error', 'job_error'):
            need(value.get('status') == 'FAIL_KEEP_STATE_NO_RETRY' and value.get('phase') == 'context'
                 and value.get('native_qualified') is False and value.get('native_go_consumed') is False
                 and value.get('code') in JOB_ERROR_CODES
                 and (kind != 'namespace_error' or value.get('code') == 'WORKER_FAILED'), 'METADATA_DIAGNOSTIC_UNKNOWN')
            semantic.update(source_status=value['status'], phase='context', code=value['code'])
            if kind == 'job_error':
                need(set(value) == {'schema', 'status', 'phase', 'code', 'exception_type', 'errno',
                     'native_qualified', 'native_go_consumed'}
                     and value['schema'] == 'helmut-setup-service-error-v1'
                     and value['exception_type'] in EXCEPTION_TYPES
                     and (value['errno'] is None or type(value['errno']) is int and -4095 <= value['errno'] <= 4095),
                     'METADATA_DIAGNOSTIC_UNKNOWN')
                semantic.update(exception_type=value['exception_type'], errno=value['errno'])
        elif kind == 'component_error':
            need(set(value) == {'status', 'phase', 'code', 'exceptionType', 'errno', 'case_id',
                'globalEmptyAnchorsCreated', 'globalAnchorAttempts', 'mountState', 'lastAcknowledgedStep',
                'nativeQualified', 'nativeGOConsumed'}
                and value['status'] == 'FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY'
                and value['phase'] in ('preflight', 'attempt', 'private-mounts') and value['code'] in CONTEXT_ERROR_CODES
                and value['exceptionType'] in EXCEPTION_TYPES and value['case_id'] in (None, CASE)
                and (value['errno'] is None or type(value['errno']) is int and -4095 <= value['errno'] <= 4095)
                and value['mountState'] == ('UNKNOWN' if value['phase'] == 'private-mounts' else 'NOT_STARTED')
                and (value['lastAcknowledgedStep'] is None or type(value['lastAcknowledgedStep']) is int
                     and -1 <= value['lastAcknowledgedStep'] <= 10)
                and value['nativeQualified'] is False and value['nativeGOConsumed'] is False,
                'METADATA_DIAGNOSTIC_UNKNOWN')
            for key in ('globalEmptyAnchorsCreated', 'globalAnchorAttempts'):
                need(type(value[key]) is list and len(value[key]) <= 3 and len(set(value[key])) == len(value[key])
                     and all(item in ('/workspace', '/opt/codex', '/opt/helmut-public-pr942') for item in value[key]),
                     'METADATA_DIAGNOSTIC_UNKNOWN')
            semantic.update(source_status=value['status'], phase=value['phase'], code=value['code'],
                exception_type=value['exceptionType'], errno=value['errno'], mount_state=value['mountState'],
                last_acknowledged_step=value['lastAcknowledgedStep'],
                anchor_attempt_count=len(value['globalAnchorAttempts']),
                anchor_created_count=len(value['globalEmptyAnchorsCreated']))
        else:
            raise Stop('METADATA_DIAGNOSTIC_UNKNOWN')
        row.update(state='PRESENT', **semantic)
    except (Stop, ValueError, UnicodeError, RecursionError, TypeError):
        pass
    return row


def failed_unit_snapshot(job, arm, guard, successor, library, deadline):
    # Quiescence is positive kernel evidence, independent of systemd GC or the
    # exact normal/signal exit accounting. This is not an execution admission.
    nonce = RETAINED['failed_nonce']; name = guard['unit_name'](nonce)
    def quiescent():
        need(guard['boot_id']() == job['boot_id'], 'METADATA_FAILED_BOOT_CHANGED')
        successor['require_controller_ended'](job, guard)
        successor['require_controller_ended']({'controller': arm['worker']}, guard)
        # The immediately preceding legacy runtime_snapshot proved the fixed
        # cgroup2 mount/parents and namespace. This enumerates the full own group.
        return successor['old_cgroup_empty'](name, guard, library['metadata'])
    before = quiescent()
    path = '/org/freedesktop/systemd1/unit/' + name.replace('-', '_2d').replace('.', '_2e')
    def query(interface, key, signature, kind):
        raw = guard['command'](['/usr/bin/busctl', '--system', '--json=short', 'get-property',
            'org.freedesktop.systemd1', path, 'org.freedesktop.systemd1.' + interface, key], deadline)
        value, _ = unique_json(raw)
        need(type(value) is dict and set(value) == {'type', 'data'} and value['type'] == signature
             and type(value['data']) is kind, 'METADATA_UNIT_DBUS_TYPE')
        return value['data']
    def snapshot():
        values = {}
        for interface, key, signature, kind in (('Unit','Id','s',str), ('Unit','ActiveState','s',str),
            ('Unit','SubState','s',str), ('Unit','ControlGroup','s',str), ('Service','MainPID','u',int),
            ('Service','ControlPID','u',int), ('Service','ExecMainPID','u',int),
            ('Service','KillMode','s',str), ('Service','Restart','s',str),
            ('Service','ExecStart','a(sasbttttuii)',list)):
            values[key] = query(interface,key,signature,kind)
        command = values['ExecStart']
        need(values['Id'] == name and values['MainPID'] == values['ControlPID'] == 0
             and values['ExecMainPID'] == arm['worker']['pid']
             and values['ActiveState'] in ('active','inactive','failed')
             and values['SubState'] in ('exited','dead','failed')
             and values['ControlGroup'] in ('','/system.slice/'+name)
             and values['KillMode'] == 'control-group' and values['Restart'] == 'no'
             and len(command) == 1 and type(command[0]) is list and len(command[0]) == 10
             and command[0][0] == '/usr/bin/env'
             and command[0][1] == guard['worker_argv'](nonce,NAMESPACE) and command[0][2] is False,
             'METADATA_FAILED_UNIT_UNKNOWN')
        return values
    state, digest = 'UNKNOWN_UNIT_OBSERVATION', None
    try:
        fields = snapshot()
        guard['unit_hooks'](name,deadline)
        need(snapshot() == fields, 'METADATA_FAILED_UNIT_CHANGED')
        state,digest = 'LOADED_QUIESCENT',sha(encoded(fields))
    except FileNotFoundError:
        # A missing fixed observer is unknown, not an absent unit or empty Exec.
        pass
    except BaseException as error:
        # Get-property on a GC-collected object can fail. No LoadUnit/systemctl
        # show/start is attempted. Other parse/identity/deadline/limit errors stop.
        if type(error).__name__ != 'Stop' or str(error) != 'CONTROL_COMMAND_FAILED': raise
    need(quiescent() == before, 'METADATA_FAILED_CGROUP_CHANGED')
    return {'state':state,'sha256':digest,'cgroup':before}


def verify_setup_baseline(config, qualified, deadline):
    # A new read-only closure for this retained failure. No old checker is
    # weakened, monkeypatched, or presented with a failed job as ACCEPTED.
    bounded(deadline)
    library, successor, preflight = (qualified[key] for key in ('library', 'successor', 'preflight'))
    guard, driver = qualified['guard.py'], qualified['driver.py']
    profile = config['retained_failure']
    assets = {key: qualified[key]['__source_bytes__'] for key in library['FILES']}
    expected, asset_set = library['asset_pins']()
    need(asset_set == config['asset_set_sha256'], 'METADATA_SETUP_ASSETS')
    for name, raw in assets.items():
        need(expected[name] == {'sha256': sha(raw), 'bytes': len(raw)}, 'METADATA_SETUP_ASSETS')
    context = {'base': BASE, 'source_sha256': config['setup_server_sha256'],
               'deployment_commit': config['setup_deployment_commit'], 'deadline': deadline}
    state_path = BASE + '/' + NAMESPACE
    captures = {}
    def capture(label, parent, name, cap=16384, mode=0o600):
        raw, binding = successor['read_bound'](parent, name, library, deadline, cap, mode)
        captures[label] = binding
        return raw
    authority_raw = capture('authority', BASE, successor['AUTHORITY'])
    need(sha(authority_raw) == profile['authority_sha256'], 'METADATA_AUTHORITY_BINDING')
    authority = successor['parsed'](authority_raw)
    need(type(authority) is dict and authority.get('source_sha256') == context['source_sha256']
         and authority.get('deployment_commit') == context['deployment_commit']
         and authority.get('contract_sha256') == config['contract_sha256'], 'METADATA_AUTHORITY_BINDING')
    capsule = {'inspection_nonce': authority['inspection_nonce'],
               'inspection_result_sha256': authority['inspection_result_sha256']}
    report, inspection_binding = successor['saved_inspection'](capsule, context, config['contract_sha256'], asset_set, library, deadline)
    need(authority_raw == successor['encoded'](successor['authority_value'](authority['admitted_by_nonce'],
        capsule, context, config['contract_sha256'], asset_set, report, inspection_binding)), 'METADATA_AUTHORITY_BINDING')
    authority_sha = sha(authority_raw)
    once_raw = capture('once', BASE + '/once', successor['ONCE'])
    need(once_raw == encoded({'schema': 'helmut-setup-successor-once-v1', 'contract_id': NAMESPACE,
        'authority_sha256': authority_sha, 'state': 'ADMITTED_FIXED_FOUR_PHASES_NO_REARM'}), 'METADATA_ONCE_BINDING')
    history = preflight['collect_history'](deadline)
    need(preflight['history_summary'](history) == authority['history']
         and successor['runtime_snapshot'](history, guard, library, deadline) == authority['runtime'], 'METADATA_HISTORICAL_DRIFT')
    state_names = {'jobs', 'FIRST_ERROR.PRIVATE.json', 'ATTEMPT_RECOVER.PRIVATE.json',
        'ATTEMPT_CHECKOUT.PRIVATE.json', 'ATTEMPT_CONTEXT.PRIVATE.json'}
    state_names |= {library['marker_name'](phase) for phase in PHASES[:2]} | {successor['seal_name'](phase) for phase in PHASES[:2]}
    captures['state_directory'] = directory_snapshot(state_path, library, deadline, state_names)
    nonces = {profile[phase]['nonce'] for phase in PHASES[:2]} | {profile['failed_nonce']}
    captures['jobs_directory'] = directory_snapshot(state_path + '/jobs', library, deadline, nonces)
    accepted = []
    for index, phase in enumerate(PHASES[:2]):
        fixed = profile[phase]
        raw = capture('accepted:' + phase, state_path, library['marker_name'](phase))
        need(sha(raw) == fixed['accepted_sha256'], 'METADATA_ACCEPTED_BINDING')
        marker = successor['parsed'](raw)
        need(type(marker) is dict and set(marker) == {'schema', 'phase', 'controller_source_sha256', 'asset_set_sha256',
            'nonce', 'ready_sha256', 'guard_result_sha256', 'lifecycle_sha256', 'bindings', 'native_qualified', 'native_go_consumed'}
            and marker['schema'] == 'helmut-target-setup-accepted-v1' and marker['phase'] == phase
            and marker['controller_source_sha256'] == context['source_sha256'] and marker['asset_set_sha256'] == asset_set
            and marker['nonce'] == fixed['nonce'] and marker['ready_sha256'] == fixed['ready_sha256']
            and marker['lifecycle_sha256'] == fixed['lifecycle_sha256']
            and marker['native_qualified'] is False and marker['native_go_consumed'] is False, 'METADATA_ACCEPTED_BINDING')
        library['bindings_check'](marker['bindings'], library['COUNTS'][index])
        value = {'status': library['SUCCESS'], 'phase': phase, 'ready_sha256': marker['ready_sha256'],
                 'native_qualified': False, 'native_go_consumed': False, 'bindings': marker['bindings']}
        need(marker['guard_result_sha256'] == sha(encoded(value))
             and driver['bindings'](tuple(marker['bindings'])) == marker['bindings']
             and driver['read'](driver['paths']()[library['PRIMARY'][index]])[1]['sha256'] == marker['ready_sha256'],
             'METADATA_ACCEPTED_BINDING')
        if accepted: need(all(marker['bindings'].get(role) == row for role, row in accepted[-1][0]['bindings'].items()),
                          'METADATA_ACCEPTED_BINDING')
        attempt = capture('attempt:' + phase, state_path, 'ATTEMPT_' + phase.upper() + '.PRIVATE.json')
        need(attempt == encoded(successor['attempt_value'](phase, fixed['nonce'], authority_sha, config['contract_sha256'])),
             'METADATA_ATTEMPT_BINDING')
        capture('seal:' + phase, state_path, successor['seal_name'](phase))
        accepted.append((marker, sha(raw)))
    successor['verify_job_seals'](accepted, context, assets, expected, asset_set, authority_sha,
                                  config['contract_sha256'], guard, library, deadline)
    failed_nonce = profile['failed_nonce']
    attempt = capture('attempt:context', state_path, 'ATTEMPT_CONTEXT.PRIVATE.json')
    need(attempt == encoded(successor['attempt_value']('context', failed_nonce, authority_sha, config['contract_sha256'])),
         'METADATA_ATTEMPT_BINDING')
    response_raw = capture('failed_response', BASE + '/results', failed_nonce + '.json', 262144)
    need(sha(response_raw) == profile['failed_response_sha256'], 'METADATA_RETAINED_RESPONSE')
    response = successor['parsed'](response_raw)
    need(type(response) is dict and set(response) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256', 'result', 'result_sha256'}
         and response['schema'] == 'helmut-native-control-response-v1' and response['operation'] == 'admit'
         and response['nonce'] == failed_nonce and response['plan_sha256'] == guard['PLAN']
         and response['payload_sha256'] == context['source_sha256'] and encoded(response) == response_raw,
         'METADATA_RETAINED_RESPONSE')
    failure = successor['fail_result']('context', 'WORKER_FAILED', config['contract_sha256'])
    need(response['result'] == failure and response['result_sha256'] == profile['failed_result_sha256']
         == sha(encoded(failure)[:-1]), 'METADATA_RETAINED_RESPONSE')
    namespace_error = capture('namespace_error', state_path, 'FIRST_ERROR.PRIVATE.json')
    need(namespace_error == encoded(failure), 'METADATA_RETAINED_NAMESPACE_ERROR')
    job_path = state_path + '/jobs/' + failed_nonce
    job_directory = directory_snapshot(job_path, library, deadline, cap=15)
    names = set(job_directory['members'])
    required = set(assets) | {'JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'FIRST_ERROR.PRIVATE.json'}
    optional = {'ACK.PRIVATE.json', 'RESULT.PENDING.PRIVATE.json', 'RESULT.PRIVATE.json'}
    temps = names - required - optional
    need(required <= names and len(temps) <= 2
         and all(re.fullmatch(r'[.]setup-write-[a-f0-9]{32}[.]tmp', name) for name in temps), 'METADATA_FAILED_JOB_UNKNOWN')
    captures['failed_job_directory'] = job_directory
    job_raw = capture('failed_job', job_path, 'JOB.PRIVATE.json')
    job = successor['parsed'](job_raw)
    data = {'old_receipt_sha256': library['EXPECTED_OLD_RECEIPT'], 'recovery_ready_sha256': profile['recover']['ready_sha256'],
            'public_ready_sha256': profile['checkout']['ready_sha256'], 'context_ready_sha256': None}
    need(type(job) is dict and set(job) == {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
         'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets', 'job_namespace'}
         and job['schema'] == 'helmut-setup-service-job-successor-v1' and job['job_namespace'] == NAMESPACE
         and job['request'] == {'schema': 'helmut-native-control-request-v1', 'operation': 'admit', 'nonce': failed_nonce,
              'plan_sha256': guard['PLAN'], 'payload_sha256': context['source_sha256']}
         and job['controller_source_sha256'] == context['source_sha256'] and job['plan_sha256'] == guard['PLAN']
         and job['case_id'] == CASE and job['phase'] == 'context' and job['phase_data'] == data and job['assets'] == expected
         and type(job['deadline']) in (int, float) and math.isfinite(job['deadline']) and 0 < job['deadline'] < 2**53
         and type(job['runtime_seconds']) is int and 0 < job['runtime_seconds'] <= 295
         and type(job['controller']) is dict and set(job['controller']) == {'pid', 'start_ticks', 'namespace'}
         and all(type(job['controller'][key]) is int and job['controller'][key] > 1 for key in ('pid', 'start_ticks'))
         and type(job['controller']['namespace']) is list and len(job['controller']['namespace']) == 2
         and all(type(n) is int and 0 <= n < 2**64 for n in job['controller']['namespace'])
         and job['boot_id'] == authority['runtime']['boot_id']
         and job['controller']['namespace'] == authority['runtime']['namespace_identity'], 'METADATA_FAILED_JOB_BINDING')
    for name, source in assets.items():
        need(capture('failed_asset:' + name, job_path, name, 131072, 0o500) == source, 'METADATA_FAILED_JOB_SOURCE')
    arm_raw = capture('failed_arm', job_path, 'ARM.PRIVATE.json')
    arm = successor['parsed'](arm_raw)
    need(type(arm) is dict and set(arm) == {'schema', 'nonce', 'job_sha256', 'controller_source_sha256', 'worker'}
         and arm['schema'] == 'helmut-setup-service-arm-v1' and arm['nonce'] == failed_nonce
         and arm['job_sha256'] == sha(job_raw) and arm['controller_source_sha256'] == context['source_sha256']
         and type(arm['worker']) is dict and set(arm['worker']) == {'pid', 'start_ticks', 'namespace'}
         and all(type(arm['worker'][key]) is int and arm['worker'][key] > 1 for key in ('pid', 'start_ticks'))
         and type(arm['worker']['namespace']) is list and len(arm['worker']['namespace']) == 2
         and all(type(n) is int and 0 <= n < 2**64 for n in arm['worker']['namespace'])
         and arm['worker']['namespace'] == job['controller']['namespace'] and arm_raw == encoded(arm), 'METADATA_FAILED_ARM')
    job_error = capture('job_error', job_path, 'FIRST_ERROR.PRIVATE.json')
    # Optional handshake/output files remain UNACCEPTED even if present. Their
    # physical bytes/metadata and positive absence are part of the retained
    # snapshot; public all-null response hashes do not prove their absence.
    for name in sorted(optional):
        if name in names:
            capture('failed_optional:' + name, job_path, name)
        else:
            captures['failed_optional:' + name] = {'state': 'ABSENT'}
    allowed_temps = {encoded(guard['safe_error'](guard['Stop'](code), 'context')) for code in ('PHASE_FAILED', 'WORKER_FAILED')}
    for name in sorted(temps):
        need(capture('failed_temp:' + name, job_path, name) in allowed_temps, 'METADATA_FAILED_JOB_UNKNOWN')
    captures['failed_unit'] = failed_unit_snapshot(job, arm, guard, successor, library, deadline)
    records = {'namespace_error': diagnostic_record(namespace_error, captures['namespace_error'], 'namespace_error'),
               'job_error': diagnostic_record(job_error, captures['job_error'], 'job_error')}
    components = {'component_error': CONTEXT_BASE + '/NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json',
        'component_attempt': CONTEXT_BASE + '/NATIVE_CONTEXT_ATTEMPT.SAFE.json',
        'component_receipt_pending': CONTEXT_BASE + '/native-context-' + CASE + '/CONTEXT_RECEIPT.PENDING.SAFE.json',
        'component_receipt': CONTEXT_BASE + '/native-context-' + CASE + '/CONTEXT_RECEIPT.SAFE.json'}
    for label, path in components.items():
        if library['path_absent'](path):
            captures[label] = {'state': 'ABSENT'}; records[label] = diagnostic_record(None, None, label)
        else:
            # Source write_json uses O_EXCL before write: a zero-byte partial
            # is a present, bound UNKNOWN observation, never absent or ready.
            raw, binding = read_fixed(path, deadline, 16384, None, None, (0, 0), 0o600, allow_empty=True)
            captures[label] = binding
            records[label] = diagnostic_record(raw, captures[label], label)
    need(all(library['path_absent'](BASE + '/' + name) for name in ('BUDGET_IMAGE_IMPORT_ATTEMPT.SAFE.json',
        'BUDGET_IMAGE_IMPORT_FIRST_ERROR.PRIVATE.json', 'BUDGET_IMAGE_IMPORT_RECEIPT.PENDING.SAFE.json',
        'BUDGET_IMAGE_IMPORT_READY.SAFE.json')), 'METADATA_IMAGE_STATE_UNKNOWN')
    qualified['context.py']['recovery_stage_proof'](profile['recover']['ready_sha256'], library['EXPECTED_OLD_RECEIPT'])
    need(preflight['verify_history_unchanged'](history, deadline) is True, 'METADATA_HISTORICAL_DRIFT')
    need(directory_snapshot(state_path, library, deadline, state_names) == captures['state_directory']
         and directory_snapshot(state_path + '/jobs', library, deadline, nonces) == captures['jobs_directory']
         and directory_snapshot(job_path, library, deadline, cap=15) == job_directory, 'METADATA_CASE_DIRECTORY_CHANGED')
    successor['verify_job_seals'](accepted, context, assets, expected, asset_set, authority_sha,
                                  config['contract_sha256'], guard, library, deadline)
    baseline_sha = sha(encoded(captures))
    return {'baseline_sha256': baseline_sha, 'bindings': captures,
        'partial_setup_proof': {'schema': 'helmut-runtime-metadata-partial-setup-proof-v1',
            'source_sha256': context['source_sha256'], 'deployment_commit': context['deployment_commit'],
            'contract_sha256': config['contract_sha256'], 'asset_set_sha256': asset_set, 'authority_sha256': authority_sha,
            'once_sha256': sha(once_raw), 'accepted_sha256': {phase: profile[phase]['accepted_sha256'] for phase in PHASES[:2]},
            'job_seal_sha256': {phase: captures['seal:' + phase]['sha256'] for phase in PHASES[:2]},
            'accepted_phases': list(PHASES[:2]), 'failed_phase': 'context', 'failed_nonce': failed_nonce,
            'failed_response_sha256': sha(response_raw), 'failed_result_sha256': response['result_sha256'],
            'failed_job_sha256': sha(job_raw), 'baseline_sha256': baseline_sha,
            'failed_unit_state': captures['failed_unit']['state'],
            'native_qualified': False, 'native_go_consumed': False},
        'failure_diagnostic': {'schema': 'helmut-context-retained-failure-diagnostic-v1',
            'status': 'RETAINED_CONTEXT_FAILURE_NOT_READY', 'failed_phase': 'context', 'failed_nonce': failed_nonce,
            'coordinator_code': 'WORKER_FAILED', 'records': records, 'native_qualified': False, 'native_go_consumed': False}}


def source_row(deadline):
    raw, binding = read_fixed(SCOPE_FILE, deadline, 2 * 1024**2, None, SCOPE_SHA, (0, 0), 0o600)
    scope, _ = unique_json(raw)
    need(type(scope) is dict and scope.get('schema') == 'helmut-encrypted-transport-scope-v4'
         and type(scope.get('items')) is list and len(scope['items']) == 1767
         and type(scope.get('regularFileCount')) is int and scope['regularFileCount'] == 1767,
         'METADATA_SOURCE_SCOPE')
    rows = [row for row in scope['items'] if type(row) is dict and row.get('archiveMember') == MEMBER]
    need(len(rows) == 1, 'METADATA_SOURCE_ROW')
    row = rows[0]
    need(row.get('path') == '/' + MEMBER[len('files/'):] and row.get('bytes') == FILE_BYTES
         and type(row.get('bytes')) is int and row.get('sha256') == FILE_SHA
         and type(row.get('uid')) is int and 0 <= row['uid'] < 2**32 - 1
         and type(row.get('gid')) is int and 0 <= row['gid'] < 2**32 - 1
         and type(row.get('mode')) is str and re.fullmatch('(?:0o)?[0-7]{1,4}', row['mode'])
         and 0 <= int(row['mode'], 8) <= 0o777, 'METADATA_SOURCE_ROW')
    return row, binding


def failure(code, context, chunk_index):
    if type(code) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
        code = 'METADATA_IO_OR_FORMAT'
    return {'schema': 'helmut-runtime-binding-metadata-read-v1', 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED',
        'contract_id': CONTRACT_ID, 'contract_sha256': CONTRACT_SHA256,
        'source_sha256': context.get('source_sha256') if type(context) is dict and hex64(context.get('source_sha256')) else None,
        'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES,
        'chunk_index': chunk_index if type(chunk_index) is int and 0 <= chunk_index < CHUNKS else None,
        'code': code, 'data_base64': None, 'native_qualified': False, 'native_go_consumed': False}


def read_runtime_metadata(chunk_index, context, qualified):
    """Only wire selector: one integer chunk_index0..3. Context is trusted loader data."""
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'METADATA_ROOT_REQUIRED')
        need(type(chunk_index) is int and 0 <= chunk_index < CHUNKS, 'METADATA_CHUNK_INDEX')
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']),
             'METADATA_CONTEXT')
        deadline = context['deadline']; bounded(deadline)
        config = validate_config(qualified)
        before = verify_setup_baseline(config, qualified, deadline)
        row, scope_binding = source_row(deadline)
        raw, file_binding = read_fixed(LEAF, deadline, FILE_BYTES, FILE_BYTES, FILE_SHA,
                                       (row['uid'], row['gid']), int(row['mode'], 8))
        _, summary = unique_json(raw)
        need(source_row(deadline) == (row, scope_binding)
             and verify_setup_baseline(config, qualified, deadline) == before, 'METADATA_BASELINE_DRIFT')
        result = {'schema': 'helmut-runtime-binding-metadata-read-v1',
            'status': 'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY' if config['released_safe_sha256'] == FILE_SHA
                      else 'UNKNOWN_CONTENT_REVIEW_REQUIRED',
            'contract_id': CONTRACT_ID, 'contract_sha256': CONTRACT_SHA256, 'source_sha256': context['source_sha256'],
            'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES, 'file_binding': file_binding,
            'scope_sha256': scope_binding['sha256'], 'source_row_sha256': sha(encoded(row)),
            'partial_setup_proof': before['partial_setup_proof'], 'failure_diagnostic': before['failure_diagnostic'],
            'chunk_index': chunk_index, 'chunk_count': CHUNKS, 'chunk_size': CHUNK_BYTES,
            'chunk_sha256': None, 'data_base64': None, 'json_summary': summary,
            'native_qualified': False, 'native_go_consumed': False}
        if config['released_safe_sha256'] == FILE_SHA:
            chunk = raw[chunk_index * CHUNK_BYTES:(chunk_index + 1) * CHUNK_BYTES]
            result.update(chunk_sha256=sha(chunk), data_base64=base64.b64encode(chunk).decode('ascii'))
        need(len(encoded(result)) <= OUTPUT_CAP, 'METADATA_OUTPUT_LIMIT')
        bounded(deadline)
        return result
    except BaseException as error:
        code = getattr(error, 'code', None)
        if type(code) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
            code = 'METADATA_IO_OR_FORMAT'
        return failure(code, context, chunk_index)


CONTRACT_SHA256 = sha(encoded(SETUP_CONFIG))


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
