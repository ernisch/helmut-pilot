"""Only fictional request/receipt/gate seams; no originals or complete runs."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('host_function_checks_' + name, HERE/(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


H, D, T, F = (load(n) for n in ('host_functional_contract', 'test_dynamic_host_capacity',
                              'test_host_capacity_telemetry', 'test_restore_workflow'))
W = F.W
NOW = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)


def request():
    q = D.request()
    q['approval'].update(resourceContract=H.CONTRACT,
        issuedAt='2026-11-02T09:59:00Z', expiresAt='2026-11-02T11:00:00Z')
    return q


def receipt(q):
    proof = dict(H.COUNTS, activeProfiles=0, exportCompleted=True, ownedServicesStopped=True,
                 authenticatedRemoteReadback=True, secondRecoveryIntegrity=True)
    sample = T.sample(); sample['hostCapacitySafetyObserved'] = True
    return dict(status='COMPLETED_FULL_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY',
        **{k: q[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt', 'nonce')},
        **dict.fromkeys(('end500Acceptance', 'mock500Acceptance', 'commonLifetimeMemoryAccepted',
            'legacyEnd500Accepted', 'legacyRegularMemoryAccepted', 'providerResourceAccepted',
            'executionAuthority', 'retryAllowed', 'legacyRestoreAccepted'), False),
        diagnosticOnly=True, sameKernelParentIdentity=True, ownedChildrenExited=True,
        hostCapacityBudget=T.T.CAP.host_budget(T.admission()),
        hostCapacityAdmission=T.T.CAP.host_public_admission(T.admission()),
        initialCommonParent=copy.deepcopy(sample), finalCommonParentAfterOwnedExits=copy.deepcopy(sample),
        workerResult=W._result(q, functional_results=proof),
        capacityMeasurement=sample['capacityMeasurement'],
        end500CapacityTrace=T.HostCapacityTelemetryChecks().trace().summary())


def actual_inputs(q):
    return dict(expected_commit=q['exactCommit'], w15_mode=q['mode'],
        w15_request=H.canonical({k:q[k] for k in W.DECLARATION_KEYS}).decode())


def job(q):
    return dict(id=1234567, run_id=int(q['runId']), run_attempt=1, head_sha=q['exactCommit'],
        status='completed', conclusion='success', started_at='2026-11-02T10:00:00Z',
        completed_at='2026-11-02T10:20:00Z')


def accepted(q, result, base=None):
    observed = H.observe_receipt(result, q)
    result['hostFunctionalObservation'] = observed
    return {**(base or {}), 'schema': H.ACCEPTANCE_SCHEMA, 'status': H.ACCEPTANCE_STATUS,
        'scope': H.SCOPE, 'resourceContract': H.CONTRACT, 'memoryProfile': D.CAP.HOST_PROFILE,
        **{k:q[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')},
        'receiptSHA256': H.digest(result), 'requestSHA256': H.digest(q),
        'sameRunFunctionalObservationSHA256': H.digest(observed),
        'sourceQualificationSHA256': q['sourceQualification']['sha256'],
        'actualWorkflowInputsSHA256': H.digest(actual_inputs(q)), 'jobId':job(q)['id'],
        'observedJobWallSeconds':1200,
        'processingCounts': dict(H.COUNTS), 'profiles':500, 'activeProfiles':0,
        'resourceObservation': observed['resourceObservation'],
        'sameRunFunctionalObservationAccepted': True, 'sharedSafetyAccepted':True,
        'independentOfOriginalExecution':True, 'remainingCriticalOrHighFindings':0,
        'applicationProviderCapacity':'UNKNOWN', 'databaseProviderCapacity':'UNKNOWN',
        **dict.fromkeys(H.TRUE_FIELDS, True), **dict.fromkeys(H.FALSE_FIELDS, False)}


class HostFunctionalChecks(unittest.TestCase):
    def test_explicit_new_binding_and_legacy_modes_unchanged(self):
        q = request()
        with patch.dict(os.environ, F.environment(q)):
            W.validate_admission(q, F.payload(q), now=NOW)
            D.R.validate_request(q, F.payload(q))
        H.validate_start(q, NOW)
        self.assertEqual(D.R._ctx(q), D.R._ctx(D.request()))
        self.assertEqual(D.CAP.HARD_LIMIT, 4999999488)
        self.assertEqual(W.LIMITS['maximumConsumptionBytes'], 2048000000)
        old = D.request()
        self.assertFalse(H.selected(old))
        with self.assertRaises(ValueError): H.observe_receipt(receipt(q), old)
        bad = copy.deepcopy(q); bad['approval']['resourceContract'] = 'UNAPPROVED'
        with patch.dict(os.environ, F.environment(bad)), self.assertRaises(W.WorkflowRejected):
            W.validate_admission(bad, F.payload(bad), now=NOW)
        bad = copy.deepcopy(q); bad['approval']['authorized'] = False
        with self.assertRaises(ValueError): H.validate_start(bad, NOW)

    def test_same_run_function_success_above_five_gb_is_not_old_ram_or_provider_success(self):
        q = request(); result = receipt(q); out = H.observe_receipt(result, q)
        self.assertEqual(out['processingCounts'], H.COUNTS)
        self.assertGreater(out['resourceObservation']['kernelLifetimePeakBytes'], 4999999488)
        self.assertFalse(out['independentAcceptanceCompleted'])
        self.assertTrue(all(out[k] is False for k in H.FALSE_FIELDS))
        self.assertEqual(out['resourceObservation']['providerCapacity'], 'UNKNOWN')
        self.assertNotIn('hostFunctionalObservation', result)

    def test_missing_function_backup_or_stop_and_mismatched_lifetime_fail(self):
        q = request(); good = receipt(q)
        for key in good['workerResult']['diagnosticResults']:
            bad = copy.deepcopy(good); value = bad['workerResult']['diagnosticResults'][key]
            bad['workerResult']['diagnosticResults'][key] = False if type(value) is bool else value+1
            with self.subTest(key=key), self.assertRaises(Exception): H.observe_receipt(bad, q)
        for key, value in (('ownedChildrenExited', False), ('sameKernelParentIdentity', False),
                           ('runId', '999999'), ('nonce', 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
                           ('status', 'FAIL_W15_ISOLATED_WORKFLOW')):
            bad = copy.deepcopy(good); bad[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): H.observe_receipt(bad, q)

    def test_final_kernel_sample_keeps_all_safety_guards_and_peak_no_reset(self):
        q = request(); good = receipt(q)
        changes = [('swapCurrentBytes', 1), ('kernelLifetimePeakBytes', 9*1024**3),
                   ('configuredLimit', '4999999488'), ('hostCapacitySafetyObserved', False)]
        for key, value in changes:
            bad = copy.deepcopy(good); bad['finalCommonParentAfterOwnedExits'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): H.observe_receipt(bad, q)
        for key in ('max', 'oom', 'oom_kill', 'oom_group_kill'):
            bad = copy.deepcopy(good); bad['finalCommonParentAfterOwnedExits']['events'][key] = 1
            with self.subTest(key=key), self.assertRaises(ValueError): H.observe_receipt(bad, q)
        bad = copy.deepcopy(good)
        bad['initialCommonParent']['hostCapacityObservation']['hostAvailableBytes'] = D.CAP.HOST_RESERVE-1
        with self.assertRaises(ValueError): H.observe_receipt(bad, q)
        bad = copy.deepcopy(good); bad['finalCommonParentAfterOwnedExits']['kernelLifetimePeakBytes'] -= 4096
        with self.assertRaises(ValueError): H.observe_receipt(bad, q)

    def test_independent_record_requires_same_actual_successful_run(self):
        q = request(); result = receipt(q); record = accepted(q, result)
        run = dict(id=int(q['runId']), head_sha=q['exactCommit'], head_branch=q['branch'].split('refs/heads/')[1],
            event='workflow_dispatch', status='completed', conclusion='success', run_attempt=1, workflow_id=313506164)
        H.validate_independent_acceptance(record, result, q, run, job=job(q), actual_inputs=actual_inputs(q))
        for key, value in (('conclusion', 'failure'), ('id', 999999), ('head_sha', 'f'*40)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                H.validate_independent_acceptance(record, result, q, dict(run, **{key:value}),
                    job=job(q), actual_inputs=actual_inputs(q))
        bad = copy.deepcopy(result); bad.pop('hostFunctionalObservation')
        with self.assertRaises(ValueError): H.validate_independent_acceptance(record, bad, q, run,
            job=job(q), actual_inputs=actual_inputs(q))
        for key in ('receiptSHA256', 'requestSHA256', 'sameRunFunctionalObservationSHA256'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                H.validate_independent_acceptance(dict(record, **{key:'f'*64}), result, q, run,
                    job=job(q), actual_inputs=actual_inputs(q))
        with self.assertRaises(ValueError): H.validate_acceptance(dict(record, providerResourceAccepted=True))

    def test_actual_job_inputs_prevent_relabelling_an_old_diagnostic_and_enforce_time(self):
        q = request(); result = receipt(q); record = accepted(q, result)
        run = dict(id=int(q['runId']), head_sha=q['exactCommit'], head_branch=q['branch'].split('refs/heads/')[1],
            event='workflow_dispatch', status='completed', conclusion='success', run_attempt=1, workflow_id=313506164)
        old = copy.deepcopy(q); old['approval']['resourceContract'] = D.CAP.HOST_PROFILE
        # Both the forged request and receipt are self-consistent. The actual
        # independently fetched old job inputs, however, retain its old contract.
        old_inputs = actual_inputs(old)
        forged = dict(record, actualWorkflowInputsSHA256=H.digest(old_inputs))
        with self.assertRaises(ValueError):
            H.validate_independent_acceptance(forged, result, q, run, job=job(q), actual_inputs=old_inputs)
        for change in ({'run_id':999999}, {'conclusion':'failure'}, {'run_attempt':2},
                       {'completed_at':'2026-11-02T11:00:01Z'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                H.validate_independent_acceptance(record, result, q, run,
                    job=dict(job(q), **change), actual_inputs=actual_inputs(q))

    def test_outer_workflow_emits_new_observation_only_after_complete_receipt_validation(self):
        q = request(); result = receipt(q); output = io.StringIO()
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None): return NOW.astimezone(tz) if tz else NOW.replace(tzinfo=None)
        raw = W._encode(dict(request=q, privatePayload=F.payload(q)))
        with patch.dict(os.environ, F.environment(q)), patch.object(W, 'datetime', Clock), \
                patch.object(W.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(raw))), \
                patch.object(W.sys, 'stdout', output), patch.object(W, 'validate_event'), \
                patch.object(W, '_load', side_effect=lambda name:SimpleNamespace(launch=lambda *_:copy.deepcopy(result))
                    if name=='runner_start' else load(name)):
            code = W.main(['--launch'])
        self.assertEqual(code, 0, output.getvalue())
        emitted = json.loads(output.getvalue())
        self.assertEqual(emitted['hostFunctionalObservation'], H.observe_receipt(emitted, q))
        self.assertFalse(emitted['end500Acceptance'])

    def test_outer_observation_rejection_retains_closure_phase_without_success(self):
        q = request(); result = receipt(q); output = io.StringIO()
        result['finalCommonParentAfterOwnedExits']['events']['max'] = 1
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None): return NOW.astimezone(tz) if tz else NOW.replace(tzinfo=None)
        raw = W._encode(dict(request=q, privatePayload=F.payload(q)))
        with patch.dict(os.environ, F.environment(q)), patch.object(W, 'datetime', Clock), \
                patch.object(W.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(raw))), \
                patch.object(W.sys, 'stdout', output), patch.object(W, 'validate_event'), \
                patch.object(W, '_load', side_effect=lambda name:SimpleNamespace(launch=lambda *_:copy.deepcopy(result))
                    if name=='runner_start' else load(name)):
            code = W.main(['--launch'])
        self.assertEqual(code, 1)
        emitted = json.loads(output.getvalue())
        self.assertEqual(emitted['status'], 'FAIL_W15_ISOLATED_WORKFLOW')
        self.assertEqual(emitted['phase'], 'closure')
        self.assertNotIn('hostFunctionalObservation', emitted)


if __name__ == '__main__': unittest.main()
