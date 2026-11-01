"""Targeted fictional restore wiring and owned TERM checks; no DB or Docker."""
import sys
sys.dont_write_bytecode = True

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
from unittest.mock import Mock, patch
import uuid

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_runtime_restore_test', HERE / 'runtime_restore.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
STOP = HERE.parent / 'fixtures/w15-owned-process-stop.js'


def sample():
    return {'configuredLimit': '2560000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
            'kernelLifetimePeakBytes': 12345, 'currentBytes': 10000,
            'events': {name: 0 for name in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class RestoreChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-restore-')
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name)
        self.state = self.work / 'state'
        self.state.mkdir(mode=0o700)
        self.controller = SimpleNamespace(BASE=R.BASE, DB=R.DATABASE, WORK=self.work,
            CONTAINER='w15-end500-123456-' + 'a' * 32, DOCKER=list(R.DOCKER),
            sql=Mock(), docker=Mock(), read=Mock(return_value={'profiles': 500, 'active': 0}), save=Mock())
        self.w = SimpleNamespace(thread=SimpleNamespace(is_alive=lambda: True), finished=threading.Event(),
            disk_phase='processing', last=sample(), sample=Mock(), common_resources=object(),
            failure=None, stop_failure=None, process=None, closure_mode=True,
            failure_lock=threading.Lock(), stop_dispatched=False, inner_stop_thread=None,
            stage_name=None, publish=Mock())
        self.runner = R.O.OwnedBackupRunner(self.w, self.controller, base=R.BASE,
            container=self.controller.CONTAINER, database=R.DATABASE, scope='end500-restore')
        self.w.backup_runner = self.runner
        self.calls = []
        self.mutate = None
        self.w.stage = self.stage

    def write(self, parent, name, raw):
        with (parent / name).open('xb') as output:
            os.chmod(output.name, 0o600)
            output.write(raw)

    def pin(self, parent, name):
        fd = R.B.S._directory(str(parent), private=True)
        try:
            return R.B._pin(fd, name)
        finally:
            os.close(fd)

    def stage(self, argv, action, seconds):
        self.calls.append((argv, action, seconds))
        self.w.stage_name = action
        root = self.state / 'restore'
        stdout = json.dumps({'profiles': 500, 'active': 0}).encode() if action == 'restore-check' else b''
        self.write(root, R.OUTPUTS[action], stdout)
        self.write(root, action + '.PRIVATE.stderr', b'')
        identity = {'phase': action, 'pid': 10000 + len(self.calls), 'startTicks': '1234567'}
        self.write(self.state, action + '.node.SAFE.json', json.dumps(identity).encode())
        rows = [dict(sequence=0, action=action, event='owned-handler-ready', identity=identity),
                dict(sequence=1, action=action, event='owned-child-spawned', pid=identity['pid'] + 100),
                dict(sequence=2, action=action, event='owned-child-exit', code=0, signal=None),
                dict(sequence=3, action=action, event='owned-restore-closed', dataFilesOpen=0, termReceived=False)]
        self.write(root, action + '.lifecycle.PRIVATE.jsonl', b''.join(json.dumps(row).encode() + b'\n' for row in rows))
        receipt = {'status': 'PASS_OWNED_ISOLATED_RESTORE_STEP', 'action': action,
                   'returncode': 0, 'signal': None, 'identity': identity,
                   'output': self.pin(root, R.OUTPUTS[action]),
                   'stderr': self.pin(root, action + '.PRIVATE.stderr'),
                   'lifecycle': self.pin(root, action + '.lifecycle.PRIVATE.jsonl')}
        if action == 'restore-render':
            self.write(root, 'rendered.PRIVATE.sql', b'FICTIONAL GENERATED SQL ONLY')
            receipt['renderedSQL'] = self.pin(root, 'rendered.PRIVATE.sql')
        self.write(root, action + '.SAFE.json', json.dumps(receipt).encode())
        if self.mutate is not None:
            self.mutate(root, action)
        self.w.last_stage_exit_code = 0

    def restore(self):
        return R.restore_owned(self.controller, self.w, run_owned=self.runner.run_owned)

    def test_legacy_command_order_and_content_are_preserved(self):
        result = R.restore_legacy(self.controller)
        self.assertEqual(result, {'profiles': 500, 'active': 0})
        self.controller.sql.assert_called_once_with('create database ' + R.DATABASE + ';', database='postgres')
        self.assertEqual(self.controller.docker.call_count, 3)
        roles, render, apply = self.controller.docker.call_args_list
        self.assertEqual(roles.args, ('exec', self.controller.CONTAINER, 'psql', '-X', '-w', '-q', '-v',
            'ON_ERROR_STOP=1', '-U', 'postgres', '-d', R.DATABASE, '-f', R.BASE + '/roles.PRIVATE.sql'))
        self.assertEqual(render.args, ('exec', self.controller.CONTAINER, 'pg_restore', '--exit-on-error',
            '--file=' + R.BASE + '/restore.PRIVATE.sql', R.BASE + '/input.PRIVATE.dump'))
        self.assertEqual(apply.args, ('exec', self.controller.CONTAINER, 'psql', '-X', '-w', '-q', '-v',
            'ON_ERROR_STOP=1', '--single-transaction', '-U', 'postgres', '-d', R.DATABASE,
            '-f', R.BASE + '/restore.PRIVATE.sql', '-c', 'update public.mandate_profiles set aktiv=false where aktiv;'))
        self.controller.read.assert_called_once_with(R.CHECK_SQL, database=R.DATABASE)
        self.controller.save.assert_called_once_with('RESTORED500_ZERO.SAFE.json', result)

    def test_five_owned_stages_require_all_private_readbacks_and_keep_start_blocked(self):
        result = self.restore()
        self.assertEqual([row[1] for row in self.calls], list(R.ACTIONS))
        self.assertEqual(result['profiles'], 500)
        self.assertEqual(result['active'], 0)
        self.assertEqual(result['steps'], 5)
        for key in ('fullRestoreAccepted', 'acceptedAsCompleteBackup', 'end500Started', 'mock500Started', 'executionAuthority'):
            self.assertFalse(result[key])
        self.assertNotIn('pins', result)
        self.assertNotIn(str(self.work), json.dumps(result))
        self.controller.sql.assert_not_called()
        self.controller.docker.assert_not_called()
        self.controller.save.assert_called_once_with('RESTORED500_ZERO.SAFE.json', {'profiles': 500, 'active': 0})
        self.assertTrue((self.state / 'restore/RESTORE_CLOSURE.PRIVATE.json').exists())
        self.assertEqual((self.state / 'restore/rendered.PRIVATE.sql').stat().st_mode & 0o777, 0o600)
        with self.assertRaises(R.RestoreRuntimeError):
            self.restore()
        self.assertEqual(len(self.calls), 5)

    def test_restore_receipts_cannot_replace_existing_backup_closure(self):
        self.restore()
        fd = R.B.S._directory(str(self.work), private=True)
        try:
            with self.assertRaises(Exception):
                R.B._closure(fd)
        finally:
            os.close(fd)
        fd = R.B.S._directory(str(self.state / 'restore'), private=True)
        try:
            with self.assertRaises(Exception):
                R.B._lifecycle(fd, 'restore-create')
        finally:
            os.close(fd)

    def test_wrong_scope_or_no_common_monitor_stops_before_native_stage(self):
        for change in ('scope', 'monitor'):
            with self.subTest(change=change):
                if change == 'scope':
                    self.runner.scope = 'end500-backup'
                else:
                    self.runner.scope = 'end500-restore'
                    self.w.common_resources = None
                with self.assertRaises(R.RestoreRuntimeError):
                    self.restore()
                self.assertEqual(self.calls, [])

    def test_sql_copy_drift_stops_without_next_stage(self):
        def corrupt(root, action):
            if action == 'restore-render':
                (root / 'rendered.PRIVATE.sql').write_bytes(b'CHANGED-FICTIONAL-SQL')
        self.mutate = corrupt
        with self.assertRaises(R.RestoreRuntimeError):
            self.restore()
        self.assertEqual([row[1] for row in self.calls], list(R.ACTIONS[:3]))
        self.controller.save.assert_not_called()
        self.assertTrue((self.state / 'restore/rendered.PRIVATE.sql').exists())

    def test_missing_owned_child_exit_record_stops_before_next_stage(self):
        def corrupt(root, action):
            if action == 'restore-create':
                name = action + '.lifecycle.PRIVATE.jsonl'
                rows = [json.loads(line) for line in (root / name).read_bytes().splitlines()]
                (root / name).write_bytes(b''.join(json.dumps(row).encode() + b'\n'
                    for row in rows if row['event'] != 'owned-child-exit'))
                receipt = json.loads((root / (action + '.SAFE.json')).read_text())
                receipt['lifecycle'] = self.pin(root, name)
                (root / (action + '.SAFE.json')).write_text(json.dumps(receipt))
        self.mutate = corrupt
        with self.assertRaises(R.RestoreRuntimeError):
            self.restore()
        self.assertEqual([row[1] for row in self.calls], ['restore-create'])
        self.controller.save.assert_not_called()

    def test_owned_runner_rejects_restore_under_backup_scope_and_stops_once_with_restore_scope(self):
        backup = R.O.OwnedBackupRunner(self.w, self.controller, base=R.BASE,
            container=self.controller.CONTAINER, database=R.DATABASE)
        argv = list(R.DOCKER) + ['exec', '--user', '1000:1000', self.controller.CONTAINER, 'sh', '-c', 'FICTIONAL']
        with self.assertRaises(R.O.OwnedBackupError):
            backup.run_owned(argv, 'restore-create', 30)
        self.assertEqual(self.calls, [])
        self.w.stage = Mock(side_effect=OSError('FICTIONAL-LOST-CLIENT'))
        with self.assertRaises(R.O.OwnedBackupError):
            self.runner.run_owned(argv, 'restore-create', 30)
        self.runner.stop_once('restore-create')
        self.assertEqual(self.controller.docker.call_count, 1)
        self.assertEqual(self.controller.docker.call_args.args[-2:], ('active', 'end500-restore'))
        self.assertEqual(self.w.failure['reason'], 'end500-owned-restore-stage-failed')

    def test_completed_process_exit_and_args_are_not_replaceable_by_boolean(self):
        def false_result(*args):
            return True
        false_result.__self__ = self.runner
        with self.assertRaises(R.RestoreRuntimeError):
            R.restore_owned(self.controller, self.w, run_owned=false_result)
        self.controller.save.assert_not_called()


@unittest.skipUnless(shutil.which('node'), 'Node unavailable')
class RestoreNodeStopChecks(unittest.TestCase):
    def root(self, prefix='w15-restore-owned-'):
        root = Path('/tmp') / (prefix + uuid.uuid4().hex)
        root.mkdir(mode=0o700)
        self.addCleanup(shutil.rmtree, root)
        (root / 'state').mkdir(mode=0o700)
        (root / 'state/restore').mkdir(mode=0o700)
        return root

    def test_restore_scope_does_not_enable_legacy_or_backup_actions(self):
        for action, scope in (('restore-create', 'legacy'), ('restore-create', 'end500-backup'),
                              ('backup-dump', 'end500-restore')):
            result = subprocess.run(['node', str(STOP), '/tmp/w15-fictional-scope', action, R.DATABASE, 'active', scope],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
            self.assertNotEqual(result.returncode, 0)

    def term_waits_for_fictional_native_child_close(self, action):
        root = self.root()
        process = None
        try:
            child = 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},100);'
            if action == 'restore-render':
                child = child.replace('setInterval',
                    'require("node:fs").writeFileSync(1,"FICTIONAL_PARTIAL_SQL");setInterval')
            old = 'child=cp.spawn("/usr/lib/postgresql/17/bin/"+exe,args,'
            replacement = 'child=cp.spawn(process.execPath,["-e",' + json.dumps(child) + '],'
            self.assertIn(old, R.NODE_WORKER)
            worker = R.NODE_WORKER.replace(old, replacement, 1)
            process = subprocess.Popen(['node', '-e', worker, str(root), action, R.DATABASE],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            pid = root / ('state/' + action + '.pid')
            pid.write_text(str(process.pid))
            pid.chmod(0o600)
            journal = root / ('state/restore/' + action + '.lifecycle.PRIVATE.jsonl')
            audit = root / 'state/restore/rendered.PRIVATE.sql'
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                if (journal.exists() and b'owned-child-spawned' in journal.read_bytes()
                        and (action != 'restore-render' or (audit.exists() and audit.stat().st_size > 0))):
                    break
                time.sleep(.01)
            self.assertTrue(journal.exists())
            self.assertIn(b'owned-child-spawned', journal.read_bytes())
            stopped = subprocess.run(['node', str(STOP), str(root), action, R.DATABASE, 'active', 'end500-restore'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
            self.assertEqual(stopped.returncode, 0, stopped.stderr.decode())
            self.assertNotEqual(process.wait(timeout=3), 0)
            rows = [json.loads(line) for line in journal.read_bytes().splitlines()]
            events = [row['event'] for row in rows]
            self.assertIn('signal-received', events)
            self.assertIn('owned-child-exit', events)
            self.assertLess(events.index('signal-received'), events.index('owned-child-exit'))
            self.assertNotIn('owned-restore-closed', events)
            self.assertFalse((root / ('state/restore/' + action + '.SAFE.json')).exists())
            if action == 'restore-render':
                self.assertEqual(audit.read_bytes(), b'FICTIONAL_PARTIAL_SQL')
                self.assertEqual(audit.stat().st_mode & 0o777, 0o600)
        finally:
            if process is not None and process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)

    def test_real_worker_term_waits_for_fictional_native_child_close(self):
        self.term_waits_for_fictional_native_child_close('restore-create')

    def test_real_worker_term_render_waits_for_child_and_preserves_private_partial(self):
        self.term_waits_for_fictional_native_child_close('restore-render')

    def fictional_worker(self, child=None):
        if child is None:
            child = r'''const fs=require("node:fs"),args=process.argv.slice(2);
const expected=Buffer.from("FICTIONAL GENERATED SQL\n".repeat(8193));
if(process.argv[1]==="restore-render"){
 if(!args.includes("--file=-"))process.exit(2);fs.writeFileSync(1,expected);
}else{
 const file=args[args.indexOf("-f")+1];
 if(!file.endsWith("/state/restore/rendered.PRIVATE.sql")||!fs.readFileSync(file).equals(expected))process.exit(3);
}'''
        original = 'child=cp.spawn("/usr/lib/postgresql/17/bin/"+exe,args,'
        self.assertEqual(R.NODE_WORKER.count(original), 1)
        replacement = ('child=cp.spawn(process.execPath,["-e",' + json.dumps(child)
                       + ',action,...args],')
        return R.NODE_WORKER.replace(original, replacement, 1)

    def render(self, root, worker):
        return subprocess.run(['node', '-e', worker, str(root), 'restore-render', R.DATABASE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)

    def test_real_worker_render_single_audit_file_and_apply_pin_gate_with_fictional_child(self):
        root = self.root('w15-restore-render-')
        worker = self.fictional_worker()
        rendered = self.render(root, worker)
        self.assertEqual(rendered.returncode, 0, rendered.stderr.decode())
        self.assertEqual(rendered.stdout, b'')
        audit = root / 'state/restore/rendered.PRIVATE.sql'
        self.assertEqual(audit.read_bytes(), b'FICTIONAL GENERATED SQL\n' * 8193)
        self.assertEqual(audit.stat().st_mode & 0o777, 0o600)
        self.assertEqual(audit.stat().st_nlink, 1)
        self.assertFalse((root / 'restore.PRIVATE.sql').exists())
        self.assertEqual((root / 'state/restore/restore-render.PRIVATE.stdout').read_bytes(), b'')
        fd = R.B.S._directory(str(root / 'state/restore'), private=True)
        try:
            receipt = R.B._json(fd, 'restore-render.SAFE.json')
            self.assertEqual(receipt['renderedSQL'], R.B._pin(fd, 'rendered.PRIVATE.sql'))
            self.assertEqual(R._lifecycle(fd, 'restore-render'), receipt['identity'])
        finally:
            os.close(fd)
        audit.write_bytes(b'CHANGED-FICTIONAL-SQL')
        applied = subprocess.run(['node', '-e', worker, str(root), 'restore-apply', R.DATABASE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        self.assertNotEqual(applied.returncode, 0)
        journal = (root / 'state/restore/restore-apply.lifecycle.PRIVATE.jsonl').read_bytes()
        self.assertNotIn(b'owned-child-spawned', journal)
        self.assertFalse((root / 'state/restore/restore-apply.SAFE.json').exists())

    def test_real_worker_applies_the_single_pinned_audit_file(self):
        root = self.root('w15-restore-render-')
        worker = self.fictional_worker()
        self.assertEqual(self.render(root, worker).returncode, 0)
        applied = subprocess.run(['node', '-e', worker, str(root), 'restore-apply', R.DATABASE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        self.assertEqual(applied.returncode, 0, applied.stderr.decode())
        self.assertEqual(applied.stdout, b'')
        self.assertFalse((root / 'restore.PRIVATE.sql').exists())
        fd = R.B.S._directory(str(root / 'state/restore'), private=True)
        try:
            receipt = R.B._json(fd, 'restore-apply.SAFE.json')
            self.assertEqual(R._lifecycle(fd, 'restore-apply'), receipt['identity'])
        finally:
            os.close(fd)

    def test_real_worker_render_rejects_existing_audit_file_or_link_before_child(self):
        for kind in ('file', 'link'):
            with self.subTest(kind=kind):
                root = self.root('w15-restore-render-')
                audit = root / 'state/restore/rendered.PRIVATE.sql'
                target = root / 'existing.PRIVATE'
                target.write_bytes(b'FICTIONAL_EXISTING_BYTES')
                target.chmod(0o600)
                if kind == 'link':
                    audit.symlink_to(target)
                else:
                    audit.write_bytes(target.read_bytes())
                    audit.chmod(0o600)
                result = self.render(root, self.fictional_worker())
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(target.read_bytes(), b'FICTIONAL_EXISTING_BYTES')
                self.assertEqual(audit.read_bytes(), b'FICTIONAL_EXISTING_BYTES')
                journal = (root / 'state/restore/restore-render.lifecycle.PRIVATE.jsonl').read_bytes()
                self.assertNotIn(b'owned-child-spawned', journal)
                self.assertFalse((root / 'state/restore/restore-render.SAFE.json').exists())

    def test_real_worker_failed_render_preserves_partial_and_no_receipt(self):
        root = self.root('w15-restore-render-')
        child = 'require("node:fs").writeFileSync(1,"FICTIONAL_PARTIAL_SQL");process.exit(7);'
        result = self.render(root, self.fictional_worker(child))
        self.assertNotEqual(result.returncode, 0)
        audit = root / 'state/restore/rendered.PRIVATE.sql'
        self.assertEqual(audit.read_bytes(), b'FICTIONAL_PARTIAL_SQL')
        self.assertEqual(audit.stat().st_mode & 0o777, 0o600)
        rows = [json.loads(line) for line in (root / 'state/restore/restore-render.lifecycle.PRIVATE.jsonl').read_bytes().splitlines()]
        self.assertEqual(rows[-1]['event'], 'owned-child-exit')
        self.assertEqual(rows[-1]['code'], 7)
        self.assertFalse((root / 'state/restore/restore-render.SAFE.json').exists())


if __name__ == '__main__':
    unittest.main()
