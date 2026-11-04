"""Actual bounded Prepare failure seams, exclusively fictional data and no DB."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import io
import multiprocessing
import threading
import tempfile
from pathlib import Path
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
CANARY = 'FICTIONAL_PRIVATE_SQL_URL_TOKEN_MUST_NOT_ESCAPE'


def load(name):
    spec = importlib.util.spec_from_file_location('prepare_failure_' + name, HERE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


FIRST, TERMINAL = map(load, ('test_mock500_first_failure', 'test_mock500_materials_terminal'))
D = TERMINAL.D


def first(**changes):
    return {'schema': 'helmut-w15-mock500-prepare-failure/1', 'stage': 'stored-command',
            'category': 'PREPARE_STORED_CHECK_123', 'kind': 'assertion', **changes}


def terminal(detail=None, phase='mock500-controller-prepare'):
    error = RuntimeError(CANARY)
    error.phase, error.prepare_failure = phase, first() if detail is None else detail
    return TERMINAL.R.S._worker_failure(error, 'WORKER_RESULT_REJECTED', error_type=TERMINAL.R.MockRunnerError)


def public_fixtures():
    rows = [TERMINAL.public_roundtrip(terminal())]
    for detail in (first(category='PREPARE_RUNTIME_CHECK_65535'), first(category='PREPARE_UNMAPPED', kind='unknown'),
                   dict(first(), raw=CANARY), first(category=CANARY), first(stage=CANARY)):
        rows.append(TERMINAL.public_roundtrip(terminal(detail)))
    return rows


class PrepareFailureChecks(unittest.TestCase):
    def test_actual_workflow_does_not_drop_inner_prepare_category(self):
        prior = FIRST.FirstFailureChecks('runTest'); self.addCleanup(prior.doCleanups)
        error, controller = prior.failure('prepare', close=True)
        error.prepare_failure = first()
        public = prior.forwarded(error, controller.Mock500ControllerFailure)
        self.assertEqual(public['worker']['phase'], 'mock500-controller-prepare')
        self.assertEqual(public.get('runner', {}).get('prepareFailure'), first())

    def test_actual_supervisor_keeps_first_frame_and_does_not_parse_other_stages(self):
        fixture = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(fixture.doCleanups)
        c = fixture.load_controller()
        s = c.Supervisor.__new__(c.Supervisor)
        s.prepare_failure = None; s.failure = None; s.failure_lock = threading.Lock()
        raw = json.dumps({'kind': 'W15_MOCK500_PREPARE_FAILURE', 'failure': first()}).encode()+b'\n'
        self.assertLessEqual(len(raw), 512)
        s.observe_line(raw, 'setup'); self.assertIsNone(s.prepare_failure)
        for bad in (b'x\n', raw[:-1]+b'X\n', b'x'*513,
                    json.dumps({'kind': 'W15_MOCK500_PREPARE_FAILURE', 'failure': dict(first(), raw=CANARY)}).encode()):
            s.observe_line(bad, 'prepare'); self.assertIsNone(s.prepare_failure)
        s.observe_line(raw, 'prepare')
        s.observe_line(json.dumps({'kind':'W15_MOCK500_PREPARE_FAILURE','failure':first(kind='aborted')}).encode(), 'prepare')
        self.assertEqual(s.prepare_failure, first())

    def test_actual_stage_pipe_drain_preserves_exit_frame_but_rejects_partial_and_oversize(self):
        fixture = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(fixture.doCleanups)
        c = fixture.load_controller()
        raw = json.dumps({'kind':'W15_MOCK500_PREPARE_FAILURE','failure':first()}).encode()+b'\n'
        for payload, accepted in [(raw,True),(raw.rstrip(b'\n'),False),
                                  (b' '*513+raw,False),(b'x'*65536+raw,False)]:
            with self.subTest(bytes=len(payload)), tempfile.TemporaryDirectory(prefix='fictional-prepare-pipe-')as tmp:
                s = c.Supervisor.__new__(c.Supervisor); s.prepare_failure = None
                s.failure = None; s.failure_lock = threading.Lock(); s.closure_mode = False
                s.thread = SimpleNamespace(is_alive=lambda:True);s.process = None
                s.inner_stop_thread = None; s.stop_failure = None; s.backup_runner = None
                s.publish = lambda *args:None
                child=SimpleNamespace(stdout=io.BytesIO(payload),wait=lambda **kwargs:1,poll=lambda:1)
                with patch.object(c,'WORK',Path(tmp)),patch.object(c.subprocess,'Popen',return_value=child):
                    with self.assertRaisesRegex(RuntimeError,'full500-stage-failed:prepare:1'):
                        s.stage(['FICTIONAL_NO_COMMAND'],'prepare',1)
                self.assertEqual(s.prepare_failure, first()if accepted else None)

    def test_signal_or_wait_io_before_late_frame_remains_primary(self):
        fixture=FIRST.F.ControllerAdmissionChecks('runTest');self.addCleanup(fixture.doCleanups)
        c=fixture.load_controller()
        raw=json.dumps({'kind':'W15_MOCK500_PREPARE_FAILURE','failure':first()}).encode()+b'\n'
        class DeferredDrain:
            def __init__(self,target,**kwargs):self.target=target
            def start(self):pass
            def join(self,**kwargs):self.target()
            def is_alive(self):return False
        for error in (KeyboardInterrupt(CANARY),OSError(CANARY)):
            with self.subTest(kind=type(error).__name__),tempfile.TemporaryDirectory(prefix='fictional-prepare-wait-')as tmp:
                s=c.Supervisor.__new__(c.Supervisor);s.prepare_failure=None;s.failure=None
                s.failure_lock=threading.Lock();s.closure_mode=False;s.thread=SimpleNamespace(is_alive=lambda:True)
                s.process=None;s.inner_stop_thread=None;s.stop_failure=None;s.backup_runner=None;s.publish=lambda *a:None
                def wait(**kwargs):raise error
                child=SimpleNamespace(stdout=io.BytesIO(raw),wait=wait,poll=lambda:1)
                with patch.object(c,'WORK',Path(tmp)),patch.object(c.subprocess,'Popen',return_value=child),\
                     patch.object(c.threading,'Thread',DeferredDrain):
                    with self.assertRaises(type(error)):s.stage(['FICTIONAL_NO_COMMAND'],'prepare',1)
                self.assertIsNone(s.prepare_failure)

    def test_exit_before_pipe_drain_allowed_but_prior_guard_or_signal_remains_primary(self):
        fixture = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(fixture.doCleanups)
        c = fixture.load_controller()
        raw = json.dumps({'kind':'W15_MOCK500_PREPARE_FAILURE','failure':first()}).encode()
        for reason, accepted in [('full500-stage-failed:prepare:1', True),
                                 ('full500-memory-reserve-or-oom', False),
                                 ('full500-stage-failed:prepare:-15', False),
                                 ('full500-stage-timeout:prepare', False),
                                 ('full500-output-reader-not-drained', False)]:
            with self.subTest(reason=reason):
                s = c.Supervisor.__new__(c.Supervisor); s.prepare_failure = None
                s.failure_lock = threading.Lock(); s.failure = {'type':'RuntimeError','reason':reason}
                s.observe_line(raw, 'prepare')
                self.assertEqual(s.prepare_failure, first() if accepted else None)

    def test_controller_retains_frame_across_signal_and_later_cleanup_failure(self):
        case = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(case.doCleanups)
        def inject(fixture, controller):
            prior = controller.inner
            def inner(supervisor, action, *args, **kwargs):
                if action == 'prepare':
                    supervisor.prepare_failure = first()
                    raise KeyboardInterrupt(CANARY)
                return prior(supervisor, action, *args, **kwargs)
            for target, change in [('inner', inner), ('stop_owned', lambda *a, **k: (_ for _ in ()).throw(OSError(CANARY)))]:
                p = patch.object(controller, target, side_effect=change); p.start(); fixture.addCleanup(p.stop)
        with self.assertRaises(Exception) as caught:
            case._run_fictional_bound_pipeline(inject=inject, expect_failure=True)
        self.assertEqual(caught.exception.phase, 'mock500-controller-prepare')
        self.assertEqual(caught.exception.prepare_failure, first())
        self.assertNotIn(CANARY, str(caught.exception))

    def test_closed_real_pipe_and_invalid_details_never_remove_known_phase(self):
        for row in public_fixtures():
            self.assertEqual(row['worker']['phase'], 'mock500-controller-prepare')
            self.assertFalse(row['executionAuthority']); self.assertFalse(row['retryAllowed'])
            self.assertNotIn(CANARY, json.dumps(row))
        packet = TERMINAL.R.S._failure_packet(terminal())
        self.assertLess(len(TERMINAL.R.S._encode(packet, TERMINAL.R.S.MAX_RESULT)), 65536)
        self.assertEqual(TERMINAL.R.S.MAX_RESULT, 65536)

    def test_finite_vocabulary_and_wrong_phase_reject_untrusted_or_private_values(self):
        for n in (1, 65535):
            self.assertEqual(D.prepare_failure(first(category='PREPARE_STORAGE_CHECK_'+str(n)))['category'], 'PREPARE_STORAGE_CHECK_'+str(n))
        bad = [None, [], CANARY, {}, dict(first(), message=CANARY), first(kind=[]), first(stage={}),
               first(schema=CANARY), first(category=[]), first(category='PREPARE_STORED_CHECK_123\n')]
        bad += [first(category='PREPARE_STORED_CHECK_'+str(n))for n in (0,65536,99999)]
        for detail in bad:
            self.assertIsNone(D.prepare_failure(detail))
        for phase in ('mock500-controller-run', 'mock500-controller-materials', 'setup'):
            row = TERMINAL.public_roundtrip(terminal(first(), phase))
            self.assertNotIn('prepareFailure', row.get('runner', {}))

    def test_controller_detail_requires_exact_staged_error_type_and_phase(self):
        fixture = FIRST.F.ControllerAdmissionChecks('runTest'); self.addCleanup(fixture.doCleanups)
        controller = fixture.load_controller()
        prior = FIRST.FirstFailureChecks('runTest'); self.addCleanup(prior.doCleanups)
        class Lookalike(RuntimeError):
            phase = 'mock500-controller-prepare'
            prepare_failure = first()
        class Subclass(controller.Mock500ControllerFailure): pass
        for error in (Lookalike(CANARY), Subclass('mock500-controller-prepare', prepare_failure=first())):
            public = prior.forwarded(error, controller.Mock500ControllerFailure)
            self.assertNotIn('prepareFailure', public.get('runner', {}))
        self.assertIsNone(controller.Mock500ControllerFailure('mock500-controller-run', prepare_failure=first()).prepare_failure)


if __name__ == '__main__':
    if sys.argv[1:] == ['--public-fixtures']: print(json.dumps(public_fixtures()))
    else: unittest.main()
