"""Bounded read-only role bindings for an already attested owned container.

Caller attests Docker identity/labels and supplies its State.Pid. Names and
arguments never classify processes. Returned PID tuples are private inputs to
memory_components, not public telemetry. Ambiguous roles are simply omitted.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
from pathlib import Path
import re

SPEC = importlib.util.spec_from_file_location('w15_capacity_existing_components', Path(__file__).with_name('memory_components.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
NAMESPACE_ROLES = ('helmut-node', 'postgrest')


def _need(value):
    if not value: raise ValueError('CAPACITY_ROLE_BINDING_UNKNOWN')


def _container_group(group, container_id):
    return any(part in (container_id, 'docker-' + container_id + '.scope') for part in group.split('/'))


def _namespace_ids(raw, host_pid):
    rows, pids = [], []
    for line in raw.splitlines():
        if line.startswith('NSpid:'): rows.append(line.split()[1:])
        if line.startswith('Pid:'): pids.append(line.split()[1:])
    _need(len(rows) == 1 and 1 <= len(rows[0]) <= 16 and len(pids) == 1 and pids[0] == [str(host_pid)])
    values = tuple(M._number(value) for value in rows[0])
    _need(values[0] == host_pid and all(value > 0 for value in values))
    return values


def _record(pid, parent):
    fd = M._open_process(pid)
    try:
        before = M._identity(fd, parent)
        namespace = _namespace_ids(M._read(fd, 'status'), pid)
        _need(before[0] > 0 and M._identity(fd, parent) == before)
        return before[0], before[1], namespace
    finally:
        os.close(fd)


def bindings(parent_path, identity, postgres_host_pid, container_id, namespace_pids=None):
    """Reuse bounded cgroup/proc reads; no Docker call, monitor or new process.

    namespace_pids maps only helmut-node/postgrest to already read namespace
    PIDs. A stable attested PostgreSQL binding may survive unknown peer reads;
    namespace role matching additionally needs a complete stable inventory.
    Ordinary read/ownership failures yield [] without changing safety guards.
    """
    fd = None
    try:
        _need(type(identity) in (tuple, list) and len(identity) == 2
              and all(type(value) is int and value >= 0 for value in identity))
        _need(type(postgres_host_pid) is int and 1 < postgres_host_pid <= M.MAX_NUMBER
              and type(container_id) is str and re.fullmatch('[a-f0-9]{64}', container_id))
        namespace_pids = {} if namespace_pids is None else namespace_pids
        _need(type(namespace_pids) is dict and set(namespace_pids) <= set(NAMESPACE_ROLES)
              and all(type(value) is int and 1 < value <= M.MAX_NUMBER for value in namespace_pids.values()))
        parent_path = Path(parent_path)
        fd = M.R._kernel_directory(parent_path)
        expected = tuple(identity)
        _need((os.fstat(fd).st_dev, os.fstat(fd).st_ino) == expected)
        parent = '/' + parent_path.name
        before = M._inventory(fd)
        _need(len(before) <= M.MAX_PIDS and postgres_host_pid in before)
        postgres = _record(postgres_host_pid, parent)
        _need(_container_group(postgres[1], container_id) and len(postgres[2]) >= 2 and postgres[2][-1] == 1)
        rows, complete = {postgres_host_pid: postgres}, True
        for pid in sorted(before - {postgres_host_pid}):
            try:
                record = _record(pid, parent)
                if _container_group(record[1], container_id): rows[pid] = record
            except Exception:
                complete = False
        # Reopen process descriptors to reject PID reuse/movement, including a
        # newly ambiguous namespace match. No stale directory descriptor proves
        # that a current PID still denotes the same process.
        for pid, record in rows.items():
            try: _need(_record(pid, parent) == record)
            except Exception:
                if pid == postgres_host_pid: raise
                complete = False
        _need(M._inventory(fd) == before)
        check = M.R._kernel_directory(parent_path)
        try: _need((os.fstat(check).st_dev, os.fstat(check).st_ino) == expected)
        finally: os.close(check)
        result = [{'pid': postgres_host_pid, 'startTicks': postgres[0], 'role': 'postgresql'}]
        if complete:
            chosen = {}
            for role in NAMESPACE_ROLES:
                wanted = namespace_pids.get(role)
                if wanted is None: continue
                matches = [pid for pid, record in rows.items() if pid != postgres_host_pid
                    and len(record[2]) == len(postgres[2]) and record[2][-1] == wanted]
                if len(matches) == 1: chosen[role] = matches[0]
            for role, pid in chosen.items():
                if list(chosen.values()).count(pid) == 1:
                    result.append({'pid': pid, 'startTicks': rows[pid][0], 'role': role})
        _, collisions = M._bindings(result)
        _need(not collisions)
        return result
    except Exception:
        return []
    finally:
        if fd is not None: os.close(fd)
