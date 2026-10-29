"""One later, explicitly gated Mock500 job. Default is a closed public plan.

No original receive, database or test starts on import/--plan. Synthetic mode
qualifies only the new runner and public code binding, with no secret inputs.
"""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import time
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
FULL, SYNTHETIC = 'mock500-full-gated', 'mock500-runner-synthetic'
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
SYNTHETIC_BRANCH = 'refs/heads/codex/w15-mock500-integration-20261029'
END_BASELINES = {'7e3d96e99fc687b03bcb9a7cbe4a0f59c174859b', 'b6eb74495cd9cf4d7bee04ec4b37da6244b5c6a2',
                 'c89d423fd8431b42a5351de82e640f40e8517ee4'}
LIMITS = {'comparisonBudgetBytes': 2048000000, 'maximumConsumptionBytes': 1638400000,
          'requiredReserveBytes': 409600000, 'swapBytes': 0}
WALL = {SYNTHETIC: 300, FULL: 12600}
DECLARATION_KEYS = {'nonce', 'sourceQualification', 'approval', 'limits', 'maximumWallSeconds', 'bindings'}
MAX_IPC = 1024 * 1024
MAX_INPUT = 65535
PHASES = {'arguments', 'event', 'approval', 'qualification', 'binding', 'resources', 'synthetic',
          'receive-prepare', 'restore', 'mock500', 'backup', 'closure'}
MOCK_RECEIVER_PHASES = {'arguments', 'binding', 'private-inputs', 'key-import', 'outer-index',
    'original-download', 'original-reception', 'original-relocation', 'asset-download',
    'asset-reception', 'asset-readback', 'agent-close'}
PHASES |= {'mock-receiver-' + value for value in MOCK_RECEIVER_PHASES}


def need(value, phase='binding'):
    if not value:
        raise WorkflowRejected(phase)


class WorkflowRejected(RuntimeError):
    def __init__(self, phase='arguments', worker_memory=None):
        self.phase = phase if phase in PHASES else 'arguments'
        self.worker_memory = worker_memory
        super().__init__('MOCK500_WORKFLOW_FAILED_OR_UNKNOWN')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw, maximum=MAX_IPC):
    need(type(raw) is bytes and 0 < len(raw) <= maximum, 'arguments')
    def pairs(items):
        output = {}
        for key, value in items:
            need(key not in output, 'arguments'); output[key] = value
        return output
    return json.loads(raw, object_pairs_hook=pairs,
        parse_constant=lambda _: (_ for _ in ()).throw(WorkflowRejected()))


def component(name, repo=REPO):
    key = 'w15_github_' + name
    path = Path(repo) / 'scripts/w15-github' / (name + '.py')
    if key in sys.modules:
        need(Path(sys.modules[key].__file__).absolute() == path.absolute())
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec); sys.modules[key] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(key, None)
        raise
    return module


def controller(repo):
    """Fresh v2 controller; never import End500-forward's modified M instance."""
    name = 'w15_github_mock500_controller'
    path = Path(repo) / 'scripts/synthetik-500-w15-full500-controller.py'
    need(name not in sys.modules)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); sys.modules[name] = module
    spec.loader.exec_module(module)
    need((module.LIMIT, module.RESERVE) == (2048000000, 409600000))
    return module


def observed_context(value):
    return {key: value[key] for key in ('mode', 'branch', 'exactCommit', 'runId', 'runAttempt', 'nonce')}


def validate_admission(value, private_payload, *, repo=REPO):
    need(type(value) is dict and value.get('mode') in WALL
         and value.get('limits') == LIMITS and all(type(v) is int for v in value['limits'].values())
         and type(value.get('maximumWallSeconds')) is int
         and value['maximumWallSeconds'] == WALL[value['mode']]
         and type(value.get('runAttempt')) is int and value['runAttempt'] == 1
         and type(value.get('exactCommit')) is str and re.fullmatch('[a-f0-9]{40}', value['exactCommit'])
         and type(value.get('runId')) is str and re.fullmatch('[1-9][0-9]{4,19}', value['runId']))
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    branches = (BRANCH, SYNTHETIC_BRANCH) if value['mode'] == SYNTHETIC else (BRANCH,)
    need(value['branch'] in branches and os.environ.get('GITHUB_ACTIONS') == 'true'
         and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_SHA') == value['exactCommit'] and os.environ.get('GITHUB_REF') == value['branch']
         and os.environ.get('GITHUB_RUN_ID') == value['runId'] and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    raw, digest, qualification = component('restore_workflow', repo).decode_qualification(value['sourceQualification'])
    runtime = component('runtime_inputs', repo)
    runtime._validate_qualification({'exactCommit': value['exactCommit']}, qualification, Path(repo))
    if value['mode'] == SYNTHETIC:
        need(value['approval'] == {} and value['bindings'] == {} and private_payload == {}, 'approval')
        return raw, digest
    bindings = value['bindings']
    need(type(bindings) is dict and set(bindings) == {'end500Acceptance', 'compatibilityBridge',
         'inputBindingSHA256', 'additionalAssetBytes', 'approvedEnd500Commit'}
         and bindings['approvedEnd500Commit'] in END_BASELINES
         and type(bindings['additionalAssetBytes']) is int and 0 < bindings['additionalAssetBytes'] <= 1024 ** 3
         and type(bindings['inputBindingSHA256']) is str
         and re.fullmatch('[a-f0-9]{64}', bindings['inputBindingSHA256']), 'approval')
    request = {**value, 'sourceQualificationSHA256': digest}
    component('mock500_start', repo).validate_admission(request, bindings['end500Acceptance'],
        compatibility_bridge=bindings['compatibilityBridge'], observed_context=observed_context(value),
        expected_end500_commit=bindings['approvedEnd500Commit'])
    need(type(private_payload) is dict and set(private_payload) == {
         'cipherIndex', 'keyB64', 'passphrase', 'eventInputs', 'artifactCredentials'}, 'binding')
    return raw, digest


def validate_event(value, private_payload, *, event_inputs=None):
    if event_inputs is None:
        path = os.environ.get('GITHUB_EVENT_PATH')
        need(type(path) is str and path.startswith('/'), 'event')
        with open(path, 'rb') as stream:
            event = decode(stream.read(MAX_IPC + 1))
        need(type(event) is dict and type(event.get('inputs')) is dict, 'event')
        inputs = event['inputs']
    else:
        inputs = event_inputs
    if value['mode'] == SYNTHETIC and type(inputs) is dict:
        if 'w15_cipher_index' not in inputs or inputs['w15_cipher_index'] is None:
            inputs = {**inputs, 'w15_cipher_index': ''}
    need(type(inputs) is dict and set(inputs) == {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'}
         and all(type(v) is str for v in inputs.values())
         and inputs['w15_mode'] == value['mode'] and inputs['expected_commit'] == value['exactCommit'], 'event')
    declaration = decode(inputs['w15_request'].encode('utf-8'), MAX_INPUT)
    need(type(declaration) is dict and set(declaration) == DECLARATION_KEYS
         and all(declaration[key] == value[key] for key in DECLARATION_KEYS), 'event')
    dispatch = {'ref': value['branch'].removeprefix('refs/heads/'), 'inputs': inputs}
    need(sum(len(v) for v in inputs.values()) <= MAX_INPUT
         and len(canonical(inputs)) <= MAX_INPUT and len(canonical(dispatch)) <= MAX_INPUT, 'event')
    if value['mode'] == SYNTHETIC:
        need(inputs['w15_cipher_index'] == '' and private_payload == {}, 'event')
    else:
        need(private_payload['eventInputs'] == inputs and private_payload['cipherIndex'] == inputs['w15_cipher_index'], 'event')
        component('encrypted_index').check_event(value['exactCommit'], private_payload['cipherIndex'],
            mode=FULL, extra_inputs={'w15_request': inputs['w15_request']}, event_inputs=inputs)


def validate_manifest(value):
    legacy = component('restore_workflow')
    need(type(value) is dict and set(value) == legacy.MANIFEST_KEYS | {'bindings', 'startedAtUTC', 'startedMonotonic'}
         and value['schema'] == 'helmut-w15-runner-manifest/1' and os.getuid() == os.getgid() == 1000)
    root = Path('/tmp') / ('helmut-w15-runner-' + value['runId'] + '-' + uuid.UUID(value['nonce']).hex)
    need(all(value[key] == str(root / name) for key, name in (
        ('stagedRepo', 'repo'), ('runnerTemp', 'worker-temp'), ('rollbackRoot', 'rollback'), ('backupRoot', 'backup'))))
    need(value['parentUnit'] == 'w15_' + value['runId'] + '_' + uuid.UUID(value['nonce']).hex + '.slice')
    need(type(value['startedAtUTC']) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', value['startedAtUTC'])
         and type(value['startedMonotonic']) in (int, float) and math.isfinite(value['startedMonotonic'])
         and 0 < value['startedMonotonic'] <= time.monotonic())
    for key in ('stagedRepo', 'runnerTemp', 'rollbackRoot', 'backupRoot'):
        fd = component('runtime_inputs').C._directory(value[key])
        try:
            observed = os.fstat(fd)
            need(observed.st_uid == 1000 and observed.st_mode & 0o777 == 0o700)
        finally:
            os.close(fd)


def _result(manifest):
    synthetic = manifest['mode'] == SYNTHETIC
    result = {**{key: manifest[key] for key in ('mode', 'exactCommit', 'runId', 'runAttempt')},
        'status': 'PASS_MOCK500_SYNTHETIC_RUNNER_ONLY_START_BLOCKED' if synthetic else 'PASS_MOCK500_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING',
        'syntheticQualification': synthetic, 'originalTransferPerformed': not synthetic,
        'profiles': 0 if synthetic else 500, 'activeProfiles': 0, 'units': 0 if synthetic else 500,
        'providerPhases': 0 if synthetic else 1000, 'results': 0 if synthetic else 1500,
        'controls': 0 if synthetic else 8000, 'backupRoundtripVerified': not synthetic,
        'executionAuthority': False, 'mock500Acceptance': False, 'end500Acceptance': False}
    return component('mock500_runner').validate_public_result(result, manifest)


def run_worker(manifest, private_payload):
    phase, resources = 'binding', None
    try:
        raw, digest = validate_admission(manifest, private_payload)
        validate_manifest(manifest)
        if manifest['mode'] == FULL:
            validate_event(manifest, private_payload, event_inputs=private_payload['eventInputs'])
        context_code = component('mock500_context')
        context = context_code.build_context(manifest)
        resources = component('mock500_resources').observe(context)
        if manifest['mode'] == SYNTHETIC:
            phase = 'synthetic'
            resources.sample()
            folder = Path(manifest['runnerTemp']) / ('fixture-' + uuid.UUID(manifest['nonce']).hex)
            folder.mkdir(mode=0o700)
            file = folder / 'fictional-input.bin'; payload = b'MOCK500 PUBLIC RUNNER QUALIFICATION ONLY\n' * 32
            with file.open('xb') as stream:
                os.fchmod(stream.fileno(), 0o600); stream.write(payload); stream.flush(); os.fsync(stream.fileno())
            need(file.read_bytes() == payload and not Path(context['hostPaths']['runRoot']).exists(), phase)
            resources.sample()
            return _result(manifest)
        phase = 'resources'
        bindings = manifest['bindings']; resource_code = component('mock500_resources')
        plan = resource_code.admit_disk_plan(manifest['runnerTemp'], checkout_bytes=manifest['checkoutBytes'],
            binary_bytes=manifest['binaryBytes'], additional_asset_bytes=bindings['additionalAssetBytes'])
        disk = resource_code.DiskGuard(manifest['runnerTemp'], plan, resources,
            started_monotonic=manifest['startedMonotonic'])
        start = component('mock500_start').StartGuard(context, manifest['approval'], bindings['end500Acceptance'],
            resources, compatibility_bridge=bindings['compatibilityBridge'], observed_context=observed_context(manifest),
            started_at=datetime.strptime(manifest['startedAtUTC'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc),
            started_monotonic=manifest['startedMonotonic'], expected_end500_commit=bindings['approvedEnd500Commit'])
        def prepare_guard():
            start.before_dispatch(kind='prepare'); return disk()
        def closing_guard():
            start.closure_guard(); return disk()
        prepare_guard()
        phase = 'receive-prepare'
        reception = component('mock500_receive').prepare_inputs(context, private_payload,
            input_binding_sha256=bindings['inputBindingSHA256'], additional_asset_bytes=bindings['additionalAssetBytes'],
            guard=prepare_guard, repo=REPO)
        runtime = context_code.open_runtime_inputs(reception['received_root'], context=context,
            qualification_raw=raw, qualification_sha256=digest, observed_context=observed_context(manifest))
        paths = {**reception['asset_paths'], 'originalReception': runtime.path('reception'),
            **{key: manifest['binaries'][key]['path'] for key in ('node', 'postgrest')}}
        inputs = component('mock500_inputs').open_inputs(runtime, context=context,
            binding_raw=reception['binding_raw'], binding_sha256=bindings['inputBindingSHA256'],
            asset_paths=paths, observed_context=observed_context(manifest))
        need(inputs.declared_additional_input_bytes() == bindings['additionalAssetBytes'])
        receipts = []
        finish = component('mock500_backup').completion_hook(manifest, private_payload, closing_guard)
        def capture(**kwargs):
            need(not receipts, 'backup')
            receipt = finish(**kwargs)
            need(type(receipt) is dict and all(receipt.get(key) is True for key in (
                'remoteReadbackObserved', 'databaseRestoreObserved', 'ownedContainerStopped', 'watchClosed')), 'backup')
            receipts.append(receipt)
            return receipt
        phase = 'mock500'
        final = controller(REPO).run_bound(inputs, resources, start, capture, disk_guard=disk)
        need(final['status'] == 'PASS_MOCK500_BODY_AND_BACKUP_INDEPENDENT_ACCEPTANCE_PENDING'
             and final['bodyCompleted'] is True and final['ownedContainerStopped'] is True
             and len(receipts) == 1, 'closure')
        phase = 'closure'; closing_guard(); resources.sample()
        return _result(manifest)
    except WorkflowRejected as error:
        error.worker_memory = _cached_memory(resources)
        raise
    except BaseException as error:
        # Only fixed component checkpoints survive; no exception text or paths.
        child_phase = getattr(error, 'phase', None)
        receiver = sys.modules.get('w15_github_mock500_receive')
        if receiver is not None and type(error) is getattr(receiver, 'MockReceiveError', None):
            if child_phase in MOCK_RECEIVER_PHASES:
                child_phase = 'mock-receiver-' + child_phase
        raise WorkflowRejected(child_phase if child_phase in PHASES else phase, _cached_memory(resources)) from None


def _cached_memory(resources):
    try:
        return component('common_resources').closed_failure_memory(resources.failure_observation())
    except BaseException:
        return None


def plan():
    return {'status': 'BLOCKED_MOCK500_GO_END500_ACCEPTANCE_AND_INPUT_BINDINGS_REQUIRED',
        'codePreparedOnly': True, 'originalTransferPerformed': False, 'databaseStarted': False,
        'fullMock500Executed': False, 'executionAuthority': False, 'mock500Acceptance': False,
        'actualRAMAcceptance': False, 'retryAllowed': False}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv in ([], ['--plan']):
        print(canonical(plan()).decode()); return 0
    try:
        need(argv == ['--launch'], 'arguments')
        envelope = decode(sys.stdin.buffer.read(MAX_IPC + 1))
        need(type(envelope) is dict and set(envelope) == {'request', 'privatePayload'}, 'arguments')
        request, private = envelope['request'], envelope['privatePayload']
        runner = component('mock500_runner')
        runner.validate_request(request, private)
        validate_admission(request, private)
        validate_event(request, private)
        receipt = runner.launch(request, private)
        need(receipt.get('status') == 'PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY', 'closure')
        runner.validate_public_result(receipt['workerResult'], request)
        print(canonical(receipt).decode()); return 0
    except BaseException as error:
        phase = getattr(error, 'phase', 'arguments')
        allowed = PHASES | {'parent', 'service', 'staging', 'worker', 'ipc'}
        safe = {'status': 'FAIL_OR_BLOCKED_MOCK500_WORKFLOW', 'phase': phase if phase in allowed else 'arguments',
                'executionAuthority': False, 'retryAllowed': False}
        child = getattr(error, 'safe_failure', {}).get('worker')
        if type(child) is dict and set(child) in ({'phase'}, {'phase', 'memory'}) and type(child['phase']) is str and child['phase'] in PHASES:
            safe['worker'] = {'phase': child['phase']}
            if 'memory' in child:
                memory = component('common_resources').closed_failure_memory(child['memory'])
                if memory is not None:
                    safe['worker']['memory'] = memory
        print(canonical(safe).decode()); return 1


if __name__ == '__main__':
    raise SystemExit(main())
