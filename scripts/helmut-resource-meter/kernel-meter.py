#!/usr/bin/env python3
"""Local Docker/cgroup-v2 meter. Never starts a Helmut workflow by default.

The unique parent survives removal of its container child cgroups, so reading
memory.peak/cpu.stat after populated=0 covers the last instruction and exit.
Docker daemon and Codex launch/control are infrastructure; every workload,
observer and runtime helper must execute inside the measured container(s).
No memory cap, heap size, CPU affinity or application safety rule is changed.
"""
import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
from pathlib import Path

DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
IMAGE = 'sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e'
NODE_ROOT = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node')
PYTHON_ROOT = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python')
REPOSITORY = Path('/workspace/helmut-cpu-epoch-20261015')
CGROUP_ROOT = Path('/sys/fs/cgroup')


def docker(args, *, timeout=30, check=True):
    return subprocess.run(DOCKER + args, capture_output=True, text=True,
                          timeout=timeout, check=check)


def save_new(path, value):
    path = Path(path)
    with path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)


def validated_parent(parent):
    if not re.fullmatch(r'helmut-meter-[a-z0-9-]{8,100}(?:/[a-z0-9-]{1,40})?', parent):
        raise ValueError('invalid dedicated parent')
    return CGROUP_ROOT / parent


def key_values(path):
    result = {}
    for line in path.read_text().splitlines():
        key, value = line.split()
        result[key] = int(value)
    return result


def kernel_snapshot(parent, *, require_empty=False):
    group = validated_parent(parent)
    before = group.stat(follow_symlinks=False)
    if group.resolve() != group or not stat.S_ISDIR(before.st_mode):
        raise RuntimeError('canonical kernel group required')
    events = key_values(group / 'cgroup.events')
    if require_empty and events['populated'] != 0:
        raise RuntimeError('workflow group still populated; exit coverage open')
    children = [str(p.relative_to(group)) for p in group.rglob('cgroup.procs')
                if p.read_text().strip()]
    result = {
        'parent': parent,
        'memoryPeakBytes': int((group / 'memory.peak').read_text()),
        'memoryCurrentBytes': int((group / 'memory.current').read_text()),
        'memoryEvents': key_values(group / 'memory.events'),
        'cpu': key_values(group / 'cpu.stat'),
        'events': events,
        'populatedSubgroups': children,
        'ioStatRawNumericOnly': (group / 'io.stat').read_text().strip(),
        'fullLastProcessExitCovered': False,
        'scope': 'All descendants charged to dedicated kernel group; no RSS polling substitution',
    }
    # A process may enter after the first events read. Final exit coverage needs
    # another membership/events observation AFTER reading the charged counters.
    final_children = [str(p.relative_to(group)) for p in group.rglob('cgroup.procs')
                      if p.read_text().strip()]
    final_events = key_values(group / 'cgroup.events')
    after = group.stat(follow_symlinks=False)
    if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
        raise RuntimeError('kernel group identity changed during snapshot')
    if require_empty and (children or final_children or final_events['populated'] != 0):
        raise RuntimeError('workflow group became populated; exit coverage open')
    result.update(finalEvents=final_events, finalPopulatedSubgroups=final_children,
                  groupIdentity={'device': after.st_dev, 'inode': after.st_ino},
                  fullLastProcessExitCovered=require_empty and not children and not final_children
                  and final_events['populated'] == 0)
    return result


PRESSURE_SCHEMA = 'helmut-kernel-pressure-snapshot/1'
PRESSURE_DELTA_SCHEMA = 'helmut-kernel-pressure-delta/1'
PRESSURE_READ_LIMIT = 16384
RECLAIM_COUNTERS = ('pgscan', 'pgsteal', 'pgscan_direct', 'pgscan_kswapd',
                    'pgsteal_direct', 'pgsteal_kswapd', 'pgfault', 'pgmajfault',
                    'workingset_refault_anon', 'workingset_refault_file')
_pressure_observer = None


def _pressure_uint(value):
    if not re.fullmatch(r'(?:0|[1-9][0-9]{0,19})', value) or int(value) > 2**64 - 1:
        raise ValueError('invalid unsigned kernel counter')
    return int(value)


def _pressure_source(kind, reason):
    counters = RECLAIM_COUNTERS if kind == 'reclaim' else ('someTotalUsec', 'fullTotalUsec')
    return {'status': 'UNKNOWN', 'reason': reason,
            'counters': dict.fromkeys(counters)}


def _pressure_file(directory_fd, name):
    """Read at most the fixed metadata cap; never block on a substituted FIFO."""
    descriptor = None
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=directory_fd)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            return None, 'NOT_REGULAR'
        chunks, size = [], 0
        while size <= PRESSURE_READ_LIMIT:
            chunk = os.read(descriptor, min(4096, PRESSURE_READ_LIMIT + 1 - size))
            if not chunk:
                return b''.join(chunks).decode('ascii'), None
            chunks.append(chunk)
            size += len(chunk)
        return None, 'READ_LIMIT_EXCEEDED'
    except FileNotFoundError:
        return None, 'MISSING_FILE'
    except PermissionError:
        return None, 'ACCESS_DENIED'
    except UnicodeDecodeError:
        return None, 'INVALID_ENCODING'
    except OSError:
        return None, 'READ_ERROR'
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _pressure_parse(text, kind):
    result = _pressure_source(kind, 'MISSING_COUNTER')
    try:
        rows = text.splitlines()
        if not rows or len(rows) > 256:
            raise ValueError('bounded nonempty counter rows required')
        values = {}
        for line in rows:
            if kind == 'reclaim':
                match = re.fullmatch(r'([a-z][a-z0-9_]{0,63}) ([0-9]+)', line)
                if not match or match[1] in values:
                    raise ValueError('invalid counter row')
                values[match[1]] = _pressure_uint(match[2])
            else:
                match = re.fullmatch(r'(some|full) avg10=([0-9]+\.[0-9]{2}) '
                                     r'avg60=([0-9]+\.[0-9]{2}) '
                                     r'avg300=([0-9]+\.[0-9]{2}) total=([0-9]+)', line)
                if (not match or match[1] in values
                        or any(float(match[i]) > 100 for i in (2, 3, 4))):
                    raise ValueError('invalid PSI row')
                values[match[1]] = _pressure_uint(match[5])
        result['counters'] = {key: values.get(key if kind == 'reclaim' else
                                            key.removesuffix('TotalUsec'))
                              for key in result['counters']}
        if all(value is not None for value in result['counters'].values()):
            result.update(status='OBSERVED', reason=None)
        return result
    except (ValueError, OverflowError):
        return _pressure_source(kind, 'MALFORMED_COUNTERS')


def pressure_snapshot(parent):
    """Opt-in numeric observation only; existing kernel_snapshot is unchanged.

    Sequential reads are not atomic. The monotonic bracket includes reading and
    parsing costs, excluding final report serialization. Missing or malformed
    data is UNKNOWN, never an invented zero or a timing/reserve acceptance.
    """
    global _pressure_observer
    begin = time.monotonic_ns()
    group = validated_parent(parent)
    if _pressure_observer is None or _pressure_observer['pid'] != os.getpid():
        _pressure_observer = {'pid': os.getpid(), 'nonce': os.urandom(16).hex()}
    sources = {key: _pressure_source(key, 'GROUP_UNAVAILABLE')
               for key in ('memory', 'io', 'reclaim')}
    identity, directory_fd = None, None
    try:
        if group.resolve() != group:
            raise ValueError('canonical group required')
        directory_fd = os.open(group, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        info = os.fstat(directory_fd)
        identity = {'device': info.st_dev, 'inode': info.st_ino}
        for key, name in (('memory', 'memory.pressure'), ('io', 'io.pressure'),
                          ('reclaim', 'memory.stat')):
            text, reason = _pressure_file(directory_fd, name)
            sources[key] = _pressure_source(key, reason) if reason else _pressure_parse(text, key)
        current = group.stat(follow_symlinks=False)
        if (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError('group identity changed')
    except (OSError, ValueError):
        identity = None
        sources = {key: _pressure_source(key, 'GROUP_UNAVAILABLE_OR_CHANGED') for key in sources}
    finally:
        if directory_fd is not None:
            os.close(directory_fd)
    end = time.monotonic_ns()
    if end < begin:
        sources = {key: _pressure_source(key, 'CLOCK_REGRESSION') for key in sources}
    return {'schema': PRESSURE_SCHEMA, 'parent': parent, 'groupIdentity': identity,
            'observerIdentity': dict(_pressure_observer),
            'monotonicBeginNS': begin, 'monotonicEndNS': end,
            'observationElapsedNS': end - begin if end >= begin else None,
            'status': 'OBSERVED' if identity and all(source['status'] == 'OBSERVED'
                                                     for source in sources.values()) else 'UNKNOWN',
            'sources': sources, 'snapshotsAtomic': False,
            'observationOverheadIncluded': True, 'reportSerializationIncluded': False,
            'countersNotAdditive': True, 'notUnit60OrReserveEvidence': True}


def pressure_delta(before, after):
    """Validate two same-observer/group samples; reset/unknown means no deltas."""
    deltas = {key: dict.fromkeys(RECLAIM_COUNTERS if key == 'reclaim' else
                                ('someTotalUsec', 'fullTotalUsec'))
              for key in ('memory', 'io', 'reclaim')}
    result = {'schema': PRESSURE_DELTA_SCHEMA, 'status': 'UNKNOWN', 'reason': None,
              'intervalMinimumNS': None, 'intervalMaximumNS': None, 'counterDeltas': deltas,
              'snapshotsAtomic': False, 'observationOverheadIncluded': True,
              'countersNotAdditive': True, 'notUnit60OrReserveEvidence': True}
    try:
        expected_keys = {'schema', 'parent', 'groupIdentity', 'observerIdentity',
                         'monotonicBeginNS', 'monotonicEndNS', 'observationElapsedNS',
                         'status', 'sources', 'snapshotsAtomic', 'observationOverheadIncluded',
                         'reportSerializationIncluded', 'countersNotAdditive', 'notUnit60OrReserveEvidence'}
        for sample in (before, after):
            if not isinstance(sample, dict) or set(sample) != expected_keys or sample['schema'] != PRESSURE_SCHEMA:
                raise ValueError('INVALID_SNAPSHOT')
            for field in ('monotonicBeginNS', 'monotonicEndNS', 'observationElapsedNS'):
                if type(sample[field]) is not int or sample[field] < 0:
                    raise ValueError('INVALID_SNAPSHOT')
            if (sample['monotonicEndNS'] < sample['monotonicBeginNS']
                    or sample['observationElapsedNS'] != sample['monotonicEndNS'] - sample['monotonicBeginNS']
                    or sample['snapshotsAtomic'] is not False
                    or sample['observationOverheadIncluded'] is not True
                    or sample['reportSerializationIncluded'] is not False
                    or sample['countersNotAdditive'] is not True
                    or sample['notUnit60OrReserveEvidence'] is not True):
                raise ValueError('INVALID_SNAPSHOT')
            validated_parent(sample['parent'])
            if sample['status'] != 'OBSERVED' or sample['groupIdentity'] is None:
                raise ValueError('INCOMPLETE_SNAPSHOT')
            identity, observer = sample['groupIdentity'], sample['observerIdentity']
            if (not isinstance(identity, dict) or set(identity) != {'device', 'inode'}
                    or any(type(identity[key]) is not int or identity[key] < 0 for key in identity)
                    or identity['inode'] == 0 or not isinstance(observer, dict)
                    or set(observer) != {'pid', 'nonce'} or type(observer['pid']) is not int or observer['pid'] < 1
                    or not isinstance(observer['nonce'], str) or not re.fullmatch(r'[a-f0-9]{32}', observer['nonce'])
                    or not isinstance(sample['sources'], dict) or set(sample['sources']) != set(deltas)):
                raise ValueError('INVALID_SNAPSHOT')
            for key, counters in deltas.items():
                source = sample['sources'][key]
                if (not isinstance(source, dict) or set(source) != {'status', 'reason', 'counters'}
                        or source['status'] != 'OBSERVED' or source['reason'] is not None
                        or not isinstance(source['counters'], dict) or set(source['counters']) != set(counters)
                        or any(type(value) is not int or not 0 <= value <= 2**64 - 1
                               for value in source['counters'].values())):
                    raise ValueError('INCOMPLETE_OR_INVALID_COUNTERS')
        if before['parent'] != after['parent'] or before['groupIdentity'] != after['groupIdentity']:
            raise ValueError('GROUP_IDENTITY_CHANGED')
        if before['observerIdentity'] != after['observerIdentity']:
            raise ValueError('CLOCK_DOMAIN_CHANGED')
        if after['monotonicBeginNS'] < before['monotonicEndNS']:
            raise ValueError('NON_MONOTONIC_OR_OVERLAPPING_OBSERVATIONS')
        if any(after['sources'][key]['counters'][counter] < before['sources'][key]['counters'][counter]
               for key, counters in deltas.items() for counter in counters):
            raise ValueError('COUNTER_RESET')
        result.update(status='OBSERVED', intervalMinimumNS=after['monotonicBeginNS'] - before['monotonicEndNS'],
                      intervalMaximumNS=after['monotonicEndNS'] - before['monotonicBeginNS'])
        result['counterDeltas'] = {
            key: {counter: after['sources'][key]['counters'][counter] - before['sources'][key]['counters'][counter]
                  for counter in counters} for key, counters in deltas.items()}
    except (ValueError, TypeError, KeyError) as error:
        reasons = {'INVALID_SNAPSHOT', 'INCOMPLETE_SNAPSHOT', 'INCOMPLETE_OR_INVALID_COUNTERS',
                   'GROUP_IDENTITY_CHANGED', 'CLOCK_DOMAIN_CHANGED',
                   'NON_MONOTONIC_OR_OVERLAPPING_OBSERVATIONS', 'COUNTER_RESET'}
        result['reason'] = str(error) if type(error) is ValueError and str(error) in reasons else 'INVALID_SNAPSHOT'
    return result


def initialize_parent(parent, name):
    group = validated_parent(parent)
    if group.exists():
        raise RuntimeError('parent already exists; never reuse previous peak or run')
    # Docker creates the new parent atomically when the FIRST REAL owned
    # process starts. No bootstrap sentinel contaminates peak/CPU counters.
    return {'parent':parent,'didNotExistBeforeFirstOwnedStart':True,
            'bootstrapProcessesStarted':0}


def common_mounts(out):
    paths = [(str(NODE_ROOT), str(NODE_ROOT), True),
             (str(PYTHON_ROOT), str(PYTHON_ROOT), True),
             (str(REPOSITORY), str(REPOSITORY), True),
             (str(out), '/meter-output', False)]
    args = []
    for source, destination, readonly in paths:
        args += ['--mount', 'type=bind,src=' + source + ',dst=' + destination
                 + (',readonly' if readonly else '')]
    return args


def run_probe(out, name, parent, node_code, *, expected_exit=0):
    """Small isolated synthetic program, no Helmut fixtures/DB/profile access."""
    out = Path(out).resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    # Exclusive durable marker precedes any new container/process creation.
    save_new(out / 'STARTED.SAFE.json', {'kind': 'SMALL_METER_CASE_ONLY',
             'name': name, 'parent': parent, 'full500Run': False,
             'expectedExitCode': expected_exit, 'oneAttempt': True})
    before = initialize_parent(parent, name + '-bootstrap')
    args = ['create', '--name', name, '--cgroup-parent=/' + parent,
            '--network', 'none', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', str(os.getuid()) + ':' + str(os.getgid()),
            '--entrypoint', str(NODE_ROOT / 'bin/node')]
    args += common_mounts(out)
    args += [IMAGE, '-e', node_code]
    cid = docker(args).stdout.strip()
    started = time.monotonic_ns()
    docker(['start', cid])
    status = docker(['wait', cid], timeout=120).stdout.strip()
    exit_code = int(status)
    after = kernel_snapshot(parent, require_empty=True)
    log = docker(['logs', cid])
    raw_log = (log.stdout + log.stderr).encode()
    (out / 'PROCESS_OUTPUT.PRIVATE.log').write_bytes(raw_log)
    (out / 'PROCESS_OUTPUT.PRIVATE.log').chmod(0o600)
    inspected = json.loads(docker(['inspect', '--format',
        '{{json .HostConfig}}', cid]).stdout)
    if inspected['CgroupParent'] != '/' + parent:
        raise RuntimeError('actual Docker cgroup parent mismatch')
    result = {'kind': 'SMALL_METER_CASE_ONLY', 'full500Run': False,
              'name': name, 'containerId': cid, 'exitCode': exit_code,
              'expectedExitCode': expected_exit, 'exitMatches': exit_code == expected_exit,
              'wallMS': (time.monotonic_ns() - started) / 1e6,
              'baseline': before, 'final': after,
              'wholeCPUUsec': after['cpu']['usage_usec'],
              'stdoutAndStderrBytes': len(raw_log),
              'stdoutAndStderrSHA256': hashlib.sha256(raw_log).hexdigest(),
              'applicationMemoryCapChanged': False,
              'applicationCPUOptionsChanged': False,
              'sourceOrProductionChanges': False}
    save_new(out / 'RESULT.SAFE.json', result)
    if not result['exitMatches']:
        raise RuntimeError('unexpected case exit; preserve and do not rerun')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['read-empty-group'])
    parser.add_argument('--parent', required=True)
    args = parser.parse_args()
    print(json.dumps(kernel_snapshot(args.parent, require_empty=True)))


if __name__ == '__main__':
    main()
