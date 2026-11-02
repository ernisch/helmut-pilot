"""Tiny materials-only cleanup/admission cases; no DB, originals or providers."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('materials_diagnostic_test_' + name,
                                                HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


CONTRACT, HOST, HF, RUNNER = (load(name) for name in (
    'mock500_materials_contract', 'test_mock500_host_contract',
    'test_host_functional_mock', 'mock500_runner'))
controller_spec = importlib.util.spec_from_file_location('materials_diagnostic_controller',
    HERE.parent / 'synthetik-500-w15-full500-controller.py')
C = importlib.util.module_from_spec(controller_spec); controller_spec.loader.exec_module(C)
NOW = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)


class MaterialsCleanupChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='materials-cleanup-fictional-')
        self.addCleanup(temporary.cleanup); self.root = Path(temporary.name)
        self.context = {'database': C.DB, 'operationId': 'FICTIONAL_OPERATION',
            'manifestHash': 'a' * 64, 'productionCommit': 'b' * 40}
        self.baseline = {'profileFachHash': 'c' * 64}
        self.read = Mock(); self.sql = Mock(return_value='{}'); self.save = Mock()
        for name, value in (('WORK', self.root), ('read', self.read),
                            ('sql', self.sql), ('save', self.save)):
            task = patch.object(C, name, value); task.start(); self.addCleanup(task.stop)

    def context_file(self):
        path = self.root / 'cleanup-context.PRIVATE.json'
        with path.open('xb') as stream:
            os.fchmod(stream.fileno(), 0o600); stream.write(json.dumps(self.context).encode())

    def state(self, active):
        return {'database': C.DB, 'active': active}

    def after(self, **change):
        return {'database': C.DB, 'profiles': 500, 'active': 0,
                'profileFachHash': self.baseline['profileFachHash'], **change}

    def native(self, state, active, **change):
        return {**{key: self.context[key] for key in (
            'operationId', 'manifestHash', 'productionCommit')},
            'zustand': state, 'aktiv': active, 'fachfelderUnveraendert': True,
            'quittungBindungBestaetigt': True, **change}

    def assert_zero(self, expected):
        result = C.materials_cleanup(self.baseline)
        self.assertIs(result['confirmedZero'], True)
        self.assertIs(result['profileFieldsUnchanged'], True)
        self.assertEqual(result['activeProfiles'], 0)
        self.assertEqual(result['nativeZeroState'], expected)
        return result

    def test_no_native_context_zero_is_read_and_no_end_write_occurs(self):
        self.read.side_effect = [self.state(0), self.after()]
        self.assert_zero('NO_OWNED_NATIVE_CONTEXT')
        self.sql.assert_not_called()

    def test_context_but_exact_slot_absence_is_read_not_inferred_from_error(self):
        self.context_file()
        self.read.side_effect = [self.state(0), {'present': False}, self.after()]
        self.assert_zero('NO_OWNED_NATIVE_SLOT')
        query = self.read.call_args_list[1].args[0]
        self.assertIn("id='synthetik500-runtime-FICTIONAL_OPERATION'", query)
        self.assertNotIn('helmut_synthetik500_lesung', query)
        self.sql.assert_not_called()

    def test_bound_prepared_zero_does_not_invent_an_activation_or_end_write(self):
        self.context_file()
        # The source status() SQL also sets both integrity flags true for the
        # checked prepared-zero state (20261011213611..., status() lines278-286).
        self.read.side_effect = [self.state(0), {'present': True},
                                 self.native('vorbereitet', 0), self.after()]
        self.assert_zero('BOUND_PREPARED_ZERO')
        self.sql.assert_not_called()

    def test_active_500_uses_existing_bound_cleanup_exactly_once(self):
        self.context_file()
        self.read.side_effect = [self.state(500), {'present': True}, self.native('aktiv', 500),
            self.state(500), self.state(0), self.native('beendet', 0), self.after()]
        with patch.object(C, 'cleanup', wraps=C.cleanup) as existing:
            self.assert_zero('BOUND_ENDED_ZERO')
        existing.assert_called_once_with()
        self.sql.assert_called_once()
        self.assertIn('public.helmut_synthetik500_ende', self.sql.call_args.args[0])
        self.assertEqual(sum(call.args[0] == 'END_WRITE_ATTEMPT_STARTED.SAFE.json'
                             for call in self.save.call_args_list), 1)

    def test_unknown_endwrite_marker_never_triggers_another_end_write(self):
        self.context_file()
        marker = self.root / 'END_WRITE_ATTEMPT_STARTED.SAFE.json'
        marker.write_text('{"status":"FICTIONAL_UNKNOWN_PRIOR_WRITE"}')
        self.read.side_effect = [self.state(500), {'present': True}, self.native('aktiv', 500),
            self.state(500), self.state(500), self.native('aktiv', 500)]
        with self.assertRaises(AssertionError): C.materials_cleanup(self.baseline)
        self.sql.assert_not_called()
        self.assertFalse(any(call.args[0] == 'MATERIALS_ZERO.SAFE.json'
                             for call in self.save.call_args_list))

    def test_wrong_native_binding_and_changed_profile_fields_are_rejected(self):
        self.context_file()
        for field in ('operationId', 'manifestHash', 'productionCommit'):
            self.read.side_effect = [self.state(0), {'present': True},
                                     self.native('vorbereitet', 0, **{field: 'WRONG'})]
            with self.subTest(field=field), self.assertRaises(AssertionError):
                C.materials_cleanup(self.baseline)
        self.read.side_effect = [self.state(0), {'present': False},
                                 self.after(profileFachHash='d' * 64)]
        with self.assertRaises(AssertionError): C.materials_cleanup(self.baseline)
        self.sql.assert_not_called()

    def test_partial_or_unbound_active_profiles_never_receive_a_generic_update(self):
        for active in (1, 499, 500):
            self.read.side_effect = [self.state(active)]
            with self.subTest(active=active), self.assertRaises(AssertionError):
                C.materials_cleanup(self.baseline)
        self.sql.assert_not_called()

    def test_sql_sessions_are_observed_gone_after_accepted_scoped_signals(self):
        self.sql.return_value = json.dumps({'database': C.DB, 'signalsAccepted': True})
        pending = iter((1, 0))
        def sessions(query):
            # Signal acceptance and an outstanding session cannot produce a
            # mutator-stop marker, much less a profile-zero receipt.
            self.save.assert_not_called()
            return {'database': C.DB, 'otherSessions': next(pending)}
        self.read.side_effect = sessions
        with patch.object(C.time, 'sleep') as sleep:
            C.quiesce_materials()
        self.sql.assert_called_once(); self.assertEqual(self.read.call_count, 2)
        sleep.assert_called_once_with(.1)
        for query in (self.sql.call_args.args[0], *[call.args[0] for call in self.read.call_args_list]):
            self.assertIn('datname=current_database()', query)
            self.assertIn('pid<>pg_backend_pid()', query)
        self.assertIn('pg_terminate_backend(pid)', self.sql.call_args.args[0])
        self.save.assert_called_once_with('MATERIALS_MUTATORS_STOPPED.SAFE.json',
                                         {'signalsAccepted': True, 'otherSessions': 0})

    def test_unaccepted_signals_or_persistent_sessions_never_produce_a_zero_receipt(self):
        for accepted in (False, True):
            self.sql.reset_mock(); self.read.reset_mock(); self.save.reset_mock()
            self.sql.return_value = json.dumps({'database': C.DB, 'signalsAccepted': accepted})
            self.read.return_value = {'database': C.DB, 'otherSessions': 1}
            with self.subTest(accepted=accepted), patch.object(C.time, 'sleep'), \
                 self.assertRaises(AssertionError if not accepted else RuntimeError):
                C.quiesce_materials()
            self.assertEqual(self.read.call_count, 0 if not accepted else 50)
            self.save.assert_not_called()

    def test_bound_native_active_but_zero_profiles_ends_once_and_rejects_unknown_marker(self):
        self.context_file()
        self.read.side_effect = [self.state(0), {'present': True}, self.native('aktiv', 0),
            self.state(0), self.state(0), self.native('beendet', 0), self.after()]
        with patch.object(C, 'cleanup', wraps=C.cleanup) as existing:
            self.assert_zero('BOUND_ENDED_ZERO')
        existing.assert_called_once_with(); self.sql.assert_called_once()
        self.assertIn('public.helmut_synthetik500_ende', self.sql.call_args.args[0])
        self.assertEqual(sum(call.args[0] == 'END_WRITE_ATTEMPT_STARTED.SAFE.json'
                             for call in self.save.call_args_list), 1)
        marker = self.root / 'END_WRITE_ATTEMPT_STARTED.SAFE.json'
        marker.write_text('{"status":"FICTIONAL_UNKNOWN_PRIOR_WRITE"}')
        self.sql.reset_mock(); self.read.reset_mock(); self.save.reset_mock()
        self.read.side_effect = [self.state(0), {'present': True}, self.native('aktiv', 0)]
        with self.assertRaisesRegex(AssertionError, 'materials-previous-end-outcome-unknown'):
            C.materials_cleanup(self.baseline)
        self.sql.assert_not_called(); self.save.assert_not_called()


class MaterialsAdmissionChecks(unittest.TestCase):
    def fixture(self):
        outer = HF.HostFunctionalMockChecks('runTest'); self.addCleanup(outer.doCleanups)
        helper, case = outer.fixture()
        start = HF.M.F.S
        case.request.update(mode=CONTRACT.MODE, limits=start.host().limits())
        case.observed['mode'] = CONTRACT.MODE
        case.approval.update(mode=CONTRACT.MODE, scope=CONTRACT.SCOPE,
            resourceContract=CONTRACT.CONTRACT, limits=start.host().limits(),
            processingSeconds=900, completionSeconds=1080, expectedUnits=0,
            expectedPositions=0, expectedControls=0,
            issuedAt='2026-11-02T09:59:00Z', expiresAt='2026-11-02T10:59:00Z')
        case.bridge.update(mockMemoryContract=start.host().PROFILE,
            functionalContract=start.host().CONTRACT,
            end500FunctionalContract=start.host_functional().CONTRACT)
        helper.rebind(case)
        return start, case

    def admit(self, start, case):
        return start.validate_admission(case.request, case.end_envelope,
            compatibility_bridge=case.bridge_envelope, observed_context=case.observed,
            expected_end500_commit=case.end['exactCommit'], now=NOW)

    def test_own_materials_approval_requires_zero_units_results_and_controls(self):
        start, case = self.fixture()
        accepted = self.admit(start, case)
        self.assertEqual(accepted['memoryProfile'], start.host().PROFILE)
        self.assertFalse(accepted['executionAuthority'] or accepted['mock500Acceptance'])
        changes = {'expectedUnits': 500, 'expectedPositions': 1500, 'expectedControls': 8000,
            'expectedProfiles': 499, 'maxProviderCalls': 1, 'maxReceiveAttempts': 2,
            'processingSeconds': 10800, 'completionSeconds': 12600}
        original = copy.deepcopy(case.approval)
        for key, value in changes.items():
            case.approval.clear(); case.approval.update(original); case.approval[key] = value
            with self.subTest(key=key), self.assertRaises(start.StartRejected): self.admit(start, case)

    def test_old_full_go_expiry_and_wrong_nonce_do_not_authorize_diagnosis(self):
        start, case = self.fixture(); original = copy.deepcopy(case.approval)
        for change in ({'scope': start.host().SCOPE, 'resourceContract': start.host().CONTRACT},
                       {'expiresAt': '2026-11-02T10:00:00Z'}, {'authorized': False},
                       {'nonce': '22222222-2222-4333-8444-555555555555'}):
            case.approval.clear(); case.approval.update(original); case.approval.update(change)
            with self.subTest(change=change), self.assertRaises(start.StartRejected): self.admit(start, case)

    def test_runner_payload_shape_is_closed_for_the_new_mode(self):
        q = HOST.request(); q.update(mode=CONTRACT.MODE, limits=RUNNER.host().limits(), maximumWallSeconds=1080)
        payload = HOST.D.F.payload(q)
        RUNNER.validate_request(q, payload)
        for bad in ({**payload, 'privateRawMessage': 'FICTIONAL_MUST_NOT_ESCAPE'},
                    {**payload, 'keyB64': 'x' * 49153}):
            with self.assertRaises(RUNNER.MockRunnerError): RUNNER.validate_request(q, bad)

    def test_prepare_only_dispatch_and_short_monotonic_guards_keep_native_window(self):
        start, case = self.fixture()
        observed = HOST.D.sample(HOST.D.admission())
        observed['hostCapacitySafetyObserved'] = True
        resources = SimpleNamespace(profile=start.host().PROFILE,
            host_functional_stage='mock500', host_capacity_admission=HOST.D.admission(),
            check_context=Mock(return_value=observed))
        started = NOW - timedelta(seconds=60)
        guard = start.StartGuard(case.context, case.approval, case.end_envelope, resources,
            compatibility_bridge=case.bridge_envelope, observed_context=case.observed,
            expected_end500_commit=case.end['exactCommit'], started_at=started,
            started_monotonic=940, now=NOW)
        self.assertEqual(guard.window['endsAtUTC'], '2026-11-02T12:59:00.000Z')
        self.assertEqual(guard.window['completionDeadlineUTC'], '2026-11-02T13:29:00.000Z')
        guard.before_dispatch(kind='prepare', now=NOW)
        for kind in ('unit', 'auth', 'provider'):
            with self.subTest(kind=kind), self.assertRaises(start.StartRejected):
                guard.before_dispatch(kind=kind, now=NOW)
        with patch.object(start.time, 'monotonic', return_value=1839.99):
            guard.before_dispatch(kind='prepare', now=NOW + timedelta(seconds=839.99))
        with patch.object(start.time, 'monotonic', return_value=1840), self.assertRaises(start.StartRejected):
            guard.before_dispatch(kind='prepare', now=NOW + timedelta(seconds=840))
        with patch.object(start.time, 'monotonic', return_value=2019.99):
            guard.closure_guard(now=NOW + timedelta(seconds=1019.99))
        with patch.object(start.time, 'monotonic', return_value=2020), self.assertRaises(start.StartRejected):
            guard.closure_guard(now=NOW + timedelta(seconds=1020))


class MaterialsResultChecks(unittest.TestCase):
    def fixture(self):
        q = HOST.request(); q.update(mode=CONTRACT.MODE)
        evidence = {'schema': 'helmut-w15-materials-diagnostic-evidence/1',
            'status': 'PASS_PRIVATE_MATERIALS_EVIDENCE_ONLY', 'scope': CONTRACT.SCOPE,
            'artifactId': 123, 'cipherBytes': 512, 'cipherSHA256': 'e' * 64,
            'retentionDays': 1, 'maximumStorageUSD': '0.05',
            'remoteReadbackObserved': True, 'authenticatedReadbackObserved': True,
            **dict.fromkeys(('acceptedAsCompleteBackup', 'mock500Acceptance',
                'productionAcceptance', 'executionAuthority', 'retryAllowed'), False)}
        value = {**{key: q[key] for key in ('mode', 'exactCommit', 'runId', 'runAttempt', 'nonce')},
            'status': CONTRACT.WORKER_STATUS, 'contract': CONTRACT.CONTRACT,
            'materialsCompleted': False,
            'firstFailure': {'schema': 'helmut-w15-materials-first-failure/1',
                'category': 'MATERIALS_MAIN_CHECK_001', 'kind': 'assertion', 'stage': 'baseline'},
            'activeProfiles': 0, 'profiles': 500, 'units': 0, 'providerPhases': 0,
            'profileFieldsUnchanged': True, 'ownedContainerStopped': True, 'watchClosed': True,
            'evidence': evidence, **dict.fromkeys(('executionAuthority', 'mock500Acceptance',
                'end500Acceptance', 'productionAcceptance', 'backupRoundtripVerified', 'retryAllowed'), False)}
        return q, value

    def test_private_nested_extras_and_false_full_count_claims_are_rejected(self):
        q, value = self.fixture(); CONTRACT.validate_result(value, q)
        for target in ('evidence', 'firstFailure'):
            bad = copy.deepcopy(value); bad[target]['rawError'] = 'FICTIONAL_PRIVATE_RAW_MESSAGE'
            with self.subTest(target=target), self.assertRaises(ValueError): CONTRACT.validate_result(bad, q)
        for change in ({'units': 500}, {'providerPhases': 1000}, {'backupRoundtripVerified': True},
                       {'activeProfiles': 1}, {'mock500Acceptance': True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                CONTRACT.validate_result({**value, **change}, q)
        wrong = dict(value, mode=RUNNER.HOST_FUNCTIONAL)
        with self.assertRaises(ValueError): CONTRACT.validate_result(wrong, q)


class MaterialsPipelineChecks(unittest.TestCase):
    def fixture(self):
        helper = load('test_mock500_inputs').ControllerAdmissionChecks('runTest')
        self.addCleanup(helper.doCleanups)
        return helper

    def test_materials_only_success_closes_zero_and_preserves_evidence_without_units(self):
        result, events = self.fixture()._run_fictional_bound_pipeline(diagnostic=True)
        self.assertIs(result['materialsCompleted'], True)
        self.assertIsNone(result['firstFailure'])
        self.assertEqual((result['units'], result['providerPhases'], result['activeProfiles']), (0, 0, 0))
        self.assertEqual(events.count('evidence'), 1)

    def test_materials_child_failure_keeps_fixed_first_category_and_still_closes(self):
        helper = self.fixture()
        fixed = {'schema': 'helmut-w15-materials-first-failure/1',
            'category': 'MATERIALS_MAIN_CHECK_047', 'kind': 'assertion', 'stage': 'builder'}
        def inject(fixture, controller):
            original = controller.Supervisor.stage
            def stage(supervisor, command, phase, seconds, extra_env=None):
                original(supervisor, command, phase, seconds, extra_env)
                if phase == 'materials':
                    controller._private_write(controller.WORK / 'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json', fixed)
                    supervisor.last_stage_exit_code = 1
                    supervisor.failure = {'type': 'RuntimeError', 'reason': 'full500-stage-failed:materials:1'}
                    raise RuntimeError('FICTIONAL_PRIVATE_CHILD_MESSAGE_MUST_NOT_ESCAPE')
            task = patch.object(controller.Supervisor, 'stage', stage)
            task.start(); fixture.addCleanup(task.stop)
        result, events = helper._run_fictional_bound_pipeline(inject=inject, diagnostic=True)
        self.assertIs(result['materialsCompleted'], False)
        self.assertEqual(result['firstFailure'], fixed)
        self.assertNotIn('FICTIONAL_PRIVATE_CHILD_MESSAGE', json.dumps(result))
        self.assertEqual(events.count('evidence'), 1)
        self.assertEqual((result['units'], result['providerPhases'], result['activeProfiles']), (0, 0, 0))

    def test_late_container_stop_failure_cannot_suppress_first_error_evidence_or_claim_pass(self):
        helper = self.fixture()
        fixed = {'schema': 'helmut-w15-materials-first-failure/1',
            'category': 'MATERIALS_MAIN_CHECK_047', 'kind': 'assertion', 'stage': 'builder'}
        def inject(fixture, controller):
            original_stage, original_docker = controller.Supervisor.stage, controller.docker
            def stage(supervisor, command, phase, seconds, extra_env=None):
                original_stage(supervisor, command, phase, seconds, extra_env)
                if phase == 'materials':
                    controller._private_write(controller.WORK / 'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json', fixed)
                    supervisor.last_stage_exit_code = 1
                    supervisor.failure = {'type': 'RuntimeError', 'reason': 'full500-stage-failed:materials:1'}
                    raise RuntimeError('FICTIONAL_PRIVATE_FIRST_CHILD_ERROR')
            def docker(*args, **kwargs):
                if args[0] == 'stop':
                    fixture._last_materials_diagnostic_observation['events'].append('late-close-attempt')
                    raise OSError('FICTIONAL_LATE_CONTAINER_CLOSE_ERROR')
                return original_docker(*args, **kwargs)
            for target, name, replacement in ((controller.Supervisor, 'stage', stage),
                                               (controller, 'docker', docker)):
                task = patch.object(target, name, replacement)
                task.start(); fixture.addCleanup(task.stop)
        with self.assertRaisesRegex(RuntimeError, '^MOCK500_CONTROLLER_FAILED_OR_UNKNOWN$'):
            helper._run_fictional_bound_pipeline(inject=inject, diagnostic=True, expect_failure=True)
        observed = helper._last_materials_diagnostic_observation
        events, controller = observed['events'], observed['controller']
        self.assertEqual(len(observed['evidenceOutcomes']), 1)
        self.assertEqual(observed['evidenceOutcomes'][0]['firstFailure'], fixed)
        self.assertIs(observed['evidenceOutcomes'][0]['ownedContainerStopped'], False)
        self.assertIs(observed['evidenceOutcomes'][0]['watchClosed'], False)
        self.assertLess(events.index('zero'), events.index('evidence'))
        self.assertLess(events.index('evidence'), events.index('late-close-attempt'))
        self.assertEqual(events.count('late-close-attempt'), 1)
        for forbidden in ('prepare', 'run', 'audit', 'backup', 'container-stopped'):
            self.assertNotIn(forbidden, events)
        self.assertFalse((observed['root'] / 'MATERIALS_DIAGNOSTIC_CLOSURE.SAFE.json').exists())
        self.assertEqual(tuple(getattr(controller, key) for key in (
            'WORK', 'BASE', 'DB', 'CONTAINER', 'IMAGE', '_BOUND_CONTEXT_SHA')), observed['originalGlobals'])


if __name__ == '__main__': unittest.main()
