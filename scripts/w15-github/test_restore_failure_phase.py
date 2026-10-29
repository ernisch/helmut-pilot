"""New closed failure checkpoint edge only; all worker/IPC inputs are fictional."""
import sys
sys.dont_write_bytecode = True

from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


W = load('w15_fictional_failure_workflow', 'restore_workflow.py')
A = load('w15_fictional_failure_runner', 'runner_start.py')
R = load('w15_fictional_failure_connection', 'restore_connection.py')
CANARY = '/FICTIONAL_PRIVATE_PATH_OR_SECRET_NEVER_PUBLIC'


class RestoreFailurePhaseChecks(unittest.TestCase):
    def worker_failure(self, error, receiver_phase='not-an-observed-checkpoint'):
        """Stop at the one mocked same-job seam, never call its real receiver."""
        pin = {'bytes': 1, 'sha256': 'a' * 64}
        manifest = {'mode': 'end500-restore-gated', 'stagedRepo': '/FICTIONAL/repo',
            'runnerTemp': '/FICTIONAL/temp', 'checkoutBytes': 1, 'binaryBytes': 2,
            'maximumWallSeconds': 1800, 'exactCommit': 'b' * 40, 'branch': W.BRANCH,
            'runId': '12345678901', 'runAttempt': 1,
            'nonce': '123e4567-e89b-42d3-a456-426614174000',
            'binaries': {name: {'path': '/FICTIONAL/' + name, **pin}
                         for name in ('node', 'postgrest')}}
        runtime = SimpleNamespace(C=SimpleNamespace(validate_context=Mock(),
                    RUNTIME={name: dict(pin) for name in ('node', 'postgrest')}))
        forward = SimpleNamespace(ROOT=Path('/FICTIONAL/repo'),
                    _runtime_module=lambda _: runtime, open_common_resources=Mock(return_value=Mock()))
        resource_code = SimpleNamespace(admit_disk_plan=Mock(return_value={}),
                                        DiskGuard=Mock(return_value=Mock()))
        def module(name, repo):
            return {'restore_resources': resource_code, 'restore_connection': R}[name]
        with ExitStack() as stack:
            stack.enter_context(patch.object(W, 'validate_admission', return_value=(b'FICTIONAL', 'c' * 64, {})))
            stack.enter_context(patch.object(W, '_manifest'))
            stack.enter_context(patch.object(W, '_event_inputs'))
            stack.enter_context(patch.object(W, '_forward', return_value=forward))
            stack.enter_context(patch.object(W, '_context', return_value={}))
            stack.enter_context(patch.object(W, '_load', side_effect=module))
            prepare = stack.enter_context(patch.object(R, 'prepare_same_job', side_effect=error))
            stack.enter_context(patch.object(R.E, 'PHASE', receiver_phase))
            with self.assertRaises(W.WorkflowRejected) as failed:
                W.run_worker(manifest, {'eventInputs': {}})
            prepare.assert_called_once()
        self.assertNotIn(CANARY, str(failed.exception))
        return failed.exception

    def test_real_worker_retains_each_connection_checkpoint(self):
        for phase in W.CONNECTION_PHASES:
            with self.subTest(phase=phase):
                self.assertEqual(self.worker_failure(R.RestoreConnectionError(phase)).phase,
                                 'connection-' + phase)

    def test_real_worker_retains_each_observed_receiver_checkpoint(self):
        self.assertEqual(W.CONNECTION_PHASES, R.PHASES)
        self.assertEqual(W.RECEIVER_PHASES, R.E.PHASES)
        for phase in W.RECEIVER_PHASES:
            with self.subTest(phase=phase):
                self.assertEqual(self.worker_failure(R.RestoreConnectionError('receive'), phase).phase,
                                 'receiver-' + phase)

    def test_foreign_error_and_unknown_values_keep_closed_fallback(self):
        error = RuntimeError(CANARY)
        error.phase = 'receive'
        self.assertEqual(self.worker_failure(error, 'key-import').phase, 'receive-prepare')
        altered = R.RestoreConnectionError('binding')
        altered.phase = CANARY
        self.assertEqual(self.worker_failure(altered, CANARY).phase, 'receive-prepare')
        self.assertEqual(self.worker_failure(R.RestoreConnectionError('receive'), CANARY).phase,
                         'connection-receive')

    def test_all_workflow_checkpoints_survive_closed_runner_and_outer_projection(self):
        self.assertEqual(W.PHASES, A.WORKER_PHASES)
        for phase in W.PHASES:
            with self.subTest(phase=phase):
                value = A._response_error({'ok': False, 'phase': 'worker', 'workerPhase': phase})
                self.assertEqual(W._safe_failure(value), {'phase': 'worker', 'worker': {'phase': phase}})

    def test_runner_rejects_free_form_checkpoint_or_extra_error_details(self):
        for value in ({'ok': False, 'phase': 'worker', 'workerPhase': CANARY},
                      {'ok': False, 'phase': 'worker', 'workerPhase': 'receiver-key-import', 'message': CANARY}):
            with self.subTest(value=value):
                with self.assertRaises(A.RunnerStartError):
                    A._response_error(value)

    def test_javascript_projection_retains_only_closed_checkpoints(self):
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node is required for this new JavaScript boundary check')
        action = HERE.parents[1] / '.github/actions/w15-isolated/index.js'
        harness = r'''
const fs=require('node:fs'),vm=require('node:vm');
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const source=fs.readFileSync(process.argv[1],'utf8');
const rows=request.phases.map(phase=>{
  const output=[];
  const context={Buffer,console:{log:line=>output.push(JSON.parse(line))},
    process:{env:{W15_MODE:'end500-restore-gated',W15_REQUEST:'{}',GITHUB_EVENT_PATH:'/FICTIONAL/event'},exitCode:0},
    require:name=>{
      if(name==='node:fs')return {readFileSync:()=>'{"inputs":{}}'};
      if(name==='node:child_process')return {spawnSync:()=>({status:1,stdout:JSON.stringify({
        status:'FAIL_W15_ISOLATED_WORKFLOW',phase:'worker',worker:{phase},
        executionAuthority:false,retryAllowed:false,message:request.canary})})};
      throw Error('UNEXPECTED_FICTIONAL_IMPORT');
    }};
  vm.runInNewContext(source,context,{timeout:1000});
  return {output,exitCode:context.process.exitCode};
});
process.stdout.write(JSON.stringify(rows));
'''
        phases = sorted(W.PHASES) + [CANARY]
        result = subprocess.run([node, '-e', harness, str(action)],
            input=json.dumps({'phases': phases, 'canary': CANARY}), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, check=False)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn(CANARY, result.stdout)
        rows = json.loads(result.stdout)
        for phase, row in zip(phases, rows, strict=True):
            expected = {'status': 'FAIL_W15_ISOLATED_WORKFLOW', 'phase': 'worker',
                        'executionAuthority': False, 'retryAllowed': False}
            if phase in W.PHASES:
                expected['worker'] = {'phase': phase}
            self.assertEqual(row, {'output': [expected], 'exitCode': 1})


if __name__ == '__main__':
    unittest.main()
