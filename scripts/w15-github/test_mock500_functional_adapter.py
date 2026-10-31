"""Targeted fictional functional-mode seams; no DB, network, keys or 500 run."""
import sys
sys.dont_write_bytecode = True

import ast
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import queue
import stat
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('functional_mock_tests_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


F, B, RF, D, FC = (load(name) for name in (
    'test_mock500_start', 'test_mock500_backup', 'test_mock500_runner',
    'test_mock500_full_dispatch', 'test_functional_contract'))
NOW = datetime(2026, 11, 1, 10, tzinfo=timezone.utc)


def functional_end(value):
    value.update(schema=FC.F.ACCEPTANCE_SCHEMA, status=FC.F.END_ACCEPTANCE_STATUS,
        scope=FC.F.SCOPES[FC.F.END_MODE], resourceContract=FC.F.CONTRACT, memoryProfile=FC.F.END_PROFILE,
        processingCounts={'authCAS': 500, 'usageRows': 6000, 'nativePostimages': 3501},
        **dict.fromkeys(('functionalSafetyAccepted', 'backupSafetyAccepted', 'independentRestoreFunctionAccepted',
            'completeBackupAccepted', 'completeProcessingAccepted', 'ownedProcessesStopped',
            'authenticatedRemoteReadback', 'secondRestoreIntegrityAccepted'), True),
        **dict.fromkeys(('processingMemoryAccepted', 'commonLifetimeMemoryAccepted',
            'legacyRegularMemoryAccepted', 'providerResourceAccepted'), False))


def resource_observation():
    module = FC.F.load('memory_components')
    return {'schema': 'helmut-w15-functional-resource-observation/1', 'resourceContract': FC.F.CONTRACT,
        'memoryProfile': FC.F.MOCK_PROFILE, 'sampleCount': 1, 'firstKernel': 'UNKNOWN', 'lastKernel': 'UNKNOWN',
        'components': module._unknown(), 'componentPSSMaxima': dict.fromkeys(module.ROLES, 'UNKNOWN'),
        'snapshotAtomic': False, 'peakCompositionKnown': False, 'fileCacheAdditiveToPSS': False,
        'differentTimeMaximaAdditive': False, 'applicationWithTestDriverCombined': True,
        'providerResourceAccepted': False, 'fullLifetimeClosureAccepted': False, 'executionAuthority': False}


class FunctionalMockAdapters(unittest.TestCase):
    def fixture(self):
        case = F.StartChecks('runTest'); case.setUp(); self.addCleanup(case.doCleanups)
        case.request.update(mode=F.S.FUNCTIONAL, limits=FC.F.limits('mock500'))
        case.observed['mode'] = F.S.FUNCTIONAL
        case.approval.update(mode=F.S.FUNCTIONAL, scope=FC.F.SCOPES[FC.F.MOCK_MODE],
            limits=FC.F.limits('mock500'), issuedAt='2026-11-01T09:59:00Z', expiresAt='2026-11-01T10:59:00Z')
        functional_end(case.end)
        case.bridge.update(mockMemoryContract=FC.F.MOCK_PROFILE, functionalContract=FC.F.CONTRACT)
        self.rebind(case)
        return case

    def rebind(self, case):
        case.end_envelope = F.envelope(case.end)
        case.bridge['end500AcceptanceSHA256'] = case.end_envelope['sha256']
        case.bridge_envelope = F.envelope(case.bridge)
        case.approval.update(end500AcceptanceSHA256=case.end_envelope['sha256'],
                             compatibilitySHA256=case.bridge_envelope['sha256'])

    def admit(self, case):
        return F.S.validate_admission(case.request, case.end_envelope,
            compatibility_bridge=case.bridge_envelope, observed_context=case.observed,
            expected_end500_commit=case.end['exactCommit'], now=NOW)

    def test_positive_new_end_backup_and_stop_are_required_without_old_ram_pass(self):
        case = self.fixture(); accepted = self.admit(case)
        self.assertEqual(accepted['memoryProfile'], FC.F.MOCK_PROFILE)
        self.assertFalse(accepted['executionAuthority'] or accepted['mock500Acceptance'])
        original = copy.deepcopy(case.end)
        changes = [(key, False) for key in ('functionalSafetyAccepted', 'backupSafetyAccepted',
            'independentRestoreFunctionAccepted', 'completeBackupAccepted', 'completeProcessingAccepted',
            'ownedProcessesStopped', 'authenticatedRemoteReadback', 'secondRestoreIntegrityAccepted')]
        changes += [(key, True) for key in ('processingMemoryAccepted', 'commonLifetimeMemoryAccepted',
            'legacyRegularMemoryAccepted', 'providerResourceAccepted')]
        changes += [('schema', 'helmut-w15-independent-end500-acceptance/2'),
            ('status', 'COMPLETED_END500_CAPACITY_DIAGNOSTIC_ONLY'), ('activeProfiles', 1),
            ('processingCounts', {'authCAS': 500, 'usageRows': 5999, 'nativePostimages': 3501}),
            ('resourceContract', 'unapproved'), ('memoryProfile', FC.F.MOCK_PROFILE)]
        for key, value in changes:
            case.end = {**original, key: value}; self.rebind(case)
            with self.subTest(key=key), self.assertRaises(F.S.StartRejected): self.admit(case)

    def test_same_code_head_still_requires_prior_distinct_run_and_independent_bridge(self):
        case = self.fixture(); case.end['exactCommit'] = case.request['exactCommit']
        case.bridge['baselineExactCommit'] = case.request['exactCommit']; self.rebind(case)
        self.admit(case)
        case.end['runId'] = case.observed['runId']; self.rebind(case)
        with self.assertRaises(F.S.StartRejected): self.admit(case)
        case.end['runId'] = '87654321'; case.bridge['functionalContract'] = 'unapproved'; self.rebind(case)
        with self.assertRaisesRegex(F.S.StartRejected, 'BRIDGE_REQUIRED'): self.admit(case)

    def test_actual_guard_observes_old_peak_exceedance_but_keeps_hard_safety_and_times(self):
        case = self.fixture(); observation = FC.sample()
        case.resources = SimpleNamespace(profile=FC.F.MOCK_PROFILE, functional_stage='mock500',
            check_context=Mock(side_effect=lambda _: copy.deepcopy(observation)))
        guard = F.S.StartGuard(case.context, case.approval, case.end_envelope, case.resources,
            compatibility_bridge=case.bridge_envelope, observed_context=case.observed,
            expected_end500_commit=case.end['exactCommit'], started_at=NOW-timedelta(minutes=5),
            started_monotonic=700, now=NOW)
        self.assertGreater(guard.before_dispatch(now=NOW)['kernelLifetimePeakBytes'], F.S.R.MAXIMUM)
        for kind, limit in (('auth', 30000), ('unit', 60000), ('provider', 20000)):
            self.assertEqual(guard.observe_duration(kind, limit-.001), limit-.001)
            with self.assertRaises(F.S.StartRejected): guard.observe_duration(kind, limit)
        observation['events']['max'] = 1
        with self.assertRaises(ValueError): guard.before_dispatch(now=NOW)
        self.assertIsNotNone(guard.failure)

    def test_window_and_owner_expiry_are_bounded_without_changing_historical_dates(self):
        dispatch = D.D
        dispatch.check_start_window(NOW, dispatch.FUNCTIONAL)
        for at in ('2026-10-31T10:00:00+00:00', '2026-11-07T19:30:00+00:00', '2026-11-08T10:00:00+00:00'):
            with self.assertRaises(dispatch.DispatchRejected):
                dispatch.check_start_window(datetime.fromisoformat(at), dispatch.FUNCTIONAL)
        with self.assertRaises(dispatch.DispatchRejected): dispatch.check_start_window(NOW)
        case = self.fixture(); case.approval['expiresAt'] = '2026-11-01T10:00:00Z'
        with self.assertRaises(F.S.StartRejected): self.admit(case)

    def test_closed_new_worker_result_never_claims_regular_or_provider_acceptance(self):
        request = RF.request(True); request.update(mode=RF.R.FUNCTIONAL, limits=FC.F.limits('mock500'))
        result = RF.result(request)
        result.update(functionalContract=FC.F.CONTRACT, functionalSafetyChecksCompleted=True,
                      legacyRegularMemoryAccepted=False, providerResourceAccepted=False,
                      functionalResourceObservation=resource_observation())
        self.assertEqual(RF.R.validate_public_result(result, request), result)
        for key, bad in (('legacyRegularMemoryAccepted', True), ('providerResourceAccepted', True),
                         ('functionalSafetyChecksCompleted', False), ('functionalContract', 'unapproved'), ('results', 1499)):
            with self.subTest(key=key), self.assertRaises(RF.R.MockRunnerError):
                RF.R.validate_public_result({**result, key: bad}, request)

    def test_backup_uses_functional_sample_and_never_requests_legacy_transition(self):
        case = B.MockBackupChecks('runTest'); case.setUp(); self.addCleanup(case.doCleanups)
        case.resources.functional_stage = 'mock500'; case.resources.profile = FC.F.MOCK_PROFILE
        case.resources.sample = Mock(side_effect=FC.sample); case.resources.begin_backup = Mock()
        self.assertEqual(B.B._resource_sample(case.resources)['kernelLifetimePeakBytes'], 3680530432)
        case.body.update(profiles=500, units=500, localProviderPhases=1000, positions=1500, controls=8000)
        manifest = {'exactCommit': case.context['exactCommit'], 'runId': case.context['runId'], 'backupRoot': str(case.backup)}
        inputs = SimpleNamespace(backup_context=lambda: case.context,
            controller_context=lambda: {'hostPaths': {'prepare': str(case.prepared)}})
        close = Mock(return_value={'ownedContainerStopped': True, 'watchClosed': True})
        hook = B.B.completion_hook(manifest, {}, case.guard)
        with patch.object(B.B, 'export_database'), patch.object(B.B, 'collect', side_effect=RuntimeError('FICTIONAL STOP')) as collect:
            with self.assertRaisesRegex(RuntimeError, 'FICTIONAL STOP'):
                hook(controller=case.controller, inputs=inputs, resources=case.resources,
                     supervisor=case.w, result=case.body, close_owned=close)
        close.assert_called_once(); collect.assert_called_once(); case.resources.begin_backup.assert_not_called()
        with self.assertRaises(B.B.BackupRejected):
            hook(controller=case.controller, inputs=inputs, resources=case.resources,
                 supervisor=case.w, result=case.body, close_owned=close)

    def test_supervisor_progress_keeps_the_actual_same_parent_peak_and_limit(self):
        source = HERE.parent / 'synthetik-500-w15-full500-controller.py'; tree = ast.parse(source.read_text())
        cls = next(row for row in tree.body if isinstance(row, ast.ClassDef) and row.name == 'Supervisor')
        cls.body = [row for row in cls.body if isinstance(row, ast.FunctionDef) and row.name in ('sample', 'publish')]
        import datetime as dt
        namespace = {'datetime': dt, 'time': time, 'json': json, 'LIMIT': 2048000000,
            'MAXIMUM': 1638400000, 'RESERVE': 409600000, 'MEMORY': {'minimumReservePercent': 20}}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[cls], type_ignores=[])), str(source), 'exec'), namespace)
        watch = namespace['Supervisor'](); observation = FC.sample()
        watch.common_resources = SimpleNamespace(functional_stage='mock500', container_limit=FC.F.HARD_LIMIT,
            sample=lambda: copy.deepcopy(observation))
        watch.start_guard = watch.disk_guard = Mock()
        watch.closure_mode = watch.mock_backup_closure = False
        watch.maximum = 0; watch.progress_lock = threading.RLock(); watch.progress_queue = queue.Queue()
        watch.accepted_indexes = set(); watch.last_accepted_index = watch.last_ack_monotonic = None
        watch.started_monotonic = time.monotonic(); watch.stage_name = 'mock500-processing'
        watch.unit_max_ms = watch.auth_max_ms = watch.cas_max_ms = None
        watch.sample(); watch.publish('supervisor-heartbeat')
        row = watch.progress_queue.get_nowait()
        self.assertEqual(row['memory']['comparisonBudgetBytes'], FC.F.HARD_LIMIT)
        self.assertEqual(row['memory']['kernelLifetimePeakBytes'], observation['kernelLifetimePeakBytes'])
        self.assertEqual(row['memory']['requiredReserveBytes'], 0)
        watch.start_guard.before_dispatch.assert_called_once(); watch.disk_guard.assert_called_once()

    def test_native_connection_readback_is_partial_honest_and_rejects_default_100(self):
        source = HERE.parent / 'synthetik-500-w15-full500-controller.py'; tree = ast.parse(source.read_text())
        function = next(row for row in tree.body if isinstance(row, ast.FunctionDef) and row.name == 'verify_functional_connections')
        reader = Mock(return_value={'maxConnections': 60, 'clientBackends': 3}); namespace = {'read': reader}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), str(source), 'exec'), namespace)
        receipt = namespace['verify_functional_connections']()
        self.assertEqual(receipt['clientBackends'], 3); self.assertEqual(receipt['trueConnectionPeak'], 'UNKNOWN')
        self.assertTrue(receipt['observerIncluded']); self.assertEqual(reader.call_args.kwargs, {'database': 'postgres'})
        for bad in ({'maxConnections': 100, 'clientBackends': 3}, {'maxConnections': 60, 'clientBackends': 61},
                    {'maxConnections': 60, 'clientBackends': True}, {'maxConnections': 60, 'clientBackends': 0}):
            reader.return_value = bad
            with self.assertRaises(AssertionError): namespace['verify_functional_connections']()

    def test_sender_requires_the_real_completed_independent_functional_end_run(self):
        case = D.MockFullDispatchChecks('runTest'); case.setUp(); dispatch = D.D
        functional_end(case.end)
        case.bridge.update(mockMemoryContract=FC.F.MOCK_PROFILE, functionalContract=FC.F.CONTRACT,
                           end500AcceptanceSHA256=D.envelope(case.end)['sha256'])
        bindings = case.request['bindings']
        bindings.update(end500Acceptance=D.envelope(case.end), compatibilityBridge=D.envelope(case.bridge))
        prior = {'state': 'open', 'merged': False, 'head': {'sha': D.BASELINE},
                 'body': '```json\n' + dispatch.canonical(case.end).decode() + '\n```'}
        receiver = {'state': 'open', 'merged': False, 'head': {'sha': D.TARGET},
                    'body': '```json\n' + dispatch.canonical(case.bridge).decode() + '\n```'}
        check = lambda: dispatch.verify_prior(bindings, D.TARGET, case.qualification['sha256'],
            receiver, prior, api=case.api, mode=dispatch.FUNCTIONAL)
        check()
        for key, bad in (('conclusion', 'failure'), ('run_attempt', 2), ('event', 'push'), ('status', 'in_progress')):
            original = case.api.prior_run[key]; case.api.prior_run[key] = bad
            with self.subTest(key=key), self.assertRaises(dispatch.DispatchRejected): check()
            case.api.prior_run[key] = original
        case.bridge['functionalContract'] = 'unapproved'; bindings['compatibilityBridge'] = D.envelope(case.bridge)
        receiver['body'] = '```json\n' + dispatch.canonical(case.bridge).decode() + '\n```'
        with self.assertRaises(dispatch.DispatchRejected): check()
        self.assertEqual(case.api.posts, [])

    def test_new_backup_audit_requires_functional_safety_and_cannot_claim_twenty_percent(self):
        case = B.MockBackupChecks('runTest'); case.setUp(); self.addCleanup(case.doCleanups)
        file = case.work / 'FULL500_RUNTIME_RESULT.SAFE.json'
        original = json.loads(file.read_bytes()); value = copy.deepcopy(original)
        value.update(functionalContract=FC.F.CONTRACT, memoryProfile=FC.F.MOCK_PROFILE,
                     legacyRegularMemoryAccepted=False, providerResourceAccepted=False)
        value['checks']['functionalSharedSafety'] = value['checks'].pop('sharedCapAnd20PercentReserve')
        file.write_text(json.dumps(value)); file.chmod(0o600)
        B.B._mock_closure(case.work, case.body, functional_stage='mock500')
        with self.assertRaises(B.B.BackupRejected): B.B._mock_closure(case.work, case.body)
        value['checks']['sharedCapAnd20PercentReserve'] = True
        file.write_text(json.dumps(value))
        with self.assertRaises(B.B.BackupRejected): B.B._mock_closure(case.work, case.body, functional_stage='mock500')

    def test_passive_peer_roles_use_only_bound_native_pids_and_reject_links(self):
        source = HERE.parent / 'synthetik-500-w15-full500-controller.py'; tree = ast.parse(source.read_text())
        function = next(row for row in tree.body if isinstance(row, ast.FunctionDef) and row.name == 'functional_role_bindings')
        roles = SimpleNamespace(bindings=Mock(return_value=[]))
        namespace = {'os': os, 'pathlib': __import__('pathlib'), 'stat': stat, '_mock_module': lambda _: roles}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), str(source), 'exec'), namespace)
        with tempfile.TemporaryDirectory(prefix='mock-functional-fictional-pids-') as folder:
            root = Path(folder); (root/'state').mkdir()
            gateway = root/'state/gateway.pid'; gateway.write_text('1234'); gateway.chmod(0o600)
            pg = root/'state/postgrest.pid'; pg.write_text('2345'); pg.chmod(0o600)
            resources = SimpleNamespace(path='/FICTIONAL', _identity=(1, 2))
            namespace['functional_role_bindings'](resources, 6789, 'a'*64, root)
            self.assertEqual(roles.bindings.call_args.args[-1], {'helmut-node': 1234, 'postgrest': 2345})
            pg.unlink(); pg.symlink_to(gateway)
            namespace['functional_role_bindings'](resources, 6789, 'a'*64, root)
            self.assertEqual(roles.bindings.call_args.args[-1], {'helmut-node': 1234})


if __name__ == '__main__': unittest.main()
