"""Inject tiny fictional failures through the actual controller/IPC boundaries.

Uses the existing inert pipeline fixture; no container, DB, original, or 500 run.
"""
import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
def load(name):
    spec = importlib.util.spec_from_file_location('first_mock_failure_' + name, HERE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

F = load('test_mock500_inputs')
WF = load('test_mock500_workflow')
R = load('mock500_runner')
CANARY = 'FICTIONAL_PRIVATE_PATH_SQL_TOKEN_MUST_NOT_ESCAPE'

class FirstFailureChecks(unittest.TestCase):
    def failure(self, stage, *, stop=False, close=False, signal=False, poll=False, final=False):
        case = F.ControllerAdmissionChecks('runTest')
        self.addCleanup(case.doCleanups)
        observed = {}
        def inject(fixture, controller):
            observed['controller'] = controller
            observed['globals'] = tuple(getattr(controller,k) for k in ('WORK','BASE','DB','CONTAINER','IMAGE','_BOUND_CONTEXT_SHA'))
            original = controller.inner
            def inner(supervisor, action, *args, **kwargs):
                if action == stage:
                    raise KeyboardInterrupt(CANARY) if signal else ValueError(CANARY)
                return original(supervisor, action, *args, **kwargs)
            p = patch.object(controller, 'inner', side_effect=inner); p.start(); fixture.addCleanup(p.stop)
            if poll:
                prior_poll=controller.subprocess.Popen.poll
                def polling(process):
                    if process.stopped: raise OSError(CANARY)
                    return prior_poll(process)
                p=patch.object(controller.subprocess.Popen,'poll',polling);p.start();fixture.addCleanup(p.stop)
            if final:
                prior_write=controller._private_write
                def write(path, value):
                    if path.name=='FINAL_MOCK500_CLOSURE.SAFE.json': raise OSError(CANARY)
                    return prior_write(path,value)
                p=patch.object(controller,'_private_write',side_effect=write);p.start();fixture.addCleanup(p.stop)
            if stop:
                p = patch.object(controller.Supervisor, 'stop', side_effect=OSError(CANARY))
                p.start(); fixture.addCleanup(p.stop)
            if close:
                opened = Path.open
                class BadClose:
                    def __init__(self, stream): self.stream=stream
                    @property
                    def name(self): return self.stream.name
                    def close(self): self.stream.close(); raise OSError(CANARY)
                def opening(path, *args, **kwargs):
                    stream=opened(path,*args,**kwargs)
                    return BadClose(stream) if path.name=='gateway-client.PRIVATE.log' else stream
                p=patch.object(Path,'open',opening); p.start(); fixture.addCleanup(p.stop)
        try:
            case._run_fictional_bound_pipeline(inject=inject, expect_failure=True)
        except BaseException as error:
            controller=observed['controller']
            self.assertEqual(tuple(getattr(controller,k) for k in ('WORK','BASE','DB','CONTAINER','IMAGE','_BOUND_CONTEXT_SHA')), observed['globals'])
            self.assertNotIn(CANARY, str(error))
            return error,controller
        finally:
            case.doCleanups()
        self.fail('fictional failure did not stop the pipeline')

    def test_setup_failure_has_fixed_first_phase_and_no_private_error_text(self):
        error,controller=self.failure('setup')
        self.assertEqual(getattr(error,'phase',None),'mock500-controller-setup')
        self.assertIs(type(error),controller.Mock500ControllerFailure)

    def test_cleanup_stop_cannot_displace_first_setup_failure_or_global_restore(self):
        error,_=self.failure('setup',stop=True)
        self.assertEqual(getattr(error,'phase',None),'mock500-controller-setup')

    def test_log_close_and_signal_cannot_displace_first_prepare_failure(self):
        error,_=self.failure('prepare',close=True,signal=True)
        self.assertEqual(getattr(error,'phase',None),'mock500-controller-prepare')

    def test_cleanup_only_failures_have_their_own_fixed_phase(self):
        for options,expected in (({'close':True},'gateway-log-close'),
                                 ({'poll':True},'gateway-client-close'),
                                 ({'final':True},'final-observation')):
            with self.subTest(phase=expected):
                error,_=self.failure(None,**options)
                self.assertEqual(error.phase,'mock500-controller-'+expected)

    def test_final_observation_cannot_replace_first_run_failure(self):
        error,_=self.failure('run',final=True)
        self.assertEqual(error.phase,'mock500-controller-run')

    def forwarded(self, error, controller_type):
        case=WF.WorkflowChecks('runTest');self.addCleanup(case.doCleanups)
        def inject(fixture, controller):
            controller.Mock500ControllerFailure=controller_type
            controller.run_bound.side_effect=error
            p=patch.dict(sys.modules, {'w15_github_mock500_controller':controller});p.start();fixture.addCleanup(p.stop)
        with self.assertRaises(WF.W.WorkflowRejected) as caught:
            case._fictional_full_worker(inject)
        terminal=R.S._worker_failure(caught.exception,'WORKER_RESULT_REJECTED',error_type=R.MockRunnerError)
        packet=R.S._failure_packet(terminal)
        public=WF.W._safe_failure(R._failure(packet))
        self.assertNotIn(CANARY,str(public))
        return public

    def test_actual_first_phase_survives_workflow_terminal_packet_and_public_projection(self):
        error,controller=self.failure('setup')
        public=self.forwarded(error,controller.Mock500ControllerFailure)
        self.assertEqual(public['worker']['phase'],'mock500-controller-setup')

    def test_duck_subclass_and_private_or_unhashable_phase_do_not_cross(self):
        controller=F.ControllerAdmissionChecks('runTest').load_controller()
        class Subclass(controller.Mock500ControllerFailure): pass
        class Lookalike(RuntimeError): phase='mock500-controller-setup'
        class WorkflowSubclass(WF.W.WorkflowRejected): pass
        errors=[Lookalike(CANARY),Subclass('mock500-controller-setup'),
                WF.W.WorkflowRejected('mock500-controller-setup'),
                WorkflowSubclass('mock500-controller-setup')]
        for value in ('mock500-controller-setup',[],{},CANARY):
            error=RuntimeError(CANARY);error.phase=value;errors.append(error)
        for value in ([],{},CANARY):
            error=WF.W.WorkflowRejected('mock500');error.phase=value;errors.append(error)
        class BadGetter(RuntimeError):
            @property
            def phase(self): raise RuntimeError(CANARY)
        errors.append(BadGetter(CANARY))
        for error in errors:
            with self.subTest(type=type(error).__name__):
                public=self.forwarded(error,controller.Mock500ControllerFailure)
                self.assertEqual(public['worker']['phase'],'mock500')

if __name__=='__main__': unittest.main()
