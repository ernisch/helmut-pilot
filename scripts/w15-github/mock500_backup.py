"""Mock-only closure adapters around the existing owned backup and GPG tools.

No End500 closure, context or v3 RAM acceptance is repurposed as Mock proof.
The fixed native workers, lifecycle checks, collector primitives, seal format
and official artifact channel are reused. Imports have no execution effects.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import threading
import time
import uuid


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_backup_' + name,
                                                Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R, P, O, T, C = (_load(name) for name in (
    'runtime_backup', 'mock500_resources', 'runtime_owned_backup', 'runtime_restore', 'restore_backup'))
S, BASE, DATABASE = R.S, '/tmp/w15-full500-20261028d', 'helmut_w15_full500_20261028b'
SCOPE = 'ISOLATED_GITHUB_MOCK500_BACKUP_ONLY'
FINGERPRINT = C.FINGERPRINT


class BackupRejected(RuntimeError):
    pass


def need(value, code='MOCK500_BACKUP_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED'):
    if not value:
        raise BackupRejected(code)


def _mock_restore_worker():
    original = 'database==="helmut_w15_memory_atomic_20261028d"'
    replacement = 'database==="' + DATABASE + '"'
    need(T.NODE_WORKER.count(original) == 1 and T.NODE_WORKER.count(replacement) == 0)
    worker = T.NODE_WORKER.replace(original, replacement, 1)
    need(worker.replace(replacement, original, 1) == T.NODE_WORKER)
    return worker


RESTORE_NODE_WORKER = _mock_restore_worker()


def _context(context):
    need(isinstance(context, dict) and set(context) == {'schema', 'scope', 'nonce', 'exactCommit',
        'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint', 'executionAuthority'})
    need(context['schema'] == 'helmut-w15-backup-context/1' and context['scope'] == SCOPE
         and context['executionAuthority'] is False and context['recipientFingerprint'] == FINGERPRINT
         and isinstance(context['exactCommit'], str) and R.B.COMMIT.fullmatch(context['exactCommit'])
         and isinstance(context['runId'], str) and re.fullmatch('[1-9][0-9]{4,19}', context['runId'])
         and type(context['runAttempt']) is int and context['runAttempt'] == 1
         and isinstance(context['inputManifestSHA'], str) and R.B.SHA.fullmatch(context['inputManifestSHA']))
    nonce = uuid.UUID(context['nonce'])
    need(str(nonce) == context['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    return nonce


def _sample(supervisor, resources, guard):
    guard()
    need(getattr(resources, 'profile', None) == P.PROFILE
         and supervisor.common_resources is resources and supervisor.thread.is_alive()
         and not supervisor.finished.is_set())
    supervisor.sample()
    return json.loads(json.dumps(P.assess(resources.sample())))


class MockOwnedRunner(O.OwnedBackupRunner):
    """Only fixed Mock namespace/profile initialization; existing owned lifecycle."""
    def __init__(self, supervisor, controller, *, restore=False):
        need(controller.BASE == BASE and controller.DB == DATABASE
             and re.fullmatch(r'w15-mock500-[1-9][0-9]{4,19}-[a-f0-9]{32}', controller.CONTAINER)
             and controller.DOCKER == list(R.DOCKER)
             and getattr(supervisor.common_resources, 'profile', None) == P.PROFILE)
        self.watch, self.controller = supervisor, controller
        self.base, self.container, self.database = BASE, controller.CONTAINER, DATABASE
        self.scope = 'mock500-restore' if restore else 'mock500-backup'
        self.actions = O.RESTORE_ACTIONS if restore else O.ACTIONS
        self.failure_reason, self.stop_reason = 'mock500-owned-stage-failed', 'mock500-owned-stop-unconfirmed'
        self.started, self.stops, self.lock = set(), {}, threading.Lock()


def _step_receipt(output_fd, state_fd, action, *, restore, guard):
    receipt = R._json(output_fd, action + '.SAFE.json')
    fields = {'status', 'action', 'returncode', 'signal', 'output', 'stderr', 'identity', 'lifecycle'}
    need(set(receipt) == (fields | {'renderedSQL'} if restore and action == 'restore-render' else fields)
         and receipt['status'] == ('PASS_OWNED_ISOLATED_RESTORE_STEP' if restore else 'PASS_OWNED_DATABASE_EXPORT_STEP')
         and receipt['action'] == action and type(receipt['returncode']) is int
         and receipt['returncode'] == 0 and receipt['signal'] is None)
    name = T.OUTPUTS[action] if restore else R.OUTPUTS[action]
    pin = R._pin(output_fd, name, guard)
    need(pin == receipt['output'] and R._pin(output_fd, action + '.PRIVATE.stderr', guard) == receipt['stderr'])
    lifecycle = T._lifecycle(output_fd, action) if restore else R._lifecycle(output_fd, action)
    identity = R._json(state_fd, action + '.node.SAFE.json')
    need(identity == receipt['identity'] == lifecycle and set(identity) == {'phase', 'pid', 'startTicks'}
         and identity['phase'] == action and type(identity['pid']) is int and identity['pid'] > 1
         and isinstance(identity['startTicks'], str) and identity['startTicks'].isdigit())
    need(R._pin(output_fd, action + '.lifecycle.PRIVATE.jsonl', guard) == receipt['lifecycle'])
    if restore and action == 'restore-render':
        need(R._pin(output_fd, 'rendered.PRIVATE.sql', guard) == receipt['renderedSQL'])
    if not restore:
        need(pin['bytes'] > 0)
    return pin


def _native_steps(controller, resources, supervisor, guard, *, restore=False):
    if not restore:
        # The owned runner temporarily enables active TERM/timeout handling.
        # That mechanical setting must not reopen the processing deadline.
        supervisor.mock_backup_closure = True
    runner = MockOwnedRunner(supervisor, controller, restore=restore)
    supervisor.backup_runner = runner
    output = Path(controller.WORK) / 'state' / ('restore' if restore else 'final-backup')
    parent = S._directory(str(output.parent), private=True)
    try:
        os.mkdir(output.name, 0o700, dir_fd=parent)
        os.fsync(parent)
    finally:
        os.close(parent)
    fd = S._directory(str(output), private=True)
    state = S._directory(str(output.parent), private=True)
    deadline, pins = time.monotonic() + 600, {}
    previous_failure_handler = supervisor.first_failure
    def owned_failure(error):
        if supervisor.stage_name in runner.actions:
            return runner.first_failure(error)
        return previous_failure_handler(error)
    supervisor.first_failure = owned_failure
    try:
        first = _sample(supervisor, resources, guard)
        for action in runner.actions:
            _sample(supervisor, resources, guard)
            remaining = int(deadline - time.monotonic())
            need(remaining > 10)
            worker = RESTORE_NODE_WORKER if restore else R.NODE_WORKER
            arguments = (BASE, action, DATABASE) if restore else (BASE, action, DATABASE, R.SNAPSHOT_SQL)
            command = ('umask 077; set -Ce; echo $$ >' + BASE + '/state/' + action + '.pid; '
                'exec timeout --signal=TERM --kill-after=5s ' + str(remaining - 5) + 's '
                + BASE + '/node -e ' + shlex.quote(worker) + ' ' + ' '.join(map(shlex.quote, arguments)))
            argv = list(R.DOCKER) + ['exec', '--user', '1000:1000', controller.CONTAINER, 'sh', '-c', command]
            process = runner.run_owned(argv, action, remaining)
            need(isinstance(process, subprocess.CompletedProcess) and process.args == argv
                 and type(process.returncode) is int and process.returncode == 0)
            pins[action] = _step_receipt(fd, state, action, restore=restore, guard=guard)
            _sample(supervisor, resources, guard)
        if restore:
            zero = R._json(fd, T.OUTPUTS['restore-check'])
            need(set(zero) == {'profiles', 'active'} and type(zero['profiles']) is int
                 and zero['profiles'] == 500 and type(zero['active']) is int and zero['active'] == 0)
            result = {'schema': 'helmut-w15-mock500-owned-native-restore/1',
                'status': 'PASS_FIVE_NATIVE_MOCK500_RESTORE_STEPS_500_ZERO_ONLY', 'profiles': 500, 'active': 0,
                'steps': 5, 'pins': pins, 'initialKernelSample': first,
                'finalKernelSample': _sample(supervisor, resources, guard), 'executionAuthority': False,
                'acceptedAsCompleteBackup': False, 'mock500Acceptance': False}
            R._write(fd, 'RESTORE_CLOSURE.PRIVATE.json', (json.dumps(result, sort_keys=True) + '\n').encode())
            return result
        before, after = (R._json(fd, R.OUTPUTS[k], limit=8 * 1024 * 1024)
                         for k in ('backup-before', 'backup-after'))
        need(before == after and before['database'] == DATABASE and before['profiles'] == 500
             and before['activeProfiles'] == before['otherClientBackends'] == 0
             and before['readOnly'] == 'on' and isinstance(before['rolesDigest'], str)
             and re.fullmatch('[a-f0-9]{32}', before['rolesDigest']))
        C._inventory(before)
        child, _ = S._file(fd, R.OUTPUTS['backup-dump'])
        try:
            need(os.read(child, 5) == b'PGDMP')
        finally:
            os.close(child)
        return {'schema': 'helmut-w15-mock500-database-export/1',
            'status': 'PASS_FOUR_NATIVE_EXPORT_STEPS_ONLY', 'pins': pins,
            'beforeSnapshot': before, 'afterSnapshot': after,
            'initialKernelSample': first, 'finalKernelSample': _sample(supervisor, resources, guard),
            'acceptedAsCompleteBackup': False, 'executionAuthority': False}
    finally:
        supervisor.first_failure = previous_failure_handler
        os.close(state)
        os.close(fd)


def _number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def _auth_observations(runtime):
    """Validate retained native ACKs, never infer them from a PASS header."""
    mutations, usage, writes = (runtime.get(key) for key in ('authMutations', 'usageSinks', 'casWrites'))
    need(type(mutations) is list and bool(mutations) and type(usage) is list and len(usage) == 1000
         and type(writes) is list and bool(writes))
    envelopes, finish, usage_by_unit = {}, {}, [0] * 500
    for row in mutations + usage:
        need(type(row) is dict and type(row.get('id')) is int and row['id'] > 0 and row['id'] not in envelopes
             and type(row.get('index')) is int and 0 <= row['index'] < 500
             and row.get('acknowledged') is True and 'failure' not in row
             and all(_number(row.get(key)) for key in ('beginMS', 'ackMS', 'endMS', 'wallMs'))
             and row['beginMS'] <= row['ackMS'] <= row['endMS']
             and row['wallMs'] < 30000 and row['endMS'] - row['beginMS'] < 30000)
        envelopes[row['id']] = row
        if 'finishIndex' in row:
            need(type(row['finishIndex']) is int and row['finishIndex'] == row['index']
                 and row['finishIndex'] not in finish and row.get('kind') == 'public-mutation')
            finish[row['finishIndex']] = row['ackMS']
    need(set(finish) == set(range(500)))
    for row in usage:
        need(row.get('kind') == 'usage-sink' and row.get('storageAcknowledged') is True
             and row.get('storageMode') == 'relational-atomic-v1')
        usage_by_unit[row['index']] += 1
    need(usage_by_unit == [2] * 500)
    used, write_ids = set(), set()
    for row in writes:
        need(type(row) is dict and type(row.get('id')) is int and row['id'] >= 0 and row['id'] not in write_ids
             and type(row.get('envelopeId')) is int and row['envelopeId'] in envelopes
             and row.get('rowId') == 'main-auth' and row.get('storageMode') == 'relational-atomic-v1'
             and row.get('acknowledged') is True and 'failure' not in row
             and all(_number(row.get(key)) for key in ('beginMS', 'ackMS', 'endMS', 'wallMs'))
             and row['beginMS'] <= row['ackMS'] <= row['endMS']
             and row['wallMs'] < 30000 and row['endMS'] - row['beginMS'] < 30000)
        outer = envelopes[row['envelopeId']]
        need(type(row.get('index')) is int and row['index'] == outer['index']
             and outer['beginMS'] <= row['beginMS'] <= row['ackMS'] <= outer['ackMS']
             and row['endMS'] <= outer['endMS'])
        used.add(row['envelopeId']); write_ids.add(row['id'])
    need(used == set(envelopes))
    return finish


def _provider_observations(runtime, units):
    phases = runtime.get('providerPhases')
    need(type(runtime.get('localSimulations')) is int and runtime['localSimulations'] == 1000
         and type(phases) is list and len(phases) == 1000)
    for offset, row in enumerate(phases):
        index, phase = divmod(offset, 2)
        need(type(row) is dict and type(row.get('index')) is int and row['index'] == index
             and row.get('phase') == ('D', 'R')[phase]
             and row.get('nativePermanentSendClaim') is True and row.get('nativeCostReservation') is True
             and row.get('actualModelOutput') is False and row.get('simulatedUsage') is True
             and all(_number(row.get(key)) for key in ('beginMS', 'endMS', 'actualDelayMS'))
             and 0 <= row['endMS'] - row['beginMS'] < 20000 and row['actualDelayMS'] < 20000
             and row['actualDelayMS'] == row['endMS'] - row['beginMS']
             and units[index]['beginMS'] <= row['beginMS'] <= row['endMS'] <= units[index]['finalACKMS']
             and (phase == 0 or phases[offset - 1]['endMS'] <= row['beginMS']))
        if index in (0, 499):
            need(row.get('requiredDelayMs') == 19900 and row['actualDelayMS'] >= 19900)


def _stored_result_observations(audit, units):
    areas = {'mandatsbriefing', 'morgenbriefing', 'lage'}
    observed, positions = audit.get('units'), audit.get('positions')
    categories = audit.get('categories')
    need(type(observed) is list and len(observed) == 500 and type(positions) is list and len(positions) == 1500
         and type(audit.get('storedPrivateDraftReviewRows')) is int and audit['storedPrivateDraftReviewRows'] == 1000
         and type(audit.get('passedChecks')) is int and audit['passedChecks'] == 17000
         and type(categories) is dict and set(categories) == {'missing', 'empty', 'duplicate', 'technicallyInvalid', 'unusable'}
         and all(type(value) is int and value == 0 for value in categories.values()))
    ids, selected = set(), set()
    for index, row in enumerate(observed):
        need(type(row) is dict and type(row.get('index')) is int and row['index'] == index
             and row.get('owner') == units[index]['owner'] and type(row.get('checks')) is int and row['checks'] == 34
             and type(row.get('passedChecks')) is int and row['passedChecks'] == 34
             and row.get('failedChecks') == [] and row.get('queryOrReadbackFailure') is False
             and type(row.get('results')) is list and len(row['results']) == 3
             and {entry.get('area') for entry in row['results']} == areas)
        for entry in row['results']:
            need(type(entry.get('id')) is str and bool(entry['id']) and entry['id'] not in ids
                 and type(entry.get('canonicalHash')) is str and re.fullmatch('[a-f0-9]{64}', entry['canonicalHash']))
            retained = [position for position in units[index]['positions'] if position.get('bereich') == entry['area']]
            need(len(retained) == 1 and retained[0].get('mandatsId') == row['owner']
                 and retained[0].get('status') == 'stored-unreviewed'
                 and retained[0].get('ergebnisHash') == entry['canonicalHash'])
            ids.add(entry['id'])
    for row in positions:
        need(type(row) is dict and type(row.get('index')) is int and 0 <= row['index'] < 500
             and row.get('owner') == units[row['index']]['owner'] and row.get('area') in areas
             and row.get('categories') == [] and row.get('status') == 'stored-unreviewed')
        key = (row['index'], row['area'])
        need(key not in selected); selected.add(key)


def _mock_closure(work, result):
    fd = S._directory(str(work), private=True)
    try:
        cleanup = R._json(fd, 'CLEANUP.SAFE.json')
        audit = R._json(fd, 'RESULTS_INDEPENDENT.SAFE.json', limit=8 * 1024 * 1024)
        runtime = R._json(fd, 'FULL500_RUNTIME_RESULT.SAFE.json', limit=32 * 1024 * 1024)
        body = R._json(fd, 'CONTROLLER_BODY.SAFE.json')
        service = R._json(fd, 'SERVICE_CLOSURE.SAFE.json')
        need(cleanup.get('confirmedZero') is True and cleanup.get('nativeBoundZero') is True
             and type(cleanup['after']['active']) is int and cleanup['after']['active'] == 0
             and cleanup.get('writeOutcome') != 'UNKNOWN')
        need(audit.get('storedResultsAccepted') is True and audit.get('status') == 'PASS_ALL500_STORED_MOCK_RESULTS_ONLY'
             and type(audit.get('unitChecksCompleted')) is int and audit['unitChecksCompleted'] == 17000
             and type(audit.get('positionCount')) is int and audit['positionCount'] == 1500
             and type(audit.get('actualStoredRows')) is int and audit['actualStoredRows'] == 1500
             and audit.get('failedChecks') == 0 and audit.get('authUnchangedDuringAudit') is True)
        checks = runtime.get('checks')
        required_checks = {'exactly500ClosedFinalACKs', 'exactly1000AccountedCalls', 'all8000FreshControls',
            'all500UnitsUnder60', 'all500PreparedOpenUnder60', 'coldThenWarm', 'everyAuthAssignedAndUnder30',
            'exactly500UniqueFinishACKs', 'usageHistoryNotTruncated', 'active500AtLastRead',
            'sharedCapAnd20PercentReserve', 'allObservedWritesAtomic', 'all1000ProviderPhasesUnder20',
            'noObservedErrors', 'privateKeyAbsent'}
        need(runtime.get('status') == 'PASS_RUNTIME_AUDIT_AND_CLEANUP_PENDING'
             and isinstance(checks, dict) and required_checks <= set(checks)
             and all(value is True for value in checks.values())
             and type(runtime.get('modelCalls')) is int and runtime['modelCalls'] == 0
             and type(runtime.get('completedUnits')) is int and runtime['completedUnits'] == 500
             and type(runtime.get('technicallyStoredPositions')) is int and runtime['technicallyStoredPositions'] == 1500
             and type(runtime.get('activeProfilesAtLastRead')) is int and runtime['activeProfilesAtLastRead'] == 500
             and runtime.get('journalState') == 'closed' and runtime.get('errors') == [])
        units = runtime.get('unitReports')
        need(isinstance(units, list) and len(units) == 500)
        finish_acks = _auth_observations(runtime)
        owners = set()
        for index, unit in enumerate(units):
            need(type(unit.get('index')) is int and unit['index'] == index
                 and isinstance(unit.get('owner'), str) and bool(unit['owner']) and unit['owner'] not in owners
                 and unit.get('original16FreshControls') is True and type(unit.get('count')) is int and unit['count'] == 16
                 and unit.get('under60') is True and all(_number(unit.get(key)) for key in ('beginMS', 'finalACKMS', 'wallMS'))
                 and unit['finalACKMS'] == finish_acks[index]
                 and (index == 0 or units[index - 1]['finalACKMS'] <= unit['beginMS'])
                 and 0 <= unit['finalACKMS'] - unit['beginMS'] < 60000 and unit['wallMS'] < 60000
                 and math.isclose(unit['wallMS'], unit['finalACKMS'] - unit['beginMS'], rel_tol=1e-12, abs_tol=1e-6))
            owners.add(unit['owner'])
            positions = unit.get('positions')
            need(type(positions) is list and len(positions) == 3)
            points = unit.get('checkpoints')
            need(isinstance(points, list) and len(points) == 16
                 and sum(point.get('kind') == 'load' for point in points) == 10
                 and sum(point.get('kind') == 'admission' for point in points) == 6
                 and all(type(point.get('observedAt')) is int and point['observedAt'] > 0 for point in points)
                 and all(points[i]['observedAt'] >= points[i-1]['observedAt'] for i in range(1, 16)))
        _provider_observations(runtime, units)
        _stored_result_observations(audit, units)
        need(result == body and body.get('status') == 'PASS_LOCAL_MOCK500_BODY_ONLY')
        postgrest = service.get('postgrestChildClose')
        need(isinstance(postgrest, dict) and set(postgrest) == {'code', 'signal'}
             and ((type(postgrest['code']) is int and postgrest['code'] == 0 and postgrest['signal'] is None)
                  or (postgrest['code'] is None and postgrest['signal'] in ('SIGTERM', 'SIGINT'))))
        need(service.get('status') == 'PASS_OWNED_MOCK500_SERVICES_CHILD_CLOSE'
             and type(service.get('gatewayClientReturncode')) is int and service['gatewayClientReturncode'] == 0
             and service.get('postgrestSignalAccepted') is True and service.get('gatewayStopped') is True
             and service.get('forced') is False
             and service['journal'].get('closed') is True and service['journal'].get('pendingEntries') == 0)
        return {'status': 'PASS_MOCK500_NATIVE_BODY_ZERO_AND_GENUINE_SERVICE_CLOSURE_ONLY',
                'units': 500, 'controls': 8000, 'positions': 1500, 'executionAuthority': False}
    finally:
        os.close(fd)


def export_database(context, *, controller, resources, supervisor, result, guard):
    _context(context)
    _mock_closure(controller.WORK, result)
    exported = _native_steps(controller, resources, supervisor, guard)
    exported['context'] = context
    fd = S._directory(str(Path(controller.WORK) / 'state/final-backup'), private=True)
    try:
        R._write(fd, 'SNAPSHOT_CLOSURE.PRIVATE.json', (json.dumps(exported, sort_keys=True) + '\n').encode())
    finally:
        os.close(fd)
    return exported


def restore_database(controller, supervisor, resources, guard):
    """Same five native restore commands for initial input and fresh recovery."""
    result = _native_steps(controller, resources, supervisor, guard, restore=True)
    controller.save('RESTORED500_ZERO.SAFE.json', {'profiles': 500, 'active': 0})
    return result


def collect(context, *, inputs, work, prepared, destination, guard):
    """Collect all declared roots; PGDATA is the sole physical exclusion."""
    _context(context)
    work, prepared, destination = map(Path, (work, prepared, destination))
    need(all(destination != root and root not in destination.parents for root in (work, prepared)))
    originals, scanned_roots = [], []
    work_fd = S._directory(str(work), private=True)
    try:
        work_names = sorted(os.listdir(work_fd))
        need('pgdata' in work_names)
        # stage contains existing executable/public source files, unlike the
        # private runtime state. Retain both completely with private output modes.
        for name in work_names:
            source = work / name
            value = source.lstat()
            if name == 'pgdata':
                need(stat.S_ISDIR(value.st_mode))
                continue
            if stat.S_ISDIR(value.st_mode):
                rows = R._tree(source, private=name != 'stage', guard=guard)
                scanned_roots.append((source, name != 'stage', rows))
                originals.extend((source / row['path'], 'work/' + name + '/' + row['path'], row) for row in rows)
            else:
                originals.append((source, 'work/' + name, R._source_pin(source, True, guard)))
        prepared_rows = R._tree(prepared, private=False, guard=guard)
        scanned_roots.append((prepared, False, prepared_rows))
        originals.extend((prepared / row['path'], 'prepare/' + row['path'], row) for row in prepared_rows)
        input_files = inputs.backup_input_files()
        expected_inputs = R.B.input_pins()
        need(set(input_files) == {k[6:] for k in expected_inputs})
        originals.extend((Path(path), 'inputs/' + key + '.PRIVATE', expected_inputs['input:' + key])
                         for key, path in input_files.items())
        for key, path in inputs.backup_provenance_files().items():
            R.B._path(key)
            originals.append((Path(path), 'provenance/' + key, R._source_pin(Path(path), False, guard)))
        mappings = {'work/state/final-backup/' + name: 'database/' + name for name in
                    ('final.PRIVATE.dump', 'roles.PRIVATE.sql', 'SNAPSHOT_CLOSURE.PRIVATE.json')}
        total = sum(row['bytes'] for _, _, row in originals)
        need(total <= P.MAX_SELECTION_BYTES and 0 < len(originals) <= P.D.MAX_ARCHIVE_MEMBERS)
        parent = S._directory(str(destination.parent), private=True)
        try:
            os.mkdir(destination.name, 0o700, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)
        target = S._directory(str(destination), private=True)
        copied, snapshots = [], []
        try:
            for source, name, expected in originals:
                name = mappings.get(name, name)
                R.B._path(name)
                parent = S._directory(str(source.parent))
                child = None
                try:
                    child = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                    before = S._snapshot(os.fstat(child))
                    need(stat.S_ISREG(before[5]) and before[6] == os.getuid() and before[7] == 1
                         and stat.S_IMODE(before[5]) & 0o022 == 0)
                    def blocks():
                        while block := os.read(child, S.CHUNK):
                            yield block
                    observed = C._destination_file(target, name, blocks(), guard)
                    need(all(observed[k] == expected[k] for k in ('bytes', 'sha256'))
                         and S._snapshot(os.fstat(child)) == before)
                    copied.append({'path': name, **observed})
                    snapshots.append((source, before))
                finally:
                    if child is not None:
                        os.close(child)
                    os.close(parent)
            observed = [{k: row[k] for k in ('path', 'bytes', 'sha256')}
                        for row in R._tree(destination, private=True, guard=guard)]
            need(sorted(copied, key=lambda x: x['path']) == sorted(observed, key=lambda x: x['path']))
            for source, before in snapshots:
                need(S._snapshot(source.lstat()) == before)
            need(sorted(os.listdir(work_fd)) == work_names)
            for source, private, original_rows in scanned_roots:
                need(R._tree(source, private=private, guard=guard) == original_rows)
            names = {row['path'] for row in copied}
            need({'database/final.PRIVATE.dump', 'database/roles.PRIVATE.sql', 'database/SNAPSHOT_CLOSURE.PRIVATE.json',
                'work/CLEANUP.SAFE.json', 'work/RESULTS_INDEPENDENT.SAFE.json', 'work/CONTROLLER_BODY.SAFE.json',
                'work/SERVICE_CLOSURE.SAFE.json', 'work/FULL500_RUNTIME_RESULT.SAFE.json', 'work/stage/node'} <= names)
            manifest = {'version': 1, **{k: context[k] for k in ('exactCommit', 'runId', 'runAttempt',
                'inputManifestSHA', 'recipientFingerprint')}, 'files': sorted(copied, key=lambda x: x['path'])}
            raw = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
            need(len(raw) <= S.MAX_MANIFEST)
            R._write(target, 'manifest.PRIVATE.json', raw)
            guard()
            return {'manifest': manifest, 'manifestSHA256': hashlib.sha256(raw).hexdigest(),
                'selectedPlaintextBytes': total, 'fileCount': len(copied), 'inputFiles': 12,
                'physicalPGDATAExcludedInFavorOfLogicalDump': True, 'executionAuthority': False,
                'acceptedAsCompleteBackup': False, 'mock500Acceptance': False}
        finally:
            os.close(target)
    finally:
        os.close(work_fd)


def restore_readback(verified, *, context, controller_context, collection, resources, recovery_root, guard):
    """Fresh native five-step restore and full data/sequence/role comparison."""
    _context(context)
    verified, root = Path(verified), Path(recovery_root)
    fd = S._directory(str(verified), private=True)
    try:
        _, _, entries = S._manifest(fd, 'manifest.PRIVATE.json', collection['manifestSHA256'],
            context['exactCommit'], context['runId'], context['inputManifestSHA'], FINGERPRINT)
        need(entries == collection['manifest']['files'])
        for entry in entries:
            S._verify_file(fd, entry, guard=guard)
    finally:
        os.close(fd)
    root_fd = S._directory(str(root), private=True)
    try:
        need(not os.listdir(root_fd), 'MOCK500_RECOVERY_ROOT_NOT_FRESH')
        source_node = verified / 'work/stage/node'
        node_pin = R._source_pin(source_node, True, guard)
        need(all(node_pin[k] == controller_context['runtimePins']['node'][k] for k in ('bytes', 'sha256')))
        parent = S._directory(str(source_node.parent), private=True)
        child = None
        try:
            child, source_snapshot = S._file(parent, source_node.name)
            def blocks():
                while block := os.read(child, S.CHUNK):
                    yield block
            C._destination_file(root_fd, 'node', blocks(), guard)
            need(S._snapshot(os.fstat(child)) == source_snapshot)
        finally:
            if child is not None:
                os.close(child)
            os.close(parent)
        os.chmod(root / 'node', 0o700)
        roles = C._private_bytes(verified / 'database/roles.PRIVATE.sql', 4 * 1024 * 1024)
        R._write(root_fd, 'roles-fresh.PRIVATE.sql', C._roles_for_fresh_cluster(roles))
    finally:
        os.close(root_fd)
    source = Path(__file__).resolve().parents[1] / 'synthetik-500-w15-full500-controller.py'
    spec = importlib.util.spec_from_file_location('w15_mock500_fresh_recovery_' + uuid.uuid4().hex, source)
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)
    need(controller.LIMIT == P.LIMIT and controller.MAXIMUM == P.MAXIMUM and controller.RESERVE == P.RESERVE)
    controller.WORK = root / 'work'
    controller.WORK.mkdir(mode=0o700)
    for name in ('pgdata', 'state'):
        (controller.WORK / name).mkdir(mode=0o700)
    controller.CONTAINER = 'w15-mock500-' + context['runId'] + '-' + uuid.uuid4().hex
    controller.IMAGE = controller_context['runtimePins']['imageId']
    need(controller.BASE == BASE and controller.DB == DATABASE
         and re.fullmatch('sha256:[a-f0-9]{64}', controller.IMAGE))
    mounts = {'/var/lib/postgresql/data': (controller.WORK / 'pgdata', False),
        BASE + '/state': (controller.WORK / 'state', False), BASE + '/node': (root / 'node', True),
        BASE + '/app': (verified / 'work/stage/app', True),
        BASE + '/input.PRIVATE.dump': (verified / 'database/final.PRIVATE.dump', True),
        BASE + '/roles.PRIVATE.sql': (root / 'roles-fresh.PRIVATE.sql', True)}
    labels = {'helmut.w15.scope': 'independent-mock500-backup-recovery-only',
        'helmut.w15.run': context['runId'], 'helmut.w15.commit': context['exactCommit'],
        'helmut.w15.source-nonce': context['nonce']}
    args = tuple(v for k, value in labels.items() for v in ('--label', k + '=' + value))
    args += tuple(v for target, (path, ro) in mounts.items() for v in
        ('--mount', 'type=bind,src=' + str(path) + ',dst=' + target + (',readonly' if ro else '')))
    owned_id = supervisor = None
    attempted, failed, receipt = False, False, None
    def inspect(identifier):
        info = json.loads(controller.docker('inspect', identifier))[0]
        need(info['Name'] == '/' + controller.CONTAINER and info['Image'] == controller.IMAGE
             and re.fullmatch('[a-f0-9]{64}', info['Id']) and (owned_id is None or info['Id'] == owned_id)
             and all(info['Config']['Labels'].get(k) == v for k, v in labels.items()))
        host = info['HostConfig']
        need(host['Memory'] == P.LIMIT and host['MemorySwap'] == P.LIMIT
             and host['CgroupParent'] == resources.unit and host['NetworkMode'] == 'none'
             and host['RestartPolicy']['Name'] == 'no' and not info['NetworkSettings']['Ports'])
        need(len(info['Mounts']) == len(mounts))
        for row in info['Mounts']:
            need(row['Destination'] in mounts)
            path, readonly = mounts[row['Destination']]
            need(row['Source'] == str(path) and row['Type'] == 'bind' and row['RW'] is (not readonly))
        return info
    try:
        guard()
        need(json.loads(controller.docker('image', 'inspect', controller.IMAGE))[0]['Id'] == controller.IMAGE)
        need(not controller.docker('ps', '-a', '--filter', 'name=^/' + controller.CONTAINER + '$', '--format', '{{.ID}}').strip())
        attempted = True
        controller.docker('create', '--name', controller.CONTAINER, '--pull=never', '--network=none', '--restart=no',
            '--memory=' + str(P.LIMIT), '--memory-swap=' + str(P.LIMIT), '--cgroup-parent=' + resources.unit,
            *args, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', controller.IMAGE, 'postgres',
            '-c', 'helmut.local_usage_experiment=on', '-c', 'max_wal_size=128MB',
            '-c', 'work_mem=32MB', '-c', 'autovacuum_naptime=10s')
        owned_id = inspect(controller.CONTAINER)['Id']
        controller.docker('start', owned_id)
        info = inspect(owned_id)
        need(info['State']['Running'] is True)
        resources.check_pid(info['State']['Pid'], owned_id)
        supervisor = controller.Supervisor(resources.path)
        supervisor.common_resources = resources
        supervisor.mock_backup_closure = True
        original_sample = supervisor.sample
        def monitored_sample():
            guard()
            original_sample()
            P.assess(resources.sample())
        supervisor.sample = monitored_sample
        supervisor.sample()
        supervisor.thread.start()
        for _ in range(100):
            guard()
            ready = subprocess.run(controller.DOCKER + ['exec', owned_id, 'pg_isready', '-U', 'postgres', '--timeout=1'],
                env=controller.ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(.2)
        need(ready.returncode == 0)
        for argv in (('mkdir', '-p', BASE), ('chmod', '700', BASE), ('chown', '1000:1000', BASE)):
            controller.docker('exec', owned_id, *argv)
        restored = restore_database(controller, supervisor, resources, guard)
        exported = _native_steps(controller, resources, supervisor, guard)
        original = json.loads(C._private_bytes(verified / 'database/SNAPSHOT_CLOSURE.PRIVATE.json', 8 * 1024 * 1024))
        need(original['context'] == context and original['schema'] == 'helmut-w15-mock500-database-export/1'
             and original['beforeSnapshot'] == original['afterSnapshot'])
        need(C._inventory(original['beforeSnapshot']) == C._inventory(exported['beforeSnapshot']),
             'MOCK500_RECOVERY_ALL_TABLE_SEQUENCE_INTEGRITY_MISMATCH')
        actual_roles = C._private_bytes(controller.WORK / 'state/final-backup/roles.PRIVATE.sql', 4 * 1024 * 1024)
        need(C._canonical_roles(actual_roles) == C._canonical_roles(roles), 'MOCK500_RECOVERY_ROLE_SEMANTICS_MISMATCH')
        receipt = {'status': 'PASS_FRESH_NATIVE_MOCK500_BACKUP_RESTORE_500_ZERO_ONLY',
            'profiles': 500, 'active': 0, 'restoreSteps': restored['steps'],
            'completeTableAndSequenceInventoryMatched': True, 'rolesSemanticsMatched': True,
            'independentFreshPGDATA': True, 'originalRolesUnchanged': True,
            'databaseRestoreObserved': True, 'memoryProfile': P.PROFILE,
            'mock500Acceptance': False, 'acceptedAsCompleteBackup': False, 'executionAuthority': False}
    except (Exception, KeyboardInterrupt):
        failed = True
    finally:
        if attempted:
            try:
                info = inspect(owned_id or controller.CONTAINER)
                owned_id = info['Id']
                if info['State']['Running']:
                    controller.docker('stop', '--time', '5', owned_id, timeout=12)
                final = inspect(owned_id)
                need(final['State']['Running'] is False and final['State']['Pid'] == 0
                     and final['State'].get('OOMKilled') is False and final['State'].get('ExitCode') == 0)
            except (Exception, KeyboardInterrupt):
                failed = True
        if supervisor is not None:
            for operation in (supervisor.sample, supervisor.stop):
                try:
                    operation()
                except (Exception, KeyboardInterrupt):
                    failed = True
            failed = failed or supervisor.failure is not None or supervisor.stop_failure is not None
        try:
            guard()
        except (Exception, KeyboardInterrupt):
            failed = True
    need(not failed and receipt is not None, 'MOCK500_RECOVERY_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED')
    return {**receipt, 'ownedRecoveryContainerStopped': True, 'recoveryWatchClosed': True}


def completion_hook(manifest, private_payload, disk_guard):
    """Export live, close once, freeze, seal, remote readback and fresh recovery."""
    need(callable(disk_guard) and isinstance(manifest, dict) and isinstance(private_payload, dict))
    used = False
    def complete(*, controller, inputs, resources, supervisor, result, close_owned):
        nonlocal used
        need(not used and callable(close_owned), 'MOCK500_BACKUP_COMPLETION_REUSE_REJECTED')
        used = True
        context = inputs.backup_context()
        _context(context)
        need(context['exactCommit'] == manifest['exactCommit'] and context['runId'] == manifest['runId'])
        closed = None
        try:
            export_database(context, controller=controller, resources=resources,
                supervisor=supervisor, result=result, guard=disk_guard)
        finally:
            # No failed export can strand a live owned database/watcher or
            # trigger a second close/restore attempt. The caller preserves its
            # original first failure if this closure also fails.
            closed = close_owned()
        need(isinstance(closed, dict) and closed.get('ownedContainerStopped') is True
             and closed.get('watchClosed') is True)
        root = Path(manifest['backupRoot'])
        collection = collect(context, inputs=inputs, work=controller.WORK,
            prepared=Path(inputs.controller_context()['hostPaths']['prepare']),
            destination=root / 'selection', guard=disk_guard)
        public_key = Path(__file__).resolve().parents[2] / 'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc'
        need(hashlib.sha256(public_key.read_bytes()).hexdigest()
             == '3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443')
        cipher = root / 'mock500-complete.PRIVATE.gpg'
        def guard():
            disk_guard()
            if cipher.exists():
                need(cipher.lstat().st_size <= P.MAX_CIPHER_BYTES)
        sealed = S.seal(root=str(root / 'selection'), manifest='manifest.PRIVATE.json',
            manifest_sha256=collection['manifestSHA256'], public_key=str(public_key),
            recipient_fingerprint=FINGERPRINT, commit=context['exactCommit'], run_id=context['runId'],
            input_manifest_sha256=context['inputManifestSHA'], output=str(cipher), guard=guard)
        need(sealed['cipherBytes'] <= P.MAX_CIPHER_BYTES)
        from decimal import Decimal
        price = Decimal(sealed['cipherBytes']) / Decimal(10**9) * Decimal('0.25') * Decimal(25) / Decimal(28 * 24)
        need(price <= Decimal('0.05'), 'MOCK500_ENCRYPTED_STORAGE_COST_CEILING')
        node = Path(manifest['binaries']['node']['path'])
        pin = R._source_pin(node, False, disk_guard)
        need(all(pin[k] == inputs.controller_context()['runtimePins']['node'][k]
                 == manifest['binaries']['node'][k] for k in ('bytes', 'sha256')))
        returned = _load('artifact_transport').roundtrip(cipher, destination=root / 'remote',
            node=node, credentials=private_payload['artifactCredentials'], guard=disk_guard)
        need(returned.get('remoteReadbackObserved') is True
             and all(returned[k] == sealed[k] for k in ('cipherBytes', 'cipherSHA256')))
        receive_root = Path(inputs.backup_input_files()['auth']).parent.parent.parent
        verified = root / 'authenticated'
        readback = C.authenticated_readback(returned['cipher'], cipher_bytes=sealed['cipherBytes'],
            cipher_sha256=sealed['cipherSHA256'], expected_manifest=collection['manifest'],
            expected_manifest_sha256=collection['manifestSHA256'], context=context,
            destination=str(verified), private_home=str(receive_root / 'gnupg'),
            passphrase_file=str(receive_root / 'receiver-passphrase.PRIVATE'), guard=disk_guard,
            backup_scope=SCOPE)
        recovery = restore_readback(verified, context=context, controller_context=inputs.controller_context(),
            collection=collection, resources=resources, recovery_root=manifest['rollbackRoot'], guard=disk_guard)
        inputs.check_sources()
        inputs.backup_input_files()
        final = disk_guard()
        receipt = {'schema': 'helmut-w15-mock500-backup-return/1',
            'status': 'PASS_MOCK500_ENCRYPTED_OFFHOST_READBACK_AND_FRESH_500_ZERO_RESTORE_ONLY',
            'scope': SCOPE, 'cipherBytes': sealed['cipherBytes'], 'cipherSHA256': sealed['cipherSHA256'],
            'artifactId': returned['artifactId'], 'artifactRetentionDays': 1,
            'maximumStorageUSD': '0.05', 'actualSizeStorageUSDBound': str(price),
            'remoteReadbackObserved': True, 'databaseRestoreObserved': True,
            'ownedContainerStopped': True, 'watchClosed': True,
            'authenticatedReadback': readback, 'independentRecovery': recovery,
            'finalResourceSample': final, 'memoryProfile': P.PROFILE,
            'acceptedAsCompleteBackup': False, 'independentAcceptanceRequired': True,
            'mock500Acceptance': False, 'productionAcceptance': False, 'executionAuthority': False,
            'retryAllowed': False, 'automaticDeletionAllowed': False}
        target = S._directory(str(root), private=True)
        try:
            R._write(target, 'MOCK500_BACKUP_RETURN.SAFE.json', (json.dumps(receipt, sort_keys=True) + '\n').encode())
        finally:
            os.close(target)
        return receipt
    return complete
