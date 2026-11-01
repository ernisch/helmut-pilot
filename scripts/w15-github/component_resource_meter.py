"""Passive reads of existing, explicitly declared separate cgroup-v2 subtrees.

The caller attests component semantics; the kernel confirms only membership and
identity. A gateway is never guessed to be an application. Declare every role
sharing a PID: an application plus harness in one PID cannot be split here.
No poller, process, resource write, limit, acceptance or production authority.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import re
import time

SPEC = importlib.util.spec_from_file_location('w15_existing_component_readers', Path(__file__).with_name('memory_components.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
R = M.R
UNKNOWN, UNLIMITED = 'UNKNOWN', 'UNLIMITED'
ROLES = ('application', 'database', 'test-tools', 'backup')
MAX_GROUPS, MAX_BINDINGS, MAX_DEPTH, MAX_OUTPUT_BYTES = 16, 128, 8, 65536
EVENTS = ('low', 'high', 'max', 'oom', 'oom_kill', 'oom_group_kill')
CPU_FIELDS = ('usage_usec', 'user_usec', 'system_usec', 'nr_periods', 'nr_throttled', 'throttled_usec')
MEMORY_FIELDS = ('currentBytes', 'kernelLifetimePeakBytes', 'maximumBytes', 'swapCurrentBytes', 'swapMaximumBytes')


def _need(value):
    if not value: raise ValueError('COMPONENT_RESOURCE_OBSERVATION_UNKNOWN')


def _identity(value):
    _need(type(value) in (tuple, list) and len(value) == 2
          and all(type(n) is int and 0 <= n <= M.MAX_NUMBER for n in value))
    return tuple(value)


def _actual(fd):
    s = os.fstat(fd)
    return s.st_dev, s.st_ino


def _groups(parent, rows):
    _need(type(rows) in (tuple, list) and len(rows) <= MAX_GROUPS)
    result, slots, identities = [], set(), set()
    total_bindings = 0
    for row in rows:
        _need(type(row) is dict and set(row) == {'role', 'instanceId', 'absolutePath', 'identity', 'processBindings'})
        role, instance = row['role'], row['instanceId']
        _need(type(role) is str and role in ROLES and type(instance) is int
              and (1 <= instance <= M.MAX_NUMBER if role == 'application' else instance == 0))
        slot, identity = (role, instance), _identity(row['identity'])
        path = Path(row['absolutePath'])
        _need(path.is_absolute() and str(path) == str(row['absolutePath']) and '..' not in path.parts)
        parts = path.relative_to(parent).parts
        _need(0 < len(parts) <= MAX_DEPTH and slot not in slots and identity not in identities)
        _need(all(not (path == old['path'] or path in old['path'].parents or old['path'] in path.parents) for old in result))
        declared = row['processBindings']
        _need(type(declared) in (tuple, list))
        total_bindings += len(declared); _need(total_bindings <= MAX_BINDINGS)
        bindings, ambiguous = {}, False
        for item in declared:
            _need(type(item) is dict and set(item) == {'pid', 'startTicks', 'role'}
                  and type(item['pid']) is int and 1 < item['pid'] <= M.MAX_NUMBER
                  and type(item['startTicks']) is int and 0 < item['startTicks'] <= M.MAX_NUMBER
                  and type(item['role']) is str and item['role'] in ROLES)
            ambiguous |= item['pid'] in bindings or item['role'] != role
            bindings[item['pid']] = (item['startTicks'], item['role'])
        result.append({'slot': slot, 'path': path, 'parts': parts, 'identity': identity,
                       'bindings': bindings, 'ambiguous': ambiguous})
        slots.add(slot); identities.add(identity)
    return result


def _open_group(parent_fd, parts, expected):
    fd = os.dup(parent_fd); parent = os.fstat(parent_fd)
    try:
        for part in parts:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
            s = os.fstat(fd)
            _need(s.st_dev == parent.st_dev and s.st_uid == parent.st_uid)
        _need(_actual(fd) == expected)
        return fd
    except BaseException:
        os.close(fd); raise


def _maximum(fd, name):
    try:
        value = M._read(fd, name).strip()
        return UNLIMITED if value == 'max' else M._number(value)
    except Exception: return UNKNOWN


def _fields(fd, name, names):
    result = dict.fromkeys(names, UNKNOWN)
    try:
        seen = set()
        for line in M._read(fd, name).splitlines():
            fields = line.split()
            if fields and fields[0] in result:
                _need(len(fields) == 2 and fields[0] not in seen)
                result[fields[0]] = M._number(fields[1]); seen.add(fields[0])
        return result
    except Exception: return dict.fromkeys(names, UNKNOWN)


def _cpu_max(fd):
    try:
        fields = M._read(fd, 'cpu.max').split(); _need(len(fields) == 2)
        quota = UNLIMITED if fields[0] == 'max' else M._number(fields[0])
        period = M._number(fields[1]); _need(period > 0 and (quota == UNLIMITED or quota > 0))
        return {'quotaUsec': quota, 'periodUsec': period}
    except Exception: return {'quotaUsec': UNKNOWN, 'periodUsec': UNKNOWN}


def _cpuset(fd):
    try:
        raw = M._read(fd, 'cpuset.cpus.effective').strip()
        _need(0 < len(raw) <= 256 and re.fullmatch(r'[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*', raw))
        previous = -1
        for part in raw.split(','):
            ends = [M._number(n) for n in part.split('-')]
            _need(len(ends) <= 2 and previous < ends[0] <= ends[-1]); previous = ends[-1]
        return raw
    except Exception: return UNKNOWN


def _pressure(fd, name):
    try: return R.capacity().pressure(M._read(fd, name))
    except Exception: return UNKNOWN


def _kernel(fd):
    return {'memory': dict(zip(MEMORY_FIELDS, (M._safe_number(fd, 'memory.current'),
        M._safe_number(fd, 'memory.peak'), _maximum(fd, 'memory.max'),
        M._safe_number(fd, 'memory.swap.current'), _maximum(fd, 'memory.swap.max')))),
        'memoryEvents': _fields(fd, 'memory.events', EVENTS), 'memoryStat': M._memory_stat(fd),
        'cpuStat': _fields(fd, 'cpu.stat', CPU_FIELDS), 'cpuMaximum': _cpu_max(fd),
        'effectiveCpuset': _cpuset(fd), 'memoryPressure': _pressure(fd, 'memory.pressure'),
        'cpuPressure': _pressure(fd, 'cpu.pressure')}


def _processes(pids, group):
    result = {}
    for pid in sorted(pids):
        fd = M._open_process(pid)
        try: result[pid] = M._identity(fd, group)
        finally: os.close(fd)
    return result


def _unknown(reason='UNBOUND_OR_UNREADABLE'):
    return {'schema': 'helmut-w15-component-resource-observation/1',
        'status': 'UNKNOWN_COMPONENT_RESOURCE_OBSERVATION', 'reason': reason,
        'groups': [], 'unboundRoles': list(ROLES), 'unassignedParentProcessCount': UNKNOWN,
        'assignmentBasis': 'CALLER_DECLARATION_AND_KERNEL_MEMBERSHIP_NOT_CODE_SEMANTICS',
        'memoryUnit': 'BYTES', 'cpuCounterUnit': 'MICROSECONDS', 'pressureAverageUnit': 'HUNDREDTH_PERCENT',
        'snapshotAtomic': False, 'peakCompositionKnown': False,
        'differentPeaksAdditive': False, 'fileCacheAdditiveToPSS': False,
        'vercelActualConsumption': UNKNOWN, 'wholeSupabaseMicroConsumption': UNKNOWN,
        'executionAuthority': False, 'resourceContractAccepted': False, 'activePolling': False}


class Meter:
    """Caller-owned bounded history only. Call from an existing sampler, if approved.

    App instanceId is an opaque positive integer, never a deployment/name/URL.
    processBindings must declare every semantic role sharing a PID. A mixed or
    incomplete assignment retains raw cgroup counters but classifies no component.
    The parser limits are not provider capacity or allowed instance counts.
    """
    def __init__(self):
        self._previous = {}

    def _delta(self, group, counters, observed, kernel_peak):
        slot = group['slot']
        identity = (group['parentIdentity'], group['identity'], str(group['path']))
        previous = self._previous.get(slot)
        status, delta, elapsed, peak_monotonic = UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN
        if previous is not None:
            if previous['identity'] == identity and type(kernel_peak) is int and type(previous['peak']) is int:
                peak_monotonic = kernel_peak >= previous['peak']
            if previous['identity'] != identity: status = 'IDENTITY_CHANGED'
            elif previous['drift']: status = 'COUNTER_DECREASED'
            elif peak_monotonic is False: status = 'COUNTER_DECREASED'
            elif any(type(counters[k]) is int and type(previous['counters'][k]) is int
                     and counters[k] < previous['counters'][k] for k in CPU_FIELDS): status = 'COUNTER_DECREASED'
            elif observed > previous['time']:
                status = 'NONE_OBSERVED'; elapsed = observed - previous['time']
                delta = {k: counters[k] - previous['counters'][k] if type(counters[k]) is int
                    and type(previous['counters'][k]) is int else UNKNOWN for k in CPU_FIELDS}
        self._previous[slot] = {'identity': identity, 'counters': counters.copy(), 'time': observed, 'peak': kernel_peak,
                                'drift': status == 'COUNTER_DECREASED'}
        usage = delta.get('usage_usec') if type(delta) is dict else UNKNOWN
        return {'counterIdentityDrift': status, 'kernelLifetimePeakMonotonic': peak_monotonic,
                'elapsedNS': elapsed, 'counterDeltas': delta,
                'usageLogicalCPUs': round(usage * 1000 / elapsed, 6) if type(usage) is int and type(elapsed) is int else UNKNOWN}

    def observe(self, parent, expected_identity, groups):
        result, parent_fd, opened = _unknown(), None, []
        try:
            parent = Path(parent); expected = _identity(expected_identity)
            declared = _groups(parent, groups)
            _need(declared)
            parent_fd = R._kernel_directory(parent); _need(_actual(parent_fd) == expected)
            before = M._inventory(parent_fd)
            samples, seen = [], set()
            now = time.monotonic_ns()
            for group in declared:
                fd = _open_group(parent_fd, group['parts'], group['identity']); opened.append(fd)
                pids = M._inventory(fd)
                _need(not seen.intersection(pids) and pids <= before and len(seen | pids) <= MAX_BINDINGS)
                seen.update(pids)
                member = '/' + str(group['path'].relative_to(R.KERNEL_ROOT))
                identities = None
                try: identities = _processes(pids, member)
                except Exception: pass
                raw = _kernel(fd)
                stable = M._inventory(fd) == pids
                try: stable = stable and identities is not None and _processes(pids, member) == identities
                except Exception: stable = False
                assigned = stable and not group['ambiguous'] and set(group['bindings']) == pids
                if assigned:
                    assigned = all(identities[pid][0] == binding[0] for pid, binding in group['bindings'].items())
                row = {'declaredRole': group['slot'][0], 'instanceId': group['slot'][1],
                    'classifiedRole': group['slot'][0] if assigned else UNKNOWN,
                    'assignment': 'DECLARED_SEPARATE_GROUP_OBSERVED' if assigned else UNKNOWN,
                    'pidInventoryStable': stable, 'uniqueObservedPids': len(pids),
                    'observedMonotonicNS': now, 'observedKernel': raw}
                group['parentIdentity'] = expected
                group['_pids'], group['_processIdentities'] = pids, identities
                row['cpuInterval'] = self._delta(group, raw['cpuStat'], now, raw['memory']['kernelLifetimePeakBytes']) if stable else {
                    'counterIdentityDrift': UNKNOWN, 'kernelLifetimePeakMonotonic': UNKNOWN,
                    'elapsedNS': UNKNOWN, 'counterDeltas': UNKNOWN, 'usageLogicalCPUs': UNKNOWN}
                if not stable: self._previous.pop(group['slot'], None)
                samples.append(row)
            parent_stable = M._inventory(parent_fd) == before
            for group, fd, row in zip(declared, opened, samples):
                check = _open_group(parent_fd, group['parts'], group['identity'])
                os.close(check); _need(_actual(fd) == group['identity'])
                try:
                    stable = parent_stable and M._inventory(fd) == group['_pids'] and group['_processIdentities'] is not None
                    stable = stable and _processes(group['_pids'], '/' + str(group['path'].relative_to(R.KERNEL_ROOT))) == group['_processIdentities']
                except Exception: stable = False
                if not stable:
                    row.update(classifiedRole=UNKNOWN, assignment=UNKNOWN, pidInventoryStable=False)
                    row['cpuInterval'] = {'counterIdentityDrift': UNKNOWN, 'kernelLifetimePeakMonotonic': UNKNOWN, 'elapsedNS': UNKNOWN,
                                          'counterDeltas': UNKNOWN, 'usageLogicalCPUs': UNKNOWN}
                    self._previous.pop(group['slot'], None)
            check = R._kernel_directory(parent)
            try: _need(_actual(check) == expected)
            finally: os.close(check)
            present = {row['declaredRole'] for row in samples if row['classifiedRole'] != UNKNOWN}
            result.update(status='OBSERVED_SEPARATE_CGROUP_COUNTERS_ONLY' if all(row['classifiedRole'] != UNKNOWN for row in samples)
                else 'PARTIAL_COMPONENT_RESOURCE_OBSERVATION', reason='NO_ACCEPTANCE', groups=samples,
                unboundRoles=[role for role in ROLES if role not in present],
                unassignedParentProcessCount=len(before - seen) if parent_stable else UNKNOWN)
            _need(len(json.dumps(result, separators=(',', ':'), allow_nan=False).encode()) <= MAX_OUTPUT_BYTES)
            self._previous = {slot: value for slot, value in self._previous.items() if slot in {g['slot'] for g in declared}}
            return result
        except Exception:
            self._previous.clear()
            return _unknown()
        finally:
            for fd in opened: os.close(fd)
            if parent_fd is not None: os.close(parent_fd)


def observe(parent, expected_identity, groups):
    """Single stateless sample. Use a retained Meter for later CPU intervals."""
    return Meter().observe(parent, expected_identity, groups)
