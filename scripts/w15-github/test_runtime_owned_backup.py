"""Host executor mocks plus one genuine local Node TERM/child-close probe.

Only invented files/processes; no Docker, database, original or network call.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

HERE = Path(__file__).parent
def load(name):
    spec = importlib.util.spec_from_file_location('w15_owned_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
R, B = load('runtime_owned_backup'), load('runtime_backup')
STOP = HERE.parent / 'fixtures/w15-owned-process-stop.js'


class HostRunnerChecks(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.controller = SimpleNamespace(BASE=B.B.BASE, DB=B.B.DATABASE,
            CONTAINER='w15-end500-123456-' + 'a' * 32, DOCKER=list(B.DOCKER),
            docker=lambda *a, **kw:self.calls.append(('inner-stop', a)), save=lambda *a:None)
        self.w = SimpleNamespace(thread=SimpleNamespace(is_alive=lambda:True), finished=threading.Event(),
            failure=None, stop_failure=None, process=None, closure_mode=True, failure_lock=threading.Lock(),
            stop_dispatched=False, inner_stop_thread=None, stage_name=None, publish=lambda *a,**kw:None)
        self.runner = R.OwnedBackupRunner(self.w, self.controller, base=B.B.BASE,
            container=self.controller.CONTAINER, database=B.B.DATABASE)
        self.w.backup_runner = self.runner
        self.argv = list(B.DOCKER) + ['exec', '--user', '1000:1000', self.controller.CONTAINER, 'sh', '-c', 'FICTIONAL-ONLY']

    def test_success_uses_existing_stage_with_abort_checks_enabled(self):
        def stage(argv, action, seconds):
            self.assertFalse(self.w.closure_mode); self.w.last_stage_exit_code=0
        self.w.stage=stage
        result=self.runner.run_owned(self.argv, 'backup-dump', 30)
        self.assertEqual(result.returncode,0); self.assertTrue(self.w.closure_mode)
        with self.assertRaises(R.OwnedBackupError): self.runner.run_owned(self.argv,'backup-dump',30)

    def test_prior_failure_never_starts_an_export(self):
        self.w.failure={'reason':'ORIGINAL-FIRST-FAILURE'}
        with patch.object(self.w,'stage',create=True) as stage:
            with self.assertRaises(R.OwnedBackupError):self.runner.run_owned(self.argv,'backup-dump',30)
            stage.assert_not_called()

    def test_lost_client_gets_exactly_one_inner_stop_and_preserves_failure(self):
        def stage(*a): raise OSError('FICTIONAL-LOST-CLIENT')
        self.w.stage=stage
        with self.assertRaises(R.OwnedBackupError):self.runner.run_owned(self.argv,'backup-dump',30)
        self.assertEqual(len(self.calls),1);self.assertEqual(self.w.failure['type'],'OSError')
        self.runner.stop_once('backup-dump');self.assertEqual(len(self.calls),1)

    def test_inner_stop_precedes_outer_fallback_on_monitor_failure(self):
        self.runner.started.add('backup-dump');self.w.stage_name='backup-dump'
        class Process:
            pid=987654
            def poll(self):return None
            def wait(self,timeout):raise subprocess.TimeoutExpired('FICTIONAL',timeout)
        self.w.process=Process()
        with patch.object(R.os,'killpg',side_effect=lambda *a:self.calls.append(('outer-term',a))):
            self.runner.first_failure(RuntimeError('FICTIONAL'))
            self.w.inner_stop_thread.join(timeout=2)
        self.assertFalse(self.w.inner_stop_thread.is_alive())
        self.assertEqual([r[0]for r in self.calls],['inner-stop','outer-term'])


@unittest.skipUnless(shutil.which('node'),'Node unavailable')
class ActualNodeStopChecks(unittest.TestCase):
    def test_new_actions_require_explicit_backup_scope(self):
        raw=subprocess.run(['node',str(STOP),'/tmp/w15-fictional-scope','backup-dump',B.B.DATABASE,'active'],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
        self.assertNotEqual(raw.returncode,0)

    def test_registered_real_worker_receives_term_and_waits_for_native_child(self):
        root=Path('/tmp')/('w15-backup-owned-'+uuid.uuid4().hex)
        root.mkdir(mode=0o700);(root/'state').mkdir(mode=0o700);(root/'state/final-backup').mkdir(mode=0o700)
        process=None
        try:
            # Replace only the native executable/arguments with an invented
            # Node child. Run the actual export lifecycle/TERM handler body.
            child='process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},100);'
            old='child=cp.spawn("/usr/lib/postgresql/17/bin/"+exe,args,'
            replacement='child=cp.spawn(process.execPath,["-e",'+json.dumps(child)+'],'
            self.assertIn(old,B.NODE_WORKER)
            worker=B.NODE_WORKER.replace(old,replacement,1)
            process=subprocess.Popen(['node','-e',worker,str(root),'backup-dump',B.B.DATABASE,B.SNAPSHOT_SQL],
                stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            (root/'state/backup-dump.pid').write_text(str(process.pid));(root/'state/backup-dump.pid').chmod(0o600)
            journal=root/'state/final-backup/backup-dump.lifecycle.PRIVATE.jsonl'
            deadline=time.monotonic()+4
            while time.monotonic()<deadline:
                if journal.exists() and b'owned-child-spawned' in journal.read_bytes():break
                time.sleep(.01)
            self.assertTrue(journal.exists());self.assertIn(b'owned-child-spawned',journal.read_bytes())
            stopped=subprocess.run(['node',str(STOP),str(root),'backup-dump',B.B.DATABASE,'active','end500-backup'],
                stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
            self.assertEqual(stopped.returncode,0,stopped.stderr.decode())
            self.assertNotEqual(process.wait(timeout=3),0)
            rows=[json.loads(x)for x in journal.read_bytes().splitlines()]
            events=[x['event']for x in rows]
            self.assertIn('signal-received',events);self.assertIn('owned-child-exit',events)
            self.assertLess(events.index('signal-received'),events.index('owned-child-exit'))
            self.assertFalse((root/'state/final-backup/backup-dump.SAFE.json').exists())
            self.assertTrue((root/'state/final-backup/final.PRIVATE.dump').exists())
        finally:
            if process is not None and process.poll() is None:
                os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=3)
            shutil.rmtree(root)


if __name__ == '__main__':unittest.main()
