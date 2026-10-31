"""Fixed later W15 job entry. Default is locked; imports never launch work.

The encrypted index and existing credentials travel only through bounded stdin
and private IPC. Synthetic qualification exercises admission and the measured
worker boundary without receiving originals or starting PostgreSQL.
"""
import sys
sys.dont_write_bytecode = True

import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import uuid
import zlib

HERE = Path(__file__).absolute().parent
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
LIMITS = {'comparisonBudgetBytes': 2560000000, 'maximumConsumptionBytes': 2048000000,
          'requiredReserveBytes': 512000000, 'swapBytes': 0}
CAPACITY = 'end500-restore-capacity-diagnostic'
END_CAPACITY = 'end500-full-capacity-diagnostic'
PHASED = 'end500-full-phased-gated'
DIAGNOSTIC = 'end500-restore-export-diagnostic'
EXPORT_ACTIONS = ('backup-before', 'backup-dump', 'backup-roles', 'backup-after')
EXPORT_PHASES = {'export-' + action for action in EXPORT_ACTIONS}
RESTORE_ACTIONS = ('restore-create', 'restore-roles', 'restore-render', 'restore-apply', 'restore-check')
RESTORE_PHASES = set(RESTORE_ACTIONS)
WALL = {END_CAPACITY: 3600, PHASED: 3600, CAPACITY: 1800, DIAGNOSTIC: 1800, 'end500-restore-synthetic': 300, 'end500-restore-gated': 1800, 'end500-full-gated': 3600}
SCOPES = {END_CAPACITY: 'ISOLATED_GITHUB_END500_CAPACITY_DIAGNOSTIC_ONLY', PHASED: 'ISOLATED_GITHUB_END500_PHASED_ONLY', CAPACITY: 'ISOLATED_GITHUB_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY', DIAGNOSTIC: 'ISOLATED_GITHUB_RESTORE_EXPORT_DIAGNOSTIC_ONLY', 'end500-restore-gated': 'ISOLATED_GITHUB_RECEPTION_RESTORE_ONLY',
          'end500-full-gated': 'ISOLATED_GITHUB_END500_ONLY'}
MAX_IPC, MAX_QUALIFICATION, MAX_INPUT = 1024 * 1024, 8 * 1024 * 1024, 65535
SEALED_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
REQUEST_KEYS = {'schema', 'mode', 'exactCommit', 'runId', 'runAttempt', 'nonce', 'branch', 'imageId',
                'nodeSource', 'postgrestSource', 'sourceQualification', 'approval', 'limits', 'maximumWallSeconds'}
MANIFEST_KEYS = REQUEST_KEYS - {'nodeSource', 'postgrestSource'} | {
    'stagedRepo', 'runnerTemp', 'rollbackRoot', 'backupRoot', 'parentUnit', 'binaries',
    'sourcePins', 'checkoutBytes', 'binaryBytes'}
DECLARATION_KEYS = {'nonce', 'sourceQualification', 'approval', 'limits', 'maximumWallSeconds'}
PRIVATE_KEYS = {'cipherIndex', 'keyB64', 'passphrase', 'eventInputs', 'artifactCredentials'}
CONNECTION_PHASES = {'binding', 'receive', 'input-binding', 'cache', 'prepare', 'restore', 'closure',
                     'prepared-check', 'materialization', 'container-start', 'readiness', 'native-restore', 'backup'}
BACKUP_PHASES = {'backup-export', 'backup-freeze', 'backup-collect', 'backup-seal',
                 'backup-transport', 'backup-authenticate', 'backup-recovery', 'backup-postcheck'}
CONNECTION_PHASES |= BACKUP_PHASES | EXPORT_PHASES | RESTORE_PHASES
RECEIVER_PHASES = {'arguments', 'source-binding', 'private-inputs', 'index', 'disk-admission',
                   'key-import', 'encrypted-index', 'download', 'cipher-readback',
                   'authenticated-reception', 'relocation', 'agent-close'}
RUNNER_PHASES = {'arguments', 'binding', 'parent', 'service', 'staging', 'worker', 'closure', 'ipc'}
STATUSES = {END_CAPACITY: 'MEASURED_FULL_END500_CAPACITY_ONLY_LEGACY_ACCEPTANCE_BLOCKED', PHASED: 'PASS_END500_PHASED_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING', DIAGNOSTIC: 'PASS_RESTORE_EXPORT_DIAGNOSTIC_ONLY_FULL_RESTORE_BLOCKED', 'end500-restore-synthetic': 'PASS_SYNTHETIC_RUNNER_BINDINGS_ONLY_START_BLOCKED',
            CAPACITY: 'MEASURED_FULL_RESTORE_CAPACITY_ONLY_LEGACY_ACCEPTANCE_BLOCKED',
                 'end500-restore-gated': 'PASS_SAME_JOB_RESTORE_BACKUP_500_INACTIVE_ONLY_START_BLOCKED',
            'end500-full-gated': 'PASS_END500_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'}
DIAGNOSTIC_RESULT = {'diagnosticExportOnly', 'restoreSteps', 'exportActions', 'profiles', 'activeProfiles',
    'ownedContainerStopped', 'watchStopped', 'remoteReadbackObserved', 'databaseRestoreObserved', 'fullRestoreAccepted'}
RESULT_BOOLS = {'isolatedRestoreObserved', 'end500BodyCompleted', 'originalTransferPerformed',
                'backupRoundtripVerified', 'sourceQualificationBound', 'syntheticQualification'}
RESULT_FALSE = {'executionAuthority', 'end500Acceptance', 'mock500Acceptance',
                'productionActions', 'fullLifetimeMemoryAccepted'}


class WorkflowRejected(RuntimeError):
    def __init__(self, phase='arguments', worker_memory=None, native_failure=None):
        self.phase = phase if phase in PHASES else 'arguments'
        self.worker_memory = worker_memory
        self.native_failure = _DIAGNOSTICS.native_failure(native_failure)
        super().__init__('W15_ISOLATED_WORKFLOW_FAILED_OR_UNKNOWN')


def need(value, phase='arguments'):
    if not value:
        raise WorkflowRejected(phase)


def _pairs(items):
    result = {}
    for key, value in items:
        need(key not in result)
        result[key] = value
    return result


def _decode(raw, maximum=MAX_IPC):
    need(type(raw) is bytes and 0 < len(raw) <= maximum)
    return json.loads(raw, object_pairs_hook=_pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(WorkflowRejected()))


def _encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def _load(name, repo=None):
    path = HERE / (name + '.py') if repo is None else Path(repo) / 'scripts/w15-github' / (name + '.py')
    module_name = 'w15_workflow_' + name
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(module_name, None)
        raise
    return module


# One closed vocabulary across worker, supervisor and public failure projection.
PHASES = set(_load('runner_diagnostics').OBSERVED_PHASES)


def _forward(repo):
    path = Path(repo) / 'scripts/synthetik-500-w15-memory-forward.py'
    name = 'w15_workflow_forward'
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    # A fresh worker may never inherit canonical modules from a different tree.
    for key, loaded in tuple(sys.modules.items()):
        if key.startswith('w15_github_'):
            need(Path(loaded.__file__).absolute().is_relative_to(Path(repo)), 'binding')
    return module


def decode_qualification(envelope):
    need(type(envelope) is dict and set(envelope) == {'encoding', 'data', 'sha256'}
         and envelope['encoding'] == 'zlib-base64' and type(envelope['data']) is str
         and 0 < len(envelope['data']) <= 512 * 1024
         and type(envelope['sha256']) is str and re.fullmatch('[a-f0-9]{64}', envelope['sha256']), 'qualification')
    packed = base64.b64decode(envelope['data'], validate=True)
    need(0 < len(packed) <= 384 * 1024, 'qualification')
    decoder = zlib.decompressobj()
    raw = decoder.decompress(packed, MAX_QUALIFICATION + 1)
    need(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail
         and 0 < len(raw) <= MAX_QUALIFICATION and len(raw) <= 128 * len(packed)
         and hashlib.sha256(raw).hexdigest() == envelope['sha256'], 'qualification')
    record = _decode(raw, MAX_QUALIFICATION)
    need(_encode(record) == raw and type(record) is dict and set(record) == {
        'schema', 'scope', 'status', 'exactCommit', 'sourcePins', 'historicalDeltas', 'executionAuthority', 'testStarted'}
         and record['schema'] == 'helmut-w15-static-source-qualification/1'
         and record['scope'] == 'ISOLATED_GITHUB_W15_SOURCE_ONLY'
         and record['status'] == 'PASS_INDEPENDENT_STATIC_SOURCE_REVIEW'
         and record['executionAuthority'] is False and record['testStarted'] is False, 'qualification')
    return raw, envelope['sha256'], record


def _public_binding(value):
    need(type(value) is dict and value.get('mode') in WALL
         and value.get('branch') == BRANCH and type(value.get('exactCommit')) is str
         and re.fullmatch('[a-f0-9]{40}', value['exactCommit'])
         and type(value.get('runId')) is str and re.fullmatch('[1-9][0-9]{4,19}', value['runId'])
         and type(value.get('runAttempt')) is int and value['runAttempt'] == 1
         and value.get('limits') == (_load('restore_capacity').LIMITS if value.get('mode') in (CAPACITY, END_CAPACITY) else LIMITS) and all(type(n) is int for n in value['limits'].values())
         and type(value.get('maximumWallSeconds')) is int
         and value['maximumWallSeconds'] == WALL[value['mode']]
         and type(value.get('imageId')) is str and re.fullmatch('sha256:[a-f0-9]{64}', value['imageId']), 'binding')
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'binding')
    need(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_REF') == BRANCH and os.environ.get('GITHUB_SHA') == value['exactCommit']
         and os.environ.get('GITHUB_RUN_ID') == value['runId'] and os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'binding')


def _utc(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', value), 'approval')
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def validate_admission(value, private_payload, *, now=None):
    """Separate code qualification, fresh observed binding and explicit scope GO."""
    _public_binding(value)
    raw, digest, qualification = decode_qualification(value['sourceQualification'])
    need(qualification['exactCommit'] == value['exactCommit'], 'qualification')
    if value['mode'] == 'end500-restore-synthetic':
        need(value['approval'] == {} and private_payload == {}, 'approval')
        return raw, digest, qualification
    approval = value['approval']
    required = {'schema', 'scope', 'authorized', 'exactCommit', 'branch', 'runAttempt', 'nonce', 'mode',
                'limits', 'maximumWallSeconds', 'sourceQualificationSHA256', 'maxReceiveAttempts',
                'issuedAt', 'expiresAt', 'maxStorageUSD', 'maxProviderCalls'}
    if value['mode'] == 'end500-full-gated':
        required.add('restoreAcceptance')
    if value['mode'] in (PHASED, END_CAPACITY):
        required |= {'restoreFunctionAcceptance', 'resourceContract'}
    need(type(approval) is dict and set(approval) == required
         and approval['schema'] == 'helmut-w15-workflow-start-approval/1'
         and approval['scope'] == SCOPES[value['mode']] and approval['authorized'] is True
         and all(approval[key] == value[key] for key in (
             'exactCommit', 'branch', 'runAttempt', 'nonce', 'mode', 'limits', 'maximumWallSeconds'))
         and type(approval['runAttempt']) is int and type(approval['maximumWallSeconds']) is int
         and all(type(n) is int for n in approval['limits'].values())
         and approval['sourceQualificationSHA256'] == digest
         and type(approval['maxReceiveAttempts']) is int and approval['maxReceiveAttempts'] == 1
         and approval['maxStorageUSD'] == ('0' if value['mode'] == DIAGNOSTIC else '0.05')
         and type(approval['maxProviderCalls']) is int and approval['maxProviderCalls'] == 0, 'approval')
    issued, expires = _utc(approval['issuedAt']), _utc(approval['expiresAt'])
    now = datetime.now(timezone.utc) if now is None else now
    need(0 < (expires - issued).total_seconds() <= 7200 and issued <= now < expires, 'approval')
    if value['mode'] == 'end500-full-gated':
        previous = approval['restoreAcceptance']
        need(type(previous) is dict and set(previous) == {'runId', 'exactCommit', 'receiptSHA256', 'status'}
             and previous['status'] == 'PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE'
             and previous['exactCommit'] == value['exactCommit'] and type(previous['runId']) is str
             and re.fullmatch('[1-9][0-9]{4,19}', previous['runId']) and previous['runId'] != value['runId']
             and type(previous['receiptSHA256']) is str and re.fullmatch('[a-f0-9]{64}', previous['receiptSHA256']), 'approval')
    if value['mode'] in (PHASED, END_CAPACITY):
        contract = _load('phase_contract')
        reference = approval['restoreFunctionAcceptance']
        need(approval['resourceContract'] == (contract.END_PROFILE if value['mode'] == PHASED else _load('end500_capacity_trace').PROFILE) and type(reference) is dict
             and set(reference) == set(contract.FUNCTION_REFERENCE) | {'targetCommit', 'compatibilityReviewSHA256'}
             and all(reference[k] == v for k, v in contract.FUNCTION_REFERENCE.items())
             and reference['legacyRestoreAccepted'] is False
             and reference['targetCommit'] == value['exactCommit']
             and type(reference['compatibilityReviewSHA256']) is str
             and re.fullmatch('[a-f0-9]{64}', reference['compatibilityReviewSHA256']), 'approval')
    need(type(private_payload) is dict and set(private_payload) == PRIVATE_KEYS, 'binding')
    for key, maximum in (('cipherIndex', MAX_INPUT), ('keyB64', 49152), ('passphrase', 4096)):
        need(type(private_payload[key]) is str and 0 < len(private_payload[key].encode()) <= maximum, 'binding')
    need(type(private_payload['eventInputs']) is dict and type(private_payload['artifactCredentials']) is dict
         and len(_encode(private_payload['artifactCredentials'])) <= 65536, 'binding')
    if value['mode'] == DIAGNOSTIC:
        need(private_payload['artifactCredentials'] == {}, 'binding')
    return raw, digest, qualification


def _event_inputs(request, inputs, private_payload):
    # GitHub may omit an empty optional string in the dispatch event. Only
    # the no-originals synthetic mode accepts that precise empty default.
    if request['mode'] == 'end500-restore-synthetic' and type(inputs) is dict:
        if 'w15_cipher_index' not in inputs or inputs['w15_cipher_index'] is None:
            inputs = {**inputs, 'w15_cipher_index': ''}
    need(type(inputs) is dict and set(inputs) == {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'}
         and all(type(v) is str for v in inputs.values())
         and inputs['w15_mode'] == request['mode'] and inputs['expected_commit'] == request['exactCommit'], 'event')
    declared = _decode(inputs['w15_request'].encode(), MAX_INPUT)
    need(type(declared) is dict and set(declared) == DECLARATION_KEYS
         and all(declared[k] == request[k] for k in DECLARATION_KEYS), 'event')
    dispatch = {'ref': BRANCH.removeprefix('refs/heads/'), 'inputs': inputs}
    need(sum(len(v) for v in inputs.values()) <= MAX_INPUT and len(_encode(inputs)) <= MAX_INPUT
         and len(_encode(dispatch)) <= MAX_INPUT, 'event')
    if request['mode'] == 'end500-restore-synthetic':
        need(inputs['w15_cipher_index'] == '' and private_payload == {}, 'event')
    else:
        need(private_payload['eventInputs'] == inputs
             and private_payload['cipherIndex'] == inputs['w15_cipher_index'], 'event')
        _load('encrypted_index').check_event(request['exactCommit'], private_payload['cipherIndex'],
            mode=request['mode'], extra_inputs={'w15_request': inputs['w15_request']}, event_inputs=inputs)


def validate_event(request, private_payload):
    path = os.environ.get('GITHUB_EVENT_PATH')
    need(type(path) is str and path.startswith('/'), 'event')
    with open(path, 'rb') as stream:
        event = _decode(stream.read(MAX_IPC + 1))
    need(type(event) is dict and 'inputs' in event, 'event')
    _event_inputs(request, event['inputs'], private_payload)


def _context(manifest, runtime):
    nonce = uuid.UUID(manifest['nonce'])
    root = manifest['runnerTemp'] + '/w15-end500-' + manifest['runId'] + '-' + nonce.hex
    return {'schema': 'helmut-w15-controller-context/1', 'scope': 'ISOLATED_GITHUB_END500_BINDING_ONLY',
        **{key: manifest[key] for key in ('nonce', 'runId', 'runAttempt', 'exactCommit', 'runnerTemp')},
        'hostPaths': {'runRoot': root, 'work': root + '/work', 'prepare': root + '/prepare', 'cache': root + '/cache'},
        'uidMap': {'runnerUID': os.getuid(), 'runnerGID': os.getgid(), 'containerUID': 1000, 'containerGID': 1000},
        'inputManifestPin': {'sha256': SEALED_SHA, 'fileCount': 12, 'totalBytes': 242570240},
        'sourcePins': {key: manifest['sourcePins'][key] for key in runtime.C.REQUIRED_SOURCE_PINS},
        'runtimePins': {**runtime.C.RUNTIME, 'imageId': manifest['imageId']},
        'executionAuthority': False, 'testStarted': False}


def _manifest(manifest):
    need(type(manifest) is dict and set(manifest) == MANIFEST_KEYS
         and manifest['schema'] == 'helmut-w15-runner-manifest/1'
         and os.getuid() == os.getgid() == 1000, 'binding')
    stem = Path('/tmp') / ('helmut-w15-runner-' + manifest['runId'] + '-' + uuid.UUID(manifest['nonce']).hex)
    expected = {'stagedRepo': stem / 'repo', 'runnerTemp': stem / 'worker-temp',
                'rollbackRoot': stem / 'rollback', 'backupRoot': stem / 'backup'}
    need(all(manifest[k] == str(v) for k, v in expected.items())
         and manifest['parentUnit'] == 'w15_' + manifest['runId'] + '_' + uuid.UUID(manifest['nonce']).hex + '.slice'
         and type(manifest['sourcePins']) is dict and type(manifest['binaries']) is dict
         and set(manifest['binaries']) == {'node', 'postgrest'}
         and type(manifest['checkoutBytes']) is int and manifest['checkoutBytes'] > 0
         and type(manifest['binaryBytes']) is int and manifest['binaryBytes'] > 0, 'binding')
    for key, path in expected.items():
        value = path.lstat()
        need(stat.S_ISDIR(value.st_mode) and not stat.S_ISLNK(value.st_mode)
             and value.st_uid == 1000 and stat.S_IMODE(value.st_mode) == 0o700, 'binding')
    for name, pin in manifest['binaries'].items():
        need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
             and pin['path'] == str(stem / 'binaries' / name), 'binding')


def _synthetic(manifest, runtime, context, qualification, guard):
    # This is source qualification and private synthetic IO, never a fake
    # original-reception/restore receipt. runRoot remains absent throughout.
    runtime._validate_qualification(context, qualification, Path(manifest['stagedRepo']))
    runtime.C.validate_context(context, Path(manifest['stagedRepo']))
    guard()
    root = Path(manifest['runnerTemp']) / ('synthetic-' + uuid.UUID(manifest['nonce']).hex)
    root.mkdir(mode=0o700)
    path = root / 'fictional-input.bin'
    data = b'HELMUT W15 FICTIONAL RUNNER QUALIFICATION ONLY\n' * 32
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        need(os.write(fd, data) == len(data), 'synthetic')
        os.fsync(fd)
    finally:
        os.close(fd)
    guard()
    need(path.read_bytes() == data and not Path(context['hostPaths']['runRoot']).exists(), 'synthetic')
    runtime.C.validate_context(context, Path(manifest['stagedRepo']))
    guard()


def validate_public_result(result):
    keys = {'status', 'mode', 'exactCommit', 'runId', 'runAttempt', 'verifiedFiles', 'verifiedBytes'} | RESULT_BOOLS | RESULT_FALSE
    diagnostic = type(result) is dict and result.get('mode') == DIAGNOSTIC
    if type(result) is dict and result.get('mode') in (CAPACITY, END_CAPACITY):
        keys |= {'capacityDiagnosticOnly', 'legacyRestoreAccepted'}
    if type(result) is dict and result.get('mode') == PHASED:
        keys |= {'resourcePhases', 'processingMemoryChecksCompleted', 'backupSafetyChecksCompleted'}
    if diagnostic: keys |= DIAGNOSTIC_RESULT
    need(type(result) is dict and set(result) == keys and result['mode'] in STATUSES
         and result['status'] == STATUSES[result['mode']] and type(result['exactCommit']) is str
         and re.fullmatch('[a-f0-9]{40}', result['exactCommit']) and type(result['runId']) is str
         and re.fullmatch('[1-9][0-9]{4,19}', result['runId'])
         and type(result['runAttempt']) is int and result['runAttempt'] == 1
         and all(type(result[k]) is bool for k in RESULT_BOOLS)
         and all(result[k] is False for k in RESULT_FALSE), 'closure')
    synthetic = result['mode'] == 'end500-restore-synthetic'
    need(type(result['verifiedFiles']) is int and result['verifiedFiles'] == (0 if synthetic else 12)
         and type(result['verifiedBytes']) is int and result['verifiedBytes'] == (0 if synthetic else 242570240)
         and result['syntheticQualification'] is synthetic and result['sourceQualificationBound'] is True
         and result['originalTransferPerformed'] is (not synthetic)
         and result['isolatedRestoreObserved'] is (not synthetic)
         and result['backupRoundtripVerified'] is (not synthetic and not diagnostic)
         and result['end500BodyCompleted'] is (result['mode'] in ('end500-full-gated', PHASED, END_CAPACITY)), 'closure')
    if diagnostic:
        need(result['diagnosticExportOnly'] is True and result['ownedContainerStopped'] is True
             and result['watchStopped'] is True and result['remoteReadbackObserved'] is False
             and result['databaseRestoreObserved'] is False and result['fullRestoreAccepted'] is False
             and all(type(result[k]) is int for k in ('restoreSteps', 'exportActions', 'profiles', 'activeProfiles'))
             and (result['restoreSteps'], result['exportActions'], result['profiles'], result['activeProfiles']) == (5, 4, 500, 0), 'closure')
    if result['mode'] in (CAPACITY, END_CAPACITY):
        need(result['capacityDiagnosticOnly'] is True and result['legacyRestoreAccepted'] is False, 'closure')
    if result['mode'] == PHASED:
        need(result['processingMemoryChecksCompleted'] is True and result['backupSafetyChecksCompleted'] is True, 'closure')
        need(type(result['resourcePhases']) is dict and 'context' in result['resourcePhases'], 'closure')
        context = result['resourcePhases']['context']
        _load('phase_contract').validate_closure(result['resourcePhases'], 'end500', context)
        need(all(context[k] == result[k] for k in ('exactCommit', 'runId', 'runAttempt')), 'closure')
    return result


def _result(manifest, resource_phases=None):
    synthetic = manifest['mode'] == 'end500-restore-synthetic'
    return validate_public_result({'status': STATUSES[manifest['mode']],
        **{key: manifest[key] for key in ('mode', 'exactCommit', 'runId', 'runAttempt')},
        'verifiedFiles': 0 if synthetic else 12, 'verifiedBytes': 0 if synthetic else 242570240,
        'isolatedRestoreObserved': not synthetic, 'end500BodyCompleted': manifest['mode'] in ('end500-full-gated', PHASED, END_CAPACITY),
        'originalTransferPerformed': not synthetic, 'backupRoundtripVerified': not synthetic and manifest['mode'] != DIAGNOSTIC,
        'sourceQualificationBound': True, 'syntheticQualification': synthetic,
        **dict.fromkeys(RESULT_FALSE, False),
        **({'resourcePhases': resource_phases, 'processingMemoryChecksCompleted': True,
            'backupSafetyChecksCompleted': True} if manifest['mode'] == PHASED else {}),
        **({'capacityDiagnosticOnly': True, 'legacyRestoreAccepted': False} if manifest['mode'] in (CAPACITY, END_CAPACITY) else {}),
        **({'diagnosticExportOnly': True, 'restoreSteps': 5, 'exportActions': 4, 'profiles': 500, 'activeProfiles': 0,
            'ownedContainerStopped': True, 'watchStopped': True, 'remoteReadbackObserved': False,
            'databaseRestoreObserved': False, 'fullRestoreAccepted': False} if manifest['mode'] == DIAGNOSTIC else {})})


def _diagnostic_export_hook(backup_code, guard):
    """Only the four existing export actions; no complete-backup hook is opened."""
    used = False
    def export(*, forward, inputs, resources, watch, restored):
        nonlocal used
        need(not used and restored['profiles'] == 500 and restored['active'] == 0 and restored['steps'] == 5, 'backup-export')
        used = True
        guard()
        context = inputs.backup_context()
        backup_code._bind_disk_guard(watch, guard)
        watch.backup_runner = backup_code.T.O.OwnedBackupRunner(watch, forward.M, base=forward.BASE,
            container=forward.CONTAINER, database=forward.DB, scope='end500-backup')
        result = backup_code.export_restore_database(context, expected_context=context, work=forward.WORK,
            container=forward.CONTAINER, database=forward.DB, supervisor=watch,
            run_owned=watch.backup_runner.run_owned)
        need(type(result) is dict and result.get('status') == 'PASS_DATABASE_AND_ROLES_EXPORTED_RESTORE_AND_READBACK_PENDING'
             and type(result.get('pins')) is dict and set(result['pins']) == set(EXPORT_ACTIONS)
             and result.get('databaseRestoreObserved') is False and result.get('remoteReadbackObserved') is False
             and result.get('acceptedAsCompleteBackup') is False, 'backup-postcheck')
        guard()
        return {'status': 'PASS_FOUR_RESTORE_EXPORT_ACTIONS_ONLY', 'exportActions': 4,
            'watchClosed': False, 'remoteReadbackObserved': False, 'databaseRestoreObserved': False,
            'acceptedAsCompleteBackup': False}
    return export


def _connection_failure_phase(error, connection_code, fallback):
    """Project only fixed checkpoints, never exception messages or free-form values.

    A receiver checkpoint records the last observed step, not a causal claim.
    In particular, receipt validation can fail after its final agent-close step.
    """
    # The legacy full controller exits only after its own cleanup. Preserve
    # its first fixed pre-hook backup boundary without exporting error text
    # or replacing an already retained first native failure.
    if type(error) is SystemExit and fallback == 'end500':
        backup_phase = getattr(error, 'backup_failure_phase', None)
        native = _DIAGNOSTICS.native_failure(_DIAGNOSTICS.attribute(error, 'native_failure'))
        if type(backup_phase) is str and backup_phase in BACKUP_PHASES and native is None:
            return backup_phase
    error_type = getattr(connection_code, 'RestoreConnectionError', None)
    if not isinstance(error_type, type) or type(error) is not error_type:
        return fallback
    phase = error.phase
    if type(phase) is not str or phase not in CONNECTION_PHASES:
        return fallback
    if phase == 'receive':
        receiver_phase = getattr(getattr(connection_code, 'E', None), 'PHASE', None)
        if type(receiver_phase) is str and receiver_phase in RECEIVER_PHASES:
            return 'receiver-' + receiver_phase
    return 'connection-' + phase


def run_worker(manifest, private_payload, *, phase_observer=None, backup_transition=None, capacity_observer=None,
               native_failure_observer=None):
    """A's single fixed UID1000 worker. Call only after measured bootstrap."""
    phase, connection_code, resources, backup_code, backup_failure = 'binding', None, None, None, None
    first_native = []
    def observe(name):
        if phase_observer is not None:
            phase_observer(name)
    def observe_native(value):
        closed = _DIAGNOSTICS.native_failure(value)
        need(closed is not None and not first_native, 'end500')
        first_native.append(closed)
        if native_failure_observer is not None:
            native_failure_observer(closed)
    try:
        observe(phase)
        raw, digest, qualification = validate_admission(manifest, private_payload)
        _manifest(manifest)
        if manifest['mode'] != 'end500-restore-synthetic':
            _event_inputs(manifest, private_payload['eventInputs'], private_payload)
        forward = _forward(manifest['stagedRepo'])
        runtime = forward._runtime_module('runtime_inputs')
        context = _context(manifest, runtime)
        runtime.C.validate_context(context, forward.ROOT)
        resources = (forward._runtime_module('common_resources').observe(context, processing_backup_stage='end500')
                     if manifest['mode'] == PHASED else forward._runtime_module('common_resources').observe(context, capacity_diagnostic=True,
                         **({'end_capacity_diagnostic': True} if manifest['mode'] == END_CAPACITY else {}))
                     if manifest['mode'] in (CAPACITY, END_CAPACITY) else forward.open_common_resources(context))
        resources.phase_observer = phase_observer
        resources.native_failure_observer = observe_native
        if manifest['mode'] == END_CAPACITY:
            need(callable(capacity_observer), 'binding')
            resources.capacity_observer = capacity_observer
        if manifest['mode'] == PHASED:
            need(callable(backup_transition), 'binding')
            resources.backup_transition = backup_transition
        phase = 'resources'
        observe(phase)
        resource_code = _load('restore_resources', manifest['stagedRepo'])
        plan = resource_code.admit_disk_plan(manifest['runnerTemp'], checkout_bytes=manifest['checkoutBytes'],
            binary_bytes=manifest['binaryBytes'], maximum_wall_seconds=manifest['maximumWallSeconds'])
        if manifest['mode'] in (CAPACITY, END_CAPACITY):
            plan.update(commonMemoryLimitBytes=4999999488, maximumActualCommonLifetimePeakBytes=4999999488,
                        requiredMemoryReserveBytes=0, capacityDiagnosticOnly=True, legacyContractAccepted=False)
        guard = resource_code.DiskGuard(manifest['runnerTemp'], plan, resources)
        guard()
        for name, pin in manifest['binaries'].items():
            need({k: pin[k] for k in ('bytes', 'sha256')} ==
                 {k: runtime.C.RUNTIME[name][k] for k in ('bytes', 'sha256')}, 'binding')
        if manifest['mode'] == 'end500-restore-synthetic':
            phase = 'synthetic'
            observe(phase)
            _synthetic(manifest, runtime, context, qualification, guard)
        else:
            connection_code = _load('restore_connection', manifest['stagedRepo'])
            observed = {key: manifest[key] for key in ('exactCommit', 'branch', 'runId', 'runAttempt', 'mode', 'nonce')}
            phase = 'receive-prepare'
            observe(phase)
            connection = connection_code.prepare_same_job(forward, context, resources,
                source_qualification_raw=raw, source_qualification_sha256=digest, observed_context=observed,
                private_payload=private_payload, node_source=manifest['binaries']['node']['path'],
                postgrest_source=manifest['binaries']['postgrest']['path'], disk_guard=guard)
            summary = connection.safe_summary()
            need(summary['verifiedFiles'] == 12 and summary['verifiedBytes'] == 242570240, phase)
            backup_code = _load('restore_backup', manifest['stagedRepo'])
            if manifest['mode'] == DIAGNOSTIC:
                phase = 'restore'
                observe(phase)
                restored = connection.restore_only(backup_completion=_diagnostic_export_hook(backup_code, guard),
                    export_diagnostic=True)
                need(restored['profiles'] == 500 and restored['active'] == 0 and restored['restoreSteps'] == 5
                     and restored['exportActions'] == 4 and restored['ownedContainerStopped'] is True
                     and restored['watchStopped'] is True and restored['diagnosticExportOnly'] is True
                     and restored['remoteReadbackObserved'] is False and restored['databaseRestoreObserved'] is False, phase)
            else:
                receipts = []
                full = manifest['mode'] in ('end500-full-gated', PHASED, END_CAPACITY)
                complete = (backup_code.completion_hook if full else backup_code.restore_completion_hook)(manifest, private_payload, guard)
                def capture(**kwargs):
                    nonlocal backup_failure
                    need(not receipts, 'backup')
                    try:
                        receipt = complete(**kwargs)
                        need(type(receipt) is dict and receipt.get('remoteReadbackObserved') is True
                             and receipt.get('databaseRestoreObserved') is True, 'backup-postcheck')
                        receipts.append(receipt)
                        return receipt
                    except BaseException as error:
                        # The legacy full controller retains its own closure and
                        # exits SystemExit(1). Keep only this first closed phase
                        # across that exit; never retain exception text or paths.
                        if backup_failure is None:
                            nested = getattr(error, 'phase', None)
                            backup_failure = nested if type(nested) is str and nested in BACKUP_PHASES else 'backup'
                            action = getattr(error, 'actionName', None)
                            if (type(error) is getattr(backup_code, 'BackupRuntimeError', None)
                                    and nested == 'backup-export' and type(action) is str and action in EXPORT_ACTIONS):
                                backup_failure = 'connection-export-' + action
                        raise
                if full:
                    phase = 'end500'
                    observe(phase)
                    if manifest['mode'] == END_CAPACITY:
                        observe('capacity-transport-complete')
                    forward.main(inputs=connection.controller_inputs(), common_resources=resources,
                                 backup_completion=capture, disk_guard=guard)
                else:
                    phase = 'restore'
                    observe(phase)
                    restored = connection.restore_only(backup_completion=capture)
                    need(restored['profiles'] == 500 and restored['active'] == 0
                         and restored['ownedContainerStopped'] is True
                         and restored['remoteReadbackObserved'] is True and restored['databaseRestoreObserved'] is True, phase)
                need(len(receipts) == 1, 'backup')
        phase = 'closure'
        observe(phase)
        guard()
        resources.sample()
        return _result(manifest, resources.phase_closure() if manifest['mode'] == PHASED else None)
    except WorkflowRejected as error:
        error.worker_memory = _cached_failure_memory(resources)
        error.native_failure = first_native[0] if first_native else error.native_failure
        raise
    except BaseException as error:
        selected = _connection_failure_phase(error, connection_code, phase)
        if backup_failure is not None:
            selected = backup_failure
        elif backup_code is not None and type(error) is getattr(backup_code, 'BackupRuntimeError', None):
            nested = getattr(error, 'phase', None)
            if type(nested) is str and nested in BACKUP_PHASES:
                selected = nested
        native = first_native[0] if first_native else _DIAGNOSTICS.native_failure(_DIAGNOSTICS.attribute(error, 'native_failure'))
        raise WorkflowRejected(selected, _cached_failure_memory(resources), native) from None


def _cached_failure_memory(resources):
    try:
        value = resources.failure_observation()
        return _load('common_resources').closed_failure_memory(value)
    except BaseException:
        return None


def plan():
    return {'status': 'BLOCKED_SEPARATE_EXPLICIT_GO_REQUIRED', 'modes': list(WALL),
            'originalTransferPerformed': False, 'databaseStarted': False,
            'executionAuthority': False, 'end500Acceptance': False, 'retryAllowed': False}


_DIAGNOSTICS = _load('runner_diagnostics')
_DIAGNOSTIC_MEMORY = _load('common_resources')


def _safe_failure(error):
    if isinstance(error, WorkflowRejected):
        result = {'phase': error.phase}
        native = _DIAGNOSTICS.native_failure(error.native_failure)
        if native is not None:
            result['runner'] = {'reason': 'WORKER_REPORTED_FAILURE', 'nativeFailure': native}
        return result
    candidate = _DIAGNOSTICS.attribute(error, 'safe_failure')
    return _DIAGNOSTICS.public(candidate, RUNNER_PHASES, PHASES,
        _DIAGNOSTIC_MEMORY.closed_failure_memory) or {'phase': 'arguments'}


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args in ([], ['--plan']):
        print(_encode(plan()).decode())
        return 0
    try:
        need(args == ['--launch'])
        envelope = _decode(sys.stdin.buffer.read(MAX_IPC + 1))
        need(type(envelope) is dict and set(envelope) == {'request', 'privatePayload'})
        request, private = envelope['request'], envelope['privatePayload']
        need(type(request) is dict and set(request) == REQUEST_KEYS
             and request['schema'] == 'helmut-w15-runner-request/1')
        validate_admission(request, private)
        validate_event(request, private)
        receipt = _load('runner_start').launch(request, private)
        # The outer bootstrap observes the actual lifetime after worker exit;
        # preserve that evidence and validate the worker's closed scalar part.
        expected_status = ('PASS_FRESH_PHASED_RUNNER_OWNED_LIFETIME_ONLY' if request['mode'] == PHASED else
                           'COMPLETED_FULL_END500_CAPACITY_DIAGNOSTIC_ONLY' if request['mode'] == END_CAPACITY else
                           'COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY' if request['mode'] == CAPACITY
                           else 'PASS_FRESH_RUNNER_OWNED_LIFETIME_ONLY')
        need(type(receipt) is dict and receipt.get('status') == expected_status, 'closure')
        if request['mode'] in (CAPACITY, END_CAPACITY):
            need(receipt.get('legacyRestoreAccepted') is False
                 and _load('restore_capacity').closed(receipt.get('capacityMeasurement')) is not None, 'closure')
        if request['mode'] == END_CAPACITY:
            need(receipt.get('legacyEnd500Accepted') is False and receipt.get('diagnosticOnly') is True
                 and _load('end500_capacity_trace').closed(receipt.get('end500CapacityTrace')) is not None, 'closure')
        if request['mode'] == PHASED:
            _load('phase_contract').validate_closure(receipt.get('resourcePhases'), 'end500',
                {k: request[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')})
        validate_public_result(receipt['workerResult'])
        need(all(receipt['workerResult'][k] == request[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt')), 'closure')
        print(_encode(receipt).decode())
        return 0
    except BaseException as error:
        print(_encode({'status': 'FAIL_W15_ISOLATED_WORKFLOW', **_safe_failure(error),
                      'executionAuthority': False, 'retryAllowed': False}).decode())
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
