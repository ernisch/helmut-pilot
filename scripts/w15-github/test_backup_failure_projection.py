"""Only new cached-memory and backup-failure boundaries; all values fictional."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_failure_projection_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


C, A, W, M, F = (load(n) for n in ('common_resources', 'runner_start', 'restore_workflow', 'mock500_runner', 'test_runner_start'))
CANARY = '/FICTIONAL_SECRET_OR_PRIVATE_PATH_MUST_NOT_PRINT'


def memory():
    return {'configuredLimitBytes': 2560000000, 'kernelLifetimePeakBytes': 2100000000,
        'currentBytes': 123456, 'swapMaximumBytes': 0, 'swapCurrentBytes': 0,
        'lastReadbackValid': False, 'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}


class FailureProjectionChecks(unittest.TestCase):
    def test_full_controller_exit_cannot_mask_its_first_backup_checkpoint(self):
        fixture_module = load('test_restore_workflow')
        fixture = fixture_module.WorkerChecks('runTest'); fixture.setUp(); self.addCleanup(fixture.doCleanups)
        manifest, private = fixture.setup_worker('end500-full-gated')
        backup = load('restore_backup')
        def fail(**kwargs):
            raise backup.BackupRuntimeError(CANARY, phase='backup-authenticate')
        fixture.backup.completion_hook.return_value = fail
        def legacy_main(**kwargs):
            try:
                kwargs['backup_completion'](FICTIONAL=True)
            except BaseException:
                raise SystemExit(1)
        fixture.forward.main.side_effect = legacy_main
        with self.assertRaises(fixture_module.W.WorkflowRejected) as caught:
            fixture_module.W.run_worker(manifest, private)
        self.assertEqual(caught.exception.phase, 'backup-authenticate')
        self.assertNotIn(CANARY, str(caught.exception)); fixture.forward.main.assert_called_once()

    def test_cached_partial_failure_is_numeric_only_and_never_reads_kernel(self):
        observer = C.CommonResources(C.TOKEN, {}, Path('/FICTIONAL/cgroup'), (1, 2))
        observer._last_observed = {'configuredLimit': '2560000000', 'kernelLifetimePeakBytes': 2100000000,
            'currentBytes': 123456, 'swapMaximum': '0', 'swapCurrentBytes': 0,
            'events': memory()['events'], 'privatePath': CANARY}
        with patch.object(observer, 'sample', side_effect=AssertionError('NO_NEW_MEASUREMENT')), \
                patch.object(C, '_kernel_directory', side_effect=AssertionError('NO_KERNEL_READ')):
            result = observer.failure_observation()
        self.assertEqual(result, memory()); self.assertFalse(result['lastReadbackValid'])
        self.assertNotIn(CANARY, json.dumps(result))
        self.assertNotIn('fullLifetimeClosureAccepted', result)

    def test_two_ipc_boundaries_keep_only_closed_phase_and_memory(self):
        packet = {'ok': False, 'phase': 'worker', 'workerPhase': 'connection-backup-seal', 'workerMemory': memory()}
        failure = A._response_error(packet)
        self.assertEqual(W._safe_failure(failure), {'phase': 'worker', 'worker': {
            'phase': 'connection-backup-seal', 'memory': memory()}})
        nested = M._failure({**packet, 'workerPhase': 'backup'})
        self.assertEqual(nested.safe_failure['worker']['memory'], memory())
        for edit in ('extra', 'bool', 'float', 'huge', 'text'):
            bad = copy.deepcopy(packet)
            if edit == 'extra': bad['workerMemory']['privatePath'] = CANARY
            elif edit == 'bool': bad['workerMemory']['currentBytes'] = True
            elif edit == 'float': bad['workerMemory']['currentBytes'] = 1.5
            elif edit == 'huge': bad['workerMemory']['currentBytes'] = 2**53
            else: bad['workerMemory']['events']['oom'] = CANARY
            with self.subTest(edit=edit), self.assertRaises(A.RunnerStartError): A._response_error(bad)

    def test_actual_fixed_worker_carries_cached_diagnostics_without_exception_text(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-failure-memory-') as temp:
            root = Path(temp); script = root / 'scripts/w15-github/restore_workflow.py'; script.parent.mkdir(parents=True)
            raw = ('class Failure(Exception):\n phase="connection-backup-export"\n worker_memory=' + repr(memory()) +
                '\ndef run_worker(manifest, private_payload):\n raise Failure(' + repr(CANARY) + ')\n').encode()
            script.write_bytes(raw)
            manifest = {**F.REQUEST, 'stagedRepo': str(root), 'runnerTemp': str(root / 'worker'),
                'sourcePins': {'scripts/w15-github/restore_workflow.py': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}}}
            sender, receiver = Mock(), Mock()
            with patch.object(A, '_close_stdio'), patch.dict(os.environ, {}, clear=True), \
                    patch.object(A.os, 'setgroups'), patch.object(A.os, 'setgid'), patch.object(A.os, 'setuid'), \
                    patch.object(A.os, 'getuid', return_value=1000), patch.object(A.os, 'getgid', return_value=1000), \
                    patch.object(A.os, 'getgroups', return_value=[987]), self.assertRaises(SystemExit):
                A._fork_worker(manifest, {}, sender, receiver, 987)
            packet = json.loads(sender.send_bytes.call_args.args[0])
            self.assertEqual(packet, {'ok': False, 'phase': 'worker',
                'workerPhase': 'connection-backup-export', 'workerMemory': memory()})
            self.assertNotIn(CANARY, json.dumps(packet))

    def test_javascript_projection_drops_paths_and_malformed_memory_in_both_actions(self):
        node = shutil.which('node'); self.assertIsNotNone(node)
        harness = r'''
const fs=require('node:fs'),vm=require('node:vm');
const data=JSON.parse(fs.readFileSync(0,'utf8')),source=fs.readFileSync(process.argv[1],'utf8'),rows=[];
for(const malformed of [false,true]){
 const output=[],memory=JSON.parse(JSON.stringify(data.memory));if(malformed)memory.privatePath=data.canary;
 const context={Buffer,console:{log:line=>output.push(JSON.parse(line))},
  process:{env:{W15_MODE:data.mode,W15_REQUEST:'{}',GITHUB_EVENT_PATH:'/FICTIONAL/event'},exitCode:0},
  require:name=>{
   if(name==='node:fs')return {readFileSync:()=>' {"inputs":{"w15_request":"{}"}}'};
   if(name==='node:child_process')return {spawnSync:()=>({status:1,stdout:JSON.stringify({
    status:data.status,phase:'worker',worker:{phase:data.phase,memory},executionAuthority:false,retryAllowed:false,message:data.canary})})};
   throw Error('FICTIONAL_IMPORT');}};
 vm.runInNewContext(source,context,{timeout:1000});rows.push(output);
}process.stdout.write(JSON.stringify(rows));
'''
        for action, mode, status, phase in [('w15-isolated', 'end500-restore-gated', 'FAIL_W15_ISOLATED_WORKFLOW', 'connection-backup-collect'),
                ('w15-mock500', 'mock500-full-gated', 'FAIL_OR_BLOCKED_MOCK500_WORKFLOW', 'backup')]:
            data = {'memory': memory(), 'canary': CANARY, 'mode': mode, 'status': status, 'phase': phase}
            result = subprocess.run([node, '-e', harness, str(HERE.parents[1] / '.github/actions' / action / 'index.js')],
                input=json.dumps(data), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            self.assertEqual(result.returncode, 0); self.assertNotIn(CANARY, result.stdout)
            rows = json.loads(result.stdout)
            self.assertEqual(rows[0][0]['worker']['memory'], memory())
            self.assertNotIn('memory', rows[1][0]['worker'])


if __name__ == '__main__': unittest.main()
