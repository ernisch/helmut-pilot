"""Optional, read-only snapshots of an EXISTING W15 parent; no run authority.

Process PSS and cgroup charges are separate views. Never add file cache to PSS
or interpret either view as the composition of the kernel lifetime peak.
No caller, poller, guard, CLI activation or process-name guess is installed.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import re
import time

SPEC = importlib.util.spec_from_file_location('w15_component_parent_files', Path(__file__).with_name('common_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
PROC_ROOT = Path('/proc')
UNKNOWN = 'UNKNOWN'
ROLES = ('postgresql', 'helmut-node', 'postgrest', 'controller-helpers', 'backup', 'unknown')
STAT_FIELDS = ('anon', 'file', 'kernel', 'shmem', 'file_dirty', 'file_writeback')
MAX_BYTES, MAX_PIDS, MAX_GROUPS = 65536, 128, 64
MAX_NUMBER = 2**53 - 1


def require(value):
    if not value:
        raise ValueError('COMPONENT_SNAPSHOT_UNAVAILABLE')


def _read(fd, name):
    child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    try:
        raw = os.read(child, MAX_BYTES + 1)
        require(len(raw) <= MAX_BYTES)
        return raw.decode('ascii')
    finally:
        os.close(child)


def _number(raw):
    require(type(raw) is str and re.fullmatch(r'[0-9]{1,16}', raw.strip()) is not None)
    value = int(raw)
    require(value <= MAX_NUMBER)
    return value


def _safe_number(fd, name):
    try:
        return _number(_read(fd, name))
    except Exception:
        return UNKNOWN


def _memory_stat(fd):
    values = dict.fromkeys(STAT_FIELDS, UNKNOWN)
    try:
        seen = set()
        for line in _read(fd, 'memory.stat').splitlines():
            fields = line.split()
            if fields and fields[0] in values:
                require(len(fields) == 2 and fields[0] not in seen)
                values[fields[0]] = _number(fields[1])
                seen.add(fields[0])
        return values
    except Exception:
        return dict.fromkeys(STAT_FIELDS, UNKNOWN)


def _inventory(parent_fd):
    """Unique thread-group PIDs from the parent AND its bounded descendants."""
    pending, pids, groups = [os.dup(parent_fd)], set(), 0
    try:
        while pending:
            fd = pending.pop()
            try:
                groups += 1
                require(groups <= MAX_GROUPS)
                pids.update(_number(x) for x in _read(fd, 'cgroup.procs').split())
                require(len(pids) <= MAX_PIDS and all(x > 1 for x in pids))
                with os.scandir(fd) as entries:
                    for entry in entries:
                        require(not entry.is_symlink())
                        if entry.is_dir(follow_symlinks=False):
                            require(len(pending) + groups < MAX_GROUPS)
                            child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                            if os.fstat(child).st_dev != os.fstat(parent_fd).st_dev:
                                os.close(child)
                                raise ValueError('COMPONENT_SNAPSHOT_UNAVAILABLE')
                            pending.append(child)
            finally:
                os.close(fd)
        return pids
    finally:
        for fd in pending:
            os.close(fd)


def _bindings(rows):
    require(type(rows) in (tuple, list) and len(rows) <= MAX_PIDS)
    result, collisions = {}, set()
    for row in rows:
        require(type(row) is dict and set(row) == {'pid', 'startTicks', 'role'}
                and type(row['pid']) is int and 1 < row['pid'] <= MAX_NUMBER
                and type(row['startTicks']) is int and 0 < row['startTicks'] <= MAX_NUMBER
                and type(row['role']) is str and row['role'] in ROLES)
        if row['pid'] in result:
            collisions.add(row['pid'])
        result[row['pid']] = row
    return result, collisions


def _identity(fd, parent):
    raw = _read(fd, 'stat')
    # comm may contain spaces and parentheses; starttime is field22 AFTER it.
    _, ending = raw.rsplit(')', 1)
    fields = ending.split()
    require(len(fields) >= 20)
    start = _number(fields[19])
    group = R.membership(_read(fd, 'cgroup'))
    require(group == parent or group.startswith(parent + '/'))
    return start, group


def _open_process(pid):
    root = os.open(PROC_ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        return os.open(str(pid), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
    finally:
        os.close(root)


def _pss(raw):
    """PSS divides shared mappings; RSS/Shared_* are deliberately not summed."""
    values = []
    for line in raw.splitlines():
        if line.startswith('Pss:'):
            fields = line.split()
            require(len(fields) == 3 and fields[2] == 'kB')
            value = _number(fields[1]) * 1024
            require(value <= MAX_NUMBER)
            values.append(value)
    require(len(values) == 1)
    return values[0]


def _process(pid, parent, binding, collision):
    result = {'role': 'unknown', 'pssBytes': UNKNOWN, 'startTicks': UNKNOWN, 'bound': False}
    try:
        fd = _open_process(pid)
        try:
            before = _identity(fd, parent)
            result['startTicks'] = before[0]
            if collision or binding is not None and before[0] != binding['startTicks']:
                return result
            if binding is not None:
                result.update(role=binding['role'], bound=binding['role'] != 'unknown')
            amount = _pss(_read(fd, 'smaps_rollup'))
            require(_identity(fd, parent) == before)
            result['pssBytes'] = amount
        finally:
            os.close(fd)
    except Exception:
        result['pssBytes'] = UNKNOWN
    return result


def _unknown():
    return {'status': 'UNKNOWN_OPTIONAL_MEMORY_DIAGNOSTIC',
            'common': dict.fromkeys(('currentBytes', 'kernelLifetimePeakBytes', 'configuredLimitBytes',
                'swapMaximumBytes', 'swapCurrentBytes', *STAT_FIELDS), UNKNOWN),
            'roles': {role: {'observedPSSBytes': UNKNOWN, 'completeComponentPSSBytes': UNKNOWN} for role in ROLES},
            'sameParentIdentityObserved': False, 'pidInventoryStable': False,
            'allObservedProcessesBound': False, 'allDeclaredProcessesObserved': False,
            'uniqueObservedPids': UNKNOWN,
            'roleBindingCollisions': UNKNOWN, 'snapshotAtomic': False,
            'fileCacheAdditiveToPSS': False, 'peakCompositionKnown': False,
            'hugetlbIncludedInPSS': 'NOT_GUARANTEED', 'observerOverheadBytes': UNKNOWN,
            'vercelActualMemoryBytes': UNKNOWN, 'resourceGuardAccepted': False,
            'executionAuthority': False}


def observe(parent, expected_identity, role_bindings):
    """One optional snapshot, explicitly called only by a later approved owner.

    Caller bindings are PID+startTicks+fixed role, never argv/environ guesses.
    An incomplete inventory makes all component subtotals UNKNOWN. A readable
    registered role can otherwise remain known when a different role is denied.
    PSS cannot include all hugetlb usage; this is never a complete RAM sum.
    Ordinary diagnostic failures return UNKNOWN; process signals are unchanged.
    """
    result, fd, started = _unknown(), None, time.monotonic_ns()
    try:
        require(type(expected_identity) in (tuple, list) and len(expected_identity) == 2
                and all(type(x) is int and x >= 0 for x in expected_identity))
        bindings, collisions = _bindings(role_bindings)
        parent = Path(parent)
        fd = R._kernel_directory(parent)
        expected = tuple(expected_identity)
        require((os.fstat(fd).st_dev, os.fstat(fd).st_ino) == expected)
        before = _inventory(fd)
        rows = {pid: _process(pid, '/' + parent.name, bindings.get(pid), pid in collisions) for pid in sorted(before)}
        after = _inventory(fd)
        stable = before == after
        # Reject a PID reused or moved after its own smaps read, without reading
        # cmdline, environ, SQL, logs or any application file.
        for pid, row in rows.items():
            try:
                process_fd = _open_process(pid)
                try:
                    require(_identity(process_fd, '/' + parent.name)[0] == row['startTicks'])
                finally:
                    os.close(process_fd)
            except Exception:
                row['pssBytes'] = UNKNOWN
                row.update(role='unknown', bound=False)
        common = {'currentBytes': _safe_number(fd, 'memory.current'),
                  'kernelLifetimePeakBytes': _safe_number(fd, 'memory.peak'),
                  'configuredLimitBytes': _safe_number(fd, 'memory.max'),
                  'swapMaximumBytes': _safe_number(fd, 'memory.swap.max'),
                  'swapCurrentBytes': _safe_number(fd, 'memory.swap.current'), **_memory_stat(fd)}
        check = R._kernel_directory(parent)
        try:
            require((os.fstat(check).st_dev, os.fstat(check).st_ino) == expected)
        finally:
            os.close(check)
        all_bound = stable and all(row['bound'] for row in rows.values())
        all_declared = stable and all(pid in rows and rows[pid]['bound']
            and rows[pid]['startTicks'] == binding['startTicks'] and pid not in collisions
            for pid, binding in bindings.items())
        complete = all_bound and all_declared
        result.update(common=common, sameParentIdentityObserved=True, pidInventoryStable=stable,
            uniqueObservedPids=len(before), roleBindingCollisions=len(collisions),
            allObservedProcessesBound=all_bound, allDeclaredProcessesObserved=all_declared)
        for role in ROLES:
            selected = [row['pssBytes'] for row in rows.values() if row['role'] == role]
            amount = sum(selected) if stable and all(type(n) is int for n in selected) else UNKNOWN
            if type(amount) is int and amount > MAX_NUMBER:
                amount = UNKNOWN
            if not selected and not complete:
                amount = UNKNOWN
            result['roles'][role] = {'observedPSSBytes': amount,
                'completeComponentPSSBytes': amount if complete else UNKNOWN}
        result['status'] = 'OBSERVED_OPTIONAL_MEMORY_DIAGNOSTIC'
        if (not complete or any(value == UNKNOWN for value in common.values())
                or any(row['observedPSSBytes'] == UNKNOWN for row in result['roles'].values())):
            result['status'] = 'PARTIAL_OPTIONAL_MEMORY_DIAGNOSTIC'
        return result
    except Exception:
        return result
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except Exception:
                pass
        result['observationElapsedNanoseconds'] = time.monotonic_ns() - started


def plan():
    return {'status': 'INERT_OPTIONAL_COMPONENT_DIAGNOSTIC_NOT_CONNECTED', 'roles': list(ROLES),
            'maximumReadBytes': MAX_BYTES, 'maximumPids': MAX_PIDS, 'maximumCgroups': MAX_GROUPS,
            'activePolling': False, 'resourceGuardsChanged': False, 'executionAuthority': False}


if __name__ == '__main__':
    print(json.dumps(plan(), sort_keys=True))
