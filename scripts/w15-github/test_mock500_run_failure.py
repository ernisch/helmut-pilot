"""Fictional run failures through the real controller, workflow and bounded IPC.

No original, database, profile, provider or network action is performed.
"""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import io
import json
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
CANARY = 'FICTIONAL_PRIVATE_SQL_URL_TOKEN_MUST_NOT_ESCAPE'


def load(name):
    spec = importlib.util.spec_from_file_location('run_failure_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


FIRST, TERMINAL = map(load, ('test_mock500_first_failure', 'test_mock500_materials_terminal'))
D = TERMINAL.D


def first(**changes):
    return {'schema': 'helmut-w15-mock500-run-failure/1', 'stage': 'run',
        'category': 'RUN_STORED_CHECK_123', 'kind': 'assertion', **changes}


def evidence(**changes):
    return {'schema': 'helmut-w15-mock500-run-evidence/1',
        'binding': {'exactCommit': 'a' * 40, 'runId': '123456789', 'runAttempt': 1,
            'nonce': FIRST.F.NONCE, 'inputBindingSHA256': 'd' * 64},
        'firstFailure': first(), 'completedProfiles': 'UNKNOWN', 'completionMeaning': 'UNKNOWN',
        'nativeCleanup': D.unknown_native_cleanup(), **changes}


def supervisor(c):
    s = c.Supervisor.__new__(c.Supervisor)
    s.prepare_failure = s.run_failure = s.failure = s.stop_failure = None
    s.failure_lock = threading.Lock(); s.progress_lock = threading.RLock()
    s.accepted_indexes = set(); s.last_accepted_index = None; s.ack_channel_rejected = False
    s.unit_max_ms = s.auth_max_ms = s.cas_max_ms = s.last_ack_monotonic = None
    s.backup_runner = s.process = s.inner_stop_thread = None
    s.closure_mode = False; s.stage_name = 'run'; s.stop_dispatched = False
    s.thread = SimpleNamespace(is_alive=lambda: True); s.publish = lambda *a, **k: None
    return s


def ack(index, **changes):
    return {'name': 'unit-final-ack-accepted', 'status': 'PASS', 'index': index, 'unitWallMs': 42,
        'authTimings': {'maximumFullCallWallMs': 10, 'maximumCASWallMs': 5,
            'incompleteFullCalls': 0, 'incompleteCASWrites': 0}, **changes}


def actual_controller_failure(case, *, stage='run', accepted=(), cleanup_failure=False, signal=False):
    fixture = FIRST.F.ControllerAdmissionChecks('runTest'); case.addCleanup(fixture.doCleanups)
    loaded = []
    def inject(f, c):
        loaded.append(c); prior = c.inner
        def inner(s, action, *args, **kwargs):
            if action == stage:
                s.run_failure = first() if stage == 'run' else None
                s.accepted_indexes = set(accepted); s.last_accepted_index = max(accepted) if accepted else None
                raise KeyboardInterrupt(CANARY) if signal else ValueError(CANARY)
            return prior(s, action, *args, **kwargs)
        p = patch.object(c, 'inner', side_effect=inner); p.start(); f.addCleanup(p.stop)
        if cleanup_failure:
            def partial(observation=None):
                observation.update(status='UNKNOWN', activeProfiles=0, confirmedZero='UNKNOWN', nativeBoundZero='UNKNOWN')
                raise OSError(CANARY)
            p = patch.object(c, 'cleanup', side_effect=partial); p.start(); f.addCleanup(p.stop)
    with case.assertRaises(Exception) as caught:
        fixture._run_fictional_bound_pipeline(inject=inject, expect_failure=True)
    return caught.exception, loaded[0]


def forwarded(case, error, controller_type, *, input_binding='d' * 64):
    """Real Workflow rejection and worker packet, then an actual bounded OS Pipe."""
    fixture = FIRST.WF.WorkflowChecks('runTest'); case.addCleanup(fixture.doCleanups)
    workflow = FIRST.WF.W; real_worker = workflow.run_worker
    def aligned_worker(manifest, *args, **kwargs):
        manifest['bindings']['inputBindingSHA256'] = input_binding
        return real_worker(manifest, *args, **kwargs)
    def inject(f, c):
        c.Mock500ControllerFailure = controller_type; c.run_bound.side_effect = error
        p = patch.dict(sys.modules, {'w15_github_mock500_controller': c}); p.start(); f.addCleanup(p.stop)
    with patch.object(workflow, 'run_worker', side_effect=aligned_worker), case.assertRaises(workflow.WorkflowRejected) as caught:
        fixture._fictional_full_worker(inject)
    terminal = TERMINAL.R.S._worker_failure(caught.exception, 'WORKER_RESULT_REJECTED',
        error_type=TERMINAL.R.MockRunnerError)
    return TERMINAL.public_roundtrip(terminal)


def public_fixtures():
    case = unittest.TestCase()
    try:
        error, c = actual_controller_failure(case, accepted=(0, 1), cleanup_failure=True, signal=True)
        rows = [forwarded(case, error, c.Mock500ControllerFailure)]
        for change in ({'completedProfiles': 'UNKNOWN', 'completionMeaning': 'UNKNOWN'},
                       {'firstFailure': 'UNKNOWN'},
                       {'nativeCleanup': {'status': 'PASS', 'activeProfiles': 0, 'confirmedZero': True, 'nativeBoundZero': True}},
                       {'nativeCleanup': {'status': 'FAIL', 'activeProfiles': 1, 'confirmedZero': False, 'nativeBoundZero': False}},
                       {'raw': CANARY}):
            altered = c.Mock500ControllerFailure('mock500-controller-run', run_evidence={**error.run_evidence, **change})
            rows.append(forwarded(case, altered, c.Mock500ControllerFailure))
        return rows
    finally: case.doCleanups()


class RunFailureChecks(unittest.TestCase):
    def controller(self):
        case = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(case.doCleanups)
        return case.load_controller()

    def test_actual_supervisor_first_frame_and_exit_drain_precedence(self):
        c = self.controller(); raw = json.dumps({'kind': 'W15_MOCK500_RUN_FAILURE', 'failure': first()}).encode()
        for reason, accepted in [(None, True), ('full500-stage-failed:run:1', True),
                ('full500-stage-failed:run:-15', False), ('full500-stage-timeout:run', False),
                ('full500-memory-reserve-or-oom', False), ('full500-output-reader-not-drained', False)]:
            with self.subTest(reason=reason):
                s = supervisor(c); s.failure = {'type': 'RuntimeError', 'reason': reason} if reason else None
                s.observe_line(raw, 'prepare'); self.assertIsNone(s.run_failure)
                for bad in (b'x', raw + b'x', b' ' * 513 + raw,
                        json.dumps({'kind': 'W15_MOCK500_RUN_FAILURE', 'failure': dict(first(), raw=CANARY)}).encode()):
                    s.observe_line(bad, 'run'); self.assertIsNone(s.run_failure)
                s.observe_line(raw, 'run')
                s.observe_line(json.dumps({'kind': 'W15_MOCK500_RUN_FAILURE', 'failure': first(kind='aborted')}).encode(), 'run')
                self.assertEqual(s.run_failure, first() if accepted else None)

    def test_actual_pipe_reader_requires_complete_bounded_frame_after_process_exit(self):
        c = self.controller(); raw = json.dumps({'kind': 'W15_MOCK500_RUN_FAILURE', 'failure': first()}).encode() + b'\n'
        class DeferredDrain:
            def __init__(self, target, **kwargs): self.target = target
            def start(self): pass
            def join(self, **kwargs): self.target()
            def is_alive(self): return False
        for payload, accepted in [(raw, True), (raw.rstrip(b'\n'), False), (b' ' * 513 + raw, False), (b'x' * 65536 + raw, False)]:
            with self.subTest(bytes=len(payload)), tempfile.TemporaryDirectory(prefix='fictional-run-pipe-') as tmp:
                s = supervisor(c)
                child = SimpleNamespace(stdout=io.BytesIO(payload), wait=lambda **k: 1, poll=lambda: 1)
                with patch.object(c, 'WORK', Path(tmp)), patch.object(c.subprocess, 'Popen', return_value=child), \
                        patch.object(c.threading, 'Thread', DeferredDrain):
                    with self.assertRaisesRegex(RuntimeError, 'full500-stage-failed:run:1'):
                        s.stage(['FICTIONAL_NO_COMMAND'], 'run', 1)
                self.assertEqual(s.run_failure, first() if accepted else None)

    def test_actual_ack_lower_bound_rejects_duplicate_gap_bad_time_and_freezes(self):
        c = self.controller()
        bad = [ack(0), ack(2), ack(True), ack(1, unitWallMs=60000), ack(1, unitWallMs=float('inf')),
            ack(1, authTimings={}), ack(1, authTimings={**ack(1)['authTimings'], 'maximumCASWallMs': 30000}),
            ack(1, authTimings={**ack(1)['authTimings'], 'incompleteFullCalls': False}),
            ack(1, authTimings={**ack(1)['authTimings'], 'incompleteCASWrites': 1})]
        for value in bad:
            with self.subTest(value=value):
                s = supervisor(c); s.observe_line(json.dumps(ack(0)).encode(), 'run')
                s.observe_line(json.dumps(value).encode(), 'run'); self.assertEqual(s.accepted_indexes, {0})
                self.assertTrue(s.ack_channel_rejected)
                s.observe_line(json.dumps(ack(1)).encode(), 'run'); self.assertEqual(s.accepted_indexes, {0})
        s = supervisor(c)
        for index in range(3): s.observe_line(json.dumps(ack(index)).encode(), 'run')
        self.assertEqual(s.accepted_indexes, {0, 1, 2}); self.assertEqual(s.last_accepted_index, 2)

    def test_actual_controller_preserves_first_run_failure_and_confirmed_lower_bound(self):
        error, c = actual_controller_failure(self, accepted=(0, 1), cleanup_failure=True, signal=True)
        self.assertEqual(error.phase, 'mock500-controller-run'); self.assertEqual(error.run_evidence['firstFailure'], first())
        self.assertEqual(error.run_evidence['completedProfiles'], 2)
        self.assertEqual(error.run_evidence['completionMeaning'], 'CONFIRMED_LOWER_BOUND')
        self.assertEqual(error.run_evidence['nativeCleanup'], {'status': 'UNKNOWN', 'activeProfiles': 0,
            'confirmedZero': 'UNKNOWN', 'nativeBoundZero': 'UNKNOWN'})
        self.assertEqual(error.run_evidence['binding'], evidence()['binding']); self.assertNotIn(CANARY, str(error))

    def test_no_ack_no_run_and_postrun_failure_do_not_invent_zero_or_first_failure(self):
        error, _ = actual_controller_failure(self)
        self.assertEqual(error.run_evidence['completedProfiles'], 'UNKNOWN')
        self.assertEqual(error.run_evidence['completionMeaning'], 'UNKNOWN')
        before, _ = actual_controller_failure(self, stage='prepare'); self.assertIsNone(before.run_evidence)
        after, _ = actual_controller_failure(self, stage='audit')
        self.assertEqual(after.phase, 'mock500-controller-zero-audit')
        self.assertEqual(after.run_evidence['firstFailure'], 'UNKNOWN')
        self.assertEqual(after.run_evidence['completedProfiles'], 'UNKNOWN')

    def test_actual_native_collector_retains_only_final_observations_when_later_reads_fail(self):
        c = self.controller(); context = {'database': 'FICTIONAL', 'operationId': 'OP', 'manifestHash': 'HASH', 'productionCommit': 'a'*40}
        native = {**{k: context[k] for k in ('operationId', 'manifestHash', 'productionCommit')},
            'zustand': 'beendet', 'aktiv': 0, 'fachfelderUnveraendert': True, 'quittungBindungBestaetigt': True}
        cases = [([{'database':'FICTIONAL','active':500}, OSError(CANARY)], D.unknown_native_cleanup()),
            ([{'database':'FICTIONAL','active':500}, {'database':'FICTIONAL','active':0}, OSError(CANARY)],
             {'status':'UNKNOWN','activeProfiles':0,'confirmedZero':'UNKNOWN','nativeBoundZero':'UNKNOWN'}),
            ([{'database':'FICTIONAL','active':500}, {'database':'FICTIONAL','active':0}, native],
             {'status':'PASS','activeProfiles':0,'confirmedZero':True,'nativeBoundZero':True}),
            ([{'database':'FICTIONAL','active':500}, {'database':'FICTIONAL','active':0}, {**native,'aktiv':False}],
             {'status':'FAIL','activeProfiles':0,'confirmedZero':True,'nativeBoundZero':False})]
        for reads, expected in cases:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory(prefix='fictional-native-run-') as tmp:
                (Path(tmp)/'cleanup-context.PRIVATE.json').write_text(json.dumps(context)); observation = D.unknown_native_cleanup()
                with patch.object(c, 'WORK', Path(tmp)), patch.object(c, 'DB', 'FICTIONAL'), \
                        patch.object(c, 'read', side_effect=reads), patch.object(c, 'sql', return_value='{}'), patch.object(c, 'save'):
                    try: c.cleanup(observation=observation)
                    except (OSError, AssertionError): pass
                self.assertEqual(observation, expected)

    def test_native_status_never_inferred_from_outer_eight_cleanup_pass(self):
        error = RuntimeError(CANARY); error.phase='mock500-controller-run'; error.run_evidence=evidence()
        terminal = TERMINAL.R.S._worker_failure(error, 'WORKER_RESULT_REJECTED', error_type=TERMINAL.R.MockRunnerError)
        terminal.cleanup = dict.fromkeys(D.CLEANUP_KEYS, 'PASS'); terminal.refresh()
        public = TERMINAL.public_roundtrip(terminal)
        self.assertEqual(public['runner']['runEvidence']['nativeCleanup'], D.unknown_native_cleanup())
        self.assertEqual(set(public['cleanup'].values()), {'PASS'})

    def test_controller_workflow_real_pipe_preserve_optional_evidence_and_reject_wrong_binding(self):
        error, c = actual_controller_failure(self, accepted=(0, 1), cleanup_failure=True)
        good = forwarded(self, error, c.Mock500ControllerFailure)
        self.assertEqual(good['runner']['runEvidence'], error.run_evidence)
        self.assertEqual(good['worker']['phase'], 'mock500-controller-run')
        for key, value in [('exactCommit','f'*40), ('runId','987654321'), ('runAttempt',2),
                ('nonce','36d5a413-5ca7-415c-a412-62fc45b561c8'), ('inputBindingSHA256','e'*64)]:
            changed=copy.deepcopy(error.run_evidence); changed['binding'][key]=value
            wrong=c.Mock500ControllerFailure('mock500-controller-run',run_evidence=changed)
            public=forwarded(self,wrong,c.Mock500ControllerFailure)
            self.assertEqual(public['worker']['phase'],'mock500-controller-run')
            self.assertNotIn('runEvidence',public.get('runner',{}))
        class Lookalike(RuntimeError):
            phase='mock500-controller-run'; run_evidence=evidence()
        class Subclass(c.Mock500ControllerFailure): pass
        for untyped in (Lookalike(CANARY), Subclass('mock500-controller-run',run_evidence=evidence())):
            self.assertNotIn('runEvidence',forwarded(self,untyped,c.Mock500ControllerFailure).get('runner',{}))

    def test_closed_values_reject_unexpected_keys_raw_canaries_bad_counts_and_wrong_phases(self):
        for category in ('RUN_PROCESS_EXIT','RUN_PROCESS_TIMEOUT','RUN_SUPERVISOR_REJECTED','RUN_FAILURE_UNAVAILABLE','RUN_UNMAPPED','RUN_STORAGE_CHECK_1','RUN_RUNTIME_CHECK_65535'):
            self.assertIsNotNone(D.run_failure(first(category=category)))
        for change in ({'message':CANARY},{'category':'RUN_STORED_CHECK_123\n'},{'category':'RUN_STORED_CHECK_0123'},
                {'category':'RUN_STORED_CHECK_65536'},{'stage':'prepare'},{'kind':[]},{'schema':CANARY}):
            self.assertIsNone(D.run_failure({**first(),**change}))
        for change in ({'raw':CANARY},{'completedProfiles':False},{'completedProfiles':501},{'completedProfiles':-1},
                {'completedProfiles':0},{'completionMeaning':'CONFIRMED_LOWER_BOUND'},
                {'nativeCleanup':{'status':'PASS','activeProfiles':0,'confirmedZero':'UNKNOWN','nativeBoundZero':'UNKNOWN'}}):
            self.assertIsNone(D.run_evidence(evidence(**change)))
        error=RuntimeError(CANARY); error.phase='mock500-controller-prepare'; error.run_evidence=evidence()
        public=TERMINAL.public_roundtrip(TERMINAL.R.S._worker_failure(error,'WORKER_RESULT_REJECTED',error_type=TERMINAL.R.MockRunnerError))
        self.assertNotIn('runEvidence',public.get('runner',{}))
        for row in public_fixtures():
            self.assertNotIn(CANARY,json.dumps(row)); self.assertFalse(row['executionAuthority']); self.assertFalse(row['retryAllowed'])
            self.assertLess(len(TERMINAL.R.S._encode(row,TERMINAL.R.S.MAX_RESULT)),65536)


if __name__ == '__main__':
    if sys.argv[1:] == ['--public-fixtures']: print(json.dumps(public_fixtures()))
    else: unittest.main()
