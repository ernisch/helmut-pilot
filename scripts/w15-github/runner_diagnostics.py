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
    keys = {'reason', 'secondaryReason', 'memory', 'memorySource', 'workerExitCode', 'serviceExitCode'}
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
