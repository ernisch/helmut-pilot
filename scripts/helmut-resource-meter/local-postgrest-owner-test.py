"""Pure fixtures/fake Popen only. No native child, DB, Docker or network.

Path/pin constants and the private-container observation are replaced ONLY in a
fresh imported test module. These fake scopes cannot admit the production CLI.
"""
import copy
import datetime
import importlib.util
import io
import json
import os
import signal
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).with_name('local-postgrest-owner.py')


def module():
    spec = importlib.util.spec_from_file_location('pure_postgrest_owner_fixture', SOURCE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class Child:
    def __init__(self, argv, code=-2, log=b'Starting PostgREST 12.2.3 (pure fixture)\n'):
        self.args, self.pid, self.code, self.state = argv, 42, code, None
        self.stdout = io.BytesIO(log)
        self.signals, self.waits, self.kills = [], [], 0
        self.timeout_once, self.signal_error = False, False

    def poll(self):
        return self.state

    def send_signal(self, value):
        self.signals.append(value)
        if self.signal_error:
            raise OSError('pure signal failure')

    def wait(self, timeout):
        self.waits.append(timeout)
        if self.timeout_once and len(self.waits) == 1:
            raise subprocess.TimeoutExpired('pure fake', timeout)
        self.state = -9 if self.kills else self.code
        return self.state

    def kill(self):
        self.kills += 1


class OwnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='helmut-pure-local-owner-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.m = module()
        self.m.ROOT = self.root
        self.m.UPSTREAM_ROOT = self.root / 'upstream'
        self.m.UPSTREAM_ROOT.mkdir()
        self.m.BINARY_PATH = str(self.root / 'postgrest-fixture-never-executed')
        self.m.CONFIG_PATH = str(self.root / 'postgrest.conf')
        self.m.LOG_PATH = self.root / 'owner.log'
        self.m.RESULT_PATH = self.root / 'owner-result.json'
        self.m.STOP_PATH = self.root / 'stop.json'
        self.now = datetime.datetime(2026, 10, 22, 1, tzinfo=datetime.timezone.utc).timestamp()
        self.mono = 1000.0
        self.wall_patch = patch.object(self.m.time, 'time', side_effect=lambda: self.now)
        self.mono_patch = patch.object(self.m.time, 'monotonic', side_effect=lambda: self.mono)
        self.wall_patch.start(); self.addCleanup(self.wall_patch.stop)
        self.mono_patch.start(); self.addCleanup(self.mono_patch.stop)
        self.saved = []
        def file(p, raw):
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw); p.chmod(0o600)
            return {'path': str(p), 'bytes': len(raw), 'sha256': self.m.sha(raw)}
        self.file = file
        binary = file(Path(self.m.BINARY_PATH), b'nonexecutable PURE fake binary fixture\n')
        self.m.BINARY_BYTES, self.m.BINARY_SHA256 = binary['bytes'], binary['sha256']
        sources = [file(self.root / 'scripts/helmut-resource-meter' / n, ('pure source ' + n).encode()) for n in self.m.SOURCE_ROLES]
        self.m.__file__ = sources[0]['path']  # explicit private pure-module fixture only
        upstream = [file(self.m.UPSTREAM_ROOT / str(i), ('pure provenance ' + str(i)).encode()) for i in range(7)]
        evidence = {'postgrestCommit': '519615d5fbe3c19218baf0aeff8f5e3920d390e5',
            'ghcCommit': '8e9ea0f91305d9e4bb9df3d89f6a9e223ecb4dd3',
            'sources': [{'localRelativePath': str(i), 'bytes': p['bytes'], 'sha256': p['sha256']} for i, p in enumerate(upstream)]}
        ev = file(self.m.UPSTREAM_ROOT / 'SOURCE_EVIDENCE.SAFE.json', self.m.canonical(evidence))
        self.m.EVIDENCE_BYTES, self.m.EVIDENCE_SHA256 = ev['bytes'], ev['sha256']
        self.target = 'helmut_resource_fixture_20261022_' + 'b' * 12
        template = b'db-uri = "postgresql://authenticator@/old_fixture?host=/var/run/postgresql"\njwt-secret = "' + b'a' * 64 + b'"\nserver-host = "0.0.0.0"\nserver-port = 38410\ndb-pool = 2\n'
        config = template.replace(b'old_fixture', self.target.encode()).replace(b'a' * 64, b'b' * 64).replace(b'38410', b'38414')
        self.scope = {'schema': 'helmut-local-fullcase-postgrest-owner-scope/1', 'production': False, 'automaticRetry': False,
            'nonce': 'c' * 32, 'day': '2026-10-22', 'caseDirectory': '/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-' + 'b' * 12,
            'targetDatabase': self.target, 'operationId': 'synthetik500-resources22-' + 'b' * 12,
            'containerId': 'a' * 64, 'controllerInvocationId': 'd' * 32,
            'cgroupParent': '/helmut-meter-resources22-' + 'b' * 12 + '/database',
            'createdAtUTC': '2026-10-22T01:00:00Z', 'launchByUTC': '2026-10-22T01:00:30Z',
            'workEndsAtUTC': '2026-10-22T05:00:00Z', 'closeByUTC': '2026-10-22T05:02:00Z',
            'maximumLifecycleSeconds': 14520, 'binaryPin': binary, 'configPin': file(Path(self.m.CONFIG_PATH), config),
            'templatePin': file(self.root / 'template.conf', template), 'jwtSecretSHA256': self.m.sha(b'b' * 64),
            'sourcePins': sources, 'upstreamEvidencePin': ev, 'upstreamSourcePins': upstream,
            'logLimitBytes': 65536, 'waitSeconds': 20, 'killWaitSeconds': 5, 'drainWaitSeconds': 3,
            'requestSHA256': self.m.sha(b'pure request fixture')}
        self.producer = {'containerId': self.scope['containerId'], 'controllerInvocationId': self.scope['controllerInvocationId'],
            'scopePin': file(self.root / 'scope.json', self.m.canonical(self.scope))}
        self.m.container_scope = lambda: (copy.deepcopy(self.scope), copy.deepcopy(self.producer))
        self.m.process_identity = lambda child: {'pid': child.pid, 'startTicks': '1234'}

    def started(self, *, code=-2, log=None):
        cap = self.m.qualify_scope()
        child = Child([self.m.BINARY_PATH, self.m.CONFIG_PATH], code, **({'log': log} if log is not None else {}))
        with patch.object(self.m.subprocess, 'Popen', return_value=child) as popen:
            self.m.launch(cap)
        self.assertEqual(popen.call_args.kwargs['env'], self.m.ENV)
        self.assertEqual(popen.call_args.args[0], child.args)
        return cap, child

    def close(self, cap, **kwargs):
        return self.m.close(cap, persist=kwargs.pop('persist', lambda r: self.saved.append(copy.deepcopy(r))), **kwargs)

    def test_import_inert_and_default_cli_cannot_launch(self):
        raw = SOURCE.read_bytes()
        with patch('builtins.open', side_effect=AssertionError('import IO')), patch('os.open', side_effect=AssertionError('import IO')), patch('subprocess.Popen', side_effect=AssertionError('native start')):
            ns = {'__file__': str(SOURCE), '__name__': 'pure_inert_import'}
            exec(compile(raw, str(SOURCE), 'exec'), ns)
            with self.assertRaises(Exception): ns['qualify_scope']()

    def test_more_than_three_hours_uses_bound_lifecycle_not_launch_freshness(self):
        cap, child = self.started()
        self.now += 10801; self.mono += 10801
        r = self.close(cap)
        self.assertTrue(r['pass'] and r['acceptedExpectedTranslation'])
        self.assertEqual(r['returnCode'], -2)
        self.assertEqual(child.signals, [signal.SIGTERM])
        self.assertEqual(child.waits, [20])
        self.assertNotIn('b' * 64, json.dumps(r))

    def test_launch_freshness_expiry_prevents_popen_and_retry(self):
        cap = self.m.qualify_scope(); self.now += 31; self.mono += 31
        with patch.object(self.m.subprocess, 'Popen', side_effect=AssertionError('must not launch')):
            with self.assertRaises(ValueError): self.m.launch(cap)
            with self.assertRaises(ValueError): self.m.launch(cap)
        self.assertFalse(self.close(cap)['pass'])

    def test_actual_self_path_must_be_the_pinned_owner_before_popen(self):
        self.m.__file__ = str(self.root / 'unused-owner.py')
        with patch.object(self.m.subprocess, 'Popen') as p:
            with self.assertRaises(ValueError): self.m.qualify_scope()
        p.assert_not_called()

    def test_recheck_cannot_spend_launch_deadline_then_launch(self):
        cap = self.m.qualify_scope()
        real = self.m.recheck
        def slow(e):
            real(e); self.now += 31; self.mono += 31
        with patch.object(self.m, 'recheck', side_effect=slow), patch.object(self.m.subprocess, 'Popen') as p:
            with self.assertRaises(ValueError): self.m.launch(cap)
        p.assert_not_called()
        self.assertFalse(self.close(cap)['pass'])

    def test_fifo_and_regular_to_fifo_race_cannot_block_open(self):
        p = self.root / 'fifo'
        os.mkfifo(p)
        with patch.object(self.m.os, 'open', side_effect=AssertionError('FIFO opened')):
            with self.assertRaises(ValueError): self.m.regular(p, 100)
        race = self.root / 'race'; race.write_bytes(b'fixture')
        original = os.open
        flags_seen = []
        def replace_before_open(p, flags, *args):
            flags_seen.append(flags)
            race.unlink(); os.mkfifo(race)
            return original(p, flags, *args)
        with patch.object(self.m.os, 'open', side_effect=replace_before_open):
            with self.assertRaises(ValueError): self.m.regular(race, 100)
        self.assertTrue(flags_seen[0] & os.O_NONBLOCK)

    def test_parallel_launch_and_close_bind_actual_child_before_consuming(self):
        cap = self.m.qualify_scope()
        child = Child([self.m.BINARY_PATH, self.m.CONFIG_PATH])
        entered, release = threading.Event(), threading.Event()
        closed, errors = [], []
        def popen(*a, **k):
            entered.set()
            if not release.wait(timeout=2): raise RuntimeError('pure scheduling deadline')
            return child
        def attempt_launch():
            try: self.m.launch(cap)
            except BaseException as ex: errors.append(type(ex).__name__)
        def attempt_close():
            try: closed.append(self.close(cap))
            except BaseException as ex: errors.append(type(ex).__name__)
        with patch.object(self.m.subprocess, 'Popen', side_effect=popen) as p:
            launching = threading.Thread(target=attempt_launch)
            launching.start(); self.assertTrue(entered.wait(timeout=2))
            closing = threading.Thread(target=attempt_close); closing.start()
            release.set(); launching.join(timeout=3); closing.join(timeout=3)
        self.assertFalse(launching.is_alive() or closing.is_alive())
        self.assertEqual(errors, []); self.assertEqual(p.call_count, 1)
        self.assertEqual(child.signals, [signal.SIGTERM]); self.assertTrue(closed[0]['pass'])

    def test_parallel_qualify_admits_only_one_scope(self):
        admitted, rejected = [], []
        def qualify():
            try: admitted.append(self.m.qualify_scope())
            except ValueError: rejected.append(True)
        threads = [threading.Thread(target=qualify) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(timeout=2)
        self.assertEqual(len(admitted), 1); self.assertEqual(len(rejected), 1)
        self.assertFalse(self.close(admitted[0])['pass'])

    def test_consumed_copied_and_reissued_capabilities_reject(self):
        cap, child = self.started()
        with self.assertRaises(ValueError): self.m.close(self.m.Capability())
        self.assertTrue(self.close(cap)['pass'])
        with self.assertRaises(ValueError): self.close(cap)
        self.scope['nonce'] = 'e' * 32
        with self.assertRaises(ValueError): self.m.qualify_scope()
        self.assertEqual(child.signals, [signal.SIGTERM])

    def test_raw_status_allowlist_requires_same_qualified_signal(self):
        for code in [0, -15, -2, 143, 1, -9]:
            with self.subTest(code=code):
                if self.m._nonces: self.setUp()
                cap, _ = self.started(code=code)
                self.assertEqual(self.close(cap)['pass'], code in (0, -15, -2))

    def test_binary_or_config_drift_fails_but_cleans_bound_child(self):
        cap, child = self.started()
        Path(self.m.CONFIG_PATH).write_bytes(b'changed fixture')
        r = self.close(cap)
        self.assertFalse(r['pass']); self.assertEqual(child.signals, [signal.SIGTERM])

    def test_source_scope_or_upstream_drift_fails(self):
        cap, child = self.started()
        Path(self.scope['upstreamSourcePins'][0]['path']).write_bytes(b'drift')
        self.assertFalse(self.close(cap)['pass'])
        self.assertEqual(child.signals, [signal.SIGTERM])

    def test_old_database_or_scope_extension_never_launches(self):
        for change in [{'targetDatabase': 'helmut_resource_fixture_20261021_f3375a7d5548'}, {'unknown': True}, {'production': True}, {'automaticRetry': True}, {'maximumLifecycleSeconds': 33001}]:
            with self.subTest(change=list(change)):
                original = copy.deepcopy(self.scope)
                self.scope.update(change)
                with self.assertRaises(Exception): self.m.qualify_scope()
                self.scope = original

    def test_nonprivate_config_and_old_secret_reject(self):
        Path(self.m.CONFIG_PATH).chmod(0o644)
        with self.assertRaises(ValueError): self.m.qualify_scope()
        Path(self.m.CONFIG_PATH).chmod(0o600)
        data = Path(self.m.CONFIG_PATH).read_bytes().replace(b'b' * 64, b'a' * 64)
        self.scope['configPin'] = self.file(Path(self.m.CONFIG_PATH), data)
        self.scope['jwtSecretSHA256'] = self.m.sha(b'a' * 64)
        with self.assertRaises(ValueError): self.m.qualify_scope()

    def test_expiry_or_clock_jump_never_qualifies_cleanup(self):
        cap, child = self.started(); self.mono += 14521; self.now += 14521
        self.assertFalse(self.close(cap)['pass']); self.assertEqual(child.signals, [signal.SIGTERM])

    def test_clock_jump_within_lifetime_fails(self):
        cap, _ = self.started(); self.now += 6
        self.assertFalse(self.close(cap)['pass'])

    def test_early_exit_cannot_be_reclassified(self):
        cap, child = self.started(); child.state = -2
        r = self.close(cap)
        self.assertFalse(r['pass']); self.assertFalse(child.signals)
        self.assertEqual(r['preStopReturnCode'], -2)
        self.assertEqual(r['returnCode'], -2); self.assertTrue(r['reaped'])

    def test_wait_timeout_kill_and_signal_failure_remain_failures(self):
        cap, child = self.started(); child.timeout_once = True
        r = self.close(cap)
        self.assertFalse(r['pass']); self.assertTrue(r['timedOut'] and r['killSent'])
        self.assertEqual(child.waits, [20, 5])

    def test_signal_failure_still_waits_and_cleans(self):
        cap, child = self.started(); child.signal_error = True
        r = self.close(cap)
        self.assertFalse(r['pass']); self.assertEqual(child.waits, [20])

    def test_kill_failure_does_not_suppress_second_bounded_wait(self):
        cap, child = self.started(); child.timeout_once = True
        with patch.object(child, 'kill', side_effect=OSError('pure kill failure')):
            r = self.close(cap)
        self.assertFalse(r['pass']); self.assertTrue(r['reaped'])
        self.assertEqual(child.waits, [20, 5])

    def test_pid_mutation_never_signals_other_process(self):
        cap, child = self.started(); child.pid = 99
        self.assertFalse(self.close(cap)['pass']); self.assertEqual(child.signals, [])

    def test_version_absence_or_overflow_never_qualifies(self):
        cap, _ = self.started(log=b'PostgREST 12.2.30 wrong version\n')
        self.assertFalse(self.close(cap)['pass'])

    def test_overflow_retention_is_bounded(self):
        cap, _ = self.started(log=b'Starting PostgREST 12.2.3\n' + b'x' * 100000)
        r = self.close(cap)
        self.assertFalse(r['pass']); self.assertTrue(r['logOverflow'])
        self.assertLessEqual(r['retainedLogBytes'], self.scope['logLimitBytes'])
        self.assertLessEqual(self.m.LOG_PATH.stat().st_size, self.scope['logLimitBytes'])

    def test_missing_eof_cannot_pass(self):
        cap, _ = self.started()
        e = self.m.entry(cap); e['thread'].join(); e['drain']['eof'] = False
        self.assertFalse(self.close(cap)['pass'])

    def test_partial_positive_persistence_is_returned_failure(self):
        cap, _ = self.started()
        def broken(r):
            self.saved.append(copy.deepcopy(r)); raise OSError('pure partial commit')
        r = self.close(cap, persist=broken)
        self.assertTrue(self.saved[0]['pass'])
        self.assertFalse(r['pass'] or r['acceptedExpectedTranslation'])
        self.assertEqual(r['returnCodeClassification'], 'UNQUALIFIED')

    def test_persistence_cannot_outlive_close_deadline(self):
        self.check_persistence_loss('deadline')

    def test_persistence_cannot_hide_owner_interrupt(self):
        self.check_persistence_loss('interrupt')

    def test_persistence_cannot_hide_wall_clock_drift(self):
        self.check_persistence_loss('clock')

    def check_persistence_loss(self, change):
        cap, _ = self.started()
        e = self.m.entry(cap)
        def persist(r):
            self.saved.append(copy.deepcopy(r))
            if change == 'deadline':
                elapsed = e['deadline'] - self.mono + 1
                self.now += elapsed; self.mono += elapsed
            elif change == 'interrupt': e['interrupts'] += 1
            else: self.now += 6
        r = self.close(cap, persist=persist)
        self.assertTrue(self.saved[-1]['pass'])
        self.assertFalse(r['pass'] or r['acceptedExpectedTranslation'])
        self.assertEqual(r['returnCodeClassification'], 'UNQUALIFIED')
        self.assertEqual(r['ownerInterrupts'], int(change == 'interrupt'))

    def test_abnormal_owner_stop_never_passes(self):
        cap, child = self.started()
        self.assertFalse(self.close(cap, reason='OWNER_WORK_OR_LAUNCH_FAILURE')['pass'])
        self.assertEqual(child.signals, [signal.SIGTERM])

    def test_launch_error_has_no_retry_or_authority(self):
        cap = self.m.qualify_scope()
        with patch.object(self.m.subprocess, 'Popen', side_effect=OSError('pure launch error')) as p:
            with self.assertRaises(OSError): self.m.launch(cap)
            with self.assertRaises(ValueError): self.m.launch(cap)
        self.assertEqual(p.call_count, 1)
        self.assertFalse(self.close(cap)['pass'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
