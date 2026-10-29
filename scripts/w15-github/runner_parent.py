"""One secret-free GitHub runner topology probe; never import/start W15.

Only a fixed, already-local PostgreSQL image running /bin/sleep is permitted.
The runtime slice remains active until an outside reader observes all owned
children gone and reads its unchanged kernel lifetime counters. This is not an
End500 memory, database, input, backup, restore or execution acceptance.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import time
import uuid

SCRIPT = Path(__file__).absolute()
REPO = SCRIPT.parents[2]
SPEC = importlib.util.spec_from_file_location('w15_parent_resources', SCRIPT.with_name('common_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
IMAGE = 'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3'
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'}
DOCKER = ['/usr/bin/docker', '--host=unix:///var/run/docker.sock']
UNIT_ROOT = Path('/run/systemd/system')
INSPECT = ('{"id":{{json .Id}},"pid":{{json .State.Pid}},"running":{{json .State.Running}},'
           '"exit":{{json .State.ExitCode}},"parent":{{json .HostConfig.CgroupParent}},'
           '"memory":{{json .HostConfig.Memory}},"swap":{{json .HostConfig.MemorySwap}},'
           '"network":{{json .HostConfig.NetworkMode}},"image":{{json .Image}},"labels":{{json .Config.Labels}}}')


class ProbeError(RuntimeError):
    pass


class StopLatch:
    """First outer TERM enters finally; subsequent TERM cannot break cleanup."""
    def __init__(self):
        self.seen, self.cleaning = False, False
        self.previous = signal.getsignal(signal.SIGTERM)
        signal.signal(signal.SIGTERM, self.term)

    def term(self, signum, frame):
        first = not self.seen
        self.seen = True
        if first and not self.cleaning:
            raise KeyboardInterrupt

    def close(self):
        signal.signal(signal.SIGTERM, self.previous)


def require(value):
    if not value:
        raise ProbeError('RUNNER_PARENT_PROBE_REJECTED')


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ProbeError('RUNNER_PARENT_ARGUMENTS_REJECTED')


def command(argv, *, timeout=15, check=True):
    result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, env=ENV, timeout=timeout,
                            close_fds=True, shell=False)
    require(len(result.stdout) <= 65536)
    if check:
        require(result.returncode == 0)
    return result


def context(run_id, commit, nonce):
    require(isinstance(run_id, str) and re.fullmatch('[1-9][0-9]{4,19}', run_id)
            and isinstance(commit, str) and re.fullmatch('[a-f0-9]{40}', commit))
    value = uuid.UUID(nonce)
    require(str(value) == nonce and value.version == 4 and value.variant == uuid.RFC_4122)
    return {'runId': run_id, 'runAttempt': 1, 'nonce': nonce, 'exactCommit': commit}


def names(ctx):
    stem = 'w15_' + ctx['runId'] + '_' + uuid.UUID(ctx['nonce']).hex
    return stem + '.slice', stem + '_supervisor.service', stem + '_probe'


def process_env(ctx):
    return {**ENV, 'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': ctx['runId'], 'GITHUB_RUN_ATTEMPT': '1'}


def github_binding(run_id, commit):
    require(os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('GITHUB_RUN_ID') == run_id
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    head = command(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
                    '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(REPO),
                    '-C', str(REPO), 'rev-parse', 'HEAD']).stdout
    require(head == (commit + '\n').encode())
    # Both executable repository sources must equal raw blobs at the exact HEAD.
    for file in (SCRIPT, SCRIPT.with_name('common_resources.py')):
        relative = str(file.relative_to(REPO))
        result = command(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
                          '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(REPO), '-C', str(REPO),
                          'ls-tree', '-z', commit, '--', relative]).stdout
        header, name = result.rstrip(b'\x00').split(b'\t')
        mode, kind, digest = header.split()
        require(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() == relative
                and not file.is_symlink())
        raw = file.read_bytes()
        require(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest().encode() == digest)


def socket_gid():
    value = Path('/var/run/docker.sock').lstat()
    require(stat.S_ISSOCK(value.st_mode) and value.st_uid == 0 and value.st_gid > 0
            and stat.S_IMODE(value.st_mode) & 0o007 == 0)
    return value.st_gid


def identity(path):
    fd = R._kernel_directory(path)
    try:
        value = os.fstat(fd)
        return value.st_dev, value.st_ino
    finally:
        os.close(fd)


def read_parent(ctx, expected_identity, *, empty=False):
    path = R.KERNEL_ROOT / names(ctx)[0]
    fd = R._kernel_directory(path)
    try:
        value = os.fstat(fd)
        require((value.st_dev, value.st_ino) == expected_identity)
        def read(name):
            child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                raw = os.read(child, 8193)
                require(len(raw) <= 8192)
                return raw.decode('ascii').strip()
            finally:
                os.close(child)
        sample = {'configuredLimit': read('memory.max'), 'swapMaximum': read('memory.swap.max'),
                  'kernelLifetimePeakBytes': int(read('memory.peak')), 'currentBytes': int(read('memory.current')),
                  'swapCurrentBytes': int(read('memory.swap.current')),
                  'events': {k: int(v) for k, v in (row.split() for row in read('memory.events').splitlines())}}
        R.assess(sample)
        populated = dict(row.split() for row in read('cgroup.events').splitlines())['populated']
        if empty:
            require(populated == '0')
        return sample
    finally:
        os.close(fd)


def unit_bytes():
    return (b'[Unit]\nDescription=W15 secret-free parent topology probe\n'
            b'[Slice]\nMemoryAccounting=yes\nMemoryMax=2560000000\nMemorySwapMax=0\n')


def prepare_parent(ctx):
    require(os.getuid() == 0 and Path('/proc/1/comm').read_text().strip() == 'systemd')
    unit, _, _ = names(ctx)
    path = R.KERNEL_ROOT / unit
    require(not path.exists())
    fd = os.open(UNIT_ROOT / unit, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        raw = unit_bytes()
        require(os.write(fd, raw) == len(raw))
        os.fsync(fd)
    finally:
        os.close(fd)
    # Explicit unit definition and start avoid relying on implicit set-property
    # loading. No worker runs before the slice's actual limits are read back.
    try:
        command(['/usr/bin/systemctl', 'daemon-reload'])
        command(['/usr/bin/systemctl', 'start', unit])
        observed = identity(path)
        read_parent(ctx, observed, empty=True)
    except BaseException:
        # This invocation exclusively created the unit; a pre-existing unit
        # would already have failed O_EXCL and is never stopped or removed.
        remove_parent(ctx)
        raise


def remove_parent(ctx):
    require(os.getuid() == 0)
    unit, _, _ = names(ctx)
    file = UNIT_ROOT / unit
    value = file.lstat()
    require(stat.S_ISREG(value.st_mode) and value.st_uid == 0 and value.st_nlink == 1
            and stat.S_IMODE(value.st_mode) == 0o600 and file.read_bytes() == unit_bytes())
    command(['/usr/bin/systemctl', 'stop', unit], timeout=30)
    file.unlink()  # Only this exclusive, fixed-content transient probe unit.
    command(['/usr/bin/systemctl', 'daemon-reload'])


def inspect(container, *, check=True):
    result = command(DOCKER + ['inspect', '--format', INSPECT, container], check=check)
    return json.loads(result.stdout) if result.returncode == 0 else None


def container_labels(ctx):
    return {'helmut.w15.probe': 'parent-only', 'helmut.w15.run': ctx['runId'],
            'helmut.w15.nonce': ctx['nonce'], 'helmut.w15.commit': ctx['exactCommit']}


def container_owned(value, ctx, image):
    require(isinstance(value, dict) and isinstance(value.get('id'), str)
            and re.fullmatch('[a-f0-9]{64}', value['id'])
            and value.get('labels') == container_labels(ctx) and value.get('parent') == names(ctx)[0]
            and value.get('image') == image)


def stop_container(ctx, image):
    value = inspect(names(ctx)[2], check=False)
    if value is None:
        return
    # A random-looking name is not ownership. After a daemon/client timeout,
    # the fresh labels, fixed image and parent must still bind the exact ID.
    container_owned(value, ctx, image)
    owned_id = value['id']
    if value['running']:
        command(DOCKER + ['stop', '--time', '5', owned_id], timeout=12)
    value = inspect(owned_id)
    container_owned(value, ctx, image)
    require(value['id'] == owned_id and value['running'] is False and value['pid'] == 0)
    # Preserve the stopped synthetic container; no rm, volume or evidence purge.


def worker(ctx):
    require(os.getuid() == os.getgid() == 1000 and os.getgroups() == [socket_gid()])
    unit, _, container = names(ctx)
    resources = R.observe(ctx)
    root_pid = os.getppid()
    resources.check_pid(root_pid)
    image = command(DOCKER + ['image', 'inspect', '--format', '{{.Id}}', IMAGE]).stdout.decode().strip()
    require(re.fullmatch('sha256:[a-f0-9]{64}', image))
    require(inspect(container, check=False) is None)
    wait = None
    try:
        command(DOCKER + ['run', '-d', '--name', container, '--pull=never', '--network=none',
                          '--restart=no', '--read-only', '--pids-limit=16', '--cap-drop=ALL',
                          '--security-opt=no-new-privileges', '--memory=2560000000',
                          '--memory-swap=2560000000', '--cgroup-parent=' + unit,
                          *[arg for key, value in container_labels(ctx).items() for arg in ('--label', key + '=' + value)],
                          '--entrypoint=/bin/sleep', IMAGE, '90'], timeout=20)
        value = inspect(container)
        container_owned(value, ctx, image)
        require(value['running'] is True and value['parent'] == unit and value['memory'] == R.LIMIT
                and value['swap'] == R.LIMIT and value['network'] == 'none' and value['image'] == image)
        resources.check_pid(value['pid'], value['id'])
        # Hold an actual host Docker client in the parent while observing the
        # separately daemon-created container child. No inherited runner env.
        wait = subprocess.Popen(DOCKER + ['wait', container], stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=ENV, close_fds=True)
        resources.check_pid(wait.pid)
        sample = resources.sample()
        result = {'rootSupervisorPID': root_pid, 'uid1000WorkerPID': os.getpid(),
                  'dockerClientPID': wait.pid, 'containerInitPID': value['pid'],
                  'dockerSocketGID': socket_gid(), 'workerSupplementaryGroups': os.getgroups(),
                  'observedImageId': image, 'sampleWhileAllRolesLive': sample}
    finally:
        stop_container(ctx, image)
        if wait is not None:
            require(wait.wait(timeout=10) == 0)
        resources.sample()
    return result


def supervise(ctx):
    require(os.getuid() == 0)
    unit, _, container = names(ctx)
    path = R.KERNEL_ROOT / unit
    inode = identity(path)
    require(R.membership(Path('/proc/self/cgroup').read_text()).startswith('/' + unit + '/'))
    read_parent(ctx, inode)
    image = command(DOCKER + ['image', 'inspect', '--format', '{{.Id}}', IMAGE]).stdout.decode().strip()
    require(re.fullmatch('sha256:[a-f0-9]{64}', image))
    require(inspect(container, check=False) is None)
    child = None
    try:
        child = subprocess.Popen(internal_argv('worker', ctx), stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 env=process_env(ctx), user=1000, group=1000, extra_groups=[socket_gid()], close_fds=True)
        deadline = time.monotonic() + 60
        while child.poll() is None:
            require(time.monotonic() < deadline)
            read_parent(ctx, inode)
            time.sleep(.1)
        raw = child.communicate(timeout=5)[0]
        require(child.returncode == 0 and len(raw) <= 16384)
        result = json.loads(raw)
        require(result['rootSupervisorPID'] == os.getpid() and result['uid1000WorkerPID'] == child.pid)
        read_parent(ctx, inode)
        return result
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        stop_container(ctx, image)
        read_parent(ctx, inode)


def internal_argv(mode, ctx):
    return ['/usr/bin/python3', '-B', str(SCRIPT), '--internal', mode,
            '--run-id', ctx['runId'], '--expected-commit', ctx['exactCommit'], '--nonce', ctx['nonce']]


def privileged(mode, ctx):
    return command(['/usr/bin/sudo', '-n', '/usr/bin/env', '-i', *[k + '=' + v for k, v in process_env(ctx).items()],
                    *internal_argv(mode, ctx)], timeout=40)


def probe(ctx, stop_latch=None):
    unit, service, _ = names(ctx)
    image = command(DOCKER + ['image', 'inspect', '--format', '{{.Id}}', IMAGE]).stdout.decode().strip()
    require(re.fullmatch('sha256:[a-f0-9]{64}', image))
    socket_gid()
    created = False
    try:
        privileged('prepare', ctx)
        created = True
        inode = identity(R.KERNEL_ROOT / unit)
        initial = read_parent(ctx, inode, empty=True)
        argv = ['/usr/bin/sudo', '-n', '/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                '--service-type=exec', '--unit=' + service, '--slice=' + unit,
                '--property=User=0', '--property=Group=0', '--property=RuntimeMaxSec=75',
                '--property=TimeoutStopSec=15', '--property=KillMode=control-group',
                '/usr/bin/env', '-i', *[k + '=' + v for k, v in process_env(ctx).items()], *internal_argv('supervise', ctx)]
        result = command(argv, timeout=100)
        roles = json.loads(result.stdout)
        require(roles['observedImageId'] == image)
        final = read_parent(ctx, inode, empty=True)
        require(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes'])
        return {'status': 'PASS_PARENT_TOPOLOGY_ONLY_START_BLOCKED', 'readiness': 'BLOCKED',
                'exactCommit': ctx['exactCommit'], 'runId': ctx['runId'], 'runAttempt': 1,
                'roles': roles, 'initialCommonParent': initial, 'finalCommonParentAfterOwnedExits': final,
                'sameKernelParentIdentity': True, 'ownedChildrenExited': True,
                'executionAuthority': False, 'end500Acceptance': False, 'mock500Acceptance': False,
                'commonLifetimeMemoryAccepted': False, 'fullRestoreCapacityAccepted': False,
                'controllerStarted': False, 'databaseStarted': False, 'authCalls': 0, 'units': 0, 'providerCalls': 0}
    finally:
        if created:
            if stop_latch is not None:
                stop_latch.cleaning = True
            privileged('remove', ctx)


def main(argv=None):
    public = True
    stop_latch = None
    try:
        parser = Parser(allow_abbrev=False, add_help=False, description=__doc__)
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument('--probe-parent-only', action='store_true')
        mode.add_argument('--internal', choices=('prepare', 'remove', 'supervise', 'worker'))
        parser.add_argument('--run-id', required=True)
        parser.add_argument('--expected-commit', required=True)
        parser.add_argument('--nonce')
        args = parser.parse_args(argv)
        public = args.internal is None
        require((public and args.nonce is None) or (not public and args.nonce is not None))
        ctx = context(args.run_id, args.expected_commit, str(uuid.uuid4()) if public else args.nonce)
        if public:
            stop_latch = StopLatch()
        github_binding(args.run_id, args.expected_commit)
        if public:
            result = probe(ctx, stop_latch=stop_latch)
            stop_latch.cleaning = False
            require(not stop_latch.seen)
        else:
            result = {'prepare': prepare_parent, 'remove': remove_parent,
                      'supervise': supervise, 'worker': worker}[args.internal](ctx)
        if result is not None:
            print(json.dumps(result, separators=(',', ':'), allow_nan=False))
        return 0
    except (Exception, KeyboardInterrupt):
        if public:
            print(json.dumps({'status': 'FAIL_OR_UNKNOWN_PARENT_PROBE_START_BLOCKED',
                              'reason': 'RUNNER_PARENT_PROBE_REJECTED', 'readiness': 'BLOCKED',
                              'executionAuthority': False, 'controllerStarted': False,
                              'databaseStarted': False, 'end500Acceptance': False, 'mock500Acceptance': False,
                              'commonLifetimeMemoryAccepted': False, 'retryAllowed': False}, separators=(',', ':')))
        return 1
    finally:
        if stop_latch is not None:
            stop_latch.close()


if __name__ == '__main__':
    raise SystemExit(main())
