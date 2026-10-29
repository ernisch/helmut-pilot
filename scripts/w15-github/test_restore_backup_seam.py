"""Five actual restore producers into the previously stubbed backup admission.

Only invented native results and kernel samples are used. The local adapter
replaces Docker transport; it grants no owned-runner, SQL, RAM or 500 acceptance.
The unchanged Node worker writes all receipts, lifecycle journals and pin files.
No database, Docker, GPG, originals or backup export action is executed.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_restore_seam_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R = load('restore_backup')
T = R.T
CANARY = 'FICTIONAL_NATIVE_OUTPUT_NOT_A_REAL_DATABASE'

# Run the exact source in a Node VM. Only child_process is fictional: fs,
# crypto, process identity, descriptors, journal flushes and all producers are
# the real implementations. No fake receipt/lifecycle/pin file is supplied.
HARNESS = r'''
const fs=require('node:fs'),vm=require('node:vm'),EventEmitter=require('node:events');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
function need(value){if(!value)throw Error('FICTIONAL_NATIVE_BINDING_REJECTED');}
let calls=0;
const synthetic={spawn(exe,args,options){
 need(++calls===1&&Array.isArray(args)&&options.stdio[1]>=0&&options.stdio[2]>=0);
 const expected=input.action==='restore-render'?'pg_restore':'psql';
 need(exe==='/usr/lib/postgresql/17/bin/'+expected);
 const child=new EventEmitter();child.pid=process.pid+100000;child.exitCode=null;child.signalCode=null;
 child.kill=()=>{throw Error('FICTIONAL_CHILD_MUST_ALREADY_CLOSE');};
 let sql;
 if(options.stdio[0]==='pipe'){
   child.stdin=new EventEmitter();child.stdin.end=value=>{sql=value;};
 }
 setImmediate(()=>{
  let code=0;
  try{
   if(input.action==='restore-render'){
    need(args.includes('--file='+input.base+'/restore.PRIVATE.sql'));
    need(args.includes(input.base+'/input.PRIVATE.dump'));
    fs.writeFileSync(input.base+'/restore.PRIVATE.sql','-- FICTIONAL SQL; NEVER EXECUTED\n',
      {flag:'wx',mode:384});
   }else if(input.action==='restore-check'){
    need(typeof sql==='string'&&sql.includes('jsonb_build_object'));
    fs.writeSync(options.stdio[1],'{"profiles":500,"active":0}\n');
   }else if(input.action==='restore-create'){
    need(sql==='create database '+input.database+';');
   }else if(input.action==='restore-roles'){
    need(args.includes(input.base+'/roles.PRIVATE.sql'));
   }else{
    need(input.action==='restore-apply'&&args.includes('--single-transaction'));
    need(args.includes(input.base+'/restore.PRIVATE.sql'));
   }
  }catch(_){code=1;}
  child.exitCode=code;child.emit('close',code,null);
 });
 return child;
}};
process.argv=[process.execPath,input.base,input.action,input.database];
vm.runInNewContext(input.worker,{require:name=>name==='node:child_process'?synthetic:require(name),
  process,Buffer,setTimeout,clearTimeout},{timeout:2000});
'''


def sample():
    return {'configuredLimit': '2560000000', 'swapMaximum': '0',
        'kernelLifetimePeakBytes': 4096, 'currentBytes': 2048, 'swapCurrentBytes': 0,
        'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}


class LocalSyntheticTransport:
    """Bound adapter only; container identity and Watch execution are untested."""
    def __init__(self, root, controller):
        self.root, self.controller = root, controller
        self.scope, self.actions = 'end500-restore', T.ACTIONS
        self.actions_seen = []

    def run_owned(self, argv, action, seconds):
        if (action not in self.actions or action in self.actions_seen
                or not 10 < seconds <= 600 or argv[:8] != self.controller.DOCKER +
                ['exec', '--user', '1000:1000', self.controller.CONTAINER, 'sh', '-c']):
            raise AssertionError('SYNTHETIC_TRANSPORT_BINDING_REJECTED')
        words = shlex.split(argv[-1])
        if T.NODE_WORKER not in words or words[-3:] != [str(self.root), action, T.DATABASE]:
            raise AssertionError('SYNTHETIC_WORKER_SOURCE_BINDING_REJECTED')
        value = {'worker': T.NODE_WORKER, 'base': str(self.root),
            'action': action, 'database': T.DATABASE}
        result = subprocess.run([shutil.which('node'), '-e', HARNESS], input=json.dumps(value).encode(),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5, close_fds=True,
            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8'})
        if result.returncode != 0 or result.stdout:
            raise AssertionError('SYNTHETIC_PRODUCER_FAILED_' + action.upper().replace('-', '_'))
        self.actions_seen.append(action)
        return subprocess.CompletedProcess(argv, result.returncode)


@unittest.skipUnless(shutil.which('node'), 'Node unavailable')
class RestoreBackupSeamChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path('/tmp') / ('w15-restore-seam-' + uuid.uuid4().hex)
        cls.root.mkdir(mode=0o700)
        cls.addClassCleanup(shutil.rmtree, cls.root)
        cls.work = cls.root / 'work'
        cls.work.mkdir(mode=0o700)
        (cls.work / 'state').mkdir(mode=0o700)
        cls.context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
            'nonce': str(uuid.uuid4()), 'exactCommit': 'a' * 40, 'runId': '940000000001', 'runAttempt': 1,
            'inputManifestSHA': hashlib.sha256(b'FICTIONAL_INPUT_BINDING_ONLY').hexdigest(),
            'recipientFingerprint': R.FINGERPRINT, 'executionAuthority': False}
        container = 'w15-end500-' + cls.context['runId'] + '-' + uuid.UUID(cls.context['nonce']).hex
        def save(name, value):
            fd = os.open(cls.work / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write((json.dumps(value) + '\n').encode())
        cls.controller = SimpleNamespace(BASE=str(cls.root), DB=T.DATABASE, WORK=cls.work,
            CONTAINER=container, DOCKER=list(T.DOCKER), save=save)
        cls.watch = SimpleNamespace(thread=SimpleNamespace(is_alive=lambda: True), finished=threading.Event(),
            disk_phase='processing', common_resources=object(), sample=lambda: None, last=sample())
        cls.transport = LocalSyntheticTransport(cls.root, cls.controller)
        cls.watch.backup_runner = cls.transport
        # The materialized state is mounted at BASE/state in production; the
        # UUID fixture uses a real ordinary sibling tree with that geometry.
        (cls.root / 'state').mkdir(mode=0o700)
        for name in ('roles.PRIVATE.sql', 'input.PRIVATE.dump'):
            fd = os.open(cls.root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(CANARY.encode())
        # Host WORK/state and container BASE/state represent one bind mount.
        # Copying is a transport concern; no receipt contents are invented.
        original = cls.transport.run_owned
        def execute(argv, action, seconds):
            (cls.root / 'state/restore').mkdir(mode=0o700, exist_ok=True)
            result = original(argv, action, seconds)
            for path in (cls.root / 'state').rglob('*'):
                relative = path.relative_to(cls.root / 'state')
                target = cls.work / 'state' / relative
                if path.is_dir():
                    target.mkdir(mode=0o700, exist_ok=True)
                elif not target.exists():
                    with path.open('rb') as source:
                        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        with os.fdopen(fd, 'wb') as destination:
                            shutil.copyfileobj(source, destination)
            return result
        # restore_owned intentionally requires a method bound to its adapter.
        def bound(adapter, argv, action, seconds):
            return execute(argv, action, seconds)
        cls.transport.run_owned = bound.__get__(cls.transport, LocalSyntheticTransport)
        with patch.object(T, 'BASE', str(cls.root)):
            cls.result = T.restore_owned(cls.controller, cls.watch, run_owned=cls.transport.run_owned)

    def closure(self):
        fd = R.S._directory(str(self.work), private=True)
        try:
            return R._restore_closure(fd)
        finally:
            os.close(fd)

    def test_producer_receipts_pass_actual_restore_and_backup_start_checks(self):
        self.assertEqual(self.transport.actions_seen, list(T.ACTIONS))
        self.assertEqual(self.result['steps'], 5)
        self.assertFalse(self.result['fullRestoreAccepted'])
        closed = self.closure()
        self.assertEqual(closed['profiles'], 500)
        self.assertEqual(closed['active'], 0)
        observed = R._sample(self.watch)
        self.assertEqual(observed, sample())
        plan = R.B.database_export_plan(self.context, database=T.DATABASE, container=self.controller.CONTAINER)
        self.assertFalse(plan['executed'])
        self.assertFalse(plan['executionAuthority'])

    def test_actual_readbacks_reject_changed_render_pin_and_identity(self):
        paths = [self.work / 'state/restore/rendered.PRIVATE.sql',
            self.work / 'state/restore-create.node.SAFE.json']
        for path in paths:
            with self.subTest(boundary=path.name):
                raw = path.read_bytes()
                try:
                    path.write_bytes(b'FICTIONAL_CHANGED_BYTES')
                    with self.assertRaises(Exception):
                        self.closure()
                finally:
                    path.write_bytes(raw)
        self.closure()

    def test_actual_start_checks_reject_wrong_binding_and_dead_monitor(self):
        with self.assertRaises(Exception):
            R.B.database_export_plan(self.context, database=T.DATABASE,
                container=self.controller.CONTAINER + '-wrong')
        self.watch.finished.set()
        try:
            with self.assertRaises(Exception):
                R._sample(self.watch)
        finally:
            self.watch.finished.clear()
        self.assertEqual(R._sample(self.watch), sample())


if __name__ == '__main__':
    unittest.main()
