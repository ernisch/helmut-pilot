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
    events = key_values(group / 'cgroup.events')
    if require_empty and events['populated'] != 0:
        raise RuntimeError('workflow group still populated; exit coverage open')
    children = [str(p.relative_to(group)) for p in group.rglob('cgroup.procs')
                if p.read_text().strip()]
    return {
        'parent': parent,
        'memoryPeakBytes': int((group / 'memory.peak').read_text()),
        'memoryCurrentBytes': int((group / 'memory.current').read_text()),
        'memoryEvents': key_values(group / 'memory.events'),
        'cpu': key_values(group / 'cpu.stat'),
        'events': events,
        'populatedSubgroups': children,
        'ioStatRawNumericOnly': (group / 'io.stat').read_text().strip(),
        'fullLastProcessExitCovered': require_empty and events['populated'] == 0,
        'scope': 'All descendants charged to dedicated kernel group; no RSS polling substitution',
    }


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
