"""Small fictional native/closure/transport seams; no database, keys or network."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
from importlib.machinery import ModuleSpec
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_backup_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B, RF, EF = load('mock500_backup'), load('test_runtime_restore'), load('test_runtime_backup')


def pin(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def sample():
    return {'configuredLimit': '2048000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
        'kernelLifetimePeakBytes': 123456, 'currentBytes': 10000,
        'events': {name: 0 for name in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class MockBackupChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='mock500-backup-fictional-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.work, self.prepared, self.backup = (self.root / name for name in ('work', 'prepared', 'backup'))
        for path in (self.work, self.prepared, self.backup, self.work / 'state', self.work / 'pgdata'):
            path.mkdir(mode=0o700)
        self.node = b'FICTIONAL NODE; NEVER EXECUTED'
        self.roles = b'-- FICTIONAL ROLE EXPORT\nCREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\n'
        self.put(self.work / 'stage/node', self.node, mode=0o700)
        self.put(self.work / 'stage/app/scripts/fixtures/w15-owned-process-stop.js', b'FICTIONAL JS', mode=0o644)
        self.put(self.prepared / 'PREPARED.SAFE.json', b'{"status":"FICTIONAL"}', mode=0o644)
        self.controller = SimpleNamespace(BASE=B.BASE, DB=B.DATABASE, WORK=self.work,
            CONTAINER='w15-mock500-123456789-11111111222243338444555555555555', DOCKER=list(B.R.DOCKER),
            docker=Mock(return_value=b''), ENV={'PATH': '/usr/bin:/bin'})
        self.controller.save = lambda name, value: self.put(self.controller.WORK / name, json.dumps(value).encode())
        self.context = {'schema': 'helmut-w15-backup-context/1', 'scope': B.SCOPE,
            'nonce': '11111111-2222-4333-8444-555555555555', 'exactCommit': 'a' * 40,
            'runId': '123456789', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
            'recipientFingerprint': B.FINGERPRINT, 'executionAuthority': False}
        self.guard = Mock(return_value={'memoryProfile': B.P.PROFILE, 'FICTIONAL': True})
        self.resources = SimpleNamespace(profile=B.P.PROFILE, sample=Mock(side_effect=sample),
            path=Path('/FICTIONAL/common.slice'), unit='FICTIONAL.slice', check_pid=Mock())
        self.restore_fixture = RF.RestoreChecks('runTest')
        self.restore_fixture.setUp()
        self.addCleanup(self.restore_fixture.doCleanups)
        self.export_fixture = EF.RuntimeBackupChecks('runTest')
        self.export_fixture.setUp()
        self.addCleanup(self.export_fixture.doCleanups)
        self.w = self.restore_fixture.w
        self.w.common_resources, self.w.first_failure = self.resources, Mock()
        self.restore_fixture.work, self.restore_fixture.state = self.work, self.work / 'state'
        self.restore_fixture.controller = self.controller
        self.export_fixture.work = self.work
        self.export_fixture.observed.update({'database': B.DATABASE, **self.inventory()})
        def stage(argv, action, seconds):
            if action in B.T.ACTIONS:
                self.restore_fixture.stage(argv, action, seconds)
            else:
                self.assertTrue(self.w.mock_backup_closure)
                self.assertFalse(self.w.closure_mode)  # Owned TERM/timeout checks remain active.
                self.export_fixture.run_owned(argv, action, seconds)
                if action == 'backup-roles':
                    output = self.export_fixture.work / 'state/final-backup'
                    (output / B.R.OUTPUTS[action]).write_bytes(self.roles)
                    receipt = json.loads((output / (action + '.SAFE.json')).read_text())
                    receipt['output'] = pin(self.roles)
                    (output / (action + '.SAFE.json')).write_text(json.dumps(receipt))
                self.w.last_stage_exit_code = 0
        self.w.stage = stage
        self.body = {'status': 'PASS_LOCAL_MOCK500_BODY_ONLY', 'FICTIONAL': True}
        self.put(self.work / 'CONTROLLER_BODY.SAFE.json', json.dumps(self.body).encode())
        self.put(self.work / 'CLEANUP.SAFE.json', json.dumps({'confirmedZero': True,
            'nativeBoundZero': True, 'after': {'active': 0}}).encode())
        areas = ('mandatsbriefing', 'morgenbriefing', 'lage')
        self.put(self.work / 'RESULTS_INDEPENDENT.SAFE.json', json.dumps({
            'status': 'PASS_ALL500_STORED_MOCK_RESULTS_ONLY', 'storedResultsAccepted': True,
            'unitChecksCompleted': 17000, 'positionCount': 1500, 'actualStoredRows': 1500,
            'failedChecks': 0, 'authUnchangedDuringAudit': True, 'passedChecks': 17000,
            'storedPrivateDraftReviewRows': 1000,
            'categories': dict.fromkeys(('missing', 'empty', 'duplicate', 'technicallyInvalid', 'unusable'), 0),
            'units': [{'index': i, 'owner': 'FICTIONAL-' + str(i), 'checks': 34, 'passedChecks': 34,
                'failedChecks': [], 'queryOrReadbackFailure': False,
                'results': [{'area': area, 'id': 'FICTIONAL-' + str(i) + '-' + area,
                    'canonicalHash': 'c' * 64} for area in areas]} for i in range(500)],
            'positions': [{'index': i, 'owner': 'FICTIONAL-' + str(i), 'area': area,
                'categories': [], 'status': 'stored-unreviewed'} for i in range(500) for area in areas]}).encode())
        check_names = ('exactly500ClosedFinalACKs', 'exactly1000AccountedCalls', 'all8000FreshControls',
            'all500UnitsUnder60', 'all500PreparedOpenUnder60', 'coldThenWarm', 'everyAuthAssignedAndUnder30',
            'exactly500UniqueFinishACKs', 'usageHistoryNotTruncated', 'active500AtLastRead',
            'sharedCapAnd20PercentReserve', 'allObservedWritesAtomic', 'all1000ProviderPhasesUnder20',
            'noObservedErrors', 'privateKeyAbsent')
        # Metadata fixtures only. These descriptors do not run a single unit,
        # provider, control, database import or real profile operation.
        def begin(index): return 100 + index * 50000
        def delay(index): return 19900 if index in (0, 499) else 1
        def final_ack(index): return begin(index) + 3 + 2 * delay(index)
        def acknowledged(identifier, index, kind):
            return {'id': identifier, 'index': index, 'kind': kind, 'acknowledged': True,
                'beginMS': final_ack(index) - 1, 'ackMS': final_ack(index),
                'endMS': final_ack(index) + 1, 'wallMs': 2}
        mutations = [{**acknowledged(i + 1, i, 'public-mutation'), 'finishIndex': i} for i in range(500)]
        usage = [{**acknowledged(501 + j, j // 2, 'usage-sink'), 'storageAcknowledged': True,
            'storageMode': 'relational-atomic-v1'} for j in range(1000)]
        self.put(self.work / 'FULL500_RUNTIME_RESULT.SAFE.json', json.dumps({
            'status': 'PASS_RUNTIME_AUDIT_AND_CLEANUP_PENDING', 'checks': dict.fromkeys(check_names, True),
            'modelCalls': 0, 'completedUnits': 500, 'technicallyStoredPositions': 1500,
            'localSimulations': 1000, 'activeProfilesAtLastRead': 500, 'journalState': 'closed', 'errors': [],
            'providerPhases': [{'index': i, 'phase': phase,
                'beginMS': begin(i) + 1 + offset * (delay(i) + 1),
                'endMS': begin(i) + 1 + offset * (delay(i) + 1) + delay(i), 'actualDelayMS': delay(i),
                'requiredDelayMs': 19900 if i in (0, 499) else 0, 'nativePermanentSendClaim': True,
                'nativeCostReservation': True, 'actualModelOutput': False, 'simulatedUsage': True}
                for i in range(500) for offset, phase in enumerate(('D', 'R'))],
            'authMutations': mutations, 'usageSinks': usage,
            'casWrites': [{**acknowledged(j, outer['index'], 'FICTIONAL-CAS'), 'envelopeId': outer['id'],
                'rowId': 'main-auth', 'storageMode': 'relational-atomic-v1'} for j, outer in enumerate(mutations + usage)],
            'unitReports': [{'index': i, 'owner': 'FICTIONAL-' + str(i), 'original16FreshControls': True,
                'count': 16, 'under60': True, 'beginMS': begin(i), 'finalACKMS': final_ack(i),
                'wallMS': final_ack(i) - begin(i),
                'positions': [{'bereich': area, 'mandatsId': 'FICTIONAL-' + str(i),
                    'status': 'stored-unreviewed', 'ergebnisHash': 'c' * 64} for area in areas],
                'checkpoints': [{'kind': 'load' if j < 10 else 'admission', 'observedAt': 1 + j}
                                for j in range(16)]} for i in range(500)]}).encode())
        self.put(self.work / 'SERVICE_CLOSURE.SAFE.json', json.dumps({
            'status': 'PASS_OWNED_MOCK500_SERVICES_CHILD_CLOSE', 'gatewayClientReturncode': 0,
            'postgrestSignalAccepted': True, 'gatewayStopped': True, 'forced': False,
            'postgrestChildClose': {'code': 0, 'signal': None},
            'journal': {'closed': True, 'pendingEntries': 0}}).encode())

    @staticmethod
    def put(path, raw, mode=0o600):
        missing, parent = [], path.parent
        while not parent.exists():
            missing.append(parent)
            parent = parent.parent
        for parent in reversed(missing):
            parent.mkdir(mode=0o700)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)

    def inventory(self):
        return {'foreignTables': 0, 'sequenceInventory': [], 'tableInventory': [{
            'schema': 'public', 'table': 'mandate_profiles', 'rows': 500,
            'sha256': hashlib.sha256(b'FICTIONAL TABLE').hexdigest(), 'columns': [
                {'name': 'aktiv', 'type': 'boolean', 'notNull': True, 'default': 'false',
                 'identity': '', 'generated': ''}]}]}

    def export(self):
        return B.export_database(self.context, controller=self.controller, resources=self.resources,
            supervisor=self.w, result=self.body, guard=self.guard)

    def test_mock_initial_restore_and_export_reuse_existing_five_and_four_native_workers(self):
        restored = B.restore_database(self.controller, self.w, self.resources, self.guard)
        self.assertEqual((restored['profiles'], restored['active'], restored['steps']), (500, 0, 5))
        self.assertEqual(self.w.backup_runner.scope, 'mock500-restore')
        exported = self.export()
        self.assertEqual(self.w.backup_runner.scope, 'mock500-backup')
        self.assertEqual([x[1] for x in self.restore_fixture.calls], list(B.T.ACTIONS))
        self.assertEqual([x[1] for x in self.export_fixture.calls], list(B.R.ACTIONS))
        self.assertTrue(all(B.BASE in x[0][-1] and B.DATABASE in x[0][-1]
                            for x in self.restore_fixture.calls + self.export_fixture.calls))
        self.assertEqual(exported['beforeSnapshot'], exported['afterSnapshot'])
        self.assertFalse(restored['mock500Acceptance'])
        self.assertFalse(exported['acceptedAsCompleteBackup'])
        self.controller.docker.assert_not_called()

    def test_restore_worker_changes_only_one_fixed_database_guard_and_keeps_end500_unchanged(self):
        original = 'database==="helmut_w15_memory_atomic_20261028d"'
        replacement = 'database==="helmut_w15_full500_20261028b"'
        self.assertEqual(B.T.NODE_WORKER.count(original), 1)
        self.assertEqual(B.RESTORE_NODE_WORKER.count(replacement), 1)
        self.assertEqual(B.RESTORE_NODE_WORKER.replace(replacement, original, 1), B.T.NODE_WORKER)
        self.assertNotIn(replacement, B.T.NODE_WORKER)

    def test_end500_profile_or_context_cannot_be_reused_as_mock_backup_acceptance(self):
        self.resources.profile = 'END500_V3'
        with self.assertRaises(B.BackupRejected):
            B.restore_database(self.controller, self.w, self.resources, self.guard)
        self.assertEqual(self.restore_fixture.calls, [])
        with self.assertRaises(B.BackupRejected):
            B._context({**self.context, 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY'})

    def test_incomplete_controls_zero_or_service_close_stop_before_export(self):
        path = self.work / 'RESULTS_INDEPENDENT.SAFE.json'
        audit = json.loads(path.read_text())
        path.write_text(json.dumps({**audit, 'unitChecksCompleted': 1104}))
        with self.assertRaises(B.BackupRejected):
            self.export()
        self.assertEqual(self.export_fixture.calls, [])
        path.write_text(json.dumps(audit))
        service = self.work / 'SERVICE_CLOSURE.SAFE.json'
        closed = json.loads(service.read_text())
        service.write_text(json.dumps({**closed, 'postgrestChildClose': {'code': None, 'signal': 'SIGKILL'}}))
        with self.assertRaises(B.BackupRejected):
            self.export()
        self.assertEqual(self.export_fixture.calls, [])

    def test_header_alone_cannot_hide_partial_native_controls_and_real_signal_close_is_preserved(self):
        runtime_path = self.work / 'FULL500_RUNTIME_RESULT.SAFE.json'
        runtime = json.loads(runtime_path.read_text())
        runtime_path.write_text(json.dumps({**runtime, 'unitReports': runtime['unitReports'][:69]}))
        with self.assertRaises(B.BackupRejected):
            B._mock_closure(self.work, self.body)
        runtime_path.write_text(json.dumps(runtime))
        service_path = self.work / 'SERVICE_CLOSURE.SAFE.json'
        service = json.loads(service_path.read_text())
        for signal in ('SIGTERM', 'SIGINT'):
            service_path.write_text(json.dumps({**service, 'postgrestChildClose': {'code': None, 'signal': signal}}))
            self.assertEqual(B._mock_closure(self.work, self.body)['controls'], 8000)

    def assert_observation_rejected_before_export(self, filename, original, change):
        value = copy.deepcopy(original); change(value)
        (self.work / filename).write_text(json.dumps(value))
        with self.assertRaises(B.BackupRejected):
            self.export()
        self.assertEqual(self.export_fixture.calls, [])

    def test_every_retained_provider_phase_and_20_second_boundary_is_checked_before_export(self):
        filename = 'FULL500_RUNTIME_RESULT.SAFE.json'
        original = json.loads((self.work / filename).read_text())
        mutations = {
            'provider-duration-header-missing': lambda v: v['checks'].pop('all1000ProviderPhasesUnder20'),
            'middle-phase-exactly20s': lambda v: v['providerPhases'][501].update(
                endMS=v['providerPhases'][501]['beginMS'] + 20000, actualDelayMS=20000),
            'middle-phase-over20s': lambda v: v['providerPhases'][501].update(
                endMS=v['providerPhases'][501]['beginMS'] + 20001, actualDelayMS=20001),
            'missing-phase': lambda v: v['providerPhases'].pop(),
            'duplicate-phase': lambda v: v['providerPhases'][501].update(phase='D'),
            'claim-missing': lambda v: v['providerPhases'][501].update(nativePermanentSendClaim=False),
            'reservation-missing': lambda v: v['providerPhases'][501].update(nativeCostReservation=False),
            'external-model': lambda v: v['providerPhases'][501].update(actualModelOutput=True),
            'negative-duration': lambda v: v['providerPhases'][501].update(endMS=0, actualDelayMS=-1),
            'duration-header-does-not-match-clock': lambda v: v['providerPhases'][501].update(
                endMS=v['providerPhases'][501]['beginMS'] + 20000),
            'boolean-clock': lambda v: v['providerPhases'][501].update(beginMS=True),
        }
        for name, change in mutations.items():
            with self.subTest(name=name):
                self.assert_observation_rejected_before_export(filename, original, change)
        self.assertFalse(B._number(float('nan'))); self.assertFalse(B._number(float('inf')))

    def test_native_auth_acks_atomic_writes_and_all500_finish_envelopes_cannot_be_replaced_by_green_header(self):
        filename = 'FULL500_RUNTIME_RESULT.SAFE.json'
        original = json.loads((self.work / filename).read_text())
        mutations = {
            'header-missing-atomic-check': lambda v: v['checks'].pop('allObservedWritesAtomic'),
            'missing-usage': lambda v: v['usageSinks'].pop(),
            'usage-wrong-unit': lambda v: v['usageSinks'][0].update(index=1),
            'usage-no-storage-ack': lambda v: v['usageSinks'][0].update(storageAcknowledged=False),
            'missing-native-write': lambda v: v['casWrites'].pop(),
            'orphan-native-write': lambda v: v['casWrites'][0].update(envelopeId=99999),
            'wrong-auth-row': lambda v: v['casWrites'][0].update(rowId='OTHER-AUTH'),
            'non-atomic-write': lambda v: v['casWrites'][0].update(storageMode='blob'),
            'write-outside-envelope': lambda v: v['casWrites'][0].update(beginMS=0),
            'unacknowledged-write': lambda v: v['casWrites'][0].update(acknowledged=False),
            'auth-exactly30s': lambda v: v['authMutations'][0].update(
                ackMS=v['authMutations'][0]['beginMS'] + 30000, endMS=v['authMutations'][0]['beginMS'] + 30000, wallMs=30000),
            'short-header-with-long-call': lambda v: v['authMutations'][0].update(
                ackMS=v['authMutations'][0]['beginMS'] + 30000, endMS=v['authMutations'][0]['beginMS'] + 30000),
            'missing-finish': lambda v: v['authMutations'][0].pop('finishIndex'),
            'duplicate-finish': lambda v: v['authMutations'][1].update(finishIndex=0),
            'retained-failure': lambda v: v['authMutations'][0].update(failure={'name': 'FICTIONAL'}),
            'unit-exactly60s': lambda v: v['unitReports'][250].update(
                finalACKMS=v['unitReports'][250]['beginMS'] + 60000, wallMS=60000),
            'unit-no-actual-final-ack': lambda v: v['unitReports'][250].pop('finalACKMS'),
            'unit-final-ack-not-from-native-envelope': lambda v: v['unitReports'][250].update(
                finalACKMS=v['unitReports'][250]['finalACKMS'] + 1, wallMS=v['unitReports'][250]['wallMS'] + 1),
            'not500-active': lambda v: v.update(activeProfilesAtLastRead=499),
        }
        for name, change in mutations.items():
            with self.subTest(name=name):
                self.assert_observation_rejected_before_export(filename, original, change)

    def test_provider_pair_must_fit_actual_unit_and_draft_must_finish_before_review(self):
        filename = 'FULL500_RUNTIME_RESULT.SAFE.json'
        original = json.loads((self.work / filename).read_text())
        def end_after_ack(value):
            phase = value['providerPhases'][501]
            phase['endMS'] = value['unitReports'][250]['finalACKMS'] + 1
            phase['actualDelayMS'] = phase['endMS'] - phase['beginMS']
        def begin_before_unit(value):
            phase = value['providerPhases'][500]
            phase['beginMS'] = value['unitReports'][250]['beginMS'] - 1
            phase['actualDelayMS'] = phase['endMS'] - phase['beginMS']
        def overlap_pair(value):
            draft, review = value['providerPhases'][500:502]
            review['beginMS'] = draft['endMS'] - .5
            review['actualDelayMS'] = review['endMS'] - review['beginMS']
        def overlap_units(value):
            unit = value['unitReports'][250]
            unit['beginMS'] = value['unitReports'][249]['finalACKMS'] - 1
            unit['wallMS'] = unit['finalACKMS'] - unit['beginMS']
        for name, change in (('provider-end-after-native-final-ack', end_after_ack),
                             ('provider-begin-before-unit-entry', begin_before_unit),
                             ('review-begins-before-draft-ended', overlap_pair),
                             ('next-unit-before-previous-final-ack', overlap_units)):
            with self.subTest(name=name):
                self.assert_observation_rejected_before_export(filename, original, change)

    def test_pipeline_lock_envelopes_can_legitimately_extend_beyond_unit_entry_and_finish(self):
        path = self.work / 'FULL500_RUNTIME_RESULT.SAFE.json'
        runtime = json.loads(path.read_text())
        unit = runtime['unitReports'][250]
        for identifier, api, begin in ((2001, 'acquirePipelineLock', unit['beginMS'] - 5),
                                       (2002, 'releasePipelineLock', unit['finalACKMS'] + 1)):
            outer = {'id': identifier, 'index': 250, 'kind': 'pipeline-lock', 'api': api,
                'beginMS': begin, 'ackMS': begin + 1, 'endMS': begin + 2, 'wallMs': 2,
                'acknowledged': True, 'storageAcknowledged': True}
            runtime['authMutations'].append(outer)
            runtime['casWrites'].append({**outer, 'id': len(runtime['casWrites']), 'envelopeId': identifier,
                'rowId': 'main-auth', 'storageMode': 'relational-atomic-v1'})
        path.write_text(json.dumps(runtime))
        self.assertEqual(B._mock_closure(self.work, self.body)['controls'], 8000)
        self.assertEqual(self.export_fixture.calls, [])

    def test_all1500_independent_readback_positions_are_required_even_when_summary_counts_pass(self):
        filename = 'RESULTS_INDEPENDENT.SAFE.json'
        original = json.loads((self.work / filename).read_text())
        mutations = {
            'missing-position': lambda v: v['positions'].pop(),
            'duplicate-position': lambda v: v['positions'].__setitem__(750, copy.deepcopy(v['positions'][749])),
            'wrong-owner': lambda v: v['positions'][750].update(owner='FICTIONAL-OTHER'),
            'empty-position': lambda v: v['positions'][750].update(categories=['empty']),
            'missing-readback-unit': lambda v: v['units'].pop(),
            'missing-readback-result': lambda v: v['units'][250]['results'].pop(),
            'duplicate-row-id': lambda v: v['units'][250]['results'][0].update(id=v['units'][0]['results'][0]['id']),
            'missing-row-hash': lambda v: v['units'][250]['results'][0].pop('canonicalHash'),
            'row-hash-not-retained-output': lambda v: v['units'][250]['results'][0].update(canonicalHash='d' * 64),
            'unknown-readback-check': lambda v: v['units'][250].update(failedChecks=[{'status': 'UNKNOWN'}]),
            'false-as-zero-category': lambda v: v['categories'].update(missing=False),
            'missing-private-draft-review': lambda v: v.update(storedPrivateDraftReviewRows=999),
        }
        for name, change in mutations.items():
            with self.subTest(name=name):
                self.assert_observation_rejected_before_export(filename, original, change)

    def test_existing_owned_runner_stops_native_child_once_with_explicit_mock_scope(self):
        runner = B.MockOwnedRunner(self.w, self.controller, restore=True)
        self.w.backup_runner = runner
        self.w.stage = Mock(side_effect=OSError('FICTIONAL LOST DOCKER CLIENT'))
        argv = list(B.R.DOCKER) + ['exec', '--user', '1000:1000', self.controller.CONTAINER, 'sh', '-c', 'FICTIONAL']
        with self.assertRaises(Exception):
            runner.run_owned(argv, 'restore-create', 30)
        runner.stop_once('restore-create')
        self.controller.docker.assert_called_once()
        self.assertEqual(self.controller.docker.call_args.args[-1], 'mock500-restore')
        self.assertEqual(self.w.failure['reason'], 'mock500-owned-stage-failed')

    def test_full_declared_collection_includes_private_state_public_stage_and_every_provenance(self):
        B.restore_database(self.controller, self.w, self.resources, self.guard)
        self.export()
        self.put(self.work / 'pgdata/physical-not-logical.key', b'FICTIONAL PHYSICAL DATA')
        originals, expected = {}, {}
        for key in B.R.B.input_pins():
            raw = ('FICTIONAL ORIGINAL ' + key).encode()
            source = self.root / 'originals' / (key[6:] + '.PRIVATE')
            self.put(source, raw)
            originals[key[6:]], expected[key] = source, pin(raw)
        provenance = {}
        for i in range(12):
            source = self.root / 'assets' / (str(i) + '.PRIVATE')
            self.put(source, ('FICTIONAL MOCK ASSET ' + str(i)).encode())
            provenance['mock-assets/' + source.name] = source
        inputs = SimpleNamespace(backup_input_files=lambda: originals, backup_provenance_files=lambda: provenance)
        with patch.object(B.R.B, 'input_pins', return_value=expected):
            result = B.collect(self.context, inputs=inputs, work=self.work, prepared=self.prepared,
                               destination=self.backup / 'selection', guard=self.guard)
        names = {row['path'] for row in result['manifest']['files']}
        self.assertTrue({'database/final.PRIVATE.dump', 'database/roles.PRIVATE.sql',
            'database/SNAPSHOT_CLOSURE.PRIVATE.json', 'work/stage/node',
            'work/CONTROLLER_BODY.SAFE.json', 'work/SERVICE_CLOSURE.SAFE.json'} <= names)
        self.assertEqual(sum(name.startswith('inputs/') for name in names), 12)
        self.assertEqual(sum(name.startswith('provenance/mock-assets/') for name in names), 12)
        self.assertFalse(any('pgdata' in name for name in names))
        self.assertTrue((self.work / 'pgdata/physical-not-logical.key').exists())
        self.assertEqual((self.backup / 'selection/work/stage/node').stat().st_mode & 0o777, 0o600)
        self.assertFalse(result['acceptedAsCompleteBackup'])

    def test_callback_closes_once_before_collection_and_delegates_mock_scope_readback(self):
        events = []
        manifest = {'exactCommit': self.context['exactCommit'], 'runId': self.context['runId'],
            'backupRoot': str(self.backup), 'rollbackRoot': str(self.root / 'rollback'),
            'binaries': {'node': {'path': str(self.work / 'stage/node'), **pin(self.node)}}}
        inputs = SimpleNamespace(backup_context=lambda: self.context,
            controller_context=lambda: {'hostPaths': {'prepare': str(self.prepared)}, 'runtimePins': {'node': pin(self.node)}},
            check_sources=Mock(), backup_input_files=lambda: {'auth': self.root / 'received/payloads/auth.PRIVATE'})
        collection = {'manifest': {'files': []}, 'manifestSHA256': 'f' * 64}
        cipher_data = b'FICTIONAL CIPHER'
        sealed = {'cipherBytes': len(cipher_data), 'cipherSHA256': pin(cipher_data)['sha256']}
        def seal(**kwargs):
            events.append('seal')
            self.put(Path(kwargs['output']), cipher_data)
            return sealed
        def returned(*args, **kwargs):
            events.append('transport')
            return {'cipher': self.backup / 'mock500-complete.PRIVATE.gpg', 'artifactId': 1,
                    'remoteReadbackObserved': True, **sealed}
        old_load = B._load
        hook = B.completion_hook(manifest, {'artifactCredentials': {'FICTIONAL': 'NEVER LOG'}}, self.guard)
        with patch.object(B, 'export_database', side_effect=lambda *a, **k: events.append('export')), \
             patch.object(B, 'collect', side_effect=lambda *a, **k: events.append('collect') or collection), \
             patch.object(B.S, 'seal', side_effect=seal), \
             patch.object(B, '_load', side_effect=lambda name: SimpleNamespace(roundtrip=returned)
                          if name == 'artifact_transport' else old_load(name)), \
             patch.object(B.C, 'authenticated_readback', side_effect=lambda *a, **k: events.append('authenticate') or
                          {'databaseRestoreObserved': False}) as decrypt, \
             patch.object(B, 'restore_readback', side_effect=lambda *a, **k: events.append('restore') or
                          {'databaseRestoreObserved': True}):
            close = Mock(side_effect=lambda: events.append('close') or {'ownedContainerStopped': True, 'watchClosed': True})
            result = hook(controller=self.controller, inputs=inputs, resources=self.resources,
                          supervisor=self.w, result=self.body, close_owned=close)
            self.assertEqual(events, ['export', 'close', 'collect', 'seal', 'transport', 'authenticate', 'restore'])
            self.assertEqual(decrypt.call_args.kwargs['backup_scope'], B.SCOPE)
            self.assertEqual(decrypt.call_args.kwargs['private_home'], str(self.root / 'gnupg'))
            self.assertEqual(decrypt.call_args.kwargs['passphrase_file'], str(self.root / 'receiver-passphrase.PRIVATE'))
            self.assertTrue(result['remoteReadbackObserved'])
            self.assertTrue(result['databaseRestoreObserved'])
            self.assertFalse(result['mock500Acceptance'])
            self.assertNotIn('NEVER LOG', json.dumps(result))
            close.assert_called_once()
            with self.assertRaises(B.BackupRejected):
                hook(controller=self.controller, inputs=inputs, resources=self.resources,
                     supervisor=self.w, result=self.body, close_owned=close)

    def test_export_failure_still_closes_owned_database_once_and_does_not_retry_or_upload(self):
        manifest = {'exactCommit': self.context['exactCommit'], 'runId': self.context['runId']}
        inputs = SimpleNamespace(backup_context=lambda: self.context)
        close = Mock(return_value={'ownedContainerStopped': True, 'watchClosed': True})
        hook = B.completion_hook(manifest, {}, self.guard)
        with patch.object(B, 'export_database', side_effect=B.BackupRejected('FICTIONAL EXPORT FAILED')), \
             patch.object(B, 'collect') as collect:
            with self.assertRaises(B.BackupRejected):
                hook(controller=self.controller, inputs=inputs, resources=self.resources,
                     supervisor=self.w, result=self.body, close_owned=close)
        close.assert_called_once()
        collect.assert_not_called()

    def test_fresh_recovery_uses_original_v2_parent_and_detects_full_table_drift(self):
        self._check_fresh_recovery()

    def test_phased_fresh_recovery_uses_acknowledged_backup_limit_and_detects_full_table_drift(self):
        self._check_fresh_recovery(phased=True)

    def _check_fresh_recovery(self, phased=False):
        if phased:
            pc = B.P.phases(); cap = pc.capacity()
            self.resources.processing_backup_stage = 'mock500'
            self.resources.memory_phase = 'backup'
            self.resources.backup_ack = {'FICTIONAL': 'PREVIOUSLY VERIFIED BY COMMON RESOURCES'}
            self.resources.container_limit = pc.HARD_LIMIT
            self.resources.profile = pc.MOCK_PROFILE
            observed = sample()
            observed.update(configuredLimit=str(pc.HARD_LIMIT), currentBytes=3000000000, kernelLifetimePeakBytes=3100000000)
            observed['capacityMeasurement'] = {'schema': cap.SCHEMA, 'diagnosticOnly': True,
                'legacyPeakLimitBytes': cap.LEGACY_PEAK, 'legacyPeakExceeded': True, 'legacyContractAccepted': False,
                'sampleCount': 1, 'maximumObservedCurrentBytes': 3000000000,
                'categoryMaxima': dict.fromkeys(cap.CATEGORIES, 'UNKNOWN'), 'phaseObservations': [],
                'last': {'hostAvailableBytes': 3 * 1024**3, 'memoryStat': dict.fromkeys(cap.CATEGORIES, 'UNKNOWN'),
                         'memoryPressure': 'UNKNOWN', 'observedMonotonicNS': 1, 'peakCompositionKnown': False}}
            self.resources.sample = Mock(side_effect=lambda: copy.deepcopy(observed))
        expected_limit = self.resources.container_limit if phased else B.P.LIMIT
        for corrupt in (False, True):
            with self.subTest(changed_restored_table=corrupt):
                root = self.root / ('recovery-bad' if corrupt else 'recovery-good')
                root.mkdir(mode=0o700)
                verified, recovery = root / 'verified', root / 'fresh'
                verified.mkdir(mode=0o700)
                recovery.mkdir(mode=0o700)
                self.w.finished.clear()
                self.w.failure = self.w.stop_failure = None
                inventory = {**self.export_fixture.observed, **self.inventory()}
                self.export_fixture.observed = json.loads(json.dumps(inventory))
                files = {'work/stage/node': self.node,
                    'work/stage/app/scripts/fixtures/w15-owned-process-stop.js': b'FICTIONAL SCRIPT',
                    'database/final.PRIVATE.dump': b'PGDMP-FICTIONAL', 'database/roles.PRIVATE.sql': self.roles,
                    'database/SNAPSHOT_CLOSURE.PRIVATE.json': json.dumps({
                        'schema': 'helmut-w15-mock500-database-export/1', 'context': self.context,
                        'beforeSnapshot': inventory, 'afterSnapshot': inventory}).encode()}
                manifest = {'version': 1, **{k: self.context[k] for k in ('exactCommit', 'runId',
                    'runAttempt', 'inputManifestSHA', 'recipientFingerprint')},
                    'files': [{'path': path, **pin(raw)} for path, raw in sorted(files.items())]}
                for path, raw in files.items():
                    self.put(verified / path, raw)
                raw_manifest = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
                self.put(verified / 'manifest.PRIVATE.json', raw_manifest)
                collection = {'manifest': manifest, 'manifestSHA256': pin(raw_manifest)['sha256']}
                image, owned_id = 'sha256:' + 'd' * 64, 'e' * 64
                state = {'running': False, 'create': None, 'module': None}
                class Thread:
                    alive = False
                    def start(self):
                        self.alive = True
                    def is_alive(self):
                        return self.alive
                self.w.thread = Thread()
                self.w.sample = Mock()
                def stop():
                    self.w.finished.set()
                    self.w.thread.alive = False
                self.w.stop = stop
                def docker(*args, **kwargs):
                    module = state['module']
                    if args[:2] == ('image', 'inspect'):
                        return json.dumps([{'Id': image}]).encode()
                    if args[0] == 'ps':
                        return b''
                    if args[0] == 'create':
                        state['create'] = args
                        return owned_id.encode()
                    if args[0] == 'start':
                        state['running'] = True
                    if args[0] == 'stop':
                        state['running'] = False
                    if args[0] == 'inspect':
                        create = state['create']
                        labels = dict(create[i+1].split('=', 1) for i, value in enumerate(create) if value == '--label')
                        mounts = []
                        for i, value in enumerate(create):
                            if value == '--mount':
                                options = create[i+1].split(',')
                                row = dict(v.split('=', 1) for v in options if '=' in v)
                                mounts.append({'Type': 'bind', 'Source': row['src'], 'Destination': row['dst'],
                                               'RW': 'readonly' not in options})
                        return json.dumps([{'Id': owned_id, 'Name': '/' + module.CONTAINER, 'Image': image,
                            'Config': {'Labels': labels}, 'NetworkSettings': {'Ports': {}}, 'Mounts': mounts,
                            'HostConfig': {'Memory': expected_limit, 'MemorySwap': expected_limit,
                                'CgroupParent': self.resources.unit, 'NetworkMode': 'none', 'RestartPolicy': {'Name': 'no'}},
                            'State': {'Running': state['running'], 'Pid': 1234 if state['running'] else 0,
                                      'OOMKilled': False, 'ExitCode': 0}}]).encode()
                    return b''
                def watch(path):
                    module = state['module']
                    self.assertEqual(path, self.resources.path)
                    self.restore_fixture.work, self.restore_fixture.state = module.WORK, module.WORK / 'state'
                    self.restore_fixture.controller = module
                    self.export_fixture.work = module.WORK
                    if corrupt:
                        self.export_fixture.observed['tableInventory'][0]['sha256'] = 'f' * 64
                    return self.w
                old_spec = B.importlib.util.spec_from_file_location
                def custom_spec(name, path, *args, **kwargs):
                    if Path(path).name == 'synthetik-500-w15-full500-controller.py':
                        def populate(module):
                            state['module'] = module
                            module.BASE, module.DB, module.DOCKER = B.BASE, B.DATABASE, list(B.R.DOCKER)
                            module.LIMIT, module.MAXIMUM, module.RESERVE = B.P.LIMIT, B.P.MAXIMUM, B.P.RESERVE
                            module.ENV = {'PATH': '/usr/bin:/bin'}
                            module.docker, module.Supervisor = docker, watch
                            module.save = lambda name, value: self.put(module.WORK / name, json.dumps(value).encode())
                        return ModuleSpec(name, SimpleNamespace(create_module=lambda spec: None, exec_module=populate))
                    return old_spec(name, path, *args, **kwargs)
                initial_restore_calls, initial_export_calls = len(self.restore_fixture.calls), len(self.export_fixture.calls)
                with patch.object(B.importlib.util, 'spec_from_file_location', side_effect=custom_spec), \
                     patch.object(B.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                    kwargs = dict(context=self.context, controller_context={'runtimePins': {'imageId': image, 'node': pin(self.node)}},
                        collection=collection, resources=self.resources, recovery_root=recovery, guard=self.guard)
                    if corrupt:
                        with self.assertRaisesRegex(B.BackupRejected, 'RECOVERY_FAILED_OR_UNKNOWN'):
                            B.restore_readback(verified, **kwargs)
                    else:
                        receipt = B.restore_readback(verified, **kwargs)
                        self.assertTrue(receipt['completeTableAndSequenceInventoryMatched'])
                        self.assertTrue(receipt['rolesSemanticsMatched'])
                        self.assertTrue(receipt['ownedRecoveryContainerStopped'])
                        self.assertEqual(receipt['memoryProfile'], B.P.phases().MOCK_PROFILE if phased else B.P.PROFILE)
                        self.assertFalse(receipt['mock500Acceptance'])
                self.assertFalse(state['running'])
                self.assertIn('--memory=' + str(expected_limit), state['create'])
                self.assertEqual(len(self.restore_fixture.calls) - initial_restore_calls, 5)
                self.assertEqual(len(self.export_fixture.calls) - initial_export_calls, 4)
                self.assertEqual((verified / 'database/roles.PRIVATE.sql').read_bytes(), self.roles)


if __name__ == '__main__':
    unittest.main()
