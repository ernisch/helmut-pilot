"""Read standard-runner capabilities only; never bootstrap or start End500.

The fixed child commands only query systemd, identity and the local Docker
daemon. No child output or exception text is published. Capability observations
do not establish a fresh common parent, resource acceptance or start authority.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess

SYSTEMD = ('systemctl', '--system', '--no-pager', 'show', '--property=Version', '--value')
# Preserve the runner's Docker supplementary group in the read-only child only.
# No account/group membership is changed.
IDENTITY = ('sudo', '-n', '-P', '--user=#1000', '--group=#1000', '--', 'id')
DOCKER = ('sudo', '-n', '-P', '--user=#1000', '--group=#1000', '--', 'docker',
          '--host=unix:///var/run/docker.sock', 'info', '--format', '{{.CgroupDriver}} {{.CgroupVersion}}')
COMMANDS = (SYSTEMD, IDENTITY + ('-u',), IDENTITY + ('-g',), DOCKER)
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}
PASS, FAIL, UNKNOWN = 'PASS', 'FAIL', 'UNKNOWN'


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('PREFLIGHT_ARGUMENTS_REJECTED')


def query(argv):
    """The allowlist, timeout and environment also apply to sudo children."""
    if argv not in COMMANDS:
        raise ValueError('PREFLIGHT_COMMAND_REJECTED')
    try:
        result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=10, check=False,
                                env=ENV, close_fds=True, shell=False)
        if result.returncode != 0 or len(result.stdout) > 4096:
            return None
        return result.stdout.decode('ascii').strip()
    except (OSError, UnicodeError, subprocess.SubprocessError):
        return None


def cgroup_interfaces():
    """Observe the present kernel interfaces; do not write/reset any counter."""
    try:
        rows = Path('/proc/self/cgroup').read_text().strip().splitlines()
        if len(rows) != 1 or not rows[0].startswith('0::/'):
            return FAIL
        member = rows[0][3:]
        if any(part in ('.', '..', '') for part in member.split('/')[1:]) and member != '/':
            return FAIL
        root = Path('/sys/fs/cgroup')
        if 'memory' not in (root / 'cgroup.controllers').read_text().split():
            return FAIL
        current = root / member.lstrip('/')
        peak = (current / 'memory.peak').read_text().strip()
        swap = (current / 'memory.swap.max').read_text().strip()
        return PASS if re.fullmatch('[0-9]+', peak) and re.fullmatch('max|[0-9]+', swap) else UNKNOWN
    except (OSError, UnicodeError, ValueError):
        return UNKNOWN


def observe(runner_temp):
    checks = {'linux': PASS if platform.system() == 'Linux' else FAIL,
              'cgroupV2MemoryPeakAndSwapInterfaces': cgroup_interfaces()}
    try:
        checks['systemdPID1'] = PASS if Path('/proc/1/comm').read_text().strip() == 'systemd' else FAIL
    except (OSError, UnicodeError):
        checks['systemdPID1'] = UNKNOWN
    version = query(SYSTEMD)
    checks['systemdManagerQuery'] = UNKNOWN if version is None else (
        PASS if re.fullmatch(r'[0-9][A-Za-z0-9.+~:\-]*', version) else FAIL)
    for flag, key in (('-u', 'sudoObservedUID1000'), ('-g', 'sudoObservedGID1000')):
        value = query(IDENTITY + (flag,))
        checks[key] = UNKNOWN if value is None else (PASS if value == '1000' else FAIL)
    try:
        socket = Path('/var/run/docker.sock').lstat()
        checks['rootOwnedRestrictedDockerSocket'] = PASS if (
            stat.S_ISSOCK(socket.st_mode) and socket.st_uid == 0
            and stat.S_IMODE(socket.st_mode) & 0o007 == 0) else FAIL
    except OSError:
        checks['rootOwnedRestrictedDockerSocket'] = UNKNOWN
    docker = query(DOCKER)
    checks['uid1000LocalDockerSystemdCgroupV2'] = UNKNOWN if docker is None else (
        PASS if docker == 'systemd 2' else FAIL)
    free = None
    try:
        if not isinstance(runner_temp, str) or not runner_temp.startswith('/'):
            raise ValueError('PREFLIGHT_ARGUMENTS_REJECTED')
        value = os.statvfs(runner_temp)
        free = value.f_bavail * value.f_frsize
        if type(free) is not int or free < 0:
            raise ValueError('PREFLIGHT_DISK_UNKNOWN')
        checks['runnerTempFilesystemObserved'] = PASS
    except (OSError, ValueError, OverflowError):
        free = None
        checks['runnerTempFilesystemObserved'] = UNKNOWN
    result = summary(checks)
    result['observedFreeDiskBytes'] = free
    return result


def summary(checks):
    return {'status': 'RUNNER_CAPABILITIES_OBSERVED_START_BLOCKED', 'readiness': 'BLOCKED',
            'checks': checks, 'capabilitiesObserved': bool(checks) and all(v == PASS for v in checks.values()),
            'commonBootstrapObserved': False, 'uidConversionPerformed': False,
            'fullRestoreCapacityAccepted': False, 'commonLifetimeMemoryAccepted': False,
            'executionAuthority': False, 'testStarted': False, 'authCalls': 0,
            'end500Acceptance': False, 'mock500Acceptance': False}


def main(argv=None):
    try:
        parser = Parser(description=__doc__, allow_abbrev=False, add_help=False)
        parser.add_argument('--observe-runner-only', action='store_true', required=True)
        parser.add_argument('--runner-temp', required=True)
        args = parser.parse_args(argv)
        # Reject invalid paths before any child query, and never publish the path.
        if not args.runner_temp.startswith('/'):
            raise ValueError('PREFLIGHT_ARGUMENTS_REJECTED')
        result = observe(args.runner_temp)
        code = 0 if result['capabilitiesObserved'] else 1
    except (Exception, KeyboardInterrupt):
        result = summary({'probeCompleted': UNKNOWN})
        result['status'] = 'RUNNER_CAPABILITY_PROBE_UNAVAILABLE_START_BLOCKED'
        result['observedFreeDiskBytes'] = None
        code = 1
    print(json.dumps(result, separators=(',', ':'), allow_nan=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
