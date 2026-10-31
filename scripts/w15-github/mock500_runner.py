"""Fixed Mock500 UID1000 runner with a separate V2 lifetime parent.

Only launch() starts the explicitly admitted fixed worker. Secrets use bounded
stdin/private IPC; imports perform no parent, container or original-data work.
"""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timezone
import hashlib
import importlib.util
import math
import multiprocessing
import os
from pathlib import Path
import re
import socket
import subprocess
import time

SCRIPT = Path(__file__).absolute()
REPO = SCRIPT.parents[2]


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_runner_' + name, SCRIPT.with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


S, P = _load('runner_start'), _load('mock500_parent')
LIMITS = {'comparisonBudgetBytes': P.LIMIT, 'maximumConsumptionBytes': P.MAXIMUM,
          'requiredReserveBytes': P.RESERVE, 'swapBytes': 0}
PHASED = 'mock500-full-phased-gated'
WALL = {'mock500-runner-synthetic': 300, 'mock500-full-gated': 12600, PHASED: 12600}
BRANCH = S.BRANCH
SYNTHETIC_BRANCH = 'refs/heads/codex/w15-mock500-integration-20261029'
REQUEST_KEYS = S.REQUEST_KEYS | {'bindings'}
PHASES = S.PHASES
WORKER_PHASES = (S.WORKER_PHASES - {'end500'}) | {'mock500'}
WORKER_PHASES |= {'mock-receiver-' + value for value in ('arguments', 'binding', 'private-inputs',
    'key-import', 'outer-index', 'original-download', 'original-reception', 'original-relocation',
    'asset-download', 'asset-reception', 'asset-readback', 'agent-close')}
WORKER_PHASES |= {'mock-receiver-archive-' + phase for phase in ('arguments', 'cipher', 'recipient', 'destination', 'decrypt', 'gzip', 'archive', 'manifest', 'files', 'integrity', 'readback', 'cleanup')}
STATUS = {'mock500-runner-synthetic': 'PASS_MOCK500_SYNTHETIC_RUNNER_ONLY_START_BLOCKED',
          'mock500-full-gated': 'PASS_MOCK500_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING',
          PHASED: 'PASS_MOCK500_PHASED_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'}
RESULT_KEYS = {'status', 'mode', 'exactCommit', 'runId', 'runAttempt', 'syntheticQualification',
               'originalTransferPerformed', 'profiles', 'activeProfiles', 'units', 'providerPhases',
               'results', 'controls', 'backupRoundtripVerified', 'executionAuthority',
               'mock500Acceptance', 'end500Acceptance'}
PHASE = 'arguments'


class MockRunnerError(S.RunnerStartError):
    allowed_worker_phases = WORKER_PHASES

    def __init__(self, phase=None, worker_phase=None, worker_memory=None, **kwargs):
        phase = phase if type(phase) is str and phase in PHASES else PHASE
        super().__init__(phase, worker_phase, worker_memory, **kwargs)
        self.args = ('MOCK500_RUNNER_FAILED_OR_UNKNOWN',)


def need(value):
    if not value:
        raise MockRunnerError()


def validate_request(request, private_payload):
    need(type(request) is dict and set(request) == REQUEST_KEYS
         and request['schema'] == 'helmut-w15-runner-request/1' and type(request['mode']) is str
         and request['mode'] in WALL and request['limits'] == LIMITS
         and all(type(value) is int for value in request['limits'].values())
         and type(request['maximumWallSeconds']) is int and request['maximumWallSeconds'] == WALL[request['mode']]
         and type(request['runAttempt']) is int and request['runAttempt'] == 1
         and request['branch'] in ((BRANCH, SYNTHETIC_BRANCH) if request['mode'] == 'mock500-runner-synthetic' else (BRANCH,))
         and type(request['imageId']) is str and re.fullmatch('sha256:[a-f0-9]{64}', request['imageId']))
    S._ctx(request)
    S._path(request['nodeSource']); S._path(request['postgrestSource'])
    need(type(request['sourceQualification']) is dict and type(request['approval']) is dict
         and len(S._encode(request['sourceQualification'])) <= 512 * 1024
         and type(request['bindings']) is dict and len(S._encode(request['bindings'])) <= 512 * 1024
         and type(private_payload) is dict)
    if request['mode'] == 'mock500-runner-synthetic':
        need(private_payload == {} and request['approval'] == {} and request['bindings'] == {})
    else:
        bindings = request['bindings']
        need(set(bindings) == {'end500Acceptance', 'compatibilityBridge', 'inputBindingSHA256',
                               'additionalAssetBytes', 'approvedEnd500Commit'}
             and type(bindings['inputBindingSHA256']) is str and re.fullmatch('[a-f0-9]{64}', bindings['inputBindingSHA256'])
             and type(bindings['approvedEnd500Commit']) is str and re.fullmatch('[a-f0-9]{40}', bindings['approvedEnd500Commit'])
             and type(bindings['additionalAssetBytes']) is int and 0 < bindings['additionalAssetBytes'] <= 8 * 1024 ** 3)
        for name in ('end500Acceptance', 'compatibilityBridge'):
            value = bindings[name]
            need(type(value) is dict and set(value) == {'raw', 'sha256'} and type(value['raw']) is str
                 and 0 < len(value['raw'].encode()) <= 256 * 1024 and type(value['sha256']) is str
                 and re.fullmatch('[a-f0-9]{64}', value['sha256']))
        need(set(private_payload) == {'cipherIndex', 'keyB64', 'passphrase', 'eventInputs', 'artifactCredentials'})
        for key, maximum in (('cipherIndex', 65535), ('keyB64', 49152), ('passphrase', 4096)):
            need(type(private_payload[key]) is str and 0 < len(private_payload[key].encode()) <= maximum)
        need(type(private_payload['eventInputs']) is dict and len(S._encode(private_payload['eventInputs'])) <= 65535
             and type(private_payload['artifactCredentials']) is dict
             and len(S._encode(private_payload['artifactCredentials'])) <= 65536)
    S._encode({'request': request, 'private': private_payload})
    return request


def github_binding(request):
    need(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_REF') == request['branch'] and os.environ.get('GITHUB_SHA') == request['exactCommit']
         and os.environ.get('GITHUB_RUN_ID') == request['runId'] and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    need(S._git(REPO, ['rev-parse', 'HEAD']) == (request['exactCommit'] + '\n').encode())
    for name in ('mock500_runner.py', 'mock500_parent.py', 'mock500_resources.py', 'mock500_workflow.py',
                 'runner_start.py', 'runner_parent.py', 'common_resources.py', 'runner_diagnostics.py', 'controller_context.py',
                 *(('restore_capacity.py', 'phase_contract.py') if request['mode'] == PHASED else ())):
        file = SCRIPT.with_name(name)
        relative = str(file.relative_to(REPO))
        entry = S._git(REPO, ['ls-tree', '-z', request['exactCommit'], '--', relative])
        header, filename = entry.rstrip(b'\0').split(b'\t')
        mode, kind, digest = header.split()
        need(mode in (b'100644', b'100755') and kind == b'blob' and filename.decode() == relative
             and not file.is_symlink())
        raw = file.read_bytes()
        need(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == digest)


def validate_public_result(result, manifest):
    phased = manifest['mode'] == PHASED
    keys = RESULT_KEYS | ({'resourcePhases', 'processingMemoryChecksCompleted', 'backupSafetyChecksCompleted'} if phased else set())
    need(type(result) is dict and set(result) == keys and result['mode'] == manifest['mode']
         and result['status'] == STATUS[manifest['mode']]
         and all(result[key] == manifest[key] for key in ('exactCommit', 'runId', 'runAttempt'))
         and type(result['runAttempt']) is int and result['runAttempt'] == 1)
    synthetic = manifest['mode'] == 'mock500-runner-synthetic'
    for key, value in {'syntheticQualification': synthetic, 'originalTransferPerformed': not synthetic,
                       'backupRoundtripVerified': not synthetic, 'executionAuthority': False,
                       'mock500Acceptance': False, 'end500Acceptance': False}.items():
        need(result[key] is value)
    for key, full_value in {'profiles': 500, 'activeProfiles': 0, 'units': 500,
                            'providerPhases': 1000, 'results': 1500, 'controls': 8000}.items():
        need(type(result[key]) is int and result[key] == (0 if synthetic else full_value))
    if phased:
        P.resources().phases().validate_closure(result['resourcePhases'], 'mock500',
            {key: manifest[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')})
        need(result['processingMemoryChecksCompleted'] is True and result['backupSafetyChecksCompleted'] is True)
    return {key: result[key] for key in sorted(result)}


def _failure(value):
    return S._response_error(value, error_type=MockRunnerError)


def _started(started_at, started_mono, maximum):
    need(type(started_at) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', started_at)
         and type(started_mono) in (int, float) and math.isfinite(started_mono) and started_mono > 0)
    elapsed = time.monotonic() - started_mono
    wall = (datetime.now(timezone.utc) - datetime.strptime(started_at, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)).total_seconds()
    need(0 <= elapsed < maximum and 0 <= wall < maximum + 1 and abs(elapsed - wall) < 2)


def _fork_worker(manifest, private_payload, sender, receiver, docker_gid):
    latch, code, result, failure = None, 1, None, None
    reason = 'WORKER_SETUP_REJECTED'
    try:
        receiver.close()
        S._close_stdio()
        os.environ.clear(); os.environ.update(S._worker_env(manifest))
        os.setgroups([docker_gid]); os.setgid(1000); os.setuid(1000)
        need(os.getuid() == os.getgid() == 1000 and os.getgroups() == [docker_gid])
        latch = P.P.StopLatch()
        script = Path(manifest['stagedRepo']) / 'scripts/w15-github/mock500_workflow.py'
        raw = script.read_bytes(); pin = manifest['sourcePins']['scripts/w15-github/mock500_workflow.py']
        need(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256'])
        spec = importlib.util.spec_from_file_location('w15_fixed_mock500_worker', script)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        reason = 'WORKER_RESULT_REJECTED'
        if manifest['mode'] == PHASED:
            result = module.run_worker(manifest, private_payload,
                backup_transition=S._worker_backup_transition(sender, manifest, 'mock500'))
        else:
            result = module.run_worker(manifest, private_payload)
        result = validate_public_result(result, manifest)
        need(not latch.seen)
    except BaseException as error:
        failure = S._worker_failure(error, reason, error_type=MockRunnerError)
    finally:
        if latch is not None:
            latch.cleaning = True
            try:
                latch.close()
                if latch.seen and failure is None:
                    failure = MockRunnerError('worker', runner={'reason': 'WORKER_CLEANUP_UNCONFIRMED'})
            except BaseException:
                if failure is None:
                    failure = MockRunnerError('worker', runner={'reason': 'WORKER_CLEANUP_UNCONFIRMED'})
        try:
            packet = S._failure_packet(failure) if failure is not None else {'ok': True, 'result': result}
            sender.send_bytes(S._encode(packet, S.MAX_RESULT)); code = 0 if failure is None else 1
        except BaseException:
            code = 1
        try:
            sender.close()
        except BaseException:
            code = 1
    raise SystemExit(code)


def supervise(request, private_payload, started_at, started_mono, *, latch=None):
    global PHASE
    PHASE = 'binding'
    validate_request(request, private_payload); need(os.getuid() == 0)
    ctx = S._ctx(request); path = P.P.R.KERNEL_ROOT / P.names(ctx)[0]
    inode = P.identity(path)
    need(P.P.R.membership(Path('/proc/self/cgroup').read_text()).startswith('/' + P.names(ctx)[0] + '/'))
    last = {'memory': None}
    def guard():
        try:
            _started(started_at, started_mono, request['maximumWallSeconds'])
        except BaseException as error:
            raise S._diagnose(error, PHASE, 'SUPERVISOR_DEADLINE', last['memory'], error_type=MockRunnerError) from None
        return S._parent_readback(P, ctx, inode, last, error_type=MockRunnerError, phase=PHASE)
    try:
        guard(); docker_gid = S._identity_available()
        PHASE = 'staging'; manifest = S._stage(request, guard)
    except BaseException as error:
        raise S._diagnose(error, PHASE, 'SUPERVISOR_REJECTED', last['memory'], error_type=MockRunnerError) from None
    manifest.update(startedAtUTC=started_at, startedMonotonic=started_mono)
    need('scripts/w15-github/mock500_workflow.py' in manifest['sourcePins'])
    PHASE = 'worker'
    try:
        fork = multiprocessing.get_context('fork')
        receiver, sender = fork.Pipe(duplex=request['mode'] == PHASED)
        child = fork.Process(target=_fork_worker, args=(manifest, private_payload, sender, receiver, docker_gid))
    except BaseException as error:
        raise S._diagnose(error, PHASE, 'WORKER_START_REJECTED', last['memory'], error_type=MockRunnerError) from None
    cleanup = None
    try:
        transition = ({'transition': S._supervisor_backup_transition(ctx, inode, last, child, 'mock500',
                                                                  error_type=MockRunnerError, guard=guard)}
                      if request['mode'] == PHASED else {})
        response, cleanup = S._monitor_child(child, receiver, sender, guard,
            started_mono + request['maximumWallSeconds'], memory=lambda: last['memory'],
            latch=latch, error_type=MockRunnerError, **transition)
        result = validate_public_result(response['result'], manifest)
        if request['mode'] == PHASED:
            need(last.get('backupAck') == result['resourcePhases']['transition'])
        PHASE = 'closure'; guard(); need(S._members(ctx) == {os.getpid()})
        return {'worker': result, 'workerExited': True, 'checkoutFiles': len(manifest['sourcePins']),
            'checkoutBytes': manifest['checkoutBytes'], 'binaryBytes': manifest['binaryBytes'],
            'dockerSocketGID': docker_gid, 'workerUID': 1000, 'workerGID': 1000}
    except BaseException as error:
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'WORKER_RESULT_REJECTED'
        failure = S._diagnose(error, PHASE, reason, last['memory'], error_type=MockRunnerError)
        if cleanup is not None:
            failure.cleanup = cleanup; failure.refresh()
        raise failure from None


def _service_argv(request, ipc_dir, started_mono):
    ctx = S._ctx(request); unit, service, _ = P.names(ctx)
    remaining = int(started_mono + request['maximumWallSeconds'] - time.monotonic()); need(remaining > 0)
    return ['/usr/bin/sudo', '-n', '/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
        '--service-type=exec', '--unit=' + service, '--slice=' + unit, '--property=User=0', '--property=Group=0',
        '--property=RuntimeMaxSec=' + str(remaining), '--property=TimeoutStopSec=40', '--property=KillMode=control-group',
        '/usr/bin/env', '-i', *[key + '=' + value for key, value in P.P.process_env(ctx).items()],
        '/usr/bin/python3', '-B', str(SCRIPT), '--internal-supervisor', '--expected-commit', ctx['exactCommit'],
        '--run-id', ctx['runId'], '--nonce', ctx['nonce'], '--ipc-dir', str(ipc_dir)]


def launch(request, private_payload):
    """One fixed worker, fresh slice, no retries and no implicit original GO."""
    global PHASE
    PHASE = 'arguments'
    started_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); started_mono = time.monotonic()
    request = S._decode(S._encode(request)); private_payload = S._decode(S._encode(private_payload))
    validate_request(request, private_payload)
    PHASE = 'binding'; github_binding(request); S._identity_available()
    ctx = S._ctx(request); root, ipc_dir = S._roots(request)
    need(not os.path.lexists(root) and not os.path.lexists(ipc_dir)); ipc_dir.mkdir(mode=0o700)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(ipc_dir / 'result.sock')); os.chmod(ipc_dir / 'result.sock', 0o600); listener.listen(1)
    created, process, failure, inode, latch = False, None, None, None, P.P.StopLatch()
    last, empty_observed = {'memory': None}, False
    try:
        if request['mode'] == PHASED:
            P.P.R.capacity().host_admission()
        PHASE = 'parent'; P.privileged('prepare', ctx); created = True
        inode = P.identity(P.P.R.KERNEL_ROOT / P.names(ctx)[0])
        initial = S._parent_readback(P, ctx, inode, last, empty=True, error_type=MockRunnerError, phase=PHASE)
        _started(started_at, started_mono, request['maximumWallSeconds']); PHASE = 'service'
        process = subprocess.Popen(_service_argv(request, ipc_dir, started_mono), stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=S.ENV, close_fds=True, start_new_session=True)
        raw = S._encode({'request': request, 'private': private_payload,
                         'startedAtUTC': started_at, 'startedMonotonic': started_mono})
        process.stdin.write(raw); process.stdin.close()
        response = S._receive_result(listener, process, started_mono + request['maximumWallSeconds'] + 45, error_type=MockRunnerError)
        if type(response) is dict and response.get('ok') is False:
            raise _failure(response)
        code = process.wait(timeout=45)
        if code != 0:
            detail = {'reason': 'SERVICE_EXIT_REJECTED'}
            if type(code) is int and -255 <= code <= 255:
                detail['serviceExitCode'] = code
            raise MockRunnerError('service', runner=detail)
        need(type(response) is dict and set(response) == {'ok', 'result'}
             and response['ok'] is True and type(response['result']) is dict)
        result = response['result']; worker = validate_public_result(result['worker'], request)
        if request['mode'] == PHASED:
            P.resources().phases().validate_closure(worker['resourcePhases'], 'mock500',
                {key: request[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')},
                expected_identity={'device': inode[0], 'inode': inode[1]})
            ctx['processingBackupPhase'] = 'backup'
        PHASE = 'closure'
        final = S._parent_readback(P, ctx, inode, last, empty=True, error_type=MockRunnerError, phase=PHASE)
        _started(started_at, started_mono, request['maximumWallSeconds'])
        need(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes'] and not latch.seen)
        empty_observed = True
        phased = request['mode'] == PHASED
        extra = {}
        if phased:
            resource_phases = P.resources().phases().closure(worker['resourcePhases']['transition'], final)
            P.resources().phases().validate_closure(resource_phases, 'mock500',
                {key: request[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')})
            extra = {'resourcePhases': resource_phases, 'processingMemoryChecksCompleted': True,
                     'backupSafetyChecksCompleted': True}
        return {'status': ('PASS_FRESH_MOCK500_PHASED_RUNNER_OWNED_LIFETIME_ONLY' if phased
                           else 'PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY'), **extra, 'mode': request['mode'],
            'exactCommit': ctx['exactCommit'], 'runId': ctx['runId'], 'runAttempt': 1,
            'startedAtUTC': started_at, 'startedMonotonic': started_mono,
            'initialCommonParent': initial, 'finalCommonParentAfterOwnedExits': final,
            'sameKernelParentIdentity': True, 'ownedChildrenExited': True, 'workerResult': worker,
            'workerRoles': {key: result[key] for key in ('workerExited', 'checkoutFiles', 'checkoutBytes',
                'binaryBytes', 'dockerSocketGID', 'workerUID', 'workerGID')},
            'executionAuthority': False, 'mock500Acceptance': False, 'end500Acceptance': False,
            'commonLifetimeMemoryAccepted': False, 'retryAllowed': False}
    except BaseException as error:
        reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'SUPERVISOR_REJECTED'
        failure = S._diagnose(error, PHASE, reason, last['memory'], error_type=MockRunnerError)
        raise failure from None
    finally:
        after = S._cleanup_launch(ctx, P, inode, created, process, listener, latch, failure,
            empty_observed=empty_observed, error_type=MockRunnerError, kernel_root=P.P.R.KERNEL_ROOT)
        if failure is None and after is not None:
            raise after from None


def main(argv=None):
    """Private fixed service; the root workflow owns the public admitted CLI."""
    ctx, ipc_dir, latch = None, None, None
    try:
        parser = P.P.Parser(add_help=False, allow_abbrev=False)
        parser.add_argument('--internal-supervisor', action='store_true', required=True)
        for field in ('expected-commit', 'run-id', 'nonce', 'ipc-dir'):
            parser.add_argument('--' + field, required=True)
        args = parser.parse_args(argv)
        ctx = P.context(args.run_id, args.expected_commit, args.nonce); ipc_dir = args.ipc_dir
        need(os.getuid() == 0)
        null = os.open('/dev/null', os.O_WRONLY)
        try:
            os.dup2(null, 1); os.dup2(null, 2)
        finally:
            os.close(null)
        latch = P.P.StopLatch()
        envelope = S._decode(sys.stdin.buffer.read(S.MAX_IPC + 1))
        need(type(envelope) is dict and set(envelope) == {'request', 'private', 'startedAtUTC', 'startedMonotonic'})
        request, private_payload = envelope['request'], envelope['private']
        validate_request(request, private_payload)
        actual_ctx = S._ctx(request)
        need({key: value for key, value in actual_ctx.items()
              if key not in ('processingBackupStage', 'processingBackupPhase', 'processingImageId')} == ctx)
        ctx = actual_ctx
        result = supervise(request, private_payload, envelope['startedAtUTC'], envelope['startedMonotonic'], latch=latch)
        need(not latch.seen); S._send_result(ipc_dir, ctx, {'ok': True, 'result': result}); return 0
    except BaseException as error:
        if ctx is not None and ipc_dir is not None:
            try:
                reason = 'SUPERVISOR_INTERRUPTED' if isinstance(error, KeyboardInterrupt) else 'SUPERVISOR_REJECTED'
                failure = S._diagnose(error, PHASE, reason, error_type=MockRunnerError)
                response = S._failure_packet(failure)
                S._send_result(ipc_dir, ctx, response)
            except BaseException:
                pass
        return 1
    finally:
        if latch is not None:
            latch.close()


if __name__ == '__main__':
    raise SystemExit(main())
