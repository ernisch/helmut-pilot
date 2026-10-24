"""Private-channel/FD fixtures and short Python child lifecycle checks.

Python children exercise actual pipe/exit/TERM/KILL behavior only. No Node,
Docker, PostgreSQL, unit, provider or original input is executed or accessed.
"""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('execution_source_offline', HERE / 'local-unit-native-execution-source.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class ActorStat:
    def __init__(self, actual): self.actual = actual
    def __getattr__(self, key): return 1000 if key == 'st_uid' else getattr(self.actual, key)


class ActorPath(type(Path())):
    def lstat(self): return ActorStat(super().lstat())


class Worker:
    def __init__(self, out): self.OUT, self.guards = out, 0
    def guard(self, _): self.guards += 1
    def save(self, name, value):
        raw = json.dumps(value).encode(); fd = os.open(self.OUT / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
    def pin(self, path):
        p = Path(path); raw = p.read_bytes()
        return {'path': str(p), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class SourceBoundaries(unittest.TestCase):
    def test_original_public_catalogue_cannot_replace_diagnostic_sources(self):
        rows = [{'name': 'helmut_unit_diagnostic.fn' + str(i), 'identityArguments': '',
                 'prosrcSHA256': hashlib.sha256(str(i).encode()).hexdigest()} for i in range(29)]
        helpers = {'helmut_unit_diagnostic.helper' + str(i) + '()': 'c' * 64 for i in range(9)}
        catalog = {'functions': [{'name': 'public.helmut_original', 'identityArguments': '', 'prosrcSHA256': 'd' * 64}],
                   'nativeSources': rows}
        result = m.native_source_expectations(catalog, helpers)
        self.assertEqual(len(result), 38)
        self.assertNotIn('public.helmut_original()', result)
        for bad in (rows[:-1], rows[:-1] + [rows[0]]):
            with self.assertRaisesRegex(RuntimeError, 'native-source-expectations'):
                m.native_source_expectations({**catalog, 'nativeSources': bad}, helpers)
        overlap = dict(helpers); overlap.pop(next(iter(overlap))); overlap[rows[0]['name'] + '()'] = 'e' * 64
        with self.assertRaisesRegex(RuntimeError, 'native-source-expectations'):
            m.native_source_expectations(catalog, overlap)

    def test_current_ddl_inventory_includes_both_bundle_readers_in_exact_source_closure(self):
        spec = importlib.util.spec_from_file_location('source_inventory_offline', HERE / 'local-unit-native-bridge-qualification.py')
        bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
        native = bridge._definitions((HERE / 'local-unit-diagnostic-store.sql').read_text(encoding='utf8'))
        proposal = HERE.parents[1] / 'supabase/proposals/local_unit_original_bridge_local.sql'
        helpers = bridge._definitions(proposal.read_text(encoding='utf8'))
        rows = [{k: entry[k] for k in ('name', 'identityArguments', 'prosrcSHA256')} for entry in native.values()]
        future = {entry['name'] + '(' + entry['identityArguments'] + ')': entry['prosrcSHA256'] for entry in helpers.values()}
        self.assertEqual(len(rows), 29)
        self.assertEqual(len(future), 9)
        result = m.native_source_expectations({'nativeSources': rows}, future)
        self.assertEqual(len(result), 38)
        for signature in ('public.local_unit_diagnostic_control_runtime_read_v1(text, text)',
                          'public.local_unit_diagnostic_control_snapshot_read_v1(text, text, integer, text, jsonb, jsonb, text)'):
            self.assertIn(signature, result)
        for bad in (rows[:-1], rows[:-1] + [rows[0]]):
            with self.assertRaisesRegex(RuntimeError, 'native-source-expectations'):
                m.native_source_expectations({'nativeSources': bad}, future)
        overlap = dict(future); overlap.pop(next(iter(overlap))); overlap[next(iter(result))] = '0' * 64
        with self.assertRaisesRegex(RuntimeError, 'native-source-expectations'):
            m.native_source_expectations({'nativeSources': rows}, overlap)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-source-channel-'); self.addCleanup(self.temp.cleanup)
        self.worker = Worker(Path(self.temp.name)); self.selection = {'operationId': 'localUnitDiagnostic-' + 'a' * 32, 'commandHash': 'b' * 64}
        self.channel = m.HostChannel(self.worker, {}, self.selection)
        actual_fstat = os.fstat
        self.patches = [mock.patch.object(m, 'Path', ActorPath),
                        mock.patch.object(m.os, 'fstat', side_effect=lambda fd: ActorStat(actual_fstat(fd)))]
        for patch in self.patches: patch.start(); self.addCleanup(patch.stop)

    def host(self, mutate=lambda value: None):
        def run():
            path = self.worker.OUT / 'HOST_REQUEST_01.PRIVATE.json'; until = time.monotonic() + 2
            while not path.exists() and time.monotonic() < until: time.sleep(.001)
            # Exactly one read: the Source must atomically publish complete JSON.
            request = json.loads(path.read_bytes())
            now = datetime.datetime.now(datetime.timezone.utc)
            reply = {'schema': 'helmut-local-unit-native-host-reply/1', **{k: request[k] for k in ('seq', 'stage', 'nonce', 'selection')},
                'requestSHA256': self.worker.pin(path)['sha256'], 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'result': {'synthetic': True}}
            mutate(reply)
            stage = self.worker.OUT / 'reply.stage'; self.worker.save(stage.name, reply)
            stage.rename(self.worker.OUT / 'HOST_REPLY_01.PRIVATE.json')
        thread = threading.Thread(target=run); thread.start(); self.addCleanup(thread.join, 3)

    def test_complete_fresh_reply_is_bound_to_exact_request_scope_and_bytes(self):
        self.host(); self.assertEqual(self.channel.call('HOST_OBSERVE', {}, seconds=1), {'synthetic': True})
        self.assertFalse(self.channel.sealed)
        request = json.loads((self.worker.OUT / 'HOST_REQUEST_01.PRIVATE.json').read_bytes())
        self.assertEqual(set(request['selection']), {'operationId', 'commandHash'})
        self.assertEqual(request['selection'], self.selection)

    def test_foreign_nonce_scope_or_request_hash_permanently_seals(self):
        # Each subcase is a separate synthetic operation, never a retry.
        for key, value in [('nonce', 'c' * 64), ('selection', {**self.selection, 'commandHash': 'c' * 64}), ('requestSHA256', 'c' * 64)]:
            with self.subTest(key=key):
                for path in self.worker.OUT.iterdir(): path.unlink()
                self.channel = m.HostChannel(self.worker, {}, self.selection)
                self.host(lambda reply: reply.update({key: value}))
                with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=1)
                self.assertTrue(self.channel.sealed)
                with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=1)

    def test_lost_reply_and_new_controller_do_not_reuse_the_attempt(self):
        with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=.025)
        self.assertTrue(self.channel.sealed)
        another = m.HostChannel(self.worker, {}, self.selection)
        with self.assertRaises(FileExistsError): another.call('HOST_OBSERVE', {}, seconds=.025)
        self.assertTrue(another.sealed)

    def test_stale_reply_is_never_a_current_host_observation(self):
        self.host(lambda reply: reply.update(issuedAtUTC='2026-01-01T00:00:00.000Z', expiresAtUTC='2026-01-01T00:00:03.000Z'))
        with self.assertRaisesRegex(RuntimeError, 'host-reply-freshness'): self.channel.call('HOST_OBSERVE', {}, seconds=1)

    def test_private_reader_rejects_duplicates_nonfinite_and_file_permission_drift(self):
        p = self.worker.OUT / 'input'; p.write_bytes(b'{"a":1,"a":2}'); p.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'private-duplicate'): m.private_json(self.worker, p)
        p.write_bytes(b'{"a":NaN}')
        with self.assertRaises(ValueError): m.private_json(self.worker, p)
        p.write_bytes(b'{"a":1}'); p.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p)

    def test_private_reader_rejects_symlink_hardlink_and_oversized_payload(self):
        p = self.worker.OUT / 'input'; p.write_bytes(b'{"a":1}'); p.chmod(0o600)
        link = self.worker.OUT / 'symlink'; link.symlink_to(p)
        with self.assertRaises(RuntimeError): m.private_json(self.worker, link)
        hard = self.worker.OUT / 'hardlink'; os.link(p, hard)
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p)
        hard.unlink()
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p, cap=1)

    def test_request_is_invisible_until_complete_and_fsynced(self):
        target = self.worker.OUT / 'HOST_REQUEST_01.PRIVATE.json'
        request = {'schema': 'VM-only-publication', 'body': 'x' * 70000}
        actual_write, actual_fsync = os.write, os.fsync
        writes, syncs = [], []
        def write(fd, raw):
            self.assertFalse(target.exists()); writes.append(len(raw))
            return actual_write(fd, raw[:997])
        def sync(fd):
            is_directory = __import__('stat').S_ISDIR(os.fstat(fd).st_mode)
            self.assertEqual(target.exists(), is_directory); syncs.append(is_directory)
            return actual_fsync(fd)
        with mock.patch.object(m.os, 'write', side_effect=write), mock.patch.object(m.os, 'fsync', side_effect=sync), mock.patch.object(self.worker, 'save', side_effect=AssertionError('non-atomic-worker-save')):
            m.publish_request(self.worker, target.name, request)
        self.assertGreater(len(writes), 2); self.assertEqual(syncs, [False, True])
        self.assertEqual(json.loads(target.read_bytes()), request)
        before = target.read_bytes()
        with self.assertRaises(FileExistsError): m.publish_request(self.worker, target.name, {'vm': 'second-attempt'})
        self.assertEqual(target.read_bytes(), before)

    def test_request_cap_and_closed_filename_fail_before_publication(self):
        with self.assertRaisesRegex(RuntimeError, 'host-request-cap'):
            m.publish_request(self.worker, 'HOST_REQUEST_01.PRIVATE.json', {'body': 'x' * 262144})
        with self.assertRaisesRegex(RuntimeError, 'host-request-path'):
            m.publish_request(self.worker, '../HOST_REQUEST_01.PRIVATE.json', {})
        self.assertEqual(list(self.worker.OUT.iterdir()), [])

    def test_postgrest_alias_is_native_pinned_into_runtime_before_jit_read(self):
        # Stop after the runtime alias point; no JIT, original or database read.
        config = {'executeNativeSingleUnit': True, 'full500': False, 'motorCalls': 0, 'paidProviderCalls': 0,
                  'nonce': 'a' * 32, 'repository': '/VM', 'bridgeQualifierPin': {}, 'runtimeBindings': [],
                  'nodePin': {'path': '/VM/node', 'bytes': 3, 'sha256': 'a' * 64}, 'pythonExecutable': '/VM/python',
                  'executionHostPlan': {'aliasPins': {'postgrest': {'path': '/opt/postgrest-pinned', 'bytes': 3, 'sha256': 'b' * 64}}}}
        rows = [{'name': 'helmut_unit_diagnostic.fn' + str(i), 'identityArguments': '', 'prosrcSHA256': 'c' * 64} for i in range(29)]
        catalog = {'nativeSources': rows}
        calls = []
        def native_pin(path):
            calls.append(str(path))
            return {'path': str(path), 'bytes': 3, 'sha256': 'd' * 64}
        worker = types.SimpleNamespace(pin=native_pin, load=lambda *a: types.SimpleNamespace(expected_bridge_sources=lambda _: {'helmut_unit_diagnostic.helper' + str(i)+'()':'e'*64 for i in range(9)}))
        config['bridgeProposalPin'] = {}
        with mock.patch.object(m, 'code_files', return_value=[]), mock.patch.object(m, 'logical_pin', return_value={}):
            with self.assertRaisesRegex(RuntimeError, 'actual-postgrest-runtime-alias'):
                m.command_input(worker, config, None, catalog, {}, {}, '2026-10-22T12:03:00.000Z')
        self.assertIn('/opt/postgrest-pinned', calls)


class PythonChildren(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-nodechild-lifecycle-'); self.addCleanup(self.temp.cleanup)
        self.worker = Worker(Path(self.temp.name)); self.worker.CHILDREN = []
        self.script = self.worker.OUT / 'entry.js'; self.script.write_text('/* synthetic, never executed */')
        self.config = {'repository': str(self.worker.OUT), 'database': 'helmut_unit_diagnostic_' + 'a' * 32,
                       'nodePin': {'path': os.path.realpath(sys.executable)}, 'sourceObserverPin': {}, 'sourceCodePins': [self.worker.pin(self.script)]}
        self.expired = False
        def guard(_):
            self.worker.guards += 1
            if self.expired: raise RuntimeError('synthetic-expired-guard')
        self.worker.guard = guard
        def identity(pid):
            return {'parentPID': os.getpid(), 'exe': self.config['nodePin']['path'], 'membership': '0::/\n', 'pidNamespace': 'pid:[1]'}
        self.worker.load = lambda *a: types.SimpleNamespace(process_identity=identity)
        self.real_popen = subprocess.Popen
        self.spawn_patch = mock.patch.object(m.subprocess, 'Popen', side_effect=self.spawn)
        self.spawn_patch.start(); self.addCleanup(self.spawn_patch.stop)
        for name, value in (('TERM_SECONDS', .08), ('KILL_SECONDS', .2)):
            patch = mock.patch.object(m.NodeChild, name, value); patch.start(); self.addCleanup(patch.stop)
        self.addCleanup(self.close_children)
        self.program = 'import time; time.sleep(2)'

    def spawn(self, argv, **options):
        self.assertEqual(argv[1:3], ['--max-old-space-size=384', '--max-semi-space-size=16'])
        self.assertEqual(options['env'], m.node_environment(self.config['database']))
        return self.real_popen([sys.executable, '-I', '-S', '-B', '-c', self.program], **options)

    def close_children(self):
        for child in self.worker.CHILDREN:
            if child.poll() is None: child.kill()
            child.wait(timeout=1)
            for stream in (child.stdout, child.stderr): stream.close()

    def child(self):
        return m.NodeChild(self.worker, self.config, 'entry.js', '--VM-only', 'PYTHON_CHILD')

    def test_actual_exit_zero_and_both_natural_eof_succeed(self):
        self.program = 'print("{}",flush=True)'
        child = self.child(); self.assertEqual(child.finish(seconds=1), b'{}\n')
        self.assertEqual(child.child.returncode, 0); self.assertEqual(child.eof, [True, True]); self.assertFalse(child.failed)
        self.assertTrue(child.saved and child.closed)

    def test_emitted_ack_then_nonzero_is_never_success(self):
        self.program = 'import sys; print("{}",flush=True); sys.exit(3)'
        child = self.child()
        with self.assertRaisesRegex(RuntimeError, 'node-actual-exit-eof'): child.finish(seconds=1)
        self.assertEqual(child.child.returncode, 3); self.assertEqual(child.eof, [True, True]); self.assertTrue(child.failed)

    def test_constructor_identity_failure_owns_termination_before_return(self):
        self.worker.load = lambda *a: (_ for _ in ()).throw(RuntimeError('synthetic-observer-failure'))
        with self.assertRaisesRegex(RuntimeError, 'synthetic-observer-failure'): self.child()
        self.assertEqual(len(self.worker.CHILDREN), 1); self.assertIsNotNone(self.worker.CHILDREN[0].poll())
        self.assertTrue(self.worker.CHILDREN[0].stdout.closed and self.worker.CHILDREN[0].stderr.closed)

    def test_partial_capture_registration_failure_still_terminates_actual_child(self):
        child = object.__new__(m.NodeChild)
        with mock.patch.object(m.NodeChild, '_register', side_effect=OSError('synthetic-selector-failure')):
            with self.assertRaises(OSError): child.__init__(self.worker, self.config, 'entry.js', '--VM-only', 'PYTHON_CHILD')
        self.assertIsNotNone(child.child.poll()); self.assertEqual(child.eof, [False, False]); self.assertTrue(child.failed)

    def test_expired_guard_does_not_prevent_kill_drain_and_wait(self):
        self.program = 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("{}",flush=True); time.sleep(2)'
        child = self.child(); child.first_line(seconds=1); self.expired = True
        before = self.worker.guards
        with self.assertRaisesRegex(RuntimeError, 'synthetic-expired-guard'): child.finish(seconds=1)
        self.assertEqual(self.worker.guards, before + 1); self.assertIsNotNone(child.child.poll())
        self.assertEqual(child.eof, [True, True]); self.assertTrue(child.saved and child.failed)

    def test_timeout_escalates_term_to_kill_and_can_never_be_reopened(self):
        self.program = 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("{}",flush=True); time.sleep(2)'
        child = self.child(); child.first_line(seconds=1); started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'node-exit-deadline'): child.finish(seconds=.025)
        self.assertLess(time.monotonic() - started, 1); self.assertLess(child.child.returncode, 0)
        self.assertTrue(child.saved); self.assertEqual(child.eof, [True, True])
        with self.assertRaisesRegex(RuntimeError, 'node-finish-terminal'): child.finish(seconds=1)

    def test_invalid_ready_json_terminates_the_long_lived_service(self):
        self.program = 'import time; print("invalid-json",flush=True); time.sleep(2)'
        child = self.child()
        with self.assertRaises(json.JSONDecodeError): child.first_line(seconds=1)
        self.assertIsNotNone(child.child.poll()); self.assertTrue(child.saved and child.failed)

    def test_overflow_is_capped_but_abort_continues_draining_term_handler(self):
        self.program = ('import os,signal,sys,time\n'
            'def done(s,f):\n os.write(2,b"x"*600000); sys.exit(0)\n'
            'signal.signal(signal.SIGTERM,done)\nos.write(1,b"x"*1400000)\ntime.sleep(2)\n')
        child = self.child()
        with self.assertRaisesRegex(RuntimeError, 'node-output-cap'): child.finish(seconds=1)
        self.assertIsNotNone(child.child.poll()); self.assertTrue(child.failed and child.saved)
        self.assertLessEqual(len(child.outputs[0]), 1048576); self.assertLessEqual(len(child.outputs[1]), 131072)
        self.assertEqual(child.eof, [True, True])

    def test_missing_eof_stays_unknown_even_if_parent_exits_zero(self):
        self.program = 'import os,time\np=os.fork()\nif p==0:\n time.sleep(.4); os._exit(0)\nos._exit(0)\n'
        child = self.child()
        with self.assertRaisesRegex(RuntimeError, 'node-exit-deadline'): child.finish(seconds=.025)
        self.assertEqual(child.child.returncode, 0); self.assertFalse(all(child.eof)); self.assertTrue(child.failed)
        with self.assertRaises(RuntimeError): child.finish(seconds=1)
        time.sleep(.15)  # The short test-only descendant ends independently.

    def test_save_cannot_close_pipes_of_a_live_child_and_abort_handle_can(self):
        child = self.child()
        with self.assertRaisesRegex(RuntimeError, 'node-save-live-child'): child.save()
        self.assertFalse(child.child.stdout.closed or child.child.stderr.closed)
        child.abort(); self.assertIsNotNone(child.child.poll()); self.assertTrue(child.failed and child.saved)
        self.assertEqual(child.eof, [True, True])


if __name__ == '__main__': unittest.main()
