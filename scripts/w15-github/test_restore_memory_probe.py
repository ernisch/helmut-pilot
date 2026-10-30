"""Opt-in, secret-free PR-CI cache discrimination; never restore or start W15.

No arguments returns an inert plan. --unit-only uses only fictional samples and
small synthetic files. --probe-synthetic-copy-only is the fixed native probe:
one 32-MiB source and one 32-MiB copy in a fresh existing-contract parent.
The observations describe this synthetic workload, never an original-run cause.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import time
import unittest
import uuid
from unittest.mock import patch

SCRIPT = Path(__file__).absolute()
SPEC = importlib.util.spec_from_file_location('w15_copy_probe_parent', SCRIPT.with_name('runner_parent.py'))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)
CHUNK, BLOCKS = 1024 * 1024, 32
STAT_KEYS = ('anon', 'file', 'kernel', 'shmem')
STAGES = ('initial', 'sourceWritten', 'copyWritten', 'readbackComplete', 'afterOwnedExit')
PHASES = {'arguments', 'binding', 'prepare', 'initial', 'sourceWritten', 'copyWritten',
          'readbackComplete', 'worker', 'closure', 'cleanup'}
PHASE = 'arguments'
HEAD_REF = 'codex/w15-full-restore-result-20261030'


def require(value):
    if not value:
        raise ValueError('SYNTHETIC_COPY_MEMORY_PROBE_REJECTED')


def stage(value):
    global PHASE
    require(value in PHASES)
    PHASE = value


def context(run_id, commit, nonce):
    return P.context(run_id, commit, nonce)


def binding(ctx):
    require(os.environ.get('GITHUB_EVENT_NAME') == 'pull_request'
            and os.environ.get('GITHUB_SHA') == ctx['exactCommit']
            and os.environ.get('W15_MEMORY_PROBE_HEAD_REF') == HEAD_REF)
    P.github_binding(ctx['runId'], ctx['exactCommit'])
    relative = str(SCRIPT.relative_to(P.REPO))
    row = P.command(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
        '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(P.REPO), '-C', str(P.REPO),
        'ls-tree', '-z', ctx['exactCommit'], '--', relative]).stdout
    raw = SCRIPT.read_bytes()
    expected = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    require(row == ('100644 blob ' + expected + '\t' + relative + '\0').encode()
            and not SCRIPT.is_symlink())


def parse_stat(raw):
    require(type(raw) is bytes and len(raw) <= 8192)
    values = dict.fromkeys(STAT_KEYS, 'UNKNOWN')
    seen = set()
    for line in raw.decode('ascii').splitlines():
        key, amount = line.split()
        if key in STAT_KEYS:
            require(key not in seen and re.fullmatch('[0-9]{1,16}', amount) is not None)
            number = int(amount)
            require(number <= 2**53 - 1)
            values[key] = number
            seen.add(key)
    return values


def snapshot(ctx, identity, label, *, empty=False):
    require(label in STAGES)
    sample = P.read_parent(ctx, identity, empty=empty)
    fd = P.R._kernel_directory(P.R.KERNEL_ROOT / P.names(ctx)[0])
    try:
        value = os.fstat(fd)
        require((value.st_dev, value.st_ino) == identity)
        try:
            child = os.open('memory.stat', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        except FileNotFoundError:
            memory = dict.fromkeys(STAT_KEYS, 'UNKNOWN')
        else:
            try:
                memory = parse_stat(os.read(child, 8193))
            finally:
                os.close(child)
    finally:
        os.close(fd)
    # These counters are independently observed, not an atomic decomposition of
    # peak/current. Recheck the unchanged parent and hard bounds after reading.
    P.read_parent(ctx, identity, empty=empty)
    return {'stage': label, 'parentMemory': sample, 'memoryStat': memory,
            'memoryStatIsAtomicPeakBreakdown': False}


def synthetic_block():
    return bytes(range(256)) * (CHUNK // 256)


def digest_file(path, guard):
    digest, total = hashlib.sha256(), 0
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o600
                and before.st_uid == os.getuid() and before.st_nlink == 1)
        while True:
            guard()
            block = os.read(fd, CHUNK)
            if not block:
                break
            total += len(block)
            require(total <= CHUNK * BLOCKS)
            digest.update(block)
        after = os.fstat(fd)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns))
    finally:
        os.close(fd)
    return total, digest.hexdigest()


def files(root, guard, observe):
    """Only two fixed new names; no data/path selector is accepted by the CLI."""
    source, copy = root / 'source.SYNTHETIC', root / 'copy.SYNTHETIC'
    block, digest = synthetic_block(), hashlib.sha256()
    require(len(block) == CHUNK)
    stage('sourceWritten')
    fd = os.open(source, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb', buffering=0) as out:
        for _ in range(BLOCKS):
            guard()
            require(out.write(block) == CHUNK)
            digest.update(block)
        os.fsync(out.fileno())
    expected = CHUNK * BLOCKS, digest.hexdigest()
    require(digest_file(source, guard) == expected)
    observed = [observe('sourceWritten')]
    del block
    stage('copyWritten')
    incoming = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        fd = os.open(copy, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb', buffering=0) as out:
            total = 0
            while True:
                guard()
                block = os.read(incoming, CHUNK)
                if not block:
                    break
                total += len(block)
                require(total <= expected[0] and out.write(block) == len(block))
            require(total == expected[0])
            os.fsync(out.fileno())
    finally:
        os.close(incoming)
    observed.append(observe('copyWritten'))
    stage('readbackComplete')
    require(digest_file(source, guard) == expected and digest_file(copy, guard) == expected)
    observed.append(observe('readbackComplete'))
    return observed, expected[1]


def worker(ctx):
    require(os.getuid() == os.getgid() == 0)
    parent = P.R.KERNEL_ROOT / P.names(ctx)[0]
    identity = P.identity(parent)
    member = P.R.membership(Path('/proc/self/cgroup').read_text())
    require(member.startswith('/' + parent.name + '/'))
    root = Path('/tmp') / ('w15-copy-memory-' + ctx['runId'] + '-' + uuid.UUID(ctx['nonce']).hex)
    os.mkdir(root, 0o700)
    os.chown(root, 1000, 1000)
    os.setgroups([])
    os.setgid(1000)
    os.setuid(1000)
    require(os.getuid() == os.getgid() == 1000 and os.getgroups() == [])
    deadline = time.monotonic() + 60
    def guard():
        require(time.monotonic() < deadline)
        P.read_parent(ctx, identity)
    def observe(label):
        guard()
        return snapshot(ctx, identity, label)
    stage('initial')
    first = observe('initial')
    observed, digest = files(root, guard, observe)
    return {'status': 'PASS_SYNTHETIC_COPY_WORKER_ONLY', 'stages': [first, *observed],
            'fileBytesEach': CHUNK * BLOCKS, 'files': 2, 'dataSHA256': digest,
            'uid': os.getuid(), 'gid': os.getgid(), 'ownSyntheticFilesRetained': True}


def internal_argv(ctx):
    return ['/usr/bin/python3', '-I', '-B', str(SCRIPT), '--internal-worker', '--run-id', ctx['runId'],
            '--expected-commit', ctx['exactCommit'], '--nonce', ctx['nonce']]


def service_argv(ctx):
    unit, service, _ = P.names(ctx)
    env = {**P.process_env(ctx), 'GITHUB_EVENT_NAME': 'pull_request',
           'GITHUB_SHA': ctx['exactCommit'], 'W15_MEMORY_PROBE_HEAD_REF': HEAD_REF}
    return ['/usr/bin/sudo', '-n', '/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
            '--service-type=exec', '--unit=' + service, '--slice=' + unit,
            '--property=User=0', '--property=Group=0', '--property=RuntimeMaxSec=65',
            '--property=TimeoutStopSec=10', '--property=KillMode=control-group',
            '/usr/bin/env', '-i', *[key + '=' + value for key, value in env.items()], *internal_argv(ctx)]


def probe(ctx, latch):
    created, first, result, identity = False, None, None, None
    started = time.monotonic()
    cleanup = {'ownedChildrenExited': 'UNKNOWN', 'parentUnitRemoved': 'UNKNOWN'}
    try:
        stage('prepare')
        P.privileged('prepare', ctx)
        created = True
        identity = P.identity(P.R.KERNEL_ROOT / P.names(ctx)[0])
        initial = P.read_parent(ctx, identity, empty=True)
        stage('worker')
        ran = P.command(service_argv(ctx), timeout=80, check=False)
        value = json.loads(ran.stdout)
        if ran.returncode != 0:
            if (type(value) is dict and value.get('status') == 'FAIL_OR_UNKNOWN_SYNTHETIC_COPY_MEMORY_PROBE'
                    and value.get('firstFailedPhase') in PHASES):
                stage(value['firstFailedPhase'])
            raise ValueError('SYNTHETIC_COPY_WORKER_FAILED')
        require(type(value) is dict and set(value) == {'status', 'stages', 'fileBytesEach', 'files',
                'dataSHA256', 'uid', 'gid', 'ownSyntheticFilesRetained'}
                and value['status'] == 'PASS_SYNTHETIC_COPY_WORKER_ONLY'
                and value['fileBytesEach'] == CHUNK * BLOCKS and value['files'] == 2
                and value['uid'] == value['gid'] == 1000
                and value['ownSyntheticFilesRetained'] is True
                and re.fullmatch('[0-9a-f]{64}', value['dataSHA256']) is not None
                and [row['stage'] for row in value['stages']] == list(STAGES[:-1]))
        for row in value['stages']:
            P.R.assess(row['parentMemory'])
            require(set(row) == {'stage', 'parentMemory', 'memoryStat', 'memoryStatIsAtomicPeakBreakdown'}
                    and row['memoryStatIsAtomicPeakBreakdown'] is False
                    and set(row['memoryStat']) == set(STAT_KEYS)
                    and all(v == 'UNKNOWN' or type(v) is int and 0 <= v <= 2**53 - 1
                            for v in row['memoryStat'].values()))
        stage('closure')
        final = snapshot(ctx, identity, 'afterOwnedExit', empty=True)
        require(final['parentMemory']['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes']
                and P.parent_empty(ctx, identity))
        cleanup['ownedChildrenExited'] = 'PASS'
        result = {'status': 'PASS_SYNTHETIC_COPY_CACHE_OBSERVATIONS_ONLY', 'exactCommit': ctx['exactCommit'],
                'runId': ctx['runId'], 'runAttempt': 1, 'initialCommonParent': initial,
                'stages': [*value['stages'], final], 'fileBytesEach': CHUNK * BLOCKS,
                'files': 2, 'sameKernelParentIdentity': True, 'workerUID': 1000,
                'workerGID': 1000, 'ownSyntheticFilesRetained': True,
                'actualOriginalRunCauseProven': False, 'fullRestoreAccepted': False,
                'fullLifetimeMemoryAccepted': False, 'end500Acceptance': False,
                'mock500Acceptance': False, 'executionAuthority': False, 'retryAllowed': False}
    except BaseException:
        first = PHASE
    finally:
        if created:
            latch.cleaning = True
            try:
                stage('cleanup')
                # Stop only the derived service belonging to this exclusive
                # parent. A failed worker/timeout never permits orphaned work.
                if identity is not None:
                    if not P.parent_empty(ctx, identity):
                        P.command(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'stop', P.names(ctx)[1]], timeout=10)
                    if P.parent_empty(ctx, identity):
                        cleanup['ownedChildrenExited'] = 'PASS'
            except BaseException:
                first = first or 'cleanup'
            finally:
                try:
                    P.privileged('remove', ctx)
                    cleanup['parentUnitRemoved'] = 'PASS'
                except BaseException:
                    first = first or 'cleanup'
        if latch.seen:
            first = first or 'cleanup'
    if first is not None:
        return {'status': 'FAIL_OR_UNKNOWN_SYNTHETIC_COPY_MEMORY_PROBE', 'firstFailedPhase': first,
                'cleanup': cleanup, 'actualOriginalRunCauseProven': False,
                'fullRestoreAccepted': False, 'executionAuthority': False, 'retryAllowed': False}
    require(result is not None and set(cleanup.values()) == {'PASS'} and time.monotonic() - started <= 180)
    return {**result, 'cleanup': cleanup}


def plan():
    return {'status': 'BLOCKED_EXPLICIT_SYNTHETIC_PR_CI_OPT_IN_REQUIRED', 'fileBytesEach': CHUNK * BLOCKS,
            'files': 2, 'maximumWallSeconds': 180, 'networkUsed': False, 'originalsUsed': False,
            'databaseStarted': False, 'dockerUsed': False, 'gpgUsed': False,
            'actualOriginalRunCauseProven': False, 'fullRestoreAccepted': False,
            'executionAuthority': False, 'retryAllowed': False}


class UnitChecks(unittest.TestCase):
    def test_default_plan_is_inert(self):
        with patch.object(P, 'privileged') as elevate, patch.object(P, 'command') as command:
            self.assertFalse(plan()['executionAuthority'])
            elevate.assert_not_called(); command.assert_not_called()

    def test_memory_stat_unknown_and_rejection(self):
        self.assertEqual(parse_stat(b'anon 12\nfile 34\ninactive_file 30\n'),
                         {'anon': 12, 'file': 34, 'kernel': 'UNKNOWN', 'shmem': 'UNKNOWN'})
        for raw in [b'anon 1\nanon 2\n', b'anon -1\n', b'file secret\n', b'x' * 8193, b'anon 9007199254740992\n']:
            with self.subTest(raw=raw[:30]), self.assertRaises((ValueError, UnicodeError)):
                parse_stat(raw)

    def test_same_contract_boundaries(self):
        sample = {'configuredLimit': '2560000000', 'swapMaximum': '0', 'kernelLifetimePeakBytes': 2048000000,
                  'currentBytes': 32, 'swapCurrentBytes': 0,
                  'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}
        self.assertEqual(P.R.assess(sample), sample)
        sample['kernelLifetimePeakBytes'] = 2048073728
        with self.assertRaises(P.R.ResourceError): P.R.assess(sample)

    def test_actual_small_stream_and_no_overwrite(self):
        import tempfile
        with tempfile.TemporaryDirectory(prefix='w15-fictional-copy-unit-') as directory:
            root = Path(directory); labels = []
            with patch.dict(globals(), CHUNK=4096, BLOCKS=2):
                rows, digest = files(root, lambda: None, lambda label: labels.append(label) or {'stage': label})
                self.assertEqual(labels, list(STAGES[1:-1]))
                self.assertEqual(len(rows), 3)
                self.assertEqual(digest_file(root / 'copy.SYNTHETIC', lambda: None), (8192, digest))
                for name in ('source.SYNTHETIC', 'copy.SYNTHETIC'):
                    self.assertEqual(stat.S_IMODE((root / name).stat().st_mode), 0o600)
                with self.assertRaises(FileExistsError): files(root, lambda: None, lambda label: {})

    def test_secret_free_fixed_argv_and_no_docker(self):
        ctx = context('41073062264', 'a' * 40, '36099bf3-331b-4215-a6e7-7ca0b460235d')
        with patch.dict(os.environ, {'FAKE_SECRET': 'never-propagate'}, clear=True):
            argv = service_argv(ctx)
        self.assertIn('-i', argv)
        self.assertNotIn('never-propagate', ' '.join(argv))
        self.assertNotIn('docker', ' '.join(argv))
        self.assertIn('--property=RuntimeMaxSec=65', argv)
        self.assertIn('--slice=' + P.names(ctx)[0], argv)

    def test_non_pr_rejected_before_elevation(self):
        ctx = context('41073062264', 'a' * 40, '36099bf3-331b-4215-a6e7-7ca0b460235d')
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'workflow_dispatch'}, clear=True), \
                patch.object(P, 'github_binding') as github:
            with self.assertRaises(ValueError): binding(ctx)
            github.assert_not_called()

    def test_first_failure_not_replaced_by_cleanup_failure(self):
        ctx = context('41073062264', 'a' * 40, '36099bf3-331b-4215-a6e7-7ca0b460235d')
        latch = type('Latch', (), {'cleaning': False, 'seen': False})()
        with patch.object(P, 'privileged'), patch.object(P, 'identity', return_value=(1, 2)), \
                patch.object(P, 'read_parent', return_value={}), \
                patch.object(P, 'command', side_effect=RuntimeError('PRIVATE_NEVER_PRINTED')):
            result = probe(ctx, latch)
        self.assertEqual(result['firstFailedPhase'], 'worker')
        self.assertEqual(result['cleanup']['ownedChildrenExited'], 'UNKNOWN')
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_signal_between_probe_return_and_public_output_cannot_pass(self):
        import io
        from types import SimpleNamespace
        latch = SimpleNamespace(seen=False, cleaning=True, close=lambda: None)
        def finished(ctx, observed_latch):
            observed_latch.seen = True
            return {'status': 'PASS_SYNTHETIC_COPY_CACHE_OBSERVATIONS_ONLY'}
        output = io.StringIO()
        with patch.object(P, 'StopLatch', return_value=latch), patch.dict(globals(), binding=lambda ctx: None), \
                patch.dict(globals(), probe=finished), patch.object(sys, 'stdout', output):
            code = main(['--probe-synthetic-copy-only', '--run-id', '41073062264', '--expected-commit', 'a' * 40])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue())['status'], 'FAIL_OR_UNKNOWN_SYNTHETIC_COPY_MEMORY_PROBE')


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args in ([], ['--plan']):
        print(json.dumps(plan(), sort_keys=True)); return 0
    if args == ['--unit-only']:
        result = unittest.TextTestRunner(stream=sys.stderr).run(unittest.defaultTestLoader.loadTestsFromTestCase(UnitChecks))
        return 0 if result.wasSuccessful() else 1
    latch, internal = None, False
    try:
        stage('arguments')
        parser = P.Parser(allow_abbrev=False, add_help=False)
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--probe-synthetic-copy-only', action='store_true')
        group.add_argument('--internal-worker', action='store_true')
        parser.add_argument('--run-id', required=True)
        parser.add_argument('--expected-commit', required=True)
        parser.add_argument('--nonce')
        value = parser.parse_args(args)
        internal = value.internal_worker
        require(internal == (value.nonce is not None))
        ctx = context(value.run_id, value.expected_commit, value.nonce if internal else str(uuid.uuid4()))
        stage('binding'); binding(ctx)
        latch = P.StopLatch()
        result = worker(ctx) if internal else probe(ctx, latch)
        latch.cleaning = False
        require(not latch.seen)
        print(json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False))
        return 0 if result['status'].startswith('PASS_') else 1
    except BaseException:
        print(json.dumps({'status': 'FAIL_OR_UNKNOWN_SYNTHETIC_COPY_MEMORY_PROBE',
            'firstFailedPhase': PHASE, 'actualOriginalRunCauseProven': False,
            'fullRestoreAccepted': False, 'executionAuthority': False, 'retryAllowed': False}, sort_keys=True))
        return 1
    finally:
        if latch is not None:
            latch.close()


if __name__ == '__main__':
    raise SystemExit(main())
