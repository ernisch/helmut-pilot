"""Closed failure metadata only; no IO, observations or execution authority."""
import sys
sys.dont_write_bytecode = True

REASONS = frozenset(('PARENT_READBACK_REJECTED', 'SUPERVISOR_DEADLINE',
    'SUPERVISOR_INTERRUPTED', 'SUPERVISOR_REJECTED', 'WORKER_START_REJECTED',
    'WORKER_SETUP_REJECTED', 'WORKER_INTERRUPTED', 'WORKER_RESULT_REJECTED', 'WORKER_CLEANUP_UNCONFIRMED',
    'WORKER_IPC_EOF', 'WORKER_IPC_TIMEOUT', 'WORKER_IPC_REJECTED',
    'WORKER_EXIT_WITHOUT_REPORT', 'WORKER_SIGNAL_EXIT', 'WORKER_EXIT_REJECTED', 'WORKER_REPORTED_FAILURE',
    'SERVICE_IPC_EOF', 'SERVICE_IPC_TIMEOUT', 'SERVICE_IPC_REJECTED',
    'SERVICE_EXIT_WITHOUT_REPORT', 'SERVICE_EXIT_REJECTED',
    'PARENT_CLOSURE_REJECTED', 'CLEANUP_UNCONFIRMED', 'SIGNAL_DURING_CLEANUP'))
MEMORY_SOURCES = frozenset(('CURRENT_REJECTED_READBACK', 'CACHED_READBACK', 'POST_FAILURE_READBACK'))
CLEANUP_KEYS = frozenset(('workerExited', 'workerIPCClosed', 'parentStopRequested',
    'parentEmpty', 'parentUnitRemoved', 'serviceLauncherExited', 'launcherListenerClosed',
    'launcherSignalsRestored'))
STATES = frozenset(('PASS', 'FAIL', 'UNKNOWN'))
OBSERVED_PHASES = frozenset(('arguments', 'event', 'approval', 'qualification', 'binding', 'resources',
    'synthetic', 'receive-prepare', 'restore', 'end500', 'backup', 'closure')) | frozenset(
    'connection-' + name for name in ('binding', 'receive', 'input-binding', 'cache', 'prepare',
        'restore', 'closure', 'prepared-check', 'materialization', 'container-start', 'readiness',
        'native-restore', 'backup', 'restore-create', 'restore-roles', 'restore-render', 'restore-apply',
        'restore-check', 'export-backup-before', 'export-backup-dump', 'export-backup-roles', 'export-backup-after')) | frozenset(
    'receiver-' + name for name in ('arguments', 'source-binding', 'private-inputs', 'index', 'disk-admission',
        'key-import', 'encrypted-index', 'download', 'cipher-readback', 'authenticated-reception', 'relocation', 'agent-close')) | frozenset(
    prefix + name for prefix in ('', 'connection-') for name in ('backup-export', 'backup-freeze',
        'backup-collect', 'backup-seal', 'backup-transport', 'backup-authenticate', 'backup-recovery', 'backup-postcheck'))
OBSERVED_PHASES |= frozenset('capacity-' + name for name in ('transport-complete', 'materialization', 'restore-ready', 'seed', 'seed-ready', 'auth-cas', 'native-audit', 'export', 'processing-stopped'))
MAX_PHASE_FRAMES = 128
NATIVE_STAGES = frozenset(('UNKNOWN', 'setup', 'journal-ready', 'database-preflight', 'command-read', 'command-decode',
    'command-freeze', 'server-import', 'auth-read', 'auth-fixture', 'auth-baseline', 'observer-install', 'auth-mutate',
    'auth-durable-ack', 'auth-readback', 'auth-postimage', 'processing-contract', 'final-native-sample', 'final-node-sample',
    'journal-close', 'report-write'))
NATIVE_ACTIONS = {'assertion': 'INSPECT_NAMED_CHECK', 'atomic-read-invalid': 'INSPECT_ATOMIC_READ_BINDING',
    'store-read-invalid': 'INSPECT_AUTH_ROW_BINDING', 'storage-timeout': 'INSPECT_LOCAL_STORAGE_TIMEOUT',
    'storage-http-error': 'INSPECT_STORAGE_PERMISSION_OR_RPC', 'transport-error': 'INSPECT_LOCAL_TRANSPORT',
    'durable-io-error': 'INSPECT_DURABLE_OBSERVATION', 'module-load-error': 'INSPECT_STAGED_CODE_DEPENDENCIES',
    'aborted': 'INSPECT_OWNED_STOP', 'unknown': 'INSPECT_FIXED_STAGE'}
NATIVE_CODES = frozenset(('UNKNOWN', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_ABORTED', 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ABORT_ERR', 'ENOTFOUND',
    'W15_DURABLE_QUEUE_OVERFLOW', 'W15_DURABLE_WRITE_FAILED', 'W15_DURABLE_SYNC_FAILED', 'W15_DURABLE_DEADLINE', 'W15_DURABLE_CLOSED',
    'W15_DURABLE_SERIALIZE_FAILED', 'W15_DURABLE_OBSERVER_FAILED', 'W15_DURABLE_CLOSE_FAILED'))
NATIVE_CHECKS = frozenset(('UNKNOWN', 'w15-forward-readonly-sql', 'w15-forward-common-input-binding', 'w15-forward-command-binding',
    'w15-forward-command-shape', 'w15-forward-auth-usage-count', 'w15-forward-auth-fixture', 'w15-forward-auth-baseline-bytes',
    'w15-forward-auth-baseline-budget', 'w15-forward-auth-workmem', 'w15-forward-no-second-native-write',
    'w15-forward-auth30-including-durable-observation', 'w15-forward-auth-revision', 'w15-forward-auth-sequence',
    'w15-forward-postimage', 'w15-forward-auth-coverage', 'w15-forward-stop-requested', 'w15-forward-disk-closure-reserve',
    'w15-forward-natural-major-gc', 'w15-forward-checkpoint-cycles', 'w15-forward-natural-autovacuum',
    'w15-forward-wal-footprint', 'w15-forward-wal-segments-not-recycled', 'w15-forward-native-auth-spill',
    'w15-forward-close-deadline', 'w15-forward-pending-operation-at-close', 'w15-forward-concurrent-operation'))


def native_failure(value):
    """First native failure, fixed vocabulary; never raw error text or private data."""
    keys = {'schema', 'stage', 'kind', 'code', 'causeCode', 'httpStatus', 'timeoutMs', 'check',
            'acknowledgedCAS', 'acknowledgedCASKind', 'writeOutcome', 'requiredAction'}
    if (type(value) is not dict or set(value) != keys
            or value['schema'] != 'helmut-w15-native-end500-failure/1'
            or type(value['stage']) is not str or value['stage'] not in NATIVE_STAGES
            or type(value['kind']) is not str or value['kind'] not in NATIVE_ACTIONS
            or any(type(value[k]) is not str or value[k] not in NATIVE_CODES for k in ('code', 'causeCode'))
            or type(value['check']) is not str or value['check'] not in NATIVE_CHECKS
            or value['writeOutcome'] != 'UNKNOWN' or value['requiredAction'] != NATIVE_ACTIONS[value['kind']]):
        return None
    for key, lower, upper in (('httpStatus', 400, 599), ('timeoutMs', 1, 20000), ('acknowledgedCAS', 0, 500)):
        if not (type(value[key]) is str and value[key] == 'UNKNOWN'
                or type(value[key]) is int and lower <= value[key] <= upper):
            return None
    if value['acknowledgedCASKind'] != ('UNKNOWN' if value['acknowledgedCAS'] == 'UNKNOWN' else 'CONFIRMED_LOWER_BOUND'):
        return None
    return dict(value)


def phase_observation(value):
    """Last entered phase received by the supervisor, never completion or cause."""
    if type(value) is str and value == 'UNKNOWN':
        return value
    if (type(value) is not dict or set(value) != {'name', 'sequence', 'meaning'}
            or type(value['name']) is not str or value['name'] not in OBSERVED_PHASES
            or type(value['sequence']) is not int or not 1 <= value['sequence'] <= MAX_PHASE_FRAMES
            or type(value['meaning']) is not str or value['meaning'] != 'ENTERED_NOT_COMPLETED'):
        return None
    return dict(value)


def attribute(value, name, default=None):
    try:
        return getattr(value, name, default)
    except BaseException:
        return default


def cleanup(value):
    if type(value) is not dict or set(value) != CLEANUP_KEYS or any(
            type(v) is not str or v not in STATES for v in value.values()):
        return None
    return dict(value)


def unknown_cleanup():
    return dict.fromkeys(CLEANUP_KEYS, 'UNKNOWN')


def runner(value, memory_validator):
    keys = {'reason', 'secondaryReason', 'memory', 'memorySource', 'workerExitCode', 'serviceExitCode', 'lastObservedPhase', 'nativeFailure'}
    if type(value) is not dict or not set(value) <= keys or type(value.get('reason')) is not str or value['reason'] not in REASONS:
        return None
    out = {'reason': value['reason']}
    if 'secondaryReason' in value:
        if type(value['secondaryReason']) is not str or value['secondaryReason'] not in REASONS:
            return None
        out['secondaryReason'] = value['secondaryReason']
    if 'memory' in value or 'memorySource' in value:
        memory = memory_validator(value.get('memory'))
        if memory is None or type(value.get('memorySource')) is not str or value['memorySource'] not in MEMORY_SOURCES:
            return None
        out.update(memory=memory, memorySource=value['memorySource'])
    for key in ('workerExitCode', 'serviceExitCode'):
        if key in value:
            if type(value[key]) is not int or not -255 <= value[key] <= 255:
                return None
            out[key] = value[key]
    observed = phase_observation(value.get('lastObservedPhase'))
    if observed is not None:
        out['lastObservedPhase'] = observed
    native = native_failure(value.get('nativeFailure'))
    if native is not None:
        out['nativeFailure'] = native
    return out


def public(value, phases, worker_phases, memory_validator):
    """Optional malformed metadata cannot erase an already known fixed phase."""
    if type(value) is not dict or not set(value) <= {'phase', 'worker', 'runner', 'cleanup'}:
        return None
    if type(value.get('phase')) is not str or value['phase'] not in phases:
        return None
    out = {'phase': value['phase']}
    worker = value.get('worker')
    if type(worker) is dict and set(worker) <= {'phase', 'memory'} and type(worker.get('phase')) is str and worker['phase'] in worker_phases:
        out['worker'] = {'phase': worker['phase']}
        memory = memory_validator(worker.get('memory'))
        if memory is not None:
            out['worker']['memory'] = memory
    detail = runner(value.get('runner'), memory_validator)
    if detail is not None:
        out['runner'] = detail
    closed = cleanup(value.get('cleanup'))
    if closed is not None:
        out['cleanup'] = closed
    return out
