"""Separate V2 Mock500 parent; imports never create a cgroup or start work."""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import os
from pathlib import Path
import stat

SCRIPT = Path(__file__).absolute()


def _load(name, canonical=None):
    path = SCRIPT.with_name(name + '.py')
    key = canonical or 'w15_mock_parent_' + name
    if canonical and key in sys.modules:
        module = sys.modules[key]
        require(Path(module.__file__).absolute() == path)
        return module
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec)
    if canonical:
        sys.modules[key] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        if canonical:
            sys.modules.pop(key, None)
        raise
    return module


P = _load('runner_parent')
LIMIT, MAXIMUM, RESERVE = 2048000000, 1638400000, 409600000
UNIT_ROOT = P.UNIT_ROOT
names, context, identity = P.names, P.context, P.identity
parent_empty = P.parent_empty


class MockParentError(RuntimeError):
    def __init__(self, memory=None):
        super().__init__('MOCK500_PARENT_REJECTED')
        self.failure_memory = P.R.closed_failure_memory(memory)


def require(value):
    if not value:
        raise MockParentError()


def resources():
    # This is an assessor only, not the worker's canonical resource instance.
    # A fork must not inherit that canonical key from the unstaged checkout.
    return _load('mock500_resources', 'w15_mock_parent_assessor')


def read_parent(ctx, expected_identity, *, empty=False):
    """Read the unchanged kernel lifetime; never reset any peak/counter."""
    if ctx.get('hostCapacityDiagnostic') is True or ctx.get('functionalStage') == 'mock500' or ctx.get('processingBackupStage') == 'mock500':
        return P.read_parent(ctx, expected_identity, empty=empty)
    require('functionalStage' not in ctx)
    fd = P.R._kernel_directory(P.R.KERNEL_ROOT / names(ctx)[0])
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
            'events': {key: int(value) for key, value in
                       (row.split() for row in read('memory.events').splitlines())}}
        try:
            resources().assess(sample)
            populated = dict(row.split() for row in read('cgroup.events').splitlines())['populated']
            require(populated in ('0', '1'))
            if empty:
                require(populated == '0')
        except KeyboardInterrupt as error:
            error.failure_memory = P.R.project_failure_memory(sample, False)
            raise
        except BaseException:
            raise MockParentError(P.R.project_failure_memory(sample, False)) from None
        return sample
    finally:
        os.close(fd)


def unit_bytes(ctx=None):
    if ctx is not None and ctx.get('hostCapacityDiagnostic') is True:
        return P.unit_bytes(ctx)
    if ctx is not None and 'functionalStage' in ctx:
        require(ctx['functionalStage'] == 'mock500')
        return P.unit_bytes(ctx)
    return (b'[Unit]\nDescription=W15 isolated Mock500 V2 parent\n'
            b'[Slice]\nMemoryAccounting=yes\nMemoryMax=2048000000\nMemorySwapMax=0\n')


def prepare_parent(ctx):
    if ctx.get('hostCapacityDiagnostic') is True:
        return P.prepare_parent(ctx)
    if ctx.get('functionalStage') == 'mock500':
        return P.prepare_parent(ctx)
    require('functionalStage' not in ctx)
    require(os.getuid() == 0 and Path('/proc/1/comm').read_text().strip() == 'systemd')
    unit = names(ctx)[0]
    path = P.R.KERNEL_ROOT / unit
    require(not os.path.lexists(path))
    fd = os.open(UNIT_ROOT / unit, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        raw = unit_bytes()
        require(os.write(fd, raw) == len(raw))
        os.fsync(fd)
    finally:
        os.close(fd)
    try:
        P.command(['/usr/bin/systemctl', 'daemon-reload'])
        P.command(['/usr/bin/systemctl', 'start', unit])
        read_parent(ctx, identity(path), empty=True)
    except BaseException:
        try:
            remove_parent(ctx)
        except BaseException:
            pass
        raise MockParentError() from None


def remove_parent(ctx):
    if ctx.get('hostCapacityDiagnostic') is True:
        return P.remove_parent(ctx)
    if ctx.get('functionalStage') == 'mock500':
        return P.remove_parent(ctx)
    require('functionalStage' not in ctx)
    require(os.getuid() == 0)
    unit = names(ctx)[0]
    file = UNIT_ROOT / unit
    value = file.lstat()
    require(stat.S_ISREG(value.st_mode) and value.st_uid == 0 and value.st_nlink == 1
            and stat.S_IMODE(value.st_mode) == 0o600 and file.read_bytes() == unit_bytes())
    P.command(['/usr/bin/systemctl', 'stop', unit], timeout=30)
    file.unlink()
    P.command(['/usr/bin/systemctl', 'daemon-reload'])


def github_binding(ctx):
    require('functionalStage' not in ctx or ctx['functionalStage'] == 'mock500')
    P.github_binding(ctx['runId'], ctx['exactCommit'],
        **({'capacity_diagnostic':True,'host_capacity_diagnostic':True} if ctx.get('hostCapacityDiagnostic') is True else {}),
        **({'processing_backup_stage': ctx['processingBackupStage']}
           if ctx.get('processingBackupStage') == 'mock500' else {}),
        **({'functional_stage': 'mock500'} if ctx.get('functionalStage') == 'mock500' else {}))
    for file in (SCRIPT, SCRIPT.with_name('mock500_resources.py'),
                 *([SCRIPT.with_name(n+'.py') for n in ('mock500_host_contract','host_functional_contract','component_resource_meter','functional_contract')] if ctx.get('hostCapacityDiagnostic') is True else []),
                 *([SCRIPT.with_name('phase_contract.py')] if ctx.get('processingBackupStage') == 'mock500' else [])):
        relative = str(file.relative_to(P.REPO))
        row = P.command(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
            '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(P.REPO), '-C', str(P.REPO),
            'ls-tree', '-z', ctx['exactCommit'], '--', relative]).stdout
        header, name = row.rstrip(b'\0').split(b'\t')
        mode, kind, digest = header.split()
        require(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() == relative
                and not file.is_symlink())
        raw = file.read_bytes()
        require(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == digest)


def privileged(mode, ctx):
    require(mode in ('prepare', 'remove'))
    require('functionalStage' not in ctx or (ctx['functionalStage']=='mock500' and ctx.get('processingBackupStage') is None))
    argv = ['/usr/bin/python3', '-B', str(SCRIPT), '--internal', mode,
            '--run-id', ctx['runId'], '--expected-commit', ctx['exactCommit'], '--nonce', ctx['nonce']]
    if ctx.get('mockHostFunctional') is True:
        require(ctx.get('hostCapacityDiagnostic') is True and ctx.get('capacityDiagnostic') is True
                and ctx.get('functionalStage') is None and ctx.get('processingBackupStage') is None)
        argv += ['--host-capacity-functional']
    if ctx.get('processingBackupStage') == 'mock500':
        argv += ['--processing-backup-stage', 'mock500', '--processing-backup-phase', ctx.get('processingBackupPhase', 'processing')]
    if ctx.get('functionalStage') == 'mock500':
        require(ctx.get('processingBackupStage') is None)
        argv += ['--functional-stage', 'mock500']
    return P.command(['/usr/bin/sudo', '-n', '/usr/bin/env', '-i',
                     *[key + '=' + value for key, value in P.process_env(ctx).items()], *argv], timeout=40)


def main(argv=None):
    try:
        parser = P.Parser(add_help=False, allow_abbrev=False)
        parser.add_argument('--internal', required=True, choices=('prepare', 'remove'))
        parser.add_argument('--run-id', required=True)
        parser.add_argument('--expected-commit', required=True)
        parser.add_argument('--nonce', required=True)
        parser.add_argument('--processing-backup-stage', choices=('mock500',))
        parser.add_argument('--processing-backup-phase', choices=('processing', 'backup'))
        parser.add_argument('--functional-stage', choices=('mock500',))
        parser.add_argument('--host-capacity-functional', action='store_true')
        args = parser.parse_args(argv)
        ctx = context(args.run_id, args.expected_commit, args.nonce)
        if args.processing_backup_stage:
            require(args.processing_backup_phase is not None)
            ctx['processingBackupStage'] = 'mock500'
            ctx['processingBackupPhase'] = args.processing_backup_phase
        else:
            require(args.processing_backup_phase is None)
        if args.functional_stage is not None:
            require(args.processing_backup_stage is None and args.processing_backup_phase is None)
            ctx['functionalStage'] = 'mock500'
        if args.host_capacity_functional:
            require(args.functional_stage is None and args.processing_backup_stage is None
                    and args.processing_backup_phase is None)
            ctx.update(capacityDiagnostic=True,hostCapacityDiagnostic=True,mockHostFunctional=True)
            if args.internal=='remove':ctx['hostCapacityAdmission']=P.load_host_admission(ctx)
        github_binding(ctx)
        result={'prepare': prepare_parent, 'remove': remove_parent}[args.internal](ctx)
        if result is not None:print(P.json.dumps(result,sort_keys=True,separators=(',',':')))
        return 0
    except BaseException:
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
